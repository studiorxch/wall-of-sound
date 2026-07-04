---
location: Specs
title: WOS/PLAY Main Project Boundary Fix Implementation Spec
date: 2026-06-29
status: implementation-spec
scope: "main project folder / PLAY / WOS / WALL_MAP / OBS / Claude"
target_executor: Claude
tags:
  - wos
  - play
  - wall-map
  - implementation
  - claude
  - source-boundary
  - obs
---

# WOS/PLAY Main Project Boundary Fix Implementation Spec

## Purpose

Implement the current WOS/PLAY boundary fixes in the **main project folder**, not as another doctrine rewrite.

This spec is for Claude to apply source-level changes to the active project.

The immediate goal is to stabilize the current WOS/PLAY runtime by removing accidental cross-contamination between PLAY, WALL_MAP, Flow Curve, sampler/debug UI, and OBS-facing display surfaces.

---

## Problem Summary

The current project appears to have drifted into an incorrect combined surface:

```text
PLAY controls
Flow Curve controls
sampler/debug controls
WALL_MAP display
MAPS/Orbital/Flight controls
OBS-facing broadcast surface
```

These should not be mounted into the same runtime surface by default.

Correct boundary:

```text
PLAY schedules Events.
Playlists/media payloads give Events content.
WOS/MAPS renders the default world surface.
WALL_MAP owns Mapbox and map modes.
OBS captures clean browser-source surfaces.
```

---

## Critical Correction

Do not solve this by hiding UI with CSS unless explicitly marked as a temporary emergency patch.

The correct fix is source-level removal or gating:

```text
do not instantiate the wrong component
do not mount controls into the wrong surface
do not create duplicate Mapbox instances
do not preserve dormant duplicate controllers
do not keep debug/sampler/Flow Curve controls in broadcast WALL output
```

---

## Source Boundary Rules

### PLAY Owns

```text
Events
schedule
media payloads / playlists
identity cards
intro / outro
intermission Event selection
broadcast programming state
audio/timing signal publishing
Event Visual Profile requests
```

### PLAY Must Not Own

```text
Mapbox
map lifecycle
map camera
route rendering
Orbital runtime
Flight / Drive / Walk map modes
WALL display controls
OBS scene composition
WOS camera shot sequencing
world actor scheduling
```

### WALL_MAP Owns

```text
Mapbox
map lifecycle
map camera
routes
locations
map color/theme rendering
Flight mode
Drive mode
Walk mode
Route mode
Orbital mode
OBS-facing MAPS browser source
```

### Flow Curve Owns

```text
playlist planning
visible energy curve
track ordering
locks
warnings
orphans
playlist export
```

Flow Curve must not be mounted as a live broadcast control surface inside WALL_MAP.

---

## Implementation Tasks

## 1. Audit Current Mount Points

Search the main project for all places that mount or instantiate:

```text
FlowCurve
Sampler
debug controls
transport controls
route controls
Orbital controls
Mapbox map instances
WALL_MAP
PLAY browser/player surface
```

Create a short implementation note listing:

```text
file path
component/module
what it mounts
which surface it belongs to
whether it should remain, move, or be gated
```

---

## 2. Enforce One Authoritative Map Surface

There must be one authoritative broadcast MAPS surface:

```text
WALL_MAP
```

Check for duplicate map creation paths:

```text
new mapboxgl.Map(...)
Mapbox container creation
mapbox canvas duplication
secondary map preview
PLAY-owned map instance
Studio/preview map leaking into broadcast runtime
```

Required outcome:

```text
PLAY does not instantiate Mapbox.
Only WALL_MAP owns broadcast Mapbox runtime.
No duplicate visible map surface appears.
```

Validation snippet:

```js
({
  mapboxMaps: document.querySelectorAll('.mapboxgl-map').length,
  mapboxCanvases: document.querySelectorAll('.mapboxgl-canvas').length,
  containers: [...document.querySelectorAll('.mapboxgl-map')].map((el, index) => ({
    index,
    id: el.id,
    className: el.className,
    parentId: el.parentElement?.id,
    parentClass: el.parentElement?.className,
    rect: el.getBoundingClientRect()
  }))
});
```

Acceptance:

