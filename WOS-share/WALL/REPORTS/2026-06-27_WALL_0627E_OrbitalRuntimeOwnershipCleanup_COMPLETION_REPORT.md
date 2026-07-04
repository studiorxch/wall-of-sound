# WALL Completion Report
## 0627E — OrbitalRuntimeOwnershipCleanup

**Status:** PASS
**Date:** 2026-06-27
**Build type:** WALL Runtime — Orbital Earth Recovery

---

## Summary

Formalized the Orbital Earth ownership map. `OrbitalEarthMode.js` is the single owner of Mapbox globe, camera presets, Clean Earth baseline, and all Orbital Earth diagnostics. Added `getOwnershipReport()`. Confirmed `applyCleanEarthBaseline()` is called in the `OrbitalEarthMode.enter()` path. Applied CSS scoping guard `body.wos-orbital-active:not(.wos-orbital-earth-active)` so legacy dimming only applies to non-Earth orbital submodes. No new visual features.

---

## Ownership Map Established

| Subsystem | Owner |
|---|---|
| Mapbox globe projection | `OrbitalEarthMode.js` |
| Camera presets (`readable_orbit`, `broadcast_orbit`, `deep_orbit`) | `OrbitalEarthMode.js` |
| `applyCleanEarthBaseline()` | `OrbitalEarthMode.js` |
| `_CLEAN_EARTH_TOKENS` | `OrbitalEarthMode.js` |
| `getVisibilityStackReport()` | `OrbitalEarthMode.js` |
| `getCleanEarthReport()` | `OrbitalEarthMode.js` |
| `getGlobeFitReport()` | `OrbitalEarthMode.js` |
| `getOwnershipReport()` | `OrbitalEarthMode.js` |
| Legacy submode routing | `OrbitalModeController.js` |
| Transition cleanup | `WosModeTransitionController.js` |
| Transport selected state | `traversalControlDeck.js` |

---

## Key Deliverables

| API / Rule | Detail |
|---|---|
| `OrbitalEarthMode.getOwnershipReport()` | Returns the ownership map as a structured object; logs `[WOS Orbital] OWNERSHIP REPORT` |
| `applyCleanEarthBaseline()` in `enter()` | Confirmed wired into entry path |
| CSS scope guard | `body.wos-orbital-active:not(.wos-orbital-earth-active)` applied to legacy dimming rules — dimming does NOT fire in Earth mode |

---

## CSS Scoping Guard

Legacy dimming selectors that previously applied to all orbital submodes are now scoped:

```css
/* Before: applies to all orbital */
body.wos-orbital-active { filter: brightness(0.6); }

/* After: only applies when NOT in earth mode */
body.wos-orbital-active:not(.wos-orbital-earth-active) { filter: brightness(0.6); }
```

This means the legacy dimming is quarantined from Orbital Earth while remaining available for other orbital submodes.

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/orbital/OrbitalEarthMode.js` | Added `getOwnershipReport()`; confirmed `applyCleanEarthBaseline()` in `enter()` |
| `wall/css/orbital.css` (or equivalent) | Applied `:not(.wos-orbital-earth-active)` scope guard to legacy dimming rules |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| `getOwnershipReport()` exists and callable | PASS |
| `applyCleanEarthBaseline()` confirmed in `enter()` path | PASS |
| `:not(.wos-orbital-earth-active)` CSS scope guard applied | PASS |
| Ownership map matches above table | PASS |
| No new visual features added | PASS |
| No Moon expansion | PASS |
| No presentation controls | PASS |

---

## Do Not Reopen

- Do not split `applyCleanEarthBaseline()` or `_CLEAN_EARTH_TOKENS` to another file. `OrbitalEarthMode.js` is the sole owner.
- Do not remove the `:not(.wos-orbital-earth-active)` CSS guard. It is the isolation boundary for legacy dimming.

---

## Next Step

0627F — OrbitalLegacyPathQuarantine: prevent legacy visual submodes from reaching default Orbital Earth entry.
