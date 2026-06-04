---
spec: 0528R_WOS_AircraftContrailAndNavLighting_v1.0.0
status: active
classification: presentation-runtime
created: 2026-05-28
depends_on:
  - 0528N_WOS_RegionalFlightPresencePass_v1.0.0
  - 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0
  - 0528Q_WOS_CloudAtmosphereTransitionSmoothing_v1.0.0
---

# WOS Aircraft Contrail and Nav Lighting v1.0.0

## Purpose

Aircraft leave temporary sky memory. Contrail persistence makes traversal
visible. Nav light fog diffusion makes aircraft readable inside weather.
Sky residue hooks prepare for future GlyphLab / atmospheric calligraphy.

---

## What Changed

### NEW: `wall/systems/presentation/aircraftSkyResidueRenderer.js` v1.0.0

**Canvas at z-index 5** — below atmosphere overlay (z:6) so fog correctly
obscures contrails. Aircraft feel embedded in weather, not drawn over it.

**Geo-based segment storage** — each contrail point stores `lat`, `lng` (not
canvas pixels). Segments are projected each frame via `MapboxViewportRuntime
.project()` — trail correctly follows geography as camera pans/zooms/rotates.

**Segment eligibility:**
```js
altitudeScalar >= 0.62
lifecycleState === 'CRUISE' || 'DESCENT'
```

**Segment caps:** 80 per aircraft, 600 total. Oldest segments dropped first.

**Lifespan by cloud preset:**
| Preset | Life |
|---|---|
| clear | 22s |
| thin | 30s |
| harbor_fog | 38s |
| storm_shelf | 45s |

Silence shortens by up to 40%. Pressure extends by up to 25%.

**Fade curve** — smoothstep `t²(3-2t)`: visible early, soft middle, broken
late. No hard cutoff.

**Drift** — segments drift slowly in lng (wind) and lat (thermal lift).
Rate proportional to atmospheric pressure and thermal distortion. Older
segments drift more (they've been in the air longer).

**Atmospheric modulation:**
- Fog/haze: wider contrail stroke, increased opacity (+45%)
- Silence: reduced opacity (−35%), shorter life
- Electrical activity > 0.3: blue-white tint, +30% brightness
- Thermal distortion > 0.3: warm tint, wider stroke (+1.5px)

**Contrail stroke** — projected adjacent-segment pairs drawn as line strokes.
Width: 0.8–4px based on altitude and fog. Colour: warm white → cool electric
via atmospheric state. Max opacity 0.28 (restrained by design).

**Residue types:**
- `contrail` — standard cruise/descent vapor
- `vapor` — softer, altScalar 0.62–0.72 wisps
- `glyph_seed` — future GlyphLab hook (flag off by default)

**Nav light fog diffusion** — separate radial glow per aircraft when
`fogDensity > 0.08`. Radius grows with fog but softens (fog diffuses, not
amplifies). Amber-white colour. 1.2s blink cycle, 35% duty. Only drawn
during ON phase. Alpha max ~0.22. This is atmospheric context for the crisp
nav dots already in AircraftRenderer — two systems compose.

Public API (frozen):
```js
SBE.AircraftSkyResidueRenderer = {
  VERSION,
  start, stop, setEnabled, getEnabled,
  setContrails, getContrails,
  setNavLights, getNavLights,
  setGlyphSeed, getGlyphSeed,
  clearResidue, getState
}
```

### NEW: `wall/systems/presentation/aircraftResidueDebug.js` v1.0.0

Binds `_wos.debug.aircraftResidue`:

```js
_wos.debug.aircraftResidue.audit()         // full state + atmospheric context
_wos.debug.aircraftResidue.contrails(true) // toggle contrails
_wos.debug.aircraftResidue.lights(true)    // toggle nav light diffusion
_wos.debug.aircraftResidue.clear()         // discard all segments
_wos.debug.aircraftResidue.density(v)      // hint (atmosphere-driven)
_wos.debug.aircraftResidue.lifespan()      // print lifespan table
_wos.debug.aircraftResidue.glyphSeed(true) // future residue type hook
```

### Load order

```
aircraftRenderer.js
atmosphericContinuityRuntime.js
aircraftSkyResidueRenderer.js      ← NEW (z:5, below atmosphere)
regionalFlightCameraRig.js
...
aircraftResidueDebug.js            ← NEW debug companion
regionalFlightTripDebug.js
```

---

## Console Verification

```js
// Canonical flight at cruise
_wos.debug.regionalFlight.start('nyc_to_boston_regional_001')
_wos.debug.regionalFlight.speed(60)
_wos.debug.regionalFlight.cameraRig(true)
_wos.debug.regionalFlight.jump(0.5)          // jump to cruise
_wos.debug.aircraftResidue.audit()           // confirm segments appearing

// Fog test — contrails should linger longer and widen
_wos.debug.atmosphere.preset('harbor_fog')
_wos.debug.aircraftResidue.audit()

// Electrical bloom test
_wos.debug.atmosphere.pressure(0.9)
_wos.debug.atmosphere.bloom('electrical')
// Watch: contrails pick up blue-white tint during bloom

// Long trails
_wos.debug.atmosphere.preset('storm_shelf')
// 45s lifespan — build up a visible vapor scar behind aircraft

// Nav light diffusion
_wos.debug.atmosphere.preset('harbor_fog')
_wos.debug.regionalFlight.jump(0.3)         // lower altitude, blink visible in fog

// Clear and restart
_wos.debug.aircraftResidue.clear()
_wos.debug.regionalFlight.jump(0.5)

// Future GlyphLab seed
_wos.debug.aircraftResidue.glyphSeed(true)  // new segments tagged glyph_seed
```

---

## Validation Checklist

- [x] Contrail segments stored as geo lat/lng (not canvas px)
- [x] Trail correctly follows geography when camera rotates/zooms
- [x] Segments only appear above altScalar 0.62 in CRUISE or DESCENT
- [x] Smoothstep fade — no hard cutoff
- [x] Drift accumulates (older segments further from source position)
- [x] Fog extends life and widens stroke
- [x] Silence shortens life and reduces opacity
- [x] Electrical bloom tints contrails blue-white
- [x] Thermal bloom warms and widens contrails
- [x] Max opacity 0.28 — contrails never dominate skyline
- [x] Nav light diffusion only visible when fogDensity > 0.08
- [x] Diffusion radius grows with fog, alpha stays restrained
- [x] 1.2s blink, 35% duty — infrastructural, not urgent
- [x] Segment caps enforced (80 per aircraft, 600 total)
- [x] glyphSeed flag is future-ready no-op in this build
- [x] No aircraft entity mutation
- [x] No atmospheric truth mutation
- [x] Performance: simple line strokes, no particles, no blur passes

---

## GlyphLab Future Hook

When `setGlyphSeed(true)`, new contrail segments carry `residueType:
'glyph_seed'`. Future `SkyResiduePath` system can read `getState()
.segsByAircraft` and process the tagged segments into vapor calligraphy paths,
atmospheric glyphs, and sky ornaments without modifying this renderer.
