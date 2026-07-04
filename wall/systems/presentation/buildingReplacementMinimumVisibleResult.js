// ── BuildingReplacementMinimumVisibleResult v1.0.0 ────────────────────────────
// 0612B_WOS_BuildingReplacementMinimumVisibleResult_v1.0.0_BUILD
// Status: active | Classification: interpretation-layer
//
// Purpose:
//   Minimum visible proof that WOS can replace a selected building with a
//   WOS-owned building object.  Produces one deterministic result:
//
//     Click / select building target
//     → create WOS replacement object
//     → render replacement geometry visibly
//     → debug report confirms selected replacement
//
//   This runtime does NOT require imported Mapbox Standard building suppression.
//   If host building features are queryable, their footprint is used.
//   If not, a fallback prism is created at the click coordinate.
//   Visible proof is more important than perfect footprint fidelity.
//
// Authority:
//   READS:   wos-host-building-layer features, Mapbox rendered features, map center
//   WRITES:  wos-building-replacements GeoJSON source
//            wos-building-replacement-layer fill-extrusion
//            wos-building-replacement-outline-layer line
//            in-memory replacement registry
//   MUST NOT: mutate imported Mapbox Standard style internals, Mapbox import
//             config, camera systems, atmosphere systems, audio, overlay grammar
//
// Doctrine:
//   "2D owns truth"    — replacement object record is WOS runtime truth
//   "2.5D owns presentation" — fill-extrusion is presentation geometry
//
// Depends On:
//   BuildingAuthorityRuntime (0612A)
//   MapboxViewportRuntime
//
// Placement: wall/systems/presentation/buildingReplacementMinimumVisibleResult.js
// Load: AFTER buildingAuthorityRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var REPLACEMENT_SOURCE_ID          = 'wos-building-replacements';
  var REPLACEMENT_LAYER_ID           = 'wos-building-replacement-layer';
  var REPLACEMENT_OUTLINE_LAYER_ID   = 'wos-building-replacement-outline-layer';

  var DEFAULT_REPLACEMENT_HEIGHT_METERS  = 42;
  var DEFAULT_REPLACEMENT_BASE_METERS    = 0;
  var DEFAULT_REPLACEMENT_COLOR          = '#66e3ff';
  var DEFAULT_REPLACEMENT_COLOR_SELECTED = '#ff9f1c';
  var DEFAULT_REPLACEMENT_OPACITY        = 0.92;
  var DEFAULT_FALLBACK_HALF_SIZE_METERS  = 18;

  // Host building layer ID from 0612A
  var HOST_BUILDING_LAYER_ID = 'wos-host-building-layer';
  // Also check the 0611Q layer
  var HOST_BUILDING_LAYER_ID_ALT = 'wos-host-buildings-3d';

  // ── Registry state ────────────────────────────────────────────────────────────

  var _registry    = {};    // id → BuildingReplacementObject
  var _idCounter   = 0;
  var _selectedId  = null;  // currently selected replacement id

  // Inspector state — written so Map Lab can observe
  var _inspectorState = {
    selectedId:          null,
    selectedReplacement: null,
    lastUpdatedAt:       null,
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── ID generation ─────────────────────────────────────────────────────────────

  function _nextId() {
    _idCounter++;
    var s = String(_idCounter);
    while (s.length < 4) s = '0' + s;
    return 'wos-building-replacement-' + s;
  }

  // ── Geo helpers ───────────────────────────────────────────────────────────────

  // createFallbackPrism — builds a square GeoJSON Polygon around lngLat.
  // halfSizeMeters is the half-width/depth of the square in metres.
  function createFallbackPrism(lngLat, halfSizeMeters) {
    var half = typeof halfSizeMeters === 'number' ? halfSizeMeters : DEFAULT_FALLBACK_HALF_SIZE_METERS;
    var lng  = lngLat.lng != null ? lngLat.lng : lngLat[0];
    var lat  = lngLat.lat != null ? lngLat.lat : lngLat[1];
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var dLng   = half / (111320 * cosLat);
    var dLat   = half / 111320;
    return {
      type: 'Polygon',
      coordinates: [[
        [lng - dLng, lat - dLat],
        [lng + dLng, lat - dLat],
        [lng + dLng, lat + dLat],
        [lng - dLng, lat + dLat],
        [lng - dLng, lat - dLat],
      ]],
    };
  }

  // _extractPolygonFromFeature — returns a GeoJSON Polygon from a rendered
  // feature, or null if the geometry is not usable.
  function _extractPolygonFromFeature(feature) {
    if (!feature || !feature.geometry) return null;
    var g = feature.geometry;
    if (g.type === 'Polygon' && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
      return { type: 'Polygon', coordinates: g.coordinates };
    }
    if (g.type === 'MultiPolygon' && Array.isArray(g.coordinates) && g.coordinates.length > 0) {
      // Use the largest ring (first ring of the first polygon)
      return { type: 'Polygon', coordinates: g.coordinates[0] };
    }
    return null;
  }

  // ── Source and layer management ───────────────────────────────────────────────

  // ensureReplacementSource — creates wos-building-replacements GeoJSON source
  // if not already present. Always idempotent.
  function ensureReplacementSource(map) {
    if (!map) return false;
    try {
      if (map.getSource(REPLACEMENT_SOURCE_ID)) return true;
      map.addSource(REPLACEMENT_SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      console.log('[BuildingReplacementMinimumVisibleResult] addSource "' + REPLACEMENT_SOURCE_ID + '"');
      return true;
    } catch (e) {
      console.warn('[BuildingReplacementMinimumVisibleResult] ensureReplacementSource error:', e.message || e);
      return false;
    }
  }

  // ensureReplacementLayers — creates fill-extrusion + outline layers above
  // host building layers and imported basemap layers where possible.
  function ensureReplacementLayers(map) {
    if (!map) return false;
    var sourceOk = ensureReplacementSource(map);
    if (!sourceOk) return false;

    try {
      // ── Fill-extrusion layer ─────────────────────────────────────────────────
      if (!map.getLayer(REPLACEMENT_LAYER_ID)) {
        map.addLayer({
          id:     REPLACEMENT_LAYER_ID,
          type:   'fill-extrusion',
          source: REPLACEMENT_SOURCE_ID,
          paint: {
            'fill-extrusion-color': [
              'case', ['boolean', ['get', 'selected'], false],
              DEFAULT_REPLACEMENT_COLOR_SELECTED,
              DEFAULT_REPLACEMENT_COLOR,
            ],
            'fill-extrusion-height':  ['get', 'height'],
            'fill-extrusion-base':    ['get', 'base'],
            'fill-extrusion-opacity': DEFAULT_REPLACEMENT_OPACITY,
          },
        });
        console.log('[BuildingReplacementMinimumVisibleResult] addLayer "' + REPLACEMENT_LAYER_ID + '"');
      }

      // ── Outline layer (line on footprint) ────────────────────────────────────
      if (!map.getLayer(REPLACEMENT_OUTLINE_LAYER_ID)) {
        map.addLayer({
          id:     REPLACEMENT_OUTLINE_LAYER_ID,
          type:   'line',
          source: REPLACEMENT_SOURCE_ID,
          paint: {
            'line-color': [
              'case', ['boolean', ['get', 'selected'], false],
              DEFAULT_REPLACEMENT_COLOR_SELECTED,
              DEFAULT_REPLACEMENT_COLOR,
            ],
            'line-width':   2,
            'line-opacity': 0.9,
          },
        });
        console.log('[BuildingReplacementMinimumVisibleResult] addLayer "' + REPLACEMENT_OUTLINE_LAYER_ID + '"');
      }

      return true;
    } catch (e) {
      console.warn('[BuildingReplacementMinimumVisibleResult] ensureReplacementLayers error:', e.message || e);
      return false;
    }
  }

  // ── Replacement object construction ──────────────────────────────────────────

  // createReplacementFromFeature — builds a BuildingReplacementObject from a
  // rendered Mapbox feature.  Uses the feature's polygon footprint if available,
  // otherwise falls back to a prism at lngLat.
  function createReplacementFromFeature(feature, lngLat) {
    var id       = _nextId();
    var geom     = _extractPolygonFromFeature(feature);
    var kind     = geom ? 'footprint' : 'fallback-prism';
    if (!geom) geom = createFallbackPrism(lngLat, DEFAULT_FALLBACK_HALF_SIZE_METERS);

    var props    = (feature && feature.properties) || {};
    var height   = typeof props.height === 'number' ? Math.max(props.height, 8)
                 : DEFAULT_REPLACEMENT_HEIGHT_METERS;
    var base     = typeof props.min_height === 'number' ? props.min_height
                 : DEFAULT_REPLACEMENT_BASE_METERS;

    return {
      id:             id,
      sourceFeatureId: (feature && feature.id != null) ? feature.id : null,
      createdAt:      Date.now(),
      selected:       true,
      geometryKind:   kind,
      heightMeters:   height,
      baseMeters:     base,
      color:          DEFAULT_REPLACEMENT_COLOR,
      opacity:        DEFAULT_REPLACEMENT_OPACITY,
      outlineEnabled: true,
      source: {
        layerId:      (feature && feature.layer && feature.layer.id) || null,
        sourceId:     (feature && feature.source) || null,
        sourceLayerId:(feature && feature.sourceLayer) || null,
      },
      geometry:   geom,
      properties: {},
    };
  }

  // ── Registry ──────────────────────────────────────────────────────────────────

  // upsertReplacementObject — adds or replaces in the registry.
  function upsertReplacementObject(obj) {
    if (!obj || !obj.id) return;
    // Deselect all others when this one is selected
    if (obj.selected) {
      var keys = Object.keys(_registry);
      for (var i = 0; i < keys.length; i++) {
        if (_registry[keys[i]].selected) _registry[keys[i]].selected = false;
      }
      _selectedId = obj.id;
    }
    _registry[obj.id] = obj;
  }

  // selectReplacementObject — marks one replacement as selected, updates inspector.
  function selectReplacementObject(id) {
    var keys = Object.keys(_registry);
    for (var i = 0; i < keys.length; i++) {
      _registry[keys[i]].selected = (keys[i] === id);
    }
    _selectedId = id;
    _inspectorState.selectedId          = id;
    _inspectorState.selectedReplacement = _registry[id] || null;
    _inspectorState.lastUpdatedAt       = Date.now();
    // Expose on global inspector surface
    if (global._wos && global._wos.state) {
      global._wos.state.selectedReplacement = _inspectorState.selectedReplacement;
    }
  }

  // ── GeoJSON render ────────────────────────────────────────────────────────────

  // renderReplacementObjects — writes all registry entries to the GeoJSON source.
  function renderReplacementObjects(map) {
    if (!map) return;
    var source = map.getSource(REPLACEMENT_SOURCE_ID);
    if (!source || typeof source.setData !== 'function') return;

    var features = [];
    var keys     = Object.keys(_registry);
    for (var i = 0; i < keys.length; i++) {
      var obj = _registry[keys[i]];
      features.push({
        type:     'Feature',
        id:       obj.id,
        geometry: obj.geometry,
        properties: {
          replacementId: obj.id,
          selected:      obj.selected,
          height:        obj.heightMeters,
          base:          obj.baseMeters,
          color:         obj.color,
          opacity:       obj.opacity,
          geometryKind:  obj.geometryKind,
          createdAt:     obj.createdAt,
        },
      });
    }

    try {
      source.setData({ type: 'FeatureCollection', features: features });
    } catch (e) {
      console.warn('[BuildingReplacementMinimumVisibleResult] renderReplacementObjects setData error:', e.message || e);
    }
  }

  // ── Click / coordinate target capture ────────────────────────────────────────

  // createReplacementFromClick — main entry point.
  // Tries three target sources in order:
  //   1. wos-host-building-layer at point
  //   2. general rendered features at point (first building-like feature)
  //   3. fallback prism at lngLat
  //
  // point: Mapbox PointLike {x, y}
  // lngLat: Mapbox LngLat or {lng, lat}
  //
  // Returns BuildingReplacementReport.
  function createReplacementFromClick(point, lngLat) {
    var map    = _getMap();
    var report = {
      ok:                   false,
      replacementId:        null,
      targetFound:          false,
      targetSource:         'none',
      geometryKind:         null,
      sourceExists:         false,
      layerExists:          false,
      renderedFeatureCount: 0,
      registryCount:        Object.keys(_registry).length,
      lastError:            null,
    };

    if (!map) { report.lastError = 'map_not_available'; return report; }

    // Ensure source and layers exist
    var layersOk = ensureReplacementLayers(map);
    report.sourceExists = !!map.getSource(REPLACEMENT_SOURCE_ID);
    report.layerExists  = !!map.getLayer(REPLACEMENT_LAYER_ID);

    var replacement = null;
    var targetSource = 'none';

    // ── Tier 1: wos-host-building-layer ──────────────────────────────────────
    try {
      var hostFeats = map.queryRenderedFeatures(point, {
        layers: [HOST_BUILDING_LAYER_ID],
      }) || [];
      if (!hostFeats.length) {
        // Also try the 0611Q layer
        hostFeats = map.queryRenderedFeatures(point, {
          layers: [HOST_BUILDING_LAYER_ID_ALT],
        }) || [];
      }
      if (hostFeats.length > 0) {
        replacement  = createReplacementFromFeature(hostFeats[0], lngLat);
        targetSource = 'host-building-layer';
        report.targetFound = true;
      }
    } catch (e) {
      report.lastError = 'host-layer query error: ' + String(e.message || e);
    }

    // ── Tier 2: general rendered features ────────────────────────────────────
    if (!replacement) {
      try {
        var allFeats = map.queryRenderedFeatures(point) || [];
        var bldgFeat = null;
        for (var i = 0; i < allFeats.length; i++) {
          var f   = allFeats[i];
          var sl  = (f.sourceLayer || '').toLowerCase();
          var lid = ((f.layer && f.layer.id) || '').toLowerCase();
          var lt  = ((f.layer && f.layer.type) || '').toLowerCase();
          if (/building/.test(sl) || /building/.test(lid) || lt === 'fill-extrusion') {
            bldgFeat = f; break;
          }
        }
        if (bldgFeat) {
          replacement  = createReplacementFromFeature(bldgFeat, lngLat);
          targetSource = 'rendered-feature';
          report.targetFound = true;
        }
      } catch (e) {
        report.lastError = (report.lastError ? report.lastError + ' | ' : '') +
          'rendered-feature query error: ' + String(e.message || e);
      }
    }

    // ── Tier 3: fallback prism at click coordinate ────────────────────────────
    if (!replacement) {
      var fallbackGeom = createFallbackPrism(lngLat, DEFAULT_FALLBACK_HALF_SIZE_METERS);
      var id           = _nextId();
      replacement = {
        id:             id,
        sourceFeatureId: null,
        createdAt:      Date.now(),
        selected:       true,
        geometryKind:   'fallback-prism',
        heightMeters:   DEFAULT_REPLACEMENT_HEIGHT_METERS,
        baseMeters:     DEFAULT_REPLACEMENT_BASE_METERS,
        color:          DEFAULT_REPLACEMENT_COLOR,
        opacity:        DEFAULT_REPLACEMENT_OPACITY,
        outlineEnabled: true,
        source:         { layerId: null, sourceId: null, sourceLayerId: null },
        geometry:       fallbackGeom,
        properties:     {},
      };
      targetSource         = 'click-coordinate';
      report.targetFound   = false;
    }

    // ── Register, render, select ─────────────────────────────────────────────
    upsertReplacementObject(replacement);
    renderReplacementObjects(map);
    selectReplacementObject(replacement.id);

    // Count rendered features on replacement layer as proof
    try {
      var repFeats = map.queryRenderedFeatures(point, {
        layers: [REPLACEMENT_LAYER_ID],
      }) || [];
      report.renderedFeatureCount = repFeats.length;
    } catch (e) {}

    report.ok            = true;
    report.replacementId = replacement.id;
    report.targetSource  = targetSource;
    report.geometryKind  = replacement.geometryKind;
    report.registryCount = Object.keys(_registry).length;

    console.log('[BuildingReplacementMinimumVisibleResult] createReplacementFromClick:',
      'id=' + replacement.id,
      '| source=' + targetSource,
      '| kind=' + replacement.geometryKind,
      '| height=' + replacement.heightMeters + 'm');

    return report;
  }

  // ── Debug helpers ─────────────────────────────────────────────────────────────

  // createReplacementAtCenter — creates a replacement at the current map center.
  // Useful for console testing without a click event.
  function createReplacementAtCenter() {
    var map = _getMap();
    if (!map) {
      return { ok: false, lastError: 'map_not_available', registryCount: 0 };
    }

    var center = map.getCenter();
    var lngLat = { lng: center.lng, lat: center.lat };

    // Project center to screen point
    var point = null;
    try {
      var pt = map.project([center.lng, center.lat]);
      point  = [pt.x, pt.y];
    } catch (e) {
      point = [400, 300]; // fallback if project fails
    }

    return createReplacementFromClick(point, lngLat);
  }

  // debugBuildingReplacements — full state report.
  function debugBuildingReplacements() {
    var map    = _getMap();
    var keys   = Object.keys(_registry);
    var snap   = {
      version:              VERSION,
      registryCount:        keys.length,
      selectedId:           _selectedId,
      sourceExists:         !!(map && map.getSource(REPLACEMENT_SOURCE_ID)),
      layerExists:          !!(map && map.getLayer(REPLACEMENT_LAYER_ID)),
      outlineLayerExists:   !!(map && map.getLayer(REPLACEMENT_OUTLINE_LAYER_ID)),
      registry:             keys.map(function (k) {
        var obj = _registry[k];
        return {
          id:           obj.id,
          geometryKind: obj.geometryKind,
          heightMeters: obj.heightMeters,
          baseMeters:   obj.baseMeters,
          selected:     obj.selected,
          targetSource: obj.source,
          createdAt:    obj.createdAt,
        };
      }),
      inspectorState: {
        selectedId:           _inspectorState.selectedId,
        lastUpdatedAt:        _inspectorState.lastUpdatedAt,
        selectedGeometryKind: _inspectorState.selectedReplacement
          ? _inspectorState.selectedReplacement.geometryKind : null,
      },
    };
    console.log('[BuildingReplacementMinimumVisibleResult] debugBuildingReplacements:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // clearBuildingReplacements — removes all replacements and clears the layer.
  function clearBuildingReplacements() {
    _registry   = {};
    _selectedId = null;
    _inspectorState.selectedId          = null;
    _inspectorState.selectedReplacement = null;
    _inspectorState.lastUpdatedAt       = Date.now();
    if (global._wos && global._wos.state) {
      global._wos.state.selectedReplacement = null;
    }
    var map = _getMap();
    if (map) renderReplacementObjects(map);
    console.log('[BuildingReplacementMinimumVisibleResult] registry cleared');
    return true;
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function init() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr) {
      console.warn('[BuildingReplacementMinimumVisibleResult] MapboxViewportRuntime not available — retrying in 500ms');
      setTimeout(init, 500);
      return;
    }

    function _onReady() {
      var m = mvr.getMap ? mvr.getMap() : null;
      if (!m) return;
      var alreadyLoaded = false;
      try { alreadyLoaded = !!m.isStyleLoaded(); } catch (e) {}

      function _boot() {
        ensureReplacementLayers(m);
        console.log('[BuildingReplacementMinimumVisibleResult] layers initialized');
      }

      if (alreadyLoaded) {
        _boot();
      } else {
        m.once('load', _boot);
      }

      // Re-initialize on style reload
      m.on('styledata', function () {
        var loaded = false;
        try { loaded = !!m.isStyleLoaded(); } catch (e) {}
        if (loaded) {
          // Source and layers may have been lost — re-create
          ensureReplacementLayers(m);
          // Re-render registry contents
          if (Object.keys(_registry).length > 0) renderReplacementObjects(m);
        }
      });
    }

    if (typeof mvr.onStyleLoad === 'function') {
      mvr.onStyleLoad(function () { _onReady(); });
    } else if (typeof mvr.onReady === 'function') {
      mvr.onReady(function () { _onReady(); });
    }

    var mapNow = mvr.getMap ? mvr.getMap() : null;
    if (mapNow) _onReady();

    console.log('[BuildingReplacementMinimumVisibleResult] v' + VERSION + ' initialized');
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.BuildingReplacementMinimumVisibleResult = Object.freeze({
    VERSION:                     VERSION,
    REPLACEMENT_SOURCE_ID:       REPLACEMENT_SOURCE_ID,
    REPLACEMENT_LAYER_ID:        REPLACEMENT_LAYER_ID,
    REPLACEMENT_OUTLINE_LAYER_ID: REPLACEMENT_OUTLINE_LAYER_ID,
    init:                        init,
    ensureReplacementSource:     ensureReplacementSource,
    ensureReplacementLayers:     ensureReplacementLayers,
    createFallbackPrism:         createFallbackPrism,
    createReplacementFromFeature: createReplacementFromFeature,
    createReplacementFromClick:  createReplacementFromClick,
    createReplacementAtCenter:   createReplacementAtCenter,
    upsertReplacementObject:     upsertReplacementObject,
    renderReplacementObjects:    renderReplacementObjects,
    selectReplacementObject:     selectReplacementObject,
    debugBuildingReplacements:   debugBuildingReplacements,
    clearBuildingReplacements:   clearBuildingReplacements,
  });

  // ── Debug surface wiring ──────────────────────────────────────────────────────
  global._wos                 = global._wos         || {};
  global._wos.debug           = global._wos.debug   || {};
  global._wos.debug.buildings = global._wos.debug.buildings || {};
  global._wos.state           = global._wos.state   || {};

  global._wos.debug.buildings.createReplacementAtCenter  = createReplacementAtCenter;
  global._wos.debug.buildings.debugBuildingReplacements  = debugBuildingReplacements;
  global._wos.debug.buildings.clearBuildingReplacements  = clearBuildingReplacements;
  global._wos.debug.buildings.createReplacementFromClick = createReplacementFromClick;

  global.debugBuildingReplacements  = debugBuildingReplacements;
  global.createReplacementAtCenter  = createReplacementAtCenter;
  global.clearBuildingReplacements  = clearBuildingReplacements;

  SBE.BuildingReplacementMinimumVisibleResult.init();

  console.log('[BuildingReplacementMinimumVisibleResult] v' + VERSION +
    ' loaded | source=' + REPLACEMENT_SOURCE_ID +
    ' | layer=' + REPLACEMENT_LAYER_ID +
    ' | debug: _wos.debug.buildings.createReplacementAtCenter()');

})(window);
