# 0412_WALL_OF_SOUND_UI_SoundResponse_v1.0.0

Date: 04/12/2026

---

## Objective

Expose collision-based sound behavior (density + velocity) to UI controls and visual feedback.

This adds:

- User control over sound response
- Visual awareness of system behavior
- Zero impact on physics or timing stability

---

## Assumptions

- Existing system is stable
- `midiOutput.handle` already implemented
- `tick()` already computes `collisions`
- `state.collisionCount` already exists

---

## STEP 1 — State Additions

Add to main `state` object:

```js
soundResponse: {
  densityHarmonics: true,
  velocityDynamics: true,
  sensitivity: 1.0
}
```

---

## STEP 2 — UI Controls (HTML)

Add inside controls panel:

```html
<div class="panel-block">
  <label>SOUND RESPONSE</label>

  <div class="control-row">
    <label>Density Harmonics</label>
    <input type="checkbox" id="densityHarmonicsToggle" checked />
  </div>

  <div class="control-row">
    <label>Velocity Dynamics</label>
    <input type="checkbox" id="velocityDynamicsToggle" checked />
  </div>

  <div class="control-row">
    <label>Sensitivity</label>
    <input
      type="range"
      id="soundSensitivity"
      min="0.5"
      max="2"
      step="0.1"
      value="1.0"
    />
  </div>
</div>
```

---

## STEP 3 — Bind Controls

Inside `bindControls()`:

```js
elements.densityHarmonicsToggle.addEventListener("change", function () {
  state.soundResponse.densityHarmonics = this.checked;
});

elements.velocityDynamicsToggle.addEventListener("change", function () {
  state.soundResponse.velocityDynamics = this.checked;
});

elements.soundSensitivity.addEventListener("input", function () {
  state.soundResponse.sensitivity = Number(this.value);
});
```

---

## STEP 4 — MIDI Logic Update

Inside `midiOutput.handle`:

```js
const rawNote = typeof sound.midi.note === "number" ? sound.midi.note : 60;

const density = getDensityLevel(state.collisionCount || 0);

let note = rawNote;

if (state.soundResponse.densityHarmonics) {
  if (density === "mid") note = rawNote + 7;
  if (density === "high") note = rawNote + 12;
}

let velocity = 80;

if (state.soundResponse.velocityDynamics) {
  const speed = Math.hypot(sourceObject.vx || 0, sourceObject.vy || 0);
  const scaled = speed * 20 * state.soundResponse.sensitivity;

  velocity = Math.min(127, Math.max(40, scaled));
}
```

---

## STEP 5 — Visual HUD

Inside `renderFrame()`:

```js
drawSoundHUD();
```

---

### Add function:

```js
function drawSoundHUD() {
  const ctx = canvas.getContext("2d");

  const density = getDensityLevel(state.collisionCount || 0);

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "14px monospace";

  ctx.fillText("Density: " + density.toUpperCase(), 20, 40);

  ctx.restore();
}
```

---

## Notes

- No changes to physics
- No changes to collision system
- No changes to timing
- Fully reversible
- Safe for live use

---

## Implementation Guide

- where  
  main.js (state, bindControls, midiOutput.handle, renderFrame)

- run  
  paste changes → reload app

- expect  
  UI toggles control sound behavior  
  visible density feedback  
  immediate improvement in perceived interaction
