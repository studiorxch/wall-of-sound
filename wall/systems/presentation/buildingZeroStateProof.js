// ── BuildingZeroStateProof v1.0.0 ────────────────────────────────────────────
// 0612M_WOS_BuildingZeroStateProof_v1.0.0_BUILD
// Status: active | Classification: diagnostic-proof / building-visibility-authority-test
//
// Purpose:
//   Binary proof state: every non-WOS building layer visually removed from the
//   active map; only WOS replacement/preview objects remain. Hard baseline for
//   all future density / skyline / replacement builds.
//
//   This is a PROOF TOOL, not the long-term density authority.
//
// Behavior:
//   zeroState() — audit all style layers, classify, hide every building-like
//                 layer except wos-replacement-* / wos-preview-*, return report.
//   restore()   — restore every touched layer's original visibility.
//
// Known limitation (reported, not solved here):
//   Mapbox Standard imported model layers do not appear in map.getStyle().layers
//   and cannot be hidden per-layer (proven 0611–0612E). When a Standard import
//   is present the report flags standardImportPresent; run on the editable
//   dark-v11 substrate (EditableBasemapAuthority.activate()) for a clean proof.
//
// Authority:
//   READS:   map.getStyle().layers
//   WRITES:  layout visibility on non-WOS building layers (reversible)
//   MUST NOT: remove layers/sources, mutate registries, touch WOS replacement
//
// Placement: wall/systems/presentation/buildingZeroStateProof.js
// Load:      AFTER editableBasemapAuthority.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var REPLACEMENT_LAYER_ID = 'wos-replacement-layer';
  var FORBIDDEN_LAYER_ID   = 'wos-building-replacement-layer';
  var FORBIDDEN_SOURCE_ID  = 'wos-building-replacements';

  // ── State ─────────────────────────────────────────────────────────────────────

  var _active     = false;
  var _touched    = {};     // layerId → { originalVisibility }
  var _lastReport = null;

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── B1: layer classification ──────────────────────────────────────────────────

  // → 'wos-replacement' | 'wos-preview' | 'wos-host' | 'mapbox-fill-extrusion'
  //   | 'mapbox-model' | 'unknown-building-like' | 'non-building'
  function _classifyLayer(l) {
    var id = l.id || '';
    if (id === REPLACEMENT_LAYER_ID || id.indexOf('wos-replacement') === 0) return 'wos-replacement';
    if (id.indexOf('wos-preview') === 0)                                    return 'wos-preview';
    if (id.indexOf('wos-host') === 0 || id.indexOf('wos-fp-') === 0)        return 'wos-host';
    if (l.type === 'model')                                                 return 'mapbox-model';
    if (l.type === 'fill-extrusion')                                        return 'mapbox-fill-extrusion';
    var sl = (l['source-layer'] || '').toLowerCase();
    if (sl === 'building' || sl === 'buildings' ||
        id.toLowerCase().indexOf('building') !== -1)                        return 'unknown-building-like';
    return 'non-building';
  }

  function _isPreserved(classification) {
    return classification === 'wos-replacement' || classification === 'wos-preview';
  }

  function _isBuildingLike(classification) {
    return classification !== 'non-building';
  }

  // ── Rendered building feature count (visual evidence, not just config) ────────

  function _renderedBuildingCount(map, includeWos) {
    var total = 0;
    try {
      var layers = (map.getStyle().layers) || [];
      layers.forEach(function (l) {
        var c = _classifyLayer(l);
        if (!_isBuildingLike(c)) return;
        if (!includeWos && _isPreserved(c)) return;
        try { total += (map.queryRenderedFeatures({ layers: [l.id] }) || []).length; } catch (e) {}
      });
    } catch (e) {}
    return total;
  }

  // ── B2/B3: zero state ─────────────────────────────────────────────────────────

  function zeroState() {
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };

    var before = _renderedBuildingCount(map, false);

    var layers = [];
    try { layers = (map.getStyle().layers) || []; } catch (e) {}

    var entries = [];
    var hidden = 0, preserved = 0, modelCount = 0, fillExtCount = 0;

    layers.forEach(function (l) {
      var c = _classifyLayer(l);
      if (!_isBuildingLike(c)) return;

      if (l.type === 'model')          modelCount++;
      if (l.type === 'fill-extrusion') fillExtCount++;

      var entry = {
        id:             l.id,
        type:           l.type,
        source:         l.source || null,
        sourceLayer:    l['source-layer'] || null,
        classification: c,
        action:         null,
        success:        false,
        error:          null,
      };

      if (_isPreserved(c)) {
        entry.action  = 'preserved';
        entry.success = true;
        preserved++;
      } else {
        // Visibility:none is the safest universal hide for every layer type.
        var orig = null;
        try { orig = map.getLayoutProperty(l.id, 'visibility') || 'visible'; } catch (e) {}
        try {
          map.setLayoutProperty(l.id, 'visibility', 'none');
          if (!_touched[l.id]) _touched[l.id] = { originalVisibility: orig };
          entry.action  = 'visibility:none';
          entry.success = true;
          hidden++;
        } catch (e) {
          entry.action = 'visibility:none';
          entry.error  = String(e && e.message || e);
        }
      }
      entries.push(entry);
    });

    _active = true;

    // Standard import limitation flag (model layers live inside the import and
    // never appear in root layers — they cannot be hidden from here).
    var standardImportPresent = false;
    try {
      var imports = (map.getStyle().imports) || [];
      standardImportPresent = imports.some(function (i) {
        return i && i.url && i.url.indexOf('mapbox/standard') !== -1;
      });
    } catch (e) {}

    var wosPresent = false, dupPresent = false;
    try { wosPresent = !!map.getLayer(REPLACEMENT_LAYER_ID); } catch (e) {}
    try { dupPresent = !!map.getLayer(FORBIDDEN_LAYER_ID) || !!map.getSource(FORBIDDEN_SOURCE_ID); } catch (e) {}

    var report = {
      ok:                                  true,
      zeroStateActive:                     true,
      hiddenLayerCount:                    hidden,
      preservedWosLayerCount:              preserved,
      modelLayerCount:                     modelCount,
      fillExtrusionLayerCount:             fillExtCount,
      renderedBuildingFeatureCountBefore:  before,
      renderedBuildingFeatureCountAfter:   null,   // measured by report() after repaint
      wosReplacementLayerPresent:          wosPresent,
      duplicateReplacementLayersPresent:   dupPresent,
      standardImportPresent:               standardImportPresent,
      layers:                              entries,
    };
    if (standardImportPresent) {
      report.warning = 'STANDARD_IMPORT_PRESENT — imported model layers are not addressable; ' +
        'activate the editable basemap (activateEditableBasemapAuthority()) for a clean proof';
    }

    _lastReport = report;
    console.log('[BuildingZeroStateProof] zeroState | hidden:', hidden,
      '| preserved:', preserved, '| renderedBefore:', before,
      standardImportPresent ? '| WARNING: Standard import present' : '');
    return report;
  }

  // ── B6: restore ───────────────────────────────────────────────────────────────

  function restore() {
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };
    var restored = 0, errors = [];
    Object.keys(_touched).forEach(function (id) {
      try {
        map.setLayoutProperty(id, 'visibility', _touched[id].originalVisibility);
        restored++;
      } catch (e) { errors.push({ id: id, error: String(e && e.message || e) }); }
      delete _touched[id];
    });
    _active = false;
    console.log('[BuildingZeroStateProof] restore | restored:', restored,
      errors.length ? '| errors: ' + errors.length : '');
    return { ok: errors.length === 0, restoredLayerCount: restored, errors: errors };
  }

  // ── B4: report (measures after-count post-repaint) ────────────────────────────

  function report() {
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };
    var r = _lastReport ? JSON.parse(JSON.stringify(_lastReport)) : {
      ok: true, zeroStateActive: _active, layers: [],
    };
    r.zeroStateActive = _active;
    r.renderedBuildingFeatureCountAfter = _renderedBuildingCount(map, false);
    try { r.wosReplacementLayerPresent = !!map.getLayer(REPLACEMENT_LAYER_ID); } catch (e) {}
    try {
      r.duplicateReplacementLayersPresent =
        !!map.getLayer(FORBIDDEN_LAYER_ID) || !!map.getSource(FORBIDDEN_SOURCE_ID);
    } catch (e) {}
    console.log('[BuildingZeroStateProof] report | active:', r.zeroStateActive,
      '| renderedAfter:', r.renderedBuildingFeatureCountAfter);
    return r;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.BuildingZeroStateProof = Object.freeze({
    VERSION:   VERSION,
    zeroState: zeroState,
    restore:   restore,
    report:    report,
  });

  // ── Debug surface wiring (merges into _wos.debug.buildings) ─────────────────

  function _wireDebug() {
    global._wos                 = global._wos                 || {};
    global._wos.debug           = global._wos.debug           || {};
    global._wos.debug.buildings = global._wos.debug.buildings || {};
    global._wos.debug.buildings.zeroState        = zeroState;
    global._wos.debug.buildings.restoreBuildings = restore;
    global._wos.debug.buildings.zeroStateReport  = report;
  }
  _wireDebug();
  (function _rewireAfterBoot() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(_wireDebug);
    else setTimeout(_wireDebug, 3000);
  })();

  console.log('[BuildingZeroStateProof] v' + VERSION +
    ' loaded | _wos.debug.buildings.zeroState() | .restoreBuildings() | .zeroStateReport()');

})(window);
