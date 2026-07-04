# 0601F_WOS_PresentationAuthorityAudit_v1.0.0 [BUILD]

## Build Readiness

**Status:** [BUILD]  
**Action:** Send to Claude/Codex.

## Environmental Assumptions

- `0601E_WOS_MapSurfaceStyleRecovery` is implemented.
- `surfaceAudit()`, `recoverSurface()`, and `validateSurface()` exist.
- Vehicle systems are not the current blocker.
- The active map surface still renders as a debug/neon presentation state even after debug overlays are hidden.
- Existing commands such as `_wos.debug.presets.state()` and `_wos.debug.mapStyle.currentPreset()` may not exist or may be incomplete.
- This spec establishes presentation ownership observability before more visual tuning.

## Purpose

Create a single authoritative audit layer that explains why the world currently looks the way it looks.

Current problem:

```text
Map surface recovery can hide debug overlays,
but it cannot identify which system owns the active presentation state.
```

Target result:

```text
One debug authority can report, diff, restore, and reset presentation state across map style, surface presets, altitude rendering, harbor overlays, and runtime visual modes.
```

This is an observability and authority-audit specification.

## Core Doctrine

```text
Before tuning presentation, identify presentation ownership.
```

No visual system should silently mutate land, water, road, building, harbor, or debug layer appearance without being visible in the presentation audit.

## Non-Goals

Do not modify:

- vehicle runtime
- traffic runtime
- vehicle mesh builders
- route systems
- camera motion systems
- AIS/maritime logic
- aircraft logic
- weather logic

Do not introduce new visual styling.

This spec adds audit, restore, and authority reporting only.

## Required Files

Inspect and patch as needed:

```text
wall/systems/presentation/mapStyleAuthority.js
wall/systems/presentation/mapStyleAuthorityDebug.js
wall/systems/presentation/surfaceStylePresetRuntime.js
wall/systems/presentation/surfaceStylePresetDebug.js
wall/systems/presentation/mapSurfaceRecovery.js
wall/systems/presentation/altitudeAwareWorldRenderer.js
wall/systems/presentation/altitudeAwareWorldRendererDebug.js
wall/render/harborGeometryRuntimeRenderer.js
wall/systems/presentation/harborGeometryRuntimeStyle.js
wall/systems/presentation/mapboxStyleTransferAudit.js
wall/index.html
```

Add if needed:

```text
wall/systems/presentation/presentationAuthorityAudit.js
```

## Observed Failure

The map can show:

```text
black/brown surface
cyan road/contour geometry
pink/orange roads
missing buildings
debug-looking style with no visible debug layers
```

while:

```text
surfaceAudit().visibleDebug === 0
validateSurface() reports valid or mostly valid
```

This means the current style is not necessarily corrupted by rogue layers.

It may be a legitimate active preset or presentation state.

## Presentation Authority Sources

The audit must inspect at least:

```text
MapStyleAuthority
SurfaceStylePresetRuntime
MapSurfaceRecovery
AltitudeAwareWorldRenderer
HarborGeometryRuntimeRenderer
HarborGeometryRuntimeStyle
Mapbox style transfer audit
NavigationSymbolSuppressor
Runtime flags
Mapbox style layers
```

## Required Debug Namespace

Add:

```js
_wos.debug.presentation
```

With:

```js
_wos.debug.presentation.state()
_wos.debug.presentation.diff()
_wos.debug.presentation.restore()
_wos.debug.presentation.reset()
_wos.debug.presentation.owners()
```

## presentation.state()

Must return:

```js
{
  styleLoaded,
  mapboxStyleUrl,
  projection,
  zoom,
  pitch,
  bearing,
  altitudeProfile,
  activeSurfacePreset,
  activePresentationMode,
  activeMapStyleMode,
  harborOverlayEnabled,
  harborPresentationSafe,
  recoveryLastRun,
  suspiciousLayerCounts,
  baseLayerSummary,
  ownerSummary
}
```

If a subsystem has no state API, report:

```text
unknown
```

Do not throw.

## presentation.owners()

Must identify which subsystem last claims authority over:

```text
land color
water color
road color
building visibility
bridge visibility
terrain/surface overlays
harbor overlays
debug overlays
symbol suppression
altitude presentation
```

Expected shape:

```js
{
  land: { owner, value, confidence },
  water: { owner, value, confidence },
  roads: { owner, value, confidence },
  buildings: { owner, value, confidence },
  harbor: { owner, value, confidence },
  debugOverlays: { owner, value, confidence }
}
```

Confidence values:

```text
high
medium
low
unknown
```

## presentation.diff()

Compare current presentation state against a known-safe baseline.

Baseline should include:

```text
readable land
readable water
visible roads
visible buildings
debug overlays hidden
harbor diagnostic canvas hidden
no cyan diagnostic grid
no black land fill takeover
```

Return:

```js
{
  matchesBaseline,
  differences: [],
  riskyLayers: [],
  missingBaseLayers: [],
  unexpectedVisibleLayers: [],
  unexpectedPaintValues: []
}
```

