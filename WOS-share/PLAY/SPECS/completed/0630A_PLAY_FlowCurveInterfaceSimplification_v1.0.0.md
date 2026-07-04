---
location: Specs
title: PLAY Flow Curve Interface Simplification + Playlist Focus
date: 2026-06-30
status: implementation-spec
scope: "PLAY / Flow Curve UI / playlist workspace / visual simplification"
target_executor: Claude
tags:
  - play
  - flow-curve
  - ui
  - playlist
  - implementation
  - claude
  - interface-cleanup
---

# PLAY Flow Curve Interface Simplification + Playlist Focus

## Purpose

Refine the PLAY Flow Curve interface so the user can clearly see and edit:

1. the playlist,
2. the Flow Curve,
3. the main section toggles,
4. essential playlist controls,

without redundant buttons, permanent instructional clutter, legends, chart scales, and project-level actions crowding the screen.

This is a UI simplification pass. Do not change playlist assignment logic, audio playback logic, WOS/WALL/MAPS, OBS, Scheduler behavior, or Colorlab work in this pass.

---

## Current Problem

The current Flow Curve view contains too many visible controls and secondary details at once.

The UI currently feels crowded because of:

```text
redundant project buttons
import/export project controls
create library group button
identity button
persistent instructions
visible chart legend
visible chart scale labels
too many small details around the graph
mixed tool areas
not enough vertical room for the song list
```

The goal is to create a cleaner working surface with stronger separation between:

```text
playlist identity/profile
flow curve tools
section navigation
playlist table
secondary utilities
```

---

## Target UX Principle

The default view should prioritize:

```text
playlist name / description
Flow Curve
song list
section toggles
minimal tool access
```

The default view should hide or move:

```text
project import/export
library group creation
identity button
chart legend
chart scales
always-visible instructions
secondary diagnostics
rare tools
```

The user should see more songs below without losing access to tools when needed.

---

## Primary Layout Direction

Use the cleaner structure shown in the user mockup:

```text
Top left:
- playlist title
- playlist description
- track count / duration / target / missing time

Top right:
- section toggles:
  FLOWCURVE
  SCHEDULER
  BROADCAST

Main:
- large Flow Curve canvas

Right side:
- vertical Flow Curve tools:
  Fill Time
  Curve
  M3U
  Form
  Settings

Bottom:
- playlist table with more visible rows

Left:
- playlist list / library navigation
```

---

## Required UI Changes

## 1. Remove or Move Redundant Project Actions

Remove from the default visible toolbar:

```text
Import Project
Export Project JSON
Project not exported yet
Create Library Group
Identity
```

These should not sit in the primary Flow Curve work surface.

### Required Behavior

- `Import Project` and `Export Project JSON` should move into a secondary menu, likely `Settings` or `Project`.
- `Create Library Group` should move to Library management, not the Flow Curve toolbar.
- `Identity` should be removed as a separate button.

Acceptance:

```text
Default Flow Curve view no longer shows Import Project, Export Project JSON, Project not exported yet, Create Library Group, or Identity as top-level buttons.
```

---

## 2. Playlist Title Opens Playlist Profile

The playlist title should become the profile edit entrypoint.

Current issue:

```text
Identity button is redundant.
```

Required behavior:

```text
Click playlist title or cover/title block → open playlist profile editor.
```

Playlist profile editor should allow editing:

```text
playlist title
description
cover image
target duration
created/updated metadata if editable
identity card fields if available
```

Acceptance:

```text
Identity button is gone.
Playlist name/title block opens playlist edit/profile view.
```

---

## 3. Move Section Toggles to Top Right

Section toggles should be clear and separated from Flow Curve editing tools.

Required top-right toggles:

```text
FLOWCURVE
SCHEDULER
BROADCAST
```

Acceptance:

```text
Section toggles are top-right.
They do not compete with playlist actions or curve tools.
```

---

## 4. Separate Flow Curve Tools

Move Flow Curve tools to a compact right-side tool stack.

Recommended visible tools:

```text
Fill Time
Curve
M3U
Form
Settings
```

These replace the crowded toolbar.

Mapping:

```text
Fill Missing Time / Fill Gap → Fill Time
Regenerate From Curve / Curve Tools → Curve
Export M3U → M3U
playlist/profile metadata tools → Form
app/view/project controls → Settings
```

Acceptance:

```text
Primary Flow Curve actions are grouped in a clear tool area.
Toolbar clutter is reduced.
```

---

## 5. Remove Persistent Instruction Text

The instruction text should not be always visible:

```text
Click to add point · Click point to select · Delete/Backspace to remove · Right-click to remove
```

Required behavior:

```text
hide by default
show only in help / tooltip / ? / onboarding / first-use hint
```

Acceptance:

```text
Instruction text is not permanently visible above the chart.
User can still access help if needed.
```

---

## 6. Hide Chart Legend by Default

The legend currently consumes visual space and adds clutter.

Hide by default:

