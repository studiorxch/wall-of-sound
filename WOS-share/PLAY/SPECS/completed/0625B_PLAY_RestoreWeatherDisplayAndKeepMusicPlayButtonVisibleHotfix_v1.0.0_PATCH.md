# 0625B_PLAY_RestoreWeatherDisplayAndKeepMusicPlayButtonVisibleHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Fix Remaining Broadcast Signal + Playback UI Regression

0625A is not complete.

Current failures:

```text
weather still does not display
music play button disappeared / became effectively unavailable
```

The UI must not remove the play button just because the current playlist is empty.

The weather display must not stop at `WX SOURCE MISSING` unless the repo has been searched and no local/available source exists.

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

## Current State After 0625A

Working:

```text
clock visible
zone visible
WOS vehicle route controls visible
WOS Launch visible
Operate visible
Routes Live visible
tsc clean
```

Still broken:

```text
weather data is not visible
top music play button is missing or too disabled/dim to use
empty playlist state blocks visible playback control
```

---

## Required Product Rule

Do not remove the play button.

Even when no track is loaded, the music play control must remain visible and explain the state.

Correct empty state:

```text
PLAY
NO TRACK LOADED
```

or:

```text
▶
LOAD TRACK
```

Wrong empty state:

```text
button disappears
button becomes invisible
button is disabled with no useful explanation
```

---

## Required Play Button Behavior

The top music play button must always be visible when controls are visible.

States:

```text
No track loaded:
  visible but disabled
  label/title explains NO TRACK LOADED
  does not disappear

Track loaded + paused:
  visible
  ▶
  click plays current track

Track loaded + playing:
  visible
  ❚❚ or PAUSE
  click pauses current track
```

Do not use the top music play button for WOS route launch.

Route launch stays in WOS nav.

---

## Required Weather Behavior

Weather must display if any weather source exists.

If the cross-origin iframe cannot be read, do not stop there.

Search and use one of:

```text
WOS in-app weather store/state
WOS local weather module
existing hardcoded/demo weather source
existing telemetry object
existing mock weather source
existing city/weather settings
PLAY-side forecast/source object
current WOS weather text rendered in same-origin DOM if available
```

Only if none exists after repo search may the UI show:

```text
WX SOURCE MISSING — no local weather source found
```

Current `WX SOURCE MISSING` is insufficient if it only means:

```text
cannot read cross-origin iframe
```

That is not enough.

---

## Weather Source Search Required

Search repo for:

```text
weather
Weather
humidity
precip
precipitation
wind
forecast
temperature
temp
cloud
clouds
world-telemetry
worldTelemetry
wt-reality
world-hud
worldHud
atmosphere
conditions
```

Do this in both:

```text
/Users/studio/Projects/wall-of-sound
/Users/studio/Projects/wall-of-sound/play/flow-curve-builder
```

---

## Weather Implementation Options

### Option A — Recover WOS weather source

Preferred.

If WOS already calculates weather, expose a compact value to PLAY.

Possible bridge:

```text
window.postMessage({ type: "wos:weather", payload })
```

or local same-origin access if iframe permits.

Display in PLAY signal strip.

### Option B — PLAY-side fallback weather object

If WOS weather is currently static/demo data, mirror it as a simple PLAY-side source.

Example:

```ts
const fallbackWeather = {
  condition: "CLOUDS",
  tempF: 72,
  humidity: 62,
  precip: 0,
  windMph: 5,
  source: "fallback"
};
```

Use only if this matches prior project behavior or existing mock source.

### Option C — Explicit missing after real search

Only if no source exists.

Show:

```text
WX SOURCE MISSING — searched WOS/PLAY, no weather module found
```

Not just:

```text
WX SOURCE MISSING
```

---

## Required Signal Strip Layout

Display compactly in bottom-left or micrographic signal strip:

```text
TIME  02:25:46 AM
ZONE  NEW YORK
WX    CLOUDS 72°F
HUM   62%
PREC  0%
WIND  5 MPH
```

If unavailable after search:

```text
WX    SOURCE MISSING — NO WEATHER MODULE FOUND
```

