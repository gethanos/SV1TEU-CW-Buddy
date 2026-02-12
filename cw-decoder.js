/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("cwDecodedOverlay");
    const startBtn = document.getElementById("cwStartBtn");
    const statusEl = document.getElementById("cwStatus");

    if (!overlay || !startBtn || !statusEl) {
      console.warn("CW decoder UI not found, skipping init.");
      return;
    }

    const ua = navigator.userAgent || "";
    const isFacebookInApp = /FBAN|FBAV/i.test(ua);
    const isInstagramInApp = /Instagram/i.test(ua);
    const isAndroidWebView = /\bwv\b/i.test(ua) || /; wv\)/i.test(ua);
    const isLikelyInAppBrowser = isFacebookInApp || isInstagramInApp || isAndroidWebView;

    function showOpenInBrowserHelp() {
      statusEl.textContent = "Open in browser";
      statusEl.style.color = "#ffb000";

      overlay.textContent =
        "Decoder may not work in Facebook/Instagram in-app browser.\n" +
        "Open in Chrome/Safari/Firefox.\n\n" +
        "Android: ⋮ → Open in browser\n" +
        "iPhone: Share → Open in Safari\n";
      overlay.scrollTop = overlay.scrollHeight;
    }

    const MORSE_TO_TEXT = {
      ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E",
      "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
      "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O",
      ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
      "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y",
      "--..": "Z",
      "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4",
      ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
      "-..-.": "/", "-...-": "=", "..--..": "?"
    };

    class SimpleEnvelopeDetector {
      constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.analyserNode = null;
        this.scriptNode = null;
        this.stream = null;

        this.smoothingConstant = 0.85;
        this.threshold = 0.03;
        this.minThreshold = 0.02;
        this.maxThreshold = 0.5;

        this.isOn = false;
        this.onStartTime = 0;
        this.offStartTime = 0;
        this.lastTransitionTime = 0;
        this.minTransitionInterval = 15;

        this.onConfirmFrames = 2;
        this.offConfirmFrames = 2;
        this.onCandidateFrames = 0;
        this.offCandidateFrames = 0;

        this.sampleTimeMs = 0;
        this.sampleRate = 48000;

        this.onDurations = [];
        this.offDurations = [];

        this.onStateChange = null;
        this.onTiming = null;

        this.recentLevels = [];
        this.maxRecentLevels = 100;

        this.lastAutoResetTime = 0;
        this.autoResetCooldown = 10000;
        this.stuckOnTimeout = 2500;

        this.centerMode = 'search';
        this.searchAfterMs = 1200;
        this.lastFftUpdateTime = 0;
        this.fftUpdateInterval = 350;
        this.minToneHz = 400;
        this.maxToneHz = 900;
        this.centerFrequency = 650;
        this.freqSmoothing = 0.15;
        this.freqData = null;
      }

      resetCalibration() {
        const now = this.sampleTimeMs || 0;
        this.threshold = 0.03;
        this.recentLevels = [];
        this.isOn = false;
        this.onStartTime = now;
        this.offStartTime = now;
        this.lastTransitionTime = now;

        this.onCandidateFrames = 0;
        this.offCandidateFrames = 0;

        this.centerMode = 'search';

        if (this.onStateChange) {
          this.onStateChange(false, 0, this.threshold);
        }
      }

      estimateToneFrequencyHz() {
        if (!this.analyserNode) return null;

        if (!this.freqData || this.freqData.length !== this.analyserNode.frequencyBinCount) {
          this.freqData = new Float32Array(this.analyserNode.frequencyBinCount);
        }

        this.analyserNode.getFloatFrequencyData(this.freqData);

        const nyquist = this.audioContext.sampleRate / 2;
        const binHz = nyquist / this.freqData.length;

        const startBin = Math.max(0, Math.floor(this.minToneHz / binHz));
        const endBin = Math.min(this.freqData.length - 1, Math.ceil(this.maxToneHz / binHz));

        let bestBin = -1;
        let bestDb = -Infinity;

        for (let i = startBin; i <= endBin; i++) {
          const db = this.freqData[i];
          if (db > bestDb) {
            bestDb = db;
            bestBin = i;
          }
        }

        if (bestBin < 0) return null;
        return bestBin * binHz;
      }

      async start() {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        this.sampleRate = this.audioContext.sampleRate || this.sampleRate;
        this.sampleTimeMs = 0;

        this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

        this.bandpassFilter = this.audioContext.createBiquadFilter();
        this.bandpassFilter.type = 'bandpass';
        this.bandpassFilter.frequency.value = this.centerFrequency;
        this.bandpassFilter.Q.value = 2;

        this.limiterNode = this.audioContext.createDynamicsCompressor();
        this.limiterNode.threshold.value = -18;
        this.limiterNode.knee.value = 0;
        this.limiterNode.ratio.value = 20;
        this.limiterNode.attack.value = 0.003;
        this.limiterNode.release.value = 0.08;

        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = this.smoothingConstant;

        this.scriptNode = this.audioContext.createScriptProcessor(256, 1, 1);
        this.scriptNode.onaudioprocess = this.process.bind(this);

        this.sourceNode.connect(this.bandpassFilter);
        this.bandpassFilter.connect(this.limiterNode);
        this.limiterNode.connect(this.analyserNode);
        this.analyserNode.connect(this.scriptNode);
        this.scriptNode.connect(this.audioContext.destination);

        this.offStartTime = 0;
        this.onStartTime = 0;
        this.lastTransitionTime = 0;
      }

      stop() {
        if (this.sourceNode) this.sourceNode.disconnect();
        if (this.bandpassFilter) this.bandpassFilter.disconnect();
        if (this.limiterNode) this.limiterNode.disconnect();
        if (this.scriptNode) this.scriptNode.disconnect();
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        if (this.audioContext) this.audioContext.close();
      }

      process(event) {
        const input = event.inputBuffer.getChannelData(0);

        this.sampleTimeMs += (input.length / this.sampleRate) * 1000;
        const currentTime = this.sampleTimeMs;

        if ((currentTime - this.lastTransitionTime) > this.searchAfterMs) {
          this.centerMode = 'search';
        } else {
          this.centerMode = 'lock';
        }

        if (this.centerMode === 'search' && this.bandpassFilter && this.analyserNode && this.audioContext) {
          if ((currentTime - this.lastFftUpdateTime) >= this.fftUpdateInterval) {
            this.lastFftUpdateTime = currentTime;

            const toneHz = this.estimateToneFrequencyHz();
            if (toneHz) {
              this.centerFrequency = this.centerFrequency * (1 - this.freqSmoothing) + toneHz * this.freqSmoothing;
              this.bandpassFilter.frequency.value = this.centerFrequency;
            }
          }
        }

        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);

        this.recentLevels.push(rms);
        if (this.recentLevels.length > this.maxRecentLevels) {
          this.recentLevels.shift();
        }

        if (this.recentLevels.length >= 50) {
          const sorted = [...this.recentLevels].sort((a, b) => a - b);
          const noise = sorted[Math.floor(sorted.length * 0.3)];
          const signal = sorted[Math.floor(sorted.length * 0.95)];
          this.threshold = Math.max(this.minThreshold,
                                    Math.min(this.maxThreshold,
                                    noise + (signal - noise) * 0.7));
        }

        const onThreshold = this.threshold;
        const offThreshold = this.threshold * 0.7;

        const wantOn = rms > onThreshold;
        const wantOff = rms < offThreshold;

        if (!this.isOn) {
          this.onCandidateFrames = wantOn ? (this.onCandidateFrames + 1) : 0;
          this.offCandidateFrames = 0;
        } else {
          this.offCandidateFrames = wantOff ? (this.offCandidateFrames + 1) : 0;
          this.onCandidateFrames = 0;
        }

        if (this.isOn && (currentTime - this.onStartTime) > this.stuckOnTimeout) {
          if ((currentTime - this.lastAutoResetTime) > this.autoResetCooldown) {
            this.lastAutoResetTime = currentTime;
            this.resetCalibration();
            return;
          }
        }

        const timeSinceLastTransition = currentTime - this.lastTransitionTime;
        if (timeSinceLastTransition < this.minTransitionInterval) {
          return;
        }

        if (!this.isOn && this.onCandidateFrames >= this.onConfirmFrames) {
          this.isOn = true;
          this.onCandidateFrames = 0;

          this.onStartTime = currentTime;
          this.lastTransitionTime = currentTime;

          const offDuration = currentTime - this.offStartTime;
          this.offDurations.push(offDuration);

          if (this.onStateChange) this.onStateChange(true, rms, this.threshold);
          if (this.onTiming) this.onTiming(offDuration, false);

        } else if (this.isOn && this.offCandidateFrames >= this.offConfirmFrames) {
          this.isOn = false;
          this.offCandidateFrames = 0;

          this.offStartTime = currentTime;
          this.lastTransitionTime = currentTime;

          const onDuration = currentTime - this.onStartTime;
          this.onDurations.push(onDuration);

          if (this.onStateChange) this.onStateChange(false, rms, this.threshold);
          if (this.onTiming) this.onTiming(onDuration, true);
        }
      }
    }

    class SimpleMorseDecoder {
      constructor({ onChar, onWord }) {
        this.onChar = onChar;
        this.onWord = onWord;

        this.currentCode = "";
        this.currentWord = "";

        this.ditLength = 60;
        this.updateTimings();

        this.recentDits = [];
        this.recentDahs = [];
        this.maxSamples = 20;

        this.wordTimeout = null;
        this.charTimeout = null;

        this.minDitMs = 25;
        this.maxDitMs = 140;
        this.ditAdaptMinSamples = 8;
        this.ditAdaptAlpha = 0.05;
        this.ditAdaptDeltaMs = 20;
      }

      updateTimings() {
        this.ditDahBoundary = this.ditLength * 2;

        // CHANGED: more tolerant char-gap boundary (prevents splitting long chars like "8")
        this.elementCharBoundary = this.ditLength * 2.8;

        this.charWordBoundary = this.ditLength * 4.5;
      }

      addTiming(duration, isOn) {
        if (this.wordTimeout) clearTimeout(this.wordTimeout);
        if (this.charTimeout) clearTimeout(this.charTimeout);

        if (isOn) {
          const minSignalDuration = 30;
          if (duration < minSignalDuration) return;

          const isDit = duration < this.ditDahBoundary;

          if (isDit) {
            this.currentCode += ".";
            this.recentDits.push(duration);
            if (this.recentDits.length > this.maxSamples) this.recentDits.shift();
          } else {
            this.currentCode += "-";
            this.recentDahs.push(duration);
            if (this.recentDahs.length > this.maxSamples) this.recentDahs.shift();
          }

          if (this.recentDits.length >= this.ditAdaptMinSamples) {
            const sorted = [...this.recentDits].sort((a, b) => a - b);
            const median = sorted[Math.floor(sorted.length / 2)];
            const clamped = Math.max(this.minDitMs, Math.min(this.maxDitMs, median));

            if (Math.abs(clamped - this.ditLength) > this.ditAdaptDeltaMs) {
              this.ditLength = this.ditLength * (1 - this.ditAdaptAlpha) + clamped * this.ditAdaptAlpha;
              this.updateTimings();
            }
          }

        } else {
          const minGapDuration = 20;
          if (duration < minGapDuration) return;

          if (this.currentCode.length > 0) {
            if (duration >= this.charWordBoundary) {
              this.completeCharacter();
              this.completeWord();
            } else if (duration >= this.elementCharBoundary) {
              this.completeCharacter();
              this.wordTimeout = setTimeout(() => this.completeWord(), this.charWordBoundary);
            }
          }
        }

        this.charTimeout = setTimeout(() => {
          this.completeCharacter();
          this.completeWord();
        }, this.charWordBoundary * 2);
      }

      completeCharacter() {
        if (this.currentCode.length === 0) return;
        const char = MORSE_TO_TEXT[this.currentCode] || '?';
        this.currentWord += char;
        if (this.onChar) this.onChar(char);
        this.currentCode = "";
      }

      completeWord() {
        this.completeCharacter();
        if (this.currentWord.length === 0) return;
        if (this.onWord) this.onWord(this.currentWord);
        this.currentWord = "";
      }
    }

    let detector = null;
    let decoder = null;
    let running = false;

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.id = "cwResetBtn";
    resetBtn.textContent = "Reset";
    resetBtn.style.marginLeft = "10px";
    resetBtn.disabled = true;

    startBtn.insertAdjacentElement("afterend", resetBtn);

    resetBtn.addEventListener("click", () => {
      if (detector) detector.resetCalibration();
    });

    startBtn.addEventListener("click", async () => {
      if (!running && isLikelyInAppBrowser) {
        showOpenInBrowserHelp();
        return;
      }

      if (!running) {
        try {
          statusEl.textContent = "Requesting microphone…";
          statusEl.style.color = "#aaa";
          overlay.textContent = "";

          decoder = new SimpleMorseDecoder({
            onChar: (char) => {
              overlay.textContent += char;
              overlay.scrollTop = overlay.scrollHeight;
            },
            onWord: (word) => {
              overlay.textContent += " ";
              overlay.scrollTop = overlay.scrollHeight;
            }
          });

          detector = new SimpleEnvelopeDetector();
          detector.onStateChange = (isOn, level, threshold) => {
            statusEl.textContent = isOn ? '🔴 Signal' : '⚪ Listening';
            statusEl.style.color = isOn ? 'red' : 'green';
          };
          detector.onTiming = (duration, isOn) => {
            decoder.addTiming(duration, isOn);
          };

          await detector.start();

          running = true;
          resetBtn.disabled = false;
          startBtn.classList.add("active");
          startBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Stop';
          statusEl.textContent = '⚪ Listening (400-900 Hz)';
          statusEl.style.color = 'green';

        } catch (error) {
          console.error("Error:", error);

          if (isLikelyInAppBrowser) {
            showOpenInBrowserHelp();
          } else {
            statusEl.textContent = error.message || "microphone error";
            statusEl.style.color = "red";
          }
        }
      } else {
        detector.stop();
        decoder.completeWord();

        running = false;
        resetBtn.disabled = true;
        startBtn.classList.remove("active");
        startBtn.innerHTML = '<i class="fas fa-microphone"></i> Decode';
        statusEl.textContent = "stopped";
      }
    });
  });
})();
