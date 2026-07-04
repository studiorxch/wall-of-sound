# WALL Completion Report
## 0627I — MoonGateRevalidationAfterOrbitalCleanup

**Status:** PASS
**Date:** 2026-06-28
**Build type:** WALL Runtime — Moon Gate Revalidation

---

## Summary

Revalidated Moon Mode gate after the 0627–0627H Orbital Earth Recovery chain. Three targeted patches: (1) added public `enter()` alias to `MoonModeController` so QA console tests match the gate path; (2) fixed the blocked-entry log to match the spec-required string `[WOS Moon] BLOCKED — Orbital Earth inactive`; (3) expanded all Moon exit/return cleanup to clear the full Moon body class set (`wos-moon-active`, `wos-moon-transit-active`, `wos-moon-orbit-active`, `wos-moon-surface-active`, `wos-moon-returning`). Added `getGateReport()` diagnostic to `SBE.MoonModeController`. No new Moon visuals, no presentation controls, no transport buttons.

---

## Moon Gate — Before / After

| Condition | Before | After |
|---|---|---|
| Public `enter()` method | Missing — only `enterFromOrbitalEarth()` existed | Added as alias to `enterFromOrbitalEarth()` |
| Blocked log text | `[WOS Moon] BLOCKED\n  reason: must enter...` | `[WOS Moon] BLOCKED — Orbital Earth inactive` |
| Full Moon class cleanup on exit | Only `wos-moon-active` removed | All 5 Moon classes cleared via `_MOON_CLASSES` |
| `getGateReport()` | Not present | Added to `SBE.MoonModeController` |
| Gate rule | `OrbitalEarthMode.isActive()` check in `enterFromOrbitalEarth()` | Unchanged — gate was already correct |

---

## Blocked Entry Tests

### Test A — Normal map / Flight mode

`SBE.OrbitalEarthMode.isActive()` returns `false` from map:

```text
SBE.MoonModeController.enter()
→ [WOS Moon] BLOCKED — Orbital Earth inactive
→ returns false
→ no Moon body classes added
→ moon state remains 'inactive'
```

PASS.

### Test B — Legacy visualizer path

Legacy visualizer adds `wos-orbital-active` but not `wos-orbital-earth-active`. `OrbitalEarthMode.isActive()` returns false because it checks its own internal `_active` flag:

```text
SBE.MoonModeController.enter()
→ [WOS Moon] BLOCKED — Orbital Earth inactive
→ returns false
```

PASS.

### Test C — Presentation placeholder

`WosPresentationRouter` is DORMANT (no current UI calls `selectPresentationMode()`). Even if called manually, it does not set `OrbitalEarthMode.isActive()`:

```text
SBE.WosPresentationRouter.selectPresentationMode?.("card")
SBE.MoonModeController.enter()
→ [WOS Moon] BLOCKED — Orbital Earth inactive
→ returns false
```

PASS.

---

## Allowed Entry Test

### Test D — Orbital Earth active

After canonical entry (traversalControlDeck → `WosModeTransitionController.transitionToOrbital()` → `OrbitalEarthMode.enter()`):

```text
SBE.OrbitalEarthMode.isActive()  →  true
SBE.MoonModeController.enter()   →  true
[WOS Moon] ENTER TRANSIT (prev: inactive)
wos-moon-active added to body
```

PASS.

---

## Return Tests

### Test E — Moon return to Orbital Earth

`returnToOrbitalEarth()` now clears all `_MOON_CLASSES` before returning control to `OrbitalEarthMode`:

```text
_MOON_CLASSES.forEach(classList.remove)
→ wos-moon-active cleared
→ wos-moon-transit-active cleared
→ wos-moon-orbit-active cleared
→ wos-moon-surface-active cleared
→ wos-moon-returning cleared
→ state: 'inactive'
→ [WOS Moon] RETURN ORBITAL EARTH
```

`OrbitalEarthMode.getVisibilityStackReport()` / `getCleanEarthReport()` — no Moon classes present, Orbital Earth readable. PASS.

### Test F — Moon return to Map

`exit()` now clears all `_MOON_CLASSES`. After return-to-map via `WosModeTransitionController`, `getTransitionCleanupReport()` passes: no stuck Moon classes, no stuck filters, camera restored. PASS.

---

## `getGateReport()` Shape

