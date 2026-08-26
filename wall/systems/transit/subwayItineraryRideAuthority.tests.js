// ── SubwayItineraryRideAuthority Tests v1.0.0 ─────────────────────────────────
// 0819_SUBWAY_Itinerary_Execution_Map_Authoring
// Status: active | Classification: test-harness
//
// Run via: SBE.SubwayItineraryRideAuthorityTests.run()
//
// Uses the real committed static GTFS snapshot (via SubwayItineraryLegResolver,
// already proven in the prior checkpoint) plus synthetic-but-real-shaped
// TripUpdate/VehiclePosition rows injected through the real
// applyRealtimeUpdate() path — same convention as every other SUBWAY test
// file this session. Real Sunroof/MTASubwayMapLayer are exercised for real
// (this suite runs inside the live wall/index.html page, which has a real
// Mapbox map) — never a mocked camera controller.
//
// Placement: wall/systems/transit/subwayItineraryRideAuthority.tests.js
// Load: AFTER subwayItineraryRideAuthority.js, subwayItineraryLegResolver.js,
//       subwayLogicalRollingStockAuthority.js, subwayCameraSunroof.js,
//       mtaSubwayMapLayer.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var GROUP = 'ride-authority-test';
  function _tripRow(tripId, routeId, trainId, direction, stopTimes) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, direction: direction || null, stopTimeUpdates: stopTimes || [], sourceGroupId: GROUP };
  }
  function _vehicleRow(tripId, routeId, trainId, stopId, currentStatus) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, stopId: stopId || null, currentStatus: currentStatus || null, sourceGroupId: GROUP };
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var lib = SBE.MTASubwayStationLibrary;
    var resolver = SBE.SubwayItineraryLegResolver;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var ride = SBE.SubwayItineraryRideAuthority;
    var mapLayer = SBE.MTASubwayMapLayer;
    var sunroof = SBE.SunroofCameraController;
    var results = [];
    if (!store || !lib || !resolver || !rs || !ride || !mapLayer || !sunroof) {
      results.push(_assert('all required SBE authorities are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      lib.__resetForTests();
      lib.importFromStaticModel();
      ride.__test.resetForTests();

      var r41 = store.getAllStations().filter(function (s) { return s.authoritativeIds && s.authoritativeIds.gtfsStopId === 'R41'; })[0];
      var r31 = store.getAllStations().filter(function (s) { return s.authoritativeIds && s.authoritativeIds.gtfsStopId === 'R31'; })[0];
      results.push(_assert('the real R41/R31 test stations exist in the committed snapshot', !!r41 && !!r31));
      if (!r41 || !r31) {
        var failedEarly = results.filter(function (r) { return !r.pass; });
        return { ok: failedEarly.length === 0, total: results.length, failed: failedEarly.length, results: results };
      }

      var leg = resolver.resolveLeg(
        { longitude: r41.longitude, latitude: r41.latitude },
        { longitude: r31.longitude, latitude: r31.latitude },
        { preferredRouteId: 'subway:route:R' }
      );
      results.push(_assert('the real R-line 59 St -> Atlantic Av-Barclays Ctr leg resolves', leg.ok, leg));

      // ── #1 idle by default ──
      var idleSnap = ride.getSnapshot();
      results.push(_assert('#1 ride is idle before any startLeg() call', idleSnap.status === 'idle'));

      // ── #2 startLeg sets waiting_to_board with the real boarding station as nextStopId ──
      var startResult = ride.startLeg('itin-test', 'stage-test', leg);
      results.push(_assert('#2 startLeg() returns ok:true for a real resolved leg', startResult.ok));
      var afterStart = ride.getSnapshot();
      results.push(_assert('#2b status becomes waiting_to_board', afterStart.status === 'waiting_to_board', afterStart.status));
      results.push(_assert('#2c nextStopId is the real boarding station before any train is selected', afterStart.nextStopId === leg.boardingStation.id, afterStart.nextStopId));
      results.push(_assert('#2d itineraryId/stageId round-trip', afterStart.itineraryId === 'itin-test' && afterStart.stageId === 'stage-test'));

      // ── #3 startLeg rejects an invalid leg ──
      var badStart = ride.startLeg('x', 'y', { boardingStation: null });
      results.push(_assert('#3 startLeg() rejects an invalid/unresolved leg rather than starting a fake ride', badStart.ok === false && badStart.reason === 'invalid_leg'));
      ride.startLeg('itin-test', 'stage-test', leg); // restore a real active leg for the rest of the suite

      // ── #4 getLiveCandidates delegates to the resolver, never fabricates ──
      var candidatesEmpty = ride.getLiveCandidates();
      results.push(_assert('#4 getLiveCandidates() returns an array (delegates to SubwayItineraryLegResolver, no throw)', Array.isArray(candidatesEmpty)));

      // ── #4b getBoardingContext() composes candidates + a raw next-arrival
      // preview (0821_SUBWAY_Boarding_UX). Structure only, never a
      // zero-length assertion — this runs against a REAL live MTA feed, so a
      // real R-line candidate can legitimately already exist at test time
      // (same reasoning #4's own pre-existing candidatesEmpty check above
      // already applies). ──
      var boardingCtxEmpty = ride.getBoardingContext();
      results.push(_assert('#4b getBoardingContext() returns a well-formed {candidates, nextArrival} shape, never throwing',
        Array.isArray(boardingCtxEmpty.candidates) && (boardingCtxEmpty.nextArrival === null || typeof boardingCtxEmpty.nextArrival === 'object'), boardingCtxEmpty));

      // ── #5 selectTrain rejects an unknown logicalTrainId ──
      var badSelect = ride.selectTrain('sr-train-does-not-exist-999999');
      results.push(_assert('#5 selectTrain() rejects an unknown logicalTrainId, never starts a fake ride', badSelect.ok === false && badSelect.reason === 'not_found'));
      results.push(_assert('#5b status stays waiting_to_board after a rejected selection', ride.getSnapshot().status === 'waiting_to_board'));

      // ── Inject one real-shaped synthetic trip+vehicle on the real R line, boarding at R41 ──
      // Real intermediate stops (R41 -> R36 -> R35 -> R31, all real stations
      // on the real corridor) so "riding" (next stop is NOT yet the exit)
      // is a genuinely distinct, observable state from "approaching_exit"
      // (next stop IS the exit) — a synthetic trip with only board+exit
      // stops would jump straight from selection to approaching_exit, which
      // is correct for THAT data shape but wouldn't exercise the "riding"
      // state at all.
      var routeRaw = store.getRoute(leg.routeId).authoritativeId;
      var syntheticTripId = 'ride-test-trip-1';
      var syntheticTrainId = 'ride-test-train-1';
      // Kept as reusable rows (not just a one-off call) — applyRealtimeUpdate
      // REPLACES a group's entire trip set with exactly what's passed, so
      // the race block just below must re-include these alongside its own
      // new trip or this main synthetic trip silently vanishes from the
      // store the instant the race block runs (a real bug this exact
      // checkpoint's own new getTrainMatchInfo() validation caught: #6
      // started failing with 'wrong_direction' because the train it was
      // trying to board had genuinely stopped being a live arrival by the
      // time selectTrain() ran, since the race block below had already
      // wiped it — not a bug in the new validation, a pre-existing fixture
      // isolation gap this exposed).
      var mainTripRows = [_tripRow(syntheticTripId, routeRaw, syntheticTrainId, 'TEST', [
        { stopId: 'R41', arrivalUtcMs: Date.now() + 60000, departureUtcMs: Date.now() + 65000 },
        { stopId: 'R36', arrivalUtcMs: Date.now() + 180000, departureUtcMs: Date.now() + 185000 },
        { stopId: 'R35', arrivalUtcMs: Date.now() + 300000, departureUtcMs: Date.now() + 305000 },
        { stopId: 'R31', arrivalUtcMs: Date.now() + 600000, departureUtcMs: null },
      ])];
      var mainVehicleRows = [_vehicleRow(syntheticTripId, routeRaw, syntheticTrainId, 'R41', 'STOPPED_AT')];
      store.applyRealtimeUpdate(mainTripRows, mainVehicleRows, [GROUP]);
      rs.reconcile();
      var myTrip = store.getAllTrips().filter(function (t) { return t.authoritativeId === syntheticTripId; })[0];
      var assoc = myTrip ? rs.getTripAssociationByCanonicalId(myTrip.id) : null;
      results.push(_assert('a real logicalTrainId got associated with the synthetic trip via the real reconcile() path', !!assoc && !!assoc.logicalTrainId, assoc));

      // ── 0820_SUBWAY_Itinerary_Ride_Candidate_Resolver — real race, reproduced
      // and fixed: SubwayArrivalIntelligence reads store.getAllTrips() (and
      // therefore this trip's ETA) the instant the feed reports it, but
      // SubwayItineraryLegResolver.getLiveCandidates() additionally requires
      // a real logicalTrainId, which only exists once rolling stock's OWN
      // reconcile() has independently processed the same trip. Injecting a
      // trip WITHOUT calling reconcile() afterward reproduces exactly the
      // reported "arrivals visible, candidates empty" symptom; getLiveCandidates()
      // now calls reconcile() itself before delegating, closing the gap.
      (function () {
        // 0821_SUBWAY_Boarding_UX — a real, live-page issue found running
        // this suite repeatedly in the same long session: rolling stock
        // persists trip associations to localStorage across reloads, so a
        // FIXED id here can pick up a stale association from an earlier run
        // hours ago, silently spoiling the "no association yet" precondition
        // this whole block depends on. A unique id per run (never reset via
        // rs.__resetForTests(), which would also wipe every REAL train
        // currently rendering live on this page) closes that gap without
        // disrupting real state.
        var raceTripId = 'ride-test-trip-race-' + Date.now();
        var raceTrainId = 'ride-test-train-race-' + Date.now();
        // Re-includes mainTripRows/mainVehicleRows alongside the new race
        // trip — this call REPLACES the whole group, so omitting them would
        // silently erase the main synthetic trip (see the comment where
        // mainTripRows is defined above).
        store.applyRealtimeUpdate(
          mainTripRows.concat([_tripRow(raceTripId, routeRaw, raceTrainId, 'TEST', [
            { stopId: 'R41', arrivalUtcMs: Date.now() + 90000, departureUtcMs: Date.now() + 95000 },
            { stopId: 'R31', arrivalUtcMs: Date.now() + 700000, departureUtcMs: null },
          ])]),
          mainVehicleRows.concat([_vehicleRow(raceTripId, routeRaw, raceTrainId, 'R41', 'STOPPED_AT')]),
          [GROUP]
        );
        // Deliberately no rs.reconcile() call here — this is the race itself.
        var raceTrip = store.getAllTrips().filter(function (t) { return t.authoritativeId === raceTripId; })[0];
        var assocBefore = raceTrip ? rs.getTripAssociationByCanonicalId(raceTrip.id) : null;
        results.push(_assert('#9 setup: the new trip genuinely has no rolling-stock association yet (the race precondition)',
          !assocBefore, assocBefore));

        // ── 0821_SUBWAY_Boarding_UX — the exact "arrival exists / boardable
        // identity doesn't yet" signal the WAITING TO BOARD HUD needs, read
        // BEFORE getLiveCandidates() below triggers its own reconcile() side
        // effect, so this genuinely observes the still-open race window.
        // Checked via routeArrivalsForLeg() (matching OUR SPECIFIC trip by
        // tripId), never getNextArrivalPreview()'s aggregate "soonest across
        // the whole route" — a real/residual live arrival on this shared
        // test corridor can legitimately be sooner than our synthetic one,
        // which would make a "soonest" assertion flaky without saying
        // anything false about the feature itself (confirmed live: this
        // exact flake reproduced repeatedly re-running this suite on one
        // long-lived page). ──
        var rawArrivalsDuringRace = resolver.__test.routeArrivalsForLeg(leg);
        var ourRawArrival = rawArrivalsDuringRace.filter(function (a) { return a.tripId === raceTrip.id; })[0];
        results.push(_assert('the underlying per-arrival data getNextArrivalPreview() reads from carries OUR trip with no logicalTrainId yet — never fabricates one',
          !!ourRawArrival && !ourRawArrival.logicalTrainId, ourRawArrival));

        var previewDuringRace = resolver.getNextArrivalPreview(leg);
        results.push(_assert('getNextArrivalPreview() itself returns a well-formed, real (non-fabricated) arrival preview during the race window',
          !!previewDuringRace && typeof previewDuringRace.etaSeconds === 'number' && typeof previewDuringRace.hasIdentity === 'boolean', previewDuringRace));

        var candidatesDuringRace = ride.getLiveCandidates();
        var foundDuringRace = candidatesDuringRace.some(function (c) { return c.tripId === raceTrip.id; });
        results.push(_assert('#9 getLiveCandidates() still surfaces the new trip — it reconciles internally before delegating, closing the exact race that produced "LIVE TRAINS — NONE RIGHT NOW" on a real runtime',
          foundDuringRace, candidatesDuringRace.map(function (c) { return c.tripId; })));

        var assocAfter = rs.getTripAssociationByCanonicalId(raceTrip.id);
        results.push(_assert('#9 the association getLiveCandidates() triggered is a REAL one (not a fabricated candidate) — a real logicalTrainId now exists',
          !!assocAfter && !!assocAfter.logicalTrainId, assocAfter));

        // ── 0821_SUBWAY_Boarding_UX — once reconcile has caught up,
        // getBoardingContext()'s own candidates list carries the same real
        // train, and its nextArrival now reports hasIdentity:true — proving
        // the composed view converges to consistent, non-contradictory
        // "boardable" and "arriving" signals once identity resolves. ──
        var boardingCtxAfterRace = ride.getBoardingContext();
        results.push(_assert('getBoardingContext() candidates include the now-associated race train', boardingCtxAfterRace.candidates.some(function (c) { return c.tripId === raceTrip.id; }), boardingCtxAfterRace));
      })();

      if (assoc && assoc.logicalTrainId) {
        var logicalTrainId = assoc.logicalTrainId;

        // Ensure SUBWAY is genuinely active (Sunroof.attach() requires
        // MTASubwayMapLayer.isActive() — real precondition, not mocked).
        if (!mapLayer.isActive()) { try { mapLayer.activate(); } catch (e) {} }

        // ── #6 selectTrain succeeds for a real, identity-associated train and hands off to the real Sunroof ──
        var selectResult = ride.selectTrain(logicalTrainId);
        results.push(_assert('#6 selectTrain() succeeds for a real train once SUBWAY is active', selectResult.ok, selectResult));
        var afterSelect = ride.getSnapshot();
        results.push(_assert('#6b status becomes riding', afterSelect.status === 'riding', afterSelect.status));
        results.push(_assert('#6c selectedLogicalTrainId round-trips', afterSelect.selectedLogicalTrainId === logicalTrainId));
        results.push(_assert('#6d the REAL, unmodified SunroofCameraController actually attached to this exact train', sunroof.isActive() && sunroof.getActiveTrainId() === logicalTrainId, { sunroofActive: sunroof.isActive(), sunroofTrain: sunroof.getActiveTrainId() }));

        // ── #7 tick() advances current/next from the real position authority, never fabricated ──
        ride.__test.tick();
        var afterTick = ride.getSnapshot();
        results.push(_assert('#7 currentStopId after tick() is the real observed R41 dwell', afterTick.currentStopId === 'subway:stop:R41', afterTick.currentStopId));

        // ── #8 simulate the train moving to the real next stop (still short of exit) ──
        store.applyRealtimeUpdate(
          [_tripRow(syntheticTripId, routeRaw, syntheticTrainId, 'TEST', [
            { stopId: 'R36', arrivalUtcMs: Date.now() + 120000, departureUtcMs: Date.now() + 125000 },
            { stopId: 'R35', arrivalUtcMs: Date.now() + 240000, departureUtcMs: Date.now() + 245000 },
            { stopId: 'R31', arrivalUtcMs: Date.now() + 600000, departureUtcMs: null },
          ])],
          [_vehicleRow(syntheticTripId, routeRaw, syntheticTrainId, 'R36', 'STOPPED_AT')],
          [GROUP]
        );
        rs.reconcile();
        ride.__test.tick();
        var afterMidTick = ride.getSnapshot();
        results.push(_assert('#8 currentStopId advances to the real next dwell (R36) mid-ride', afterMidTick.currentStopId === 'subway:stop:R36', afterMidTick.currentStopId));
        results.push(_assert('#8b status is still riding (next stop R35 is not yet the exit)', afterMidTick.status === 'riding', afterMidTick.status));

        // ── #8c simulate the train reaching the stop immediately before the exit -> approaching_exit ──
        store.applyRealtimeUpdate(
          [_tripRow(syntheticTripId, routeRaw, syntheticTrainId, 'TEST', [
            { stopId: 'R35', arrivalUtcMs: Date.now() + 60000, departureUtcMs: Date.now() + 65000 },
            { stopId: 'R31', arrivalUtcMs: Date.now() + 300000, departureUtcMs: null },
          ])],
          [_vehicleRow(syntheticTripId, routeRaw, syntheticTrainId, 'R35', 'STOPPED_AT')],
          [GROUP]
        );
        rs.reconcile();
        ride.__test.tick();
        var afterApproachTick = ride.getSnapshot();
        results.push(_assert('#8d status becomes approaching_exit once the real next stop is the real exit station', afterApproachTick.status === 'approaching_exit', afterApproachTick.status));

        // ── #9 simulate the train arriving AT the real exit station -> completed ──
        store.applyRealtimeUpdate(
          [_tripRow(syntheticTripId, routeRaw, syntheticTrainId, 'TEST', [
            { stopId: 'R31', arrivalUtcMs: Date.now() + 30000, departureUtcMs: Date.now() + 35000 },
          ])],
          [_vehicleRow(syntheticTripId, routeRaw, syntheticTrainId, 'R31', 'STOPPED_AT')],
          [GROUP]
        );
        rs.reconcile();
        ride.__test.tick();
        var afterExitTick = ride.getSnapshot();
        results.push(_assert('#9 status becomes completed once the train is genuinely observed at the real exit station', afterExitTick.status === 'completed', afterExitTick.status));
        results.push(_assert('#9b completedAt is set on completion', !!afterExitTick.completedAt));

        // ── #10 stopRide() detaches the real Sunroof and returns to idle ──
        ride.stopRide();
        var afterStop = ride.getSnapshot();
        results.push(_assert('#10 stopRide() returns ride to idle', afterStop.status === 'idle', afterStop.status));
        results.push(_assert('#10b stopRide() detaches the real Sunroof', sunroof.isActive() === false, sunroof.isActive()));
      }

      // ── #11 cross-tab command receipt (simulateCommand) drives the same real path ──
      // A real commandId is required, matching every real command MUSIC
      // actually sends (see wallSubwayItineraryRideBridge.ts's genId()) — a
      // command missing one is honestly dropped by the de-dupe guard rather
      // than silently applied.
      ride.__test.resetForTests();
      ride.__test.simulateCommand({ type: 'startLeg', itineraryId: 'itin-x', stageId: 'stage-x', leg: leg, commandId: 'test-cmd-1', issuedAt: new Date().toISOString() });
      results.push(_assert('#11 simulateCommand("startLeg") drives the same real startLeg() path', ride.getSnapshot().status === 'waiting_to_board'));

      // Cleanup — never leak synthetic data into later runs.
      store.applyRealtimeUpdate([], [], [GROUP]);
      ride.stopRide();

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayItineraryRideAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayItineraryRideAuthorityTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayItineraryRideAuthorityTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayItineraryRideAuthorityTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
