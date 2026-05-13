# 0510_WOS_SystemCleanup_LayerGovernance_v1.0.0

## Goal

Stop hidden artifact accumulation.

This pass is NOT a feature pass.

It is a cleanup / governance pass to make recent WOS work visible, toggleable, schema-aware, and maintainable.

## Core Rule

Do not add new behavior unless it is required to organize, expose, or remove existing behavior.

No new effects.
No new renderer experiments.
No new demo behavior.
No new hidden runtime flags.

---

## Phase 1 — Audit Recent Hidden Artifacts

Find and list all recent prototype/runtime additions related to:

- infiniteWorld
- signalActivity
- block.\_signal
- block.\_signalRelease
- block.\_collisionFlash
- \_iwBlockStates
- \_iwProbeTrail
- automated demo/autoplay
- Bauhaus/IW renderer overlays
- macro atmosphere
- signal noise
- walker halo/trails

For each item, classify as:

```js
{
  name,
  file,
  type: "persistent" | "runtime" | "debug" | "prototype",
  keep: true | false,
  reason,
  ownerLayer
}
```

Log the audit once:

```js
console.table(_wos.auditHiddenArtifacts());
```

Expose:

```js
_wos.auditHiddenArtifacts();
```

---

## Phase 2 — Remove / Disable Demo Waste

The automated demo must not block MIDI or manual testing.

Rules:

- demo must NOT auto-start
- demo must NOT hijack MIDI playback
- demo must NOT generate hidden note spam
- demo must become optional only
- IW background may remain auto-started if configured

Add or verify:

```js
state.demo = {
  enabled: false,
  autoStart: false,
};
```

If a legacy demo system exists, route it through this state.

Expose:

```js
_wos.demo.enable();
_wos.demo.disable();
_wos.demo.toggle();
_wos.demo.state();
```

Default must be OFF.

---

## Phase 3 — Formalize Layer Governance

Add one central layer-control object.

Do NOT scatter booleans.

Add:

```js
state.layerControls = {
  atmosphere: { visible: true, opacity: 1, solo: false },
  terrain: { visible: true, opacity: 1, solo: false },
  signals: { visible: true, opacity: 1, solo: false },
  walkers: { visible: true, opacity: 1, solo: false },
  midi: { visible: true, opacity: 1, solo: false },
  ecology: { visible: true, opacity: 1, solo: false },
  debug: { visible: false, opacity: 1, solo: false },
};
```

Add helpers:

```js
function isLayerVisible(layerId) {}
function getLayerOpacity(layerId) {}
function setLayerVisible(layerId, visible) {}
function setLayerOpacity(layerId, opacity) {}
function soloLayer(layerId) {}
function clearLayerSolo() {}
```

Expose:

```js
_wos.layers.list();
_wos.layers.show(id);
_wos.layers.hide(id);
_wos.layers.toggle(id);
_wos.layers.opacity(id, value);
_wos.layers.solo(id);
_wos.layers.clearSolo();
```

---

## Phase 4 — Renderer Must Respect Layers

Wire existing render paths to layerControls.

Minimum required:

- atmosphere / macro arcs → `atmosphere`
- terrain grid/glyphs → `terrain`
- signal activation/glow/release/collision flash → `signals`
- walkers/halos/trails/probe → `walkers`
- MIDI-specific playback visualization → `midi`
- IW autonomous generation/probe/ecology visuals → `ecology`
- debug overlays/logs → `debug`

No visual system should render if its layer is hidden.

Opacity must be applied where safe.

---

## Phase 5 — Schema Registration

Recent systems must stop living only as loose runtime state.

Add schema entries for:

```js
Schemas.SignalActivity;
Schemas.LayerControl;
Schemas.InfiniteWorld;
Schemas.PlayableCellSignal;
```

Each field must declare:

```js
{
  default,
  persistent: boolean,
  runtime: boolean
}
```

Runtime-only fields:

- active Map
- pending activations
- block.\_signal
- block.\_signalRelease
- block.\_collisionFlash
- \_iwBlockStates
- \_iwProbeTrail

Persistent/config fields:

- infiniteWorld.enabled
- infiniteWorld.autoStart
- infiniteWorld.density
- infiniteWorld.tickMs
- layerControls visibility/opacity/solo
- renderer palette/finish/tileStyle

Run existing schema validator after changes:

```js
_wos.validateSchemas();
```

No new schema warnings should be introduced.

---

## Phase 6 — Add Minimal Layers UI

Add a real toggleable Layers tab/panel.

Location:

Right panel.

Do not make it a readout only.

Controls per layer:

- visibility toggle
- opacity slider
- solo button

Initial layers:

- Atmosphere
- Terrain
- Signals
- Walkers
- MIDI
- Ecology
- Debug

This panel must call `_wos.layers` methods or shared layer helper functions.

Do not duplicate layer state in the DOM.

DOM reflects state.
State is source of truth.

---

## Phase 7 — Cleanup Rules

Remove or disable:

- dead demo auto-start behavior
- duplicate signal-energy fields no longer used
- obsolete `_signalEnergy` references
- stale debug-only render branches not behind `debug` layer
- any hidden auto-running system not represented in layerControls or schemas

Keep:

- signalActivity system
- structured `block._signal`
- attack/release signal model
- IW terrain prototype
- walker halo/trail readability
- field composition renderer

But each must be:

- layer-controlled
- schema-documented
- inspectable through `_wos`

---

## Validation Checklist

After patch:

```js
_wos.auditHiddenArtifacts();
_wos.validateSchemas();
_wos.layers.list();
_wos.layers.hide("signals");
_wos.layers.show("signals");
_wos.layers.solo("walkers");
_wos.layers.clearSolo();
_wos.demo.state();
```

Expected:

- demo is off by default
- MIDI is not blocked by demo
- signals can be hidden
- walkers can be isolated
- atmosphere can be hidden
- debug layer is off by default
- no hidden visual systems continue rendering while their layer is hidden
- schema validation returns no errors

## Completion Summary Required

Report:

1. What artifacts were removed
2. What artifacts were kept and why
3. What layers were added
4. What schemas were added/updated
5. Where renderer checks were wired
6. How to toggle layers
7. Any remaining known hidden state
