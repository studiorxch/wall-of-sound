# 0610E_WOS_BuildingStyleKit_v1.0.0_BUILD

## Purpose

Replace the current primitive replacement actors with recognizable architectural silhouettes while preserving the existing replacement pipeline.

## Goals

- Unique silhouette per archetype
- Unique rooftop language
- Readable at 300m, 600m, and 1200m
- Procedural geometry only
- No changes to registry, manifest, suppression, or actor lifecycle

## Archetypes

### Warehouse
- Long ridge roof
- Loading docks
- Roof vents
- Service extension

### Apartment
- Water tower
- Elevator bulkhead
- Setbacks
- Courtyard notch

### Skyscraper
- Podium
- Core tower
- Crown
- Antenna

### Radio Tower
- Triangular base
- Braces
- Beacon mast
- Dish platform

### Civic Block
- Dome
- Portico
- Wings
- Stair entry

### Industrial Stack
- Multiple stacks
- Pipe corridors
- Cooling units
- Annex structures

### Pagoda
- Strong tier separation
- Eaves
- Lantern cap
- Raised foundation

## Detail Tiers

### Far
Maximum 4 parts

### Mid
Maximum 12 parts

### Near
Maximum 24 parts

## Modules

```javascript
_addWaterTower()
_addRoofVent()
_addLoadingDock()
_addSetbackBand()
_addAntenna()
_addBeacon()
_addPipeRun()
_addCoolingUnit()
_addPortico()
_addDome()
```

## Debug

```javascript
_wos.debug.buildingReplacement.geometryStats()
```

Returns:

```javascript
{
  actorCount,
  averagePartCount,
  maxPartCount,
  archetypeBreakdown
}
```

## Acceptance Tests

T1–T17 as defined in build spec.

## Files

Required:
wall/systems/runtime/buildingReplacementRuntime.js

Optional:
wall/systems/runtime/buildingStyleKit.js

## Build State

BUILD
