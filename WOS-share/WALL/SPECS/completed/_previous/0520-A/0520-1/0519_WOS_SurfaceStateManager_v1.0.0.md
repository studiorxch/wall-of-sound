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
# 0519_WOS_SurfaceStateManager_v1.0.0

## Goal

Transform Surfaces from:

- visual tabs
- temporary UI state
- map bookmarks

into:

- persistent world channels
- independent environmental states
- revisitable destinations
- long-lived broadcast worlds

This system becomes the canonical runtime architecture for WOS world persistence.

---

# Core Philosophy

## OLD MODEL

```
Surface = temporary workspace
```

## NEW MODEL

```
Surface = living world state
```

A surface remembers:

- where it is
- what time it is
- what weather exists
- how the world looks
- how the world sounds
- what systems are active

Switching surfaces should feel like:

- changing channels
- tuning into worlds
- revisiting locations

NOT:

- opening tabs
- loading documents

---

# Canonical Runtime Structure

## SurfaceState

```
{  id: "surface_001",  name: "Tokyo Rain",  createdAt: 0,  updatedAt: 0,  camera: {    lng: 139.6917,    lat: 35.6895,    zoom: 13.5,    pitch: 42,    bearing: 18  },  environment: {    weather: "rain",    temperature: 58,    cloudiness: 0.82,    fogDensity: 0.36,    roadWetness: 0.71,    driftIntensity: 0.64,    timezone: "Asia/Tokyo",    localTime: 0  },  atmosphere: {    tintColor: [22, 28, 40],    ambientBrightness: 0.42,    cinematicLabel: "Rain Drift"  },  route: {    enabled: true,    origin: null,    destination: null,    progress: 0,    autopilot: false  },  render: {    styleId: "mapbox://styles/studiorich/night-mode",    overlays: {      atmosphere: true,      lighting: true,      geography: true,      traffic: false    }  },  audio: {    soundtrackProfile: "tokyo_rain",    volume: 0.82,    reactive: true  },  systems: {    ecology: false,    traffic: false,    actors: false,    broadcast: true  },  metadata: {    thumbnail: null,    color: "#4fc3f7",    tags: ["rain", "night", "urban"]  }}
```

---

# SurfaceStateManager

## New Canonical System

Create:

```
systems/world/surfaceStateManager.js
```

This becomes the authoritative surface runtime controller.

---

# Responsibilities

## MUST Handle

### Surface Creation

```
createSurface()
```

Creates:

- default world state
- unique id
- initialized environment
- camera snapshot

---

## Surface Switching

```
activateSurface(id)
```

Must:

- restore camera
- restore atmosphere
- restore weather
- restore map style
- restore render layers
- restore route state
- restore audio profile

---

## State Saving

```
captureActiveSurface()
```

Runs:

- on camera stop
- on weather change
- on route update
- on style switch
- on atmosphere update

---

## Surface Deletion

```
removeSurface(id)
```

Must:

- safely reassign active surface
- prevent orphan state
- preserve runtime integrity

---

# Persistence Model

## IMPORTANT

Surface state must exist independently from UI.

The sidebar is only a VIEW into runtime state.

DO NOT couple:

- DOM
- sidebar nodes
- UI ordering

to actual world persistence.

---

# Canonical Active Flow

## Switching Sequence

### 1. Save Current

```
captureActiveSurface()
```

---

### 2. Resolve New Surface

```
const next = getSurface(id)
```

---

### 3. Suspend Transitional Systems

Pause:

- camera interpolation
- route autopilot
- weather lerps
- audio fades

---

### 4. Restore World

Apply:

- map camera
- atmosphere
- lighting
- style
- telemetry
- route state

---

### 5. Resume Runtime

Restart:

- atmosphere compositor
- telemetry updates
- audio systems
- drift simulation

---

# Camera Persistence

## CRITICAL

Each surface MUST preserve:

```
lnglatzoompitchbearing
```

Without this:  
surface switching feels fake.

---

# Weather Persistence

## IMPORTANT

Weather is NOT global.

Each surface owns:

- its own atmosphere
- own time zone
- own lighting state
- own environmental profile

Example:

```
Tokyo Rain = rainy nightNYC Drift = foggy dawnBerlin Static = cold overcast
```

---

# Audio Persistence

## Future Critical Feature

Each surface may later contain:

- soundtrack profile
- radio stream
- playlist state
- generative audio state
- field recordings

Architecture must support this now.

---

# Route Persistence

## Each Surface Owns Routes

Example:

```
TOKYOroute through ShinjukuDESERT LOOPlong-form highway routeSUBWAY GRIDtransit route playback
```

Route systems must remain isolated per surface.

---

# Surface Identity

## Temporary Phase

Use:

```
metadata.colormetadata.tags
```

for sidebar rendering.

---

## Future Phase

Will support:

- thumbnails
- live previews
- procedural renders
- audio-reactive identities

Architecture should NOT block this.

---

# Events

## Emit

### On Create

```
surface:created
```

---

### On Switch

```
surface:activated
```

---

### On Save

```
surface:updated
```

---

### On Delete

```
surface:removed
```

---

# Transition System

## NOT IMPLEMENTED YET

But architecture must support:

- atmosphere fades
- audio crossfades
- cinematic travel
- camera glide
- world dissolve

DO NOT hardcode instant switching assumptions.

---

# UI Relationship

## Sidebar Is A View Layer

The sidebar:

- renders surfaces
- shows active state
- dispatches switch requests

It does NOT own:

- runtime state
- persistence
- world logic

---

# Initial Default Surface

On boot:

```
Surface 1
```

is auto-created if none exist.

---

# Runtime Storage

## Phase 1

In-memory only.

---

## Phase 2

Persist to:

- localStorage
- JSON snapshots
- future cloud sync

Architecture should separate:

- serialization
- runtime objects

---

# Serialization Helpers

## Add

```
serializeSurface()deserializeSurface()
```

Future-safe for:

- save files
- presets
- sharing
- broadcasting

---

# Future Direction

## Surfaces Become Channels

Long-term:

```
Surface = persistent broadcast world
```

Potential future systems:

- live listeners
- active ecology
- AI actors
- weather systems
- autonomous routes
- scheduled programming

This spec is foundational infrastructure for that evolution.

---

# Files To Create

## New

```
systems/world/surfaceStateManager.js
```

---

# Files To Modify

## workspaceUI.js

Replace:

- temporary surface switching
- tab assumptions

with:

- SurfaceStateManager integration

---

## main.js

Add:

- capture hooks
- restoration hooks
- runtime sync

---

## workspace.css

Support:

- active surface visual states
- sidebar identity nodes

---

# DO NOT

- tie surfaces to DOM tabs
- assume one active world forever
- hardcode global weather
- hardcode global camera
- rebuild state from UI
- mix render state with sidebar state

---

# Success Condition

Switching surfaces should feel like:

```
tuning into another living world
```

with:

- preserved location
- preserved atmosphere
- preserved identity
- preserved environmental state

not:

- reopening a document
- resetting a map
- changing tabs.
```

---
# Refinement 

---
# Development

```

```