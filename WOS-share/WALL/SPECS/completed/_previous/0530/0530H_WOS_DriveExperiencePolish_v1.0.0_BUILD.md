[BUILD]

# 0530H_WOS_DriveExperiencePolish_v1.0.0

## Purpose

Polish the current WOS drive prototype now that Tier 1 has proven the core experience:

- road-aware hero car routing works
- camera follow works
- jitter is fixed
- low-altitude city traversal is visually compelling

This pass focuses on protecting the experience, not expanding scope.

## Build Goal

Make Drive mode feel less like a prototype marker on a map and more like a cinematic world traversal system.

Primary targets:

1. correct the hero car visual depth
2. add simple drive camera presets
3. reduce HUD intrusion
4. preserve all Tier 1 stability

Do not build traffic, walking, transit, minimap, weather/clouds, or advertising systems in this pass.

---

# Assumptions

- Existing Drive mode already launches through `TraversalControlDeck`.
- `HeroVehicleRuntime` v1.1.0 already uses RAF smoothing and `map.jumpTo()` camera follow.
- `HeroVehicleRenderer` currently renders the car as an SVG marker.
- `TraversalHUD` already detects HeroVehicleRuntime before flight.
- Navigation arrows and locality are known unresolved Tier 1 follow-ups, but are not the focus of this pass.

---

# Non-Negotiables

## Do Not Regress Tier 1

Do not change:

- route interpolation
- RAF smoothing
- `jumpTo()` camera follow
- speed stepping
- altitude stepping
- destination resolver
- flight runtime
- cloud runtime
- maritime runtime

If a change touches `heroVehicleRuntime.js`, it must only add camera preset support and must not alter the smoothing pipeline.

## No New UI Garbage

Do not add large panels, advanced drawers, hidden debug trays, or unused buttons.

UI should remain minimal:

```text
Transport | Speed | Alt | Camera | Launch
```

Camera controls must be compact.

---

# Part 1 — Hero Car Visual Correction

## Problem

The current car reads as a toy standing upright because:

- body is too tall vertically
- shadow feels like a floating/drop shadow
- highlight/capsule shape creates vertical object depth
- marker looks detached from the road surface

## Required Change

Update `heroVehicleRenderer.js` so the hero car reads as a flat, top-down, road-surface vehicle token.

## Visual Requirements

The car must:

- be flatter and wider
- have reduced height-to-width exaggeration
- use a subtle contact shadow, not a floating oval shadow
- keep a clear heading/nose cue
- remain readable at Drone, Low Drone, Urban, Rooftop, and Ground altitude settings
- stay visually glued to the road

## Suggested SVG Direction

Replace the current upright capsule with:

```text
flat rounded rectangle chassis
small windshield/roof panel as top-surface detail
small yellow nose cue
very subtle underbody contact shadow
no large oval drop shadow
```

## Scale Rules

Add scale awareness based on current map zoom:

```text
zoom >= 17.0  → full size
zoom 15–17    → medium size
zoom < 15     → small size
```

Do not make the car huge at high overview altitudes.

## Debug

Add:

```js
_wos.debug.heroVehicle.visual()
```

Returns:

```js
{
  active: true,
  markerScale: 0.82,
  zoom: 16.5,
  visualMode: 'flat-token',
  shadowMode: 'contact'
}
```

---

# Part 2 — Drive Camera Presets

## Purpose

Drive mode needs camera grammar. The car is the actor; the camera is the cinematic observer.

## Add Presets

Add compact camera presets for Drive mode:

```text
Follow
Lead
Side
High
Hide Actor
```

## Preset Behavior

### Follow

Default.

```text
camera behind car
bearing follows vehicle heading
actor visible near lower/middle frame
```

### Lead

```text
camera ahead of car looking back/down route
actor visible approaching camera
```

### Side

```text
camera offset left/right of car
useful for road-grid and building pattern shots
```

Left/right can be automatic for this pass. Do not add side-left and side-right buttons yet.

### High

```text
higher overview framing
actor smaller
route/city pattern emphasized
```

This should respect the selected altitude step but bias toward wider composition.

### Hide Actor

```text
camera follows the route/actor position
car marker hidden
world motion remains
```

This formalizes the “putty on screen” discovery: sometimes the actor should anchor motion without being visible.

## UI Requirement

Add one compact camera selector only when Drive is active:

```text
CAM Follow ▾
```

Do not add a new panel.

## Runtime Requirement

Camera preset must be changeable live without restarting the trip.

Add:

```js
SBE.HeroVehicleRuntime.setCameraPreset(name)
SBE.HeroVehicleRuntime.getCameraPreset()
```

