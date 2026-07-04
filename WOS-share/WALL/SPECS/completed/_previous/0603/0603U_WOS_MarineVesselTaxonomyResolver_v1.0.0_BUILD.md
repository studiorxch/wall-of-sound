---
layout: spec
title: "Marine Vessel Taxonomy Resolver"
date: 2026-06-03
doc_id: "0603_WOS_MarineVesselTaxonomyResolver_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "actors"
component: "marine_vessel_taxonomy_resolver"

type: "system-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "taxonomy-authority"

summary: "Adds an advisory marine taxonomy resolver that maps AIS vessel metadata and asset-pack taxonomy hints to candidate marine asset IDs without mutating AIS truth, actor identity, renderer behavior, or default assignments."

depends_on:
  - "0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0"
  - "0603O_WOS_ActorAssetLibraryAuthority_v1.0.0"
  - "0603T_WOS_MarineVesselAssetPack_v1.0.0"

enables:
  - "AIS vessel role inference"
  - "marine asset recommendation"
  - "taxonomy-driven vessel differentiation"
  - "future automatic marine asset assignment"
  - "Studio vessel taxonomy audit"

tags:
  - "wos"
  - "marine"
  - "ais"
  - "taxonomy"
  - "asset-library"
  - "resolver"
  - "vessels"
---

# 0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Create a marine vessel taxonomy resolver.

0603T added the marine asset pack.

But live AIS vessels still default to:

```text
ais.vessel → asset://marine/vessel_generic
```

0603U introduces a read-only resolver that can infer a likely vessel role and candidate asset from AIS metadata.

This is advisory first.

It must not automatically mutate live assignments yet.

---

# Core Goal

Create:

```text
AIS truth metadata
→ vessel role hint
→ candidate marine asset
→ confidence + reason
```

Example:

```text
shipType: 52
→ tug
→ asset://marine/tug_boat
→ confidence: 0.95
```

Another:

```text
shipType: 70
→ cargo
→ asset://marine/cargo_small
→ confidence: 0.85
```

---

# Authority Boundary

## Owns

MarineVesselTaxonomyResolver owns:

- AIS ship-type interpretation
- asset metadata lookup
- role candidate ranking
- confidence scoring
- explanation strings
- debug/audit helpers

## Does Not Own

- AIS feed truth
- actor IDs
- identity assignment map
- asset record mutation
- renderer selection
- WSL mesh construction
- Mapbox style
- vessel movement
- collision
- persistence
- automatic assignment

---

# Required Module

Create:

```text
wall/systems/actors/marineVesselTaxonomyResolver.js
```

Export:

```js
SBE.MarineVesselTaxonomyResolver
```

Register after:

```text
actorAssetLibraryAuthority.js
```

and before any future AIS-to-asset bridge.

If load order is constrained, all consumers must guard safely.

---

# Public API

```js
SBE.MarineVesselTaxonomyResolver = Object.freeze({
  VERSION,
  resolveVessel,
  resolveAssetCandidate,
  listRules,
  listMarineAssets,
  auditActor,
  auditActors,
  getState,
  setEnabled,
  setDebug
});
```

---

# Input Shape

`resolveVessel(input)` accepts a loose object:

```js
{
  actorId,
  actorType,
  sourceId,
  metadata,
  shipType,
  vesselType,
  vesselClass,
  name,
  callsign,
  mmsi,
  lengthM,
  widthM,
  speedKts
}
```

It must tolerate missing fields.

No throw.

---

# AIS Metadata Sources

The resolver should check fields in this order:

```js
input.shipType
input.metadata.shipType
input.metadata.ship_type
input.metadata.aisShipType
input.metadata.type
input.vesselType
input.vesselClass
```

Normalize numeric strings:

```js
"52" → 52
```

Normalize text:

```js
"tug" → "tug"
"Passenger" → "passenger"
"cargo ship" → "cargo"
```

---

# AIS Ship Type Mapping

Implement a small local mapping table.

## Working / Special

```js
30 → fishing
31 → towing
32 → towing
33 → dredging
34 → diving
35 → military
36 → sailing
37 → yacht
50 → pilot
51 → search_rescue
52 → tug
53 → port_tender
54 → anti_pollution
55 → law_enforcement
58 → medical
59 → special
```

## Passenger

```js
60-69 → passenger
```

## Cargo

```js
70-79 → cargo
```

## Tanker

```js
80-89 → tanker
```

## Other

```js
0 → unknown
90-99 → other
```

