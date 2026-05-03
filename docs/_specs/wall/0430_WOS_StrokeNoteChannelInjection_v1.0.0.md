# 0430_WOS_StrokeNoteChannelInjection_v1.0.0.md

**Date:** 04/30/2026
**System:** Wall of Sound (WOS)
**Domain:** Composition Layer
**Component:** Stroke Note + Channel Injection
**Status:** Ready for Implementation

---

# PURPOSE

Add lightweight per-stroke musical intent.

Each stroke should carry:

```js
stroke.note;
stroke.channel;
```

Then collision / walker / emitter events can route that intent into the existing Event → Audio pipeline.

---

# CURRENT STATE

WOS already has:

- `emitEvent()`
- `event.channel`
- `event.data`
- `CHANNEL_MAP`
- `CHANNEL_PROFILES`
- `resolveNoteAndSample()`
- `computeVelocityGain()`

Current limitation:

```text
event.type → fixed bridge note
```

Desired:

```text
stroke → note + channel → event → sound
```

---

# GOAL

Move from generic reaction to intentional composition.

A stroke should define:

- **pitch** via `note`
- **role / voice** via `channel`

---

# IMPLEMENTATION SCOPE

## In scope

- Add `note` and `channel` to stroke objects
- Carry note/channel into collision events
- Use `event.data.note` inside `emitEvent()`
- Preserve fallback event-type note mapping

## Out of scope

- No UI
- No channel editor
- No scale editor
- No sequencing
- No chord system

---

# 1. STROKE DEFAULTS

Add a channel default if missing:

```js
state.defaults.channel = state.defaults.channel || "default";
```

When creating a stroke, assign:

```js
stroke.note = state.defaults.note || 60;
stroke.channel = state.defaults.channel || "default";
```

This should happen anywhere a new stroke object is created.

Primary targets:

- `createStrokeObject()`
- freehand stroke creation
- shape stroke commit
- line stroke commit
- library shape instance creation if it creates strokes

---

# 2. EVENT INJECTION

When a collision event is emitted from a stroke-backed object, pass through:

```js
emitEvent({
  type: "collision",
  channel: stroke.channel || "default",
  energy: normalizeEnergy(impact),
  sourceId: stroke.id,
  targetId: target && target.id,
  position: point,
  data: {
    note: stroke.note || 60,
  },
});
```

---

# 3. BRIDGE NOTE RESOLUTION

Update `emitEvent()` bridge note logic.

Current behavior:

```js
switch (event.type) {
  case "collision":
    bridgeNote = 60;
    break;
  case "walker":
    bridgeNote = 72;
    break;
  case "emit":
    bridgeNote = 67;
    break;
}
```

Replace with:

```js
var bridgeNote =
  event.data && typeof event.data.note === "number"
    ? event.data.note
    : getFallbackBridgeNote(event.type);
```

Add helper:

```js
function getFallbackBridgeNote(type) {
  switch (type) {
    case "collision":
      return 60;
    case "walker":
      return 72;
    case "emit":
      return 67;
    default:
      return 60;
  }
}
```

---

# 4. CHANNEL RESOLUTION

`event.channel` should prefer stroke channel:

```js
channel: stroke.channel || "default";
```

Fallback remains:

```js
event.channel || "default";
```

The existing bridge must continue forwarding:

```js
wosChannel: event.channel;
```

Do not change this behavior.

---

# 5. WALKER EVENTS

If walker has a source stroke:

```js
var stroke = getStrokeById(walker.strokeId);
```

Then emit:

```js
emitEvent({
  type: "walker",
  channel: stroke?.channel || walker.channel || "default",
  energy: 0.3,
  sourceId: walker.id,
  position: { x: walker.x || 0, y: walker.y || 0 },
  data: {
    note: stroke?.note || walker.note || 72,
  },
});
```

---

# 6. EMITTER EVENTS

If emitter belongs to a stroke or group, prefer owner intent:

```js
channel: owner.channel || "default",
data: {
  note: owner.note || 67
}
```

If no owner exists, keep fallback:

```js
channel: "default",
data: {
  note: 67
}
```

---

# 7. BACKWARD COMPATIBILITY

All old behavior must continue working.

If a stroke has no note:

```js
event.data.note → fallback note
```

If a stroke has no channel:

```js
event.channel → "default"
```

If no `event.data` exists:

```js
getFallbackBridgeNote(event.type);
```

---

# 8. DEBUGGING

When `state.debug.info === true`, event logs should reveal note + channel:

```js
console.log(
  "[EVENT]",
  event.type,
  event.channel,
  event.data && event.data.note,
  event.energy.toFixed(2),
);
```

---

# 9. TEST PLAN

## Test 1 — Default stroke

Create stroke with defaults.

Expected:

```text
note: 60
channel: default
```

Collision plays current C behavior.

---

## Test 2 — Manual console assignment

```js
_wos.getSelectedStroke().note = 64;
_wos.getSelectedStroke().channel = "melodic";
```

Collision should now play E and use melodic profile.

---

## Test 3 — Percussion channel

```js
_wos.getSelectedStroke().channel = "percussion";
```

Expected:

- punchier response
- stack suppressed
- stronger density pullback

---

## Test 4 — Ambient channel

```js
_wos.getSelectedStroke().channel = "ambient";
```

Expected:

- softer gain
- more compressed response
- less density reduction

---

# 10. SUCCESS CRITERIA

- Per-stroke pitch works
- Per-stroke channel works
- Existing fallback notes still work
- Existing collision behavior does not break
- No UI added
- No architecture rewrite

---

# NON-GOALS

Do not implement:

- note editor UI
- channel dropdown
- scale snapping UI
- chord assignment
- sequencer
- automation lanes

---

# SUMMARY

This spec adds the minimum required source-level musical intent:

```text
stroke.note + stroke.channel
```

This turns WOS from:

```text
event-type sound mapping
```

into:

```text
object-authored musical behavior
```

---

# Implementation Guide

- **Where:** `createStrokeObject()`, collision/walker/emitter event emitters, `emitEvent()` bridge
- **What to run:** assign selected stroke note/channel from console, then trigger collisions
- **What to expect:** pitch + voicing vary by stroke while fallback behavior stays intact
