---
layout: spec
title: "Map Style Recovery Authority"
date: 2026-06-03
doc_id: "0603_WOS_MapStyleRecoveryAuthority_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "map_style_recovery_authority"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-authority"

summary: "Restores base-map visual authority so WOS can preserve, audit, and reapply Mapbox style intent across reloads, publishes, runtime style swaps, and presentation overlays."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Base map style is presentation infrastructure"
  - "Actors must render on coherent geographic visual ground"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.0"
  - "0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0"
  - "0603G_WOS_ActorRenderAuthority_v1.0.0"

enables:
  - "strong actor visual identity"
  - "strong harbor atmosphere"
  - "strong 2.5D presentation"
  - "future transit map layers"
  - "future public-feed overlays"

tags:
  - "wos"
  - "mapbox"
  - "style-authority"
  - "presentation"
  - "visual-recovery"
  - "base-map"
---

# 0603H_WOS_MapStyleRecoveryAuthority_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Restore WOS base-map visual authority.

The current architecture has strong truth/runtime foundations, but screenshots still suffer when the geographic visual base is weak or inconsistent.

0603H makes the map itself accountable.

The goal is to ensure WOS can:

```text
read active Mapbox style
audit expected layers
preserve visual intent
detect missing/overridden style layers
reapply WOS-safe presentation patches
report style health
```

without mutating actor truth, feed truth, or route/camera behavior.

---

# Core Problem

Actors now flow through a stronger pipeline:

```text
Truth Runtime
→ Actor Render Authority
→ WSL
```

But actors still sit on top of the base map.

If the base map loses:

```text
water style
road hierarchy
bridge/tunnel readability
building extrusion tone
landuse contrast
shoreline visibility
```

then every actor layer feels weaker.

The fix is not more actors.

The fix is base-map presentation recovery.

---

# Core Doctrine

```text
Mapbox owns geographic substrate.
WOS owns atmospheric interpretation.
Map Style Recovery ensures the substrate remains visually coherent.
```

This system must not turn into a full style editor.

It is a recovery/audit authority.

---

# Authority Boundaries

## Owns

0603H owns:

- active Mapbox style audit
- layer presence reporting
- source/layer inventory
- expected layer classification
- missing layer detection
- WOS-safe paint/layout patch application
- style reload recovery
- style parity debug output

## May Read

0603H may read:

- active Mapbox map instance
- active Mapbox style JSON
- layer IDs
- source IDs
- layer paint/layout values
- current zoom
- current pitch
- current basemap configuration
- WOS presentation registries

## May Mutate

0603H may mutate only:

- Mapbox paint properties
- Mapbox layout visibility
- WOS presentation-only style patch state
- debug/reporting state

## Must Not Mutate

0603H must not mutate:

- actor truth
- actor identity
- feed runtime data
- AIS runtime
- aircraft runtime
- Citi Bike runtime
- hero route/runtime
- camera route behavior
- ActorRenderAuthority payloads
- WorldSpaceVehicleLayer transforms
- Mapbox source data
- Mapbox feature geometries

---

# Non-Goals

This spec does not build:

- new map styles in Mapbox Studio
- a user-facing style editor
- actor styling
- water animation
- harbor atmosphere
- fog
- lighting shaders
- route rendering
- transit feed layers
- clustering
- labels
- tile source replacement
- Mapbox token management

---

# Required Module

Create:

```text
wall/systems/presentation/mapStyleRecoveryAuthority.js
```

Export:

```js
SBE.MapStyleRecoveryAuthority
```

Load after:

```text
MapboxViewportRuntime
Mapbox style transfer/audit utilities
```

and before debug commands that rely on it.

Recommended `index.html` registration near existing style presentation systems:

```html
<script src="./systems/presentation/mapStyleRecoveryAuthority.js"></script>
```

---

# Public API

```js
SBE.MapStyleRecoveryAuthority = Object.freeze({
  VERSION,
  start,
  stop,
  audit,
  recover,
  applyPatch,
  clearPatch,
  getState,
  setEnabled,
  setDebug,
});
```

