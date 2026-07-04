---
Generated: 
System: WOS  
Domain:  
Component: 
Version: 1.0.0
Summary:
Description:
Tags:
Status:
---
# Discovery

---
# Spec
```
# 0519_WOS_ContextualToolHUD_WeatherTelemetry_v1.0.0.md

## Overview

This spec removes the persistent empty `SELECT` toolbar and replaces it with a contextual HUD architecture.

The current toolbar is visually occupying high-value screen space while providing no meaningful state, interaction, or environmental information. WOS has now evolved into a geographically-aware atmospheric system, meaning persistent UI should prioritize:

- world telemetry
- environmental state
- contextual editing tools
- cinematic readability

This spec introduces:

1. Contextual Tool HUDs
2. Persistent World Telemetry HUD
3. Removal of orphaned toolbar scaffolding
4. Cleaner environmental presentation hierarchy

---

# Goals

## Remove Dead UI

The current `SELECT` toolbar:

- has no properties
- has no contextual state
- duplicates interaction mode awareness
- visually fragments the map view

It should no longer persist globally.

---

## Introduce Contextual Toolbars

Toolbars should only appear when:

- drawing
- editing
- transforming
- route authoring
- manipulating objects

No active tool state = no toolbar.

---

## Introduce Persistent Environmental Telemetry

The world now contains:

- weather
- location
- local time
- atmosphere
- lighting
- environmental drift

This information should persist as lightweight cinematic telemetry.

---

# Architectural Direction

## UI Hierarchy

### Persistent

- Left navigation rail
- Right inspector panel
- Bottom transport bar
- World telemetry HUD

### Contextual

- Tool property bars
- Editing overlays
- Transform controls
- Route controls

---

# Part 1 — Remove SELECT Toolbar

---

## Remove Persistent SELECT Header

### Current

```
SELECT--------------------------------(empty toolbar strip)
```

### Remove

- SELECT title
- empty strip
- separator remnants
- spacing placeholders
- inactive toolbar wrappers

---

## Replace With Contextual Rendering

Toolbar container should only mount when:

```
tool.requiresToolbar === true
```

OR

```
interactionMode === "draw"interactionMode === "edit"interactionMode === "transform"interactionMode === "route-edit"
```

---

# Part 2 — Contextual Tool HUD System

---

## New Concept

```
Contextual Tool HUD
```

A toolbar that appears only when the current tool exposes editable properties.

---

## Examples

### Draw Tool

Show:

- brush width
- color
- opacity
- mode
- smoothing

---

### Route Tool

Show:

- route mode
- snapping
- stop insertion
- path type

---

### Transform Tool

Show:

- rotate
- scale
- duplicate
- snap controls

---

### Navigate Mode

Show nothing.

The map becomes visually dominant.

---

# Part 3 — World Telemetry HUD

---

## Purpose

Provide:

- location awareness
- environmental state
- atmospheric identity
- cinematic world presence

---

## Initial Placement

Upper-right corner.

Reasons:

- avoids left navigation conflict
- avoids transport collision
- preserves center composition
- reads like environmental telemetry

---

# Part 4 — Telemetry HUD Layout

---

## Initial Minimal Layout

### Example A

```
TOKYO, JP01:42 JSTRain Drift68°F
```

---

### Example B

```
BERLIN05:18 CETFog8°C
```

---

### Example C

```
CAIRO18:14 EETDust Haze
```

---

# Part 5 — Visual Style

---

## Design Language

Should feel like:

- tactical overlay
- aviation telemetry
- cinematic subtitle system
- environmental instrumentation

Should NOT feel like:

- weather app
- neon cyberpunk HUD
- gamer overlay
- dashboard widget clutter

---

## Typography

Recommended:

- uppercase location
- smaller secondary telemetry
- mono or semi-mono support
- restrained spacing
- subtle opacity

---

## Color Rules

### Day

- darker typography
- reduced opacity
- subtle background blur

### Night

- slightly brighter
- cool white
- soft atmospheric glow

---

# Part 6 — Telemetry Data Model

---

## Required Fields

```
{  locationName,  countryCode,  localTime,  timezone,  weatherType,  temperature,  humidity,  cloudiness,  driftIntensity}
```

---

## Source

Primary:

```
WorldAtmosphere
```

Secondary:

```
ViewportLocationAuthority
```

---

# Part 7 — Environmental Naming Layer

---

## Goal

Weather should become cinematic.

Instead of:

```
Rain
```

Prefer:

```
Rain Drift
```

Instead of:

```
Fog
```

Prefer:

```
Cold Fog
```

Instead of:

```
Cloudy
```

Prefer:

```
Overcast
```

---

## Suggested Mapping

|Raw Weather|Cinematic Label|
|---|---|
|rain|Rain Drift|
|storm|Storm Front|
|fog|Cold Fog|
|haze|Dust Haze|
|clouds|Overcast|
|clear-night|Clear Night|
|clear-day|Daylight|

---

# Part 8 — Future Expansion Hooks

---

## NOT Required In v1

Future telemetry may include:

```
Transit DensityTraffic FlowSignal ActivityPopulation HeatAudio ActivityDistrict MoodEnvironmental Pressure
```

---

## Important

Current implementation must remain:

- restrained
- readable
- low-noise
- cinematic

Avoid:

- excessive widgets
- graphs
- meters
- flashing indicators

---

# Part 9 — CSS Layering

---

## Z-Order

```
Mapbox Base↓Atmosphere Composite↓World Telemetry HUD↓Contextual Tool HUD↓Inspector Panels
```

---

## Telemetry HUD Pointer Rules

```
pointer-events: none;
```

HUD should never interfere with:

- map pan
- zoom
- selection

---

# Part 10 — Runtime Behavior

---

## Smooth Updates

Environmental changes should lerp:

- weather labels
- temperature
- atmosphere state
- lighting state

Avoid:

- hard flickers
- abrupt swaps

---

## Visibility Rules

### Show Telemetry When

```
isGeographicMode() === true
```

### Hide Telemetry When

- loading
- fullscreen cinematic playback (future)
- explicitly disabled

---

# Final Philosophy

WOS UI should evolve toward:

```
environmental instrumentation
```

NOT:

```
application chrome
```

The world itself is now the primary interface.

UI should support:

- atmosphere
- readability
- cinematic framing
- geographic immersion

NOT compete against them.

---

# Implementation Guide

- Remove persistent SELECT toolbar container and replace with conditional contextual HUD mounting
- Create `worldTelemetryHUD.js` powered by `WorldAtmosphere` + `ViewportLocationAuthority`
- Mount telemetry HUD upper-right with pointer-events disabled and atmospheric typography styling
```

---
# Refinement 

---
# Development

```

```