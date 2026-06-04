// ── RegionalFlightCameraRig v1.6.0 ───────────────────────────────────────────
// 0528AE_WOS_ManhattanHarborOrbitPreset_v1.0.0 — orbit_patrol camera mode
// 0528AG_WOS_SurfaceGlideFramingModes_v1.0.0 — cinematic/survey_low framing
// 0528AH_WOS_WatchCameraMotionRecovery_v1.0.0 — watch_orbit mode + bearing drift
// 0528P_WOS_RegionalFlightCameraSmoothing_v1.0.0
// 0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0 — surface_glide camera profile added
// Status: active
// Classification: camera-presentation-runtime
//
// Purpose:
//   Replaces the cadence-based (1.2s interval) trip camera with a
//   requestAnimationFrame loop that exponentially smooths zoom, pitch, bearing,
//   and center position toward a phase-aware desired camera state.
//
//   When enabled, the rig disables the RegionalFlightTripRuntime's own camera
//   timer to avoid two systems competing.  On stop/disable it optionally
//   restores the trip runtime camera so the fallback stays intact.
//
//   Core model:
//     desired  — computed each frame from live trip state
//     smoothed — exponentially interpolated toward desired
//     output   — pushed to MapboxViewportRuntime.jumpTo() each frame
//
//   Smoothing is frame-rate independent:
//     alphaFrame = 1 - pow(1 - alphaBase, dt / 16.67)
//
//   smoothingMultiplier scales all alphas (debug only).
//
// Authority:
//   OWNS: smoothed camera state, desired camera state, interpolation params
//   READS: RegionalFlightTripRuntime.getState(), MapboxViewportRuntime
//   MUST NOT MUTATE: aircraft entity, route truth, planner state, cloud,
//                    map style, AircraftRenderer, AircraftRuntime internals
//
// Placement: wall/systems/presentation/regionalFlightCameraRig.js
// Load: AFTER regionalFlightPlanner.js, BEFORE regionalFlightTripDebug.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.6.0';

  // ── Phase-aware base alphas (normalized to 60fps frame = 16.67ms) ─────────────
  // Larger alpha = faster convergence.  All values are multiplied by
  // _smoothingMult for debug speed control.

  var PHASE_ALPHAS = Object.freeze({
    //              center  zoom    pitch   bearing
    PREPARE:   { c: 0.040, z: 0.025, p: 0.020, b: 0.030 },
    TAXI_HOLD: { c: 0.055, z: 0.030, p: 0.025, b: 0.040 },
    TAKEOFF:   { c: 0.160, z: 0.090, p: 0.065, b: 0.090 },
    CLIMB:     { c: 0.110, z: 0.055, p: 0.040, b: 0.065 },
    CRUISE:    { c: 0.075, z: 0.038, p: 0.025, b: 0.038 },
    DESCENT:   { c: 0.095, z: 0.050, p: 0.032, b: 0.058 },
    ARRIVAL:   { c: 0.080, z: 0.055, p: 0.038, b: 0.050 },
    IDLE:      { c: 0.040, z: 0.025, p: 0.020, b: 0.030 },
    COMPLETE:  { c: 0.040, z: 0.025, p: 0.020, b: 0.030 },
  });

  // ── Framing-ahead bias by phase (meters in front of aircraft) ─────────────────
  // Aircraft sits slightly behind center so scenery ahead fills the frame.

  var FRAMING_AHEAD_M = Object.freeze({
    PREPARE:   0,
    TAXI_HOLD: 0,
    TAKEOFF:   280,
    CLIMB:     480,
    CRUISE:    750,
    DESCENT:   380,
    ARRIVAL:   80,
    IDLE:      0,
    COMPLETE:  0,
  });

  // ── Surface glide camera profile ─────────────────────────────────────────────
  // Fixed low-altitude street/water skim. altScalar is pinned ~0.05 by runtime
  // so these curves effectively produce a constant result, which is correct.

  var SURFACE_GLIDE_PHASE_ALPHAS = Object.freeze({
    //              center  zoom    pitch   bearing
    // All phases: faster center response (close to ground, details change quickly)
    PREPARE:   { c: 0.080, z: 0.040, p: 0.030, b: 0.055 },
    TAXI_HOLD: { c: 0.080, z: 0.040, p: 0.030, b: 0.055 },
    TAKEOFF:   { c: 0.120, z: 0.060, p: 0.050, b: 0.080 },
    CLIMB:     { c: 0.120, z: 0.060, p: 0.050, b: 0.080 },
    CRUISE:    { c: 0.100, z: 0.048, p: 0.035, b: 0.065 },
    DESCENT:   { c: 0.110, z: 0.055, p: 0.040, b: 0.072 },
    ARRIVAL:   { c: 0.100, z: 0.055, p: 0.040, b: 0.065 },
    IDLE:      { c: 0.080, z: 0.040, p: 0.030, b: 0.055 },
    COMPLETE:  { c: 0.080, z: 0.040, p: 0.030, b: 0.055 },
  });

  var SURFACE_GLIDE_FRAMING_AHEAD_M = Object.freeze({
    PREPARE:   0,
    TAXI_HOLD: 0,
    TAKEOFF:   100,
    CLIMB:     120,
    CRUISE:    120,
    DESCENT:   100,
    ARRIVAL:   80,
    IDLE:      0,
    COMPLETE:  0,
  });

  // ── Orbit-patrol framing — reduced ahead bias keeps city in frame ─────────────
  // When cameraMode='orbit_patrol' the camera sits wider off-axis and closer to
  // the subject, giving a side-on cinematic observation angle suited to looping
  // around a waterfront rather than flying toward a destination.

  var ORBIT_PATROL_FRAMING_AHEAD_M = Object.freeze({
    PREPARE:   0,
    TAXI_HOLD: 0,
    TAKEOFF:   50,
    CLIMB:     60,
    CRUISE:    55,   // tight — keeps the adjacent city block in frame
    DESCENT:   55,
    ARRIVAL:   50,
    IDLE:      0,
    COMPLETE:  0,
  });

  // ── watch_orbit camera mode framing ──────────────────────────────────────────
  // Continuous cinematic patrol motion — not destination flight.
  // Camera center placed BEHIND the aircraft so the viewer sees already-loaded
  // terrain, not the unresolved horizon ahead.
  //
  // Key values (per spec):
  //   aheadM (CRUISE): -220   bearing offset: -35°   pitch: 42–48°
  //   bearingDrift: sinusoidal ±8° at 25s period — prevents static locked view
  //
  // At Height High (base pitch 52°), pitchBias -8° → effective 44°.

  var WATCH_ORBIT_FRAMING_AHEAD_M = Object.freeze({
    PREPARE:    0,
    TAXI_HOLD:  0,
    TAKEOFF:   -50,
    CLIMB:    -100,
    CRUISE:   -220,   // 220m behind aircraft — unloaded horizon fully outside frame
    DESCENT:  -160,
    ARRIVAL:   -50,
    IDLE:       0,
    COMPLETE:   0,
  });

  var WATCH_ORBIT_PITCH_BIAS  = -8;   // ° from _glideBasePitch — stays in spec 42-48° range
  var WATCH_ORBIT_BEARING_OFF = -35;  // ° off-axis — wider lateral view than surface_glide's -10°
  var WATCH_ORBIT_DRIFT_AMP   = 8;    // ° peak bearing oscillation (±8°)
  var WATCH_ORBIT_DRIFT_RATE  = (2 * Math.PI) / 25000;  // full cycle every 25 seconds (ms⁻¹)

  // ── Surface glide framing modes ───────────────────────────────────────────────
  // Modifies where the camera center is placed (aheadBias) and the effective pitch
  // (pitchBias) for the settled surface_glide altitude.
  //
  //   cinematic   — standard forward framing: camera leads the aircraft, full pitch.
  //                 Good for revealing approaching scenery. Unloaded horizon visible.
  //
  //   survey_low  — camera center biased behind current movement, pitch reduced.
  //                 Shows more already-loaded foreground, less unloaded horizon.
  //                 Late-loading tiles shift to edge/outside frame rather than center.
  //                 CRUISE aheadBias=-180 gives net ahead = 120-180 = -60m (behind aircraft).
  //                 pitchBias=-8: at Height High (base 52°) → effective pitch 44°.

  var SURFACE_GLIDE_FRAMING_MODES = Object.freeze({
    cinematic: {
      id:        'cinematic',
      label:     'Cinematic',
      aheadBias: 0,     // m: no change to SURFACE_GLIDE_FRAMING_AHEAD_M values
      pitchBias: 0,     // °: pitch unchanged
    },
    survey_low: {
      id:        'survey_low',
      label:     'Survey Low',
      aheadBias: -180,  // m: CRUISE net = 120-180 = -60m (camera behind aircraft)
      pitchBias: -8,    // °: reduces pitch so horizon shrinks, foreground expands
    },
  });

  // ── Subject catalog ───────────────────────────────────────────────────────────
  // Named geographic subjects that a route can lock the camera toward.
  // SUBJECTS[key] → { lat, lng, label }
  // Key is stored on route presets as subjectId and forwarded via presetMeta.

  var SUBJECTS = Object.freeze({
    empire_state:     { lat: 40.7484, lng: -73.9967, label: 'Empire State Building' },
    manhattan_center: { lat: 40.7580, lng: -73.9855, label: 'Midtown Manhattan' },
    downtown:         { lat: 40.7127, lng: -74.0059, label: 'Downtown Manhattan' },
    brooklyn_bridge:  { lat: 40.7061, lng: -73.9969, label: 'Brooklyn Bridge' },
    governors_island: { lat: 40.6895, lng: -74.0168, label: 'Governors Island' },
  });

  // ── subject_lock camera mode constants ────────────────────────────────────────
  // Camera center: blended between aircraft and subject (35% toward subject).
  // Bearing: computed from aircraft position → subject — creates natural cinematic
  //   pan as aircraft traverses Manhattan with the skyline always in frame.
  // Pitch: lower than watch_orbit to reduce sky and foreground clutter.
  // NO sinusoidal drift — the subject geometry IS the movement.
  // NO large negative aheadM — center blend toward subject already prevents
  //   the empty-horizon problem.

  var SUBJECT_LOCK_BLEND      = 0.35;   // 0.0 = pure aircraft, 1.0 = pure subject
  var SUBJECT_LOCK_PITCH_BIAS = -12;    // ° from _glideBasePitch → 40° at Height High
  var SUBJECT_LOCK_MIN_DIST_M = 80;     // m — don't compute bearing if too close

  // ── Target zoom / pitch curves ────────────────────────────────────────────────

  function _targetZoom(altScalar) {
    // 12.5 at ground → 7.9 at cruise
    return 12.5 - altScalar * 4.6;
  }

  function _targetPitch(altScalar) {
    // 42° at ground → 60° at cruise
    return 42 + altScalar * 18;
  }

  function _targetBearing(headingDeg) {
    // Observer sits 18° behind the heading so nose looks slightly right of center
    return ((headingDeg - 18) + 360) % 360;
  }

  // ── Surface glide zoom / pitch / bearing ─────────────────────────────────────
  // altScalar is ~0.05 (fixed by runtime), so these are effectively constants.
  // _glideBaseZoom / _glideBasePitch are the effective values at altScalar=0.05
  // (normal surface-glide altitude). Settable at runtime via setGlideCamera().

  // Height profile defaults — deck selects one before launch
  var HEIGHT_PROFILES = Object.freeze({
    low:      { zoom: 15.80, pitch: 60 },
    balanced: { zoom: 15.35, pitch: 56 },
    high:     { zoom: 14.90, pitch: 52 },
  });

  var _glideBaseZoom  = HEIGHT_PROFILES.balanced.zoom;   // 15.35 at altScalar=0.05
  var _glideBasePitch = HEIGHT_PROFILES.balanced.pitch;  // 56 at altScalar=0.05
  var _glideFrameMode = 'cinematic';                     // 'cinematic' | 'survey_low'
  var _watchOrbitDriftPhase = 0;                         // advances each frame when active

  // Subject lock debug state — updated each frame by _resolveDesired()
  var _subjectLockActive     = false;
  var _subjectLockBearingDeg = null;
  var _subjectLockDistM      = null;
  var _subjectLockId         = null;

  function _targetZoomGlide(altScalar) {
    // _glideBaseZoom is the settled zoom at altScalar=0.05
    // rate: -12 zoom-units per unit altScalar (same as before)
    return _glideBaseZoom + (0.05 - altScalar) * 12;
  }

  function _targetPitchGlide(altScalar) {
    // _glideBasePitch is the settled pitch at altScalar=0.05
    // rate: -160 degrees per unit altScalar (same as before)
    return _glideBasePitch + (0.05 - altScalar) * 160;
  }

  function _targetBearingGlide(headingDeg) {
    // Tighter behind heading — observer 10° off-axis, almost directly behind
    return ((headingDeg - 10) + 360) % 360;
  }

  function _targetBearingOrbit(headingDeg) {
    // Wider left off-axis — camera looks inward toward the city while circling
    // -35° rotates the view so buildings fill the frame rather than open water
    return ((headingDeg - 35) + 360) % 360;
  }

  function _targetBearingWatchOrbit(headingDeg) {
    // -35° base offset + sinusoidal drift ±8° at 25s period.
    // Drift ensures the view is never locked static — subtle continuous panning
    // even when aircraft heading is stable (e.g. long straight waterfront segment).
    var drift = WATCH_ORBIT_DRIFT_AMP * Math.sin(_watchOrbitDriftPhase);
    return ((headingDeg + WATCH_ORBIT_BEARING_OFF + drift) + 360) % 360;
  }

  // ── Subject bearing + distance helpers ───────────────────────────────────────
  // Local duplicates — camera rig has no access to RegionalFlightTripRuntime utils.

  function _bearingBetween(lat1, lng1, lat2, lng2) {
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var ph1  = lat1 * Math.PI / 180;
    var ph2  = lat2 * Math.PI / 180;
    var y    = Math.sin(dLng) * Math.cos(ph2);
    var x    = Math.cos(ph1) * Math.sin(ph2) - Math.sin(ph1) * Math.cos(ph2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  function _haversineM(lat1, lng1, lat2, lng2) {
    var R    = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Frame-rate-independent alpha ──────────────────────────────────────────────

  function _alphaForDt(alphaBase, dt) {
    // Normalize to 60fps reference frame.  clamp dt to avoid huge leaps.
    var dtClamped = Math.min(dt, 100);
    return 1 - Math.pow(1 - Math.min(alphaBase, 0.99), dtClamped / 16.667);
  }

  // ── Bearing wrap-safe interpolation ───────────────────────────────────────────
  // Interpolates via the shortest arc.

  function _lerpBearing(current, target, alpha) {
    var diff = target - current;
    while (diff >  180) diff -= 360;
    while (diff < -180) diff += 360;
    var next = current + diff * alpha;
    return ((next % 360) + 360) % 360;
  }

  // ── Ahead-of-aircraft center offset ──────────────────────────────────────────
  // Displaces target center in the heading direction by distM meters.
  // Simple flat-earth approximation — sufficient for camera framing.

  function _aheadOffset(lat, lng, headingDeg, distM) {
    // Accept negative distM: negative = displace BEHIND the aircraft (opposite heading).
    // Guard: skip only when magnitude is negligible.
    if (Math.abs(distM || 0) < 1) return { lat: lat, lng: lng };
    var hdgRad = headingDeg * Math.PI / 180;
    var dLat   = Math.cos(hdgRad) * distM / 111320;
    var dLng   = Math.sin(hdgRad) * distM / (111320 * Math.cos(lat * Math.PI / 180));
    return { lat: lat + dLat, lng: lng + dLng };
  }

  // ── Rig state ─────────────────────────────────────────────────────────────────

  var _enabled         = false;
  var _rafId           = null;
  var _lastFrameMs     = 0;
  var _profileId       = 'regional_observer_smooth';
  var _smoothingMult   = 1.0;    // debug speed multiplier

  var _smoothed = {
    lat:         0,
    lng:         0,
    zoom:        11,
    pitch:       45,
    bearing:     0,
    initialized: false,
    lastUpdateMs: 0,
  };

  var _desired = {
    lat:         0,
    lng:         0,
    zoom:        11,
    pitch:       45,
    bearing:     0,
    phase:       'IDLE',
    altScalar:   0,
  };

  // ── Desired camera resolver ───────────────────────────────────────────────────

  function _resolveDesired() {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) return false;

    var s = rt.getState();
    if (!s.active && !s.current) return false;

    var e = s.current;
    if (!e) return false;

    var phase     = s.tripPhase  || 'IDLE';
    var altScalar = e.altitudeScalar || 0;
    var heading   = e.headingDeg   || 0;
    var isSurface      = _profileId === 'surface_glide';
    var camMode        = s.presetMeta && s.presetMeta.cameraMode;
    var isOrbit        = camMode === 'orbit_patrol';
    var isWatchOrbit   = camMode === 'watch_orbit';
    var isSubjectLock  = camMode === 'subject_lock';

    // ── subject_lock: bearing always points from aircraft to subject ──────────
    // Handle first — replaces all framing/bearing logic when active.
    if (isSubjectLock) {
      var subjectId = s.presetMeta && s.presetMeta.subjectId;
      var subject   = subjectId && SUBJECTS[subjectId];

      _subjectLockActive = !!subject;
      _subjectLockId     = subjectId || null;

      if (subject) {
        var distM = _haversineM(e.lat, e.lng, subject.lat, subject.lng);
        _subjectLockDistM = Math.round(distM);

        var subjectBearing;
        if (distM < SUBJECT_LOCK_MIN_DIST_M) {
          // Too close — hold last bearing to avoid undefined snap
          subjectBearing = _desired.bearing;
        } else {
          subjectBearing = _bearingBetween(e.lat, e.lng, subject.lat, subject.lng);
        }
        _subjectLockBearingDeg = Math.round(subjectBearing * 10) / 10;

        // Center: blended between aircraft and subject so subject stays in frame
        var blendLat = e.lat + (subject.lat - e.lat) * SUBJECT_LOCK_BLEND;
        var blendLng = e.lng + (subject.lng - e.lng) * SUBJECT_LOCK_BLEND;

        var rawPitchSL = _targetPitchGlide(altScalar) + SUBJECT_LOCK_PITCH_BIAS;

        _desired.lat      = blendLat;
        _desired.lng      = blendLng;
        _desired.phase    = phase;
        _desired.altScalar = altScalar;
        _desired.zoom     = _targetZoomGlide(altScalar);
        _desired.pitch    = Math.max(30, Math.min(_glideBasePitch, rawPitchSL));
        _desired.bearing  = subjectBearing;
        return true;
      }
      // Fallthrough if subject not found — use surface_glide defaults below
    } else {
      _subjectLockActive = false;
    }

    var aheadM;
    if (isWatchOrbit) {
      // watch_orbit: camera placed behind aircraft — no unloaded horizon in frame
      aheadM = WATCH_ORBIT_FRAMING_AHEAD_M[phase] || 0;
    } else if (isOrbit) {
      aheadM = ORBIT_PATROL_FRAMING_AHEAD_M[phase] || 0;
    } else if (isSurface) {
      // Apply deck-selected framing mode bias
      var frameMode = SURFACE_GLIDE_FRAMING_MODES[_glideFrameMode]
                   || SURFACE_GLIDE_FRAMING_MODES.cinematic;
      aheadM = (SURFACE_GLIDE_FRAMING_AHEAD_M[phase] || 0) + frameMode.aheadBias;
    } else {
      aheadM = FRAMING_AHEAD_M[phase] || 0;
    }

    var center = _aheadOffset(e.lat, e.lng, heading, aheadM);

    _desired.lat      = center.lat;
    _desired.lng      = center.lng;
    _desired.phase    = phase;
    _desired.altScalar = altScalar;

    if (isWatchOrbit) {
      // Continuous cinematic patrol — pitch clamped low, bearing drifts continuously
      _desired.zoom    = _targetZoomGlide(altScalar);
      var rawPitchW    = _targetPitchGlide(altScalar) + WATCH_ORBIT_PITCH_BIAS;
      _desired.pitch   = Math.max(30, Math.min(_glideBasePitch, rawPitchW));
      _desired.bearing = _targetBearingWatchOrbit(heading);
    } else if (isOrbit) {
      // orbit_patrol: wide off-axis, no drift
      _desired.zoom    = _targetZoomGlide(altScalar);
      _desired.pitch   = _targetPitchGlide(altScalar);
      _desired.bearing = _targetBearingOrbit(heading);
    } else if (isSurface) {
      _desired.zoom    = _targetZoomGlide(altScalar);
      // Pitch: height profile + framing mode bias, clamped
      var frameModeS  = SURFACE_GLIDE_FRAMING_MODES[_glideFrameMode]
                     || SURFACE_GLIDE_FRAMING_MODES.cinematic;
      var rawPitch    = _targetPitchGlide(altScalar) + frameModeS.pitchBias;
      _desired.pitch  = Math.max(30, Math.min(_glideBasePitch, rawPitch));
      _desired.bearing = _targetBearingGlide(heading);
    } else {
      _desired.zoom    = _targetZoom(altScalar);
      _desired.pitch   = _targetPitch(altScalar);
      _desired.bearing = _targetBearing(heading);
    }

    // ── External profile override (deck altitude stepper) ─────────────────────
    // After all profile-specific resolution, deck-specified zoom/pitch wins.
    // This is what makes "Ground / 500 ft / z15" actually produce z15 instead
    // of the regional profile's altScalar-derived 7.9.
    if (_externalProfile) {
      if (_externalProfile.zoom  != null) _desired.zoom  = _externalProfile.zoom;
      if (_externalProfile.pitch != null) _desired.pitch = _externalProfile.pitch;
    }

    return true;
  }

  // ── Smooth update ─────────────────────────────────────────────────────────────

  function _smooth(dt) {
    var phase      = _desired.phase || 'IDLE';
    var isSurface  = _profileId === 'surface_glide';
    var alphaTable = isSurface ? SURFACE_GLIDE_PHASE_ALPHAS : PHASE_ALPHAS;
    var alphas     = alphaTable[phase] || alphaTable.IDLE;
    var mult       = Math.max(0.1, Math.min(3.0, _smoothingMult));

    var ac = _alphaForDt(alphas.c * mult, dt);
    var az = _alphaForDt(alphas.z * mult, dt);
    var ap = _alphaForDt(alphas.p * mult, dt);
    var ab = _alphaForDt(alphas.b * mult, dt);

    if (!_smoothed.initialized) {
      // Snap on first frame — no easing from (0, 0)
      _smoothed.lat     = _desired.lat;
      _smoothed.lng     = _desired.lng;
      _smoothed.zoom    = _desired.zoom;
      _smoothed.pitch   = _desired.pitch;
      _smoothed.bearing = _desired.bearing;
      _smoothed.initialized = true;
    } else {
      _smoothed.lat     += (_desired.lat  - _smoothed.lat)  * ac;
      _smoothed.lng     += (_desired.lng  - _smoothed.lng)  * ac;
      _smoothed.zoom    += (_desired.zoom - _smoothed.zoom) * az;
      _smoothed.pitch   += (_desired.pitch - _smoothed.pitch) * ap;
      _smoothed.bearing  = _lerpBearing(_smoothed.bearing, _desired.bearing, ab);
    }

    _smoothed.lastUpdateMs = Date.now();
  }

  // ── Output to MapboxViewportRuntime ───────────────────────────────────────────

  function _pushToMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr) return;

    var params = {
      center:  [_smoothed.lng, _smoothed.lat],
      zoom:    _smoothed.zoom,
      pitch:   _smoothed.pitch,
      bearing: _smoothed.bearing,
    };

    // Prefer jumpTo (instant, no competing Mapbox animation queue).
    // Fall back to flyTo with duration 0 for runtimes that don't expose jumpTo.
    if (typeof mvr.jumpTo === 'function') {
      try { mvr.jumpTo(params); } catch (e) { /* swallow */ }
    } else if (typeof mvr.flyTo === 'function') {
      try {
        mvr.flyTo({
          center:   params.center,
          zoom:     params.zoom,
          pitch:    params.pitch,
          bearing:  params.bearing,
          duration: 0,
          speed:    1,
        });
      } catch (e) { /* swallow */ }
    }
  }

  // ── rAF loop ──────────────────────────────────────────────────────────────────

  function _frame(ts) {
    if (!_enabled) return;

    _rafId = global.requestAnimationFrame(_frame);

    var dt = _lastFrameMs > 0 ? ts - _lastFrameMs : 16.667;
    _lastFrameMs = ts;

    // Advance watch-orbit bearing drift — runs continuously while rig is active
    _watchOrbitDriftPhase += Math.min(dt, 100) * WATCH_ORBIT_DRIFT_RATE;

    var hasState = _resolveDesired();
    if (!hasState) return;

    _smooth(dt);
    _pushToMap();
  }

  // ── Trip runtime camera handoff ───────────────────────────────────────────────
  // When the rig takes over, silence the trip runtime's 1.2s camera timer.
  // When it releases, restore the trip camera follow to its previous state.

  var _tripCameraWasEnabled = true;

  function _acquireTripCamera() {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt || !rt.setCamera) return;
    var s = rt.getState();
    _tripCameraWasEnabled = s ? s.cameraFollowEnabled : true;
    rt.setCamera(false);
  }

  function _releaseTripCamera() {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt || !rt.setCamera) return;
    rt.setCamera(_tripCameraWasEnabled);
  }

  // ── Public controls ───────────────────────────────────────────────────────────

  function start() {
    if (_enabled) return;
    _enabled     = true;
    _lastFrameMs = 0;
    _smoothed.initialized = false;
    _acquireTripCamera();
    _rafId = global.requestAnimationFrame(_frame);
    console.log('[RegionalFlightCameraRig] v' + VERSION + ' started — profile:', _profileId);
  }

  function stop() {
    if (!_enabled) return;
    _enabled = false;
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
    _lastFrameMs = 0;
    _releaseTripCamera();
    console.log('[RegionalFlightCameraRig] stopped — trip camera restored');
  }

  function setEnabled(val) {
    if (!!val) { start(); } else { stop(); }
  }

  function getEnabled() { return _enabled; }

  function setProfile(id) {
    _profileId = id || 'regional_observer_smooth';
    // Reset smoothed state so surface_glide doesn't slide in from regional zoom/pitch
    _smoothed.initialized = false;
    console.log('[RegionalFlightCameraRig] profile →', _profileId);
  }

  function getProfile() { return _profileId; }

  // Set the effective glide zoom and pitch (measured at altScalar=0.05).
  // Accepts a HEIGHT_PROFILES key ('low'|'balanced'|'high') or explicit {zoom, pitch}.
  function setGlideCamera(opts) {
    if (typeof opts === 'string') {
      opts = HEIGHT_PROFILES[opts] || HEIGHT_PROFILES.balanced;
    }
    opts = opts || {};
    // Floor lowered from 14.0 → 11.0 so deck altitude stepper can request
    // Cruise (z11) without being clamped up to z14.
    if (opts.zoom  !== undefined) _glideBaseZoom  = Math.max(11.0, Math.min(17.5, Number(opts.zoom)));
    if (opts.pitch !== undefined) _glideBasePitch = Math.max(30,   Math.min(75,   Number(opts.pitch)));
    _smoothed.initialized = false;
    console.log('[RegionalFlightCameraRig] glide camera →',
      'zoom:', _glideBaseZoom, 'pitch:', _glideBasePitch);
  }

  // ── External camera profile override (0530D) ──────────────────────────────────
  // Deck owns altitude step intent. When set, the rig uses these values directly
  // for ALL profiles (regional + surface_glide), overriding profile-specific
  // _targetZoom curves. Clears on setCameraProfile(null).
  var _externalProfile = null;   // { zoom, pitch } or null

  function setCameraProfile(profile) {
    if (!profile) { _externalProfile = null; return; }
    var z = Number(profile.zoom);
    var p = Number(profile.pitch);
    _externalProfile = {
      zoom:  isFinite(z) ? Math.max(11.0, Math.min(17.5, z)) : null,
      pitch: isFinite(p) ? Math.max(20,   Math.min(75,   p)) : null,
    };
    _smoothed.initialized = false;
    console.log('[RegionalFlightCameraRig] cameraProfile →',
      'zoom:', _externalProfile.zoom, 'pitch:', _externalProfile.pitch);
  }

  function getCameraProfile() { return _externalProfile; }

  function getGlideCamera() {
    return { zoom: _glideBaseZoom, pitch: _glideBasePitch };
  }

  // Set glide frame mode: 'cinematic' (default) or 'survey_low'.
  // survey_low biases camera center behind aircraft + reduces pitch so already-loaded
  // foreground fills the frame and unloaded horizon tiles fall outside or to edges.

  function setGlideFrameMode(key) {
    if (!SURFACE_GLIDE_FRAMING_MODES[key]) {
      console.warn('[RegionalFlightCameraRig] unknown frame mode:', key,
        '— available:', Object.keys(SURFACE_GLIDE_FRAMING_MODES).join(', '));
      return false;
    }
    _glideFrameMode = key;
    // Reset so new pitch/center takes effect immediately without sliding from old values
    _smoothed.initialized = false;
    console.log('[RegionalFlightCameraRig] glide frame mode →', key,
      '| aheadBias:', SURFACE_GLIDE_FRAMING_MODES[key].aheadBias + 'm',
      '| pitchBias:', SURFACE_GLIDE_FRAMING_MODES[key].pitchBias + '°');
    return true;
  }

  function getGlideFrameMode() { return _glideFrameMode; }

  // smoothingMult: < 1 = slower/dreamier, > 1 = snappier
  function setSmoothing(mult) {
    _smoothingMult = Math.max(0.1, Math.min(3.0, Number(mult) || 1.0));
    console.log('[RegionalFlightCameraRig] smoothingMult →', _smoothingMult.toFixed(2) + 'x');
  }

  function getSmoothing() { return _smoothingMult; }

  // Snap smoothed state to current desired (bypass easing, useful for jumps)
  function snapToCurrent() {
    var had = _resolveDesired();
    if (!had) { console.warn('[RegionalFlightCameraRig] no active trip — nothing to snap to'); return; }
    _smoothed.lat     = _desired.lat;
    _smoothed.lng     = _desired.lng;
    _smoothed.zoom    = _desired.zoom;
    _smoothed.pitch   = _desired.pitch;
    _smoothed.bearing = _desired.bearing;
    _smoothed.initialized = true;
    _pushToMap();
    console.log('[RegionalFlightCameraRig] snapped to desired camera');
  }

  function getState() {
    var latDelta = Math.round((_desired.lat  - _smoothed.lat)  * 1e6) / 1e6;
    var lngDelta = Math.round((_desired.lng  - _smoothed.lng)  * 1e6) / 1e6;
    var zoomDiff = Math.round((_desired.zoom - _smoothed.zoom) * 1000) / 1000;
    var pitchDiff= Math.round((_desired.pitch- _smoothed.pitch)* 10)   / 10;

    return {
      version:        VERSION,
      enabled:        _enabled,
      profile:             _profileId,
      glideFrameMode:      _glideFrameMode,
      watchOrbitDriftDeg:  Math.round(WATCH_ORBIT_DRIFT_AMP * Math.sin(_watchOrbitDriftPhase) * 10) / 10,
      subjectLock: {
        active:     _subjectLockActive,
        subjectId:  _subjectLockId,
        bearingDeg: _subjectLockBearingDeg,
        distM:      _subjectLockDistM,
      },
      smoothingMult:       _smoothingMult,
      desired: {
        lat:      Math.round(_desired.lat  * 1e6) / 1e6,
        lng:      Math.round(_desired.lng  * 1e6) / 1e6,
        zoom:     Math.round(_desired.zoom * 100) / 100,
        pitch:    Math.round(_desired.pitch * 10) / 10,
        bearing:  Math.round(_desired.bearing * 10) / 10,
        phase:    _desired.phase,
        altScalar: Math.round(_desired.altScalar * 1000) / 1000,
      },
      smoothed: {
        lat:      Math.round(_smoothed.lat  * 1e6) / 1e6,
        lng:      Math.round(_smoothed.lng  * 1e6) / 1e6,
        zoom:     Math.round(_smoothed.zoom * 100) / 100,
        pitch:    Math.round(_smoothed.pitch * 10) / 10,
        bearing:  Math.round(_smoothed.bearing * 10) / 10,
        initialized: _smoothed.initialized,
      },
      lag: {
        latDelta:  latDelta,
        lngDelta:  lngDelta,
        zoomDiff:  zoomDiff,
        pitchDiff: pitchDiff,
      },
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.RegionalFlightCameraRig = Object.freeze({
    VERSION:       VERSION,
    start:         start,
    stop:          stop,
    setEnabled:    setEnabled,
    getEnabled:    getEnabled,
    setProfile:      setProfile,
    getProfile:      getProfile,
    setGlideCamera:     setGlideCamera,
    setCameraProfile:   setCameraProfile,
    getCameraProfile:   getCameraProfile,
    getGlideCamera:  getGlideCamera,
    HEIGHT_PROFILES:             HEIGHT_PROFILES,
    SURFACE_GLIDE_FRAMING_MODES: SURFACE_GLIDE_FRAMING_MODES,
    SUBJECTS:                    SUBJECTS,
    setGlideFrameMode:          setGlideFrameMode,
    getGlideFrameMode:          getGlideFrameMode,
    setSmoothing:               setSmoothing,
    getSmoothing:  getSmoothing,
    snapToCurrent: snapToCurrent,
    getState:      getState,
  });

  console.log('[RegionalFlightCameraRig] v' + VERSION + ' loaded — call .start() after trip begins');

})(window);
