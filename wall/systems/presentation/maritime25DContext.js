// ── Maritime25DContext v1.0.0 ─────────────────────────────────────────────────
// 0527D_WOS_Maritime2_5DContextPass_v1.0.0
// Status: active
// Classification: interpretation-layer — do NOT mutate AIS truth
//
// Purpose:
//   Supply 2.5D presentation policy for maritime vessels on a pitched Mapbox
//   camera.  Vessels rendered through this system conform to the water plane:
//   hulls compress with pitch, shadows align with camera bearing, far vessels
//   become quieter and flatter.
//
// Doctrine:
//   2D owns truth.  2.5D owns presentation.
//   This module reads camera + class profile; it writes only render params.
//
// Public API:
//   SBE.Maritime25DContext.resolveVessel25DProfile(vessel, camera, classProfile)
//   SBE.Maritime25DContext.resolve25DTier(camera)
//   SBE.Maritime25DContext.resolveWaterlineShadow(camera, tier)
//   SBE.Maritime25DContext.setEnabled(bool)
//   SBE.Maritime25DContext.setMode('auto'|'flat'|'grounded')
//
// Placement: wall/systems/presentation/maritime25DContext.js
// Load: AFTER vesselClassPresentation.js, BEFORE marineRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Runtime state ─────────────────────────────────────────────────────────────

  var _enabled           = true;
  var _mode              = 'auto'; // 'auto' | 'flat' | 'grounded'
  var _forceGrounded     = false;  // debug: force all non-dot vessels through grounded hull
  var _suppressBillboards = false; // debug: suppress all screen-space vessel silhouettes

  // Industrial vessel classes — use grounded hull at an earlier zoom threshold.
  var _INDUSTRIAL_CLASSES = { barge: 1, cargo: 1, tanker: 1, industrial: 1, military: 1 };

  // ── Constants ─────────────────────────────────────────────────────────────────

  // Pitch thresholds (degrees)
  var PITCH = Object.freeze({
    flatMax:         12,  // below this → flat_symbol regardless of zoom
    groundedMin:     18,  // above this → grounded silhouettes kick in
    fullMin:         32,  // above this → full grounded topology
    groundedHullMin: 28,  // above this → all non-dot non-far vessels forced through geo-projected hull
                          //              (screen-space silhouettes stand upright on pitched water plane)
    horizonCullMin:  35,  // above this → above-horizon vessels become dashes
    wakeSupressMin:  35,  // above this → suppress wakes for non-near vessels
  });

  // Zoom thresholds — align with VesselClassPresentation tier breakpoints
  var ZOOM = Object.freeze({
    farMarkMax:       11.8,  // compressed_far_mark
    groundedMinZoom:  11.8,  // only ground at closer zooms
  });

  // compressY clamp range — keeps hulls readable even at steep pitch
  var COMPRESS = Object.freeze({
    min: 0.38,
    max: 1.00,
  });

  // Shadow scale: max screen-space pixel offset at max pitch
  var SHADOW_MAX_OFFSET_PX = 2.4;
  var SHADOW_MIN_ALPHA     = 0.12;
  var SHADOW_MAX_ALPHA     = 0.42;

  // Distance desaturation — applied to distanceAlpha at far zoom
  var DISTANCE_ALPHA_FAR  = 0.68;
  var DISTANCE_ALPHA_NEAR = 1.00;

  // ── resolve25DTier(camera) ────────────────────────────────────────────────────
  // Returns: 'flat_symbol' | 'grounded_silhouette' | 'grounded_topology' | 'compressed_far_mark'

  function resolve25DTier(camera) {
    var pitch = (camera && typeof camera.pitch === 'number') ? camera.pitch : 0;
    var zoom  = (camera && typeof camera.zoom  === 'number') ? camera.zoom  : 12;

    // Forced modes
    if (_mode === 'flat')     return 'flat_symbol';
    if (_mode === 'grounded') return pitch >= PITCH.fullMin ? 'grounded_topology' : 'grounded_silhouette';

    // Auto: far zoom → compressed mark regardless of pitch
    if (zoom <= ZOOM.farMarkMax) return 'compressed_far_mark';

    // Auto: low pitch → flat symbols
    if (pitch <= PITCH.flatMax)  return 'flat_symbol';

    // Auto: medium pitch → grounded silhouette
    if (pitch <= PITCH.fullMin)  return 'grounded_silhouette';

    // Auto: steep pitch → grounded topology
    return 'grounded_topology';
  }

  // ── resolveWaterlineShadow(camera, tier) ──────────────────────────────────────
  // Returns { enabled, offsetX, offsetY, alpha, blur }
  // Shadow direction is tied to camera bearing and pitch to simulate a consistent
  // "sun from above and behind the camera" model.

  function resolveWaterlineShadow(camera, tier) {
    var disabled = { enabled: false, offsetX: 0, offsetY: 0, alpha: 0, blur: 0 };

    if (!_enabled) return disabled;
    if (tier === 'flat_symbol' || tier === 'compressed_far_mark') return disabled;

    var pitch   = (camera && typeof camera.pitch   === 'number') ? camera.pitch   : 0;
    var bearing = (camera && typeof camera.bearing === 'number') ? camera.bearing : 0;

    if (pitch < 5) return disabled;

    // pitch factor: ramps from 0 at PITCH.flatMax to 1 at 60°
    var pitchFactor = Math.max(0, Math.min(1, (pitch - PITCH.flatMax) / (60 - PITCH.flatMax)));

    // Shadow direction in screen space:
    // Camera bearing determines which screen-space axis the pitch tilt faces.
    // When bearing=0 (camera looks north): map tilts so "far" is screen-up (+Y is down).
    // Shadow offset follows the map tilt direction = (sin(bearing), cos(bearing)).
    var bearRad   = bearing * Math.PI / 180;
    var scale     = pitchFactor * SHADOW_MAX_OFFSET_PX;
    var offsetX   = Math.sin(bearRad) * scale;
    var offsetY   = Math.cos(bearRad) * scale;

    var alpha = SHADOW_MIN_ALPHA + pitchFactor * (SHADOW_MAX_ALPHA - SHADOW_MIN_ALPHA);

    return {
      enabled: true,
      offsetX: offsetX,
      offsetY: offsetY,
      alpha:   alpha,
      blur:    0,       // no glow — hard grounding only
    };
  }

  // ── _resolveCompressY(camera, tier) ──────────────────────────────────────────
  // Screen-space Y compression applied to vessel hull, simulating perspective
  // flattening as map pitch increases.
  //
  // compressY = cos(pitch * 0.9) — smooth rolloff, bottom-clamped for readability.

  function _resolveCompressY(camera, tier) {
    if (!_enabled) return 1.0;
    if (tier === 'flat_symbol' || tier === 'compressed_far_mark') return 1.0;

    var pitch = (camera && typeof camera.pitch === 'number') ? camera.pitch : 0;
    if (pitch < 5) return 1.0;

    var c = Math.cos(pitch * 0.9 * Math.PI / 180);
    return Math.max(COMPRESS.min, Math.min(COMPRESS.max, c));
  }

  // ── _resolveDistanceAlpha(camera, tier) ──────────────────────────────────────
  // Far vessels become quieter (lower alpha) as zoom decreases.

  function _resolveDistanceAlpha(camera, tier) {
    if (!_enabled) return 1.0;
    if (tier === 'flat_symbol') return 1.0;

    var zoom  = (camera && typeof camera.zoom  === 'number') ? camera.zoom  : 12;
    var pitch = (camera && typeof camera.pitch === 'number') ? camera.pitch : 0;

    // Base ramp: DISTANCE_ALPHA_FAR at zoom 10 → DISTANCE_ALPHA_NEAR at zoom 14
    var t    = Math.max(0, Math.min(1, (zoom - 10) / 4));
    var base = DISTANCE_ALPHA_FAR + t * (DISTANCE_ALPHA_NEAR - DISTANCE_ALPHA_FAR);

    // Pitch amplifier: at high pitch, far vessels fade more aggressively.
    // Ramps from 1.0 at pitch 20° to 0.60 at pitch 70°.
    if (pitch > 20) {
      var pitchFade = 1.0 - Math.min(0.40, (pitch - 20) / 125);
      base = base * pitchFade;
    }

    return Math.max(0.08, base);
  }

  // ── resolveHorizonFade(camera, screenY, canvasHeight) ────────────────────────
  // Returns { fade, aboveHorizon } for a vessel at the given screen Y coordinate.
  //
  // At high pitch, the Mapbox horizon appears in the upper portion of the canvas.
  // Vessels projected above or near the horizon line are visually incorrect —
  // they represent positions that would be behind the camera.
  //
  // fade:         0–1 alpha multiplier. 1.0 = no fade. Vessels deep below horizon are 1.0.
  // aboveHorizon: true if the vessel is above the horizon midline (should become a dash).
  //
  // Horizon midline approximation (screen Y fraction from top):
  //   pitch 0°  → 0.50 (center — no meaningful horizon)
  //   pitch 35° → 0.30
  //   pitch 60° → 0.14

  function resolveHorizonFade(camera, screenY, canvasHeight) {
    var neutral = { fade: 1.0, aboveHorizon: false };
    if (!_enabled) return neutral;

    var pitch = (camera && typeof camera.pitch === 'number') ? camera.pitch : 0;
    if (pitch < PITCH.horizonCullMin) return neutral;

    // Horizon Y in screen space
    var hFrac   = Math.max(0.06, 0.50 - pitch * 0.0045);
    var horizonY = canvasHeight * hFrac;

    // Fade zone: from horizonY down to horizonY + fadeZonePx
    var fadeZonePx = Math.max(30, canvasHeight * 0.08);

    var aboveHorizon = (screenY < horizonY);

    var fade;
    if (aboveHorizon) {
      fade = 0; // will be overridden to low-alpha dash in renderer
    } else if (screenY < horizonY + fadeZonePx) {
      // Linear fade zone just below the horizon
      fade = (screenY - horizonY) / fadeZonePx;
      fade = Math.max(0.12, fade);
    } else {
      fade = 1.0;
    }

    return { fade: fade, aboveHorizon: aboveHorizon, horizonY: horizonY };
  }

  // ── resolveVessel25DProfile(vessel, camera, classProfile) ────────────────────
  // Main entry point for MarineRenderer.
  // Returns a full 2.5D render profile to apply on top of the class profile.

  function resolveVessel25DProfile(vessel, camera, classProfile) {
    if (!_enabled) {
      return {
        enabled:        false,
        tier:           'flat_symbol',
        useGroundedHull: false,
        compressY:      1.0,
        distanceAlpha:  1.0,
        shadow: { enabled: false, offsetX: 0, offsetY: 0, alpha: 0, blur: 0 },
        contextDepth:   0,
      };
    }

    var tier          = resolve25DTier(camera);
    var compressY     = _resolveCompressY(camera, tier);
    var distanceAlpha = _resolveDistanceAlpha(camera, tier);
    var shadow        = resolveWaterlineShadow(camera, tier);

    // useGroundedHull: route through _drawGroundedHull() so Mapbox geo-projection
    // bakes in current pitch — vessel lies on the water plane.
    //
    // Rules:
    //   grounded_topology          → always use grounded hull
    //   pitch >= 35°               → all non-dot non-far vessels forced grounded
    //                                (screen-space silhouettes stand upright on the
    //                                 tilted water plane — geo-projection fixes this)
    //   grounded_silhouette        → use grounded hull for industrial at zoom ≥ 11.8
    //   _forceGrounded / _suppressBillboards → debug overrides
    var pitch = (camera && typeof camera.pitch === 'number') ? camera.pitch : 0;
    var zoom  = (camera && typeof camera.zoom  === 'number') ? camera.zoom  : 12;
    var resolvedClass = (classProfile && classProfile.resolvedClass) || 'unknown';
    var isIndustrial  = !!_INDUSTRIAL_CLASSES[resolvedClass];

    // High-pitch gate: at pitch >= 28° all positioned vessels must use geo-projected
    // hull so they conform to the tilted water plane rather than standing upright.
    // far_dot and compressed_far_mark are exempt (they're screen-space dots/marks
    // with no orientation, so upright vs flat is not meaningful).
    // Note: groundedHullMin (28°) is intentionally lower than horizonCullMin (35°)
    // so grounded geometry is in place before the horizon fade zone begins.
    var highPitch = (pitch >= PITCH.groundedHullMin);
    var farTier   = (tier === 'compressed_far_mark');

    var useGroundedHull =
      _forceGrounded ||
      _suppressBillboards ||
      (tier === 'grounded_topology') ||
      (highPitch && !farTier) ||
      (tier === 'grounded_silhouette' && isIndustrial && zoom >= 11.8);

    // contextDepth: 0–1 factor controlling ambient harbor depth cue intensity.
    // Ramps with pitch to emphasize spatial grounding at high tilt.
    var contextDepth = Math.max(0, Math.min(1, (pitch - PITCH.flatMax) / 40));

    return {
      enabled:        true,
      tier:           tier,
      useGroundedHull: useGroundedHull,
      compressY:      compressY,
      distanceAlpha:  distanceAlpha,
      shadow:         shadow,
      contextDepth:   contextDepth,
    };
  }

  // ── resolveContextDepthOverlay(camera, canvasWidth, canvasHeight) ────────────
  // Returns parameters for the harbor context depth canvas overlay.
  //
  // The overlay is drawn BEFORE vessels on each frame.  It provides:
  //   • Horizon haze band — dark-to-transparent gradient at the top of canvas,
  //     deepening as pitch increases.  Simulates atmospheric recession and
  //     reinforces the sense that the water plane recedes to a horizon.
  //   • Shoreline contrast band — a narrow dark stripe just above the horizon
  //     line, making shoreline/pier edges pop against the sky-coloured void.
  //   • Near-camera vignette — very subtle dark falloff at the bottom corners
  //     to frame the view and anchor vessels to the canvas plane.
  //
  // None of these touch Mapbox layer state.  They are pure canvas operations
  // and can be cleared by drawing ctx.clearRect before vessels.
  //
  // Returns null if pitch is too low to warrant any overlay.

  function resolveContextDepthOverlay(camera, canvasWidth, canvasHeight) {
    if (!_enabled) return null;

    var pitch   = (camera && typeof camera.pitch   === 'number') ? camera.pitch   : 0;
    var bearing = (camera && typeof camera.bearing === 'number') ? camera.bearing : 0;

    if (pitch < PITCH.groundedMin) return null;  // no overlay needed below 18°

    // Horizon fraction — same formula as resolveHorizonFade
    var hFrac    = Math.max(0.06, 0.50 - pitch * 0.0045);
    var horizonY = canvasHeight * hFrac;

    // contextDepth: 0→1 over pitch 18°–58°
    var depth    = Math.max(0, Math.min(1, (pitch - PITCH.groundedMin) / 40));

    // Horizon haze band: gradient from horizonY upward, darkening toward top
    var hazeBandH  = Math.max(40, canvasHeight * (0.18 + depth * 0.12));
    var hazeAlpha  = 0.10 + depth * 0.28;   // 0.10 at flat → 0.38 at steep

    // Shoreline contrast stripe: 2–4px band at the horizon line
    var stripeH    = Math.max(2, Math.min(5, pitch * 0.08));
    var stripeAlpha = 0.18 + depth * 0.22;

    // Near-camera vignette: corner darkening at bottom of canvas
    var vignetteAlpha = depth * 0.12;

    return {
      enabled:       true,
      horizonY:      horizonY,
      depth:         depth,
      bearing:       bearing,
      canvasW:       canvasWidth,
      canvasH:       canvasHeight,
      // Horizon haze band
      haze: {
        y:      horizonY - hazeBandH,
        height: hazeBandH,
        alpha:  hazeAlpha,
      },
      // Shoreline contrast stripe at horizon line
      stripe: {
        y:      horizonY - stripeH * 0.5,
        height: stripeH,
        alpha:  stripeAlpha,
      },
      // Near-camera vignette
      vignette: {
        alpha: vignetteAlpha,
      },
    };
  }

  // ── drawContextDepthOverlay(ctx, overlay) ─────────────────────────────────────
  // Draws the harbor context depth overlay onto ctx.
  // Called BEFORE the vessel pass in marineRenderer.

  function drawContextDepthOverlay(ctx, overlay) {
    if (!overlay || !overlay.enabled) return;

    var cW = overlay.canvasW;
    var cH = overlay.canvasH;

    ctx.save();

    // 1. Horizon haze band — linear gradient from hazeTop (opaque dark) to
    //    horizonY (transparent).  Colour is near-black with a hint of the dark
    //    water palette to blend with the Mapbox Studio style.
    var haze = overlay.haze;
    if (haze.alpha > 0.01) {
      var grad = ctx.createLinearGradient(0, haze.y, 0, haze.y + haze.height);
      grad.addColorStop(0,   'rgba(10, 14, 20, ' + haze.alpha.toFixed(3) + ')');
      grad.addColorStop(0.6, 'rgba(10, 14, 20, ' + (haze.alpha * 0.35).toFixed(3) + ')');
      grad.addColorStop(1,   'rgba(10, 14, 20, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, haze.y, cW, haze.height);
    }

    // 2. Shoreline contrast stripe at the horizon line.
    //    A narrow dark band that makes pier/terminal edges pop.
    var stripe = overlay.stripe;
    if (stripe.alpha > 0.01) {
      var sGrad = ctx.createLinearGradient(0, stripe.y, 0, stripe.y + stripe.height);
      sGrad.addColorStop(0,   'rgba(4, 8, 14, 0)');
      sGrad.addColorStop(0.5, 'rgba(4, 8, 14, ' + stripe.alpha.toFixed(3) + ')');
      sGrad.addColorStop(1,   'rgba(4, 8, 14, 0)');
      ctx.fillStyle = sGrad;
      ctx.fillRect(0, stripe.y, cW, stripe.height + 1);
    }

    // 3. Near-camera vignette — radial gradient from bottom corners.
    //    Very subtle; just enough to frame the view and anchor near vessels.
    var vig = overlay.vignette;
    if (vig.alpha > 0.005) {
      var vigR  = cW * 0.6;
      // Bottom-left corner
      var gBL = ctx.createRadialGradient(0, cH, 0, 0, cH, vigR);
      gBL.addColorStop(0,   'rgba(0, 4, 10, ' + vig.alpha.toFixed(3) + ')');
      gBL.addColorStop(1,   'rgba(0, 4, 10, 0)');
      ctx.fillStyle = gBL;
      ctx.fillRect(0, cH * 0.6, cW * 0.45, cH * 0.4);
      // Bottom-right corner
      var gBR = ctx.createRadialGradient(cW, cH, 0, cW, cH, vigR);
      gBR.addColorStop(0,   'rgba(0, 4, 10, ' + vig.alpha.toFixed(3) + ')');
      gBR.addColorStop(1,   'rgba(0, 4, 10, 0)');
      ctx.fillStyle = gBR;
      ctx.fillRect(cW * 0.55, cH * 0.6, cW * 0.45, cH * 0.4);
    }

    ctx.restore();
  }

  // ── setEnabled / setMode ─────────────────────────────────────────────────────

  function setEnabled(val) {
    _enabled = !!val;
    console.log('[Maritime25DContext] enabled:', _enabled);
  }

  function setForceGrounded(val) {
    _forceGrounded = !!val;
    console.log('[Maritime25DContext] forceGrounded:', _forceGrounded);
  }

  // setSuppressBillboards(bool) — when true, forces all vessels through grounded
  // geo-projected hull regardless of pitch or tier. Equivalent to "no screen-space
  // icons at all" — useful for verifying hull geometry at any camera angle.
  function setSuppressBillboards(val) {
    _suppressBillboards = !!val;
    console.log('[Maritime25DContext] suppressBillboards:', _suppressBillboards);
  }

  function setMode(mode) {
    if (mode !== 'auto' && mode !== 'flat' && mode !== 'grounded') {
      console.warn('[Maritime25DContext] unknown mode:', mode, '— use auto|flat|grounded');
      return;
    }
    _mode = mode;
    console.log('[Maritime25DContext] mode:', _mode);
  }

  function getState() {
    return {
      enabled:            _enabled,
      mode:               _mode,
      forceGrounded:      _forceGrounded,
      suppressBillboards: _suppressBillboards,
      version:            VERSION,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.Maritime25DContext = Object.freeze({
    VERSION:                 VERSION,
    resolveVessel25DProfile: resolveVessel25DProfile,
    resolve25DTier:          resolve25DTier,
    resolveWaterlineShadow:  resolveWaterlineShadow,
    resolveHorizonFade:          resolveHorizonFade,
    resolveContextDepthOverlay:  resolveContextDepthOverlay,
    drawContextDepthOverlay:     drawContextDepthOverlay,
    setEnabled:                  setEnabled,
    setMode:                 setMode,
    setForceGrounded:        setForceGrounded,
    setSuppressBillboards:   setSuppressBillboards,
    getState:                getState,
    // Constants exposed for debug companion
    PITCH:                   PITCH,
    ZOOM:                    ZOOM,
  });

  console.log('[Maritime25DContext] v' + VERSION + ' loaded');

})(window);
