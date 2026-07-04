# 0627J_WOS_OrbitalBroadcastCompositionPass_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth / Broadcast HUD  
**Document Type:** Broadcast Composition Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** J  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`
- `0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0.md`
- `0627E_WOS_OrbitalRuntimeOwnershipCleanup_v1.0.0.md`
- `0627F_WOS_OrbitalLegacyPathQuarantine_v1.0.0.md`
- `0627G_WOS_OrbitalMapTransitionCleanup_v1.0.0.md`
- `0627H_WOS_OrbitalFxReintroductionPass_v1.0.0.md`
- `0627I_WOS_MoonGateRevalidationAfterOrbitalCleanup_v1.0.0.md`

---

## Purpose

Tune Orbital Earth for broadcast composition after the runtime recovery chain is stable.

This spec addresses framing, HUD placement, overlap, safe zones, and OBS readability only.

It does not add new runtime features, Moon features, transport controls, presentation modes, or Orbital FX.

The goal is:

```text
Orbital Earth is stable enough to show.
Now it must compose well on screen.
```

---

## Active Scope Lock

The recovery lock remains active.

Do not add:

```text
new Orbital FX
new Moon visuals
new presentation controls
new transport buttons
new visual modes
new architecture systems
new playlist systems
new data systems
```

Allowed work:

```text
broadcast layout tuning
safe-zone correction
HUD overlap cleanup
song/title block placement
control visibility rules
OBS framing checks
camera preset selection for broadcast
diagnostic composition report
```

---

## Current Problem

Runtime recovery fixed the core Orbital path:

```text
Mapbox Earth
Clean Earth
camera framing
ownership
legacy quarantine
transition cleanup
controlled FX
Moon gate
```

The remaining issue is broadcast composition:

```text
top bar / tab bar may occupy broadcast space
song/title block may overlap controls
transport controls may interfere with the image
Earth may be too centered, too small, or under UI
HUD may not respect safe zones
OBS capture may show authoring controls that should be hidden
```

This spec establishes a clean broadcast layout without changing the recovered runtime path.

---

## Composition Principle

Orbital broadcast mode should prioritize:

```text
1. Earth readability
2. song/title identity
3. minimal transport awareness
4. WOS brand presence
5. no unnecessary authoring chrome
```

Broadcast composition is not the same as full authoring UI.

---

## Required Broadcast Zones

Use a simple screen-zone model:

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

Primary Earth should occupy:

```text
B2 with controlled bleed into B1/B3
```

Song/title block should prefer:

```text
A3
```

Transport controls should prefer:

```text
C1 or C3
```

Authoring/debug controls should not appear in broadcast view unless explicitly enabled.

---

## Required Layout Decisions

### Top Bar

The top bar must have a defined broadcast behavior.

Allowed options:

```text
hidden during tabbed/broadcast capture
collapsed to minimal WOS mark
visible only in authoring mode
```

Forbidden:

```text
top bar overlaps Earth
top bar pushes title block into controls
top bar returns hidden UI buttons unexpectedly
top bar changes transport ownership
```

If top bar hiding causes left bar or UI buttons to return, stop and report the ownership conflict.

---

### Title / Song Block

The title/song block should move to:

```text
A3
```

Constraints:

```text
does not overlap Orbital tabs
does not overlap transport controls
does not overlap Earth center
remains readable on dark/space background
can survive 16:9 OBS capture
```

Recommended behavior:

```text
position: top-right
max-width: 360px
right safe padding: 32px
top safe padding: 32px if top bar hidden
top safe padding: 72px if top bar visible
```

---

### Transport Controls

Transport controls should remain usable, but not dominate broadcast composition.

Allowed:

```text
bottom rail
small tabbed control deck
hidden in pure OBS mode
```

Forbidden:

```text
overlap with title/song block
overlap with main Earth center
state changes caused by layout patches
```

Do not add or remove transport buttons in this spec.

---

### Left Bar / UI Buttons

If the left bar or UI buttons return when the top bar is hidden, treat that as a regression.

Required behavior:

```text
broadcast chrome hidden means hidden
authoring chrome visible means intentional
```

Do not solve this by deleting controls. Solve by clarifying mode-specific visibility.

---

### Earth Framing

The recovered `readable_orbit` camera remains default unless broadcast QA proves the need for a separate existing preset.

Allowed:

```text
use existing broadcast_orbit preset
select broadcast_orbit only for explicit broadcast composition test
```

Forbidden:

```text
change recovered readable_orbit values
add new camera modes
hide Earth behind UI
crop Earth without explicit broadcast reason
```

---

## Required Diagnostic API

Add or confirm a small report if practical:

```js
SBE.OrbitalEarthMode.getBroadcastCompositionReport?.()
```

Acceptable owner alternative:

```js
SBE.WosBroadcastHud?.getCompositionReport?.()
```

Minimum report shape:

```js
{
  timestamp,
  viewport: {
    width,
    height,
    aspectRatio
  },
  zones: {
    earthZone,
    titleSongZone,
    transportZone,
    topBarZone
  },
  elements: {
    topBar: { exists, visible, rect },
    leftBar: { exists, visible, rect },
    titleSongBlock: { exists, visible, rect },
    transportDeck: { exists, visible, rect },
    mapCanvas: { exists, visible, rect }
  },
  overlaps: {
    titleOverTransport,
    titleOverTopBar,
    titleOverEarthCenter,
    controlsOverEarthCenter,
    leftBarUnexpectedVisible
  },
  activeMode: {
    orbitalEarthActive,
    broadcastModeActive,
    authoringChromeVisible
  },
  passed,
  blockers: []
}
```

Do not add this if it requires a new architecture layer.

---

## Files Likely in Scope

Likely files:

```text
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/orbital/OrbitalHudAdapter.js
wall/systems/orbital/OrbitalFxPanel.js
wall/systems/presentation/traversalControlDeck.js
wall/index.html
wall/styles or inline HUD CSS
```

Only edit files that directly own the visible broadcast composition issue.

Do not edit:

```text
Moon files
PLAY bridge files
presentation router files
runtime transition files
camera preset values
legacy visualizer presets
```

unless the report proves they are causing the broadcast layout issue.

---

## Search / Audit Requirements

Search for:

```text
top bar
TopBar
wos-top
wos-nav
wos-embed
broadcast
OBS
song
title
track
playlist
now playing
transport
traversal
left rail
leftbar
left-bar
hud
orbital hud
z-index
position: fixed
position: absolute
pointer-events
```

Report each visible HUD/control layer that can appear during Orbital Earth.

---

## QA Procedure

### Test A — Orbital Broadcast Default

1. Enter Orbital Earth.
2. Capture current viewport at 16:9.
3. Run existing runtime reports:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Expected:

```text
runtime reports pass
Earth readable
no legacy visualizer
no transition residue
```

---

### Test B — Composition Report

Run:

```js
SBE.OrbitalEarthMode.getBroadcastCompositionReport?.()
```

or equivalent.

Expected:

```text
passed: true
blockers: []
title/song block does not overlap controls
top bar does not interfere
left bar not unexpectedly visible
transport controls not over Earth center
```

---

### Test C — Top Bar Hidden State

With top bar hidden:

Expected:

```text
left bar does not return unexpectedly
UI buttons do not reappear unexpectedly
transport ownership does not change
Orbital state remains stable
```

---

### Test D — A3 Title Placement

Move or verify title/song block at A3.

Expected:

```text
title/song block top-right
no overlap with tabs/controls
readable text
safe in 16:9
```

---

### Test E — OBS Readability

Check 16:9 composition:

```text
1920x1080 target
1280x720 target
```

Expected:

```text
Earth is visible and readable
song/title identity is readable
controls do not dominate
no authoring/debug chrome unless enabled
```

---

## Acceptance Criteria

This spec is complete when:

1. Orbital Earth runtime remains stable.
2. Clean Earth still passes.
3. Transition cleanup still passes.
4. Moon gate remains valid.
5. Top bar broadcast behavior is defined.
6. Hiding top bar does not restore unwanted left bar/buttons.
7. Title/song block is moved or verified in A3.
8. Title/song block does not overlap controls.
9. Transport controls do not overlap Earth center.
10. Broadcast composition is readable at 16:9.
11. No camera preset values are changed.
12. No new Moon visuals are added.
13. No presentation controls are added.
14. No transport buttons are added.
15. No Orbital FX are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Visible HUD/control layers found:
Top bar behavior:
Left bar/buttons behavior:
Title/song block placement:
Transport deck placement:
Composition report:
16:9 OBS check:
Runtime reports after layout patch:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No camera preset values changed.
No new Moon visuals added.
No presentation controls added.
No transport buttons added.
No Orbital FX added.
```

---

## Stop Conditions

Stop and report if:

```text
top bar hiding causes left bar/buttons to return
title/song block owner cannot be identified
transport deck owner cannot be identified
layout patch changes runtime state
composition requires changing camera preset values
composition requires adding new UI
Orbital runtime reports fail after layout patch
```

Do not hide a runtime issue with CSS.

---

## Final Principle

The runtime is recovered.

Now the frame has to work.

Broadcast Orbital should look intentional, readable, and controlled inside OBS without reopening the Orbital runtime chain.

## Implementation Guide

- **Where:** Audit Orbital HUD, top bar, now-playing/title block, transport deck, and broadcast CSS.
- **What:** Fix overlap and safe-zone behavior without touching runtime ownership, Moon, FX, or transport button logic.
- **Expect:** Orbital Earth is OBS-readable with the title/song block in A3, no authoring chrome leakage, and no control overlap.
