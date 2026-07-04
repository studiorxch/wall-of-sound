---
layout: spec
title: "AIS Metadata Normalization Patch"
date: 2026-06-04
doc_id: "0604C_WOS_AISMetadataNormalizationPatch_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "actors"
component: "ais_metadata_normalization"

type: "patch-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "read-only-normalization"

summary: "Adds a read-only normalization layer that derives vessel classification hints from sparse AIS records so taxonomy can improve without mutating raw AIS truth."

depends_on:
  - "0603Y_WOS_AISVesselMetadataAudit_v1.0.0_BUILD"
  - "0603Y.1_WOS_AISMetadataAuditSourceAdapterPatch_v1.0.0_BUILD"
  - "0603U_WOS_MarineVesselTaxonomyResolver_v1.0.0_BUILD"
  - "0603V_WOS_MarineTaxonomyAssetBridge_v1.0.0_BUILD"
  - "0603T_WOS_MarineVesselAssetPack_v1.0.0_BUILD"

enables:
  - "AIS metadata normalization"
  - "name-based vessel hints"
  - "dimension-based vessel hints"
  - "ferry/service/tug/cargo inference"
  - "taxonomy input enrichment"
  - "audit-visible confidence reporting"

tags:
  - "wos"
  - "ais"
  - "marine"
  - "metadata"
  - "normalization"
  - "taxonomy"
  - "read-only"
  - "patch"
---

# 0604C_WOS_AISMetadataNormalizationPatch_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Add a read-only AIS metadata normalization layer.

The live AIS audit now proves:

```text
AIS source is live.
Audit source is fixed.
shipType coverage is 0%.
Names exist.
MMSI exists.
Some dimensions exist.
```

That means WOS cannot rely on numeric AIS ship type alone.

0604C creates a normalization pass that derives classification hints from available AIS fields:

```text
name
callsign
MMSI
dimensions
speed
status
source
known local patterns
```

without mutating raw AIS truth.

---

# Core Rule

Raw AIS remains untouched.

Normalized metadata exists only as a derived copy:

```text
raw AIS record
→ normalized AIS copy
→ taxonomy resolver / audit / bridge
```

Never write inferred fields back to AISRuntime records.

---

# Required Files

Create:

```text
wall/systems/actors/aisMetadataNormalizer.js
```

Modify:

```text
wall/index.html
wall/systems/actors/aisVesselMetadataAudit.js
wall/systems/actors/marineVesselTaxonomyResolver.js
wall/systems/actors/marineTaxonomyAssetBridge.js
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
WorldSpaceVehicleLayer
ActorAssetLibraryAuthority
ActorRenderAuthority
TruthActorRuntime
Mapbox style systems
Drive runtime
feed runtimes
hero runtime
```

unless only registering the new module.

---

# Authority Boundary

`AISMetadataNormalizer` owns:

- read-only normalized AIS copies
- derived shipType hints
- name-pattern inference
- dimension-pattern inference
- confidence + reason reporting
- local harbor classification hints

It does **not** own:

- raw AIS feed mutation
- actor identity
- asset assignment persistence
- renderer geometry
- WSL payload mutation
- Mapbox styling
- AIS polling cadence
- vessel motion
- final taxonomy authority

---

# Required Module

Export:

```js
SBE.AISMetadataNormalizer
```

Public API:

```js
Object.freeze({
  VERSION,
  normalize,
  normalizeBatch,
  explain,
  listRules,
  getState,
  setEnabled,
  setDebug
})
```

---

# Normalized Output Shape

`normalize(record)` returns:

```js
{
  ok: true,
  raw: record,

  normalized: {
    actorId,
    actorType: "marine.vessel",
    sourceId: "ais_runtime",

    name,
    mmsi,
    callsign,

    metadata: {
      normalized: true,
      normalizedAt,
      normalizerVersion,

      rawShipType: null,
      shipType: 52,
      shipTypeSource: "name_hint",
      inferredRole: "tug",
      inferredAssetId: "asset://marine/tug_boat",
      inferenceConfidence: 0.72,
      inferenceReason: "name contains tug keyword",

      lengthM,
      widthM,
      speedKts,
      headingDeg,
      status,

      raw: {
        shipType: null,
        type: null,
        vesselType: null
      }
    }
  },

  inference: {
    applied: true,
    role: "tug",
    assetId: "asset://marine/tug_boat",
    pseudoShipType: 52,
    confidence: 0.72,
    source: "name_hint",
    reason: "name contains tug keyword",
    rules: ["name:tug"]
  },

  warnings: []
}
```

