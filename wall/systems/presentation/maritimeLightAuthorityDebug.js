// ── MaritimeLightAuthorityDebug v1.0.2 ───────────────────────────────────────
// 0526F_WOS_MaritimeLightAuthority_v1.0.2
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.lightAuthority with:
//   preview("ferry")         — class signature summary
//   sample("cargo", "FAR")  — envelope for class + distance band
//   compare("cargo", "tug") — side-by-side signature delta
//   matrix()                — 2D grid: classes × distance bands
//   constants()             — all system constants
//   setDebug(bool)          — toggles showMaritimeLightAuthorityDebug flag
//
// Debug APIs are observational only.
// They do not mutate live renderer state or runtime truth.
//
// Placement: wall/systems/presentation/maritimeLightAuthorityDebug.js
// Load: AFTER main.js (additive _wos init)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var _mla = global.SBE && global.SBE.MaritimeLightAuthority;

  if (!_mla) {
    console.warn('[MaritimeLightAuthorityDebug] SBE.MaritimeLightAuthority not found — ' +
      'ensure maritimeLightAuthority.js is loaded first.');
    global._wos.lightAuthority = { _error: 'runtime not loaded' };
    return;
  }

  var C = _mla.getConstants();

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

  function _currentNowMs() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }
  function _currentZoom() {
    if (global.SBE && global.SBE._map && typeof global.SBE._map.getZoom === 'function') {
      return global.SBE._map.getZoom();
    }
    return 12.0;
  }
  function _viewportSize() {
    return {
      w: (typeof window !== 'undefined' && window.innerWidth)  ? window.innerWidth  : 800,
      h: (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 600,
    };
  }

  // Build a minimal distance envelope for a band (for debug sampling)
  function _fakeDistEnv(band) {
    var alphaByBand = { HERO:1.00, NEAR:0.90, MID:0.72, FAR:0.55, ATMOSPHERIC:0.35 };
    var bloomByBand = { HERO:1.00, NEAR:0.90, MID:0.72, FAR:0.55, ATMOSPHERIC:0.35 };
    return {
      band:           band,
      lightAlpha:     alphaByBand[band] || 0.5,
      lightBloomScale:bloomByBand[band] || 0.5,
      allowNavLights: band === 'HERO' || band === 'NEAR' || band === 'MID',
      allowFarLight:  band !== 'HERO',
    };
  }

  var _BANDS = ['HERO', 'NEAR', 'MID', 'FAR', 'ATMOSPHERIC'];
  var _SIG_FIELDS = [
    'baseRenderMode', 'baseAlpha', 'bloomScale', 'shimmerScale',
    'pulseHz', 'pulseDepth', 'navWarmth', 'farWarmth',
    'clusterCount', 'clusterSpreadPx', 'suppressUnderAtmosphere',
  ];

  // ── preview(vesselClass) ─────────────────────────────────────────────────────

  function preview(vesselClass) {
    var sig = _mla.resolveClassLightSignature(vesselClass);
    var modeGlyph = {
      DUAL_NAV: '⚡⚡', CLUSTER: '✦✦✦', POINT: '✦', GHOST: '·', NONE: '—',
    }[sig.baseRenderMode] || '?';

    console.group('[LightAuthority] preview(' + (vesselClass || 'unknown') + ')');
    console.log('  classKey       :', sig.classKey);
    console.log('  baseRenderMode :', sig.baseRenderMode, ' ', modeGlyph);
    console.log('  baseAlpha      :', _f(sig.baseAlpha));
    console.log('  bloomScale     :', _f(sig.bloomScale));
    console.log('  shimmerScale   :', _f(sig.shimmerScale));
    console.log('  pulseHz        :', _f(sig.pulseHz), '(' + _f(1 / sig.pulseHz, 1) + 's period)');
    console.log('  pulseDepth     :', _f(sig.pulseDepth));
    console.log('  navWarmth      :', _f(sig.navWarmth), '  farWarmth:', _f(sig.farWarmth));
    console.log('  clusterCount   :', sig.clusterCount,
      '  spread@13:', _f(sig.clusterSpreadPx, 1) + 'px');
    console.log('  suppressAtm    :', _f(sig.suppressUnderAtmosphere));
    console.groupEnd();
    return sig;
  }

  // ── sample(vesselClass, band) ─────────────────────────────────────────────────
  // Resolves a full light envelope for the given class and distance band.

  function sample(vesselClass, band) {
    band = band || 'NEAR';
    var vp = _viewportSize();
    var input = {
      vesselId:         null,
      mmsi:             null,
      vesselClass:      vesselClass || 'unknown',
      vesselState:      null,
      headingDeg:       90,
      speedKts:         12,
      zoom:             _currentZoom(),
      nowMs:            _currentNowMs(),
      visibilityClass:  null,
      distanceEnvelope: _fakeDistEnv(band),
      fogAlpha:         0,
      hazeAlpha:        0,
      densityPressure:  0,
      timeOfDay:        null,
    };

    var env = _mla.resolveLightEnvelope(input);

    console.group('[LightAuthority] sample(' + (vesselClass || 'unknown') + ', ' + band + ')');
    console.log('renderMode      :', env.renderMode);
    console.log('reasonCode      :', env.reasonCode);
    console.log('visible         :', env.visible);
    console.log('alpha           :', _f(env.alpha));
    console.log('navAlpha        :', _f(env.navAlpha));
    console.log('farAlpha        :', _f(env.farAlpha));
    console.log('bloomAlpha      :', _f(env.bloomAlpha), '  bloomRadiusPx:', _f(env.bloomRadiusPx, 1));
    console.log('pulseValue      :', _f(env.pulseValue), '  shimmerAmount:', _f(env.shimmerAmount));
    console.log('glowColor       :', env.glowColor);
    console.log('allowNavPair    :', env.allowNavPair,
      '  allowMastLight:', env.allowMastLight);
    console.log('allowFarGlint   :', env.allowFarGlint,
      '  allowBloom:', env.allowBloom);
    console.log('allowWakeGlow   :', env.allowWakeGlow,
      '  allowReflectionHint:', env.allowReflectionHint);
    console.groupEnd();
    return env;
  }

  // ── compare(classA, classB) ───────────────────────────────────────────────────

  function compare(classA, classB) {
    var a  = _mla.resolveClassLightSignature(classA);
    var b  = _mla.resolveClassLightSignature(classB);
    var ka = (classA || 'unknown').toUpperCase();
    var kb = (classB || 'unknown').toUpperCase();

    console.group('[LightAuthority] compare(' + ka + ' vs ' + kb + ')');
    console.log(_pad('FIELD', 26) + _pad(ka, 18) + kb);
    console.log('─'.repeat(68));
    for (var i = 0; i < _SIG_FIELDS.length; i++) {
      var k  = _SIG_FIELDS[i];
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

  // ── matrix() — §20 ───────────────────────────────────────────────────────────
  // Returns Array<{ classKey, distanceBand, renderMode, alpha, bloomAlpha }>
  // Axes: rows = vessel classes, columns = distance bands

  function matrix() {
    var classes = C.CLASS_KEYS;
    var nowMs   = _currentNowMs();
    var zoom    = _currentZoom();
    var result  = [];

    // Header
    var header = _pad('CLASS', 14);
    for (var bi = 0; bi < _BANDS.length; bi++) {
      header += _pad(_BANDS[bi].substring(0, 5), 18);
    }
    console.group('[LightAuthority] matrix() — zoom ' + zoom.toFixed(1));
    console.log(header);
    console.log('─'.repeat(14 + 18 * _BANDS.length));

    var glyph = { DUAL_NAV:'⚡', CLUSTER:'✦', POINT:'·', GHOST:'~', NONE:' ' };

    for (var ci = 0; ci < classes.length; ci++) {
      var cls = classes[ci];
      var rowStr = _pad(cls, 14);

      for (var bi2 = 0; bi2 < _BANDS.length; bi2++) {
        var band = _BANDS[bi2];
        var env = _mla.resolveLightEnvelope({
          vesselId:        null,
          mmsi:            ci * 1000 + bi2,
          vesselClass:     cls,
          headingDeg:      0,
          speedKts:        10,
          zoom:            zoom,
          nowMs:           nowMs,
          visibilityClass: null,
          distanceEnvelope:_fakeDistEnv(band),
          fogAlpha:        0,
          hazeAlpha:       0,
          densityPressure: 0,
        });
        result.push({
          classKey:     cls,
          distanceBand: band,
          renderMode:   env.renderMode,
          alpha:        env.alpha,
          bloomAlpha:   env.bloomAlpha,
        });
        rowStr += _pad(
          (glyph[env.renderMode] || '?') + env.renderMode.substring(0,4) +
          ' α' + _f(env.alpha, 2),
          18
        );
      }
      console.log(rowStr);
    }
    console.groupEnd();
    return result;
  }

  // ── constants() ───────────────────────────────────────────────────────────────

  function constants() {
    console.group('[LightAuthority] constants — v' + C.VERSION);
    console.log('VERSION                           :', C.VERSION);
    console.log('MIN_LIGHT_ALPHA                   :', C.MIN_LIGHT_ALPHA);
    console.log('MAX_NAV_ALPHA                     :', C.MAX_NAV_ALPHA);
    console.log('MAX_FAR_LIGHT_ALPHA               :', C.MAX_FAR_LIGHT_ALPHA);
    console.log('MIN_BLOOM_RADIUS_PX               :', C.MIN_BLOOM_RADIUS_PX);
    console.log('MAX_BLOOM_RADIUS_PX               :', C.MAX_BLOOM_RADIUS_PX);
    console.log('MAX_BLOOM_ALPHA                   :', C.MAX_BLOOM_ALPHA);
    console.log('DEFAULT_SHIMMER_AMOUNT            :', C.DEFAULT_SHIMMER_AMOUNT);
    console.log('MAX_SHIMMER_AMOUNT                :', C.MAX_SHIMMER_AMOUNT);
    console.log('DEFAULT_PULSE_HZ                  :', C.DEFAULT_PULSE_HZ);
    console.log('MAX_PULSE_HZ                      :', C.MAX_PULSE_HZ);
    console.log('REFERENCE_CLUSTER_ZOOM            :', C.REFERENCE_CLUSTER_ZOOM);
    console.log('DEFAULT_ATMOSPHERE_FOG_WEIGHT     :', C.DEFAULT_ATMOSPHERE_FOG_WEIGHT);
    console.log('DEFAULT_ATMOSPHERE_HAZE_WEIGHT    :', C.DEFAULT_ATMOSPHERE_HAZE_WEIGHT);
    console.log('DEFAULT_ATMOSPHERE_DENSITY_WEIGHT :', C.DEFAULT_ATMOSPHERE_DENSITY_WEIGHT);
    console.log('CLASS_KEYS                        :', C.CLASS_KEYS.join(', '));
    console.log('REASON_CODES                      :', Object.keys(C.REASON_CODES).join(', '));
    console.groupEnd();
    return C;
  }

  // ── setDebug(bool) ────────────────────────────────────────────────────────────

  var _debugActive = false;
  function setDebug(state) {
    _debugActive = (state !== undefined) ? !!state : !_debugActive;
    if (global.SBE && global.SBE.runtimeFlags) {
      global.SBE.runtimeFlags.showMaritimeLightAuthorityDebug = _debugActive;
    }
    console.log('[LightAuthority] setDebug →',
      _debugActive ? '✓ on (showMaritimeLightAuthorityDebug)' : '✗ off');
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  global._wos.lightAuthority = Object.freeze({
    preview:   preview,
    sample:    sample,
    compare:   compare,
    matrix:    matrix,
    constants: constants,
    setDebug:  setDebug,
  });

  console.log('[MaritimeLightAuthorityDebug] v' + C.VERSION +
    ' ready — _wos.lightAuthority bound');

})(window);
