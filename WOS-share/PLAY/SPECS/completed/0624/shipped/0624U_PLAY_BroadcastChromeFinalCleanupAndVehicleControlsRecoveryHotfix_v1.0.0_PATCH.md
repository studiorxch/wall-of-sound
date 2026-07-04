# 0624U_PLAY_BroadcastChromeFinalCleanupAndVehicleControlsRecoveryHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Final Chrome Cleanup + Restore Vehicle Controls Access

This patch performs the final Broadcast chrome cleanup while correcting the vehicle-control regression.

The current Broadcast direction is correct:

```text
map first
typed track index
micrographics grid
top-bar route/play
no bottom dock
```

But the vehicle/traversal controls were hidden while removing the bottom controller/dock.

The correction:

```text
Do not restore the bottom dock.
Do restore vehicle control access.
```

---

## Active Project Paths

```text
WOS root:
  /Users/studio/Projects/wall-of-sound

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

## Current State

Completed:

```text
0624M = removed fake route line/dot, haze, capture clutter
0624N = restored WOS route/map launch
0624O = hid WOS chrome in embed mode
0624P = restored minimal route controller + Canvas access
0624Q = restored map pan/zoom interaction
0624R = removed bottom playback bar and reduced controller clutter
0624S = added top-bar play, typed track index, micrographics grid
0624T = tuned typed overlay and micrographics style
```

Current verified state:

```text
map is interactive
bottom dock is gone
typed track index is working
micrographics grid is sparse and technical
Routes Live top-bar state works
tsc clean
```

Current issue:

```text
vehicle controls are no longer available in the Broadcast surface
right Mapbox controls and WOS telemetry still need final cleanup
```

---

## Product Correction

Vehicle controls are required, but they should not appear as a bottom dock.

Required model:

```text
Top bar = primary play/route action
Map = primary surface
Typed overlay = music identity
Micrographics grid = status
Vehicle controls = compact top/micro control, not bottom dock
```

---

## Goal

Finish Broadcast chrome cleanup and restore vehicle/traversal controls in a compact, non-dock form.

Required result:

```text
right Mapbox controls hidden
WOS telemetry/time/weather hidden or absorbed
vehicle mode controls accessible
speed/launch controls accessible if needed
no bottom dock returns
map pan/zoom remains working
typed overlay and micrographics remain
```

---

## Where Vehicle Controls Went

The vehicle controls were part of the WOS `#wos-nav` route controller.

During 0624S/T, the bottom dock-style controller was hidden by default in embed mode.

That removed:

```text
Flight
Drive
Walk
Bike
Transit
Speed
Launch
```

The visual dock needed to go, but the control functionality should have been relocated.

---

## Required Vehicle Control Recovery

Restore vehicle controls as a compact control cluster.

Preferred placement:

```text
top bar secondary cluster
or micrographics-adjacent compact strip
```

Do not place at bottom.

Suggested compact label-only control:

```text
MODE  FLIGHT / DRIVE / WALK / BIKE / TRANSIT
SPD   - 1X +
▶     LAUNCH
```

Or more compact:

```text
[FLIGHT] [DRIVE] [WALK] [BIKE] [TRANSIT]   SPD − 1X +   ▶
```

No emoji.

No large dock.

No full-width bar.

---

## Required Controls

Minimum required in Broadcast Operate mode:

```text
Flight
Drive
Walk
Bike
Transit
Speed - / +
Launch / Play
```

Optional if already supported and compact:

```text
Cruise
Stop
Camera mode
```

Do not add new route logic.

Only expose existing WOS controls/functions.

---

## Implementation Options

### Option A — PLAY-side vehicle controls

Preferred if WOS functions can be triggered safely.

Add a compact component:

```text
src/ui/BroadcastVehicleControls.tsx
```

The component calls existing route launch/control bridge.

Props example:

```ts
type BroadcastVehicleControlsProps = {
  activeMode?: "flight" | "drive" | "walk" | "bike" | "transit";
  speedLabel?: string;
  routeStatus?: string;
  onModeChange: (mode: string) => void;
  onSpeedDown: () => void;
  onSpeedUp: () => void;
  onLaunch: () => void;
};
```

### Option B — WOS embed compact-controls mode

If controls are only wired inside WOS, use an embed query option:

```text
embed=1
chrome=0
controls=compact
routeController=compact
```

Then WOS renders the same controls in a compact top/side position instead of the bottom dock.

Required:

```text
no bottom dock
compact vehicle controls visible
map remains interactive
```

---

## Chrome Cleanup

## 1. Hide right Mapbox control stack

Hide in Broadcast embed mode:

```text
+ / -
compass
rotation
extra right-side Mapbox controls
```

