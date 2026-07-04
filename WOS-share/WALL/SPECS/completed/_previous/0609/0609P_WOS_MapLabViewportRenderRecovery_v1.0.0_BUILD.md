# 0609P_WOS_MapLabViewportRenderRecovery_v1.0.0_BUILD

## Objective

Recover visible and interactive Map Lab viewport rendering.

Current state:
- Status says map exists
- Stage is gray/blank
- No visible map
- No pan/zoom interaction
- No selection response

This is not acceptable. The viewport must render and respond before selection UX work continues.

## Scope

In:
- Fix Mapbox container sizing / overlay blocking.
- Fix Mapbox canvas pointer events.
- Fix CSS/layout issues from 0609N/0609O.
- Verify map dragPan / scrollZoom / click handlers work in browser.
- Ensure status bar does not cover or block the map.
- Ensure `map.resize()` runs after Studio layout mounts.

Out:
- No Canvas work.
- No Glyph work.
- No Wall changes.
- No new MapLab features.
- No object replacement.

## Required Audit First

Report:
- `#maplab-map` clientWidth/clientHeight
- Mapbox canvas width/height
- Mapbox canvas computed opacity/display/visibility
- `.maplab-map-wrapper` computed height
- `.maplab-map-container` computed height
- whether status/hint overlays have `pointer-events:none`
- whether dragPan is enabled
- whether scrollZoom is enabled
- whether click events fire
- console errors

## Requirements

R1 — Map viewport must visibly render tiles or style geometry in a real browser.

R2 — User must be able to pan.

R3 — User must be able to zoom.

R4 — Click events must fire on the map canvas.

R5 — Status bar must be diagnostic only and must never block pointer events.

R6 — If Mapbox tiles cannot load, show explicit error:
“Mapbox tiles unavailable”
Do not pretend the map is usable.

R7 — Do not proceed to selection or color editing until viewport is usable.

## Acceptance Tests

T1 — Map is visible.

T2 — Drag pan works.

T3 — Scroll zoom works.

T4 — Click logging works.

T5 — Status bar updates without blocking.

T6 — No Wall/Canvas/Glyph changes.

## Required Report

- root cause
- files changed
- viewport dimensions before/after
- interaction test results
- console errors cleared