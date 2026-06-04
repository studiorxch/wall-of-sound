// ── MaritimeWakeSignatureDebug v1.0.1 ─────────────────────────────────────────
// 0526C_WOS_ActiveWakePolish_v1.0.1
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.wakeSignature with:
//   profile("cargo")         — resolved polish profile for a vessel class
//   preview("ferry")         — ASCII class wake summary in console
//   compare("cargo", "tug")  — side-by-side profile delta table
//   setDebug(true)           — toggles showMaritimeWakeDebug runtime flag
//   constants()              — all system constants
//
// Debug APIs are observational only.
// They do not mutate live renderer state or wake profiles.
//
// Placement: wall/systems/presentation/maritimeWakeSignatureDebug.js
// Load: AFTER main.js (additive _wos init)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var _mws = global.SBE && global.SBE.MaritimeWakeSignature;

  if (!_mws) {
    console.warn('[MaritimeWakeSignatureDebug] SBE.MaritimeWakeSignature not found — ' +
      'ensure maritimeWakeSignature.js is loaded first.');
    global._wos.wakeSignature = { _error: 'runtime not loaded' };
    return;
  }

  var C = _mws.CONSTANTS;

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
  function _f(v, d) { return Number(v).toFixed(d !== undefined ? d : 2); }

  // Ordered fields for display
  var _FIELDS = [
    'mode', 'spreadDeg', 'lengthScale', 'asymmetry',
    'alphaScale', 'nearSternAlpha', 'lineSoftness', 'glowStrength',
    'turbulenceCount', 'turbulenceSpread', 'turbulenceLengthScale',
    'maxWakeAlpha', 'maxGlowAlpha', 'minVisibleZoom', 'fullVisibleZoom',
  ];

  // ── profile(vesselClass) ──────────────────────────────────────────────────────

  function profile(vesselClass) {
    var p = _mws.resolveWakeProfile(vesselClass);
    console.group('[WakeSignature] profile(' + (vesselClass || 'default') + ')');
    for (var i = 0; i < _FIELDS.length; i++) {
      var k = _FIELDS[i];
      var v = p[k];
      if (typeof v === 'number') v = _f(v, 3);
      console.log(_pad(k, 24) + ':', v);
    }
    console.groupEnd();
    return p;
  }

  // ── preview(vesselClass) ──────────────────────────────────────────────────────
  // Prints a compact wake summary showing mode archetype and key visual params.

  function preview(vesselClass) {
    var vc = (vesselClass || 'unknown').toUpperCase();
    var p  = _mws.resolveWakeProfile(vc);

    var modeGlyph = {
      LINEAR:      '══════',
      SPLIT_V:     '╱╲════',
      TURBULENT:   '≈≈≈≈≈≈',
      DRIFT:       '╲~~~~~',
      DISCIPLINED: '──────',
    }[p.mode] || '──────';

    console.group('[WakeSignature] preview(' + vc + ')');
    console.log('  mode           :', p.mode, ' ', modeGlyph);
    console.log('  spread         :', _f(p.spreadDeg, 0) + '°');
    console.log('  lengthScale    :', _f(p.lengthScale));
    console.log('  alphaScale     :', _f(p.alphaScale));
    console.log('  nearSternAlpha :', _f(p.nearSternAlpha));
    console.log('  maxWakeAlpha   :', _f(p.maxWakeAlpha), '  maxGlowAlpha:', _f(p.maxGlowAlpha));
    console.log('  lineSoftness   :', _f(p.lineSoftness, 1) + 'px glow width addition');
    console.log('  turbulence     :', p.turbulenceCount + ' filaments' +
      (p.turbulenceCount ? ' (spread×' + _f(p.turbulenceSpread) + ', len×' + _f(p.turbulenceLengthScale) + ')' : ''));
    console.log('  zoom range     :', _f(p.minVisibleZoom, 1) + ' → ' + _f(p.fullVisibleZoom, 1));
    console.groupEnd();
    return p;
  }

  // ── compare(classA, classB) ───────────────────────────────────────────────────
  // Side-by-side table for two profiles.

  function compare(classA, classB) {
    var a  = _mws.resolveWakeProfile(classA);
    var b  = _mws.resolveWakeProfile(classB);
    var ka = (classA || 'unknown').toUpperCase();
    var kb = (classB || 'unknown').toUpperCase();

    console.group('[WakeSignature] compare(' + ka + ' vs ' + kb + ')');
    console.log(
      _pad('FIELD', 26) +
      _pad(ka, 18) +
      kb
    );
    console.log('─'.repeat(68));
    for (var i = 0; i < _FIELDS.length; i++) {
      var k  = _FIELDS[i];
      var va = a[k];
      var vb = b[k];
      var sa = typeof va === 'number' ? _f(va, 3) : String(va);
      var sb = typeof vb === 'number' ? _f(vb, 3) : String(vb);
      var diff = (typeof va === 'number' && typeof vb === 'number' && va !== vb) ? ' ◀' : '';
      console.log(_pad(k, 26) + _pad(sa, 18) + sb + diff);
    }
    console.groupEnd();
    return { a: a, b: b };
  }

  // ── setDebug(bool) ────────────────────────────────────────────────────────────

  var _debugActive = false;
  function setDebug(state) {
    _debugActive = (state !== undefined) ? !!state : !_debugActive;
    if (global.SBE && global.SBE.runtimeFlags) {
      global.SBE.runtimeFlags.showMaritimeWakeDebug = _debugActive;
    }
    console.log('[WakeSignature] setDebug →', _debugActive ? '✓ on' : '✗ off',
      '(showMaritimeWakeDebug)');
  }

  // ── constants() ───────────────────────────────────────────────────────────────

  function constants() {
    console.group('[WakeSignature] constants — v' + C.VERSION);
    console.log('VERSION                  :', C.VERSION);
    console.log('VALID_MODES              :', C.VALID_MODES.join(', '));
    console.log('DEFAULT_WAKE_MIN_ZOOM    :', C.DEFAULT_WAKE_MIN_ZOOM);
    console.log('DEFAULT_WAKE_FULL_ZOOM   :', C.DEFAULT_WAKE_FULL_ZOOM);
    console.log('MAX_ACTIVE_WAKE_ALPHA    :', C.MAX_ACTIVE_WAKE_ALPHA);
    console.log('MAX_ACTIVE_WAKE_GLOW_ALPHA:', C.MAX_ACTIVE_WAKE_GLOW_ALPHA);
    console.log('MAX_WAKE_LINE_WIDTH_PX   :', C.MAX_WAKE_LINE_WIDTH_PX);
    console.log('MIN_WAKE_LINE_WIDTH_PX   :', C.MIN_WAKE_LINE_WIDTH_PX);
    console.log('MAX_TURBULENCE_FILAMENTS :', C.MAX_TURBULENCE_FILAMENTS);
    console.groupEnd();
    return C;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  global._wos.wakeSignature = Object.freeze({
    profile:   profile,
    preview:   preview,
    compare:   compare,
    setDebug:  setDebug,
    constants: constants,
  });

  console.log('[MaritimeWakeSignatureDebug] v' + C.VERSION +
    ' ready — _wos.wakeSignature bound');

})(window);
