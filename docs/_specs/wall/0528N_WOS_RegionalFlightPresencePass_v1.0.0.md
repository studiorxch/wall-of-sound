---
spec: 0528N_WOS_RegionalFlightPresencePass_v1.0.0
status: active
classification: renderer
created: 2026-05-28
---

# WOS Regional Flight Presence Pass v1.0.0

## Purpose

Transform regional aircraft from technical route actors into atmospheric
cinematic world-presence actors. Presence effects are presentation-only —
no route truth, lifecycle state, or AircraftRuntime entity data is mutated.

Canonical target:
```
quiet moving infrastructure crossing an atmospheric civilization
```

---

## What Changed

### aircraftRenderer.js v2.0.0 → v2.1.0

**Presence layer flags** — three independent toggles, all `true` by default:
- `_presenceEnabled` — atmospheric halo
- `_contrailsEnabled` — geographic vapor trail
- `_lightsEnabled` — distance nav light blink

**FOG_DENSITY map** — mirrors CloudAtmosphereLayer preset names:
```js
clear: 0.00, thin: 0.12, harbor_fog: 0.40, storm_shelf: 0.72
```

**Detail tier threshold** — mid threshold raised from 7px → 6px for better
cruise readability at distance.

**Scale curve floor** — cruise minimum raised from 0.44 → 0.50 (slightly
slower compression at altitude).

**`_geoOffset(lat, lng, bearingDeg, distM)`** — great-circle bearing utility.
Returns `{ lat, lng }` offset by distM meters along bearingDeg. Used by
contrail to compute trail direction independently of map rotation.

**`_resolvePresenceState(e)`** — derives per-aircraft presentation scalars:
- `fogDensity` — current cloud preset's fog value (0–1)
- `visibilityScalar` — base aircraft alpha modulation (drops in dense cloud)
- `silhouetteScalar` — halo radius driver (peaks at mid-altitude)
- `lightVisibilityScalar` — nav light contrast in fog
- `atmosphericScalar` — altitude blend for halo colour warmth

**`_drawAtmosphericPresence(ctx, x, y, scale, presence, altScalar)`** —
soft radial gradient halo drawn below aircraft body. Warm near ground
(amber-white), cool at cruise (blue-white). Only visible when airborne
(altScalar > 0.04). Max alpha ≈ 0.28 at cruise.

**`_drawContrail(ctx, pt, e, scale, presence)`** — geographic vapor trail.
Computes trail end 900–1450m behind aircraft heading using `_geoOffset` +
`_project`. Gradient from aircraft position (semi-visible) to tail (fully
transparent). Only drawn at altitudeScalar ≥ 0.68. Attenuated in fog.

**`_drawDistanceNavLight(ctx, x, y, scale, altScalar, tier, presence)`** —
1.2s cycle strobe beacon for `far` and `mid` detail tiers only (near/hero
have nav light dots in body geometry). On for first 35% of cycle; pulse
eased in/out. Canvas shadow blur for glow effect. Min altScalar 0.12.

**Frame draw order** (updated):
1. Presence halo
2. Contrail (geo-based, behind body)
3. Route trace (TAKEOFF_ROLL / CLIMB)
4. Shadow
5. Aircraft body
6. Distance nav light
7. Debug label

**`getPresenceSnapshot()`** — prints full presence state to console:
presence/contrails/lights flags, cloud preset, fog density, per-aircraft
scalars and contrail active status.

**New public API additions:**
```js
setPresence(bool)    getPresence()
setContrails(bool)   getContrails()
setLights(bool)      getLights()
getPresenceSnapshot()
```

### regionalFlightTripDebug.js v1.0.0 → v1.1.0

Four new debug commands added to `_wos.debug.regionalFlight`:

```js
_wos.debug.regionalFlight.presence(true)     // toggle halo
_wos.debug.regionalFlight.contrails(false)   // toggle contrail
_wos.debug.regionalFlight.lights(true)       // toggle nav light blink
_wos.debug.regionalFlight.visibility()       // print presence snapshot
```

---

## Doctrine Constraints

- No simulation: presence effects do not compute physics, fuel burn, or ATC
- Contrail length is display-only (900–1450m) — not derived from flight data
- Fog modulation reads CloudAtmosphereLayer.getPreset() — observational only
- All effects disabled in PARKED state (altScalar = 0) unless debug visible
- Must not: over-scale, blink rapidly, glow brightly, or dominate the scene

---

## Console Verification

```js
// Start trip and jump to cruise
_wos.debug.regionalFlight.start()
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.camera(true)
_wos.debug.regionalFlight.jump(0.5)

// Inspect presence state
_wos.debug.regionalFlight.visibility()

// Test contrail at high altitude
_wos.debug.regionalFlight.jump(0.75)
_wos.debug.regionalFlight.visibility()

// Toggle individual effects
_wos.debug.regionalFlight.contrails(false)
_wos.debug.regionalFlight.presence(false)
_wos.debug.regionalFlight.lights(false)

// Restore
_wos.debug.regionalFlight.contrails(true)
_wos.debug.regionalFlight.presence(true)
_wos.debug.regionalFlight.lights(true)

// Test fog interaction
SBE.CloudAtmosphereLayer.setPreset('harbor_fog')
_wos.debug.regionalFlight.visibility()
SBE.CloudAtmosphereLayer.setPreset('clear')
```

---

## Validation Checklist

- [x] Presence halo visible and fades at ground (altScalar < 0.04 = no halo)
- [x] Halo colour shifts warm→cool with altitude
- [x] Contrail only visible at altScalar ≥ 0.68
- [x] Contrail direction uses heading bearing (correct regardless of map rotation)
- [x] Contrail attenuates in harbor_fog preset
- [x] Nav light blink only at far/mid tiers; near/hero use body nav dots
- [x] All effects toggleable independently
- [x] No mutation of route truth, lifecycle state, or entity data
- [x] `visibility()` prints cloud preset, fog density, per-aircraft scalars
- [x] Aircraft body alpha modulated by fog (visibilityScalar)
- [x] Detail tier mid threshold 7→6px (better cruise readability)
- [x] Scale floor 0.44→0.50 (smoother cruise sizing)

---

## Next

```
0528O or continuation — post-presence evaluation
```
