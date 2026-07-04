---
layout: spec
title: "AIS Vessel Metadata Audit"
date: 2026-06-03
doc_id: "0603_WOS_AISVesselMetadataAudit_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "actors"
component: "ais_vessel_metadata_audit"

type: "system-spec"
status: "approved"

priority: "high"
risk: "low"

classification: "diagnostic-audit"

summary: "Adds a read-only AIS metadata audit for live marine actors so WOS can measure whether taxonomy inputs are reliable before expanding automatic vessel classification."

depends_on:
  - "0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0_BUILD"
  - "0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0_BUILD"
  - "0603W_WOS_MarineAssetWorldGeometryPass_v1.0.0_BUILD"
  - "0603X_WOS_MarineAssetPalettePack_v1.0.0_BUILD"

enables:
  - "AIS metadata quality inspection"
  - "taxonomy confidence reporting"
  - "marine actor classification audit"
  - "harbor visual QA"
  - "future taxonomy threshold tuning"

tags:
  - "wos"
  - "ais"
  - "marine"
  - "metadata"
  - "audit"
  - "taxonomy"
  - "debug"
---

# 0603Y_WOS_AISVesselMetadataAudit_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Add a read-only audit layer for live AIS vessel metadata.

The marine visual stack now exists:

```text
AIS truth
→ taxonomy resolver
→ taxonomy asset bridge
→ marine asset geometry
→ marine palettes
```

Before increasing automation, WOS needs to know:

```text
How reliable is the available AIS metadata?
```

0603Y answers:

```text
Which vessels have shipType?
Which vessels have usable names?
Which vessels classify cleanly?
Which fall back to unknown/generic?
Which taxonomy roles dominate the harbor?
Which live vessels are visually differentiated?
```

This is an audit only.

---

# Core Question

Can WOS trust the current AIS feed enough to classify vessels at scale?

0603Y should expose this without changing the world.

---

# Required Files

Create:

```text
wall/systems/actors/aisVesselMetadataAudit.js
```

Modify:

