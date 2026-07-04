# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Build visible 2.5D maritime context so vessels conform to pitched-map perspective and read as embedded inside NYC harbor space.

---

# 0527D_WOS_Maritime2_5DContextPass_v1.0.0

## Purpose

Create the first substantial 2.5D maritime presentation pass for WOS.

This spec addresses the current visible problem:

```text
boats are class-differentiated, but they still render like flat screen-space stickers on a tilted map.
```

The goal is not full 3D simulation. The goal is visible spatial conformity:

- vessels should compress with map pitch
- vessels should ground into the water plane
- shadows should obey view direction
- far vessels should lose height/detail
- shoreline, bridge, and harbor context should reinforce depth

---

## Current Evidence

The 0527C vessel pass succeeded at class differentiation, but the current tilted view shows a mismatch:

- Mapbox water/land plane is pitched.
- Vessels remain mostly screen-space upright icons.
- Boat bodies do not compress consistently with perspective.
- Shadows/trails do not share a stable 2.5D direction model.
- Near and far vessels do not sufficiently separate by depth tier.

This spec fixes that.

---

## Non-Negotiable Build Rule

No wake expansion.

No WaterMemory restoration.

No hidden atmosphere math.

This pass must produce visible 2.5D improvements only.

---

# Objectives

## 1. Perspective-Conforming Vessel Geometry

Replace pure screen-space vessel drawing with a perspective-aware path when map pitch is active.

Required behavior:

- vessel center remains AIS-projected truth
- hull length/width project through geographic offsets where possible
- heading remains AIS-derived
- map pitch affects hull footprint
- boats flatten naturally as camera pitch increases

Implementation approach:

```text
AIS vessel lat/lng + heading + length/width
→ compute bow/stern/port/starboard geo offsets
→ project each point through MapboxViewportRuntime.project()
→ draw hull polygon from projected points
```

This already exists partially in `_drawGroundedHull()` inside `marineRenderer.js`; this pass should generalize and route class silhouettes through it where zoom/pitch requires.

---

## 2. 2.5D Render Tiers

Use zoom + pitch to select render behavior.

```ts
export type Maritime25DTier =
  | 'flat_symbol'
  | 'grounded_silhouette'
  | 'grounded_topology'
  | 'compressed_far_mark';
```

Required mapping:

- low pitch / far zoom → simple symbol
- medium pitch → grounded silhouette
- high pitch / near zoom → grounded topology
- far distance → compressed dash / mark

Success is visual, not theoretical:

```text
boats should no longer look pasted on top of the tilted map.
```

---

## 3. Waterline Grounding

Every visible vessel in grounded tiers must receive a waterline treatment.

Required:

- 1px to 2px dark hull contact line
- shadow direction tied to camera bearing/pitch, not arbitrary screen-down only
- opacity reduced at distance
- no glow-based fake depth

Suggested function:

```js
function resolveWaterlineShadow(camera, vessel, tier) {
  return {
    offsetX,
    offsetY,
    alpha,
    blur,
  };
}
```

---

## 4. Distance and Altitude Compression

Far vessels should become quieter and flatter.

Required:

- far vessels compress length/width toward dash language
- far deck cues disappear
- far colors desaturate slightly
- far alpha drops with haze/distance
- near vessels keep topology cues

This should support future aircraft altitude rendering.

---

## 5. Harbor Context Depth

Boats need New York context, not isolated icons.

Add visible depth cues around:

- shorelines
- piers
- bridge approaches
- terminals
- industrial edges
- harbor islands

This pass may add simple context emphasis, but must not become a full landmark system.

Required minimal context cues:

- shoreline edge darkening when pitch is active
- pier/terminal contrast preservation
- optional bridge/landmark depth markers if existing map layers expose them

---

## 6. Debug + Toggle Tools

Expose debug tools under:

```js
_wos.debug.maritime25d
```

Required commands:

```js
_wos.debug.maritime25d.enabled(true)
_wos.debug.maritime25d.mode('flat' | 'grounded' | 'auto')
_wos.debug.maritime25d.tiers()
_wos.debug.maritime25d.shadows(true)
_wos.debug.maritime25d.context(true)
_wos.debug.maritime25d.audit()
```

`audit()` must report:

- map pitch
- map bearing
- active 2.5D mode
- number of vessels using grounded geometry
- number using flat symbols
- shadow enabled state
- context cue enabled state

---

# Required Files

Likely files to modify or create:

```text
wall/systems/presentation/maritime25DContext.js
wall/systems/presentation/maritime25DContextDebug.js
wall/render/marineRenderer.js
wall/systems/presentation/vesselClassPresentation.js
wall/index.html
```

Load order:

```text
vesselClassPresentation.js
maritime25DContext.js
marineRenderer.js
main.js
maritime25DContextDebug.js
```

---

# Renderer Integration

`MarineRenderer` should not own 2.5D policy directly.

It should ask:

```js
SBE.Maritime25DContext.resolveVessel25DProfile(vessel, camera, classProfile)
```

Expected returned profile:

```js
{
  enabled: true,
  tier: 'grounded_silhouette',
  useGroundedHull: true,
  compressY: 0.72,
  distanceAlpha: 0.84,
  shadow: {
    enabled: true,
    offsetX: -1.2,
    offsetY: 1.8,
    alpha: 0.32,
    blur: 0
  },
  contextDepth: 0.6
}
```

---

# Visual Acceptance Criteria

This build passes only if screenshots prove:

1. Boats visibly conform better to pitched Mapbox perspective.
2. Near boats feel grounded in the water plane.
3. Far boats become flatter/quieter.
4. Shadows point consistently relative to camera view.
5. Vessel class readability from 0527C is preserved.
6. No WaterMemory or wake expansion returns.
7. Mapbox Studio style remains intact.

---

# Explicit Non-Goals

Do not build:

- full 3D ship meshes
- water simulation
- wake field systems
- WaterMemory lanes/churn
- cloud systems
- aircraft systems
- 3D building compositor
- landmark database

Those belong to later passes.

---

# Build Notes for Claude

The current screenshot shows the exact failure case: the map is pitched, but vessel icons remain visually billboarded. Prioritize that mismatch first.

Do not overbuild.

The first visible win is:

```text
screen-space class silhouettes become map-plane-aware grounded silhouettes.
```

After that, add shadow and distance compression.

---

# Implementation Guide

- Put the 2.5D policy in `systems/presentation/maritime25DContext.js`; keep `marineRenderer.js` as the drawing consumer.
- Run the app, toggle pitch/zoom, then compare `_wos.debug.maritime25d.mode('flat')` vs `'grounded'`.
- Expect boats to look less pasted-on, with stronger water grounding and quieter far-distance marks.
