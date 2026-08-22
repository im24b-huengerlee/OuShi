'use strict';

const dictionary = require('./dictionary');
const db = require('./db');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const BAN_LETTERS = 'aeioulnrst';

function living(room) {
  return room.order.filter((id) => {
    const p = room.players.get(id);
    return p && p.alive;
  });
}

function clearFuse(room) {
  if (room.fuseTimer) {
    clearTimeout(room.fuseTimer);
    room.fuseTimer = null;
  }
}

function broadcastAll(room, msg) {
  const raw = JSON.stringify(msg);
  for (const p of room.players.values()) {
    if (p.socket && p.socket.readyState === 1) p.socket.send(raw);
  }
}

function snapshot(room) {
  const players = room.order.map((id) => {
    const p = room.players.get(id);
    if (!p) return null;
    const used = room.usedLetters.get(id);
    return {
      id: p.id,
      n: p.name,
      l: p.lives,
      tk: p.tokens,
      a: p.alive,
      c: p.connected,
      ab: used ? [...used].sort().join('') : '',
      st: { w: p.stats.words, lg: p.stats.longestWord || '', fs: p.stats.fastestMs },
    };
  }).filter(Boolean);
  const turnId = room.order[room.turnIndex];
  return {
    t: 'state',
    code: room.code,
    state: room.state,
    host: room.hostId,
    turn: room.state === 'playing' ? turnId : null,
    syllable: room.syllable || '',
    fuseEndsAt: room.fuseEndsAt || 0,
    fuseSpeed: room.fuseSpeed || 0,
    fuseMs: room.currentFuseMs || 0,
    players,
  };
}

function sendState(room) {
  broadcastAll(room, snapshot(room));
}

function activeEffects(room, playerId) {
  return (room.pendingEffects.get(playerId) || []).slice();
}

function popEffects(room, playerId) {
  const fx = room.pendingEffects.get(playerId) || [];
  room.pendingEffects.set(playerId, []);
  return fx;
}

function computeFuseMs(room, effects) {
  let ms = Math.max(room.settings.minFuseMs, room.settings.baseFuseMs - room.roundsPlayed * 100);
  const speed = room.fuseSpeed || 0;
  ms = Math.max(room.settings.minFuseMs, Math.floor(ms / (1 + speed * 0.18)));
  if (effects.includes('short')) ms = Math.max(room.settings.minFuseMs, Math.floor(ms * 0.6));
  return ms;
}

function getBannedLetter(effects) {
  for (const ef of effects) {
    if (ef.startsWith('banLetter:')) return ef.slice(10);
  }
  return null;
}

function nextTurnIndex(room, from) {
  const n = room.order.length;
  if (!n) return 0;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = (i + 1) % n;
    const p = room.players.get(room.order[i]);
    if (p && p.alive) return i;
  }
  return from;
}

function advanceTurn(room) {
  clearFuse(room);
  const alive = living(room);
  if (alive.length <= 1) return endGame(room);

  let idx = room.turnIndex;
  for (let guard = 0; guard < room.order.length + 2; guard++) {
    idx = nextTurnIndex(room, idx);
    const pid = room.order[idx];
    const player = room.players.get(pid);
    if (!player || !player.alive) continue;

    if (!player.connected) {
      player.lives--;
      room.fuseSpeed = 0;
      if (player.lives <= 0) {
        player.alive = false;
        broadcastAll(room, { t: 'boom', player: pid, livesLeft: 0 });
        if (living(room).length <= 1) return endGame(room);
      }
      continue;
    }

    room.turnIndex = idx;
    room.turnPlayerId = pid;
    const effects = popEffects(room, pid);
    room.currentEffects = effects;
    room.doubleRemaining = effects.includes('double') ? 2 : 1;

    const banned = getBannedLetter(effects);
    room.syllable = dictionary.pickSyllable(room.code, room.roundsPlayed + 1, banned);
    room.roundsPlayed++;

    const fuseMs = computeFuseMs(room, effects);
    room.currentFuseMs = fuseMs;
    room.turnStartedAt = Date.now();
    room.fuseEndsAt = room.turnStartedAt + fuseMs;
    room.fuseTimer = setTimeout(() => onTimeout(room, pid), fuseMs);

    broadcastAll(room, {
      t: 'turn',
      player: pid,
      syllable: room.syllable,
      fuseMs,
      fuseSpeed: room.fuseSpeed || 0,
      effects,
      fuseEndsAt: room.fuseEndsAt,
    });
    sendState(room);
    return;
  }
  endGame(room);
}

function onTimeout(room, pid) {
  if (room.state !== 'playing' || room.turnPlayerId !== pid) return;
  const player = room.players.get(pid);
  if (!player || !player.alive) return;
  player.lives--;
  room.fuseSpeed = 0;
  broadcastAll(room, { t: 'boom', player: pid, livesLeft: player.lives });
  if (player.lives <= 0) player.alive = false;
  if (living(room).length <= 1) return endGame(room);
  advanceTurn(room);
}

