0611G_WOS_WallPreviewHeightSuppressionParity_v1.0.0_BUILD

Patch suppression parity outside Studio MapboxAdapter.

Context:
0611F fixed Author-mode Studio suppression in mapboxAdapter.js using live requery + fill-extrusion-height/base suppression. Do not rework mapboxAdapter.js unless a direct import/export mismatch exists.

Problem:
Preview and Wall may still rely on older suppression assumptions:
- opacity match
- color alpha fallback
- stale footprint query IDs
- source suppression not live-requeried at paint time

Required:
1. Patch studio/mapLab/buildingPreviewRuntime.js:
   - For fill-extrusion source suppression, use fill-extrusion-height/base = 0.
   - Never use fill-extrusion-opacity for per-feature hiding.
   - Never use rgba alpha color suppression on fill-extrusion.
   - Live re-query footprint IDs immediately before suppression paint writes.
   - Restore original height/base when returning to Author mode.

2. Patch wall/systems/presentation/buildingEditProjectionRuntime.js:
   - Same height/base suppression model.
   - Same live requery before paint mutation.
   - Hidden-only, replacement, group, and compound members must suppress source geometry.
   - Restore original height/base in clearProjection().

3. Keep replacement actor layers untouched.
4. Do not mutate Mapbox source data.
5. Do not modify Canvas/Glyph files.

Acceptance:
- Hidden source building disappears in Author, Studio Preview, and Wall.
- Replacement actor remains visible.
- No black ghost extrusion.
- No beige/original extrusion remains under replacement.
- Restore returns original Mapbox building height/base.
- Debug status reports suppression method: extrusion-height-suppression.