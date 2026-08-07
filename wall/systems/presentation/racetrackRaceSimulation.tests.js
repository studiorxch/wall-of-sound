// ── RacetrackRaceSimulation Tests v1.0.0 ──────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: test-harness (dependency-free)
//
// Run via: _wos.debug.racetrackRaceSimulation.runTests()
//
// Placement: wall/systems/presentation/racetrackRaceSimulation.tests.js
// Load: AFTER racetrackRaceSimulation.js. Not required for production.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _approx(a, b, tol) {
    return Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
  }

  function _fixtureRaceInput(extra) {
    var base = {
      seed: 'seedA',
      coursePackageRef: { id: 'pkg1', version: 1, fingerprint: 'fp1' },
      rosterIds: ['c1', 'c2', 'c3'],
      competitors: [
        { id: 'c1', name: 'Alpha', team: 'T1', orbProfileId: 'orb1' },
        { id: 'c2', name: 'Bravo', team: 'T2', orbProfileId: 'orb2' },
        { id: 'c3', name: 'Charlie', team: 'T3', orbProfileId: 'orb3' },
      ],
      totalDistanceMeters: 2000,
    };
    return Object.assign({}, base, extra || {});
  }

  function _runFixedSteps(sim, racers, raceInput, steps, stepMs) {
    var elapsed = 0;
    for (var i = 0; i < steps; i++) {
      sim.stepRacers(racers, raceInput, stepMs / 1000, elapsed);
      elapsed += stepMs;
    }
    return elapsed;
  }

  async function run() {
    var sim = SBE.RacetrackRaceSimulation;
    var results = [];

    if (!sim) {
      results.push(_assert('SBE.RacetrackRaceSimulation is available', false));
      console.log('[RacetrackRaceSimulationTests] FAIL — module not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // ── createSeededRandom determinism ─────────────────────────────────────
    (function () {
      var a = sim.createSeededRandom('same-seed');
      var b = sim.createSeededRandom('same-seed');
      var seqA = [a(), a(), a()];
      var seqB = [b(), b(), b()];
      results.push(_assert('createSeededRandom: identical seed produces an identical draw sequence',
        seqA[0] === seqB[0] && seqA[1] === seqB[1] && seqA[2] === seqB[2], { seqA: seqA, seqB: seqB }));

      var c = sim.createSeededRandom('different-seed');
      results.push(_assert('createSeededRandom: a different seed produces a different first draw', c() !== seqA[0]));
    })();

    // ── initializeRacers determinism, and attemptId is genuinely excluded ──
    (function () {
      var inputA = _fixtureRaceInput({ attemptId: 'attempt-A' });
      var inputB = _fixtureRaceInput({ attemptId: 'attempt-B' });
      var racersA = sim.initializeRacers(inputA);
      var racersB = sim.initializeRacers(inputB);
      var identical = racersA.every(function (r, i) {
        return r.targetSpeed === racersB[i].targetSpeed && r.competitorId === racersB[i].competitorId;
      });
      results.push(_assert('initializeRacers: identical seed/fingerprint/roster but DIFFERENT attemptId produces identical initial racer state',
        identical, { racersA: racersA.map(function (r) { return r.targetSpeed; }), racersB: racersB.map(function (r) { return r.targetSpeed; }) }));

      var inputDiffSeed = _fixtureRaceInput({ seed: 'seedB' });
      var racersDiffSeed = sim.initializeRacers(inputDiffSeed);
      results.push(_assert('initializeRacers: a genuinely different seed produces different initial speeds',
        racersDiffSeed[0].targetSpeed !== racersA[0].targetSpeed));
    })();

    // ── stepRacers: interpolated crossing time, no placement assigned ──────
    (function () {
      var raceInput = _fixtureRaceInput({ totalDistanceMeters: 1000 });
      var racer = {
        competitorId: 'c1', status: 'racing', progress01: 0.99, distanceMeters: 990,
        speed: 100, targetSpeed: 100, finishTimeMs: null,
        _rng: function () { return 0.5; }, _baseSpeed: 100, _accel: 100000, _nextPaceRerollMs: Infinity,
      };
      sim.stepRacers([racer], raceInput, 1, 5000);
      results.push(_assert('stepRacers: a racer that overshoots this step is marked finished', racer.status === 'finished'));
      results.push(_assert('stepRacers: progress/distance clamp exactly to 1/total on finish', racer.progress01 === 1 && racer.distanceMeters === 1000));
      results.push(_assert('stepRacers: finishTimeMs is interpolated within the step, not the step end time',
        _approx(racer.finishTimeMs, 5100, 1), racer.finishTimeMs));
      results.push(_assert('stepRacers: does not assign a placement field', racer.placement === undefined));
    })();

    // ── stepRacers: same-step multi-finish gets distinct, correctly-ordered
    // interpolated finish times ─────────────────────────────────────────────
    (function () {
      var raceInput = _fixtureRaceInput({ totalDistanceMeters: 1000 });
      var racerA = {
        competitorId: 'A', status: 'racing', progress01: 0.95, distanceMeters: 950,
        speed: 100, targetSpeed: 100, finishTimeMs: null,
        _rng: function () { return 0.5; }, _baseSpeed: 100, _accel: 100000, _nextPaceRerollMs: Infinity,
      };
      var racerB = {
        competitorId: 'B', status: 'racing', progress01: 0.99, distanceMeters: 990,
        speed: 50, targetSpeed: 50, finishTimeMs: null,
        _rng: function () { return 0.5; }, _baseSpeed: 50, _accel: 100000, _nextPaceRerollMs: Infinity,
      };
      sim.stepRacers([racerA, racerB], raceInput, 1, 2000);
      results.push(_assert('same-step multi-finish: both racers finish this step', racerA.status === 'finished' && racerB.status === 'finished'));
      results.push(_assert('same-step multi-finish: finish times are distinct and correctly ordered',
        racerB.finishTimeMs < racerA.finishTimeMs, { a: racerA.finishTimeMs, b: racerB.finishTimeMs }));
    })();

    // ── Full-run determinism: identical seed/fingerprint/roster over many
    // fixed steps produces byte-identical outcomes, regardless of attemptId ──
    (function () {
      var inputA = _fixtureRaceInput({ attemptId: 'attempt-1', totalDistanceMeters: 400 });
      var inputB = _fixtureRaceInput({ attemptId: 'attempt-2', totalDistanceMeters: 400 });
      var racersA = sim.initializeRacers(inputA);
      var racersB = sim.initializeRacers(inputB);
      _runFixedSteps(sim, racersA, inputA, 600, 1000 / 60);
      _runFixedSteps(sim, racersB, inputB, 600, 1000 / 60);

      var identical = racersA.every(function (r, i) {
        return r.status === racersB[i].status &&
          r.progress01 === racersB[i].progress01 &&
          r.finishTimeMs === racersB[i].finishTimeMs;
      });
      results.push(_assert('full-run determinism: identical inputs (differing only in attemptId) over many fixed steps produce identical outcomes',
        identical, { a: racersA.map(function (r) { return { status: r.status, finishTimeMs: r.finishTimeMs }; }) }));
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[RacetrackRaceSimulationTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[RacetrackRaceSimulationTests] failures:', failed);

    return summary;
  }

  SBE.RacetrackRaceSimulationTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.racetrackRaceSimulation = { runTests: run };

})(window);
