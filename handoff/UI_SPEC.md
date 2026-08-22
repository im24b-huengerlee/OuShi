# Silbenbombe — UI Spec (Rev 2026-08-22)

> **How to use this file:** open Cursor in Plan Mode, attach this file **and** the four PNGs in
> `handoff/design/`, and prompt:
>
> *"Read UI_SPEC.md and look at handoff/design/*.png. Restyle public/index.html to match it exactly:
> replace the `<style>` block with §5, apply the markup changes in §6, make the four script changes in
> §7. Keep every existing element id and the WebSocket protocol untouched. Do not add dependencies, a
> build step, or a framework. Keep first load under 30 KB gzipped. Ask me before deviating."*

Reference renders (all four screens at 900 px desktop width):

| Screen | Image |
|---|---|
| 01 Home + Hall of Fame | `handoff/design/01-home.png` |
| 02 Lobby | `handoff/design/02-lobby.png` |
| 03 Game (ring, fuse, sabotage) | `handoff/design/03-game.png` |
| 04 Ende | `handoff/design/04-ende.png` |

---

## 1. Design language

The UI is a **technical drawing of a device**, not a dark neon game. Four rules govern everything:

1. **Ground is paper.** `#f2f2f3` with ink `#1d1f20`. No dark theme.
2. **Every container is a plate**: 1px hairline rectangle, no fill, four `+` registration marks at the
   corners. Square corners only — `border-radius: 0` everywhere. Elevation is a hairline, never a shadow.
3. **One solid object per screen.** The primary button is the only filled element. Everything else is a
   line drawing, so the action is unmissable without introducing a second colour.
4. **Danger without red.** The palette is mono steel. Urgency escalates by *inversion*: under 3 s the
   fuse plate flips to the deepest steel with paper type; an explosion flashes the plate inverted for
   220 ms. There are **no gradients anywhere** in this product.

---

## 2. Tokens

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f2f2f3` | page ground |
| `--ink` | `#1d1f20` | all body copy, focused borders |
| `--muted` | `#7a7a7d` | labels, meta |
| `--line` | `#c9cbcd` | every hairline |
| `--rule` | `#e7e7ea` | table row rules |
| `--accent` | `#5980a6` | marks, primary fill, syllable |
| `--a7` | `#416180` | accent text, primary hover |
| `--a9` | `#1d2d3d` | inverted field, alarm, pressed |
| `--a3` | `#b5d9fd` | marks on filled objects, alarm stroke |
| `--tint` | `#eef6ff` | hover wash, active row |
| `--off` | `#b7b7ba` | disabled fill, spent-life outline |

Accent-on-paper is tuned to ~3:1 — fine for large type and chrome, **not** for paragraph text. For
body-size text in the accent use `--a7`.

**Type — one Google Fonts request:**

```html
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
```

- **Barlow Condensed 700**, uppercase, ls `.01em` — wordmark, room code, syllable, winner name
- **Barlow Condensed 600**, uppercase — h1/h2, all buttons
- **Barlow 400/500** — body, player names, table cells
- **System mono** (`ui-monospace, "SF Mono", Menlo, monospace`) — labels, kickers, numerals, countdown

Keep the `system-ui, sans-serif` fallback so first paint never blocks. Fonts are served from Google's
CDN and are not part of the 30 KB document budget.

**Space:** 3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2 px. **Radius: 0.** (The design system's 4 px radius is
deliberately overridden — a rounded corner on a 1px hairline reads as an accident in a drafting language.)

---

## 3. Screens

### 01 Home
Kicker (`WORT-BOMBE MIT SABOTAGE`) over a 62px condensed wordmark; DE/EN toggle top right. Two plates
side by side: **left** = name field, `Raum erstellen` (the one filled button), an `ODER` divider, then
the room-code field + outlined `Beitreten`; **right** = Hall of Fame table. Room code field is
condensed, uppercase, tracked `.34em` so four letters fill the box.

