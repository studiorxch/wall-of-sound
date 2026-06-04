---
spec: 0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0
status: active
classification: presentation-continuity-runtime
created: 2026-05-28
depends_on:
  - 0528V_WOS_TraversalControlDeck_v1.0.0
  - 0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0
---

# WOS 3D Building Continuity and Prewarm v1.0.0

## Purpose

Reduce visible Mapbox fill-extrusion building pop-in during surface-glide and
broadcast traversal. Buildings should feel like they exist before the camera
arrives, not like they materialize because a tile finished loading.

---

## What Changed

### NEW: `wall/systems/presentation/buildingContinuityRuntime.js` v1.0.0

Runs at 2–4 Hz probe cadence. Does not run every frame. Does not reload style.

**Building layer detection** — scans active style for `fill-extrusion` type layers.
Finds all matching layers, stores IDs. Re-runs if no layers found on first probe.

**Readiness state model:**
```js
{
  buildingLayersFound, buildingLayerIds,
  tilesLoaded,         styleReady,
  visibleFeatureCount, aheadFeatureCount,
  readinessScalar,     popInRiskScalar,
  denseZoneRiskScalar, gatingRecommended,
  veilRecommended,     fadePolicyActive
}
```

**Probe tactics (layered, non-destructive):**

| Tactic | Mechanism | Default |
|---|---|---|
| A — Query warmup | `queryRenderedFeatures` current viewport at 3 Hz | ON when enabled |
| B — Ahead probes | 4 sample points at 150/300/600/1000m in heading direction | ON when enabled |
| C — Speed gating | `effectiveSpeed = max(0.25, current * 0.80)` when tiles cold | `autoGate = false` |
| D — Veil hint | `AtmosphericContinuityRuntime.hintVeil(scalar)` when risk high | `veilEnabled = false` |
| E — Extrusion fade | `setPaintProperty('fill-extrusion-opacity')` smoothstep 1200ms | `fadePolicyActive = false` |

Tactic E is disabled by default — requires explicit `setFadePolicy(true)` and carries
the risk of fighting `MapStyleAuthority` if it exists.

**Route-ahead probes** — if `RegionalFlightTripRuntime` is active, projects
`progress + [0.003, 0.006, 0.012, 0.024]` ahead on the active route and queries
building features there. Runs at 1.25 Hz.

**Idle listener** — attaches `map.on('idle')` and `map.on('sourcedata')` once to
track time-since-last-idle for audit reporting.

**Public API (frozen):**
```js
SBE.BuildingContinuityRuntime = {
  VERSION, start, stop, setEnabled, getEnabled,
  setAutoGate, getAutoGate, setVeil, getVeil,
  setFadePolicy, getFadePolicy,
  detectLayers, prewarmAhead, getState
}
```

### NEW: `wall/systems/presentation/buildingContinuityDebug.js` v1.0.0

Binds `_wos.debug.buildingContinuity`:

```js
_wos.debug.buildingContinuity.audit()          // full state + risk bars
_wos.debug.buildingContinuity.enabled(true)    // start monitoring
_wos.debug.buildingContinuity.autoGate(true)   // enable speed gating
_wos.debug.buildingContinuity.veil(true)       // enable veil hints
_wos.debug.buildingContinuity.fade(true)       // enable extrusion fade ⚠
_wos.debug.buildingContinuity.detectLayers()   // print found layers
_wos.debug.buildingContinuity.prewarmAhead()   // immediate full probe
_wos.debug.buildingContinuity.readiness()      // compact one-liner
```

### PATCHED: `wall/index.html`

Load order:
```
regionalFlightCameraRig.js
buildingContinuityRuntime.js   ← NEW
...
buildingContinuityDebug.js     ← NEW
traversalControlDeck.js
```

### PATCHED: `wall/systems/presentation/traversalControlDeck.js`

Launch sequence now calls (steps 14–15, guarded):
```js
_debug('buildingContinuity', 'enabled', [continuity])
_debug('buildingContinuity', 'veil',    [veil])
// 400ms delay so route initializes before prewarm
setTimeout(() => _debug('buildingContinuity', 'prewarmAhead'), 400)
```

---

## Console Test Flow

```js
_wos.presentationMode(true)
_wos.debug.regionalFlight.stop()
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.profile('surface_glide')
_wos.debug.regionalFlight.speed(0.55)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.cameraSmooth(0.75)

_wos.debug.atmosphere.preset('harbor_fog')
_wos.debug.atmosphere.pressure(0.22)
_wos.debug.atmosphere.silence(0.78)

_wos.debug.aircraftResidue.contrails(false)
_wos.debug.aircraftResidue.lights(true)

_wos.debug.buildingContinuity.enabled(true)
_wos.debug.buildingContinuity.veil(true)
_wos.debug.buildingContinuity.autoGate(true)
_wos.debug.buildingContinuity.prewarmAhead()
_wos.debug.buildingContinuity.audit()
```

---

## Known Constraints

- **Mapbox has no public "preload tiles at position" API.** Tactics rely on
  `queryRenderedFeatures` side effects, which may encourage tile decoding in
  nearby regions — but this is browser-dependent and not guaranteed.
- **Tactic E (extrusion fade)** mutates `fill-extrusion-opacity` via
  `setPaintProperty`. If a MapStyleAuthority fights the override, call
  `fade(false)` immediately. Default off.
- **Route-ahead probes** only work when a canonical preset route is active
  (reads `rt.PRESETS[presetId].route`). Generated planner trips are not yet
  probed (their route is in a closure, not publicly accessible via PRESETS).

---

## Success Criteria

- [x] fill-extrusion building layers detected from active style
- [x] 2–4 Hz probe cadence — not per-frame
- [x] Ahead-of-camera probes at 150/300/600/1000m
- [x] Route-ahead probes at 4 future progress increments
- [x] Risk scoring: popInRiskScalar, readinessScalar, denseZoneRiskScalar
- [x] Speed gating opt-in (autoGate) — no speed snapping
- [x] Veil recommendation opt-in — feels like weather, not loading
- [x] Extrusion fade opt-in, default OFF, warned in audit
- [x] Missing APIs (AtmosphericContinuityRuntime.hintVeil) fail gracefully
- [x] Traversal deck Launch Drift triggers prewarm
- [x] MapStyleAuthority not permanently touched
- [x] Normal editor mode unaffected (enabled = false by default)
