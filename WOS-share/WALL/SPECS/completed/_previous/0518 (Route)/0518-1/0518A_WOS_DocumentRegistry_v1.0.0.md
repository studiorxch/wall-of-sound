# 0518A_WOS_DocumentRegistry_v1.0.0

**Generated:** 05/18/2026  
**System:** WOS  
**Domain:** Workspace Architecture  
**Component:** Document Registry  
**Version:** 1.0.0

---

# Purpose

Formalize a centralized registry system for all WOS document types.

This prevents:

- scattered document logic
- hardcoded UI branching
- renderer coupling
- runtime coupling
- future document-type chaos

The registry becomes the canonical source for:

- document metadata
- runtime bindings
- renderer bindings
- inspector bindings
- lifecycle factories
- capability flags

---

# Core Principle

```
Document Type≠Renderer≠Runtime≠UI
```

All relationships must be resolved through registries.

Never hardcode:

```
if (doc.type === "route")
```

outside registry initialization.

---

# Goals

## Immediate Goals

Support:

- route
- canvas
- soundscape
- world

through a unified registration pipeline.

---

## Long-Term Goals

Enable:

- plugin-style document types
- detachable runtimes
- alternate renderers
- headless simulation
- multiplayer worlds
- broadcast-only documents
- mobile/passenger views
- server-side rendering

---

# Registry Architecture

```
DocumentRegistry    ↓DocumentDescriptor    ↓RuntimeRegistryRendererRegistryInspectorRegistryPanelRegistry
```

---

# File Structure

```
engine/    documentRegistry.jsregistries/    runtimeRegistry.js    rendererRegistry.js    inspectorRegistry.js    panelRegistry.jsdocuments/    routeDocument.js    canvasDocument.js    soundscapeDocument.js    worldDocument.js
```

---

# Document Descriptor

Every document type must register a descriptor.

---

# Descriptor Schema

```
{    type: "route",    label: "Route",    icon: "route",    accent: "#4a9eff",    createDocument,    createRuntime,    renderer,    inspector,    capabilities: {        simulation: true,        drawing: false,        audio: true,        timeline: true,        geography: true,        export: true    },    panels: {        lower: "routeLowerPanel",        sidebar: "routeSidebar",        inspector: "routeInspector"    }}
```

---

# Rules

## Rule 1 — No Anonymous Types

Every document type must:

- register explicitly
- expose metadata
- expose capabilities

No implicit documents.

---

## Rule 2 — Runtime Separation

Documents do NOT own runtimes directly.

Instead:

```
Document    → RuntimeManager        → Runtime Instance
```

This preserves:

- runtime swapping
- suspension
- background simulation
- remote execution

---

## Rule 3 — Renderer Separation

Renderer logic must not live inside documents.

Bad:

```
doc.render()
```

Correct:

```
renderer.render(doc, ctx)
```

---

## Rule 4 — Capability Driven UI

UI must resolve behavior from:

```
descriptor.capabilities
```

NOT:

```
doc.type
```

Example:

```
if (descriptor.capabilities.timeline)
```

instead of:

```
if (doc.type === "soundscape")
```

---

# Core Registry API

---

# engine/documentRegistry.js

```
(function (global) {    const SBE = (global.SBE = global.SBE || {});    const registry = new Map();    function register(descriptor) {        if (!descriptor?.type) {            throw new Error("Document descriptor missing type");        }        if (registry.has(descriptor.type)) {            throw new Error(                `Document type already registered: ${descriptor.type}`            );        }        registry.set(descriptor.type, descriptor);    }    function get(type) {        return registry.get(type) || null;    }    function has(type) {        return registry.has(type);    }    function list() {        return Array.from(registry.values());    }    function create(type, options = {}) {        const descriptor = get(type);        if (!descriptor) {            throw new Error(                `Unknown document type: ${type}`            );        }        if (typeof descriptor.createDocument !== "function") {            throw new Error(                `Document type missing createDocument(): ${type}`            );        }        return descriptor.createDocument(options);    }    SBE.DocumentRegistry = {        register,        get,        has,        list,        create    };})(window);
```

---

# Runtime Registry

```
SBE.RuntimeRegistry.register({    id: "routeWorld",    create: () => new RouteWorldRuntime()});
```

---

# Renderer Registry

```
SBE.RendererRegistry.register({    id: "routeRenderer",    render(doc, ctx) {}});
```

---

# Inspector Registry

```
SBE.InspectorRegistry.register({    id: "routeInspector",    build(container, doc) {}});
```

---

# Panel Registry

```
SBE.PanelRegistry.register({    id: "routeLowerPanel",    render(container, doc) {}});
```

---

# Built-In Document Types

---

# Route Document

```
{    type: "route",    label: "Route",    accent: "#4a9eff"}
```

Purpose:

- geography
- trip planning
- route simulation
- corridor playback

---

# Canvas Document

```
{    type: "canvas",    label: "Canvas",    accent: "#a78bfa"}
```

Purpose:

- freeform drawing
- vector systems
- motion experiments
- layout staging

---

# Soundscape Document

```
{    type: "soundscape",    label: "Soundscape",    accent: "#34d399"}
```

Purpose:

- ambient systems
- layered audio logic
- timeline arrangement
- environmental sound

---

# World Document

```
{    type: "world",    label: "World",    accent: "#fb923c"}
```

Purpose:

- high-level orchestration
- simulation grouping
- scheduling
- broadcast logic

---

# Workspace Integration

Workspace must resolve all metadata through:

```
SBE.DocumentRegistry.get(doc.type)
```

Examples:

- tab labels
- colors
- icons
- panel bindings
- inspector bindings
- runtime creation

---

# Serialization

Documents serialize only:

- document data
- runtime bindings
- metadata

Never serialize:

- renderer instances
- DOM references
- live runtime objects

---

# Example Serialized Document

```
{    "id": "doc_001",    "type": "route",    "name": "WOS World",    "runtime": "routeWorld",    "data": {},    "version": "0518A.1"}
```

---

# Failure Handling

Unknown document type:

```
Unsupported Document Type
```

Registry collisions:

```
Duplicate Registry Entry
```

Missing runtime:

```
Runtime Not Registered
```

All failures must:

- fail loudly
- fail visibly
- never silently downgrade

---

# Future Expansion

This architecture intentionally prepares for:

## Plugin Documents

```
trafficsubwayweatherdialoguebroadcastepisodecameratimeline
```

---

## Alternate Renderers

```
2D3DheadlessOBSmobilepassengerminimap
```

---

## Detached Runtime Execution

```
background simulationserver worldsmultiplayer shardsdistributed AI actors
```

---

# Constraints

## Do NOT

- hardcode document branching
- store DOM on documents
- attach renderer state to documents
- mutate registry entries at runtime

---

## Always

- resolve through registries
- separate runtime from presentation
- use capabilities for UI logic
- preserve document portability

---

# Final Principle

```
Documents are portable state.Runtimes execute behavior.Renderers visualize state.Registries connect the system together.
```

---

# Implementation Guide

### 1. Create Registries

Add:

```
engine/documentRegistry.jsregistries/*
```

### 2. Register Built-In Types

Register:

- route
- canvas
- soundscape
- world

during bootstrap.

### 3. Refactor Workspace Usage

Replace all:

```
if (doc.type === ...)
```

with:

```
SBE.DocumentRegistry.get(doc.type)
```


---
