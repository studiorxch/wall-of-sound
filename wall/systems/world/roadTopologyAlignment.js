(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── RoadTopologyAlignment (0520N_WOS_RoadTopologyAlignment_v1.1.0) ────────
  //
  // AUTHORITATIVE GEOGRAPHIC ROADWAY LAYER.
  //
  // REPLACES: hand-authored spline approximations, screen-space traffic paths,
  //           artist-defined corridor guesses.
  // WITH:     imported geographic centerlines, canonical intersection topology,
  //           deterministic lane offsets, projection-safe traversal.
  //
  // SHARED BY: TrafficFlowRuntime, future pedestrian / routing / camera systems.
  //
  // COORDINATE DOCTRINE (WGS84 → Local Meter Space):
  //   Raw lng/lat is prohibited in simulation. On anchor registration the
  //   runtime establishes a local origin. All active calculations occur in
  //   ±5000m meter space around that origin.
  //
  // PROJECTION PIPELINE:
  //   GeoJSON import → anchor transform → local meters → topology normalization
  //   → intersection deduplication → spatial hash → arc-length cache → traversal
  //
  // PROJECTION CACHE DOCTRINE:
  //   Screen projections cached per segment. Invalidated on zoom/pan/pitch/rotate.
  //   Segments outside frustum > 10s: cache evicted.
  //
  // SPATIAL HASH:
  //   75m cells. findNearestRoad() evaluates local + 8 neighbors → O(1).
  //
  // MULTI-LANE OFFSET:
  //   P_offset = P(d) + ((laneIndex * laneWidth) - (totalWidth / 2) + laneWidth/2) * N

  // ── Constants ─────────────────────────────────────────────────────────────
  var SNAP_THRESHOLD_M  = 5;      // intersection node deduplication radius
  var CELL_SIZE_M       = 75;     // spatial hash cell size
  var SAMPLE_RESOLUTION = 3;      // arc-length sample spacing (meters)
  var EVICTION_MS       = 10000;  // projection cache eviction timeout
  var MAX_OFFROAD_M     = 4;      // water exclusion max drift
  var TAN_EPS_M         = 0.5;    // tangent central difference distance

  // ── State ─────────────────────────────────────────────────────────────────
  var _anchor = null;        // { lng, lat, mpdLng, mpdLat }
  var _segments    = {};     // id → RoadSegment
  var _nodes       = {};     // nodeId → { worldPos:[x,y,z], connectedSegments:[] }
  var _nodeCounter = 0;
  var _spatialHash = {};     // "cx_cy" → [segmentId, ...]

  // Projection cache
  var _projVersion  = 0;    // incremented on viewport change
  var _lastZoom     = -1;
  var _lastCenterLng= 0;
  var _lastCenterLat= 0;

  // ── Projection anchor ─────────────────────────────────────────────────────
  // Converts the simulation from floating-point lng/lat to stable meter space.
  // Must be called before loadGeoJSON for stable coordinates.
  function setProjectionAnchor(opts) {
    var lat = opts.lat, lng = opts.lng;
    _anchor = {
      lng:    lng,
      lat:    lat,
      mpdLng: Math.cos(lat * Math.PI / 180) * 111320,  // meters per degree longitude
      mpdLat: 111320,                                    // meters per degree latitude
    };
    _projVersion++;
    console.log("[RoadTopologyAlignment] anchor →", lat.toFixed(6), lng.toFixed(6));
  }

  function _geoToLocal(lng, lat, z) {
    if (!_anchor) return { x: 0, y: 0, z: z || 0 };
    return {
      x: (lng - _anchor.lng) * _anchor.mpdLng,
      y: (lat - _anchor.lat) * _anchor.mpdLat,
      z: z || 0,
    };
  }

  function _localToGeo(x, y) {
    if (!_anchor) return { lng: 0, lat: 0 };
    return {
      lng: _anchor.lng + x / _anchor.mpdLng,
      lat: _anchor.lat + y / _anchor.mpdLat,
    };
  }

  // ── Polyline arc-length preprocessing ─────────────────────────────────────
  // Builds uniformly-spaced arcSamples[] at SAMPLE_RESOLUTION meter intervals.
  // Builds cumDist[] for O(log N) runtime traversal via binary search.
  // Uses piecewise-linear evaluation (GeoJSON centerlines are dense enough).
  function _preprocessSegment(seg) {
    var pts = seg.localPoints;
    var n   = pts.length;
    if (n < 2) {
      seg.arcSamples = [{ x: pts[0].x, y: pts[0].y, z: pts[0].z || 0 }];
      seg.cumDist    = [0];
      seg.totalLength = 0;
      return;
    }

    // Cumulative chord distances along control points
    var wptDist = new Array(n);
    wptDist[0] = 0;
    for (var i = 1; i < n; i++) {
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      wptDist[i] = wptDist[i - 1] + Math.sqrt(dx * dx + dy * dy);
    }
    var totalWpt = wptDist[n - 1];

    // Sample at uniform arc-length intervals
    var N = Math.max(10, Math.ceil(totalWpt / SAMPLE_RESOLUTION));
    var arcSamples = new Array(N + 1);
    var cumDist    = new Array(N + 1);
    cumDist[0] = 0;

    for (var k = 0; k <= N; k++) {
      arcSamples[k] = _evalPolyline(pts, wptDist, (k / N) * totalWpt, n);
    }
    for (var k2 = 1; k2 <= N; k2++) {
      var sx = arcSamples[k2].x - arcSamples[k2 - 1].x;
      var sy = arcSamples[k2].y - arcSamples[k2 - 1].y;
      cumDist[k2] = cumDist[k2 - 1] + Math.sqrt(sx * sx + sy * sy);
    }

    seg.arcSamples  = arcSamples;
    seg.cumDist     = cumDist;
    seg.totalLength = cumDist[N];
  }

  function _evalPolyline(pts, wptDist, d, n) {
    if (d <= 0)           return { x: pts[0].x,     y: pts[0].y,     z: pts[0].z     || 0 };
    if (d >= wptDist[n - 1]) return { x: pts[n-1].x, y: pts[n-1].y, z: pts[n-1].z   || 0 };
    var lo = 0, hi = n - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (wptDist[mid] <= d) lo = mid; else hi = mid; }
    var span = wptDist[hi] - wptDist[lo];
    var t    = span > 0 ? (d - wptDist[lo]) / span : 0;
    return {
      x: pts[lo].x + t * (pts[hi].x - pts[lo].x),
      y: pts[lo].y + t * (pts[hi].y - pts[lo].y),
      z: (pts[lo].z || 0) + t * ((pts[hi].z || 0) - (pts[lo].z || 0)),
    };
  }

  // ── Arc-length sample lookup — O(log N) ───────────────────────────────────
  function _sampleAtDist(seg, dist) {
    var cum = seg.cumDist, s = seg.arcSamples, n = cum.length;
    if (dist <= 0)          return s[0];
    if (dist >= cum[n - 1]) return s[n - 1];
    var lo = 0, hi = n - 1;
    while (lo < hi - 1) { var mid = (lo + hi) >> 1; if (cum[mid] <= dist) lo = mid; else hi = mid; }
    var span = cum[hi] - cum[lo], t = span > 0 ? (dist - cum[lo]) / span : 0;
    return {
      x: s[lo].x + t * (s[hi].x - s[lo].x),
      y: s[lo].y + t * (s[hi].y - s[lo].y),
      z: s[lo].z + t * (s[hi].z - s[lo].z),
    };
  }

  function _tangentAtDist(seg, dist) {
    var p0 = _sampleAtDist(seg, Math.max(0, dist - TAN_EPS_M));
    var p1 = _sampleAtDist(seg, Math.min(seg.totalLength, dist + TAN_EPS_M));
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // ── Intersection node registry ────────────────────────────────────────────
  // Deduplicates segment endpoints within SNAP_THRESHOLD_M into shared nodes.
  function _registerNode(x, y, z, segId) {
    var keys = Object.keys(_nodes);
    for (var i = 0; i < keys.length; i++) {
      var nd = _nodes[keys[i]];
      var dx = nd.worldPos[0] - x, dy = nd.worldPos[1] - y;
      if (dx * dx + dy * dy <= SNAP_THRESHOLD_M * SNAP_THRESHOLD_M) {
        if (nd.connectedSegments.indexOf(segId) < 0) nd.connectedSegments.push(segId);
        return keys[i];
      }
    }
    var nodeId = "node_" + (++_nodeCounter);
    _nodes[nodeId] = { worldPos: [x, y, z || 0], connectedSegments: [segId] };
    return nodeId;
  }

  // ── Spatial hash ──────────────────────────────────────────────────────────
  function _cellKey(x, y) {
    return Math.floor(x / CELL_SIZE_M) + "_" + Math.floor(y / CELL_SIZE_M);
  }

  function _hashSegment(seg) {
    var samples = seg.arcSamples;
    var visited = {};
    for (var i = 0; i < samples.length; i++) {
      var key = _cellKey(samples[i].x, samples[i].y);
      if (visited[key]) continue;
      visited[key] = true;
      if (!_spatialHash[key]) _spatialHash[key] = [];
      if (_spatialHash[key].indexOf(seg.id) < 0) _spatialHash[key].push(seg.id);
    }
  }

  // ── Projection cache ──────────────────────────────────────────────────────
  // Detects zoom / center changes → invalidates all projection caches.
  function _checkViewportDrift() {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr) return;
    var st = mvr.getState ? mvr.getState() : null;
    if (!st) return;
    var zoom = Math.round(st.zoom * 10) / 10;
    var lng  = st.lng  != null ? Math.round(st.lng  * 1000) / 1000 : _lastCenterLng;
    var lat  = st.lat  != null ? Math.round(st.lat  * 1000) / 1000 : _lastCenterLat;
    if (zoom !== _lastZoom || lng !== _lastCenterLng || lat !== _lastCenterLat) {
      _lastZoom      = zoom;
      _lastCenterLng = lng;
      _lastCenterLat = lat;
      _projVersion++;
    }
  }

  // Returns screen-space projected samples for segment, refreshing cache if stale.
  function _getProjectedSamples(seg) {
    if (seg.projectionVersion === _projVersion) {
      seg.lastSeenMs = Date.now();
      return seg.projectedSamples;
    }
    var map = SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap();
    if (!map) return null;

    var samples   = seg.arcSamples;
    var projected = new Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      try {
        var geo = _localToGeo(samples[i].x, samples[i].y);
        var pt  = map.project(geo);
        projected[i] = { sx: Math.round(pt.x), sy: Math.round(pt.y) };
      } catch (e) {
        projected[i] = null;
      }
    }

    seg.projectedSamples  = projected;
    seg.projectionVersion = _projVersion;
    seg.lastSeenMs        = Date.now();
    return projected;
  }

  // Evict projection caches for segments unseen > EVICTION_MS.
  function _evictStaleProjections() {
    var now  = Date.now();
    var keys = Object.keys(_segments);
    for (var i = 0; i < keys.length; i++) {
      var seg = _segments[keys[i]];
      if (seg.projectedSamples && seg.lastSeenMs > 0 &&
          now - seg.lastSeenMs > EVICTION_MS) {
        seg.projectedSamples  = null;
        seg.projectionVersion = -1;
      }
    }
  }

  // ── Nearest-road query ────────────────────────────────────────────────────
  // Local + 8 neighbor cells → O(1) for densely hashed networks.
  function findNearestRoad(x, y) {
    var cx = Math.floor(x / CELL_SIZE_M), cy = Math.floor(y / CELL_SIZE_M);
    var bestD2 = Infinity, bestSeg = null, bestDistM = 0;

    for (var dx = -1; dx <= 1; dx++) {
      for (var dy = -1; dy <= 1; dy++) {
        var ids = _spatialHash[(cx + dx) + "_" + (cy + dy)];
        if (!ids) continue;
        for (var i = 0; i < ids.length; i++) {
          var seg = _segments[ids[i]];
          if (!seg) continue;
          var r = _nearestOnSeg(seg, x, y);
          if (r.d2 < bestD2) { bestD2 = r.d2; bestSeg = seg; bestDistM = r.distM; }
        }
      }
    }

    if (!bestSeg) return null;
    return {
      segmentId:    bestSeg.id,
      distanceM:    bestDistM,
      offRoadM:     Math.sqrt(bestD2),
      waterViolation: bestSeg.waterExclusion && Math.sqrt(bestD2) > MAX_OFFROAD_M,
    };
  }

  function _nearestOnSeg(seg, px, py) {
    var s = seg.arcSamples, c = seg.cumDist;
    var bestD2 = Infinity, bestIdx = 0;
    for (var i = 0; i < s.length; i++) {
      var dx = s[i].x - px, dy = s[i].y - py, d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; bestIdx = i; }
    }
    return { d2: bestD2, distM: c[bestIdx] };
  }

  // ── Public: sample position + lane offset ─────────────────────────────────
  // Returns { x, y, z, heading, tangent, normal } in local meter space.
  // laneIndex=0 = leftmost lane. Positive normal = rightward of tangent direction.
  function sample(segmentId, distanceMeters, laneIndex) {
    var seg = _segments[segmentId];
    if (!seg || !seg.arcSamples) return null;

    var pos = _sampleAtDist(seg, distanceMeters);
    var tan = _tangentAtDist(seg, distanceMeters);
    // Rightward normal (perpendicular, screen right of direction of travel)
    var nor = { x: -tan.y, y: tan.x };

    var lane   = laneIndex || 0;
    var laneW  = seg.laneWidthMeters;
    var totalW = seg.widthMeters;
    // Center vehicle within its lane:  (lane * laneW) - (totalW/2) + (laneW/2)
    var offset = (lane * laneW) - (totalW * 0.5) + (laneW * 0.5);

    return {
      x:       pos.x + offset * nor.x,
      y:       pos.y + offset * nor.y,
      z:       pos.z,
      heading: Math.atan2(tan.y, tan.x),
      tangent: tan,
      normal:  nor,
    };
  }

  // ── GeoJSON ingestion ─────────────────────────────────────────────────────
  function loadGeoJSON(geojson) {
    if (!geojson || geojson.type !== "FeatureCollection") {
      console.warn("[RoadTopologyAlignment] loadGeoJSON: expected FeatureCollection");
      return 0;
    }
    if (!_anchor) {
      console.warn("[RoadTopologyAlignment] loadGeoJSON: no projection anchor set");
      return 0;
    }

    var features = geojson.features || [];
    var loaded   = 0;
    var totalSamples = 0;

    for (var fi = 0; fi < features.length; fi++) {
      var feat = features[fi];
      if (!feat || !feat.geometry) continue;
      if (feat.geometry.type !== "LineString") continue;

      var props  = feat.properties || {};
      var id     = props.id || ("road_" + fi);
      var coords = feat.geometry.coordinates;
      if (!coords || coords.length < 2) continue;

      // Convert WGS84 coordinates → local meter space
      var localPts = new Array(coords.length);
      for (var ci = 0; ci < coords.length; ci++) {
        localPts[ci] = _geoToLocal(coords[ci][0], coords[ci][1], coords[ci][2]);
      }

      var lanes   = props.lanes          || 1;
      var laneW   = props.laneWidthMeters || 3.6;
      var seg = {
        id:              id,
        type:            props.type          || "secondary",
        direction:       props.direction     || null,
        lanes:           lanes,
        laneWidthMeters: laneW,
        widthMeters:     props.widthMeters   || lanes * laneW,
        speedLimitKmh:   props.speedLimitKmh || 50,
        bridge:          !!props.bridge,
        tunnel:          !!props.tunnel,
        waterExclusion:  props.waterExclusion != null ? !!props.waterExclusion : true,
        localPoints:     localPts,
        metadata: {
          source:   props.source   || "geojson",
          district: props.district || null,
        },
        // Arc-length tables (populated below)
        arcSamples:  null,
        cumDist:     null,
        totalLength: 0,
        // Topology
        startNodeId: null,
        endNodeId:   null,
        // Projection cache
        projectedSamples:  null,
        projectionVersion: -1,
        lastSeenMs:        0,
      };

      _preprocessSegment(seg);
      totalSamples += seg.arcSamples.length;

      // Register intersection nodes
      var first = localPts[0], last = localPts[localPts.length - 1];
      seg.startNodeId = _registerNode(first.x, first.y, first.z, seg.id);
      seg.endNodeId   = _registerNode(last.x,  last.y,  last.z,  seg.id);

      _hashSegment(seg);
      _segments[seg.id] = seg;
      loaded++;
    }

    _projVersion++;
    console.log("[RoadTopologyAlignment] loaded", loaded, "segments,",
      totalSamples, "arc-length samples,",
      Object.keys(_nodes).length, "intersection nodes");
    return loaded;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────
  function getSegment(id) { return _segments[id] || null; }

  // Returns { arcSamples, projectedSamples (screen), totalLength, ... }
  function getProjectedSegment(id) {
    var seg = _segments[id];
    if (!seg) return null;
    _checkViewportDrift();
    var proj = _getProjectedSamples(seg);
    return { segment: seg, projectedSamples: proj };
  }

  function getSegmentIds()    { return Object.keys(_segments); }
  function getNodes()         { return _nodes; }
  function getSpatialStats()  {
    var cells = Object.keys(_spatialHash).length;
    var segs  = Object.keys(_segments).length;
    var nodes = Object.keys(_nodes).length;
    return { segments: segs, nodes: nodes, hashCells: cells };
  }

  // ── Seed road network ─────────────────────────────────────────────────────
  // Brooklyn and Manhattan arteries — identical centerlines to TrafficFlowRuntime.
  // Formatted as canonical GeoJSON FeatureCollection.
  // coordinates: [lng, lat] or [lng, lat, z] for bridge elevation.
  function _seedDefaultRoads() {
    loadGeoJSON({ type: "FeatureCollection", features: [

      // ── BROOKLYN ──────────────────────────────────────────────────────────

      { type: "Feature", properties: { id: "atlantic_ave_eb", type: "secondary",
          direction: "eastbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 45, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0098, 40.6843], [-74.0030, 40.6842], [-73.9965, 40.6841],
          [-73.9895, 40.6840], [-73.9820, 40.6838], [-73.9755, 40.6836],
          [-73.9680, 40.6834], [-73.9610, 40.6832], [-73.9540, 40.6830],
          [-73.9465, 40.6828], [-73.9395, 40.6826], [-73.9320, 40.6824],
          [-73.9245, 40.6822], [-73.9170, 40.6820],
        ]}},

      { type: "Feature", properties: { id: "atlantic_ave_wb", type: "secondary",
          direction: "westbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 45, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9170, 40.6820], [-73.9245, 40.6822], [-73.9320, 40.6824],
          [-73.9395, 40.6826], [-73.9465, 40.6828], [-73.9540, 40.6830],
          [-73.9610, 40.6832], [-73.9680, 40.6834], [-73.9755, 40.6836],
          [-73.9820, 40.6838], [-73.9895, 40.6840], [-73.9965, 40.6841],
          [-74.0030, 40.6842], [-74.0098, 40.6843],
        ]}},

      { type: "Feature", properties: { id: "flatbush_nb", type: "primary",
          direction: "northbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 40, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9564, 40.6493], [-73.9590, 40.6552], [-73.9614, 40.6609],
          [-73.9640, 40.6651], [-73.9662, 40.6695], [-73.9680, 40.6726],
          [-73.9706, 40.6760], [-73.9726, 40.6790], [-73.9748, 40.6820],
          [-73.9765, 40.6843], [-73.9792, 40.6875], [-73.9815, 40.6898],
          [-73.9835, 40.6918], [-73.9858, 40.6950], [-73.9875, 40.6975],
          [-73.9892, 40.7005], [-73.9908, 40.7060],
        ]}},

      { type: "Feature", properties: { id: "flatbush_sb", type: "primary",
          direction: "southbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 40, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9908, 40.7060], [-73.9892, 40.7005], [-73.9875, 40.6975],
          [-73.9858, 40.6950], [-73.9835, 40.6918], [-73.9815, 40.6898],
          [-73.9792, 40.6875], [-73.9765, 40.6843], [-73.9748, 40.6820],
          [-73.9726, 40.6790], [-73.9706, 40.6760], [-73.9680, 40.6726],
          [-73.9662, 40.6695], [-73.9640, 40.6651], [-73.9614, 40.6609],
          [-73.9590, 40.6552], [-73.9564, 40.6493],
        ]}},

      { type: "Feature", properties: { id: "bedford_ave_nb", type: "secondary",
          direction: "northbound", lanes: 1, laneWidthMeters: 3.6,
          speedLimitKmh: 35, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9568, 40.6948], [-73.9566, 40.6985], [-73.9563, 40.7020],
          [-73.9561, 40.7055], [-73.9559, 40.7090], [-73.9558, 40.7125],
          [-73.9556, 40.7160], [-73.9554, 40.7194], [-73.9553, 40.7230],
          [-73.9551, 40.7265],
        ]}},

      { type: "Feature", properties: { id: "bedford_ave_sb", type: "secondary",
          direction: "southbound", lanes: 1, laneWidthMeters: 3.6,
          speedLimitKmh: 35, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9551, 40.7265], [-73.9553, 40.7230], [-73.9554, 40.7194],
          [-73.9556, 40.7160], [-73.9558, 40.7125], [-73.9559, 40.7090],
          [-73.9561, 40.7055], [-73.9563, 40.7020], [-73.9566, 40.6985],
          [-73.9568, 40.6948],
        ]}},

      { type: "Feature", properties: { id: "bqe_nb", type: "motorway",
          direction: "northbound", lanes: 3, laneWidthMeters: 3.6,
          speedLimitKmh: 72, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0175, 40.6415], [-74.0148, 40.6488], [-74.0112, 40.6558],
          [-74.0082, 40.6612], [-74.0042, 40.6658], [-73.9998, 40.6702],
          [-73.9972, 40.6742], [-73.9955, 40.6782], [-73.9950, 40.6820],
          [-73.9938, 40.6862], [-73.9910, 40.6905], [-73.9875, 40.6945],
          [-73.9840, 40.6988], [-73.9790, 40.7025], [-73.9750, 40.7068],
          [-73.9705, 40.7110], [-73.9655, 40.7155], [-73.9608, 40.7198],
          [-73.9560, 40.7240],
        ]}},

      { type: "Feature", properties: { id: "bqe_sb", type: "motorway",
          direction: "southbound", lanes: 3, laneWidthMeters: 3.6,
          speedLimitKmh: 72, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9560, 40.7240], [-73.9608, 40.7198], [-73.9655, 40.7155],
          [-73.9705, 40.7110], [-73.9750, 40.7068], [-73.9790, 40.7025],
          [-73.9840, 40.6988], [-73.9875, 40.6945], [-73.9910, 40.6905],
          [-73.9938, 40.6862], [-73.9950, 40.6820], [-73.9955, 40.6782],
          [-73.9972, 40.6742], [-73.9998, 40.6702], [-74.0042, 40.6658],
          [-74.0082, 40.6612], [-74.0112, 40.6558], [-74.0148, 40.6488],
          [-74.0175, 40.6415],
        ]}},

      // Manhattan Bridge — z-elevated [lng, lat, z]
      { type: "Feature", properties: { id: "manhattan_bridge_eb", type: "primary",
          direction: "eastbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 50, bridge: true, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0022, 40.7108, 2], [-73.9995, 40.7095, 12],
          [-73.9975, 40.7083, 40], [-73.9950, 40.7072, 41],
          [-73.9925, 40.7062, 41], [-73.9900, 40.7052, 40],
          [-73.9880, 40.7043, 20], [-73.9868, 40.7028, 2],
        ]}},

      { type: "Feature", properties: { id: "manhattan_bridge_wb", type: "primary",
          direction: "westbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 50, bridge: true, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9868, 40.7028, 2], [-73.9880, 40.7043, 20],
          [-73.9900, 40.7052, 40], [-73.9925, 40.7062, 41],
          [-73.9950, 40.7072, 41], [-73.9975, 40.7083, 40],
          [-73.9995, 40.7095, 12], [-74.0022, 40.7108, 2],
        ]}},

      { type: "Feature", properties: { id: "williamsburg_bridge_wb", type: "primary",
          direction: "westbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 50, bridge: true, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9725, 40.7150, 2], [-73.9760, 40.7145, 12],
          [-73.9800, 40.7140, 18], [-73.9845, 40.7137, 18],
          [-73.9880, 40.7135, 18], [-73.9910, 40.7132, 10],
          [-73.9940, 40.7128, 2],
        ]}},

      { type: "Feature", properties: { id: "williamsburg_bridge_eb", type: "primary",
          direction: "eastbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 50, bridge: true, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9940, 40.7128, 2], [-73.9910, 40.7132, 10],
          [-73.9880, 40.7135, 18], [-73.9845, 40.7137, 18],
          [-73.9800, 40.7140, 18], [-73.9760, 40.7145, 12],
          [-73.9725, 40.7150, 2],
        ]}},

      { type: "Feature", properties: { id: "fourth_ave_nb", type: "secondary",
          direction: "northbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 40, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9902, 40.6555], [-73.9900, 40.6590], [-73.9898, 40.6625],
          [-73.9895, 40.6660], [-73.9893, 40.6695], [-73.9892, 40.6730],
          [-73.9890, 40.6765], [-73.9888, 40.6800], [-73.9887, 40.6835],
          [-73.9885, 40.6868],
        ]}},

      { type: "Feature", properties: { id: "broadway_bk_ne", type: "secondary",
          direction: "northeast", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 40, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9402, 40.6835], [-73.9435, 40.6875], [-73.9468, 40.6912],
          [-73.9502, 40.6950], [-73.9538, 40.6988], [-73.9572, 40.7025],
          [-73.9605, 40.7060], [-73.9640, 40.7095],
        ]}},

      // ── MANHATTAN ──────────────────────────────────────────────────────────

      { type: "Feature", properties: { id: "fdr_nb", type: "motorway",
          direction: "northbound", lanes: 3, laneWidthMeters: 3.6,
          speedLimitKmh: 72, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9728, 40.7010], [-73.9718, 40.7038], [-73.9708, 40.7068],
          [-73.9700, 40.7100], [-73.9698, 40.7128], [-73.9700, 40.7158],
          [-73.9702, 40.7190], [-73.9700, 40.7225], [-73.9695, 40.7260],
          [-73.9690, 40.7295], [-73.9685, 40.7330], [-73.9680, 40.7368],
          [-73.9675, 40.7405],
        ]}},

      { type: "Feature", properties: { id: "fdr_sb", type: "motorway",
          direction: "southbound", lanes: 3, laneWidthMeters: 3.6,
          speedLimitKmh: 72, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9675, 40.7405], [-73.9680, 40.7368], [-73.9685, 40.7330],
          [-73.9690, 40.7295], [-73.9695, 40.7260], [-73.9700, 40.7225],
          [-73.9702, 40.7190], [-73.9700, 40.7158], [-73.9698, 40.7128],
          [-73.9700, 40.7100], [-73.9708, 40.7068], [-73.9718, 40.7038],
          [-73.9728, 40.7010],
        ]}},

      { type: "Feature", properties: { id: "west_side_hwy_nb", type: "motorway",
          direction: "northbound", lanes: 3, laneWidthMeters: 3.6,
          speedLimitKmh: 65, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0148, 40.7005], [-74.0150, 40.7045], [-74.0148, 40.7085],
          [-74.0140, 40.7125], [-74.0128, 40.7162], [-74.0115, 40.7198],
          [-74.0105, 40.7238], [-74.0098, 40.7278], [-74.0090, 40.7318],
          [-74.0080, 40.7358], [-74.0068, 40.7398],
        ]}},

      { type: "Feature", properties: { id: "west_side_hwy_sb", type: "motorway",
          direction: "southbound", lanes: 3, laneWidthMeters: 3.6,
          speedLimitKmh: 65, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0068, 40.7398], [-74.0080, 40.7358], [-74.0090, 40.7318],
          [-74.0098, 40.7278], [-74.0105, 40.7238], [-74.0115, 40.7198],
          [-74.0128, 40.7162], [-74.0140, 40.7125], [-74.0148, 40.7085],
          [-74.0150, 40.7045], [-74.0148, 40.7005],
        ]}},

      { type: "Feature", properties: { id: "broadway_manhattan_nb", type: "secondary",
          direction: "northbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 35, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0113, 40.7075], [-74.0102, 40.7105], [-74.0088, 40.7140],
          [-74.0072, 40.7168], [-74.0052, 40.7200], [-74.0028, 40.7235],
          [-74.0002, 40.7265], [-73.9978, 40.7298], [-73.9955, 40.7335],
          [-73.9932, 40.7368], [-73.9902, 40.7400], [-73.9882, 40.7438],
          [-73.9868, 40.7478],
        ]}},

      { type: "Feature", properties: { id: "broadway_manhattan_sb", type: "secondary",
          direction: "southbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 35, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-73.9868, 40.7478], [-73.9882, 40.7438], [-73.9902, 40.7400],
          [-73.9932, 40.7368], [-73.9955, 40.7335], [-73.9978, 40.7298],
          [-74.0002, 40.7265], [-74.0028, 40.7235], [-74.0052, 40.7200],
          [-74.0072, 40.7168], [-74.0088, 40.7140], [-74.0102, 40.7105],
          [-74.0113, 40.7075],
        ]}},

      { type: "Feature", properties: { id: "sixth_ave_nb", type: "secondary",
          direction: "northbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 35, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0028, 40.7195], [-74.0010, 40.7228], [-73.9998, 40.7258],
          [-73.9988, 40.7290], [-73.9978, 40.7322], [-73.9968, 40.7355],
          [-73.9958, 40.7388], [-73.9948, 40.7422], [-73.9935, 40.7455],
          [-73.9922, 40.7485],
        ]}},

      { type: "Feature", properties: { id: "houston_st_eb", type: "secondary",
          direction: "eastbound", lanes: 2, laneWidthMeters: 3.6,
          speedLimitKmh: 35, waterExclusion: true, source: "wos_internal" },
        geometry: { type: "LineString", coordinates: [
          [-74.0055, 40.7280], [-74.0008, 40.7277], [-73.9975, 40.7275],
          [-73.9945, 40.7272], [-73.9910, 40.7270], [-73.9875, 40.7268],
          [-73.9840, 40.7265], [-73.9805, 40.7263], [-73.9775, 40.7260],
          [-73.9742, 40.7258],
        ]}},

    ]});
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    // Default anchor: Crown Heights / Prospect Heights border (geographic center
    // of the Brooklyn/Manhattan coverage area)
    setProjectionAnchor({ lat: 40.680, lng: -73.990 });

    _seedDefaultRoads();

    // Periodic eviction every 5s
    global.setInterval(_evictStaleProjections, 5000);

    var stats = getSpatialStats();
    console.log("[RoadTopologyAlignment] initialized v1.1.0 —",
      stats.segments, "segments |",
      stats.nodes,    "nodes |",
      stats.hashCells, "hash cells |",
      "anchor 40.680, -73.990");
  }

  SBE.RoadTopologyAlignment = {
    init:                 init,
    setProjectionAnchor:  setProjectionAnchor,
    loadGeoJSON:          loadGeoJSON,
    getSegment:           getSegment,
    getProjectedSegment:  getProjectedSegment,
    getSegmentIds:        getSegmentIds,
    getNodes:             getNodes,
    getSpatialStats:      getSpatialStats,
    sample:               sample,
    findNearestRoad:      findNearestRoad,
    // Internal accessors for debug tools
    _segments:    function () { return _segments; },
    _nodes:       function () { return _nodes; },
    _spatialHash: function () { return _spatialHash; },
  };

})(window);
