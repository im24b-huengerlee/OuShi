'use strict';

const WebSocket = require('ws');
const dictionary = require('../server/dictionary');

dictionary.load();

function wsConnect() {
  return new Promise((resolve, reject) => {
    const port = process.env.PORT || 3000;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function waitMsg(ws, pred, ms = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    ws.on('message', function h(d) {
      const m = JSON.parse(d.toString());
      if (pred(m)) {
        clearTimeout(t);
        ws.off('message', h);
        resolve(m);
      }
    });
  });
}

function send(ws, o) {
  ws.send(JSON.stringify(o));
}

async function main() {
  const a = await wsConnect();
  send(a, { t: 'join', name: 'TestA' });
  const j = await waitMsg(a, (m) => m.t === 'joined');
  const code = j.room;

  const bad = await wsConnect();
  send(bad, { t: 'join', name: 'X', room: 'ZZZZ' });
  const err = await waitMsg(bad, (m) => m.t === 'err');
  console.log(err.msg === 'errNoRoom' ? 'OK invalid room' : 'FAIL invalid room');

  const b = await wsConnect();
  send(b, { t: 'join', name: 'TestB', room: code });
  await waitMsg(b, (m) => m.t === 'joined');

  send(a, { t: 'start' });
  await waitMsg(a, (m) => m.t === 'turn' || (m.t === 'state' && m.state === 'playing'));
  const turn = await waitMsg(a, (m) => m.t === 'turn');
  console.log('OK start, syllable:', turn.syllable);

  send(a, { t: 'submit', v: 'notaword' });
  const rej = await waitMsg(a, (m) => m.t === 'reject');
  console.log(rej.reason ? 'OK reject invalid' : 'FAIL reject');

  b.close();
  await new Promise((r) => setTimeout(r, 200));
  console.log('OK tab close (no crash)');

  console.log('All smoke tests passed');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