### 02 Lobby
The room code is **four boxed letters** (62×78 cells, ink border, 48px condensed) — reads out loud
correctly across a room and never looks like a word. `Link kopieren` is an outlined button beside it.
Player list: one hairline row each, your own row washed `--tint`, host marked with an outlined mono chip
(`HOST · DU`), remaining seats drawn as dashed `FREIER PLATZ` placeholders up to the room max. Right
column: the rules plate numbered `01–03` in accent mono (this is the ten-second onboarding the MVP spec
grades — never collapse it), then `Starten` as the filled primary with the caption
`ab 2 Spielern · nur Host` beneath.

### 03 Game
Five player plates arranged on an ellipse (rx 300 / ry 150) around a **square fuse plate** in the centre.

- **Fuse:** 240×240 plate holding a 232×232 `<rect>` with `stroke-dasharray: 928`, animated via
  `stroke-dashoffset` from `fuseEndsAt` — same one-element SVG as a ring, but it belongs to this
  language. Inside: `SILBE` kicker, the syllable at 86px condensed, remaining seconds in mono to one
  decimal, and active effect badges as outlined mono chips.
- **Under 3 s:** the plate inverts — field `--a9`, syllable and numerals paper, stroke `--a3`.
- **Player plate:** name, three 9px life cells (filled = alive, hairline = spent — no hearts, no emoji),
  token count as `n TK` in accent mono, and the live typing line in mono with a blinking accent caret.
  The active player's plate is larger (170×78), ink-bordered, tint-filled, marked, and labelled `AM ZUG`.
  Eliminated players sit at 45 % opacity with the name struck through.
- **Bottom:** the word input as a wide ink-bordered plate (28px condensed, tracked) with
  `ENTER = ABSCHICKEN` on the right, then the sabotage bar — always visible, all three buttons,
  `disabled` at zero tokens, the selected kind taking the accent border and tint, and a
  `→ Ziel wählen` hint until a target plate is clicked. Targetable plates get `cursor: crosshair`.

### 04 Ende
A full-bleed `--a9` band — **the only inverted field in the product** besides the sub-3 s fuse: kicker
`ENTSCHÄRFT — GEWINNER`, the winner's name at 76px condensed, and three stats
(`WÖRTER`, `LÄNGSTES`, `SCHNELLSTE`) pulled from the `Player.stats` object that already exists
server-side. Below, on paper: the Hall of Fame with your row tinted and set to 600, `Nochmal` as the
filled primary (hidden for non-hosts), `Zur Startseite` outlined.

---

## 4. Interaction states

Never a browser default. Nothing moves, scales or lifts on hover.

| Element | Rest | Hover | Active | Focus-visible | Disabled |
|---|---|---|---|---|---|
| Primary button | fill `--accent`, marks `--a3` | fill `--a7`, marks `#d6ebff` | fill `--a9` | 2px `--a9` ring, offset 2 | fill `--off`, marks off, `not-allowed` |
| Outlined button | 1px `--ink` | border `--accent`, bg `--tint`, text `--a9` | bg `--a3` | 2px `--accent` ring | 45 % opacity |
| Input | 1px `--line` | border `--muted` | — | border `--ink` + 2px accent ring | border `--line`, text `--off` |
| Player plate (aiming) | 1px `--line` | border `--accent`, bg `--tint`, crosshair | — | — | — |
| Sabotage button | 1px `--line`, text `#5d5d60` | border `--accent`, bg `--tint` | — | 2px accent ring | border `--rule`, text `--off` |

**Motion budget** (MVP spec allows CSS transitions only): button `background .12s`; plate
border/background `.15s`; fuse stroke colour `.2s`; the 220 ms invert flash on `boom`; caret blink as a
1 s step keyframe. Nothing else.

---

## 5. Stylesheet — replaces the whole `<style>` block in `public/index.html`

~4.6 KB raw.