```text
wall/index.html
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional:

```text
studio/index.html
studio/studioShell.js
```

Do not modify:

```text
AISRuntime
MarineVesselTaxonomyResolver
MarineTaxonomyAssetBridge
ActorAssetLibraryAuthority
ActorRenderAuthority
WorldSpaceVehicleLayer
TruthActorRuntime
Mapbox style systems
feed runtimes
hero runtime
```

unless a read-only accessor is missing and must be safely guarded.

---

# Authority Boundary

AISVesselMetadataAudit owns:

- reading live marine actor records
- extracting metadata presence
- running taxonomy resolver read-only
- summarizing classification quality
- reporting coverage and confidence
- debug tables

It does **not** own:

- AIS feed truth
- taxonomy rules
- taxonomy application
- actor IDs
- asset assignments
- render payload mutation
- WSL geometry
- Mapbox style
- persistence
- feed polling

---

# Required Module

Export:

```js
SBE.AISVesselMetadataAudit
```

Public API:

```js
Object.freeze({
  VERSION,
  audit,
  auditActor,
  sample,
  getState,
  setDebug
})
```

---

# Data Source

Primary source:

```js
SBE.TruthActorRuntime.listActors()
```

Filter for marine actors:

```js
actor.actorType === "marine.vessel"
actor.actorType === "marine.ferry"
```

Fallback source if needed:

```js
SBE.AISRuntime
```

only if TruthActorRuntime does not expose actors.

Do not start AIS.

Do not start feeds.

Do not force refresh.

---

# Metadata Fields To Inspect

For each actor, inspect:

```js
actor.actorId
actor.actorType
actor.sourceId
actor.label
actor.name
actor.mmsi
actor.metadata
actor.metadata.shipType
actor.metadata.ship_type
actor.metadata.aisShipType
actor.metadata.type
actor.metadata.vesselType
actor.metadata.vesselClass
actor.metadata.lengthM
actor.metadata.widthM
actor.metadata.speedKts
actor.metadata.headingDeg
actor.metadata.status
```

Also check direct top-level equivalents:

```js
actor.shipType
actor.vesselType
actor.vesselClass
actor.lengthM
actor.widthM
actor.speedKts
```

Every field access must be guarded.

No throw.

---

# Per-Actor Audit Shape

`auditActor(actorOrId)` returns:

```js
{
  ok: true,
  actorId,
  actorType,
  sourceId,
  label,
  name,
  mmsi,

  hasShipType: true,
  shipType: 52,
  shipTypeSource: "metadata.shipType",

  hasName: true,
  hasMmsi: true,
  hasDimensions: true,
  lengthM: 24,
  widthM: 8,

  taxonomy: {
    ok: true,
    role: "tug",
    assetId: "asset://marine/tug_boat",
    assetLabel: "Tug Boat",
    confidence: 0.95,
    source: "shipType",
    reason: "AIS shipType 52 maps to tug",
    fallbackUsed: false
  },

  bridge: {
    available: true,
    enabled: true,
    applied: true,
    reason: null
  },

  qualityFlags: [
    "has_ship_type",
    "has_name",
    "taxonomy_high_confidence"
  ],

  qualityScore: 0.92
}
```

On missing actor:

```js
{
  ok: false,
  reason: "actor_not_found"
}
```

---

# Quality Flags

Recommended flags:

```text
has_ship_type
missing_ship_type
has_name
missing_name
has_mmsi
missing_mmsi
has_dimensions
missing_dimensions
taxonomy_high_confidence
taxonomy_medium_confidence
taxonomy_low_confidence
taxonomy_unknown
taxonomy_generic
bridge_applied
bridge_not_applied
metadata_sparse
```

---

# Quality Score

Return `0.0–1.0`.

Suggested scoring:

```text
+0.35 shipType present
+0.15 name present
+0.10 MMSI present
+0.10 dimensions present
+0.20 taxonomy confidence >= 0.80
+0.10 bridge applied
```

Clamp:

```text
0.0–1.0
```

This is diagnostic only, not authoritative.

---

# Aggregate Audit Shape

`audit()` returns:

```js
{
  version: "1.0.0",
  active: true,
  actorCount: 51,
  marineActorCount: 51,

  metadataCoverage: {
    shipType: { count: 42, percent: 82.35 },
    name: { count: 50, percent: 98.04 },
    mmsi: { count: 51, percent: 100 },
    dimensions: { count: 18, percent: 35.29 }
  },

  taxonomyCoverage: {
    resolved: { count: 39, percent: 76.47 },
    highConfidence: { count: 30, percent: 58.82 },
    mediumConfidence: { count: 9, percent: 17.65 },
    lowConfidence: { count: 12, percent: 23.53 },
    unknown: { count: 5, percent: 9.80 },
    generic: { count: 7, percent: 13.73 }
  },

  bridgeCoverage: {
    applied: { count: 34, percent: 66.67 },
    notApplied: { count: 17, percent: 33.33 }
  },

  roleCounts: {
    tug: 6,
    cargo: 9,
    tanker: 2,
    passenger: 8,
    unknown: 5
  },

  assetCounts: {
    "asset://marine/tug_boat": 6
  },

  averageQualityScore: 0.72,

  warnings: [
    "dimensions coverage below 50%"
  ],

  actors: [...]
}
```

Use helper percentage rounding to 2 decimals.

---

# Warnings

Add warnings when:

```text
shipType coverage < 60%
unknown taxonomy > 25%
generic fallback > 35%
bridge applied < 40%
averageQualityScore < 0.50
marine actor count === 0
```

Warnings are diagnostic.

No mutation.

---

# Sample API

`sample(options)`:

```js
sample({
  limit: 20,
  sortBy: "qualityScore" | "confidence" | "role" | "actorId",
  direction: "asc" | "desc",
  role: "tug",
  onlyWarnings: false
})
```

Return compact rows:

```js
[
  {
    actorId,
    name,
    shipType,
    role,
    confidence,
    assetId,
    bridgeApplied,
    qualityScore,
    flags
  }
]
```

Defaults:

```js
limit: 20
sortBy: "qualityScore"
direction: "asc"
```

This makes worst actors visible first.

---

# Debug API

Add under:

```js
_wos.debug.worldActors
```

Required:

```js
aisMetadataAudit()
aisMetadataSample(options)
aisMetadataAuditActor(actorId)
```

Optional:

```js
aisMetadataRoleCounts()
aisMetadataWarnings()
```

Console output should include:

- coverage summary
- warnings
- role counts
- compact table of worst sample rows

No frame logging.

No repeated timers.

---

# Studio Debug API

Optional:

```js
_wos.debug.studio.aisMetadataAudit()
_wos.debug.studio.aisMetadataSample(options)
```

If Studio has no live actors, return clean empty state.

Do not start feeds.

---

# Registration

Register in `wall/index.html` after:

```text
marineTaxonomyAssetBridge.js
```

and before debug modules if possible.

If Studio registers it, load after the bridge and before `studioShell.js`.

---

# No UI Required

V1 can be console-only.

Do not block on adding a Studio panel.

---

# Acceptance Tests

## Test 1: Empty State Safe

With no marine actors:

```js
SBE.AISVesselMetadataAudit.audit()
```

Expected:

```text
marineActorCount: 0
warnings includes marine actor count warning
no crash
```

---

## Test 2: Synthetic Tug Actor

Use an actor-like object or temporary TruthActorRuntime test actor:

```js
SBE.AISVesselMetadataAudit.auditActor({
  actorId: "test_tug",
  actorType: "marine.vessel",
  sourceId: "ais_runtime",
  name: "TUG LINDA",
  mmsi: "123456789",
  metadata: {
    shipType: 52,
    lengthM: 24,
    widthM: 8
  }
})
```

Expected:

```text
hasShipType: true
taxonomy.role: tug
taxonomy.assetId: asset://marine/tug_boat
qualityScore >= 0.80
```

---

## Test 3: Missing Metadata Actor

```js
SBE.AISVesselMetadataAudit.auditActor({
  actorId: "test_unknown",
  actorType: "marine.vessel",
  metadata: {}
})
```

Expected:

```text
hasShipType: false
taxonomy.role: unknown
qualityFlags includes missing_ship_type
qualityScore low
no crash
```

---

## Test 4: Live Audit

After AIS/Truth marine actors exist:

```js
_wos.debug.worldActors.aisMetadataAudit()
```

Expected:

```text
coverage summary printed
role counts printed
warnings printed if thresholds fail
sample table printed
```

---

## Test 5: Sample Worst Actors

```js
_wos.debug.worldActors.aisMetadataSample({ limit: 10, sortBy: "qualityScore", direction: "asc" })
```

Expected:

```text
10 or fewer compact rows
lowest quality first
```

---

## Test 6: No Mutation

Before and after audit:

```js
SBE.ActorAssetLibraryAuthority.getAssignment("ais.vessel").assetId
```

Expected unchanged:

```text
asset://marine/vessel_generic
```

Also verify:

```text
no feed starts
no Drive starts
no actor ID changes
no taxonomy bridge setting changes
```

---

# Failure Conditions

This build fails if:

- audit starts AIS or any feed
- audit starts Drive
- audit mutates actor records
- audit mutates metadata
- audit mutates assignment map
- audit changes bridge enabled/confidence state
- missing actor crashes
- missing metadata crashes
- non-marine actor crashes
- no actors state crashes
- console output frame-spams
- Wall Drive breaks
- Studio loads feeds

---

# Implementation Notes

## Read-Only Means Read-Only

Do not write temporary fields onto actor records.

If caching is needed, use module-local cache only.

Preferred v1:

```text
no cache
```

The audit is manually invoked.

## Use Existing Resolver

Call:

```js
SBE.MarineVesselTaxonomyResolver.resolveAssetCandidate(actor)
```

or:

```js
resolveVessel(...)
```

Do not duplicate taxonomy rules.

## Use Bridge Audit If Available

Call:

```js
SBE.MarineTaxonomyAssetBridge.auditActor(actorId)
```

only if actor ID exists and bridge is available.

Guard all bridge calls.

---

# Future Follow-Ups

After this:

```text
0603Z_WOS_HarborActorVisualDifferentiationPass_v1.0.0_BUILD
0604A_WOS_HarborAtmospherePass_v1.0.0_BUILD
0604B_WOS_MarineLightCuePass_v1.0.0_BUILD
0604C_WOS_AISMetadataNormalizationPatch_v1.0.0_BUILD
```

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/aisVesselMetadataAudit.js`; register it after `marineTaxonomyAssetBridge.js`; add read-only debug wrappers in `wall/systems/presentation/worldSpaceVehicleDebug.js`; optionally expose Studio wrappers.
- **What**: Run `node --check wall/systems/actors/aisVesselMetadataAudit.js` and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; test empty state, synthetic tug actor, missing metadata actor, live AIS audit, and worst-quality sample.
- **Expect**: WOS reports AIS metadata coverage, taxonomy confidence, bridge application, role/asset counts, warnings, and worst-quality actor samples without mutating AIS truth, actor records, asset assignments, taxonomy settings, feeds, Drive, Wall, Studio, or Mapbox behavior.
