---
layout: spec
title: "Marine Taxonomy Asset Bridge"
date: 2026-06-03
doc_id: "0603_WOS_MarineTaxonomyAssetBridge_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "actors"
component: "marine_taxonomy_asset_bridge"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "render-authority-bridge"

summary: "Applies advisory marine taxonomy results to individual marine actor render payloads so AIS vessels can resolve vessel-specific assets without mutating AIS truth, actor identity, or global asset assignments."

depends_on:
  - "0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0_BUILD"
  - "0603T_WOS_MarineVesselAssetPack_v1.0.0_BUILD"
  - "0603O_WOS_ActorAssetLibraryAuthority_v1.0.0"
  - "0603G_WOS_CitiBikeStationLODTierRendering_v1.0.0"

enables:
  - "live AIS visual differentiation"
  - "taxonomy-driven marine asset rendering"
  - "per-actor asset override"
  - "harbor identity readability"
  - "future marine silhouette geometry"

tags:
  - "wos"
  - "marine"
  - "ais"
  - "taxonomy"
  - "asset-bridge"
  - "render-authority"
  - "actor-assets"
---

# 0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Bridge the marine taxonomy resolver into the live actor rendering path.

0603U can now infer:

```text
AIS metadata
→ vessel role
→ candidate marine asset
```

But the result is still advisory.

0603V makes that advisory result visible by applying it per marine actor during render-payload resolution.

This is the first bridge where:

```text
live AIS vessel
→ taxonomy role
→ asset candidate
→ render payload
```

without changing:

```text
ais.vessel → asset://marine/vessel_generic
```

as the global default assignment.

---

# Core Principle

This bridge is **per-actor**, not global.

It must not rewrite the assignment map.

It must not mutate AIS truth.

It must not mutate actor identity.

It only annotates and overrides the render payload for the current actor.

---

# Expected Result

Before:

```text
AIS Vessel
→ ais.vessel
→ asset://marine/vessel_generic
→ generic vessel mesh
```

After:

```text
AIS Vessel with shipType 52
→ ais.vessel
→ MarineVesselTaxonomyResolver
→ asset://marine/tug_boat
→ render payload assetId: asset://marine/tug_boat
```

If the renderer cannot yet draw a tug-specific mesh, WSL may still fallback to generic vessel geometry.

But payload should now carry:

```js
assetId: "asset://marine/tug_boat"
assetKey: "tug_boat"
assetLabel: "Tug Boat"
taxonomyRole: "tug"
taxonomyConfidence: 0.95
taxonomyReason: "AIS shipType 52 maps to tug"
```

---

# Authority Boundary

## Owns

The bridge owns:

- deciding whether a marine actor should use a taxonomy candidate asset
- applying a per-actor asset override to render payloads
- recording taxonomy metadata on payloads
- debug reporting
- confidence thresholding

## Does Not Own

- AIS truth
- AISRuntime
- actor IDs
- global asset assignments
- asset records
- identity profiles
- renderer geometry
- Mapbox style
- feed polling
- persistence
- Studio assignment state

---

# Required Module

Create:

```text
wall/systems/actors/marineTaxonomyAssetBridge.js
```

Export:

```js
SBE.MarineTaxonomyAssetBridge
```

Register after:

```text
marineVesselTaxonomyResolver.js
```

and before:

```text
actorRenderAuthority.js
```

If load order cannot be changed safely, `ActorRenderAuthority` must guard for missing bridge.

---

# Required Integration

Modify:

```text
wall/systems/actors/actorRenderAuthority.js
```

At the point where it has:

```js
actor
payload
identity
asset resolution
```

call the bridge:

```js
payload = SBE.MarineTaxonomyAssetBridge.applyToPayload(actor, payload)
```

or equivalent.

This must happen after base asset resolution so the bridge can override only marine actor payload asset fields.

---

# Bridge API

```js
SBE.MarineTaxonomyAssetBridge = Object.freeze({
  VERSION,
  applyToPayload,
  resolveBridge,
  shouldApply,
  getState,
  setEnabled,
  setDebug,
  setMinConfidence,
  clearCache,
  auditActor,
  auditPayload
});
```

---

# Configuration

Default state:

```js
{
  enabled: true,
  debug: false,
  minConfidence: 0.60,
  applyUnknown: false,
  cacheEnabled: true
}
```

Rules:

- `confidence < minConfidence` → keep existing payload asset.
- `role === "unknown"` and `applyUnknown === false` → keep existing payload asset.
- non-marine actor → no-op.
- missing resolver → no-op.
- missing asset candidate → no-op.
- candidate asset missing → no-op.

No throw.

