# 0518_WOS_WorkspaceArchitecture_v1.0.0

Generated: 05/18/2026  
System: WOS  
Domain: Workspace / Document Architecture / Runtime Separation  
Status: Active  
Depends On:

- Existing sidebar system
- Existing inspector architecture
- Existing canvas runtime
- Existing document serialization systems

---

# Purpose

This spec establishes:

```
Workspace
```

as the new top-level architectural container for WOS.

WOS is no longer treated as:

- a single runtime
- a single world
- a single map
- a single canvas

Instead:

```
WOS becomes a multi-document creative environment
```

supporting:

- independent projects
- independent runtimes
- independent presentation layers
- optional future interoperability

---

# Core Principle

The Workspace must separate:

|Layer|Purpose|
|---|---|
|Workspace|project orchestration|
|Document|editable creative unit|
|Runtime|live simulation state|
|Passenger View|curated presentation output|

---

# Architectural Goals

Workspace must:

- support multiple simultaneous documents
- support independent runtimes
- allow future docking/splitting
- isolate document state safely
- support save/load/versioning
- remain lightweight and modular

---

# Non-Goals

This spec does NOT:

- redesign Passenger View
- redesign ecology systems
- redesign map rendering
- implement cloud sync
- implement collaboration

This spec ONLY establishes:

```
the foundational workspace container architecture
```

---

# Core Terminology

---

# Workspace

Top-level orchestration environment.

Owns:

- sidebar navigation
- document tabs
- active document focus
- document lifecycle
- global overlays
- application routing

---

# Document

A saveable creative unit.

Examples:

- RouteDocument
- CanvasDocument
- SoundscapeDocument
- WorldDocument

---

# Runtime

Live execution state associated with a document.

Runtime state is:

- transient
- mutable
- non-authoritative

Document data remains:

```
the authoritative source of truth
```

---

# Passenger View

Curated presentation layer derived from:

- document state
- runtime state
- rendering systems

Passenger View is:

```
output
```

NOT:

```
workspace infrastructure
```

---

# Required Workspace Structure

```
Workspace ├── Sidebar ├── TabBar ├── ActiveDocument ├── LowerContextPanel ├── Inspector └── RuntimeManager
```

---

# Sidebar Architecture

---

# Purpose

Sidebar acts as:

```
global workspace navigation
```

NOT:

- tool switching
- document content
- inspector controls

---

# Required Sidebar Icons

|Icon|Purpose|
|---|---|
|Home|Workspace root|
|Route|Route Planner|
|Canvas|Freeform canvas|
|World|Ecology runtime|
|Sound|Soundscape|
|Broadcast|Passenger output|

---

# UI Rules

- icon-only default
- hover labels allowed
- no permanent text labels
- consistent icon sizing
- fixed sidebar position

---

# Sidebar Behavior

Sidebar selection changes:

```
workspace context
```

NOT:

```
tool mode
```

---

# Tab System

---

# Purpose

Tabs represent:

```
open documents
```

NOT:

- tools
- overlays
- inspectors

---

# Required Features

- create tab
- close tab
- duplicate tab
- rename tab
- reorder tabs
- active tab switching

---

# Tab Types

|Document Type|Default Tab Label|
|---|---|
|RouteDocument|Untitled Route|
|CanvasDocument|Untitled Canvas|
|SoundscapeDocument|Untitled Soundscape|
|WorldDocument|Untitled World|

---

# Active Document Rules

Only ONE document is:

```
active
```

at a time.

Active document controls:

- inspector context
- lower panel context
- runtime ownership
- rendering target

---

# Lower Context Panel

---

# Purpose

Bottom section becomes:

```
document contextual interface area
```

NOT:

```
globally fixed UI
```

---

# Examples

|Document Type|Lower Panel Content|
|---|---|
|RouteDocument|ETA / miles / route controls|
|CanvasDocument|brush settings / layer controls|
|SoundscapeDocument|transport / mixer|
|WorldDocument|ecology metrics|

---

# Rules

Lower panel content MUST:

- change dynamically per document
- remain compact
- preserve layout consistency
- avoid modal clutter

---

# Document Types

---

# RouteDocument

Purpose:

- route authoring
- emergence pathing
- geographic planning

Contains:

- waypoints
- metadata
- route variants
- traffic metadata
- district references

---

# CanvasDocument

Purpose:

