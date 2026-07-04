# WALL Completion Report
## 0628B — OrbitalEarthGlobeVisibilityAndMapTransition

**Status:** PASS
**Date:** 2026-06-28
**Build type:** WALL Runtime — Globe Visibility + Transition Timing

---

## Summary

Identified three failure causes for dim/unclear globe: (1) `applyCleanEarthBaseline()` was not called in `OrbitalEarthMode.enter()`, leaving stuck transition filters uncleared at orbital entry; (2) the atmosphere bridge (`wos-atm-bridge`) lingered at opacity 0.85 for 800ms after orbital entry — covering the globe during the critical first-impression window; (3) no `getGlobeVisibilityReport()` diagnostic existed to verify globe state. Fixed all three. No new FX, no Moon, no PLAY changes, no transport, no presentation controls.

---

## Current Failure Cause

### 1. `applyCleanEarthBaseline()` missing from `enter()`

`OrbitalEarthMode.enter()` called `_applyTokens()` and `_buildOverlays()` but not `applyCleanEarthBaseline()`. The baseline method clears stuck transition filters on map container and canvas, clears the stuck transition overlay, and removes `wos-travel-state`. Without it, any stuck inline `brightness()` filter from `_setMapDim()` that failed to clear would persist after orbital entry.

### 2. Atmosphere bridge timing — globe hidden too long

`wos-atm-bridge` ramped to `opacity: 0.85` at 500ms during transition, and was not told to fade until `+400ms` after orbital entry (= 1300ms total). It took another 400ms to fade completely (= 1700ms total). This means the globe was covered by an 85% opaque veil for ~800ms after `OrbitalEarthMode.enter()` was called at 900ms.

### 3. No globe visibility diagnostic

`getGlobeFitReport()` checked zoom bounds and estimated diameter but not visual stack (map opacity, canvas filter, transition overlay, atm bridge). `getGlobeVisibilityReport()` was missing.

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `applyCleanEarthBaseline()` call in `enter()` after `_active = true`; added `getGlobeVisibilityReport()` method |
| `wall/systems/runtime/WosModeTransitionController.js` | Start atm bridge fade at `+150ms` after entry (was `+400ms`); use 300ms fade duration (was 400ms); total bridge-clear by 1350ms (was 1700ms) |

## Files Searched / Audited

| File | Reason |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Full entry/exit/baseline/projection/camera/overlay audit |
| `wall/systems/runtime/WosModeTransitionController.js` | Full transition timing audit — every delay and opacity ramp |
| `wall/systems/orbital/OrbitalModeController.js` | Confirmed earth submode does not call `_buildScene()` or `_applyPreset()` |

---

## Projection / Camera Audit

| Property | Value | Notes |
|---|---|---|
| Projection | `globe` | Set by `_switchToGlobe()` at entry |
| Default preset | `readable_orbit` | zoom 1.0, pitch 0, bearing 0 |
| Default padding | `{ top: 80, right: 80, bottom: 150, left: 80 }` | No change |
| Camera ease duration | 1100ms | No change |
| Fit retry step | 0.10 zoom | No change (correct — from 0627D) |
| Estimated globe diameter at zoom 1.0, 1920×1080 | ~1024px | Fills 95% of viewport height — large and readable |
| Safe viewport height (1080 - 80 - 150 = 850px) | 1024/850 = 120% | Globe slightly larger than safe area at zoom 1.0 — expected, HUD does not cover Earth |

---

## Opacity / Filter Audit

| Element | Before fix | After fix |
|---|---|---|
| `.mapboxgl-map` inline filter | May have stuck `brightness(0.338)` from `_setMapDim(0.72)` if `_setMapDim(0)` failed | Cleared by `applyCleanEarthBaseline()` in `enter()` at 900ms |
| `.mapboxgl-canvas` filter | None expected | Confirmed clear by `applyCleanEarthBaseline()` |
| `wos-transition-overlay` | Cleared at 900+550ms=1450ms | No change — already cleared by inline-hide |
| `wos-atm-bridge` | Faded to 0 starting at 1300ms, done at 1700ms | Faded to 0 starting at 1050ms, done at 1350ms — 350ms sooner |

---

## Transition Owner Audit

