// ── TraversalContinuityAuthority v1.0.0 ──────────────────────────────────────
// 0528X_WOS_TraversalContinuityAuthority_v1.0.0
// Status: active
// Classification: presentation-continuity-runtime
//
// Purpose:
//   Constitutional runtime that controls what the camera is emotionally allowed
//   to see based on tile certainty, traversal speed, camera altitude, turn rate,
//   and atmospheric density.
//
//   Transforms WOS from a map renderer into a cinematic world concealment engine.
//
//   The camera must never outrun certainty.
//   World exposure is governed, not allowed to happen by accident.
//
// Six subsystems:
//   1. Velocity-Adaptive Atmospheric Veil — canvas at z:7
//   2. Predictive Tile Readiness Runtime  — ahead probes at 3 Hz
//   3. Grace Distance Rendering           — veil encodes silhouette/fog grace
//   4. Exposure Budget System             — max reveal distance by mode
//   5. Atmospheric Continuity Smoothing   — hysteresis on all concealment values
//   6. Traversal Confidence Metrics       — full debug snapshot
//
// Authority:
//   OWNS: exposure logic, veil canvas, concealment scalars, debug snapshot
//   READS: Mapbox map, RegionalFlightTripRuntime, RegionalFlightCameraRig,
//          BuildingContinuityRuntime, AtmosphericContinuityRuntime
//   MUST NOT: own route truth, mutate entity state, reload style,
//             create camera jumps, degrade editor mode behavior
//
// Placement: wall/systems/presentation/traversalContinuityAuthority.js
// Load: AFTER buildingContinuityRuntime.js, BEFORE traversalControlDeck.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Tuning ────────────────────────────────────────────────────────────────────

  var PROBE_INTERVAL_MS     = 300;    // 3.3 Hz confidence probe cadence
  var AHEAD_DISTANCES_M     = Object.freeze([120, 280, 550, 900]);
  var ROUTE_AHEAD_OFFSETS   = Object.freeze([0.002, 0.005, 0.010, 0.020]);

  // Smoothing: rise = concealment increasing (slow onset), fall = decreasing (hysteresis)
  var ALPHA_RISE = 0.06;    // ~16 frames to reach target on increase
  var ALPHA_FALL = 0.025;   // ~40 frames to release — prevents flickering on tile bursts

  // Speed at which concealment begins to contribute
  var SPEED_VEIL_ONSET = 0.00015;   // deg/sec — gentle, surface-glide pace
  var SPEED_VEIL_SCALE = 800;       // multiplier to normalize deg/sec → 0-1

  // Auto-gate speed damping
  var GATE_DAMPING   = 0.82;
  var GATE_MIN_SPEED = 0.20;
  var GATE_THRESHOLD = 0.35;   // exposureConfidence below this triggers gating

  // Veil canvas color (cool atmospheric blue-grey — not warm/hot)
  var VEIL_R = 148, VEIL_G = 162, VEIL_B = 182;

  // ── Exposure bias mode table ───────────────────────────────────────────────────
  // fog: multiplier on fog density draw
  // horizon: 0=near horizon, 1=far — applied as exponent on veil falloff
  // contrast: contrast compression scalar
  // distant: distant feature opacity scalar

  var BIAS_TABLE = Object.freeze({
    harbor:        { fog: 1.50, horizon: 0.72, contrast: 0.60, distant: 0.65 },
    inland:        { fog: 0.75, horizon: 1.00, contrast: 0.35, distant: 0.92 },
    skyline:       { fog: 0.95, horizon: 0.88, contrast: 0.65, distant: 0.78 },
    weather:       { fog: 1.65, horizon: 0.65, contrast: 0.50, distant: 0.58 },
    storm:         { fog: 2.10, horizon: 0.45, contrast: 0.40, distant: 0.38 },
    cinematic:     { fog: 1.00, horizon: 0.95, contrast: 0.48, distant: 0.82 },
    surveillance:  { fog: 0.25, horizon: 1.20, contrast: 0.18, distant: 1.00 },
    lowVisibility: { fog: 2.60, horizon: 0.38, contrast: 0.30, distant: 0.28 },
  });

  // ── State ──────────────────────────────────────────────────────────────────────

  var _enabled     = false;
  var _autoGate    = false;
  var _rafId       = null;
  var _lastTs      = 0;
  var _probeAccum  = 0;

  var _exposureBias   = 'cinematic';
  var _exposureBudget = 1200;    // meters — max safe reveal distance

  var _camState = {
    lat:       0, lng:       0,
    zoom:      11, pitch:     45, bearing:  0,
    speed:     0,  turnRate:  0,  altScalar: 0,
  };

  var _confidence = {
    tileConfidence:      1.0,
    vectorConfidence:    1.0,
    extrusionConfidence: 1.0,
    exposureConfidence:  1.0,
  };

  // Previous confidence band — used to detect green/yellow → red transition
  // and trigger an emergency tile preload burst via PTPR.
  var _prevConfidenceBand = 'green';   // 'green' | 'yellow' | 'red'

  // Tile emergence coupling — injected by TileEmergenceStyling.
  // 0.0 = world fully resolved, 1.0 = tiles completely unresolved.
  // Blended into the veil canvas draw as an additive contribution.
  var _tileEmergenceAlpha = 0.0;

  var _target = {
    fogDensity:          0.0,
    horizonDistance:     1.0,
    contrastCompression: 0.0,
    distantOpacity:      1.0,
    silhouetteBias:      0.0,
    veilStrength:        0.0,
  };

  // Smoothed values — updated each frame via hysteresis lerp
  var _smoothed = {
    fogDensity:          0.0,
    horizonDistance:     1.0,
    contrastCompression: 0.0,
    distantOpacity:      1.0,
    silhouetteBias:      0.0,
    veilStrength:        0.0,
    initialized:         false,
  };

  // ── Canvas ──────────────────────────────────────────────────────────────────────

  var _canvas  = null;
  var _ctx     = null;

  function _ensureCanvas() {
    if (_canvas && _canvas.parentElement) return true;

    var container = document.querySelector('.mapboxgl-canvas-container') ||
                    document.querySelector('.canvas-area') ||
                    document.body;

    _canvas = document.createElement('canvas');
    _canvas.id = 'wos-tca-veil-canvas';
    _canvas.setAttribute('aria-hidden', 'true');
    _canvas.style.cssText = [
      'position:absolute', 'inset:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:7',   // above atmosphere(6), below aircraft(8)
    ].join(';');
    container.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    return true;
  }

  function _resizeCanvas() {
    if (!_canvas || !_canvas.parentElement) return;
    var p = _canvas.parentElement;
    var w = p.offsetWidth  || 1280;
    var h = p.offsetHeight || 720;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width  = w;
      _canvas.height = h;
    }
  }

  // ── Geo offset (flat-earth, mirrors CameraRig + BuildingContinuity) ───────────

  function _geoOffset(lat, lng, bearingDeg, distM) {
    var hdgRad = bearingDeg * Math.PI / 180;
    var dLat   = Math.cos(hdgRad) * distM / 111320;
    var dLng   = Math.sin(hdgRad) * distM / (111320 * Math.cos(lat * Math.PI / 180));
    return { lat: lat + dLat, lng: lng + dLng };
  }

  function _interpolateRoute(route, t) {
    if (!route || route.length < 2) return null;
    t = Math.max(0, Math.min(1, t));
    if (t >= 1) return route[route.length - 1];
    var segLen = 1 / (route.length - 1);
    var idx    = Math.min(Math.floor(t / segLen), route.length - 2);
    var segT   = (t - idx * segLen) / segLen;
    var p0 = route[idx], p1 = route[idx + 1];
    return { lat: p0.lat + (p1.lat - p0.lat) * segT, lng: p0.lng + (p1.lng - p0.lng) * segT };
  }

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── 1. Camera state update ────────────────────────────────────────────────────

  function _updateCameraState(map, dt) {
    var center  = map.getCenter();
    var zoom    = map.getZoom();
    var bearing = map.getBearing();
    var pitch   = map.getPitch();
    var dtSec   = Math.max(0.001, dt / 1000);

    // Speed in degrees/sec, smoothed
    var dLat  = center.lat - _camState.lat;
    var dLng  = center.lng - _camState.lng;
    var raw   = Math.sqrt(dLat * dLat + dLng * dLng) / dtSec;
    _camState.speed    = _camState.speed    * 0.82 + raw * 0.18;

    // Turn rate degrees/sec, smoothed
    var dB = bearing - _camState.bearing;
    while (dB >  180) dB -= 360;
    while (dB < -180) dB += 360;
    _camState.turnRate = _camState.turnRate * 0.82 + (Math.abs(dB) / dtSec) * 0.18;

    _camState.lat     = center.lat;
    _camState.lng     = center.lng;
    _camState.zoom    = zoom;
    _camState.pitch   = pitch;
    _camState.bearing = bearing;

    // Altitude scalar from active trip
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (rt) {
      var s = rt.getState();
      _camState.altScalar = (s.current && s.current.altitudeScalar) || 0;
    }
  }

  // ── 2. Predictive Tile Readiness (probe at 3 Hz) ──────────────────────────────

  function _queryAheadFeatures(map, layerFilter) {
    var total   = 0;
    var lat     = _camState.lat;
    var lng     = _camState.lng;
    var bearing = _camState.bearing;

    for (var i = 0; i < AHEAD_DISTANCES_M.length; i++) {
      var pt = _geoOffset(lat, lng, bearing, AHEAD_DISTANCES_M[i]);
      try {
        var px   = map.project([pt.lng, pt.lat]);
        var bbox = [[px.x - 8, px.y - 8], [px.x + 8, px.y + 8]];
        var opts = layerFilter ? { layers: layerFilter } : {};
        var f    = map.queryRenderedFeatures(bbox, opts);
        total   += f ? f.length : 0;
      } catch (e) { /* off-canvas — skip */ }
    }
    return total;
  }

  function _queryRouteAhead(map) {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) return 0;
    var s = rt.getState();
    if (!s.active || !s.presetId) return 0;
    var preset = rt.PRESETS && rt.PRESETS[s.presetId];
    if (!preset || !preset.route) return 0;

    var total = 0;
    for (var i = 0; i < ROUTE_AHEAD_OFFSETS.length; i++) {
      var futureT = Math.min(1, s.progress + ROUTE_AHEAD_OFFSETS[i]);
      var pos     = _interpolateRoute(preset.route, futureT);
      if (!pos) continue;
      try {
        var px   = map.project([pos.lng, pos.lat]);
        var bbox = [[px.x - 10, px.y - 10], [px.x + 10, px.y + 10]];
        var f    = map.queryRenderedFeatures(bbox, {});
        total   += f ? f.length : 0;
      } catch (e) { /* off-canvas */ }
    }
    return total;
  }

  function _updateConfidence(map) {
    var tilesLoaded  = !!(typeof map.areTilesLoaded === 'function' && map.areTilesLoaded());
    var styleReady   = !!(typeof map.isStyleLoaded  === 'function' && map.isStyleLoaded());

    // Tile confidence
    var tileConf = tilesLoaded ? 1.0 : 0.30;

    // Extrusion confidence — defer to BuildingContinuityRuntime if loaded
    var bcr      = global.SBE && SBE.BuildingContinuityRuntime;
    var bcrState = bcr ? bcr.getState() : null;
    var extConf  = bcrState ? bcrState.readinessScalar : (tilesLoaded ? 0.75 : 0.28);

    // Vector confidence — general rendered features ahead
    var aheadCount  = styleReady ? _queryAheadFeatures(map, null) : 0;
    var routeCount  = styleReady ? _queryRouteAhead(map) : 0;
    var totalAhead  = aheadCount + routeCount * 0.5;
    // Many features ahead + tiles not loaded = low vector confidence
    var vectorConf  = tilesLoaded ? 0.88
      : (totalAhead > 12 ? 0.25 : totalAhead > 5 ? 0.45 : 0.60);

    // Speed penalty: surface-glide speed starts impacting at SPEED_VEIL_ONSET
    var speedNorm   = Math.min(1.0, Math.max(0, _camState.speed - SPEED_VEIL_ONSET) * SPEED_VEIL_SCALE);
    var speedPenalty = speedNorm * 0.40;

    // Turn rate penalty: sharp turns spike concealment briefly
    var turnPenalty = Math.min(0.28, _camState.turnRate * 0.005);

    // Zoom penalty: high zoom (z > 14) in cold-tile situation
    var zoomPenalty = Math.max(0, (_camState.zoom - 14.0) * 0.07) * (tilesLoaded ? 0 : 1);

    // Composite
    var raw = (tileConf * 0.42 + extConf * 0.33 + vectorConf * 0.25)
              * (1 - speedPenalty)
              * (1 - turnPenalty)
              * (1 - Math.min(0.35, zoomPenalty));

    var finalConf = Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000;

    _confidence.tileConfidence      = Math.round(tileConf  * 1000) / 1000;
    _confidence.vectorConfidence    = Math.round(vectorConf * 1000) / 1000;
    _confidence.extrusionConfidence = Math.round(extConf   * 1000) / 1000;
    _confidence.exposureConfidence  = finalConf;

    // ── PTPR urgency: fire preloadAhead() when confidence crosses into red ────
    // The veil is now up — use the concealment window to aggressively pre-warm tiles.
    var band = finalConf > 0.75 ? 'green' : finalConf > 0.40 ? 'yellow' : 'red';
    if (band === 'red' && _prevConfidenceBand !== 'red') {
      var ptpr = global.SBE && SBE.PredictiveTilePreloadRuntime;
      if (ptpr && typeof ptpr.preloadAhead === 'function') ptpr.preloadAhead();
    }
    _prevConfidenceBand = band;
  }

  // ── 3. Compute target concealment ─────────────────────────────────────────────

  function _computeTarget() {
    var conf = _confidence.exposureConfidence;
    var bias = BIAS_TABLE[_exposureBias] || BIAS_TABLE.cinematic;

    // Base concealment: inverse of confidence
    var baseConc = 1 - conf;

    // Speed contribution: independent of tile state — motion itself creates atmosphere
    var speedConc = Math.min(0.38, Math.max(0,
      _camState.speed - SPEED_VEIL_ONSET) * SPEED_VEIL_SCALE * 0.38);

    // Turn rate: brief veil spike on sharp turns (hides pop during pan)
    var turnConc  = Math.min(0.22, _camState.turnRate * 0.004);

    // Altitude: high altitude widens revealed area (surveillance mode gets less veil)
    var altBonus  = _camState.altScalar * 0.12;  // high altitude = slightly less fog density

    // Combined veil driver
    var rawBase = Math.min(1, (baseConc + speedConc + turnConc));

    var fogDensity   = Math.min(0.85, rawBase * bias.fog * (1 - altBonus));
    var horizonDist  = Math.max(0.10, Math.min(1,
      (conf * bias.horizon) - speedConc * 0.5));

    // Apply exposure budget: cap horizon distance by budget
    // 1200m budget → full horizon; 300m budget → very near horizon
    var budgetScalar = Math.max(0.08, Math.min(1, _exposureBudget / 1200));
    horizonDist      = Math.min(horizonDist, budgetScalar);

    var contrastComp = Math.min(0.72, rawBase * bias.contrast);
    var distOpacity  = Math.max(0.15, 1 - rawBase * (2 - bias.distant));
    var silhBias     = Math.min(0.80, rawBase * 1.15);

    // Composite veil strength: blend of fog + horizon compression
    var veilStrength = Math.min(1, fogDensity * 0.55 + (1 - horizonDist) * 0.45);

    _target.fogDensity          = fogDensity;
    _target.horizonDistance     = horizonDist;
    _target.contrastCompression = contrastComp;
    _target.distantOpacity      = distOpacity;
    _target.silhouetteBias      = silhBias;
    _target.veilStrength        = veilStrength;
  }

  // ── 4+5. Temporal smooth with hysteresis ──────────────────────────────────────

  function _smooth(dt) {
    var dtN  = Math.min(dt, 100) / 16.667;
    var keys = Object.keys(_target);

    if (!_smoothed.initialized) {
      for (var k in _target) {
        if (_target.hasOwnProperty(k)) _smoothed[k] = _target[k];
      }
      _smoothed.initialized = true;
      return;
    }

    for (var i = 0; i < keys.length; i++) {
      var key  = keys[i];
      var diff = _target[key] - _smoothed[key];
      // Rising (concealment increasing): slow onset — avoids sudden veil pop-on
      // Falling (concealment decreasing): very slow release — hysteresis
      var alphaBase = diff > 0 ? ALPHA_RISE : ALPHA_FALL;
      var alpha     = 1 - Math.pow(1 - alphaBase, dtN);
      _smoothed[key] = _smoothed[key] + diff * alpha;
    }
  }

  // ── 1. Velocity-Adaptive Atmospheric Veil — canvas draw ───────────────────────
  // Grace Distance Rendering is encoded in this pass:
  //   - unresolved land: silhouette gradient at horizon
  //   - unresolved buildings: fog cluster at mid-distance
  //   - unresolved roads: near-invisible (below visual threshold)
  //   - coastlines: fog gradient at horizon band

  function _drawVeil() {
    if (!_ctx || !_canvas) return;

    var w = _canvas.width;
    var h = _canvas.height;
    _ctx.clearRect(0, 0, w, h);

    var vs = _smoothed.veilStrength;
    // Tile emergence coupling: TileEmergenceStyling injects an additive alpha
    // that boosts the veil when world geometry is unresolved.
    // Max boost: 0.65 (prevents emergence from fully opaquing the screen).
    if (_tileEmergenceAlpha > 0.001) {
      vs = Math.min(1.0, vs + _tileEmergenceAlpha * 0.65);
    }
    if (vs < 0.005) return;

    var fog  = _smoothed.fogDensity;
    var hor  = _smoothed.horizonDistance;
    var dist = _smoothed.distantOpacity;
    var silh = _smoothed.silhouetteBias;
    var pitch = Math.max(20, Math.min(75, _camState.pitch || 45));

    // Horizon line Y: pitch 0°=50%, 75°=~22% from top
    var horizonFrac = 0.50 - (pitch / 180) * 0.55;
    var horizonY    = h * Math.max(0.05, Math.min(0.75, horizonFrac));

    // ── Band 1: Sky haze (above horizon) ──────────────────────────────────────
    // Encodes: distant silhouette mass, atmospheric depth, sky streaming grace
    var skyAlpha = fog * 0.52 * vs;
    if (skyAlpha > 0.005) {
      var skyGrad = _ctx.createLinearGradient(0, horizonY, 0, 0);
      skyGrad.addColorStop(0, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',' + (skyAlpha * 0.9).toFixed(3) + ')');
      skyGrad.addColorStop(0.40, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',' + (skyAlpha * 0.45).toFixed(3) + ')');
      skyGrad.addColorStop(1, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',0)');
      _ctx.fillStyle = skyGrad;
      _ctx.fillRect(0, 0, w, horizonY);
    }

    // ── Band 2: Mid-distance ground fog (below horizon, upper portion) ────────
    // Encodes: unresolved building cluster haze, streaming geometry grace
    var midFogDepth = h * (1 - hor) * 0.55;
    var midAlpha    = fog * 0.68 * vs;
    if (midAlpha > 0.005 && midFogDepth > 2) {
      var midGrad = _ctx.createLinearGradient(0, horizonY, 0, horizonY + midFogDepth);
      midGrad.addColorStop(0, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',' + (midAlpha).toFixed(3) + ')');
      midGrad.addColorStop(0.60, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',' + (midAlpha * 0.30).toFixed(3) + ')');
      midGrad.addColorStop(1, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',0)');
      _ctx.fillStyle = midGrad;
      _ctx.fillRect(0, horizonY, w, midFogDepth);
    }

    // ── Band 3: Near-ground surface film (bottom of canvas) ──────────────────
    // Encodes: surface-glide near-ground atmosphere, coastline fog gradient
    var nearAlpha = fog * 0.28 * vs * (1 - _camState.altScalar);
    if (nearAlpha > 0.005) {
      var nearGrad = _ctx.createLinearGradient(0, h, 0, h * 0.72);
      nearGrad.addColorStop(0, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',' + (nearAlpha * 0.6).toFixed(3) + ')');
      nearGrad.addColorStop(1, 'rgba(' + VEIL_R + ',' + VEIL_G + ',' + VEIL_B + ',0)');
      _ctx.fillStyle = nearGrad;
      _ctx.fillRect(0, h * 0.72, w, h - h * 0.72);
    }

    // ── Band 4: Lateral edge vignette ──────────────────────────────────────────
    // Encodes: peripheral streaming grace, speed-induced edge blur
    var edgeAlpha = (fog * 0.30 + _smoothed.contrastCompression * 0.25) * vs;
    if (edgeAlpha > 0.005) {
      var edgeGrad = _ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.28,
                                               w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
      edgeGrad.addColorStop(0, 'rgba(0,0,0,0)');
      edgeGrad.addColorStop(1, 'rgba(0,0,0,' + (edgeAlpha * 0.7).toFixed(3) + ')');
      _ctx.fillStyle = edgeGrad;
      _ctx.fillRect(0, 0, w, h);
    }

    // ── Band 5: Silhouette horizon band ────────────────────────────────────────
    // Encodes: unresolved coastline/terrain as dark silhouette mass at horizon
    var silhAlpha = silh * 0.18 * vs;
    if (silhAlpha > 0.005) {
      var bandH = h * 0.025;
      var silhGrad = _ctx.createLinearGradient(0, horizonY - bandH, 0, horizonY + bandH);
      silhGrad.addColorStop(0, 'rgba(28,32,38,0)');
      silhGrad.addColorStop(0.5, 'rgba(28,32,38,' + silhAlpha.toFixed(3) + ')');
      silhGrad.addColorStop(1, 'rgba(28,32,38,0)');
      _ctx.fillStyle = silhGrad;
      _ctx.fillRect(0, horizonY - bandH, w, bandH * 2);
    }
  }

  // ── 4. Exposure Budget System ─────────────────────────────────────────────────

  function setExposureBudget(distanceM) {
    _exposureBudget = Math.max(50, Math.min(5000, Number(distanceM) || 1200));
    console.log('[TCA] exposureBudget →', _exposureBudget + 'm');
  }

  function getExposureBudget() { return _exposureBudget; }

  function setExposureBias(mode) {
    if (!BIAS_TABLE[mode]) {
      console.warn('[TCA] unknown bias mode:', mode,
        '— available:', Object.keys(BIAS_TABLE).join(', '));
      return false;
    }
    _exposureBias = mode;
    console.log('[TCA] exposureBias →', mode);
    return true;
  }

  function getExposureBias() { return _exposureBias; }

  // ── Predictive coverage APIs (subsystem 2) ────────────────────────────────────

  function getTileCoverageAhead() {
    var map = _getMap();
    if (!map) return { loaded: false, confidence: 0 };
    var loaded = !!(typeof map.areTilesLoaded === 'function' && map.areTilesLoaded());
    return { loaded: loaded, confidence: _confidence.tileConfidence };
  }

  function getExtrusionCoverageAhead() {
    var bcr = global.SBE && SBE.BuildingContinuityRuntime;
    var s   = bcr ? bcr.getState() : null;
    return {
      layersFound:    s ? s.buildingLayersFound : false,
      aheadFeatures:  s ? s.aheadFeatureCount  : 0,
      confidence:     _confidence.extrusionConfidence,
    };
  }

  function getVectorCoverageAhead() {
    return {
      aheadCount:  0,   // polled lazily in probe cycle, not kept frame-precise
      confidence:  _confidence.vectorConfidence,
    };
  }

  function getExposureConfidence() {
    return _confidence.exposureConfidence;
  }

  // ── Speed gating (subsystem integration) ─────────────────────────────────────

  function _applySpeedGating() {
    if (!_autoGate) return;
    if (_confidence.exposureConfidence > GATE_THRESHOLD) return;

    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) return;
    var s = rt.getState();
    if (!s.active) return;

    var current = s.speedMultiplier || 1.0;
    var gated   = Math.max(GATE_MIN_SPEED, current * GATE_DAMPING);

    if (Math.abs(gated - current) > 0.02) {
      rt.setSpeed(gated);
    }
  }

  // ── rAF loop ──────────────────────────────────────────────────────────────────

  function _frame(ts) {
    if (!_enabled) return;
    _rafId = global.requestAnimationFrame(_frame);

    var dt = _lastTs > 0 ? ts - _lastTs : 16.667;
    _lastTs = ts;

    var map = _getMap();
    if (!map) return;

    _ensureCanvas();
    _resizeCanvas();

    // Camera state: every frame
    _updateCameraState(map, dt);

    // Confidence: 3 Hz probe
    _probeAccum += dt;
    if (_probeAccum >= PROBE_INTERVAL_MS) {
      _probeAccum = 0;
      _updateConfidence(map);
    }

    // Target concealment
    _computeTarget();

    // Smooth (hysteresis)
    _smooth(dt);

    // Draw veil canvas
    _drawVeil();

    // Speed gating (if auto-gate enabled)
    _applySpeedGating();
  }

  // ── Public controls ───────────────────────────────────────────────────────────

  function start() {
    if (_enabled) return;
    _enabled = true;
    _lastTs  = 0;
    _probeAccum = PROBE_INTERVAL_MS;   // probe immediately on first frame
    _smoothed.initialized = false;
    _rafId = global.requestAnimationFrame(_frame);
    console.log('[TraversalContinuityAuthority] v' + VERSION + ' started — bias:', _exposureBias);
  }

  function stop() {
    _enabled = false;
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
    _lastTs = 0;
    // Clear canvas
    if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    console.log('[TraversalContinuityAuthority] stopped — veil cleared');
  }

  function setEnabled(val) {
    if (!!val) { start(); } else { stop(); }
  }

  function getEnabled() { return _enabled; }

  function setAutoGate(val) {
    _autoGate = !!val;
    console.log('[TCA] autoGate →', _autoGate);
  }

  function getAutoGate() { return _autoGate; }

  // ── 6. Traversal Confidence Metrics — debug snapshot ─────────────────────────

  function getDebugSnapshot() {
    return {
      version:             VERSION,
      enabled:             _enabled,
      autoGate:            _autoGate,
      exposureBias:        _exposureBias,
      exposureBudgetM:     _exposureBudget,
      // Confidence
      tileConfidence:      _confidence.tileConfidence,
      vectorConfidence:    _confidence.vectorConfidence,
      extrusionConfidence: _confidence.extrusionConfidence,
      exposureConfidence:  _confidence.exposureConfidence,
      // Camera
      cameraSpeed:         Math.round(_camState.speed * 1e6) / 1e6,
      cameraTurnRate:      Math.round(_camState.turnRate * 10) / 10,
      cameraZoom:          Math.round(_camState.zoom * 100) / 100,
      cameraPitch:         Math.round(_camState.pitch * 10) / 10,
      altitudeScalar:      Math.round(_camState.altScalar * 1000) / 1000,
      // Smoothed concealment
      concealmentStrength: Math.round(_smoothed.veilStrength * 1000) / 1000,
      fogDensity:          Math.round(_smoothed.fogDensity * 1000) / 1000,
      horizonClamp:        Math.round(_smoothed.horizonDistance * 1000) / 1000,
      atmosphericBias:     Math.round(_smoothed.silhouetteBias * 1000) / 1000,
      revealBudget:        Math.round(_smoothed.distantOpacity * 1000) / 1000,
      contrastCompression: Math.round(_smoothed.contrastCompression * 1000) / 1000,
      // Target (where smoothed is converging)
      target: {
        veilStrength:        Math.round(_target.veilStrength * 1000) / 1000,
        fogDensity:          Math.round(_target.fogDensity * 1000) / 1000,
        horizonDistance:     Math.round(_target.horizonDistance * 1000) / 1000,
        distantOpacity:      Math.round(_target.distantOpacity * 1000) / 1000,
        silhouetteBias:      Math.round(_target.silhouetteBias * 1000) / 1000,
      },
    };
  }

  // Alias: matches spec API requirement
  function getState() { return getDebugSnapshot(); }

  // ── Tile emergence coupling ───────────────────────────────────────────────────
  // Called by TileEmergenceStyling each rAF frame with a 0–1 alpha value.
  // 0 = tiles fully resolved (no extra veil), 1 = tiles completely unresolved.
  // Blended into _drawVeil() as an additive veilStrength boost.

  function setTileEmergenceAlpha(alpha) {
    _tileEmergenceAlpha = Math.max(0, Math.min(1, alpha || 0));
  }

  function getTileEmergenceAlpha() { return _tileEmergenceAlpha; }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.TraversalContinuityAuthority = Object.freeze({
    VERSION:                 VERSION,
    start:                   start,
    stop:                    stop,
    setEnabled:              setEnabled,
    getEnabled:              getEnabled,
    setAutoGate:             setAutoGate,
    getAutoGate:             getAutoGate,
    setExposureBudget:       setExposureBudget,
    getExposureBudget:       getExposureBudget,
    setExposureBias:         setExposureBias,
    getExposureBias:         getExposureBias,
    getTileCoverageAhead:    getTileCoverageAhead,
    getExtrusionCoverageAhead: getExtrusionCoverageAhead,
    getVectorCoverageAhead:  getVectorCoverageAhead,
    getExposureConfidence:   getExposureConfidence,
    getDebugSnapshot:        getDebugSnapshot,
    setTileEmergenceAlpha:   setTileEmergenceAlpha,
    getTileEmergenceAlpha:   getTileEmergenceAlpha,
    getState:                getState,
  });

  console.log('[TraversalContinuityAuthority] v' + VERSION + ' loaded — call .start() to begin');

})(window);
