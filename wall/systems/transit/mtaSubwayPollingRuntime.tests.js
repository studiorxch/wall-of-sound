// ── MTASubwayPollingRuntime Tests v1.0.0 ──────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Required Tests §23.7, §23.9, §23.10
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.mtaSubwayPollingRuntime.runTests()
// Covers: one-in-flight overlap guard, last-known-valid preservation on a
// forced failure, and stale-state transition. Uses real live fetches against
// the current MTA feed (not mocked network) — the same convention this
// codebase's own test harnesses use elsewhere (no CI mock layer exists for
// wall/). A `window.fetch` override is used ONLY to deterministically force
// one failure mid-test (there is no other way to make a real, healthy public
// endpoint fail on demand); it is always restored in a finally block.
//
// Placement: wall/systems/transit/mtaSubwayPollingRuntime.tests.js
// Load: AFTER mtaSubwayPollingRuntime.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var poll = SBE.MTASubwayPollingRuntime;
    var store = SBE.MTASubwayTransitStore;
    var results = [];
    if (!poll || !store) {
      results.push(_assert('SBE.MTASubwayPollingRuntime and MTASubwayTransitStore are loaded', false));
      return Promise.resolve({ ok: false, total: 1, failed: 1, results: results });
    }

    return store.loadStatic().then(function () {
      return poll.pollNow(); // real live success #1 — establishes a baseline
    }).then(function (r1) {
      results.push(_assert('a real live poll succeeds', r1 && r1.ok === true, r1));

      // ── §23.7: one-in-flight overlap guard ───────────────────────────────
      var before = poll.getState().overlapSkipCount;
      return Promise.all([poll.pollNow(), poll.pollNow()]).then(function (pair) {
        var after = poll.getState().overlapSkipCount;
        var oneOk = pair.filter(function (r) { return r && r.ok; }).length === 1;
        var oneSkipped = pair.filter(function (r) { return r && r.skipped; }).length === 1;
        results.push(_assert('firing two pollNow() concurrently: exactly one succeeds and one is overlap-skipped', oneOk && oneSkipped, pair));
        results.push(_assert('overlapSkipCount incremented by exactly 1', after === before + 1, { before: before, after: after }));

        // ── §23.9 / §23.10: forced failure preserves last-known-valid state,
        //    and staleness only trips after staleAfterMs, not immediately ──────
        var vehicleCountBefore = store.getDiagnostics().vehicleCount;
        var realFetch = global.fetch;
        global.fetch = function () { return Promise.reject(new Error('simulated_test_failure')); };

        return poll.pollNow().then(function (forcedFail) {
          global.fetch = realFetch; // restore immediately — never leave the page without real fetch
          results.push(_assert('a forced network failure is reported as !ok', forcedFail && forcedFail.ok === false, forcedFail));

          var vehicleCountAfter = store.getDiagnostics().vehicleCount;
          results.push(_assert('vehicle count in the store is UNCHANGED after the failed poll (last-known-valid preserved)',
            vehicleCountBefore === vehicleCountAfter, { before: vehicleCountBefore, after: vehicleCountAfter }));

          var stateAfterFailure = poll.getState();
          results.push(_assert('consecutiveFailures incremented', stateAfterFailure.consecutiveFailures >= 1, stateAfterFailure.consecutiveFailures));
          results.push(_assert('NOT yet reported stale immediately after one failure (lastSuccessAt is still recent)', stateAfterFailure.stale === false, stateAfterFailure));

          // Recovery: the next real poll succeeds and resets consecutiveFailures.
          return poll.pollNow().then(function (recovered) {
            results.push(_assert('the next real poll recovers successfully', recovered && recovered.ok === true, recovered));
            results.push(_assert('consecutiveFailures resets to 0 on recovery', poll.getState().consecutiveFailures === 0));

            var failed = results.filter(function (r) { return !r.pass; });
            var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
            console.log('[MTASubwayPollingRuntimeTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
            if (failed.length) console.warn('[MTASubwayPollingRuntimeTests] failures:', failed);
            return summary;
          });
        }).catch(function (e) {
          global.fetch = realFetch; // restore even if something above threw
          throw e;
        });
      });
    });
  }

  SBE.MTASubwayPollingRuntimeTests = { run: run };
  // See gtfsRealtimeBindings.tests.js for why this is deferred via setTimeout
  // (main.js's DOMContentLoaded handler replaces window._wos wholesale).
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.mtaSubwayPollingRuntime = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
