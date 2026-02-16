/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

(() => {
  document.addEventListener("DOMContentLoaded", () => {
    let overlay = document.getElementById("cwDecodedOverlay");
    let startBtn = document.getElementById("cwStartBtn");
    let statusEl = document.getElementById("cwStatus");

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
        
        this.lastStableFrequency = 700;
        this.frequencyJumpThreshold = 150;
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
                  if (Math.abs(avgFreq - this.lastStableFrequency) < 200) {
                    this.centerFrequency = this.centerFrequency * 0.5 + avgFreq * 0.5;
                    this.lastStableFrequency = this.centerFrequency;
                    this.bandpassFilter.frequency.value = this.centerFrequency;
                  } else {
                    this.resetCalibration();
                    this.centerFrequency = avgFreq;
                    this.lastStableFrequency = avgFreq;
                    this.bandpassFilter.frequency.value = this.centerFrequency;
                  }
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

    // ADAPTIVE DECODER - With per-transmission scoring for pileups
    class AdaptiveDecoder {
      constructor({ onChar, onWord, wpm }) {
        this.onChar = onChar;
        this.onWord = onWord;
        
        this.wpm = wpm;
        this.ditLength = 1200 / wpm;
        this.dahLength = this.ditLength * 3;
        this.boundary = (this.ditLength + this.dahLength) / 2;
        
        this.currentCode = "";
        this.currentWord = "";
        this.currentTransmission = "";
        this.transmissionScore = 0;
        this.maxCodeLength = 6;
        
        this.charTimeout = null;
        this.wordTimeout = null;
        this.transmissionTimeout = null;
        
        // Adaptive gap thresholds
        this.gapSamples = [];
        this.maxGapSamples = 10;
        this.charGapMin = this.ditLength * 2.5;
        this.wordGapMin = this.ditLength * 6.0;
        this.transmissionGapMin = this.ditLength * 15.0;
        
        // Full output (never reset)
        this.fullOutput = "";
      }

      updateGapThresholds() {
        if (this.gapSamples.length < 5) return;
        
        const sortedGaps = [...this.gapSamples].sort((a, b) => a - b);
        const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
        const estimatedDit = medianGap / 3;
        
        this.charGapMin = estimatedDit * 2.2;
        this.wordGapMin = estimatedDit * 5.5;
        this.transmissionGapMin = estimatedDit * 15.0;
        
        this.charGapMin = Math.max(this.charGapMin, this.ditLength * 2.0);
        this.wordGapMin = Math.max(this.wordGapMin, this.ditLength * 5.0);
        this.transmissionGapMin = Math.max(this.transmissionGapMin, this.ditLength * 12.0);
      }

      addTiming(duration, isSignal) {
        if (this.charTimeout) clearTimeout(this.charTimeout);
        if (this.wordTimeout) clearTimeout(this.wordTimeout);
        if (this.transmissionTimeout) clearTimeout(this.transmissionTimeout);

        if (isSignal) {
          const isDit = duration < this.boundary;
          
          if (isDit) {
            this.currentCode += ".";
          } else {
            this.currentCode += "-";
          }
          
          if (this.currentCode.length > this.maxCodeLength) {
            this.currentCode = this.currentCode.slice(-this.maxCodeLength);
          }
          
        } else {
          if (this.currentCode.length > 0) {
            this.gapSamples.push(duration);
            if (this.gapSamples.length > this.maxGapSamples) {
              this.gapSamples.shift();
            }
            
            if (this.gapSamples.length % 3 === 0) {
              this.updateGapThresholds();
            }
          }
          
          if (this.currentCode.length === 0) return;

          // Transmission end detection (long gap)
          if (duration >= this.transmissionGapMin) {
            this.completeCharacter();
            this.completeWord();
            this.completeTransmission();
          }
          else if (duration >= this.wordGapMin) {
            this.completeCharacter();
            this.completeWord();
          } 
          else if (duration >= this.charGapMin) {
            this.completeCharacter();
            const wordTimeout = this.ditLength * 8;
            this.wordTimeout = setTimeout(() => this.completeWord(), wordTimeout);
          }
        }

        // Safety timeouts
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
          this.fullOutput += char;
          this.currentTransmission += char;
          
          // Trim fullOutput to prevent memory growth
          if (this.fullOutput.length > 500) {
            this.fullOutput = this.fullOutput.slice(-500);
          }
        } else {
          this.currentWord += "?";
          this.fullOutput += "?";
          this.currentTransmission += "?";
          
          // Trim fullOutput to prevent memory growth
          if (this.fullOutput.length > 500) {
            this.fullOutput = this.fullOutput.slice(-500);
          }
        }
        
        this.currentCode = "";
      }

      scoreWord(word) {
        if (word.length === 0) return 0;
        
        let wordScore = 0;
        
        // Heavy penalty for errors
        const questionMarks = (word.match(/\?/g) || []).length;
        if (questionMarks > 0) {
          wordScore -= questionMarks * 50;
        } else if (word.length >= 3) {
          // Reward clean words heavily
          wordScore += 40;
        }
        
        // Penalize repeated characters like "TTT", "TTTT", "MMM", etc.
        if (/([A-Z])\1{2,}/.test(word)) {
          wordScore -= 100;
        }
        
        // Penalize isolated 'T's specifically
        if (word === 'T') {
          wordScore -= 30;
        }
        
        // Callsign pattern
        if (questionMarks === 0 && /[A-Z]/.test(word) && /[0-9]/.test(word) && 
            word.length >= 3 && word.length <= 10) {
          wordScore += 80;
        }
        
        // Q-codes
        if (word.length >= 3 && word.length <= 4 && word[0] === 'Q' && questionMarks === 0) {
          wordScore += 60;
        }
        
        // Common procedural words
        const procedures = ['CQ', 'DE', 'PSE', 'K', 'BK', 'AR', 'SK', 'TU', 'TNX', 'AGN'];
        if (procedures.includes(word)) wordScore += 50;
        
        // RST
        if (/^[1-5][1-9][1-9]$/.test(word)) wordScore += 60;
        if (word === 'RST') wordScore += 50;
        
        // Signal reports
        if (/^5[789]9?$/.test(word)) wordScore += 40;
        
        // Common words
        const commonWords = ['INFO', 'NAME', 'QTH', 'NR', 'UR', 'TEST', 'CONTEST'];
        if (commonWords.includes(word)) wordScore += 45;
        
        // SOTA/POTA patterns
        if (word.length >= 4 && /[A-Z]{2}\/[A-Z]{2}-[0-9]{3}/.test(word)) wordScore += 70;
        if (word.length >= 4 && word.slice(-3) === 'OTA' && /[A-Z]/.test(word[0])) wordScore += 60;
        
        // Numbers
        if (/^[0-9]{3}$/.test(word)) wordScore += 25;
        if (word === '73') wordScore += 35;
        if (word === '88') wordScore += 35;
        
        return wordScore;
      }

      completeWord() {
        this.completeCharacter();
        if (this.currentWord.length === 0) return;
        
        const word = this.currentWord;
        this.fullOutput += " ";
        this.currentTransmission += " ";
        
        // Trim fullOutput after adding space
        if (this.fullOutput.length > 500) {
          this.fullOutput = this.fullOutput.slice(-500);
        }
        
        // Add to transmission score
        const wordScore = this.scoreWord(word);
        this.transmissionScore += wordScore;
        
        // CAP THE TRANSMISSION SCORE BETWEEN -200 AND 200
        if (this.transmissionScore > 200) {
          this.transmissionScore = 200;
        } else if (this.transmissionScore < -200) {
          this.transmissionScore = -200;
        }
        
        if (this.onWord) {
          this.onWord(word, wordScore);
        }
        this.currentWord = "";
      }

      completeTransmission() {
        this.completeCharacter();
        this.completeWord();
        
        if (this.currentTransmission.trim().length === 0) return;
        
        // Return the score for this transmission
        const finalScore = this.transmissionScore;
        
        // Reset for next transmission
        this.currentTransmission = "";
        this.transmissionScore = 0;
        
        return finalScore;
      }

      getTransmissionScore() {
        // Get current ongoing transmission score
        return this.transmissionScore;
      }

      forceComplete() {
        return this.completeTransmission();
      }

      reset() {
        // Preserve output, just reset current transmission
        this.currentTransmission = "";
        this.transmissionScore = 0;
      }
    }

    // MULTI DECODER with instant per-transmission scoring for pileups
    class MultiDecoder {
      constructor({ onSmartWord }) {
        this.onSmartWord = onSmartWord;
        
        // Wide WPM spacing
        const wpmValues = [5, 8, 12, 15, 18, 21, 24, 27, 30, 33];
        
        this.decoders = [];
        for (let wpm of wpmValues) {
          this.decoders.push({
            wpm: wpm,
            decoder: new AdaptiveDecoder({ 
              onChar: null, 
              onWord: (word, wordScore) => this.handleWord(wpm, word, wordScore),
              wpm: wpm 
            })
          });
        }
        
        this.smartOutput = "";
        this.bestDecoderIndex = 3; // Start at 15 WPM
        
        // Instant evaluation - no time window
        this.currentBestScore = 0;
        this.scoreThreshold = 50; // Minimum score to consider valid
        this.lastScores = {};
        
        // Sticky decoder tracking
        this.stickyDecoderIndex = null;  // Track established decoder
        this.wordsFromSticky = 0;         // Count words from sticky decoder
        this.minStickyWords = 5;          // Must have 5 good words to become sticky
        
        // Pause detection - independent timer
        this.lastSignalTime = Date.now();
        this.pauseThreshold = 3000; // 3 seconds of silence = pause
        
        // Start silence check interval
        this.silenceCheckInterval = setInterval(() => {
          const now = Date.now();
          if (now - this.lastSignalTime > this.pauseThreshold) {
            // Silence detected - reset scores
            for (let d of this.decoders) {
              d.decoder.transmissionScore = 0;
              d.decoder.currentTransmission = "";
            }
            for (let d of this.decoders) {
              this.lastScores[d.wpm] = 0;
            }
            this.bestDecoderIndex = 3;
            this.stickyDecoderIndex = null;
            this.wordsFromSticky = 0;
            this.lastSignalTime = now; // Reset timer
          }
        }, 1000); // Check every second
        
        // Initialize scores
        for (let d of this.decoders) {
          this.lastScores[d.wpm] = 0;
        }
      }

      handleWord(wpm, word, wordScore) {
        // Find which decoder this is
        const decoderIndex = this.decoders.findIndex(d => d.wpm === wpm);
        
        // ALWAYS output from the decoder that currently has the best score
        // Re-evaluate which is best right now
        let currentBestScore = -Infinity;
        let currentBestIndex = 3; // Default 15 WPM
        
        for (let i = 0; i < this.decoders.length; i++) {
          const score = this.decoders[i].decoder.getTransmissionScore();
          this.lastScores[this.decoders[i].wpm] = score;
          
          if (score > currentBestScore) {
            currentBestScore = score;
            currentBestIndex = i;
          }
        }
        
        const myCurrentScore = this.decoders[this.bestDecoderIndex].decoder.getTransmissionScore();
        
        // Sticky decoder logic
        if (this.stickyDecoderIndex !== null && this.stickyDecoderIndex === this.bestDecoderIndex) {
          // We have an established decoder - only switch if it's doing really badly
          if (myCurrentScore < -100 && currentBestScore > myCurrentScore + 150) {
            // Current decoder is failing hard, and new one is much better
            this.bestDecoderIndex = currentBestIndex;
            this.stickyDecoderIndex = null;
            this.wordsFromSticky = 0;
          }
          // Otherwise stay with sticky decoder even if scores are equal or slightly worse
        } else {
          // Normal switching logic - changed from percentage to absolute +30
          if (currentBestScore > this.scoreThreshold && currentBestScore > myCurrentScore + 30) {
            // New decoder is 30 points better and above threshold
            this.bestDecoderIndex = currentBestIndex;
            this.stickyDecoderIndex = null;
            this.wordsFromSticky = 0;
          } else if (myCurrentScore < 0 && currentBestScore > myCurrentScore) {
            // Current decoder is failing, switch to anything better
            this.bestDecoderIndex = currentBestIndex;
            this.stickyDecoderIndex = null;
            this.wordsFromSticky = 0;
          }
        }
        
        // Track if this decoder should become sticky
        if (decoderIndex === this.bestDecoderIndex) {
          this.wordsFromSticky++;
          if (this.wordsFromSticky >= this.minStickyWords && myCurrentScore > 200) {
            // This decoder has produced 5+ good words with high score - make it sticky
            this.stickyDecoderIndex = this.bestDecoderIndex;
          }
        }
        
        // Now output from the best decoder
        if (decoderIndex === this.bestDecoderIndex) {
          if (this.onSmartWord) {
            this.onSmartWord(word);
          }
          this.smartOutput += word + " ";
          
          // Trim smartOutput to prevent memory growth
          if (this.smartOutput.length > 500) {
            this.smartOutput = this.smartOutput.slice(-500);
          }
        }
      }

      addTiming(duration, isSignal) {
        const now = Date.now();
        
        // If it's a signal, update last signal time
        if (isSignal) {
          this.lastSignalTime = now;
        }
        
        for (let d of this.decoders) {
          d.decoder.addTiming(duration, isSignal);
        }
      }

      getAllOutputs(showAllDecoders) {
        let display = "";
        
        // Smart decoder output (always shown, no header, SINGLE LINE)
        if (this.smartOutput.length > 200) {
          this.smartOutput = this.smartOutput.slice(-200);
        }
        // Remove any newlines and trim to ensure single line
        display += this.smartOutput.replace(/\n/g, ' ').trim();
        
        // All decoders output (only if checkbox is checked)
        if (showAllDecoders) {
          const stickyWPM = this.stickyDecoderIndex !== null ? 
            this.decoders[this.stickyDecoderIndex].wpm : null;
          const stickyInfo = stickyWPM ? ` [LOCKED to ${stickyWPM} WPM]` : "";
          
          display += `\n\n=== ALL DECODERS (current transmission score)${stickyInfo} ===\n`;
          
          for (let i = 0; i < this.decoders.length; i++) {
            const d = this.decoders[i];
            let output = d.decoder.fullOutput;
            if (output.length > 150) {
              output = "..." + output.slice(-150);
            }
            const score = this.lastScores[d.wpm] || 0;
            const isSticky = (this.stickyDecoderIndex === i);
            const marker = (i === this.bestDecoderIndex) ? (isSticky ? "🔒 " : "→ ") : "  ";
            display += `${marker}${d.wpm} WPM [${score}]: ${output}\n`;
          }
        }
        
        return display;
      }

      forceComplete() {
        for (let d of this.decoders) {
          d.decoder.forceComplete();
        }
      }

      reset() {
        for (let d of this.decoders) {
          d.decoder.reset();
        }
      }
    }

    // UI
    let detector = null;
    let multiDecoder = null;
    let running = false;
    let displayInterval = null;

    // Create UI elements with classes only (no inline styles)
    const controlsWrapper = document.createElement("div");
    controlsWrapper.className = "cw-controls-wrapper";

    const statusWrapper = document.createElement("div");
    statusWrapper.className = "cw-status-wrapper";

    const decoderInfo = document.createElement("span");
    decoderInfo.className = "cw-decoder-info";
    decoderInfo.textContent = "Running 10 decoders";

    const checkboxContainer = document.createElement("div");
    checkboxContainer.className = "cw-checkbox-container";

    const showAllCheckbox = document.createElement("input");
    showAllCheckbox.type = "checkbox";
    showAllCheckbox.id = "showAllDecoders";
    showAllCheckbox.checked = false;
    
    const checkboxLabel = document.createElement("label");
    checkboxLabel.htmlFor = "showAllDecoders";
    checkboxLabel.textContent = "Show all";

    const debugDiv = document.createElement("div");
    debugDiv.className = "cw-debug-info";

    // Assemble UI
    checkboxContainer.appendChild(showAllCheckbox);
    checkboxContainer.appendChild(checkboxLabel);
    
    statusWrapper.appendChild(decoderInfo);
    statusWrapper.appendChild(checkboxContainer);
    
    controlsWrapper.appendChild(statusWrapper);
    
    // Add classes to existing elements
    startBtn.classList.add("cw-start-btn");
    startBtn.insertAdjacentElement("afterend", controlsWrapper);
    statusEl.insertAdjacentElement("afterend", debugDiv);

    // Add classes to existing elements
    overlay.classList.add("cw-decoded-overlay");
    statusEl.classList.add("cw-status-text");

    startBtn.addEventListener("click", async () => {
      if (!running && isLikelyInAppBrowser) {
        showOpenInBrowserHelp();
        return;
      }

      if (!running) {
        try {
          statusEl.textContent = "Requesting microphone…";
          statusEl.style.color = "#aaa";

          multiDecoder = new MultiDecoder({
            onSmartWord: (word) => {
              // Smart word output is handled in getAllOutputs
            }
          });

          detector = new WideFilterDetector();
          
          detector.onStateChange = (isOn, level, threshold) => {
            const freq = detector.centerFrequency.toFixed(0);
            statusEl.textContent = isOn ? `🔴 ${freq}Hz` : `⚪ ${freq}Hz`;
            statusEl.style.color = isOn ? '#f44' : '#0f0';
          };
          
          detector.onTiming = (duration, isSignal) => {
            if (multiDecoder) {
              multiDecoder.addTiming(duration, isSignal);
            }
          };

          detector.onReset = () => {};

          await detector.start();

          running = true;
          startBtn.classList.add("active");
          startBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Stop';
          statusEl.textContent = '⚪ Ready';
          statusEl.style.color = '#0f0';
          debugDiv.textContent = ""; // Clear debug info

          // Update the full overlay with all decoders
          displayInterval = setInterval(() => {
            if (multiDecoder) {
              overlay.textContent = multiDecoder.getAllOutputs(showAllCheckbox.checked);
              // Toggle expanded class based on checkbox
              if (showAllCheckbox.checked) {
                overlay.classList.add("expanded");
              } else {
                overlay.classList.remove("expanded");
              }
              // Auto-scroll to the right for horizontal scrolling when in single line mode
              if (!showAllCheckbox.checked) {
                overlay.scrollLeft = overlay.scrollWidth;
              } else {
                overlay.scrollTop = overlay.scrollHeight;
              }
            }
          }, 500);

        } catch (error) {
          console.error("Error:", error);
          if (isLikelyInAppBrowser) {
            showOpenInBrowserHelp();
          } else {
            statusEl.textContent = error.message || "microphone error";
            statusEl.style.color = "#f44";
          }
        }
      } else {
        detector.stop();
        if (multiDecoder) {
          // Clear the silence check interval
          if (multiDecoder.silenceCheckInterval) {
            clearInterval(multiDecoder.silenceCheckInterval);
          }
          multiDecoder.forceComplete();
        }
        if (displayInterval) clearInterval(displayInterval);

        running = false;
        startBtn.classList.remove("active");
        startBtn.innerHTML = '<i class="fas fa-microphone"></i> Decode';
        statusEl.textContent = "stopped";
        statusEl.style.color = "#aaa";
        debugDiv.textContent = "";
      }
    });
  });
})();
