/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.

Portions (spectrogram, normalization, posterior stitching, CTC decoding)
are adapted from deepcw-engine, Copyright (c) 2026 e04, MIT License.
https://github.com/e04/deepcw-engine: see NOTICE.
*/

// Runs inside the AI decoder Web Worker (importScripts) and in Node (tests).
(function (root) {
  "use strict";

  // -------------------------------------------------------------------------
  // Model metadata (deepcw-engine model_narrow.onnx.json). The narrow model
  // sees 3 STFT bins; we pick them around the tracked tone instead of the
  // fixed 787.5-812.5 Hz slice in the metadata file.
  // -------------------------------------------------------------------------
  const META = {
    chars: [",", ".", "/", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "?",
      "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O",
      "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", " "],
    blank_index: 41,
    sample_rate: 3200,
    fft_length: 256,
    hop_length: 48,
    output_time_stride: 2,
    spectrogram_frequency_bins: 3,
    noise_level_quantile: 0.9,
    onnx_input_name: "spectrogram",
    onnx_output_name: "log_probs",
    num_classes: 42
  };
  const BIN_HZ = META.sample_rate / META.fft_length; // 12.5 Hz

  // Streaming / stitching parameters (deepcw-engine defaults)
  const NOISE_LEVEL_MIN_RELATIVE_TO_PEAK = 1e-3;
  const NOISE_LEVEL_MIN = 1e-5;
  const MAX_SEGMENT_SECONDS = 12;
  const MIN_PENDING_SECONDS = 2;
  const STEP_SECONDS = 1;
  const STITCH_LEFT_CONTEXT_SECONDS = 4;
  const STITCH_FREEZE_GUARD_SECONDS = 2;
  const STITCH_LEFT_RAMP_SECONDS = 2;
  const STITCH_RIGHT_RAMP_SECONDS = 1;
  const STITCH_DILATION_FRAMES = 1;
  const WORD_BOUNDARY_BLANK_HOPS = 134;
  const MIN_VIEW_WEIGHT = 1e-3;
  const UNCOVERED_LOG_PROB = -30;
  // After a jump to a distant frequency, re-decode this much buffered audio
  // there, so the new station's first characters aren't lost.
  const REWIND_SECONDS = 8;

  // Tone finder (ideas from web-deep-cw-decoder estimateCwBinSnr + PeakDetector)
  const TONE_MIN_HZ = 300;
  const TONE_MAX_HZ = 1500;
  const TONE_ANALYSIS_SECONDS = 3;
  const TONE_HOP = 64;                  // 20 ms steps, fine enough to see CW keying
  const TONE_ON_QUANTILE = 0.9;
  // Pure noise measures about 7 dB; a -14 dB CW signal measures about 12 dB.
  // A tone that is keyed like CW may lock lower than one that isn't.
  const TONE_LOCK_SNR_DB = 10;
  const KEYED_LOCK_SNR_DB = 8.5;
  const TONE_RELEASE_SNR_DB = 8.5;
  const TONE_CONFIRM_STEPS = 2;
  const SIDEBAND_MASK_HZ = 150;
  const SIDEBAND_MASK_DB = 18;

  // -------------------------------------------------------------------------
  // Small radix-2 FFT (power spectrum) for the tone finder
  // -------------------------------------------------------------------------
  function makeFft(n) {
    const levels = Math.log2(n) | 0;
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
      rev[i] = r;
    }
    const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos(2 * Math.PI * i / n);
      sin[i] = -Math.sin(2 * Math.PI * i / n);
    }
    const re = new Float32Array(n), im = new Float32Array(n);
    return function power(frame, out) {
      for (let i = 0; i < n; i++) { re[rev[i]] = frame[i]; im[rev[i]] = 0; }
      for (let size = 2; size <= n; size *= 2) {
        const half = size / 2, step = n / size;
        for (let i = 0; i < n; i += size) {
          for (let j = 0; j < half; j++) {
            const k = j * step;
            const tr = re[i + j + half] * cos[k] - im[i + j + half] * sin[k];
            const ti = re[i + j + half] * sin[k] + im[i + j + half] * cos[k];
            re[i + j + half] = re[i + j] - tr; im[i + j + half] = im[i + j] - ti;
            re[i + j] += tr; im[i + j] += ti;
          }
        }
      }
      for (let i = 0; i < out.length; i++) out[i] = re[i] * re[i] + im[i] * im[i];
      return out;
    };
  }

  function hann(n) {
    const w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    return w;
  }
  const WINDOW = hann(META.fft_length);
  const fftPower = makeFft(META.fft_length);

  function quantileOf(arr, q) {
    const s = Float32Array.from(arr).sort();
    return s[Math.floor(q * (s.length - 1))];
  }

  // -------------------------------------------------------------------------
  // Keying check: does this frequency switch on and off like CW? The 80 ms
  // FFT window smears dits and the gaps between them, so instead of a strict
  // dit/dah ratio this looks for several distinct bursts separated by real
  // silence, with a duty cycle that is neither always on (carrier, hum) nor
  // random blips (noise). Alone it passes ~4% of noise windows, so it is
  // always combined with a level and persistence requirement.
  // -------------------------------------------------------------------------
  const FRAME_MS = (TONE_HOP / META.sample_rate) * 1000;
  function isKeyed(series) {
    const db = Array.from(series, (p) => 10 * Math.log10(p + 1e-20));
    const sorted = db.slice().sort((a, b) => a - b);
    const lo = sorted[Math.floor(0.2 * (sorted.length - 1))];
    const hi = sorted[Math.floor(0.9 * (sorted.length - 1))];
    const contrast = hi - lo;
    if (contrast < 6) return false;
    const onAt = lo + 0.6 * contrast, offAt = lo + 0.4 * contrast;
    let state = false, len = 0, elements = 0, blips = 0, onFrames = 0;
    const close = () => {
      if (!state || !len) return;
      const ms = len * FRAME_MS;
      if (ms >= 80 && ms <= 1500) elements++;
      else if (ms < 80) blips++;
      onFrames += len;
    };
    for (const v of db) {
      const next = state ? v > offAt : v > onAt;
      if (next !== state) { close(); state = next; len = 1; } else len++;
    }
    close();
    const duty = onFrames / db.length;
    return elements >= 3 && blips <= elements && duty >= 0.15 && duty <= 0.85;
  }

  // -------------------------------------------------------------------------
  // Tone finder: per-bin keyed-on power (90th pct over time) vs band median.
  // Pure noise scores around 5 dB. Weaker bins near a much stronger one are
  // treated as keying sidebands and ignored.
  // -------------------------------------------------------------------------
  class ToneFinder {
    constructor() {
      this.minBin = Math.ceil(TONE_MIN_HZ / BIN_HZ);
      this.maxBin = Math.floor(TONE_MAX_HZ / BIN_HZ);
      this.targetHz = null;
      this.locked = false;
      this.manualHz = null;
      this.candidateBin = -1;
      this.candidateCount = 0;
      this.lastSnrDb = 0;
      this.frame = new Float32Array(META.fft_length);
      this.power = new Float32Array(META.fft_length / 2 + 1);
    }

    analyse(audio) {
      const n = META.fft_length;
      const frames = Math.floor((audio.length - n) / TONE_HOP) + 1;
      if (frames < 8) return null;
      const bins = this.maxBin - this.minBin + 1;
      const powers = new Float32Array(bins * frames);
      for (let f = 0; f < frames; f++) {
        const off = f * TONE_HOP;
        for (let i = 0; i < n; i++) this.frame[i] = audio[off + i] * WINDOW[i];
        fftPower(this.frame, this.power);
        for (let b = 0; b < bins; b++) powers[b * frames + f] = this.power[this.minBin + b];
      }
      const noise = Math.max(quantileOf(powers, 0.5), 1e-12);
      const snr = new Float32Array(bins);
      for (let b = 0; b < bins; b++) {
        const on = quantileOf(powers.subarray(b * frames, (b + 1) * frames), TONE_ON_QUANTILE);
        snr[b] = 10 * Math.log10(Math.max(on, 1e-12) / noise);
      }
      const mask = Math.round(SIDEBAND_MASK_HZ / BIN_HZ);
      const candidates = [];
      for (let b = 0; b < bins; b++) {
        let masked = false;
        for (let o = Math.max(0, b - mask); o <= Math.min(bins - 1, b + mask); o++) {
          if (snr[o] - snr[b] > SIDEBAND_MASK_DB) { masked = true; break; }
        }
        if (!masked) candidates.push(b);
      }
      if (!candidates.length) return null;
      candidates.sort((x, y) => snr[y] - snr[x]);
      const keyedCache = new Map();
      const keyedBin = (b) => {
        if (!keyedCache.has(b)) keyedCache.set(b, isKeyed(powers.subarray(b * frames, (b + 1) * frames)));
        return keyedCache.get(b);
      };
      // The strongest keyed peak above its lock level wins over a stronger
      // tone that isn't keyed (a carrier or hum can't capture the tuner).
      // A keyed bin within 3 bins of the strongest peak is that same signal's
      // skirt: stay on the centre.
      const keyedPick = candidates.slice(0, 6).find((b) => snr[b] >= KEYED_LOCK_SNR_DB && keyedBin(b));
      const sameSignal = keyedPick !== undefined && Math.abs(keyedPick - candidates[0]) <= 3;
      const best = keyedPick !== undefined && !sameSignal ? keyedPick : candidates[0];
      const bestKeyed = keyedBin(best) || sameSignal;
      const bestSnr = snr[best];
      // Sub-bin estimate for display (parabolic on dB values)
      let delta = 0;
      if (best > 0 && best < bins - 1) {
        const a = snr[best - 1], c = snr[best + 1], d = 2 * snr[best] - a - c;
        if (Math.abs(d) > 1e-6) delta = Math.max(-0.5, Math.min(0.5, 0.5 * (c - a) / d));
      }
      return {
        bin: this.minBin + best,
        hz: (this.minBin + best + delta) * BIN_HZ,
        snrDb: bestSnr,
        keyed: bestKeyed,
        snrAt: (hz) => {
          const b = Math.round(hz / BIN_HZ) - this.minBin;
          return b >= 0 && b < bins ? snr[b] : -Infinity;
        },
        keyedAt: (hz) => {                    // keyed at hz or right next to it
          const c = Math.round(hz / BIN_HZ) - this.minBin;
          for (let b = Math.max(0, c - 1); b <= Math.min(bins - 1, c + 1); b++) if (keyedBin(b)) return true;
          return false;
        }
      };
    }

    // Returns the current target (Hz) and status after looking at the last
    // TONE_ANALYSIS_SECONDS of audio.
    update(audio) {
      if (this.manualHz != null) {
        this.targetHz = this.manualHz;
        const a = this.analyse(audio);
        this.lastSnrDb = a ? a.snrAt(this.manualHz) : 0;
        return this.status();
      }
      const a = this.analyse(audio);
      if (!a) return this.status();

      const targetBin = this.targetHz == null ? -1 : Math.round(this.targetHz / BIN_HZ);
      this.lastSnrDb = this.targetHz == null ? a.snrDb : a.snrAt(this.targetHz);
      const lockDb = a.keyed ? KEYED_LOCK_SNR_DB : TONE_LOCK_SNR_DB;
      const targetKeyed = this.targetHz != null && a.keyedAt(this.targetHz);

      if (a.snrDb >= TONE_LOCK_SNR_DB && a.bin !== targetBin &&
          targetBin >= 0 && Math.abs(a.bin - targetBin) <= 3 && a.snrDb - this.lastSnrDb >= 3) {
        // A clearly stronger peak close by (the station moved, or RIT/VFO was
        // turned): follow it now. The old bin still catches some of its
        // energy, so it would never look weak enough to release.
        this.targetHz = a.bin * BIN_HZ;
        this.locked = true;
        this.lastSnrDb = a.snrDb;
        this.candidateCount = 0;
      } else if (a.snrDb >= lockDb && a.bin !== targetBin && (targetBin < 0 || a.keyed)) {
        // (leaving an existing target needs a CW-keyed candidate: hiss or a
        // carrier must not pull the tuner away from where a station may return)
        // A strong tone somewhere else: retune after it persists
        if (Math.abs(a.bin - this.candidateBin) <= 1) this.candidateCount++;
        else { this.candidateBin = a.bin; this.candidateCount = 1; }
        const currentWeak = !this.locked || this.lastSnrDb < TONE_RELEASE_SNR_DB ||
          Math.abs(a.bin - targetBin) === 1 ||   // small drift: follow it
          (!targetKeyed && Math.abs(a.bin - targetBin) > 3);   // CW elsewhere while parked on a non-CW tone
        if (this.candidateCount >= TONE_CONFIRM_STEPS && currentWeak) {
          this.targetHz = a.bin * BIN_HZ;
          this.locked = true;
          this.lastSnrDb = a.snrDb;
          this.candidateCount = 0;
        }
      } else {
        this.candidateCount = 0;
        if (this.locked && this.lastSnrDb < TONE_RELEASE_SNR_DB) this.locked = false; // hold target
        else if (a.bin === targetBin && a.snrDb >= lockDb) this.locked = true;
      }
      this.peakHz = a.hz;
      return this.status();
    }

    setManual(hz) {
      this.manualHz = hz == null ? null : Math.round(hz / BIN_HZ) * BIN_HZ;
      if (this.manualHz != null) { this.targetHz = this.manualHz; this.locked = true; }
      this.candidateCount = 0;
    }

    status() {
      return {
        targetHz: this.targetHz,
        peakHz: this.peakHz ?? null,
        snrDb: this.lastSnrDb,
        locked: this.locked,
        manual: this.manualHz != null
      };
    }
  }

  // -------------------------------------------------------------------------
  // Spectrogram for the narrow model: 3 bins centred on the target tone.
  // Same framing as deepcw-engine: reflect-pad fft/2, Hann, hop 48.
  // -------------------------------------------------------------------------
  function narrowSpectrogram(audio, targetHz) {
    const n = META.fft_length, hop = META.hop_length, nb = META.spectrogram_frequency_bins;
    if (audio.length < n) return null;
    const centre = Math.round(targetHz / BIN_HZ);
    const bins = [];
    for (let d = -(nb >> 1); d <= (nb >> 1); d++) bins.push(centre + d);

    const pad = n >> 1;
    const padded = new Float32Array(audio.length + 2 * pad);
    for (let i = 0; i < pad; i++) {
      padded[i] = audio[pad - i];
      padded[pad + audio.length + i] = audio[audio.length - 2 - i];
    }
    padded.set(audio, pad);

    // Per-bin twiddle tables
    const tw = bins.map((bin) => {
      const c = new Float32Array(n), s = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const ang = (-2 * Math.PI * bin * i) / n;
        c[i] = Math.cos(ang) * WINDOW[i];
        s[i] = Math.sin(ang) * WINDOW[i];
      }
      return { c, s };
    });

    const frames = 1 + Math.floor((padded.length - n) / hop);
    const data = new Float32Array(frames * nb);
    for (let f = 0; f < frames; f++) {
      const start = f * hop;
      for (let b = 0; b < nb; b++) {
        const { c, s } = tw[b];
        let re = 0, im = 0;
        for (let i = 0; i < n; i++) {
          const x = padded[start + i];
          re += x * c[i];
          im += x * s[i];
        }
        data[f * nb + b] = Math.hypot(re, im);
      }
    }
    normalizeNoiseLog1p(data);
    return { data, frames };
  }

  function normalizeNoiseLog1p(spec) {
    if (spec.length === 0) return spec;
    const q = META.noise_level_quantile;
    const sorted = Float32Array.from(spec).sort();
    const rayleigh = Math.sqrt(-2 * Math.log(1 - q));
    const noise = Math.max(
      sorted[Math.floor(q * (sorted.length - 1))] / rayleigh,
      sorted[sorted.length - 1] * NOISE_LEVEL_MIN_RELATIVE_TO_PEAK,
      NOISE_LEVEL_MIN
    );
    for (let i = 0; i < spec.length; i++) spec[i] = Math.log1p(spec[i] / noise);
    return spec;
  }

  // -------------------------------------------------------------------------
  // Posterior stitching + greedy CTC (from deepcw-engine decode_morse.mjs)
  // -------------------------------------------------------------------------
  function smoothstep(v) { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); }
  function getViewWeight(l, r) {
    return Math.max(MIN_VIEW_WEIGHT,
      smoothstep(l / STITCH_LEFT_RAMP_SECONDS) * smoothstep(r / STITCH_RIGHT_RAMP_SECONDS));
  }
  function logSoftmaxInPlace(v, off, k) {
    let max = -Infinity;
    for (let i = 0; i < k; i++) max = Math.max(max, v[off + i]);
    let sum = 0;
    for (let i = 0; i < k; i++) sum += Math.exp(v[off + i] - max);
    const ls = max + Math.log(sum);
    for (let i = 0; i < k; i++) v[off + i] -= ls;
  }
  function toDilatedLogProbs(logits, frameCount, k, blank) {
    const lp = Float32Array.from(logits.subarray(0, frameCount * k));
    for (let f = 0; f < frameCount; f++) logSoftmaxInPlace(lp, f * k, k);
    const out = new Float32Array(lp.length);
    for (let f = 0; f < frameCount; f++) {
      const off = f * k;
      const first = Math.max(0, f - STITCH_DILATION_FRAMES);
      const last = Math.min(frameCount - 1, f + STITCH_DILATION_FRAMES);
      for (let i = 0; i < k; i++) {
        let v = lp[off + i];
        if (i !== blank) for (let o = first; o <= last; o++) v = Math.max(v, lp[o * k + i]);
        out[off + i] = v;
      }
      logSoftmaxInPlace(out, off, k);
    }
    return out;
  }
  function decodeCtcGreedy(scores, frameCount, k, vocab, ctx) {
    const { blankIndex, spaceIndex, chars, wordBoundaryFrames } = vocab;
    const argmax = new Int32Array(frameCount);
    for (let f = 0; f < frameCount; f++) {
      const off = f * k;
      let best = 0;
      for (let i = 1; i < k; i++) if (scores[off + i] > scores[off + best]) best = i;
      argmax[f] = best;
    }
    const idx = argmax.slice();
    if (spaceIndex >= 0) {
      let prev = ctx.previousSymbol === "char" ? -2 : ctx.previousSymbol === "space" ? spaceIndex : -1;
      let f = 0;
      while (f < frameCount) {
        if (idx[f] !== blankIndex) { prev = idx[f]; f++; continue; }
        const runStart = f;
        while (f < frameCount && idx[f] === blankIndex) f++;
        const next = f < frameCount ? idx[f] : -1;
        const runLen = f - runStart + (runStart === 0 ? ctx.blankFrames : 0);
        if (runLen >= wordBoundaryFrames && prev !== -1 && prev !== spaceIndex && next >= 0 && next !== spaceIndex) {
          idx.fill(spaceIndex, runStart, f);
        }
      }
    }
    const spans = [];
    let prevIdx = -1, active = null;
    for (let f = 0; f < frameCount; f++) {
      const i = idx[f];
      if (i === blankIndex) { prevIdx = -1; active = null; continue; }
      if (i === prevIdx) { if (active) active.endFrame = f; continue; }
      prevIdx = i;
      const ch = chars[i];
      if (!ch) { active = null; continue; }
      active = { char: ch, startFrame: f, endFrame: f };
      spans.push(active);
    }
    return { spans, argmax };
  }
  function toLaneText(spans, prependSpace) {
    let text = "", lead = prependSpace, pendingSpace = false;
    for (const s of spans) {
      if (/\s/.test(s.char)) { if (text.length === 0) lead = true; else pendingSpace = true; continue; }
      if (pendingSpace) { text += " "; pendingSpace = false; }
      text += s.char;
    }
    return { text, prependSpace: lead };
  }

  class PosteriorStitcher {
    constructor() {
      const stride = META.output_time_stride;
      this.hopLength = META.hop_length * stride;
      this.framesPerSecond = META.sample_rate / this.hopLength;
      this.maxSegmentSamples = Math.round(MAX_SEGMENT_SECONDS * META.sample_rate);
      this.leftContextFrames = Math.round((STITCH_LEFT_CONTEXT_SECONDS * META.sample_rate) / this.hopLength);
      this.freezeGuardFrames = Math.round((STITCH_FREEZE_GUARD_SECONDS * META.sample_rate) / this.hopLength);
      this.vocab = {
        chars: META.chars,
        blankIndex: META.blank_index,
        spaceIndex: META.chars.indexOf(" "),
        wordBoundaryFrames: Math.ceil(WORD_BOUNDARY_BLANK_HOPS / stride)
      };
      this.k = META.num_classes;
      this.rowBase = 0;
      this.sums = new Float32Array(0);
      this.weights = new Float32Array(0);
      this.coveredEnd = 0;
      this.frozenEnd = 0;
      this.committedEnd = 0;
      this.context = { previousSymbol: "none", blankFrames: 0 };
      this.hasCommittedText = false;
    }
    get contextStartFrame() { return Math.max(0, this.frozenEnd - this.leftContextFrames); }

    // Start over from an earlier frame (after a frequency jump). Text already
    // committed stays; new text begins as a new word.
    restartAt(frame) {
      this.rowBase = frame;
      this.sums = new Float32Array(0);
      this.weights = new Float32Array(0);
      this.coveredEnd = frame;
      this.frozenEnd = frame;
      this.committedEnd = frame;
      this.context = { previousSymbol: "space", blankFrames: 0 };
    }
    getWindowStartFrame(endSample) {
      return Math.max(this.contextStartFrame, Math.ceil((endSample - this.maxSegmentSamples) / this.hopLength));
    }
    addWindow(startFrame, logits, frameCount, isFinal) {
      if (frameCount <= 0) { if (isFinal) this.frozenEnd = this.coveredEnd; return; }
      const k = this.k, endFrame = startFrame + frameCount;
      this.ensureRows(endFrame);
      const lp = toDilatedLogProbs(logits, frameCount, k, this.vocab.blankIndex);
      for (let f = Math.max(0, this.frozenEnd - startFrame); f < frameCount; f++) {
        const w = getViewWeight(
          startFrame === 0 ? Infinity : f / this.framesPerSecond,
          isFinal ? Infinity : (frameCount - 1 - f) / this.framesPerSecond
        );
        const row = startFrame + f - this.rowBase;
        if (row < 0) continue;
        for (let i = 0; i < k; i++) this.sums[row * k + i] += w * lp[f * k + i];
        this.weights[row] += w;
      }
      this.coveredEnd = Math.max(this.coveredEnd, endFrame);
      this.frozenEnd = isFinal ? this.coveredEnd : Math.max(this.frozenEnd, endFrame - this.freezeGuardFrames);
    }
    take(final) {
      const startFrame = this.committedEnd;
      const frameCount = this.coveredEnd - startFrame;
      if (frameCount <= 0) return { committed: null, pending: toLaneText([], false) };
      const startsWord = !this.hasCommittedText || this.context.previousSymbol === "space";
      const { spans: rel, argmax } = decodeCtcGreedy(
        this.readScores(startFrame, this.coveredEnd), frameCount, this.k, this.vocab, this.context);
      const spans = rel.map((s) => ({ ...s, startFrame: s.startFrame + startFrame, endFrame: s.endFrame + startFrame }));
      const limit = final ? Infinity : this.frozenEnd;
      let count = 0;
      for (let i = 0; i < spans.length; i++) {
        if (spans[i].endFrame + 1 >= limit) break;
        if (!/\s/.test(spans[i].char)) count = i + 1;
      }
      let committed = null;
      if (count > 0) {
        const cs = spans.slice(0, count);
        committed = toLaneText(cs, startsWord);
        this.hasCommittedText = true;
        this.committedEnd = cs[count - 1].endFrame + 1;
        this.context = { previousSymbol: "char", blankFrames: 0 };
      }
      const remaining = spans.slice(count);
      const nextChar = remaining.find((s) => !/\s/.test(s.char));
      const releaseEnd = Math.min(final ? this.coveredEnd : this.frozenEnd, nextChar ? nextChar.startFrame : Infinity) - 1;
      let { previousSymbol, blankFrames } = this.context;
      for (let f = this.committedEnd; f < releaseEnd; f++) {
        if (argmax[f - startFrame] === this.vocab.spaceIndex) { previousSymbol = "space"; blankFrames = 0; }
        else blankFrames++;
      }
      if (releaseEnd > this.committedEnd) {
        this.context = { previousSymbol, blankFrames };
        this.committedEnd = releaseEnd;
      }
      this.dropRowsBefore(this.committedEnd);
      const pending = toLaneText(
        remaining.filter((s) => s.endFrame >= this.committedEnd),
        !this.hasCommittedText || this.context.previousSymbol === "space");
      return { committed, pending };
    }
    ensureRows(endFrame) {
      const rows = endFrame - this.rowBase;
      if (rows <= this.weights.length) return;
      const cap = Math.max(rows, this.weights.length * 2, 256);
      const sums = new Float32Array(cap * this.k); sums.set(this.sums);
      const weights = new Float32Array(cap); weights.set(this.weights);
      this.sums = sums; this.weights = weights;
    }
    dropRowsBefore(frame) {
      const drop = Math.min(frame - this.rowBase, this.weights.length);
      if (drop <= 0) return;
      this.sums.copyWithin(0, drop * this.k);
      this.sums.fill(0, this.sums.length - drop * this.k);
      this.weights.copyWithin(0, drop);
      this.weights.fill(0, this.weights.length - drop);
      this.rowBase += drop;
    }
    readScores(startFrame, endFrame) {
      const k = this.k;
      const scores = new Float32Array((endFrame - startFrame) * k);
      for (let f = startFrame; f < endFrame; f++) {
        const row = f - this.rowBase, off = (f - startFrame) * k, w = this.weights[row];
        if (!(w > 0)) {
          scores.fill(UNCOVERED_LOG_PROB, off, off + k);
          scores[off + this.vocab.blankIndex] = 0;
          continue;
        }
        for (let i = 0; i < k; i++) scores[off + i] = this.sums[row * k + i] / w;
      }
      return scores;
    }
  }

  // -------------------------------------------------------------------------
  // Streaming decoder: push 3200 Hz audio, call step() once per second.
  // -------------------------------------------------------------------------
  class StreamingDecoder {
    constructor(ort, session) {
      this.ort = ort;
      this.session = session;
      this.reset();
    }

    reset() {
      this.stitcher = new PosteriorStitcher();
      this.tone = new ToneFinder();
      this.buf = new Float32Array(META.sample_rate * 30);
      this.bufLen = 0;
      this.base = 0;      // absolute sample index of buf[0]
      this.total = 0;     // absolute samples received
      this.transcript = "";
      this.lastTargetHz = null;
      this.leftAt = [];    // { hz, sample }: when we left a frequency (no rewinding into it)
    }

    push(samples) {
      if (this.bufLen + samples.length > this.buf.length) {
        const next = new Float32Array(Math.max(this.buf.length * 2, this.bufLen + samples.length));
        next.set(this.buf.subarray(0, this.bufLen));
        this.buf = next;
      }
      this.buf.set(samples, this.bufLen);
      this.bufLen += samples.length;
      this.total += samples.length;
    }

    setManualTone(hz) { this.tone.setManual(hz); }

    trim() {
      // Keep what the next window can still reach: stitcher left context and
      // the max segment length, plus the tone finder's analysis span.
      const keepFrom = Math.min(
        this.stitcher.contextStartFrame * this.stitcher.hopLength,
        this.total - this.stitcher.maxSegmentSamples - META.sample_rate
      );
      const drop = Math.max(0, Math.min(keepFrom - this.base, this.bufLen - TONE_ANALYSIS_SECONDS * META.sample_rate));
      if (drop <= 0) return;
      this.buf.copyWithin(0, drop, this.bufLen);
      this.bufLen -= drop;
      this.base += drop;
    }

    async runWindow(startFrame, endSample, isFinal, targetHz) {
      const startSample = Math.max(startFrame * this.stitcher.hopLength, this.base);
      startFrame = Math.ceil(startSample / this.stitcher.hopLength);
      const from = startFrame * this.stitcher.hopLength - this.base;
      const audio = this.buf.subarray(from, endSample - this.base);
      const spec = narrowSpectrogram(audio, targetHz);
      if (!spec) return null;
      const input = new this.ort.Tensor("float32", spec.data, [1, 1, spec.frames, META.spectrogram_frequency_bins]);
      const out = await this.session.run({ [META.onnx_input_name]: input });
      const lp = out[META.onnx_output_name];
      this.stitcher.addWindow(startFrame, lp.data, lp.dims[1], isFinal);
      const { committed, pending } = this.stitcher.take(isFinal);
      let added = "";
      if (committed && committed.text) {
        added = (committed.prependSpace && this.transcript ? " " : "") + committed.text;
        this.transcript += added;
      }
      return { committed: added, pending: pending.text ? (pending.prependSpace ? " " : "") + pending.text : "" };
    }

    // One decode step over the newest audio. Returns { tone, committed, pending }.
    async step() {
      const toneAudio = this.buf.subarray(Math.max(0, this.bufLen - TONE_ANALYSIS_SECONDS * META.sample_rate), this.bufLen);
      const tone = this.tone.update(toneAudio);
      const flushed = this.rewindOnJump(tone.targetHz);
      let result = { committed: "", pending: "" };
      if (tone.targetHz != null && this.total >= MIN_PENDING_SECONDS * META.sample_rate) {
        const startFrame = this.stitcher.getWindowStartFrame(this.total);
        result = (await this.runWindow(startFrame, this.total, false, tone.targetHz)) || result;
      }
      this.trim();
      return { tone, ...result, committed: flushed + result.committed };
    }

    // On a jump to a distant frequency (more than 3 bins), decode the last
    // REWIND_SECONDS again at the new frequency, but never into time that was
    // already decoded there (returning to a station must not repeat its text).
    // Small moves aren't rewound: the old frequency already copied most of it.
    // Returns text from the old frequency that was finalised before the rewind.
    rewindOnJump(targetHz) {
      const prev = this.lastTargetHz;
      this.lastTargetHz = targetHz;
      if (prev == null || targetHz == null || prev === targetHz) return "";
      const near = (a, b) => Math.abs(Math.round(a / BIN_HZ) - Math.round(b / BIN_HZ)) <= 3;
      this.leftAt = this.leftAt.filter((e) => !near(e.hz, prev));
      this.leftAt.push({ hz: prev, sample: this.total });
      if (near(prev, targetHz)) return "";
      const hop = this.stitcher.hopLength;
      let from = Math.max(this.total - REWIND_SECONDS * META.sample_rate, this.base);
      for (const e of this.leftAt) if (near(e.hz, targetHz)) from = Math.max(from, e.sample);
      const frame = Math.ceil(from / hop);
      if (frame >= this.stitcher.frozenEnd) return "";   // nothing final to redo
      // Finalise what the old frequency already decoded (its last characters
      // would otherwise be dropped), then start over at the new one.
      let flushed = "";
      const { committed } = this.stitcher.take(true);
      if (committed && committed.text) {
        flushed = (committed.prependSpace && this.transcript ? " " : "") + committed.text;
        this.transcript += flushed;
      }
      this.stitcher.restartAt(frame);
      return flushed;
    }

    // Decode everything still buffered (call on stop).
    async flush() {
      const tone = this.tone.status();
      if (tone.targetHz == null) return { tone, committed: "", pending: "" };
      let committed = "";
      for (;;) {
        const startFrame = this.stitcher.contextStartFrame;
        const endSample = Math.min(this.total, startFrame * this.stitcher.hopLength + this.stitcher.maxSegmentSamples);
        const isFinal = endSample >= this.total;
        const r = await this.runWindow(startFrame, endSample, isFinal, tone.targetHz);
        if (r) committed += r.committed;
        if (isFinal || !r) break;
      }
      return { tone, committed, pending: "" };
    }
  }

  const api = { META, BIN_HZ, STEP_SECONDS, ToneFinder, StreamingDecoder, narrowSpectrogram };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DeepCWCore = api;
})(typeof self !== "undefined" ? self : globalThis);
