---
layout: spec
title: "0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0_BUILD"
date: 2026-05-28
doc_id: "0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "AltitudeAwareWorldRenderer"
type: "interpretation-spec"
status: "active"
priority: "high"
risk: "medium"
classification: "interpretation-layer"
summary: "Defines the altitude-aware interpretation layer that changes world rendering behavior as aircraft climb, descend, and pass over infrastructure."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Altitude changes interpretation, not geographic truth"
depends_on:
  - "0528A_WOS_AirflightRuntimeBootstrap_v1.0.0"
  - "0527E_WOS_MapLayerCompositor_v1.0.0"
  - "0527D_WOS_Maritime2_5DContextPass_v1.0.0"
enables:
  - "0528C_WOS_CloudAtmosphereLayer_v1.0.0"
  - "Airspace corridor observability"
  - "Flight camera presentation"
tags:
  - "airflight"
  - "altitude"
  - "world-rendering"
  - "2.5d"
  - "presentation"
---

# 🚦 SPEC STAGE

Stage: **[BUILD]**  
Freeze Decision: **GO**  
Action: Build the altitude-aware world interpretation layer now.

---

# 0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0_BUILD

## Purpose

Create the first visible renderer policy where aircraft altitude changes how WOS draws the world.

This system exists because aircraft should not merely move over the existing map. As planes take off, climb, cruise, and descend, the surrounding world must visibly shift its rendering language:

```text
low altitude  → buildings, terminals, shadows, boats, local detail
mid altitude  → infrastructure corridors, water bodies, district geometry
high altitude → haze, route systems, airspace fields, abstract city mass
```

This is an interpretation layer only. It must not mutate aircraft truth, AIS truth, Mapbox geographic truth, atmosphere baseline truth, or camera authority outside explicit debug/test commands.

---

# Core Problem

0528A proves aircraft can spawn from JFK / LGA / EWR and move through altitude states. The missing piece is world response.

Current problem:

```text
aircraft altitude changes the aircraft icon,
but the world underneath does not yet change enough.
```

Required change:

```text
aircraft altitude becomes a global presentation signal.
```

When a plane climbs, the map should become less like a street map and more like a layered world surface.

---

# Build Target

Create:

```text
wall/systems/presentation/altitudeAwareWorldRenderer.js
wall/systems/presentation/altitudeAwareWorldRendererDebug.js
```

Optional if needed:

```text
wall/render/altitudeWorldOverlayRenderer.js
```

Use the smallest architecture that creates visible results.

---

# Authority Boundaries

## Owns

- altitude-derived presentation profile
- altitude band classification
- world layer opacity recommendations
- haze / tint / contrast overlay parameters
- infrastructure emphasis parameters
- debug visibility and tuning commands

## Reads From

- `SBE.AircraftRuntime.getActiveAircraft()`
- `SBE.MapboxViewportRuntime.getCamera()`
- `SBE.AirspaceInfluenceField.getActiveSamples()`
- optional `SBE.Maritime25DContext.getState()`

## May Mutate

- its own renderer state
- its own canvas pixels
- optional Mapbox paint opacity only through reversible debug/presentation application

## Must Not Mutate

- aircraft entity truth
- AIS vessel truth
- camera authority, except explicit debug test calls
- Mapbox style URL
- Mapbox layer definitions permanently
- atmosphere baseline state
- maritime lifecycle or continuity state

---

# Altitude Bands

Altitude should resolve from the lead aircraft, followed aircraft, or highest active aircraft.

```js
type AltitudeBand =
  | 'ground'
  | 'low_climb'
  | 'mid_climb'
  | 'high_cruise'
  | 'descent';
```

## Band Rules

```js
function resolveAltitudeBand(aircraft) {
  if (!aircraft) return 'ground';
  const scalar = aircraft.altitudeScalar || 0;
  const state = aircraft.lifecycleState;

  if (state === 'DESCENT' || state === 'LANDING') return 'descent';
  if (scalar < 0.08) return 'ground';
  if (scalar < 0.35) return 'low_climb';
  if (scalar < 0.70) return 'mid_climb';
  return 'high_cruise';
}
```

