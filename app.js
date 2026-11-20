/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// App shell: screens, settings dialog, saved preferences, and one shared
// player for the Practice over and Your reply.
(function (root) {
  "use strict";

  const PREFIX = "cwbuddy.";
  const $ = (id) => document.getElementById(id);

  const store = {
    get(key) {
      try {
        const v = localStorage.getItem(PREFIX + key);
        return v == null ? null : JSON.parse(v);
      } catch (_) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (_) { /* storage blocked */ }
    }
  };

  function announce(text) {
    const live = $("liveStatus");
    if (!live) return;
    live.textContent = "";
    setTimeout(() => { live.textContent = text; }, 30);
  }

  async function copy(text, button) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (button) {
        button.classList.add("is-done");
        setTimeout(() => button.classList.remove("is-done"), 1200);
      }
      announce("Copied");
    } catch (_) {
      announce("Copy failed: your browser blocked clipboard access");
    }
  }

  // -------------------------------------------------------------------------
  // Screens
  // -------------------------------------------------------------------------
  function showView(name, focusId) {
    document.querySelectorAll("[data-view-panel]").forEach((p) => { p.hidden = p.dataset.viewPanel !== name; });
    document.querySelectorAll("[data-view]").forEach((b) => {
      if (b.dataset.view === name) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    store.set("view", name);
    if (focusId && $(focusId)) {
      const details = $(focusId).closest("details");
      if (details) details.open = true;
      $(focusId).focus();
    }
  }

  function showPane(name) {
    const view = $("view-decode");
    if (!view) return;
    view.dataset.pane = name;
    document.querySelectorAll("[data-pane]").forEach((b) => {
      if (b.dataset.pane === name) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
  }

  // -------------------------------------------------------------------------
  // Engine choice (two radio groups: control bar and settings dialog)
  // -------------------------------------------------------------------------
  function setEngine(value, { silent = false } = {}) {
    for (const name of ["engine", "engineSheet"]) {
      const r = document.querySelector(`input[name="${name}"][value="${value}"]`);
      if (r) r.checked = true;
    }
    store.set("engine", value);
    if (!silent) document.dispatchEvent(new CustomEvent("cwbuddy:engine", { detail: { value } }));
  }

  function setEngineChip(text) {
    const label = $("engineChipLabel");
    if (label) label.textContent = text;
  }

  async function refreshMicList() {
    const sel = $("micSelect");
    if (!sel || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    const saved = store.get("micId") || "";
    let devices = [];
    try { devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput"); } catch (_) { /* ignore */ }
    sel.textContent = "";
    const def = document.createElement("option");
    def.value = "";
    def.textContent = "Default microphone";
    sel.appendChild(def);
    devices.forEach((d, i) => {
      if (!d.deviceId || d.deviceId === "default") return;
      const o = document.createElement("option");
      o.value = d.deviceId;
      o.textContent = d.label || `Microphone ${i + 1}`;
      sel.appendChild(o);
    });
    sel.value = [...sel.options].some((o) => o.value === saved) ? saved : "";
    const hint = $("micHint");
    if (hint) hint.hidden = devices.some((d) => d.label);
  }

  // -------------------------------------------------------------------------
  // Shared player (CW tone or voice), used by Practice and Your reply
  // -------------------------------------------------------------------------
  const player = { cw: null, active: null, finishers: {} };

  function settings() {
    return {
      wpm: Number(($("cwWpm") || {}).value) || 20,
      tone: Number(($("cwTone") || {}).value) || 700,
      rate: Number(($("voiceRate") || {}).value) || 1,
      phonetic: ($("voicePhonetic") || {}).checked !== false
    };
  }

  function stopAll() {
    if (player.cw) player.cw.stop();
    root.CWCore.Speech.stop();
    const fin = player.finishers[player.active];
    player.active = null;
    if (fin) fin();
  }

  function bindPlayer({ prefix, getOver, getCalls, listEl }) {
    const play = $(`${prefix}Play`), stop = $(`${prefix}Stop`), voice = $(`${prefix}Voice`);
    const progress = $(`${prefix}Progress`);
    const practice = root.CWPractice;
    const mode = () => (document.querySelector(`input[name="${prefix}Mode"]:checked`) || {}).value || "cw";

    // state: "idle" | "cw" | "voice". With a separate Voice button (reply),
    // Play is CW only; otherwise Play covers both modes (practice).
    function setUi(state) {
      const onFor = { play: voice ? state === "cw" : state !== "idle", voice: state === "voice" };
      for (const [btn, on] of [[play, onFor.play], [voice, onFor.voice]]) {
        if (!btn) continue;
        btn.dataset.state = on ? "playing" : "idle";
        const lbl = btn.querySelector(".lbl");
        if (lbl) lbl.textContent = on ? btn.dataset.labelStop : btn.dataset.labelPlay;
        btn.setAttribute("aria-label", on ? btn.dataset.labelStop : btn.dataset.labelPlay);
      }
      if (stop) stop.disabled = state === "idle";
      if (progress && state === "idle") progress.style.width = "0%";
    }

    function finish() {
      setUi("idle");
      practice.highlightWord(listEl, null);
    }
    player.finishers[prefix] = finish;

    async function startCw() {
      const over = getOver();
      if (!over.sequence.length) { announce("Nothing to play yet"); return; }
      stopAll();
      if (!player.cw) player.cw = new root.CWCore.CwPlayer();
      player.active = prefix;
      setUi("cw");
      const s = settings();
      await player.cw.play(over.sequence, {
        wpm: s.wpm, freq: s.tone,
        onWord: (i) => practice.highlightWord(listEl, i),
        onProgress: (f) => { if (progress) progress.style.width = `${Math.round(f * 100)}%`; },
        onDone: () => { if (player.active === prefix) { player.active = null; finish(); } }
      });
    }

    function startVoice() {
      const over = getOver();
      if (!over.lines.length) { announce("Nothing to play yet"); return; }
      stopAll();
      const s = settings();
      player.active = prefix;
      setUi("voice");
      const ok = root.CWCore.Speech.speak(practice.overAsText(over), {
        rate: s.rate, phonetic: s.phonetic, callsigns: getCalls(),
        onDone: () => { if (player.active === prefix) { player.active = null; finish(); } }
      });
      if (!ok) { player.active = null; finish(); announce("Speech is not available in this browser"); }
    }

    if (play) play.addEventListener("click", () => {
      if (player.active === prefix && play.dataset.state === "playing") { stopAll(); return; }
      if (!voice && mode() === "voice") startVoice();
      else startCw();
    });
    if (voice) voice.addEventListener("click", () => {
      if (player.active === prefix && voice.dataset.state === "playing") { stopAll(); return; }
      startVoice();
    });
    if (stop) stop.addEventListener("click", stopAll);
    setUi("idle");
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------
  function initApp() {
    // Screens
    document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault();
      showView(b.dataset.view);
    }));
    document.querySelectorAll("[data-pane]").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.pane)));
    showView(store.get("view") === "practice" ? "practice" : "decode");
    showPane("heard");

    // Settings dialog
    // (fallbacks for browsers without <dialog> support)
    const dialog = $("settingsDialog");
    const open = () => { refreshMicList(); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute("open", ""); };
    const close = () => { if (dialog.close) dialog.close(); else dialog.removeAttribute("open"); };
    for (const id of ["settingsBtn", "engineChip"]) if ($(id)) $(id).addEventListener("click", open);
    $("settingsClose").addEventListener("click", close);
    dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && dialog.hasAttribute("open") && !dialog.close) close(); });

    // Engine
    for (const name of ["engine", "engineSheet"]) {
      document.querySelectorAll(`input[name="${name}"]`).forEach((r) => r.addEventListener("change", () => setEngine(r.value)));
    }
    setEngine(store.get("engine") || "auto", { silent: true });

    // Microphone
    $("micSelect").addEventListener("change", (e) => {
      store.set("micId", e.target.value);
      document.dispatchEvent(new CustomEvent("cwbuddy:mic", { detail: { deviceId: e.target.value } }));
    });
    document.addEventListener("cwbuddy:mic-granted", refreshMicList);

    // Speed, tone, voice (saved)
    const ranges = [["cwWpm", "cwWpmValue", (v) => `${v} WPM`], ["cwTone", "cwToneValue", (v) => `${v} Hz`], ["voiceRate", "voiceRateValue", (v) => `${Number(v).toFixed(1)}×`]];
    for (const [id, out, fmt] of ranges) {
      const el = $(id);
      const saved = store.get(id);
      if (saved != null) el.value = saved;
      const show = () => { $(out).textContent = fmt(el.value); };
      el.addEventListener("input", () => { store.set(id, el.value); show(); syncReplyWpm(); });
      show();
    }
    const replyWpm = $("replyWpm");
    function syncReplyWpm() { if (replyWpm) replyWpm.value = String(Math.round($("cwWpm").value / 1)); }
    if (replyWpm) {
      for (let w = 5; w <= 40; w++) {
        const o = document.createElement("option");
        o.value = String(w);
        o.textContent = `${w} WPM`;
        replyWpm.appendChild(o);
      }
      replyWpm.addEventListener("change", () => {
        $("cwWpm").value = replyWpm.value;
        $("cwWpm").dispatchEvent(new Event("input"));
      });
      syncReplyWpm();
    }
    const phon = $("voicePhonetic");
    const savedPhon = store.get("voicePhonetic");
    if (savedPhon != null) phon.checked = savedPhon;
    phon.addEventListener("change", () => store.set("voicePhonetic", phon.checked));

    const showAll = $("showAllDecoders");
    if (showAll) {
      const saved = store.get("showAllDecoders");
      if (saved != null) showAll.checked = saved;
      showAll.addEventListener("change", () => store.set("showAllDecoders", showAll.checked));
    }

    window.addEventListener("beforeunload", stopAll);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopAll(); });
  }

  root.CWBuddyApp = {
    get: store.get, set: store.set, copy, announce, showView, showPane,
    setEngine, setEngineChip, bindPlayer, stopAll, refreshMicList,
    engine: () => store.get("engine") || "auto",
    micId: () => store.get("micId") || ""
  };

  document.addEventListener("DOMContentLoaded", () => {
    initApp();
    if (root.CWPractice) root.CWPractice.initPractice();
    if (root.CWReply) root.CWReply.initReply();
  });
})(typeof self !== "undefined" ? self : globalThis);
