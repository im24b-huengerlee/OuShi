# Silbenbombe — MVP Spec (Game Jam)

> **How to use this file:** open Cursor, enter **Plan Mode**, attach this file and prompt:
> *"Read SILBENBOMBE_MVP_SPEC.md. Build exactly Milestone 0 through 4, nothing beyond. Do not add frameworks, build steps or dependencies that are not listed in section 4. Keep the client bundle under 30 KB. Ask me before deviating from the spec."*

---

## 1. Elevator Pitch

A real-time multiplayer word game in the browser. A bomb passes from player to player; whoever holds it must type a word containing the shown syllable before the fuse runs out. Miss it, lose a life. Last player standing wins.

**The twist that makes this more than a jklm.fun clone — SABOTAGE:**
Every time you defuse the bomb quickly (under 3 seconds), you earn a **sabotage token**. You can spend tokens at any time on any living opponent:

| Token | Effect on target's next turn |
|---|---|
| **Kurzschluss** (short circuit) | Fuse is 40 % shorter |
| **Buchstabensperre** (letter lock) | One common letter (e.g. `e`) is banned in their word |
| **Doppelzünder** (double fuse) | They must submit **two** valid words instead of one |

This turns a pure reflex/vocabulary game into one with resource management and target selection — you decide whether to hoard tokens or knock out the strongest player. It costs roughly 120 lines of server code and completely changes the group dynamic.

**Second differentiator:** the syllables are not a hardcoded list. They are generated at server startup from the dictionary itself by frequency analysis, and the difficulty band is tuned per round (see §7). No two games feel the same, and the game auto-adapts to whatever word list you load.

**Extension potential to present to the jury:** team mode (2v2, shared lives), a "sudden death" endgame where the syllable grows to 3–4 letters, dialect dictionaries (Swiss German word list as a room option), persistent player ELO, spectator betting.

---

## 2. Hard Requirements (from the game jam brief)

These are graded. Do not skip any of them.

- [ ] Public GitHub repository
- [ ] GitHub push webhook configured (QuackStream) — see §12
- [ ] `README.md` with: project description, contributors, **complete** local setup + run instructions
- [ ] Working prototype hosted on **deplo.io**
- [ ] deplo.io used meaningfully → **PostgreSQL for the highscore / hall of fame** (§9)
- [ ] Small transferred size — this is explicitly graded. Budget: **< 30 KB total, gzipped, on first load.** No React, no bundler, no icon fonts, no images.
- [ ] Must actually work without bugs in front of a jury
- [ ] Must be understandable by a non-team-member within 10 seconds of joining

---

## 3. Non-Goals (do NOT build these)

Explicitly out of scope. If Cursor suggests them, refuse.

- User accounts, login, passwords, OAuth
- Chat
- Matchmaking / public lobby browser (room codes only)
- Sound (optional stretch at the very end, using `AudioContext` beeps only — no audio files)
- Any build step: no webpack, vite, rollup, esbuild, TypeScript compilation, tailwind, sass
- Any client framework: no React, Vue, Svelte, jQuery
- Reconnection with full state resume (a simple rejoin-as-spectator is enough)
- Mobile-native app, PWA manifest, service worker
- Animations beyond CSS transitions

---

## 4. Tech Stack (fixed)

**Runtime:** Node.js 20+ (specify `"engines": { "node": "20.x" }` in `package.json`)

**Server dependencies — exactly three, no more:**

- `ws` — WebSocket server
- `pg` — PostgreSQL client (highscores)
- *(nothing else; use the Node built-in `http` and `fs` modules to serve static files — do not add Express)*

**Client:** one `index.html` with inline `<style>` and inline `<script>`. Vanilla JS, DOM only, no canvas. No external fetches whatsoever.

**Language of the UI:** German (the game itself is played in German). Keep all user-facing strings in one `const T = {...}` object at the top of the client script so it can be switched later.

---

## 5. Repository Layout

