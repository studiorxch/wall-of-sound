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
![[Screenshot 2026-05-18 at 3.09.08 AM.png]]
---
# Spec
```
# 0518G_WOS_SurfaceSpatialModel_v1.0.0

**Generated:** 05/18/2026  
**System:** WOS  
**Domain:** Spatial Architecture  
**Component:** Surface Spatial Model  
**Version:** 1.0.0

---

# Purpose

Canonicalize the WOS spatial model around:

```
Surface
```

This spec formalizes:

- surface terminology
- spatial coordinate hierarchy
- geographic anchoring
- projection rules
- runtime attachment
- surface/world separation
- multi-surface coexistence

This is the transition from:

```
document-based editing
```

to:

```
persistent spatial media systems
```

---

# Core Principle

```
A Surface is a persistent spatial media space.
```

NOT:

- a document
- a canvas
- a tab
- a renderer
- a viewport

A Surface exists:

- independently of rendering
- independently of camera framing
- independently of operator tools
- independently of presentation mode

---

# Official Terminology

## Canonical User-Facing Terms

|Official Term|Meaning|
|---|---|
|Surface|persistent editable spatial media space|
|Workspace|orchestration environment|
|Layer|composited visual/media layer|
|Runtime|behavior/simulation engine attached to a surface|
|Map Layer|geographic substrate|
|Operator View|editing/control mode|
|Presentation View|cinematic audience-facing mode|

---

# Deprecated Terminology

The following terms are deprecated:

|Deprecated|Replacement|
|---|---|
|Document|Surface|
|Canvas|Surface|
|docs|surfaces|
|activeDocument|activeSurface|
|documentId|surfaceId|
|document:opened|surface:opened|
|closeDocument()|closeSurface()|
|duplicateDocument()|duplicateSurface()|

---

# Required Refactor Pass

All new systems MUST use:

```
surface
```

NOT:

```
document
```

Legacy compatibility aliases may temporarily remain internally.

---

# Surface Definition

## Canonical Structure

```
interface Surface {  id: string;  name: string;  type: SurfaceType;  runtime: string;  anchor: SurfaceAnchor;  transform: SurfaceTransform;  metadata: SurfaceMetadata;  layers: SurfaceLayer[];  runtimeState: Record<string, any>;  createdAt: string;  updatedAt: string;}
```

---

# Surface Types

## Initial Types

```
type SurfaceType =  | "route"  | "world"  | "soundscape"  | "media"  | "overlay"  | "simulation";
```

These are:

```
organizational runtime categories
```

NOT branding terms.

---

# Surface Coordinate Hierarchy

Critical architecture.

WOS now standardizes five coordinate domains.

---

# 1. Geographic Space

```
Real-world coordinates
```

Format:

```
longitudelatitudealtitude?
```

Purpose:

- map anchoring
- world positioning
- GIS interoperability
- route persistence
- real-world attachment

---

# 2. Surface Space

```
Local normalized media coordinates
```

Canonical rule:

```
0 → 1 normalized coordinate space
```

Meaning:

```
independent of resolution
```

Examples:

```
(0,0)top-left(1,1)bottom-right
```

Purpose:

- reusable media layouts
- scalable compositions
- projection independence
- export portability

---

# 3. Runtime Space

```
Simulation coordinate space
```

Purpose:

- actor movement
- ecology
- collision
- camera targets
- procedural systems

May diverge from:

```
surface layout space
```

---

# 4. Viewport Space

```
Screen-space coordinates
```

Purpose:

- UI
- overlays
- interaction
- HUD rendering

Never persisted.

---

# 5. Presentation Space

```
Cinematic interpretation layer
```

Purpose:

- framing
- camera language
- broadcast composition
- audience presentation

Presentation Space may:

- crop
- scale
- stylize
- reinterpret

without changing:

```
surface truth
```

---

# Surface Anchoring

Every surface MUST define:

```
surface.anchor
```

---

# SurfaceAnchor

```
interface SurfaceAnchor {  type:    | "geo"    | "route"    | "entity"    | "screen"    | "free";  referenceId?: string;  coordinates?: {    longitude: number;    latitude: number;    altitude?: number;  };  rotation?: number;  scale?: number;}
```

---

# Anchor Types

|Type|Meaning|
|---|---|
|geo|fixed real-world location|
|route|attached to route geometry|
|entity|attached to moving runtime entity|
|screen|viewport-fixed|
|free|detached floating surface|

---

# Surface Transform

```
interface SurfaceTransform {  x: number;  y: number;  width: number;  height: number;  rotation: number;  scaleX: number;  scaleY: number;}
```

This exists:

```
inside surface space
```

NOT geographic space.

---

# Surface Projection Model

Critical future-proofing layer.

---

# Projection Modes

```
type SurfaceProjection =  | "flat"  | "geo"  | "route-follow"  | "curved"  | "billboard"  | "screen";
```

---

# Definitions

|Projection|Meaning|
|---|---|
|flat|simple planar media|
|geo|map-aligned projection|
|route-follow|conforms to route geometry|
|curved|wraps curved surfaces|
|billboard|camera-facing projection|
|screen|viewport overlay|

---

# Important Constraint

Projection:

```
does NOT change surface truth
```

Projection only changes:

```
presentation interpretation
```

---

# Surface vs Map

Critical conceptual separation.

---

# Map Definition

```
The map is a geographic substrate layer.
```

The map:

- is not a surface
- is not a document
- is not runtime state

The map provides:

- orientation
- grounding
- scale
- geographic context

---

# Surface Definition

```
A Surface is attached media existing within or above geographic space.
```

Examples:

- billboard
- subway car
- graffiti wall
- route overlay
- passenger HUD
- projection mapping
- digital signage

---

# Multi-Surface World Model

The world MUST support:

```
multiple overlapping surfaces
```

NOT:

```
single isolated artboards
```

Surfaces may:

- coexist
- overlap
- share geography
- attach to entities
- attach to routes
- stream dynamically

---

# Runtime Attachment

Surface ownership is runtime-driven.

Example:

```
surface.runtime = "routePlanner"
```

Runtime owns:

- behavior
- simulation
- interaction
- runtimeState interpretation

Workspace does NOT understand runtime internals.

---

# Camera Relationship

Camera systems operate:

```
outside surface truth
```

Meaning:

- camera may reinterpret
- camera may crop
- camera may stylize

without modifying:

```
persistent surface data
```

---

# Surface Scale Standardization

Critical future requirement.

---

# Canonical Scale Rule

Surface Space MUST remain:

```
resolution-independent
```

Real-world scaling happens through:

```
surface.anchor.scale
```

NOT:

```
pixel dimensions
```

---

# Real-World Scaling Examples

|Surface|Example Scale|
|---|---|
|Sticker|8cm × 8cm|
|Poster|11in × 17in|
|Billboard|14m × 48m|
|Subway Car|18m × 3m|
|LED Screen|custom|
|Projection|environment-derived|

---

# Future Compatibility Goals

This architecture prepares:

- AR overlays
- GIS integration
- moving surfaces
- projection mapping
- collaborative worlds
- streaming surfaces
- geographic media archives
- public installations
- field recording systems
- dynamic signage
- transit augmentation

without changing:

```
core surface structure
```

---

# Required UI Refactor

UI MUST now display:

```
surfaces
```

NOT:

```
docs
```

Example:

Replace:

```
docs 8
```

with:

```
surfaces 8
```

---

# Event Bus Refactor

Canonical event names now use:

```
surface:
```

namespace.

Examples:

```
surface:openedsurface:closedsurface:renamedsurface:savedsurface:loadedsurface:duplicated
```

---

# Visual Identity Observation

The centered presentation surface floating above geographic context is now considered:

```
intentional WOS visual language
```

This relationship between:

- focused media surface
- surrounding geographic world

is officially recognized as part of:

```
WOS presentation identity
```

---

# Constraints

## DO NOT:

- introduce 3D engines yet
- introduce GIS imports yet
- introduce multiplayer yet
- introduce entity attachment systems yet
- introduce projection warping yet

---

## DO:

- stabilize terminology
- stabilize coordinate systems
- stabilize anchoring rules
- stabilize persistence structure
- stabilize runtime ownership

---

# Acceptance Criteria

By end of implementation:

## System Must:

- use Surface terminology canonically
- support stable coordinate hierarchy
- support anchored geographic surfaces
- separate map vs surface responsibilities
- support future projection modes
- preserve runtime ownership cleanly

---

## UI Must:

- display “surfaces”
- remove “docs”
- maintain Workspace terminology
- preserve OP / VIEW behavior

---

# Final Principle

```
The map is the world.The surface is the media.The runtime brings it to life.
```

---

# Implementation Guide

### 1. Canonicalize Terminology

Refactor:

```
document → surface
```

throughout:

- UI
- events
- workspace APIs

---

### 2. Add Surface Spatial Structures

Implement:

```
SurfaceAnchorSurfaceTransformSurfaceProjection
```

---

### 3. Stabilize Coordinate Hierarchy

Enforce separation between:

```
geographicsurfaceruntimeviewportpresentation
```

spaces before adding more simulation systems.
```

---
# Refinement 

---
# Development

```

```