If no inference:

```js
{
  ok: true,
  normalized: actorLikeCopy,
  inference: {
    applied: false,
    role: "unknown",
    assetId: "asset://marine/unknown_vessel",
    pseudoShipType: null,
    confidence: 0.25,
    source: "fallback",
    reason: "no reliable normalization hints",
    rules: []
  },
  warnings: ["no_normalization_hint"]
}
```

---

# Read-Only Requirements

The returned `normalized` object must be a copy.

Must not mutate:

```js
record
record.metadata
record.properties
AISRuntime internal vessels
TruthActorRuntime records
```

Use shallow copy plus rebuilt `metadata`.

---

# Rule Categories

## 1. Raw Numeric Ship Type

If raw numeric ship type exists, preserve it.

```text
confidence: 0.95
source: raw_ship_type
```

Do not override raw numeric ship type with name inference.

---

## 2. Name-Based Inference

Lowercase and normalize name.

Match terms.

### Tug

Keywords:

```text
tug
towing
towboat
tractor tug
```

Output:

```text
role: tug
pseudoShipType: 52
assetId: asset://marine/tug_boat
confidence: 0.72
```

### Ferry / Passenger

Keywords:

```text
ferry
nyc ferry
staten island
seastreak
hornblower
circle line
water taxi
```

Output:

```text
role: passenger
pseudoShipType: 60
assetId: asset://marine/passenger_ferry
confidence: 0.70
```

If name contains `nyc ferry`:

```text
assetId: asset://marine/nyc_ferry_small
confidence: 0.78
```

### Pilot Boat

Keywords:

```text
pilot
sandy hook pilot
harbor pilot
```

Output:

```text
role: pilot
pseudoShipType: 50
assetId: asset://marine/pilot_boat
confidence: 0.75
```

### Police / Law Enforcement

Keywords:

```text
police
nypd
sheriff
coast guard
uscg
law enforcement
```

Output:

```text
role: law_enforcement
pseudoShipType: 55
assetId: asset://marine/police_boat
confidence: 0.70
```

### Fire / Rescue

Keywords:

```text
fire
fdny
rescue
marine rescue
```

Output:

```text
role: fire_rescue
pseudoShipType: 51
assetId: asset://marine/fire_boat
confidence: 0.72
```

### Cargo / Container

Keywords:

```text
cargo
container
maersk
msc
cosco
evergreen
hapag
sealand
cmacgm
cma cgm
```

Output:

```text
role: cargo
pseudoShipType: 70
assetId: asset://marine/container_ship
confidence: 0.70
```

### Tanker

Keywords:

```text
tanker
oil
petroleum
chemical
fuel
gas
lng
lpg
```

Output:

```text
role: tanker
pseudoShipType: 80
assetId: asset://marine/tanker
confidence: 0.72
```

### Barge

Keywords:

```text
barge
scow
deck barge
hopper
```

Output:

```text
role: barge
pseudoShipType: 90
assetId: asset://marine/barge
confidence: 0.68
```

### Yacht

Keywords:

```text
yacht
pleasure
private
```

Output:

```text
role: yacht
pseudoShipType: 37
assetId: asset://marine/yacht_small
confidence: 0.62
```

### Sailboat

Keywords:

```text
sail
sailing
sloop
ketch
```

Output:

```text
role: sailing
pseudoShipType: 36
assetId: asset://marine/sailboat
confidence: 0.68
```

### Fishing

Keywords:

```text
fish
fishing
trawler
lobster
```

Output:

```text
role: fishing
pseudoShipType: 30
assetId: asset://marine/fishing_boat
confidence: 0.68
```

---

# 3. Dimension-Based Inference

Only use if name inference is absent or weak.

Suggested rules:

