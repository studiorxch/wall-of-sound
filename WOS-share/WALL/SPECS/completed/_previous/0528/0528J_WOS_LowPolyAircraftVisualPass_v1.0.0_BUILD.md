---
layout: spec
title: "0528J_WOS_LowPolyAircraftVisualPass_v1.0.0"
date: 2026-05-28
doc_id: "0528J_WOS_LowPolyAircraftVisualPass_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "aircraft_renderer"
type: "interpretation-spec"
status: "approved"
priority: "high"
risk: "medium"
classification: "interpretation-layer"
summary: "Defines the first production upgrade from flat aircraft icon to WOS-compatible low-poly aircraft visual language, starting with the regional jet."
doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Object Generator is the form factory"
  - "Color Lab is the material authority"
  - "WOS Runtime owns placement, motion, atmosphere, and behavior"
depends_on:
  - "0528A_WOS_AirflightRuntimeBootstrap_v1.0.0"
  - "0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0"
  - "0528I_WOS_ObjectCustomizationAndGenerationDoctrine_v1.0.0"
enables:
  - "0528K_WOS_RegionalFlightTripRuntime_v1.0.0"
  - "WOS_ObjectGenerationPipeline"
  - "WOS_ColorLabMaterialBridge"
  - "AirportGroundVehicleVisualPass"
tags:
  - "aircraft"
  - "low-poly"
  - "object-profile"
  - "regional-flight"
  - "visual-language"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Upgrade the aircraft visual from simple canvas icon to WOS low-poly procedural aircraft language.

# 0528J_WOS_LowPolyAircraftVisualPass_v1.0.0

## Purpose

Create the first visible WOS object-generation proof for aviation:

```text
simple aircraft marker
```

becomes:

```text
low-poly WOS regional jet form
```

This pass upgrades aircraft rendering while staying inside current runtime constraints.

It does **not** introduce full 3D mesh import yet.

Instead, it creates a procedural canvas-based low-poly aircraft renderer that:

- reads aircraft class identity from `AircraftRuntime`
- reads visual profile/material slots from `ObjectProfileRegistry`
- supports altitude-aware detail tiers
- improves aircraft silhouette readability
- prepares for future AI-generated / low-poly mesh import
- supports the first 2-hour regional flight proof

Canonical target:

```text
A plane should feel like a world object, not a map icon.
```

---

# Core Problem

The current aircraft renderer draws a simple directional icon:

- fuselage
- wings
- tail fins
- altitude scaling
- route trace

This is useful but still reads as:

```text
symbolic overlay
```

The next WOS goal requires aircraft to read as:

```text
low-poly cinematic object
```

especially during:

- airport takeoff
- climb-out
- camera follow
- altitude transitions
- cloud-layer crossings
- regional route traversal
- descent into destination

---

# Non-Negotiable Rule

Do **not** jump directly to external 3D mesh import.

This pass must remain:

```text
procedural
canvas-rendered
runtime-safe
drop-in
low-risk
```

The goal is to prove visual language first.

Mesh import comes later.

---

# Visual Target

The aircraft should feel closer to:

```text
stylized low-poly aviation object
```

than:

```text
map marker
```

Target qualities:

- clear aircraft silhouette
- wider swept wings
- cockpit/glass band
- engine bumps
- tail fin definition
- underside shadow
- palette-driven material slots
- reduced white usage
- readable at motion
- scalable across altitude

---

# Authority Boundaries

## This Spec Owns

- aircraft visual interpretation
- procedural regional jet topology
- altitude-aware aircraft detail tiers
- aircraft material slot consumption
- low-poly aircraft canvas drawing
- debug commands for aircraft visual profile inspection

## This Spec May Read

- `SBE.AircraftRuntime`
- `SBE.MapboxViewportRuntime`
- `SBE.ObjectProfileRegistry`
- `SBE.AltitudeWorldState`
- `SBE.AirspaceInfluenceRenderer`

## This Spec May Write

