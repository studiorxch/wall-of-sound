# 0620F_PLAY_BroadcastHUDPolishAndCardSeparationPatch_v1.0.0_PATCH

## Patch Name

**PLAY Broadcast HUD Polish + Card Separation Patch**

## Version

`v1.0.0`

## Date

2026-06-21

## Status

Draft for implementation

---

# 1. Purpose

0620E completed the first **Now / Next / Up Next** queue rail for Broadcast HUD mode.

That confirms PLAY now has:

```text
Editor surface
Broadcast HUD surface
Broadcast Card surface
Now / Next queue awareness
```

0620F is a focused polish and boundary-setting patch.

It fixes a visible Broadcast HUD graph bug, removes redundant UI, and formalizes a critical presentation rule:

```text
Editor = graph-heavy
Broadcast HUD = graph-as-navigation
Broadcast Card = cinematic identity
```

The goal is to prevent PLAY’s broadcast surfaces from collapsing into one generic dashboard.

---

# 2. Current Build Chain

```text
0619A — multi-playlist workspace ✅
0619B — drag-to-playlist ✅
0619C — fill / regenerate controls ✅
0620A — integrity + playback safety ✅
0620B — playlist identity ✅
0620C — Broadcast HUD mode ✅
0620D — Broadcast Card / Bumper Preview ✅
0620E — Now / Next Queue Panel ✅
```

0620F should not add a large new feature.

This is a **presentation cleanup + visual system boundary patch**.

---

# 3. Problems To Fix

## Problem A — Hidden / clipped node on left edge of graph

A strange partial node appears at the far left of the graph area in Broadcast HUD screenshots.

Observed behavior:

```text
A partial circular marker appears outside or on the left edge of the graph canvas.
It looks like a hidden node or stale marker.
It is visible in user screenshots but not obvious in Claude preview.
```

Likely causes:

```text
1. First curve/track point is rendered before chart clipping is applied.
2. SVG circle radius extends outside plot bounds.
3. Current/playing marker is calculated from stale slot/index coordinates.
4. X coordinate is at/near 0 but marker radius overflows.
5. SVG overflow is visible in Broadcast HUD shell.
6. Logical curve bounds are wider than the visual graph plot area.
```

## Problem B — Redundant `← Editor` button

Broadcast HUD now has a top-level mode toggle:

```text
Flow-Curve / Broadcast HUD
```

The old HUD-local button:

```text
← Editor
```

is redundant and should be removed.

## Problem C — Broadcast Card should not carry graph language

The Broadcast Card / Bumper should not include or inherit the flow-curve graph as a main visual language.

The graph is functional in Editor and Broadcast HUD, but in title cards it reads as:

```text
spreadsheet
analytics dashboard
admin tool
Excel-like graph surface
```

Broadcast cards should move toward:

```text
cinematic title card
playlist identity
large typography
background image
minimal metadata
release/event bumper
```

---

# 4. Scope

## Included

### A. Graph Node Clipping / Bounds Fix

- Prevent partial out-of-bounds nodes from appearing at graph edges.
- Clamp node render positions or apply SVG clipping.
- Ensure current/playing markers do not render outside plot area.
- Test in both Broadcast HUD and Flow-Curve Editor.

### B. Remove Redundant Editor Button

- Remove `← Editor` button from Broadcast HUD header.
- Use only the top-level mode toggle for returning to editor mode.
- Ensure no mode-switching path is lost.

### C. Broadcast Card Separation Rule

- Ensure Broadcast Card / Bumper Preview does not display flow curve by default.
- Prevent flow-curve chart components from leaking into card layouts.
- Define card layout as cinematic identity surface, not graph surface.

### D. Title-Card-Oriented Styling Guidance

- Strengthen card typography/background/metadata hierarchy.
- Keep card visual direction distinct from Broadcast HUD.

### E. Minor Broadcast HUD Polish

- Confirm queue rail + graph layout still fits without overflow.
- Confirm no scrollbars or layout drift in OBS-style capture.
- Confirm HUD accent styling remains coherent.

---

# 5. Non-Goals

Do not implement in this patch:

- audio-reactive visuals
- waveform display
- scheduler
- transition editor
- new card animation system
- PNG/video export
- OBS API integration
- new title-card templates beyond minor separation/polish
- full WOS map integration changes
- new playback features
- new queue editing

This patch is about polish, clipping, and visual separation.

---

# 6. Product Rule

Lock in this separation:

```text
Flow-Curve Editor
= graph-heavy playlist engineering surface

Broadcast HUD
= live playback/navigation HUD; graph is allowed because it functions as route/navigation

Broadcast Card / Bumper
= cinematic identity card; graph is not shown by default
```

Or more compactly:

```text
Editor = graph-heavy
Broadcast HUD = graph-as-navigation
Broadcast Card = cinematic identity
```

---

# 7. Graph Node Fix

## Required Behavior

