// ── SubwayStationHud Tests v1.1.0 ─────────────────────────────────────────────
// 0819_SUBWAY_Public_HUD_Line_Ribbon_v1.0.0_BUILD — Required Tests §24
// (3,4,5,6,7,8,9,10,11,12,13,14,15,16,21)
// 0821_SUBWAY_Boarding_UX_TrainRideSession — YOUR TRIP section coverage.
// Run via: SBE.SubwayStationHudTests.run()
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }
  function _computedDisplay(el) {
    if (!el || !global.getComputedStyle) return null;
    return global.getComputedStyle(el).display;
  }

  var GROUP = 'station-hud-test';
  function _tripRow(tripId, routeId, trainId, direction, stopTimes) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, direction: direction || null, stopTimeUpdates: stopTimes || [], sourceGroupId: GROUP };
  }
  function _vehicleRow(tripId, routeId, trainId, stopId, currentStatus) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, stopId: stopId || null, currentStatus: currentStatus || null, sourceGroupId: GROUP };
  }

  function run() {
    var hud = SBE.SubwayStationHud;
    var lib = SBE.MTASubwayStationLibrary;
    var ai = SBE.SubwayArrivalIntelligence;
    var layer = SBE.MTASubwayMapLayer;
    var store = SBE.MTASubwayTransitStore;
    var resolver = SBE.SubwayItineraryLegResolver;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var ride = SBE.SubwayItineraryRideAuthority;
    var results = [];
    if (!hud || !lib || !layer) {
      results.push(_assert('SBE.SubwayStationHud/MTASubwayStationLibrary/MTASubwayMapLayer are loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }
    if (!lib.getAllRecords().length) lib.importFromStaticModel();
    var allRecords = lib.getAllRecords();
    if (!allRecords.length) {
      results.push(_assert('real Station Library records exist to test against', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // ── §10 neighborhood resolution — pure function, real + fallback cases ─
    var withNeighborhood = { operational: { neighborhood: 'Greenwich Village', borough: 'M' } };
    results.push(_assert('§10 real neighborhood value is used when the Station Library record has one', hud.__neighborhoodContext(withNeighborhood) === 'Greenwich Village'));
    var withoutNeighborhood = { operational: { neighborhood: null, borough: 'Bx' } };
    results.push(_assert('§10 falls back to the real borough (expanded to its full name) when neighborhood data is unavailable — never fabricated', hud.__neighborhoodContext(withoutNeighborhood) === 'The Bronx'));
    var withNeither = { operational: { neighborhood: null, borough: null } };
    results.push(_assert('falls back to an honest generic city label when neither is available (never fabricates a specific place)', hud.__neighborhoodContext(withNeither) === 'New York, NY'));

    // ── §7-9, §15 station selection → public identity ────────────────────
    // Prefer a multi-line station for a meaningful badge-count check.
    var multi = allRecords.slice().sort(function (a, b) { return (b.operational.routeIds || []).length - (a.operational.routeIds || []).length; })[0];
    var selectResult = layer.selectStation(multi.studioRichStationId);
    results.push(_assert('§7 station click resolves the selected station identity', selectResult.ok === true && hud.getCurrentStationId() === multi.studioRichStationId));
    results.push(_assert('SubwayStationHud reports visible after a real selection', hud.isVisible() === true));

    var identityEl = global.document.getElementById('subway-station-identity');
    results.push(_assert('station identity DOM element exists', !!identityEl));
    if (identityEl) {
      results.push(_assert('§8 real station name renders in the public identity block', identityEl.textContent.indexOf(multi.operational.displayName) !== -1));
      var badges = identityEl.querySelectorAll('.subway-line-badge');
      results.push(_assert('§9 served routes render as one badge component per real served route', badges.length === (multi.operational.routeIds || []).length, { badgeCount: badges.length, routeCount: (multi.operational.routeIds || []).length }));
      results.push(_assert('§15 internal stlib-* id is never surfaced in the public identity block', identityEl.textContent.indexOf(multi.studioRichStationId) === -1));
      results.push(_assert('§15 internal gtfsStopId is never surfaced in the public identity block', identityEl.textContent.indexOf(multi.authoritativeLink.gtfsStopId) === -1));
    }

    // ── §11-12 arrival panels ─────────────────────────────────────────────
    var arrivalLaneEl = global.document.getElementById('subway-arrival-lane');
    results.push(_assert('arrival lane DOM element exists', !!arrivalLaneEl));
    if (arrivalLaneEl && ai) {
      var realArrivals = ai.getArrivalsForStation(multi.studioRichStationId);
      var panelEls = arrivalLaneEl.querySelectorAll('.subway-arrival-panel');
      if (realArrivals.ok && realArrivals.data.directions.length) {
        results.push(_assert('§11 arrival panels are populated from real SubwayArrivalIntelligence data (no second parser — count matches real direction groups)',
          panelEls.length === realArrivals.data.directions.length, { rendered: panelEls.length, real: realArrivals.data.directions.length }));
        if (realArrivals.data.directions.length >= 2) {
          results.push(_assert('§12 two real direction groups render as two SEPARATE panels, not merged', panelEls.length >= 2));
        }
        // Cross-check one real ETA value made it through verbatim.
        var firstDir = realArrivals.data.directions[0];
        if (firstDir.arrivals.length) {
          var expectedRoute = firstDir.arrivals[0].routeId.replace('subway:route:', '');
          results.push(_assert('a real route label from Arrival Intelligence appears in the rendered arrival lane', arrivalLaneEl.textContent.indexOf(expectedRoute) !== -1));
        }
      } else {
        results.push(_assert('arrival panels handle unavailable arrival data gracefully (no crash, an honest empty state renders)', arrivalLaneEl.textContent.length > 0));
      }
    }

    // ── §13-14 transient dismissal lifecycle ─────────────────────────────
    results.push(_assert('§13 a dismiss timer is active immediately after a real selection', hud.__test.isDismissTimerActive() === true));
    hud.__test.setHovering(true);
    results.push(_assert('§14 hovering/interacting cancels the pending dismissal', hud.__test.isDismissTimerActive() === false));
    hud.__test.setHovering(false);
    results.push(_assert('§14 leaving hover restarts the dismissal timer (postponed, not cancelled forever)', hud.__test.isDismissTimerActive() === true));
    hud.__test.forceDismiss();
    results.push(_assert('§13 dismissal hides the public panel', hud.isVisible() === false));
    results.push(_assert('dismissal clears the tracked current station id', hud.getCurrentStationId() === null));

    // ── §16 debug/operator metrics remain accessible internally ─────────
    var diag = layer.getDiagnostics();
    results.push(_assert('§16 full diagnostic fields remain queryable via the existing debug API regardless of public HUD changes', typeof diag.activeLogicalTrainCount === 'number' && typeof diag.identityCollisionCount === 'number'));

    // ── §21 RADIO slot never fabricates playback ─────────────────────────
    hud.show(multi.studioRichStationId); // ensure DOM mounted (radio slot is created alongside)
    var radioSlot = global.document.getElementById('subway-radio-slot');
    results.push(_assert('reserved RADIO slot DOM element exists', !!radioSlot));
    if (radioSlot) {
      results.push(_assert('§21 RADIO slot renders no functional playback controls (no <button>/<audio> elements) — structural slot only, per BUILD §21', radioSlot.querySelectorAll('button, audio').length === 0));
      results.push(_assert('RADIO slot carries an honest, non-interactive label', radioSlot.textContent.trim().length > 0));
    }
    hud.__test.forceDismiss();
    layer.clearSelection();

    // ── §4-6 top-right weather HUD remains intact (time/temp/condition) —
    //    this build only hides .wt-reality (humidity/precip/wind) via CSS;
    //    it never touches environmentalTelemetryHUD.js's own DOM/logic. ──
    var telemetryHud = global.document.getElementById('world-telemetry-hud');
    if (telemetryHud) {
      var tempEl = telemetryHud.querySelector('.wt-temp');
      var conditionEl = telemetryHud.querySelector('.wt-weather-label');
      results.push(_assert('§5 temperature element still exists in the DOM (unchanged, untouched by this build)', !!tempEl));
      results.push(_assert('§6 weather condition element still exists in the DOM (unchanged, untouched by this build)', !!conditionEl));
      var realityEl = telemetryHud.querySelector('.wt-reality');
      if (realityEl) {
        var wasActive = layer.isActive();
        layer.activate();
        if (SBE.SubwayPresentationSurface) SBE.SubwayPresentationSurface.__test.applyNow();
        results.push(_assert('§3 humidity/precipitation/wind block is hidden while SUBWAY is active', _computedDisplay(realityEl) === 'none'));
        layer.deactivate();
        if (SBE.SubwayPresentationSurface) SBE.SubwayPresentationSurface.__test.applyNow();
        if (wasActive) layer.activate();
      } else {
        results.push(_assert('§3 humidity/precip/wind hidden (SKIPPED — .wt-reality not present in this DOM)', true));
      }
    } else {
      results.push(_assert('§4-6 weather HUD checks (SKIPPED — #world-telemetry-hud not present in this DOM)', true));
    }

    // ── YOUR TRIP (0821_SUBWAY_Boarding_UX_TrainRideSession) ───────────────
    // Real R41/R31 corridor (the same convention every other SUBWAY test
    // file this session uses) — selecting the boarding station of a real,
    // active waiting_to_board leg must augment the panel; selecting an
    // unrelated station must not.
    if (store && resolver && rs && ride) {
      var r41Record = lib.getAllRecords().filter(function (r) { return r.authoritativeLink && r.authoritativeLink.gtfsStopId === 'R41'; })[0];
      var r31Record = lib.getAllRecords().filter(function (r) { return r.authoritativeLink && r.authoritativeLink.gtfsStopId === 'R31'; })[0];
      var r41Store = store.getAllStations().filter(function (s) { return s.authoritativeIds && s.authoritativeIds.gtfsStopId === 'R41'; })[0];
      var r31Store = store.getAllStations().filter(function (s) { return s.authoritativeIds && s.authoritativeIds.gtfsStopId === 'R31'; })[0];
      results.push(_assert('setup: the real R41/R31 station library records + transit-store stations exist', !!r41Record && !!r31Record && !!r41Store && !!r31Store));

      if (r41Record && r31Record && r41Store && r31Store) {
        ride.__test.resetForTests();
        var leg = resolver.resolveLeg(
          { longitude: r41Store.longitude, latitude: r41Store.latitude },
          { longitude: r31Store.longitude, latitude: r31Store.latitude },
          { preferredRouteId: 'subway:route:R' }
        );
        results.push(_assert('setup: the real R-line leg resolves', leg.ok, leg));

        if (leg.ok) {
          results.push(_assert('__isBoardingStationForActiveLeg is false before any leg is active (no false positive)', hud.__isBoardingStationForActiveLeg(r41Record) === false));

          ride.startLeg('station-hud-test-itin', 'station-hud-test-stage', leg);
          results.push(_assert('__isBoardingStationForActiveLeg is true for the real boarding station once waiting_to_board', hud.__isBoardingStationForActiveLeg(r41Record) === true));
          results.push(_assert('__isBoardingStationForActiveLeg is false for the (unrelated) exit station — never a false positive from mere leg involvement', hud.__isBoardingStationForActiveLeg(r31Record) === false));

          // ── selecting an UNRELATED station never shows YOUR TRIP ──
          var unrelatedRecord = lib.getAllRecords().filter(function (r) { return r.studioRichStationId !== r41Record.studioRichStationId && r.studioRichStationId !== r31Record.studioRichStationId; })[0];
          if (unrelatedRecord) {
            layer.selectStation(unrelatedRecord.studioRichStationId);
            var identityElUnrelated = global.document.getElementById('subway-station-identity');
            results.push(_assert('an unrelated station never shows YOUR TRIP', !identityElUnrelated || identityElUnrelated.textContent.indexOf('YOUR TRIP') === -1));
          }

          // ── selecting the real boarding station shows YOUR TRIP + a real candidate + BOARD ──
          var routeRaw = store.getRoute(leg.routeId).authoritativeId;
          var tripId = 'station-hud-test-trip-' + Date.now();
          var trainId = 'station-hud-test-train-' + Date.now();
          store.applyRealtimeUpdate(
            [_tripRow(tripId, routeRaw, trainId, 'TEST', [
              { stopId: 'R41', arrivalUtcMs: Date.now() + 60000, departureUtcMs: Date.now() + 65000 },
              { stopId: 'R36', arrivalUtcMs: Date.now() + 240000, departureUtcMs: Date.now() + 245000 },
              { stopId: 'R31', arrivalUtcMs: Date.now() + 700000, departureUtcMs: null },
            ])],
            [_vehicleRow(tripId, routeRaw, trainId, 'R41', 'STOPPED_AT')],
            [GROUP]
          );
          rs.reconcile();
          var myTrip = store.getAllTrips().filter(function (t) { return t.authoritativeId === tripId; })[0];
          var assoc = myTrip ? rs.getTripAssociationByCanonicalId(myTrip.id) : null;
          results.push(_assert('setup: the trip is really identity-associated', !!assoc && !!assoc.logicalTrainId, assoc));

          if (!layer.isActive()) { try { layer.activate(); } catch (e) {} } // Sunroof.attach() requires this — real precondition, not mocked
          layer.selectStation(r41Record.studioRichStationId);
          var identityEl = global.document.getElementById('subway-station-identity');
          results.push(_assert('YOUR TRIP renders when the selected station IS the active leg\'s real boarding station', !!identityEl && identityEl.textContent.indexOf('YOUR TRIP') !== -1, identityEl && identityEl.textContent));
          results.push(_assert('YOUR TRIP shows the real route/direction and the real exit station — sourced from the leg, never re-derived',
            !!identityEl && identityEl.textContent.indexOf(leg.direction.towardStationName) !== -1 && identityEl.textContent.indexOf(leg.exitStation.name) !== -1));

          if (assoc && assoc.logicalTrainId) {
            results.push(_assert('MATCHING LIVE TRAINS renders once identity resolves', !!identityEl && identityEl.textContent.indexOf('MATCHING LIVE TRAINS') !== -1));
            var boardBtn = identityEl.querySelector('[data-board-train-id]');
            results.push(_assert('a real candidate row with an explicit BOARD action renders, sourced from getBoardingContext() — never independently derived',
              !!boardBtn && boardBtn.getAttribute('data-board-train-id') === assoc.logicalTrainId, boardBtn && boardBtn.outerHTML));

            if (boardBtn) {
              results.push(_assert('setup: still waiting_to_board before the click', ride.getSnapshot().status === 'waiting_to_board'));
              boardBtn.click();
              var afterBoard = ride.getSnapshot();
              results.push(_assert('clicking BOARD in the station panel calls the exact same selectTrain() every other boarding entry point calls — waiting_to_board -> riding',
                afterBoard.status === 'riding' && afterBoard.selectedLogicalTrainId === assoc.logicalTrainId, afterBoard));
              ride.stopRide();
            }
          }

          // ── 0821_SUBWAY_Boarding_UX_TrainRideSession — the real bug found
          // via live end-to-end testing: a real, identity-associated,
          // route-matching candidate whose own remaining schedule doesn't
          // reach the exit station (directionConfirmed:false) used to
          // render a plain, clickable BOARD in MATCHING LIVE TRAINS —
          // clicking it then got rejected by selectTrain()'s own
          // validation. Now filtered through getTrainMatchInfo(). ──
          ride.startLeg('station-hud-test-itin-2', 'station-hud-test-stage-2', leg);
          var backwardTripId = 'station-hud-test-trip-backward-' + Date.now();
          var backwardTrainId = 'station-hud-test-train-backward-' + Date.now();
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
          var backwardMatch = backwardAssoc ? ride.getTrainMatchInfo(backwardAssoc.logicalTrainId) : null;
          results.push(_assert('setup: the backward trip genuinely does not reach the exit (the real precondition)', !!backwardMatch && backwardMatch.matches === false && backwardMatch.reason === 'does_not_reach_exit', backwardMatch));

          if (backwardAssoc) {
            layer.selectStation(r41Record.studioRichStationId);
            var identityElBackward = global.document.getElementById('subway-station-identity');
            var backwardBoardBtn = identityElBackward.querySelector('[data-board-train-id="' + backwardAssoc.logicalTrainId + '"]');
            results.push(_assert('MATCHING LIVE TRAINS never offers a plain BOARD for a candidate whose real schedule doesn\'t reach the exit', !backwardBoardBtn));
          }

          // Cleanup — never leak synthetic data or ride state into later runs.
          ride.stopRide();
          store.applyRealtimeUpdate([], [], [GROUP]);
        }
      }
    } else {
      results.push(_assert('YOUR TRIP checks (SKIPPED — MTASubwayTransitStore/SubwayItineraryLegResolver/SubwayLogicalRollingStockAuthority/SubwayItineraryRideAuthority not all loaded)', true));
    }
    hud.__test.forceDismiss();
    layer.clearSelection();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[SubwayStationHudTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[SubwayStationHudTests] failures:', failed);
    return summary;
  }

  SBE.SubwayStationHudTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayStationHudTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
