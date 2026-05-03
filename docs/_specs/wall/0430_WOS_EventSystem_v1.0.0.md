# 0430_WOS_EventSystem_v1.0.0.md

**Date:** 04/30/2026
**System:** Wall of Sound (WOS)
**Domain:** Core Architecture
**Status:** Active (Foundational)

---

# 🧠 PURPOSE

Define a **single unified event system** for WOS that:

- Standardizes all interactions (collision, emitters, walkers)
- Enables sound generation via routing (channels)
- Eliminates legacy inconsistencies
- Prevents future migration complexity

This spec is the **source of truth** for all event-based behavior.

---

# 🧱 1. EVENT CORE (DEFINITION LAYER)

All systems MUST emit events using this structure.

```js
/**
 * Canonical WOS Event Object
 */
const event = {
  id: string,              // unique event id
  type: string,            // "collision" | "emit" | "walker" | etc.

  channel: string,         // routing key (default: "default")

  time: number,            // performance.now()
  frame: number,           // frame index

  position: { x: number, y: number },

  energy: number,          // normalized 0–1

  sourceId: string | null,
  targetId: string | null,

  tags: string[],          // optional descriptors
  data: Object             // extensible payload
}
```

### Rules

- No system may bypass this structure
- `energy` MUST be normalized (0–1)
- `channel` MUST always exist

---

# ⚙️ 2. CHANNEL SYSTEM (ROUTING LAYER)

Channels act as **logical routing paths** for events.

---

## 2.1 Channel Map

```js
const CHANNEL_MAP = {
  default: {
    midiChannel: 1,
  },
  percussion: {
    midiChannel: 2,
  },
  fx: {
    midiChannel: 3,
  },
};
```

---

## 2.2 Routing Contract

```js
EventBus.emit(event);
```

↓

```js
SoundEngine.handle(event.channel, event);
```

---

## 2.3 Object-Level Override

```js
object.channel = "percussion";
```

Fallback:

```js
event.channel = object.channel || "default";
```

---

# 🔁 3. EVENT PIPELINE (EXECUTION FLOW)

All events MUST pass through this pipeline:

```txt
[Source Systems]
   ↓
emitEvent()
   ↓
normalizeEnergy()
   ↓
dedupeEvent()
   ↓
EventBus.emit()
   ↓
SoundEngine.handle()
```

---

## 3.1 Emit Entry Point

```js
function emitEvent(e) {
  const event = normalizeEvent(e);
  if (shouldDedupe(event)) return;

  EventBus.emit(event);
}
```

---

## 3.2 Energy Normalization

```js
function normalizeEnergy(raw, max = 10) {
  return Math.max(0, Math.min(1, raw / max));
}
```

---

## 3.3 Deduplication (Frame Guard)

```js
const recentEvents = new Set();

function shouldDedupe(event) {
  const key = `${event.sourceId}-${event.targetId}-${event.frame}`;

  if (recentEvents.has(key)) return true;

  recentEvents.add(key);
  return false;
}
```

---

# 🔄 4. MIGRATION STRATEGY (COMPATIBILITY LAYER)

All legacy systems MUST transition to `emitEvent()`.

---

## 4.1 Legacy Pattern (REMOVE)

```js
segment.sound = { ... }
```

---

## 4.2 New Pattern (REQUIRED)

```js
emitEvent({
  type: "collision",
  channel: segment.sound?.channel || "default",
  energy: normalizeEnergy(impact),
  sourceId: a.id,
  targetId: b.id,
  position: { x, y },
  time: performance.now(),
  frame: state.frame,
});
```

---

## 4.3 Systems to Migrate

- detectCollisions()
- emitter systems
- walker/path systems
- manual triggers

---

# 🔌 5. INTEGRATION POINTS (main.js)

---

## 5.1 Collision Hook

```js
function handleCollision(a, b, impact, point) {
  emitEvent({
    type: "collision",
    channel: a.channel || "default",
    energy: normalizeEnergy(impact),
    sourceId: a.id,
    targetId: b.id,
    position: point,
    time: performance.now(),
    frame: state.frame,
  });
}
```

---

## 5.2 Emitter Hook

```js
emitEvent({
  type: "emit",
  channel: emitter.channel || "default",
  energy: 0.5,
  sourceId: emitter.id,
  position: spawnPoint,
  time: performance.now(),
  frame: state.frame,
});
```

---

## 5.3 Walker Hook

```js
emitEvent({
  type: "walker",
  channel: walker.channel || "default",
  energy: 0.3,
  sourceId: walker.id,
  position: walker.position,
  time: performance.now(),
  frame: state.frame,
});
```

---

# 🎧 6. SOUND ENGINE CONTRACT

---

## 6.1 Entry Point

```js
handle(channel, event) {
  const route = CHANNEL_MAP[channel]
  if (!route) return

  this.triggerMidi(route.midiChannel, event.energy)
}
```

---

## 6.2 MIDI Mapping

```js
function toMidiVelocity(energy) {
  return Math.floor(energy * 127);
}
```

---

# 🧪 7. DEBUG LAYER

---

## 7.1 Logging

```js
console.log("[EVENT]", event.type, event.channel, event.energy.toFixed(2));
```

---

## 7.2 Optional Overlay (Future)

- event count per frame
- collision flash markers

---

# ⚠️ 8. CONSTRAINTS

- No direct sound triggering outside SoundEngine
- No event emission outside `emitEvent()`
- No unnormalized energy values
- No missing channel fields

---

# 🧬 9. FUTURE EXTENSIONS (NOT IN v1)

- quantization / BPM sync
- sampler integration
- channel UI editor
- recording / replay system
- orbital / subway visualizations

---

# 🏁 SUMMARY

This system establishes:

- a **single event language**
- a **routing mechanism (channels)**
- a **stable execution pipeline**

All future WOS systems depend on this contract.

---

# Implementation Guide

- **Where it goes:** `/docs/specs/0430_WOS_EventSystem_v1.0.0.md`
- **What to run:** Begin replacing all collision/emitter/walker outputs with `emitEvent()`
- **What to expect:** Stable event flow, ready for SoundEngine + MIDI integration
