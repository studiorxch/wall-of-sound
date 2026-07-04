# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Unify vessel styling across screen-space and geo-projected render paths before adding authoring tools.

# 0528H_WOS_VesselVisualUnificationPass_v1.0.0_BUILD

## Purpose

Create one authoritative vessel visual profile used by both maritime render modes:

```text
flat / low-pitch map view     → screenSprite
pitched / 2.5D water-plane    → geoHull
```

The current system is visually confusing because blue screen-space vessels and white geo-projected hulls represent the same maritime layer with different style rules. This pass keeps the projection distinction, but forces both paths to share color, class, size, and detail identity.

## Build Readiness

```text
[BUILD]
Ready to send to Claude.
```

## Problem

The vessel orientation work succeeded, but created a split visual language:

- low pitch / certain zooms show blue class sprites
- high pitch / 2.5D views show white projected hulls
- static/moored and underway vessels now ground correctly, but style identity changes by camera angle
- users cannot reliably author boat style because there is no single vessel presentation profile

The result:

```text
same boat, different visual system
```

This blocks vessel style authoring.

## Core Rule

```text
A vessel may change projection mode.
It must not change visual identity.
```

## Scope

This spec modifies presentation only.

Allowed:

- unify vessel color/profile resolution
- route both MOR screen sprites and MOR geo hulls through shared profile data
- remove hardcoded white geo hull defaults
- add projected hull detail
- add debug commands proving active visual mode and source

Not allowed:

- new wake work
- new AIS simulation behavior
- new vessel spawning logic
- new doctrine files
- 3D mesh hulls
- renderer duplication

## Files To Modify / Create

### Create

```text
wall/systems/presentation/vesselVisualProfile.js
```

### Modify

```text
wall/render/maritimeOccupancyRenderer.js
wall/systems/presentation/maritime25DContextDebug.js
wall/index.html
```

Optional if currently active:

```text
wall/render/marineRenderer.js
```

Only patch `marineRenderer.js` if it is still drawing any visible vessels. Production vessel rendering appears to be owned by `MaritimeOccupancyRenderer`.

---

# 1. Vessel Visual Profile Authority

Create:

```js
SBE.VesselVisualProfile
```

It owns shared presentation data only. No pixels. No runtime mutation of AIS state.

## Public API

```js
resolveProfile(vessel, camera, options)
getPalette()
setPalette(name)
getState()
```

## Profile Shape

```js
{
  version: '1.0.0',
  mmsi: vessel.mmsi || null,
  name: vessel.vesselName || '',

  source: 'ais' | 'synthetic' | 'seed' | 'unknown',
  classKey: 'cargo' | 'ferry' | 'tug' | 'tanker' | 'passenger' | 'cruise' | 'recreational' | 'service' | 'barge' | 'unknown',
  confidence: 'confirmed' | 'inferred' | 'fallback',

  projectionMode: 'screenSprite' | 'geoHull' | 'farDot',
  detailTier: 'dot' | 'simple' | 'detailed' | 'hero',

  hullColor: '#...',
  strokeColor: '#...',
  deckColor: '#...',
  accentColor: '#...',
  wakeColor: '#...',
  labelColor: '#...',

  alpha: 1.0,
  lengthMeters: 80,
  widthMeters: 16,
  lengthPxHint: 12,

  shapeFamily: 'slab' | 'box' | 'working' | 'liner' | 'pleasure' | 'unknown',
  flags: {
    isStatic: false,
    isLightOnly: false,
    isEmergency: false,
    isSelected: false,
    isHovered: false
  }
}
```

## Projection Mode Rule

```text
pitch < 28°      → screenSprite unless too small
pitch >= 28°     → geoHull unless projected hull < 4px
projected < 4px  → farDot
```

The profile decides mode; renderers execute it.

---

# 2. Class Palette

Default palette name:

```text
cinematic_harbor
```

## Required Colors

| Class | Hull | Stroke | Deck / Detail | Notes |
|---|---|---|---|---|
| cargo | steel blue | pale blue edge | dark deck blocks | industrial, long |
| tanker | rust / terracotta | warm light edge | dark centerline | heavy, long |
| barge | muted earth / olive | pale edge | dark flat deck | very long, flat |
| ferry | cream / pale cyan | white-blue edge | cabin/deck block | wide, readable |
| passenger / cruise | pale blue-white | soft cyan edge | multi-deck stripe | large, clean |
| tug / service | amber / utility yellow | dark rim | cabin block | compact |
| recreational | green-white | pale green edge | tiny cabin mark | small |
| unknown | muted slate | low-contrast edge | minimal | fallback |

White must not be the default production hull color. White is reserved for:

- hover outline
- selected vessel outline
- debug highlight
- emergency/special state

---

# 3. Patch MaritimeOccupancyRenderer

## Current Problem

`MaritimeOccupancyRenderer` now correctly grounds vessels at pitch >= 28, but its geo hull path visually diverges from the low-pitch screen sprite path.

## Required Changes

### A. Resolve profile once per vessel

Inside `_renderVessel` or equivalent draw path:

```js
var vvp = global.SBE && SBE.VesselVisualProfile;
var visualProfile = vvp && vvp.resolveProfile
  ? vvp.resolveProfile(vessel, camera, {
      lod: lod,
      source: vessel._wosSource || vessel.source || 'ais',
      hovered: hovered,
      selected: selected
    })
  : null;
```

Fallback safely if `VesselVisualProfile` is unavailable.

### B. Use profile colors everywhere

Replace hardcoded blue/white values in:

- screen sprite path
- geo hull path
- far dot path
- label/hover path where applicable

With:

```js
visualProfile.hullColor
visualProfile.strokeColor
visualProfile.deckColor
visualProfile.accentColor
visualProfile.alpha
```

