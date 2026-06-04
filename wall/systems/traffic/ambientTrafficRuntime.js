// ── AmbientTrafficRuntime v1.0.0 ──────────────────────────────────────────────
// 0602K_WOS_AmbientTrafficRuntime_v1.0.0
// Status: active
// Classification: world-runtime (atmospheric life)
//
// Persistent low-density ambient traffic that starts with Drive mode and keeps
// the world alive WITHOUT collision, lane-blocking, clutter, or navigation
// authority. Maintains 1–3 actors near the hero that enter/exit via fade and
// recycle as the hero travels. Never modifies the hero, camera, or Mapbox style.
//
// Authority:
//   OWNS: ambient_traffic_* actors (spawn / move / fade / recycle)
//   READS: HeroVehicleRuntime.getEntity(), MapboxViewportRuntime.getMap()
//   USES: WorldSpaceVehicleLayer.upsertVehicle / removeVehicle / setActorOpacity
//   MUST NOT MUTATE: hero state, route, camera, style, world transforms
//
// Placement: wall/systems/traffic/ambientTrafficRuntime.js
// Load: AFTER worldSpaceVehicleLayer.js and heroVehicleRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.6.0';

  // ── Tunables ──────────────────────────────────────────────────────────────────
  var MAX_VISIBLE_ACTORS    = 3;
  var MIN_VISIBLE_ACTORS    = 0;   // 0602L — 0 clean actors beats 1 bad actor
  var TARGET_VISIBLE_ACTORS = 2;

  var HERO_CORRIDOR_FORWARD_M    = 60;
  var HERO_CORRIDOR_BACK_M       = 8;
  var HERO_CORRIDOR_HALF_WIDTH_M = 8;
  var HERO_DIRECTION_REJECT_DEG  = 45;

  // 0602L — visual scale authority (match hero readability family).
  var AMBIENT_CAR_SCALE      = 1.75;
  var AMBIENT_TRUCK_SCALE    = 1.85;
  var AMBIENT_SCALE_VARIANCE = 0.08;

  // 0602L — offscreen entry bands (cars enter from outside the camera scene).
  var SPAWN_ENTRY_MIN_SCREEN_MARGIN_PX = 40;    // 0602M — widened entry band
  var SPAWN_ENTRY_MAX_SCREEN_MARGIN_PX = 420;
  var SPAWN_ENTRY_MIN_HERO_DISTANCE_M  = 80;
  var SPAWN_ENTRY_MAX_HERO_DISTANCE_M  = 260;
  var HERO_EXCLUSION_RADIUS_M          = 42;
  var VISIBLE_FALLBACK_MIN_HERO_M      = 160;   // 0602M — visible fallback only ≥160m

  // 0602L — stronger separation (sparse, no clusters).
  var MIN_ACTOR_SEPARATION_M      = 42;
  var MIN_SAME_ROAD_SEPARATION_M  = 70;
  var RUNTIME_CROWD_SEPARATION_M  = 28;   // recycle when actors drift this close

  var FADE_IN_MS  = 500;   // 0602L — edge blend, not teleport cover
  var FADE_OUT_MS = 600;
  var ONSCREEN_MIN_OPACITY = 0.65;        // clamp once meaningfully visible

  var AMBIENT_SPEED_MPS_MIN = 5;
  var AMBIENT_SPEED_MPS_MAX = 9;

  var DESPAWN_DISTANCE_M = 260;   // 0602P — was 180 (less eager despawn)
  var OFFSCREEN_GRACE_MS = 5000;  // 0602P — was 2500 (survive brief framing changes)

  // 0602P — persistent presence, safe-mode auto-release, lane-side authority,
  // predictive anti-ghosting spacing, and a replacement queue.
  var SAFE_MODE_RELEASE_MS    = 9000;
  var PRESENCE_MIN_ACTORS     = 1;
  var PRESENCE_TARGET_ACTORS  = 2;
  var PRESENCE_MAX_ACTORS     = 3;
  var EMPTY_RECOVERY_AFTER_MS = 4000;

  var TRAFFIC_SIDE  = 'right';
  var LANE_OFFSET_M = 3.2;
  var LANE_JITTER_M = 0.35;

  var SAME_ROAD_FUTURE_SEPARATION_M  = 34;
  var CROSS_ROAD_FUTURE_SEPARATION_M = 24;
  var RUNTIME_COLLISION_RECYCLE_M    = 18;
  var SAME_FLOW_RUNTIME_SPACING_M    = 45;

  var REPLACEMENT_EXPIRE_MS = 12000;

  var MAINTENANCE_INTERVAL_MS = 700;   // spawn/recycle evaluation cadence
  var MIN_ROAD_LEN_M = 80;

  // 0602O — non-blocking startup + frame-budget protection.
  var STARTUP_DELAY_MS            = 1500;  // no heavy work until this elapses post-start
  var STARTUP_SAFE_TARGET         = 1;     // gentle target during the startup window
  var STARTUP_BUDGET_MS           = 3.5;   // maintenance time budget during startup
  var STEADY_BUDGET_MS            = 4.5;   // maintenance time budget steady-state
  var ROAD_CACHE_TTL_MS           = 2500;  // reuse a road scan for this long
  var MAX_ROADS_PER_SCAN          = 24;    // cap roads kept per scan
  var MAX_CANDIDATES_PER_MAINTAIN = 28;    // cap candidates scored per cycle
  var FREEZE_FRAME_MS             = 80;    // a frame longer than this is a "strike"
  var FREEZE_STRIKE_LIMIT         = 2;     // strikes before auto-disable

  var SPECS = [
    { variant: 'sedan_dark',  actorType: 'traffic_car' },
    { variant: 'sedan_light', actorType: 'traffic_car' },
    { variant: 'taxi_yellow', actorType: 'traffic_car' },
    { variant: 'sedan_red',   actorType: 'traffic_car' },
    { variant: 'clean_white', actorType: 'box_truck'   },
  ];

  // ── Runtime state ─────────────────────────────────────────────────────────────
  var _active     = false;
  var _enabled    = true;
  var _debug      = false;
  var _rafId      = null;
  var _lastRafMs  = 0;
  var _lastMaintAt = 0;
  var _targetCount = TARGET_VISIBLE_ACTORS;
  var _maxActors   = MAX_VISIBLE_ACTORS;
  var _idCounter   = 0;

  // 0602N — startup watchdog + starvation + two-stage recovery.
  var _watchdogTimer        = null;
  var _lastStartupReadiness = null;
  var _stageAFailStreak     = 0;       // consecutive maintenance cycles with no edge spawn
  var STAGE_B_AFTER_STREAK  = 3;       // allow distant visible entry after N failures
  var STAGE_B_MIN_HERO_M    = 180;     // distant visible entry: ≥180m from hero
  var STAGE_B_MIN_SEPAR_M   = 60;      // distant visible entry: ≥60m from other actors
  var STARVATION_AFTER_MS   = 3000;    // below-min for this long → starving
  var _starvation = { active: false, cycles: 0, ms: 0, fallbackVisibleAllowed: false, _sinceMs: null };

  // 0602O — startup arming + road cache + performance/freeze accounting.
  var _safeMode       = false;
  var _startupArmedAt = 0;
  var _roadCache = { roads: [], at: 0, zoom: null, centerKey: null };
  var _perf = {
    lastMaintainMs: 0, maxMaintainMs: 0,
    lastRoadScanMs: 0, maxRoadScanMs: 0,
    freezeStrikes: 0, autoDisabled: false, lastAutoDisableReason: null,
  };
  function _budgetExceeded(startMs, budgetMs) { return (_now() - startMs) >= budgetMs; }

  var _actors = [];   // { id, actorType, variant, pts, meta, dist, speedMs, flowSign,
                      //   laneOffsetM, state, stateStart, lastOnScreenMs }

  var _stats = {
    lastSpawnAt: null, lastRecycleAt: null,
    spawnAttempts: 0, spawnRejects: 0, recycleCount: 0,
    lastError: null,
  };

  // 0602M — structured spawn-rejection accounting (so the band can be tuned).
  var _rejectStats = {
    noRoads: 0, building: 0, heroExclusion: 0,
    heroDistanceNear: 0, heroDistanceFar: 0,
    heroCorridor: 0, futureCorridor: 0,
    actorSpacing: 0, sameRoadSpacing: 0,
    screenEntryBand: 0, visibleFallbackDenied: 0,
    invalidGeometry: 0, exhaustedCandidates: 0,
    futureActorSpacing: 0,
  };
  // 0602P — presence/continuity tracking.
  var _presence = {
    emptySinceMs: null,
    safeModeReleased: false,
    pendingReplacementCount: 0,
    pendingReplacementSinceMs: null,
    lastSuccessfulSpawnMode: null,
    lastRecycleReason: null,
  };
  function _reject(reason) {
    _stats.spawnRejects++;
    if (_rejectStats[reason] == null) _rejectStats[reason] = 0;
    _rejectStats[reason]++;
  }

  // ── Dependency accessors ──────────────────────────────────────────────────────
  function _wsl() { return SBE.WorldSpaceVehicleLayer; }
  function _hero() {
    try {
      var hrt = SBE.HeroVehicleRuntime;
      if (hrt && typeof hrt.getEntity === 'function') {
        var e = hrt.getEntity();
        if (e && e.active && e.lat != null) return { active: true, lat: e.lat, lng: e.lng, headingDeg: e.headingDeg || 0 };
      }
    } catch (e) {}
    return { active: false, lat: 0, lng: 0, headingDeg: 0 };
  }
  function _map() {
    try {
      var mvr = SBE.MapboxViewportRuntime;
      return mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    } catch (e) { return null; }
  }

  function _assign(dst, src) { for (var k in src) if (src.hasOwnProperty(k)) dst[k] = src[k]; return dst; }

  // 0602N — startup readiness. Soft checks only; unavailable dependency checks are
  // treated as "unknown/pass" rather than failing hard.
  function _readStartupReadiness() {
    var out = { ready: false, mapReady: false, heroReady: false, layerReady: false,
                layerEnabled: false, renderReady: false, reason: 'ready' };
    if (!_active)  { out.reason = 'runtime_inactive';  return out; }
    if (!_enabled) { out.reason = 'runtime_disabled';  return out; }

    var wsl = _wsl();
    out.layerReady = !!wsl;
    if (!wsl) { out.reason = 'layer_missing'; return out; }
    // Optional checks — only enforce if the method exists.
    out.layerEnabled = (typeof wsl.getEnabled === 'function') ? !!wsl.getEnabled() : true;
    if (typeof wsl.getEnabled === 'function' && !out.layerEnabled) { out.reason = 'layer_disabled'; return out; }
    out.renderReady = (typeof wsl.isRenderReady === 'function') ? !!wsl.isRenderReady() : true;
    if (typeof wsl.isRenderReady === 'function' && !out.renderReady) { out.reason = 'layer_not_render_ready'; return out; }

    var map = _map();
    out.mapReady = !!(map && (typeof map.loaded !== 'function' || map.loaded()));
    if (!map) { out.reason = 'map_missing'; return out; }
    if (typeof map.loaded === 'function' && !map.loaded()) { out.reason = 'map_not_loaded'; return out; }

    out.heroReady = _hero().active;
    if (!out.heroReady) { out.reason = 'hero_missing'; return out; }

    out.ready = true; out.reason = 'ready';
    return out;
  }

  // ── Geometry helpers ──────────────────────────────────────────────────────────
  function _haversineM(lat1, lng1, lat2, lng2) {
    var R = 6371000, toR = Math.PI / 180;
    var dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function _angleDiffDeg(a, b) { return Math.abs((((a - b) % 360) + 540) % 360 - 180); }
  function _offsetLatLng(lat, lng, northM, eastM) {
    var mLat = 111320, mLng = 111320 * Math.cos(lat * Math.PI / 180);
    return { lat: lat + northM / mLat, lng: lng + eastM / mLng };
  }
  function _looksLikeLngLat(c) { return c && c.length >= 2 && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90; }

  function _projectRelativeToHero(hero, point) {
    var mLat = 111320, mLng = 111320 * Math.cos((hero.lat || 0) * Math.PI / 180);
    var dN = (point.lat - hero.lat) * mLat, dE = (point.lng - hero.lng) * mLng;
    var h = (hero.headingDeg || 0) * Math.PI / 180;
    return {
      forwardM: dN * Math.cos(h) + dE * Math.sin(h),
      lateralM: -dN * Math.sin(h) + dE * Math.cos(h),
      distanceM: Math.sqrt(dN * dN + dE * dE),
    };
  }
  function _isInsideHeroForwardCorridor(hero, point, headingDeg) {
    if (!hero || !hero.active) return false;
    var rel = _projectRelativeToHero(hero, point);
    var sameDir = _angleDiffDeg(hero.headingDeg || 0, headingDeg) <= HERO_DIRECTION_REJECT_DEG;
    return rel.forwardM >= -HERO_CORRIDOR_BACK_M &&
           rel.forwardM <= HERO_CORRIDOR_FORWARD_M &&
           Math.abs(rel.lateralM) <= HERO_CORRIDOR_HALF_WIDTH_M && sameDir;
  }

  // ── Road sampling (self-contained; production — no grid fallback) ──────────────
  function _polylineSegs(pts) {
    var segs = [], total = 0;
    for (var i = 0; i < pts.length - 1; i++) {
      var d = _haversineM(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
      segs.push({ start: total, len: d }); total += d;
    }
    return { segs: segs, total: total };
  }
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
        return {
          lng: a.lng + (b.lng - a.lng) * f,
          lat: a.lat + (b.lat - a.lat) * f,
          headingDeg: Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180 / Math.PI,
        };
      }
    }
    var last = pts[pts.length - 1];
    return { lng: last.lng, lat: last.lat, headingDeg: 0 };
  }
  function _featureCoords(f) {
    if (!f || !f.geometry) return [];
    if (f.geometry.type === 'LineString') return [f.geometry.coordinates || []];
    if (f.geometry.type === 'MultiLineString') return f.geometry.coordinates || [];
    return [];
  }
  function _pointOnBuilding(map, lng, lat) {
    var pt; try { pt = map.project([lng, lat]); } catch (e) { return false; }
    var feats; try { feats = map.queryRenderedFeatures([pt.x, pt.y]); } catch (e) { return false; }
    for (var i = 0; i < (feats || []).length; i++) {
      var lyr = feats[i].layer || {};
      if (lyr.type === 'fill-extrusion' || /building/i.test(lyr.id || '')) return true;
    }
    return false;
  }

  // Returns quality road polylines (in lng/lat) within the viewport, length-sorted.
  function _sampleRoads(map) {
    if (!map || typeof map.queryRenderedFeatures !== 'function') return [];
    var canvas = map.getCanvas();
    var w = canvas.clientWidth, h = canvas.clientHeight;
    var bbox = [[Math.round(w * 0.08), Math.round(h * 0.08)], [Math.round(w * 0.92), Math.round(h * 0.92)]];
    var feats; try { feats = map.queryRenderedFeatures(bbox); } catch (e) { return []; }
    var rx = /road|street|motorway|trunk|primary|secondary|tertiary|residential|highway|link/i;
    var out = [];
    (feats || []).forEach(function (f) {
      var t = f.geometry && f.geometry.type;
      var lid = (f.layer && f.layer.id) || '';
      if ((t !== 'LineString' && t !== 'MultiLineString') || !rx.test(lid)) return;
      _featureCoords(f).forEach(function (line) {
        if (!line || line.length < 2) return;
        var pts = [];
        for (var i = 0; i < line.length; i++) {
          var c = line[i], ll;
          if (_looksLikeLngLat(c)) ll = { lng: c[0], lat: c[1] };
          else { try { var u = map.unproject(c); ll = { lng: u.lng, lat: u.lat }; } catch (e) { return; } }
          pts.push(ll);
        }
        if (pts.length < 2) return;
        var meta = _polylineSegs(pts);
        if (meta.total < MIN_ROAD_LEN_M) return;
        out.push({ pts: pts, meta: meta, layerId: lid,
          layerType: (f.layer && f.layer.type) ? f.layer.type : null,
          properties: f.properties || {} });
      });
    });
    out.sort(function (a, b) { return b.meta.total - a.meta.total; });
    out.forEach(function (r, i) { r.index = i; });   // stable roadKey index
    return out;
  }

  // 0602O — budgeted road scan: smaller bbox during startup, capped road count,
  // stops converting features once the time budget is spent. Returns what it has.
  function _sampleRoadsBudgeted(map, budgetMs, startup) {
    if (!map || typeof map.queryRenderedFeatures !== 'function') return [];
    var t0 = _now();
    var canvas = map.getCanvas();
    var w = canvas.clientWidth, h = canvas.clientHeight;
    // Tighter center region during startup keeps the query + conversion cheap.
    var inset = startup ? 0.25 : 0.08;
    var bbox = [[Math.round(w * inset), Math.round(h * inset)],
                [Math.round(w * (1 - inset)), Math.round(h * (1 - inset))]];
    var feats; try { feats = map.queryRenderedFeatures(bbox); } catch (e) { return []; }
    var rx = /road|street|motorway|trunk|primary|secondary|tertiary|residential|highway|link/i;
    var out = [];
    for (var fi = 0; fi < (feats || []).length; fi++) {
      if (out.length >= MAX_ROADS_PER_SCAN) break;
      if (_budgetExceeded(t0, budgetMs)) break;
      var f = feats[fi];
      var t = f.geometry && f.geometry.type;
      var lid = (f.layer && f.layer.id) || '';
      if ((t !== 'LineString' && t !== 'MultiLineString') || !rx.test(lid)) continue;
      var lines = _featureCoords(f);
      for (var li = 0; li < lines.length; li++) {
        if (out.length >= MAX_ROADS_PER_SCAN) break;
        var line = lines[li];
        if (!line || line.length < 2) continue;
        var pts = [], bad = false;
        for (var i = 0; i < line.length; i++) {
          var c = line[i], ll;
          if (_looksLikeLngLat(c)) ll = { lng: c[0], lat: c[1] };
          else { try { var u = map.unproject(c); ll = { lng: u.lng, lat: u.lat }; } catch (e2) { bad = true; break; } }
          pts.push(ll);
        }
        if (bad || pts.length < 2) continue;
        var meta = _polylineSegs(pts);
        if (meta.total < MIN_ROAD_LEN_M) continue;
        out.push({ pts: pts, meta: meta, layerId: lid,
          layerType: (f.layer && f.layer.type) ? f.layer.type : null,
          properties: f.properties || {} });
      }
    }
    // Sort only the capped list (cheap), assign stable index.
    out.sort(function (a, b) { return b.meta.total - a.meta.total; });
    out.forEach(function (r, i) { r.index = i; });
    return out;
  }

  function _roadCacheKey(map) {
    try {
      var c = map.getCenter(); var z = map.getZoom();
      return Math.round(c.lng * 100) + ':' + Math.round(c.lat * 100) + ':' + Math.round(z * 10);
    } catch (e) { return 'unknown'; }
  }

  // Cached road access — reuses a recent scan for the same camera key within TTL.
  function _getCachedRoads(map, budgetMs, startup) {
    var t = _now();
    var key = _roadCacheKey(map);
    if (_roadCache.roads.length && _roadCache.centerKey === key && (t - _roadCache.at) < ROAD_CACHE_TTL_MS) {
      return _roadCache.roads;
    }
    var scanStart = _now();
    var roads = _sampleRoadsBudgeted(map, budgetMs, startup);
    _perf.lastRoadScanMs = _now() - scanStart;
    _perf.maxRoadScanMs = Math.max(_perf.maxRoadScanMs, _perf.lastRoadScanMs);
    _roadCache = { roads: roads, at: _now(), zoom: null, centerKey: key };
    return roads;
  }

  // ── 0602L helpers ─────────────────────────────────────────────────────────────
  function _resolveActorScale(actorType) {
    var base = actorType === 'box_truck' ? AMBIENT_TRUCK_SCALE : AMBIENT_CAR_SCALE;
    return base + _rand(-AMBIENT_SCALE_VARIANCE, AMBIENT_SCALE_VARIANCE);
  }

  function _isInsideHeroExclusion(hero, lat, lng) {
    return hero.active && _haversineM(hero.lat, hero.lng, lat, lng) < HERO_EXCLUSION_RADIUS_M;
  }

  // ── 0602Q road-authority inference (diagnostic only; never rejects/changes) ────
  function _resolveRoadClass(layerId, properties) {
    var id = (layerId || '').toLowerCase();
    var p = properties || {};
    var cls = String(p.class || p.road_class || p.type || '').toLowerCase();
    var src = id + ' ' + cls;
    if (/motorway|freeway|expressway|interstate/.test(src)) return 'motorway';
    if (/trunk/.test(src)) return 'trunk';
    if (/primary/.test(src)) return 'primary';
    if (/secondary/.test(src)) return 'secondary';
    if (/tertiary/.test(src)) return 'tertiary';
    if (/residential/.test(src)) return 'residential';
    if (/service/.test(src)) return 'service';
    if (/street|road|local/.test(src)) return 'local';
    return 'unknown';
  }
  function _resolveGradeHint(layerId, properties) {
    var id = (layerId || '').toLowerCase();
    var p = properties || {};
    var src = id + ' ' + JSON.stringify(p).toLowerCase();
    if (/tunnel/.test(src)) return 'tunnel';
    if (/bridge|overpass/.test(src)) return 'bridge';
    if (/ramp|link/.test(src)) return 'ramp';
    if (/surface|street|road|primary|secondary|tertiary|residential/.test(src)) return 'surface';
    return 'unknown';
  }
  function _resolveDirectionHint(properties) {
    var p = properties || {};
    var oneWay = p.oneway != null ? String(p.oneway).toLowerCase() : '';
    if (oneWay === 'true' || oneWay === '1' || oneWay === 'yes') return 'oneWay';
    if (oneWay === 'false' || oneWay === '0' || oneWay === 'no') return 'twoWay';
    return 'unknown';
  }

  // ── 0602P lane-side authority ─────────────────────────────────────────────────
  // Deterministic side from the FINAL travel direction (never random). Right-hand
  // traffic: forward flow → right lane; reverse flow → its own right relative to
  // reverse travel. So opposing actors sit on opposite lateral sides of the road.
  function _resolveLaneSide(flowSign) {
    if (TRAFFIC_SIDE === 'left') return flowSign >= 0 ? -1 : 1;
    return flowSign >= 0 ? 1 : -1;
  }
  function _resolveLaneOffsetM(flowSign) {
    return _resolveLaneSide(flowSign) * (LANE_OFFSET_M + _rand(-LANE_JITTER_M, LANE_JITTER_M));
  }

  // ── 0602P predictive (anti-ghosting) spacing ──────────────────────────────────
  // Position an actor would occupy `seconds` ahead, including lane offset.
  function _predictActorPoint(road, dist, flowSign, laneOffsetM, seconds, speedMs) {
    var raw = dist + flowSign * speedMs * seconds;
    var wrapped = ((raw % road.meta.total) + road.meta.total) % road.meta.total;
    var pos = _interpPolyline(road.pts, road.meta, wrapped);
    var hdg = flowSign >= 0 ? pos.headingDeg : (pos.headingDeg + 180) % 360;
    var perp = (hdg + 90) * Math.PI / 180;
    var off = _offsetLatLng(pos.lat, pos.lng, laneOffsetM * Math.cos(perp), laneOffsetM * Math.sin(perp));
    return { lat: off.lat, lng: off.lng, headingDeg: hdg };
  }
  // True if a candidate's short future capsule conflicts with any live actor's.
  function _futureSpacingBlocked(candidate) {
    var checks = [0, 2.5, 5.0];
    for (var i = 0; i < _actors.length; i++) {
      var actor = _actors[i];
      if (actor.state === 'fadingOut' || actor._lastLat == null) continue;
      var limit = (actor.roadKey === candidate.roadKey) ? SAME_ROAD_FUTURE_SEPARATION_M : CROSS_ROAD_FUTURE_SEPARATION_M;
      for (var c = 0; c < checks.length; c++) {
        var cand = _predictActorPoint(candidate.road, candidate.dist, candidate.flowSign, candidate.laneOffsetM, checks[c], candidate.speedMs);
        var other = _predictActorPoint({ pts: actor.pts, meta: actor.meta }, actor.dist, actor.flowSign, actor.laneOffsetM, checks[c], actor.speedMs);
        if (_haversineM(cand.lat, cand.lng, other.lat, other.lng) < limit) { _reject('futureActorSpacing'); return true; }
      }
    }
    return false;
  }
  // Runtime spacing recycle reason (soft separation, not collision). Only the
  // NEWER of the two converging actors is recycled, so one always survives.
  function _findRuntimeSpacingRecycle(actor) {
    for (var i = 0; i < _actors.length; i++) {
      var other = _actors[i];
      if (other === actor || other.state === 'fadingOut') continue;
      if (other._lastLat == null || actor._lastLat == null) continue;
      var newer = (actor._spawnedAt || 0) >= (other._spawnedAt || 0);
      if (!newer) continue;   // let the older actor be the one that survives
      var dist = _haversineM(actor._lastLat, actor._lastLng, other._lastLat, other._lastLng);
      if (dist < RUNTIME_COLLISION_RECYCLE_M) return 'runtime_collision_spacing';
      if (actor.roadKey === other.roadKey && actor.flowSign === other.flowSign && dist < SAME_FLOW_RUNTIME_SPACING_M) return 'same_flow_spacing';
    }
    return null;
  }

  // ── 0602P replacement queue ───────────────────────────────────────────────────
  function _enqueueReplacement() {
    _presence.pendingReplacementCount = Math.min(3, _presence.pendingReplacementCount + 1);
    _presence.pendingReplacementSinceMs = _now();
  }
  function _pruneReplacementQueue() {
    if (!_presence.pendingReplacementSinceMs) return;
    if ((_now() - _presence.pendingReplacementSinceMs) > REPLACEMENT_EXPIRE_MS) {
      _presence.pendingReplacementCount = 0;
      _presence.pendingReplacementSinceMs = null;
    }
  }
  function _consumeReplacement() {
    if (_presence.pendingReplacementCount > 0) {
      _presence.pendingReplacementCount--;
      if (_presence.pendingReplacementCount === 0) _presence.pendingReplacementSinceMs = null;
    }
  }

  // ── 0602P safe-mode auto-release ──────────────────────────────────────────────
  function _maybeReleaseSafeMode(hero, wsl) {
    if (!_safeMode || _presence.safeModeReleased) return;
    if (!_startupArmedAt) return;
    if ((_now() - _startupArmedAt) < SAFE_MODE_RELEASE_MS) return;
    if (!hero || !hero.active) return;
    if (wsl && typeof wsl.isRenderReady === 'function' && !wsl.isRenderReady()) return;
    if (_perf.freezeStrikes > 0 || _perf.autoDisabled) return;
    _safeMode = false;
    _presence.safeModeReleased = true;
    console.log('[AmbientTrafficRuntime] safeMode auto-released → normal presence (target ' + PRESENCE_TARGET_ACTORS + ')');
  }

  // True only when the projected point is OUTSIDE the viewport but within the
  // natural entry margin band (80–260px beyond the edge).
  function _screenEntryBand(map, lng, lat) {
    if (!map) return false;
    var p; try { p = map.project([lng, lat]); } catch (e) { return false; }
    var c = map.getCanvas();
    var w = c.clientWidth, h = c.clientHeight;
    var inside = p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
    if (inside) return false;
    // distance outside the nearest viewport edge
    var dx = p.x < 0 ? -p.x : (p.x > w ? p.x - w : 0);
    var dy = p.y < 0 ? -p.y : (p.y > h ? p.y - h : 0);
    var edgeDist = Math.sqrt(dx * dx + dy * dy);
    return edgeDist >= SPAWN_ENTRY_MIN_SCREEN_MARGIN_PX &&
           edgeDist <= SPAWN_ENTRY_MAX_SCREEN_MARGIN_PX;
  }

  // ── Spawn ─────────────────────────────────────────────────────────────────────
  function _rand(a, b) { return a + Math.random() * (b - a); }

  function _tooCloseToOtherActor(lat, lng, roadKey) {
    for (var i = 0; i < _actors.length; i++) {
      var a = _actors[i];
      if (a._lastLat == null) continue;
      var dist = _haversineM(lat, lng, a._lastLat, a._lastLng);
      if (dist < MIN_ACTOR_SEPARATION_M) return true;
      if (roadKey && a.roadKey === roadKey && dist < MIN_SAME_ROAD_SEPARATION_M) return true;
    }
    return false;
  }

  function _withinAnyActor(lat, lng, radiusM) {
    for (var i = 0; i < _actors.length; i++) {
      var a = _actors[i];
      if (a._lastLat == null) continue;
      if (_haversineM(lat, lng, a._lastLat, a._lastLng) < radiusM) return true;
    }
    return false;
  }

  // Same check, but records the specific rejection reason. Returns true if blocked.
  function _tooCloseToOtherActorReason(lat, lng, roadKey) {
    for (var i = 0; i < _actors.length; i++) {
      var a = _actors[i];
      if (a._lastLat == null) continue;
      var dist = _haversineM(lat, lng, a._lastLat, a._lastLng);
      if (dist < MIN_ACTOR_SEPARATION_M) { _reject('actorSpacing'); return true; }
      if (roadKey && a.roadKey === roadKey && dist < MIN_SAME_ROAD_SEPARATION_M) { _reject('sameRoadSpacing'); return true; }
    }
    return false;
  }

  // Validate one sample point on a road; returns a scored candidate or null
  // (recording the rejection reason). Shared by full + budgeted collectors.
  function _evalSample(map, hero, road, d, k, opts) {
    var roadKey = road.layerId + ':' + road.index;
    var pos = _interpPolyline(road.pts, road.meta, d);
    if (pos == null || pos.lat == null) { _reject('invalidGeometry'); return null; }

    var fwdHdg = pos.headingDeg, revHdg = (pos.headingDeg + 180) % 360;
    var flowSign = 1, travelHdg = fwdHdg;
    if (hero.active && _angleDiffDeg(hero.headingDeg, revHdg) > _angleDiffDeg(hero.headingDeg, fwdHdg)) {
      flowSign = -1; travelHdg = revHdg;
    }
    // 0602P — deterministic lane side from final travel direction (never random).
    var lane = _resolveLaneOffsetM(flowSign);
    var speedMs = _rand(AMBIENT_SPEED_MPS_MIN, AMBIENT_SPEED_MPS_MAX);
    var perp = (travelHdg + 90) * Math.PI / 180;
    var off = _offsetLatLng(pos.lat, pos.lng, lane * Math.cos(perp), lane * Math.sin(perp));

    if (_pointOnBuilding(map, off.lng, off.lat)) { _reject('building'); return null; }
    if (_isInsideHeroExclusion(hero, off.lat, off.lng)) { _reject('heroExclusion'); return null; }

    var heroDistanceM = hero.active ? _haversineM(hero.lat, hero.lng, off.lat, off.lng) : 9999;
    if (hero.active) {
      if (heroDistanceM < SPAWN_ENTRY_MIN_HERO_DISTANCE_M) { _reject('heroDistanceNear'); return null; }
      if (heroDistanceM > SPAWN_ENTRY_MAX_HERO_DISTANCE_M) { _reject('heroDistanceFar'); return null; }
      if (_isInsideHeroForwardCorridor(hero, { lat: off.lat, lng: off.lng }, travelHdg)) { _reject('heroCorridor'); return null; }
      var fRaw = d + flowSign * 7 * 2;
      var fd = ((fRaw % road.meta.total) + road.meta.total) % road.meta.total;
      var fpos = _interpPolyline(road.pts, road.meta, fd);
      var fHdg = flowSign >= 0 ? fpos.headingDeg : (fpos.headingDeg + 180) % 360;
      var fperp = (fHdg + 90) * Math.PI / 180;
      var foff = _offsetLatLng(fpos.lat, fpos.lng, lane * Math.cos(fperp), lane * Math.sin(fperp));
      if (_isInsideHeroForwardCorridor(hero, { lat: foff.lat, lng: foff.lng }, fHdg)) { _reject('futureCorridor'); return null; }
    }
    if (_tooCloseToOtherActorReason(off.lat, off.lng, roadKey)) return null;

    // 0602P — predictive anti-ghosting: reject if our short future capsule would
    // converge with a live actor's (same-road 34m / cross-road 24m).
    if (_futureSpacingBlocked({ road: road, roadKey: roadKey, dist: d, flowSign: flowSign, laneOffsetM: lane, speedMs: speedMs })) return null;

    var screenEntry = _screenEntryBand(map, off.lng, off.lat);
    var onScreen    = _isOnScreen(map, off.lng, off.lat);
    if (!screenEntry) {
      if (!opts.allowVisibleFallback) { _reject('screenEntryBand'); return null; }
      var minHero = opts.stageB ? STAGE_B_MIN_HERO_M : VISIBLE_FALLBACK_MIN_HERO_M;
      if (!(heroDistanceM >= minHero)) { _reject('visibleFallbackDenied'); return null; }
      if (opts.stageB && _withinAnyActor(off.lat, off.lng, STAGE_B_MIN_SEPAR_M)) { _reject('visibleFallbackDenied'); return null; }
    }

    var score = 0;
    if (screenEntry) score += 100;
    if (heroDistanceM >= 120 && heroDistanceM <= 200) score += 30;
    if (hero.active && _angleDiffDeg(hero.headingDeg, travelHdg) >= 135) score += 20;
    score -= Math.abs(heroDistanceM - 160) * 0.1;
    score += Math.random() * 5;

    return {
      road: road, roadKey: roadKey, dist: d,
      lat: off.lat, lng: off.lng, headingDeg: travelHdg, baseHeadingDeg: pos.headingDeg,
      flowSign: flowSign, laneOffsetM: lane, laneSide: _resolveLaneSide(flowSign), speedMs: speedMs,
      heroDistanceM: heroDistanceM, screenEntry: screenEntry, onScreen: onScreen,
      visibleFallback: !screenEntry, score: score,
    };
  }

  // 0602M — full scan (used by manual/forced debug paths). Best-first sorted.
  function _collectSpawnCandidates(map, hero, roads, opts) {
    opts = opts || {};
    if (!roads.length) { _reject('noRoads'); return []; }
    var out = [];
    for (var r = 0; r < roads.length; r++) {
      var road = roads[r];
      var nSamples = Math.max(5, Math.min(12, Math.round(road.meta.total / 60)));
      for (var k = 0; k < nSamples; k++) {
        var c = _evalSample(map, hero, road, road.meta.total * ((k + 0.5) / nSamples), k, opts);
        if (c) out.push(c);
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  // 0602O — budgeted scan for the runtime path: limited roads, fewer samples in
  // startup, capped candidate count, stops on time budget, returns first-safe-fast.
  function _collectSpawnCandidatesBudgeted(map, hero, roads, opts) {
    opts = opts || {};
    if (!roads.length) { _reject('noRoads'); return []; }
    var t0 = _now();
    var budgetMs = opts.budgetMs || STEADY_BUDGET_MS;
    var samplesPerRoad = opts.startup ? 3 : 5;
    var out = [];
    for (var r = 0; r < roads.length; r++) {
      if (_budgetExceeded(t0, budgetMs)) break;
      if (out.length >= MAX_CANDIDATES_PER_MAINTAIN) break;
      var road = roads[r];
      for (var k = 0; k < samplesPerRoad; k++) {
        if (_budgetExceeded(t0, budgetMs)) break;
        var c = _evalSample(map, hero, road, road.meta.total * ((k + 0.5) / samplesPerRoad), k, opts);
        if (!c) continue;
        out.push(c);
        // First safe edge candidate is good enough — bail early to save the frame.
        if (c.screenEntry) return out;
        if (out.length >= MAX_CANDIDATES_PER_MAINTAIN) break;
      }
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  // Build an actor from a chosen candidate. Visible-fallback candidates spawn at
  // opacity 1 (no ghost fade inside the scene); edge entries fade in from 0.
  function _spawnCandidate(c) {
    var spec = SPECS[Math.floor(Math.random() * SPECS.length)];
    _idCounter++;
    var id = 'ambient_traffic_' + ('00' + _idCounter).slice(-3);
    var visibleFallback = !!(c.visibleFallback && c.onScreen);
    var actor = {
      id: id, actorType: spec.actorType, variant: spec.variant,
      pts: c.road.pts, meta: c.road.meta,
      dist: c.dist, speedMs: c.speedMs || _rand(AMBIENT_SPEED_MPS_MIN, AMBIENT_SPEED_MPS_MAX),
      flowSign: c.flowSign, laneOffsetM: c.laneOffsetM,
      laneSide: (c.laneSide != null ? c.laneSide : _resolveLaneSide(c.flowSign)),
      travelHeadingDeg: c.headingDeg, baseHeadingDeg: c.baseHeadingDeg,
      spawnMode: visibleFallback ? 'visibleFallback' : 'edgeEntry',
      scale: _resolveActorScale(spec.actorType), roadKey: c.roadKey,
      state: visibleFallback ? 'active' : 'spawning', stateStart: _now(), lastOnScreenMs: _now(),
      _spawnedAt: _now(),
      _lastLat: c.lat, _lastLng: c.lng, _lastOpacity: null, _onScreen: !!c.onScreen,
      _opacity: visibleFallback ? 1 : 0,
    };
    // 0602Q — per-actor road-authority snapshot (diagnostic; passive metadata).
    actor.roadAuthority = {
      roadKey: actor.roadKey,
      layerId: c.road.layerId || null,
      layerType: c.road.layerType || null,
      roadClass: _resolveRoadClass(c.road.layerId, c.road.properties),
      gradeHint: _resolveGradeHint(c.road.layerId, c.road.properties),
      directionHint: _resolveDirectionHint(c.road.properties),
      flowSign: actor.flowSign,
      baseHeadingDeg: actor.baseHeadingDeg,
      travelHeadingDeg: actor.travelHeadingDeg,
      laneSide: actor.laneSide,
      laneOffsetM: Math.round(actor.laneOffsetM * 100) / 100,
      scale: actor.scale,
      roadLengthM: Math.round(actor.meta.total),
      spawnMode: actor.spawnMode,
      spawnDistanceFromHeroM: Math.round(c.heroDistanceM),
      sampledPointCount: actor.pts.length,
      createdAtMs: _now(),
    };
    _actors.push(actor);
    _renderActor(actor, visibleFallback ? 1 : 0);
    _stats.lastSpawnAt = _now();
    _consumeReplacement();   // 0602P — this spawn satisfies one pending replacement
    if (_debug) console.log('[AmbientTrafficRuntime] spawn', id, '(' + spec.variant +
      ', flow ' + c.flowSign + ', scale ' + actor.scale.toFixed(2) +
      ', heroDist ' + Math.round(c.heroDistanceM) + 'm' + (visibleFallback ? ', visibleFallback' : '') + ')');
    return true;
  }

  // Try to create one ambient actor.
  //   Stage A — offscreen / edge entry (always attempted first).
  //   Stage B — distant visible entry (≥180m, ≥60m clearance, opacity 1), only
  //             when allowStageB (starvation / 3-cycle streak) and Stage A fails.
  // Returns 'A' | 'B' | false.
  function _trySpawn(map, hero, roads, allowStageB) {
    _stats.spawnAttempts++;
    var candidates = _collectSpawnCandidates(map, hero, roads, { allowVisibleFallback: false });
    if (candidates.length) { _spawnCandidate(candidates[0]); return 'A'; }
    if (allowStageB) {
      candidates = _collectSpawnCandidates(map, hero, roads, { allowVisibleFallback: true, stageB: true });
      if (candidates.length) { _spawnCandidate(candidates[0]); return 'B'; }
    }
    _reject('exhaustedCandidates');
    return false;
  }

  // 0602O — budgeted single-actor spawn for the runtime maintenance path.
  // At most ONE actor per call. Stage B only when allowStageB and not in safeMode.
  function _trySpawnBudgeted(map, hero, roads, allowStageB, budgetMs, startup) {
    _stats.spawnAttempts++;
    var candidates = _collectSpawnCandidatesBudgeted(map, hero, roads,
      { allowVisibleFallback: false, budgetMs: budgetMs, startup: startup });
    if (candidates.length) { _spawnCandidate(candidates[0]); _presence.lastSuccessfulSpawnMode = 'A'; return 'A'; }
    if (allowStageB && !_safeMode) {
      candidates = _collectSpawnCandidatesBudgeted(map, hero, roads,
        { allowVisibleFallback: true, stageB: true, budgetMs: budgetMs, startup: startup });
      if (candidates.length) { _spawnCandidate(candidates[0]); _presence.lastSuccessfulSpawnMode = 'B'; return 'B'; }
    }
    _reject('exhaustedCandidates');
    return false;
  }

  function _now() { return (global.performance && performance.now) ? performance.now() : Date.now(); }

  // ── Per-frame render of one actor at a given opacity ───────────────────────────
  function _renderActor(actor, opacity) {
    var wsl = _wsl();
    if (!wsl) return;
    var pos = _interpPolyline(actor.pts, actor.meta, actor.dist);
    var hdg = actor.flowSign >= 0 ? pos.headingDeg : (pos.headingDeg + 180) % 360;
    var lat = pos.lat, lng = pos.lng;
    if (actor.laneOffsetM) {
      var perp = (hdg + 90) * Math.PI / 180;
      var off = _offsetLatLng(lat, lng, actor.laneOffsetM * Math.cos(perp), actor.laneOffsetM * Math.sin(perp));
      lat = off.lat; lng = off.lng;
    }
    actor._lastLat = lat; actor._lastLng = lng;
    wsl.upsertVehicle({
      id: actor.id, actorType: actor.actorType, variant: actor.variant,
      lat: lat, lng: lng, headingDeg: hdg, scale: actor.scale || 1, visible: true, source: 'showcase-road',
    });
    // Only rewrite opacity when it actually changes (avoids per-frame material churn).
    if (typeof wsl.setActorOpacity === 'function' &&
        (actor._lastOpacity == null || Math.abs(actor._lastOpacity - opacity) > 0.01)) {
      wsl.setActorOpacity(actor.id, opacity);
      actor._lastOpacity = opacity;
    }
  }

  function _removeActor(actor) {
    var wsl = _wsl();
    if (wsl && typeof wsl.removeVehicle === 'function') { try { wsl.removeVehicle(actor.id); } catch (e) {} }
  }

  // ── RAF loop ──────────────────────────────────────────────────────────────────
  function _frame(nowMs) {
    if (!_active) { _rafId = null; return; }
    _rafId = global.requestAnimationFrame(_frame);

    // 0602O — freeze watchdog: a long frame counts as a strike; repeated strikes
    // auto-disable ambient traffic so Drive never stays frozen.
    var frameMs = _lastRafMs ? (nowMs - _lastRafMs) : 0;
    if (frameMs > FREEZE_FRAME_MS) {
      _perf.freezeStrikes++;
      if (_perf.freezeStrikes > FREEZE_STRIKE_LIMIT) {
        _enabled = false;
        _perf.autoDisabled = true;
        _perf.lastAutoDisableReason = 'frame_budget_exceeded';
        clear();
        console.warn('[AmbientTrafficRuntime] auto-disabled — frame budget exceeded');
        _lastRafMs = nowMs;
        return;
      }
    } else if (_perf.freezeStrikes > 0 && frameMs < FREEZE_FRAME_MS * 0.5) {
      _perf.freezeStrikes = 0;   // recovered cleanly → reset strikes
    }

    var dt = _lastRafMs ? Math.min((nowMs - _lastRafMs) / 1000, 0.1) : 0.016;
    _lastRafMs = nowMs;

    if (!_enabled) return;   // auto-disabled / disabled: stop doing work

    var wsl = _wsl();
    if (!wsl) { _stats.lastError = 'wsl_missing'; return; }
    var hero = _hero();
    var map  = _map();
    var t = _now();

    // Advance + fade each actor; mark recycles.
    for (var i = _actors.length - 1; i >= 0; i--) {
      var a = _actors[i];
      // Motion (one-way looping; never ping-pong).
      a.dist += a.flowSign * a.speedMs * dt;
      if (a.dist >= a.meta.total) a.dist -= a.meta.total;
      if (a.dist < 0) a.dist += a.meta.total;

      // On-screen test against last-known position (pre-render is close enough).
      var onScreen = (map && a._lastLat != null) ? _isOnScreen(map, a._lastLng, a._lastLat) : true;
      a._onScreen = onScreen;
      if (onScreen) a.lastOnScreenMs = t;

      // Lifecycle opacity.
      var op = 1, elapsed = t - a.stateStart;
      if (a.state === 'spawning') {
        op = Math.min(1, elapsed / FADE_IN_MS);
        if (op >= 1) { a.state = 'active'; a.stateStart = t; }
      } else if (a.state === 'fadingOut') {
        op = Math.max(0, 1 - elapsed / FADE_OUT_MS);
        if (op <= 0) { _removeActor(a); _actors.splice(i, 1); continue; }
      }

      // 0602L — no translucent ghosts in the visible scene: once meaningfully
      // on-screen, a still-spawning actor snaps to at least ONSCREEN_MIN_OPACITY.
      if (onScreen && a.state === 'spawning' && op < ONSCREEN_MIN_OPACITY) op = ONSCREEN_MIN_OPACITY;
      a._opacity = op;

      _renderActor(a, op);

      // Recycle conditions (only trigger a fade-out once). Enqueue a replacement
      // so presence is restored after the fade.
      if (a.state === 'active') {
        var recycleReason = _shouldRecycle(a, hero, map, t);
        if (recycleReason) {
          a.state = 'fadingOut'; a.stateStart = t;
          _stats.recycleCount++; _stats.lastRecycleAt = _now();
          _presence.lastRecycleReason = recycleReason;
          _enqueueReplacement();
          if (_debug) console.log('[AmbientTrafficRuntime] recycle', a.id, '(' + recycleReason + ')');
        }
      }
    }

    // Maintenance (self-throttled): keep population within the target band.
    _maintain(false);
  }

  function _isOnScreen(map, lng, lat) {
    try {
      var p = map.project([lng, lat]);
      var c = map.getCanvas();
      var m = 80;   // small margin
      return p.x >= -m && p.y >= -m && p.x <= c.clientWidth + m && p.y <= c.clientHeight + m;
    } catch (e) { return true; }
  }

  // 0602P — returns a recycle reason string, or null to keep the actor.
  function _shouldRecycle(a, hero, map, t) {
    if (hero.active && a._lastLat != null) {
      if (_haversineM(hero.lat, hero.lng, a._lastLat, a._lastLng) > DESPAWN_DISTANCE_M) return 'too_far';
      if (_isInsideHeroExclusion(hero, a._lastLat, a._lastLng)) return 'hero_exclusion';
      var hdg = a.flowSign >= 0 ? _interpPolyline(a.pts, a.meta, a.dist).headingDeg
                                : (_interpPolyline(a.pts, a.meta, a.dist).headingDeg + 180) % 360;
      if (_isInsideHeroForwardCorridor(hero, { lat: a._lastLat, lng: a._lastLng }, hdg)) return 'hero_corridor';
    }
    if (map && (t - a.lastOnScreenMs) > OFFSCREEN_GRACE_MS) return 'offscreen_grace';
    // Soft predictive separation (recycle the colliding actor; never touch hero).
    var spacing = _findRuntimeSpacingRecycle(a);
    if (spacing) return spacing;
    return null;
  }

  function _activeCount() {
    var n = 0;
    for (var i = 0; i < _actors.length; i++) if (_actors[i].state !== 'fadingOut') n++;
    return n;
  }

  // 0602N — update the starvation tracker. Starving = active + hero ready + below
  // MIN_VISIBLE_ACTORS for > STARVATION_AFTER_MS. While starving, Stage B allowed.
  function _updateStarvation(heroReady) {
    var t = _now();
    if (_active && heroReady && _activeCount() < 1) {
      if (_starvation._sinceMs == null) _starvation._sinceMs = t;
      _starvation.ms = t - _starvation._sinceMs;
      _starvation.active = _starvation.ms > STARVATION_AFTER_MS;
      if (_starvation.active) _starvation.cycles++;
    } else {
      _starvation._sinceMs = null; _starvation.ms = 0; _starvation.active = false; _starvation.cycles = 0;
    }
    _starvation.fallbackVisibleAllowed = _starvation.active || _stageAFailStreak >= STAGE_B_AFTER_STREAK;
  }

  // 0602O — budgeted maintenance. Self-throttled, startup-deferred, time-budgeted,
  // and at most ONE spawn per cycle. Never iterates all roads × samples in a frame.
  function _maintain(force) {
    if (!_enabled) return;
    var mt0 = _now();
    if (!force && (mt0 - _lastMaintAt) < MAINTENANCE_INTERVAL_MS) return;
    _lastMaintAt = mt0;

    // Refuse heavy work until the startup window has elapsed (non-blocking launch).
    var startup = (_startupArmedAt && (mt0 - _startupArmedAt) < STARTUP_DELAY_MS);
    if (startup) { _stats.lastError = 'startup_deferred'; return; }

    var wsl = _wsl();
    var hero = _hero();
    _updateStarvation(hero.active);
    _pruneReplacementQueue();
    _maybeReleaseSafeMode(hero, wsl);   // 0602P — safe mode auto-releases post-startup

    if (!hero.active) { _stats.lastError = 'hero_missing'; return; }
    var map = _map();
    if (!map) { _stats.lastError = 'map_missing'; return; }

    // 0602P — presence-aware targets. safeMode caps at 1 until auto-released.
    var earlyWindow = (_startupArmedAt && (mt0 - _startupArmedAt) < (STARTUP_DELAY_MS + 4000));
    var desiredTarget = _safeMode ? 1 : PRESENCE_TARGET_ACTORS;
    var desiredMax    = _safeMode ? 1 : PRESENCE_MAX_ACTORS;
    var have = _activeCount();

    // Track emptiness window (drives empty-recovery Stage B).
    if (have < 1) { if (_presence.emptySinceMs == null) _presence.emptySinceMs = _now(); }
    else _presence.emptySinceMs = null;
    var emptyMs = _presence.emptySinceMs ? (_now() - _presence.emptySinceMs) : 0;
    var allowEmptyRecovery = emptyMs > EMPTY_RECOVERY_AFTER_MS;

    var want = Math.min(desiredMax, desiredTarget);
    // Pending replacements get priority — push toward max (one extra per cycle).
    if (_presence.pendingReplacementCount > 0 && have < desiredMax) want = Math.min(desiredMax, have + 1);
    if (have >= want) { _stats.lastError = null; _stageAFailStreak = 0; return; }

    var budgetMs = earlyWindow ? STARTUP_BUDGET_MS : STEADY_BUDGET_MS;
    var roads = _getCachedRoads(map, budgetMs, earlyWindow);
    if (!roads.length) {
      _stats.lastError = _budgetExceeded(mt0, budgetMs) ? 'budget_exhausted' : 'no_valid_roads';
      _perf.lastMaintainMs = _now() - mt0; _perf.maxMaintainMs = Math.max(_perf.maxMaintainMs, _perf.lastMaintainMs);
      return;
    }

    // CRITICAL: at most ONE spawn per maintain cycle (no targetCount loop).
    var allowStageB = !_safeMode && (_starvation.fallbackVisibleAllowed || allowEmptyRecovery);
    var spawnBudgetLeft = budgetMs - (_now() - mt0);
    var r = false;
    if (spawnBudgetLeft > 0.5) r = _trySpawnBudgeted(map, hero, roads, allowStageB, spawnBudgetLeft, earlyWindow);

    if (r === 'A') _stageAFailStreak = 0;
    else _stageAFailStreak++;

    if (_budgetExceeded(mt0, budgetMs) && !r) _stats.lastError = 'budget_exhausted';
    else if (!r && _activeCount() < 1) _stats.lastError = 'spawn_blocked';
    else _stats.lastError = null;

    _perf.lastMaintainMs = _now() - mt0;
    _perf.maxMaintainMs = Math.max(_perf.maxMaintainMs, _perf.lastMaintainMs);
  }

  // ── Startup watchdog (0602N) ──────────────────────────────────────────────────
  // Polls readiness every 750ms; once dependencies are ready it drives a forced
  // maintenance pass. Stops itself when the target is reached or the runtime stops.
  function _startStartupWatchdog() {
    if (_watchdogTimer) return;
    _watchdogTimer = global.setInterval(function () {
      if (!_active || !_enabled) return;
      var ready = _readStartupReadiness();
      _lastStartupReadiness = ready;
      if (!ready.ready) return;
      _maintain(true);
      // Once the first actor exists, hand steady-state top-up to the RAF loop.
      if (_activeCount() >= 1) _stopStartupWatchdog();
    }, 750);
  }
  function _stopStartupWatchdog() {
    if (_watchdogTimer) { global.clearInterval(_watchdogTimer); _watchdogTimer = null; }
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  // start() returns IMMEDIATELY: arms RAF + a deferred startup window, runs NO
  // road sampling / maintenance in the same event turn. Drive launch is never
  // blocked by ambient traffic work.
  function start(opts) {
    if (!global.SBE) return false;
    if (!SBE.WorldSpaceVehicleLayer) return false;
    if (!SBE.HeroVehicleRuntime) return false;
    if (opts && opts.safeMode) _safeMode = true;
    if (_active) { _startStartupWatchdog(); return true; }   // idempotent
    _active = true;
    _lastRafMs = 0; _lastMaintAt = 0;
    _startupArmedAt = _now();   // heavy work deferred until STARTUP_DELAY_MS elapses
    _stageAFailStreak = 0;
    _starvation = { active: false, cycles: 0, ms: 0, fallbackVisibleAllowed: false, _sinceMs: null };
    _rafId = global.requestAnimationFrame(_frame);
    _startStartupWatchdog();
    console.log('[AmbientTrafficRuntime] v' + VERSION + ' started (target ' + _targetCount + ', max ' + _maxActors +
      (opts && opts.source ? ', src ' + opts.source : '') + (opts && opts.deferred ? ', deferred' : '') +
      (_safeMode ? ', safeMode' : '') + ')');
    return true;
  }

  function stop(opts) {
    opts = opts || {};
    _active = false;
    _stopStartupWatchdog();
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
    if (!opts.preserveActors) {
      for (var i = 0; i < _actors.length; i++) _removeActor(_actors[i]);
      _actors = [];
    }
    console.log('[AmbientTrafficRuntime] stopped' + (opts.preserveActors ? ' (actors preserved)' : ''));
    return true;
  }

  function restart() { stop(); return start(); }

  // 0602N — debug-only forced recovery. Restart + immediate Stage-B-eligible pass.
  function forceRecover() {
    restart();
    _startupArmedAt = 0;                          // bypass startup deferral (debug)
    _stageAFailStreak = STAGE_B_AFTER_STREAK;     // permit Stage B immediately
    _maintain(true);
    return getState();
  }

  // 0602O — debug-only safe mode toggle (target/max 1, no Stage B, lower caps).
  function setSafeMode(on) {
    _safeMode = !!on;
    console.log('[AmbientTrafficRuntime] safeMode →', _safeMode);
    return _safeMode;
  }

  // 0602O — debug-only manual wake from an auto-disabled / frozen state.
  function wake() {
    _perf.autoDisabled = false;
    _perf.lastAutoDisableReason = null;
    _perf.freezeStrikes = 0;
    _enabled = true;
    _startupArmedAt = 0;     // allow an immediate budgeted pass
    if (!_active) { start({ source: 'wake' }); }
    _maintain(true);
    return getState();
  }

  function clear() {
    for (var i = 0; i < _actors.length; i++) _removeActor(_actors[i]);
    _actors = [];
    return true;
  }

  function setEnabled(on) {
    _enabled = !!on;
    if (!_enabled) clear();
    console.log('[AmbientTrafficRuntime] enabled →', _enabled);
    return _enabled;
  }

  function setDensity(count, opts) {
    opts = opts || {};
    var max = opts.allowHigh ? 12 : MAX_VISIBLE_ACTORS;
    _targetCount = Math.max(0, Math.min(max, Number(count) || 0));
    _maxActors   = Math.max(_targetCount, opts.allowHigh ? _targetCount : MAX_VISIBLE_ACTORS);
    console.log('[AmbientTrafficRuntime] density → target', _targetCount, '| max', _maxActors);
    return _targetCount;
  }

  function setDebug(on) { _debug = !!on; return _debug; }

  // 0602N — dominant rejection reason (largest bucket in _rejectStats).
  function _lastDominantReject() {
    var top = null, topCount = 0, total = 0;
    for (var k in _rejectStats) {
      if (!_rejectStats.hasOwnProperty(k)) continue;
      total += _rejectStats[k];
      if (_rejectStats[k] > topCount) { topCount = _rejectStats[k]; top = k; }
    }
    return { reason: top, count: topCount, percent: total > 0 ? Math.round(topCount / total * 100) : 0 };
  }

  function getState() {
    return {
      active:           _active,
      enabled:          _enabled,
      actorCount:       _actors.length,
      activeCount:      _activeCount(),
      targetCount:      _targetCount,
      maxVisibleActors: _maxActors,
      heroDetected:     _hero().active,
      lastSpawnAt:      _stats.lastSpawnAt,
      lastRecycleAt:    _stats.lastRecycleAt,
      spawnAttempts:    _stats.spawnAttempts,
      spawnRejects:     _stats.spawnRejects,
      recycleCount:     _stats.recycleCount,
      lastError:        _stats.lastError,
      startup:          _lastStartupReadiness || _readStartupReadiness(),
      lastDominantReject: _lastDominantReject(),
      safeMode:         _safeMode,
      perf: {
        lastMaintainMs:        Math.round(_perf.lastMaintainMs * 100) / 100,
        maxMaintainMs:         Math.round(_perf.maxMaintainMs * 100) / 100,
        lastRoadScanMs:        Math.round(_perf.lastRoadScanMs * 100) / 100,
        maxRoadScanMs:         Math.round(_perf.maxRoadScanMs * 100) / 100,
        freezeStrikes:         _perf.freezeStrikes,
        autoDisabled:          _perf.autoDisabled,
        lastAutoDisableReason: _perf.lastAutoDisableReason,
      },
      roadCache: { count: _roadCache.roads.length, ageMs: _roadCache.at ? Math.round(_now() - _roadCache.at) : null },
      starvation: {
        active:                 _starvation.active,
        cycles:                 _starvation.cycles,
        ms:                     Math.round(_starvation.ms),
        fallbackVisibleAllowed: _starvation.fallbackVisibleAllowed,
      },
      stageAFailStreak: _stageAFailStreak,
      presence: {
        desiredMin:              PRESENCE_MIN_ACTORS,
        desiredTarget:           _safeMode ? 1 : PRESENCE_TARGET_ACTORS,
        desiredMax:              _safeMode ? 1 : PRESENCE_MAX_ACTORS,
        emptyMs:                 _presence.emptySinceMs ? Math.round(_now() - _presence.emptySinceMs) : 0,
        safeModeReleased:        _presence.safeModeReleased,
        pendingReplacementCount: _presence.pendingReplacementCount,
        lastSuccessfulSpawnMode: _presence.lastSuccessfulSpawnMode,
        lastRecycleReason:       _presence.lastRecycleReason,
      },
      rejectStats:      _assign({}, _rejectStats),
      entryPolicy: {
        screenMarginMinPx:      SPAWN_ENTRY_MIN_SCREEN_MARGIN_PX,
        screenMarginMaxPx:      SPAWN_ENTRY_MAX_SCREEN_MARGIN_PX,
        heroDistanceMinM:       SPAWN_ENTRY_MIN_HERO_DISTANCE_M,
        heroDistanceMaxM:       SPAWN_ENTRY_MAX_HERO_DISTANCE_M,
        heroExclusionRadiusM:   HERO_EXCLUSION_RADIUS_M,
        minActorSeparationM:    MIN_ACTOR_SEPARATION_M,
        minSameRoadSeparationM: MIN_SAME_ROAD_SEPARATION_M,
      },
      actors: _actors.map(function (a) {
        var hero = _hero();
        var heroDistanceM = (hero.active && a._lastLat != null)
          ? Math.round(_haversineM(hero.lat, hero.lng, a._lastLat, a._lastLng)) : null;
        return {
          id: a.id, actorType: a.actorType, variant: a.variant, state: a.state,
          lat: a._lastLat, lng: a._lastLng, flowSign: a.flowSign,
          laneSide: a.laneSide != null ? a.laneSide : null,
          travelHeadingDeg: a.travelHeadingDeg != null ? Math.round(a.travelHeadingDeg) : null,
          spawnMode: a.spawnMode || null,
          ageMs: a._spawnedAt ? Math.round(_now() - a._spawnedAt) : null,
          scale: a.scale != null ? Math.round(a.scale * 100) / 100 : null,
          roadKey: a.roadKey || null,
          opacity: a._opacity != null ? Math.round(a._opacity * 100) / 100 : null,
          heroDistanceM: heroDistanceM,
          onScreen: !!a._onScreen,
          roadAuthority: a.roadAuthority || null,
        };
      }),
    };
  }

  // 0602Q — compact road-authority view (per-actor selected-road truth).
  function getRoadAuthorityState() {
    return {
      version: VERSION,
      active: _active,
      enabled: _enabled,
      actorCount: _actors.length,
      actors: _actors.map(function (actor) {
        return {
          id: actor.id,
          state: actor.state,
          variant: actor.variant,
          actorType: actor.actorType,
          lat: actor._lastLat,
          lng: actor._lastLng,
          roadAuthority: actor.roadAuthority || null,
        };
      }),
    };
  }

  SBE.AmbientTrafficRuntime = Object.freeze({
    VERSION:    VERSION,
    start:        start,
    getRoadAuthorityState: getRoadAuthorityState,
    stop:         stop,
    restart:      restart,
    forceRecover: forceRecover,
    setSafeMode:  setSafeMode,
    wake:         wake,
    getState:     getState,
    setEnabled:   setEnabled,
    setDensity:   setDensity,
    setDebug:     setDebug,
    clear:        clear,
  });

  console.log('[AmbientTrafficRuntime] v' + VERSION + ' loaded');

})(window);
