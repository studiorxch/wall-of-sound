// ── OrbProfileAuthority v1.0.0 ────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
// Status: active | Classification: presentation-authority / orb-profile-authority
//
// Single source of truth for Orb Profiles: record CRUD, Active/Preview state,
// persistence, cross-tab sync, and driving OrbProfileRenderer. Record-centered
// (mirrors MapsGeographicStyleAuthority's CRUD/Active/Preview shape) — NOT a
// flattened values-blob like VehicleStyleAuthority, since each Orb Profile is
// a full, independent nested record, not a set of values for one shared
// external object.
//
// Authority boundary:
//   OWNS: Orb Profile records, active/preview state, persistence, and driving
//         OrbProfileRenderer's activate/rebuild/refresh calls.
//   READS: OrbProfileRegistry (field schema), OrbObjectFactory (structural
//          field list, via OrbProfileApplyAdapters).
//   WRITES: localStorage (wos:orbProfile:*) for cross-tab sync.
//
// Cross-tab sync: activateOrbProfile() writes the active id to localStorage;
// other tabs' 'storage' listener re-applies. Profile edits (create/duplicate/
// rename/setPropertyValue/delete) are written as one JSON blob and picked up
// the same way. Preview is NEVER written to storage — in-memory/per-tab only,
// so it can never leak into another tab's active state or survive a reload.
//
// Placement: wall/systems/presentation/orbProfileAuthority.js
// Load: AFTER orbProfileRegistry.js and orbProfileApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_RECORDS_KEY = 'wos:orbProfile:records';
  var STORAGE_ACTIVE_KEY  = 'wos:orbProfile:activeId';
  var STORAGE_SCHEMA_KEY  = 'wos:orbProfile:schemaVersion';
  var STORAGE_SEEDED_KEY  = 'wos:orbProfile:seeded';
  var SCHEMA_VERSION      = 1;

  var _map        = null;
  var _profiles   = {};       // id -> OrbProfile
  var _activeId   = null;
  var _previewId  = null;     // transient — never persisted
  var _listeners  = [];

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[OrbProfileAuthority] subscriber threw:', e && e.message || e); }
    });
  }

  function _genId() {
    return 'orb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  function _loadRecords() {
    try {
      var raw = global.localStorage.getItem(STORAGE_RECORDS_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }

  function _saveRecords() {
    try { global.localStorage.setItem(STORAGE_RECORDS_KEY, JSON.stringify(_profiles)); }
    catch (e) { console.warn('[OrbProfileAuthority] _saveRecords failed:', e && e.message || e); }
  }

  function _loadActiveId() {
    try { return global.localStorage.getItem(STORAGE_ACTIVE_KEY); } catch (e) { return null; }
  }

  function _saveActiveId(id) {
    try { global.localStorage.setItem(STORAGE_ACTIVE_KEY, id); } catch (e) {}
  }

  // ── Apply to renderer ──────────────────────────────────────────────────────
  function _renderProfile(profile) {
    var renderer = SBE.OrbProfileRenderer;
    if (!renderer || !profile) return;
    try { renderer.activate(profile); }
    catch (e) { console.warn('[OrbProfileAuthority] renderer.activate failed:', e && e.message || e); }
  }

  // ── Cross-tab sync ─────────────────────────────────────────────────────────
  function _onStorageEvent(e) {
    if (e.key === STORAGE_ACTIVE_KEY) {
      var id = e.newValue;
      if (!id || id === _activeId) return;
      if (!_profiles[id]) {
        var incoming = _loadRecords();
        Object.keys(incoming).forEach(function (pid) { _profiles[pid] = incoming[pid]; });
      }
      if (!_profiles[id]) return;
      _activeId  = id;
      _previewId = null;
      _renderProfile(_profiles[id]);
      console.log('[OrbProfileAuthority] cross-tab active orb →', id);
      _notify();
    } else if (e.key === STORAGE_RECORDS_KEY) {
      var records = _loadRecords();
      Object.keys(records).forEach(function (pid) { _profiles[pid] = records[pid]; });
      // An edit to the profile currently active/previewed in THIS tab must
      // still repaint this tab's own renderer — same condition
      // setPropertyValue() uses locally (see MapsGeographicStyleAuthority's
      // identical rationale for its own cross-tab handler).
      var liveId = _previewId != null ? _previewId : _activeId;
      if (Object.prototype.hasOwnProperty.call(records, liveId) && _profiles[liveId]) {
        _renderProfile(_profiles[liveId]);
      }
      _notify();
    }
  }

  // ── Seed archetypes (data lives in orbProfileSeeds.js) ────────────────────
  function _maybeSeed(stored) {
    var alreadySeeded = false;
    try { alreadySeeded = !!global.localStorage.getItem(STORAGE_SEEDED_KEY); } catch (e) {}
    if (alreadySeeded || Object.keys(stored).length > 0 || !SBE.OrbProfileSeeds) return null;
    var seeded = SBE.OrbProfileSeeds.buildSeedProfiles();
    var firstId = null;
    seeded.forEach(function (p) {
      _profiles[p.id] = p;
      if (firstId == null) firstId = p.id;
    });
    try { global.localStorage.setItem(STORAGE_SEEDED_KEY, '1'); } catch (e) {}
    return firstId;
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  // Data hydration (records/activeId/seeding) is map-independent — self-inits
  // immediately, same as VehicleStyleAuthority/OverlayStyleAuthority, so
  // MUSIC's catalog works with zero live-map dependency (MUSIC's page has no
  // MapboxViewportRuntime global at all — Orb's editor preview is a plain
  // standalone Three.js scene, not a Mapbox custom layer; see
  // orbPreviewRuntime.ts). _renderProfile()'s call into OrbProfileRenderer is
  // always attempted but degrades gracefully to a no-op wherever THREE/a real
  // map aren't present (exactly OrbProfileRenderer.activate()'s own
  // dependencies-unavailable branch) — only wall/index.html's canonical
  // LIVE MAP context has both, so only there does init(map) actually mount
  // the Orb custom layer.
  var _dataReady = false;

  function init(map) {
    if (map) _map = map;

    var stored = _loadRecords();
    _profiles = {};
    Object.keys(stored).forEach(function (id) { _profiles[id] = stored[id]; });

    var seededFirstId = _maybeSeed(stored);

    _activeId = _loadActiveId();
    if (!_activeId || !_profiles[_activeId]) {
      _activeId = seededFirstId || Object.keys(_profiles)[0] || null;
    }
    _previewId = null; // never promote a preview on load

    try { global.localStorage.setItem(STORAGE_SCHEMA_KEY, String(SCHEMA_VERSION)); } catch (e) {}
    _saveRecords();
    if (_activeId) _saveActiveId(_activeId);

    if (_activeId && _profiles[_activeId]) _renderProfile(_profiles[_activeId]);

    if (!_dataReady) {
      try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}
      _dataReady = true;
    }

    console.log('[OrbProfileAuthority] init — ' + Object.keys(_profiles).length + ' profiles, active:', _activeId);
    return { ok: true, profileCount: Object.keys(_profiles).length, activeId: _activeId };
  }

  function isInitialized() { return _dataReady; }

  // ── CRUD ───────────────────────────────────────────────────────────────────
  function listOrbProfiles() {
    return Object.keys(_profiles).map(function (id) { return _profiles[id]; })
      .sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
  }

  function getOrbProfile(id) { return _profiles[id] || null; }

  function createOrbProfile(archetype, name) {
    var id = _genId();
    var base = SBE.OrbProfileSeeds ? SBE.OrbProfileSeeds.buildDefaultsFor(archetype || 'core-sphere') : null;
    if (!base) return null;
    var now = Date.now();
    var p = Object.assign({}, base, {
      id: id, name: name || 'New Orb', createdAt: now, updatedAt: now, runtimeStatus: 'ready',
    });
    _profiles[id] = p;
    _saveRecords();
    _notify();
    return p;
  }

  function duplicateOrbProfile(sourceId) {
    var src = _profiles[sourceId];
    if (!src) return null;
    var id = _genId();
    var now = Date.now();
    var p = JSON.parse(JSON.stringify(src));
    p.id = id;
    p.name = src.name + ' Copy';
    p.createdAt = now;
    p.updatedAt = now;
    _profiles[id] = p;
    _saveRecords();
    _notify();
    return p;
  }

  function renameOrbProfile(id, name) {
    var p = _profiles[id];
    if (!p) return { ok: false, reason: 'not_found' };
    var trimmed = (name || '').trim();
    if (!trimmed) return { ok: false, reason: 'empty_name' };
    p.name = trimmed;
    p.updatedAt = Date.now();
    _saveRecords();
    _notify();
    return { ok: true };
  }

  function setPropertyValue(id, propId, value) {
    var p = _profiles[id];
    if (!p) return { ok: false, reason: 'not_found' };
    var registry = SBE.OrbProfileRegistry;
    if (!registry) return { ok: false, reason: 'registry_unavailable' };
    registry.setPath(p, propId, value);
    p.updatedAt = Date.now();
    _saveRecords();
    if (id === _previewId || (id === _activeId && _previewId == null)) {
      var adapters = SBE.OrbProfileApplyAdapters;
      if (adapters) adapters.apply(propId, p);
    }
    _notify();
    return { ok: true };
  }

  function deleteOrbProfile(id) {
    if (!_profiles[id]) return { ok: false, reason: 'not_found' };
    if (id === _activeId) return { ok: false, reason: 'active_profile_protected' };
    if (Object.keys(_profiles).length <= 1) return { ok: false, reason: 'last_profile_protected' };
    delete _profiles[id];
    if (_previewId === id) _previewId = null;
    _saveRecords();
    _notify();
    return { ok: true };
  }

  // ── State machine — Active / Preview ──────────────────────────────────────
  function activateOrbProfile(id) {
    var p = _profiles[id];
    if (!p) return { ok: false, reason: 'not_found' };
    _activeId  = id;
    _previewId = null;
    _saveActiveId(id);
    _renderProfile(p);
    _notify();
    return { ok: true };
  }

  function previewOrbProfile(id) {
    var p = _profiles[id];
    if (!p) return { ok: false, reason: 'not_found' };
    _previewId = id;
    _renderProfile(p);
    _notify();
    return { ok: true };
  }

  function endPreview() {
    if (_previewId == null) return { ok: true, noop: true };
    _previewId = null;
    var active = _profiles[_activeId];
    if (active) _renderProfile(active);
    _notify();
    return { ok: true };
  }

  function getActiveId()  { return _activeId; }
  function getPreviewId() { return _previewId; }

  SBE.OrbProfileAuthority = {
    VERSION: VERSION,
    init: init,
    isInitialized: isInitialized,
    listOrbProfiles: listOrbProfiles,
    getOrbProfile: getOrbProfile,
    createOrbProfile: createOrbProfile,
    duplicateOrbProfile: duplicateOrbProfile,
    renameOrbProfile: renameOrbProfile,
    setPropertyValue: setPropertyValue,
    deleteOrbProfile: deleteOrbProfile,
    activateOrbProfile: activateOrbProfile,
    previewOrbProfile: previewOrbProfile,
    endPreview: endPreview,
    getActiveId: getActiveId,
    getPreviewId: getPreviewId,
    subscribe: function (fn) {
      _listeners.push(fn);
      return function unsubscribe() {
        var i = _listeners.indexOf(fn);
        if (i >= 0) _listeners.splice(i, 1);
      };
    },
    // Test-only accessors — never surfaced in production UI (same convention
    // as MapsGeographicStyleAuthority's __test surface).
    __test: {
      getActiveIdFromStorage: function () {
        try { return global.localStorage.getItem(STORAGE_ACTIVE_KEY); } catch (e) { return null; }
      },
      removeOrbProfile: function (id) { delete _profiles[id]; _saveRecords(); },
      simulateStorageEvent: function (key, newValue) { _onStorageEvent({ key: key, newValue: newValue }); },
      // Exact round-trip of the entire in-memory + persisted profile store —
      // lets a test safely shrink the store to exercise the "last profile"
      // delete guard, then restore precisely what was there before, rather
      // than deleting real seeded/user profiles with no way back.
      snapshotAll: function () {
        return { profiles: JSON.parse(JSON.stringify(_profiles)), activeId: _activeId, previewId: _previewId };
      },
      restoreAll: function (snapshot) {
        _profiles = JSON.parse(JSON.stringify(snapshot.profiles));
        _activeId = snapshot.activeId;
        _previewId = snapshot.previewId;
        _saveRecords();
        if (_activeId) _saveActiveId(_activeId);
        _notify();
      },
      STORAGE_ACTIVE_KEY: STORAGE_ACTIVE_KEY,
      STORAGE_RECORDS_KEY: STORAGE_RECORDS_KEY,
    },
  };

  // ── Self-wiring ────────────────────────────────────────────────────────────
  // Data hydration runs immediately, no map dependency (matches Vehicles/
  // Overlays) — this is what makes MUSIC's catalog work with zero live map.
  init(null);
  // On canonical LIVE MAP (wall/index.html), also re-run once the real map/
  // style is ready, so the renderer can actually mount its Mapbox custom
  // layer — a genuine no-op in MUSIC, which has no MapboxViewportRuntime.
  (function () {
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onStyleLoad === 'function') {
      mvr.onStyleLoad(function () { init(mvr.getMap()); });
    } else if (mvr && typeof mvr.onReady === 'function') {
      mvr.onReady(function () { init(mvr.getMap()); });
    }
  })();

  console.log('[OrbProfileAuthority] v' + VERSION + ' loaded');

})(window);
