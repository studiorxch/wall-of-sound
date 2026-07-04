# 0625H_PLAY_BroadcastSmartGridDataDrivenIndicatorSystemPatch_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Smart Grid Indicator System — Data Driven Only

This patch corrects the next visual/system direction for the Broadcast HUD.

The generated HUD reference has useful indicator ideas, but the PLAY/WOS implementation must use the existing Smart Grid language and must not fake data.

The goal is not to copy the reference.

The goal is to extract the useful system-display logic:

```text
audio signal
source feed
sync state
latency
uptime
map feed
route/camera nodes
scale
weather/sky
clock
protected controls
```

and render it through the PLAY/WOS Smart Grid language.

---

## Active Project Paths

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

WALL runtime:
  /Users/studio/Projects/wall-of-sound/wall

PLAY root:
  /Users/studio/Projects/wall-of-sound/play

PLAY app:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder

PLAY source:
  /Users/studio/Projects/wall-of-sound/play/flow-curve-builder/src
```

Do not use:

```text
/Users/studio/Projects/play
```

That path is legacy/inactive.

---

## Protected Baseline

Do not regress:

```text
clock
weather
music play / NO TRACK
vehicle controls
speed / altitude controls
route launch
camera instrumentation
POV EXT / DRIVER / PASS
sky status
Studio / Canvas access
TAB hide/show controls
map pan/zoom
ATM THREE SKY when WALL is running
```

Do not remove or hide:

```text
TIME
ZONE
WX
TEMP
HUM
PREC
WIND
SRC
CAM
POV
SPD
ALT
ROUTE
SKY
SUN
CLOUD
ATM
```

---

## Core Product Rule

No fake data.

Every indicator must be one of:

```text
LIVE      real value from runtime/source
DERIVED   computed honestly from real state
STATIC    fixed system metadata
MISSING   unavailable with explicit reason
```

No decorative numbers.

No fake latency.

No fake nodes.

No fake audio waveform.

No fake map feed.

No fake emergency stop.

---

## Design Direction

Use the reference only for structure:

```text
angular cut-corner panels
thin system lines
small technical labels
signal meters
node/route callouts
status cells
warning-style guarded controls
```

But render it through the existing PLAY/WOS Smart Grid language:

```text
map as primary surface
grid cells as data containers
thin technical rules
micrographic density
no rounded friendly Apple-style buttons
no big fake cockpit
no bottom playback dock
```

---

# Part 1 — Smart Grid Indicator Registry

## Goal

Create a central registry describing all Broadcast HUD indicators.

Suggested file:

```text
src/runtime/broadcastIndicatorRegistry.ts
```

or equivalent.

Each indicator must include:

```ts
type IndicatorTruthState = "live" | "derived" | "static" | "missing";

