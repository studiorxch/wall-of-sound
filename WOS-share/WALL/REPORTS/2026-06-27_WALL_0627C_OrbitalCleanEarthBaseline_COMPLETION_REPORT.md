# WALL Completion Report
## 0627C — OrbitalCleanEarthBaseline

**Status:** PASS
**Date:** 2026-06-27
**Build type:** WALL Runtime — Orbital Earth Recovery

---

## Summary

Added `applyCleanEarthBaseline()` and `getCleanEarthReport()` to `OrbitalEarthMode.js`. Establishes the canonical default visual state when Orbital Earth is entered: Mapbox globe + linework + soft rim + minimal origin marker + HUD. Stars, scan rings, haze, vignette, fake sphere, and legacy visualizer all default to off. `_CLEAN_EARTH_TOKENS` defines all styling thresholds. Called as part of the standard `OrbitalEarthMode.enter()` flow.

---

## Key Deliverables

| API | Behavior |
|---|---|
| `OrbitalEarthMode.applyCleanEarthBaseline()` | Applies `_CLEAN_EARTH_TOKENS`, turns off stars/scan/haze/vignette/fake sphere, logs `[WOS Orbital] CLEAN EARTH BASELINE APPLIED` |
| `OrbitalEarthMode.getCleanEarthReport()` | Returns token state, default-on/off status of all overlays, baseline passed boolean |
| `_CLEAN_EARTH_TOKENS` | Internal token table (see below) |

---

## `_CLEAN_EARTH_TOKENS` Values

| Token | Value |
|---|---|
| `atmosphereOpacity` | 0.12 – 0.22 range (day/night variants) |
| `originOpacity` | 0.35 – 0.60 |
| `starOpacity` | 0 (default off) |
| `orbitalRimOpacity` | active (soft rim on) |
| `orbitalHazeOpacity` | 0 (default off) |

---

## Default State After `applyCleanEarthBaseline()`

**Default ON:** Mapbox globe projection, linework layer, soft rim, minimal origin marker, HUD
**Default OFF:** stars, scan rings, haze, vignette, fake sphere, Three.js visualizer, portal orb, Moon

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `_CLEAN_EARTH_TOKENS`, `applyCleanEarthBaseline()`, `getCleanEarthReport()`; `enter()` calls `applyCleanEarthBaseline()` |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| `applyCleanEarthBaseline()` exists and callable | PASS |
| `getCleanEarthReport()` exists and callable | PASS |
| `_CLEAN_EARTH_TOKENS` defined with correct ranges | PASS |
| Stars default to 0 / off | PASS |
| Stars/scan/haze/vignette/fake sphere all off by default | PASS |
| Globe + linework + rim + origin + HUD default on | PASS |
| Called in `enter()` path | PASS |
| No new FX or visual modes added | PASS |

---

## Do Not Reopen

- Do not add stars, haze, or vignette to the default baseline. They are FX layer work (0627H).
- `_CLEAN_EARTH_TOKENS` is the single source for baseline values — do not scatter defaults across multiple files.

---

## Next Step

0627D — OrbitalCameraFramingCorrection: camera presets for readable globe framing.