---

# Style Categories

Mapbox layers must be classified into WOS-readable categories.

```js
type MapStyleLayerCategory =
  | "water"
  | "land"
  | "park"
  | "road"
  | "bridge"
  | "tunnel"
  | "building"
  | "label"
  | "transit"
  | "boundary"
  | "unknown";
```

Classification should use layer id, layer type, source-layer, and metadata where available.

Examples:

```js
road-primary
road-secondary
bridge-primary
tunnel-primary
building-extrusion
water
landuse
poi-label
transit-line
```

---

# Audit Model

`audit()` returns:

```js
{
  version,
  active,
  enabled,
  mapReady,
  styleLoaded,
  styleName,
  sourceCount,
  layerCount,
  categories: {
    water: number,
    land: number,
    road: number,
    bridge: number,
    tunnel: number,
    building: number,
    label: number,
    transit: number,
    unknown: number
  },
  missingCritical: string[],
  visibleLayers: string[],
  hiddenLayers: string[],
  patchState,
  lastError
}
```

---

# Critical Layer Expectations

The audit should flag missing/weak categories.

Required baseline:

```js
CRITICAL_CATEGORIES = [
  "water",
  "land",
  "road",
  "building"
];
```

Important but optional:

```js
IMPORTANT_CATEGORIES = [
  "bridge",
  "tunnel",
  "park",
  "transit",
  "label"
];
```

Missing `bridge` or `tunnel` is not a hard failure because some styles encode these as road subclasses.

But they must be reported.

---

# Recovery Patch Model

A recovery patch is a declarative presentation patch.

```js
type MapStyleRecoveryPatch = {
  id: string
  label: string
  enabled: boolean
  rules: MapStylePatchRule[]
}
```

Rule:

```js
type MapStylePatchRule = {
  match: {
    category?: MapStyleLayerCategory
    layerIdIncludes?: string[]
    type?: string
  }
  paint?: Record<string, any>
  layout?: Record<string, any>
}
```

Patches must be safe:

```text
paint/layout only
no source mutation
no layer insertion in v1
no source replacement
```

---

# Default Recovery Patch

Create one default patch:

```js
WOS_BASEMAP_RECOVERY_PATCH
```

Purpose:

```text
increase base-map readability without overpowering actors
```

Recommended initial rules:

## Water

```js
{
  match: { category: "water" },
  paint: {
    "fill-color": "#081820",
    "fill-opacity": 0.92
  }
}
```

## Land

```js
{
  match: { category: "land" },
  paint: {
    "background-color": "#101214"
  }
}
```

Apply only where property exists.

Do not force incompatible paint properties onto wrong layer types.

## Roads

```js
{
  match: { category: "road" },
  paint: {
    "line-opacity": 0.55
  }
}
```

Do not recolor all roads in v1 unless safe layer type and property support are verified.

## Bridges / Tunnels

```js
{
  match: { category: "bridge" },
  paint: {
    "line-opacity": 0.75
  }
}
```

```js
{
  match: { category: "tunnel" },
  paint: {
    "line-opacity": 0.35
  }
}
```

This supports grade readability without inventing grade truth.

## Buildings

```js
{
  match: { category: "building" },
  paint: {
    "fill-extrusion-opacity": 0.55
  }
}
```

Only apply to `fill-extrusion` layers.

---

# Style Reload Recovery

Mapbox `setStyle()` or style publish/reload can reset paint/layout state.

0603H must bind to:

```js
style.load
styledata
```

but must be state-driven and debounced.

Do not reapply patches on every `styledata`.

Use:

```js
STYLE_RECOVERY_DEBOUNCE_MS = 750
```

Then:

```text
if style loaded
if enabled
if patch enabled
if audit detects unapplied patch or style reload token changed
then apply
```

---

# Patch Safety

`applyPatch()` must:

