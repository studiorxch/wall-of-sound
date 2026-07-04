---
layout: spec
title: "Traversal Control UX, Snapshot, and Camera Menu Simplification"
date: 2026-06-06
doc_id: "0606A_WOS_TraversalControlUXSnapshotCameraMenu_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation-ui"
component: "traversal_control_deck"

type: "implementation-spec"
status: "approved"

priority: "critical"
risk: "medium"

classification: "presentation-navigation-ui-camera-snapshot"

summary: "Clarifies traversal controls after Launch, adds Pause/Play and Stop route controls, adds HUD-free PNG snapshot export with coordinate metadata, simplifies camera menu labels into stable internal/external vocabulary, and moves Hide Actor into an independent toggle."

depends_on:
  - "0605N_WOS_TransportScopedPOVAuthority_v1.0.0"
  - "0605O_WOS_CameraLensControlPass_v1.0.0"
  - "0605P_WOS_InternalPOVCameraProjectionRepair_v1.0.0"
  - "traversalControlDeck.js"
  - "cameraLensControlPass.js"

tags:
  - "ui"
  - "camera"
  - "snapshot"
  - "controls"
  - "launch"
  - "pause"
  - "stop"
  - "hud-free"
  - "archive"
---

# 0606A_WOS_TraversalControlUXSnapshotCameraMenu_v1.0.0_BUILD

## Purpose

Clean up the traversal control deck now that internal POV, lens, and transport-scoped camera logic exist.

This spec addresses three visible UX issues:

```text
1. Launch lifecycle is unclear.
2. Snapshot/export does not exist.
3. Camera menu language is still too technical and redundant.
```

The goal is to make the runtime usable without reloads, without console commands, and without confusing internal POV with external filming cameras.

---

## Current Problem

The UI currently exposes too much system vocabulary:

```text
External
  Follow
  Lead
  Side
  High
  Hide Actor

Internal POV
  Driver
  Passenger
  Rear Seat

Look
  Look Front
  Look Left
  Look Right
  Look Rear
```

Lens is separate:

```text
Lens: Auto
Wide
Normal
Telephoto
Dashcam
Helmet
Bus
Ferry
Drone
```

This is structurally better than the old flat dropdown, but it still has problems:

```text
- Launch remains active even after a route is already running.
- There is no Pause/Play lifecycle control.
- There is no Stop control to end the route without reloading the page.
- Hide Actor is incorrectly inside the camera menu.
- Camera names are developer-facing, not creator-facing.
- Snapshot/export is missing.
```

---

# Core Decisions

## Decision 1 — Route lifecycle controls

Traversal must support:

```text
Launch
Pause / Play
Stop
```

without requiring a page reload.

## Decision 2 — Launch button state

After a route launches successfully:

```text
Launch button should gray out / disable when it is not needed.
```

It should reactivate when:

```text
- route stops
- destination changes
- transport mode changes
- current route becomes invalid
```

## Decision 3 — Snapshot button

Add a snapshot button that exports a clean PNG:

```text
no HUD
no side rail
no bottom controls
no debug overlays
no panels
```

The snapshot must produce an archive-friendly filename containing:

```text
date
time
location / coordinates
camera mode
transport mode
```

## Decision 4 — SVG export

SVG export is not required for this build.

Reason:

```text
Mapbox WebGL + 3D custom layers + terrain + canvas compositing are raster-first.
A true SVG export would not faithfully preserve 3D terrain, lighting, fog, WebGL layers, or custom meshes.
```

This build may expose:

```text
svgAvailable:false
reason:"webgl_scene_not_vector_stable"
```

Future vector export can target overlays only.

## Decision 5 — Camera menu simplification

Replace current grouped camera menu labels with a single stable list:

```text
Ext. Front (Lead)
Ext. Rear (Follow)
Ext. Side (Profile)
Ext. High (Overhead)

Int. Dash (Looking In)
Int. Driver POV
Int. Passenger POV
Int. Rear Seat
```

Hide Actor becomes an independent toggle.

---

# Required UI Changes

## Route Controls

Current:

```text
[Launch]
```

Required:

```text
[Launch] [Pause/Play] [Stop]
```

State behavior:

| Route State | Launch | Pause/Play | Stop |
|---|---|---|---|
| idle | enabled | disabled | disabled |
| launching | disabled/loading | disabled | enabled |
| running | disabled/gray | enabled, shows Pause | enabled |
| paused | disabled/gray | enabled, shows Play | enabled |
| stopped | enabled | disabled | disabled |
| error | enabled | disabled | disabled |

---

## Snapshot Control

Add:

```text
[Snapshot]
```

Preferred icon:

```text
📸
```

Placement:

```text
near Launch / route controls
```

Snapshot must not be buried in debug tools.

---

## Camera Menu Labels

Replace current camera labels with:

```text
Ext. Front (Lead)
Ext. Rear (Follow)
Ext. Side (Profile)
Ext. High (Overhead)

Int. Dash (Looking In)
Int. Driver POV
Int. Passenger POV
Int. Rear Seat
```

### Mapping

