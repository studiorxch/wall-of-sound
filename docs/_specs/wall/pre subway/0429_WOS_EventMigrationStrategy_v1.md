# 0429_WOS_EventMigrationStrategy_v1.0.0.md

**Generated:** 04/29/2026
**System:** Core Runtime Transition
**Domain:** Event Layer Migration
**Status:** SAFE UPGRADE PATH (no rewrite)

---

## 🎯 Purpose

Migrate WOS from **direct-coupled systems** to an **event-driven architecture** without:

- breaking existing features
- blocking development
- requiring full rewrites

This strategy introduces the Event Layer **gradually**, allowing legacy and new systems to coexist.

---

## 🧠 Core Principle

```text
Do not replace the system.
Wrap the system.
```

---

## ⚠️ Current Problem

Systems are coupled like:

```text
collision → directly triggers sound
motion → directly affects sound timing
shape → embeds sound config
```

This causes:

- cascading breakage
- difficult upgrades
- rebuild temptation

---

## ✅ Target Architecture

```text
[ WALL SYSTEMS ]
  ↓
(event creation)
  ↓
[ EVENT LAYER ]
  ↓
[ SOUND ENGINE ]
```

---

## 🧱 Migration Phases

---

# 🟢 Phase 1 — Introduce Event Layer (No Breakage)

### Goal

Add Event Layer WITHOUT removing existing sound logic.

---

## 1. Create Event System (NEW FILE)

**/core/eventSystem.js**

```js
export function createEventBus() {
  const listeners = [];

  function emit(event) {
    for (let i = 0; i < listeners.length; i++) {
      listeners[i](event);
    }
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  return { emit, subscribe };
}
```

---

## 2. Instantiate in main.js

```js
import { createEventBus } from "./core/eventSystem.js";

const eventBus = createEventBus();
window._wosEventBus = eventBus; // debug access
```

---

## 3. DO NOT remove existing sound triggers yet

This is critical.

You are **adding parallel flow**, not replacing.

---

# 🟡 Phase 2 — Dual Path Execution

### Goal

Run BOTH systems:

```text
collision → sound (legacy)
collision → event → sound (new)
```

---

## 1. Patch collision.js

Locate where sound is triggered.

ADD event emission:

```js
const event = {
  type: "collision",
  timestamp: performance.now(),
  source: {
    id: line.id,
    type: "segment",
  },
  position: collision.closestPoint,
  motion: {
    vx: ball.vx,
    vy: ball.vy,
    speed: Math.hypot(ball.vx, ball.vy),
    angle: Math.atan2(ball.vy, ball.vx),
  },
  energy: Math.min(1, Math.hypot(ball.vx, ball.vy) / 600),
};

eventBus.emit(event);
```

⚠️ Keep existing sound code intact.

---

## 2. Add Debug Logger

```js
eventBus.subscribe((e) => {
  console.log("EVENT:", e.type, e.energy);
});
```

---

## 3. Validation

- collisions still produce sound (old system)
- events appear in console
- no behavior changes yet

---

# 🟠 Phase 3 — Introduce Sound Engine (Parallel)

### Goal

Route events into a new sound path.

---

## 1. Create SoundEngine

**/sound/soundEngine.js**

```js
export function createSoundEngine() {
  function handle(event) {
    if (event.type !== "collision") return;

    const freq = 200 + event.energy * 800;
    playTone(freq);
  }

  return { handle };
}

function playTone(freq) {
  const ctx = window._audioCtx || (window._audioCtx = new AudioContext());
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = freq;
  osc.type = "triangle";

  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.25);
}
```

---

## 2. Wire to EventBus

```js
const soundEngine = createSoundEngine();

eventBus.subscribe((event) => {
  soundEngine.handle(event);
});
```

---

## 3. Validation

- you hear **two sounds per collision**
  - legacy sound
  - event-driven sound

✅ This is expected.

---

# 🔵 Phase 4 — Controlled Cutover

### Goal

Remove legacy sound safely.

---

## Step-by-step:

1. Add flag:

```js
let USE_EVENT_SOUND = true;
```

---

2. Wrap legacy sound calls:

```js
if (!USE_EVENT_SOUND) {
  playLegacySound();
}
```

---

3. Switch:

```js
USE_EVENT_SOUND = true;
```

---

4. Remove legacy code ONLY after validation

---

# 🟣 Phase 5 — System Lock-In

### Rules moving forward

```text
ALL sound must come from events
```

---

## Enforce:

- No sound calls in:
  - collision.js
  - physics.js
  - shapeSystem.js

---

## Only allowed:

```text
eventBus.emit(event)
```

---

# 🧪 Testing Strategy

### Phase 2

- collisions fire events
- no regression

### Phase 3

- dual audio paths confirmed

### Phase 4

- single audio path (event-driven)

---

# ⚠️ Anti-Patterns

❌ Do NOT:

- rewrite collision system
- remove legacy early
- mix event + direct sound in same logic block

---

# 💡 Key Insight

You are not upgrading sound.

You are upgrading:

```text
how systems communicate
```

---

# 🚀 Implementation Guide

- **Where code goes**
  - `/core/eventSystem.js` (new)
  - `/sound/soundEngine.js` (new)
  - patch `collision.js`

- **What to run**
  - enable dual path (Phase 2 → Phase 3)
  - validate before disabling legacy

- **What to expect**
  - zero breakage during migration
  - ability to swap sound engines freely
  - sampler becomes plug-in (next step)

---

## ✅ Final State

```text
collision → event → sound engine → output
```

No direct coupling remains.
