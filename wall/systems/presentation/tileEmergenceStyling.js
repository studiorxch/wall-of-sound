// ── TileEmergenceStyling v1.0.0 ────────────────────────────────────────────────
// 0528AF_WOS_TileEmergenceStylingPass_v1.0.0
// Status: active
// Classification: presentation-emergence-runtime
//
// Purpose:
//   Transforms unresolved tile geometry from a network artifact into an
//   intentional atmospheric presentation layer.
//
//   Three visual states:
//     Unresolved  (conf 0–0.25)  heavy atmospheric veil, haze, shoreline ghost
//     Emerging    (conf 0.25–0.90) soft ghost geometry, signal shimmer
//     Resolved    (conf 0.90–1.0)  normal rendering, no shimmer, full contrast
//
//   The viewer perceives signal acquisition, not network latency.
//
//   Core doctrine:
//     Late-loading tiles are not errors.
//     They are unresolved environmental information.
//     Presentation systems should interpret uncertainty.
//
// Authority:
//   OWNS: shimmer canvas, extrusion opacity EMA, aquarium mode flag
//   READS: MapboxTileTelemetry.getState(), MapboxViewportRuntime
//   CALLS: TraversalContinuityAuthority.setTileEmergenceAlpha()
//          MapboxViewportRuntime.getMap() → setPaintProperty
//   MUST NOT: own veil canvas (TCA authority), mutate route truth,
//             modify TCA's smoothing state, create camera jumps
//
// Placement: wall/systems/presentation/tileEmergenceStyling.js
// Load: AFTER mapboxTileTelemetry.js, traversalContinuityAuthority.js,
//       BEFORE traversalControlDeck.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  // ── Horizon crop veil ─────────────────────────────────────────────────────────
  // Persistent atmospheric gradient concealing the upper 21% of the frame.
  // Always active while the emergence system is running — not gated on confidence.
  // Softens the top of frame where unresolved horizon tiles would otherwise appear.
  // "Not black crop. Atmospheric gradient."

  var HORIZON_CROP_FRAC  = 0.21;   // top fraction of screen covered by crop
  var HORIZON_CROP_ALPHA = 1.0;    // full intensity (curve handles actual opacity)

  // ── Thresholds ─────────────────────────────────────────────────────────────────
  var UNRESOLVED_THRESHOLD = 0.25;   // below: heavy veil, shoreline ghost
  var GHOST_THRESHOLD      = 0.75;   // below: reduce extrusion opacity
  var SHIMMER_THRESHOLD    = 0.60;   // below: shimmer active

  // Aquarium channel emergence multiplier — world benefits from the effect
  var AQUARIUM_MULT = 1.25;

  // ── Smoothing ──────────────────────────────────────────────────────────────────
  // Asymmetric: confidence falls fast (bad conditions respond quickly),
  // rises slowly (recovery takes time — hysteresis prevents flicker).
  var TAU_FALL_MS = 400;    // ~63% convergence in 400ms when getting worse
  var TAU_RISE_MS = 1800;   // ~63% convergence in 1800ms when recovering
  // Effective smoothing window per spec: ~1500ms (average of fall+rise)

  // Extrusion opacity: separate slower EMA (prevents visible per-frame jitter)
  var TAU_OPACITY_MS = 900;

  // ── Canvas ─────────────────────────────────────────────────────────────────────
  // Shimmer canvas sits above the TCA veil canvas (z:7) — inserted later in DOM.
  // z:7 ensures it stays below aircraft layers (z:8+).

  var SHIMMER_CANVAS_Z = 7;

  // Shimmer color — same cool atmospheric blue-grey as the TCA veil
  var SH_R = 148, SH_G = 162, SH_B = 182;

  // Shoreline ghost accent: slight blue-green (cooler than veil, reads as water)
  var SL_R = 120, SL_G = 155, SL_B = 175;

  // ── State ──────────────────────────────────────────────────────────────────────
  var _enabled         = false;
  var _rafId           = null;
  var _lastTs          = 0;
  var _aquariumMode    = false;

  // Raw and smoothed tile confidence
  var _rawConf         = 1.0;
  var _smoothedConf    = 1.0;

  // Extrusion opacity: smoothed separately to avoid per-frame Mapbox API spam
  var _smoothedOpacity    = 1.0;
  var _appliedOpacity     = 1.0;    // last value actually pushed to map
  var _extrusionLayerIds  = null;   // cached after first style scan

  // Shimmer canvas
  var _shimmerCanvas = null;
  var _shimmerCtx    = null;

  // Debug counters
  var _startMs = 0;

  // ── Map access ─────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Raw tile confidence ────────────────────────────────────────────────────────
  // Synthesized from MapboxTileTelemetry state.
  // Output: 0.0 (totally unresolved) → 1.0 (world fully loaded and idle).

  function _computeRawConfidence() {
    var tel = global.SBE && SBE.MapboxTileTelemetry;
    if (!tel) return 1.0;

    var s;
    try { s = tel.getState(); } catch (e) { return 1.0; }

    var tiles = s.tiles;

    // Style not yet loaded → minimal confidence
    var map = _getMap();
    if (map && typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) {
      return 0.08;
    }

    // Map is idle: all tiles resolved
    if (tiles.isIdle) {
      // Even when idle, a very recent pop event means geometry just settled
      var recent = s.popEvents && s.popEvents.recent;
      if (recent && recent.length > 0) {
        var lastPop = recent[recent.length - 1];
        var msSince = Date.now() - (lastPop.ts || 0);
        if (msSince < 3000) {
          // Pop within last 3s: partial recovery — don't snap to 1.0 immediately
          return 0.50 + (msSince / 3000) * 0.50;
        }
      }
      return 1.0;
    }

    // Primary: pending tile count
    // 0 → 1.0, 1 → 0.95, 5 → 0.78, 10 → 0.55, 20 → 0.10
    var pending = Math.max(0, tiles.pending || 0);
    var pendingConf = Math.max(0.05, 1.0 - Math.min(0.95, pending * 0.045));

    // Pop event penalty: recent pop = tiles just resolved noisily
    var popConf = 1.0;
    var popRecent = s.popEvents && s.popEvents.recent;
    if (popRecent && popRecent.length > 0) {
      var lp = popRecent[popRecent.length - 1];
      var elapsed = Date.now() - (lp.ts || 0);
      if (elapsed < 5000) {
        // Pop within 5s: confidence hit that fades over 5s
        popConf = 0.30 + (elapsed / 5000) * 0.70;
      }
    }

    return Math.max(0, Math.min(1, pendingConf * popConf));
  }

  // ── Public: getTileConfidence ──────────────────────────────────────────────────
  // Returns current smoothed tile confidence: 0.0 → 1.0.

  function getTileConfidence() {
    return Math.round(_smoothedConf * 1000) / 1000;
  }

  // ── Smooth confidence with asymmetric EMA ─────────────────────────────────────

  function _smoothConfidence(rawConf, dt) {
    var diff = rawConf - _smoothedConf;
    // Confidence falling (world getting worse) → fast
    // Confidence rising (world recovering) → slow
    var tau = diff < 0 ? TAU_FALL_MS : TAU_RISE_MS;
    var dtClamped = Math.min(dt, 80);
    var alpha = 1 - Math.exp(-dtClamped / tau);
    _smoothedConf += diff * alpha;
    _smoothedConf  = Math.max(0, Math.min(1, _smoothedConf));
  }

  // ── Extrusion opacity: smooth and apply ───────────────────────────────────────
  // Below GHOST_THRESHOLD: reduce fill-extrusion-opacity to ghost building mass.
  // Above: ease back to 1.0.

  function _targetExtrusionOpacity(conf) {
    if (conf >= GHOST_THRESHOLD) return 1.0;

    var mult = _aquariumMode ? AQUARIUM_MULT : 1.0;
    // Linear ramp: at GHOST_THRESHOLD → 1.0, at 0.0 → 0.20
    var base = 0.20 + (conf / GHOST_THRESHOLD) * 0.80;
    // Aquarium: push ghost effect slightly stronger (lower floor)
    if (_aquariumMode) base = Math.max(0.12, base - 0.08);
    // Scale intensity (aquarium pushes the curve toward ghost faster)
    // mult > 1 means we reach ghost state sooner — shift threshold up
    var adjustedConf = conf / Math.max(0.01, GHOST_THRESHOLD / mult);
    base = 0.20 + Math.min(1, adjustedConf) * 0.80;
    if (_aquariumMode) base = Math.max(0.12, base - 0.08);
    return Math.max(0.10, Math.min(1.0, base));
  }

  function _getExtrusionLayers() {
    if (_extrusionLayerIds) return _extrusionLayerIds;
    var map = _getMap();
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return null;
    try {
      var style = map.getStyle();
      if (!style || !style.layers) return null;
      _extrusionLayerIds = [];
      for (var i = 0; i < style.layers.length; i++) {
        if (style.layers[i].type === 'fill-extrusion') {
          _extrusionLayerIds.push(style.layers[i].id);
        }
      }
      return _extrusionLayerIds;
    } catch (e) { return null; }
  }

  function _applyExtrusionOpacity(opacity) {
    // Only push when value has changed meaningfully (avoids spam)
    if (Math.abs(opacity - _appliedOpacity) < 0.008) return;

    var map = _getMap();
    if (!map || !map.isStyleLoaded || !map.isStyleLoaded()) return;

    var layers = _getExtrusionLayers();
    if (!layers || !layers.length) return;

    for (var i = 0; i < layers.length; i++) {
      try {
        map.setPaintProperty(layers[i], 'fill-extrusion-opacity', opacity);
      } catch (e) { /* layer may have been removed */ }
    }
    _appliedOpacity = opacity;
  }

  function _tickExtrusionOpacity(dt) {
    var target = _targetExtrusionOpacity(_smoothedConf);
    var dtClamped = Math.min(dt, 80);
    var alpha = 1 - Math.exp(-dtClamped / TAU_OPACITY_MS);
    _smoothedOpacity += (target - _smoothedOpacity) * alpha;
    _smoothedOpacity  = Math.max(0.10, Math.min(1.0, _smoothedOpacity));
    _applyExtrusionOpacity(_smoothedOpacity);
  }

  // ── Shimmer canvas ─────────────────────────────────────────────────────────────

  function _ensureShimmerCanvas() {
    if (_shimmerCanvas && _shimmerCanvas.parentElement) return true;

    var container = document.querySelector('.mapboxgl-canvas-container') ||
                    document.querySelector('.canvas-area') ||
                    document.body;

    _shimmerCanvas = document.createElement('canvas');
    _shimmerCanvas.id = 'wos-tile-emergence-shimmer';
    _shimmerCanvas.setAttribute('aria-hidden', 'true');
    _shimmerCanvas.style.cssText = [
      'position:absolute', 'inset:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:' + SHIMMER_CANVAS_Z,
    ].join(';');
    container.appendChild(_shimmerCanvas);
    _shimmerCtx = _shimmerCanvas.getContext('2d');
    return true;
  }

  function _resizeShimmerCanvas() {
    if (!_shimmerCanvas || !_shimmerCanvas.parentElement) return;
    var p = _shimmerCanvas.parentElement;
    var w = p.offsetWidth  || 1280;
    var h = p.offsetHeight || 720;
    if (_shimmerCanvas.width !== w || _shimmerCanvas.height !== h) {
      _shimmerCanvas.width  = w;
      _shimmerCanvas.height = h;
    }
  }

  // ── Horizon crop draw ─────────────────────────────────────────────────────────
  // Draws a persistent atmospheric gradient over the top HORIZON_CROP_FRAC of the
  // frame.  Always present while the emergence system is active.
  // Color: very dark blue-grey fading to transparent — atmospheric, not black.

  function _drawHorizonCrop() {
    if (!_shimmerCtx || !_shimmerCanvas) return;
    var w     = _shimmerCanvas.width;
    var h     = _shimmerCanvas.height;
    var cropH = h * HORIZON_CROP_FRAC;

    var grad = _shimmerCtx.createLinearGradient(0, 0, 0, cropH);
    grad.addColorStop(0,    'rgba(6,9,15,0.55)');    // near-black atmospheric at top
    grad.addColorStop(0.25, 'rgba(10,14,22,0.32)');  // dark mid-blue
    grad.addColorStop(0.60, 'rgba(20,28,42,0.12)');  // very subtle blue haze
    grad.addColorStop(0.85, 'rgba(148,162,182,0.04)'); // almost-clear atmospheric
    grad.addColorStop(1,    'rgba(148,162,182,0)');  // fully transparent at crop edge
    _shimmerCtx.fillStyle = grad;
    _shimmerCtx.fillRect(0, 0, w, cropH);
  }

  // ── Shimmer draw ───────────────────────────────────────────────────────────────
  // Underwater pressure distortion — slow drift, barely visible, never cyberpunk.
  // Three visual modes:
  //   UNRESOLVED (conf < 0.25):  shoreline ghost glow + heavy pressure bands
  //   EMERGING   (conf < 0.60):  subtle drifting bands
  //   RESOLVED   (conf ≥ 0.60):  canvas cleared

  function _drawShimmer(ts) {
    if (!_shimmerCtx || !_shimmerCanvas) return;

    var w    = _shimmerCanvas.width;
    var h    = _shimmerCanvas.height;
    // NOTE: clearRect called by _frame() before this — do not clear here again.

    var conf = _smoothedConf;
    if (conf >= SHIMMER_THRESHOLD) return;

    var mult = _aquariumMode ? AQUARIUM_MULT : 1.0;

    // Shimmer intensity: 0 at SHIMMER_THRESHOLD, max at conf=0
    var intensity = Math.min(1, ((SHIMMER_THRESHOLD - conf) / SHIMMER_THRESHOLD) * mult);
    if (intensity < 0.005) return;

    // ── Pressure distortion bands: slow horizontal drift ──────────────────────
    // Four bands drift at slightly different rates (beats between them)
    var phaseBase = (ts / 9000) * Math.PI * 2;   // full cycle every 9s
    var numBands  = 4;

    for (var i = 0; i < numBands; i++) {
      // Each band has a different phase offset and drift rate
      var bandPhase = phaseBase * (0.7 + i * 0.15) + i * 1.4;
      var bandAmp   = 0.35 + i * 0.08;   // bands span different vertical fractions
      var bandY     = h * (0.2 + bandAmp * 0.5 * (Math.sin(bandPhase) + 1) * 0.3);
      var bandH     = h * (0.10 + 0.04 * Math.sin(bandPhase * 0.4));

      // Band alpha: very low — almost invisible
      var alpha = intensity * 0.042 * (0.5 + 0.5 * Math.cos(bandPhase * 0.23 + i));
      if (alpha < 0.003) continue;

      var grad = _shimmerCtx.createLinearGradient(0, bandY - bandH, 0, bandY + bandH);
      grad.addColorStop(0,   'rgba(' + SH_R + ',' + SH_G + ',' + SH_B + ',0)');
      grad.addColorStop(0.5, 'rgba(' + SH_R + ',' + SH_G + ',' + SH_B + ',' + alpha.toFixed(4) + ')');
      grad.addColorStop(1,   'rgba(' + SH_R + ',' + SH_G + ',' + SH_B + ',0)');
      _shimmerCtx.fillStyle = grad;
      _shimmerCtx.fillRect(0, bandY - bandH, w, bandH * 2);
    }

    // ── Slow vertical pressure columns (only when deeply unresolved) ──────────
    // Very subtle — reinforces the pressure distortion feel without strobing
    if (conf < 0.40 && intensity > 0.3) {
      var colPhase = (ts / 12000) * Math.PI * 2;   // slower than horizontal
      var numCols  = 3;

      for (var ci = 0; ci < numCols; ci++) {
        var cPhase = colPhase * 0.6 + ci * 2.1;
        var cX     = w * (0.15 + 0.25 * ci + 0.12 * Math.sin(cPhase));
        var cW     = w * 0.09;
        var cAlpha = intensity * 0.022 * (0.4 + 0.6 * Math.abs(Math.sin(cPhase * 0.5)));
        if (cAlpha < 0.002) continue;

        var cGrad = _shimmerCtx.createLinearGradient(cX - cW, 0, cX + cW, 0);
        cGrad.addColorStop(0,   'rgba(' + SH_R + ',' + SH_G + ',' + SH_B + ',0)');
        cGrad.addColorStop(0.5, 'rgba(' + SH_R + ',' + SH_G + ',' + SH_B + ',' + cAlpha.toFixed(4) + ')');
        cGrad.addColorStop(1,   'rgba(' + SH_R + ',' + SH_G + ',' + SH_B + ',0)');
        _shimmerCtx.fillStyle = cGrad;
        _shimmerCtx.fillRect(cX - cW, 0, cW * 2, h);
      }
    }

    // ── Shoreline ghost reveal (only when unresolved, conf < 0.25) ─────────────
    // Subtle blue-green glow along the lower-screen horizon band.
    // Conveys: "something exists here — the world is forming at the water's edge."
    if (conf < UNRESOLVED_THRESHOLD) {
      var shorePhase = (ts / 6000) * Math.PI * 2;
      var shoreIntensity = Math.min(1, (UNRESOLVED_THRESHOLD - conf) / UNRESOLVED_THRESHOLD * mult);
      if (shoreIntensity > 0.01) {
        // Undulating glow at horizon level (lower third of screen)
        var shoreY     = h * (0.68 + 0.04 * Math.sin(shorePhase));
        var shoreHeight = h * 0.12;
        var shoreAlpha = shoreIntensity * 0.065 * (0.6 + 0.4 * Math.cos(shorePhase * 0.7));

        if (shoreAlpha > 0.003) {
          var shoreGrad = _shimmerCtx.createLinearGradient(0, shoreY - shoreHeight, 0, shoreY + shoreHeight);
          shoreGrad.addColorStop(0,    'rgba(' + SL_R + ',' + SL_G + ',' + SL_B + ',0)');
          shoreGrad.addColorStop(0.45, 'rgba(' + SL_R + ',' + SL_G + ',' + SL_B + ',' + (shoreAlpha * 0.9).toFixed(4) + ')');
          shoreGrad.addColorStop(0.55, 'rgba(' + SL_R + ',' + SL_G + ',' + SL_B + ',' + shoreAlpha.toFixed(4) + ')');
          shoreGrad.addColorStop(1,    'rgba(' + SL_R + ',' + SL_G + ',' + SL_B + ',0)');
          _shimmerCtx.fillStyle = shoreGrad;
          _shimmerCtx.fillRect(0, shoreY - shoreHeight, w, shoreHeight * 2);
        }
      }
    }
  }

  // ── Veil coupling ──────────────────────────────────────────────────────────────
  // TCA is the authority on the veil canvas.
  // We feed it a tileEmergenceAlpha that it adds to its own veilStrength.
  // Mapping: conf 0.0 → alpha 1.0, conf 1.0 → alpha 0.0

  function _updateVeilCoupling() {
    var tca = global.SBE && SBE.TraversalContinuityAuthority;
    if (!tca || typeof tca.setTileEmergenceAlpha !== 'function') return;

    var conf = _smoothedConf;
    var mult = _aquariumMode ? AQUARIUM_MULT : 1.0;

    // Emergence alpha is the inverse of confidence
    // Scaled to avoid overwhelming the TCA veil — max contribution 0.65
    var emergenceAlpha = Math.max(0, 1.0 - conf) * mult;
    // Soft-clip: emergence effect is strong in unresolved zone, fades toward ghost zone
    emergenceAlpha = Math.min(1.0, emergenceAlpha);

    tca.setTileEmergenceAlpha(emergenceAlpha);
  }

  // ── rAF loop ───────────────────────────────────────────────────────────────────

  function _frame(ts) {
    if (!_enabled) return;
    _rafId = global.requestAnimationFrame(_frame);

    var dt = _lastTs > 0 ? ts - _lastTs : 16.667;
    _lastTs = ts;
    dt = Math.min(dt, 100);   // clamp to avoid huge leaps after tab-hidden

    // Recompute raw confidence from telemetry
    _rawConf = _computeRawConfidence();

    // Smooth confidence
    _smoothConfidence(_rawConf, dt);

    // Push veil coupling signal to TCA
    _updateVeilCoupling();

    // Tick extrusion opacity EMA and apply to map
    _tickExtrusionOpacity(dt);

    // Canvas: ensure created, resize if needed, then draw
    // Horizon crop is always present; shimmer is confidence-gated.
    if (!_shimmerCanvas || !_shimmerCanvas.parentElement) {
      _ensureShimmerCanvas();
    }
    if (_shimmerCanvas && _shimmerCtx) {
      _resizeShimmerCanvas();
      _shimmerCtx.clearRect(0, 0, _shimmerCanvas.width, _shimmerCanvas.height);
      _drawHorizonCrop();           // always — conceals unresolved upper horizon
      _drawShimmer(ts);             // confidence-gated: skips when conf ≥ threshold
    }
  }

  // ── Shimmer canvas lifecycle ───────────────────────────────────────────────────

  function _removeShimmerCanvas() {
    if (_shimmerCanvas && _shimmerCanvas.parentElement) {
      _shimmerCanvas.parentElement.removeChild(_shimmerCanvas);
    }
    _shimmerCanvas = null;
    _shimmerCtx    = null;
  }

  function _restoreExtrusionOpacity() {
    _smoothedOpacity = 1.0;
    _applyExtrusionOpacity(1.0);
    _appliedOpacity = 1.0;
  }

  // ── Public controls ────────────────────────────────────────────────────────────

  function start() {
    if (_enabled) return;
    _enabled    = true;
    _startMs    = Date.now();
    _lastTs     = 0;
    _smoothedConf    = _computeRawConfidence();
    _smoothedOpacity = 1.0;
    _appliedOpacity  = 1.0;
    _extrusionLayerIds = null;   // re-scan layers on each start (style may have changed)
    // Eagerly create the canvas so horizon crop is visible from frame 1
    _ensureShimmerCanvas();
    _resizeShimmerCanvas();
    _rafId = global.requestAnimationFrame(_frame);
    console.log('[TileEmergenceStyling] v' + VERSION + ' started'
      + (_aquariumMode ? ' [aquarium ×' + AQUARIUM_MULT + ']' : ''));
  }

  function stop() {
    if (!_enabled) return;
    _enabled = false;
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
    _lastTs = 0;

    // Restore extrusion opacity to 1.0 immediately
    _restoreExtrusionOpacity();

    // Clear shimmer canvas
    if (_shimmerCtx && _shimmerCanvas) {
      _shimmerCtx.clearRect(0, 0, _shimmerCanvas.width, _shimmerCanvas.height);
    }
    _removeShimmerCanvas();

    // Zero out TCA's tile emergence signal
    var tca = global.SBE && SBE.TraversalContinuityAuthority;
    if (tca && typeof tca.setTileEmergenceAlpha === 'function') {
      tca.setTileEmergenceAlpha(0);
    }

    console.log('[TileEmergenceStyling] stopped — extrusion opacity restored');
  }

  function setAquariumMode(isAquarium) {
    _aquariumMode = !!isAquarium;
    console.log('[TileEmergenceStyling] aquariumMode →', _aquariumMode,
      _aquariumMode ? '(×' + AQUARIUM_MULT + ' emergence intensity)' : '');
  }

  function getAquariumMode() { return _aquariumMode; }

  function setEnabled(val) {
    if (!!val) { start(); } else { stop(); }
  }

  function getEnabled() { return _enabled; }

  // ── getState ───────────────────────────────────────────────────────────────────

  function getState() {
    var conf     = _smoothedConf;
    var veil     = Math.max(0, 1.0 - conf);
    var shimmer  = conf < SHIMMER_THRESHOLD;

    // Unresolved zones: proxy from tilesPending
    var unresolvedZones = 0;
    try {
      var tel = global.SBE && SBE.MapboxTileTelemetry;
      if (tel) {
        var s = tel.getState();
        unresolvedZones = Math.min(10, Math.ceil((s.tiles.pending || 0) / 3));
      }
    } catch (e) { /* telemetry not ready */ }

    return {
      version:         VERSION,
      enabled:         _enabled,
      aquariumMode:    _aquariumMode,
      confidence:      Math.round(conf * 1000) / 1000,
      rawConfidence:   Math.round(_rawConf * 1000) / 1000,
      veil:            Math.round(veil * 1000) / 1000,
      shimmer:         shimmer,
      unresolvedZones: unresolvedZones,
      extrusionOpacity: Math.round(_smoothedOpacity * 1000) / 1000,
      phase: conf < UNRESOLVED_THRESHOLD ? 'UNRESOLVED'
           : conf < GHOST_THRESHOLD      ? 'EMERGING'
           :                               'RESOLVED',
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.TileEmergenceStyling = Object.freeze({
    VERSION:           VERSION,
    start:             start,
    stop:              stop,
    setEnabled:        setEnabled,
    getEnabled:        getEnabled,
    setAquariumMode:   setAquariumMode,
    getAquariumMode:   getAquariumMode,
    getTileConfidence: getTileConfidence,
    getState:          getState,
  });

  // ── Debug companion ────────────────────────────────────────────────────────────

  global._wos       = global._wos       || {};
  global._wos.debug = global._wos.debug || {};

  function _pad(s, w) {
    s = String(s);
    while (s.length < w) s += ' ';
    return s;
  }

  function _bar(scalar, len) {
    len = len || 20;
    var filled = Math.round(Math.max(0, Math.min(1, scalar)) * len);
    var bar = '';
    for (var i = 0; i < len; i++) bar += i < filled ? '█' : '░';
    return bar;
  }

  var _debugObj = {

    state: function () {
      var s = getState();
      console.group('[TileEmergenceStyling] state()');
      console.log('phase       :', s.phase);
      console.log('confidence  :', s.confidence, '  raw:', s.rawConfidence);
      console.log('conf bar    :', _bar(s.confidence));
      console.log('veil        :', s.veil);
      console.log('shimmer     :', s.shimmer ? 'ON' : 'off');
      console.log('extrusion   :', s.extrusionOpacity);
      console.log('unresZones  :', s.unresolvedZones);
      console.log('aquarium    :', s.aquariumMode ? 'YES (×' + AQUARIUM_MULT + ')' : 'no');
      console.groupEnd();
      return s;
    },

    confidence: function () {
      var c = getTileConfidence();
      var phase = c < UNRESOLVED_THRESHOLD ? 'UNRESOLVED'
                : c < GHOST_THRESHOLD      ? 'EMERGING'
                :                            'RESOLVED';
      console.log('[TileEmergenceStyling] confidence:', c, '|', phase, '|', _bar(c));
      return c;
    },

    start:    start,
    stop:     stop,
    setAquariumMode: setAquariumMode,
  };

  global._wos.debug.tileEmergence = _debugObj;

  // ── Retry guard — ensure binding survives late _wos overwrites ────────────────

  function _bindDebug() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.tileEmergence = _debugObj;
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 250);
  global.setTimeout(_bindDebug, 1000);

  console.log('[TileEmergenceStyling] v' + VERSION + ' loaded');

})(window);
