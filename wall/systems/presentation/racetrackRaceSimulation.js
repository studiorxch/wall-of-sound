// ── RacetrackRaceSimulation v1.0.0 ────────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: presentation / racetrack-race-simulation
//
// Pure, deterministic per-racer pace simulation — no DOM, no THREE, no
// Math.random() anywhere in this file. Every racer's randomness comes from
// its own seeded stream, keyed by `raceInput.seed + coursePackage fingerprint
// + sorted roster IDs + competitor id` — deliberately NEVER `sessionId` or
// `attemptId` (0806C decision #9), so re-running the identical frozen race
// input with the identical seed always produces the identical simulation,
// regardless of which execution attempt it is.
//
// The first implementation uses controlled deterministic pace variation
// (periodic seeded re-rolls of a target speed, eased toward over time), not
// physics — per spec. Pace-reroll timing is keyed off simulation time
// (elapsedSimulationMsAtStepStart), never wall-clock/frame-count, so the
// exact same sequence of fixed steps always produces the exact same sequence
// of PRNG draws.
//
// Load: after racetrackRaceCourseSampler.js, before racetrackRaceRuntime.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Seeded PRNG (cyrb53 string hash -> mulberry32) ─────────────────────────
  // Small, dependency-free, deterministic. Not cryptographic — doesn't need
  // to be.
  function _cyrb53(str, seed) {
    var h1 = 0xdeadbeef ^ seed;
    var h2 = 0x41c6ce57 ^ seed;
    for (var i = 0; i < str.length; i++) {
      var ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  // Returns a () -> [0,1) function. Same seedString always produces the same
  // infinite draw sequence.
  function createSeededRandom(seedString) {
    var hash = _cyrb53(String(seedString), 0);
    var state = (hash >>> 0) || 1; // mulberry32 needs a non-zero starting state
    return function () {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function _streamKey(raceInput, competitorId) {
    return raceInput.seed + '|' + raceInput.coursePackageRef.fingerprint + '|' +
      raceInput.rosterIds.slice().sort().join(',') + '|' + competitorId;
  }

  // ── Pace model tuning ───────────────────────────────────────────────────────
  var BASE_DURATION_SECONDS = 26; // a speedFactor-1.0 racer covers the full course in ~this long
  var PACE_MIN_FACTOR = 0.85;
  var PACE_MAX_FACTOR = 1.15;
  var PACE_INTERVAL_MS = 4000; // re-roll target speed roughly every 4 simulated seconds
  var ACCEL_FACTOR = 1.5; // acceleration toward target speed, as a multiple of base speed per second

  // opts: raceInput = {
  //   sessionId, attemptId, seed, coursePackageRef:{id,version,fingerprint},
  //   rosterIds: string[], competitors: [{id,name,team,orbProfileId}, ...],
  //   totalDistanceMeters, coursePackage,
  // }
  // Returns one RacerRuntimeState per competitor (public shape:
  // {competitorId, status, progress01, distanceMeters, speed, targetSpeed,
  // finishTimeMs} — plus module-private `_rng`/`_baseSpeed`/`_accel`/
  // `_nextPaceRerollMs` fields stepRacers() relies on internally).
  function initializeRacers(raceInput) {
    var total = raceInput.totalDistanceMeters;
    var baseSpeedForTarget = total / BASE_DURATION_SECONDS;

    return raceInput.competitors.map(function (competitor) {
      var rng = createSeededRandom(_streamKey(raceInput, competitor.id));
      var speedFactor = PACE_MIN_FACTOR + rng() * (PACE_MAX_FACTOR - PACE_MIN_FACTOR);
      var baseSpeed = baseSpeedForTarget * speedFactor;
      var firstRerollJitterMs = rng() * PACE_INTERVAL_MS;

      return {
        competitorId: competitor.id,
        status: 'racing',
        progress01: 0,
        distanceMeters: 0,
        speed: 0,
        targetSpeed: baseSpeed,
        finishTimeMs: null,
        _rng: rng,
        _baseSpeed: baseSpeed,
        _accel: baseSpeed * ACCEL_FACTOR,
        _nextPaceRerollMs: firstRerollJitterMs,
      };
    });
  }

  // Advances every racer still status:'racing' by exactly one fixed step.
  // `elapsedSimulationMsAtStepStart` is the simulation clock reading BEFORE
  // this step is applied — pace rerolls and interpolated crossing times are
  // both computed relative to it, never to wall-clock time.
  //
  // On a racer crossing progress01 >= 1 this step: computes the fractional
  // point within the step where the crossing actually happened (linear
  // interpolation over the step's own distance delta), so two racers
  // crossing within the SAME fixed step still get distinguishable,
  // correctly-ordered `finishTimeMs` values (0806C decision #11) rather than
  // both being stamped with the step's coarse end time. Does NOT assign
  // `placement` — that depends on classifying every racer at once, once the
  // race is fully over (see racetrackRaceRanking.classifyFinalResults) — and
  // does not skip any other still-racing racer regardless of who has already
  // finished, so grace-period stragglers keep advancing normally.
  function stepRacers(racers, raceInput, dtSeconds, elapsedSimulationMsAtStepStart) {
    var total = raceInput.totalDistanceMeters;
    var dtMs = dtSeconds * 1000;

    for (var i = 0; i < racers.length; i++) {
      var r = racers[i];
      if (r.status !== 'racing') continue;

      while (elapsedSimulationMsAtStepStart >= r._nextPaceRerollMs) {
        var roll = r._rng();
        r.targetSpeed = r._baseSpeed * (PACE_MIN_FACTOR + roll * (PACE_MAX_FACTOR - PACE_MIN_FACTOR));
        r._nextPaceRerollMs += PACE_INTERVAL_MS;
      }

      var maxDelta = r._accel * dtSeconds;
      var diff = r.targetSpeed - r.speed;
      if (diff > maxDelta) diff = maxDelta;
      else if (diff < -maxDelta) diff = -maxDelta;
      r.speed = Math.max(0, r.speed + diff);

      var prevDistance = r.distanceMeters;
      var newDistance = prevDistance + r.speed * dtSeconds;

      if (total > 0 && newDistance >= total) {
        var stepDistance = newDistance - prevDistance;
        var overshootDistance = newDistance - total;
        var crossingFraction = stepDistance > 1e-9 ? Math.max(0, Math.min(1, 1 - overshootDistance / stepDistance)) : 1;

        r.distanceMeters = total;
        r.progress01 = 1;
        r.status = 'finished';
        r.finishTimeMs = elapsedSimulationMsAtStepStart + crossingFraction * dtMs;
      } else {
        r.distanceMeters = newDistance;
        r.progress01 = total > 0 ? newDistance / total : 0;
      }
    }
  }

  SBE.RacetrackRaceSimulation = Object.freeze({
    VERSION: VERSION,
    createSeededRandom: createSeededRandom,
    initializeRacers: initializeRacers,
    stepRacers: stepRacers,
  });

  console.log('[RacetrackRaceSimulation] v' + VERSION + ' loaded');

})(window);
