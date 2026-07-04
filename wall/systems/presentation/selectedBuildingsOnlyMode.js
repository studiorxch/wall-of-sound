// ── SelectedBuildingsOnlyMode v1.0.1 ─────────────────────────────────────────
// 0612D_WOS_SelectedBuildingsOnlyMode_v1.0.1_BUILD
// Status: obsolete-audit-artifact
// ReplacedBy: 0612E_WOS_NonStandardEditableBasemapAuthority
// DoNotLoad: true
// 0612G: Removed from wall/index.html. setConfigProperty cannot disable Mapbox
//        Standard 3D buildings (keys accepted, no visual change). Retained on
//        disk as an audit artifact only — must not execute during Wall boot.
//
// Purpose:
//   Disable Mapbox Standard 3D model buildings globally so that only WOS-owned
//   selected replacement buildings render as 3D objects.
//
//   This resolves the confirmed root cause:
//     Mapbox Standard 'model' layers cannot be suppressed per-feature.
//     fill-extrusion-height=0 has no effect on model type.
//
//   Solution:
//     Standard 3D buildings: OFF globally (setConfigProperty)
//     WOS replacement buildings: ON individually (wos-replacement-layer)
//
// Mechanism:
//   map.setConfigProperty('basemap', 'show3dBuildings', false)
//   Falls back to iterating all imports and trying all known config key variants.
//
// Authority:
//   READS:   MapboxViewportRuntime, BuildingReplacementRuntime status
//   WRITES:  Mapbox Standard basemap config (show3dBuildings)
//            SelectedBuildingsOnlyMode runtime state
//   MUST NOT: mutate per-feature Standard model geometry, replacement manifest,
//             building archetype data, camera, atmosphere, audio, overlay grammar
//
// Placement: wall/systems/presentation/selectedBuildingsOnlyMode.js
// Load: AFTER buildingReplacementRuntime.js, buildingEditProjectionRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.1';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var STANDARD_BASEMAP_CONFIG_ID       = 'basemap';
  var STANDARD_3D_BUILDINGS_CONFIG_KEY = 'showBuildingExtrusions';
  var REPLACEMENT_SOURCE_ID            = 'wos-replacement-markers';
  var REPLACEMENT_LAYER_ID             = 'wos-replacement-layer';

  // Additional config key variants to try as fallback — Mapbox Standard config
  // key names differ between published style versions.
  var BUILDING_CONFIG_KEYS = [
    'showBuildingExtrusions',
    'show3dBuildings',
    'show3dFacades',
    'showBuildings',
    'showBuildingModels',
    'show3dObjects',
    'show3dLandmarks',
    'showIndoor',
  ];

  // ── State ─────────────────────────────────────────────────────────────────────

  var _state = {
    enabled:                     false,
    standard3dBuildingsDisabled: false,
    replacementSourceExists:     false,
    replacementLayerExists:      false,
    activeReplacementCount:      0,
    lastAppliedAt:               null,
    lastError:                   null,
    // Internal diagnostics — not in spec data model but useful for debugging
    configAttempts:              [],   // which (importId, key) pairs were tried
    configSucceeded:             false,
    configPropertyAvailable:     false,
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Config property helpers ───────────────────────────────────────────────────

  // _resolveImportIds — returns ordered list of import IDs to try.
  // Always tries spec-prescribed 'basemap' first; then iterates all discovered imports.
  function _resolveImportIds(map) {
    var ids    = [STANDARD_BASEMAP_CONFIG_ID];
    var style  = null;
    try { style = map.getStyle(); } catch (e) {}
    var imports = (style && Array.isArray(style.imports)) ? style.imports : [];
    imports.forEach(function (imp) {
      if (imp.id && ids.indexOf(imp.id) === -1) ids.push(imp.id);
    });
    return ids;
  }

  // _setBuildings3d — attempts to set show3dBuildings (and variants) to the given
  // value on all detectable import IDs. Records every attempt for diagnostics.
  // Returns true if at least one setConfigProperty call did not throw.
  function _setBuildings3d(map, value) {
    _state.configAttempts     = [];
    _state.configPropertyAvailable = typeof map.setConfigProperty === 'function';

    if (!_state.configPropertyAvailable) {
      _state.lastError = 'setConfigProperty not available on this map instance';
      console.warn('[SelectedBuildingsOnlyMode] setConfigProperty not available');
      return false;
    }

    var importIds = _resolveImportIds(map);
    var anySucceeded = false;

    importIds.forEach(function (importId) {
      BUILDING_CONFIG_KEYS.forEach(function (configKey) {
        var attempt = { importId: importId, configKey: configKey, value: value, ok: false, error: null };
        try {
          map.setConfigProperty(importId, configKey, value);
          attempt.ok  = true;
          anySucceeded = true;
        } catch (e) {
          attempt.error = String(e && e.message || e);
        }
        _state.configAttempts.push(attempt);
      });
    });

    _state.configSucceeded = anySucceeded;
    return anySucceeded;
  }

  // ── State snapshot ────────────────────────────────────────────────────────────

  function _refreshStateFromMap(map) {
    _state.replacementSourceExists = !!(map && (function () {
      try { return !!map.getSource(REPLACEMENT_SOURCE_ID); } catch (e) { return false; }
    })());
    _state.replacementLayerExists  = !!(map && (function () {
      try { return !!map.getLayer(REPLACEMENT_LAYER_ID); } catch (e) { return false; }
    })());

    // Active replacement count — from BuildingReplacementRuntime if available.
    // Use internal status() but suppress its console.log by reading lastResult cache.
    try {
      var brt = SBE.BuildingReplacementRuntime;
      if (brt && typeof brt.status === 'function') {
        var s = brt.status();
        _state.activeReplacementCount = (s && typeof s.activeReplacements === 'number')
          ? s.activeReplacements : 0;
      }
    } catch (e) { _state.activeReplacementCount = 0; }
  }

  // ── Post-apply convergence chain ─────────────────────────────────────────────

  // _runConvergenceChain — reload replacement actors, repair layer dominance,
  // re-apply source suppression. Called after both enable and disable.
  function _runConvergenceChain() {
    try {
      var brt = SBE.BuildingReplacementRuntime;
      if (brt) {
        if (typeof brt.reload          === 'function') brt.reload();
        if (typeof brt.repairDominance === 'function') brt.repairDominance();
      }
    } catch (e) {
      console.warn('[SelectedBuildingsOnlyMode] reload/repairDominance error:', e.message || e);
    }
    try {
      var proj = SBE.BuildingEditProjectionRuntime;
      if (proj && typeof proj.apply === 'function') proj.apply();
    } catch (e) {
      console.warn('[SelectedBuildingsOnlyMode] projection apply error:', e.message || e);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // applySelectedBuildingsOnlyMode — internal apply step exposed as public
  // for programmatic use. Sets the config then runs the convergence chain.
  function applySelectedBuildingsOnlyMode() {
    var map = _getMap();
    if (!map) {
      _state.lastError = 'map_not_available';
      console.warn('[SelectedBuildingsOnlyMode] applySelectedBuildingsOnlyMode: map not available');
      return _snapshotState();
    }

    _state.lastError = null;

    var ok = _setBuildings3d(map, false);
    _state.standard3dBuildingsDisabled = ok;

    if (!ok) {
      _state.lastError = 'setConfigProperty calls all failed or threw — Standard 3D buildings may not be disabled';
      console.warn('[SelectedBuildingsOnlyMode] applySelectedBuildingsOnlyMode:', _state.lastError);
    } else {
      console.log('[SelectedBuildingsOnlyMode] Standard 3D buildings disabled via setConfigProperty');
    }

    _runConvergenceChain();
    _refreshStateFromMap(map);
    _state.lastAppliedAt = Date.now();

    return _snapshotState();
  }

  // enableSelectedBuildingsOnlyMode — activate selected-buildings-only mode.
  function enableSelectedBuildingsOnlyMode() {
    _state.enabled = true;
    console.log('[SelectedBuildingsOnlyMode] enabling selected-buildings-only mode');
    var result = applySelectedBuildingsOnlyMode();
    console.log('[SelectedBuildingsOnlyMode] enabled |',
      'standard3dBuildingsDisabled:', result.standard3dBuildingsDisabled,
      '| activeReplacementCount:', result.activeReplacementCount,
      '| replacementLayerExists:', result.replacementLayerExists);
    return result;
  }

  // restoreStandard3dBuildings — turn Standard 3D buildings back on globally.
  function restoreStandard3dBuildings() {
    var map = _getMap();
    if (!map) {
      _state.lastError = 'map_not_available';
      return _snapshotState();
    }

    _state.lastError = null;
    var ok = _setBuildings3d(map, true);
    _state.standard3dBuildingsDisabled = !ok;

    if (!ok) {
      _state.lastError = 'setConfigProperty restore calls all failed or threw';
      console.warn('[SelectedBuildingsOnlyMode] restoreStandard3dBuildings:', _state.lastError);
    } else {
      console.log('[SelectedBuildingsOnlyMode] Standard 3D buildings restored via setConfigProperty');
    }

    _runConvergenceChain();
    _refreshStateFromMap(map);
    _state.lastAppliedAt = Date.now();

    return _snapshotState();
  }

  // disableSelectedBuildingsOnlyMode — deactivate mode and restore Standard buildings.
  function disableSelectedBuildingsOnlyMode() {
    _state.enabled = false;
    console.log('[SelectedBuildingsOnlyMode] disabling selected-buildings-only mode — restoring Standard 3D buildings');
    var result = restoreStandard3dBuildings();
    console.log('[SelectedBuildingsOnlyMode] disabled | standard3dBuildingsDisabled:', result.standard3dBuildingsDisabled);
    return result;
  }

  // getSelectedBuildingsOnlyModeState — returns current state snapshot.
  function getSelectedBuildingsOnlyModeState() {
    var map = _getMap();
    if (map) _refreshStateFromMap(map);
    return _snapshotState();
  }

  // _snapshotState — clean copy of _state for external consumers.
  function _snapshotState() {
    return {
      version:                     VERSION,
      enabled:                     _state.enabled,
      standard3dBuildingsDisabled: _state.standard3dBuildingsDisabled,
      replacementSourceExists:     _state.replacementSourceExists,
      replacementLayerExists:      _state.replacementLayerExists,
      activeReplacementCount:      _state.activeReplacementCount,
      lastAppliedAt:               _state.lastAppliedAt,
      lastError:                   _state.lastError,
    };
  }

  // debugSelectedBuildingsOnlyMode — full diagnostic report including config attempt log.
  function debugSelectedBuildingsOnlyMode() {
    var map = _getMap();
    if (map) _refreshStateFromMap(map);

    var report = {
      version:                     VERSION,
      enabled:                     _state.enabled,
      standard3dBuildingsDisabled: _state.standard3dBuildingsDisabled,
      replacementSourceExists:     _state.replacementSourceExists,
      replacementLayerExists:      _state.replacementLayerExists,
      activeReplacementCount:      _state.activeReplacementCount,
      lastAppliedAt:               _state.lastAppliedAt,
      lastError:                   _state.lastError,
      configPropertyAvailable:     _state.configPropertyAvailable,
      configSucceeded:             _state.configSucceeded,
      configAttempts:              _state.configAttempts.slice(),
      // Enumerate what imports are visible to the host style
      detectedImports:             (function () {
        if (!map) return [];
        var style = null;
        try { style = map.getStyle(); } catch (e) {}
        var imports = (style && Array.isArray(style.imports)) ? style.imports : [];
        return imports.map(function (imp) {
          return { id: imp.id || null, url: imp.url || null };
        });
      })(),
    };

    console.log('[SelectedBuildingsOnlyMode] debugSelectedBuildingsOnlyMode:',
      JSON.stringify(report, null, 2));
    return report;
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function init() {
    // No auto-activation on init. Mode is explicitly enabled by caller.
    // Wire map listeners so the mode re-applies after style reloads if active.
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr) {
      console.warn('[SelectedBuildingsOnlyMode] MapboxViewportRuntime not available — retrying in 500ms');
      setTimeout(init, 500);
      return;
    }

    function _onStyleReady() {
      var m = _getMap();
      if (!m) return;
      // If mode was active before the style reload, re-apply automatically.
      if (_state.enabled) {
        console.log('[SelectedBuildingsOnlyMode] style reloaded — re-applying selected-buildings-only mode');
        applySelectedBuildingsOnlyMode();
      }
    }

    var map = mvr.getMap ? mvr.getMap() : null;
    if (map) {
      map.on('styledata', function () {
        var loaded = false;
        try { loaded = !!map.isStyleLoaded(); } catch (e) {}
        if (loaded) _onStyleReady();
      });
    }

    if (typeof mvr.onStyleLoad === 'function') {
      mvr.onStyleLoad(function () { _onStyleReady(); });
    }

    console.log('[SelectedBuildingsOnlyMode] v' + VERSION + ' initialized');
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.SelectedBuildingsOnlyMode = Object.freeze({
    VERSION:                             VERSION,
    STANDARD_BASEMAP_CONFIG_ID:          STANDARD_BASEMAP_CONFIG_ID,
    STANDARD_3D_BUILDINGS_CONFIG_KEY:    STANDARD_3D_BUILDINGS_CONFIG_KEY,
    REPLACEMENT_SOURCE_ID:               REPLACEMENT_SOURCE_ID,
    REPLACEMENT_LAYER_ID:                REPLACEMENT_LAYER_ID,
    init:                                init,
    enable:                              enableSelectedBuildingsOnlyMode,
    disable:                             disableSelectedBuildingsOnlyMode,
    apply:                               applySelectedBuildingsOnlyMode,
    restore:                             restoreStandard3dBuildings,
    state:                               getSelectedBuildingsOnlyModeState,
    debug:                               debugSelectedBuildingsOnlyMode,
    // Verbose aliases matching spec function names exactly
    enableSelectedBuildingsOnlyMode:     enableSelectedBuildingsOnlyMode,
    disableSelectedBuildingsOnlyMode:    disableSelectedBuildingsOnlyMode,
    applySelectedBuildingsOnlyMode:      applySelectedBuildingsOnlyMode,
    restoreStandard3dBuildings:          restoreStandard3dBuildings,
    getSelectedBuildingsOnlyModeState:   getSelectedBuildingsOnlyModeState,
    debugSelectedBuildingsOnlyMode:      debugSelectedBuildingsOnlyMode,
  });

  // ── Debug surface wiring ──────────────────────────────────────────────────────

  global._wos                 = global._wos         || {};
  global._wos.debug           = global._wos.debug   || {};
  global._wos.debug.buildings = global._wos.debug.buildings || {};

  global._wos.debug.buildings.enableSelectedBuildingsOnlyMode  = enableSelectedBuildingsOnlyMode;
  global._wos.debug.buildings.disableSelectedBuildingsOnlyMode = disableSelectedBuildingsOnlyMode;
  global._wos.debug.buildings.debugSelectedBuildingsOnlyMode   = debugSelectedBuildingsOnlyMode;

  // Top-level shortcuts for console use
  global.enableSelectedBuildingsOnlyMode  = enableSelectedBuildingsOnlyMode;
  global.disableSelectedBuildingsOnlyMode = disableSelectedBuildingsOnlyMode;
  global.debugSelectedBuildingsOnlyMode   = debugSelectedBuildingsOnlyMode;

  SBE.SelectedBuildingsOnlyMode.init();

  console.log('[SelectedBuildingsOnlyMode] v' + VERSION +
    ' loaded | call enableSelectedBuildingsOnlyMode() to activate' +
    ' | _wos.debug.buildings.enableSelectedBuildingsOnlyMode()' +
    ' | SBE.SelectedBuildingsOnlyMode.enable()');

})(window);
