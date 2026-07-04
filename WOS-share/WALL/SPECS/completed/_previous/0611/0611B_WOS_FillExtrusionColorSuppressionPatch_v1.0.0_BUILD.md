0611B_WOS_FillExtrusionColorSuppressionPatch_v1.0.0_BUILD

Apply the 0611A audit recommendation only.

Problem:
Author hidden-source suppression currently applies a per-feature match expression to fill-extrusion-opacity. Mapbox accepts this silently, but fill-extrusion-opacity is not feature-data-driven, so the expression falls back to originalOpacity and buildings remain visible.

Current code confirms _applyHiddenSourceSuppression() always writes props.opacity first, and only uses _buildHiddenColorFallbackExpr() if setPaintProperty throws. It does not throw, so fallback never runs. :contentReference[oaicite:0]{index=0}

Patch:
In studio/mapLab/mapboxAdapter.js only, update _applyHiddenSourceSuppression():

- If layer.type === "fill-extrusion":
  - do NOT call setPaintProperty(layer.id, props.opacity, ...)
  - call setPaintProperty(layer.id, props.color, _buildHiddenColorFallbackExpr(hiddenIds, originalColor))
  - mark _hiddenSuppressionFallbackLayers[layer.id] = true or introduce _hiddenSuppressionColorLayers[layer.id] = true
- Else:
  - keep existing opacity suppression for fill layers

Do not change registry, preview runtime, wall runtime, group logic, compound logic, or MapLab UI.

Acceptance:
1. Hide Source Building in Author mode makes fill-extrusion buildings disappear.
2. Restore Source Building restores original fill-extrusion-color from _restoreOriginalBuildingPaint().
3. authorSuppressionStatus().sourcePaintMutationType reports "color-fallback" or "extrusion-color-suppression" for extrusion layers.
4. No source recoloring for non-hidden buildings.
5. No Canvas/Glyph/Wall changes.