```text
one intended WALL_MAP broadcast surface
no second exposed map
no PLAY-owned Mapbox
no duplicate map controller
```

---

## 3. Keep Orbital Inside WALL_MAP

Orbital is a mode of MAPS/WALL_MAP.

Do not split Orbital into a separate competing map app.

Required model:

```text
WALL_MAP
└── modes
    ├── Flight
    ├── Drive
    ├── Walk
    ├── Route
    └── Orbital
```

Acceptance:

```text
Orbital uses WALL_MAP authority.
Orbital does not create a second map instance.
Orbital does not mount PLAY controls.
Orbital can be entered/exited from WALL_MAP mode control.
```

---

## 4. Convert PLAY Visual Control to Event Visual Profile Request

PLAY should not directly control Mapbox.

PLAY should send a display request to WALL_MAP.

Implement or preserve a minimal Event Visual Profile shape:

```ts
export type EventVisualProfile = {
  primarySurface: "WALL_MAP" | string;
  mode?: "flight" | "drive" | "walk" | "route" | "orbital";
  routeId?: string;
  location?: string;
  mapTheme?: string;
  cameraPreset?: string;
  motionLevel?: "still" | "low" | "medium" | "high";
  duration?: "event" | "playlist" | "until-next-event" | number;
  wosChannel?: string;
};
```

Example command:

```ts
type ShowEventVisualCommand = {
  command: "SHOW_EVENT_VISUAL";
  eventId: string;
  wall: "WALL_MAP";
  visual: EventVisualProfile;
};
```

Acceptance:

```text
PLAY stores/sends Event Visual Profile.
WALL_MAP renders it.
PLAY does not instantiate or drive Mapbox internals.
```

---

## 5. Remove PLAY/FlowCurve/Sampler Controls from WALL_MAP Broadcast Surface

Broadcast WALL_MAP must not show:

```text
Flow Curve controls
sampler controls
sequencer controls
debug buttons
extra transport deck
record/play/stop/X overlays
route controls owned by PLAY
```

Required action:

```text
Find the source mount path.
Remove or gate the component before it mounts.
Use dev-only flags for diagnostics, not broadcast defaults.
```

Allowed dev gates:

```text
?dev=1
localStorage.WOS_DEV_UI=true
import.meta.env.DEV
```

Acceptance:

```text
Default WALL_MAP broadcast URL has no PLAY/FlowCurve/Sampler/debug controls.
Dev UI appears only with explicit dev flag.
```

---

## 6. Stabilize Flight Hold Baseline

Preserve the current approved Flight Hold baseline:

```text
Mode: Flight
Destination: Miami test route
Speed: 1x
Altitude: Cruise / 35,000 ft
Camera: forward / calm aerial
Motion Level: low
```

Add or preserve a named preset/channel:

```text
WOS_CHANNEL_FLIGHT_HOLD
```

or:

```text
flight-hold-cruise
```

Acceptance:

```text
Flight Hold can be launched consistently.
1x cruise altitude is preserved.
Camera movement remains calm.
No aggressive route switching.
```

---

## 7. Clean Flight HUD

The Flight HUD needs to feel embedded, not like a black widget.

Requirements:

```text
transparent/glass panel
reduced width
no heavy black card
no extra buttons
no decorative line/grid redesign
no overlap with important current map text where avoidable
current information remains readable
```

Suggested CSS direction:

```css
.flight-status-panel {
  background: rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(4px);
  border: none;
  box-shadow: none;
  pointer-events: none;
  width: 260px;
  max-width: 260px;
}

.flight-status-panel .divider,
.flight-status-panel hr {
  opacity: 0.08;
}
```

Acceptance:

```text
HUD does not cover key route/current info.
HUD is transparent enough to blend into screen.
No new buttons are introduced.
```

---

## 8. Add Snapshot Shortcut

Add a flight snapshot shortcut.

Required shortcut:

```text
Shift + S = save current WOS frame as PNG
```

Filename pattern:

```text
WOS_<MODE>_<LOCATION>_<YYYY-MM-DD_HHMMSS>.png
```

Examples:

```text
WOS_FLIGHT_Miami_2026-06-29_014512.png
WOS_ORBITAL_Earth_2026-06-29_020012.png
```