```
/
├─ README.md
├─ package.json
├─ Procfile                  # web: node server/index.js
├─ .gitignore
├─ server/
│  ├─ index.js               # http + ws bootstrap, static file serving
│  ├─ rooms.js               # room registry, join/leave, lifecycle
│  ├─ game.js                # game state machine, turn logic, sabotage
│  ├─ dictionary.js          # word list loading, syllable generation, validation
│  └─ db.js                  # postgres highscores (with in-memory fallback)
├─ public/
│  └─ index.html             # the entire client
├─ data/
│  └─ de.txt                 # german word list, one lowercase word per line
└─ scripts/
   └─ build-wordlist.js      # one-off: fetch + normalise a word list into data/de.txt
```

---

## 6. Data Model (in-memory, server-side)

```js
Room = {
  code: "ABCD",              // 4 uppercase letters, no vowels-only, no offensive combos
  hostId: "p_1",
  players: Map<playerId, Player>,
  order: [playerId],         // seating order, stable
  state: "lobby" | "playing" | "ended",
  turnIndex: 0,
  syllable: "sch",
  usedWords: Set<string>,    // per game, prevents word reuse
  usedLetters: Map<playerId, Set<char>>,  // for the alphabet bonus
  fuseEndsAt: 1700000000000, // server timestamp in ms
  fuseTimer: TimeoutHandle,
  pendingEffects: Map<playerId, Effect[]>, // sabotage queued on a player
  settings: { lives: 3, baseFuseMs: 12000, minFuseMs: 5000 },
  roundsPlayed: 0,
  startedAt: Date
}

Player = {
  id: "p_1",                 // server-generated
  name: "Jonih",             // 1..14 chars, sanitised, unique per room
  lives: 3,
  tokens: 0,                 // sabotage tokens, max 3
  alive: true,
  connected: true,
  socket: WebSocket,
  typing: "",                // current live input, broadcast to everyone
  stats: { words: 0, longestWord: "", fastestMs: null }
}

Effect = "short" | "banLetter:e" | "double"
```

**Room codes** are 4 letters from a reduced alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ` — no `I` or `O`, they look like `1`/`0`). Rooms are deleted 60 s after the last player disconnects.

---

## 7. Dictionary & Syllable Generation (`dictionary.js`)

This is the part that gives the project technical substance. Keep it on the server — the client never downloads the word list.

**On startup:**

1. Read `data/de.txt` into a `Set<string>` (lowercase, no umlaut normalisation — accept both `strasse` and `straße` by mapping `ß→ss`, `ä→ae` etc. into a *second* normalised set used only for lookup).
2. Build a frequency map of every substring of length 2 and 3 across all words:
   ```
   counts: Map<substring, numberOfWordsContainingIt>
   ```
   (Count each word once per distinct substring — not per occurrence.)
3. Bucket the substrings by difficulty:
   - `easy`: appears in 2000+ words
   - `medium`: 500–2000 words
   - `hard`: 80–500 words
   - discard anything under 80 (unfair) or containing non-letters
4. Expose `pickSyllable(roundNumber)` which picks from `easy` for rounds 1–5, `medium` for 6–15, `hard` afterwards. Never repeat a syllable within the same game until the bucket is exhausted.

**Validation** — `validateWord(word, syllable, room, playerId)` returns `{ ok: true }` or `{ ok: false, reason }`. Checks in order:

1. Non-empty, 2–30 chars, letters only (`a-zäöüß`)
2. Contains the syllable as a substring
3. Exists in the dictionary
4. Not already used in this game (`room.usedWords`)
5. Respects any active `banLetter` effect

Reasons are short German strings the client shows in red: `"Silbe fehlt"`, `"Kein Wort"`, `"Schon benutzt"`, `"Buchstabe gesperrt"`.

**`scripts/build-wordlist.js`** downloads a public German word list, lowercases, strips words shorter than 3 or longer than 25 characters, strips anything with non-letters, dedupes, sorts, and writes `data/de.txt`. Commit the resulting file — **the deploy must not depend on a network fetch at build time.** Suitable sources: the `german-words-dictionary` npm package, or a public wordlist repo. Target 300k–800k words; if the file exceeds ~10 MB, gzip it and read it with `zlib.gunzipSync` at startup.

---

## 8. WebSocket Protocol

One WebSocket endpoint at `/ws`. All messages are JSON, `{ t: "type", ... }`. Keep keys short.

### Client → Server

| `t` | Payload | Notes |
|---|---|---|
| `join` | `{ room?, name }` | omit `room` to create a new one |
| `start` | `{}` | host only, needs ≥ 2 players |
| `typing` | `{ v }` | throttled to max 10/s client-side; ignored if not your turn |
| `submit` | `{ v }` | the word |
| `sabotage` | `{ target, kind }` | costs 1 token, only during `playing`, not on yourself |
| `again` | `{}` | host only, from `ended` back to `lobby` |
| `pong` | `{}` | reply to server ping |

### Server → Client

| `t` | Payload |
|---|---|
| `joined` | `{ you, room, state }` — `you` is your playerId |
| `state` | full room snapshot (see below) — sent on every meaningful change |
| `turn` | `{ player, syllable, fuseMs, effects }` |
| `typing` | `{ player, v }` — high-frequency, never triggers a full `state` |
| `accept` | `{ player, word, tokenEarned }` |
| `reject` | `{ player, reason }` |
| `boom` | `{ player, livesLeft }` |
| `sabotage` | `{ from, target, kind }` |
| `over` | `{ winner, highscores }` |
| `err` | `{ msg }` |

**`state` snapshot** (keep it small — this is the message sent most often):
```json
{ "t":"state", "code":"ABCD", "state":"playing", "host":"p_1", "turn":"p_3",
  "syllable":"sch", "fuseEndsAt":1700000000000,
  "players":[{"id":"p_1","n":"Jonih","l":3,"tk":1,"a":true,"c":true,"ab":"aebkm"}] }
