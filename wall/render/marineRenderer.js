// ── MarineRenderer v1.0.4 ─────────────────────────────────────────────────
// 0520Q2_WOS_MarineRenderer_v1.0.4
// Status: OFFICIAL — ContractGovernance v1.3.0 compliant
// Dependencies: AISRuntime >= v1.6.1, ProjectionRuntime >= v2.1.0
//
// Pure read-only cinematic interpretation infrastructure.
// Owns: atmospheric presentation, wake rendering, emissive styling,
//       visual interpolation, maritime cinematic translation.
// Does NOT own: lifecycle state, continuity truth, dead reckoning,
//               vessel classification, continuity scalar derivation.
//
// Continuity scalars consumed exclusively from AISRuntime — never recomputed.
// Interpolation between fixed-step sim states is MANDATORY (not optional).
// Renderer MUST NOT mutate AISRuntime state.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ─────────────────────────────────────────────────────────────

  // LOD breakpoints — meters per pixel
  var LOD_DOT_MPX      = 15;   // zoom ≤ 9:  single dot
  var LOD_CAPSULE_MPX  = 4;    // zoom 10-12: small capsule
  var LOD_SHAPE_MPX    = 1.5;  // zoom 13-15: oriented shape + minimal wake
                                // zoom 16+: full wake, emissive

  // Real-world vessel defaults for LOD sizing (meters)
  var DEFAULT_VESSEL_LEN_M   = 60;
  var DEFAULT_VESSEL_WIDTH_M = 12;

  // Interpolation half-lives (continuous-time, §36 ContractGovernance)
  // factor = 1 - Math.exp(-dt / halfLife) — frame-rate independent
  var INTERP_HALF_LIFE_TIGHT  = 0.15;  // seconds — near-synchronous tracking
  var INTERP_HALF_LIFE_LOOSE  = 1.2;   // seconds — aggressive cinematic smoothing

  // Wake trail constants
  var WAKE_MAX_POINTS    = 40;
  var WAKE_POINT_MIN_M   = 8;    // min meters traveled before new wake point

  // Emissive glow constants
  var EMISSIVE_BLUR_PX   = 6;    // glow kernel size at full LOD

  // Event egress rate limit — §18 MarineRenderer / §3 ContractGovernance
  var MAX_EGRESS_HZ      = 2;
  var EGRESS_INTERVAL_MS = 1000 / MAX_EGRESS_HZ;

  // ── Vessel color palette ──────────────────────────────────────────────────

  var PALETTE = {
    underway:   '#e8d5a3',  // warm amber-white
    anchored:   '#8ab4d4',  // muted steel blue
    moored:     '#6a8fa0',  // darker dock blue
    restricted: '#d4a843',  // amber-orange
    emergency:  '#ff3820',  // urgent red
    stale:      '#667788',  // grey-blue mist
    offline:    '#334455',  // deep dim
    coast:      '#b0c8d8',  // fading silver
    wake:       'rgba(180, 210, 240, {a})',
  };

  // ── Render state ──────────────────────────────────────────────────────────

  var _canvas      = null;
  var _ctx         = null;
  var _initialized = false;

  // Per-vessel interpolated render state (MMSI → renderState)
  // This is renderer-local visual state, NOT runtime truth.
  var _renderState = {};

  // Wake trails per vessel (MMSI → Array of {lat, lng, ageSec})
  var _wakes = {};

  // Egress rate limiter
  var _lastEgressMs = 0;

  // Debug flags
  var _debugScalars      = false;
  var _debugInterpolation= false;
  var _debugLifecycle    = false;

  // ── Angle lerp ───────────────────────────────────────────────────────────

  function _lerpAngle(a, b, t) {
    var diff = b - a;
    while (diff >  180) diff -= 360;
    while (diff < -180) diff += 360;
    return a + diff * t;
  }

  // ── Interpolation factor ──────────────────────────────────────────────────
  // §36 ContractGovernance: frame-rate independent continuous-time formula.
  // interpolationWeight controls aggressiveness (0=tight, 1=loose).

  function _interpFactor(interpolationWeight, dt) {
    var halfLife = INTERP_HALF_LIFE_TIGHT +
                   interpolationWeight * (INTERP_HALF_LIFE_LOOSE - INTERP_HALF_LIFE_TIGHT);
    return 1 - Math.exp(-dt / Math.max(0.001, halfLife));
  }

  // ── metersPerPixel ───────────────────────────────────────────────────────
  // ProjectionRuntime is sole authority for projection truth (§33 ContractGovernance).
  // We query MapboxViewportRuntime for zoom + center, then derive mpx.

  function _metersPerPixel() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr) return 10; // safe fallback
    var zoom = mvr.getZoom ? mvr.getZoom() : 12;
    var lat  = mvr.getCenter ? mvr.getCenter().lat : 40.68;
    return (40075016.686 * Math.cos(lat * Math.PI / 180)) / (256 * Math.pow(2, zoom));
  }

  // ── World → screen projection ─────────────────────────────────────────────
  // Uses MapboxViewportRuntime.project() — we do not redefine projection truth.

  function _project(lat, lng) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    return mvr.project(lat, lng);
  }

  // ── LOD classification ────────────────────────────────────────────────────

  function _classifyLOD(mpx) {
    if (mpx >= LOD_DOT_MPX)     return 'dot';
    if (mpx >= LOD_CAPSULE_MPX) return 'capsule';
    if (mpx >= LOD_SHAPE_MPX)   return 'shape';
    return 'full';
  }

  // ── Vessel color ──────────────────────────────────────────────────────────

  function _vesselColor(state, signalConfidence) {
    var base;
    switch (state) {
      case 'STATUS_UNDERWAY':     base = PALETTE.underway;   break;
      case 'STATUS_ANCHORED':     base = PALETTE.anchored;   break;
      case 'STATUS_MOORED':       base = PALETTE.moored;     break;
      case 'STATUS_RESTRICTED':   base = PALETTE.restricted; break;
      case 'STATUS_EMERGENCY':    base = PALETTE.emergency;  break;
      case 'STATUS_STALE':        base = PALETTE.stale;      break;
      case 'STATUS_OFFLINE':      base = PALETTE.offline;    break;
      case 'STATUS_FORCED_COAST': base = PALETTE.coast;      break;
      default:                    base = PALETTE.stale;
    }
    return base;
  }

  // ── Initialize render state for new vessel ────────────────────────────────

  function _initRenderState(vessel) {
    return {
      lat:     vessel.lat,
      lng:     vessel.lng,
      heading: vessel.trueHeading,
      alpha:   vessel.continuity ? vessel.continuity.continuityAlpha : 1,
    };
  }

  // ── Advance interpolated render state ─────────────────────────────────────
  // Mandatory interpolation between fixed-step runtime states.
  // Uses runtime continuity.interpolationWeight for aggressiveness control.
  // Renderer MUST NOT invent trajectories — only smooth runtime truth.

  function _advanceRenderState(rs, vessel, dt) {
    var c      = vessel.continuity || {};
    var iw     = typeof c.interpolationWeight === 'number' ? c.interpolationWeight : 0.5;
    var factor = _interpFactor(iw, dt);

    rs.lat     = rs.lat     + (vessel.lat - rs.lat)         * factor;
    rs.lng     = rs.lng     + (vessel.lng - rs.lng)         * factor;
    rs.heading = _lerpAngle(rs.heading, vessel.trueHeading, factor);

    // Visual alpha: driven by continuityAlpha + coastAlpha (FORCED_COAST)
    var targetAlpha;
    if (vessel.state === 'STATUS_FORCED_COAST') {
      targetAlpha = typeof c.coastAlpha === 'number' ? c.coastAlpha : 0;
    } else if (vessel.state === 'STATUS_OFFLINE') {
      targetAlpha = 0;
    } else {
      targetAlpha = typeof c.continuityAlpha === 'number' ? c.continuityAlpha : 1;
    }
    rs.alpha = rs.alpha + (targetAlpha - rs.alpha) * Math.min(1, factor * 2);
  }

  // ── Wake trail management ─────────────────────────────────────────────────
  // Wake is purely atmospheric — suppressed when staleWeight rises or signal drops.

  function _updateWake(mmsi, rs, vessel, dt) {
    var c = vessel.continuity || {};
    // Suppress wake when vessel is not underway or signal is degraded
    if (vessel.state !== 'STATUS_UNDERWAY') {
      // Fade existing wake
      var wake = _wakes[mmsi];
      if (wake) {
        for (var k = 0; k < wake.length; k++) { wake[k].ageSec += dt; }
        _wakes[mmsi] = wake.filter(function (p) { return p.ageSec < 12; });
      }
      return;
    }

    var staleW = typeof c.staleWeight       === 'number' ? c.staleWeight       : 0;
    var drW    = typeof c.deadReckoningWeight === 'number' ? c.deadReckoningWeight : 1;
    // Suppress if highly stale or DR confidence is low
    if (staleW > 0.8 || drW < 0.15) return;

    if (!_wakes[mmsi]) _wakes[mmsi] = [];
    var trail = _wakes[mmsi];

    // Age existing points
    for (var i = 0; i < trail.length; i++) { trail[i].ageSec += dt; }
    // Evict old points
    _wakes[mmsi] = trail.filter(function (p) { return p.ageSec < 10; });

    // Add new point if vessel has moved enough
    var mpx   = _metersPerPixel();
    var minMPx= WAKE_POINT_MIN_M / Math.max(0.001, mpx);
    if (trail.length === 0 || _distPx(rs, trail[trail.length - 1]) > minMPx) {
      if (_wakes[mmsi].length < WAKE_MAX_POINTS) {
        _wakes[mmsi].push({ lat: rs.lat, lng: rs.lng, ageSec: 0 });
      }
    }
  }

  function _distPx(rs, pt) {
    var a = _project(rs.lat, rs.lng);
    var b = _project(pt.lat, pt.lng);
    if (!a || !b) return 0;
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── Draw wake ─────────────────────────────────────────────────────────────

  function _drawWake(ctx, mmsi, vessel) {
    var trail = _wakes[mmsi];
    if (!trail || trail.length < 2) return;
    var c     = vessel.continuity || {};
    var sigW  = typeof c.signalConfidence    === 'number' ? c.signalConfidence    : 1;
    var drW   = typeof c.deadReckoningWeight === 'number' ? c.deadReckoningWeight : 1;
    var baseA = sigW * drW * 0.4; // wake opacity driven by signal + DR confidence

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    for (var i = 1; i < trail.length; i++) {
      var prev = trail[i - 1];
      var curr = trail[i];
      var pa   = _project(prev.lat, prev.lng);
      var ca   = _project(curr.lat, curr.lng);
      if (!pa || !ca) continue;

      var ageFrac = curr.ageSec / 10; // 0→1 over 10 seconds
      var alpha   = Math.max(0, baseA * (1 - ageFrac));
      var width   = Math.max(0.5, (1 - ageFrac) * 3);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(180, 210, 240, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth   = width;
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(ca.x, ca.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Draw vessel glyph ─────────────────────────────────────────────────────

  function _drawVessel(ctx, vessel, rs, lod, mpx) {
    var c      = vessel.continuity || {};
    var alpha  = Math.max(0, Math.min(1, rs.alpha));
    if (alpha < 0.01) return;

    var pt = _project(rs.lat, rs.lng);
    if (!pt) return;

    var color  = _vesselColor(vessel.state, c.signalConfidence);
    var lenM   = vessel.lengthMeters || DEFAULT_VESSEL_LEN_M;
    var widM   = vessel.widthMeters  || DEFAULT_VESSEL_WIDTH_M;

    // Derive screen pixel sizes from real-world dimensions
    var lenPx  = Math.max(2, lenM  / mpx);
    var widPx  = Math.max(1, widM  / mpx);

    // Emissive glow — derived from signalConfidence (§12 v1.0.4)
    var sigConf = typeof c.signalConfidence === 'number' ? c.signalConfidence : 1;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(pt.x, pt.y);
    // Y-axis: world +y=north, screen +y=down → negate sin
    var hdgRad = rs.heading * Math.PI / 180;
    ctx.rotate(Math.atan2(-Math.cos(hdgRad), Math.sin(hdgRad)));

    if (lod === 'dot') {
      // ── Dot ─────────────────────────────────────────────────────────────
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.5, lenPx * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

    } else if (lod === 'capsule') {
      // ── Small oriented capsule ───────────────────────────────────────────
      var hL = lenPx * 0.5, hW = Math.max(1, widPx * 0.5);
      ctx.beginPath();
      ctx.roundRect(-hW, -hL, hW * 2, hL * 2, hW);
      ctx.fillStyle = color;
      ctx.fill();

    } else {
      // ── Shape (lod='shape' or 'full') ────────────────────────────────────
      // Bow-forward chevron: bow at +y (forward), stern at -y
      var bL = lenPx * 0.5;
      var bW = widPx * 0.5;
      var bowTip = bL * 0.35; // bow protrusion fraction

      // Glow — emissive stability from signalConfidence (§12 v1.0.4)
      if (lod === 'full' && sigConf > 0.3) {
        ctx.save();
        ctx.globalAlpha = alpha * sigConf * 0.35;
        ctx.shadowColor = color;
        ctx.shadowBlur  = EMISSIVE_BLUR_PX * sigConf;
        ctx.beginPath();
        ctx.ellipse(0, 0, bW * 1.4, bL * 0.7, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      }

      // Hull body
      ctx.beginPath();
      ctx.moveTo(0,   bL + bowTip);        // bow tip
      ctx.lineTo(-bW, bL * 0.3);           // bow port shoulder
      ctx.lineTo(-bW, -bL);                // stern port
      ctx.lineTo( bW, -bL);                // stern starboard
      ctx.lineTo( bW, bL * 0.3);           // bow starboard shoulder
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Superstructure / bridge (full LOD only)
      if (lod === 'full' && lenPx > 20) {
        var sL = bL * 0.3, sW = bW * 0.55;
        ctx.beginPath();
        ctx.rect(-sW, -sL * 0.5, sW * 2, sL);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      }

      // Anchor indicator for ANCHORED state
      if (vessel.state === 'STATUS_ANCHORED' && lenPx > 8) {
        ctx.beginPath();
        ctx.arc(0, -bL * 0.6, Math.max(2, lenPx * 0.08), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(130,180,220,0.8)';
        ctx.lineWidth = Math.max(1, lenPx * 0.04);
        ctx.stroke();
      }

      // Emergency beacon — red flash ring
      if (vessel.state === 'STATUS_EMERGENCY') {
        ctx.beginPath();
        ctx.arc(0, 0, lenPx * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,56,32,0.7)';
        ctx.lineWidth   = Math.max(1.5, lenPx * 0.06);
        ctx.stroke();
      }
    }

    ctx.restore();

    // ── Debug overlays ─────────────────────────────────────────────────────
    if (_debugScalars && lod !== 'dot') {
      _drawScalarDebug(ctx, pt, c);
    }
    if (_debugLifecycle && lod !== 'dot') {
      _drawLifecycleDebug(ctx, pt, vessel.state);
    }
    if (_debugInterpolation && lod !== 'dot') {
      _drawInterpolationDebug(ctx, pt, rs, vessel, c);
    }
  }

  // ── Debug rendering ───────────────────────────────────────────────────────

  function _drawScalarDebug(ctx, pt, c) {
    ctx.save();
    ctx.font         = '9px monospace';
    ctx.fillStyle    = 'rgba(255,255,100,0.85)';
    ctx.fillText('sc:'   + (c.signalConfidence    || 0).toFixed(2), pt.x + 12, pt.y - 22);
    ctx.fillText('ca:'   + (c.continuityAlpha     || 0).toFixed(2), pt.x + 12, pt.y - 13);
    ctx.fillText('dr:'   + (c.deadReckoningWeight || 0).toFixed(2), pt.x + 12, pt.y - 4);
    ctx.fillText('iw:'   + (c.interpolationWeight || 0).toFixed(2), pt.x + 12, pt.y + 5);
    ctx.fillStyle    = 'rgba(255,140,80,0.85)';
    ctx.fillText('st:'   + (c.staleWeight         || 0).toFixed(2), pt.x + 12, pt.y + 14);
    ctx.fillText('coast:'+ (c.coastAlpha          || 0).toFixed(2), pt.x + 12, pt.y + 23);
    ctx.restore();
  }

  function _drawLifecycleDebug(ctx, pt, state) {
    var abbrev = (state || '').replace('STATUS_', '').slice(0, 4);
    ctx.save();
    ctx.font      = '8px monospace';
    ctx.fillStyle = 'rgba(100,220,255,0.9)';
    ctx.fillText(abbrev, pt.x - 10, pt.y + 28);
    ctx.restore();
  }

  function _drawInterpolationDebug(ctx, pt, rs, vessel, c) {
    // Draw line from interpolated position to runtime truth position
    var truthPt = _project(vessel.lat, vessel.lng);
    if (!truthPt) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,100,255,0.5)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
    ctx.lineTo(truthPt.x, truthPt.y);
    ctx.stroke();
    ctx.restore();
  }

  // ── Main render ───────────────────────────────────────────────────────────

  function render(ctx, viewport, dt) {
    if (!_initialized) return;
    var ais = global.SBE && SBE.AISRuntime;
    if (!ais) return;

    var vessels = ais.getActiveVessels();
    if (!vessels || vessels.length === 0) return;

    var mpx = _metersPerPixel();
    var lod = _classifyLOD(mpx);

    // Sort by importance: protected and persistent render last (on top)
    vessels.sort(function (a, b) {
      var ai = (a.isProtected ? 1 : 0) + (a.isPersistent ? 1 : 0);
      var bi = (b.isProtected ? 1 : 0) + (b.isPersistent ? 1 : 0);
      return ai - bi;
    });

    // ── Wake pass (below vessels) ───────────────────────────────────────────
    if (lod === 'shape' || lod === 'full') {
      for (var w = 0; w < vessels.length; w++) {
        var vw   = vessels[w];
        var mmsiW = String(vw.mmsi);
        if (!_renderState[mmsiW]) _renderState[mmsiW] = _initRenderState(vw);
        _updateWake(mmsiW, _renderState[mmsiW], vw, dt);
        _drawWake(ctx, mmsiW, vw);
      }
    }

    // ── Vessel pass ─────────────────────────────────────────────────────────
    for (var i = 0; i < vessels.length; i++) {
      var vessel = vessels[i];
      var mmsi   = String(vessel.mmsi);

      // Skip vessels below render threshold
      var c = vessel.continuity || {};
      var alpha = vessel.state === 'STATUS_FORCED_COAST'
        ? (c.coastAlpha || 0)
        : (c.continuityAlpha || 1);
      if (alpha < 0.02 && vessel.state !== 'STATUS_EMERGENCY') continue;

      // Initialize or advance interpolated render state (MANDATORY interpolation)
      if (!_renderState[mmsi]) {
        _renderState[mmsi] = _initRenderState(vessel);
      } else {
        _advanceRenderState(_renderState[mmsi], vessel, dt);
      }

      _drawVessel(ctx, vessel, _renderState[mmsi], lod, mpx);
    }

    // ── Prune render state for evicted vessels ──────────────────────────────
    var activeMMSIs = {};
    for (var j = 0; j < vessels.length; j++) { activeMMSIs[String(vessels[j].mmsi)] = 1; }
    Object.keys(_renderState).forEach(function (k) {
      if (!activeMMSIs[k]) { delete _renderState[k]; delete _wakes[k]; }
    });
  }

  // ── Rate-limited egress helper ────────────────────────────────────────────
  // §18 MarineRenderer / §3 ContractGovernance: 2Hz max per renderer instance.

  function _canEgress() {
    var now = performance.now();
    if (now - _lastEgressMs >= EGRESS_INTERVAL_MS) {
      _lastEgressMs = now;
      return true;
    }
    return false;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized = true;
    console.log('[MarineRenderer v1.0.4] initialized');
  }

  function destroy() {
    _renderState = {};
    _wakes       = {};
    _initialized = false;
  }

  // ── Debug APIs (§16 v1.0.4) ───────────────────────────────────────────────

  function setDebugScalars(enabled)       { _debugScalars       = !!enabled; }
  function setDebugInterpolation(enabled) { _debugInterpolation = !!enabled; }
  function setDebugLifecycle(enabled)     { _debugLifecycle     = !!enabled; }

  function getDebugSnapshot() {
    var ais = global.SBE && SBE.AISRuntime;
    if (!ais) return [];
    return ais.getActiveVessels().map(function (v) {
      var rs = _renderState[String(v.mmsi)];
      return {
        mmsi:    v.mmsi,
        state:   v.state,
        runtime: { lat: v.lat, lng: v.lng, heading: v.trueHeading },
        render:  rs ? { lat: rs.lat, lng: rs.lng, heading: rs.heading, alpha: rs.alpha } : null,
        continuity: v.continuity ? Object.assign({}, v.continuity) : null,
      };
    });
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.MarineRenderer = {
    init,
    destroy,
    render,

    // Debug APIs — §16 MarineRenderer v1.0.4
    setDebugScalars,
    setDebugInterpolation,
    setDebugLifecycle,
    getDebugSnapshot,

    // Rate-limited egress (§18 / §3 ContractGovernance)
    _canEgress,
  };

})(window);