Behavior:

```text
does not interrupt flight
minimal confirmation only
captures current view
optional later: clean HUD-free snapshot shortcut
```

Acceptance:

```text
Shift+S captures a PNG during Flight.
Snapshot does not stop or disturb the runtime.
```

---

## 9. OBS Browser Source Readiness

WALL_MAP should be usable as a stable OBS browser source.

Browser source is preferred over window/display capture.

Requirements:

```text
fixed-size OBS-safe output
no browser chrome dependency
no required manual window positioning
clean broadcast mode
dev UI disabled by default
stable Flight Hold route/view
```

Acceptance:

```text
WALL_MAP can be loaded by OBS browser source.
Default output is clean enough for a 2-hour Flight Hold test.
```

---

## 10. Intermission / Scheduler Awareness

Do not implement the full Scheduler in this pass unless already present.

But preserve the model:

```text
PLAY schedules Events.
Intermission is a Scheduler-generated Event type.
Intermission duration is unknown and lasts until the next scheduled Event.
```

Do not build intermission as a random standalone playlist-only object.

If existing Scheduler code is touched, align naming toward:

```text
Event
MediaPayload
EventVisualProfile
IntermissionEvent
```

Acceptance:

```text
No new Scheduler architecture is overbuilt.
Terminology does not regress to playlist-as-event.
```

---

## Verification Checklist

Run through this checklist before reporting complete:

```text
[ ] App builds.
[ ] WALL_MAP opens.
[ ] Flight mode opens.
[ ] Flight Hold can run at 1x cruise altitude.
[ ] No duplicate map surface appears.
[ ] Orbital remains a WALL_MAP mode.
[ ] PLAY does not create Mapbox.
[ ] Flow Curve controls are not mounted into WALL_MAP broadcast output.
[ ] Sampler/debug controls are not mounted into WALL_MAP broadcast output.
[ ] Flight HUD is transparent/narrow and not covering important current info.
[ ] Shift+S snapshot works.
[ ] OBS/browser-source mode is clean enough for 2-hour test.
```

---

## Explicit Non-Goals

Do not implement in this pass:

```text
full Canvas recovery
Studio object authoring
Smart Grid HUD
Moon Carnival channel
full OBS automation
Chrome extension
audio-reactive refactor
Flow Curve feature expansion
new mixer/sampler features
Drive/Walk/Transit rebuild
```

---

## Claude Completion Report Required

When complete, Claude should report:

```text
Spec complete / partial / blocked.

Files changed:
- path
- path

What changed:
- concise summary

Verification:
- build result
- runtime checks
- DOM map count
- Flight Hold result
- HUD result
- snapshot result

Remaining blockers:
- list or none

Do not reopen:
- PLAY must not own Mapbox
- WALL_MAP remains authoritative map surface
- Orbital remains mode inside WALL_MAP
- Flow Curve/Sampler controls do not mount into broadcast WALL_MAP
```

---

## Claude Prompt

Use this prompt with Claude from the main project folder:

```text
Implement 0629A_WOS_PLAY_MainProjectBoundaryFixes_v1.0.0.md.

Work in the main project folder.

Do not rewrite doctrine. Apply source-level fixes.

Primary goals:
1. Ensure WALL_MAP is the only authoritative broadcast Mapbox surface.
2. Ensure PLAY does not instantiate Mapbox or mount map controls into WALL_MAP.
3. Keep Orbital as a mode inside WALL_MAP.
4. Remove/gate Flow Curve, sampler, debug, and extra controls from default WALL_MAP broadcast output at source.
5. Preserve Flight Hold baseline: Flight mode, 1x speed, cruise altitude / 35,000 ft, calm forward camera.
6. Clean Flight HUD with transparency and reduced width; no new buttons or decorative redesign.
7. Add Shift+S snapshot shortcut for PNG capture.
8. Verify OBS/browser-source readiness.

Do not hide problems with CSS when source removal/gating is required.
Do not create new map controllers.
Do not create duplicate Mapbox instances.
Do not overbuild Scheduler, Canvas, Smart Grid, Moon, or OBS automation in this pass.

Return a completion report with files changed, verification results, blockers, and do-not-reopen notes.
```
