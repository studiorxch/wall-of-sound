# 0608_MAPLAB_BuildingSelection_v0.2 [BUILD]

## Objective

Implement the first production-ready Map Lab inside WOS Studio.

The purpose of this milestone is to establish a reusable world-selection system capable of identifying, selecting, and inspecting individual Mapbox building features.

This build is not about editing the world.

This build is about proving that WOS Studio can reliably target real-world objects.

Success is defined as:

```txt
Map
↓
Select Building
↓
Inspect Building
```

Everything else will be built on top of this foundation.

---

## Architectural Intent

Map Lab is a Studio subsystem.

Do not create:

```txt
object-lab/
map-editor/
map-sandbox/
```

Map Lab must live inside:

```txt
studio/
```

and operate as a first-class Studio workspace.

Long-term workflow:

```txt
Map
↓
Select World Object
↓
Assign Asset
↓
Replace / Augment
↓
Apply Behaviors
↓
Persist World State
```

This milestone only implements:

```txt
Map
↓
Select World Object
↓
Inspect World Object
```

---

## Background

Current Studio tabs:

- Asset Library
    
- Actor Library
    
- Glyph Lab
    
- Palette Lab
    
- Proof Stage
    

Add:

```txt
Map Lab
```

Map Lab will eventually become the bridge between:

```txt
Asset Library
Actor Library
Glyph Lab
Palette Lab
```

and

```txt
World Placement
World Editing
World Behaviors
```

---

## Scope

### In Scope

- Map Lab tab
    
- Embedded Mapbox viewport
    
- 3D building rendering
    
- Building selection
    
- Building highlighting
    
- Inspector integration
    
- Reusable selection state
    

### Out of Scope

- Asset assignment
    
- Object replacement
    
- Music reactivity
    
- Animation systems
    
- Persistence
    
- Save/load
    
- Actor integration
    
- Glyph integration
    
- Palette integration
    
- World editing
    
- Wall runtime modifications
    

---

## Critical Requirement

### Independent Studio Map Instance

Do not reuse:

```txt
wall/runtimes/mapboxViewportRuntime.js
```

Map Lab must maintain its own viewport lifecycle.

Wall runtime behavior must remain untouched.

Wall code may be referenced for patterns only.

Studio must own:

```txt
Map Initialization
Map Destruction
Map Resizing
Map Selection
Map Highlighting
```

---

## Requirements

### 1. Add Map Lab Tab

Update:

```txt
studio/index.html
studio/studioShell.js
```

Add:

```txt
Map Lab
```

Required updates:

- MODES
    
- STAGE_TITLES
    
- Stage routing
    
- Inspector routing
    

Hash support:

```txt
#map-lab
```

must function automatically.

---

### 2. Create Map Lab Module Structure

Preferred structure:

```txt
studio/
└── mapLab/
    ├── mapLabView.js
    ├── mapSelection.js
    ├── mapInspector.js
    └── mapboxAdapter.js
```

Avoid expanding studioShell.js beyond routing and lifecycle wiring.

---

### 3. Create Mapbox Adapter

Create:

```txt
mapboxAdapter.js
```

Responsibilities:

- Create map instance
    
- Destroy map instance
    
- Resize map instance
    
- Discover building layers
    
- Query rendered features
    
- Expose selection helpers
    

This module should act as the boundary between:

```txt
Mapbox
```

and

```txt
WOS Studio
```

---

### 4. Render Map Lab Stage

Create:

```txt
_renderMapLab()
```

Responsibilities:

- Render map container
    
- Mount Mapbox viewport
    
- Support resizing
    
- Initialize selection system
    

Requirements:

- Standard Mapbox style
    
- 3D fill-extrusion buildings
    
- Reasonable default camera
    
- Responsive layout
    

Stage occupies only:

```txt
Studio Center Panel
```

---

### 5. World Object Selection

Selection is the primary deliverable.

Create a reusable selection model:

```js
{
  id,
  source,
  sourceLayer,
  geometry,
  properties,
  center,
  height,
  minHeight
}
```

Selection flow:

```txt
Click Building
↓
Identify Feature
↓
Create Selection Object
↓
Store Selection State
↓
Update Inspector
```

The selection system must be designed for future consumers:

- Asset Assignment
    
- Object Replacement
    
- Music Behaviors
    
- Persistence
    
- Inspector
    

Do not implement those systems yet.

Only establish the architecture.

---

### 6. Highlight Selected Building

Requirements:

```txt
Single Selection
```

Behavior:

```txt
Select New Building
↓
Clear Previous Selection
↓
Apply New Highlight
```

Preferred methods:

1. Color override
    
2. Feature state styling
    
3. Outline
    
4. Opacity
    

Any visible highlight is acceptable for v0.2.

---

### 7. Inspector Integration

Create:

```txt
_renderMapInspector()
```

Display:

### Building

```txt
Building ID
Feature ID
```

### Geographic

```txt
Longitude
Latitude
```

### Geometry

```txt
Height
Min Height
```

### Source

```txt
Source
Source Layer
```

### Raw Properties

```txt
feature.properties
```

Reuse existing Studio inspector patterns wherever possible.

---

### 8. Lifecycle Management

Required:

#### Enter Map Lab

```txt
Initialize Map
Attach Listeners
```

#### Leave Map Lab

```txt
Detach Listeners
Destroy Map
Release Resources
```

Prevent:

- WebGL leaks
    
- Event listener leaks
    
- Hidden map instances
    

---

## Success Criteria

### Build Complete When

All items below are true:

- Map Lab tab appears
    
- Hash routing works
    
- Mapbox viewport loads
    
- 3D buildings render
    
- Building selection works
    
- Selected building highlights
    
- Inspector updates correctly
    
- Empty click clears selection
    
- Existing Studio tabs remain functional
    
- No Wall runtime modifications required
    

---

## Future Milestones

### v0.3

Asset Assignment

```txt
Select Building
↓
Assign Asset
```

---

### v0.4

Object Replacement

```txt
Building
↓
Speaker Tower

Building
↓
Arcade Cabinet

Building
↓
Billboard
```

---

### v0.5

Music Behaviors

```txt
Pulse
Glow
Scale
Rotate
Color Shift
```

---

### v0.6

Persistent World State

```txt
Select Building
↓
Assign Asset
↓
Save
↓
Reload
↓
Restore
```

---

## Build Notes

This build is not testing Mapbox.

This build is not testing buildings.

This build is testing one architectural question:

```txt
Can WOS Studio identify and manage a real-world object through a reusable selection system?
```

If successful, Map Lab becomes the foundation for all future world editing systems.