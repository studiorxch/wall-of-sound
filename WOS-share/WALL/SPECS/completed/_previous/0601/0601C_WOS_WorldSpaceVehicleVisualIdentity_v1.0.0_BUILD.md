# 0601C_WOS_WorldSpaceVehicleVisualIdentity_v1.0.0 [BUILD]

## Purpose

Establish the first permanent visual identity system for all world-space ground vehicles.

This specification transforms vehicle rendering from calibration-oriented geometry into recognizable world actors while preserving the authority boundaries established by:

```
0531M WorldSpaceVehicleShapeCalibration0531N WorldSpaceTrafficVehicleBinding0601A WorldSpaceVehicleLODAndScale0601B WorldSpaceVehicleSessionRebind
```

This is a presentation-layer specification.

No simulation behavior may be modified.

No routing behavior may be modified.

No runtime authority may be modified.

---

# Core Doctrine

## Simulation Owns Truth

Simulation systems remain authoritative for:

```
positionheadingspeedroutelifecyclespawn state
```

Vehicle visuals must never infer or generate simulation state.

---

## Visual Layer Owns Identity

WorldSpaceVehicleLayer owns:

```
silhouettebody colorglass treatmentroof treatmentheadlight cuestaillight cuesdecal treatmentvariant appearancedistance readability
```

Visual identity must be derived entirely from actorType + variant.

---

# Architectural Goal

Current vehicles successfully communicate:

```
vehicle existsvehicle headingvehicle location
```

They do not yet communicate:

```
taxisedanhero vehicledelivery truckgraffiti truck
```

The objective is instant recognition.

A viewer should identify the vehicle class without opening debug tools.

---

# VehicleVisualRegistry

## Requirement

Introduce:

```
VehicleVisualRegistry
```

as the single source of truth for visual appearance.

No vehicle-specific colors or decals may be hardcoded inside mesh builders.

---

## Example Structure

```
export const VehicleVisualRegistry = {  hero_car: {    sedan_red: {      body: '#cf3434',      roof: '#9c2424',      glass: '#2b2f36',      accent: '#f4d35e'    }  },  traffic_car: {    taxi_yellow: {      body: '#e7c400',      roof: '#c9a800',      glass: '#2b2f36',      accent: '#111111'    },    sedan_dark: {      body: '#30343b',      roof: '#25292f',      glass: '#1b1e23',      accent: '#8892a0'    }  },  box_truck: {    clean_white: {      body: '#f4f4f4',      cargo: '#e6e6e6',      glass: '#2b2f36'    },    sticker_graffiti_test: {      body: '#f4f4f4',      cargo: '#e6e6e6',      glass: '#2b2f36',      graffiti: true    }  }};
```

Registry structure may expand later.

---

# Hero Vehicle Identity

## Purpose

The hero vehicle must remain visually dominant.

---

## Requirements

Near LOD:

```
chassiscabinfront windshieldrear windshieldheadlight cuetaillight cuecontact shadow
```

---

## Silhouette

Hero silhouette must remain distinct from traffic sedans.

Examples:

```
longer rooflinelarger cabinstronger glass bandhigher visual contrast
```

---

## Dominance Rule

Hero vehicle should remain identifiable at:

```
zoom 12zoom 15zoom 18
```

without relying solely on color.

---

# Traffic Sedan Identity

## Purpose

Represent generic civilian traffic.

---

## Requirements

Near LOD:

```
compact cabinsimplified rooffront windshieldrear windshieldcontact shadow
```

---

## Doctrine

Traffic sedans should feel related to the hero vehicle but clearly secondary.

---

# Taxi Identity

## Purpose

Create immediate recognition.

---

## Requirements

Visual cues:

```
yellow bodydark glassroof signblack beltline
```

---

## Distance Rule

Taxi must remain identifiable at:

```
midfar
```

LOD tiers.

---

# Box Truck Identity

## Purpose

Represent service and delivery vehicles.

---

## Requirements

Near LOD:

```
cabcargo boxrear door cueside panel cuecontact shadow
```

---

## Size Doctrine

Box trucks must always read larger than passenger vehicles.

This applies across every LOD tier.

---

# Graffiti Truck Variant

## Purpose

Provide the first stylized world vehicle.

---

## Requirements

Near LOD:

```
cargo boxgraffiti side treatmentdecal panel
```

---

## Constraint

Graffiti must never affect silhouette.

Identity comes from:

```
truck shape firstart treatment second
```

---

# LOD Identity Preservation

## Near

Render:

```
full mesh
```

---

## Mid

Render:

```
simplified cabinsimplified glass
```

---

## Far

Render:

```
silhouette-first representation
```

---

## Tiny

Render:

```
token representation
```

---

## Requirement

A vehicle must remain recognizable while transitioning:

```
near → midmid → farfar → tiny
```

---

# Mesh Authority

## Mesh Definition

Vehicle definition becomes:

```
shapeModeactorTypevariantlodTier
```

This extends the existing constitutional definition.

---

## Rebuild Rule

Mesh rebuilds are allowed only when one of the above values changes.

Position updates must never trigger mesh rebuilds.

---

# Debug Authority

## Add

```
_wos.debug.worldVehicles.visuals()
```

---

## Output

Per vehicle:

```
idactorTypevariantlodTiervisualProfilebodyColorworldVisible
```

---

# Acceptance Tests

## Test A — Static Recognition

```
_wos.debug.traffic.spawnVisibleTest()
```

Expected:

```
taxisedanwhite truckgraffiti truck
```

immediately recognizable.

---

## Test B — Distance Readability

Test:

```
zoom 12zoom 15zoom 18
```

Expected:

```
identity preserved
```

for all vehicle classes.

---

## Test C — LOD Continuity

Transition:

```
near → midmid → farfar → tiny
```

Expected:

```
no flickerno rebuild loopno identity collapse
```

---

## Test D — Hero Drive

Launch Drive mode.

Expected:

```
hero vehicle remains visually dominanttraffic remains distinguishable
```

throughout route traversal.

---

# Non-Goals

This specification does not introduce:

```
vehicle animationwheel rotationbrake lightsturn signalslane changestraffic AIvehicle physics
```

Those belong to future presentation layers.

---

# Implementation Guide

### Where

```
wall/layers/worldSpaceVehicleLayer.jswall/registry/VehicleVisualRegistry.jswall/debug/worldSpaceVehicleDebug.js
```

### What

```
npm run dev
```

Then:

```
_wos.debug.traffic.spawnVisibleTest()_wos.debug.worldVehicles.visuals()
```

### Expect

```
Recognizable hero carRecognizable taxiRecognizable sedanRecognizable white truckRecognizable graffiti truckIdentity preserved across all LOD tiers.
```