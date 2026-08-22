'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { WebSocketServer } = require('ws');

const dictionary = require('./dictionary');
const db = require('./db');
const rooms = require('./rooms');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const INDEX = path.join(PUBLIC, 'index.html');

let indexGz = null;
let indexRaw = null;

function loadStatic() {
  indexRaw = fs.readFileSync(INDEX);
  indexGz = zlib.gzipSync(indexRaw);
  console.log('index.html', indexRaw.length, 'bytes → gzip', indexGz.length);
}

async function handleApi(req, res) {
  if (req.method === 'GET' && req.url === '/api/highscores') {
    try {
      const rows = await db.getTop(10);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' });
      res.end(JSON.stringify(rows));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }
  return false;
}

function serveIndex(req, res) {
  const ae = req.headers['accept-encoding'] || '';
  if (ae.includes('gzip')) {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Content-Length': indexGz.length,
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(indexGz);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(indexRaw);
  }
}

const server = http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  if (req.url === '/' || req.url.startsWith('/?')) return serveIndex(req, res);
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.t === 'pong') {
        rooms.handleMessage(ws, msg);
        return;
      }
      if (msg.t === 'join') {
        rooms.join(ws, msg);
        return;
      }
      rooms.handleMessage(ws, msg);
    } catch (err) {
      ws.send(JSON.stringify({ t: 'err', msg: 'Ungültige Nachricht' }));
    }
  });
  ws.on('close', () => rooms.leave(ws));
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
    ws.send(JSON.stringify({ t: 'ping' }));
  }
  rooms.tickPongs();
}, 25000);

async function main() {
  dictionary.load();
  loadStatic();
  await db.init();
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Silbenbombe on http://0.0.0.0:' + PORT);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
