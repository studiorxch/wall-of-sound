---
layout: spec
title: "WOS System HUD Runtime Truth Patch"
date: 2026-05-08
doc_id: "0508_WOS_SystemHUD_RuntimeTruthPatch_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"
domain: "architecture"
component: "system_hud"

type: "patch-spec"
status: "active"
priority: "medium-high"
risk: "low"

summary: "Tightens Minimal System HUD runtime truth by improving live counts, current transport/playback readout, registry grouping readability, and non-invasive diagnostics without changing creative UI behavior."

depends_on:
  - "0508_WOS_MinimalSystemHUD_v1.0.0"
  - "0508_WOS_RegistryStatusSpine_v1.0.0"
  - "0508_WOS_SchemaStateSpine_v1.0.0"

enables:
  - "bauhaus-pattern-grid-cleanup"
  - "schema-driven-world-layers"
  - "runtime-state-health"

tags:
  - "system-hud"
  - "runtime"
  - "diagnostics"
  - "ui-truth"
  - "patch"
---

# 0508_WOS_SystemHUD_RuntimeTruthPatch_v1.0.1

## 1. Goal

Patch the Minimal System HUD so its runtime section reflects the actual live app state more truthfully and safely.

This is a small correction pass only.

The HUD currently works. This patch should improve:

```txt
runtime counts
transport/playback status
world layer reporting
MIDI/grid source reporting
registry group readability
schema validation summary
```

Do not redesign the creative UI.

## 2. Assumptions

- Work only inside `wall/`.
- `wall_v20260508/` is a backup and must not be touched.
- `SYS` button and `#system-hud` already exist.
- `_wos.getSystemHudData()`, `_wos.toggleSystemHud()`, and `_wos.renderSystemHud()` already exist.
- `SBE.Registry` and `SBE.Schemas` already load correctly.
- Existing app behavior must remain unchanged.

## 3. Files To Touch

Allowed:

```txt
wall/main.js
wall/styles.css
```

Optional only if required:

```txt
wall/index.html
```

Do not touch:

```txt
wall/engine/gridSystem.js
wall/engine/registry.js
wall/engine/schemas.js
wall/ui/controls.js
wall/render/canvasRenderer.js
wall_v20260508/
```

unless a one-line safe fix is absolutely required.

## 4. Forbidden Changes

Do not:

- change grid generation
- change MIDI import
- change Bauhaus renderer logic
- change playback behavior
- change Delete / Duplicate / Group
- change keyboard shortcuts
- add new registry groups
- add new schema groups
- redesign the inspector
- move the HUD
- create a new HUD system
- create new runtime state unless clearly under `state.ui.systemHudVisible`

## 5. Problems To Correct

### Problem A — Runtime counts may throw or lie if arrays are missing

Some state fields may not always exist or may be object maps rather than arrays.

The HUD should use safe counters.

Add helper:

```js
function countItems(value) {
  if (!value) return 0;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Set) return value.size;
  if (value instanceof Map) return value.size;
  if (typeof value === "object") return Object.keys(value).length;
  return 0;
}
```

Use this for all runtime counts.

### Problem B — Playback status should reflect current transport truth

`playing: !!isPlaying` is acceptable, but the HUD should expose more transport data if available.

Runtime should include:

```js
playing;
bpm;
loopBars;
transportElapsed;
currentBeat;
frame;
```

Use safe calculations only.

Suggested helper:

```js
function getRuntimeBeat() {
  if (!state || !state.transport) return 0;

  var elapsed = state.transport.elapsedBeforeRun || 0;
  if (isPlaying && state.transport.startedAt) {
    elapsed += (performance.now() - state.transport.startedAt) / 1000;
  }

  var bpm = state.bpm || 120;
  return elapsed * (bpm / 60);
}
```

### Problem C — World layer reporting should distinguish layer types

Runtime should report:

```js
worldLayers;
gridLayers;
objectLayers;
dataOverlays;
devOverlays;
interactionOverlays;
```

Count from `state.world.layers`.

Suggested helper:

```js
function countWorldLayersByType(type) {
  var layers = state.world && state.world.layers ? state.world.layers : [];
  return layers.filter(function (layer) {
    return layer && layer.type === type;
  }).length;
}
```

If current layer types use different names, do not invent new state. Count only known live values and return `0` for missing types.

