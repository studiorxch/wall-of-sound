# 🚦 SPEC STAGE

Stage: BUILD  
Freeze Decision: ACTIVE  
Action: Improve Studio Map Lab visual verification by expanding the map workspace, collapsing the library by default, and slimming the inspector.

---

layout: spec

title: "Studio Map Lab Workspace Layout"
date: 2026-06-12
doc_id: "0612H_WOS_StudioMapLabWorkspaceLayout_v1.0.0_BUILD"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "studio-ui"
component: "MapLabWorkspaceLayout"

type: "ui-layout-spec"
status: "active"

priority: "high"
risk: "low"

classification: "interface-layout"

summary: "Reclaims Studio Map Lab screen space for visual building verification by hiding the persistent library column in Map Lab, exposing it as an overlay drawer, and reducing the inspector width to 290px."

---

# 🎯 PURPOSE

Make Studio Map Lab usable for visual building verification.

Current problem:

```text
The Library column is always visible in Map Lab.
The Inspector is too wide.
The map viewport is too narrow.
Building replacement, hidden source state, and style parity are difficult to visually verify.
```

This build improves layout only.

No building authority, replacement, suppression, parity, or basemap runtime logic may change.

---

# 🧠 CORE PRINCIPLES

## Map First

In Map Lab, the map viewport is the primary working surface.

## Library On Demand

The Library list is useful, but it should not permanently consume horizontal space during map authoring.

## Inspector Still Available

The Inspector remains visible but narrower.

## No Runtime Logic Changes

This is a UI layout build only.

---

# 🧱 TARGET LAYOUT

## Current

```text
Library | Map Lab | Inspector
```

Problem:

```text
Library and Inspector compress the map.
```

## Target

```text
Map Lab expanded | Inspector 290px
```

With Library accessible as:

```text
overlay drawer
button-triggered panel
temporary slide-out
```

---

# ✅ REQUIRED BEHAVIOR

## B1 — Collapse Library by default in Map Lab

When Studio enters:

```text
Map Lab
```

the Library column must not occupy permanent layout width.

Expected:

```text
Map viewport expands into the freed space.
```

---

## B2 — Add Library overlay drawer

Add a button or affordance in Map Lab:

```text
Library
```

When clicked:

```text
Library opens as overlay drawer above the map.
```

Drawer rules:

```text
- does not resize the map
- can be closed
- does not obscure Inspector
- should be keyboard/mouse accessible
```

---

## B3 — Inspector width 290px

Set the Map Lab Inspector width to:

```css
290px
```

It may be responsive below narrow breakpoints, but default desktop width should be 290px.

---

## B4 — Preserve Inspector function

Do not remove existing Inspector controls.

Allowed:

```text
- tighter spacing
- smaller label rows
- reduced padding
- vertical scroll
```

Forbidden:

```text
- removing controls
- changing building edit logic
- changing callbacks
- changing registry writes
```

---

## B5 — Preserve Author / Preview controls

The Author / Preview toggle must remain visible and usable.

---

## B6 — No building runtime changes

Do not modify:

```text
BuildingEditRegistry
BuildingReplacementRuntime
BuildingEditProjectionRuntime
BuildingAuthorityRuntime
EditableBasemapAuthority
ThreeViewStyleParityLock
```

unless only adding comments is required. Prefer no changes.

---

# 📁 EXPECTED FILES

Likely files:

```text
studio/index.html
studio/styles.css
studio/studioShell.js
studio/mapLab/mapLabView.js
```

Only modify files actually needed for layout.

---

# 🧪 VALIDATION CHECKLIST

## T1 — Map Lab opens expanded

Open:

```text
/studio/index.html#map-lab
```

Expected:

```text
Library column is not taking permanent horizontal space.
Map viewport is visibly wider.
```

---

## T2 — Library drawer works

Click Library control.

Expected:

```text
Library appears as overlay drawer.
Map width does not shrink.
Drawer can close.
```

---

## T3 — Inspector width

Inspect layout.

Expected:

```text
Inspector default width = 290px.
```

---

## T4 — Map remains usable

Expected:

```text
Click/select building still works.
Author/Preview toggle still works.
Mapbox canvas resizes correctly.
```

---

## T5 — No authority regression

Expected:

```text
No building authority/runtime files changed.
No replacement behavior changed.
No suppression behavior changed.
No basemap behavior changed.
```

---

# 🚫 NON-GOALS

This build must not implement:

- new map runtime
- new building authority
- new replacement geometry
- new suppression logic
- new style parity logic
- new basemap switching
- new building inspector features
- design system overhaul

---

# 📦 DELIVERABLES

Claude/Codex must return:

```text
1. Exact diff
2. Files changed
3. Before/after layout description
4. Confirmation inspector is 290px
5. Confirmation library is overlay/on-demand
6. Confirmation no building runtime logic changed
```

---

# ✅ SUCCESS DEFINITION

Success is:

```text
Studio Map Lab gives most horizontal space to the map.
Library is available only when needed.
Inspector is slimmed to 290px.
Building visual verification is easier.
No building authority behavior changes.
```
