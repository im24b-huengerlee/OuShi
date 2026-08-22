# Silbenbombe

Silbenbombe is a real-time multiplayer word game in the browser. A bomb passes from player to player; whoever holds it must type a German word containing the shown syllable before the fuse runs out. Miss it and you lose a life — last player standing wins. The twist: defuse quickly (under 3 seconds) to earn **sabotage tokens** you can spend on opponents — shorter fuses, banned letters, or double-word turns — turning a reflex game into one with strategy and target selection.

## Live Demo

*(Deploy to deplo.io — URL will be added after first deployment)*

## QuackStream Webhook

This repo integrates with [QuackStream](https://github.com/hackts-ch/QuackStream) for live commit display during the hackathon.

**Webhook settings** (GitHub → Settings → Webhooks → Add webhook):

| Field | Value |
|---|---|
| Payload URL | `https://YOUR-QUACKSTREAM-BACKEND/webhook` |
| Content type | `application/json` |
| SSL verification | Enable |
| Events | Just the **push** event |
| Active | ✓ |

Or run (after `gh auth login`):

```powershell
.\scripts\setup-quackstream-webhook.ps1 -BackendUrl "https://YOUR-QUACKSTREAM-BACKEND"
```

Test: `git commit --allow-empty -m "quacking code now" && git push` — check **Recent Deliveries** for a green checkmark.

## Contributors

- Elias Hünger (@im24b-huengerlee)

## How to Run Locally

```bash
git clone https://github.com/im24b-huengerlee/OuShi.git
cd OuShi
npm install
npm start          # http://localhost:3000
```

**No database is required locally.** Highscores use an in-memory fallback when no Postgres DSN is set. To use Postgres locally:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/silbenbombe npm start
```

To rebuild the word list (optional, `data/de.txt` is committed):

```bash
npm run build-wordlist
```

## How to Play

1. Enter your name, create a room or join with a 4-letter code, then share the link with friends.
2. When you hold the bomb, type a valid German word containing the syllable in the centre before the fuse runs out.
3. Wrong word or timeout costs one life; the same word cannot be used twice in one game.
4. Defuse in under 3 seconds to earn a sabotage token — spend it on **Kurzschluss** (shorter fuse), **Buchstabensperre** (ban a letter), or **Doppelzünder** (two words required).

## Architecture

- Single Node.js 20 process: built-in `http` serves static files and `/api/highscores`; `ws` handles game traffic on `/ws`.
- Authoritative server: fuse deadlines, word validation, and sabotage are enforced server-side.
- Compact JSON WebSocket protocol with short message keys.
- Syllables are generated at startup from `data/de.txt` by substring frequency analysis (easy / medium / hard bands per round).
- PostgreSQL on deplo.io stores the Hall of Fame; in-memory fallback for local dev.
- Client is one `public/index.html` (inline CSS + JS, no framework), gzip-served under 30 KB first load.

## Deployment

Hosted on [deplo.io](https://deplo.io) via Heroku buildpack:

- `Procfile`: `web: node server/index.js`
- Listens on `process.env.PORT`, binds `0.0.0.0`
- Postgres attached via `nctl create postgresdatabase` and service binding
- WebSocket upgrade on the same port (`wss://` in production)

## Extension Ideas

- Team mode (2v2, shared lives)
- Sudden-death endgame with 3–4 letter syllables
- Dialect dictionaries (e.g. Swiss German word list as a room option)
- Persistent player ELO
- Spectator betting
