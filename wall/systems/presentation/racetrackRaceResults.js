// ── RacetrackRaceResults v1.0.0 ───────────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: presentation / racetrack-race-results
//
// Pure construction of the immutable, transient RacetrackRaceResult — never
// persisted (no IndexedDB, no Lobby-snapshot write; the architecture doc
// explicitly prohibits adding permanent result history to Lobby snapshots).
// Held only in racetrackRaceRuntime.js's own module state until resetRace()
// clears it.
//
// Load: after racetrackRaceRanking.js, before racetrackRaceRuntime.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _deepFreeze(value) {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.getOwnPropertyNames(value).forEach(function (key) {
      _deepFreeze(value[key]);
    });
    return Object.freeze(value);
  }

  // opts: {
  //   sessionId, attemptId,       // 0806C decision #1 — frozen-session vs
  //                                // execution-attempt identity, neither
  //                                // influences the simulation
  //   seed, coursePackageRef,     // {id, version, fingerprint}
  //   startedAt, completedAt,     // Date.now()-style real timestamps
  //   winnerCompetitorId,
  //   finishOrder,                // the already-classified array from
  //                                // racetrackRaceRanking.classifyFinalResults()
  // }
  // Returns a deep-frozen plain object — a fresh copy, never aliasing the
  // caller's `finishOrder` array/entries.
  function buildRaceResult(opts) {
    var result = {
      sessionId: opts.sessionId,
      attemptId: opts.attemptId,
      seed: opts.seed,
      coursePackageRef: {
        id: opts.coursePackageRef.id,
        version: opts.coursePackageRef.version,
        fingerprint: opts.coursePackageRef.fingerprint,
      },
      startedAt: opts.startedAt,
      completedAt: opts.completedAt,
      winnerCompetitorId: opts.winnerCompetitorId,
      finishOrder: opts.finishOrder.map(function (entry) {
        return {
          competitorId: entry.competitorId,
          status: entry.status,
          placement: entry.placement,
          finishTimeMs: entry.finishTimeMs,
          progress01: entry.progress01,
          distanceMeters: entry.distanceMeters,
          terminalSimulationMs: entry.terminalSimulationMs,
          terminalReason: entry.terminalReason,
        };
      }),
    };
    return _deepFreeze(result);
  }

  SBE.RacetrackRaceResults = Object.freeze({
    VERSION: VERSION,
    buildRaceResult: buildRaceResult,
  });

  console.log('[RacetrackRaceResults] v' + VERSION + ' loaded');

})(window);
