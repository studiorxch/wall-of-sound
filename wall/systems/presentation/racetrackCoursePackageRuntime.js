// ── RacetrackCoursePackageRuntime v1.0.0 ──────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
// Status: active | Classification: presentation / racetrack-course-package
//
// Read-only consumer of the ONE compiled Course Package MUSIC publishes.
// Per plan review's required correction, the full package (route/samples/
// preview/checkpoints/anchors) lives in same-origin IndexedDB
// ("MAPS_RACETRACK_PACKAGE_DB") — never duplicated into localStorage.
// localStorage carries ONLY a slim change-signal pointer
// ("wos:racetrack:coursePackage:pointer": {id,version,fingerprint,
// updatedAt}) — this module reads that pointer, then fetches the full
// record directly from the shared database (same origin via the existing
// /wall-app Vite proxy — no bridge, no localStorage duplication of a
// potentially multi-MB payload).
//
// SCHEMA CONTRACT with music/src/maps/racetrackCoursePackageStorage.ts:
// DB_NAME/DB_VERSION/PACKAGE_STORE below and the object store's keyPath
// MUST match that file's constants exactly. There is no shared TypeScript
// type across this toolchain boundary (wall/ is plain JS) to enforce it —
// if either side's constants change, update the other.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var DB_NAME       = 'MAPS_RACETRACK_PACKAGE_DB';
  var DB_VERSION    = 1;
  var PACKAGE_STORE = 'racetrackPackages'; // keyPath: 'id'
  var POINTER_KEY   = 'wos:racetrack:coursePackage:pointer';

  var _package     = null;
  var _pointer     = null;
  var _currentList = []; // 0805H — one entry per sourceRaceCourseId, newest version only
  var _listeners   = [];

  // 0806A — the "required RACETRACK mirror is ready" gate: true once the
  // module's initial active-package load AND current-published-list load
  // have EACH resolved at least once (regardless of what they resolved TO —
  // null/empty is a valid resolved state, not "still loading"). Never reset
  // back to false by a later reload() — this only gates the very first
  // Selection composition, not every refresh.
  var _activeLoadedOnce = false;
  var _listLoadedOnce   = false;
  var _hydrated         = false;

  function _markHydratedIfReady() {
    if (_hydrated || !_activeLoadedOnce || !_listLoadedOnce) return;
    _hydrated = true;
    _notify();
  }

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(_package); } catch (e) { /* subscriber error is not this module's concern */ }
    });
  }

  function _readPointer() {
    try {
      var raw = global.localStorage.getItem(POINTER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _openDB() {
    return new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      // wall/ never creates this database from scratch in normal use — it's
      // MUSIC's own compiled-package store. This upgrade handler only
      // matters if wall/ happens to open it before MUSIC ever has (an empty
      // store, matching the same createObjectStore call MUSIC's own
      // openRacetrackCoursePackageDB() uses, so the schema stays identical
      // regardless of which side opens it first).
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(PACKAGE_STORE)) {
          db.createObjectStore(PACKAGE_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _getById(db, id) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(PACKAGE_STORE, 'readonly').objectStore(PACKAGE_STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _getAllFromDB(db) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(PACKAGE_STORE, 'readonly').objectStore(PACKAGE_STORE).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // 0805H — mirrors music/src/maps/racetrackCoursePackageStore.ts's
  // compareRacetrackCoursePackagesNewestFirst EXACTLY (no shared module
  // across this JS/TS boundary, same duplication precedent as
  // DB_NAME/DB_VERSION/PACKAGE_STORE above — if one changes, change both).
  function _compareCoursePackagesNewestFirst(a, b) {
    var byPublishedAt = (b.publishedAt || 0) - (a.publishedAt || 0);
    if (byPublishedAt !== 0) return byPublishedAt;
    var byVersion = b.version - a.version;
    if (byVersion !== 0) return byVersion;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  // "Current" = one entry per sourceRaceCourseId, its newest version only —
  // mirrors selectCurrentPublishedRacetrackCoursePackages() exactly.
  function _selectCurrentPublishedPackages(all) {
    var currentByCourse = {};
    var order = [];
    all.forEach(function (p) {
      if (p.publishedAt == null) return;
      var existing = currentByCourse[p.sourceRaceCourseId];
      if (!existing) order.push(p.sourceRaceCourseId);
      if (!existing || _compareCoursePackagesNewestFirst(p, existing) < 0) {
        currentByCourse[p.sourceRaceCourseId] = p;
      }
    });
    return order.map(function (id) { return currentByCourse[id]; }).sort(_compareCoursePackagesNewestFirst);
  }

  function _loadCurrentPublishedList() {
    return _openDB()
      .then(function (db) { return _getAllFromDB(db); })
      .then(function (all) {
        _currentList = _selectCurrentPublishedPackages(all);
        _listLoadedOnce = true;
        _notify();
        _markHydratedIfReady();
        return _currentList;
      })
      .catch(function (e) {
        console.warn('[RacetrackCoursePackageRuntime] current-list load failed:', e && e.message || e);
        _currentList = [];
        _listLoadedOnce = true;
        _notify();
        _markHydratedIfReady();
        return _currentList;
      });
  }

  function _loadActivePackage() {
    var pointer = _readPointer();
    _pointer = pointer;
    if (!pointer || !pointer.id) {
      _package = null;
      _activeLoadedOnce = true;
      _notify();
      _markHydratedIfReady();
      return Promise.resolve(null);
    }
    return _openDB()
      .then(function (db) { return _getById(db, pointer.id); })
      .then(function (pkg) {
        _package = pkg;
        _activeLoadedOnce = true;
        _notify();
        _markHydratedIfReady();
        return pkg;
      })
      .catch(function (e) {
        console.warn('[RacetrackCoursePackageRuntime] load failed:', e && e.message || e);
        _package = null;
        _activeLoadedOnce = true;
        _notify();
        _markHydratedIfReady();
        return null;
      });
  }

  // Refreshes on the pointer's own storage event (MUSIC publishing a new/
  // updated package while this wall/ tab is already open) — never trusts
  // the pointer payload itself as anything more than "go re-read," and
  // always re-fetches the full record from IndexedDB fresh. writePointer()
  // fires on EVERY publish (new version or idempotent re-signal), so this
  // same event is also the right trigger to refresh the current-published
  // list (0805H) — no new storage key needed.
  global.addEventListener('storage', function (e) {
    if (e.key !== POINTER_KEY) return;
    _loadActivePackage();
    _loadCurrentPublishedList();
  });

  _loadActivePackage();
  _loadCurrentPublishedList();

  // 0805G — an independent read by id, NOT tied to the active pointer.
  // Session-snapshot restoration (racetrackSessionSnapshotStorage.js) needs
  // to resolve the EXACT package version that was active when a Lobby
  // snapshot was frozen, which may since have been superseded by a newer
  // published version — this must never silently return "whatever's active
  // now" instead. Each published version is a genuinely separate,
  // immutable IndexedDB record (racetrackCoursePackageStorage.ts's
  // save-time immutability guard enforces this), so this always returns
  // the exact same object for a given id, indefinitely.
  function getCoursePackageById(id) {
    return _openDB().then(function (db) { return _getById(db, id); });
  }

  SBE.RacetrackCoursePackageRuntime = Object.freeze({
    VERSION: VERSION,
    getActiveCoursePackage: function () { return _package; },
    getActivePointer: function () { return _pointer; },
    getCoursePackageById: getCoursePackageById,
    // 0805H — one entry per sourceRaceCourseId (its current/newest published
    // version only); historical versions stay retained/loadable via
    // getCoursePackageById, they just don't appear in this list.
    listCurrentPublishedCoursePackages: function () { return _currentList; },
    // 0806A — true once the initial active-package AND current-published-
    // list loads have each resolved at least once. racetrackSelectionScene.js
    // gates the first real Selection composition on this so it never
    // composes against a course package that simply hasn't loaded yet.
    isHydrated: function () { return _hydrated; },
    reload: function () {
      return Promise.all([_loadActivePackage(), _loadCurrentPublishedList()]);
    },
    subscribe: function (fn) {
      _listeners.push(fn);
      return function () {
        var i = _listeners.indexOf(fn);
        if (i !== -1) _listeners.splice(i, 1);
      };
    },
    // Test-only — never used by production code.
    __test: {
      selectCurrentPublished: _selectCurrentPublishedPackages,
    },
  });

  console.log('[RacetrackCoursePackageRuntime] v' + VERSION + ' loaded');

})(window);
