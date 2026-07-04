// ── WOS BuildingReplacementLayer ──────────────────────────────────────────────
// 0614_WOS_3DCanvasLabPhase6BuildingSelectionReplacementAuthoring_v1.0.0_BUILD
// 0615E_WOS_BuildingAuthoringUXPass_v1.0.0_BUILD
// Owns Mapbox feature-state suppression lifecycle and 3D buildings layer filter.
// Reads WOSActorManifestStore to derive suppression state on every map load.
// Does NOT own actor rendering, building selection, or manifest writes.
// 0615E: remount() re-applies suppression after MapLookController style switch;
//        suppressedCount() for building authoring debug snapshot.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // ── BuildingReplacementLayer ──────────────────────────────────────────────────

  function BuildingReplacementLayer(map, store) {
    this._map    = map;
    this._store  = store;
    this._mounted = false;

    // layerId → previous fill-extrusion-opacity value (before we installed the
    // case expression). Keyed so multiple layers can be handled independently.
    this._modifiedLayers = {};

    this._onIdle = null;
  }

  // mount() — called after map 'load'. Installs the paint expression and
  // reapplies all suppression states from the manifest store.
  BuildingReplacementLayer.prototype.mount = function () {
    this._mounted = true;
    this.reapplyAll();

    // Reapply once after first idle tick: tile loading can clear feature-state
    // on individual tiles that weren't in the viewport yet during mount.
    var self = this;
    this._onIdle = function () {
      self._onIdle = null;
      self.reapplyAll();
    };
    this._map.once('idle', this._onIdle);
  };

  // unmount() — restore 3D buildings layer to its pre-Phase-6 state (§6.3).
  BuildingReplacementLayer.prototype.unmount = function () {
    this._mounted = false;

    var map   = this._map;
    var store = this._store;

    // Restore all modified fill-extrusion-opacity paint properties
    var modified = this._modifiedLayers;
    Object.keys(modified).forEach(function (layerId) {
      try { map.setPaintProperty(layerId, 'fill-extrusion-opacity', modified[layerId]); } catch (e) {}
    });
    this._modifiedLayers = {};

    // Clear wosReplaced feature-states for all bound structure actors
    if (store) {
      store.list().forEach(function (actor) {
        if (actor.actorCategory === 'structure' && actor.structure && actor.structure.mapboxFeatureId != null) {
          var s = actor.structure;
          try {
            map.removeFeatureState(
              { source: s.mapboxSourceId, sourceLayer: s.mapboxSourceLayer || 'building', id: s.mapboxFeatureId },
              'wosReplaced'
            );
          } catch (e) {}
        }
      });
    }
  };

  // suppress() — mark one building feature as replaced (§6.1).
  BuildingReplacementLayer.prototype.suppress = function (featureId, sourceId, sourceLayer, layerId) {
    if (!this._mounted) return;
    try {
      this._map.setFeatureState(
        { source: sourceId, sourceLayer: sourceLayer || 'building', id: featureId },
        { wosReplaced: true }
      );
      this._ensureOpacityExpr(layerId);
    } catch (e) {
      console.warn('[BuildingReplacementLayer] suppress error:', e, { featureId: featureId, sourceId: sourceId });
    }
  };

  // restore() — clear wosReplaced so the paint expression evaluates to prevOpacity.
  BuildingReplacementLayer.prototype.restore = function (featureId, sourceId, sourceLayer) {
    if (!this._mounted) return;
    try {
      this._map.removeFeatureState(
        { source: sourceId, sourceLayer: sourceLayer || 'building', id: featureId },
        'wosReplaced'
      );
    } catch (e) {
      console.warn('[BuildingReplacementLayer] restore error:', e);
    }
  };

  // reapplyAll() — read manifest store and suppress every bound structure actor.
  // Called on mount and after tile refresh (§6.2).
  BuildingReplacementLayer.prototype.reapplyAll = function () {
    if (!this._mounted) return;
    var self  = this;
    var store = this._store;
    if (!store) return;
    store.list().forEach(function (actor) {
      if (actor.actorCategory === 'structure' && actor.structure && actor.structure.mapboxFeatureId != null) {
        var s = actor.structure;
        self.suppress(s.mapboxFeatureId, s.mapboxSourceId, s.mapboxSourceLayer, s.mapboxLayerId);
      }
    });
  };

  // _ensureOpacityExpr() — install the fill-extrusion-opacity case expression on
  // the given layer, storing the previous opacity so unmount() can restore it.
  // If the expression is already installed for this layer, this is a no-op.
  BuildingReplacementLayer.prototype._ensureOpacityExpr = function (layerId) {
    if (!layerId) return;
    if (this._modifiedLayers.hasOwnProperty(layerId)) return;
    try {
      var prevOpacity = this._map.getPaintProperty(layerId, 'fill-extrusion-opacity');
      if (prevOpacity == null) prevOpacity = 1;
      this._modifiedLayers[layerId] = prevOpacity;
      this._map.setPaintProperty(layerId, 'fill-extrusion-opacity', [
        'case',
        ['boolean', ['feature-state', 'wosReplaced'], false],
        0,
        prevOpacity,
      ]);
    } catch (e) {
      console.warn('[BuildingReplacementLayer] _ensureOpacityExpr error:', e, { layerId: layerId });
    }
  };

  // remount() — called by ThreeDCanvasView after MapLookController switches the
  // base style. Style swap wipes feature-state and paint properties, so a full
  // re-apply is required (§13 map look compatibility).
  BuildingReplacementLayer.prototype.remount = function () {
    this._modifiedLayers = {};
    this.reapplyAll();
    var self = this;
    this._map.once('idle', function () { self.reapplyAll(); });
  };

  // suppressedCount() — number of structure actors currently bound/suppressed.
  BuildingReplacementLayer.prototype.suppressedCount = function () {
    var store = this._store;
    if (!store) return 0;
    return store.list().filter(function (a) {
      return a.actorCategory === 'structure' && a.structure && a.structure.mapboxFeatureId != null;
    }).length;
  };

  global.WOSBuildingReplacementLayer = BuildingReplacementLayer;
  console.log('[BuildingReplacementLayer] ready');
})(window);
