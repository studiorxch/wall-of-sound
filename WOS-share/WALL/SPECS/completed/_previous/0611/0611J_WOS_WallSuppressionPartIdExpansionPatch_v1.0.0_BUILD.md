0611J_WOS_WallSuppressionPartIdExpansionPatch_v1.0.0_BUILD

Patch wall/systems/presentation/buildingEditProjectionRuntime.js only.

Problem:
verifyWallSuppression() returns classification C:
Expression exists and replacement layer dominance is correct, but extra rendered tile/part IDs remain. This means the current suppression set does not include all rendered feature IDs inside the hidden/replacement footprint.

Current evidence:
- replacementLayerDominant: true
- replacementLayerIndex: 65
- highestSourceLayerIndex: -1
- failure: “extra rendered tile/part IDs remain”

Required patch:
1. In _apply(), immediately before writing fill-extrusion-height/base expressions, perform a final live query pass for every active hidden/replacement/group/compound footprint.
2. Query all rendered features, not only previously discovered building layer IDs, if highestSourceLayerIndex is -1 or queryLayerIds is empty.
3. Filter returned features by:
   - source === "composite"
   - sourceLayer contains "building" OR layer.id contains "building"
   - feature.id != null
4. Merge every returned feature.id into suppressedBySL using source:sourceLayer.
5. Rebuild fill-extrusion-height/base match expressions with this final merged set.
6. Update verifySuppression() to report:
   - finalLiveQueryIds
   - finalLiveQueryCount
   - remainingUnsuppressedIds

Do not change Studio adapter, preview runtime, registry, UI, Canvas, or Glyph.

Acceptance:
- verifyWallSuppression().summary.classificationCode returns "D"
- No beige/original source building remains under replacement
- Replacement actor remains visible
- clearProjection() restores original height/base