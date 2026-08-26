// ── SubwayTrainVisualState v1.0.0 ─────────────────────────────────────────────
// 0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD — §7-9, §11, §13, §28
// Status: active | Classification: pure (no fetch, no DOM, no Mapbox, no state)
//
// Derives renderer-facing LiveTrainVisualState from
// SubwayLogicalRollingStockAuthority's already-reconciled, persistent logical
// trains — never a second identity/position authority (BUILD §5: "Do not
// create a second train identity system for visualization"). Everything here
// is a PURE READ + PURE DERIVATION (bearing, headsign) recomputed on every
// call from the canonical position/trip/station data — nothing is persisted
// by this file, and calling it twice with unchanged inputs returns identical
// output (BUILD §7: "This is derived presentation state, not a replacement
// authority").
//
// ── BEARING (BUILD §9, §13) ───────────────────────────────────────────────────
// Computed from the real station coordinates the rolling-stock authority's own
// TrainPositionState already resolved (observedStopId / nextStopId — both
// real, canonical-ID-joined stations), using the standard initial-bearing
// spherical formula. Never fabricated when only one endpoint is known: a
// train with no resolvable next-stop evidence gets bearing: null, not a
// guessed heading.
//
// ── HEADSIGN (BUILD §21) ──────────────────────────────────────────────────────
// Current MTA static data ingested by this app has no trips.txt/headsign
// field (see mtaSubwayStaticAdapter.js header — GTFS static scope here is
// routes/stops/complexes/shapes only). The one genuinely real destination
// signal available is the trip's own LAST real stopTimeUpdate entry (the
// station it is actually, currently, en-route to as its final stop) — this
// file resolves that station's real display name as `headsign`. This is
// real live realtime evidence, not a fabricated terminal name.
//
// ── CAMERA-READY (BUILD §28) ──────────────────────────────────────────────────
// buildVisualState()'s return shape is exactly the "camera-useful fields"
// list — stationId is added by the arrival-correlation layer, not here (this
// file has no concept of an arrival), everything else BUILD §28 names is
// present on every returned state.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }

  function _toRad(deg) { return (deg * Math.PI) / 180; }
  function _toDeg(rad) { return (rad * 180) / Math.PI; }

  // Standard initial bearing (degrees, 0 = north, clockwise) between two real
  // [lat, lon]-shaped station coordinates. Returns null (never a fabricated
  // heading) if either station is unresolvable.
  function _bearingBetween(fromStation, toStation) {
    if (!fromStation || !toStation) return null;
    var lat1 = _toRad(fromStation.latitude), lat2 = _toRad(toStation.latitude);
    var dLon = _toRad(toStation.longitude - fromStation.longitude);
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    var deg = _toDeg(Math.atan2(y, x));
    return (deg + 360) % 360;
  }

  function _resolveBearing(store, pos) {
    if (!pos) return null;
    var fromId = pos.observedStopId, toId = pos.nextStopId;
    if (!toId) return null;
    var toStation = store.getStation(toId);
    // Prefer observedStopId as the origin; if a stopped train has no
    // observedStopId (shouldn't happen for observed_stop, but be honest),
    // no fabricated origin — bearing stays null.
    var fromStation = fromId ? store.getStation(fromId) : null;
    if (!fromStation || !toStation) return null;
    return _bearingBetween(fromStation, toStation);
  }

  // Real, live-evidence-only destination — the trip's own last stopTimeUpdate
  // entry's real station display name. Null (never fabricated) if the trip
  // reference or its final stop can't be resolved.
  function _resolveHeadsign(store, tripId) {
    if (!tripId) return null;
    var trips = store.getAllTrips();
    var trip = null;
    for (var i = 0; i < trips.length; i++) { if (trips[i].id === tripId) { trip = trips[i]; break; } }
    if (!trip || !trip.stopTimes || !trip.stopTimes.length) return null;
    var last = trip.stopTimes[trip.stopTimes.length - 1];
    if (!last || !last.stationId) return null;
    var station = store.getStation(last.stationId);
    return station ? station.displayName : null;
  }

  // The one derivation entry point. Returns null only if the logical train
  // itself doesn't exist — a train with unknown/stale position still returns
  // a real state object (BUILD §15: stale/unknown must be truthfully
  // representable, never silently dropped from the concept).
  function buildVisualState(logicalTrainId) {
    var store = _store(), rs = _rollingStock();
    if (!store || !rs) return null;
    var train = rs.getLogicalTrain(logicalTrainId);
    if (!train) return null;
    var pos = rs.getPositionState(logicalTrainId);

    return {
      logicalTrainId: train.id,
      consistId: train.consistId,
      routeId: train.routeId,
      routeFamily: train.routeFamily,
      tripId: train.activeTripId,
      directionId: train.direction, // real NYCT nyct.direction value ("NORTH"/"SOUTH") — never invented
      headsign: train.activeTripId ? _resolveHeadsign(store, train.activeTripId) : null,
      previousStopId: pos ? pos.observedStopId : null,
      nextStopId: pos ? pos.nextStopId : null,
      positionState: pos ? pos.truthState : 'unknown',
      geometryPosition: pos ? pos.position : null,
      geometryBearing: pos ? _resolveBearing(store, pos) : null,
      progress: pos ? pos.progress : null,
      observedAt: pos ? pos.observedTimestamp : null,
      staleAt: (pos && pos.truthState === 'stale') ? pos.observedTimestamp : null,
      lifecycleState: train.lifecycleState,
    };
  }

  // Full-network derivation, one call — the presentation layer's single
  // source for every visible train's render-ready state (BUILD §10: "one
  // rendering authority", never a per-train recomputation path elsewhere).
  function getAllVisualStates() {
    var rs = _rollingStock();
    if (!rs) return [];
    return rs.getActiveLogicalTrains()
      .map(function (t) { return buildVisualState(t.id); })
      .filter(Boolean);
  }

  function getDiagnostics() {
    var states = getAllVisualStates();
    return {
      version: VERSION,
      visualStateCount: states.length,
      withBearingCount: states.filter(function (s) { return s.geometryBearing != null; }).length,
      withHeadsignCount: states.filter(function (s) { return s.headsign != null; }).length,
      byPositionState: states.reduce(function (acc, s) { acc[s.positionState] = (acc[s.positionState] || 0) + 1; return acc; }, {}),
    };
  }

  SBE.SubwayTrainVisualState = Object.freeze({
    VERSION: VERSION,
    buildVisualState: buildVisualState,
    getAllVisualStates: getAllVisualStates,
    getDiagnostics: getDiagnostics,
    // Exposed for direct unit testing of the pure geometry math.
    __bearingBetween: _bearingBetween,
  });

  console.log('[SubwayTrainVisualState] v' + VERSION + ' loaded (pure derivation — no persistence)');
})(window);