- freeform visual authoring
- motion experiments
- object layouts
- non-geographic composition

---

# SoundscapeDocument

Purpose:

- audio systems
- ambient mixes
- procedural sound
- transport timelines

---

# WorldDocument

Purpose:

- ecology orchestration
- runtime experimentation
- autonomous systems
- actor behavior

---

# Runtime Separation

---

# Critical Rule

Documents are:

```
persistent data containers
```

Runtimes are:

```
temporary execution environments
```

---

# Example

```
RouteDocument    ↓RouteRuntime    ↓PassengerView
```

---

# RuntimeManager

Workspace owns:

```
RuntimeManager
```

Purpose:

- create runtimes
- destroy runtimes
- suspend runtimes
- switch active runtime
- isolate execution safely

---

# Constraints

Runtimes MUST:

- never mutate source documents directly
- serialize safely
- support reset/reload
- support future multiplayer isolation

---

# Save Architecture

---

# Document Persistence

All documents saved as:

```
JSON document objects
```

Examples:

```
route-document.jsoncanvas-document.jsonworld-document.jsonsoundscape-document.json
```

---

# Base Schema

```
{  id: "",  type: "RouteDocument",  name: "",  version: "1.0.0",  createdAt: 0,  modifiedAt: 0,  metadata: {},  content: {}}
```

---

# Workspace Schema

```
{  activeDocumentId: "",  openDocuments: [],  sidebarContext: "home",  runtimeState: {},  uiState: {}}
```

---

# Inspector Integration

---

# Inspector Purpose

Inspector edits:

```
active document state
```

NOT:

- workspace state
- unrelated runtimes

---

# Inspector Behavior

Inspector content changes dynamically based on:

- active document type
- active selection
- active object

---

# Example

|Document|Inspector|
|---|---|
|RouteDocument|waypoint + route metadata|
|CanvasDocument|object properties|
|SoundscapeDocument|audio parameters|
|WorldDocument|ecology settings|

---

# Rendering Architecture

---

# Important Separation

Workspace UI:

```
must NOT be tied directly to render systems
```

Documents own rendering.

---

# Example

```
RouteDocument → RouteRendererCanvasDocument → CanvasRendererWorldDocument → EcologyRenderer
```

---

# Passenger View Relationship

---

# Critical Clarification

Passenger View is:

```
NOT the workspace itself
```

Passenger View is:

```
a curated runtime output
```

generated FROM:

- active document
- active runtime
- presentation systems

---

# This Enables

- operator mode
- cinematic mode
- OBS mode
- future mobile mode
- future public stream mode

WITHOUT corrupting:

```
workspace authoring infrastructure
```

---

# Home View

---

# Purpose

Home acts as:

```
workspace landing environment
```

NOT:

- operating runtime
- presentation layer

---

# Home Should Support

- recent documents
- create new document
- saved projects
- quick launch
- future templates

---

# Future Expansion Readiness

Workspace architecture must support future:

- split panes
- multi-monitor support
- detached viewers
- collaborative sessions
- runtime streaming
- plugin systems

WITHOUT major refactors.

---

# Constraints

DO NOT:

- tightly couple documents
- hardcode runtime ownership
- mix passenger rendering with workspace logic
- overload sidebar responsibilities
- use map systems as global truth

---

# Engineering Naming Rules

Follow:

```
WOS Naming Doctrine
```

Use:

- deterministic architectural terminology
- document-based naming
- infrastructural language

Avoid:

- metaphoric internal names
- branded engineering names
- overloaded terminology

---

# Validation Criteria

Workspace architecture succeeds when:

- multiple independent documents coexist safely
- active document switching is stable
- runtime isolation functions correctly
- contextual lower panels update correctly
- sidebar navigation remains consistent
- Passenger View cleanly separates from authoring systems

---

# Final Principle

WOS is no longer:

```
a single simulation canvas
```

WOS is now:

```
a modular world-authoring workspace
```

where:

- documents create worlds
- runtimes activate worlds
- Passenger View broadcasts worlds
- Workspace orchestrates worlds
---
![[Pasted image 20260517150230.png]]
# Suggested Immediate Follow-Up Specs

## Highest Priority
1. [[0518A_WOS_DocumentRegistry_v1.0.0]]
2. [[0518B_WOS_WorkspaceEventBus_v1.0.0]]
3. [[0518C_WOS_PanelInjectionSystem_v1.0.0]]