// ── HarborGeometryRegistry v1.0.0 ────────────────────────────────────────────
// 0528E_WOS_HarborGeometryBakePipeline_v1.0.0
// Status: active
// Classification: geography-registry
//
// Purpose:
//   Loads the baked harbor sector GeoJSON layers from disk and caches them
//   for runtime query.  Renderers and systems read from this registry; nothing
//   here renders pixels.
//
//   Auto-loads nyc_harbor_sector_01 after DOM ready.
//
// Authority:
//   OWNS: loaded geometry cache, load state, feature query
//   READS: ./data/harbor/<sectorId>/sector_manifest.json + layer files
//   WRITES: SBE.HarborGeometryRegistry state (in-memory cache only)
//   MUST NOT MUTATE: AircraftRuntime, AISRuntime, maritime state, Mapbox style
//
// Placement: wall/systems/geography/harborGeometryRegistry.js
// Load: BEFORE renderers, BEFORE main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── State ─────────────────────────────────────────────────────────────────────

  var _loadState = {
    loading:      false,
    loaded:       false,
    error:        null,
    sectorId:     null,
    layerCounts:  {},
  };

  var _manifest  = null;
  var _cache     = {};    // { layerName: [feature, ...] }
  var _allFeatures = [];  // flat array of all features

  // ── Fetch helpers ─────────────────────────────────────────────────────────────

  function _fetchJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.responseType = 'json';
    xhr.onload = function () {
      if (xhr.status >= 200 && xhr.status < 300) {
        callback(null, xhr.response);
      } else {
        callback(new Error('HTTP ' + xhr.status + ' fetching ' + url), null);
      }
    };
    xhr.onerror = function () { callback(new Error('Network error fetching ' + url), null); };
    xhr.send();
  }

  // ── loadSector(sectorId) ──────────────────────────────────────────────────────
  // Loads manifest then all layer files.  Idempotent — re-calling reloads.

  function loadSector(sectorId) {
    if (!sectorId) { console.warn('[HarborGeometryRegistry] loadSector: sectorId required'); return; }

    _loadState.loading = true;
    _loadState.loaded  = false;
    _loadState.error   = null;
    _loadState.sectorId= sectorId;
    _cache             = {};
    _allFeatures       = [];
    _manifest          = null;

    var base = './data/harbor/' + sectorId + '/';
    var manifestUrl = base + 'sector_manifest.json';

    console.log('[HarborGeometryRegistry] loading sector:', sectorId);

    _fetchJSON(manifestUrl, function (err, manifest) {
      if (err) {
        _loadState.loading = false;
        _loadState.error   = err.message;
        console.error('[HarborGeometryRegistry] manifest load failed:', err.message);
        return;
      }

      _manifest = manifest;
      var layers = manifest.layers || {};
      var layerNames = Object.keys(layers);
      var pending   = layerNames.length;

      if (!pending) {
        _loadState.loading = false;
        _loadState.loaded  = true;
        console.log('[HarborGeometryRegistry] loaded (no layers in manifest)');
        return;
      }

      layerNames.forEach(function (layerName) {
        var layerMeta = layers[layerName];
        var layerUrl  = base + layerMeta.file;

        _fetchJSON(layerUrl, function (lerr, fc) {
          pending--;

          if (lerr) {
            console.warn('[HarborGeometryRegistry] layer load failed:', layerName, lerr.message);
            _cache[layerName]          = [];
            _loadState.layerCounts[layerName] = 0;
          } else {
            var features = (fc && fc.features) ? fc.features : [];
            _cache[layerName]               = features;
            _loadState.layerCounts[layerName] = features.length;
            _allFeatures = _allFeatures.concat(features);
            console.log('[HarborGeometryRegistry]  ✓ ' + layerName + ' (' + features.length + ' features)');
          }

          if (pending === 0) {
            _loadState.loading = false;
            _loadState.loaded  = true;
            var total = _allFeatures.length;
            console.log('[HarborGeometryRegistry] sector ready — ' + total + ' total features');
          }
        });
      });
    });
  }

  // ── Query API ─────────────────────────────────────────────────────────────────

  function getSectorId()    { return _loadState.sectorId; }
  function getManifest()    { return _manifest; }
  function isLoaded()       { return _loadState.loaded; }
  function getLoadState()   { return _loadState; }

  function getLayerFeatures(layerName) {
    return _cache[layerName] || [];
  }

  function getAllFeatures() {
    return _allFeatures;
  }

  // getFeaturesNear(lat, lng, radiusM) — haversine filter across all layers
  function getFeaturesNear(lat, lng, radiusM) {
    var R   = 6371000;
    var out = [];
    for (var i = 0; i < _allFeatures.length; i++) {
      var feat = _allFeatures[i];
      var geom = feat.geometry;
      if (!geom || !geom.coordinates) continue;

      // Find nearest coord in the feature
      var minD = Infinity;

      function scanCoord(c) {
        if (!c || !c.length) return;
        if (typeof c[0] === 'number') {
          var dLat = (lat - c[1]) * Math.PI / 180;
          var dLng = (lng - c[0]) * Math.PI / 180;
          var a    = Math.sin(dLat/2)*Math.sin(dLat/2) +
                     Math.cos(lat*Math.PI/180)*Math.cos(c[1]*Math.PI/180)*
                     Math.sin(dLng/2)*Math.sin(dLng/2);
          var d    = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          if (d < minD) minD = d;
        } else {
          for (var j = 0; j < c.length; j++) scanCoord(c[j]);
        }
      }

      scanCoord(geom.coordinates);
      if (minD <= radiusM) out.push({ feature: feat, distM: minD });
    }
    out.sort(function (a, b) { return a.distM - b.distM; });
    return out.map(function (r) { return r.feature; });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.HarborGeometryRegistry = Object.freeze({
    VERSION:          VERSION,
    loadSector:       loadSector,
    getSectorId:      getSectorId,
    getManifest:      getManifest,
    getLayerFeatures: getLayerFeatures,
    getAllFeatures:    getAllFeatures,
    getFeaturesNear:  getFeaturesNear,
    isLoaded:         isLoaded,
    getLoadState:     getLoadState,
  });

  // Auto-load — deferred until after first visible frame when possible.
  // WOSBootSequencer.defer() queues the load to fire 1200ms post-reveal,
  // so the XHR fetch does not compete with Mapbox tile fetches during boot.
  // Falls back to immediate DOMContentLoaded load if sequencer is absent.
  function _autoLoad() {
    loadSector('nyc_harbor_sector_01');
  }

  function _scheduleAutoLoad() {
    var bs = global.SBE && SBE.WOSBootSequencer;
    if (bs && typeof bs.defer === 'function') {
      bs.defer('harborGeometryRegistry.autoLoad', _autoLoad, 1200);
    } else {
      _autoLoad();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scheduleAutoLoad);
  } else {
    global.setTimeout(_scheduleAutoLoad, 0);
  }

  console.log('[HarborGeometryRegistry] v' + VERSION + ' loaded — auto-loading nyc_harbor_sector_01');

})(window);
