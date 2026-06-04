---
spec: 0528V_WOS_TraversalControlDeck_v1.0.0
status: active
classification: presentation-control-ui
created: 2026-05-28
depends_on:
  - 0528S_WOS_PresentationModeTabToggle_v1.0.0
  - 0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0
  - 0528R_WOS_AircraftContrailAndNavLighting_v1.0.0
  - 0528Q_WOS_CloudAtmosphereTransitionSmoothing_v1.0.0
  - 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0
---

# WOS Traversal Control Deck v1.0.0

## Purpose

Replace console orchestration with a bottom-bar broadcast control surface.
The user can choose a channel, tune atmosphere, set speed, and click
**Launch Drift** — no console commands required for normal watchability sessions.

---

## What Changed

### NEW: `wall/systems/presentation/traversalControlDeck.js` v1.0.0

Fixed-position 48px bottom bar, dark translucent, monospace type.
Hidden in presentation mode via `data-watch-hide`.
Suppresses `#ws-lower-panel` on mount (deck replaces it).
localStorage persistence under key `wos.traversalDeck.v1`.

**Layout (left → right):**
```
[FROM▾ → TO▾] | [Mode▾] | [Channel▾] | [Atmo▾ P:── S:──] | [Spd:──] | [Cam● Sml:──] | [Lights● Contrails●] | [Cont● Veil●] |              [Launch Drift]
```

**Channel catalog:**
| Channel | Atmo | P | S | Spd | Mode |
|---|---|---|---|---|---|
| Surface | thin | 0.10 | 0.72 | 0.70x | surface_glide |
| Aquarium Network | harbor_fog | 0.22 | 0.78 | 0.55x | surface_glide |
| Sounds Fishy | harbor_fog | 0.28 | 0.66 | 0.65x | surface_glide |
| Wet Dreams — After Hours | storm_shelf | 0.34 | 0.82 | 0.45x | surface_glide |
| Skyline Drift | thin | 0.18 | 0.60 | 0.80x | regional |

Selecting a channel updates all controls but does not auto-launch.

**Launch sequence** (guarded — missing systems warn but don't fail):
1. `_wos.presentationMode(true)`
2. `_wos.debug.regionalFlight.stop()`
3. `rf.origin(from)` → `rf.destination(to)` → `rf.plan()` → `rf.startPlan()` (planner path)
4. Fallback: `rf.start('nyc_to_boston_regional_001')`
5. `rf.profile(mode)` — applies traversal profile
6. `rf.speed(speed)` / `rf.cameraRig(on)` / `rf.cameraSmooth(v)`
7. `atmosphere.preset(atmo)` / `atmosphere.pressure(v)` / `atmosphere.silence(v)`
8. `aircraftResidue.contrails(on)` / `aircraftResidue.lights(on)`
9. `mapContinuity.*` — optional, warns if 0528W not yet loaded

**Public API:**
```js
SBE.TraversalControlDeck = {
  VERSION, mount, unmount, show, hide,
  getState, setState, launch, resetDefaults
}
```

**Debug companion:**
```js
_wos.debug.traversalDeck.audit()
_wos.debug.traversalDeck.show()
_wos.debug.traversalDeck.hide()
_wos.debug.traversalDeck.launch()
_wos.debug.traversalDeck.resetDefaults()
```

### PATCHED: `wall/index.html`

Added `traversalControlDeck.js` load after `regionalFlightTripDebug.js`.

---

## Usage

1. Open WOS — deck appears at the bottom of the screen
2. Select FROM / TO airports
3. Select a Channel (updates all recommended values)
4. Adjust sliders if needed
5. Click **Launch Drift**
6. Deck hides automatically (presentation mode → `data-watch-hide`)
7. Press Tab to toggle deck back / Tab again to re-hide

---

## Known Limitations

- `mapContinuity.*` calls silently skip until 0528W is built
- Route planner fallback always uses `nyc_to_boston_regional_001` if plan fails
- No freeform destination search (future)
- `setState()` triggers remount (simple — deck is lightweight)

---

## Success Criteria

- [x] No console commands needed for normal watchability sessions
- [x] Channel selection updates recommended values
- [x] Launch Drift starts full orchestrated session
- [x] Deck hides in presentation mode (data-watch-hide)
- [x] Missing optional systems (mapContinuity) fail gracefully with warn
- [x] localStorage persists settings across reloads
- [x] Console APIs remain available for debugging
- [x] Does not mutate runtime internals directly
