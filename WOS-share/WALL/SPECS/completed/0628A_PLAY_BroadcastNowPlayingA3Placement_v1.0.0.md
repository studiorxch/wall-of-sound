# 0628A_PLAY_BroadcastNowPlayingA3Placement_v1.0.0

## Project

**Project:** PLAY  
**Feature Area:** Broadcast Composition / Now Playing Overlay  
**Document Type:** Parent-Frame Layout Spec  
**Version:** v1.0.0  
**Status:** Active Implementation Spec  
**Sequence:** 0628A  
**Depends On:**  
- `0627J_WOS_OrbitalBroadcastCompositionPass_v1.0.0.md`

---

## Purpose

Move or verify the parent-frame song/title block into the **A3 broadcast zone** for Orbital Earth composition.

This spec exists because `0627J` confirmed that WALL does not own the now-playing/title block. The song/title overlay lives in the PLAY parent frame, likely in:

```text
BroadcastRouteCameraInstrumentation.tsx
```

Therefore, the A3 placement must be handled in PLAY, not WALL.

The goal is:

```text
WALL owns the Earth frame.
PLAY owns the now-playing/title identity layer.
Together they compose as one OBS-safe broadcast view.
```

---

## Scope

This is a PLAY-side broadcast layout task.

Allowed work:

```text
now-playing/title block placement
A3 safe-zone positioning
broadcast overlay CSS
parent-frame composition report
overlap detection with WALL iframe
OBS 16:9 readability checks
```

Not allowed:

```text
WALL runtime changes
Orbital camera changes
Moon changes
transport button changes
Orbital FX changes
presentation router changes
Mapbox style changes
legacy visualizer changes
```

---

## Source Finding From 0627J

`0627J` found:

```text
No #top-bar in WALL — top bar is PLAY-side.
Song/title block does not exist in WALL.
Song/title block lives in the PLAY parent frame.
Likely file: BroadcastRouteCameraInstrumentation.tsx.
A3 placement is therefore a PLAY composition task.
```

This spec accepts that ownership split.

---

## Broadcast Zone Target

Use the same composition zone model established in `0627J`:

```text
A1 — top-left safe zone
A2 — top-center safe zone
A3 — top-right safe zone
B1 — middle-left visual zone
B2 — center Earth zone
B3 — middle-right visual zone
C1 — lower-left control/status zone
C2 — lower-center caption/status zone
C3 — lower-right secondary controls zone
```

The now-playing/title block target is:

```text
A3 — top-right safe zone
```

---

## Required Placement

The now-playing block should be positioned:

```text
top-right
inside the parent PLAY frame
above the WALL iframe
not inside WALL
not inside Mapbox
not owned by OrbitalEarthMode
```

Recommended layout:

```css
position: fixed;
top: 32px;
right: 32px;
max-width: 360px;
z-index: above WALL iframe;
pointer-events: none;
```

If top bar remains visible, use:

```css
top: 72px;
```

If top bar is hidden in broadcast mode, use:

```css
top: 32px;
```

---

## Required Behavior

The now-playing/title block must:

```text
remain readable at 1920x1080
remain readable at 1280x720
avoid overlapping transport controls
avoid overlapping top bar
avoid overlapping WALL iframe authoring chrome
avoid covering the center of Earth
not alter WALL runtime state
not trigger transport state changes
not create scrollbars
```

---

## Broadcast Mode Behavior

If PLAY has a broadcast mode, route A3 placement through it.

Preferred class pattern:

```text
body.play-broadcast-active
body.wos-orbital-earth-active
body.play-wall-embed-active
```

Use existing state/class names if already available. Do not create a large new state system.

Allowed behavior:

```text
normal PLAY mode: existing layout may remain
broadcast Orbital mode: now-playing block moves to A3
```

Forbidden behavior:

```text
now-playing block always moves in all contexts if that breaks normal PLAY
now-playing block becomes draggable
now-playing block creates new controls
now-playing block sends commands to WALL
```

---

## A3 Layout Rules

### Position

Target:

```text
right: 32px
top: 32px or 72px depending on top bar visibility
```

### Width

Target:

```text
max-width: 360px
```

For smaller screens:

```text
max-width: min(360px, calc(100vw - 64px))
```

### Alignment

Preferred:

```text
text-align: right
```

### Pointer Behavior

Preferred:

```css
pointer-events: none;
```

The overlay should not block map/orbital interaction unless an explicit interactive state already exists.

---

## Top Bar Relationship

If top bar is visible:

```text
now-playing block must sit below it
```

If top bar is hidden:

```text
now-playing block uses A3 top safe margin
```

Do not solve top bar conflicts by changing WALL.

Top bar is PLAY-owned.

---

## WALL Iframe Relationship

The now-playing block should visually overlay the WALL iframe, but must not mutate the WALL runtime.

Allowed:

