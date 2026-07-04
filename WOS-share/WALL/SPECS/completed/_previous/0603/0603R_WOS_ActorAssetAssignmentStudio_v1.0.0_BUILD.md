---
layout: spec
title: "Actor Asset Assignment Studio"
date: 2026-06-03
doc_id: "0603_WOS_ActorAssetAssignmentStudio_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "studio"
component: "actor_asset_assignment_studio"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "studio-assignment-authority"

summary: "Adds an in-memory Studio workflow for assigning actor visual identities to actor assets, enabling safe testing of asset swaps before persistence or file-backed editing."

depends_on:
  - "0603O_WOS_ActorAssetLibraryAuthority_v1.0.0"
  - "0603P_WOS_ActorAssetVariantPreviewStudio_v1.0.0"
  - "0603Q_WOS_ActorAssetInspectorRefinement_v1.0.0"

enables:
  - "identity to asset assignment"
  - "in-memory asset swaps"
  - "assignment preview"
  - "future persistent asset library editing"
  - "marine asset taxonomy assignment"

tags:
  - "wos"
  - "studio"
  - "actor-assets"
  - "assignment"
  - "identity"
  - "asset-library"
  - "in-memory"
---

# 0603R_WOS_ActorAssetAssignmentStudio_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Add the first asset-assignment workflow to Studio.

0603O created the Asset Library Authority.

0603P created asset variant previews.

0603Q cleaned up Studio selection state.

0603R lets Studio change which asset a visual identity uses.

This is the first step toward replacing hardcoded visuals with editable library assets.

---

# Core Concept

Current:

```text
visualIdentityKey → default asset assignment
```

Example:

```text
mta.bus → asset://road/mta_bus_standard
ais.vessel → asset://marine/vessel_generic
nyc.ferry → asset://marine/passenger_ferry
```

0603R adds Studio controls to change those assignments in memory:

```text
ais.vessel → asset://marine/tug_boat
```

This lets the user test alternate asset mappings safely.

---

# Critical Scope

This spec is **in-memory only**.

It must not:

- write JSON files
- persist to localStorage
- upload files
- mutate source code
- import SVG/GLB/WebP
- auto-save assignments
- alter feed truth
- alter actor IDs

Persistence comes later.

---

# Required Files

Modify:

```text
wall/systems/actors/actorAssetLibraryAuthority.js
studio/studioShell.js
studio/styles.css
```

Optional, only if needed for debug visibility:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Do not modify:

```text
TruthActorRuntime
ActorVisualIdentityAuthority
WorldSpaceVehicleLayer
HeroVehicleRuntime
feed runtimes
Mapbox style systems
```

unless a wiring bug requires a safe read-only hook.

---

# Asset Authority Requirement

`SBE.ActorAssetLibraryAuthority.assignIdentity(identityKey, assetId)` already exists from 0603O.

0603R should strengthen it if needed.

Required behavior:

```js
assignIdentity(identityKey, assetId)
```

Must:

1. validate identityKey is a non-empty string
2. validate assetId exists
3. update in-memory assignment map
4. increment `assignmentUpdateCount`
5. clear any relevant cached assignment state if present
6. return a copy of the new assignment result
7. never throw for normal user errors

Expected return on success:

```js
{
  ok: true,
  identityKey: "ais.vessel",
  assetId: "asset://marine/tug_boat",
  asset: { ... }
}
```

Expected return on failure:

```js
{
  ok: false,
  reason: "asset_not_found"
}
```

---

# Required Authority API Addition

Add:

```js
resetAssignments()
```

Behavior:

- restores default assignment map
- increments `assignmentUpdateCount`
- clears cached assignment state
- returns state summary

Also add:

```js
getAssignment(identityKey)
```

Returns:

```js
{
  identityKey,
  assetId,
  asset
}
```

or:

```js
null
```

No throw.

---

# Studio UX

