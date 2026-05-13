---
layout: spec
title: "WOS MIDI Playback Truth Patch"
date: 2026-05-08
doc_id: "0508_WOS_MIDIPlaybackTruthPatch_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "audio"
component: "midi_playback_truth"

type: "patch-spec"
status: "active"
priority: "high"
risk: "medium"

summary: "Adds a minimal canonical MIDI playback bridge so imported MIDI banks can produce audible synth playback from transport time, independent of stroke/walker projection."

depends_on:
  - "0508_WOS_RegistryStatusSpine_v1.0.0"
  - "0508_WOS_SchemaStateSpine_v1.0.0"
  - "0508_WOS_MinimalSystemHUD_v1.0.0"
  - "0508_WOS_SystemHUD_RuntimeTruthPatch_v1.0.1"

enables:
  - "bauhaus-grid-playback"
  - "midi-bank-to-grid-environment"
  - "midi-note-active-visuals"
  - "grid-notes-channel"

tags:
  - "midi"
  - "transport"
  - "audio"
  - "playback"
  - "system-truth"
  - "bauhaus-ready"
---

# 0508_WOS_MIDIPlaybackTruthPatch_v1.0.0

## 1. Goal

Add a small, canonical MIDI playback bridge.

Current MIDI import can build cartridges/banks and project MIDI onto strokes/graphs, but imported MIDI is not guaranteed to produce audible playback from the transport.

This patch should make MIDI playback truth explicit:

```txt
Transport current beat
→ active MIDI bank note events
→ synth playback through playFallbackInstrument()
→ note activity/highlight state
→ System HUD can report active MIDI playback status
```

This is not the Bauhaus renderer pass.

This is the audio/time bridge that Bauhaus will use later.

## 2. Current Observed Problem

Sound test works:

```js
_wos.sound.test(60, 100);
```

So audio output is alive.

But after reload or without a fresh MIDI drop:

```js
_wos.midi.banks();
_wos.midi.cartridges();
```

may return:

```js
[]
[]
```

That means there is no currently loaded MIDI source in runtime state.

Also, a MIDI file being imported/projection-ready does not automatically mean the transport is sequencing its notes as audible sound.

This patch must solve the sequencing bridge, while keeping runtime state truthful.

## 3. Assumptions

- Work only inside `wall/`.
- Do not touch `wall_v20260508/`.
- `playFallbackInstrument(note, velocity)` exists and passed sound test through `_wos.sound.test(60, 100)`.
- `state.midiCartridges`, `state.midiBanks`, and `state.activeMidiBankId` already exist.
- MIDI import currently builds a cartridge and a bank through `SBE.MidiImporter`.
- Transport state currently uses `isPlaying` plus `state.transport.elapsedBeforeRun` and `state.transport.startedAt`.
- System HUD already exists and reads `_wos.getSystemHudData()`.

## 4. Files To Touch

Allowed:

```txt
wall/main.js
```

Optional only if needed:

```txt
wall/styles.css
```

Do not touch:

```txt
wall/index.html
wall/engine/gridSystem.js
wall/engine/registry.js
wall/engine/schemas.js
wall/ui/controls.js
wall/render/canvasRenderer.js
wall_v20260508/
```

unless absolutely required.

## 5. Forbidden Changes

Do not:

- change MIDI import behavior
- remove MIDI graph projection
- remove MIDI-to-stroke attachment
- change grid generation
- change Bauhaus rendering
- change Delete / Duplicate / Group
- change keyboard shortcuts
- redesign the HUD
- redesign World Layers UI
- create a second MIDI importer
- create a second transport system
- add persistence yet
- auto-load MIDI files from disk

## 6. Canonical MIDI Playback Rule

Imported MIDI can have multiple uses:

```txt
MIDI Source Data  → MIDI cartridge / bank
MIDI Visual Map   → projected graph or grid layer
MIDI Playback     → transport-sequenced notes
```

This patch only adds:

```txt
MIDI Source Data → MIDI Playback
```

The canonical playback path is:

```txt
state.activeMidiBankId
→ find active bank
→ find bank cartridge/events
→ current transport beat
→ detect notes whose startBeat crossed this frame
→ playFallbackInstrument(note, velocity)
```

## 7. Required State Additions

Add a runtime-only MIDI playback state object.

Inside `state`, add:

