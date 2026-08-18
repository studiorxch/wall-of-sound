// ── SubwayArtworkAuthority v1.0.0 ─────────────────────────────────────────────
// 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0_BUILD — Data Layer §9-10
// Status: active | Classification: runtime-authority (persistent — localStorage)
//
// Owns Artwork record identity, independent of where (or whether) it is
// currently placed — a dedicated authority, separate from
// SubwayArtworkPlacementAuthority (BUILD §11 explicit requirement: "Create a
// placement authority separate from Artwork"). The same artwork may appear
// in zero, one, or many placements over its lifetime; deleting/covering a
// placement never touches the artwork record itself.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:subwayArtworkAuthority:v1';

  // BUILD §10 — supported now; do not fake Resident/user identities beyond
  // this enum. creatorId stays nullable until a real identity system exists.
  var CREATOR_TYPES = Object.freeze(['system', 'user', 'resident', 'invited_artist', 'unknown']);
  var STATUSES = Object.freeze(['draft', 'active', 'archived']);

  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  var _artworks = {};
  var _nextArtCounter = 1;
  var _loaded = false;
  var _listeners = [];

  function _notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function subscribe(fn) { _listeners.push(fn); return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); }; }

  function _mintArtId() { var id = 'sr-art-' + String(_nextArtCounter).padStart(6, '0'); _nextArtCounter++; return id; }

  function _save() {
    var ls = _ls(); if (!ls) return false;
    try { ls.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, nextArtCounter: _nextArtCounter, artworks: _artworks })); return true; }
    catch (e) { console.warn('[SubwayArtworkAuthority] save failed:', e && e.message || e); return false; }
  }

  function _load() {
    if (_loaded) return true;
    _loaded = true;
    var ls = _ls(); if (!ls) return false;
    try {
      var raw = ls.getItem(STORAGE_KEY);
      if (!raw) return true;
      var parsed = JSON.parse(raw);
      _artworks = (parsed && parsed.artworks) || {};
      _nextArtCounter = (parsed && parsed.nextArtCounter) || 1;
      return true;
    } catch (e) {
      console.warn('[SubwayArtworkAuthority] load failed (starting empty):', e && e.message || e);
      _artworks = {}; _nextArtCounter = 1;
      return false;
    }
  }

  // creatorType required; everything else optional. No canvas/media content
  // is authored here — sourceRef is an opaque pointer for a future drawing
  // app to fill in, never rendered by this build.
  function createArtwork(input) {
    _load();
    if (!input || !input.creatorType || CREATOR_TYPES.indexOf(input.creatorType) === -1) {
      return { ok: false, reason: 'invalid_creator_type' };
    }
    var now = (input.now) || Date.now();
    var id = _mintArtId();
    _artworks[id] = {
      id: id,
      creatorType: input.creatorType,
      creatorId: input.creatorId || null,
      title: input.title || null,
      sourceType: input.sourceType || 'seed',
      sourceRef: input.sourceRef || null,
      createdAt: now, updatedAt: now,
      status: input.status && STATUSES.indexOf(input.status) !== -1 ? input.status : 'active',
      metadata: input.metadata || {},
    };
    _save();
    _notify();
    return { ok: true, data: _artworks[id] };
  }

  function getArtwork(id) { _load(); return _artworks[id] || null; }
  function getAllArtworks() { _load(); return Object.keys(_artworks).map(function (k) { return _artworks[k]; }); }

  function updateArtworkStatus(id, status) {
    _load();
    var art = _artworks[id];
    if (!art) return { ok: false, reason: 'not_found' };
    if (STATUSES.indexOf(status) === -1) return { ok: false, reason: 'invalid_status' };
    art.status = status;
    art.updatedAt = Date.now();
    _save();
    _notify();
    return { ok: true, data: art };
  }

  function getDiagnostics() {
    _load();
    var all = getAllArtworks();
    var idSet = {}, collisions = 0;
    all.forEach(function (a) { if (idSet[a.id]) collisions++; idSet[a.id] = true; });
    return { version: VERSION, artworkCount: all.length, artworkCollisionCount: collisions };
  }

  function __resetForTests() {
    _artworks = {}; _nextArtCounter = 1; _loaded = true;
    var ls = _ls(); if (ls) { try { ls.removeItem(STORAGE_KEY); } catch (e) {} }
  }

  SBE.SubwayArtworkAuthority = Object.freeze({
    VERSION: VERSION,
    CREATOR_TYPES: CREATOR_TYPES,
    STATUSES: STATUSES,
    createArtwork: createArtwork,
    getArtwork: getArtwork,
    getAllArtworks: getAllArtworks,
    updateArtworkStatus: updateArtworkStatus,
    getDiagnostics: getDiagnostics,
    subscribe: subscribe,
    __resetForTests: __resetForTests,
  });

  console.log('[SubwayArtworkAuthority] v' + VERSION + ' loaded (persistent — independent of placement)');
})(window);
