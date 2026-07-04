// ── WOS LODRingController ──────────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase3AuthoringUX_v1.0.0_BUILD
// Geographic LOD circles on Mapbox GeoJSON layers.
// Rings: highM (green), medM (amber), lowM (coral), billboardM (gray).
// Follows transient anchor during gizmo drag; disappears on deselect.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SOURCE_ID         = 'wos-lod-rings';
  var SOURCE_ID_DEFAULT = 'wos-lod-rings-default';
  var LAYER_IDS  = ['wos-lod-high', 'wos-lod-med', 'wos-lod-low', 'wos-lod-billboard'];
  var LAYER_IDS_DEFAULT = ['wos-lod-def-high', 'wos-lod-def-med', 'wos-lod-def-low', 'wos-lod-def-billboard'];

  // Default LOD thresholds per Phase 4 spec.
  var DEFAULT_LOD = { highM: 500, medM: 2000, lowM: 8000, billboardM: 20000 };

  var COLOURS = {
    highM:      '#4caf50',
    medM:       '#ffc107',
    lowM:       '#f44336',
    billboardM: '#9e9e9e',
  };

  var _map = null;
  var _ready = false;
  var _visible = false;

  // ── Geography ────────────────────────────────────────────────────────────────
  function _circle(lat, lon, radiusM, steps) {
    steps = steps || 64;
    var coords = [];
    var R = 6371000; // Earth radius m
    var latR = lat * Math.PI / 180;
    var lonR = lon * Math.PI / 180;
    var d    = radiusM / R;
    for (var i = 0; i <= steps; i++) {
      var bearing = (2 * Math.PI * i) / steps;
      var lat2R = Math.asin(Math.sin(latR) * Math.cos(d) +
                            Math.cos(latR) * Math.sin(d) * Math.cos(bearing));
      var lon2R = lonR + Math.atan2(
        Math.sin(bearing) * Math.sin(d) * Math.cos(latR),
        Math.cos(d) - Math.sin(latR) * Math.sin(lat2R));
      coords.push([lon2R * 180 / Math.PI, lat2R * 180 / Math.PI]);
    }
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} };
  }

  function _buildGeoJSON(lat, lon, thresholds) {
    var t = thresholds || DEFAULTS;
    return {
      type: 'FeatureCollection',
      features: [
        Object.assign(_circle(lat, lon, t.highM),      { properties: { ring: 'high' } }),
        Object.assign(_circle(lat, lon, t.medM),       { properties: { ring: 'med' } }),
        Object.assign(_circle(lat, lon, t.lowM),       { properties: { ring: 'low' } }),
        Object.assign(_circle(lat, lon, t.billboardM), { properties: { ring: 'billboard' } }),
      ],
    };
  }

  // ── Mapbox layer management ───────────────────────────────────────────────────
  function _addLayerSet(sourceId, layerIds, opacity) {
    var ringDefs = [
      { id: layerIds[0], filter: ['==', ['get', 'ring'], 'high'],      color: COLOURS.highM },
      { id: layerIds[1], filter: ['==', ['get', 'ring'], 'med'],       color: COLOURS.medM },
      { id: layerIds[2], filter: ['==', ['get', 'ring'], 'low'],       color: COLOURS.lowM },
      { id: layerIds[3], filter: ['==', ['get', 'ring'], 'billboard'], color: COLOURS.billboardM },
    ];
    ringDefs.forEach(function (def) {
      _map.addLayer({
        id: def.id,
        type: 'line',
        source: sourceId,
        filter: def.filter,
        paint: {
          'line-color': def.color,
          'line-width': 1.5,
          'line-dasharray': [4, 3],
          'line-opacity': opacity || 0.7,
        },
        layout: { visibility: 'none' },
      });
    });
  }

  function _setupLayers() {
    if (!_map || _map.getSource(SOURCE_ID)) return;

    // Active actor LOD rings
    _map.addSource(SOURCE_ID, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    _addLayerSet(SOURCE_ID, LAYER_IDS, 0.7);

    // DEFAULT_LOD baseline rings (gray, dimmer)
    _map.addSource(SOURCE_ID_DEFAULT, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    _addLayerSet(SOURCE_ID_DEFAULT, LAYER_IDS_DEFAULT, 0.28);

    _ready = true;
  }

  function _setData(geojson) {
    if (!_map) return;
    var src = _map.getSource(SOURCE_ID);
    if (src) src.setData(geojson);
  }

  function _setVisibility(on) {
    if (!_map || !_ready) return;
    var vis = on ? 'visible' : 'none';
    LAYER_IDS.forEach(function (id) {
      if (_map.getLayer(id)) _map.setLayoutProperty(id, 'visibility', vis);
    });
    _visible = on;
  }

  function _isDefaultLod(thresholds) {
    return thresholds.highM      === DEFAULT_LOD.highM &&
           thresholds.medM       === DEFAULT_LOD.medM  &&
           thresholds.lowM       === DEFAULT_LOD.lowM  &&
           thresholds.billboardM === DEFAULT_LOD.billboardM;
  }

  function _showDefaultRings(lat, lon, visible) {
    if (!_map || !_ready) return;
    var src = _map.getSource(SOURCE_ID_DEFAULT);
    if (!src) return;
    if (visible) {
      src.setData(_buildGeoJSON(lat, lon, DEFAULT_LOD));
      LAYER_IDS_DEFAULT.forEach(function (id) {
        if (_map.getLayer(id)) _map.setLayoutProperty(id, 'visibility', 'visible');
      });
    } else {
      LAYER_IDS_DEFAULT.forEach(function (id) {
        if (_map.getLayer(id)) _map.setLayoutProperty(id, 'visibility', 'none');
      });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  var Controller = {
    init: function (map) {
      _map = map;
      _map.on('load', _setupLayers);
      if (_map.loaded()) _setupLayers();
    },

    show: function (actor, thresholds) {
      if (!_ready) return;
      var lat = actor.anchor.lat;
      var lon = actor.anchor.lon;
      var t = thresholds || DEFAULT_LOD;
      _setData(_buildGeoJSON(lat, lon, t));
      _setVisibility(true);
      // Show DEFAULT_LOD baseline when actor uses default thresholds
      _showDefaultRings(lat, lon, _isDefaultLod(t));
    },

    moveTo: function (lat, lon, thresholds) {
      if (!_ready || !_visible) return;
      var t = thresholds || DEFAULT_LOD;
      _setData(_buildGeoJSON(lat, lon, t));
    },

    hide: function () {
      _setVisibility(false);
      _showDefaultRings(0, 0, false);
    },

    // Called live from InspectorController during LOD field edits.
    updateLod: function (lat, lon, thresholds) {
      if (!_ready) return;
      var t = thresholds || DEFAULT_LOD;
      _setData(_buildGeoJSON(lat, lon, t));
      if (!_visible) _setVisibility(true);
      _showDefaultRings(lat, lon, _isDefaultLod(t));
    },

    isReady: function () { return _ready; },
    defaultLod: function () { return Object.assign({}, DEFAULT_LOD); },
  };

  global.WOSLODRingController = Controller;
  console.log('[LODRingController] ready');
})(window);