---

# Role → Asset Mapping

Map normalized role to asset ID:

```js
{
  tug: "asset://marine/tug_boat",
  pilot: "asset://marine/pilot_boat",
  port_tender: "asset://marine/service_boat",
  service: "asset://marine/service_boat",
  law_enforcement: "asset://marine/police_boat",
  police: "asset://marine/police_boat",
  fire: "asset://marine/fire_boat",
  fishing: "asset://marine/fishing_boat",
  sailing: "asset://marine/sailboat",
  yacht: "asset://marine/yacht_small",
  passenger: "asset://marine/passenger_ferry",
  ferry: "asset://marine/passenger_ferry",
  cruise: "asset://marine/cruise_ship",
  cargo: "asset://marine/cargo_small",
  container: "asset://marine/container_ship",
  tanker: "asset://marine/tanker",
  barge: "asset://marine/barge",
  unknown: "asset://marine/unknown_vessel",
  other: "asset://marine/vessel_generic"
}
```

If asset is missing, fallback to:

```text
asset://marine/vessel_generic
```

---

# Name-Based Hints

Use simple conservative name/callsign string checks.

Do not overfit.

Hints:

```text
tug
pilot
police
fire
ferry
cruise
cargo
container
tanker
barge
yacht
sail
fishing
```

Example:

```js
name: "TUG LINDA"
→ tug
```

Name-based hints should have lower authority than numeric AIS ship type unless very explicit.

---

# Dimension-Based Hints

Use only as secondary hints.

Suggested:

```text
lengthM >= 180 and role cargo → cargo_large
lengthM >= 220 and role cargo + name contains container → container_ship
lengthM >= 180 and role tanker → tanker
lengthM >= 120 and role passenger → cruise_ship if name contains cruise
lengthM < 35 and role yacht → yacht_small
lengthM >= 35 and role yacht → yacht_large
```

Dimension hints should not create high confidence alone.

---

# Confidence Model

Return confidence as `0.0–1.0`.

Suggested:

```text
numeric AIS shipType exact role: 0.90
numeric AIS range role: 0.80
name/callsign explicit hint: 0.65
dimension-only hint: 0.45
fallback unknown: 0.25
fallback generic: 0.15
```

Boost:

```text
+0.05 if asset metadata expectedAISShipTypes includes the AIS shipType
+0.05 if name hint agrees with numeric role
```

Clamp to:

```text
0.0–0.98
```

---

# Return Shape

`resolveVessel(input)` returns:

```js
{
  ok: true,
  role: "tug",
  confidence: 0.95,
  source: "shipType",
  reason: "AIS shipType 52 maps to tug",
  shipType: 52,
  nameHint: null,
  dimensionHint: null,
  assetId: "asset://marine/tug_boat",
  assetLabel: "Tug Boat",
  assetSilhouetteClass: "tug-boat",
  fallbackUsed: false,
  metadata: {
    expectedAISShipTypesMatched: true
  }
}
```

On missing/invalid data:

```js
{
  ok: true,
  role: "unknown",
  confidence: 0.25,
  source: "fallback",
  reason: "No AIS ship type or reliable hint available",
  assetId: "asset://marine/unknown_vessel",
  fallbackUsed: true
}
```

Never throw.

---

# `resolveAssetCandidate(actor)`

Wrapper around `resolveVessel`.

Input may be a TruthActorRuntime actor record.

It should read:

```js
actor.actorType
actor.sourceId
actor.metadata
actor.label
actor.name
actor.assetId
```

Return the same shape.

If `actor.actorType` is not marine:

```js
{
  ok: false,
  reason: "not_marine_actor"
}
```

---

# Asset Metadata Crosscheck

Use:

```js
SBE.ActorAssetLibraryAuthority.getAsset(assetId)
```

Then read:

```js
asset.metadata.expectedAISShipTypes
asset.metadata.vesselRole
asset.metadata.taxonomyReady
```

If candidate asset metadata says it is not taxonomy ready:

```text
fallback to vessel_generic
```

---

# Studio Debug API

Extend:

```js
_wos.debug.studio
```

Add:

```js
marineTaxonomyState()
marineTaxonomyRules()
marineTaxonomyResolve(input)
marineTaxonomyAssets()
```

These should call the resolver if present.

No feed start.

No live actor mutation.

---

# World Debug API

Optional but recommended under:

```js
_wos.debug.worldActors
```

Add:

```js
marineTaxonomyState()
marineTaxonomyResolve(input)
marineTaxonomyAuditActor(actorId)
```

