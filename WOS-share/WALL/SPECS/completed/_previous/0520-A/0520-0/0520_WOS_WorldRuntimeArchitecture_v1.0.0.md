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
# 0520_WOS_WorldRuntimeArchitecture_v1.0.0

## Objective

WOS has transitioned beyond:

- canvas software
    
- artboard metaphors
    
- staged viewport rendering
    

The system is now fundamentally:

# a world runtime architecture

This spec formalizes:

- authoritative world ownership
    
- system hierarchy
    
- interaction routing
    
- runtime authority
    
- UI hierarchy
    
- visibility layers
    
- geographic substrate rules
    

The goal is to make WOS:

- stable
    
- understandable
    
- extensible
    
- spatially coherent
    
- creator-friendly
    

while preserving:

- geographic rendering
    
- behavioral layering
    
- audiovisual experimentation
    
- future ecology systems
    

---

# Core Principle

The user does NOT:

```text
open a canvas
```

The user:

# enters a world

This is now the foundational UX model.

---

# Canonical Runtime Hierarchy

```text
WORLD
 ├── ZONES
 ├── SYSTEM LAYERS
 ├── VISUALIZATION LAYERS
 ├── TOOL LAYER
 └── TELEMETRY LAYER
```

All systems must belong to ONE of these categories.

---

# 1. WORLD LAYER (AUTHORITATIVE ROOT)

## Responsibility

The World Layer owns:

- geography
    
- projection
    
- spatial coordinate systems
    
- global simulation space
    
- map substrate
    
- global time
    
- world identity
    

Examples:

- NYC
    
- Tokyo
    
- Corridor Zero
    
- Future fictional worlds
    

---

# Rules

The World Layer:

- is always active
    
- always exists
    
- is singular
    
- cannot be deleted accidentally
    
- owns geographic projection authority
    

---

# Mapbox Integration

Mapbox becomes:

# the authoritative world renderer

NOT:

- a background image
    
- an overlay texture
    
- a layer beneath a canvas
    

---

# Canonical World Runtime

Create:

```js
SBE.WorldRuntime
```

Responsibilities:

- world registration
    
- projection authority
    
- layer registration
    
- input routing
    
- visibility routing
    
- runtime synchronization
    

---

# 2. ZONE LAYER

## Purpose

Zones define:

- editable regions
    
- influence regions
    
- behavioral ownership regions
    
- simulation partitions
    

Zones are:

# polygonal world regions

NOT:

```text
rectangular artboards
```

---

# Zone Examples

- Bushwick
    
- Chinatown
    
- Williamsburg
    
- Arcade District
    
- Graffiti Corridor
    
- Transit Region
    

---

# Zone Rules

Zones:

- may overlap
    
- may blend
    
- may inherit behaviors
    
- may contain multiple layers
    
- may contain multiple systems
    

---

# Canonical Zone Model

```ts
interface Zone {
  id: string;
  name: string;

  polygon: GeoPolygon;

  visible: boolean;
  locked: boolean;

  systems: string[];
  metadata: Record<string, any>;
}
```

---

# 3. SYSTEM LAYERS

## Purpose

System Layers contain:

- behaviors
    
- motion
    
- audiovisual systems
    
- simulation logic
    

Examples:

- Routes
    
- Graffiti
    
- Traffic
    
- Audio
    
- Ecology
    
- Transit
    
- Motion
    
- Emitters
    
- Collision
    

---

# Important Rule

System Layers:

```text
operate INSIDE the world
```

They NEVER:

- own geography
    
- own projection
    
- own camera authority
    

---

# Canonical System Layer Model

```ts
interface SystemLayer {
  id: string;

  type:
    | "route"
    | "graffiti"
    | "audio"
    | "ecology"
    | "motion"
    | "traffic"
    | "overlay";

  visible: boolean;
  locked: boolean;

  zoneIds: string[];

  runtime: string;
}
```

---

# 4. VISUALIZATION LAYERS

## Purpose

Visualization layers interpret the world visually.

Examples:

- Glass overlays
    
- Night mode
    
- Heatmaps
    
- Traffic glow
    
- Audio visualization
    
- Harmonic fields
    
- Future AI interpretation overlays
    

---

# Important Rule

Visualization Layers:

- NEVER modify world state
    
- ONLY interpret world state visually
    

---

# 5. TOOL LAYER

## Purpose

Tools are:

