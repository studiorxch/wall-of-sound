// ── TraversalContinuityDebug v1.0.0 ──────────────────────────────────────────
// 0528X_WOS_TraversalContinuityAuthority_v1.0.0 — debug companion
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.traversalContinuity with:
//   audit()                — full confidence + concealment report
//   snapshot()             — getDebugSnapshot() alias
//   enabled(bool)          — start / stop authority
//   autoGate(bool)         — enable speed gating
//   bias(mode)             — set exposure bias mode
//   budget(distanceM)      — set max reveal distance in metres
//   confidence()           — compact confidence line
//   veil()                 — compact current smoothed veil values
//   tileCoverage()         — predictive tile coverage ahead
//   extrusionCoverage()    — extrusion coverage ahead
//
// Placement: wall/systems/presentation/traversalContinuityDebug.js
// Load: AFTER traversalContinuityAuthority.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var VERSION = '1.0.0';

  function _tca() { return global.SBE && global.SBE.TraversalContinuityAuthority; }

  function _bar(scalar, len) {
    len = len || 20;
    var filled = Math.round(Math.max(0, Math.min(1, scalar)) * len);
    var bar = '';
    for (var i = 0; i < len; i++) bar += i < filled ? '█' : '░';
    return bar;
  }

  function _pct(v) { return (v * 100).toFixed(0) + '%'; }

  // ── audit() ───────────────────────────────────────────────────────────────────

  function audit() {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] TraversalContinuityAuthority not loaded'); return; }

    var s = t.getDebugSnapshot();

    console.group('[TraversalContinuityAuthority] audit()');

    console.log('── System ──────────────────────────────────────────');
    console.log('version         :', s.version);
    console.log('enabled         :', s.enabled);
    console.log('autoGate        :', s.autoGate);
    console.log('exposureBias    :', s.exposureBias);
    console.log('exposureBudget  :', s.exposureBudgetM + 'm');

    console.log('');
    console.log('── Camera ──────────────────────────────────────────');
    console.log('speed           :', s.cameraSpeed.toFixed(6), 'deg/sec');
    console.log('turnRate        :', s.cameraTurnRate + '°/sec');
    console.log('zoom            :', s.cameraZoom);
    console.log('pitch           :', s.cameraPitch + '°');
    console.log('altScalar       :', s.altitudeScalar);

    console.log('');
    console.log('── Confidence ──────────────────────────────────────');
    console.log('tile            : [' + _bar(s.tileConfidence) + '] ' + _pct(s.tileConfidence));
    console.log('vector          : [' + _bar(s.vectorConfidence) + '] ' + _pct(s.vectorConfidence));
    console.log('extrusion       : [' + _bar(s.extrusionConfidence) + '] ' + _pct(s.extrusionConfidence));
    var confIcon = s.exposureConfidence > 0.75 ? '🟢' : s.exposureConfidence > 0.40 ? '🟡' : '🔴';
    console.log('EXPOSURE        : [' + _bar(s.exposureConfidence) + '] ' + _pct(s.exposureConfidence), confIcon);

    console.log('');
    console.log('── Concealment (smoothed) ──────────────────────────');
    console.log('veilStrength    : [' + _bar(s.concealmentStrength) + '] ' + _pct(s.concealmentStrength));
    console.log('fogDensity      :', s.fogDensity.toFixed(3));
    console.log('horizonClamp    :', s.horizonClamp.toFixed(3));
    console.log('distantOpacity  :', s.revealBudget.toFixed(3));
    console.log('silhouetteBias  :', s.atmosphericBias.toFixed(3));
    console.log('contrastCompr   :', s.contrastCompression.toFixed(3));

    console.log('');
    console.log('── Target (converging toward) ──────────────────────');
    console.log('veilStrength    :', s.target.veilStrength.toFixed(3));
    console.log('fogDensity      :', s.target.fogDensity.toFixed(3));
    console.log('horizonDistance :', s.target.horizonDistance.toFixed(3));

    console.log('');
    console.log('Bias modes: harbor | inland | skyline | weather | storm | cinematic | surveillance | lowVisibility');
    console.log('  .bias("harbor")  .budget(600)  .autoGate(true)');

    console.groupEnd();
    return s;
  }

  // ── snapshot() ───────────────────────────────────────────────────────────────

  function snapshot() {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    return t.getDebugSnapshot();
  }

  // ── enabled(bool) ─────────────────────────────────────────────────────────────

  function enabled(val) {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    if (val === undefined) {
      console.log('[TCA Debug] enabled:', t.getEnabled());
      return t.getEnabled();
    }
    t.setEnabled(!!val);
    return !!val;
  }

  // ── autoGate(bool) ────────────────────────────────────────────────────────────

  function autoGate(val) {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    if (val === undefined) {
      console.log('[TCA Debug] autoGate:', t.getAutoGate());
      return t.getAutoGate();
    }
    t.setAutoGate(!!val);
    return !!val;
  }

  // ── bias(mode) ────────────────────────────────────────────────────────────────

  function bias(mode) {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    if (mode === undefined) {
      console.log('[TCA Debug] bias:', t.getExposureBias());
      console.log('  modes: harbor | inland | skyline | weather | storm | cinematic | surveillance | lowVisibility');
      return t.getExposureBias();
    }
    return t.setExposureBias(mode);
  }

  // ── budget(distanceM) ─────────────────────────────────────────────────────────

  function budget(distM) {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    if (distM === undefined) {
      console.log('[TCA Debug] exposureBudget:', t.getExposureBudget() + 'm');
      return t.getExposureBudget();
    }
    t.setExposureBudget(Number(distM));
  }

  // ── confidence() ──────────────────────────────────────────────────────────────

  function confidence() {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    var s = t.getDebugSnapshot();
    var icon = s.exposureConfidence > 0.75 ? '🟢' : s.exposureConfidence > 0.40 ? '🟡' : '🔴';
    console.log('[TCA Debug] confidence:',
      'tile', _pct(s.tileConfidence),
      '| vec', _pct(s.vectorConfidence),
      '| ext', _pct(s.extrusionConfidence),
      '| EXPOSURE', _pct(s.exposureConfidence), icon);
    return s.exposureConfidence;
  }

  // ── veil() ────────────────────────────────────────────────────────────────────

  function veil() {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    var s = t.getDebugSnapshot();
    console.log('[TCA Debug] veil:',
      'strength', _pct(s.concealmentStrength),
      '| fog', s.fogDensity.toFixed(3),
      '| horizon', s.horizonClamp.toFixed(3),
      '| distOpacity', s.revealBudget.toFixed(3),
      '| bias:', s.exposureBias);
    return s;
  }

  // ── tileCoverage() ────────────────────────────────────────────────────────────

  function tileCoverage() {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    var c = t.getTileCoverageAhead();
    console.log('[TCA Debug] tileCoverage: loaded', c.loaded, '| confidence', _pct(c.confidence));
    return c;
  }

  // ── extrusionCoverage() ───────────────────────────────────────────────────────

  function extrusionCoverage() {
    var t = _tca();
    if (!t) { console.warn('[TCA Debug] not loaded'); return; }
    var c = t.getExtrusionCoverageAhead();
    console.log('[TCA Debug] extrusionCoverage: layers', c.layersFound,
      '| ahead features', c.aheadFeatures,
      '| confidence', _pct(c.confidence));
    return c;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos.traversalContinuity = {
      audit:             audit,
      snapshot:          snapshot,
      enabled:           enabled,
      autoGate:          autoGate,
      bias:              bias,
      budget:            budget,
      confidence:        confidence,
      veil:              veil,
      tileCoverage:      tileCoverage,
      extrusionCoverage: extrusionCoverage,
    };
    console.log('[TraversalContinuityDebug] v' + VERSION + ' ready — _wos.traversalContinuity bound');
    console.log('  .enabled(true)  .bias("harbor")  .budget(600)  .autoGate(true)');
    console.log('  .audit()  .confidence()  .veil()  .snapshot()');
  }

  _bind();

  var _attempts = 0;
  var _timer = global.setInterval(function () {
    _attempts++;
    if (!global._wos || !global._wos.traversalContinuity) _bind();
    if (_attempts >= 20) global.clearInterval(_timer);
  }, 250);

})(window);