```text
Flow Curve
Track
Playing
Locked
Weak
Critical
```

Required behavior:

```text
legend hidden by default
legend available via chart settings/help/toggle
```

Acceptance:

```text
Default Flow Curve chart has no permanent legend.
Legend can be shown when needed.
```

---

## 7. Hide Chart Scale Details by Default

The chart scale and axis details are useful sometimes, but not always.

Hide or reduce by default:

```text
Y-axis numeric scale
Energy label if visually redundant
Time label if visually redundant
heavy axis details
```

Required behavior:

```text
default = clean chart
settings toggle = show chart guides / scale / legend
```

Do not remove grid structure entirely if it helps curve editing. The issue is permanent clutter, not every visual guide.

Acceptance:

```text
Default chart is cleaner.
Scale/legend/guides can be restored from settings.
```

---

## 8. Increase Song List Space

The cleanup should give more room to the playlist table.

Required:

```text
reduce vertical height of top controls
remove redundant toolbar rows
avoid unnecessary canvas padding
allow more songs visible below
```

Acceptance:

```text
More playlist rows are visible at once than before.
Playlist table becomes a clearer focus area.
```

---

## 9. Preserve Existing Flow Curve Behavior

Do not regress recent fixes.

Must preserve:

```text
point selection
selected point highlight
Delete/Backspace point removal
Escape deselect
right-click removal
intentional node creation guardrails
Fill Gap/fill time fixes
node max guardrails
warning threshold improvements
candidate debug output if present
StudioRich library ownership if implemented
unknown metadata editing if implemented
```

Acceptance:

```text
The UI is cleaner without breaking Flow Curve editing or playlist generation.
```

---

## 10. Keep Advanced/Secondary Actions Available

This is not a deletion of capability. It is a visibility cleanup.

Move secondary actions into:

```text
Settings
Project menu
Library menu
Profile editor
tool dropdown
hidden advanced panel
```

Secondary actions include:

```text
Import Project
Export Project JSON
Create Library Group
show legend
show chart scale
show debug diagnostics
advanced curve tools
```

Acceptance:

```text
Advanced actions are still reachable but no longer crowd the default view.
```

---

## Visual Acceptance Criteria

The default Flow Curve view should feel closer to the provided simplified mockup:

```text
clear playlist header
large curve
fewer visible buttons
right-side tool stack
top-right section toggles
hidden instructions
hidden legend/scale by default
more visible song rows
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Default Flow Curve view opens cleanly.
[ ] Import Project is no longer top-level visible.
[ ] Export Project JSON is no longer top-level visible.
[ ] Create Library Group is no longer top-level visible.
[ ] Identity button is removed.
[ ] Clicking playlist title opens profile/editor.
[ ] FLOWCURVE / SCHEDULER / BROADCAST toggles are top-right.
[ ] Flow Curve tools are separated from section toggles.
[ ] Instruction text is hidden by default.
[ ] Legend is hidden by default.
[ ] Chart scale/details are reduced or toggleable.
[ ] More playlist rows are visible.
[ ] Point select/delete still works.
[ ] Fill Time / Fill Gap still works.
[ ] M3U export is still reachable.
[ ] Settings/tool menus still expose hidden advanced features where needed.
```

---

## Explicit Non-Goals

Do not implement:

```text
audio playback
waveform rendering
beatgrid analysis
phrase analysis
transition timing
OBS overlay
custom mixer
WOS/WALL/MAPS changes
Colorlab palette system
event scheduler redesign
Canvas/Studio changes
new playlist assignment algorithm
```

---

## Claude Completion Report Required

When complete, report:

```text
Status: complete / partial / blocked

Files changed:
- path
- path

What changed:
- toolbar simplification
- title/profile behavior
- section toggle placement
- right-side Flow Curve tools
- hidden instructions/legend/scales
- playlist table space improvement

Verification:
- build result
- screenshot or description of default layout
- confirm hidden actions remain accessible
- confirm Flow Curve edit behavior still works

Remaining blockers:
- list or none

Do not reopen:
- Default Flow Curve view should stay playlist-first and visually calm.
- Project-level actions should not return to the primary toolbar.
- Identity editing belongs to the playlist title/profile entrypoint.
- Legend/scale/instructions should be optional, not permanent clutter.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0630A_PLAY_FlowCurveInterfaceSimplification_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Simplify the Flow Curve default view.
2. Remove redundant top-level project actions from the primary toolbar.
3. Make playlist title/profile block open the playlist profile editor; remove the Identity button.
4. Move FLOWCURVE / SCHEDULER / BROADCAST toggles to the top right.
5. Move Flow Curve tools into a compact separate tool area.
6. Hide persistent instruction text by default.
7. Hide chart legend and scale details by default, with optional access through settings/help.
8. Increase visible playlist table space.
9. Preserve all Flow Curve editing and playlist generation behavior.

Do not add playback, waveform, mixer, OBS, WOS, WALL, Scheduler redesign, Colorlab, or Canvas work.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
