// ── MTABusActorBridge v1.0.0 ──────────────────────────────────────────────────
// 0604I_WOS_MTABusActorBridge_v1.0.0
// Status: active | Classification: runtime-authority (truth-only)
//
// Converts decoded MTA bus realtime rows (from the 0604H adapter) into canonical
// `vehicle.bus` truth actors via SBE.TruthActorRuntime.upsertActor. TRUTH ONLY —
// the bridge itself NEVER renders, writes WSL payloads, adds Mapbox sources/
// layers, assigns assets, styles routes, filters by camera, smooths motion, or
// touches AIS/marine/Citi Bike/subway/Studio. "Truth may be dense; presentation
// must be selective" — visible buses are a later (0604J) presentation concern.
// Load AFTER mtaBusRealtimeAdapter.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';
  var ACTOR_TYPE = 'vehicle.bus';
  var DEFAULT_STALE_MS = 45000;

  function _adapter() { return SBE.MTABusRealtimeAdapter || null; }
  function _cfg() { return SBE.MTABusFeedConfig || null; }
  function _tar() { return SBE.TruthActorRuntime || null; }
  function _staleMs() { var c = _cfg(); return (c && c.MTA_BUS_STALE_AFTER_MS) || (c && c.staleAfterMs) || DEFAULT_STALE_MS; }

  var _enabled = true, _active = false, _debug = false;
  var _busActorIds = {};   // actorId → true (only bridge-created vehicle.bus actors)
  var _state = {
    lastSyncAt: null, lastSuccessAt: null, lastError: null,
    syncCount: 0, upsertCount: 0, rejectedCount: 0,
    lastRowCount: 0, lastAcceptedCount: 0, lastRejectedCount: 0,
    rejectReasonCounts: {},
  };

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null); }
  function _bump(reason) { _state.rejectReasonCounts[reason] = (_state.rejectReasonCounts[reason] || 0) + 1; }

  // ── Per-row validation (bridge-local rejection vocabulary) ───────────────────
  function _validate(row) {
    if (!row || typeof row !== 'object') return { reject: 'missing_coordinates' };
    if (row.sourceId !== SOURCE_ID) return { reject: 'wrong_source_id' };
    var vid = row.vehicleId;
    if (vid == null || String(vid).trim() === '') return { reject: 'missing_vehicle_id' };
    // Accept latitude/longitude or lat/lng for resilience.
    var lat = _num(row.latitude != null ? row.latitude : row.lat);
    var lng = _num(row.longitude != null ? row.longitude : row.lng);
    if (lat == null || lng == null) return { reject: 'missing_coordinates' };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { reject: 'invalid_coordinates' };
    var ts = _num(row.timestampUtcMs);
    if (ts == null || ts <= 0) return { reject: 'invalid_timestamp' };
    return { ok: true, lat: lat, lng: lng, ts: ts, vehicleId: String(vid) };
  }

  function _toUpdate(row, v) {
    var routeId = row.routeId != null ? row.routeId : null;
    return {
      sourceId: SOURCE_ID,
      sourceEntityId: v.vehicleId,
      actorType: ACTOR_TYPE,
      label: routeId ? ('MTA Bus ' + routeId) : 'MTA Bus',
      lng: v.lng, lat: v.lat,
      headingDeg: (row.bearing != null && isFinite(row.bearing)) ? row.bearing : 0,
      speedMps: (row.speedMps != null && isFinite(row.speedMps)) ? row.speedMps : null,
      timestampMs: v.ts,
      ttlMs: _staleMs(),
      metadata: {
        system: 'mta', mode: 'bus',
        routeId: routeId,
        tripId: row.tripId != null ? row.tripId : null,
        vehicleId: v.vehicleId,
        occupancyStatus: row.occupancyStatus != null ? row.occupancyStatus : null,
        rawEntityId: row.rawEntityId != null ? row.rawEntityId : null,
        sourceRowTimestampMs: v.ts,
        truthClass: 'observed',
        presentationEligible: true,
        busKey: 'mta_bus:' + v.vehicleId,   // intended deterministic key (identity scheme may prefix)
      },
    };
  }

  // ── syncRows(rows) — validate + upsert into TruthActorRuntime ────────────────
  function syncRows(rows) {
    _state.syncCount++;
    _state.lastSyncAt = Date.now();

    if (!_enabled) { _state.lastError = 'disabled'; return { ok: false, rows: 0, accepted: 0, rejected: 0, actorCount: _count(), lastError: 'disabled' }; }
    var tar = _tar();
    if (!tar || typeof tar.upsertActor !== 'function') {
      _state.lastError = 'actor_runtime_unavailable';
      return { ok: false, rows: (rows && rows.length) || 0, accepted: 0, rejected: 0, actorCount: _count(), lastError: 'actor_runtime_unavailable' };
    }

    rows = Array.isArray(rows) ? rows : [];
    var accepted = 0, rejected = 0;
    for (var i = 0; i < rows.length; i++) {
      var v = _validate(rows[i]);
      if (v.reject) { rejected++; _bump(v.reject); continue; }
      var actorId;
      try { actorId = tar.upsertActor(_toUpdate(rows[i], v)); }
      catch (e) { rejected++; _bump('upsert_failed'); continue; }
      if (!actorId) { rejected++; _bump('upsert_failed'); continue; }
      _busActorIds[actorId] = true;
      accepted++;
    }

    _state.upsertCount += accepted;
    _state.rejectedCount += rejected;
    _state.lastRowCount = rows.length;
    _state.lastAcceptedCount = accepted;
    _state.lastRejectedCount = rejected;
    _state.lastError = null;
    _state.lastSuccessAt = Date.now();
    if (_debug) console.log('[MTABusActorBridge] sync rows', rows.length, '→ accepted', accepted, '| rejected', rejected, '| actors', _count());
    return { ok: true, rows: rows.length, accepted: accepted, rejected: rejected, actorCount: _count() };
  }

  function syncFromAdapter() {
    var a = _adapter();
    if (!a || typeof a.getRows !== 'function') {
      _state.syncCount++; _state.lastSyncAt = Date.now(); _state.lastError = 'adapter_unavailable';
      return { ok: false, rows: 0, accepted: 0, rejected: 0, actorCount: _count(), lastError: 'adapter_unavailable' };
    }
    var rows = [];
    try { rows = a.getRows() || []; } catch (e) { rows = []; }
    return syncRows(rows);
  }

  // ── Lifecycle + scoped clear ─────────────────────────────────────────────────
  function start() { _active = true; return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }

  function _count() { return Object.keys(_busActorIds).length; }
  function getActorIds() { return Object.keys(_busActorIds); }

  // Remove ONLY bridge-created vehicle.bus actors (never AIS / Citi Bike / debug).
  function clearBusActors() {
    var tar = _tar();
    var ids = Object.keys(_busActorIds), removed = 0;
    if (tar && typeof tar.removeActor === 'function') {
      for (var i = 0; i < ids.length; i++) {
        try { if (tar.removeActor(ids[i])) removed++; } catch (e) {}
      }
    }
    _busActorIds = {};
    if (_debug) console.log('[MTABusActorBridge] cleared', removed, 'bus actors');
    return removed;
  }

  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function getState() {
    var tar = _tar(), a = _adapter();
    return {
      version: VERSION, active: _active, enabled: _enabled, sourceId: SOURCE_ID,
      lastSyncAt: _state.lastSyncAt, lastSuccessAt: _state.lastSuccessAt, lastError: _state.lastError,
      syncCount: _state.syncCount, upsertCount: _state.upsertCount, rejectedCount: _state.rejectedCount,
      actorCount: _count(),
      lastRowCount: _state.lastRowCount, lastAcceptedCount: _state.lastAcceptedCount, lastRejectedCount: _state.lastRejectedCount,
      rejectReasonCounts: _state.rejectReasonCounts,
      adapterAvailable: !!(a && typeof a.getRows === 'function'),
      actorRuntimeAvailable: !!(tar && typeof tar.upsertActor === 'function'),
    };
  }
  function getStats() {
    var s = _state.syncCount;
    return {
      syncCount: _state.syncCount, upsertCount: _state.upsertCount, rejectedCount: _state.rejectedCount,
      actorCount: _count(),
      lastRowCount: _state.lastRowCount, lastAcceptedCount: _state.lastAcceptedCount, lastRejectedCount: _state.lastRejectedCount,
      acceptRate: (_state.lastRowCount > 0) ? Math.round((_state.lastAcceptedCount / _state.lastRowCount) * 1000) / 1000 : 0,
      rejectReasonCounts: _state.rejectReasonCounts,
    };
  }

  SBE.MTABusActorBridge = Object.freeze({
    VERSION:         VERSION,
    start:           start,
    stop:            stop,
    isActive:        isActive,
    syncFromAdapter: syncFromAdapter,
    syncRows:        syncRows,
    getState:        getState,
    getStats:        getStats,
    getActorIds:     getActorIds,
    clearBusActors:  clearBusActors,
    setEnabled:      setEnabled,
    setDebug:        setDebug,
  });

  console.log('[MTABusActorBridge] v' + VERSION + ' loaded (truth-only — no render)');
})(window);
