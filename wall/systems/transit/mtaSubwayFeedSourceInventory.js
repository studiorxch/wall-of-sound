// ── MTASubwayFeedSourceInventory v1.0.0 ───────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §7
// Status: active | Classification: runtime-config + runtime-authority (inventory-only)
//
// Bounded, single-location declaration of every current authoritative MTA
// subway source this build uses. INVENTORY-ONLY: never fetches, decodes,
// renders, or mutates ActorRuntime. Mirrors the shape of
// mtaBusFeedConfig.js + mtaBusFeedSourceInventory.js (0604G), split into one
// file here because the subway source set is materially different in kind
// (static + realtime + a separate enrichment dataset) rather than one
// vehicle-positions endpoint.
//
// ── Verification (recorded 2026-08-18, live against the endpoints below) ────
// Every endpoint in SOURCES was fetched for real during this build (not
// assumed from documentation) via `curl`, and the realtime payloads were
// decoded field-by-field against the official proto definitions fetched live
// from https://raw.githubusercontent.com/google/transit/master/gtfs-realtime/proto/gtfs-realtime.proto
// and https://api.mta.info/nyct-subway.proto.txt. Findings:
//
//   - NONE of the current subway sources below require an API key. This is
//     DIFFERENT from wall/systems/transit/mtaBusFeedConfig.js, which does
//     require one (SIRI/BusTime, a different MTA subsystem). Do not copy the
//     bus system's apiKeyStorageKey/requiresApiKey assumptions onto subway.
//   - The 8 line-group GTFS-Realtime feeds + the alerts feed all returned a
//     real, live, protobuf-decodable transit_realtime.FeedMessage at
//     verification time (real trip/vehicle/alert entities, current dates
//     embedded in trip_ids, e.g. "20260818").
//   - VehiclePosition entities on every sampled line group carry NO
//     `position` (lat/lon) field — 0 of 56 sampled entities on the ACE feed
//     had one. They DO carry current_stop_sequence, current_status,
//     stop_id, and timestamp. This is the authoritative basis for this
//     build's "no fabricated train positions" decision (see
//     mtaSubwayMapFeatures.js) — current MTA subway GTFS-RT does not expose
//     direct train coordinates, only stop-relative state.
//   - GTFS static (regular) feed_info.txt: feed_version
//     "20260807-H-rockaways-extension-removed", feed_start_date 20260526,
//     feed_end_date 20261031. stops.txt uses location_type=1 for a
//     station-level stop and a blank location_type + parent_station for a
//     directional platform (e.g. "101" station / "101N","101S" platforms).
//     It does NOT carry a station-COMPLEX grouping (e.g. it has no field
//     joining the Manhattan Fulton St platforms 229/418/A38/M22 into one
//     complex) — that concept lives only in the separate
//     "MTA Subway Stations and Complexes" dataset below.
//   - The "MTA Subway Stations and Complexes" dataset (data.ny.gov) DOES
//     carry the complex grouping, joinable to GTFS static via its
//     "GTFS Stop IDs" column. Verified live: Complex ID 628 ("Fulton St")
//     groups GTFS Stop IDs 229, 418, A38, M22 (Manhattan, lines 2 3 4 5 A C
//     J Z) as ONE complex, while GTFS Stop ID G36 ("Fulton St", Brooklyn, G
//     line) is a SEPARATE, non-complexed station with the same display
//     name — the exact same-name/different-identity collision the
//     2026-08-18 resumption audit found in the legacy reference CSV, now
//     reproduced against CURRENT 2026 MTA data rather than the legacy file.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var VERIFIED_AT = '2026-08-18';

  // ── Failure vocabulary shared by the static + realtime subway adapters ──────
  var MTA_SUBWAY_FEED_FAILURE_REASONS = Object.freeze([
    'not_configured',
    'network_error',
    'http_error',
    'decode_failed',
    'parse_failed',
    'empty_feed',
    'malformed_row',
    'unsupported_entity',
    'stale_feed',
    'rate_limited',
    'unknown_error',
  ]);

  // ── Line-group realtime feed ids → endpoints ─────────────────────────────────
  // Every one of these was fetched live (HTTP 200, real protobuf) during this
  // build's verification pass. No API key in the URL or headers.
  var REALTIME_LINE_GROUPS = Object.freeze([
    Object.freeze({ id: 'ace',   label: 'A C E (+H, FS)',     routeIds: ['A', 'C', 'E', 'H', 'FS'] }),
    Object.freeze({ id: 'bdfm',  label: 'B D F M',            routeIds: ['B', 'D', 'F', 'M'] }),
    Object.freeze({ id: 'g',     label: 'G',                  routeIds: ['G'] }),
    Object.freeze({ id: 'jz',    label: 'J Z',                routeIds: ['J', 'Z'] }),
    Object.freeze({ id: 'nqrw',  label: 'N Q R W',            routeIds: ['N', 'Q', 'R', 'W'] }),
    Object.freeze({ id: 'l',     label: 'L',                  routeIds: ['L'] }),
    Object.freeze({ id: 'numbered', label: '1 2 3 4 5 6 7 S', routeIds: ['1', '2', '3', '4', '5', '6', '7', 'S', 'GS'] }),
    Object.freeze({ id: 'si',    label: 'Staten Island Railway', routeIds: ['SI'] }),
  ]);

  function _rtUrl(feedSuffix) {
    return 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F' + feedSuffix;
  }

  var REALTIME_SOURCES = Object.freeze(REALTIME_LINE_GROUPS.map(function (g) {
    return Object.freeze({
      id: 'mta_subway_gtfs_rt_' + g.id,
      label: 'MTA Subway GTFS-RT — ' + g.label,
      format: 'gtfs_realtime_protobuf',
      endpoint: _rtUrl(g.id === 'numbered' ? 'gtfs' : 'gtfs-' + g.id),
      purpose: 'trip_updates_and_vehicle_positions',
      routeIds: g.routeIds,
      supportedEntityTypes: Object.freeze(['trip_update', 'vehicle']),
      vehiclePositionHasCoordinates: false,
      requiresApiKey: false,
      authority: 'mta_subway_gtfs_rt',
      status: 'primary',
      verifiedAt: VERIFIED_AT,
    });
  }));

  var ALERTS_SOURCE = Object.freeze({
    id: 'mta_subway_gtfs_rt_alerts',
    label: 'MTA Subway GTFS-RT — Service Alerts',
    format: 'gtfs_realtime_protobuf',
    endpoint: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts',
    purpose: 'alerts',
    routeIds: null,
    supportedEntityTypes: Object.freeze(['alert']),
    vehiclePositionHasCoordinates: false,
    requiresApiKey: false,
    authority: 'mta_subway_gtfs_rt',
    status: 'primary',
    verifiedAt: VERIFIED_AT,
  });

  var STATIC_SOURCE = Object.freeze({
    id: 'mta_subway_gtfs_static_regular',
    label: 'MTA Subway GTFS Static (Regular)',
    format: 'gtfs_static_zip',
    endpoint: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip',
    purpose: 'routes_stops_trips_shapes',
    files: Object.freeze(['agency.txt', 'routes.txt', 'stops.txt', 'trips.txt', 'stop_times.txt', 'shapes.txt', 'calendar.txt', 'calendar_dates.txt', 'transfers.txt', 'feed_info.txt']),
    updateFrequency: 'a_few_times_per_year_plus_long_term_changes',
    requiresApiKey: false,
    authority: 'mta_subway_gtfs_static',
    status: 'primary',
    verifiedAt: VERIFIED_AT,
    verifiedFeedVersion: '20260807-H-rockaways-extension-removed',
  });

  var STATIC_SUPPLEMENTED_SOURCE = Object.freeze({
    id: 'mta_subway_gtfs_static_supplemented',
    label: 'MTA Subway GTFS Static (Supplemented — includes most near-term service changes)',
    format: 'gtfs_static_zip',
    endpoint: 'https://rrgtfsfeeds.s3.amazonaws.com/gtfs_supplemented.zip',
    purpose: 'routes_stops_trips_shapes_with_near_term_changes',
    updateFrequency: 'hourly',
    requiresApiKey: false,
    authority: 'mta_subway_gtfs_static',
    status: 'supporting',
    verifiedAt: VERIFIED_AT,
  });

  // Separate from raw GTFS static: the official MTA-published dataset that
  // supplies the station-COMPLEX grouping GTFS static itself does not carry.
  var STATIONS_COMPLEXES_SOURCE = Object.freeze({
    id: 'mta_subway_stations_and_complexes',
    label: 'MTA Subway Stations and Complexes (data.ny.gov)',
    format: 'csv',
    endpoint: 'https://data.ny.gov/api/views/5f5g-n3cz/rows.csv?accessType=DOWNLOAD',
    purpose: 'station_complex_identity_enrichment',
    joinKey: 'gtfs_stop_id',
    fields: Object.freeze(['Complex ID', 'Is Complex', 'Number Of Stations In Complex', 'Stop Name', 'Display Name', 'Constituent Station Names', 'Station IDs', 'GTFS Stop IDs', 'Borough', 'CBD', 'Daytime Routes', 'Structure Type', 'Latitude', 'Longitude', 'ADA', 'ADA Notes']),
    requiresApiKey: false,
    authority: 'ny_open_data',
    status: 'primary',
    verifiedAt: VERIFIED_AT,
  });

  var ALL_SOURCES = Object.freeze(
    [STATIC_SOURCE, STATIC_SUPPLEMENTED_SOURCE, STATIONS_COMPLEXES_SOURCE]
      .concat(REALTIME_SOURCES)
      .concat([ALERTS_SOURCE])
  );

  function getStaticSource() { return STATIC_SOURCE; }
  function getStaticSupplementedSource() { return STATIC_SUPPLEMENTED_SOURCE; }
  function getStationsComplexesSource() { return STATIONS_COMPLEXES_SOURCE; }
  function getRealtimeSources() { return REALTIME_SOURCES.slice(); }
  function getAlertsSource() { return ALERTS_SOURCE; }
  function getAllSources() { return ALL_SOURCES.slice(); }

  function getRealtimeSourceForRoute(routeId) {
    if (!routeId) return null;
    for (var i = 0; i < REALTIME_SOURCES.length; i++) {
      var rids = REALTIME_SOURCES[i].routeIds || [];
      if (rids.indexOf(String(routeId).toUpperCase()) !== -1) return REALTIME_SOURCES[i];
    }
    return null;
  }

  function getState() {
    return {
      version: VERSION,
      verifiedAt: VERIFIED_AT,
      staticSourceCount: 3,
      realtimeSourceCount: REALTIME_SOURCES.length,
      alertsSourceConfigured: true,
      failureReasons: MTA_SUBWAY_FEED_FAILURE_REASONS,
      anyRequiresApiKey: ALL_SOURCES.some(function (s) { return s.requiresApiKey; }),
    };
  }

  SBE.MTASubwayFeedSourceInventory = Object.freeze({
    VERSION: VERSION,
    VERIFIED_AT: VERIFIED_AT,
    FAILURE_REASONS: MTA_SUBWAY_FEED_FAILURE_REASONS,
    getStaticSource: getStaticSource,
    getStaticSupplementedSource: getStaticSupplementedSource,
    getStationsComplexesSource: getStationsComplexesSource,
    getRealtimeSources: getRealtimeSources,
    getAlertsSource: getAlertsSource,
    getAllSources: getAllSources,
    getRealtimeSourceForRoute: getRealtimeSourceForRoute,
    getState: getState,
  });

  console.log('[MTASubwayFeedSourceInventory] v' + VERSION + ' loaded — ' +
    ALL_SOURCES.length + ' sources documented (inventory-only, verified ' + VERIFIED_AT + ')');
})(window);
