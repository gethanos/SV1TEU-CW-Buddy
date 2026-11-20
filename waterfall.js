/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.

Colour map and column rendering approach adapted from web-deep-cw-decoder,
Copyright (c) 2026 e04, MIT License: see NOTICE.
*/

// Scrolling waterfall: time runs right to left, frequency is vertical.
// Click to tune, double-click to return to automatic tuning.
(function () {
  "use strict";

  const FFT_SIZE = 4096;
  const DYNAMIC_RANGE_DB = 40;   // colours span noise floor .. +40 dB
  const FLOOR_OFFSET_DB = 3;     // draw noise slightly above black
  const FLOOR_EMA = 0.05;
  const PX_PER_SECOND = 40;

  function hslToRgb(h, s, l) {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
  }

  function buildLut() {
    const lut = new Uint8ClampedArray(256 * 3);
    for (let v = 0; v < 256; v++) {
      const t = Math.pow(v / 255, 2.2);
      const [r, g, b] = hslToRgb((220 * (1 - t)) / 360, 1, 0.15 + 0.75 * t);
      lut[v * 3] = r; lut[v * 3 + 1] = g; lut[v * 3 + 2] = b;
    }
    return lut;
  }

  class Waterfall {
    constructor(canvas, { minHz = 300, maxHz = 1500, onTune = null, onLevel = null } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.minHz = minHz;
      this.maxHz = maxHz;
      this.onTune = onTune;
      this.onLevel = onLevel;
      this.lut = buildLut();
      this.markers = { target: null, manual: null };
      this.floorDb = null;
      this.raf = null;
      this.analyser = null;
      this.accum = 0;
      this.lastTime = 0;

      canvas.addEventListener("click", (e) => {
        if (!this.onTune) return;
        const rect = canvas.getBoundingClientRect();
        const fraction = (e.clientY - rect.top) / rect.height;
        if (!Number.isFinite(fraction)) return;
        this.onTune(this.yToHz(Math.max(0, Math.min(1, fraction))));
      });
      canvas.addEventListener("dblclick", (e) => {
        e.preventDefault();
        if (this.onTune) this.onTune(null);
      });
      this.resize();
      window.addEventListener("resize", () => this.resize());
    }

    yToHz(fraction) {
      return Math.round(this.maxHz - fraction * (this.maxHz - this.minHz));
    }

    hzToY(hz) {
      return ((this.maxHz - hz) / (this.maxHz - this.minHz)) * this.canvas.height;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
      if (w === this.canvas.width && h === this.canvas.height && this.column) return;
      this.canvas.width = w;
      this.canvas.height = h;
      this.column = this.ctx.createImageData(1, h);
      this.ctx.fillStyle = "#070B10";
      this.ctx.fillRect(0, 0, w, h);
    }

    attach(audioContext, sourceNode) {
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.analyser.smoothingTimeConstant = 0;
      this.analyser.minDecibels = -120;
      this.analyser.maxDecibels = 0;
      sourceNode.connect(this.analyser);
      this.data = new Float32Array(this.analyser.frequencyBinCount);
      this.timeData = new Float32Array(this.analyser.fftSize);
      this.binHz = audioContext.sampleRate / FFT_SIZE;
      this.rowToBin = null;
      this.lastTime = performance.now();
      this.accum = 0;
      this.floorDb = null;
      const loop = (now) => {
        this.raf = requestAnimationFrame(loop);
        this.draw(now);
      };
      this.raf = requestAnimationFrame(loop);
    }

    detach() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      if (this.analyser) this.analyser.disconnect();
      this.analyser = null;
    }

    setMarker(kind, hz) {
      this.markers[kind] = hz;
    }

    buildRowMap() {
      const h = this.canvas.height;
      this.rowToBin = new Uint16Array(h);
      for (let y = 0; y < h; y++) {
        const hz = this.maxHz - (y / (h - 1)) * (this.maxHz - this.minHz);
        this.rowToBin[y] = Math.min(this.data.length - 1, Math.round(hz / this.binHz));
      }
      this.rowMapHeight = h;
    }

    draw(now) {
      if (!this.analyser || document.hidden) { this.lastTime = now; return; }
      if (this.onLevel) {
        // Input level for the meter: RMS in dBFS, -60..-6 dB mapped to 0..1
        this.analyser.getFloatTimeDomainData(this.timeData);
        let sum = 0;
        for (let i = 0; i < this.timeData.length; i++) sum += this.timeData[i] * this.timeData[i];
        const db = 10 * Math.log10(sum / this.timeData.length + 1e-12);
        this.onLevel(Math.max(0, Math.min(1, (db + 60) / 54)));
      }
      this.accum += ((now - this.lastTime) / 1000) * PX_PER_SECOND * (this.canvas.width / Math.max(1, this.canvas.clientWidth));
      this.lastTime = now;
      // Clamp: after a long gap (tab in background) draw at most one screen
      const cols = Math.min(Math.floor(this.accum), this.canvas.width);
      if (cols < 1) return;
      this.accum = 0;

      if (!this.rowToBin || this.rowMapHeight !== this.canvas.height) this.buildRowMap();
      this.analyser.getFloatFrequencyData(this.data);

      // Noise floor: median of the displayed band, smoothed over time
      const lo = Math.round(this.minHz / this.binHz), hi = Math.round(this.maxHz / this.binHz);
      const band = Array.from(this.data.subarray(lo, hi + 1)).filter(Number.isFinite).sort((a, b) => a - b);
      if (band.length) {
        const median = band[band.length >> 1];
        this.floorDb = this.floorDb == null ? median : this.floorDb + FLOOR_EMA * (median - this.floorDb);
      }
      const floor = (this.floorDb ?? -100) + FLOOR_OFFSET_DB;

      const { width: w, height: h } = this.canvas;
      const px = this.column.data;
      for (let y = 0; y < h; y++) {
        const db = this.data[this.rowToBin[y]];
        const v = Math.max(0, Math.min(255, Math.round(((db - floor) / DYNAMIC_RANGE_DB) * 255)));
        const o = y * 4;
        px[o] = this.lut[v * 3]; px[o + 1] = this.lut[v * 3 + 1]; px[o + 2] = this.lut[v * 3 + 2]; px[o + 3] = 255;
      }

      // Scroll left and paint the new column(s) on the right
      this.ctx.drawImage(this.canvas, cols, 0, w - cols, h, 0, 0, w - cols, h);
      for (let c = 0; c < cols; c++) this.ctx.putImageData(this.column, w - cols + c, 0);

      // Markers (drawn on the newest columns only, so they form a trace)
      const mark = (hz, colour) => {
        if (hz == null) return;
        const y = Math.round(this.hzToY(hz));
        this.ctx.fillStyle = colour;
        this.ctx.fillRect(w - cols, y - 1, cols, 2);
      };
      mark(this.markers.target, "rgba(0, 255, 200, 0.9)");
      mark(this.markers.manual, "rgba(255, 210, 0, 0.95)");
    }
  }

  window.CWWaterfall = Waterfall;
})();
