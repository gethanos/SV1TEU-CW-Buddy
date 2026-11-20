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
// Decoded text and signal estimates are published as events for reply.js.
(function () {
  "use strict";

  const ORT_BASE = new URL("vendor/ort/", document.baseURI).href;
  const MODEL_URL = new URL("models/deepcw-narrow.onnx", document.baseURI).href;
  const WORKER_URL = "ai-decoder-worker.js";
  const WORKLET_URL = "ai-capture-worklet.js";
  const AI_LOAD_TIMEOUT_MS = 45000;
  const TRANSCRIPT_TAIL = 1500;

  document.addEventListener("DOMContentLoaded", () => {
    const $ = (id) => document.getElementById(id);
    const startBtn = $("cwStartBtn");
    const statusEl = $("cwStatus");
    const overlay = $("cwDecodedOverlay");
    const canvas = $("cwWaterfall");
    const tuneInfo = $("cwTuneInfo");
    const chipFreq = $("chipFreq"), chipSnr = $("chipSnr"), chipLock = $("chipLock");
    const level = $("inputLevel");
    const classic = window.CWClassicDecoder;
    const app = window.CWBuddyApp;
    const splitter = window.CWSplitter;

    if (!startBtn || !statusEl || !overlay || !classic || !app) {
      console.warn("Decoder UI or engines missing; controller not started.");
      return;
    }

    // ---------------------------------------------------------------------
    // Engine preference
    // ---------------------------------------------------------------------
    let pref = app.engine();
    const ENGINE_LABEL = { auto: "Auto", ai: "AI", classic: "Classic" };

    document.addEventListener("cwbuddy:engine", (e) => {
      pref = e.detail.value;
      updateEngineChip();
      if (session) switchEngine(chooseEngine(), "engine changed");
    });
    document.querySelectorAll('input[name="profile"]').forEach((r) => r.addEventListener("change", () => {
      if (session && pref === "auto") {
        const want = chooseEngine();
        if (want !== session.engine) switchEngine(want, "QSO mode changed");
      }
    }));
    document.addEventListener("cwbuddy:mic", () => {
      if (session && !busy) restart();
    });

    function profile() {
      return (document.querySelector('input[name="profile"]:checked') || {}).value || "relaxed";
    }

    function chooseEngine() {
      if (pref === "classic") return "classic";
      if (pref === "ai") return "ai";
      if (aiBroken) return "classic";
      return profile() === "formal" ? "classic" : "ai";
    }

    function updateEngineChip() {
      const running = session && session.engine ? (session.engine === "ai" ? "AI" : "Classic") : null;
      app.setEngineChip(running && pref === "auto" ? `Auto · ${running}` : ENGINE_LABEL[pref]);
    }

    // ---------------------------------------------------------------------
    // UI helpers
    // ---------------------------------------------------------------------
    function setStatus(text, tone) {
      statusEl.textContent = text;
      statusEl.dataset.tone = tone || "idle";
    }

    function setButton(running) {
      startBtn.dataset.state = running ? "running" : "idle";
      startBtn.setAttribute("aria-pressed", running ? "true" : "false");
      startBtn.querySelector(".lbl").textContent = running ? "Stop decoding" : "Start decoding";
    }

    function setTuneInfo(text) {
      if (tuneInfo) tuneInfo.textContent = text;
    }

    function setChips({ freq = null, snrDb = null, lock = null } = {}) {
      chipFreq.hidden = freq == null;
      if (freq != null) chipFreq.textContent = `${Math.round(freq)} Hz`;
      chipSnr.hidden = snrDb == null;
      if (snrDb != null) chipSnr.textContent = `SNR ${Math.round(snrDb)} dB`;
      chipLock.hidden = lock == null;
      if (lock != null) chipLock.textContent = lock;
    }

    function publishText(text, engine) {
      document.dispatchEvent(new CustomEvent("cwbuddy:text", { detail: { text, engine } }));
    }

    function publishSignal(detail) {
      document.dispatchEvent(new CustomEvent("cwbuddy:signal", { detail }));
    }

    // AI text: run the word splitter, underline what the reply uses, dim the
    // characters that are not yet confirmed.
    let transcript = "";
    let pendingText = "";
    function aiText() {
      return splitter ? splitter.splitWords(transcript) : transcript;
    }
    function renderAiText() {
      const text = aiText();
      const tail = text.length > TRANSCRIPT_TAIL ? text.slice(-TRANSCRIPT_TAIL) : text;
      const mark = window.CWReplyHighlight || {};
      const marks = new Map();
      if (mark.call) marks.set(mark.call, "u-call");
      if (mark.report) marks.set(mark.report, "u-report");
      if (mark.name) marks.set(mark.name, "u-info");
      if (mark.qth) marks.set(mark.qth, "u-info");
      overlay.textContent = "";
      overlay.classList.remove("expanded");
      tail.split(/(\s+)/).forEach((part) => {
        if (marks.has(part)) {
          const u = document.createElement("span");
          u.className = marks.get(part);
          u.textContent = part;
          overlay.appendChild(u);
        } else {
          overlay.appendChild(document.createTextNode(part));
        }
      });
      if (pendingText) {
        const span = document.createElement("span");
        span.className = "cw-pending";
        span.textContent = pendingText;
        overlay.appendChild(span);
      }
      overlay.scrollTop = overlay.scrollHeight;
    }

    // ---------------------------------------------------------------------
    // Waterfall
    // ---------------------------------------------------------------------
    let manualHz = null;
    const waterfall = canvas && window.CWWaterfall
      ? new window.CWWaterfall(canvas, {
        minHz: 300, maxHz: 1500, onTune: handleTune,
        onLevel: (fraction) => { if (level) level.style.width = `${Math.round(fraction * 100)}%`; }
      })
      : null;

    function handleTune(hz) {
      manualHz = hz;
      if (waterfall) waterfall.setMarker("manual", hz);
      if (worker && session && session.engine === "ai") worker.postMessage({ type: "tune", hz });
      if (hz == null) setTuneInfo("Automatic tuning");
      else if (session && session.engine === "classic") setTuneInfo(`Tuning to ${hz} Hz applies to the AI engine`);
      else setTuneInfo(`Tuned to ${hz} Hz · double-click for automatic`);
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
        const changed = Boolean(m.committed) || m.pending !== pendingText;
        transcript += m.committed;
        if (transcript.length > 6000) transcript = transcript.slice(-4000);
        pendingText = m.pending;
        const t = m.tone;
        if (waterfall) waterfall.setMarker("target", t.targetHz);
        if (t.targetHz == null) {
          setStatus("Listening · AI · searching", "live");
          setChips();
          publishSignal({ engine: "ai", snrDb: null, locked: false });
        } else {
          setStatus("Listening · AI", "live");
          setChips({ freq: t.targetHz, snrDb: t.snrDb, lock: t.manual ? "Manual" : t.locked ? "Locked · auto" : "Holding" });
          publishSignal({ engine: "ai", snrDb: t.snrDb, locked: t.locked || t.manual, freq: t.targetHz });
        }
        if (m.committed) publishText(aiText(), "ai");
        if (changed) renderAiText();
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
          setStatus("AI error: " + m.message, "error");
        }
      } else if (m.type === "stopped") {
        transcript += m.committed || "";
        pendingText = "";
        renderAiText();
        publishText(aiText(), "ai");
        if (stopResolver) { stopResolver(); stopResolver = null; }
      }
    }

    // Classic engine reports its tone and keying state
    document.addEventListener("cwbuddy:classic-state", (e) => {
      if (!session || session.engine !== "classic") return;
      setChips({ freq: e.detail.freq, lock: e.detail.keyed ? "Signal" : "Listening" });
      publishSignal({ engine: "classic", snrDb: null, locked: false, freq: e.detail.freq });
    });

    // ---------------------------------------------------------------------
    // Session: mic stream + audio graph, and one running engine
    // ---------------------------------------------------------------------
    let session = null;   // { stream, ctx, source, engine, node, sink }
    let busy = false;

    async function startAi(s) {
      setStatus("Loading AI model…", "busy");
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
      pendingText = "";
      worker.postMessage({ type: "start" });
      if (manualHz != null) worker.postMessage({ type: "tune", hz: manualHz });
      setStatus("Listening · AI · searching", "live");
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
      if (kind === "ai") {
        try {
          await startAi(s);
          updateEngineChip();
          setTuneInfo(manualHz == null ? "Click a trace to tune · double-click for automatic" : `Tuned to ${manualHz} Hz · double-click for automatic`);
          return;
        } catch (err) {
          console.error("AI engine unavailable:", err);
          aiBroken = true;
          if (pref === "ai") throw err;
          note = "AI unavailable on this device";
          kind = "classic";
          s.engine = kind;
        }
      }
      overlay.textContent = "";
      await classic.start(s.stream);
      setStatus("Listening · Classic", "live");
      setChips();
      updateEngineChip();
      setTuneInfo(note ? `Classic engine: ${note}` : "Classic engine tunes itself; click-to-tune is for the AI engine");
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
        setStatus(err.message || "Engine error", "error");
      } finally {
        busy = false;
      }
    }

    async function start() {
      if (classic.isLikelyInAppBrowser) {
        classic.showOpenInBrowserHelp();
        return;
      }
      setStatus("Requesting microphone…", "busy");
      const micId = app.micId();
      const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: { ideal: 48000 } };
      if (micId) audio.deviceId = { exact: micId };
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio });
      } catch (err) {
        if (micId && err && err.name === "OverconstrainedError") {   // saved mic unplugged: use the default
          delete audio.deviceId;
          stream = await navigator.mediaDevices.getUserMedia({ audio });
        } else {
          throw err;
        }
      }
      document.dispatchEvent(new CustomEvent("cwbuddy:mic-granted"));
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
      setStatus("Stopped", "idle");
      setChips();
      if (level) level.style.width = "0%";
      updateEngineChip();
      setTuneInfo("");
    }

    async function restart() {
      busy = true;
      try { await stop(); await start(); }
      catch (err) { fail(err); }
      finally { busy = false; }
    }

    async function fail(err) {
      console.error("Decoder:", err);
      if (session) {
        const s = session;
        session = null;
        if (waterfall) waterfall.detach();
        s.stream.getTracks().forEach((t) => t.stop());
        try { await s.ctx.close(); } catch (_) { /* ignore */ }
      }
      setButton(false);
      setChips();
      updateEngineChip();
      if (classic.isLikelyInAppBrowser) classic.showOpenInBrowserHelp();
      else if (err && err.name === "NotAllowedError") setStatus("Microphone blocked: allow it in the browser's site settings", "error");
      else if (err && err.name === "NotFoundError") setStatus("No microphone found", "error");
      else setStatus((err && err.message) || "Microphone error", "error");
    }

    startBtn.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      try {
        if (session) await stop();
        else await start();
      } catch (err) {
        await fail(err);
      } finally {
        busy = false;
      }
    });

    // Decoded text: copy and clear
    $("decodedCopy").addEventListener("click", () => {
      const text = session && session.engine === "classic" ? overlay.textContent : aiText() + (pendingText || "");
      app.copy(text.trim(), $("decodedCopy"));
    });
    $("decodedClear").addEventListener("click", () => {
      transcript = "";
      pendingText = "";
      classic.clear();
      renderAiText();
      publishText("", session ? session.engine : "ai");
    });

    // Frequency scale labels next to the waterfall
    const scale = $("cwWaterfallScale");
    if (scale) {
      for (const hz of [1500, 1200, 900, 600, 300]) {
        const label = document.createElement("span");
        label.textContent = hz;
        label.style.top = `${((1500 - hz) / 1200) * 100}%`;
        scale.appendChild(label);
      }
    }

    updateEngineChip();
    setStatus("Ready to decode", "idle");
  });
})();
