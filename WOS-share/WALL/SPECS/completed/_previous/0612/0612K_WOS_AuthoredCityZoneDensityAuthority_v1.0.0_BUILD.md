# 0612K_WOS_AuthoredCityZoneDensityAuthority_v1.0.0_BUILD

## Status

BUILD

## Purpose

Create the first WOS city-density authority layer.

This build changes the problem from:

```text
replace one building inside dense Mapbox city clutter
```

to:

```text
WOS decides which buildings exist inside authored city zones
```

New York is the first authored WOS zone.

Outside declared WOS zones, the world remains plotted normally.

---

## Core Decision

Mapbox remains the geographic substrate.

WOS owns authored density treatment inside declared zones.

```text
Outside WOS zones:
  default map behavior

Inside WOS zones:
  WOS controls building density
  WOS keeps skyline/landmark anchors
  WOS suppresses filler clutter
  WOS preserves room for symbolic objects
```

---

## Immediate Goal

Regain production momentum by proving one city-scale rule:

```text
Inside NYC, dense filler buildings do not automatically return at close zoom.
```

This build does not need to solve all landmarks, all boroughs, or all future ghost/canvas systems.

It must prove that WOS can reduce city density in NYC while keeping the rest of the world unchanged.

---

## Required New System

```text
CityDensityAuthority
```

Suggested file:

```text
wall/systems/presentation/cityDensityAuthority.js
```

Version:

```text
v1.0.0
```

Classification:

```text
runtime-authority
city-density-authority
```

---

## Required Zone

Create first authored zone:

```js
const WOS_ZONE_NYC = {
  id: "WOS_ZONE_NYC",
  label: "New York City",
  bounds: {
    west: -74.30,
    south: 40.45,
    east: -73.65,
    north: 40.95
  }
};
```

Bounding box is acceptable for v1.0.0.

Future versions may use borough polygons.

---

## Treatment Types

Every building inside an authored zone resolves to one treatment:

```text
KEEP
GHOST
CANVAS
SUPPRESS
REPLACE
```

For v1.0.0, only implement:

```text
KEEP
SUPPRESS
REPLACE
```

Ghost and canvas are deferred.

---

## Phase 1 Classification Rules

### KEEP

A building is kept if:

```js
height >= SKYLINE_HEIGHT_MIN
```

Default:

```js
SKYLINE_HEIGHT_MIN = 120
```

or:

```js
manualKeepRegistry.has(buildingId)
```

---

### REPLACE

A building is replacement-authorized if:

```js
replacementRegistry.has(buildingId)
```

Replacement targets must remain visible as WOS objects.

---

### SUPPRESS

Default treatment inside NYC:

```text
all non-kept, non-replacement filler buildings
```

---

## Required Behavior

### B1 — Outside NYC unchanged

Outside `WOS_ZONE_NYC`, CityDensityAuthority must do nothing.

```text
No global city suppression.
No global building treatment.
No global style mutation.
```

---

### B2 — Inside NYC density control

Inside `WOS_ZONE_NYC`, dense filler building clutter must be reduced.

Acceptable v1.0.0 strategies:

```text
hide low/mid-rise fill-extrusion building layers
lower filler opacity
filter host/query building layer by height threshold
preserve WOS replacement layer
```

Do not attempt Mapbox Standard model-layer per-feature suppression.

Use the editable dark-v11 / non-Standard substrate where possible.

---

### B3 — Skyline anchors remain

Buildings above the threshold should remain visible if the source layer supports height filtering.

If height filtering is not available in a given layer, report limitation clearly and use opacity-based density reduction as fallback.

---

### B4 — Replacement layer remains dominant

Canonical WOS replacement layer must remain visible:

```text
wos-replacement-markers
wos-replacement-layer
```

Do not create duplicate replacement sources/layers.

Forbidden:

```text
wos-building-replacements
wos-building-replacement-layer
```

---

