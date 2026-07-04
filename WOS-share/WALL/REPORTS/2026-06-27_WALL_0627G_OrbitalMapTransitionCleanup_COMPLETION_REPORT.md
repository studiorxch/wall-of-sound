# WALL Completion Report
## 0627G — OrbitalMapTransitionCleanup

**Status:** PASS
**Date:** 2026-06-27
**Build type:** WALL Runtime — Orbital Earth Recovery

---

## Summary

Verified and fixed the Map → Orbital Earth → Map round trip. All stuck body classes, transition overlay residue, map filter/opacity residue, and transport state residue are now cleared on return. `wos-transition-active` and `wos-map-dimmed` removed in both `WosModeTransitionController` and the inline fallback. `.mapboxgl-canvas-container` filters and opacity cleared on map return. `getTransitionCleanupReport()` added to `SBE.WosModeTransitionController`. Repeated round trips produce no compounding residue. No new visual features.

---

## Canonical Entry Route (confirmed intact)

```text
traversalControlDeck orbital button
→ WosModeTransitionController.transitionToOrbital()
→ OrbitalMapContext.capture()
→ OrbitalModeController.enterFromMapContext(ctx, "earth")
→ OrbitalEarthMode.enter()
→ OrbitalEarthMode.applyCleanEarthBaseline()
→ OrbitalEarthMode.setCameraPreset("readable_orbit")
```

---

## Canonical Return Route (confirmed intact)

```text
transport button deselects orbital
→ WosModeTransitionController.transitionToMap()
→ OrbitalEarthMode.restoreMapCameraState()
→ OrbitalModeController.exit()
→ OrbitalEarthMode.exit()
→ WosModeTransitionController.restoreMapVisualState()
→ traversalControlDeck.selectTransport("flight")
```

---

## Cleanup Targets — Delivered

| Cleanup Target | Method | Result |
|---|---|---|
| `wos-transition-active` body class | Cleared in `WosModeTransitionController` + inline fallback | PASS |
| `wos-map-dimmed` body class | Cleared in `WosModeTransitionController` + inline fallback | PASS |
| `wos-orbital-active` | Cleared in `OrbitalEarthMode.exit()` | PASS |
| `wos-orbital-earth-active` | Cleared in `OrbitalEarthMode.exit()` | PASS |
| `wos-travel-state` | Cleared on return | PASS |
| `.mapboxgl-canvas-container` filter/opacity | Cleared in `restoreMapVisualState()` | PASS |
| Transition overlay | Opacity ≤ 0.02, display none after transition | PASS |
| Camera restore | `restoreMapCameraState()` restores center/zoom/pitch/bearing | PASS |
| Transport selected state | `selectTransport("flight")` on return | PASS |
| Moon classes | Absent from round-trip route | PASS |
| Presentation classes | Absent from round-trip route | PASS |
| Legacy visualizer | Absent (quarantined by 0627F) | PASS |

---

## Key API Delivered

| API | Behavior |
|---|---|
| `SBE.WosModeTransitionController.getTransitionCleanupReport()` | Returns phase-stamped report of body classes, map filter/opacity, transition overlay, orbital state, transport state, leaks, passed boolean, and blockers array |

---

## `getTransitionCleanupReport()` Shape

```js
{
  timestamp,
  phase: "before_orbital" | "after_orbital_entry" | "after_return_to_map",
  bodyClasses,
  map: { containerOpacity, containerFilter, canvasOpacity, canvasFilter,
         projection, zoom, pitch, bearing, center },
  transitionOverlay: { exists, display, visibility, opacity, pointerEvents },
  orbital: { orbitalActive, earthActive, cameraPreset, savedCameraStateExists },
  transport: { selectedTransport, orbitalSelected, flightSelected },
  leaks: { moonClassesActive, presentationClassesActive, legacyVisualizerActive },
  passed,
  blockers: []
}
```

---

## Repeat Round-Trip QA

Map → Orbital → Map → Orbital → Map:
- No compounding filters
- No compounding body classes
- No worsening brightness
- No stuck camera
- No stuck overlay
- No legacy visualizer

All clean.

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/WosModeTransitionController.js` | Added `wos-transition-active` / `wos-map-dimmed` removal; added `getTransitionCleanupReport()`; canvas-container filter/opacity cleared in `restoreMapVisualState()` |
| `wall/systems/orbital/OrbitalEarthMode.js` | `exit()` clears `wos-orbital-active`, `wos-orbital-earth-active`; inline fallback cleanup added |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Map → Orbital → Map: no stuck body classes | PASS |
| Transition overlay clears after entry and return | PASS |
| Map/canvas filter and opacity restored after return | PASS |
| Camera restores after return | PASS |
| Transport selected state restores cleanly | PASS |
| Repeated round trips no compounding residue | PASS |
| Moon classes absent | PASS |
| Presentation classes absent | PASS |
| Legacy visualizer absent | PASS |
| No new visual features | PASS |
| No presentation controls | PASS |
| No Moon expansion | PASS |
| No transport buttons | PASS |

---

## Do Not Reopen

- `wos-transition-active` and `wos-map-dimmed` must be cleared in both `WosModeTransitionController` and the inline fallback. Removing one cleanup site will cause stuck dimming on async transition races.
- `.mapboxgl-canvas-container` filter/opacity must be cleared explicitly — do not rely on class removal alone.

---

## Chain Complete

The 0627 Orbital Earth Recovery chain (0627, 0627C, 0627D, 0627E, 0627F, 0627G) is complete.

**Next:** 0627H — OrbitalFxReintroductionPass. FX layer (soft rim, origin marker, route arc, subtle stars, scan ring, audio pulse, signal particles) may now be reintroduced incrementally against the clean baseline.
