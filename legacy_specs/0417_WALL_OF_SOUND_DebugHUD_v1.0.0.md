# 0417_WALL_OF_SOUND_DebugHUD_v1.0.0.md

## Scope
Single-file patch: `main.js`  
Goal: Add visual debug overlay to inspect Blueprint + Sound state per particle

---

## Step 4.5 — Visual Blueprint Debug HUD

This step adds a lightweight overlay to display:

- Particle note (actual sound note)
- Blueprint note (expected note)
- Velocity
- Played state (_played)

---

## 1. Add Debug Toggle

Add near state.ui:

```js
state.ui.debugHUD = true;
```

---

## 2. Add Debug Draw Function

Add BELOW drawParticleOverlays():

```js
function drawDebugHUD() {
  if (!state.ui.debugHUD) return;
  if (!state.balls || !state.balls.length) return;

  const ctx = canvas.getContext("2d");

  ctx.save();
  ctx.font = "10px monospace";
  ctx.textAlign = "center";

  state.balls.forEach(function (ball) {
    if (!ball || !ball.sound || !ball.blueprint) return;

    const note = ball.sound?.midi?.note ?? "--";
    const noteName = NOTE_NAMES[note % 12] || "?";

    const bpNote = ball.blueprint?.note ?? "--";
    const bpName = NOTE_NAMES[bpNote % 12] || "?";

    const speed = Math.hypot(ball.vx || 0, ball.vy || 0).toFixed(1);
    const played = ball._played ? "1" : "0";

    const text = `${noteName}/${bpName} v:${speed} p:${played}`;

    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(text, ball.x, ball.y - (ball.renderRadius + 10));
  });

  ctx.restore();
}
```

---

## 3. Hook Into Render Loop

Inside renderFrame(), AFTER drawParticleOverlays():

```js
drawDebugHUD();
```

---

## 4. Optional Color Coding (mismatch highlight)

Replace fillStyle line with:

```js
ctx.fillStyle =
  note === bpNote
    ? "rgba(100,255,180,0.9)"   // correct
    : "rgba(255,80,80,0.95)";   // mismatch
```

---

## Expected Result

Each particle displays:

```text
C/D# v:3.2 p:1
```

Meaning:
- Actual note = C
- Blueprint note = D#
- Velocity = 3.2
- Played state = triggered

---

## Usage

- Spawn particles
- Watch text above each particle
- Look for mismatches (red text)

---

## Implementation Guide

- Where: `main.js` → render layer only
- Run: reload app
- Expect: live note debugging directly on particles
