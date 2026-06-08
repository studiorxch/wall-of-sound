// ── HarborAtmosphereRuntime v1.0.0 ────────────────────────────────────────────
// 0604A_WOS_HarborAtmospherePass_v1.0.0
// Status: active | Classification: presentation-only-atmosphere
//
// A presentation-only harbor "mood" overlay: a single transparent canvas inside
// the Mapbox container rendering low-cost water glow + haze + micro-shimmer.
// READ-ONLY to the world: never starts feeds/Drive, never calls AIS/taxonomy,
// never adds Mapbox sources/layers or mutates style, never touches actor truth
// or vessel geometry. Pointer-events: none. RAF runs only while active+enabled.
// Never throws during boot. Load AFTER mapboxViewportRuntime.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var CANVAS_ID = 'wos-harbor-atmosphere';
  var MAX_SHIMMER = 80, DEFAULT_SHIMMER = 40;

  // Preset table. palette is screen-space only (no Mapbox water query in v1).
  var PRESETS = {
    night_harbor: { intensity: 1.0,  waterGlow: true, haze: true,  shimmer: true,
      glow: [0x0a3d54, 0x12506e], hazeColor: 0x16384a, vignette: 0.55, shimmerColor: 0x8fe7ff, shimmerCount: 40 },
    cyan_infra:   { intensity: 1.2,  waterGlow: true, haze: true,  shimmer: true,
      glow: [0x0b5566, 0x0f7d8c], hazeColor: 0x1a6b76, vignette: 0.5,  shimmerColor: 0x6dffe8, shimmerCount: 56 },
    low_fog:      { intensity: 0.8,  waterGlow: true, haze: true,  shimmer: false,
      glow: [0x29384a, 0x3a4a5e], hazeColor: 0x445566, vignette: 0.45, shimmerColor: 0xaab8c4, shimmerCount: 0 },
    clean_dark:   { intensity: 0.45, waterGlow: true, haze: false, shimmer: false,
      glow: [0x0a2030, 0x0d2a3c], hazeColor: 0x16222e, vignette: 0.6,  shimmerColor: 0x8fe7ff, shimmerCount: 0 },
    off:          { intensity: 0.0,  waterGlow: false, haze: false, shimmer: false,
      glow: [0x000000, 0x000000], hazeColor: 0x000000, vignette: 0.0, shimmerColor: 0x000000, shimmerCount: 0 },
  };

  var _state = {
    version: VERSION, active: false, enabled: true, debug: false,
    preset: 'night_harbor', intensity: 1.0, waterGlow: true, haze: true, shimmer: true,
    overlayMode: 'canvas', frameCount: 0, lastFrameAt: null, lastError: null,
  };

  var _canvas = null, _ctx = null, _container = null, _raf = null;
  var _dpr = 1, _w = 0, _h = 0, _t0 = (global.performance && performance.now) ? performance.now() : Date.now();
  var _shimmer = [];   // seeded once; drift computed in draw (no per-frame alloc)
  var _resizeBound = null;

  function _now() { return (global.performance && performance.now) ? performance.now() : Date.now(); }
  function _map() {
    var mvr = SBE.MapboxViewportRuntime;
    try { return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null; } catch (e) { return null; }
  }
  function _hex(c) { return 'rgb(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ')'; }
  function _rgba(c, a) { return 'rgba(' + ((c >> 16) & 255) + ',' + ((c >> 8) & 255) + ',' + (c & 255) + ',' + a + ')'; }
  function _preset() { return PRESETS[_state.preset] || PRESETS.night_harbor; }

  function _seedShimmer(n) {
    _shimmer.length = 0;
    n = Math.max(0, Math.min(MAX_SHIMMER, n || 0));
    for (var i = 0; i < n; i++) {
      _shimmer.push({
        x: Math.random(), y: 0.45 + Math.random() * 0.5,   // bias to lower (water) screen zones
        len: 1.5 + Math.random() * 3.5, spd: 0.004 + Math.random() * 0.01,
        ph: Math.random() * Math.PI * 2, a: 0.25 + Math.random() * 0.4,
      });
    }
  }

  function _ensureCanvas() {
    var map = _map();
    if (!map || typeof map.getContainer !== 'function') { _state.lastError = 'map_unavailable'; return false; }
    var container;
    try { container = map.getContainer(); } catch (e) { _state.lastError = 'map_unavailable'; return false; }
    if (!container) { _state.lastError = 'map_unavailable'; return false; }
    _container = container;
    if (!_canvas) {
      _canvas = global.document.getElementById(CANVAS_ID);
      if (!_canvas) {
        _canvas = global.document.createElement('canvas');
        _canvas.id = CANVAS_ID;
        // Inline style guarantees correct stacking even without CSS edits.
        var s = _canvas.style;
        s.position = 'absolute'; s.left = '0'; s.top = '0'; s.right = '0'; s.bottom = '0';
        s.width = '100%'; s.height = '100%'; s.pointerEvents = 'none';
        s.mixBlendMode = 'screen'; s.opacity = '0.55'; s.zIndex = '4';   // above base map, below UI panels
      }
      if (_canvas.parentNode !== _container) { try { _container.appendChild(_canvas); } catch (e) { _state.lastError = 'attach_failed'; return false; } }
      _ctx = _canvas.getContext('2d');
    }
    _resize();
    return true;
  }

  function _resize() {
    if (!_canvas || !_container) return;
    _dpr = Math.min(global.devicePixelRatio || 1, 2);
    var rect;
    try { rect = _container.getBoundingClientRect(); } catch (e) { rect = { width: _container.clientWidth || 0, height: _container.clientHeight || 0 }; }
    _w = Math.max(1, Math.round(rect.width));
    _h = Math.max(1, Math.round(rect.height));
    _canvas.width = Math.round(_w * _dpr);
    _canvas.height = Math.round(_h * _dpr);
    if (_ctx) _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  }

  function _draw() {
    if (!_ctx) return;
    var p = _preset();
    var k = _state.intensity;
    _ctx.clearRect(0, 0, _w, _h);
    if (_state.preset === 'off' || !_state.enabled || k <= 0) return;
    var t = (_now() - _t0) / 1000;

    // 1. Water glow — large radial gradients with a slow pulse.
    if (_state.waterGlow && p.waterGlow) {
      var pulse = 0.85 + 0.15 * Math.sin(t * 0.4);
      _radial(_w * 0.5, _h * 0.78, Math.max(_w, _h) * 0.7, p.glow[0], 0.5 * k * pulse);
      _radial(_w * 0.22, _h * 0.55, Math.max(_w, _h) * 0.45, p.glow[1], 0.32 * k * pulse);
      _radial(_w * 0.82, _h * 0.6, Math.max(_w, _h) * 0.4, p.glow[1], 0.28 * k * pulse);
      _vignette(p.vignette * k);
    }
    // 2. Soft harbor haze — thin drifting translucent bands.
    if (_state.haze && p.haze) {
      _ctx.save(); _ctx.globalCompositeOperation = 'screen';
      for (var b = 0; b < 3; b++) {
        var drift = ((t * (6 + b * 3)) % (_w + 240)) - 120;
        var y = _h * (0.42 + b * 0.16) + Math.sin(t * 0.2 + b) * 6;
        var grad = _ctx.createLinearGradient(drift - 200, 0, drift + 200, 0);
        grad.addColorStop(0, _rgba(p.hazeColor, 0));
        grad.addColorStop(0.5, _rgba(p.hazeColor, 0.10 * k));
        grad.addColorStop(1, _rgba(p.hazeColor, 0));
        _ctx.fillStyle = grad;
        _ctx.fillRect(0, y - 14, _w, 28);
      }
      _ctx.restore();
    }
    // 3. Micro-shimmer — few subtle slow specks/dashes on water-like zones.
    if (_state.shimmer && p.shimmer && _shimmer.length) {
      _ctx.save(); _ctx.globalCompositeOperation = 'screen'; _ctx.strokeStyle = _hex(p.shimmerColor); _ctx.lineWidth = 1;
      for (var i = 0; i < _shimmer.length; i++) {
        var s = _shimmer[i];
        var sx = ((s.x + t * s.spd) % 1) * _w;
        var sy = s.y * _h + Math.sin(t * 0.5 + s.ph) * 3;
        var tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3 + s.ph));   // twinkle
        _ctx.globalAlpha = s.a * tw * k;
        _ctx.beginPath(); _ctx.moveTo(sx, sy); _ctx.lineTo(sx + s.len, sy); _ctx.stroke();
      }
      _ctx.restore(); _ctx.globalAlpha = 1;
    }

    _state.frameCount++;
    _state.lastFrameAt = Date.now();
  }

  function _radial(cx, cy, r, color, alpha) {
    var g = _ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, _rgba(color, Math.max(0, Math.min(1, alpha))));
    g.addColorStop(1, _rgba(color, 0));
    _ctx.save(); _ctx.globalCompositeOperation = 'screen';
    _ctx.fillStyle = g; _ctx.fillRect(0, 0, _w, _h); _ctx.restore();
  }
  function _vignette(amount) {
    if (amount <= 0) return;
    var g = _ctx.createRadialGradient(_w * 0.5, _h * 0.5, Math.min(_w, _h) * 0.35, _w * 0.5, _h * 0.5, Math.max(_w, _h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + Math.max(0, Math.min(0.85, amount)) + ')');
    _ctx.save(); _ctx.globalCompositeOperation = 'multiply';
    _ctx.fillStyle = g; _ctx.fillRect(0, 0, _w, _h); _ctx.restore();
  }

  function _loop() {
    if (!_state.active || !_state.enabled) { _raf = null; return; }   // stop RAF when paused
    try { _draw(); } catch (e) { _state.lastError = 'draw_failed'; }
    _raf = global.requestAnimationFrame(_loop);
  }
  function _startLoop() { if (!_raf && _state.active && _state.enabled) _raf = global.requestAnimationFrame(_loop); }
  function _stopLoop() { if (_raf) { global.cancelAnimationFrame(_raf); _raf = null; } }

  // ── Public API ──────────────────────────────────────────────────────────────
  function start() {
    try {
      if (!_ensureCanvas()) return false;
      _applyPreset(_state.preset, true);
      _state.active = true; _state.lastError = null;
      if (!_resizeBound) { _resizeBound = function () { _resize(); }; try { global.addEventListener('resize', _resizeBound); } catch (e) {} }
      if (_state.enabled) _startLoop(); else { try { _draw(); } catch (e) {} }
      return true;
    } catch (e) { _state.lastError = 'start_failed'; return false; }
  }
  function stop() {
    _stopLoop();
    _state.active = false;
    if (_canvas) { try { if (_ctx) _ctx.clearRect(0, 0, _w, _h); } catch (e) {} _canvas.style.display = 'none'; }
    if (_resizeBound) { try { global.removeEventListener('resize', _resizeBound); } catch (e) {} _resizeBound = null; }
    return true;
  }
  function setEnabled(on) {
    _state.enabled = on !== false;
    if (_state.active && _canvas) _canvas.style.display = _state.enabled ? '' : 'none';
    if (_state.enabled) { if (_state.active) _startLoop(); } else _stopLoop();
    return _state.enabled;
  }
  function isEnabled() { return _state.enabled; }
  function setDebug(on) { _state.debug = on !== false; return _state.debug; }

  function _applyPreset(name, force) {
    var p = PRESETS[name];
    if (!p) return false;
    _state.preset = name;
    _state.intensity = p.intensity;
    _state.waterGlow = p.waterGlow;
    _state.haze = p.haze;
    _state.shimmer = p.shimmer;
    _seedShimmer(p.shimmerCount != null ? p.shimmerCount : DEFAULT_SHIMMER);
    if (name === 'off') { setEnabled(false); }
    else if (force !== true) { if (!_state.enabled) setEnabled(true); }
    return true;
  }
  function setPreset(name) {
    if (!PRESETS[name]) { return false; }
    var ok = _applyPreset(name, false);
    if (ok && _state.active && _state.enabled && _state.preset !== 'off') { _startLoop(); }
    if (ok && _state.active) { try { _draw(); } catch (e) {} }   // immediate visual update
    return ok;
  }
  function getPreset() { return _state.preset; }

  function setIntensity(n) { var v = Number(n); if (isFinite(v)) _state.intensity = Math.max(0, Math.min(2, v)); return _state.intensity; }
  function setWaterGlow(on) { _state.waterGlow = on !== false; return _state.waterGlow; }
  function setHaze(on) { _state.haze = on !== false; return _state.haze; }
  function setShimmer(on) {
    _state.shimmer = on !== false;
    if (_state.shimmer && _shimmer.length === 0) _seedShimmer(DEFAULT_SHIMMER);
    return _state.shimmer;
  }
  function resize() { _resize(); return { w: _w, h: _h, dpr: _dpr }; }
  function renderOnce() {
    if (!_state.active && !_ensureCanvas()) return false;
    try { _draw(); return true; } catch (e) { _state.lastError = 'draw_failed'; return false; }
  }

  function getState() {
    return {
      version: VERSION, active: _state.active, enabled: _state.enabled, debug: _state.debug,
      preset: _state.preset, intensity: _state.intensity,
      waterGlow: _state.waterGlow, haze: _state.haze, shimmer: _state.shimmer,
      overlayMode: _state.overlayMode,
      canvasAttached: !!(_canvas && _canvas.parentNode),
      canvasSize: { w: _w, h: _h },
      dpr: _dpr,
      frameCount: _state.frameCount, shimmerCount: _shimmer.length,
      lastFrameAt: _state.lastFrameAt, lastError: _state.lastError,
    };
  }

  SBE.HarborAtmosphereRuntime = Object.freeze({
    VERSION:      VERSION,
    start:        start,
    stop:         stop,
    setEnabled:   setEnabled,
    isEnabled:    isEnabled,
    setDebug:     setDebug,
    getState:     getState,
    setPreset:    setPreset,
    getPreset:    getPreset,
    setIntensity: setIntensity,
    setWaterGlow: setWaterGlow,
    setHaze:      setHaze,
    setShimmer:   setShimmer,
    resize:       resize,
    renderOnce:   renderOnce,
  });

  console.log('[HarborAtmosphereRuntime] v' + VERSION + ' loaded');
})(window);
