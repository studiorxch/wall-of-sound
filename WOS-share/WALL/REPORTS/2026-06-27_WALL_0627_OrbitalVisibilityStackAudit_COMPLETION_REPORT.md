# WALL Completion Report
## 0627 — OrbitalVisibilityStackAudit

**Status:** PASS
**Date:** 2026-06-27
**Build type:** WALL Runtime Diagnostic — Orbital Earth Recovery

---

## Summary

Added `SBE.OrbitalEarthMode.getVisibilityStackReport()` — a full DOM/style/camera/token/audio diagnostic for Orbital Earth. The method audits every layer in the visibility stack (body classes, map canvas/container, transition overlay, orbital overlays, style tokens, audio mode, camera) and produces a `suspects` array identifying dimming sources with severity and `mostLikelyDimmingSource`. Logged as `[WOS Orbital] VISIBILITY STACK REPORT` to console. No visual features added.

---

## Key Deliverable

| API | Behavior |
|---|---|
| `SBE.OrbitalEarthMode.getVisibilityStackReport()` | Returns full visibility stack report; logs `[WOS Orbital] VISIBILITY STACK REPORT` + `console.table(suspects)`; logs `[WOS Orbital] VISIBILITY STACK CLEAN` if no suspects |

---

## Report Shape Delivered

```js
{
  timestamp, orbitalEarthActive, runtimeMode, presentationMode, bodyClasses,
  camera: { preset, zoom, pitch, bearing, center, projection, globeFitReport },
  map: { mapExists, containerExists, canvasExists, styleLoaded,
         containerComputedStyle, canvasComputedStyle,
         containerInlineStyle, canvasInlineStyle },
  transition: { active, overlayExists, overlayComputedStyle, overlayInlineStyle,
                bodyTravelState, bodyOrbitalState },
  overlays: { atmosphere, scanRing, stars, origin, destination, routeArc, anyOtherOrbitalOverlay },
  tokens: { orbitalSurfaceBrightness, orbitalLineOpacity, orbitalAtmosphereOpacity,
            orbitalRimOpacity, orbitalRimRadius, orbitalHazeOpacity,
            orbitalStarOpacity, orbitalOriginOpacity },
  audio: { controllerExists, mode, active, lastSignalsKnown },
  suspects: [],
  mostLikelyDimmingSource,
  recommendedPatch
}
```

---

## Suspect Rules Implemented

- Map canvas/container: opacity < 0.98, destructive filter, hidden, display none
- Transition overlay: exists + opacity > 0.02 + not display none
- Orbital overlays: atmosphere > 0.35, haze > 0, stars > 0 at clean baseline, origin > 0.7
- Body classes: stuck travel state, Moon/presentation class during Orbital
- Camera: zoom too low (globe tiny), projection not globe

Priority order for `mostLikelyDimmingSource`: transition overlay → map filter/opacity → body class → atmosphere/haze → style token → camera → marker dominance.

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `getVisibilityStackReport()` public method |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| `getVisibilityStackReport()` exists and callable | PASS |
| Reports body classes, camera, map styles, transition overlay, overlays, tokens, audio | PASS |
| Suspects array with explicit rules | PASS |
| `mostLikelyDimmingSource` computed | PASS |
| No new visual features added | PASS |
| No Moon expansion | PASS |
| No presentation controls | PASS |
| No transport buttons | PASS |

---

## Do Not Reopen

- Do not add visual guessing without first running `getVisibilityStackReport()`. The diagnostic must precede any dimming fix.

---

## Next Step

0627C — OrbitalCleanEarthBaseline: use report findings to establish clean default Orbital Earth state.
