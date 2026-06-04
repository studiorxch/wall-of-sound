// ── MaritimeAtmosphericReadability v1.0.0 ────────────────────────────────────
// 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0
// Status: active
// Classification: runtime-interpretation-spec
//
// Pure deterministic readability interpretation layer.
//
// Authority boundaries (constitutional):
//   AtmosphericReadability OWNS: readability scores, visibility attenuation,
//     label readability recommendation, silhouette/marker/light fallback
//     recommendation, wake visibility attenuation, clutter interpretation,
//     distance curves, environmental modifiers, reason codes.
//
//   AtmosphericReadability MAY OBSERVE: vessel class, population tier,
//     provenance, distance, weather, time-of-day, wake segment intensity/age,
//     taxonomy render envelope, population update advisory, viewport scale,
//     clutterPressure.
//
//   AtmosphericReadability MAY NOT MUTATE: AIS state, vessel position/heading/
//     speed/lifecycle, synthetic vessel state, population tier, taxonomy
//     profiles, wake segment registry, wake lifetime, ecology spawn state,
//     renderer buffers, camera state.
//
// Core doctrine:
//   Atmosphere may suppress visibility.
//   Atmosphere may never suppress existence.
//
//   Runtime owns existence.
//   Atmosphere owns readability.
//   Renderer owns presentation.
//
// Determinism contract:
//   Forbidden: Date.now(), performance.now(), Math.random(), live DOM reads,
//     renderer buffer reads, camera mutation, runtime mutation.
//   Allowed: provided simulation time, provided context, deterministic scalar
//     math, taxonomy profile reads, population record reads, wake segment reads.
//
// Placement: wall/systems/maritimeAtmosphericReadability.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Tier readability baselines ────────────────────────────────────────────
  // §16 — population tier influences visibility; never mutated by visibility.

  var TIER_READABILITY_BASELINE = {
    HERO:       1.0,
    MID:        0.82,
    BACKGROUND: 0.48,
    GHOST:      0.18,
  };

  // ── Weather factors ───────────────────────────────────────────────────────
  // §17 — advisory baselines; renderer interprets visually.

  var WEATHER_READABILITY_FACTOR = {
    CLEAR:  1.0,
    CLOUDY: 0.88,
    HAZE:   0.68,
    FOG:    0.38,
    RAIN:   0.58,
    STORM:  0.32,
    SNOW:   0.42,
  };

  // ── Time-of-day factors ───────────────────────────────────────────────────
  // §18 — night does not remove vessels; shifts toward LIGHT_ONLY.

  var TIME_READABILITY_FACTOR = {
    DAWN:    0.78,
    MORNING: 0.92,
    MIDDAY:  1.0,
    DUSK:    0.72,
    NIGHT:   0.46,
  };

  // ── Provenance factors ────────────────────────────────────────────────────
  // §19 — AIS supremacy; synthetic deemphasis without automatic hiding.

  var PROVENANCE_READABILITY_FACTOR = {
    AIS_VESSEL:        1.0,
    SYNTHETIC_ECOLOGY: 0.72,
  };

  // ── Blur hints ────────────────────────────────────────────────────────────
  // §26.1

  var WEATHER_BLUR_HINT = {
    CLEAR:  0.0,
    CLOUDY: 0.12,
    HAZE:   0.32,
    FOG:    0.72,
    RAIN:   0.46,
    STORM:  0.68,
    SNOW:   0.58,
  };

  // ── Contrast hints ────────────────────────────────────────────────────────
  // §26.2

  var WEATHER_CONTRAST_HINT = {
    CLEAR:  1.0,
    CLOUDY: 0.86,
    HAZE:   0.62,
    FOG:    0.42,
    RAIN:   0.58,
    STORM:  0.38,
    SNOW:   0.52,
  };

  // ── Distance protection ───────────────────────────────────────────────────
  // §24 — vessels within this threshold may not return ATMOSPHERIC_HIDDEN.

  var MINIMUM_VISIBLE_DISTANCE_M = 200;

  // ── Telemetry counters ────────────────────────────────────────────────────

  var _tel = {
    evaluatedVessels:       0,
    evaluatedWakes:         0,
    hiddenByAtmosphere:     0,
    labelSuppressed:        0,
    lightOnlyCount:         0,
    silhouetteCount:        0,
    readabilityScoreSum:    0,
  };

  // ── Internal helpers ──────────────────────────────────────────────────────

  function _clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // §20 — taxonomyAtmosphericResistance → taxonomyResistanceFactor.
  function _resolveTaxonomyResistanceFactor(value) {
    return _clamp(value, 0.0, 1.0);
  }

  // §21 — clutterPressure → clutterFactor.
  //   clutterPressure 0.0 → clutterFactor 1.0
  //   clutterPressure 1.0 → clutterFactor 0.35
  function _resolveClutterFactor(clutterPressure) {
    return _clamp(1.0 - _clamp(clutterPressure, 0.0, 1.0) * 0.65, 0.35, 1.0);
  }

  // §22 — canonical distance factor. Raw distance only; weatherFactor handled
  //   separately. Must not apply weatherFactor here.
  function _resolveDistanceFactor(distanceMeters) {
    if (distanceMeters <= 500)  return 1.0;
    if (distanceMeters <= 1500) return 0.8;
    if (distanceMeters <= 4000) return 0.55;
    if (distanceMeters <= 8000) return 0.32;
    return 0.16;
  }

  // §25 — visibility class from score, context, and distance.
  function _resolveVisibilityClass(score, context, distanceMeters) {
    // §24 — minimum visible distance protection
    if (distanceMeters <= MINIMUM_VISIBLE_DISTANCE_M && score < 0.18) {
      return context.timeOfDay === 'NIGHT' ? 'LIGHT_ONLY' : 'MARKER_ONLY';
    }
    if (score >= 0.78) return 'FULL';
    if (score >= 0.55) return 'REDUCED';
    if (score >= 0.34) return 'SILHOUETTE';
    if (score >= 0.18) {
      return context.timeOfDay === 'NIGHT' ? 'LIGHT_ONLY' : 'MARKER_ONLY';
    }
    return 'ATMOSPHERIC_HIDDEN';
  }

  // §26.1 — blur hint. Uses raw distanceFactor; must not use weather-adjusted
  //   effective distance to avoid hidden double-counting.
  function _resolveBlurHint(context, rawDistanceFactor) {
    var weatherBlur = WEATHER_BLUR_HINT[context.weatherState] != null
      ? WEATHER_BLUR_HINT[context.weatherState]
      : 0.0;
    return _clamp(weatherBlur + (1.0 - rawDistanceFactor) * 0.25, 0.0, 1.0);
  }

  // §26.2 — contrast hint. Night modifies contrast.
  function _resolveContrastHint(context) {
    var contrast = WEATHER_CONTRAST_HINT[context.weatherState] != null
      ? WEATHER_CONTRAST_HINT[context.weatherState]
      : 1.0;
    if (context.timeOfDay === 'NIGHT') {
      contrast = _clamp(contrast * 0.72 + 0.18, 0.0, 1.0);
    }
    return contrast;
  }

  // ── §15: Canonical vessel readability score ───────────────────────────────
  //
  //   readabilityScore =
  //     baseTierReadability
  //     × distanceFactor
  //     × weatherFactor
  //     × timeOfDayFactor
  //     × taxonomyResistanceFactor
  //     × clutterFactor
  //     × provenanceFactor
  //
  // §15.1 — weatherFactor is the sole default weather suppression path.
  //   distanceFactor uses raw distanceMeters to prevent double-counting.

  function _computeVesselScore(input, context) {
    var tierBase     = TIER_READABILITY_BASELINE[input.populationTier]  != null
      ? TIER_READABILITY_BASELINE[input.populationTier] : 0.18;
    var weatherFact  = WEATHER_READABILITY_FACTOR[context.weatherState] != null
      ? WEATHER_READABILITY_FACTOR[context.weatherState] : 1.0;
    var timeFact     = TIME_READABILITY_FACTOR[context.timeOfDay]       != null
      ? TIME_READABILITY_FACTOR[context.timeOfDay] : 1.0;
    var provFact     = PROVENANCE_READABILITY_FACTOR[input.provenance]  != null
      ? PROVENANCE_READABILITY_FACTOR[input.provenance] : 1.0;
    var distFact     = _resolveDistanceFactor(input.distanceMeters);
    var taxFact      = _resolveTaxonomyResistanceFactor(input.taxonomyAtmosphericResistance);
    var clutterFact  = _resolveClutterFactor(context.clutterPressure);

    return _clamp(
      tierBase * distFact * weatherFact * timeFact * taxFact * clutterFact * provFact,
      0.0, 1.0
    );
  }

  // ── §29.1: Label readability formula ─────────────────────────────────────

  function _computeLabelReadable(score, input, context) {
    return score >= 0.55
      && context.clutterPressure < 0.72
      && input.taxonomyLabelPriority >= 0.35;
  }

  // ── §9 / §33.1: resolveVesselReadability ─────────────────────────────────

  function resolveVesselReadability(input, context) {
    _tel.evaluatedVessels++;

    var score = _computeVesselScore(input, context);
    var distFact = _resolveDistanceFactor(input.distanceMeters);
    var visibilityClass = _resolveVisibilityClass(score, context, input.distanceMeters);
    var labelReadable = _computeLabelReadable(score, input, context);

    // Collect reason codes
    var reasonCodes = [];

    if (distFact < 0.8) {
      reasonCodes.push('DISTANCE_ATTENUATION');
    }

    var weatherState = context.weatherState;
    if (weatherState === 'FOG') {
      reasonCodes.push('FOG_SUPPRESSION');
    } else if (weatherState === 'RAIN' || weatherState === 'STORM') {
      reasonCodes.push('RAIN_SUPPRESSION');
    } else if (weatherState === 'HAZE') {
      reasonCodes.push('HAZE_REDUCTION');
    }

    if (context.timeOfDay === 'NIGHT') {
      reasonCodes.push('NIGHT_LIGHT_ONLY');
    }

    if (_resolveClutterFactor(context.clutterPressure) < 1.0) {
      reasonCodes.push('CLUTTER_SUPPRESSION');
    }

    if (input.populationTier === 'GHOST' || input.populationTier === 'BACKGROUND') {
      reasonCodes.push('LOW_POPULATION_TIER');
    }

    if (input.taxonomyAtmosphericResistance < 0.35) {
      reasonCodes.push('LOW_TAXONOMY_RESISTANCE');
    }

    if (input.provenance === 'SYNTHETIC_ECOLOGY') {
      reasonCodes.push('SYNTHETIC_DEEMPHASIS');
    }

    if (input.distanceMeters <= MINIMUM_VISIBLE_DISTANCE_M) {
      reasonCodes.push('MINIMUM_DISTANCE_PROTECTED');
    }

    if (!labelReadable && context.clutterPressure >= 0.72) {
      reasonCodes.push('LABEL_DENSITY_SUPPRESSION');
    }

    // Telemetry
    if (visibilityClass === 'ATMOSPHERIC_HIDDEN') _tel.hiddenByAtmosphere++;
    if (visibilityClass === 'SILHOUETTE')         _tel.silhouetteCount++;
    if (visibilityClass === 'LIGHT_ONLY')         _tel.lightOnlyCount++;
    if (!labelReadable)                           _tel.labelSuppressed++;
    _tel.readabilityScoreSum += score;

    return {
      entityId:                   input.vesselId,
      entityType:                 'VESSEL',
      visibilityClass:            visibilityClass,
      readabilityScore:           score,
      labelReadable:              labelReadable,
      wakeReadable:               score >= 0.18,
      atmosphericAlphaMultiplier: _clamp(score, 0.0, 1.0),
      atmosphericBlurHint:        _resolveBlurHint(context, distFact),
      atmosphericContrastHint:    _resolveContrastHint(context),
      reasonCodes:                reasonCodes,
    };
  }

  // ── §28.1 / §33.2: resolveWakeReadability ────────────────────────────────
  //
  //   wakeReadabilityScore =
  //     intensityRaw
  //     × weatherFactor
  //     × timeOfDayFactor
  //     × clutterFactor
  //     × provenanceFactor
  //     × wakeAgeFactor
  //
  //   wakeAgeFactor = clamp(1.0 - clamp(ageRatio, 0, 1) × 0.6, 0.4, 1.0)

  function resolveWakeReadability(input, context) {
    _tel.evaluatedWakes++;

    var weatherFact  = WEATHER_READABILITY_FACTOR[context.weatherState] != null
      ? WEATHER_READABILITY_FACTOR[context.weatherState] : 1.0;
    var timeFact     = TIME_READABILITY_FACTOR[context.timeOfDay]       != null
      ? TIME_READABILITY_FACTOR[context.timeOfDay] : 1.0;
    var clutterFact  = _resolveClutterFactor(context.clutterPressure);
    var provFact     = PROVENANCE_READABILITY_FACTOR[input.provenance]  != null
      ? PROVENANCE_READABILITY_FACTOR[input.provenance] : 1.0;
    var wakeAgeFact  = _clamp(1.0 - _clamp(input.ageRatio, 0.0, 1.0) * 0.6, 0.4, 1.0);

    var score = _clamp(
      input.intensityRaw * weatherFact * timeFact * clutterFact * provFact * wakeAgeFact,
      0.0, 1.0
    );

    // Wake has no distanceMeters input per §14.2; use a nominal large value
    // so the distance-based branch in resolveVisibilityClass does not apply
    // minimum-distance protection (wakes are spatial, not viewpoint-relative
    // in this spec). visibilityClass still reflects perceptual readability.
    var visibilityClass = _resolveVisibilityClass(score, context, 9999);

    var reasonCodes = [];
    if (weatherFact < 0.8) {
      if (context.weatherState === 'FOG')                         reasonCodes.push('FOG_SUPPRESSION');
      else if (context.weatherState === 'RAIN' || context.weatherState === 'STORM') reasonCodes.push('RAIN_SUPPRESSION');
      else if (context.weatherState === 'HAZE')                  reasonCodes.push('HAZE_REDUCTION');
    }
    if (context.timeOfDay === 'NIGHT')                            reasonCodes.push('NIGHT_LIGHT_ONLY');
    if (_resolveClutterFactor(context.clutterPressure) < 1.0)    reasonCodes.push('CLUTTER_SUPPRESSION');
    if (input.ageRatio > 0.6)                                     reasonCodes.push('WAKE_FADED');
    if (input.provenance === 'SYNTHETIC_ECOLOGY')                 reasonCodes.push('SYNTHETIC_DEEMPHASIS');

    if (visibilityClass === 'ATMOSPHERIC_HIDDEN') _tel.hiddenByAtmosphere++;

    // §14.2 — wakes do not own labels
    return {
      entityId:                   input.wakeId,
      entityType:                 'WAKE',
      visibilityClass:            visibilityClass,
      readabilityScore:           score,
      labelReadable:              false,
      wakeReadable:               score >= 0.18,
      atmosphericAlphaMultiplier: _clamp(score, 0.0, 1.0),
      atmosphericBlurHint:        _resolveBlurHint(context, 1.0), // wakes have no per-wake distance
      atmosphericContrastHint:    _resolveContrastHint(context),
      reasonCodes:                reasonCodes,
    };
  }

  // ── §30 / §33.3: resolveLabelReadability ─────────────────────────────────
  // Guaranteed to be a direct projection of resolveVesselReadability().labelReadable.
  // Must not diverge into a separate authority path.

  function resolveLabelReadability(input, context) {
    return resolveVesselReadability(input, context).labelReadable;
  }

  // ── §36: Debug snapshot ───────────────────────────────────────────────────

  function getDebugSnapshot() {
    var totalVessels = _tel.evaluatedVessels || 1;
    return {
      evaluatedVessels:      _tel.evaluatedVessels,
      evaluatedWakes:        _tel.evaluatedWakes,
      hiddenByAtmosphere:    _tel.hiddenByAtmosphere,
      labelSuppressed:       _tel.labelSuppressed,
      lightOnlyCount:        _tel.lightOnlyCount,
      silhouetteCount:       _tel.silhouetteCount,
      averageReadabilityScore: _tel.readabilityScoreSum / totalVessels,
    };
  }

  function flushTelemetry() {
    var snap = getDebugSnapshot();
    _tel.evaluatedVessels    = 0;
    _tel.evaluatedWakes      = 0;
    _tel.hiddenByAtmosphere  = 0;
    _tel.labelSuppressed     = 0;
    _tel.lightOnlyCount      = 0;
    _tel.silhouetteCount     = 0;
    _tel.readabilityScoreSum = 0;
    return snap;
  }

  // ── Exported constants ────────────────────────────────────────────────────

  var VISIBILITY_CLASS = {
    FULL:               'FULL',
    REDUCED:            'REDUCED',
    SILHOUETTE:         'SILHOUETTE',
    MARKER_ONLY:        'MARKER_ONLY',
    LIGHT_ONLY:         'LIGHT_ONLY',
    ATMOSPHERIC_HIDDEN: 'ATMOSPHERIC_HIDDEN',
  };

  var REASON = {
    DISTANCE_ATTENUATION:     'DISTANCE_ATTENUATION',
    FOG_SUPPRESSION:          'FOG_SUPPRESSION',
    RAIN_SUPPRESSION:         'RAIN_SUPPRESSION',
    NIGHT_LIGHT_ONLY:         'NIGHT_LIGHT_ONLY',
    HAZE_REDUCTION:           'HAZE_REDUCTION',
    CLUTTER_SUPPRESSION:      'CLUTTER_SUPPRESSION',
    LOW_POPULATION_TIER:      'LOW_POPULATION_TIER',
    LOW_TAXONOMY_RESISTANCE:  'LOW_TAXONOMY_RESISTANCE',
    WAKE_FADED:               'WAKE_FADED',
    SYNTHETIC_DEEMPHASIS:     'SYNTHETIC_DEEMPHASIS',
    LABEL_DENSITY_SUPPRESSION:'LABEL_DENSITY_SUPPRESSION',
    MINIMUM_DISTANCE_PROTECTED:'MINIMUM_DISTANCE_PROTECTED',
  };

  // ── Export ────────────────────────────────────────────────────────────────

  SBE.MaritimeAtmosphericReadability = {
    // Core pure functions
    resolveVesselReadability,
    resolveWakeReadability,
    resolveLabelReadability,

    // Telemetry
    getDebugSnapshot,
    flushTelemetry,

    // Constants
    VISIBILITY_CLASS,
    REASON,
    TIER_READABILITY_BASELINE,
    WEATHER_READABILITY_FACTOR,
    TIME_READABILITY_FACTOR,
    PROVENANCE_READABILITY_FACTOR,
    MINIMUM_VISIBLE_DISTANCE_M,

    VERSION,
  };

  console.log('[MaritimeAtmosphericReadability] v' + VERSION + ' loaded — 0523E pure readability interpretation active');

})(window);
