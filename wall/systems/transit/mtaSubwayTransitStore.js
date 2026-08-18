// ── MTASubwayTransitStore v1.0.0 ──────────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §11
// Status: active | Classification: runtime-authority (canonical store)
//
// The ONE canonical StudioRich SUBWAY transit store. Holds normalized static
// state (stations, complexes, routes) built via mtaSubwayIdentity.js from
// mtaSubwayStaticAdapter.js's raw rows, and normalized realtime state (trips,
// vehicles, alerts) built the same way from mtaSubwayRealtimeAdapter.js.
// Everything is keyed by collision-safe canonical ids — never by display name.
//
// STORE RULE (BUILD §11): the map renderer (mtaSubwayMapFeatures.js) and any
// other consumer MUST read through this store's selectors. Nothing outside
// this file may consume raw protobuf entities or raw GTFS rows directly —
// that keeps network/parsing logic out of render code, and gives every
// future consumer (itineraries, broadcast, Residents) one stable surface.
//
// LAST-KNOWN-VALID PRESERVATION: applyRealtimeUpdate() only ever ADDS/REPLACES
// state for the trip/vehicle rows a successful fetch actually returned. A
// failed fetch (see mtaSubwayPollingRuntime.js) never calls this with partial
// data — the store's realtime state is simply left exactly as it was, which
// is what "preserve last known valid state" means at this layer.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _staticAdapter() { return SBE.MTASubwayStaticAdapter || null; }
  function _identity() { return SBE.MTASubwayIdentity || null; }

  // ── Canonical indices (id -> Ref) ────────────────────────────────────────
  var _stations = {};   // subway:stop:* -> TransitStationRef
  var _complexes = {};  // subway:complex:* -> TransitComplexRef
  var _routes = {};     // subway:route:* -> TransitRouteRef
  var _trips = {};      // subway:trip:* -> TransitTripRef (realtime, replaced per fetch)
  var _vehicles = {};   // subway:vehicle:* -> TransitVehicleRef (realtime, replaced per fetch)
  var _alerts = [];     // raw alert rows (no strong identity concept needed for this build)

  var _state = {
    staticLoaded: false,
    staticLoadedAt: null,
    staticAcquisition: null,
    realtimeLastUpdatedAt: null,
    realtimeLastGroups: [],
    identityCollisionCount: 0,   // must always read 0 — see §17 required invariant
    duplicateDisplayNameCount: 0,
  };

  // ── Static load: build canonical Station/Complex/Route refs ─────────────
  function loadStatic() {
    var adapter = _staticAdapter(), id = _identity();
    if (!adapter || !id) return Promise.resolve({ ok: false, reason: 'not_configured' });

    return adapter.load().then(function (result) {
      if (!result || !result.ok) return { ok: false, reason: (result && result.reason) || 'load_failed' };

      var rawComplexes = adapter.getComplexes();
      var complexById = {};
      rawComplexes.forEach(function (c) { complexById[c.complexId] = c; });

      var newComplexes = {};
      rawComplexes.forEach(function (c) {
        var ref = id.buildComplexRef(c);
        if (ref) newComplexes[ref.id] = ref;
      });

      var newRoutes = {};
      adapter.getRoutes().forEach(function (r) {
        var ref = id.buildRouteRef(r);
        if (ref) newRoutes[ref.id] = ref;
      });

      var newStations = {};
      var seenIds = Object.create(null);
      var collisionCount = 0;
      var nameGroups = Object.create(null);

      adapter.getStops().forEach(function (s) {
        var ref = id.buildStationRef(s);
        if (!ref) return;
        // Route membership: joined from this stop's complex/standalone record
        // (the "MTA Subway Stations and Complexes" dataset's Daytime Routes
        // column) — GTFS static itself carries no route-stop relationship
        // without the 36MB stop_times.txt this build intentionally does not
        // ingest (schedule/itinerary planning is out of scope). This gives
        // correct route membership at the station/complex granularity.
        var complexRec = s.complexId ? complexById[s.complexId] : null;
        var routeIds = complexRec ? (complexRec.routeIds || []).map(id.routeId) : [];
        ref = Object.freeze(Object.assign({}, ref, { routeIds: routeIds }));

        // Collision self-check (must always be 0 — see getDiagnostics()).
        if (seenIds[ref.id]) collisionCount++;
        seenIds[ref.id] = true;

        if (ref.displayName) {
          nameGroups[ref.displayName] = (nameGroups[ref.displayName] || 0) + 1;
        }

        newStations[ref.id] = ref;
      });

      var duplicateNames = 0;
      Object.keys(nameGroups).forEach(function (n) { if (nameGroups[n] > 1) duplicateNames++; });

      _complexes = newComplexes;
      _routes = newRoutes;
      _stations = newStations;
      _state.identityCollisionCount = collisionCount;
      _state.duplicateDisplayNameCount = duplicateNames;
      _state.staticLoaded = true;
      _state.staticLoadedAt = Date.now();
      _state.staticAcquisition = adapter.getState().acquisition;

      console.log('[MTASubwayTransitStore] static loaded — stations ' + Object.keys(_stations).length +
        ', complexes ' + Object.keys(_complexes).length + ', routes ' + Object.keys(_routes).length +
        ' | duplicate display names ' + duplicateNames + ' | identity collisions ' + collisionCount);

      return { ok: true, stationCount: Object.keys(_stations).length, routeCount: Object.keys(_routes).length, complexCount: Object.keys(_complexes).length };
    });
  }

  // ── Realtime apply: replace trip/vehicle state for the groups just fetched ─
  // Only ever called by the polling runtime with rows from a SUCCESSFUL
  // fetch — a failed fetch simply never calls this, which is what preserves
  // last-known-valid state at this layer.
  function applyRealtimeUpdate(rawTripUpdateRows, rawVehicleRows, groupIds) {
    var id = _identity();
    if (!id) return { ok: false, reason: 'not_configured' };

    var groups = Array.isArray(groupIds) ? groupIds : [];
    // Clear only trips/vehicles previously sourced from the groups we're
    // about to replace — other groups' state is left untouched.
    Object.keys(_trips).forEach(function (k) { if (groups.indexOf(_trips[k]._sourceGroupId) !== -1) delete _trips[k]; });
    Object.keys(_vehicles).forEach(function (k) { if (groups.indexOf(_vehicles[k]._sourceGroupId) !== -1) delete _vehicles[k]; });

    (rawTripUpdateRows || []).forEach(function (row) {
      var ref = id.buildTripRef(row);
      if (ref) { _trips[ref.id] = Object.freeze(Object.assign({}, ref, { _sourceGroupId: row.sourceGroupId })); }
    });
    (rawVehicleRows || []).forEach(function (row) {
      var ref = id.buildVehicleRef(row);
      if (ref) { _vehicles[ref.id] = Object.freeze(Object.assign({}, ref, { _sourceGroupId: row.sourceGroupId })); }
    });

    _state.realtimeLastUpdatedAt = Date.now();
    _state.realtimeLastGroups = groups.slice();
    return { ok: true, tripCount: Object.keys(_trips).length, vehicleCount: Object.keys(_vehicles).length };
  }

  function applyAlerts(rawAlertRows) {
    _alerts = (rawAlertRows || []).slice();
    return { ok: true, alertCount: _alerts.length };
  }

  // ── Read-only selectors (the ONLY sanctioned way to read subway state) ────
  function getStation(id) { return _stations[id] || null; }
  function getAllStations() { return Object.keys(_stations).map(function (k) { return _stations[k]; }); }
  function getComplex(id) { return _complexes[id] || null; }
  function getAllComplexes() { return Object.keys(_complexes).map(function (k) { return _complexes[k]; }); }
  function getRoute(id) { return _routes[id] || null; }
  function getAllRoutes() { return Object.keys(_routes).map(function (k) { return _routes[k]; }); }
  function getAllTrips() { return Object.keys(_trips).map(function (k) { return _trips[k]; }); }
  function getTripsForRoute(canonicalRouteId) { return getAllTrips().filter(function (t) { return t.routeId === canonicalRouteId; }); }
  function getAllVehicles() { return Object.keys(_vehicles).map(function (k) { return _vehicles[k]; }); }
  function getVehiclesForRoute(canonicalRouteId) { return getAllVehicles().filter(function (v) { return v.routeId === canonicalRouteId; }); }
  function getAlerts() { return _alerts.slice(); }
  function getAlertsForRoute(rawRouteId) { return _alerts.filter(function (a) { return (a.routeIds || []).indexOf(rawRouteId) !== -1; }); }
  function getShapePoints(shapeId) { var a = _staticAdapter(); return a ? a.getShapePoints(shapeId) : null; }

  function getDiagnostics() {
    return {
      version: VERSION,
      staticLoaded: _state.staticLoaded,
      staticLoadedAt: _state.staticLoadedAt,
      staticAcquisition: _state.staticAcquisition,
      realtimeLastUpdatedAt: _state.realtimeLastUpdatedAt,
      realtimeLastGroups: _state.realtimeLastGroups,
      routeCount: Object.keys(_routes).length,
      stationStopCount: Object.keys(_stations).length,
      complexCount: Object.keys(_complexes).length,
      tripCount: Object.keys(_trips).length,
      vehicleCount: Object.keys(_vehicles).length,
      alertCount: _alerts.length,
      duplicateDisplayNameCount: _state.duplicateDisplayNameCount,
      identityCollisionCount: _state.identityCollisionCount, // required invariant: must be 0
    };
  }

  SBE.MTASubwayTransitStore = Object.freeze({
    VERSION: VERSION,
    loadStatic: loadStatic,
    applyRealtimeUpdate: applyRealtimeUpdate,
    applyAlerts: applyAlerts,
    getStation: getStation,
    getAllStations: getAllStations,
    getComplex: getComplex,
    getAllComplexes: getAllComplexes,
    getRoute: getRoute,
    getAllRoutes: getAllRoutes,
    getAllTrips: getAllTrips,
    getTripsForRoute: getTripsForRoute,
    getAllVehicles: getAllVehicles,
    getVehiclesForRoute: getVehiclesForRoute,
    getAlerts: getAlerts,
    getAlertsForRoute: getAlertsForRoute,
    getShapePoints: getShapePoints,
    getDiagnostics: getDiagnostics,
  });

  console.log('[MTASubwayTransitStore] v' + VERSION + ' loaded (call .loadStatic() to build the canonical index)');
})(window);
