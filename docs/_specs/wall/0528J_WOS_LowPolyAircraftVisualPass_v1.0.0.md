---
spec: 0528J_WOS_LowPolyAircraftVisualPass_v1.0.0
status: active
classification: renderer
created: 2026-05-28
---

# WOS Low-Poly Aircraft Visual Pass v1.0.0

## Purpose

Upgrade aircraft rendering from simple directional icon to procedural low-poly
regional jet form while remaining canvas-rendered and runtime-safe.

Canonical target:
```
A plane should feel like a world object, not a map icon.
```

---

## What Changed

### aircraftRenderer.js v1.1.0 → v2.0.0

**Palette system expanded** — `_resolveAircraftPalette()` now returns full
`{ body, fill, stroke, glass, accent, light }` from ObjectProfileRegistry
(paletteRef-aware) with safe inline fallback.

**Detail tiers** — `_resolveAircraftDetailTier(sizePx, altitudeScalar)` drives
how much geometry is drawn per frame:

| Tier | sizePx | altScalar | Features |
|---|---|---|---|
| far  | < 7   | any   | fuselage + swept wing blob |
| mid  | 7–11  | any   | + tailplane |
| near | ≥ 11  | any   | + cockpit glass + engines + accent stripe |
| hero | ≥ 18  | < 0.45 | + wing accent lines + nav lights |

**Low-poly regional jet draw path** — `_drawLowPolyRegionalJet()` replaces
the icon for REGIONAL_JET class (and any class in `lowpoly` visual mode):
- Swept-back wings (wider span: ±1.18s vs old ±1.20s, better sweep geometry)
- Narrowed nose shoulder / slimmer nose tip
- Tail taper to a clean tail point at +1.05s
- Horizontal stabilizer (tailplane) drawn at mid+ tiers
- Cockpit glass band at near/hero
- Engine pod ellipses on wing undersurface at near/hero
- Accent belly stripe at near/hero
- Wing leading-edge lines + nav light dots + tail beacon at hero

**Low-poly shadow** — `_drawLowPolyShadow()` used at near/hero tiers; matches
the actual jet silhouette envelope rather than the old rectangular approximation.

**Visual mode toggle** — `_visualMode` ('auto' | 'lowpoly' | 'icon') controls
the draw path per-aircraft per-frame. Default: `auto` (REGIONAL_JET → lowpoly,
all others → icon).

**Palette override** — `_paletteOverride` allows renderer-local palette forcing
without touching ObjectProfileRegistry source data.

### aircraftDebug.js v1.0.0 → v1.1.0

Three new debug commands:

```js
_wos.debug.aircraft.visual()
// Prints per-aircraft: classKey, palette slots, detail tier, draw path

_wos.debug.aircraft.visualMode("auto" | "lowpoly" | "icon")
// Switch draw path mode

_wos.debug.aircraft.palette("airport_dawn" | "harbor_fog" | "night_approach")
// Override active palette for visual testing
```

---

## GEOM Reference (Regional Jet)

All values are multiplied by `s = BASE_SIZE_PX * scale` to get pixel coords.
Local -Y = nose direction.

```
Fuselage:
  nose tip          (0,      -1.45)
  nose shoulder     (±0.12,  -1.10)
  body shoulder     (±0.17,  -0.65)
  body mid          (±0.17,  +0.20)
  tail taper        (±0.10,  +0.72)
  tail tip          (0,      +1.05)

Wings (swept):
  root LE           (±0.17,  -0.18)
  tip LE            (±1.18,  +0.12)
  tip TE            (±0.92,  +0.32)
  root TE           (±0.17,  +0.14)

Tailplane:
  root LE           (±0.10,  +0.70)
  tip               (±0.44,  +0.84–0.96)
  root TE           (±0.10,  +0.88)

Engine pods:
  center            (±0.58,  +0.06)
  ellipse           rx 0.08, ry 0.22

Cockpit glass:
  top               (±0.11,  -1.08)
  bottom            (±0.16,  -0.84)
```

---

## Validation Checklist

- [x] Regional jet uses low-poly draw path in `auto` and `lowpoly` modes
- [x] Legacy icon remains available for other classes and `icon` mode
- [x] Palette resolves through ObjectProfileRegistry (body/stroke/glass/accent/light)
- [x] Missing registry does not break renderer (inline fallback)
- [x] Detail tiers reduce geometry noise at distance/altitude
- [x] Low-poly shadow used at near/hero; legacy shadow at far/mid
- [x] Route trace untouched — still visible during TAKEOFF_ROLL / CLIMB
- [x] Altitude scale curve (_resolveIconScale) untouched
- [x] Debug snapshot reports visualMode, paletteOverride, per-aircraft detail tier
- [x] No runtime truth mutation
- [x] No Mapbox style mutation
- [x] No 3D mesh dependency

---

## Console Verification

```js
_wos.debug.aircraft.spawn("JFK")
_wos.debug.aircraft.followFirst()
_wos.debug.aircraft.icons(2.0)
_wos.debug.aircraft.visual()
_wos.debug.aircraft.visualMode("lowpoly")
_wos.debug.aircraft.palette("harbor_fog")
_wos.debug.aircraft.palette("night_approach")
_wos.debug.aircraft.palette(null)   // clear override
_wos.debug.aircraft.visualMode("auto")
```

---

## Next

```
0528K_WOS_RegionalFlightTripRuntime_v1.0.0_BUILD
```

Define the 2-hour NYC regional flight structure: takeoff → climb → cruise →
descent → landing, camera pacing, and first full aviation broadcast proof.
