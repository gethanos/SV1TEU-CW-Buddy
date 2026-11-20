// node tests/reply.test.js
const { parseHeard, buildReply, estimateRst } = require('../reply.js');
const MY = 'SV1TEU';
let fail = 0;
const t = (name, text, check) => {
  const h = parseHeard(text, MY);
  const ok = check(h);
  if (!ok) fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : '  ' + JSON.stringify(h)}`);
};
t('CQ heard', 'CQ CQ DE SV1TJN SV1TJN K', h => h.dx === 'SV1TJN' && h.calling === 'cq' && h.stage === 'answer');
t('they call me with report, name, QTH',
  'SV1TEU DE SV1TJN GM OM TNX FER CALL UR RST 579 579 NAME GEORGE GEORGE QTH PATRAS PATRAS HW? SV1TEU DE SV1TJN KN',
  h => h.dx === 'SV1TJN' && h.calling === 'me' && h.report === '579' && h.name === 'GEORGE' && h.qth === 'PATRAS' && h.stage === 'exchange');
t('cut-number report and OP', 'SV1TEU DE DL1XYZ UR 5NN 5NN OP IS HANS HANS KN', h => h.report === '5NN' && h.name === 'HANS');
t('closing', 'SV1TEU DE SV1TJN R TNX FER QSO 73 SV1TEU DE SV1TJN SK', h => h.stage === 'closing');
t('working someone else: their report is not mine', 'DL1XYZ DE SV1TJN UR RST 599 BK', h => h.calling === 'other' && h.report === null);
t('my own decoded over is ignored', 'CQ DE SV1TJN K SV1TJN DE SV1TEU SV1TEU K', h => h.dx === 'SV1TJN' && h.calling === 'cq');
t('nothing to reply to yet', 'CQ CQ TEST', h => h === null);
t('other calls are listed', 'CQ DE DL1XYZ K CQ CQ DE SV1TJN K', h => h.dx === 'SV1TJN' && h.others.includes('DL1XYZ'));
t('call without DE, sent twice', 'CQ CQ SV1TJN SV1TJN K', h => h.dx === 'SV1TJN' && h.calling === 'cq');
t('call without DE, once only: ignored', 'CQ CQ SV1TJN K', h => h === null);
t('only their latest over counts', 'SV1TEU DE SV1TJN UR 559 KN SV1TJN DE SV1TEU R UR 579 KN SV1TEU DE SV1TJN R TNX NAME GEORGE KN',
  h => h.report === null && h.name === 'GEORGE');
const rst = [[30, '599'], [20, '579'], [14, '559'], [9, '439'], [null, null]];
for (const [snr, want] of rst) {
  const got = estimateRst(snr);
  if (got !== want) fail++;
  console.log(`${got === want ? 'ok  ' : 'FAIL'} estimateRst(${snr}) = ${got}`);
}
const reply = buildReply({ stage: 'exchange', style: 'relaxed', dx: 'SV1TJN', my: 'SV1TEU', rst: '579', theirName: 'GEORGE', gotReport: true, myName: 'Thanos', myQth: 'Athens', hwcpy: true });
const want = ['SV1TJN DE SV1TEU', 'R TNX FER RPRT GEORGE', 'UR RST 579 579', 'NAME THANOS THANOS', 'QTH ATHENS ATHENS', 'HW CPY? SV1TJN DE SV1TEU KN'];
const ok = JSON.stringify(reply) === JSON.stringify(want);
if (!ok) fail++;
console.log(`${ok ? 'ok  ' : 'FAIL'} relaxed exchange reply${ok ? '' : '  ' + JSON.stringify(reply)}`);
console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
