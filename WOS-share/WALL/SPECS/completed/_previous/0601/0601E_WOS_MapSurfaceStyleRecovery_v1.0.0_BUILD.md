# 0601E_WOS_MapSurfaceStyleRecovery_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `WorldSpaceVehicleLayer` is functional.
- Vehicle world-binding, depth, scale, and visual identity are not the current blocker.
- Mapbox GL JS v3.3.0 is loaded and active.
- `mapStyleAuthority.js`, `surfaceStylePresetRuntime.js`, `harborGeometryRuntimeRenderer.js`, `mapboxStyleTransferAudit.js`, and related debug modules are loaded.
- Current symptoms include black surface gaps, cyan grid bleed, land/water inversion-like artifacts, and style overlay conflicts.
- This spec must restore readable map surface rendering before further vehicle polish.

## Purpose

Recover stable, readable Mapbox surface rendering after recent world-space vehicle and presentation-layer changes exposed or worsened surface/style corruption.

Current problem:

```text
vehicles are improving
map surface is visually broken
```

Target result:

```text
map surface is readable
vehicles remain visible
style overlays are controlled
debug layers cannot corrupt production presentation
```

This is a map/style recovery pass.

## Core Doctrine

```text
Surface readability is foundational.
Actors can only read correctly if the world beneath them is stable.
```

Vehicle work must pause until the base map surface is reliable.

## Non-Goals

Do not modify:

- hero route runtime
- traffic runtime
- vehicle mesh builders
- vehicle LOD thresholds
- vehicle session rebind
- vehicle visual registry
- aircraft runtime
- maritime runtime behavior
- AIS validation behavior
- routing logic
- camera motion logic

Do not add new visual features.

This spec only recovers map/style integrity.

## Required Files

Inspect and patch as needed:

```text
wall/systems/presentation/mapStyleAuthority.js
wall/systems/presentation/mapStyleAuthorityDebug.js
wall/systems/presentation/surfaceStylePresetRuntime.js
wall/systems/presentation/surfaceStylePresetDebug.js
wall/systems/presentation/mapboxStyleTransferAudit.js
wall/render/harborGeometryRuntimeRenderer.js
wall/systems/presentation/harborGeometryRuntimeStyle.js
wall/systems/presentation/altitudeAwareWorldRenderer.js
wall/systems/presentation/altitudeAwareWorldRendererDebug.js
wall/systems/world/surfaceStateManager.js
wall/systems/world/surfacePresenceManager.js
wall/index.html
```

Only touch `index.html` if script order is proven to be the cause.

## Observed Symptoms

The current viewport may show:

```text
black land/surface gaps
cyan wire/grid pattern over land
over-bright edge outlines
surface transparency conflicts
terrain-like holes
road layers visible without stable land underneath
harbor geometry bleeding into production view
debug overlays visible during normal traversal
```

These symptoms must be treated as style-layer conflicts until proven otherwise.

## Recovery Priority

Follow this order exactly:

```text
1. Identify active corrupting layers.
2. Disable debug-only overlays from production view.
3. Restore stable Mapbox base style.
4. Reapply only approved presentation overlays.
5. Validate world vehicles against recovered surface.
```

Do not start by tuning colors.

Do not start by tuning vehicles.

## Style Authority Boundary

`MapStyleAuthority` owns presentation styling.

It may:

```text
set layer paint properties
set layer visibility
apply surface presets
protect critical layers
audit layer state
```

It may not:

```text
create simulation truth
alter actor state
alter camera state
alter route state
alter vehicle state
```

## Required Debug Surface Audit

Add or confirm:

```js
_wos.debug.mapStyle.surfaceAudit()
```

It must report:

```js
{
  styleLoaded: true,
  projection,
  zoom,
  pitch,
  bearing,
  suspiciousLayers: [],
  visibleDebugLayers: [],
  transparentFillLayers: [],
  blackFillLayers: [],
  cyanLineLayers: [],
  harborLayers: [],
  terrainLayers: [],
  protectedBaseLayers: []
}
```

The report must include layer ids, type, source, visibility, minzoom, maxzoom, and relevant paint values.

## Suspicious Layer Detection

Flag layers as suspicious if they match any of these:

```text
cyan / electric-blue line or fill colors
black fills with high opacity
fill-opacity < 0.25 on landlike layers
debug, grid, wire, diagnostic, geometry-debug, harbor-debug in id/source
terrain/surface overlay with opacity or color outside active preset
line-width unusually high for non-road diagnostic layers
```

Use conservative detection.

Never hide layers silently without reporting them.

## Safe Recovery Command

Add:

```js
_wos.debug.mapStyle.recoverSurface()
```

It must:

1. Run `surfaceAudit()`.
2. Hide obvious debug-only layers.
3. Restore base land/water/road/building visibility.
4. Avoid touching symbol/label layers unless clearly debug-only.
5. Return a recovery report.

Expected return:

```js
{
  applied: true,
  hiddenLayers: [],
  restoredLayers: [],
  skippedLayers: [],
  warnings: []
}
```

## Hard Rule

`recoverSurface()` must never permanently delete layers.

Only use:

```js
map.setLayoutProperty(id, 'visibility', 'none')
map.setLayoutProperty(id, 'visibility', 'visible')
map.setPaintProperty(...)
```

No layer removal.

No source removal.

No style reload unless explicitly done by a separate command.

## Optional Reset Command

Add:

```js
_wos.debug.mapStyle.resetToPresentationBase()
```

This may reapply the currently selected presentation preset from `SurfaceStylePresetRuntime`.

