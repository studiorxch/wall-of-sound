// ── CityDensityAuthority v1.0.0 ──────────────────────────────────────────────
// 0612K_WOS_AuthoredCityZoneDensityAuthority_v1.0.0_BUILD
// Status: active | Classification: runtime-authority / city-density-authority
//
// Purpose:
//   First WOS city-density authority layer. Inside authored zones WOS decides
//   which buildings exist; outside, the world stays plotted normally.
//
//   Inside WOS_ZONE_NYC:
//     KEEP     — height >= SKYLINE_HEIGHT_MIN, or in manual keep registry
//     REPLACE  — building has an active WOS replacement
//     SUPPRESS — everything else (filler clutter)
//
//   v1.0.0 strategy: height-filter WOS-owned / style fill-extrusion building
//   layers (setFilter). If a layer rejects filtering, fall back to opacity
//   reduction and report HEIGHT_FILTER_UNAVAILABLE.
//
// Authority:
//   READS:   MapboxViewportRuntime, BuildingReplacementRuntime status,
//            wall/data/wosBuildingKeepRegistry.json,
//            wall/data/wosBuildingSuppressRegistry.json
//   WRITES:  layer filters / opacity on non-WOS-replacement fill-extrusion
//            building layers (reversible; originals restored on disable)
//   MUST NOT: touch Mapbox Standard config/model suppression, replacement
//             manifest, actor archetypes, atmosphere, camera, audio
//
// Placement: wall/systems/presentation/cityDensityAuthority.js
// Load:      AFTER editableBasemapAuthority.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Authored zones ────────────────────────────────────────────────────────────

  var WOS_ZONE_NYC = {
    id:    'WOS_ZONE_NYC',
    label: 'New York City',
    bounds: { west: -74.30, south: 40.45, east: -73.65, north: 40.95 },
  };

  var ZONES = [WOS_ZONE_NYC];

  // ── Constants ─────────────────────────────────────────────────────────────────

  var SKYLINE_HEIGHT_MIN = 120;
  var FALLBACK_OPACITY   = 0.12;

  var REPLACEMENT_LAYER_ID  = 'wos-replacement-layer';
  var REPLACEMENT_SOURCE_ID = 'wos-replacement-markers';
  var FORBIDDEN_LAYER_ID    = 'wos-building-replacement-layer';
  var FORBIDDEN_SOURCE_ID   = 'wos-building-replacements';

  var KEEP_REGISTRY_URL     = './data/wosBuildingKeepRegistry.json';
  var SUPPRESS_REGISTRY_URL = './data/wosBuildingSuppressRegistry.json';

  // ── State ─────────────────────────────────────────────────────────────────────

  var _enabled      = false;
  var _fallbackMode = null;            // null | 'OPACITY_REDUCTION'
  var _lastError    = null;
  // layerId → { strategy: 'height-filter'|'opacity', originalFilter, originalOpacity }
  var _touched      = {};
  var _manualKeep     = {};            // buildingId → true
  var _manualSuppress = {};            // buildingId → true
  var _styleHooked  = false;

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Manual registries (B5) ────────────────────────────────────────────────────

  function _loadRegistry(url, target) {
    try {
      global.fetch(url).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (json) {
          if (!json || !Array.isArray(json.buildings)) return;
          json.buildings.forEach(function (id) { target[String(id)] = true; });
        })
        .catch(function () { /* registry optional in v1.0.0 */ });
    } catch (e) { /* fetch unavailable — registries stay empty */ }
  }

  // ── Zone detection ────────────────────────────────────────────────────────────

  function _zoneForLngLat(lng, lat) {
    for (var i = 0; i < ZONES.length; i++) {
      var b = ZONES[i].bounds;
      if (lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north) {
        return ZONES[i];
      }
    }
    return null;
  }

  function _activeZone() {
    var map = _getMap();
    if (!map) return null;
    try {
      var c = map.getCenter();
      return _zoneForLngLat(c.lng, c.lat);
    } catch (e) { return null; }
  }

  function getZoneClassification() {
    var zone = _activeZone();
    var result = {
      insideAuthoredZone: !!zone,
      activeZoneId:       zone ? zone.id : null,
      zoneLabel:          zone ? zone.label : null,
    };
    console.log('[CityDensityAuthority] getZoneClassification:', JSON.stringify(result));
    return result;
  }

  // ── Treatment classification ──────────────────────────────────────────────────

  // classifyBuilding(buildingKeyOrFeature) → 'KEEP' | 'REPLACE' | 'SUPPRESS' | null
  // Accepts a building key string, or a Mapbox feature ({id, properties.height}).
  function classifyBuilding(input) {
    var zone = _activeZone();
    if (!zone) return { treatment: null, reason: 'OUTSIDE_AUTHORED_ZONE' };

    var id = null, height = null;
    if (typeof input === 'string') {
      id = input;
    } else if (input && typeof input === 'object') {
      id = (input.id != null) ? String(input.id)
         : (input.properties && input.properties.id != null) ? String(input.properties.id) : null;
      height = (input.properties && typeof input.properties.height === 'number')
        ? input.properties.height
        : (typeof input.height === 'number' ? input.height : null);
    }

    // REPLACE — building has an active WOS replacement actor
    if (id) {
      try {
        var brt = SBE.BuildingReplacementRuntime;
        if (brt && typeof brt.list === 'function') {
          // list() returns an object keyed by buildingKey
          var actorKeys = Object.keys(brt.list() || {});
          for (var i = 0; i < actorKeys.length; i++) {
            var k = actorKeys[i];
            if (k === id || k.indexOf(id) !== -1) {
              return { treatment: 'REPLACE', reason: 'replacement_registry', buildingId: id };
            }
          }
        }
      } catch (e) {}
      if (_manualSuppress[id]) return { treatment: 'SUPPRESS', reason: 'manual_suppress_registry', buildingId: id };
      if (_manualKeep[id])     return { treatment: 'KEEP',     reason: 'manual_keep_registry',     buildingId: id };
    }

    // KEEP — skyline anchor by height
    if (typeof height === 'number' && height >= SKYLINE_HEIGHT_MIN) {
      return { treatment: 'KEEP', reason: 'skyline_height', height: height, buildingId: id };
    }

    // SUPPRESS — default inside an authored zone
    return { treatment: 'SUPPRESS', reason: 'zone_default_filler', height: height, buildingId: id };
  }

  // ── Density layer targeting ───────────────────────────────────────────────────

  // Candidate layers: every fill-extrusion building layer EXCEPT the canonical
  // WOS replacement layer. (model-type Standard layers are explicitly not
  // touched — that suppression path is closed.)
  function _candidateLayers(map) {
    var out = [];
    try {
      var layers = (map.getStyle().layers) || [];
      layers.forEach(function (l) {
        if (l.type !== 'fill-extrusion') return;
        if (l.id === REPLACEMENT_LAYER_ID) return;
        if (l.id.indexOf('wos-replacement') === 0 || l.id.indexOf('wos-preview') === 0) return;
        out.push(l);
      });
    } catch (e) {}
    return out;
  }

  // ── Apply / restore ───────────────────────────────────────────────────────────

  function _applyToLayer(map, layerDef) {
    var id = layerDef.id;
    if (_touched[id]) return;   // already treated

    var originalFilter  = null;
    var originalOpacity = null;
    try { originalFilter  = map.getFilter(id) || null; } catch (e) {}
    try { originalOpacity = map.getPaintProperty(id, 'fill-extrusion-opacity'); } catch (e) {}

    // B3: skyline anchors — height filter keeps tall buildings, drops filler.
    var heightFilter = ['>=', ['coalesce', ['get', 'height'], 0], SKYLINE_HEIGHT_MIN];
    var combined = originalFilter ? ['all', originalFilter, heightFilter] : heightFilter;

    try {
      map.setFilter(id, combined);
      _touched[id] = { strategy: 'height-filter', originalFilter: originalFilter, originalOpacity: originalOpacity };
      return;
    } catch (e) {
      // Layer rejects expression filters — fall back to opacity reduction.
    }

    try {
      map.setPaintProperty(id, 'fill-extrusion-opacity', FALLBACK_OPACITY);
      _touched[id] = { strategy: 'opacity', originalFilter: originalFilter, originalOpacity: originalOpacity };
      _fallbackMode = 'OPACITY_REDUCTION';
      console.warn('[CityDensityAuthority] HEIGHT_FILTER_UNAVAILABLE on "' + id +
        '" — using opacity reduction fallback');
    } catch (e2) {
      _lastError = 'layer "' + id + '" rejected both filter and opacity: ' + (e2.message || e2);
      console.warn('[CityDensityAuthority]', _lastError);
    }
  }

  function _restoreLayer(map, id) {
    var t = _touched[id];
    if (!t) return;
    try {
      if (t.strategy === 'height-filter') map.setFilter(id, t.originalFilter);
      else if (t.strategy === 'opacity') {
        map.setPaintProperty(id, 'fill-extrusion-opacity',
          (t.originalOpacity == null) ? 1 : t.originalOpacity);
      }
    } catch (e) {}
    delete _touched[id];
  }

  function _applyDensityTreatment() {
    var map = _getMap();
    if (!map) { _lastError = 'map_not_available'; return false; }

    var zone = _activeZone();
    if (!zone) {
      // B1 — outside authored zones: do nothing (and undo anything we did).
      _restoreAll();
      return true;
    }

    _candidateLayers(map).forEach(function (l) { _applyToLayer(map, l); });
    return true;
  }

  function _restoreAll() {
    var map = _getMap();
    if (!map) return;
    Object.keys(_touched).forEach(function (id) { _restoreLayer(map, id); });
  }

  // ── Style / move hooks ────────────────────────────────────────────────────────

  function _hookMapEvents() {
    if (_styleHooked) return;
    var map = _getMap();
    if (!map) return;
    _styleHooked = true;
    // Style switches wipe filters/paint — re-apply when enabled.
    map.on('style.load', function () {
      _touched = {};   // old style's layers are gone; nothing to restore
      if (_enabled) setTimeout(_applyDensityTreatment, 400);
    });
    // Re-evaluate zone on camera moves (enter/leave NYC).
    map.on('moveend', function () {
      if (_enabled) _applyDensityTreatment();
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function enable() {
    _enabled   = true;
    _lastError = null;
    _hookMapEvents();
    _applyDensityTreatment();
    var r = report();
    console.log('[CityDensityAuthority] enabled | zone:',
      r.activeZoneId || '(none — outside authored zones)');
    return r;
  }

  function disable() {
    _enabled = false;
    _restoreAll();
    _fallbackMode = null;
    var r = report();
    console.log('[CityDensityAuthority] disabled — original layer state restored');
    return r;
  }

  function getDensityReport() { return report(); }

  function report() {
    var map  = _getMap();
    var zone = _activeZone();

    var kept = 0, suppressed = 0;
    if (map && zone) {
      // Count viewport building features by treatment on the touched layers'
      // sources. Rendered features only — an estimate, not a full-city census.
      Object.keys(_touched).forEach(function (id) {
        try {
          var feats = map.queryRenderedFeatures({ layers: [id] }) || [];
          feats.forEach(function (f) {
            var h = (f.properties && typeof f.properties.height === 'number') ? f.properties.height : 0;
            if (h >= SKYLINE_HEIGHT_MIN) kept++;
          });
        } catch (e) {}
        // Suppressed = source features below threshold (no longer rendered when
        // height-filtered, so query the source directly).
        try {
          var lDef = map.getLayer(id);
          var src  = lDef && lDef.source;
          var sl   = lDef && lDef.sourceLayer;
          if (src) {
            var sFeats = map.querySourceFeatures(src, sl ? { sourceLayer: sl } : undefined) || [];
            sFeats.forEach(function (f) {
              var h = (f.properties && typeof f.properties.height === 'number') ? f.properties.height : 0;
              if (h < SKYLINE_HEIGHT_MIN) suppressed++;
            });
          }
        } catch (e) {}
      });
    }

    var replacementCount = 0;
    try {
      var brt = SBE.BuildingReplacementRuntime;
      if (brt && typeof brt.status === 'function') {
        replacementCount = brt.status().activeReplacements || 0;
      }
    } catch (e) {}

    var canonicalPresent = false, duplicatePresent = false;
    if (map) {
      try { canonicalPresent = !!map.getLayer(REPLACEMENT_LAYER_ID); } catch (e) {}
      try {
        duplicatePresent = !!map.getLayer(FORBIDDEN_LAYER_ID) || !!map.getSource(FORBIDDEN_SOURCE_ID);
      } catch (e) {}
    }

    return {
      enabled:                          _enabled,
      activeZoneId:                     zone ? zone.id : null,
      insideAuthoredZone:               !!zone,
      skylineHeightMin:                 SKYLINE_HEIGHT_MIN,
      keptCount:                        kept,
      suppressedCount:                  suppressed,
      replacementCount:                 replacementCount,
      fallbackMode:                     _fallbackMode,
      layersTouched:                    Object.keys(_touched).map(function (id) {
        return { id: id, strategy: _touched[id].strategy };
      }),
      canonicalReplacementLayerPresent: canonicalPresent,
      duplicateReplacementLayersPresent: duplicatePresent,
      lastError:                        _lastError,
    };
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.CityDensityAuthority = Object.freeze({
    VERSION:               VERSION,
    WOS_ZONE_NYC:          WOS_ZONE_NYC,
    SKYLINE_HEIGHT_MIN:    SKYLINE_HEIGHT_MIN,
    enable:                enable,
    disable:               disable,
    report:                report,
    classifyBuilding:      classifyBuilding,
    getZoneClassification: getZoneClassification,
    getDensityReport:      getDensityReport,
  });

  // ── Debug surface wiring ──────────────────────────────────────────────────────
  // main.js's onReady callback replaces _wos.debug after boot — register both at
  // parse time (for early console use) and after the map is ready (survives wipe).

  function _wireDebug() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.cityDensity = {
      enable:                enable,
      disable:               disable,
      getZoneClassification: getZoneClassification,
      getDensityReport:      getDensityReport,
      classifyBuilding:      classifyBuilding,
      report:                report,
    };
  }

  _wireDebug();
  (function _rewireAfterBoot() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(_wireDebug);
    else setTimeout(_wireDebug, 3000);
  })();

  // Load manual registries (allowed empty in v1.0.0)
  _loadRegistry(KEEP_REGISTRY_URL,     _manualKeep);
  _loadRegistry(SUPPRESS_REGISTRY_URL, _manualSuppress);

  console.log('[CityDensityAuthority] v' + VERSION +
    ' loaded | zones: ' + ZONES.map(function (z) { return z.id; }).join(', ') +
    ' | _wos.debug.cityDensity.enable() to activate');

})(window);
