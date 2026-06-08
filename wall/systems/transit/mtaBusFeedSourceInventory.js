// ── MTABusFeedSourceInventory v1.0.0 ──────────────────────────────────────────
// 0604G_WOS_MTABusFeedSourceInventory_v1.0.0  (merged: Version A build target +
// Version B readiness / constants / failure vocabulary)
// Status: active | Classification: runtime-authority (inventory-only)
//
// Declares the authoritative MTA Bus GTFS-Realtime source inventory and the
// local API-key plumbing the 0604H realtime adapter will consume. HARD BOUNDARY:
// does NOT fetch, decode, render, mutate ActorRuntime/WSL/AIS, add Mapbox
// sources/layers, or change asset assignments. No maritime work. Never throws.
// Load AFTER mtaBusFeedConfig.js (and base registries), BEFORE the adapter.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var PRIMARY_SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';

  function _cfg() { return SBE.MTABusFeedConfig || null; }

  // Canonical source list. The primary id identifies the actual feed CATEGORY
  // (vehicle positions) — deliberately NOT the broad `mta_bus_gtfs_rt`.
  var MTA_BUS_SOURCES = Object.freeze([
    Object.freeze({
      id: PRIMARY_SOURCE_ID,
      label: 'MTA Bus GTFS-RT Vehicle Positions',
      format: 'gtfs_realtime_protobuf',
      endpoint: 'https://gtfsrt.prod.obanyc.com/vehiclePositions',
      purpose: 'vehicle_positions',
      actorTypes: ['vehicle.bus'],
      requiredForFirstMap: true,
      requiresApiKey: true,
      authority: 'mta_bus_time',
      status: 'primary',
    }),
    Object.freeze({
      id: 'mta_bus_gtfs_rt_trip_updates',
      label: 'MTA Bus GTFS-RT Trip Updates',
      format: 'gtfs_realtime_protobuf',
      endpoint: 'https://gtfsrt.prod.obanyc.com/tripUpdates',
      purpose: 'trip_updates',
      actorTypes: ['vehicle.bus'],
      requiredForFirstMap: false,
      requiresApiKey: true,
      authority: 'mta_bus_time',
      status: 'supporting',
    }),
    Object.freeze({
      id: 'mta_bus_gtfs_rt_alerts',
      label: 'MTA Bus GTFS-RT Alerts',
      format: 'gtfs_realtime_protobuf',
      endpoint: 'https://gtfsrt.prod.obanyc.com/alerts',
      purpose: 'alerts',
      actorTypes: ['vehicle.bus'],
      requiredForFirstMap: false,
      requiresApiKey: true,
      authority: 'mta_bus_time',
      status: 'deferred',
    }),
  ]);

  // Source registry entry the adapter (0604H) should register — kept SEPARATE
  // from AIS / Citi Bike / DOT / Studio / debug sources. Stored as inventory;
  // we never mutate the frozen ActorSourceRegistry from here.
  var SOURCE_REGISTRY_ENTRY = Object.freeze({
    id: PRIMARY_SOURCE_ID,
    label: 'MTA Bus GTFS-RT Vehicle Positions',
    truthLevel: 'live_telemetry',
    actorTypes: ['vehicle.bus'],
    updateMode: 'polling',
    defaultTtlMs: 45000,
    endpointKind: 'gtfs_realtime_vehicle_positions',
    requiresApiKey: true,
    authority: 'mta_bus_time',
    status: 'inventory_only',
  });

  var _state = { active: false, registered: false, lastError: null };

  // ── API key (localStorage only; never committed, never fully printed) ────────
  function _storageKey() { var c = _cfg(); return c ? c.apiKeyStorageKey : 'wos.mtaBusTime.apiKey'; }
  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  function _readKey() {
    var ls = _ls(); if (!ls) return null;
    try { var v = ls.getItem(_storageKey()); return (v && String(v).trim()) ? String(v) : null; } catch (e) { return null; }
  }
  function hasApiKey() { return !!_readKey(); }
  // Raw key accessor for the realtime adapter (0604H). Internal use only — the
  // adapter must never log it; debug surfaces use maskedApiKey() instead.
  function getApiKey() { return _readKey(); }
  function setApiKey(key) {
    if (typeof key !== 'string' || !key.trim()) { _state.lastError = 'invalid_api_key'; return false; }
    var ls = _ls(); if (!ls) { _state.lastError = 'storage_unavailable'; return false; }
    try { ls.setItem(_storageKey(), key.trim()); _state.lastError = null; return true; }
    catch (e) { _state.lastError = 'storage_write_failed'; return false; }
  }
  function clearApiKey() {
    var ls = _ls(); if (!ls) { _state.lastError = 'storage_unavailable'; return false; }
    try { ls.removeItem(_storageKey()); _state.lastError = null; return true; }
    catch (e) { _state.lastError = 'storage_clear_failed'; return false; }
  }
  // Masked form for debug only (never the full secret).
  function maskedApiKey() {
    var k = _readKey(); if (!k) return null;
    var tail = k.length >= 4 ? k.slice(-4) : k;
    return '****' + tail;
  }

  // ── Source accessors ─────────────────────────────────────────────────────────
  function getSources() { return MTA_BUS_SOURCES.slice(); }
  function getPrimarySource() {
    for (var i = 0; i < MTA_BUS_SOURCES.length; i++) if (MTA_BUS_SOURCES[i].id === PRIMARY_SOURCE_ID) return MTA_BUS_SOURCES[i];
    return MTA_BUS_SOURCES[0] || null;
  }
  function getSourceRegistryEntry() { return SOURCE_REGISTRY_ENTRY; }

  // ── Lifecycle (registration is metadata-only — no fetch, no runtime mutation) ─
  function start() {
    try {
      // Optional, fully-guarded: register into ActorSourceRegistry ONLY if it ever
      // exposes a register method. Today it is frozen → we register internally.
      var reg = SBE.ActorSourceRegistry;
      if (reg && typeof reg.register === 'function' && typeof reg.getSource === 'function') {
        if (!reg.getSource(PRIMARY_SOURCE_ID)) { try { reg.register(SOURCE_REGISTRY_ENTRY); } catch (e) {} }
      }
      _state.registered = true; _state.active = true; _state.lastError = null;
      return true;
    } catch (e) { _state.lastError = 'start_failed'; return false; }
  }
  function stop() { _state.active = false; return true; }

  // ── Readiness (Version B contract) — describes fetch-readiness, never fetches ─
  function getReadiness() {
    var c = _cfg();
    var apiKeyPresent = hasApiKey();
    var vpUrlPresent = !!(c && c.vehiclePositionsUrl);
    var configured = !!c && vpUrlPresent;
    return {
      sourceRegistered: _state.registered,
      configured: configured,
      apiKeyPresent: apiKeyPresent,
      vehiclePositionsUrlPresent: vpUrlPresent,
      canAttemptFetch: !!(_state.registered && configured && apiKeyPresent),
      lastError: _state.lastError,
    };
  }

  function getState() {
    var c = _cfg();
    return {
      version: VERSION,
      active: _state.active,
      registered: _state.registered,
      primarySourceId: PRIMARY_SOURCE_ID,
      sourceCount: MTA_BUS_SOURCES.length,
      requiresApiKey: true,
      hasApiKey: hasApiKey(),
      vehiclePositionsConfigured: !!(c && c.vehiclePositionsUrl),
      tripUpdatesConfigured: !!(c && c.tripUpdatesUrl),
      alertsConfigured: !!(c && c.alertsUrl),
      refreshCadenceMs: c ? c.refreshCadenceMs : null,
      staleAfterMs: c ? c.staleAfterMs : null,
      disabledAfterMs: c ? c.disabledAfterMs : null,
      failureReasons: c ? c.FAILURE_REASONS : null,
      lastError: _state.lastError,
    };
  }

  SBE.MTABusFeedSourceInventory = Object.freeze({
    VERSION:                VERSION,
    start:                  start,
    stop:                   stop,
    getState:               getState,
    getSources:             getSources,
    getPrimarySource:       getPrimarySource,
    getSourceRegistryEntry: getSourceRegistryEntry,
    getReadiness:           getReadiness,
    hasApiKey:              hasApiKey,
    getApiKey:              getApiKey,
    setApiKey:              setApiKey,
    clearApiKey:            clearApiKey,
    maskedApiKey:           maskedApiKey,
  });

  // Auto-register inventory metadata at load (no fetch, no runtime mutation).
  try { start(); } catch (e) {}

  console.log('[MTABusFeedSourceInventory] v' + VERSION + ' loaded — ' + MTA_BUS_SOURCES.length + ' sources (inventory-only)');
})(window);
