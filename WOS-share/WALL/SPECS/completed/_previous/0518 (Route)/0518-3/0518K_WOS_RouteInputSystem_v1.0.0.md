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


Goal

Replace manual waypoint plotting as the primary workflow with a true GPS-style route authoring system.

Users should:

- define origin/destination/stops
    
- generate navigational routes automatically
    
- edit/refine resulting geometry afterward
    
- layer authored media on top of routes
    

The route system becomes:

```
infrastructure
```

NOT:

```
freehand artwork
```

Core Principles

1. Route Layer Is Special

Routes:

- are navigational infrastructure
    
- should not behave like standard paint layers
    
- must remain structurally editable
    
- must remain protected from accidental artwork edits
    

Routes are internally layers but presented through:

```
dedicated Route UI
```

NOT generic art-layer workflows.

2. Surface = Spatial Workspace

A Surface may contain:

- route systems
    
- artwork
    
- overlays
    
- sound systems
    
- events
    
- ecology
    
- camera systems
    

Routes exist:

```
inside surfaces
```

not as standalone documents.

Architecture

New System

```
SBE.RouteInputSystem
```

Responsible for:

- route creation
    
- stop management
    
- route generation
    
- alternate routes
    
- route editing
    
- route visibility/locking
    
- fit-to-route camera
    

New UI Section

Right Sidebar

Add:

```
ROUTES
```

tab beside:

- Object
    
- Layers
    
- World
    

ROUTES Panel Responsibilities

Route List

Each route displays:

- route name
    
- origin → destination
    
- distance
    
- ETA
    
- stop count
    
- visibility
    
- lock state
    

Example:

```
● Corridor Zero
  Dumbo → Bushwick
  5.8 mi • 37 min
```

Route Controls

Per-route:

- Visible toggle
    
- Locked toggle
    
- Fit button
    
- Edit button
    
- Delete button
    

Stop List

Expandable hierarchy:

```
Stops
 ├─ Dumbo
 ├─ Williamsburg
 └─ Bushwick
```

Supports:

- reorder
    
- rename
    
- remove
    
- insert stop
    

Add Route Workflow

UI

Top route controls:

```
[ Origin ]
[ Destination ]
[ + Add Stop ]
[ Generate Route ]
```

Route Generation

Generating a route should:

- create Route object
    
- compute path geometry
    
- generate waypoints
    
- compute metadata
    
- attach to current surface
    
- create locked infrastructure layer
    

Route Data Model

```
interface Route {
  id: string;
  name: string;

  origin: RouteStop;
  destination: RouteStop;
  stops: RouteStop[];

  geometry: RouteGeometry;

  metadata: {
    distanceKm: number;
    durationMinutes: number;
    travelMode: 'drive' | 'walk' | 'bike' | 'transit';
    generated: boolean;
  };

  visible: boolean;
  locked: boolean;

  camera: RouteCameraSettings;
}
```

Route Stops

```
interface RouteStop {
  id: string;

  name: string;

  longitude: number;
  latitude: number;

  address?: string;
}
```

Route Geometry

```
interface RouteGeometry {
  coordinates: Array<{
    longitude: number;
    latitude: number;
  }>;
}
```

Route Layer Rules

Locked By Default

Generated routes:

```
must default to locked
```

to prevent:

- accidental drawing
    
- deletion
    
- paint interactions
    
- object merges
    

Route Editing Mode

Unlocking or pressing Edit:

- enables waypoint manipulation
    
- enables insertion/removal
    
- enables stop refinement
    
- disables paint tools temporarily
    

Layer Separation

Routes MUST NOT mix with artwork layers

Correct structure:

```
Surface
 ├── Route Infrastructure
 ├── Graffiti Layer
 ├── Media Layer
 ├── Audio Layer
 ├── Ecology Layer
 └── FX Layer
```

Runtime Requirements

Route Runtime

Generated routes must:

- render in operator mode
    
- render simplified cinematic pass in presentation mode
    
- expose camera targets
    
- expose traversal metadata
    

Camera Integration

Add:

```
fitRoute(routeId)
```

Behavior:

- computes bounds
    
- frames route cleanly
    
- respects UI chrome
    
- animates smoothly
    

Interaction Rules

Pointer Input

Click map:

- selects route
    
- selects stop
    
- selects waypoint
    

Double-click segment:

- inserts waypoint
    

Drag stop:

- updates route geometry
    

Persistence

Routes must serialize into:

```
surface.runtimeState.routes
```

including:

- geometry
    
- metadata
    
- camera settings
    
- stops
    
- visibility
    
- lock state
    

Cleanup Requirements

Remove Legacy Residue

This spec also requires removal of:

- old demo geometry
    
- stale preview layers
    
- duplicated route rendering
    
- residual corridor debug overlays
    
- old PIP-style inset rendering
    

Startup state must always:

- load clean
    
- frame map correctly
    
- restore surfaces consistently
    

Naming Rules

Canonical terminology:

- Surface
    
- Route
    
- Route Panel
    
- Stop
    
- Destination
    
- Origin
    

Deprecated:

- Canvas
    
- Document
    
- Corridor Overlay
    
- Demo Route
    

Acceptance Criteria

Functional

- User can create route via origin/destination
    
- Routes generate automatically
    
- Routes appear in ROUTES panel
    
- Routes are locked by default
    
- Routes fit correctly to map
    
- Stops editable after generation
    
- Multiple routes supported
    

Visual

- No dark stage rectangle
    
- No PIP artifacts
    
- No duplicated route rendering
    
- Map fills viewport cleanly
    
- Presentation mode remains cinematic
    

Files Expected

```
wall/systems/routeInputSystem.js
wall/render/routePanel.js
wall/ui/routeControls.js
```

Likely updates:

```
workspaceUI.js
routePlannerRuntime.js
runtimeViewportRouter.js
workspace.css
main.js
```

Implementation Guide

1. Build Route Panel

Create dedicated ROUTES sidebar tab and route list UI.

2. Implement Route Input Workflow

Origin/destination/stops → generated route object.

3. Stabilize Runtime

Remove legacy overlays, ensure clean startup + fit-to-route behavior.
```

---
# Refinement 

---
# Development

```

```