# 0625A_PLAY_RestoreWeatherAndWirePlayToMusicPlaybackHotfix_v1.0.0_PATCH

## Status

Ready for implementation.

## Priority

P0 / Restore Missing Weather + Make Play Actually Play Music

0624Z restored the clock and brought back WOS vehicle controls, but it is still incomplete.

Current failures:

```text
weather is still missing
PLAY top ▶ does not play music
```

This patch fixes those two issues directly.

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

## Current Verified State After 0624Z

Working:

```text
TIME is visible and ticking
ZONE NEW YORK is visible
WOS nav restored
Vehicle controls visible
Operate active by default
TAB hides/restores controls
Studio / Canvas access visible
tsc clean
```

Still broken:

```text
weather is missing
top PLAY ▶ does not play music
```

---

## Required Product Rule

The top PLAY button must not be fake.

If it is a music play button, it must play/pause the current playlist track.

If it is a route launch button, it must be labeled as route launch.

Current user expectation:

```text
▶ should play music
```

Therefore this patch makes the PLAY top button control music playback.

---

## Required Weather Recovery

Weather must be restored as a protected Broadcast signal.

Visible in Operate / controlsVisible:

```text
WX
TEMP
HUM
PRECIP
WIND
```

Only show fields that are available.

Do not show a bare missing dash unless the source truly cannot be found after search.

Preferred compact strip:

```text
TIME  02:17:18 AM
ZONE  NEW YORK
WX    CLOUDS / 72°F
HUM   62%
PREC  0%
WIND  5 MPH
```

If weather source is unavailable, show explicit source state:

```text
WX SOURCE MISSING
```

or:

```text
WX OFFLINE — WOS weather source not found
```

No silent omission.

---

## Weather Source Search

Before creating placeholder weather text, search the repo for existing weather fields/sources.

Search terms:

```text
weather
humidity
precip
precipitation
wind
temperature
temp
forecast
world-telemetry
wt-reality
world-hud
```

Likely WOS elements already existed:

```text
#world-telemetry-hud
#world-hud
.wt-reality
```

0624U hid these. 0624Z restored time but not weather.

Recover weather data from the same source if possible.

---

## Weather Implementation Options

### Option A — PLAY-native compact weather strip

Preferred if weather data can be read or bridged.

Add or update:

```text
src/ui/BroadcastSignalStrip.tsx
```

Props:

```ts
type BroadcastSignalStripProps = {
  timeLabel?: string;
  timezoneLabel?: string;
  weatherLabel?: string;
  tempLabel?: string;
  humidityLabel?: string;
  precipLabel?: string;
  windLabel?: string;
  controlsVisible: boolean;
};
```

Render only available fields.

### Option B — WOS telemetry compact restore

If weather is only available inside WOS, restore the weather fields in Operate only, but style them compactly.

Required:

```text
controlsVisible true / Operate:
  weather visible

controlsVisible false / Show:
  weather hidden
```

Do not bring back the full telemetry flood in Show.

---

## Required Music Playback Fix

The top PLAY `▶` button must control music playback.

Required behavior:

```text
Click ▶:
  if no track playing -> play current track
  if track playing -> pause current track or toggle pause
```

Button state:

```text
▶ = stopped/paused
❚❚ = playing
```

or equivalent text if icons conflict.

Do not use emoji.

---

## Music Playback Source Search

Search current app for playback state/actions.

Search terms:

```text
audio
Audio
HTMLAudioElement
playback
playing
isPlaying
playTrack
pauseTrack
currentTrack
currentSlot
selectedPlaylist
activePlaylist
transport
usePlayback
player
playlist
```

Likely old component names to check:

```text
MinimalBroadcastTransport
BroadcastHudShell
FlowCurveBuilder
Playlist
Scheduler
```

Important: 0624R removed the bottom transport visually. It may have removed the only music playback control path.

If the old playback logic still exists, reuse it.

Do not rebuild a new player if existing playback actions exist.

---

## Music Playback Implementation Options

### Option A — Reuse existing playback action

Preferred.

Wire the top PLAY button to existing audio playback state/action:

```ts
onClick={togglePlayback}
```

Expected:

```text
current track starts playing
button reflects playing state
typed overlay can still trigger on track change
```

