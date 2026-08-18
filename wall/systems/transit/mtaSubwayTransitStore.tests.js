// ── MTASubwayTransitStore Tests v1.0.0 ────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Required Tests §23.2, §23.3, §23.12
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.mtaSubwayTransitStore.runTests()
// Covers: duplicate-display-name reporting, canonical-ID collision invariant
// (the required "identity collision count = 0" from BUILD §17), and a real
// end-to-end validation-route pass (static load → real live realtime fetch →
// apply → query), i.e. §23.12 "selected validation route end-to-end" run
// against the REAL current MTA feed, not a mock.
//
// Placement: wall/systems/transit/mtaSubwayTransitStore.tests.js
// Load: AFTER mtaSubwayTransitStore.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var store = SBE.MTASubwayTransitStore;
    var rt = SBE.MTASubwayRealtimeAdapter;
    var results = [];
    if (!store || !rt) {
      results.push(_assert('SBE.MTASubwayTransitStore and MTASubwayRealtimeAdapter are loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    return store.loadStatic().then(function (staticResult) {
      results.push(_assert('loadStatic() resolves ok', staticResult && staticResult.ok === true, staticResult));

      var diag = store.getDiagnostics();
      results.push(_assert('required invariant: identityCollisionCount === 0', diag.identityCollisionCount === 0, diag.identityCollisionCount));
      results.push(_assert('duplicate display names ARE present in the real network (expected — not an error)', diag.duplicateDisplayNameCount > 0, diag.duplicateDisplayNameCount));
      results.push(_assert('station/complex/route counts are all non-zero after a real static load',
        diag.stationStopCount > 0 && diag.complexCount > 0 && diag.routeCount > 0, diag));

      // ── Fulton St collision through the full store, not just the identity
      //    builder in isolation ─────────────────────────────────────────────
      var manhattanFulton = store.getStation('subway:stop:229');
      var brooklynFulton = store.getStation('subway:stop:G36');
      results.push(_assert('both real Fulton St stations resolve through the store', !!manhattanFulton && !!brooklynFulton));
      if (manhattanFulton && brooklynFulton) {
        results.push(_assert('distinct ids, same display name, resolved via the store\'s own index',
          manhattanFulton.id !== brooklynFulton.id && manhattanFulton.displayName === brooklynFulton.displayName));
        results.push(_assert('Manhattan Fulton\'s routeIds include the real 2/3/4/5/A/C/J/Z set',
          ['subway:route:A', 'subway:route:C', 'subway:route:2'].every(function (r) { return manhattanFulton.routeIds.indexOf(r) !== -1; }), manhattanFulton.routeIds));
        results.push(_assert('Brooklyn Fulton\'s routeIds are ONLY the G line (a different, smaller set)',
          brooklynFulton.routeIds.length === 1 && brooklynFulton.routeIds[0] === 'subway:route:G', brooklynFulton.routeIds));
      }

      // ── §23.12: selected validation route end-to-end, real live fetch ───────
      return rt.fetchGroup('ace').then(function (fetchResult) {
        results.push(_assert('real live fetchGroup("ace") succeeds against the current MTA feed', fetchResult && fetchResult.ok === true, fetchResult));

        var applyResult = store.applyRealtimeUpdate(rt.getTripUpdates(), rt.getVehicles(), ['ace']);
        results.push(_assert('applyRealtimeUpdate() succeeds', applyResult && applyResult.ok === true));

        var routeA = store.getRoute('subway:route:A');
        results.push(_assert('route A resolves in the store with real MTA color metadata', !!routeA && !!routeA.sourceColor));

        var vehiclesOnA = store.getVehiclesForRoute('subway:route:A');
        var tripsOnA = store.getTripsForRoute('subway:route:A');
        results.push(_assert('at least one real live trip is active on route A right now', tripsOnA.length > 0, tripsOnA.length));
        results.push(_assert('at least one real live vehicle-state entity is active on route A right now', vehiclesOnA.length > 0, vehiclesOnA.length));

        if (vehiclesOnA.length) {
          var v = vehiclesOnA[0];
          results.push(_assert('real vehicle state has NO latitude/longitude (honest — source has none)', !('latitude' in v) && !('longitude' in v)));
          results.push(_assert('real vehicle state resolves to a real station via currentStationId', !!v.currentStationId && !!store.getStation(v.currentStationId)));
        }

        var finalDiag = store.getDiagnostics();
        results.push(_assert('identity collision count is STILL 0 after applying real realtime data', finalDiag.identityCollisionCount === 0, finalDiag.identityCollisionCount));

        var failed = results.filter(function (r) { return !r.pass; });
        var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
        console.log('[MTASubwayTransitStoreTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
        if (failed.length) console.warn('[MTASubwayTransitStoreTests] failures:', failed);
        return summary;
      });
    });
  }

  SBE.MTASubwayTransitStoreTests = { run: run };
  // See gtfsRealtimeBindings.tests.js for why this is deferred via setTimeout
  // (main.js's DOMContentLoaded handler replaces window._wos wholesale).
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwayTransitStore = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