Actor Library mode should gain an assignment panel.

When user selects an identity:

```text
Actor Library → mta.bus
```

Inspector should show:

```text
Inspecting: Identity
Assigned Asset: asset://road/mta_bus_standard
[Change Asset]
```

Clicking `Change Asset` opens an in-panel selector.

No modal required.

---

# Assignment Selector

Selector should list compatible assets first.

Compatibility rules:

An asset is compatible if any of these match:

```text
asset.actorTypes includes identity.actorType
asset.identityKeys includes identity.key
asset.silhouetteClass equals identity.silhouetteClass
```

Show compatible group first:

```text
Compatible Assets
```

Then show:

```text
Other Assets
```

Other assets are allowed in v1, because experimentation matters.

But label them as:

```text
experimental
```

---

# Assignment Row Display

Each assignment option should show:

```text
asset.label
asset.id
asset.category
asset.silhouetteClass
paletteRef
```

Active assignment should be highlighted.

---

# Assignment Apply Button

Each asset row has:

```text
Assign
```

Click behavior:

```js
SBE.ActorAssetLibraryAuthority.assignIdentity(identityKey, assetId)
```

Then:

1. refresh identity inspector
2. refresh asset assignment map
3. refresh Studio state
4. do not switch modes
5. do not spawn actors
6. do not start feeds

---

# Assignment Reset

Add in Studio:

```text
Reset Assignments
```

Only visible in Actor Library mode or assignment panel.

Click behavior:

```js
SBE.ActorAssetLibraryAuthority.resetAssignments()
```

Then refresh:

- inspector
- assignment map
- asset preview state if visible

No confirmation required in v1.

---

# Visual Feedback

After assignment:

Show small status text:

```text
Assigned ais.vessel → Tug Boat
```

State should clear after next assignment or mode switch.

---

# Debug API

Extend:

```js
_wos.debug.studio
```

Add:

```js
assignIdentityAsset(identityKey, assetId)
resetAssetAssignments()
assignmentState(identityKey)
compatibleAssets(identityKey)
```

## assignIdentityAsset

```js
_wos.debug.studio.assignIdentityAsset("ais.vessel", "asset://marine/tug_boat")
```

Returns authority result.

## resetAssetAssignments

```js
_wos.debug.studio.resetAssetAssignments()
```

Returns state summary.

## assignmentState

```js
_wos.debug.studio.assignmentState("ais.vessel")
```

Returns:

```js
{
  identityKey,
  assetId,
  assetLabel,
  compatibleAssetCount
}
```

## compatibleAssets

Returns list of compatible asset summaries.

---

# Wall Debug Optional

If modifying `worldSpaceVehicleDebug.js`, add:

```js
_wos.debug.worldActors.assetAssign(identityKey, assetId)
_wos.debug.worldActors.assetAssignment(identityKey)
_wos.debug.worldActors.assetAssignmentsReset()
```

These should call the same authority methods.

Optional, not required if Studio API is enough.

---

# Runtime Refresh Behavior

In-memory assignment changes affect newly resolved render payloads.

Existing already-rendered actors may not update until they re-render or refresh.

For v1, acceptable behavior:

```text
assignment applies to subsequent payload resolutions
```

Optional refresh helper:

```js
SBE.TruthActorRuntime.refreshActor(actorId)
```

is out of scope unless already exists.

Do not add a full runtime refresh system in this spec.

---

# Inspector Update Rules

After assigning a new asset to an identity:

Inspector should show:

```text
Assigned Asset: asset://...
Assigned Asset Label: ...
```

If selected identity is currently active.

Asset Library assignment map should reflect the new mapping.

Actor Library identity table does not need to change.

---

# No Persistence Warning

Studio should show a small note:

```text
Assignments are in-memory only for this build.
```

This should appear near the assignment controls.

---

# Acceptance Tests

## Test 1: Select Identity

Open:

```text
studio/index.html#actor-library
```