It must not reload the page.

It must not restart WOS runtime.

It must return success/failure state.

## Protected Layer Families

The recovery system must protect normal map readability layers:

```text
land
water
road
bridge
tunnel
building
park
poi-label
road-label
waterway-label
place-label
```

Do not hide these just because they contain strong colors.

## Debug Overlay Families

The recovery system may hide these by default if visible:

```text
debug
diagnostic
wire
grid-debug
harbor-debug
geometry-debug
tile-debug
validation-debug
probe
test
```

Only if layer id/source clearly indicates debug purpose.

## Harbor Geometry Constraint

Harbor geometry may remain enabled only if it is presentation-safe.

If harbor geometry produces cyan grid/mesh overlays, recovery must provide:

```js
_wos.debug.harborGeometry.presentationSafe(false)
```

or equivalent existing toggle.

If no such toggle exists, create one.

Behavior:

```text
false = hide diagnostic grid/mesh surfaces, keep essential harbor context if safe
true = allow full debug overlay
```

## Surface Preset Compatibility

Surface presets must not produce:

```text
black land gaps
cyan grid overlays
transparent land with exposed debug mesh
roads floating over missing land
```

Add a validation helper:

```js
_wos.debug.presets.validateSurface()
```

Expected output:

```js
{
  preset,
  valid: true,
  failures: [],
  warnings: []
}
```

Failures should include:

```text
land missing
water missing
roads missing
buildings missing
debug overlays visible
excessive cyan layers
excessive black fill layers
```

## Altitude Renderer Constraint

Altitude-aware world rendering must not override base surface readability.

If altitude mode changes:

```text
Low
Drone
Urban
Rooftop
Regional
Cruise
```

surface recovery must persist.

Add or confirm audit output includes current altitude/camera profile.

## Mapbox Style Transfer Audit

`mapboxStyleTransferAudit.js` must distinguish:

```text
style transfer issue
debug overlay issue
presentation preset issue
harbor geometry issue
altitude renderer issue
```

It must not collapse all failures into generic “style mismatch.”

## Console Test Sequence

Required test sequence:

```js
_wos.debug.mapStyle.surfaceAudit()
_wos.debug.mapStyle.recoverSurface()
_wos.debug.presets.validateSurface()
_wos.debug.worldVehicles.state()
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
_wos.debug.worldVehicles.depth(true)
```

Expected:

```text
map readable
no cyan grid bleed
no black land gaps
roads attached to surface
vehicles visible
traffic visible
debug overlays hidden unless explicitly enabled
```

## Acceptance Test A — Immediate Recovery

Run:

```js
_wos.debug.mapStyle.recoverSurface()
```

Expected:

```text
visible black gaps removed or identified
cyan diagnostic grid hidden or identified
base land/water/road/building layers readable
```

If unrecoverable, report exact layer ids causing failure.

## Acceptance Test B — Vehicle Compatibility

Run:

```js
_wos.debug.traffic.spawnVisibleTest()
_wos.debug.traffic.world(true)
```

Expected:

```text
vehicles remain visible
surface remains readable
vehicle layer does not reintroduce map corruption
```

## Acceptance Test C — Preset Stability

Cycle the active surface presets.

Expected:

```text
no preset causes black land gaps
no preset enables diagnostic mesh overlays by default
recoverSurface() can repair every preset
```

## Acceptance Test D — Altitude Stability

Cycle:

```text
Low
Drone
Urban
Rooftop
Regional
Cruise
```

Expected:

```text
base surface remains readable
debug overlays stay off
roads/bridges remain visible
vehicles stay world-bound
```

## Acceptance Test E — Harbor Safety

Enable maritime/harbor systems.

Expected:

```text
harbor context may render
harbor debug mesh/grid must not render unless explicitly requested
cyan mesh overlays stay hidden in production view
```

## Failure Handling

All recovery commands must be guarded.

No command may throw into RAF or crash traversal.

If Mapbox style is not loaded:

```text
return applied:false
include warning: style_not_loaded
```

If layer id is missing:

```text
skip safely
record skipped layer
```

If paint property cannot be set:

```text
record warning
continue
```

## Reporting Requirements

Every recovery command must print:

```text
what was detected
what was changed
what was skipped
what still looks risky
```

No silent patches.

## Implementation Order

1. Add surface audit helper.
2. Identify corrupting layer families.
3. Add recoverSurface().
4. Add harbor presentation-safe toggle if missing.
5. Add preset validator.
6. Confirm altitude transitions do not re-enable debug overlays.
7. Run vehicle compatibility test.
8. Return final report with exact layer ids changed.

## Implementation Guide

- **Where:** Patch map/style recovery logic in `wall/systems/presentation/mapStyleAuthority.js`, debug commands in `wall/systems/presentation/mapStyleAuthorityDebug.js`, preset validation in `wall/systems/presentation/surfaceStylePresetDebug.js`, and harbor overlay safety in `wall/render/harborGeometryRuntimeRenderer.js` or `wall/systems/presentation/harborGeometryRuntimeStyle.js`.
- **What:** Run `npm run dev`, then execute `_wos.debug.mapStyle.surfaceAudit()`, `_wos.debug.mapStyle.recoverSurface()`, `_wos.debug.presets.validateSurface()`, and the vehicle compatibility sequence.
- **Expect:** The map returns to a readable production surface with land, water, roads, bridges, and buildings visible; cyan/debug grids and black land gaps are hidden or explicitly reported; vehicles remain world-bound and visible.
