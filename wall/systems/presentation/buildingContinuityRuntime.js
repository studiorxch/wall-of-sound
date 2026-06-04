// ── BuildingContinuityRuntime v1.0.0 ─────────────────────────────────────────
// 0528W_WOS_3DBuildingContinuityAndPrewarm_v1.0.0
// Status: active
// Classification: presentation-continuity-runtime
//
// Purpose:
//   Reduce visible Mapbox 3D building extrusion pop-in during surface-glide
//   and broadcast traversal sessions.
//
//   Tactics (layered, non-destructive):
//     A — Query warmup at 2–4 Hz (queryRenderedFeatures near current view)
//     B — Ahead-of-camera sample points projected in heading direction
//     C — Conservative speed gating when readiness is cold (opt-in)
//     D — Atmospheric veil recommendation when pop-in risk is high
//     E — Extrusion fade-in via setPaintProperty (disabled by default)
//
// Authority:
//   OWNS: building continuity readiness snapshot, prewarm queue,
//         reveal-risk scalar, optional fade policy
//   READS: Mapbox GL map, active style layers, RegionalFlightTripRuntime,
//          RegionalFlightCameraRig, AtmosphericContinuityRuntime
//   MUST NOT: own route truth, fabricate buildings, reload map style,
//             permanently mutate building layer paint, create camera jumps,
//             degrade normal editor behavior
//
// Placement: wall/systems/presentation/buildingContinuityRuntime.js
// Load: AFTER regionalFlightCameraRig.js, BEFORE traversalControlDeck.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Tuning constants ──────────────────────────────────────────────────────────

  var PROBE_INTERVAL_MS     = 333;   // ~3 Hz — query probe cadence
  var ROUTE_PROBE_INTERVAL_MS = 800; // ~1.25 Hz — route-ahead readiness scan

  // Sample distances ahead of camera (meters)
  var AHEAD_DISTANCES_M = Object.freeze([150, 300, 600, 1000]);

  // Route-ahead progress increments (normalized 0–1)
  var ROUTE_AHEAD_INCREMENTS = Object.freeze([0.003, 0.006, 0.012, 0.024]);

  // Pop-in risk thresholds
  var DENSE_THRESHOLD     = 8;    // feature count that flags dense zone
  var HIGH_RISK_THRESHOLD = 0.70; // popInRiskScalar above which veil is recommended

  // Auto-gate speed damping: effectiveSpeed = max(0.25, currentSpeed * 0.80)
  var AUTO_GATE_DAMPING    = 0.80;
  var AUTO_GATE_MIN_SPEED  = 0.25;

  // Fade-in duration when extrusion fade is active
  var FADE_IN_MS           = 1200;
  var FADE_OPACITY_START   = 0.0;
  var FADE_OPACITY_TARGET  = 1.0;   // restored value; actual layer value read at detect time

  // ── Geo utility: flat-earth offset ────────────────────────────────────────────
  // Returns {lat, lng} displaced distM metres along headingDeg from origin.

  function _geoOffset(lat, lng, headingDeg, distM) {
    var hdgRad = headingDeg * Math.PI / 180;
    var dLat   = Math.cos(hdgRad) * distM / 111320;
    var dLng   = Math.sin(hdgRad) * distM / (111320 * Math.cos(lat * Math.PI / 180));
    return { lat: lat + dLat, lng: lng + dLng };
  }

  // ── Route interpolation (mirrors TripRuntime) ─────────────────────────────────
  // Simple linear interpolation on pre-built route for ahead probes.

  function _interpolateRoute(route, t) {
    if (!route || route.length < 2) return null;
    t = Math.max(0, Math.min(1, t));
    if (t >= 1) return { lat: route[route.length - 1].lat, lng: route[route.length - 1].lng };
    var segLen = 1 / (route.length - 1);
    var segIdx = Math.floor(t / segLen);
    segIdx     = Math.min(segIdx, route.length - 2);
    var segT   = (t - segIdx * segLen) / segLen;
    var p0     = route[segIdx];
    var p1     = route[segIdx + 1];
    return {
      lat: p0.lat + (p1.lat - p0.lat) * segT,
      lng: p0.lng + (p1.lng - p0.lng) * segT,
    };
  }

  // ── State ──────────────────────────────────────────────────────────────────────

  var _enabled          = false;
  var _autoGate         = false;
  var _veilEnabled      = false;
  var _fadePolicyActive = false;   // tactic E — disabled by default until verified safe

  var _probeTimer       = null;
  var _routeProbeTimer  = null;
  var _fadeTimers       = {};      // layerId → rAF / timer for fade restoration

  var _buildingLayerIds = [];      // detected fill-extrusion layer IDs
  var _buildingOpacityOriginals = {};  // saved original opacity values for fade restoration

  var _s = {
    // snapshot — updated each probe cycle
    enabled:             false,
    mapReady:            false,
    styleReady:          false,
    buildingLayersFound: false,
    buildingLayerIds:    [],
    tilesLoaded:         false,
    lastIdleMs:          0,
    lastSourceDataMs:    0,
    cameraZoom:          0,
    cameraPitch:         0,
    visibleFeatureCount: 0,
    aheadFeatureCount:   0,
    readinessScalar:     1.0,   // 1.0 = safe
    popInRiskScalar:     0.0,   // 1.0 = high risk
    denseZoneRiskScalar: 0.0,
    prewarmQueueLength:  0,
    fadePolicyActive:    false,
    gatingRecommended:   false,
    veilRecommended:     false,
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Building layer detection ───────────────────────────────────────────────────
  // Finds all fill-extrusion type layers in the active map style.

  function _findBuildingExtrusionLayers(map) {
    if (!map || typeof map.getStyle !== 'function') return [];
    var style = null;
    try { style = map.getStyle(); } catch (e) { return []; }
    if (!style || !style.layers) return [];

    var result = [];
    for (var i = 0; i < style.layers.length; i++) {
      var layer = style.layers[i];
      if (layer.type !== 'fill-extrusion') continue;
      result.push({
        id:          layer.id,
        source:      layer.source || null,
        sourceLayer: layer['source-layer'] || null,
        minzoom:     layer.minzoom || 0,
        paint:       layer.paint || {},
        layout:      layer.layout || {},
      });
    }
    return result;
  }

  function detectLayers() {
    var map = _getMap();
    if (!map) {
      console.warn('[BuildingContinuityRuntime] map not available for layer detection');
      return [];
    }
    var layers = _findBuildingExtrusionLayers(map);
    _buildingLayerIds = layers.map(function (l) { return l.id; });

    _s.buildingLayersFound = layers.length > 0;
    _s.buildingLayerIds    = _buildingLayerIds.slice();

    if (layers.length === 0) {
      console.warn('[BuildingContinuityRuntime] no fill-extrusion building layers found in style');
    } else {
      console.log('[BuildingContinuityRuntime] detected', layers.length, 'building extrusion layer(s):',
        _buildingLayerIds.join(', '));
    }
    return layers;
  }

  // ── Readiness snapshot ────────────────────────────────────────────────────────

  function _updateReadiness(map) {
    _s.mapReady    = !!map;
    _s.styleReady  = !!(map && typeof map.isStyleLoaded === 'function' && map.isStyleLoaded());
    _s.tilesLoaded = !!(map && typeof map.areTilesLoaded === 'function' && map.areTilesLoaded());
    _s.cameraZoom  = map ? map.getZoom()  : 0;
    _s.cameraPitch = map ? map.getPitch() : 0;
    _s.enabled     = _enabled;
    _s.fadePolicyActive = _fadePolicyActive;
  }

  // ── Feature probe — current viewport ─────────────────────────────────────────

  function _probeCurrentView(map) {
    if (!_buildingLayerIds.length || !map) return 0;
    try {
      var features = map.queryRenderedFeatures({ layers: _buildingLayerIds });
      return features ? features.length : 0;
    } catch (e) {
      return 0;
    }
  }

  // ── Feature probe — ahead of camera ───────────────────────────────────────────
  // Projects sample points ahead and queries a small pixel region around each.

  function _probeAhead(map) {
    if (!_buildingLayerIds.length || !map) return 0;
    var center  = map.getCenter();
    var bearing = map.getBearing();
    var total   = 0;

    for (var i = 0; i < AHEAD_DISTANCES_M.length; i++) {
      var distM  = AHEAD_DISTANCES_M[i];
      var pt     = _geoOffset(center.lat, center.lng, bearing, distM);
      try {
        var px     = map.project([pt.lng, pt.lat]);
        // Query a 12×12 pixel region around the projected point
        var bbox   = [
          [px.x - 6, px.y - 6],
          [px.x + 6, px.y + 6],
        ];
        var feats  = map.queryRenderedFeatures(bbox, { layers: _buildingLayerIds });
        total += feats ? feats.length : 0;
      } catch (e) {
        // Point may be off-canvas — skip silently
      }
    }
    return total;
  }

  // ── Route-ahead probe ─────────────────────────────────────────────────────────
  // Projects future route waypoints and queues a lightweight check.

  function _probeRouteAhead(map) {
    if (!_buildingLayerIds.length || !map) return;

    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) return;
    var s  = rt.getState();
    if (!s.active || !s.presetId) return;

    // Get the active route from the preset
    var preset = (rt.PRESETS && rt.PRESETS[s.presetId]) || null;
    if (!preset || !preset.route) return;

    var route     = preset.route;
    var progress  = s.progress || 0;
    var probeHits = 0;

    for (var i = 0; i < ROUTE_AHEAD_INCREMENTS.length; i++) {
      var futureT = Math.min(1, progress + ROUTE_AHEAD_INCREMENTS[i]);
      var pos     = _interpolateRoute(route, futureT);
      if (!pos) continue;
      try {
        var px    = map.project([pos.lng, pos.lat]);
        var bbox  = [[px.x - 8, px.y - 8], [px.x + 8, px.y + 8]];
        var feats = map.queryRenderedFeatures(bbox, { layers: _buildingLayerIds });
        probeHits += feats ? feats.length : 0;
      } catch (e) { /* off-canvas */ }
    }

    // Route probes count toward ahead estimate
    _s.aheadFeatureCount = Math.max(_s.aheadFeatureCount, probeHits);
  }

  // ── Risk scoring ──────────────────────────────────────────────────────────────

  function _scoreRisk() {
    // Tiles not loaded = meaningful risk
    var tilesRisk = _s.tilesLoaded ? 0.0 : 0.65;

    // Dense ahead = moderate risk (buildings exist but may be partially loaded)
    var denseRisk = _s.aheadFeatureCount >= DENSE_THRESHOLD ? 0.45 : 0.0;

    // High zoom + low pitch in cold zone amplifies risk (wider reveal angle)
    var zoomRisk  = (_s.cameraZoom > 15 && !_s.tilesLoaded) ? 0.30 : 0.0;

    // Composite
    var raw = Math.min(1.0, tilesRisk + denseRisk * 0.5 + zoomRisk);

    _s.popInRiskScalar     = Math.round(raw * 1000) / 1000;
    _s.denseZoneRiskScalar = _s.aheadFeatureCount >= DENSE_THRESHOLD ? 1.0 : 0.0;
    _s.readinessScalar     = Math.round((1.0 - raw) * 1000) / 1000;
    _s.gatingRecommended   = _s.popInRiskScalar > HIGH_RISK_THRESHOLD;
    _s.veilRecommended     = _s.popInRiskScalar > HIGH_RISK_THRESHOLD;
  }

  // ── Tactic C — Speed gating ────────────────────────────────────────────────────

  function _applyAutoGate() {
    if (!_autoGate || !_s.gatingRecommended) return;
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) return;
    var s = rt.getState();
    if (!s.active) return;

    var current  = s.speedMultiplier || 1.0;
    var gated    = Math.max(AUTO_GATE_MIN_SPEED, current * AUTO_GATE_DAMPING);

    if (Math.abs(gated - current) > 0.01) {
      rt.setSpeed(gated);
      // Log only when gate actually changes speed
      if (!_autoGate._lastGated || Math.abs(_autoGate._lastGated - gated) > 0.05) {
        console.log('[BuildingContinuityRuntime] auto-gate: speed', current.toFixed(2), '→', gated.toFixed(2),
          '(popInRisk:', _s.popInRiskScalar.toFixed(2) + ')');
      }
    }
  }

  // ── Tactic D — Veil escalation ────────────────────────────────────────────────
  // Requests AtmosphericContinuityRuntime to nudge silence/haze when risk is high.

  function _applyVeilRecommendation() {
    if (!_veilEnabled || !_s.veilRecommended) return;
    var acr = global.SBE && SBE.AtmosphericContinuityRuntime;
    if (!acr || typeof acr.hintVeil !== 'function') return;
    // Soft hint only — runtime decides how to act
    acr.hintVeil(_s.popInRiskScalar);
  }

  // ── Tactic E — Extrusion fade ─────────────────────────────────────────────────
  // Optional, default off. Fades building extrusion opacity from 0 on first reveal.
  // Requires MapStyleAuthority to not fight the temporary override.

  function _initiateFade(map, layerId) {
    if (!_fadePolicyActive) return;
    if (_fadeTimers[layerId]) return;  // already fading

    var originalOpacity = _buildingOpacityOriginals[layerId];
    if (originalOpacity === undefined) {
      try {
        originalOpacity = map.getPaintProperty(layerId, 'fill-extrusion-opacity');
        _buildingOpacityOriginals[layerId] = originalOpacity !== undefined ? originalOpacity : FADE_OPACITY_TARGET;
      } catch (e) {
        _buildingOpacityOriginals[layerId] = FADE_OPACITY_TARGET;
        originalOpacity = FADE_OPACITY_TARGET;
      }
    }

    // Set to 0 and fade up
    try { map.setPaintProperty(layerId, 'fill-extrusion-opacity', FADE_OPACITY_START); } catch (e) { return; }

    var startMs  = Date.now();
    var target   = _buildingOpacityOriginals[layerId];

    function _step() {
      var elapsed = Date.now() - startMs;
      var t       = Math.min(1, elapsed / FADE_IN_MS);
      var eased   = t * t * (3 - 2 * t);   // smoothstep
      var opacity = FADE_OPACITY_START + (target - FADE_OPACITY_START) * eased;
      try {
        map.setPaintProperty(layerId, 'fill-extrusion-opacity', opacity);
      } catch (e) {
        delete _fadeTimers[layerId];
        return;
      }
      if (t < 1) {
        _fadeTimers[layerId] = global.requestAnimationFrame(_step);
      } else {
        delete _fadeTimers[layerId];
      }
    }

    _fadeTimers[layerId] = global.requestAnimationFrame(_step);
  }

  // ── Probe cycle ───────────────────────────────────────────────────────────────

  function _probe() {
    if (!_enabled) return;

    var map = _getMap();
    _updateReadiness(map);

    if (!map || !_s.styleReady) return;

    // Re-detect layers if not yet found (style may have loaded after start())
    if (!_s.buildingLayersFound || _buildingLayerIds.length === 0) {
      detectLayers();
    }

    if (_buildingLayerIds.length === 0) return;

    // Probe current view
    _s.visibleFeatureCount = _probeCurrentView(map);

    // Probe ahead
    _s.aheadFeatureCount = _probeAhead(map);

    // Score risk
    _scoreRisk();

    // Tactic C
    _applyAutoGate();

    // Tactic D
    _applyVeilRecommendation();

    // Tactic E — initiate fade if just entered dense cold zone
    if (_fadePolicyActive && !_s.tilesLoaded && _s.aheadFeatureCount > 0) {
      for (var i = 0; i < _buildingLayerIds.length; i++) {
        _initiateFade(map, _buildingLayerIds[i]);
      }
    }
  }

  // ── Route-ahead probe cycle ───────────────────────────────────────────────────

  function _routeProbe() {
    if (!_enabled) return;
    var map = _getMap();
    if (!map || !_s.styleReady || !_buildingLayerIds.length) return;
    _probeRouteAhead(map);
  }

  // ── Prewarm ahead (manual / launch trigger) ───────────────────────────────────
  // Immediately runs a full ahead probe sequence and logs readiness.

  function prewarmAhead() {
    var map = _getMap();
    if (!map) {
      console.warn('[BuildingContinuityRuntime] prewarmAhead: map not available');
      return;
    }

    // Ensure layers detected
    if (_buildingLayerIds.length === 0) detectLayers();

    _updateReadiness(map);

    if (_buildingLayerIds.length === 0) {
      console.warn('[BuildingContinuityRuntime] prewarmAhead: no building layers — nothing to warm');
      return;
    }

    _s.visibleFeatureCount = _probeCurrentView(map);
    _s.aheadFeatureCount   = _probeAhead(map);
    _probeRouteAhead(map);
    _scoreRisk();

    console.log('[BuildingContinuityRuntime] prewarmAhead complete —',
      'visible:', _s.visibleFeatureCount,
      'ahead:', _s.aheadFeatureCount,
      'tilesLoaded:', _s.tilesLoaded,
      'popInRisk:', _s.popInRiskScalar.toFixed(2),
      'readiness:', _s.readinessScalar.toFixed(2));
  }

  // ── Timer management ──────────────────────────────────────────────────────────

  function _startTimers() {
    _stopTimers();
    _probeTimer      = global.setInterval(_probe,      PROBE_INTERVAL_MS);
    _routeProbeTimer = global.setInterval(_routeProbe, ROUTE_PROBE_INTERVAL_MS);
  }

  function _stopTimers() {
    if (_probeTimer)      { global.clearInterval(_probeTimer);      _probeTimer = null; }
    if (_routeProbeTimer) { global.clearInterval(_routeProbeTimer); _routeProbeTimer = null; }
  }

  // ── Idle listener ─────────────────────────────────────────────────────────────
  // Track last idle event so audit can show time since last full render.

  var _idleListenerAttached = false;

  function _attachIdleListener(map) {
    if (_idleListenerAttached || !map || typeof map.on !== 'function') return;
    map.on('idle',       function () { _s.lastIdleMs       = Date.now(); });
    map.on('sourcedata', function () { _s.lastSourceDataMs = Date.now(); });
    _idleListenerAttached = true;
  }

  // ── Public controls ───────────────────────────────────────────────────────────

  function start() {
    if (_enabled) return;
    _enabled = true;

    var map = _getMap();
    _attachIdleListener(map);

    // Initial layer detection
    if (map && map.isStyleLoaded && map.isStyleLoaded()) {
      detectLayers();
    }

    _startTimers();
    console.log('[BuildingContinuityRuntime] v' + VERSION + ' started');
  }

  function stop() {
    _enabled = false;
    _stopTimers();
    // Cancel any active fade timers
    Object.keys(_fadeTimers).forEach(function (id) {
      var t = _fadeTimers[id];
      if (t) global.cancelAnimationFrame(t);
    });
    _fadeTimers = {};
    console.log('[BuildingContinuityRuntime] stopped');
  }

  function setEnabled(val) {
    if (!!val) { start(); } else { stop(); }
  }

  function getEnabled() { return _enabled; }

  function setAutoGate(val) {
    _autoGate = !!val;
    console.log('[BuildingContinuityRuntime] autoGate →', _autoGate);
  }

  function getAutoGate() { return _autoGate; }

  function setVeil(val) {
    _veilEnabled = !!val;
    console.log('[BuildingContinuityRuntime] veil →', _veilEnabled);
  }

  function getVeil() { return _veilEnabled; }

  function setFadePolicy(val) {
    _fadePolicyActive = !!val;
    _s.fadePolicyActive = _fadePolicyActive;
    console.log('[BuildingContinuityRuntime] fadePolicy →', _fadePolicyActive,
      _fadePolicyActive
        ? '(caution: setPaintProperty on building layers)'
        : '(safe — only veil/gating active)');
  }

  function getFadePolicy() { return _fadePolicyActive; }

  function getState() {
    _s.enabled          = _enabled;
    _s.fadePolicyActive = _fadePolicyActive;
    return {
      version:             VERSION,
      enabled:             _s.enabled,
      autoGate:            _autoGate,
      veilEnabled:         _veilEnabled,
      fadePolicyActive:    _s.fadePolicyActive,
      mapReady:            _s.mapReady,
      styleReady:          _s.styleReady,
      buildingLayersFound: _s.buildingLayersFound,
      buildingLayerIds:    _s.buildingLayerIds.slice(),
      tilesLoaded:         _s.tilesLoaded,
      lastIdleMs:          _s.lastIdleMs,
      lastSourceDataMs:    _s.lastSourceDataMs,
      cameraZoom:          Math.round(_s.cameraZoom * 100) / 100,
      cameraPitch:         Math.round(_s.cameraPitch * 10) / 10,
      visibleFeatureCount: _s.visibleFeatureCount,
      aheadFeatureCount:   _s.aheadFeatureCount,
      readinessScalar:     _s.readinessScalar,
      popInRiskScalar:     _s.popInRiskScalar,
      denseZoneRiskScalar: _s.denseZoneRiskScalar,
      prewarmQueueLength:  _s.prewarmQueueLength,
      fadePolicyActive:    _s.fadePolicyActive,
      gatingRecommended:   _s.gatingRecommended,
      veilRecommended:     _s.veilRecommended,
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.BuildingContinuityRuntime = Object.freeze({
    VERSION:        VERSION,
    start:          start,
    stop:           stop,
    setEnabled:     setEnabled,
    getEnabled:     getEnabled,
    setAutoGate:    setAutoGate,
    getAutoGate:    getAutoGate,
    setVeil:        setVeil,
    getVeil:        getVeil,
    setFadePolicy:  setFadePolicy,
    getFadePolicy:  getFadePolicy,
    detectLayers:   detectLayers,
    prewarmAhead:   prewarmAhead,
    getState:       getState,
  });

  console.log('[BuildingContinuityRuntime] v' + VERSION + ' loaded — call .start() to begin monitoring');

})(window);
