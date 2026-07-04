---
layout: spec
title: "Harbor Visual Differentiation Tuning"
date: 2026-06-04
doc_id: "0604F_WOS_HarborVisualDifferentiationTuning_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "render"
component: "harbor_visual_differentiation_tuning"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "visible-tuning-pass"

summary: "Tunes live harbor actor presentation so normalized AIS taxonomy produces readable, visibly distinct vessel classes at harbor zoom without changing AIS truth, taxonomy rules, bridge logic, assignments, or Mapbox style."

depends_on:
  - "0603W_WOS_MarineAssetWorldGeometryPass_v1.0.0_BUILD"
  - "0603X_WOS_MarineAssetPalettePack_v1.0.0_BUILD"
  - "0603Y.1_WOS_AISMetadataAuditSourceAdapterPatch_v1.0.0_BUILD"
  - "0604C_WOS_AISMetadataNormalizationPatch_v1.0.0_BUILD"

enables:
  - "visible harbor differentiation"
  - "screenshot readability"
  - "role-based vessel emphasis"
  - "harbor visual QA"
  - "future atmosphere/light cue pass"

tags:
  - "wos"
  - "harbor"
  - "marine"
  - "visual"
  - "differentiation"
  - "2.5d"
  - "ais"
  - "screenshot"
---

# 0604F_WOS_HarborVisualDifferentiationTuning_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Make the harbor visibly readable.

The marine stack now works:

```text
AIS source
→ audit source adapter
→ metadata normalizer
→ taxonomy resolver
→ taxonomy asset bridge
→ marine geometry
→ marine palettes
```

0604F tunes the visible presentation so the user can see the classification working.

The goal is simple:

```text
tug ≠ ferry ≠ tanker ≠ cargo ≠ barge ≠ sailboat ≠ yacht ≠ unknown
```

at normal harbor zoom.

---

# Core Problem

After 0604C, the data layer is strong enough:

```text
shipType coverage: 0% → 75% normalized
unknown taxonomy: ~25%
```

But visual readability may still be weak because:

- marine meshes may be too small
- silhouettes may be too similar at zoom
- colors may not contrast enough on water
- unknown/generic vessels may visually compete with classified vessels
- ferry/cargo/tanker/barge may not separate clearly from overhead
- live harbor density may obscure role differences

0604F is a presentation tuning pass, not a taxonomy pass.

---

# Scope

Modify:

