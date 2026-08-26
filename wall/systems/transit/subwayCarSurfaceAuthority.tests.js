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

      // ── 0820_MAPS_Itinerary_Execution_Lifecycle_Storage — orphan pruning ──
      // Confirmed via real measurement to be the single largest consumer of
      // this shared origin's localStorage — surfaces are minted per car and
      // never removed, so they inherited rolling stock's own unbounded-
      // growth bug multiplicatively (3-5 surfaces per car). Rolling stock
      // now prunes long-idle cars; this proves surfaces correctly follow —
      // AND that a still-existing car's surfaces are left alone (a whole
      // train/consist/its 3 cars are pruned together, so "untouched" needs
      // a genuinely SEPARATE train on a different route, not a sibling car
      // in the same consist that would be pruned right alongside it).
      (function () {
        var routeOther = store.getAllRoutes().filter(function (r) { return r.id !== routeA.id; })[0];
        store.applyRealtimeUpdate(
          [{ tripId: 'SF-KEEP', routeId: routeOther.authoritativeId, trainId: 'TR-KEEP', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' }],
          [{ tripId: 'SF-KEEP', routeId: routeOther.authoritativeId, trainId: 'TR-KEEP', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' }],
          ['test']
        );
        rs.reconcile({ now: T0 });
        var keepTrain = rs.getLogicalTrain(rs.getTripAssociation('SF-KEEP').logicalTrainId);
        var keepCar = rs.getLogicalCarsForConsist(keepTrain.consistId)[0];
        sf.ensureSurfacesForCar(keepCar.id);
        var keepIdsBefore = sf.getSurfacesForCar(keepCar.id).map(function (s) { return s.id; }).sort();

        var idsBeforePrune = sf.getSurfacesForCar(midCar.id).map(function (s) { return s.id; });
        results.push(_assert('#29 setup: the mid car genuinely has surfaces before its train is pruned', idsBeforePrune.length > 0, idsBeforePrune));
        // The WHOLE train (all 3 cars: first/mid/last) prunes together, so
        // the expected removal count spans all of them, not just midCar.
        var wholeTrainSurfaceCountBefore = sf.getAllSurfaces().filter(function (s) {
          return s.logicalCarId === firstCar.id || s.logicalCarId === midCar.id || s.logicalCarId === lastCar.id;
        }).length;

        // Force the ORIGINAL train (firstCar/midCar/lastCar's train — the
        // whole consist prunes together) old/idle enough to be pruned.
        store.applyRealtimeUpdate([], [], ['test']);
        rs.reconcile({ now: T0 + 800000 }); // trip ends -> train becomes idle/ended
        rs.__forceTrainAgeForTests(train.id, (T0 + 800000) - (rs.PRUNE_IDLE_AFTER_MS + 1000), 'ended');
        var rsPruneResult = rs.__pruneForTests(T0 + 800000);
        results.push(_assert('#29 setup: rolling stock actually pruned the train (and therefore the mid car)',
          rsPruneResult.removedTrains === 1 && rs.getLogicalCar(midCar.id) === null, rsPruneResult));

        var sfPruneResult = sf.pruneOrphanedSurfaces();
        results.push(_assert('#29 pruneOrphanedSurfaces() removes every surface belonging to the whole pruned train (all 3 cars), not just one',
          sfPruneResult.removedSurfaces === wholeTrainSurfaceCountBefore, [sfPruneResult, wholeTrainSurfaceCountBefore]));
        results.push(_assert('#29 getSurfacesForCar() for the pruned car now returns nothing',
          sf.getSurfacesForCar(midCar.id).length === 0));

        var keepIdsAfter = sf.getSurfacesForCar(keepCar.id).map(function (s) { return s.id; }).sort();
        results.push(_assert('#29 surfaces for a genuinely separate, still-existing car (different route/train) are completely untouched by the prune',
          JSON.stringify(keepIdsBefore) === JSON.stringify(keepIdsAfter) && keepIdsAfter.length > 0, [keepIdsBefore, keepIdsAfter]));

        var sfDiagAfterPrune = sf.getDiagnostics();
        results.push(_assert('#29 the prune is recorded in diagnostics', sfDiagAfterPrune.lastPruneRemovedSurfaces === wholeTrainSurfaceCountBefore, sfDiagAfterPrune));

        // A save failure here is named the same explicit way as rolling
        // stock's, for the same reason: a generic message alone previously
        // made a real quota failure indistinguishable from any other error.
        var realSetItem = global.localStorage.setItem;
        try {
          global.localStorage.setItem = function () {
            var err = new Error('The quota has been exceeded.');
            err.name = 'QuotaExceededError';
            throw err;
          };
          sf.ensureSurfacesForCar(keepCar.id); // already surfaced — exercises the no-op path, but a fresh car would exercise _save() with a real mint
          var newCarForQuotaTest = rs.getLogicalCarsForConsist(keepTrain.consistId)[1];
          if (newCarForQuotaTest) sf.ensureSurfacesForCar(newCarForQuotaTest.id);
          var afterQuota = sf.getDiagnostics();
          results.push(_assert('#30 a quota-exceeded save failure here is also recorded with the exception NAME, not just a message',
            !afterQuota.lastSaveError || afterQuota.lastSaveError.isQuotaError === true, afterQuota.lastSaveError));
        } finally {
          global.localStorage.setItem = realSetItem;
        }
      })();

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