| UI Label | Family | Underlying Mode |
|---|---|---|
| Ext. Front (Lead) | external | lead |
| Ext. Rear (Follow) | external | follow |
| Ext. Side (Profile) | external | side |
| Ext. High (Overhead) | external | high |
| Int. Dash (Looking In) | internal | dash_in |
| Int. Driver POV | internal | driver |
| Int. Passenger POV | internal | passenger |
| Int. Rear Seat | internal | rear_seat |

---

# Clarify Internal vs External

## External

External means:

```text
camera films the actor from outside
actor may be visible
```

Examples:

```text
Ext. Front (Lead)
Ext. Rear (Follow)
Ext. Side (Profile)
Ext. High (Overhead)
```

## Internal

Internal means:

```text
camera occupies the actor
actor exterior should not be visible
```

Examples:

```text
Int. Driver POV
Int. Passenger POV
Int. Rear Seat
```

## Int. Dash (Looking In)

This is a special internal-adjacent shot.

Meaning:

```text
camera sits near dashboard/front cabin and looks inward toward occupants / interior direction
```

Because there are no interior meshes yet, it may currently resolve as:

```text
internal anchor + rear-facing or inward-facing bearing
```

It must not be confused with external follow.

If the current actor has no interior foreground, this mode should still hide the exterior actor.

---

# Hide Actor Toggle

Remove `Hide Actor` from the camera dropdown.

Add standalone checkbox/toggle:

```text
[ ] Hide Actor
```

Behavior:

```text
- Can be used with any camera angle.
- Defaults ON for true internal POV.
- Defaults OFF for external cameras.
- User override persists during the current session.
```

Priority:

```text
manual hide toggle > camera default
```

Preferred for now:

```text
checked by default for internal, editable for debugging
```

---

# Snapshot Requirements

## PNG Capture

Add:

```js
SBE.RuntimeSnapshotCapture
```

Preferred file:

```text
wall/systems/presentation/runtimeSnapshotCapture.js
```

Public API:

```js
capturePNG(options)
getState()
getStats()
setDebug(on)
```

Options:

```js
{
  hideHUD: true,
  includeMetadata: true,
  download: true,
  filenamePrefix: "WOS"
}
```

---

## HUD-Free Capture

Before capture:

```text
add body class: snapshot-clean
```

After capture:

```text
remove body class: snapshot-clean
```

CSS should hide:

```text
left rail
bottom traversal deck
HUD clock/weather/location
right-side map controls
debug overlays
Studio link
panels/drawers
```

---

## PNG Source

Preferred:

```js
map.getCanvas().toDataURL("image/png")
```

If the scene uses multiple overlay canvases, capture the composed visible frame instead.

Acceptable v1:

```text
Mapbox canvas only, HUD hidden.
```

But report:

```js
composition:"mapbox_canvas"
```

---

## Filename Format

Required filename shape:

```text
WOS_YYYY-MM-DD_HH-MM-SS_AMPM_transport_camera_lat_lng.png
```

Example:

```text
WOS_2026-06-06_01-56-56_AM_drive_int-driver-pov_40.712776_-74.005974.png
```

Use safe filename characters only.

---

## Metadata

Create a sidecar JSON download when `includeMetadata:true`.

Metadata:

```js
{
  app: "WOS",
  capturedAtISO,
  localLabel,
  map: {
    centerLng,
    centerLat,
    zoom,
    pitch,
    bearing
  },
  transportMode,
  cameraMode,
  lensProfile,
  route: {
    from,
    to,
    active,
    paused
  },
  coordinateReturnHint: "Paste lat,lng into destination or debug recenter command."
}
```

---

# Return-to-Coordinates

Add debug helper:

```js
_wos.debug.snapshot.recenter(lng, lat, zoom?)
```

Snapshot metadata must contain enough map/camera information to return to the view:

```text
centerLng
centerLat
zoom
pitch
bearing
```

---

# SVG Position

Expose honest support state:

```js
{
  svgAvailable: false,
  reason: "webgl_scene_not_vector_stable"
}
```

Do not promise stable SVG export for the full scene.

Optional future:

```text
SVG overlay export only
```

---

# Route Lifecycle Runtime

Add bridge methods in `traversalControlDeck.js`:

```js
pauseRoute()
resumeRoute()
togglePauseRoute()
stopRoute()
getRouteControlState()
```

Runtime integration:

```text
Drive → HeroVehicleRuntime
Flight → RegionalFlightTripRuntime
Future Walk/Bike/Transit/Ferry → their own runtimes
```

If a runtime lacks pause/resume:

```text
pause = speed 0 or runtime-specific hold
resume = restore speed
```

If a runtime lacks stop:

```text
stop = disengage active runtime and clear nav state
```

Do not reload the page.

---

# State Model

Add control state:

```js
{
  routeState: "idle" | "launching" | "running" | "paused" | "stopped" | "error",
  transport: "drive",
  canLaunch: true,
  canPause: false,
  canStop: false,
  lastLaunchAt,
  lastStopAt,
  lastPauseAt,
  lastResumeAt
}
```

---

# Debug Commands

Add:

