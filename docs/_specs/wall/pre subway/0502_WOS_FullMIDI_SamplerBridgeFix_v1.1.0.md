# 0502_WOS_FullMIDI_SamplerBridgeFix_v1.1.0.md

## Status

ACTIVE — fixes full MIDI note playback, gain, and sampler routing.

## Objective

Make imported MIDI audibly useful by ensuring full MIDI notes `0–127` drive playback, while legacy 12-note color/sample buckets remain only a fallback layer.

The current MIDI path is firing notes, but playback sounds quiet, fragmented, or collapsed because full MIDI notes are still being routed through `note % 12` too early.

---

## Current Problems

### 1. MIDI pitch is collapsing into 12 buckets

Current sampler logic relies heavily on:

```js
noteClass = note % 12;
```

This is fine for color identity, but not enough for MIDI playback.

### 2. Velocity may be too quiet

Imported MIDI velocities can be low. Current gain shaping makes soft notes nearly inaudible.

### 3. MIDI fallback tone is too quiet for debugging

`playFallbackInstrument()` works, but is too soft to judge musical timing clearly.

### 4. MIDI and collision audio are still hard to distinguish

MIDI should log and route separately from collision audio.

---

## Locked Design Decisions

### Full MIDI note is source of truth

```js
note = 0..127;
```

### Note class is derived only for fallback/color

```js
noteClass = note % 12;
```

### MIDI must play even with no samples

Fallback oscillator must be audible enough for testing.

### Sampler lookup order

1. Per-stroke samples
2. Full MIDI note bank if implemented
3. 12-note sampleMap fallback
4. Audible oscillator fallback

---

## Patch 1 — Add MIDI-safe velocity floor

Add helper:

```js
function normalizeMidiVelocity(velocity) {
  var v = typeof velocity === "number" ? velocity : 100;
  return Math.max(72, Math.min(127, Math.round(v)));
}
```

Use this inside MIDI note emission:

```js
var safeVelocity = normalizeMidiVelocity(note.velocity);
```

---

## Patch 2 — Strengthen fallback instrument for MIDI testing

Replace `playFallbackInstrument()` gain section with:

```js
var safeVelocity = normalizeMidiVelocity(velocity);
var peakGain = Math.max(0.12, (safeVelocity / 127) * 0.35);

gain.gain.setValueAtTime(0.0001, now);
gain.gain.linearRampToValueAtTime(peakGain, now + 0.008);
gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
```

Keep the full MIDI frequency calculation:

```js
var freq = 440 * Math.pow(2, (note - 69) / 12);
```

---

## Patch 3 — Emit MIDI as MIDI, not collision

In `tickCartridgeForWalker` callback, replace collision-flavored emission:

```js
emitEvent({
  type: "collision",
  sourceId: stroke.id,
  energy: note.velocity / 127,
  channel: "melodic",
  data: { note: note.note },
});
```

With MIDI-specific emission:

```js
var safeVelocity = normalizeMidiVelocity(note.velocity);

playFallbackInstrument(note.note, safeVelocity);

emitEvent({
  type: "midi",
  sourceId: stroke.id,
  energy: safeVelocity / 127,
  channel: "melodic",
  data: {
    note: note.note,
    velocity: safeVelocity,
    source: "midiCartridge",
  },
  useScale: false,
});
```

Important:

- `type: "midi"` keeps MIDI separate from collision.
- `useScale: false` prevents imported MIDI from being re-quantized.
- `note.note` must remain full MIDI pitch.

---

## Patch 4 — Update event note velocity merge

Inside `emitEvent()`, current velocity comes from:

```js
var velocity = Math.floor(event.energy * 127);
```

Patch it so explicit MIDI velocity wins:

```js
var velocity =
  event.data && typeof event.data.velocity === "number"
    ? event.data.velocity
    : Math.floor(event.energy * 127);
```

Then clamp:

```js
velocity = normalizeMidiVelocity(velocity);
```

---

## Patch 5 — Add explicit MIDI channel route

