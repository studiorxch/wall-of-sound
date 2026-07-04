# 0624Z_PLAY_RestoreClockWeatherControlsAndProtectedAccessHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Restore Lost Broadcast Signals + Controls

This patch extends the 0624Y recovery because the clock and weather were also removed during Broadcast HUD cleanup.

The current problem is not visual polish.

The current problem is that working signals and controls were hidden globally:

```text
clock
weather
vehicle controls
camera controls
route controls
Studio / Canvas access
Subway Map access
Website access
Kinetic Fish access
```

That must stop.

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

## Failure Being Corrected

Recent cleanup patches hid WOS telemetry globally.

That removed:

```text
clock / time
weather
humidity
precipitation
wind
live status
vehicle controls
camera controls
route controls
```

This was wrong.

Clock and weather are not junk chrome.

They are protected Broadcast signals.

---

## Protected Infrastructure

The following are protected and must not be silently removed:

```text
Clock / time
Weather / atmosphere info
Vehicle controls
Camera controls
Route controls
Studio / Canvas
Subway Map
Website
Kinetic Fish
Broadcast HUD
3D Canvas
```

Any future cleanup patch that hides one of these must make it reversible through TAB/Show/Operate behavior.

---

## Correct Visibility Model

### Operate

Operate means working system.

Required visible/available:

```text
clock
weather
vehicle controls
camera controls
route controls
Studio / Canvas access
Subway Map access
Website access
Kinetic Fish access
map pan/zoom
typed overlay
micrographics
```

### Show

Show means clean broadcast surface.

Allowed hidden:

```text
controls
clock/weather detail
vehicle/camera deck
access links
```

But Show must be reversible:

```text
TAB restores controls and protected signals
Operate restores controls and protected signals
```

### TAB

TAB is the explicit hide/show toggle:

```text
controls visible -> TAB hides controls/signals
controls hidden -> TAB restores controls/signals
```

TAB must not create a permanent hidden state.

---

## Required Clock Recovery

Restore the clock/time signal.

Do not restore it as a giant uncontrolled WOS telemetry flood if that conflicts visually.

Preferred compact PLAY treatment:

```text
TIME  01:54 AM
ZONE  LOCAL / NYC
```

or:

```text
01:54 AM LOCAL
```

Required behavior:

```text
Operate + controlsVisible = true:
  clock visible

Show or controlsVisible = false:
  clock may hide or compress

TAB:
  restores clock
```

Do not hide clock globally in WOS embed CSS.

---

## Required Weather Recovery

Restore weather/atmosphere info.

Preferred compact PLAY treatment:

```text
WX    CLOUDS / 72°F
HUM   62%
PREC  0%
WIND  5 MPH
```

Only show fields that are actually available.

Required behavior:

```text
Operate + controlsVisible = true:
  weather visible

Show or controlsVisible = false:
  weather may hide or compress

TAB:
  restores weather
```

Do not hide weather globally without a replacement.

---

## Required Controls Recovery

Restore access to working controls:

```text
vehicle controls
camera controls
route/play controls
speed controls if wired
launch controls if wired
```

Do not leave final state as:

```text
VEH —
CAM —
```

unless exact blocker is documented after repo search.

A dash is not enough.

---

## Required Surface Access Recovery

Restore or explicitly resolve:

```text
Studio / Canvas ↗
Subway Map ↗
Website ↗
Kinetic Fish ↗
```

If missing, the UI must say why after repo search:

```text
Subway Map — route not found
Website — route not found
Kinetic Fish — route not found
```

Do not use a bare dash.

---

## Remove Global Hiding

Audit and remove unconditional hiding for protected signals.

Look for global rules such as:

```css
#world-telemetry-hud { display: none !important; }
#world-hud { display: none !important; }
.wt-reality { display: none !important; }
#wos-nav { display: none !important; }
```

Replace with state-aware rules:

```css
.controls-visible #world-telemetry-hud,
.controls-visible #world-hud,
.controls-visible .wt-reality,
.controls-visible #wos-nav {
  display: flex !important;
}

.controls-hidden #world-telemetry-hud,
.controls-hidden #world-hud,
.controls-hidden .wt-reality,
.controls-hidden #wos-nav {
  display: none !important;
}
```

Use actual class names and layout types.

If the original WOS telemetry is too large, either:

```text
A. show a compact PLAY-native clock/weather card
```

or:

```text
B. show the WOS telemetry only in Operate and hide it in Show/TAB-hidden state
```

Do not delete the information.

---

## Persistent Controls Rule