---

# Presentation Profile

Each altitude band returns a profile.

```js
type AltitudeWorldProfile = {
  altitudeBand: string,
  altitudeScalar: number,
  detailFocus: number,
  infrastructureFocus: number,
  aerialHaze: number,
  buildingOpacity: number,
  buildingContrast: number,
  maritimeOpacity: number,
  routeTraceOpacity: number,
  influenceFieldOpacity: number,
  worldTint: {
    enabled: boolean,
    r: number,
    g: number,
    b: number,
    alpha: number
  },
  horizonLift: number
};
```

## Required Profile Behavior

| Band | Visible Behavior |
|---|---|
| `ground` | Terminals, runways, buildings, shadows, aircraft traces are strongest. |
| `low_climb` | Airport remains readable; route trace and influence field are visible. |
| `mid_climb` | Street detail softens; water, coastline, bridges, district shapes gain priority. |
| `high_cruise` | Buildings and vessels reduce; airspace field, haze, routes, and large geography dominate. |
| `descent` | Ground detail gradually returns; airport / shoreline context strengthens. |

---

# Visual Requirements

## 1. Altitude World Tint

Aircraft influence should color the world around it, but the altitude-aware renderer should provide the global world response.

At low altitude:

```text
small, localized tint
```

At mid altitude:

```text
larger soft aerial wash
```

At high altitude:

```text
broad subtle atmosphere layer
```

The tint must be visible but not destructive. It should never flatten Mapbox Studio style back into a generic overlay.

---

## 2. Building Response

Buildings are currently a major visual win. They must become altitude-aware.

Required behavior:

- ground / low climb: buildings visible, bright, strong local context
- mid climb: buildings slightly faded, skyline still legible
- high cruise: buildings fade into city mass, no toy-city over-detail
- descent: buildings return gradually

Implementation options:

- adjust Mapbox building layer opacity if layer IDs are known
- otherwise draw an overlay haze that visually softens building brightness
- do not permanently alter style source

---

## 3. Maritime Response

As aircraft climb, maritime should become a quieter lower-world signal.

Required behavior:

- ground / low climb: boats and harbor remain visible if near camera
- mid climb: boats fade slightly; harbor shape remains important
- high cruise: boats become tiny infrastructure marks
- descent: maritime returns if camera approaches harbor / water

Do not add wake work.

---

## 4. Infrastructure Emphasis

At altitude, large infrastructure should become more important than street detail.

Emphasize:

- airports
- runways
- major water bodies
- bridges
- highways
- rail corridors
- harbor terminals
- aircraft route traces

Do not add new transit simulation in this pass.

---

## 5. Camera-Compatible Overlay

Renderer must support both:

```text
single-view flight camera
```

and future:

```text
grid-view / compositor comparison
```

The system should expose a profile that other renderers can read rather than hiding all behavior inside a canvas draw loop.

---

# Core Functions

```js
function getLeadAircraft() {}
function resolveAltitudeWorldProfile(aircraft, camera) {}
function applyAltitudeWorldProfile(profile) {}
function renderAltitudeWorldOverlay(ctx, profile) {}
function setEnabled(enabled) {}
function setMode(mode) {}
function getState() {}
```

## Mode Values

```js
'auto'      // live aircraft-driven profile
'ground'    // force ground profile
'low'       // force low climb profile
'mid'       // force mid climb profile
'high'      // force high cruise profile
'descent'   // force descent profile
```

---

# Debug API

Bind after `main.js`:

```js
_wos.debug.altitudeWorld.profile()
_wos.debug.altitudeWorld.mode('auto')
_wos.debug.altitudeWorld.mode('high')
_wos.debug.altitudeWorld.enabled(true)
_wos.debug.altitudeWorld.overlay(true)
_wos.debug.altitudeWorld.audit()
```

## Required Debug Output

`profile()` must print:

