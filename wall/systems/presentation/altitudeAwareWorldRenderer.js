// ── AltitudeAwareWorldRenderer v1.0.0 ────────────────────────────────────────
// 0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0
// Status: active
// Classification: interpretation-layer / canvas-overlay
//
// Purpose:
//   Reads the lead aircraft's altitude scalar and resolves an AltitudeWorldProfile
//   that describes how the world should look from that altitude.  Renders a
//   canvas overlay (haze, tint, vignette) that subtly shifts the map's perceived
//   altitude context as aircraft climb and descend.
//
//   Altitude bands:
//     ground      — scalar < 0.08   takeoff roll / landed
//     low_climb   — scalar < 0.35   initial climb, terminal area
//     mid_climb   — scalar < 0.70   en-route climb, clear air
//     high_cruise — scalar >= 0.70  cruise altitude, thin air perspective
//     descent     — mirrors climb bands, driven by DESCENT/LANDING lifecycle
//
// Authority:
//   READS:  SBE.AircraftRuntime, SBE.MapboxViewportRuntime (camera only)
//   WRITES: pixels on its own canvas overlay only
//   MUST NOT MUTATE: AircraftRuntime, map style, any maritime system
//
// Placement: wall/systems/presentation/altitudeAwareWorldRenderer.js
// Load: AFTER aircraftRuntime.js, BEFORE main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Constants ─────────────────────────────────────────────────────────────────

  // Altitude scalar thresholds
  var BAND = Object.freeze({
    groundMax:    0.08,
    lowClimbMax:  0.35,
    midClimbMax:  0.70,
    // >= midClimbMax → high_cruise
  });

  // Per-band world profile values.
  // detailFocus:          0–1   how much ground detail to emphasise (high = sharp streets visible)
  // infrastructureFocus:  0–1   road/building contrast weight
  // aerialHaze:           0–1   haze overlay opacity
  // buildingOpacity:      0–1   (informational; consumers can apply)
  // buildingContrast:     0–1
  // maritimeOpacity:      0–1
  // routeTraceOpacity:    0–1   aircraft route trace visibility
  // influenceFieldOpacity:0–1   airspace influence field visibility
  // worldTint:            { r, g, b, a } — canvas overlay tint
  // horizonLift:          0–1   shifts perceived horizon upward (high = more sky)

  var BAND_PROFILES = Object.freeze({
    ground: Object.freeze({
      band:                 'ground',
      detailFocus:          1.00,
      infrastructureFocus:  1.00,
      aerialHaze:           0.00,
      buildingOpacity:      1.00,
      buildingContrast:     1.00,
      maritimeOpacity:      1.00,
      routeTraceOpacity:    1.00,
      influenceFieldOpacity:0.30,
      worldTint:            Object.freeze({ r: 0,   g: 0,   b: 0,   a: 0.00 }),
      horizonLift:          0.00,
    }),
    low_climb: Object.freeze({
      band:                 'low_climb',
      detailFocus:          0.75,
      infrastructureFocus:  0.80,
      aerialHaze:           0.04,
      buildingOpacity:      0.95,
      buildingContrast:     0.90,
      maritimeOpacity:      0.95,
      routeTraceOpacity:    0.85,
      influenceFieldOpacity:0.55,
      worldTint:            Object.freeze({ r: 200, g: 220, b: 255, a: 0.03 }),
      horizonLift:          0.08,
    }),
    mid_climb: Object.freeze({
      band:                 'mid_climb',
      detailFocus:          0.45,
      infrastructureFocus:  0.55,
      aerialHaze:           0.09,
      buildingOpacity:      0.80,
      buildingContrast:     0.70,
      maritimeOpacity:      0.85,
      routeTraceOpacity:    0.55,
      influenceFieldOpacity:0.80,
      worldTint:            Object.freeze({ r: 185, g: 210, b: 255, a: 0.06 }),
      horizonLift:          0.18,
    }),
    high_cruise: Object.freeze({
      band:                 'high_cruise',
      detailFocus:          0.18,
      infrastructureFocus:  0.30,
      aerialHaze:           0.16,
      buildingOpacity:      0.55,
      buildingContrast:     0.45,
      maritimeOpacity:      0.70,
      routeTraceOpacity:    0.20,
      influenceFieldOpacity:1.00,
      worldTint:            Object.freeze({ r: 160, g: 195, b: 255, a: 0.10 }),
      horizonLift:          0.32,
    }),
  });

  // ── State ─────────────────────────────────────────────────────────────────────

  var _enabled    = true;
  var _mode       = 'auto';       // 'auto' | 'ground' | 'low' | 'mid' | 'high' | 'descent'
  var _canvas     = null;
  var _ctx        = null;
  var _rafId      = null;
  var _lastBand   = null;
  var _lerpT      = 0;            // 0→1 transition progress
  var _fromProfile= null;         // profile we're blending from
  var _toProfile  = null;         // profile we're blending to

  var LERP_SPEED = 0.018;         // per frame (≈60fps ≈ ~55 frames to cross)

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _art() { return global.SBE && SBE.AircraftRuntime; }

  function _getCamera() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (mvr && mvr.getCamera) return mvr.getCamera();
    return { zoom: 12, pitch: 0, bearing: 0 };
  }

  // ── resolveAltitudeBand(aircraft) ────────────────────────────────────────────
  // Returns band name string from aircraft state + scalar.

  function resolveAltitudeBand(aircraft) {
    if (!aircraft) return 'ground';
    var scalar = aircraft.altitudeScalar || 0;
    var state  = aircraft.lifecycleState || 'PARKED';

    // Descent phases mirror climb but use scalar as-is (it falls from 1→0)
    if (state === 'DESCENT' || state === 'LANDING') {
      if (scalar >= BAND.midClimbMax)  return 'high_cruise';
      if (scalar >= BAND.lowClimbMax)  return 'mid_climb';
      if (scalar >= BAND.groundMax)    return 'low_climb';
      return 'ground';
    }
    if (state === 'PARKED' || state === 'COMPLETE' || state === 'DORMANT') return 'ground';
    if (scalar < BAND.groundMax)   return 'ground';
    if (scalar < BAND.lowClimbMax) return 'low_climb';
    if (scalar < BAND.midClimbMax) return 'mid_climb';
    return 'high_cruise';
  }

  // ── getLeadAircraft() ────────────────────────────────────────────────────────

  function getLeadAircraft() {
    var art = _art();
    if (!art) return null;
    var list = art.getActiveAircraft();
    if (!list || !list.length) return null;
    // Prefer CRUISE / CLIMB / DESCENT over PARKED
    var best = null;
    var priority = { CRUISE:4, DESCENT:3, CLIMB:3, TAKEOFF_ROLL:2, LANDING:2, PARKED:0, COMPLETE:0, DORMANT:0 };
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var p = priority[e.lifecycleState] || 0;
      if (!best || p > (priority[best.lifecycleState] || 0)) best = e;
    }
    return best;
  }

  // ── resolveAltitudeWorldProfile(aircraft, camera) ────────────────────────────
  // Returns an AltitudeWorldProfile for the given aircraft (or null state if no aircraft).

  function resolveAltitudeWorldProfile(aircraft, camera) {
    var bandName;

    if (_mode !== 'auto') {
      var modeMap = { ground:'ground', low:'low_climb', mid:'mid_climb', high:'high_cruise', descent:'low_climb' };
      bandName = modeMap[_mode] || 'ground';
    } else {
      bandName = resolveAltitudeBand(aircraft);
    }

    var base = BAND_PROFILES[bandName] || BAND_PROFILES.ground;

    // If there's an active lerp transition, blend from→to
    if (_fromProfile && _toProfile && _lerpT < 1.0) {
      return _lerpProfile(_fromProfile, _toProfile, _lerpT);
    }

    return base;
  }

  // ── _lerpProfile(a, b, t) ─────────────────────────────────────────────────────

  function _lerpProfile(a, b, t) {
    var s = Math.max(0, Math.min(1, t));
    function _lerp(x, y) { return x + (y - x) * s; }
    return {
      band:                 b.band,
      detailFocus:          _lerp(a.detailFocus,          b.detailFocus),
      infrastructureFocus:  _lerp(a.infrastructureFocus,  b.infrastructureFocus),
      aerialHaze:           _lerp(a.aerialHaze,           b.aerialHaze),
      buildingOpacity:      _lerp(a.buildingOpacity,      b.buildingOpacity),
      buildingContrast:     _lerp(a.buildingContrast,     b.buildingContrast),
      maritimeOpacity:      _lerp(a.maritimeOpacity,      b.maritimeOpacity),
      routeTraceOpacity:    _lerp(a.routeTraceOpacity,    b.routeTraceOpacity),
      influenceFieldOpacity:_lerp(a.influenceFieldOpacity,b.influenceFieldOpacity),
      worldTint: {
        r: Math.round(_lerp(a.worldTint.r, b.worldTint.r)),
        g: Math.round(_lerp(a.worldTint.g, b.worldTint.g)),
        b: Math.round(_lerp(a.worldTint.b, b.worldTint.b)),
        a: _lerp(a.worldTint.a, b.worldTint.a),
      },
      horizonLift: _lerp(a.horizonLift, b.horizonLift),
    };
  }

  // ── renderAltitudeWorldOverlay(ctx, profile) ──────────────────────────────────
  // Draws altitude haze + tint + vignette onto provided context.
  // Called each RAF frame by _rafLoop(); exposed for external callers too.

  function renderAltitudeWorldOverlay(ctx, profile) {
    if (!ctx || !profile) return;
    if (!_enabled) return;

    var cW = ctx.canvas.width;
    var cH = ctx.canvas.height;

    ctx.clearRect(0, 0, cW, cH);

    // ── 1. World tint ────────────────────────────────────────────────────────
    var t = profile.worldTint;
    if (t.a > 0.002) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(' + t.r + ',' + t.g + ',' + t.b + ',' + t.a.toFixed(4) + ')';
      ctx.fillRect(0, 0, cW, cH);
      ctx.restore();
    }

    // ── 2. Aerial haze band (top portion of canvas) ───────────────────────────
    if (profile.aerialHaze > 0.002) {
      var hazeH   = Math.round(cH * (0.22 + profile.horizonLift * 0.30));
      var hazeA   = profile.aerialHaze;
      try {
        var hazeGrad = ctx.createLinearGradient(0, 0, 0, hazeH);
        hazeGrad.addColorStop(0,    'rgba(180,210,255,' + (hazeA).toFixed(4) + ')');
        hazeGrad.addColorStop(0.55, 'rgba(180,210,255,' + (hazeA * 0.45).toFixed(4) + ')');
        hazeGrad.addColorStop(1,    'rgba(180,210,255,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = hazeGrad;
        ctx.fillRect(0, 0, cW, hazeH);
        ctx.restore();
      } catch (ex) { /* off-screen gradient; skip */ }
    }

    // ── 3. Edge vignette — deepens with altitude ─────────────────────────────
    var vigA = profile.horizonLift * 0.14;
    if (vigA > 0.003) {
      try {
        var cx = cW / 2;
        var cy = cH / 2;
        var rOuter = Math.sqrt(cx * cx + cy * cy);
        var rInner = rOuter * 0.55;
        var vigGrad = ctx.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
        vigGrad.addColorStop(0,   'rgba(0,0,0,0)');
        vigGrad.addColorStop(1,   'rgba(0,0,0,' + vigA.toFixed(4) + ')');
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = vigGrad;
        ctx.fillRect(0, 0, cW, cH);
        ctx.restore();
      } catch (ex) { /* off-screen radial; skip */ }
    }
  }

  // ── applyAltitudeWorldProfile(profile) ───────────────────────────────────────
  // Writes informational properties to SBE.AltitudeWorldState for other systems
  // to read (AircraftRenderer reads routeTraceOpacity, influenceFieldOpacity).
  // DOES NOT mutate any system; writes only to the shared state object.

  function applyAltitudeWorldProfile(profile) {
    if (!profile) return;
    SBE.AltitudeWorldState = {
      band:                 profile.band,
      detailFocus:          profile.detailFocus,
      infrastructureFocus:  profile.infrastructureFocus,
      aerialHaze:           profile.aerialHaze,
      buildingOpacity:      profile.buildingOpacity,
      buildingContrast:     profile.buildingContrast,
      maritimeOpacity:      profile.maritimeOpacity,
      routeTraceOpacity:    profile.routeTraceOpacity,
      influenceFieldOpacity:profile.influenceFieldOpacity,
      horizonLift:          profile.horizonLift,
    };
  }

  // ── Canvas bootstrap ──────────────────────────────────────────────────────────

  function _initCanvas() {
    if (_canvas) return true;
    var container = document.querySelector('.mapboxgl-canvas-container');
    if (!container) return false;

    _canvas = document.createElement('canvas');
    _canvas.style.position        = 'absolute';
    _canvas.style.top             = '0';
    _canvas.style.left            = '0';
    _canvas.style.width           = '100%';
    _canvas.style.height          = '100%';
    _canvas.style.pointerEvents   = 'none';
    _canvas.style.zIndex          = '7';   // below aircraft (z-index 8)
    _canvas.style.mixBlendMode    = 'normal';
    container.appendChild(_canvas);

    _ctx = _canvas.getContext('2d');
    _resize();
    return true;
  }

  function _resize() {
    if (!_canvas) return;
    var ref = document.querySelector('.mapboxgl-canvas');
    if (ref) {
      _canvas.width  = ref.width;
      _canvas.height = ref.height;
    } else {
      _canvas.width  = window.innerWidth;
      _canvas.height = window.innerHeight;
    }
  }

  // ── RAF loop ──────────────────────────────────────────────────────────────────

  function _rafLoop() {
    _rafId = global.requestAnimationFrame(_rafLoop);

    if (!_enabled) {
      if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      SBE.AltitudeWorldState = null;
      return;
    }

    if (!_canvas && !_initCanvas()) return;

    // Resize if needed
    var ref = document.querySelector('.mapboxgl-canvas');
    if (ref && (_canvas.width !== ref.width || _canvas.height !== ref.height)) _resize();

    // Get lead aircraft
    var lead    = getLeadAircraft();
    var camera  = _getCamera();
    var band    = (_mode !== 'auto')
      ? ({ ground:'ground', low:'low_climb', mid:'mid_climb', high:'high_cruise', descent:'low_climb' }[_mode] || 'ground')
      : resolveAltitudeBand(lead);

    // Detect band change → start lerp
    if (band !== _lastBand) {
      _fromProfile = _lastBand ? (BAND_PROFILES[_lastBand] || BAND_PROFILES.ground) : BAND_PROFILES.ground;
      _toProfile   = BAND_PROFILES[band] || BAND_PROFILES.ground;
      _lerpT       = 0;
      _lastBand    = band;
    }

    // Advance lerp
    if (_lerpT < 1.0) _lerpT = Math.min(1.0, _lerpT + LERP_SPEED);

    var profile = resolveAltitudeWorldProfile(lead, camera);
    applyAltitudeWorldProfile(profile);
    renderAltitudeWorldOverlay(_ctx, profile);
  }

  // ── Mode / Enabled API ────────────────────────────────────────────────────────

  function setEnabled(val) {
    _enabled = !!val;
    console.log('[AltitudeAwareWorldRenderer] enabled:', _enabled);
  }

  function setMode(mode) {
    var valid = { auto:1, ground:1, low:1, mid:1, high:1, descent:1 };
    if (!valid[mode]) {
      console.warn('[AltitudeAwareWorldRenderer] unknown mode:', mode, '— valid: auto | ground | low | mid | high | descent');
      return;
    }
    _mode = mode;
    // Reset lerp on manual mode change
    _fromProfile = null;
    _toProfile   = null;
    _lerpT       = 1.0;
    _lastBand    = null;
    console.log('[AltitudeAwareWorldRenderer] mode →', mode);
  }

  function getState() {
    return {
      enabled:  _enabled,
      mode:     _mode,
      lastBand: _lastBand,
      lerpT:    _lerpT,
      state:    SBE.AltitudeWorldState || null,
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────────────

  function init() {
    if (_rafId) return;
    _rafId = global.requestAnimationFrame(_rafLoop);
    console.log('[AltitudeAwareWorldRenderer] v' + VERSION + ' RAF loop started');
  }

  // Auto-start after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    global.setTimeout(init, 0);
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.AltitudeAwareWorldRenderer = Object.freeze({
    VERSION:                    VERSION,
    init:                       init,
    setEnabled:                 setEnabled,
    setMode:                    setMode,
    getState:                   getState,
    getLeadAircraft:            getLeadAircraft,
    resolveAltitudeBand:        resolveAltitudeBand,
    resolveAltitudeWorldProfile:resolveAltitudeWorldProfile,
    applyAltitudeWorldProfile:  applyAltitudeWorldProfile,
    renderAltitudeWorldOverlay: renderAltitudeWorldOverlay,
    BAND:                       BAND,
    BAND_PROFILES:              BAND_PROFILES,
  });

  console.log('[AltitudeAwareWorldRenderer] v' + VERSION + ' loaded');

})(window);
