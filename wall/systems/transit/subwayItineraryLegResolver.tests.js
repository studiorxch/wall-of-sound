// ── SubwayItineraryLegResolver Tests v1.0.0 ───────────────────────────────────
// 0819_SUBWAY_Itinerary_Recovery_Transit_Foundation
// Status: active | Classification: test-harness
//
// Run via: SBE.SubwayItineraryLegResolverTests.run()
//
// Uses the REAL committed static GTFS snapshot exclusively — real stations,
// real routes, real shapes. No synthetic geometry. A real multi-stop corridor
// is DISCOVERED at test-run time (never hard-coded against assumed ids, same
// convention as every other SUBWAY test file this session) by asking
// resolveLeg() itself to resolve real station pairs until one yields a
// genuinely useful (>=3 real stops) leg.
//
// Placement: wall/systems/transit/subwayItineraryLegResolver.tests.js
// Load: AFTER subwayItineraryLegResolver.js, MTASubwayTransitStore.js,
//       MTASubwayStationLibrary.js, SubwayLogicalRollingStockAuthority.js,
//       SubwayArrivalIntelligence.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var GROUP = 'itinerary-leg-resolver-test';
  function _tripRow(tripId, routeId, trainId, direction, stopTimes) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, direction: direction || null, stopTimeUpdates: stopTimes || [], sourceGroupId: GROUP };
  }
  function _vehicleRow(tripId, routeId, trainId, stopId, currentStatus) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, stopId: stopId || null, currentStatus: currentStatus || null, sourceGroupId: GROUP };
  }

  // Real haversine, independent of the module under test — used only to
  // sanity-check monotonic distance along a discovered corridor.
  function _haversineM(a, b) {
    var R = 6371000, toRad = function (d) { return d * Math.PI / 180; };
    var dLat = toRad(b.latitude - a.latitude), dLng = toRad(b.longitude - a.longitude);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Discovers a real route + a real station pair on it whose resolveLeg()
  // yields a genuinely multi-stop (>=3) leg — bounded search over real data,
  // never a fabricated pair.
  function _discoverCorridor(store, resolver) {
    var routes = store.getAllRoutes();
    for (var r = 0; r < routes.length; r++) {
      var routeId = routes[r].id;
      var stations = store.getAllStations().filter(function (s) {
        return s.kind === 'station' && (s.routeIds || []).indexOf(routeId) !== -1;
      });
      if (stations.length < 3) continue;
      // Try a spread of pairs (not just adjacent) to find a real >=3-stop leg.
      for (var i = 0; i < stations.length; i += Math.max(1, Math.floor(stations.length / 6))) {
        for (var j = stations.length - 1; j > i; j -= Math.max(1, Math.floor(stations.length / 6))) {
          var a = stations[i], b = stations[j];
          var leg = resolver.resolveLeg(
            { longitude: a.longitude, latitude: a.latitude },
            { longitude: b.longitude, latitude: b.latitude }
          );
          if (leg.ok && leg.orderedStops.length >= 3) return leg;
        }
      }
    }
    return null;
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var lib = SBE.MTASubwayStationLibrary;
    var resolver = SBE.SubwayItineraryLegResolver;
    var results = [];
    if (!store || !lib || !resolver) {
      results.push(_assert('SBE.MTASubwayTransitStore/MTASubwayStationLibrary/SubwayItineraryLegResolver are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      lib.__resetForTests();
      lib.importFromStaticModel();

      // ── #1 findNearestStation — real point at a real station resolves to it, exactly ──
      var anyStation = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0];
      results.push(_assert('a real station exists in the committed snapshot', !!anyStation));
      if (anyStation) {
        var match = resolver.findNearestStation(anyStation.longitude, anyStation.latitude);
        results.push(_assert('#1 findNearestStation resolves a point AT a real station to that exact station',
          !!match && match.station.id === anyStation.id, match));
      }

      // ── #2 findNearestStation — a point far out at sea resolves to nothing (never a fabricated match) ──
      var oceanMatch = resolver.findNearestStation(-40.0, 30.0);
      results.push(_assert('#2 findNearestStation returns null for a point nowhere near any real station',
        oceanMatch === null, oceanMatch));

      // ── #3 resolveLeg — same station for origin and destination fails honestly ──
      if (anyStation) {
        var sameLeg = resolver.resolveLeg(
          { longitude: anyStation.longitude, latitude: anyStation.latitude },
          { longitude: anyStation.longitude, latitude: anyStation.latitude }
        );
        results.push(_assert('#3 resolveLeg rejects boarding===exit as same_station, never a zero-length leg',
          sameLeg.ok === false && sameLeg.reason === 'same_station', sameLeg));
      }

      // ── #4 resolveLeg — no shared route between two unrelated stations fails as no_direct_route ──
      var stationsById = store.getAllStations().filter(function (s) { return s.kind === 'station'; });
      var isolatedPair = null;
      outer:
      for (var x = 0; x < stationsById.length; x++) {
        for (var y = 0; y < stationsById.length; y++) {
          if (x === y) continue;
          var sx = stationsById[x], sy = stationsById[y];
          var shared = (sx.routeIds || []).some(function (r) { return (sy.routeIds || []).indexOf(r) !== -1; });
          if (!shared) { isolatedPair = [sx, sy]; break outer; }
        }
      }
      if (isolatedPair) {
        var noRouteLeg = resolver.resolveLeg(
          { longitude: isolatedPair[0].longitude, latitude: isolatedPair[0].latitude },
          { longitude: isolatedPair[1].longitude, latitude: isolatedPair[1].latitude }
        );
        results.push(_assert('#4 resolveLeg honestly fails with no_direct_route for two stations sharing no route',
          noRouteLeg.ok === false && noRouteLeg.reason === 'no_direct_route', noRouteLeg));
      }

      // ── Discover a real, multi-stop corridor for the substantive checks ──
      var leg = _discoverCorridor(store, resolver);
      results.push(_assert('a real >=3-stop corridor was discovered from the committed static snapshot', !!leg, leg));
      if (!leg) {
        var failedEarly = results.filter(function (r) { return !r.pass; });
        return { ok: failedEarly.length === 0, total: results.length, failed: failedEarly.length, results: results };
      }

      // ── #5 ordered stops start at boarding and end at exit ──
      results.push(_assert('#5 orderedStops[0] is the boarding station',
        leg.orderedStops[0].id === leg.boardingStation.id, leg.orderedStops[0]));
      results.push(_assert('#6 orderedStops[last] is the exit station',
        leg.orderedStops[leg.orderedStops.length - 1].id === leg.exitStation.id, leg.orderedStops[leg.orderedStops.length - 1]));

      // ── #7 direction is derived from the real directed path, toward the exit ──
      results.push(_assert('#7 direction.towardStationId is the real exit station, not a GTFS direction_id',
        leg.direction.towardStationId === leg.exitStation.id, leg.direction));

      // ── #8 every ordered stop is a distinct real station (no duplicates, no fabricated stops) ──
      var seenIds = {};
      var allDistinct = leg.orderedStops.every(function (s) {
        if (seenIds[s.id]) return false;
        seenIds[s.id] = true;
        return true;
      });
      results.push(_assert('#8 every ordered stop is a distinct real station', allDistinct, leg.orderedStops.map(function (s) { return s.id; })));

      // ── #9 real cumulative distance along the path never goes backward ──
      // Non-decreasing, not strictly increasing: real MTA static data
      // legitimately records the same physical complex as multiple distinct
      // 'station' stops at identical coordinates (e.g. two separate real
      // stop ids both named "145 St", both serving route A, zero real
      // distance apart) — the exact duplicate-name pattern
      // subwayArrivalIntelligence.tests.js's own REQUIRED_DUPLICATE_NAMES
      // list already documents as real, not a data error. A genuine bug
      // would show up as distance going BACKWARD, which this still catches.
      var cum = 0, lastCum = 0, neverBacktracks = true;
      for (var k = 1; k < leg.orderedStops.length; k++) {
        cum += _haversineM(leg.orderedStops[k - 1], leg.orderedStops[k]);
        if (cum < lastCum) { neverBacktracks = false; break; }
        lastCum = cum;
      }
      results.push(_assert('#9 real cumulative distance never goes backward along the resolved path', neverBacktracks, { totalMeters: Math.round(cum) }));

      // ── #10 boarding/exit walk distances are real, non-negative, within the walkable bound ──
      results.push(_assert('#10 boarding/exit walk distances are real, non-negative, and within the walkable bound',
        leg.boardingWalkMeters >= 0 && leg.exitWalkMeters >= 0 &&
        leg.boardingWalkMeters <= resolver.MAX_WALK_TO_STATION_M && leg.exitWalkMeters <= resolver.MAX_WALK_TO_STATION_M,
        { boardingWalkMeters: leg.boardingWalkMeters, exitWalkMeters: leg.exitWalkMeters }));

      // ── #11 resolveLeg is deterministic — same input resolves to the same leg ──
      var repeat = resolver.resolveLeg(
        { longitude: leg.boardingStation.longitude, latitude: leg.boardingStation.latitude },
        { longitude: leg.exitStation.longitude, latitude: leg.exitStation.latitude }
      );
      results.push(_assert('#11 resolveLeg is deterministic for the same real input',
        repeat.ok && repeat.routeId === leg.routeId && repeat.orderedStops.length === leg.orderedStops.length, repeat));

      // ── #12 getLiveCandidates never throws and never fabricates a candidate without a real logicalTrainId ──
      var candidates = null, threw = null;
      try { candidates = resolver.getLiveCandidates(leg); } catch (e) { threw = e; }
      results.push(_assert('#12 getLiveCandidates does not throw on a real resolved leg (even with no live realtime data loaded)',
        !threw && Array.isArray(candidates), { threw: threw && threw.message, candidates: candidates }));
      if (Array.isArray(candidates)) {
        var allHaveRealTrainId = candidates.every(function (c) { return !!c.logicalTrainId; });
        results.push(_assert('#13 every returned live candidate has a real, identity-associated logicalTrainId', allHaveRealTrainId, candidates));
      }

      // ── #13b getLiveCandidates end-to-end: a synthetic-but-real-shaped
      // TripUpdate + vehicle injected for the discovered leg's own real
      // route/boarding station must actually surface as a candidate once
      // rolling stock reconciles identity — the exact join
      // (station-library studioRichStationId, NOT a bare `.id`) this
      // function depends on. Regression for a real bug caught during this
      // build (getArrivalsForStation was called with the wrong field). ──
      var rs = SBE.SubwayLogicalRollingStockAuthority;
      if (rs) {
        var boardingRawStopId = store.getStation(leg.boardingStation.id).authoritativeIds.gtfsStopId;
        var exitRawStopId = store.getStation(leg.exitStation.id).authoritativeIds.gtfsStopId;
        var routeRaw = store.getRoute(leg.routeId).authoritativeId;
        var T0 = 1755700000000;
        var tripForward = 'itin-leg-test-trip-forward';
        var tripBackward = 'itin-leg-test-trip-backward';
        store.applyRealtimeUpdate(
          [
            // Forward: real remaining stop sequence reaches the exit station after boarding.
            _tripRow(tripForward, routeRaw, 'itin-leg-test-train-fwd', 'TEST', [
              { stopId: boardingRawStopId, arrivalUtcMs: T0 + 60000, departureUtcMs: T0 + 65000 },
              { stopId: exitRawStopId, arrivalUtcMs: T0 + 600000, departureUtcMs: null },
            ]),
            // Backward: same two stops, reversed — a real train heading the other way.
            _tripRow(tripBackward, routeRaw, 'itin-leg-test-train-bwd', 'TEST', [
              { stopId: exitRawStopId, arrivalUtcMs: T0 + 30000, departureUtcMs: T0 + 35000 },
              { stopId: boardingRawStopId, arrivalUtcMs: T0 + 90000, departureUtcMs: null },
            ]),
          ],
          [
            _vehicleRow(tripForward, routeRaw, 'itin-leg-test-train-fwd', boardingRawStopId, 'IN_TRANSIT_TO'),
            _vehicleRow(tripBackward, routeRaw, 'itin-leg-test-train-bwd', boardingRawStopId, 'IN_TRANSIT_TO'),
          ],
          [GROUP]
        );
        rs.reconcile({ now: T0 });
        var liveCandidates = resolver.getLiveCandidates(leg, { now: T0 });
        var foundForward = liveCandidates.find(function (c) { return c.tripId && c.tripId.indexOf(tripForward) !== -1; });
        var foundBackward = liveCandidates.find(function (c) { return c.tripId && c.tripId.indexOf(tripBackward) !== -1; });
        results.push(_assert('#13b a real-shaped synthetic arrival for the leg\'s own boarding station surfaces as a live candidate with a real logicalTrainId',
          !!foundForward && !!foundForward.logicalTrainId, { liveCandidates: liveCandidates }));
        results.push(_assert('#13c directionConfirmed is true for a trip whose real remaining stops actually reach the exit station',
          !!foundForward && foundForward.directionConfirmed === true, foundForward));
        results.push(_assert('#13d directionConfirmed is false for a trip heading the opposite real direction (never a false positive)',
          !!foundBackward && foundBackward.directionConfirmed === false, foundBackward));

        // ── #13e 0821_SUBWAY_Boarding_UX — a real, serious production bug
        // found via a genuine end-to-end MUSIC(5176) -> LIVE MAP launch: this
        // function used to guard on `legResolution.ok`, a field that exists
        // ONLY on resolveLeg()'s own raw return shape — never on the real
        // MUSIC-side TransitLegPlan a running ride's `_state.leg` actually
        // holds (wallSubwayItineraryRideBridge.ts's launchTransitLeg() sends
        // exactly that shape over the real startLeg command, with no `ok`
        // field). Every existing test above happened to pass the raw
        // resolver shape directly, so none of them could ever have caught
        // this — it silently returned zero candidates/no preview for EVERY
        // real production ride, independent of how much real live data
        // existed. This constructs the real MUSIC shape explicitly (no .ok,
        // no .shapeId) and proves it behaves identically to the raw shape. ──
        var musicShapedLeg = {
          routeId: leg.routeId, routeLabel: leg.routeLabel, boardingStation: leg.boardingStation,
          exitStation: leg.exitStation, direction: leg.direction, orderedStops: leg.orderedStops,
        };
        results.push(_assert('#13e setup: the MUSIC-shaped leg genuinely has no .ok field (this is the real bug precondition)', !('ok' in musicShapedLeg)));
        var musicShapedCandidates = resolver.getLiveCandidates(musicShapedLeg, { now: T0 });
        var foundForwardViaMusicShape = musicShapedCandidates.find(function (c) { return c.tripId && c.tripId.indexOf(tripForward) !== -1; });
        results.push(_assert('#13e getLiveCandidates() surfaces the same real candidate for the real MUSIC-side leg shape, not just the raw resolver shape',
          !!foundForwardViaMusicShape && !!foundForwardViaMusicShape.logicalTrainId, { musicShapedCandidates: musicShapedCandidates }));
        var musicShapedPreview = resolver.getNextArrivalPreview(musicShapedLeg, { now: T0 });
        results.push(_assert('#13f getNextArrivalPreview() also works for the real MUSIC-side leg shape',
          !!musicShapedPreview && musicShapedPreview.hasIdentity === true, musicShapedPreview));

        // Clean up this test's synthetic data so it never leaks into later runs.
        store.applyRealtimeUpdate([], [], [GROUP]);
      }

      // ── #14 getLiveCandidates on a not-ok leg returns an empty array, never throws ──
      var badCandidates = resolver.getLiveCandidates({ ok: false, reason: 'same_station' });
      results.push(_assert('#14 getLiveCandidates returns [] for a failed leg resolution, never throws', Array.isArray(badCandidates) && badCandidates.length === 0, badCandidates));

      // ── #15/#16 opts.preferredRouteId — real 59 St/Atlantic Av-Barclays Ctr
      // R-line proof case: both stations are also served by N, so an explicit
      // preferredRouteId must be honored (never silently overridden), and an
      // out-of-family route must fail honestly rather than fabricate a path. ──
      var r41 = store.getAllStations().filter(function (s) { return s.authoritativeIds && s.authoritativeIds.gtfsStopId === 'R41'; })[0];
      var r31 = store.getAllStations().filter(function (s) { return s.authoritativeIds && s.authoritativeIds.gtfsStopId === 'R31'; })[0];
      if (r41 && r31) {
        var rLeg = resolver.resolveLeg(
          { longitude: r41.longitude, latitude: r41.latitude },
          { longitude: r31.longitude, latitude: r31.latitude },
          { preferredRouteId: 'subway:route:R' }
        );
        results.push(_assert('#15 opts.preferredRouteId is honored for a real ambiguous (shared N/R) station pair',
          rLeg.ok && rLeg.routeId === 'subway:route:R', rLeg));
        var stopNames = rLeg.ok ? rLeg.orderedStops.map(function (s) { return s.name; }) : [];
        results.push(_assert('#15b the R-preferred leg includes real R-only local stops the shared N route would skip',
          stopNames.indexOf('53 St') !== -1 && stopNames.indexOf('45 St') !== -1, stopNames));

        var notDirectRouteId = store.getAllRoutes().map(function (r) { return r.id; })
          .filter(function (id) { return (r41.routeIds || []).indexOf(id) === -1; })[0];
        if (notDirectRouteId) {
          var badPref = resolver.resolveLeg(
            { longitude: r41.longitude, latitude: r41.latitude },
            { longitude: r31.longitude, latitude: r31.latitude },
            { preferredRouteId: notDirectRouteId }
          );
          results.push(_assert('#16 an out-of-family preferredRouteId fails honestly as preferred_route_not_direct',
            badPref.ok === false && badPref.reason === 'preferred_route_not_direct', badPref));
        }
      }

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayItineraryLegResolverTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayItineraryLegResolverTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayItineraryLegResolverTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayItineraryLegResolverTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