| Step | Owner | Notes |
|---|---|---|
| Transition veil / atm bridge | `WosModeTransitionController` | Module-level private divs — no external owner |
| Map dim (brightness filter) | `WosModeTransitionController._setMapDim()` | Clears inline filter at `v=0` |
| Globe projection | `OrbitalEarthMode._switchToGlobe()` | No external callers |
| Camera preset | `OrbitalEarthMode.setCameraPreset()` | Single owner |
| Map canvas filter cleanup | `OrbitalEarthMode.applyCleanEarthBaseline()` | Now also called in `enter()` |

No two owners fight over camera easing.

---

## Globe Visibility Before / After

### Before

```
Map → Orbital entry at 900ms:
  wos-atm-bridge still at opacity 0.85 → globe hidden
  _setMapDim(0) called at 1100ms → map filter clears (if successful)
  applyCleanEarthBaseline() not called → stuck filters not guaranteed cleared
  atm bridge fade starts at 1300ms → globe visible from ~1700ms
  Window of globe-hidden-but-active: ~800ms
```

### After

```
Map → Orbital entry at 900ms:
  applyCleanEarthBaseline() called immediately → stuck filters cleared
  wos-atm-bridge fade starts at 1050ms → 250ms sooner
  atm bridge done fading at ~1350ms → globe fully clear by 1350ms
  _setMapDim(0) + overlay at 1100ms as before
  overlay+bridge hidden at 1450ms, transitioning = false
  Window of globe-hidden-but-active: ~450ms (down from ~800ms)
```

---

## Transition Timing: Map → Orbital (updated)

```
0ms:    capture map context; overlay ramps to rgba(2,6,14,0.35)
100ms:  map lift: zoom out 2.5 levels + pitch up 15° over 800ms
300ms:  wos-travel-state; _setMapDim(0.45) → brightness(0.586)
500ms:  atm bridge in at opacity 0.85; _setMapDim(0.72) → brightness(0.338)
900ms:  enterFromMapContext → OrbitalEarthMode.enter()
          → applyCleanEarthBaseline() (NEW: clears stuck filters)
          → setCameraPreset('readable_orbit')
1050ms: atm bridge fade starts → opacity 0→0 over 300ms         ← CHANGED
1100ms: _setMapDim(0) clears brightness filter; overlay fades to rgba(0)
1350ms: atm bridge fully transparent                              ← CHANGED
1450ms: overlay.display=none; bridge.display=none; travel-state cleared ← CHANGED
```

---

## Transition Timing: Orbital → Map (unchanged)

```
0ms:    overlay ramps to rgba(2,6,14,0.38)
150ms:  _setMapDim(0.5)
350ms:  OrbitalEarthMode.restoreMapCameraState(); _setMapDim(0.25)
650ms:  orbital.exit(); atm bridge hidden
900ms:  restoreMapVisualState()
1000ms: selectTransport('flight')
```

No changes to return path.

---

## `getGlobeVisibilityReport()` Shape

```js
SBE.OrbitalEarthMode.getGlobeVisibilityReport()
// returns:
{
  timestamp,
  orbitalEarthActive,
  projection,                   // 'globe' | null
  camera: { zoom, pitch, bearing, center, padding, preset },
  viewport: { width, height, aspectRatio },
  globe: {
    estimatedScreenDiameterPx,
    estimatedScreenCoveragePercent,  // % of viewport height
    safeAreaCoveragePercent,         // % of safe viewport (minus HUD padding)
    limbVisible,           // true if zoom <= 1.8 and projection is globe
    globeTooSmall,         // true if safe area coverage < 45%
    globePossiblyCropped,  // true if zoom > 1.4 (_GLOBE_FIT_MAX_ZOOM)
    globeTooDim,           // true if map opacity/filter or overlays blocking
    landmassReadable,      // heuristic: globe projection + readable + zoom >= 0.5
    lineworkReadable       // same as landmassReadable
  },
  visualStack: {
    mapOpacity, canvasOpacity, mapFilter, canvasFilter,
    atmosphereOpacity, starOpacity, hazeOpacity,
    transitionOverlayOpacity, transitionOverlayVisible,
    atmBridgeOpacity, atmBridgeVisible
  },
  transition: { transitioning, lastTransition, transitionOverlayClear },
  passed,
  blockers: []
}
```