No curve point, track point, playing marker, warning marker, or highlight ring should visibly leak outside the graph plotting area.

This includes:

- left edge
- right edge
- top edge
- bottom edge
- Broadcast HUD read-only mode
- Flow-Curve Editor mode

## Acceptable Fix Options

### Option 1 — SVG Clip Path

Apply an SVG `clipPath` to the plot region.

Example concept:

```tsx
<defs>
  <clipPath id="flowCurvePlotClip">
    <rect x={plotX} y={plotY} width={plotWidth} height={plotHeight} />
  </clipPath>
</defs>

<g clipPath="url(#flowCurvePlotClip)">
  {/* curve line, track nodes, playing marker, warning markers */}
</g>
```

### Option 2 — Position Clamp

Clamp rendered marker coordinates.

Concept:

```ts
const markerRadius = 8;

const clampedX = clamp(
  x,
  plotX + markerRadius,
  plotX + plotWidth - markerRadius
);

const clampedY = clamp(
  y,
  plotY + markerRadius,
  plotY + plotHeight - markerRadius
);
```

### Option 3 — Hide Out-of-Bounds Markers

Before rendering:

```ts
if (x < plotX || x > plotX + plotWidth) return null;
if (y < plotY || y > plotY + plotHeight) return null;
```

This is acceptable only if it does not hide legitimate edge points that should remain visible.

## Preferred Approach

Use SVG clipping plus safe coordinate bounds.

Clipping is best for visual containment. Clamping is useful for interactive handles.

## Regression Risk

Do not break:

- point dragging in Flow-Curve Editor
- readOnly protection in Broadcast HUD
- current playing marker
- warning rings
- locked markers
- hover/focus behavior if present

---

# 8. Specific Bug Acceptance Test

Use a playlist with first track / first curve point near the left edge.

Test:

```text
1. Open Flow-Curve Editor.
2. Confirm no partial node leaks outside graph area.
3. Enter Broadcast HUD.
4. Confirm no partial node leaks outside left graph edge.
5. Resize browser window.
6. Confirm no node appears outside graph bounds.
7. Toggle playback.
8. Confirm playing marker remains inside graph bounds.
```

Expected:

```text
All graph markers are contained inside the plot area.
```

---

# 9. Remove Redundant `← Editor` Button

## Required Behavior

Remove from Broadcast HUD:

```text
← Editor
```

Because mode switching is now handled by:

```text
Flow-Curve / Broadcast HUD
```

## Requirements

- Top-level mode toggle remains visible and usable.
- User can return from Broadcast HUD to Flow-Curve Editor.
- No duplicate editor-exit controls.
- No loss of keyboard accessibility if existing button had focus behavior.

## Acceptance Test

```text
1. Enter Broadcast HUD.
2. Confirm old ← Editor button is gone.
3. Use top mode toggle to return to Flow-Curve.
4. Confirm editor returns correctly.
```

---

# 10. Broadcast Card Separation

## Required Behavior

Broadcast Card / Bumper Preview should not show the flow curve by default.

It should use:

```text
background image
cover image / monogram
large title typography
variant label
description / mood line
metadata
accent color
small PLAY / WOS branding
```

It should not use:

```text
full graph
flow curve chart
track nodes
grid-heavy analytics surface
spreadsheet-like composition
```

## Visual Reference Direction

The card should move toward title-card logic:

```text
large typography
environmental background
strong identity
minimal supporting credits/metadata
cinematic frame
```

Not:

```text
chart panel
data dashboard
playlist analytics view
```

## Optional Micro-Graphic

A tiny abstract route/energy motif is allowed only if subtle.

Allowed:

```text
small decorative signal line
thin route glyph
small pulse mark
minimal metadata bar
```

Not allowed:

```text
full flow graph with axes
track node chart
large plotted data surface
```

---

# 11. Broadcast Card Layout Rule

Add/confirm a rule in code or comments:

```text
BroadcastCardPreview must not import or render FlowCurveCanvas.
```

If `BroadcastCardPreview` currently imports graph code, remove it.

If future templates are planned, default templates should remain graph-free.

Recommended comment:

```ts
// Broadcast cards are identity/title surfaces.
// Do not render FlowCurveCanvas here by default.
// Flow graphs belong in Editor and Broadcast HUD modes.
```

---

# 12. Title Card Hierarchy

Recommended card hierarchy:

```text
1. Variant label
2. Playlist title
3. Cover / monogram or title lockup
4. Description / mood phrase
5. Mood tags
6. Track count / duration
7. Small PLAY / WOS branding
```

Avoid excessive technical details.

Good metadata:

```text
15 tracks · 1h53m
LIVE SET
NOW ENTERING
urban · night · transit
```

Bad metadata for title card:

```text
BPM table
Camelot keys
full flow curve
slot warnings
graph axes
duration math
```

---

# 13. Broadcast HUD Polish

