// ── HarborGeometryRegistryDebug v1.0.0 ───────────────────────────────────────
// 0528E_WOS_HarborGeometryBakePipeline_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.harborGeometry with:
//   load()               — trigger sector load (or reload)
//   state()              — print current load state
//   layers()             — list all layers with feature counts
//   features(layerName)  — print features for a specific layer
//   near(lat, lng, radM) — features within radius
//   audit()              — full system report
//
// Placement: wall/systems/geography/harborGeometryRegistryDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _reg()  { return global.SBE && global.SBE.HarborGeometryRegistry; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── load() ────────────────────────────────────────────────────────────────────

  function load(sectorId) {
    var reg = _reg();
    if (!reg) { console.warn('[HarborGeometryDebug] HarborGeometryRegistry not loaded'); return; }
    var id = sectorId || 'nyc_harbor_sector_01';
    console.log('[HarborGeometryDebug] loading sector:', id);
    reg.loadSector(id);
  }

  // ── state() ───────────────────────────────────────────────────────────────────

  function state() {
    var reg = _reg();
    if (!reg) { console.warn('[HarborGeometryDebug] HarborGeometryRegistry not loaded'); return null; }

    var st = reg.getLoadState();
    console.group('[HarborGeometryDebug] state()');
    console.log('sectorId :', st.sectorId || 'none');
    console.log('loading  :', st.loading);
    console.log('loaded   :', st.loaded);
    console.log('error    :', st.error || 'none');
    if (Object.keys(st.layerCounts).length) {
      console.log('layers   :');
      for (var k in st.layerCounts) {
        console.log('  ' + _pad(k, 20) + st.layerCounts[k] + ' features');
      }
    }
    console.groupEnd();
    return st;
  }

  // ── layers() ──────────────────────────────────────────────────────────────────

  function layers() {
    var reg = _reg();
    if (!reg) { console.warn('[HarborGeometryDebug] HarborGeometryRegistry not loaded'); return; }
    if (!reg.isLoaded()) { console.warn('[HarborGeometryDebug] sector not yet loaded — call load() first'); return; }

    var manifest = reg.getManifest();
    var layerDefs = (manifest && manifest.layers) ? manifest.layers : {};

    console.group('[HarborGeometryDebug] layers()');
    console.log(_pad('LAYER', 22) + _pad('FILE', 35) + 'FEATURES');
    console.log('─'.repeat(68));
    for (var name in layerDefs) {
      var def      = layerDefs[name];
      var actual   = reg.getLayerFeatures(name).length;
      var status   = actual > 0 ? '✓' : '⚠';
      console.log(status + ' ' + _pad(name, 21) + _pad(def.file, 35) + actual);
    }
    console.log('');
    console.log('total:', reg.getAllFeatures().length, 'features');
    console.groupEnd();
  }

  // ── features(layerName) ───────────────────────────────────────────────────────

  function features(layerName) {
    var reg = _reg();
    if (!reg) { console.warn('[HarborGeometryDebug] HarborGeometryRegistry not loaded'); return []; }
    if (!reg.isLoaded()) { console.warn('[HarborGeometryDebug] sector not yet loaded'); return []; }

    if (!layerName) {
      console.log('[HarborGeometryDebug] usage: features("shoreline") — valid layers: shoreline | pier | ferry_slip | island | bridge_context | waterfront_block');
      return [];
    }

    var feats = reg.getLayerFeatures(layerName);
    console.group('[HarborGeometryDebug] features("' + layerName + '") — ' + feats.length + ' features');
    console.log(_pad('ID', 42) + _pad('LABEL', 35) + _pad('PRI', 5) + 'LOD');
    console.log('─'.repeat(90));
    for (var i = 0; i < feats.length; i++) {
      var p = feats[i].properties || {};
      console.log(
        _pad(p.id    || '—', 42) +
        _pad(p.label || '—', 35) +
        _pad(p.priority || '—', 5) +
        (p.lod || '—')
      );
    }
    console.groupEnd();
    return feats;
  }

  // ── near(lat, lng, radiusM) ───────────────────────────────────────────────────

  function near(lat, lng, radiusM) {
    var reg = _reg();
    if (!reg) { console.warn('[HarborGeometryDebug] HarborGeometryRegistry not loaded'); return []; }
    if (!reg.isLoaded()) { console.warn('[HarborGeometryDebug] sector not yet loaded'); return []; }

    radiusM = radiusM || 5000;
    var feats = reg.getFeaturesNear(lat, lng, radiusM);
    console.group('[HarborGeometryDebug] near(' + lat + ', ' + lng + ', ' + radiusM + 'm) — ' + feats.length + ' features');
    for (var i = 0; i < feats.length; i++) {
      var p = feats[i].properties || {};
      console.log('[' + p.layer + ']  ' + (p.id || '—') + '  ' + (p.label || ''));
    }
    console.groupEnd();
    return feats;
  }

  // ── audit() ──────────────────────────────────────────────────────────────────

  function audit() {
    var reg = _reg();

    console.group('[HarborGeometryDebug] audit()');

    console.log('── System ─────────────────────────────────────────');
    console.log('HarborGeometryRegistry :', !!reg);
    console.log('HarborSectorAuthority  :', !!(global.SBE && global.SBE.HarborSectorAuthority));
    console.log('HarborSectorState      :', !!(global.SBE && global.SBE.HarborSectorState));

    if (!reg) { console.groupEnd(); return; }

    var st = reg.getLoadState();
    console.log('');
    console.log('── Load State ─────────────────────────────────────');
    console.log('sectorId :', st.sectorId || 'none');
    console.log('loading  :', st.loading);
    console.log('loaded   :', st.loaded);
    console.log('error    :', st.error || 'none');
    console.log('total    :', reg.getAllFeatures().length, 'features');

    if (st.loaded) {
      console.log('');
      console.log('── Manifest ───────────────────────────────────────');
      var manifest = reg.getManifest();
      if (manifest) {
        console.log('sectorId    :', manifest.sectorId);
        console.log('version     :', manifest.version);
        console.log('generatedAt :', manifest.generatedAt);
        console.log('');
        console.log('── Layers ─────────────────────────────────────────');
        console.log(_pad('LAYER', 20) + _pad('FILE', 32) + _pad('MANIFEST', 10) + 'ACTUAL');
        console.log('─'.repeat(72));
        var layerDefs = manifest.layers || {};
        for (var name in layerDefs) {
          var def    = layerDefs[name];
          var actual = reg.getLayerFeatures(name).length;
          var ok     = actual > 0 ? '✓' : '⚠';
          console.log(ok + ' ' + _pad(name, 19) + _pad(def.file, 32) + _pad(def.featureCount, 10) + actual);
        }
      }
    }

    console.log('');
    console.log('── Debug Renderer ─────────────────────────────────');
    var flags = global.SBE && global.SBE.runtimeFlags;
    console.log('showHarborGeometryDebug :', flags ? !!flags.showHarborGeometryDebug : 'runtimeFlags not set');
    console.log('  Enable : SBE.runtimeFlags = SBE.runtimeFlags || {}; SBE.runtimeFlags.showHarborGeometryDebug = true;');

    console.groupEnd();
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.harborGeometry = {
      load:     load,
      state:    state,
      layers:   layers,
      features: features,
      near:     near,
      audit:    audit,
    };
    console.log('[HarborGeometryRegistryDebug] v' + VERSION + ' ready — _wos.debug.harborGeometry bound');
    console.log('  Commands: .load() · .state() · .layers() · .features("layer") · .near(lat,lng,radM) · .audit()');
  }

  _bind();

  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.harborGeometry) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