```text
lengthM >= 220 and widthM >= 25 → cargo_large / container_ship candidate
lengthM >= 160 and widthM >= 20 → cargo_large
lengthM >= 80 and widthM >= 12 → cargo_small
lengthM <= 35 and widthM <= 10 and speedKts >= 10 → service_boat / pilot candidate
lengthM <= 25 and name absent → unknown_vessel
```

Dimension-only confidence should stay lower:

```text
0.45–0.62
```

Do not overclaim.

---

# 4. Combined Hint Boost

If name and dimensions agree:

```text
+0.08 confidence
```

Example:

```text
name includes tanker
lengthM > 100
→ confidence 0.80
```

Clamp:

```text
0.0–0.90 for inferred records
0.95 for raw numeric shipType
```

---

# 5. Conflict Handling

If hints conflict:

```text
name says ferry
dimensions say cargo
```

Prefer:

```text
name inference
```

but add warning:

```text
dimension_conflict
```

If raw numeric ship type conflicts with name:

```text
preserve raw shipType
add warning: name_conflicts_with_raw_ship_type
```

---

# Integration Points

## AISVesselMetadataAudit

Patch audit source path:

```text
raw actor-like record
→ AISMetadataNormalizer.normalize(record).normalized
→ auditActor(normalized)
```

Add audit fields:

```js
normalizationCoverage: {
  inferred: { count, percent },
  rawShipType: { count, percent },
  nameHint: { count, percent },
  dimensionHint: { count, percent },
  fallback: { count, percent }
}
```

Add role counts from normalized inference.

Add warnings if:

```text
normalization fallback > 50%
inferred confidence average < 0.50
```

## MarineVesselTaxonomyResolver

Patch resolver input path:

```text
if shipType missing:
  call AISMetadataNormalizer.normalize(actor)
  use normalized.metadata.shipType if inference.applied
```

Do not duplicate rules.

Do not mutate actor.

Taxonomy result should include:

```js
normalized: true,
normalizationSource,
normalizationConfidence,
normalizationReason
```

## MarineTaxonomyAssetBridge

Should automatically benefit because resolver returns a better candidate.

If bridge audit exists, include normalization fields in audit output.

---

# Debug API

Add to:

```js
_wos.debug.worldActors
```

Required:

```js
aisNormalize(recordOrActorId)
aisNormalizeSample(options)
aisNormalizationState()
aisNormalizationRules()
```

Recommended:

```js
aisMetadataAudit()
```

should show normalization coverage.

Sample output rows:

```js
{
  actorId,
  name,
  rawShipType,
  normalizedShipType,
  role,
  assetId,
  confidence,
  source,
  reason,
  warnings
}
```

---

# Public API Details

## normalize(record)

- accepts actor-like object
- accepts raw AIS-like object
- if string ID is passed, may attempt audit source lookup or TruthActor lookup
- returns safe error on missing

```js
{ ok:false, reason:"record_not_found" }
```

## normalizeBatch(records)

Returns:

```js
{
  version,
  count,
  normalizedCount,
  inferredCount,
  rawShipTypeCount,
  fallbackCount,
  averageConfidence,
  rows
}
```

## explain(record)

Returns normalized result plus matching rule details.

## listRules()

Returns rule definitions:

```js
[
  { id:"name:tug", type:"name", keywords:["tug"], role:"tug", pseudoShipType:52, assetId:"asset://marine/tug_boat", confidence:0.72 }
]
```

---

# Safety Constraints

Do not:

- start AIS
- start feeds
- start Drive
- mutate raw AIS records
- mutate `metadata`
- mutate assignment map
- mutate bridge state
- mutate taxonomy rules
- change WSL geometry
- change actor IDs
- force actor refresh
- persist anything
- use localStorage

Everything is runtime-read-only and manual.

---

# Acceptance Tests

## Test 1: Raw Ship Type Preserved

```js
SBE.AISMetadataNormalizer.normalize({
  mmsi:"1",
  vesselName:"ODD FERRY NAME",
  shipType:52
})
```

Expected:

```text
metadata.shipType: 52
inference.source: raw_ship_type
warning includes name_conflicts_with_raw_ship_type if name maps differently
```

---

## Test 2: Tug Name Inference

```js
SBE.AISMetadataNormalizer.normalize({
  mmsi:"2",
  vesselName:"TUG LINDA"
})
```

