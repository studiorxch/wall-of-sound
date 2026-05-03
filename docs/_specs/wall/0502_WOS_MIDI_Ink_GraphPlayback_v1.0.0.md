# 0502_WOS_MIDI_Ink_GraphPlayback_v1.0.0

**Project:** Wall of Sound / Wallace  
**Date:** 05/02/2026  
**Version:** v1.0.0  
**Target files:** `main.js`, `midiImporter.js`, `index.html`  
**Runtime:** Vanilla JavaScript IIFE. No ES modules. Browser app served from `/wall/index.html`.

---

## Goal

Create a final testable version of **MIDI as Ink** inside WOS.

A MIDI file should import as a reusable **cartridge / bank**, then project editable, colored MIDI note-points onto a connected stroke graph. A walker should traverse only its assigned graph and trigger those MIDI points spatially.

The system must avoid accidental bleed between unrelated MIDI sources, unrelated stroke groups, or unrelated walkers.

---

## Current Known State

The current system already has:

- Vanilla IIFE app structure.
- `SBE.MidiImporter` loaded via `midiImporter.js`.
- MIDI parsing through CDN `@tonejs/midi` exposed as `window.Midi`.
- `state.midiCartridges` exists.
- MIDI can currently be dropped and attached to a selected stroke.
- Walker can tick a MIDI cartridge over transport time.
- Current failure mode: MIDI notes fire, but sound can fail because no sample/instrument is attached.
- Current architecture is still too stroke-attached and note-map-oriented.

This patch should shift the system toward:

```txt
MIDI cartridge → bank/source
connected graph → path surface
editable MIDI points → spatial notes
walker → graph-bound playhead
fallback instrument → audible default
```

---

## Non-Negotiable Design Rules

1. **MIDI imports to a bank/cartridge, not directly to a stroke.**
2. **A walker only interacts with the graph it was assigned to.**
3. **No graph bleed:** nearby or connected-looking strokes from another MIDI source must not trigger.
4. **MIDI points are editable objects, not permanently baked raster data.**
5. **Imported MIDI remains intact. Projection creates editable note-points.**
6. **Default sound must exist even with no samples loaded.**
7. **Repeat is explicit. MIDI playback is finite by default.**
8. **Deterministic path traversal comes first. Branching comes later.**

---

## Core Mental Model

```txt
MIDI = Ink Cartridge
Bank = container for MIDI and future samples
Stroke Graph = surface / route
MIDI Points = colored drops of ink on the route
Walker = playback head
Collision = sound trigger
```

The current feature should prioritize a stable deterministic version before branching, depletion visuals, or advanced selection tools.

---

## Required State Additions

Add these to `state`:

```js
midiBanks: [],
midiPoints: [],
graphs: {},
activeMidiBankId: null,
```

Bank shape:

```js
{
  id: "bank_...",
  type: "midiBank",
  name: "Imported MIDI",
  cartridgeId: "midi_...",
  samples: [],
  repeat: false,
  consumed: false,
  graphId: null,
  color: "#ffffff",
  createdAt: Date.now()
}
```

MIDI point shape:

```js
{
  id: "mp_...",
  graphId: "graph_...",
  bankId: "bank_...",
  cartridgeId: "midi_...",
  strokeId: "obj_...",
  t: 0.42,
  note: 64,
  velocity: 90,
  duration: 0.25,
  color: "hsl(...)" ,
  locked: true,
  selected: false,
  consumed: false,
  x: 0,
  y: 0
}
```

Walker additions:

```js
walker.graphId = null;
walker.bankId = null;
walker.connectionMode = "closed"; // closed now, open later
walker.graphStrokeOrder = [];
walker.graphStrokeIndex = 0;
```

Stroke additions:

```js
stroke.graphId = null;
stroke.bankId = null;
```

---

## Required `midiImporter.js` Changes

Keep the file as Vanilla IIFE.

Add helpers to `SBE.MidiImporter`:

```js
createMidiBank(cartridge);
projectMidiToGraph(state, bankId, graphId);
resetMidiPointsForBank(state, bankId);
```

### `createMidiBank(cartridge)`

Returns a bank object, does not attach to stroke automatically.

```js
function createMidiBank(cartridge) {
  if (!cartridge) return null;
  return {
    id: "bank_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    type: "midiBank",
    name: cartridge.name || "Imported MIDI",
    cartridgeId: cartridge.id,
    samples: [],
    repeat: false,
    consumed: false,
    graphId: null,
    color:
      cartridge.notes && cartridge.notes[0]
        ? cartridge.notes[0].color
        : "#ffffff",
    createdAt: Date.now(),
  };
}
```

### `projectMidiToGraph(state, bankId, graphId)`

Projects cartridge notes to editable `state.midiPoints`.

Important:

- Do not destroy edited points unless explicitly re-projecting.
- Projection creates `locked: true` points.
- Edited points later become `locked: false`.

---

## Required `main.js` Changes

### 1. Drop Handler

Current behavior attaches MIDI to selected stroke. Replace that with:

```txt
Drop MIDI → create cartridge → create bank → set activeMidiBankId
```

If a stroke is selected, then additionally:

