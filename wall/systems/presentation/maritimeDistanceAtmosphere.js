// ── MaritimeDistanceAtmosphere v1.0.1 ─────────────────────────────────────────
// 0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1
// Status: active
// Classification: presentation-layer maritime distance-atmosphere envelope system
//
// Core Doctrine:
//   Distance is presentation truth. It is not simulation truth.
//   Distance atmosphere interprets visibility.
//   It does not define reality.
//   MaritimeDistanceAtmosphere governs presentation compression only.
//   It is not a global observability authority.
//
// Distance Bands:
//   HERO         — foreground / primary / close-focus
//   NEAR         — readable, moderate contrast
//   MID          — present but secondary, reduced detail
//   FAR          — atmospheric, silhouette/marker only
//   ATMOSPHERIC  — signal only, light twinkle or marker
//
// Authority Boundaries:
//   OWNS: distance envelope calculation, far/mid/near bands, alpha compression,
//         detail suppression, wake suppression, light-softening, label suppression,
//         hover-card distance policy, far-vessel abstraction, depth-fog inputs,
//         debug matrix sampling.
//   MAY OBSERVE: projected screen position, externally resolved focus anchor,
//                zoom, viewport, visibilityClass, populationTier, vesselClass,
//                fog/haze/density pressure.
//   MAY NOT MUTATE: AIS state, vessel truth, camera state, renderer sequencing,
//                   visibility class, population tier, wake authority,
//                   topology blueprint, style registry, WaterMemory state.
//
// Focus-Anchor Policy:
//   DistanceAtmosphere consumes externally resolved focus anchors.
//   It does not determine focal authority.
//   Default v1.0.1: viewport center when no anchor is supplied.
//
// Renderer Governance:
//   DistanceAtmosphere returns passive presentation envelopes only.
//   Renderer sequencing ownership remains external.
//
// WaterMemory Policy:
//   SBE.runtimeFlags.showMaritimeWaterMemory = false (default, not modified here)
//
// Placement: wall/systems/presentation/maritimeDistanceAtmosphere.js
// Load: BEFORE maritimeOccupancyRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.1';

  // ── System Constants ──────────────────────────────────────────────────────────
  var HERO_RADIUS_NORM       = 0.12;
  var NEAR_RADIUS_NORM       = 0.24;
  var MID_RADIUS_NORM        = 0.46;
  var FAR_RADIUS_NORM        = 0.72;
  var DEFAULT_FOG_WEIGHT     = 0.45;
  var DEFAULT_HAZE_WEIGHT    = 0.35;
  var DEFAULT_DENSITY_WEIGHT = 0.25;
  var MIN_ATMOSPHERIC_ALPHA  = 0.04;
  var MAX_FAR_LIGHT_ALPHA    = 0.55;
  var DEFAULT_MATRIX_ROWS    = 5;
  var DEFAULT_MATRIX_COLS    = 5;

  // ── Canonical Reason Codes ────────────────────────────────────────────────────
  var RC = Object.freeze({
    DISTANCE_HERO:                'DISTANCE_HERO',
    DISTANCE_NEAR:                'DISTANCE_NEAR',
    DISTANCE_MID:                 'DISTANCE_MID',
    DISTANCE_FAR:                 'DISTANCE_FAR',
    DISTANCE_ATMOSPHERIC:         'DISTANCE_ATMOSPHERIC',
    VISIBILITY_ATMOSPHERIC_HIDDEN:'VISIBILITY_ATMOSPHERIC_HIDDEN',
    VISIBILITY_LIGHT_ONLY:        'VISIBILITY_LIGHT_ONLY',
    VISIBILITY_MARKER_ONLY:       'VISIBILITY_MARKER_ONLY',
    VISIBILITY_SILHOUETTE:        'VISIBILITY_SILHOUETTE',
    VISIBILITY_REDUCED:           'VISIBILITY_REDUCED',
    VISIBILITY_FULL:              'VISIBILITY_FULL',
    FALLBACK_INVALID_INPUT:       'FALLBACK_INVALID_INPUT',
    FALLBACK_MISSING_VIEWPORT:    'FALLBACK_MISSING_VIEWPORT',
    FALLBACK_MISSING_ZOOM:        'FALLBACK_MISSING_ZOOM',
  });

  // ── Base Alpha Table (§13) ────────────────────────────────────────────────────
  var _ALPHA_BY_BAND = Object.freeze({
    HERO:        Object.freeze({ vessel:1.00, topology:1.00, wake:1.00, light:1.00, label:1.00, hover:1.00 }),
    NEAR:        Object.freeze({ vessel:0.88, topology:0.88, wake:0.72, light:0.90, label:0.80, hover:0.75 }),
    MID:         Object.freeze({ vessel:0.62, topology:0.48, wake:0.32, light:0.72, label:0.20, hover:0.00 }),
    FAR:         Object.freeze({ vessel:0.32, topology:0.18, wake:0.08, light:0.55, label:0.00, hover:0.00 }),
    ATMOSPHERIC: Object.freeze({ vessel:0.10, topology:0.00, wake:0.00, light:0.35, label:0.00, hover:0.00 }),
  });

  // ── Detail Table (§19) ────────────────────────────────────────────────────────
  var _DETAIL_BY_BAND = Object.freeze({
    HERO:        Object.freeze({ topologyDetailScale:1.00, wakeDetailScale:1.00, lightBloomScale:1.00, topologyLodHint:'CLOSE_DETAIL' }),
    NEAR:        Object.freeze({ topologyDetailScale:0.88, wakeDetailScale:0.72, lightBloomScale:0.90, topologyLodHint:'TOPOLOGY'     }),
    MID:         Object.freeze({ topologyDetailScale:0.48, wakeDetailScale:0.32, lightBloomScale:0.72, topologyLodHint:'SILHOUETTE'   }),
    FAR:         Object.freeze({ topologyDetailScale:0.18, wakeDetailScale:0.08, lightBloomScale:0.55, topologyLodHint:'MARKER'       }),
    ATMOSPHERIC: Object.freeze({ topologyDetailScale:0.00, wakeDetailScale:0.00, lightBloomScale:0.35, topologyLodHint:'LIGHT'        }),
  });

  // ── Population Tier Detail Multipliers (§22) ──────────────────────────────────
  var _TIER_DETAIL_MULT = Object.freeze({
    HERO:       1.00,
    MID:        0.90,
    BACKGROUND: 0.65,
    GHOST:      0.35,
  });

  // ── Utility ───────────────────────────────────────────────────────────────────

  function _clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // ── resolveDistanceNorm(input) — §14 ─────────────────────────────────────────

  function resolveDistanceNorm(input) {
    var fx = (typeof input.focusX === 'number') ? input.focusX : input.viewportWidth  * 0.5;
    var fy = (typeof input.focusY === 'number') ? input.focusY : input.viewportHeight * 0.5;
    var dx = input.screenX - fx;
    var dy = input.screenY - fy;
    var maxX = Math.max(fx, input.viewportWidth  - fx);
    var maxY = Math.max(fy, input.viewportHeight - fy);
    var maxD = Math.sqrt(maxX * maxX + maxY * maxY);
    if (maxD <= 0) return 0.5;
    return _clamp01(Math.sqrt(dx * dx + dy * dy) / maxD);
  }

  // ── resolveDistanceBand(distanceNorm) — §15 ──────────────────────────────────

  function resolveDistanceBand(distanceNorm) {
    if (distanceNorm <= HERO_RADIUS_NORM) return 'HERO';
    if (distanceNorm <= NEAR_RADIUS_NORM) return 'NEAR';
    if (distanceNorm <= MID_RADIUS_NORM)  return 'MID';
    if (distanceNorm <= FAR_RADIUS_NORM)  return 'FAR';
    return 'ATMOSPHERIC';
  }

  // ── reasonCodeForBand(band) — §16 ────────────────────────────────────────────

  function _reasonCodeForBand(band) {
    switch (band) {
      case 'HERO':        return RC.DISTANCE_HERO;
      case 'NEAR':        return RC.DISTANCE_NEAR;
      case 'MID':         return RC.DISTANCE_MID;
      case 'FAR':         return RC.DISTANCE_FAR;
      case 'ATMOSPHERIC': return RC.DISTANCE_ATMOSPHERIC;
      default:            return RC.FALLBACK_INVALID_INPUT;
    }
  }

  // ── resolveAtmosphereNorm(input) — §17 ───────────────────────────────────────

  function _resolveAtmosphereNorm(input) {
    var fog     = _clamp01(input.fogAlpha      || 0);
    var haze    = _clamp01(input.hazeAlpha     || 0);
    var density = _clamp01(input.densityPressure || 0);
    return _clamp01(
      fog     * DEFAULT_FOG_WEIGHT +
      haze    * DEFAULT_HAZE_WEIGHT +
      density * DEFAULT_DENSITY_WEIGHT
    );
  }

  // ── getFallbackEnvelope(reasonCode) — §21 ────────────────────────────────────

  function getFallbackEnvelope(reasonCode) {
    return Object.freeze({
      version:             VERSION,
      band:                'ATMOSPHERIC',
      reasonCode:          reasonCode || RC.FALLBACK_INVALID_INPUT,
      distanceNorm:        1.0,
      zoomNorm:            0.5,
      atmosphereNorm:      0.5,
      vesselAlpha:         MIN_ATMOSPHERIC_ALPHA,
      topologyAlpha:       0,
      wakeAlpha:           0,
      lightAlpha:          0.20,
      labelAlpha:          0,
      hoverAlpha:          0,
      topologyDetailScale: 0,
      wakeDetailScale:     0,
      lightBloomScale:     0.10,
      topologyLodHint:     'LIGHT',
      allowWake:           false,
      allowTopology:       false,
      allowLabel:          false,
      allowHover:          false,
      allowNavLights:      false,
      allowFarLight:       true,
    });
  }

  // ── applyVisibilityClassToEnvelope(envelope, visibilityClass) — §20 ───────────

  function applyVisibilityClassToEnvelope(envelope, visibilityClass) {
    if (!visibilityClass || visibilityClass === 'FULL') return envelope;

    if (visibilityClass === 'ATMOSPHERIC_HIDDEN') {
      return Object.freeze({
        version:             envelope.version,
        band:                envelope.band,
        reasonCode:          RC.VISIBILITY_ATMOSPHERIC_HIDDEN,
        distanceNorm:        envelope.distanceNorm,
        zoomNorm:            envelope.zoomNorm,
        atmosphereNorm:      envelope.atmosphereNorm,
        vesselAlpha:         0,
        topologyAlpha:       0,
        wakeAlpha:           0,
        lightAlpha:          0,
        labelAlpha:          0,
        hoverAlpha:          0,
        topologyDetailScale: 0,
        wakeDetailScale:     0,
        lightBloomScale:     0,
        topologyLodHint:     'NONE',
        allowWake:           false,
        allowTopology:       false,
        allowLabel:          false,
        allowHover:          false,
        allowNavLights:      false,
        allowFarLight:       false,
      });
    }

    if (visibilityClass === 'LIGHT_ONLY') {
      return Object.freeze({
        version:             envelope.version,
        band:                envelope.band,
        reasonCode:          RC.VISIBILITY_LIGHT_ONLY,
        distanceNorm:        envelope.distanceNorm,
        zoomNorm:            envelope.zoomNorm,
        atmosphereNorm:      envelope.atmosphereNorm,
        vesselAlpha:         0,
        topologyAlpha:       0,
        wakeAlpha:           0,
        lightAlpha:          envelope.lightAlpha,
        labelAlpha:          0,
        hoverAlpha:          0,
        topologyDetailScale: 0,
        wakeDetailScale:     0,
        lightBloomScale:     envelope.lightBloomScale,
        topologyLodHint:     'LIGHT',
        allowWake:           false,
        allowTopology:       false,
        allowLabel:          false,
        allowHover:          false,
        allowNavLights:      false,
        allowFarLight:       envelope.lightAlpha > 0.05,
      });
    }

    if (visibilityClass === 'MARKER_ONLY') {
      return Object.freeze({
        version:             envelope.version,
        band:                envelope.band,
        reasonCode:          RC.VISIBILITY_MARKER_ONLY,
        distanceNorm:        envelope.distanceNorm,
        zoomNorm:            envelope.zoomNorm,
        atmosphereNorm:      envelope.atmosphereNorm,
        vesselAlpha:         envelope.vesselAlpha,
        topologyAlpha:       0,
        wakeAlpha:           0,
        lightAlpha:          envelope.lightAlpha,
        labelAlpha:          0,
        hoverAlpha:          0,
        topologyDetailScale: 0,
        wakeDetailScale:     0,
        lightBloomScale:     envelope.lightBloomScale,
        topologyLodHint:     'MARKER',
        allowWake:           false,
        allowTopology:       false,
        allowLabel:          false,
        allowHover:          false,
        allowNavLights:      false,
        allowFarLight:       envelope.lightAlpha > 0.05,
      });
    }

    if (visibilityClass === 'SILHOUETTE') {
      return Object.freeze({
        version:             envelope.version,
        band:                envelope.band,
        reasonCode:          RC.VISIBILITY_SILHOUETTE,
        distanceNorm:        envelope.distanceNorm,
        zoomNorm:            envelope.zoomNorm,
        atmosphereNorm:      envelope.atmosphereNorm,
        vesselAlpha:         envelope.vesselAlpha,
        topologyAlpha:       Math.min(envelope.topologyAlpha, 0.32),
        wakeAlpha:           Math.min(envelope.wakeAlpha, 0.08),
        lightAlpha:          envelope.lightAlpha,
        labelAlpha:          0,
        hoverAlpha:          0,
        topologyDetailScale: Math.min(envelope.topologyDetailScale, 0.32),
        wakeDetailScale:     Math.min(envelope.wakeDetailScale, 0.08),
        lightBloomScale:     envelope.lightBloomScale,
        topologyLodHint:     'SILHOUETTE',
        allowWake:           envelope.wakeAlpha > 0.04 && envelope.band !== 'FAR' && envelope.band !== 'ATMOSPHERIC',
        allowTopology:       envelope.topologyAlpha > 0.02,
        allowLabel:          false,
        allowHover:          false,
        allowNavLights:      envelope.allowNavLights,
        allowFarLight:       envelope.allowFarLight,
      });
    }

    if (visibilityClass === 'REDUCED') {
      return Object.freeze({
        version:             envelope.version,
        band:                envelope.band,
        reasonCode:          RC.VISIBILITY_REDUCED,
        distanceNorm:        envelope.distanceNorm,
        zoomNorm:            envelope.zoomNorm,
        atmosphereNorm:      envelope.atmosphereNorm,
        vesselAlpha:         _clamp01(envelope.vesselAlpha   * 0.72),
        topologyAlpha:       _clamp01(envelope.topologyAlpha * 0.62),
        wakeAlpha:           _clamp01(envelope.wakeAlpha     * 0.42),
        lightAlpha:          envelope.lightAlpha,
        labelAlpha:          _clamp01(envelope.labelAlpha    * 0.30),
        hoverAlpha:          _clamp01(envelope.hoverAlpha    * 0.20),
        topologyDetailScale: _clamp01(envelope.topologyDetailScale * 0.62),
        wakeDetailScale:     _clamp01(envelope.wakeDetailScale     * 0.42),
        lightBloomScale:     envelope.lightBloomScale,
        topologyLodHint:     envelope.topologyLodHint,
        allowWake:           envelope.allowWake && envelope.wakeAlpha * 0.42 > 0.02,
        allowTopology:       envelope.allowTopology,
        allowLabel:          envelope.allowLabel && envelope.band === 'HERO',
        allowHover:          false,
        allowNavLights:      envelope.allowNavLights,
        allowFarLight:       envelope.allowFarLight,
      });
    }

    // Unknown visibility class — return distance band only
    return envelope;
  }

  // ── resolveDistanceEnvelope(input) — §18 ─────────────────────────────────────

  function resolveDistanceEnvelope(input) {
    if (!input) {
      return getFallbackEnvelope(RC.FALLBACK_INVALID_INPUT);
    }
    if (typeof input.viewportWidth  !== 'number' || typeof input.viewportHeight !== 'number' ||
        input.viewportWidth  <= 0 || input.viewportHeight <= 0) {
      return getFallbackEnvelope(RC.FALLBACK_MISSING_VIEWPORT);
    }
    if (typeof input.zoom !== 'number') {
      return getFallbackEnvelope(RC.FALLBACK_MISSING_ZOOM);
    }

    var distanceNorm  = resolveDistanceNorm(input);
    var band          = resolveDistanceBand(distanceNorm);
    var atmosphereNorm = _resolveAtmosphereNorm(input);
    var zoomNorm      = _clamp01((input.zoom - 8) / 12);
    var base          = _ALPHA_BY_BAND[band];
    var detail        = _DETAIL_BY_BAND[band];
    var reasonCode    = _reasonCodeForBand(band);

    // Atmosphere reduces alpha (fog/haze/density) — may only reduce, not elevate
    var atmosphereFactor = _clamp01(1 - atmosphereNorm * 0.6);

    // Population tier detail multiplier (§22) — applies to detail scales only
    var tierKey     = input.populationTier || 'MID';
    var tierMult    = _TIER_DETAIL_MULT[tierKey] !== undefined ? _TIER_DETAIL_MULT[tierKey] : 0.65;

    var envelope = Object.freeze({
      version:             VERSION,
      band:                band,
      reasonCode:          reasonCode,
      distanceNorm:        distanceNorm,
      zoomNorm:            zoomNorm,
      atmosphereNorm:      atmosphereNorm,
      vesselAlpha:         _clamp01(base.vessel   * atmosphereFactor),
      topologyAlpha:       _clamp01(base.topology * atmosphereFactor),
      wakeAlpha:           _clamp01(base.wake     * atmosphereFactor),
      lightAlpha:          _clamp01(Math.min(base.light, MAX_FAR_LIGHT_ALPHA)),
      labelAlpha:          _clamp01(base.label    * atmosphereFactor),
      hoverAlpha:          _clamp01(base.hover    * atmosphereFactor),
      topologyDetailScale: _clamp01(detail.topologyDetailScale * tierMult),
      wakeDetailScale:     _clamp01(detail.wakeDetailScale     * tierMult),
      lightBloomScale:     _clamp01(detail.lightBloomScale),
      topologyLodHint:     detail.topologyLodHint,
      allowWake:           base.wake > 0.02 && band !== 'ATMOSPHERIC',
      allowTopology:       base.topology > 0.02 && band !== 'ATMOSPHERIC',
      allowLabel:          base.label > 0.05 && (band === 'HERO' || band === 'NEAR'),
      allowHover:          base.hover > 0.05 && band === 'HERO',
      allowNavLights:      base.light > 0.30 && (band === 'HERO' || band === 'NEAR' || band === 'MID'),
      allowFarLight:       base.light > 0.10 && band !== 'HERO',
    });

    return applyVisibilityClassToEnvelope(envelope, input.visibilityClass || null);
  }

  // ── getConstants() ────────────────────────────────────────────────────────────

  function getConstants() {
    return Object.freeze({
      VERSION:              VERSION,
      HERO_RADIUS_NORM:     HERO_RADIUS_NORM,
      NEAR_RADIUS_NORM:     NEAR_RADIUS_NORM,
      MID_RADIUS_NORM:      MID_RADIUS_NORM,
      FAR_RADIUS_NORM:      FAR_RADIUS_NORM,
      DEFAULT_FOG_WEIGHT:   DEFAULT_FOG_WEIGHT,
      DEFAULT_HAZE_WEIGHT:  DEFAULT_HAZE_WEIGHT,
      DEFAULT_DENSITY_WEIGHT: DEFAULT_DENSITY_WEIGHT,
      MIN_ATMOSPHERIC_ALPHA:  MIN_ATMOSPHERIC_ALPHA,
      MAX_FAR_LIGHT_ALPHA:    MAX_FAR_LIGHT_ALPHA,
      DEFAULT_MATRIX_ROWS:    DEFAULT_MATRIX_ROWS,
      DEFAULT_MATRIX_COLS:    DEFAULT_MATRIX_COLS,
      REASON_CODES:           RC,
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.MaritimeDistanceAtmosphere = Object.freeze({
    resolveDistanceEnvelope:          resolveDistanceEnvelope,
    resolveDistanceBand:              resolveDistanceBand,
    resolveDistanceNorm:              resolveDistanceNorm,
    applyVisibilityClassToEnvelope:   applyVisibilityClassToEnvelope,
    getFallbackEnvelope:              getFallbackEnvelope,
    getConstants:                     getConstants,
  });

  console.log('[MaritimeDistanceAtmosphere] v' + VERSION +
    ' loaded — 5 bands, ' + Object.keys(RC).length + ' reason codes');

})(window);