### B5 — Manual registries

Create lightweight manual registries:

```text
wall/data/wosBuildingKeepRegistry.json
wall/data/wosBuildingSuppressRegistry.json
```

Initial structure:

```json
{
  "buildings": []
}
```

These are allowed to be empty in v1.0.0.

---

## Debug API

Expose:

```js
_wos.debug.cityDensity.enable()
_wos.debug.cityDensity.disable()
_wos.debug.cityDensity.getZoneClassification()
_wos.debug.cityDensity.getDensityReport()
_wos.debug.cityDensity.classifyBuilding(buildingKeyOrFeature)
```

Also expose:

```js
SBE.CityDensityAuthority.enable()
SBE.CityDensityAuthority.disable()
SBE.CityDensityAuthority.report()
SBE.CityDensityAuthority.classifyBuilding()
```

---

## Required Report Shape

```js
{
  enabled: true,
  activeZoneId: "WOS_ZONE_NYC",
  insideAuthoredZone: true,
  skylineHeightMin: 120,
  keptCount: 0,
  suppressedCount: 0,
  replacementCount: 0,
  fallbackMode: null,
  layersTouched: [],
  canonicalReplacementLayerPresent: true,
  duplicateReplacementLayersPresent: false,
  lastError: null
}
```

---

## Validation

### T1 — Outside NYC unchanged

Move map outside NYC.

Run:

```js
_wos.debug.cityDensity.enable()
_wos.debug.cityDensity.getZoneClassification()
```

Expected:

```js
{
  insideAuthoredZone: false,
  activeZoneId: null
}
```

No building layers are altered.

---

### T2 — Inside NYC zone detected

Move map to NYC.

Expected:

```js
{
  insideAuthoredZone: true,
  activeZoneId: "WOS_ZONE_NYC"
}
```

---

### T3 — Dense filler reduced

Inside NYC close zoom:

Expected:

```text
low/mid-rise filler density is visibly reduced
```

---

### T4 — Skyline anchors preserved

Expected:

```text
major tall buildings remain visible when height data/filtering supports it
```

If not technically possible in the current layer, report:

```text
HEIGHT_FILTER_UNAVAILABLE
```

and use fallback opacity/visibility reduction.

---

### T5 — WOS replacement remains visible

Expected:

```text
wos-replacement-layer remains visible and dominant
```

---

### T6 — Duplicate replacement layers absent

Expected:

```js
map.getSource("wos-building-replacements") === undefined
map.getLayer("wos-building-replacement-layer") === undefined
```

---

### T7 — Publishable screenshot

Provide one screenshot where:

```text
NYC clutter is reduced
WOS object is visible
scene still reads as New York
```

---

## Non-Goals

Do not implement:

```text
full landmark dataset
official NYC landmark import
tourist POI scrape
ghost footprint layer
canvas surface layer
event/community scoring
advertising system
global city treatment
new replacement runtime
new map renderer
new suppression investigation
```

---

## Claude Instruction

Do not reopen the per-building suppression problem.

Do not use Mapbox Standard config suppression.

Do not create another replacement system.

Do not create another city renderer.

This build must prove the first city-density authority rule:

```text
Inside NYC, WOS controls density.
Outside NYC, Mapbox remains normal.
```

---

## Deliverables

Claude/Codex must return:

```text
1. Exact diff
2. Files changed
3. New debug commands
4. Zone detection proof
5. NYC density-reduction proof
6. Outside-NYC no-op proof
7. Replacement layer still visible proof
8. One screenshot description
9. Remaining blockers
```

---

## Success Definition

Success is:

```text
WOS can reduce dense NYC building clutter as a city-level rule without fighting one building at a time.
```

Success is not:

```text
perfect landmark curation
full NYC completion
manual tagging every building
another one-off replacement hack
```

This is the first step toward:

```text
New York becomes authored.
The rest of the world stays plotted normally.
```
