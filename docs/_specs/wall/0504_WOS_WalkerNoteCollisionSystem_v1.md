# 0504_WOS_WalkerNoteCollisionSystem_v1.0.0.md

---

## 🧠 SYSTEM OVERVIEW

This system establishes a **causal relationship** between:

- Walker (playhead / moving agent)
- Notes (MIDI-derived nodes on path)
- Sound (event-driven output)

It converts MIDI from a **visual sequence** into a **reactive physics system**.

---

## 🎯 OBJECTIVES

1. Make note triggering **visually legible**
2. Introduce **physical interaction** between walker and notes
3. Preserve **timing precision** while allowing expressive motion
4. Route all interactions through **eventBus → sampler pipeline**

---

## 🧩 CORE MODEL

### Walker

- Moving agent (playhead)
- Travels along path but may deviate between notes
- Emits events only via **collision with notes**

### Note Node

- Spatial representation of MIDI note
- Has **trigger radius**
- Emits sound + visual response on collision

---

## 🧬 DATA STRUCTURES

### Note Object

```js
/**
 * Represents a MIDI note placed on a stroke path
 */
type NoteNode = {
  id: string;
  x: number;
  y: number;

  pitch: number;        // full MIDI note (not noteClass)
  velocity: number;     // 0–127
  duration: number;     // seconds

  triggerRadius: number; // collision threshold

  visual: {
    baseSize: number;
    scale: number;      // animated scale
    glow: number;       // 0–1 intensity
    hue: number;        // derived from pitch
  };

  behavior: {
    bounce: number;     // impulse strength
    gravity: number;    // optional force modifier
    stickiness: number; // slows walker briefly
  };

  state: {
    lastTriggerTime: number;
    cooldownMs: number;
    active: boolean;
  };
};
```

---

### Walker Object

```js
/**
 * Moving playhead
 */
type Walker = {
  id: string;

  x: number;
  y: number;

  vx: number;
  vy: number;

  radius: number;

  mode: 'rail' | 'drift' | 'gravity' | 'bounce';

  audioEnabled: boolean; // default false (collision-driven only)

  state: {
    lastCollisionTime: number;
  };
};
```

---

## ⚙️ COLLISION SYSTEM

### Detection

```js
function detectWalkerNoteCollision(walker, note) {
  const dx = walker.x - note.x;
  const dy = walker.y - note.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  return dist <= walker.radius + note.triggerRadius;
}
```

---

### Resolution

```js
function resolveWalkerNoteCollision(walker, note, now) {
  // cooldown guard
  if (now - note.state.lastTriggerTime < note.state.cooldownMs) return;

  note.state.lastTriggerTime = now;

  // 1. EMIT SOUND EVENT
  emitEvent({
    type: "note_trigger",
    source: walker.id,
    target: note.id,
    energy: note.velocity / 127,
    midi: {
      note: note.pitch,
      velocity: note.velocity,
      channel: 1,
    },
  });

  // 2. APPLY PHYSICAL RESPONSE
  applyImpulse(walker, note);

  // 3. TRIGGER VISUAL FEEDBACK
  triggerNoteVisual(note);
}
```

---

## 🔊 EVENT ROUTING

### Event Contract

```js
/**
 * Routed through existing WOS eventBus
 */
emitEvent({
  type: "note_trigger",
  source: walker.id,
  target: note.id,

  energy: number, // normalized velocity

  midi: {
    note: number,
    velocity: number,
    channel: number,
  },
});
```

---

### Integration Points

- `eventBus.triggerEvent(...)` → existing pipeline
- `resolveNoteAndSample()` → uses full MIDI note
- `oscillatorOutput.handle()` → unchanged

---

## 🧲 PHYSICS RESPONSE

### Impulse Application

```js
function applyImpulse(walker, note) {
  // direction from note → walker
  const dx = walker.x - note.x;
  const dy = walker.y - note.y;

  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const nx = dx / len;
  const ny = dy / len;

  const strength = note.behavior.bounce * 2.0;

  walker.vx += nx * strength;
  walker.vy += ny * strength;

  // optional damping for control
  walker.vx *= 0.98;
  walker.vy *= 0.98;
}
```

---

### Optional Stickiness (Micro-Groove)

```js
function applyStickiness(walker, note) {
  const factor = 1 - note.behavior.stickiness;
  walker.vx *= factor;
  walker.vy *= factor;
}
```

---

## 🎨 VISUAL SYSTEM

### Trigger Animation

```js
function triggerNoteVisual(note) {
  note.visual.scale = 1.6;
  note.visual.glow = 1.0;

  note.state.active = true;
}
```

---

### Decay (per frame)

```js
function updateNoteVisual(note, dt) {
  // smooth decay back to base
  note.visual.scale += (1 - note.visual.scale) * dt * 6;
  note.visual.glow += (0 - note.visual.glow) * dt * 4;

  note.state.active = note.visual.glow > 0.05;
}
```

---

## ⏱ TIMING MODEL

- Walker movement remains **continuous (dt-based)**
- Collision detection runs every frame
- Sound timing is **event-locked to collision moment**
- Trigger radius ensures **non-pixel-perfect reliability**

---

## 🧪 MINIMUM IMPLEMENTATION (PHASE 1)

Must include:

- [ ] Trigger radius collision (not exact overlap)
- [ ] Note scale + glow on hit
- [ ] Event emission with MIDI note
- [ ] Basic impulse on walker

---

## 🚫 EXPLICIT NON-GOALS (v1.0.0)

- No particle systems
- No multi-walker sync logic
- No advanced physics fields
- No orbital routing

---

## 🔮 FUTURE EXTENSIONS

- Note = force field (continuous influence)
- Multiple walkers (polyphony)
- Velocity → impulse scaling
- Chord clusters → combined forces
- Camera choreography tied to events

---

## 🧭 DESIGN PRINCIPLE

> Notes are not markers.
> Notes are **interactive objects that shape motion and sound**.

---

## ✅ EXPECTED RESULT

- Walker no longer feels like a cursor
- Notes clearly “respond” when played
- Motion gains **organic variation**
- System becomes visually and musically **engaging**

---

## IMPLEMENTATION GUIDE

- **Where code goes:**
  `collision.js` (detection), `main.js` (resolution), `eventBus` (emit)

- **What to run:**
  Load MIDI → spawn notes → attach walker → enable collision loop

- **What to expect:**
  Walker visibly reacts to notes, notes pulse on trigger, sound fires correctly via sampler

---
