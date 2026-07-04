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
# 0519_WOS_SurfaceRail_Architecture_v1.0.0

## Goal

Replace the current top “Surface” tab system with a canonical left-rail Surface Stack inspired by:

- Twitch channel rails
- broadcast systems
- ambient world selectors
- live destination switching

The world itself becomes the primary canvas.

Surfaces become:

- destinations
- channels
- worlds
- environmental presets
- live stations

This removes unnecessary top chrome and restores vertical cinematic space to the map.

---

# Core Philosophy

## OLD MODEL

```
DocumentsTabsEditorsWorkspaces
```

## NEW MODEL

```
WorldsStationsDestinationsBroadcast ChannelsEnvironmental States
```

WOS is no longer behaving like a traditional editor.

The map/world is now the document.

---

# Remove Entire Surface Topbar

## DELETE / DEPRECATE

Remove:

- surface tab slab
- top tab chrome
- SELECT badge
- empty navigate-mode tool strip
- duplicated framing containers

The following UI should no longer exist in navigate mode:

```
[ Surface 1 ] [+]----------------------------------SELECTtool navigate ...
```

These consume excessive vertical space and visually interrupt the world.

---

# New Canonical Layout

## LEFT SIDEBAR STRUCTURE

```
SURFACES◉○○＋----------------WORLDZONESSYSTEMSVIZ
```

Surface nodes live ABOVE the existing nav icons.

---

# Surface Rail Design

## Visual Style

### Requirements

- Circular nodes
- Dark infrastructure aesthetic
- Minimal framing
- Strong color identity
- Ambient hover behavior
- Low-noise idle state

### DO NOT

- use tabs
- use file/document metaphors
- use boxed editor chrome
- use large labels permanently visible

---

# Surface Node States

## Idle

```
opacity: 0.72;transform: scale(1);
```

## Hover

```
opacity: 1;transform: scale(1.06);
```

Subtle only.

No exaggerated animation.

---

## Active

```
outline: 1px solid rgba(255,255,255,0.55);box-shadow:0 0 12px rgba(255,255,255,0.12);
```

Should resemble:

- live station
- selected camera feed
- active broadcast

NOT:

- app icon
- game button

---

# Surface Node Content

## Phase 1

Simple generated initials or color.

Examples:

```
NYTKBL
```

or procedural gradients.

---

## Phase 2

Mini live previews:

- map snapshot
- atmosphere tint
- weather palette
- route signature
- generated visual glyph

---

## Phase 3

Live animated worlds:

- audio reactive rings
- weather pulses
- traffic glow
- route progress arcs
- live broadcast indicators

---

# Surface Rail Behavior

## Clicking Surface

Switches:

- map location
- atmosphere
- weather
- time zone
- route state
- soundtrack profile
- ecology profile
- render style

Transition should feel like:  
“changing channels”  
NOT:  
“opening files”

---

# Add Surface Button

## Placement

Below surface stack.

```
＋
```

Minimal.

No large button container.

---

## Behavior

Creates:

- new surface
- duplicated world state
- optional procedural seed

---

# Surface Tooltip

Hover reveals compact telemetry.

Example:

```
TOKYO RAIN11:42 PM JSTRain Drift58°
```

Tooltip style:

- black translucent
- thin typography
- cinematic
- no rounded app-card aesthetic

---

# Right Sidebar

## KEEP

Inspector panels remain.

These are contextual world controls.

No major changes required yet.

---

# Telemetry Placement

## Keep Current Telemetry HUD

Current:

- location
- weather
- time
- temperature

This is now the canonical environmental instrumentation layer.

---

# Map Priority

## IMPORTANT

The world must dominate the composition.

UI should behave like:

- broadcast overlays
- HUD systems
- environmental instrumentation

NOT:

- productivity software
- browser tabs
- desktop editors

---

# Future Expansion

## Surface Categories

Future support:

```
LIVECURATEDEVENTSPROCEDURAL
```

Examples:

```
LIVE◉ NYC RAINCURATED◉ TOKYO DRIFTEVENTS◉ HALLOWEEN GRID
```

---

# Architectural Direction

## Surfaces Become Channels

Long-term conceptual model:

```
Surface = Channel
```

Each surface may eventually contain:

- persistent weather
- live audio
- actor systems
- traffic systems
- ecological systems
- route systems
- social occupancy
- stream metadata

This transforms WOS from:  
“map editor”

into:

“ambient world broadcasting infrastructure”

---

# Files To Modify

## workspace.css

Add:

- surface rail styling
- avatar node styling
- active states
- hover states
- add button styling

Remove:

- top tab slab styling
- surface tab chrome
- navigate-mode top strip styling

---

## workspaceUI.js

Add:

- renderSurfaceRail()
- surface node generation
- surface switching
- hover tooltip support

Remove:

- top surface bar render logic
- obsolete tab container logic

---

## index.html

Remove:

- obsolete surface topbar DOM

Add:

- left rail surface container

---

# Rendering Notes

## IMPORTANT

Surface rail must:

- remain lightweight
- never block map interaction
- support future animation
- support procedural thumbnails later

Use:

- CSS transforms only
- opacity transitions
- no heavy blur chains
- no canvas rendering yet

---

# DO NOT

- recreate browser tabs vertically
- add large labels permanently
- add nested panels
- use skeuomorphic cards
- overanimate the rail
- clutter the left edge

---

# Success Condition

The application should begin feeling like:

```
a live world broadcasting system
```

instead of:

```
a map editor with tabs
```

The user should emotionally perceive:

- destinations
- channels
- atmospheres
- worlds

not:

- documents
- projects
- files.
```

---
# Refinement 

---
# Development

```

```