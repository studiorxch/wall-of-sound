// ── RacetrackSessionSnapshotStorage v1.0.0 ────────────────────────────────────
// 0805G_RACETRACK_Session_Snapshot_Durability
// Status: active | Classification: presentation / racetrack-session-storage
//
// Durable same-origin persistence for the frozen RacetrackSessionSnapshot —
// wall/-native only (never shared with MUSIC's own toolchain, unlike
// racetrackCoursePackageStorage.ts's genuinely cross-context DB). Mirrors
// that same pointer+IndexedDB pattern one level up: the FULL snapshot
// record lives in `RACETRACK_SESSION_DB` (same-origin IndexedDB), and
// `localStorage`'s `wos:racetrack:activeSessionId` holds ONLY the active
// session's id — never the snapshot itself. Deliberately a DIFFERENT
// localStorage key from `wos:racetrack:selection` (scene/indices/roster/
// seed) — selection persistence and session-snapshot persistence are two
// independent mechanisms, so clearing one never accidentally clears the
// other.
//
// REQUIRED CORRECTION (0805G): saveActiveSession() writes the full record
// to IndexedDB FIRST, and only writes the localStorage pointer once that
// write has genuinely succeeded — a caller (racetrackSessionRuntime.js)
// must never treat a session as "active" (and never commit scene:'lobby')
// before its complete record is durably stored. clearActiveSession()
// removes ONLY the pointer (the requirement's own literal wording) — the
// IndexedDB record itself is left in place as a harmless historical row, a
// deliberate choice (avoids a needless extra transaction on every "Back to
// Selection" click, and leaves room for a future session-history feature),
// not an oversight.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var DB_NAME       = 'RACETRACK_SESSION_DB';
  var DB_VERSION    = 1;
  var SESSION_STORE = 'racetrackSessions'; // keyPath: 'id'
  var POINTER_KEY   = 'wos:racetrack:activeSessionId';

  var _db = null;

  function _openDB() {
    if (_db) return Promise.resolve(_db);
    return new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(SESSION_STORE)) {
          db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () {
        _db = req.result;
        _db.onclose = function () { _db = null; };
        resolve(_db);
      };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _put(db, record) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(SESSION_STORE, 'readwrite').objectStore(SESSION_STORE).put(record);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _get(db, id) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(SESSION_STORE, 'readonly').objectStore(SESSION_STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function _readPointer() {
    try { return global.localStorage.getItem(POINTER_KEY); } catch (e) { return null; }
  }
  function _writePointer(id) {
    try { global.localStorage.setItem(POINTER_KEY, id); } catch (e) { /* best-effort — a write that reached IndexedDB but not localStorage just means a future reopen won't find it, not a corruption */ }
  }
  function _clearPointer() {
    try { global.localStorage.removeItem(POINTER_KEY); } catch (e) { /* best-effort */ }
  }

  // Save-then-commit ordering (required correction): the pointer is only
  // ever written AFTER the full record is confirmed durably stored.
  function saveActiveSession(record) {
    return _openDB()
      .then(function (db) { return _put(db, record); })
      .then(function () { _writePointer(record.id); });
  }

  function loadActiveSession() {
    var id = _readPointer();
    if (!id) return Promise.resolve(null);
    return _openDB().then(function (db) { return _get(db, id); });
  }

  function clearActiveSession() {
    _clearPointer();
  }

  SBE.RacetrackSessionSnapshotStorage = Object.freeze({
    VERSION: VERSION,
    saveActiveSession: saveActiveSession,
    loadActiveSession: loadActiveSession,
    clearActiveSession: clearActiveSession,
  });

  console.log('[RacetrackSessionSnapshotStorage] v' + VERSION + ' loaded');

})(window);
