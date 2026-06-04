// ── ActorSourceRegistry v1.0.0 ────────────────────────────────────────────────
// 0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0
// Status: active | Classification: actor-authority (data layer)
//
// Declares the external/internal SOURCES that can produce world actors and their
// truth level. No feed fetching here — declaration only. Attached to global.SBE.
// Load AFTER actorTypes.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var T = SBE.ActorTypes || {};

  var SOURCES = {
    ais_runtime: {
      id: 'ais_runtime', label: 'AIS Vessel Runtime', truthLevel: 'live',
      actorTypes: [T.MARINE_VESSEL || 'marine.vessel', T.MARINE_FERRY || 'marine.ferry'],
      updateMode: 'stream', defaultTtlMs: 60000, enabledByDefault: false,
    },
    aircraft_runtime: {
      id: 'aircraft_runtime', label: 'Aircraft Runtime', truthLevel: 'live',
      actorTypes: [T.AIRCRAFT_PLANE || 'aircraft.plane'],
      updateMode: 'stream', defaultTtlMs: 30000, enabledByDefault: false,
    },
    mta_bus_gtfs_rt: {
      id: 'mta_bus_gtfs_rt', label: 'MTA Bus GTFS-RT', truthLevel: 'live',
      actorTypes: [T.VEHICLE_BUS || 'vehicle.bus'],
      updateMode: 'poll', defaultTtlMs: 30000, enabledByDefault: false,
    },
    mta_subway_gtfs_rt: {
      id: 'mta_subway_gtfs_rt', label: 'MTA Subway GTFS-RT', truthLevel: 'live',
      actorTypes: [T.TRANSIT_TRAIN || 'transit.train'],
      updateMode: 'poll', defaultTtlMs: 30000, enabledByDefault: false,
    },
    citibike_gbfs: {
      id: 'citibike_gbfs', label: 'Citi Bike GBFS', truthLevel: 'live',
      actorTypes: [T.BIKE_STATION || 'bike.station', T.BIKE_VEHICLE || 'bike.vehicle'],
      updateMode: 'poll', defaultTtlMs: 45000, enabledByDefault: false,
    },
    nyc_dot_events: {
      id: 'nyc_dot_events', label: 'NYC DOT Events', truthLevel: 'live',
      actorTypes: [T.CIVIC_INCIDENT || 'civic.incident', T.VEHICLE_UTILITY || 'vehicle.utility'],
      updateMode: 'poll', defaultTtlMs: 120000, enabledByDefault: false,
    },
    authored_world_props: {
      id: 'authored_world_props', label: 'Authored World Props', truthLevel: 'static',
      actorTypes: [T.WORLD_PROP || 'world.prop'],
      updateMode: 'manual', defaultTtlMs: 0, enabledByDefault: false,
    },
    synthetic_ambient: {
      id: 'synthetic_ambient', label: 'Synthetic Ambient Filler', truthLevel: 'synthetic',
      actorTypes: [T.VEHICLE_SYNTHETIC || 'vehicle.synthetic'],
      updateMode: 'manual', defaultTtlMs: 20000, enabledByDefault: false,
    },
  };

  function getSource(id) { return SOURCES[id] || null; }
  function listSources() {
    return Object.keys(SOURCES).map(function (k) { return SOURCES[k]; });
  }
  function isTruthSource(id) {
    var s = SOURCES[id];
    return !!(s && s.truthLevel && s.truthLevel !== 'synthetic');
  }

  SBE.ActorSourceRegistry = Object.freeze({
    VERSION:       VERSION,
    getSource:     getSource,
    listSources:   listSources,
    isTruthSource: isTruthSource,
  });

  console.log('[ActorSourceRegistry] v' + VERSION + ' loaded — ' + Object.keys(SOURCES).length + ' sources');
})(window);
