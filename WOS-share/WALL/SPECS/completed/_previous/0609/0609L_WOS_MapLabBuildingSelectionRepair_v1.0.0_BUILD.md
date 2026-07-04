# 0609L_WOS_MapLabBuildingSelectionRepair_v1.0.0_BUILD

## Objective

Fix Map Lab building/plot selection.

Current state:
- Map loads.
- Pan/zoom works.
- Color edit UI exists.
- Building/plot click selection does not work.

## Scope

In:
- Audit rendered building/plot layers.
- Fix `queryRenderedFeatures` target layers.
- Support Mapbox building layers and fallback polygon/building footprint layers.
- Show clear “no selectable layer found” status if none exist.
- Inspector updates only when a feature is selected.

Out:
- No Canvas work.
- No Glyph work.
- No Wall changes.
- No object replacement.
- No persistence.

## Required Audit

Before code changes, report:
- all rendered layer ids
- layers with `fill-extrusion`
- layers with `building` in id/source-layer
- layers with polygon/fill type that may represent plots/buildings
- current click handler status
- current `queryRenderedFeatures` result count on click

## Requirements

R1 — Discover selectable layers dynamically after map style load.

R2 — Query all selectable building/plot candidate layers on click.

R3 — If no extrusion buildings exist at current zoom/style, fallback to fill/polygon candidates.

R4 — Clicking a selectable feature selects it.

R5 — Inspector shows selected feature data.

R6 — Selected feature visibly highlights if possible.

R7 — Add debug output:
`window.WOSMapLab.debugSelection()`

## Acceptance Tests

T1 — Clicking a visible building/plot selects a feature.

T2 — Inspector updates with feature id/source/sourceLayer/properties.

T3 — If no buildings exist, UI says no selectable building layer found.

T4 — Selection debug returns candidate layers and last query results.

T5 — Map pan/zoom still works.

T6 — No Wall/Canvas/Glyph changes.

## Required Report

- root cause
- layers found
- selected layer used
- files changed
- acceptance results