// ── RacetrackRaceRanking Tests v1.0.0 ─────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.racetrackRaceRanking.runTests()
//
// Placement: wall/systems/presentation/racetrackRaceRanking.tests.js
// Load: AFTER racetrackRaceRanking.js. Not required for production.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  async function run() {
    var ranking = SBE.RacetrackRaceRanking;
    var results = [];

    if (!ranking) {
      results.push(_assert('SBE.RacetrackRaceRanking is available', false));
      console.log('[RacetrackRaceRankingTests] FAIL — module not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // ── computeRanking: live ordering ──────────────────────────────────────
    (function () {
      var racers = [
        { competitorId: 'C', status: 'racing', progress01: 0.4, finishTimeMs: null },
        { competitorId: 'A', status: 'finished', progress01: 1, finishTimeMs: 5000 },
        { competitorId: 'B', status: 'racing', progress01: 0.7, finishTimeMs: null },
        { competitorId: 'D', status: 'finished', progress01: 1, finishTimeMs: 3000 },
      ];
      var order = ranking.computeRanking(racers);
      var ids = order.map(function (e) { return e.competitorId; });
      results.push(_assert('computeRanking: finished racers rank ahead of racing racers, ordered by finishTimeMs ascending',
        ids[0] === 'D' && ids[1] === 'A', ids));
      results.push(_assert('computeRanking: racing racers rank by progress01 descending',
        ids[2] === 'B' && ids[3] === 'C', ids));
      results.push(_assert('computeRanking: rank field is 1-based and matches array order',
        order[0].rank === 1 && order[3].rank === 4, order.map(function (e) { return e.rank; })));
    })();

    (function () {
      var racers = [
        { competitorId: 'Z', status: 'racing', progress01: 0.5, finishTimeMs: null },
        { competitorId: 'A', status: 'racing', progress01: 0.5, finishTimeMs: null },
      ];
      var order = ranking.computeRanking(racers);
      results.push(_assert('computeRanking: equal-progress racing racers tie-break by competitor id',
        order[0].competitorId === 'A' && order[1].competitorId === 'Z', order.map(function (e) { return e.competitorId; })));
    })();

    // ── classifyFinalResults: DNF classification + placement ordering ──────
    (function () {
      var racers = [
        { competitorId: 'A', status: 'finished', progress01: 1, distanceMeters: 1000, finishTimeMs: 4000 },
        { competitorId: 'B', status: 'racing', progress01: 0.6, distanceMeters: 600 },
        { competitorId: 'C', status: 'finished', progress01: 1, distanceMeters: 1000, finishTimeMs: 2000 },
        { competitorId: 'D', status: 'racing', progress01: 0.8, distanceMeters: 800 },
      ];
      var classified = ranking.classifyFinalResults(racers, 16000);
      var byId = {};
      classified.forEach(function (e) { byId[e.competitorId] = e; });

      results.push(_assert('classifyFinalResults: still-racing racers become did_not_finish',
        byId.B.status === 'did_not_finish' && byId.D.status === 'did_not_finish'));
      results.push(_assert('classifyFinalResults: DNF racers get the exact passed dnfTerminalSimMs, not a live reading',
        byId.B.terminalSimulationMs === 16000 && byId.D.terminalSimulationMs === 16000));
      results.push(_assert('classifyFinalResults: DNF terminalReason is grace_period_expired',
        byId.B.terminalReason === 'grace_period_expired'));
      results.push(_assert('classifyFinalResults: finishers get terminalReason finished, terminalSimulationMs = their own finishTimeMs',
        byId.C.terminalReason === 'finished' && byId.C.terminalSimulationMs === 2000));

      results.push(_assert('classifyFinalResults: finishers placed 1..K by finishTimeMs ascending',
        byId.C.placement === 1 && byId.A.placement === 2, { C: byId.C.placement, A: byId.A.placement }));
      results.push(_assert('classifyFinalResults: DNF racers placed after all finishers, by progress01 descending',
        byId.D.placement === 3 && byId.B.placement === 4, { D: byId.D.placement, B: byId.B.placement }));

      var placements = classified.map(function (e) { return e.placement; }).slice().sort(function (a, b) { return a - b; });
      results.push(_assert('classifyFinalResults: every placement is unique and forms a contiguous 1..N run',
        JSON.stringify(placements) === JSON.stringify([1, 2, 3, 4]), placements));
    })();

    // ── Early-exhaustion: when nobody is left racing, dnfTerminalSimMs is
    // irrelevant — the result is identical regardless of its value ─────────
    (function () {
      var racersBase = function () {
        return [
          { competitorId: 'A', status: 'finished', progress01: 1, distanceMeters: 1000, finishTimeMs: 4000 },
          { competitorId: 'B', status: 'finished', progress01: 1, distanceMeters: 1000, finishTimeMs: 2000 },
        ];
      };
      var early = ranking.classifyFinalResults(racersBase(), 9999);
      var late = ranking.classifyFinalResults(racersBase(), 16000);
      var same = early.every(function (e, i) {
        return e.competitorId === late[i].competitorId && e.placement === late[i].placement && e.status === 'did_not_finish' === (late[i].status === 'did_not_finish');
      });
      results.push(_assert('early-exhaustion: an all-finished roster produces zero DNF entries regardless of dnfTerminalSimMs',
        early.every(function (e) { return e.status === 'finished'; }) && same, early));
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[RacetrackRaceRankingTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[RacetrackRaceRankingTests] failures:', failed);

    return summary;
  }

  SBE.RacetrackRaceRankingTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.racetrackRaceRanking = { runTests: run };

})(window);
