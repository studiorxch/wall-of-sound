// ── HarborGeometryRuntimeDebug v1.0.0 ────────────────────────────────────────
// 0528G_WOS_HarborGeometryRuntimeRenderer_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.harborGeometryRuntime with:
//   enabled(bool)    — toggle renderer on/off
//   opacity(value)   — set global opacity 0–1
//   preset(id)       — switch style preset
//   state()          — print current renderer state
//   layers()         — list visible layers + feature counts
//   focus()          — print sector focus score
//   lod()            — print active LOD
//   audit()          — full system report
//
// Placement: wall/systems/presentation/harborGeometryRuntimeDebug.js
// Load: AFTER main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _rend()  { return global.SBE && global.SBE.HarborGeometryRuntimeRenderer; }
  function _style() { return global.SBE && global.SBE.HarborGeometryRuntimeStyle; }
  function _reg()   { return global.SBE && global.SBE.HarborGeometryRegistry; }
  function _hsa()   { return global.SBE && global.SBE.HarborSectorAuthority; }
  function _mvr()   { return global.SBE && global.SBE.MapboxViewportRuntime; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── enabled(bool) ─────────────────────────────────────────────────────────────

  function enabled(val) {
    var r = _rend();
    if (!r) { console.warn('[HarborGeometryRuntimeDebug] renderer not loaded'); return; }
    if (val === undefined) {
      console.log('[HarborGeometryRuntimeDebug] enabled:', r.isEnabled());
      return r.isEnabled();
    }
    r.setEnabled(val);
    console.log('[HarborGeometryRuntimeDebug] enabled →', r.isEnabled());
    return r.isEnabled();
  }

  // ── opacity(value) ────────────────────────────────────────────────────────────

  function opacity(val) {
    var r = _rend();
    if (!r) { console.warn('[HarborGeometryRuntimeDebug] renderer not loaded'); return; }
    if (val === undefined) {
      console.log('[HarborGeometryRuntimeDebug] opacity:', r.getOpacity());
      return r.getOpacity();
    }
    r.setOpacity(val);
    console.log('[HarborGeometryRuntimeDebug] opacity →', r.getOpacity());
    return r.getOpacity();
  }

  // ── preset(id) ───────────────────────────────────────────────────────────────

  function preset(id) {
    var s = _style();
    if (!s) { console.warn('[HarborGeometryRuntimeDebug] style module not loaded'); return; }
    if (id === undefined) {
      var st = s.getStyleState();
      console.log('[HarborGeometryRuntimeDebug] preset:', st.preset,
        '— available:', st.presetKeys.join(', '));
      return st.preset;
    }
    var ok = s.setPreset(id);
    if (ok) {
      console.log('[HarborGeometryRuntimeDebug] preset →', id);
    }
    return ok ? id : null;
  }

  // ── state() ───────────────────────────────────────────────────────────────────

  function state() {
    var r = _rend();
    if (!r) { console.warn('[HarborGeometryRuntimeDebug] renderer not loaded'); return null; }
    var st = r.getState();
    console.group('[HarborGeometryRuntimeDebug] state()');
    console.log('enabled         :', st.enabled);
    console.log('opacity         :', st.opacity);
    console.log('preset          :', st.preset);
    console.log('sectorFocus     :', st.sectorFocus !== undefined ? st.sectorFocus.toFixed(3) : 'n/a');
    console.log('activeLOD       :', st.activeLOD || 'none');
    console.log('drawnFeatures   :', st.drawnFeatureCount);
    console.log('skippedFeatures :', st.skippedFeatureCount);
    console.log('visibleLayers   :', st.visibleLayers.join(', ') || 'none');
    console.log('lastRenderMs    :', st.lastRenderMs);
    console.groupEnd();
    return st;
  }

  // ── layers() ─────────────────────────────────────────────────────────────────

  function layers() {
    var r   = _rend();
    var reg = _reg();
    var s   = _style();
    if (!r || !reg || !s) {
      console.warn('[HarborGeometryRuntimeDebug] missing dependency');
      return;
    }

    var st    = r.getState();
    var lod   = st.activeLOD || 'low_climb';
    var band  = (global.SBE && global.SBE.AltitudeWorldState && global.SBE.AltitudeWorldState.band) || 'ground';

    var layerOrder = [
      'waterfront_block', 'island', 'harbor_channel',
      'ferry_slip', 'pier', 'shoreline', 'bridge_context', 'hero_landmark',
    ];

    console.group('[HarborGeometryRuntimeDebug] layers()');
    console.log(_pad('LAYER', 20) + _pad('FEATURES', 10) + _pad('LOD_OP', 10) + 'VISIBLE');
    console.log('─'.repeat(55));

    for (var i = 0; i < layerOrder.length; i++) {
      var lname  = layerOrder[i];
      var feats  = reg.getLayerFeatures(lname).length;
      var lodOp  = s.getLayerOpacity(lname, lod, band);
      var final  = lodOp * r.getOpacity();
      var vis    = final >= 0.01 ? '✓' : '—';
      console.log(
        _pad(lname, 20) +
        _pad(feats, 10) +
        _pad(final.toFixed(3), 10) +
        vis
      );
    }

    console.log('');
    console.log('LOD :', lod, ' | band :', band, ' | focus :', st.sectorFocus !== undefined ? st.sectorFocus.toFixed(3) : 'n/a');
    console.groupEnd();
  }

  // ── focus() ───────────────────────────────────────────────────────────────────

  function focus() {
    var hsa = _hsa();
    var mvr = _mvr();
    if (!hsa) { console.warn('[HarborGeometryRuntimeDebug] HarborSectorAuthority not loaded'); return null; }
    var camera = mvr && mvr.getCamera ? mvr.getCamera() : { zoom: 12 };
    var score  = hsa.resolveSectorFocusScore ? hsa.resolveSectorFocusScore(camera) : 0;
    console.log('[HarborGeometryRuntimeDebug] sectorFocus:', score.toFixed(4),
      score >= 0.12 ? '(above threshold — renderer active)' : '(below threshold — renderer suppressed)');
    return score;
  }

  // ── lod() ─────────────────────────────────────────────────────────────────────

  function lod() {
    var hsa = _hsa();
    var mvr = _mvr();
    if (!hsa) { console.warn('[HarborGeometryRuntimeDebug] HarborSectorAuthority not loaded'); return null; }
    var camera  = mvr && mvr.getCamera ? mvr.getCamera() : { zoom: 12 };
    var aws     = (global.SBE && global.SBE.AltitudeWorldState) || null;
    var lodVal  = hsa.resolveSectorLOD ? hsa.resolveSectorLOD(camera, aws) : 'unknown';
    var band    = (aws && aws.band) || 'ground';
    var zoom    = (camera && camera.zoom) || 0;
    console.log('[HarborGeometryRuntimeDebug] lod:', lodVal, ' zoom:', zoom.toFixed(2), ' band:', band);
    return lodVal;
  }

  // ── audit() ──────────────────────────────────────────────────────────────────

  function audit() {
    var r   = _rend();
    var s   = _style();
    var reg = _reg();
    var hsa = _hsa();

    console.group('[HarborGeometryRuntimeDebug] audit()');

    console.log('── System ─────────────────────────────────────────');
    console.log('HarborGeometryRuntimeRenderer :', !!r);
    console.log('HarborGeometryRuntimeStyle    :', !!s);
    console.log('HarborGeometryRegistry        :', !!reg);
    console.log('HarborSectorAuthority         :', !!hsa);
    console.log('AltitudeWorldState            :', !!(global.SBE && global.SBE.AltitudeWorldState));
    console.log('MapboxViewportRuntime         :', !!(global.SBE && global.SBE.MapboxViewportRuntime));

    if (r) {
      var st = r.getState();
      console.log('');
      console.log('── Renderer State ─────────────────────────────────');
      console.log('enabled         :', st.enabled);
      console.log('opacity         :', st.opacity);
      console.log('preset          :', st.preset);
      console.log('sectorFocus     :', st.sectorFocus !== undefined ? st.sectorFocus.toFixed(3) : 'n/a');
      console.log('activeLOD       :', st.activeLOD || 'none');
      console.log('drawnFeatures   :', st.drawnFeatureCount);
      console.log('skippedFeatures :', st.skippedFeatureCount);
      console.log('visibleLayers   :', st.visibleLayers.join(', ') || 'none');
      console.log('lastRenderMs    :', st.lastRenderMs);
    }

    if (s) {
      var ss = s.getStyleState();
      console.log('');
      console.log('── Style ──────────────────────────────────────────');
      console.log('currentPreset   :', ss.preset);
      console.log('available       :', ss.presetKeys.join(', '));
    }

    if (reg && reg.isLoaded()) {
      console.log('');
      console.log('── Geometry Registry ──────────────────────────────');
      var layerOrder = [
        'waterfront_block', 'island', 'harbor_channel',
        'ferry_slip', 'pier', 'shoreline', 'bridge_context', 'hero_landmark',
      ];
      var total = 0;
      for (var i = 0; i < layerOrder.length; i++) {
        var lname = layerOrder[i];
        var cnt   = reg.getLayerFeatures(lname).length;
        total += cnt;
        console.log('  ' + _pad(lname, 22) + cnt + ' features');
      }
      console.log('  total:', total, 'features');
    } else if (reg) {
      console.log('');
      console.log('Registry: not yet loaded');
    }

    console.log('');
    console.log('── Usage ──────────────────────────────────────────');
    console.log('  enabled(true)           — activate renderer');
    console.log('  preset("cinematic")     — switch style preset');
    console.log('  opacity(0.85)           — set global opacity');
    console.log('  layers()                — layer visibility table');
    console.log('  focus()                 — sector focus score');
    console.log('  lod()                   — active LOD');

    console.groupEnd();
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.harborGeometryRuntime = {
      enabled: enabled,
      opacity: opacity,
      preset:  preset,
      state:   state,
      layers:  layers,
      focus:   focus,
      lod:     lod,
      audit:   audit,
    };
    console.log('[HarborGeometryRuntimeDebug] v' + VERSION + ' ready — _wos.debug.harborGeometryRuntime bound');
    console.log('  Commands: .enabled(bool) · .opacity(val) · .preset(id) · .state() · .layers() · .focus() · .lod() · .audit()');
  }

  _bind();

  // Retry-safe rebind: main.js overwrites window._wos on boot
  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.harborGeometryRuntime) {
      _bind();
    }
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