```js
midiPlayback: {
  enabled: true,
  source: "activeBank",
  lastBeat: 0,
  lastTransportRunId: 0,
  firedNoteKeys: new Set(),
  activeNotes: [],
  lastTriggeredNotes: [],
  debug: false
}
```

If placing `new Set()` inside state is inconsistent with current style, initialize after state creation:

```js
state.midiPlayback = state.midiPlayback || {};
state.midiPlayback.firedNoteKeys =
  state.midiPlayback.firedNoteKeys || new Set();
```

Important:

- This is runtime-only.
- Do not persist it.
- Do not add it to save/export yet.

## 8. Required Helpers

Add these helpers near existing MIDI/transport helpers or near System HUD runtime helpers.

### 8.1 getActiveMidiBank()

```js
function getActiveMidiPlaybackBank() {
  if (!state.activeMidiBankId) return null;
  return (
    (state.midiBanks || []).find(function (bank) {
      return bank && bank.id === state.activeMidiBankId;
    }) || null
  );
}
```

### 8.2 getCartridgeForMidiBank()

```js
function getCartridgeForMidiBank(bank) {
  if (!bank) return null;

  if (bank.cartridgeId) {
    var byCartridgeId = (state.midiCartridges || []).find(function (cart) {
      return cart && cart.id === bank.cartridgeId;
    });
    if (byCartridgeId) return byCartridgeId;
  }

  if (bank.id) {
    var byBankId = (state.midiCartridges || []).find(function (cart) {
      return cart && cart.id === bank.id;
    });
    if (byBankId) return byBankId;
  }

  return null;
}
```

### 8.3 getMidiNoteEventsForPlayback()

This must be tolerant of different shapes.

```js
function getMidiNoteEventsForPlayback() {
  var bank = getActiveMidiPlaybackBank();
  var cartridge = getCartridgeForMidiBank(bank);

  if (bank && Array.isArray(bank.events) && bank.events.length) {
    return bank.events
      .map(function (event, index) {
        return normalizeMidiPlaybackEvent(event, index);
      })
      .filter(Boolean);
  }

  if (bank && Array.isArray(bank.notes) && bank.notes.length) {
    return bank.notes
      .map(function (note, index) {
        return normalizeMidiPlaybackEvent(note, index);
      })
      .filter(Boolean);
  }

  if (cartridge && Array.isArray(cartridge.notes) && cartridge.notes.length) {
    return cartridge.notes
      .map(function (note, index) {
        return normalizeMidiPlaybackEvent(note, index);
      })
      .filter(Boolean);
  }

  return [];
}
```

### 8.4 normalizeMidiPlaybackEvent()

Must support common MIDI import shapes:

```js
function normalizeMidiPlaybackEvent(raw, index) {
  if (!raw) return null;

  var note =
    typeof raw.note === "number"
      ? raw.note
      : typeof raw.midi === "number"
        ? raw.midi
        : typeof raw.midiNote === "number"
          ? raw.midiNote
          : typeof raw.pitch === "number"
            ? raw.pitch
            : 60;

  var velocity =
    typeof raw.velocity === "number"
      ? raw.velocity
      : typeof raw.vel === "number"
        ? raw.vel
        : 90;

  // Some importers store velocity normalized 0..1.
  if (velocity > 0 && velocity <= 1) {
    velocity = Math.round(velocity * 127);
  }

  velocity = Math.max(1, Math.min(127, Math.round(velocity)));

  var startBeat =
    typeof raw.startBeat === "number"
      ? raw.startBeat
      : typeof raw.beat === "number"
        ? raw.beat
        : typeof raw.timeBeats === "number"
          ? raw.timeBeats
          : typeof raw.ticks === "number" && raw.ppq
            ? raw.ticks / raw.ppq
            : typeof raw.time === "number"
              ? raw.time * ((state.bpm || 120) / 60)
              : 0;

  var durationBeats =
    typeof raw.durationBeats === "number"
      ? raw.durationBeats
      : typeof raw.duration === "number"
        ? raw.duration * ((state.bpm || 120) / 60)
        : typeof raw.durationTicks === "number" && raw.ppq
          ? raw.durationTicks / raw.ppq
          : 0.25;

  return {
    id: raw.id || "midi_note_" + index,
    index: index,
    note: note,
    velocity: velocity,
    startBeat: startBeat,
    durationBeats: Math.max(0.01, durationBeats),
    noteClass: ((note % 12) + 12) % 12,
    raw: raw,
  };
}
```