```
(`ab` = letters already used by that player, for the alphabet bonus.)

**Rules the server must enforce (never trust the client):**
- Only the current turn holder may `submit`
- The fuse deadline is authoritative on the server; the client only animates towards `fuseEndsAt`
- Sabotage requires `tokens > 0` and a living target that is not yourself
- `start` and `again` require `hostId`

**Keepalive:** server sends a WS ping every 25 s; a socket that fails to pong twice is marked `connected: false`. If a disconnected player's turn comes up, skip them immediately and deduct a life.

---

## 9. Game Flow (state machine in `game.js`)

```
lobby ──start──> playing ──(one player left)──> ended ──again──> lobby
```

**Turn cycle:**

1. Advance `turnIndex` to the next living player.
2. Pop any queued `Effect`s for that player.
3. `syllable = pickSyllable(roundsPlayed)`. If a `banLetter` effect is active, re-pick until the syllable itself does not contain the banned letter.
4. `fuseMs = max(minFuseMs, baseFuseMs - roundsPlayed * 150)`, then `* 0.6` if `short` is active. Broadcast `turn`.
5. On valid `submit`: clear timer, mark word used, add letters to the player's alphabet set, award a sabotage token if it took < 3000 ms, award an extra life if their alphabet set now covers all of `a-z` (then reset that set), broadcast `accept`, go to 1. If `double` is active, require a second word with the same syllable before advancing.
6. On invalid `submit`: broadcast `reject`, **do not** reset the fuse — the player keeps trying.
7. On timeout: `lives--`, broadcast `boom`, eliminate at 0 lives, go to 1.
8. When one living player remains: `state = "ended"`, persist the result (§10), broadcast `over`.

**Timing:** use a single `setTimeout` per turn, cleared on every submit. Do not run a global game loop.

---

## 10. Persistence — PostgreSQL on deplo.io (`db.js`)

This is what makes the deplo.io usage "meaningful" for grading. Keep it to one table.

```sql
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
```

Run this `CREATE TABLE IF NOT EXISTS` at server startup — no migration tooling.

**Connection:** deplo.io injects the DSN as an environment variable. Read it defensively:
```js
const dsn = process.env.NINE_PGDB_DB_DSN || process.env.NINE_PG_DB_DSN || process.env.DATABASE_URL;
```
**If `dsn` is undefined, fall back to an in-memory array and log a warning — the game must still run locally with zero setup.** This matters for the README's "how to run" requirement.

**Written:** one row per player at game end.
**Read:** `GET /api/highscores` returns the top 10 by `words`, shown on the lobby screen and the game-over screen ("Hall of Fame"). Cache for 30 s in memory.

---

## 11. Client UI (`public/index.html`)

Three screens, toggled by a CSS class on `<body>`. Dark theme, one accent colour, system font stack, no images.

**1. Home**
Name input, "Raum erstellen" button, room code input + "Beitreten". Below: the Hall of Fame table.

**2. Lobby**
Big room code + a "Link kopieren" button (copies `location.origin + "?r=CODE"`). Player list. Host sees "Starten" (disabled below 2 players). A 3-line rules box — **this is what makes the game intuitive to a stranger, do not skip it.**

**3. Game**
- Players arranged in a ring (CSS `transform: rotate()` on evenly spaced absolutely positioned cards, counter-rotated content — no canvas). Each card: name, hearts for lives, token count, and the live `typing` text of the current player.
- Centre: the syllable in large type, and a fuse ring — an SVG `<circle>` with animated `stroke-dashoffset`, driven by `requestAnimationFrame` from `fuseEndsAt - Date.now()`. Turns red under 3 s.
- Bottom: the word input (auto-focused only when it is your turn), and a sabotage bar — one button per token type, then click a player card to target.
- Active effects on your turn are shown as a badge next to the syllable (`⚡ Kurzschluss`, `🔒 kein E`, `✌ 2 Wörter`).

**Clock skew:** on `joined`, the server includes its `now`; the client stores `offset = serverNow - Date.now()` and applies it to every `fuseEndsAt`. Otherwise fuses look wrong on machines with a drifting clock.

**Mobile:** the input must work on a phone keyboard (`autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false"`). Ring layout collapses to a vertical list under 600 px.

