/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// Shared Morse tables, text -> Morse sequencing, CW tone player and speech.
// Used by the Practice screen (practice.js) and the reply builder (reply.js).
(function (root) {
  "use strict";

  const MORSE = {
    A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..",
    J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.",
    S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
    0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....",
    7: "--...", 8: "---..", 9: "----.",
    "/": "-..-.", "?": "..--..", "=": "-...-", ".": ".-.-.-", ",": "--..--"
  };

  // Prosigns are sent as one fused character (no inter-letter gap).
  const PROSIGNS = {
    "<AR>": ".-.-.", "<AS>": ".-...", "<BT>": "-...-", "<KA>": "-.-.-",
    "<KN>": "-.--.", "<SK>": "...-.-", "<VA>": "...-.-", "<VE>": "...-."
  };

  const PROSIGN_INFO = {
    "<KA>": "Starting signal: beginning of a transmission (formal procedure)",
    "<AR>": "End of message",
    "<KN>": "Go ahead, named station only",
    "<BT>": "Separator between parts of a message",
    "<AS>": "Wait, stand by",
    "<VA>": "End of work: no reply expected (ITU)",
    "<SK>": "End of contact (amateur use; same signal as VA)",
    "<VE>": "Understood (rare on the air today)"
  };

  const PHONETIC = {
    A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf",
    H: "Hotel", I: "India", J: "Juliet", K: "Kilo", L: "Lima", M: "Mike", N: "November",
    O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform",
    V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu",
    0: "Zero", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven",
    8: "Eight", 9: "Niner", "/": "Stroke"
  };

  const PROSIGN_RE = /(<(?:AR|AS|BT|KA|KN|SK|VA|VE)>)/i;
  const PROSIGN_RE_G = /<(?:AR|AS|BT|KA|KN|SK|VA|VE)>/gi;

  // A line -> tokens: { type: "prosign"|"word", text, morse: string[] }
  function tokenizeLine(line) {
    const tokens = [];
    for (const part of String(line).split(PROSIGN_RE)) {
      const upper = part.toUpperCase();
      if (PROSIGNS[upper]) {
        tokens.push({ type: "prosign", text: upper, morse: [PROSIGNS[upper]] });
      } else {
        for (const word of part.trim().split(/\s+/)) {
          if (!word) continue;
          const morse = [...word.toUpperCase()].map((c) => MORSE[c]).filter(Boolean);
          tokens.push({ type: "word", text: word.toUpperCase(), morse });
        }
      }
    }
    return tokens;
  }

  // Lines -> { lines: [{ tokens, morse }], sequence: [{ morse[], prosign, word }] }
  // "word" is a running index across all lines, used for playback highlighting.
  function buildOver(lines) {
    const out = [];
    const sequence = [];
    let wordIndex = 0;
    for (const line of lines) {
      const tokens = tokenizeLine(line);
      const parts = [];
      for (const t of tokens) {
        t.index = wordIndex++;
        if (!t.morse.length) continue;
        parts.push(t.type === "prosign" ? t.morse[0] : t.morse.join(" "));
        sequence.push({ morse: t.morse, prosign: t.type === "prosign", word: t.index });
      }
      out.push({ text: line, tokens, morse: parts.join(" / ") });
    }
    return { lines: out, sequence, words: wordIndex };
  }

  function toMorseText(line) {
    return buildOver([line]).lines[0].morse;
  }

  // -------------------------------------------------------------------------
  // CW tone player: every element is scheduled on the audio clock, so timing
  // stays exact at high speed, with 5 ms rise/fall to avoid key clicks.
  // -------------------------------------------------------------------------
  class CwPlayer {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.timers = [];
      this.playing = false;
    }

    async play(sequence, { wpm = 20, freq = 700, volume = 0.3, onWord, onProgress, onDone } = {}) {
      this.stop();
      if (!sequence.length) return;
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === "suspended") await this.ctx.resume();

      const ctx = this.ctx;
      const dit = 1.2 / wpm;          // seconds
      const ramp = 0.005;
      this.master = ctx.createGain();
      this.master.gain.value = volume;
      this.master.connect(ctx.destination);
      const start = ctx.currentTime + 0.08;
      let t = 0;
      const wordStarts = [];

      const tone = (dur) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.frequency.value = freq;
        osc.connect(g);
        g.connect(this.master);
        const t0 = start + t;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(1, t0 + ramp);
        g.gain.setValueAtTime(1, t0 + dur - ramp);
        g.gain.linearRampToValueAtTime(0, t0 + dur);
        osc.start(t0);
        osc.stop(t0 + dur + 0.01);
      };

      for (const item of sequence) {
        wordStarts.push({ word: item.word, at: t });
        if (item.prosign) {
          const s = item.morse[0];
          for (let k = 0; k < s.length; k++) {
            const d = s[k] === "-" ? 3 * dit : dit;
            tone(d);
            t += d;
            if (k < s.length - 1) t += dit;
          }
          t += 7 * dit;
        } else {
          for (const ch of item.morse) {
            for (let k = 0; k < ch.length; k++) {
              const d = ch[k] === "-" ? 3 * dit : dit;
              tone(d);
              t += d;
              if (k < ch.length - 1) t += dit;
            }
            t += 3 * dit;
          }
          t += 4 * dit;
        }
      }

      this.playing = true;
      const total = t;
      const lead = (start - ctx.currentTime) * 1000;
      for (const w of wordStarts) {
        this.timers.push(setTimeout(() => {
          if (onWord) onWord(w.word);
          if (onProgress) onProgress(total ? w.at / total : 1);
        }, lead + w.at * 1000));
      }
      this.timers.push(setTimeout(() => {
        this.playing = false;
        this.release();
        if (onProgress) onProgress(1);
        if (onDone) onDone();
      }, lead + total * 1000 + 50));
    }

    release() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
      if (this.master) {
        try { this.master.disconnect(); } catch (_) { /* already */ }
        this.master = null;
      }
    }

    stop() {
      const was = this.playing;
      this.playing = false;
      this.release();
      return was;
    }
  }

  // -------------------------------------------------------------------------
  // Speech: reads text aloud; callsigns can be spelled phonetically.
  // -------------------------------------------------------------------------
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function spokenText(text, { phonetic = true, callsigns = [] } = {}) {
    let result = String(text).replace(PROSIGN_RE_G, " ");
    if (phonetic) {
      for (const cs of callsigns) {
        if (!cs) continue;
        const spelled = [...cs.toUpperCase()].map((c) => PHONETIC[c] || c).join(" ");
        result = result.replace(new RegExp(`\\b${escapeRegExp(cs)}\\b`, "gi"), spelled);
      }
    }
    return result.replace(/\s+/g, " ").trim();
  }

  const Speech = {
    utterance: null,
    available() { return typeof window !== "undefined" && "speechSynthesis" in window; },
    speak(text, { rate = 1, phonetic = true, callsigns = [], onDone } = {}) {
      this.stop();
      if (!this.available()) { if (onDone) onDone(); return false; }
      const u = new SpeechSynthesisUtterance(spokenText(text, { phonetic, callsigns }));
      u.rate = rate;
      u.onend = u.onerror = () => { this.utterance = null; if (onDone) onDone(); };
      this.utterance = u;
      window.speechSynthesis.speak(u);
      return true;
    },
    stop() {
      const was = Boolean(this.utterance);
      if (this.available()) window.speechSynthesis.cancel();
      this.utterance = null;
      return was;
    }
  };

  const api = { MORSE, PROSIGNS, PROSIGN_INFO, PHONETIC, tokenizeLine, buildOver, toMorseText, CwPlayer, Speech, spokenText };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CWCore = api;
})(typeof self !== "undefined" ? self : globalThis);
