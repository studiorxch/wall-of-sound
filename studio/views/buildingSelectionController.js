// ── WOS BuildingSelectionController ───────────────────────────────────────────
// 0614_WOS_3DCanvasLabPhase6BuildingSelectionReplacementAuthoring_v1.0.0_BUILD
// 0615E_WOS_BuildingAuthoringUXPass_v1.0.0_BUILD
// Owns building selection mode, hover highlight, feature pick, centroid
// computation, replacement preview marker, and the wosSelected/wosBuildingHover
// feature-state highlights on the Mapbox 3D buildings layer.
// Does NOT own suppression, actor creation, or Inspector state.
// 0615E: hover highlight, replacement preview (centroid + footprint circle),
//        remount() for map-look style survival, debug getters.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var BUILDING_LAYER_CANDIDATES = ['building', '3d-buildings', 'building-extrusion'];
  var PREVIEW_SRC = 'wos-building-preview-src';
  var PREVIEW_LYR = 'wos-building-preview-circle';

  // Optional building info fields surfaced only if present on the feature.
  var OPTIONAL_PROPERTY_KEYS = ['height', 'min_height', 'extrude', 'class', 'type', 'name', 'housenumber'];

  // ── Centroid helpers (§4.3) ───────────────────────────────────────────────────

  function _flattenCoords(coords) {
    if (!Array.isArray(coords[0])) return [coords];
    if (!Array.isArray(coords[0][0])) return coords;
    var result = [];
    for (var i = 0; i < coords.length; i++) {
      var sub = _flattenCoords(coords[i]);
      for (var j = 0; j < sub.length; j++) result.push(sub[j]);
    }
    return result;
  }

  function _computeBboxCenter(geometry) {
    var coords = _flattenCoords(geometry.coordinates);
    var minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    coords.forEach(function (c) {
      if (c[0] < minLng) minLng = c[0];
      if (c[1] < minLat) minLat = c[1];
      if (c[0] > maxLng) maxLng = c[0];
      if (c[1] > maxLat) maxLat = c[1];
    });
    return { lon: (minLng + maxLng) / 2, lat: (minLat + maxLat) / 2 };
  }

  function _computeRingCentroid(coordinates) {
    var ring = coordinates[0];
    var n = ring.length - 1;
    var sumLng = 0, sumLat = 0;
    for (var i = 0; i < n; i++) { sumLng += ring[i][0]; sumLat += ring[i][1]; }
    return { lon: sumLng / n, lat: sumLat / n };
  }

  function _computeCentroid(geometry) {
    try { return _computeBboxCenter(geometry); }
    catch (e) { return _computeRingCentroid(geometry.coordinates); }
  }

  function _extractOptionalProperties(props) {
    var out = {};
    if (!props) return out;
    OPTIONAL_PROPERTY_KEYS.forEach(function (k) {
      if (props[k] !== undefined && props[k] !== null && props[k] !== '') out[k] = props[k];
    });
    return out;
  }

  // ── BuildingSelectionController ───────────────────────────────────────────────

  function BuildingSelectionController(map, store) {
    this._map      = map;
    this._store    = store;
    this._active   = false;
    this._selected = null;     // BuildingSelection | null
    this._hovered  = null;     // { featureId, sourceId, sourceLayer, layerId } | null

    this._buildingLayerId         = null;
    this._selectionPaintInstalled = false;
    this._selectionPaintLayerId   = null;
    this._origColor               = null;

    this._previewActive = false;
    this._previewMarker = null;

    this._lastError = null;

    this._listeners = {};
  }

  // ── Layer resolution ──────────────────────────────────────────────────────────

  BuildingSelectionController.prototype._findBuildingLayer = function () {
    if (this._buildingLayerId) return this._buildingLayerId;
    var map = this._map;
    for (var i = 0; i < BUILDING_LAYER_CANDIDATES.length; i++) {
      try {
        var l = map.getLayer(BUILDING_LAYER_CANDIDATES[i]);
        if (l && l.type === 'fill-extrusion') {
          this._buildingLayerId = BUILDING_LAYER_CANDIDATES[i];
          return this._buildingLayerId;
        }
      } catch (e) {}
    }
    try {
      var style = map.getStyle();
      var layers = style && style.layers;
      if (layers) {
        for (var j = 0; j < layers.length; j++) {
          if (layers[j].type === 'fill-extrusion') {
            this._buildingLayerId = layers[j].id;
            return this._buildingLayerId;
          }
        }
      }
    } catch (e) {}
    return null;
  };

  // ── Mode ──────────────────────────────────────────────────────────────────────

  BuildingSelectionController.prototype.activateSelectionMode = function () {
    this._active = true;
    try { this._map.getCanvas().style.cursor = 'crosshair'; } catch (e) {}
    this._emit('mode-change', { active: true });
  };

  BuildingSelectionController.prototype.deactivateSelectionMode = function () {
    this._active = false;
    try { this._map.getCanvas().style.cursor = ''; } catch (e) {}
    this.clearHover();
    this.clearSelection();
    this._emit('mode-change', { active: false });
  };

  Object.defineProperty(BuildingSelectionController.prototype, 'isSelectionModeActive', {
    get: function () { return this._active; },
  });

  Object.defineProperty(BuildingSelectionController.prototype, 'selectedBuilding', {
    get: function () { return this._selected; },
  });

  // 0615E: debug getters
  Object.defineProperty(BuildingSelectionController.prototype, 'hoveredFeatureId', {
    get: function () { return this._hovered ? this._hovered.featureId : null; },
  });
  Object.defineProperty(BuildingSelectionController.prototype, 'previewActive', {
    get: function () { return this._previewActive; },
  });
  Object.defineProperty(BuildingSelectionController.prototype, 'lastError', {
    get: function () { return this._lastError; },
  });

  // ── Hover handling (0615E) ───────────────────────────────────────────────────

  BuildingSelectionController.prototype.handleMapMouseMove = function (point) {
    if (!this._active) return;
    var layerId = this._findBuildingLayer();
    if (!layerId) return;

    var features = [];
    try { features = this._map.queryRenderedFeatures(point, { layers: [layerId] }); } catch (e) { return; }

    if (!features || features.length === 0) { this.clearHover(); return; }

    var feature = features[0];
    if (feature.id === undefined || feature.id === null) { this.clearHover(); return; }

    if (this._hovered && String(this._hovered.featureId) === String(feature.id)) return; // already hovered

    this.clearHover();

    var layer = null;
    try { layer = this._map.getLayer(layerId); } catch (e) {}
    var sourceId    = feature.source      || (layer && layer.source)          || 'composite';
    var sourceLayer = feature.sourceLayer || (layer && layer['source-layer']) || 'building';

    var hover = { featureId: feature.id, sourceId: sourceId, sourceLayer: sourceLayer, layerId: layerId };
    try {
      this._map.setFeatureState(
        { source: hover.sourceId, sourceLayer: hover.sourceLayer, id: hover.featureId },
        { wosBuildingHover: true }
      );
      this._ensureSelectionPaint(layerId);
      this._hovered = hover;
      this._emit('hover', hover);
    } catch (e) {}
  };

  BuildingSelectionController.prototype.clearHover = function () {
    if (!this._hovered) return;
    var h = this._hovered;
    try {
      this._map.removeFeatureState(
        { source: h.sourceId, sourceLayer: h.sourceLayer, id: h.featureId },
        'wosBuildingHover'
      );
    } catch (e) {}
    this._hovered = null;
    this._emit('hover-clear', null);
  };

  // ── Click handling ────────────────────────────────────────────────────────────

  BuildingSelectionController.prototype.handleMapClick = function (point) {
    var layerId = this._findBuildingLayer();
    if (!layerId) {
      console.warn('[BuildingSelectionController] No fill-extrusion layer found');
      this._lastError = 'no_building_layer';
      this.clearSelection();
      return null;
    }

    var features = [];
    try {
      features = this._map.queryRenderedFeatures(point, { layers: [layerId] });
    } catch (e) {
      console.warn('[BuildingSelectionController] queryRenderedFeatures error:', e);
    }

    if (!features || features.length === 0) {
      this.clearSelection();
      return null;
    }

    var feature = features[0];

    // Feature ID requirement — §4.4
    if (feature.id === undefined || feature.id === null) {
      this._lastError = 'no_stable_feature_id';
      this._emit('select-error', {
        message: 'This building cannot be selected — the Mapbox source does not provide stable feature IDs.',
      });
      return null;
    }

    if (this._selected) this._clearHighlight(this._selected);
    this.clearHover();

    var layer = null;
    try { layer = this._map.getLayer(layerId); } catch (e) {}
    var sourceId    = feature.source      || (layer && layer.source)          || 'composite';
    var sourceLayer = feature.sourceLayer || (layer && layer['source-layer']) || 'building';

    var centroid;
    try { centroid = _computeCentroid(feature.geometry); }
    catch (e) { centroid = { lat: 0, lon: 0 }; }

    var selection = {
      featureId:   feature.id,
      sourceId:    sourceId,
      sourceLayer: sourceLayer,
      layerId:     layerId,
      centroid:    centroid,
      geometry:    feature.geometry,
      properties:  _extractOptionalProperties(feature.properties), // 0615E — display-only, never persisted
    };

    this._selected  = selection;
    this._lastError = null;
    this._applyHighlight(selection);
    this._emit('select', selection);
    return selection;
  };

  // ── Selection management ──────────────────────────────────────────────────────

  BuildingSelectionController.prototype.clearSelection = function () {
    if (this._selected) {
      this._clearHighlight(this._selected);
      this._selected = null;
      this._emit('deselect', null);
    }
  };

  // ── Highlight — wosSelected feature-state + fill-extrusion-color expression ──

  BuildingSelectionController.prototype._applyHighlight = function (sel) {
    try {
      this._map.setFeatureState(
        { source: sel.sourceId, sourceLayer: sel.sourceLayer, id: sel.featureId },
        { wosSelected: true }
      );
      this._ensureSelectionPaint(sel.layerId);
      this._refreshPreview(sel);
    } catch (e) {
      console.warn('[BuildingSelectionController] highlight error:', e);
    }
  };

  BuildingSelectionController.prototype._clearHighlight = function (sel) {
    try {
      this._map.removeFeatureState(
        { source: sel.sourceId, sourceLayer: sel.sourceLayer, id: sel.featureId },
        'wosSelected'
      );
    } catch (e) {}
    this._clearPreview();
  };

  // Combined paint expression: selected (strong cyan) > hover (subtle cyan) > original.
  // Owns fill-extrusion-color only — BuildingReplacementLayer owns fill-extrusion-opacity,
  // so the two never fight (§7 constraint).
  BuildingSelectionController.prototype._ensureSelectionPaint = function (layerId) {
    if (this._selectionPaintInstalled && this._selectionPaintLayerId === layerId) return;
    try {
      var origColor = this._origColor;
      if (origColor == null) {
        origColor = this._map.getPaintProperty(layerId, 'fill-extrusion-color');
        if (origColor == null) origColor = '#aaaaaa';
        this._origColor = origColor;
      }
      this._selectionPaintLayerId = layerId;
      this._map.setPaintProperty(layerId, 'fill-extrusion-color', [
        'case',
        ['boolean', ['feature-state', 'wosSelected'], false],     '#00CED1',
        ['boolean', ['feature-state', 'wosBuildingHover'], false], '#4FE0E6',
        origColor,
      ]);
      this._selectionPaintInstalled = true;
    } catch (e) {
      console.warn('[BuildingSelectionController] setPaintProperty error:', e);
    }
  };

  BuildingSelectionController.prototype.removeSelectionPaint = function () {
    if (!this._selectionPaintInstalled || !this._selectionPaintLayerId) return;
    try {
      this._map.setPaintProperty(this._selectionPaintLayerId, 'fill-extrusion-color', this._origColor);
    } catch (e) {}
    this._selectionPaintInstalled = false;
    this._selectionPaintLayerId   = null;
    this._origColor               = null;
  };

  // ── Replacement preview (0615E) ──────────────────────────────────────────────
  // Session-only centroid + footprint circle, shown only while a building is
  // selected and not yet bound to a structure actor. Never written to manifests.

  BuildingSelectionController.prototype._refreshPreview = function (sel) {
    var bound = this._findBoundActor(sel.featureId);
    if (bound) { this._clearPreview(); return; }
    this._showPreview(sel);
  };

  BuildingSelectionController.prototype._findBoundActor = function (featureId) {
    var store = this._store;
    if (!store) return null;
    var found = null;
    store.list().forEach(function (a) {
      if (a.actorCategory === 'structure' && a.structure &&
          a.structure.mapboxFeatureId != null &&
          String(a.structure.mapboxFeatureId) === String(featureId)) {
        found = a;
      }
    });
    return found;
  };

  BuildingSelectionController.prototype._showPreview = function (sel) {
    this._clearPreview();
    var map = this._map;
    try {
      map.addSource(PREVIEW_SRC, {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [sel.centroid.lon, sel.centroid.lat] }, properties: {} },
      });
      map.addLayer({
        id: PREVIEW_LYR, type: 'circle', source: PREVIEW_SRC,
        paint: {
          'circle-radius':        14,
          'circle-color':         '#00CED1',
          'circle-opacity':       0.18,
          'circle-stroke-color':  '#00CED1',
          'circle-stroke-width':  2,
          'circle-stroke-opacity': 0.85,
        },
      });
    } catch (e) {}

    try {
      var el = document.createElement('div');
      el.className = 'wos-building-preview-label';
      el.textContent = 'Replacement Preview';
      if (global.mapboxgl) {
        this._previewMarker = new global.mapboxgl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([sel.centroid.lon, sel.centroid.lat])
          .addTo(map);
      }
    } catch (e) {}

    this._previewActive = true;
  };

  BuildingSelectionController.prototype._clearPreview = function () {
    var map = this._map;
    try { if (map.getLayer(PREVIEW_LYR))  map.removeLayer(PREVIEW_LYR); }  catch (e) {}
    try { if (map.getSource(PREVIEW_SRC)) map.removeSource(PREVIEW_SRC); } catch (e) {}
    if (this._previewMarker) { try { this._previewMarker.remove(); } catch (e) {} this._previewMarker = null; }
    this._previewActive = false;
  };

  // ── Remount (0615E) — re-apply paint/feature-state after MapLookController style switch ──
  BuildingSelectionController.prototype.remount = function () {
    this._buildingLayerId         = null;
    this._selectionPaintInstalled = false;
    this._selectionPaintLayerId   = null;
    this._origColor               = null;

    var hovered  = this._hovered;
    var selected = this._selected;
    this._hovered = null; // force re-application below

    if (selected) this._applyHighlight(selected);
    if (hovered && (!selected || String(hovered.featureId) !== String(selected.featureId))) {
      try {
        this._map.setFeatureState(
          { source: hovered.sourceId, sourceLayer: hovered.sourceLayer, id: hovered.featureId },
          { wosBuildingHover: true }
        );
        this._ensureSelectionPaint(hovered.layerId);
        this._hovered = hovered;
      } catch (e) {}
    }
  };

  // ── Events ────────────────────────────────────────────────────────────────────

  BuildingSelectionController.prototype._emit = function (ev, data) {
    (this._listeners[ev] || []).forEach(function (fn) { try { fn(data); } catch (e) {} });
  };

  BuildingSelectionController.prototype.on = function (ev, fn) {
    if (!this._listeners[ev]) this._listeners[ev] = [];
    this._listeners[ev].push(fn);
  };

  BuildingSelectionController.prototype.off = function (ev, fn) {
    if (!this._listeners[ev]) return;
    this._listeners[ev] = this._listeners[ev].filter(function (f) { return f !== fn; });
  };

  global.WOSBuildingSelectionController = BuildingSelectionController;
  console.log('[BuildingSelectionController] ready — 0615E building authoring UX');
})(window);