## presentation.restore()

Restore readable production presentation without changing runtime state.

Must:

1. Hide debug overlays.
2. Hide harbor diagnostic canvas.
3. Restore base land/water/road/building visibility.
4. Reapply safe production preset.
5. Preserve vehicle world-space layer.
6. Preserve route/runtime/camera.
7. Return full report.

Expected:

```js
{
  applied: true,
  restoredPreset,
  hiddenLayers,
  restoredLayers,
  paintResetLayers,
  warnings
}
```

## presentation.reset()

Harder reset than `restore()` but still no page reload.

It may:

```text
reapply Mapbox style presentation baseline
reapply selected safe surface preset
clear presentation-only debug overrides
disable presentation debug overlays
```

It must not:

```text
restart Drive
clear vehicle registry
clear traffic
clear route
reload page
remove layers
remove sources
```

## Safe Baseline

Define a named baseline:

```text
production_readable
```

Minimum expected style:

```text
land visible
water visible
roads visible
bridges visible
buildings visible when available
debug overlays hidden
harbor canvas hidden unless explicitly requested
```

This baseline is not final art direction.

It is a recovery state.

## Ownership Event Logging

Each presentation authority module should expose or write a lightweight event:

```js
{
  owner,
  action,
  target,
  value,
  timestamp
}
```

Examples:

```text
SurfaceStylePresetRuntime applied preset X
MapStyleAuthority changed road color
MapSurfaceRecovery hid contour-line
HarborGeometryRuntimeRenderer canvas disabled
AltitudeAwareWorldRenderer applied Low profile
```

If full event logging is too large, add last-known owner snapshots.

## Current Failure Classifier

Add classifier output:

```js
presentation.classify()
```

Optional if folded into `state()`.

Possible classes:

```text
debug_overlay_leak
surface_preset_active
mapbox_style_transfer_mismatch
harbor_overlay_leak
altitude_profile_override
base_layer_missing
unknown_presentation_owner
```

The screenshot-like current state should classify as:

```text
surface_preset_active
```

or:

```text
unknown_presentation_owner
```

not generic corruption.

## Required Console Sequence

Run:

```js
_wos.debug.presentation.state()
_wos.debug.presentation.owners()
_wos.debug.presentation.diff()
_wos.debug.presentation.restore()
_wos.debug.presentation.state()
```

Expected:

```text
state identifies active owners
owners reports who controls surface appearance
diff explains why map looks non-production
restore returns map to readable production baseline
state confirms readable baseline
```

## Acceptance Test A — State Exists

Run:

```js
_wos.debug.presentation.state()
```

Expected:

```text
No TypeError
No missing namespace
Readable state report
Unknown fields reported as unknown instead of crashing
```

## Acceptance Test B — Owner Identification

Run:

```js
_wos.debug.presentation.owners()
```

Expected:

```text
land/water/road/building/harbor/debug ownership reported
confidence values included
```

## Acceptance Test C — Restore

Run:

```js
_wos.debug.presentation.restore()
```

Expected:

```text
map becomes readable
debug overlays hidden
harbor diagnostic canvas hidden
vehicles remain active
drive continues
```

## Acceptance Test D — Reset

Run:

```js
_wos.debug.presentation.reset()
```

Expected:

```text
stronger readable baseline restored
no page reload
no route restart
no actor clearing
```

## Acceptance Test E — Diff

Run:

```js
_wos.debug.presentation.diff()
```

Expected:

```text
differences from production_readable baseline are explicit
specific layer ids are reported
specific owners are reported when known
```

## Failure Handling

All commands must be guarded.

If map is unavailable:

```js
{ ok:false, reason:'map_unavailable' }
```

If style is not loaded:

```js
{ ok:false, reason:'style_not_loaded' }
```

If subsystem API is missing:

```text
record unknown
continue
```

If layer mutation fails:

```text
record warning
continue
```

No presentation command may throw into RAF.

## Reporting Requirements

Every command must print:

```text
current authority
current style state
what changed
what remains unknown
next recommended action
```

No silent fixes.

## Implementation Order

1. Add `presentationAuthorityAudit.js`.
2. Bind `_wos.debug.presentation`.
3. Implement guarded subsystem readers.
4. Implement `state()`.
5. Implement `owners()`.
6. Implement `diff()`.
7. Implement `restore()` by delegating to existing recovery/preset functions.
8. Implement `reset()` only after `restore()` works.
9. Add optional owner event snapshots.
10. Validate against active neon/debug-looking map state.

## Implementation Guide

- **Where:** Add `wall/systems/presentation/presentationAuthorityAudit.js`; wire it in `wall/index.html` after map style, surface preset, harbor, and recovery debug modules.
- **What:** Run `npm run dev`, launch Drive, then execute `_wos.debug.presentation.state()`, `.owners()`, `.diff()`, `.restore()`, and `.reset()`.
- **Expect:** Presentation authority becomes inspectable from one namespace, the active debug-looking style is classified, and `.restore()` returns the world to a readable production baseline without interrupting vehicles, route, traffic, or camera.
