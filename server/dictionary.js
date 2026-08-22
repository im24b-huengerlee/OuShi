'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_PATH = path.join(__dirname, '..', 'data', 'de.txt');
const DATA_GZ = DATA_PATH + '.gz';

let words = new Set();
let normalizedWords = new Set();
let buckets = { easy: [], medium: [], hard: [] };
let usedInGame = new Map();

function norm(w) {
  return w.replace(/ß/g, 'ss').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
}

function load() {
  let raw;
  if (fs.existsSync(DATA_GZ)) {
    raw = zlib.gunzipSync(fs.readFileSync(DATA_GZ)).toString('utf8');
  } else if (fs.existsSync(DATA_PATH)) {
    raw = fs.readFileSync(DATA_PATH, 'utf8');
  } else {
    throw new Error('Missing data/de.txt — run npm run build-wordlist');
  }

  words = new Set();
  normalizedWords = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const w = line.trim().toLowerCase();
    if (!w) continue;
    words.add(w);
    normalizedWords.add(norm(w));
  }

  const counts = new Map();
  for (const w of words) {
    const seen = new Set();
    for (let len = 2; len <= 3; len++) {
      for (let i = 0; i <= w.length - len; i++) {
        const sub = w.slice(i, i + len);
        if (!/^[a-zäöüß]+$/.test(sub)) continue;
        if (seen.has(sub)) continue;
        seen.add(sub);
        counts.set(sub, (counts.get(sub) || 0) + 1);
      }
    }
  }

  buckets = { easy: [], medium: [], hard: [] };
  for (const [sub, n] of counts) {
    if (n >= 2000) buckets.easy.push(sub);
    else if (n >= 500) buckets.medium.push(sub);
    else if (n >= 80) buckets.hard.push(sub);
  }
  for (const k of Object.keys(buckets)) buckets[k].sort();
  console.log('Dictionary:', words.size, 'words; syllables:', buckets.easy.length, buckets.medium.length, buckets.hard.length);
}

function resetGame(roomCode) {
  usedInGame.set(roomCode, { easy: new Set(), medium: new Set(), hard: new Set() });
}

function pickFrom(list, used) {
  const avail = list.filter((s) => !used.has(s));
  const pool = avail.length ? avail : list;
  if (!avail.length) used.clear();
  const pick = pool[Math.floor(Math.random() * pool.length)];
  used.add(pick);
  return pick;
}

function pickSyllable(roomCode, roundNumber, bannedLetter) {
  if (!usedInGame.has(roomCode)) resetGame(roomCode);
  const used = usedInGame.get(roomCode);
  let band = roundNumber <= 5 ? 'easy' : roundNumber <= 15 ? 'medium' : 'hard';
  let list = buckets[band];
  if (!list.length) list = buckets.easy.length ? buckets.easy : buckets.medium.length ? buckets.medium : buckets.hard;
  for (let i = 0; i < 50; i++) {
    const syl = pickFrom(list, used[band]);
    if (!bannedLetter || !syl.includes(bannedLetter)) return syl;
  }
  return pickFrom(list, used[band]);
}

function wordInDict(word) {
  const w = word.toLowerCase();
  return words.has(w) || normalizedWords.has(norm(w));
}

function validateWord(word, syllable, room, playerId) {
  const w = (word || '').trim().toLowerCase();
  if (!w || w.length < 2 || w.length > 30) return { ok: false, reason: 'noWord' };
  if (/ß/.test(w)) return { ok: false, reason: 'noWord' };
  if (!/^[a-zäöü]+$/.test(w)) return { ok: false, reason: 'noWord' };
  if (!w.includes(syllable)) return { ok: false, reason: 'noSyllable' };
  if (!wordInDict(w)) return { ok: false, reason: 'noWord' };
  if (room.usedWords.has(w)) return { ok: false, reason: 'used' };

  const effects = room.pendingEffects.get(playerId) || [];
  for (const ef of effects) {
    if (ef.startsWith('banLetter:')) {
      const ch = ef.slice(10);
      if (w.includes(ch)) return { ok: false, reason: 'banned' };
    }
  }
  return { ok: true, word: w };
}

module.exports = { load, resetGame, pickSyllable, validateWord };
