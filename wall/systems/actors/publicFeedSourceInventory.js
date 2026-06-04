// ── PublicFeedSourceInventory v1.0.0 ──────────────────────────────────────────
// 0603B_WOS_PublicFeedSourceInventory_v1.0.0
// Status: active | Classification: actor-authority (data inventory)
//
// PASSIVE inventory of public infrastructure feeds that future runtimes will
// adapt into SBE.TruthActorRuntime. NO fetching, NO parsing, NO actor creation.
// Pure declared data + read accessors. Source IDs match SBE.ActorSourceRegistry.
// Load AFTER actorSourceRegistry.js, before feed runtimes.
//
//   Public Feed → Source Inventory → Feed Adapter → TruthActorRuntime →
//   ActorVisualRegistry → Renderer
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Declared feed inventory (data only). buildOrder ranks adapter work.
  var FEEDS = [
    {
      id: 'citibike_gbfs_station_information',
      sourceId: 'citibike_gbfs',
      label: 'Citi Bike Station Information',
      provider: 'Lyft / Citi Bike',
      accessMethod: 'public_json',
      updateMode: 'poll',
      expectedCadenceMs: 300000,
      actorTypes: ['bike.station'],
      truthLevel: 'live',
      priority: 1,
      buildOrder: 1,
      accessRisk: 'low',
      corsRisk: 'unknown',
      dataShape: 'gbfs_json',
      positionFields: ['lat', 'lon'],
      identityFields: ['station_id'],
      ttlMs: 3600000,
      enabledByDefault: false,
      adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
      notes: 'Static station locations. Best first adapter target.',
    },
    {
      id: 'citibike_gbfs_station_status',
      sourceId: 'citibike_gbfs',
      label: 'Citi Bike Station Status',
      provider: 'Lyft / Citi Bike',
      accessMethod: 'public_json',
      updateMode: 'poll',
      expectedCadenceMs: 30000,
      actorTypes: ['bike.station'],
      truthLevel: 'live',
      priority: 1,
      buildOrder: 2,
      accessRisk: 'low',
      corsRisk: 'unknown',
      dataShape: 'gbfs_json',
      positionFields: [],
      identityFields: ['station_id'],
      ttlMs: 90000,
      enabledByDefault: false,
      adapterTarget: 'station_state_merge',
      notes: 'Availability state merged onto station actors. Does not create moving bikes.',
    },
    {
      id: 'mta_bus_gtfs_rt_vehicle_positions',
      sourceId: 'mta_bus_gtfs_rt',
      label: 'MTA Bus Vehicle Positions',
      provider: 'MTA',
      accessMethod: 'gtfs_rt_protobuf',
      updateMode: 'poll',
      expectedCadenceMs: 15000,
      actorTypes: ['vehicle.bus'],
      truthLevel: 'live',
      priority: 1,
      buildOrder: 3,
      accessRisk: 'medium',
      corsRisk: 'unknown',
      dataShape: 'gtfs_realtime_vehicle_positions',
      positionFields: ['position.latitude', 'position.longitude'],
      identityFields: ['vehicle.id', 'trip.trip_id'],
      ttlMs: 45000,
      enabledByDefault: false,
      adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
      notes: 'Primary live street actor feed. Requires GTFS-RT parsing strategy.',
    },
    {
      id: 'nyc_dot_traffic_events',
      sourceId: 'nyc_dot_events',
      label: 'NYC DOT Traffic Events',
      provider: 'NYC DOT / 511NY',
      accessMethod: 'public_json_or_feed',
      updateMode: 'poll',
      expectedCadenceMs: 60000,
      actorTypes: ['civic.incident', 'vehicle.utility'],
      truthLevel: 'live',
      priority: 2,
      buildOrder: 4,
      accessRisk: 'medium',
      corsRisk: 'unknown',
      dataShape: 'incident_event_feed',
      positionFields: ['lat', 'lng', 'geometry'],
      identityFields: ['event_id'],
      ttlMs: 180000,
      enabledByDefault: false,
      adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
      notes: 'Use as disruption markers first. Utility trucks may be visual proxies, not guaranteed actual vehicles.',
    },
    {
      id: 'nyc_ferry_feed',
      sourceId: 'ais_runtime',
      label: 'NYC Ferry Feed',
      provider: 'NYC Ferry / AIS / GTFS if available',
      accessMethod: 'mixed',
      updateMode: 'poll_or_stream',
      expectedCadenceMs: 30000,
      actorTypes: ['marine.ferry'],
      truthLevel: 'live',
      priority: 2,
      buildOrder: 5,
      accessRisk: 'medium',
      corsRisk: 'unknown',
      dataShape: 'mixed_ferry_position_or_schedule',
      positionFields: ['lat', 'lng'],
      identityFields: ['vessel_id', 'trip_id'],
      ttlMs: 60000,
      enabledByDefault: false,
      adapterTarget: 'SBE.TruthActorRuntime.upsertActor',
      notes: 'Bridge between transit and maritime. May already overlap AIS.',
    },
    {
      id: 'mta_subway_gtfs_rt',
      sourceId: 'mta_subway_gtfs_rt',
      label: 'MTA Subway GTFS-RT',
      provider: 'MTA',
      accessMethod: 'gtfs_rt_protobuf',
      updateMode: 'poll',
      expectedCadenceMs: 30000,
      actorTypes: ['transit.train'],
      truthLevel: 'live',
      priority: 3,
      buildOrder: 6,
      accessRisk: 'medium',
      corsRisk: 'unknown',
      dataShape: 'gtfs_realtime_subway',
      positionFields: ['derived_from_stop_sequence'],
      identityFields: ['trip.trip_id'],
      ttlMs: 60000,
      enabledByDefault: false,
      adapterTarget: 'derived_train_actor_runtime',
      notes: 'High-value but requires station/route interpolation. Do not build before simpler feeds.',
    },
  ];

  // Deep-ish copy so callers never mutate the registry data.
  function _clone(o) { return JSON.parse(JSON.stringify(o)); }

  function listFeeds() { return FEEDS.map(_clone); }
  function getFeed(id) {
    for (var i = 0; i < FEEDS.length; i++) if (FEEDS[i].id === id) return _clone(FEEDS[i]);
    return null;
  }
  function listByPriority(priority) {
    return FEEDS.filter(function (f) { return f.priority === priority; }).map(_clone);
  }
  function listBySource(sourceId) {
    return FEEDS.filter(function (f) { return f.sourceId === sourceId; }).map(_clone);
  }
  function listBuildOrder() {
    return FEEDS.slice().sort(function (a, b) { return a.buildOrder - b.buildOrder; }).map(_clone);
  }
  function listEnabledCandidates() {
    return FEEDS.filter(function (f) { return f.enabledByDefault === true; }).map(_clone);
  }

  SBE.PublicFeedSourceInventory = Object.freeze({
    VERSION:               VERSION,
    listFeeds:             listFeeds,
    getFeed:               getFeed,
    listByPriority:        listByPriority,
    listBySource:          listBySource,
    listBuildOrder:        listBuildOrder,
    listEnabledCandidates: listEnabledCandidates,
  });

  console.log('[PublicFeedSourceInventory] v' + VERSION + ' loaded — ' + FEEDS.length + ' feeds');
})(window);
