// ── MapLab — Map Selection v1.1.0 ────────────────────────────────────────────
// 0610D_WOS_ReplacementGeometryAlignmentAudit_v1.0.0
// Prior: 0608_MAPLAB_BuildingSelection_v0.2
// Status: active | Classification: studio-maplab
//
// v1.1.0 — Geometry normalization: adds normalizeFeatureGeometry() which extracts
//           a compact, Wall-compatible geometry snapshot from a Mapbox building
//           feature (Polygon or MultiPolygon). Includes centroid, bounds, widthM,
//           depthM, areaM2, heading, height, featureId, capturedAt.
//           _normalize() now populates normalizedGeometry on selection objects.
//           normalizeFeatureGeometry exposed on public API.
// v1.0.0 — initial selection state; supports color, hidden, replacement consumers.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  // Selection shape (canonical for all future consumers):
  // { id, source, sourceLayer, geometry, properties, center, height, minHeight,
  //   normalizedGeometry }
  var _selection = null;
  var _listeners = [];

  // ── Geometry helpers ──────────────────────────────────────────────────────────
  // Local implementations kept small to avoid shared-module risk.
  // Equivalent helpers exist in buildingReplacementRuntime.js (Wall side).

  function _centroidForRing(ring) {
    var n = ring.length - 1; // closed ring: last == first
    if (n < 1) return { lng: ring[0][0], lat: ring[0][1] };
    var sumLng = 0, sumLat = 0;
    for (var i = 0; i < n; i++) { sumLng += ring[i][0]; sumLat += ring[i][1]; }
    return { lng: sumLng / n, lat: sumLat / n };
  }

  function _boundsForRing(ring) {
    var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (var i = 0; i < ring.length; i++) {
      var lng = ring[i][0], lat = ring[i][1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat };
  }

  function _dimensionsFromBounds(bounds, lat) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    return {
      widthM: Math.max(4, (bounds.maxLng - bounds.minLng) * 111320 * cosLat),
      depthM: Math.max(4, (bounds.maxLat - bounds.minLat) * 111320),
    };
  }

  function _polygonAreaM2(ring, lat) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var area = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var x0 = ring[i][0]     * 111320 * cosLat, y0 = ring[i][1]     * 111320;
      var x1 = ring[i + 1][0] * 111320 * cosLat, y1 = ring[i + 1][1] * 111320;
      area += (x0 * y1 - x1 * y0);
    }
    return Math.abs(area) / 2;
  }

  function _headingFromLongestEdge(ring, lat) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var bestH = 0, bestLen2 = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var dx = (ring[i + 1][0] - ring[i][0]) * 111320 * cosLat;
      var dy = (ring[i + 1][1] - ring[i][1]) * 111320;
      var len2 = dx * dx + dy * dy;
      if (len2 > bestLen2) {
        bestLen2 = len2;
        bestH = Math.atan2(dx, dy) * 180 / Math.PI;
      }
    }
    return ((bestH % 180) + 180) % 180;
  }

  // _largestRing — extracts the outer ring of the best polygon from Polygon /
  // MultiPolygon geometry. Returns the ring array or null.
  function _largestRing(geometry) {
    if (!geometry) return null;
    if (geometry.type === 'Polygon') {
      var ring = geometry.coordinates && geometry.coordinates[0];
      return (ring && ring.length >= 4) ? ring : null;
    }
    if (geometry.type === 'MultiPolygon') {
      var polys = geometry.coordinates;
      if (!polys || !polys.length) return null;
      var bestRing = null, bestArea = 0;
      for (var pi = 0; pi < polys.length; pi++) {
        var r = polys[pi] && polys[pi][0];
        if (!r || r.length < 4) continue;
        var c = _centroidForRing(r);
        var area = _polygonAreaM2(r, c.lat);
        if (area > bestArea) { bestArea = area; bestRing = r; }
      }
      return bestRing;
    }
    return null;
  }

  // normalizeFeatureGeometry(feature) — produces a compact, manifest-safe geometry
  // snapshot from a Mapbox building feature. Returns null for unsupported geometry.
  //
  // Output schema:
  //   { source, geometryType, coordinates, centroid, bounds, widthM, depthM,
  //     areaM2, heading, height, featureId, sourceLayer, capturedAt }
  //
  // This is the Studio geometry authority. Wall prefers this over its own
  // querySourceFeatures result (see buildingReplacementRuntime.js §0610D).
  function normalizeFeatureGeometry(feature) {
    try {
      if (!feature || !feature.geometry) return null;
      var ring = _largestRing(feature.geometry);
      if (!ring || ring.length < 4) return null;

      var centroid = _centroidForRing(ring);
      var bounds   = _boundsForRing(ring);
      var dims     = _dimensionsFromBounds(bounds, centroid.lat);
      var areaM2   = _polygonAreaM2(ring, centroid.lat);
      var heading  = _headingFromLongestEdge(ring, centroid.lat);

      var p      = feature.properties || {};
      var height = null;
      if (p.height != null && !isNaN(p.height)) height = Number(p.height);
      else if (p.render_height != null && !isNaN(p.render_height)) height = Number(p.render_height);

      return {
        source:       'studio-maplab',
        geometryType: 'Polygon',
        coordinates:  ring,                    // outer ring only, no holes, compact
        centroid:     centroid,
        bounds:       bounds,
        widthM:       dims.widthM,
        depthM:       dims.depthM,
        areaM2:       areaM2,
        heading:      heading,
        height:       height,
        featureId:    feature.id != null ? String(feature.id) : null,
        sourceLayer:  feature.sourceLayer || null,
        capturedAt:   Date.now(),
      };
    } catch (e) {
      return null;
    }
  }

  // ── Existing selection logic ──────────────────────────────────────────────────

  function _centerOf(geometry) {
    if (!geometry) return null;
    try {
      if (geometry.type === 'Point') return { lng: geometry.coordinates[0], lat: geometry.coordinates[1] };
      var coords = [];
      function _collect(c) {
        if (typeof c[0] === 'number') { coords.push(c); }
        else { c.forEach(_collect); }
      }
      _collect(geometry.coordinates || []);
      if (!coords.length) return null;
      var sumLng = 0, sumLat = 0;
      coords.forEach(function (c) { sumLng += c[0]; sumLat += c[1]; });
      return { lng: sumLng / coords.length, lat: sumLat / coords.length };
    } catch (e) { return null; }
  }

  function _normalize(feature) {
    if (!feature) return null;
    var p = feature.properties || {};
    return {
      id:                 feature.id != null ? feature.id : null,
      source:             feature.source     || null,
      sourceLayer:        feature.sourceLayer || null,
      geometry:           feature.geometry   || null,
      properties:         p,
      center:             _centerOf(feature.geometry),
      height:             p.height     != null ? Number(p.height)     : (p.render_height     != null ? Number(p.render_height)     : null),
      minHeight:          p.min_height != null ? Number(p.min_height) : (p.render_min_height != null ? Number(p.render_min_height) : null),
      // 0610D: pre-computed geometry snapshot for manifest persistence
      normalizedGeometry: normalizeFeatureGeometry(feature),
    };
  }

  function select(feature) {
    _selection = _normalize(feature);
    _listeners.forEach(function (fn) { try { fn(_selection); } catch (e) {} });
    return _selection;
  }

  function clear() {
    _selection = null;
    _listeners.forEach(function (fn) { try { fn(null); } catch (e) {} });
  }

  function getSelection() { return _selection; }
  function hasSelection() { return _selection !== null; }

  function onChange(fn) {
    if (typeof fn === 'function') _listeners.push(fn);
    return function unsubscribe() { _listeners = _listeners.filter(function (f) { return f !== fn; }); };
  }

  function clearListeners() { _listeners = []; }

  global.WOSMapLab = global.WOSMapLab || {};
  global.WOSMapLab.MapSelection = Object.freeze({
    select:                   select,
    clear:                    clear,
    getSelection:             getSelection,
    hasSelection:             hasSelection,
    onChange:                 onChange,
    clearListeners:           clearListeners,
    normalizeFeatureGeometry: normalizeFeatureGeometry,  // 0610D
  });

  console.log('[MapSelection] v1.1.0 loaded');
})(window);
