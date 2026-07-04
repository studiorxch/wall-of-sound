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
# 0518H_WOS_SurfaceCanonicalization_v1.0.0

**Date:** 2026-05-18  
**System:** WOS  
**Domain:** Workspace / Surface Architecture  
**Component:** Canonicalization + Terminology Stabilization  
**Version:** v1.0.0

---

# Purpose

WOS has successfully transitioned from a single-canvas experimental environment into a persistent multi-surface spatial runtime system.

This spec formalizes the canonical terminology, API naming, event grammar, UI language, and compatibility strategy before further expansion into:

- world-scale orchestration
- spatial scene graphs
- geographic streaming
- GIS ingestion
- persistent media infrastructure
- multi-user spatial editing

The goal is to stabilize:

- developer reasoning
- runtime ownership
- user-facing language
- future spec consistency

before additional architectural growth.

---

# Core Principle

## WOS Is NOT A Canvas App

WOS is now defined as:

> A spatial multi-surface runtime environment.

The map is not decorative background imagery.

The map is:

- geographic substrate
- scale authority
- spatial grounding layer
- coordinate truth system

Surfaces exist within that world.

---

# Canonical Terminology

## Primary Terminology

|Legacy|Canonical|
|---|---|
|Document|Surface|
|Canvas|Surface|
|Active Document|Active Surface|
|Document Registry|Surface Registry|
|Document Type|Surface Type|
|Canvas Runtime|Surface Runtime|
|Canvas Area|Surface Viewport|
|Artboard|Surface|
|Overlay Canvas|Overlay Surface|

---

# Terminology Rules

## "Surface" Rules

A surface is:

- a persistent spatial media container
- resolution-independent
- runtime-capable
- optionally geo-anchored
- exportable
- transformable
- composable

A surface is NOT:

- strictly a drawing canvas
- strictly a file
- strictly a visual layer

---

# Surface Identity Model

All surfaces inherit canonical identity metadata.

```
interface SurfaceIdentity {  type: string;  icon: string;  accent: string;  runtimeClass?: string;  capabilities?: {    geoAnchor?: boolean;    exportPNG?: boolean;    exportSVG?: boolean;    exportJSON?: boolean;    simulation?: boolean;    mediaPlayback?: boolean;    audioReactive?: boolean;    liveRuntime?: boolean;  };  projectionMode?: string;}
```

---

# Canonical Surface Types

## Official Types

|Type|Purpose|
|---|---|
|route|geographic route planning + mobility|
|world|simulation/ecology configuration|
|soundscape|audio/media orchestration|
|media|static/dynamic media placement|
|overlay|UI/cinematic overlays|
|simulation|runtime behavior systems|

---

# UI Naming Canonicalization

## Tab Behavior

Tabs represent:

- user-owned surfaces
- NOT content categories

The surface type is communicated through:

- icon
- accent color
- runtime
- inspector state

NOT through forced naming patterns.

---

# Default Naming Behavior

## Canonical Default Labels

|Old|New|
|---|---|
|Canvas 1|Surface 1|
|Route 1|Surface 2|
|World 1|Surface 3|

Optional user renaming remains fully supported.

---

# UI Language Updates

## Replace Legacy Language

### Replace:

```
New Document
```

### With:

```
New Surface
```

---

### Replace:

```
Save Document
```

### With:

```
Save Surface
```

---

### Replace:

```
Export Document
```

### With:

```
Export Surface
```

---

# Event Grammar Canonicalization

## Official Event Namespace Rules

### Surface Events

```
surface:createdsurface:openedsurface:closedsurface:renamedsurface:savedsurface:loadedsurface:deletedsurface:modifiedsurface:exportedsurface:imported
```

---

### Workspace Events

```
workspace:changedworkspace:surfacesChangedworkspace:loadedworkspace:modeChanged
```

---

### Runtime Events

```
runtime:registeredruntime:attachedruntime:detachedruntime:error
```

---

### Viewport Events

```
viewport:modeChangedviewport:cameraChangedviewport:projectionChanged
```

---

# API Canonicalization

## Canonical Public Workspace API

### Canonical

```
createSurface()openSurface()closeSurface()duplicateSurface()renameSurface()getActiveSurface()getAllSurfaces()getSurfaceById()
```

---

## Deprecated Compatibility Aliases

Allowed temporarily:

```
createDocument()openDocument()closeDocument()getAllDocuments()
```

These remain ONLY for transition compatibility.

---

# Legacy Alias Policy

Introduce:

```
SBE.LegacyAliases = {  enabled: true,  removalTarget: "0525",};
```

Purpose:

- prevent permanent compatibility entropy
- make migration explicit
- allow future automated cleanup

---

# Registry Canonicalization

## Rename Targets

|Current|Canonical|
|---|---|
|DocumentRegistry|SurfaceRegistry|
|documentRegistry.js|surfaceRegistry.js|
|routeDocument.js|routeSurface.js|
|canvasDocument.js|mediaSurface.js|

Migration may occur incrementally.

Public API should transition first.

---

# Comment + Header Cleanup

All architecture comments, headers, and specs must now reflect:

- surface terminology
- geographic substrate model
- runtime ownership model

---

# Surface Spatial Philosophy

## Canonical Hierarchy

|Layer|Responsibility|
|---|---|
|Geographic|reality|
|Surface|composition|
|Runtime|behavior|
|Viewport|operator interaction|
|Presentation|audience framing|

This hierarchy is now considered foundational WOS architecture.

---

# Non-Goals

This spec does NOT introduce:

- scene graphs
- visibility streaming
- multiplayer
- GIS ingestion
- AR runtime
- live synchronization

This is strictly a stabilization + canonicalization pass.

---

# Success Criteria

The system is considered canonicalized when:

- public APIs use surface terminology
- UI language uses surface terminology
- specs use surface terminology
- event namespaces are stable
- compatibility aliases are isolated
- comments reflect the current architecture
- future specs no longer reference "canvas app" concepts

---

# Future Direction

This stabilization enables:

- spatial scene graphs
- persistent urban media systems
- geolocated media infrastructure
- runtime surface orchestration
- field-recording anchors
- billboard/media placement
- train/wall surface systems
- world-scale streaming
- GIS interoperability

without terminology fragmentation.

---

# Implementation Guide

- Rename public-facing APIs and UI labels first
- Preserve temporary compatibility aliases behind `SBE.LegacyAliases`
- Update comments/specs/events before adding new spatial systems
```


---
# Refinement 

---
# Development

```

```