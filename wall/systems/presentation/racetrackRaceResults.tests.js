// ── RacetrackRaceResults Tests v1.0.0 ─────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.racetrackRaceResults.runTests()
//
// Placement: wall/systems/presentation/racetrackRaceResults.tests.js
// Load: AFTER racetrackRaceResults.js. Not required for production.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _fixtureOpts() {
    return {
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      seed: 'seedA',
      coursePackageRef: { id: 'pkg1', version: 1, fingerprint: 'fp1' },
      startedAt: 1000,
      completedAt: 20000,
      winnerCompetitorId: 'A',
      finishOrder: [
        { competitorId: 'A', status: 'finished', placement: 1, finishTimeMs: 4000, progress01: 1, distanceMeters: 1000, terminalSimulationMs: 4000, terminalReason: 'finished' },
        { competitorId: 'B', status: 'did_not_finish', placement: 2, finishTimeMs: null, progress01: 0.6, distanceMeters: 600, terminalSimulationMs: 16000, terminalReason: 'grace_period_expired' },
      ],
    };
  }

  async function run() {
    var mod = SBE.RacetrackRaceResults;
    var results = [];

    if (!mod) {
      results.push(_assert('SBE.RacetrackRaceResults is available', false));
      console.log('[RacetrackRaceResultsTests] FAIL — module not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    (function () {
      var opts = _fixtureOpts();
      var result = mod.buildRaceResult(opts);

      results.push(_assert('buildRaceResult: carries sessionId and attemptId as distinct fields',
        result.sessionId === 'session-1' && result.attemptId === 'attempt-1'));
      results.push(_assert('buildRaceResult: carries the exact coursePackageRef', result.coursePackageRef.fingerprint === 'fp1'));
      results.push(_assert('buildRaceResult: preserves finishOrder length and order', result.finishOrder.length === 2 && result.finishOrder[0].competitorId === 'A'));

      results.push(_assert('buildRaceResult: the returned object is frozen', Object.isFrozen(result)));
      results.push(_assert('buildRaceResult: nested coursePackageRef is frozen', Object.isFrozen(result.coursePackageRef)));
      results.push(_assert('buildRaceResult: finishOrder array is frozen', Object.isFrozen(result.finishOrder)));
      results.push(_assert('buildRaceResult: each finishOrder entry is frozen', Object.isFrozen(result.finishOrder[0])));

      results.push(_assert('buildRaceResult: finishOrder entries are fresh copies, not aliasing the caller\'s objects',
        result.finishOrder[0] !== opts.finishOrder[0]));

      opts.finishOrder[0].placement = 999; // mutate the ORIGINAL input after building
      results.push(_assert('buildRaceResult: mutating the caller\'s original input after the fact does not affect the built result',
        result.finishOrder[0].placement === 1));
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[RacetrackRaceResultsTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[RacetrackRaceResultsTests] failures:', failed);

    return summary;
  }

  SBE.RacetrackRaceResultsTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.racetrackRaceResults = { runTests: run };

})(window);
