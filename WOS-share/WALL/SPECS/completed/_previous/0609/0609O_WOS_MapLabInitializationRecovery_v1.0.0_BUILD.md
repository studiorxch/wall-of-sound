# 0609O_WOS_MapLabInitializationRecovery_v1.0.0_BUILD

## Objective

Recover Map Lab from 0609N initialization freeze.

Current state:
- Map Lab stage mounts
- Status bar shows "Map Lab · initializing…"
- Map image/layers do not appear
- Selection UX pass introduced lifecycle/status changes

## Scope

In:
- Fix Map Lab initialization freeze.
- Keep selection/hover/outline work only if it does not block map load.
- Make status banner fail-safe.
- Ensure map renders before any outline/status enhancement runs.

Out:
- No Canvas work.
- No Glyph work.
- No Wall changes.
- No new UI beyond existing status bar.

## Required Fix

1. Make `_updateStatus()` safe:
- guard `adapter.getStatus`
- wrap status reads in try/catch
- never allow status rendering to halt map setup

2. Restore map initialization order:
- create map
- confirm map object exists
- render map
- then discover layers
- then add outline/status helpers

3. Remove or defer any logic that blocks map render:
- outline layer
- status polling
- re-entrant hash handling

4. Add debug:
`window.WOSMapLab.debugInit()`

Must return:
- initialized
- adapterReady
- mapExists
- statusText
- styleHasLayers
- buildingLayerCount
- lastError

## Acceptance Tests

T1 — Map Lab no longer freezes at "initializing".

T2 — Mapbox canvas renders again.

T3 — Status bar updates even if tiles fail.

T4 — Building/plot selection still works.

T5 — Hover/selection highlight still works if layers exist.

T6 — No Wall/Canvas/Glyph changes.

## Required Report

- root cause
- files changed
- init order before/after
- debugInit output
- acceptance results