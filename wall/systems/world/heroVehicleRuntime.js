// ── HeroVehicleRuntime v1.1.0 ─────────────────────────────────────────────────
// 0530G_WOS_HeroVehicleTier1Cleanup_v1.0.0
// Prior: 0530F_WOS_HeroVehicleCameraFollowPrototype_v1.0.0
// Status: active
// Classification: world-actor-runtime
//
// One hero car following a road-aware route.
// v1.1.0 smoothing changes:
//   - progress advances via requestAnimationFrame (was setInterval/50ms)
//   - position is lerped each frame (smooth sub-vertex movement)
//   - heading uses shortest-angle interpolation (no flip at corners)
//   - renderer and camera follow smoothed values only
//
// Authority:
//   OWNS: car position, heading, route progress, speed
//   READS: MapboxViewportRuntime (camera), HeroVehicleRenderer (push updates)
//   MUST NOT MODIFY: RegionalFlightTripRuntime, camera rig, atmosphere
//
// Placement: wall/systems/world/heroVehicleRuntime.js
// Load: BEFORE heroVehicleRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  // ── Camera presets ────────────────────────────────────────────────────────────
  // Each preset defines an offset (behind/ahead/lateral in metres) and a
  // zoom/pitch bias relative to the deck's selected altitude step.
  // zoomBias / pitchBias are ADDED to the deck step values.

  var CAMERA_PRESETS = Object.freeze({
    follow: Object.freeze({
      behindM:   35, lateralM:  0,  aheadM:  0,
      zoomBias:  0,  pitchBias: 0,
      bearing:  'actor',   // camera faces same direction as car
    }),
    lead: Object.freeze({
      behindM:  -60, lateralM:  0, aheadM: 0,   // negative behind = in front
      zoomBias:  0,  pitchBias: 5,
      bearing:  'actor_reverse',  // look back toward approaching car
    }),
    side: Object.freeze({
      behindM:   15, lateralM: 45, aheadM: 0,
      zoomBias:  0,  pitchBias: 0,
      bearing:  'actor_side',
    }),
    high: Object.freeze({
      behindM:   50, lateralM:  0, aheadM: 0,
      zoomBias: -1.5, pitchBias: -8,  // wider/higher framing
      bearing:  'actor',
    }),
    hide_actor: Object.freeze({
      behindM:   35, lateralM:  0, aheadM: 0,
      zoomBias:  0,  pitchBias: 0,
      bearing:  'actor',
      hideActor: true,
    }),
  });

  var _cameraPreset = 'follow';

  var FOLLOW_BEHIND_M = 35;   // default, overridden by preset
  var DEFAULT_ZOOM    = 16.5;
  var DEFAULT_PITCH   = 35;
  var CAMERA_EASE_MS  = 600;

  // ── Smoothing factors (per-frame lerp; 60 fps assumed for docs, delta-time driven) ──
  // Position and heading lerp are delta-time corrected so they behave the same
  // at 30 fps and 120 fps.
  // Half-life: ln(2) / k  → POS k=7 → t½ ≈ 0.099s; HDG k=5 → t½ ≈ 0.139s
  var POS_SMOOTH_K = 7;   // higher = snappier position tracking
  var HDG_SMOOTH_K = 5;   // lower = gentler heading rotation

  // Minimum heading delta to update (prevents shimmy on tiny bends)
  var HDG_MIN_DELTA_DEG = 0.5;

  // ── State ─────────────────────────────────────────────────────────────────────
  var _active      = false;
  var _paused      = false;
  var _route       = null;
  var _segments    = null;
  var _progress    = 0;
  var _progressMs  = 0;
  var _speedMult   = 1;

  // RAF state
  var _rafId       = null;
  var _lastRafMs   = 0;

  // Raw (route-computed) vs smoothed actor state
  var _raw = { lat: 0, lng: 0, headingDeg: 0 };
  var _smoothed = { lat: 0, lng: 0, headingDeg: 0 };

  // ── Math helpers ──────────────────────────────────────────────────────────────

  function _haversineM(lat1, lng1, lat2, lng2) {
    var R    = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _bearing(p0, p1) {
    var dLng = (p1.lng - p0.lng) * Math.PI / 180;
    var lat1 = p0.lat * Math.PI / 180;
    var lat2 = p1.lat * Math.PI / 180;
    var y    = Math.sin(dLng) * Math.cos(lat2);
    var x    = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  // Shortest-angle lerp: always rotates through the shorter arc
  function _lerpAngle(a, b, t) {
    var delta = ((b - a + 540) % 360) - 180;
    return (a + delta * t + 360) % 360;
  }

  // Exponential decay lerp: f = 1 - e^(-k * dt)
  function _expFactor(k, dt) {
    return 1 - Math.exp(-k * dt);
  }

  function _offsetPosition(lat, lng, headingDeg, distM) {
    var R    = 6371000;
    var d    = distM / R;
    var brg  = headingDeg * Math.PI / 180;
    var lat1 = lat * Math.PI / 180;
    var lng1 = lng * Math.PI / 180;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
                         Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    var lng2 = lng1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: lat2 * 180 / Math.PI, lng: ((lng2 * 180 / Math.PI) + 540) % 360 - 180 };
  }

  // ── Route building ────────────────────────────────────────────────────────────

  function _buildSegments(points) {
    var distances = [];
    var total     = 0;
    for (var i = 0; i < points.length - 1; i++) {
      var d = _haversineM(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
      distances.push(d);
      total += d;
    }
    var cumFrac = [];
    var cum = 0;
    for (var j = 0; j < distances.length; j++) {
      cum += distances[j];
      cumFrac.push(total > 0 ? cum / total : 1);
    }
    return { distances: distances, total: total, cumFrac: cumFrac };
  }

  // Returns the bearing from the current route position toward a point LOOK_M
  // metres ahead along the route polyline. Avoids abrupt heading snaps when
  // the car is moving slowly through a sparse vertex polyline.
  // Adaptive lookahead: 2.5 × current speed, clamped 25–80m.
  // Slow cruise through corners → short lookahead → tighter heading response.
  // Fast highway → longer lookahead → stable heading over long straights.
  function _lookaheadM(speedMs) {
    var d = (speedMs || 10) * 2.5;
    return Math.max(25, Math.min(80, d));
  }

  function _lookaheadBearing(points, segs, t, speedMs) {
    if (!points || points.length < 2 || !segs) return 0;

    var lookM    = _lookaheadM(speedMs);
    var lookFrac = segs.total > 0 ? lookM / segs.total : 0;
    var tAhead   = Math.min(1, t + lookFrac);

    var cur   = _interpolateRaw(points, segs, t);
    var ahead = _interpolateRaw(points, segs, tAhead);

    // If ahead and current are essentially the same point, fall back to segment bearing
    var dLat = Math.abs(ahead.lat - cur.lat);
    var dLng = Math.abs(ahead.lng - cur.lng);
    if (dLat < 1e-8 && dLng < 1e-8) return cur.headingDeg;

    return _bearing({ lat: cur.lat, lng: cur.lng }, { lat: ahead.lat, lng: ahead.lng });
  }

  // Raw interpolation without bearing calculation (used by lookahead internally)
  function _interpolateRaw(points, segs, t) {
    var n = points.length;
    if (t <= 0) return { lat: points[0].lat, lng: points[0].lng, headingDeg: 0 };
    if (t >= 1) return { lat: points[n - 1].lat, lng: points[n - 1].lng, headingDeg: 0 };
    var segIdx = segs.cumFrac.length - 1;
    for (var i = 0; i < segs.cumFrac.length; i++) {
      if (t <= segs.cumFrac[i]) { segIdx = i; break; }
    }
    var segStart = segIdx === 0 ? 0 : segs.cumFrac[segIdx - 1];
    var segEnd   = segs.cumFrac[segIdx];
    var segT     = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 0;
    return {
      lat: points[segIdx].lat + (points[segIdx + 1].lat - points[segIdx].lat) * segT,
      lng: points[segIdx].lng + (points[segIdx + 1].lng - points[segIdx].lng) * segT,
      headingDeg: 0,
    };
  }

  function _interpolate(points, segs, t) {
    var n = points.length;
    if (t <= 0) {
      return { lat: points[0].lat, lng: points[0].lng,
               headingDeg: n > 1 ? _bearing(points[0], points[1]) : 0 };
    }
    if (t >= 1) {
      return { lat: points[n - 1].lat, lng: points[n - 1].lng,
               headingDeg: n > 1 ? _bearing(points[n - 2], points[n - 1]) : 0 };
    }
    var segIdx = segs.cumFrac.length - 1;
    for (var i = 0; i < segs.cumFrac.length; i++) {
      if (t <= segs.cumFrac[i]) { segIdx = i; break; }
    }
    var segStart = segIdx === 0 ? 0 : segs.cumFrac[segIdx - 1];
    var segEnd   = segs.cumFrac[segIdx];
    var segT     = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 0;
    var p0 = points[segIdx];
    var p1 = points[segIdx + 1];
    return {
      lat:        p0.lat + (p1.lat - p0.lat) * segT,
      lng:        p0.lng + (p1.lng - p0.lng) * segT,
      headingDeg: _bearing(p0, p1),
    };
  }

  // ── Route resolution ──────────────────────────────────────────────────────────

  function _fetchDirectionsRoute(from, to) {
    var token = global.mapboxgl && global.mapboxgl.accessToken;
    if (!token) {
      console.warn('[HeroVehicleRuntime] No Mapbox access token — using fallback route.');
      return Promise.resolve(null);
    }
    var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/'
      + from.lng.toFixed(6) + ',' + from.lat.toFixed(6) + ';'
      + to.lng.toFixed(6)   + ',' + to.lat.toFixed(6)
      + '?geometries=geojson&overview=full&steps=false'
      + '&access_token=' + encodeURIComponent(token);
    return fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data.routes || !data.routes.length) return null;
        var r      = data.routes[0];
        var coords = r.geometry.coordinates;
        var points = coords.map(function (c) { return { lat: c[1], lng: c[0] }; });
        if (points.length < 2) return null;
        return {
          id:              'hv_' + Date.now(),
          source:          'mapbox-directions',
          profile:         'driving',
          origin:          from,
          destination:     to,
          points:          points,
          distanceMeters:  Math.round(r.distance),
          durationSeconds: Math.round(r.duration),
        };
      })
      .catch(function (e) {
        console.warn('[HeroVehicleRuntime] Directions API error:', e.message);
        return null;
      });
  }

  function _buildFallbackRoute(from, to) {
    console.warn('[HeroVehicleRuntime] Directions unavailable — using fallback straight route.');
    var dist   = _haversineM(from.lat, from.lng, to.lat, to.lng);
    var points = [];
    for (var i = 0; i <= 10; i++) {
      points.push({
        lat: from.lat + (to.lat - from.lat) * i / 10,
        lng: from.lng + (to.lng - from.lng) * i / 10,
      });
    }
    return {
      id:              'hv_fallback_' + Date.now(),
      source:          'destination-table-fallback',
      profile:         'driving',
      origin:          from,
      destination:     to,
      points:          points,
      distanceMeters:  Math.round(dist),
      durationSeconds: Math.round(dist / 13.8),
    };
  }

  // ── RAF frame ─────────────────────────────────────────────────────────────────

  function _frame(nowMs) {
    if (!_active || !_route || !_segments) {
      _rafId = null;
      return;
    }
    _rafId = global.requestAnimationFrame(_frame);

    var dt = (_lastRafMs > 0) ? Math.min((nowMs - _lastRafMs) / 1000, 0.1) : 0.016;
    _lastRafMs = nowMs;

    if (!_paused) {
      _progressMs += dt * 1000 * _speedMult;
      var totalMs  = _route.durationSeconds * 1000;
      _progress    = Math.min(1, _progressMs / totalMs);
    }

    // Raw position from route interpolation
    var pos = _interpolate(_route.points, _segments, _progress);
    _raw.lat = pos.lat;
    _raw.lng = pos.lng;
    // Lookahead bearing: adaptive distance based on current speed multiplier.
    // 0.25× → ~8 m/s effective → lookAhead ~25m  (slow city crawl, tight turns)
    // 1×   → ~14 m/s          → lookAhead ~35m
    // 10×  → ~138 m/s         → lookAhead ~80m  (fast preview, stable heading)
    var nominalSpeedMs = 13.8 * _speedMult;
    _raw.headingDeg = _lookaheadBearing(_route.points, _segments, _progress, nominalSpeedMs);

    // Smoothed position: exponential decay toward raw
    var pf = _expFactor(POS_SMOOTH_K, dt);
    _smoothed.lat += (_raw.lat - _smoothed.lat) * pf;
    _smoothed.lng += (_raw.lng - _smoothed.lng) * pf;

    // Smoothed heading: shortest-angle lerp with minimum-delta guard
    var headingDelta = (((_raw.headingDeg - _smoothed.headingDeg) + 540) % 360) - 180;
    if (Math.abs(headingDelta) > HDG_MIN_DELTA_DEG) {
      var hf = _expFactor(HDG_SMOOTH_K, dt);
      _smoothed.headingDeg = (_smoothed.headingDeg + headingDelta * hf + 360) % 360;
    }

    // Push smoothed state to renderer
    var renderer = global.SBE && SBE.HeroVehicleRenderer;
    if (renderer && typeof renderer.update === 'function') {
      renderer.update(_smoothed);
    }

    // Camera follow uses smoothed position
    _updateCamera(dt);

    // Notify locality authority of actor position
    var vla = global.SBE && SBE.ViewportLocationAuthority;
    if (vla && typeof vla.setActorPosition === 'function') {
      vla.setActorPosition(_smoothed.lat, _smoothed.lng, 'heroVehicle');
    }

    if (_progress >= 1) {
      console.log('[HeroVehicleRuntime] route complete');
      _active = false;
      _rafId  = null;
    }
  }

  function _updateCamera(dt) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) return;

    var preset = CAMERA_PRESETS[_cameraPreset] || CAMERA_PRESETS.follow;

    // Actor visibility — hide_actor preset hides marker, keeps motion
    var renderer = global.SBE && SBE.HeroVehicleRenderer;
    if (renderer && typeof renderer.setHidden === 'function') {
      renderer.setHidden(!!preset.hideActor);
    }

    // Base zoom/pitch from deck altitude step
    var nav   = global._wos && global._wos.nav;
    var baseZoom  = (nav && nav.altStep) ? nav.altStep.zoom  : DEFAULT_ZOOM;
    var basePitch = (nav && nav.altStep) ? nav.altStep.pitch : DEFAULT_PITCH;
    var zoom  = Math.max(9, baseZoom  + (preset.zoomBias  || 0));
    var pitch = Math.max(0, Math.min(80, basePitch + (preset.pitchBias || 0)));

    // Camera position — offset from smoothed actor position
    var camPos;
    var lateralM = preset.lateralM || 0;

    if (lateralM !== 0) {
      // Side preset: offset 90° from heading
      var sideHeading = (_smoothed.headingDeg + 90) % 360;
      var lateral = _offsetPosition(_smoothed.lat, _smoothed.lng, sideHeading, lateralM);
      var behind  = preset.behindM > 0
        ? _offsetPosition(lateral.lat, lateral.lng, (_smoothed.headingDeg + 180) % 360, preset.behindM)
        : _offsetPosition(lateral.lat, lateral.lng, _smoothed.headingDeg, -preset.behindM);
      camPos = behind;
    } else if (preset.behindM >= 0) {
      // Follow / high / hide_actor: behind car
      camPos = _offsetPosition(_smoothed.lat, _smoothed.lng, (_smoothed.headingDeg + 180) % 360, preset.behindM);
    } else {
      // Lead: ahead of car (behindM is negative)
      camPos = _offsetPosition(_smoothed.lat, _smoothed.lng, _smoothed.headingDeg, -preset.behindM);
    }

    // Camera bearing
    var bearing;
    if (preset.bearing === 'actor_reverse') {
      bearing = (_smoothed.headingDeg + 180) % 360;
    } else if (preset.bearing === 'actor_side') {
      bearing = _smoothed.headingDeg;
    } else {
      bearing = _smoothed.headingDeg;   // 'actor' — default
    }

    // jumpTo(): no animation queue buildup (critical — see 0530G note)
    try {
      map.jumpTo({
        center:  [camPos.lng, camPos.lat],
        bearing: bearing,
        zoom:    zoom,
        pitch:   pitch,
      });
    } catch (e) { /* map may not be ready */ }
  }

  function _stopRaf() {
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function startRoute(options) {
    stop();
    options = options || {};
    var from = options.from;
    var to   = options.to;
    if (!from || !to) {
      console.error('[HeroVehicleRuntime] startRoute: from and to required');
      return Promise.resolve(false);
    }

    var routePromise = (options.routeSource === 'fallback')
      ? Promise.resolve(null)
      : _fetchDirectionsRoute(from, to);

    return routePromise.then(function (route) {
      if (!route) route = _buildFallbackRoute(from, to);
      if (!route || !route.points || route.points.length < 2) {
        console.error('[HeroVehicleRuntime] route must have ≥ 2 points');
        return false;
      }

      _route      = route;
      _segments   = _buildSegments(route.points);
      _progress   = 0;
      _progressMs = 0;
      _lastRafMs  = 0;
      _speedMult  = Math.max(0.01, Number(options.speedMultiplier) || 1);
      _active     = true;
      _paused     = false;

      // Seed smoothed state at start position to avoid snap from (0,0)
      var pos0 = _interpolate(route.points, _segments, 0);
      _raw.lat        = pos0.lat;
      _raw.lng        = pos0.lng;
      _raw.headingDeg = pos0.headingDeg;
      _smoothed.lat        = pos0.lat;
      _smoothed.lng        = pos0.lng;
      _smoothed.headingDeg = pos0.headingDeg;

      var renderer = global.SBE && SBE.HeroVehicleRenderer;
      if (renderer && typeof renderer.start === 'function') {
        renderer.start(_smoothed);
      }

      _rafId = global.requestAnimationFrame(_frame);

      // 0601B — session rebind: re-register vehicles in the world-space layer
      // after a (re)launch, in case the layer survived a prior runtime teardown.
      var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
      if (wsl && typeof wsl.attemptSessionRebind === 'function') {
        try { wsl.attemptSessionRebind(); } catch (e) {}
      }

      console.log('[HeroVehicleRuntime] v' + VERSION + ' started —',
        from.label || from.lat, '→', to.label || to.lat,
        '| source:', route.source,
        '| dist:', route.distanceMeters + 'm',
        '| dur:', route.durationSeconds + 's',
        '| speed:', _speedMult + 'x');
      return true;
    });
  }

  function stop() {
    _stopRaf();
    _active     = false;
    _paused     = false;
    _route      = null;
    _segments   = null;
    _progress   = 0;
    _progressMs = 0;
    var renderer = global.SBE && SBE.HeroVehicleRenderer;
    if (renderer && typeof renderer.stop === 'function') renderer.stop();
    console.log('[HeroVehicleRuntime] stopped');
  }

  function pause()  { _paused = true; }
  function resume() { _paused = false; _lastRafMs = 0; }

  function setSpeed(mult) {
    _speedMult = Math.max(0.01, Math.min(500, Number(mult) || 1));
    console.log('[HeroVehicleRuntime] speed →', _speedMult + 'x');
  }

  function getState() {
    var distRemainingM = (_route && _segments)
      ? Math.max(0, Math.round(_segments.total * (1 - _progress)))
      : null;
    return {
      active:                  _active,
      paused:                  _paused,
      actorType:               'hero_car',
      transportState:          'drive',
      routeSource:             _route ? _route.source : null,
      routeProfile:            'driving',
      lat:                     Math.round(_smoothed.lat * 1e6) / 1e6,
      lng:                     Math.round(_smoothed.lng * 1e6) / 1e6,
      headingDeg:              Math.round(_smoothed.headingDeg * 10) / 10,
      speedMultiplier:         _speedMult,
      progressPct:             Math.round(_progress * 1000) / 10,
      distanceRemainingMeters: distRemainingM,
      routePointCount:         _route ? _route.points.length : 0,
      totalDistanceMeters:     _route ? _route.distanceMeters : null,
    };
  }

  // Live entity snapshot — exact smoothed position used by renderer and camera.
  // Used by WorldSpaceVehicleLayer to upsert the hero mesh each frame.
  function getEntity() {
    return {
      id:          'hero',
      lat:         _smoothed.lat,
      lng:         _smoothed.lng,
      headingDeg:  _smoothed.headingDeg,
      progressPct: Math.round(_progress * 1000) / 10,
      speedMult:   _speedMult,
      routeSource: _route ? _route.source : null,
      active:      _active,
    };
  }

  // Smoothing diagnostic for _wos.debug.heroVehicle.smoothing()
  function getSmoothingState() {
    var headingDelta = (((_raw.headingDeg - _smoothed.headingDeg) + 540) % 360) - 180;
    return {
      updateMode:       'raf',
      smoothingEnabled: true,
      rawPosition:      { lat: Math.round(_raw.lat * 1e6) / 1e6, lng: Math.round(_raw.lng * 1e6) / 1e6 },
      smoothedPosition: { lat: Math.round(_smoothed.lat * 1e6) / 1e6, lng: Math.round(_smoothed.lng * 1e6) / 1e6 },
      rawHeadingDeg:      Math.round(_raw.headingDeg * 10) / 10,
      smoothedHeadingDeg: Math.round(_smoothed.headingDeg * 10) / 10,
      headingDeltaDeg:    Math.round(headingDelta * 10) / 10,
    };
  }

  function setCameraPreset(name) {
    if (!CAMERA_PRESETS[name]) {
      console.warn('[HeroVehicleRuntime] unknown camera preset:', name,
        '— valid:', Object.keys(CAMERA_PRESETS).join(', '));
      return false;
    }
    _cameraPreset = name;
    console.log('[HeroVehicleRuntime] camera preset →', name);
    return true;
  }

  function getCameraPreset() {
    return _cameraPreset;
  }

  function getCameraState() {
    var preset  = CAMERA_PRESETS[_cameraPreset] || CAMERA_PRESETS.follow;
    var nav     = global._wos && global._wos.nav;
    var mvr     = global.SBE && SBE.MapboxViewportRuntime;
    var map     = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    return {
      cameraPreset:    _cameraPreset,
      actorVisible:    !preset.hideActor,
      followDistanceM: preset.behindM,
      lateralOffsetM:  preset.lateralM || 0,
      zoom:            map ? Math.round(map.getZoom()  * 10) / 10 : null,
      pitch:           map ? Math.round(map.getPitch() * 10) / 10 : null,
      bearing:         map ? Math.round(((map.getBearing() % 360) + 360) % 360) : null,
    };
  }

  // Canonical active-route accessor. Returns the SAME polyline the runtime
  // interpolates against (_route.points), so traffic spawns on the live corridor.
  //
  // Output contract:
  //   source       — 'mapbox-directions' | 'destination-table-fallback'
  //   profile      — 'driving'
  //   points       — Array<{ lat, lng }>   (runtime-native interpolation format)
  //   coordinates  — Array<[lng, lat]>     (GeoJSON order; documented explicitly)
  //   distance     — metres (alias of distanceMeters)
  //   segments     — cumulative-distance segment table (for interpolation reuse)
  function getRoute() {
    if (!_route || !_route.points || _route.points.length < 2) return null;
    var pts = _route.points;
    return {
      source:         _route.source,
      profile:        _route.profile || 'driving',
      points:         pts,                         // {lat,lng}
      coordinates:    pts.map(function (p) { return [p.lng, p.lat]; }),  // [lng,lat]
      distance:       _route.distanceMeters,
      distanceMeters: _route.distanceMeters,       // back-compat alias
      pointCount:     pts.length,
      segments:       _segments,
    };
  }

  SBE.HeroVehicleRuntime = Object.freeze({
    VERSION:           VERSION,
    startRoute:        startRoute,
    stop:              stop,
    pause:             pause,
    resume:            resume,
    setSpeed:          setSpeed,
    getState:          getState,
    getSmoothingState: getSmoothingState,
    setCameraPreset:   setCameraPreset,
    getCameraPreset:   getCameraPreset,
    getCameraState:    getCameraState,
    CAMERA_PRESETS:    CAMERA_PRESETS,
    getRoute:          getRoute,
    getEntity:         getEntity,
  });

  console.log('[HeroVehicleRuntime] v' + VERSION + ' loaded');

})(window);