### Problem D — MIDI source reporting should distinguish cartridges, banks, active bank, and grid banks

Runtime should report:

```js
midiCartridges;
midiBanks;
activeMidiBankId;
gridBanks;
gridBlocks;
sourceNotes;
```

Safe calculations:

```js
function countGridBlocks() {
  var layers = state.world && state.world.layers ? state.world.layers : [];
  return layers.reduce(function (total, layer) {
    return total + countItems(layer && layer.blocks);
  }, 0);
}

function countSourceNotes() {
  return (state.midiCartridges || []).reduce(function (total, cartridge) {
    return total + countItems(cartridge && cartridge.notes);
  }, 0);
}
```

### Problem E — Registry section is useful but too long

Keep it readable without removing truth.

Update registry rendering to show group summary first:

```txt
systems        12
tools          7
commands       9
modes          6
layerTypes     6
renderers      2
channels       6
```

Then still show item rows inside each group.

Do not hide groups by default unless already inside `<details>`.

### Problem F — Runtime section should be readable as values, not status badges

Currently `makeHudRow(label, status)` displays values as badge-like statuses. For runtime values, use a value row style instead.

Add:

```js
function makeHudValueRow(label, value) {
  return (
    '<div class="system-hud__row system-hud__row--value">' +
    '<span class="system-hud__name">' +
    escapeHtml(label) +
    "</span>" +
    '<span class="system-hud__value">' +
    escapeHtml(String(value)) +
    "</span>" +
    "</div>"
  );
}
```

Use `makeHudValueRow()` for Runtime and Schema counts.

Keep `makeHudRow()` for Registry status rows.

## 6. Required Runtime Shape

Update `getSystemHudData()` so `runtime` includes at least:

```js
runtime: {
  (tool,
    frame,
    viewportMode,
    playing,
    bpm,
    loopBars,
    currentBeat,
    strokes,
    walkers,
    lines,
    balls,
    shapes,
    textObjects,
    particles,
    selectedCount,
    worldLayers,
    gridLayers,
    objectLayers,
    interactionOverlays,
    dataOverlays,
    devOverlays,
    midiCartridges,
    midiBanks,
    activeMidiBankId,
    gridBanks,
    gridBlocks,
    sourceNotes,
    activeVoices);
}
```

All values must be safe if missing.

## 7. Suggested Runtime Data Patch

Adapt to local style:

```js
function countItems(value) {
  if (!value) return 0;
  if (Array.isArray(value)) return value.length;
  if (value instanceof Set) return value.size;
  if (value instanceof Map) return value.size;
  if (typeof value === "object") return Object.keys(value).length;
  return 0;
}

function getRuntimeBeat() {
  if (!state || !state.transport) return 0;

  var elapsed = state.transport.elapsedBeforeRun || 0;
  if (isPlaying && state.transport.startedAt) {
    elapsed += (performance.now() - state.transport.startedAt) / 1000;
  }

  var bpm = state.bpm || 120;
  return elapsed * (bpm / 60);
}

function getWorldLayerCountByType(type) {
  var layers = state.world && state.world.layers ? state.world.layers : [];
  return layers.filter(function (layer) {
    return layer && layer.type === type;
  }).length;
}

function getWorldLayerCountByFamily(family) {
  var registry = window.SBE && window.SBE.Registry;
  var layerTypes = registry && registry.layerTypes ? registry.layerTypes : {};
  var layers = state.world && state.world.layers ? state.world.layers : [];

  return layers.filter(function (layer) {
    var layerType = layer && layer.type;
    var def = layerType ? layerTypes[layerType] : null;
    return def && def.family === family;
  }).length;
}

function countGridBlocks() {
  var layers = state.world && state.world.layers ? state.world.layers : [];
  return layers.reduce(function (total, layer) {
    return total + countItems(layer && layer.blocks);
  }, 0);
}

function countSourceNotes() {
  return (state.midiCartridges || []).reduce(function (total, cartridge) {
    return total + countItems(cartridge && cartridge.notes);
  }, 0);
}

function getSelectedCount() {
  if (state.selection && state.selection.strokeIds) {
    return countItems(state.selection.strokeIds);
  }
  return countItems(state.multiSelection);
}
```

Then inside `getSystemHudData()`:

