// ── MaritimeWaterMemoryDebug v1.0.1 ───────────────────────────────────────────
// 0526B_WOS_MaritimeWaterMemoryDebug_v1.0.1
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Binds _wos.waterMemory with:
//   snapshot()            — WaterMemorySnapshot + telemetry
//   clear()               — clearWaterMemory()
//   cells()               — tabular dump of all live cells
//   renderDebug()         — toggles debug heatmap overlay (console feedback)
//   injectTest("ferry")   — injects a single test stamp for a vessel class
//   injectLane("ferry")   — injects a sequence of aligned stamps to form a lane
//   constants()           — all system constants
//
// Debug injection may create memory cells.
// Debug injection may not affect AIS/runtime truth.
//
// Placement: wall/systems/presentation/maritimeWaterMemoryDebug.js
// Load: AFTER main.js (additive _wos init)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var _mwm = global.SBE && global.SBE.MaritimeWaterMemory;
  var _mws = global.SBE && global.SBE.MaritimeWakeSignature;

  if (!_mwm) {
    console.warn('[MaritimeWaterMemoryDebug] SBE.MaritimeWaterMemory not found — ' +
      'ensure maritimeWaterMemory.js is loaded first.');
    global._wos.waterMemory = { _error: 'runtime not loaded' };
    return;
  }

  var C = _mwm.getConstants();

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
  function _pct(v) { return (v * 100).toFixed(1) + '%'; }

  // ── snapshot() ────────────────────────────────────────────────────────────────

  function snapshot() {
    var s = _mwm.getWaterMemorySnapshot();
    console.group('[WaterMemory] snapshot — v' + s.version);
    console.log('active                :', s.active);
    console.log('renderStyle           :', s.renderStyle);
    console.log('stampCount            :', s.stampCount, '/', C.MAX_ACTIVE_STAMPS);
    console.log('cellCount             :', s.cellCount,  '/', C.MAX_ACTIVE_CELLS);
    console.log('totalIntensity        :', s.totalIntensity.toFixed(3));
    console.log('maxIntensity          :', s.maxIntensity.toFixed(3));
    console.log('dominantClass         :', s.dominantClass || '(none)');
    console.log('lastUpdateMs          :', s.lastUpdateMs.toFixed(0) + 'ms');
    console.log('viewportInvalidations :', s.viewportInvalidations);
    var vp = s.lastViewportSignature;
    console.log('lastViewportSignature :', vp ? (vp.width + '×' + vp.height + ' @' + vp.dpr + 'x') : '(none)');
    console.groupEnd();
    return s;
  }

  // ── clear() ───────────────────────────────────────────────────────────────────

  function clear() {
    _mwm.clearWaterMemory();
    console.log('[WaterMemory] clear() — all cells and stamps removed');
  }

  // ── cells() ───────────────────────────────────────────────────────────────────

  function cells() {
    var all = _mwm.getCells();
    if (!all.length) {
      console.log('[WaterMemory] cells() — no live cells');
      return all;
    }
    console.group('[WaterMemory] cells() — ' + all.length + ' live cells');
    console.log(
      _pad('#', 5) + _pad('CELL_ID', 12) +
      _pad('INT', 7) + _pad('AGE', 7) + _pad('CHURN', 7) +
      _pad('CLASS', 14) + _pad('KIND', 14) +
      _pad('HVX', 7) + 'HVY'
    );
    console.log('─'.repeat(85));
    var sorted = all.slice().sort(function (a, b) { return b.intensity - a.intensity; });
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      console.log(
        _lpad(i, 3) + '  ' +
        _pad(c.cellId,       12) +
        _lpad(c.intensity.toFixed(3), 6) + ' ' +
        _lpad((c.ageMs / 1000).toFixed(1) + 's', 6) + ' ' +
        _lpad(c.churn.toFixed(2),  6) + ' ' +
        _pad(c.dominantClass, 14) +
        _pad(c.dominantKind,  14) +
        _lpad(c.headingVectorX.toFixed(2), 6) + ' ' +
        c.headingVectorY.toFixed(2)
      );
    }
    console.groupEnd();
    return all;
  }

  // ── renderDebug() ─────────────────────────────────────────────────────────────
  // Toggles the showMaritimeWaterMemoryDebug flag and logs state.

  var _debugActive = false;
  function renderDebug() {
    _debugActive = !_debugActive;
    if (global.SBE && global.SBE.runtimeFlags) {
      global.SBE.runtimeFlags.showMaritimeWaterMemoryDebug = _debugActive;
    }
    console.log('[WaterMemory] renderDebug —',
      _debugActive ? '✓ debug overlay enabled' : '✗ debug overlay disabled');
    console.log('  Active cells:', _mwm.getCells().length,
      '| To trigger rendering: ensure showMaritimeWaterMemory = true');
  }

  // ── _isEnabled() ─────────────────────────────────────────────────────────────
  // Strict check — must be exactly true, not truthy.
  function _isEnabled() {
    return !!(global.SBE && global.SBE.runtimeFlags &&
              global.SBE.runtimeFlags.showMaritimeWaterMemory === true);
  }

  // ── injectTest(vesselClass, opts) ─────────────────────────────────────────────
  // Injects a single test stamp at screen center (or custom position).
  // Requires WaterMemory to be enabled first (_wos.waterMemory.enable()).
  // Does not affect AIS/runtime truth.

  function injectTest(vesselClass, opts) {
    if (!_isEnabled()) {
      console.warn('[WaterMemory] injectTest: WaterMemory is disabled. ' +
        'Call _wos.waterMemory.enable() first.');
      return null;
    }
    opts = opts || {};
    var vc  = (vesselClass || 'FERRY').toUpperCase();
    var wm  = _resolveTestWakeMode(vc);
    var nowMs = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();

    var input = {
      vesselId:   'debug_inject',
      vesselClass: vc,
      wakeMode:    wm,
      x:           opts.x        !== undefined ? opts.x        : _screenCenterX(),
      y:           opts.y        !== undefined ? opts.y        : _screenCenterY(),
      headingDeg:  opts.heading  !== undefined ? opts.heading  : 45,
      speedKts:    opts.speed    !== undefined ? opts.speed    : 12,
      lengthPx:    opts.lengthPx !== undefined ? opts.lengthPx : 60,
      widthPx:     opts.widthPx  !== undefined ? opts.widthPx  : 18,
      nowMs:       nowMs,
      seed:        opts.seed || 42,
    };

    var before = _mwm.getCells().length;
    _mwm.stampWakeMemory(input);
    var after = _mwm.getCells().length;

    console.log('[WaterMemory] injectTest(' + vc + ') —',
      'wakeMode: ' + wm + ', cells: ' + before + ' → ' + after,
      '(x=' + Math.round(input.x) + ', y=' + Math.round(input.y) + ')');
    return input;
  }

  // ── injectLane(vesselClass, opts) ─────────────────────────────────────────────
  // Injects a sequence of aligned stamps simulating repeated corridor transit.
  // Requires WaterMemory to be enabled first (_wos.waterMemory.enable()).
  // Does not affect AIS/runtime truth.

  function injectLane(vesselClass, opts) {
    if (!_isEnabled()) {
      console.warn('[WaterMemory] injectLane: WaterMemory is disabled. ' +
        'Call _wos.waterMemory.enable() first.');
      return;
    }
    opts = opts || {};
    var vc      = (vesselClass || 'FERRY').toUpperCase();
    var wm      = _resolveTestWakeMode(vc);
    var count   = opts.count   !== undefined ? opts.count   : 12;
    var spacing = opts.spacing !== undefined ? opts.spacing : 40;
    var cx      = opts.x       !== undefined ? opts.x       : _screenCenterX() - (count * spacing * 0.5);
    var cy      = opts.y       !== undefined ? opts.y       : _screenCenterY();
    var heading = opts.heading !== undefined ? opts.heading : 90;
    var nowMs   = (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();

    var before = _mwm.getCells().length;
    for (var i = 0; i < count; i++) {
      _mwm.stampWakeMemory({
        vesselId:    'debug_lane_' + i,
        vesselClass: vc,
        wakeMode:    wm,
        x:           cx + i * spacing,
        y:           cy + (Math.sin(i * 0.4) * 8),
        headingDeg:  heading,
        speedKts:    14,
        lengthPx:    60,
        widthPx:     18,
        nowMs:       nowMs + i * 200,
        seed:        i,
      });
    }
    var after = _mwm.getCells().length;
    console.log('[WaterMemory] injectLane(' + vc + ') — ' + count +
      ' stamps injected, cells: ' + before + ' → ' + after);
  }

  // ── constants() ───────────────────────────────────────────────────────────────

  function constants() {
    var s = _mwm.getWaterMemorySnapshot();
    console.group('[WaterMemory] constants — v' + C.VERSION);
    console.log('VERSION                   :', C.VERSION);
    console.log('DEFAULT_CELL_SIZE_PX      :', C.DEFAULT_CELL_SIZE_PX);
    console.log('MAX_ACTIVE_STAMPS         :', C.MAX_ACTIVE_STAMPS);
    console.log('MAX_ACTIVE_CELLS          :', C.MAX_ACTIVE_CELLS);
    console.log('DEFAULT_DECAY_HALF_LIFE_MS:', C.DEFAULT_DECAY_HALF_LIFE_MS);
    console.log('MAX_PERSISTENCE_MS        :', C.MAX_PERSISTENCE_MS);
    console.log('MIN_STAMP_SPEED_KTS       :', C.MIN_STAMP_SPEED_KTS);
    console.log('MEMORY_RENDER_ZOOM_MIN    :', C.MEMORY_RENDER_ZOOM_MIN);
    console.log('MEMORY_FULL_DETAIL_ZOOM   :', C.MEMORY_FULL_DETAIL_ZOOM);
    console.log('DISCARD_THRESHOLD         :', C.DISCARD_THRESHOLD);
    console.log('VALID_WAKE_MODES          :', C.VALID_WAKE_MODES.join(', '));
    console.log('VALID_RENDER_STYLES       :', C.VALID_RENDER_STYLES.join(', '));
    console.log('DEFAULT_RENDER_STYLE      :', C.DEFAULT_RENDER_STYLE, '(sheen = atmospheric)');
    console.log('active renderStyle        :', s.renderStyle);
    console.log('viewportInvalidations     :', s.viewportInvalidations);
    console.groupEnd();
  }

  // ── setStyle(style) ───────────────────────────────────────────────────────────
  // Convenience: set SBE.runtimeFlags.waterMemoryRenderStyle and confirm.
  // Accepted values: "ribbon", "foam", "cell", "debug"

  function setStyle(style) {
    var valid = C.VALID_RENDER_STYLES;
    if (valid.indexOf(style) === -1) {
      console.warn('[WaterMemory] setStyle: unknown style "' + style +
        '". Valid: ' + valid.join(', '));
      return;
    }
    if (!global.SBE) global.SBE = {};
    if (!global.SBE.runtimeFlags) global.SBE.runtimeFlags = {};
    global.SBE.runtimeFlags.waterMemoryRenderStyle = style;
    console.log('[WaterMemory] setStyle → "' + style + '" (takes effect next render frame)');
  }

  // ── enable() / disable() ─────────────────────────────────────────────────────

  function enable() {
    if (!global.SBE)              global.SBE              = {};
    if (!global.SBE.runtimeFlags) global.SBE.runtimeFlags = {};
    global.SBE.runtimeFlags.showMaritimeWaterMemory = true;
    _mwm.clearWaterMemory();
    console.log('[WaterMemory] enable() — showMaritimeWaterMemory = true, fresh empty state');
  }

  function disable() {
    if (!global.SBE)              global.SBE              = {};
    if (!global.SBE.runtimeFlags) global.SBE.runtimeFlags = {};
    global.SBE.runtimeFlags.showMaritimeWaterMemory = false;
    _mwm.clearWaterMemory();
    console.log('[WaterMemory] disable() — showMaritimeWaterMemory = false, cleared');
  }

  // ── Internal helpers ──────────────────────────────────────────────────────────

  function _resolveTestWakeMode(vesselClass) {
    if (_mws) {
      var profile = _mws.resolveWakeProfile(vesselClass);
      if (profile) return profile.mode;
    }
    // Fallback table
    switch (vesselClass) {
      case 'CARGO': case 'TANKER': case 'PASSENGER': return 'LINEAR';
      case 'TUG': case 'INDUSTRIAL':                return 'TURBULENT';
      case 'FISHING':                               return 'DRIFT';
      case 'MILITARY':                              return 'DISCIPLINED';
      default:                                      return 'SPLIT_V';
    }
  }

  function _screenCenterX() {
    return (typeof window !== 'undefined' && window.innerWidth)
      ? window.innerWidth  * 0.5 : 400;
  }
  function _screenCenterY() {
    return (typeof window !== 'undefined' && window.innerHeight)
      ? window.innerHeight * 0.5 : 300;
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  global._wos.waterMemory = Object.freeze({
    enable:       enable,
    disable:      disable,
    snapshot:     snapshot,
    clear:        clear,
    cells:        cells,
    renderDebug:  renderDebug,
    injectTest:   injectTest,
    injectLane:   injectLane,
    constants:    constants,
    setStyle:     setStyle,
  });

  console.log('[MaritimeWaterMemoryDebug] v' + C.VERSION +
    ' ready — _wos.waterMemory bound');

})(window);