- aircraft overlay canvas pixels only
- `SBE.AircraftRenderer` internal visual state
- debug snapshot state

## This Spec Must Not Mutate

- aircraft runtime truth
- aircraft lifecycle state
- route progression
- altitude scalar
- Mapbox style
- camera authority
- ObjectProfileRegistry source data
- Color Lab data

---

# Implementation Scope

## Files Modified

```text
wall/render/aircraftRenderer.js
```

## Optional Debug Companion

If debug commands are easier to isolate:

```text
wall/systems/presentation/aircraftVisualDebug.js
```

Otherwise extend:

```text
wall/systems/presentation/aircraftDebug.js
```

## No New Required Runtime File

Do not create a new aircraft renderer unless unavoidable.

Patch the existing renderer.

---

# Required Rendering Changes

## 1. Replace Simple Icon With Low-Poly Regional Jet Draw Path

Add:

```js
function _drawLowPolyAircraft(ctx, x, y, heading, scale, alpha, entity, profile) {}
```

This function replaces or wraps the current `_drawIcon()` for aircraft using the `REGIONAL_JET` profile.

The draw path must include:

- fuselage polygon
- swept wings
- cockpit/glass band
- tailplane
- vertical tail
- engine pods
- accent stripe or belly line
- navigation light accents at higher detail tiers

---

# Geometry Language

## Regional Jet Silhouette

The regional jet should be drawn using local coordinates around aircraft center.

Nose points toward local negative Y.

Suggested normalized proportions:

```js
const GEOM = {
  fuselageLength: 2.90,
  fuselageNoseWidth: 0.16,
  fuselageBodyWidth: 0.34,
  fuselageTailWidth: 0.20,
  wingRootY: -0.18,
  wingTipY: 0.12,
  wingSpan: 2.35,
  wingSweep: 0.38,
  tailY: 0.78,
  tailSpan: 0.88,
  tailFinHeight: 0.44,
  engineY: 0.06,
  engineOffsetX: 0.58,
  engineRadius: 0.11
};
```

All actual pixel scale must derive from:

```js
BASE_SIZE_PX * altitudeScale * profileScale
```

---

# Material Slot Usage

Aircraft colors must come from:

```js
SBE.ObjectProfileRegistry.getAircraftPalette(classKey, paletteRef)
```

Required slots:

```text
body    → fuselage + wing fill
stroke  → outline / structural edges
glass   → cockpit band
accent  → stripe / underside / wing accents
light   → nav lights / beacon accents
```

The existing renderer already delegates fill/stroke to the registry. Expand this to consume:

```js
{
  body,
  stroke,
  glass,
  accent,
  light
}
```

Fallback must remain safe if the registry is missing.

---

# Class Key Resolution

Use existing normalization:

```js
regional   → REGIONAL_JET
narrowbody → NARROWBODY
widebody   → WIDEBODY
helicopter → HELICOPTER
cargo      → CARGO_PLANE
prop       → PROP_COMMUTER
unknown    → unknown
```

For v1.0.0:

```text
REGIONAL_JET is the only required upgraded shape.
```

Other aircraft classes may continue using the existing icon path, but must still consume registry palette colors.

---

# Detail Tiers

Detail must scale by rendered aircraft size.

```js
function _resolveAircraftDetailTier(sizePx, altitudeScalar) {
  if (sizePx >= 18 && altitudeScalar < 0.45) return "hero";
  if (sizePx >= 11) return "near";
  if (sizePx >= 7) return "mid";
  return "far";
}
```

## Far

Render:

- fuselage
- wing silhouette
- no cockpit
- no engines
- no nav lights

## Mid

Render:

- fuselage
- wings
- tailplane
- simplified cockpit mark

## Near

Render:

- fuselage
- wings
- tailplane
- cockpit band
- engine pods
- accent stripe

## Hero

Render:

- all Near features
- wing accent lines
- nav light dots
- subtle belly shadow
- optional beacon pulse

---

# Altitude Behavior

The renderer must preserve the existing altitude scale curve.

