0611F_WOS_HiddenSuppressionLiveRequeryPatch_v1.0.0_BUILD

Patch mapboxAdapter.js only.

Problem:
0611D height/base suppression works only for IDs already in _hiddenSourceIds. But some visible source buildings remain because one visual building can contain multiple rendered feature IDs, and footprint expansion can be incomplete if queryRenderedFeatures runs too early.

Current file:
mapboxAdapter.js v1.13.2 already includes:
- _queryFootprintFeatureIds()
- _collectAuthorHiddenSuppressionTargets()
- _buildHiddenHeightExpr()
- _buildHiddenBaseExpr()
- _applyHiddenSourceSuppression()
- auditFeatureIdMismatch()

Required patch:
1. Store the full latest manifest passed into applyRegistryEdits():
   _lastAuthorManifest = { buildings, groups, compounds }

2. Move footprint ID expansion as close as possible to paint mutation:
   In _applyHiddenSourceSuppression(), before building expressions:
   - Re-run footprint queries for all hidden building edits with geometry.bounds
   - Re-run group geometry queries when any group member is hidden
   - Re-run compound geometry queries when any compound member/group is hidden
   - Merge those IDs into hiddenIds immediately before building height/base expressions

3. Never rely only on the previously collected _hiddenSourceIds.
   Treat _hiddenSourceIds as Phase 1 seed IDs only.

4. Update authorSuppressionStatus():
   - liveRequeryEnabled: true
   - liveRequeryIdCount
   - totalSuppressedIdCount after live merge

5. Update auditFeatureIdMismatch():
   - report liveRequeryIds
   - compare rendered IDs against final live merged IDs, not only _hiddenSourceIds

Acceptance:
- Hide a source building composed of multiple blocks/features.
- All rendered feature IDs under the hidden footprint are included in fill-extrusion-height match expression.
- The original source building disappears in Author mode and Preview mode.
- Replacement actor remains visible.
- Restore Source Building restores original Mapbox height/base from snapshot.
- No color/replacement author projection returns.
- No Wall, Canvas, Glyph changes.