# temporary interaction modes

NOT persistent world entities.

Examples:

- Select
    
- Mop
    
- Walker
    
- Route Edit
    
- Draw
    
- Zone Edit
    

---

# Canonical Interaction Modes

```js
interactionMode =
  "navigate"
  "select"
  "draw"
  "route-edit"
  "zone-edit"
```

Only ONE interaction mode active at a time.

---

# Important Clarification

This does NOT limit:

- systems
    
- layers
    
- overlays
    
- behaviors
    

It ONLY determines:

# input routing authority

---

# 6. TELEMETRY LAYER

## Purpose

Developer/debug information must become:

# a separate visibility channel

Examples:

- runtime info
    
- projection mode
    
- render passes
    
- debug labels
    
- FPS
    
- camera ownership
    
- system state
    

---

# Rules

Telemetry:

- toggleable
    
- color-coded
    
- visually separate
    
- NEVER baked into world rendering
    

---

# UI REQUIREMENTS

## New Canonical UI Structure

### TOP BAR

World controls + tool modes.

---

### LEFT SIDEBAR

World systems.

Sections:

```text
WORLD
ZONES
SYSTEMS
VISUALIZATION
```

---

### RIGHT SIDEBAR

Inspector/context controls.

---

### BOTTOM BAR

Status only.  
NOT debug spam.

Examples:

- active world
    
- active tool
    
- selected zone
    
- route count
    

---

# Surface Terminology Cleanup

"Surface" is currently overloaded.

New distinction:

|Term|Meaning|
|---|---|
|World|root substrate|
|Zone|editable region|
|Layer|behavioral/visual strata|
|Tool|interaction mode|
|Surface|media-bearing region|

---

# IMPORTANT UI GOAL

The app should feel like:

# entering a living world

NOT:

- opening Photoshop
    
- opening Figma
    
- opening a blank canvas
    

---

# Startup Experience

On boot:

- world already visible
    
- map already alive
    
- no rectangle stage
    
- no empty artboard
    
- no debug overlays by default
    

User enters:

# an already-running world

---

# Input Routing Rules

Input hierarchy:

```text
TOOL
 → SYSTEM
   → WORLD
```

Examples:

## Navigate Mode

Mapbox owns:

- pan
    
- zoom
    
- rotate
    

---

## Route Edit Mode

Route system owns:

- waypoint interaction
    
- segment editing
    

---

## Draw Mode

Overlay system owns:

- brush input
    
- graffiti
    
- motion strokes
    

---

# Canonical World Ownership Rules

|System|Owns|
|---|---|
|World|geography|
|Zone|region definition|
|Route|navigation|
|Graffiti|visual overlays|
|Ecology|simulation|
|Tool|input|
|Telemetry|debugging|

---

# Remove Remaining Legacy Concepts

Remove:

- staged rectangle assumptions
    
- centered viewport logic
    
- document metaphors
    
- artboard assumptions
    
- fake world compositing
    

---

# Future-Proofing

This architecture must support:

- ecology simulation
    
- AI interpretation layers
    
- traffic systems
    
- graffiti systems
    
- motion ecology
    
- route music systems
    
- multiplayer zones
    
- AR overlays
    
- future non-geographic substrates
    

---

# Acceptance Criteria

Successful implementation means:

- world runtime becomes authoritative
    
- systems stop conflicting
    
- tools stop hijacking input
    
- debug overlays separate cleanly
    
- UI hierarchy becomes understandable
    
- zones become meaningful
    
- layers become coherent
    
- startup feels stable
    
- world feels alive
    
- user understands where things live
    

---

# Expected Result

After implementation:  
WOS should feel like:

# a living spatial operating system

where:

- behaviors coexist coherently
    
- geography becomes the substrate
    
- systems layer naturally
    
- tools become lenses
    
- surfaces become meaningful spatial regions
    
- audiovisual interpretation becomes possible at world scale
    

---

# Implementation Guide

## 1. Build WorldRuntime

Centralize world ownership, projection authority, layer registration, and input routing.

## 2. Refactor UI Hierarchy

Separate World, Zones, Systems, Visualization, Tools, and Telemetry into coherent panels and visibility channels.

## 3. Stabilize Runtime Ownership

Ensure every system knows:

- where it lives
    
- what it owns
    
- how it renders
    
- how it receives input.
```

---
# Refinement 

---
# Development

```

```