Do not remove:

```js
_resolveIconScale()
```

Instead, apply the low-poly renderer to the resolved scale.

Rules:

- ground/takeoff aircraft should read larger
- climb aircraft should gradually simplify
- cruise aircraft should reduce to clean symbol
- high-altitude aircraft should not become visually noisy

---

# Shadow Behavior

Keep the existing altitude-aware shadow model.

Shadow should remain:

- strongest near ground
- fading by altitude scalar `0.30`
- bearing-aware
- drawn before aircraft body

Add one improvement:

```text
At near/hero detail tiers, shadow should use the same low-poly aircraft silhouette envelope, not only the old icon shape.
```

This can be implemented by allowing `_drawLowPolyAircraft()` to draw in `"shadow"` mode or adding a simplified `_drawLowPolyAircraftShadow()`.

---

# Route Trace Compatibility

Existing route trace must remain.

The upgraded plane should not interfere with:

```js
_drawRouteTrace()
```

Route trace continues to:

- appear during takeoff roll and climb
- fade with altitude
- respond to `AltitudeWorldState.routeTraceOpacity`

---

# Renderer Flow

Current flow should become:

```text
frame
→ clear canvas
→ render airspace influence field
→ get active aircraft
→ project aircraft position
→ resolve classKey
→ resolve ObjectProfileRegistry profile / palette
→ resolve altitude scale
→ resolve detail tier
→ draw route trace
→ draw shadow
→ draw low-poly aircraft if supported
→ fallback to existing icon otherwise
→ draw debug label if enabled
```

---

# Required Debug Commands

Add or extend aircraft debug with:

```js
_wos.debug.aircraft.visual()
```

Prints:

```text
renderer version
active aircraft count
classKey per aircraft
palette slots per aircraft
detail tier per aircraft
low-poly path enabled
fallback icon count
```

Add:

```js
_wos.debug.aircraft.visualMode("lowpoly" | "icon" | "auto")
```

Modes:

```text
auto    → default; supported classes use low-poly
lowpoly → force low-poly where possible
icon    → force old icon renderer
```

Add:

```js
_wos.debug.aircraft.palette("airport_dawn" | "harbor_fog" | "night_approach")
```

If global palette switching is not yet implemented in `ObjectProfileRegistry`, this may set a renderer-local palette override.

---

# Success Criteria

## Visual

- Regional jet no longer looks like a generic icon at takeoff/climb.
- Plane has recognizable fuselage, wings, cockpit, tail, engines.
- Aircraft still remains readable at cruise scale.
- Color comes from ObjectProfileRegistry slots.
- White is not used as the primary body color.

## Technical

- `aircraftRenderer.js` passes syntax check.
- Existing aircraft auto-spawn still works.
- Existing route trace still works.
- Existing altitude scale still works.
- Existing debug labels still work.
- Renderer remains canvas-based.
- No 3D mesh import required.

## Console Verification

```js
_wos.debug.aircraft.followFirst()
_wos.debug.aircraft.icons(2.0)
_wos.debug.aircraft.visual()
_wos.debug.aircraft.visualMode("lowpoly")
_wos.debug.aircraft.palette("harbor_fog")
```

Expected:

```text
REGIONAL_JET → lowpoly path
palette slots resolved
detail tier changes with altitude/scale
no crash if ObjectProfileRegistry is absent
```

---

# Non-Goals

This spec does NOT implement:

- full 3D aircraft meshes
- glTF loading
- Blender export
- AI object generation
- object generator UI
- aircraft physics
- real-world flight route data
- airport taxiing
- landing gear animation
- passenger simulation
- long-haul flight runtime

---

# Deferred Systems

## 0528K — RegionalFlightTripRuntime

Will define:

- 2-hour trip structure
- origin/destination pair
- takeoff → climb → cruise → descent → landing
- regional camera pacing
- first full aviation broadcast proof

## ObjectGenerationPipeline

Will define:

