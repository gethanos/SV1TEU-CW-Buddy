/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// Your reply: reads the decoded text, works out who is calling and what
// they sent, and builds the over to send back, as text and Morse.
(function (root) {
  "use strict";

  const CALL = /^(?:[A-Z0-9]{1,3}\/)?(?:[A-Z]{1,2}|[A-Z][0-9]|[0-9][A-Z])[0-9][A-Z]{1,4}(?:\/[A-Z0-9]{1,4})?$/;
  const REPORT = /^[1-5][1-9NT][1-9NT]$/;
  const CLOSING = new Set(["73", "SK", "<SK>", "VA", "TU", "GL", "CUL", "GB"]);
  const NOT_A_NAME = new Set(["IS", "HR", "HERE", "ES", "AND", "UR", "QTH", "RST", "NAME", "OP", "DE", "KN", "BK", "K"]);

  // -------------------------------------------------------------------------
  // Parse the decoded text. Returns null if nobody to reply to yet.
  // -------------------------------------------------------------------------
  function parseHeard(text, myCall) {
    const my = (myCall || "").toUpperCase().trim();
    const toks = String(text || "").toUpperCase().split(/\s+/).filter(Boolean).slice(-160);

    // "X DE Y": Y is sending, X is who they call (or CQ)
    const events = [];
    for (let i = 0; i < toks.length - 1; i++) {
      if (toks[i] !== "DE" || !CALL.test(toks[i + 1])) continue;
      let to = null;
      if (i > 0 && CALL.test(toks[i - 1])) to = toks[i - 1];
      if (toks.slice(Math.max(0, i - 3), i).includes("CQ")) to = "CQ";
      events.push({ sender: toks[i + 1], to, at: i });
    }
    let theirs = events.filter((e) => e.sender !== my);
    if (!theirs.length) {
      // No "DE": accept a callsign sent at least twice in the last few words
      const recent = toks.slice(-30);
      const seen = {};
      let pick = null;
      recent.forEach((t, k) => {
        if (!CALL.test(t) || t === my) return;
        seen[t] = (seen[t] || 0) + 1;
        if (seen[t] >= 2) pick = { sender: t, at: toks.length - recent.length + k };
      });
      if (!pick) return null;
      const before = toks.slice(Math.max(0, pick.at - 6), pick.at);
      pick.to = before.includes("CQ") ? "CQ" : before.includes(my) && my ? my : null;
      events.push(pick);
      theirs = [pick];
    }
    const last = theirs[theirs.length - 1];
    const dx = last.sender;

    // Their current over: from the first event of this sender after anyone else spoke
    let from = last.at;
    for (let k = events.length - 1; k >= 0 && events[k].sender === dx; k--) from = events[k].at;
    const over = toks.slice(Math.max(0, from - 2));

    const calling = last.to === "CQ" ? "cq" : last.to === my && my ? "me" : last.to ? "other" : (over.includes(my) && my ? "me" : "unknown");

    let report = null, name = null, qth = null;
    for (let k = 0; k < over.length; k++) {
      const t = over[k];
      if (t === "RST" || t === "UR") {
        for (const c of over.slice(k + 1, k + 3)) if (REPORT.test(c)) report = c;
      }
      if (t === "NAME" || t === "OP" || t === "NM") {
        const c = over.slice(k + 1, k + 3).find((x) => !NOT_A_NAME.has(x));
        if (c && /^[A-Z]{2,12}$/.test(c)) name = c;
      }
      if (t === "QTH") {
        const c = over.slice(k + 1, k + 3).find((x) => !NOT_A_NAME.has(x));
        if (c && /^[A-Z][A-Z0-9-]{1,20}$/.test(c)) qth = c;
      }
    }
    if (calling !== "me") report = null;   // a report to someone else isn't yours
    const tail = over.slice(-12);
    const closing = tail.some((t) => CLOSING.has(t)) && !tail.includes("KN") || (tail.includes("TNX") && tail.includes("QSO"));

    const others = [];
    for (const t of toks) if (CALL.test(t) && t !== my && t !== dx && !others.includes(t)) others.push(t);

    let stage = "exchange";
    if (calling === "cq") stage = "answer";
    else if (closing) stage = "closing";
    else if (calling === "other") stage = "answer";

    return { dx, calling, to: last.to, report, name, qth, closing, stage, others: others.slice(-4) };
  }

  // -------------------------------------------------------------------------
  // RST from the received signal (an estimate, not an S-meter reading)
  // -------------------------------------------------------------------------
  function estimateRst(snrDb) {
    if (snrDb == null || !Number.isFinite(snrDb)) return null;
    const S = [[25, 9], [22, 8], [19, 7], [16, 6], [13, 5], [10, 4], [7, 3], [4, 2]];
    const s = (S.find(([db]) => snrDb >= db) || [0, 1])[1];
    const r = snrDb >= 12 ? 5 : snrDb >= 8 ? 4 : snrDb >= 5 ? 3 : 2;
    return `${r}${s}9`;
  }

  // -------------------------------------------------------------------------
  // Build the reply lines for a stage and style
  // -------------------------------------------------------------------------
  function buildReply({ stage, dx, my, rst, style, theirName, gotReport, myName, myQth, myRig, hwcpy }) {
    dx = (dx || "").toUpperCase(); my = (my || "").toUpperCase();
    if (!dx || !my) return [];
    rst = (rst || "5NN").toUpperCase();
    const N = (myName || "").toUpperCase().trim(), Q = (myQth || "").toUpperCase().trim(), G = (myRig || "").toUpperCase().trim();
    const their = (theirName || "").toUpperCase();

    if (stage === "answer") {
      if (style === "short") return [`${dx} DE ${my} K`];
      if (style === "formal") return [`<KA> ${dx} DE ${my} ${my} <KN>`];
      return [`${dx} DE ${my} ${my} K`];
    }

    if (stage === "closing") {
      if (style === "short") return [`R TU 73 ${dx} DE ${my} SK`];
      if (style === "formal") return [`<KA> TNX FER QSO ${dx} 73 DE ${my} <VA>`];
      return [`${dx} DE ${my}`, `R TNX FER QSO${their ? " " + their : ""}`, "73 ES GL", `${dx} DE ${my} SK`];
    }

    // exchange: send a report, plus your details
    if (style === "short") return [`${dx} DE ${my} ${gotReport ? "R " : ""}UR RST ${rst} ${rst} KN`];
    if (style === "formal") {
      let info = "";
      if (N) info += ` <BT> NAME ${N} ${N}`;
      if (Q) info += ` <BT> QTH ${Q} ${Q}`;
      if (G) info += ` <BT> RIG ${G}`;
      return [`<KA> ${dx} DE ${my} <BT> UR RST ${rst} ${rst}${info} <BT> HW CPY ${dx} DE ${my} <KN>`];
    }
    const lines = [`${dx} DE ${my}`];
    lines.push(gotReport ? `R TNX FER RPRT${their ? " " + their : ""}` : `TNX FER CALL${their ? " " + their : ""}`);
    lines.push(`UR RST ${rst} ${rst}`);
    if (N) lines.push(`NAME ${N} ${N}`);
    if (Q) lines.push(`QTH ${Q} ${Q}`);
    if (G) lines.push(`RIG ${G}`);
    lines.push(hwcpy ? `HW CPY? ${dx} DE ${my} KN` : `${dx} DE ${my} KN`);
    return lines;
  }

  // -------------------------------------------------------------------------
  // UI
  // -------------------------------------------------------------------------
  function initReply() {
    const $ = (id) => document.getElementById(id);
    const app = root.CWBuddyApp;
    const core = root.CWCore;
    const practice = root.CWPractice;
    const els = {
      chips: $("heardChips"), call: $("replyCall"), callHint: $("replyCallHint"), rst: $("replyRst"),
      badge: $("rstBadge"), rstHint: $("rstHint"), list: $("replyLines"), empty: $("replyEmpty"),
      details: $("replyDetails"), copy: $("replyCopy"), copyMorse: $("replyCopyMorse"), ready: $("replyReady"),
      edit: $("replyEditDetails")
    };
    if (!els.list) return;

    let text = "";
    let snrDb = null;
    let heard = null;
    let over = { lines: [], sequence: [], words: 0 };
    let callOverride = null;   // user typed a call
    let rstOverride = null;    // user typed a report
    let lastDx = null;

    const style = () => (document.querySelector('input[name="replyStyle"]:checked') || {}).value || "relaxed";
    const myCall = () => ($("myCall").value || "").toUpperCase().trim();

    function chip(label, value, cls) {
      const s = document.createElement("span");
      s.className = "chip" + (cls ? " " + cls : "");
      s.append(label + " ");
      if (value) {
        const b = document.createElement("strong");
        b.textContent = value;
        s.appendChild(b);
      }
      return s;
    }

    function renderChips() {
      els.chips.textContent = "";
      if (!heard) return;
      const who = heard.calling === "cq" ? "Calling CQ" : heard.calling === "me" ? "Calling you" : heard.calling === "other" ? `Working ${heard.to}` : "Heard";
      els.chips.appendChild(chip(who + " ·", heard.dx, "chip-signal"));
      if (heard.report) els.chips.appendChild(chip("Your report", heard.report, "chip-report"));
      if (heard.name || heard.qth) {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = [heard.name && titleCase(heard.name), heard.qth && titleCase(heard.qth)].filter(Boolean).join(" · ");
        els.chips.appendChild(c);
      }
      for (const o of heard.others) {
        const c = chip("Also heard", o, "chip-other");
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "Reply to this";
        b.addEventListener("click", () => { callOverride = o; els.call.value = o; update(); });
        c.appendChild(b);
        els.chips.appendChild(c);
      }
    }

    function titleCase(s) { return s.charAt(0) + s.slice(1).toLowerCase(); }

    // The heard station stays until a new one is decoded or Clear is pressed,
    // so an engine switch or a pause in the text doesn't wipe it.
    function reparse() {
      const h = parseHeard(text, myCall());
      if (h) heard = h;
    }

    function update() {
      const dx = callOverride || (heard && heard.dx) || "";
      if (heard && heard.dx !== lastDx) {        // new station: drop manual edits
        lastDx = heard.dx;
        if (callOverride && callOverride !== heard.dx && !heard.others.includes(callOverride)) callOverride = null;
        rstOverride = null;
      }
      if (document.activeElement !== els.call) els.call.value = callOverride || (heard ? heard.dx : "");
      els.callHint.textContent = heard && !callOverride ? `From “${heard.to && heard.to !== "CQ" ? heard.to + " " : heard.to === "CQ" ? "CQ " : ""}DE ${heard.dx}”` : callOverride ? "Entered by you" : "Fills in when a call is decoded";

      const est = estimateRst(snrDb);
      const rst = rstOverride || est || "5NN";
      if (document.activeElement !== els.rst) els.rst.value = rst;
      els.badge.textContent = rstOverride ? "Edited" : est ? "Estimated" : "Default";
      els.badge.dataset.kind = rstOverride ? "edited" : est ? "estimated" : "default";
      els.rstHint.textContent = rstOverride
        ? "Your own report."
        : est
          ? `Estimated from the received signal (SNR ${Math.round(snrDb)} dB), not your rig's S-meter. Edit it freely.`
          : "No signal estimate available, so the usual 5NN. Edit it freely.";

      renderChips();
      const details = [$("myName").value, $("myQTH").value].filter((v) => v && v.trim()).join(" · ");
      els.details.textContent = details || "Add name and QTH";

      const lines = buildReply({
        stage: heard ? heard.stage : "answer", dx, my: myCall(), rst, style: style(),
        theirName: heard && heard.name, gotReport: Boolean(heard && heard.report),
        myName: $("myName").value, myQth: $("myQTH").value, myRig: $("myRIG").value, hwcpy: $("hwcpy").checked
      });
      over = core.buildOver(lines);
      els.empty.hidden = lines.length > 0;
      els.list.hidden = lines.length === 0;
      els.empty.textContent = myCall() ? "Your reply appears here once a callsign is decoded. You can also type their callsign above." : "Set your callsign in Practice first.";
      practice.renderOver(els.list, over, { showMorse: true, highlightCalls: [dx, myCall()] });
      if (els.ready) els.ready.hidden = lines.length === 0;

      root.CWReplyHighlight = heard ? { call: heard.dx, report: heard.report, name: heard.name, qth: heard.qth } : null;
    }

    document.addEventListener("cwbuddy:text", (e) => {
      text = e.detail.text || "";
      if (e.detail.reset) {
        heard = null; callOverride = null; rstOverride = null; lastDx = null;
      }
      reparse();
      update();
    });
    document.addEventListener("cwbuddy:signal", (e) => {
      const next = e.detail && e.detail.snrDb != null && e.detail.locked !== false ? e.detail.snrDb : null;
      if (next !== snrDb) { snrDb = next; update(); }
    });
    document.addEventListener("cwbuddy:station-changed", () => { reparse(); update(); });
    els.call.addEventListener("blur", update);
    els.rst.addEventListener("blur", update);
    document.querySelectorAll('input[name="replyStyle"]').forEach((r) => r.addEventListener("change", () => { app.set("replyStyle", style()); update(); }));

    els.call.addEventListener("input", () => {
      const v = els.call.value.toUpperCase().trim();
      callOverride = v || null;
      update();
    });
    els.rst.addEventListener("input", () => {
      const v = els.rst.value.toUpperCase().trim();
      rstOverride = v || null;
      update();
    });
    els.edit.addEventListener("click", () => app.showView("practice", "myName"));
    els.copy.addEventListener("click", () => app.copy(practice.overAsText(over), els.copy));
    els.copyMorse.addEventListener("click", () => app.copy(practice.overAsMorse(over), els.copyMorse));

    app.bindPlayer({
      prefix: "reply",
      getOver: () => over,
      getCalls: () => [els.call.value, myCall()],
      listEl: els.list
    });

    const savedStyle = app.get("replyStyle");
    if (savedStyle) {
      const r = document.querySelector(`input[name="replyStyle"][value="${savedStyle}"]`);
      if (r) r.checked = true;
    }
    update();
  }

  const api = { parseHeard, buildReply, estimateRst, initReply };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CWReply = api;
})(typeof self !== "undefined" ? self : globalThis);