Map must remain pan/zoom capable without visible controls.

---

## 2. Hide or absorb WOS telemetry

Hide WOS time/weather/telemetry block from iframe.

Current visible clutter includes:

```text
time
weather
humidity
precip
wind
deep night label
```

In Broadcast HUD, either:

```text
hide it entirely
```

or absorb values into PLAY micrographics later.

For this patch, preferred:

```text
hide WOS telemetry in embed
keep PLAY micrographics as the status layer
```

---

## 3. Keep PLAY micrographics

Keep:

```text
TypedTrackIndexOverlay
BroadcastMicrographicsGrid
Routes: Live
Canvas link
top play triangle
```

---

## 4. Keep map interaction

Do not break 0624Q.

Required:

```text
drag map → pan
scroll/trackpad → zoom
vehicle buttons click
overlays pointer-events none except buttons
```

---

## CSS / Layout Targets

Likely WOS targets:

```text
#wos-nav
.wos-nav-visible
.mapboxgl-ctrl-group
.wos-telemetry
#wos-hud
#hud-weather
#hud-clock
#hud-telemetry
```

Likely PLAY targets:

```text
.broadcast-operator-toolbar
.broadcast-microgrid
.broadcast-vehicle-controls
.hud-body
.hud-route-stage
```

Use actual class names in repo.

---

## Non-Goals

Do not implement:

```text
new vehicle simulation
new route engine
new route editor
new bottom dock
new capture mode
new still mode
freeze/16:9
fake route line
signal dot
dark haze
heavy HUD design overhaul
audio-reactive grid
metadata-reactive grid
3D sky
```

This is final chrome cleanup and vehicle-control recovery only.

---

## Acceptance Criteria

### A. Vehicle controls are accessible

Broadcast Operate mode exposes:

```text
Flight
Drive
Walk
Bike
Transit
Speed
Launch / Play
```

or equivalent existing route controls.

---

### B. No bottom dock returns

Controls are not displayed as a bottom bar/dock.

---

### C. Right Mapbox controls are hidden

The visible right-side Mapbox control stack is gone in Broadcast embed mode.

---

### D. WOS telemetry is hidden

The WOS time/weather/humidity/wind telemetry block is no longer visible over the map.

---

### E. Map remains interactive

In Operate mode:

```text
drag → pan
scroll/trackpad → zoom
```

---

### F. Vehicle controls work

Mode buttons and Launch/Speed controls still respond.

---

### G. Typed overlay remains

Track index overlay still appears/collapses correctly and remains pointer-transparent.

---

### H. Micrographics grid remains

Status grid remains sparse and technical.

---

### I. PLAY toolbar remains simple

Keep:

```text
Operate | Show | Snapshot | ▶ | Routes: Live | Canvas ↗
```

or compact equivalent.

---

### J. No removed clutter returns

Do not restore:

```text
fake line
signal dot
dark haze
capture/still/freeze/16:9 modes
emoji icons
bottom playback bar
full WOS cockpit chrome
```

---

### K. tsc clean

Run:

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
tsc -b
```

Expected:

```text
exits 0
```

If WOS files are touched, run the available lightweight WOS check if one exists.

---

## Manual Test Checklist

1. Start WOS local route server.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm map loads.

5. Confirm right Mapbox controls are hidden.

6. Confirm WOS telemetry/weather/time block is hidden.

7. Confirm vehicle controls are visible in compact non-bottom form.

8. Click Flight / Drive / Walk / Bike / Transit.

Expected:

```text
active mode changes or WOS control responds
```

9. Click Speed - / +.

Expected:

```text
speed changes if already supported
```

10. Click Launch / ▶.

Expected:

```text
route launches or existing route action fires
```

11. Drag map away from controls.

Expected:

```text
map pans
```

12. Scroll/trackpad zoom.

Expected:

```text
map zooms
```

13. Trigger track change.

Expected:

```text
typed overlay appears
```

14. Confirm micrographics grid still appears.

15. Confirm no bottom dock returns.

16. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD keeps the improved 0624S/T visual direction while restoring the controls needed to operate routes.

The screen should feel like:

```text
interactive map
top-bar play
compact vehicle controls
typed music index
micrographics status
no cockpit clutter
```

---

## Implementation Guide

- **Where:** WOS embed chrome CSS, PLAY Broadcast toolbar/control layer, optional compact `BroadcastVehicleControls`.
- **What:** Hide remaining right-side Mapbox/WOS telemetry chrome, restore vehicle mode/speed/launch controls in compact non-bottom form, preserve map interaction.
- **Expect:** Vehicle controls return without bringing back the bottom dock or old WOS cockpit interface.