---

# Input / Output

## applyToPayload(actor, payload)

Input:

```js
actor: TruthActorRuntime record or actor-like object
payload: ActorRenderAuthority payload
```

Output:

```js
payload
```

same object is acceptable, but must not mutate actor truth.

Recommended: return a shallow copy when changed.

---

# Payload Fields Added

When applied:

```js
payload.assetId
payload.assetKey
payload.assetCategory
payload.assetLabel
payload.assetEditable
payload.renderVariant
payload.silhouetteClass
payload.paletteRef
payload.glyphRef
payload.materialClass
payload.lightClass
payload.scaleClass
payload.priorityClass
payload.assetTags
payload.assetMetadata
payload.taxonomyRole
payload.taxonomyConfidence
payload.taxonomyReason
payload.taxonomySource
payload.taxonomyAssetId
payload.taxonomyFallbackUsed
payload.taxonomyApplied
```

When not applied:

```js
payload.taxonomyApplied = false
payload.taxonomyReason = "below_confidence" | "not_marine_actor" | "resolver_unavailable" | ...
```

Do not erase existing payload fields.

Only override asset-related fields when candidate is accepted.

---

# Variant Resolution

Use the candidate asset variants in the same way ActorAssetLibraryAuthority resolves assets.

Recommended helper inside bridge:

```js
function _resolveAssetVariant(asset, lodTier)
```

Mapping:

```text
hidden → null
dot    → dot
node   → lowpoly || icon || dot
icon   → icon || lowpoly || dot
model  → lowpoly || hero || icon
hero   → hero || lowpoly || icon
```

Fallback:

```text
asset.defaultVariant
first available variant
```

If no variant exists:

```text
keep existing payload.renderVariant
```

---

# Cache

Bridge may cache by:

```text
actor.actorId + shipType + name + lengthM + sourceId
```

Cache must be clearable.

Cache must not survive reload.

No localStorage.

No persistence.

---

# State

`getState()` returns:

```js
{
  version: "1.0.0",
  enabled: true,
  debug: false,
  minConfidence: 0.60,
  applyUnknown: false,
  cacheEnabled: true,
  appliedCount,
  skippedCount,
  lastAppliedAt,
  lastSkippedReason,
  lastError,
  cacheSize
}
```

---

# Debug API

Extend:

```js
_wos.debug.worldActors
```

Add:

```js
marineAssetBridgeState()
marineAssetBridgeEnable(on)
marineAssetBridgeDebug(on)
marineAssetBridgeConfidence(n)
marineAssetBridgeAuditActor(actorId)
marineAssetBridgeAuditPayload(actorId)
marineAssetBridgeClearCache()
```

Studio debug optional:

```js
_wos.debug.studio.marineAssetBridgeState()
```

No UI required.

---

# Render Payload Audit

`auditPayload(actorId)` should return:

```js
{
  actorId,
  actorType,
  sourceId,
  baseAssetId,
  taxonomyAssetId,
  taxonomyRole,
  taxonomyConfidence,
  applied,
  reason,
  renderVariant,
  silhouetteClass,
  paletteRef
}
```

If actor does not exist:

```js
{ ok:false, reason:"actor_not_found" }
```

---

# No Assignment Mutation

This bridge must never call:

```js
ActorAssetLibraryAuthority.assignIdentity()
```

This must remain true:

```js
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
```

Expected:

```text
asset://marine/vessel_generic
```

even after taxonomy bridge applies tug/cargo/tanker payloads.

---

# No AIS Mutation

Bridge must never write into:

```js
actor.metadata
actor.shipType
AISRuntime vessel records
```

If it needs cache metadata, keep it in bridge-local cache only.

---

# Render Behavior

World rendering may still fallback visually.

Acceptable v1:

```text
payload assetId changes
payload renderVariant changes
WSL fallback still draws generic vessel geometry
```

This is still useful because:

- debug proves taxonomy application
- Studio/proof can inspect asset assignment
- future marine geometry can consume payload fields
- no truth mutation occurs

---

# Optional Visual Improvement

If WSL already has safe marine fallback dispatch:

```text
tug-boat, cargo-ship, tanker, barge, yacht, sailboat
→ existing vessel/ferry mesh
```

No further WSL change is required.

Do not add full per-silhouette geometry in 0603V.

That belongs to:

```text
0603W_WOS_MarineAssetWorldGeometryPass_v1.0.0_BUILD
```

---

# Acceptance Tests

## Test 1: Defaults Unchanged

Run:

```js
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
```

Expected:

```text
asset://marine/vessel_generic
```

---

## Test 2: Tug Payload Override