```txt
selected stroke → build graph → assign bank → project MIDI to graph
```

Expected toast:

```txt
MIDI bank loaded: [name] ([note count] notes)
```

If selected stroke exists:

```txt
MIDI projected → graph_[id]
```

---

### 2. Build Isolated Stroke Graphs

Add deterministic graph creation.

Connection rule for now:

```txt
endpoint-to-endpoint distance <= 12px
```

Required helpers:

```js
function getStrokeEndpoints(stroke)
function isStrokeConnected(a, b, threshold)
function buildGraphFromStroke(startStroke)
function assignGraphId(strokes, graphId)
function getGraphStrokes(graphId)
```

Graph object:

```js
{
  id: "graph_...",
  strokeIds: ["obj_a", "obj_b"],
  bankId: "bank_...",
  mode: "deterministic",
  closed: false,
  createdAt: Date.now()
}
```

Deterministic ordering:

- Start with selected stroke.
- Follow first connected unvisited neighbor.
- Avoid branching for v1.0.0.
- Store final stroke order in graph.

---

### 3. Assign Bank To Graph

Add:

```js
function assignBankToGraph(bankId, graphId) {
  var graph = state.graphs[graphId];
  var bank = getMidiBank(bankId);
  if (!graph || !bank) return;

  graph.bankId = bankId;
  bank.graphId = graphId;

  graph.strokeIds.forEach(function (id) {
    var stroke = getStrokeById(id);
    if (!stroke) return;
    stroke.graphId = graphId;
    stroke.bankId = bankId;
  });
}
```

---

### 4. Project MIDI Across Full Graph Length

Use total graph length, not per-stroke length.

Required helpers:

```js
function getStrokeLength(stroke)
function getGraphLength(graph)
function getPointOnStrokeByDistance(stroke, distance)
function projectDistanceToGraph(graph, distance)
```

Projection logic:

```js
noteTime / cartridge.length → normalized timeline position
normalized position * graphLength → graph distance
computed distance → strokeId + local t
```

Then create a MIDI point in `state.midiPoints`.

---

### 5. Render MIDI Points

Render `state.midiPoints` separately from strokes.

Rules:

- Only render points whose stroke exists.
- Recalculate cached `x/y` from `strokeId + t` before drawing.
- Color comes from note color.
- Locked point: small/dim.
- Edited point: larger/brighter.
- Consumed point: hide or draw very faint for v1.0.0.

```js
function renderMidiPoints(ctx) {
  state.midiPoints.forEach(function (p) {
    var stroke = getStrokeById(p.strokeId);
    if (!stroke) return;
    var pos = getStrokePoint(stroke, p.t);
    p.x = pos.x;
    p.y = pos.y;

    ctx.save();
    ctx.globalAlpha = p.consumed ? 0.15 : p.locked ? 0.55 : 1.0;
    ctx.fillStyle = p.color || noteToColor(p.note);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, p.locked ? 3 : 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}
```

Call it after strokes and before walkers.

---

### 6. Default Fallback Instrument

Add audible default so MIDI works before samples/banks are fully populated.

Do not rely on `sampleMap` for MIDI ink tests.

Add:

```js
function playFallbackInstrument(note, velocity) {
  var ctx = ensureAudioContext();
  if (!ctx) return;

  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  var freq = 440 * Math.pow(2, (note - 69) / 12);
  var now = ctx.currentTime;

  osc.type = "sine";
  osc.frequency.value = freq;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(
    Math.max(0.04, (velocity / 127) * 0.18),
    now + 0.01,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  osc.connect(gain);
  gain.connect(state.audio.masterGain || ctx.destination);
  osc.start(now);
  osc.stop(now + 0.24);
}
```

In oscillator output or MIDI point trigger path:

```js
if no stroke samples and no bank samples, playFallbackInstrument(note, velocity)
```

---

### 7. Walker Traversal Across Graph

For v1.0.0, support deterministic traversal only.

Modes apply to the graph:

```txt
pingpong → traverse graph forward, then reverse
loop → wrap graph end to beginning
once → stop at graph end
tunnel → continuous forward graph traversal; wrap if repeat/loop, stop if finite consumed
```

Required hard gate:

```js
if (stroke.graphId !== walker.graphId) return;
```

Walker creation:

When creating a walker from a stroke with `stroke.graphId`, copy:

```js
walker.graphId = stroke.graphId;
walker.bankId = stroke.bankId;
walker.graphStrokeOrder = state.graphs[stroke.graphId].strokeIds.slice();
walker.graphStrokeIndex = walker.graphStrokeOrder.indexOf(stroke.id);
walker.connectionMode = "closed";
```

If no graph exists, keep current single-stroke behavior.

---

### 8. MIDI Point Triggering

Replace time-cartridge tick for graph playback with spatial hit testing.

