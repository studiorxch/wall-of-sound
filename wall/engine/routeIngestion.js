// 0510_WOS_RealRouteIngestion_v1.0.0
// Route ingestion layer — GeoJSON, encoded polyline → WOS RouteWorld geometry.
// Vanilla IIFE. Attaches to SBE.RouteIngestion.
// Load order: schemas.js → routeIngestion.js → main.js

(function initRouteIngestion(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Haversine distance ────────────────────────────────────────────────────
  function haversineMeters(a, b) {
    var R = 6371000;
    var lat1 = a.lat * Math.PI / 180;
    var lat2 = b.lat * Math.PI / 180;
    var dlat = (b.lat - a.lat) * Math.PI / 180;
    var dlng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dlat / 2) * Math.sin(dlat / 2)
          + Math.cos(lat1) * Math.cos(lat2)
          * Math.sin(dlng / 2) * Math.sin(dlng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  // ── Local bounding-box projection ─────────────────────────────────────────
  // lng → x, lat → y (inverted so north is visually up)
  // Preserves aspect ratio, centers route on canvas, respects padding.
  function projectLatLngToWorld(geoPoints, canvas, padding) {
    var pad = padding != null ? padding : 120;
    var cw = (canvas && canvas.width)  || 1080;
    var ch = (canvas && canvas.height) || 1920;

    var minLat = Infinity, maxLat = -Infinity;
    var minLng = Infinity, maxLng = -Infinity;

    geoPoints.forEach(function (p) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    var latSpan = maxLat - minLat || 0.001;
    var lngSpan = maxLng - minLng || 0.001;

    var availW = cw - pad * 2;
    var availH = ch - pad * 2;

    var scaleX = availW / lngSpan;
    var scaleY = availH / latSpan;
    var scale  = Math.min(scaleX, scaleY);

    var projW = lngSpan * scale;
    var projH = latSpan * scale;
    var offsetX = pad + (availW - projW) / 2;
    var offsetY = pad + (availH - projH) / 2;

    var projected = geoPoints.map(function (p) {
      return {
        lat: p.lat,
        lng: p.lng,
        x: offsetX + (p.lng - minLng) * scale,
        // invert Y so north is up
        y: offsetY + (maxLat - p.lat) * scale,
      };
    });

    var metadata = {
      type: "local-bounds",
      minLat: minLat,
      maxLat: maxLat,
      minLng: minLng,
      maxLng: maxLng,
      scale: scale,
      offsetX: offsetX,
      offsetY: offsetY,
    };

    return { points: projected, projection: metadata };
  }

  // ── Normalize points → RoutePoint model ──────────────────────────────────
  // Input: array of {lat, lng, x, y}
  // Output: array of {lat, lng, x, y, distanceMeters, t}
  function normalizeRoutePoints(points) {
    if (!points || points.length === 0) return [];

    var hasGeo = points[0].lat != null && points[0].lng != null;
    var cumulative = [0];

    for (var i = 1; i < points.length; i++) {
      var prev = points[i - 1];
      var curr = points[i];
      var d;
      if (hasGeo && prev.lat != null && curr.lat != null) {
        d = haversineMeters(prev, curr);
      } else {
        d = Math.hypot((curr.x || 0) - (prev.x || 0), (curr.y || 0) - (prev.y || 0));
      }
      cumulative.push(cumulative[i - 1] + d);
    }

    var total = cumulative[cumulative.length - 1] || 1;

    return points.map(function (p, i) {
      return {
        lat:             p.lat != null ? p.lat : null,
        lng:             p.lng != null ? p.lng : null,
        x:               p.x || 0,
        y:               p.y || 0,
        distanceMeters:  cumulative[i],
        t:               cumulative[i] / total,
      };
    });
  }

  // ── Auto-generate route segments ──────────────────────────────────────────
  function buildSegments(routeId, normalizedPoints, totalMeters, opts) {
    var targetMeters = (opts && opts.segmentTargetMeters) || 1000;
    var segCount = Math.max(2, Math.round(totalMeters / targetMeters));
    segCount = Math.min(segCount, Math.max(2, normalizedPoints.length - 1));

    var defaultTypes    = ["local", "road", "highway", "road", "waterfront", "road"];
    var defaultSkins    = ["residential", "suburban", "suburban", "suburban", "waterfront", "suburban"];

    var segments = [];
    for (var si = 0; si < segCount; si++) {
      var startT = si / segCount;
      var endT   = (si + 1) / segCount;
      segments.push({
        id:                   _makeId("seg"),
        routeId:              routeId,
        index:                si,
        type:                 defaultTypes[si % defaultTypes.length],
        startT:               startT,
        endT:                 endT,
        startDistanceMeters:  startT * totalMeters,
        endDistanceMeters:    endT   * totalMeters,
        speedLimitKph:        50,
        mood:                 "night-drive",
        density:              0.35,
        cameraHint:           "follow",
        skinHint:             defaultSkins[si % defaultSkins.length],
        eventPoolIds:         [],
      });
    }
    return segments;
  }

  // ── Duration helper ───────────────────────────────────────────────────────
  var DEFAULT_SPEED_KPH = 48;

  function durationFromDistance(distanceMeters, opts) {
    if (opts && opts.durationSec) return opts.durationSec;
    var speedKph = (opts && opts.averageSpeedKph) || DEFAULT_SPEED_KPH;
    var speedMps = speedKph / 3.6;
    return Math.round(distanceMeters / speedMps);
  }

  // ── GeoJSON extraction ───────────────────────────────────────────────────
  // Returns array of {lat, lng} or null on failure.
  function extractGeoJSONCoords(geojson) {
    var geo = geojson;

    if (geo.type === "FeatureCollection") {
      var feat = (geo.features || []).find(function (f) {
        return f.geometry && (
          f.geometry.type === "LineString" || f.geometry.type === "MultiLineString"
        );
      });
      if (!feat) { console.warn("[RouteIngestion] FeatureCollection: no LineString found"); return null; }
      geo = feat;
    }

    if (geo.type === "Feature") {
      if (!geo.geometry) { console.warn("[RouteIngestion] Feature missing geometry"); return null; }
      geo = geo.geometry;
    }

    if (geo.type === "LineString") {
      return coordsToLatLng(geo.coordinates);
    }

    if (geo.type === "MultiLineString") {
      // Flatten all line segments into one continuous route
      var flat = [];
      (geo.coordinates || []).forEach(function (line) {
        coordsToLatLng(line).forEach(function (p) { flat.push(p); });
      });
      return flat.length > 0 ? flat : null;
    }

    console.warn("[RouteIngestion] Unsupported geometry type:", geo.type);
    return null;
  }

  // GeoJSON uses [lng, lat, ?elev]
  function coordsToLatLng(coords) {
    return (coords || []).map(function (c) {
      return { lat: c[1], lng: c[0] };
    });
  }

  // ── Encoded polyline decoder (Google format) ──────────────────────────────
  // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
  function decodePolyline(encoded) {
    var points = [];
    var index = 0, len = encoded.length;
    var lat = 0, lng = 0;

    while (index < len) {
      var b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0; result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      var dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
    return points;
  }

  // ── Shared ID factory (mirrors main.js makeId if available) ──────────────
  function _makeId(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 9);
  }

  // ── Core route assembly ───────────────────────────────────────────────────
  // Takes geo points {lat, lng}, projects them, builds full route object.
  function assembleRoute(geoPoints, canvas, opts) {
    if (!geoPoints || geoPoints.length < 2) {
      console.warn("[RouteIngestion] Need at least 2 points");
      return null;
    }

    var routeId = (opts && opts.id) || _makeId("route");

    // Project geo → canvas space
    var proj    = projectLatLngToWorld(geoPoints, canvas, opts && opts.padding);
    var projPts = proj.points;

    // Attach haversine distances then normalize
    var withGeo = projPts.map(function (p, i) {
      return { lat: geoPoints[i].lat, lng: geoPoints[i].lng, x: p.x, y: p.y };
    });
    var normalized = normalizeRoutePoints(withGeo);
    var totalMeters = normalized[normalized.length - 1].distanceMeters;

    var duration = durationFromDistance(totalMeters, opts);

    // Pixel-space cumulative distances (for polyline sampler)
    var pixCumulative = [0];
    for (var i = 1; i < projPts.length; i++) {
      var dx = projPts[i].x - projPts[i - 1].x;
      var dy = projPts[i].y - projPts[i - 1].y;
      pixCumulative.push(pixCumulative[i - 1] + Math.hypot(dx, dy));
    }
    var totalPixels = pixCumulative[pixCumulative.length - 1] || 1;

    var segments = buildSegments(routeId, normalized, totalMeters, opts);

    var providerMeta = (opts && opts.properties) || {};
    var providerType = (opts && opts.providerType) || "geojson";

    var route = {
      id:             routeId,
      name:           (opts && opts.name) || providerMeta.name || "Route",
      start: {
        label: (opts && opts.startLabel) || "Home",
        lat:   normalized[0].lat,
        lng:   normalized[0].lng,
        x:     normalized[0].x,
        y:     normalized[0].y,
      },
      end: {
        label: (opts && opts.endLabel) || "Destination",
        lat:   normalized[normalized.length - 1].lat,
        lng:   normalized[normalized.length - 1].lng,
        x:     normalized[normalized.length - 1].x,
        y:     normalized[normalized.length - 1].y,
      },
      distanceMeters:     totalMeters,
      durationSec:        duration,
      averageSpeedKph:    (opts && opts.averageSpeedKph) || DEFAULT_SPEED_KPH,
      points:             normalized,
      segments:           segments.map(function (s) { return s.id; }),
      metadata: Object.assign({}, providerMeta, {
        projection: proj.projection,
        providerType: providerType,
      }),

      // Internal sampler caches (not persisted, rebuilt on load)
      _totalPixelLength:    totalPixels,
      _cumulativeDistances: pixCumulative,
      _skinSeed:            Math.floor(Math.random() * 1e8),
    };

    return { route: route, segments: segments };
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.RouteIngestion = {

    haversineMeters:      haversineMeters,
    projectLatLngToWorld: projectLatLngToWorld,
    normalizeRoutePoints: normalizeRoutePoints,
    decodePolyline:       decodePolyline,
    buildSegments:        buildSegments,
    assembleRoute:        assembleRoute,

    // Import a GeoJSON object → { route, segments } or null
    importGeoJSON: function (geojson, canvas, opts) {
      var geoPoints = extractGeoJSONCoords(geojson);
      if (!geoPoints) return null;

      // Carry GeoJSON properties as provider metadata
      var properties = (geojson.properties) ||
        (geojson.type === "FeatureCollection" && geojson.features && geojson.features[0]
          ? geojson.features[0].properties : null) || {};

      var mergedOpts = Object.assign({ providerType: "geojson", properties: properties }, opts || {});
      return assembleRoute(geoPoints, canvas, mergedOpts);
    },

    // Import a Google encoded polyline string → { route, segments } or null
    importEncodedPolyline: function (encoded, canvas, opts) {
      if (typeof encoded !== "string" || !encoded.length) {
        console.warn("[RouteIngestion] importEncodedPolyline: expected non-empty string");
        return null;
      }
      var geoPoints = decodePolyline(encoded);
      if (geoPoints.length < 2) {
        console.warn("[RouteIngestion] importEncodedPolyline: decoded fewer than 2 points");
        return null;
      }
      var mergedOpts = Object.assign({ providerType: "encodedPolyline" }, opts || {});
      return assembleRoute(geoPoints, canvas, mergedOpts);
    },

    // Re-project an existing route to fit the canvas (rebuilds pixel caches)
    fitRouteToCanvas: function (route, canvas, padding) {
      var geoPoints = route.points.filter(function (p) {
        return p.lat != null && p.lng != null;
      });
      if (geoPoints.length < 2) {
        console.warn("[RouteIngestion] fitRouteToCanvas: no geo points to re-project");
        return route;
      }
      var proj = projectLatLngToWorld(geoPoints, canvas, padding);
      var pts  = proj.points;

      // Rebuild pixel cumulative distances
      var pixCum = [0];
      for (var i = 1; i < pts.length; i++) {
        var dx = pts[i].x - pts[i - 1].x;
        var dy = pts[i].y - pts[i - 1].y;
        pixCum.push(pixCum[i - 1] + Math.hypot(dx, dy));
      }

      // Merge new x/y back into existing normalized points
      route.points = route.points.map(function (p, i) {
        if (!pts[i]) return p;
        return Object.assign({}, p, { x: pts[i].x, y: pts[i].y });
      });
      route._totalPixelLength    = pixCum[pixCum.length - 1] || 1;
      route._cumulativeDistances = pixCum;
      if (route.metadata) route.metadata.projection = proj.projection;

      return route;
    },

    // Route stats for HUD
    routeStats: function (route) {
      var distM   = route.distanceMeters || 0;
      var durSec  = route.durationSec    || 0;
      var speedKph = route.averageSpeedKph || DEFAULT_SPEED_KPH;

      var h = Math.floor(durSec / 3600);
      var m = Math.floor((durSec % 3600) / 60);
      var durationLabel = h > 0 ? h + "h " + m + "m" : m + "m";

      return {
        routeId:        route.id,
        name:           route.name,
        providerType:   (route.metadata && route.metadata.providerType) || "manual",
        pointCount:     route.points ? route.points.length : 0,
        segmentCount:   route.segments ? route.segments.length : 0,
        distanceMeters: Math.round(distM),
        distanceMiles:  Math.round(distM / 1609.34 * 100) / 100,
        durationSec:    durSec,
        durationLabel:  durationLabel,
        averageSpeedKph: speedKph,
        averageSpeedMph: Math.round(speedKph * 0.621371 * 10) / 10,
        startLabel:     route.start && route.start.label,
        endLabel:       route.end   && route.end.label,
      };
    },
  };

  console.log("[WOS RouteIngestion] Loaded — GeoJSON, encodedPolyline, localBounds projection");
})(window);
