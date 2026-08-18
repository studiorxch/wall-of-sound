// ── MTASubwayStationLibrary v1.0.0 ────────────────────────────────────────────
// 0818_SUBWAY_Station_Library_Foundation_v1.0.0 — Data Layer
// Status: active | Classification: runtime-authority (persistent — localStorage)
//
// The permanent StudioRich place layer for SUBWAY, sitting between the
// normalized MTA transit model (mtaSubwayStaticAdapter.js + mtaSubwayIdentity.js)
// and the map. Mirrors the persistence/authority shape of
// mapsGeographicStyleAuthority.js / orbProfileAuthority.js (localStorage-backed,
// Object.freeze'd exports, subscribe() notification) but owns its OWN record
// type — a Station Library record, not a Geographic Style or Orb Profile.
//
// ── WHY THE STUDIORICH STATION ID IS NOT THE MTA STOP ID ────────────────────
// mtaSubwayIdentity.js's `subway:stop:<gtfsStopId>` ids are collision-safe
// TODAY, but they are still DERIVED from the current authoritative MTA
// stop_id. If MTA ever renumbers/reissues a stop_id upstream, a derived id
// would silently become a NEW station in this layer, losing all StudioRich-
// authored history for what is physically the same place — exactly what the
// "MTA Refresh Boundary" requirement forbids.
//
// This library therefore mints its OWN opaque, stable `studioRichStationId`
// ONCE, at record-creation time (a local incrementing counter — never derived
// from any MTA field, never derived from a display name), and stores the
// CURRENT authoritative MTA link as a separate, explicitly-updatable field
// (`authoritativeLink`). Re-importing the SAME underlying station never
// changes its studioRichStationId. If an upstream id ever needs to move to a
// different record, that is `reconcileAuthoritativeLink()` — an explicit,
// named, diagnosable action — never an implicit side effect of import.
//
// ── OWNERSHIP BOUNDARY ────────────────────────────────────────────────────────
//   record.operational   — refreshable, MTA-sourced cache. import*() may
//                           overwrite this block freely.
//   record.studioRich    — persistent, StudioRich-authored. import*() NEVER
//                           writes to this block under any circumstance.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:subwayStationLibrary:v1';

  function _staticAdapter() { return SBE.MTASubwayStaticAdapter || null; }
  function _identity() { return SBE.MTASubwayIdentity || null; }
  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  // ── State ─────────────────────────────────────────────────────────────────
  // recordsById: studioRichStationId -> record
  // linkIndex: gtfsStopId -> studioRichStationId  (the ONLY place identity is
  //            ever resolved by an authoritative id; never by display name)
  var _recordsById = {};
  var _linkIndex = {};
  var _nextIdCounter = 1;
  var _loaded = false;
  var _listeners = [];
  var _lastImport = null; // diagnostics from the most recent importFromStaticModel() call

  function _notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function subscribe(fn) { _listeners.push(fn); return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); }; }

  function _mintId() {
    var id = 'stlib-' + String(_nextIdCounter).padStart(6, '0');
    _nextIdCounter++;
    return id;
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  function _save() {
    var ls = _ls(); if (!ls) return false;
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION,
        nextIdCounter: _nextIdCounter,
        records: _recordsById,
      }));
      return true;
    } catch (e) { console.warn('[MTASubwayStationLibrary] save failed:', e && e.message || e); return false; }
  }

  function _rebuildLinkIndex() {
    _linkIndex = {};
    Object.keys(_recordsById).forEach(function (id) {
      var rec = _recordsById[id];
      if (rec.authoritativeLink && rec.authoritativeLink.gtfsStopId) {
        _linkIndex[rec.authoritativeLink.gtfsStopId] = id;
      }
    });
  }

  function _load() {
    if (_loaded) return true;
    _loaded = true;
    var ls = _ls(); if (!ls) return false;
    try {
      var raw = ls.getItem(STORAGE_KEY);
      if (!raw) return true; // no prior data — empty library is a valid start state
      var parsed = JSON.parse(raw);
      _recordsById = (parsed && parsed.records && typeof parsed.records === 'object') ? parsed.records : {};
      _nextIdCounter = (parsed && typeof parsed.nextIdCounter === 'number') ? parsed.nextIdCounter : 1;
      _rebuildLinkIndex();
      return true;
    } catch (e) {
      console.warn('[MTASubwayStationLibrary] load failed (starting empty):', e && e.message || e);
      _recordsById = {}; _linkIndex = {}; _nextIdCounter = 1;
      return false;
    }
  }

  // ── Import / link from the normalized static MTA model ──────────────────────
  // Reads real rows from mtaSubwayStaticAdapter.js (already validated there —
  // this function trusts it, but never trusts a display name for identity).
  // STATION-LEVEL stops only (kind === station, i.e. isStationLevel === true)
  // — this library models PLACES, not individual directional platforms; the
  // normalized transit model beneath already owns platform-level detail.
  function importFromStaticModel() {
    _load();
    var adapter = _staticAdapter();
    if (!adapter) return { ok: false, reason: 'static_adapter_unavailable' };
    var state = adapter.getState();
    if (!state.loaded) return { ok: false, reason: 'static_model_not_loaded' };

    var stops = adapter.getStops().filter(function (s) { return s.isStationLevel; });
    var complexById = {};
    adapter.getComplexes().forEach(function (c) { complexById[c.complexId] = c; });

    var created = 0, updated = 0, unchanged = 0;
    var seenGtfsStopIds = {};

    stops.forEach(function (stop) {
      seenGtfsStopIds[stop.stopId] = true;
      var complex = stop.complexId ? complexById[stop.complexId] : null;
      var operational = {
        displayName: stop.stopName || null,   // label only — never a key anywhere in this file
        latitude: stop.latitude,
        longitude: stop.longitude,
        borough: (complex && complex.borough) || null,
        // Not supplied by any current live MTA source this build ingests
        // (neither raw GTFS static nor the Stations-and-Complexes dataset
        // carries a neighborhood field) — left unpopulated rather than
        // fabricated. StudioRich may author it later via studioRich.neighborhood.
        neighborhood: null,
        routeIds: (complex && complex.routeIds) || [],
        complexId: stop.complexId || null,
        complexIsMultiStation: !!(complex && complex.isComplex),
        complexMemberStopIds: (complex && complex.memberStopIds) || [],
      };

      var existingId = _linkIndex[stop.stopId];
      if (existingId && _recordsById[existingId]) {
        var existing = _recordsById[existingId];
        var opJson = JSON.stringify(existing.operational);
        var newOpJson = JSON.stringify(operational);
        existing.operational = operational; // refreshable block — safe to overwrite
        existing.authoritativeLink.linkedAt = existing.authoritativeLink.linkedAt || Date.now();
        existing.lastRefreshedAt = Date.now();
        existing.updatedAt = Date.now();
        // existing.studioRich is NEVER touched here.
        if (opJson === newOpJson) unchanged++; else updated++;
      } else {
        var newId = _mintId();
        _recordsById[newId] = {
          studioRichStationId: newId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastRefreshedAt: Date.now(),
          authoritativeLink: {
            gtfsStopId: stop.stopId,
            complexId: stop.complexId || null,
            linkedAt: Date.now(),
            linkConfidence: 'exact_import',
          },
          operational: operational,
          studioRich: {
            notes: null,
            neighborhood: null,
            landmarkRefs: [],
            venueRefs: [],
            fieldRecordingRefs: [],
            musicRefs: [],
            radioRefs: [],
            graffitiWallRefs: [],
            residentRefs: [],
            cameraRefs: [],
            mediaRefs: [],
            worldOverrides: {},
            posterMetadata: {},
          },
        };
        _linkIndex[stop.stopId] = newId;
        created++;
      }
    });

    _save();
    _lastImport = {
      at: Date.now(),
      sourceStopCount: stops.length,
      created: created, updated: updated, unchanged: unchanged,
      seenGtfsStopIds: seenGtfsStopIds,
    };
    _notify();
    return { ok: true, created: created, updated: updated, unchanged: unchanged, total: stops.length };
  }

  // ── Diagnostics: explicit, never-auto-resolved migration surfacing ─────────
  // A static stop that has no linked library record after an import would
  // indicate importFromStaticModel() itself failed to create one (should
  // never happen in practice — surfaced only as a safety diagnostic).
  function getUnresolvedStaticStops() {
    _load();
    var adapter = _staticAdapter();
    if (!adapter) return [];
    return adapter.getStops().filter(function (s) { return s.isStationLevel; })
      .filter(function (s) { return !_linkIndex[s.stopId]; })
      .map(function (s) { return s.stopId; });
  }

  // A library record whose linked gtfsStopId no longer appears in the CURRENT
  // static model — the real "upstream identifier changed" signal. Never
  // auto-relinked; a human/future build calls reconcileAuthoritativeLink()
  // explicitly once the correct new stop_id is known.
  function getOrphanedLibraryRecords() {
    _load();
    var adapter = _staticAdapter();
    if (!adapter || !adapter.getState().loaded) return [];
    var currentStopIds = {};
    adapter.getStops().forEach(function (s) { currentStopIds[s.stopId] = true; });
    return Object.keys(_recordsById)
      .map(function (id) { return _recordsById[id]; })
      .filter(function (rec) { return rec.authoritativeLink.gtfsStopId && !currentStopIds[rec.authoritativeLink.gtfsStopId]; });
  }

  // Explicit re-link — the ONLY way a record's authoritative MTA link may
  // change after creation. Never called automatically by import.
  function reconcileAuthoritativeLink(studioRichStationId, newGtfsStopId, reason) {
    _load();
    var rec = _recordsById[studioRichStationId];
    if (!rec) return { ok: false, reason: 'not_found' };
    var oldStopId = rec.authoritativeLink.gtfsStopId;
    if (oldStopId && _linkIndex[oldStopId] === studioRichStationId) delete _linkIndex[oldStopId];
    rec.authoritativeLink = {
      gtfsStopId: newGtfsStopId,
      complexId: rec.authoritativeLink.complexId,
      linkedAt: Date.now(),
      linkConfidence: 'manual_reconcile',
      migratedFrom: oldStopId,
      migrationReason: reason || null,
    };
    rec.updatedAt = Date.now();
    if (newGtfsStopId) _linkIndex[newGtfsStopId] = studioRichStationId;
    _save();
    _notify();
    return { ok: true, migratedFrom: oldStopId, migratedTo: newGtfsStopId };
  }

  // ── StudioRich-authored metadata (the one authoring surface this build
  //    ships — proves the persistence model without building every future
  //    content system) ─────────────────────────────────────────────────────
  function updateStudioRichMetadata(studioRichStationId, partial) {
    _load();
    var rec = _recordsById[studioRichStationId];
    if (!rec) return { ok: false, reason: 'not_found' };
    if (!partial || typeof partial !== 'object') return { ok: false, reason: 'invalid_partial' };
    rec.studioRich = Object.assign({}, rec.studioRich, partial);
    rec.updatedAt = Date.now();
    _save();
    _notify();
    return { ok: true, data: rec };
  }

  // ── Read-only accessors ───────────────────────────────────────────────────
  function getRecord(studioRichStationId) { _load(); return _recordsById[studioRichStationId] || null; }
  function getRecordByAuthoritativeStopId(gtfsStopId) {
    _load();
    var id = _linkIndex[gtfsStopId];
    return id ? _recordsById[id] : null;
  }
  function getAllRecords() { _load(); return Object.keys(_recordsById).map(function (k) { return _recordsById[k]; }); }

  // Search is a label-convenience only — NEVER used for identity resolution
  // anywhere else in this file (see getRecordByAuthoritativeStopId above,
  // which is the only identity-safe lookup).
  function searchRecords(query) {
    _load();
    var q = String(query || '').trim().toLowerCase();
    if (!q) return getAllRecords();
    return getAllRecords().filter(function (r) {
      var name = (r.operational.displayName || '').toLowerCase();
      var borough = (r.operational.borough || '').toLowerCase();
      var stopId = (r.authoritativeLink.gtfsStopId || '').toLowerCase();
      return name.indexOf(q) !== -1 || borough.indexOf(q) !== -1 || stopId.indexOf(q) !== -1;
    });
  }

  // Records sharing the same operational.displayName — for the UI's
  // "distinguish duplicate-name stations clearly" requirement. Returns
  // groups of 2+, each entry a real distinct record (distinct ids).
  function getDuplicateNameGroups() {
    _load();
    var byName = {};
    getAllRecords().forEach(function (r) {
      var name = r.operational.displayName;
      if (!name) return;
      byName[name] = byName[name] || [];
      byName[name].push(r);
    });
    return Object.keys(byName).map(function (name) { return { displayName: name, records: byName[name] }; })
      .filter(function (g) { return g.records.length > 1; });
  }

  // ── Render back onto the map (BUILD requirement §5: "station records can
  //    be rendered back onto the map") — a plain GeoJSON Point Feature keyed
  //    by the STABLE studioRichStationId, independent of mtaSubwayMapFeatures.js
  //    (which builds features from the raw transit store, not this library).
  //    Not wired into the live renderer — proves the pipeline, per "LIVE MAP
  //    may remain a verification surface; do not rebuild the entire renderer." ──
  function buildMapFeature(record) {
    if (!record) return null;
    return {
      type: 'Feature',
      id: record.studioRichStationId,
      geometry: { type: 'Point', coordinates: [record.operational.longitude, record.operational.latitude] },
      properties: {
        studioRichStationId: record.studioRichStationId,
        displayName: record.operational.displayName,
        gtfsStopId: record.authoritativeLink.gtfsStopId,
        borough: record.operational.borough,
        routeIds: record.operational.routeIds,
      },
    };
  }

  function buildMapFeatureCollection(records) {
    return { type: 'FeatureCollection', features: (records || getAllRecords()).map(buildMapFeature).filter(Boolean) };
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────
  function getDiagnostics() {
    _load();
    var all = getAllRecords();
    var idSet = {};
    var collisionCount = 0;
    all.forEach(function (r) {
      if (idSet[r.studioRichStationId]) collisionCount++;
      idSet[r.studioRichStationId] = true;
    });
    return {
      version: VERSION,
      recordCount: all.length,
      linkedCount: all.filter(function (r) { return !!r.authoritativeLink.gtfsStopId; }).length,
      duplicateDisplayNameGroupCount: getDuplicateNameGroups().length,
      identityCollisionCount: collisionCount, // required invariant: must be 0
      unresolvedStaticStopCount: getUnresolvedStaticStops().length,
      orphanedRecordCount: getOrphanedLibraryRecords().length,
      lastImport: _lastImport,
    };
  }

  // Test-only reset — never called by production code.
  function __resetForTests() {
    _recordsById = {}; _linkIndex = {}; _nextIdCounter = 1; _loaded = true; _lastImport = null;
    var ls = _ls(); if (ls) { try { ls.removeItem(STORAGE_KEY); } catch (e) {} }
  }

  SBE.MTASubwayStationLibrary = Object.freeze({
    VERSION: VERSION,
    importFromStaticModel: importFromStaticModel,
    getRecord: getRecord,
    getRecordByAuthoritativeStopId: getRecordByAuthoritativeStopId,
    getAllRecords: getAllRecords,
    searchRecords: searchRecords,
    getDuplicateNameGroups: getDuplicateNameGroups,
    updateStudioRichMetadata: updateStudioRichMetadata,
    reconcileAuthoritativeLink: reconcileAuthoritativeLink,
    getUnresolvedStaticStops: getUnresolvedStaticStops,
    getOrphanedLibraryRecords: getOrphanedLibraryRecords,
    buildMapFeature: buildMapFeature,
    buildMapFeatureCollection: buildMapFeatureCollection,
    getDiagnostics: getDiagnostics,
    subscribe: subscribe,
    __resetForTests: __resetForTests,
  });

  console.log('[MTASubwayStationLibrary] v' + VERSION + ' loaded (persistent — call .importFromStaticModel() to populate)');
})(window);