Create or audit actor-like object:

```js
var actor = {
  actorId: "test_tug",
  actorType: "marine.vessel",
  sourceId: "ais_runtime",
  metadata: { shipType: 52 },
  name: "TUG LINDA"
};

var payload = {
  actorId: "test_tug",
  actorType: "marine.vessel",
  visualIdentityKey: "ais.vessel",
  assetId: "asset://marine/vessel_generic",
  lodTier: "model",
  renderVariant: "vessel_lowpoly"
};

SBE.MarineTaxonomyAssetBridge.applyToPayload(actor, payload)
```

Expected:

```text
taxonomyApplied: true
taxonomyRole: tug
assetId: asset://marine/tug_boat
renderVariant: tug_lowpoly
```

---

## Test 3: Cargo Payload Override

```js
applyToPayload({ actorType:"marine.vessel", metadata:{ shipType:70 }, lengthM:210 }, payload)
```

Expected:

```text
assetId: asset://marine/cargo_large
taxonomyRole: cargo
taxonomyApplied: true
```

---

## Test 4: Unknown Not Applied

```js
applyToPayload({ actorType:"marine.vessel", metadata:{} }, payload)
```

Expected:

```text
taxonomyApplied: false
reason includes unknown or below_confidence
assetId remains vessel_generic
```

---

## Test 5: Non-Marine No-Op

```js
applyToPayload({ actorType:"vehicle.bus" }, payload)
```

Expected:

```text
taxonomyApplied: false
taxonomyReason: not_marine_actor
payload assetId unchanged
```

---

## Test 6: Confidence Gate

```js
SBE.MarineTaxonomyAssetBridge.setMinConfidence(0.99)
```

Then tug payload.

Expected:

```text
taxonomyApplied: false
taxonomyReason: below_confidence
```

Reset:

```js
SBE.MarineTaxonomyAssetBridge.setMinConfidence(0.60)
```

---

## Test 7: Live Actor Audit

After AIS / TruthActorRuntime marine actors exist:

```js
_wos.debug.worldActors.marineAssetBridgeAuditActor(actorId)
```

Expected:

```text
baseAssetId
taxonomyAssetId
taxonomyRole
taxonomyConfidence
applied
reason
```

No actor mutation.

---

# Failure Conditions

This build fails if:

- default `ais.vessel` assignment changes
- bridge calls `assignIdentity`
- AIS metadata is mutated
- actor truth records are mutated
- missing resolver crashes
- missing asset crashes
- non-marine actor crashes
- unknown vessels overwrite generic asset by default
- confidence gate is ignored
- cache survives reload
- Wall Drive breaks
- renderer behavior changes for non-marine actors
- Citi Bike station payloads change
- buses/utilities change unexpectedly

---

# Implementation Notes

## Apply After Base Asset Resolution

Base asset assignment should still work.

Then bridge overrides only when marine taxonomy is strong enough.

Sequence:

```text
ActorRenderAuthority
→ identity resolution
→ base asset resolution
→ marine taxonomy bridge
→ payload returned to TruthActorRuntime / WSL
```

## Keep It Reversible

Debug toggle must make bridge no-op immediately:

```js
SBE.MarineTaxonomyAssetBridge.setEnabled(false)
```

Then marine actors should return to base asset behavior on next payload resolution.

## No Visual Geometry Yet

0603V is not the vessel geometry pass.

Its value is payload truth.

World screenshot difference may be limited until 0603W.

---

# Future Follow-Ups

After this:

```text
0603W_WOS_MarineAssetWorldGeometryPass_v1.0.0_BUILD
0603X_WOS_MarineAssetPalettePack_v1.0.0_BUILD
0603Y_WOS_AISVesselMetadataAudit_v1.0.0_BUILD
0603Z_WOS_HarborActorVisualDifferentiationPass_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/marineTaxonomyAssetBridge.js`; register it after `marineVesselTaxonomyResolver.js`; integrate it into `wall/systems/actors/actorRenderAuthority.js` after base asset resolution; add debug wrappers to `wall/systems/presentation/worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/actors/marineTaxonomyAssetBridge.js`, `node --check wall/systems/actors/actorRenderAuthority.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; test tug/cargo/unknown/non-marine payloads; verify `getAssignment("ais.vessel")` remains `asset://marine/vessel_generic`.
- **Expect**: Marine actor render payloads can be taxonomy-overridden per actor with asset IDs, render variants, confidence, and reasons; unknown and low-confidence vessels remain generic; no AIS truth, actor identity, global assignment, feed, Wall, Hero, Mapbox, Citi Bike, bus, utility, or renderer geometry behavior changes.
