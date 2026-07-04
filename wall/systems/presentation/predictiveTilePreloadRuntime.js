// ── PredictiveTilePreloadRuntime v1.2.0 ──────────────────────────────────────
// 0528Z_WOS_PredictiveTilePreloadCamera_v1.0.0 / 0528AA addendum
// Status: active
// Classification: presentation-continuity-runtime
//
// Purpose:
//   Creates a hidden second Mapbox GL JS map that follows the route ahead of
//   the visible camera. By moving this map to future route positions, Mapbox
//   fetches and decodes tiles, vector layers, buildings, roads, and shorelines
//   before the visible camera arrives.
//
// v1.2.0 additions (0528AA):
//   - preflightWarmRoute(options) — warm a corridor before visible traversal
//   - prefetchZoomDelta: 2 on hidden map constructor
//   - applyMapboxTraversalFog(mode) / clearMapboxTraversalFog() helpers
//   - applyExtrusionTransitions() — soft fill-extrusion-opacity-transition test
//   - expanded surface_glide rolling offsets (10-point dense coverage)
//   - getState() includes preflight sub-object
//
// v1.1.0 additions (7-gap fixes):
//   - mode-adaptive lookahead offsets
//   - zoom locked to settled glide zoom in surface_glide
//   - route-forward bearing per queue entry
//   - preinit() for cold-start style pre-load
//   - getState() fields: running, mapReady, mapZoom, mapCenter, stepIndex,
//     routeProgress, traversalProfile, zoomLock
//   - route-origin pre-burst before step loop
//
// Authority:
//   OWNS: hidden map instance, preload queue, warmed registry, fog helper,
//         preflight corridor state
//   READS: RegionalFlightTripRuntime, MapboxViewportRuntime
//   MUST NOT: affect visible map beyond fog/extrusion helpers (which are opt-in),
//             mutate route truth, modify simulation state
//
// Placement: wall/systems/presentation/predictiveTilePreloadRuntime.js
// Load: AFTER traversalContinuityAuthority.js, BEFORE traversalControlDeck.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.2.0';

  // ── Configuration ─────────────────────────────────────────────────────────────

  var MAP_WIDTH        = 800;
  var MAP_HEIGHT       = 800;
  var STEP_INTERVAL_MS = 1600;
  var IDLE_TIMEOUT_MS  = 4000;
  var MAX_WARMED       = 80;

  // Rolling lookahead offsets (normalized route-T).
  // surface_glide dense: 10 points, ~90m–1.8km on 300km route (~2.5 m/s travel)
  // surface_glide fallback: 4 points if FPS drops
  // regional: 4 points, ~3km–24km
  var LOOKAHEAD_SURFACE_GLIDE_DENSE = Object.freeze([
    0.0001, 0.0002, 0.0003, 0.0005, 0.00075,
    0.0010, 0.0015, 0.0025, 0.0040, 0.0060,
  ]);
  var LOOKAHEAD_SURFACE_GLIDE_SPARSE = Object.freeze([0.0003, 0.0010, 0.0025, 0.0050]);
  var LOOKAHEAD_REGIONAL             = Object.freeze([0.010,  0.025,  0.050,  0.080 ]);

  // Settled surface_glide zoom — matches RegionalFlightCameraRig's _glideBaseZoom.
  // Mutable: updated by setGlideZoom() when deck height profile changes.
  var _glideZoom = 15.35;   // default: balanced profile at altScalar=0.05

  // Preflight corridor defaults per mode
  var PREFLIGHT_DEFAULTS_SURFACE_GLIDE = Object.freeze({
    distanceAheadM: 10000, stepM: 200,  maxMs: 30000, stepTimeoutMs: 2000,
  });
  var PREFLIGHT_DEFAULTS_REGIONAL = Object.freeze({
    distanceAheadM: 25000, stepM: 1000, maxMs: 30000, stepTimeoutMs: 2500,
  });

  // Mapbox fog presets for traversal modes
  var FOG_PRESETS = Object.freeze({
    thin: {
      range: [0.8, 12],
      color: '#d7dde6',
      'high-color': '#9fb3d4',
      'space-color': '#05070a',
      'horizon-blend': 0.03,
    },
    harbor: {
      range: [0.45, 7],
      color: '#c8d2dc',
      'high-color': '#7f98b6',
      'space-color': '#05070a',
      'horizon-blend': 0.06,
    },
    storm: {
      range: [0.25, 5],
      color: '#9aa8b8',
      'high-color': '#536579',
      'space-color': '#030407',
      'horizon-blend': 0.10,
    },
    lowVisibility: {
      range: [0.15, 3],
      color: '#7a8a96',
      'high-color': '#3e4f5c',
      'space-color': '#020304',
      'horizon-blend': 0.14,
    },
  });

  // ── State ──────────────────────────────────────────────────────────────────────

  var _enabled     = false;
  var _preinited   = false;
  var _hiddenMap   = null;
  var _container   = null;
  var _styleReady  = false;
  var _useDense    = true;   // toggle to sparse if FPS drops

  var _queue       = [];
  var _queueIdx    = 0;
  var _stepTimer   = null;
  var _idleTimer   = null;
  var _waitingIdle = false;
  var _warmed      = [];

  var _stats = {
    stepsIssued:  0,
    stepsWarmed:  0,
    idleTimeouts: 0,
    lastStepMs:   0,
    lastIdleMs:   0,
  };

  var _preflight = {
    active:        false,
    lastResult:    null,
    warmedCount:   0,
    targetDistM:   0,
    stepM:         0,
    startedAtMs:   0,
    elapsedMs:     0,
  };

  var _fogActive = false;

  // ── Geo utilities ─────────────────────────────────────────────────────────────

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

  function _routeBearing(route, t) {
    var eps = 0.002;
    var p0  = _interpolateRoute(route, Math.max(0, t - eps));
    var p1  = _interpolateRoute(route, Math.min(1, t + eps));
    if (!p0 || !p1) return 0;
    var dLat = p1.lat - p0.lat;
    var dLng = (p1.lng - p0.lng) * Math.cos(p0.lat * Math.PI / 180);
    return ((Math.atan2(dLng, dLat) * 180 / Math.PI) + 360) % 360;
  }

  // Haversine distance in metres between two lat/lng points.
  function _haversineM(lat1, lng1, lat2, lng2) {
    var R   = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a   = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Estimate total route length in metres using haversine on route waypoints.
  function _routeTotalM(route) {
    var total = 0;
    for (var i = 1; i < route.length; i++) {
      total += _haversineM(route[i - 1].lat, route[i - 1].lng, route[i].lat, route[i].lng);
    }
    return total;
  }

  // ── Profile helpers ───────────────────────────────────────────────────────────

  function _getProfile() {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    return (rt && typeof rt.getTraversalProfile === 'function')
      ? rt.getTraversalProfile() : 'regional';
  }

  function _getLookaheadOffsets() {
    if (_getProfile() !== 'surface_glide') return LOOKAHEAD_REGIONAL;
    return _useDense ? LOOKAHEAD_SURFACE_GLIDE_DENSE : LOOKAHEAD_SURFACE_GLIDE_SPARSE;
  }

  function _getTargetZoom(visMap) {
    if (_getProfile() === 'surface_glide') return _glideZoom;
    return visMap ? visMap.getZoom() : 14;
  }

  // ── DOM container ─────────────────────────────────────────────────────────────

  function _createContainer() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement('div');
    _container.id = 'wos-preload-map';
    // Belt-and-suspenders containment: off-screen + opacity:0 + clip-path.
    // clip-path:inset(100%) ensures nothing renders even if a parent CSS
    // transform converts position:fixed to position:absolute (which would
    // shift the -9999px origin and could expose the WebGL canvas in
    // screenshot/capture tools or when embedded inside a transformed iframe.
    _container.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:-9999px',
      'width:'  + MAP_WIDTH  + 'px',
      'height:' + MAP_HEIGHT + 'px',
      'opacity:0', 'pointer-events:none', 'z-index:-1',
      'clip-path:inset(100%)',
      'visibility:hidden',
    ].join(';');
    document.body.appendChild(_container);
    return _container;
  }

  function _removeContainer() {
    if (_container && _container.parentElement) {
      _container.parentElement.removeChild(_container);
    }
    _container = null;
  }

  // ── Hidden map ────────────────────────────────────────────────────────────────

  function _createHiddenMap(styleSpec, center, zoom, pitch, bearing) {
    if (_hiddenMap) return _hiddenMap;
    if (!global.mapboxgl) {
      console.error('[PredictiveTilePreloadRuntime] mapboxgl not available');
      return null;
    }
    _hiddenMap = new global.mapboxgl.Map({
      container:          _createContainer(),
      style:              styleSpec,
      center:             [center.lng || center[0], center.lat || center[1]],
      zoom:               zoom    || 14,
      pitch:              pitch   || 45,
      bearing:            bearing || 0,
      antialias:          false,
      interactive:        false,
      attributionControl: false,
      logoPosition:       'bottom-left',
      fadeDuration:       0,
      trackResize:        false,
      renderWorldCopies:  false,
      prefetchZoomDelta:  2,          // pre-fetch adjacent zoom levels
    });

    _hiddenMap.on('style.load', function () {
      _styleReady = true;
      console.log('[PredictiveTilePreloadRuntime] hidden map style loaded');
    });

    _hiddenMap.on('idle', function () {
      _stats.lastIdleMs = Date.now();
      if (_waitingIdle) {
        _waitingIdle = false;
        _markCurrentWarmed();
        if (_idleTimer) { global.clearTimeout(_idleTimer); _idleTimer = null; }
      }
    });

    _hiddenMap.on('error', function (e) {
      if (e.error && e.error.status !== 404) {
        console.warn('[PredictiveTilePreloadRuntime] map error:', e.error && e.error.message);
      }
    });

    return _hiddenMap;
  }

  // ── Style retrieval ───────────────────────────────────────────────────────────

  function _getStyleSpec() {
    var visMap = _getVisibleMap();
    if (visMap) {
      try {
        var style = visMap.getStyle();
        if (style) return style;
      } catch (e) {}
    }
    return 'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p';
  }

  // ── Queue building ────────────────────────────────────────────────────────────

  function _buildQueue(route, progress, zoom, pitch) {
    var offsets  = _getLookaheadOffsets();
    _queue    = [];
    _queueIdx = 0;
    for (var i = 0; i < offsets.length; i++) {
      var futureT = Math.min(1, progress + offsets[i]);
      var pos     = _interpolateRoute(route, futureT);
      if (!pos) continue;
      _queue.push({
        lat: pos.lat, lng: pos.lng,
        zoom: zoom, pitch: pitch,
        bearing:   _routeBearing(route, futureT),
        progressT: futureT,
      });
    }
  }

  function _markCurrentWarmed() {
    var step = _queue[_queueIdx];
    if (!step) return;
    _stats.stepsWarmed++;
    _warmed.push({ lat: step.lat, lng: step.lng, progressT: step.progressT, warmedAtMs: Date.now() });
    if (_warmed.length > MAX_WARMED) _warmed.splice(0, _warmed.length - MAX_WARMED);
    _queueIdx++;
    if (_queueIdx >= _queue.length) _queueIdx = 0;
  }

  function _jumpTo(lat, lng, zoom, pitch, bearing) {
    if (!_hiddenMap || !_styleReady) return false;
    try {
      _hiddenMap.jumpTo({ center: [lng, lat], zoom: zoom, pitch: pitch, bearing: bearing });
      return true;
    } catch (e) {
      console.warn('[PredictiveTilePreloadRuntime] jumpTo failed:', e.message);
      return false;
    }
  }

  function _refreshQueueFromTrip() {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) return;
    var s = rt.getState();
    if (!s.active) return;
    var preset = rt.PRESETS && rt.PRESETS[s.presetId];
    if (!preset || !preset.route) return;
    var currentT  = s.progress || 0;
    var offsets   = _getLookaheadOffsets();
    var latestT   = _queue.length > 0 ? _queue[_queue.length - 1].progressT : 0;
    if (currentT + offsets[0] > latestT || _queueIdx >= _queue.length) {
      var visMap = _getVisibleMap();
      _buildQueue(preset.route, currentT, _getTargetZoom(visMap), visMap ? visMap.getPitch() : 60);
    }
  }

  // ── Rolling step ──────────────────────────────────────────────────────────────

  function _step() {
    if (!_enabled || !_hiddenMap || !_styleReady) return;

    var visMap = _getVisibleMap();
    var zoom   = _getTargetZoom(visMap);
    var pitch  = visMap ? visMap.getPitch() : 60;
    for (var q = 0; q < _queue.length; q++) {
      _queue[q].zoom  = zoom;
      _queue[q].pitch = pitch;
    }

    _refreshQueueFromTrip();

    var step = _queue[_queueIdx];
    if (!step) return;
    if (!_jumpTo(step.lat, step.lng, step.zoom, step.pitch, step.bearing)) return;

    _stats.stepsIssued++;
    _stats.lastStepMs = Date.now();
    _waitingIdle      = true;

    if (_idleTimer) global.clearTimeout(_idleTimer);
    _idleTimer = global.setTimeout(function () {
      if (_waitingIdle) {
        _stats.idleTimeouts++;
        _waitingIdle = false;
        _markCurrentWarmed();
        console.warn('[PredictiveTilePreloadRuntime] idle timeout — advancing');
      }
    }, IDLE_TIMEOUT_MS);
  }

  // ── Route-origin pre-burst ────────────────────────────────────────────────────

  function _burstRouteOrigin(onDone) {
    var rt = global.SBE && SBE.RegionalFlightTripRuntime;
    if (!rt) { if (onDone) onDone(); return; }
    var s = rt.getState();
    var preset = rt.PRESETS && rt.PRESETS[s.presetId];
    if (!preset || !preset.route || !preset.route.length) { if (onDone) onDone(); return; }

    var origin  = preset.route[0];
    var visMap  = _getVisibleMap();
    var zoom    = _getTargetZoom(visMap);
    var pitch   = visMap ? visMap.getPitch() : 60;
    var bearing = _routeBearing(preset.route, 0);

    var done = false;
    function _finish() {
      if (done) return; done = true;
      if (onDone) onDone();
    }
    if (!_jumpTo(origin.lat, origin.lng, zoom, pitch, bearing)) { _finish(); return; }
    var t = global.setTimeout(_finish, IDLE_TIMEOUT_MS);
    _hiddenMap.once('idle', function () {
      global.clearTimeout(t);
      console.log('[PredictiveTilePreloadRuntime] origin burst done');
      _finish();
    });
  }

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getVisibleMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  // ── Preflight corridor warmup ─────────────────────────────────────────────────
  //
  // Warms a corridor of route positions BEFORE visible traversal starts.
  // Returns a Promise that resolves with a result object.
  //
  // Options (all optional — defaults by mode):
  //   distanceAheadM  {number}  metres of route corridor to warm
  //   stepM           {number}  metres between each sample position
  //   maxMs           {number}  global timeout (launches anyway on timeout)
  //   waitForIdle     {boolean} wait for Mapbox idle per step (default true)
  //
  // Sequence: builds sample positions → jumps hidden map → waits idle/timeout →
  //           marks warmed → advances → resolves Promise when corridor is done.

  function preflightWarmRoute(opts) {
    return new Promise(function (resolve) {
      opts = opts || {};

      var profile  = _getProfile();
      var defaults = profile === 'surface_glide'
        ? PREFLIGHT_DEFAULTS_SURFACE_GLIDE
        : PREFLIGHT_DEFAULTS_REGIONAL;

      var distAheadM    = opts.distanceAheadM || defaults.distanceAheadM;
      var stepM         = opts.stepM          || defaults.stepM;
      var maxMs         = opts.maxMs          || defaults.maxMs;
      var stepTimeoutMs = opts.stepTimeoutMs  || defaults.stepTimeoutMs;
      var waitIdle      = opts.waitForIdle !== false;

      // Ensure hidden map exists
      if (!_hiddenMap) preinit();

      // Build corridor sample positions
      var rt     = global.SBE && SBE.RegionalFlightTripRuntime;
      var rtState = rt ? rt.getState() : null;
      var preset  = rt && rtState && rt.PRESETS && rt.PRESETS[rtState.presetId];
      var route   = preset && preset.route;

      if (!route || route.length < 2) {
        console.warn('[PredictiveTilePreloadRuntime] preflightWarmRoute: no route available — resolving immediately');
        resolve({ ok: false, timedOut: false, warmedCount: 0, distanceAheadM: 0, elapsedMs: 0 });
        return;
      }

      // Convert distanceAheadM → normalized T delta using haversine total
      var totalM      = _routeTotalM(route);
      var progressT   = (rtState && rtState.progress) || 0;
      var deltaT      = Math.min(1 - progressT, distAheadM / Math.max(1, totalM));
      var stepT       = stepM / Math.max(1, totalM);
      var numSteps    = Math.max(1, Math.floor(deltaT / stepT));
      stepT           = deltaT / numSteps;   // normalize evenly

      var visMap  = _getVisibleMap();
      var zoom    = _getTargetZoom(visMap);
      var pitch   = visMap ? visMap.getPitch() : 60;

      // Build ordered sample list
      var samples = [];
      for (var i = 0; i <= numSteps; i++) {
        var t   = Math.min(1, progressT + i * stepT);
        var pos = _interpolateRoute(route, t);
        if (!pos) continue;
        samples.push({ lat: pos.lat, lng: pos.lng, zoom: zoom, pitch: pitch,
                       bearing: _routeBearing(route, t), t: t });
      }

      _preflight.active      = true;
      _preflight.warmedCount = 0;
      _preflight.targetDistM = distAheadM;
      _preflight.stepM       = stepM;
      _preflight.startedAtMs = Date.now();

      var globalTimer = global.setTimeout(function () {
        // Timed out — fire anyway
        _preflight.active   = false;
        _preflight.elapsedMs = Date.now() - _preflight.startedAtMs;
        _preflight.lastResult = {
          ok: false, timedOut: true,
          warmedCount: _preflight.warmedCount,
          distanceAheadM: distAheadM,
          elapsedMs: _preflight.elapsedMs,
        };
        console.warn('[PredictiveTilePreloadRuntime] PREFLIGHT WARMUP TIMEOUT — launching with partial cache (' +
          _preflight.warmedCount + '/' + samples.length + ' steps)');
        resolve(_preflight.lastResult);
      }, maxMs);

      var stepIdx = 0;

      function _nextStep() {
        if (stepIdx >= samples.length) {
          // Corridor complete
          global.clearTimeout(globalTimer);
          _preflight.active    = false;
          _preflight.elapsedMs = Date.now() - _preflight.startedAtMs;
          _preflight.lastResult = {
            ok: true, timedOut: false,
            warmedCount: _preflight.warmedCount,
            distanceAheadM: distAheadM,
            elapsedMs: _preflight.elapsedMs,
          };
          console.log('[PredictiveTilePreloadRuntime] preflight complete — warmed',
            _preflight.warmedCount, 'positions in', _preflight.elapsedMs + 'ms');
          resolve(_preflight.lastResult);
          return;
        }

        var sp = samples[stepIdx];

        // Wait for style ready before first step
        if (!_styleReady) {
          if (_hiddenMap) {
            _hiddenMap.once('style.load', function () { _nextStep(); });
          } else {
            global.setTimeout(_nextStep, 200);
          }
          return;
        }

        var jumped = _jumpTo(sp.lat, sp.lng, sp.zoom, sp.pitch, sp.bearing);
        if (!jumped) { stepIdx++; _nextStep(); return; }

        if (!waitIdle) {
          _preflight.warmedCount++;
          stepIdx++;
          global.setTimeout(_nextStep, 50);
          return;
        }

        var stepTimer = global.setTimeout(function () {
          _preflight.warmedCount++;
          stepIdx++;
          _nextStep();
        }, stepTimeoutMs);

        _hiddenMap.once('idle', function () {
          global.clearTimeout(stepTimer);
          _preflight.warmedCount++;
          stepIdx++;
          _nextStep();
        });
      }

      console.log('[PredictiveTilePreloadRuntime] preflight starting —',
        numSteps + 1, 'positions,', distAheadM + 'm ahead, profile:', profile);
      _nextStep();
    });
  }

  // ── Mapbox fog helpers ────────────────────────────────────────────────────────

  function applyMapboxTraversalFog(mode) {
    var visMap = _getVisibleMap();
    if (!visMap) { console.warn('[PTPR] applyMapboxTraversalFog: map not ready'); return false; }
    var preset = FOG_PRESETS[mode] || FOG_PRESETS.thin;
    try {
      visMap.setFog(preset);
      _fogActive = true;
      console.log('[PredictiveTilePreloadRuntime] Mapbox fog set — mode:', mode || 'thin');
      return true;
    } catch (e) {
      console.warn('[PredictiveTilePreloadRuntime] setFog failed:', e.message);
      return false;
    }
  }

  function clearMapboxTraversalFog() {
    var visMap = _getVisibleMap();
    if (!visMap) return;
    try {
      visMap.setFog(null);
      _fogActive = false;
      console.log('[PredictiveTilePreloadRuntime] Mapbox fog cleared');
    } catch (e) {
      console.warn('[PredictiveTilePreloadRuntime] clearFog failed:', e.message);
    }
  }

  // ── Extrusion transition test ─────────────────────────────────────────────────
  // Sets fill-extrusion-opacity-transition on all detected fill-extrusion layers.
  // Fail-silent — not all Mapbox versions support this property on setPaintProperty.
  // Do NOT call per-frame. Call once after launch, after BCR has detected layers.

  function applyExtrusionTransitions(durationMs) {
    var visMap = _getVisibleMap();
    if (!visMap) return 0;
    durationMs = Math.max(0, Math.min(2000, Number(durationMs) || 500));
    var applied = 0;
    try {
      var layers = visMap.getStyle && visMap.getStyle() && visMap.getStyle().layers;
      if (!layers) return 0;
      layers.forEach(function (layer) {
        if (layer.type !== 'fill-extrusion') return;
        try {
          visMap.setPaintProperty(layer.id, 'fill-extrusion-opacity-transition', {
            duration: durationMs,
            delay: 0,
          });
          applied++;
        } catch (e) { /* property not accepted — silently skip */ }
      });
      if (applied > 0) {
        console.log('[PredictiveTilePreloadRuntime] extrusion transitions applied to', applied, 'layers');
      }
    } catch (e) {
      console.warn('[PredictiveTilePreloadRuntime] applyExtrusionTransitions error:', e.message);
    }
    return applied;
  }

  // ── Sparse mode control ───────────────────────────────────────────────────────

  function setDenseRolling(val) {
    _useDense = !!val;
    console.log('[PredictiveTilePreloadRuntime] dense rolling offsets:', _useDense);
  }

  // Sync hidden map's settled glide zoom to match RegionalFlightCameraRig.
  // Call before start() / preflightWarmRoute() when height profile changes.
  function setGlideZoom(zoom) {
    _glideZoom = Math.max(14.0, Math.min(17.5, Number(zoom) || 15.35));
    console.log('[PredictiveTilePreloadRuntime] glideZoom →', _glideZoom);
  }

  function getGlideZoom() { return _glideZoom; }

  // ── preinit / start / stop ────────────────────────────────────────────────────

  function preinit() {
    if (_preinited || _enabled) return;
    _preinited = true;

    var visMap = _getVisibleMap();
    if (!visMap) {
      global.setTimeout(function () { _preinited = false; preinit(); }, 1200);
      return;
    }

    var center  = visMap.getCenter();
    var zoom    = _getTargetZoom(visMap);
    var pitch   = visMap.getPitch();
    var bearing = visMap.getBearing();

    _createHiddenMap(_getStyleSpec(), center, zoom, pitch, bearing);
    console.log('[PredictiveTilePreloadRuntime] preinit — hidden map created, style loading');
  }

  function start(opts) {
    if (_enabled) return;
    opts = opts || {};

    var visMap = _getVisibleMap();
    if (!visMap) {
      console.warn('[PredictiveTilePreloadRuntime] visible map not ready — retrying in 1s');
      global.setTimeout(function () { if (!_enabled) start(opts); }, 1000);
      return;
    }

    var center  = visMap.getCenter();
    var zoom    = _getTargetZoom(visMap);
    var pitch   = visMap.getPitch();
    var bearing = visMap.getBearing();

    if (!_hiddenMap) {
      _createHiddenMap(opts.styleUrl || _getStyleSpec(), center, zoom, pitch, bearing);
    }
    if (!_hiddenMap) return;

    _enabled     = true;
    _queueIdx    = 0;
    _queue       = [];
    _warmed      = [];
    _waitingIdle = false;
    _refreshQueueFromTrip();

    function _begin() {
      _burstRouteOrigin(function () {
        _refreshQueueFromTrip();
        _step();
        _stepTimer = global.setInterval(_step, STEP_INTERVAL_MS);
        console.log('[PredictiveTilePreloadRuntime] v' + VERSION + ' step loop started —',
          'profile:', _getProfile(),
          '| offsets:', _getLookaheadOffsets().length + '-point',
          '| zoom:', _getTargetZoom(null));
      });
    }

    if (_styleReady) { _begin(); } else { _hiddenMap.once('style.load', _begin); }
    console.log('[PredictiveTilePreloadRuntime] v' + VERSION + ' started');
  }

  function stop() {
    _enabled     = false;
    _preinited   = false;
    _waitingIdle = false;

    if (_stepTimer) { global.clearInterval(_stepTimer); _stepTimer = null; }
    if (_idleTimer) { global.clearTimeout(_idleTimer);  _idleTimer = null; }

    if (_hiddenMap) {
      try { _hiddenMap.remove(); } catch (e) {}
      _hiddenMap = null;
    }
    _styleReady = false;
    _removeContainer();
    console.log('[PredictiveTilePreloadRuntime] stopped — warmed', _stats.stepsWarmed, 'positions');
  }

  function setEnabled(val) { if (!!val) start(); else stop(); }
  function getEnabled() { return _enabled; }

  function preloadAhead() {
    if (!_enabled) { start(); return; }
    _refreshQueueFromTrip();
    _step();
    console.log('[PredictiveTilePreloadRuntime] preloadAhead — queue:', _queue.length,
      'idx:', _queueIdx, 'warmed:', _stats.stepsWarmed);
  }

  // ── getState ──────────────────────────────────────────────────────────────────

  function getState() {
    var rt      = global.SBE && SBE.RegionalFlightTripRuntime;
    var rtState = rt ? rt.getState() : null;
    var mapZoom = null, mapCenter = null;
    if (_hiddenMap) {
      try { mapZoom   = Math.round(_hiddenMap.getZoom() * 100) / 100; } catch (e) {}
      try { mapCenter = _hiddenMap.getCenter(); } catch (e) {}
    }
    return {
      version:          VERSION,
      enabled:          _enabled,
      running:          _enabled && !!_stepTimer,
      mapReady:         _styleReady,
      mapZoom:          mapZoom,
      mapCenter:        mapCenter ? { lat: Math.round(mapCenter.lat * 1e5) / 1e5,
                                      lng: Math.round(mapCenter.lng * 1e5) / 1e5 } : null,
      fogActive:        _fogActive,
      useDenseRolling:  _useDense,
      // Queue
      queueLength:      _queue.length,
      stepIndex:        _queueIdx,
      warmedCount:      _warmed.length,
      // Trip
      routeProgress:    rtState ? rtState.progress : null,
      traversalProfile: _getProfile(),
      // Config
      lookaheadOffsets: _getLookaheadOffsets().slice(),
      zoomLock:         _getProfile() === 'surface_glide' ? _glideZoom : null,
      stepIntervalMs:   STEP_INTERVAL_MS,
      // Stats
      stepsIssued:      _stats.stepsIssued,
      stepsWarmed:      _stats.stepsWarmed,
      idleTimeouts:     _stats.idleTimeouts,
      lastStepMs:       _stats.lastStepMs,
      lastIdleMs:       _stats.lastIdleMs,
      // Queue entries
      queue: _queue.map(function (q) {
        return { lat: Math.round(q.lat * 1e5) / 1e5, lng: Math.round(q.lng * 1e5) / 1e5,
                 progressT: Math.round(q.progressT * 10000) / 10000, bearing: Math.round(q.bearing) };
      }),
      recentWarmed: _warmed.slice(-5).map(function (w) {
        return { lat: Math.round(w.lat * 1e5) / 1e5, lng: Math.round(w.lng * 1e5) / 1e5,
                 progressT: Math.round(w.progressT * 10000) / 10000, agoMs: Date.now() - w.warmedAtMs };
      }),
      // Preflight state
      preflight: {
        active:        _preflight.active,
        lastResult:    _preflight.lastResult,
        warmedCount:   _preflight.warmedCount,
        targetDistM:   _preflight.targetDistM,
        stepM:         _preflight.stepM,
        startedAtMs:   _preflight.startedAtMs,
        elapsedMs:     _preflight.active
          ? (Date.now() - _preflight.startedAtMs)
          : _preflight.elapsedMs,
      },
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.PredictiveTilePreloadRuntime = Object.freeze({
    VERSION:                  VERSION,
    preinit:                  preinit,
    start:                    start,
    stop:                     stop,
    setEnabled:               setEnabled,
    getEnabled:               getEnabled,
    preloadAhead:             preloadAhead,
    preflightWarmRoute:       preflightWarmRoute,
    applyMapboxTraversalFog:  applyMapboxTraversalFog,
    clearMapboxTraversalFog:  clearMapboxTraversalFog,
    applyExtrusionTransitions: applyExtrusionTransitions,
    setDenseRolling:          setDenseRolling,
    setGlideZoom:             setGlideZoom,
    getGlideZoom:             getGlideZoom,
    getState:                 getState,
  });

  console.log('[PredictiveTilePreloadRuntime] v' + VERSION +
    ' loaded — .preinit() early, .preflightWarmRoute() before launch, .start() on launch');

})(window);
