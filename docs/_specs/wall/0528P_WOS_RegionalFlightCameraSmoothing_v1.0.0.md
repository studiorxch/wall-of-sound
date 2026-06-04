---
spec: 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0
status: active
classification: camera-presentation-runtime
created: 2026-05-28
depends_on:
  - 0528K_WOS_RegionalFlightTripRuntime_v1.0.0
  - 0528N_WOS_RegionalFlightPresencePass_v1.0.0
  - 0528O_WOS_RegionalFlightPlanner_v1.0.0
---

# WOS Regional Flight Camera Smoothing v1.0.0

## Purpose

Replace the cadence-based (1.2s interval) trip camera with a
requestAnimationFrame loop that exponentially smooths zoom, pitch, bearing,
and center position. Camera reads as a patient aerial observer, not a map
follow lock.

---

## What Changed

### NEW: `wall/systems/presentation/regionalFlightCameraRig.js` v1.0.0

**rAF loop** — runs at display frame rate (~60fps). Resolves desired camera
state from `RegionalFlightTripRuntime.getState()` each frame, smooths toward
it, pushes to `MapboxViewportRuntime.jumpTo()` (instant, no Mapbox animation
queue conflict). Falls back to `flyTo({ duration: 0 })` if `jumpTo` unavailable.

**Frame-rate-independent smoothing:**
```js
alphaFrame = 1 - pow(1 - alphaBase, dt / 16.667)
```
dt is clamped to 100ms to prevent large jumps on tab-return.

**Phase-aware base alphas (normalized to 60fps):**

| Phase     | center | zoom  | pitch | bearing |
|-----------|--------|-------|-------|---------|
| PREPARE   | 0.040  | 0.025 | 0.020 | 0.030  |
| TAXI_HOLD | 0.055  | 0.030 | 0.025 | 0.040  |
| TAKEOFF   | 0.160  | 0.090 | 0.065 | 0.090  |
| CLIMB     | 0.110  | 0.055 | 0.040 | 0.065  |
| CRUISE    | 0.075  | 0.038 | 0.025 | 0.038  |
| DESCENT   | 0.095  | 0.050 | 0.032 | 0.058  |
| ARRIVAL   | 0.080  | 0.055 | 0.038 | 0.050  |

**Camera target curves:**
```js
targetZoom    = 12.5 - altScalar * 4.6        // 12.5→7.9
targetPitch   = 42 + altScalar * 18           // 42°→60°
targetBearing = (headingDeg - 18 + 360) % 360 // 18° behind heading
```

**Ahead-of-aircraft framing bias (meters in front of aircraft):**

| Phase     | Ahead offset |
|-----------|-------------|
| TAKEOFF   | 280m        |
| CLIMB     | 480m        |
| CRUISE    | 750m        |
| DESCENT   | 380m        |
| ARRIVAL   | 80m         |

Shift computed via flat-earth heading offset. Aircraft sits behind center so
scenery ahead fills the frame — observational composition, not GPS lock.

**Bearing wrap-safe interpolation** — always takes the shortest arc through
0/360 boundary.

**Trip camera handoff** — on `start()`, saves
`RegionalFlightTripRuntime.cameraFollowEnabled` then calls `rt.setCamera(false)`
to silence the 1.2s timer. On `stop()`, restores the saved state.

**Snap** — `snapToCurrent()` bypasses easing, snaps smoothed state to desired
instantly. Useful after `jump()` to avoid camera catching up across a large
progress skip.

**smoothingMultiplier** — scales all alphas (0.1×–3.0×). Debug-only.

Public API (frozen):
```js
SBE.RegionalFlightCameraRig = {
  VERSION,
  start, stop, setEnabled, getEnabled,
  setProfile, getProfile,
  setSmoothing, getSmoothing,
  snapToCurrent, getState
}
```

### PATCHED: `regionalFlightTripDebug.js` v1.2.0 → v1.3.0

Four new debug commands:

```js
_wos.debug.regionalFlight.cameraRig(true)     // start rig (disables trip timer)
_wos.debug.regionalFlight.cameraRig(false)    // stop rig (restores trip timer)
_wos.debug.regionalFlight.cameraRigState()    // desired vs smoothed + lag deltas
_wos.debug.regionalFlight.cameraSmooth(0.5)  // slower/dreamier
_wos.debug.regionalFlight.cameraSmooth(1.5)  // snappier
_wos.debug.regionalFlight.cameraSnap()       // instant snap to current desired
```

### Load order

```
regionalFlightTripRuntime.js
regionalFlightPlanner.js
...
regionalFlightCameraRig.js    ← NEW (before debug companion)
regionalFlightTripDebug.js    ← patched v1.3.0
```

---

## Quick start replaced

Old: `.start() → .speed(60) → .camera(true) → .jump(0.5)`
New: `.start() → .speed(60) → .cameraRig(true) → .jump(0.5)`

(`.camera(true)` still exists for the fallback 1.2s timer when rig is off.)

---

## Console Verification

```js
// Canonical preset
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.jump(0.5)
_wos.debug.regionalFlight.cameraRigState()

// Planner route
_wos.debug.regionalFlight.origin('JFK')
_wos.debug.regionalFlight.destination('PHL')
_wos.debug.regionalFlight.profile('scenic_coastal')
_wos.debug.regionalFlight.plan()
_wos.debug.regionalFlight.startPlan()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)

// Snap after jump
_wos.debug.regionalFlight.jump(0.76)
_wos.debug.regionalFlight.cameraSnap()

// Smoothing tuning
_wos.debug.regionalFlight.cameraSmooth(0.5)  // dreamier
_wos.debug.regionalFlight.cameraSmooth(1.5)  // snappier
_wos.debug.regionalFlight.cameraSmooth(1.0)  // restore default
```

---

## Validation Checklist

- [x] No visible 1.2s stepping — rAF loop runs at frame rate
- [x] Zoom changes gradual (alpha 0.025–0.090)
- [x] Pitch changes slowest component (alpha 0.020–0.065)
- [x] Bearing never whips — wraps via shortest arc, slow alpha (0.030–0.090)
- [x] Cruise feels calm (all alphas at minimum values)
- [x] Takeoff active but not twitchy (alphas elevated)
- [x] Arrival controlled (moderate alphas)
- [x] Ahead-of-aircraft framing: 750m at cruise, tapers for arrival
- [x] Trip runtime camera timer silenced when rig is active
- [x] Trip runtime camera restored on rig stop
- [x] Works with canonical NYC→BOS preset
- [x] Works with planner-generated airport-to-airport routes
- [x] Works with skyline_approach and scenic_coastal profiles
- [x] snapToCurrent() for clean debug jumps
- [x] smoothingMultiplier adjustable at runtime
- [x] No aircraft entity mutation
- [x] No route truth mutation
- [x] No cloud preset mutation