Click:

```text
ais.vessel
```

Expected:

```text
Inspector says Inspecting: Identity
Assigned Asset: asset://marine/vessel_generic
Change Asset controls visible
```

## Test 2: Assign Tug Boat

Use UI or console:

```js
_wos.debug.studio.assignIdentityAsset("ais.vessel", "asset://marine/tug_boat")
```

Expected:

```text
ok: true
assignmentState("ais.vessel").assetId = asset://marine/tug_boat
Inspector updates if ais.vessel is selected
```

## Test 3: Resolve Uses New Assignment

Run:

```js
SBE.ActorAssetLibraryAuthority.resolveAsset(
  { actorType: "marine.vessel", sourceId: "ais_runtime", metadata: {} },
  { visualIdentityKey: "ais.vessel", actorType: "marine.vessel", silhouetteClass: "vessel-generic", lodTier: "model" }
)
```

Expected:

```text
assetId: asset://marine/tug_boat
```

## Test 4: Reset Assignments

Run:

```js
_wos.debug.studio.resetAssetAssignments()
_wos.debug.studio.assignmentState("ais.vessel")
```

Expected:

```text
assetId: asset://marine/vessel_generic
```

## Test 5: Invalid Asset Fails Safely

Run:

```js
_wos.debug.studio.assignIdentityAsset("ais.vessel", "asset://marine/does_not_exist")
```

Expected:

```text
ok: false
reason: asset_not_found
no crash
existing assignment unchanged
```

## Test 6: No Runtime Side Effects

After assignment:

```text
no feed starts
no Drive starts
no actor IDs change
no map style mutation
no proof actors spawn automatically
```

---

# Failure Conditions

This build fails if:

- assignment changes persist across page reload without explicit persistence
- invalid asset throws
- invalid identity throws
- ActorAssetLibraryAuthority mutates asset records while assigning
- Studio starts feeds
- Studio starts Drive
- Wall breaks
- proof stage breaks
- asset preview breaks
- Actor Library breaks
- assignment panel shows only compatible assets and prevents experimentation
- reset does not restore defaults
- existing assignments become corrupted

---

# Implementation Notes

## Keep In-Memory

Do not implement persistence in this spec.

This makes experimentation safe.

## Allow Weird Assignments

Other assets are allowed intentionally.

Example:

```text
ais.vessel → asset://marine/tug_boat
mta.bus → asset://road/dot_utility_truck
```

This is useful for testing visual replacement.

But mark non-compatible options as experimental.

## Do Not Rebuild Renderer

Assignment only changes the asset resolution layer.

No new geometry.

No WSL changes required unless metadata stamping is missing.

---

# Future Follow-Ups

0603R enables:

```text
0603S_WOS_AssetAssignmentPersistence_v1.0.0_BUILD
0603T_WOS_MarineVesselAssetTaxonomy_v1.0.0_BUILD
0603U_WOS_MTABusAssetPack_v1.0.0_BUILD
0603V_WOS_ActorAssetImportManifest_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Strengthen `wall/systems/actors/actorAssetLibraryAuthority.js` with safe `assignIdentity`, `getAssignment`, and `resetAssignments`; extend `studio/studioShell.js` with identity assignment controls, compatible/experimental asset lists, assignment debug APIs, and inspector refresh behavior; add light CSS in `studio/styles.css` for assignment rows and status notes.
- **What**: Run `node --check wall/systems/actors/actorAssetLibraryAuthority.js` and `node --check studio/studioShell.js`; open `studio/index.html#actor-library`; select `ais.vessel`; assign `asset://marine/tug_boat`; verify with `_wos.debug.studio.assignmentState("ais.vessel")`; then reset.
- **Expect**: Studio can safely remap visual identities to actor assets in memory, invalid assignments fail without crashing, resets restore defaults, and no feed, Drive, hero, proof, Wall, or Mapbox behavior changes.
