# 0608_MAPLAB_BuildingSelection_v0.1 [BUILD]

## Objective

Create the first functional Map Lab inside WOS Studio.

This milestone is focused exclusively on proving that Studio can identify and inspect real Mapbox building features.

No world editing, asset assignment, object replacement, or music behavior is included in this phase.

Success is defined by selecting a building from a Mapbox scene and exposing its data inside the Studio Inspector.

---

## Background

WOS Studio currently contains:

- Asset Library
    
- Actor Library
    
- Glyph Lab
    
- Palette Lab
    
- Proof Stage
    

Map Lab will become the bridge between Studio's asset ecosystem and the live world.

The long-term workflow is:

```txt
Map
↓
Select Building
↓
Inspect Building
↓
Assign Asset
↓
Replace / Augment Building
↓
Apply Behaviors
↓
Save World State
```

This build implements only the first two stages.

```txt
Map
↓
Select Building
↓
Inspect Building
```

---

## Scope

### In Scope

- New Map Lab Studio tab
    
- Mapbox viewport embedded in Studio
    
- 3D building visualization
    
- Building feature selection
    
- Building highlighting
    
- Inspector integration
    
- Building metadata display
    

### Out of Scope

- Asset assignment
    
- Object replacement
    
- Music reactivity
    
- Animation systems
    
- Save/load systems
    
- World persistence
    
- Actor integration
    
- Glyph integration
    
- Palette integration
    
- Wall runtime modifications
    

---

## Requirements

### 1. Add Map Lab Tab

Add a new Studio tab:

```txt
Map Lab
```

Update:

- studio/index.html
    
- studio/studioShell.js
    

Required additions:

```js
"map-lab"
```

Add to:

- MODES
    
- STAGE_TITLES
    
- Stage rendering routing
    
- Inspector routing
    

Hash routing should function automatically:

```txt
#map-lab
```

---

### 2. Create Map Lab Stage Renderer

Add:

```js
_renderMapLab(body)
```

Responsibilities:

- Render map container
    
- Initialize Mapbox viewport
    
- Render 3D building layer
    
- Handle viewport resizing
    
- Manage selection state
    

The stage should occupy the center panel only.

No changes to Studio shell layout.

---

### 3. Load Mapbox Buildings

Requirements:

- Standard Mapbox style
    
- Fill extrusion building layer
    
- Camera controls enabled
    
- Reasonable default location
    
- Reasonable default zoom
    

Building layer must be selectable.

---

### 4. Building Selection

User interaction:

```txt
Click Building
↓
Select Feature
↓
Highlight Building
↓
Update Inspector
```

Requirements:

- Single selection
    
- Selecting a new building clears previous selection
    
- Empty clicks clear selection
    

Selection state should remain local to Map Lab.

---

### 5. Building Highlighting

Preferred:

- Color override
    

Fallback:

- Opacity change
    
- Outline
    
- Emissive effect
    

Goal:

Provide obvious visual confirmation that a building has been selected.

---

### 6. Inspector Integration

Add:

```js
_renderMapInspector()
```

Inspector should display:

### Building Information

```txt
Building ID
```

### Geographic Information

```txt
Longitude
Latitude
```

### Geometry Information

```txt
Height
Min Height
```

### Source Information

```txt
Source Layer
Feature ID
```

### Raw Properties

Display complete feature properties object.

Use existing Studio inspector patterns where possible.

---

## Architecture Requirements

### Studio First

Map Lab must be implemented inside WOS Studio.

Do not create:

```txt
object-lab/
map-editor/
map-sandbox/
```

Map Lab is part of Studio.

---

### Wall Runtime Protection

Do not modify:

```txt
wall/
```

unless a reusable read-only helper is absolutely required.

Studio should consume existing functionality where possible.

---

### Modular Design

Preferred structure:

```txt
studio/
├── studioShell.js
├── mapLab/
│   ├── mapLabView.js
│   ├── mapSelection.js
│   ├── mapInspector.js
│   └── mapboxAdapter.js
```

Avoid adding significant complexity directly into studioShell.js.

---

## Success Criteria

### Phase Complete When

All of the following are true:

- Map Lab tab appears
    
- Mapbox viewport loads
    
- 3D buildings render
    
- Building selection works
    
- Selected building highlights
    
- Inspector updates with selected building data
    
- Empty click clears selection
    
- Studio remains fully functional
    
- No existing tabs regress
    

---

## Future Milestones

### v0.2

Asset Assignment

```txt
Select Building
↓
Choose Asset
↓
Store Assignment
```

---

### v0.3

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

### v0.4

Music Behaviors

```txt
Pulse
Glow
Scale
Rotate
Color Shift
```

---

### v0.5

Persistent World State

```txt
Building
↓
Assigned Asset
↓
Save
↓
Reload
↓
Restore
```

---

## Build Notes

This milestone exists to answer one critical question:

```txt
Can WOS Studio identify and inspect individual Mapbox buildings?
```

If successful, every future world-editing feature can be built on top of the same selection system.