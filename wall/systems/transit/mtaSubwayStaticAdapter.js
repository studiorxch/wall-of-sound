// ── MTASubwayStaticAdapter v1.0.0 ─────────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §8
// Status: active | Classification: runtime-authority (adapter-only)
//
// Loads and normalizes current authoritative MTA subway static data (routes,
// stops/stations/platforms, station complexes, route shape geometry).
//
// SOURCE-ACQUISITION NOTE (read before changing anything here): the raw GTFS
// static zip lives at https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip
// and the raw MTA Subway Stations and Complexes dataset lives at
// https://data.ny.gov/api/views/5f5g-n3cz/rows.csv?accessType=DOWNLOAD — both
// verified live during this build (see mtaSubwayFeedSourceInventory.js).
// Neither is fetched live by this adapter: the S3 bucket does not return an
// Access-Control-Allow-Origin header (verified with `curl -H "Origin: ..."`
// during this build), so a same-origin-only static file server (wall/ is
// served via `npx serve`, no proxy/backend) cannot read the zip's response
// body cross-origin. Per the codebase's own existing precedent for exactly
// this situation (wall/data/harbor/*.geojson — pre-acquired authoritative
// geographic data committed to the repo, loaded via a normal same-origin
// fetch), this adapter instead loads a pre-acquired, normalized JSON
// snapshot from wall/data/subway/mtaSubwayStaticSnapshot.json, produced by a
// one-time Node acquisition script (not shipped in the runtime) directly
// from the live sources above. The snapshot's own `acquisition` block
// records exactly when and from where it was pulled — this adapter surfaces
// that as source/freshness metadata rather than claiming a live fetch.
// GTFS static itself only changes "a few times a year" (feed_info.txt), so
// this is not a live-data compromise; realtime state (positions/trip
// updates/alerts) is fetched live in-browser by mtaSubwayRealtimeAdapter.js.
//
// HARD RULES (per BUILD §8):
//   - Names are display labels only. No object uses stopName as a key.
//   - Distinct stops are never merged because names match.
//   - Station complexes are represented exactly as the source (MTA Subway
//     Stations and Complexes dataset) relates them — never invented.
//   - Raw authoritative IDs (stop_id, route_id, complex_id, parent_station)
//     are preserved unmodified alongside anything this adapter derives.
//   - Malformed rows are rejected with diagnostic evidence, never silently
//     dropped or invented.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Resolved relative to THIS SCRIPT's own URL, not the host page's origin —
  // this file is loaded two ways: directly by wall/index.html (page origin
  // http://localhost:5500/) AND proxied into music/index.html at
  // /wall-app/systems/transit/mtaSubwayStaticAdapter.js (page origin
  // http://localhost:5173/, see vite.config.ts's /wall-app proxy). A page-
  // relative './data/subway/...' resolves against WHICHEVER page loaded it —
  // correct from wall/, but silently resolves to MUSIC's own dev server (no
  // such path there, Vite's SPA fallback returns index.html, and JSON.parse
  // then fails on "<!doctype...") when loaded from MUSIC. document.currentScript
  // gives this script's own real URL in both contexts, so the snapshot path
  // is derived from THAT instead — correct in both hosts without special-
  // casing either one.
  var SNAPSHOT_URL = (function () {
    try {
      var scriptUrl = global.document && global.document.currentScript && global.document.currentScript.src;
      if (scriptUrl) return new global.URL('../../data/subway/mtaSubwayStaticSnapshot.json', scriptUrl).href;
    } catch (e) {}
    return './data/subway/mtaSubwayStaticSnapshot.json'; // fallback — only correct when loaded from wall/'s own page
  })();

  function _inv() { return SBE.MTASubwayFeedSourceInventory || null; }

  var _state = {
    loaded: false,
    loading: false,
    lastLoadAt: null,
    lastError: null,
    acquisition: null,
    rejectedRowCounts: { routes: 0, stops: 0, complexes: 0 },
    rejectReasonCounts: {},
  };
  var _routes = [];
  var _stops = [];
  var _complexes = [];
  var _shapes = {};

  function _rejectRow(kind, reason) {
    _state.rejectedRowCounts[kind] = (_state.rejectedRowCounts[kind] || 0) + 1;
    _state.rejectReasonCounts[reason] = (_state.rejectReasonCounts[reason] || 0) + 1;
  }

  function _isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

  // ── Row-level normalization (validates; never invents values) ───────────────
  function _normalizeRoute(r) {
    if (!r || typeof r.routeId !== 'string' || !r.routeId) { _rejectRow('routes', 'missing_route_id'); return null; }
    return {
      routeId: r.routeId,
      shortName: (typeof r.shortName === 'string' && r.shortName) ? r.shortName : null,
      longName: (typeof r.longName === 'string' && r.longName) ? r.longName : null,
      routeType: _isFiniteNum(r.routeType) ? r.routeType : null,
      sourceColor: (typeof r.color === 'string' && r.color) ? r.color : null,
      sourceTextColor: (typeof r.textColor === 'string' && r.textColor) ? r.textColor : null,
      shapeIds: Array.isArray(r.shapeIds) ? r.shapeIds.slice() : [],
    };
  }

  function _normalizeStop(s) {
    if (!s || typeof s.stopId !== 'string' || !s.stopId) { _rejectRow('stops', 'missing_stop_id'); return null; }
    if (!_isFiniteNum(s.lat) || !_isFiniteNum(s.lon)) { _rejectRow('stops', 'missing_coordinates'); return null; }
    if (s.lat < -90 || s.lat > 90 || s.lon < -180 || s.lon > 180) { _rejectRow('stops', 'invalid_coordinates'); return null; }
    return {
      stopId: s.stopId,
      // stopName is a DISPLAY LABEL ONLY — never used as a key anywhere downstream.
      stopName: (typeof s.stopName === 'string' && s.stopName) ? s.stopName : null,
      latitude: s.lat,
      longitude: s.lon,
      // locationType 1 = station-level record; null/blank = a directional platform.
      isStationLevel: s.locationType === 1,
      parentStation: (typeof s.parentStation === 'string' && s.parentStation) ? s.parentStation : null,
      complexId: (s.complexId != null && s.complexId !== '') ? String(s.complexId) : null,
    };
  }

  function _normalizeComplex(c) {
    if (!c || c.complexId == null || c.complexId === '') { _rejectRow('complexes', 'missing_complex_id'); return null; }
    if (!Array.isArray(c.gtfsStopIds) || c.gtfsStopIds.length === 0) { _rejectRow('complexes', 'missing_member_stops'); return null; }
    return {
      complexId: String(c.complexId),
      isComplex: !!c.isComplex,
      stationCount: _isFiniteNum(c.stationCount) ? c.stationCount : c.gtfsStopIds.length,
      // displayName/stopName are labels only.
      displayName: (typeof c.displayName === 'string' && c.displayName) ? c.displayName : null,
      stopName: (typeof c.stopName === 'string' && c.stopName) ? c.stopName : null,
      borough: (typeof c.borough === 'string' && c.borough) ? c.borough : null,
      routeIds: Array.isArray(c.routes) ? c.routes.slice() : [],
      latitude: _isFiniteNum(c.lat) ? c.lat : null,
      longitude: _isFiniteNum(c.lon) ? c.lon : null,
      memberStopIds: c.gtfsStopIds.slice(),
    };
  }

  // ── Load ──────────────────────────────────────────────────────────────────
  function load() {
    if (_state.loading) return Promise.resolve({ ok: false, reason: 'already_loading' });
    _state.loading = true;
    _state.lastError = null;

    if (typeof global.fetch !== 'function') {
      _state.loading = false;
      _state.lastError = 'network_error';
      return Promise.resolve({ ok: false, reason: 'network_error' });
    }

    return global.fetch(SNAPSHOT_URL)
      .then(function (resp) {
        if (!resp.ok) { throw new Error('http_error_' + resp.status); }
        return resp.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') throw new Error('parse_failed');

        _state.rejectedRowCounts = { routes: 0, stops: 0, complexes: 0 };
        _state.rejectReasonCounts = {};

        var rawRoutes = Array.isArray(data.routes) ? data.routes : [];
        var rawStops = Array.isArray(data.stops) ? data.stops : [];
        var rawComplexes = Array.isArray(data.complexes) ? data.complexes : [];

        _routes = rawRoutes.map(_normalizeRoute).filter(Boolean);
        _stops = rawStops.map(_normalizeStop).filter(Boolean);
        _complexes = rawComplexes.map(_normalizeComplex).filter(Boolean);
        _shapes = (data.shapes && typeof data.shapes === 'object') ? data.shapes : {};
        _state.acquisition = (data.acquisition && typeof data.acquisition === 'object') ? data.acquisition : null;

        _state.loaded = true;
        _state.loading = false;
        _state.lastLoadAt = Date.now();

        console.log('[MTASubwayStaticAdapter] loaded — routes ' + _routes.length + ', stops ' + _stops.length +
          ', complexes ' + _complexes.length + ', shapes ' + Object.keys(_shapes).length +
          ' (rejected: routes ' + _state.rejectedRowCounts.routes + ', stops ' + _state.rejectedRowCounts.stops +
          ', complexes ' + _state.rejectedRowCounts.complexes + ')');

        return { ok: true, routeCount: _routes.length, stopCount: _stops.length, complexCount: _complexes.length, shapeCount: Object.keys(_shapes).length };
      })
      .catch(function (err) {
        _state.loading = false;
        _state.lastError = String((err && err.message) || err);
        console.warn('[MTASubwayStaticAdapter] load failed:', _state.lastError);
        return { ok: false, reason: _state.lastError };
      });
  }

  // ── Read-only accessors (raw normalized rows; identity layer builds on these) ─
  function getRoutes() { return _routes.slice(); }
  function getStops() { return _stops.slice(); }
  function getComplexes() { return _complexes.slice(); }
  function getShapePoints(shapeId) { return _shapes[shapeId] ? _shapes[shapeId].slice() : null; }
  function getRoute(routeId) { for (var i = 0; i < _routes.length; i++) if (_routes[i].routeId === routeId) return _routes[i]; return null; }
  function getStop(stopId) { for (var i = 0; i < _stops.length; i++) if (_stops[i].stopId === stopId) return _stops[i]; return null; }
  function getComplex(complexId) { for (var i = 0; i < _complexes.length; i++) if (_complexes[i].complexId === String(complexId)) return _complexes[i]; return null; }

  function getState() {
    return {
      version: VERSION,
      loaded: _state.loaded,
      loading: _state.loading,
      lastLoadAt: _state.lastLoadAt,
      lastError: _state.lastError,
      acquisition: _state.acquisition,
      routeCount: _routes.length,
      stopCount: _stops.length,
      complexCount: _complexes.length,
      shapeCount: Object.keys(_shapes).length,
      rejectedRowCounts: _state.rejectedRowCounts,
      rejectReasonCounts: _state.rejectReasonCounts,
    };
  }

  SBE.MTASubwayStaticAdapter = Object.freeze({
    VERSION: VERSION,
    load: load,
    getRoutes: getRoutes,
    getStops: getStops,
    getComplexes: getComplexes,
    getShapePoints: getShapePoints,
    getRoute: getRoute,
    getStop: getStop,
    getComplex: getComplex,
    getState: getState,
  });

  console.log('[MTASubwayStaticAdapter] v' + VERSION + ' loaded (call .load() to acquire the static snapshot)');
})(window);