```css
:root{
 --bg:#f2f2f3; --ink:#1d1f20; --muted:#7a7a7d; --line:#c9cbcd; --rule:#e7e7ea;
 --accent:#5980a6; --a7:#416180; --a9:#1d2d3d; --a3:#b5d9fd; --tint:#eef6ff; --off:#b7b7ba;
 --f-h:"Barlow Condensed",system-ui,sans-serif; --f-b:"Barlow",system-ui,sans-serif;
 --f-m:ui-monospace,"SF Mono",Menlo,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font:400 17px/1.55 var(--f-b);min-height:100vh}
::selection{background:var(--a3)}
.screen{display:none;max-width:900px;margin:0 auto;padding:40px 24px 48px}
.screen.on{display:block}
h1{font:700 62px/0.9 var(--f-h);text-transform:uppercase;letter-spacing:.01em}
h2{font:600 30px/1 var(--f-h);text-transform:uppercase;letter-spacing:.02em}
.kick{font:400 10px/1.4 var(--f-m);letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}

/* plates: hairline rectangle + registration marks */
.plate{position:relative;border:1px solid var(--line);padding:24px 26px}
.plate::before,.plate::after,.plate>.m1,.plate>.m2{position:absolute;color:var(--accent);font-size:12px;line-height:1;content:"+"}
.plate::before{left:-5px;top:-9px}
.plate::after{right:-5px;top:-9px}
.plate>.m1{left:-5px;bottom:-7px}
.plate>.m2{right:-5px;bottom:-7px}

/* buttons — the primary is the only filled object on a screen */
button{font:600 19px/1 var(--f-h);text-transform:uppercase;letter-spacing:.08em;
 padding:14px 18px;border:0;border-radius:0;cursor:pointer;
 background:var(--accent);color:var(--bg);transition:background .12s}
button:hover{background:var(--a7)}
button:active{background:var(--a9)}
button:disabled{background:var(--off);cursor:not-allowed}
button.ghost{background:transparent;color:var(--ink);border:1px solid var(--ink);padding:13px 18px;
 transition:background .12s,border-color .12s}
button.ghost:hover{border-color:var(--accent);background:var(--tint);color:var(--a9)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button:not(.ghost):focus-visible{outline-color:var(--a9)}

/* fields */
label{display:block;font:400 10px/1.4 var(--f-m);letter-spacing:.14em;text-transform:uppercase;color:#5d5d60;margin-bottom:7px}
input{font:500 17px/1.2 var(--f-b);padding:11px 13px;border:1px solid var(--line);
 border-radius:0;background:transparent;color:var(--ink);width:100%;transition:border-color .12s}
input:hover{border-color:var(--muted)}
input:focus{border-color:var(--ink);outline:2px solid var(--accent);outline-offset:2px}
#codeIn{font:400 19px/1.2 var(--f-h);letter-spacing:.34em;text-transform:uppercase}
.row{display:flex;gap:10px;align-items:stretch}
.row button{flex:0 0 auto}
.err{font:400 11px/1.4 var(--f-m);letter-spacing:.1em;text-transform:uppercase;color:var(--a9);min-height:1.2em}
.or{display:flex;align-items:center;gap:12px;font:400 10px/1 var(--f-m);letter-spacing:.14em;color:#98989b}
.or::before,.or::after{content:"";flex:1;height:1px;background:#d4d4d7}

/* language toggle */
#langSeg{display:flex;border:1px solid var(--line)}
#langSeg button{background:transparent;color:#5d5d60;font-size:15px;padding:7px 14px;letter-spacing:.06em}
#langSeg button:hover{background:var(--tint);color:var(--a9)}
#langSeg button.on{background:var(--accent);color:var(--bg)}

/* tables */
table{width:100%;border-collapse:collapse}
th{font:400 10px/1.4 var(--f-m);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
 text-align:left;padding:0 0 8px;border-bottom:1px solid var(--ink)}
td{padding:9px 0;font-size:16px;border-bottom:1px solid var(--rule)}
th+th,td+td{text-align:right}
td+td{font-family:var(--f-m);font-size:15px}
tr.you td{background:var(--tint);font-weight:600}

/* lobby */
.codecells{display:flex;gap:10px}
.codecells span{width:62px;height:78px;border:1px solid var(--ink);display:grid;place-items:center;
 font:700 48px/1 var(--f-h)}
.players{list-style:none;display:flex;flex-direction:column;gap:6px}
.players li{border:1px solid var(--line);padding:12px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:500}
.players li.you{background:var(--tint)}
.players li.free{border-style:dashed;border-color:#d4d4d7;color:var(--off);
 font:400 11px/1 var(--f-m);letter-spacing:.12em;text-transform:uppercase}
.tag{font:400 10px/1 var(--f-m);letter-spacing:.14em;text-transform:uppercase;
 border:1px solid var(--accent);color:var(--a7);padding:3px 7px}
.rules div{display:flex;gap:12px;align-items:baseline;font-size:16px;line-height:1.5}
.rules div i{font-family:var(--f-m);font-size:12px;color:var(--accent);font-style:normal}

/* game — ring of plates around the square fuse */
.ring{position:relative;height:430px;margin:8px 0 10px}
.ring .card{position:absolute;width:150px;height:74px;border:1px solid var(--line);
 padding:9px 11px;display:flex;flex-direction:column;gap:5px;
 transition:border-color .15s,background .15s}
.ring .card.active{width:170px;height:78px;border-color:var(--ink);background:var(--tint)}
.ring .card.dead{opacity:.45}
.ring .card.dead .n{text-decoration:line-through}
.ring .card .n{font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ring .card .meta{display:flex;gap:4px;align-items:center}
.ring .card .life{width:9px;height:9px;background:var(--ink)}
.ring .card .life.off{background:none;border:1px solid var(--off)}
.ring .card .tk{margin-left:6px;font:400 10px/1 var(--f-m);color:var(--a7)}
.ring .card .tk.zero{color:#98989b}
.ring .card .type{font:400 13px/1.2 var(--f-m);color:var(--a9);min-height:1.2em}
.ring .card .type:empty::before{content:"—";color:var(--off)}
.aiming .card.targetable{cursor:crosshair}
.aiming .card.targetable:hover{border-color:var(--accent);background:var(--tint)}

.center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:240px;height:240px;
 display:grid;place-items:center;transition:background .2s}
.center svg{position:absolute;inset:0;width:240px;height:240px}
.center rect{fill:none;stroke-width:2}
.fuse-bg{stroke:#d4d4d7}
.fuse-fg{stroke:var(--accent);transition:stroke .2s}
.inner{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px}
.syl{font:700 86px/0.85 var(--f-h);letter-spacing:.02em}
.secs{font:400 22px/1 var(--f-m);color:var(--a7)}
.badges{display:flex;gap:6px}
.badges span{font:400 9px/1 var(--f-m);letter-spacing:.12em;text-transform:uppercase;
 border:1px solid var(--accent);color:var(--a7);padding:3px 6px}
/* alarm: the only other inverted field in the product */
.center.alarm{background:var(--a9)}
.center.alarm .syl,.center.alarm .secs{color:var(--bg)}
.center.alarm .fuse-fg{stroke:var(--a3)}
.center.alarm .badges span{border-color:var(--a3);color:var(--a3)}
.center.boom{background:var(--a9);animation:flash .22s steps(1) 1}
@keyframes flash{0%{background:var(--a9)}100%{background:transparent}}

#wordIn{font:400 28px/1.2 var(--f-h);letter-spacing:.06em;border-color:var(--ink);padding:15px 18px}
#wordIn:disabled{border-color:var(--line);color:var(--off)}
.hint{font:400 10px/1 var(--f-m);letter-spacing:.14em;text-transform:uppercase;color:#98989b}
.caret{color:var(--accent);animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}

.sabotage{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.sabotage button{background:transparent;border:1px solid var(--line);color:#5d5d60;
 font-size:16px;padding:9px 13px;transition:border-color .12s,background .12s,color .12s}
.sabotage button:hover:not(:disabled){border-color:var(--accent);background:var(--tint);color:var(--a9)}
.sabotage button.sel{border-color:var(--accent);background:var(--tint);color:var(--a9)}
.sabotage button:disabled{background:transparent;border-color:var(--rule);color:var(--off)}

/* game over — the single accent field, full bleed */
#over{max-width:none;padding:0}
.winner{background:var(--a9);color:var(--bg);padding:52px 44px 46px;
 display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:24px}
.winner .name{font:700 76px/0.9 var(--f-h);text-transform:uppercase}
.winner .kick{color:#94bce3}
.stats{display:flex;gap:36px;text-align:right}
.stats b{display:block;font:700 40px/1 var(--f-h)}
.overbody{max-width:900px;margin:0 auto;padding:36px 24px 48px;
 display:grid;grid-template-columns:1.2fr 1fr;gap:40px;align-items:start}

@media (max-width:720px){
 h1{font-size:44px}
 .screen{padding:24px 16px 40px}
 .ring{height:auto;display:flex;flex-direction:column;gap:8px}
 .ring .card{position:static!important;transform:none!important;width:100%;height:auto}
 .ring .card.active{width:100%}
 .center{position:static;transform:none;margin:16px auto;order:-1}
 .codecells span{width:48px;height:60px;font-size:36px}
 .syl{font-size:64px}
 .winner{padding:36px 20px}
 .winner .name{font-size:52px}
 .stats{gap:20px;text-align:left}
 .overbody{grid-template-columns:1fr;padding:24px 16px 40px}
 #wordIn{font-size:22px;padding:14px}
 .sabotage button{flex:1 1 30%}
}
```

