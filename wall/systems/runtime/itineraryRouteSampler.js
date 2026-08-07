// ── ItineraryRouteSampler v1.0.0 ──────────────────────────────────────────────
// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal
// Status: active | Classification: runtime / itinerary-route-sampler
//
// Pure distance-based sampling over a stage's already-stored, already-fetched
// route geometry (GeoJSON LineString coordinates, [lng,lat] pairs). No map,
// no UI, no storage, no Directions calls — geometry is only ever what the
// itinerary already persisted (0729E). Ported verbatim (same haversine
// algorithm, same units, same adaptive 25-80m lookahead) from
// wall/systems/world/heroVehicleRuntime.js's private _buildSegments/
// _interpolate/_lookaheadBearing closures, which have no external reuse path
// (confirmed: not on SBE.HeroVehicleRuntime's public API) — this is a
// deliberate, exact port, not a reinvention.
//
// Placement: wall/systems/runtime/itineraryRouteSampler.js
// Load: BEFORE itineraryRunController.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var EARTH_RADIUS_M = 6371000;

  function _toRad(deg) { return deg * Math.PI / 180; }

  // Same haversine distance (metres) as heroVehicleRuntime.js's _haversineM.
  function _haversineM(lat1, lng1, lat2, lng2) {
    var dLat = _toRad(lat2 - lat1);
    var dLng = _toRad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return EARTH_RADIUS_M * c;
  }

  // Same great-circle bearing as heroVehicleRuntime.js's _bearing.
  function _bearing(p0, p1) {
    var lat1 = _toRad(p0.lat), lat2 = _toRad(p1.lat);
    var dLng = _toRad(p1.lng - p0.lng);
    var y = Math.sin(dLng) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  // coordinates: [lng, lat][] (GeoJSON order) → points: {lat, lng}[]
  function toPoints(coordinates) {
    if (!Array.isArray(coordinates)) return [];
    return coordinates
      .filter(function (c) { return Array.isArray(c) && c.length >= 2 && isFinite(c[0]) && isFinite(c[1]); })
      .map(function (c) { return { lng: c[0], lat: c[1] }; });
  }

  // Cumulative-distance segment table — identical shape/units to
  // heroVehicleRuntime.js's _buildSegments: distances[] (metres per segment),
  // total (metres), cumFrac[] (cumulative fraction of total distance at each
  // vertex, 0..1).
  function buildSegments(points) {
    var distances = [];
    var total = 0;
    for (var i = 0; i < points.length - 1; i++) {
      var d = _haversineM(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
      distances.push(d);
      total += d;
    }
    var cumFrac = [];
    var cum = 0;
    for (var j = 0; j < distances.length; j++) {
      cum += distances[j];
      cumFrac.push(total > 0 ? cum / total : 1);
    }
    return { distances: distances, total: total, cumFrac: cumFrac };
  }

  // t = fraction of cumulative DISTANCE (0..1), not point-index. Linear
  // lat/lng interpolation within the located segment, plus that segment's
  // own bearing — same technique as heroVehicleRuntime.js's _interpolate.
  function interpolate(points, segs, t) {
    if (!points.length) return { lat: 0, lng: 0, headingDeg: 0 };
    if (points.length === 1) return { lat: points[0].lat, lng: points[0].lng, headingDeg: 0 };
    var clamped = Math.max(0, Math.min(1, t));
    var segIndex = 0;
    while (segIndex < segs.cumFrac.length - 1 && clamped > segs.cumFrac[segIndex]) segIndex++;
    var segStart = segIndex === 0 ? 0 : segs.cumFrac[segIndex - 1];
    var segEnd = segs.cumFrac[segIndex];
    var segT = segEnd > segStart ? (clamped - segStart) / (segEnd - segStart) : 0;
    var p0 = points[segIndex];
    var p1 = points[Math.min(segIndex + 1, points.length - 1)];
    var lat = p0.lat + (p1.lat - p0.lat) * segT;
    var lng = p0.lng + (p1.lng - p0.lng) * segT;
    return { lat: lat, lng: lng, headingDeg: _bearing(p0, p1) };
  }

  // Bare lat/lng sample with no bearing computation — used internally by
  // lookaheadBearing to sample "current" and "ahead" points, mirroring
  // heroVehicleRuntime.js's _interpolateRaw.
  function _interpolateRaw(points, segs, t) {
    var r = interpolate(points, segs, t);
    return { lat: r.lat, lng: r.lng };
  }

  // Adaptive lookahead: 2.5x nominal speed (m/s), clamped [25, 80] metres —
  // exact numbers ported from heroVehicleRuntime.js's _lookaheadM.
  function _lookaheadM(speedMs) {
    var d = (speedMs || 10) * 2.5;
    return Math.max(25, Math.min(80, d));
  }

  // Heading from forward motion: bearing from the current sampled point to a
  // point `lookaheadM` further along cumulative distance — same technique as
  // heroVehicleRuntime.js's _lookaheadBearing.
  function lookaheadBearing(points, segs, t, speedMs) {
    if (!points || points.length < 2 || !segs) return 0;
    var lookM = _lookaheadM(speedMs);
    var lookFrac = segs.total > 0 ? lookM / segs.total : 0;
    var tAhead = Math.min(1, t + lookFrac);
    var cur = _interpolateRaw(points, segs, t);
    var ahead = _interpolateRaw(points, segs, tAhead);
    var dLat = Math.abs(ahead.lat - cur.lat);
    var dLng = Math.abs(ahead.lng - cur.lng);
    if (dLat < 1e-8 && dLng < 1e-8) return interpolate(points, segs, t).headingDeg;
    return _bearing({ lat: cur.lat, lng: cur.lng }, { lat: ahead.lat, lng: ahead.lng });
  }

  // A stage's geometry is genuinely unusable if it can't be sampled at all —
  // used by the preflight validator (invalid_geometry reason).
  function isValidGeometry(coordinates) {
    var points = toPoints(coordinates);
    return points.length >= 2;
  }

  SBE.ItineraryRouteSampler = Object.freeze({
    VERSION: VERSION,
    toPoints: toPoints,
    buildSegments: buildSegments,
    interpolate: interpolate,
    lookaheadBearing: lookaheadBearing,
    isValidGeometry: isValidGeometry,
    haversineM: _haversineM,
    bearing: _bearing,
  });

  console.log('[ItineraryRouteSampler] v' + VERSION + ' loaded');

})(window);
