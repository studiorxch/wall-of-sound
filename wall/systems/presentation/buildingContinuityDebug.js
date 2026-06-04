// ── BuildingContinuityDebug v1.0.0 ───────────────────────────────────────────
// 0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.debug.buildingContinuity with:
//   audit()          — full state + risk report
//   enabled(bool)    — start / stop monitoring
//   autoGate(bool)   — enable conservative speed gating
//   veil(bool)       — enable atmospheric veil hints
//   fade(bool)       — enable extrusion fade-in policy (caution)
//   detectLayers()   — discover fill-extrusion layers in active style
//   prewarmAhead()   — immediate full ahead probe + readiness log
//   readiness()      — compact readiness snapshot
//
// Placement: wall/systems/presentation/buildingContinuityDebug.js
// Load: AFTER buildingContinuityRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  var VERSION = '1.0.0';

  function _bcr() { return global.SBE && global.SBE.BuildingContinuityRuntime; }

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  // ── audit() ───────────────────────────────────────────────────────────────────

  function audit() {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] BuildingContinuityRuntime not loaded'); return; }

    var s = r.getState();

    console.group('[BuildingContinuityDebug] audit()');

    console.log('── System ──────────────────────────────────────────');
    console.log('version          :', s.version);
    console.log('enabled          :', s.enabled);
    console.log('autoGate         :', s.autoGate);
    console.log('veilEnabled      :', s.veilEnabled);
    console.log('fadePolicyActive :', s.fadePolicyActive,
      s.fadePolicyActive ? '⚠ setPaintProperty active' : '(safe)');

    console.log('');
    console.log('── Map Readiness ────────────────────────────────────');
    console.log('mapReady         :', s.mapReady);
    console.log('styleReady       :', s.styleReady);
    console.log('tilesLoaded      :', s.tilesLoaded);

    var idleAgo = s.lastIdleMs ? Math.round((Date.now() - s.lastIdleMs) / 100) / 10 + 's ago' : 'never';
    console.log('lastIdle         :', idleAgo);

    console.log('zoom             :', s.cameraZoom);
    console.log('pitch            :', s.cameraPitch + '°');

    console.log('');
    console.log('── Building Layers ─────────────────────────────────');
    if (s.buildingLayerIds.length === 0) {
      console.log('(no fill-extrusion layers detected — run .detectLayers())');
    } else {
      s.buildingLayerIds.forEach(function (id) { console.log(' ', id); });
    }

    console.log('');
    console.log('── Probe Results ────────────────────────────────────');
    console.log('visibleFeatures  :', s.visibleFeatureCount);
    console.log('aheadFeatures    :', s.aheadFeatureCount);

    console.log('');
    console.log('── Risk ─────────────────────────────────────────────');
    var rBar  = _riskBar(s.popInRiskScalar);
    var rRBar = _riskBar(1 - s.readinessScalar);
    console.log('popInRisk        : [' + rBar  + '] ' + (s.popInRiskScalar * 100).toFixed(0) + '%');
    console.log('readiness        : [' + rRBar + '] ' + (s.readinessScalar * 100).toFixed(0) + '%');
    console.log('denseZone        :', s.denseZoneRiskScalar > 0 ? 'YES — dense building zone ahead' : 'clear');
    console.log('gatingRecommended:', s.gatingRecommended);
    console.log('veilRecommended  :', s.veilRecommended);

    console.log('');
    console.log('Quick commands:');
    console.log('  .detectLayers()  .prewarmAhead()  .readiness()');
    console.log('  .autoGate(true)  .veil(true)  .fade(true)');

    console.groupEnd();
    return s;
  }

  function _riskBar(scalar) {
    var filled = Math.round(Math.max(0, Math.min(1, scalar)) * 16);
    var bar = '';
    for (var i = 0; i < 16; i++) bar += i < filled ? '█' : '░';
    return bar;
  }

  // ── enabled(bool) ─────────────────────────────────────────────────────────────

  function enabled(val) {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] runtime not loaded'); return; }
    if (val === undefined) {
      console.log('[BuildingContinuityDebug] enabled:', r.getEnabled());
      return r.getEnabled();
    }
    r.setEnabled(!!val);
    return !!val;
  }

  // ── autoGate(bool) ────────────────────────────────────────────────────────────

  function autoGate(val) {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] runtime not loaded'); return; }
    if (val === undefined) {
      console.log('[BuildingContinuityDebug] autoGate:', r.getAutoGate());
      return r.getAutoGate();
    }
    r.setAutoGate(!!val);
    return !!val;
  }

  // ── veil(bool) ────────────────────────────────────────────────────────────────

  function veil(val) {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] runtime not loaded'); return; }
    if (val === undefined) {
      console.log('[BuildingContinuityDebug] veil:', r.getVeil());
      return r.getVeil();
    }
    r.setVeil(!!val);
    return !!val;
  }

  // ── fade(bool) ────────────────────────────────────────────────────────────────

  function fade(val) {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] runtime not loaded'); return; }
    if (val === undefined) {
      console.log('[BuildingContinuityDebug] fadePolicy:', r.getFadePolicy(),
        '— caution: mutates fill-extrusion-opacity on building layers');
      return r.getFadePolicy();
    }
    if (!!val) {
      console.warn('[BuildingContinuityDebug] fade(true) — enabling setPaintProperty on building layers.',
        'If map style fights back, call fade(false) immediately.');
    }
    r.setFadePolicy(!!val);
    return !!val;
  }

  // ── detectLayers() ────────────────────────────────────────────────────────────

  function detectLayers() {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] runtime not loaded'); return; }
    var layers = r.detectLayers();
    if (layers.length) {
      console.group('[BuildingContinuityDebug] detectLayers() — ' + layers.length + ' found');
      layers.forEach(function (l) {
        console.log(_pad(l.id, 32), 'source:', l.source || '—', '  src-layer:', l.sourceLayer || '—',
          '  minzoom:', l.minzoom);
      });
      console.groupEnd();
    }
    return layers;
  }

  // ── prewarmAhead() ────────────────────────────────────────────────────────────

  function prewarmAhead() {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] runtime not loaded'); return; }
    r.prewarmAhead();
  }

  // ── readiness() ───────────────────────────────────────────────────────────────

  function readiness() {
    var r = _bcr();
    if (!r) { console.warn('[BuildingContinuityDebug] runtime not loaded'); return; }
    var s = r.getState();

    var riskIcon = s.popInRiskScalar > 0.70 ? '🔴' : s.popInRiskScalar > 0.35 ? '🟡' : '🟢';
    console.log('[BuildingContinuityDebug] readiness:',
      'tiles', s.tilesLoaded ? '✓' : '✗',
      '| layers:', s.buildingLayerIds.length,
      '| visible:', s.visibleFeatureCount,
      '| ahead:', s.aheadFeatureCount,
      '| popInRisk:', (s.popInRiskScalar * 100).toFixed(0) + '%', riskIcon,
      '| readiness:', (s.readinessScalar * 100).toFixed(0) + '%');

    return s;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos.debug.buildingContinuity = {
      audit:        audit,
      enabled:      enabled,
      autoGate:     autoGate,
      veil:         veil,
      fade:         fade,
      detectLayers: detectLayers,
      prewarmAhead: prewarmAhead,
      readiness:    readiness,
    };
    console.log('[BuildingContinuityDebug] v' + VERSION + ' ready — _wos.debug.buildingContinuity bound');
    console.log('  .detectLayers()  .prewarmAhead()  .audit()  .readiness()');
    console.log('  .enabled(true)   .autoGate(true)  .veil(true)');
  }

  _bind();

  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.debug || !global._wos.debug.buildingContinuity) _bind();
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
