// ── EditableBasemapAuthority v1.0.0 ──────────────────────────────────────────
// 0612E_WOS_NonStandardEditableBasemapAuthority_v1.0.0_BUILD
// Status: active | Classification: runtime-authority
//
// Purpose:
//   Provides a clean basemap context for editable Map Lab building workflows.
//   Switches from the Mapbox Standard import (which renders uncontrollable 3D
//   buildings) to the operator dark-v11 flat style (no Standard 3D buildings).
//
//   Root cause this addresses:
//     Mapbox Standard 3D buildings cannot be disabled via setConfigProperty.
//     show3dBuildings/show3dFacades/show3dLandmarks config keys are accepted
//     but produce no visual change. showBuildingExtrusions is not a valid key.
//
//   Solution:
//     Editable mode loads dark-v11 (no Standard import, no 3D building system).
//     WOS replacement buildings remain as the only 3D building objects.
//     Broadcast mode restores the presentation style on deactivate.
//
// Authority:
//   READS:   MapboxViewportRuntime, BuildingReplacementRuntime status
//   WRITES:  Mapbox style selection (via MapboxViewportRuntime.setPresentationMode)
//            EditableBasemapAuthority runtime state
//   MUST NOT: mutate replacement manifest, actor archetypes, suppression IDs,
//             atmosphere, camera, audio, overlay grammar
//
// Placement: wall/systems/presentation/editableBasemapAuthority.js
// Load:      AFTER selectedBuildingsOnlyMode.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var EDITABLE_BASEMAP_STYLE_ID  = 'wos-editable-flat';
  // dark-v11: geographic context (roads, water, land, labels) with no Mapbox
  // Standard import and no 3D building renderer. Already defined as STYLES.operator
  // in MapboxViewportRuntime. Used by switching presentationMode to false.
  var EDITABLE_BASEMAP_STYLE_URL = 'mapbox://styles/mapbox/dark-v11';

  var REPLACEMENT_SOURCE_ID = 'wos-replacement-markers';
  var REPLACEMENT_LAYER_ID  = 'wos-replacement-layer';

  var STYLE_LOAD_TIMEOUT_MS  = 8000;
  var RELOAD_DEBOUNCE_MS     = 120;

  // ── State ─────────────────────────────────────────────────────────────────────

  var _state = {
    active:                          false,
    activeStyleId:                   null,
    activeStyleUrl:                  null,
    standardImportsPresent:          false,
    standard3dBuildingLayersPresent: false,
    wosReplacementSourceExists:      false,
    wosReplacementLayerExists:       false,
    activeReplacementCount:          0,
    authorityClassification:         'MAP_NOT_READY',
    lastActivatedAt:                 null,
    lastRestoredAt:                  null,
    lastError:                       null,
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Detection helpers ─────────────────────────────────────────────────────────

  function detectStandardImports(map) {
    try {
      var style = map.getStyle();
      var imports = (style && Array.isArray(style.imports)) ? style.imports : [];
      return imports.some(function (imp) {
        return imp && imp.url &&
          imp.url.indexOf('mapbox://styles/mapbox/standard') !== -1;
      });
    } catch (e) { return false; }
  }

  function detectStandardBuildingLayers(map) {
    try {
      var style = map.getStyle();
      var layers = (style && Array.isArray(style.layers)) ? style.layers : [];
      return layers.some(function (l) {
        // model-type layers are Standard imported 3D building/landmark objects
        if (l.type === 'model') return true;
        // fill-extrusion layers whose source-layer references building data
        if (l.type === 'fill-extrusion') {
          var sl = l['source-layer'] || '';
          if (sl === 'building' || sl === 'buildings') return true;
        }
        return false;
      });
    } catch (e) { return false; }
  }

  // ── State refresh ─────────────────────────────────────────────────────────────

  function _refreshState(map) {
    if (!map) {
      _state.authorityClassification = 'MAP_NOT_READY';
      return;
    }

    _state.standardImportsPresent          = detectStandardImports(map);
    _state.standard3dBuildingLayersPresent = detectStandardBuildingLayers(map);

    _state.wosReplacementSourceExists = (function () {
      try { return !!map.getSource(REPLACEMENT_SOURCE_ID); } catch (e) { return false; }
    })();
    _state.wosReplacementLayerExists = (function () {
      try { return !!map.getLayer(REPLACEMENT_LAYER_ID); } catch (e) { return false; }
    })();

    try {
      var brt = SBE.BuildingReplacementRuntime;
      if (brt && typeof brt.status === 'function') {
        var s = brt.status();
        _state.activeReplacementCount = (s && typeof s.activeReplacements === 'number')
          ? s.activeReplacements : 0;
      }
    } catch (e) { _state.activeReplacementCount = 0; }

    var styleObj = null;
    try { styleObj = map.getStyle(); } catch (e) {}
    _state.activeStyleUrl = (styleObj && styleObj.sprite)
      ? null
      : _state.activeStyleUrl;

    if (_state.standardImportsPresent) {
      _state.authorityClassification = 'STANDARD_IMPORT_PRESENT';
    } else if (_state.standard3dBuildingLayersPresent) {
      _state.authorityClassification = 'STANDARD_3D_BUILDINGS_PRESENT';
    } else if (!_state.wosReplacementLayerExists) {
      _state.authorityClassification = 'WOS_REPLACEMENT_LAYER_MISSING';
    } else {
      _state.authorityClassification = 'READY';
    }
  }

  // ── Convergence chain ─────────────────────────────────────────────────────────

  var _convergenceTimer = null;

  function _runConvergenceChain() {
    if (_convergenceTimer) clearTimeout(_convergenceTimer);
    _convergenceTimer = setTimeout(function () {
      _convergenceTimer = null;
      var map = _getMap();
      if (!map) return;
      try {
        var brt = SBE.BuildingReplacementRuntime;
        if (brt) {
          if (typeof brt.reload          === 'function') brt.reload();
          if (typeof brt.repairDominance === 'function') brt.repairDominance();
        }
      } catch (e) {
        console.warn('[EditableBasemapAuthority] convergence chain error:', e.message || e);
      }
      try {
        var proj = SBE.BuildingEditProjectionRuntime;
        if (proj && typeof proj.apply === 'function') proj.apply();
      } catch (e) {
        console.warn('[EditableBasemapAuthority] projection apply error:', e.message || e);
      }
      _refreshState(map);
      console.log('[EditableBasemapAuthority] convergence complete |',
        'authorityClassification:', _state.authorityClassification,
        '| wosLayerExists:', _state.wosReplacementLayerExists,
        '| standardImports:', _state.standardImportsPresent);
    }, RELOAD_DEBOUNCE_MS);
  }

  // ── Style load wait ───────────────────────────────────────────────────────────

  function _waitForStyleLoad(map, callback) {
    var fired = false;
    var timer = null;

    function done() {
      if (fired) return;
      fired = true;
      if (timer) { clearTimeout(timer); timer = null; }
      callback();
    }

    try {
      if (map.isStyleLoaded()) { done(); return; }
    } catch (e) {}

    map.once('styledata', function () {
      try {
        if (map.isStyleLoaded()) { done(); return; }
      } catch (e) {}
      map.once('idle', function () { done(); });
    });

    timer = setTimeout(function () {
      console.warn('[EditableBasemapAuthority] style load timeout — proceeding anyway');
      done();
    }, STYLE_LOAD_TIMEOUT_MS);
  }

  // ── Core API ──────────────────────────────────────────────────────────────────

  function activateEditableBasemapAuthority() {
    var map = _getMap();
    if (!map) {
      _state.lastError = 'map_not_available';
      _state.authorityClassification = 'MAP_NOT_READY';
      console.warn('[EditableBasemapAuthority] activateEditableBasemapAuthority: map not available');
      return _snapshotState();
    }

    _state.lastError = null;
    _state.active    = true;
    _state.activeStyleId  = EDITABLE_BASEMAP_STYLE_ID;
    _state.activeStyleUrl = EDITABLE_BASEMAP_STYLE_URL;

    console.log('[EditableBasemapAuthority] activating editable basemap |', EDITABLE_BASEMAP_STYLE_URL);

    // Use MapboxViewportRuntime.setPresentationMode(false) which already knows
    // to switch to dark-v11 (STYLES.operator) and emits WorkspaceEventBus event.
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.setPresentationMode === 'function') {
      mvr.setPresentationMode(false);
    } else {
      // Fallback: set style directly
      try { map.setStyle(EDITABLE_BASEMAP_STYLE_URL); } catch (e) {
        _state.lastError = String(e && e.message || e);
        console.warn('[EditableBasemapAuthority] setStyle error:', _state.lastError);
        return _snapshotState();
      }
    }

    _state.lastActivatedAt = Date.now();

    // Wait for the style to load, then run convergence chain to re-add WOS layers
    _waitForStyleLoad(map, function () {
      console.log('[EditableBasemapAuthority] style loaded — running convergence chain');
      _runConvergenceChain();
    });

    return _snapshotState();
  }

  function restoreBroadcastBasemapAuthority() {
    var map = _getMap();
    if (!map) {
      _state.lastError = 'map_not_available';
      console.warn('[EditableBasemapAuthority] restoreBroadcastBasemapAuthority: map not available');
      return _snapshotState();
    }

    _state.lastError = null;
    _state.active    = false;

    console.log('[EditableBasemapAuthority] restoring broadcast basemap');

    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.setPresentationMode === 'function') {
      mvr.setPresentationMode(true);
    }

    _state.activeStyleId  = null;
    _state.activeStyleUrl = null;
    _state.lastRestoredAt = Date.now();

    _waitForStyleLoad(map, function () {
      _runConvergenceChain();
    });

    return _snapshotState();
  }

  function verifyEditableBasemapAuthority() {
    var map = _getMap();
    _refreshState(map);

    var report = _snapshotState();
    report.passT1_noStandardImport         = !_state.standardImportsPresent;
    report.passT2_noStandard3dBuildings    = !_state.standard3dBuildingLayersPresent;
    report.passT3_wosReplacementLayerExists = _state.wosReplacementLayerExists;
    report.passT7_classificationReady      = _state.authorityClassification === 'READY';

    console.log('[EditableBasemapAuthority] verifyEditableBasemapAuthority:',
      JSON.stringify(report, null, 2));
    return report;
  }

  function debugEditableBasemapAuthority() {
    var map = _getMap();
    _refreshState(map);

    var rawImports = [];
    var rawLayers  = [];
    try {
      var style = map && map.getStyle();
      rawImports = (style && style.imports) ? style.imports.map(function (i) {
        return { id: i.id, url: i.url };
      }) : [];
      rawLayers = (style && style.layers) ? style.layers
        .filter(function (l) { return l.type === 'model' || l.type === 'fill-extrusion'; })
        .slice(0, 20)
        .map(function (l) {
          return { id: l.id, type: l.type, sourceLayer: l['source-layer'] || null };
        }) : [];
    } catch (e) {}

    var report = Object.assign(_snapshotState(), {
      rawImports:  rawImports,
      rawBuildingCandidateLayers: rawLayers,
    });

    console.log('[EditableBasemapAuthority] debugEditableBasemapAuthority:',
      JSON.stringify(report, null, 2));
    return report;
  }

  // ── State snapshot ────────────────────────────────────────────────────────────

  function _snapshotState() {
    return {
      version:                         VERSION,
      active:                          _state.active,
      activeStyleId:                   _state.activeStyleId,
      activeStyleUrl:                  _state.activeStyleUrl,
      standardImportsPresent:          _state.standardImportsPresent,
      standard3dBuildingLayersPresent: _state.standard3dBuildingLayersPresent,
      wosReplacementSourceExists:      _state.wosReplacementSourceExists,
      wosReplacementLayerExists:       _state.wosReplacementLayerExists,
      activeReplacementCount:          _state.activeReplacementCount,
      authorityClassification:         _state.authorityClassification,
      lastActivatedAt:                 _state.lastActivatedAt,
      lastRestoredAt:                  _state.lastRestoredAt,
      lastError:                       _state.lastError,
    };
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function _rewireDebug() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.buildings = global._wos.debug.buildings || {};
    global._wos.debug.buildings.activateEditableBasemapAuthority = activateEditableBasemapAuthority;
    global._wos.debug.buildings.verifyEditableBasemapAuthority   = verifyEditableBasemapAuthority;
    global._wos.debug.buildings.debugEditableBasemapAuthority    = debugEditableBasemapAuthority;
  }

  function init() {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr) {
      console.warn('[EditableBasemapAuthority] MapboxViewportRuntime not available — retrying in 500ms');
      setTimeout(init, 500);
      return;
    }
    var map = mvr.getMap ? mvr.getMap() : null;
    if (!map) {
      // Use onReady so the debug re-wire fires AFTER main.js's onReady callback.
      if (typeof mvr.onReady === 'function') {
        mvr.onReady(function () {
          var m = mvr.getMap ? mvr.getMap() : null;
          if (m) _refreshState(m);
          _rewireDebug();
          console.log('[EditableBasemapAuthority] v' + VERSION + ' ready (onReady)' +
            ' | authorityClassification: ' + _state.authorityClassification);
        });
      } else {
        setTimeout(init, 500);
      }
      return;
    }

    _refreshState(map);
    _rewireDebug();
    console.log('[EditableBasemapAuthority] v' + VERSION + ' initialized' +
      ' | authorityClassification: ' + _state.authorityClassification);
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.EditableBasemapAuthority = Object.freeze({
    VERSION:                          VERSION,
    EDITABLE_BASEMAP_STYLE_ID:        EDITABLE_BASEMAP_STYLE_ID,
    EDITABLE_BASEMAP_STYLE_URL:       EDITABLE_BASEMAP_STYLE_URL,
    REPLACEMENT_SOURCE_ID:            REPLACEMENT_SOURCE_ID,
    REPLACEMENT_LAYER_ID:             REPLACEMENT_LAYER_ID,
    init:                             init,
    activate:                         activateEditableBasemapAuthority,
    restore:                          restoreBroadcastBasemapAuthority,
    verify:                           verifyEditableBasemapAuthority,
    debug:                            debugEditableBasemapAuthority,
    detectStandardImports:            detectStandardImports,
    detectStandardBuildingLayers:     detectStandardBuildingLayers,
    // Spec function name aliases
    activateEditableBasemapAuthority:  activateEditableBasemapAuthority,
    restoreBroadcastBasemapAuthority:  restoreBroadcastBasemapAuthority,
    verifyEditableBasemapAuthority:    verifyEditableBasemapAuthority,
    debugEditableBasemapAuthority:     debugEditableBasemapAuthority,
  });

  // ── Top-level console shortcuts (always available from parse time) ───────────

  global.activateEditableBasemapAuthority  = activateEditableBasemapAuthority;
  global.restoreBroadcastBasemapAuthority  = restoreBroadcastBasemapAuthority;
  global.verifyEditableBasemapAuthority    = verifyEditableBasemapAuthority;
  global.debugEditableBasemapAuthority     = debugEditableBasemapAuthority;

  SBE.EditableBasemapAuthority.init();

  console.log('[EditableBasemapAuthority] v' + VERSION +
    ' loaded | call activateEditableBasemapAuthority() to enter editable mode' +
    ' | restoreBroadcastBasemapAuthority() to return to broadcast');

})(window);
