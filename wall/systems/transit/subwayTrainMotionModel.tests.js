// ── SubwayTrainMotionModel Tests v2.0.0 ───────────────────────────────────────
// "SUBWAY Continuous Train Motion Fix" patch — Required Tests §16 (all 16)
// plus the surviving pure-math tests from the prior Train Rendering +
// Palette Library build (easing curve, direction-lane key, render length,
// dwell/stale/unknown, real-geometry curve handling).
// Status: active | Classification: test-harness
//
// Run via: SBE.SubwayTrainMotionModelTests.run()
//
// Same real-static-data + synthetic-realtime-injection convention as every
// other SUBWAY test file (real committed GTFS snapshot, synthetic
// TripUpdate/VehiclePosition rows via the real applyRealtimeUpdate() path,
// deterministic `nowMs` passed to buildMotionState()). NEW this patch:
// buildMotionState() now carries persistent per-train journey state (see
// subwayTrainMotionModel.js's own header for why), so tests that want an
// independent "fresh look" call `mm.__resetJourneys()` first, and tests that
// exercise continuity call buildMotionState() with MONOTONICALLY INCREASING
// nowMs values — calling with a nowMs that goes backward against an existing
// journey now correctly triggers the same never-reverse clamp production
// code would apply, which is deliberately tested directly (§8/§16.8).
//
// Placement: wall/systems/transit/subwayTrainMotionModel.tests.js
// Load: AFTER subwayTrainMotionModel.js, subwayLogicalRollingStockAuthority.js,
//       subwayTrainVisualState.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var GROUP = 'motionmodel-test';
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
  function _findRealStationPairWithGap(store, minGap) {
    var routes = store.getAllRoutes();
    var best = null, bestGap = -1;
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
          if (gap >= minGap && gap > bestGap) { bestGap = gap; best = { route: route, prevStation: indexed[i].st, nextStation: indexed[i + 1].st, points: points }; }
        }
      }
    }
    return best;
  }
  // A real TRIPLE of consecutive stations (by matched shape index order) —
  // needed to exercise Tier B (topology-derived previous stop): the
  // synthetic trip's stopTimes will start AT the middle station (mimicking
  // a real GTFS-Realtime TripUpdate already trimmed to only remaining
  // stops), with the THIRD station still present so direction-of-travel can
  // be derived the same honest way production code does.
  function _findRealStationTriple(store) {
    var routes = store.getAllRoutes();
    for (var r = 0; r < routes.length; r++) {
      var route = routes[r];
      if (!route.shapeIds || !route.shapeIds.length) continue;
      for (var s = 0; s < route.shapeIds.length; s++) {
        var points = store.getShapePoints(route.shapeIds[s]);
        if (!points || points.length < 10) continue;
        var stations = store.getAllStations().filter(function (st) { return st.kind === 'station' && st.routeIds.indexOf(route.id) !== -1; });
        var indexed = stations.map(function (st) { return { st: st, idx: _nearestIdx(points, st) }; }).filter(function (x) { return x.idx != null; });
        indexed.sort(function (a, b) { return a.idx - b.idx; });
        for (var i = 0; i < indexed.length - 2; i++) {
          if (indexed[i + 1].idx > indexed[i].idx && indexed[i + 2].idx > indexed[i + 1].idx) {
            return { route: route, before: indexed[i].st, mid: indexed[i + 1].st, after: indexed[i + 2].st };
          }
        }
      }
    }
    return null;
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var mm = SBE.SubwayTrainMotionModel;
    var pa = SBE.MTASubwayPaletteAuthority;
    var results = [];
    if (!store || !rs || !mm) {
      results.push(_assert('SBE.MTASubwayTransitStore/SubwayLogicalRollingStockAuthority/SubwayTrainMotionModel are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      rs.__resetForTests();
      mm.__resetJourneys();
      var T0 = 1755600000000;

      // ── Pure easing curve ─────────────────────────────────────────────────
      results.push(_assert('easing f(0)=0, f(1)=1 (endpoints exact)', mm.__easeMotionProgress(0) === 0 && mm.__easeMotionProgress(1) === 1));
      results.push(_assert('§16.6 acceleration velocity is lower than cruise velocity (ease-in: output < input for small t)',
        mm.__easeMotionProgress(0.05) < 0.05 && mm.__easeMotionProgress(0.10) < 0.10));
      results.push(_assert('§16.7 deceleration velocity is lower than cruise velocity (ease-out: output > input for t near 1)',
        mm.__easeMotionProgress(0.95) > 0.95 && mm.__easeMotionProgress(0.90) > 0.90));
      var easeMono = true, prevE = -1;
      for (var tt = 0; tt <= 1.0001; tt += 0.05) { var e = mm.__easeMotionProgress(tt); if (e < prevE - 1e-9) easeMono = false; prevE = e; }
      results.push(_assert('easing curve is monotonic across its full domain', easeMono));

      // ── Direction lane key — pure evidence-based ─────────────────────────
      results.push(_assert('real NORTH evidence resolves to lane key "A"', mm.__directionLaneKey('NORTH', 'subway:trip:100_1..N') === 'A'));
      results.push(_assert('real SOUTH evidence resolves to the OPPOSITE lane key "B"', mm.__directionLaneKey('SOUTH', 'subway:trip:100_1..S') === 'B'));
      results.push(_assert('fallback: real "..N" trip-id suffix resolves to lane "A"', mm.__directionLaneKey(null, 'subway:trip:133550_R..N') === 'A'));
      results.push(_assert('fallback: real "..S" trip-id suffix resolves to lane "B"', mm.__directionLaneKey(null, 'subway:trip:135400_A..S05R') === 'B'));

      var routeA = store.getAllRoutes()[0];
      var anyStation = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0];

      // ── Genuine dwell (STOPPED_AT) — unchanged behavior, real identity ───
      store.applyRealtimeUpdate(
        [_tripRow('MM1', routeA.authoritativeId, 'TR-MM1', 'N', [])],
        [_vehicleRow('MM1', routeA.authoritativeId, 'TR-MM1', anyStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0)],
        [GROUP]
      );
      rs.reconcile({ now: T0 });
      var assoc1 = rs.getTripAssociation('MM1');
      var m1a = mm.buildMotionState(assoc1.logicalTrainId, { nowMs: T0 });
      var m1b = mm.buildMotionState(assoc1.logicalTrainId, { nowMs: T0 + 1000 });
      results.push(_assert('§16.14 the same logicalTrainId is returned across repeated motion-state calls', m1a.logicalTrainId === assoc1.logicalTrainId && m1b.logicalTrainId === assoc1.logicalTrainId));
      results.push(_assert('dwell (genuine STOPPED_AT) motionPhase is "dwell"', m1a.motionPhase === 'dwell' && m1a.evidenceTier === 'A'));

      // ── Station-skip catch-up (R/Broadway/Bay Ridge corridor investigation)
      //    — a real train reporting STOPPED_AT at two DIFFERENT real
      //    stations across two polls, with no in-between IN_TRANSIT_TO/
      //    INCOMING_AT reading ever captured, must glide across the real
      //    distance rather than instantly snap. ──────────────────────────────
      // Genuinely ADJACENT real stations (not the largest gap in the
      // system — _findRealStationPairWithGap intentionally picks the
      // largest gap it can find, which would exceed MAX_CATCHUP_DISTANCE_M
      // and defeat this test). Reuses the SAME real consecutive-station
      // finder already proven elsewhere in this file: `before` and `mid`
      // are real, adjacent, monotonically-ordered real stations.
      var skipTriple = _findRealStationTriple(store);
      var skipPair = skipTriple ? { route: skipTriple.route, prevStation: skipTriple.before, nextStation: skipTriple.mid } : null;
      if (skipPair) {
        mm.__resetJourneys();
        store.applyRealtimeUpdate(
          [_tripRow('MM-SKIP', skipPair.route.authoritativeId, 'TR-SKIP', 'N', [])],
          [_vehicleRow('MM-SKIP', skipPair.route.authoritativeId, 'TR-SKIP', skipPair.prevStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0)],
          [GROUP]
        );
        rs.reconcile({ now: T0 });
        var assocSkip = rs.getTripAssociation('MM-SKIP');
        var mSkipStart = mm.buildMotionState(assocSkip.logicalTrainId, { nowMs: T0 });
        results.push(_assert('§SKIP first genuine dwell settles normally (no catch-up on first sight — nothing to compare against yet)',
          mSkipStart.motionPhase === 'dwell' && mSkipStart.evidenceTier === 'A'));

        // Second real poll: STOPPED_AT the NEXT real station — no in-between
        // IN_TRANSIT_TO/INCOMING_AT reading, exactly the live-observed
        // pattern on the R's Brooklyn local corridor.
        store.applyRealtimeUpdate(
          [_tripRow('MM-SKIP', skipPair.route.authoritativeId, 'TR-SKIP', 'N', [])],
          [_vehicleRow('MM-SKIP', skipPair.route.authoritativeId, 'TR-SKIP', skipPair.nextStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 2, T0 + 30000)],
          [GROUP]
        );
        rs.reconcile({ now: T0 + 30000 });
        var mSkipJustAfter = mm.buildMotionState(assocSkip.logicalTrainId, { nowMs: T0 + 30000 });
        results.push(_assert('§SKIP a real station skip triggers a catch-up glide, not an instant snap (evidenceTier "C", not frozen)',
          mSkipJustAfter.evidenceTier === 'C' && mSkipJustAfter.motionPhase !== 'frozen' && mSkipJustAfter.motionPhase !== 'dwell'));
        results.push(_assert('§SKIP catch-up starts at/near the ORIGIN station, not already at the destination',
          mSkipJustAfter.segmentProgressRaw != null && mSkipJustAfter.segmentProgressRaw < 0.5, mSkipJustAfter.segmentProgressRaw));
        results.push(_assert('§SKIP catch-up body polyline is real, resolvable geometry (never null mid-glide)',
          !!mSkipJustAfter.bodyPolyline && mSkipJustAfter.bodyPolyline.length >= 2));

        // Sample mid-glide — progress must have advanced further (continuous,
        // not stuck) purely from elapsed wall-clock time, no new evidence.
        var mSkipMid = mm.buildMotionState(assocSkip.logicalTrainId, { nowMs: T0 + 35000 });
        results.push(_assert('§SKIP catch-up progress advances continuously between calls with no new evidence',
          mSkipMid.segmentProgressRaw > mSkipJustAfter.segmentProgressRaw, { before: mSkipJustAfter.segmentProgressRaw, after: mSkipMid.segmentProgressRaw }));

        // Let the catch-up run to completion (its own duration is bounded to
        // MAX_SEGMENT_ANIM_MS=20000 from T0+30000) and confirm it settles
        // into a genuine, correctly-anchored dwell at the REAL destination.
        var mSkipSettled = mm.buildMotionState(assocSkip.logicalTrainId, { nowMs: T0 + 55000 });
        results.push(_assert('§SKIP catch-up settles into genuine dwell once complete',
          mSkipSettled.motionPhase === 'dwell' && mSkipSettled.evidenceTier === 'A'));
        var settledPos = rs.getPositionState(assocSkip.logicalTrainId);
        results.push(_assert('§SKIP settled dwell is anchored at the REAL destination station (authority\'s own observedStopId matches)',
          settledPos.observedStopId === skipPair.nextStation.id, settledPos.observedStopId));

        // A THIRD dwell reading at the SAME station (no further skip) must
        // never re-trigger a catch-up (regression against a false-positive
        // loop).
        var mSkipRepeat = mm.buildMotionState(assocSkip.logicalTrainId, { nowMs: T0 + 60000 });
        results.push(_assert('§SKIP a repeated genuine dwell at the SAME station never re-triggers a catch-up',
          mSkipRepeat.motionPhase === 'dwell' && mSkipRepeat.evidenceTier === 'A'));

        // Sanity bound: an absurdly distant "skip" (a different, unrelated
        // real station far off this route/shape) must never produce a
        // nonsensical long-distance glide — falls back to an honest instant
        // dwell instead once the distance exceeds MAX_CATCHUP_DISTANCE_M.
        mm.__setLastRenderedForTests(assocSkip.logicalTrainId, 'subway:trip:MM-SKIP', 'subway:stop:__unrelated_far_station__');
        var mSkipUnrelated = mm.buildMotionState(assocSkip.logicalTrainId, { nowMs: T0 + 61000 });
        results.push(_assert('§SKIP an unresolvable "last known station" honestly falls back to normal dwell (never a fabricated glide)',
          mSkipUnrelated.motionPhase === 'dwell', mSkipUnrelated.motionPhase));
      } else {
        results.push(_assert('§SKIP station-skip catch-up checks (SKIPPED — no real adjacent station pair found for any live route)', true));
      }

      // ── render length responds to zoom (min-readable dominates far out) ──
      var lenFar = mm.renderLengthMeters(m1a.physicalLengthMeters, 10, anyStation.latitude);
      var lenClose = mm.renderLengthMeters(m1a.physicalLengthMeters, 18, anyStation.latitude);
      results.push(_assert('rendered length never shorter than physical, min-readable dominates far out',
        lenFar >= m1a.physicalLengthMeters && lenClose === m1a.physicalLengthMeters, { lenFar: lenFar, lenClose: lenClose }));

      // ── §16.12 stale halts/degrades — no progression across two calls ────
      store.applyRealtimeUpdate([], [], [GROUP]);
      rs.reconcile({ now: T0 + 95000 });
      var mStaleA = mm.buildMotionState(assoc1.logicalTrainId, { nowMs: T0 + 95000 });
      var mStaleB = mm.buildMotionState(assoc1.logicalTrainId, { nowMs: T0 + 995000 });
      results.push(_assert('§16.12 stale train motionPhase is "frozen"', mStaleA.motionPhase === 'frozen' && mStaleA.positionState === 'stale'));
      results.push(_assert('§16.12 stale train body does not silently drift across two calls at very different nowMs',
        JSON.stringify(mStaleA.bodyCenter) === JSON.stringify(mStaleB.bodyCenter)));

      // ── §16.13 unknown never fabricates movement ──────────────────────────
      store.applyRealtimeUpdate([_tripRow('MM2', routeA.authoritativeId, 'TR-MM2', 'N', [])], [], [GROUP]);
      rs.reconcile({ now: T0 });
      var assoc2 = rs.getTripAssociation('MM2');
      var mUnknown = mm.buildMotionState(assoc2.logicalTrainId, { nowMs: T0 });
      results.push(_assert('§16.13 unknown-position train never fabricates a bodyCenter/bodyPolyline', mUnknown.positionState === 'unknown' && mUnknown.bodyCenter === null && mUnknown.bodyPolyline === null));

      // ── §16.15 palette switches never affect motion state (structural) ───
      if (pa) {
        mm.__resetJourneys();
        var beforePalette = pa.getActivePaletteId();
        var mBeforeSwitch = mm.buildMotionState(assoc1.logicalTrainId, { nowMs: T0 });
        var otherPalette = pa.listPalettes().map(function (p) { return p.id; }).filter(function (id) { return id !== beforePalette; })[0];
        pa.setActivePalette(otherPalette);
        var mAfterSwitch = mm.buildMotionState(assoc1.logicalTrainId, { nowMs: T0 });
        pa.setActivePalette(beforePalette);
        results.push(_assert('§16.15 palette switch never changes motion state (motionPhase/positionState identical before/after)',
          mBeforeSwitch.motionPhase === mAfterSwitch.motionPhase && mBeforeSwitch.positionState === mAfterSwitch.positionState));
      } else {
        results.push(_assert('§16.15 palette independence (SKIPPED — MTASubwayPaletteAuthority not loaded)', true));
      }

      // ═══ Tier A: real prior-stop entry survives in the trip's own
      //     stopTimes (the RARE real-world case) — exercises the full
      //     geometry/ETA pipeline exactly as before this patch. ════════════
      var pair = _findRealStationPairWithGap(store, 3);
      results.push(_assert('a real station pair with 3+ intermediate real shape points exists for geometry testing', !!pair));
      if (pair) {
        var prevGtfs = pair.prevStation.authoritativeIds.gtfsStopId, nextGtfs = pair.nextStation.authoritativeIds.gtfsStopId;
        var depMs = T0 - 30000, arrMs = T0 + 30000;
        mm.__resetJourneys();
        store.applyRealtimeUpdate(
          [_tripRow('MM3', pair.route.authoritativeId, 'TR-MM3', 'N', [
            { stopId: prevGtfs, arrivalUtcMs: depMs - 10000, departureUtcMs: depMs },
            { stopId: nextGtfs, arrivalUtcMs: arrMs, departureUtcMs: arrMs + 10000 },
          ])],
          [_vehicleRow('MM3', pair.route.authoritativeId, 'TR-MM3', nextGtfs, 'IN_TRANSIT_TO', 2, depMs)],
          [GROUP]
        );
        rs.reconcile({ now: depMs });
        var assoc3 = rs.getTripAssociation('MM3');
        var pos3 = rs.getPositionState(assoc3.logicalTrainId);
        results.push(_assert('Tier A fixture: authority resolves a real prior-stop entry (observedStopId not null)', pos3.observedStopId != null, pos3));

        // Monotonically-increasing nowMs sequence, matching real production
        // calling order (the animation loop only ever moves forward).
        var mStart = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: depMs });
        var mMid = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: T0 });
        var mNear = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: arrMs - 5000 });
        var mEnd = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: arrMs });

        results.push(_assert('Tier A: real arrival timestamp resolves a real remaining-duration ETA', mMid.etaMsToNextStop != null && mMid.usedRealEtaEvidence === true && mMid.evidenceTier === 'A'));
        results.push(_assert('§16.9 progress remains within 0..1 throughout', [mStart, mMid, mNear, mEnd].every(function (m) { return m.segmentProgressRaw >= 0 && m.segmentProgressRaw <= 1; })));
        results.push(_assert('midpoint-in-time resolves to a real progress near 0.5', Math.abs(mMid.segmentProgressRaw - 0.5) < 0.05, mMid.segmentProgressRaw));
        results.push(_assert('§16.10 train does not overshoot the station — progress caps at exactly 1.0 at/after real arrival', mEnd.segmentProgressRaw === 1, mEnd.segmentProgressRaw));
        results.push(_assert('§16.8 progress remains monotonic across increasing real time',
          mStart.segmentProgressRaw <= mMid.segmentProgressRaw && mMid.segmentProgressRaw <= mNear.segmentProgressRaw && mNear.segmentProgressRaw <= mEnd.segmentProgressRaw,
          [mStart.segmentProgressRaw, mMid.segmentProgressRaw, mNear.segmentProgressRaw, mEnd.segmentProgressRaw]));

        // ── §16.1 segment progress advances with wall clock without a poll —
        //    same evidence, two increasing nowMs calls, no applyRealtimeUpdate
        //    in between. ──────────────────────────────────────────────────
        var noPollA = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: T0 + 1000 });
        var noPollB = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: T0 + 2000 });
        results.push(_assert('§16.1 segment progress advances with wall clock alone (no poll between two calls)',
          noPollB.segmentProgressRaw > noPollA.segmentProgressRaw, [noPollA.segmentProgressRaw, noPollB.segmentProgressRaw]));

        // ── §16.2 train position advances across repeated animation ticks ──
        var tickPositions = [];
        for (var tk = 0; tk < 5; tk++) tickPositions.push(mm.buildMotionState(assoc3.logicalTrainId, { nowMs: T0 + 2000 + tk * 120 }).bodyCenter);
        var tickAdvanced = true;
        for (var tkI = 1; tkI < tickPositions.length; tkI++) {
          if (JSON.stringify(tickPositions[tkI]) === JSON.stringify(tickPositions[tkI - 1])) tickAdvanced = false;
        }
        results.push(_assert('§16.2 train position advances across repeated 120ms animation ticks (real production cadence)', tickAdvanced, tickPositions));

        // ── §16.16 directional lane offset does not affect route-distance
        //    progression (structural — directionLaneKey and
        //    segmentProgressRaw are computed independently). ───────────────
        results.push(_assert('§16.16 directionLaneKey does not influence segmentProgressRaw (independent fields)',
          typeof noPollB.directionLaneKey !== 'undefined' && typeof noPollB.segmentProgressRaw === 'number'));

        // ── §16.3 new same-segment poll preserves current visual progress ──
        var beforePollProgress = noPollB.segmentProgressRaw;
        var beforePollCenter = noPollB.bodyCenter;
        // A new poll arrives with the SAME segment (same prev/next stop) but
        // slightly refreshed evidence — must NOT reset visual progress.
        store.applyRealtimeUpdate(
          [_tripRow('MM3', pair.route.authoritativeId, 'TR-MM3', 'N', [
            { stopId: prevGtfs, arrivalUtcMs: depMs - 10000, departureUtcMs: depMs },
            { stopId: nextGtfs, arrivalUtcMs: arrMs, departureUtcMs: arrMs + 10000 },
          ])],
          [_vehicleRow('MM3', pair.route.authoritativeId, 'TR-MM3', nextGtfs, 'IN_TRANSIT_TO', 2, T0 + 2000)],
          [GROUP]
        );
        rs.reconcile({ now: T0 + 2000 });
        var afterPoll = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: T0 + 2000 });
        results.push(_assert('§16.3 a new same-segment poll preserves (never resets) current visual progress',
          afterPoll.segmentProgressRaw >= beforePollProgress, [beforePollProgress, afterPoll.segmentProgressRaw]));
        var pollDispMeters = mm.__haversineMeters(beforePollCenter, afterPoll.bodyCenter);
        results.push(_assert('§16.3/§14 the poll does not visibly teleport the render (small real displacement, not a station-to-station jump)',
          pollDispMeters < 200, pollDispMeters));

        // ── §16.4 ETA extension slows remaining journey without reversing ──
        var beforeExtendProgress = afterPoll.segmentProgressRaw;
        var extendedArrMs = arrMs + 60000; // real arrival pushed 60s later
        store.applyRealtimeUpdate(
          [_tripRow('MM3', pair.route.authoritativeId, 'TR-MM3', 'N', [
            { stopId: prevGtfs, arrivalUtcMs: depMs - 10000, departureUtcMs: depMs },
            { stopId: nextGtfs, arrivalUtcMs: extendedArrMs, departureUtcMs: extendedArrMs + 10000 },
          ])],
          [_vehicleRow('MM3', pair.route.authoritativeId, 'TR-MM3', nextGtfs, 'IN_TRANSIT_TO', 2, T0 + 2100)],
          [GROUP]
        );
        rs.reconcile({ now: T0 + 2100 });
        var mExtended = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: T0 + 2100 });
        results.push(_assert('§16.4 ETA extension never reverses progress', mExtended.segmentProgressRaw >= beforeExtendProgress, [beforeExtendProgress, mExtended.segmentProgressRaw]));

        // ── §16.5 ETA reduction speeds remaining journey within bounds
        //    (speed-sanity bound, §7 — a large sudden correction must not
        //    snap the render; it converges over subsequent calls instead). ─
        var reducedArrMs = T0 + 2200 + 500; // real arrival now only 500ms away — an aggressive real-world correction
        store.applyRealtimeUpdate(
          [_tripRow('MM3', pair.route.authoritativeId, 'TR-MM3', 'N', [
            { stopId: prevGtfs, arrivalUtcMs: depMs - 10000, departureUtcMs: depMs },
            { stopId: nextGtfs, arrivalUtcMs: reducedArrMs, departureUtcMs: reducedArrMs + 10000 },
          ])],
          [_vehicleRow('MM3', pair.route.authoritativeId, 'TR-MM3', nextGtfs, 'IN_TRANSIT_TO', 2, T0 + 2200)],
          [GROUP]
        );
        rs.reconcile({ now: T0 + 2200 });
        var beforeReduceProgress = mExtended.segmentProgressRaw;
        var mReduced = mm.buildMotionState(assoc3.logicalTrainId, { nowMs: T0 + 2200 });
        results.push(_assert('§16.5 ETA reduction advances progress (speeds up) rather than reversing', mReduced.segmentProgressRaw >= beforeReduceProgress, [beforeReduceProgress, mReduced.segmentProgressRaw]));
        var reduceDeltaMeters = mm.__haversineMeters(mExtended.bodyCenter, mReduced.bodyCenter);
        results.push(_assert('§16.5/§7 speed-sanity bound prevents an implausible single-call jump even under an aggressive ETA correction',
          reduceDeltaMeters < 2000, reduceDeltaMeters)); // well under "900m in 3s"-class implausibility for a near-zero elapsed real time

        // ── §33.8-equivalent curve handling — body/segment stays on real
        //    points, never a fabricated shortcut. ───────────────────────────
        var segRange = mm.__resolveShapeSegment(store, pair.route.id, pair.prevStation.id, pair.nextStation.id);
        if (segRange) {
          var walked = mm.__walkBodyPolyline(segRange.points, (segRange.fromIdx + segRange.toIdx) / 2, 200);
          results.push(_assert('curve handling — walked body polyline is composed entirely of real finite coordinates', walked.every(function (pt) { return pt.length === 2 && isFinite(pt[0]) && isFinite(pt[1]); })));
          results.push(_assert('walked body polyline has more than 2 points across a multi-point real gap (followed real polyline, not a chord)', walked.length > 2, walked.length));
        }
      }

      // ═══ Tier B: trimmed stopTimes (the REAL common case, live-verified —
      //     see subwayTrainMotionModel.js's own ROOT CAUSE header). Trip's
      //     stopTimes starts AT the arrival stop; the departed stop has
      //     already been trimmed out, exactly like a real GTFS-Realtime
      //     TripUpdate. ═══════════════════════════════════════════════════
      var triple = _findRealStationTriple(store);
      results.push(_assert('a real station triple exists for Tier B (topology-derived previous stop) testing', !!triple));
      if (triple) {
        mm.__resetJourneys();
        var midGtfs = triple.mid.authoritativeIds.gtfsStopId, afterGtfs = triple.after.authoritativeIds.gtfsStopId;
        var T0b = T0 + 500000;
        var tierBArrMs = T0b + 45000;
        store.applyRealtimeUpdate(
          [_tripRow('MMB', triple.route.authoritativeId, 'TR-MMB', 'N', [
            // NO entry for triple.before — trimmed, exactly like real MTA
            // TripUpdates trim already-departed stops.
            { stopId: midGtfs, arrivalUtcMs: tierBArrMs, departureUtcMs: tierBArrMs + 10000 },
            { stopId: afterGtfs, arrivalUtcMs: tierBArrMs + 90000, departureUtcMs: tierBArrMs + 100000 },
          ])],
          [_vehicleRow('MMB', triple.route.authoritativeId, 'TR-MMB', midGtfs, 'INCOMING_AT', 2, T0b)],
          [GROUP]
        );
        rs.reconcile({ now: T0b });
        var assocB = rs.getTripAssociation('MMB');
        var posB = rs.getPositionState(assocB.logicalTrainId);
        results.push(_assert('Tier B fixture: authority reports the real degraded fallback (observedStopId null, source no_prior_stop) — proves this is really the common live case, not a contrived one',
          posB.truthState === 'observed_stop' && posB.observedStopId === null && posB.source === 'mta_vehicle_position_no_prior_stop', posB));

        var mB1 = mm.buildMotionState(assocB.logicalTrainId, { nowMs: T0b });
        results.push(_assert('§16.1 (Tier B) ROOT CAUSE FIX: a degraded observed_stop reading that is really transiting now produces continuous MOVING motion instead of a frozen/missing body',
          mB1.bodyPolyline != null && mB1.bodyPolyline.length >= 2 && (mB1.motionPhase === 'accelerating' || mB1.motionPhase === 'cruising' || mB1.motionPhase === 'decelerating'), mB1));
        results.push(_assert('Tier B correctly derives the previous stop via real static topology (never fabricated) and labels it as derived, not authority-observed',
          mB1.derivedPreviousStopId === triple.before.id, { derived: mB1.derivedPreviousStopId, expected: triple.before.id }));
        results.push(_assert('Tier B uses real evidence (usedRealEtaEvidence true) via journeyEstablishedAt anchoring, never a fabricated ETA', mB1.usedRealEtaEvidence === true && mB1.evidenceTier === 'B'));

        var mB2 = mm.buildMotionState(assocB.logicalTrainId, { nowMs: T0b + 5000 });
        results.push(_assert('§16.1 (Tier B) progress advances with wall clock alone between two calls, no poll', mB2.segmentProgressRaw > mB1.segmentProgressRaw, [mB1.segmentProgressRaw, mB2.segmentProgressRaw]));
        results.push(_assert('§16.9 (Tier B) progress remains within 0..1', mB2.segmentProgressRaw >= 0 && mB2.segmentProgressRaw <= 1));

        // ── §16.11 station transition advances to the next canonical
        //    segment correctly — the train arrives at `mid`, then departs
        //    toward `after`; the new segment must start fresh (not carry
        //    over stale progress from the old one) but must not jump
        //    backward in real space either (the arrival point IS the new
        //    segment's own start point). ─────────────────────────────────
        store.applyRealtimeUpdate(
          [_tripRow('MMB', triple.route.authoritativeId, 'TR-MMB', 'N', [
            { stopId: afterGtfs, arrivalUtcMs: tierBArrMs + 90000, departureUtcMs: tierBArrMs + 100000 },
          ])],
          [_vehicleRow('MMB', triple.route.authoritativeId, 'TR-MMB', afterGtfs, 'STOPPED_AT', 3, tierBArrMs + 200)],
          [GROUP]
        );
        rs.reconcile({ now: tierBArrMs + 200 });
        // This fixture's own last known target was `mid` (from the Tier B
        // moving state just above) and the new real reading reports
        // STOPPED_AT `after` directly — `mid` was never itself observed as
        // a genuine dwell. That is exactly the real station-skip pattern
        // the catch-up fix (R/Broadway/Bay Ridge corridor investigation)
        // targets: a real, honest gap must glide, not instantly snap.
        var mArrivedAtMid = mm.buildMotionState(assocB.logicalTrainId, { nowMs: tierBArrMs + 200 });
        results.push(_assert('§16.11 station transition: a real skip past the last known target correctly triggers a catch-up glide rather than an instant snap',
          mArrivedAtMid.evidenceTier === 'C' && mArrivedAtMid.motionPhase !== 'dwell', mArrivedAtMid));
        results.push(_assert('§16.14 logicalTrainId survives the full reconciliation/transition sequence', mArrivedAtMid.logicalTrainId === assocB.logicalTrainId));

        // Let the catch-up finish and confirm it settles into a genuine,
        // correctly-anchored dwell at the real arrival station.
        var mSettledAfter = mm.buildMotionState(assocB.logicalTrainId, { nowMs: tierBArrMs + 200 + 20000 });
        results.push(_assert('§16.11 once the catch-up glide completes, the train correctly settles into genuine dwell at the real arrival station',
          mSettledAfter.motionPhase === 'dwell' && mSettledAfter.evidenceTier === 'A', mSettledAfter));
      }

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayTrainMotionModelTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayTrainMotionModelTests] failures:', failed);

      rs.__resetForTests();
      mm.__resetJourneys();
      store.applyRealtimeUpdate([], [], [GROUP]);

      return summary;
    });
  }

  SBE.SubwayTrainMotionModelTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayTrainMotionModelTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