```js
var currentBeat = getRuntimeBeat();

runtime: {
  tool: state.tool || "none",
  frame: state.frame || 0,
  viewportMode: state.viewportMode || "unknown",
  playing: !!isPlaying,
  bpm: state.bpm || 120,
  loopBars: state.loop && state.loop.bars ? state.loop.bars : 0,
  currentBeat: Number(currentBeat.toFixed(2)),
  strokes: countItems(state.strokes),
  walkers: countItems(state.walkers),
  lines: countItems(state.lines),
  balls: countItems(state.balls),
  shapes: countItems(state.shapes),
  textObjects: countItems(state.textObjects),
  particles: countItems(state.particles),
  selectedCount: getSelectedCount(),
  worldLayers: countItems(state.world && state.world.layers),
  gridLayers: getWorldLayerCountByType("grid"),
  objectLayers: getWorldLayerCountByType("objectLayer"),
  interactionOverlays: getWorldLayerCountByType("interactionOverlay"),
  dataOverlays: getWorldLayerCountByType("dataOverlay"),
  devOverlays: getWorldLayerCountByType("devOverlay"),
  midiCartridges: countItems(state.midiCartridges),
  midiBanks: countItems(state.midiBanks),
  activeMidiBankId: state.activeMidiBankId || "none",
  gridBanks: countItems(state.gridBanks),
  gridBlocks: countGridBlocks(),
  sourceNotes: countSourceNotes(),
  activeVoices: state.audio && state.audio.activeVoices ? countItems(state.audio.activeVoices) : 0
}
```

## 8. Required Render Updates

### Summary Metrics

Change summary metrics to:

```txt
Reg Errors
Schema Errors
Runtime
```

Where `Runtime` can show:

```txt
OK
```

or total live objects:

```js
runtimeObjects = strokes + walkers + balls + shapes + textObjects + particles;
```

Recommended:

```txt
Live Objects
```

### Registry Section

For each group, show:

```txt
groupName    count
```

Then item rows.

Use value row for group count:

```js
registryHtml += makeHudValueRow(groupName, items.length);
```

Then item rows:

```js
items.forEach(function (item) {
  registryHtml += makeHudRow(item.label || item.id, item.status);
});
```

### Schemas Section

Use value rows, not status badges:

```txt
Validation        OK
Top-level schemas 7
Object schemas    5
Runtime groups    6
Warnings          0
```

### Runtime Section

Use value rows:

```txt
Tool              pen/select
Playing           true/false
BPM               120
Beat              0.00
Frame             1234
World Layers      1
Grid Layers       1
Grid Blocks       11606
Source Notes      11606
MIDI Banks        1
Active Bank       bank_...
Selected          0
Active Voices     0
```

## 9. Required CSS

Add value style if missing:

```css
.system-hud__row--value .system-hud__value,
.system-hud__value {
  color: var(--text);
  font-size: 10px;
  font-weight: 700;
  text-align: right;
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Optional but helpful:

```css
.system-hud__validation[data-state="warn"] {
  color: #e0c56b;
}
```

## 10. DevTools Test

After reload:

```js
_wos.validateRegistry();
_wos.validateSchemas();
_wos.getSystemHudData();
_wos.toggleSystemHud(true);
_wos.renderSystemHud();
```

Expected:

```txt
No console errors.
Validation errors = 0.
Runtime object exists.
Runtime values are safe numbers/strings.
HUD opens and updates.
```

Specific checks:

```js
_wos.getSystemHudData().runtime;
_wos.getSystemHudData().runtime.worldLayers;
_wos.getSystemHudData().runtime.gridBlocks;
_wos.getSystemHudData().runtime.sourceNotes;
_wos.getSystemHudData().runtime.currentBeat;
```

## 11. UI Smoke Test

Confirm:

- SYS button still opens/closes HUD.
- HUD is still quiet and small.
- Runtime values update while playing.
- Drawing still works.
- Selection still works.
- Delete still works.
- Cmd+D duplicate still works.
- MIDI drop still works.
- World tab still works.
- No HUD code interferes with canvas pointer events when closed.

## 12. Stop Condition

Stop when:

1. Runtime section uses safe counts.
2. Runtime values are displayed as values, not status badges.
3. World layer, MIDI, grid, transport, and selection values are visible.
4. Validation summary still reads clean.
5. No app behavior changes.
6. No Bauhaus/grid behavior changes.

Do not proceed into Bauhaus cleanup in this patch.
