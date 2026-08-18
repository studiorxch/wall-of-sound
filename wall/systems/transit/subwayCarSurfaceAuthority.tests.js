// ── SubwayCarSurfaceAuthority Tests v1.0.0 ────────────────────────────────────
// 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0_BUILD — Required Tests §31 (1-5, 20)
// Status: active | Classification: test-harness
//
// Run via: _wos.debug.subwayCarSurfaceAuthorityTests.runTests()
//
// Builds a real logical train (via SubwayLogicalRollingStockAuthority,
// itself fed real static station/route/shape data + a synthetic realtime
// trip through the transit store's own real applyRealtimeUpdate() path —
// same fixture convention as subwayLogicalRollingStockAuthority.tests.js)
// to get real, stable logicalCarId values to attach surfaces to.
//
// Placement: wall/systems/transit/subwayCarSurfaceAuthority.tests.js
// Load: AFTER subwayCarSurfaceAuthority.js and subwayLogicalRollingStockAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) { return { name: name, pass: !!cond, details: details === undefined ? null : details }; }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var sf = SBE.SubwayCarSurfaceAuthority;
    var results = [];
    if (!store || !rs || !sf) {
      results.push(_assert('SBE.MTASubwayTransitStore/SubwayLogicalRollingStockAuthority/SubwayCarSurfaceAuthority are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      rs.__resetForTests();
      sf.__resetForTests();
      var T0 = 1755500000000;
      var routeA = store.getAllRoutes().filter(function (r) { return r.id === 'subway:route:A'; })[0] || store.getAllRoutes()[0];
      var anyStopId = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0].authoritativeIds.gtfsStopId;

      store.applyRealtimeUpdate(
        [{ tripId: 'SF1', routeId: routeA.authoritativeId, trainId: 'TR-SF1', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' }],
        [{ tripId: 'SF1', routeId: routeA.authoritativeId, trainId: 'TR-SF1', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' }],
        ['test']
      );
      rs.reconcile({ now: T0 });

      var assoc = rs.getTripAssociation('SF1');
      var train = rs.getLogicalTrain(assoc.logicalTrainId);
      var consist = rs.getLogicalConsist(train.consistId);
      var cars = rs.getLogicalCarsForConsist(consist.id);
      var firstCar = cars[0], midCar = cars[Math.floor(cars.length / 2)], lastCar = cars[cars.length - 1];

      // ── #2 deterministic surface generation + front/rear conditional model ──
      var r1 = sf.ensureSurfacesForCar(firstCar.id);
      results.push(_assert('#2 first car (slotIndex 0) gets exterior_side_a/b + interior + front (leading car has an exposed end)',
        r1.ok && r1.surfaces.length === 4 && r1.surfaces.some(function (s) { return s.surfaceType === 'front'; }) &&
        !r1.surfaces.some(function (s) { return s.surfaceType === 'rear'; }), r1.surfaces && r1.surfaces.map(function (s) { return s.surfaceType; })));

      var rMid = sf.ensureSurfacesForCar(midCar.id);
      results.push(_assert('#2 a middle car gets only exterior_side_a/b + interior — no front/rear (coupled on both ends, not fabricated)',
        rMid.ok && rMid.surfaces.length === 3 &&
        !rMid.surfaces.some(function (s) { return s.surfaceType === 'front' || s.surfaceType === 'rear'; }), rMid.surfaces && rMid.surfaces.map(function (s) { return s.surfaceType; })));

      var rLast = sf.ensureSurfacesForCar(lastCar.id);
      results.push(_assert('#2 last car (trailing end) gets rear, not front',
        rLast.ok && rLast.surfaces.some(function (s) { return s.surfaceType === 'rear'; }) &&
        !rLast.surfaces.some(function (s) { return s.surfaceType === 'front'; })));

      // ── #1 surface ID uniqueness ──────────────────────────────────────────
      var allSurfaces = sf.getAllSurfaces();
      var idSet = {}, dupes = 0;
      allSurfaces.forEach(function (s) { if (idSet[s.id]) dupes++; idSet[s.id] = true; });
      results.push(_assert('#1 every surface id matches sr-surface-###### and all are globally unique',
        dupes === 0 && allSurfaces.every(function (s) { return /^sr-surface-\d{6}$/.test(s.id); }), dupes));

      // ── #3 persistence across "polling" (repeated ensure calls are no-ops) ─
      var idsBefore = sf.getSurfacesForCar(firstCar.id).map(function (s) { return s.id; }).sort();
      rs.reconcile({ now: T0 + 30000 }); // a real reconcile tick passes
      var r2 = sf.ensureSurfacesForCar(firstCar.id);
      var idsAfter = sf.getSurfacesForCar(firstCar.id).map(function (s) { return s.id; }).sort();
      results.push(_assert('#3 re-ensuring an already-surfaced car across a polling cycle creates zero new surfaces (idempotent)',
        r2.created === 0 && JSON.stringify(idsBefore) === JSON.stringify(idsAfter), [idsBefore, idsAfter]));

      // ── #4 persistence across trip reassociation ─────────────────────────
      // Trip vanishes, then a new trip reassociates the SAME logical train
      // (mta_train_id_match) — the car's surfaces must be completely unaffected.
      store.applyRealtimeUpdate([], [], ['test']);
      rs.reconcile({ now: T0 + 400000 }); // trip ends
      store.applyRealtimeUpdate(
        [{ tripId: 'SF2', routeId: routeA.authoritativeId, trainId: 'TR-SF1', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' }],
        [{ tripId: 'SF2', routeId: routeA.authoritativeId, trainId: 'TR-SF1', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0 + 400000, sourceGroupId: 'test' }],
        ['test']
      );
      rs.reconcile({ now: T0 + 400000 });
      var assoc2 = rs.getTripAssociation('SF2');
      var idsAfterReassoc = sf.getSurfacesForCar(firstCar.id).map(function (s) { return s.id; }).sort();
      results.push(_assert('#4 surface identity survives trip reassociation (same logical train reused, surfaces untouched)',
        assoc2.logicalTrainId === train.id && JSON.stringify(idsBefore) === JSON.stringify(idsAfterReassoc)));

      // ── #20 rolling-stock IDs remain unchanged by surface generation ──────
      results.push(_assert('#20 ensuring surfaces never mutates the logical car/consist/train record itself',
        rs.getLogicalCar(firstCar.id).id === firstCar.id && rs.getLogicalConsist(consist.id).id === consist.id && rs.getLogicalTrain(train.id).id === train.id));

      // ── Palette-switch identity preservation (mirrors rolling-stock's own
      //    proof — surfaces never read the palette authority at all) ────────
      var pa = SBE.MTASubwayPaletteAuthority;
      if (pa) {
        var before = pa.getActivePaletteId();
        var surfSnapshotBefore = JSON.stringify(sf.getSurfacesForCar(firstCar.id));
        pa.setActivePalette(before === 'fashion_subway' ? 'mta_reference' : 'fashion_subway');
        var surfSnapshotAfter = JSON.stringify(sf.getSurfacesForCar(firstCar.id));
        pa.setActivePalette(before);
        results.push(_assert('#5 palette switch does not mutate surface identity', surfSnapshotBefore === surfSnapshotAfter));
      }

      var diag = sf.getDiagnostics();
      results.push(_assert('diagnostics: zero surface collisions', diag.surfaceCollisionCount === 0, diag.surfaceCollisionCount));

      rs.__resetForTests();
      sf.__resetForTests();
      store.applyRealtimeUpdate([], [], ['test']);

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayCarSurfaceAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayCarSurfaceAuthorityTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayCarSurfaceAuthorityTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayCarSurfaceAuthorityTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
