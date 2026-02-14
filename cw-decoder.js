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
      "-..-.": "/", "-...-": "=", "..--..": "?", ".-.-.-": ".", "--..--": ",",
      "---...": ":", "-.-.-.": ";", ".----.": "'", "-....-": "-"
    };

    // FAST FREQUENCY TRACKING - With auto-reset
    class WideFilterDetector {
      constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.analyserNode = null;
        this.scriptNode = null;
        this.stream = null;

        this.threshold = 0.05;
        this.minThreshold = 0.02;
        this.maxThreshold = 0.4;
        this.hysteresisRatio = 0.5;
        
        this.isOn = false;
        this.onStartTime = 0;
        this.offStartTime = 0;
        this.lastTransitionTime = 0;
        
        this.minOnDuration = 15;
        this.minOffDuration = 15;
        
        this.onConfirmFrames = 2;
        this.offConfirmFrames = 2;
        this.onCandidateFrames = 0;
        this.offCandidateFrames = 0;

        this.sampleTimeMs = 0;
        this.sampleRate = 48000;

        this.signalLevels = [];
        this.noiseLevels = [];
        this.maxLevelHistory = 100;
        
        this.agcGain = 1.0;
        this.agcTarget = 0.2;
        this.agcAttack = 0.002;
        this.agcRelease = 0.1;

        this.centerFrequency = 700;
        this.minToneHz = 300;
        this.maxToneHz = 1200;
        this.lastFreqUpdate = 0;
        this.freqUpdateInterval = 50;
        this.freqHistory = [];
        this.maxFreqHistory = 3;
        
        // Auto-reset on frequency jump
        this.lastStableFrequency = 700;
        this.frequencyJumpThreshold = 80;
        this.frequencyStableCounter = 0;
        this.minStableSamples = 1;
        
        this.currentQ = 1.0;
        this.targetQ = 1.0;
        this.narrowQ = 3.0;
        this.wideQ = 1.0;
        
        this.stuckOnTimeout = 3000;
        this.lastAutoReset = 0;
        this.autoResetCooldown = 10000;

        this.onStateChange = null;
        this.onTiming = null;
        this.onStats = null;
        this.onReset = null;
      }

      resetCalibration() {
        const now = this.sampleTimeMs || 0;
        this.threshold = 0.05;
        this.signalLevels = [];
        this.noiseLevels = [];
        this.isOn = false;
        this.onStartTime = now;
        this.offStartTime = now;
        this.lastTransitionTime = now;
        this.onCandidateFrames = 0;
        this.offCandidateFrames = 0;
        this.agcGain = 1.0;
        this.freqHistory = [];
        this.lastFreqUpdate = 0;
        
        this.lastStableFrequency = this.centerFrequency;
        this.frequencyStableCounter = 0;
        
        this.currentQ = this.wideQ;
        this.targetQ = this.wideQ;
        if (this.bandpassFilter) {
          this.bandpassFilter.Q.value = this.currentQ;
        }

        if (this.onStateChange) {
          this.onStateChange(false, 0, this.threshold);
        }
        
        if (this.onReset) {
          this.onReset();
        }
      }

      estimateToneFrequency() {
        if (!this.analyserNode || !this.audioContext) return null;
        
        const fftSize = this.analyserNode.frequencyBinCount;
        const freqData = new Float32Array(fftSize);
        this.analyserNode.getFloatFrequencyData(freqData);

        const nyquist = this.audioContext.sampleRate / 2;
        const binHz = nyquist / fftSize;
        
        const startBin = Math.floor(this.minToneHz / binHz);
        const endBin = Math.ceil(this.maxToneHz / binHz);

        let maxDb = -Infinity;
        let maxBin = -1;
        let sumDb = 0;
        let count = 0;
        
        for (let i = startBin; i <= endBin; i++) {
          sumDb += freqData[i];
          count++;
          if (freqData[i] > maxDb) {
            maxDb = freqData[i];
            maxBin = i;
          }
        }

        if (maxBin < 0 || count === 0) return null;
        
        const avgDb = sumDb / count;
        if ((maxDb - avgDb) < 6) return null;

        let peakFreq = maxBin * binHz;
        if (maxBin > startBin && maxBin < endBin) {
          const y1 = freqData[maxBin - 1];
          const y2 = freqData[maxBin];
          const y3 = freqData[maxBin + 1];
          const denom = 2 * y2 - y1 - y3;
          if (Math.abs(denom) > 0.01) {
            const delta = 0.5 * (y3 - y1) / denom;
            if (Math.abs(delta) < 1) {
              peakFreq = (maxBin + delta) * binHz;
            }
          }
        }
        
        return peakFreq;
      }

      async start() {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: { ideal: 48000 }
          }
        });

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.sampleRate = this.audioContext.sampleRate;
        this.sampleTimeMs = 0;

        this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);

        this.highpassFilter = this.audioContext.createBiquadFilter();
        this.highpassFilter.type = 'highpass';
        this.highpassFilter.frequency.value = 250;
        this.highpassFilter.Q.value = 0.7;

        this.bandpassFilter = this.audioContext.createBiquadFilter();
        this.bandpassFilter.type = 'bandpass';
        this.bandpassFilter.frequency.value = this.centerFrequency;
        this.bandpassFilter.Q.value = this.wideQ;

        this.compressor = this.audioContext.createDynamicsCompressor();
        this.compressor.threshold.value = -20;
        this.compressor.knee.value = 10;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.1;

        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 2048;
        this.analyserNode.smoothingTimeConstant = 0.3;

        this.scriptNode = this.audioContext.createScriptProcessor(512, 1, 1);
        this.scriptNode.onaudioprocess = this.process.bind(this);

        this.sourceNode.connect(this.highpassFilter);
        this.highpassFilter.connect(this.bandpassFilter);
        this.bandpassFilter.connect(this.compressor);
        this.compressor.connect(this.analyserNode);
        this.analyserNode.connect(this.scriptNode);
        this.scriptNode.connect(this.audioContext.destination);

        this.offStartTime = 0;
        this.onStartTime = 0;
        this.lastTransitionTime = 0;
      }

      stop() {
        if (this.sourceNode) this.sourceNode.disconnect();
        if (this.highpassFilter) this.highpassFilter.disconnect();
        if (this.bandpassFilter) this.bandpassFilter.disconnect();
        if (this.compressor) this.compressor.disconnect();
        if (this.scriptNode) this.scriptNode.disconnect();
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        if (this.audioContext) this.audioContext.close();
      }

      process(event) {
        const input = event.inputBuffer.getChannelData(0);
        const blockSize = input.length;
        
        this.sampleTimeMs += (blockSize / this.sampleRate) * 1000;
        const currentTime = this.sampleTimeMs;

        if ((currentTime - this.lastFreqUpdate) > this.freqUpdateInterval) {
          this.lastFreqUpdate = currentTime;
          const detectedFreq = this.estimateToneFrequency();
          
          if (detectedFreq) {
            this.freqHistory.push(detectedFreq);
            if (this.freqHistory.length > this.maxFreqHistory) {
              this.freqHistory.shift();
            }
            
            if (this.freqHistory.length >= 2) {
              const avgFreq = this.freqHistory.reduce((a, b) => a + b) / this.freqHistory.length;
              
              const freqChange = Math.abs(avgFreq - this.lastStableFrequency);
              if (freqChange > this.frequencyJumpThreshold) {
                this.frequencyStableCounter++;
                if (this.frequencyStableCounter >= this.minStableSamples) {
                  this.resetCalibration();
                  this.centerFrequency = avgFreq;
                  this.lastStableFrequency = avgFreq;
                  this.bandpassFilter.frequency.value = this.centerFrequency;
                  this.frequencyStableCounter = 0;
                  return;
                }
              } else {
                this.frequencyStableCounter = 0;
                this.lastStableFrequency = this.centerFrequency;
              }
              
              const freqDiff = Math.abs(avgFreq - this.centerFrequency);
              if (freqDiff > 50) {
                this.targetQ = this.wideQ;
                this.centerFrequency = avgFreq;
              } else {
                this.targetQ = this.narrowQ;
                this.centerFrequency = this.centerFrequency * 0.4 + avgFreq * 0.6;
              }
              
              this.bandpassFilter.frequency.value = this.centerFrequency;
            }
          }
        }
        
        this.currentQ = this.currentQ * 0.7 + this.targetQ * 0.3;
        this.bandpassFilter.Q.value = this.currentQ;

        let sumSquares = 0;
        for (let i = 0; i < blockSize; i++) {
          sumSquares += input[i] * input[i];
        }
        let rms = Math.sqrt(sumSquares / blockSize);

        if (rms > 0.001) {
          const error = this.agcTarget - (rms * this.agcGain);
          const rate = error > 0 ? this.agcAttack : this.agcRelease;
          this.agcGain += rate * error;
          this.agcGain = Math.max(0.1, Math.min(50, this.agcGain));
          rms *= this.agcGain;
        }

        if (this.isOn) {
          this.signalLevels.push(rms);
          if (this.signalLevels.length > this.maxLevelHistory) {
            this.signalLevels.shift();
          }
        } else {
          this.noiseLevels.push(rms);
          if (this.noiseLevels.length > this.maxLevelHistory) {
            this.noiseLevels.shift();
          }
        }

        if (this.signalLevels.length > 20 && this.noiseLevels.length > 20) {
          const avgSignal = this.signalLevels.reduce((a, b) => a + b) / this.signalLevels.length;
          const avgNoise = this.noiseLevels.reduce((a, b) => a + b) / this.noiseLevels.length;
          const newThreshold = avgNoise + (avgSignal - avgNoise) * 0.5;
          this.threshold = Math.max(this.minThreshold, 
                                    Math.min(this.maxThreshold, newThreshold));
        }

        const onThreshold = this.threshold;
        const offThreshold = this.threshold * this.hysteresisRatio;

        const wantOn = rms > onThreshold;
        const wantOff = rms < offThreshold;

        if (!this.isOn) {
          if (wantOn) {
            this.onCandidateFrames++;
            this.offCandidateFrames = 0;
          } else {
            this.onCandidateFrames = 0;
          }
        } else {
          if (wantOff) {
            this.offCandidateFrames++;
            this.onCandidateFrames = 0;
          } else {
            this.onCandidateFrames = 0;
          }
        }

        if (this.isOn && (currentTime - this.onStartTime) > this.stuckOnTimeout) {
          if ((currentTime - this.lastAutoReset) > this.autoResetCooldown) {
            this.lastAutoReset = currentTime;
            this.resetCalibration();
            return;
          }
        }

        if (!this.isOn && this.onCandidateFrames >= this.onConfirmFrames) {
          const offDuration = currentTime - this.offStartTime;
          
          if (offDuration >= this.minOffDuration || this.offStartTime === 0) {
            this.isOn = true;
            this.onCandidateFrames = 0;
            this.onStartTime = currentTime;
            this.lastTransitionTime = currentTime;

            if (this.onStateChange) this.onStateChange(true, rms, this.threshold);
            if (this.onTiming && this.offStartTime !== 0) {
              this.onTiming(offDuration, false);
            }
          }
          
        } else if (this.isOn && this.offCandidateFrames >= this.offConfirmFrames) {
          const onDuration = currentTime - this.onStartTime;
          
          if (onDuration >= this.minOnDuration) {
            this.isOn = false;
            this.offCandidateFrames = 0;
            this.offStartTime = currentTime;
            this.lastTransitionTime = currentTime;

            if (this.onStateChange) this.onStateChange(false, rms, this.threshold);
            if (this.onTiming) {
              this.onTiming(onDuration, true);
            }
          } else {
            this.offCandidateFrames = 0;
          }
        }

        if (this.onStats && Math.random() < 0.05) {
          this.onStats({
            threshold: this.threshold,
            agcGain: this.agcGain,
            frequency: this.centerFrequency,
            q: this.currentQ,
            rms: rms
          });
        }
      }
    }

    // FAST-ADAPTING DECODER
    class InstantStartDecoder {
      constructor({ onChar, onWord, onDebug }) {
        this.onChar = onChar;
        this.onWord = onWord;
        this.onDebug = onDebug;

        this.currentCode = "";
        this.currentWord = "";

        // Start with reasonable defaults for 18 WPM
        this.ditLength = 67;  // 18 WPM default
        this.dahLength = 200; // Estimated dah length
        this.boundary = 120;  // Midpoint between dit and dah
        this.estimatedWPM = 18;
        
        // WPM constraints
        this.minWPM = 12;
        this.maxWPM = 40;
        
        // FAST ADAPTATION
        this.ditSamples = [];
        this.dahSamples = [];
        this.maxSamples = 4;
        
        this.charTimeout = null;
        this.wordTimeout = null;
        this.maxCodeLength = 6;
        
        this.adaptationSpeed = 0.55;
        this.signalCount = 0;

        if (this.onDebug) {
          this.onDebug(`INSTANT START at 18 WPM (fast adapting...)`);
        }
      }

      fastAdapt(duration, isDit) {
        if (isDit) {
          if (this.ditSamples.length === 0) {
            this.ditLength = duration;
          } else {
            this.ditLength = this.ditLength * (1 - this.adaptationSpeed) + 
                             duration * this.adaptationSpeed;
          }
          
          this.ditSamples.push(duration);
          if (this.ditSamples.length > this.maxSamples) {
            this.ditSamples.shift();
          }
          
        } else {
          if (this.dahSamples.length === 0) {
            this.dahLength = duration;
          } else {
            this.dahLength = this.dahLength * (1 - this.adaptationSpeed) + 
                             duration * this.adaptationSpeed;
          }
          
          this.dahSamples.push(duration);
          if (this.dahSamples.length > this.maxSamples) {
            this.dahSamples.shift();
          }
        }
        
        if (this.ditSamples.length > 0 && this.dahSamples.length > 0) {
          this.boundary = (this.ditLength + this.dahLength) / 2;
        } else if (this.ditSamples.length > 0) {
          this.boundary = this.ditLength * 2;
        }
        
        let rawWPM = Math.round(1200 / this.ditLength);
        // Add a small bias toward higher speeds (20-22 WPM range)
        if (rawWPM < 18 && this.ditLength > 50) {
          rawWPM = Math.min(22, rawWPM + 2);
        }
        this.estimatedWPM = Math.max(this.minWPM, Math.min(this.maxWPM, rawWPM));
        
        this.signalCount++;
        if (this.signalCount % 2 === 0 && this.onDebug) {
          this.onDebug(`${this.estimatedWPM}WPM | dit=${Math.round(this.ditLength)}ms`);
        }
      }

      addTiming(duration, isSignal) {
        if (this.charTimeout) clearTimeout(this.charTimeout);
        if (this.wordTimeout) clearTimeout(this.wordTimeout);

        if (isSignal) {
          const isDit = duration < this.boundary;
          this.fastAdapt(duration, isDit);
          
          if (isDit) {
            this.currentCode += ".";
          } else {
            this.currentCode += "-";
          }
          
          if (this.currentCode.length > this.maxCodeLength) {
            this.currentCode = this.currentCode.slice(-this.maxCodeLength);
          }
          
        } else {
          if (this.currentCode.length === 0) return;

          const charGapMin = this.ditLength * 2.0;
          const wordGapMin = this.ditLength * 5.0;

          if (duration >= wordGapMin) {
            this.completeCharacter();
            this.completeWord();
          } else if (duration >= charGapMin) {
            this.completeCharacter();
            const wordTimeout = this.ditLength * 8;
            this.wordTimeout = setTimeout(() => this.completeWord(), wordTimeout);
          }
        }

        const safetyTimeout = this.ditLength * 15;
        this.charTimeout = setTimeout(() => {
          this.completeCharacter();
          this.completeWord();
        }, safetyTimeout);
      }

      completeCharacter() {
        if (this.currentCode.length === 0) return;
        
        const char = MORSE_TO_TEXT[this.currentCode];
        
        if (char) {
          this.currentWord += char;
          if (this.onChar) {
            this.onChar(char, this.currentCode);
          }
        } else {
          this.currentWord += "?";
          if (this.onChar) {
            this.onChar("?", this.currentCode);
          }
        }
        
        this.currentCode = "";
      }

      completeWord() {
        this.completeCharacter();
        if (this.currentWord.length === 0) return;
        if (this.onWord) {
          this.onWord(this.currentWord);
        }
        this.currentWord = "";
      }

      forceComplete() {
        this.completeCharacter();
        this.completeWord();
      }

      reset() {
        this.ditSamples = [];
        this.dahSamples = [];
        this.ditLength = 67;
        this.dahLength = 200;
        this.boundary = 120;
        this.estimatedWPM = 18;
        this.currentCode = "";
        this.currentWord = "";
        this.signalCount = 0;
      }

      getStats() {
        return {
          estimatedWPM: this.estimatedWPM,
          ditLength: Math.round(this.ditLength),
          dahLength: Math.round(this.dahLength),
          boundary: Math.round(this.boundary),
          ditSamples: this.ditSamples.length
        };
      }
    }

    // UI
    let detector = null;
    let decoder = null;
    let running = false;

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset";
    resetBtn.style.marginLeft = "10px";
    resetBtn.disabled = true;

    const debugDiv = document.createElement("div");
    debugDiv.style.cssText = "margin-top: 5px; font-size: 11px; color: #666; font-family: monospace;";
    
    startBtn.insertAdjacentElement("afterend", resetBtn);
    statusEl.insertAdjacentElement("afterend", debugDiv);

    resetBtn.addEventListener("click", () => {
      if (detector) detector.resetCalibration();
      if (decoder) decoder.reset();
      overlay.textContent += "\n--- RESET ---\n";
      overlay.scrollTop = overlay.scrollHeight;
      debugDiv.textContent = "Reset. Ready to decode immediately at 18 WPM default.";
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

          decoder = new InstantStartDecoder({
            onChar: (char, code) => {
              overlay.textContent += char;
              overlay.scrollTop = overlay.scrollHeight;
            },
            onWord: (word) => {
              overlay.textContent += " ";
              overlay.scrollTop = overlay.scrollHeight;
            },
            onDebug: (msg) => {
              debugDiv.textContent = msg;
            }
          });

          detector = new WideFilterDetector();
          
          detector.onStateChange = (isOn, level, threshold) => {
            const freq = detector.centerFrequency.toFixed(0);
            statusEl.textContent = isOn ? `🔴 ${freq}Hz` : `⚪ ${freq}Hz`;
            statusEl.style.color = isOn ? 'red' : 'green';
          };
          
          detector.onTiming = (duration, isSignal) => {
            decoder.addTiming(duration, isSignal);
          };

          detector.onReset = () => {
            decoder.reset();
          };

          await detector.start();

          running = true;
          resetBtn.disabled = false;
          startBtn.classList.add("active");
          startBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Stop';
          statusEl.textContent = '⚪ Ready';
          statusEl.style.color = 'green';
          debugDiv.textContent = "INSTANT START at 18 WPM (fast adapting...)";

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
        decoder.forceComplete();

        running = false;
        resetBtn.disabled = true;
        startBtn.classList.remove("active");
        startBtn.innerHTML = '<i class="fas fa-microphone"></i> Decode';
        statusEl.textContent = "stopped";
        debugDiv.textContent = "";
      }
    });
  });
})();
