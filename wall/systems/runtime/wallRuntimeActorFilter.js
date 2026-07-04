// ── WOS Wall Runtime Actor Filter ─────────────────────────────────────────────
// 0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD
// Filters a raw actor list from the bundle:
//   - Rejects actors missing objectId
//   - Rejects actors with forbidden authoring-only fields
//   - Rejects non-promoted / retired actors
//   - Rejects actors with invalid anchor (lat/lon/altM/headingDeg)
//   - Emits diagnostics for every rejection
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'ActorFilter';

  var FORBIDDEN_FIELDS = [
    'assetPath', 'assetUrl', 'glbPath', 'localFilePath',
    'authoringSelectionState', 'inspectorDraft',
    'previewAnchor', 'previewHeading',
    // 0616H: custom asset recipe fields must never appear on actor manifests
    'shapeRecipe', 'materialRecipe', 'shapeDraft', 'materialDraft',
    'materialSlots', 'slotColors', 'roughnessPreview', 'metalnessPreview',
    'opacityPreview', 'customAssetRecipe', 'customAssetSource',
    'studioCustomAsset', 'proxyParams', 'parametricTemplate',
    // 0616L: broadcast readiness fields must never appear on actor manifests
    'broadcastReady', 'broadcastBudget', 'renderBudget', 'lodProfile',
    'meshCount', 'materialCount', 'glbComplexity', 'compositionComplexity',
    'customAssetBudget', 'objectComplexityScore',
    // 0616K: composition fields must never appear on actor manifests
    'compositionRecipe', 'compositionChildren', 'compositionAssetId',
    'compositionSource', 'childOffsets', 'kitRecipe', 'groupRecipe',
    // 0617C: GLB package fields must never appear on actor manifests
    'glbRuntimeUrl', 'glbPackageId', 'glbPackagePath', 'glbPackageRecord',
    'glbRuntimeRecord', 'glbFileName', 'glbFileSizeBytes', 'glbContentHash',
    'glbObjectUrl', 'glbLocalPath', 'glbBinary', 'glbBase64',
    'glbScene', 'glbMeshCount', 'glbMaterialCount',
    // 0618B: building texture fields must never appear on actor manifests
    'buildingTexturePackageId', 'buildingTextureAssignment', 'buildingTexture',
    'texturePackage', 'textureRuntimeUrl', 'textureObjectUrl', 'textureBitmap',
    'textureCanvas', 'textureBase64', 'textureLocalPath',
  ];

  function _diag() {
    return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} };
  }

  function _isPromoted(actor) {
    var meta = actor.meta || {};
    if (meta.retiredAt) return false;
    var state = meta.lifecycleState;
    if (state) return state === 'PROMOTED';
    return !!meta.promoted;
  }

  function _hasForbidden(actor) {
    for (var i = 0; i < FORBIDDEN_FIELDS.length; i++) {
      if (actor.hasOwnProperty(FORBIDDEN_FIELDS[i])) return FORBIDDEN_FIELDS[i];
    }
    return null;
  }

  // Validates actor.anchor per the WOS manifest schema.
  // lat: [-90, 90], lon: [-180, 180], altM: finite number, headingDeg: [0, 360)
  function _isValidAnchor(anchor) {
    if (!anchor || typeof anchor !== 'object') return false;
    var lat = anchor.lat, lon = anchor.lon, alt = anchor.altM, hdg = anchor.headingDeg;
    if (typeof lat !== 'number' || lat < -90  || lat > 90)   return false;
    if (typeof lon !== 'number' || lon < -180 || lon > 180)  return false;
    if (typeof alt !== 'number' || !isFinite(alt))            return false;
    if (typeof hdg !== 'number' || hdg < 0 || hdg >= 360)    return false;
    return true;
  }

  // filter(actors) → { accepted, rejected: Array<{actor, reason}> }
  function filter(actors) {
    if (!Array.isArray(actors)) {
      _diag().error(SOURCE, 'filter_input_invalid', 'actors is not an array');
      return { accepted: [], rejected: [] };
    }
    var accepted = [], rejected = [];

    actors.forEach(function (actor) {
      if (!actor || !actor.objectId) {
        rejected.push({ actor: actor, reason: 'missing_objectId' });
        _diag().warn(SOURCE, 'actor_rejected', 'missing objectId');
        return;
      }

      var forbiddenField = _hasForbidden(actor);
      if (forbiddenField) {
        rejected.push({ actor: actor, reason: 'forbidden_field:' + forbiddenField });
        _diag().error(SOURCE, 'actor_rejected_forbidden_field',
          actor.objectId + ' | field: ' + forbiddenField);
        return;
      }

      if (!_isPromoted(actor)) {
        rejected.push({ actor: actor, reason: 'not_promoted' });
        _diag().warn(SOURCE, 'actor_rejected_not_promoted', actor.objectId);
        return;
      }

      if (!_isValidAnchor(actor.anchor)) {
        rejected.push({ actor: actor, reason: 'invalid_anchor' });
        _diag().error(SOURCE, 'actor_rejected_invalid_anchor',
          actor.objectId + ' | anchor: ' + JSON.stringify(actor.anchor));
        return;
      }

      accepted.push(actor);
    });

    _diag().info(SOURCE, 'filter_complete',
      'accepted: ' + accepted.length + ', rejected: ' + rejected.length);
    return { accepted: accepted, rejected: rejected };
  }

  global.WOSWallActorFilter = { filter: filter };
  console.log('[WOSWallActorFilter] ready');
})(window);