### C. No white geoHull default

`_drawMORGroundedHull` must accept profile:

```js
_drawMORGroundedHull(ctx, vessel, visualProfile)
```

or minimally:

```js
_drawMORGroundedHull(ctx, lat, lng, hdg, lenM, widM, visualProfile)
```

The hull fill/stroke must come from profile.

### D. Keep geo projection authority

At pitch >= 28:

```text
no ctx.rotate()
no ctx.scale()
no screen-space chevrons
no static pins for vessel bodies
```

Projected hull geometry remains authoritative.

---

# 4. Projected Hull Detail Pass

Add detail to geo hulls while keeping all points projected through Mapbox.

## Detail Thresholds

```text
projected length < 4px   → farDot
4px–10px                 → simple hull polygon only
10px–24px                → hull + centerline
24px+                    → hull + centerline + deck/cabin detail
```

## Required Details

### All classes

- darker waterline stroke
- subtle centerline/deck stripe when long enough
- bow highlight point/short line when long enough

### Ferry / Passenger / Cruise

- inner deck rectangle or short deck band
- slightly wider hull ratio

### Cargo / Tanker / Barge

- long flat body
- dark centerline or deck segmentation
- no cartoon cabin unless class supports it

### Tug / Service

- compact hull
- small projected cabin block

### Recreational

- narrow hull
- small cabin/dash only at close sizes

## Important

All detail points must be computed in meter offsets, converted to lat/lng, then projected.

Do not draw details by rotating canvas.

---

# 5. Source Isolation Preservation

Keep the existing source toggles:

```js
SBE.runtimeFlags.showAISVessels
SBE.runtimeFlags.showSyntheticVessels
SBE.runtimeFlags.showSeedVessels
```

Default production remains:

```text
AIS only
synthetic off
seed off
```

`VesselVisualProfile.resolveProfile()` should include `source` in the returned profile so debug tools can identify where a vessel came from.

---

# 6. Debug Commands

Extend:

```js
_wos.debug.maritime25d
```

## Add

```js
visualMode()
visualProfile(mmsi)
palette(name?)
```

### visualMode()

Print:

```text
pitch: 42.0°
transitionPitch: 28°
active projection mode: geoHull
active renderer: MaritimeOccupancyRenderer
sources: AIS=ON synthetic=OFF seed=OFF
branches: geoHull=N farDot=N sprite=0 dot=0 staticPin=0
palette: cinematic_harbor
```

### visualProfile(mmsi)

If MMSI provided, print the resolved profile for that vessel.

If no MMSI provided, print first visible vessel profile.

### palette(name?)

No arg:

```text
prints current palette and available palettes
```

With arg:

```js
_wos.debug.maritime25d.palette('cinematic_harbor')
```

Sets active palette if available.

---

# 7. index.html Load Order

Add before `maritimeOccupancyRenderer.js`:

```html
<script src="systems/presentation/vesselVisualProfile.js"></script>
```

It must load after `vesselClassPresentation.js` if that file is used for class resolution.

Recommended order:

```html
<script src="systems/presentation/vesselClassPresentation.js"></script>
<script src="systems/presentation/vesselVisualProfile.js"></script>
<script src="render/maritimeOccupancyRenderer.js"></script>
```

---

# 8. Acceptance Tests

## Test A — Source Isolation

```js
_wos.debug.maritime25d.sources()
```

Expected production default:

```text
AIS: ON
synthetic: OFF
seed: OFF
```

## Test B — Low Pitch Identity

At pitch < 28°:

```js
_wos.debug.maritime25d.visualMode()
```

Expected:

```text
projection mode: screenSprite
palette: cinematic_harbor
```

Vessels use class colors.

## Test C — High Pitch Identity

At pitch >= 28°:

```js
_wos.debug.maritime25d.visibleRenderer()
_wos.debug.maritime25d.visualMode()
```

Expected:

```text
sprite=0
dot=0
staticPin=0
geoHull + farDot only
```

Geo hulls use same class colors as low-pitch sprites.

## Test D — No White Default

At high pitch, white appears only for:

- hover
- selection
- debug state
- emergency/special state

Normal vessels should not all become white.

## Test E — Carnival / Static Vessel

Static/moored vessels render as:

```text
geoHull when pitch >= 28°
same class color as low-pitch mode
no upright pin body
```

## Test F — Detail Threshold

At close tilted view:

```text
large vessels show centerline/deck/cabin detail
small vessels remain simple hulls
far vessels become non-directional far dots
```

---

# 9. Success Definition

This pass succeeds when:

```text
A vessel keeps the same visual identity while switching projection modes.
```

Screenshots should show:

- low pitch: class-colored vessels
- high pitch: class-colored projected hulls
- no production white-hull takeover
- no upright rocket boats
- no mixed AIS/synthetic/seed confusion by default

---

# 10. Implementation Notes

## Do Not Overbuild

This is not the boat style editor yet.

Do not build UI panels.
Do not build JSON style importing.
Do not build per-vessel authoring.

This spec only creates the shared profile layer required before authoring tools can work.

## Future Follow-Up

Next spec after this should be:

```text
0528I_WOS_VesselStyleAuthoringTools_v1.0.0_BUILD
```

That will expose palette editing, class swatches, and possibly per-class style presets.

---

# Implementation Guide

- Put shared profile logic in `wall/systems/presentation/vesselVisualProfile.js`, then load it before MOR.
- Patch `maritimeOccupancyRenderer.js` so both screenSprite and geoHull consume the same profile object.
- Verify with `_wos.debug.maritime25d.visualMode()`, `.visibleRenderer()`, and `.sources()` at low and high pitch.
