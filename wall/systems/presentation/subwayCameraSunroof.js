// ── SubwayCameraSunroof v1.0.0 ────────────────────────────────────────────────
// 0819_SUBWAY_Sunroof_Camera_Ride_Test_v1.0.0_BUILD — §7-17, §28-33, §36
// Status: experimental | Classification: presentation (Mapbox camera mutation
// via the canonical MapboxViewportRuntime wrapper — never a second route
// interpolation system)
//
// Attaches an elevated "sunroof" camera to a live train's ALREADY-canonical
// smooth position (SubwayTrainMotionModel.buildMotionState) and follows it
// continuously with its own bounded damping. This module never re-derives
// trip topology, never mutates train/trip identity, and never invents a
// second position authority — the train remains positional authority
// (BUILD §2).
//
//   MTA realtime evidence
//   -> logical train (SubwayLogicalRollingStockAuthority)
//   -> continuous train motion model (SubwayTrainMotionModel.buildMotionState)
//   -> smooth rendered train position (motion.bodyCenter / .bodyPolyline)
//   -> camera target (this module, optionally with a small forward lead)
//   -> bounded exponential damping
//   -> camera output (MapboxViewportRuntime.setCamera — a single jumpTo per
//      frame; deliberately NOT easeTo, since this module already supplies
//      its own frame-by-frame smoothing — stacking Mapbox's own duration-
//      based easing on top would double-lag the follow).
//
// ── REGRESSION REPAIR (0819_SUBWAY_Sunroof_Regression_Repair_v1.0.0) ───────
// Live user verification found trains appeared frozen once Sunroof was
// engaged, and Sunroof itself didn't feel like travel. Root cause, found by
// tracing the full render path live (not by trusting unit tests, which
// never exercised two concurrent RAF loops): this module's own tick ran on
// EVERY animation frame (~60fps) and called MapboxViewportRuntime.setCamera
// -> map.jumpTo() every single time. That is expensive enough on this map's
// real style (extruded buildings, multiple custom layers) that it starved
// the browser's ability to service mtaSubwayMapLayer.js's OWN separate RAF
// loop on the same frame budget — empirically measured live: with Sunroof
// off, the train source's setData() fired ~8/sec (matching its real 120ms
// ANIM_STEP_MS throttle) and a cruising train's rendered position advanced
// every single call; with Sunroof on, setData() calls collapsed to roughly
// 1 every 1-2 seconds and a specific train's rendered feature froze for
// 15+ real seconds at a stretch, even though SubwayTrainMotionModel's own
// buildMotionState() — called directly, independent of either RAF loop —
// kept reporting fresh, correctly-advancing progress the entire time.
// Detaching Sunroof made the ~8/sec cadence and continuous per-train motion
// resume immediately. The motion model was never the problem; this
// module's own per-frame camera mutation was starving the renderer that
// draws it.
//
// Fix: this module's camera MUTATION now runs at the SAME throttled
// cadence mtaSubwayMapLayer.js's own train-render loop already uses
// (CAMERA_STEP_MS, matching its ANIM_STEP_MS) — the rAF chain itself still
// pumps every frame (a cheap timestamp check), but real work — motion
// sampling, damping, and the one setCamera() call — only happens once per
// CAMERA_STEP_MS, leaving the browser real headroom between ticks to
// service the train renderer's own loop. Damping factors were retuned to
// preserve comparable real-world responsiveness at the coarser tick rate
// (same effective time-constant, solved via factor = 1 - exp(-Δt/τ) for
// the new Δt). Zoom and pitch are now read from the LIVE map each tick
// rather than force-reset to this module's own defaults, so a user's
// native scroll-to-zoom / pitch-drag gesture is never fought (BUILD §9 —
// position stays tethered to the train; view stays user-adjustable).
// ──────────────────────────────────────────────────────────────────────────────
// ── CAMERA OWNERSHIP (BUILD §9) ────────────────────────────────────────────
// Investigated before writing this file: no centralized camera-ownership
// arbitration exists anywhere in wall/ (SBE.ViewportAuthority is referenced
// defensively in a couple of files but never defined; SBE.AttentionGeography
// has no focusOn method). Every camera-driving system in this app —
// itinerary run authority, hero vehicle, aircraft/regional-flight follow,
// Orbital — calls Mapbox camera methods directly with no mutual exclusion.
// Building a full Camera Authority is explicitly out of scope (BUILD §9/§93).
//
// The one REAL, SUBWAY-scoped camera owner already in this codebase is
// MTASubwayMapLayer's own `_followCamera()` (a 5s/800ms coarse re-center
// foundation from a prior build, never wired to any UI). This module adds a
// narrow, explicit guard there (one line, see mtaSubwayMapLayer.js) so the
// two can never fight: `_followCamera()` early-returns whenever this module
// reports itself active. `Cruise` (subway/transit movement-field overlay)
// was confirmed by direct source read to be read-only w.r.t. Mapbox — not a
// real conflict risk. Orbital-mode conflicts are a pre-existing, unrelated
// architectural gap (SUBWAY never sets/checks WosRuntimeModeState) — out of
// scope for this narrow experiment per BUILD §9's own instruction not to
// build a full arbitration architecture unless unavoidable.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var MAX_SAMPLES = 600;      // ~10 min at 1 sample/sec — bounded, never unbounded growth
  var MAX_ANOMALIES = 200;
  var SAMPLE_INTERVAL_MS = 1000;
  var RIDE_SESSION_REFRESH_MS = 1000; // how often current/next stop + ribbon are re-derived from canonical authority
  var EARTH_RADIUS_M = 6371000;

  // Matches mtaSubwayMapLayer.js's own ANIM_STEP_MS exactly — the shared
  // render cadence this module's camera mutation must not exceed. See the
  // REGRESSION REPAIR header above for why: a per-frame (~16ms) setCamera
  // call was empirically measured to collapse the train renderer's own
  // setData() cadence from ~8/sec to ~1 every 1-2sec.
  var CAMERA_STEP_MS = 120;
  var _lastCameraStepAt = 0;

  var _active = false;
  var _logicalTrainId = null;
  var _rideSession = null;
  var _rafId = null;
  var _dampedCenter = null;   // [lon, lat]
  var _dampedBearing = 0;
  var _preAttachCamera = null;
  var _samples = [];
  var _anomalies = [];
  var _lastSampleAt = 0;
  var _lastRideRefreshAt = 0;
  var _lastRealtimeSeenAt = null; // for poll-independence proof (§31)
  var _pollChangeCount = 0;

  // ── Tunable camera composition (BUILD §11/§13/§16/§17 — "start with one
  //    carefully tuned default," exposed as test hooks, never a full UI). ──
  var _pitch = 55;            // elevated look-down angle — "sunroof," not top-down or navigation-flat
  var _zoom = 16;             // neighborhood-scale — train + surrounding streets both readable
  var _bearingMode = 'follow'; // 'follow' | 'north-up'
  var _leadEnabled = false;
  var _leadIndexUnits = 1.5;  // small forward step along the real shape polyline's continuous index
  // Damping factors retuned for the CAMERA_STEP_MS=120ms tick rate (was
  // 0.12/0.15 at an implicit ~16.7ms/frame rate before the regression
  // repair). Solved to preserve the SAME real-world time-constant τ at the
  // new, coarser Δt via factor = 1 - exp(-Δt/τ): position τ≈130ms ->
  // 0.60; bearing τ≈103ms -> 0.65. Tuned further via live visual
  // verification (§7 of the repair report), not just the formula alone.
  var _dampingFactor = 0.6;   // per-tick exponential smoothing toward target center
  var _bearingDampingFactor = 0.65;
  var _maxDriftMeters = 250;  // beyond this, treat as a real re-anchor and snap (§9/§15)

  function _motionModel() { return SBE.SubwayTrainMotionModel || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _mapLayer() { return SBE.MTASubwayMapLayer || null; }
  function _ribbon() { return SBE.SubwayLineRibbon || null; }
  function _store() { return SBE.MTASubwayTransitStore || null; }

  function _toRad(d) { return (d * Math.PI) / 180; }
  function _haversineMeters(a, b) {
    var dLat = _toRad(b[1] - a[1]), dLon = _toRad(b[0] - a[0]);
    var lat1 = _toRad(a[1]), lat2 = _toRad(b[1]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function _dampAngle(current, target, factor) {
    var diff = ((target - current + 540) % 360) - 180;
    return (current + diff * factor + 360) % 360;
  }

  // Re-derivation of the motion model's own [lat,lon]->[lon,lat] continuous-
  // index interpolation, using only PUBLIC shapeSegment/segmentProgressEased
  // fields (never the model's own __-prefixed test-only internals — those
  // are documented "never called by production code"). Same real technique,
  // independently reimplemented against public data.
  function _pointAtIdx(points, idx) {
    var i0 = Math.max(0, Math.min(points.length - 1, Math.floor(idx)));
    var i1 = Math.max(0, Math.min(points.length - 1, idx >= i0 ? i0 + 1 : i0 - 1));
    var t = Math.abs(idx - i0);
    var p0 = points[i0], p1 = points[i1];
    return [p0[1] + (p1[1] - p0[1]) * t, p0[0] + (p1[0] - p0[0]) * t]; // [lon,lat] — points are [lat,lon]
  }

  // BUILD §16 — camera lead must be "derived from canonical route geometry,"
  // never straight-line geographic guessing. Walks a small additional
  // fractional distance along the train's own real matched shape polyline,
  // continuing in its real direction of travel — never an independent
  // topology guess.
  function _leadTarget(motion) {
    var seg = motion.shapeSegment;
    if (!seg || motion.segmentProgressEased == null || !seg.points || seg.points.length < 2) return motion.bodyCenter;
    var contIdx = seg.fromIdx + motion.segmentProgressEased * (seg.toIdx - seg.fromIdx);
    var sign = (seg.toIdx - seg.fromIdx) < 0 ? -1 : 1;
    return _pointAtIdx(seg.points, contIdx + sign * _leadIndexUnits);
  }

  // BUILD §17 — real route/train bearing from the train's own rendered body
  // polyline (the same points already drawn on the map), picking the
  // forward-facing end from the segment's real direction of travel — never
  // a guessed screen orientation.
  //
  // R-train investigation fix: this used to derive direction from
  // `(seg.toIdx - seg.fromIdx) < 0`, defaulting to `sign = 1` whenever that
  // wasn't strictly true — which includes EVERY dwelling train
  // (fromIdx === toIdx, so the comparison is never < 0), regardless of
  // which way the train actually travels. On a corridor whose real
  // direction happens to run toward DECREASING shape index (e.g. this
  // train's real NORTHBOUND direction on the shared R/N Brooklyn trunk —
  // see MTASubwayMapFeatures._travelRightSign's own header for the full
  // live investigation), that produced a bearing 180 degrees opposite the
  // train's real travel while dwelling — reported live as "Sunroof facing
  // backward." Fixed to consume the exact same real-forward-travel
  // derivation now used for lane placement: the resolved segment's own
  // index order when genuinely moving (including the station-skip
  // catch-up state, which also has a real fromIdx !== toIdx), or a real
  // current-position-to-next-stop tangent compared against the local
  // shape tangent when dwelling — never a fixed sign default.
  function _bearingFromMotion(motion, nextStopId) {
    var poly = motion.bodyPolyline;
    if (!poly || poly.length < 2) return null;
    var seg = motion.shapeSegment;
    var sign;
    if (seg && seg.toIdx !== seg.fromIdx) {
      sign = seg.toIdx > seg.fromIdx ? 1 : -1;
    } else {
      sign = _dwellTravelSign(seg, motion.bodyCenter, nextStopId);
      if (sign == null) return null; // no real directional evidence — hold last known heading (caller already does this) rather than guess
    }
    var p0, p1;
    if (sign >= 0) { p1 = poly[poly.length - 1]; p0 = poly[poly.length - 2]; }
    else { p1 = poly[0]; p0 = poly[1]; }
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1]; // [lon,lat] deltas -> compass bearing
    if (dx === 0 && dy === 0) return null;
    return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
  }

  // Same technique as MTASubwayMapFeatures._travelRightSign's own dwell
  // branch (kept as an independent small reimplementation against public
  // data, per this codebase's established per-module convention, not a
  // reach into that module's internals): a real current-position-to-
  // next-stop tangent compared via dot product against the shape's own
  // local low-to-high tangent at this index. Returns 1 | -1 | null.
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

  function _logAnomaly(category, message, data) {
    _anomalies.push({ ts: Date.now(), category: category, message: message, data: data || null });
    if (_anomalies.length > MAX_ANOMALIES) _anomalies.shift();
  }

  function _recordSample(nowMs, trainLngLat, cameraBearing, motion, nextStopId) {
    if (nowMs - _lastSampleAt < SAMPLE_INTERVAL_MS) return;
    _lastSampleAt = nowMs;
    var store = _store();
    var realtimeAt = store ? store.getDiagnostics().realtimeLastUpdatedAt : null;
    if (realtimeAt && realtimeAt !== _lastRealtimeSeenAt) { _lastRealtimeSeenAt = realtimeAt; _pollChangeCount++; }
    _samples.push({
      timestamp: nowMs,
      trainLng: trainLngLat ? trainLngLat[0] : null, trainLat: trainLngLat ? trainLngLat[1] : null,
      cameraLng: _dampedCenter ? _dampedCenter[0] : null, cameraLat: _dampedCenter ? _dampedCenter[1] : null,
      trainBearing: motion ? _bearingFromMotion(motion, nextStopId) : null, cameraBearing: cameraBearing,
      zoom: _zoom, pitch: _pitch,
      motionPhase: motion ? motion.motionPhase : null,
      currentStop: _rideSession ? _rideSession.currentStopId : null,
      nextStop: _rideSession ? _rideSession.nextStopId : null,
      pollCount: _pollChangeCount, lastRealtimeUpdatedAt: realtimeAt,
    });
    if (_samples.length > MAX_SAMPLES) _samples.shift();
  }

  function _refreshRideSession(nowMs) {
    if (nowMs - _lastRideRefreshAt < RIDE_SESSION_REFRESH_MS) return;
    _lastRideRefreshAt = nowMs;
    var ribbon = _ribbon();
    if (!ribbon) return;
    var result = ribbon.showRideMode(_logicalTrainId); // re-derives from canonical stopTimes each call — never elapsed-time-incremented (BUILD §25)
    if (!result.ok) { _logAnomaly('TRAIN_MOTION', 'ride sequence no longer resolvable for this train', { logicalTrainId: _logicalTrainId }); return; }
    var stops = result.data.stops;
    var currentIdx = -1;
    for (var i = 0; i < stops.length; i++) { if (stops[i].isCurrent) { currentIdx = i; break; } }
    _rideSession.currentStopId = currentIdx !== -1 ? stops[currentIdx].stationId : _rideSession.currentStopId;
    _rideSession.nextStopId = currentIdx !== -1 && currentIdx + 1 < stops.length ? stops[currentIdx + 1].stationId
      : (currentIdx === -1 && stops.length ? stops[0].stationId : _rideSession.nextStopId);
    _rideSession.remainingStops = stops;
    _rideSession.tripId = result.data.tripId;
    _rideSession.routeId = result.data.routeId;
  }

  function _tick(nowMs) {
    if (!_active || !_logicalTrainId) return;
    var mm = _motionModel();
    var motion = mm ? mm.buildMotionState(_logicalTrainId, { nowMs: nowMs }) : null;
    var rs = _rollingStock();
    var trainPos = rs ? rs.getPositionState(_logicalTrainId) : null;
    var nextStopId = trainPos ? trainPos.nextStopId : null;

    if (!motion || !motion.bodyCenter) {
      _logAnomaly('UNKNOWN', 'no smooth position available this tick — camera held steady', { logicalTrainId: _logicalTrainId, positionState: motion && motion.positionState });
      _recordSample(nowMs, null, _dampedBearing, motion, nextStopId);
      return;
    }

    var targetCenter = _leadEnabled ? _leadTarget(motion) : motion.bodyCenter;
    var targetBearing = _bearingMode === 'follow' ? _bearingFromMotion(motion, nextStopId) : 0;
    if (targetBearing == null) targetBearing = _dampedBearing; // hold last known heading rather than snap to 0

    if (!_dampedCenter) { _dampedCenter = targetCenter.slice(); _dampedBearing = targetBearing; }

    var driftM = _haversineMeters(_dampedCenter, targetCenter);
    if (driftM > _maxDriftMeters) {
      // A genuine authoritative re-anchor (BUILD §15) — log explicitly,
      // never conceal it, then correct rather than let the camera drift
      // away from the selected train indefinitely (BUILD §9).
      _logAnomaly('REALTIME_RE-ANCHOR', 'camera-to-target drift exceeded max, snapping', { driftM: driftM, maxDriftMeters: _maxDriftMeters });
      _dampedCenter = targetCenter.slice();
    } else {
      _dampedCenter = [
        _dampedCenter[0] + (targetCenter[0] - _dampedCenter[0]) * _dampingFactor,
        _dampedCenter[1] + (targetCenter[1] - _dampedCenter[1]) * _dampingFactor,
      ];
    }
    _dampedBearing = _dampAngle(_dampedBearing, targetBearing, _bearingMode === 'follow' ? _bearingDampingFactor : 1);

    var mvr = _mvr();
    if (mvr) {
      // BUILD §9 — position stays tethered to the train (always driven).
      // Zoom is read from the LIVE map so a user's native scroll-to-zoom
      // gesture is respected rather than fought every 120ms. Pitch is
      // deliberately NOT read live: this map already runs an independent,
      // pre-existing ambient tilt controller (tiltProjectionRuntime.js —
      // a harbor/vessel-driven "cinematic tilt," unrelated to SUBWAY, that
      // slowly springs pitch toward its own 28-38° target on its own timer)
      // that was previously invisible only because the original per-frame
      // jumpTo forced pitch back every ~16ms. Reading pitch live here would
      // let that unrelated system's drift silently pull the sunroof
      // composition away from its tuned 55° default over a ride, which is
      // worse than a locked pitch — no clean arbitration between the two
      // exists (same architectural gap as §CAMERA OWNERSHIP above), so
      // pitch stays under this module's own explicit control instead of
      // fighting for it.
      var live = mvr.getCamera();
      var zoomToUse = live ? live.zoom : _zoom;
      try { mvr.setCamera({ center: _dampedCenter, zoom: zoomToUse, bearing: _dampedBearing, pitch: _pitch }); }
      catch (e) { _logAnomaly('MAPBOX_RENDER', 'setCamera threw', { message: e && e.message }); }
    }

    _refreshRideSession(nowMs);
    _recordSample(nowMs, targetCenter, _dampedBearing, motion, nextStopId);
  }

  // The rAF chain itself pumps every real animation frame (cheap — just a
  // timestamp comparison); the expensive work in _tick() (motion sampling,
  // damping, the one setCamera call) only runs once per CAMERA_STEP_MS. See
  // the REGRESSION REPAIR header — this throttle is the actual fix.
  function _rafPump() {
    if (!_active) return;
    var nowMs = Date.now();
    if (nowMs - _lastCameraStepAt >= CAMERA_STEP_MS) {
      _lastCameraStepAt = nowMs;
      _tick(nowMs);
    }
    _rafId = global.requestAnimationFrame(_rafPump);
  }

  function _scheduleNext() {
    if (!_active) return;
    _rafId = global.requestAnimationFrame(_rafPump);
  }

  // Shared teardown for both a genuine user exit and an internal
  // switch-trains handoff. restoreCamera=false skips the animated
  // "return to pre-attach camera" flyTo — that flyTo is only meaningful
  // when the user is actually leaving Sunroof; firing it during an
  // immediate re-attach to a different train left a stray in-flight
  // animation colliding with the new attach's own jumpTo (observed live:
  // an unrequested intermediate pitch value after rapid re-attach).
  function _detachInternal(restoreCamera) {
    if (!_active) return { ok: true, wasActive: false };
    _active = false;
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }

    var ribbon = _ribbon();
    if (ribbon && ribbon.setSunroofCompactMode) ribbon.setSunroofCompactMode(false);

    if (restoreCamera) {
      // "Map remains stable" (BUILD §23) — gently return to the camera
      // state that existed before this ride began, rather than leaving the
      // user stranded at a pitched-in neighborhood zoom. Reversible, per
      // this codebase's own doctrine of preferring direct, reversible
      // actions.
      var mvr = _mvr();
      if (mvr && _preAttachCamera) { try { mvr.flyTo(Object.assign({}, _preAttachCamera, { duration: 900 })); } catch (e) {} }
    }

    _logicalTrainId = null;
    _rideSession = null;
    _dampedCenter = null;
    return { ok: true, wasActive: true };
  }

  // ── Public API ─────────────────────────────────────────────────────────
  function attach(logicalTrainId) {
    var layer = _mapLayer();
    if (!layer || !layer.isActive()) return { ok: false, reason: 'subway_not_active' };
    var rs = _rollingStock();
    if (!rs || !rs.getLogicalTrain(logicalTrainId)) return { ok: false, reason: 'not_found' };
    if (_active && _logicalTrainId === logicalTrainId) return { ok: true, alreadyActive: true };

    if (_active) _detachInternal(false); // switching trains mid-ride — clean handoff, no restore flyTo to collide with the jumpTo below, never two loops

    if (layer.unfollowTrain) layer.unfollowTrain(); // defense-in-depth against the unwired legacy follow foundation

    var mvr = _mvr();
    _preAttachCamera = mvr ? mvr.getCamera() : null;

    _active = true;
    _logicalTrainId = logicalTrainId;
    _dampedCenter = null;
    _dampedBearing = 0;
    _lastSampleAt = 0;
    _lastRideRefreshAt = 0;
    _lastCameraStepAt = 0;

    // Seed the tuned default composition (pitch/zoom) ONCE here — after
    // this, _tick() reads zoom/pitch from the live map each step (BUILD §9,
    // see _tick's own comment), so without this explicit seed the ride
    // would silently inherit whatever zoom/pitch the map already had.
    var mm = _motionModel();
    var initialMotion = mm ? mm.buildMotionState(logicalTrainId) : null;
    if (mvr && initialMotion && initialMotion.bodyCenter) {
      var initialPos = rs ? rs.getPositionState(logicalTrainId) : null;
      var initialBearing = _bearingMode === 'follow' ? (_bearingFromMotion(initialMotion, initialPos ? initialPos.nextStopId : null) || 0) : 0;
      try { mvr.setCamera({ center: initialMotion.bodyCenter, zoom: _zoom, bearing: initialBearing, pitch: _pitch }); } catch (e) {}
    }
    _rideSession = {
      active: true, logicalTrainId: logicalTrainId, routeId: null, tripId: null,
      currentStopId: null, nextStopId: null, remainingStops: [],
      startedAt: Date.now(), cameraMode: 'sunroof', cameraAttached: true,
    };

    var ribbon = _ribbon();
    if (ribbon) {
      // Ensure the ribbon's own ride data is synced to this train even if
      // attach() was called directly (e.g. tests, console) rather than via
      // the ribbon's own SUNROOF toggle — _active/_logicalTrainId are
      // already set above, so showRideMode()'s own mismatch guard is a
      // no-op here rather than re-entrantly detaching what we just attached.
      ribbon.showRideMode(logicalTrainId);
      if (ribbon.setSunroofCompactMode) ribbon.setSunroofCompactMode(true);
    }

    _scheduleNext();
    return { ok: true };
  }

  function detach() { return _detachInternal(true); }

  function isActive() { return _active; }
  function getActiveTrainId() { return _logicalTrainId; }
  function getRideSession() { return _rideSession ? Object.assign({}, _rideSession, { remainingStops: _rideSession.remainingStops.slice() }) : null; }
  function getLastSamples(n) { return _samples.slice(Math.max(0, _samples.length - (n || _samples.length))); }
  function getAnomalyLog() { return _anomalies.slice(); }
  function getCameraSettings() {
    return { pitch: _pitch, zoom: _zoom, bearingMode: _bearingMode, leadEnabled: _leadEnabled, leadIndexUnits: _leadIndexUnits, dampingFactor: _dampingFactor, bearingDampingFactor: _bearingDampingFactor, maxDriftMeters: _maxDriftMeters };
  }

  // ── Tuning / experiment hooks (BUILD §13/§16/§17 — "minimal test hook,"
  //    never a full camera UI). ─────────────────────────────────────────────
  function setPitch(deg) { _pitch = Math.max(0, Math.min(75, deg)); }
  function setZoom(z) { _zoom = Math.max(10, Math.min(20, z)); }
  function setBearingMode(mode) { _bearingMode = mode === 'north-up' ? 'north-up' : 'follow'; }
  function setLeadEnabled(v) { _leadEnabled = !!v; }
  function setDamping(factor) { _dampingFactor = Math.max(0.02, Math.min(1, factor)); }

  SBE.SunroofCameraController = Object.freeze({
    VERSION: VERSION,
    attach: attach,
    detach: detach,
    isActive: isActive,
    getActiveTrainId: getActiveTrainId,
    getRideSession: getRideSession,
    getLastSamples: getLastSamples,
    getAnomalyLog: getAnomalyLog,
    getCameraSettings: getCameraSettings,
    setPitch: setPitch,
    setZoom: setZoom,
    setBearingMode: setBearingMode,
    setLeadEnabled: setLeadEnabled,
    setDamping: setDamping,
    // Test-only deterministic hooks — never called by production code.
    __test: {
      tick: function (nowMs) { _tick(nowMs != null ? nowMs : Date.now()); },
      leadTarget: _leadTarget,
      bearingFromMotion: _bearingFromMotion,
      dwellTravelSign: _dwellTravelSign,
      dampAngle: _dampAngle,
      haversineMeters: _haversineMeters,
      getDampedCenter: function () { return _dampedCenter ? _dampedCenter.slice() : null; },
      getDampedBearing: function () { return _dampedBearing; },
      forceDetachNoRestore: function () { _active = false; if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; } _logicalTrainId = null; _rideSession = null; _dampedCenter = null; },
    },
  });

  console.log('[SubwayCameraSunroof] v' + VERSION + ' loaded (experimental — attach()/detach() only, no auto-activation)');
})(window);
