// ── MaritimeSilhouetteDifferentiation v1.0.2 ─────────────────────────────────
// 0526H_WOS_MaritimeSilhouetteDifferentiation_v1.0.2
// Status: active
// Classification: interpretation-layer maritime silhouette readability system
//
// Core Doctrine:
//   Presentation interprets reality. It does not define it.
//   Shape language communicates atmospheric presence, not literal vessel form.
//   At FAR and ATMOSPHERIC bands, light spacing becomes the vessel.
//
// Authority Boundaries:
//   OWNS: silhouette readability profiles, atmospheric mass interpretation,
//         hull aspect weighting, heading stability bias, far-light spacing,
//         silhouette degradation policy, wake readability scaling.
//   OBSERVES: vessel class, state, speed, heading, visibility class,
//              distance bands, wake/light authority outputs.
//   MUST NOT MUTATE: AISRuntime, MaritimeDistanceAtmosphere,
//              MaritimeLightAuthority, ActiveWakePolish, VisibilityClassRuntime,
//              ProceduralVesselTopology, camera, continuity, harbor state.
//
// Ownership Separation:
//   ProceduralVesselTopology owns structural vessel abstraction.
//   Wake systems remain independently authoritative.
//   MaritimeLightAuthority owns maritime light behavior.
//   This system may provide scalar hints only.
//
// Validation Entity Governance:
//   Validation status must originate from renderer-authorized diagnostic tooling only.
//   AIS feeds, external telemetry, and gameplay state may NOT assign validation status.
//
// Placement: wall/systems/presentation/maritimeSilhouetteDifferentiation.js
// Load: BEFORE maritimeOccupancyRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.2';

  // ── System Constants ──────────────────────────────────────────────────────────
  var MIN_ASPECT_BIAS      = 0.0;
  var MAX_ASPECT_BIAS      = 5.0;
  var MIN_MASS_BIAS        = 0.0;
  var MAX_MASS_BIAS        = 1.0;
  var MIN_READABILITY_SCALE = 0.0;
  var MAX_READABILITY_SCALE = 1.0;
  var MAX_TURN_SOFTNESS_DEG = 45.0;
  var DEFAULT_UNKNOWN_CLASS = 'unknown';

  // ── Clamp helper (§15) ────────────────────────────────────────────────────────
  function _clamp(value, min, max) {
    if (!isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
  }

  // ── Complete Canonical Profile Dictionary (§11) ───────────────────────────────
  //  classKey  hullAsp  atmMass  wakeRd  hdgStab  trnSoft  farLgt  lgtVar  blmSft

  function _prof(classKey, hullAspectBias, atmosphericMassBias, wakeReadabilityScale,
                  headingStabilityBias, turnSoftnessDeg, farLightSpacing,
                  lightClusterVariance, bloomSoftness) {
    return Object.freeze({
      version:              VERSION,
      silhouetteClass:      classKey,
      hullAspectBias:       hullAspectBias,
      atmosphericMassBias:  atmosphericMassBias,
      wakeReadabilityScale: wakeReadabilityScale,
      headingStabilityBias: headingStabilityBias,
      turnSoftnessDeg:      turnSoftnessDeg,
      farLightSpacing:      farLightSpacing,
      lightClusterVariance: lightClusterVariance,
      bloomSoftness:        bloomSoftness,
    });
  }

  var _PROFILES = Object.freeze({
    cargo:        _prof('cargo',        3.20, 0.90, 0.85, 0.90,  6.0, 2.20, 0.05, 0.55),
    tanker:       _prof('tanker',       3.50, 0.95, 0.75, 0.95,  4.0, 2.40, 0.04, 0.60),
    ferry:        _prof('ferry',        1.95, 0.65, 0.70, 0.80, 14.0, 1.50, 0.12, 0.40),
    service:      _prof('service',      1.40, 0.50, 0.60, 0.70, 20.0, 1.10, 0.18, 0.35),
    recreational: _prof('recreational', 0.85, 0.35, 0.50, 0.55, 35.0, 0.65, 0.28, 0.25),
    fishing:      _prof('fishing',      1.30, 0.60, 0.80, 0.65, 22.0, 0.95, 0.22, 0.45),
    passenger:    _prof('passenger',    2.80, 0.80, 0.65, 0.85,  8.0, 1.90, 0.08, 0.50),
    tug:          _prof('tug',          1.15, 0.80, 0.95, 0.60, 28.0, 0.75, 0.24, 0.30),
    military:     _prof('military',     2.50, 0.40, 0.55, 0.90, 12.0, 1.30, 0.15, 0.20),
    industrial:   _prof('industrial',   1.60, 0.85, 0.85, 0.75, 15.0, 1.20, 0.18, 0.45),
    unknown:      _prof('unknown',      1.50, 0.50, 0.50, 0.75, 15.0, 1.00, 0.15, 0.40),
  });

  // ── Class Key Normalisation (§13.1) ───────────────────────────────────────────

  function resolveSilhouetteClass(vesselClass, vesselState) {
    var cls = String(vesselClass || 'unknown').toLowerCase().trim();
    if (cls === 'cargo')        return 'cargo';
    if (cls === 'tanker')       return 'tanker';
    if (cls === 'ferry')        return 'ferry';
    if (cls === 'service')      return 'service';
    if (cls === 'recreational') return 'recreational';
    if (cls === 'fishing')      return 'fishing';
    if (cls === 'passenger')    return 'passenger';
    if (cls === 'tug')          return 'tug';
    if (cls === 'military')     return 'military';
    if (cls === 'industrial')   return 'industrial';
    // Aliases
    if (cls === 'cruise')       return 'passenger';
    if (cls === 'container')    return 'cargo';
    if (cls === 'freighter')    return 'cargo';
    if (cls === 'barge')        return 'industrial';
    if (cls === 'yacht')        return 'recreational';
    if (cls === 'speedboat')    return 'recreational';
    if (cls === 'sailing')      return 'recreational';
    if (cls === 'trawler')      return 'fishing';
    if (cls === 'pilot')        return 'service';
    if (cls === 'patrol')       return 'service';
    if (cls === 'coast_guard')  return 'service';
    if (cls === 'sar')          return 'service';
    return DEFAULT_UNKNOWN_CLASS;
  }

  // ── resolveSilhouetteProfile(input) — §14.1 assembly flow ─────────────────────

  function resolveSilhouetteProfile(input) {
    // 1. Validate input
    if (!input || !input.vesselId) {
      return Object.freeze({
        version:              VERSION,
        silhouetteClass:      DEFAULT_UNKNOWN_CLASS,
        hullAspectBias:       _PROFILES.unknown.hullAspectBias,
        atmosphericMassBias:  _PROFILES.unknown.atmosphericMassBias,
        wakeReadabilityScale: _PROFILES.unknown.wakeReadabilityScale,
        headingStabilityBias: _PROFILES.unknown.headingStabilityBias,
        turnSoftnessDeg:      _PROFILES.unknown.turnSoftnessDeg,
        farLightSpacing:      _PROFILES.unknown.farLightSpacing,
        lightClusterVariance: _PROFILES.unknown.lightClusterVariance,
        bloomSoftness:        _PROFILES.unknown.bloomSoftness,
      });
    }

    // 2. Validation entity bypass (§12, §19)
    // isValidationEntity must originate from renderer-authorized diagnostic tooling.
    // The boolean flag is passed by the renderer; AIS feeds may never set it.
    if (input.isValidationEntity === true) {
      return Object.freeze({
        version:              VERSION,
        silhouetteClass:      DEFAULT_UNKNOWN_CLASS,
        hullAspectBias:       1.50,
        atmosphericMassBias:  1.00,
        wakeReadabilityScale: 1.00,
        headingStabilityBias: 1.00,
        turnSoftnessDeg:      0.0,
        farLightSpacing:      1.00,
        lightClusterVariance: 0.00,
        bloomSoftness:        0.00,
      });
    }

    // 3. Resolve canonical silhouette class
    var resolvedClass = resolveSilhouetteClass(input.vesselClass, input.vesselState);

    // 4. Lookup base profile
    var base = _PROFILES[resolvedClass] || _PROFILES.unknown;

    // 5. Mutable working copies
    var hullAspectBias       = base.hullAspectBias;
    var atmosphericMassBias  = base.atmosphericMassBias;
    var wakeReadabilityScale = base.wakeReadabilityScale;
    var headingStabilityBias = base.headingStabilityBias;
    var turnSoftnessDeg      = base.turnSoftnessDeg;
    var farLightSpacing      = base.farLightSpacing;
    var lightClusterVariance = base.lightClusterVariance;
    var bloomSoftness        = base.bloomSoftness;

    // 5. Apply vessel state modifiers
    var state    = String(input.vesselState || '').toLowerCase();
    var speedKts = isFinite(input.speedKts) ? input.speedKts : 0;
    if (state === 'anchored' || state === 'moored' ||
        state === 'stationary' || speedKts < 0.15) {
      hullAspectBias       *= 1.05;
      wakeReadabilityScale  = 0.0;
      headingStabilityBias  = Math.max(headingStabilityBias, 0.90);
      turnSoftnessDeg       = Math.min(turnSoftnessDeg, 5.0);
    }

    // 6. Apply distance band degradation (§21)
    var band = input.distanceBand || 'MID';
    switch (band) {
      case 'HERO':
      case 'NEAR':
        break;
      case 'MID':
        hullAspectBias       *= 0.80;
        wakeReadabilityScale *= 0.65;
        lightClusterVariance *= 0.85;
        break;
      case 'FAR':
        hullAspectBias       *= 0.25;
        wakeReadabilityScale *= 0.15;
        farLightSpacing      *= 1.20;
        atmosphericMassBias  *= 0.70;
        break;
      case 'ATMOSPHERIC':
        hullAspectBias        = 0.0;
        atmosphericMassBias   = 0.0;
        wakeReadabilityScale  = 0.0;
        headingStabilityBias  = Math.max(headingStabilityBias, 0.95);
        turnSoftnessDeg       = Math.min(turnSoftnessDeg, 5.0);
        farLightSpacing      *= 1.50;
        lightClusterVariance *= 1.40;
        bloomSoftness        *= 1.30;
        break;
      default:
        hullAspectBias       *= 0.80;
        wakeReadabilityScale *= 0.65;
        break;
    }

    // 7. Apply visibility class suppression (§8)
    var visClass = input.visibilityClass || 'FULL';
    switch (visClass) {
      case 'FULL':
        break;
      case 'REDUCED':
        hullAspectBias       *= 0.85;
        wakeReadabilityScale *= 0.50;
        break;
      case 'SILHOUETTE':
        atmosphericMassBias   = Math.min(atmosphericMassBias * 1.30, 1.0);
        wakeReadabilityScale *= 0.25;
        break;
      case 'MARKER_ONLY':
        hullAspectBias        = 0.05;
        wakeReadabilityScale  = 0.0;
        break;
      case 'LIGHT_ONLY':
      case 'ATMOSPHERIC_HIDDEN':
        hullAspectBias        = 0.0;
        atmosphericMassBias   = 0.0;
        wakeReadabilityScale  = 0.0;
        break;
      default:
        hullAspectBias       *= 0.85;
        wakeReadabilityScale *= 0.50;
        break;
    }

    // 8. Clamp scalar ranges and return immutable profile (§15)
    return Object.freeze({
      version:              VERSION,
      silhouetteClass:      resolvedClass,
      hullAspectBias:       _clamp(hullAspectBias,       MIN_ASPECT_BIAS,       MAX_ASPECT_BIAS),
      atmosphericMassBias:  _clamp(atmosphericMassBias,  MIN_MASS_BIAS,         MAX_MASS_BIAS),
      wakeReadabilityScale: _clamp(wakeReadabilityScale, MIN_READABILITY_SCALE, MAX_READABILITY_SCALE),
      headingStabilityBias: _clamp(headingStabilityBias, MIN_READABILITY_SCALE, MAX_READABILITY_SCALE),
      turnSoftnessDeg:      _clamp(turnSoftnessDeg,      0,                     MAX_TURN_SOFTNESS_DEG),
      farLightSpacing:      _clamp(farLightSpacing,      0,                     3.0),
      lightClusterVariance: _clamp(lightClusterVariance, 0,                     1.0),
      bloomSoftness:        _clamp(bloomSoftness,        0,                     1.0),
    });
  }

  // ── getSilhouetteConstants() ──────────────────────────────────────────────────

  function getSilhouetteConstants() {
    return Object.freeze({
      VERSION:               VERSION,
      MIN_ASPECT_BIAS:       MIN_ASPECT_BIAS,
      MAX_ASPECT_BIAS:       MAX_ASPECT_BIAS,
      MIN_MASS_BIAS:         MIN_MASS_BIAS,
      MAX_MASS_BIAS:         MAX_MASS_BIAS,
      MIN_READABILITY_SCALE: MIN_READABILITY_SCALE,
      MAX_READABILITY_SCALE: MAX_READABILITY_SCALE,
      MAX_TURN_SOFTNESS_DEG: MAX_TURN_SOFTNESS_DEG,
      DEFAULT_UNKNOWN_CLASS: DEFAULT_UNKNOWN_CLASS,
      CLASS_KEYS:            Object.freeze(Object.keys(_PROFILES)),
      DISTANCE_BANDS:        Object.freeze(['HERO', 'NEAR', 'MID', 'FAR', 'ATMOSPHERIC']),
      VISIBILITY_CLASSES:    Object.freeze(['FULL', 'REDUCED', 'SILHOUETTE', 'MARKER_ONLY', 'LIGHT_ONLY', 'ATMOSPHERIC_HIDDEN']),
    });
  }

  // ── getSilhouetteProfiles() ───────────────────────────────────────────────────

  function getSilhouetteProfiles() {
    return _PROFILES;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.MaritimeSilhouetteDifferentiation = Object.freeze({
    resolveSilhouetteProfile:  resolveSilhouetteProfile,
    resolveSilhouetteClass:    resolveSilhouetteClass,
    getSilhouetteConstants:    getSilhouetteConstants,
    getSilhouetteProfiles:     getSilhouetteProfiles,
  });

  console.log('[MaritimeSilhouetteDifferentiation] v' + VERSION + ' loaded — ' +
    Object.keys(_PROFILES).length + ' canonical silhouette profiles');

})(window);
