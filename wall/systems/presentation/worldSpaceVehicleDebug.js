// ── WorldSpaceVehicleDebug v1.0.0 ─────────────────────────────────────────────
// 0531J_WOS_WorldSpaceVehicleLayer_v1.0.0
// Status: prototype
// Classification: debug-namespace
//
// Console API: _wos.debug.worldVehicles
//   state()          — layer state snapshot
//   enable()         — switch to world-space rendering
//   disable()        — fall back to DOM markers
//   clear()          — remove all vehicle meshes
//   scale(n)         — multiply all vehicle scales by n (debug)
//   debug(bool)      — toggle internal debug logging
//   testHero()       — place one sedan at camera center
//   testTraffic()    — place sedan + taxi + white truck + graffiti truck
//
// Placement: wall/systems/presentation/worldSpaceVehicleDebug.js
// Load: AFTER worldSpaceVehicleLayer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  function _wsl()  { return global.SBE && global.SBE.WorldSpaceVehicleLayer; }
  function _mvr()  { return global.SBE && global.SBE.MapboxViewportRuntime; }

  // ── Position helpers ──────────────────────────────────────────────────────────

  function _mapCenter() {
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) return null;
    try { var c = map.getCenter(); return { lat: c.lat, lng: c.lng }; } catch (e) { return null; }
  }

  // Offset a lat/lng by ~metres in a cardinal direction (good enough for test placement)
  function _offsetLatLng(lat, lng, northM, eastM) {
    var mPerDegLat = 111320;
    var mPerDegLng = 111320 * Math.cos(lat * Math.PI / 180);
    return {
      lat: lat + northM / mPerDegLat,
      lng: lng + eastM  / mPerDegLng,
    };
  }

  // ── Road-bound placement helpers (0601R) ─────────────────────────────────────

  // Query rendered LINE features in the central 60% of the viewport that look
  // like roads/ramps/bridges/tunnels (by layer id or properties).
  function _queryRoadFeaturesNearCenter(limit) {
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map || typeof map.queryRenderedFeatures !== 'function') return [];

    var canvas = map.getCanvas();
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var bbox = [
      [Math.round(w * 0.20), Math.round(h * 0.20)],
      [Math.round(w * 0.80), Math.round(h * 0.80)],
    ];

    var feats;
    try { feats = map.queryRenderedFeatures(bbox); } catch (e) { return []; }
    var rx = /road|street|motorway|highway|bridge|tunnel|ramp|route/i;
    var features = (feats || []).filter(function (f) {
      var type    = f.geometry && f.geometry.type;
      var props   = f.properties || {};
      var layerId = (f.layer && f.layer.id) || '';
      return (type === 'LineString' || type === 'MultiLineString') &&
             (rx.test(layerId) || rx.test(JSON.stringify(props)));
    });
    return features.slice(0, limit || 80);
  }

  // Flatten a line/multiline feature to a coordinate array ([lng,lat] pairs).
  function _featureLineCoords(feature) {
    if (!feature || !feature.geometry) return [];
    if (feature.geometry.type === 'LineString') return feature.geometry.coordinates || [];
    if (feature.geometry.type === 'MultiLineString') {
      var out = [];
      (feature.geometry.coordinates || []).forEach(function (line) {
        if (line && line.length) out = out.concat(line);
      });
      return out;
    }
    return [];
  }

  // True if a coord looks like a real [lng,lat] pair (vs. screen/tile space).
  function _looksLikeLngLat(coord) {
    return coord && coord.length >= 2 &&
      Math.abs(coord[0]) <= 180 && Math.abs(coord[1]) <= 90;
  }

  // Sample midpoints + segment headings along road polylines.
  // 0601S — queryRenderedFeatures can return tile/screen coords, not lng/lat;
  // when a segment doesn't look geographic, unproject its screen midpoint.
  // Also verifies each sampled point projects within ~200px of the viewport.
  function _sampleRoadTrafficPoints(count) {
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) return [];
    var canvas = map.getCanvas();
    var w = canvas ? canvas.clientWidth : 0, h = canvas ? canvas.clientHeight : 0;

    var features = _queryRoadFeaturesNearCenter(120);
    var points = [];
    var skippedOffscreen = 0;

    for (var fi = 0; fi < features.length; fi++) {
      var feature = features[fi];
      var coords = _featureLineCoords(feature);
      if (!coords || coords.length < 2) continue;
      for (var i = 0; i < coords.length - 1; i += 2) {
        var a = coords[i], b = coords[i + 1];
        if (!a || !b) continue;

        var lng, lat, heading;
        if (_looksLikeLngLat(a) && _looksLikeLngLat(b)) {
          lng = (a[0] + b[0]) / 2;
          lat = (a[1] + b[1]) / 2;
          heading = Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
        } else {
          // Treat as screen/tile coords → unproject the midpoint.
          var mid;
          try { mid = map.unproject([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); } catch (e) { continue; }
          if (!mid) continue;
          lng = mid.lng; lat = mid.lat;
          // Heading from the two endpoints' geographic projection
          var ga, gb;
          try { ga = map.unproject([a[0], a[1]]); gb = map.unproject([b[0], b[1]]); } catch (e) {}
          heading = (ga && gb) ? Math.atan2(gb.lng - ga.lng, gb.lat - ga.lat) * 180 / Math.PI : 0;
        }

        // C — verify the point lands within ~200px of the viewport.
        var proj;
        try { proj = map.project([lng, lat]); } catch (e) { continue; }
        var dx = proj.x < 0 ? -proj.x : (proj.x > w ? proj.x - w : 0);
        var dy = proj.y < 0 ? -proj.y : (proj.y > h ? proj.y - h : 0);
        if (Math.sqrt(dx * dx + dy * dy) > 200) { skippedOffscreen++; continue; }

        points.push({
          lat: lat, lng: lng, headingDeg: heading,
          layerId: (feature.layer && feature.layer.id) || null,
          screen: { x: Math.round(proj.x), y: Math.round(proj.y) },
        });
        if (points.length >= count) { points.skippedOffscreen = skippedOffscreen; return points; }
      }
    }
    points.skippedOffscreen = skippedOffscreen;
    return points;
  }

  // Deterministic grid fallback (the prior 0601Q layout), as point objects.
  function _gridTrafficPoints(anchor, count) {
    var HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315];
    var SPACING_M = 38;
    var cols = Math.ceil(Math.sqrt(count));
    var rows = Math.ceil(count / cols);
    var points = [];
    for (var i = 0; i < count; i++) {
      var row = Math.floor(i / cols), col = i % cols;
      var northM = (row - (rows - 1) / 2) * SPACING_M;
      var eastM  = (col - (cols - 1) / 2) * SPACING_M;
      var p = _offsetLatLng(anchor.lat, anchor.lng, northM, eastM);
      points.push({ lat: p.lat, lng: p.lng, headingDeg: HEADINGS[i % HEADINGS.length], layerId: null });
    }
    return points;
  }

  // ── Road segment sampler + motion state (0601V) ──────────────────────────────
  // Like _sampleRoadTrafficPoints but keeps both endpoints so an actor can move
  // along the segment. Endpoints are unprojected from screen/tile coords when the
  // feature geometry isn't geographic; each segment midpoint is viewport-verified.
  function _sampleRoadSegments(count) {
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) return [];
    var canvas = map.getCanvas();
    var w = canvas ? canvas.clientWidth : 0, h = canvas ? canvas.clientHeight : 0;

    var features = _queryRoadFeaturesNearCenter(120);
    var segments = [];
    for (var fi = 0; fi < features.length; fi++) {
      var coords = _featureLineCoords(features[fi]);
      if (!coords || coords.length < 2) continue;
      for (var i = 0; i < coords.length - 1; i += 2) {
        var a = coords[i], b = coords[i + 1];
        if (!a || !b) continue;

        var aLng, aLat, bLng, bLat;
        if (_looksLikeLngLat(a) && _looksLikeLngLat(b)) {
          aLng = a[0]; aLat = a[1]; bLng = b[0]; bLat = b[1];
        } else {
          var ga, gb;
          try { ga = map.unproject([a[0], a[1]]); gb = map.unproject([b[0], b[1]]); } catch (e) { continue; }
          if (!ga || !gb) continue;
          aLng = ga.lng; aLat = ga.lat; bLng = gb.lng; bLat = gb.lat;
        }

        // Viewport-verify the segment midpoint (≤200px tolerance).
        var midLng = (aLng + bLng) / 2, midLat = (aLat + bLat) / 2, proj;
        try { proj = map.project([midLng, midLat]); } catch (e) { continue; }
        var dx = proj.x < 0 ? -proj.x : (proj.x > w ? proj.x - w : 0);
        var dy = proj.y < 0 ? -proj.y : (proj.y > h ? proj.y - h : 0);
        if (Math.sqrt(dx * dx + dy * dy) > 200) continue;

        var heading = Math.atan2(bLng - aLng, bLat - aLat) * 180 / Math.PI;
        segments.push({
          aLng: aLng, aLat: aLat, bLng: bLng, bLat: bLat,
          headingDeg: heading, layerId: (features[fi].layer && features[fi].layer.id) || null,
        });
        if (segments.length >= count) return segments;
      }
    }
    return segments;
  }

  // ── Polyline motion (0601W) ──────────────────────────────────────────────────

  function _haversineM(lat1, lng1, lat2, lng2) {
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Build a {lng,lat} polyline (4–12 pts) from a road feature, correcting
  // screen/tile coords. Returns null if too short or fully off-screen.
  function _polylineFromFeature(feature, map, w, h) {
    var coords = _featureLineCoords(feature);
    if (!coords || coords.length < 2) return null;
    var pts = [];
    for (var i = 0; i < coords.length; i++) {
      var c = coords[i];
      var lng, lat;
      if (_looksLikeLngLat(c)) { lng = c[0]; lat = c[1]; }
      else { var g; try { g = map.unproject([c[0], c[1]]); } catch (e) { continue; } if (!g) continue; lng = g.lng; lat = g.lat; }
      pts.push({ lng: lng, lat: lat });
    }
    if (pts.length < 2) return null;
    // Cap to 12 points (downsample evenly if longer).
    if (pts.length > 12) {
      var capped = [], step = (pts.length - 1) / 11;
      for (var k = 0; k < 12; k++) capped.push(pts[Math.round(k * step)]);
      pts = capped;
    }
    // Require at least one vertex within ~200px of the viewport.
    var anyNear = false;
    for (var p = 0; p < pts.length; p++) {
      var pr; try { pr = map.project([pts[p].lng, pts[p].lat]); } catch (e) { continue; }
      var dx = pr.x < 0 ? -pr.x : (pr.x > w ? pr.x - w : 0);
      var dy = pr.y < 0 ? -pr.y : (pr.y > h ? pr.y - h : 0);
      if (Math.sqrt(dx * dx + dy * dy) <= 200) { anyNear = true; break; }
    }
    return anyNear ? pts : null;
  }

  // ── Road discipline (0601X) ──────────────────────────────────────────────────

  // Strict road-class layer test: accept real driving roads, reject paths/plazas.
  var ROAD_ACCEPT = /road|street|motorway|trunk|highway|primary|secondary|tertiary|ramp|link/i;
  var ROAD_REJECT = /path|pedestrian|plaza|footway|cycleway|track|steps|service|construction|rail|ferry|aeroway|crossing|sidewalk/i;
  function _isRoadLayerStrict(layerId) {
    if (!layerId) return false;
    if (ROAD_REJECT.test(layerId)) return false;
    return ROAD_ACCEPT.test(layerId);
  }

  // Road class from layer id, and per-class actor cap (0601Y).
  function _roadClass(layerId) {
    if (!layerId) return 'local';
    if (/motorway|trunk|ramp|link|highway/i.test(layerId)) return 'major';
    if (/primary|secondary|tertiary/i.test(layerId)) return 'medium';
    return 'local';
  }
  var ROAD_CLASS_CAP = { major: 6, medium: 4, local: 2 };
  var CELL_PX = 120;   // screen-cell size for spatial spread

  // ── Hero forward safety corridor (0602J) ──────────────────────────────────────
  // The hero owns the forward lane. Traffic may surround/pass/oppose the hero but
  // must not occupy the protected corridor directly ahead in the same direction.
  // This is a debug-runtime safety rule — NOT collision/braking/lane intelligence.
  var HERO_CORRIDOR_FORWARD_M    = 60;   // protected distance ahead of hero
  var HERO_CORRIDOR_BACK_M       = 8;    // small protected zone behind hero
  var HERO_CORRIDOR_HALF_WIDTH_M = 8;    // lateral half-width of the lane
  var HERO_DIRECTION_REJECT_DEG  = 45;   // ≤ this from hero heading = "same direction"

  // Smallest absolute angular difference between two compass headings, 0–180°.
  function _angleDiffDeg(a, b) {
    return Math.abs((((a - b) % 360) + 540) % 360 - 180);
  }

  // Hero context for traffic decisions. Reads the live runtime entity; if no active
  // hero, falls back to map center (heading 0) and reports active:false.
  function _getHeroTrafficContext() {
    var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
    try {
      if (hrt && typeof hrt.getEntity === 'function') {
        var e = hrt.getEntity();
        if (e && e.active && e.lat != null) {
          return { active: true, lat: e.lat, lng: e.lng, headingDeg: e.headingDeg || 0 };
        }
      }
    } catch (err) {}
    var c = _mapCenter();
    return { active: false, lat: c ? c.lat : 0, lng: c ? c.lng : 0, headingDeg: 0 };
  }

  // Local metre-space projection of a point relative to the hero's heading frame.
  // forwardM > 0 ahead, < 0 behind; lateralM is right-positive side offset.
  function _projectRelativeToHero(hero, point) {
    var mPerDegLat = 111320;
    var mPerDegLng = 111320 * Math.cos((hero.lat || 0) * Math.PI / 180);
    var dN = (point.lat - hero.lat) * mPerDegLat;   // north metres
    var dE = (point.lng - hero.lng) * mPerDegLng;   // east metres
    var h  = (hero.headingDeg || 0) * Math.PI / 180;
    var forwardM = dN * Math.cos(h) + dE * Math.sin(h);
    var lateralM = -dN * Math.sin(h) + dE * Math.cos(h);
    var distanceM = Math.sqrt(dN * dN + dE * dE);
    var bearingDeg = ((Math.atan2(dE, dN) * 180 / Math.PI) + 360) % 360;
    var relativeHeadingDeg = point.headingDeg != null
      ? _angleDiffDeg(hero.headingDeg || 0, point.headingDeg) : null;
    return { forwardM: forwardM, lateralM: lateralM, distanceM: distanceM,
             bearingDeg: bearingDeg, relativeHeadingDeg: relativeHeadingDeg };
  }

  // True if an actor at actorPoint travelling actorHeadingDeg sits inside the
  // protected hero forward corridor AND moves the same direction as the hero.
  function _isInsideHeroForwardCorridor(hero, actorPoint, actorHeadingDeg) {
    if (!hero || !hero.active) return false;
    var rel = _projectRelativeToHero(hero, actorPoint);
    var sameDirection = _angleDiffDeg(hero.headingDeg || 0, actorHeadingDeg) <= HERO_DIRECTION_REJECT_DEG;
    return rel.forwardM >= -HERO_CORRIDOR_BACK_M &&
           rel.forwardM <= HERO_CORRIDOR_FORWARD_M &&
           Math.abs(rel.lateralM) <= HERO_CORRIDOR_HALF_WIDTH_M &&
           sameDirection;
  }

  // Screen cell key for a polyline's midpoint (spatial-spread bucketing).
  function _lineCell(map, line) {
    var mid = line.pts[Math.floor(line.pts.length / 2)];
    var pt; try { pt = map.project([mid.lng, mid.lat]); } catch (e) { return '0_0'; }
    return Math.floor(pt.x / CELL_PX) + '_' + Math.floor(pt.y / CELL_PX);
  }

  // True if the screen point under [lng,lat] hits a building / fill-extrusion layer.
  function _pointOnBuilding(map, lng, lat) {
    var pt; try { pt = map.project([lng, lat]); } catch (e) { return false; }
    var feats; try { feats = map.queryRenderedFeatures([pt.x, pt.y]); } catch (e) { return false; }
    for (var i = 0; i < (feats || []).length; i++) {
      var f = feats[i];
      var lid = (f.layer && f.layer.id) || '';
      var ltype = (f.layer && f.layer.type) || '';
      if (ltype === 'fill-extrusion' || /building/i.test(lid)) return true;
    }
    return false;
  }

  function _sampleRoadPolylines(count) {
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) return [];
    var canvas = map.getCanvas();
    var w = canvas ? canvas.clientWidth : 0, h = canvas ? canvas.clientHeight : 0;
    var features = _queryRoadFeaturesNearCenter(120);
    var lines = [];
    for (var i = 0; i < features.length && lines.length < count; i++) {
      var pl = _polylineFromFeature(features[i], map, w, h);
      if (pl) lines.push({ pts: pl, layerId: (features[i].layer && features[i].layer.id) || null });
    }
    return lines;
  }

  // ── Path quality (0601Z-C) ───────────────────────────────────────────────────
  // Reject polylines that are too short, building-contaminated, tiny loops, or
  // too short on screen. Returns { accept, reason, lengthM, screenLenPx, buildingRatio, isLoop }.
  function _polylineLengthM(pts) {
    var L = 0;
    for (var i = 0; i < pts.length - 1; i++) L += _haversineM(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
    return L;
  }
  function _polylineScreenLenPx(map, pts) {
    var L = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var a, b; try { a = map.project([pts[i].lng, pts[i].lat]); b = map.project([pts[i + 1].lng, pts[i + 1].lat]); } catch (e) { continue; }
      L += Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y));
    }
    return L;
  }
  function _polylineBuildingRatio(map, pts) {
    if (!pts.length) return 1;
    var hits = 0;
    for (var i = 0; i < pts.length; i++) if (_pointOnBuilding(map, pts[i].lng, pts[i].lat)) hits++;
    return hits / pts.length;
  }
  function _polylineIsLoop(map, pts) {
    if (pts.length < 3) return false;
    var endM = _haversineM(pts[0].lat, pts[0].lng, pts[pts.length - 1].lat, pts[pts.length - 1].lng);
    var total = _polylineLengthM(pts);
    // tiny closed loop: endpoints near each other relative to a short total
    return total > 0 && endM < 15 && total < 120;
  }
  function _evalPolylineQuality(map, line) {
    var pts = line.pts;
    var lengthM = _polylineLengthM(pts);
    var screenLenPx = _polylineScreenLenPx(map, pts);
    var buildingRatio = _polylineBuildingRatio(map, pts);
    var isLoop = _polylineIsLoop(map, pts);
    var isRamp = /ramp|link/i.test(line.layerId || '');
    var minLen = isRamp ? 120 : 80;
    var reason = null;
    if (lengthM < minLen)       reason = 'too_short';
    else if (buildingRatio > 0.25) reason = 'building_contaminated';
    else if (isLoop)            reason = 'tiny_loop';
    else if (screenLenPx < 120) reason = 'screen_too_short';
    return { accept: !reason, reason: reason, lengthM: lengthM, screenLenPx: screenLenPx,
             buildingRatio: buildingRatio, isLoop: isLoop };
  }
  // Quality-filtered, length-sorted polylines + audit stats.
  function _sampleQualityRoadPolylines(count) {
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) return { lines: [], audit: null };
    var raw = _sampleRoadPolylines(160).filter(function (l) { return _isRoadLayerStrict(l.layerId); });
    var audit = { found: raw.length, tooShort: 0, buildingContaminated: 0, loop: 0, screenShort: 0,
                  accepted: 0, totalLenM: 0, longestM: 0 };
    var lines = [];
    raw.forEach(function (l) {
      var q = _evalPolylineQuality(map, l);
      if (!q.accept) {
        if (q.reason === 'too_short') audit.tooShort++;
        else if (q.reason === 'building_contaminated') audit.buildingContaminated++;
        else if (q.reason === 'tiny_loop') audit.loop++;
        else if (q.reason === 'screen_too_short') audit.screenShort++;
        return;
      }
      l.lengthM = q.lengthM;
      audit.accepted++; audit.totalLenM += q.lengthM;
      if (q.lengthM > audit.longestM) audit.longestM = q.lengthM;
      lines.push(l);
    });
    audit.avgLenM = audit.accepted ? Math.round(audit.totalLenM / audit.accepted) : 0;
    audit.longestM = Math.round(audit.longestM);
    // Prefer longer visible roads.
    lines.sort(function (a, b) { return b.lengthM - a.lengthM; });
    _lastPathAudit = audit;
    return { lines: lines.slice(0, count), audit: audit };
  }
  var _lastPathAudit = null;

  // Cumulative segment distances (metres) for a polyline.
  function _polylineSegs(pts) {
    var segs = [], total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var d = _haversineM(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
      segs.push({ start: total, len: d }); total += d;
    }
    return { segs: segs, total: total };
  }

  // Interpolate a position + heading at distance distM along the polyline.
  function _interpPolyline(pts, meta, distM) {
    var total = meta.total;
    if (total <= 0) return { lng: pts[0].lng, lat: pts[0].lat, headingDeg: 0 };
    distM = Math.max(0, Math.min(total, distM));
    var segs = meta.segs;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (distM <= s.start + s.len || i === segs.length - 1) {
        var f = s.len > 0 ? (distM - s.start) / s.len : 0;
        var a = pts[i], b = pts[i + 1];
        var lng = a.lng + (b.lng - a.lng) * f;
        var lat = a.lat + (b.lat - a.lat) * f;
        var heading = Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI;
        return { lng: lng, lat: lat, headingDeg: heading };
      }
    }
    var last = pts[pts.length - 1];
    return { lng: last.lng, lat: last.lat, headingDeg: 0 };
  }

  // Motion showcase RAF state
  var _motionRaf    = null;
  var _motionActors = [];
  var _motionLastMs = 0;

  // 0602J — opposing-flow runtime safety state
  var _opposingFlowActive   = false;   // when true, the motion tick enforces the corridor
  var _removedDuringRuntime = 0;       // actors despawned for entering the hero corridor

  // ── Hero yield (0601Z-B) ─────────────────────────────────────────────────────
  // Lightweight anti-ghosting: slow/hold hero when a showcase actor is ahead.
  var _yieldRaf       = null;
  var _yieldBaseSpeed = null;
  var _yieldState     = 'clear';

  function _yieldStop() {
    if (_yieldRaf) { global.cancelAnimationFrame(_yieldRaf); _yieldRaf = null; }
    // restore hero base speed on stop
    var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
    if (hrt && typeof hrt.setSpeed === 'function' && _yieldBaseSpeed != null) {
      try { hrt.setSpeed(_yieldBaseSpeed); } catch (e) {}
    }
    _yieldState = 'clear';
  }

  // Bearing hero→actor; "ahead" if within ±60° of hero heading.
  function _bearingDeg(lat1, lng1, lat2, lng2) {
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
    var x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  function _yieldTick() {
    var wsl = _wsl();
    var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
    if (!wsl || !hrt || typeof hrt.getEntity !== 'function') { _yieldRaf = null; return; }
    _yieldRaf = global.requestAnimationFrame(_yieldTick);

    var hero = hrt.getEntity();
    if (!hero || !hero.active || hero.lat == null) return;
    if (_yieldBaseSpeed == null) _yieldBaseSpeed = hero.speedMult || 1;

    // Nearest showcase actor ahead of the hero.
    var st = wsl.getState();
    var nearestM = Infinity;
    (st.vehicles || []).forEach(function (v) {
      if (!v.id || v.id.indexOf('showcase_') !== 0 || v.lat == null) return;
      var d = _haversineM(hero.lat, hero.lng, v.lat, v.lng);
      if (d > 30) return;
      var brg = _bearingDeg(hero.lat, hero.lng, v.lat, v.lng);
      var rel = Math.abs(((brg - (hero.headingDeg || 0) + 540) % 360) - 180);
      if (rel <= 60 && d < nearestM) nearestM = d;   // ahead within ±60°
    });

    var next;
    if (nearestM < 10)      next = 'hold';
    else if (nearestM < 18) next = 'slow';
    else                    next = 'clear';
    if (next !== _yieldState && typeof hrt.setSpeed === 'function') {
      _yieldState = next;
      try {
        if (next === 'hold')      hrt.setSpeed(_yieldBaseSpeed * 0.02);
        else if (next === 'slow') hrt.setSpeed(_yieldBaseSpeed * 0.25);
        else                      hrt.setSpeed(_yieldBaseSpeed);
      } catch (e) {}
    }
  }

  function _motionStop() {
    if (_motionRaf) { global.cancelAnimationFrame(_motionRaf); _motionRaf = null; }
  }

  function _motionTick(nowMs) {
    var wsl = _wsl();
    if (!wsl || !_motionActors.length) { _motionRaf = null; return; }
    _motionRaf = global.requestAnimationFrame(_motionTick);

    var dt = _motionLastMs ? Math.min((nowMs - _motionLastMs) / 1000, 0.1) : 0.016;
    _motionLastMs = nowMs;

    // 0602J — resolve hero once per tick for the corridor safety filter.
    var heroCtx = _opposingFlowActive ? _getHeroTrafficContext() : null;

    for (var i = 0; i < _motionActors.length; i++) {
      var a = _motionActors[i];
      if (a.loop) {
        // Direction discipline: one-way flow, wrap at both ends. flowSign lets an
        // actor run the polyline in reverse (opposing flow) — defaults to +1.
        var fs = a.flowSign || 1;
        a.dist += fs * a.speedMs * dt;
        if (a.dist >= a.meta.total) a.dist -= a.meta.total;   // loop
        if (a.dist < 0) a.dist += a.meta.total;
      } else {
        // Ping-pong (beacon / debug).
        a.dist += a.direction * a.speedMs * dt;
        if (a.dist >= a.meta.total) { a.dist = a.meta.total; a.direction = -1; }
        else if (a.dist <= 0) { a.dist = 0; a.direction = 1; }
      }

      var pos = _interpPolyline(a.pts, a.meta, a.dist);
      var hdg;
      if (a.loop) hdg = (a.flowSign || 1) >= 0 ? pos.headingDeg : (pos.headingDeg + 180) % 360;
      else        hdg = a.direction >= 0 ? pos.headingDeg : (pos.headingDeg + 180) % 360;

      // Lane-ish offset: shift perpendicular to travel heading.
      var lat = pos.lat, lng = pos.lng;
      if (a.laneOffsetM) {
        var perp = (hdg + 90) * Math.PI / 180;
        var off = _offsetLatLng(lat, lng,
          a.laneOffsetM * Math.cos(perp), a.laneOffsetM * Math.sin(perp));
        lat = off.lat; lng = off.lng;
      }

      // 0602J — runtime safety: if an actor enters the hero forward corridor,
      // despawn it (hero stays authoritative; no slow/brake/collision).
      if (heroCtx && heroCtx.active &&
          _isInsideHeroForwardCorridor(heroCtx, { lat: lat, lng: lng }, hdg)) {
        if (typeof wsl.removeVehicle === 'function') wsl.removeVehicle(a.id);
        _motionActors.splice(i, 1); i--;
        _removedDuringRuntime++;
        continue;
      }

      wsl.upsertVehicle({
        id: a.id, actorType: a.actorType, variant: a.variant,
        lat: lat, lng: lng, headingDeg: hdg,
        scale: 1, visible: true, source: 'showcase-road',
      });
    }
  }

  // ── Debug object ──────────────────────────────────────────────────────────────

  var _debugObj = {

    state: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return null; }
      var s = wsl.getState();
      console.group('[worldVehicles] state()');
      console.log('active         :', s.active);
      console.log('enabled        :', s.enabled);
      console.log('threeAvailable :', s.threeAvailable);
      console.log('layerAdded     :', s.layerAdded, '| mounted:', s.layerMounted);
      console.log('vehicleCount   :', s.vehicleCount);
      console.log('instanceId     :', s.instanceId);
      console.log('renderReady    :', s.renderReady);
      console.log('transformMode  :', s.transformMode, '| valid:', s.transformValid, '| renders:', s.renderCount);
      console.log('renderPasses   :', s.renderPassCount || 0,
        '| earlyReturn:', s.renderEarlyReturnReason || '—');
      if (s.lastTransformError) console.warn('transformError :', s.lastTransformError);
      console.log('beaconActive   :', s.beaconActive);
      console.log('shapeMode      :', s.shapeMode);
      console.log('shapeScale     :', s.shapeScale);
      console.log('adaptiveLOD    :', s.adaptiveLOD);
      console.log('depthEnabled   :', s.depthEnabled, '| depth×' + s.depthMultiplier);
      if (s.lodCounts) {
        console.log('lodCounts      :', 'near:' + s.lodCounts.near, 'mid:' + s.lodCounts.mid,
          'far:' + s.lodCounts.far, 'tiny:' + s.lodCounts.tiny);
      }
      console.log('heroRuntime    :', s.heroRuntimeActive);
      console.log('trafficRuntime :', s.trafficRuntimeActive);
      console.log('regHealthy     :', s.registrationHealthy);
      if (s.heroRuntimeActive && !s.registrationHealthy) {
        console.warn('⚠ runtime active but registry unhealthy — run _wos.debug.worldVehicles.rebind()');
      }
      console.log('fallbackMode   :', s.fallbackMode);
      if (s.lastShapeBuild) {
        var d = s.lastShapeBuild.dimensionsMeters || {};
        console.log('lastShapeBuild :', s.lastShapeBuild.mode,
          '| ' + (d.w != null ? d.w + 'w×' + d.l + 'l×' + d.h + 'h m' : ''),
          '| ' + (s.lastShapeBuild.actorType || '') + '/' + (s.lastShapeBuild.variant || ''));
      }
      if (s.lastShapeBuildError) {
        console.warn('shapeBuildError:', s.lastShapeBuildError.mode, '—', s.lastShapeBuildError.message);
      }
      if (s.lastUpsertFailure) {
        console.warn('lastFailure    :', s.lastUpsertFailure.reason,
          s.lastUpsertFailure.payload ? '| id:' + s.lastUpsertFailure.payload.id + ' lat:' + s.lastUpsertFailure.payload.lat + ' lng:' + s.lastUpsertFailure.payload.lng : '');
      }
      if (s.lastUpsertSuccess) {
        console.log('lastSuccess    : id:' + s.lastUpsertSuccess.id + ' src:' + s.lastUpsertSuccess.source);
      }
      // Stall detection: hero success recorded but transforms not advancing
      if (s.lastTransformAt) {
        var sinceTransform = Date.now() - s.lastTransformAt;
        console.log('lastTransform  :', sinceTransform + 'ms ago',
          s.lastTransformPayload ? '| ' + s.lastTransformPayload.id + ' @ ' + s.lastTransformPayload.shapeMode : '');
        var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
        var heroActive = hrt && typeof hrt.getEntity === 'function' && hrt.getEntity().active;
        if (s.lastUpsertSuccess && s.lastUpsertSuccess.id === 'hero' &&
            heroActive && sinceTransform > 1000) {
          console.warn('⚠ [worldVehicles] hero transform STALLED — ' + sinceTransform +
            'ms since last _applyTransform while HeroVehicleRuntime is active.');
          console.warn('  Live motion authority is not reaching the mesh. Check HeroVehicleRenderer.update() RAF flow.');
        }
      }
      console.log('scale          :', s.scale);
      if (s.vehicles.length) {
        console.group('vehicles');
        s.vehicles.forEach(function (v) {
          console.log(v.id, '|', v.actorType + '/' + v.variant,
            '| src:', v.source,
            '| lat:', v.lat, 'lng:', v.lng,
            '| hdg:', v.headingDeg + '°',
            '| vis:', v.visible);
        });
        console.groupEnd();
      }
      console.groupEnd();
      return s;
    },

    enable: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (!wsl.isActive()) {
        var ok = wsl.start();
        if (!ok) { console.warn('[worldVehicles] could not start — check Three.js and map state'); return; }
      }
      wsl.setEnabled(true);
      console.log('[worldVehicles] enabled — DOM markers will be hidden when actors update');
    },

    disable: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      wsl.setEnabled(false);
      console.log('[worldVehicles] disabled — DOM marker fallback active');
    },

    clear: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      wsl.clear();
      console.log('[worldVehicles] cleared');
    },

    scale: function (n) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.setDebugScale !== 'function') { console.warn('[worldVehicles] setDebugScale unavailable'); return; }
      wsl.setDebugScale(n);
      console.log('[worldVehicles] debugScale →', n);
    },

    debug: function (on) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      wsl.setDebugMode(!!on);
      console.log('[worldVehicles] debugMode →', !!on);
    },

    // trace: enable/disable upsert tracing on both layer and renderer.
    // trace()       → print current trace state
    // trace(true)   → enable (logs each upsert, max 1/s)
    // trace(false)  → disable
    trace: function (on) {
      var wsl = _wsl();
      var hvr = global.SBE && global.SBE.HeroVehicleRenderer;

      if (on === undefined) {
        // Print current trace state
        var wts = wsl && typeof wsl.getUpsertTraceState === 'function'
          ? wsl.getUpsertTraceState() : null;
        var hts = hvr && typeof hvr.getWorldPayloadTraceState === 'function'
          ? hvr.getWorldPayloadTraceState() : null;

        console.group('[worldVehicles] trace()');
        if (wts) {
          console.log('WSL instanceId    :', wts.instanceId);
          console.log('WSL trace enabled :', wts.enabled);
          console.log('WSL renderReady   :', wts.renderReady);
          console.log('WSL vehicleCount  :', wts.vehicleCount);
          console.log('WSL lastFailure   :', wts.lastFailure
            ? wts.lastFailure.reason + ' | ' + JSON.stringify(wts.lastFailure.payload)
            : '—');
          console.log('WSL lastSuccess   :', wts.lastSuccess
            ? 'id:' + wts.lastSuccess.id + ' src:' + wts.lastSuccess.source
            : '—');
        } else {
          console.warn('WorldSpaceVehicleLayer not available');
        }
        if (hts) {
          console.log('HVR trace enabled :', hts.enabled);
          if (hts.lastPayload) {
            console.log('HVR wslInstanceId :', hts.lastPayload.wslInstanceId);
            console.log('HVR payload id    :', hts.lastPayload.payload && hts.lastPayload.payload.id);
            console.log('HVR payload lat   :', hts.lastPayload.payload && hts.lastPayload.payload.lat);
            console.log('HVR payload lng   :', hts.lastPayload.payload && hts.lastPayload.payload.lng);
          } else {
            console.log('HVR lastPayload   : —');
          }
        } else {
          console.warn('HeroVehicleRenderer not available');
        }
        console.groupEnd();
        return { wsl: wts, hvr: hts };
      }

      // Enable or disable both
      if (wsl && typeof wsl.setUpsertTraceEnabled === 'function') wsl.setUpsertTraceEnabled(on);
      if (hvr && typeof hvr.setWorldPayloadTraceEnabled === 'function') hvr.setWorldPayloadTraceEnabled(on);
      console.log('[worldVehicles] trace', on ? 'ENABLED' : 'DISABLED',
        '— logs throttled to 1/s; call trace() with no args to inspect state');
    },

    // visibilityMode: calibrate vehicle mesh scale/presence.
    //   'block'   → replace all vehicle meshes with 20m×10m×8m red box (MeshBasicMaterial)
    //               DOM hero marker stays visible for comparison
    //   'vehicle' → restore procedural vehicle meshes, hide DOM when world-space ready
    visibilityMode: function (m) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (m === undefined) {
        console.log('[worldVehicles] visibilityMode:', wsl.getVisibilityMode ? wsl.getVisibilityMode() : '—');
        return wsl.getVisibilityMode ? wsl.getVisibilityMode() : null;
      }
      if (typeof wsl.setVisibilityMode !== 'function') {
        console.warn('[worldVehicles] setVisibilityMode not available'); return;
      }
      wsl.setVisibilityMode(m);
      if (m === 'block') {
        console.log('[worldVehicles] block mode: 20m×10m×8m red box at hero position');
        console.log('  DOM hero marker stays visible — compare block position to DOM car');
        console.log('  When block confirms position, call visibilityMode(\'vehicle\') to restore');
      } else {
        console.log('[worldVehicles] vehicle mode: procedural mesh, DOM hides when world-space ready');
      }
    },

    // shapeMode: 0531M canonical calibration API. block|slab|wedge|vehicle.
    //   block   → 20×10×8m red tower (position proof)
    //   slab    → 4×8×1.2m flat red footprint (scale/road-seating proof)
    //   wedge   → directional primitive with nose cue (heading proof)
    //   vehicle → first usable 2.5D car (chassis/cabin/windshield/wheels/shadow)
    // DOM marker stays visible in block/slab/wedge; hides only in vehicle mode.
    shapeMode: function (m) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (m === undefined) {
        var cur = wsl.getShapeMode ? wsl.getShapeMode() : '—';
        console.log('[worldVehicles] shapeMode:', cur);
        return cur;
      }
      if (typeof wsl.setShapeMode !== 'function') {
        console.warn('[worldVehicles] setShapeMode not available'); return;
      }
      wsl.setShapeMode(m);
      var notes = {
        block:   '20×10×8m red tower — position proof. DOM marker stays visible.',
        slab:    '4×8×1.2m flat red footprint — scale + road-seating proof. DOM stays visible.',
        wedge:   'directional primitive w/ nose cue — heading proof. DOM stays visible.',
        vehicle: '2.5D car (chassis/cabin/windshield/wheels/shadow). DOM hides when render confirmed.',
      };
      console.log('[worldVehicles] shapeMode →', m, '—', notes[m] || '');
    },

    // rebind: re-register missing vehicles from live runtimes (session recovery)
    rebind: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.attemptSessionRebind !== 'function') {
        console.warn('[worldVehicles] attemptSessionRebind unavailable'); return null;
      }
      var r = wsl.attemptSessionRebind();
      console.group('[worldVehicles] rebind()');
      console.log('heroRecovered    :', r.heroRecovered);
      console.log('trafficRecovered :', r.trafficRecovered);
      console.log('vehiclesBefore   :', r.vehiclesBefore);
      console.log('vehiclesAfter    :', r.vehiclesAfter);
      console.groupEnd();
      return r;
    },

    // lod: adaptive LOD/scale authority toggle.
    //   no arg → print LOD state; true → enable; false → manual shapeScale
    lod: function (on) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (on === undefined) {
        var s = typeof wsl.getScaleState === 'function' ? wsl.getScaleState() : null;
        if (!s) { console.warn('[worldVehicles] scaleState unavailable'); return; }
        console.group('[worldVehicles] lod()');
        console.log('adaptiveLOD   :', s.adaptiveLOD);
        console.log('shapeScale    :', s.shapeScale);
        console.log('zoom          :', s.zoom);
        console.log('pitch         :', s.pitch);
        console.log('cameraProfile :', s.cameraProfile || '—');
        console.groupEnd();
        return s.adaptiveLOD;
      }
      if (typeof wsl.setAdaptiveLOD !== 'function') {
        console.warn('[worldVehicles] setAdaptiveLOD not available'); return;
      }
      var applied = wsl.setAdaptiveLOD(on);
      console.log('[worldVehicles] adaptiveLOD →', applied,
        applied ? '(zoom/type/profile scale active)' : '(manual shapeScale only)');
    },

    // depth: toggle depth-enhanced vehicle meshes.
    //   no arg → print depth status; true → enhanced; false → flatter legacy
    depth: function (on) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (on === undefined) {
        var s = typeof wsl.getDepthState === 'function' ? wsl.getDepthState() : null;
        if (!s) { console.warn('[worldVehicles] depthState unavailable'); return; }
        console.group('[worldVehicles] depth()');
        console.log('depthEnabled    :', s.depthEnabled);
        console.log('cameraProfile   :', s.cameraProfile || '—');
        console.log('depthMultiplier :', s.depthMultiplier);
        console.groupEnd();
        return s.depthEnabled;
      }
      if (typeof wsl.setDepthEnabled !== 'function') {
        console.warn('[worldVehicles] setDepthEnabled not available'); return;
      }
      var applied = wsl.setDepthEnabled(on);
      console.log('[worldVehicles] depthEnabled →', applied,
        applied ? '(raised 2.5D meshes)' : '(flatter legacy meshes)');
    },

    // depthState: per-vehicle depth + dimension report
    depthState: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getDepthState !== 'function') {
        console.warn('[worldVehicles] depthState unavailable'); return null;
      }
      var s = wsl.getDepthState();
      console.group('[worldVehicles] depthState() — depth:' + s.depthEnabled +
        ' profile:' + (s.cameraProfile || '—') + ' ×' + s.depthMultiplier);
      s.vehicles.forEach(function (v) {
        var dm = v.dimensions || {};
        console.log(v.id, '|', (v.actorType || '?') + '/' + (v.variant || '?'),
          '| lod:', v.lodTier,
          '| profile:', v.meshProfile,
          '| depth×' + v.depthMultiplier,
          '| final×' + v.finalScale,
          '| dims:', JSON.stringify(dm));
      });
      if (!s.vehicles.length) console.warn('[worldVehicles] no vehicles to report');
      console.groupEnd();
      return s;
    },

    // ── 3D primitive proof (0601G) ──────────────────────────────────────────────

    // primitive3d: toggle deliberately chunky 3D proof meshes (car + truck).
    //   true → primitive proof; false → normal vehicle mode; no arg → status.
    primitive3d: function (on) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return { ok: false, reason: 'world_layer_not_ready' }; }
      if (on === undefined) {
        var cur = typeof wsl.getPrimitive3d === 'function' ? wsl.getPrimitive3d() : null;
        console.log('[worldVehicles] primitive3d:', cur,
          '| forceNear:', typeof wsl.getPrimitive3dForceNear === 'function' ? wsl.getPrimitive3dForceNear() : '—');
        return cur;
      }
      if (typeof wsl.setPrimitive3d !== 'function') {
        console.warn('[worldVehicles] setPrimitive3d unavailable'); return { ok: false, reason: 'world_layer_not_ready' };
      }
      var applied = wsl.setPrimitive3d(on);
      console.log('[worldVehicles] primitive3d →', applied,
        applied ? '(chunky 3D proof meshes; shapeMode unaffected)' : '(normal vehicle mode)');
      return applied;
    },

    primitive3dForceNear: function (on) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.setPrimitive3dForceNear !== 'function') {
        console.warn('[worldVehicles] primitive3dForceNear unavailable'); return;
      }
      if (on === undefined) {
        var cur = wsl.getPrimitive3dForceNear();
        console.log('[worldVehicles] primitive3dForceNear:', cur);
        return cur;
      }
      var applied = wsl.setPrimitive3dForceNear(on);
      console.log('[worldVehicles] primitive3dForceNear →', applied);
      return applied;
    },

    // testPrimitive3D: place a primitive car + truck at/near map center (no Drive)
    testPrimitive3D: function () {
      var wsl = _wsl();
      if (!global.THREE) { console.warn('[worldVehicles] three_not_available'); return { ok: false, reason: 'three_not_available' }; }
      if (!wsl) { console.warn('[worldVehicles] world_layer_not_ready'); return { ok: false, reason: 'world_layer_not_ready' }; }
      if (!wsl.isActive()) wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);
      if (!wsl.isRenderReady()) { console.warn('[worldVehicles] world_layer_not_ready'); return { ok: false, reason: 'world_layer_not_ready' }; }
      if (typeof wsl.setPrimitive3d === 'function') wsl.setPrimitive3d(true);

      var c = _mapCenter();
      if (!c) { console.warn('[worldVehicles] map center unavailable'); return { ok: false, reason: 'map_unavailable' }; }

      var carId = 'primitive3d_car_test', truckId = 'primitive3d_truck_test';
      var carOK = wsl.upsertVehicle({
        id: carId, actorType: 'hero_car', variant: 'sedan_red',
        lat: c.lat, lng: c.lng, headingDeg: 0, scale: 1, visible: true, source: 'test',
      });
      var tp = _offsetLatLng(c.lat, c.lng, 0, 25);   // 25m east
      var truckOK = wsl.upsertVehicle({
        id: truckId, actorType: 'box_truck', variant: 'clean_white',
        lat: tp.lat, lng: tp.lng, headingDeg: 0, scale: 1, visible: true, source: 'test',
      });
      var result = { added: !!(carOK && truckOK), carId: carId, truckId: truckId, primitive3d: true };
      console.log('[worldVehicles] testPrimitive3D —', JSON.stringify(result));
      return result;
    },

    clearPrimitive3D: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (typeof wsl.removeVehicle === 'function') {
        wsl.removeVehicle('primitive3d_car_test');
        wsl.removeVehicle('primitive3d_truck_test');
      }
      console.log('[worldVehicles] clearPrimitive3D — test primitives removed');
    },

    primitiveState: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getPrimitiveState !== 'function') {
        console.warn('[worldVehicles] primitiveState unavailable'); return null;
      }
      var s = wsl.getPrimitiveState();
      console.group('[worldVehicles] primitiveState()');
      console.log('primitive3dEnabled :', s.primitive3dEnabled, '| forceNear:', s.forceNear);
      console.log('vehicleCount       :', s.vehicleCount);
      console.log('primitiveCount     :', s.primitiveCount,
        '(car:' + s.carPrimitiveCount + ' truck:' + s.truckPrimitiveCount + ')');
      if (s.lastPrimitiveBuild) console.log('lastBuild          :', s.lastPrimitiveBuild.kind, '@', new Date(s.lastPrimitiveBuild.timestamp).toLocaleTimeString());
      if (s.lastPrimitiveError) console.warn('lastError          :', s.lastPrimitiveError.message);
      console.groupEnd();
      return s;
    },

    // ── Transform migration (0601J) ─────────────────────────────────────────────

    // transformMode: switch WSL world transform path.
    //   'modelMatrix' (default) — canonical Mapbox path; 'vehicleMatrix' — legacy.
    transformMode: function (m) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (m === undefined) {
        var cur = typeof wsl.getTransformMode === 'function' ? wsl.getTransformMode() : null;
        console.log('[worldVehicles] transformMode:', cur);
        return cur;
      }
      if (typeof wsl.setTransformMode !== 'function') {
        console.warn('[worldVehicles] setTransformMode unavailable'); return;
      }
      var applied = wsl.setTransformMode(m);
      console.log('[worldVehicles] transformMode →', applied,
        applied === 'modelMatrix' ? '(canonical Mapbox model-matrix path)' : '(legacy mesh-position path)');
      return applied;
    },

    // hardRemount: force removeLayer → reset → addLayer → repaint (0601N recovery)
    hardRemount: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.hardRemountLayer !== 'function') {
        console.warn('[worldVehicles] hardRemount unavailable'); return false;
      }
      var ok = wsl.hardRemountLayer();
      console.log('[worldVehicles] hardRemount() →', ok);
      return ok;
    },

    // renderPassState: proves whether Mapbox is invoking the render callback,
    // and which early-return (if any) stops render work. (0601L)
    renderPassState: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getRenderPassState !== 'function') {
        console.warn('[worldVehicles] renderPassState unavailable'); return null;
      }
      var s = wsl.getRenderPassState();
      console.group('[worldVehicles] renderPassState()');
      console.log('layerAdded             :', s.layerAdded, '| mounted:', s.layerMounted);
      if (s.lastHardRemountReason) console.log('lastHardRemount        :', s.lastHardRemountResult, '(' + s.lastHardRemountReason + ')',
        s.lastHardRemountAt ? '@ ' + new Date(s.lastHardRemountAt).toLocaleTimeString() : '');
      console.log('styledataCount         :', s.styledataCount,
        '| remountsScheduled:', s.styleRemountScheduled, '| remountsExecuted:', s.styleRemountExecuted);
      console.log('renderPassCount         :', s.renderPassCount);
      console.log('lastRenderPassAt        :', s.lastRenderPassAt ? new Date(s.lastRenderPassAt).toLocaleTimeString() : '—');
      console.log('renderCount             :', s.renderCount);
      console.log('lastRenderAt            :', s.lastRenderAt ? new Date(s.lastRenderAt).toLocaleTimeString() : '—');
      console.log('renderEarlyReturnReason :', s.renderEarlyReturnReason || '—');
      console.log('meshCount               :', s.meshCount);
      console.log('sceneCount              :', s.sceneCount);
      console.log('lastRenderObjectCount   :', s.lastRenderObjectCount);
      console.log('lastRenderSkippedCount  :', s.lastRenderSkippedCount);
      console.log('lastRenderedVehicleId   :', s.lastRenderedVehicleId || '—');
      if (s.lastRenderAuditSnapshot) console.log('auditSnapshot           :', s.lastRenderAuditSnapshot);
      // Decision-table hint
      var hint;
      if (s.renderPassCount === 0 && s.layerMounted === false) hint = 'Case 1: custom layer NOT mounted in Mapbox — re-mount needed (style reload dropped it)';
      else if (s.renderPassCount === 0 && s.layerMounted === true) hint = 'Case 2: layer mounted but render() not firing — check layer type/renderingMode/live map ref';
      else if (s.renderCount === 0 && s.renderEarlyReturnReason) hint = 'Case 3: render() fires but exits early → fix "' + s.renderEarlyReturnReason + '"';
      else if (s.renderCount > 0 && s.lastRenderObjectCount === 0 && s.lastRenderSkippedCount > 0) hint = 'Case 3: every mesh skipped — audit mesh.visible / scene attachment';
      else if (s.renderCount > 0 && s.lastRenderObjectCount > 0) hint = 'Case 4/5: meshes rendered — check renderTruth() rendered/projected';
      else hint = 'no objects yet — spawn a test cube';
      console.log('→', hint);
      console.groupEnd();
      return s;
    },

    // 0602C — enable/disable forensic truth.
    enableAudit: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getEnableAudit !== 'function') { console.warn('[worldVehicles] enableAudit unavailable'); return null; }
      var s = wsl.getEnableAudit();
      console.group('[worldVehicles] enableAudit');
      console.log('active          :', s.active);
      console.log('enabled         :', s.enabled);
      console.log('layerAdded      :', s.layerAdded);
      console.log('mounted         :', s.layerMounted);
      console.log('renderReady     :', s.renderReady);
      console.log('vehicleCount    :', s.vehicleCount);
      console.log('meshCount       :', s.meshCount);
      console.log('sceneCount      :', s.sceneCount);
      console.log('heroRuntime     :', s.heroRuntimeDetected);
      console.log('trafficRuntime  :', s.trafficRuntimeDetected);
      console.log('renderPasses    :', s.renderPassCount);
      console.log('renderCount     :', s.renderCount);
      console.log('earlyReturns    :', s.earlyReturnCount);
      console.log('lastEarlyReturn :', s.lastEarlyReturnReason, s.lastEarlyReturnAt ? new Date(s.lastEarlyReturnAt).toLocaleTimeString() : '-');
      console.groupEnd();
      return s;
    },

    enableHistory: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getEnableHistory !== 'function') { console.warn('[worldVehicles] enableHistory unavailable'); return null; }
      var s = wsl.getEnableHistory();
      console.group('[worldVehicles] enableHistory');
      console.log('enableCount      :', s.enableCount);
      console.log('disableCount     :', s.disableCount);
      console.log('lastEnableTime   :', s.lastEnableTime ? new Date(s.lastEnableTime).toLocaleTimeString() : '-');
      console.log('lastDisableTime  :', s.lastDisableTime ? new Date(s.lastDisableTime).toLocaleTimeString() : '-');
      console.log('lastEnableCaller :\n' + (s.lastEnableCaller || '(none)'));
      console.log('lastDisableCaller:\n' + (s.lastDisableCaller || '(none)'));
      console.groupEnd();
      return s;
    },

    renderAudit: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getRenderAudit !== 'function') { console.warn('[worldVehicles] renderAudit unavailable'); return null; }
      var s = wsl.getRenderAudit();
      console.group('[worldVehicles] renderAudit');
      console.log('renderPassCount        :', s.renderPassCount);
      console.log('renderCount            :', s.renderCount);
      console.log('earlyReturnCount       :', s.earlyReturnCount);
      console.log('lastEarlyReturnReason  :', s.lastEarlyReturnReason || '-');
      console.log('lastEarlyReturnAt      :', s.lastEarlyReturnAt ? new Date(s.lastEarlyReturnAt).toLocaleTimeString() : '-');
      console.log('lastRenderPassAt       :', s.lastRenderPassAt ? new Date(s.lastRenderPassAt).toLocaleTimeString() : '-');
      console.log('lastRenderAt           :', s.lastRenderAt ? new Date(s.lastRenderAt).toLocaleTimeString() : '-');
      console.log('lastRenderObjectCount  :', s.lastRenderObjectCount);
      console.log('lastRenderSkippedCount :', s.lastRenderSkippedCount);
      console.groupEnd();
      return s;
    },

    transformState: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getTransformState !== 'function') {
        console.warn('[worldVehicles] transformState unavailable'); return null;
      }
      var s = wsl.getTransformState();
      console.group('[worldVehicles] transformState() — mode:' + s.mode);
      console.log('vehicleCount       :', s.vehicleCount);
      console.log('modelMatrixCount   :', s.modelMatrixCount, '| vehicleMatrixCount:', s.vehicleMatrixCount);
      console.log('renderCount        :', s.renderCount, '| lastRenderAt:', s.lastRenderAt ? new Date(s.lastRenderAt).toLocaleTimeString() : '—');
      if (s.lastTransformError) console.warn('lastTransformError :', s.lastTransformError);
      console.groupEnd();
      return s;
    },

    // transformCompare: add one modelMatrix cube + one vehicleMatrix cube nearby,
    // report which path renders. Recommendation drives the production default.
    transformCompare: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return { recommendation: 'neither_valid' }; }
      if (!wsl.isActive()) wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);
      var c = _mapCenter();
      if (!c) { console.warn('[worldVehicles] map center unavailable'); return { recommendation: 'neither_valid' }; }

      // Clean prior comparison objects
      wsl.removeVehicle('transformcmp_model');
      wsl.removeVehicle('transformcmp_vehicle');

      var startMode = wsl.getTransformMode();

      // modelMatrix cube — a primitive car via the model path
      wsl.setTransformMode('modelMatrix');
      var mOK = wsl.upsertVehicle({
        id: 'transformcmp_model', actorType: 'hero_car', variant: 'sedan_red',
        lat: c.lat, lng: c.lng, headingDeg: 0, scale: 1, visible: true, source: 'test',
      });

      // vehicleMatrix cube — offset 40m east, legacy path
      var ep = _offsetLatLng(c.lat, c.lng, 0, 40);
      wsl.setTransformMode('vehicleMatrix');
      var vOK = wsl.upsertVehicle({
        id: 'transformcmp_vehicle', actorType: 'hero_car', variant: 'sedan_dark',
        lat: ep.lat, lng: ep.lng, headingDeg: 0, scale: 1, visible: true, source: 'test',
      });

      // Restore production default (modelMatrix)
      wsl.setTransformMode(startMode === 'vehicleMatrix' ? 'vehicleMatrix' : 'modelMatrix');

      // 0601K — separate transformed / rendered / projected / confidence.
      // Render happens on the next Mapbox RAF frame, so we evaluate truth twice:
      // an immediate snapshot, then an authoritative deferred read after frames.
      function _truth(id) {
        var st = wsl.getState();
        var row = null;
        st.vehicles.forEach(function (x) { if (x.id === id) row = x; });
        return row || { transformed: false, rendered: false, projectedOnScreen: false, visibilityConfidence: 'none' };
      }
      function _recommend(mt, vt) {
        var mRP = mt.rendered || mt.projectedOnScreen;
        var vRP = vt.rendered || vt.projectedOnScreen;
        if (mRP && vRP) return 'both_valid';
        if (mRP && !vRP) return 'use_modelMatrix';
        if (vRP && !mRP) return 'use_vehicleMatrix';
        if (mt.transformed || vt.transformed) return 'render_unproven';
        return 'neither_valid';
      }
      function _build(label, deferred) {
        var mt = _truth('transformcmp_model'), vt = _truth('transformcmp_vehicle');
        var rec = _recommend(mt, vt);
        var out = {
          modelMatrixAdded: !!mOK, vehicleMatrixAdded: !!vOK,
          modelMatrixTransformed: mt.transformed, vehicleMatrixTransformed: vt.transformed,
          modelMatrixRendered: mt.rendered, vehicleMatrixRendered: vt.rendered,
          modelMatrixProjectedOnScreen: mt.projectedOnScreen, vehicleMatrixProjectedOnScreen: vt.projectedOnScreen,
          modelMatrixVisibilityConfidence: mt.visibilityConfidence, vehicleMatrixVisibilityConfidence: vt.visibilityConfidence,
          // Deprecated aliases map to RENDER truth, never lastTransformAt
          modelMatrixVisibleDeprecated: mt.rendered, vehicleMatrixVisibleDeprecated: vt.rendered,
          recommendation: rec,
        };
        console.group('[worldVehicles] transformCompare() ' + label + ' → ' + rec);
        console.log('⚠ transformed does not mean visible.');
        console.log('model  : transformed=' + mt.transformed, 'rendered=' + mt.rendered,
          'projected=' + mt.projectedOnScreen, 'confidence=' + mt.visibilityConfidence);
        console.log('vehicle: transformed=' + vt.transformed, 'rendered=' + vt.rendered,
          'projected=' + vt.projectedOnScreen, 'confidence=' + vt.visibilityConfidence);
        if (rec === 'render_unproven') console.warn('  transform succeeded but render NOT proven — wait a frame / check viewport');
        if (rec === 'neither_valid') console.warn('  ✗ neither transformed — return to 0601I threeProof harness');
        console.groupEnd();
        return out;
      }

      // Authoritative read after a few frames have rendered.
      global.setTimeout(function () { _build('(settled)', true); }, 300);
      return _build('(immediate)', false);
    },

    // renderTruth: per-object transformed/rendered/projected/confidence (no false "visible")
    // ── Traffic + camera showcase (0601Q) ───────────────────────────────────────
    // Visual proof of multiple world-space actors. Not a simulator — a controlled
    // demo. Uses existing upsertVehicle/removeVehicle/setCameraPreset only.

    trafficShowcase: function (count) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return null; }
      count = count || 24;

      if (!wsl.isActive())  wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);

      // Anchor on live hero if active, else map center.
      var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
      var ent = hrt && typeof hrt.getEntity === 'function' ? hrt.getEntity() : null;
      var anchor = (ent && ent.active && ent.lat != null) ? { lat: ent.lat, lng: ent.lng } : _mapCenter();
      if (!anchor) { console.warn('[worldVehicles] no map center / hero anchor'); return null; }

      // Mixed variants → actorType. Trucks read larger.
      var SPECS = [
        { variant: 'sedan_red',             actorType: 'traffic_car' },
        { variant: 'sedan_dark',            actorType: 'traffic_car' },
        { variant: 'sedan_light',           actorType: 'traffic_car' },
        { variant: 'taxi_yellow',           actorType: 'traffic_car' },
        { variant: 'clean_white',           actorType: 'box_truck'   },
        { variant: 'sticker_graffiti_test', actorType: 'box_truck'   },
      ];

      // 0601R/S — road-bound placement first; deterministic grid only as fallback.
      var roadFeatureCount = _queryRoadFeaturesNearCenter(120).length;
      var fallbackUsed = false;
      var points = _sampleRoadTrafficPoints(count);
      var skippedOffscreen = points.skippedOffscreen || 0;
      if (!points.length) {
        console.warn('[worldVehicles] no road features in view (or all offscreen) — falling back to grid showcase');
        points = _gridTrafficPoints(anchor, count);
        fallbackUsed = true;
      }

      var sampledLayers = [];
      var screenSamples = [];
      var added = 0;
      for (var i = 0; i < points.length && i < count; i++) {
        var pt = points[i];
        if (pt.layerId && sampledLayers.indexOf(pt.layerId) === -1) sampledLayers.push(pt.layerId);
        if (pt.screen && screenSamples.length < 5) screenSamples.push('(' + pt.screen.x + ',' + pt.screen.y + ')');
        var spec = SPECS[i % SPECS.length];
        var id = 'showcase_car_' + ('00' + (i + 1)).slice(-3);
        var ok = wsl.upsertVehicle({
          id: id, actorType: spec.actorType, variant: spec.variant,
          lat: pt.lat, lng: pt.lng, headingDeg: pt.headingDeg,
          scale: 1, visible: true, source: fallbackUsed ? 'showcase' : 'showcase-road',
        });
        if (ok) added++;
      }

      // D — traffic debug report
      console.group('[worldVehicles] trafficShowcase report');
      console.log('roadFeaturesFound  :', roadFeatureCount);
      console.log('sampledPoints      :', fallbackUsed ? 0 : points.length, '| skippedOffscreen:', skippedOffscreen);
      console.log('pointsInViewport   :', points.length);
      console.log('vehiclesAdded      :', added, '/', count);
      console.log('fallbackUsed       :', fallbackUsed);
      console.log('anchor             :', ent && ent.active ? 'live hero' : 'map center');
      console.log('sampledLayers      :', sampledLayers.slice(0, 5));
      console.log('firstScreenSamples :', screenSamples.length ? screenSamples.join(' ') : '(grid — no screen samples)');
      console.groupEnd();

      // E — auto render-truth after a render frame settles
      global.setTimeout(function () {
        if (typeof _debugObj.renderPassState === 'function') _debugObj.renderPassState();
        if (typeof _debugObj.renderTruth     === 'function') _debugObj.renderTruth();
        if (typeof _debugObj.scaleState      === 'function') _debugObj.scaleState();
      }, 1000);

      return { added: added, requested: count, sampled: points.length,
               fallbackUsed: fallbackUsed, layers: sampledLayers };
    },

    clearTrafficShowcase: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      var st = wsl.getState();
      var removed = 0;
      (st.vehicles || []).forEach(function (v) {
        if (v.id && v.id.indexOf('showcase_') === 0) {
          wsl.removeVehicle(v.id); removed++;
        }
      });
      console.log('[worldVehicles] clearTrafficShowcase —', removed, 'showcase actors removed (hero preserved)');
      return removed;
    },

    // cameraShowcase: cycle existing hero camera presets (no new camera system)
    cameraShowcase: function (opts) {
      opts = opts || {};
      var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
      if (!hrt || typeof hrt.setCameraPreset !== 'function') {
        console.warn('[worldVehicles] cameraShowcase: HeroVehicleRuntime.setCameraPreset unavailable');
        return false;
      }
      var presets = ['follow', 'lead', 'side', 'high'];
      var dwellMs = opts.dwellMs || 2200;
      console.log('[worldVehicles] cameraShowcase — cycling:', presets.join(' → '),
        '(' + dwellMs + 'ms each)');
      presets.forEach(function (p, i) {
        global.setTimeout(function () {
          hrt.setCameraPreset(p);
          console.log('[worldVehicles] camera →', p);
        }, i * dwellMs);
      });
      // Restore 'follow' at the end
      global.setTimeout(function () { hrt.setCameraPreset('follow'); }, presets.length * dwellMs);
      return true;
    },

    // showcase: combined demo — hero + traffic + camera cycle
    showcase: function (count) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      wsl.setEnabled(true);

      var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
      var ent = hrt && typeof hrt.getEntity === 'function' ? hrt.getEntity() : null;
      var heroActive = !!(ent && ent.active);

      if (typeof _debugObj.liveHero === 'function') _debugObj.liveHero();
      if (!heroActive) {
        console.log('[worldVehicles] hero not active — traffic showcase placed at map center');
      }

      _debugObj.trafficShowcase(count || 24);
      _debugObj.cameraShowcase();
      return { heroActive: heroActive };
    },

    // ── Actor visibility stability (0601T) ──────────────────────────────────────

    // 0601Z-A — hero always-on draw (never occluded / culled / hidden).
    heroAlwaysOn: function (on) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.setHeroAlwaysOn !== 'function') { console.warn('[worldVehicles] heroAlwaysOn unavailable'); return; }
      if (on === undefined) { var c = wsl.getHeroAlwaysOn ? wsl.getHeroAlwaysOn() : null; console.log('[worldVehicles] heroAlwaysOn:', c); return c; }
      var applied = wsl.setHeroAlwaysOn(on);
      console.log('[worldVehicles] heroAlwaysOn →', applied, applied ? '(hero never occluded/culled/hidden)' : '(normal depth)');
      return applied;
    },

    // 0602I — inspect the resolved depth policy for every actor.
    depthPolicyState: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getActorDepthPolicyState !== 'function') { console.warn('[worldVehicles] depthPolicyState unavailable'); return null; }
      var s = wsl.getActorDepthPolicyState();
      console.group('[worldVehicles] depthPolicyState');
      console.log('heroGradeMode     :', s.heroGradeMode);
      console.log('trafficBeaconMode :', s.trafficBeaconMode);
      (s.actors || []).forEach(function (a) {
        console.log('  ' + a.id + ' [' + (a.source || '-') + '/' + (a.actorType || '-') + '] → ' + a.depthPolicyMode +
          ' | depthTest:' + a.depthTest + ' depthWrite:' + a.depthWrite +
          ' renderOrder:' + a.renderOrder + ' frustumCulled:' + a.frustumCulled + ' zLift:' + a.localZLift);
      });
      console.groupEnd();
      return s;
    },

    // 0602A-B — hero grade clearance mode: 'road' | 'visual' | 'alwaysOn'.
    heroGradeMode: function (mode) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.setHeroGradeMode !== 'function') { console.warn('[worldVehicles] heroGradeMode unavailable'); return; }
      if (mode === undefined) { var g = wsl.getHeroGradeMode ? wsl.getHeroGradeMode() : null; console.log('[worldVehicles] heroGradeMode:', g); return g; }
      var applied = wsl.setHeroGradeMode(mode);
      var note = applied === 'road' ? '(normal depth — passes UNDER 3D geometry)'
               : applied === 'visual' ? '(small Z lift, normal depth)'
               : '(debug forced visibility)';
      console.log('[worldVehicles] heroGradeMode →', applied, note);
      return applied;
    },

    // 0602A-C — underpass probe: what is above the hero right now.
    heroGradeAudit: function () {
      var wsl = _wsl();
      var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
      var mvr = _mvr();
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (!hrt || typeof hrt.getEntity !== 'function') { console.warn('[worldVehicles] heroGradeAudit — HeroVehicleRuntime unavailable'); return null; }
      var hero = hrt.getEntity();
      if (!hero) { console.warn('[worldVehicles] heroGradeAudit — no hero entity'); return null; }
      var lng = hero.lng, lat = hero.lat, alt = hero.altitude != null ? hero.altitude : (hero.alt != null ? hero.alt : 0);
      var screen = null, above = [], buildingHits = [], bridgeHits = [];
      if (map && typeof map.project === 'function') {
        var p = map.project([lng, lat]); screen = { x: Math.round(p.x), y: Math.round(p.y) };
        if (typeof map.queryRenderedFeatures === 'function') {
          var feats = [];
          try { feats = map.queryRenderedFeatures(p) || []; } catch (e) {}
          feats.forEach(function (f) {
            var lid = (f.layer && f.layer.id) || '';
            var ftype = (f.layer && f.layer.type) || '';
            above.push(lid);
            if (ftype === 'fill-extrusion' || /building/i.test(lid)) buildingHits.push(lid);
            if (/bridge|road|tunnel|street|overpass/i.test(lid)) bridgeHits.push(lid);
          });
        }
      }
      var draw = wsl && typeof wsl.getHeroDrawState === 'function' ? wsl.getHeroDrawState() : null;
      var mat = draw ? { depthTest: draw.depthTest, depthWrite: draw.depthWrite, renderOrder: draw.renderOrder, visible: draw.visible, frustumCulled: draw.frustumCulled, positionZ: draw.positionZ } : null;
      var report = {
        heroLngLat: { lng: lng, lat: lat },
        heroAltitude: alt,
        screen: screen,
        gradeMode: draw ? draw.gradeMode : (wsl && wsl.getHeroGradeMode ? wsl.getHeroGradeMode() : null),
        heroAlwaysOn: draw ? draw.heroAlwaysOn : (wsl && wsl.getHeroAlwaysOn ? wsl.getHeroAlwaysOn() : null),
        featuresAbove: above.length,
        buildingHits: buildingHits,
        bridgeRoadHits: bridgeHits,
        material: mat,
      };
      console.group('[worldVehicles] heroGradeAudit()');
      console.log('hero lng/lat      :', lng.toFixed(6), lat.toFixed(6));
      console.log('hero altitude     :', alt);
      console.log('screen position   :', screen);
      console.log('grade mode        :', report.gradeMode, '| alwaysOn:', report.heroAlwaysOn);
      console.log('features above    :', above.length, above);
      console.log('building hits     :', buildingHits.length, buildingHits);
      console.log('bridge/road hits  :', bridgeHits.length, bridgeHits);
      console.log('material depth    :', mat);
      console.groupEnd();
      return report;
    },

    // 0602B — set the explicit heading correction offset (degrees). Test 0/90/-90/180.
    setHeadingOffset: function (deg) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.setHeadingOffset !== 'function') { console.warn('[worldVehicles] setHeadingOffset unavailable'); return; }
      if (deg === undefined) { var c = wsl.getHeadingOffset ? wsl.getHeadingOffset() : null; console.log('[worldVehicles] headingOffsetDeg:', c); return c; }
      var applied = wsl.setHeadingOffset(deg);
      console.log('[worldVehicles] headingOffsetDeg →', applied, '— run heroHeadingAudit() to verify alignment');
      return applied;
    },

    // 0602B — heading truth probe. Measures nose vs. travel in screen space.
    heroHeadingAudit: function () {
      var wsl = _wsl();
      var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
      var mvr = _mvr();
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (!wsl || typeof wsl.getHeroDrawState !== 'function') { console.warn('[worldVehicles] heroHeadingAudit — layer unavailable'); return null; }
      if (!hrt || typeof hrt.getEntity !== 'function') { console.warn('[worldVehicles] heroHeadingAudit — HeroVehicleRuntime unavailable'); return null; }
      if (!map || typeof map.project !== 'function') { console.warn('[worldVehicles] heroHeadingAudit — map unavailable'); return null; }
      var hero = hrt.getEntity();
      var draw = wsl.getHeroDrawState();
      if (!hero || !draw) { console.warn('[worldVehicles] heroHeadingAudit — no hero state'); return null; }

      var lat = hero.lat, lng = hero.lng;
      var runtimeHdg = hero.headingDeg || 0;
      var forwardBearing = draw.forwardBearingDeg;   // bearing the NOSE points (from mesh rotation)

      // Project a point ~12m along a compass bearing → screen vector.
      function screenVec(bearingDeg) {
        var r = bearingDeg * Math.PI / 180;
        var step = _offsetLatLng(lat, lng, 12 * Math.cos(r), 12 * Math.sin(r));
        var a = map.project([lng, lat]);
        var b = map.project([step.lng, step.lat]);
        return { x: b.x - a.x, y: b.y - a.y };
      }
      function norm(v) { var m = Math.hypot(v.x, v.y) || 1; return { x: v.x / m, y: v.y / m }; }

      var travel = screenVec(runtimeHdg);            // direction hero is actually moving
      var nose   = forwardBearing == null ? null : screenVec(forwardBearing);
      var tN = norm(travel), nN = nose ? norm(nose) : null;
      var dot = nN ? (tN.x * nN.x + tN.y * nN.y) : null;
      var angleDiff = dot == null ? null : Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

      var report = {
        runtimeHeadingDeg:  runtimeHdg,
        appliedHeadingDeg:  draw.appliedHeadingDeg,
        headingOffsetDeg:   draw.headingOffsetDeg,
        meshRotationZrad:   draw.rotationZ,
        localForwardAxis:   draw.localForwardAxis,
        noseForwardBearing: forwardBearing,
        travelScreenVec:    { x: +travel.x.toFixed(2), y: +travel.y.toFixed(2) },
        noseScreenVec:      nose ? { x: +nose.x.toFixed(2), y: +nose.y.toFixed(2) } : null,
        dot:                dot == null ? null : +dot.toFixed(4),
        angleDiffDeg:       angleDiff == null ? null : +angleDiff.toFixed(1),
        aligned:            angleDiff != null && angleDiff < 15,
      };
      console.group('[worldVehicles] heroHeadingAudit()');
      console.log('runtime headingDeg :', report.runtimeHeadingDeg);
      console.log('applied headingDeg :', report.appliedHeadingDeg, '(offset', report.headingOffsetDeg + ')');
      console.log('mesh rotation.z    :', report.meshRotationZrad, 'rad');
      console.log('local forward axis :', report.localForwardAxis);
      console.log('nose bearing (deg) :', report.noseForwardBearing);
      console.log('travel screen vec  :', report.travelScreenVec);
      console.log('nose   screen vec  :', report.noseScreenVec);
      console.log('dot / angle diff   :', report.dot, '/', report.angleDiffDeg, '°');
      console.log('aligned (<15°)     :', report.aligned);
      console.groupEnd();
      return report;
    },

    // 0601Z-B — hero yield: slow/hold hero near showcase traffic (anti-ghosting).
    heroYield: function (on) {
      if (on === undefined) { console.log('[worldVehicles] heroYield:', !!_yieldRaf, '| state:', _yieldState); return !!_yieldRaf; }
      if (!on) { _yieldStop(); console.log('[worldVehicles] heroYield → off (hero speed restored)'); return false; }
      var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
      if (!hrt || typeof hrt.setSpeed !== 'function') { console.warn('[worldVehicles] heroYield: HeroVehicleRuntime.setSpeed unavailable'); return false; }
      _yieldStop();                          // reset any prior loop
      _yieldBaseSpeed = null;                // re-capture base on next tick
      _yieldRaf = global.requestAnimationFrame(_yieldTick);
      console.log('[worldVehicles] heroYield → on (slow≤18m, hold≤10m ahead within ±60°)');
      return true;
    },

    // 0601Z-D — traffic path quality audit
    trafficPathAudit: function () {
      var s = _sampleQualityRoadPolylines(160);
      var a = s.audit || _lastPathAudit;
      if (!a) { console.warn('[worldVehicles] trafficPathAudit — no map / no roads'); return null; }
      console.group('[worldVehicles] trafficPathAudit()');
      console.log('roadPolylinesFound   :', a.found);
      console.log('rejected tooShort    :', a.tooShort);
      console.log('rejected building    :', a.buildingContaminated);
      console.log('rejected tinyLoop    :', a.loop);
      console.log('rejected screenShort :', a.screenShort);
      console.log('accepted             :', a.accepted);
      console.log('avgLengthM           :', a.avgLenM);
      console.log('longestM             :', a.longestM);
      console.groupEnd();
      return a;
    },

    visibilityBoost: function (on) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.setVisibilityBoost !== 'function') {
        console.warn('[worldVehicles] visibilityBoost unavailable'); return;
      }
      if (on === undefined) {
        var cur = wsl.getVisibilityBoost ? wsl.getVisibilityBoost() : null;
        console.log('[worldVehicles] visibilityBoost:', cur);
        return cur;
      }
      var applied = wsl.setVisibilityBoost(on);
      console.log('[worldVehicles] visibilityBoost →', applied,
        applied ? '(hero≥2.0, car≥3.0, truck≥3.8)' : '(normal scale)');
      return applied;
    },

    // trafficBeaconMode: render showcase-road actors as bright 8×14×5m blocks
    // (depthTest off, renderOrder 999, no frustum cull). Impossible to miss. (0601U)
    trafficBeaconMode: function (on) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.setTrafficBeaconMode !== 'function') {
        console.warn('[worldVehicles] trafficBeaconMode unavailable'); return;
      }
      if (on === undefined) {
        var cur = wsl.getTrafficBeaconMode ? wsl.getTrafficBeaconMode() : null;
        console.log('[worldVehicles] trafficBeaconMode:', cur);
        return cur;
      }
      var applied = wsl.setTrafficBeaconMode(on);
      console.log('[worldVehicles] trafficBeaconMode →', applied,
        applied ? '(showcase-road = bright blocks)' : '(showcase-road = vehicles)');
      return applied;
    },

    // trafficBeaconShowcase: beacon mode + road-bound showcase + truth print
    trafficBeaconShowcase: function (count) {
      var self = _debugObj;
      self.trafficBeaconMode(true);
      var r = self.trafficShowcase(count || 40);
      global.setTimeout(function () {
        if (typeof self.renderTruth === 'function') self.renderTruth();
        if (typeof self.scaleState  === 'function') self.scaleState();
      }, 1000);
      return r;
    },

    // _startPolylineMotion: shared road-bound polyline motion starter. (0601W)
    // opts: { count, speedMs, label }
    _startPolylineMotion: function (opts) {
      opts = opts || {};
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return null; }
      var count = opts.count || 40;
      if (!wsl.isActive())  wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);

      // Stop prior motion + clear prior showcase actors so they don't stack.
      _motionStop();
      _debugObj.clearTrafficShowcase();
      _motionActors = [];
      _motionLastMs = 0;
      _opposingFlowActive = false;   // legacy motion does not enforce the corridor

      var lines = _sampleRoadPolylines(count);
      if (!lines.length) {
        console.warn('[worldVehicles]', (opts.label || 'motion') + ' — no road polylines in view (zoom in / pan to roads)');
        return { started: false, actors: 0 };
      }

      var SPECS = [
        { variant: 'sedan_red',             actorType: 'traffic_car' },
        { variant: 'sedan_dark',            actorType: 'traffic_car' },
        { variant: 'sedan_light',           actorType: 'traffic_car' },
        { variant: 'taxi_yellow',           actorType: 'traffic_car' },
        { variant: 'clean_white',           actorType: 'box_truck'   },
        { variant: 'sticker_graffiti_test', actorType: 'box_truck'   },
      ];

      // Spread `count` actors across the sampled polylines (multiple per line).
      var placed = 0;
      var li = 0;
      while (placed < count && lines.length) {
        var line = lines[li % lines.length];
        var meta = _polylineSegs(line.pts);
        if (meta.total < 4) { li++; if (li > lines.length * 3) break; continue; }   // skip tiny lines
        var spec = SPECS[placed % SPECS.length];
        var id = 'showcase_car_' + ('00' + (placed + 1)).slice(-3);
        // Lane offset: alternate ±2–4m off the centerline.
        var laneOffsetM = ((placed % 2 === 0) ? 1 : -1) * (2 + (placed % 3));
        _motionActors.push({
          id: id, actorType: spec.actorType, variant: spec.variant,
          pts: line.pts, meta: meta,
          dist: (placed % 5) / 5 * meta.total,   // staggered start along the line
          speedMs: opts.speedMs || 8,            // metres/sec (readable)
          direction: (placed % 2 === 0) ? 1 : -1,
          laneOffsetM: laneOffsetM,
          loop: !!opts.loop,                     // readable loops; beacon ping-pongs
        });
        placed++; li++;
      }

      _motionLastMs = 0;
      _motionRaf = global.requestAnimationFrame(_motionTick);
      console.log('[worldVehicles]', (opts.label || 'motion') + ' —', _motionActors.length,
        'actors on', lines.length, 'road polylines | speed:', (opts.speedMs || 8) + 'm/s',
        '| beacon:', wsl.getTrafficBeaconMode ? wsl.getTrafficBeaconMode() : '?');
      return { started: true, actors: _motionActors.length, polylines: lines.length };
    },

    // trafficMotionShowcase: polyline motion (beacon mode respected). (0601V/W)
    trafficMotionShowcase: function (count) {
      return _debugObj._startPolylineMotion({ count: count || 40, speedMs: 10, label: 'trafficMotionShowcase' });
    },

    // trafficMotionReadable: vehicles (not blocks), boosted scale, readable speed.
    trafficMotionReadable: function (count) {
      var wsl = _wsl();
      if (wsl && typeof wsl.setTrafficBeaconMode === 'function') wsl.setTrafficBeaconMode(false);
      if (wsl && typeof wsl.setVisibilityBoost === 'function') wsl.setVisibilityBoost(true);
      return _debugObj._startPolylineMotion({ count: count || 40, speedMs: 8, loop: true, label: 'trafficMotionReadable' });
    },

    // trafficDisciplineShowcase: road-validated, lane-disciplined, spaced, one-way
    // looping traffic. Believable without a simulator. Hero untouched. (0601X)
    trafficDisciplineShowcase: function (count) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return null; }
      count = count || 40;
      if (!wsl.isActive())  wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);
      if (typeof wsl.setTrafficBeaconMode === 'function') wsl.setTrafficBeaconMode(false);
      if (typeof wsl.setVisibilityBoost === 'function') wsl.setVisibilityBoost(true);

      var mvr = _mvr();
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (!map) { console.warn('[worldVehicles] map unavailable'); return null; }

      _motionStop();
      _debugObj.clearTrafficShowcase();
      _motionActors = [];
      _motionLastMs = 0;
      _opposingFlowActive = false;   // discipline mode does not enforce the corridor

      // 0601Z-C — quality-filtered road polylines (rejects short/building/loop/screen-short).
      var sampled = _sampleQualityRoadPolylines(160);
      var lines = sampled.lines;
      lines.forEach(function (l, idx) {
        l.meta = _polylineSegs(l.pts);
        l.cls  = _roadClass(l.layerId);
        l.cell = _lineCell(map, l);
        l.count = 0;
        l.nextDist = 4;
        l.lane = (idx % 2 === 0 ? 1 : -1) * Math.min(3.5, 1.5 + (idx % 3));   // 1.5–3.5m band
      });
      if (!lines.length) {
        console.warn('[worldVehicles] trafficDisciplineShowcase — no quality road polylines in view',
          sampled.audit ? JSON.stringify(sampled.audit) : '');
        return { started: false, actors: 0 };
      }

      // 3. Road class mix — interleave classes so we don't only use major roads.
      var byClass = { major: [], medium: [], local: [] };
      lines.forEach(function (l) { byClass[l.cls].push(l); });
      var ordered = [];   // round-robin across classes
      var maxLen = Math.max(byClass.major.length, byClass.medium.length, byClass.local.length);
      for (var ci = 0; ci < maxLen; ci++) {
        if (byClass.major[ci])  ordered.push(byClass.major[ci]);
        if (byClass.medium[ci]) ordered.push(byClass.medium[ci]);
        if (byClass.local[ci])  ordered.push(byClass.local[ci]);
      }

      var SPECS = [
        { variant: 'sedan_red',             actorType: 'traffic_car' },
        { variant: 'sedan_dark',            actorType: 'traffic_car' },
        { variant: 'sedan_light',           actorType: 'traffic_car' },
        { variant: 'taxi_yellow',           actorType: 'traffic_car' },
        { variant: 'clean_white',           actorType: 'box_truck'   },
        { variant: 'sticker_graffiti_test', actorType: 'box_truck'   },
      ];

      var skippedBuilding = 0;
      var placed = 0;
      var classMix = { major: 0, medium: 0, local: 0 };
      var usedCells = {};

      // Place ONE actor on a line at its nextDist (skipping building hits).
      function _placeOne(line) {
        var spec = SPECS[placed % SPECS.length];
        var minSpacing = (spec.actorType === 'box_truck') ? 28 : 18;
        var d = line.nextDist;
        var tries = 0;
        while (d < line.meta.total - 4 && tries < 6) {
          var pos = _interpPolyline(line.pts, line.meta, d);
          var perp = (pos.headingDeg + 90) * Math.PI / 180;
          var off = _offsetLatLng(pos.lat, pos.lng,
            line.lane * Math.cos(perp), line.lane * Math.sin(perp));
          if (_pointOnBuilding(map, off.lng, off.lat)) { skippedBuilding++; d += minSpacing; tries++; continue; }
          var id = 'showcase_car_' + ('00' + (placed + 1)).slice(-3);
          _motionActors.push({
            id: id, actorType: spec.actorType, variant: spec.variant,
            pts: line.pts, meta: line.meta,
            dist: d, speedMs: 8, direction: 1, laneOffsetM: line.lane, loop: true,
          });
          placed++; line.count++; classMix[line.cls]++;
          line.nextDist = d + minSpacing;   // 3. soft collision spacing on this line
          return true;
        }
        line.nextDist = line.meta.total;    // exhausted
        return false;
      }

      // Multi-pass placement:
      //   Pass 0 — one actor per cell (spatial spread), one per line.
      //   Pass N — fill remaining lines up to their class cap, reusing cells.
      // 2 + 4 — cell spread + per-line class caps.
      var pass = 0;
      while (placed < count && pass < 10) {
        var advanced = false;
        for (var oi = 0; oi < ordered.length && placed < count; oi++) {
          var line = ordered[oi];
          if (line.count >= ROAD_CLASS_CAP[line.cls]) continue;   // 4. line reuse cap
          if (pass === 0 && usedCells[line.cell]) continue;       // 2. one line per cell first
          if (_placeOne(line)) { usedCells[line.cell] = true; advanced = true; }
        }
        if (!advanced) break;
        pass++;
      }

      if (!_motionActors.length) {
        console.warn('[worldVehicles] trafficDisciplineShowcase — all slots rejected (building/spacing)');
        return { started: false, actors: 0, skippedBuilding: skippedBuilding };
      }

      // 5. Debug report
      var roadsUsed = 0, maxOnOne = 0;
      lines.forEach(function (l) { if (l.count > 0) roadsUsed++; if (l.count > maxOnOne) maxOnOne = l.count; });

      _motionLastMs = 0;
      _motionRaf = global.requestAnimationFrame(_motionTick);
      console.group('[worldVehicles] trafficDisciplineShowcase');
      console.log('placed             :', placed, '/', count);
      console.log('roadsUsed          :', roadsUsed, 'of', lines.length, 'strict road polylines');
      console.log('maxActorsOnOneRoad :', maxOnOne);
      console.log('cellsUsed          :', Object.keys(usedCells).length);
      console.log('roadClassMix       :', JSON.stringify(classMix));
      console.log('skippedBuilding    :', skippedBuilding);
      console.log('mode               : one-way looping, lane-offset, spaced (cars 18m / trucks 28m)');
      console.groupEnd();
      return { started: true, actors: placed, roadsUsed: roadsUsed, maxActorsOnOneRoad: maxOnOne,
               cellsUsed: Object.keys(usedCells).length, roadClassMix: classMix, skippedBuilding: skippedBuilding };
    },

    // 0602J — trafficOpposingFlow: life around the hero that never blocks the
    // forward lane. Prefers opposing/offset flow; rejects same-direction actors
    // in the hero corridor at spawn and despawns any that drift in at runtime.
    // No collision/braking/lane logic; hero is never slowed or moved.
    trafficOpposingFlow: function (count) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return null; }
      count = count || 40;
      if (!wsl.isActive())  wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);
      if (typeof wsl.setTrafficBeaconMode === 'function') wsl.setTrafficBeaconMode(false);
      if (typeof wsl.setVisibilityBoost === 'function') wsl.setVisibilityBoost(true);

      var mvr = _mvr();
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (!map) { console.warn('[worldVehicles] map unavailable'); return null; }

      _motionStop();
      _debugObj.clearTrafficShowcase();
      _motionActors = [];
      _motionLastMs = 0;
      _removedDuringRuntime = 0;
      _opposingFlowActive = true;

      var heroCtx = _getHeroTrafficContext();

      var sampled = _sampleQualityRoadPolylines(160);
      var lines = sampled.lines;
      lines.forEach(function (l, idx) {
        l.meta = _polylineSegs(l.pts);
        l.cls  = _roadClass(l.layerId);
        l.cell = _lineCell(map, l);
        l.count = 0;
        l.nextDist = 4;
        l.lane = (idx % 2 === 0 ? 1 : -1) * Math.min(3.5, 1.5 + (idx % 3));
      });
      if (!lines.length) {
        console.warn('[worldVehicles] trafficOpposingFlow — no quality road polylines in view',
          sampled.audit ? JSON.stringify(sampled.audit) : '');
        _opposingFlowActive = false;
        return { started: false, placed: 0, heroActive: heroCtx.active };
      }

      // Round-robin across road classes (don't only use majors).
      var byClass = { major: [], medium: [], local: [] };
      lines.forEach(function (l) { byClass[l.cls].push(l); });
      var ordered = [];
      var maxLen = Math.max(byClass.major.length, byClass.medium.length, byClass.local.length);
      for (var ci = 0; ci < maxLen; ci++) {
        if (byClass.major[ci])  ordered.push(byClass.major[ci]);
        if (byClass.medium[ci]) ordered.push(byClass.medium[ci]);
        if (byClass.local[ci])  ordered.push(byClass.local[ci]);
      }

      var SPECS = [
        { variant: 'sedan_dark',            actorType: 'traffic_car' },
        { variant: 'sedan_light',           actorType: 'traffic_car' },
        { variant: 'taxi_yellow',           actorType: 'traffic_car' },
        { variant: 'sedan_red',             actorType: 'traffic_car' },
        { variant: 'clean_white',           actorType: 'box_truck'   },
        { variant: 'sticker_graffiti_test', actorType: 'box_truck'   },
      ];

      var placed = 0, opposingActors = 0, sideActors = 0;
      var rejectedHeroCorridor = 0, rejectedSameDirection = 0, skippedBuilding = 0;
      var classMix = { major: 0, medium: 0, local: 0 };
      var usedCells = {};

      function _placeOpposing(line) {
        var spec = SPECS[placed % SPECS.length];
        var minSpacing = (spec.actorType === 'box_truck') ? 28 : 18;
        var speedMs = 8;
        var d = line.nextDist, tries = 0;
        while (d < line.meta.total - 4 && tries < 6) {
          var pos = _interpPolyline(line.pts, line.meta, d);
          // Choose the flow direction that most opposes the hero heading.
          var fwdHdg = pos.headingDeg, revHdg = (pos.headingDeg + 180) % 360;
          var flowSign = 1, travelHdg = fwdHdg;
          if (heroCtx.active &&
              _angleDiffDeg(heroCtx.headingDeg, revHdg) > _angleDiffDeg(heroCtx.headingDeg, fwdHdg)) {
            flowSign = -1; travelHdg = revHdg;
          }
          var perp = (travelHdg + 90) * Math.PI / 180;
          var off = _offsetLatLng(pos.lat, pos.lng, line.lane * Math.cos(perp), line.lane * Math.sin(perp));
          if (_pointOnBuilding(map, off.lng, off.lat)) { skippedBuilding++; d += minSpacing; tries++; continue; }

          if (heroCtx.active) {
            // Reject if spawn position violates the corridor (same-direction ahead).
            if (_isInsideHeroForwardCorridor(heroCtx, { lat: off.lat, lng: off.lng }, travelHdg)) {
              rejectedHeroCorridor++; d += minSpacing; tries++; continue;
            }
            // Reject if the first ~2s of motion would enter the corridor.
            var futureRaw = d + flowSign * speedMs * 2;
            var fd = ((futureRaw % line.meta.total) + line.meta.total) % line.meta.total;
            var fpos = _interpPolyline(line.pts, line.meta, fd);
            var fHdg = flowSign >= 0 ? fpos.headingDeg : (fpos.headingDeg + 180) % 360;
            var fperp = (fHdg + 90) * Math.PI / 180;
            var foff = _offsetLatLng(fpos.lat, fpos.lng, line.lane * Math.cos(fperp), line.lane * Math.sin(fperp));
            if (_isInsideHeroForwardCorridor(heroCtx, { lat: foff.lat, lng: foff.lng }, fHdg)) {
              rejectedSameDirection++; d += minSpacing; tries++; continue;
            }
          }

          var id = 'showcase_car_' + ('00' + (placed + 1)).slice(-3);
          _motionActors.push({
            id: id, actorType: spec.actorType, variant: spec.variant,
            pts: line.pts, meta: line.meta,
            dist: d, speedMs: speedMs, direction: 1, flowSign: flowSign,
            laneOffsetM: line.lane, loop: true,
          });
          var score = heroCtx.active ? _angleDiffDeg(heroCtx.headingDeg, travelHdg) : 180;
          if (score >= 135) opposingActors++; else sideActors++;
          placed++; line.count++; classMix[line.cls]++;
          line.nextDist = d + minSpacing;
          return true;
        }
        line.nextDist = line.meta.total;
        return false;
      }

      var pass = 0;
      while (placed < count && pass < 10) {
        var advanced = false;
        for (var oi = 0; oi < ordered.length && placed < count; oi++) {
          var line = ordered[oi];
          if (line.count >= ROAD_CLASS_CAP[line.cls]) continue;
          if (pass === 0 && usedCells[line.cell]) continue;
          if (_placeOpposing(line)) { usedCells[line.cell] = true; advanced = true; }
        }
        if (!advanced) break;
        pass++;
      }

      var roadsUsed = 0;
      lines.forEach(function (l) { if (l.count > 0) roadsUsed++; });

      _motionLastMs = 0;
      if (_motionActors.length) _motionRaf = global.requestAnimationFrame(_motionTick);
      else _opposingFlowActive = false;

      console.group('[worldVehicles] trafficOpposingFlow');
      console.log('requested             :', count);
      console.log('placed                :', placed);
      console.log('heroActive            :', heroCtx.active);
      console.log('roadsUsed             :', roadsUsed, 'of', lines.length);
      console.log('opposingActors        :', opposingActors);
      console.log('sideActors            :', sideActors);
      console.log('rejectedHeroCorridor  :', rejectedHeroCorridor);
      console.log('rejectedSameDirection :', rejectedSameDirection);
      console.log('rejectedBuilding      :', skippedBuilding);
      console.log('removedDuringRuntime  :', _removedDuringRuntime);
      console.groupEnd();
      return {
        requested: count, placed: placed, heroActive: heroCtx.active, roadsUsed: roadsUsed,
        opposingActors: opposingActors, sideActors: sideActors,
        rejectedHeroCorridor: rejectedHeroCorridor, rejectedSameDirection: rejectedSameDirection,
        rejectedBuilding: skippedBuilding, removedDuringRuntime: _removedDuringRuntime,
      };
    },

    // Convenience alias.
    safeTraffic: function (count) { return _debugObj.trafficOpposingFlow(count); },

    // 0602J — current safety state of live showcase traffic vs. the hero corridor.
    trafficSafetyAudit: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return null; }
      var heroCtx = _getHeroTrafficContext();
      var st = wsl.getState();
      var showcaseActorCount = 0, actorsInsideForwardCorridor = 0;
      var sameDirectionAheadCount = 0, safeActorCount = 0;
      (st.vehicles || []).forEach(function (v) {
        if (!v.id || v.id.indexOf('showcase_') !== 0 || v.lat == null) return;
        showcaseActorCount++;
        var inside = _isInsideHeroForwardCorridor(heroCtx, { lat: v.lat, lng: v.lng }, v.headingDeg || 0);
        if (inside) {
          actorsInsideForwardCorridor++;
          sameDirectionAheadCount++;   // corridor rule already requires same-direction
        } else {
          safeActorCount++;
        }
      });
      var report = {
        heroActive: heroCtx.active,
        heroHeading: heroCtx.headingDeg,
        showcaseActorCount: showcaseActorCount,
        actorsInsideForwardCorridor: actorsInsideForwardCorridor,
        sameDirectionAheadCount: sameDirectionAheadCount,
        safeActorCount: safeActorCount,
        removedDuringRuntime: _removedDuringRuntime,
      };
      console.group('[worldVehicles] trafficSafetyAudit');
      console.log('heroActive                  :', report.heroActive);
      console.log('heroHeading                 :', report.heroHeading);
      console.log('showcaseActorCount          :', report.showcaseActorCount);
      console.log('actorsInsideForwardCorridor :', report.actorsInsideForwardCorridor);
      console.log('sameDirectionAheadCount     :', report.sameDirectionAheadCount);
      console.log('safeActorCount              :', report.safeActorCount);
      console.log('removedDuringRuntime        :', report.removedDuringRuntime);
      console.groupEnd();
      return report;
    },

    // 0602K — ambient traffic runtime controls.
    ambientTrafficStart: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return false; }
      return a.start();
    },
    ambientTrafficStop: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return false; }
      return a.stop();
    },
    ambientTrafficRestart: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return false; }
      return a.restart();
    },
    ambientTrafficClear: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return false; }
      return a.clear();
    },
    ambientTrafficDensity: function (count) {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return false; }
      return a.setDensity(count);
    },
    ambientTrafficDebug: function (on) {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a || typeof a.setDebug !== 'function') { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return false; }
      return a.setDebug(on !== false);
    },
    // 0602Q — road-authority audit: which road/class/grade/lane each actor uses.
    ambientTrafficRoadAudit: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a || typeof a.getRoadAuthorityState !== 'function') {
        console.warn('[worldVehicles] ambientTrafficRoadAudit unavailable'); return null;
      }
      var s = a.getRoadAuthorityState();
      console.group('[worldVehicles] ambientTrafficRoadAudit');
      console.log('active     :', s.active, '| enabled:', s.enabled, '| actorCount:', s.actorCount);
      var rows = (s.actors || []).map(function (actor) {
        var r = actor.roadAuthority || {};
        return {
          id: actor.id, state: actor.state, type: actor.actorType, variant: actor.variant,
          roadKey: r.roadKey || '-', layerId: r.layerId || '-', roadClass: r.roadClass || '-',
          gradeHint: r.gradeHint || '-', directionHint: r.directionHint || '-',
          flowSign: r.flowSign, laneSide: r.laneSide, laneOffsetM: r.laneOffsetM,
          scale: r.scale, roadLengthM: r.roadLengthM, spawnMode: r.spawnMode,
          heroDistM: r.spawnDistanceFromHeroM,
        };
      });
      if (rows.length && console.table) console.table(rows);
      else if (rows.length) console.log(rows);
      else console.warn('[worldVehicles] no ambient actors to audit');
      console.groupEnd();
      return s;
    },

    // 0602Q — print one actor's road authority (geometry markers deferred).
    ambientTrafficRoadMarker: function (id) {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a || typeof a.getRoadAuthorityState !== 'function') {
        console.warn('[worldVehicles] ambientTrafficRoadMarker unavailable'); return null;
      }
      var s = a.getRoadAuthorityState();
      var actor = null;
      (s.actors || []).forEach(function (x) { if (x.id === id) actor = x; });
      if (!actor) {
        console.warn('[worldVehicles] no ambient actor found for id:', id);
        return { markerAdded: false, reason: 'actor_not_found' };
      }
      console.group('[worldVehicles] ambientTrafficRoadMarker ' + id);
      console.log(actor.roadAuthority || actor);
      console.warn('[worldVehicles] road marker geometry deferred — authority metadata available');
      console.groupEnd();
      return { markerAdded: false, reason: 'polyline_not_exposed', actor: actor };
    },

    // 0602P — presence audit: why the world is/empty, lane sides, recycle reason.
    ambientTrafficPresenceAudit: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.getState();
      console.group('[worldVehicles] ambientTrafficPresenceAudit');
      console.log('active        :', s.active, '| enabled:', s.enabled, '| safeMode:', s.safeMode);
      console.log('presence      :', s.presence);
      console.log('actorCount    :', s.actorCount, '| activeCount:', s.activeCount, '| target:', s.targetCount);
      console.log('lastError     :', s.lastError || '-');
      console.log('dominantReject:', s.lastDominantReject);
      s.actors.forEach(function (actor) {
        console.log('  ' + actor.id, '|', actor.variant, '| state:', actor.state,
          '| laneSide:', actor.laneSide, '| flow:', actor.flowSign,
          '| heading:', actor.travelHeadingDeg, '| road:', actor.roadKey,
          '| spawn:', actor.spawnMode, '| age:', actor.ageMs + 'ms', '| heroDist:', actor.heroDistanceM + 'm');
      });
      console.groupEnd();
      return s;
    },

    // 0602O — performance audit: maintenance/scan timing + freeze/auto-disable.
    ambientTrafficPerfAudit: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.getState();
      var p = s.perf || {};
      console.group('[worldVehicles] ambientTrafficPerfAudit');
      console.log('active        :', s.active, '| enabled:', s.enabled, '| safeMode:', s.safeMode);
      console.log('autoDisabled  :', p.autoDisabled, '| reason:', p.lastAutoDisableReason || '-');
      console.log('maintainMs    : last', p.lastMaintainMs, '| max', p.maxMaintainMs);
      console.log('roadScanMs    : last', p.lastRoadScanMs, '| max', p.maxRoadScanMs);
      console.log('freezeStrikes :', p.freezeStrikes);
      console.log('roadCache     :', s.roadCache);
      console.log('actorCount    :', s.actorCount, '| activeCount:', s.activeCount);
      console.log('lastError     :', s.lastError || '-');
      console.log('lastDominant  :', s.lastDominantReject);
      console.groupEnd();
      return s;
    },

    ambientTrafficSafeMode: function (on) {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a || typeof a.setSafeMode !== 'function') { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      return a.setSafeMode(on !== false);
    },

    ambientTrafficWake: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a || typeof a.wake !== 'function') { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.wake();
      console.log('[worldVehicles] ambientTrafficWake — enabled', s.enabled, '| actorCount', s.actorCount, '| lastError', s.lastError || '-');
      return s;
    },

    // 0602N — boot audit: startup readiness, starvation, dominant rejection.
    ambientTrafficBootAudit: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.getState();
      console.group('[worldVehicles] ambientTrafficBootAudit');
      console.log('active        :', s.active, '| enabled:', s.enabled);
      console.log('startup       :', s.startup);
      console.log('actorCount    :', s.actorCount, '| activeCount:', s.activeCount, '| targetCount:', s.targetCount);
      console.log('starvation    :', s.starvation, '| stageAFailStreak:', s.stageAFailStreak);
      console.log('lastError     :', s.lastError || '-');
      console.log('lastDominant  :', s.lastDominantReject);
      if (console.table) console.table(s.rejectStats || {});
      else console.log('rejectStats   :', s.rejectStats);
      s.actors.forEach(function (ac) {
        console.log('  ' + ac.id + ' | scale ' + ac.scale + ' | opacity ' + ac.opacity +
          ' | heroDist ' + ac.heroDistanceM + 'm | onScreen ' + ac.onScreen + ' | ' + ac.state);
      });
      console.groupEnd();
      return s;
    },

    // 0602N — debug-only forced recovery (restart + immediate Stage-B pass).
    ambientTrafficForceRecover: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a || typeof a.forceRecover !== 'function') { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.forceRecover();
      console.log('[worldVehicles] ambientTrafficForceRecover — actorCount', s.actorCount, '| lastError', s.lastError || '-');
      return s;
    },

    // 0602M — spawn audit: rejection breakdown + entry policy (why no actors).
    ambientTrafficSpawnAudit: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.getState();
      console.group('[worldVehicles] ambientTrafficSpawnAudit');
      console.log('active        :', s.active, '| enabled:', s.enabled, '| heroDetected:', s.heroDetected);
      console.log('actorCount    :', s.actorCount, '| activeCount:', s.activeCount, '| targetCount:', s.targetCount);
      console.log('spawnAttempts :', s.spawnAttempts, '| rejects:', s.spawnRejects, '| recycles:', s.recycleCount);
      console.log('lastError     :', s.lastError || '-');
      console.log('entryPolicy   :', s.entryPolicy);
      if (console.table) console.table(s.rejectStats || {});
      else console.log('rejectStats   :', s.rejectStats);
      s.actors.forEach(function (ac) {
        console.log('  ' + ac.id + ' | scale ' + ac.scale + ' | opacity ' + ac.opacity +
          ' | heroDist ' + ac.heroDistanceM + 'm | onScreen ' + ac.onScreen + ' | ' + ac.state);
      });
      console.groupEnd();
      return s;
    },

    // 0602L — readability audit: scale / opacity / hero distance / onScreen.
    ambientTrafficAudit: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.getState();
      console.group('[worldVehicles] ambientTrafficAudit');
      console.log('active        :', s.active, '| heroDetected:', s.heroDetected);
      console.log('actorCount    :', s.actorCount, '| activeCount:', s.activeCount, '| targetCount:', s.targetCount);
      console.log('spawnAttempts :', s.spawnAttempts, '| rejects:', s.spawnRejects, '| recycles:', s.recycleCount);
      if (s.lastError) console.warn('lastError     :', s.lastError);
      s.actors.forEach(function (ac) {
        console.log('  ' + ac.id + ' | scale ' + ac.scale + ' | opacity ' + ac.opacity +
          ' | heroDist ' + ac.heroDistanceM + 'm | onScreen ' + ac.onScreen + ' | ' + ac.state);
      });
      console.groupEnd();
      return s;
    },

    ambientTrafficState: function () {
      var a = global.SBE && SBE.AmbientTrafficRuntime;
      if (!a) { console.warn('[worldVehicles] AmbientTrafficRuntime unavailable'); return null; }
      var s = a.getState();
      console.group('[worldVehicles] ambientTrafficState');
      console.log('active        :', s.active, '| enabled:', s.enabled);
      console.log('actorCount    :', s.actorCount, '(active', s.activeCount + ')');
      console.log('targetCount   :', s.targetCount, '| max:', s.maxVisibleActors);
      console.log('heroDetected  :', s.heroDetected);
      console.log('spawnAttempts :', s.spawnAttempts, '| rejects:', s.spawnRejects, '| recycles:', s.recycleCount);
      console.log('lastSpawnAt   :', s.lastSpawnAt ? Math.round(s.lastSpawnAt) : '-',
        '| lastRecycleAt:', s.lastRecycleAt ? Math.round(s.lastRecycleAt) : '-');
      if (s.lastError) console.warn('lastError     :', s.lastError);
      s.actors.forEach(function (ac) { console.log('  ' + ac.id + ' [' + ac.state + '] ' + ac.variant + ' flow:' + ac.flowSign); });
      console.groupEnd();
      return s;
    },

    // trafficMotionBeacon: bright moving blocks, exaggerated speed (debug only).
    trafficMotionBeacon: function (count) {
      var wsl = _wsl();
      if (wsl && typeof wsl.setTrafficBeaconMode === 'function') wsl.setTrafficBeaconMode(true);
      return _debugObj._startPolylineMotion({ count: count || 40, speedMs: 18, label: 'trafficMotionBeacon' });
    },

    stopTrafficMotionShowcase: function () {
      _motionStop();
      _opposingFlowActive = false;
      console.log('[worldVehicles] stopTrafficMotionShowcase — RAF stopped (' + _motionActors.length + ' actors left in place)');
      return true;
    },

    clearTrafficMotionShowcase: function () {
      _motionStop();
      _motionActors = [];
      _opposingFlowActive = false;
      var removed = _debugObj.clearTrafficShowcase();
      console.log('[worldVehicles] clearTrafficMotionShowcase — motion stopped, showcase actors removed');
      return removed;
    },

    // trafficShowcaseVisible: visibilityBoost(true) + trafficShowcase + truth print
    trafficShowcaseVisible: function (count) {
      var self = _debugObj;
      self.visibilityBoost(true);
      var r = self.trafficShowcase(count || 40);
      global.setTimeout(function () {
        if (typeof self.renderTruth === 'function') self.renderTruth();
        if (typeof self.scaleState  === 'function') self.scaleState();
      }, 1000);
      return r;
    },

    // watchHeroVisibility: print hero render/scale/visibility every 500ms for 10s
    watchHeroVisibility: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      var ticks = 0, MAX = 20;   // 20 × 500ms = 10s
      console.log('[worldVehicles] watchHeroVisibility — 500ms × 10s');
      var timer = global.setInterval(function () {
        ticks++;
        var hero = null, audit = null;
        try {
          var st = wsl.getState();
          (st.vehicles || []).forEach(function (v) { if (v.id === 'hero') hero = v; });
        } catch (e) {}
        try { audit = wsl.getMeshVisibilityAudit ? wsl.getMeshVisibilityAudit('hero') : null; } catch (e) {}
        if (!hero) {
          console.log('[hero ' + ticks + '] not present in registry');
        } else {
          var sp = hero.screenPosition;
          console.log('[hero ' + ticks + ']',
            'rendered:', hero.rendered,
            '| projected:', hero.projectedOnScreen,
            '| finalScale:', hero.finalScale,
            '| lod:', hero.lodTier,
            '| depth×:', hero.depthMultiplier,
            '| meshVisible:', audit ? audit.meshVisible : '—',
            '| screen:', sp ? '(' + sp.x + ',' + sp.y + ')' + (sp.inViewport ? ' in' : ' off') : '—');
        }
        if (ticks >= MAX) { global.clearInterval(timer); console.log('[worldVehicles] watchHeroVisibility done'); }
      }, 500);
      return true;
    },

    // meshAudit: proves the exact reason a mesh is skipped before render. (0601P)
    meshAudit: function (id) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getMeshVisibilityAudit !== 'function') {
        console.warn('[worldVehicles] meshAudit unavailable'); return null;
      }
      var s = wsl.getMeshVisibilityAudit(id || 'hero');
      console.group('[worldVehicles] meshAudit(' + (id || 'hero') + ')');
      if (!s.exists) {
        console.warn('mesh does not exist —', s.reason);
        console.groupEnd();
        return s;
      }
      console.log('exists        :', s.exists);
      console.log('vehicleExists :', s.vehicleExists);
      console.log('sceneExists   :', s.sceneExists);
      console.log('sceneHasMesh  :', s.sceneHasMesh);
      console.log('meshVisible   :', s.meshVisible);
      console.log('children      :', s.visibleChildren + '/' + s.childCount, 'visible');
      console.log('materials     : invisible=' + s.materialInvisibleCount,
        'zeroOpacity=' + s.zeroOpacityCount, 'transparent=' + s.transparentCount);
      console.log('frustumCulled :', s.frustumCulled);
      console.log('matrixAutoUpd :', s.matrixAutoUpdate);
      console.log('scale         :', s.scale);
      console.log('position      :', s.position);
      console.log('hasModelMatrix:', s.hasModelMatrix);
      console.log('transformMode :', s.transformMode);
      console.log('projected     :', s.projectedOnScreen, s.screenPosition || '');
      console.warn('skipReason    :', s.skipReason);
      console.groupEnd();
      return s;
    },

    renderTruth: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getRenderTruth !== 'function') {
        console.warn('[worldVehicles] renderTruth unavailable'); return null;
      }
      var s = wsl.getRenderTruth();
      console.group('[worldVehicles] renderTruth() — ' +
        s.transformedCount + ' transformed, ' + s.renderedCount + ' rendered, ' +
        s.projectedOnScreenCount + ' projected, ' + s.visualConfirmedCount + ' confirmed');
      console.log('renderCount:', s.renderCount, '| lastRendered:', s.lastRenderedVehicleId || '—',
        '| objs/frame:', s.lastRenderObjectCount, '| skipped:', s.lastRenderSkippedCount);
      s.vehicles.forEach(function (v) {
        var sp = v.screenPosition;
        console.log(v.id,
          '| transformed:', v.transformed ? 'yes' : 'no',
          '| rendered:', v.rendered ? 'yes' : 'no',
          '| projected:', v.projectedOnScreen ? 'yes' : 'no',
          '| confidence:', v.visibilityConfidence,
          sp ? '| screen:(' + sp.x + ',' + sp.y + ') ' + (sp.inViewport ? 'in' : sp.nearViewport ? 'near' : 'off+' + sp.distanceFromViewportPx + 'px') : '');
      });
      if (s.visualConfirmedCount === 0) console.log('(no object is visual_confirmed — "visible" is never claimed automatically)');
      console.groupEnd();
      return s;
    },

    // visibilityTruth: alias of renderTruth for discoverability
    visibilityTruth: function () { return this.renderTruth(); },

    confirmVisible: function (id) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.confirmVisible !== 'function') { console.warn('[worldVehicles] confirmVisible unavailable'); return false; }
      var ok = wsl.confirmVisible(id);
      console.log('[worldVehicles] confirmVisible(' + id + ') →', ok ? 'marked visual_confirmed' : 'id not found');
      return ok;
    },
    clearVisibilityConfirm: function (id) {
      var wsl = _wsl();
      if (!wsl || typeof wsl.clearVisibilityConfirm !== 'function') { console.warn('[worldVehicles] clearVisibilityConfirm unavailable'); return false; }
      var ok = wsl.clearVisibilityConfirm(id);
      console.log('[worldVehicles] clearVisibilityConfirm(' + id + ') →', ok ? 'cleared' : 'id not found');
      return ok;
    },

    // visuals: per-vehicle visual identity (registry-derived)
    visuals: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getVisualIdentityState !== 'function') {
        console.warn('[worldVehicles] visuals unavailable'); return null;
      }
      var s = wsl.getVisualIdentityState();
      console.group('[worldVehicles] visuals() — registry:' + (s.registryLoaded ? 'loaded' : 'MISSING'));
      s.vehicles.forEach(function (v) {
        console.log(v.id, '|', (v.actorType || '?') + '/' + (v.variant || '?'),
          '| lod:', v.lodTier,
          '| profile:', v.visualProfile,
          '| body:', v.bodyColor,
          (v.graffiti ? '| graffiti' : ''), (v.sign ? '| taxi-sign' : ''),
          '| vis:', v.worldVisible);
      });
      if (!s.vehicles.length) console.warn('[worldVehicles] no vehicles to report');
      console.groupEnd();
      return s;
    },

    // scaleState: per-vehicle scale breakdown + LOD tiers
    scaleState: function () {
      var wsl = _wsl();
      if (!wsl || typeof wsl.getScaleState !== 'function') {
        console.warn('[worldVehicles] scaleState unavailable'); return null;
      }
      var s = wsl.getScaleState();
      console.group('[worldVehicles] scaleState() — adaptiveLOD:' + s.adaptiveLOD +
        ' zoom:' + s.zoom + ' profile:' + (s.cameraProfile || '—'));
      s.vehicles.forEach(function (v) {
        console.log(v.id, '|', (v.actorType || '?') + '/' + (v.variant || '?'),
          '| lod:', v.lodTier,
          '| zoom×' + v.zoomScale, 'type×' + v.typeScale, 'profile×' + v.profileScale,
          '→ final×' + v.finalScale);
      });
      if (!s.vehicles.length) console.warn('[worldVehicles] no vehicles to report');
      console.groupEnd();
      return s;
    },

    // shapeScale: debug multiplier on final mesh group scale. Default 1.
    shapeScale: function (s) {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      if (s === undefined) {
        var cur = wsl.getShapeScale ? wsl.getShapeScale() : 1;
        console.log('[worldVehicles] shapeScale:', cur);
        return cur;
      }
      if (typeof wsl.setShapeScale !== 'function') {
        console.warn('[worldVehicles] setShapeScale not available'); return;
      }
      var applied = wsl.setShapeScale(s);
      console.log('[worldVehicles] shapeScale →', applied);
    },

    // beacon: places a 20×20×100m bright red box at the live hero position.
    // Tracks hero via RAF. Does NOT hide the DOM hero marker.
    // If beacon appears → custom layer renders correctly.
    // If beacon is invisible → matrix/Mercator transform/render path is wrong.
    beacon: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }

      if (!wsl.isActive()) wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);

      if (!wsl.isRenderReady()) {
        console.warn('[worldVehicles] beacon: renderReady=false — wait for layer to initialise then retry');
        _debugObj.state();
        return false;
      }

      var ok = wsl.startBeacon();
      if (ok) {
        console.log('[worldVehicles] beacon ACTIVE — look for a tall red box above the hero car');
        console.log('  beacon visible → layer rendering works; check vehicle mesh scale/transform');
        console.log('  beacon invisible → Mercator/matrix path not working; check render() callback');
      }
      _debugObj.state();
      return ok;
    },

    clearBeacon: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }
      wsl.stopBeacon();
    },

    // testHero: STATIC TEST — places one sedan at map center, NOT bound to live route
    testHero: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }

      if (!wsl.isActive()) wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);

      var pos = _mapCenter();
      if (!pos) { console.warn('[worldVehicles] testHero: map center unavailable'); return; }

      var ok = wsl.upsertVehicle({
        id:        'test_hero',
        actorType: 'hero_car',
        variant:   'sedan_red',
        lat:       pos.lat,
        lng:       pos.lng,
        headingDeg: 0,
        scale:     1,
        visible:   true,
        source:    'test',
      });
      console.log('[worldVehicles] STATIC testHero placed at',
        pos.lat.toFixed(5), pos.lng.toFixed(5),
        '— NOT bound to live route. Use liveHero() for runtime binding.');
      return ok;
    },

    // liveHero: enable world-space rendering and confirm the live hero is active.
    //
    // Does NOT own frame updates — HeroVehicleRenderer.update() is called every
    // RAF by HeroVehicleRuntime and will continuously upsert 'hero' once enabled.
    //
    // Steps:
    //   1. Enable + start WorldSpaceVehicleLayer
    //   2. Remove stale test_hero mesh (avoids two sedan_red meshes)
    //   3. Confirm HeroVehicleRuntime is active and has a valid entity
    //   4. Print state — ongoing updates happen automatically via renderer RAF
    liveHero: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return null; }

      if (!wsl.isActive()) wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);

      // Remove stale static test mesh so it doesn't sit frozen beside the live car
      if (typeof wsl.removeVehicle === 'function') wsl.removeVehicle('test_hero');

      // Confirm live hero is running
      var hrt = global.SBE && global.SBE.HeroVehicleRuntime;
      if (!hrt || typeof hrt.getEntity !== 'function') {
        console.warn('[worldVehicles] liveHero: HeroVehicleRuntime.getEntity() not available');
        return null;
      }
      var entity = hrt.getEntity();
      if (!entity.active) {
        console.warn('[worldVehicles] liveHero: hero not active — launch Drive first, then call liveHero()');
        return null;
      }

      var ready = typeof wsl.isRenderReady === 'function' && wsl.isRenderReady();
      console.log('[worldVehicles] liveHero confirmed —',
        'renderReady:', ready,
        '| lat:', entity.lat.toFixed(5),
        '| hdg:', entity.headingDeg.toFixed(1) + '°',
        '| prog:', entity.progressPct + '%');
      console.log('  HeroVehicleRenderer.update() will push source:hero-live every RAF.');
      if (!ready) {
        console.warn('[worldVehicles] isRenderReady=false — Three.js onAdd may still be pending.');
        console.warn('  DOM hero stays visible. Call state() in ~1s to recheck.');
      } else {
        console.log('  DOM hero will hide on the next frame where upsert succeeds.');
      }

      return _debugObj.state();
    },

    // testTraffic: sedan + taxi + white truck + graffiti truck at fixed offsets
    testTraffic: function () {
      var wsl = _wsl();
      if (!wsl) { console.warn('[worldVehicles] layer not loaded'); return; }

      if (!wsl.isActive()) wsl.start();
      if (!wsl.getEnabled()) wsl.setEnabled(true);

      var c = _mapCenter();
      if (!c) { console.warn('[worldVehicles] testTraffic: map center unavailable'); return; }

      var specs = [
        { id: 'test_sedan',   actorType: 'traffic_car', variant: 'sedan_dark',            north:  30, east:   0, hdg:  0 },
        { id: 'test_taxi',    actorType: 'traffic_car', variant: 'taxi_yellow',            north:   0, east:  20, hdg: 90 },
        { id: 'test_truck_w', actorType: 'box_truck',   variant: 'clean_white',            north: -30, east:   0, hdg: 180 },
        { id: 'test_truck_g', actorType: 'box_truck',   variant: 'sticker_graffiti_test',  north:   0, east: -20, hdg: 270 },
      ];

      specs.forEach(function (s) {
        var p = _offsetLatLng(c.lat, c.lng, s.north, s.east);
        var ok = wsl.upsertVehicle({
          id: s.id, actorType: s.actorType, variant: s.variant,
          lat: p.lat, lng: p.lng, headingDeg: s.hdg,
          scale: 1, visible: true, source: 'test',
        });
        console.log('[worldVehicles] testTraffic placed', s.id, s.variant, 'ok:', ok);
      });
    },

  };

  // ── World Actors debug (0603A) — truth-driven actor authority ─────────────────
  function _tar() { return global.SBE && SBE.TruthActorRuntime; }
  var _proofLineup = {};   // 0603L proofKey → { actorId, lat, lng }

  // ── 0603M Actor Proof Stage overlay (debug-only DOM labels/rings) ─────────────
  var _proofOverlayEl = null, _proofLabelNodes = {}, _proofLabelsEnabled = false;
  var _proofOverlayRaf = null, _proofCameraLastFramedAt = 0, _proofCssInjected = false;

  function _proofActors() {
    var tar = _tar();
    if (!tar || typeof tar.listActors !== 'function') return [];
    return tar.listActors().filter(function (a) {
      return (a.metadata && a.metadata.visualProof === true) || (a.actorId && a.actorId.indexOf('visual_proof_') !== -1);
    });
  }
  function _injectProofCss() {
    if (_proofCssInjected) return;
    try {
      var st = global.document.createElement('style');
      st.id = 'wos-proof-style';
      st.textContent =
        '#wos-actor-proof-overlay{position:absolute;inset:0;pointer-events:none;z-index:20;}' +
        '.wos-proof-label{position:absolute;transform:translate(-50%,-120%);padding:4px 6px;' +
        'border:1px solid rgba(120,230,255,0.7);border-radius:4px;background:rgba(0,10,14,0.72);' +
        'color:#dffbff;font:10px/1.2 monospace;text-shadow:0 1px 2px #000;white-space:nowrap;}' +
        '.wos-proof-ring{position:absolute;width:28px;height:28px;transform:translate(-50%,-50%);' +
        'border:1px solid rgba(120,230,255,0.85);border-radius:50%;box-shadow:0 0 10px rgba(120,230,255,0.35);}';
      global.document.head.appendChild(st);
      _proofCssInjected = true;
    } catch (e) {}
  }
  function _ensureProofOverlay() {
    if (_proofOverlayEl && _proofOverlayEl.parentNode) return _proofOverlayEl;
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map || typeof map.getContainer !== 'function') return null;
    _injectProofCss();
    var el = global.document.createElement('div');
    el.id = 'wos-actor-proof-overlay';
    map.getContainer().appendChild(el);
    _proofOverlayEl = el;
    return el;
  }
  function _buildProofLabelNodes() {
    var el = _ensureProofOverlay();
    if (!el) return;
    _clearProofLabelNodes();
    _proofActors().forEach(function (a) {
      var p = a._lastPayload || {};
      var ring = global.document.createElement('div'); ring.className = 'wos-proof-ring';
      var label = global.document.createElement('div'); label.className = 'wos-proof-label';
      label.textContent = (a.metadata && a.metadata.proofKey || a.actorType) +
        ' | ' + (p.silhouetteClass || '-') + ' | ' + (p.paletteRef || '-');
      el.appendChild(ring); el.appendChild(label);
      _proofLabelNodes[a.actorId] = { label: label, ring: ring };
    });
  }
  function _clearProofLabelNodes() {
    Object.keys(_proofLabelNodes).forEach(function (id) {
      var n = _proofLabelNodes[id];
      if (n.label && n.label.parentNode) n.label.parentNode.removeChild(n.label);
      if (n.ring && n.ring.parentNode) n.ring.parentNode.removeChild(n.ring);
    });
    _proofLabelNodes = {};
  }
  function _updateProofOverlay() {
    if (!_proofLabelsEnabled) { _proofOverlayRaf = null; return; }
    _proofOverlayRaf = global.requestAnimationFrame(_updateProofOverlay);
    var mvr = _mvr();
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map || typeof map.project !== 'function') return;
    var tar = _tar(); if (!tar) return;
    var byId = {}; _proofActors().forEach(function (a) { byId[a.actorId] = a; });
    Object.keys(_proofLabelNodes).forEach(function (id) {
      var n = _proofLabelNodes[id], a = byId[id];
      if (!a || a.lat == null) { n.label.style.display = 'none'; n.ring.style.display = 'none'; return; }
      var pt; try { pt = map.project([a.lng, a.lat]); } catch (e) { return; }
      var c = map.getCanvas();
      var on = pt.x >= 0 && pt.y >= 0 && pt.x <= c.clientWidth && pt.y <= c.clientHeight;
      var disp = on ? '' : 'none';
      n.label.style.display = disp; n.ring.style.display = disp;
      if (on) {
        n.label.style.left = pt.x + 'px'; n.label.style.top = pt.y + 'px';
        n.ring.style.left = pt.x + 'px';  n.ring.style.top = pt.y + 'px';
      }
    });
  }
  function _startProofOverlay() { if (!_proofOverlayRaf) _proofOverlayRaf = global.requestAnimationFrame(_updateProofOverlay); }
  function _stopProofOverlay() {
    if (_proofOverlayRaf) { global.cancelAnimationFrame(_proofOverlayRaf); _proofOverlayRaf = null; }
  }
  function _removeProofOverlay() {
    _stopProofOverlay();
    _clearProofLabelNodes();
    if (_proofOverlayEl && _proofOverlayEl.parentNode) _proofOverlayEl.parentNode.removeChild(_proofOverlayEl);
    _proofOverlayEl = null;
  }

  // Sample point near current map center (NOT near the hero path).
  function _centerNear(northM, eastM) {
    var c = _mapCenter();
    if (!c) return { lat: 40.7580, lng: -73.9855 };   // safe NYC-ish fallback
    return _offsetLatLng(c.lat, c.lng, northM || 0, eastM || 0);
  }

  function _injectTestActor(opts) {
    var tar = _tar();
    if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
    if (typeof tar.start === 'function') tar.start();
    var p = _centerNear(opts.northM, opts.eastM);
    var id = tar.upsertActor({
      sourceId: opts.sourceId, sourceEntityId: opts.sourceEntityId, actorType: opts.actorType,
      label: opts.label, lng: p.lng, lat: p.lat, headingDeg: opts.headingDeg || 90,
      speedMps: opts.speedMps || 0, timestampMs: Date.now(), ttlMs: opts.ttlMs || 30000,
      metadata: opts.metadata || {},
    });
    console.log('[worldActors]', opts.label, '→ actorId:', id);
    return id;
  }

  var _worldActorsDebug = {
    state: function () {
      var tar = _tar(); if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var s = tar.getState();
      console.group('[worldActors] state');
      console.log('active     :', s.active, '| actorCount:', s.actorCount);
      console.log('sourceCounts:', s.sourceCounts);
      console.log('typeCounts :', s.typeCounts);
      console.log('lastUpdate :', s.lastUpdateAt ? new Date(s.lastUpdateAt).toLocaleTimeString() : '-',
        '| lastPrune:', s.lastPruneAt ? new Date(s.lastPruneAt).toLocaleTimeString() : '-');
      if (s.lastError) console.warn('lastError  :', s.lastError);
      console.groupEnd();
      return s;
    },
    list: function () {
      var tar = _tar(); if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var actors = tar.listActors();
      var rows = actors.map(function (a) {
        return { actorId: a.actorId, type: a.actorType, source: a.sourceId, label: a.label,
          lat: a.lat, lng: a.lng, heading: a.headingDeg,
          scale: a.visualProfile ? a.visualProfile.scale : null,
          shape: a.visualProfile ? a.visualProfile.shape : null,
          ageMs: a.lastSeenAt ? (Date.now() - a.lastSeenAt) : null };
      });
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      return actors;
    },
    sources: function () {
      var reg = global.SBE && SBE.ActorSourceRegistry;
      if (!reg) { console.warn('[worldActors] ActorSourceRegistry unavailable'); return null; }
      var rows = reg.listSources().map(function (s) {
        return { id: s.id, label: s.label, truthLevel: s.truthLevel, actorTypes: (s.actorTypes || []).join(','),
          updateMode: s.updateMode, defaultTtlMs: s.defaultTtlMs };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return reg.listSources();
    },
    visuals: function () {
      var reg = global.SBE && SBE.ActorVisualRegistry;
      if (!reg) { console.warn('[worldActors] ActorVisualRegistry unavailable'); return null; }
      var rows = reg.listVisualProfiles().map(function (p) {
        return { visualId: p.visualId, actorType: p.actorType, shape: p.shape, variant: p.variant,
          scale: p.scale, paletteRef: p.paletteRef, glyphRef: p.glyphRef, depthPolicy: p.depthPolicy };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return reg.listVisualProfiles();
    },
    identities: function () {
      var reg = global.SBE && SBE.ActorIdentityRegistry;
      if (!reg) { console.warn('[worldActors] ActorIdentityRegistry unavailable'); return null; }
      var rows = reg.listIdentities().map(function (i) {
        return { actorId: i.actorId, sourceId: i.sourceId, sourceEntityId: i.sourceEntityId,
          actorType: i.actorType, label: i.label, ttlMs: i.ttlMs, tags: (i.tags || []).join(',') };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return reg.listIdentities();
    },
    clear: function () {
      var tar = _tar(); if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var n = tar.getState().actorCount;
      tar.clear();
      console.log('[worldActors] cleared', n, 'truth actors (hero/AIS/aircraft/showcase untouched)');
      return n;
    },
    prune: function () {
      var tar = _tar(); if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var removed = tar.prune(Date.now());
      console.log('[worldActors] pruned', removed.length, 'stale actors:', removed);
      return removed;
    },
    testBus: function () {
      return _injectTestActor({ sourceId: 'mta_bus_gtfs_rt', sourceEntityId: 'debug_bus_001',
        actorType: 'vehicle.bus', label: 'MTA Bus debug_bus_001', northM: 0, eastM: 0,
        headingDeg: 90, speedMps: 8, metadata: { routeId: 'M15' } });
    },
    testUtility: function () {
      return _injectTestActor({ sourceId: 'nyc_dot_events', sourceEntityId: 'debug_utility_001',
        actorType: 'vehicle.utility', label: 'DOT Utility debug_utility_001', northM: 18, eastM: 12,
        headingDeg: 180, speedMps: 0, ttlMs: 120000, metadata: { kind: 'utility' } });
    },
    testBike: function () {
      return _injectTestActor({ sourceId: 'citibike_gbfs', sourceEntityId: 'debug_bike_001',
        actorType: 'bike.vehicle', label: 'Citi Bike debug_bike_001', northM: -16, eastM: -10,
        headingDeg: 270, speedMps: 4, ttlMs: 45000, metadata: { rideId: 'debug' } });
    },

    // ── Public feed inventory (0603B) — read-only, no fetch, no actors ───────────
    feedInventory: function () {
      var inv = global.SBE && SBE.PublicFeedSourceInventory;
      if (!inv) { console.warn('[worldActors] PublicFeedSourceInventory unavailable'); return null; }
      var rows = inv.listFeeds().map(function (f) {
        return { id: f.id, source: f.sourceId, label: f.label, priority: f.priority, buildOrder: f.buildOrder,
          actorTypes: (f.actorTypes || []).join(','), truthLevel: f.truthLevel, access: f.accessMethod,
          corsRisk: f.corsRisk, cadenceMs: f.expectedCadenceMs };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return inv.listFeeds();
    },
    feedBuildOrder: function () {
      var inv = global.SBE && SBE.PublicFeedSourceInventory;
      if (!inv) { console.warn('[worldActors] PublicFeedSourceInventory unavailable'); return null; }
      var rows = inv.listBuildOrder().map(function (f) {
        return { buildOrder: f.buildOrder, id: f.id, source: f.sourceId, priority: f.priority,
          actorTypes: (f.actorTypes || []).join(','), adapterTarget: f.adapterTarget };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return inv.listBuildOrder();
    },
    feedBySource: function (sourceId) {
      var inv = global.SBE && SBE.PublicFeedSourceInventory;
      if (!inv) { console.warn('[worldActors] PublicFeedSourceInventory unavailable'); return null; }
      var list = inv.listBySource(sourceId);
      if (console.table) console.table(list.map(function (f) {
        return { id: f.id, label: f.label, buildOrder: f.buildOrder, dataShape: f.dataShape, notes: f.notes };
      })); else console.log(list);
      return list;
    },
    feedPriority: function (priority) {
      var inv = global.SBE && SBE.PublicFeedSourceInventory;
      if (!inv) { console.warn('[worldActors] PublicFeedSourceInventory unavailable'); return null; }
      var list = inv.listByPriority(Number(priority));
      if (console.table) console.table(list.map(function (f) {
        return { id: f.id, source: f.sourceId, buildOrder: f.buildOrder, actorTypes: (f.actorTypes || []).join(',') };
      })); else console.log(list);
      return list;
    },

    // ── Citi Bike GBFS station runtime (0603C) ───────────────────────────────────
    citibikeStart: function () {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      return c.start();
    },
    citibikeStop: function () {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      return c.stop();
    },
    citibikeRestart: function () {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      return c.restart();
    },
    citibikeRefresh: function () {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      var p = c.refresh();
      if (p && p.then) p.then(function (ok) { console.log('[worldActors] citibikeRefresh →', ok); });
      return p;
    },
    citibikeClear: function () {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      return c.clear();
    },
    citibikeViewportFilter: function (on) {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      return c.setViewportFilter(on !== false);
    },
    citibikeDebug: function (on) {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      return c.setDebug(on !== false);
    },
    citibikeState: function () {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      var s = c.getState();
      console.group('[worldActors] citibikeState');
      console.log('active        :', s.active, '| enabled:', s.enabled, '| viewportFilter:', s.viewportFilterEnabled);
      console.log('stationCount  :', s.stationCount, '| actorCount:', s.actorCount);
      console.log('information   :', s.informationCount, '| status:', s.statusCount, '| stale:', s.staleCount);
      console.log('fetchCount    :', s.fetchCount, '| upsertCount:', s.upsertCount);
      console.log('lastFetchAt   :', s.lastFetchAt ? new Date(s.lastFetchAt).toLocaleTimeString() : '-');
      console.log('lastError     :', s.lastError || '-');
      console.log('feedUrls      :', s.feedUrls);
      console.groupEnd();
      return s;
    },
    citibikeList: function (limit) {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      limit = limit || 25;
      var rows = c.listStations().slice(0, limit).map(function (s) {
        return { stationId: s.stationId, name: s.name, lat: s.lat, lng: s.lng, capacity: s.capacity,
          bikes: s.numBikesAvailable, ebikes: s.numEbikesAvailable, docks: s.numDocksAvailable,
          pressureRatio: s.pressureRatio, statusStale: s.statusStale, actorId: s.actorId };
      });
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    citibikeSample: function () {
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!c) { console.warn('[worldActors] CitiBikeStationRuntime unavailable'); return null; }
      var all = c.listStations();
      var byBikes = all.slice().sort(function (a, b) { return b.numBikesAvailable - a.numBikesAvailable; });
      var stale = all.filter(function (s) { return s.statusStale; }).length;
      function brief(s) { return { stationId: s.stationId, name: s.name, bikes: s.numBikesAvailable,
        docks: s.numDocksAvailable, capacity: s.capacity, pressureRatio: s.pressureRatio }; }
      console.group('[worldActors] citibikeSample (' + all.length + ' stations, ' + stale + ' stale)');
      console.log('first 10 :'); console.table(all.slice(0, 10).map(brief));
      console.log('highest availability 10 :'); console.table(byBikes.slice(0, 10).map(brief));
      console.log('lowest availability 10 :'); console.table(byBikes.slice(-10).map(brief));
      console.groupEnd();
      return { total: all.length, staleCount: stale };
    },

    // ── Citi Bike station visual profile (0603D) ─────────────────────────────────
    citibikeVisualState: function () {
      var v = global.SBE && SBE.CitiBikeStationVisualProfile;
      if (!v) { console.warn('[worldActors] CitiBikeStationVisualProfile unavailable'); return null; }
      var s = v.getState();
      console.group('[worldActors] citibikeVisualState');
      console.log('enabled       :', s.enabled, '| registered:', s.registered, '| debug:', s.debug);
      console.log('viewportFilter:', s.viewportFilterEnabled);
      console.log('stationCount  :', s.stationCount, '| visibleCandidates:', s.visibleCandidateCount,
        '| capped:', s.capped, '(max ' + s.maxVisibleStationActors + ')');
      console.log('stateCounts   :', s.stateCounts);
      console.log('lastError     :', s.lastError || '-');
      console.groupEnd();
      return s;
    },
    citibikeVisualSample: function () {
      var v = global.SBE && SBE.CitiBikeStationVisualProfile;
      var c = global.SBE && SBE.CitiBikeStationRuntime;
      if (!v || !c) { console.warn('[worldActors] CitiBike visual/runtime unavailable'); return null; }
      var rows = c.listStations().slice(0, 10).map(function (st) {
        var vis = v.resolveStationVisual({ actorType: 'bike.station', metadata: st });
        return { stationId: st.stationId, name: st.name, state: vis.state,
          bikes: st.numBikesAvailable, docks: st.numDocksAvailable, capacity: st.capacity,
          pressureRatio: st.pressureRatio, scale: vis.scale, paletteRef: vis.paletteRef,
          glyphRef: vis.glyphRef, opacity: vis.opacity };
      });
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    citibikeVisualEnable: function (on) {
      var v = global.SBE && SBE.CitiBikeStationVisualProfile;
      if (!v) { console.warn('[worldActors] CitiBikeStationVisualProfile unavailable'); return null; }
      return v.setEnabled(on !== false);
    },
    citibikeVisualDebug: function (on) {
      var v = global.SBE && SBE.CitiBikeStationVisualProfile;
      if (!v) { console.warn('[worldActors] CitiBikeStationVisualProfile unavailable'); return null; }
      return v.setDebug(on !== false);
    },

    // ── Citi Bike station render bridge (0603E) ──────────────────────────────────
    citibikeRenderBridgeState: function () {
      var tar = global.SBE && SBE.TruthActorRuntime;
      var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var actors = tar.listActors().filter(function (a) { return a.actorType === 'bike.station'; });
      var rendered = 0, withState = 0, withOpacity = 0, usingNode = 0;
      var stateCounts = {};
      var wslState = (wsl && typeof wsl.getState === 'function') ? wsl.getState() : null;
      var wslIds = {};
      if (wslState && wslState.vehicles) wslState.vehicles.forEach(function (v) { wslIds[v.id] = v; });
      actors.forEach(function (a) {
        if (a._rendered) rendered++;
        var vis = a._visual;
        if (vis && vis.state) { withState++; stateCounts[vis.state] = (stateCounts[vis.state] || 0) + 1; }
        if (vis && vis.opacity != null && vis.opacity < 1) withOpacity++;
        var wv = wslIds[a.actorId];
        if (wv && (wv.actorType === 'bike.station')) usingNode++;
      });
      var out = {
        version: '1.0.0',
        stationActorsInTruthRuntime: actors.length,
        stationActorsRendered: rendered,
        stationActorsWithVisualState: withState,
        stationActorsWithOpacity: withOpacity,
        stationActorsUsingStationNode: usingNode,
        stateCounts: stateCounts,
        lastError: tar.getState().lastError,
      };
      console.group('[worldActors] citibikeRenderBridgeState');
      console.log('inTruthRuntime  :', out.stationActorsInTruthRuntime);
      console.log('rendered        :', out.stationActorsRendered);
      console.log('withVisualState :', out.stationActorsWithVisualState);
      console.log('withOpacity     :', out.stationActorsWithOpacity);
      console.log('usingStationNode:', out.stationActorsUsingStationNode);
      console.log('stateCounts     :', out.stateCounts);
      console.log('lastError       :', out.lastError || '-');
      console.groupEnd();
      return out;
    },
    // ── Actor 2.5D presentation pass (0603J) ─────────────────────────────────────
    actorPaletteList: function () {
      var reg = global.SBE && SBE.ActorPresentationPaletteRegistry;
      if (!reg) { console.warn('[worldActors] ActorPresentationPaletteRegistry unavailable'); return null; }
      var rows = reg.listPalettes().map(function (p) {
        function hex(v) { return '#' + ('000000' + (v >>> 0).toString(16)).slice(-6); }
        return { key: p.key, body: hex(p.body), roof: hex(p.roof), side: hex(p.side),
          glass: hex(p.glass), accent: hex(p.accent), light: hex(p.light), opacity: p.opacity };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    actor2D5State: function () {
      var reg = global.SBE && SBE.ActorPresentationPaletteRegistry;
      var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
      var st = wsl && typeof wsl.getState === 'function' ? wsl.getState() : null;
      var identityMesh = 0, fallbackMesh = 0, lastKind = null, lastPalette = null;
      if (st && st.vehicles) st.vehicles.forEach(function (v) {
        // (debug heuristic: presence of station/identity actorTypes)
      });
      var s = {
        enabled: true,
        paletteCount: reg ? reg.getState().paletteCount : 0,
        paletteResolved: reg ? reg.getState().resolved : 0,
        paletteFallback: reg ? reg.getState().fallback : 0,
        lastPaletteRef: reg ? reg.getState().lastRef : null,
      };
      console.group('[worldActors] actor2D5State');
      console.log('paletteCount   :', s.paletteCount);
      console.log('paletteResolved:', s.paletteResolved, '| fallback:', s.paletteFallback);
      console.log('lastPaletteRef :', s.lastPaletteRef || '-');
      console.groupEnd();
      return s;
    },
    actor2D5Sample: function () {
      var tar = global.SBE && SBE.TruthActorRuntime;
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var rows = tar.listActors().slice(0, 20).map(function (a) {
        var p = a._lastPayload || {};
        return { actorId: a.actorId, actorType: a.actorType, visualIdentityKey: p.visualIdentityKey,
          silhouetteClass: p.silhouetteClass, paletteRef: p.paletteRef, scaleClass: p.scaleClass,
          rendered: !!a._rendered, lodTier: p.lodTier };
      });
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    // ── Actor asset library authority (0603O) ────────────────────────────────────
    assetLibraryState: function () {
      var a = global.SBE && SBE.ActorAssetLibraryAuthority;
      if (!a) { console.warn('[worldActors] ActorAssetLibraryAuthority unavailable'); return null; }
      var s = a.getState();
      console.group('[worldActors] assetLibraryState');
      console.log('enabled       :', s.enabled, '| assets:', s.assetCount, '| assignments:', s.assignmentCount);
      console.log('resolved      :', s.resolvedCount, '| fallback:', s.fallbackCount);
      console.log('lastError     :', s.lastError || '-');
      console.groupEnd();
      return s;
    },
    assetLibraryList: function () {
      var a = global.SBE && SBE.ActorAssetLibraryAuthority;
      if (!a) { console.warn('[worldActors] ActorAssetLibraryAuthority unavailable'); return null; }
      var rows = a.listAssets().map(function (x) {
        return { assetId: x.id, label: x.label, category: x.category, silhouetteClass: x.silhouetteClass,
          paletteRef: x.paletteRef, defaultVariant: x.defaultVariant, editable: x.editable };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    assetLibraryAssignments: function () {
      var a = global.SBE && SBE.ActorAssetLibraryAuthority;
      if (!a) { console.warn('[worldActors] ActorAssetLibraryAuthority unavailable'); return null; }
      var m = a.listAssignments();
      var rows = Object.keys(m).map(function (k) { return { visualIdentityKey: k, assetId: m[k] }; });
      if (console.table) console.table(rows); else console.log(rows);
      return m;
    },
    assetLibraryByCategory: function (category) {
      var a = global.SBE && SBE.ActorAssetLibraryAuthority;
      if (!a) { console.warn('[worldActors] ActorAssetLibraryAuthority unavailable'); return null; }
      var list = a.listByCategory(category);
      if (console.table) console.table(list.map(function (x) { return { assetId: x.id, label: x.label, silhouetteClass: x.silhouetteClass }; }));
      else console.log(list);
      return list;
    },
    assetLibraryResolve: function (actorId) {
      var a = global.SBE && SBE.ActorAssetLibraryAuthority;
      var tar = global.SBE && SBE.TruthActorRuntime;
      if (!a || !tar) { console.warn('[worldActors] asset library / runtime unavailable'); return null; }
      var actor = tar.getActor(actorId);
      if (!actor) { console.warn('[worldActors] no actor for id:', actorId); return null; }
      var asset = a.resolveAsset(actor, actor._lastPayload || { visualIdentityKey: actor._visualIdentityKey, actorType: actor.actorType });
      console.group('[worldActors] assetLibraryResolve ' + actorId);
      console.log('assetId     :', asset.assetId, '(', asset.matchLevel, ')');
      console.log('variant     :', asset.variantKey, '→', asset.renderVariant);
      console.log('palette/glyph:', asset.paletteRef, '/', asset.glyphRef);
      console.log('full        :', asset);
      console.groupEnd();
      return asset;
    },

    // 0603U — marine vessel taxonomy resolver (advisory, read-only).
    marineTaxonomyState: function () {
      var r = global.SBE && SBE.MarineVesselTaxonomyResolver;
      if (!r) { console.warn('[worldActors] MarineVesselTaxonomyResolver unavailable'); return null; }
      var s = r.getState(); console.log('[worldActors] marineTaxonomyState', s); return s;
    },
    marineTaxonomyResolve: function (input) {
      var r = global.SBE && SBE.MarineVesselTaxonomyResolver;
      if (!r) { console.warn('[worldActors] MarineVesselTaxonomyResolver unavailable'); return null; }
      var v = r.resolveVessel(input || {});
      console.log('[worldActors] marineTaxonomyResolve →', v.role, '|', v.assetId, '| conf', v.confidence, '| ' + v.reason);
      return v;
    },
    marineTaxonomyAuditActor: function (actorId) {
      var r = global.SBE && SBE.MarineVesselTaxonomyResolver;
      if (!r) { console.warn('[worldActors] MarineVesselTaxonomyResolver unavailable'); return null; }
      var v = r.auditActor(actorId);
      console.log('[worldActors] marineTaxonomyAuditActor', actorId, '→', v);
      return v;
    },

    // 0603K — per-actor visibility tuning (scale/opacity/shadow) report.
    visibilityState: function () {
      var tar = global.SBE && SBE.TruthActorRuntime;
      var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var prof = (wsl && typeof wsl.getActorVisibilityProfile === 'function') ? wsl.getActorVisibilityProfile() : {};
      var rows = tar.listActors().slice(0, 25).map(function (a) {
        var p = a._lastPayload || {};
        var vp = prof[p.silhouetteClass] || {};
        return { actorId: a.actorId, actorType: a.actorType, silhouetteClass: p.silhouetteClass || '-',
          scaleMultiplier: vp.scale != null ? vp.scale : 1.0,
          opacity: vp.opacity != null ? vp.opacity : (p.opacity != null ? p.opacity : 1.0),
          shadowMultiplier: vp.shadow != null ? vp.shadow : 1.0 };
      });
      console.group('[worldActors] visibilityState');
      console.log('visibilityProfile:', prof);
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      console.groupEnd();
      return { profile: prof, actors: rows };
    },

    actor2D5Resolve: function (actorId) {
      var tar = global.SBE && SBE.TruthActorRuntime;
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var a = tar.getActor(actorId);
      if (!a) { console.warn('[worldActors] no actor for id:', actorId); return null; }
      console.group('[worldActors] actor2D5Resolve ' + actorId);
      console.log('payload :', a._lastPayload || '(none)');
      console.log('visual  :', a._visual || '(none)');
      console.groupEnd();
      return { payload: a._lastPayload, visual: a._visual };
    },

    // ── Actor Visual Proof Harness (0603L) — debug-only fixed lineup ─────────────
    visualProofLineup: function () {
      var tar = _tar();
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      if (typeof tar.start === 'function') tar.start();   // NOT a feed runtime
      var c = _mapCenter() || { lat: 40.7580, lng: -73.9855 };
      var HS = 55, VS = 45;
      // row, n (row width), col index, heading, optional metadata.
      var DEFS = [
        { proofKey: 'city-bus',        actorType: 'vehicle.bus',       sourceId: 'mta_bus_gtfs_rt',  entity: 'visual_proof_city_bus_001',       label: 'MTA Bus Visual Proof',       row: 1, n: 3, col: 0, heading: 0 },
        { proofKey: 'utility-truck',   actorType: 'vehicle.utility',   sourceId: 'nyc_dot_events',   entity: 'visual_proof_utility_truck_001',  label: 'DOT Utility Visual Proof',   row: 1, n: 3, col: 1, heading: 0 },
        { proofKey: 'station-node',    actorType: 'bike.station',      sourceId: 'citibike_gbfs',    entity: 'visual_proof_station_node_001',   label: 'Citi Bike Station Visual Proof', row: 1, n: 3, col: 2, heading: 0,
          metadata: { capacity: 60, numBikesAvailable: 42, numDocksAvailable: 18, isInstalled: true, isRenting: true, isReturning: true, statusStale: false, pressureRatio: 0.7 } },
        { proofKey: 'vessel-generic',  actorType: 'marine.vessel',     sourceId: 'ais_runtime',      entity: 'visual_proof_vessel_001',         label: 'AIS Vessel Visual Proof',    row: 2, n: 4, col: 0, heading: 45 },
        { proofKey: 'passenger-ferry', actorType: 'marine.ferry',      sourceId: 'nyc_ferry_feed',   entity: 'visual_proof_ferry_001',          label: 'NYC Ferry Visual Proof',     row: 2, n: 4, col: 1, heading: 45 },
        { proofKey: 'aircraft-light',  actorType: 'aircraft.plane',    sourceId: 'aircraft_runtime', entity: 'visual_proof_aircraft_001',       label: 'Aircraft Visual Proof',      row: 2, n: 4, col: 2, heading: 90 },
        { proofKey: 'ambient-car',     actorType: 'vehicle.synthetic', sourceId: 'synthetic_ambient',entity: 'visual_proof_synthetic_car_001',  label: 'Synthetic Vehicle Control',  row: 2, n: 4, col: 3, heading: 0 },
      ];
      _proofLineup = {};
      var placed = 0;
      DEFS.forEach(function (d) {
        var eastM  = (d.col - (d.n - 1) / 2) * HS;
        var northM = (d.row === 1 ? VS / 2 : -VS / 2);
        var p = _offsetLatLng(c.lat, c.lng, northM, eastM);
        var md = { visualProof: true, proofHarnessVersion: '1.0.0', proofKey: d.proofKey };
        if (d.metadata) for (var k in d.metadata) if (d.metadata.hasOwnProperty(k)) md[k] = d.metadata[k];
        var id = tar.upsertActor({
          sourceId: d.sourceId, sourceEntityId: d.entity, actorType: d.actorType, label: d.label,
          lng: p.lng, lat: p.lat, headingDeg: d.heading, speedMps: 0, timestampMs: Date.now(),
          ttlMs: 3600000, metadata: md,
        });
        if (id) { _proofLineup[d.proofKey] = { actorId: id, lat: p.lat, lng: p.lng, proofKey: d.proofKey }; placed++; }
      });
      console.log('[worldActors] visualProofLineup — placed', placed, 'proof actors near map center');
      return { placed: placed, keys: Object.keys(_proofLineup) };
    },
    clearVisualProofLineup: function () {
      var tar = _tar();
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var removed = 0;
      tar.listActors().forEach(function (a) {
        var isProof = (a.metadata && a.metadata.visualProof === true) ||
          (a.actorId && a.actorId.indexOf('visual_proof_') !== -1);
        if (isProof) { tar.removeActor(a.actorId); removed++; }
      });
      _proofLineup = {};
      console.log('[worldActors] clearVisualProofLineup — removed', removed, 'proof actors (live actors untouched)');
      return removed;
    },
    visualProofState: function () {
      var tar = _tar();
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var proof = tar.listActors().filter(function (a) {
        return (a.metadata && a.metadata.visualProof === true) || (a.actorId && a.actorId.indexOf('visual_proof_') !== -1);
      });
      var rendered = 0, suppressed = 0;
      var actors = proof.map(function (a) {
        var p = a._lastPayload || {};
        var pr = a._presentation || {};
        if (a._rendered) rendered++; else suppressed++;
        return { proofKey: a.metadata && a.metadata.proofKey, actorId: a.actorId, actorType: a.actorType,
          sourceId: a.sourceId, visualIdentityKey: p.visualIdentityKey, silhouetteClass: p.silhouetteClass,
          paletteRef: p.paletteRef, scaleClass: p.scaleClass, presentationMeshKind: p.actorType,
          lodTier: p.lodTier, rendered: !!a._rendered, suppressionReason: a._rendered ? null : (pr.reason || 'suppressed') };
      });
      console.group('[worldActors] visualProofState');
      console.log('proofActorCount:', proof.length, '| rendered:', rendered, '| suppressed:', suppressed);
      if (actors.length && console.table) console.table(actors); else console.log(actors);
      console.groupEnd();
      return { active: proof.length > 0, proofActorCount: proof.length, renderedCount: rendered, suppressedCount: suppressed, actors: actors };
    },
    visualProofFocus: function (actorKey) {
      var mvr = _mvr();
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (!map || typeof map.easeTo !== 'function') { console.warn('[worldActors] map unavailable'); return null; }
      var entry = _proofLineup[actorKey];
      if (!entry) { console.warn('[worldActors] no proof actor for key:', actorKey, '(run visualProofLineup first)'); return null; }
      map.easeTo({ center: [entry.lng, entry.lat], zoom: Math.max(map.getZoom(), 15) });
      console.log('[worldActors] visualProofFocus →', actorKey, 'at', entry.lat.toFixed(5), entry.lng.toFixed(5));
      return entry;
    },

    // ── 0603M Proof Stage (camera framing + DOM labels/rings) ────────────────────
    visualProofLabels: function (on) {
      on = on !== false;
      _proofLabelsEnabled = on;
      if (on) { _buildProofLabelNodes(); _startProofOverlay(); console.log('[worldActors] visualProofLabels → on'); }
      else { _removeProofOverlay(); console.log('[worldActors] visualProofLabels → off'); }
      return on;
    },
    visualProofCamera: function () {
      var mvr = _mvr();
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (!map || typeof map.easeTo !== 'function') return { ok: false, reason: 'map_unavailable' };
      var actors = _proofActors();
      if (!actors.length) return { ok: false, reason: 'no_proof_actors' };
      var sLat = 0, sLng = 0, n = 0;
      actors.forEach(function (a) { if (a.lat != null) { sLat += a.lat; sLng += a.lng; n++; } });
      if (!n) return { ok: false, reason: 'no_proof_actors' };
      map.easeTo({ center: [sLng / n, sLat / n], zoom: 16, pitch: 58, bearing: -25, duration: 700 });
      _proofCameraLastFramedAt = Date.now();
      console.log('[worldActors] visualProofCamera — framed', n, 'proof actors');
      return { ok: true, center: [sLng / n, sLat / n], zoom: 16, pitch: 58, bearing: -25 };
    },
    visualProofStage: function () {
      var self = _worldActorsDebug;
      self.visualProofLineup();
      self.visualProofLabels(true);
      var cam = self.visualProofCamera();
      global.setTimeout(function () { self.visualProofStageState(); }, 1000);
      var keys = Object.keys(_proofLineup);
      return {
        active: keys.length > 0, proofActorCount: keys.length,
        labelsEnabled: _proofLabelsEnabled, ringsEnabled: _proofLabelsEnabled,
        cameraFramed: !!(cam && cam.ok), actorKeys: keys, lastError: cam && !cam.ok ? cam.reason : null,
      };
    },
    clearVisualProofStage: function () {
      var self = _worldActorsDebug;
      var removedLabels = Object.keys(_proofLabelNodes).length;
      self.visualProofLabels(false);
      var removedProof = self.clearVisualProofLineup();
      console.log('[worldActors] clearVisualProofStage — actors', removedProof, '| labels', removedLabels);
      return { removedProofActors: removedProof, removedLabels: removedLabels, liveActorsPreserved: true };
    },
    visualProofStageState: function () {
      var tar = _tar();
      var mvr = _mvr();
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      var actors = _proofActors();
      var rendered = 0, suppressed = 0;
      var rows = actors.map(function (a) {
        var p = a._lastPayload || {};
        if (a._rendered) rendered++; else suppressed++;
        var screen = null;
        if (map && a.lat != null) { try { var pt = map.project([a.lng, a.lat]); screen = { x: Math.round(pt.x), y: Math.round(pt.y) }; } catch (e) {} }
        return { proofKey: a.metadata && a.metadata.proofKey, actorId: a.actorId, actorType: a.actorType,
          visualIdentityKey: p.visualIdentityKey, silhouetteClass: p.silhouetteClass, paletteRef: p.paletteRef,
          scaleClass: p.scaleClass, rendered: !!a._rendered, lodTier: p.lodTier, screen: screen };
      });
      var labelCount = Object.keys(_proofLabelNodes).length;
      var out = {
        active: actors.length > 0, proofActorCount: actors.length,
        renderedCount: rendered, suppressedCount: suppressed,
        labelsEnabled: _proofLabelsEnabled, overlayNodeExists: !!(_proofOverlayEl && _proofOverlayEl.parentNode),
        labelCount: labelCount, ringCount: labelCount,
        cameraLastFramedAt: _proofCameraLastFramedAt, actors: rows, lastError: null,
      };
      console.group('[worldActors] visualProofStageState');
      console.log('proofActorCount:', out.proofActorCount, '| rendered:', rendered, '| suppressed:', suppressed);
      console.log('labelsEnabled  :', out.labelsEnabled, '| labels:', labelCount, '| overlay:', out.overlayNodeExists);
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      console.groupEnd();
      return out;
    },

    // ── Actor visual identity authority (0603I) ──────────────────────────────────
    visualIdentityState: function () {
      var a = global.SBE && SBE.ActorVisualIdentityAuthority;
      if (!a) { console.warn('[worldActors] ActorVisualIdentityAuthority unavailable'); return null; }
      var s = a.getState();
      console.group('[worldActors] visualIdentityState');
      console.log('enabled        :', s.enabled, '| profileCount:', s.profileCount);
      console.log('resolvedCount  :', s.resolvedCount, '| fallbackCount:', s.fallbackCount);
      console.log('exact/type/cat/generic:', s.exactMatchCount, '/', s.actorTypeMatchCount, '/', s.categoryFallbackCount, '/', s.genericFallbackCount);
      console.log('lastError      :', s.lastError || '-');
      console.groupEnd();
      return s;
    },
    visualIdentityProfiles: function () {
      var a = global.SBE && SBE.ActorVisualIdentityAuthority;
      if (!a) { console.warn('[worldActors] ActorVisualIdentityAuthority unavailable'); return null; }
      var rows = a.listIdentityProfiles().map(function (p) {
        return { key: p.key, actorType: p.actorType, sourceId: p.sourceId || '-',
          silhouetteClass: p.silhouetteClass, paletteRef: p.paletteRef, glyphRef: p.glyphRef,
          scaleClass: p.scaleClass, priorityClass: p.priorityClass };
      });
      if (console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    visualIdentitySample: function () {
      var a = global.SBE && SBE.ActorVisualIdentityAuthority;
      var tar = global.SBE && SBE.TruthActorRuntime;
      if (!a || !tar) { console.warn('[worldActors] visual identity / runtime unavailable'); return null; }
      var rows = tar.listActors().slice(0, 20).map(function (actor) {
        var id = a.resolveIdentity(actor, actor._lastPayload || null);
        return { actorId: actor.actorId, actorType: actor.actorType, sourceId: actor.sourceId,
          visualIdentityKey: id.visualIdentityKey, silhouetteClass: id.silhouetteClass,
          paletteRef: id.paletteRef, glyphRef: id.glyphRef, scaleClass: id.scaleClass, priorityClass: id.priorityClass };
      });
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    visualIdentityResolve: function (actorId) {
      var a = global.SBE && SBE.ActorVisualIdentityAuthority;
      var tar = global.SBE && SBE.TruthActorRuntime;
      if (!a || !tar) { console.warn('[worldActors] visual identity / runtime unavailable'); return null; }
      var actor = tar.getActor(actorId);
      if (!actor) { console.warn('[worldActors] no actor for id:', actorId); return null; }
      var id = a.resolveIdentity(actor, actor._lastPayload || null);
      console.group('[worldActors] visualIdentityResolve ' + actorId);
      console.log(id);
      console.groupEnd();
      return id;
    },

    // ── Truth actor visual LOD policy (0603F) ────────────────────────────────────
    truthLODState: function () {
      var p = global.SBE && SBE.TruthActorVisualLODPolicy;
      var tar = global.SBE && SBE.TruthActorRuntime;
      if (!p) { console.warn('[worldActors] TruthActorVisualLODPolicy unavailable'); return null; }
      var s = p.getState();
      var pc = tar && typeof tar.getState === 'function' ? tar.getState().presentationCounts : null;
      console.group('[worldActors] truthLODState');
      console.log('enabled       :', s.enabled, '| profile:', s.profileName, '| debug:', s.debug);
      console.log('zoom          :', s.lastContext ? s.lastContext.zoom : '-');
      if (pc) console.log('rendered      :', pc.rendered, '| suppressed:', pc.suppressed);
      console.log('renderedByType:', s.renderedCounts);
      if (pc) console.log('byActorType   :', pc.byActorType);
      console.log('suppressReasons:', (pc && pc.byReason) || s.suppressionReasons);
      console.log('maxVisibleBy  :', s.maxVisibleByType);
      console.log('lastError     :', s.lastError || '-');
      console.groupEnd();
      return { policy: s, presentationCounts: pc };
    },
    truthLODSample: function () {
      var tar = global.SBE && SBE.TruthActorRuntime;
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var rows = tar.listActors().slice(0, 20).map(function (a) {
        var pr = a._presentation || {};
        return { actorId: a.actorId, actorType: a.actorType, sourceId: a.sourceId,
          rendered: !!a._rendered, lodTier: pr.lodTier, reason: pr.reason, priority: pr.priority,
          scaleMultiplier: pr.scaleMultiplier, opacityMultiplier: pr.opacityMultiplier };
      });
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      return rows;
    },
    truthLODEnable: function (on) {
      var p = global.SBE && SBE.TruthActorVisualLODPolicy;
      if (!p) { console.warn('[worldActors] TruthActorVisualLODPolicy unavailable'); return null; }
      return p.setEnabled(on !== false);
    },
    truthLODDebug: function (on) {
      var p = global.SBE && SBE.TruthActorVisualLODPolicy;
      if (!p) { console.warn('[worldActors] TruthActorVisualLODPolicy unavailable'); return null; }
      return p.setDebug(on !== false);
    },
    truthLODProfile: function (name) {
      var p = global.SBE && SBE.TruthActorVisualLODPolicy;
      if (!p) { console.warn('[worldActors] TruthActorVisualLODPolicy unavailable'); return null; }
      return p.setProfile(name);
    },

    citibikeRenderBridgeSample: function () {
      var tar = global.SBE && SBE.TruthActorRuntime;
      var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
      if (!tar) { console.warn('[worldActors] TruthActorRuntime unavailable'); return null; }
      var wslIds = {};
      if (wsl && typeof wsl.getState === 'function') {
        (wsl.getState().vehicles || []).forEach(function (v) { wslIds[v.id] = v; });
      }
      var rows = tar.listActors().filter(function (a) { return a.actorType === 'bike.station'; })
        .slice(0, 10).map(function (a) {
          var vis = a._visual || {};
          var wv = wslIds[a.actorId];
          return { actorId: a.actorId, stationId: a.metadata && a.metadata.stationId, label: a.label,
            visualState: vis.state, variant: vis.variant, scale: vis.scale, opacity: vis.opacity,
            paletteRef: vis.paletteRef, glyphRef: vis.glyphRef,
            rendered: !!a._rendered, shape: wv ? wv.actorType : '-' };
        });
      if (rows.length && console.table) console.table(rows); else console.log(rows);
      return rows;
    },
  };

  // ── Bind ──────────────────────────────────────────────────────────────────────

  function _bind() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.worldVehicles = _debugObj;
    global._wos.debug.worldActors   = _worldActorsDebug;
  }
  _bind();
  global.setTimeout(_bind, 300);
  global.setTimeout(_bind, 1000);
  global.setTimeout(_bind, 2500);

  console.log('[WorldSpaceVehicleDebug] loaded — _wos.debug.worldVehicles');

})(window);