## 9. Required Transport Beat Helper

If `getRuntimeBeat()` already exists from System HUD patch, reuse it.

If not globally available, add:

```js
function getCurrentTransportBeat() {
  var elapsed =
    state.transport && state.transport.elapsedBeforeRun
      ? state.transport.elapsedBeforeRun
      : 0;

  if (isPlaying && state.transport && state.transport.startedAt) {
    elapsed += (performance.now() - state.transport.startedAt) / 1000;
  }

  return elapsed * ((state.bpm || 120) / 60);
}
```

If `getRuntimeBeat()` exists, implement:

```js
function getCurrentTransportBeat() {
  return getRuntimeBeat();
}
```

## 10. Required Playback Processor

Add:

```js
function processMidiPlayback(currentBeat, previousBeat) {
  if (!state.midiPlayback || state.midiPlayback.enabled === false) return;
  if (!isPlaying) return;

  var events = getMidiNoteEventsForPlayback();
  if (!events.length) {
    state.midiPlayback.activeNotes = [];
    state.midiPlayback.lastTriggeredNotes = [];
    return;
  }

  var loopBars = state.loop && state.loop.bars ? state.loop.bars : 8;
  var loopBeats = loopBars * 4;
  var wrapped = currentBeat < previousBeat;
  var triggered = [];
  var now = performance.now();

  events.forEach(function (event) {
    var eventBeat = event.startBeat;

    // Fold event beat into current loop range if needed.
    if (loopBeats > 0) {
      eventBeat = ((eventBeat % loopBeats) + loopBeats) % loopBeats;
    }

    var crossed = wrapped
      ? eventBeat > previousBeat || eventBeat <= currentBeat
      : eventBeat > previousBeat && eventBeat <= currentBeat;

    if (!crossed) return;

    var cycle = loopBeats > 0 ? Math.floor(currentBeat / loopBeats) : 0;
    var key = event.id + "::" + cycle;

    if (state.midiPlayback.firedNoteKeys.has(key)) return;
    state.midiPlayback.firedNoteKeys.add(key);

    playFallbackInstrument(event.note, event.velocity);
    noteActivity[event.noteClass] = now;
    noteVelocity[event.noteClass] = event.velocity / 127;

    triggered.push({
      id: event.id,
      note: event.note,
      velocity: event.velocity,
      startBeat: event.startBeat,
      noteClass: event.noteClass,
    });
  });

  state.midiPlayback.lastTriggeredNotes = triggered;
  state.midiPlayback.activeNotes = events.filter(function (event) {
    var localBeat =
      loopBeats > 0
        ? ((currentBeat % loopBeats) + loopBeats) % loopBeats
        : currentBeat;
    var start =
      loopBeats > 0
        ? ((event.startBeat % loopBeats) + loopBeats) % loopBeats
        : event.startBeat;
    var end = start + event.durationBeats;
    return localBeat >= start && localBeat <= end;
  });

  if (state.midiPlayback.debug && triggered.length) {
    console.log("[MIDI PLAYBACK]", {
      currentBeat: currentBeat,
      previousBeat: previousBeat,
      triggered: triggered,
    });
  }
}
```

## 11. Required Frame Integration

Inside the main render/update loop, after current beat can be calculated and before/after other time systems update, call:

```js
var currentMidiBeat = getCurrentTransportBeat();
var previousMidiBeat =
  state.midiPlayback && typeof state.midiPlayback.lastBeat === "number"
    ? state.midiPlayback.lastBeat
    : currentMidiBeat;

processMidiPlayback(currentMidiBeat, previousMidiBeat);

if (state.midiPlayback) {
  state.midiPlayback.lastBeat = currentMidiBeat;
}
```

This must run once per animation frame.

If the app already has an update loop with `renderFrame()` or `animate()`, integrate there carefully.

## 12. Required Reset On Play/Stop

Find existing `startPlayback()` / `stopPlayback()` / toggle handlers.

On starting playback:

```js
if (state.midiPlayback) {
  state.midiPlayback.lastBeat = getCurrentTransportBeat();
  state.midiPlayback.firedNoteKeys.clear();
  state.midiPlayback.activeNotes = [];
  state.midiPlayback.lastTriggeredNotes = [];
}
```

