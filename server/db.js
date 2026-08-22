'use strict';

const dsn = process.env.NINE_PGDB_DB_DSN || process.env.NINE_PG_DB_DSN || process.env.DATABASE_URL;

let pool = null;
let mem = [];
let cache = { at: 0, rows: [] };
const CACHE_MS = 30000;

async function init() {
  if (!dsn) {
    console.warn('No DATABASE_URL — highscores use in-memory fallback');
    return;
  }
  try {
    const { Pool } = require('pg');
    pool = new Pool({ connectionString: dsn, ssl: dsn.includes('localhost') ? false : { rejectUnauthorized: false } });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS highscores (
        id          SERIAL PRIMARY KEY,
        player_name TEXT NOT NULL,
        room_code   TEXT NOT NULL,
        words       INTEGER NOT NULL,
        longest     TEXT NOT NULL,
        fastest_ms  INTEGER,
        won         BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS highscores_words_idx ON highscores (words DESC);
    `);
    console.log('PostgreSQL highscores ready');
  } catch (err) {
    console.warn('PostgreSQL init failed — in-memory fallback:', err.message);
    pool = null;
  }
}

async function saveGame(room) {
  const rows = [];
  for (const p of room.players.values()) {
    rows.push({
      player_name: p.name,
      room_code: room.code,
      words: p.stats.words,
      longest: p.stats.longestWord || '',
      fastest_ms: p.stats.fastestMs,
      won: p.alive && [...room.players.values()].filter((x) => x.alive).length === 1,
    });
  }
  if (pool) {
    for (const r of rows) {
      await pool.query(
        'INSERT INTO highscores (player_name, room_code, words, longest, fastest_ms, won) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.player_name, r.room_code, r.words, r.longest, r.fastest_ms, r.won]
      );
    }
  } else {
    for (const r of rows) mem.push({ ...r, created_at: new Date().toISOString() });
    mem.sort((a, b) => b.words - a.words);
    if (mem.length > 100) mem.length = 100;
  }
  cache.at = 0;
}

async function getTop(n = 10) {
  const now = Date.now();
  if (cache.at && now - cache.at < CACHE_MS) return cache.rows;
  let rows;
  if (pool) {
    const res = await pool.query(
      'SELECT player_name, room_code, words, longest, fastest_ms, won FROM highscores ORDER BY words DESC LIMIT $1',
      [n]
    );
    rows = res.rows;
  } else {
    rows = mem.slice(0, n).map((r) => ({
      player_name: r.player_name,
      room_code: r.room_code,
      words: r.words,
      longest: r.longest,
      fastest_ms: r.fastest_ms,
      won: r.won,
    }));
  }
  cache = { at: now, rows };
  return rows;
}

module.exports = { init, saveGame, getTop };
