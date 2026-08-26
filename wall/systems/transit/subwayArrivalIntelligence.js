// ── SubwayArrivalIntelligence v1.0.0 ──────────────────────────────────────────
// 0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD — §18-27, §33
// Status: active | Classification: pure (no fetch, no DOM, no persistence)
//
// Derives a canonical station-arrival model from MTASubwayTransitStore's
// already-decoded, already-canonical-ID-joined TripUpdate data
// (TransitTripRef.stopTimes[] — see mtaSubwayIdentity.js's buildTripRef()).
// This file adds ZERO new network/parsing logic — every field it reads was
// already extracted from real live GTFS-Realtime TripUpdate payloads by the
// existing adapter/identity/store chain (BUILD §18: "Create a canonical
// derived arrival model from current TripUpdate/live feed data").
//
// ── STATION IDENTITY SAFETY (BUILD §19) ──────────────────────────────────────
// TripUpdate stopIds are always PLATFORM-level in the current MTA source
// (e.g. "L08N"/"L08S" — direction-suffixed), never the station-level id a
// Station Library record (stlib-*) is keyed to. This file resolves the real
// join chain instead of ever touching a display name:
//   platform stopId (from stopTimes[].stationId, already canonical
//     subway:stop:<platformStopId>)
//   -> TransitStationRef.parentId (real GTFS parent_station, resolved by
//      mtaSubwayIdentity.js at import time — station-level stops have no
//      parentId and are their own station-level id)
//   -> raw station-level gtfsStopId (canonical id's trailing segment)
//   -> MTASubwayStationLibrary.getRecordByAuthoritativeStopId() -> stlib-*
// Two platforms belonging to two different physical stations NEVER share a
// parentId, so this join structurally cannot cross-contaminate results for
// duplicate-named stations (23 St, Fulton St, etc. — verified in tests).
//
// ── DIRECTION / DESTINATION (BUILD §20-21) ────────────────────────────────────
// `directionId` is the real NYCT `nyct.direction` value ("NORTH"/"SOUTH"),
// already present on every canonical TransitTripRef. Friendly labels use
// "Uptown"/"Downtown" ONLY when that real value is present (never invented
// for a route running some other axis) — `destination` (the trip's own real
// last stopTime station name) is ALWAYS included as the honest fallback/
// supplement, per BUILD §20's explicit "prefer 'Toward <destination>' ...
// when uncertain" instruction. No borough-bound claim ("Manhattan-bound") is
// made anywhere in this file — this codebase has no verified per-route
// terminal-to-borough mapping, and fabricating one would violate BUILD §19's
// collision-safety spirit as surely as a name-based join would.
//
// ── FRESHNESS (BUILD §24) ─────────────────────────────────────────────────────
// live   — the underlying store's realtime data was last updated within one
//          poll cadence (reuses MTASubwayPollingRuntime's own `stale` flag —
//          no second staleness clock invented).
// aging  — poll is flagged stale but a last-known-valid update exists.
// stale  — no successful update has ever landed (never a fabricated
//          schedule-derived arrival — BUILD §24 explicit prohibition).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var DUE_THRESHOLD_SECONDS = 30; // BUILD §22 — "define a small Due threshold"
  var MAX_ARRIVALS_PER_DIRECTION = 4; // next + several following (BUILD §23)

  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _library() { return SBE.MTASubwayStationLibrary || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _poll() { return SBE.MTASubwayPollingRuntime || null; }

  function _rawStopIdFromCanonical(canonicalStopId) {
    // canonical shape is "subway:stop:<raw>" — see mtaSubwayIdentity.js.
    if (!canonicalStopId) return null;
    var idx = canonicalStopId.indexOf('subway:stop:');
    return idx === 0 ? canonicalStopId.slice('subway:stop:'.length) : null;
  }

  // Station-level canonical id for a Station Library record (never invented —
  // reads the record's own real authoritativeLink).
  function _stationLevelCanonicalId(record) {
    var raw = record && record.authoritativeLink && record.authoritativeLink.gtfsStopId;
    return raw ? 'subway:stop:' + raw : null;
  }

  // Every real platform-level canonical stop whose real GTFS parent_station
  // resolves to this station-level canonical id. Built fresh each call from
  // the store's own already-canonical station refs — no separate index to
  // keep in sync.
  function _platformIdsForStation(store, stationLevelCanonicalId) {
    return store.getAllStations()
      .filter(function (s) { return s.kind === 'platform' && s.parentId === stationLevelCanonicalId; })
      .map(function (s) { return s.id; });
  }

  function _freshnessState() {
    var poll = _poll(), store = _store();
    var lastUpdate = store ? store.getDiagnostics().realtimeLastUpdatedAt : null;
    if (!lastUpdate) return 'unavailable';
    var state = poll ? poll.getState() : null;
    if (state && state.stale) return 'aging';
    return 'live';
  }

  function _etaSeconds(arrivalUtcMs, nowMs) {
    if (arrivalUtcMs == null) return null;
    return Math.round((arrivalUtcMs - nowMs) / 1000);
  }

  function _friendlyLabel(directionId, destination) {
    if (directionId === 'NORTH') return destination ? 'Uptown — toward ' + destination : 'Uptown';
    if (directionId === 'SOUTH') return destination ? 'Downtown — toward ' + destination : 'Downtown';
    return destination ? 'Toward ' + destination : 'Direction unknown';
  }

  // The one real, live-evidenced "destination" available from current data —
  // see file header. Never a fabricated static headsign.
  function _tripDestination(store, trip) {
    if (!trip || !trip.stopTimes || !trip.stopTimes.length) return null;
    var last = trip.stopTimes[trip.stopTimes.length - 1];
    var station = last && last.stationId ? store.getStation(last.stationId) : null;
    return station ? station.displayName : null;
  }

  // ── The core query (BUILD §18, §25) ───────────────────────────────────────
  function getArrivalsForStation(studioRichStationId, opts) {
    var store = _store(), lib = _library(), rs = _rollingStock();
    if (!store || !lib) return { ok: false, reason: 'authority_unavailable' };

    var record = lib.getRecord(studioRichStationId);
    if (!record) return { ok: false, reason: 'not_found' };

    var stationLevelId = _stationLevelCanonicalId(record);
    if (!stationLevelId) return { ok: false, reason: 'unlinked_station' };

    var platformIds = _platformIdsForStation(store, stationLevelId);
    // A station-level stop can itself also appear directly in a
    // stopTimeUpdate for some feed shapes — include it as a candidate too,
    // never assuming platforms are the only real join target.
    var candidateStopIds = platformIds.concat([stationLevelId]);
    var candidateSet = {};
    candidateStopIds.forEach(function (id) { candidateSet[id] = true; });

    var now = (opts && opts.now) || Date.now();
    var seenTripStop = {}; // dedupe (tripId, stopId) pairs — BUILD §33 #8
    var byDirection = {}; // directionKey -> { directionId, destinationCounts, platformStopIds:Set, arrivals:[] }

    store.getAllTrips().forEach(function (trip) {
      (trip.stopTimes || []).forEach(function (st) {
        if (!st.stationId || !candidateSet[st.stationId]) return;
        if (st.arrivalUtcMs == null) return; // no honest ETA to compute
        var etaSeconds = _etaSeconds(st.arrivalUtcMs, now);
        if (etaSeconds == null || etaSeconds < -60) return; // BUILD §22 — never a negative ETA displayed; small grace window for clock skew, then drop

        var dedupeKey = trip.id + '::' + st.stationId;
        if (seenTripStop[dedupeKey]) return;
        seenTripStop[dedupeKey] = true;

        var destination = _tripDestination(store, trip);
        var directionKey = trip.direction || ('unknown:' + st.stationId);
        var assoc = rs ? rs.getTripAssociationByCanonicalId(trip.id) : null;

        if (!byDirection[directionKey]) {
          byDirection[directionKey] = {
            directionKey: directionKey,
            directionId: trip.direction || null,
            friendlyLabel: null, // resolved once destination evidence is gathered below
            destination: destination,
            platformStopIds: {},
            arrivals: [],
          };
        }
        var group = byDirection[directionKey];
        group.platformStopIds[st.stationId] = true;
        if (!group.destination) group.destination = destination;

        group.arrivals.push({
          logicalTrainId: assoc ? assoc.logicalTrainId : null,
          tripId: trip.id,
          routeId: trip.routeId,
          directionId: trip.direction || null,
          destination: destination,
          stopId: st.stationId,
          arrivalTime: st.arrivalUtcMs,
          departureTime: st.departureUtcMs,
          etaSeconds: Math.max(0, etaSeconds), // BUILD §22 — never negative once displayed
          dueSoon: etaSeconds <= DUE_THRESHOLD_SECONDS,
          realtimeTimestamp: now,
          freshnessState: _freshnessState(),
        });
      });
    });

    var directions = Object.keys(byDirection).map(function (key) {
      var g = byDirection[key];
      g.arrivals.sort(function (a, b) { return a.arrivalTime - b.arrivalTime; }); // BUILD §23 — strictly by arrival time
      g.arrivals = g.arrivals.slice(0, MAX_ARRIVALS_PER_DIRECTION);
      return {
        directionKey: g.directionKey,
        directionId: g.directionId,
        friendlyLabel: _friendlyLabel(g.directionId, g.destination),
        destination: g.destination,
        platformStopIds: Object.keys(g.platformStopIds),
        arrivals: g.arrivals,
      };
    }).sort(function (a, b) { return (a.directionId || '').localeCompare(b.directionId || ''); });

    return {
      ok: true,
      data: {
        stationLibraryId: studioRichStationId,
        canonicalStopId: stationLevelId,
        generatedAt: now,
        freshnessState: _freshnessState(),
        directions: directions,
      },
    };
  }

  // ── Camera/broadcast-ready arrival events (BUILD §27) — derived on read,
  //    never stored/streamed by this file; a future event bus can poll this. ─
  function getArrivalEvents(studioRichStationId, opts) {
    var result = getArrivalsForStation(studioRichStationId, opts);
    if (!result.ok) return [];
    var events = [];
    result.data.directions.forEach(function (dir) {
      dir.arrivals.forEach(function (a) {
        var kind = a.etaSeconds <= 0 ? 'train_arrived' : (a.dueSoon ? 'train_due' : 'train_approaching_station');
        events.push({
          kind: kind,
          stationId: studioRichStationId,
          logicalTrainId: a.logicalTrainId,
          routeId: a.routeId,
          direction: a.directionId,
          etaSeconds: a.etaSeconds,
          freshnessState: a.freshnessState,
        });
      });
    });
    return events;
  }

  function getDiagnostics() {
    var lib = _library();
    var store = _store();
    return {
      version: VERSION,
      stationLibraryRecordCount: lib ? lib.getAllRecords().length : 0,
      activeTripCount: store ? store.getAllTrips().length : 0,
      freshnessState: _freshnessState(),
      dueThresholdSeconds: DUE_THRESHOLD_SECONDS,
      maxArrivalsPerDirection: MAX_ARRIVALS_PER_DIRECTION,
    };
  }

  SBE.SubwayArrivalIntelligence = Object.freeze({
    VERSION: VERSION,
    DUE_THRESHOLD_SECONDS: DUE_THRESHOLD_SECONDS,
    MAX_ARRIVALS_PER_DIRECTION: MAX_ARRIVALS_PER_DIRECTION,
    getArrivalsForStation: getArrivalsForStation,
    getArrivalEvents: getArrivalEvents,
    getDiagnostics: getDiagnostics,
  });

  console.log('[SubwayArrivalIntelligence] v' + VERSION + ' loaded (pure derivation over TripUpdate data)');
})(window);