---

## 6. Markup changes — keep every existing id

| Target | Change |
|---|---|
| `#roomCode` | now holds four `<span>` cells inside `.codecells`, one per letter |
| `#langSeg` | **new**, top right of each screen header; two buttons with `data-l="de\|en"` |
| `.plate` | wrap each panel; add two empty `<span class="m1">` / `<span class="m2">` (the other two marks are pseudo-elements) |
| `.card .meta` | three `span.life` (add `.off` when spent) + `span.tk`, replacing the hearts string |
| `.center` | two `<rect>` in the SVG (`.fuse-bg` + `#fuseArc`), then `.inner` holding `.syl`, `.secs` (id `secs`), `.badges` |
| `#sabotage` | always rendered with all three buttons; `disabled` at zero tokens |
| `#over` | `.winner` band (full bleed) + `.overbody` grid holding `#hofOver` and the two buttons |

Everything else keeps its current id and event wiring.

---

## 7. Script changes — no protocol change

```js
// 1 — square fuse: perimeter of a 232x232 rect
const PERI = 928;
arc.style.strokeDasharray = PERI;
arc.style.strokeDashoffset = PERI * (1 - pct);
$('secs').textContent = (left / 1000).toFixed(1) + 's';
center.classList.toggle('alarm', left < 3000 && left > 0);

// 2 — lives as cells, not hearts
function lives(n, max) {
  let s = '';
  for (let i = 0; i < max; i++)
    s += '<span class="life' + (i < n ? '' : ' off') + '"></span>';
  return s;
}

// 3 — aiming mode toggles the crosshair affordance
document.getElementById('game').classList.toggle('aiming', !!sabotageKind);

// 4 — language, persisted
const L = localStorage.getItem('lang') || 'de';
const t = (k) => STR[L][k] || STR.de[k];
```

Keep the string table as one object with both locales, per the MVP spec:
`const STR = { de: {…}, en: {…} }`. Every user-facing string goes through `t()` — **including the
server's rejection reasons**. Map them by key (`noSyllable`, `noWord`, `used`, `banned`) instead of
sending German sentences over the socket; that is a one-line change in `server/dictionary.js`
(return the key, not the sentence).

---

## 8. Acceptance

- [ ] `grep -i gradient public/index.html` returns nothing
- [ ] Every button has a distinct hover, active, focus-visible and disabled state
- [ ] Exactly one filled accent object per screen; one inverted field on the end screen
- [ ] No `border-radius` above 0 and no `box-shadow` in the stylesheet
- [ ] Fuse reaches the full plate perimeter exactly at 0 and inverts under 3 s
- [ ] DE/EN toggle switches every visible string and survives a reload
- [ ] Under 720 px the ring becomes a list with the fuse plate first; nothing overlaps
- [ ] First load still under 30 KB gzipped (fonts excluded), verified in DevTools
