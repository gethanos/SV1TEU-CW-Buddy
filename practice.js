/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// Practice screen: build an over from a QSO template and your station
// details, show it as text and Morse, and play it as CW or voice.
(function (root) {
  "use strict";

  const TEMPLATES = {
    // Mid-QSO "next overs": plain abbreviations
    short: [
      "{DX} DE {MY} KN",
      "{DX} DE {MY} UR RST {RST} {RST} KN",
      "TNX FER CALL {DX} DE {MY} KN"
    ],
    // Full QSO / friendly ragchew: plain abbreviations
    relaxed: [
      "CQ CQ CQ DE {MY} {MY} K",
      "{DX} DE {MY} KN",
      "{DX} DE {MY} UR RST {RST} {RST} KN",
      "NAME {NAME} {NAME}",
      "QTH {QTH} {QTH}",
      "RIG {RIG}",
      "TNX FER QSO 73 DE {MY} SK"
    ],
    // Formal / ITU procedure with prosigns
    formal: [
      "<KA> CQ CQ CQ DE {MY} {MY} {MY} <AR> K",
      "<KA> {DX} DE {MY} <KN>",
      "<KA> {DX} DE {MY} <BT> UR RST {RST} {RST}{INFO} <BT> HW CPY {DX} DE {MY} <KN>",
      "<KA> TNX FER QSO {DX} 73 DE {MY} <VA>"
    ]
  };

  const MODE_HINTS = {
    short: "Short overs for the middle of a QSO.",
    relaxed: "Full QSO or ragchew, with name, QTH and rig.",
    formal: "ITU procedure with prosigns such as <KA>, <BT> and <KN>.",
    custom: "Write your own template. Use {MY}, {DX}, {RST}, {NAME}, {QTH}, {RIG}."
  };

  // Pure generator (same rules as the original updateOutput in script.js).
  // Returns an array of lines, prosigns written as <XX>.
  function generateOver({ profile, template, my, dx, rst, name, qth, rig, hwcpy }) {
    const data = {
      MY: (my || "").toUpperCase().trim(),
      DX: (dx || "").toUpperCase().trim(),
      RST: (rst || "").trim().toUpperCase() || "5NN",
      NAME: (name || "").toUpperCase().trim(),
      QTH: (qth || "").toUpperCase().trim(),
      RIG: (rig || "").toUpperCase().trim()
    };
    if (!data.MY || !data.DX) return [];

    let info = "";
    if (data.NAME) info += ` <BT> NAME ${data.NAME} ${data.NAME}`;
    if (data.QTH) info += ` <BT> QTH ${data.QTH} ${data.QTH}`;
    if (data.RIG) info += ` <BT> RIG ${data.RIG}`;
    data.INFO = info;

    const isFormal = profile === "formal";
    let lines = String(template || "").split("\n").filter((l) => l.trim());

    lines = lines.map((line) => {
      for (const key in data) line = line.replaceAll(`{${key}}`, data[key]);
      return line.trim();
    });

    lines = lines.filter((line) => {
      if (!line) return false;
      if (line.includes("{") && line.includes("}")) return false;
      if (/^(NAME|QTH|RIG)\s*$/i.test(line)) return false;
      return true;
    });

    if (!isFormal) {
      const hasName = Boolean(data.NAME), hasQTH = Boolean(data.QTH), hasRIG = Boolean(data.RIG);
      if (hasName || hasQTH || hasRIG) {
        let patched = false;
        lines = lines.map((line) => {
          if (!patched && /UR RST/i.test(line) && /\bKN\b/i.test(line)) {
            let infoStr = "";
            if (hasName) infoStr += ` NAME ${data.NAME} ${data.NAME}`;
            if (hasQTH) infoStr += ` QTH ${data.QTH} ${data.QTH}`;
            if (hasRIG) infoStr += ` RIG ${data.RIG}`;
            patched = true;
            return line.replace(/\bKN\b/i, "").trim() + infoStr + " BK";
          }
          return line;
        });
        lines = lines.filter((line) =>
          !(hasName && /^NAME\s+\S/i.test(line)) &&
          !(hasQTH && /^QTH\s+\S/i.test(line)) &&
          !(hasRIG && /^RIG\s+\S/i.test(line))
        );
      }
    }

    if (!isFormal && hwcpy) {
      const hwLine = `HW CPY? ${data.DX} DE ${data.MY} KN`;
      const tnx = lines.findIndex((l) => l.trim().toUpperCase().startsWith("TNX"));
      if (tnx >= 0) lines.splice(tnx, 0, hwLine);
      else lines.push(hwLine);
    }

    return lines.filter((l) => l.trim() !== "");
  }

  // -------------------------------------------------------------------------
  // Shared rendering of an over: numbered lines, words as spans (for
  // playback highlighting), prosigns as chips, Morse under each line.
  // -------------------------------------------------------------------------
  function renderOver(listEl, over, { showMorse = true, highlightCalls = [] } = {}) {
    listEl.textContent = "";
    const calls = new Set(highlightCalls.filter(Boolean).map((c) => c.toUpperCase()));
    for (const line of over.lines) {
      const li = document.createElement("li");
      const text = document.createElement("div");
      text.className = "over-text";
      line.tokens.forEach((t, k) => {
        if (k) text.appendChild(document.createTextNode(" "));
        const span = document.createElement("span");
        span.dataset.word = t.index;
        if (t.type === "prosign") {
          span.className = "prosign";
          span.textContent = t.text.slice(1, -1);
          span.title = (root.CWCore.PROSIGN_INFO[t.text] || "") + " (sent as one character)";
        } else {
          span.textContent = t.text;
          if (calls.has(t.text)) span.className = "call";
        }
        text.appendChild(span);
      });
      li.appendChild(text);
      if (showMorse) {
        const morse = document.createElement("div");
        morse.className = "over-morse";
        morse.textContent = line.morse;
        li.appendChild(morse);
      }
      listEl.appendChild(li);
    }
  }

  function highlightWord(listEl, index) {
    const prev = listEl.querySelector(".word-now");
    if (prev) prev.classList.remove("word-now");
    if (index == null) return;
    const el = listEl.querySelector(`[data-word="${index}"]`);
    if (el) {
      el.classList.add("word-now");
      el.scrollIntoView({ block: "nearest" });
    }
  }

  function overAsText(over) {
    return over.lines.map((l) => l.text).join("\n");
  }

  function overAsMorse(over) {
    return over.lines.map((l) => l.morse).join("\n");
  }

  // -------------------------------------------------------------------------
  // Practice screen wiring
  // -------------------------------------------------------------------------
  function initPractice() {
    const $ = (id) => document.getElementById(id);
    const core = root.CWCore;
    const app = root.CWBuddyApp;
    const els = {
      my: $("myCall"), dx: $("dxCall"), rst: $("myRST"), name: $("myName"), qth: $("myQTH"), rig: $("myRIG"),
      hwcpy: $("hwcpy"), template: $("qsoText"), modeHint: $("modeHint"), list: $("overLines"),
      empty: $("overEmpty"), showMorse: $("overShowMorse"), copy: $("overCopy"), copyMorse: $("overCopyMorse"),
      prosigns: $("prosignBar")
    };
    if (!els.my || !els.list) return;

    let over = { lines: [], sequence: [], words: 0 };
    const profile = () => (document.querySelector('input[name="profile"]:checked') || {}).value || "relaxed";

    function loadTemplate() {
      const p = profile();
      els.template.value = p === "custom" ? (app.get("customTemplate") || "") : TEMPLATES[p].join("\n");
      els.template.readOnly = false;
      els.modeHint.textContent = MODE_HINTS[p];
      update();
    }

    function update() {
      const lines = generateOver({
        profile: profile(), template: els.template.value,
        my: els.my.value, dx: els.dx.value, rst: els.rst.value,
        name: els.name.value, qth: els.qth.value, rig: els.rig.value, hwcpy: els.hwcpy.checked
      });
      over = core.buildOver(lines);
      els.empty.hidden = lines.length > 0;
      els.list.hidden = lines.length === 0;
      renderOver(els.list, over, { showMorse: els.showMorse.checked, highlightCalls: [els.my.value, els.dx.value] });
      if (profile() === "custom") app.set("customTemplate", els.template.value);
      document.dispatchEvent(new CustomEvent("cwbuddy:station-changed"));
    }

    // Prosign chips: insert at the cursor in the template
    for (const [token, info] of Object.entries(core.PROSIGN_INFO)) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip-btn";
      b.textContent = token.slice(1, -1);
      b.title = info;
      b.setAttribute("aria-label", `Insert prosign ${token.slice(1, -1)}: ${info}`);
      b.addEventListener("click", () => {
        const ta = els.template;
        const start = ta.selectionStart, end = ta.selectionEnd, val = ta.value;
        const before = start > 0 && val[start - 1] !== " " && val[start - 1] !== "\n" ? " " : "";
        const after = end < val.length && val[end] !== " " ? " " : "";
        ta.value = val.slice(0, start) + before + token + after + val.slice(end);
        const pos = start + before.length + token.length + after.length;
        ta.setSelectionRange(pos, pos);
        ta.focus();
        update();
      });
      els.prosigns.appendChild(b);
    }

    document.querySelectorAll('input[name="profile"]').forEach((r) => r.addEventListener("change", () => {
      app.set("profile", profile());
      loadTemplate();
    }));
    for (const el of [els.my, els.dx, els.rst, els.name, els.qth, els.rig, els.template]) {
      el.addEventListener("input", () => {
        if (el !== els.template && el !== els.dx && el !== els.rst) app.set(el.id, el.value);
        update();
      });
    }
    els.hwcpy.addEventListener("change", () => { app.set("hwcpy", els.hwcpy.checked); update(); });
    els.showMorse.addEventListener("change", () => { app.set("overShowMorse", els.showMorse.checked); update(); });

    els.copy.addEventListener("click", () => app.copy(overAsText(over), els.copy));
    els.copyMorse.addEventListener("click", () => app.copy(overAsMorse(over), els.copyMorse));

    // Player bar
    app.bindPlayer({
      prefix: "practice",
      getOver: () => over,
      getCalls: () => [els.my.value, els.dx.value],
      listEl: els.list
    });

    // Restore saved values
    for (const el of [els.my, els.name, els.qth, els.rig]) {
      const v = app.get(el.id);
      if (v != null) el.value = v;
    }
    const savedHw = app.get("hwcpy");
    if (savedHw != null) els.hwcpy.checked = savedHw;
    const savedMorse = app.get("overShowMorse");
    if (savedMorse != null) els.showMorse.checked = savedMorse;
    const savedProfile = app.get("profile");
    if (savedProfile) {
      const r = document.querySelector(`input[name="profile"][value="${savedProfile}"]`);
      if (r) r.checked = true;
    }
    loadTemplate();
  }

  const api = { TEMPLATES, generateOver, renderOver, highlightWord, overAsText, overAsMorse, initPractice };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CWPractice = api;
})(typeof self !== "undefined" ? self : globalThis);
