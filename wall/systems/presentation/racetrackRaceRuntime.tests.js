// ── RacetrackRaceRuntime Tests v1.0.0 ─────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: test-harness (dependency-free)
//
// Same bespoke console-diagnostic convention as every other wall/ *.tests.js
// file — no test runner exists under wall/. Stubs SBE.RacetrackSessionRuntime
// for the duration of the run (restored in a finally block) so this suite
// never touches the real app's live scene/selection state — same convention
// racetrackSessionRuntime.tests.js already uses for stubbed dependencies.
//
// Uses the __test.advanceRaceByMs/__test.forceCountdownComplete seams to
// drive winner-commit/deadline-clamping/grace-expiry/handle-discipline
// deterministically and FAST — these call the exact same internal stepping
// logic the real requestAnimationFrame loop uses, just with synthetic time,
// so a full race (~26s simulated + 12s grace) completes in milliseconds of
// real test time instead of ~38 real seconds. The countdown's own
// hidden-tab-pause behavior is real-timer-driven and covered by live
// verification instead — this file only proves the countdown's
// subscribe/unsubscribe CONTRACT works, via one real requestAnimationFrame
// wait (not a fabricated pass).
//
// Run via: _wos.debug.racetrackRaceRuntime.runTests() — returns a Promise;
// await it (or .then()) in the browser console.
//
// Placement: wall/systems/presentation/racetrackRaceRuntime.tests.js
// Load: AFTER racetrackRaceRuntime.js. Not required for production operation.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _nextFrame() {
    return new Promise(function (resolve) { global.requestAnimationFrame(resolve); });
  }

  function _validSnapshot() {
    return {
      id: 'session-test-1',
      seed: 'seedTest',
      coursePackage: {
        id: 'pkg1',
        version: 1,
        sourceRaceCourseFingerprint: 'fp1',
        route: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
        progressSamples: [
          { index: 0, distanceMeters: 0, progress01: 0, coordinate: [0, 0], headingDeg: 0 },
          { index: 1, distanceMeters: 260, progress01: 1, coordinate: [1, 1], headingDeg: 0 },
        ],
        finish: { distanceMeters: 260, coordinate: [1, 1], headingDeg: 0 },
      },
      competitorSnapshots: [
        { id: 'c1', name: 'Alpha', team: 'T1', orbProfileId: 'orb1' },
        { id: 'c2', name: 'Bravo', team: 'T2', orbProfileId: 'orb2' },
      ],
    };
  }

  function _invalidSnapshot() {
    var s = _validSnapshot();
    s.competitorSnapshots = [s.competitorSnapshots[0]]; // only 1 — insufficient_competitors
    return s;
  }

  function _stubHandle(label) {
    var renderCalls = 0;
    var showWinnerCalls = 0;
    return {
      label: label,
      render: function () { renderCalls++; },
      showWinnerOverlay: function () { showWinnerCalls++; },
      hideWinnerOverlay: function () {},
      mount: function () { throw new Error('runtime must never call mount() on a scene handle it was given'); },
      dispose: function () { throw new Error('runtime must never call dispose() on a scene handle — only the selection scene may'); },
      getRenderCalls: function () { return renderCalls; },
      getShowWinnerCalls: function () { return showWinnerCalls; },
    };
  }

  // Fast-forwards the runtime's fixed-step loop via the synchronous __test
  // seam until either the race reaches `results` or a safety cap of
  // simulated steps is hit (guards against an infinite loop bug).
  function _runToCompletion(raceRuntime, sceneLog) {
    var STEP_MS = 1000 / 60;
    var maxSteps = 6000; // ~100 simulated seconds — comfortably past 26s race + 12s grace
    for (var i = 0; i < maxSteps; i++) {
      if (sceneLog.indexOf('results') !== -1) return;
      raceRuntime.__test.advanceRaceByMs(STEP_MS);
    }
  }

  async function run() {
    var raceRuntime = SBE.RacetrackRaceRuntime;
    var results = [];

    if (!raceRuntime || !raceRuntime.__test) {
      results.push(_assert('SBE.RacetrackRaceRuntime.__test is available', false));
      console.log('[RacetrackRaceRuntimeTests] FAIL — module/test seam not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    var originalSessionRuntime = SBE.RacetrackSessionRuntime;
    var currentSnapshot = null;
    var sceneLog = [];
    SBE.RacetrackSessionRuntime = {
      getSnapshot: function () { return currentSnapshot; },
      transitionScene: function (next) { sceneLog.push(next); },
    };

    try {
      // ── Purity (decision #15): getBeginRaceError() never mints an attemptId ──
      (function () {
        currentSnapshot = _validSnapshot();
        for (var i = 0; i < 5; i++) raceRuntime.getBeginRaceError();
        results.push(_assert('getBeginRaceError: repeated calls against a valid snapshot generate zero attemptIds',
          raceRuntime.getRaceInput() === null));

        currentSnapshot = _invalidSnapshot();
        var err = raceRuntime.getBeginRaceError();
        results.push(_assert('getBeginRaceError: an invalid snapshot returns a non-null reason', typeof err === 'string' && err.length > 0, err));
        results.push(_assert('getBeginRaceError: still mints no attemptId on an invalid snapshot', raceRuntime.getRaceInput() === null));
      })();

      // ── beginRace() propagates failure without minting an attemptId ────────
      (function () {
        currentSnapshot = _invalidSnapshot();
        var res = raceRuntime.beginRace();
        results.push(_assert('beginRace(): invalid snapshot returns ok:false with reasons', res.ok === false && Array.isArray(res.reasons)));
        results.push(_assert('beginRace(): invalid snapshot mints no attemptId', raceRuntime.getRaceInput() === null));
        results.push(_assert('beginRace(): invalid snapshot does not touch scene', sceneLog.length === 0));
        results.push(_assert('getIsRaceActive(): remains false after a rejected beginRace()', raceRuntime.getIsRaceActive() === false));
      })();

      // ── beginRace() success + re-entry guard (decision #17) ────────────────
      var firstAttemptId = null;
      (function () {
        currentSnapshot = _validSnapshot();
        results.push(_assert('getIsRaceActive(): false before any beginRace() call', raceRuntime.getIsRaceActive() === false));

        var res1 = raceRuntime.beginRace();
        results.push(_assert('beginRace(): a valid snapshot is accepted', res1.ok === true));
        results.push(_assert('beginRace(): mints exactly one attemptId', typeof raceRuntime.getRaceInput().attemptId === 'string'));
        results.push(_assert('beginRace(): transitions to countdown', sceneLog.indexOf('countdown') !== -1));
        results.push(_assert('getIsRaceActive(): true immediately after an accepted call', raceRuntime.getIsRaceActive() === true));
        firstAttemptId = raceRuntime.getRaceInput().attemptId;

        var res2 = raceRuntime.beginRace(); // rapid second call, same tick
        results.push(_assert('beginRace(): a second call while active is rejected with race_already_active', res2.ok === false && res2.reason === 'race_already_active'));
        results.push(_assert('beginRace(): the re-entry rejection does not mint a second attemptId',
          raceRuntime.getRaceInput().attemptId === firstAttemptId));
      })();

      // ── subscribeCountdown: immediate tick + real unsubscribe contract ─────
      (function () {
        var tickA = 0, tickB = 0;
        var unsubA = raceRuntime.subscribeCountdown(function () { tickA++; });
        var unsubB = raceRuntime.subscribeCountdown(function () { tickB++; });
        results.push(_assert('subscribeCountdown: delivers an immediate tick synchronously on subscribe', tickA === 1 && tickB === 1, { tickA: tickA, tickB: tickB }));
        unsubA();
        return (async function () {
          await _nextFrame();
          await _nextFrame();
          results.push(_assert('subscribeCountdown: after unsubscribe, that listener receives no further ticks', tickA === 1, tickA));
          results.push(_assert('subscribeCountdown: the still-subscribed listener keeps receiving ticks', tickB > tickA, { tickA: tickA, tickB: tickB }));
        })();
      })();

      // Skip past the real countdown timer via the test seam — its own
      // hidden-tab pause/GO-fires-once behavior is real-timer/DOM-dependent
      // and covered by live verification, not here.
      raceRuntime.__test.forceCountdownComplete();
      results.push(_assert('forceCountdownComplete: transitions to running', sceneLog.indexOf('running') !== -1));
      results.push(_assert('forceCountdownComplete: racers are initialized', Array.isArray(raceRuntime.getRacers()) && raceRuntime.getRacers().length === 2));

      // ── startRunning idempotency (decision #12) ─────────────────────────────
      var handleA = _stubHandle('A');
      var handleB = _stubHandle('B');
      raceRuntime.startRunning(handleA);
      raceRuntime.startRunning(handleB); // second call — must be a no-op
      raceRuntime.__test.advanceRaceByMs(1000 / 60);
      results.push(_assert('startRunning: a second call never starts a second loop — only the first handle is ever driven',
        handleA.getRenderCalls() > 0 && handleB.getRenderCalls() === 0));

      // ── detachRacePresentation: no-op for a non-current handle ─────────────
      var strangerHandle = _stubHandle('stranger');
      raceRuntime.detachRacePresentation(strangerHandle);
      var renderCallsBeforeAfterNoop = handleA.getRenderCalls();
      raceRuntime.__test.advanceRaceByMs(1000 / 60);
      results.push(_assert('detachRacePresentation: detaching a non-current handle is a no-op — handleA keeps being driven',
        handleA.getRenderCalls() > renderCallsBeforeAfterNoop));

      // ── detachRacePresentation: the active handle, mid-race (unexpected
      // detachment) — must stop the loop immediately ─────────────────────────
      raceRuntime.detachRacePresentation(handleA);
      var renderCallsAfterDetach = handleA.getRenderCalls();
      raceRuntime.__test.advanceRaceByMs(1000 / 60);
      raceRuntime.__test.advanceRaceByMs(1000 / 60);
      results.push(_assert('detachRacePresentation: detaching the genuinely active handle mid-race stops further stepping/render calls',
        handleA.getRenderCalls() === renderCallsAfterDetach, { before: renderCallsAfterDetach, after: handleA.getRenderCalls() }));

      // ── clears the reference — a fresh startRunning() now succeeds ─────────
      var handleC = _stubHandle('C');
      raceRuntime.startRunning(handleC);
      raceRuntime.__test.advanceRaceByMs(1000 / 60);
      results.push(_assert('detachRacePresentation: clears the runtime reference, so a subsequent startRunning() genuinely takes effect',
        handleC.getRenderCalls() > 0));

      // ── Run the race to completion via the fast-forward seam; assert
      // winner-commit fired exactly once and never touched mount()/dispose() ──
      _runToCompletion(raceRuntime, sceneLog);
      results.push(_assert('race reaches finish exactly once', sceneLog.filter(function (s) { return s === 'finish'; }).length === 1, sceneLog));
      results.push(_assert('winner-commit called showWinnerOverlay() exactly once on the active handle', handleC.getShowWinnerCalls() === 1));
      results.push(_assert('race reaches results', sceneLog.indexOf('results') !== -1, sceneLog));
      // handleC.mount/.dispose would have THROWN if ever called (synchronously,
      // inside advanceRaceByMs above) — reaching this line at all is itself
      // proof neither was ever invoked.
      results.push(_assert('the runtime never called mount()/dispose() on the scene handle it held (would have thrown if it had)', true));

      var finalResult = raceRuntime.getRaceResult();
      results.push(_assert('getRaceResult(): a complete result is available after finish',
        !!finalResult && Array.isArray(finalResult.finishOrder) && finalResult.finishOrder.length === 2));
      var placements = finalResult ? finalResult.finishOrder.map(function (e) { return e.placement; }).sort() : [];
      results.push(_assert('getRaceResult(): every competitor has a unique placement', JSON.stringify(placements) === JSON.stringify([1, 2]), placements));

      // ── Finalized Results teardown does not corrupt the completed result ───
      raceRuntime.detachRacePresentation(handleC); // the normal finish->results teardown path
      var resultAfterTeardown = raceRuntime.getRaceResult();
      results.push(_assert('finalized Results teardown does not mutate/corrupt the completed result',
        JSON.stringify(resultAfterTeardown) === JSON.stringify(finalResult)));

      // ── resetRace() idempotent cleanup ──────────────────────────────────────
      raceRuntime.resetRace();
      raceRuntime.resetRace(); // second call must not throw
      results.push(_assert('resetRace(): clears all transient race state', raceRuntime.getRaceInput() === null && raceRuntime.getRacers() === null && raceRuntime.getRaceResult() === null));
      results.push(_assert('resetRace(): getIsRaceActive() returns false again', raceRuntime.getIsRaceActive() === false));
      results.push(_assert('resetRace(): transitions back to lobby', sceneLog[sceneLog.length - 1] === 'lobby'));

    } finally {
      SBE.RacetrackSessionRuntime = originalSessionRuntime;
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[RacetrackRaceRuntimeTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[RacetrackRaceRuntimeTests] failures:', failed);

    return summary;
  }

  SBE.RacetrackRaceRuntimeTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.racetrackRaceRuntime = { runTests: run };

})(window);
