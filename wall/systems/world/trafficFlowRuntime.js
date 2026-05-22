(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── TrafficFlowRuntime (0520M_WOS_RoadLockedTraffic_v1.1.0) ──────────────
  //
  // CANONICAL RESPONSIBILITY SEPARATION:
  //   GridRuntime owns spatial fields.
  //   AtmosphereRuntime owns environmental conditions.
  //   TrafficFlowRuntime owns infrastructural circulation.
  //   OverlayRuntime / TrafficRenderer own perception rendering.
  //
  // v1.1.0 ADDITIONS:
  //   Arc-Length Traversal       — uniform world-space speed, no segment stutter
  //   Heading Inertia Filter     — eliminates tangent chatter, dt-normalized
  //   Snap-to-Safety Recovery    — no single-frame topology failure visible
  //   Explicit Bridge Elevation  — z-axis bypasses terrain snapping
  //   Corridor Preprocessing     — cumulativeDistances built at registration
  //
  // VEHICLE STATE (canonical):
  //   { corridorId, distanceTraveledMeters, speedMps, x, y, z, direction, ... }
  //
  // TRAVERSAL DOCTRINE:
  //   Vehicles track distanceTraveledMeters, NOT splineT.
  //   Binary search on cumulativeDistances → linear interpolation between samples.
  //   Speed is uniform in world-space regardless of node spacing.
  //
  // HEADING INERTIA DOCTRINE:
  //   direction = lerpAngle(prev, target, factor) where factor is dt-normalized.
  //   Minimum advance threshold: < 0.05m in a frame → reuse previous heading.
  //
  // SNAP-TO-SAFETY DOCTRINE:
  //   On state corruption / large position jump, binary search corridor samples.
  //   SNAP_RADIUS_M = 5. Despawn only if no legal sample found within radius.
  //
  // BRIDGE ELEVATION DOCTRINE:
  //   Bridge/tunnel waypoints include z field.
  //   isBridge=true corridors interpolate z directly, bypass terrain snapping.

  // ── Geographic constants — match GridRuntime ──────────────────────────────
  var REF_LAT = 40.630;
  var REF_LNG = -74.040;
  var MPD_LAT = 111320;
  var MPD_LNG = 85395;

  // ── Simulation constants ──────────────────────────────────────────────────
  var MAX_VEHICLES      = 120;
  var VEHICLE_LEN_M     = 4.5;     // meters, for head/tail light offset
  var PHYSICAL_MARGIN   = 1.3;     // viewport expansion for physical mode
  var VIRTUAL_TICK_S    = 1.0;     // macro-advance cadence for virtual vehicles
  var FIDELITY_CHECK_S  = 2.0;     // reclassify physical/virtual every 2s
  var SNAP_RADIUS_M     = 5;       // recovery search radius (meters)
  var HEADING_INERTIA   = 0.65;    // per-frame retention (1-0.35). dt-normalized.
  var HEADING_MIN_ADV_M = 0.05;    // minimum advance to update heading (5cm)
  var SAMPLE_RESOLUTION = 3;       // meters between arc-length samples

  // ── Coordinate helpers ────────────────────────────────────────────────────
  function _llToWorld(lat, lng) {
    return { x: (lng - REF_LNG) * MPD_LNG, y: (lat - REF_LAT) * MPD_LAT };
  }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function _dist2D(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ── Angle lerp — handles wraparound, dt-normalized ────────────────────────
  // factor = 1 - HEADING_INERTIA^(dt * 60): frame-rate independent.
  function _lerpAngle(a, b, factor) {
    var diff = b - a;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * factor;
  }

  // ── Catmull-Rom spline evaluation — used ONLY during preprocessing ────────
  // t ∈ [0,1] over all control points. Returns {x, y}.
  function _splineEval(pts, t) {
    var n   = pts.length;
    if (n < 2) return { x: pts[0].x, y: pts[0].y };
    var seg = n - 1;
    var si  = _clamp(Math.floor(t * seg), 0, seg - 1);
    var lt  = t * seg - si;
    var i0 = Math.max(0, si - 1), i1 = si,
        i2 = Math.min(n - 1, si + 1), i3 = Math.min(n - 1, si + 2);
    var P0 = pts[i0], P1 = pts[i1], P2 = pts[i2], P3 = pts[i3];
    var lt2 = lt * lt, lt3 = lt2 * lt;
    return {
      x: 0.5 * ((2*P1.x) + (-P0.x+P2.x)*lt + (2*P0.x-5*P1.x+4*P2.x-P3.x)*lt2 + (-P0.x+3*P1.x-3*P2.x+P3.x)*lt3),
      y: 0.5 * ((2*P1.y) + (-P0.y+P2.y)*lt + (2*P0.y-5*P1.y+4*P2.y-P3.y)*lt2 + (-P0.y+3*P1.y-3*P2.y+P3.y)*lt3),
    };
  }

  // z-axis interpolation over raw waypoints (linear, independent of Catmull-Rom)
  function _sampleZ(rawWaypoints, t) {
    if (!rawWaypoints || rawWaypoints.length < 2) return 0;
    var n   = rawWaypoints.length;
    var seg = n - 1;
    var si  = _clamp(Math.floor(t * seg), 0, seg - 1);
    var lt  = t * seg - si;
    return (rawWaypoints[si].z || 0) * (1 - lt) + (rawWaypoints[si + 1].z || 0) * lt;
  }

  // ── Arc-length preprocessing ──────────────────────────────────────────────
  // Converts a Catmull-Rom corridor into uniformly-spaced arc-length samples.
  // Builds cumulativeDistances[] for O(log N) runtime traversal.
  // Called once per corridor at registration — not at runtime.
  function _preprocessCorridor(corridor) {
    var pts = corridor.points;
    var raw = corridor.rawWaypoints;

    // Estimate chord length from control points → choose sample count
    var roughLen = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y;
      roughLen += Math.sqrt(dx * dx + dy * dy);
    }
    var N = Math.max(100, Math.ceil(roughLen / SAMPLE_RESOLUTION));

    var samples = new Array(N + 1);
    var cumDist = new Array(N + 1);
    cumDist[0] = 0;

    for (var k = 0; k <= N; k++) {
      var t  = k / N;
      var pt = _splineEval(pts, t);
      samples[k] = { x: pt.x, y: pt.y, z: _sampleZ(raw, t) };
    }
    for (var k2 = 1; k2 <= N; k2++) {
      var sx = samples[k2].x - samples[k2 - 1].x;
      var sy = samples[k2].y - samples[k2 - 1].y;
      cumDist[k2] = cumDist[k2 - 1] + Math.sqrt(sx * sx + sy * sy);
    }

    corridor.samples          = samples;
    corridor.cumulativeDistances = cumDist;
    corridor.totalLength      = cumDist[N];
  }

  // ── Arc-length sample lookup — O(log N) ───────────────────────────────────
  // Returns interpolated {x, y, z} at distMeters along the corridor.
  function _sampleAtDist(corridor, distMeters) {
    var cum     = corridor.cumulativeDistances;
    var samples = corridor.samples;
    var n       = cum.length;

    if (distMeters <= 0)          return samples[0];
    if (distMeters >= cum[n - 1]) return samples[n - 1];

    var lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (cum[mid] <= distMeters) lo = mid; else hi = mid;
    }

    var span = cum[hi] - cum[lo];
    var t    = span > 0 ? (distMeters - cum[lo]) / span : 0;
    return {
      x: samples[lo].x + t * (samples[hi].x - samples[lo].x),
      y: samples[lo].y + t * (samples[hi].y - samples[lo].y),
      z: samples[lo].z + t * (samples[hi].z - samples[lo].z),
    };
  }

  // Tangent at distMeters — 0.5m central difference on arc-length samples.
  var _TAN_EPS = 0.5;
  function _tangentAtDist(corridor, distMeters) {
    var p0 = _sampleAtDist(corridor, Math.max(0, distMeters - _TAN_EPS));
    var p1 = _sampleAtDist(corridor, Math.min(corridor.totalLength, distMeters + _TAN_EPS));
    var dx = p1.x - p0.x, dy = p1.y - p0.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // ── Snap-to-safety: nearest sample within SNAP_RADIUS_M ──────────────────
  // Returns corridor distanceM of nearest sample, or -1 if none within radius.
  function _findNearestSample(corridor, x, y) {
    var best     = SNAP_RADIUS_M * SNAP_RADIUS_M;  // squared
    var bestDist = -1;
    var samples  = corridor.samples;
    var cumDist  = corridor.cumulativeDistances;
    for (var i = 0; i < samples.length; i++) {
      var dx = samples[i].x - x, dy = samples[i].y - y;
      var d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; bestDist = cumDist[i]; }
    }
    return bestDist;
  }

  // ── Core state ────────────────────────────────────────────────────────────
  var _corridors = {};
  var _pool      = new Array(MAX_VEHICLES);
  var _active    = [];
  var _freeList  = [];

  for (var _pi = 0; _pi < MAX_VEHICLES; _pi++) {
    _pool[_pi] = null;
    _freeList.push(_pi);
  }

  var _state = {
    vehicleCount:    0,
    corridorCount:   0,
    globalIntensity: 1.0,
    phase:           "deep_night",
  };

  var _vpBounds         = null;
  var _lastFidelityCheck = 0;
  var _lastVirtualTick   = {};

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _bus()              { return SBE.WorkspaceEventBus; }
  function _emit(evt, payload) { var b = _bus(); b && b.emit(evt, payload); }

  function _updateViewportBounds() {
    try {
      var mvr = SBE.MapboxViewportRuntime;
      if (!mvr) return;
      var map  = mvr.getMap();
      if (!map) return;
      var bnds = map.getBounds();
      var sw   = bnds.getSouthWest(), ne = bnds.getNorthEast();
      var swW  = _llToWorld(sw.lat, sw.lng), neW = _llToWorld(ne.lat, ne.lng);
      var dxM  = (neW.x - swW.x) * (PHYSICAL_MARGIN - 1) * 0.5;
      var dyM  = (neW.y - swW.y) * (PHYSICAL_MARGIN - 1) * 0.5;
      _vpBounds = { swX: swW.x - dxM, swY: swW.y - dyM, neX: neW.x + dxM, neY: neW.y + dyM };
    } catch (e) {}
  }

  function _inViewport(wx, wy) {
    if (!_vpBounds) return true;
    return wx >= _vpBounds.swX && wx <= _vpBounds.neX &&
           wy >= _vpBounds.swY && wy <= _vpBounds.neY;
  }

  // ── Corridor registration ─────────────────────────────────────────────────
  function registerCorridor(descriptor) {
    if (!descriptor || !descriptor.id || !descriptor.waypoints) {
      console.warn("[TrafficFlowRuntime] registerCorridor: requires id and waypoints");
      return;
    }

    var pts = descriptor.waypoints.map(function (wp) {
      var w = _llToWorld(wp.lat, wp.lng);
      w.z   = wp.z || 0;
      return w;
    });

    var spawning = descriptor.spawningConstraints || {};
    var corridor = {
      id:              descriptor.id,
      points:          pts,                         // world-space control points
      rawWaypoints:    descriptor.waypoints,        // lat/lng/z originals (for z sampling)
      isBridge:        descriptor.isBridge        || false,
      waterExclusion:  descriptor.waterExclusion  || descriptor.isBridge || false,
      densityWeight:   descriptor.densityWeight   != null ? descriptor.densityWeight   : 0.5,
      directionality:  descriptor.directionality  || 1,
      cinematicWeight: descriptor.cinematicWeight != null ? descriptor.cinematicWeight : 0.5,
      districtTags:    descriptor.districtTags    || [],
      speedMps:        descriptor.speedMps        || 12,
      minGapM:         spawning.minDistanceBufferMeters != null ? spawning.minDistanceBufferMeters : 25,
      timeHeadwayS:    spawning.timeHeadwaySeconds      != null ? spawning.timeHeadwaySeconds      : 2.5,
      _lastSpawnTime:  0,
      // Arc-length tables — populated by _preprocessCorridor below:
      samples:             null,
      cumulativeDistances: null,
      totalLength:         0,
    };

    _preprocessCorridor(corridor);

    _corridors[corridor.id] = corridor;
    _state.corridorCount = Object.keys(_corridors).length;
    _lastVirtualTick[corridor.id] = 0;
  }

  // ── Vehicle spawn ─────────────────────────────────────────────────────────
  function _spawnVehicle(corridorId) {
    if (_freeList.length === 0) return;
    var corridor = _corridors[corridorId];
    if (!corridor || !corridor.samples) return;

    var now = performance.now() / 1000;
    if (now - corridor._lastSpawnTime < corridor.timeHeadwayS) return;

    // Spatial headway: check vehicles near corridor entry
    for (var ai = 0; ai < _active.length; ai++) {
      var ev = _pool[_active[ai]];
      if (ev.corridorId !== corridorId) continue;
      if (ev.distanceTraveledMeters < corridor.minGapM) return;
    }

    var entry = corridor.samples[0];
    var tan   = _tangentAtDist(corridor, 0);
    var slot  = _freeList.pop();

    _pool[slot] = {
      id:                    "v" + slot,
      corridorId:            corridorId,
      distanceTraveledMeters: 0,
      x:                     entry.x,
      y:                     entry.y,
      z:                     entry.z,
      direction:             Math.atan2(tan.y, tan.x),
      speed:                 corridor.speedMps * (0.85 + Math.random() * 0.30),
      intensity:             0.6 + Math.random() * 0.4,
      physical:              _inViewport(entry.x, entry.y),
      life:                  0,
    };

    _active.push(slot);
    corridor._lastSpawnTime = now;
    _state.vehicleCount = _active.length;
  }

  function _despawnAt(activeIdx) {
    var slot = _active[activeIdx];
    _freeList.push(slot);
    _pool[slot] = null;
    _active.splice(activeIdx, 1);
    _state.vehicleCount = _active.length;
  }

  // ── Vehicle advance — arc-length traversal ────────────────────────────────
  function _advanceVehicle(v, dt) {
    var corridor = _corridors[v.corridorId];
    if (!corridor || !corridor.samples) return false;

    var advancement = v.speed * dt;
    v.distanceTraveledMeters += advancement;
    v.life += dt;

    if (v.distanceTraveledMeters >= corridor.totalLength) return false;

    var pos = _sampleAtDist(corridor, v.distanceTraveledMeters);

    // ── Snap-to-safety recovery ────────────────────────────────────────
    // Guards against numeric corruption / large unexpected jumps.
    var jump = _dist2D(pos.x, pos.y, v.x, v.y);
    if (jump > SNAP_RADIUS_M * 4 && v.life > 0.1) {
      var snapDist = _findNearestSample(corridor, v.x, v.y);
      if (snapDist < 0) return false;  // no legal sample — despawn
      v.distanceTraveledMeters = snapDist;
      pos = _sampleAtDist(corridor, snapDist);
    }

    v.x = pos.x;
    v.y = pos.y;
    v.z = pos.z;

    // ── Heading inertia filter ─────────────────────────────────────────
    // dt-normalized: factor = 1 - HEADING_INERTIA^(dt*60)
    // At 60fps → factor=0.35. Frame-rate independent.
    if (advancement >= HEADING_MIN_ADV_M) {
      var tan    = _tangentAtDist(corridor, v.distanceTraveledMeters);
      var target = Math.atan2(tan.y, tan.x);
      var factor = 1 - Math.pow(HEADING_INERTIA, dt * 60);
      v.direction = _lerpAngle(v.direction, target, factor);
    }
    // else: < 5cm advance — reuse previous heading (prevents jitter at near-stop)

    v.physical = _inViewport(v.x, v.y);
    return true;
  }

  // ── Probabilistic spawning ────────────────────────────────────────────────
  function _trySpawnAll(dt) {
    var atm         = SBE.AtmosphereRuntime && SBE.AtmosphereRuntime.getResolvedAtmosphere();
    var densityBias = atm ? (atm.densityBias || 0.5) : 0.5;

    var cIds = Object.keys(_corridors);
    for (var ci = 0; ci < cIds.length; ci++) {
      var corridor = _corridors[cIds[ci]];

      var entryPt = corridor.samples ? corridor.samples[0] : null;
      var gr      = SBE.GridRuntime;
      var gridTP  = 0, gridDen = 0.3;
      if (entryPt && gr) {
        var gv = gr.sampleInterpolated(entryPt.x, entryPt.y);
        if (gv) { gridTP = gv.transitPressure || 0; gridDen = gv.density || 0.3; }
      }

      var base = corridor.densityWeight
        * (0.3 + densityBias * 0.4 + gridTP * 0.3 + gridDen * 0.2)
        * _state.globalIntensity;

      if (_state.phase === "deep_night" || _state.phase === "late_night") base *= 0.35;
      else if (_state.phase === "morning_rush" || _state.phase === "evening_rush") base *= 1.8;

      if (Math.random() < base * dt) _spawnVehicle(cIds[ci]);
    }
  }

  // ── Main update ───────────────────────────────────────────────────────────
  function update(dt) {
    dt = _clamp(dt, 0.001, 0.1);
    var nowS = performance.now() / 1000;

    // Fidelity reclassification every 2s
    if (nowS - _lastFidelityCheck > FIDELITY_CHECK_S) {
      _updateViewportBounds();
      for (var fi = 0; fi < _active.length; fi++) {
        var fv = _pool[_active[fi]];
        fv.physical = _inViewport(fv.x, fv.y);
      }
      _lastFidelityCheck = nowS;
    }

    // Advance vehicles
    var i = _active.length - 1;
    while (i >= 0) {
      var v   = _pool[_active[i]];
      var vdt = v.physical
        ? dt
        : (nowS - _lastVirtualTick[v.corridorId] > VIRTUAL_TICK_S ? VIRTUAL_TICK_S : 0);
      if (vdt > 0) {
        var alive = _advanceVehicle(v, v.physical ? dt : VIRTUAL_TICK_S);
        if (!alive) _despawnAt(i);
      }
      i--;
    }

    // Update virtual tick timestamps
    var cIds2 = Object.keys(_corridors);
    for (var ci2 = 0; ci2 < cIds2.length; ci2++) {
      if (nowS - _lastVirtualTick[cIds2[ci2]] > VIRTUAL_TICK_S) {
        _lastVirtualTick[cIds2[ci2]] = nowS;
      }
    }

    _trySpawnAll(dt);
  }

  // ── getVehicles — vectorless light data ───────────────────────────────────
  function getVehicles() {
    var result = new Array(_active.length);
    for (var i = 0; i < _active.length; i++) {
      var v    = _pool[_active[i]];
      var cosD = Math.cos(v.direction);
      var sinD = Math.sin(v.direction);
      result[i] = {
        vehicleId:   v.id,
        corridorId:  v.corridorId,
        headlights:  [{ x: v.x + cosD * VEHICLE_LEN_M * 0.5, y: v.y + sinD * VEHICLE_LEN_M * 0.5 }],
        taillights:  [{ x: v.x - cosD * VEHICLE_LEN_M * 0.5, y: v.y - sinD * VEHICLE_LEN_M * 0.5 }],
        intensity:   v.intensity,
        direction:   v.direction,
        distanceM:   v.distanceTraveledMeters,
        physical:    v.physical,
        isBridge:    _corridors[v.corridorId] ? _corridors[v.corridorId].isBridge : false,
      };
    }
    return result;
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  function _onScheduleAdvanced(evt) {
    if (!evt) return;
    _state.phase = evt.phase || _state.phase;
  }
  function _onAtmosphereUpdated(evt) {
    if (!evt || !evt.atmosphere) return;
    _state.globalIntensity = 0.5 + (evt.atmosphere.cinematicPressure || 0.3) * 1.0;
  }

  // ── Default corridor seed ─────────────────────────────────────────────────
  // All corridors share centerline coordinates (NB/SB or EB/WB are exact
  // reversals of the same waypoints). No lateral lane offset.
  // Bridge waypoints include z (meters above sea level).
  function _seedDefaultCorridors() {

    // ── BROOKLYN ────────────────────────────────────────────────────────────

    // Atlantic Ave — east-west, slight southward diagonal going east
    registerCorridor({
      id: "atlantic_ave_eb", densityWeight: 0.80, cinematicWeight: 0.70,
      districtTags: ["downtown_brooklyn", "bed_stuy", "brownsville"],
      speedMps: 11, spawningConstraints: { minDistanceBufferMeters: 30, timeHeadwaySeconds: 2.2 },
      waypoints: [
        { lat: 40.6843, lng: -74.0098 }, { lat: 40.6842, lng: -74.0030 },
        { lat: 40.6841, lng: -73.9965 }, { lat: 40.6840, lng: -73.9895 },
        { lat: 40.6838, lng: -73.9820 }, { lat: 40.6836, lng: -73.9755 },
        { lat: 40.6834, lng: -73.9680 }, { lat: 40.6832, lng: -73.9610 },
        { lat: 40.6830, lng: -73.9540 }, { lat: 40.6828, lng: -73.9465 },
        { lat: 40.6826, lng: -73.9395 }, { lat: 40.6824, lng: -73.9320 },
        { lat: 40.6822, lng: -73.9245 }, { lat: 40.6820, lng: -73.9170 },
      ],
    });
    registerCorridor({
      id: "atlantic_ave_wb", densityWeight: 0.75, cinematicWeight: 0.65,
      districtTags: ["brownsville", "bed_stuy", "downtown_brooklyn"],
      speedMps: 11, spawningConstraints: { minDistanceBufferMeters: 30, timeHeadwaySeconds: 2.2 },
      waypoints: [
        { lat: 40.6820, lng: -73.9170 }, { lat: 40.6822, lng: -73.9245 },
        { lat: 40.6824, lng: -73.9320 }, { lat: 40.6826, lng: -73.9395 },
        { lat: 40.6828, lng: -73.9465 }, { lat: 40.6830, lng: -73.9540 },
        { lat: 40.6832, lng: -73.9610 }, { lat: 40.6834, lng: -73.9680 },
        { lat: 40.6836, lng: -73.9755 }, { lat: 40.6838, lng: -73.9820 },
        { lat: 40.6840, lng: -73.9895 }, { lat: 40.6841, lng: -73.9965 },
        { lat: 40.6842, lng: -74.0030 }, { lat: 40.6843, lng: -74.0098 },
      ],
    });

    // Flatbush Ave — diagonal artery, dense bend waypoints
    registerCorridor({
      id: "flatbush_nb", densityWeight: 0.72, cinematicWeight: 0.78,
      districtTags: ["flatbush", "prospect_heights", "downtown_brooklyn"],
      speedMps: 9, spawningConstraints: { minDistanceBufferMeters: 25, timeHeadwaySeconds: 2.5 },
      waypoints: [
        { lat: 40.6493, lng: -73.9564 }, // Parkside Ave
        { lat: 40.6552, lng: -73.9590 }, // Church Ave
        { lat: 40.6609, lng: -73.9614 }, // Caton Ave junction
        { lat: 40.6651, lng: -73.9640 }, // Cortelyou Rd
        { lat: 40.6695, lng: -73.9662 }, // Newkirk Ave
        { lat: 40.6726, lng: -73.9680 }, // Prospect Park SW
        { lat: 40.6760, lng: -73.9706 }, // Grand Army Plaza approach
        { lat: 40.6790, lng: -73.9726 }, // Eastern Pkwy
        { lat: 40.6820, lng: -73.9748 }, // Bergen St
        { lat: 40.6843, lng: -73.9765 }, // Atlantic Ave
        { lat: 40.6875, lng: -73.9792 }, // Fulton St approach
        { lat: 40.6898, lng: -73.9815 }, // Fulton St
        { lat: 40.6918, lng: -73.9835 }, // Myrtle Ave
        { lat: 40.6950, lng: -73.9858 }, // Tillary St
        { lat: 40.6975, lng: -73.9875 }, // Nassau St
        { lat: 40.7005, lng: -73.9892 }, // Sands St
        { lat: 40.7060, lng: -73.9908 }, // Manhattan Bridge ramp
      ],
    });
    registerCorridor({
      id: "flatbush_sb", densityWeight: 0.68, cinematicWeight: 0.72,
      districtTags: ["downtown_brooklyn", "prospect_heights", "flatbush"],
      speedMps: 9, spawningConstraints: { minDistanceBufferMeters: 25, timeHeadwaySeconds: 2.5 },
      waypoints: [
        { lat: 40.7060, lng: -73.9908 }, { lat: 40.7005, lng: -73.9892 },
        { lat: 40.6975, lng: -73.9875 }, { lat: 40.6950, lng: -73.9858 },
        { lat: 40.6918, lng: -73.9835 }, { lat: 40.6898, lng: -73.9815 },
        { lat: 40.6875, lng: -73.9792 }, { lat: 40.6843, lng: -73.9765 },
        { lat: 40.6820, lng: -73.9748 }, { lat: 40.6790, lng: -73.9726 },
        { lat: 40.6760, lng: -73.9706 }, { lat: 40.6726, lng: -73.9680 },
        { lat: 40.6695, lng: -73.9662 }, { lat: 40.6651, lng: -73.9640 },
        { lat: 40.6609, lng: -73.9614 }, { lat: 40.6552, lng: -73.9590 },
        { lat: 40.6493, lng: -73.9564 },
      ],
    });

    // Bedford Ave — straight north-south
    registerCorridor({
      id: "bedford_ave_nb", densityWeight: 0.55, cinematicWeight: 0.85,
      districtTags: ["williamsburg", "greenpoint"],
      speedMps: 8, spawningConstraints: { minDistanceBufferMeters: 20, timeHeadwaySeconds: 3.0 },
      waypoints: [
        { lat: 40.6948, lng: -73.9568 }, { lat: 40.6985, lng: -73.9566 },
        { lat: 40.7020, lng: -73.9563 }, { lat: 40.7055, lng: -73.9561 },
        { lat: 40.7090, lng: -73.9559 }, { lat: 40.7125, lng: -73.9558 },
        { lat: 40.7160, lng: -73.9556 }, { lat: 40.7194, lng: -73.9554 },
        { lat: 40.7230, lng: -73.9553 }, { lat: 40.7265, lng: -73.9551 },
      ],
    });
    registerCorridor({
      id: "bedford_ave_sb", densityWeight: 0.50, cinematicWeight: 0.80,
      districtTags: ["greenpoint", "williamsburg"],
      speedMps: 8, spawningConstraints: { minDistanceBufferMeters: 20, timeHeadwaySeconds: 3.0 },
      waypoints: [
        { lat: 40.7265, lng: -73.9551 }, { lat: 40.7230, lng: -73.9553 },
        { lat: 40.7194, lng: -73.9554 }, { lat: 40.7160, lng: -73.9556 },
        { lat: 40.7125, lng: -73.9558 }, { lat: 40.7090, lng: -73.9559 },
        { lat: 40.7055, lng: -73.9561 }, { lat: 40.7020, lng: -73.9563 },
        { lat: 40.6985, lng: -73.9566 }, { lat: 40.6948, lng: -73.9568 },
      ],
    });

    // BQE / I-278 — curved elevated highway
    registerCorridor({
      id: "bqe_nb", densityWeight: 0.90, cinematicWeight: 0.65,
      districtTags: ["bay_ridge", "brooklyn_heights", "williamsburg", "greenpoint"],
      speedMps: 22, spawningConstraints: { minDistanceBufferMeters: 50, timeHeadwaySeconds: 1.8 },
      waypoints: [
        { lat: 40.6415, lng: -74.0175 }, { lat: 40.6488, lng: -74.0148 },
        { lat: 40.6558, lng: -74.0112 }, { lat: 40.6612, lng: -74.0082 },
        { lat: 40.6658, lng: -74.0042 }, { lat: 40.6702, lng: -73.9998 },
        { lat: 40.6742, lng: -73.9972 }, { lat: 40.6782, lng: -73.9955 },
        { lat: 40.6820, lng: -73.9950 }, { lat: 40.6862, lng: -73.9938 },
        { lat: 40.6905, lng: -73.9910 }, { lat: 40.6945, lng: -73.9875 },
        { lat: 40.6988, lng: -73.9840 }, { lat: 40.7025, lng: -73.9790 },
        { lat: 40.7068, lng: -73.9750 }, { lat: 40.7110, lng: -73.9705 },
        { lat: 40.7155, lng: -73.9655 }, { lat: 40.7198, lng: -73.9608 },
        { lat: 40.7240, lng: -73.9560 },
      ],
    });
    registerCorridor({
      id: "bqe_sb", densityWeight: 0.88, cinematicWeight: 0.62,
      districtTags: ["greenpoint", "williamsburg", "brooklyn_heights", "bay_ridge"],
      speedMps: 21, spawningConstraints: { minDistanceBufferMeters: 50, timeHeadwaySeconds: 1.8 },
      waypoints: [
        { lat: 40.7240, lng: -73.9560 }, { lat: 40.7198, lng: -73.9608 },
        { lat: 40.7155, lng: -73.9655 }, { lat: 40.7110, lng: -73.9705 },
        { lat: 40.7068, lng: -73.9750 }, { lat: 40.7025, lng: -73.9790 },
        { lat: 40.6988, lng: -73.9840 }, { lat: 40.6945, lng: -73.9875 },
        { lat: 40.6905, lng: -73.9910 }, { lat: 40.6862, lng: -73.9938 },
        { lat: 40.6820, lng: -73.9950 }, { lat: 40.6782, lng: -73.9955 },
        { lat: 40.6742, lng: -73.9972 }, { lat: 40.6702, lng: -73.9998 },
        { lat: 40.6658, lng: -74.0042 }, { lat: 40.6612, lng: -74.0082 },
        { lat: 40.6558, lng: -74.0112 }, { lat: 40.6488, lng: -74.0148 },
        { lat: 40.6415, lng: -74.0175 },
      ],
    });

    // Manhattan Bridge — bridge crossing, z-elevated
    registerCorridor({
      id: "manhattan_bridge_eb", densityWeight: 0.65, cinematicWeight: 0.95,
      isBridge: true, waterExclusion: true,
      districtTags: ["lower_manhattan", "downtown_brooklyn"],
      speedMps: 14, spawningConstraints: { minDistanceBufferMeters: 35, timeHeadwaySeconds: 2.0 },
      waypoints: [
        { lat: 40.7108, lng: -74.0022, z:  2 }, // Canal St approach
        { lat: 40.7095, lng: -73.9995, z: 12 }, // bridge approach ramp
        { lat: 40.7083, lng: -73.9975, z: 40 }, // deck start
        { lat: 40.7072, lng: -73.9950, z: 41 }, // mid-span
        { lat: 40.7062, lng: -73.9925, z: 41 }, // East River crossing
        { lat: 40.7052, lng: -73.9900, z: 40 }, // BK tower
        { lat: 40.7043, lng: -73.9880, z: 20 }, // BK ramp descent
        { lat: 40.7028, lng: -73.9868, z:  2 }, // Flatbush Ave Ext
      ],
    });
    registerCorridor({
      id: "manhattan_bridge_wb", densityWeight: 0.60, cinematicWeight: 0.90,
      isBridge: true, waterExclusion: true,
      districtTags: ["downtown_brooklyn", "lower_manhattan"],
      speedMps: 14, spawningConstraints: { minDistanceBufferMeters: 35, timeHeadwaySeconds: 2.0 },
      waypoints: [
        { lat: 40.7028, lng: -73.9868, z:  2 }, { lat: 40.7043, lng: -73.9880, z: 20 },
        { lat: 40.7052, lng: -73.9900, z: 40 }, { lat: 40.7062, lng: -73.9925, z: 41 },
        { lat: 40.7072, lng: -73.9950, z: 41 }, { lat: 40.7083, lng: -73.9975, z: 40 },
        { lat: 40.7095, lng: -73.9995, z: 12 }, { lat: 40.7108, lng: -74.0022, z:  2 },
      ],
    });

    // Williamsburg Bridge — z-elevated
    registerCorridor({
      id: "williamsburg_bridge_wb", densityWeight: 0.62, cinematicWeight: 0.88,
      isBridge: true, waterExclusion: true,
      districtTags: ["lower_east_side", "williamsburg"],
      speedMps: 13, spawningConstraints: { minDistanceBufferMeters: 35, timeHeadwaySeconds: 2.2 },
      waypoints: [
        { lat: 40.7150, lng: -73.9725, z:  2 }, // BK Delancey ramp
        { lat: 40.7145, lng: -73.9760, z: 12 }, // bridge deck
        { lat: 40.7140, lng: -73.9800, z: 18 }, // mid-span
        { lat: 40.7137, lng: -73.9845, z: 18 }, // East River
        { lat: 40.7135, lng: -73.9880, z: 18 }, // Manhattan tower
        { lat: 40.7132, lng: -73.9910, z: 10 }, // Manhattan ramp
        { lat: 40.7128, lng: -73.9940, z:  2 }, // Delancey St
      ],
    });
    registerCorridor({
      id: "williamsburg_bridge_eb", densityWeight: 0.58, cinematicWeight: 0.85,
      isBridge: true, waterExclusion: true,
      districtTags: ["lower_east_side", "williamsburg"],
      speedMps: 13, spawningConstraints: { minDistanceBufferMeters: 35, timeHeadwaySeconds: 2.2 },
      waypoints: [
        { lat: 40.7128, lng: -73.9940, z:  2 }, { lat: 40.7132, lng: -73.9910, z: 10 },
        { lat: 40.7135, lng: -73.9880, z: 18 }, { lat: 40.7137, lng: -73.9845, z: 18 },
        { lat: 40.7140, lng: -73.9800, z: 18 }, { lat: 40.7145, lng: -73.9760, z: 12 },
        { lat: 40.7150, lng: -73.9725, z:  2 },
      ],
    });

    // 4th Ave — Park Slope north-south
    registerCorridor({
      id: "fourth_ave_nb", densityWeight: 0.55, cinematicWeight: 0.60,
      districtTags: ["park_slope", "downtown_brooklyn"],
      speedMps: 9, spawningConstraints: { minDistanceBufferMeters: 22, timeHeadwaySeconds: 2.8 },
      waypoints: [
        { lat: 40.6555, lng: -73.9902 }, { lat: 40.6590, lng: -73.9900 },
        { lat: 40.6625, lng: -73.9898 }, { lat: 40.6660, lng: -73.9895 },
        { lat: 40.6695, lng: -73.9893 }, { lat: 40.6730, lng: -73.9892 },
        { lat: 40.6765, lng: -73.9890 }, { lat: 40.6800, lng: -73.9888 },
        { lat: 40.6835, lng: -73.9887 }, { lat: 40.6868, lng: -73.9885 },
      ],
    });

    // Broadway (Brooklyn) — diagonal northeast
    registerCorridor({
      id: "broadway_bk_ne", densityWeight: 0.52, cinematicWeight: 0.65,
      districtTags: ["bushwick", "bed_stuy", "ridgewood"],
      speedMps: 10, spawningConstraints: { minDistanceBufferMeters: 25, timeHeadwaySeconds: 2.5 },
      waypoints: [
        { lat: 40.6835, lng: -73.9402 }, { lat: 40.6875, lng: -73.9435 },
        { lat: 40.6912, lng: -73.9468 }, { lat: 40.6950, lng: -73.9502 },
        { lat: 40.6988, lng: -73.9538 }, { lat: 40.7025, lng: -73.9572 },
        { lat: 40.7060, lng: -73.9605 }, { lat: 40.7095, lng: -73.9640 },
      ],
    });

    // ── MANHATTAN ────────────────────────────────────────────────────────────

    // FDR Drive — East River waterfront, verified centerline
    registerCorridor({
      id: "fdr_nb", densityWeight: 0.88, cinematicWeight: 0.72,
      districtTags: ["lower_east_side", "midtown_east", "upper_east_side"],
      speedMps: 24, spawningConstraints: { minDistanceBufferMeters: 55, timeHeadwaySeconds: 1.6 },
      waypoints: [
        { lat: 40.7010, lng: -73.9728 }, { lat: 40.7038, lng: -73.9718 },
        { lat: 40.7068, lng: -73.9708 }, { lat: 40.7100, lng: -73.9700 },
        { lat: 40.7128, lng: -73.9698 }, { lat: 40.7158, lng: -73.9700 },
        { lat: 40.7190, lng: -73.9702 }, { lat: 40.7225, lng: -73.9700 },
        { lat: 40.7260, lng: -73.9695 }, { lat: 40.7295, lng: -73.9690 },
        { lat: 40.7330, lng: -73.9685 }, { lat: 40.7368, lng: -73.9680 },
        { lat: 40.7405, lng: -73.9675 },
      ],
    });
    registerCorridor({
      id: "fdr_sb", densityWeight: 0.85, cinematicWeight: 0.70,
      districtTags: ["upper_east_side", "midtown_east", "lower_east_side"],
      speedMps: 23, spawningConstraints: { minDistanceBufferMeters: 55, timeHeadwaySeconds: 1.6 },
      waypoints: [
        { lat: 40.7405, lng: -73.9675 }, { lat: 40.7368, lng: -73.9680 },
        { lat: 40.7330, lng: -73.9685 }, { lat: 40.7295, lng: -73.9690 },
        { lat: 40.7260, lng: -73.9695 }, { lat: 40.7225, lng: -73.9700 },
        { lat: 40.7190, lng: -73.9702 }, { lat: 40.7158, lng: -73.9700 },
        { lat: 40.7128, lng: -73.9698 }, { lat: 40.7100, lng: -73.9700 },
        { lat: 40.7068, lng: -73.9708 }, { lat: 40.7038, lng: -73.9718 },
        { lat: 40.7010, lng: -73.9728 },
      ],
    });

    // West Side Hwy / Route 9A
    registerCorridor({
      id: "west_side_hwy_nb", densityWeight: 0.82, cinematicWeight: 0.78,
      districtTags: ["tribeca", "chelsea", "hell's_kitchen", "upper_west_side"],
      speedMps: 20, spawningConstraints: { minDistanceBufferMeters: 50, timeHeadwaySeconds: 1.8 },
      waypoints: [
        { lat: 40.7005, lng: -74.0148 }, { lat: 40.7045, lng: -74.0150 },
        { lat: 40.7085, lng: -74.0148 }, { lat: 40.7125, lng: -74.0140 },
        { lat: 40.7162, lng: -74.0128 }, { lat: 40.7198, lng: -74.0115 },
        { lat: 40.7238, lng: -74.0105 }, { lat: 40.7278, lng: -74.0098 },
        { lat: 40.7318, lng: -74.0090 }, { lat: 40.7358, lng: -74.0080 },
        { lat: 40.7398, lng: -74.0068 },
      ],
    });
    registerCorridor({
      id: "west_side_hwy_sb", densityWeight: 0.78, cinematicWeight: 0.75,
      districtTags: ["upper_west_side", "hell's_kitchen", "chelsea", "tribeca"],
      speedMps: 19, spawningConstraints: { minDistanceBufferMeters: 50, timeHeadwaySeconds: 1.8 },
      waypoints: [
        { lat: 40.7398, lng: -74.0068 }, { lat: 40.7358, lng: -74.0080 },
        { lat: 40.7318, lng: -74.0090 }, { lat: 40.7278, lng: -74.0098 },
        { lat: 40.7238, lng: -74.0105 }, { lat: 40.7198, lng: -74.0115 },
        { lat: 40.7162, lng: -74.0128 }, { lat: 40.7125, lng: -74.0140 },
        { lat: 40.7085, lng: -74.0148 }, { lat: 40.7045, lng: -74.0150 },
        { lat: 40.7005, lng: -74.0148 },
      ],
    });

    // Broadway (Manhattan) — diagonal south-to-north
    registerCorridor({
      id: "broadway_manhattan_nb", densityWeight: 0.75, cinematicWeight: 0.80,
      districtTags: ["financial_district", "soho", "chelsea", "midtown"],
      speedMps: 8, spawningConstraints: { minDistanceBufferMeters: 20, timeHeadwaySeconds: 2.8 },
      waypoints: [
        { lat: 40.7075, lng: -74.0113 }, { lat: 40.7105, lng: -74.0102 },
        { lat: 40.7140, lng: -74.0088 }, { lat: 40.7168, lng: -74.0072 },
        { lat: 40.7200, lng: -74.0052 }, { lat: 40.7235, lng: -74.0028 },
        { lat: 40.7265, lng: -74.0002 }, { lat: 40.7298, lng: -73.9978 },
        { lat: 40.7335, lng: -73.9955 }, { lat: 40.7368, lng: -73.9932 },
        { lat: 40.7400, lng: -73.9902 }, { lat: 40.7438, lng: -73.9882 },
        { lat: 40.7478, lng: -73.9868 },
      ],
    });
    registerCorridor({
      id: "broadway_manhattan_sb", densityWeight: 0.70, cinematicWeight: 0.75,
      districtTags: ["midtown", "chelsea", "soho", "financial_district"],
      speedMps: 8, spawningConstraints: { minDistanceBufferMeters: 20, timeHeadwaySeconds: 2.8 },
      waypoints: [
        { lat: 40.7478, lng: -73.9868 }, { lat: 40.7438, lng: -73.9882 },
        { lat: 40.7400, lng: -73.9902 }, { lat: 40.7368, lng: -73.9932 },
        { lat: 40.7335, lng: -73.9955 }, { lat: 40.7298, lng: -73.9978 },
        { lat: 40.7265, lng: -74.0002 }, { lat: 40.7235, lng: -74.0028 },
        { lat: 40.7200, lng: -74.0052 }, { lat: 40.7168, lng: -74.0072 },
        { lat: 40.7140, lng: -74.0088 }, { lat: 40.7105, lng: -74.0102 },
        { lat: 40.7075, lng: -74.0113 },
      ],
    });

    // 6th Ave — north-only (one-way uptown)
    registerCorridor({
      id: "sixth_ave_nb", densityWeight: 0.70, cinematicWeight: 0.68,
      districtTags: ["soho", "greenwich_village", "midtown"],
      speedMps: 9, spawningConstraints: { minDistanceBufferMeters: 22, timeHeadwaySeconds: 2.5 },
      waypoints: [
        { lat: 40.7195, lng: -74.0028 }, { lat: 40.7228, lng: -74.0010 },
        { lat: 40.7258, lng: -73.9998 }, { lat: 40.7290, lng: -73.9988 },
        { lat: 40.7322, lng: -73.9978 }, { lat: 40.7355, lng: -73.9968 },
        { lat: 40.7388, lng: -73.9958 }, { lat: 40.7422, lng: -73.9948 },
        { lat: 40.7455, lng: -73.9935 }, { lat: 40.7485, lng: -73.9922 },
      ],
    });

    // Houston St — east-bound
    registerCorridor({
      id: "houston_st_eb", densityWeight: 0.62, cinematicWeight: 0.65,
      districtTags: ["soho", "lower_east_side"],
      speedMps: 9, spawningConstraints: { minDistanceBufferMeters: 22, timeHeadwaySeconds: 2.5 },
      waypoints: [
        { lat: 40.7280, lng: -74.0055 }, { lat: 40.7277, lng: -74.0008 },
        { lat: 40.7275, lng: -73.9975 }, { lat: 40.7272, lng: -73.9945 },
        { lat: 40.7270, lng: -73.9910 }, { lat: 40.7268, lng: -73.9875 },
        { lat: 40.7265, lng: -73.9840 }, { lat: 40.7263, lng: -73.9805 },
        { lat: 40.7260, lng: -73.9775 }, { lat: 40.7258, lng: -73.9742 },
      ],
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function init() {
    var bus = _bus();
    if (bus) {
      bus.on("broadcast:scheduleAdvanced",  _onScheduleAdvanced);
      bus.on("broadcast:atmosphereUpdated", _onAtmosphereUpdated);
    }
    _seedDefaultCorridors();
    _updateViewportBounds();

    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    if (drift && drift.driftLabel) {
      _state.phase = drift.driftLabel.toLowerCase().replace(/ /g, "_");
    }

    // Report preprocessing results
    var totalSamples = 0;
    Object.keys(_corridors).forEach(function (id) {
      totalSamples += _corridors[id].samples ? _corridors[id].samples.length : 0;
    });

    console.log("[TrafficFlowRuntime] initialized v1.1.0 —",
      Object.keys(_corridors).length, "corridors,",
      totalSamples, "arc-length samples,",
      "pool:", MAX_VEHICLES, "vehicles");
  }

  function render()             {}
  function spawnFlowVehicle(id) { _spawnVehicle(id); }
  function removeFlowVehicle(vehicleId) {
    for (var i = 0; i < _active.length; i++) {
      if (_pool[_active[i]].id === vehicleId) { _despawnAt(i); return; }
    }
  }
  function resize()             { _updateViewportBounds(); }
  function getCorridors()       { return Object.assign({}, _corridors); }
  function getState()           { return _state; }

  SBE.TrafficFlowRuntime = {
    init:              init,
    update:            update,
    render:            render,
    spawnFlowVehicle:  spawnFlowVehicle,
    removeFlowVehicle: removeFlowVehicle,
    registerCorridor:  registerCorridor,
    getVehicles:       getVehicles,
    getCorridors:      getCorridors,
    getState:          getState,
    resize:            resize,
  };

})(window);
