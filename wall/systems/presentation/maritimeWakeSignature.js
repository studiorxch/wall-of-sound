// ── MaritimeWakeSignature v1.0.1 ──────────────────────────────────────────────
// 0526C_WOS_ActiveWakePolish_v1.0.1 (patches 0526A_WOS_MaritimeWakeSignature_v1.0.0)
// Status: active
// Classification: presentation-layer maritime motion readability system
//
// Core Doctrine:
//   Active wakes communicate live motion.
//   They do not simulate water.
//   Wake polish improves perception.
//   It may not fabricate runtime truth.
//   Class distinction exists for atmospheric observability only.
//
// Canonical Wake Modes:
//   LINEAR      — single center stream, low spread (cargo, passenger)
//   SPLIT_V     — classic two-arm V (ferry, recreational)
//   TURBULENT   — chaotic multi-filament churn (tug, industrial)
//   DRIFT       — asymmetric lateral spread, trailing instability (fishing)
//   DISCIPLINED — narrow suppressed wake, minimal visible disturbance (military)
//
// Vessel Identity Mapping:
//   cargo       → LINEAR        heavy inertia, long trailing center stream
//   tanker      → LINEAR        broad displacement, wide single stream
//   ferry       → SPLIT_V       energetic corridor movement, bright arms
//   tug         → TURBULENT     aggressive turbulence, short bursting filaments
//   recreational → SPLIT_V      playful slicing, tight bright V
//   fishing     → DRIFT         unstable drift, one arm longer than the other
//   passenger   → LINEAR        smooth glide, long attenuating center line
//   military    → DISCIPLINED   minimal visible disturbance, nearly invisible
//   industrial  → TURBULENT     mechanical churn, broad short burst
//   service     → SPLIT_V       working-boat V, moderate spread
//   unknown     → LINEAR        default fallback
//   default     → LINEAR
//
// Integration path:
//   AISRuntime → ProceduralVesselTopology → MaritimeWakeSignature
//   → MaritimeOccupancyRenderer → 2D / 2.5D Presentation
//
// Runtime flags (SBE.runtimeFlags):
//   showMaritimeWakeSignatures  — master on/off (default true)
//   showMaritimeWakeGlow        — glow pass (default true)
//   showMaritimeWakeTurbulence  — turbulence filaments (default true)
//   showMaritimeWakeDebug       — render wake mode label (default false)
//
// Authority boundaries:
//   OWNS: wake mode assignment, wake geometry parameters, draw primitives,
//         visual softness, alpha shaping, gradient tapering, line width
//         clamping, zoom visibility thresholds, deterministic visual jitter,
//         class-specific visual polish parameters.
//   MAY OBSERVE: vessel class, speed, zoom, tier, renderer palette.
//   MAY NOT MUTATE: AIS truth, vessel coordinates, population hierarchy,
//     atmosphere state, camera targets, renderer frame state,
//     WaterMemory state.
//
// WaterMemory policy:
//   SBE.runtimeFlags.showMaritimeWaterMemory = false  (default, never revived here)
//   MWM stamp hook fires only when strictly true.
//
// Deterministic variation:
//   All variation seeds derive from opts.seed (preferred: MMSI → vesselId → 0).
//   Math.random() is forbidden.
//
// Placement: wall/systems/presentation/maritimeWakeSignature.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.1';

  // ── System Constants ──────────────────────────────────────────────────────────
  var DEFAULT_WAKE_MIN_ZOOM      = 11.6;
  var DEFAULT_WAKE_FULL_ZOOM     = 13.0;
  var MAX_ACTIVE_WAKE_ALPHA      = 0.48;
  var MAX_ACTIVE_WAKE_GLOW_ALPHA = 0.16;
  var MAX_WAKE_LINE_WIDTH_PX     = 5.5;
  var MIN_WAKE_LINE_WIDTH_PX     = 0.75;
  var MAX_TURBULENCE_FILAMENTS   = 5;

  // ── Wake Mode Constants ───────────────────────────────────────────────────────
  var MODE_LINEAR      = 'LINEAR';
  var MODE_SPLIT_V     = 'SPLIT_V';
  var MODE_TURBULENT   = 'TURBULENT';
  var MODE_DRIFT       = 'DRIFT';
  var MODE_DISCIPLINED = 'DISCIPLINED';

  var VALID_MODES = Object.freeze([
    MODE_LINEAR, MODE_SPLIT_V, MODE_TURBULENT, MODE_DRIFT, MODE_DISCIPLINED,
  ]);

  // ── Wake Profile Schema ───────────────────────────────────────────────────────
  //
  //   mode               — wake draw archetype
  //   spreadDeg          — half-angle of wake arms (degrees from stern axis)
  //   lengthScale        — length multiplier over speed-derived base length
  //   asymmetry          — DRIFT lateral offset bias (0..1, +ve = starboard)
  //   alphaScale         — overall alpha multiplier applied to incoming alpha
  //   nearSternAlpha     — direct alpha at the near-stern gradient stop
  //   lineSoftness       — glow line width addition (px above primary line width)
  //   glowStrength       — glow alpha multiplier
  //   turbulenceCount    — filament count for TURBULENT / DRIFT extra strokes
  //   turbulenceSpread   — spread multiplier for turbulent filaments
  //   turbulenceLengthScale — length multiplier for turbulent filaments
  //   maxWakeAlpha       — hard cap on effective wake alpha
  //   maxGlowAlpha       — hard cap on glow pass alpha
  //   minVisibleZoom     — zoom below which wake is invisible
  //   fullVisibleZoom    — zoom at which wake is fully opaque

  function _profile(
    mode, spreadDeg, lengthScale, asymmetry,
    alphaScale, nearSternAlpha, lineSoftness, glowStrength,
    turbulenceCount, turbulenceSpread, turbulenceLengthScale,
    maxWakeAlpha, maxGlowAlpha, minVisibleZoom, fullVisibleZoom
  ) {
    return Object.freeze({
      mode:                  mode,
      spreadDeg:             spreadDeg,
      lengthScale:           lengthScale,
      asymmetry:             asymmetry             || 0.0,
      alphaScale:            alphaScale,
      nearSternAlpha:        nearSternAlpha,
      lineSoftness:          lineSoftness,
      glowStrength:          glowStrength           || 0.0,
      turbulenceCount:       turbulenceCount        || 0,
      turbulenceSpread:      turbulenceSpread       || 0,
      turbulenceLengthScale: turbulenceLengthScale  || 0,
      maxWakeAlpha:          maxWakeAlpha,
      maxGlowAlpha:          maxGlowAlpha,
      minVisibleZoom:        minVisibleZoom         || DEFAULT_WAKE_MIN_ZOOM,
      fullVisibleZoom:       fullVisibleZoom        || DEFAULT_WAKE_FULL_ZOOM,
    });
  }

  // ── Complete Profile Table (0526C §10) ────────────────────────────────────────
  //                          mode          spread  len    asym  αSc   αNear  soft  glow   tC  tS    tL    maxα  maxGα  minZ   fullZ
  var _PROFILES = Object.freeze({
    cargo:        _profile(MODE_LINEAR,       4,  1.45,  0.00, 0.42, 0.15,  2.5, 0.06,  0,  0.0,  0.0,  0.30, 0.04, 11.6, 13.0),
    tanker:       _profile(MODE_LINEAR,       6,  1.65,  0.00, 0.32, 0.10,  4.0, 0.04,  0,  0.0,  0.0,  0.24, 0.02, 11.6, 13.0),
    ferry:        _profile(MODE_SPLIT_V,     14,  1.05,  0.00, 0.62, 0.40,  1.5, 0.10,  0,  0.0,  0.0,  0.42, 0.08, 11.6, 13.0),
    tug:          _profile(MODE_TURBULENT,   22,  0.55,  0.00, 0.58, 0.35,  3.5, 0.08,  3,  1.20, 0.60, 0.38, 0.06, 11.8, 13.2),
    recreational: _profile(MODE_SPLIT_V,     18,  0.85,  0.00, 0.68, 0.45,  1.0, 0.10,  0,  0.0,  0.0,  0.44, 0.06, 12.0, 13.5),
    fishing:      _profile(MODE_DRIFT,       16,  0.90,  0.18, 0.42, 0.20,  2.0, 0.05,  1,  0.80, 0.80, 0.30, 0.03, 11.8, 13.0),
    passenger:    _profile(MODE_LINEAR,       5,  1.35,  0.00, 0.36, 0.15,  2.0, 0.06,  0,  0.0,  0.0,  0.28, 0.04, 11.6, 13.0),
    military:     _profile(MODE_DISCIPLINED,  4,  0.70,  0.00, 0.18, 0.05,  1.0, 0.00,  0,  0.0,  0.0,  0.12, 0.00, 12.0, 13.5),
    industrial:   _profile(MODE_TURBULENT,   28,  0.65,  0.00, 0.46, 0.25,  4.5, 0.05,  3,  1.50, 0.50, 0.34, 0.04, 11.8, 13.2),
    service:      _profile(MODE_SPLIT_V,     13,  0.90,  0.00, 0.46, 0.25,  2.0, 0.06,  0,  0.0,  0.0,  0.34, 0.04, 11.8, 13.0),
    unknown:      _profile(MODE_LINEAR,      12,  0.90,  0.00, 0.30, 0.12,  2.0, 0.03,  0,  0.0,  0.0,  0.22, 0.02, 11.8, 13.0),
    'default':    _profile(MODE_LINEAR,      12,  1.00,  0.00, 0.40, 0.20,  2.0, 0.05,  0,  0.0,  0.0,  0.30, 0.04, 11.6, 13.0),
  });

  // ── Class Alias → canonical profile key ──────────────────────────────────────

  var _CLASS_TO_PROFILE_KEY = Object.freeze({
    'CARGO':        'cargo',
    'TANKER':       'tanker',
    'FERRY':        'ferry',
    'TUG':          'tug',
    'RECREATIONAL': 'recreational',
    'SAILING':      'recreational',
    'FISHING':      'fishing',
    'PASSENGER':    'passenger',
    'MILITARY':     'military',
    'INDUSTRIAL':   'industrial',
    'SERVICE':      'service',
    'PILOT':        'service',
    'COAST_GUARD':  'service',
    'SAR':          'service',
    'UNKNOWN':      'unknown',
  });

  // ── Profile Resolution ────────────────────────────────────────────────────────

  function resolveWakeProfile(vesselClass) {
    if (!vesselClass || typeof vesselClass !== 'string') return _PROFILES['default'];
    var key = _CLASS_TO_PROFILE_KEY[vesselClass.toUpperCase()];
    if (key && _PROFILES[key]) return _PROFILES[key];
    var lc = vesselClass.toLowerCase();
    if (_PROFILES[lc]) return _PROFILES[lc];
    return _PROFILES['default'];
  }

  // ── Gradient helper — 5-stop soft wake gradient ───────────────────────────────
  //
  // Stop pattern (spec §11):
  //   0.00 → transparent
  //   0.12 → nearSternAlpha     (wake first appears)
  //   0.40 → peakAlpha          (brightest point, downstream of stern)
  //   0.72 → peakAlpha * 0.20   (attenuating)
  //   1.00 → transparent

  function _wakeGrad(ctx, x0, y0, x1, y1, palColor, nearAlpha, peakAlpha) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0.00, _alphaColor(palColor, 0));
    g.addColorStop(0.12, _alphaColor(palColor, Math.min(nearAlpha, peakAlpha)));
    g.addColorStop(0.40, _alphaColor(palColor, peakAlpha));
    g.addColorStop(0.72, _alphaColor(palColor, peakAlpha * 0.20));
    g.addColorStop(1.00, _alphaColor(palColor, 0));
    return g;
  }

  // ── Line width helper — clamp to spec bounds ──────────────────────────────────

  function _lineW(w) {
    return Math.min(MAX_WAKE_LINE_WIDTH_PX, Math.max(MIN_WAKE_LINE_WIDTH_PX, w));
  }

  // ── Deterministic jitter ──────────────────────────────────────────────────────
  // Returns value in [-1, +1]. Deterministic from seed + salt.

  function _jitter(seed, salt) {
    var raw = Math.sin(seed * 9301.0 + salt * 49297.0 + 233.0) * 10000.0;
    return (raw - Math.floor(raw)) * 2.0 - 1.0;  // [-1, +1]
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────
  //
  // drawWakeSignature(ctx, pt, headingDeg, speedKts, vesselClass, alpha, opts)
  //
  //   ctx          — CanvasRenderingContext2D
  //   pt           — {x, y} stern screen position
  //   headingDeg   — vessel heading (0=N, 90=E)
  //   speedKts     — vessel speed
  //   vesselClass  — uppercase vessel class string
  //   alpha        — base opacity [0..1]
  //   opts
  //     opts.zoom           — current map zoom
  //     opts.tier           — population tier (HERO/MID/BACKGROUND/GHOST)
  //     opts.showGlow       — glow pass boolean
  //     opts.showTurb       — turbulence pass boolean
  //     opts.paletteColor   — rgba string for wake colour
  //     opts.seed           — deterministic seed (prefer MMSI-derived)

  function drawWakeSignature(ctx, pt, headingDeg, speedKts, vesselClass, alpha, opts) {
    if ((speedKts || 0) < 0.5) return;

    opts = opts || {};

    var profile  = resolveWakeProfile(vesselClass);
    var zoom     = opts.zoom     || 12.0;
    var seed     = opts.seed     || 0;
    var showGlow = (opts.showGlow !== undefined) ? opts.showGlow : true;
    var showTurb = (opts.showTurb !== undefined) ? opts.showTurb : true;
    var palColor = opts.paletteColor || 'rgba(160,205,232,1)';
    var tier     = opts.tier || 'MID';

    // ── Zoom attenuation (per-profile thresholds) ─────────────────────────────
    var zoomRange = Math.max(0.1, profile.fullVisibleZoom - profile.minVisibleZoom);
    var zoomMult  = Math.max(0, Math.min(1, (zoom - profile.minVisibleZoom) / zoomRange));
    if (zoomMult < 0.01) return;

    // ── Tier attenuation ──────────────────────────────────────────────────────
    var tierMult = tier === 'GHOST'      ? 0.40
                 : tier === 'BACKGROUND' ? 0.60
                 : 1.0;

    // ── Effective alphas ──────────────────────────────────────────────────────
    var rawAlpha       = alpha * tierMult * profile.alphaScale;
    var effectiveAlpha = Math.min(profile.maxWakeAlpha, rawAlpha) * zoomMult;
    if (effectiveAlpha < 0.01) return;

    var glowAlpha = showGlow && profile.glowStrength > 0
      ? Math.min(profile.maxGlowAlpha, rawAlpha * profile.glowStrength) * zoomMult
      : 0;

    // ── Geometry ──────────────────────────────────────────────────────────────
    var baseLen    = Math.min(90, Math.max(10, speedKts * 3.2)) * profile.lengthScale;
    var sternRad   = (headingDeg + 180 - 90) * Math.PI / 180;
    var spreadRad  = profile.spreadDeg * Math.PI / 180;

    // Base line width — speed-derived, scaled by profile width factor, clamped
    // widthScale not in profile directly but approximated via lineSoftness ratio;
    // primary line is speed-proportional
    var primaryW   = _lineW(speedKts * 0.13);
    var glowW      = _lineW(primaryW + profile.lineSoftness);

    // Turbulence count — suppress under low observability
    var turbCount  = profile.turbulenceCount;
    if (tier === 'GHOST') turbCount = 0;
    if (tier === 'BACKGROUND') turbCount = Math.min(1, turbCount);
    turbCount = Math.min(MAX_TURBULENCE_FILAMENTS, turbCount);

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    switch (profile.mode) {

      // ── LINEAR ────────────────────────────────────────────────────────────────
      case MODE_LINEAR: {
        var ex = pt.x + Math.cos(sternRad) * baseLen;
        var ey = pt.y + Math.sin(sternRad) * baseLen;

        // Glow pass
        if (glowAlpha > 0.005) {
          ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, ex, ey, palColor,
            Math.min(profile.nearSternAlpha * 0.5, glowAlpha), glowAlpha);
          ctx.lineWidth = glowW;
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(ex, ey); ctx.stroke();
        }

        // Primary line
        ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, ex, ey, palColor,
          profile.nearSternAlpha, effectiveAlpha);
        ctx.lineWidth = primaryW;
        ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(ex, ey); ctx.stroke();
        break;
      }

      // ── SPLIT_V ───────────────────────────────────────────────────────────────
      case MODE_SPLIT_V: {
        var _drawArm = function (angleOffset) {
          var a   = sternRad + angleOffset;
          var eax = pt.x + Math.cos(a) * baseLen;
          var eay = pt.y + Math.sin(a) * baseLen;

          if (glowAlpha > 0.005) {
            ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, eax, eay, palColor,
              Math.min(profile.nearSternAlpha * 0.5, glowAlpha), glowAlpha);
            ctx.lineWidth = glowW;
            ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(eax, eay); ctx.stroke();
          }

          ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, eax, eay, palColor,
            profile.nearSternAlpha, effectiveAlpha);
          ctx.lineWidth = primaryW;
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(eax, eay); ctx.stroke();
        };
        _drawArm(-spreadRad);
        _drawArm( spreadRad);
        break;
      }

      // ── TURBULENT ─────────────────────────────────────────────────────────────
      case MODE_TURBULENT: {
        if (turbCount === 0 || !showTurb) {
          // Degraded: single dim V
          var ta = sternRad - spreadRad * 0.5;
          var tb = sternRad + spreadRad * 0.5;
          var _drawDimArm = function (a) {
            var eax = pt.x + Math.cos(a) * baseLen * 0.7;
            var eay = pt.y + Math.sin(a) * baseLen * 0.7;
            ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, eax, eay, palColor,
              profile.nearSternAlpha * 0.5, effectiveAlpha * 0.5);
            ctx.lineWidth = _lineW(primaryW * 0.7);
            ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(eax, eay); ctx.stroke();
          };
          _drawDimArm(ta); _drawDimArm(tb);
          break;
        }

        for (var fi = 0; fi < turbCount; fi++) {
          var j1     = _jitter(seed, fi * 3 + 0);
          var j2     = _jitter(seed, fi * 3 + 1);
          var j3     = _jitter(seed, fi * 3 + 2);

          var angleOffset = j1 * spreadRad * profile.turbulenceSpread;
          var lenMult     = profile.turbulenceLengthScale * (0.55 + (fi / turbCount) * 0.50 + j2 * 0.12);
          var filLen      = baseLen * Math.max(0.2, lenMult);
          var fa          = sternRad + angleOffset;
          var fex         = pt.x + Math.cos(fa) * filLen;
          var fey         = pt.y + Math.sin(fa) * filLen;
          var filNear     = profile.nearSternAlpha * (0.6 + j3 * 0.2);
          var filPeak     = effectiveAlpha * (0.30 + (1 - fi / turbCount) * 0.35);

          ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, fex, fey, palColor, filNear, filPeak);
          ctx.lineWidth   = _lineW(primaryW * (1.2 - fi * 0.12));
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(fex, fey); ctx.stroke();
        }
        break;
      }

      // ── DRIFT ─────────────────────────────────────────────────────────────────
      case MODE_DRIFT: {
        var driftStar = sternRad + spreadRad * (1.0 + profile.asymmetry);
        var driftPort = sternRad - spreadRad * (1.0 - profile.asymmetry * 0.4);

        var _drawDriftArm = function (a, lenFactor, peakFactor, wFactor) {
          var dl  = baseLen * lenFactor;
          var dex = pt.x + Math.cos(a) * dl;
          var dey = pt.y + Math.sin(a) * dl;
          ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, dex, dey, palColor,
            profile.nearSternAlpha * peakFactor,
            effectiveAlpha * peakFactor);
          ctx.lineWidth = _lineW(primaryW * wFactor);
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(dex, dey); ctx.stroke();
        };

        // Long trailing starboard arm (dominant)
        _drawDriftArm(driftStar, 1.0,  1.0, 1.15);
        // Short port arm (shorter, dimmer)
        _drawDriftArm(driftPort, 0.55, 0.55, 0.80);

        // Extra stochastic filament (turbulenceCount=1 for fishing)
        if (showTurb && turbCount > 0) {
          var jd   = _jitter(seed, 77);
          var djRad = jd * spreadRad * (profile.turbulenceSpread || 0.8);
          var djLen = baseLen * (profile.turbulenceLengthScale || 0.7);
          var djx   = pt.x + Math.cos(sternRad + djRad) * djLen;
          var djy   = pt.y + Math.sin(sternRad + djRad) * djLen;
          ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, djx, djy, palColor,
            profile.nearSternAlpha * 0.4, effectiveAlpha * 0.28);
          ctx.lineWidth = _lineW(primaryW * 0.65);
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(djx, djy); ctx.stroke();
        }
        break;
      }

      // ── DISCIPLINED ───────────────────────────────────────────────────────────
      case MODE_DISCIPLINED: {
        var dispSpread = spreadRad * 0.55;
        var dispLen    = baseLen * 0.75;

        var _drawDispArm = function (offset) {
          var a   = sternRad + offset;
          var dex = pt.x + Math.cos(a) * dispLen;
          var dey = pt.y + Math.sin(a) * dispLen;
          ctx.strokeStyle = _wakeGrad(ctx, pt.x, pt.y, dex, dey, palColor,
            profile.nearSternAlpha, effectiveAlpha);
          ctx.lineWidth = MIN_WAKE_LINE_WIDTH_PX;
          ctx.beginPath(); ctx.moveTo(pt.x, pt.y); ctx.lineTo(dex, dey); ctx.stroke();
        };
        _drawDispArm(-dispSpread);
        _drawDispArm( dispSpread);
        break;
      }
    }

    ctx.restore();

    // ── §0526B  MaritimeWaterMemory stamp ─────────────────────────────────────
    // Strict guard — WaterMemory remains disabled by default.
    var _mwm = global.SBE && global.SBE.MaritimeWaterMemory;
    if (_mwm && global.SBE.runtimeFlags &&
        global.SBE.runtimeFlags.showMaritimeWaterMemory === true) {
      _mwm.stampWakeMemory({
        vesselId:        opts.vesselId    || null,
        vesselClass:     _mwm.normalizeWaterMemoryClass(vesselClass),
        wakeMode:        profile.mode,
        x:               pt.x,
        y:               pt.y,
        headingDeg:      headingDeg,
        speedKts:        speedKts,
        lengthPx:        opts.lengthPx   || 0,
        widthPx:         opts.widthPx    || 0,
        visibilityClass: opts.visibilityClass || null,
        seed:            seed,
        nowMs:           opts.nowMs      || undefined,
      });
    }
  }

  // ── Alpha Color Utility ───────────────────────────────────────────────────────

  function _alphaColor(color, alpha) {
    alpha = Math.max(0, Math.min(1, alpha || 0));
    if (!color) return 'rgba(160,205,232,' + alpha.toFixed(3) + ')';

    var rgbaMatch = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (rgbaMatch) {
      return 'rgba(' + rgbaMatch[1] + ',' + rgbaMatch[2] + ',' + rgbaMatch[3] + ',' +
        alpha.toFixed(3) + ')';
    }

    var hexMatch = color.match(/^#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})$/);
    if (hexMatch) {
      return 'rgba(' + parseInt(hexMatch[1], 16) + ',' +
                       parseInt(hexMatch[2], 16) + ',' +
                       parseInt(hexMatch[3], 16) + ',' +
                       alpha.toFixed(3) + ')';
    }

    var shortMatch = color.match(/^#([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])$/);
    if (shortMatch) {
      return 'rgba(' + parseInt(shortMatch[1] + shortMatch[1], 16) + ',' +
                       parseInt(shortMatch[2] + shortMatch[2], 16) + ',' +
                       parseInt(shortMatch[3] + shortMatch[3], 16) + ',' +
                       alpha.toFixed(3) + ')';
    }

    return color;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.MaritimeWakeSignature = Object.freeze({

    drawWakeSignature:  drawWakeSignature,
    resolveWakeProfile: resolveWakeProfile,
    alphaColor:         _alphaColor,

    CONSTANTS: Object.freeze({
      VERSION:                  VERSION,
      VALID_MODES:              VALID_MODES,
      MODE_LINEAR:              MODE_LINEAR,
      MODE_SPLIT_V:             MODE_SPLIT_V,
      MODE_TURBULENT:           MODE_TURBULENT,
      MODE_DRIFT:               MODE_DRIFT,
      MODE_DISCIPLINED:         MODE_DISCIPLINED,
      DEFAULT_WAKE_MIN_ZOOM:    DEFAULT_WAKE_MIN_ZOOM,
      DEFAULT_WAKE_FULL_ZOOM:   DEFAULT_WAKE_FULL_ZOOM,
      MAX_ACTIVE_WAKE_ALPHA:    MAX_ACTIVE_WAKE_ALPHA,
      MAX_ACTIVE_WAKE_GLOW_ALPHA: MAX_ACTIVE_WAKE_GLOW_ALPHA,
      MAX_WAKE_LINE_WIDTH_PX:   MAX_WAKE_LINE_WIDTH_PX,
      MIN_WAKE_LINE_WIDTH_PX:   MIN_WAKE_LINE_WIDTH_PX,
      MAX_TURBULENCE_FILAMENTS: MAX_TURBULENCE_FILAMENTS,
    }),
  });

  console.log('[MaritimeWakeSignature] v' + VERSION + ' loaded — ' +
    Object.keys(_PROFILES).length + ' vessel wake profiles, ' +
    VALID_MODES.length + ' modes');

})(window);
