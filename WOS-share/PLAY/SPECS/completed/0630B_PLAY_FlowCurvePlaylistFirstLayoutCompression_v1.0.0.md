---
location: Specs
title: PLAY Flow Curve Playlist-First Layout Compression
date: 2026-06-30
status: implementation-spec
scope: "PLAY / Flow Curve UI / playlist-first layout / vertical compression"
target_executor: Claude
tags:
  - play
  - flow-curve
  - ui
  - playlist
  - layout
  - implementation
  - claude
---

# PLAY Flow Curve Playlist-First Layout Compression

## Purpose

Fix the remaining Flow Curve layout problem after 0630A.

0630A simplified the surface, but the layout still gives too much vertical space to the Flow Curve area and not enough priority to the playlist table.

The default Flow Curve view must become **playlist-first**:

```text
Flow Curve = control surface / overview
Playlist table = main working area
```

The current graph is taking roughly twice the vertical space it needs, and the empty space below the graph is wasting the area needed to see a full playlist.

---

## Current Problems

From the current screenshot:

```text
the Flow Curve region is too tall
there is a large empty band between the graph and playlist controls
playlist table still falls too low
full playlist is not visible in normal/fullscreen use
right-side tool stack is fine but should not force extra height
Import was removed too aggressively and should return inside the actions menu
```

---

## Required Fixes

## 1. Compress the Flow Curve Region

Reduce the vertical height of the Flow Curve area.

The graph should remain usable, but it should not dominate the screen.

Target:

```text
Flow Curve canvas height: compact / medium
Playlist table gets the recovered height
```

Suggested starting values:

```css
.flow-curve-stage {
  min-height: 220px;
  max-height: 300px;
}

.flow-curve-canvas-wrap {
  height: clamp(220px, 30vh, 300px);
}
```

Adjust to current CSS naming.

Acceptance:

```text
Flow Curve is still readable.
Flow Curve takes significantly less vertical space than current screenshot.
Playlist table starts higher.
More playlist rows are visible.
```

---

## 2. Remove Empty Band Under the Graph

There is wasted vertical space between the curve canvas and the playlist table/transport strip.

Required:

```text
reduce bottom padding/margin under graph
remove unnecessary spacer divs
tighten gap between curve area and table controls
do not create another separator bar
```

Acceptance:

```text
No large empty zone exists under the graph.
Playlist controls/table sit closer to the curve.
```

---

## 3. Playlist Table Gets Priority

The playlist table should be the main work surface.

Required:

```text
increase playlist table vertical area
show more rows by default
avoid hiding the playlist below the fold
keep table readable
```

Acceptance:

```text
At least all tracks in a 13-track playlist should be visible or nearly visible in a typical fullscreen browser.
```

---

## 4. Keep Flow Curve Tools Compact

The right-side tool stack should remain:

```text
FILL TIME
CURVE
M3U
FORM
SETTINGS
```

But it should not force the Flow Curve region to be taller.

Required:

```text
tool stack aligns with compact graph height
tool stack does not create excess vertical container height
tool labels remain accessible
```

---

## 5. Restore Import to Actions Menu

Import should not be a primary top-level button, but it should remain accessible.

Required:

```text
restore Import inside the actions menu / overflow menu / settings menu
do not place Import back as a main toolbar button
```

Acceptance:

```text
Import is reachable through the actions list.
Import is not visible as primary top-level chrome.
```

---

## 6. Keep Description Hidden

Do not re-add the playlist description to the default Flow Curve view.

Required:

```text
description stays hidden in default view
description remains accessible in profile/Form
```

---

## 7. Avoid New Visual Clutter

Do not solve the spacing problem by adding new panels, labels, bars, or separators.

Avoid:

```text
new toolbar row
new status strip
extra divider lines
extra instruction text
always-visible legend
always-visible axis labels
```

---

## Verification Checklist

Before reporting complete:

```text
[ ] App builds.
[ ] Flow Curve graph is shorter than current 0630A/0630A-hotfix layout.
[ ] Empty band under graph is removed or significantly reduced.
[ ] Playlist table begins higher.
[ ] More playlist rows are visible.
[ ] Right-side tool stack still works.
[ ] Import is reachable from actions/overflow/settings.
[ ] Import is not top-level visible.
[ ] Description remains hidden from default Flow Curve view.
[ ] Point select/delete still works.
[ ] Shift+Click point add still works.
[ ] Fill Time still works.
[ ] M3U export remains reachable.
```

---

## Explicit Non-Goals

Do not change:

```text
playlist assignment logic
warning logic
Fill Gap logic
node guardrails
StudioRich ownership logic
unknown metadata editing
scheduler
broadcast
WOS/WALL/MAPS
Colorlab
Canvas/Studio
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
- graph height compression
- empty band removal
- playlist table priority
- Import restored to actions menu

Verification:
- build result
- row visibility improvement
- screenshot/layout summary
- confirm Flow Curve behavior still works

Remaining blockers:
- list or none

Do not reopen:
- Playlist table gets priority over oversized curve canvas.
- Import belongs in actions/overflow, not primary toolbar.
- Description stays in profile/Form, not default Flow Curve view.
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0630B_PLAY_FlowCurvePlaylistFirstLayoutCompression_v1.0.0.md.

Work in the active PLAY source.

Primary goals:
1. Compress the Flow Curve region so it does not take twice the needed height.
2. Remove the wasted empty space under the graph.
3. Give vertical priority to the playlist table.
4. Keep the right-side Flow Curve tool stack compact.
5. Restore Import inside the actions/overflow/settings list, not as a primary toolbar button.
6. Keep the playlist description hidden in the default Flow Curve view.
7. Preserve all Flow Curve editing and playlist behavior.

Do not change assignment logic, warning logic, Fill Gap logic, library ownership, Scheduler, Broadcast, WOS/WALL/MAPS, Colorlab, or Canvas.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