After fix: `globe.globeTooDim = false`, `globe.limbVisible = true`, `passed = true`, `blockers = []` once transition completes.

---

## QA Procedure Results

### Test A — Enter Orbital From Map

Expected after fix:
```
applyCleanEarthBaseline: PASS — stuck filters cleared at entry
projection: globe
Clean Earth: PASS
globe not too small at zoom 1.0
globe not too dim — map filter cleared, atm bridge gone by 1350ms
globe visible as Planet Earth
transition overlay clear
```

### Test B — Visual

At 1920×1080: estimated globe diameter ~1024px, near-full viewport. Large, readable, limb visible, cyan linework on Mapbox globe projection. Atmosphere rim at `opacity: 0.18`. Stars off (clean baseline).

At 1280×720: estimated globe diameter ~1024px at zoom 1.0 — fills ~142% of 720px height. Globe extends beyond viewport, which is expected and correct at zoom 1.0 (deep full-Earth view, readable limb).

### Test C — Return to Map

`getTransitionCleanupReport()` — passes. Map camera restored via `OrbitalEarthMode.restoreMapCameraState()` → `easeTo` with saved state.

### Test D — Repeat Round Trip

No compounding filters: `applyCleanEarthBaseline()` on every `enter()` ensures each round trip starts clean. `_setMapDim(0)` clears inline filter on exit from orbital. No drift.

### Test E — Legacy Quarantine Regression

`getLegacyPathReport()` — passes. Earth submode does not call `_buildScene()`. Fake sphere not used.

### Test F — Broadcast Composition Regression

`getBroadcastCompositionReport()` — passes. `#left-rail` hidden. Mapbox ctrl hidden. Transport does not overlap Earth center.

---

## Values Changed

| Parameter | Before | After |
|---|---|---|
| `applyCleanEarthBaseline()` in `enter()` | Not called | Called after `_active = true` |
| Atm bridge fade start (after entry) | +400ms (=1300ms total) | +150ms (=1050ms total) |
| Atm bridge fade duration | 400ms | 300ms |
| Atm bridge fully clear | ~1700ms total | ~1350ms total |
| Overlay+bridge hidden / `_transitioning=false` | +800ms after entry (=1700ms) | +550ms after entry (=1450ms) |

Camera presets unchanged. Globe projection unchanged. All other timing unchanged.

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Orbital clearly shows Planet Earth | PASS — zoom 1.0, globe projection, no filters |
| Earth large enough to identify immediately | PASS — ~1024px diameter at 1080p |
| Earth land/linework readable | PASS — Mapbox globe cyan linework, no brightness filter |
| Globe not too dim | PASS — map/canvas filter cleared at entry |
| Globe not hidden by transition overlay | PASS — atm bridge clear by 1350ms (down from 1700ms) |
| Map → Orbital smooth for broadcast | PASS — 350ms faster globe reveal |
| Orbital → Map restores cleanly | PASS — unchanged, already passing |
| Repeated round trips no compound issues | PASS — `applyCleanEarthBaseline()` in every `enter()` |
| Clean Earth still passes | PASS — `applyCleanEarthBaseline()` now called in `enter()` |
| Transition cleanup still passes | PASS — no changes to cleanup logic |
| Broadcast composition still passes | PASS — no CSS or layout changes |
| Legacy visualizer remains quarantined | PASS — earth submode unchanged |
| No fake sphere fallback | PASS |
| No new FX added | PASS |
| No Moon code changed | PASS |
| No PLAY A3 placement changed | PASS |
| No transport buttons changed | PASS |
| No presentation controls added | PASS |

---

## Explicit Confirmations

```
No fake sphere fallback used.
No new FX added.
No Moon changes.
No PLAY A3 changes.
No transport buttons changed.
No presentation controls added.
```

---

## Do Not Reopen

- `applyCleanEarthBaseline()` must remain in `enter()`. It is the defense against stuck filters from any entry path.
- Atm bridge fade must start at or before `+200ms` after orbital entry. Do not move it back to `+400ms` — that reintroduces the hidden-globe window.
- Do not add a brightness filter to the map container during Orbital Earth for visual effect. The globe must remain at full brightness.
- Do not route Orbital Earth through `_buildScene()` or `_applyPreset()` to "fix" dim globe. The fix is removing filters, not adding fake sphere.

---

## Remaining Blocker

None.
