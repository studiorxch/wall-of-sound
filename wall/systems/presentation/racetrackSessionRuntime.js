// ── RacetrackSessionRuntime v1.2.0 ────────────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime, corrected 0805G,
// extended 0806C
// Status: active | Classification: presentation / racetrack-session
//
// 0806C — adds transitionScene(next), the one generic scene-mutation
// primitive the new race runtime uses (countdown/running/finish/results/
// back-to-lobby). Also coerces any persisted mid-race scene value back to
// 'lobby' at load time — race state is transient and cannot survive a
// reload, so a hard refresh mid-race must land cleanly on Lobby rather than
// a stuck/broken scene.
//
// Owns RACETRACK's own scene + selection state — the ONLY wall/-side owner
// of "what is the user currently browsing/has chosen." Reads three
// read-only catalog mirrors MUSIC maintains (GameFormat/Competitor/Playlist
// — none of which RACETRACK ever writes back to), the existing
// OrbProfileAuthority (unchanged, wall/-side, synchronous), and
// RacetrackCoursePackageRuntime (the one compiled course). Builds an
// immutable RacetrackSessionSnapshot on "Enter Lobby" — a deep, frozen copy
// that never re-reads any of those live sources again, which is what makes
// "editing the source Course/Orb/Format/Playlist afterward doesn't change
// the Lobby snapshot" true.
//
// REQUIRED CORRECTION (0805G): the frozen snapshot is now durably persisted
// (racetrackSessionSnapshotStorage.js — same-origin IndexedDB, keyed
// separately from `wos:racetrack:selection`) and restored on boot, so
// closing the RACETRACK tab entirely and reopening it from Broadcast shows
// the SAME Lobby rather than a broken "no snapshot" state.
// enterLobby() is now properly async and ORDERED — the full record is
// durably saved FIRST; only on success does scene:'lobby' ever commit. A
// save failure leaves the user on Selection with a real, actionable error,
// never a silently-lost or half-committed session. Restoration re-resolves
// the Course Package by the snapshot's own saved {id,version,fingerprint}
// (never "whatever's active now") and validates all three match exactly
// before trusting it.
//
// Load order: AFTER OrbProfileAuthority, racetrackCoursePackageRuntime.js,
// racetrackSessionSnapshotStorage.js, and racetrackReadiness.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  var SELECTION_KEY = 'wos:racetrack:selection';
  var GAME_FORMAT_CATALOG_KEY = 'wos:gameFormat:catalog';
  var COMPETITOR_CATALOG_KEY  = 'wos:competitor:catalog';
  var PLAYLIST_CATALOG_KEY    = 'wos:musicPlaylists:catalog';

  var SCENES = ['attract', 'selection', 'lobby', 'countdown', 'running', 'finish', 'results', 'reset'];

  function _genSeed() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function _genId(prefix) {
    return prefix + '_' + Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  }

  function _defaultSelection() {
    return {
      scene: 'attract',
      competitorIndex: 0,
      gameFormatIndex: 0,
      playlistIndex: 0,
      rosterIds: [],
      seed: _genSeed(),
      selectedCoursePackageId: null,
    };
  }

  // 0806C — reload safety: race state (countdown/running/finish/results) is
  // 100% transient and cannot survive a reload (explicitly out of scope —
  // see the RUNTIME reference doc's Visibility section). Any persisted
  // scene in this set is coerced back to 'lobby' as part of loading the
  // selection itself — which then runs its own normal snapshot-restore
  // validation — rather than rendering a scene with no underlying race
  // runtime state. Folded into _loadSelection() itself (not a one-off
  // top-level check) so every caller — the real module-init load AND
  // __test.reinitialize()'s "simulate tab close/reopen" — gets this safety
  // property automatically, with no duplicated logic to keep in sync.
  var _MID_RACE_SCENES = ['countdown', 'running', 'finish', 'results'];

  function _loadSelection() {
    try {
      var raw = global.localStorage.getItem(SELECTION_KEY);
      if (!raw) return _defaultSelection();
      var parsed = JSON.parse(raw);
      var d = _defaultSelection();
      var scene = SCENES.indexOf(parsed.scene) !== -1 ? parsed.scene : d.scene;
      if (_MID_RACE_SCENES.indexOf(scene) !== -1) scene = 'lobby';
      return {
        scene: scene,
        competitorIndex: typeof parsed.competitorIndex === 'number' ? parsed.competitorIndex : d.competitorIndex,
        gameFormatIndex: typeof parsed.gameFormatIndex === 'number' ? parsed.gameFormatIndex : d.gameFormatIndex,
        playlistIndex: typeof parsed.playlistIndex === 'number' ? parsed.playlistIndex : d.playlistIndex,
        rosterIds: Array.isArray(parsed.rosterIds) ? parsed.rosterIds : d.rosterIds,
        seed: typeof parsed.seed === 'string' && parsed.seed ? parsed.seed : d.seed,
        selectedCoursePackageId: typeof parsed.selectedCoursePackageId === 'string' && parsed.selectedCoursePackageId
          ? parsed.selectedCoursePackageId : d.selectedCoursePackageId,
      };
    } catch (e) {
      return _defaultSelection();
    }
  }

  var _selection = _loadSelection();

  var _snapshot  = null; // frozen once, on Enter Lobby — never rebuilt while scene==='lobby'
  var _listeners = [];

  // 0805G — session-snapshot durability state.
  var _snapshotRestoreState = 'idle'; // 'idle' | 'restoring' | 'ready' | 'unavailable'
  var _enteringLobby = false;
  var _enterLobbyError = null;

  function _persistSelection() {
    try {
      global.localStorage.setItem(SELECTION_KEY, JSON.stringify(_selection));
    } catch (e) {
      /* best-effort — not load-bearing beyond this tab's own reload */
    }
  }

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { /* subscriber error is not this module's concern */ }
    });
  }

  function _setSelection(patch) {
    _selection = Object.assign({}, _selection, patch);
    _persistSelection();
    _notify();
  }

  // 0805F required correction: distinguishes "MUSIC has never written this
  // key" (not_initialized — the catalog mirror hasn't hydrated yet, a
  // startup-timing state, not a real absence) from "MUSIC wrote a genuinely
  // empty array" (empty — real absence of records) from "the stored value
  // isn't valid JSON/not an array" (parse_error — a real data problem, not a
  // timing issue). `not_initialized` is a real, own case rather than being
  // folded into `empty` — the two mean different things to the UI (retry
  // soon vs. nothing to show).
  function _readCatalogStatus(key) {
    var raw;
    try {
      raw = global.localStorage.getItem(key);
    } catch (e) {
      return { status: 'parse_error', entries: [] };
    }
    if (raw == null) return { status: 'not_initialized', entries: [] };
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      return { status: 'parse_error', entries: [] };
    }
    if (!Array.isArray(parsed)) return { status: 'parse_error', entries: [] };
    return { status: parsed.length === 0 ? 'empty' : 'ok', entries: parsed };
  }

  function listGameFormats() { return _readCatalogStatus(GAME_FORMAT_CATALOG_KEY).entries; }
  function listCompetitors() { return _readCatalogStatus(COMPETITOR_CATALOG_KEY).entries; }
  function listPlaylists()   { return _readCatalogStatus(PLAYLIST_CATALOG_KEY).entries; }

  function getGameFormatCatalogStatus() { return _readCatalogStatus(GAME_FORMAT_CATALOG_KEY).status; }
  function getCompetitorCatalogStatus() { return _readCatalogStatus(COMPETITOR_CATALOG_KEY).status; }
  function getPlaylistCatalogStatus()   { return _readCatalogStatus(PLAYLIST_CATALOG_KEY).status; }

  function _cycleIndex(current, length, delta) {
    if (length <= 0) return 0;
    return ((current + delta) % length + length) % length;
  }

  // ── Scene transitions ────────────────────────────────────────────────────

  function getScene() { return _selection.scene; }

  function enterSelection() { _setSelection({ scene: 'selection' }); }
  function returnToAttract() { _setSelection({ scene: 'attract' }); }

  // 0806C — the one generic scene-mutation primitive the race runtime needs.
  // Validates membership in SCENES, then behaves exactly like the two
  // functions above (sync _setSelection, notifies). RacetrackSessionRuntime
  // remains the sole owner of the `scene` field — racetrackRaceRuntime.js
  // never writes _selection directly.
  function transitionScene(next) {
    if (SCENES.indexOf(next) === -1) return;
    _setSelection({ scene: next });
  }

  // Requirement 7's explicit discard action — clears the durable
  // active-session pointer intentionally (the IndexedDB record itself is
  // left in place, a deliberate choice — see racetrackSessionSnapshotStorage.js).
  function backToSelectionFromLobby() {
    _snapshot = null;
    _snapshotRestoreState = 'idle';
    _enterLobbyError = null;
    if (SBE.RacetrackSessionSnapshotStorage) SBE.RacetrackSessionSnapshotStorage.clearActiveSession();
    _setSelection({ scene: 'selection' });
  }

  // ── Featured Orb / Competitor paging ─────────────────────────────────────

  function nextCompetitor() {
    var n = listCompetitors().length;
    _setSelection({ competitorIndex: _cycleIndex(_selection.competitorIndex, n, 1) });
  }
  function prevCompetitor() {
    var n = listCompetitors().length;
    _setSelection({ competitorIndex: _cycleIndex(_selection.competitorIndex, n, -1) });
  }
  function getFeaturedCompetitor() {
    var list = listCompetitors();
    if (list.length === 0) return null;
    return list[_cycleIndex(_selection.competitorIndex, list.length, 0)];
  }

  // ── Game Format paging ────────────────────────────────────────────────────

  function nextGameFormat() {
    var n = listGameFormats().length;
    _setSelection({ gameFormatIndex: _cycleIndex(_selection.gameFormatIndex, n, 1) });
  }
  function prevGameFormat() {
    var n = listGameFormats().length;
    _setSelection({ gameFormatIndex: _cycleIndex(_selection.gameFormatIndex, n, -1) });
  }
  function getActiveGameFormat() {
    var list = listGameFormats();
    if (list.length === 0) return null;
    return list[_cycleIndex(_selection.gameFormatIndex, list.length, 0)];
  }

  // ── Playlist paging ────────────────────────────────────────────────────────

  function nextPlaylist() {
    var n = listPlaylists().length;
    _setSelection({ playlistIndex: _cycleIndex(_selection.playlistIndex, n, 1) });
  }
  function prevPlaylist() {
    var n = listPlaylists().length;
    _setSelection({ playlistIndex: _cycleIndex(_selection.playlistIndex, n, -1) });
  }
  function getActivePlaylist() {
    var list = listPlaylists();
    if (list.length === 0) return null;
    return list[_cycleIndex(_selection.playlistIndex, list.length, 0)];
  }

  // ── Course package paging (0805H) ───────────────────────────────────────
  // "Current" list = one entry per sourceRaceCourseId (newest published
  // version only) — see racetrackCoursePackageRuntime.js's
  // listCurrentPublishedCoursePackages(). Selecting a course here is purely
  // local RACETRACK selection state — it NEVER rewrites the global active-
  // package pointer (that only ever happens via publishCoursePackage() in
  // MUSIC). enterLobby()/getReadiness() read the SELECTED package, not
  // blindly "whatever's globally active."

  function _currentCoursePackages() {
    return SBE.RacetrackCoursePackageRuntime ? SBE.RacetrackCoursePackageRuntime.listCurrentPublishedCoursePackages() : [];
  }

  // Mirrors ensureDefaultRoster()'s shape. Required-correction fallback
  // order: (1) keep an already-resolvable selection; (2) else default to
  // the CURRENT version of the active pointer's OWN course (never a stale
  // pointer, never a different course); (3) else the globally newest
  // current entry; (4) no-op if nothing is published yet.
  // 0806A: returns true only on the branch that actually calls
  // _setSelection() (and therefore _notify()) — callers use this to know
  // whether to abort their own render and wait for the resulting scheduled
  // render rather than composing against a selection they just mutated.
  function ensureDefaultCourseSelection() {
    var list = _currentCoursePackages();
    if (list.length === 0) return false;
    if (_selection.selectedCoursePackageId && list.some(function (p) { return p.id === _selection.selectedCoursePackageId; })) {
      return false;
    }
    var active = SBE.RacetrackCoursePackageRuntime ? SBE.RacetrackCoursePackageRuntime.getActiveCoursePackage() : null;
    if (active) {
      var sameCourse = list.filter(function (p) { return p.sourceRaceCourseId === active.sourceRaceCourseId; })[0];
      if (sameCourse) {
        _setSelection({ selectedCoursePackageId: sameCourse.id });
        return true;
      }
    }
    _setSelection({ selectedCoursePackageId: list[0].id });
    return true;
  }

  function getSelectedCoursePackage() {
    var list = _currentCoursePackages();
    var match = list.filter(function (p) { return p.id === _selection.selectedCoursePackageId; })[0];
    if (match) return match;
    return SBE.RacetrackCoursePackageRuntime ? SBE.RacetrackCoursePackageRuntime.getActiveCoursePackage() : null;
  }

  function _courseIndex(list) {
    var i = -1;
    for (var k = 0; k < list.length; k++) {
      if (list[k].id === _selection.selectedCoursePackageId) { i = k; break; }
    }
    return i;
  }

  function nextCoursePackage() {
    var list = _currentCoursePackages();
    if (list.length <= 1) return;
    var i = _courseIndex(list);
    var nextI = _cycleIndex(i === -1 ? 0 : i, list.length, i === -1 ? 0 : 1);
    _setSelection({ selectedCoursePackageId: list[nextI].id });
  }

  function prevCoursePackage() {
    var list = _currentCoursePackages();
    if (list.length <= 1) return;
    var i = _courseIndex(list);
    var prevI = _cycleIndex(i === -1 ? 0 : i, list.length, i === -1 ? 0 : -1);
    _setSelection({ selectedCoursePackageId: list[prevI].id });
  }

  // ── Competitor roster (capped by the active Game Format's min/max) ─────────

  function getRoster() {
    var catalog = listCompetitors();
    return _selection.rosterIds
      .map(function (id) { return catalog.filter(function (c) { return c.id === id; })[0] || null; })
      .filter(function (c) { return !!c; });
  }

  function addToRoster(id) {
    if (_selection.rosterIds.indexOf(id) !== -1) return;
    var format = getActiveGameFormat();
    var max = format ? format.maxCompetitors : Infinity;
    if (_selection.rosterIds.length >= max) return;
    _setSelection({ rosterIds: _selection.rosterIds.concat([id]) });
  }

  function removeFromRoster(id) {
    _setSelection({ rosterIds: _selection.rosterIds.filter(function (r) { return r !== id; }) });
  }

  // Seeds a default roster (up to 3 real competitors) the first time the
  // catalog becomes available and the roster is still empty — so Lobby
  // readiness is reachable without forcing interaction, while add/remove
  // still genuinely works afterward.
  // 0806A: returns true only when it actually calls _setSelection() — same
  // abort-and-wait contract as ensureDefaultCourseSelection() above.
  function ensureDefaultRoster() {
    if (_selection.rosterIds.length > 0) return false;
    var catalog = listCompetitors();
    if (catalog.length === 0) return false;
    var format = getActiveGameFormat();
    var target = Math.min(catalog.length, format ? Math.max(format.minCompetitors, Math.min(3, format.maxCompetitors)) : 3);
    _setSelection({ rosterIds: catalog.slice(0, target).map(function (c) { return c.id; }) });
    return true;
  }

  // ── Readiness ────────────────────────────────────────────────────────────

  function _buildReadinessContext() {
    var coursePackage = getSelectedCoursePackage();
    return {
      coursePackage: coursePackage,
      gameFormat: getActiveGameFormat(),
      competitors: getRoster(),
      playlistAvailable: listPlaylists().length > 0,
      seed: _selection.seed,
    };
  }

  function getReadiness() {
    if (!SBE.RacetrackReadiness) return { ready: false, reasons: ['missing_course_package'] };
    return SBE.RacetrackReadiness.computeRacetrackReadiness(_buildReadinessContext());
  }

  // ── Session snapshot (Enter Lobby) ──────────────────────────────────────

  function getSnapshot() { return _snapshot; }
  function getSnapshotRestoreState() { return _snapshotRestoreState; }
  function getIsEnteringLobby() { return _enteringLobby; }
  function getEnterLobbyError() { return _enterLobbyError; }

  // The DURABLE record shape (requirement 3): the full RacetrackCoursePackage
  // is deliberately NOT duplicated here — only its identity. The package's
  // own immutable record already lives forever in MAPS_RACETRACK_PACKAGE_DB
  // (enforced by racetrackCoursePackageStorage.ts's save-time immutability
  // guard), so resolving by {id,version,fingerprint} at restore time always
  // returns the exact same object, without a second multi-field copy.
  function _toPersistedRecord(frozen) {
    var pkg = frozen.coursePackage;
    return {
      id: frozen.id,
      gameInstanceId: frozen.gameInstanceId,
      gameFormatSnapshot: frozen.gameFormatSnapshot,
      coursePackageRef: { id: pkg.id, version: pkg.version, fingerprint: pkg.sourceRaceCourseFingerprint },
      competitorSnapshots: frozen.competitorSnapshots,
      playlistSnapshot: frozen.playlistSnapshot,
      seed: frozen.seed,
      scene: frozen.scene,
      createdAt: frozen.createdAt,
    };
  }

  // Required correction: validated on the way back OUT too, not just
  // trusted because a record with a matching id was found — id, version,
  // AND fingerprint must all agree with what was saved at snapshot-creation
  // time.
  function _packageMatchesRef(pkg, ref) {
    return !!pkg && !!ref && pkg.id === ref.id && pkg.version === ref.version && pkg.sourceRaceCourseFingerprint === ref.fingerprint;
  }

  // Required correction (no fire-and-forget): the full record is durably
  // saved FIRST; scene:'lobby' only ever commits once that save has
  // genuinely succeeded. Rejects re-entry while already pending (the
  // duplicate-click guard) and reports a real, actionable error on failure
  // — the user stays on Selection, never a silently half-committed session.
  function enterLobby() {
    if (_enteringLobby) return Promise.resolve({ ok: false, reason: 'already_pending' });

    var readiness = getReadiness();
    if (!readiness.ready) return Promise.resolve({ ok: false, reasons: readiness.reasons });

    var coursePackage = getSelectedCoursePackage();
    var gameFormat = getActiveGameFormat();
    var roster = getRoster();
    var playlist = getActivePlaylist();

    var candidate = {
      id: _genId('racetrackSession'),
      gameInstanceId: null,
      gameFormatSnapshot: {
        id: gameFormat.id, name: gameFormat.name, objective: gameFormat.objective,
        minCompetitors: gameFormat.minCompetitors, maxCompetitors: gameFormat.maxCompetitors,
        reward: gameFormat.reward, stakes: gameFormat.stakes, mode: gameFormat.mode,
      },
      coursePackage: coursePackage,
      competitorSnapshots: roster.map(function (c) {
        return { id: c.id, name: c.name, team: c.team, orbProfileId: c.orbProfileId };
      }),
      playlistSnapshot: playlist ? {
        playlistId: playlist.playlistId, title: playlist.title, trackCount: playlist.trackCount,
        targetDurationMinutes: playlist.targetDurationMinutes, moodTags: playlist.moodTags,
      } : null,
      seed: _selection.seed,
      scene: 'lobby',
      createdAt: Date.now(),
    };

    // Deep, fresh copy — freezes the snapshot away from every live source
    // (catalog mirrors, the course package runtime's own object) so nothing
    // downstream can alias back into them. A source edit after this point
    // can never change what Lobby renders.
    var frozen = JSON.parse(JSON.stringify(candidate));

    if (SBE.RacetrackReadiness && !SBE.RacetrackReadiness.validateRacetrackSessionSnapshot(frozen)) {
      return Promise.resolve({ ok: false, reasons: ['snapshot_invalid'] });
    }

    var storage = SBE.RacetrackSessionSnapshotStorage;
    if (!storage) {
      _enterLobbyError = 'Session storage is unavailable — cannot enter Lobby.';
      _notify();
      return Promise.resolve({ ok: false, reason: 'storage_unavailable', message: _enterLobbyError });
    }

    _enteringLobby = true;
    _enterLobbyError = null;
    _notify(); // shows the pending state on the button immediately

    return storage.saveActiveSession(_toPersistedRecord(frozen)).then(function () {
      _enteringLobby = false;
      _snapshot = frozen;
      _snapshotRestoreState = 'ready';
      _setSelection({ scene: 'lobby' }); // commits scene + persists selection + notifies
      return { ok: true, snapshot: frozen };
    }).catch(function (e) {
      _enteringLobby = false;
      _enterLobbyError = (e && e.message) || 'Could not save session — please try again.';
      _notify();
      return { ok: false, reason: 'persist_failed', message: _enterLobbyError };
    });
  }

  // Runs once at boot if the persisted scene claims 'lobby' — resolves the
  // durable record, re-validates the Course Package's own saved identity
  // (never "whatever's active now"), and only ever lands on Lobby if
  // everything checks out. ANY failure (no pointer, no record, unresolvable
  // package, id/version/fingerprint mismatch, failed structural validation)
  // falls back to 'selection' internally — the UI never renders a broken
  // Lobby view (requirement 5).
  function _restoreSessionIfNeeded() {
    if (_selection.scene !== 'lobby') return Promise.resolve();

    var storage = SBE.RacetrackSessionSnapshotStorage;
    var packageRuntime = SBE.RacetrackCoursePackageRuntime;
    if (!storage || !packageRuntime) {
      _snapshotRestoreState = 'unavailable';
      _setSelection({ scene: 'selection' });
      return Promise.resolve();
    }

    _snapshotRestoreState = 'restoring';
    _notify();

    return storage.loadActiveSession().then(function (record) {
      if (!record) throw new Error('no persisted session record for the active pointer');
      return packageRuntime.getCoursePackageById(record.coursePackageRef.id).then(function (pkg) {
        if (!_packageMatchesRef(pkg, record.coursePackageRef)) {
          throw new Error('resolved Course Package id/version/fingerprint does not match the saved reference');
        }
        var reconstructed = {
          id: record.id,
          gameInstanceId: record.gameInstanceId,
          gameFormatSnapshot: record.gameFormatSnapshot,
          coursePackage: pkg,
          competitorSnapshots: record.competitorSnapshots,
          playlistSnapshot: record.playlistSnapshot,
          seed: record.seed,
          scene: record.scene,
          createdAt: record.createdAt,
        };
        if (SBE.RacetrackReadiness && !SBE.RacetrackReadiness.validateRacetrackSessionSnapshot(reconstructed)) {
          throw new Error('restored snapshot failed structural validation');
        }
        _snapshot = reconstructed;
        _snapshotRestoreState = 'ready';
        _notify();
      });
    }).catch(function (e) {
      console.warn('[RacetrackSessionRuntime] session restore failed, falling back to Selection:', e && e.message || e);
      _snapshot = null;
      _snapshotRestoreState = 'unavailable';
      _setSelection({ scene: 'selection' }); // notifies
    });
  }

  // Refresh subscribers whenever a catalog mirror or the course package
  // changes while RACETRACK is open — the catalogs themselves are read
  // fresh on every getter call above (no local caching to invalidate), this
  // just re-triggers UI re-render.
  global.addEventListener('storage', function (e) {
    if (e.key === GAME_FORMAT_CATALOG_KEY || e.key === COMPETITOR_CATALOG_KEY || e.key === PLAYLIST_CATALOG_KEY) {
      ensureDefaultRoster();
      _notify();
    }
  });
  if (SBE.RacetrackCoursePackageRuntime) {
    SBE.RacetrackCoursePackageRuntime.subscribe(function () { _notify(); });
  }

  _restoreSessionIfNeeded();

  SBE.RacetrackSessionRuntime = Object.freeze({
    VERSION: VERSION,
    SCENES: SCENES,

    getScene: getScene,
    enterSelection: enterSelection,
    returnToAttract: returnToAttract,
    backToSelectionFromLobby: backToSelectionFromLobby,
    transitionScene: transitionScene,

    listGameFormats: listGameFormats,
    listCompetitors: listCompetitors,
    listPlaylists: listPlaylists,
    getGameFormatCatalogStatus: getGameFormatCatalogStatus,
    getCompetitorCatalogStatus: getCompetitorCatalogStatus,
    getPlaylistCatalogStatus: getPlaylistCatalogStatus,

    nextCompetitor: nextCompetitor,
    prevCompetitor: prevCompetitor,
    getFeaturedCompetitor: getFeaturedCompetitor,

    nextGameFormat: nextGameFormat,
    prevGameFormat: prevGameFormat,
    getActiveGameFormat: getActiveGameFormat,

    nextPlaylist: nextPlaylist,
    prevPlaylist: prevPlaylist,
    getActivePlaylist: getActivePlaylist,

    ensureDefaultCourseSelection: ensureDefaultCourseSelection,
    getSelectedCoursePackage: getSelectedCoursePackage,
    nextCoursePackage: nextCoursePackage,
    prevCoursePackage: prevCoursePackage,

    getRoster: getRoster,
    addToRoster: addToRoster,
    removeFromRoster: removeFromRoster,
    ensureDefaultRoster: ensureDefaultRoster,

    getReadiness: getReadiness,
    enterLobby: enterLobby,
    getSnapshot: getSnapshot,
    getSnapshotRestoreState: getSnapshotRestoreState,
    getIsEnteringLobby: getIsEnteringLobby,
    getEnterLobbyError: getEnterLobbyError,

    subscribe: function (fn) {
      _listeners.push(fn);
      return function () {
        var i = _listeners.indexOf(fn);
        if (i !== -1) _listeners.splice(i, 1);
      };
    },

    // Test-only — never used by production code.
    __test: {
      getSelection: function () { return _selection; },
      resetSelection: function () {
        _selection = _defaultSelection();
        _persistSelection();
        _snapshot = null;
        _snapshotRestoreState = 'idle';
        _enteringLobby = false;
        _enterLobbyError = null;
      },
      // Simulates "close the tab, reopen it" without a real page reload:
      // re-reads `_selection` fresh from localStorage (exactly what a new
      // script load would do) and re-runs the async restore logic. Returns
      // the restore promise so tests can await it.
      reinitialize: function () {
        _selection = _loadSelection();
        _snapshot = null;
        _snapshotRestoreState = 'idle';
        _enteringLobby = false;
        _enterLobbyError = null;
        return _restoreSessionIfNeeded();
      },
    },
  });

  console.log('[RacetrackSessionRuntime] v' + VERSION + ' loaded');

})(window);
