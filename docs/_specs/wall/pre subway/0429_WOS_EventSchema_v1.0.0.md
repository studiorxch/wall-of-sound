# 0429_WOS_EventSchema_v1.0.0.md

**Generated:** 04/29/2026
**System:** Core Runtime
**Domain:** Event Layer
**Status:** REQUIRED (pre-sampler foundation)

---

## 🎯 Purpose

Define a **single, consistent event structure** for all interactions in WOS.

This ensures:

- Wall systems (visual/physics) remain independent
- Sound systems (MIDI, sampler, synth) can plug in cleanly
- Events carry enough data to produce expressive audio
- Future export + replay systems are deterministic

---

## 🧠 Core Principle

```text
All sound originates from events.
All systems communicate through events.
```

---

## 🧱 Event Object (Canonical)

### TypeScript Definition

```ts
type WOSEvent = {
  id: string; // unique event id
  type: WOSEventType; // "collision" | "emit" | "lifecycle"

  timestamp: number; // performance.now() in ms
  deltaTime: number; // frame delta (seconds)

  source: {
    id: string; // object id (shape, segment, emitter)
    type: "segment" | "shape" | "emitter" | "particle";
    groupId?: string | null;
  };

  position: {
    x: number;
    y: number;
  };

  motion?: {
    vx: number;
    vy: number;
    speed: number;
    angle: number; // radians
  };

  energy?: number; // normalized 0 → 1 (critical for sound mapping)

  interaction?: {
    normalX?: number;
    normalY?: number;
    impactStrength?: number;
  };

  sound?: {
    enabled: boolean;
    profile?: string; // future sampler mapping
    note?: number;
    velocity?: number;
    channel?: number;
  };

  meta?: Record<string, any>; // extensibility
};
```

---

## 🔑 Event Types

### 1. Collision Event (PRIMARY)

Triggered when:

- ball ↔ segment
- particle ↔ shape
- object ↔ wall

```ts
type CollisionEvent = WOSEvent & {
  type: "collision";

  interaction: {
    normalX: number;
    normalY: number;
    impactStrength: number;
  };

  energy: number; // REQUIRED
};
```

### Mapping Guidelines

```text
energy → velocity / amplitude
angle  → stereo / pan
speed  → pitch variation
```

---

### 2. Emit Event

Triggered by:

- emitters
- walkers
- behaviors

```ts
type EmitEvent = WOSEvent & {
  type: "emit";

  motion: {
    vx: number;
    vy: number;
    speed: number;
    angle: number;
  };
};
```

---

### 3. Lifecycle Event

Triggered by:

- object creation
- decay / death
- hit count thresholds

```ts
type LifecycleEvent = WOSEvent & {
  type: "lifecycle";

  meta: {
    action: "create" | "destroy" | "decay";
  };
};
```

---

## ⚙️ Required Normalization Rules

All events MUST:

### 1. Normalize Energy

```ts
energy = clamp(speed / MAX_SPEED, 0, 1);
```

### 2. Normalize Angle

```ts
angle = Math.atan2(vy, vx);
```

### 3. Include Position

Always include:

```ts
position: {
  (x, y);
}
```

---

## 🔁 Event Flow

```text
Collision System
    ↓
Event Creation (normalize data)
    ↓
EventBus.triggerEvent(event)
    ↓
SoundEngine.handle(event)
    ↓
Output (MIDI / Oscillator / Sampler)
```

---

## 🔌 EventBus Contract (UPDATE REQUIRED)

### Current (problematic)

```js
triggerEvent(type, sourceObject);
```

### New (required)

```js
triggerEvent(event: WOSEvent)
```

---

## 🧠 Sound Engine Contract

```ts
interface SoundEngine {
  handle(event: WOSEvent): void;
}
```

---

## 🎛 Minimal Sound Mapping (v1.0)

```js
function mapEventToSound(event) {
  if (event.type !== "collision") return;

  const freq = 200 + event.energy * 800;
  const velocity = Math.floor(40 + event.energy * 80);

  playTone(freq, velocity);
}
```

---

## 🚫 Anti-Patterns (DO NOT DO)

❌ Do NOT trigger sound directly in:

- collision.js
- shapeSystem.js
- particleSystem.js

❌ Do NOT embed full audio engines inside objects

❌ Do NOT pass raw objects into EventBus

---

## ✅ Required Changes (Immediate)

### 1. Collision System

Update collision output to construct:

```js
const event = {
  id: generateEventId(),
  type: "collision",
  timestamp: performance.now(),
  deltaTime: dt,
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
  energy: normalizeEnergy(ball),
  interaction: {
    normalX: normal.x,
    normalY: normal.y,
    impactStrength: collision.distance,
  },
};

eventBus.triggerEvent(event);
```

---

### 2. EventBus

Replace:

```js
triggerEvent(type, sourceObject);
```

With:

```js
triggerEvent(event);
```

---

### 3. Sound Output

Update all outputs:

```js
handle(event) {
  if (!event.sound?.enabled) return;
}
```

---

## 🔮 Future Compatibility

This schema supports:

- Sampler routing (`event.sound.profile`)
- Multi-engine output (MIDI + sampler simultaneously)
- Recording + replay (event log → playback)
- Export system (deterministic render)

---

## 🧪 Validation Checklist

- [ ] Collision produces full event object
- [ ] EventBus accepts structured event
- [ ] MIDI output works from event
- [ ] Oscillator works from event
- [ ] No direct sound calls in physics layer
- [ ] Energy values are stable (0–1)

---

## 🚀 Implementation Guide

- **Where code goes**
  - `/core/eventSystem.js` (new)
  - Update `collision.js` + `eventbus.js`

- **What to run**
  - Replace trigger calls → structured event objects
  - Route all sound through SoundEngine

- **What to expect**
  - Cleaner architecture immediately
  - Easier debugging (inspect events)
  - Sampler becomes plug-and-play next step
