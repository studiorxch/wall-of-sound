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

  // ── 0522Q: Constitutional Precision Freeze — renderer constants ───────────
  // These mirror the AISRuntime frozen values. Derive from AISRuntime at runtime
  // if available; fall back to these local copies. Do NOT compute from frame dt.

  var MR_FIXED_TIMESTEP_SEC        = 0.05;   // matches AISRuntime FIXED_TIMESTEP_SEC
  var MAX_HOLD_DURATION_MS         = 100;    // frozen — MARITIME_RUNTIME_BACKPRESSURE trigger
  var MAX_RENDER_DIVERGENCE_M      = 5;      // frozen — soft divergence threshold
  var HARD_RENDER_DIVERGENCE_M     = 10;     // frozen — MARITIME_RENDER_DIVERGENCE_FAULT trigger
  var FAULT_RECOVERY_FRAMES        = 3;      // frozen — frames of healthy state before fault exits
  var RECONCILIATION_ERROR_M       = 100;    // error magnitude that maps t=1 in settling lerp
  var MIN_SETTLING_SEC             = 0.5;    // settling time for small errors (≤0 errorM)
  var MAX_SETTLING_SEC             = 3.0;    // settling time for large errors (≥RECONCILIATION_ERROR_M)
  var OSCILLATION_REVERSAL_MAX     = 2;      // heading sign reversals before OSCILLATION_FAULT
  var OSCILLATION_WINDOW_TICKS     = 20;     // heading sign history window length

  // Decorative motion — disabled in deterministic mode.
  // Decorative motion lives in local render space only; never mutates geographic truth.
  var _decorativeMotionEnabled     = true;

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
  // State-based fallback colors — used when VesselClassPresentation is not
  // available or when state overrides are warranted (emergency, offline).

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

  // ── 0527C: VesselClassPresentation integration ────────────────────────────
  // Resolves class-aware color and silhouette profile via SBE.VesselClassPresentation.
  // Falls back to state-based color if system is unavailable.

  function _resolveClassProfile(vessel, zoom) {
    var vcp = global.SBE && SBE.VesselClassPresentation;
    if (!vcp) return null;
    try {
      return vcp.resolveVesselRenderProfile(vessel, zoom || 12);
    } catch (e) {
      return null;
    }
  }

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

  // Last render timestamp (for debug snapshot freshness check)
  var _lastRenderMs = 0;

  // Harbor debug log throttle — log each vessel at most once per 2s
  var _harborDebugLogMs = {};

  // MARITIME_RUNTIME_BACKPRESSURE console throttle — same vessel/state at most once per 10s.
  // Keyed by "<mmsi>::<state>". Does not affect fault roster push or other fault types.
  var _backpressureWarnAt = {};

  // Debug flags
  var _debugScalars      = false;
  var _debugInterpolation= false;
  var _debugLifecycle    = false;

  // Harbor debug visual controls
  // _marineDebugVisible — when false, harbor mode draws the hull with normal
  //   vessel colors and no cyan override (grounded hull still active).
  // _marineDebugScale   — multiplier applied to lenM/widM in harbor debug path.
  //   1.0 = true-to-life, up to 3.0 for visibility testing. Default: 1.0.
  var _marineDebugVisible = true;
  var _marineDebugScale   = 1.0;

  // Per-vessel render branch log — populated each frame, read by getRenderBranches().
  // Key: MMSI string. Value: { mmsi, lod, pitch, branch: 'geoHull'|'sprite'|'dot' }
  var _lastRenderBranches = {};

  // ── Geographic bearing offset ─────────────────────────────────────────────
  // Returns {lat, lng} offset from a point by bearing (degrees from N) and
  // distance in meters. Haversine-accurate — same formula as AISRuntime.
  // Used to compute vessel hull corners in geographic space so that
  // map.project() bakes in the current pitch/tilt perspective.

  function _geoBearingOffset(lat, lng, bearingDeg, distM) {
    var R    = 6371000;
    var brg  = bearingDeg * Math.PI / 180;
    var latR = lat * Math.PI / 180;
    var dR   = distM / R;
    var lat2 = Math.asin(
      Math.sin(latR) * Math.cos(dR) +
      Math.cos(latR) * Math.sin(dR) * Math.cos(brg)
    );
    var lng2 = (lng * Math.PI / 180) + Math.atan2(
      Math.sin(brg) * Math.sin(dR) * Math.cos(latR),
      Math.cos(dR) - Math.sin(latR) * Math.sin(lat2)
    );
    return { lat: lat2 * 180 / Math.PI, lng: lng2 * 180 / Math.PI };
  }

  // ── Project a geographic point to screen ──────────────────────────────────
  // Convenience wrapper: returns null on bad coords.

  function _projectGeo(lat, lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    return mvr.project([lng, lat]);
  }

  // ── Grounded hull draw ────────────────────────────────────────────────────
  // Projects each hull corner individually through map.project() so that
  // the current map pitch/tilt is baked into the polygon shape.
  // This makes the vessel feel grounded in the tilted water plane rather than
  // floating as a screen-space billboard.
  //
  // Hull corners (bearing offsets from vessel center):
  //   bow tip      heading + 0°,    halfLen + bowExt
  //   bow port     heading - 90°,   halfWid  →  then heading + 0°, halfLen * 0.25
  //   bow stbd     heading + 90°,   halfWid  →  then heading + 0°, halfLen * 0.25
  //   stern port   heading + 180°,  halfLen   then heading - 90°,  halfWid
  //   stern stbd   heading + 180°,  halfLen   then heading + 90°,  halfWid

  function _drawGroundedHull(ctx, lat, lng, hdg, lenM, widM, fillStyle, strokeStyle, alpha) {
    var halfLen = lenM * 0.5;
    var halfWid = widM * 0.5;
    var bowExt  = halfLen * 0.35;  // forward bow protrusion

    // Compute hull corner positions in geographic space
    var fwdCenter  = _geoBearingOffset(lat, lng, hdg,        halfLen * 0.25);
    var aftCenter  = _geoBearingOffset(lat, lng, hdg + 180,  halfLen);

    var bowTip     = _geoBearingOffset(lat, lng, hdg,        halfLen + bowExt);
    var bowPort    = _geoBearingOffset(fwdCenter.lat, fwdCenter.lng, hdg - 90,  halfWid);
    var bowStbd    = _geoBearingOffset(fwdCenter.lat, fwdCenter.lng, hdg + 90,  halfWid);
    var sternPort  = _geoBearingOffset(aftCenter.lat, aftCenter.lng, hdg - 90,  halfWid);
    var sternStbd  = _geoBearingOffset(aftCenter.lat, aftCenter.lng, hdg + 90,  halfWid);

    // Project all corners through Mapbox (pitch/tilt perspective applied here)
    var pBow      = _projectGeo(bowTip.lat,    bowTip.lng);
    var pBowPort  = _projectGeo(bowPort.lat,   bowPort.lng);
    var pBowStbd  = _projectGeo(bowStbd.lat,   bowStbd.lng);
    var pSternPort = _projectGeo(sternPort.lat, sternPort.lng);
    var pSternStbd = _projectGeo(sternStbd.lat, sternStbd.lng);

    if (!pBow || !pBowPort || !pBowStbd || !pSternPort || !pSternStbd) return false;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = fillStyle;
    ctx.strokeStyle = strokeStyle || 'rgba(255,255,255,0.5)';
    ctx.lineWidth   = 1.5;

    // Hull polygon — bow-forward chevron grounded in map perspective
    ctx.beginPath();
    ctx.moveTo(pBow.x,       pBow.y);       // bow tip
    ctx.lineTo(pBowPort.x,   pBowPort.y);   // bow port shoulder
    ctx.lineTo(pSternPort.x, pSternPort.y); // stern port
    ctx.lineTo(pSternStbd.x, pSternStbd.y); // stern starboard
    ctx.lineTo(pBowStbd.x,   pBowStbd.y);   // bow starboard shoulder
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
    return true;
  }

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
    // MapboxViewportRuntime.getCamera() is the canonical accessor (§33 ContractGovernance).
    // center is [lng, lat] array per Mapbox convention.
    var cam  = mvr.getCamera ? mvr.getCamera() : null;
    var zoom = cam && typeof cam.zoom   === 'number' ? cam.zoom      : 12;
    var lat  = cam && cam.center        ? cam.center[1]              : 40.70;
    return (40075016.686 * Math.cos(lat * Math.PI / 180)) / (256 * Math.pow(2, zoom));
  }

  // ── World → screen projection ─────────────────────────────────────────────
  // Uses MapboxViewportRuntime.project() — we do not redefine projection truth.
  // _project(lat, lng) — external call signature (args in lat/lng order)
  // _projectGeo(lat, lng) — internal, used by _drawGroundedHull

  function _project(lat, lng) {
    return _projectGeo(lat, lng);
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
  // Includes two-slot truth frame rotation and per-vessel reconciliation state
  // per 0522Q §Renderer Frame Rotation Freeze and §Reconciliation Precision Freeze.

  function _initRenderState(vessel) {
    var now = performance.now();
    var frame = {
      lat:     vessel.lat,
      lng:     vessel.lng,
      heading: vessel.trueHeading,
    };
    return {
      // Interpolated render position (what actually gets drawn)
      lat:     vessel.lat,
      lng:     vessel.lng,
      heading: vessel.trueHeading,
      alpha:   vessel.continuity ? vessel.continuity.continuityAlpha : 1,
      overlayScale: 1.0,

      // ── Two-slot truth frame rotation ──────────────────────────────────────
      // No frame may exist outside this canonical two-slot rotation.
      // Forbidden: historical windows, frame selection, smoothing history.
      previousTruthFrame: null,   // slot A — the prior committed truth
      currentTruthFrame:  frame,  // slot B — the latest committed truth
      lastTruthUpdateMs:  now,

      // ── Critically damped reconciliation velocity (symplectic Euler) ───────
      // Per-axis velocity that critically-damped spring drives toward truth.
      velLat:  0,
      velLng:  0,
      velHdg:  0,

      // ── HOLD state ─────────────────────────────────────────────────────────
      // HOLD: renderer holds currentTruthFrame exactly when no newer frame exists.
      // No extrapolation, no drift, no easing. If hold exceeds MAX_HOLD_DURATION_MS,
      // emit MARITIME_RUNTIME_BACKPRESSURE.
      holdSinceMs: 0,   // 0 = not in HOLD; >0 = ms when HOLD began

      // ── Divergence fault state ──────────────────────────────────────────────
      divergenceFaultActive: false,
      faultRecoveryFrames:   0,    // counts down from FAULT_RECOVERY_FRAMES on recovery

      // ── Oscillation detection ───────────────────────────────────────────────
      // Track sign of heading velocity over a rolling window.
      // If reversals > OSCILLATION_REVERSAL_MAX within window → fault.
      hdgSignHistory:        [],   // ring of +1/-1/0 per tick
      hdgOscReversals:       0,
      oscillationFaultActive:false,
    };
  }

  // ── Critically damped symplectic Euler reconciliation ─────────────────────
  // 0522Q §Reconciliation Precision Freeze — constitutionally frozen.
  //
  // Integration method: SYMPLECTIC EULER (velocity-first).
  //   velocity += acceleration * dt;   ← velocity updated first
  //   position += velocity * dt;       ← position updated from new velocity
  //
  // Forbidden: explicit Euler (position-first), variable-step, adaptive dt.
  //
  // naturalFrequency = 2 / settlingTimeSec  (critically damped)
  // settlingTimeSec  = lerp(MIN, MAX, clamp(errorM / RECONCILIATION_ERROR_M, 0, 1))
  //
  // Returns { value, velocity } — caller must update both.

  function _reconcileAxis(current, target, velocity, settlingTimeSec, dt) {
    var wn           = 2.0 / Math.max(0.01, settlingTimeSec);
    var k            = 2.0 * wn;           // damping coefficient (critically damped)
    var damping      = wn * wn;            // stiffness
    var error        = target - current;
    var acceleration = error * k - velocity * damping;
    // Symplectic Euler: velocity first, then position
    velocity += acceleration * dt;
    current  += velocity * dt;
    return { value: current, velocity: velocity };
  }

  // Angular error: shortest path, returns signed delta in [-180, 180]
  function _angularError(from, to) {
    var d = ((to - from) % 360 + 540) % 360 - 180;
    return d;
  }

  // Distance in meters between two lat/lng pairs (Haversine, fast path)
  function _distanceM(lat1, lng1, lat2, lng2) {
    var R    = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Rotate two-slot truth frame when vessel truth has advanced.
  // Forbidden: historical interpolation windows, frame selection, smoothing history.
  function _rotateTruthFrame(rs, vessel, now) {
    var cf = rs.currentTruthFrame;
    if (!cf) {
      rs.currentTruthFrame  = { lat: vessel.lat, lng: vessel.lng, heading: vessel.trueHeading };
      rs.lastTruthUpdateMs  = now;
      return false; // no prior frame — no rotation
    }
    // Detect truth advancement: position or heading has changed
    var moved = (cf.lat !== vessel.lat || cf.lng !== vessel.lng || cf.heading !== vessel.trueHeading);
    if (moved) {
      rs.previousTruthFrame = cf;
      rs.currentTruthFrame  = { lat: vessel.lat, lng: vessel.lng, heading: vessel.trueHeading };
      rs.lastTruthUpdateMs  = now;
      rs.holdSinceMs        = 0; // exit HOLD
      return true;
    }
    return false; // truth unchanged — HOLD applies
  }

  // ── Reconcile render state toward truth frame ──────────────────────────────
  // Mandatory per-frame call. Replaces old lerp-based _advanceRenderState.
  //
  // On divergence fault: interpolation disabled, renderer snaps to truth.
  // On HOLD timeout: MARITIME_RUNTIME_BACKPRESSURE fault emitted.
  // On oscillation fault: reconciliation velocity reset, heading snapped.

  function _advanceRenderState(rs, vessel, dt) {
    var now = performance.now();
    var c   = vessel.continuity || {};

    // ── Frame rotation ──────────────────────────────────────────────────────
    var advanced = _rotateTruthFrame(rs, vessel, now);
    var cf = rs.currentTruthFrame || { lat: vessel.lat, lng: vessel.lng, heading: vessel.trueHeading };

    // ── HOLD semantics ──────────────────────────────────────────────────────
    // If no new truth frame: HOLD currentTruthFrame exactly. No drift or easing.
    if (!advanced) {
      if (rs.holdSinceMs === 0) rs.holdSinceMs = now;
      var holdMs = now - rs.holdSinceMs;
      if (holdMs > MAX_HOLD_DURATION_MS) {
        // MARITIME_RUNTIME_BACKPRESSURE — emit once per hold event
        _emitRendererFault(vessel.mmsi, 'MARITIME_RUNTIME_BACKPRESSURE', vessel.state);
        rs.holdSinceMs = now; // reset to suppress repeated emission within same hold
      }
      // HOLD: freeze position to currentTruthFrame — no reconciliation advance
      rs.lat     = cf.lat;
      rs.lng     = cf.lng;
      rs.heading = cf.heading;
      rs.velLat  = 0;
      rs.velLng  = 0;
      rs.velHdg  = 0;
      _advanceAlpha(rs, vessel, c, dt);
      return;
    }

    // ── Divergence check ───────────────────────────────────────────────────
    var errorM = _distanceM(rs.lat, rs.lng, cf.lat, cf.lng);

    if (errorM > HARD_RENDER_DIVERGENCE_M && !rs.divergenceFaultActive) {
      _emitRendererFault(vessel.mmsi, 'MARITIME_RENDER_DIVERGENCE_FAULT', vessel.state);
      rs.divergenceFaultActive = true;
      rs.faultRecoveryFrames   = 0;
    }

    if (rs.divergenceFaultActive) {
      // Fault recovery: disable interpolation, snap to truth
      rs.lat     = cf.lat;
      rs.lng     = cf.lng;
      rs.heading = cf.heading;
      rs.velLat  = 0;
      rs.velLng  = 0;
      rs.velHdg  = 0;
      rs.faultRecoveryFrames++;
      if (rs.faultRecoveryFrames >= FAULT_RECOVERY_FRAMES &&
          errorM <= MAX_RENDER_DIVERGENCE_M) {
        rs.divergenceFaultActive = false; // fault exited after healthy frames
      }
      _advanceAlpha(rs, vessel, c, dt);
      return;
    }

    // ── Critically damped reconciliation ───────────────────────────────────
    // settlingTimeSec derived from error magnitude — constitutionally frozen mapping.
    var t = Math.max(0, Math.min(1, errorM / RECONCILIATION_ERROR_M));
    var settlingTimeSec = MIN_SETTLING_SEC + t * (MAX_SETTLING_SEC - MIN_SETTLING_SEC);

    var rLat = _reconcileAxis(rs.lat, cf.lat, rs.velLat, settlingTimeSec, dt);
    var rLng = _reconcileAxis(rs.lng, cf.lng, rs.velLng, settlingTimeSec, dt);
    rs.lat    = rLat.value;    rs.velLat = rLat.velocity;
    rs.lng    = rLng.value;    rs.velLng = rLng.velocity;

    // Heading: reconcile on shortest angular path
    var hdgError    = _angularError(rs.heading, cf.heading);
    var hdgTarget   = rs.heading + hdgError;
    var rHdg        = _reconcileAxis(rs.heading, hdgTarget, rs.velHdg, settlingTimeSec, dt);
    var newHdgVel   = rHdg.velocity;
    rs.heading      = ((rHdg.value % 360) + 360) % 360;
    rs.velHdg       = newHdgVel;

    // ── Oscillation detection ──────────────────────────────────────────────
    // Track sign of heading velocity. If direction reverses > OSCILLATION_REVERSAL_MAX
    // times in the history window, emit fault and snap heading.
    var hdgSign = newHdgVel > 0.001 ? 1 : (newHdgVel < -0.001 ? -1 : 0);
    var hist    = rs.hdgSignHistory;
    if (hist.length >= OSCILLATION_WINDOW_TICKS) hist.shift();
    hist.push(hdgSign);

    var reversals = 0;
    for (var hi = 1; hi < hist.length; hi++) {
      if (hist[hi] !== 0 && hist[hi - 1] !== 0 && hist[hi] !== hist[hi - 1]) reversals++;
    }
    rs.hdgOscReversals = reversals;

    if (reversals > OSCILLATION_REVERSAL_MAX && !rs.oscillationFaultActive) {
      _emitRendererFault(vessel.mmsi, 'RECONCILIATION_OSCILLATION_FAULT', vessel.state);
      rs.oscillationFaultActive = true;
      // Recovery: reset velocity, snap heading to latest AIS truth
      rs.velHdg         = 0;
      rs.heading        = cf.heading;
      rs.hdgSignHistory = [];
    } else if (reversals <= 1) {
      rs.oscillationFaultActive = false; // healthy
    }

    _advanceAlpha(rs, vessel, c, dt);
  }

  // ── Alpha advancement (shared by normal and HOLD paths) ────────────────────
  // Kept as a helper so alpha logic is in one place regardless of HOLD state.

  function _advanceAlpha(rs, vessel, c, dt) {
    var og       = global.SBE && SBE.OverlayGrammar;
    var ogRecord = og ? og.getRecord(vessel.mmsi) : null;

    var targetAlpha;
    if (ogRecord) {
      targetAlpha = vessel.state === 'STATUS_EMERGENCY' ? 1.0 : ogRecord.projectionOpacity;
    } else {
      if (vessel.state === 'STATUS_FORCED_COAST') {
        targetAlpha = typeof c.coastAlpha === 'number' ? c.coastAlpha : 0;
      } else if (vessel.state === 'STATUS_OFFLINE') {
        targetAlpha = 0;
      } else {
        targetAlpha = typeof c.continuityAlpha === 'number' ? c.continuityAlpha : 1;
      }
    }
    rs.overlayScale = ogRecord ? ogRecord.projectionScale : 1.0;

    // Alpha uses simple lerp — it has no physical velocity, only visual continuity.
    var iw     = typeof c.interpolationWeight === 'number' ? c.interpolationWeight : 0.5;
    var factor = _interpFactor(iw, dt);
    rs.alpha   = rs.alpha + (targetAlpha - rs.alpha) * Math.min(1, factor * 2);
  }

  // ── Renderer fault emission ────────────────────────────────────────────────
  // Routes to AISRuntime fault roster if available; logs unconditionally.
  // Silent renderer faults are constitutionally forbidden (0522Q §Fault).

  function _emitRendererFault(mmsi, faultType, lifecycleState) {
    var ais = global.SBE && SBE.AISRuntime;
    if (ais && ais._faultRoster) {
      var roster = ais._faultRoster();
      var entry = {
        mmsi:           mmsi,
        faultType:      faultType,
        timestampMs:    performance.now(),
        lifecycleState: lifecycleState || 'UNKNOWN',
        source:         'MarineRenderer',
      };
      roster.push(entry);
      if (roster.length > 50) roster.shift();
    }
    // MARITIME_RUNTIME_BACKPRESSURE: gate console output to at most once per 10s
    // per vessel/state combination. Fault roster push above is not gated.
    if (faultType === 'MARITIME_RUNTIME_BACKPRESSURE') {
      var _bpKey  = String(mmsi || 'unknown') + '::' + String(lifecycleState || 'unknown');
      var _bpNow  = performance.now();
      var _bpLast = _backpressureWarnAt[_bpKey] || 0;
      if (_bpNow - _bpLast < 10000) return;
      _backpressureWarnAt[_bpKey] = _bpNow;
    }
    console.warn('[MarineRenderer FAULT] ' + faultType, { mmsi: mmsi, state: lifecycleState });
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

  function _drawVessel(ctx, vessel, rs, lod, mpx, harborDebug) {
    var c      = vessel.continuity || {};
    var alpha  = harborDebug ? 1.0 : Math.max(0, Math.min(1, rs.alpha));
    if (!harborDebug && alpha < 0.01) return;

    // Center point — used for dot/capsule LOD and debug overlays
    var pt = _project(rs.lat, rs.lng);
    if (!pt) return;

    var lenM    = vessel.lengthMeters || DEFAULT_VESSEL_LEN_M;
    var widM    = vessel.widthMeters  || DEFAULT_VESSEL_WIDTH_M;
    var hdg     = rs.heading;
    var sigConf = typeof c.signalConfidence === 'number' ? c.signalConfidence : 1;

    // ── 0527C: class-aware color resolution ───────────────────────────────────
    // Emergency and offline states always override class color (safety-critical).
    var _stateOverride = (vessel.state === 'STATUS_EMERGENCY' ||
                          vessel.state === 'STATUS_OFFLINE'   ||
                          vessel.state === 'STATUS_RESTRICTED');

    // Camera — needed by both class profile (zoom) and 2.5D context.
    var _cam527d  = (function () {
      var mvr = global.SBE && SBE.MapboxViewportRuntime;
      return (mvr && mvr.getCamera) ? mvr.getCamera() : { zoom: 12, pitch: 0, bearing: 0 };
    })();

    var _classProf  = _stateOverride ? null : _resolveClassProfile(vessel, _cam527d.zoom);
    var color       = _classProf ? _classProf.color : _vesselColor(vessel.state, sigConf);

    // ── 0527D: 2.5D perspective profile ──────────────────────────────────────
    var _m25d    = global.SBE && SBE.Maritime25DContext;
    var _prof25d = _m25d
      ? _m25d.resolveVessel25DProfile(vessel, _cam527d, _classProf)
      : { enabled: false, tier: 'flat_symbol', useGroundedHull: false,
          compressY: 1.0, distanceAlpha: 1.0,
          shadow: { enabled: false, offsetX: 0, offsetY: 0, alpha: 0, blur: 0 },
          contextDepth: 0 };

    // ── Harbor debug: grounded hull + optional debug overlays ────────────────
    if (harborDebug) {
      // Scale dimensions for validation visibility (1.0 = true-to-life)
      var scaledLen = lenM * _marineDebugScale;
      var scaledWid = widM * _marineDebugScale;

      // Throttled debug log — at most once per 10s per MMSI.
      // Console output gated by flag; internal _harborDebugLogMs always updated.
      // Enable: SBE.runtimeFlags.showMarineDebugLogs = true
      var _nowMs   = performance.now();
      var _mmsiKey = String(vessel.mmsi);
      var _lastMs  = _harborDebugLogMs[_mmsiKey] || 0;
      if (_nowMs - _lastMs > 10000) {
        _harborDebugLogMs[_mmsiKey] = _nowMs;
        var _dbgFlags = global.SBE && global.SBE.runtimeFlags;
        if (_dbgFlags && _dbgFlags.showMarineDebugLogs) {
          console.log('[MARINE DEBUG]', {
            mmsi:      vessel.mmsi,
            lat:       rs.lat.toFixed(5),
            lng:       rs.lng.toFixed(5),
            projected: { x: Math.round(pt.x), y: Math.round(pt.y) },
            alpha:     rs.alpha,
            state:     vessel.state,
            scale:     _marineDebugScale,
          });
        }
      }

      if (_marineDebugVisible) {
        // Screenspace dot — cyan, confirms projection + render pass
        ctx.save();
        ctx.fillStyle   = '#00ffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Grounded hull in cyan
        _drawGroundedHull(
          ctx, rs.lat, rs.lng, hdg, scaledLen, scaledWid,
          'rgba(0, 220, 255, 0.88)', 'rgba(255, 255, 255, 0.9)', alpha
        );

        // Heading ray
        var fwdPt = _projectGeo(
          _geoBearingOffset(rs.lat, rs.lng, hdg, scaledLen * 0.9).lat,
          _geoBearingOffset(rs.lat, rs.lng, hdg, scaledLen * 0.9).lng
        );
        if (fwdPt) {
          ctx.save();
          ctx.strokeStyle = 'rgba(255,255,255,0.7)';
          ctx.lineWidth   = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(fwdPt.x, fwdPt.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      } else {
        // Normal visual style — grounded hull with production colors
        _drawGroundedHull(
          ctx, rs.lat, rs.lng, hdg, scaledLen, scaledWid,
          color, 'rgba(255,255,255,0.25)', alpha
        );
      }

      // Label at center point (screen-stable)
      ctx.save();
      ctx.font        = 'bold 10px monospace';
      ctx.fillStyle   = '#00ffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth   = 3;
      var label = String(vessel.mmsi) + ' ' + (vessel.vesselName || '');
      ctx.strokeText(label, pt.x + 14, pt.y - 10);
      ctx.fillText(label,   pt.x + 14, pt.y - 10);
      ctx.restore();
      return; // debug path — skip normal draw
    }

    // ── Normal render path ────────────────────────────────────────────────────

    var overlayScale = typeof rs.overlayScale === 'number' ? rs.overlayScale : 1.0;
    var lenPx  = Math.max(2, (lenM / mpx) * overlayScale);
    var widPx  = Math.max(1, (widM / mpx) * overlayScale);

    // ── 0527D: apply distance alpha ──────────────────────────────────────────
    // Reduces opacity of far vessels without altering their draw call structure.
    if (_prof25d.enabled && _prof25d.distanceAlpha < 1.0) {
      alpha = alpha * _prof25d.distanceAlpha;
    }

    // ── 0528B: altitude world maritime opacity ────────────────────────────────
    // Softens vessel presence when lead aircraft is at cruise altitude.
    var _awsMarine = global.SBE && SBE.AltitudeWorldState;
    if (_awsMarine && typeof _awsMarine.maritimeOpacity === 'number') {
      alpha = alpha * _awsMarine.maritimeOpacity;
    }

    // ── 0527D: prepare compressY screen-space Y scale ─────────────────────────
    // Compresses hull height in screen Y to match pitched-map perspective.
    // NOT applied when grounded hull is active — geo-projected hull already has
    // pitch baked in by Mapbox's map.project(); double-compressing breaks perspective.
    var _compressY = (_prof25d.enabled && _prof25d.compressY < 0.99 && !_prof25d.useGroundedHull)
      ? _prof25d.compressY
      : 1.0;

    // ── 0527D: class-aware grounded hull dimensions ───────────────────────────
    // Always resolve class-specific L/W multipliers — used by both the hard
    // pitch gate below and the _prof25d.useGroundedHull path further down.
    // Multipliers tune each vessel type so geo-projected silhouettes read
    // correctly on the water plane (barges wider/longer, tugs compact, etc.).
    var _groundedLenM = lenM;
    var _groundedWidM = widM;
    if (_classProf) {
      switch (_classProf.resolvedClass) {
        case 'barge':
        case 'industrial':
          _groundedLenM = lenM * 1.60; _groundedWidM = widM * 0.45; break;
        case 'cargo':
        case 'military':
          _groundedLenM = lenM * 1.35; _groundedWidM = widM * 0.70; break;
        case 'tanker':
          _groundedLenM = lenM * 1.35; _groundedWidM = widM * 0.70; break;
        case 'ferry':
          _groundedLenM = lenM * 1.05; _groundedWidM = widM * 1.15; break;
        case 'tug':
        case 'service':
        case 'pilot':
          _groundedLenM = lenM * 0.80; _groundedWidM = widM * 0.90; break;
        // passenger/cruise/recreational/unknown: use vessel dimensions as-is
      }
    }

    // ── Hard pitch gate (>= 28°) ─────────────────────────────────────────────
    // At pitch >= 28° ALL non-dot vessels MUST render via geo-projected hull.
    //
    // Screen-space silhouettes drawn with ctx.rotate() / ctx.scale() or via
    // drawVesselByClass() appear as upright rockets on a tilted water plane.
    // This gate unconditionally replaces every such path for pitched views.
    //
    // The heading is rotated in geographic space (_geoBearingOffset) before
    // projection — Mapbox.project() then bakes the current pitch/tilt into
    // the resulting polygon so the vessel lies flat on the water plane.
    //
    // Exemptions:
    //   lod === 'dot'            — dots have no orientation; rockets are not a concern
    //   _aboveHorizon === true   — already handled above (returns as far_dash)
    var _camPitch = (_cam527d && typeof _cam527d.pitch === 'number') ? _cam527d.pitch : 0;
    var _hardGeoHull = (_camPitch >= 28 && lod !== 'dot');

    // Record branch for getRenderBranches() / _wos.debug.maritime25d.renderMode()
    _lastRenderBranches[String(vessel.mmsi)] = {
      mmsi:   vessel.mmsi,
      lod:    lod,
      pitch:  _camPitch,
      branch: lod === 'dot' ? 'dot' : (_hardGeoHull ? 'geoHull' : 'sprite'),
    };

    if (_hardGeoHull) {
      var _strokeGeo = _classProf ? (_classProf.strokeColor || 'rgba(255,255,255,0.28)') : 'rgba(255,255,255,0.28)';
      _drawGroundedHull(ctx, rs.lat, rs.lng, hdg, _groundedLenM, _groundedWidM, color, _strokeGeo, alpha);
      // Class debug label (shown regardless of path when flag is active)
      var _rf_hg = global.SBE && SBE.runtimeFlags;
      if (_rf_hg && _rf_hg.showVesselClassDebug && _classProf) {
        ctx.save();
        ctx.font        = '8px monospace';
        ctx.fillStyle   = _classProf.color;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth   = 2.5;
        var _hgLabel = (_classProf.resolvedClass || '?') + '/geo/' +
                       String(Math.round(_camPitch)) + '°';
        ctx.strokeText(_hgLabel, pt.x + 10, pt.y + 3);
        ctx.fillText(_hgLabel,   pt.x + 10, pt.y + 3);
        ctx.restore();
      }
      return;  // hard gate — all screen-space paths skipped
    }

    // ── 0527D: waterline shadow setup ────────────────────────────────────────
    // Dynamic shadow direction based on camera bearing + pitch.
    // Applied to the ctx before hull draw calls; cleared after.
    var _shad = _prof25d.shadow;

    // ── 0527D: horizon fade — screen-Y-based alpha + above-horizon dash cull ──
    // At pitch > 35°, vessels projected above the visual horizon midline are
    // positionally unreliable (they're near/past the vanishing point).
    // Fade to low-alpha dash; vessels just below the horizon get a linear fade.
    var _aboveHorizon  = false;
    var _horizonFadeK  = 1.0;   // 0–1 multiplier applied to alpha
    if (_m25d && _m25d.resolveHorizonFade && !harborDebug) {
      var _canvasH = ctx.canvas ? ctx.canvas.height : 600;
      var _hf      = _m25d.resolveHorizonFade(_cam527d, pt.y, _canvasH);
      _aboveHorizon = _hf.aboveHorizon;
      _horizonFadeK = _hf.fade;
    }

    // Above-horizon vessels: skip all normal draw paths, render as a minimal
    // low-alpha dash so their position is hinted but they don't dominate the view.
    if (_aboveHorizon && lod !== 'dot') {
      var _vcp_h = global.SBE && SBE.VesselClassPresentation;
      if (_vcp_h && _classProf) {
        // Override tier to far_dash, drop alpha dramatically
        var _aboveProf = {
          resolvedClass: _classProf.resolvedClass,
          color:         _classProf.color,
          strokeColor:   _classProf.strokeColor,
          tier:          'far_dash',
          confidence:    _classProf.confidence,
        };
        _vcp_h.drawVesselByClass(ctx, _aboveProf, pt, hdg, Math.min(lenPx, 12), widPx, alpha * 0.18);
      }
      return;  // skip all further rendering for this vessel
    }

    // Apply horizon fade to alpha for vessels in the fade zone below horizon
    if (_horizonFadeK < 0.999) {
      alpha = alpha * _horizonFadeK;
    }

    if (lod === 'dot') {
      // ── Dot — class-colored ────────────────────────────────────────────────
      var vcp_dot = global.SBE && SBE.VesselClassPresentation;
      if (vcp_dot && _classProf) {
        vcp_dot.drawVesselByClass(ctx, _classProf, pt, hdg, lenPx, widPx, alpha);
      } else {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1.5, lenPx * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      }

    } else if (lod === 'capsule') {
      // ── Capsule — class-specific silhouette replaces uniform pill ──────────
      // At high pitch (≥35°) capsule silhouettes also route through grounded hull
      // so they lie on the water plane rather than standing upright in screen space.
      if (_prof25d.useGroundedHull) {
        // Geo-projected hull — pitch already baked in by Mapbox.project()
        _drawGroundedHull(ctx, rs.lat, rs.lng, hdg, _groundedLenM, _groundedWidM, color, _classProf ? _classProf.strokeColor : 'rgba(255,255,255,0.25)', alpha);
      } else {
        var vcp_cap = global.SBE && SBE.VesselClassPresentation;
        if (vcp_cap && _classProf) {
          // 0527D: apply perspective compressY + bearing-aligned waterline shadow
          ctx.save();
          if (_compressY < 0.99) {
            ctx.translate(pt.x, pt.y);
            ctx.scale(1, _compressY);
            ctx.translate(-pt.x, -pt.y);
          }
          if (_shad.enabled) {
            ctx.shadowColor   = 'rgba(0,0,0,' + _shad.alpha + ')';
            ctx.shadowBlur    = _shad.blur;
            ctx.shadowOffsetX = _shad.offsetX;
            ctx.shadowOffsetY = _shad.offsetY;
          }
          vcp_cap.drawVesselByClass(ctx, _classProf, pt, hdg, lenPx, widPx, alpha);
          ctx.restore();
        } else {
          // Fallback: original rounded-rect capsule
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.translate(pt.x, pt.y);
          var hdgRad = hdg * Math.PI / 180;
          ctx.rotate(Math.atan2(-Math.cos(hdgRad), Math.sin(hdgRad)));
          var hL = lenPx * 0.5, hW = Math.max(1, widPx * 0.5);
          ctx.beginPath();
          ctx.roundRect(-hW, -hL, hW * 2, hL * 2, hW);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.restore();
        }
      }

    } else {
      // ── Shape / Full — class silhouette + geographically grounded hull ─────

      // Emissive glow (full LOD only)
      if (lod === 'full' && sigConf > 0.3) {
        ctx.save();
        ctx.globalAlpha = alpha * sigConf * 0.35;
        ctx.shadowColor = color;
        ctx.shadowBlur  = EMISSIVE_BLUR_PX * sigConf;
        ctx.beginPath();
        ctx.ellipse(pt.x, pt.y, lenPx * 0.35, lenPx * 0.2, 0, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.restore();
      }

      // Class-specific silhouette or grounded hull fallback
      var vcp_shp = global.SBE && SBE.VesselClassPresentation;
      if (vcp_shp && _classProf) {
        // 0527D: grounded hull — geo-projected, pitch baked in by Mapbox.project().
        // Uses class-aware dimensions so each vessel type reads correctly on the water plane.
        if (_prof25d.useGroundedHull) {
          _drawGroundedHull(ctx, rs.lat, rs.lng, hdg, _groundedLenM, _groundedWidM, color, _classProf.strokeColor, alpha);
        } else {
          // Near/hero tier: class silhouette with perspective compressY + shadow
          ctx.save();
          if (_compressY < 0.99) {
            ctx.translate(pt.x, pt.y);
            ctx.scale(1, _compressY);
            ctx.translate(-pt.x, -pt.y);
          }
          if (_shad.enabled) {
            ctx.shadowColor   = 'rgba(0,0,0,' + _shad.alpha + ')';
            ctx.shadowBlur    = _shad.blur;
            ctx.shadowOffsetX = _shad.offsetX;
            ctx.shadowOffsetY = _shad.offsetY;
          }
          vcp_shp.drawVesselByClass(ctx, _classProf, pt, hdg, lenPx, widPx, alpha);
          ctx.restore();
        }
      } else {
        _drawGroundedHull(ctx, rs.lat, rs.lng, hdg, lenM, widM, color, 'rgba(255,255,255,0.25)', alpha);
      }

      // Superstructure hint (full LOD, large vessels, no VCP) — legacy path only
      if (lod === 'full' && lenPx > 20 && !vcp_shp) {
        var sL = lenPx * 0.15, sW = lenPx * 0.10;
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.translate(pt.x, pt.y);
        var hdgRad2 = hdg * Math.PI / 180;
        ctx.rotate(Math.atan2(-Math.cos(hdgRad2), Math.sin(hdgRad2)));
        ctx.beginPath();
        ctx.rect(-sW, -sL * 0.5, sW * 2, sL);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fill();
        ctx.restore();
      }

      // Anchor indicator — screen-space dot at center
      if (vessel.state === 'STATUS_ANCHORED' && lenPx > 8) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(2, lenPx * 0.08), 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(130,180,220,0.8)';
        ctx.lineWidth   = Math.max(1, lenPx * 0.04);
        ctx.stroke();
        ctx.restore();
      }

      // Emergency beacon — red ring
      if (vessel.state === 'STATUS_EMERGENCY') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, lenPx * 0.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,56,32,0.7)';
        ctx.lineWidth   = Math.max(1.5, lenPx * 0.06);
        ctx.stroke();
        ctx.restore();
      }
    }

    // ── 0527C: vessel class debug label ──────────────────────────────────────
    var _rf527 = global.SBE && SBE.runtimeFlags;
    if (_rf527 && _rf527.showVesselClassDebug && _classProf && lod !== 'dot') {
      ctx.save();
      ctx.font        = '8px monospace';
      ctx.fillStyle   = _classProf.color;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth   = 2.5;
      var _dbgLabel = (_classProf.resolvedClass || '?') + ' / ' +
                      (_classProf.confidence || '?')[0] + ' / ' +
                      (_classProf.tier || '?').replace('_', '-');
      ctx.strokeText(_dbgLabel, pt.x + 10, pt.y + 3);
      ctx.fillText(_dbgLabel,   pt.x + 10, pt.y + 3);
      ctx.restore();
    }

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
    _lastRenderMs = performance.now();
    var ais = global.SBE && SBE.AISRuntime;
    if (!ais) return;

    var vessels = ais.getActiveVessels();
    if (!vessels || vessels.length === 0) return;

    // ── Harbor debug mode: bypass all normal rendering logic ─────────────────
    // When harborBootstrapMode is active, brute-force every vessel to maximum
    // visibility. No alpha attenuation, no LOD suppression, no culling.
    // This is a visibility proof pass — correctness is restored afterwards.
    var _harborDebug = !!(
      global.SBE && SBE.runtimeFlags && SBE.runtimeFlags.harborBootstrapMode
    );

    // (magenta proof marker removed — MarineOverlayCanvasRuntime confirmed working)

    var mpx = _metersPerPixel();
    var lod = _harborDebug ? 'full' : _classifyLOD(mpx);

    // Sort by importance: protected and persistent render last (on top)
    vessels.sort(function (a, b) {
      var ai = (a.isProtected ? 1 : 0) + (a.isPersistent ? 1 : 0);
      var bi = (b.isProtected ? 1 : 0) + (b.isPersistent ? 1 : 0);
      return ai - bi;
    });

    // ── 0527D: Harbor context depth overlay (§ Objective 5) ──────────────────
    // Drawn before wakes + vessels so it sits under all vessel geometry.
    // Provides: horizon haze band, shoreline contrast stripe, near-camera vignette.
    // Only active at significant pitch; resolves to null below threshold.
    var _m25dCtx = global.SBE && SBE.Maritime25DContext;
    if (_m25dCtx && _m25dCtx.drawContextDepthOverlay && ctx.canvas) {
      var _overlayCam = (function () {
        var mvr = global.SBE && SBE.MapboxViewportRuntime;
        return (mvr && mvr.getCamera) ? mvr.getCamera() : { pitch: 0, bearing: 0 };
      })();
      var _overlayData = _m25dCtx.resolveContextDepthOverlay(
        _overlayCam, ctx.canvas.width, ctx.canvas.height
      );
      _m25dCtx.drawContextDepthOverlay(ctx, _overlayData);
    }

    // ── Wake pass (below vessels) ───────────────────────────────────────────
    // 0527D: at high pitch, suppress wakes unless vessel is near (lod === 'full').
    // Wake trails painted on a tilted water plane look like screen-space noise
    // when the camera is steeply pitched — they contradict the grounded hull reads.
    var _wakeCam    = (function () {
      var mvr = global.SBE && SBE.MapboxViewportRuntime;
      return (mvr && mvr.getCamera) ? mvr.getCamera() : { pitch: 0 };
    })();
    var _wakePitch  = (_wakeCam && typeof _wakeCam.pitch === 'number') ? _wakeCam.pitch : 0;
    var _m25dWake   = global.SBE && SBE.Maritime25DContext;
    var _wakeThresh = (_m25dWake && _m25dWake.PITCH) ? _m25dWake.PITCH.wakeSupressMin : 35;
    var _wakeSuppressHigh = (_wakePitch >= _wakeThresh);

    // At high pitch: only draw wakes for full-LOD (near) vessels.
    // At normal pitch: draw for shape + full as usual.
    var _wakeAllowed = !_harborDebug && (lod === 'shape' || lod === 'full') &&
                       (!_wakeSuppressHigh || lod === 'full');

    if (_wakeAllowed) {
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

      if (!_harborDebug) {
        // Normal path: skip vessels below render threshold
        var c = vessel.continuity || {};
        var alpha = vessel.state === 'STATUS_FORCED_COAST'
          ? (c.coastAlpha || 0)
          : (c.continuityAlpha || 1);
        if (alpha < 0.02 && vessel.state !== 'STATUS_EMERGENCY') continue;
      }

      // Initialize or advance interpolated render state (MANDATORY interpolation)
      if (!_renderState[mmsi]) {
        _renderState[mmsi] = _initRenderState(vessel);
      } else {
        _advanceRenderState(_renderState[mmsi], vessel, dt);
      }

      // Harbor debug: force full alpha — bypass OverlayGrammar and continuity attenuation
      if (_harborDebug) {
        _renderState[mmsi].alpha       = 1.0;
        _renderState[mmsi].overlayScale = 1.0;
        // Snap position directly to runtime truth — no interpolation lag
        _renderState[mmsi].lat     = vessel.lat;
        _renderState[mmsi].lng     = vessel.lng;
        _renderState[mmsi].heading = vessel.trueHeading;
      }

      _drawVessel(ctx, vessel, _renderState[mmsi], lod, mpx, _harborDebug);
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
    var ais     = global.SBE && SBE.AISRuntime;
    var vessels = ais ? ais.getActiveVessels() : [];
    var vesselSnap = vessels.map(function (v) {
      var rs = _renderState[String(v.mmsi)];
      return {
        mmsi:    v.mmsi,
        state:   v.state,
        runtime: { lat: v.lat, lng: v.lng, heading: v.trueHeading },
        render:  rs ? { lat: rs.lat, lng: rs.lng, heading: rs.heading, alpha: rs.alpha } : null,
        continuity: v.continuity ? Object.assign({}, v.continuity) : null,
      };
    });
    return {
      initialized:      _initialized,
      renderStateCount: Object.keys(_renderState).length,
      wakeCount:        Object.keys(_wakes).length,
      lastRenderMs:     _lastRenderMs,
      msSinceRender:    _lastRenderMs > 0 ? Math.round(performance.now() - _lastRenderMs) : null,
      vessels:          vesselSnap,
      // Legacy: callers that iterated the return value directly get the array
      length:           vesselSnap.length,
      forEach:          vesselSnap.forEach.bind(vesselSnap),
      filter:           vesselSnap.filter.bind(vesselSnap),
      map:              vesselSnap.map.bind(vesselSnap),
    };
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

    // Returns a copy of the last-frame render branch log.
    // Each entry: { mmsi, lod, pitch, branch: 'geoHull'|'sprite'|'dot' }
    // Read by _wos.debug.maritime25d.renderMode().
    getRenderBranches: function () {
      var out = [];
      var keys = Object.keys(_lastRenderBranches);
      for (var ki = 0; ki < keys.length; ki++) {
        out.push(_lastRenderBranches[keys[ki]]);
      }
      return out;
    },

    // Harbor visual controls
    setMarineDebugVisible: function (on) { _marineDebugVisible = (on !== false); },
    setMarineDebugScale:   function (v)  { _marineDebugScale   = Math.max(0.5, Math.min(3.0, Number(v) || 1.0)); },

    // ── 0522Q: Runtime precision controls ────────────────────────────────────
    setDecorativeMotion: function (on) {
      _decorativeMotionEnabled = (on !== false);
      console.log('[MarineRenderer] decorativeMotion:', _decorativeMotionEnabled);
    },

    // Read reconciliation state for a vessel (debug / telemetry)
    getReconciliationState: function (mmsi) {
      var rs = _renderState[String(mmsi)];
      if (!rs) return null;
      return {
        lat: rs.lat, lng: rs.lng, heading: rs.heading,
        velLat: rs.velLat, velLng: rs.velLng, velHdg: rs.velHdg,
        holdSinceMs: rs.holdSinceMs,
        divergenceFaultActive: rs.divergenceFaultActive,
        oscillationFaultActive: rs.oscillationFaultActive,
        hdgOscReversals: rs.hdgOscReversals,
        faultRecoveryFrames: rs.faultRecoveryFrames,
        truthLat: rs.currentTruthFrame ? rs.currentTruthFrame.lat : null,
        truthLng: rs.currentTruthFrame ? rs.currentTruthFrame.lng : null,
      };
    },

    // Rate-limited egress (§18 / §3 ContractGovernance)
    _canEgress,
  };

})(window);