```text
parent-frame CSS overlay above iframe
read-only measurement of iframe bounds
composition report comparing overlay rects
```

Forbidden:

```text
editing OrbitalEarthMode for now-playing
moving WALL HUD for PLAY overlay
changing Mapbox camera to fit title block
calling Moon/FX/transition code
```

---

## Required Diagnostic Report

Add or confirm a parent-frame report if practical:

```js
window.PLAY?.BroadcastComposition?.getNowPlayingA3Report?.()
```

or equivalent existing namespace.

Minimum report shape:

```js
{
  timestamp,
  viewport: {
    width,
    height,
    aspectRatio
  },
  nowPlaying: {
    exists,
    visible,
    rect,
    zone: "A3",
    textReadable,
    pointerEvents
  },
  topBar: {
    exists,
    visible,
    rect
  },
  wallFrame: {
    exists,
    visible,
    rect
  },
  overlaps: {
    nowPlayingOverTopBar,
    nowPlayingOverTransport,
    nowPlayingOverEarthCenter,
    nowPlayingOutsideViewport
  },
  mode: {
    broadcastActive,
    orbitalEarthActive,
    wallEmbedActive
  },
  passed,
  blockers: []
}
```

Do not add this if it requires broad architecture changes. A small DOM-based report is enough.

---

## Search / Audit Requirements

Search PLAY-side code for:

```text
BroadcastRouteCameraInstrumentation
now playing
NowPlaying
track title
song title
playlist title
broadcast
OBS
top bar
TopBar
WALL iframe
iframe
wos-embed
wall-embed
z-index
position: fixed
position: absolute
pointer-events
```

Report the owner of:

```text
now-playing/title block
top bar
WALL iframe container
broadcast mode class/state
transport or route camera instrumentation overlay
```

---

## QA Procedure

### Test A — Find Owner

Confirm the file/component that owns the now-playing/title block.

Expected:

```text
Owner identified.
WALL is not edited for now-playing placement.
```

---

### Test B — A3 Placement

Enter the broadcast Orbital composition state.

Expected:

```text
now-playing block appears in A3
top-right safe zone
inside viewport
readable
not overlapping top bar
```

---

### Test C — WALL Runtime Isolation

Run WALL diagnostics after PLAY layout change:

```js
SBE.OrbitalEarthMode.getBroadcastCompositionReport?.()
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Expected:

```text
WALL runtime reports still pass.
No Orbital camera values changed.
No Moon state changed.
No transport state changed.
```

---

### Test D — 16:9 OBS Readability

Check:

```text
1920x1080
1280x720
```

Expected:

```text
now-playing readable
Earth readable
no top/right clipping
no unwanted scrollbars
no authoring chrome overlap
```

---

### Test E — Normal PLAY Mode

Exit broadcast/orbital mode.

Expected:

```text
normal PLAY layout is not broken
now-playing does not force A3 if normal mode requires another layout
```

---

## Acceptance Criteria

This spec is complete when:

1. Now-playing/title owner is confirmed in PLAY.
2. WALL is not edited for title/song placement.
3. Now-playing/title block is positioned or verified in A3.
4. Block is readable at 1920x1080.
5. Block is readable at 1280x720.
6. Block does not overlap the top bar.
7. Block does not overlap transport controls.
8. Block does not cover Earth center.
9. Block does not mutate WALL runtime.
10. Orbital diagnostics still pass.
11. No camera preset values are changed.
12. No Moon code is touched.
13. No Orbital FX are added.
14. No transport buttons are added.
15. No presentation controls are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Now-playing owner:
Top bar owner:
WALL iframe owner:
Broadcast mode state/class used:
A3 placement rule:
Overlap report:
1920x1080 check:
1280x720 check:
WALL runtime diagnostics after PLAY change:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No WALL runtime changes.
No Orbital camera changes.
No Moon changes.
No Orbital FX added.
No transport buttons added.
No presentation controls added.
```

---

## Stop Conditions

Stop and report if:

```text
now-playing owner cannot be found
top bar owner cannot be found
A3 placement requires changing WALL runtime
A3 placement requires changing Orbital camera values
normal PLAY layout breaks
overlay blocks pointer interactions unexpectedly
WALL iframe sizing changes unexpectedly
```

Do not hide the problem inside WALL CSS.

---

## Final Principle

The Earth frame is WALL.

The song/title identity layer is PLAY.

A clean broadcast view requires both layers to respect the same composition grid without crossing ownership boundaries.

## Implementation Guide

- **Where:** Audit `BroadcastRouteCameraInstrumentation.tsx` and nearby PLAY broadcast overlay/iframe/top-bar components.
- **What:** Move or verify the now-playing/title block into A3 using parent-frame layout only.
- **Expect:** OBS composition reads correctly with WALL Orbital Earth underneath and PLAY now-playing identity in the top-right safe zone.
