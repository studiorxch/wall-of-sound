// ── SubwayCarSurfaceAuthority v1.0.0 ──────────────────────────────────────────
// 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0_BUILD — Data Layer §5-8
// Status: active | Classification: runtime-authority (persistent — localStorage)
//
// Owns stable, persistent CarSurface identity for every StudioRich logical
// car (SubwayLogicalRollingStockAuthority.LogicalCar). Surface identity
// attaches ONLY to logicalCarId — never to an MTA trip id, never to a
// display label. A surface is minted exactly once per (logicalCarId,
// surfaceType) pair and never regenerated: re-calling ensureSurfacesForCar()
// on an already-surfaced car is a pure no-op read (idempotent), mirroring
// mtaSubwayStationLibrary.js's own "re-import creates zero new records"
// discipline.
//
// ── SURFACE TYPES — A REASONED MODEL, NOT A FABRICATION ──────────────────────
// exterior_side_a / exterior_side_b / interior are minted for EVERY logical
// car — every real subway car has two long exterior sides and an interior.
// front / rear are minted CONDITIONALLY, matching real physical subway
// structure rather than inventing a uniform 5-surface car: only the FIRST
// car in a consist (slotIndex 0) has an exposed leading end, and only the
// LAST car (slotIndex length-1) has an exposed trailing end — every car
// between them couples to its neighbors on both ends via married-pair/
// consist connectors, which are not a real user-facing artwork surface.
// This satisfies BUILD §6's own instruction: "If front/rear are not
// appropriate for all logical-car positions, support them conditionally
// rather than fabricating physical structure."
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:subwayCarSurfaceAuthority:v1';

  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  var _surfaces = {};       // sr-surface-* -> CarSurface
  var _surfaceIndex = {};   // "logicalCarId::surfaceType" -> sr-surface-* (idempotent mint lookup)
  var _nextSurfaceCounter = 1;
  var _loaded = false;
  var _listeners = [];

  function _notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function subscribe(fn) { _listeners.push(fn); return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); }; }

  function _mintSurfaceId() { var id = 'sr-surface-' + String(_nextSurfaceCounter).padStart(6, '0'); _nextSurfaceCounter++; return id; }

  function _save() {
    var ls = _ls(); if (!ls) return false;
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, nextSurfaceCounter: _nextSurfaceCounter, surfaces: _surfaces }));
      return true;
    } catch (e) { console.warn('[SubwayCarSurfaceAuthority] save failed:', e && e.message || e); return false; }
  }

  function _rebuildIndex() {
    _surfaceIndex = {};
    Object.keys(_surfaces).forEach(function (id) {
      var s = _surfaces[id];
      _surfaceIndex[s.logicalCarId + '::' + s.surfaceType] = id;
    });
  }

  function _load() {
    if (_loaded) return true;
    _loaded = true;
    var ls = _ls(); if (!ls) return false;
    try {
      var raw = ls.getItem(STORAGE_KEY);
      if (!raw) return true;
      var parsed = JSON.parse(raw);
      _surfaces = (parsed && parsed.surfaces) || {};
      _nextSurfaceCounter = (parsed && parsed.nextSurfaceCounter) || 1;
      _rebuildIndex();
      return true;
    } catch (e) {
      console.warn('[SubwayCarSurfaceAuthority] load failed (starting empty):', e && e.message || e);
      _surfaces = {}; _surfaceIndex = {}; _nextSurfaceCounter = 1;
      return false;
    }
  }

  function _surfaceTypesForCar(car, consist) {
    var types = ['exterior_side_a', 'exterior_side_b', 'interior'];
    if (!consist || !consist.carIds || !consist.carIds.length) return types;
    if (car.slotIndex === 0) types.push('front');
    if (car.slotIndex === consist.carIds.length - 1) types.push('rear');
    return types;
  }

  function _mintSurface(car, surfaceType, now) {
    var id = _mintSurfaceId();
    _surfaces[id] = {
      id: id, logicalCarId: car.id, consistId: car.consistId, logicalTrainId: car.logicalTrainId,
      routeId: car.routeId, routeFamily: car.routeFamily, surfaceType: surfaceType,
      createdAt: now, updatedAt: now, lifecycleState: 'active', truthState: 'logical',
    };
    _surfaceIndex[car.id + '::' + surfaceType] = id;
    return _surfaces[id];
  }

  // Idempotent: creates only surfaces that don't already exist for this car;
  // returns the full, stable set either way. Safe to call every poll/render —
  // never regenerates an existing surface id (BUILD §7 required invariant).
  function ensureSurfacesForCar(logicalCarId, opts) {
    _load();
    var rs = _rollingStock();
    if (!rs) return { ok: false, reason: 'rolling_stock_unavailable' };
    var car = rs.getLogicalCar(logicalCarId);
    if (!car) return { ok: false, reason: 'not_found' };
    var consist = rs.getLogicalConsist(car.consistId);
    var now = (opts && opts.now) || Date.now();

    var wantedTypes = _surfaceTypesForCar(car, consist);
    var created = 0;
    wantedTypes.forEach(function (type) {
      var key = logicalCarId + '::' + type;
      if (!_surfaceIndex[key]) { _mintSurface(car, type, now); created++; }
    });
    if (created > 0) { _save(); _notify(); }
    return { ok: true, created: created, surfaces: getSurfacesForCar(logicalCarId) };
  }

  function getSurface(id) { _load(); return _surfaces[id] || null; }
  function getSurfacesForCar(logicalCarId) {
    _load();
    return Object.keys(_surfaces).map(function (k) { return _surfaces[k]; })
      .filter(function (s) { return s.logicalCarId === logicalCarId; });
  }
  function getAllSurfaces() { _load(); return Object.keys(_surfaces).map(function (k) { return _surfaces[k]; }); }

  function getDiagnostics() {
    _load();
    var all = getAllSurfaces();
    var idSet = {}, collisions = 0;
    all.forEach(function (s) { if (idSet[s.id]) collisions++; idSet[s.id] = true; });
    return {
      version: VERSION,
      surfaceCount: all.length,
      surfaceCollisionCount: collisions, // required invariant: must be 0
      carsWithSurfaces: Object.keys(all.reduce(function (acc, s) { acc[s.logicalCarId] = true; return acc; }, {})).length,
    };
  }

  // Test-only — never called by production code.
  function __resetForTests() {
    _surfaces = {}; _surfaceIndex = {}; _nextSurfaceCounter = 1; _loaded = true;
    var ls = _ls(); if (ls) { try { ls.removeItem(STORAGE_KEY); } catch (e) {} }
  }

  SBE.SubwayCarSurfaceAuthority = Object.freeze({
    VERSION: VERSION,
    ensureSurfacesForCar: ensureSurfacesForCar,
    getSurface: getSurface,
    getSurfacesForCar: getSurfacesForCar,
    getAllSurfaces: getAllSurfaces,
    getDiagnostics: getDiagnostics,
    subscribe: subscribe,
    __resetForTests: __resetForTests,
  });

  console.log('[SubwayCarSurfaceAuthority] v' + VERSION + ' loaded (persistent — call .ensureSurfacesForCar(id) to populate)');
})(window);
