---
spec: 0528Q_WOS_CloudAtmosphereTransitionSmoothing_v1.0.0
status: active
classification: environmental-presentation-runtime
created: 2026-05-28
depends_on:
  - 0528C_WOS_CloudAtmosphereLayer_v1.0.0
  - 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0
---

# WOS Cloud Atmosphere Transition Smoothing v1.0.0

## Purpose

Transform atmosphere from preset-switching weather into continuous energetic
environmental behavior. Atmosphere is stored energy — it accumulates, simmers,
blooms, recovers, and breathes.

---

## What Changed

### NEW: `wall/systems/presentation/atmosphericContinuityRuntime.js` v1.0.0

**Preset intercept** — `SBE.CloudAtmosphereLayer` is re-assigned to a thin
proxy (SBE itself is not frozen). The proxy forwards all methods to the real
frozen object except `setPreset()`, which is routed through `_queuePreset()`.
All existing callers (TripRuntime's phase-based cloud changes) now blend
automatically without modification.

**Blend curve** — fade-out → switch at midpoint → fade-in over 9 seconds:
- Phase 1 (t 0→0.5): drive `setDensity()` from 1.0 → 0.05 (clouds thin)
- At t=0.5: hard-switch the real preset
- Phase 2 (t 0.5→1): drive `setDensity()` from 0.05 → 1.0 (clouds fill)
- Smooth-eased (`t²(3-2t)`) for the palette interpolation

**Preset palette** (values blended between):
| Preset | cloud | haze | fog | skylineVis | warmth |
|---|---|---|---|---|---|
| clear | 0.05 | 0.00 | 0.00 | 1.00 | 0.00 |
| thin | 0.28 | 0.06 | 0.08 | 0.88 | 0.00 |
| harbor_fog | 0.46 | 0.22 | 0.28 | 0.58 | +0.38 |
| storm_shelf | 0.72 | 0.42 | 0.50 | 0.28 | -0.18 |

**Pressure accumulation** — auto-builds at 0.0008/sec when a trip is active
(~21 min real-time, ~21 sec at speed(60)). Visual pressure vignette appears
above 0.60. Auto-bloom available above 0.85.

**Bloom events** — 4 types:
| Type | electrical | thermal | pressureDrop | decaySec |
|---|---|---|---|---|
| electrical | 0.92 | 0.10 | 0.70 | 8s |
| thermal | 0.18 | 0.85 | 0.60 | 12s |
| pressure | 0.25 | 0.30 | 0.80 | 15s |
| resonance | 0.45 | 0.20 | 0.55 | 10s |

After bloom peak: `triggerRecovery()` fires automatically.

**Recovery** — 18-second silence cycle. `silenceScalar` rises to 0.75 at
peak (40% in), then eases back to 0. Fog density gently lifts during silence.
Pressure resets to 0.08 (never fully empty). Environmental breathing.

**Canvas overlay** (z-index 6 — below planner:7, aircraft:8). Five layers:
1. Full-screen atmospheric haze (warm amber ↔ cool blue driven by `warmth`)
2. Bottom fog lift gradient (driven by `fogDensity`)
3. Electrical bloom — cool blue-white radial pulse from center-top
4. Thermal distortion — warm amber vignette from bottom (heat-rises)
5. Pressure vignette — subtle edge darkening when `pressureScalar > 0.60`

All overlay alphas are restrained (haze max 0.18, fog max 0.32, electric max 0.22,
thermal max 0.12, pressure max 0.06). Silence is part of the atmosphere.

**rAF loop** — `_frame()` updates blend state, atmosphere scalars, and renders
overlay every display frame. dt clamped to 100ms.

Public API (frozen):
```js
SBE.AtmosphericContinuityRuntime = {
  VERSION,
  start, stop, setEnabled, getEnabled,
  setPressure, setSilence, setResonance,
  triggerBloom, triggerRecovery,
  queuePreset, getState,
  BLOOM_TYPES, PRESET_PALETTE
}
```

### NEW: `wall/systems/presentation/atmosphericContinuityDebug.js` v1.0.0

Binds `_wos.debug.atmosphere`:

```js
_wos.debug.atmosphere.audit()                    // full state report
_wos.debug.atmosphere.pressure(0.8)              // set pressure scalar
_wos.debug.atmosphere.silence(0.6)               // set silence
_wos.debug.atmosphere.resonance(0.7)             // set resonance
_wos.debug.atmosphere.fog(0.6)                   // maps to nearest preset
_wos.debug.atmosphere.thermal(0.7)               // trigger thermal bloom
_wos.debug.atmosphere.electric(0.9)              // trigger electrical bloom
_wos.debug.atmosphere.bloom('electrical')        // bloom by type
_wos.debug.atmosphere.bloom()                    // list all types
_wos.debug.atmosphere.recover()                  // trigger recovery cycle
_wos.debug.atmosphere.preset('harbor_fog')       // queue smoothed preset
_wos.debug.atmosphere.preset()                   // list all presets
```

### Load order

```
cloudAtmosphereLayer.js
cloudAtmosphereRenderer.js
...
atmosphericContinuityRuntime.js    ← NEW (intercepts setPreset)
regionalFlightCameraRig.js
...
atmosphericContinuityDebug.js      ← NEW (debug companion)
regionalFlightTripDebug.js
```

---

## Console Verification

```js
// Confirm intercept is live
SBE.AtmosphericContinuityRuntime.getState()

// Test preset blend (9s transition)
_wos.debug.atmosphere.preset('harbor_fog')
// Watch: clouds thin, switch, fill; haze and fog overlays appear

// Bloom cycle
_wos.debug.atmosphere.pressure(0.9)
_wos.debug.atmosphere.bloom('electrical')
// Watch: blue-white pulse, electrical activity decays over 8s, recovery begins

// Full cycle with flight
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
// Watch: TAKEOFF → CLIMB changes 'clear'→'thin' blended,
//        CRUISE changes 'thin'→'harbor_fog' blended over 9s
//        pressure accumulates at speed(60)

// Manual recovery test
_wos.debug.atmosphere.pressure(1.0)
_wos.debug.atmosphere.bloom('resonance')
_wos.debug.atmosphere.recover()
```

---

## Validation Checklist

- [x] No hard preset cuts — all transitions take 9s with cloud density curve
- [x] TripRuntime phase-based cloud changes (clear→thin→harbor_fog) now blend
- [x] Proxy intercept transparent to all existing callers
- [x] Original CloudAtmosphereLayer frozen object untouched
- [x] Haze overlay colour-correct (warm ↔ cool by preset warmth)
- [x] Fog lift gradient visible during harbor_fog and storm_shelf
- [x] Electrical bloom: brief blue-white radial, decays in 8s
- [x] Thermal bloom: warm bottom vignette, decays in 12s
- [x] Pressure vignette appears above 0.60 scalar
- [x] Recovery: 18s silence cycle, fog lift, pressure resets to 0.08
- [x] Pressure accumulates only when trip is active
- [x] All overlay alphas restrained — silence is part of the atmosphere
- [x] rAF loop, dt clamped, no setInterval performance issue
- [x] getState() reports full atmosphere scalars