Controls and protected signals must remain visible after mount.

Required:

```text
Open Broadcast HUD
wait 5 seconds
clock/weather/controls still visible
```

No auto-hide after mount.

No localStorage hidden default.

No hidden state inherited from previous test.

No disappearing after iframe reload.

---

## Suggested PLAY-Native Signal Component

If WOS telemetry is too bulky, add:

```text
src/ui/BroadcastSignalStrip.tsx
```

Fields:

```ts
type BroadcastSignalStripProps = {
  timeLabel?: string;
  timezoneLabel?: string;
  weatherLabel?: string;
  humidityLabel?: string;
  precipLabel?: string;
  windLabel?: string;
  routeStatus?: string;
  controlsVisible: boolean;
};
```

Display only when:

```text
controlsVisible = true
```

or compactly in Operate.

---

## TAB State Requirements

Use:

```ts
const [controlsVisible, setControlsVisible] = useState(true);
```

Do not initialize from storage.

Do not persist to storage.

Do not auto-hide.

TAB is the only manual visibility toggle.

Operate sets:

```ts
setControlsVisible(true);
```

Show may set:

```ts
setControlsVisible(false);
```

Snapshot must restore previous state after any temporary hiding.

---

## Do Not Reintroduce

Do not bring back:

```text
bottom dock
bottom playback/status bar
capture mode
still mode
freeze mode
16:9 frame
fake route line
signal dot
dark haze
emoji controls
right Mapbox controls
dead active buttons
unbounded telemetry flood in Show
```

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastMicrographicsGrid.tsx
src/styles.css
```

Possible new file:

```text
src/ui/BroadcastSignalStrip.tsx
```

WOS/embed:

```text
wall/index.html
wall/styles.css
wall/traversalControlDeck.js
```

Use actual project file names.

---

## Acceptance Criteria

### A. Clock restored

In Operate with controls visible, clock/time is visible or available in compact signal strip.

---

### B. Weather restored

In Operate with controls visible, weather/atmosphere info is visible or available in compact signal strip.

---

### C. TAB hides clock/weather/controls

Press TAB.

Expected:

```text
controls and protected signal layer hide or compress
```

---

### D. TAB restores clock/weather/controls

Press TAB again.

Expected:

```text
clock, weather, vehicle/camera/route controls return
```

---

### E. Operate restores everything

Click Operate.

Expected:

```text
controlsVisible = true
clock visible
weather visible
controls visible
protected access visible
```

---

### F. Show is clean but reversible

Click Show.

Expected:

```text
clean surface
TAB restores controls/signals
Operate restores controls/signals
```

---

### G. No disappearing after mount

Open Broadcast HUD and wait 5 seconds.

Expected:

```text
controls, clock, and weather remain visible
```

---

### H. No hidden state persistence

Reload the page.

Expected:

```text
controls, clock, and weather visible by default
```

---

### I. Studio / Canvas restored

Studio / Canvas access opens.

---

### J. Subway / Website / Kinetic Fish resolved

Each is live or has explicit searched missing-route reason.

No bare dash.

---

### K. Vehicle controls restored or exact blocker shown

No bare `VEH —`.

---

### L. Camera controls restored or exact blocker shown

No bare `CAM —`.

---

### M. Map remains interactive

Map pan/zoom works with controls visible and hidden.

---

### N. tsc clean

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

1. Start WOS.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm controls visible.

5. Confirm clock visible.

6. Confirm weather visible.

7. Wait 5 seconds.

Expected:

```text
controls, clock, weather remain visible
```

8. Press TAB.

Expected:

```text
controls/signals hide
```

9. Press TAB again.

Expected:

```text
controls/signals return
```

10. Click Show.

Expected:

```text
clean surface
```

11. Press TAB.

Expected:

```text
controls/signals return
```

12. Click Operate.

Expected:

```text
controls/signals visible
```

13. Drag/zoom map.

Expected:

```text
map remains interactive
```

14. Test Studio / Canvas.

15. Test protected access entries.

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

The Broadcast HUD stops deleting working signals.

Clock and weather return as protected Broadcast information.

Controls return by default.

TAB hides and restores them.

Show remains clean but no longer destroys access.

---

## Implementation Guide

- **Where:** Broadcast HUD state, protected signal/controls layer, WOS embed CSS.
- **What:** Restore clock and weather as protected signals; remove global telemetry hiding or replace with compact PLAY-native signal strip; keep controls visible by default and TAB-reversible.
- **Expect:** Clock, weather, vehicle/camera/route controls, and protected access no longer disappear during cleanup.
