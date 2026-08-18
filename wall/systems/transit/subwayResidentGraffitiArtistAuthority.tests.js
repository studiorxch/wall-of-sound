// ── SubwayResidentGraffitiArtistAuthority Tests v1.0.0 ────────────────────────
// 0818_SUBWAY_Resident_Graffiti_Artists_v1.0.0_BUILD — Required Tests §37 (1-5, 13-21, 24-26)
// Status: active | Classification: test-harness
//
// Run via: _wos.debug.subwayResidentGraffitiArtistAuthorityTests.runTests()
//
// Builds real logical cars/surfaces (same fixture convention as
// subwayArtworkPlacementAuthority.tests.js) across TWO distinct real routes
// so route/route-family preference filtering has genuine, real data to
// discriminate against.
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
    var res = SBE.SubwayResidentGraffitiArtistAuthority;
    var results = [];
    if (!store || !rs || !sf || !art || !pl || !res) {
      results.push(_assert('all 6 required SBE authorities are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      rs.__resetForTests(); sf.__resetForTests(); art.__resetForTests(); pl.__resetForTests(); res.__resetForTests();
      var T0 = 1755500000000;

      // ── #1/#2/#4/#5 seed population + identity ───────────────────────────
      res.ensureSeeded();
      var all = res.getAllResidents();
      results.push(_assert('#1 at least 6 seeded Residents exist with unique sr-resident-###### ids',
        all.length >= 6 && new Set(all.map(function (r) { return r.id; })).size === all.length &&
        all.every(function (r) { return /^sr-resident-\d{6}$/.test(r.id); }), all.length));

      var byTag = {};
      all.forEach(function (r) { byTag[r.tagName] = (byTag[r.tagName] || 0) + 1; });
      results.push(_assert('#2 tag/display names are never used as identity (distinct tags, but identity is the minted id, not the tag)',
        Object.keys(byTag).every(function (t) { return byTag[t] === 1; }) && all.every(function (r) { return r.id !== r.tagName && r.id !== r.displayName; })));

      results.push(_assert('#4/#5 every resident resolves to a real, distinct style profile',
        all.every(function (r) { return !!res.getStyleProfile(r.styleProfileId); }) &&
        new Set(all.map(function (r) { return r.styleProfileId; })).size === all.length));

      // ── #3 creator linkage ────────────────────────────────────────────────
      results.push(_assert('#3 every resident is its own creatorId under creatorType "resident"',
        all.every(function (r) { return r.creatorType === 'resident' && r.creatorId === r.id; })));

      // ── Real fixture: three distinct real routes with real cars/surfaces —
      //    A (ace family, matches STBLM), L (l family, matches STLORK), and
      //    1 (numbered family, matches VLVT's real "never" cover policy). ──
      var routeA = store.getAllRoutes().filter(function (r) { return r.id === 'subway:route:A'; })[0];
      var routeL = store.getAllRoutes().filter(function (r) { return r.id === 'subway:route:L'; })[0];
      var route1 = store.getAllRoutes().filter(function (r) { return r.id === 'subway:route:1'; })[0];
      var anyStopId = store.getAllStations().filter(function (s) { return s.kind === 'station'; })[0].authoritativeIds.gtfsStopId;
      store.applyRealtimeUpdate(
        [{ tripId: 'RG1', routeId: routeA.authoritativeId, trainId: 'TR-RG1', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' },
         { tripId: 'RG2', routeId: routeL.authoritativeId, trainId: 'TR-RG2', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' },
         { tripId: 'RG4', routeId: route1.authoritativeId, trainId: 'TR-RG4', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' }],
        [{ tripId: 'RG1', routeId: routeA.authoritativeId, trainId: 'TR-RG1', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' },
         { tripId: 'RG2', routeId: routeL.authoritativeId, trainId: 'TR-RG2', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' },
         { tripId: 'RG4', routeId: route1.authoritativeId, trainId: 'TR-RG4', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' }],
        ['test']
      );
      rs.reconcile({ now: T0 });

      var velvetGhost = all.filter(function (r) { return r.tagName === 'VLVT'; })[0]; // preferredRouteFamilies: ['numbered'] -> matches the real route 1 fixture below
      var staticBloom = all.filter(function (r) { return r.tagName === 'STBLM'; })[0]; // ['ace'] -> matches route A
      var steelOrchid = all.filter(function (r) { return r.tagName === 'STLORK'; })[0]; // ['l'] -> matches route L
      var paleSignal = all.filter(function (r) { return r.tagName === 'PLSGNL'; })[0]; // ['jz'] -> matches NONE of A/L/1

      // ── #13/#14 route + route-family preference filtering ─────────────────
      var resultA = res.resolveEligibleSurface(staticBloom.id, { now: T0, rand: function () { return 0; } });
      results.push(_assert('#13/#14 a resident preferring the "ace" family resolves to a real surface on the real A-route train',
        resultA.ok && resultA.train.routeId === routeA.id));

      var resultWrongFamily = res.resolveEligibleSurface(paleSignal.id, { now: T0, rand: function () { return 0; } });
      results.push(_assert('#13/#14 a resident preferring "jz" (absent from this fixture) finds NO eligible surface among the real A/L/1 trains — real filtering, not a pass-through',
        resultWrongFamily.ok === false && resultWrongFamily.reason === 'no_eligible_surface'));

      // ── #15 surface-type filtering (exterior_side_a/b only, BUILD §18) ────
      var carForA = rs.getLogicalCarsForConsist(rs.getLogicalTrain(rs.getTripAssociation('RG1').logicalTrainId).consistId)[0];
      sf.ensureSurfacesForCar(carForA.id);
      var allSurfaceTypesOnCar = sf.getSurfacesForCar(carForA.id).map(function (s) { return s.surfaceType; });
      results.push(_assert('the real fixture car has non-exterior surface types too (interior/front), proving the filter below is real', allSurfaceTypesOnCar.indexOf('interior') !== -1));
      results.push(_assert('#15 resolveEligibleSurface never returns a non-exterior surface type',
        resultA.ok && (resultA.surface.surfaceType === 'exterior_side_a' || resultA.surface.surfaceType === 'exterior_side_b')));

      // ── #16 empty-surface preference ──────────────────────────────────────
      results.push(_assert('#16 with no active placements anywhere, resolution picks an EMPTY surface (coverAction false)', resultA.ok && resultA.coverAction === false));

      // ── #17 never cover policy — safe failure, no silent cover ───────────
      // Occupy every eligible exterior surface on the real "1" train, then
      // ask VLVT (preferredRouteFamilies: ['numbered'], coverPermission:
      // 'never') to resolve — a genuine route-family match with zero empty
      // surfaces available anywhere it's allowed to look.
      var oneCars = rs.getLogicalCarsForConsist(rs.getLogicalTrain(rs.getTripAssociation('RG4').logicalTrainId).consistId);
      oneCars.forEach(function (car) {
        sf.ensureSurfacesForCar(car.id).surfaces.filter(function (s) { return s.surfaceType === 'exterior_side_a' || s.surfaceType === 'exterior_side_b'; }).forEach(function (s) {
          var a = art.createArtwork({ creatorType: 'system', title: 'FIXTURE_1', now: T0 }).data;
          pl.createPlacement({ artworkId: a.id, surfaceId: s.id, targetType: 'surface', targetId: s.id, now: T0 });
        });
      });
      var neverResult = res.resolveEligibleSurface(velvetGhost.id, { now: T0, rand: function () { return 0; } });
      results.push(_assert('#17 a "never" resident with a genuine route-family match but zero empty surfaces gets an explicit safe failure, never a silent cover',
        neverResult.ok === false && neverResult.reason === 'no_eligible_surface'));

      // Occupy every eligible A-route exterior surface so the next
      // resolutions are forced to exercise cover policy behavior.
      var aCars = rs.getLogicalCarsForConsist(rs.getLogicalTrain(rs.getTripAssociation('RG1').logicalTrainId).consistId);
      aCars.forEach(function (car) {
        sf.ensureSurfacesForCar(car.id).surfaces.filter(function (s) { return s.surfaceType === 'exterior_side_a' || s.surfaceType === 'exterior_side_b'; }).forEach(function (s) {
          var a = art.createArtwork({ creatorType: 'system', title: 'FIXTURE_A', now: T0 }).data;
          pl.createPlacement({ artworkId: a.id, surfaceId: s.id, targetType: 'surface', targetId: s.id, now: T0 });
        });
      });

      // Occupy every eligible L-route exterior surface too (for #19 below).
      var lCars = rs.getLogicalCarsForConsist(rs.getLogicalTrain(rs.getTripAssociation('RG2').logicalTrainId).consistId);
      lCars.forEach(function (car) {
        sf.ensureSurfacesForCar(car.id).surfaces.filter(function (s) { return s.surfaceType === 'exterior_side_a' || s.surfaceType === 'exterior_side_b'; }).forEach(function (s) {
          var a = art.createArtwork({ creatorType: 'system', title: 'FIXTURE_L', now: T0 }).data;
          pl.createPlacement({ artworkId: a.id, surfaceId: s.id, targetType: 'surface', targetId: s.id, now: T0 });
        });
      });

      // ── #19 allowed cover policy — steelOrchid, route L, all occupied ────
      var allowedResultDeclined = res.resolveEligibleSurface(steelOrchid.id, { now: T0, rand: function () { return 1; } }); // roll=1 > coverProbability(0.5) -> declined
      results.push(_assert('#19 "allowed" policy respects the probability roll — a high roll declines the cover explicitly', allowedResultDeclined.ok === false && allowedResultDeclined.reason === 'cover_declined_by_probability'));
      var allowedResultAccepted = res.resolveEligibleSurface(steelOrchid.id, { now: T0, rand: function () { return 0; } }); // roll=0 <= coverProbability -> accepted
      results.push(_assert('#19 "allowed" policy covers an occupied surface when the roll succeeds, reporting exactly what it would cover',
        allowedResultAccepted.ok === true && allowedResultAccepted.coverAction === true && !!allowedResultAccepted.covering));

      // ── #18 older_only cover policy — staticBloom, route A, all occupied ──
      var olderTooSoon = res.resolveEligibleSurface(staticBloom.id, { now: T0 + 1000, rand: function () { return 0; } }); // only 1s old — too recent
      results.push(_assert('#18 "older_only" refuses to cover a placement younger than the minimum age', olderTooSoon.ok === false && olderTooSoon.reason === 'no_eligible_surface'));
      var olderEnough = res.resolveEligibleSurface(staticBloom.id, { now: T0 + res.OLDER_ONLY_MIN_AGE_MS + 5000, rand: function () { return 0; } });
      results.push(_assert('#18 "older_only" covers once the existing placement is old enough', olderEnough.ok === true && olderEnough.coverAction === true));

      // ── #21 no eligible surface failure never fabricates a target ────────
      results.push(_assert('#21 a resident with no matching route/family anywhere returns an explicit failure reason, never a fabricated surface',
        resultWrongFamily.ok === false && typeof resultWrongFamily.reason === 'string'));

      // ── #20 repeat-car avoidance ──────────────────────────────────────────
      // Free up route A again and confirm staticBloom avoids its own recently-used car.
      rs.__resetForTests(); sf.__resetForTests(); art.__resetForTests(); pl.__resetForTests();
      store.applyRealtimeUpdate(
        [{ tripId: 'RG3', routeId: routeA.authoritativeId, trainId: 'TR-RG3', direction: 'N', stopTimeUpdates: [], sourceGroupId: 'test' }],
        [{ tripId: 'RG3', routeId: routeA.authoritativeId, trainId: 'TR-RG3', stopId: anyStopId, currentStatus: 'STOPPED_AT', currentStopSequence: 1, timestampUtcMs: T0, sourceGroupId: 'test' }],
        ['test']
      );
      rs.reconcile({ now: T0 });
      var trainRG3 = rs.getLogicalTrain(rs.getTripAssociation('RG3').logicalTrainId);
      var carsRG3 = rs.getLogicalCarsForConsist(trainRG3.consistId);
      var firstCar = carsRG3[0];
      var firstCarSurface = sf.ensureSurfacesForCar(firstCar.id).surfaces.filter(function (s) { return s.surfaceType === 'exterior_side_a'; })[0];
      var freshArt = art.createArtwork({ creatorType: 'resident', creatorId: staticBloom.id, title: 'STBLM piece', now: T0 }).data;
      var freshPlacement = pl.createPlacement({ artworkId: freshArt.id, surfaceId: firstCarSurface.id, targetType: 'surface', targetId: firstCarSurface.id, now: T0 }).data;
      res.recordArtworkCreated(staticBloom.id, { artworkId: freshArt.id, createdAt: T0, styleProfileId: staticBloom.styleProfileId, generationSeed: 1, toolSequence: ['fatcap'], palette: ['#ff0066'] });
      res.recordPlacementCreated(staticBloom.id, { placementId: freshPlacement.id, artworkId: freshArt.id, surfaceId: firstCarSurface.id, routeId: trainRG3.routeId, logicalCarId: firstCar.id, startedAt: T0 });

      var next = res.resolveEligibleSurface(staticBloom.id, { now: T0 + 2000, rand: function () { return 0; } });
      results.push(_assert('#20 repeat-car avoidance: the SAME resident\'s very next resolution never re-selects the car it just used, even though that car still has empty surfaces',
        next.ok === false || next.car.id !== firstCar.id, next.ok ? next.car.id : next.reason));

      // ── #24/#25 Resident Artwork/Placement history ───────────────────────
      results.push(_assert('#24 Resident artwork history contains the real created artwork, indexed not duplicated',
        res.getArtworkHistory(staticBloom.id).some(function (a) { return a.artworkId === freshArt.id; }) &&
        !!art.getArtwork(freshArt.id))); // canonical Authority remains the source of truth
      results.push(_assert('#25 Resident placement history contains the real created placement with full provenance',
        res.getPlacementHistory(staticBloom.id).some(function (p) { return p.placementId === freshPlacement.id && p.surfaceId === firstCarSurface.id && p.routeId === trainRG3.routeId; })));

      // ── #26 append-only cover history (via the canonical Placement
      //    Authority — Resident history references it, never duplicates it) ─
      var secondArt = art.createArtwork({ creatorType: 'resident', creatorId: staticBloom.id, title: 'STBLM cover', now: T0 + 5000 }).data;
      var coverPlacement = pl.createPlacement({ artworkId: secondArt.id, surfaceId: firstCarSurface.id, targetType: 'surface', targetId: firstCarSurface.id, now: T0 + 5000 });
      res.recordArtworkCreated(staticBloom.id, { artworkId: secondArt.id, createdAt: T0 + 5000, styleProfileId: staticBloom.styleProfileId, generationSeed: 2, toolSequence: ['fatcap'], palette: ['#ffb703'] });
      res.recordPlacementCreated(staticBloom.id, { placementId: coverPlacement.data.id, artworkId: secondArt.id, surfaceId: firstCarSurface.id, routeId: trainRG3.routeId, logicalCarId: firstCar.id, startedAt: T0 + 5000 });
      var canonicalHistory = pl.getPlacementHistoryForSurface(firstCarSurface.id);
      results.push(_assert('#26 covering preserves the original placement in the canonical (append-only) history — never deleted',
        canonicalHistory.length === 2 && canonicalHistory[0].id === freshPlacement.id && pl.getPlacement(freshPlacement.id).placementState === 'covered'));
      results.push(_assert('#26 Resident\'s own placement-history index also records BOTH placements (index grows, never overwrites)',
        res.getPlacementHistory(staticBloom.id).length === 2));

      var diag = res.getDiagnostics();
      results.push(_assert('diagnostics: zero resident identity collisions, zero orphan history references',
        diag.residentIdentityCollisionCount === 0 && diag.orphanArtworkReferenceCount === 0 && diag.orphanPlacementReferenceCount === 0, diag));

      rs.__resetForTests(); sf.__resetForTests(); art.__resetForTests(); pl.__resetForTests(); res.__resetForTests();
      store.applyRealtimeUpdate([], [], ['test']);

      var failed = results.filter(function (r) { return !r.pass; });
      var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
      console.log('[SubwayResidentGraffitiArtistAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
      if (failed.length) console.warn('[SubwayResidentGraffitiArtistAuthorityTests] failures:', failed);
      return summary;
    });
  }

  SBE.SubwayResidentGraffitiArtistAuthorityTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayResidentGraffitiArtistAuthorityTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