```text
wall/systems/render/worldSpaceVehicleLayer.js
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional:

```text
wall/systems/actors/actorPresentationPaletteRegistry.js
```

Only if a small palette contrast correction is required.

Do not modify:

```text
AISRuntime
AISMetadataNormalizer
AISVesselMetadataAudit
MarineVesselTaxonomyResolver
MarineTaxonomyAssetBridge
ActorAssetLibraryAuthority
ActorRenderAuthority
TruthActorRuntime
Mapbox style systems
Drive runtime
feed runtimes
hero runtime
Studio assignment persistence
```

---

# Authority Boundary

WSL may tune:

- marine scale multipliers
- silhouette proportions
- contact shadow footprint
- material opacity
- per-role visual emphasis
- debug reporting
- proof/snapshot commands

WSL must not:

- inspect raw AIS shipType
- infer vessel class
- modify taxonomy results
- mutate AIS records
- mutate actor records
- mutate asset assignments
- mutate palettes globally unless explicitly scoped
- start feeds
- change Mapbox style

---

# Required Visible Outcomes

At harbor zoom, these should read differently from top/angled 2.5D view:

```text
tug/workboat        compact, chunky, tall cabin
ferry/cruise        broad public passenger shape
cargo/container     long blocky industrial shape
tanker              long dark industrial capsule-deck shape
barge               flat wide low raft
sailboat            narrow hull with mast/sail
yacht               sleek white private craft
unknown/generic     muted, lower priority, less visually dominant
```

---

# Tuning Strategy

## 1. Marine Visibility Profile

Add a marine-specific visibility profile inside WSL.

Suggested object:

```js
var MARINE_VISUAL_TUNING = {
  "tug-boat":        { scale: 1.35, shadow: 1.20, opacity: 1.00, priority: 1.15 },
  "pilot-boat":      { scale: 1.30, shadow: 1.15, opacity: 1.00, priority: 1.15 },
  "service-boat":    { scale: 1.25, shadow: 1.15, opacity: 1.00, priority: 1.10 },
  "police-boat":     { scale: 1.30, shadow: 1.15, opacity: 1.00, priority: 1.25 },
  "fire-boat":       { scale: 1.35, shadow: 1.20, opacity: 1.00, priority: 1.30 },
  "cargo-ship":      { scale: 1.20, shadow: 1.25, opacity: 1.00, priority: 1.10 },
  "container-ship":  { scale: 1.25, shadow: 1.30, opacity: 1.00, priority: 1.15 },
  "tanker":          { scale: 1.25, shadow: 1.30, opacity: 1.00, priority: 1.15 },
  "barge":           { scale: 1.25, shadow: 1.35, opacity: 0.95, priority: 1.05 },
  "passenger-ferry": { scale: 1.25, shadow: 1.25, opacity: 1.00, priority: 1.20 },
  "cruise-ship":     { scale: 1.35, shadow: 1.35, opacity: 1.00, priority: 1.20 },
  "yacht":           { scale: 1.20, shadow: 1.10, opacity: 1.00, priority: 1.00 },
  "sailboat":        { scale: 1.45, shadow: 1.10, opacity: 1.00, priority: 1.10 },
  "fishing-boat":    { scale: 1.25, shadow: 1.15, opacity: 1.00, priority: 1.05 },
  "unknown-vessel":  { scale: 0.90, shadow: 0.85, opacity: 0.72, priority: 0.70 },
  "vessel-generic":  { scale: 0.95, shadow: 0.90, opacity: 0.82, priority: 0.80 }
};
```

Apply only once per fresh upsert.

Never compound scale across repeated upserts.

---

# 2. Role-Specific Proportion Refinement

Refine existing 0603W builders.

## Tug / Workboat

Increase readability:

- make cabin taller and more forward
- make rear deck flatter and visibly separate
- add small roof beacon/cap block when lightClass suggests service/emergency
- keep hull short and wide

## Cargo / Container

Increase readability:

- cargo stacks should be larger and spaced
- container grid should show color/value separation using palette accent/side
- rear cabin should not dominate stack silhouette

## Tanker

Increase readability:

- tank capsules should be visibly rounded/long
- use accent stripe or red deck cue
- cabin small and rearward

## Barge

Increase readability:

- make flatter and wider than all other vessels
- very low height
- visible deck panel seams
- no cabin unless minimal notch

## Sailboat

Increase readability:

- mast must be taller
- sail triangle must be clearly visible from angled view
- hull must remain narrow

## Yacht

Increase readability:

- white sleek hull
- low cabin/glass strip
- do not look like ferry

## Ferry / Cruise

Increase readability:

- broad cabin deck
- visible window strip
- cruise should be taller/longer than ferry
- ferry should remain public-transit readable

---

# 3. Classified vs Unknown Contrast

Unknown/generic vessels should not dominate.

Rules:

```text
classified vessels: full opacity, stronger shadows
unknown vessels: reduced opacity and scale
generic fallback: muted, smaller
```

This makes classification visually valuable.

---

# 4. Debug Toggle

Add WSL debug controls:

```js
SBE.WorldSpaceVehicleLayer.setMarineVisualTuningEnabled(on)
SBE.WorldSpaceVehicleLayer.getMarineVisualTuningState()
```

Defaults:

```js
enabled: true
```

Debug state should include:

```js
{
  enabled,
  profileCount,
  tunedActorCount,
  bySilhouette,
  lastTunedActorId,
  lastTunedSilhouette
}
```

---

# 5. Debug Commands

Add:

```js
_wos.debug.worldActors.harborVisualState()
_wos.debug.worldActors.harborVisualSample()
_wos.debug.worldActors.harborVisualTuning(on)
_wos.debug.worldActors.harborVisualCompare()
```

## harborVisualState

Returns counts by:

```text
silhouetteClass
assetId
taxonomyRole
marineGeometryKind
opacityBucket
scaleBucket
```

## harborVisualSample

Compact table:

```js
{
  id,
  name,
  role,
  confidence,
  assetId,
  silhouetteClass,
  geometryKind,
  paletteRef,
  scale,
  opacity,
  visible
}
```

## harborVisualCompare

Optional but preferred.

Temporarily prints before/after metrics:

```text
classifiedCount
unknownCount
avgScaleClassified
avgScaleUnknown
classifiedOpacityAvg
unknownOpacityAvg
```

Do not mutate persistent state unless explicitly toggled.

---

# 6. Proof Row

Add optional proof command:

```js
_wos.debug.worldActors.harborVisualProof()
```

Spawn deterministic proof actors near map center:

```text
tug
ferry
cargo
container
tanker
barge
sailboat
yacht
unknown
```

Use real pipeline if possible:

```text
TruthActorRuntime → ActorRenderAuthority → WSL
```

But it is acceptable to upsert directly through WSL only if the proof is explicitly labeled as render-only.

Preferred actor IDs:

```text
harbor_visual_proof_tug
harbor_visual_proof_ferry
...
```

Clear:

```js
_wos.debug.worldActors.clearHarborVisualProof()
```

Must not touch live AIS actors.

---

# 7. No Taxonomy Tuning

Do not change:

```text
normalization rules
taxonomy confidence
bridge minConfidence
role mappings
asset assignments
```

This spec assumes classification is already good enough.

If audit later proves otherwise, tune in 0604D, not here.

---

# Acceptance Tests

## Test 1: Tuning State

Run:

```js
SBE.WorldSpaceVehicleLayer.getMarineVisualTuningState()
```

Expected:

```text
enabled: true
profileCount >= 16
```

## Test 2: Toggle

Run:

```js
_wos.debug.worldActors.harborVisualTuning(false)
_wos.debug.worldActors.harborVisualTuning(true)
```

Expected:

```text
state toggles
no actor truth mutation
no assignment mutation
```

## Test 3: Classified Stronger Than Unknown

Spawn or inspect:

```text
tug-boat
unknown-vessel
```

Expected:

```text
tug scale > unknown scale
tug opacity > unknown opacity
unknown remains visible but muted
```

## Test 4: Silhouette Difference

Run proof/live sample for:

```text
tug
ferry
cargo/container
tanker
barge
sailboat
yacht
unknown
```

Expected:

```text
different marineGeometryKind
visibly different silhouette
```

## Test 5: Non-Marine Unchanged

Check:

```text
bus
utility truck
Citi Bike stations
aircraft
hero
synthetic car
```

Expected:

```text
no visual regression
```

## Test 6: No Taxonomy Mutation

Before and after:

```js
SBE.MarineTaxonomyAssetBridge.getState()
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
```

Expected:

```text
bridge minConfidence unchanged
ais.vessel remains asset://marine/vessel_generic
```

## Test 7: Live Harbor Screenshot

With live Wall AIS active and 0604C normalization:

```js
_wos.debug.worldActors.aisMetadataAudit()
_wos.debug.worldActors.harborVisualSample()
```

Expected:

```text
classified vessels show different assetIds/silhouettes/palettes/scales
unknown/generic are muted
screenshot difference visible at harbor zoom
```

---

# Failure Conditions

This build fails if:

- scale compounds on repeated upserts
- unknown vessels become more prominent than classified vessels
- WSL reads raw AIS shipType
- normalization rules change
- taxonomy rules change
- bridge confidence changes
- asset assignments change
- actor truth mutates
- AIS feed starts/stops
- Drive starts/stops
- Mapbox style changes
- non-marine actors regress
- proof cleanup removes live AIS actors
- toggling visual tuning breaks rendering

---

# Implementation Notes

## Screenshot First

This is a visual pass.

Favor:

```text
readability
clear silhouette
role separation
```

over:

```text
maritime precision
perfect scale
minor realism
```

## Keep Tuning Centralized

Do not scatter magic numbers across all builders.

Keep tuning in one object and one resolver helper:

```js
_resolveMarineVisualTuning(silhouetteClass)
```

## Do Not Create New Architecture

This is not a new registry.

This is tuning inside the renderer that already owns geometry presentation.

---

# Future Follow-Ups

After this:

```text
0604A_WOS_HarborAtmospherePass_v1.0.0_BUILD
0604B_WOS_MarineLightCuePass_v1.0.0_BUILD
0604D_WOS_HarborTaxonomyConfidenceTuning_v1.0.0_BUILD
0604G_WOS_AISSourceUpgradeReview_v1.0.0
```

---

# Implementation Guide

- **Where**: Add centralized marine visual tuning helpers to `wall/systems/render/worldSpaceVehicleLayer.js`; refine only existing marine builders; add read-only tuning/debug commands to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/render/worldSpaceVehicleLayer.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; run `harborVisualProof()`, `harborVisualState()`, `harborVisualSample()`, and live `aisMetadataAudit()`; toggle tuning off/on.
- **Expect**: The harbor shows stronger role-based vessel differentiation through scale, silhouette, opacity, shadow, and palette readability while AIS truth, normalized metadata, taxonomy, bridge confidence, asset assignments, non-marine actors, Drive, Mapbox style, and feed behavior remain unchanged.