### Option B — Restore hidden transport logic without bottom dock

If playback was inside the removed bottom transport:

```text
restore the logic/state
do not restore the visual bottom dock
wire top PLAY button to that logic
```

### Option C — Minimal HTMLAudioElement fallback

Only if no existing playback action exists.

Use current track audio URL if present:

```ts
const audioRef = useRef<HTMLAudioElement | null>(null);
```

But do not invent fake audio URLs.

If current track has no playable source, the button must show explicit state:

```text
NO AUDIO SOURCE
```

---

## Required Play Button Truthfulness

The button must not imply playback if it only launches route/motion.

If route launch is still needed, separate labels:

```text
MUSIC ▶
ROUTE LAUNCH
```

or:

```text
PLAY MUSIC
LAUNCH ROUTE
```

But the user specifically expects the play button to play music, so the top `▶` must become music playback.

---

## Route Launch Control

Route launch already exists in WOS nav as `Launch`.

Keep that separate.

Do not make the PLAY top music button trigger route launch.

---

## Controls Visibility

Weather and play button must follow current visibility rules:

```text
Operate / controlsVisible true:
  weather visible
  play button visible
  controls visible

Show or TAB-hidden:
  controls may hide
  typed overlay and map remain
```

When controls are restored via TAB, weather and play button must return.

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
```

Possible existing playback files:

```text
src/state/*
src/hooks/*
src/audio/*
src/playlist/*
src/ui/MinimalBroadcastTransport.tsx
```

WOS/embed if weather is only there:

```text
wall/index.html
wall/styles.css
wall/*telemetry*
```

Use actual project file names.

---

## Acceptance Criteria

### A. Weather visible

In Operate with controls visible:

```text
weather appears in the signal strip or compact WOS telemetry
```

Fields shown if available:

```text
WX
TEMP
HUM
PREC
WIND
```

---

### B. Weather not silently missing

If weather cannot be sourced, UI shows explicit reason:

```text
WX SOURCE MISSING
```

or equivalent.

A blank weather area is not acceptable.

---

### C. TAB hides/restores weather

TAB hides weather with controls.

TAB again restores weather.

---

### D. Show hides weather but remains reversible

Show may hide weather.

TAB or Operate restores it.

---

### E. PLAY button plays music

Click top `▶`.

Expected:

```text
current track audio starts playing
```

---

### F. PLAY button toggles state

When playing, button reflects playing state.

Click again pauses/stops according to existing playback model.

---

### G. PLAY button is not route launch

Route launch remains in WOS controls.

Top PLAY is music playback.

---

### H. No fake playback

If no audio source exists for the current track, show explicit state:

```text
NO AUDIO SOURCE
```

Do not pretend playback started.

---

### I. Bottom dock does not return

No bottom playback bar/dock returns.

---

### J. Existing overlays remain

Typed track index and micrographics remain.

---

### K. Map remains interactive

Map pan/zoom works.

---

### L. tsc clean

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

4. Confirm clock visible.

5. Confirm weather visible or explicit source-missing message.

6. Confirm PLAY top button visible.

7. Click PLAY.

Expected:

```text
music plays
```

or, if no source:

```text
explicit NO AUDIO SOURCE
```

8. Click PLAY again.

Expected:

```text
music pauses/stops
```

9. Press TAB.

Expected:

```text
controls/weather hide
```

10. Press TAB again.

Expected:

```text
controls/weather return
```

11. Click Show.

Expected:

```text
clean surface
```

12. Click Operate.

Expected:

```text
weather and controls return
```

13. Confirm WOS Launch remains route control.

14. Run:

```bash
tsc -b
```

Expected:

```text
exits 0
```

---

## Expected Result

Broadcast HUD becomes honest and operable:

```text
clock visible
weather visible
top PLAY plays music
route Launch remains route Launch
TAB hides/restores controls and signals
no bottom dock returns
```

---

## Implementation Guide

- **Where:** Broadcast signal strip/weather source, Broadcast top PLAY button, existing playback state/actions.
- **What:** Restore weather as a protected signal and wire top PLAY to actual music playback instead of route launch or fake UI.
- **Expect:** Weather returns and the PLAY button actually plays the current track.