- check layer exists
- check layer type supports paint property
- catch every Mapbox setter error
- record skipped rules
- record applied rules
- never throw
- never block Drive launch
- never mutate sources

---

# Required State

```js
{
  version,
  active,
  enabled,
  debug,
  patchEnabled,
  lastAuditAt,
  lastRecoverAt,
  lastStyleLoadAt,
  styledataCount,
  recoverScheduledCount,
  recoverAppliedCount,
  lastAppliedPatchId,
  appliedRuleCount,
  skippedRuleCount,
  lastError
}
```

---

# Debug API

Add under:

```js
_wos.debug.mapStyleRecovery
```

Commands:

```js
state()
audit()
recover()
enable(on)
debug(on)
clearPatch()
```

Optional short aliases may be added under `_wos.debug.mapbox`.

---

# Console Output

Keep output grouped and non-spammy.

`audit()` should print:

```text
[MapStyleRecovery] audit
styleLoaded: true
layerCount: 94
categories: water 3 | road 24 | bridge 4 | tunnel 3 | building 2
missingCritical: []
importantMissing: []
patchEnabled: true
```

`recover()` should print:

```text
[MapStyleRecovery] recover
applied: 18
skipped: 7
lastError: -
```

---

# Acceptance Test

Run:

```js
_wos.debug.mapStyleRecovery.audit()
_wos.debug.mapStyleRecovery.recover()
_wos.debug.mapStyleRecovery.state()
```

Expected:

```text
mapReady true
styleLoaded true
layerCount > 0
water/land/road/building detected or clearly reported missing
recover applies only safe paint/layout properties
no thrown errors
```

Then publish/reload or call `map.setStyle(...)`.

Expected:

```text
style.load detected
recovery scheduled
patch reapplied once after debounce
no console spam
custom actor layers unaffected
```

---

# Failure Conditions

This build fails if:

- source data is mutated
- actor runtimes are touched
- hero runtime is touched
- ActorRenderAuthority is touched
- WSL transform/render path is touched
- styledata causes repeated patch spam
- patch throws uncaught errors
- incompatible paint properties crash recovery
- buildings/roads/water become invisible
- recovery removes labels or roads without explicit patch rule
- Drive launch freezes

---

# Guardrails

Map style recovery must remain presentation-only.

Correct:

```text
audit active style
apply safe paint/layout readability patch
report missing style categories
```

Incorrect:

```text
rewrite style JSON
replace sources
rebuild actor render logic
invent bridge/tunnel geometry
mutate route or grade truth
```

---

# Relationship to Actor Systems

0603G made actors render through `ActorRenderAuthority`.

0603H does not interfere with that pipeline.

Instead, it strengthens the ground those actors render on.

Correct separation:

```text
ActorRenderAuthority
→ actor presentation payload

MapStyleRecoveryAuthority
→ base-map presentation health

WorldSpaceVehicleLayer
→ world-space mesh rendering
```

---

# Future Follow-Ups

After 0603H:

```text
0603I_WOS_ActorVisualIdentityAuthority_v1.0.0_BUILD
0603J_WOS_Actor2_5DPresentationPass_v1.0.0_BUILD
0603K_WOS_HarborAtmosphereVisibilityPass_v1.0.0_BUILD
```

Do not build harbor atmosphere before base-map recovery is working.

---

# Implementation Guide

- **Where**: Add `wall/systems/presentation/mapStyleRecoveryAuthority.js`; register it in `index.html` near existing style systems; add debug namespace `_wos.debug.mapStyleRecovery` in the same module or existing presentation debug file.
- **What**: Run `node --check wall/systems/presentation/mapStyleRecoveryAuthority.js`; open WOS and run `_wos.debug.mapStyleRecovery.audit()`, `_wos.debug.mapStyleRecovery.recover()`, and `_wos.debug.mapStyleRecovery.state()`.
- **Expect**: The active Mapbox style is audited by layer category, safe recovery patches apply without touching actors or sources, reloads reapply once after debounce, and the base map becomes more readable without console spam.
