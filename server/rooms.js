'use strict';

const game = require('./game');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rooms = new Map();
let nextPlayerNum = 1;

function genCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function sanitizeName(name) {
  return (name || '')
    .trim()
    .replace(/[<>"'&]/g, '')
    .slice(0, 14);
}

function createRoom() {
  const code = genCode();
  const room = {
    code,
    hostId: null,
    players: new Map(),
    order: [],
    state: 'lobby',
    turnIndex: 0,
    turnPlayerId: null,
    syllable: '',
    usedWords: new Set(),
    usedLetters: new Map(),
    fuseEndsAt: 0,
    fuseTimer: null,
    pendingEffects: new Map(),
    currentEffects: [],
    doubleRemaining: 1,
    turnStartedAt: 0,
    settings: { lives: 3, baseFuseMs: 12000, minFuseMs: 5000 },
    roundsPlayed: 0,
    startedAt: null,
    deleteTimer: null,
  };
  rooms.set(code, room);
  return room;
}

function scheduleDelete(room) {
  if (room.deleteTimer) clearTimeout(room.deleteTimer);
  room.deleteTimer = setTimeout(() => {
    if ([...room.players.values()].every((p) => !p.connected)) rooms.delete(room.code);
  }, 60000);
}

function cancelDelete(room) {
  if (room.deleteTimer) {
    clearTimeout(room.deleteTimer);
    room.deleteTimer = null;
  }
}

function promoteHost(room) {
  const next = room.order.find((id) => {
    const p = room.players.get(id);
    return p && p.connected;
  });
  room.hostId = next || room.hostId;
}

function attachPlayer(room, socket, name) {
  const id = 'p_' + nextPlayerNum++;
  const player = {
    id,
    name,
    lives: room.settings.lives,
    tokens: 0,
    alive: true,
    connected: true,
    socket,
    typing: '',
    missedPongs: 0,
    stats: { words: 0, longestWord: '', fastestMs: null },
  };
  room.players.set(id, player);
  room.order.push(id);
  if (!room.hostId) room.hostId = id;
  socket.playerId = id;
  socket.roomCode = room.code;
  cancelDelete(room);
  return player;
}

function join(socket, { room: code, name }) {
  const n = sanitizeName(name);
  if (n.length < 1) {
    socket.send(JSON.stringify({ t: 'err', msg: 'Name fehlt' }));
    return;
  }

  let room;
  if (code) {
    code = String(code).toUpperCase().trim();
    room = rooms.get(code);
    if (!room) {
      socket.send(JSON.stringify({ t: 'err', msg: 'Raum nicht gefunden' }));
      return;
    }
  } else {
    room = createRoom();
  }

  for (const p of room.players.values()) {
    if (p.name.toLowerCase() === n.toLowerCase()) {
      socket.send(JSON.stringify({ t: 'err', msg: 'Name schon vergeben' }));
      return;
    }
  }

  const player = attachPlayer(room, socket, n);
  socket.send(JSON.stringify({
    t: 'joined',
    you: player.id,
    room: room.code,
    state: room.state,
    now: Date.now(),
  }));
  game.sendState(room);
}

function leave(socket) {
  const room = rooms.get(socket.roomCode);
  if (!room) return;
  const player = room.players.get(socket.playerId);
  if (!player) return;
  player.connected = false;
  player.socket = null;
  if (room.hostId === player.id) promoteHost(room);
  const anyoneConnected = [...room.players.values()].some((p) => p.connected);
  if (!anyoneConnected) scheduleDelete(room);
  else game.sendState(room);
}

function handleMessage(socket, msg) {
  const room = rooms.get(socket.roomCode);
  if (!room && msg.t !== 'join') return;
  const player = room && room.players.get(socket.playerId);

  switch (msg.t) {
    case 'join':
      return join(socket, msg);
    case 'pong':
      if (player) player.missedPongs = 0;
      break;
    case 'start':
      if (!player || player.id !== room.hostId) return socket.send(JSON.stringify({ t: 'err', msg: 'Nur der Host' }));
      if (room.players.size < 2) return socket.send(JSON.stringify({ t: 'err', msg: 'Mindestens 2 Spieler' }));
      if (!game.startGame(room)) socket.send(JSON.stringify({ t: 'err', msg: 'Start fehlgeschlagen' }));
      break;
    case 'again':
      if (!player || player.id !== room.hostId) return socket.send(JSON.stringify({ t: 'err', msg: 'Nur der Host' }));
      if (room.state !== 'ended') return;
      game.resetLobby(room);
      break;
    case 'typing':
      if (!player || room.state !== 'playing' || room.turnPlayerId !== player.id) return;
      player.typing = String(msg.v || '').slice(0, 30);
      game.broadcastAll(room, { t: 'typing', player: player.id, v: player.typing });
      break;
    case 'submit':
      if (!player) return;
      game.handleSubmit(room, player, msg.v);
      break;
    case 'sabotage': {
      if (!player) return;
      const res = game.handleSabotage(room, player, msg.target, msg.kind);
      if (!res.ok) socket.send(JSON.stringify({ t: 'err', msg: res.msg }));
      break;
    }
    default:
      break;
  }
}

function tickPongs() {
  for (const room of rooms.values()) {
    for (const p of room.players.values()) {
      if (!p.socket || p.socket.readyState !== 1) continue;
      p.missedPongs = (p.missedPongs || 0) + 1;
      if (p.missedPongs >= 2) {
        p.connected = false;
        game.sendState(room);
      } else {
        try { p.socket.ping(); } catch (_) {}
      }
    }
  }
}

module.exports = { join, leave, handleMessage, tickPongs, rooms };
