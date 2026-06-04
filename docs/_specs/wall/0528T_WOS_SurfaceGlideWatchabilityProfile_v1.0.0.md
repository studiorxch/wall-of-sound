---
spec: 0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0
status: active
classification: presentation-runtime
created: 2026-05-28
depends_on:
  - 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0
  - 0528S_WOS_PresentationModeTabToggle_v1.0.0
---

# WOS Surface Glide Watchability Profile v1.0.0

## Purpose

Low-altitude environmental traversal mode. Aircraft skims at 200ft (~60m AGL)
across the full route at street/water level. Camera stays tight and steep — no
climb arc, no regional overview, no satellite drift.

Good for: cities, harbors, coastlines, underwater/floating-world channels later.

---

## What Changed

### UPDATED: `wall/systems/world/regionalFlightTripRuntime.js` v1.1.0 → v1.2.0

**Added `TRAVERSAL_PROFILES` table:**

```js
TRAVERSAL_PROFILES = {
  regional:      { altOverride: false }       // standard arc (climb/cruise/descent)
  surface_glide: {
    altOverride:    true,
    altFt:          200,      // ~60m AGL
    altScalar:      0.05,     // drives camera zoom/pitch — pinned low
    lifecycleState: 'CRUISE', // below 0.62 — contrails never fire
  }
}
```

**Added `_traversalProfileId` state** — default `'regional'`, reset on `stop()`.

**`_applyStateToEntity()` override** — when `surface_glide`:
- `altFt = 200`, `altScalar = 0.05` (fixed — no climb/descent arc)
- `routeT = p` (full normalized progress drives position directly, skips PREPARE/TAXI stall)
- `speedKts = cruiseKts * 0.04` (~17kts, ~20km/h surface speed)
- `lifecycleState = 'CRUISE'`

**Added `setTraversalProfile(id)` / `getTraversalProfile()`** to public frozen API.

### UPDATED: `wall/systems/presentation/regionalFlightCameraRig.js` v1.0.0 → v1.1.0

**Added `SURFACE_GLIDE_PHASE_ALPHAS`** — faster center convergence (0.10 vs 0.075
for cruise) — close to ground, scenery changes more rapidly.

**Added `SURFACE_GLIDE_FRAMING_AHEAD_M`** — 80–120m lookahead (vs 380–750m for
regional cruise). Subject stays in foreground, not shrunk by distance.

**Added `_targetZoomGlide(altScalar)`** — `16.8 - altScalar * 12` → ~16.8 at surface

**Added `_targetPitchGlide(altScalar)`** — `68 - altScalar * 160` → ~67° at surface

**Added `_targetBearingGlide(headingDeg)`** — 10° off-axis (vs 18° regional)

**`_resolveDesired()`** — branches on `_profileId === 'surface_glide'` to use
glide curves and SURFACE_GLIDE_FRAMING_AHEAD_M.

**`_smooth()`** — branches alpha table on profile.

**`setProfile(id)`** — now resets `_smoothed.initialized = false` so camera
snaps to new profile rather than sliding in from previous zoom level.

### UPDATED: `wall/systems/presentation/regionalFlightTripDebug.js` v1.3.0 → v1.4.0

**`profile(id)`** — now routes to traversal OR planner:
- `profile('surface_glide')` | `profile('regional')` → `rt.setTraversalProfile()`
- `profile('direct')` | etc. → planner (existing)
- `profile()` — prints both tables

**`surfaceGlide(bool?)`** — shorthand:
- `surfaceGlide(true)` — sets profile, mirrors camera rig, turns contrails off
- `surfaceGlide(false)` — restores regional
- `surfaceGlide()` — read state

---

## Camera Values (surface_glide)

| Parameter     | Value          |
|---|---|
| Zoom          | ~16.8 (street-level tight) |
| Pitch         | ~67–68° (steep, ground-locked) |
| Bearing offset| 10° behind heading |
| Lookahead     | 80–120m |
| Center alpha  | 0.100 (cruise phase) |

Compare to regional cruise: zoom ~10.4, pitch ~51°, lookahead 750m.

---

## Test Command Sequence

```js
_wos.presentationMode(true)

_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.profile('surface_glide')
_wos.debug.regionalFlight.speed(1)
_wos.debug.regionalFlight.cameraRig(true)

_wos.debug.atmosphere.preset('thin')
_wos.debug.atmosphere.pressure(0.12)
_wos.debug.atmosphere.silence(0.6)

_wos.debug.aircraftResidue.contrails(false)
_wos.debug.aircraftResidue.lights(true)
```

Or shorthand:
```js
_wos.debug.regionalFlight.surfaceGlide(true)
```

---

## Success Criteria

- [x] Camera stays close to ground/water — zoom ~16.8, pitch ~68°
- [x] Route feels like 50m surface skimming — no climb arc
- [x] No high-altitude zoom-out
- [x] No regional map overview
- [x] Movement feels slow (~17kts) — immersive, inhabitable
- [x] Contrails off (altScalar 0.05 < 0.62 eligibility threshold)
- [x] profile('regional') restores full arc behavior
- [x] Camera snaps immediately to new profile (no lerp from regional zoom)

---

## Future Residue Types (not in this build)

- wake trails (water displacement)
- bioluminescent residue
- particle drift
- water disturbance ripples

These require a separate `SurfaceResidueRenderer` seeded from `glyphSeed`
infrastructure. `residueType: 'surface_wake'` can be added to AircraftSkyResidueRenderer
as a future hook matching the `glyph_seed` pattern.