```js
{
  timestamp,
  moonActive,                 // this._state !== 'inactive'
  moonState,                  // 'inactive' | 'cislunar_transit' | 'lunar_orbit' | 'lunar_surface'
  orbitalEarthActive,         // OrbitalEarthMode.isActive()
  orbitalCleanEarthPassed,    // from getCleanEarthReport().passed
  orbitalCameraPreset,        // from getGlobeFitReport().currentPreset
  legacyVisualizerActive,     // wos-orbital-active && !wos-orbital-earth-active
  presentationModeActive,     // WosPresentationRouter.getCurrentMode() !== null
  allowedToEnterMoon,         // true when orbitalEarthActive
  blockedReason,              // null | 'Orbital Earth inactive'
  bodyClasses,
  moonClassesActive,          // which _MOON_CLASSES are on body
  orbitalClassesActive,       // which orbital classes are on body
  returnTarget,               // 'orbital_earth' | 'map'
  leaks: {
    moonClassesInMap,
    moonClassesInOrbitalEarth,
    legacyVisualizerDuringMoon,
    presentationDuringMoon
  },
  passed,
  blockers: []
}
```

---

## Body Classes Cleared on Exit

| Class | Before | After |
|---|---|---|
| `wos-moon-active` | Cleared in exit/return | Cleared via `_MOON_CLASSES` loop |
| `wos-moon-transit-active` | Not cleared | Cleared via `_MOON_CLASSES` loop |
| `wos-moon-orbit-active` | Not cleared (only cleared by OrbitView.exit()) | Cleared via `_MOON_CLASSES` loop |
| `wos-moon-surface-active` | Not cleared (only cleared by SurfaceView.exit()) | Cleared via `_MOON_CLASSES` loop |
| `wos-moon-returning` | Not cleared | Cleared via `_MOON_CLASSES` loop |

Note: `MoonOrbitView` and `MoonSurfaceView` each clear their own body class on `exit()` — the `_MOON_CLASSES` loop in `MoonModeController` is an additional safety net ensuring nothing leaks if a subview exits abnormally.

---

## Files Edited

| File | Change |
|---|---|
| `wall/systems/moon/MoonModeController.js` | Added `_MOON_CLASSES` constant; added `enter()` public alias; fixed blocked log text; updated `exit()` + `returnToOrbitalEarth()` to use `_MOON_CLASSES` loop; added `getGateReport()` |

## Files Searched

| File | Reason |
|---|---|
| `wall/systems/moon/MoonOrbitView.js` | Confirmed `wos-moon-orbit-active` class ownership |
| `wall/systems/moon/MoonSurfaceView.js` | Confirmed `wos-moon-surface-active` class ownership |
| `wall/systems/moon/CislunarTransitController.js` | Confirmed no rogue body class additions |
| `wall/systems/runtime/WosModeTransitionController.js` | Confirmed Moon class inclusion in transition cleanup |
| `wall/systems/runtime/WosStartupCoordinator.js` | Confirmed Moon class inclusion in startup cleanup |
| `wall/systems/orbital/OrbitalEarthMode.js` | Confirmed `isActive()` method is correct gate source |

---

## Acceptance Criteria Result

| Criterion | Result |
|---|---|
| Moon cannot enter from normal map | PASS |
| Moon cannot enter from legacy visualizer alone | PASS |
| Moon cannot enter from presentation mode alone | PASS |
| Moon can enter only when `OrbitalEarthMode.isActive()` is true | PASS |
| Blocked entry logs `[WOS Moon] BLOCKED — Orbital Earth inactive` | PASS |
| Blocked entry leaves no partial Moon state | PASS |
| Allowed entry starts from clean Orbital Earth | PASS |
| Moon classes cleared after Moon exit/return | PASS |
| Return to Orbital Earth leaves Orbital readable | PASS |
| Return to map passes transition cleanup | PASS |
| Legacy visualizer absent during Moon path | PASS |
| Presentation router remains dormant | PASS |
| No new Moon visuals added | PASS |
| No presentation controls added | PASS |
| No transport buttons added | PASS |

---

## Do Not Reopen

- The gate check in `enterFromOrbitalEarth()` — `OrbitalEarthMode.isActive()` — must remain the single source of truth for Moon authorization. Do not add secondary gates or bypass conditions.
- `_MOON_CLASSES` is the canonical list. If a new Moon body class is added, it must be included in `_MOON_CLASSES`.
- `enter()` is an alias only — it must always call `enterFromOrbitalEarth()` and never bypass the gate.

---

## Features Not Touched

- No Moon visuals
- No Moon camera behaviors
- No lunar surface features
- No presentation controls
- No transport buttons
- No Orbital FX
- No new architecture systems

---

## Remaining Blocker

None. Moon gate is correctly gated, diagnostic is available, cleanup is complete.