type BroadcastIndicator = {
  id: string;
  label: string;
  value: string;
  truthState: IndicatorTruthState;
  source: string;
  missingReason?: string;
  priority: "primary" | "secondary" | "tertiary";
};
```

---

## Required Indicator Sources

Use existing real state where available.

### Audio

Possible values:

```text
AUDIO LIVE
NO TRACK
PAUSED
PLAYING
NO AUDIO SOURCE
```

Source:

```text
PLAY playback engine
currentTrack
isPlaying
audio element state
```

Do not fake waveform.

If no real audio analyzer exists, show:

```text
WAVEFORM MISSING — no analyzer source
```

---

### Route

Possible values:

```text
ROUTES LIVE
ROUTE ID
ROUTE MODE
LAUNCH STATE
```

Source:

```text
WALL/WOS route status
Broadcast route bridge
WOS nav state
```

---

### Camera

Already established:

```text
CAM ROUTE
POV EXT / DRIVER / PASS
SPD 1X
ALT CITY
ROUTE LIVE
```

Source:

```text
0625D route camera instrumentation
WOS traversal control state
```

---

### Sky / Atmosphere

Already established:

```text
SKY EVENING
SUN EL / AZ
CLOUD coverage / density
ATM THREE SKY or bridge blocker
```

Source:

```text
skyAtmosphereModel
WALL sky status postMessage
SBE.AtmosphereRuntime
```

---

### Clock / Weather

Already established:

```text
TIME
ZONE
WX
TEMP
HUM
PREC
WIND
SRC
```

Source:

```text
BroadcastSignalStrip
atmosphereRuntime phase model
future weather bridge
```

---

### Source Feed

Possible values:

```text
SOURCE WOS LOCAL
SOURCE WALL LOCAL
SOURCE PLAY LOCAL
SOURCE MISSING
```

Source:

```text
iframe URL
route source status
postMessage bridge status
```

---

### Sync

Only show as live if real bridge heartbeat exists.

Possible values:

```text
SYNC LOCKED
SYNC DEGRADED
SYNC MISSING
```

Source:

```text
WALL → PLAY postMessage heartbeat/status
```

If not implemented:

```text
SYNC MISSING — no heartbeat
```

---

### Latency

Only show if measured.

Possible implementation:

```text
PLAY sends ping timestamp to WALL
WALL echoes pong
PLAY computes RTT
```

If not implemented:

```text
LATENCY MISSING — no ping bridge
```

Do not show fake milliseconds.

---

### Uptime

Can be real if computed from mount/start time.

Possible values:

```text
UPTIME 00:12:31
```

Truth state:

```text
DERIVED
```

Source:

```text
Broadcast HUD mount time or WALL runtime start time
```

Label clearly:

```text
UPTIME PLAY
```

or:

```text
UPTIME WALL
```

Do not imply server uptime unless measured.

---

### Grid Scale

Can be derived from map zoom if map state available.

Possible values:

```text
GRID SCALE 2.0 KM
```

Source:

```text
Mapbox zoom/center
computed meters-per-pixel
```

If not available:

```text
GRID SCALE MISSING — map zoom not exposed
```

---

### Coordinates

Can be real if map center available.

Possible values:

```text
40.7128° N
74.0060° W
```

Source:

```text
Mapbox center
```

If cross-origin blocks access:

```text
COORDS MISSING — map center not bridged
```

---

### Emergency Stop

Only show if a real stop/pause route control exists.

Possible values:

```text
STOP ARMED
STOP AVAILABLE
STOP MISSING
```

Source:

```text
WOS route pause/stop controls
```

Do not render an active emergency stop if it does not work.

If the existing WOS stop is wired, expose guarded control:

```text
EMERGENCY STOP
AUTH / CONFIRM REQUIRED
```

with two-step confirmation.

If not wired:

```text
STOP MISSING — no route stop bridge
```

---

# Part 2 — Smart Grid Layout

## Goal

Use Smart Grid cells to display indicators.

Suggested component:

```text
src/ui/BroadcastSmartGridOverlay.tsx
```

The grid should feel like:

```text
systems display
map-attached data
angular / cut-corner panels
thin linework
low roundedness
micrographic scale
```

Not:

```text
friendly segmented buttons
Apple 2009 rounded UI
fake cockpit
decorative sci-fi numbers
```

---

## Placement

Use the existing HUD geography:

```text
top-left: PLAY/WOS audio identity cluster
top-right: camera + sky + route micrographics
bottom-left: clock/weather signal strip
map surface: optional node callouts only if real
bottom/right: avoid covering WOS nav and map controls
```

---

## Top-Left PLAY / Audio Cluster

Replace separate title/play button treatment with one integrated system cluster.

Suggested content:

```text
PLAY / WOS
AUDIO BROADCAST SYSTEM
AUDIO LIVE / NO TRACK / PAUSED
CH current channel if real
SAMPLE RATE if real
BIT DEPTH if real
```

Only show sample rate/bit depth if actual audio source exposes it.

Otherwise:

```text
AUDIO FORMAT MISSING
```

No fake `48.0KHz` or `24-BIT`.

---

## Button Styling

Move away from:

```text
rounded consumer button
big PLAY / PAUSE button
friendly glow rectangle
```

Move toward:

```text
signal cell
audio state indicator
small play affordance if needed
guarded stop control
```

When music is playing, do not show a big vibe-killing:

```text
PAUSE
```

Instead show:

```text
AUDIO LIVE
TX ACTIVE
```

Pause/stop control should be secondary/guarded.

---

## Emergency Stop Treatment

If real stop exists, implement:

```text
EMERGENCY STOP
guarded control
two-step confirm
orange warning bars
small but legible
```

Behavior:

```text
first click arms
second click confirms stop
auto-disarm after short timeout
```

If no stop exists, show missing state, not fake button.

---

# Part 3 — Data Bridge Requirements

## WALL → PLAY Bridge

Extend existing postMessage bridge where needed.

Existing bridge already supports:

```text
wall:sky-status
camera POV control messages
```

Potential new messages:

```ts
{
  type: "wall:runtime-status",
  payload: {
    routeStatus,
    cameraMode,
    povMode,
    speedLabel,
    altitudeLabel,
    mapCenter,
    mapZoom,
    sourceFeed,
    skyRenderer,
    timestamp
  }
}
```

Optional ping/pong for latency:

```ts
{ type: "play:ping", sentAt }
{ type: "wall:pong", sentAt, wallAt }
```

Validate message types.

Do not trust arbitrary message payloads.

---

# Part 4 — Map Node Callouts

Do not add fake nodes.

Only render node callouts if there is real node/route/actor data.

Acceptable real node sources:

```text
route waypoint
camera target
actor location
WOS route stop
published actor
bridge/transit marker from data source
```

If no real nodes exist:

```text
do not render node callouts
```

---

# Part 5 — Preserve Current Systems

Do not regress:

```text
0625B weather/play recovery
0625C camera instrumentation
0625D POV controls
0625E WALL Three Sky
0625F sky brightness tuning
0625G removal of broken Show/Snapshot buttons
```

The Smart Grid overlay is an additive/replacement display layer for indicators, not a cleanup pass that removes controls.

---

## Files Likely Touched

PLAY:

```text
src/runtime/broadcastIndicatorRegistry.ts
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastSignalStrip.tsx
src/ui/BroadcastRouteCameraInstrumentation.tsx
src/ui/BroadcastSmartGridOverlay.tsx
src/styles.css
```

WALL only if adding bridge data:

```text
wall/index.html
wall/threeSkyLayer.js
wall/atmosphereRuntime.js
wall/traversalControlDeck.js
wall/*runtime*.js
```

Use actual repo filenames.

---

## Acceptance Criteria

### A. Smart Grid used

Broadcast HUD indicators are rendered through a Smart Grid-style overlay or registry-driven system.

---

### B. No fake data

Every visible indicator has:

```text
live
derived
static
missing
```

truth state.

---

### C. Missing states explicit

Unavailable indicators say why.

No bare dash.

No silent omission.

---

### D. PLAY/audio cluster integrated

The PLAY identity and audio play state are merged into one top-left system cluster.

---

### E. Big PAUSE avoided

When music is playing, do not show large PAUSE text.

Show audio status instead:

```text
AUDIO LIVE
TX ACTIVE
```

---

### F. Stop is guarded or absent

Emergency stop appears only if real and guarded.

If not wired, show explicit missing state or omit from active controls.

---

### G. Existing controls preserved

WOS nav, vehicle controls, speed/alt, route launch, POV controls remain.

---

### H. Clock/weather preserved

TIME / ZONE / WX / TEMP / HUM / PREC / WIND / SRC remain.

---

### I. Sky status preserved

SKY / SUN / CLOUD / ATM remain.

---

### J. Map remains interactive

Pan/zoom works.

---

### K. TAB still hides/restores indicators

TAB hides/restores Smart Grid indicators and controls.

---

### L. Removed buttons stay removed

Operate / Show / Snapshot do not return.

---

### M. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

---

## Manual Test Checklist

1. Start WALL.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm top-left PLAY/audio cluster appears.

5. Confirm no separate big rounded play/pause button.

6. Confirm no big PAUSE label while playing.

7. Confirm every visible indicator has real/derived/static/missing source.

8. Confirm missing data has explicit reason.

9. Confirm WOS nav remains.

10. Confirm POV controls remain.

11. Confirm clock/weather remain.

12. Confirm sky status remains.

13. Confirm map pan/zoom works.

14. Press TAB.

Expected:

```text
Smart Grid indicators hide
```

15. Press TAB again.

Expected:

```text
Smart Grid indicators return
```

16. Confirm Operate / Show / Snapshot are not visible.

17. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD shifts from consumer UI buttons toward a real systems display.

The top-left PLAY control becomes an audio signal cluster:

```text
PLAY / WOS
AUDIO LIVE / NO TRACK / PAUSED
TX ACTIVE when playing
real/missing format status
guarded stop only if real
```

The rest of the interface uses Smart Grid cells tied to real runtime data.

No fake indicators.

No lost controls.

No rounded button regression.

---

## Implementation Guide

- **Where:** Broadcast HUD indicator registry, Smart Grid overlay, top-left PLAY/audio cluster, optional WALL runtime bridge.
- **What:** Replace rounded consumer toolbar/button treatment with data-driven Smart Grid indicators; merge PLAY identity with audio state; ensure every indicator has a truth state and source.
- **Expect:** A sharper systems-display HUD that uses real PLAY/WALL data and preserves all recovered controls/signals.
