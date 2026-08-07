// ── RacetrackSessionRuntime Tests v1.3.0 ──────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime, corrected 0805G,
// extended 0805H and 0806A
// Status: active | Classification: test-harness (dependency-free)
//
// 0805H added 7 course-selection test blocks (one-course disabled state,
// multi-course cycling, deterministic dedup+ordering, stale-active-pointer
// same-course fallback, selected-course persistence, Lobby snapshot captures
// the selected course not the active pointer, historical package restores
// after a newer version of the same course publishes) — stubbing
// SBE.RacetrackCoursePackageRuntime.listCurrentPublishedCoursePackages the
// same way this file already stubs getActiveCoursePackage/getCoursePackageById.
//
// 0806A added assertions that ensureDefaultRoster()/ensureDefaultCourseSelection()
// return true only when they actually write state — the contract
// racetrackSelectionScene.js's cold-start abort-and-wait render logic relies
// on (see racetrackSelectionScene.tests.js for the separate render-scheduler
// coverage this fix also required).
//
// Same rationale/convention as keyboardShortcutRegistry.tests.js — no test
// runner exists under wall/, so this mirrors the `_wos.debug.*`
// console-diagnostic pattern. Every test seeds its own temporary localStorage
// catalog data and restores/clears it in a finally block, and resets
// RacetrackSessionRuntime's own selection state via its __test helpers
// afterward — running this harness never leaves stray state behind.
//
// 0805G: enterLobby() is now async (saves the durable session record before
// ever committing scene:'lobby'), so run() is now async too — awaited
// throughout. Session-snapshot durability tests use the REAL
// RacetrackSessionSnapshotStorage (real same-origin IndexedDB — this is a
// live in-browser harness, unlike the TS-side vitest suite, which has no
// jsdom/fake-indexeddb and never touches real IndexedDB); Course Package
// resolution is stubbed (matching this file's own established
// stub-a-wall/-singleton convention) rather than seeding real data into
// MAPS_RACETRACK_PACKAGE_DB from wall/'s side.
//
// Run via: _wos.debug.racetrackSessionRuntime.runTests() — now returns a
// Promise; await it (or .then()) in the browser console.
//
// Placement: wall/systems/presentation/racetrackSessionRuntime.tests.js
// Load: AFTER racetrackSessionRuntime.js. Not required for production operation.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var GAME_FORMAT_KEY = 'wos:gameFormat:catalog';
  var COMPETITOR_KEY  = 'wos:competitor:catalog';
  var PLAYLIST_KEY    = 'wos:musicPlaylists:catalog';

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _setCatalog(key, value) {
    global.localStorage.setItem(key, JSON.stringify(value));
  }
  function _clearCatalogs() {
    global.localStorage.removeItem(GAME_FORMAT_KEY);
    global.localStorage.removeItem(COMPETITOR_KEY);
    global.localStorage.removeItem(PLAYLIST_KEY);
  }

  var FAKE_FORMAT = { id: 'fmt-test', name: 'Test Format', objective: 'Win', minCompetitors: 1, maxCompetitors: 3, reward: 'r', stakes: 's', mode: 'point_to_point' };
  var FAKE_COMPETITORS = [
    { id: 'c1', name: 'C1', team: 'T1', orbProfileId: 'orb-1' },
    { id: 'c2', name: 'C2', team: 'T1', orbProfileId: 'orb-2' },
  ];
  var FAKE_PLAYLIST = { playlistId: 'p1', title: 'P1', trackCount: 5, targetDurationMinutes: 30, moodTags: [] };
  var FAKE_PACKAGE = {
    id: 'pkg-test', slug: 'test', name: 'Test Course', version: 1,
    sourceRaceCourseId: 'race-test', sourceRaceCourseFingerprint: 'fp',
    route: { type: 'LineString', coordinates: [[-74, 40.7], [-74.01, 40.71]] },
    progressSamples: [
      { index: 0, distanceMeters: 0, progress01: 0, coordinate: [-74, 40.7], headingDeg: 0 },
      { index: 1, distanceMeters: 100, progress01: 1, coordinate: [-74.01, 40.71], headingDeg: 30 },
    ],
    previewRoute: [],
    start: { distanceMeters: 0, coordinate: [-74, 40.7], headingDeg: 0 },
    finish: { distanceMeters: 100, coordinate: [-74.01, 40.71], headingDeg: 30 },
    checkpoints: [],
    routePresentation: { lineColor: '#ff6a3d', lineWidthPx: 3, previewMode: 'guide' },
    cameraAnchors: [],
    presentationReady: true, runtimeReady: true, warnings: [],
    providerSource: 'mapbox',
    createdAt: 0, publishedAt: 0,
  };

  // 0805H — course-selection fixtures: two courses, course-a has two
  // published versions (A1 superseded by A2), course-b has one.
  var FAKE_PACKAGE_A1 = Object.assign({}, FAKE_PACKAGE, { id: 'pkg-a1', sourceRaceCourseId: 'course-a', version: 1, publishedAt: 1000, name: 'Course A' });
  var FAKE_PACKAGE_A2 = Object.assign({}, FAKE_PACKAGE, { id: 'pkg-a2', sourceRaceCourseId: 'course-a', version: 2, publishedAt: 2000, name: 'Course A' });
  var FAKE_PACKAGE_B1 = Object.assign({}, FAKE_PACKAGE, { id: 'pkg-b1', sourceRaceCourseId: 'course-b', version: 1, publishedAt: 3000, name: 'Course B' });

  async function run() {
    var runtime = SBE.RacetrackSessionRuntime;
    var results = [];

    if (!runtime) {
      results.push(_assert('SBE.RacetrackSessionRuntime is loaded', false));
      console.log('[RacetrackSessionRuntimeTests] FAIL — runtime not loaded');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    var originalGetActivePackage = SBE.RacetrackCoursePackageRuntime
      ? SBE.RacetrackCoursePackageRuntime.getActiveCoursePackage
      : null;
    var originalGetCoursePackageById = SBE.RacetrackCoursePackageRuntime
      ? SBE.RacetrackCoursePackageRuntime.getCoursePackageById
      : null;
    var originalSaveActiveSession = SBE.RacetrackSessionSnapshotStorage
      ? SBE.RacetrackSessionSnapshotStorage.saveActiveSession
      : null;
    var originalListCurrentPublished = SBE.RacetrackCoursePackageRuntime
      ? SBE.RacetrackCoursePackageRuntime.listCurrentPublishedCoursePackages
      : null;

    function _stubPackage(pkg) {
      if (!SBE.RacetrackCoursePackageRuntime) return;
      SBE.RacetrackCoursePackageRuntime.getActiveCoursePackage = function () { return pkg; };
    }
    function _restorePackageStub() {
      if (SBE.RacetrackCoursePackageRuntime && originalGetActivePackage) {
        SBE.RacetrackCoursePackageRuntime.getActiveCoursePackage = originalGetActivePackage;
      }
    }
    function _stubPackageById(fn) {
      if (!SBE.RacetrackCoursePackageRuntime) return;
      SBE.RacetrackCoursePackageRuntime.getCoursePackageById = fn;
    }
    function _restorePackageByIdStub() {
      if (SBE.RacetrackCoursePackageRuntime && originalGetCoursePackageById) {
        SBE.RacetrackCoursePackageRuntime.getCoursePackageById = originalGetCoursePackageById;
      }
    }
    function _restoreSaveActiveSessionStub() {
      if (SBE.RacetrackSessionSnapshotStorage && originalSaveActiveSession) {
        SBE.RacetrackSessionSnapshotStorage.saveActiveSession = originalSaveActiveSession;
      }
    }
    function _stubCurrentPublished(list) {
      if (!SBE.RacetrackCoursePackageRuntime) return;
      SBE.RacetrackCoursePackageRuntime.listCurrentPublishedCoursePackages = function () { return list; };
    }
    function _restoreCurrentPublishedStub() {
      if (SBE.RacetrackCoursePackageRuntime && originalListCurrentPublished) {
        SBE.RacetrackCoursePackageRuntime.listCurrentPublishedCoursePackages = originalListCurrentPublished;
      }
    }

    // ── Scene transitions ────────────────────────────────────────────────────
    (function () {
      runtime.__test.resetSelection();
      try {
        results.push(_assert('default scene is attract', runtime.getScene() === 'attract'));
        runtime.enterSelection();
        results.push(_assert('enterSelection() moves scene to selection', runtime.getScene() === 'selection'));
      } finally {
        runtime.__test.resetSelection();
      }
    })();

    // ── Selection persistence (reload-safe) ─────────────────────────────────
    (function () {
      runtime.__test.resetSelection();
      try {
        runtime.enterSelection();
        var persisted = global.localStorage.getItem('wos:racetrack:selection');
        results.push(_assert('selection state is persisted to localStorage on change', !!persisted));
        var parsed = persisted ? JSON.parse(persisted) : null;
        results.push(_assert('persisted selection reflects the current scene', !!parsed && parsed.scene === 'selection'));
      } finally {
        runtime.__test.resetSelection();
      }
    })();

    // ── Roster add/remove, capped by the active Game Format ─────────────────
    (function () {
      _setCatalog(GAME_FORMAT_KEY, [Object.assign({}, FAKE_FORMAT, { maxCompetitors: 1 })]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      runtime.__test.resetSelection();
      try {
        runtime.addToRoster('c1');
        results.push(_assert('addToRoster() adds a real competitor', runtime.getRoster().length === 1));
        runtime.addToRoster('c2');
        results.push(_assert('addToRoster() respects the active Game Format max cap', runtime.getRoster().length === 1));
        runtime.removeFromRoster('c1');
        results.push(_assert('removeFromRoster() removes a competitor', runtime.getRoster().length === 0));
      } finally {
        runtime.__test.resetSelection();
        _clearCatalogs();
      }
    })();

    // ── 0806A: ensureDefaultRoster()/ensureDefaultCourseSelection() return
    // true ONLY on the branch that actually writes state — this is the
    // contract racetrackSelectionScene.js's cold-start abort-and-wait logic
    // depends on (if either returns true, it aborts that render pass and
    // waits for the notify() they already fired to schedule a fresh one). ──
    (function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _stubCurrentPublished([FAKE_PACKAGE_A1]);
      _stubPackage(null);
      runtime.__test.resetSelection();
      try {
        results.push(_assert('ensureDefaultRoster() returns true the first time it writes a default roster',
          runtime.ensureDefaultRoster() === true));
        results.push(_assert('ensureDefaultRoster() returns false once a roster already exists (no-op)',
          runtime.ensureDefaultRoster() === false));

        results.push(_assert('ensureDefaultCourseSelection() returns true the first time it writes a default course',
          runtime.ensureDefaultCourseSelection() === true));
        results.push(_assert('ensureDefaultCourseSelection() returns false once a course is already selected (no-op)',
          runtime.ensureDefaultCourseSelection() === false));
      } finally {
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restoreCurrentPublishedStub();
        _restorePackageStub();
      }
    })();

    (function () {
      // With NO competitor catalog and NO published course at all, both
      // functions must report false (nothing to default to) rather than
      // throwing or writing garbage state.
      _clearCatalogs();
      _stubCurrentPublished([]);
      _stubPackage(null);
      runtime.__test.resetSelection();
      try {
        results.push(_assert('ensureDefaultRoster() returns false when the competitor catalog is empty',
          runtime.ensureDefaultRoster() === false));
        results.push(_assert('ensureDefaultCourseSelection() returns false when no course is published',
          runtime.ensureDefaultCourseSelection() === false));
      } finally {
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restoreCurrentPublishedStub();
        _restorePackageStub();
      }
    })();

    // ── Readiness reasons ────────────────────────────────────────────────────
    (function () {
      runtime.__test.resetSelection();
      _clearCatalogs();
      _stubPackage(null);
      try {
        var emptyReadiness = runtime.getReadiness();
        results.push(_assert('missing everything reports missing_course_package', emptyReadiness.reasons.indexOf('missing_course_package') !== -1));
        results.push(_assert('missing everything reports missing_game_format', emptyReadiness.reasons.indexOf('missing_game_format') !== -1));
        results.push(_assert('missing everything reports missing_competitor', emptyReadiness.reasons.indexOf('missing_competitor') !== -1));
        results.push(_assert('missing everything reports missing_playlist', emptyReadiness.reasons.indexOf('missing_playlist') !== -1));

        _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
        _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
        _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
        _stubPackage(FAKE_PACKAGE);
        runtime.addToRoster('c1');

        var fullReadiness = runtime.getReadiness();
        results.push(_assert('a fully-populated selection is ready', fullReadiness.ready === true, fullReadiness.reasons));
      } finally {
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
      }
    })();

    // ── Session snapshot: built once, frozen, never re-reads live sources ──
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      _stubPackage(FAKE_PACKAGE);
      _stubPackageById(function (id) { return Promise.resolve(id === FAKE_PACKAGE.id ? FAKE_PACKAGE : null); });
      runtime.__test.resetSelection();
      try {
        runtime.addToRoster('c1');
        var result = await runtime.enterLobby();
        results.push(_assert('enterLobby() succeeds when the selection is ready', result.ok === true, result));
        results.push(_assert('scene moves to lobby on success', runtime.getScene() === 'lobby'));

        var snapshot = runtime.getSnapshot();
        results.push(_assert('a snapshot was frozen', !!snapshot));
        var nameBefore = snapshot ? snapshot.gameFormatSnapshot.name : null;

        // Mutate the SOURCE catalog after the snapshot was frozen — the
        // snapshot must not change, proving it never re-reads live sources.
        _setCatalog(GAME_FORMAT_KEY, [Object.assign({}, FAKE_FORMAT, { name: 'Mutated Name' })]);
        var snapshotAfter = runtime.getSnapshot();
        results.push(_assert('mutating the source catalog after Enter Lobby does NOT change the frozen snapshot',
          !!snapshotAfter && snapshotAfter.gameFormatSnapshot.name === nameBefore));

        results.push(_assert('the frozen snapshot does not alias the live package object',
          snapshot.coursePackage !== FAKE_PACKAGE));
      } finally {
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
        _restorePackageByIdStub();
      }
    })();

    // ── 0805G: session-snapshot durability — create, close/reinitialize, restore exact ──
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      _stubPackage(FAKE_PACKAGE);
      _stubPackageById(function (id) { return Promise.resolve(id === FAKE_PACKAGE.id ? FAKE_PACKAGE : null); });
      runtime.__test.resetSelection();
      try {
        runtime.addToRoster('c1');
        var created = await runtime.enterLobby();
        results.push(_assert('durability: enterLobby() succeeds', created.ok === true, created));
        var originalSnapshot = runtime.getSnapshot();

        // Simulate "close the tab, reopen it" — reinitialize() re-reads the
        // persisted scene fresh from localStorage and re-runs the real
        // async restore against the REAL RacetrackSessionSnapshotStorage
        // (real same-origin IndexedDB in this live browser harness).
        await runtime.__test.reinitialize();

        results.push(_assert('durability: restored scene is lobby after reinitialize()', runtime.getScene() === 'lobby'));
        results.push(_assert('durability: restore state is ready', runtime.getSnapshotRestoreState() === 'ready'));

        var restored = runtime.getSnapshot();
        results.push(_assert('durability: a snapshot was actually restored', !!restored));
        results.push(_assert('durability: restored snapshot id matches the original', !!restored && restored.id === originalSnapshot.id));
        results.push(_assert('durability: restored gameFormatSnapshot matches exactly',
          !!restored && JSON.stringify(restored.gameFormatSnapshot) === JSON.stringify(originalSnapshot.gameFormatSnapshot)));
        results.push(_assert('durability: restored competitorSnapshots match exactly',
          !!restored && JSON.stringify(restored.competitorSnapshots) === JSON.stringify(originalSnapshot.competitorSnapshots)));
        results.push(_assert('durability: restored coursePackage resolves to the exact same package (by id/version/fingerprint)',
          !!restored && restored.coursePackage && restored.coursePackage.id === FAKE_PACKAGE.id));

        // Source records changed AFTER the restore still must not mutate it.
        var nameBeforeSourceEdit = restored.gameFormatSnapshot.name;
        _setCatalog(GAME_FORMAT_KEY, [Object.assign({}, FAKE_FORMAT, { name: 'Mutated After Restore' })]);
        var restoredAfterSourceEdit = runtime.getSnapshot();
        results.push(_assert('durability: editing the source catalog AFTER restore does not mutate the restored snapshot',
          !!restoredAfterSourceEdit && restoredAfterSourceEdit.gameFormatSnapshot.name === nameBeforeSourceEdit));
      } finally {
        runtime.backToSelectionFromLobby();
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
        _restorePackageByIdStub();
      }
    })();

    // ── 0805G: corrupt/missing snapshot falls back safely to Selection ─────
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      _stubPackage(FAKE_PACKAGE);
      _stubPackageById(function (id) { return Promise.resolve(id === FAKE_PACKAGE.id ? FAKE_PACKAGE : null); });
      runtime.__test.resetSelection();
      try {
        runtime.addToRoster('c1');
        await runtime.enterLobby();
        results.push(_assert('corrupt-fallback setup: reached lobby', runtime.getScene() === 'lobby'));

        // Corrupt the resolution path: the package can no longer be found
        // (simulates a genuinely missing/deleted record, or a mismatched
        // id/version/fingerprint on the way back out).
        _stubPackageById(function () { return Promise.resolve(null); });
        await runtime.__test.reinitialize();

        results.push(_assert('corrupt-fallback: scene falls back to selection, never a stuck broken lobby', runtime.getScene() === 'selection'));
        results.push(_assert('corrupt-fallback: restore state reports unavailable', runtime.getSnapshotRestoreState() === 'unavailable'));
        results.push(_assert('corrupt-fallback: no snapshot is exposed', !runtime.getSnapshot()));
      } finally {
        runtime.backToSelectionFromLobby();
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
        _restorePackageByIdStub();
      }
    })();

    // ── 0805G: missing persisted record (pointer present, IndexedDB empty) also falls back ──
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      runtime.__test.resetSelection();
      try {
        // A scene of 'lobby' with NO real session ever having been created —
        // e.g. a corrupted/hand-edited wos:racetrack:selection — must not
        // trust that claim.
        global.localStorage.setItem('wos:racetrack:selection', JSON.stringify({
          scene: 'lobby', competitorIndex: 0, gameFormatIndex: 0, playlistIndex: 0, rosterIds: [], seed: 'x',
        }));
        await runtime.__test.reinitialize();
        results.push(_assert('missing-record fallback: scene falls back to selection', runtime.getScene() === 'selection'));
        results.push(_assert('missing-record fallback: no snapshot is exposed', !runtime.getSnapshot()));
      } finally {
        runtime.__test.resetSelection();
        _clearCatalogs();
      }
    })();

    // ── 0805G: enterLobby() rejects a duplicate call while already pending ──
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      _stubPackage(FAKE_PACKAGE);
      _stubPackageById(function (id) { return Promise.resolve(id === FAKE_PACKAGE.id ? FAKE_PACKAGE : null); });
      runtime.__test.resetSelection();
      try {
        runtime.addToRoster('c1');
        var firstCall = runtime.enterLobby(); // not yet awaited — still pending
        results.push(_assert('duplicate-click guard: getIsEnteringLobby() is true while the save is in flight', runtime.getIsEnteringLobby() === true));
        var secondResult = await runtime.enterLobby();
        results.push(_assert('duplicate-click guard: a second concurrent call is rejected as already_pending', secondResult.ok === false && secondResult.reason === 'already_pending'));
        await firstCall;
        results.push(_assert('duplicate-click guard: the FIRST call still succeeds normally', runtime.getScene() === 'lobby'));
      } finally {
        runtime.backToSelectionFromLobby();
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
        _restorePackageByIdStub();
      }
    })();

    // ── 0805G: a save failure leaves the user on Selection with a real error ──
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      _stubPackage(FAKE_PACKAGE);
      runtime.__test.resetSelection();
      if (SBE.RacetrackSessionSnapshotStorage) {
        SBE.RacetrackSessionSnapshotStorage.saveActiveSession = function () {
          return Promise.reject(new Error('simulated save failure'));
        };
      }
      try {
        runtime.addToRoster('c1');
        var result = await runtime.enterLobby();
        results.push(_assert('save-failure: enterLobby() reports failure, not a silent swallow', result.ok === false && result.reason === 'persist_failed', result));
        results.push(_assert('save-failure: scene remains selection, never committed to a half-saved lobby', runtime.getScene() === 'selection'));
        results.push(_assert('save-failure: a real, actionable error message is exposed', typeof runtime.getEnterLobbyError() === 'string' && runtime.getEnterLobbyError().length > 0));
        results.push(_assert('save-failure: no snapshot was set', !runtime.getSnapshot()));
      } finally {
        _restoreSaveActiveSessionStub();
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
      }
    })();

    // ── 0805H: course selection — one-course disabled state ────────────────
    (function () {
      _stubCurrentPublished([FAKE_PACKAGE_A1]);
      _stubPackage(null);
      runtime.__test.resetSelection();
      try {
        runtime.ensureDefaultCourseSelection();
        results.push(_assert('course selection: single-package list defaults to that package', runtime.getSelectedCoursePackage() && runtime.getSelectedCoursePackage().id === 'pkg-a1'));
        runtime.nextCoursePackage();
        results.push(_assert('course selection: nextCoursePackage() is a no-op at length <= 1', runtime.getSelectedCoursePackage().id === 'pkg-a1'));
        runtime.prevCoursePackage();
        results.push(_assert('course selection: prevCoursePackage() is a no-op at length <= 1', runtime.getSelectedCoursePackage().id === 'pkg-a1'));
      } finally {
        runtime.__test.resetSelection();
        _restoreCurrentPublishedStub();
        _restorePackageStub();
      }
    })();

    // ── 0805H: course selection — multi-course cycling ──────────────────────
    (function () {
      _stubCurrentPublished([FAKE_PACKAGE_B1, FAKE_PACKAGE_A2]); // B1 (3000) newest, A2 (2000) next
      _stubPackage(null);
      runtime.__test.resetSelection();
      try {
        runtime.ensureDefaultCourseSelection();
        results.push(_assert('course cycling: defaults to the first (newest) current entry', runtime.getSelectedCoursePackage().id === 'pkg-b1'));
        runtime.nextCoursePackage();
        results.push(_assert('course cycling: nextCoursePackage() advances', runtime.getSelectedCoursePackage().id === 'pkg-a2'));
        runtime.nextCoursePackage();
        results.push(_assert('course cycling: nextCoursePackage() wraps back around', runtime.getSelectedCoursePackage().id === 'pkg-b1'));
        runtime.prevCoursePackage();
        results.push(_assert('course cycling: prevCoursePackage() wraps the other direction', runtime.getSelectedCoursePackage().id === 'pkg-a2'));
      } finally {
        runtime.__test.resetSelection();
        _restoreCurrentPublishedStub();
        _restorePackageStub();
      }
    })();

    // ── 0805H: deterministic dedup and ordering (direct comparator/selector) ─
    (function () {
      if (SBE.RacetrackCoursePackageRuntime && SBE.RacetrackCoursePackageRuntime.__test) {
        var deduped = SBE.RacetrackCoursePackageRuntime.__test.selectCurrentPublished([FAKE_PACKAGE_A1, FAKE_PACKAGE_B1, FAKE_PACKAGE_A2]);
        results.push(_assert('dedup: same-course multiple versions collapse to exactly one entry', deduped.length === 2, deduped));
        results.push(_assert('dedup: the newest version of course-a wins (A2, not A1)', deduped.some(function (p) { return p.id === 'pkg-a2'; }) && !deduped.some(function (p) { return p.id === 'pkg-a1'; })));
        results.push(_assert('dedup: result is sorted newest-first (B1 before A2)', deduped[0].id === 'pkg-b1' && deduped[1].id === 'pkg-a2'));
      } else {
        results.push(_assert('dedup: SBE.RacetrackCoursePackageRuntime.__test.selectCurrentPublished is available', false));
      }
    })();

    // ── 0805H: required correction — stale active pointer resolves to the CURRENT
    //    version of its OWN course, never the globally-newest different course ──
    (function () {
      // Current list: B1 (course-b, publishedAt 3000) is globally newest, but
      // the "active" pointer references A1 — a STALE version of course-a,
      // since A2 has since superseded it. Default selection must land on A2
      // (course-a's current version), not B1 (a different course entirely).
      _stubCurrentPublished([FAKE_PACKAGE_B1, FAKE_PACKAGE_A2]);
      _stubPackage(FAKE_PACKAGE_A1);
      runtime.__test.resetSelection();
      try {
        runtime.ensureDefaultCourseSelection();
        var selected = runtime.getSelectedCoursePackage();
        results.push(_assert('stale pointer: default resolves to the CURRENT version of the active pointer\'s own course',
          !!selected && selected.id === 'pkg-a2', selected));
        results.push(_assert('stale pointer: default does NOT jump to the globally-newest different course',
          !!selected && selected.id !== 'pkg-b1'));
      } finally {
        runtime.__test.resetSelection();
        _restoreCurrentPublishedStub();
        _restorePackageStub();
      }
    })();

    // ── 0805H: selected-course persistence across reinitialize() ────────────
    await (async function () {
      _stubCurrentPublished([FAKE_PACKAGE_A2, FAKE_PACKAGE_B1]);
      _stubPackage(null);
      runtime.__test.resetSelection();
      try {
        runtime.ensureDefaultCourseSelection(); // selects A2 (list[0])
        runtime.nextCoursePackage(); // moves to B1
        var beforeId = runtime.getSelectedCoursePackage().id;
        results.push(_assert('course persistence: selection moved away from the default before reload', beforeId === 'pkg-b1'));
        await runtime.__test.reinitialize();
        var afterId = runtime.getSelectedCoursePackage() ? runtime.getSelectedCoursePackage().id : null;
        results.push(_assert('course persistence: selected course survives reinitialize() (simulated tab close/reopen)', afterId === beforeId, afterId));
      } finally {
        runtime.__test.resetSelection();
        _restoreCurrentPublishedStub();
        _restorePackageStub();
      }
    })();

    // ── 0805H: Lobby snapshot captures the SELECTED course, not the active pointer ──
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      _stubPackage(FAKE_PACKAGE_A1); // "active" pointer is A1/course-a
      _stubCurrentPublished([FAKE_PACKAGE_A2, FAKE_PACKAGE_B1]);
      _stubPackageById(function (id) {
        var all = [FAKE_PACKAGE_A1, FAKE_PACKAGE_A2, FAKE_PACKAGE_B1];
        var found = all.filter(function (p) { return p.id === id; })[0] || null;
        return Promise.resolve(found);
      });
      runtime.__test.resetSelection();
      try {
        runtime.addToRoster('c1');
        runtime.ensureDefaultCourseSelection(); // defaults to A2 (current version of the active pointer's course)
        runtime.nextCoursePackage(); // explicitly select B1 instead — a DIFFERENT course than the active pointer
        var selectedId = runtime.getSelectedCoursePackage().id;
        results.push(_assert('snapshot source: a non-default course was explicitly selected', selectedId === 'pkg-b1'));

        var result = await runtime.enterLobby();
        results.push(_assert('snapshot source: enterLobby() succeeds with the selected course', result.ok === true, result));
        var snap = runtime.getSnapshot();
        results.push(_assert('snapshot source: Lobby captures the SELECTED course package',
          !!snap && snap.coursePackage.id === 'pkg-b1'));
        results.push(_assert('snapshot source: Lobby does NOT capture the active pointer instead',
          !!snap && snap.coursePackage.id !== FAKE_PACKAGE_A1.id));
      } finally {
        runtime.backToSelectionFromLobby();
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
        _restorePackageByIdStub();
        _restoreCurrentPublishedStub();
      }
    })();

    // ── 0805H: a historical selected package restores after a newer version
    //    of the SAME course publishes — the restore path resolves by exact
    //    id (coursePackageRef), unaffected by the pager's dedup ────────────
    await (async function () {
      _setCatalog(GAME_FORMAT_KEY, [FAKE_FORMAT]);
      _setCatalog(COMPETITOR_KEY, FAKE_COMPETITORS);
      _setCatalog(PLAYLIST_KEY, [FAKE_PLAYLIST]);
      _stubPackage(FAKE_PACKAGE_A1);
      _stubCurrentPublished([FAKE_PACKAGE_A1]); // only A1 published so far
      _stubPackageById(function (id) { return Promise.resolve(id === FAKE_PACKAGE_A1.id ? FAKE_PACKAGE_A1 : null); });
      runtime.__test.resetSelection();
      try {
        runtime.addToRoster('c1');
        runtime.ensureDefaultCourseSelection();
        var created = await runtime.enterLobby();
        results.push(_assert('historical restore: enterLobby() succeeds against the original version', created.ok === true, created));
        var originalPkgId = runtime.getSnapshot().coursePackage.id;
        results.push(_assert('historical restore: original snapshot references pkg-a1', originalPkgId === 'pkg-a1'));

        // A NEWER version of the SAME course now publishes, superseding A1
        // in the "current" list — but the frozen snapshot must keep pointing
        // at the exact original record.
        _stubCurrentPublished([FAKE_PACKAGE_A2]);
        _stubPackageById(function (id) {
          var all = [FAKE_PACKAGE_A1, FAKE_PACKAGE_A2];
          return Promise.resolve(all.filter(function (p) { return p.id === id; })[0] || null);
        });

        await runtime.__test.reinitialize();

        results.push(_assert('historical restore: scene restores to lobby despite a newer version now being current', runtime.getScene() === 'lobby'));
        var restored = runtime.getSnapshot();
        results.push(_assert('historical restore: restored snapshot still references the ORIGINAL historical package',
          !!restored && restored.coursePackage.id === originalPkgId));
        results.push(_assert('historical restore: restored snapshot is NOT silently upgraded to the newer version',
          !!restored && restored.coursePackage.id !== FAKE_PACKAGE_A2.id));
      } finally {
        runtime.backToSelectionFromLobby();
        runtime.__test.resetSelection();
        _clearCatalogs();
        _restorePackageStub();
        _restorePackageByIdStub();
        _restoreCurrentPublishedStub();
      }
    })();

    // ── 0806C: transitionScene() validates membership, behaves like the
    // existing enterSelection()/returnToAttract() (sync, persists, notifies) ──
    (function () {
      runtime.__test.resetSelection();
      try {
        runtime.transitionScene('countdown');
        results.push(_assert('transitionScene: moves scene to a valid SCENES member', runtime.getScene() === 'countdown'));
        var persisted = JSON.parse(global.localStorage.getItem('wos:racetrack:selection'));
        results.push(_assert('transitionScene: persists the new scene like other scene setters', persisted.scene === 'countdown'));

        runtime.transitionScene('not-a-real-scene');
        results.push(_assert('transitionScene: an unrecognized value is rejected — scene is unchanged', runtime.getScene() === 'countdown'));

        runtime.transitionScene('results');
        results.push(_assert('transitionScene: accepts every other race-scene value too', runtime.getScene() === 'results'));
      } finally {
        runtime.__test.resetSelection();
      }
    })();

    // ── 0806C: reload safety — any persisted mid-race scene value coerces
    // back to 'lobby' at load time, since race state cannot survive a
    // reload. Simulated via reinitialize() (re-reads _selection fresh from
    // localStorage exactly like a real page load would). ─────────────────────
    await (async function () {
      var midRaceScenes = ['countdown', 'running', 'finish', 'results'];
      for (var i = 0; i < midRaceScenes.length; i++) {
        var scene = midRaceScenes[i];
        global.localStorage.setItem('wos:racetrack:selection', JSON.stringify({
          scene: scene, competitorIndex: 0, gameFormatIndex: 0, playlistIndex: 0, rosterIds: [], seed: 'x',
        }));
        await runtime.__test.reinitialize();
        results.push(_assert('reload safety: a persisted "' + scene + '" scene coerces to lobby (then falls back to selection with no real session record present)',
          runtime.getScene() === 'lobby' || runtime.getScene() === 'selection', runtime.getScene()));
      }
      runtime.__test.resetSelection();
      _clearCatalogs();
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[RacetrackSessionRuntimeTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[RacetrackSessionRuntimeTests] failures:', failed);

    return summary;
  }

  SBE.RacetrackSessionRuntimeTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.racetrackSessionRuntime = { runTests: run };

})(window);