```js
_wos.debug.nav.routeControls()
_wos.debug.nav.pause()
_wos.debug.nav.play()
_wos.debug.nav.stop()
_wos.debug.nav.snapshot()
_wos.debug.nav.snapshotState()
```

Add snapshot namespace if preferred:

```js
_wos.debug.snapshot.capture()
_wos.debug.snapshot.state()
_wos.debug.snapshot.recenter(lng, lat, zoom)
_wos.debug.snapshot.svgStatus()
```

---

# Acceptance Tests

## T1 — Launch disables after route starts

Expected:

```text
after successful route launch:
routeState:"running"
Launch disabled/gray
Pause enabled
Stop enabled
```

## T2 — Pause toggles route

Expected:

```text
Pause click:
routeState:"paused"
actor stops advancing or runtime pauses
button label becomes Play
```

## T3 — Play resumes route

Expected:

```text
Play click:
routeState:"running"
actor resumes
button label becomes Pause
```

## T4 — Stop ends route without reload

Expected:

```text
Stop click:
routeState:"stopped"
active route ended
Launch enabled
map position preserved
page not reloaded
```

## T5 — Destination change re-enables Launch

Expected:

```text
editing destination while stopped or idle:
Launch enabled
```

## T6 — Camera menu contains only simplified labels

Expected labels:

```text
Ext. Front (Lead)
Ext. Rear (Follow)
Ext. Side (Profile)
Ext. High (Overhead)
Int. Dash (Looking In)
Int. Driver POV
Int. Passenger POV
Int. Rear Seat
```

Old labels removed from primary menu:

```text
Follow
Lead
Side
High
Driver
Passenger
Rear Seat
Look Front
Look Left
Look Right
Look Rear
Hide Actor
```

## T7 — Camera mapping works

Expected:

```text
Ext. Rear (Follow) → external follow
Ext. Front (Lead) → external lead
Int. Driver POV → internal driver
Int. Passenger POV → internal passenger
Int. Rear Seat → internal rear_seat
```

## T8 — Hide Actor is standalone

Expected:

```text
Hide Actor no longer appears in camera dropdown
Standalone toggle exists
Toggle affects actor visibility across current angle
```

## T9 — Internal defaults hide actor

Expected:

```text
select Int. Driver POV
Hide Actor checked
actor hidden
```

## T10 — External defaults show actor

Expected:

```text
select Ext. Rear (Follow)
Hide Actor unchecked unless manually overridden
actor visible
```

## T11 — Snapshot captures PNG

Expected:

```text
click Snapshot
PNG downloads
filename includes date/time/transport/camera/coords
```

## T12 — Snapshot hides HUD

Expected PNG excludes:

```text
left rail
bottom deck
HUD/weather/time
dropdown menus
Studio link
```

## T13 — Snapshot metadata JSON

Expected:

```text
JSON sidecar downloads or is available from state
contains centerLng, centerLat, zoom, pitch, bearing
```

## T14 — Recenter helper works

Expected:

```text
recenter(lng, lat, zoom)
moves map to saved coordinate
```

## T15 — SVG status is honest

Expected:

```text
svgAvailable:false
reason:"webgl_scene_not_vector_stable"
```

## T16 — No actor truth mutation

Expected actor truth unchanged.

## T17 — No route truth mutation except lifecycle state

Expected route geometry unchanged.

## T18 — No camera authority mutation beyond selected mode

Expected camera menu only routes existing camera authorities.

## T19 — No Mapbox style mutation

Expected no source/layer/style edits.

## T20 — Debug commands structured

Expected all route/snapshot debug commands return structured objects without throwing.

---

# Non-Goals

This spec does not create:

```text
new external camera rig math
new internal anchors
dashboard graphics
mirror rendering
camera shake
route planning changes
new transport runtimes
SVG full-scene export
video recording
cloud archiving
```

---

# Deferred Systems

## 0606B — External Camera Rig Pass

Creates real external rigs:

```text
chase
front track
side track
orbit
roadside
intersection
helicopter
```

## 0606C — Foreground Anchor Pass

Adds:

```text
dashboard silhouette
windshield frame
bike handlebars
bus pole
ferry railing
```

## 0606D — Snapshot Archive Index

Creates local archive index:

```text
PNG
JSON metadata
thumbnail
searchable coordinates
camera mode
transport mode
```

---

# Implementation Guide

- **Where**: Patch `wall/systems/presentation/traversalControlDeck.js`; add `wall/systems/presentation/runtimeSnapshotCapture.js`; register it in `wall/index.html`; patch debug bindings in `worldSpaceVehicleDebug.js` or a dedicated snapshot debug file.
- **What**: Run `node --check wall/systems/presentation/traversalControlDeck.js`, `node --check wall/systems/presentation/runtimeSnapshotCapture.js`, and every touched JS file. Test Launch → Pause → Play → Stop without reloading. Test snapshot PNG and metadata download.
- **Expect**: Launch grays out once running; Pause/Play and Stop control the route without losing map position; camera menu uses clear internal/external labels; Hide Actor is a standalone toggle; Snapshot exports a HUD-free PNG with coordinate metadata; SVG full-scene export reports unsupported honestly.