Extend `CHANNEL_MAP` if needed:

```js
var CHANNEL_MAP = {
  default: { midiChannel: 1 },
  percussion: { midiChannel: 2 },
  fx: { midiChannel: 3 },
  melodic: { midiChannel: 4 },
  ambient: { midiChannel: 5 },
  midi: { midiChannel: 6 },
};
```

When event type is `"midi"`, allow it to route separately:

```js
var route =
  CHANNEL_MAP[event.channel] || CHANNEL_MAP[event.type] || CHANNEL_MAP.default;
```

---

## Patch 6 — Make resolveNoteAndSample preserve full note

Inside `resolveNoteAndSample(sourceObject)`:

Keep:

```js
var note = sourceObject.sound.midi.note || 60;
```

Keep:

```js
var noteClass = note % 12;
```

But do not overwrite `note` with `noteClass`.

Return must preserve full note:

```js
return {
  note: note,
  noteClass: noteClass,
  resolvedClass: resolvedClass,
  result: result,
};
```

---

## Patch 7 — Add debug logs for full MIDI audit

Inside MIDI cartridge callback:

```js
if (state.debug && state.debug.audioLogs) {
  console.log("[MIDI NOTE FIRE]", {
    fullNote: note.note,
    noteClass: note.note % 12,
    velocity: safeVelocity,
    strokeId: stroke.id,
  });
}
```

Inside `resolveNoteAndSample()` after `noteClass` is computed:

```js
if (state.debug && state.debug.audioLogs) {
  console.log("[MIDI SAMPLE ROUTE]", {
    fullNote: note,
    noteClass: noteClass,
    hasStrokeSamples: !!(
      srcStroke &&
      srcStroke.samples &&
      srcStroke.samples.length
    ),
    globalSampleCount: sampleMap[noteClass] ? sampleMap[noteClass].length : 0,
  });
}
```

---

## Patch 8 — Confirm fallback is not masked by sampler failure

During MIDI testing, fallback should always fire before sampler path.

Temporary accepted behavior:

```js
playFallbackInstrument(note.note, safeVelocity);
```

Then sampler may also fire if stroke samples exist.

Later this can become a UI toggle:

- MIDI Preview Tone ON/OFF
- Sampler Only
- Hybrid

---

## Test Plan

### Test 1 — Full note audit

Run:

```js
_wos.debug.setAudioLogs(true);
```

Drop MIDI and confirm logs show:

```js
fullNote: 36..96
noteClass: 0..11
velocity: 72..127
```

Expected:

- `fullNote` must vary beyond 12 values.

### Test 2 — Fallback-only clarity

Use no samples.

Expected:

- MIDI melody/rhythm is audible via sine fallback.
- It should no longer sound like faint whispers.

### Test 3 — Stroke sample hybrid

Add one sample to selected stroke.

Expected:

- Fallback tone still confirms MIDI timing.
- Stroke sample fires when available.
- No `[FATAL AUDIO] No stroke resolved` for MIDI events.

### Test 4 — Disable audio logs

Run:

```js
_wos.debug.setAudioLogs(false);
```

Expected:

- App remains responsive.
- MIDI continues playing.

---

## Do Not Change

- Do not rewrite MIDI importer.
- Do not change MIDI point projection.
- Do not change walker movement.
- Do not collapse MIDI to 12 notes.
- Do not re-enable spatial MIDI point audio by default.

---

## Expected Result

After implementation:

- Full MIDI pitches are used.
- Fallback audio is clearly audible.
- Sampler can still use 12-note fallback mapping.
- MIDI events are distinguishable from collision events.
- Imported MIDI becomes musically legible enough for testing.

---

## Implementation Guide

- `main.js`: add velocity helper, patch fallback gain, MIDI event callback, emitEvent velocity merge, debug logs.
- `midiImporter.js`: no required changes unless Claude finds a direct bug.
- Run: reload, drop MIDI, enable audio logs, confirm full-note logs and audible fallback.
