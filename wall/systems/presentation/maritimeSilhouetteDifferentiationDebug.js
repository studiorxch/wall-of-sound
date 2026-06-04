// ── MaritimeSilhouetteDifferentiationDebug v1.0.2 ────────────────────────────
// 0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.2
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.silhouetteDifferentiation with:
//   inspect("cargo")         — base profile for vessel class
//   preview("ferry")         — formatted field summary
//   compare("cargo", "tug")  — side-by-side profile delta
//   matrix()                 — 2D grid: classes × distance bands
//   constants()              — all system constants
//
// Debug tooling is observational only.
// It must not mutate live presentation envelopes during runtime execution.
//
// Placement: wall/systems/presentation/maritimeSilhouetteDifferentiationDebug.js
// Load: AFTER main.js (additive _wos init)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var _msd = global.SBE && global.SBE.MaritimeSilhouetteDifferentiation;

  if (!_msd) {
    console.warn('[MaritimeSilhouetteDifferentiationDebug] SBE.MaritimeSilhouetteDifferentiation not found — ' +
      'ensure maritimeSilhouetteDifferentiation.js is loaded first.');
    global._wos.silhouetteDifferentiation = { _error: 'runtime not loaded' };
    return;
  }

  var C = _msd.getSilhouetteConstants();

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }
  function _lpad(s, w) {
    s = String(s);
    while (s.length < w) s = ' ' + s;
    return s;
  }
  function _f(v, d) { return Number(v).toFixed(d !== undefined ? d : 3); }

  var _PROFILE_FIELDS = [
    'silhouetteClass', 'hullAspectBias', 'atmosphericMassBias',
    'wakeReadabilityScale', 'headingStabilityBias', 'turnSoftnessDeg',
    'farLightSpacing', 'lightClusterVariance', 'bloomSoftness',
  ];

  var _BANDS       = C.DISTANCE_BANDS;
  var _VIS_CLASSES = C.VISIBILITY_CLASSES;
  var _CLASSES     = C.CLASS_KEYS;

  function _fakeInput(classKey, band, vis) {
    return {
      vesselId:          'debug_' + classKey,
      vesselClass:       classKey,
      vesselState:       null,
      speedKts:          10,
      headingDeg:        90,
      distanceBand:      band      || 'NEAR',
      visibilityClass:   vis       || 'FULL',
      isValidationEntity:false,
    };
  }

  // ── inspect(vesselClass) ──────────────────────────────────────────────────────
  // Returns and logs the base profile (NEAR band, FULL visibility).

  function inspect(vesselClass) {
    var p = _msd.resolveSilhouetteProfile(_fakeInput(vesselClass, 'NEAR', 'FULL'));
    console.group('[SilhouetteDifferentiation] inspect(' + (vesselClass || 'unknown') + ')');
    for (var i = 0; i < _PROFILE_FIELDS.length; i++) {
      var k = _PROFILE_FIELDS[i];
      var v = p[k];
      console.log(_pad(k, 22) + ':', typeof v === 'number' ? _f(v) : v);
    }
    console.groupEnd();
    return p;
  }

  // ── preview(vesselClass) ──────────────────────────────────────────────────────
  // Formatted summary across all distance bands.

  function preview(vesselClass) {
    var vc = (vesselClass || 'unknown').toLowerCase();

    // Bar chart of hull aspect bias per band
    function _bar(v, max) {
      var w = Math.round((v / max) * 20);
      var s = '';
      for (var i = 0; i < w; i++) s += '█';
      for (var j = w; j < 20; j++) s += '░';
      return s;
    }

    console.group('[SilhouetteDifferentiation] preview(' + vc + ')');
    var header = _pad('BAND', 14) + _pad('hullAsp', 9) + _pad('atmMass', 9) +
                 _pad('wakeRd', 9) + _pad('farLgt', 9) + 'hullAsp chart';
    console.log(header);
    console.log('─'.repeat(72));
    for (var bi = 0; bi < _BANDS.length; bi++) {
      var p = _msd.resolveSilhouetteProfile(_fakeInput(vc, _BANDS[bi], 'FULL'));
      console.log(
        _pad(_BANDS[bi], 14) +
        _lpad(_f(p.hullAspectBias, 2), 7) + '  ' +
        _lpad(_f(p.atmosphericMassBias, 2), 7) + '  ' +
        _lpad(_f(p.wakeReadabilityScale, 2), 7) + '  ' +
        _lpad(_f(p.farLightSpacing, 2), 7) + '  ' +
        _bar(p.hullAspectBias, C.MAX_ASPECT_BIAS)
      );
    }
    console.groupEnd();
    return _msd.resolveSilhouetteProfile(_fakeInput(vc, 'NEAR', 'FULL'));
  }

  // ── compare(classA, classB) ───────────────────────────────────────────────────

  function compare(classA, classB) {
    var ka = (classA || 'unknown');
    var kb = (classB || 'unknown');
    var a  = _msd.resolveSilhouetteProfile(_fakeInput(ka, 'NEAR', 'FULL'));
    var b  = _msd.resolveSilhouetteProfile(_fakeInput(kb, 'NEAR', 'FULL'));

    console.group('[SilhouetteDifferentiation] compare(' + ka + ' vs ' + kb + ')');
    console.log(_pad('FIELD', 24) + _pad(ka.toUpperCase(), 16) + kb.toUpperCase());
    console.log('─'.repeat(66));
    for (var i = 0; i < _PROFILE_FIELDS.length; i++) {
      var k  = _PROFILE_FIELDS[i];
      var va = a[k];
      var vb = b[k];
      var sa = typeof va === 'number' ? _f(va, 3) : String(va);
      var sb = typeof vb === 'number' ? _f(vb, 3) : String(vb);
      var diff = (typeof va === 'number' && typeof vb === 'number' && Math.abs(va - vb) > 0.001) ? ' ◀' : '';
      console.log(_pad(k, 24) + _pad(sa, 16) + sb + diff);
    }
    console.groupEnd();
    return { a: a, b: b };
  }

  // ── matrix() — §24 ───────────────────────────────────────────────────────────
  // Returns Array<{ classKey, distanceBand, visibilityClass, hullAspectBias,
  //   atmosphericMassBias, wakeReadabilityScale, farLightSpacing }>
  // Axes: rows = canonical vessel classes, columns = distance bands

  function matrix() {
    var result = [];

    // Header
    var header = _pad('CLASS', 14);
    for (var bi = 0; bi < _BANDS.length; bi++) {
      header += _pad(_BANDS[bi].substring(0, 5), 14);
    }
    console.group('[SilhouetteDifferentiation] matrix() — FULL visibility');
    console.log(header);
    console.log('─'.repeat(14 + 14 * _BANDS.length));

    for (var ci = 0; ci < _CLASSES.length; ci++) {
      var cls    = _CLASSES[ci];
      var rowStr = _pad(cls, 14);

      for (var bi2 = 0; bi2 < _BANDS.length; bi2++) {
        var band = _BANDS[bi2];
        var p    = _msd.resolveSilhouetteProfile(_fakeInput(cls, band, 'FULL'));
        result.push({
          classKey:             cls,
          distanceBand:         band,
          visibilityClass:      'FULL',
          hullAspectBias:       p.hullAspectBias,
          atmosphericMassBias:  p.atmosphericMassBias,
          wakeReadabilityScale: p.wakeReadabilityScale,
          farLightSpacing:      p.farLightSpacing,
        });
        rowStr += _pad(
          _f(p.hullAspectBias, 1) + '/' + _f(p.wakeReadabilityScale, 1),
          14
        );
      }
      console.log(rowStr);
    }
    console.log('  columns: hullAspectBias / wakeReadabilityScale');
    console.groupEnd();
    return result;
  }

  // ── constants() ───────────────────────────────────────────────────────────────

  function constants() {
    console.group('[SilhouetteDifferentiation] constants — v' + C.VERSION);
    console.log('VERSION               :', C.VERSION);
    console.log('MIN_ASPECT_BIAS       :', C.MIN_ASPECT_BIAS);
    console.log('MAX_ASPECT_BIAS       :', C.MAX_ASPECT_BIAS);
    console.log('MIN_MASS_BIAS         :', C.MIN_MASS_BIAS);
    console.log('MAX_MASS_BIAS         :', C.MAX_MASS_BIAS);
    console.log('MIN_READABILITY_SCALE :', C.MIN_READABILITY_SCALE);
    console.log('MAX_READABILITY_SCALE :', C.MAX_READABILITY_SCALE);
    console.log('MAX_TURN_SOFTNESS_DEG :', C.MAX_TURN_SOFTNESS_DEG);
    console.log('DEFAULT_UNKNOWN_CLASS :', C.DEFAULT_UNKNOWN_CLASS);
    console.log('CLASS_KEYS            :', C.CLASS_KEYS.join(', '));
    console.log('DISTANCE_BANDS        :', C.DISTANCE_BANDS.join(', '));
    console.log('VISIBILITY_CLASSES    :', C.VISIBILITY_CLASSES.join(', '));
    console.groupEnd();
    return C;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  global._wos.silhouetteDifferentiation = Object.freeze({
    inspect:   inspect,
    preview:   preview,
    compare:   compare,
    matrix:    matrix,
    constants: constants,
  });

  console.log('[MaritimeSilhouetteDifferentiationDebug] v' + C.VERSION +
    ' ready — _wos.silhouetteDifferentiation bound');

})(window);
