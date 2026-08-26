// ── Subway3DTrainActorLayer v2.0.0 ────────────────────────────────────────────
// 0825_MAPS_Ep2_3D_Train_Actor_Foundation_v1.0.0 (spec §7,12,16-17,20) +
// 0825_WOS_Global_3D_Train_Visibility_LOD_v1.0.0 (spec §5-17) — 3D Train
// Actor Adapter, now presenting MULTIPLE simultaneous logical trains.
// Status: active | Classification: presentation, Mapbox custom layer,
// dev-flag gated, OFF by default.
//
// Single-Car First Gate (spec §8), the 4-Car Consist Gate, and Full-Consist
// Rendering (2026-08-25, single selected train) are all PASS and are the
// FROZEN BASELINE this restructuring must not regress: Mercator-forced
// custom-layer rendering, the direct-distance rigid-link coupler solver
// (_computeCarPlacements — untouched below), per-car terrain-aware altitude
// (_resolveCarAltitudeM — untouched below), and the 35s motion-grace episode
// (_motionGraceDecision/MOTION_GRACE_MS — untouched below) all keep their
// exact existing math and behavior; only their SCOPE changes, from one
// module-level consist to one entry per logicalTrainId in `_consists`.
//
// Global visibility/LOD (2026-08-25): which trains get a consist at all is
// no longer "whichever train MTASubwayMapLayer.getSelectedTrain() names" —
// it is decided every tick by SBE.Subway3DVisibilityPolicy.resolveVisibility(),
// a pure module this file feeds with plain candidate data (see
// _buildCandidates() below). Per the governing spec's architecture —
// "Renderer draws · Selector chooses · Truth runtime knows" — ALL Mapbox
// projection/viewport work for candidate preparation lives HERE, never
// inside the policy module, which stays deterministic and Mapbox-free.
// The single-selected-train case is the first, and currently only proven,
// compatibility case: with no other trains in viewport/zoom range, the
// policy promotes exactly the selected (and/or riding) train, reproducing
// the prior behavior byte-for-byte. Explicitly NOT done this pass, per
// plan-review instruction: no 2D suppression/exclusivity — the existing 2D
// line-based presentation (mtaSubwayMapLayer.js, untouched) keeps rendering
// underneath every 3D-promoted train unconditionally.
//
// READ-ONLY against SubwayTrainMotionModel, SubwayLogicalRollingStockAuthority,
// MTASubwayMapLayer (polled via getSelectedTrain()/getActiveLogicalTrains(),
// never called back into), SubwayItineraryRideAuthority (getSnapshot() only),
// and SunroofCameraController (isActive() only). This file never mutates any
// of their state and never creates a second selection or camera authority
// (spec §17).
//
// Mapbox custom-layer skeleton (shared GL context, autoClear=false,
// renderer.resetState() before each render() call, MercatorCoordinate +
// fake-projectionMatrix placement trick) copied in structure from
// wall/systems/runtime/wallRuntimeGlbRenderLayer.js — the proven reference
// implementation already used elsewhere in this codebase for exactly this
// GL-context-sharing pattern.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '2.0.0';
  var LAYER_ID = 'wos-subway-3d-train-actor';
  var TICK_MS = 120; // matches mtaSubwayMapLayer.js ANIM_STEP_MS / subwayCameraSunroof.js CAMERA_STEP_MS,
                      // deliberately, to avoid the frame-budget contention those files' own headers
                      // document as a real, previously-fixed regression.

  // Motion-grace hold (car-instance lifecycle/live-tracking continuity
  // investigation) — SubwayLogicalRollingStockAuthority.reconcile() rebuilds
  // its vehicle-by-trip lookup fresh on every ~30s GTFS-realtime poll; a
  // single poll missing this trip's VehiclePosition entity (routine,
  // expected feed churn, not a real "train lost" event) makes
  // buildMotionState() return bodyCenter:null for that whole interval. 35s
  // — a full poll cadence (~30s) plus headroom — gives one missed reconcile
  // enough room to recover before this layer gives up and hides the car,
  // without leaving a long-lived ghost train if it's genuinely gone.
  var MOTION_GRACE_MS = 35000;

  // Fixed identity for the one module-level `_layer` object this file ever
  // creates — logged from onAdd/render/onRemove so a stale-reference/
  // duplicate-registration mismatch would be directly visible in
  // diagnostics, per the explicit lifecycle-diagnosis request.
  var LAYER_INSTANCE_ID = 'subway3d-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  // ── Dev flag (spec §16) — off by default, console/URL/localStorage only,
  // never a visible production UI control (Creative Interface Doctrine). ────
  var STORAGE_KEY = 'wos:subway3DTrainActor:enabled';

  function _readDevFlag() {
    try {
      var params = new URLSearchParams(global.location && global.location.search || '');
      var urlFlag = params.get('subway3d');
      if (urlFlag != null) return urlFlag === '1';
    } catch (e) {}
    try {
      var stored = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      return stored === '1';
    } catch (e) {}
    return false;
  }

  function _writeDevFlag(enabled) {
    try { global.localStorage && global.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) {}
  }

  // ── Module state ──────────────────────────────────────────────────────────
  var _mounted = false;
  var _active = false;
  var _map = null;
  var _camera = null;
  var _renderer = null;
  var _tickIntervalId = null;
  var _lastError = null;
  var _lastFrameAt = 0;
  var _fps = 0;

  // Per-logical-train consist state — logicalTrainId -> ConsistState. Global
  // 3D visibility means multiple trains can be simultaneously promoted, each
  // needing fully independent car instances, motion-grace episode, and
  // terrain-elevation cache — none of that is shareable across trains, so
  // every previously-singular scalar/array (car instances, instance ids/
  // creation times, per-slot heading/terrain fallback, motion-grace state,
  // last placement result) now lives inside one ConsistState per train
  // instead of at module scope.
  var _consists = {};

  function _createConsistState(logicalTrainId) {
    return {
      logicalTrainId: logicalTrainId,
      // Consist car instances — index = slot (0 = lead/front car). Every
      // array below is parallel-indexed to this one, one entry per rendered car.
      carInstances: [],
      carInstanceIds: [],       // per-slot instance id (lifecycle diagnostics)
      carInstanceCreatedAts: [], // per-slot creation timestamp
      lastKnownHeadingDeg: [],   // per-slot last-known heading fallback (dwell/degenerate segments)
      // Terrain-aware altitude — per-slot most recent successful
      // queryTerrainElevation() result (cars on a grade can legitimately
      // sit at different elevations from each other).
      lastValidTerrainElevationM: [],
      // Motion-grace hold state — see MOTION_GRACE_MS above. One episode per
      // train: all of a train's cars hold/recover/hide together, never
      // independently, exactly as the single-train baseline behaved.
      lastValidMotionAt: null,
      motionGraceActive: false,
      motionGraceExpiredLogged: false,
      // Result of the most recent _computeCarPlacements() call for this
      // train, cached purely for diagnostics.
      lastPlacementResult: null,
      createdAt: null, // when this train was first promoted — diagnostics only
      // Selected/riding priority transition tracking — diagnostics-only
      // latches so "acquired/released" logs fire once per transition, not
      // once per tick (spec §17).
      wasSelected: false,
      wasRiding: false,
    };
  }

  // TEMPORARY diagnostic-only forced dropout — motion-grace live-test
  // trigger. When set, _tick() treats every promoted train's CURRENT tick
  // bodyCenter as absent (feeding the exact same, already-tested
  // _motionGraceDecision() path a real GTFS omission would hit) without
  // touching the real selection, motion authority, or rolling-stock state —
  // motionModel is still queried normally underneath; only this layer's own
  // read of the result is overridden for the window. Null (the default) is
  // a strict no-op — production control flow is byte-for-byte unchanged
  // unless __debugForceMotionDropout() has been called. Applies globally
  // (all currently-promoted trains), not per-train — it is a blunt live-test
  // instrument, not a production feature. Remove alongside the other
  // __debug* exports once the continuity investigation is closed.
  var _debugForcedDropoutUntil = null;

  // Cached result of the most recent Subway3DVisibilityPolicy.resolveVisibility()
  // call — diagnostics only, read fresh in getSnapshot().
  var _lastVisibilityDecision = null;

  // ── Render-path lifecycle diagnostics — permanent (Single-Car Gate
  // PASS; the debug cube used during the invisible-render investigation has
  // been removed, but these counters/timestamps remain useful ongoing
  // health signals). ─────────────────────────────────────────────────────
  var _renderCallCount = 0;
  var _lastRenderAt = null;
  var _lastRenderDiag = null; // { mc, meterScale, headingDeg, projMatrixValid, projMatrixSample }
  var _onAddCallCount = 0;
  var _onRemoveCallCount = 0;
  var _lastOnAddAt = null;
  var _lastOnRemoveAt = null;

  function _three() { return global.THREE || null; }
  function _mapboxgl() { return global.mapboxgl || null; }
  function _mvr() { return SBE.MapboxViewportRuntime; }
  function _motionModel() { return SBE.SubwayTrainMotionModel; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority; }
  function _mapLayer() { return SBE.MTASubwayMapLayer; }
  // Read-only diagnostic reference ONLY — never called into, never a second
  // selection source. Exists so getSnapshot() can report whether the ride
  // authority's own "who am I riding" state (selectedLogicalTrainId) agrees
  // with MTASubwayMapLayer's separate map-click selection this layer
  // actually follows in _tick() below.
  function _rideAuthority() { return SBE.SubwayItineraryRideAuthority; }
  function _sunroof() { return SBE.SunroofCameraController; }
  function _store() { return SBE.MTASubwayTransitStore; }
  function _adapter() { return SBE.SubwayTrainCarVisualAdapter; }
  function _visibilityPolicy() { return SBE.Subway3DVisibilityPolicy; }

  // Flattens every promoted train's car instances into one array — render()
  // draws every car of every currently-promoted train each frame, train-
  // count-agnostic (this was already true of the single-train version, which
  // looped over its one array generically; only the source of that array
  // changes here).
  function _allCarInstances() {
    var all = [];
    Object.keys(_consists).forEach(function (tid) {
      var state = _consists[tid];
      for (var i = 0; i < state.carInstances.length; i++) all.push(state.carInstances[i]);
    });
    return all;
  }

  // Deterministic "lead" consist for backward-compatible single-train
  // diagnostics (getSnapshot()'s hasCarInstance/carInstanceId/etc. fields,
  // __debugGetCarGroup(), etc., all predate multi-train support and existing
  // console tooling reads them as "the one train"). Prefers the riding train,
  // then the selected train, then the lowest logicalTrainId — never an
  // arbitrary Object.keys() order.
  function _leadConsistState() {
    var keys = Object.keys(_consists);
    if (!keys.length) return null;
    var decision = _lastVisibilityDecision;
    if (decision) {
      if (decision.ridingTrainIds.length && _consists[decision.ridingTrainIds[0]]) return _consists[decision.ridingTrainIds[0]];
      if (decision.selectedTrainIds.length && _consists[decision.selectedTrainIds[0]]) return _consists[decision.selectedTrainIds[0]];
    }
    keys.sort();
    return _consists[keys[0]];
  }

  // ── Heading derivation — reimplemented locally against public data, same
  // technique as subwayCameraSunroof.js._bearingFromMotion/_dwellTravelSign
  // (this codebase's established per-consumer convention: no shared helper
  // exists for SUBWAY route-tangent/heading, unlike RACETRACK's
  // racetrackRaceCourseSampler.js). Held at last-known value when no real
  // directional evidence exists, never guessed. ─────────────────────────────
  function _dwellTravelSign(seg, bodyCenter, nextStopId) {
    if (!seg || !seg.points || seg.points.length < 2 || !nextStopId || !bodyCenter) return null;
    var store = _store();
    var nextStation = store ? store.getStation(nextStopId) : null;
    if (!nextStation) return null;
    var idx = seg.fromIdx;
    var i0 = Math.max(0, idx - 1), i1 = Math.min(seg.points.length - 1, idx + 1);
    if (i0 === i1) return null;
    var geomDLat = seg.points[i1][0] - seg.points[i0][0], geomDLon = seg.points[i1][1] - seg.points[i0][1];
    var travelDLon = nextStation.longitude - bodyCenter[0], travelDLat = nextStation.latitude - bodyCenter[1];
    var dot = geomDLat * travelDLat + geomDLon * travelDLon;
    if (dot === 0) return null;
    return dot > 0 ? 1 : -1;
  }

  // No longer called from _tick() as of the 4-Car Consist Gate — every car
  // (including the lead car) now derives its heading from its own local
  // pair of bracketing points via _computeCarPlacements() below, which
  // reuses _dwellTravelSign() the same way this function does. Kept
  // (correct, still tested) as the whole-body heading primitive it always
  // was, available for reuse if a future consumer needs one heading for
  // the WHOLE train rather than per-car.
  function _bearingFromMotion(motion, nextStopId) {
    var poly = motion.bodyPolyline;
    if (!poly || poly.length < 2) return null;
    var seg = motion.shapeSegment;
    var sign;
    if (seg && seg.toIdx !== seg.fromIdx) {
      sign = seg.toIdx > seg.fromIdx ? 1 : -1;
    } else {
      sign = _dwellTravelSign(seg, motion.bodyCenter, nextStopId);
      if (sign == null) return null;
    }
    var p0, p1;
    if (sign >= 0) { p1 = poly[poly.length - 1]; p0 = poly[poly.length - 2]; }
    else { p1 = poly[0]; p0 = poly[1]; }
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1];
    if (dx === 0 && dy === 0) return null;
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }

  // ── Motion-grace decision — pure, no THREE/Mapbox dependency (same
  // testability convention as _bearingFromMotion above). Given whether this
  // tick has a real bodyCenter and when motion was last valid, decides
  // whether to update normally, hold the frozen last transform, or give up
  // and hide. Never extrapolates — 'hold' means "change nothing."
  function _motionGraceDecision(hasBodyCenter, lastValidMotionAtMs, nowMs, graceMs) {
    if (hasBodyCenter) return { action: 'update' };
    if (lastValidMotionAtMs == null) return { action: 'hide_no_history' };
    var ageMs = nowMs - lastValidMotionAtMs;
    if (ageMs < graceMs) return { action: 'hold', ageMs: ageMs };
    return { action: 'hide_expired', ageMs: ageMs };
  }

  // ── Local metric projection — small-span (a few hundred meters at most,
  // this file only ever spans one consist's worth of couplers) flat/
  // equirectangular approximation around one fixed reference point,
  // accurate to sub-millimeter error at this scale. Used so the coupler
  // solve and midpoint below work in real meters (matching the rendered
  // rigid body directly) rather than raw lon/lat arithmetic, whose degree
  // units aren't uniform real-world distances.
  function _projectToLocalMeters(refLon, refLat, lon, lat) {
    var mPerDegLat = 111320;
    var mPerDegLon = 111320 * Math.cos(refLat * Math.PI / 180);
    return [(lon - refLon) * mPerDegLon, (lat - refLat) * mPerDegLat]; // [localX(east,m), localY(north,m)]
  }
  function _unprojectFromLocalMeters(refLon, refLat, x, y) {
    var mPerDegLat = 111320;
    var mPerDegLon = 111320 * Math.cos(refLat * Math.PI / 180);
    return [refLon + x / mPerDegLon, refLat + y / mPerDegLat]; // [lon, lat]
  }
  function _dist2D(a, b) { var dx = a[0] - b[0], dy = a[1] - b[1]; return Math.sqrt(dx * dx + dy * dy); }

  // Finds t in [0,1] along segment a->b (local meters) where the point is
  // exactly `radius` meters from `center` — i.e. where segment a->b crosses
  // the circle of that radius. Assumes (guaranteed by the caller's distance
  // check) that `a` is strictly inside the circle and `b` is on/outside it,
  // so exactly one valid root exists; returns the smallest (first outward
  // crossing walking from a toward b).
  function _solveCircleSegmentIntersection(a, b, center, radius) {
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var fx = a[0] - center[0], fy = a[1] - center[1];
    var qa = dx * dx + dy * dy;
    if (qa === 0) return null;
    var qb = 2 * (fx * dx + fy * dy);
    var qc = fx * fx + fy * fy - radius * radius;
    var disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return null;
    var sqrtDisc = Math.sqrt(disc);
    var candidates = [(-qb - sqrtDisc) / (2 * qa), (-qb + sqrtDisc) / (2 * qa)]
      .filter(function (t) { return t >= -1e-9 && t <= 1 + 1e-9; })
      .sort(function (x, y) { return x - y; });
    if (!candidates.length) return null;
    return Math.max(0, Math.min(1, candidates[0]));
  }

  // ── Consist car placement — pure, no THREE/Mapbox dependency (same
  // testability convention as _bearingFromMotion/_motionGraceDecision
  // above). Walks the SAME real shapeSegment.points geometry the single-car
  // heading derivation already reads (never a second motion/GTFS source).
  //
  // RIGID-LINK / DIRECT-DISTANCE coupler model (corrected from an earlier
  // cumulative-ARC-length version that still produced visible staircasing:
  // the rendered GLB is a fixed-length rigid ~18.3m body — confirmed via
  // direct measurement against the real asset, see subwayTrainCarVisualAdapter's
  // FrontBumper/RearBumper bounds — never rescaled per placement, so for its
  // physical ends to actually land on adjacent cars' coupler points, the
  // DIRECT/straight-line distance between consecutive couplers must equal
  // CANONICAL_CAR_LENGTH_M, not the arc length walked to reach them. Arc
  // length only equals direct distance on a perfectly straight segment —
  // on any curve, arc > chord, which left every car's rigid body too long
  // for the span its couplers implied, producing exactly the reported
  // zigzag/staircasing.)
  //
  // Derives N+1 ordered "coupler" points P0..PN along the real geometry:
  // P0 = the front tip. Each subsequent P[i] is solved (not walked in fixed
  // arc steps) as the point ON THE REAL POLYLINE, behind P[i-1] in consist
  // order, whose DIRECT distance from P[i-1] first reaches exactly
  // CANONICAL_CAR_LENGTH_M — found by walking real vertices and, once a
  // vertex is reached whose direct distance from P[i-1] meets/exceeds the
  // target, solving the exact crossing point on that one real segment via
  // circle/line-segment intersection (in local projected meters — see
  // _projectToLocalMeters above — not spherical geometry, negligible error
  // at this span). Car k's front endpoint is P[k], its rear endpoint is
  // P[k+1] — THE SAME ARRAY OBJECT car (k+1)'s front endpoint uses, so
  // car[k].rearCoupler === car[k+1].frontCoupler holds by construction
  // (reference equality). Each car's center is the METRIC midpoint of its
  // own two coupler points (local meters, unprojected back to lon/lat —
  // not naive lon/lat averaging), and its heading is the bearing from rear
  // to front.
  //
  // The front tip's continuous index is always shapeSegment.toIdx — "to" is,
  // by construction, the index the train is heading TOWARD, i.e. the front,
  // regardless of whether toIdx is numerically greater or less than
  // fromIdx. Walking "into" the train from the front therefore steps toward
  // fromIdx: down in index when toIdx>fromIdx, up in index when toIdx<fromIdx.
  //
  // If available geometry runs out before a P[i] can be solved (no real
  // vertex ever reaches the target direct distance from P[i-1]), that
  // coupler — and every car that would need it — is left UNPLACED, never
  // clamped onto the terminal vertex and never extrapolated past real
  // geometry. geometryInsufficient/requestedCarCount/placedCarCount report
  // this honestly for the caller and for diagnostics.
  function _computeCarPlacements(shapeSegment, bodyCenter, nextStopId, requestedCarCount, perCarLengthMeters) {
    var MotionModel = _motionModel();
    var empty = { placements: [], requestedCarCount: requestedCarCount, placedCarCount: 0, geometryInsufficient: true };
    if (!MotionModel || !shapeSegment || !shapeSegment.points || shapeSegment.points.length < 2 ||
        !requestedCarCount || requestedCarCount <= 0 || !perCarLengthMeters || perCarLengthMeters <= 0) {
      return empty;
    }

    var points = shapeSegment.points; // [lat,lon] per point — this file's established shapeSegment convention
    var sign;
    if (shapeSegment.toIdx !== shapeSegment.fromIdx) {
      sign = shapeSegment.toIdx > shapeSegment.fromIdx ? 1 : -1;
    } else {
      sign = _dwellTravelSign(shapeSegment, bodyCenter, nextStopId);
      if (sign == null) return empty;
    }
    var dirStep = sign >= 0 ? -1 : 1; // stepping INTO the train from its front tip

    var frontIdx = shapeSegment.toIdx;
    var frontLonLat = MotionModel.__pointAtContinuousIndex(points, frontIdx);
    var refLon = frontLonLat[0], refLat = frontLonLat[1]; // fixed local-projection reference for this whole call

    // couplerLocal[0] = P0 = the front tip, which is (0,0) in local meters
    // relative to itself by definition.
    var couplerLocal = [[0, 0]];
    var idx = frontIdx;
    var cursorLocal = [0, 0];

    for (var i = 1; i <= requestedCarCount; i++) {
      var anchor = couplerLocal[i - 1]; // P[i-1] — the circle center for this coupler's solve
      var found = null;

      while (true) {
        var nextIdx = dirStep > 0 ? Math.floor(idx) + 1 : Math.ceil(idx) - 1;
        if (nextIdx < 0 || nextIdx > points.length - 1) break; // geometry ran out short of this coupler point
        var nextLonLat = [points[nextIdx][1], points[nextIdx][0]]; // [lat,lon] -> [lon,lat]
        var nextLocal = _projectToLocalMeters(refLon, refLat, nextLonLat[0], nextLonLat[1]);

        if (_dist2D(nextLocal, anchor) < perCarLengthMeters) {
          // Real target distance not yet reached — this whole segment is
          // still inside the circle, advance the cursor and keep walking.
          idx = nextIdx;
          cursorLocal = nextLocal;
          continue;
        }

        // The circle (center=anchor, radius=perCarLengthMeters) is crossed
        // somewhere on THIS segment — solve the exact point.
        var t = _solveCircleSegmentIntersection(cursorLocal, nextLocal, anchor, perCarLengthMeters);
        if (t == null) break; // degenerate (shouldn't occur given the distance check above) — stay safe, don't fabricate
        var solved = [cursorLocal[0] + (nextLocal[0] - cursorLocal[0]) * t, cursorLocal[1] + (nextLocal[1] - cursorLocal[1]) * t];
        idx = idx + (dirStep > 0 ? t : -t); // fractional cursor — next coupler's search still targets the same nextIdx first
        cursorLocal = solved;
        found = solved;
        break;
      }

      if (!found) break; // this coupler point, and every one after it, is unreachable
      couplerLocal.push(found);
    }

    // A car k (0-indexed) is placeable only if BOTH couplerLocal[k] (front)
    // and couplerLocal[k+1] (rear) were solved.
    var placeableCarCount = couplerLocal.length - 1;
    var carsToPlace = Math.min(requestedCarCount, placeableCarCount);

    // Convert each solved coupler to lon/lat exactly once — car k and car
    // k+1 then share the SAME array reference for their common coupler.
    var couplerLonLat = couplerLocal.map(function (p) { return _unprojectFromLocalMeters(refLon, refLat, p[0], p[1]); });

    var placements = [];
    for (var k = 0; k < carsToPlace; k++) {
      var frontLocal = couplerLocal[k], rearLocal = couplerLocal[k + 1];
      var dx = frontLocal[0] - rearLocal[0], dy = frontLocal[1] - rearLocal[1];
      var headingDeg = (dx === 0 && dy === 0) ? null : (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      var centerLocal = [(frontLocal[0] + rearLocal[0]) / 2, (frontLocal[1] + rearLocal[1]) / 2];
      var centerLonLat = _unprojectFromLocalMeters(refLon, refLat, centerLocal[0], centerLocal[1]);
      placements.push({
        carIndex: k,
        lon: centerLonLat[0], lat: centerLonLat[1],
        headingDeg: headingDeg,
        frontCoupler: couplerLonLat[k],       // === couplerLonLat[k], same reference car k-1 (if any) used as its rearCoupler
        rearCoupler: couplerLonLat[k + 1],    // === couplerLonLat[k+1], same reference car k+1 (if any) uses as its frontCoupler
      });
    }

    return {
      placements: placements,
      requestedCarCount: requestedCarCount,
      placedCarCount: placements.length,
      geometryInsufficient: placements.length < requestedCarCount,
    };
  }

  // ── Mapbox custom layer ───────────────────────────────────────────────────
  var _layer = {
    id: LAYER_ID,
    type: 'custom',
    renderingMode: '3d',
    onAdd: function (map, gl) {
      _onAddCallCount += 1;
      _lastOnAddAt = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      console.log('[Subway3DTrainActorLayer] onAdd — instance:', LAYER_INSTANCE_ID, '| call #' + _onAddCallCount);
      var THREE = _three();
      if (!THREE) { _lastError = 'three_unavailable'; return; }
      _camera = new THREE.Camera();
      _renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      _renderer.autoClear = false;
      console.log('[Subway3DTrainActorLayer] onAdd — renderer ready, instance:', LAYER_INSTANCE_ID);
    },
    render: function (gl, matrix) {
      _renderCallCount += 1;
      _lastRenderAt = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      if (_renderCallCount === 1) {
        console.log('[Subway3DTrainActorLayer] render — FIRST call, instance:', LAYER_INSTANCE_ID);
      }
      var _carInstances = _allCarInstances();
      if (!_renderer || !_camera || !_carInstances.length) return;
      var THREE = _three();
      var mapboxgl = _mapboxgl();
      if (!THREE || !mapboxgl) return;

      var projMatrixBase = new THREE.Matrix4().fromArray(matrix);

      // Root cause of the invisible-render bug (found via wall/systems/debug/
      // mapboxThreeDiagnosticLayer.js's own documented fix, confirmed against
      // the actual production pattern in worldSpaceVehicleLayer.js:1834-1837
      // — "translate × scale(s, -s, s...) — the -Y corrects Mapbox Mercator
      // handedness"): Mapbox Mercator Y increases SOUTH, Three.js's own Y-up
      // convention increases NORTH/up. A positive-Y scale here left every
      // mesh's winding order inverted end-to-end, so THREE's default
      // back-face culling discarded literally every triangle — this
      // reproduced with a trivial unlit debug cube through the exact same
      // callback, ruling out the car's own model/material. Neither this
      // file's original code nor wallRuntimeGlbRenderLayer.js (the reference
      // it was modeled on) had this negation — both share the same class of
      // bug; wallRuntimeGlbRenderLayer.js was never actually confirmed
      // visible this session either.
      //
      // Root cause of the GLB-invisible-under-depthTest bug (confirmed live,
      // 2026-08-25): Mapbox's own draw_custom.js sets up correct, intended
      // depth state (LEQUAL, read-write) for renderingMode:'3d' layers —
      // depth sharing with terrain/buildings is the documented, supported
      // mechanism, not something to work around. Cars were depth-failing
      // because THEIR OWN altitude was a flat constant while the live
      // style's terrain (mapbox-dem, exaggeration 3) varies real elevation
      // substantially along the route. Fixed via terrain-aware altitude
      // (see _tick()/_resolveCarAltitudeM()) computed per car — no depth
      // clear needed, correct depth-testing/occlusion for every car.
      //
      // Each car is rendered with its OWN mc/modelMatrix (its own lon/lat/
      // altM/heading, from its own setTransform() call in _tick()) — one
      // renderer.render() call per car, same shared _renderer/_camera.
      for (var ci = 0; ci < _carInstances.length; ci++) {
        var carInst = _carInstances[ci];
        if (!carInst) continue;
        var t = carInst.getLastTransform();
        if (t.lon == null || t.lat == null) continue;

        var modelMatrix = new THREE.Matrix4();
        var rotMatrix = new THREE.Matrix4();

        var mc = mapboxgl.MercatorCoordinate.fromLngLat([t.lon, t.lat], t.altM || 0);
        var meterScale = mc.meterInMercatorCoordinateUnits();

        modelMatrix.set(
          meterScale, 0, 0, mc.x,
          0, -meterScale, 0, mc.y,
          0, 0, meterScale, mc.z,
          0, 0, 0, 1
        );
        rotMatrix.makeRotationZ(-(t.headingDeg || 0) * Math.PI / 180);
        modelMatrix.multiply(rotMatrix);

        var finalMatrix = new THREE.Matrix4().copy(projMatrixBase).multiply(modelMatrix);
        _camera.projectionMatrix = finalMatrix;

        if (ci === 0) {
          // Lead-car diagnostic — preserved shape/consumers from Single-Car Gate.
          var fm = finalMatrix.elements;
          _lastRenderDiag = {
            mc: { x: mc.x, y: mc.y, z: mc.z },
            meterScale: meterScale,
            headingDeg: t.headingDeg || 0,
            projMatrixValid: fm.every(function (v) { return typeof v === 'number' && isFinite(v); }),
            projMatrixSample: [fm[0], fm[5], fm[10], fm[12], fm[13], fm[14]],
          };
        }

        _renderer.resetState();
        _renderer.render(carInst.group, _camera);
      }
    },
    onRemove: function () {
      _onRemoveCallCount += 1;
      _lastOnRemoveAt = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
      console.log('[Subway3DTrainActorLayer] onRemove — instance:', LAYER_INSTANCE_ID, '| call #' + _onRemoveCallCount);
      _renderer = null;
      _camera = null;
    },
  };

  // ── Lifecycle: Mapbox is the source of mount truth ─────────────────────────
  // Root cause of the render()-never-called bug, confirmed both in the
  // automated pane and in a real foreground browser (fps>0 on the tick loop,
  // renderCallCount stuck at 0): this layer was mounted exactly once via
  // map.addLayer() and never rechecked. This large app's own MapsGeographic-
  // StyleAuthority/palette/world systems can trigger a real Mapbox style
  // reload (setStyle/publish), which drops ALL custom layers from Mapbox's
  // actual internal style — while this file's own `_mounted` flag stayed
  // `true` forever, so it never noticed or re-added itself. Fixed by copying
  // wall/systems/render/worldSpaceVehicleLayer.js's proven pattern
  // (map.getLayer() as ground truth, style.load + debounced styledata
  // remount, state-driven not event-driven — only remounts when integrity is
  // actually gone) rather than inventing a new mechanism.
  var _lastHardRemountAt = 0;
  var _lastHardRemountReason = null;
  var _lastHardRemountResult = null;
  var _hardRemountInFlight = false;
  var _styleRemountBound = false;
  var _styleRemountTimer = null;
  var STYLE_REMOUNT_DEBOUNCE_MS = 750;
  var _styledataCount = 0;

  function _isLayerMounted() {
    try { return !!(_map && typeof _map.getLayer === 'function' && _map.getLayer(LAYER_ID)); }
    catch (e) { return false; }
  }

  function _needsRemount() {
    return !_isLayerMounted() || !_renderer || !_camera;
  }

  function _hardRemountLayer(reason) {
    if (!_map) return false;
    if (_hardRemountInFlight) return false;
    _hardRemountInFlight = true;
    _lastHardRemountAt = Date.now();
    _lastHardRemountReason = reason || 'manual';
    try {
      if (_isLayerMounted()) {
        try { _map.removeLayer(LAYER_ID); } catch (removeErr) {}
      }
      // Reset renderer/camera so onAdd() rebuilds them against whatever GL
      // context Mapbox hands back — never reuse a renderer built against a
      // possibly-stale context after a style reload.
      if (_renderer) { try { _renderer.dispose(); } catch (e) {} }
      _renderer = null;
      _camera = null;
      try {
        _map.addLayer(_layer);
        _mounted = true;
        _lastHardRemountResult = 'mounted';
        try { _map.triggerRepaint(); } catch (paintErr) {}
        console.log('[Subway3DTrainActorLayer] hard remount OK — reason:', reason, '| instance:', LAYER_INSTANCE_ID);
        return true;
      } catch (addErr) {
        _lastHardRemountResult = 'add_failed: ' + (addErr && addErr.message ? addErr.message : String(addErr));
        _lastError = _lastHardRemountResult;
        console.warn('[Subway3DTrainActorLayer] hard remount failed:', _lastHardRemountResult);
        return false;
      }
    } finally {
      _hardRemountInFlight = false;
    }
  }

  // Remounts are state-driven, not event-driven: style.load is the primary
  // "a real style (re)load just happened" signal, styledata is a debounced
  // safety net — either only actually remounts if _needsRemount() is true at
  // the time the debounce fires, so normal tile/source churn (which fires
  // styledata constantly) never causes spurious remounts.
  function _scheduleStyleRemount(reason) {
    if (_styleRemountTimer) global.clearTimeout(_styleRemountTimer);
    _styleRemountTimer = global.setTimeout(function () {
      _styleRemountTimer = null;
      if (!_active) return;
      if (!_needsRemount()) return;
      _hardRemountLayer(reason || 'styledata_debounced');
    }, STYLE_REMOUNT_DEBOUNCE_MS);
  }

  function _bindStyleRemount(map) {
    if (!map || _styleRemountBound || typeof map.on !== 'function') return;
    _styleRemountBound = true;
    map.on('style.load', function () { _scheduleStyleRemount('style_load'); });
    map.on('styledata', function () { _styledataCount += 1; _scheduleStyleRemount('styledata_debounced'); });
  }

  function _ensureLayer() {
    var mvr = _mvr();
    var map = mvr && mvr.getMap ? mvr.getMap() : null;
    if (!map) return false;
    _map = map;
    _bindStyleRemount(map);
    // Trust Mapbox, not any internal flag — if it's already mounted AND
    // onAdd actually ran (renderer/camera present), there's nothing to do.
    if (_isLayerMounted() && _renderer && _camera) { _mounted = true; return true; }
    return _hardRemountLayer('ensure_layer');
  }

  function _removeLayer() {
    try { if (_map && _isLayerMounted()) _map.removeLayer(LAYER_ID); } catch (e) {}
    _mounted = false;
  }

  // Extra safety net beyond style.load/styledata (state-driven, same
  // _needsRemount() check, just on a plain timer so a remount is caught even
  // if neither Mapbox event fires for whatever reason). Throttled well below
  // TICK_MS's own cadence to stay cheap.
  var TICK_INTEGRITY_CHECK_MS = 2000;
  var _lastIntegrityCheckAt = 0;

  // Resolves ONE car's altitude for the CURRENT tick's position — prefers a
  // fresh, valid live terrain sample AT THAT CAR'S OWN POSITION; falls back
  // to that car's own last valid sample if this tick's query fails/is
  // unavailable (e.g. DEM tile not yet loaded at this exact spot); falls
  // back to 0 only if that car has never had a valid sample. Per-slot
  // (slotIndex into the OWNING CONSIST's own terrainSlots array — passed in
  // explicitly now that terrain history is per-train, not module-global)
  // because cars on a real grade can legitimately sit at different
  // elevations from each other. Never throws — queryTerrainElevation is a
  // real Mapbox API call against live tile state, defensively guarded.
  function _resolveCarAltitudeM(lon, lat, slotIndex, terrainSlots) {
    var elev = null;
    try {
      if (_map && typeof _map.queryTerrainElevation === 'function') {
        elev = _map.queryTerrainElevation([lon, lat], { exaggerated: true });
      }
    } catch (e) {}
    if (typeof elev === 'number' && isFinite(elev)) {
      terrainSlots[slotIndex] = elev;
      return elev;
    }
    var lastValid = terrainSlots[slotIndex];
    return (typeof lastValid === 'number') ? lastValid : 0;
  }

  // ── Tick loop — read-only against motion/identity/selection authorities ───
  // Disposes ONE train's consist entirely and removes it from `_consists` —
  // used when the visibility policy no longer promotes that train (retired
  // from 3D) and on deactivate(). A different train's motion history/car
  // count/terrain cache is never reused for another train, exactly as the
  // single-train version disposed-and-rebuilt on reselection.
  function _disposeConsist(logicalTrainId, reasonLabel) {
    var state = _consists[logicalTrainId];
    if (!state) return;
    console.log('[Subway3DTrainActorLayer][lifecycle] retired from 3D — logicalTrainId', logicalTrainId,
      '| disposing', state.carInstances.length, 'car instance(s) —', reasonLabel);
    state.carInstances.forEach(function (inst) { if (inst) inst.disposeInstance(); });
    delete _consists[logicalTrainId];
  }

  function _disposeAllConsists(reasonLabel) {
    Object.keys(_consists).forEach(function (tid) { _disposeConsist(tid, reasonLabel); });
  }

  // Builds plain candidate metadata for every real active logical train —
  // this is the ONLY place in this file (or in the whole feature) that calls
  // map.project()/reads viewport pixel geometry, per the explicit plan-review
  // boundary: Subway3DVisibilityPolicy stays deterministic/Mapbox-free and
  // only ever consumes this already-computed data. Position lookup uses the
  // CHEAP SubwayLogicalRollingStockAuthority.getPositionState() (not the
  // expensive motionModel.buildMotionState(), which is reserved for exactly
  // one call per PROMOTED train per tick, below in _tickOneConsist).
  //
  // VIEWPORT_PADDING_PX matches this codebase's own established convention
  // (busPresentationSelector.js's DEFAULT_VIEWPORT_PAD = 160), reused
  // deliberately rather than inventing a new pad value.
  var VIEWPORT_PADDING_PX = 160;

  function _buildCandidates(map, rollingStock, mapLayer, rideAuthority) {
    var candidates = [];
    if (!map || !rollingStock || typeof rollingStock.getActiveLogicalTrains !== 'function') return candidates;

    var selected = mapLayer && mapLayer.getSelectedTrain ? mapLayer.getSelectedTrain() : null;
    var selectedTrainId = (selected && selected.train) ? selected.train.id : null;

    var rideSnap = rideAuthority && rideAuthority.getSnapshot ? rideAuthority.getSnapshot() : null;
    var ridingTrainId = (rideSnap && (rideSnap.status === 'riding' || rideSnap.status === 'approaching_exit')) ?
      rideSnap.selectedLogicalTrainId : null;

    var canvas = (typeof map.getCanvas === 'function') ? map.getCanvas() : null;
    var vw = canvas ? (canvas.clientWidth || canvas.width || 0) : 0;
    var vh = canvas ? (canvas.clientHeight || canvas.height || 0) : 0;
    var cx = vw / 2, cy = vh / 2;

    var trains = rollingStock.getActiveLogicalTrains();
    for (var i = 0; i < trains.length; i++) {
      var train = trains[i];
      var tid = train && train.id;
      if (!tid) continue;
      var isSelected = tid === selectedTrainId;
      var isRiding = tid === ridingTrainId;

      var posState = rollingStock.getPositionState ? rollingStock.getPositionState(tid) : null;
      var lonLat = (posState && posState.position) ? posState.position : null;

      var inViewport = false, distanceFromCenterPx = null;
      if (lonLat && typeof map.project === 'function') {
        try {
          var pt = map.project([lonLat[0], lonLat[1]]);
          inViewport = pt.x >= -VIEWPORT_PADDING_PX && pt.x <= vw + VIEWPORT_PADDING_PX &&
            pt.y >= -VIEWPORT_PADDING_PX && pt.y <= vh + VIEWPORT_PADDING_PX;
          var dx = pt.x - cx, dy = pt.y - cy;
          distanceFromCenterPx = Math.sqrt(dx * dx + dy * dy);
        } catch (e) {}
      }

      // Riding/selected trains are always candidates even without a
      // resolvable position — the policy promotes them unconditionally
      // either way (spec §6.4/§6.5). Everything else needs a real projected
      // position to ever be considered for automatic promotion.
      if (!lonLat && !isSelected && !isRiding) continue;

      candidates.push({
        logicalTrainId: tid,
        distanceFromCenterPx: distanceFromCenterPx,
        inViewport: inViewport,
        isSelected: isSelected,
        isRiding: isRiding,
      });
    }
    return candidates;
  }

  // Creates a fresh ConsistState with its real car instances for a newly-
  // promoted train — extracted verbatim from the prior single-train
  // creation block (same targetCarCount derivation, same identity/fallback
  // logic), now writing into a per-train state object instead of module
  // scope. Returns null if no car instances could be created (adapter not
  // ready) so the caller never registers an empty consist.
  function _createConsistStateWithCars(logicalTrainId, rollingStock, adapter, creationNow) {
    var state = _createConsistState(logicalTrainId);
    state.createdAt = creationNow;

    var train = (rollingStock && rollingStock.getLogicalTrain) ? rollingStock.getLogicalTrain(logicalTrainId) : null;
    var consist = (train && rollingStock.getLogicalConsist) ? rollingStock.getLogicalConsist(train.consistId) : null;
    var configuredCarCount = (consist && typeof consist.configuredCarCount === 'number') ? consist.configuredCarCount : 1;
    // Bounded only by the rolling-stock system's own real ceiling — no
    // presentation-specific cap. Falls back to configuredCarCount itself
    // (i.e. no additional cap at all) in the defensive case where the
    // authority's own constant is somehow unavailable.
    var maxLogicalCarCount = (rollingStock && typeof rollingStock.MAX_LOGICAL_CAR_COUNT === 'number') ?
      rollingStock.MAX_LOGICAL_CAR_COUNT : configuredCarCount;
    var targetCarCount = Math.max(1, Math.min(maxLogicalCarCount, configuredCarCount));
    var logicalCars = (consist && rollingStock.getLogicalCarsForConsist) ? rollingStock.getLogicalCarsForConsist(consist.id) : [];

    for (var slot = 0; slot < targetCarCount; slot++) {
      var realCar = logicalCars[slot];
      // Real LogicalCar identity where the rolling-stock authority has one
      // (its own sr-car-* id) — synthetic fallback only if unavailable
      // (e.g. authority not yet reconciled this train).
      var identity = realCar ?
        { train_id: logicalTrainId, car_index: slot, id: realCar.id } :
        { train_id: logicalTrainId, car_index: slot, id: logicalTrainId + ':car' + slot };
      var inst = adapter.createInstance(identity);
      if (!inst) break; // shared-asset not ready — stop, whatever's already pushed stays valid
      state.carInstances.push(inst);
      state.carInstanceIds.push('car-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '-s' + slot);
      state.carInstanceCreatedAts.push(creationNow);
      state.lastKnownHeadingDeg.push(0);
      state.lastValidTerrainElevationM.push(null);
    }
    if (!state.carInstances.length) return null;
    console.log('[Subway3DTrainActorLayer][lifecycle] created', state.carInstances.length, 'car instance(s)',
      '(requested', targetCarCount, 'from configuredCarCount', configuredCarCount, ')',
      'for logicalTrainId', logicalTrainId, 'ids:', state.carInstanceIds);
    return state;
  }

  // Per-train motion/grace/placement/transform update — exactly the prior
  // single-train _tick() body's second half, unchanged math, now scoped to
  // one ConsistState. Exactly one motionModel.buildMotionState() call here,
  // per PROMOTED train, per tick (never per candidate — spec §12).
  function _tickOneConsist(logicalTrainId, state, motionModel, rollingStock, now) {
    var motion = motionModel.buildMotionState(logicalTrainId);
    var forcedDropoutActive = _debugForcedDropoutUntil != null;
    var hasBodyCenter = !forcedDropoutActive && !!(motion && motion.bodyCenter);
    var graceDecision = _motionGraceDecision(hasBodyCenter, state.lastValidMotionAt, now, MOTION_GRACE_MS);

    if (graceDecision.action === 'update') {
      if (state.motionGraceActive) {
        console.log('[Subway3DTrainActorLayer][lifecycle] recovered from motion grace — logicalTrainId', logicalTrainId,
          '|', state.carInstances.length, 'car instance(s) | held for', Math.round(now - state.lastValidMotionAt), 'ms');
        state.motionGraceActive = false;
      }
      state.motionGraceExpiredLogged = false; // fresh valid motion — a future expiry is a new episode, log it again
      state.lastValidMotionAt = now;

      var posState = rollingStock && rollingStock.getPositionState ? rollingStock.getPositionState(logicalTrainId) : null;
      var nextStopId = posState ? posState.nextStopId : null;
      var placementResult = _computeCarPlacements(motion.shapeSegment, motion.bodyCenter, nextStopId,
        state.carInstances.length, motionModel.CANONICAL_CAR_LENGTH_M);
      state.lastPlacementResult = placementResult;

      for (var pi = 0; pi < state.carInstances.length; pi++) {
        var carInst = state.carInstances[pi];
        var placement = placementResult.placements[pi];
        if (!placement) { carInst.setVisibility(false); continue; } // geometry insufficient for this slot — never stacked
        var headingDeg = placement.headingDeg;
        if (headingDeg == null) headingDeg = state.lastKnownHeadingDeg[pi]; else state.lastKnownHeadingDeg[pi] = headingDeg;
        var terrainAltM = _resolveCarAltitudeM(placement.lon, placement.lat, pi, state.lastValidTerrainElevationM);
        carInst.setVisibility(true);
        carInst.setTransform(placement.lon, placement.lat, terrainAltM, headingDeg);
      }
    } else if (graceDecision.action === 'hold') {
      if (!state.motionGraceActive) {
        state.motionGraceActive = true;
        console.log('[Subway3DTrainActorLayer][lifecycle] entered motion grace — logicalTrainId', logicalTrainId,
          '|', state.carInstances.length, 'car instance(s) | holding last valid transforms for up to', MOTION_GRACE_MS, 'ms');
      }
      // Deliberately no setVisibility/setTransform calls on any car — freeze
      // the whole consist exactly at whatever the last successful 'update'
      // established. No extrapolation. The grace decision itself stays
      // singular (one motion state for the whole train), so all cars
      // hold/recover/hide together, never independently.
    } else {
      // 'hide_expired' or 'hide_no_history' — log the expiry transition
      // exactly once per episode (latched), not on every tick the consist
      // stays hidden afterward.
      if (graceDecision.action === 'hide_expired' && !state.motionGraceExpiredLogged) {
        state.motionGraceExpiredLogged = true;
        console.log('[Subway3DTrainActorLayer][lifecycle] motion grace expired -> hiding — logicalTrainId', logicalTrainId,
          '|', state.carInstances.length, 'car instance(s) | age', Math.round(graceDecision.ageMs), 'ms >=', MOTION_GRACE_MS, 'ms');
      }
      state.motionGraceActive = false;
      state.carInstances.forEach(function (inst) { if (inst) inst.setVisibility(false); });
    }
  }

  function _tick() {
    var nowTick = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    if (nowTick - _lastIntegrityCheckAt >= TICK_INTEGRITY_CHECK_MS) {
      _lastIntegrityCheckAt = nowTick;
      if (_needsRemount()) _hardRemountLayer('tick_integrity_check');
    }

    var mapLayer = _mapLayer();
    var motionModel = _motionModel();
    var adapter = _adapter();
    var rollingStock = _rollingStock();
    var visibilityPolicy = _visibilityPolicy();
    if (!mapLayer || !motionModel || !adapter || !rollingStock || !visibilityPolicy) return;
    if (!adapter.isLoaded()) return; // still loading / failed — 2D layer already shows every train regardless

    var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    if (_debugForcedDropoutUntil != null && now >= _debugForcedDropoutUntil) _debugForcedDropoutUntil = null; // auto-expire

    var zoom = (_map && typeof _map.getZoom === 'function') ? _map.getZoom() : 0;
    var rideAuthority = _rideAuthority();
    var candidates = _buildCandidates(_map, rollingStock, mapLayer, rideAuthority);
    var previouslyPromoted = Object.keys(_consists);
    var decision = visibilityPolicy.resolveVisibility({
      zoom: zoom,
      candidates: candidates,
      previouslyPromotedTrainIds: previouslyPromoted,
    });
    _lastVisibilityDecision = decision;

    var promotedSet = {};
    decision.promotedTrainIds.forEach(function (tid) { promotedSet[tid] = true; });

    // Retire consists the policy no longer promotes.
    previouslyPromoted.forEach(function (tid) {
      if (!promotedSet[tid]) _disposeConsist(tid, 'no longer eligible for 3D presentation (policy decision)');
    });

    // Promote newly-eligible trains — create their consist state/car
    // instances. Order doesn't matter; each is independent.
    decision.promotedTrainIds.forEach(function (tid) {
      if (_consists[tid]) return; // already promoted from a prior tick
      var created = _createConsistStateWithCars(tid, rollingStock, adapter, now);
      if (!created) return; // adapter not ready yet — try again next tick
      _consists[tid] = created;
      var reason = decision.ridingTrainIds.indexOf(tid) !== -1 ? 'riding' :
        decision.selectedTrainIds.indexOf(tid) !== -1 ? 'selected' : 'auto-proximity';
      console.log('[Subway3DTrainActorLayer][lifecycle] promoted to 3D — logicalTrainId', tid,
        '| carInstanceCount', created.carInstances.length, '| reason:', reason,
        '| zoom', zoom.toFixed ? zoom.toFixed(2) : zoom);
    });

    // Per-train motion/grace/placement update — one buildMotionState() call
    // per currently-promoted train, never per candidate (spec §12). Also
    // logs selected/riding priority acquire/release transitions here
    // (spec §17) — once per transition, latched via wasSelected/wasRiding,
    // never per-frame.
    Object.keys(_consists).forEach(function (tid) {
      var state = _consists[tid];
      var isSelectedNow = decision.selectedTrainIds.indexOf(tid) !== -1;
      var isRidingNow = decision.ridingTrainIds.indexOf(tid) !== -1;
      if (isSelectedNow !== state.wasSelected) {
        console.log('[Subway3DTrainActorLayer][lifecycle]', isSelectedNow ? 'selected priority acquired' : 'selected priority released',
          '— logicalTrainId', tid);
        state.wasSelected = isSelectedNow;
      }
      if (isRidingNow !== state.wasRiding) {
        console.log('[Subway3DTrainActorLayer][lifecycle]', isRidingNow ? 'riding priority acquired' : 'riding priority released',
          '— logicalTrainId', tid);
        state.wasRiding = isRidingNow;
      }
      _tickOneConsist(tid, state, motionModel, rollingStock, now);
    });

    if (_lastFrameAt) {
      var dt = now - _lastFrameAt;
      if (dt > 0) _fps = Math.round((1000 / dt) * 10) / 10;
    }
    _lastFrameAt = now;

    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function activate() {
    if (!_readDevFlag()) return { ok: false, reason: 'dev_flag_disabled' };
    if (_active) return { ok: true, reason: 'already_active' };
    var adapter = _adapter();
    if (!adapter) return { ok: false, reason: 'adapter_unavailable' };
    adapter.load(); // idempotent — fire and forget, tick() checks isLoaded()
    if (!_ensureLayer()) return { ok: false, reason: _lastError || 'layer_mount_failed' };
    _active = true;
    _tickIntervalId = global.setInterval(_tick, TICK_MS);
    console.log('[Subway3DTrainActorLayer] activated');
    return { ok: true };
  }

  function deactivate() {
    if (_tickIntervalId != null) { global.clearInterval(_tickIntervalId); _tickIntervalId = null; }
    _disposeAllConsists('deactivate()');
    _lastVisibilityDecision = null;
    _debugForcedDropoutUntil = null;
    var adapter = _adapter();
    if (adapter) adapter.disposeSharedAsset();
    _removeLayer();
    _active = false;
    console.log('[Subway3DTrainActorLayer] deactivated — 2D presentation and all authority state unaffected');
  }

  function isActive() { return _active; }

  function getSnapshot() {
    var adapter = _adapter();
    var mapLayer = _mapLayer();
    var ride = _rideAuthority();
    var rideSnap = ride && ride.getSnapshot ? ride.getSnapshot() : null;
    var styleLayer = null;
    try { styleLayer = _map && _map.getLayer ? _map.getLayer(LAYER_ID) : null; } catch (e) {}
    var lead = _leadConsistState();
    var leadInstance = (lead && lead.carInstances.length) ? lead.carInstances[0] : null;
    var allCarInstances = _allCarInstances();
    var activeTrainIds = Object.keys(_consists);
    var decision = _lastVisibilityDecision;
    return {
      active: _active,
      mounted: _mounted,
      // Backward-compatible LEAD-train/lead-car (slot 0) diagnostics — same
      // fields/shape existing console tooling from the single-train Gates
      // already reads, now reporting the lead consist (see
      // _leadConsistState() above: riding > selected > lowest id).
      hasCarInstance: !!leadInstance,
      adapterLoaded: adapter ? adapter.isLoaded() : false,
      lastError: _lastError,
      fps: _fps,
      lastTransform: leadInstance ? leadInstance.getLastTransform() : null,
      hasRenderer: !!_renderer,
      hasCamera: !!_camera,
      carInstanceId: (lead && lead.carInstanceIds.length) ? lead.carInstanceIds[0] : null,
      carInstanceCreatedAt: (lead && lead.carInstanceCreatedAts.length) ? lead.carInstanceCreatedAts[0] : null,
      carInstanceBoundTrainId: lead ? lead.logicalTrainId : null,
      groupVisible: (leadInstance && leadInstance.group) ? leadInstance.group.visible : null,
      groupHasParent: (leadInstance && leadInstance.group) ? !!leadInstance.group.parent : null,
      groupChildrenCount: (leadInstance && leadInstance.group) ? leadInstance.group.children.length : null,
      // 4-Car Consist Gate diagnostics — the LEAD consist only, not just the
      // lead car. placedCarCount/geometryInsufficient come from the most
      // recent _computeCarPlacements() call for that train (null fields
      // before its first 'update' tick). See active3DLogicalTrainIds/
      // active3DTrainCount below for the full multi-train picture.
      carInstanceIds: lead ? lead.carInstanceIds.slice() : [],
      carInstanceCount: lead ? lead.carInstances.length : 0,
      requestedCarCount: (lead && lead.lastPlacementResult) ? lead.lastPlacementResult.requestedCarCount : null,
      placedCarCount: (lead && lead.lastPlacementResult) ? lead.lastPlacementResult.placedCarCount : null,
      geometryInsufficient: (lead && lead.lastPlacementResult) ? lead.lastPlacementResult.geometryInsufficient : null,
      // Two independent selection sources, read fresh here for direct
      // comparison — the LEAD train only. If rideAuthoritySelectedTrainId
      // differs from mapLayerSelectedTrainId while riding, that is a
      // mismatch (this layer's global visibility policy follows BOTH now,
      // via _buildCandidates()' isSelected/isRiding flags — see
      // selected3DLogicalTrainId/riding3DLogicalTrainId below for what was
      // actually promoted).
      mapLayerSelectedTrainId: (mapLayer && mapLayer.getSelectedTrain) ?
        (function () { var s = mapLayer.getSelectedTrain(); return s && s.train ? s.train.id : null; })() : null,
      rideAuthorityStatus: rideSnap ? rideSnap.status : null,
      rideAuthoritySelectedTrainId: rideSnap ? rideSnap.selectedLogicalTrainId : null,
      // Motion-grace hold diagnostics — see MOTION_GRACE_MS above. LEAD train only.
      motionGraceActive: lead ? lead.motionGraceActive : false,
      motionGraceExpiredLogged: lead ? lead.motionGraceExpiredLogged : false,
      motionGraceAgeMs: (lead && lead.lastValidMotionAt != null) ?
        ((global.performance && global.performance.now) ? global.performance.now() : Date.now()) - lead.lastValidMotionAt : null,
      lastValidMotionAt: lead ? lead.lastValidMotionAt : null,
      motionGraceMs: MOTION_GRACE_MS,
      // Terrain-aware altitude — see _resolveCarAltitudeM() above. LEAD train only.
      lastValidTerrainElevationM: lead ? lead.lastValidTerrainElevationM : [],
      // TEMPORARY diagnostic — see __debugForceMotionDropout above. Applies
      // globally, to every promoted train, not just the lead.
      debugForcedDropoutActive: _debugForcedDropoutUntil != null,
      debugForcedDropoutUntilMs: _debugForcedDropoutUntil,
      // ── Global 3D Visibility/LOD (0825_WOS_Global_3D_Train_Visibility_LOD)
      // spec §17 diagnostics — the actual multi-train picture, independent
      // of which single train the backward-compatible fields above describe.
      global3DEnabled: _active,
      auto3DCandidateCount: decision ? decision.counts.candidateCount : 0,
      active3DTrainCount: activeTrainIds.length,
      active3DLogicalTrainIds: activeTrainIds.slice(),
      selected3DLogicalTrainId: decision && decision.selectedTrainIds.length ? decision.selectedTrainIds[0] : null,
      riding3DLogicalTrainId: decision && decision.ridingTrainIds.length ? decision.ridingTrainIds[0] : null,
      fullConsistMinZoom: decision ? decision.fullConsistMinZoom : null,
      currentZoom: decision ? decision.currentZoom : null,
      maxAuto3DTrains: decision ? decision.maxAutoTrains : null,
      visibilityCounts: decision ? decision.counts : null,
      visibilityRejectedByCapTrainIds: decision ? decision.rejectedByCapTrainIds.slice() : [],
      totalCarInstanceCount: allCarInstances.length,
      // Temporary render-path diagnostics (see render() above) — remove
      // once the invisible-render issue is root-caused.
      renderCallCount: _renderCallCount,
      lastRenderAt: _lastRenderAt,
      lastRenderDiag: _lastRenderDiag,
      // Lifecycle diagnostics — layer identity, mount truth per Mapbox
      // itself (not our own flag), and remount history.
      layerInstanceId: LAYER_INSTANCE_ID,
      onAddCallCount: _onAddCallCount,
      onRemoveCallCount: _onRemoveCallCount,
      lastOnAddAt: _lastOnAddAt,
      lastOnRemoveAt: _lastOnRemoveAt,
      isLayerMountedPerMapbox: _isLayerMounted(),
      styleLayerExists: !!styleLayer,
      styleLayerType: styleLayer ? styleLayer.type : null,
      // The object Mapbox actually has registered under LAYER_ID vs. the
      // exact object our own onAdd/render/onRemove callbacks above belong
      // to — a mismatch here would be a genuine stale-reference bug.
      implementationMatchesKnownLayer: !!(styleLayer && styleLayer.implementation === _layer),
      needsRemount: _needsRemount(),
      lastHardRemountAt: _lastHardRemountAt,
      lastHardRemountReason: _lastHardRemountReason,
      lastHardRemountResult: _lastHardRemountResult,
      styledataCount: _styledataCount,
    };
  }

  function enable() { _writeDevFlag(true); return activate(); }
  function disable() { _writeDevFlag(false); deactivate(); }

  // Diagnostic-only export, kept for backward compatibility with existing
  // console tooling built during the Single-Car Gate investigation — always
  // returns the LEAD train's slot-0 car live THREE.Group (see
  // _leadConsistState() above). See __debugGetCarGroups() below for that
  // one train's full consist, or __debugGetConsists() for every promoted
  // train.
  function __debugGetCarGroup() {
    var lead = _leadConsistState();
    return (lead && lead.carInstances.length) ? lead.carInstances[0].group : null;
  }

  // Backward-compatible lead-car accessor — returns the full TrainCarVisual
  // instance (group + setTransform + ...) for the LEAD train's slot 0 only.
  // See __debugGetCarInstances() below for that train's full consist.
  function __debugGetCarInstance() {
    var lead = _leadConsistState();
    return (lead && lead.carInstances.length) ? lead.carInstances[0] : null;
  }

  // 4-Car Consist Gate — full-consist diagnostic accessors for the LEAD
  // train only, same read-only boundary as the lead-car versions above
  // (return references only, no mutation logic lives here).
  function __debugGetCarGroups() {
    var lead = _leadConsistState();
    return lead ? lead.carInstances.map(function (inst) { return inst ? inst.group : null; }) : [];
  }
  function __debugGetCarInstances() {
    var lead = _leadConsistState();
    return lead ? lead.carInstances.slice() : [];
  }

  // Global 3D Visibility/LOD — full multi-train diagnostic accessor.
  // Returns a plain array, one entry per currently-promoted logicalTrainId,
  // {logicalTrainId, carInstanceCount, carInstances, motionGraceActive}.
  // References only, same read-only boundary as every other __debug* export.
  function __debugGetConsists() {
    return Object.keys(_consists).map(function (tid) {
      var state = _consists[tid];
      return {
        logicalTrainId: tid,
        carInstanceCount: state.carInstances.length,
        carInstances: state.carInstances.slice(),
        motionGraceActive: state.motionGraceActive,
      };
    });
  }

  // Same temporary diagnostic boundary — returns the actual registered
  // Mapbox custom-layer object (the same reference map.getLayer(id)
  // .implementation holds, per implementationMatchesKnownLayer in
  // getSnapshot()). Mapbox looks up `.render` on this object fresh every
  // frame (a property read, not a cached function reference), so
  // reassigning layerImpl.render from the console takes effect on the very
  // next frame and is fully reversible by restoring the saved original.
  // Exists to test a scoped gl.clear(gl.DEPTH_BUFFER_BIT) immediately
  // before this layer's own draw calls, as an alternative to per-material
  // depthTest:false. Remove alongside the other __debugGetCar* exports
  // once the GLB-visibility root cause is found.
  function __debugGetLayerImpl() {
    return _layer;
  }

  // TEMPORARY diagnostic-only motion-grace live-test trigger — see
  // _debugForcedDropoutUntil above for the exact mechanism. Defaults to
  // 10000ms (comfortably below MOTION_GRACE_MS) so the default call
  // exercises the hold/recover path; pass a duration > MOTION_GRACE_MS to
  // exercise the hide/expire path instead. Auto-clears itself in _tick()
  // once the window elapses — no separate "restore" call needed. No
  // effect at all unless explicitly called. Remove alongside the other
  // __debug* exports once the continuity investigation is closed.
  function __debugForceMotionDropout(durationMs) {
    var d = (typeof durationMs === 'number' && durationMs > 0) ? durationMs : 10000;
    var nowMs = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    _debugForcedDropoutUntil = nowMs + d;
    console.log('[Subway3DTrainActorLayer][diagnostic] forcing simulated bodyCenter:null for', d,
      'ms — real selection/motion/rolling-stock state untouched, only this layer\'s own hasBodyCenter read is overridden. Auto-restores at', _debugForcedDropoutUntil);
    return { ok: true, durationMs: d, untilMs: _debugForcedDropoutUntil };
  }

  // ── Test-only seams (Global 3D Visibility/LOD, spec §20 point 8 — actor-
  // level multi-train lifecycle: retirement must remove stale logical-train
  // state). Same "exported despite the name" convention already established
  // on SubwayLogicalRollingStockAuthority's own __setCarCountRuleForTests/
  // __resetForTests. Directly driving _tick() end-to-end (rather than only
  // its already-pure sub-pieces) is the only way to prove retirement
  // actually deletes a train's ConsistState, since that deletion is a side
  // effect of _tick()'s create/dispose diff, not a pure function on its own.
  // __setMapForTests bypasses the real Mapbox mount path (_ensureLayer/
  // activate/dev-flag) entirely — tests supply a plain mock map object
  // implementing only the handful of methods _tick() actually calls
  // (getLayer, addLayer, getZoom, getCanvas, project, queryTerrainElevation,
  // triggerRepaint) — never real Mapbox/THREE.
  function __setMapForTests(map) { _map = map; }
  function __tickForTests() { _tick(); }
  function __resetForTests() {
    _disposeAllConsists('test reset');
    _map = null;
    _mounted = false;
    _renderer = null;
    _camera = null;
    _active = false;
    _lastVisibilityDecision = null;
    _debugForcedDropoutUntil = null;
    _lastIntegrityCheckAt = 0;
    _lastFrameAt = 0;
  }

  SBE.Subway3DTrainActorLayer = Object.freeze({
    VERSION: VERSION,
    activate: activate,
    deactivate: deactivate,
    isActive: isActive,
    getSnapshot: getSnapshot,
    __bearingFromMotionForTests: _bearingFromMotion,
    __dwellTravelSignForTests: _dwellTravelSign,
    __motionGraceDecisionForTests: _motionGraceDecision,
    __computeCarPlacementsForTests: _computeCarPlacements,
    MOTION_GRACE_MS: MOTION_GRACE_MS,
    __debugGetCarGroup: __debugGetCarGroup,
    __debugGetCarInstance: __debugGetCarInstance,
    __debugGetCarGroups: __debugGetCarGroups,
    __debugGetCarInstances: __debugGetCarInstances,
    __debugGetLayerImpl: __debugGetLayerImpl,
    __debugForceMotionDropout: __debugForceMotionDropout,
    __debugGetConsists: __debugGetConsists,
    __setMapForTests: __setMapForTests,
    __tickForTests: __tickForTests,
    __resetForTests: __resetForTests,
  });

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subway3d = global._wos.debug.subway3d || {};
  global._wos.debug.subway3d.enable = enable;
  global._wos.debug.subway3d.disable = disable;
  global._wos.debug.subway3d.carInstance = __debugGetCarInstance;
  global._wos.debug.subway3d.status = getSnapshot;
  global._wos.debug.subway3d.carGroup = __debugGetCarGroup;
  global._wos.debug.subway3d.carGroups = __debugGetCarGroups;
  global._wos.debug.subway3d.carInstances = __debugGetCarInstances;
  global._wos.debug.subway3d.layerImpl = __debugGetLayerImpl;
  global._wos.debug.subway3d.forceMotionDropout = __debugForceMotionDropout;
  global._wos.debug.subway3d.consists = __debugGetConsists;

  // Self-activate at boot if the dev flag is already set (URL param or a
  // prior localStorage enable()) — never activates on its own otherwise.
  //
  // Registered against MapboxViewportRuntime's own readiness signals rather
  // than a blind setTimeout(fn, 0) (the prior approach). This file's own
  // <script> tag executes during initial HTML parse — well before
  // WorkspaceUI's boot sequence even starts, let alone before it constructs
  // the actual Mapbox map object — so setTimeout(fn, 0) only deferred one
  // macrotask, not until the map existed. That single early activate()
  // attempt failed via _ensureLayer() (no map yet) and NEVER retried:
  // _tick()'s own remount self-healing only starts running after activate()
  // has already succeeded once (that's where setInterval(_tick, ...) gets
  // created). Confirmed live this exact way, 0825_WOS_Global_3D_Train_
  // Visibility_LOD investigation.
  //
  // Mirrors the identical fallback chain already proven by the sibling 2D
  // layer's own boot code (mtaSubwayMapLayer.js activate(), lines ~715-718):
  // onReady (map fully loaded) is preferred; onStyleLoad (map exists, style
  // applied, tiles not yet decoded — still safe to map.addLayer() a custom
  // layer) is the fallback if onReady is somehow unavailable; a bounded
  // defensive setTimeout is the last resort if neither readiness API exists
  // at all. Exactly one of these three branches ever registers a callback —
  // never more than one — and activate() itself is already idempotent
  // (`if (_active) return {ok:true, reason:'already_active'}`), so even a
  // spurious extra invocation can never create a duplicate interval/layer
  // or duplicate activation state.
  if (_readDevFlag()) {
    var _bootMvr = _mvr();
    if (_bootMvr && typeof _bootMvr.onReady === 'function') _bootMvr.onReady(activate);
    else if (_bootMvr && typeof _bootMvr.onStyleLoad === 'function') _bootMvr.onStyleLoad(activate);
    else global.setTimeout(activate, 1000); // defensive fallback only — matches mtaSubwayMapLayer.js's own 1000ms, not a fresh guess
  }

  console.log('[Subway3DTrainActorLayer] v' + VERSION + ' loaded');
})(window);