On stopping playback:

```js
if (state.midiPlayback) {
  state.midiPlayback.activeNotes = [];
  state.midiPlayback.lastTriggeredNotes = [];
}
```

Do not clear imported MIDI banks/cartridges.

## 13. Required Debug API

Add to `_wos`:

```js
_wos.midiPlayback = {
  enable: function () {
    state.midiPlayback.enabled = true;
    return state.midiPlayback;
  },
  disable: function () {
    state.midiPlayback.enabled = false;
    return state.midiPlayback;
  },
  state: function () {
    return state.midiPlayback;
  },
  events: function () {
    return getMidiNoteEventsForPlayback();
  },
  testFirst: function () {
    var events = getMidiNoteEventsForPlayback();
    if (!events.length) {
      console.warn("[MIDI PLAYBACK] No events available");
      return null;
    }
    var event = events[0];
    playFallbackInstrument(event.note, event.velocity);
    return event;
  },
  debug: function (enabled) {
    state.midiPlayback.debug = !!enabled;
    return state.midiPlayback.debug;
  },
};
```

Do not remove existing `_wos.midi` helpers.

## 14. Required HUD Runtime Additions

Update `getSystemHudData().runtime` to include:

```js
midiPlaybackEnabled: !!(state.midiPlayback && state.midiPlayback.enabled),
midiPlaybackEvents: getMidiNoteEventsForPlayback().length,
midiActiveNotes: countItems(state.midiPlayback && state.midiPlayback.activeNotes),
midiLastTriggered: countItems(state.midiPlayback && state.midiPlayback.lastTriggeredNotes)
```

Update Runtime section render to show:

```txt
MIDI Playback     true/false
MIDI Events       N
MIDI Active       N
MIDI Triggered    N
```

## 15. Critical Test Flow

### 15.1 Audio Sanity

```js
_wos.sound.test(60, 100);
```

Expected:

```txt
Audible tone.
```

### 15.2 MIDI Runtime Empty State

Before dropping MIDI:

```js
_wos.midi.banks();
_wos.midi.cartridges();
_wos.midiPlayback.events();
```

Expected:

```txt
[] is okay.
No errors.
```

### 15.3 Drop MIDI File

Drop a `.mid` file onto WOS.

Then run:

```js
_wos.midi.banks();
_wos.midi.cartridges();
_wos.midiPlayback.events().length;
_wos.getSystemHudData().runtime;
```

Expected:

```txt
midiBanks >= 1
midiCartridges >= 1
midiPlayback.events().length > 0
runtime.midiPlaybackEvents > 0
```

### 15.4 Test First Event

```js
_wos.midiPlayback.testFirst();
```

Expected:

```txt
Audible note.
Returns first normalized event.
```

### 15.5 Transport Playback

Click Play.

Then run while playing:

```js
_wos.getSystemHudData().runtime.currentBeat;
_wos.getSystemHudData().runtime.midiLastTriggered;
_wos.midiPlayback.state().lastTriggeredNotes;
```

Expected:

```txt
currentBeat increases.
midiLastTriggered changes when note events are crossed.
Audible notes should trigger.
```

## 16. Notes About Empty Banks

If after reload:

```js
_wos.midi.banks();
_wos.midi.cartridges();
```

returns `[]`, that is expected unless MIDI persistence exists.

This patch does not add MIDI persistence.

User must drop a MIDI file after reload.

## 17. Safety Requirements

- Must not throw when no MIDI is loaded.
- Must not play a burst of all notes on start.
- Must trigger only notes crossed between previousBeat and currentBeat.
- Must clear fired keys on restart.
- Must not duplicate triggers every frame.
- Must use fallback synth only for this patch.
- Must not require a selected stroke.
- Must not require a walker.
- Must not require grid layer.
- Must not require Bauhaus.

## 18. Stop Condition

Stop when:

1. Audio test still passes.
2. Dropping MIDI creates banks/cartridges as before.
3. `_wos.midiPlayback.events().length` returns normalized events.
4. `_wos.midiPlayback.testFirst()` produces sound.
5. Pressing Play triggers audible MIDI notes.
6. System HUD reports MIDI playback event counts.
7. No grid/Bauhaus behavior changes were made.
