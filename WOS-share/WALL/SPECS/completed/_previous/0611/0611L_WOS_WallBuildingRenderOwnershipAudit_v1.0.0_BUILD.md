0611L_WOS_WallBuildingRenderOwnershipAudit_v1.0.0_BUILD

Patch diagnostics only.

Problem:
BuildingEditProjectionRuntime cannot suppress source buildings because _discoverLayers() finds zero suppressible layers, yet buildings are visibly rendered on Wall.

Required:
1. Add auditWallBuildingRenderOwnership().
2. Query rendered features under:
   - selected building footprint
   - screen center
   - full visible map bbox sample
3. Log every returned feature with:
   - id
   - source
   - sourceLayer
   - layer.id
   - layer.type
   - geometry.type
   - properties.type
   - paint/layout keys if layer exists
4. Inspect map.getStyle().layers AND map.getStyle().imports.
5. Detect whether visible buildings come from:
   - fill-extrusion layer
   - model layer
   - imported Mapbox Standard basemap layer
   - custom Three.js/runtime mesh
   - WOS fallback layer
6. Return classification:
   - STYLE_FILL_EXTRUSION
   - STYLE_MODEL_LAYER
   - IMPORTED_BASEMAP_3D
   - CUSTOM_RUNTIME_MESH
   - UNKNOWN_RENDER_PATH

Do not change suppression behavior.

Acceptance:
- auditWallBuildingRenderOwnership() identifies the exact render owner of the beige Wall buildings.
- Report includes actionable next patch name.