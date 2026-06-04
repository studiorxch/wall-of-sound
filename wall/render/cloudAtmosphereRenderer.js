// ── CloudAtmosphereRenderer v1.0.0 ───────────────────────────────────────────
// 0528C_WOS_CloudAtmosphereLayer_v1.0.0
// Status: active
// Classification: renderer
//
// Purpose:
//   Renders animated cloud sheets onto a canvas overlay positioned below
//   aircraft icons (z-index 7.5) and above the altitude world overlay (z-index 7).
//
//   Each cloud sheet is rendered as 10–14 large soft radial-gradient ellipses
//   blended with 'screen' composite.  Shadow blobs use 'multiply' at very low
//   opacity beneath the cloud highlights.  Drift is animated via accumulated
//   canvas translation with seamless wrap.
//
// Z-order:
//   Mapbox map (base)
//   Altitude world overlay  z-index 7.0
//   Cloud shadows           z-index 7.5  ← this canvas, shadow pass
//   Cloud highlights        z-index 7.5  ← same canvas, screen pass
//   Airspace influence glow z-index 8 (aircraft canvas pre-draw)
//   Aircraft icons          z-index 8
//
// Authority:
//   READS:  SBE.CloudAtmosphereLayer, SBE.AltitudeWorldState
//   WRITES: cloud canvas pixels only
//   MUST NOT MUTATE: CloudAtmosphereLayer state, AircraftRuntime, maritime state
//
// Placement: wall/render/cloudAtmosphereRenderer.js
// Load: AFTER cloudAtmosphereLayer.js, BEFORE main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── State ─────────────────────────────────────────────────────────────────────

  var _canvas   = null;
  var _ctx      = null;
  var _rafId    = null;
  var _enabled  = true;

  // Off-screen scratch canvas: cloud highlights (screen blend)
  var _cloudCanvas = null;
  var _cloudCtx    = null;

  // ── Canvas Bootstrap ──────────────────────────────────────────────────────────

  function _initCanvas() {
    if (_canvas) return true;
    var container = document.querySelector('.mapboxgl-canvas-container');
    if (!container) return false;

    _canvas = document.createElement('canvas');
    _canvas.style.position      = 'absolute';
    _canvas.style.top           = '0';
    _canvas.style.left          = '0';
    _canvas.style.width         = '100%';
    _canvas.style.height        = '100%';
    _canvas.style.pointerEvents = 'none';
    _canvas.style.zIndex        = '7.5';
    container.appendChild(_canvas);

    _ctx = _canvas.getContext('2d');

    _cloudCanvas = document.createElement('canvas');
    _cloudCtx    = _cloudCanvas.getContext('2d');

    _resize();
    return true;
  }

  function _resize() {
    if (!_canvas) return;
    var ref = document.querySelector('.mapboxgl-canvas');
    var w   = ref ? ref.width  : window.innerWidth;
    var h   = ref ? ref.height : window.innerHeight;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width      = w;
      _canvas.height     = h;
      _cloudCanvas.width = w;
      _cloudCanvas.height= h;
    }
  }

  // ── Cloud Color Helpers ───────────────────────────────────────────────────────

  // warmth: -1 = cold blue, 0 = neutral white, +1 = warm amber
  function _cloudRGB(warmth) {
    var r = Math.round(235 + warmth * 20);
    var g = Math.round(240 + warmth * 5);
    var b = Math.round(255 - warmth * 30);
    return { r: Math.min(255,r), g: Math.min(255,g), b: Math.min(255,b) };
  }

  function _shadowRGB(warmth) {
    // Cold shadows: dark blue-grey. Warm: dark amber-grey.
    var r = Math.round(35 + warmth * 25);
    var g = Math.round(45 + warmth * 10);
    var b = Math.round(70 - warmth * 20);
    return { r: Math.min(255,r), g: Math.min(255,g), b: Math.min(255,b) };
  }

  // ── _renderSheet(ctx, sheet, cW, cH) ─────────────────────────────────────────
  // Draws one cloud sheet's highlight blobs using 'screen' composite.
  // Cloud highlights are rendered on _cloudCtx, then composited with screen.

  function _renderSheet(ctx, sheet, cW, cH) {
    var op = sheet.opacity;
    if (op < 0.005) return;

    var col    = _cloudRGB(sheet.warmth);
    var blobs  = sheet.blobs;
    var scale  = sheet.scale;
    var kontrast = sheet.contrast;  // 0 = soft, 1 = sharper inner

    // Sheet rect in canvas space (Y band)
    var sheetY = sheet.yFrac * cH;
    var sheetH = sheet.heightFrac * cH;
    var sheetW = cW;

    // Drift wraps horizontally — draw sheet twice for seamless tile
    var dx = sheet.driftX % cW;

    // Use _cloudCanvas as scratch — clear just the sheet band
    _cloudCtx.clearRect(0, sheetY - 20, cW, sheetH + 40);

    for (var pass = -1; pass <= 1; pass++) {
      // pass -1, 0, 1 covers left wrap, center, right wrap
      var offsetX = pass * cW + dx;

      for (var bi = 0; bi < blobs.length; bi++) {
        var blob = blobs[bi];

        var bx   = offsetX + blob.xFrac * sheetW;
        var by   = sheetY  + blob.yFrac * sheetH + sheet.driftY;
        // rxPx: wide horizontal ellipse — large soft mass
        var rxPx = blob.rxFrac * sheetW * scale;
        // ryPx: height of the ellipse (much shorter than width)
        var ryPx = rxPx * (blob.ryFrac * 0.5);   // 0.125–0.35 of rxPx

        // Only draw if blob center is plausibly on-screen
        if (bx + rxPx < -50 || bx - rxPx > cW + 50) continue;

        var blobOpacity = blob.opacity * op;
        if (blobOpacity < 0.004) continue;

        // Soft edge: stop0 full, stop (1-kontrast*0.35) at mid, stop1 zero
        var midStop = 0.40 + kontrast * 0.30;

        try {
          // Scale ctx to make circular gradient into an ellipse
          _cloudCtx.save();
          _cloudCtx.transform(1, 0, 0, ryPx / rxPx, 0, by * (1 - ryPx / rxPx));
          var grad = _cloudCtx.createRadialGradient(bx, by, 0, bx, by, rxPx);
          var cStr = col.r + ',' + col.g + ',' + col.b;
          grad.addColorStop(0,       'rgba(' + cStr + ',' + blobOpacity.toFixed(3) + ')');
          grad.addColorStop(midStop, 'rgba(' + cStr + ',' + (blobOpacity * 0.38).toFixed(3) + ')');
          grad.addColorStop(1,       'rgba(' + cStr + ',0)');
          _cloudCtx.globalCompositeOperation = 'source-over';
          _cloudCtx.fillStyle = grad;
          _cloudCtx.beginPath();
          _cloudCtx.arc(bx, by, rxPx, 0, Math.PI * 2);
          _cloudCtx.fill();
          _cloudCtx.restore();
        } catch (ex) { /* off-screen radial; skip */ }
      }
    }

    // Composite cloud scratch onto main ctx with 'screen' for bright additive look
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(_cloudCanvas, 0, 0);
    ctx.restore();
  }

  // ── _renderShadows(ctx, sheet, cW, cH) ───────────────────────────────────────
  // Shadow pass: same blobs, offset down-right, multiply blend, very low opacity.

  function _renderShadows(ctx, sheet, cW, cH) {
    var sOp = sheet.shadowOpacity;
    if (sOp < 0.004) return;

    var col  = _shadowRGB(sheet.warmth);
    var blobs = sheet.blobs;
    var scale = sheet.scale;

    var sheetY = sheet.yFrac * cH;
    var sheetH = sheet.heightFrac * cH;
    var driftX = sheet.driftX % cW;

    // Shadow offset: shift down and slightly right
    var shadowOffX = 22;
    var shadowOffY = 18;

    _cloudCtx.clearRect(0, sheetY - 30, cW, sheetH + 60);

    for (var pass = -1; pass <= 1; pass++) {
      var offsetX = pass * cW + driftX;

      for (var bi = 0; bi < blobs.length; bi++) {
        var blob = blobs[bi];
        var bx   = offsetX + blob.xFrac * cW  + shadowOffX;
        var by   = sheetY  + blob.yFrac * sheetH + sheet.driftY + shadowOffY;
        var rxPx = blob.rxFrac * cW * scale * 1.15;   // shadows slightly larger
        var ryPx = rxPx * (blob.ryFrac * 0.45);

        if (bx + rxPx < -50 || bx - rxPx > cW + 50) continue;

        var blobOp = blob.opacity * sOp * 0.55;
        if (blobOp < 0.004) continue;

        try {
          _cloudCtx.save();
          _cloudCtx.transform(1, 0, 0, ryPx / rxPx, 0, by * (1 - ryPx / rxPx));
          var grad = _cloudCtx.createRadialGradient(bx, by, 0, bx, by, rxPx);
          var cStr = col.r + ',' + col.g + ',' + col.b;
          grad.addColorStop(0,    'rgba(' + cStr + ',' + blobOp.toFixed(3) + ')');
          grad.addColorStop(0.55, 'rgba(' + cStr + ',' + (blobOp * 0.20).toFixed(3) + ')');
          grad.addColorStop(1,    'rgba(' + cStr + ',0)');
          _cloudCtx.globalCompositeOperation = 'source-over';
          _cloudCtx.fillStyle = grad;
          _cloudCtx.beginPath();
          _cloudCtx.arc(bx, by, rxPx, 0, Math.PI * 2);
          _cloudCtx.fill();
          _cloudCtx.restore();
        } catch (ex) { /* skip */ }
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(_cloudCanvas, 0, 0);
    ctx.restore();
  }

  // ── _renderHorizonHaze(ctx, profile, cW, cH) ─────────────────────────────────
  // Soft atmospheric haze at the horizon line — a broad gradient band.

  function _renderHorizonHaze(ctx, profile, cW, cH) {
    var op = profile.horizonOpacity;
    if (op < 0.005) return;

    // Horizon Y is driven by yBias (lower band = lower horizon fog)
    var horizonY = profile.yBias * cH;
    var bandH    = Math.max(60, cH * (0.15 + profile.ySpread * 0.5));

    var col = _cloudRGB(profile.warmth);
    var cStr = col.r + ',' + col.g + ',' + col.b;

    try {
      var grad = ctx.createLinearGradient(0, horizonY - bandH * 0.4, 0, horizonY + bandH * 0.6);
      grad.addColorStop(0,    'rgba(' + cStr + ',0)');
      grad.addColorStop(0.35, 'rgba(' + cStr + ',' + (op * 0.55).toFixed(3) + ')');
      grad.addColorStop(0.60, 'rgba(' + cStr + ',' + op.toFixed(3) + ')');
      grad.addColorStop(1,    'rgba(' + cStr + ',0)');

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = grad;
      ctx.fillRect(0, horizonY - bandH * 0.4, cW, bandH);
      ctx.restore();
    } catch (ex) { /* skip */ }
  }

  // ── render(ctx) ──────────────────────────────────────────────────────────────
  // Full composite pass. Called by RAF loop using the managed canvas.

  function render(ctx) {
    var cal = global.SBE && SBE.CloudAtmosphereLayer;
    if (!cal || !cal.isEnabled()) return;

    var cW = ctx.canvas.width;
    var cH = ctx.canvas.height;

    ctx.clearRect(0, 0, cW, cH);
    _cloudCtx.clearRect(0, 0, cW, cH);

    var profile = cal.getProfile();
    var sheets  = cal.getSheets();

    // Shadow pass first (multiply — must composite before highlights)
    if (cal.shadowsEnabled()) {
      for (var si = 0; si < sheets.length; si++) {
        _renderShadows(ctx, sheets[si], cW, cH);
      }
    }

    // Horizon haze band
    _renderHorizonHaze(ctx, profile, cW, cH);

    // Cloud highlight sheets (screen — additive brightening)
    for (var hi = 0; hi < sheets.length; hi++) {
      _renderSheet(ctx, sheets[hi], cW, cH);
    }

    // Publish state snapshot
    SBE.CloudAtmosphereState = {
      enabled:         true,
      preset:          cal.getPreset(),
      altitudeBand:    profile.altitudeBand,
      activeSheetCount:sheets.length,
      cloudOpacity:    profile.cloudOpacity,
      shadowOpacity:   profile.shadowOpacity,
      lastRenderMs:    Date.now(),
    };
  }

  // ── RAF loop ──────────────────────────────────────────────────────────────────

  function _rafLoop() {
    _rafId = global.requestAnimationFrame(_rafLoop);

    if (!_enabled) {
      if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      SBE.CloudAtmosphereState = null;
      return;
    }

    if (!_canvas && !_initCanvas()) return;
    _resize();

    var cal = global.SBE && SBE.CloudAtmosphereLayer;
    if (cal) cal.updateDrift(Date.now(), _canvas.width, _canvas.height);

    render(_ctx);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function init() {
    if (_rafId) return;
    _rafId = global.requestAnimationFrame(_rafLoop);
    console.log('[CloudAtmosphereRenderer] v' + VERSION + ' RAF loop started');
  }

  function setEnabled(val) {
    _enabled = !!val;
    console.log('[CloudAtmosphereRenderer] enabled:', _enabled);
  }

  function getCanvas() { return _canvas; }

  // Auto-start — deferred 800ms after first visible frame when possible.
  // Cloud rendering is non-essential at first paint; deferring reduces
  // competition with Mapbox tile fetches during the reveal window.
  function _scheduleInit() {
    var bs = global.SBE && SBE.WOSBootSequencer;
    if (bs && typeof bs.defer === 'function') {
      bs.defer('cloudAtmosphereRenderer.init', init, 800);
    } else {
      init();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _scheduleInit);
  } else {
    global.setTimeout(_scheduleInit, 0);
  }

  SBE.CloudAtmosphereRenderer = Object.freeze({
    VERSION:    VERSION,
    init:       init,
    render:     render,
    setEnabled: setEnabled,
    getCanvas:  getCanvas,
  });

  console.log('[CloudAtmosphereRenderer] v' + VERSION + ' loaded');

})(window);
