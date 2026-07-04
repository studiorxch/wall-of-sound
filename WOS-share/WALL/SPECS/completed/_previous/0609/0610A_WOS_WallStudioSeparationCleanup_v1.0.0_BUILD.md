# 0610A_WOS_WallStudioSeparationCleanup_v1.0.0_BUILD

## Objective

Restore the intended separation between:

```txt
WALL
```

and

```txt
STUDIO
```

This build is a UI cleanup and workflow restoration pass.

No new features.

No new tools.

No new navigation systems.

No new creator workflows.

The purpose of this build is to remove creator-tool clutter from the broadcast surface and restore Wall as a clean channel/view/route interface.

---

# Problem Statement

Recent recovery work successfully exposed creator tools but unintentionally mixed production tooling into the Wall interface.

This resulted in:

- sidebar clutter
    
- creator tools appearing on the broadcast surface
    
- confusion between viewer controls and creator controls
    
- loss of focus on channel/view/route workflows
    

This build restores separation.

---

# Design Authority

Wall is the live broadcast surface.

Think:

```txt
TV
```

Studio is the production environment.

Think:

```txt
Control Room
```

---

# WALL Responsibilities

Wall exists for:

```txt
Channels
Views
Routes
Camera Control
Viewer Interaction
Broadcast Operation
```

Wall does NOT exist for:

```txt
Canvas
GlyphLab
ColorLab
Map Lab
Asset Authoring
Actor Authoring
Palette Authoring
```

---

# STUDIO Responsibilities

Studio exists for:

```txt
Canvas
GlyphLab
ColorLab
Map Lab
Asset Library
Actor Library
Palette Lab
Proof Stage
```

Studio is the creator environment.

---

# Scope

## In Scope

- remove creator-tool clutter from Wall
    
- restore Wall navigation intent
    
- move creator-tool access into Studio
    
- preserve all existing functionality
    
- preserve existing creator workflows
    

## Out of Scope

- Map Lab changes
    
- ColorLab integration
    
- Asset Assignment
    
- Object Replacement
    
- Music Behaviors
    
- Camera System redesign
    
- Route System redesign
    
- Channel redesign
    

---

# Requirements

## R1 — Remove Creator Tool Buttons From Wall

Remove creator-tool launchers from the Wall sidebar.

Examples include:

```txt
Canvas
GlyphLab
ColorLab
```

These tools belong in Studio.

Do not leave duplicate launch points.

---

## R2 — Preserve Functionality

Removal from Wall must NOT remove functionality.

All existing tools must remain accessible.

Creator tools must continue to function through Studio.

---

## R3 — Restore Broadcast Surface

Wall should visually prioritize:

```txt
Channels
```

and

```txt
Views / Routes
```

Nothing else.

---

## R4 — No New Buttons

This build is prohibited from adding:

- buttons
    
- tabs
    
- drawers
    
- launchers
    
- menus
    
- sidebars
    

Net UI count must decrease.

---

## R5 — No New Creator Features

Do not implement:

```txt
Canvas features
Glyph features
Color features
Map features
```

This build is cleanup only.

---

## R6 — Audit Before Removal

Before removing any launcher:

Identify:

```txt
owner file
destination
replacement access path
```

No functionality may become orphaned.

---

# Acceptance Tests

## T1

Creator-tool buttons removed from Wall.

---

## T2

Wall remains operational.

---

## T3

Channels remain accessible.

---

## T4

Views remain accessible.

---

## T5

Routes remain accessible.

---

## T6

Canvas remains accessible.

---

## T7

GlyphLab remains accessible.

---

## T8

ColorLab remains accessible.

---

## T9

Studio remains accessible.

---

## T10

No new buttons added.

---

## T11

Net visible UI count decreases.

---

# Required Report

Provide:

## Removed

List all UI elements removed.

---

## Preserved

List all workflows preserved.

---

## Relocated

List all creator-tool access paths.

---

## Final UI Count

Before

After

---

# Success Criteria

The build is complete when:

```txt
Wall feels like a broadcast surface again.
Studio feels like the creator environment again.
No creator functionality is lost.
Visible UI is reduced.
```

Nothing more.