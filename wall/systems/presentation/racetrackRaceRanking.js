// ── RacetrackRaceRanking v1.0.0 ───────────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: presentation / racetrack-race-ranking
//
// Pure ranking/classification logic — no DOM, no mutation of its inputs, no
// simulation-time math of its own (the runtime is responsible for only ever
// calling classifyFinalResults() once the simulation clock has already
// landed exactly on the grace deadline — see racetrackRaceRuntime.js).
//
// Two distinct functions:
//
//   computeRanking(racers)
//     LIVE leaderboard ordering, used continuously during `running`/the
//     grace window. Does not assign final placements — just an ordering for
//     display.
//
//   classifyFinalResults(racers, dnfTerminalSimMs)
//     The one-time FINAL classification, called exactly once at grace-period
//     expiry (or early-exhaustion). Assigns real placements.
//
// Load: after racetrackRaceSimulation.js, before racetrackRaceResults.js and
// racetrackRaceRuntime.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _compareIds(a, b) {
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  // Live ordering: finished racers by finishTimeMs ascending, then racing
  // racers by progress01 descending, stable tie-break by competitor id.
  // Returns a NEW array of lightweight ranking entries
  // {competitorId, rank, status, progress01, finishTimeMs} — never mutates
  // or exposes the internal RacerRuntimeState objects (e.g. their `_rng`).
  function computeRanking(racers) {
    var copy = racers.slice();
    copy.sort(function (a, b) {
      var aFinished = a.status === 'finished';
      var bFinished = b.status === 'finished';
      if (aFinished && bFinished) {
        if (a.finishTimeMs !== b.finishTimeMs) return a.finishTimeMs - b.finishTimeMs;
        return _compareIds(a.competitorId, b.competitorId);
      }
      if (aFinished !== bFinished) return aFinished ? -1 : 1;
      if (a.progress01 !== b.progress01) return b.progress01 - a.progress01;
      return _compareIds(a.competitorId, b.competitorId);
    });
    return copy.map(function (r, idx) {
      return {
        competitorId: r.competitorId,
        rank: idx + 1,
        status: r.status,
        progress01: r.progress01,
        finishTimeMs: r.finishTimeMs,
      };
    });
  }

  // One-time final classification. Any racer still status:'racing' becomes
  // status:'did_not_finish' with terminalReason:'grace_period_expired' and
  // terminalSimulationMs set to the caller-supplied `dnfTerminalSimMs`
  // (the runtime must pass the exact simulation-time instant classification
  // is happening at — reached via a deadline-clamped final step, never a
  // later live clock reading, per 0806C decision #8's correction). Finishers
  // get terminalReason:'finished', terminalSimulationMs = their own
  // (already interpolated) finishTimeMs.
  //
  // Placement: finishers ordered by finishTimeMs ascending get 1..K, then
  // DNF racers ordered by progress01 descending (stable tie-break by id) get
  // K+1..N. Returns a NEW fully classified array (does not mutate `racers`),
  // ready for racetrackRaceResults.buildRaceResult().
  function classifyFinalResults(racers, dnfTerminalSimMs) {
    var finishers = [];
    var dnf = [];

    for (var i = 0; i < racers.length; i++) {
      var r = racers[i];
      if (r.status === 'finished') {
        finishers.push({
          competitorId: r.competitorId,
          status: 'finished',
          placement: null,
          finishTimeMs: r.finishTimeMs,
          progress01: r.progress01,
          distanceMeters: r.distanceMeters,
          terminalSimulationMs: r.finishTimeMs,
          terminalReason: 'finished',
        });
      } else {
        dnf.push({
          competitorId: r.competitorId,
          status: 'did_not_finish',
          placement: null,
          finishTimeMs: null,
          progress01: r.progress01,
          distanceMeters: r.distanceMeters,
          terminalSimulationMs: dnfTerminalSimMs,
          terminalReason: 'grace_period_expired',
        });
      }
    }

    finishers.sort(function (a, b) {
      if (a.finishTimeMs !== b.finishTimeMs) return a.finishTimeMs - b.finishTimeMs;
      return _compareIds(a.competitorId, b.competitorId);
    });
    dnf.sort(function (a, b) {
      if (a.progress01 !== b.progress01) return b.progress01 - a.progress01;
      return _compareIds(a.competitorId, b.competitorId);
    });

    var placement = 1;
    finishers.forEach(function (e) { e.placement = placement++; });
    dnf.forEach(function (e) { e.placement = placement++; });

    return finishers.concat(dnf);
  }

  SBE.RacetrackRaceRanking = Object.freeze({
    VERSION: VERSION,
    computeRanking: computeRanking,
    classifyFinalResults: classifyFinalResults,
  });

  console.log('[RacetrackRaceRanking] v' + VERSION + ' loaded');

})(window);
