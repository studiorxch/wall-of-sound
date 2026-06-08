// ── BusAssetResolver v1.0.0 ───────────────────────────────────────────────────
// 0604M_WOS_BusAssetPack_v1.0.0
// Status: active | Classification: presentation-asset-authority (read-only)
//
// Classifies live `vehicle.bus` actors into a recognizable fleet hierarchy and
// returns cached, stable presentation profiles for the renderer. READ-ONLY:
// derives class from route/metadata only — never mutates truth, selector,
// renderer, WSL, Mapbox, or assignments. No per-frame allocations (profiles are
// class-level singletons; route→class memoized). Preserves real route / movement
// / telemetry / vehicle identity. Load AFTER busVisualFallbackRenderer.js. Never
// throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Asset classes: Standard · Articulated · Express · Shuttle · Special (reserved).
  // Stable class-level presentation profiles (frozen singletons — no per-actor alloc).
  var PROFILES = {
    standard:    Object.freeze({ assetClass: 'standard',    silhouetteClass: 'bus-standard',    variant: 'bus_standard',    scale: 1.00, paletteRef: 'actor.generic', accent: '#2aa8ff' }),
    articulated: Object.freeze({ assetClass: 'articulated', silhouetteClass: 'bus-articulated', variant: 'bus_articulated', scale: 1.00, paletteRef: 'actor.generic', accent: '#37d67a' }),
    express:     Object.freeze({ assetClass: 'express',     silhouetteClass: 'bus-express',     variant: 'bus_express',     scale: 1.00, paletteRef: 'actor.generic', accent: '#ffc400' }),
    shuttle:     Object.freeze({ assetClass: 'shuttle',     silhouetteClass: 'bus-shuttle',     variant: 'bus_shuttle',     scale: 0.90, paletteRef: 'actor.generic', accent: '#ff7a3d' }),
    special:     Object.freeze({ assetClass: 'special',     silhouetteClass: 'bus-standard',    variant: 'bus_special',     scale: 1.05, paletteRef: 'actor.generic', accent: '#c061ff' }),
  };

  var _routeClassCache = {};   // routeId → className (memoized, stable assignment)
  var _stats = { resolvedCount: 0, byClass: { standard: 0, articulated: 0, express: 0, shuttle: 0, special: 0 } };

  function _route(actor) {
    if (!actor) return null;
    var md = actor.metadata || {};
    var r = md.routeId != null ? md.routeId : (actor.routeId != null ? actor.routeId : null);
    return (r != null && String(r).trim()) ? String(r).trim() : null;
  }

  // Deterministic NYC-MTA route → class heuristic. Explicit + inspectable.
  function _classifyRoute(route) {
    if (!route) return 'standard';
    var r = route.toUpperCase().trim();
    if (/SHUTTLE/.test(r)) return 'shuttle';
    // Select Bus Service (often articulated): "+" suffix or "SBS".
    if (/\+$/.test(r) || /\bSBS\b/.test(r) || /SBS$/.test(r)) return 'articulated';
    // Express coaches: BxM / BM / QM / SIM prefixes, or X-number (e.g. X27).
    if (/^(BXM|BM|QM|SIM)\d/.test(r) || /^X\d/.test(r)) return 'express';
    return 'standard';
  }

  // ── getAssetClass(actor) — returns className string ─────────────────────────
  function getAssetClass(actor) {
    if (!actor || typeof actor !== 'object') return 'standard';
    var md = actor.metadata || {};
    // Explicit override (reserved hook for Hero / Sponsored / Event buses).
    var override = md.busClass || md.busClassOverride || null;
    var cls;
    if (override && PROFILES[String(override).toLowerCase()]) cls = String(override).toLowerCase();
    else {
      var route = _route(actor);
      if (route != null) {
        if (_routeClassCache[route] == null) _routeClassCache[route] = _classifyRoute(route);
        cls = _routeClassCache[route];
      } else cls = 'standard';
    }
    _stats.resolvedCount++;
    _stats.byClass[cls] = (_stats.byClass[cls] || 0) + 1;
    return cls;
  }

  // ── getPresentationProfile(actor) — cached, stable profile ──────────────────
  function getPresentationProfile(actor) {
    var cls = getAssetClass(actor);
    return PROFILES[cls] || PROFILES.standard;
  }

  function getProfileForClass(cls) { return PROFILES[cls] || null; }
  function listClasses() { return Object.keys(PROFILES); }

  function clearCache() {
    _routeClassCache = {};
    _stats = { resolvedCount: 0, byClass: { standard: 0, articulated: 0, express: 0, shuttle: 0, special: 0 } };
    return true;
  }

  function getStats() {
    return { version: VERSION, resolvedCount: _stats.resolvedCount,
      byClass: (function () { var o = {}; for (var k in _stats.byClass) o[k] = _stats.byClass[k]; return o; })(),
      routeCacheSize: Object.keys(_routeClassCache).length };
  }

  SBE.BusAssetResolver = Object.freeze({
    VERSION:                 VERSION,
    getAssetClass:           getAssetClass,
    getPresentationProfile:  getPresentationProfile,
    getProfileForClass:      getProfileForClass,
    listClasses:             listClasses,
    clearCache:              clearCache,
    getStats:                getStats,
  });

  console.log('[BusAssetResolver] v' + VERSION + ' loaded — ' + Object.keys(PROFILES).length + ' fleet classes');
})(window);
