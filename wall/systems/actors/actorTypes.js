// ── ActorTypes v1.0.0 ─────────────────────────────────────────────────────────
// 0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0
// Status: active | Classification: actor-authority (data layer)
//
// Canonical actor-type string constants + category helpers. No imports, no
// rendering, no feed logic. Browser-safe IIFE attached to global.SBE.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Canonical type strings — "category.kind".
  var TYPES = {
    VEHICLE_BUS:       'vehicle.bus',
    VEHICLE_UTILITY:   'vehicle.utility',
    VEHICLE_SYNTHETIC: 'vehicle.synthetic',
    BIKE_STATION:      'bike.station',
    BIKE_VEHICLE:      'bike.vehicle',
    TRANSIT_TRAIN:     'transit.train',
    MARINE_VESSEL:     'marine.vessel',
    MARINE_FERRY:      'marine.ferry',
    AIRCRAFT_PLANE:    'aircraft.plane',
    CIVIC_INCIDENT:    'civic.incident',
    WORLD_PROP:        'world.prop',
  };

  var ALL = [];
  for (var k in TYPES) { if (TYPES.hasOwnProperty(k)) ALL.push(TYPES[k]); }

  // Category = the segment before the dot (vehicle/bike/transit/marine/…).
  function toCategory(type) {
    if (!type || typeof type !== 'string') return 'unknown';
    var i = type.indexOf('.');
    return i > 0 ? type.slice(0, i) : type;
  }

  // Vehicle-like = road/street movers (vehicle.* and bike.vehicle).
  function isVehicle(type) {
    return /^vehicle\./.test(type || '') || type === TYPES.BIKE_VEHICLE;
  }

  // Truth-backed = everything except the internal synthetic filler.
  function isTruthBacked(type) {
    return type !== TYPES.VEHICLE_SYNTHETIC && ALL.indexOf(type) !== -1;
  }

  SBE.ActorTypes = Object.freeze({
    VERSION:        VERSION,
    // constants
    VEHICLE_BUS:       TYPES.VEHICLE_BUS,
    VEHICLE_UTILITY:   TYPES.VEHICLE_UTILITY,
    VEHICLE_SYNTHETIC: TYPES.VEHICLE_SYNTHETIC,
    BIKE_STATION:      TYPES.BIKE_STATION,
    BIKE_VEHICLE:      TYPES.BIKE_VEHICLE,
    TRANSIT_TRAIN:     TYPES.TRANSIT_TRAIN,
    MARINE_VESSEL:     TYPES.MARINE_VESSEL,
    MARINE_FERRY:      TYPES.MARINE_FERRY,
    AIRCRAFT_PLANE:    TYPES.AIRCRAFT_PLANE,
    CIVIC_INCIDENT:    TYPES.CIVIC_INCIDENT,
    WORLD_PROP:        TYPES.WORLD_PROP,
    all:            function () { return ALL.slice(); },
    // helpers
    isVehicle:      isVehicle,
    isTruthBacked:  isTruthBacked,
    toCategory:     toCategory,
  });

  console.log('[ActorTypes] v' + VERSION + ' loaded');
})(window);