- lead aircraft ID / callsign
- lifecycle state
- altitude feet
- altitude scalar
- resolved altitude band
- building opacity
- maritime opacity
- aerial haze
- influence field opacity
- world tint alpha

`audit()` must report:

- AircraftRuntime loaded
- AircraftRenderer loaded
- AirspaceInfluenceField loaded
- AltitudeAwareWorldRenderer loaded
- active aircraft count
- selected lead aircraft
- current profile
- enabled state
- forced mode state

---

# Integration Points

## index.html

Load before `main.js`:

```html
<script src="./systems/presentation/altitudeAwareWorldRenderer.js"></script>
```

Load after `main.js`:

```html
<script src="./systems/presentation/altitudeAwareWorldRendererDebug.js"></script>
```

Recommended placement:

```text
after aircraftRenderer.js
before marineRenderer.js or main.js
```

Debug companion should load with the other post-main debug companions.

---

# Execution Flow

```text
AircraftRuntime updates aircraft entity
→ AirspaceInfluenceField receives aircraft influence sample
→ AltitudeAwareWorldRenderer resolves lead aircraft
→ AltitudeAwareWorldRenderer resolves altitude band/profile
→ profile informs overlay/tint/haze/world emphasis
→ AircraftRenderer and other renderers remain passive readers
```

---

# First Visible Implementation

Build the visible minimum first:

1. `AltitudeAwareWorldRenderer` resolves profile from active aircraft.
2. It draws a canvas overlay with altitude-based tint/haze.
3. It exposes debug commands to force altitude bands.
4. It optionally adjusts aircraft influence opacity through a multiplier.
5. It logs the active profile every time mode changes.

Do not overbuild layer mutation yet.

---

# Validation Checklist

- [ ] `_wos.debug.altitudeWorld.audit()` works.
- [ ] `_wos.debug.altitudeWorld.mode('ground')` visibly differs from `mode('high')`.
- [ ] High altitude view reduces ground detail dominance.
- [ ] Low altitude view preserves airport/building readability.
- [ ] Aircraft influence field remains visible but controlled.
- [ ] No AIS truth mutation.
- [ ] No aircraft truth mutation.
- [ ] No Mapbox style URL replacement.
- [ ] No wake / WaterMemory regression.
- [ ] System can be disabled instantly.

---

# Success Condition

The following commands must produce visible differences without reload:

```js
_wos.debug.altitudeWorld.mode('ground')
_wos.debug.altitudeWorld.mode('mid')
_wos.debug.altitudeWorld.mode('high')
```

Expected read:

```text
ground → airport/building detail strong
mid    → infrastructure geography emphasized
high   → aerial haze/tint dominates, local detail quiets
```

---

# Non-Goals

This spec does not implement:

- live ADS-B
- real airport routing
- clouds
- weather fronts
- train systems
- new Mapbox styles
- aircraft collision
- gameplay missions
- scoring
- full 3D flight camera physics

---

# Deferred Systems

- `0528C_WOS_CloudAtmosphereLayer_v1.0.0`
- `AirCorridorRuntime`
- `FlightPathScheduler`
- `AirportGroundTrafficRuntime`
- `TransitLayerRuntime`
- `WeatherFrontRuntime`

---

# Canonical References

- `0528A_WOS_AirflightRuntimeBootstrap_v1.0.0`
- `0527E_WOS_MapLayerCompositor_v1.0.0`
- `0527D_WOS_Maritime2_5DContextPass_v1.0.0`
- `WOS_Naming_Doctrine_v1.1.0`
- `WOS_SurfaceChannelDoctrine_v1.1.0`
- `README.md`

---

# Implementation Guide

- Put runtime code in `wall/systems/presentation/altitudeAwareWorldRenderer.js`; put debug binding in `wall/systems/presentation/altitudeAwareWorldRendererDebug.js`.
- Load core before `main.js`; load debug after `main.js`; expose `_wos.debug.altitudeWorld`.
- Run `_wos.debug.altitudeWorld.mode('ground')`, `mode('mid')`, and `mode('high')`; expect visibly different world tint, haze, and detail emphasis.
