/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// Captures microphone audio for the AI decoder: 8th-order Butterworth
// low-pass (anti-alias) at the device rate, then fractional resampling to
// 3200 Hz. Posts Float32Array chunks of ~100 ms to the main thread.

const TARGET_RATE = 3200;
const CUTOFF_HZ = 1300;
const CHUNK = 320;
// Q values of the four 2nd-order sections of an 8th-order Butterworth
const BUTTERWORTH_Q = [0.5098, 0.6013, 0.9000, 2.5629];

function lowpassSection(fs, f0, q) {
  const w = (2 * Math.PI * f0) / fs;
  const alpha = Math.sin(w) / (2 * q);
  const c = Math.cos(w);
  const a0 = 1 + alpha;
  return {
    b0: (1 - c) / 2 / a0, b1: (1 - c) / a0, b2: (1 - c) / 2 / a0,
    a1: (-2 * c) / a0, a2: (1 - alpha) / a0,
    x1: 0, x2: 0, y1: 0, y2: 0
  };
}

class CwCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // sampleRate is a global in AudioWorkletGlobalScope
    this.ratio = sampleRate / TARGET_RATE;
    this.sections = BUTTERWORTH_Q.map((q) => lowpassSection(sampleRate, CUTOFF_HZ, q));
    this.nextT = 0;     // position of next output sample, relative to the current input sample
    this.prev = 0;      // previous filtered input sample
    this.out = new Float32Array(CHUNK);
    this.outLen = 0;
    this.active = true;
    this.port.onmessage = (e) => { if (e.data === "stop") this.active = false; };
  }

  filter(x) {
    let v = x;
    for (const s of this.sections) {
      const y = s.b0 * v + s.b1 * s.x1 + s.b2 * s.x2 - s.a1 * s.y1 - s.a2 * s.y2;
      s.x2 = s.x1; s.x1 = v; s.y2 = s.y1; s.y1 = y;
      v = y;
    }
    return v;
  }

  emit(v) {
    this.out[this.outLen++] = v;
    if (this.outLen === CHUNK) {
      this.port.postMessage(this.out, [this.out.buffer]);
      this.out = new Float32Array(CHUNK);
      this.outLen = 0;
    }
  }

  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0];
    const ch = input && input[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const y = this.filter(ch[i]);
      // Emit every output instant that falls between prev (t = -1) and y (t = 0)
      while (this.nextT <= 0) {
        const frac = this.nextT + 1;
        this.emit(this.prev + frac * (y - this.prev));
        this.nextT += this.ratio;
      }
      this.nextT -= 1;
      this.prev = y;
    }
    return true;
  }
}

registerProcessor("cw-capture", CwCaptureProcessor);
