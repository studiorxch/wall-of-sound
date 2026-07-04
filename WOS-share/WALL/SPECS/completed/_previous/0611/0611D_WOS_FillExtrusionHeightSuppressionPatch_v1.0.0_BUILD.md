0611D_WOS_FillExtrusionHeightSuppressionPatch_v1.0.0_BUILD

Apply the 0611C recommendation only.

Problem:
fill-extrusion-color rgba(0,0,0,0) suppresses color but renders as black/ghosted extrusion. The audit found color alpha is not viable for Mapbox fill-extrusion hiding. Current mapboxAdapter.js still uses color suppression for fill-extrusion layers. :contentReference[oaicite:0]{index=0}

Patch:
In studio/mapLab/mapboxAdapter.js only:

1. Extend _snapshotLayerPaint() for fill-extrusion layers to capture:
   - fill-extrusion-height
   - fill-extrusion-base

2. Add helpers:
   - _buildHiddenHeightExpr(hiddenIds, originalHeight)
   - _buildHiddenBaseExpr(hiddenIds, originalBase)

3. Update _applyHiddenSourceSuppression():
   - For fill-extrusion layers:
     - do NOT use fill-extrusion-opacity
     - do NOT use transparent fill-extrusion-color
     - set fill-extrusion-height to 0 for hidden ids
     - set fill-extrusion-base to 0 for hidden ids
     - preserve original height/base fallback for all non-hidden features
   - For fill layers:
     - keep existing fill-opacity suppression

4. Update _restoreOriginalBuildingPaint():
   - Restore fill-extrusion-height and fill-extrusion-base from snapshot for fill-extrusion layers.

5. Update authorSuppressionStatus():
   - sourcePaintMutationType should report "extrusion-height-suppression" when active.

Do not change registry, UI, preview runtime, wall runtime, groups, compounds, or replacement logic.

Acceptance:
1. Hidden source building fully disappears in Author mode.
2. No black/ghosted extrusion remains.
3. Restore Source Building returns original height/base/color.
4. Non-hidden buildings keep Mapbox Studio styling.
5. No Canvas/Glyph/Wall changes.