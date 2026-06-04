// ── MaritimeDistanceAtmosphereDebug v1.0.1 ───────────────────────────────────
// 0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.distanceAtmosphere with:
//   sampleAt(x, y, opts)     — resolves envelope for screen coords
//   inspectVessel(vesselId)  — resolves envelope for a known vessel's position
//   matrix(rows?, cols?)     — typed 2D grid of sampled envelopes
//   constants()              — all system constants
//   setDebug(bool)           — toggles showMaritimeDistanceAtmosphereDebug flag
//
// Debug APIs are observational only.
// They do not mutate runtime state.
//
// Placement: wall/systems/presentation/maritimeDistanceAtmosphereDebug.js
// Load: AFTER main.js (additive _wos init)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var _mda = global.SBE && global.SBE.MaritimeDistanceAtmosphere;

  if (!_mda) {
    console.warn('[MaritimeDistanceAtmosphereDebug] SBE.MaritimeDistanceAtmosphere not found — ' +
      'ensure maritimeDistanceAtmosphere.js is loaded first.');
    global._wos.distanceAtmosphere = { _error: 'runtime not loaded' };
    return;
  }

  var C = _mda.getConstants();

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

  function _viewportSize() {
    return {
      w: (typeof window !== 'undefined' && window.innerWidth)  ? window.innerWidth  : 800,
      h: (typeof window !== 'undefined' && window.innerHeight) ? window.innerHeight : 600,
    };
  }
  function _currentZoom() {
    // Read from renderer frame camera if available
    if (global._wos && global._wos._frameCam && typeof global._wos._frameCam.zoom === 'number') {
      return global._wos._frameCam.zoom;
    }
    // Try Mapbox
    if (global.SBE && global.SBE._map && typeof global.SBE._map.getZoom === 'function') {
      return global.SBE._map.getZoom();
    }
    return 12.0;
  }

  // ── sampleAt(x, y, opts) ──────────────────────────────────────────────────────
  // Resolves an envelope for given screen coordinates.
  // opts: { zoom, vesselClass, populationTier, visibilityClass, focusX, focusY,
  //         fogAlpha, hazeAlpha, densityPressure }

  function sampleAt(x, y, opts) {
    opts = opts || {};
    var vp = _viewportSize();
    var input = {
      vesselId:         null,
      vesselClass:      opts.vesselClass      || 'unknown',
      populationTier:   opts.populationTier   || 'MID',
      screenX:          x,
      screenY:          y,
      viewportWidth:    vp.w,
      viewportHeight:   vp.h,
      focusX:           typeof opts.focusX === 'number' ? opts.focusX : null,
      focusY:           typeof opts.focusY === 'number' ? opts.focusY : null,
      zoom:             typeof opts.zoom === 'number' ? opts.zoom : _currentZoom(),
      visibilityClass:  opts.visibilityClass  || null,
      fogAlpha:         opts.fogAlpha         || 0,
      hazeAlpha:        opts.hazeAlpha        || 0,
      densityPressure:  opts.densityPressure  || 0,
    };

    var env = _mda.resolveDistanceEnvelope(input);

    console.group('[DistanceAtmosphere] sampleAt(' + Math.round(x) + ', ' + Math.round(y) + ')');
    console.log('band            :', env.band);
    console.log('reasonCode      :', env.reasonCode);
    console.log('distanceNorm    :', _f(env.distanceNorm));
    console.log('atmosphereNorm  :', _f(env.atmosphereNorm));
    console.log('zoomNorm        :', _f(env.zoomNorm));
    console.log('vesselAlpha     :', _f(env.vesselAlpha));
    console.log('topologyAlpha   :', _f(env.topologyAlpha));
    console.log('wakeAlpha       :', _f(env.wakeAlpha));
    console.log('lightAlpha      :', _f(env.lightAlpha));
    console.log('labelAlpha      :', _f(env.labelAlpha));
    console.log('hoverAlpha      :', _f(env.hoverAlpha));
    console.log('topologyDetailScale:', _f(env.topologyDetailScale));
    console.log('wakeDetailScale :', _f(env.wakeDetailScale));
    console.log('topologyLodHint :', env.topologyLodHint);
    console.log('allowWake       :', env.allowWake);
    console.log('allowTopology   :', env.allowTopology);
    console.log('allowLabel      :', env.allowLabel);
    console.log('allowHover      :', env.allowHover);
    console.log('allowNavLights  :', env.allowNavLights);
    console.log('allowFarLight   :', env.allowFarLight);
    console.groupEnd();
    return env;
  }

  // ── inspectVessel(vesselId) ───────────────────────────────────────────────────
  // Attempts to locate a vessel by id and sample its position.
  // Falls back to viewport center if position cannot be resolved.

  function inspectVessel(vesselId, opts) {
    opts = opts || {};
    var vp    = _viewportSize();
    var x     = vp.w * 0.5;
    var y     = vp.h * 0.5;
    var note  = '(using viewport center — vessel position not resolved)';

    // Try to get vessel position from AISRuntime if available
    var aisRT = global.SBE && global.SBE.AISRuntime;
    var vessel = aisRT && aisRT.getVessel && aisRT.getVessel(vesselId);
    if (vessel && typeof vessel.lat === 'number' && typeof vessel.lng === 'number') {
      // Position known but screen projection requires renderer context
      note = '(lat:' + vessel.lat.toFixed(4) + ' lng:' + vessel.lng.toFixed(4) +
             ' — screen projection not available in debug context)';
    }

    console.group('[DistanceAtmosphere] inspectVessel(' + vesselId + ')');
    console.log('note:', note);
    console.groupEnd();

    return sampleAt(x, y, opts);
  }

  // ── matrix(rows, cols) ────────────────────────────────────────────────────────
  // Returns a typed DistanceMatrix (§10) sampled over the viewport grid.

  function matrix(rows, cols) {
    rows = Math.max(2, rows || C.DEFAULT_MATRIX_ROWS);
    cols = Math.max(2, cols || C.DEFAULT_MATRIX_COLS);
    var vp   = _viewportSize();
    var zoom = _currentZoom();
    var cells = [];
    var glyph = { HERO: '●', NEAR: '◉', MID: '○', FAR: '·', ATMOSPHERIC: ' ' };

    console.group('[DistanceAtmosphere] matrix(' + rows + '×' + cols + ') — zoom ' + zoom.toFixed(1));

    // Header
    var header = _pad('', 6);
    for (var ci = 0; ci < cols; ci++) {
      var cx = Math.round(vp.w * (ci + 0.5) / cols);
      header += _lpad(cx + 'px', 12);
    }
    console.log(header);

    for (var ri = 0; ri < rows; ri++) {
      var cy   = Math.round(vp.h * (ri + 0.5) / rows);
      var rowCells = [];
      var rowStr = _lpad(cy + 'px', 6);

      for (var ci2 = 0; ci2 < cols; ci2++) {
        var cx2 = Math.round(vp.w * (ci2 + 0.5) / cols);
        var input = {
          vesselClass:    'unknown',
          populationTier: 'MID',
          screenX:        cx2,
          screenY:        cy,
          viewportWidth:  vp.w,
          viewportHeight: vp.h,
          zoom:           zoom,
          visibilityClass: null,
        };
        var env = _mda.resolveDistanceEnvelope(input);
        var cell = Object.freeze({
          row:           ri,
          col:           ci2,
          x:             cx2,
          y:             cy,
          band:          env.band,
          reasonCode:    env.reasonCode,
          distanceNorm:  env.distanceNorm,
          vesselAlpha:   env.vesselAlpha,
          topologyAlpha: env.topologyAlpha,
          wakeAlpha:     env.wakeAlpha,
          lightAlpha:    env.lightAlpha,
          labelAlpha:    env.labelAlpha,
          allowWake:     env.allowWake,
          allowLabel:    env.allowLabel,
          allowFarLight: env.allowFarLight,
        });
        rowCells.push(cell);
        rowStr += _lpad(
          (glyph[env.band] || '?') + env.band.substring(0,4) + ' ' + _f(env.vesselAlpha, 2),
          12
        );
      }
      cells.push(rowCells);
      console.log(rowStr);
    }

    console.groupEnd();

    return Object.freeze({
      version:       C.VERSION,
      rows:          rows,
      cols:          cols,
      viewportWidth: vp.w,
      viewportHeight: vp.h,
      zoom:          zoom,
      cells:         Object.freeze(cells),
    });
  }

  // ── constants() ───────────────────────────────────────────────────────────────

  function constants() {
    console.group('[DistanceAtmosphere] constants — v' + C.VERSION);
    console.log('VERSION              :', C.VERSION);
    console.log('HERO_RADIUS_NORM     :', C.HERO_RADIUS_NORM,   '— ≤ ' + (C.HERO_RADIUS_NORM * 100).toFixed(0) + '% from focus');
    console.log('NEAR_RADIUS_NORM     :', C.NEAR_RADIUS_NORM,   '— ≤ ' + (C.NEAR_RADIUS_NORM * 100).toFixed(0) + '% from focus');
    console.log('MID_RADIUS_NORM      :', C.MID_RADIUS_NORM,    '— ≤ ' + (C.MID_RADIUS_NORM  * 100).toFixed(0) + '% from focus');
    console.log('FAR_RADIUS_NORM      :', C.FAR_RADIUS_NORM,    '— ≤ ' + (C.FAR_RADIUS_NORM  * 100).toFixed(0) + '% from focus');
    console.log('DEFAULT_FOG_WEIGHT   :', C.DEFAULT_FOG_WEIGHT);
    console.log('DEFAULT_HAZE_WEIGHT  :', C.DEFAULT_HAZE_WEIGHT);
    console.log('DEFAULT_DENSITY_WEIGHT:', C.DEFAULT_DENSITY_WEIGHT);
    console.log('MIN_ATMOSPHERIC_ALPHA:', C.MIN_ATMOSPHERIC_ALPHA);
    console.log('MAX_FAR_LIGHT_ALPHA  :', C.MAX_FAR_LIGHT_ALPHA);
    console.log('DEFAULT_MATRIX_ROWS  :', C.DEFAULT_MATRIX_ROWS);
    console.log('DEFAULT_MATRIX_COLS  :', C.DEFAULT_MATRIX_COLS);
    console.log('REASON_CODES         :', Object.keys(C.REASON_CODES).join(', '));
    console.groupEnd();
    return C;
  }

  // ── setDebug(bool) ────────────────────────────────────────────────────────────

  var _debugActive = false;
  function setDebug(state) {
    _debugActive = (state !== undefined) ? !!state : !_debugActive;
    if (global.SBE && global.SBE.runtimeFlags) {
      global.SBE.runtimeFlags.showMaritimeDistanceAtmosphereDebug = _debugActive;
    }
    console.log('[DistanceAtmosphere] setDebug →',
      _debugActive ? '✓ on (showMaritimeDistanceAtmosphereDebug)' : '✗ off');
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  global._wos.distanceAtmosphere = Object.freeze({
    sampleAt:       sampleAt,
    inspectVessel:  inspectVessel,
    matrix:         matrix,
    constants:      constants,
    setDebug:       setDebug,
  });

  console.log('[MaritimeDistanceAtmosphereDebug] v' + C.VERSION +
    ' ready — _wos.distanceAtmosphere bound');

})(window);