**Size discipline:** minify nothing by hand, but ship `Content-Encoding: gzip` from the static handler (`zlib.gzipSync` the file once at startup and serve the buffer). Verify in DevTools → Network that the total first load is under 30 KB.

---

## 12. Deployment to deplo.io

**Application code requirements:**
- Listen on `process.env.PORT || 3000` and bind to `0.0.0.0`. Buildpack platforms inject `PORT`; a hardcoded port will fail to route.
- `Procfile` with a single line: `web: node server/index.js`
- Do **not** add a `build` script that needs network access.
- WebSockets must be served on the same port and host as the HTTP server (upgrade the same `http.Server`), and the client must connect with `wss://` when `location.protocol === "https:"`.

**Deployment steps (do these FIRST, before writing game logic):**

```bash
# 1. install the CLI and log in
nctl auth login

# 2. create the app from the public repo
nctl create app silbenbombe \
  --git-url=https://github.com/<org>/<repo> \
  --git-revision=main \
  --buildpack-stack=heroku

# 3. create the database and attach it
nctl create postgresdatabase silbenbombe-db
nctl update app silbenbombe --service db=postgresdatabase/silbenbombe-db

# 4. force a release so the DSN env var is injected
nctl update app silbenbombe --retry-release

# 5. watch the build and get the URL
nctl get app silbenbombe
nctl logs app silbenbombe
```

Verify the exact flags against the live docs — the CLI changes. If `nctl` is unavailable, the deplo.io web console does the same thing.

**QuackStream webhook (graded, takes 2 minutes):**
GitHub repo → Settings → Webhooks → Add webhook
- Payload URL: the URL the organisers give you, with `/webhook` appended
- Content type: `application/json`
- SSL verification: enabled
- Events: **"Just the push event"** only
- Active: checked
Then push an empty commit (`git commit --allow-empty -m "webhook test" && git push`) and confirm a green delivery under "Recent Deliveries".

