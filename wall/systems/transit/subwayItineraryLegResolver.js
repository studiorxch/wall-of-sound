// ── SubwayItineraryLegResolver v1.0.0 ─────────────────────────────────────────
// 0819_SUBWAY_Itinerary_Recovery_Transit_Foundation
// Status: active | Classification: transit / subway-itinerary-leg-resolver
//
// Answers the SUBWAY leg questions an Itinerary needs, from EXISTING real
// data only — MTASubwayTransitStore (canonical stations/routes/shapes),
// MTASubwayStationLibrary (StudioRich station records — the id space
// SubwayArrivalIntelligence keys on), SubwayLogicalRollingStockAuthority
// (live trains), SubwayArrivalIntelligence (real arrival ETAs). Never
// rewrites any of those — pure read-only derivation, reimplementing only the
// small nearest-point/shape-index geometry primitives every other transit
// layer this session already reimplements independently against the same
// public getShapePoints()/getStation() surface (see subwayTrainMotionModel.js,
// mtaSubwayMapFeatures.js) rather than reaching into their private internals.
//
// Direction honesty: `direction.towardStationId/Name` is derived from the
// REAL ordered station path resolved for this specific boarding→exit pair
// (walking the route's own matched shape index from boarding to exit) — never
// from GTFS direction_id, which this module never reads for that purpose.
//
// No transfers: resolveLeg() only ever considers a route that serves BOTH the
// boarding and exit station directly. If none exists, it fails honestly with
// reason 'no_direct_route' rather than fabricating a multi-leg path — that is
// explicitly out of scope for this build.
//
// Placement: wall/systems/transit/subwayItineraryLegResolver.js
// Load: AFTER mtaSubwayTransitStore.js, mtaSubwayStationLibrary.js,
// subwayLogicalRollingStockAuthority.js, subwayArrivalIntelligence.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var EARTH_RADIUS_M = 6371000;
  // Real walking-to-a-station bound — beyond this, a geocoded origin/
  // destination isn't honestly "at" that station. Generous enough for a
  // real address a few blocks from the nearest platform, not unlimited.
  var MAX_WALK_TO_STATION_M = 1500;
  // Same shape-match tolerance already proven in subwayTrainMotionModel.js
  // (~1.1km in degree-space) — a station whose nearest shape point exceeds
  // this is treated as not really on that shape, never force-matched.
  var SHAPE_MATCH_THRESHOLD_DEG = 0.01;

  function _store() { return global.SBE && SBE.MTASubwayTransitStore; }
  function _library() { return global.SBE && SBE.MTASubwayStationLibrary; }
  function _rollingStock() { return global.SBE && SBE.SubwayLogicalRollingStockAuthority; }
  function _arrivalIntel() { return global.SBE && SBE.SubwayArrivalIntelligence; }

  function _toRad(d) { return d * Math.PI / 180; }
  function _haversineMeters(lat1, lng1, lat2, lng2) {
    var dLat = _toRad(lat2 - lat1), dLng = _toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  // Cheap degree-space distance for shape-index matching only (same
  // approximation subwayTrainMotionModel.js already uses for the same
  // purpose — fine at real subway-corridor scale, never used for the
  // real-world MAX_WALK_TO_STATION_M bound above, which uses true haversine).
  function _distDeg(lat1, lng1, lat2, lng2) {
    var dLat = lat1 - lat2, dLng = lng1 - lng2;
    return Math.sqrt(dLat * dLat + dLng * dLng);
  }

  // getShapePoints() returns [lat, lng] pairs (confirmed against
  // subwayTrainMotionModel.js's own _nearestIndex, which compares
  // points[i] directly against [station.latitude, station.longitude]).
  function _nearestShapeIndex(points, station) {
    var best = -1, bestDist = Infinity;
    for (var i = 0; i < points.length; i++) {
      var d = _distDeg(points[i][0], points[i][1], station.latitude, station.longitude);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return (best !== -1 && bestDist <= SHAPE_MATCH_THRESHOLD_DEG) ? best : null;
  }

  function _publicStation(station) {
    if (!station) return null;
    return { id: station.id, name: station.displayName, longitude: station.longitude, latitude: station.latitude };
  }

  // Nearest real, boardable STATION (kind:'station' — never a bare platform
  // record) to an arbitrary geocoded point, within a real walkable distance.
  // Returns null (never a far-away best-effort match) when nothing is close
  // enough to honestly call "the station for this point."
  function findNearestStation(longitude, latitude) {
    var store = _store();
    if (!store || longitude == null || latitude == null) return null;
    var best = null, bestDist = Infinity;
    store.getAllStations().forEach(function (s) {
      if (s.kind !== 'station' || s.latitude == null || s.longitude == null) return;
      var d = _haversineMeters(latitude, longitude, s.latitude, s.longitude);
      if (d < bestDist) { bestDist = d; best = s; }
    });
    if (!best || bestDist > MAX_WALK_TO_STATION_M) return null;
    return { station: best, distanceMeters: bestDist };
  }

  function _commonRouteIds(stationA, stationB) {
    var setB = {};
    (stationB.routeIds || []).forEach(function (r) { setB[r] = true; });
    return (stationA.routeIds || []).filter(function (r) { return setB[r]; });
  }

  // Finds a real shape on `routeId` where BOTH stations resolve to a real,
  // distinct index — tries every shape the route owns (a route can have
  // several, e.g. local/express/branch variants) and returns the first that
  // resolves both ends honestly. Never fabricates a segment.
  function _shapeSegmentForStations(store, routeId, stationA, stationB) {
    var route = store.getRoute(routeId);
    if (!route || !route.shapeIds || !route.shapeIds.length) return null;
    for (var s = 0; s < route.shapeIds.length; s++) {
      var shapeId = route.shapeIds[s];
      var points = store.getShapePoints(shapeId);
      if (!points || points.length < 2) continue;
      var idxA = _nearestShapeIndex(points, stationA);
      var idxB = _nearestShapeIndex(points, stationB);
      if (idxA == null || idxB == null || idxA === idxB) continue;
      return { shapeId: shapeId, points: points, idxA: idxA, idxB: idxB };
    }
    return null;
  }

  // The core resolution: boarding station, route, real travel direction
  // (derived from the directed station path, never GTFS direction_id), the
  // real ordered stop sequence, and the exit station. `origin`/`destination`
  // are {longitude, latitude} — e.g. an itinerary stop's LocationRef.
  //
  // opts.preferredRouteId: many real station pairs (e.g. 59 St/Atlantic
  // Av-Barclays Ctr, both shared N/R stops) have more than one real direct
  // line — real riders pick a line, this isn't ambiguity to silently guess
  // through. When omitted, the first common route that resolves AND
  // genuinely validates (boarding/exit land exactly at the ends of the
  // derived order) wins, same as before this option existed.
  function resolveLeg(origin, destination, opts) {
    var store = _store();
    if (!store) return { ok: false, reason: 'authority_unavailable' };
    if (!origin || !destination) return { ok: false, reason: 'invalid_input' };

    var originMatch = findNearestStation(origin.longitude, origin.latitude);
    if (!originMatch) return { ok: false, reason: 'no_boarding_station_nearby' };
    var destMatch = findNearestStation(destination.longitude, destination.latitude);
    if (!destMatch) return { ok: false, reason: 'no_exit_station_nearby' };

    var boarding = originMatch.station, exit = destMatch.station;
    if (boarding.id === exit.id) return { ok: false, reason: 'same_station' };

    var candidateRoutes = _commonRouteIds(boarding, exit);
    if (!candidateRoutes.length) return { ok: false, reason: 'no_direct_route' };

    var preferredRouteId = opts && opts.preferredRouteId;
    if (preferredRouteId) {
      if (candidateRoutes.indexOf(preferredRouteId) === -1) return { ok: false, reason: 'preferred_route_not_direct' };
      candidateRoutes = [preferredRouteId];
    }

    for (var r = 0; r < candidateRoutes.length; r++) {
      var routeId = candidateRoutes[r];
      var seg = _shapeSegmentForStations(store, routeId, boarding, exit);
      if (!seg) continue;

      var ascending = seg.idxB > seg.idxA;
      var lo = Math.min(seg.idxA, seg.idxB), hi = Math.max(seg.idxA, seg.idxB);

      var withIdx = [];
      store.getAllStations().forEach(function (s) {
        if (s.kind !== 'station') return;
        if ((s.routeIds || []).indexOf(routeId) === -1) return;
        var idx = _nearestShapeIndex(seg.points, s);
        if (idx == null || idx < lo || idx > hi) return;
        withIdx.push({ station: s, idx: idx });
      });
      withIdx.sort(function (a, b) { return ascending ? a.idx - b.idx : b.idx - a.idx; });

      var orderedStations = withIdx.map(function (w) { return w.station; });
      // Boarding must genuinely resolve as the FIRST stop and exit as the
      // LAST in the derived real order — if not, this shape didn't honestly
      // capture the intended pair (e.g. a branch), so try the next candidate
      // route rather than returning a misleading partial path.
      if (orderedStations.length < 2) continue;
      if (orderedStations[0].id !== boarding.id) continue;
      if (orderedStations[orderedStations.length - 1].id !== exit.id) continue;

      var towardStation = orderedStations[orderedStations.length - 1];
      return {
        ok: true,
        routeId: routeId,
        shapeId: seg.shapeId,
        boardingStation: _publicStation(boarding),
        exitStation: _publicStation(exit),
        boardingWalkMeters: Math.round(originMatch.distanceMeters),
        exitWalkMeters: Math.round(destMatch.distanceMeters),
        direction: { towardStationId: towardStation.id, towardStationName: towardStation.displayName },
        orderedStops: orderedStations.map(_publicStation),
        // Other real direct-serving routes for this exact station pair — a
        // UI can offer these as alternatives; never auto-picked over an
        // explicit opts.preferredRouteId.
        alternateRouteIds: _commonRouteIds(boarding, exit).filter(function (r) { return r !== routeId; }),
      };
    }

    return { ok: false, reason: 'unresolvable_geometry' };
  }

  // Real TripUpdate stopTimes are keyed by PLATFORM-level stop ids (e.g.
  // "R41N"), never the station-level parent id ("R41") this resolver's
  // boarding/exit stations use — the exact same real join
  // subwayArrivalIntelligence.js's own _platformIdsForStation() already
  // exists to bridge. Reimplemented here against the same public
  // store.getAllStations() data (this session's established per-module
  // convention), not by reaching into that file's private helper.
  function _platformIdSetForStation(store, stationLevelCanonicalId) {
    var set = {};
    set[stationLevelCanonicalId] = true; // a station-level id can itself appear directly in some feed shapes
    store.getAllStations().forEach(function (s) {
      if (s.kind === 'platform' && s.parentId === stationLevelCanonicalId) set[s.id] = true;
    });
    return set;
  }

  // A trip's remaining real stopTimes (in feed order — the trip's own
  // directed path, never a GTFS direction_id) genuinely reaches the exit
  // station strictly after the boarding station. This is the direction
  // check the spec requires: derived from THIS SPECIFIC live trip's own
  // real remaining schedule, not a destination-string guess (which fails
  // for the common case of a leg ending short of the train's own terminus).
  function _tripReachesExitAfterBoarding(store, trip, boardingStopId, exitStopId) {
    if (!trip || !trip.stopTimes) return false;
    var boardingSet = _platformIdSetForStation(store, boardingStopId);
    var exitSet = _platformIdSetForStation(store, exitStopId);
    var boardingIdx = -1, exitIdx = -1;
    for (var i = 0; i < trip.stopTimes.length; i++) {
      if (boardingIdx === -1 && boardingSet[trip.stopTimes[i].stationId]) boardingIdx = i;
      if (exitIdx === -1 && exitSet[trip.stopTimes[i].stationId]) exitIdx = i;
    }
    return boardingIdx !== -1 && exitIdx !== -1 && exitIdx > boardingIdx;
  }

  // Shared lookup both getLiveCandidates() and getNextArrivalPreview() need:
  // the boarding station's real arrivals result, filtered to THIS leg's
  // route only. Kept as one private helper so the station-library join
  // (store station -> gtfsStopId -> library record -> studioRichStationId)
  // and the route filter are never duplicated/drifted between the two.
  //
  // 0821_SUBWAY_Boarding_UX — a real, serious production bug found via a
  // genuine end-to-end MUSIC -> LIVE MAP launch (not a wall-side-only test):
  // this guard used to read `legResolution.ok`, a field that exists ONLY on
  // resolveLeg()'s own raw discriminated-union return shape. The REAL leg a
  // running ride actually holds (SubwayItineraryRideAuthority's `_state.leg`)
  // is set from whatever startLeg()/the cross-tab `startLeg` command
  // supplies — and MUSIC's real launch path (wallSubwayItineraryRideBridge
  // .ts's launchTransitLeg()) sends the MUSIC-side `TransitLegPlan` shape,
  // which has never had an `ok` field. Every EXISTING wall-side test for
  // this function (this file's own, and subwayItineraryRideAuthority
  // .tests.js's) happened to construct its leg from resolveLeg()'s raw
  // output directly, so none of them could ever have caught this — it only
  // surfaced by actually running the full MUSIC(5176)->LIVE MAP path live,
  // where it silently returned zero candidates/no preview for every real
  // ride, regardless of how much real live arrival data existed. Checking
  // the fields this function actually reads (routeId, boardingStation),
  // which both shapes genuinely have, instead of `.ok` (which only one
  // shape has) fixes real production rides, not just the raw-shape tests.
  function _routeArrivalsForLeg(legResolution, opts) {
    if (!legResolution || !legResolution.routeId || !legResolution.boardingStation || !legResolution.boardingStation.id) return null;
    var store = _store(), lib = _library(), arr = _arrivalIntel();
    if (!store || !lib || !arr) return null;

    var boardingStoreStation = store.getStation(legResolution.boardingStation.id);
    var gtfsId = boardingStoreStation && boardingStoreStation.authoritativeIds && boardingStoreStation.authoritativeIds.gtfsStopId;
    var libRecord = gtfsId ? lib.getRecordByAuthoritativeStopId(gtfsId) : null;
    if (!libRecord) return null;

    // opts.now: test-only override, passed straight through to
    // SubwayArrivalIntelligence's own real "now" parameter — production
    // callers omit it and get the real current time, same as every other
    // consumer of getArrivalsForStation.
    var result = arr.getArrivalsForStation(libRecord.studioRichStationId, opts && opts.now ? { now: opts.now } : undefined);
    if (!result.ok) return null;

    var routeArrivals = [];
    result.data.directions.forEach(function (dir) {
      (dir.arrivals || []).forEach(function (a) {
        if (a.routeId === legResolution.routeId) routeArrivals.push(a);
      });
    });
    return { store: store, routeArrivals: routeArrivals };
  }

  // Real, currently-active live trains on this leg's route that have a real,
  // identity-associated (logicalTrainId) arrival forecast at the boarding
  // station — via the SAME SubwayArrivalIntelligence real ETAs already
  // proven elsewhere, never a fabricated ETA. `directionConfirmed` is
  // derived from the SPECIFIC live trip's own real remaining stop sequence
  // actually reaching the exit station (see _tripReachesExitAfterBoarding)
  // — a real signal, not a fuzzy destination-name guess; `false` means
  // "this specific trip's real remaining schedule doesn't reach the exit
  // station" (e.g. it terminates short of it), not "wrong direction."
  function getLiveCandidates(legResolution, opts) {
    var ctx = _routeArrivalsForLeg(legResolution, opts);
    if (!ctx) return [];

    var tripsById = {};
    ctx.store.getAllTrips().forEach(function (t) { tripsById[t.id] = t; });

    var candidates = [];
    ctx.routeArrivals.forEach(function (a) {
      if (!a.logicalTrainId) return; // real identity association only — never a fabricated candidate
      var trip = tripsById[a.tripId];
      candidates.push({
        logicalTrainId: a.logicalTrainId,
        tripId: a.tripId,
        destination: a.destination,
        etaSeconds: a.etaSeconds,
        dueSoon: a.dueSoon,
        directionConfirmed: _tripReachesExitAfterBoarding(ctx.store, trip, legResolution.boardingStation.id, legResolution.exitStation.id),
      });
    });
    candidates.sort(function (a, b) { return a.etaSeconds - b.etaSeconds; });
    return candidates;
  }

  // 0821_SUBWAY_Boarding_UX — a real arrival for this leg's route can exist
  // (Arrival Intelligence already has real ETA data for it) before that same
  // trip has been independently identity-associated by
  // SubwayLogicalRollingStockAuthority.reconcile() — the exact race
  // getLiveCandidates() above already accounts for by requiring a real
  // logicalTrainId. That's correct for BOARDING (never bind a fabricated
  // train), but it leaves the UI with no honest way to say "a train really
  // is coming, identity just hasn't resolved yet" versus "nothing is coming
  // at all" — this answers exactly that, unfiltered by logicalTrainId, for
  // the "WAITING TO BOARD" explanatory copy only. Never used for binding.
  function getNextArrivalPreview(legResolution, opts) {
    var ctx = _routeArrivalsForLeg(legResolution, opts);
    if (!ctx || !ctx.routeArrivals.length) return null;
    var soonest = ctx.routeArrivals.reduce(function (best, a) {
      return (!best || a.etaSeconds < best.etaSeconds) ? a : best;
    }, null);
    if (!soonest) return null;
    return { etaSeconds: soonest.etaSeconds, dueSoon: soonest.dueSoon, hasIdentity: !!soonest.logicalTrainId };
  }

  SBE.SubwayItineraryLegResolver = Object.freeze({
    VERSION: VERSION,
    MAX_WALK_TO_STATION_M: MAX_WALK_TO_STATION_M,
    findNearestStation: findNearestStation,
    resolveLeg: resolveLeg,
    getLiveCandidates: getLiveCandidates,
    getNextArrivalPreview: getNextArrivalPreview,
    __test: {
      haversineMeters: _haversineMeters,
      nearestShapeIndex: _nearestShapeIndex,
      shapeSegmentForStations: _shapeSegmentForStations,
      // Real per-arrival data (never "soonest across the whole real
      // corridor," which live/residual traffic can always beat) — lets a
      // test assert a SPECIFIC injected trip's own identity state directly,
      // the same fidelity getLiveCandidates()'s own race-window test already
      // uses (matching by tripId, not by aggregate ordering).
      routeArrivalsForLeg: function (legResolution, opts) {
        var ctx = _routeArrivalsForLeg(legResolution, opts);
        return ctx ? ctx.routeArrivals : [];
      },
    },
  });

  console.log('[SubwayItineraryLegResolver] v' + VERSION + ' loaded (pure derivation — no state of its own)');
})(window);
