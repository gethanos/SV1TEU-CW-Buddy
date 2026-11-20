// node tests/splitter.test.js
const { splitWords } = require('../splitter.js');
const cases = [
  // [decoded (real DeepCW outputs from earlier tests), expected]
  ['C Q DE S V 1TE U K S V 1T JN 5NN 7 3', 'CQ DE SV1TEU K SV1TJN 5NN 73'],                 // wide model, 5 WPM
  ['C Q DE SV 1TEU K SV 1T JN 5NN 7 3', 'CQ DE SV1TEU K SV1TJN 5NN 73'],                   // wide, 8 WPM
  ['C Q DESV 1TEU K SV 1T JN 5NN 7 3', 'CQ DE SV1TEU K SV1TJN 5NN 73'],                    // narrow, 8 WPM (glued DESV)
  // must stay unchanged
  ['CQ CQ DE SV1TEU SV1TEU K SV1TJN DE SV1TEU UR RST 579 579 NAME THANOS QTH ATHENS BK TNX FER QSO 73',
   'CQ CQ DE SV1TEU SV1TEU K SV1TJN DE SV1TEU UR RST 579 579 NAME THANOS QTH ATHENS BK TNX FER QSO 73'],
  ['XKQJT RMZPA LQWNE', 'XKQJT RMZPA LQWNE'],              // Koch practice groups: never touched
  ['XK QJ T RM ZPA', 'XK QJ T RM ZPA'],                    // fragmented random text: no valid segmentation, untouched
  ['UR 5NN', 'UR 5NN'],                                    // must not glue into callsign UR5NN
  ['K SV1TJN', 'K SV1TJN'],
  ['HW? SV1TEU DE SV1TJN KN', 'HW? SV1TEU DE SV1TJN KN'],
  ['T N X FER Q S O', 'TNX FER QSO'],
  ['N AME G EORGE', 'NAME G EORGE'],                       // unknown name: left as decoded rather than guessed
  ['DL1XYZ/P DE F4HYY', 'DL1XYZ/P DE F4HYY'],
  ['5 N N', '5NN'],
];
let fail = 0;
for (const [inp, exp] of cases) {
  const got = splitWords(inp);
  const ok = got === exp; if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${inp.padEnd(40)} → ${got}${ok ? '' : '   (expected: ' + exp + ')'}`);
}
console.log(fail ? `${fail} FAILED` : 'all passed'); process.exit(fail ? 1 : 0);