---

## 13. README.md Requirements (graded)

The README must contain, in this order:

1. **Project title + one-paragraph description** — what the game is and what the sabotage twist adds
2. **Live demo** — the deplo.io URL
3. **Screenshot or GIF** (optional but cheap and worth it)
4. **Contributors** — every team member by name and GitHub handle
5. **How to run locally** — must be complete enough that someone with only Node installed can play:
   ```bash
   git clone <repo>
   cd <repo>
   npm install
   npm start          # opens on http://localhost:3000
   ```
   State explicitly that **no database is required locally** (in-memory fallback) and how to attach one if wanted (`DATABASE_URL=postgres://...`).
6. **How to play** — 4 bullet points, including the sabotage tokens
7. **Architecture** — a 10-line overview: single Node process, authoritative server, WS protocol, syllables generated from the dictionary by frequency analysis, Postgres for the hall of fame
8. **Deployment** — how it is hosted on deplo.io
9. **Extension ideas** — the list from §1 (this is directly graded as "Potential")

---

## 14. Milestones — build strictly in this order

**M0 — Skeleton & deploy (target 45 min)**
Repo, `package.json`, `Procfile`, `server/index.js` serving a "Hello" `public/index.html` on `process.env.PORT`. Push. Webhook configured. **Deployed and reachable on deplo.io.** Do not proceed until the URL loads in a browser.

**M1 — Rooms & lobby (target 60 min)**
WS server, join/create, room codes, player list, host, start button, `state` broadcast. Two browser tabs can see each other. Still no gameplay.

**M2 — Core loop (target 90 min)**
Dictionary loading, syllable generation, turn rotation, fuse timer, submit/validate, lives, elimination, winner. Live typing broadcast. **After this milestone the game is playable — this is the point of no return; if you are out of time, stop adding features and polish.**

**M3 — Sabotage + alphabet bonus (target 45 min)**
Tokens, the three effects, targeting UI, effect badges.

**M4 — Persistence & polish (target 45 min)**
Postgres table, write on game over, `/api/highscores`, Hall of Fame on home + game-over screens. Gzip static serving. Rules box. Mobile layout check.

**Stretch, only if everything above is done and stable:** AudioContext tick/explosion beeps, spectator mode for late joiners, 3-letter sudden-death syllables after round 25, team mode.

---

## 15. Acceptance Criteria

Test all of these before presenting. This is the "does it have bugs" grade.

- [ ] Two tabs can create + join a room and start a game
- [ ] Four players can play a full game to a winner without a server crash
- [ ] A valid word is accepted; the same word a second time is rejected
- [ ] A word without the syllable is rejected and the fuse keeps running
- [ ] Timeout costs exactly one life and passes the bomb
- [ ] A player closing their tab mid-game does not freeze the game
- [ ] The host leaving promotes another player to host
- [ ] Joining a room code that does not exist shows a clean error, not a crash
- [ ] Sabotage cannot be used with 0 tokens, on yourself, or on a dead player
- [ ] Refreshing during a game returns you to the home screen without breaking the room
- [ ] The game runs locally with no `DATABASE_URL` set
- [ ] Highscores appear after a completed game on the deployed instance
- [ ] DevTools Network shows first load < 30 KB transferred
- [ ] Works on a phone browser over the deployed URL
- [ ] A person who has never seen the game can join and play without being told the rules verbally

---

## 16. Guardrails for the AI agent

- Do not install dependencies beyond `ws` and `pg`.
- Do not introduce TypeScript, a bundler, or a frontend framework.
- Do not split `public/index.html` into separate CSS/JS files — one file, inlined, keeps the transferred size and the deploy simple.
- Do not add authentication, chat, or a public room browser.
- Keep every server file under ~300 lines. If one grows past that, the design is wrong — stop and ask.
- Validate every client message server-side; assume the client is hostile.
- Prefer clarity over cleverness: this code will be read by a jury.
