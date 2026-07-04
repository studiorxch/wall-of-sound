0611C_WOS_HiddenSourceExtrusionTransparentBlackAudit_v1.0.0_BUILD

Audit only. Do not patch yet.

Current state:
0611B changed hidden source suppression for fill-extrusion layers from fill-extrusion-opacity to fill-extrusion-color rgba(0,0,0,0).

Result:
The source building no longer appears in its original color, but it appears black/ghosted instead of fully disappearing.

Determine whether Mapbox fill-extrusion-color respects alpha transparency, or whether rgba(0,0,0,0) is rendered as black.

Audit:
1. For the selected hidden building, read back fill-extrusion-color.
2. Confirm the exact match expression applied.
3. Test three hidden colors on the selected feature only:
   - rgba(0,0,0,0)
   - rgba(0,0,0,0.01)
   - rgba(255,255,255,0)
4. Report whether any fully hides the extrusion.
5. If color alpha cannot hide extrusion, test whether setting fill-extrusion-height or fill-extrusion-base can be data-driven by id.
6. Classify the only viable suppression strategy:
   A. Transparent color works
   B. Color alpha renders black
   C. Height/base suppression works
   D. Must use layer filter exclusion
   E. Must use style-level building layer override

Do not modify UI, registry, preview runtime, wall runtime, groups, compounds, or replacement logic.

Deliver:
- exact paint expression
- exact visual result
- exact Mapbox limitation
- recommended minimal patch