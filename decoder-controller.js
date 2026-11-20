/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// Owns the Decode button, the microphone stream and the waterfall, and runs
// one of two engines:
//   AI     : DeepCW narrow neural model in a Web Worker (default)
//   Classic: the multi-speed timing decoder in cw-decoder.js
// "Auto" uses AI, except Classic for Formal mode (the AI model cannot
// represent prosigns), and falls back to Classic if AI fails or lags.
(function () {
  "use strict";

  const ORT_BASE = new URL("vendor/ort/", document.baseURI).href;
  const MODEL_URL = new URL("models/deepcw-narrow.onnx", document.baseURI).href;
  const WORKER_URL = "ai-decoder-worker.js";
  const WORKLET_URL = "ai-capture-worklet.js";
  const AI_LOAD_TIMEOUT_MS = 45000;
  const TRANSCRIPT_TAIL = 400;
  const PREF_KEY = "cwBuddyEngine";

  document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("cwStartBtn");
    const statusEl = document.getElementById("cwStatus");
    const overlay = document.getElementById("cwDecodedOverlay");
    const engineSel = document.getElementById("cwEngine");
    const canvas = document.getElementById("cwWaterfall");
    const tuneInfo = document.getElementById("cwTuneInfo");
    const profileSel = document.getElementById("profile");
    const classic = window.CWClassicDecoder;

    if (!startBtn || !statusEl || !overlay || !classic) {
      console.warn("Decoder UI or classic engine missing; controller not started.");
      return;
    }

    // ---------------------------------------------------------------------
    // Preferences
    // ---------------------------------------------------------------------
    let pref = "auto";
    try { pref = localStorage.getItem(PREF_KEY) || "auto"; } catch (_) { /* storage blocked */ }
    if (engineSel) {
      engineSel.value = pref;
      engineSel.addEventListener("change", () => {
        pref = engineSel.value;
        try { localStorage.setItem(PREF_KEY, pref); } catch (_) { /* ignore */ }
        if (session) switchEngine(chooseEngine(), "engine changed");
      });
    }
    if (profileSel) {
      profileSel.addEventListener("change", () => {
        if (session && pref === "auto") {
          const want = chooseEngine();
          if (want !== session.engine) switchEngine(want, "QSO mode changed");
        }
      });
    }

    function chooseEngine() {
      if (pref === "classic") return "classic";
      if (pref === "ai") return "ai";
      if (aiBroken) return "classic";
      return profileSel && profileSel.value === "formal" ? "classic" : "ai";
    }

    // ---------------------------------------------------------------------
    // UI helpers
    // ---------------------------------------------------------------------
    function setStatus(text, colour) {
      statusEl.textContent = text;
      statusEl.style.color = colour || "#aaa";
    }

    function setButton(running) {
      startBtn.classList.toggle("active", running);
      startBtn.innerHTML = running
        ? '<i class="fas fa-microphone-slash"></i> Stop'
        : '<i class="fas fa-microphone"></i> Decode';
    }

    function setTuneInfo(text) {
      if (tuneInfo) tuneInfo.textContent = text;
    }

    let transcript = "";
    let pendingText = "";
    function renderAiText() {
      overlay.textContent = "";
      const tail = transcript.length > TRANSCRIPT_TAIL ? transcript.slice(-TRANSCRIPT_TAIL) : transcript;
      overlay.appendChild(document.createTextNode(tail));
      if (pendingText) {
        const span = document.createElement("span");
        span.className = "cw-pending";
        span.textContent = pendingText;
        overlay.appendChild(span);
      }
      overlay.scrollLeft = overlay.scrollWidth;
    }

    // ---------------------------------------------------------------------
    // Waterfall
    // ---------------------------------------------------------------------
    let manualHz = null;
    const waterfall = canvas && window.CWWaterfall
      ? new window.CWWaterfall(canvas, { minHz: 300, maxHz: 1500, onTune: handleTune })
      : null;

    function handleTune(hz) {
      manualHz = hz;
      if (waterfall) waterfall.setMarker("manual", hz);
      if (worker && session && session.engine === "ai") worker.postMessage({ type: "tune", hz });
      if (hz == null) setTuneInfo("Auto tuning");
      else if (session && session.engine === "classic") setTuneInfo(`Tuning applies to the AI engine (${hz} Hz)`);
      else setTuneInfo(`Manual: ${hz} Hz · double-click for auto`);
    }

    // ---------------------------------------------------------------------
    // AI worker (created once, on first use)
    // ---------------------------------------------------------------------
    let worker = null;
    let workerReady = null;   // Promise
    let aiBroken = false;

    function ensureWorker() {
      if (workerReady) return workerReady;
      workerReady = new Promise((resolve, reject) => {
        try {
          worker = new Worker(WORKER_URL);
        } catch (err) {
          reject(err);
          return;
        }
        const timer = setTimeout(() => reject(new Error("AI model load timed out")), AI_LOAD_TIMEOUT_MS);
        worker.onmessage = (e) => {
          const m = e.data;
          if (m.type === "ready") { clearTimeout(timer); resolve(); }
          else if (m.type === "error" && m.stage === "init") { clearTimeout(timer); reject(new Error(m.message)); }
          else onWorkerMessage(m);
        };
        worker.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || "worker error")); };
        worker.postMessage({ type: "init", ortBase: ORT_BASE, modelUrl: MODEL_URL });
      });
      workerReady.catch(() => {
        aiBroken = true;
        if (worker) worker.terminate();
        worker = null;
      });
      return workerReady;
    }

    let stopResolver = null;
    function onWorkerMessage(m) {
      if (m.type === "step") {
        if (!session || session.engine !== "ai") return;
        transcript += m.committed;
        pendingText = m.pending;
        renderAiText();
        const t = m.tone;
        if (waterfall) waterfall.setMarker("target", t.targetHz);
        if (t.targetHz == null) {
          setStatus("🔵 AI · searching", "#7fb2ff");
        } else {
          const mode = t.manual ? "manual" : t.locked ? "locked" : "hold";
          setStatus(`🔵 AI ${Math.round(t.targetHz)} Hz · ${Math.round(t.snrDb)} dB · ${mode}`, t.locked ? "#0f0" : "#ffb000");
        }
      } else if (m.type === "slow") {
        if (session && session.engine === "ai" && pref === "auto") {
          aiBroken = true;
          switchEngine("classic", "AI too slow on this device");
        }
      } else if (m.type === "error") {
        console.error("AI decoder:", m.stage, m.message);
        if (session && session.engine === "ai" && pref === "auto") {
          aiBroken = true;
          switchEngine("classic", "AI error");
        } else {
          setStatus("AI error: " + m.message, "#f44");
        }
      } else if (m.type === "stopped") {
        transcript += m.committed || "";
        pendingText = "";
        renderAiText(); // final flush; a following Classic engine repaints within 0.5 s
        if (stopResolver) { stopResolver(); stopResolver = null; }
      }
    }

    // ---------------------------------------------------------------------
    // Session: mic stream + audio graph, and one running engine
    // ---------------------------------------------------------------------
    let session = null;   // { stream, ctx, source, engine, node, sink }
    let busy = false;

    async function startAi(s) {
      setStatus("Loading AI model…", "#aaa");
      await ensureWorker();
      if (!s.workletLoaded) {
        await s.ctx.audioWorklet.addModule(WORKLET_URL);
        s.workletLoaded = true;
      }
      s.node = new AudioWorkletNode(s.ctx, "cw-capture", { numberOfOutputs: 1 });
      // Keep the node pulled by the graph without making it audible
      s.sink = s.ctx.createGain();
      s.sink.gain.value = 0;
      s.source.connect(s.node);
      s.node.connect(s.sink);
      s.sink.connect(s.ctx.destination);
      s.node.port.onmessage = (e) => {
        if (worker) worker.postMessage({ type: "audio", samples: e.data }, [e.data.buffer]);
      };
      transcript = "";
      pendingText = "";
      worker.postMessage({ type: "start" });
      if (manualHz != null) worker.postMessage({ type: "tune", hz: manualHz });
      setStatus("🔵 AI · searching", "#7fb2ff");
      renderAiText();
    }

    async function stopAi(s) {
      if (s.node) {
        s.node.port.postMessage("stop");
        s.node.port.onmessage = null;
        try { s.source.disconnect(s.node); } catch (_) { /* already */ }
        s.node.disconnect();
        if (s.sink) s.sink.disconnect();
        s.node = null;
        s.sink = null;
      }
      if (worker) {
        const done = new Promise((r) => { stopResolver = r; });
        worker.postMessage({ type: "stop" });
        await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
      }
      if (waterfall) waterfall.setMarker("target", null);
    }

    async function startEngine(s, kind, note) {
      s.engine = kind;
      if (engineSel) engineSel.title = `Running: ${kind === "ai" ? "AI" : "Classic"}`;
      if (kind === "ai") {
        try {
          await startAi(s);
          setTuneInfo(manualHz == null ? "Auto tuning · click waterfall to pick a signal" : `Manual: ${manualHz} Hz · double-click for auto`);
          return;
        } catch (err) {
          console.error("AI engine unavailable:", err);
          aiBroken = true;
          if (pref === "ai") throw err;
          note = "AI unavailable";
          kind = "classic";
          s.engine = kind;
        }
      }
      overlay.textContent = "";
      await classic.start(s.stream);
      if (note) setTuneInfo(`Classic engine (${note})`);
      else setTuneInfo("Classic engine");
    }

    async function stopEngine(s) {
      if (s.engine === "ai") await stopAi(s);
      else if (s.engine === "classic") classic.stop();
      s.engine = null;
    }

    async function switchEngine(kind, note) {
      if (busy || !session || session.engine === kind) return;
      busy = true;
      try {
        await stopEngine(session);
        await startEngine(session, kind, note);
      } catch (err) {
        setStatus(err.message || "engine error", "#f44");
      } finally {
        busy = false;
      }
    }

    async function start() {
      if (classic.isLikelyInAppBrowser) {
        classic.showOpenInBrowserHelp();
        return;
      }
      setStatus("Requesting microphone…", "#aaa");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: { ideal: 48000 }
        }
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      session = { stream, ctx, source, engine: null, workletLoaded: false };
      if (waterfall) {
        waterfall.resize();
        waterfall.attach(ctx, source);
        waterfall.setMarker("manual", manualHz);
      }
      setButton(true);
      await startEngine(session, chooseEngine());
    }

    async function stop() {
      const s = session;
      if (!s) return;
      await stopEngine(s);
      session = null;
      if (waterfall) waterfall.detach();
      s.stream.getTracks().forEach((t) => t.stop());
      try { await s.ctx.close(); } catch (_) { /* ignore */ }
      setButton(false);
      setStatus("stopped", "#aaa");
      setTuneInfo("");
    }

    startBtn.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      try {
        if (session) await stop();
        else await start();
      } catch (err) {
        console.error("Decoder:", err);
        if (session) {
          const s = session;
          session = null;
          if (waterfall) waterfall.detach();
          s.stream.getTracks().forEach((t) => t.stop());
          try { await s.ctx.close(); } catch (_) { /* ignore */ }
        }
        setButton(false);
        if (classic.isLikelyInAppBrowser) classic.showOpenInBrowserHelp();
        else setStatus(err.message || "microphone error", "#f44");
      } finally {
        busy = false;
      }
    });

    // Frequency scale labels next to the waterfall
    const scale = document.getElementById("cwWaterfallScale");
    if (scale) {
      for (const hz of [1500, 1200, 900, 600, 300]) {
        const label = document.createElement("span");
        label.textContent = hz;
        label.style.top = `${((1500 - hz) / 1200) * 100}%`;
        scale.appendChild(label);
      }
    }
  });
})();
