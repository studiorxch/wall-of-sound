// ── MaritimeLightAuthority v1.0.2 ─────────────────────────────────────────────
// 0526F_WOS_MaritimeLightAuthority_v1.0.2
// Status: active
// Classification: interpretation-layer maritime light presentation system
//
// Core Doctrine:
//   Light communicates presence. It does not define existence.
//   At distance, lights become the vessel.
//   Deterministic pulse represents atmospheric temporal variance only.
//   Pulse behavior must NEVER imply alert state or urgency.
//
// Canonical Collapse Chain:
//   DUAL_NAV → CLUSTER → POINT → GHOST → NONE
//
// Authority Boundaries:
//   OWNS: light envelopes, navigation-light presentation, bloom behavior,
//         far-light collapse, deterministic pulse/shimmer, class-specific
//         signatures, distance-reactive simplification, visibility-safe
//         suppression, light fallback safety, debug light matrices.
//   MAY OBSERVE: MaritimeDistanceAtmosphere, VisibilityClassRuntime,
//                MaritimeStyleRegistry, zoom, fog/haze/density, vessel class,
//                render tier, vessel id / MMSI for deterministic phase.
//   MAY NOT MUTATE: AIS truth, vessel state, camera state, weather systems,
//                   overlay orchestration, wake authority, style registry,
//                   distance envelope state, atmospheric simulation.
//
// Renderer Sequencing:
//   External orchestration responsibility.
//   This system exposes passive immutable envelopes only.
//
// Reflection Hints:
//   Advisory metadata for future compatibility. v1.0.x does not implement
//   water reflections. Reflection systems remain independently authoritative.
//
// Placement: wall/systems/presentation/maritimeLightAuthority.js
// Load: BEFORE maritimeOccupancyRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.2';

  // ── System Constants ──────────────────────────────────────────────────────────
  var MIN_LIGHT_ALPHA                = 0.02;
  var MAX_NAV_ALPHA                  = 0.92;
  var MAX_FAR_LIGHT_ALPHA            = 0.55;
  var MIN_BLOOM_RADIUS_PX            = 1.2;
  var MAX_BLOOM_RADIUS_PX            = 9.0;
  var MAX_BLOOM_ALPHA                = 0.22;
  var DEFAULT_SHIMMER_AMOUNT         = 0.08;
  var MAX_SHIMMER_AMOUNT             = 0.28;
  var DEFAULT_PULSE_HZ               = 0.08;
  var MAX_PULSE_HZ                   = 0.33;
  var REFERENCE_CLUSTER_ZOOM         = 13.0;
  var DEFAULT_ATMOSPHERE_FOG_WEIGHT  = 0.45;
  var DEFAULT_ATMOSPHERE_HAZE_WEIGHT = 0.35;
  var DEFAULT_ATMOSPHERE_DENSITY_WEIGHT = 0.25;
  var TAU                            = Math.PI * 2;

  // ── Canonical Reason Codes ────────────────────────────────────────────────────
  var RC = Object.freeze({
    LIGHT_DUAL_NAV:       'LIGHT_DUAL_NAV',
    LIGHT_CLUSTER:        'LIGHT_CLUSTER',
    LIGHT_POINT:          'LIGHT_POINT',
    LIGHT_GHOST:          'LIGHT_GHOST',
    LIGHT_SUPPRESSED:     'LIGHT_SUPPRESSED',
    VISIBILITY_SUPPRESSED:'VISIBILITY_SUPPRESSED',
    DISTANCE_SUPPRESSED:  'DISTANCE_SUPPRESSED',
    FALLBACK_INVALID_INPUT:'FALLBACK_INVALID_INPUT',
  });

  // ── Canonical Zero Light Envelope (§19.1) ─────────────────────────────────────
  var _ZERO = Object.freeze({
    version:              VERSION,
    visible:              false,
    renderMode:           'NONE',
    reasonCode:           RC.FALLBACK_INVALID_INPUT,
    alpha:                0,
    bloomAlpha:           0,
    bloomRadiusPx:        0,
    navAlpha:             0,
    farAlpha:             0,
    pulsePhase:           0,
    pulseValue:           0,
    shimmerAmount:        0,
    navPortColor:         'rgba(0,0,0,0)',
    navStarboardColor:    'rgba(0,0,0,0)',
    navSternColor:        'rgba(0,0,0,0)',
    glowColor:            'rgba(0,0,0,0)',
    allowNavPair:         false,
    allowMastLight:       false,
    allowFarGlint:        false,
    allowBloom:           false,
    allowWakeGlow:        false,
    allowReflectionHint:  false,
  });

  // ── Complete Class Light Signature Table (§8) ─────────────────────────────────

  function _sig(classKey, baseRenderMode, baseAlpha, bloomScale, shimmerScale,
                pulseHz, pulseDepth, navWarmth, farWarmth,
                clusterCount, clusterSpreadPx, suppressUnderAtmosphere) {
    return Object.freeze({
      classKey:                classKey,
      baseRenderMode:          baseRenderMode,
      baseAlpha:               baseAlpha,
      bloomScale:              bloomScale,
      shimmerScale:            shimmerScale,
      pulseHz:                 Math.min(MAX_PULSE_HZ, pulseHz),
      pulseDepth:              pulseDepth,
      navWarmth:               navWarmth,
      farWarmth:               farWarmth,
      clusterCount:            clusterCount,
      clusterSpreadPx:         clusterSpreadPx,
      suppressUnderAtmosphere: suppressUnderAtmosphere,
    });
  }

  var _SIGNATURES = Object.freeze({
    //          classKey        baseMode    bα    blmSc  shmSc  pHz    pDep  navW  farW  cC  cSpx  suppAtm
    cargo:        _sig('cargo',        'POINT',    0.44, 0.80, 0.45, 0.060, 0.12, 0.55, 0.65, 1, 0.0,  0.35),
    tanker:       _sig('tanker',       'POINT',    0.38, 0.95, 0.35, 0.045, 0.08, 0.70, 0.75, 1, 0.0,  0.42),
    ferry:        _sig('ferry',        'DUAL_NAV', 0.62, 0.75, 0.55, 0.120, 0.16, 0.35, 0.45, 2, 3.5,  0.25),
    tug:          _sig('tug',          'CLUSTER',  0.58, 0.65, 0.90, 0.180, 0.24, 0.62, 0.70, 3, 4.0,  0.30),
    recreational: _sig('recreational', 'POINT',    0.48, 0.55, 0.75, 0.150, 0.20, 0.25, 0.35, 1, 0.0,  0.40),
    fishing:      _sig('fishing',      'CLUSTER',  0.46, 0.60, 0.80, 0.110, 0.22, 0.50, 0.55, 2, 3.0,  0.38),
    passenger:    _sig('passenger',    'CLUSTER',  0.64, 1.15, 0.35, 0.050, 0.08, 0.42, 0.50, 4, 5.5,  0.22),
    military:     _sig('military',     'GHOST',    0.18, 0.20, 0.20, 0.040, 0.04, 0.30, 0.30, 1, 0.0,  0.70),
    industrial:   _sig('industrial',   'CLUSTER',  0.50, 0.85, 0.60, 0.090, 0.16, 0.72, 0.78, 3, 4.5,  0.36),
    service:      _sig('service',      'DUAL_NAV', 0.52, 0.65, 0.60, 0.130, 0.18, 0.45, 0.50, 2, 2.8,  0.35),
    unknown:      _sig('unknown',      'POINT',    0.32, 0.50, 0.45, 0.080, 0.12, 0.45, 0.50, 1, 0.0,  0.45),
  });

  // ── Class Key Normalisation ───────────────────────────────────────────────────

  var _CLASS_MAP = Object.freeze({
    'CARGO':        'cargo',      'cargo':        'cargo',
    'TANKER':       'tanker',     'tanker':       'tanker',
    'FERRY':        'ferry',      'ferry':        'ferry',
    'TUG':          'tug',        'tug':          'tug',
    'RECREATIONAL': 'recreational','recreational': 'recreational',
    'SAILING':      'recreational',
    'FISHING':      'fishing',    'fishing':      'fishing',
    'PASSENGER':    'passenger',  'passenger':    'passenger',
    'CRUISE':       'passenger',
    'MILITARY':     'military',   'military':     'military',
    'INDUSTRIAL':   'industrial', 'industrial':   'industrial',
    'SERVICE':      'service',    'service':      'service',
    'PILOT':        'service',    'COAST_GUARD':  'service',
    'SAR':          'service',
  });

  // ── Utility ───────────────────────────────────────────────────────────────────

  function _clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Interpolate warm glow color.
  // warmth 0.0 → cold blue-white (#e0eeff), warmth 1.0 → warm amber (#ffd880)
  function _warmColor(warmth, alpha) {
    var r = Math.round(224 + warmth * 31);
    var g = Math.round(238 + warmth * (216 - 238));
    var b = Math.round(255 + warmth * (128 - 255));
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(3) + ')';
  }

  function _navColor(hexColor, alpha) {
    return hexColor.replace(
      /^#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})$/,
      function (_, r, g, b) {
        return 'rgba(' + parseInt(r, 16) + ',' + parseInt(g, 16) + ',' +
               parseInt(b, 16) + ',' + alpha.toFixed(3) + ')';
      }
    ) || hexColor;
  }

  // ── Stable Seed (§18.2) ───────────────────────────────────────────────────────

  function _stableSeed(input) {
    var raw = 0;
    if (input.mmsi != null && !isNaN(Number(input.mmsi))) {
      raw = Number(input.mmsi);
    } else if (input.vesselId && typeof input.vesselId === 'string') {
      for (var i = 0; i < input.vesselId.length; i++) {
        raw = ((raw * 31) + input.vesselId.charCodeAt(i)) % 1000003;
      }
    } else {
      var ck = (input.vesselClass || 'unknown').toLowerCase();
      for (var j = 0; j < ck.length; j++) {
        raw = ((raw * 31) + ck.charCodeAt(j)) % 1000003;
      }
    }
    return raw;
  }

  // ── Distance-based mode collapse (§13) ───────────────────────────────────────

  function _collapseForDistance(mode, band) {
    if (band === 'HERO' || band === 'NEAR') return mode;
    if (band === 'MID') {
      if (mode === 'DUAL_NAV') return 'CLUSTER';
      return mode;
    }
    if (band === 'FAR') {
      if (mode === 'DUAL_NAV' || mode === 'CLUSTER') return 'POINT';
      return mode;
    }
    // ATMOSPHERIC
    if (mode === 'DUAL_NAV' || mode === 'CLUSTER' || mode === 'POINT') return 'GHOST';
    return mode;
  }

  // ── Visibility-class mode suppression (§14) ───────────────────────────────────

  function _suppressForVisibility(mode, visClass) {
    if (!visClass || visClass === 'FULL') return mode;
    if (visClass === 'ATMOSPHERIC_HIDDEN') return 'NONE';
    if (visClass === 'REDUCED') {
      if (mode === 'DUAL_NAV') return 'CLUSTER';
      return mode;
    }
    if (visClass === 'SILHOUETTE' || visClass === 'MARKER_ONLY') {
      if (mode === 'DUAL_NAV' || mode === 'CLUSTER') return 'POINT';
      return mode;
    }
    if (visClass === 'LIGHT_ONLY') {
      // Light-only is fine for POINT/GHOST; collapse more complex modes
      if (mode === 'DUAL_NAV' || mode === 'CLUSTER') return 'POINT';
      return mode;
    }
    return mode;
  }

  // ── Reason code from mode ─────────────────────────────────────────────────────

  function _reasonCodeForMode(mode) {
    switch (mode) {
      case 'DUAL_NAV': return RC.LIGHT_DUAL_NAV;
      case 'CLUSTER':  return RC.LIGHT_CLUSTER;
      case 'POINT':    return RC.LIGHT_POINT;
      case 'GHOST':    return RC.LIGHT_GHOST;
      default:         return RC.LIGHT_SUPPRESSED;
    }
  }

  // ── Public: resolveClassLightSignature ───────────────────────────────────────

  function resolveClassLightSignature(vesselClass) {
    if (!vesselClass) return _SIGNATURES.unknown;
    var key = _CLASS_MAP[String(vesselClass)] || _CLASS_MAP[String(vesselClass).toUpperCase()];
    return (key && _SIGNATURES[key]) ? _SIGNATURES[key] : _SIGNATURES.unknown;
  }

  // ── Public: getFallbackLightEnvelope ─────────────────────────────────────────

  function getFallbackLightEnvelope(reasonCode) {
    if (reasonCode === RC.DISTANCE_SUPPRESSED) {
      return Object.freeze({
        version:            VERSION,
        visible:            true,
        renderMode:         'GHOST',
        reasonCode:         RC.DISTANCE_SUPPRESSED,
        alpha:              0.03,
        bloomAlpha:         0,
        bloomRadiusPx:      0,
        navAlpha:           0,
        farAlpha:           0.03,
        pulsePhase:         0,
        pulseValue:         1.0,
        shimmerAmount:      0,
        navPortColor:       'rgba(0,0,0,0)',
        navStarboardColor:  'rgba(0,0,0,0)',
        navSternColor:      'rgba(0,0,0,0)',
        glowColor:          'rgba(200,220,240,0.030)',
        allowNavPair:       false,
        allowMastLight:     false,
        allowFarGlint:      true,
        allowBloom:         false,
        allowWakeGlow:      false,
        allowReflectionHint:false,
      });
    }
    return Object.freeze({
      version:            VERSION,
      visible:            false,
      renderMode:         'NONE',
      reasonCode:         reasonCode || RC.FALLBACK_INVALID_INPUT,
      alpha:              0,
      bloomAlpha:         0,
      bloomRadiusPx:      0,
      navAlpha:           0,
      farAlpha:           0,
      pulsePhase:         0,
      pulseValue:         0,
      shimmerAmount:      0,
      navPortColor:       'rgba(0,0,0,0)',
      navStarboardColor:  'rgba(0,0,0,0)',
      navSternColor:      'rgba(0,0,0,0)',
      glowColor:          'rgba(0,0,0,0)',
      allowNavPair:       false,
      allowMastLight:     false,
      allowFarGlint:      false,
      allowBloom:         false,
      allowWakeGlow:      false,
      allowReflectionHint:false,
    });
  }

  // ── Public: resolveLightEnvelope (§18.1) ─────────────────────────────────────

  function resolveLightEnvelope(input) {

    // 1. Validate input
    if (!input || typeof input.nowMs !== 'number' || typeof input.zoom !== 'number') {
      return getFallbackLightEnvelope(RC.FALLBACK_INVALID_INPUT);
    }

    // 2. Resolve fallback state — early exit for suppressed visibility
    if (input.visibilityClass === 'ATMOSPHERIC_HIDDEN') {
      return getFallbackLightEnvelope(RC.VISIBILITY_SUPPRESSED);
    }

    // 3. Resolve class signature
    var sig     = resolveClassLightSignature(input.vesselClass);
    var nowMs   = input.nowMs;
    var zoom    = input.zoom;

    // 4. Generate stable seed
    var seed       = _stableSeed(input);
    var seedFrac   = (seed % 10000) / 10000.0;  // [0, 1)

    // 5. Pulse phase and value (§18.3)
    var pulsePhase = seedFrac * TAU;
    var hz         = sig.pulseHz;
    var pulseValue = 1.0 - sig.pulseDepth +
                     sig.pulseDepth * (0.5 + 0.5 * Math.sin(nowMs * hz * TAU + pulsePhase));

    // 6. Shimmer (§18.4) — deterministic, no Math.random
    var shimmerPhase  = (seedFrac * 6.28) + 1.3;
    var shimmerRate   = 0.8 + sig.shimmerScale * 0.4;
    var shimmerNoise  = 0.5 + 0.5 * Math.sin(nowMs * 0.001 * shimmerRate + shimmerPhase);
    var shimmerAmount = _clamp01(DEFAULT_SHIMMER_AMOUNT * sig.shimmerScale * shimmerNoise);

    // 7. Distance collapse
    var band = (input.distanceEnvelope && input.distanceEnvelope.band) || 'MID';
    var renderMode = _collapseForDistance(sig.baseRenderMode, band);

    // Early exit for far atmospheric distance collapse to minimal glint
    if (band === 'ATMOSPHERIC' && renderMode === 'GHOST' &&
        (input.visibilityClass === 'LIGHT_ONLY' || !input.visibilityClass || input.visibilityClass === 'FULL')) {
      // Minimal atmospheric glint — preserve far presence
    }

    // 8. Visibility suppression
    renderMode = _suppressForVisibility(renderMode, input.visibilityClass);

    if (renderMode === 'NONE') {
      return getFallbackLightEnvelope(RC.VISIBILITY_SUPPRESSED);
    }

    // 9. Atmosphere suppression
    var fogAlpha      = _clamp01(input.fogAlpha      || 0);
    var hazeAlpha     = _clamp01(input.hazeAlpha     || 0);
    var densityP      = _clamp01(input.densityPressure || 0);
    var atmospherePressure = _clamp01(
      fogAlpha  * DEFAULT_ATMOSPHERE_FOG_WEIGHT +
      hazeAlpha * DEFAULT_ATMOSPHERE_HAZE_WEIGHT +
      densityP  * DEFAULT_ATMOSPHERE_DENSITY_WEIGHT
    );

    // Distance envelope lightAlpha provides the distance-band alpha floor
    var distLightAlpha = (input.distanceEnvelope && typeof input.distanceEnvelope.lightAlpha === 'number')
      ? input.distanceEnvelope.lightAlpha : 0.55;
    var distBloomScale = (input.distanceEnvelope && typeof input.distanceEnvelope.lightBloomScale === 'number')
      ? input.distanceEnvelope.lightBloomScale : 1.0;
    var distAllowNav   = input.distanceEnvelope ? input.distanceEnvelope.allowNavLights : true;
    var distAllowFar   = input.distanceEnvelope ? input.distanceEnvelope.allowFarLight  : true;

    // Base alpha — class signature * distance band
    var rawAlpha = sig.baseAlpha * distLightAlpha;

    // Apply atmosphere suppression (§12.2) — additive only, never elevates
    rawAlpha *= (1.0 - atmospherePressure * sig.suppressUnderAtmosphere);

    // Clamp
    var finalAlpha = _clamp01(rawAlpha);
    if (finalAlpha < MIN_LIGHT_ALPHA && renderMode !== 'GHOST') {
      return getFallbackLightEnvelope(RC.LIGHT_SUPPRESSED);
    }

    // §0526G Change 4 — Atmospheric drift: very slow seeded alpha variance.
    // Prevents vessels at the same distance appearing as identical static dots.
    // Amplitude is 0.08 — continuity-subordinate, non-urgent.
    var drift = 0.92 + 0.08 * Math.sin(nowMs * 0.00008 + seedFrac * Math.PI * 2);

    // Apply pulse modulation and drift
    var modulatedAlpha = finalAlpha * pulseValue * drift;

    // Nav alpha vs far alpha
    var navAlpha = renderMode === 'GHOST' ? 0
                 : _clamp01(Math.min(MAX_NAV_ALPHA, modulatedAlpha) * (distAllowNav ? 1.0 : 0.0));
    var farAlpha = renderMode === 'GHOST'
                 ? _clamp01(finalAlpha * 0.55 * (distAllowFar ? 1.0 : 0.0))
                 : _clamp01(Math.min(MAX_FAR_LIGHT_ALPHA, modulatedAlpha * 0.65) * (distAllowFar ? 1.0 : 0.0));

    // 10. Bloom
    // At close range (zoom high): smaller radius, tighter
    // At far range (zoom low): larger radius, dimmer
    var zoomBloomFactor = _clamp01(1.0 - (zoom - 8.0) / 10.0);   // 0 at zoom 18, 1 at zoom 8
    var baseBloomR  = MIN_BLOOM_RADIUS_PX + (MAX_BLOOM_RADIUS_PX - MIN_BLOOM_RADIUS_PX) *
                      zoomBloomFactor * 0.7;
    var bloomRadiusPx = _clamp01((baseBloomR * sig.bloomScale * distBloomScale) /
                                  MAX_BLOOM_RADIUS_PX) * MAX_BLOOM_RADIUS_PX;
    bloomRadiusPx = Math.max(MIN_BLOOM_RADIUS_PX, Math.min(MAX_BLOOM_RADIUS_PX, bloomRadiusPx));

    var bloomAlpha = _clamp01(modulatedAlpha * sig.bloomScale * 0.45 * distBloomScale);
    // §0526G Change 3 — soften far bloom; keep MAX_BLOOM_ALPHA ceiling unchanged
    if (band === 'FAR')         bloomAlpha *= 0.85;
    else if (band === 'ATMOSPHERIC') bloomAlpha *= 0.65;
    bloomAlpha = Math.min(MAX_BLOOM_ALPHA, bloomAlpha);

    // Time-of-day boost for night
    var isNight = (input.timeOfDay === 'NIGHT' || input.timeOfDay === 'DUSK');
    if (isNight) {
      navAlpha   = _clamp01(navAlpha   * 1.28);
      farAlpha   = _clamp01(farAlpha   * 1.15);
      bloomAlpha = _clamp01(bloomAlpha * 1.18);
    }

    // 11. Build immutable envelope
    var reasonCode    = _reasonCodeForMode(renderMode);
    var navWarmth     = sig.navWarmth;
    var farWarmth     = sig.farWarmth;

    var allowNavPair  = (renderMode === 'DUAL_NAV' || renderMode === 'CLUSTER') && navAlpha > 0.01;
    var allowMastLight = (renderMode === 'DUAL_NAV' || renderMode === 'CLUSTER') && navAlpha > 0.01;
    var allowFarGlint = renderMode !== 'NONE' && (farAlpha > 0.01 || navAlpha > 0.01);
    var allowBloom    = bloomAlpha > 0.005 && renderMode !== 'NONE';
    var allowWakeGlow = allowNavPair && sig.clusterCount >= 2;
    var allowRefl     = renderMode !== 'NONE';

    return Object.freeze({
      version:            VERSION,
      visible:            true,
      renderMode:         renderMode,
      reasonCode:         reasonCode,
      alpha:              modulatedAlpha,
      bloomAlpha:         allowBloom ? bloomAlpha : 0,
      bloomRadiusPx:      allowBloom ? bloomRadiusPx : 0,
      navAlpha:           navAlpha,
      farAlpha:           farAlpha,
      pulsePhase:         pulsePhase,
      pulseValue:         pulseValue,
      shimmerAmount:      Math.min(MAX_SHIMMER_AMOUNT, shimmerAmount),
      navPortColor:       _navColor('#ff4b4b', navAlpha),
      navStarboardColor:  _navColor('#4bff8a', navAlpha),
      navSternColor:      _navColor('#dceeff', navAlpha * 0.72),
      glowColor:          _warmColor(farWarmth, Math.min(0.55, farAlpha * 1.1)),
      allowNavPair:       allowNavPair,
      allowMastLight:     allowMastLight,
      allowFarGlint:      allowFarGlint,
      allowBloom:         allowBloom,
      allowWakeGlow:      allowWakeGlow,
      allowReflectionHint:allowRefl,
    });
  }

  // ── Public: getConstants ──────────────────────────────────────────────────────

  function getConstants() {
    return Object.freeze({
      VERSION:                          VERSION,
      MIN_LIGHT_ALPHA:                  MIN_LIGHT_ALPHA,
      MAX_NAV_ALPHA:                    MAX_NAV_ALPHA,
      MAX_FAR_LIGHT_ALPHA:              MAX_FAR_LIGHT_ALPHA,
      MIN_BLOOM_RADIUS_PX:              MIN_BLOOM_RADIUS_PX,
      MAX_BLOOM_RADIUS_PX:              MAX_BLOOM_RADIUS_PX,
      MAX_BLOOM_ALPHA:                  MAX_BLOOM_ALPHA,
      DEFAULT_SHIMMER_AMOUNT:           DEFAULT_SHIMMER_AMOUNT,
      MAX_SHIMMER_AMOUNT:               MAX_SHIMMER_AMOUNT,
      DEFAULT_PULSE_HZ:                 DEFAULT_PULSE_HZ,
      MAX_PULSE_HZ:                     MAX_PULSE_HZ,
      REFERENCE_CLUSTER_ZOOM:           REFERENCE_CLUSTER_ZOOM,
      DEFAULT_ATMOSPHERE_FOG_WEIGHT:    DEFAULT_ATMOSPHERE_FOG_WEIGHT,
      DEFAULT_ATMOSPHERE_HAZE_WEIGHT:   DEFAULT_ATMOSPHERE_HAZE_WEIGHT,
      DEFAULT_ATMOSPHERE_DENSITY_WEIGHT:DEFAULT_ATMOSPHERE_DENSITY_WEIGHT,
      REASON_CODES:                     RC,
      CLASS_KEYS:                       Object.freeze(Object.keys(_SIGNATURES)),
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.MaritimeLightAuthority = Object.freeze({
    resolveLightEnvelope:        resolveLightEnvelope,
    resolveClassLightSignature:  resolveClassLightSignature,
    getFallbackLightEnvelope:    getFallbackLightEnvelope,
    getConstants:                getConstants,
  });

  console.log('[MaritimeLightAuthority] v' + VERSION + ' loaded — ' +
    Object.keys(_SIGNATURES).length + ' class signatures, ' +
    Object.keys(RC).length + ' reason codes');

})(window);
