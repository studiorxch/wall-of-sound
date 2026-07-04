0611K_WOS_WallSourceLayerDiscoveryRepair_v1.0.0_BUILD

Patch wall/systems/presentation/buildingEditProjectionRuntime.js only.

Problem:
0611J added final live query ID expansion, but console still reports:
"no building layers found in current style"

If _layers is empty, no fill-extrusion-height/base expressions can be written, even if finalLiveQuery finds IDs.

Required:
1. In _discoverLayers(), detect actual Mapbox Standard building/model layers used by Wall.
2. Do not rely only on id/sourceLayer containing "building".
3. Log all fill-extrusion/model layers with:
   - id
   - type
   - source
   - source-layer
   - paint keys
4. Include any layer that renders composite building geometry, even if its id does not contain "building".
5. If Mapbox Standard uses model layers instead of fill-extrusion, classify clearly and do not fake suppression.
6. Update verifySuppression() to report:
   - discoveredRenderableLayerCount
   - candidateRenderableLayers
   - reason each layer was accepted/rejected

Acceptance:
- _discoverLayers() no longer returns [] when buildings are visible.
- verifyWallSuppression() can identify the actual layer rendering the beige/original source building.
- If the visible source is a Mapbox model layer, report "MODEL_LAYER_LIMITATION".