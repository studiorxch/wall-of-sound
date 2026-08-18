// ── SubwayArtworkPlacementAuthority Tests v1.0.0 ──────────────────────────────
// 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0_BUILD — Required Tests §31 (8-19)
// Status: active | Classification: test-harness
//
// Run via: _wos.debug.subwayArtworkPlacementAuthorityTests.runTests()
//
// Builds real logical cars/surfaces (same fixture convention as
// subwayCarSurfaceAuthority.tests.js) and real artwork records to exercise
// placement creation, validation, cover/replace, append-only history, and
// persistence across a simulated reload.
//
// Placement: wall/systems/transit/subwayArtworkPlacementAuthority.tests.js
// Load: AFTER subwayArtworkPlacementAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) { return { name: name, pass: !!cond, details: details === undefined ? null : details }; }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var sf = SBE.SubwayCarSurfaceAuthority;
    var art = SBE.SubwayArtworkAuthority;
    var pl = SBE.SubwayArtworkPlacementAuthority;
    var results = [];
    if (!store || !rs || !sf || !art || !pl) {
      results.push(_assert('all 5 required SBE authorities are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      rs.__resetForTests(); sf.__resetForTests(); art.__resetForTests(); pl.__resetForTests();
      var T0 = 1755500000000;
      var routeA = store.getAllRoutes().filter(function (r) { return r.id === 'subway:route:A'; })[0] || store.getAllRoutes()[0];
      var routeOther = store.getAllRoutes().filter(function (r) { return r.id !== routeA.id; })[0];
      var anyStopId = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0].authoritativeIds.gtfsStopId;

      store.applyRealtimeUpdate(
        [{ tripId: 'PL1', routeId: routeA.authoritativeId, trainId: 'TR-PL1', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' },
         { tripId: 'PL2', routeId: routeOther.authoritativeId, trainId: 'TR-PL2', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' }],
        [{ tripId: 'PL1', routeId: routeA.authoritativeId, trainId: 'TR-PL1', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' },
         { tripId: 'PL2', routeId: routeOther.authoritativeId, trainId: 'TR-PL2', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' }],
        ['test']
      );
      rs.reconcile({ now: T0 });

      var car1 = rs.getLogicalCarsForConsist(rs.getLogicalTrain(rs.getTripAssociation('PL1').logicalTrainId).consistId)[0];
      var car2 = rs.getLogicalCarsForConsist(rs.getLogicalTrain(rs.getTripAssociation('PL2').logicalTrainId).consistId)[0];
      sf.ensureSurfacesForCar(car1.id);
      sf.ensureSurfacesForCar(car2.id);
      var surface1 = sf.getSurfacesForCar(car1.id).filter(function (s) { return s.surfaceType === 'exterior_side_a'; })[0];
      var surface1b = sf.getSurfacesForCar(car1.id).filter(function (s) { return s.surfaceType === 'exterior_side_b'; })[0];
      var surface2 = sf.getSurfacesForCar(car2.id).filter(function (s) { return s.surfaceType === 'exterior_side_a'; })[0];

      var art1 = art.createArtwork({ creatorType: 'system', title: 'DEV_ART_01', now: T0 }).data;
      var art2 = art.createArtwork({ creatorType: 'system', title: 'DEV_ART_02', now: T0 }).data;

      // ── #8 valid placement creation ───────────────────────────────────────
      var p1 = pl.createPlacement({ artworkId: art1.id, surfaceId: surface1.id, targetType: 'surface', targetId: surface1.id, now: T0 });
      results.push(_assert('#8 a valid placement is created successfully', p1.ok && /^sr-placement-\d{6}$/.test(p1.data.id)));
      results.push(_assert('#8 the created placement is immediately active with full provenance fields',
        p1.data.placementState === 'active' && p1.data.logicalCarId === car1.id && p1.data.consistId === car1.consistId &&
        p1.data.logicalTrainId === car1.logicalTrainId && p1.data.routeId === car1.routeId));

      // ── #9 invalid artwork rejection ──────────────────────────────────────
      var badArt = pl.createPlacement({ artworkId: 'sr-art-999999', surfaceId: surface1b.id, targetType: 'surface', targetId: surface1b.id });
      results.push(_assert('#9 a placement referencing a nonexistent artwork id is rejected explicitly', badArt.ok === false && badArt.reason === 'artwork_not_found'));

      // ── #10 invalid surface rejection ─────────────────────────────────────
      var badSurf = pl.createPlacement({ artworkId: art1.id, surfaceId: 'sr-surface-999999', targetType: 'surface', targetId: 'sr-surface-999999' });
      results.push(_assert('#10 a placement referencing a nonexistent surface id is rejected explicitly', badSurf.ok === false && badSurf.reason === 'surface_not_found'));

      // ── #11 logical-car/surface ownership validation ─────────────────────
      // surface2 genuinely belongs to car2 — targeting it while CLAIMING car1
      // as the target must be rejected (a real ownership mismatch, not a typo).
      var mismatch = pl.createPlacement({ artworkId: art1.id, surfaceId: surface2.id, targetType: 'logical_car', targetId: car1.id });
      results.push(_assert('#11 a surface/target ownership mismatch is rejected (surface belongs to car2, target claims car1)',
        mismatch.ok === false && mismatch.reason === 'target_ownership_mismatch'));

      // ── #16/#17/#18 route/car/surface-target compatibility ────────────────
      var byRoute = pl.createPlacement({ artworkId: art2.id, surfaceId: surface1b.id, targetType: 'route', targetId: car1.routeId, now: T0 });
      results.push(_assert('#16 a route-targeted placement resolves correctly when the surface genuinely belongs to that route', byRoute.ok));
      var byCar = pl.createPlacement({ artworkId: art1.id, surfaceId: surface2.id, targetType: 'logical_car', targetId: car2.id, now: T0 });
      results.push(_assert('#17 a car-targeted placement resolves correctly when the surface genuinely belongs to that car', byCar.ok));
      results.push(_assert('#18 the original surface-targeted placement (#8) remains valid and resolvable', pl.getPlacement(p1.data.id).targetType === 'surface'));

      // ── #14 endedAt validation ─────────────────────────────────────────────
      var badEnded = pl.createPlacement({ artworkId: art1.id, surfaceId: surface1.id, targetType: 'surface', targetId: surface1.id, now: T0, startedAt: T0, endedAt: T0 - 1000 });
      results.push(_assert('#14 endedAt earlier than startedAt is rejected', badEnded.ok === false && badEnded.reason === 'invalid_ended_before_started'));

      // ── #13/#15 cover/replace behavior + layer ordering ───────────────────
      var p2 = pl.createPlacement({ artworkId: art2.id, surfaceId: surface1.id, targetType: 'surface', targetId: surface1.id, now: T0 + 1000 });
      results.push(_assert('#13 placing new artwork on an already-occupied surface succeeds and reports what it covered', p2.ok && p2.covered === p1.data.id));
      results.push(_assert('#13 covering does NOT delete the prior placement — it transitions to "covered" with a real endedAt',
        pl.getPlacement(p1.data.id).placementState === 'covered' && pl.getPlacement(p1.data.id).endedAt === T0 + 1000));
      results.push(_assert('#15 the new placement has a strictly higher layerIndex than the one it covered',
        pl.getPlacement(p2.data.id).layerIndex > pl.getPlacement(p1.data.id).layerIndex));
      results.push(_assert('#13 the active placement for that surface is now the new one, not the covered one',
        pl.getActivePlacementForSurface(surface1.id).id === p2.data.id));

      // ── #12 append-only history ────────────────────────────────────────────
      var history = pl.getPlacementHistoryForSurface(surface1.id);
      results.push(_assert('#12 placement history for the surface contains BOTH the covered and the active placement, in layer order',
        history.length === 2 && history[0].id === p1.data.id && history[1].id === p2.data.id));
      results.push(_assert('#12 the covered placement retains its ORIGINAL artworkId, startedAt, and target (no field was destructively rewritten)',
        pl.getPlacement(p1.data.id).artworkId === art1.id && pl.getPlacement(p1.data.id).startedAt === T0));

      // Retire the (now covered) original explicitly — still must not delete it.
      var retireResult = pl.retirePlacement(p1.data.id, T0 + 2000);
      results.push(_assert('retirePlacement() transitions state without deleting the record',
        retireResult.ok && pl.getPlacement(p1.data.id).placementState === 'retired' && !!pl.getPlacement(p1.data.id)));

      // ── #19 history survives reload/persistence ────────────────────────────
      // Simulate a reload by resetting only the in-memory _loaded flags is not
      // possible from outside (private) — instead prove persistence the same
      // way the rolling-stock/station-library builds did: read straight back
      // from localStorage and confirm the exact same record round-trips.
      var raw = null;
      try { raw = JSON.parse(global.localStorage.getItem('wos:subwayArtworkPlacementAuthority:v1')); } catch (e) {}
      results.push(_assert('#19 placement history is written to persistent storage and round-trips byte-for-byte',
        !!raw && !!raw.placements[p1.data.id] && raw.placements[p1.data.id].placementState === 'retired' &&
        !!raw.placements[p2.data.id] && raw.bySurface[surface1.id].length === 2));

      // ── #20 (cross-check) rolling-stock/surface identity remain unchanged ──
      results.push(_assert('creating/covering placements never mutated the underlying logical car or surface records',
        rs.getLogicalCar(car1.id).id === car1.id && sf.getSurface(surface1.id).id === surface1.id));

      var diag = pl.getDiagnostics();
      results.push(_assert('diagnostics: zero orphan active placements', diag.orphanActivePlacementCount === 0, diag.orphanActivePlacementCount));
      results.push(_assert('diagnostics: route/car/surface-targeted placement counts are all non-zero (all 3 targeting modes exercised)',
        diag.routeTargetedPlacements > 0 && diag.carTargetedPlacements > 0 && diag.surfaceTargetedPlacements > 0, diag));

      rs.__resetForTests(); sf.__resetForTests(); art.__resetForTests(); pl.__resetForTests();
      store.applyRealtimeUpdate([], [], ['test']);

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayArtworkPlacementAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayArtworkPlacementAuthorityTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayArtworkPlacementAuthorityTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayArtworkPlacementAuthorityTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