No automatic assignment.

---

# Studio UI

Minimum v1:

In Asset Library or Actor Library, add a debug helper panel only if simple.

Preferred minimal:

```text
Marine Taxonomy tools remain console-only in 0603U.
```

Do not block this build on UI.

---

# No Automatic Assignment

This spec must not call:

```js
ActorAssetLibraryAuthority.assignIdentity()
```

Automatically.

It must not change:

```text
ais.vessel → vessel_generic
```

Default assignment.

It only recommends candidate assets.

---

# Acceptance Tests

## Test 1: Tug

Run:

```js
SBE.MarineVesselTaxonomyResolver.resolveVessel({ shipType: 52, name: "TUG LINDA" })
```

Expected:

```text
role: tug
assetId: asset://marine/tug_boat
confidence >= 0.90
```

## Test 2: Cargo

Run:

```js
SBE.MarineVesselTaxonomyResolver.resolveVessel({ shipType: 70, lengthM: 120 })
```

Expected:

```text
role: cargo
assetId: asset://marine/cargo_small
confidence >= 0.80
```

## Test 3: Large Cargo

Run:

```js
SBE.MarineVesselTaxonomyResolver.resolveVessel({ shipType: 70, lengthM: 210 })
```

Expected:

```text
role: cargo
assetId: asset://marine/cargo_large
```

## Test 4: Tanker

Run:

```js
SBE.MarineVesselTaxonomyResolver.resolveVessel({ shipType: 80, name: "SEA TANKER" })
```

Expected:

```text
role: tanker
assetId: asset://marine/tanker
```

## Test 5: Sailboat

Run:

```js
SBE.MarineVesselTaxonomyResolver.resolveVessel({ shipType: 36 })
```

Expected:

```text
role: sailing
assetId: asset://marine/sailboat
```

## Test 6: Unknown

Run:

```js
SBE.MarineVesselTaxonomyResolver.resolveVessel({})
```

Expected:

```text
role: unknown
assetId: asset://marine/unknown_vessel
confidence <= 0.30
no crash
```

## Test 7: Non-Marine Actor

Run:

```js
SBE.MarineVesselTaxonomyResolver.resolveAssetCandidate({ actorType: "vehicle.bus" })
```

Expected:

```text
ok: false
reason: not_marine_actor
```

## Test 8: Defaults Unchanged

Run:

```js
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
```

Expected:

```text
asset://marine/vessel_generic
```

---

# Failure Conditions

This build fails if:

- resolver mutates AIS data
- resolver mutates actor truth
- resolver changes asset assignment map
- resolver changes default `ais.vessel`
- resolver modifies WSL
- resolver modifies AISRuntime
- missing metadata crashes
- unknown ship type crashes
- missing asset crashes
- non-marine actor throws
- Studio starts live feeds
- Drive starts
- Wall behavior changes

---

# Implementation Notes

## Advisory First

This is not the bridge that applies taxonomy to actors.

That comes later:

```text
0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0_BUILD
```

## Keep Rules Small

Use a readable local mapping table.

Do not import a giant external classification dataset yet.

The goal is useful harbor differentiation, not perfect maritime law.

## Use Asset Pack Metadata

0603T added:

```js
metadata.expectedAISShipTypes
metadata.vesselRole
metadata.taxonomyReady
```

0603U should consume those fields lightly.

---

# Future Follow-Ups

After this:

```text
0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0_BUILD
0603W_WOS_MarineAssetPreviewShapes_v1.0.0_BUILD
0603X_WOS_MarineAssetPalettePack_v1.0.0_BUILD
0603Y_WOS_AISVesselMetadataAudit_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/marineVesselTaxonomyResolver.js`; register it after `actorAssetLibraryAuthority.js`; optionally expose debug wrappers in `studio/studioShell.js` and `worldSpaceVehicleDebug.js`.
- **What**: Run `node --check wall/systems/actors/marineVesselTaxonomyResolver.js`, then test `resolveVessel({shipType:52})`, `resolveVessel({shipType:70,lengthM:210})`, `resolveVessel({shipType:80})`, `resolveVessel({})`, and `resolveAssetCandidate({actorType:"vehicle.bus"})`.
- **Expect**: The resolver returns marine asset candidates with role/confidence/reason metadata, uses the 0603T asset pack safely, leaves default assignments unchanged, and does not mutate AIS truth, actors, renderer, feeds, Drive, Wall, or Mapbox state.
