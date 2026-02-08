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

    const MORSE_TO_TEXT = {
      ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E",
      "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
      "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O",
      ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
      "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y",
      "--..": "Z",
      "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4",
      ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9"
    };

    // Simple envelope detector - much more reliable than Goertzel for beginners
    class SimpleEnvelopeDetector {
      constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.analyserNode = null;
        this.scriptNode = null;
        this.stream = null;
        
        // Detection parameters
        this.smoothingConstant = 0.85; // Reduced from 0.9 since bandpass helps with noise
        this.threshold = 0.03; // Reduced from 0.05 since bandpass filters noise
        this.minThreshold = 0.02;
        this.maxThreshold = 0.5;
        
        // Signal tracking
        this.isOn = false;
        this.onStartTime = 0;
        this.offStartTime = 0;
        this.lastTransitionTime = 0;
        this.minTransitionInterval = 15; // Minimum 15ms between state changes
        
        // Timing storage
        this.onDurations = [];
        this.offDurations = [];
        
        // Callbacks
        this.onStateChange = null;
        this.onTiming = null;
        
        // Auto threshold
        this.recentLevels = [];
        this.maxRecentLevels = 100;
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
        
        this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
        
        // Add bandpass filter for CW frequency range (400-900 Hz)
        this.bandpassFilter = this.audioContext.createBiquadFilter();
        this.bandpassFilter.type = 'bandpass';
        this.bandpassFilter.frequency.value = 650; // Center frequency
        this.bandpassFilter.Q.value = 2; // Bandwidth control (higher = narrower)
        
        this.analyserNode = this.audioContext.createAnalyser();
        this.analyserNode.fftSize = 256;
        this.analyserNode.smoothingTimeConstant = this.smoothingConstant;
        
        this.scriptNode = this.audioContext.createScriptProcessor(256, 1, 1);
        this.scriptNode.onaudioprocess = this.process.bind(this);
        
        // Connect: source → bandpass → analyser → script → destination
        this.sourceNode.connect(this.bandpassFilter);
        this.bandpassFilter.connect(this.analyserNode);
        this.analyserNode.connect(this.scriptNode);
        this.scriptNode.connect(this.audioContext.destination);
        
        this.offStartTime = performance.now();
      }

      stop() {
        if (this.sourceNode) this.sourceNode.disconnect();
        if (this.bandpassFilter) this.bandpassFilter.disconnect();
        if (this.scriptNode) this.scriptNode.disconnect();
        if (this.stream) this.stream.getTracks().forEach(t => t.stop());
        if (this.audioContext) this.audioContext.close();
      }

      process(event) {
        const input = event.inputBuffer.getChannelData(0);
        const currentTime = performance.now();
        
        // Calculate RMS (Root Mean Square) amplitude
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        
        // Track levels for auto threshold
        this.recentLevels.push(rms);
        if (this.recentLevels.length > this.maxRecentLevels) {
          this.recentLevels.shift();
        }
        
        // Auto-adjust threshold
        if (this.recentLevels.length >= 50) {
          const sorted = [...this.recentLevels].sort((a, b) => a - b);
          const noise = sorted[Math.floor(sorted.length * 0.3)];
          const signal = sorted[Math.floor(sorted.length * 0.95)];
          this.threshold = Math.max(this.minThreshold, 
                                    Math.min(this.maxThreshold,
                                    noise + (signal - noise) * 0.7)); // Increased from 0.6
        }
        
        // Hysteresis: use different thresholds for ON and OFF transitions
        const onThreshold = this.threshold;
        const offThreshold = this.threshold * 0.7; // Lower threshold to turn off
        
        const signalOn = this.isOn ? (rms > offThreshold) : (rms > onThreshold);
        
        // Prevent rapid transitions
        const timeSinceLastTransition = currentTime - this.lastTransitionTime;
        if (timeSinceLastTransition < this.minTransitionInterval) {
          return; // Too soon, ignore this transition
        }
        
        // State transitions
        if (signalOn && !this.isOn) {
          // Signal just turned ON
          this.isOn = true;
          this.onStartTime = currentTime;
          this.lastTransitionTime = currentTime;
          
          // Record OFF duration
          const offDuration = currentTime - this.offStartTime;
          this.offDurations.push(offDuration);
          
          if (this.onStateChange) {
            this.onStateChange(true, rms, this.threshold);
          }
          
          if (this.onTiming) {
            this.onTiming(offDuration, false);
          }
          
        } else if (!signalOn && this.isOn) {
          // Signal just turned OFF
          this.isOn = false;
          this.offStartTime = currentTime;
          this.lastTransitionTime = currentTime;
          
          // Record ON duration
          const onDuration = currentTime - this.onStartTime;
          this.onDurations.push(onDuration);
          
          if (this.onStateChange) {
            this.onStateChange(false, rms, this.threshold);
          }
          
          if (this.onTiming) {
            this.onTiming(onDuration, true);
          }
        }
      }
    }

    // Morse decoder with clear logic
    class SimpleMorseDecoder {
      constructor({ onChar, onWord }) {
        this.onChar = onChar;
        this.onWord = onWord;
        
        this.currentCode = "";
        this.currentWord = "";
        
        // Timing parameters (ms)
        this.ditLength = 60; // Start with 20 WPM (1200/20 = 60ms)
        this.updateTimings();
        
        // Adaptive timing
        this.recentDits = [];
        this.recentDahs = [];
        this.maxSamples = 20;
        
        // Timeout for word completion
        this.wordTimeout = null;
        this.charTimeout = null;
      }

      updateTimings() {
        // Based on dit length, calculate thresholds
        // Standard: element gap = 1 dit, char gap = 3 dits, word gap = 7 dits
        this.ditDahBoundary = this.ditLength * 2;
        this.elementCharBoundary = this.ditLength * 2.2; // Increased - must be clearly longer than 1 dit
        this.charWordBoundary = this.ditLength * 4.5;
      }

      addTiming(duration, isOn) {
        // Clear timeouts
        if (this.wordTimeout) clearTimeout(this.wordTimeout);
        if (this.charTimeout) clearTimeout(this.charTimeout);
        
        if (isOn) {
          // CRITICAL FIX: Ignore very short noise bursts
          const minSignalDuration = 30; // Increased from 20ms to filter more noise
          if (duration < minSignalDuration) {
            return; // Ignore this signal
          }
          
          // This is a dit or dah
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
          
          // Adapt timing - but only use reasonable samples
          if (this.recentDits.length >= 5) {
            // Filter out outliers before calculating average
            const sorted = [...this.recentDits].sort((a, b) => a - b);
            // Use median instead of mean to reject outliers
            const median = sorted[Math.floor(sorted.length / 2)];
            
            if (Math.abs(median - this.ditLength) > 15) {
              this.ditLength = this.ditLength * 0.9 + median * 0.1; // Slow adaptation
              this.updateTimings();
            }
          }
          
        } else {
          // This is a space
          
          // Filter out very short gaps (noise)
          const minGapDuration = 20; // Ignore gaps shorter than 20ms
          if (duration < minGapDuration) {
            return;
          }
          
          // Only process spacing if we have some morse code
          if (this.currentCode.length > 0) {
            if (duration >= this.charWordBoundary) {
              // Word space
              this.completeCharacter();
              this.completeWord();
            } else if (duration >= this.elementCharBoundary) {
              // Character space
              this.completeCharacter();
              // Set timeout for word completion
              this.wordTimeout = setTimeout(() => this.completeWord(), this.charWordBoundary);
            }
            // else: element space, do nothing
          }
        }
        
        // Safety timeout - complete character if nothing happens for a while
        this.charTimeout = setTimeout(() => {
          this.completeCharacter();
          this.completeWord();
        }, this.charWordBoundary * 2);
      }

      completeCharacter() {
        if (this.currentCode.length === 0) return;
        
        const char = MORSE_TO_TEXT[this.currentCode] || '?';
        this.currentWord += char;
        
        if (this.onChar) {
          this.onChar(char);
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
    }

    // UI Integration
    let detector = null;
    let decoder = null;
    let running = false;

    startBtn.addEventListener("click", async () => {
      if (!running) {
        try {
          // Clear display
          overlay.textContent = "";
          
          // Create decoder
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
          
          // Create detector
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
          startBtn.classList.add("active");
          startBtn.innerHTML = '<i class="fas fa-microphone-slash"></i> Stop';
          statusEl.textContent = '⚪ Listening (400-900 Hz)';
          statusEl.style.color = 'green';
          
        } catch (error) {
          statusEl.textContent = error.message || "microphone error";
          console.error("Error:", error);
        }
      } else {
        detector.stop();
        decoder.completeWord();
        
        running = false;
        startBtn.classList.remove("active");
        startBtn.innerHTML = '<i class="fas fa-microphone"></i> Decode';
        statusEl.textContent = "stopped";
      }
    });
  });
})();
