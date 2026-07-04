# 0609V_WOS_BuildingReplacementRuntime_v1.0.0_BUILD

## Purpose

Convert MapLab replacement manifests into actual WOS Actors rendered inside the Wall runtime.

This build transforms replacement records from metadata into visible world objects.

Current behavior:

```text
Building
→ Replacement Metadata
→ Color Cue
```

Target behavior:

```text
Building
→ Replacement Metadata
→ Replacement Runtime
→ World Actor
```

The replacement runtime becomes the bridge between:

```text
Map Truth
→ MapLab Authoring
→ Building Manifest
→ World Actor Runtime
```

---

## Authority

### Reads

- BuildingEditRegistry manifest
    
- Building replacement metadata
    
- Mapbox building features
    
- Building centroid and height data
    

### Writes

- WorldActorRegistry
    
- Presentation actor instances
    

### Must Not

- Modify building geometry
    
- Modify replacement manifest
    
- Modify map truth
    
- Modify Mapbox sources
    

---

## Runtime

### New File

```text
wall/systems/runtime/buildingReplacementRuntime.js
```

### Registration

```js
SBE.BuildingReplacementRuntime
```

---

## Supported Archetypes

```text
warehouse
skyscraper
apartment
radio-tower
pagoda
civic-block
industrial-stack
custom-placeholder
```

Source of truth:

```js
BuildingEditRegistry.VALID_ARCHETYPES
```

Must not duplicate archetype lists elsewhere.

---

## Actor Model

Each replacement spawns a runtime actor.

```js
{
  id,

  buildingKey,

  archetype,

  lng,
  lat,

  heading,

  scale,

  footprintArea,

  inheritedHeight,

  replacementStyle,

  actorType: "building-replacement"
}
```

---

## Building Key Resolution

Input:

```text
composite:building:248143639
```

Resolution:

```js
{
  source: "composite",
  sourceLayer: "building",
  featureId: "248143639"
}
```

Use:

```js
BuildingEditRegistry.parseKey()
```

No custom parsing.

---

## Spawn Position

Use building centroid.

Priority:

```text
Building polygon centroid
Fallback:
bounding box center
```

Runtime stores:

```js
lng
lat
```

World projection remains owned by existing render infrastructure.

---

## Height Modes

Supported:

```text
inherit
low
medium
tall
hero
```

Mapping:

```js
inherit = source height

low = 0.5x

medium = 1.0x

tall = 1.5x

hero = 2.5x
```

Applied at actor creation.

---

## Scale Rules

Final scale:

```js
finalScale =
buildingReplacement.scale
*
heightModeMultiplier
```

Invalid values normalize to:

```js
1.0
```

---

## Primitive Visual Phase

Phase 1 intentionally avoids production models.

Warehouse:

```text
Box
```

Skyscraper:

```text
Tall Prism
```

Apartment:

```text
Medium Prism
```

Radio Tower:

```text
Cylinder
```

Pagoda:

```text
Stacked Boxes
```

Civic Block:

```text
Wide Box
```

Industrial Stack:

```text
Box + Stack
```

Custom Placeholder:

```text
White Cube
```

Purpose:

```text
Validate replacement pipeline
```

Not:

```text
Final building art
```

---

## Runtime Sync

Runtime watches:

```text
wos.maplab.buildings
```

Events:

```text
replacement added
replacement updated
replacement removed
```

Actions:

```text
spawn actor
update actor
despawn actor
```

No page reload required.

---

## Visibility Rules

Replacement Enabled:

```text
Spawn Actor
```

Replacement Disabled:

```text
Despawn Actor
```

Building remains visible unless hidden through existing projection rules.

---

## Registry Lifecycle

Startup:

```text
Load manifest
Discover replacements
Spawn actors
```

Style Reload:

```text
Re-project actors
```

Manifest Change:

```text
Diff
Apply changes
```

---

## Debug API

```js
_wos.debug.buildingReplacement.status()
```

Returns:

```js
{
  actorCount,
  activeReplacements,

  archetypes,

  spawned,
  updated,
  removed,

  lastSpawn,
  lastError
}
```

Additional:

```js
_wos.debug.buildingReplacement.reload()

_wos.debug.buildingReplacement.clear()

_wos.debug.buildingReplacement.list()
```

---

## Acceptance Tests

### T1

Replacement manifest spawns actor.

### T2

Actor positioned on selected building.

### T3

Changing archetype updates actor.

### T4

Changing scale updates actor.

### T5

Height modes apply correctly.

### T6

Disabling replacement despawns actor.

### T7

Runtime survives style reload.

### T8

Persistence survives browser reload.

### T9

Map truth remains unchanged.

### T10

Wall projection runtime remains operational.

### T11

Multiple replacements supported simultaneously.

### T12

No Canvas changes.

### T13

No Glyph changes.

### T14

No Studio editing UI changes.

---

## Implementation Guide

- **Where:** `wall/systems/runtime/buildingReplacementRuntime.js`, register after `buildingEditProjectionRuntime.js`
    
- **What:** Load manifest → resolve building keys → spawn/update/despawn replacement actors from registry changes
    
- **Expect:** Selecting a building and enabling a replacement causes a visible runtime actor to appear in Wall at that building location and persist across reloads