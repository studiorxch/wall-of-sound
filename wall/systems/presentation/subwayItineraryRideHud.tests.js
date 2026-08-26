// ── SubwayItineraryRideHud Tests v1.0.0 ───────────────────────────────────────
// 0821_SUBWAY_Boarding_UX
// Status: active | Classification: test-harness
//
// Run via: SBE.SubwayItineraryRideHudTests.run()
//
// Same real-corridor synthetic-trip convention as
// subwayItineraryRideAuthority.tests.js (real R41/R31 stations, synthetic-
// but-real-shaped TripUpdate/VehiclePosition rows via the real
// applyRealtimeUpdate() path) — never a mocked authority.
//
// Placement: wall/systems/presentation/subwayItineraryRideHud.tests.js
// Load: AFTER subwayItineraryRideHud.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var GROUP = 'ride-hud-test';
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
    var hud = SBE.SubwayItineraryRideHud;
    var mapLayer = SBE.MTASubwayMapLayer;
    var results = [];
    if (!store || !lib || !resolver || !rs || !ride || !hud || !mapLayer) {
      results.push(_assert('all required SBE authorities + the ride HUD are loaded', false));
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
      results.push(_assert('the real R-line leg resolves', leg.ok, leg));
      if (!leg.ok) {
        var failedNoLeg = results.filter(function (r) { return !r.pass; });
        return { ok: failedNoLeg.length === 0, total: results.length, failed: failedNoLeg.length, results: results };
      }

      // ── #1 quiet at idle ──
      results.push(_assert('#1 HUD root is hidden while ride status is idle', global.getComputedStyle(_ensureVisibleRoot()).display === 'none'));

      // ── #2/#3 waiting_to_board explanatory copy — driven through a
      // test-only getBoardingContext override rather than real corridor
      // state: this suite runs against a REAL live MTA feed, and a real
      // R41/R31 corridor can genuinely already have real live candidates on
      // it at test time (confirmed live — a first pass at this suite,
      // written assuming an empty corridor, failed here for exactly that
      // reason). The override is production-inert (always null outside
      // tests) — see subwayItineraryRideAuthority.js's __test.setBoarding-
      // ContextOverride for the real rationale. ──
      ride.startLeg('itin-hud-test', 'stage-hud-test', leg);
      try {
        ride.__test.setBoardingContextOverride(function () { return { candidates: [], nextArrival: null }; });
        hud.__test.renderNow();
        var root = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#2 HUD root is visible once a leg is waiting_to_board', !!root && global.getComputedStyle(root).display !== 'none'));
        results.push(_assert('#2b with genuinely no arrivals at all, the HUD says so honestly rather than a generic "none right now"',
          root.textContent.indexOf('No trains currently predicted') !== -1, root.textContent));
        results.push(_assert('#2c no NEXT ARRIVAL row renders when there is truly no real arrival', root.textContent.indexOf('NEXT ARRIVAL') === -1));

        // ── #3 an arrival exists but isn't boardable yet (the reconcile race) ──
        ride.__test.setBoardingContextOverride(function () { return { candidates: [], nextArrival: { etaSeconds: 240, dueSoon: false, hasIdentity: false } }; });
        hud.__test.renderNow();
        var rootDuringRace = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#3 explicitly distinguishes "arrival exists" from "boardable identity exists" — NO BOARDABLE TRAIN YET even with a real arrival present',
          rootDuringRace.textContent.indexOf('NO BOARDABLE TRAIN YET') !== -1, rootDuringRace.textContent));
        results.push(_assert('#3b a real NEXT ARRIVAL eta renders during the race window (the arrival is real, just not yet boardable)',
          rootDuringRace.textContent.indexOf('NEXT ARRIVAL') !== -1 && rootDuringRace.textContent.indexOf('4 min') !== -1, rootDuringRace.textContent));
        results.push(_assert('#3c "Waiting for live train identity" copy renders, never a fabricated candidate', rootDuringRace.textContent.indexOf('Waiting for live train identity') !== -1));
        results.push(_assert('#3d no BOARD-labeled candidate row renders yet (nothing is honestly boardable)', !rootDuringRace.querySelector('.subway-ride-hud-candidate')));
      } finally {
        ride.__test.setBoardingContextOverride(null);
      }

      // ── #4 identity resolves -> a real boardable candidate renders with an
      // explicit BOARD affordance. Real synthetic trip injection from here
      // on (not the override) — #5/#6 need a REAL bindable logicalTrainId,
      // which only a real reconcile() pass can produce. Uses a real
      // intermediate stop (R41 -> R36 -> R31) so a successful board lands on
      // "riding" first, not "approaching_exit" — a board+exit-only trip
      // would jump straight past "riding" (see subwayItineraryRideAuthority
      // .tests.js's own header for why a 2-stop synthetic trip does that). ──
      var routeRaw = store.getRoute(leg.routeId).authoritativeId;
      // Unique per run — rolling stock persists associations to localStorage
      // across reloads, so a fixed id can pick up a stale association from
      // an earlier run in this same long session (see the matching fix/
      // comment in subwayItineraryRideAuthority.tests.js).
      var raceTripId = 'hud-test-trip-race-' + Date.now();
      var raceTrainId = 'hud-test-train-race-' + Date.now();
      store.applyRealtimeUpdate(
        [_tripRow(raceTripId, routeRaw, raceTrainId, 'TEST', [
          { stopId: 'R41', arrivalUtcMs: Date.now() + 90000, departureUtcMs: Date.now() + 95000 },
          { stopId: 'R36', arrivalUtcMs: Date.now() + 240000, departureUtcMs: Date.now() + 245000 },
          { stopId: 'R31', arrivalUtcMs: Date.now() + 700000, departureUtcMs: null },
        ])],
        [_vehicleRow(raceTripId, routeRaw, raceTrainId, 'R41', 'STOPPED_AT')],
        [GROUP]
      );
      rs.reconcile();
      hud.__test.renderNow();
      var rootBoardable = global.document.getElementById('subway-ride-hud');
      var candidateBtn = rootBoardable.querySelector('.subway-ride-hud-candidate');
      results.push(_assert('#4 once identity resolves, a real candidate row renders', !!candidateBtn));
      results.push(_assert('#4b the candidate row explicitly says BOARD — never a bare, unlabeled destination/ETA row', !!candidateBtn && candidateBtn.textContent.indexOf('BOARD') !== -1, candidateBtn && candidateBtn.textContent));
      results.push(_assert('#4c explanatory copy tells the user what the action is', rootBoardable.textContent.indexOf('Select a matching train to begin the ride') !== -1));

      var raceTrip = store.getAllTrips().filter(function (t) { return t.authoritativeId === raceTripId; })[0];
      var assoc = raceTrip ? rs.getTripAssociationByCanonicalId(raceTrip.id) : null;
      results.push(_assert('setup: the race trip is now really identity-associated', !!assoc && !!assoc.logicalTrainId, assoc));

      // ── #5 the map-selected-train alternate boarding path ──
      if (assoc && assoc.logicalTrainId) {
        if (!mapLayer.isActive()) { try { mapLayer.activate(); } catch (e) {} }
        mapLayer.selectTrain(assoc.logicalTrainId); // the EXISTING, already-wired map click handler's own action — untouched
        hud.__test.renderNow();
        var rootMapMatch = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#5 selecting the matching train ON THE MAP surfaces an explicit match callout, reusing the existing click-wired selection — no new map-click plumbing',
          rootMapMatch.textContent.indexOf('MATCHES YOUR TRIP') !== -1, rootMapMatch.textContent));
        var boardTrainBtn = rootMapMatch.querySelector('.subway-ride-hud-board-btn--primary');
        results.push(_assert('#5b a BOARD THIS TRAIN button renders for the map-matched train', !!boardTrainBtn && boardTrainBtn.textContent.indexOf('BOARD THIS TRAIN') !== -1, boardTrainBtn && boardTrainBtn.textContent));
        results.push(_assert('#5c the BOARD TRAIN button targets the real matched logicalTrainId', !!boardTrainBtn && boardTrainBtn.getAttribute('data-train-id') === assoc.logicalTrainId));

        // ── #6 clicking BOARD actually boards — waiting_to_board -> riding, plus a visible confirmation ──
        results.push(_assert('#6 setup: still waiting_to_board before the click', ride.getSnapshot().status === 'waiting_to_board'));
        boardTrainBtn.click();
        var afterBoardSnap = ride.getSnapshot();
        results.push(_assert('#6b clicking BOARD TRAIN genuinely binds a real logicalTrainId and advances to riding', afterBoardSnap.status === 'riding' && afterBoardSnap.selectedLogicalTrainId === assoc.logicalTrainId, afterBoardSnap));
        var rootAfterBoard = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#6c a visible "BOARDED ... TRAIN" confirmation appears immediately after boarding', rootAfterBoard.textContent.indexOf('BOARDED') !== -1 && rootAfterBoard.textContent.indexOf('TRAIN') !== -1, rootAfterBoard.textContent));
        results.push(_assert('#6d CURRENT/NEXT/EXIT rows are still present once riding (unchanged existing behavior)',
          rootAfterBoard.textContent.indexOf('CURRENT') !== -1 && rootAfterBoard.textContent.indexOf('NEXT') !== -1 && rootAfterBoard.textContent.indexOf('EXIT') !== -1));
        var itinExitBtn = rootAfterBoard.querySelector('.subway-ride-hud-exit');
        results.push(_assert('#6e EXIT TRAIN is explicitly available for an itinerary ride too, not just a free ride', !!itinExitBtn && itinExitBtn.textContent.indexOf('EXIT TRAIN') !== -1));

        ride.stopRide();
        mapLayer.clearTrainSelection();
      }

      // ── #8 0821_SUBWAY_Boarding_UX_TrainRideSession — free ride: no
      // itinerary required to board. Selecting any real live train with no
      // active leg offers a plain BOARD TRAIN (no itinerary framing), and
      // boarding it goes straight idle -> riding with leg:null. ──
      ride.__test.resetForTests();
      var freeTripId = 'hud-test-trip-free-' + Date.now();
      var freeTrainId = 'hud-test-train-free-' + Date.now();
      store.applyRealtimeUpdate(
        [_tripRow(freeTripId, routeRaw, freeTrainId, 'TEST', [
          { stopId: 'R41', arrivalUtcMs: Date.now() + 60000, departureUtcMs: Date.now() + 65000 },
          { stopId: 'R36', arrivalUtcMs: Date.now() + 240000, departureUtcMs: Date.now() + 245000 },
          { stopId: 'R31', arrivalUtcMs: Date.now() + 700000, departureUtcMs: null },
        ])],
        [_vehicleRow(freeTripId, routeRaw, freeTrainId, 'R41', 'STOPPED_AT')],
        [GROUP]
      );
      rs.reconcile();
      var freeTrip = store.getAllTrips().filter(function (t) { return t.authoritativeId === freeTripId; })[0];
      var freeAssoc = freeTrip ? rs.getTripAssociationByCanonicalId(freeTrip.id) : null;
      results.push(_assert('#8 setup: the free-ride trip is really identity-associated', !!freeAssoc && !!freeAssoc.logicalTrainId, freeAssoc));

      if (freeAssoc && freeAssoc.logicalTrainId) {
        if (!mapLayer.isActive()) { try { mapLayer.activate(); } catch (e) {} }
        results.push(_assert('#8b setup: no itinerary is active (genuinely idle)', ride.getSnapshot().status === 'idle'));
        mapLayer.selectTrain(freeAssoc.logicalTrainId);
        hud.__test.renderNow();
        var rootFreeIdle = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#8c with no itinerary active, selecting a real train offers a plain BOARD TRAIN — never the itinerary-framed "MATCHES YOUR TRIP"',
          rootFreeIdle.textContent.indexOf('BOARD TRAIN') !== -1 && rootFreeIdle.textContent.indexOf('MATCHES YOUR TRIP') === -1, rootFreeIdle.textContent));

        var freeBoardBtn = rootFreeIdle.querySelector('.subway-ride-hud-board-btn--primary');
        results.push(_assert('#8d setup: a real BOARD TRAIN button is present to click', !!freeBoardBtn));
        freeBoardBtn.click();
        var afterFreeBoard = ride.getSnapshot();
        results.push(_assert('#8e clicking BOARD TRAIN with no itinerary active starts a real free ride — idle -> riding with leg:null (an itinerary is never a prerequisite to ride)',
          afterFreeBoard.status === 'riding' && afterFreeBoard.leg === null && afterFreeBoard.selectedLogicalTrainId === freeAssoc.logicalTrainId, afterFreeBoard));

        hud.__test.renderNow();
        var rootFreeRiding = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#8f a free ride shows CURRENT/NEXT', rootFreeRiding.textContent.indexOf('CURRENT') !== -1 && rootFreeRiding.textContent.indexOf('NEXT') !== -1, rootFreeRiding.textContent));
        var freeRowLabels = Array.prototype.map.call(rootFreeRiding.querySelectorAll('.subway-ride-hud-label'), function (el) { return el.textContent; });
        results.push(_assert('#8g a free ride never shows BOARD/TOWARD/EXIT rows — there is no planned destination to show',
          freeRowLabels.indexOf('BOARD') === -1 && freeRowLabels.indexOf('TOWARD') === -1 && freeRowLabels.indexOf('EXIT') === -1, freeRowLabels));

        var freeExitBtn = rootFreeRiding.querySelector('.subway-ride-hud-exit');
        results.push(_assert('#8h EXIT TRAIN is always available while riding, even with no destination declared', !!freeExitBtn && freeExitBtn.textContent.indexOf('EXIT TRAIN') !== -1));
        freeExitBtn.click();
        var afterFreeExit = ride.getSnapshot();
        results.push(_assert('#8i EXIT TRAIN unbinds the train and returns a free ride to idle', afterFreeExit.status === 'idle' && afterFreeExit.selectedLogicalTrainId === null, afterFreeExit));

        mapLayer.clearTrainSelection();
      }

      // ── #9 0821_SUBWAY_Boarding_UX_TrainRideSession — with an itinerary
      // active, a real train on a genuinely different route is clearly
      // explained as a mismatch ("wrong route"), never silently omitted and
      // never silently boardable. Uses getTrainMatchInfo() via the HUD —
      // never independently re-derived here. ──
      ride.__test.resetForTests();
      ride.startLeg('itin-hud-test-3', 'stage-hud-test-3', leg);
      var wrongRouteRaw = 'Q'; // leg is always resolved on the R line in this file — genuinely a different real route
      var wrongTripId = 'hud-test-trip-wrongroute-' + Date.now();
      var wrongTrainId = 'hud-test-train-wrongroute-' + Date.now();
      store.applyRealtimeUpdate(
        [_tripRow(wrongTripId, wrongRouteRaw, wrongTrainId, 'TEST', [
          { stopId: 'R41', arrivalUtcMs: Date.now() + 60000, departureUtcMs: Date.now() + 65000 },
        ])],
        [_vehicleRow(wrongTripId, wrongRouteRaw, wrongTrainId, 'R41', 'STOPPED_AT')],
        [GROUP]
      );
      rs.reconcile();
      var wrongTrip = store.getAllTrips().filter(function (t) { return t.authoritativeId === wrongTripId; })[0];
      var wrongAssoc = wrongTrip ? rs.getTripAssociationByCanonicalId(wrongTrip.id) : null;
      results.push(_assert('#9 setup: the wrong-route trip is really identity-associated', !!wrongAssoc && !!wrongAssoc.logicalTrainId, wrongAssoc));

      if (wrongAssoc && wrongAssoc.logicalTrainId) {
        mapLayer.selectTrain(wrongAssoc.logicalTrainId);
        hud.__test.renderNow();
        var rootWrongRoute = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#9b a real train on the wrong route is clearly explained, never silently omitted or silently boardable',
          rootWrongRoute.textContent.indexOf('wrong route') !== -1, rootWrongRoute.textContent));
        results.push(_assert('#9c no BOARD button renders for a non-matching train', !rootWrongRoute.querySelector('.subway-ride-hud-board-btn--primary')));
        mapLayer.clearTrainSelection();
      }

      // ── #10 0821_SUBWAY_Boarding_UX_TrainRideSession — a real regression
      // found via genuine live end-to-end testing (MUSIC -> LIVE MAP, not a
      // wall-side-only simulation): a real, identity-associated, ROUTE-
      // matching candidate whose own remaining schedule doesn't reach the
      // exit station (directionConfirmed:false) used to render in the LIVE
      // TRAINS list with a plain, clickable BOARD button — clicking it then
      // got rejected by selectTrain()'s own validation, a real "I clicked
      // BOARD and nothing happened" bug. The LIVE TRAINS list is now
      // filtered through getTrainMatchInfo() (never independently
      // re-derived), so it can never again offer a train it will then
      // refuse. Same "backward stopTimes" technique
      // subwayItineraryLegResolver.tests.js's own #13d already uses to
      // produce a genuine directionConfirmed:false trip. ──
      ride.__test.resetForTests();
      ride.startLeg('itin-hud-test-4', 'stage-hud-test-4', leg);
      var backwardTripId = 'hud-test-trip-backward-' + Date.now();
      var backwardTrainId = 'hud-test-train-backward-' + Date.now();
      store.applyRealtimeUpdate(
        [_tripRow(backwardTripId, routeRaw, backwardTrainId, 'TEST', [
          { stopId: 'R31', arrivalUtcMs: Date.now() + 30000, departureUtcMs: Date.now() + 35000 },
          { stopId: 'R41', arrivalUtcMs: Date.now() + 90000, departureUtcMs: null },
        ])],
        [_vehicleRow(backwardTripId, routeRaw, backwardTrainId, 'R41', 'STOPPED_AT')],
        [GROUP]
      );
      rs.reconcile();
      var backwardTrip = store.getAllTrips().filter(function (t) { return t.authoritativeId === backwardTripId; })[0];
      var backwardAssoc = backwardTrip ? rs.getTripAssociationByCanonicalId(backwardTrip.id) : null;
      results.push(_assert('#10 setup: the backward trip is really identity-associated on the CORRECT route', !!backwardAssoc && !!backwardAssoc.logicalTrainId, backwardAssoc));

      if (backwardAssoc && backwardAssoc.logicalTrainId) {
        var backwardMatch = ride.getTrainMatchInfo(backwardAssoc.logicalTrainId);
        results.push(_assert('#10b setup: getTrainMatchInfo() genuinely reports does_not_reach_exit for this trip (the real precondition)', backwardMatch.matches === false && backwardMatch.reason === 'does_not_reach_exit', backwardMatch));

        hud.__test.renderNow();
        var rootBackward = global.document.getElementById('subway-ride-hud');
        var candidateIds = Array.prototype.map.call(rootBackward.querySelectorAll('.subway-ride-hud-candidate[data-train-id]'), function (el) { return el.getAttribute('data-train-id'); });
        results.push(_assert('#10c the LIVE TRAINS list never offers a plain BOARD for a candidate whose real schedule doesn\'t reach the exit',
          candidateIds.indexOf(backwardAssoc.logicalTrainId) === -1, candidateIds));

        mapLayer.selectTrain(backwardAssoc.logicalTrainId);
        hud.__test.renderNow();
        var rootBackwardSelected = global.document.getElementById('subway-ride-hud');
        results.push(_assert('#10d selecting it directly on the map explains the real reason, "does not reach exit" — never silently boardable',
          rootBackwardSelected.textContent.indexOf('does not reach exit') !== -1, rootBackwardSelected.textContent));
        mapLayer.clearTrainSelection();
      }

      // ── #7 lastCommandReason renders a human message, never a raw internal code verbatim as the ONLY text ──
      ride.__test.resetForTests();
      ride.startLeg('itin-hud-test-2', 'stage-hud-test-2', leg);
      ride.__test.simulateCommand({ type: 'selectTrain', logicalTrainId: 'sr-train-does-not-exist-999999', commandId: 'hud-test-bad-select', issuedAt: new Date().toISOString() });
      hud.__test.renderNow();
      var rootBadSelect = global.document.getElementById('subway-ride-hud');
      results.push(_assert('#7 an unknown train selection stays at waiting_to_board (never a silent fake "riding")', ride.getSnapshot().status === 'waiting_to_board'));
      results.push(_assert('#7b the warning is a real, readable sentence, not the bare reason code', rootBadSelect.textContent.indexOf('not_found') === -1 && rootBadSelect.textContent.toLowerCase().indexOf('pick another') !== -1, rootBadSelect.textContent));

      // Cleanup — never leak synthetic data or map-selection state into later runs.
      ride.stopRide();
      mapLayer.clearTrainSelection();
      store.applyRealtimeUpdate([], [], [GROUP]);
      hud.__test.renderNow();

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayItineraryRideHudTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayItineraryRideHudTests] failures:', failed);
      return summary;
    });
  }

  function _ensureVisibleRoot() {
    var el = global.document.getElementById('subway-ride-hud');
    return el || global.document.body; // fall back honestly — a missing root is itself a real failure the #1 assertion above will catch via a truthy check upstream
  }

  SBE.SubwayItineraryRideHudTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayItineraryRideHudTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
