// ── TransitLiveryHooks v1.0.0 ─────────────────────────────────────────────────
// 0605C_WOS_TransitLiveryHooks_v1.0.0
// Status: active | Classification: presentation-layer (livery hooks)
//
// The safe presentation hook where future StudioRich / graffiti / sponsored /
// event / holiday / debug wraps attach — WITHOUT creating fake vehicle truth.
// "Actor truth says what the vehicle is; livery says how it's dressed." READ-ONLY
// to the world: never mutates truth/actor metadata, adapter/bridge rows, selector,
// motion-smoothing cache, presence, Mapbox, or the real asset authority. In-memory
// assignment cache (optional dev-only localStorage). Constant-time lookups, frozen
// registry profiles, safe fallback to default_mta. Load AFTER busAssetResolver.js,
// BEFORE busVisualFallbackRenderer.js / transitPresencePass.js. Never throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var LS_KEY = 'wos.transit.liveryAssignments';

  function _frz(o) { return Object.freeze(o); }
  // Frozen livery registry. None of these DRAW graffiti/ads — they are hooks only.
  var LIVERIES = {
    default_mta:     _frz({ liveryKey: 'default_mta',     label: 'MTA Standard',     category: 'default',   paletteRef: null,            wrapKey: null,                 surfaceTag: 'mta_standard',     accent: null,      roofAccent: null,      sidePanelAccent: null,      priority: 0,  enabled: true, debugOnly: false }),
    studiorich_cyan: _frz({ liveryKey: 'studiorich_cyan', label: 'StudioRich Cyan',  category: 'studio',    paletteRef: 'actor.generic', wrapKey: 'studiorich_cyan_v1', surfaceTag: 'studio_cyan',      accent: '#7dffe8', roofAccent: '#a8fff0', sidePanelAccent: '#0f7d8c', priority: 50, enabled: true, debugOnly: false }),
    graffiti_test:   _frz({ liveryKey: 'graffiti_test',   label: 'Graffiti (placeholder)', category: 'graffiti', paletteRef: 'actor.generic', wrapKey: 'graffiti_test',   surfaceTag: 'graffiti_wildstyle', accent: '#ff4dd2', roofAccent: '#ffd34d', sidePanelAccent: '#2b8cde', priority: 40, enabled: true, debugOnly: false }),
    sponsored_blank: _frz({ liveryKey: 'sponsored_blank', label: 'Sponsored (placeholder)', category: 'sponsored', paletteRef: 'actor.generic', wrapKey: 'sponsored_blank', surfaceTag: 'ad_blank',       accent: '#cfd8dc', roofAccent: '#ffffff', sidePanelAccent: '#90a4ae', priority: 40, enabled: true, debugOnly: false }),
    event_gold:      _frz({ liveryKey: 'event_gold',      label: 'Event Gold',       category: 'event',     paletteRef: 'actor.generic', wrapKey: 'event_gold',         surfaceTag: 'event',            accent: '#ffd166', roofAccent: '#ffe9a8', sidePanelAccent: '#b8860b', priority: 60, enabled: true, debugOnly: false }),
    holiday_red:     _frz({ liveryKey: 'holiday_red',     label: 'Holiday Red',      category: 'holiday',   paletteRef: 'actor.generic', wrapKey: 'holiday_red',        surfaceTag: 'holiday',          accent: '#ff4d4d', roofAccent: '#ffffff', sidePanelAccent: '#7a120d', priority: 45, enabled: true, debugOnly: false }),
    debug_magenta:   _frz({ liveryKey: 'debug_magenta',   label: 'Debug Magenta',    category: 'debug',     paletteRef: 'actor.generic', wrapKey: 'debug_magenta',      surfaceTag: 'debug',            accent: '#ff00ff', roofAccent: '#ff66ff', sidePanelAccent: '#aa00aa', priority: 99, enabled: true, debugOnly: true }),
  };
  var SPECIAL_LIVERY = 'event_gold';   // default hook for metadata.busClass:'special'

  var _enabled = true, _active = false, _debug = false;
  var _vehicle = {}, _route = {}, _class = {};   // assignment caches (constant-time)
  var _stats = { resolves: 0, defaultResolves: 0, vehicleResolves: 0, routeResolves: 0, classResolves: 0, specialResolves: 0, invalidLiveryRejects: 0 };
  var _meta = { lastAssignmentAt: null, lastClearAt: null, lastError: null };

  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }
  function _persistenceEnabled() { return !!_ls(); }

  function _vehicleId(actor) {
    if (!actor) return null;
    var md = actor.metadata || {};
    return (md.vehicleId != null ? md.vehicleId : (actor.sourceEntityId != null ? actor.sourceEntityId : null));
  }
  function _routeId(actor) { var md = (actor && actor.metadata) || {}; return md.routeId != null ? md.routeId : (actor && actor.routeId != null ? actor.routeId : null); }
  function _assetClass(actor) {
    var ar = SBE.BusAssetResolver;
    if (ar && typeof ar.getAssetClass === 'function') { try { return ar.getAssetClass(actor); } catch (e) {} }
    var md = (actor && actor.metadata) || {};
    return md.busAssetClass || md.busClass || null;
  }

  function _profile(liveryKey) { return LIVERIES[liveryKey] || LIVERIES.default_mta; }
  function _out(actor, liveryKey, source) {
    var p = _profile(liveryKey);
    return {
      actorId: actor && actor.actorId, vehicleId: _vehicleId(actor), routeId: _routeId(actor), busAssetClass: _assetClass(actor),
      liveryKey: p.liveryKey, category: p.category, paletteRef: p.paletteRef, wrapKey: p.wrapKey, surfaceTag: p.surfaceTag,
      accent: p.accent, roofAccent: p.roofAccent, sidePanelAccent: p.sidePanelAccent, source: source,
    };
  }

  // ── resolveForActor — priority vehicle > route > class > special > default ──
  function resolveForActor(actor) {
    _stats.resolves++;
    if (!actor || typeof actor !== 'object') { _stats.defaultResolves++; return _out(actor || {}, 'default_mta', 'default'); }
    if (!_enabled) { _stats.defaultResolves++; return _out(actor, 'default_mta', 'default'); }

    var vid = _vehicleId(actor);
    if (vid != null && _vehicle[String(vid)]) { _stats.vehicleResolves++; return _out(actor, _vehicle[String(vid)], 'vehicle'); }
    var rid = _routeId(actor);
    if (rid != null && _route[String(rid)]) { _stats.routeResolves++; return _out(actor, _route[String(rid)], 'route'); }
    var cls = _assetClass(actor);
    if (cls != null && _class[String(cls)]) { _stats.classResolves++; return _out(actor, _class[String(cls)], 'class'); }
    var md = actor.metadata || {};
    if ((md.busClass && String(md.busClass).toLowerCase() === 'special') || cls === 'special') {
      _stats.specialResolves++; return _out(actor, SPECIAL_LIVERY, 'special');
    }
    _stats.defaultResolves++; return _out(actor, 'default_mta', 'default');
  }
  function resolveForVehicle(vehicleId) {
    var key = (vehicleId != null && _vehicle[String(vehicleId)]) ? _vehicle[String(vehicleId)] : 'default_mta';
    var src = (vehicleId != null && _vehicle[String(vehicleId)]) ? 'vehicle' : 'default';
    return _out({ metadata: { vehicleId: vehicleId } }, key, src);
  }
  function resolveForRoute(routeId) {
    var key = (routeId != null && _route[String(routeId)]) ? _route[String(routeId)] : 'default_mta';
    var src = (routeId != null && _route[String(routeId)]) ? 'route' : 'default';
    return _out({ metadata: { routeId: routeId } }, key, src);
  }

  // ── Assignment (validated against the frozen registry) ──────────────────────
  function _valid(liveryKey) { return !!(liveryKey && LIVERIES[liveryKey]); }
  function _assign(map, key, liveryKey) {
    if (key == null || String(key).trim() === '') { _meta.lastError = 'invalid_key'; return false; }
    if (!_valid(liveryKey)) { _stats.invalidLiveryRejects++; _meta.lastError = 'invalid_livery'; return false; }
    map[String(key)] = liveryKey; _meta.lastAssignmentAt = Date.now(); _meta.lastError = null; _persist(); return true;
  }
  function assignVehicle(vehicleId, liveryKey) { return _assign(_vehicle, vehicleId, liveryKey); }
  function assignRoute(routeId, liveryKey) { return _assign(_route, routeId, liveryKey); }
  function assignClass(busAssetClass, liveryKey) { return _assign(_class, busAssetClass, liveryKey); }

  function _clearKey(map, key) { if (key != null && map[String(key)]) { delete map[String(key)]; _meta.lastClearAt = Date.now(); _persist(); return true; } return false; }
  function clearVehicle(vehicleId) { return _clearKey(_vehicle, vehicleId); }
  function clearRoute(routeId) { return _clearKey(_route, routeId); }
  function clearClass(busAssetClass) { return _clearKey(_class, busAssetClass); }
  function clearAll() { _vehicle = {}; _route = {}; _class = {}; _meta.lastClearAt = Date.now(); _persist(); return true; }

  // ── Dev-only persistence (NOT the Studio asset authority) ───────────────────
  function _persist() {
    var ls = _ls(); if (!ls) return;
    try { ls.setItem(LS_KEY, JSON.stringify({ vehicle: _vehicle, route: _route, "class": _class })); } catch (e) { _meta.lastError = 'persist_failed'; }
  }
  function _loadPersisted() {
    var ls = _ls(); if (!ls) return;
    try {
      var raw = ls.getItem(LS_KEY); if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        ['vehicle', 'route', 'class'].forEach(function (g) {
          var src = data[g]; if (!src) return;
          for (var k in src) { if (src.hasOwnProperty(k) && _valid(src[k])) (g === 'vehicle' ? _vehicle : g === 'route' ? _route : _class)[k] = src[k]; }
        });
      }
    } catch (e) { _meta.lastError = 'load_failed'; }
  }

  // ── Lifecycle / introspection ───────────────────────────────────────────────
  function start() { _active = true; _loadPersisted(); return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function listLiveries() { return Object.keys(LIVERIES).map(function (k) { return LIVERIES[k]; }); }
  function getLivery(liveryKey) { return LIVERIES[liveryKey] || null; }
  function listAssignments() {
    return {
      vehicle: (function () { var o = {}; for (var k in _vehicle) o[k] = _vehicle[k]; return o; })(),
      route: (function () { var o = {}; for (var k in _route) o[k] = _route[k]; return o; })(),
      "class": (function () { var o = {}; for (var k in _class) o[k] = _class[k]; return o; })(),
    };
  }
  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      liveryCount: Object.keys(LIVERIES).length,
      vehicleAssignmentCount: Object.keys(_vehicle).length,
      routeAssignmentCount: Object.keys(_route).length,
      classAssignmentCount: Object.keys(_class).length,
      persistenceEnabled: _persistenceEnabled(),
      lastAssignmentAt: _meta.lastAssignmentAt, lastClearAt: _meta.lastClearAt, lastError: _meta.lastError };
  }
  function getStats() {
    return { resolves: _stats.resolves, defaultResolves: _stats.defaultResolves,
      vehicleResolves: _stats.vehicleResolves, routeResolves: _stats.routeResolves,
      classResolves: _stats.classResolves, specialResolves: _stats.specialResolves,
      invalidLiveryRejects: _stats.invalidLiveryRejects };
  }

  SBE.TransitLiveryHooks = Object.freeze({
    VERSION:           VERSION,
    start:             start,
    stop:              stop,
    isActive:          isActive,
    resolveForActor:   resolveForActor,
    resolveForVehicle: resolveForVehicle,
    resolveForRoute:   resolveForRoute,
    assignVehicle:     assignVehicle,
    assignRoute:       assignRoute,
    assignClass:       assignClass,
    clearVehicle:      clearVehicle,
    clearRoute:        clearRoute,
    clearClass:        clearClass,
    clearAll:          clearAll,
    listAssignments:   listAssignments,
    listLiveries:      listLiveries,
    getLivery:         getLivery,
    getState:          getState,
    getStats:          getStats,
    setEnabled:        setEnabled,
    setDebug:          setDebug,
  });

  console.log('[TransitLiveryHooks] v' + VERSION + ' loaded — ' + Object.keys(LIVERIES).length + ' liveries (hooks only — no drawing)');
})(window);
