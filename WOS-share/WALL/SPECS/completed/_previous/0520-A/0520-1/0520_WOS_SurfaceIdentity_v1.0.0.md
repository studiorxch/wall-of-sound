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
# 0520_WOS_SurfaceIdentity_v1.0.0

## Overview

Surface Identity formalizes each WOS surface as a persistent world destination rather than a disposable tab.

A surface is now treated as:

- a channel
- a world state
- a mood container
- a render profile
- a persistent audiovisual identity

The existing numbered surface rail already proves the interaction model works.  
This spec evolves that rail into a scalable identity system inspired by:

- Twitch channel rails
- OBS scenes
- surveillance feeds
- radio presets
- multiplayer worlds
- ambient destinations

The goal is not “workspace tabs.”

The goal is:

> persistent living worlds users can move between.

---

# Core Philosophy

## OLD MODEL

```
Tabs manage documents.
```

## NEW MODEL

```
Surfaces manage worlds.
```

A surface should feel like entering:

- another city
- another mood
- another broadcast
- another atmosphere
- another reality layer

---

# Primary UX Goals

## 1. World-First Navigation

The left rail becomes the primary navigation spine.

Not:

- floating tabs
- editor chrome
- desktop-window logic

Instead:

- stacked destinations
- channel switching
- world presets

---

## 2. Persistent Identity

Each surface remembers:

```
cameraweathertimestylerouterender profileaudio statesystemsmood
```

Surface switching should restore the exact environment state.

---

## 3. Minimal UI Footprint

The surface rail must remain visually lightweight.

DO NOT:

- create giant cards
- create dashboard panels
- create heavy labels
- add unnecessary controls

The world remains dominant.

---

# Surface Rail Layout

## Canonical Structure

```
◉ NIGHT DRIVE○ TOKYO SIGNAL○ FOG DISTRICT＋----------------WORLDZONESSYSTEMSVIZ
```

---

# Rail Structure

## Top Section → Surfaces

Dynamic list of active surfaces.

Each entry:

- icon/avatar
- active indicator
- optional live state
- optional color ring

---

## Middle Divider

Visual separation between:

- destinations
- global systems

---

## Lower Section → Global Views

Persistent system layers:

```
WORLDZONESSYSTEMSVIZ
```

These are NOT surfaces.

These are:

- overlays
- inspectors
- debug views
- orchestration systems

---

# Surface Item Design

## Current Phase (v1)

Minimal circular nodes.

### Active

```
◉
```

### Inactive

```
○
```

---

# Future Surface Visuals

## Supported Identity Types

### 1. Color Ring

Represents:

- mood
- weather
- genre
- environment class

Example:

```
blue = rainorange = heatgreen = ecologypurple = synth/night
```

---

## 2. Avatar Image

Optional future support:

```
surface.avatar
```

Can represent:

- AI host
- world mascot
- environment icon
- station branding

---

## 3. Activity State

Future live indicators:

```
● LIVE◉ ACTIVE◌ IDLE◍ RENDERING
```

---

# Surface Schema

## Canonical Structure

```
{  id: string,  name: string,  identity: {    color: string,    avatar: string | null,    mood: string,    visibility: "public" | "private",    live: boolean  },  camera: {    lng: number,    lat: number,    zoom: number,    pitch: number,    bearing: number  },  environment: {    timezone: string,    weather: string,    temperature: number,    timeOfDay: number  },  atmosphere: {    roadWetness: number,    driftIntensity: number,    lightingDensity: number  },  route: {    id: string | null  },  render: {    styleId: string,    palette: string,    mode: string  },  audio: {    profile: string,    volume: number  },  systems: {    world: boolean,    zones: boolean,    viz: boolean  },  metadata: {    createdAt: number,    updatedAt: number  }}
```

---

# Naming System

## Current

```
Surface 1Surface 2Surface 3
```

---

# Future Naming

Surface names become atmospheric identities.

Examples:

```
Night DriveTokyo SignalRain DistrictCold TransitSignal FadeAfter HoursGhost TrafficMetro BloomDesert Relay
```

DO NOT:

- auto-generate corporate names
- use technical labels
- expose internal IDs

Names should feel:

- cinematic
- musical
- environmental
- memorable

---

# Surface Switching

## Current Behavior

```
click surface→ capture current→ flyTo next→ restore world state
```

This remains canonical.

---

# Required Improvements

## Transition Smoothing

Switching surfaces must feel cinematic.

### Current

```
hard flyTo
```

### Future

```
fadedriftzoom dissolvesignal tuningfog blendorbital reposition
```

---

# Surface Creation

## Current

```
＋ button
```

Creates:

- new surface
- current camera snapshot
- inherited environment

---

# Future Creation Flow

## Auto-generated identity

New surfaces inherit:

```
weathertimestylerender profile
```

but randomize:

- accent color
- mood seed
- ambient profile

---

# Surface Types (Future)

## 1. Static Surface

Single persistent environment.

---

## 2. Route Surface

Bound to a travel path.

Examples:

```
Brooklyn → Cold SpringTokyo LoopParis Night Transit
```

---

## 3. Broadcast Surface

Autonomous 24/7 mode.

Persistent simulation.

---

## 4. Multiplayer Surface

Shared occupancy.

---

# Broadcast Logic

Long-term direction:

Each surface behaves like:

- a stream
- a station
- a radio frequency
- a persistent channel

Users move between worlds.

Not tabs.

---

# DO NOT

## DO NOT recreate desktop tab metaphors

Avoid:

- browser tabs
- file tabs
- IDE tab systems

---

## DO NOT overload the rail

No:

- giant labels
- nested menus
- heavy controls
- inspector duplication

---

## DO NOT prioritize editing over atmosphere

The world remains the hero.

UI exists to support immersion.

---

# Immediate Tasks

## Phase 1

### Rail Cleanup

- remove old surface topbar
- left rail becomes canonical
- floating overlays only

---

## Phase 2

### Identity Support

Add:

- color rings
- mood colors
- labels
- active indicators

---

## Phase 3

### Surface Metadata

Persist:

- environment
- render state
- weather
- route
- atmosphere

---

# Technical Notes

## Canonical Owner

```
SBE.SurfaceStateManager
```

remains the authoritative source.

UI only reflects state.

---

## No Duplicate Surface State

DO NOT:

- store UI-only copies
- mirror state into DOM
- create alternate registries

---

## Future Renderer Hooks

Surface identity should later influence:

```
map paletteatmosphereparticlestraffic densitymusic profilecamera behaviorworld typography
```

---

# Success Criteria

The system succeeds when:

```
switching surfaces feels like changing worlds,not switching tabs.
```

---

# Implementation Guide

- Update `workspaceUI.js` to make left rail the canonical surface navigator
- Remove remaining top surface/tab system entirely from layout flow
- Extend `SurfaceStateManager` with `identity` schema support and persistence
```

---
# Refinement 

---
# Development

```

```