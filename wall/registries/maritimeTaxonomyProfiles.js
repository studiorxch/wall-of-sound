// ── MaritimeTaxonomyProfiles v1.2.2 ─────────────────────────────────────────
// 0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1 (patch v1.2.2)
// Status: active
// Classification: runtime-authority
//
// Patch v1.2.2:
//   - Added enum lookup maps for all six physical categorical fields:
//     lengthClass, beamClass, draftClass, heightClass, superstructureClass, mastDensity
//   - Added Float64Array offsets F_LENGTH_CLASS … F_MAST_DENSITY
//   - COMPILED_VECTOR_SIZE increased from 24 → 30
//   - _compileProfile now strict: invalid enum strings push compile errors;
//     no silent fallback defaults during canonical profile compilation
//   - compiled.physical now includes all six categorical fields as numeric values
//   - _validateCompiledProfile validates all enum fields are non-negative integers
//   - _initRegistry treats compile-time enum errors as MARITIME_TAXONOMY_FAULT
//     and blocks registry startup
//
// Placement: wall/registries/maritimeTaxonomyProfiles.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── System constants ────────────────────────────────────────────────────────

  var TAXONOMY_PROFILE_VERSION    = '1.2.2';
  var BASE_COAST_WINDOW_SEC       = 120;
  var MINIMUM_VISUAL_COAST_MS     = 30000;
  var MAX_PROFILE_LOOKUP_CLASSES  = 11;

  // ── Vessel class string constants ───────────────────────────────────────────
  // Canonical VesselClass enum values. No downstream system may introduce
  // additional primary classes without a taxonomy governance revision.

  var VC_CARGO        = 'CARGO';
  var VC_TANKER       = 'TANKER';
  var VC_PASSENGER    = 'PASSENGER';
  var VC_FERRY        = 'FERRY';
  var VC_TUG          = 'TUG';
  var VC_SERVICE      = 'SERVICE';
  var VC_FISHING      = 'FISHING';
  var VC_RECREATIONAL = 'RECREATIONAL';
  var VC_MILITARY     = 'MILITARY';
  var VC_INDUSTRIAL   = 'INDUSTRIAL';
  var VC_UNKNOWN      = 'UNKNOWN';

  // ── Compiled enum constants (numeric) ─────────────────────────────────────
  // Runtime hot paths use numeric values only. No string matching in tick loops.

  // LengthClass
  var LEN_SMALL   = 0; var LEN_MEDIUM  = 1;
  var LEN_LARGE   = 2; var LEN_MASSIVE = 3;

  // BeamClass
  var BEAM_NARROW   = 0; var BEAM_STANDARD = 1;
  var BEAM_WIDE     = 2; var BEAM_EXTREME  = 3;

  // DraftClass
  var DRAFT_SHALLOW = 0; var DRAFT_MEDIUM  = 1;
  var DRAFT_DEEP    = 2; var DRAFT_EXTREME = 3;

  // HeightClass
  var HEIGHT_LOW    = 0; var HEIGHT_MEDIUM  = 1;
  var HEIGHT_TALL   = 2; var HEIGHT_EXTREME = 3;

  // SuperstructureClass
  var SUPER_MINIMAL    = 0; var SUPER_STANDARD   = 1;
  var SUPER_COMPLEX    = 2; var SUPER_INDUSTRIAL = 3;

  // MastDensity
  var MAST_NONE     = 0; var MAST_SPARSE   = 1;
  var MAST_MODERATE = 2; var MAST_DENSE    = 3;

  // RouteDiscipline
  var ROUTE_FREE     = 0; var ROUTE_VARIABLE = 1;
  var ROUTE_LOCAL    = 2; var ROUTE_CORRIDOR = 3;
  var ROUTE_LOCKED   = 4;

  // DormancyTolerance
  var DORM_LOW    = 0; var DORM_MEDIUM  = 1;
  var DORM_HIGH   = 2; var DORM_EXTREME = 3;

  // SilhouetteClass
  var SIL_BLOCK          = 0; var SIL_LONG_LOW      = 1;
  var SIL_STACKED        = 2; var SIL_COMPACT       = 3;
  var SIL_TALL_PASSENGER = 4; var SIL_UTILITY       = 5;
  var SIL_SMALL_CRAFT    = 6; var SIL_MILITARY      = 7;
  var SIL_UNKNOWN_MARKER = 8;

  // WakeClass
  var WAKE_NONE      = 0; var WAKE_NARROW    = 1;
  var WAKE_STANDARD  = 2; var WAKE_WIDE      = 3;
  var WAKE_HEAVY     = 4; var WAKE_TURBULENT = 5;

  // PopulationRole
  var POP_TRANSIT     = 0; var POP_INDUSTRIAL = 1;
  var POP_SERVICE     = 2; var POP_BACKGROUND = 3;
  var POP_SECURITY    = 4; var POP_UNKNOWN    = 5;

  // ── Compiled vector field offsets (Float64Array layout) ───────────────────
  // Per spec §COMPILED PRIMITIVE MATRIX RECOMMENDATION.
  // Hot-path consumers may address by offset index.
  // Enum fields store integer values; scalar fields store [0.0, 1.0] floats.
  // All six physical categorical fields are included (patch v1.2.2).

  // Scalar fields
  var F_MASS_ENVELOPE            =  0;
  var F_WAKE_AUTHORITY           =  1;
  var F_COAST_WINDOW_MULT        =  2;
  var F_PROJECTION_WEIGHT        =  3;
  var F_ATMOSPHERIC_RESISTANCE   =  4;
  var F_LABEL_PRIORITY           =  5;
  var F_HARBOR_ZONE_AFFINITY     =  6;
  var F_DENSITY_CONTRIBUTION     =  7;
  var F_WEATHER_SENSITIVITY      =  8;
  var F_WAKE_WIDTH               =  9;
  var F_WAKE_PERSISTENCE         = 10;
  var F_TURBULENCE               = 11;
  var F_SHORELINE_INTERACTION    = 12;
  var F_ACCELERATION             = 13;
  var F_TURN_RATE                = 14;
  var F_MANEUVERABILITY          = 15;
  var F_EXPECTED_CRUISE_KTS      = 16;
  var F_MAX_EXPECTED_KTS         = 17;
  var F_MIN_VISUAL_COAST_MS      = 18;  // ms — large int, not normalized scalar

  // Enum int fields (values are compile-time integer constants, not [0,1] floats)
  var F_SILHOUETTE_CLASS         = 19;
  var F_WAKE_CLASS               = 20;
  var F_ROUTE_DISCIPLINE         = 21;
  var F_DORMANCY_TOLERANCE       = 22;
  var F_POPULATION_ROLE          = 23;
  // Physical categorical fields — added patch v1.2.2
  var F_LENGTH_CLASS             = 24;
  var F_BEAM_CLASS               = 25;
  var F_DRAFT_CLASS              = 26;
  var F_HEIGHT_CLASS             = 27;
  var F_SUPER_CLASS              = 28;  // SuperstructureClass
  var F_MAST_DENSITY             = 29;

  var COMPILED_VECTOR_SIZE       = 30;  // bumped from 24 → 30 in patch v1.2.2

  // ── Enum lookup maps ───────────────────────────────────────────────────────
  // Used exclusively by _compileProfile. Invalid keys surface as compile errors.
  // No silent fallback — canonical profiles must not contain unknown enum strings.

  var _lenMap = {
    'SMALL': LEN_SMALL, 'MEDIUM': LEN_MEDIUM,
    'LARGE': LEN_LARGE, 'MASSIVE': LEN_MASSIVE,
  };
  var _beamMap = {
    'NARROW': BEAM_NARROW, 'STANDARD': BEAM_STANDARD,
    'WIDE': BEAM_WIDE, 'EXTREME': BEAM_EXTREME,
  };
  var _draftMap = {
    'SHALLOW': DRAFT_SHALLOW, 'MEDIUM': DRAFT_MEDIUM,
    'DEEP': DRAFT_DEEP, 'EXTREME': DRAFT_EXTREME,
  };
  var _heightMap = {
    'LOW': HEIGHT_LOW, 'MEDIUM': HEIGHT_MEDIUM,
    'TALL': HEIGHT_TALL, 'EXTREME': HEIGHT_EXTREME,
  };
  var _superMap = {
    'MINIMAL': SUPER_MINIMAL, 'STANDARD': SUPER_STANDARD,
    'COMPLEX': SUPER_COMPLEX, 'INDUSTRIAL': SUPER_INDUSTRIAL,
  };
  var _mastMap = {
    'NONE': MAST_NONE, 'SPARSE': MAST_SPARSE,
    'MODERATE': MAST_MODERATE, 'DENSE': MAST_DENSE,
  };
  var _routeMap = {
    'FREE': ROUTE_FREE, 'VARIABLE': ROUTE_VARIABLE, 'LOCAL': ROUTE_LOCAL,
    'CORRIDOR': ROUTE_CORRIDOR, 'ROUTE_LOCKED': ROUTE_LOCKED,
  };
  var _dormMap = {
    'LOW': DORM_LOW, 'MEDIUM': DORM_MEDIUM,
    'HIGH': DORM_HIGH, 'EXTREME': DORM_EXTREME,
  };
  var _silMap = {
    'BLOCK': SIL_BLOCK, 'LONG_LOW': SIL_LONG_LOW, 'STACKED': SIL_STACKED,
    'COMPACT': SIL_COMPACT, 'TALL_PASSENGER': SIL_TALL_PASSENGER,
    'UTILITY': SIL_UTILITY, 'SMALL_CRAFT': SIL_SMALL_CRAFT,
    'MILITARY_PROFILE': SIL_MILITARY, 'UNKNOWN_MARKER': SIL_UNKNOWN_MARKER,
  };
  var _wakeMap = {
    'NONE': WAKE_NONE, 'NARROW': WAKE_NARROW, 'STANDARD': WAKE_STANDARD,
    'WIDE': WAKE_WIDE, 'HEAVY': WAKE_HEAVY, 'TURBULENT': WAKE_TURBULENT,
  };
  var _popMap = {
    'TRANSIT': POP_TRANSIT, 'INDUSTRIAL': POP_INDUSTRIAL, 'SERVICE': POP_SERVICE,
    'BACKGROUND': POP_BACKGROUND, 'SECURITY': POP_SECURITY, 'UNKNOWN': POP_UNKNOWN,
  };

  // ── Authoring profiles ─────────────────────────────────────────────────────
  // Human-readable. Runtime consumes _compiledRegistry only.
  // No fixed-step loop may read from these objects directly.

  var _authoringProfiles = {

    CARGO: {
      vesselClass: VC_CARGO, displayLabel: 'Cargo Vessel',
      physicalProfile: {
        lengthClass: 'MASSIVE', beamClass: 'WIDE', draftClass: 'DEEP',
        heightClass: 'TALL', superstructureClass: 'INDUSTRIAL', mastDensity: 'MODERATE',
        massEnvelope: 0.95, wakeAuthority: 0.9, radarSignature: 0.9,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 12, maxExpectedSpeedKts: 24,
        accelerationFactor: 0.12, turnRateFactor: 0.18, maneuverabilityFactor: 0.2,
        routeDiscipline: 'CORRIDOR',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 1.4, dormantTolerance: 'HIGH',
        minimumVisualCoastMs: 120000,
      },
      wakeEnvelope: {
        wakeClass: 'HEAVY', wakeWidthFactor: 0.85, wakePersistenceFactor: 0.9,
        turbulenceFactor: 0.65, shorelineInteractionFactor: 0.7,
      },
      renderEnvelope: {
        silhouetteClass: 'BLOCK', projectionWeight: 0.85,
        atmosphericResistance: 0.9, labelPriority: 0.75,
      },
      populationEnvelope: {
        populationRole: 'INDUSTRIAL', harborZoneAffinity: 0.85,
        densityContribution: 0.8, weatherSensitivity: 0.25,
      },
    },

    TANKER: {
      vesselClass: VC_TANKER, displayLabel: 'Tanker',
      physicalProfile: {
        lengthClass: 'MASSIVE', beamClass: 'EXTREME', draftClass: 'EXTREME',
        heightClass: 'MEDIUM', superstructureClass: 'INDUSTRIAL', mastDensity: 'SPARSE',
        massEnvelope: 1.0, wakeAuthority: 0.95, radarSignature: 0.95,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 11, maxExpectedSpeedKts: 22,
        accelerationFactor: 0.1, turnRateFactor: 0.14, maneuverabilityFactor: 0.16,
        routeDiscipline: 'CORRIDOR',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 1.5, dormantTolerance: 'EXTREME',
        minimumVisualCoastMs: 150000,
      },
      wakeEnvelope: {
        wakeClass: 'HEAVY', wakeWidthFactor: 0.95, wakePersistenceFactor: 0.95,
        turbulenceFactor: 0.55, shorelineInteractionFactor: 0.75,
      },
      renderEnvelope: {
        silhouetteClass: 'LONG_LOW', projectionWeight: 0.9,
        atmosphericResistance: 0.92, labelPriority: 0.8,
      },
      populationEnvelope: {
        populationRole: 'INDUSTRIAL', harborZoneAffinity: 0.75,
        densityContribution: 0.85, weatherSensitivity: 0.2,
      },
    },

    PASSENGER: {
      vesselClass: VC_PASSENGER, displayLabel: 'Passenger Vessel',
      physicalProfile: {
        lengthClass: 'LARGE', beamClass: 'WIDE', draftClass: 'MEDIUM',
        heightClass: 'EXTREME', superstructureClass: 'COMPLEX', mastDensity: 'MODERATE',
        massEnvelope: 0.75, wakeAuthority: 0.65, radarSignature: 0.85,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 16, maxExpectedSpeedKts: 30,
        accelerationFactor: 0.35, turnRateFactor: 0.35, maneuverabilityFactor: 0.45,
        routeDiscipline: 'CORRIDOR',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 1.15, dormantTolerance: 'HIGH',
        minimumVisualCoastMs: 90000,
      },
      wakeEnvelope: {
        wakeClass: 'STANDARD', wakeWidthFactor: 0.65, wakePersistenceFactor: 0.65,
        turbulenceFactor: 0.4, shorelineInteractionFactor: 0.5,
      },
      renderEnvelope: {
        silhouetteClass: 'TALL_PASSENGER', projectionWeight: 0.8,
        atmosphericResistance: 0.85, labelPriority: 0.8,
      },
      populationEnvelope: {
        populationRole: 'TRANSIT', harborZoneAffinity: 0.7,
        densityContribution: 0.65, weatherSensitivity: 0.35,
      },
    },

    FERRY: {
      vesselClass: VC_FERRY, displayLabel: 'Ferry',
      physicalProfile: {
        lengthClass: 'MEDIUM', beamClass: 'WIDE', draftClass: 'MEDIUM',
        heightClass: 'MEDIUM', superstructureClass: 'STANDARD', mastDensity: 'SPARSE',
        massEnvelope: 0.55, wakeAuthority: 0.65, radarSignature: 0.7,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 14, maxExpectedSpeedKts: 26,
        accelerationFactor: 0.55, turnRateFactor: 0.55, maneuverabilityFactor: 0.65,
        routeDiscipline: 'ROUTE_LOCKED',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 1.1, dormantTolerance: 'HIGH',
        minimumVisualCoastMs: 90000,
      },
      wakeEnvelope: {
        wakeClass: 'STANDARD', wakeWidthFactor: 0.65, wakePersistenceFactor: 0.55,
        turbulenceFactor: 0.35, shorelineInteractionFactor: 0.45,
      },
      renderEnvelope: {
        silhouetteClass: 'STACKED', projectionWeight: 0.72,
        atmosphericResistance: 0.78, labelPriority: 0.85,
      },
      populationEnvelope: {
        populationRole: 'TRANSIT', harborZoneAffinity: 0.95,
        densityContribution: 0.55, weatherSensitivity: 0.4,
      },
    },

    TUG: {
      vesselClass: VC_TUG, displayLabel: 'Tug',
      physicalProfile: {
        lengthClass: 'SMALL', beamClass: 'WIDE', draftClass: 'MEDIUM',
        heightClass: 'LOW', superstructureClass: 'STANDARD', mastDensity: 'SPARSE',
        massEnvelope: 0.35, wakeAuthority: 0.6, radarSignature: 0.55,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 8, maxExpectedSpeedKts: 18,
        accelerationFactor: 0.75, turnRateFactor: 0.85, maneuverabilityFactor: 0.9,
        routeDiscipline: 'LOCAL',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 0.95, dormantTolerance: 'MEDIUM',
        minimumVisualCoastMs: 60000,
      },
      wakeEnvelope: {
        wakeClass: 'TURBULENT', wakeWidthFactor: 0.45, wakePersistenceFactor: 0.55,
        turbulenceFactor: 0.85, shorelineInteractionFactor: 0.6,
      },
      renderEnvelope: {
        silhouetteClass: 'COMPACT', projectionWeight: 0.65,
        atmosphericResistance: 0.7, labelPriority: 0.7,
      },
      populationEnvelope: {
        populationRole: 'SERVICE', harborZoneAffinity: 0.9,
        densityContribution: 0.45, weatherSensitivity: 0.3,
      },
    },

    SERVICE: {
      vesselClass: VC_SERVICE, displayLabel: 'Service Vessel',
      physicalProfile: {
        lengthClass: 'SMALL', beamClass: 'STANDARD', draftClass: 'SHALLOW',
        heightClass: 'LOW', superstructureClass: 'STANDARD', mastDensity: 'MODERATE',
        massEnvelope: 0.3, wakeAuthority: 0.35, radarSignature: 0.45,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 10, maxExpectedSpeedKts: 24,
        accelerationFactor: 0.65, turnRateFactor: 0.7, maneuverabilityFactor: 0.75,
        routeDiscipline: 'LOCAL',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 0.85, dormantTolerance: 'MEDIUM',
        minimumVisualCoastMs: 45000,
      },
      wakeEnvelope: {
        wakeClass: 'NARROW', wakeWidthFactor: 0.35, wakePersistenceFactor: 0.35,
        turbulenceFactor: 0.35, shorelineInteractionFactor: 0.4,
      },
      renderEnvelope: {
        silhouetteClass: 'UTILITY', projectionWeight: 0.55,
        atmosphericResistance: 0.6, labelPriority: 0.55,
      },
      populationEnvelope: {
        populationRole: 'SERVICE', harborZoneAffinity: 0.8,
        densityContribution: 0.35, weatherSensitivity: 0.45,
      },
    },

    FISHING: {
      vesselClass: VC_FISHING, displayLabel: 'Fishing Vessel',
      physicalProfile: {
        lengthClass: 'SMALL', beamClass: 'STANDARD', draftClass: 'MEDIUM',
        heightClass: 'LOW', superstructureClass: 'STANDARD', mastDensity: 'DENSE',
        massEnvelope: 0.32, wakeAuthority: 0.32, radarSignature: 0.5,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 7, maxExpectedSpeedKts: 20,
        accelerationFactor: 0.45, turnRateFactor: 0.55, maneuverabilityFactor: 0.55,
        routeDiscipline: 'VARIABLE',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 0.8, dormantTolerance: 'MEDIUM',
        minimumVisualCoastMs: 45000,
      },
      wakeEnvelope: {
        wakeClass: 'NARROW', wakeWidthFactor: 0.3, wakePersistenceFactor: 0.3,
        turbulenceFactor: 0.45, shorelineInteractionFactor: 0.35,
      },
      renderEnvelope: {
        silhouetteClass: 'UTILITY', projectionWeight: 0.5,
        atmosphericResistance: 0.55, labelPriority: 0.45,
      },
      populationEnvelope: {
        populationRole: 'BACKGROUND', harborZoneAffinity: 0.5,
        densityContribution: 0.3, weatherSensitivity: 0.65,
      },
    },

    RECREATIONAL: {
      vesselClass: VC_RECREATIONAL, displayLabel: 'Recreational Vessel',
      physicalProfile: {
        lengthClass: 'SMALL', beamClass: 'NARROW', draftClass: 'SHALLOW',
        heightClass: 'LOW', superstructureClass: 'MINIMAL', mastDensity: 'SPARSE',
        massEnvelope: 0.15, wakeAuthority: 0.2, radarSignature: 0.25,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 12, maxExpectedSpeedKts: 35,
        accelerationFactor: 0.75, turnRateFactor: 0.8, maneuverabilityFactor: 0.85,
        routeDiscipline: 'FREE',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 0.6, dormantTolerance: 'LOW',
        minimumVisualCoastMs: 30000,
      },
      wakeEnvelope: {
        wakeClass: 'NARROW', wakeWidthFactor: 0.22, wakePersistenceFactor: 0.2,
        turbulenceFactor: 0.25, shorelineInteractionFactor: 0.25,
      },
      renderEnvelope: {
        silhouetteClass: 'SMALL_CRAFT', projectionWeight: 0.35,
        atmosphericResistance: 0.35, labelPriority: 0.25,
      },
      populationEnvelope: {
        populationRole: 'BACKGROUND', harborZoneAffinity: 0.45,
        densityContribution: 0.2, weatherSensitivity: 0.8,
      },
    },

    MILITARY: {
      vesselClass: VC_MILITARY, displayLabel: 'Military Vessel',
      physicalProfile: {
        lengthClass: 'LARGE', beamClass: 'STANDARD', draftClass: 'DEEP',
        heightClass: 'TALL', superstructureClass: 'COMPLEX', mastDensity: 'DENSE',
        massEnvelope: 0.8, wakeAuthority: 0.65, radarSignature: 0.85,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 16, maxExpectedSpeedKts: 35,
        accelerationFactor: 0.55, turnRateFactor: 0.5, maneuverabilityFactor: 0.6,
        routeDiscipline: 'LOCAL',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 1.2, dormantTolerance: 'HIGH',
        minimumVisualCoastMs: 90000,
      },
      wakeEnvelope: {
        wakeClass: 'STANDARD', wakeWidthFactor: 0.6, wakePersistenceFactor: 0.6,
        turbulenceFactor: 0.45, shorelineInteractionFactor: 0.5,
      },
      renderEnvelope: {
        silhouetteClass: 'MILITARY_PROFILE', projectionWeight: 0.8,
        atmosphericResistance: 0.8, labelPriority: 0.75,
      },
      populationEnvelope: {
        populationRole: 'SECURITY', harborZoneAffinity: 0.5,
        densityContribution: 0.5, weatherSensitivity: 0.25,
      },
    },

    INDUSTRIAL: {
      vesselClass: VC_INDUSTRIAL, displayLabel: 'Industrial Vessel',
      physicalProfile: {
        lengthClass: 'LARGE', beamClass: 'WIDE', draftClass: 'DEEP',
        heightClass: 'TALL', superstructureClass: 'INDUSTRIAL', mastDensity: 'DENSE',
        massEnvelope: 0.85, wakeAuthority: 0.75, radarSignature: 0.8,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 8, maxExpectedSpeedKts: 18,
        accelerationFactor: 0.25, turnRateFactor: 0.25, maneuverabilityFactor: 0.3,
        routeDiscipline: 'LOCAL',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 1.25, dormantTolerance: 'HIGH',
        minimumVisualCoastMs: 90000,
      },
      wakeEnvelope: {
        wakeClass: 'HEAVY', wakeWidthFactor: 0.75, wakePersistenceFactor: 0.75,
        turbulenceFactor: 0.65, shorelineInteractionFactor: 0.65,
      },
      renderEnvelope: {
        silhouetteClass: 'UTILITY', projectionWeight: 0.75,
        atmosphericResistance: 0.75, labelPriority: 0.65,
      },
      populationEnvelope: {
        populationRole: 'INDUSTRIAL', harborZoneAffinity: 0.85,
        densityContribution: 0.7, weatherSensitivity: 0.35,
      },
    },

    UNKNOWN: {
      vesselClass: VC_UNKNOWN, displayLabel: 'Unknown Vessel',
      physicalProfile: {
        lengthClass: 'MEDIUM', beamClass: 'STANDARD', draftClass: 'MEDIUM',
        heightClass: 'MEDIUM', superstructureClass: 'STANDARD', mastDensity: 'SPARSE',
        massEnvelope: 0.4, wakeAuthority: 0.3, radarSignature: 0.35,
      },
      motionEnvelope: {
        expectedCruiseSpeedKts: 8, maxExpectedSpeedKts: 20,
        accelerationFactor: 0.4, turnRateFactor: 0.4, maneuverabilityFactor: 0.4,
        routeDiscipline: 'LOCAL',
      },
      continuityEnvelope: {
        coastWindowMultiplier: 0.75, dormantTolerance: 'LOW',
        minimumVisualCoastMs: 30000,
      },
      wakeEnvelope: {
        wakeClass: 'STANDARD', wakeWidthFactor: 0.35, wakePersistenceFactor: 0.3,
        turbulenceFactor: 0.3, shorelineInteractionFactor: 0.25,
      },
      renderEnvelope: {
        silhouetteClass: 'UNKNOWN_MARKER', projectionWeight: 0.4,
        atmosphericResistance: 0.45, labelPriority: 0.35,
      },
      populationEnvelope: {
        populationRole: 'UNKNOWN', harborZoneAffinity: 0.3,
        densityContribution: 0.25, weatherSensitivity: 0.5,
      },
    },
  };

  // ── Strict enum lookup helper ──────────────────────────────────────────────
  // Used by _compileProfile. Returns the numeric value if valid, or pushes an
  // error string into the provided errors array and returns -1 (invalid sentinel).
  // -1 is never a valid enum value; validation catches it.

  function _lookupEnum(map, value, fieldName, vesselClass, errors) {
    var result = map[value];
    if (result !== undefined) return result;
    errors.push(vesselClass + '.' + fieldName + ' "' + value + '" is not a valid enum value');
    return -1; // invalid sentinel — caught by _validateCompiledProfile
  }

  // ── Profile compilation ────────────────────────────────────────────────────
  // Converts authoring profile into compiled runtime object.
  //
  // Returns { compiled, compileErrors } where compileErrors is an array of
  // strings describing invalid enum values encountered during compilation.
  // Callers must treat any non-empty compileErrors as a MARITIME_TAXONOMY_FAULT.
  //
  // Invalid enum strings produce -1 sentinel values in the vector; they are
  // never silently defaulted. _validateCompiledProfile will catch them.

  function _compileProfile(authoring) {
    var p  = authoring;
    var ph = p.physicalProfile;
    var mo = p.motionEnvelope;
    var co = p.continuityEnvelope;
    var we = p.wakeEnvelope;
    var re = p.renderEnvelope;
    var po = p.populationEnvelope;
    var vc = p.vesselClass;

    var compileErrors = [];

    // Compile all enum fields strictly — no silent fallback
    var lenVal   = _lookupEnum(_lenMap,   ph.lengthClass,        'lengthClass',        vc, compileErrors);
    var beamVal  = _lookupEnum(_beamMap,  ph.beamClass,          'beamClass',          vc, compileErrors);
    var draftVal = _lookupEnum(_draftMap, ph.draftClass,         'draftClass',         vc, compileErrors);
    var htVal    = _lookupEnum(_heightMap,ph.heightClass,        'heightClass',        vc, compileErrors);
    var superVal = _lookupEnum(_superMap, ph.superstructureClass,'superstructureClass', vc, compileErrors);
    var mastVal  = _lookupEnum(_mastMap,  ph.mastDensity,        'mastDensity',        vc, compileErrors);
    var silVal   = _lookupEnum(_silMap,   re.silhouetteClass,    'silhouetteClass',    vc, compileErrors);
    var wakeVal  = _lookupEnum(_wakeMap,  we.wakeClass,          'wakeClass',          vc, compileErrors);
    var routeVal = _lookupEnum(_routeMap, mo.routeDiscipline,    'routeDiscipline',    vc, compileErrors);
    var dormVal  = _lookupEnum(_dormMap,  co.dormantTolerance,   'dormantTolerance',   vc, compileErrors);
    var popVal   = _lookupEnum(_popMap,   po.populationRole,     'populationRole',     vc, compileErrors);

    // Build Float64Array vector
    var vec = new Float64Array(COMPILED_VECTOR_SIZE);

    // Scalar fields
    vec[F_MASS_ENVELOPE]          = ph.massEnvelope;
    vec[F_WAKE_AUTHORITY]         = ph.wakeAuthority;
    vec[F_COAST_WINDOW_MULT]      = co.coastWindowMultiplier;
    vec[F_PROJECTION_WEIGHT]      = re.projectionWeight;
    vec[F_ATMOSPHERIC_RESISTANCE] = re.atmosphericResistance;
    vec[F_LABEL_PRIORITY]         = re.labelPriority;
    vec[F_HARBOR_ZONE_AFFINITY]   = po.harborZoneAffinity;
    vec[F_DENSITY_CONTRIBUTION]   = po.densityContribution;
    vec[F_WEATHER_SENSITIVITY]    = po.weatherSensitivity;
    vec[F_WAKE_WIDTH]             = we.wakeWidthFactor;
    vec[F_WAKE_PERSISTENCE]       = we.wakePersistenceFactor;
    vec[F_TURBULENCE]             = we.turbulenceFactor;
    vec[F_SHORELINE_INTERACTION]  = we.shorelineInteractionFactor;
    vec[F_ACCELERATION]           = mo.accelerationFactor;
    vec[F_TURN_RATE]              = mo.turnRateFactor;
    vec[F_MANEUVERABILITY]        = mo.maneuverabilityFactor;
    vec[F_EXPECTED_CRUISE_KTS]    = mo.expectedCruiseSpeedKts;
    vec[F_MAX_EXPECTED_KTS]       = mo.maxExpectedSpeedKts;
    vec[F_MIN_VISUAL_COAST_MS]    = co.minimumVisualCoastMs;

    // Enum int fields (may be -1 sentinel if lookup failed — caught by validation)
    vec[F_SILHOUETTE_CLASS]       = silVal;
    vec[F_WAKE_CLASS]             = wakeVal;
    vec[F_ROUTE_DISCIPLINE]       = routeVal;
    vec[F_DORMANCY_TOLERANCE]     = dormVal;
    vec[F_POPULATION_ROLE]        = popVal;
    vec[F_LENGTH_CLASS]           = lenVal;
    vec[F_BEAM_CLASS]             = beamVal;
    vec[F_DRAFT_CLASS]            = draftVal;
    vec[F_HEIGHT_CLASS]           = htVal;
    vec[F_SUPER_CLASS]            = superVal;
    vec[F_MAST_DENSITY]           = mastVal;

    var compiled = {
      vesselClass:  vc,
      displayLabel: p.displayLabel,
      version:      TAXONOMY_PROFILE_VERSION,

      // Structured readable fields (for non-hot-path consumers)
      physical: {
        // Scalar fields
        massEnvelope:   ph.massEnvelope,
        wakeAuthority:  ph.wakeAuthority,
        radarSignature: ph.radarSignature,
        // Physical categorical fields — compiled to numeric (patch v1.2.2)
        lengthClass:        lenVal,
        beamClass:          beamVal,
        draftClass:         draftVal,
        heightClass:        htVal,
        superstructureClass:superVal,
        mastDensity:        mastVal,
      },
      motion: {
        expectedCruiseSpeedKts: mo.expectedCruiseSpeedKts,
        maxExpectedSpeedKts:    mo.maxExpectedSpeedKts,
        accelerationFactor:     mo.accelerationFactor,
        turnRateFactor:         mo.turnRateFactor,
        maneuverabilityFactor:  mo.maneuverabilityFactor,
        routeDiscipline:        routeVal,
      },
      continuity: {
        coastWindowMultiplier:   co.coastWindowMultiplier,
        dormantTolerance:        dormVal,
        minimumVisualCoastMs:    co.minimumVisualCoastMs,
        effectiveCoastWindowSec: BASE_COAST_WINDOW_SEC * co.coastWindowMultiplier,
      },
      wake: {
        wakeClass:                  wakeVal,
        wakeWidthFactor:            we.wakeWidthFactor,
        wakePersistenceFactor:      we.wakePersistenceFactor,
        turbulenceFactor:           we.turbulenceFactor,
        shorelineInteractionFactor: we.shorelineInteractionFactor,
      },
      render: {
        silhouetteClass:       silVal,
        projectionWeight:      re.projectionWeight,
        atmosphericResistance: re.atmosphericResistance,
        labelPriority:         re.labelPriority,
      },
      population: {
        populationRole:      popVal,
        harborZoneAffinity:  po.harborZoneAffinity,
        densityContribution: po.densityContribution,
        weatherSensitivity:  po.weatherSensitivity,
      },

      // Float64Array vector for hot-path offset access
      vec: vec,
    };

    return { compiled: compiled, compileErrors: compileErrors };
  }

  // ── Profile validation ─────────────────────────────────────────────────────
  // Validates that:
  //   - normalized scalar fields are in [0.0, 1.0]
  //   - enum fields are non-negative integers (rejects -1 sentinel from failed lookups)
  //   - required numeric bounds are positive
  //
  // Used at registry initialization. Canonical failures block startup.

  function _validateCompiledProfile(compiled) {
    var errors = [];
    var vc  = compiled.vesselClass;
    var vec = compiled.vec;

    // Normalized scalar fields — must be in [0.0, 1.0]
    var scalarOffsets = [
      F_MASS_ENVELOPE, F_WAKE_AUTHORITY, F_PROJECTION_WEIGHT,
      F_ATMOSPHERIC_RESISTANCE, F_LABEL_PRIORITY, F_HARBOR_ZONE_AFFINITY,
      F_DENSITY_CONTRIBUTION, F_WEATHER_SENSITIVITY, F_WAKE_WIDTH,
      F_WAKE_PERSISTENCE, F_TURBULENCE, F_SHORELINE_INTERACTION,
      F_ACCELERATION, F_TURN_RATE, F_MANEUVERABILITY,
    ];
    var scalarNames = [
      'massEnvelope', 'wakeAuthority', 'projectionWeight',
      'atmosphericResistance', 'labelPriority', 'harborZoneAffinity',
      'densityContribution', 'weatherSensitivity', 'wakeWidthFactor',
      'wakePersistenceFactor', 'turbulenceFactor', 'shorelineInteractionFactor',
      'accelerationFactor', 'turnRateFactor', 'maneuverabilityFactor',
    ];
    for (var i = 0; i < scalarOffsets.length; i++) {
      var sv = vec[scalarOffsets[i]];
      if (!Number.isFinite(sv) || sv < 0 || sv > 1) {
        errors.push(vc + '.' + scalarNames[i] + '=' + sv + ' out of [0,1]');
      }
    }

    // Enum int fields — must be non-negative integers.
    // -1 is the invalid sentinel produced when an enum string lookup failed in _compileProfile.
    var enumOffsets = [
      F_SILHOUETTE_CLASS, F_WAKE_CLASS, F_ROUTE_DISCIPLINE,
      F_DORMANCY_TOLERANCE, F_POPULATION_ROLE,
      F_LENGTH_CLASS, F_BEAM_CLASS, F_DRAFT_CLASS,
      F_HEIGHT_CLASS, F_SUPER_CLASS, F_MAST_DENSITY,
    ];
    var enumNames = [
      'silhouetteClass', 'wakeClass', 'routeDiscipline',
      'dormantTolerance', 'populationRole',
      'lengthClass', 'beamClass', 'draftClass',
      'heightClass', 'superstructureClass', 'mastDensity',
    ];
    for (var j = 0; j < enumOffsets.length; j++) {
      var ev = vec[enumOffsets[j]];
      if (!Number.isFinite(ev) || ev < 0 || Math.floor(ev) !== ev) {
        errors.push(vc + '.' + enumNames[j] + '=' + ev + ' is not a valid compiled enum integer (invalid sentinel or NaN)');
      }
    }

    // Required numeric bounds
    if (!compiled.vesselClass)              errors.push(vc + ': vesselClass missing');
    if (vec[F_MAX_EXPECTED_KTS]   <= 0)     errors.push(vc + '.maxExpectedSpeedKts must be > 0');
    if (vec[F_EXPECTED_CRUISE_KTS] <= 0)    errors.push(vc + '.expectedCruiseSpeedKts must be > 0');
    if (vec[F_MIN_VISUAL_COAST_MS] < 0)     errors.push(vc + '.minimumVisualCoastMs must be >= 0');
    if (vec[F_COAST_WINDOW_MULT]   <= 0)    errors.push(vc + '.coastWindowMultiplier must be > 0');

    return errors;
  }

  // ── Registry initialization ────────────────────────────────────────────────
  // Compiles all canonical profiles at startup.
  // Compile errors (invalid enum strings) and validation errors both cause
  // MARITIME_TAXONOMY_FAULT and block registry startup.

  var _compiledRegistry = {};
  var _initialized = false;

  var _CANONICAL_CLASSES = [
    VC_CARGO, VC_TANKER, VC_PASSENGER, VC_FERRY, VC_TUG,
    VC_SERVICE, VC_FISHING, VC_RECREATIONAL, VC_MILITARY, VC_INDUSTRIAL, VC_UNKNOWN,
  ];

  function _initRegistry() {
    if (_initialized) return;

    var faults = [];

    for (var i = 0; i < _CANONICAL_CLASSES.length; i++) {
      var vc       = _CANONICAL_CLASSES[i];
      var authoring = _authoringProfiles[vc];

      if (!authoring) {
        faults.push(vc + ': authoring profile missing');
        continue;
      }

      var result = _compileProfile(authoring);

      // Compile-time enum errors are faults — no silent defaults allowed
      if (result.compileErrors.length > 0) {
        faults = faults.concat(result.compileErrors);
        continue; // skip validation — compiled data is already known-bad
      }

      var validationErrors = _validateCompiledProfile(result.compiled);
      if (validationErrors.length > 0) {
        faults = faults.concat(validationErrors);
        continue;
      }

      _compiledRegistry[vc] = result.compiled;
    }

    if (faults.length > 0) {
      // Block startup — canonical failures are constitutional violations.
      console.error('[MaritimeTaxonomyProfiles] MARITIME_TAXONOMY_FAULT — registry startup blocked');
      faults.forEach(function (f) { console.error('  ' + f); });
      return; // _initialized remains false — registry is unusable
    }

    _initialized = true;
    console.log('[MaritimeTaxonomyProfiles v' + TAXONOMY_PROFILE_VERSION + '] initialized —',
      Object.keys(_compiledRegistry).length, 'profiles compiled, vectorSize:', COMPILED_VECTOR_SIZE);
  }

  // ── AIS type code → VesselClass mapping ───────────────────────────────────
  // Numeric ranges only — no string matching.
  // MILITARY branch (56–57) is explicitly reachable.
  // AIS 0–19 explicitly maps to UNKNOWN (not a fallthrough).
  //
  // Ferry: requires trusted metadata — AIS type alone insufficient.
  // Graceful degradation if ferry registry unavailable.

  function resolveVesselClassFromAIS(aisTypeCode, metadata) {
    if (metadata && metadata.trustedVesselClass) {
      return metadata.trustedVesselClass;
    }
    if (metadata && _isKnownFerry(metadata)) {
      return VC_FERRY;
    }
    if (aisTypeCode == null || !Number.isFinite(aisTypeCode)) return VC_UNKNOWN;

    var code = Math.floor(aisTypeCode);
    if (code >= 0  && code <= 19)  return VC_UNKNOWN;
    if (code >= 20 && code <= 29)  return VC_SERVICE;
    if (code >= 30 && code <= 39)  return VC_FISHING;
    if (code >= 40 && code <= 55)  return VC_SERVICE;
    if (code >= 56 && code <= 57)  return VC_MILITARY;
    if (code >= 58 && code <= 59)  return VC_SERVICE;
    if (code >= 60 && code <= 69)  return VC_PASSENGER;
    if (code >= 70 && code <= 79)  return VC_CARGO;
    if (code >= 80 && code <= 89)  return VC_TANKER;
    if (code >= 90 && code <= 99)  return VC_INDUSTRIAL;
    return VC_UNKNOWN;
  }

  function _isKnownFerry(metadata) {
    if (!metadata) return false;
    if (metadata.trustedVesselClass === VC_FERRY) return true;
    var frr = global.SBE && SBE.FerryRouteRegistry;
    if (frr && frr.isKnownFerry) return frr.isKnownFerry(metadata);
    return false;
  }

  // ── Class stickiness enforcement ───────────────────────────────────────────

  function assignVesselClassForLifecycle(vesselId, currentRegistryEntry, proposedClass) {
    if (currentRegistryEntry && currentRegistryEntry.vesselClass) {
      return currentRegistryEntry.vesselClass;
    }
    return proposedClass || VC_UNKNOWN;
  }

  // ── Profile lookup ─────────────────────────────────────────────────────────

  function getTaxonomyProfile(vesselClass) {
    if (!_initialized) {
      console.warn('[MaritimeTaxonomyProfiles] registry not initialized — returning UNKNOWN');
      return _compiledRegistry[VC_UNKNOWN] || null;
    }
    return _compiledRegistry[vesselClass] || _compiledRegistry[VC_UNKNOWN];
  }

  function resolveVesselProfile(vesselId, vesselClass) {
    var profile = _compiledRegistry[vesselClass];
    if (profile) return profile;
    console.warn('[MaritimeTaxonomyProfiles] MARITIME_TAXONOMY_FAULT — vessel', vesselId,
      'class', vesselClass, '— replacing with UNKNOWN_PROFILE');
    return _compiledRegistry[VC_UNKNOWN];
  }

  function checkSpeedAnomaly(vesselId, vesselClass, speedKts) {
    var profile = _compiledRegistry[vesselClass];
    if (!profile) return;
    var maxKts = profile.vec[F_MAX_EXPECTED_KTS];
    if (speedKts > maxKts) {
      console.warn('[MaritimeTaxonomyProfiles] speed anomaly — vessel', vesselId,
        'class', vesselClass, 'speed', speedKts.toFixed(1) + 'kts > max', maxKts + 'kts',
        '— AIS truth preserved, anomaly logged only');
    }
  }

  // ── Debug snapshot ─────────────────────────────────────────────────────────

  function getDebugSnapshot() {
    return {
      version:     TAXONOMY_PROFILE_VERSION,
      initialized: _initialized,
      classCount:  Object.keys(_compiledRegistry).length,
      classes:     Object.keys(_compiledRegistry),
      constants: {
        BASE_COAST_WINDOW_SEC:   BASE_COAST_WINDOW_SEC,
        MINIMUM_VISUAL_COAST_MS: MINIMUM_VISUAL_COAST_MS,
        COMPILED_VECTOR_SIZE:    COMPILED_VECTOR_SIZE,
      },
    };
  }

  // ── resolveWakeAuthorityClass ─────────────────────────────────────────────
  // Resolves ISSUE-0523A-001: taxonomy-side bridge from 6-value WAKE_CLS enum
  // to WakeAuthority's 4-value wake class enum (NONE/MINIMAL/STANDARD/HEAVY).
  //
  // Mapping contract (mirrors WakeAuthority._ensureWakeClassMap()):
  //   WAKE_NONE      (0) → 'NONE'
  //   WAKE_NARROW    (1) → 'MINIMAL'
  //   WAKE_STANDARD  (2) → 'STANDARD'
  //   WAKE_WIDE      (3) → 'STANDARD'
  //   WAKE_HEAVY     (4) → 'HEAVY'
  //   WAKE_TURBULENT (5) → 'HEAVY'
  //
  // Returns null if vesselClass is unrecognized or profile compilation failed.
  // This function is non-hot-path only; never call in per-tick loops.

  function resolveWakeAuthorityClass(vesselClass) {
    var profile = _compiledProfiles[vesselClass];
    if (!profile || !profile.vec) return null;
    var wakeCls = profile.vec[F_WAKE_CLASS];
    if (wakeCls === WAKE_NONE)                            return 'NONE';
    if (wakeCls === WAKE_NARROW)                          return 'MINIMAL';
    if (wakeCls === WAKE_STANDARD || wakeCls === WAKE_WIDE) return 'STANDARD';
    if (wakeCls === WAKE_HEAVY    || wakeCls === WAKE_TURBULENT) return 'HEAVY';
    return null;
  }

  // ── Auto-initialize at script load ────────────────────────────────────────

  _initRegistry();

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.MaritimeTaxonomyProfiles = {
    // Core functions
    resolveVesselClassFromAIS,
    assignVesselClassForLifecycle,
    getTaxonomyProfile,
    resolveVesselProfile,
    checkSpeedAnomaly,
    getDebugSnapshot,
    // ISSUE-0523A-001: taxonomy → WakeAuthority wake class bridge
    resolveWakeAuthorityClass,

    // Compiled vector field offsets (for hot-path consumers)
    F: {
      // Scalar fields
      MASS_ENVELOPE:          F_MASS_ENVELOPE,
      WAKE_AUTHORITY:         F_WAKE_AUTHORITY,
      COAST_WINDOW_MULT:      F_COAST_WINDOW_MULT,
      PROJECTION_WEIGHT:      F_PROJECTION_WEIGHT,
      ATMOSPHERIC_RESISTANCE: F_ATMOSPHERIC_RESISTANCE,
      LABEL_PRIORITY:         F_LABEL_PRIORITY,
      HARBOR_ZONE_AFFINITY:   F_HARBOR_ZONE_AFFINITY,
      DENSITY_CONTRIBUTION:   F_DENSITY_CONTRIBUTION,
      WEATHER_SENSITIVITY:    F_WEATHER_SENSITIVITY,
      WAKE_WIDTH:             F_WAKE_WIDTH,
      WAKE_PERSISTENCE:       F_WAKE_PERSISTENCE,
      TURBULENCE:             F_TURBULENCE,
      SHORELINE_INTERACTION:  F_SHORELINE_INTERACTION,
      ACCELERATION:           F_ACCELERATION,
      TURN_RATE:              F_TURN_RATE,
      MANEUVERABILITY:        F_MANEUVERABILITY,
      EXPECTED_CRUISE_KTS:    F_EXPECTED_CRUISE_KTS,
      MAX_EXPECTED_KTS:       F_MAX_EXPECTED_KTS,
      MIN_VISUAL_COAST_MS:    F_MIN_VISUAL_COAST_MS,
      // Enum int fields
      SILHOUETTE_CLASS:       F_SILHOUETTE_CLASS,
      WAKE_CLASS:             F_WAKE_CLASS,
      ROUTE_DISCIPLINE:       F_ROUTE_DISCIPLINE,
      DORMANCY_TOLERANCE:     F_DORMANCY_TOLERANCE,
      POPULATION_ROLE:        F_POPULATION_ROLE,
      // Physical categorical fields (patch v1.2.2)
      LENGTH_CLASS:           F_LENGTH_CLASS,
      BEAM_CLASS:             F_BEAM_CLASS,
      DRAFT_CLASS:            F_DRAFT_CLASS,
      HEIGHT_CLASS:           F_HEIGHT_CLASS,
      SUPER_CLASS:            F_SUPER_CLASS,
      MAST_DENSITY:           F_MAST_DENSITY,
    },

    // Compiled enum constants (for hot-path comparison against vec values)
    LEN:  { SMALL: LEN_SMALL, MEDIUM: LEN_MEDIUM, LARGE: LEN_LARGE, MASSIVE: LEN_MASSIVE },
    BEAM: { NARROW: BEAM_NARROW, STANDARD: BEAM_STANDARD, WIDE: BEAM_WIDE, EXTREME: BEAM_EXTREME },
    DRAFT:{ SHALLOW: DRAFT_SHALLOW, MEDIUM: DRAFT_MEDIUM, DEEP: DRAFT_DEEP, EXTREME: DRAFT_EXTREME },
    HT:   { LOW: HEIGHT_LOW, MEDIUM: HEIGHT_MEDIUM, TALL: HEIGHT_TALL, EXTREME: HEIGHT_EXTREME },
    SUPER:{ MINIMAL: SUPER_MINIMAL, STANDARD: SUPER_STANDARD, COMPLEX: SUPER_COMPLEX, INDUSTRIAL: SUPER_INDUSTRIAL },
    MAST: { NONE: MAST_NONE, SPARSE: MAST_SPARSE, MODERATE: MAST_MODERATE, DENSE: MAST_DENSE },
    ROUTE:    { FREE: ROUTE_FREE, VARIABLE: ROUTE_VARIABLE, LOCAL: ROUTE_LOCAL, CORRIDOR: ROUTE_CORRIDOR, LOCKED: ROUTE_LOCKED },
    SILHOUETTE: { BLOCK: SIL_BLOCK, LONG_LOW: SIL_LONG_LOW, STACKED: SIL_STACKED, COMPACT: SIL_COMPACT, TALL_PASSENGER: SIL_TALL_PASSENGER, UTILITY: SIL_UTILITY, SMALL_CRAFT: SIL_SMALL_CRAFT, MILITARY: SIL_MILITARY, UNKNOWN_MARKER: SIL_UNKNOWN_MARKER },
    WAKE_CLS: { NONE: WAKE_NONE, NARROW: WAKE_NARROW, STANDARD: WAKE_STANDARD, WIDE: WAKE_WIDE, HEAVY: WAKE_HEAVY, TURBULENT: WAKE_TURBULENT },
    POP:  { TRANSIT: POP_TRANSIT, INDUSTRIAL: POP_INDUSTRIAL, SERVICE: POP_SERVICE, BACKGROUND: POP_BACKGROUND, SECURITY: POP_SECURITY, UNKNOWN: POP_UNKNOWN },
    DORM: { LOW: DORM_LOW, MEDIUM: DORM_MEDIUM, HIGH: DORM_HIGH, EXTREME: DORM_EXTREME },

    // Vessel class string constants
    VC: {
      CARGO: VC_CARGO, TANKER: VC_TANKER, PASSENGER: VC_PASSENGER, FERRY: VC_FERRY,
      TUG: VC_TUG, SERVICE: VC_SERVICE, FISHING: VC_FISHING, RECREATIONAL: VC_RECREATIONAL,
      MILITARY: VC_MILITARY, INDUSTRIAL: VC_INDUSTRIAL, UNKNOWN: VC_UNKNOWN,
    },

    // System constants
    BASE_COAST_WINDOW_SEC,
    MINIMUM_VISUAL_COAST_MS,
    TAXONOMY_PROFILE_VERSION,
    COMPILED_VECTOR_SIZE,
  };

})(window);
