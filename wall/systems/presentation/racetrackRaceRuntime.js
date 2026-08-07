// ── RacetrackRaceRuntime v1.0.0 ───────────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: presentation / racetrack-race-runtime
//
// Pure orchestration/simulation authority. Owns the fixed-step clock, the
// countdown controller, and all scene transitions during a race — but NEVER
// constructs, mounts, or disposes DOM/THREE resources itself (0806C
// decision #10). It only ever calls methods (render(), showWinnerOverlay())
// on a scene handle racetrackSelectionScene.js builds via
// SBE.RacetrackRaceScene.mount() and hands over through startRunning();
// disposal happens exclusively in that same file's teardown, via
// detachRacePresentation() (decision #13) followed by handle.dispose().
//
// Race state is 100% transient, module-local — nothing here is ever written
// to the Lobby snapshot or IndexedDB. A page reload cannot restore an
// in-progress race (explicitly out of scope); racetrackSessionRuntime.js
// coerces any persisted mid-race scene value back to 'lobby' at load time.
//
// PURITY NOTE (decision #15): _validateRaceInput() and getBeginRaceError()
// have ZERO side effects — no attemptId minted, no state written. Only
// beginRace() ever mints an attemptId, and only after validation succeeds
// and the re-entry guard (decision #17) has already passed. Lobby's
// disabled-button check can call getBeginRaceError() on every render without
// consequence.
//
// IMPLEMENTATION NOTE vs. the original plan sketch: the live Lobby snapshot
// object returned by RacetrackSessionRuntime.getSnapshot() already carries
// the FULLY RESOLVED coursePackage embedded on it (populated once, either at
// enterLobby() or at session-restore time — never re-fetched afterward), not
// a separate {id,version,fingerprint} ref to re-resolve against. There is
// therefore no async re-fetch to perform here: frozen-package authority is
// already guaranteed by racetrackSessionRuntime.js's own architecture (the
// embedded object is a fixed, never-refetched reference). _validateRaceInput
// stays fully synchronous, validating that already-embedded package
// directly — which is what makes it safe to call repeatedly and purely from
// Lobby's render path in the first place.
//
// Load: after racetrackReadiness.js, racetrackCoursePackageRuntime.js,
// racetrackSessionRuntime.js, racetrackRaceCourseSampler.js,
// racetrackRaceSimulation.js, racetrackRaceRanking.js, racetrackRaceResults.js
// — before racetrackSelectionScene.js, which depends on this file.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var doc = global.document;

  var FIXED_STEP_MS = 1000 / 60;
  var GRACE_PERIOD_MS = 12000;

  // ── Module state — all transient, cleared by resetRace() ───────────────────
  var _raceInput = null;
  var _racers = null;
  var _raceResult = null;
  var _raceStartedAtReal = null;

  var _raceSceneHandle = null;
  var _rafId = 0;
  var _lastFrameTimestampMs = null;
  var _accumulatorMs = 0;
  var _elapsedSimulationMs = 0;
  var _visibilityHandler = null;

  var _winnerCommitted = false;
  var _graceDeadlineSimMs = null;
  var _resultBuilt = false;

  var _countdown = null; // { remainingMs, rafId, lastFrameTimestampMs, listeners, cancelled, completed, _onVisibilityChange }

  function _genAttemptId() {
    return 'raceAttempt_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  function _competitorById(id) {
    if (!_raceInput) return null;
    for (var i = 0; i < _raceInput.competitors.length; i++) {
      if (_raceInput.competitors[i].id === id) return _raceInput.competitors[i];
    }
    return null;
  }

  // ── Pure validation (decision #15) ──────────────────────────────────────────
  // No attemptId, no state write, safe to call any number of times.
  function _validateRaceInput(snapshot) {
    if (!snapshot) {
      return { ok: false, reasons: ['no_frozen_snapshot'] };
    }
    var ctx = {
      coursePackage: snapshot.coursePackage || null,
      coursePackageRefMatches: true, // see file header — the embedded package IS the frozen reference at this layer
      competitors: snapshot.competitorSnapshots || [],
      seed: snapshot.seed || null,
    };
    if (!SBE.RacetrackReadiness) return { ok: false, reasons: ['missing_course_package'] };
    return SBE.RacetrackReadiness.validateRacetrackRaceInput(ctx);
  }

  function getBeginRaceError() {
    var runtime = SBE.RacetrackSessionRuntime;
    var snapshot = runtime ? runtime.getSnapshot() : null;
    var result = _validateRaceInput(snapshot);
    return result.ok ? null : result.reasons.join(', ').replace(/_/g, ' ');
  }

  function getIsRaceActive() { return !!_raceInput; }
  function getRaceInput() { return _raceInput; }
  function getRacers() { return _racers; }
  function getRaceResult() { return _raceResult; }

  // ── Countdown controller ────────────────────────────────────────────────────
  // Its own small RAF-driven state machine, no DOM of its own. Hidden-tab
  // time never advances it (its own visibilitychange listener, mirroring the
  // main race clock's pause pattern). Public surface is subscribe/unsubscribe
  // (decision #14), not a bare callback slot.
  function _startCountdown() {
    var countdown = {
      remainingMs: 3000,
      rafId: 0,
      lastFrameTimestampMs: null,
      listeners: [],
      cancelled: false,
      completed: false,
    };
    _countdown = countdown;

    function notifyTick() {
      var seconds = Math.ceil(countdown.remainingMs / 1000);
      countdown.listeners.slice().forEach(function (fn) {
        try { fn(seconds); } catch (e) { /* subscriber error is not this module's concern */ }
      });
    }

    function frame(now) {
      if (countdown.cancelled || countdown.completed) return;
      if (countdown.lastFrameTimestampMs == null) countdown.lastFrameTimestampMs = now;
      var delta = now - countdown.lastFrameTimestampMs;
      countdown.lastFrameTimestampMs = now;
      countdown.remainingMs = Math.max(0, countdown.remainingMs - delta);
      notifyTick();
      if (countdown.remainingMs <= 0) {
        countdown.completed = true;
        _onCountdownComplete();
        return;
      }
      countdown.rafId = global.requestAnimationFrame(frame);
    }

    function onVisibilityChange() {
      if (countdown.cancelled || countdown.completed) return;
      if (doc.hidden) {
        global.cancelAnimationFrame(countdown.rafId);
        countdown.rafId = 0;
      } else {
        countdown.lastFrameTimestampMs = null; // resume without jump
        countdown.rafId = global.requestAnimationFrame(frame);
      }
    }
    countdown._onVisibilityChange = onVisibilityChange;
    doc.addEventListener('visibilitychange', onVisibilityChange);

    countdown.rafId = global.requestAnimationFrame(frame);
  }

  function _cancelCountdown() {
    if (!_countdown) return;
    _countdown.cancelled = true;
    global.cancelAnimationFrame(_countdown.rafId);
    doc.removeEventListener('visibilitychange', _countdown._onVisibilityChange);
    _countdown = null;
  }

  // Returns unsubscribe. Delivers the current remaining-seconds value
  // immediately on subscribe, then on every subsequent tick.
  function subscribeCountdown(fn) {
    if (!_countdown) return function () {};
    var countdownRef = _countdown;
    countdownRef.listeners.push(fn);
    try { fn(Math.ceil(countdownRef.remainingMs / 1000)); } catch (e) {}
    return function () {
      var i = countdownRef.listeners.indexOf(fn);
      if (i !== -1) countdownRef.listeners.splice(i, 1);
    };
  }

  function _onCountdownComplete() {
    doc.removeEventListener('visibilitychange', _countdown._onVisibilityChange);
    _countdown = null;
    _racers = SBE.RacetrackRaceSimulation.initializeRacers(_raceInput);
    if (SBE.RacetrackSessionRuntime) SBE.RacetrackSessionRuntime.transitionScene('running');
  }

  // ── beginRace() — re-entry guard (decision #17), then pure validation,
  // then (only on success) mint the ONE attemptId for this attempt ─────────
  function beginRace() {
    if (_raceInput) {
      return { ok: false, reason: 'race_already_active' };
    }

    var runtime = SBE.RacetrackSessionRuntime;
    var snapshot = runtime ? runtime.getSnapshot() : null;
    var validation = _validateRaceInput(snapshot);
    if (!validation.ok) {
      return { ok: false, reasons: validation.reasons };
    }

    var pkg = snapshot.coursePackage;
    var attemptId = _genAttemptId();
    _raceInput = Object.freeze({
      sessionId: snapshot.id,
      attemptId: attemptId,
      seed: snapshot.seed,
      coursePackageRef: Object.freeze({ id: pkg.id, version: pkg.version, fingerprint: pkg.sourceRaceCourseFingerprint }),
      coursePackage: pkg,
      rosterIds: snapshot.competitorSnapshots.map(function (c) { return c.id; }),
      competitors: snapshot.competitorSnapshots,
      totalDistanceMeters: pkg.finish.distanceMeters,
    });

    _racers = null;
    _raceResult = null;
    _winnerCommitted = false;
    _resultBuilt = false;
    _graceDeadlineSimMs = null;
    _raceStartedAtReal = Date.now();

    _startCountdown();
    if (runtime) runtime.transitionScene('countdown');
    return { ok: true };
  }

  // ── startRunning(handle) — the ONLY entry point through which a scene
  // handle is handed to this runtime; idempotent (decision #12) ─────────────
  function startRunning(handle) {
    if (_raceSceneHandle) return; // a second call can never start a second loop
    _raceSceneHandle = handle;
    _elapsedSimulationMs = 0;
    _accumulatorMs = 0;
    _lastFrameTimestampMs = null;

    _visibilityHandler = function () {
      if (doc.hidden) {
        global.cancelAnimationFrame(_rafId);
        _rafId = 0;
      } else {
        _lastFrameTimestampMs = null; // resume without jump
        _rafId = global.requestAnimationFrame(_frame);
      }
    };
    doc.addEventListener('visibilitychange', _visibilityHandler);

    _rafId = global.requestAnimationFrame(_frame);
  }

  function _checkWinnerCommit() {
    if (_winnerCommitted) return;
    var winner = null;
    for (var i = 0; i < _racers.length; i++) {
      var r = _racers[i];
      if (r.status !== 'finished') continue;
      if (!winner || r.finishTimeMs < winner.finishTimeMs ||
        (r.finishTimeMs === winner.finishTimeMs && r.competitorId < winner.competitorId)) {
        winner = r;
      }
    }
    if (!winner) return;

    _winnerCommitted = true;
    _graceDeadlineSimMs = winner.finishTimeMs + GRACE_PERIOD_MS;

    var competitor = _competitorById(winner.competitorId);
    if (_raceSceneHandle && competitor) _raceSceneHandle.showWinnerOverlay(competitor);
    if (SBE.RacetrackSessionRuntime) SBE.RacetrackSessionRuntime.transitionScene('finish');
  }

  function _shouldClassifyNow() {
    if (!_winnerCommitted) return false;
    if (_elapsedSimulationMs >= _graceDeadlineSimMs) return true;
    var anyRacing = _racers.some(function (r) { return r.status === 'racing'; });
    return !anyRacing;
  }

  function _finishRace() {
    _resultBuilt = true;
    global.cancelAnimationFrame(_rafId);
    _rafId = 0;
    if (_visibilityHandler) {
      doc.removeEventListener('visibilitychange', _visibilityHandler);
      _visibilityHandler = null;
    }

    var finishOrder = SBE.RacetrackRaceRanking.classifyFinalResults(_racers, _elapsedSimulationMs);
    var winnerEntry = null;
    for (var i = 0; i < finishOrder.length; i++) {
      if (finishOrder[i].placement === 1) { winnerEntry = finishOrder[i]; break; }
    }

    _raceResult = SBE.RacetrackRaceResults.buildRaceResult({
      sessionId: _raceInput.sessionId,
      attemptId: _raceInput.attemptId,
      seed: _raceInput.seed,
      coursePackageRef: _raceInput.coursePackageRef,
      startedAt: _raceStartedAtReal,
      completedAt: Date.now(),
      winnerCompetitorId: winnerEntry ? winnerEntry.competitorId : null,
      finishOrder: finishOrder,
    });

    // Deliberately does NOT dispose _raceSceneHandle — racetrackSelectionScene.js's
    // own teardown does that, via detachRacePresentation() then handle.dispose()
    // (decisions #10/#13).
    if (SBE.RacetrackSessionRuntime) SBE.RacetrackSessionRuntime.transitionScene('results');
  }

  // The RAF-independent core: drains the fixed-step accumulator for one
  // real-time delta, exactly as `_frame` would. Extracted so it can be
  // driven by a real requestAnimationFrame delta (the production path) OR
  // called directly with a synthetic deltaMs (the __test.advanceRaceByMs
  // seam below) — same logic either way, no duplication. Returns true if
  // the race finished (classification ran) during this call.
  function _advanceByRealDelta(deltaMs) {
    _accumulatorMs += Math.min(deltaMs, 250); // clamp long stalls

    while (_accumulatorMs >= FIXED_STEP_MS) {
      _accumulatorMs -= FIXED_STEP_MS;

      var stepMs = FIXED_STEP_MS;
      if (_graceDeadlineSimMs != null && _elapsedSimulationMs + stepMs >= _graceDeadlineSimMs) {
        // Shortened final step (decision #8's correction): lands EXACTLY on
        // the deadline instead of overshooting it, so terminal time,
        // progress, and distance all describe the same instant.
        stepMs = Math.max(0, _graceDeadlineSimMs - _elapsedSimulationMs);
      }

      SBE.RacetrackRaceSimulation.stepRacers(_racers, _raceInput, stepMs / 1000, _elapsedSimulationMs);
      _elapsedSimulationMs += stepMs;

      _checkWinnerCommit();

      if (_shouldClassifyNow()) {
        _finishRace();
        return true; // race is over — no render, no reschedule
      }
    }
    return false;
  }

  function _frame(now) {
    if (!_raceSceneHandle) return; // defensive: detached mid-flight
    if (_lastFrameTimestampMs == null) _lastFrameTimestampMs = now;
    var deltaMs = now - _lastFrameTimestampMs;
    _lastFrameTimestampMs = now;

    var finished = _advanceByRealDelta(deltaMs);
    if (finished) return; // race is over — no render, no reschedule

    _raceSceneHandle.render(_racers);
    _rafId = global.requestAnimationFrame(_frame);
  }

  // ── detachRacePresentation(handle) — identity-checked (decision #13) ───────
  function detachRacePresentation(handle) {
    if (handle !== _raceSceneHandle) return;
    _raceSceneHandle = null;
    if (_rafId) {
      global.cancelAnimationFrame(_rafId);
      _rafId = 0;
      if (_visibilityHandler) {
        doc.removeEventListener('visibilitychange', _visibilityHandler);
        _visibilityHandler = null;
      }
      _graceDeadlineSimMs = null;
    }
  }

  // ── resetRace() — idempotent full cleanup ──────────────────────────────────
  function resetRace() {
    _cancelCountdown();
    if (_rafId) {
      global.cancelAnimationFrame(_rafId);
      _rafId = 0;
    }
    if (_visibilityHandler) {
      doc.removeEventListener('visibilitychange', _visibilityHandler);
      _visibilityHandler = null;
    }
    _raceSceneHandle = null; // racetrackSelectionScene.js's own teardown disposes whatever mount was live
    _raceInput = null;
    _racers = null;
    _raceResult = null;
    _winnerCommitted = false;
    _resultBuilt = false;
    _graceDeadlineSimMs = null;
    _elapsedSimulationMs = 0;
    _accumulatorMs = 0;
    _lastFrameTimestampMs = null;

    if (SBE.RacetrackSessionRuntime) SBE.RacetrackSessionRuntime.transitionScene('lobby');
  }

  SBE.RacetrackRaceRuntime = Object.freeze({
    VERSION: VERSION,
    getBeginRaceError: getBeginRaceError,
    getIsRaceActive: getIsRaceActive,
    getRaceInput: getRaceInput,
    getRacers: getRacers,
    getRaceResult: getRaceResult,
    beginRace: beginRace,
    subscribeCountdown: subscribeCountdown,
    startRunning: startRunning,
    detachRacePresentation: detachRacePresentation,
    resetRace: resetRace,

    // Test-only — never used by production code. advanceRaceByMs/
    // forceCountdownComplete exist so racetrackRaceRuntime.tests.js can
    // exercise winner-commit/deadline-clamping/grace-expiry/handle
    // discipline deterministically and FAST, without waiting through real
    // ~26s+12s requestAnimationFrame-driven race timing — they call the
    // exact same internal stepping logic the real RAF loop uses, just
    // driven by synthetic time instead of real frame timestamps.
    __test: {
      validateRaceInput: _validateRaceInput,
      advanceRaceByMs: function (deltaMs) {
        var finished = _advanceByRealDelta(deltaMs);
        // Mirrors _frame()'s own post-step behavior exactly: render() only
        // ever runs after a non-finishing step, on whatever handle is
        // currently attached (a stale/detached handle correctly gets no
        // call, matching the real RAF path).
        if (!finished && _raceSceneHandle) _raceSceneHandle.render(_racers);
        return finished;
      },
      forceCountdownComplete: function () { if (_countdown) _onCountdownComplete(); },
    },
  });

  console.log('[RacetrackRaceRuntime] v' + VERSION + ' loaded');

})(window);