Expected:

```text
inference.applied: true
role: tug
pseudoShipType: 52
assetId: asset://marine/tug_boat
confidence >= 0.70
metadata.shipType: 52
metadata.shipTypeSource: name_hint
```

---

## Test 3: Ferry Name Inference

```js
SBE.AISMetadataNormalizer.normalize({
  vesselName:"NYC FERRY 23"
})
```

Expected:

```text
role: passenger
assetId: asset://marine/nyc_ferry_small
confidence >= 0.75
```

---

## Test 4: Large Cargo Dimension Inference

```js
SBE.AISMetadataNormalizer.normalize({
  vesselName:"UNKNOWN",
  lengthMeters:230,
  widthMeters:32
})
```

Expected:

```text
role: cargo
assetId: asset://marine/cargo_large or container_ship
source: dimension_hint
confidence between 0.45 and 0.65
```

---

## Test 5: Unknown Fallback

```js
SBE.AISMetadataNormalizer.normalize({
  vesselName:"ABC123"
})
```

Expected:

```text
inference.applied:false
role: unknown
assetId: asset://marine/unknown_vessel
warning includes no_normalization_hint
no crash
```

---

## Test 6: Audit Integration

With live AIS source and no raw shipType:

```js
_wos.debug.worldActors.aisMetadataAudit()
```

Expected:

```text
shipType coverage improves via normalized shipType
normalizationCoverage appears
unknown taxonomy decreases if names/dimensions carry hints
source remains ais_runtime
```

---

## Test 7: No Mutation

Before and after:

```js
var v = SBE.AISRuntime.getActiveVessels()[0];
var before = JSON.stringify(v);
SBE.AISMetadataNormalizer.normalize(v);
JSON.stringify(v) === before;
```

Expected:

```text
true
```

---

# Failure Conditions

This build fails if:

- raw AIS records are mutated
- assignment map changes
- bridge settings change
- AIS feed starts
- Drive starts
- Studio starts feeds
- WSL geometry changes
- raw shipType is overridden by name
- malformed record crashes
- audit still treats all no-shipType vessels as unknown when names clearly match rules
- normalization silently invents high-confidence classes from weak hints

---

# Implementation Notes

## Confidence Discipline

Do not make weak inference too strong.

Suggested confidence ranges:

```text
raw shipType: 0.95
strong name hint: 0.68–0.78
name + dimension agreement: 0.76–0.86
dimension-only: 0.45–0.62
fallback unknown: 0.25
```

## Known NYC Harbor Bias

This normalizer may include NYC-specific hints because WOS currently targets NYC harbor.

But rules must remain explicit and inspectable.

Do not bury NYC assumptions in hidden code.

---

# Future Follow-Ups

After 0604C:

```text
0604D_WOS_HarborTaxonomyConfidenceTuning_v1.0.0_BUILD
0604E_WOS_MarineNamePatternRegistry_v1.0.0_BUILD
0604F_WOS_HarborVisualDifferentiationTuning_v1.0.0_BUILD
0604G_WOS_AISSourceUpgradeReview_v1.0.0
```

---

# Implementation Guide

- **Where**: Create `wall/systems/actors/aisMetadataNormalizer.js`; register it after `marineTaxonomyAssetBridge.js` or before `aisVesselMetadataAudit.js`; patch `aisVesselMetadataAudit.js`, `marineVesselTaxonomyResolver.js`, `marineTaxonomyAssetBridge.js`, and `worldSpaceVehicleDebug.js` to use normalized copies only.
- **What**: Run `node --check wall/systems/actors/aisMetadataNormalizer.js`, `node --check wall/systems/actors/aisVesselMetadataAudit.js`, `node --check wall/systems/actors/marineVesselTaxonomyResolver.js`, `node --check wall/systems/actors/marineTaxonomyAssetBridge.js`, and `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; test tug/ferry/cargo/unknown cases plus live Wall audit.
- **Expect**: WOS improves AIS taxonomy from sparse records by deriving explicit, inspectable normalization hints from names and dimensions while leaving raw AIS truth, assignments, bridge settings, feed state, Drive, WSL geometry, Wall, Studio, and Mapbox behavior unchanged.
