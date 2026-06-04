// ── MarineOverlayCanvasRuntime v1.0.0 ─────────────────────────────────────
// 0522L_WOS_MarineOverlayCanvasRuntime_v1.0.0
// Status: canonical
// Classification: render-infrastructure
//
// Owns the dedicated marine overlay canvas (#marine-overlay-canvas).
// Marine rendering is isolated from the legacy #engine-canvas pipeline to
// avoid z-index, clearRect, transform, and compositing interference.
//
// Responsibilities:
//   • canvas creation and attachment to parent container
//   • DPR-correct sizing and resize handling
//   • requestAnimationFrame render loop with dt clamping
//   • context state reset on every frame (globalAlpha, transform, composite)
//   • calling SBE.MarineRenderer.render(ctx, state, dt)
//
// Does NOT own:
//   AIS truth, projection math, vessel lifecycle, continuity state,
//   camera logic, OverlayGrammar
//
// Authority chain:
//   Reads state via injected getState() callback (provided by main.js)
//   Reads vessels via SBE.AISRuntime (through MarineRenderer)
//   Reads projection via SBE.MapboxViewportRuntime (through MarineRenderer)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Runtime state ─────────────────────────────────────────────────────────
  var _canvas       = null;
  var _ctx          = null;
  var _rafId        = null;
  var _enabled      = false;
  var _initialized  = false;
  var _lastFrameMs  = 0;
  var _parentSel    = '.canvas-area';
  var _getState     = null;     // injected by main.js: function() { return state; }

  // ── Canvas setup ──────────────────────────────────────────────────────────

  function _createCanvas() {
    var parent = document.querySelector(_parentSel);
    if (!parent) {
      console.warn('[MarineOverlayCanvasRuntime] parent not found:', _parentSel);
      return false;
    }

    var existing = document.getElementById('marine-overlay-canvas');
    if (existing) existing.parentNode.removeChild(existing);

    var dpr = window.devicePixelRatio || 1;
    var cw  = parent.clientWidth;
    var ch  = parent.clientHeight;

    _canvas        = document.createElement('canvas');
    _canvas.id     = 'marine-overlay-canvas';
    _canvas.width  = Math.round(cw * dpr);
    _canvas.height = Math.round(ch * dpr);
    _canvas.style.cssText = [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'z-index:999998',
      'pointer-events:none',
    ].join(';');

    parent.style.position = 'relative'; // ensure absolute child positioning works
    parent.appendChild(_canvas);

    _ctx = _canvas.getContext('2d');
    console.log('[MarineOverlayCanvasRuntime] canvas created', _canvas.width, '×', _canvas.height, '@' + dpr + 'x');
    return true;
  }

  function _resizeIfNeeded() {
    if (!_canvas) return;
    var parent = document.querySelector(_parentSel);
    if (!parent) return;
    var dpr = window.devicePixelRatio || 1;
    var tw  = Math.round(parent.clientWidth  * dpr);
    var th  = Math.round(parent.clientHeight * dpr);
    if (_canvas.width !== tw || _canvas.height !== th) {
      _canvas.width  = tw;
      _canvas.height = th;
    }
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  function _frame(now) {
    if (!_enabled) { _rafId = null; return; }
    _rafId = requestAnimationFrame(_frame);

    var mr = global.SBE && SBE.MarineRenderer;
    if (!mr || !_ctx) return;

    _resizeIfNeeded();

    var dpr = window.devicePixelRatio || 1;
    var cw  = _canvas.width  / dpr;
    var ch  = _canvas.height / dpr;

    var dt = _lastFrameMs ? Math.min(0.1, (now - _lastFrameMs) / 1000) : 1 / 60;
    _lastFrameMs = now;

    // Hard-reset every frame — no accumulated state from any other system
    _ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    _ctx.globalAlpha = 1;
    _ctx.globalCompositeOperation = 'source-over';
    _ctx.clearRect(0, 0, cw, ch);

    var state = _getState ? _getState() : null;
    mr.render(_ctx, state, dt);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(options) {
    if (_initialized) return;
    _initialized = true;

    if (options) {
      if (options.parentSelector) _parentSel = options.parentSelector;
      if (options.getState)       _getState  = options.getState;
    }

    console.log('[MarineOverlayCanvasRuntime v1.0.0] initialized — parent:', _parentSel);
  }

  function enable(on) {
    on = (on !== false);
    if (on === _enabled) return;
    _enabled = on;

    if (_enabled) {
      if (!_createCanvas()) { _enabled = false; return; }
      _lastFrameMs = 0;
      _rafId = requestAnimationFrame(_frame);
      console.log('[MarineOverlayCanvasRuntime] enabled');
    } else {
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      if (_canvas && _canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
      _canvas = null;
      _ctx    = null;
      console.log('[MarineOverlayCanvasRuntime] disabled');
    }
  }

  function destroy() {
    enable(false);
    _initialized = false;
    _getState    = null;
  }

  function isEnabled()  { return _enabled; }
  function isReady()    { return _initialized && _enabled && !!_canvas; }

  function getDebugSnapshot() {
    var parent  = document.querySelector(_parentSel);
    var ais     = global.SBE && SBE.AISRuntime;
    var mr      = global.SBE && SBE.MarineRenderer;
    var mrSnap  = mr ? mr.getDebugSnapshot() : {};
    var dpr     = window.devicePixelRatio || 1;
    var now     = performance.now();
    return {
      enabled:        _enabled,
      initialized:    _initialized,
      canvasExists:   !!_canvas,
      parentSelector: _parentSel,
      parentSize:     parent ? { w: parent.clientWidth, h: parent.clientHeight } : null,
      canvasSize:     _canvas ? { w: _canvas.width, h: _canvas.height } : null,
      dpr:            dpr,
      lastFrameMs:    _lastFrameMs,
      msSinceFrame:   _lastFrameMs ? Math.round(now - _lastFrameMs) : null,
      vesselCount:    ais ? ais.getActiveVessels().length : 0,
      renderStateCount: mrSnap.renderStateCount || 0,
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.MarineOverlayCanvasRuntime = {
    init,
    enable,
    destroy,
    isEnabled,
    isReady,
    getDebugSnapshot,
  };

})(window);
