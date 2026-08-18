// ── SubwayLogicalRollingStockAuthority Tests v1.0.0 ───────────────────────────
// 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD — Required Tests §36 (1-23)
// Status: active | Classification: test-harness
//
// Run via: _wos.debug.subwayLogicalRollingStockTests.runTests()
//
// Uses REAL committed static GTFS data (stations/routes/shapes — a local
// snapshot read, no live network needed) combined with SYNTHETIC realtime
// trip/vehicle rows injected directly into MTASubwayTransitStore via its own
// real applyRealtimeUpdate() path — this exercises the exact same
// buildTripRef/buildVehicleRef → store → reconcile() pipeline production
// code uses, while keeping test scenarios (trip disappearance, staleness,
// reassociation) fully deterministic and independent of what's actually
// live on the MTA feed at test-run time.
//
// Test categories #24-27 (existing Live Data / Station Library / Full Live
// Map tests, RACETRACK regression) are NOT reimplemented here — they are
// proven by re-running their own existing test entry points live (see the
// completion report's Automated Test Results section).
//
// Placement: wall/systems/transit/subwayLogicalRollingStockAuthority.tests.js
// Load: AFTER subwayLogicalRollingStockAuthority.js and MTASubwayTransitStore.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var GROUP = 'test';

  function _tripRow(tripId, routeId, trainId, direction, stopTimes) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, direction: direction || null, stopTimeUpdates: stopTimes || [], sourceGroupId: GROUP };
  }
  function _vehicleRow(tripId, routeId, trainId, stopId, currentStatus, currentStopSequence, timestampUtcMs) {
    return { tripId: tripId, routeId: routeId, trainId: trainId || null, stopId: stopId, currentStatus: currentStatus, currentStopSequence: currentStopSequence || null, timestampUtcMs: timestampUtcMs, sourceGroupId: GROUP };
  }

  function _dist(a, b) { var dLat = a[0] - b[0], dLon = a[1] - b[1]; return Math.sqrt(dLat * dLat + dLon * dLon); }
  function _nearestIdx(points, station) {
    var best = -1, bestD = Infinity;
    for (var i = 0; i < points.length; i++) { var d = _dist(points[i], [station.latitude, station.longitude]); if (d < bestD) { bestD = d; best = i; } }
    return bestD <= 0.01 ? best : null;
  }

  // Discovers a REAL pair of stations genuinely adjacent on a REAL route
  // shape (from the committed static snapshot) — used to exercise
  // inferred-segment interpolation against real canonical geometry rather
  // than a fabricated one. Deterministic given the checked-in snapshot.
  function _findRealAdjacentPair(store) {
    var routes = store.getAllRoutes();
    var bestCandidate = null, bestGap = Infinity;
    for (var r = 0; r < routes.length; r++) {
      var route = routes[r];
      if (!route.shapeIds || !route.shapeIds.length) continue;
      for (var s = 0; s < route.shapeIds.length; s++) {
        var points = store.getShapePoints(route.shapeIds[s]);
        if (!points || points.length < 10) continue;
        var stations = store.getAllStations().filter(function (st) { return st.kind === 'station' && st.routeIds.indexOf(route.id) !== -1; });
        var indexed = stations.map(function (st) { return { st: st, idx: _nearestIdx(points, st) }; }).filter(function (x) { return x.idx != null; });
        indexed.sort(function (a, b) { return a.idx - b.idx; });
        for (var i = 0; i < indexed.length - 1; i++) {
          var gap = indexed[i + 1].idx - indexed[i].idx;
          if (gap >= 2 && gap < bestGap) {
            bestGap = gap;
            bestCandidate = { route: route, shapeId: route.shapeIds[s], points: points, prevStation: indexed[i].st, nextStation: indexed[i + 1].st, prevIdx: indexed[i].idx, nextIdx: indexed[i + 1].idx };
          }
        }
      }
    }
    return bestCandidate;
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var results = [];
    if (!store || !rs) {
      results.push(_assert('SBE.MTASubwayTransitStore/SubwayLogicalRollingStockAuthority are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      rs.__resetForTests();
      var T0 = 1755500000000; // fixed reference instant — deterministic aging math, no real Date.now() dependency

      // ── Pick two REAL routes for continuity/pool-isolation scenarios ────
      var routeA = store.getAllRoutes().filter(function (r) { return r.id === 'subway:route:A'; })[0] || store.getAllRoutes()[0];
      var routeOther = store.getAllRoutes().filter(function (r) { return r.id !== routeA.id; })[0];
      var anyStation = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0];
      var anyStopId = anyStation.authoritativeIds.gtfsStopId;

      // ── #6 default 10-car fallback + #1-4 id uniqueness/ordering ────────
      store.applyRealtimeUpdate(
        [_tripRow('T1', routeA.authoritativeId, 'TR-100', 'N', [])],
        [_vehicleRow('T1', routeA.authoritativeId, 'TR-100', anyStopId, 'STOPPED_AT', 1, T0)],
        [GROUP]
      );
      rs.reconcile({ now: T0 });

      var assoc1 = rs.getTripAssociation('T1');
      results.push(_assert('#8 trip association resolves via canonical trip/route ids, not raw strings',
        !!assoc1 && assoc1.tripId === 'subway:trip:T1' && assoc1.routeId === routeA.id));
      var train1 = rs.getLogicalTrain(assoc1.logicalTrainId);
      results.push(_assert('#1 logical train id matches sr-train-###### and is not the MTA trip id',
        !!train1 && /^sr-train-\d{6}$/.test(train1.id) && train1.id !== 'T1' && train1.id !== 'subway:trip:T1'));
      var consist1 = rs.getLogicalConsist(train1.consistId);
      results.push(_assert('#2 logical consist id matches sr-consist-######', !!consist1 && /^sr-consist-\d{6}$/.test(consist1.id)));
      results.push(_assert('#6 default logical car count falls back to 10 with no route-specific rule', consist1.configuredCarCount === 10, consist1.configuredCarCount));
      var cars1 = rs.getLogicalCarsForConsist(consist1.id);
      results.push(_assert('#3 every logical car id matches sr-car-###### and all are unique within the consist',
        cars1.length === 10 && new Set(cars1.map(function (c) { return c.id; })).size === 10 &&
        cars1.every(function (c) { return /^sr-car-\d{6}$/.test(c.id); })));
      results.push(_assert('#4 logical car ordering is deterministic (slotIndex 0..N-1 contiguous, ascending)',
        cars1.every(function (c, i) { return c.slotIndex === i; })));

      // ── #5 configurable car-count behavior ───────────────────────────────
      rs.__setCarCountRuleForTests('subway:route:TESTROUTE', 4);
      store.applyRealtimeUpdate(
        [_tripRow('T1', routeA.authoritativeId, 'TR-100', 'N', []), _tripRow('T2', 'TESTROUTE', 'TR-200', 'N', [])],
        [_vehicleRow('T1', routeA.authoritativeId, 'TR-100', anyStopId, 'STOPPED_AT', 1, T0), _vehicleRow('T2', 'TESTROUTE', 'TR-200', anyStopId, 'STOPPED_AT', 1, T0)],
        [GROUP]
      );
      rs.reconcile({ now: T0 });
      var assoc2 = rs.getTripAssociation('T2');
      var train2 = rs.getLogicalTrain(assoc2.logicalTrainId);
      var consist2 = rs.getLogicalConsist(train2.consistId);
      results.push(_assert('#5 configured car count honors a route-specific override', consist2.configuredCarCount === 4, consist2.configuredCarCount));
      rs.__clearCarCountRulesForTests();

      // ── #7 route-family continuity + pool isolation ──────────────────────
      var routeAFamily = routeA.routeFamily;
      results.push(_assert('#7 logical train routeFamily matches its real route\'s routeFamily', train1.routeFamily === routeAFamily, [train1.routeFamily, routeAFamily]));
      results.push(_assert('#7 route pools are isolated — route A\'s pool never contains a TESTROUTE train', rs.getTrainsForRoute(routeA.id).every(function (t) { return t.routeId === routeA.id; })));

      // ── #13 observed stop state ──────────────────────────────────────────
      var stoppedStation = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0];
      store.applyRealtimeUpdate(
        [_tripRow('T3', routeA.authoritativeId, 'TR-300', 'N', [])],
        [_vehicleRow('T3', routeA.authoritativeId, 'TR-300', stoppedStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0)],
        [GROUP]
      );
      rs.reconcile({ now: T0 });
      var assoc3 = rs.getTripAssociation('T3');
      var pos3 = rs.getPositionState(assoc3.logicalTrainId);
      results.push(_assert('#13 observed_stop position matches the real reported station\'s real coordinate',
        pos3.truthState === 'observed_stop' && pos3.position && pos3.position[0] === stoppedStation.longitude && pos3.position[1] === stoppedStation.latitude));

      // ── #17 unknown state (TripUpdate present, no VehiclePosition at all) ─
      store.applyRealtimeUpdate([_tripRow('T4', routeA.authoritativeId, 'TR-400', 'N', [])], [], [GROUP]);
      // Re-apply T1/T3's vehicles too since applyRealtimeUpdate replaces the whole 'test' group each call.
      rs.reconcile({ now: T0 });
      var assoc4 = rs.getTripAssociation('T4');
      var pos4 = rs.getPositionState(assoc4.logicalTrainId);
      results.push(_assert('#17 no VehiclePosition evidence at all yields truthState unknown with no fabricated position', pos4.truthState === 'unknown' && pos4.position === null));

      // ── #14/#15/#18 inferred_segment against REAL canonical geometry ────
      var pair = _findRealAdjacentPair(store);
      results.push(_assert('a real adjacent station pair was discovered on a real route shape for interpolation testing', !!pair));
      if (pair) {
        var prevGtfs = pair.prevStation.authoritativeIds.gtfsStopId, nextGtfs = pair.nextStation.authoritativeIds.gtfsStopId;
        var depMs = T0 - 30000, arrMs = T0 + 30000;
        store.applyRealtimeUpdate(
          [_tripRow('T5', pair.route.authoritativeId, 'TR-500', 'N', [
            { stopId: prevGtfs, arrivalUtcMs: depMs - 10000, departureUtcMs: depMs },
            { stopId: nextGtfs, arrivalUtcMs: arrMs, departureUtcMs: arrMs + 10000 },
          ])],
          [_vehicleRow('T5', pair.route.authoritativeId, 'TR-500', nextGtfs, 'IN_TRANSIT_TO', 2, T0)],
          [GROUP]
        );
        rs.reconcile({ now: T0 });
        var assoc5 = rs.getTripAssociation('T5');
        var pos5 = rs.getPositionState(assoc5.logicalTrainId);
        results.push(_assert('#14 sufficient prior/next-stop + timing evidence yields truthState inferred_segment',
          pos5.truthState === 'inferred_segment', pos5 && pos5.truthState));
        results.push(_assert('#14 inferred progress lands near the real timing midpoint (~0.5)',
          pos5.progress != null && Math.abs(pos5.progress - 0.5) < 0.05, pos5.progress));
        results.push(_assert('#14 inferred position never claims gps / physical accuracy',
          pos5.source === 'inferred_from_canonical_geometry' && pos5.source !== 'gps'));

        // #15/#18 — the returned position must fall exactly on the real
        // shape's polyline: recompute the expected point independently from
        // the same real shape data + returned progress, and require exact
        // (floating-point-tolerant) agreement, plus bounding-box containment.
        var lo = Math.min(pair.prevIdx, pair.nextIdx), hi = Math.max(pair.prevIdx, pair.nextIdx);
        var contIdx = (pair.prevIdx <= pair.nextIdx) ? (lo + pos5.progress * (hi - lo)) : (hi - pos5.progress * (hi - lo));
        var i0 = Math.max(0, Math.min(pair.points.length - 1, Math.floor(contIdx)));
        var i1 = Math.max(0, Math.min(pair.points.length - 1, i0 + (contIdx >= i0 ? 1 : -1)));
        var t = Math.abs(contIdx - i0);
        var p0 = pair.points[i0], p1 = pair.points[i1];
        var expectedLat = p0[0] + (p1[0] - p0[0]) * t, expectedLon = p0[1] + (p1[1] - p0[1]) * t;
        results.push(_assert('#18 returned position exactly matches independent recomputation against the same real shape geometry',
          pos5.position && Math.abs(pos5.position[0] - expectedLon) < 1e-9 && Math.abs(pos5.position[1] - expectedLat) < 1e-9));

        var segLats = [p0[0], p1[0]].concat(pair.points.slice(Math.min(pair.prevIdx, pair.nextIdx), Math.max(pair.prevIdx, pair.nextIdx) + 1).map(function (p) { return p[0]; }));
        var segLons = [p0[1], p1[1]].concat(pair.points.slice(Math.min(pair.prevIdx, pair.nextIdx), Math.max(pair.prevIdx, pair.nextIdx) + 1).map(function (p) { return p[1]; }));
        var minLat = Math.min.apply(null, segLats), maxLat = Math.max.apply(null, segLats);
        var minLon = Math.min.apply(null, segLons), maxLon = Math.max.apply(null, segLons);
        results.push(_assert('#15 interpolated position is clamped within the real segment\'s bounding box (never leaves canonical geometry)',
          pos5.position[1] >= minLat && pos5.position[1] <= maxLat && pos5.position[0] >= minLon && pos5.position[0] <= maxLon));

        // ── #16 stale inference stopping — same trip, same (unchanged)
        //    vehicle observation, much later reconcile — evidence has aged
        //    past STALE_AFTER_MS even though the trip is still "present". ──
        rs.reconcile({ now: T0 + 200000 });
        var pos5Later = rs.getPositionState(assoc5.logicalTrainId);
        results.push(_assert('#16 stale evidence stops inferred motion (truthState becomes stale, not a fresher fabricated position)',
          pos5Later.truthState === 'stale' && pos5Later.stale === true));
      }

      // ── #19 duplicate station names cannot alter joins — the real Fulton
      //    St collision (subway:stop:229 Manhattan vs subway:stop:G36
      //    Brooklyn). Proven purely through canonical-id-based position
      //    resolution, never a display-name lookup anywhere in this file. ──
      var fultonManhattan = store.getStation('subway:stop:229');
      var fultonBrooklyn = store.getStation('subway:stop:G36');
      results.push(_assert('both real Fulton St stations exist in the committed static snapshot (collision fixture available)', !!fultonManhattan && !!fultonBrooklyn));
      if (fultonManhattan && fultonBrooklyn) {
        var gRoute = store.getAllRoutes().filter(function (r) { return r.id === 'subway:route:G'; })[0];
        store.applyRealtimeUpdate(
          [_tripRow('T6', routeA.authoritativeId, 'TR-600', 'N', []), _tripRow('T7', gRoute ? gRoute.authoritativeId : 'G', 'TR-700', 'N', [])],
          [
            _vehicleRow('T6', routeA.authoritativeId, 'TR-600', fultonManhattan.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0),
            _vehicleRow('T7', gRoute ? gRoute.authoritativeId : 'G', 'TR-700', fultonBrooklyn.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0),
          ],
          [GROUP]
        );
        rs.reconcile({ now: T0 });
        var assoc6 = rs.getTripAssociation('T6'), assoc7 = rs.getTripAssociation('T7');
        var pos6 = rs.getPositionState(assoc6.logicalTrainId), pos7 = rs.getPositionState(assoc7.logicalTrainId);
        results.push(_assert('#19 the two same-named "Fulton St" stations resolve to their own distinct, correct real coordinates (no name-based cross-talk)',
          pos6.position[0] === fultonManhattan.longitude && pos6.position[1] === fultonManhattan.latitude &&
          pos7.position[0] === fultonBrooklyn.longitude && pos7.position[1] === fultonBrooklyn.latitude &&
          (pos6.position[0] !== pos7.position[0] || pos6.position[1] !== pos7.position[1])));
      }

      // ── #9/#10/#11/#12 lifecycle + reassociation chain (isolated scenario) ─
      rs.__resetForTests();
      var routeX = routeA, routeY = routeOther;
      store.applyRealtimeUpdate(
        [_tripRow('L1', routeX.authoritativeId, 'TRAIN-L', 'N', [])],
        [_vehicleRow('L1', routeX.authoritativeId, 'TRAIN-L', anyStopId, 'STOPPED_AT', 1, T0)],
        [GROUP]
      );
      rs.reconcile({ now: T0 });
      var lAssoc = rs.getTripAssociation('L1');
      var lTrainId = lAssoc.logicalTrainId;

      // Trip vanishes (empty feed for this group) — reconcile at +30s: within grace.
      store.applyRealtimeUpdate([], [], [GROUP]);
      rs.reconcile({ now: T0 + 30000 });
      var lAssocMissing = rs.getTripAssociation('L1');
      results.push(_assert('#9 a trip missing for one cycle (well under the grace threshold) becomes temporarily_missing, not deleted',
        lAssocMissing.lifecycleState === 'temporarily_missing' && !!rs.getLogicalTrain(lTrainId)));

      // Still absent far past ENDED_AFTER_MS (300000ms) — reconcile at +400s.
      rs.reconcile({ now: T0 + 400000 });
      var lAssocEnded = rs.getTripAssociation('L1');
      var lTrainEnded = rs.getLogicalTrain(lTrainId);
      results.push(_assert('#10 a trip absent past the ended threshold transitions to ended, and the logical train record is preserved (not deleted)',
        lAssocEnded.lifecycleState === 'ended' && !!lTrainEnded && lTrainEnded.activeTripId === null));
      results.push(_assert('#10 the ended train\'s consist/cars are still intact (never deleted)',
        !!rs.getLogicalConsist(lTrainEnded.consistId) && rs.getLogicalCarsForConsist(lTrainEnded.consistId).length === 10));

      // A new trip on the SAME route with the SAME MTA trainId reappears —
      // reassociation must reuse the idle train, same-route-pool only.
      store.applyRealtimeUpdate(
        [_tripRow('L2', routeX.authoritativeId, 'TRAIN-L', 'N', [])],
        [_vehicleRow('L2', routeX.authoritativeId, 'TRAIN-L', anyStopId, 'STOPPED_AT', 1, T0 + 401000)],
        [GROUP]
      );
      rs.reconcile({ now: T0 + 401000 });
      var lAssoc2 = rs.getTripAssociation('L2');
      results.push(_assert('#11 logical train reuse: a reappearing trip with a matching MTA train_id in the same route pool reuses the SAME logical train id',
        lAssoc2.logicalTrainId === lTrainId && lAssoc2.reason === 'mta_train_id_match', [lAssoc2.logicalTrainId, lTrainId, lAssoc2.reason]));

      // A DIFFERENT route's trip reusing the SAME MTA train_id must NEVER
      // reuse routeX's idle train — cross-route reassignment protection.
      // (End L2 first so routeX's train is idle again.)
      store.applyRealtimeUpdate([], [], [GROUP]);
      rs.reconcile({ now: T0 + 401000 + 400000 });
      store.applyRealtimeUpdate(
        [_tripRow('L3', routeY.authoritativeId, 'TRAIN-L', 'N', [])],
        [_vehicleRow('L3', routeY.authoritativeId, 'TRAIN-L', anyStopId, 'STOPPED_AT', 1, T0 + 801000)],
        [GROUP]
      );
      rs.reconcile({ now: T0 + 801000 });
      var lAssoc3 = rs.getTripAssociation('L3');
      results.push(_assert('#12 cross-route reassignment protection: a matching MTA train_id on a DIFFERENT route never reuses another route\'s logical train',
        lAssoc3.logicalTrainId !== lTrainId && lAssoc3.reason === 'new_logical_train', [lAssoc3.logicalTrainId, lTrainId, lAssoc3.reason]));
      var lTrain3 = rs.getLogicalTrain(lAssoc3.logicalTrainId);
      results.push(_assert('#12 the newly created cross-route train carries the requesting trip\'s OWN routeId, never the other route\'s',
        lTrain3.routeId === routeY.id));

      // ── #20/#21 polling-cycle continuity — car ids never regenerate ─────
      var carsBefore = rs.getLogicalCarsForConsist(lTrain3.consistId).map(function (c) { return c.id; });
      store.applyRealtimeUpdate(
        [_tripRow('L3', routeY.authoritativeId, 'TRAIN-L', 'N', [])],
        [_vehicleRow('L3', routeY.authoritativeId, 'TRAIN-L', anyStopId, 'STOPPED_AT', 1, T0 + 831000)],
        [GROUP]
      );
      rs.reconcile({ now: T0 + 831000 });
      var lAssoc3Again = rs.getTripAssociation('L3');
      var carsAfter = rs.getLogicalCarsForConsist(lTrain3.consistId).map(function (c) { return c.id; });
      results.push(_assert('#20 the same trip across consecutive polling cycles keeps the identical logical train id (continuity)',
        lAssoc3Again.logicalTrainId === lAssoc3.logicalTrainId));
      results.push(_assert('#21 logical car ids do not regenerate across polling cycles', JSON.stringify(carsBefore) === JSON.stringify(carsAfter), [carsBefore, carsAfter]));

      // ── #22 palette switch does not mutate rolling-stock identity ───────
      var pa = SBE.MTASubwayPaletteAuthority;
      var feat = SBE.MTASubwayMapFeatures;
      if (pa && feat) {
        var beforePalette = pa.getActivePaletteId();
        var beforeSnapshot = JSON.stringify({ t: rs.getLogicalTrain(lTrain3.id), c: rs.getLogicalCarsForConsist(lTrain3.consistId).map(function (c) { return c.id; }) });
        var colorBefore = feat.buildLogicalTrainFeatures().features.filter(function (f) { return f.id === lTrain3.id; })[0];
        pa.setActivePalette(beforePalette === 'fashion_subway' ? 'mta_reference' : 'fashion_subway');
        var colorAfter = feat.buildLogicalTrainFeatures().features.filter(function (f) { return f.id === lTrain3.id; })[0];
        var afterSnapshot = JSON.stringify({ t: rs.getLogicalTrain(lTrain3.id), c: rs.getLogicalCarsForConsist(lTrain3.consistId).map(function (c) { return c.id; }) });
        pa.setActivePalette(beforePalette);
        results.push(_assert('#22 palette switch changes only the resolved display color, never train/car identity',
          beforeSnapshot === afterSnapshot && colorBefore && colorAfter && colorBefore.properties.logicalTrainId === colorAfter.properties.logicalTrainId));
      }

      // ── #23 full-network scaling — multiple distinct + overlapping-family
      //    real routes, simultaneous active trains, zero collisions. NOTE:
      //    the live page (?mode=subway) has its own real MTA polling running
      //    concurrently (SBE.MTASubwayPollingRuntime, groups tagged 'ace' /
      //    'bdfm' / etc — not this file's 'test' group), so
      //    reconcile()/getDiagnostics() legitimately reflect BOTH this
      //    fixture's synthetic trains AND whatever is really active on the
      //    network right now — exactly as production is supposed to behave.
      //    Assertions below therefore check MY tagged fixture trains
      //    specifically (by their distinctive TR-MULTI-* trainId), never a
      //    bare global count. ──────────────────────────────────────────────
      rs.__resetForTests();
      var multiRoutes = store.getAllRoutes().filter(function (r) { return ['subway:route:A', 'subway:route:C', 'subway:route:1', 'subway:route:G'].indexOf(r.id) !== -1; });
      if (multiRoutes.length >= 3) {
        var tripRows = [], vehicleRows = [];
        multiRoutes.forEach(function (route, i) {
          for (var n = 0; n < 3; n++) {
            var tid = 'MULTI-' + route.authoritativeId + '-' + n;
            tripRows.push(_tripRow(tid, route.authoritativeId, 'TR-MULTI-' + route.authoritativeId + '-' + n, 'N', []));
            vehicleRows.push(_vehicleRow(tid, route.authoritativeId, 'TR-MULTI-' + route.authoritativeId + '-' + n, anyStopId, 'STOPPED_AT', 1, T0));
          }
        });
        store.applyRealtimeUpdate(tripRows, vehicleRows, [GROUP]);
        rs.reconcile({ now: T0 });
        var diag = rs.getDiagnostics();
        var myTrains = rs.getAllLogicalTrains().filter(function (t) { return (t.lastKnownMtaTrainId || '').indexOf('TR-MULTI-') === 0; });
        results.push(_assert('#23 full-network: every simultaneous real route (numeric + lettered, overlapping color family A/C) produced its own fixture trains',
          myTrains.length === multiRoutes.length * 3, myTrains.length));
        results.push(_assert('#23 full-network: each route\'s pool contains only that route\'s own trains (A and C never cross despite sharing a color family)',
          rs.getTrainsForRoute('subway:route:A').every(function (t) { return t.routeId === 'subway:route:A'; }) &&
          rs.getTrainsForRoute('subway:route:C').every(function (t) { return t.routeId === 'subway:route:C'; })));
        results.push(_assert('#23 full-network: zero identity collisions across the whole run (fixture + concurrently-live real network trains)',
          diag.logicalTrainIdentityCollisionCount === 0 && diag.logicalCarIdentityCollisionCount === 0,
          [diag.logicalTrainIdentityCollisionCount, diag.logicalCarIdentityCollisionCount]));
      } else {
        results.push(_assert('#23 full-network scaling fixture (A/C/1/G routes) available in the committed static snapshot', false, multiRoutes.map(function (r) { return r.id; })));
      }

      rs.__resetForTests();
      store.applyRealtimeUpdate([], [], [GROUP]);

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayLogicalRollingStockAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayLogicalRollingStockAuthorityTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayLogicalRollingStockAuthorityTests = { run: run };
  // main.js's DOMContentLoaded handler replaces window._wos wholesale and
  // only restores top-level keys not already present — nested _wos.debug.*
  // entries registered before that point are silently dropped. Same
  // deferred-registration fix used throughout SUBWAY's other *.tests.js files.
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayLogicalRollingStockTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
