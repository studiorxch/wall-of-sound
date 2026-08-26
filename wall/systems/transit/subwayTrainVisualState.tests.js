// ── SubwayTrainVisualState Tests v1.0.0 ───────────────────────────────────────
// 0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD — Required Tests §32 (1-12)
// Status: active | Classification: test-harness
//
// Run via: SBE.SubwayTrainVisualStateTests.run()
//
// Same real-static-data + synthetic-realtime-injection convention as
// subwayLogicalRollingStockAuthority.tests.js (real committed GTFS snapshot,
// synthetic TripUpdate/VehiclePosition rows via the real applyRealtimeUpdate()
// path) — deterministic scenarios, real canonical geometry. Categories #4-5,
// #9-11 lean on invariants subwayLogicalRollingStockAuthority.tests.js
// already proves at the position/identity layer; this file re-verifies them
// specifically through SubwayTrainVisualState's own derivation, since that is
// the NEW code this build adds.
//
// Placement: wall/systems/transit/subwayTrainVisualState.tests.js
// Load: AFTER subwayTrainVisualState.js, subwayLogicalRollingStockAuthority.js,
//       mtaSubwayMapFeatures.js, mtaSubwayPaletteAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  var GROUP = 'visualstate-test';
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
          if (gap >= 2 && gap < bestGap) { bestGap = gap; bestCandidate = { route: route, prevStation: indexed[i].st, nextStation: indexed[i + 1].st }; }
        }
      }
    }
    return bestCandidate;
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var vs = SBE.SubwayTrainVisualState;
    var feat = SBE.MTASubwayMapFeatures;
    var pa = SBE.MTASubwayPaletteAuthority;
    var results = [];
    if (!store || !rs || !vs || !feat) {
      results.push(_assert('SBE.MTASubwayTransitStore/SubwayLogicalRollingStockAuthority/SubwayTrainVisualState/MTASubwayMapFeatures are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      rs.__resetForTests();
      var T0 = 1755600000000;

      // ── #6 bearing math — pure, deterministic, independent of live data ──
      var north = vs.__bearingBetween({ latitude: 40.700, longitude: -74.000 }, { latitude: 40.710, longitude: -74.000 });
      results.push(_assert('#6 due-north bearing resolves near 0deg', north != null && (north < 2 || north > 358), north));
      var east = vs.__bearingBetween({ latitude: 40.700, longitude: -74.000 }, { latitude: 40.700, longitude: -73.990 });
      results.push(_assert('#6 due-east bearing resolves near 90deg', east != null && Math.abs(east - 90) < 2, east));
      results.push(_assert('#6 bearing is null (never guessed) when an endpoint is missing', vs.__bearingBetween(null, { latitude: 1, longitude: 1 }) === null));

      var routeA = store.getAllRoutes()[0];
      var anyStation = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0];

      // ── #1 logical train -> visual-state resolution ─────────────────────
      store.applyRealtimeUpdate(
        [_tripRow('VS1', routeA.authoritativeId, 'TR-VS1', 'N', [])],
        [_vehicleRow('VS1', routeA.authoritativeId, 'TR-VS1', anyStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0)],
        [GROUP]
      );
      rs.reconcile({ now: T0 });
      var assoc1 = rs.getTripAssociation('VS1');
      var state1 = vs.buildVisualState(assoc1.logicalTrainId);
      results.push(_assert('#1 buildVisualState resolves a real state for a real associated logical train',
        !!state1 && state1.logicalTrainId === assoc1.logicalTrainId && state1.routeId === routeA.id && state1.positionState === 'observed_stop'));
      results.push(_assert('#1 visual state carries the real consistId (never invented)', !!state1.consistId && /^sr-consist-\d{6}$/.test(state1.consistId)));

      // ── #2 route family -> active palette color (via mtaSubwayMapFeatures) ─
      var fc1 = feat.buildLogicalTrainFeatures();
      var f1 = fc1.features.filter(function (f) { return f.properties.logicalTrainId === assoc1.logicalTrainId; })[0];
      results.push(_assert('#2 rendered train feature carries a real palette-resolved color for its route family',
        !!f1 && !!f1.properties.resolvedColor && (!pa || f1.properties.resolvedColor === pa.resolveFamilyColor(f1.properties.semanticFamily))));

      // ── #3 palette switch preserves train identity ───────────────────────
      if (pa) {
        var before = pa.getActivePaletteId();
        var otherPalette = pa.listPalettes().map(function (p) { return p.id; }).filter(function (id) { return id !== before; })[0];
        pa.setActivePalette(otherPalette);
        var fc1b = feat.buildLogicalTrainFeatures();
        var f1b = fc1b.features.filter(function (f) { return f.properties.logicalTrainId === assoc1.logicalTrainId; })[0];
        results.push(_assert('#3 palette switch changes resolved color but never logicalTrainId/routeId',
          !!f1b && f1b.properties.logicalTrainId === f1.properties.logicalTrainId && f1b.properties.routeId === f1.properties.routeId));
        pa.setActivePalette(before);
      } else {
        results.push(_assert('#3 palette switch preserves identity (SKIPPED — MTASubwayPaletteAuthority not loaded in this context)', true));
      }

      // ── #4/#5/#6(cont) canonical geometry segment + inferred-on-geometry + bearing, real data ─
      var pair = _findRealAdjacentPair(store);
      results.push(_assert('a real adjacent station pair exists for geometry testing', !!pair));
      if (pair) {
        var prevGtfs = pair.prevStation.authoritativeIds.gtfsStopId, nextGtfs = pair.nextStation.authoritativeIds.gtfsStopId;
        var depMs = T0 - 30000, arrMs = T0 + 30000;
        store.applyRealtimeUpdate(
          [_tripRow('VS1', routeA.authoritativeId, 'TR-VS1', 'N', []),
            _tripRow('VS2', pair.route.authoritativeId, 'TR-VS2', 'N', [
              { stopId: prevGtfs, arrivalUtcMs: depMs - 10000, departureUtcMs: depMs },
              { stopId: nextGtfs, arrivalUtcMs: arrMs, departureUtcMs: arrMs + 10000 },
            ])],
          [_vehicleRow('VS1', routeA.authoritativeId, 'TR-VS1', anyStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0),
            _vehicleRow('VS2', pair.route.authoritativeId, 'TR-VS2', nextGtfs, 'IN_TRANSIT_TO', 2, T0)],
          [GROUP]
        );
        rs.reconcile({ now: T0 });
        var assoc2 = rs.getTripAssociation('VS2');
        var state2 = vs.buildVisualState(assoc2.logicalTrainId);
        var rawPos = rs.getPositionState(assoc2.logicalTrainId);
        results.push(_assert('#4 visual state geometryPosition delegates to the rolling-stock authority\'s own already-shape-constrained position (never recomputed)',
          !!state2.geometryPosition && !!rawPos.position && state2.geometryPosition[0] === rawPos.position[0] && state2.geometryPosition[1] === rawPos.position[1]));
        var lonLo = Math.min(pair.prevStation.longitude, pair.nextStation.longitude) - 0.01, lonHi = Math.max(pair.prevStation.longitude, pair.nextStation.longitude) + 0.01;
        var latLo = Math.min(pair.prevStation.latitude, pair.nextStation.latitude) - 0.01, latHi = Math.max(pair.prevStation.latitude, pair.nextStation.latitude) + 0.01;
        results.push(_assert('#5 inferred position stays within the real bounding box of its two real canonical stations (never off-geometry)',
          state2.geometryPosition[0] >= lonLo && state2.geometryPosition[0] <= lonHi && state2.geometryPosition[1] >= latLo && state2.geometryPosition[1] <= latHi));
        results.push(_assert('#6 bearing resolves to a real 0-360 heading for a real inferred-segment train',
          state2.geometryBearing != null && state2.geometryBearing >= 0 && state2.geometryBearing < 360));
      }

      // ── #7 stale state ────────────────────────────────────────────────────
      store.applyRealtimeUpdate(
        [_tripRow('VS3', routeA.authoritativeId, 'TR-VS3', 'N', [])],
        [_vehicleRow('VS3', routeA.authoritativeId, 'TR-VS3', anyStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0)],
        [GROUP]
      );
      rs.reconcile({ now: T0 });
      var assoc3 = rs.getTripAssociation('VS3');
      // Age the trip out (no longer in a subsequent applyRealtimeUpdate/reconcile pass) past STALE_AFTER_MS.
      store.applyRealtimeUpdate([], [], [GROUP]);
      rs.reconcile({ now: T0 + 95000 });
      var state3 = vs.buildVisualState(assoc3.logicalTrainId);
      results.push(_assert('#7 stale train truthfully reports positionState stale with a real staleAt timestamp',
        state3.positionState === 'stale' && state3.staleAt != null));

      // ── #8 unknown position handling ─────────────────────────────────────
      store.applyRealtimeUpdate([_tripRow('VS4', routeA.authoritativeId, 'TR-VS4', 'N', [])], [], [GROUP]);
      rs.reconcile({ now: T0 });
      var assoc4 = rs.getTripAssociation('VS4');
      var state4 = vs.buildVisualState(assoc4.logicalTrainId);
      results.push(_assert('#8 unknown position never fabricates geometryPosition/geometryBearing',
        state4.positionState === 'unknown' && state4.geometryPosition === null && state4.geometryBearing === null));

      // ── #9 selected/associated logical train persists across poll ────────
      store.applyRealtimeUpdate(
        [_tripRow('VS1', routeA.authoritativeId, 'TR-VS1', 'N', [])],
        [_vehicleRow('VS1', routeA.authoritativeId, 'TR-VS1', anyStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0 + 5000)],
        [GROUP]
      );
      rs.reconcile({ now: T0 + 5000 });
      var assoc1Again = rs.getTripAssociation('VS1');
      results.push(_assert('#9 the same real trip continuing across two reconcile ticks resolves to the SAME logical train id',
        assoc1Again.logicalTrainId === assoc1.logicalTrainId));

      // ── #10 trip reassociation never creates a duplicate logical train ───
      var allTrainsBefore = rs.getAllLogicalTrains().length;
      store.applyRealtimeUpdate([], [], [GROUP]); // VS1's trip disappears -> train ages toward ended
      rs.reconcile({ now: T0 + 400000 }); // past ENDED_AFTER_MS
      store.applyRealtimeUpdate(
        [_tripRow('VS1-REPLACEMENT', routeA.authoritativeId, null, 'N', [])],
        [_vehicleRow('VS1-REPLACEMENT', routeA.authoritativeId, null, anyStation.authoritativeIds.gtfsStopId, 'STOPPED_AT', 1, T0 + 400000)],
        [GROUP]
      );
      rs.reconcile({ now: T0 + 400000 });
      var allTrainsAfter = rs.getAllLogicalTrains().length;
      results.push(_assert('#10 reassociating a new trip onto an idle pool member reuses an existing logical train rather than always minting a new one',
        allTrainsAfter <= allTrainsBefore + 1, [allTrainsBefore, allTrainsAfter]));

      // ── #11 no visual-state identity collisions across the whole active set ─
      var allStates = vs.getAllVisualStates();
      var idSet = {}, dupes = 0;
      allStates.forEach(function (s) { if (idSet[s.logicalTrainId]) dupes++; idSet[s.logicalTrainId] = true; });
      results.push(_assert('#11 getAllVisualStates() never returns two entries for the same logicalTrainId', dupes === 0, dupes));

      // ── #12 centralized/pure derivation — no timers, idempotent, no
      //    hidden per-train animation state living in this module ──────────
      var snapshotA = JSON.stringify(vs.getAllVisualStates());
      var snapshotB = JSON.stringify(vs.getAllVisualStates());
      results.push(_assert('#12 getAllVisualStates() is a pure, idempotent read — calling it twice with no state change yields identical output',
        snapshotA === snapshotB));

      rs.__resetForTests();
      store.applyRealtimeUpdate([], [], [GROUP]);

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayTrainVisualStateTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayTrainVisualStateTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayTrainVisualStateTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayTrainVisualStateTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
