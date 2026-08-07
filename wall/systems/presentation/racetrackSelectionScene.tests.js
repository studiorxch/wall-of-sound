// ── RacetrackSelectionScene Tests v1.0.0 ──────────────────────────────────────
// 0806A_RACETRACK_Responsive_Layout_and_Cold_Start_Repair
// Status: active | Classification: test-harness (dependency-free)
//
// Same bespoke console-diagnostic convention as racetrackSessionRuntime.tests.js
// and keyboardShortcutRegistry.tests.js — no test runner exists under wall/.
//
// This harness covers ONLY the render scheduler (_createScheduler), extracted
// as a pure, DOM-independent factory specifically so it's genuinely testable
// here — everything else 0806A touches (single mounted scene root, single Orb
// canvas, no duplicate DOM on repeated notifications, resize behavior, Orb
// remount cleanup, actual clipping, responsive layout at each breakpoint,
// boat containment) requires a real DOM/browser and is covered by the
// build's mandatory live verification instead, not faked here.
//
// Run via: _wos.debug.racetrackSelectionScene.runTests() — returns a Promise;
// await it (or .then()) in the browser console.
//
// Placement: wall/systems/presentation/racetrackSelectionScene.tests.js
// Load: AFTER racetrackSelectionScene.js. Not required for production operation.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _tick() {
    // Two microtask hops: schedule() itself queues via Promise.resolve().then(),
    // so awaiting a single already-resolved promise here lands after that flush.
    return Promise.resolve().then(function () { return Promise.resolve(); });
  }

  async function run() {
    var scene = SBE.RacetrackSelectionScene;
    var results = [];

    if (!scene || !scene.__test || typeof scene.__test.createScheduler !== 'function') {
      results.push(_assert('SBE.RacetrackSelectionScene.__test.createScheduler is available', false));
      console.log('[RacetrackSelectionSceneTests] FAIL — createScheduler not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    // ── Coalescing: multiple synchronous schedule() calls before the
    // microtask flush produce exactly ONE flush call ────────────────────────
    await (function () {
      return (async function () {
        var flushCount = 0;
        var scheduler = scene.__test.createScheduler(function () { flushCount++; });
        scheduler.schedule();
        scheduler.schedule();
        scheduler.schedule();
        results.push(_assert('coalescing: flush has not run yet synchronously', flushCount === 0));
        await _tick();
        results.push(_assert('coalescing: three synchronous schedule() calls produce exactly one flush', flushCount === 1, flushCount));
      })();
    })();

    // ── A second burst AFTER the first flush schedules a genuinely new one ──
    await (async function () {
      var flushCount = 0;
      var scheduler = scene.__test.createScheduler(function () { flushCount++; });
      scheduler.schedule();
      await _tick();
      scheduler.schedule();
      scheduler.schedule();
      await _tick();
      results.push(_assert('coalescing: a later burst after a completed flush schedules exactly one more flush', flushCount === 2, flushCount));
    })();

    // ── Generation counter increments on every schedule() call, even
    // coalesced ones (each call represents a genuine "state changed" event,
    // not just each flush) ──────────────────────────────────────────────────
    (function () {
      var scheduler = scene.__test.createScheduler(function () {});
      var before = scheduler.currentGeneration();
      scheduler.schedule();
      scheduler.schedule();
      var after = scheduler.currentGeneration();
      results.push(_assert('generation: increments once per schedule() call, not once per flush', after === before + 2, { before: before, after: after }));
    })();

    // ── Stale render-generation rejection ───────────────────────────────────
    (function () {
      var scheduler = scene.__test.createScheduler(function () {});
      var token = scheduler.currentGeneration();
      results.push(_assert('staleness: a freshly-captured token is not stale', scheduler.isStale(token) === false));
      scheduler.schedule();
      results.push(_assert('staleness: the same token IS stale after a later schedule() call', scheduler.isStale(token) === true));
      var newToken = scheduler.currentGeneration();
      results.push(_assert('staleness: a token captured AFTER the schedule() call is not stale', scheduler.isStale(newToken) === false));
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[RacetrackSelectionSceneTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[RacetrackSelectionSceneTests] failures:', failed);

    return summary;
  }

  SBE.RacetrackSelectionSceneTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.racetrackSelectionScene = { runTests: run };

})(window);