function trackLetters(room, playerId, word) {
  if (!room.usedLetters.has(playerId)) room.usedLetters.set(playerId, new Set());
  const set = room.usedLetters.get(playerId);
  for (const ch of word) {
    if (ch >= 'a' && ch <= 'z') set.add(ch);
    else if (ch === 'ä') set.add('a');
    else if (ch === 'ö') set.add('o');
    else if (ch === 'ü') set.add('u');
    else if (ch === 'ß') { set.add('s'); }
  }
  const alpha = 'abcdefghijklmnopqrstuvwxyz';
  if ([...alpha].every((c) => set.has(c))) {
    const p = room.players.get(playerId);
    if (p) {
      p.lives = Math.min(p.lives + 1, 9);
      room.usedLetters.set(playerId, new Set());
    }
  }
}

function handleSubmit(room, player, word) {
  if (room.state !== 'playing' || room.turnPlayerId !== player.id) return;
  const res = dictionary.validateWord(word, room.syllable, room, player.id);
  if (!res.ok) {
    broadcastAll(room, { t: 'reject', player: player.id, reason: res.reason });
    return;
  }

  const elapsed = Date.now() - room.turnStartedAt;
  room.usedWords.add(res.word);
  player.stats.words++;
  if (res.word.length > (player.stats.longestWord || '').length) player.stats.longestWord = res.word;
  if (player.stats.fastestMs === null || elapsed < player.stats.fastestMs) player.stats.fastestMs = elapsed;

  let tokenEarned = false;
  if (elapsed < 3000 && player.tokens < 3) {
    player.tokens++;
    tokenEarned = true;
  }
  trackLetters(room, player.id, res.word);
  player.typing = '';

  room.doubleRemaining--;
  room.fuseSpeed = (room.fuseSpeed || 0) + 1;
  broadcastAll(room, { t: 'accept', player: player.id, word: res.word, fuseSpeed: room.fuseSpeed });

  if (room.doubleRemaining > 0) {
    sendState(room);
    return;
  }

  clearFuse(room);
  advanceTurn(room);
}

function handleSabotage(room, from, targetId, kind) {
  if (room.state !== 'playing') return { ok: false, msg: 'errStartFail' };
  if (from.id === targetId) return { ok: false, msg: 'errSelf' };
  if (from.tokens < 1) return { ok: false, msg: 'errNoToken' };
  const target = room.players.get(targetId);
  if (!target || !target.alive) return { ok: false, msg: 'errBadTarget' };
  const allowed = ['short', 'double'];
  let effect = kind;
  if (kind === 'ban') {
    const letter = BAN_LETTERS[Math.floor(Math.random() * BAN_LETTERS.length)];
    effect = 'banLetter:' + letter;
  }
  if (!allowed.includes(kind) && kind !== 'ban') return { ok: false, msg: 'Unbekannter Typ' };

  from.tokens--;
  if (!room.pendingEffects.has(targetId)) room.pendingEffects.set(targetId, []);
  room.pendingEffects.get(targetId).push(effect);
  broadcastAll(room, { t: 'sabotage', from: from.id, target: targetId, kind: effect });
  sendState(room);
  return { ok: true };
}

async function endGame(room) {
  clearFuse(room);
  room.state = 'ended';
  const alive = living(room);
  const winner = alive[0] || null;
  let highscores = [];
  try {
    await db.saveGame(room);
    highscores = await db.getTop(10);
  } catch (err) {
    console.error('Highscore save failed:', err);
  }
  broadcastAll(room, { t: 'over', winner, highscores });
  sendState(room);
}

function startGame(room) {
  if (room.state !== 'lobby') return false;
  if (room.players.size < 2) return false;
  room.state = 'playing';
  room.turnIndex = room.order.length - 1;
  room.roundsPlayed = 0;
  room.usedWords = new Set();
  room.usedLetters = new Map();
  room.pendingEffects = new Map();
  room.fuseSpeed = 0;
  room.startedAt = new Date();
  dictionary.resetGame(room.code);
  for (const p of room.players.values()) {
    p.lives = room.settings.lives;
    p.tokens = 0;
    p.alive = true;
    p.stats = { words: 0, longestWord: '', fastestMs: null };
    p.typing = '';
  }
  sendState(room);
  advanceTurn(room);
  return true;
}

function resetLobby(room) {
  clearFuse(room);
  room.state = 'lobby';
  room.syllable = '';
  room.fuseEndsAt = 0;
  room.usedWords = new Set();
  room.pendingEffects = new Map();
  for (const p of room.players.values()) {
    p.lives = room.settings.lives;
    p.tokens = 0;
    p.alive = true;
    p.typing = '';
    p.stats = { words: 0, longestWord: '', fastestMs: null };
  }
  sendState(room);
}

module.exports = {
  snapshot,
  sendState,
  broadcastAll,
  startGame,
  resetLobby,
  advanceTurn,
  handleSubmit,
  handleSabotage,
  clearFuse,
};
