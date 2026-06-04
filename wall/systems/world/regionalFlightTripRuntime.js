// ── RegionalFlightTripRuntime v1.2.0 ─────────────────────────────────────────
// 0528K_WOS_RegionalFlightTripRuntime_v1.0.0
// 0528O_WOS_RegionalFlightPlanner_v1.0.0 — startGeneratedTrip() added
// 0528T_WOS_SurfaceGlideWatchabilityProfile_v1.0.0 — traversal profiles added
// Status: active
// Classification: runtime
//
// Purpose:
//   First complete regional flight proof for WOS.  Turns aircraft spawning into
//   a structured 2-hour trip arc:
//     airport origin → taxi → takeoff → climb → cruise → descent → arrival
//
//   Registers one externally-controlled aircraft entity with AircraftRuntime,
//   writes its position/altitude/lifecycle each tick, and coordinates camera
//   follow and cloud-atmosphere preset changes by phase.
//
// Authority:
//   OWNS: trip presets, trip lifecycle timing, route interpolation, altitude
//         profile, camera profile, trip progress, trip status
//   READS: AircraftRuntime (registers trip entity), MapboxViewportRuntime,
//          CloudAtmosphereLayer, AircraftRenderer, AltitudeWorldState
//   MUST NOT MUTATE: AIS runtime, vessel state, map style, canvas pixels,
//                    ObjectProfileRegistry, AircraftRenderer internals
//
// Placement: wall/systems/world/regionalFlightTripRuntime.js
// Load: AFTER aircraftRuntime.js, BEFORE aircraftRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.2.0';

  // ── Trip segment boundaries (normalized progress 0–1) ────────────────────────

  var SEG = Object.freeze({
    PREPARE_END:  0.02,   // ~2.4 min of a 2-hr trip
    TAXI_END:     0.06,   // +4.8 min
    TAKEOFF_END:  0.09,   // +3.6 min
    CLIMB_END:    0.24,   // +18 min
    CRUISE_END:   0.76,   // +62 min
    DESCENT_END:  0.94,   // +22 min
    // ARRIVAL: 0.94 → 1.00  (~7 min)
  });

  // ── Trip lifecycle → AircraftRuntime lifecycle mapping ────────────────────────
  // AircraftRenderer and AltitudeAwareWorldRenderer read the RT state string.

  var TRIP_TO_RT_STATE = Object.freeze({
    PREPARE:   'PARKED',
    TAXI_HOLD: 'PARKED',
    TAKEOFF:   'TAKEOFF_ROLL',
    CLIMB:     'CLIMB',
    CRUISE:    'CRUISE',
    DESCENT:   'DESCENT',
    ARRIVAL:   'LANDING',
  });

  // ── Cloud presets per trip phase ──────────────────────────────────────────────

  var CLOUD_BY_PHASE = Object.freeze({
    PREPARE:   'clear',
    TAXI_HOLD: 'clear',
    TAKEOFF:   'thin',
    CLIMB:     'thin',
    CRUISE:    'harbor_fog',
    DESCENT:   'harbor_fog',
    ARRIVAL:   'clear',
  });

  // ── Trip presets ──────────────────────────────────────────────────────────────

  var PRESETS = {
    nyc_to_boston_regional_001: {
      id:                   'nyc_to_boston_regional_001',
      label:                'NYC → Boston Regional Flight',
      originAirportId:      'JFK',
      destinationAirportId: 'BOS',
      durationMs:           2 * 60 * 60 * 1000,   // 2 hours
      aircraftClass:        'regional',
      cruiseAltitudeFt:     28000,
      cruiseSpeedKts:       420,
      cameraProfile:        'regional_observer',
      route: [
        { lat: 40.6413, lng: -73.7781, label: 'JFK' },
        { lat: 40.7800, lng: -73.5000, label: 'Long Island climb' },
        { lat: 41.0500, lng: -72.4500, label: 'Sound crossing' },
        { lat: 41.6500, lng: -71.6000, label: 'New England cruise' },
        { lat: 42.3656, lng: -71.0096, label: 'BOS' },
      ],
    },

    // ── Manhattan surface glide — south Battery Park to Midtown along Hudson ──
    manhattan_south_to_midtown_surface_001: {
      id:               'manhattan_south_to_midtown_surface_001',
      label:            'Manhattan — South to Midtown Surface',
      originAirportId:  null,
      durationMs:       20 * 60 * 1000,   // 20 minutes at default speed
      aircraftClass:    'surface_glide',
      cameraProfile:    'surface_glide_observer',
      traversalProfile: 'surface_glide',
      route: [
        { lat: 40.7033, lng: -74.0170, label: 'Battery Park' },
        { lat: 40.7127, lng: -74.0200, label: 'WTC waterfront' },
        { lat: 40.7220, lng: -74.0142, label: 'TriBeCa Hudson' },
        { lat: 40.7340, lng: -74.0082, label: 'Village waterfront' },
        { lat: 40.7489, lng: -74.0027, label: 'Chelsea Piers' },
        { lat: 40.7614, lng: -73.9957, label: "Hell's Kitchen" },
        { lat: 40.7755, lng: -73.9875, label: 'Midtown approach' },
      ],
    },

    // ── Manhattan / Brooklyn harbor orbit — continuous clockwise loop ──────────
    // Starts at Battery Park tip, sweeps clockwise: south harbor → Brooklyn
    // waterfront → East River → Upper East → Harlem bend → Hudson → back.
    // loop:true wraps _progress at 1.0 so the trip never enters COMPLETE phase.
    // Last waypoint matches first so the seam is invisible.

    manhattan_brooklyn_harbor_orbit_001: {
      id:               'manhattan_brooklyn_harbor_orbit_001',
      label:            'Manhattan / Brooklyn Harbor Orbit',
      originAirportId:  null,
      durationMs:       30 * 60 * 1000,   // 30 minutes per lap at default speed
      aircraftClass:    'surface_glide',
      traversalProfile: 'surface_glide',
      cameraMode:       'watch_orbit',   // continuous cinematic patrol motion
      loop:             true,
      route: [
        // ── South tip ──────────────────────────────────────────────────────────
        { lat: 40.7033, lng: -74.0170, label: 'Battery Park' },
        // ── South harbor sweep toward Brooklyn ────────────────────────────────
        { lat: 40.6930, lng: -74.0092, label: 'South harbor' },
        { lat: 40.6820, lng: -73.9980, label: 'Red Hook approach' },
        // ── Brooklyn waterfront — north ────────────────────────────────────────
        { lat: 40.6955, lng: -73.9970, label: 'Brooklyn Bridge Park' },
        { lat: 40.7022, lng: -73.9897, label: 'DUMBO waterfront' },
        { lat: 40.7072, lng: -73.9820, label: 'Manhattan Bridge BK' },
        { lat: 40.7130, lng: -73.9742, label: 'Williamsburg Bridge BK' },
        { lat: 40.7198, lng: -73.9590, label: 'Williamsburg waterfront' },
        { lat: 40.7322, lng: -73.9530, label: 'Greenpoint tip' },
        // ── East River north ───────────────────────────────────────────────────
        { lat: 40.7448, lng: -73.9528, label: 'Hunters Point' },
        { lat: 40.7566, lng: -73.9510, label: 'Queensboro Bridge E' },
        { lat: 40.7660, lng: -73.9508, label: 'East 72nd' },
        { lat: 40.7760, lng: -73.9505, label: 'East 86th' },
        { lat: 40.7855, lng: -73.9535, label: 'East 96th bend' },
        // ── Swing west across upper Manhattan ─────────────────────────────────
        { lat: 40.7900, lng: -73.9660, label: 'Harlem River Drive' },
        { lat: 40.7876, lng: -73.9820, label: 'West 100th Riverside' },
        // ── Hudson southbound ──────────────────────────────────────────────────
        { lat: 40.7792, lng: -73.9888, label: 'West 72nd Riverside' },
        { lat: 40.7683, lng: -73.9958, label: 'West 57th Hudson' },
        { lat: 40.7644, lng: -74.0010, label: 'Intrepid / West 46th' },
        { lat: 40.7534, lng: -74.0064, label: 'Hudson Yards' },
        { lat: 40.7489, lng: -74.0027, label: 'Chelsea Piers' },
        { lat: 40.7340, lng: -74.0082, label: 'Village waterfront' },
        { lat: 40.7221, lng: -74.0141, label: 'TriBeCa Hudson' },
        // ── Back to start (seamless loop) ──────────────────────────────────────
        { lat: 40.7033, lng: -74.0170, label: 'Battery Park' },
      ],
    },

    // ── Manhattan flyover — subject-lock cross-city loop ──────────────────────
    // Route crosses Manhattan from south (harbor) up the west spine (Hudson),
    // turns at Upper Manhattan, returns south along the East River side.
    // cameraMode 'subject_lock' keeps the Empire State Building in frame
    // throughout the full crossing — bearing is computed each frame as the
    // angle from aircraft position to the subject, creating a natural cinematic
    // pan without sinusoidal drift artifacts.
    // Last waypoint equals first — seamless loop.

    manhattan_flyover_subject_001: {
      id:               'manhattan_flyover_subject_001',
      label:            'Manhattan Flyover — Subject Lock',
      originAirportId:  null,
      durationMs:       30 * 60 * 1000,   // 30 minutes per lap at default speed
      aircraftClass:    'surface_glide',
      traversalProfile: 'surface_glide',
      cameraMode:       'subject_lock',
      subjectId:        'empire_state',   // SUBJECTS key — camera always aims here
      loop:             true,
      route: [
        // ── West spine: harbor → Midtown (Hudson corridor) ─────────────────────
        { lat: 40.7033, lng: -74.0170, label: 'Battery Park' },
        { lat: 40.7159, lng: -74.0060, label: 'Tribeca' },
        { lat: 40.7282, lng: -73.9952, label: 'SoHo / Canal' },
        { lat: 40.7390, lng: -73.9897, label: 'West Village' },
        { lat: 40.7484, lng: -73.9967, label: 'Chelsea' },
        { lat: 40.7560, lng: -73.9858, label: 'Midtown West' },
        { lat: 40.7690, lng: -73.9820, label: 'Upper West Side' },
        { lat: 40.7851, lng: -73.9728, label: 'Morningside Heights' },
        // ── Turn — upper Manhattan ─────────────────────────────────────────────
        { lat: 40.7916, lng: -73.9550, label: 'East Harlem turn' },
        // ── East side: Upper East → East River return ─────────────────────────
        { lat: 40.7820, lng: -73.9480, label: 'East Harlem' },
        { lat: 40.7614, lng: -73.9527, label: 'East 72nd' },
        { lat: 40.7390, lng: -73.9680, label: 'East Village / LES' },
        { lat: 40.7127, lng: -73.9850, label: 'Lower East Side' },
        { lat: 40.7033, lng: -74.0170, label: 'Battery Park' },   // close loop
      ],
    },

    // ── NYC harbor patrol orbit — Governors Island / Lower Harbor loop ────────
    // Slow cinematic patrol over the harbor water between Lower Manhattan,
    // Governors Island, Red Hook, and the Staten Island Ferry corridor.
    // Foreground: piers, anchorages, waterway channels, shorelines.
    // cameraMode 'watch_orbit' keeps camera behind aircraft with bearing drift
    // so the viewer always sees already-resolved terrain, not unloaded horizon.

    nyc_harbor_patrol_orbit_001: {
      id:               'nyc_harbor_patrol_orbit_001',
      label:            'NYC Harbor Patrol',
      originAirportId:  null,
      durationMs:       20 * 60 * 1000,   // 20 minutes per lap at default speed
      aircraftClass:    'surface_glide',
      traversalProfile: 'surface_glide',
      cameraMode:       'watch_orbit',
      loop:             true,
      route: [
        { lat: 40.7033, lng: -74.0170, label: 'Battery Park tip' },
        { lat: 40.6960, lng: -74.0120, label: 'Harbor entry' },
        { lat: 40.6915, lng: -74.0158, label: 'Governors Island N' },
        { lat: 40.6848, lng: -74.0048, label: 'Buttermilk Channel E' },
        { lat: 40.6762, lng: -74.0015, label: 'Red Hook basin' },
        { lat: 40.6705, lng: -74.0165, label: 'Harbor south / SI lane' },
        { lat: 40.6760, lng: -74.0290, label: 'Governors Island SW' },
        { lat: 40.6852, lng: -74.0295, label: 'Governors Island W' },
        { lat: 40.6945, lng: -74.0232, label: 'Hudson return' },
        { lat: 40.7033, lng: -74.0170, label: 'Battery Park tip' },
      ],
    },
  };

  // ── Traversal profiles ────────────────────────────────────────────────────────
  // 'regional'     — standard airport-to-airport arc (climb, cruise, descent)
  // 'surface_glide'— low-altitude continuous skim, 150–250ft, no climb arc

  var TRAVERSAL_PROFILES = Object.freeze({
    regional: {
      id:           'regional',
      label:        'Regional aviation (climb/cruise/descent arc)',
      altOverride:  false,
    },
    surface_glide: {
      id:           'surface_glide',
      label:        'Surface glide — 50m low-altitude environmental traversal',
      altOverride:  true,
      altFt:        200,         // fixed altitude (~60m AGL, reads as 200ft)
      altScalar:    0.05,        // normalized scalar — drives camera zoom/pitch
      lifecycleState: 'CRUISE',  // contrails require ≥0.62 scalar — won't fire
    },
  });

  // ── Runtime state ─────────────────────────────────────────────────────────────

  var _active          = false;
  var _paused          = false;
  var _preset          = null;
  var _routeSegments   = null;     // precomputed haversine segment info
  var _elapsedMs       = 0;
  var _progress        = 0;
  var _speedMult       = 1.0;
  var _lastTickMs      = 0;
  var _tripPhase       = 'IDLE';
  var _prevCloudPhase  = null;

  var _tripEntity      = null;     // reference to the upserted aircraft entity
  var _tripEntityId    = 'trip_aircraft_001';

  var _tickTimer          = null;
  var _cameraTimer        = null;
  var _cameraEnabled      = true;
  var _traversalProfileId = 'regional';
  var _lastProgressDelta  = 0;   // progress change in last tick (diagnostic)

  // ── Geo utilities ─────────────────────────────────────────────────────────────

  function _haversineKm(lat1, lng1, lat2, lng2) {
    var R    = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _bearing(fromPt, toPt) {
    var dLng = (toPt.lng - fromPt.lng) * Math.PI / 180;
    var lat1 = fromPt.lat * Math.PI / 180;
    var lat2 = toPt.lat  * Math.PI / 180;
    var y    = Math.sin(dLng) * Math.cos(lat2);
    var x    = Math.cos(lat1) * Math.sin(lat2) -
               Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  // Precompute haversine-proportional segment distances for a route.
  // Returns { segs[], total, cumFrac[] } where cumFrac[i] is the
  // normalized cumulative distance through end of segment i.
  function _buildRouteSegments(route) {
    var segs  = [];
    var total = 0;
    for (var i = 0; i < route.length - 1; i++) {
      var d = _haversineKm(route[i].lat, route[i].lng, route[i+1].lat, route[i+1].lng);
      segs.push(d);
      total += d;
    }
    var cumFrac = [];
    var c = 0;
    for (var j = 0; j < segs.length; j++) {
      c += segs[j] / total;
      cumFrac.push(c);
    }
    return { segs: segs, total: total, cumFrac: cumFrac };
  }

  // Interpolate position along the route at normalized t ∈ [0, 1].
  // Progress is proportional to haversine segment distances.
  function _interpolateRoute(route, segs, t) {
    var n = route.length;
    if (t <= 0) return { lat: route[0].lat, lng: route[0].lng,
                         headingDeg: _bearing(route[0], route[1]), segmentIndex: 0 };
    if (t >= 1) return { lat: route[n-1].lat, lng: route[n-1].lng,
                         headingDeg: _bearing(route[n-2], route[n-1]), segmentIndex: n-2 };

    var segIdx = segs.cumFrac.length - 1;
    for (var i = 0; i < segs.cumFrac.length; i++) {
      if (t <= segs.cumFrac[i]) { segIdx = i; break; }
    }

    var segStart = segIdx === 0 ? 0 : segs.cumFrac[segIdx - 1];
    var segEnd   = segs.cumFrac[segIdx];
    var segT     = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 0;

    var p0 = route[segIdx];
    var p1 = route[segIdx + 1];

    return {
      lat:          p0.lat + (p1.lat - p0.lat) * segT,
      lng:          p0.lng + (p1.lng - p0.lng) * segT,
      headingDeg:   _bearing(p0, p1),
      segmentIndex: segIdx,
    };
  }

  // ── Trip progress → flight state ──────────────────────────────────────────────

  function _resolveTripPhase(p) {
    if (p < SEG.PREPARE_END)  return 'PREPARE';
    if (p < SEG.TAXI_END)     return 'TAXI_HOLD';
    if (p < SEG.TAKEOFF_END)  return 'TAKEOFF';
    if (p < SEG.CLIMB_END)    return 'CLIMB';
    if (p < SEG.CRUISE_END)   return 'CRUISE';
    if (p < SEG.DESCENT_END)  return 'DESCENT';
    if (p < 1.0)              return 'ARRIVAL';
    return 'COMPLETE';
  }

  // ── Altitude profile ──────────────────────────────────────────────────────────

  // LOW_ALT_THRESHOLD: below this, use a simplified low-altitude profile
  // that reaches target quickly without dramatic airline climb/descent curves.
  // A 500 ft flight should not spend 18 minutes climbing through 28,000 ft.
  var LOW_ALT_THRESHOLD_FT = 6000;

  function _resolveAltitudeFt(p, cruiseAlt) {
    cruiseAlt = cruiseAlt || 28000;

    // ── Low-altitude profile (≤ 6000 ft) ─────────────────────────────────────
    // Reaches target altitude by end of TAKEOFF, holds through CRUISE,
    // descends during ARRIVAL only. No dramatic climb/descent arc.
    if (cruiseAlt <= LOW_ALT_THRESHOLD_FT) {
      if (p < SEG.TAXI_END)     return 0;
      if (p < SEG.TAKEOFF_END) {
        var t = (p - SEG.TAXI_END) / (SEG.TAKEOFF_END - SEG.TAXI_END);
        return t * cruiseAlt;
      }
      if (p < SEG.DESCENT_END)  return cruiseAlt;
      // DESCENT + ARRIVAL: cruiseAlt → 0
      var t = (p - SEG.DESCENT_END) / (1.0 - SEG.DESCENT_END);
      return Math.max(0, cruiseAlt * (1 - t));
    }

    // ── Standard airline profile (> 6000 ft) ─────────────────────────────────
    if (p < SEG.TAXI_END)     return 0;

    if (p < SEG.TAKEOFF_END) {
      var t = (p - SEG.TAXI_END) / (SEG.TAKEOFF_END - SEG.TAXI_END);
      return t * 3000;
    }

    if (p < SEG.CLIMB_END) {
      var t = (p - SEG.TAKEOFF_END) / (SEG.CLIMB_END - SEG.TAKEOFF_END);
      var ease = Math.pow(t, 1.4);
      return 3000 + ease * (cruiseAlt - 3000);
    }

    if (p < SEG.CRUISE_END) return cruiseAlt;

    if (p < SEG.DESCENT_END) {
      var t = (p - SEG.CRUISE_END) / (SEG.DESCENT_END - SEG.CRUISE_END);
      var ease = 1 - Math.pow(1 - t, 1.4);
      return cruiseAlt - ease * (cruiseAlt - 2000);
    }

    // ARRIVAL: 2000 → 0
    var t = (p - SEG.DESCENT_END) / (1.0 - SEG.DESCENT_END);
    return Math.max(0, 2000 * (1 - t));
  }

  function _resolveGroundSpeedKts(phase, cruiseKts) {
    cruiseKts = cruiseKts || 420;
    switch (phase) {
      case 'PREPARE':   return 0;
      case 'TAXI_HOLD': return 18;
      case 'TAKEOFF':   return 150;
      case 'CLIMB':     return 280;
      case 'CRUISE':    return cruiseKts;
      case 'DESCENT':   return 260;
      case 'ARRIVAL':   return 140;
      default:          return 0;
    }
  }

  // Route progress: 0 at origin, 1 at destination.
  // The aircraft is airborne from TAKEOFF through ARRIVAL end.
  function _resolveRouteProgress(p) {
    if (p <= SEG.TAKEOFF_END) return 0;
    if (p >= 1.0)             return 1;
    return (p - SEG.TAKEOFF_END) / (1.0 - SEG.TAKEOFF_END);
  }

  // ── Cloud atmosphere integration ──────────────────────────────────────────────

  function _applyCloudPreset(phase) {
    if (phase === _prevCloudPhase) return;
    _prevCloudPhase = phase;

    var presetId = CLOUD_BY_PHASE[phase] || 'clear';
    var cloud = global.SBE && SBE.CloudAtmosphereLayer;
    if (cloud && cloud.setPreset) {
      cloud.setPreset(presetId);
      console.log('[RegionalFlightTripRuntime] cloud →', presetId, '(phase:', phase + ')');
    }
  }

  // ── Camera follow (regional_observer profile) ──────────────────────────────────

  function _lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }

  // Camera profile set by the UI altitude stepper. Deck owns presentation intent.
  // When set, _updateCamera uses these directly; when null, falls back to the
  // legacy altitudeScalar-derived zoom (kept for non-deck-driven trips).
  var _cameraProfile = null;   // { zoom, pitch } or null

  function setCameraProfile(profile) {
    if (!profile) { _cameraProfile = null; return; }
    _cameraProfile = {
      zoom:  Math.max(11.0, Math.min(17.0, Number(profile.zoom)  || 11.0)),
      pitch: Math.max(20,   Math.min(75,   Number(profile.pitch) || 45)),
    };
    console.log('[RegionalFlightTripRuntime] cameraProfile →',
      'zoom:', _cameraProfile.zoom, 'pitch:', _cameraProfile.pitch);
    // If rig is also driving the camera, it will pick up the new zoom/pitch
    // via deck's rig.setGlideCamera() call separately. This function is the
    // authority for the runtime's own _updateCamera tick.
  }

  function _updateCamera() {
    if (!_cameraEnabled || !_tripEntity || !_active) return;

    var e   = _tripEntity;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.flyTo) return;

    // If a rig is enabled, it already drives the camera per-frame via jumpTo.
    // The runtime's slow flyTo would fight it. Defer to the rig.
    var rig = global.SBE && SBE.RegionalFlightCameraRig;
    if (rig && typeof rig.getEnabled === 'function' && rig.getEnabled()) return;

    var zoom, pitch;
    if (_cameraProfile) {
      // Deck-specified presentation intent — clamps already applied.
      zoom  = _cameraProfile.zoom;
      pitch = _cameraProfile.pitch;
    } else {
      // Legacy fallback for trips that didn't set a profile.
      // Clamp lower bound to 11.0 so flight never drops into satellite-zoom range.
      var scalar = e.altitudeScalar || 0;
      zoom  = Math.max(11.0, _lerp(12.8, 11.0, scalar));
      pitch = _lerp(45, 55, scalar);
    }

    var bearing = e.headingDeg !== undefined ? (e.headingDeg - 20 + 360) % 360 : 0;

    mvr.flyTo({
      center:   [e.lng, e.lat],
      zoom:     zoom,
      pitch:    pitch,
      bearing:  bearing,
      duration: 1400,
      speed:    0.6,
    });
  }

  // ── Trip entity state application ─────────────────────────────────────────────

  function _applyStateToEntity(p) {
    if (!_tripEntity || !_preset) return;

    var phase      = _resolveTripPhase(p);
    var rtState    = TRIP_TO_RT_STATE[phase] || 'PARKED';
    var altFt      = _resolveAltitudeFt(p, _preset.cruiseAltitudeFt);
    var altScalar  = altFt / _preset.cruiseAltitudeFt;
    // continuous: route progress = trip progress (move from t=0). Otherwise
    // route only starts advancing after TAKEOFF_END.
    var continuousMove = _preset && _preset.movementMode === 'continuous';
    var routeT     = continuousMove ? p : _resolveRouteProgress(p);
    var pos        = _interpolateRoute(_preset.route, _routeSegments, routeT);
    var speedKts   = _resolveGroundSpeedKts(phase, _preset.cruiseSpeedKts);

    // ── Surface glide override ─────────────────────────────────────────────────
    // In surface_glide mode the aircraft skims the ground continuously.
    // Phase timing still advances normally (progress clock keeps running),
    // but altitude and lifecycle are pinned and position starts from t=0
    // so the full route distance is covered at low level.
    var tp = TRAVERSAL_PROFILES[_traversalProfileId];
    if (tp && tp.altOverride) {
      altFt      = tp.altFt;
      altScalar  = tp.altScalar;
      rtState    = tp.lifecycleState;
      // In surface glide, skip the static ground phase — always interpolate along route
      routeT     = p;   // full normalized progress drives route position directly
      pos        = _interpolateRoute(_preset.route, _routeSegments, routeT);
      speedKts   = Math.round(_preset.cruiseSpeedKts * 0.04);   // ~17kts at surface (~20km/h)
    }

    // movementMode 'continuous' (used by nav-generated trips): skip ground pin —
    // route position advances from launch. Phase labels stay accurate but the
    // aircraft visibly moves immediately instead of waiting through PREPARE/TAXI.
    var continuous = _preset && _preset.movementMode === 'continuous';

    // During ground phases (regional only), keep aircraft at origin with takeoff heading
    if (!tp || !tp.altOverride) {
      if (!continuous && (phase === 'PREPARE' || phase === 'TAXI_HOLD')) {
        var origin = _preset.route[0];
        _tripEntity.lat        = origin.lat;
        _tripEntity.lng        = origin.lng;
        _tripEntity.headingDeg = _preset.departureDeg || 310;
      } else {
        _tripEntity.lat        = pos.lat;
        _tripEntity.lng        = pos.lng;
        _tripEntity.headingDeg = pos.headingDeg;
      }
    } else {
      _tripEntity.lat        = pos.lat;
      _tripEntity.lng        = pos.lng;
      _tripEntity.headingDeg = pos.headingDeg;
    }

    _tripEntity.lifecycleState  = rtState;
    _tripEntity.altitudeFt      = altFt;
    _tripEntity.altitudeScalar  = altScalar;
    _tripEntity.groundSpeedKts  = speedKts;
    _tripEntity.updatedAtMs     = Date.now();

    _tripPhase = phase;
    _applyCloudPreset(phase);
  }

  // ── Tick ──────────────────────────────────────────────────────────────────────

  function _tick() {
    if (!_active || _paused) return;

    var now      = Date.now();
    var realDelta = _lastTickMs > 0 ? now - _lastTickMs : 100;
    _lastTickMs  = now;

    _elapsedMs += realDelta * _speedMult;

    if (_preset.loop) {
      // Wrap elapsed time so progress stays in [0, 1) — trip never completes
      _elapsedMs = _elapsedMs % _preset.durationMs;
      // Guard against exact-zero after modulo (floating-point edge case)
      if (_elapsedMs < 0) _elapsedMs = 0;
    } else {
      _elapsedMs = Math.min(_elapsedMs, _preset.durationMs);
    }

    var prevProgress   = _progress;
    _progress          = _elapsedMs / _preset.durationMs;
    _lastProgressDelta = _progress - prevProgress;

    _applyStateToEntity(_progress);

    // Trip complete (loop presets never reach here)
    if (!_preset.loop && _progress >= 1.0) {
      _tripPhase = 'COMPLETE';
      _active    = false;
      console.log('[RegionalFlightTripRuntime] trip complete —', _preset.label);
      _stopTimers();
      _removeEntity();
    }
  }

  // ── Timer management ─────────────────────────────────────────────────────────

  function _stopTimers() {
    if (_tickTimer)   { global.clearInterval(_tickTimer);   _tickTimer = null; }
    if (_cameraTimer) { global.clearInterval(_cameraTimer); _cameraTimer = null; }
  }

  function _startTimers() {
    _stopTimers();
    _tickTimer   = global.setInterval(_tick, 100);           // 10 Hz
    _cameraTimer = global.setInterval(_updateCamera, 1200);  // ~0.8 Hz
  }

  // ── Entity management ────────────────────────────────────────────────────────

  function _registerEntity() {
    var art = global.SBE && SBE.AircraftRuntime;
    if (!art || !art.upsertExternalAircraft) {
      console.error('[RegionalFlightTripRuntime] AircraftRuntime.upsertExternalAircraft not available');
      return false;
    }

    var origin = _preset.route[0];
    _tripEntity = {
      id:                  _tripEntityId,
      callsign:            'WOS218',
      aircraftClass:       _preset.aircraftClass,
      originAirportId:     _preset.originAirportId,
      destinationAirportId: _preset.destinationAirportId,
      lat:                 origin.lat,
      lng:                 origin.lng,
      headingDeg:          310,
      groundSpeedKts:      0,
      altitudeFt:          0,
      altitudeScalar:      0,
      lifecycleState:      'PARKED',
      stateElapsedMs:      0,
      influenceProfileId:  _preset.aircraftClass,
      createdAtMs:         Date.now(),
      updatedAtMs:         Date.now(),
      _externalControl:    true,
    };

    art.upsertExternalAircraft(_tripEntity);
    return true;
  }

  function _removeEntity() {
    var art = global.SBE && SBE.AircraftRuntime;
    if (art && art.removeExternalAircraft) art.removeExternalAircraft(_tripEntityId);
    _tripEntity = null;
  }

  // ── Public trip controls ──────────────────────────────────────────────────────

  function start(presetId) {
    var pid = presetId || 'nyc_to_boston_regional_001';
    var p   = PRESETS[pid];
    if (!p) {
      console.warn('[RegionalFlightTripRuntime] unknown preset:', pid,
        '— available:', Object.keys(PRESETS).join(', '));
      return false;
    }

    if (_active) stop();

    _preset        = p;
    _routeSegments = _buildRouteSegments(p.route);
    _elapsedMs     = 0;
    _progress      = 0;
    _lastTickMs    = 0;
    _paused        = false;
    _tripPhase     = 'PREPARE';
    _prevCloudPhase = null;

    if (!_registerEntity()) return false;

    _applyStateToEntity(0);
    _active = true;
    _startTimers();

    // Disable AircraftRuntime auto-spawn so the trip aircraft isn't buried
    var art = global.SBE && SBE.AircraftRuntime;
    if (art && art.setAutoSpawn) art.setAutoSpawn(false);

    console.log('[RegionalFlightTripRuntime] started:', p.label,
      '| speed:', _speedMult + 'x',
      '| duration:', Math.round(p.durationMs / 60000) + ' min');
    return true;
  }

  function stop() {
    _stopTimers();
    _removeEntity();
    _active             = false;
    _paused             = false;
    _elapsedMs          = 0;
    _progress           = 0;
    _tripPhase          = 'IDLE';
    _traversalProfileId = 'regional';
    _cameraProfile      = null;

    var art = global.SBE && SBE.AircraftRuntime;
    if (art && art.setAutoSpawn) art.setAutoSpawn(true);

    console.log('[RegionalFlightTripRuntime] stopped');
  }

  function pause() {
    if (!_active || _paused) return;
    _paused = true;
    console.log('[RegionalFlightTripRuntime] paused at', (_progress * 100).toFixed(1) + '%');
  }

  function resume() {
    if (!_active || !_paused) return;
    _paused     = false;
    _lastTickMs = 0;   // reset delta to avoid jump
    console.log('[RegionalFlightTripRuntime] resumed from', (_progress * 100).toFixed(1) + '%');
  }

  function reset() {
    var wasActive  = _active;
    var presetId   = _preset && _preset.id;
    stop();
    if (wasActive && presetId) start(presetId);
  }

  function jump(progress) {
    if (!_active) {
      console.warn('[RegionalFlightTripRuntime] jump() called but no active trip');
      return;
    }
    var p = Math.max(0, Math.min(1, Number(progress) || 0));
    _elapsedMs  = p * _preset.durationMs;
    _progress   = p;
    _lastTickMs = 0;
    _applyStateToEntity(p);
    console.log('[RegionalFlightTripRuntime] jump →', (p * 100).toFixed(1) + '%',
      '| phase:', _tripPhase);
    _updateCamera();
  }

  function setCruiseAltitude(altFt) {
    altFt = Math.max(100, Math.min(45000, Number(altFt) || 28000));
    if (_preset) {
      _preset.cruiseAltitudeFt = altFt;
      if (_active) _applyStateToEntity(_progress);
      console.log('[RegionalFlightTripRuntime] cruiseAltitude →', altFt + ' ft');
    }
  }

  function setSpeed(mult) {
    _speedMult = Math.max(0.1, Math.min(3600, Number(mult) || 1.0));
    console.log('[RegionalFlightTripRuntime] speed →', _speedMult + 'x',
      '(effective duration:', Math.round(_preset
        ? _preset.durationMs / _speedMult / 60000
        : 120 / _speedMult) + ' min real-time)');
  }

  function setCameraFollow(enabled) {
    _cameraEnabled = !!enabled;
    console.log('[RegionalFlightTripRuntime] camera follow →', _cameraEnabled);
  }

  function setPreset(id) {
    if (!PRESETS[id]) {
      console.warn('[RegionalFlightTripRuntime] unknown preset:', id);
      return;
    }
    if (_active) stop();
    console.log('[RegionalFlightTripRuntime] preset →', id);
    start(id);
  }

  function setTraversalProfile(id) {
    if (!TRAVERSAL_PROFILES[id]) {
      console.warn('[RegionalFlightTripRuntime] unknown traversal profile:', id,
        '— available:', Object.keys(TRAVERSAL_PROFILES).join(', '));
      return false;
    }
    _traversalProfileId = id;
    var tp = TRAVERSAL_PROFILES[id];
    console.log('[RegionalFlightTripRuntime] traversal profile →', id, '—', tp.label);
    return true;
  }

  function getTraversalProfile() {
    return _traversalProfileId;
  }

  function getState() {
    var e = _tripEntity;
    return {
      version:            VERSION,
      active:             _active,
      paused:             _paused,
      presetId:           _preset ? _preset.id : null,
      presetMeta:         _preset ? {
        id:         _preset.id,
        label:      _preset.label,
        loop:       !!_preset.loop,
        cameraMode: _preset.cameraMode || null,
        subjectId:  _preset.subjectId  || null,
      } : null,
      lastProgressDelta:  _lastProgressDelta,
      elapsedMs:          Math.round(_elapsedMs),
      durationMs:         _preset ? _preset.durationMs : 0,
      progress:           Math.round(_progress * 10000) / 10000,
      progressPct:        Math.round(_progress * 1000) / 10,
      speedMultiplier:    _speedMult,
      tripPhase:          _tripPhase,
      cameraFollowEnabled: _cameraEnabled,
      aircraftId:         _tripEntityId,
      current: e ? {
        lat:           Math.round(e.lat * 100000) / 100000,
        lng:           Math.round(e.lng * 100000) / 100000,
        headingDeg:    Math.round(e.headingDeg),
        altitudeFt:    Math.round(e.altitudeFt),
        altitudeScalar: Math.round(e.altitudeScalar * 1000) / 1000,
        groundSpeedKts: Math.round(e.groundSpeedKts),
        lifecycleState: e.lifecycleState,
      } : null,
    };
  }

  // ── Planner handoff ───────────────────────────────────────────────────────────
  // Accepts a planner-generated preset object, registers it temporarily under a
  // generated key, and starts via the standard lifecycle code.
  // Does NOT permanently inject into canonical PRESETS.

  var _generatedPresets = {};   // ephemeral store for planner-generated routes

  function startGeneratedTrip(generatedPreset) {
    if (!generatedPreset || !generatedPreset.id) {
      console.error('[RegionalFlightTripRuntime] startGeneratedTrip: invalid preset (missing id)');
      return false;
    }

    // Validate required fields
    var required = ['route', 'durationMs', 'cruiseAltitudeFt', 'aircraftClass'];
    for (var ri = 0; ri < required.length; ri++) {
      if (!generatedPreset[required[ri]]) {
        console.error('[RegionalFlightTripRuntime] startGeneratedTrip: preset missing field:', required[ri]);
        return false;
      }
    }

    if (!generatedPreset.route || generatedPreset.route.length < 2) {
      console.error('[RegionalFlightTripRuntime] startGeneratedTrip: route must have ≥ 2 waypoints');
      return false;
    }

    // Stop any existing generated trip without re-enabling auto-spawn yet
    if (_active) stop();

    // Register ephemerally
    _generatedPresets[generatedPreset.id] = generatedPreset;

    // Patch PRESETS lookup: temporarily shadow with generated
    // (start() reads PRESETS[pid] — we need to bypass that)
    _preset        = generatedPreset;
    _routeSegments = _buildRouteSegments(generatedPreset.route);
    _elapsedMs     = 0;
    _progress      = 0;
    _lastTickMs    = 0;
    _paused        = false;
    _tripPhase     = 'PREPARE';
    _prevCloudPhase = null;

    if (!_registerEntity()) return false;

    _applyStateToEntity(0);
    _active = true;
    _startTimers();

    var art = global.SBE && SBE.AircraftRuntime;
    if (art && art.setAutoSpawn) art.setAutoSpawn(false);

    console.log('[RegionalFlightTripRuntime] generated trip started:', generatedPreset.label,
      '| ' + Math.round(generatedPreset.durationMs / 60000) + 'min',
      '| ' + generatedPreset.cruiseAltitudeFt + 'ft');

    return true;
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.RegionalFlightTripRuntime = Object.freeze({
    VERSION:    VERSION,
    start:      start,
    stop:       stop,
    pause:      pause,
    resume:     resume,
    reset:      reset,
    jump:       jump,
    setSpeed:          setSpeed,
    setCruiseAltitude:  setCruiseAltitude,
    setCameraProfile:   setCameraProfile,
    setCamera:  setCameraFollow,
    setPreset:  setPreset,
    setTraversalProfile:  setTraversalProfile,
    getTraversalProfile:  getTraversalProfile,
    getState:            getState,
    startGeneratedTrip:  startGeneratedTrip,
    PRESETS:             PRESETS,
    TRAVERSAL_PROFILES:  TRAVERSAL_PROFILES,
    SEG:                 SEG,
  });

  console.log('[RegionalFlightTripRuntime] v' + VERSION + ' loaded — startGeneratedTrip() available');

})(window);