- prompt-to-object workflow
- AI model handoff
- low-poly style doctrine
- geometry normalization
- material slot binding
- runtime object export

## ColorLabMaterialBridge

Will define:

- palette editing
- material slot editing
- object profile theme packs
- exportable visual identity packs

---

# Build Patch Instructions

## Patch 1 — Aircraft Palette Expansion

Modify `_resolveAircraftPalette()` so it returns:

```js
{
  body,
  stroke,
  glass,
  accent,
  light
}
```

not only:

```js
{
  fill,
  stroke
}
```

Preserve `fill` alias for old code:

```js
return {
  body: entry.body,
  fill: entry.body,
  stroke: entry.stroke,
  glass: entry.glass,
  accent: entry.accent,
  light: entry.light
};
```

---

## Patch 2 — Low-Poly Regional Jet Draw Function

Add:

```js
function _drawLowPolyRegionalJet(ctx, x, y, heading, scale, alpha, palette, detailTier) {}
```

Requirements:

- uses `ctx.translate()` / `ctx.rotate()` like existing aircraft icon
- local negative Y is nose direction
- draws fuselage, wings, tail, cockpit, engines by tier
- uses palette slots
- does not mutate runtime state

---

## Patch 3 — Detail Tier Resolution

Add:

```js
function _resolveAircraftDetailTier(sizePx, altitudeScalar) {}
```

Call after scale is resolved.

---

## Patch 4 — Visual Mode Runtime Toggle

Add internal state:

```js
var _visualMode = "auto";
```

Modes:

```text
auto
lowpoly
icon
```

Add public API:

```js
setVisualMode(mode)
getVisualMode()
getVisualDebugSnapshot()
setPaletteOverride(name)
getPaletteOverride()
```

---

## Patch 5 — Debug Binding

Extend aircraft debug with:

```js
visual()
visualMode(mode)
palette(name)
```

If debug companion patch is risky, expose functions on `SBE.AircraftRenderer` first and bind debug in a later patch.

---

# Implementation Notes

## Why Canvas First?

Canvas keeps this pass:

- immediate
- inspectable
- low-risk
- compatible with current overlay stack
- easy to tune visually

## Why Regional Jet First?

Regional jet is the correct first target because:

- it matches a 2-hour trip
- it is readable at airport scale
- it is common enough to be believable
- it does not require widebody complexity
- it connects directly to the next regional flight runtime

## Why Not Mesh Yet?

Mesh import needs a larger pipeline:

- asset generation
- mesh cleanup
- scale normalization
- LOD generation
- material binding
- runtime placement
- camera-facing decisions
- performance validation

That belongs after the visual language is validated.

---

# Validation Checklist

- [ ] Regional jet uses low-poly draw path.
- [ ] Existing fallback icon remains available.
- [ ] Aircraft palette resolves through ObjectProfileRegistry.
- [ ] Missing registry does not break renderer.
- [ ] Detail tiers reduce noise at distance.
- [ ] Shadow remains altitude-aware.
- [ ] Route trace remains visible during takeoff/climb.
- [ ] Debug mode reports visual mode and palette slots.
- [ ] No runtime truth is mutated by renderer.
- [ ] No Mapbox style mutation occurs.
- [ ] No 3D mesh dependency introduced.

---

# Recommended Test Route

Use current auto-spawn or manual spawn:

```js
_wos.debug.aircraft.clear()
_wos.debug.aircraft.spawn("JFK")
_wos.debug.aircraft.followFirst()
_wos.debug.aircraft.icons(2.0)
_wos.debug.aircraft.visualMode("lowpoly")
```

Then observe:

```text
ground/takeoff → detailed low-poly plane
climb          → simplified but recognizable plane
cruise         → clean minimal aviation mark
```

---

# Final Doctrine

The aircraft should not look like a UI marker.

It should look like:

```text
a simplified object belonging to the WOS world
```

This pass establishes the first practical bridge between:

```text
ObjectProfileRegistry
→ low-poly visual language
→ regional flight runtime
→ future object generation pipeline
```