Valid names:

```js
'follow'
'lead'
'side'
'high'
'hide_actor'
```

## Debug

Add:

```js
_wos.debug.heroVehicle.cameraPreset('lead')
_wos.debug.heroVehicle.camera()
```

`camera()` should include:

```js
{
  cameraPreset: 'lead',
  actorVisible: true,
  followDistanceM: 35,
  lateralOffsetM: 0,
  zoom: 16.5,
  pitch: 35
}
```

---

# Part 3 — HUD De-Intrusion

## Problem

Drive mode is becoming watchable as ambient cinema. HUD elements should support the scene, not dominate it.

## Required Change

Create a minimal display mode for Drive.

## Display Modes

```text
cinematic — default
full      — debug/telemetry
hidden    — no HUD except core WOS clock/weather if already present
```

## Cinematic Mode

Show only:

```text
location
local time
weather summary
transport: Drive
speed multiplier
camera preset
```

Do not show large telemetry blocks by default.

## Full Mode

Keep existing diagnostic rows:

```text
route source
progress
distance
speed
camera
actor
```

## Controls

Add console toggles only for this pass:

```js
_wos.debug.hud.mode('cinematic')
_wos.debug.hud.mode('full')
_wos.debug.hud.mode('hidden')
```

No new visible HUD button yet.

---

# Part 4 — Guardrails

## Car Visual Guardrails

The car must not:

- look like it is standing upright
- float above the road
- cast a large detached shadow
- rotate in screen-space instead of map-space
- obscure too much road detail

## Camera Guardrails

Camera preset changes must not:

- restart the route
- reset the origin
- reset progress
- break speed changes
- fight Mapbox camera with queued `easeTo()` calls

Use `jumpTo()` for continuous follow camera unless explicitly throttling a non-follow transition.

## HUD Guardrails

HUD changes must not:

- remove weather/location entirely
- block the scene
- create new large UI surfaces
- depend on hidden advanced controls

---

# Acceptance Tests

## Test 1 — Car Visual

Launch Drive from current location to Boston at Drone altitude.

Expected:

```text
car appears flat and road-attached
no large oval shadow
heading still readable
```

## Test 2 — Camera Presets Live

While Drive is active, run:

```js
_wos.debug.heroVehicle.cameraPreset('lead')
_wos.debug.heroVehicle.cameraPreset('side')
_wos.debug.heroVehicle.cameraPreset('high')
_wos.debug.heroVehicle.cameraPreset('follow')
```

Expected:

```text
camera changes without restarting route
progress continues
speed remains unchanged
car remains smooth
```

## Test 3 — Hide Actor

Run:

```js
_wos.debug.heroVehicle.cameraPreset('hide_actor')
```

Expected:

```text
car marker disappears
camera continues following route motion
world motion remains smooth
```

## Test 4 — HUD Modes

Run:

```js
_wos.debug.hud.mode('cinematic')
_wos.debug.hud.mode('full')
_wos.debug.hud.mode('hidden')
```

Expected:

```text
cinematic mode is compact
full mode restores diagnostics
hidden mode removes nonessential telemetry
```

## Test 5 — No Tier 1 Regression

During all tests:

```text
no car jitter returns
speed stepper still works live
altitude stepper still works live
camera does not queue ease animations
route does not restart unless Launch is pressed
```

---

# Files To Modify

## Required

```text
wall/systems/render/heroVehicleRenderer.js
wall/systems/world/heroVehicleRuntime.js
wall/systems/presentation/heroVehicleDebug.js
wall/systems/presentation/traversalHUD.js
wall/systems/presentation/traversalControlDeck.js
```

## Optional

```text
wall/index.html
wall/styles.css
```

Only touch optional files if needed for the compact `CAM` selector or HUD presentation mode styling.

---

# Out of Scope

Do not build:

```text
traffic
walking
bike routing
transit
clouds
minimap
weather upgrades
graffiti
advertising
AI camera curiosity
```

Those come after Drive mode feels visually stable and cinematic.

---

# Implementation Guide

- **Where**: Update `heroVehicleRenderer.js` for flat car token; `heroVehicleRuntime.js` for camera presets; `heroVehicleDebug.js` for debug commands; `traversalHUD.js` for HUD modes; `traversalControlDeck.js` only for compact Drive camera selector.
- **What**: Run the local WOS wall app, launch Drive mode, test `Follow`, `Lead`, `Side`, `High`, and `Hide Actor` without restarting the route.
- **Expect**: Smooth road-aware drive continues; car reads as flat/road-attached; HUD becomes less intrusive; camera presets change live with no route reset or jitter regression.
