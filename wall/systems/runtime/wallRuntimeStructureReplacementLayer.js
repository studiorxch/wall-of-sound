// ── WOS Wall Runtime Structure Replacement Layer ──────────────────────────────
// 0614_WOS_Phase8ProductionPublishToWallRuntime_v1.0.0_BUILD
// Suppresses Mapbox 3D buildings for structure actors in the Wall runtime bundle.
// Uses actor.structure.{mapboxSourceId, mapboxSourceLayer, mapboxLayerId,
// mapboxFeatureId} for all Mapbox API calls.
// Feature-state key: wosReplaced (not "hide").
// Applies fill-extrusion-opacity filter expression per mapboxLayerId.
// Restores previous paint value on clear.
//
// Doctrine:
//   - Wall restores original Mapbox buildings when replacements disappear
//   - Failed suppression → emit diagnostic; actor still renders at anchor
//   - No Studio modules imported
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE = 'StructureLayer';

  // featureId → { sourceId, sourceLayer, layerId } for tracked suppressions
  var _suppressed = {};

  // layerId → previous fill-extrusion-opacity expression (for restore)
  var _savedPaint = {};

  // fill-extrusion-opacity expression: hide any feature with wosReplaced === true
  var OPACITY_EXPR = [
    'case',
    ['boolean', ['feature-state', 'wosReplaced'], false],
    0,
    1,
  ];

  function _diag() {
    return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} };
  }

  function _map() {
    if (global.SBE && global.SBE.map) return global.SBE.map;
    if (global._wosMapInstance)       return global._wosMapInstance;
    return null;
  }

  // Apply fill-extrusion-opacity expression to a Mapbox layer (once per layerId).
  function _applyOpacityExpr(map, layerId) {
    if (_savedPaint[layerId] !== undefined) return; // already applied
    try {
      var current = map.getPaintProperty(layerId, 'fill-extrusion-opacity');
      _savedPaint[layerId] = current !== undefined ? current : 1;
      map.setPaintProperty(layerId, 'fill-extrusion-opacity', OPACITY_EXPR);
    } catch (e) {
      _diag().warn(SOURCE, 'opacity_expr_failed', layerId + ' | ' + e.message);
    }
  }

  // Restore fill-extrusion-opacity to its original value for a layerId.
  function _restoreOpacityExpr(map, layerId) {
    if (_savedPaint[layerId] === undefined) return;
    try {
      map.setPaintProperty(layerId, 'fill-extrusion-opacity', _savedPaint[layerId]);
      delete _savedPaint[layerId];
    } catch (e) {
      _diag().warn(SOURCE, 'opacity_restore_failed', layerId + ' | ' + e.message);
    }
  }

  // Suppress a single structure actor.
  function _suppress(actor) {
    var s = actor.structure;
    var sourceId    = s.mapboxSourceId    || 'composite';
    var sourceLayer = s.mapboxSourceLayer || 'building';
    var layerId     = s.mapboxLayerId;
    var featureId   = s.mapboxFeatureId;

    var map = _map();
    if (!map) {
      _diag().warn(SOURCE, 'map_not_ready', 'cannot suppress ' + featureId);
      return false;
    }
    try {
      map.setFeatureState(
        { source: sourceId, sourceLayer: sourceLayer, id: featureId },
        { wosReplaced: true }
      );
      if (layerId) _applyOpacityExpr(map, layerId);
      _suppressed[featureId] = { sourceId: sourceId, sourceLayer: sourceLayer, layerId: layerId };
      return true;
    } catch (e) {
      _diag().error(SOURCE, 'suppress_failed', featureId + ' | ' + e.message);
      return false;
    }
  }

  // Restore a single suppressed feature.
  function _restore(featureId) {
    var rec = _suppressed[featureId];
    if (!rec) return;
    var map = _map();
    if (!map) {
      _diag().warn(SOURCE, 'map_not_ready', 'cannot restore ' + featureId);
      return;
    }
    try {
      map.removeFeatureState(
        { source: rec.sourceId, sourceLayer: rec.sourceLayer, id: featureId },
        'wosReplaced'
      );
      // Only restore opacity expression when no other features still use this layer
      var layerId = rec.layerId;
      if (layerId) {
        var stillActive = Object.keys(_suppressed).some(function (id) {
          return id !== featureId && _suppressed[id] && _suppressed[id].layerId === layerId;
        });
        if (!stillActive) _restoreOpacityExpr(map, layerId);
      }
      delete _suppressed[featureId];
    } catch (e) {
      _diag().warn(SOURCE, 'restore_failed', featureId + ' | ' + e.message);
    }
  }

  // applyBundle(actors) → { suppressed: number, failed: number }
  function applyBundle(actors) {
    var suppressed = 0, failed = 0;
    (actors || []).forEach(function (actor) {
      if (actor.actorCategory !== 'structure') return;
      var s = actor.structure;
      if (!s || s.mapboxFeatureId == null) return;
      var ok = _suppress(actor);
      if (ok) suppressed++;
      else    failed++;
    });
    _diag().info(SOURCE, 'bundle_applied', 'suppressed: ' + suppressed + ', failed: ' + failed);
    return { suppressed: suppressed, failed: failed };
  }

  // clearBundle(actors): restore all buildings suppressed for these actors.
  function clearBundle(actors) {
    (actors || []).forEach(function (actor) {
      if (actor.actorCategory !== 'structure') return;
      var s = actor.structure;
      if (!s || s.mapboxFeatureId == null) return;
      if (_suppressed[s.mapboxFeatureId]) _restore(s.mapboxFeatureId);
    });
    _diag().info(SOURCE, 'bundle_cleared');
  }

  // restoreAll(): restore every suppressed feature (rollback path).
  function restoreAll() {
    var ids = Object.keys(_suppressed);
    ids.forEach(function (id) { _restore(id); });
    _diag().info(SOURCE, 'restore_all', 'restored: ' + ids.length);
  }

  // suppressedCount() — for diagnostics snapshot
  function suppressedCount() { return Object.keys(_suppressed).length; }

  global.WOSWallStructureReplacementLayer = {
    applyBundle:     applyBundle,
    clearBundle:     clearBundle,
    restoreAll:      restoreAll,
    suppressedCount: suppressedCount,
  };
  console.log('[WOSWallStructureReplacementLayer] ready');
})(window);