## Queue Rail

Confirm 0620E queue rail:

- remains 220px or responsive equivalent
- does not squeeze graph too aggressively
- does not create horizontal overflow
- remains readable in fullscreen browser capture

## Graph Area

Confirm graph is:

- left/main content
- visually contained
- not clipped awkwardly except intentional plot clipping
- not overcrowded by queue rail

## Transport Strip

Confirm transport:

- still visible
- not duplicated
- no old editor button interference
- seek bar remains readable

---

# 14. OBS / Browser Capture Checks

0620F should verify:

```text
no accidental scrollbars
no off-canvas node leak
no duplicate exit/editor buttons
no visible debug/control clutter
Broadcast Card fullscreen remains 16:9
Broadcast HUD remains stable in full browser window
```

---

# 15. Expected Files To Touch

Likely files:

```text
src/ui/FlowCurveCanvas.tsx
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastCardPreview.tsx
src/styles.css
```

Possible files:

```text
src/ui/TopBar.tsx
src/ui/NowNextQueuePanel.tsx
src/broadcastCardTypes.ts
```

Use actual project paths.

---

# 16. Acceptance Criteria

## Graph Node Fix

- No partial node appears at the left graph edge.
- No marker leaks outside graph plot bounds.
- Fix works in Broadcast HUD.
- Fix works in Flow-Curve Editor.
- Window resizing does not reintroduce leak.
- Playback marker remains visible and correct.

## Remove Redundant Button

- `← Editor` button is removed from Broadcast HUD.
- Top mode toggle remains the single route back to editor.
- User can still switch modes safely.

## Broadcast Card Separation

- Broadcast Card does not render FlowCurveCanvas by default.
- Broadcast Card does not show full graph/axes/nodes.
- Card remains identity/title oriented.
- Card uses cover/background/title/tags/stats.
- Fullscreen OBS overlay remains 16:9.

## No Regressions

- Broadcast HUD still works.
- Queue rail still works.
- Now / Next updates still work.
- Broadcast Card Preview still works.
- Flow-Curve Editor still supports editing.
- Broadcast HUD readOnly remains protected.
- Playback still works.
- Identity panel still works.

---

# 17. Manual Test Plan

## Test 1 — Hidden Left Node

1. Open playlist with first track near left edge.
2. Enter Broadcast HUD.
3. Inspect left graph boundary.
4. Resize browser.
5. Play first few tracks.

Expected:

```text
No partial hidden node appears outside the graph area.
```

## Test 2 — Editor Graph Regression

1. Switch to Flow-Curve Editor.
2. Drag curve nodes.
3. Add/remove point if supported.
4. Confirm graph still functions.

Expected:

```text
Flow-Curve editing still works.
```

## Test 3 — Remove Old Editor Button

1. Enter Broadcast HUD.
2. Confirm `← Editor` is gone.
3. Use top toggle to return to Flow-Curve.

Expected:

```text
No redundant editor button remains.
```

## Test 4 — Broadcast Card No Graph

1. Open Identity panel.
2. Open Broadcast Preview.
3. Test all variants.
4. Confirm no flow graph appears.

Expected:

```text
Broadcast Card reads as title card, not spreadsheet/dashboard.
```

## Test 5 — Fullscreen Card

1. Open Broadcast Card fullscreen.
2. Confirm 16:9 composition.
3. Confirm no graph, no scrollbars, no dashboard feel.

Expected:

```text
Card is cinematic identity surface.
```

## Test 6 — OBS / Browser Capture

1. Open Broadcast HUD fullscreen.
2. Open OBS/window capture or browser capture.
3. Confirm stable layout.
4. Confirm queue rail and graph fit.

Expected:

```text
HUD is capture-safe after polish.
```

---

# 18. Implementation Order

Recommended:

```text
1. Inspect FlowCurveCanvas marker render bounds.
2. Add clipPath or coordinate clamp.
3. Test Broadcast HUD graph.
4. Test Flow-Curve Editor interactions.
5. Remove old ← Editor button.
6. Confirm top mode toggle is sufficient.
7. Verify BroadcastCardPreview does not render graph.
8. Add/confirm code comment separating card vs graph surfaces.
9. Adjust CSS if graph/card overflow appears.
10. Run manual tests.
```

---

# 19. Claude / Codex Notes

Keep this patch small.

Do not add new features.

Do not build audio reactivity here.

Do not redesign the entire HUD.

Do not build scheduler.

The main objective is to fix the visual artifact and protect the product language separation.

The important boundary is:

```text
Graph belongs to Editor/HUD.
Title card belongs to cinematic identity.
```

---

# 20. Product Principle

PLAY now has three surfaces:

```text
Editor Surface
Broadcast HUD Surface
Broadcast Card Surface
```

Each surface needs its own visual logic.

0620F protects that separation.

```text
Do not make every PLAY surface look like an analytics dashboard.
```
