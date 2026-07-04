// ── BuildingAuthorityRuntime v1.0.0 ──────────────────────────────────────────
// 0612A_WOS_HostBuildingLayerBootRepair_v1.0.0_BUILD
// Status: active | Classification: runtime-authority
// 0612G reclassification:
//   BuildingAuthorityRuntime owns query substrate readiness only.
//   Host layers are infrastructure.
//   Visible host-layer paint must be debug-only.
//
// Purpose:
//   Establish and validate the WOS host-owned building authority layer.
//   Answers one question before all downstream building systems are allowed
//   to proceed:
//
//     "Does a valid host-owned building layer exist?"
//
//   This runtime owns:
//     - host building source registration
//     - host building layer registration
//     - source-layer validation
//     - feature transfer validation
//     - boot classification and diagnostics
//
//   This runtime does NOT own:
//     - building styling or colors
//     - building replacement geometry
//     - building editing UI
//     - building projection or suppression expressions
//     - atmosphere or texture systems
//
// Authority:
//   READS:   Mapbox GL map style state, imported source definitions
//   WRITES:  Host building source (wos-host-buildings or composite proxy)
//            Host building layer (wos-host-building-layer)
//            _wos.debug.buildings.* diagnostics
//   MUST NOT: modify projection meshes, style tokens, atmosphere systems,
//             overlay grammar, camera systems, wos-replacement-* layers
//
// Doctrine:
//   "2D owns truth" — host building authority is runtime truth
//   "2.5D owns presentation" — meshes, outlines, textures are presentation
//
// Observed By:
//   BuildingEditProjectionRuntime (layer discovery, suppression targets)
//   EditableBuildingMode (authority check gate)
//   Future building replacement / stylization runtimes
//
// Placement: wall/systems/presentation/buildingAuthorityRuntime.js
// Load: BEFORE buildingEditProjectionRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Authority constants ───────────────────────────────────────────────────────

  var HOST_BUILDING_SOURCE_ID  = 'wos-host-buildings';
  var HOST_BUILDING_LAYER_ID   = 'wos-host-building-layer';
  var MIN_EXPECTED_FEATURES    = 1;

  // Candidate source-layer names, tried in priority order.
  var CANDIDATE_SOURCE_LAYERS  = ['building', 'buildings', 'building_polygon', 'building3d'];

  // ── Boot state ────────────────────────────────────────────────────────────────

  var _boot = {
    initialized:         false,
    sourceExists:        false,
    sourceLayerExists:   false,
    layerExists:         false,
    sourceId:            null,
    sourceLayerId:       null,
    layerId:             null,
    featureCount:        -1,
    bootClassification:  null,   // 'READY' | 'SOURCE_MISSING' | 'SOURCE_LAYER_MISSING' | 'LAYER_MISSING' | 'NO_FEATURES'
    lastBootAt:          null,
    lastError:           null,
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Source resolution ─────────────────────────────────────────────────────────
  //
  // Priority:
  //   1. 'composite' already in host style — tile data is already loaded;
  //      no addSource call needed; use HOST_BUILDING_SOURCE_ID only as a label.
  //      (We reference 'composite' directly; sourceId = 'composite'.)
  //   2. First vector source in imports[0].data.sources — copy its definition
  //      into the host style under HOST_BUILDING_SOURCE_ID.
  //   3. Nothing found.
  //
  // Returns:
  //   { ok, sourceId, sourceDefinition, origin, error }
  //   origin: 'host-composite' | 'import-data' | 'none'

  function _resolveHostBuildingSource(map) {
    var style    = null;
    var notFound = { ok: false, sourceId: null, sourceDefinition: null, origin: 'none',
                     error: 'no_source_found' };
    try { style = map.getStyle(); } catch (e) {
      return Object.assign({}, notFound, { error: String(e && e.message || e) });
    }

    var hostSources = (style && style.sources) || {};

    // Priority 1: composite in host style
    if (hostSources['composite']) {
      return { ok: true, sourceId: 'composite',
               sourceDefinition: hostSources['composite'],
               origin: 'host-composite', error: null };
    }

    // Priority 2: WOS-registered source from a previous boot
    if (hostSources[HOST_BUILDING_SOURCE_ID]) {
      return { ok: true, sourceId: HOST_BUILDING_SOURCE_ID,
               sourceDefinition: hostSources[HOST_BUILDING_SOURCE_ID],
               origin: 'host-wos-registered', error: null };
    }

    // Priority 3: copy from import data
    var imports = (style && Array.isArray(style.imports)) ? style.imports : [];
    for (var ii = 0; ii < imports.length; ii++) {
      var impData = imports[ii].data;
      if (!impData || typeof impData.sources !== 'object') continue;
      var impSrcKeys = Object.keys(impData.sources);
      for (var si = 0; si < impSrcKeys.length; si++) {
        var sk     = impSrcKeys[si];
        var srcDef = impData.sources[sk];
        if (srcDef && (srcDef.type === 'vector' || srcDef.url)) {
          return { ok: true, sourceId: HOST_BUILDING_SOURCE_ID,
                   sourceDefinition: srcDef, origin: 'import-data', error: null };
        }
      }
    }

    return notFound;
  }

  // ── Source-layer resolution ───────────────────────────────────────────────────
  //
  // Given a resolved source, determines the correct source-layer name for
  // building geometry.
  //
  // Strategy:
  //   A. Check import data.layers for fill-extrusion layers — their source-layer
  //      gives the authoritative name.
  //   B. Fall back through CANDIDATE_SOURCE_LAYERS.
  //
  // Returns: { ok, sourceLayerId, error }

  function _resolveHostBuildingSourceLayer(map, sourceId) {
    var notFound = { ok: false, sourceLayerId: null, error: 'no_source_layer_found' };
    var style    = null;
    try { style = map.getStyle(); } catch (e) {
      return Object.assign({}, notFound, { error: String(e && e.message || e) });
    }

    // Strategy A: inspect import data.layers for fill-extrusion building layers
    var imports = (style && Array.isArray(style.imports)) ? style.imports : [];
    for (var ii = 0; ii < imports.length; ii++) {
      var impData = imports[ii].data;
      if (!impData || !Array.isArray(impData.layers)) continue;
      for (var li = 0; li < impData.layers.length; li++) {
        var l   = impData.layers[li];
        var sl  = (l['source-layer'] || '').toLowerCase();
        var lid = (l.id              || '').toLowerCase();
        var lt  = (l.type            || '').toLowerCase();
        var isBldg = lt === 'fill-extrusion' || lt === 'model' ||
                     /building/.test(sl) || /building/.test(lid);
        if (isBldg && l['source-layer']) {
          return { ok: true, sourceLayerId: l['source-layer'], error: null };
        }
      }
    }

    // Strategy B: candidate list
    return { ok: true, sourceLayerId: CANDIDATE_SOURCE_LAYERS[0], error: null };
  }

  // ── Host layer creation ───────────────────────────────────────────────────────
  //
  // Creates wos-host-building-layer in the host style if not already present.
  // Inserts below the first wos-replacement-* or wos-preview-* layer found.
  // Returns: { ok, layerAdded, layerAlreadyPresent, sourceAdded, error }

  function _ensureHostBuildingLayer(map) {
    var result = {
      ok: false, layerAdded: false, layerAlreadyPresent: false,
      sourceAdded: false, sourceId: null, sourceLayerId: null, error: null,
    };

    if (!map) { result.error = 'map_not_available'; return result; }

    var style  = null;
    try { style = map.getStyle(); } catch (e) {
      result.error = String(e && e.message || e); return result;
    }
    var layers = (style && style.layers) || [];

    // Idempotent: layer already present
    for (var li = 0; li < layers.length; li++) {
      if (layers[li].id === HOST_BUILDING_LAYER_ID) {
        result.ok                = true;
        result.layerAlreadyPresent = true;
        result.sourceId          = layers[li].source          || null;
        result.sourceLayerId     = layers[li]['source-layer'] || null;
        return result;
      }
    }

    // Resolve source
    var srcInfo = _resolveHostBuildingSource(map);
    if (!srcInfo.ok) {
      result.error = srcInfo.error || 'source_resolution_failed';
      return result;
    }
    result.sourceId = srcInfo.sourceId;

    // Add source to host if needed
    if (srcInfo.origin === 'import-data') {
      var curSources = {};
      try { curSources = (map.getStyle().sources) || {}; } catch (e) {}
      if (!curSources[HOST_BUILDING_SOURCE_ID]) {
        try {
          map.addSource(HOST_BUILDING_SOURCE_ID, srcInfo.sourceDefinition);
          result.sourceAdded = true;
          console.log('[BuildingAuthorityRuntime] addSource("' + HOST_BUILDING_SOURCE_ID + '") from import data');
        } catch (e) {
          result.error = 'addSource failed: ' + String(e && e.message || e);
          return result;
        }
      }
    }

    // Resolve source-layer
    var slInfo = _resolveHostBuildingSourceLayer(map, srcInfo.sourceId);
    result.sourceLayerId = slInfo.sourceLayerId || CANDIDATE_SOURCE_LAYERS[0];

    // Find insertion point
    var insertBefore = null;
    var latestLayers = [];
    try { latestLayers = (map.getStyle().layers) || []; } catch (e) { latestLayers = layers; }
    for (var lli = 0; lli < latestLayers.length; lli++) {
      var llid = latestLayers[lli].id || '';
      if (llid.indexOf('wos-replacement') === 0 || llid.indexOf('wos-preview') === 0) {
        insertBefore = llid; break;
      }
    }

    // Layer definition — fill-extrusion, same visual approach as 0611Q
    var layerDef = {
      id:             HOST_BUILDING_LAYER_ID,
      type:           'fill-extrusion',
      source:         srcInfo.sourceId,
      'source-layer': result.sourceLayerId,
      minzoom:        13,
      paint: {
        'fill-extrusion-color':   '#d8dee8',
        'fill-extrusion-height':  ['interpolate', ['linear'], ['zoom'], 13, 0, 13.5, ['get', 'height']],
        'fill-extrusion-base':    ['case', ['has', 'min_height'], ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 1,
      },
    };

    try {
      if (insertBefore) { map.addLayer(layerDef, insertBefore); }
      else              { map.addLayer(layerDef); }
      result.layerAdded = true;
      result.ok         = true;
      console.log('[BuildingAuthorityRuntime] addLayer "' + HOST_BUILDING_LAYER_ID + '"',
        'source=' + srcInfo.sourceId + ':' + result.sourceLayerId,
        '| insertBefore:', insertBefore || '(top)');
    } catch (e) {
      result.error = 'addLayer failed: ' + String(e && e.message || e);
      console.warn('[BuildingAuthorityRuntime] _ensureHostBuildingLayer:', result.error);
    }

    return result;
  }

  // ── Feature validation ────────────────────────────────────────────────────────
  //
  // Queries rendered features on the host building layer at the screen centre.
  // Returns: { count, features, error }

  function _validateHostBuildingFeatures(map) {
    var result = { count: -1, features: [], error: null };
    if (!map) { result.error = 'map_not_available'; return result; }
    try {
      var canvas = map.getCanvas();
      var cw     = canvas.clientWidth  || canvas.width  || 800;
      var ch     = canvas.clientHeight || canvas.height || 600;
      var feats  = map.queryRenderedFeatures(
        [[cw / 2 - 150, ch / 2 - 150], [cw / 2 + 150, ch / 2 + 150]],
        { layers: [HOST_BUILDING_LAYER_ID] }
      ) || [];
      result.count    = feats.length;
      result.features = feats.map(function (f) {
        return { id: f.id, source: f.source, sourceLayer: f.sourceLayer,
                 type: f.geometry && f.geometry.type };
      });
    } catch (e) {
      result.error = String(e && e.message || e);
    }
    return result;
  }

  // ── Boot classification ───────────────────────────────────────────────────────
  //
  // Returns the canonical HostBuildingLayerReport.
  // bootClassification values:
  //   READY                — all signals green
  //   SOURCE_MISSING       — no building tile source found
  //   SOURCE_LAYER_MISSING — source found, source-layer validation failed
  //   LAYER_MISSING        — source OK but addLayer failed
  //   NO_FEATURES          — layer present but queryRenderedFeatures returns 0

  function classifyHostBuildingBootState() {
    var map = _getMap();

    var report = {
      version:             VERSION,
      sourceExists:        false,
      sourceLayerExists:   false,
      layerExists:         false,
      sourceId:            null,
      sourceLayerId:       null,
      layerId:             HOST_BUILDING_LAYER_ID,
      featureCount:        -1,
      bootClassification:  'SOURCE_MISSING',
      lastError:           _boot.lastError,
    };

    if (!map) {
      report.bootClassification = 'SOURCE_MISSING';
      report.lastError          = 'map_not_available';
      return report;
    }

    // Check style state directly
    var style  = null;
    try { style = map.getStyle(); } catch (e) {
      report.lastError         = String(e && e.message || e);
      report.bootClassification = 'SOURCE_MISSING';
      return report;
    }

    var hostSources = (style && style.sources)  || {};
    var hostLayers  = (style && style.layers)   || [];

    // Source exists?
    var srcId = 'composite';
    if (hostSources['composite']) {
      report.sourceExists = true;
      report.sourceId     = 'composite';
    } else if (hostSources[HOST_BUILDING_SOURCE_ID]) {
      report.sourceExists = true;
      report.sourceId     = HOST_BUILDING_SOURCE_ID;
    }

    if (!report.sourceExists) {
      report.bootClassification = 'SOURCE_MISSING';
      return report;
    }

    // Source-layer: check host building layer definition
    for (var li = 0; li < hostLayers.length; li++) {
      if (hostLayers[li].id === HOST_BUILDING_LAYER_ID) {
        report.layerExists    = true;
        report.sourceLayerId  = hostLayers[li]['source-layer'] || null;
        break;
      }
    }

    // Source-layer also checked against import data
    if (!report.sourceLayerId) {
      var slInfo = _resolveHostBuildingSourceLayer(map, report.sourceId);
      report.sourceLayerId = slInfo.sourceLayerId;
    }

    report.sourceLayerExists = !!(report.sourceLayerId);

    if (!report.sourceLayerExists) {
      report.bootClassification = 'SOURCE_LAYER_MISSING';
      return report;
    }

    if (!report.layerExists) {
      report.bootClassification = 'LAYER_MISSING';
      return report;
    }

    // Feature validation
    var fv = _validateHostBuildingFeatures(map);
    report.featureCount = fv.count;
    if (fv.error) report.lastError = fv.error;

    if (report.featureCount < MIN_EXPECTED_FEATURES) {
      // featureCount === 0 means the layer exists but tile data hasn't loaded or the viewport
      // has no buildings.  featureCount === -1 means query threw.
      // Treat 0 at zoom >= 14 as a harder fail; treat -1 as a query error, not a hard fail.
      report.bootClassification = (report.featureCount === 0) ? 'NO_FEATURES' : 'LAYER_MISSING';
      return report;
    }

    report.bootClassification = 'READY';
    return report;
  }

  // ── Boot sequence ─────────────────────────────────────────────────────────────

  function _runBoot(map) {
    _boot.lastError = null;

    // Step 1 — create layer
    var ensureResult = _ensureHostBuildingLayer(map);
    _boot.sourceId   = ensureResult.sourceId;
    _boot.sourceLayerId = ensureResult.sourceLayerId;
    if (ensureResult.error) _boot.lastError = ensureResult.error;

    // Step 2 — classify
    var report = classifyHostBuildingBootState();

    _boot.sourceExists      = report.sourceExists;
    _boot.sourceLayerExists = report.sourceLayerExists;
    _boot.layerExists       = report.layerExists;
    _boot.layerId           = report.layerExists ? HOST_BUILDING_LAYER_ID : null;
    _boot.featureCount      = report.featureCount;
    _boot.bootClassification = report.bootClassification;
    _boot.lastBootAt        = Date.now();

    var ready = report.bootClassification === 'READY';

    console.log('[BuildingAuthorityRuntime] boot classification:', report.bootClassification,
      '| source:', report.sourceId, '| source-layer:', report.sourceLayerId,
      '| layer:', report.layerExists,
      '| features:', report.featureCount);

    if (!ready) {
      console.warn('[BuildingAuthorityRuntime] boot incomplete —',
        'classification:', report.bootClassification,
        '| lastError:', report.lastError || '(none)');
    } else {
      console.log('[BuildingAuthorityRuntime] host building authority READY ✓');
    }

    return report;
  }

  // ── Public debug API ──────────────────────────────────────────────────────────

  // debugHostBuildingLayer — comprehensive host building layer diagnostic.
  // Attempts to ensure the layer, then classifies boot state.
  // Returns HostBuildingLayerReport.
  //
  // Call forms:
  //   debugHostBuildingLayer()
  //   _wos.debug.buildings.debugHostBuildingLayer()
  //   SBE.BuildingAuthorityRuntime.debugHostBuildingLayer()
  function debugHostBuildingLayer() {
    var map = _getMap();
    if (!map) {
      console.warn('[BuildingAuthorityRuntime] debugHostBuildingLayer: map not available');
      return {
        version: VERSION, sourceExists: false, sourceLayerExists: false,
        layerExists: false, sourceId: null, sourceLayerId: null,
        layerId: null, featureCount: -1,
        bootClassification: 'SOURCE_MISSING', lastError: 'map_not_available',
      };
    }

    var report = _runBoot(map);

    // Enrich report with extended diagnostics
    var style  = null;
    try { style = map.getStyle(); } catch (e) {}
    var styleImports = (style && Array.isArray(style.imports)) ? style.imports : [];
    var hostSources  = (style && style.sources) ? Object.keys(style.sources) : [];

    var extended = {
      version:               VERSION,
      sourceExists:          report.sourceExists,
      sourceLayerExists:     report.sourceLayerExists,
      layerExists:           report.layerExists,
      sourceId:              report.sourceId,
      sourceLayerId:         report.sourceLayerId,
      layerId:               report.layerExists ? HOST_BUILDING_LAYER_ID : null,
      featureCount:          report.featureCount,
      bootClassification:    report.bootClassification,
      // Extended
      hostSources:           hostSources,
      importsPresent:        styleImports.length > 0,
      importCount:           styleImports.length,
      compositeInHostStyle:  hostSources.indexOf('composite') !== -1,
      wosSourceRegistered:   hostSources.indexOf(HOST_BUILDING_SOURCE_ID) !== -1,
      lastBootAt:            _boot.lastBootAt,
      lastError:             report.lastError,
    };

    console.log('[BuildingAuthorityRuntime] debugHostBuildingLayer:', JSON.stringify(extended, null, 2));
    return extended;
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function init() {
    if (_boot.initialized) return;
    _boot.initialized = true;

    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr) {
      console.warn('[BuildingAuthorityRuntime] MapboxViewportRuntime not available — retrying in 500ms');
      setTimeout(init, 500);
      _boot.initialized = false;
      return;
    }

    function _onReady() {
      var m = mvr.getMap ? mvr.getMap() : null;
      if (!m) return;
      var alreadyLoaded = false;
      try { alreadyLoaded = !!m.isStyleLoaded(); } catch (e) {}
      if (alreadyLoaded) {
        _runBoot(m);
      } else {
        m.once('load', function () { _runBoot(m); });
        m.on('styledata', function () {
          var loaded = false;
          try { loaded = !!m.isStyleLoaded(); } catch (e) {}
          if (loaded) _runBoot(m);
        });
      }
    }

    if (typeof mvr.onStyleLoad === 'function') {
      mvr.onStyleLoad(function () { _onReady(); });
    }
    if (typeof mvr.onReady === 'function') {
      mvr.onReady(function () { _onReady(); });
    }

    var mapNow = mvr.getMap ? mvr.getMap() : null;
    if (mapNow) _onReady();

    console.log('[BuildingAuthorityRuntime] v' + VERSION + ' initialized | constants: HOST_BUILDING_SOURCE_ID=' +
      HOST_BUILDING_SOURCE_ID + ' HOST_BUILDING_LAYER_ID=' + HOST_BUILDING_LAYER_ID);
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.BuildingAuthorityRuntime = Object.freeze({
    VERSION:                     VERSION,
    HOST_BUILDING_SOURCE_ID:     HOST_BUILDING_SOURCE_ID,
    HOST_BUILDING_LAYER_ID:      HOST_BUILDING_LAYER_ID,
    MIN_EXPECTED_FEATURES:       MIN_EXPECTED_FEATURES,
    init:                        init,
    debugHostBuildingLayer:      debugHostBuildingLayer,
    classifyHostBuildingBootState: classifyHostBuildingBootState,
  });

  // ── Debug surface wiring ──────────────────────────────────────────────────────
  global._wos                   = global._wos         || {};
  global._wos.debug             = global._wos.debug   || {};
  global._wos.debug.buildings   = global._wos.debug.buildings || {};
  global._wos.debug.buildings.debugHostBuildingLayer        = debugHostBuildingLayer;
  global._wos.debug.buildings.classifyHostBuildingBootState = classifyHostBuildingBootState;
  global.debugHostBuildingLayer = debugHostBuildingLayer;

  SBE.BuildingAuthorityRuntime.init();

  console.log('[BuildingAuthorityRuntime] v' + VERSION +
    ' loaded | debug: _wos.debug.buildings.debugHostBuildingLayer() | SBE.BuildingAuthorityRuntime.debugHostBuildingLayer()');

})(window);
