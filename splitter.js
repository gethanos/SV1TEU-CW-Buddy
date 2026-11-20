/*
Copyright (c) 2026 Georgalas Athanasios Antonios, SV1TEU

This software is released under the MIT License.
See the LICENSE file in the repository root for full license text.
*/

// Word splitter for the AI engine's output.
//
// Below ~10 WPM the AI model often inserts spaces inside words
// ("C Q DE S V 1TE U") and occasionally glues words together ("DESV").
// This re-segments only runs of tokens that are not valid on their own,
// using ham vocabulary, callsign and report patterns. Text it can't explain
// is left exactly as decoded, so random practice groups are never altered.
(function (root) {
  "use strict";

  const WORDS = new Set((
    // Procedure, Q-codes, abbreviations
    "CQ DE K KN BK AR SK VA R RR TU TNX TKS TX RX UR URS RST NAME NM OP QTH QTR QRA " +
    "QSO QSL QRZ QRL QRM QRN QSB QRP QRO QRS QRQ QSY QRV QRX QRT QRU QSK QSP " +
    "HW HR HRD CPY AGN PSE ES FER FB OM YL XYL GM GA GE GN GL GD GUD VY DR SRI NR CL " +
    "ABT HPE CUL CU WX TEMP RIG ANT PWR WATTS WATT ERE BTU WID WRK WKD WKG " +
    "INFO SKED TEST CONTEST UP DWN DN LID HAM RADIO MNI MSG RPT RPRT RPTR " +
    "AND THE FOR YOU YOUR WITH FROM THIS THAT HERE THERE NOW VERY GOOD NICE " +
    "SUNNY CLOUDY RAIN SNOW WINDY COLD HOT WARM FINE OK BEST REGARDS DX POTA SOTA IOTA " +
    "DIPOLE YAGI VERT VERTICAL LOOP BEAM WIRE EFHW LW ENDFED KEY BUG PADDLE STRAIGHT " +
    "QRPP MTRS MTR FT TO ON IN AT IS IT OF IS ME MY AS SO NO GO BE WE HE SHE BUT NOT ALL"
  ).split(/\s+/));
  for (const w of ["73", "88", "55", "33", "72", "HW?", "?", "=", "+"]) WORDS.add(w);

  // ITU-style callsign: 1-2 char prefix, a digit, a 1-4 letter suffix,
  // optional prefix/ and /P, /M, /QRP forms. (Letters-only suffix keeps
  // random practice groups like "D9PZ7" from looking like calls.)
  const CALL = /^(?:[A-Z0-9]{1,3}\/)?(?:[A-Z]{1,2}|[A-Z][0-9]|[0-9][A-Z])[0-9][A-Z]{1,4}(?:\/[A-Z0-9]{1,4})?$/;
  // Signal reports, including cut numbers (N = 9, T = 0)
  const REPORT = /^[1-5][1-9NT][1-9NT]$/;
  const NUMBER = /^[0-9]{2,4}$/;   // a lone digit is usually a fragment ("7 3")

  function isValid(tok) {
    return WORDS.has(tok) || CALL.test(tok) || REPORT.test(tok) || NUMBER.test(tok);
  }

  // Score of one segment: longer valid pieces win; callsigns need >= 4 chars.
  // Callsigns and numbers are only allowed when the run sits in QSO context.
  function segmentScore(s, allowCalls) {
    if (WORDS.has(s)) return s.length * s.length + 1;
    if (REPORT.test(s)) return s.length * s.length;
    if (!allowCalls) return -Infinity;
    if (CALL.test(s) && s.length >= 4) return s.length * s.length;
    if (NUMBER.test(s)) return s.length * s.length - 1;
    return -Infinity;
  }

  // QSO context: a 2+ letter procedure word near the run (DE, CQ, UR, ...).
  const CONTEXT_WORDS = new Set(["CQ", "DE", "UR", "RST", "TNX", "TU", "QSO", "QTH", "NAME", "OP", "PSE", "AGN", "HW", "HW?", "KN", "BK", "SK", "AR", "ES", "FB", "GM", "GA", "GE", "73"]);
  // before: already-corrected output; after: the original tokens that follow.
  function hasContext(before, after) {
    return before.slice(-6).some((w) => CONTEXT_WORDS.has(w)) ||
      after.slice(0, 6).some((w) => CONTEXT_WORDS.has(w));
  }

  // Best segmentation of a run of tokens (chars joined), or null if nothing
  // in it can be improved. Valid pieces may cross the original spaces; a
  // token nothing explains (a name, a typo) passes through unchanged.
  // Breaks that fall on an original space get a small bonus.
  function segmentRun(tokens, allowCalls) {
    const text = tokens.join("");
    const spaceAt = new Set();
    const tokenEndFrom = new Map(); // token start -> token end
    let pos = 0;
    for (const t of tokens) {
      tokenEndFrom.set(pos, pos + t.length);
      pos += t.length;
      if (pos < text.length) spaceAt.add(pos);
    }
    const n = text.length;
    const best = new Array(n + 1).fill(-Infinity);
    const prev = new Array(n + 1).fill(-1);
    const kept = new Array(n + 1).fill(false);
    best[0] = 0;
    for (let i = 0; i < n; i++) {
      if (best[i] === -Infinity) continue;
      const bonus = (j) => (j === n || spaceAt.has(j) ? 0.5 : 0);
      for (let j = i + 1; j <= Math.min(n, i + 12); j++) {
        const sc = segmentScore(text.slice(i, j), allowCalls);
        if (sc === -Infinity) continue;
        const total = best[i] + sc + bonus(j);
        if (total > best[j]) { best[j] = total; prev[j] = i; kept[j] = false; }
      }
      if (tokenEndFrom.has(i)) {             // keep an original token as decoded
        const j = tokenEndFrom.get(i);
        const total = best[i] - 0.1 + bonus(j);
        if (total > best[j]) { best[j] = total; prev[j] = i; kept[j] = true; }
      }
    }
    const out = [];
    let improved = false;
    for (let j = n; j > 0; j = prev[j]) {
      out.unshift(text.slice(prev[j], j));
      if (!kept[j]) improved = true;
    }
    return improved ? out : null;
  }

  function splitWords(text) {
    if (!text) return text;
    const lead = /^\s/.test(text) ? " " : "";
    const trail = /\s$/.test(text) ? " " : "";
    const tokens = text.trim().split(/\s+/);
    const out = [];
    let i = 0;
    while (i < tokens.length) {
      if (isValid(tokens[i])) { out.push(tokens[i]); i++; continue; }
      // Collect a run of invalid tokens
      let j = i;
      while (j < tokens.length && !isValid(tokens[j])) j++;
      const run = tokens.slice(i, j);
      let seg = null;
      // Only runs with a real fragment (1-2 chars) are re-segmented: the AI's
      // slow-speed splits always produce them, well-spaced groups never do.
      if (run.length > 1 && run.some((t) => t.length <= 2)) {
        const context = hasContext(out, tokens.slice(j));
        seg = segmentRun(run, context);
        // The run's own dictionary words (e.g. "DE" split out of "DESV") count as context too
        if (seg && !context && seg.some((w) => CONTEXT_WORDS.has(w))) seg = segmentRun(run, true);
      }
      if (seg) out.push(...seg);
      else out.push(...run);
      i = j;
    }
    return lead + out.join(" ") + trail;
  }

  const api = { splitWords, isValid, CALL, REPORT };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CWSplitter = api;
})(typeof self !== "undefined" ? self : globalThis);