Do not hide weather line entirely.

---

## Visibility Model

Controls and signals visible by default.

```text
Open Broadcast HUD -> controls visible, play visible, clock visible, weather visible/status visible
Wait 5 seconds -> still visible
Reload -> visible again
TAB -> hides controls/signals
TAB again -> restores controls/signals
Show -> may hide
Operate -> restores
```

No hidden state persistence.

No auto-hide.

---

## Required Fix For Current Screenshot

The current screenshot shows:

```text
TIME visible
ZONE visible
WX SOURCE MISSING
top play button not available as a clear music control
```

After this patch, the screenshot must show either:

```text
WX CLOUDS 72°F / HUM / PREC / WIND
```

or a detailed searched missing reason.

And it must show a visible music control:

```text
▶ NO TRACK
```

or:

```text
▶
```

with disabled but readable state.

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
full telemetry flood in Show
```

---

## Files Likely Touched

PLAY:

```text
src/ui/BroadcastHudShell.tsx
src/ui/BroadcastOperatorOverlay.tsx
src/ui/BroadcastSignalStrip.tsx
src/styles.css
src/App.tsx
```

Search for playback files:

```text
src/state/*
src/hooks/*
src/audio/*
src/playlist/*
src/ui/MinimalBroadcastTransport.tsx
```

WOS/weather if needed:

```text
wall/index.html
wall/styles.css
wall/**/*.js
```

Use actual file names.

---

## Acceptance Criteria

### A. Play button visible with no track

With empty playlist/no current track:

```text
top music play control remains visible
state says NO TRACK / LOAD TRACK / disabled with tooltip
```

It must not disappear.

---

### B. Play button works with track

With a track loaded:

```text
click top play -> music plays
click again -> music pauses/stops
```

---

### C. Play button is not route launch

Top play controls music only.

WOS Launch controls route.

---

### D. Weather source searched

Developer must search repo for weather source terms.

---

### E. Weather displays if source exists

If weather source exists, display actual weather fields.

---

### F. Weather missing state is explicit

If no source exists, display exact reason:

```text
WX SOURCE MISSING — no local weather module found after search
```

or equivalent.

---

### G. Weather line is never silently removed

The weather row must be visible in Operate when controlsVisible is true.

---

### H. TAB hides/restores play/weather

TAB hides controls/signals.

TAB again restores play/weather.

---

### I. Operate restores play/weather

Click Operate.

Expected:

```text
play button visible
weather visible/status visible
```

---

### J. No auto-hide

Wait 5 seconds.

Expected:

```text
play button and weather remain visible
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

---

## Manual Test Checklist

1. Start WOS.

2. Start PLAY.

```bash
cd /Users/studio/Projects/wall-of-sound/play/flow-curve-builder
npm run dev
```

3. Open Broadcast HUD.

4. Confirm music play button is visible.

5. Confirm if no track loaded it says NO TRACK / disabled but visible.

6. Load/select a playlist track.

7. Click music play.

Expected:

```text
audio plays
```

8. Click again.

Expected:

```text
audio pauses/stops
```

9. Confirm weather line is visible.

10. Confirm weather actual fields or explicit searched missing reason.

11. Press TAB.

Expected:

```text
controls/signals hide
```

12. Press TAB again.

Expected:

```text
controls/signals return
```

13. Click Show.

14. Click Operate.

Expected:

```text
play/weather return
```

15. Wait 5 seconds.

Expected:

```text
play/weather remain visible
```

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

Broadcast HUD keeps the recovered controls and signals:

```text
clock visible
weather visible or honestly sourced/missing
music play button visible even with no track
music play button plays actual audio when a track exists
route Launch remains separate
TAB hides/restores controls and signals
no bottom dock returns
```

---

## Implementation Guide

- **Where:** Broadcast signal strip, top music play button, playback state wiring, weather source lookup/bridge.
- **What:** Keep music play visible in every controls-visible state and recover real weather from existing WOS/PLAY sources before falling back to explicit missing status.
- **Expect:** No missing play button, no silent weather loss.
