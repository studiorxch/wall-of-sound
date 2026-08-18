// ── SubwayArtworkPlacementAuthority v1.0.0 ────────────────────────────────────
// 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0_BUILD — Logic Layer §11-22
// Status: active | Classification: runtime-authority (persistent — localStorage)
//
// Owns the time-bound relationship between an Artwork
// (SubwayArtworkAuthority) and a CarSurface (SubwayCarSurfaceAuthority) —
// separate from both, per BUILD §11's explicit requirement. History is
// APPEND-ONLY (BUILD §13): covering/retiring/removing a placement never
// deletes it or any prior placement on that surface — it transitions
// lifecycleState and stamps endedAt, preserving every prior record forever.
//
// ── VALIDATION (BUILD §20) ───────────────────────────────────────────────────
// createPlacement() rejects (with an actionable reason, never a thrown
// exception a caller must catch blind): unknown artworkId, unknown
// surfaceId, a surfaceId that does not belong to the targeted
// logical car/consist/train/route (ownership mismatch), and any
// targetType/targetId that doesn't resolve. No target is ever auto-invented.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:subwayArtworkPlacementAuthority:v1';

  var TARGET_TYPES = Object.freeze(['route', 'route_family', 'logical_train', 'logical_consist', 'logical_car', 'surface']);
  var LIFECYCLE_STATES = Object.freeze(['scheduled', 'active', 'covered', 'retired', 'removed', 'expired']);

  function _artwork() { return SBE.SubwayArtworkAuthority || null; }
  function _surfaces() { return SBE.SubwayCarSurfaceAuthority || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  var _placements = {};        // sr-placement-* -> ArtworkPlacement
  var _bySurface = {};         // surfaceId -> [placementId,...] ordered by layerIndex (append-only)
  var _nextPlacementCounter = 1;
  var _loaded = false;
  var _listeners = [];

  function _notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function subscribe(fn) { _listeners.push(fn); return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); }; }

  function _mintPlacementId() { var id = 'sr-placement-' + String(_nextPlacementCounter).padStart(6, '0'); _nextPlacementCounter++; return id; }

  function _save() {
    var ls = _ls(); if (!ls) return false;
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, nextPlacementCounter: _nextPlacementCounter, placements: _placements, bySurface: _bySurface }));
      return true;
    } catch (e) { console.warn('[SubwayArtworkPlacementAuthority] save failed:', e && e.message || e); return false; }
  }

  function _load() {
    if (_loaded) return true;
    _loaded = true;
    var ls = _ls(); if (!ls) return false;
    try {
      var raw = ls.getItem(STORAGE_KEY);
      if (!raw) return true;
      var parsed = JSON.parse(raw);
      _placements = (parsed && parsed.placements) || {};
      _bySurface = (parsed && parsed.bySurface) || {};
      _nextPlacementCounter = (parsed && parsed.nextPlacementCounter) || 1;
      return true;
    } catch (e) {
      console.warn('[SubwayArtworkPlacementAuthority] load failed (starting empty):', e && e.message || e);
      _placements = {}; _bySurface = {}; _nextPlacementCounter = 1;
      return false;
    }
  }

  // ── Ownership / targeting resolution (BUILD §18-20) — ID-based only ──────
  function _resolveOwnership(surface) {
    var rs = _rollingStock();
    var car = rs ? rs.getLogicalCar(surface.logicalCarId) : null;
    return {
      surfaceId: surface.id,
      logicalCarId: surface.logicalCarId,
      consistId: surface.consistId,
      logicalTrainId: surface.logicalTrainId,
      routeId: surface.routeId,
      routeFamily: surface.routeFamily,
      carExists: !!car,
    };
  }

  function _targetMatchesOwnership(targetType, targetId, ownership) {
    switch (targetType) {
      case 'surface': return targetId === ownership.surfaceId;
      case 'logical_car': return targetId === ownership.logicalCarId;
      case 'logical_consist': return targetId === ownership.consistId;
      case 'logical_train': return targetId === ownership.logicalTrainId;
      case 'route': return targetId === ownership.routeId;
      case 'route_family': return targetId === ownership.routeFamily;
      default: return false;
    }
  }

  // ── Placement creation (BUILD §11, §14, §20) ─────────────────────────────
  // input: { artworkId, surfaceId, targetType, targetId, layerIndex?, startedAt?, now? }
  function createPlacement(input) {
    _load();
    var artAuth = _artwork(), surfAuth = _surfaces();
    if (!artAuth || !surfAuth) return { ok: false, reason: 'authority_unavailable' };
    if (!input || !input.artworkId || !input.surfaceId || !input.targetType || !input.targetId) {
      return { ok: false, reason: 'missing_required_fields' };
    }
    if (TARGET_TYPES.indexOf(input.targetType) === -1) return { ok: false, reason: 'invalid_target_type' };

    var art = artAuth.getArtwork(input.artworkId);
    if (!art) return { ok: false, reason: 'artwork_not_found' };

    var surface = surfAuth.getSurface(input.surfaceId);
    if (!surface) return { ok: false, reason: 'surface_not_found' };

    var ownership = _resolveOwnership(surface);
    if (!_targetMatchesOwnership(input.targetType, input.targetId, ownership)) {
      return { ok: false, reason: 'target_ownership_mismatch' };
    }

    var now = input.now || Date.now();
    var startedAt = input.startedAt || now;
    if (input.endedAt != null && input.endedAt < startedAt) return { ok: false, reason: 'invalid_ended_before_started' };

    // Cover any currently-active placement on this exact surface — explicit,
    // logged, non-destructive (BUILD §14: "No silent replacement").
    var existingIds = _bySurface[surface.id] || [];
    var priorActive = existingIds.map(function (id) { return _placements[id]; }).filter(function (p) { return p && p.placementState === 'active'; })[0];
    var nextLayerIndex = existingIds.length ? Math.max.apply(null, existingIds.map(function (id) { return _placements[id].layerIndex; })) + 1 : 0;
    if (priorActive) {
      priorActive.placementState = 'covered';
      priorActive.endedAt = now;
      priorActive.updatedAt = now;
    }

    var id = _mintPlacementId();
    var placement = {
      id: id,
      artworkId: input.artworkId,
      targetType: input.targetType,
      targetId: input.targetId,
      routeId: ownership.routeId,
      logicalTrainId: ownership.logicalTrainId,
      consistId: ownership.consistId,
      logicalCarId: ownership.logicalCarId,
      surfaceId: ownership.surfaceId,
      startedAt: startedAt,
      endedAt: input.endedAt != null ? input.endedAt : null,
      placementState: startedAt > now ? 'scheduled' : 'active',
      layerIndex: input.layerIndex != null ? input.layerIndex : nextLayerIndex,
      createdAt: now, updatedAt: now,
    };
    _placements[id] = placement;
    _bySurface[surface.id] = existingIds.concat([id]);
    _save();
    _notify();
    return { ok: true, data: placement, covered: priorActive ? priorActive.id : null };
  }

  function _transition(id, nextState, now) {
    _load();
    var p = _placements[id];
    if (!p) return { ok: false, reason: 'not_found' };
    if (LIFECYCLE_STATES.indexOf(nextState) === -1) return { ok: false, reason: 'invalid_state' };
    p.placementState = nextState;
    p.endedAt = p.endedAt != null ? p.endedAt : (now || Date.now());
    p.updatedAt = now || Date.now();
    _save();
    _notify();
    return { ok: true, data: p };
  }

  function retirePlacement(id, now) { return _transition(id, 'retired', now); }
  function removePlacement(id, now) { return _transition(id, 'removed', now); }
  function expirePlacement(id, now) { return _transition(id, 'expired', now); }

  // ── Read-only selectors ───────────────────────────────────────────────────
  function getPlacement(id) { _load(); return _placements[id] || null; }
  function getActivePlacementForSurface(surfaceId) {
    _load();
    var ids = _bySurface[surfaceId] || [];
    var active = ids.map(function (id) { return _placements[id]; }).filter(function (p) { return p && p.placementState === 'active'; });
    return active.length ? active[active.length - 1] : null;
  }
  function getPlacementHistoryForSurface(surfaceId) {
    _load();
    var ids = _bySurface[surfaceId] || [];
    return ids.map(function (id) { return _placements[id]; }).filter(Boolean).sort(function (a, b) { return a.layerIndex - b.layerIndex; });
  }
  function getAllPlacements() { _load(); return Object.keys(_placements).map(function (k) { return _placements[k]; }); }
  function getPlacementsForTarget(targetType, targetId) {
    _load();
    return getAllPlacements().filter(function (p) { return p.targetType === targetType && p.targetId === targetId; });
  }

  // ── Diagnostics (BUILD §30 — required invariants) ─────────────────────────
  function getDiagnostics() {
    _load();
    var all = getAllPlacements();
    var artAuth = _artwork(), surfAuth = _surfaces();
    var byState = {};
    LIFECYCLE_STATES.forEach(function (s) { byState[s] = 0; });
    all.forEach(function (p) { if (byState[p.placementState] != null) byState[p.placementState]++; });

    var orphanArtwork = 0, orphanSurface = 0, orphanActivePlacements = 0;
    all.forEach(function (p) {
      var artOk = artAuth ? !!artAuth.getArtwork(p.artworkId) : true;
      var surfOk = surfAuth ? !!surfAuth.getSurface(p.surfaceId) : true;
      if (!artOk) orphanArtwork++;
      if (!surfOk) orphanSurface++;
      if (p.placementState === 'active' && (!artOk || !surfOk)) orphanActivePlacements++;
    });

    var byTargetType = {};
    TARGET_TYPES.forEach(function (t) { byTargetType[t] = all.filter(function (p) { return p.targetType === t; }).length; });

    return {
      version: VERSION,
      placementCount: all.length,
      activePlacements: byState.active,
      coveredPlacements: byState.covered,
      retiredPlacements: byState.retired,
      removedPlacements: byState.removed,
      expiredPlacements: byState.expired,
      scheduledPlacements: byState.scheduled,
      orphanArtworkReferenceCount: orphanArtwork,
      orphanSurfaceReferenceCount: orphanSurface,
      orphanActivePlacementCount: orphanActivePlacements, // required invariant: must be 0
      routeTargetedPlacements: byTargetType.route + byTargetType.route_family,
      carTargetedPlacements: byTargetType.logical_car,
      surfaceTargetedPlacements: byTargetType.surface,
    };
  }

  function __resetForTests() {
    _placements = {}; _bySurface = {}; _nextPlacementCounter = 1; _loaded = true;
    var ls = _ls(); if (ls) { try { ls.removeItem(STORAGE_KEY); } catch (e) {} }
  }

  SBE.SubwayArtworkPlacementAuthority = Object.freeze({
    VERSION: VERSION,
    TARGET_TYPES: TARGET_TYPES,
    LIFECYCLE_STATES: LIFECYCLE_STATES,
    createPlacement: createPlacement,
    retirePlacement: retirePlacement,
    removePlacement: removePlacement,
    expirePlacement: expirePlacement,
    getPlacement: getPlacement,
    getActivePlacementForSurface: getActivePlacementForSurface,
    getPlacementHistoryForSurface: getPlacementHistoryForSurface,
    getAllPlacements: getAllPlacements,
    getPlacementsForTarget: getPlacementsForTarget,
    getDiagnostics: getDiagnostics,
    subscribe: subscribe,
    __resetForTests: __resetForTests,
  });

  console.log('[SubwayArtworkPlacementAuthority] v' + VERSION + ' loaded (persistent — append-only placement history)');
})(window);