```js
function triggerMidiPointsForWalker(walker) {
  if (!walker.graphId || !walker.bankId) return;

  state.midiPoints.forEach(function (p) {
    if (p.graphId !== walker.graphId) return;
    if (p.bankId !== walker.bankId) return;
    if (p.consumed) return;

    var dx = walker.x - p.x;
    var dy = walker.y - p.y;
    if (dx * dx + dy * dy > 49) return;

    emitEvent({
      type: "collision",
      sourceId: p.strokeId,
      energy: p.velocity / 127,
      channel: "default",
      data: { note: p.note },
    });

    playFallbackInstrument(p.note, p.velocity);

    p.consumed = true;
  });
}
```

Call after walker position updates.

Important: for v1.0.0 it is okay if both `emitEvent` and fallback play. If doubled audio happens, keep fallback only when no samples exist.

---

### 9. Finite Cartridge Behavior

Default behavior:

- MIDI points trigger once.
- Once all points for a bank are consumed, the bank is consumed.
- If `bank.repeat === true`, reset consumed points for that bank.

```js
function updateBankConsumption(bankId) {
  var bank = getMidiBank(bankId);
  if (!bank) return;

  var points = state.midiPoints.filter(function (p) {
    return p.bankId === bankId;
  });

  if (!points.length) return;

  var done = points.every(function (p) {
    return p.consumed;
  });
  if (!done) return;

  if (bank.repeat) {
    points.forEach(function (p) {
      p.consumed = false;
    });
    bank.consumed = false;
  } else {
    bank.consumed = true;
  }
}
```

Call after triggering MIDI points.

---

### 10. Editable MIDI Points: Minimal v1.0.0 Support

Do not build a full editor yet.

But structure must allow:

- point selection
- deletion later
- moving later

For now:

- point objects must exist in `state.midiPoints`
- they must have stable ids
- they must have `locked` property
- projection must not be recomputed every frame
- user edits must not be overwritten automatically

Add console helpers:

```js
_wos.midiPoints.list();
_wos.midiPoints.clearBank(bankId);
_wos.midiPoints.resetBank(bankId);
```

---

## Required `_wos` Debug API

Add:

```js
_wos.midi = {
  cartridges: function () { return state.midiCartridges; },
  banks: function () { return state.midiBanks; },
  points: function () { return state.midiPoints; },
  graphs: function () { return state.graphs; },
  projectSelected: function () { ... },
  setRepeat: function (bankId, value) { ... }
};
```

Also add:

```js
_wos.sound.testFallback(note);
```

---

## `index.html` Requirements

Keep script order:

```html
<script src="https://cdn.jsdelivr.net/npm/@tonejs/midi/build/Midi.min.js"></script>
<script src="./midi/midiImporter.js"></script>
<script src="./main.js"></script>
```

No ES module imports.

---

## Testing Checklist

### Test 1 — Default Sound

1. Load page.
2. Run:

```js
_wos.sound.testFallback(60);
```

Expected:

- audible sine note.

---

### Test 2 — MIDI Import

1. Drop `.mid` file onto canvas.
2. Run:

```js
_wos.midi.cartridges();
_wos.midi.banks();
```

Expected:

- cartridge exists.
- bank exists.
- active bank id set.

---

### Test 3 — Single Stroke Projection

1. Draw one stroke.
2. Select it.
3. Run projection helper or drop MIDI while selected.

Expected:

- graph created.
- stroke has graphId and bankId.
- colored MIDI points appear on stroke.

---

### Test 4 — Connected Strokes

1. Draw 2–3 strokes with touching endpoints.
2. Select first stroke.
3. Project MIDI.

Expected:

- one graph created.
- MIDI points distributed across full connected path.
- points are not duplicated per stroke.

---

### Test 5 — Isolation

1. Draw two separate connected stroke groups.
2. Load MIDI A onto group A.
3. Load MIDI B onto group B.
4. Spawn walkers on both.

Expected:

- walker A only triggers graph A.
- walker B only triggers graph B.
- no cross-triggering.

---

### Test 6 — Finite Playback

1. Start walker.
2. Let it traverse all MIDI points.

Expected:

- points trigger once.
- bank becomes consumed.
- if repeat is false, playback stops triggering.
- if repeat is true, points recycle.

---

## Out of Scope for v1.0.0

Do not implement yet:

- depletion / drying visual feedback.
- branching traversal.
- open walker graph transfer.
- full MIDI endpoint editor.
- lasso/multi-select for MIDI points.
- 16-bank MIDI controller UI.
- round active color swatch UI.
- replacing fallback sound with full sampler bank system.

These are planned iterative refinements after this feature works.

---

## Acceptance Criteria

The patch is complete when:

- MIDI can import without ES module errors.
- MIDI creates a bank/cartridge.
- A selected stroke can become a graph.
- MIDI projects as visible colored note-points across the graph.
- A walker can traverse the graph and trigger notes.
- Notes are audible with default fallback sound.
- Separate graphs do not bleed into each other.
- MIDI points exist as editable objects in state.
- Existing stroke selection/grouping remains intact.

---

## Implementation Guide

- **Where code goes:** patch `midiImporter.js`, `main.js`, and confirm script order in `index.html`.
- **What to run:** serve `/wall/index.html`, drop a `.mid`, draw/select connected strokes, project, spawn walker, press play.
- **What to expect:** colored editable MIDI points on the graph, audible walker-triggered playback, no cross-graph bleed.
