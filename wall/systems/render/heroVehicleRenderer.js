// ── HeroVehicleRenderer v1.1.0 ────────────────────────────────────────────────
// 0530H_WOS_DriveExperiencePolish_v1.0.0
// Prior: 0530F_WOS_HeroVehicleCameraFollowPrototype_v1.0.0
// Status: active
// Classification: render-actor
//
// Draws the hero car as a flat top-down road-surface token.
// v1.1.0 changes:
//   - flat chassis replaces upright capsule (no vertical object illusion)
//   - contact shadow instead of floating ellipse
//   - zoom-aware scale: full at z≥17, medium 15-17, small below z15
//   - marker scale updated each frame via CSS transform (no DOM rebuild)
//
// Authority:
//   OWNS: the car DOM marker + its visual state
//   READS: MapboxViewportRuntime.getMap() for zoom
//   MUST NOT MUTATE: runtime state, camera, other actors
//
// Placement: wall/systems/render/heroVehicleRenderer.js
// Load: AFTER heroVehicleRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  // ── Hero model feature flag ───────────────────────────────────────────────────
  // Set USE_HERO_MODEL = true to attempt GLB model loading via Three.js.
  // If Three.js or the model fails to load, renderer falls back to flat SVG token.
  // Model path is relative to the wall/ root directory.
  var USE_HERO_MODEL  = false;
  var HERO_MODEL_PATH = './assets/models/ford_focus_low_poly.glb';

  var _marker    = null;   // mapboxgl.Marker (SVG path)
  var _wrapEl    = null;   // outer div (scale target)
  var _active    = false;
  var _hidden    = false;
  var _lastScale = -1;

  // GLB model state (only used when USE_HERO_MODEL = true)
  var _modelLayer  = null;
  var _modelLoaded = false;
  var _modelFailed = false;

  // ── Scale zones by zoom ───────────────────────────────────────────────────────
  function _zoomScale(zoom) {
    if (zoom == null) return 1;
    if (zoom >= 17.0) return 1.00;
    if (zoom >= 15.0) return 0.72;
    return 0.50;
  }

  // ── Flat-token SVG ────────────────────────────────────────────────────────────
  // 40 × 28 px canvas. Car points NORTH (up).
  // Design language: wide flat rectangle, subtle roof panel, yellow nose cue,
  // thin contact shadow directly under the chassis (not floating oval).

  function _carSVG() {
    return [
      '<svg width="40" height="28" viewBox="0 0 40 28" xmlns="http://www.w3.org/2000/svg">',

      // ── Contact shadow — narrow strip flush under chassis ──────────────────
      '<rect x="5" y="24" width="30" height="3.5" rx="2"',
      '      fill="rgba(0,0,0,0.28)" filter="url(#hv-blur)"/>',
      '<defs>',
      '<filter id="hv-blur"><feGaussianBlur stdDeviation="1.2"/></filter>',
      '</defs>',

      // ── Chassis body ───────────────────────────────────────────────────────
      '<rect x="3" y="4" width="34" height="20" rx="5"',
      '      fill="#c8352e" stroke="rgba(0,0,0,0.40)" stroke-width="1"/>',

      // ── Roof/cab panel (centre of car) ─────────────────────────────────────
      '<rect x="9" y="8" width="22" height="12" rx="3"',
      '      fill="#a02820"/>',

      // ── Windshield — front (top edge of car = heading direction) ──────────
      '<rect x="11" y="5.5" width="18" height="5" rx="2"',
      '      fill="#c8e8ff" opacity="0.85"/>',

      // ── Rear glass (thin strip at bottom) ─────────────────────────────────
      '<rect x="12" y="17.5" width="16" height="3.5" rx="1.5"',
      '      fill="#9ab8d0" opacity="0.70"/>',

      // ── Heading cue — yellow chevron at the nose ──────────────────────────
      // Points UP (north) — the runtime's setRotation() aligns it to heading.
      '<polygon points="20,0 15,5 25,5"',
      '         fill="#ffd34d" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>',

      // ── Headlights ────────────────────────────────────────────────────────
      '<circle cx="12" cy="5" r="1.5" fill="#fffbe0"/>',
      '<circle cx="28" cy="5" r="1.5" fill="#fffbe0"/>',

      '</svg>',
    ].join('');
  }

  function _ensureMarker() {
    var mapboxgl = global.mapboxgl;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;

    if (!mapboxgl) {
      console.error('[HeroVehicleRenderer] mapboxgl unavailable');
      return null;
    }
    if (!map) {
      console.error('[HeroVehicleRenderer] map not ready');
      return null;
    }
    if (_marker) return map;

    _wrapEl = document.createElement('div');
    _wrapEl.className = 'wos-hero-car';
    // Anchor point centred; transform-origin for scale is centre of element.
    _wrapEl.style.cssText = [
      'width:40px;height:28px;',
      'will-change:transform;',
      'pointer-events:none;',
      'transform-origin:50% 50%;',
    ].join('');
    _wrapEl.innerHTML = _carSVG();

    // rotationAlignment:'map' → heading in world-space, not screen-space.
    // Offset anchor to geometric centre of the 40×28 SVG.
    _marker = new mapboxgl.Marker({
      element:            _wrapEl,
      rotationAlignment:  'map',
      pitchAlignment:     'map',
      anchor:             'center',
    }).setLngLat([0, 0]).addTo(map);

    return map;
  }

  // ── GLB model path (Three.js CustomLayer) ────────────────────────────────────
  // Attempted only when USE_HERO_MODEL = true and Three.js is on the page.
  // Falls back silently to SVG marker on any failure.

  function _tryInitModelLayer(map) {
    if (!USE_HERO_MODEL) return;
    if (_modelLoaded || _modelFailed) return;

    var THREE = global.THREE;
    if (!THREE) {
      console.warn('[HeroVehicleRenderer] THREE not available — using SVG fallback.');
      _modelFailed = true;
      return;
    }
    if (!THREE.GLTFLoader && !(THREE.GLTFLoader = global.GLTFLoader)) {
      console.warn('[HeroVehicleRenderer] THREE.GLTFLoader not available — using SVG fallback.');
      _modelFailed = true;
      return;
    }

    // Build a minimal Mapbox CustomLayer that renders the GLB at actor position
    var modelScene   = null;
    var camera       = new THREE.Camera();
    var renderer3d   = null;
    var modelMatrix  = new THREE.Matrix4();
    var actorLng     = 0, actorLat = 0, actorHeadingDeg = 0;

    var layer = {
      id:   'wos-hero-model',
      type: 'custom',
      renderingMode: '3d',

      onAdd: function (m, gl) {
        renderer3d = new THREE.WebGLRenderer({
          canvas:                   m.getCanvas(),
          context:                  gl,
          antialias:                true,
          preserveDrawingBuffer:    true,
        });
        renderer3d.autoClear = false;

        var loader = new (THREE.GLTFLoader || global.GLTFLoader)();
        loader.load(HERO_MODEL_PATH, function (gltf) {
          modelScene = gltf.scene;
          // Scale to approximately 4m car footprint in Mapbox units at zoom 16
          modelScene.scale.set(0.00004, 0.00004, 0.00004);
          _modelLoaded = true;
          console.log('[HeroVehicleRenderer] GLB model loaded — ' + HERO_MODEL_PATH);
        }, undefined, function (e) {
          console.warn('[HeroVehicleRenderer] GLB load failed:', e.message, '— using SVG fallback.');
          _modelFailed = true;
          map.removeLayer('wos-hero-model');
        });
      },

      render: function (gl, viewProjectionMatrix) {
        if (!modelScene || _modelFailed) return;

        // Convert actor lat/lng to Mapbox MercatorCoordinate
        var mc = global.mapboxgl.MercatorCoordinate.fromLngLat(
          [actorLng, actorLat], 0);
        var scale = mc.meterInMercatorCoordinateUnits();

        modelMatrix.set(
          scale, 0, 0, mc.x,
          0, scale, 0, mc.y,
          0, 0, scale, mc.z,
          0, 0, 0, 1
        );

        // Rotate around Z for heading
        var rotMatrix = new THREE.Matrix4().makeRotationZ(
          -actorHeadingDeg * Math.PI / 180);
        modelMatrix.multiply(rotMatrix);

        var projMatrix = new THREE.Matrix4().fromArray(viewProjectionMatrix);

        camera.projectionMatrix = projMatrix.multiply(modelMatrix);
        renderer3d.resetState();
        renderer3d.render(modelScene, camera);
        map.triggerRepaint();
      },
    };

    _modelLayer = layer;
    try {
      map.addLayer(layer);
    } catch (e) {
      console.warn('[HeroVehicleRenderer] addLayer failed:', e.message);
      _modelFailed = true;
    }

    // Expose lat/lng update for render function
    layer._setActorPos = function (lat, lng, headingDeg) {
      actorLat        = lat;
      actorLng        = lng;
      actorHeadingDeg = headingDeg;
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // 0602O — schedule a deferred, safe-mode ambient traffic start. Fully guarded;
  // ambient traffic must never block or break Drive launch.
  function _scheduleAmbientTrafficStart(reason) {
    global.setTimeout(function () {
      try {
        var ambient = global.SBE && SBE.AmbientTrafficRuntime;
        if (!ambient || typeof ambient.start !== 'function') return;
        ambient.start({ source: reason || 'drive_deferred', deferred: true, safeMode: true });
      } catch (e) {
        console.warn('[HeroVehicleRenderer] deferred ambient traffic start failed:', e && e.message ? e.message : e);
      }
    }, 1500);
  }

  function start(entity) {
    if (USE_HERO_MODEL && !_modelFailed) {
      var mvr = global.SBE && SBE.MapboxViewportRuntime;
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (map) _tryInitModelLayer(map);
    }

    var map2 = _ensureMarker();   // always create SVG marker as fallback
    if (!map2) return false;
    _active = true;
    _hidden = false;
    _wrapEl.style.display = '';

    // 0602D — auto-start + enable the world-space layer exactly once on Drive
    // launch, BEFORE the first hero upsert. Without this the renderer's update()
    // gate (wslEnabled) is never satisfied, so the hero never reaches the layer.
    // No render/depth/heading/traffic/camera/route behavior is changed here.
    try {
      var wsl0 = global.SBE && SBE.WorldSpaceVehicleLayer;
      if (wsl0) {
        if (typeof wsl0.isActive === 'function' && !wsl0.isActive() &&
            typeof wsl0.start === 'function') {
          wsl0.start();
        }
        if (typeof wsl0.getEnabled === 'function' && !wsl0.getEnabled() &&
            typeof wsl0.setEnabled === 'function') {
          wsl0.setEnabled(true);
          console.log('[HeroVehicleRenderer] auto-enabled WorldSpaceVehicleLayer (Drive launch)');
        }
      }
    } catch (e) {
      console.warn('[HeroVehicleRenderer] WSL auto-enable failed:', e && e.message ? e.message : e);
    }

    // 0602O — ambient traffic is non-blocking atmosphere, NOT launch-critical.
    // Defer its start well past the launch frame so road sampling / candidate
    // scanning never runs in the Drive-launch stack.
    _scheduleAmbientTrafficStart('drive_launch');

    update(entity);
    console.log('[HeroVehicleRenderer] v' + VERSION + ' started (model:', USE_HERO_MODEL && !_modelFailed ? 'GLB' : 'SVG', ')');
    return true;
  }

  // Hide/show the DOM SVG marker without affecting world-space layer
  function _setDomMarkerHidden(hide) {
    if (_wrapEl) _wrapEl.style.display = hide ? 'none' : '';
  }

  // Throttle: warn at most once per 2s when world-space upsert fails
  var _wslWarnMs = 0;

  // One-shot: validate registry the first time a hero-live payload lands (0601B)
  var _heroLiveValidated = false;

  // World-payload trace (diagnostic)
  var _worldPayloadTraceEnabled  = false;
  var _lastWorldPayloadTraceAt   = 0;
  var WORLD_PAYLOAD_TRACE_INTERVAL = 1000;
  var _lastWorldPayload          = null;

  function setWorldPayloadTraceEnabled(on) { _worldPayloadTraceEnabled = !!on; }
  function getWorldPayloadTraceState()     { return { enabled: _worldPayloadTraceEnabled, lastPayload: _lastWorldPayload }; }

  function update(entity) {
    if (!_active || !entity) return;

    // ── World-space layer: continuous per-frame upsert ────────────────────────
    // Called every RAF by HeroVehicleRuntime._frame() → this IS the persistent
    // binding. No separate loop required. liveHero() only enables and confirms.
    var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
    var wslEnabled  = !!(wsl &&
      typeof wsl.getEnabled    === 'function' && wsl.getEnabled());
    var wslReady    = !!(wslEnabled &&
      typeof wsl.isRenderReady === 'function' && wsl.isRenderReady());

    if (wslEnabled) {
      if (wslReady) {
        var payload = {
          id:         'hero',
          actorType:  'hero_car',
          variant:    'sedan_red',
          lat:        entity.lat,
          lng:        entity.lng,
          headingDeg: entity.headingDeg || 0,
          scale:      1,
          visible:    !_hidden,
          source:     'hero-live',
        };

        // Payload trace: capture before call so failures are inspectable
        _lastWorldPayload = {
          timestamp:     Date.now(),
          wslInstanceId: typeof wsl.getInstanceId === 'function' ? wsl.getInstanceId() : null,
          wslEnabled:    typeof wsl.getEnabled    === 'function' ? wsl.getEnabled()    : null,
          wslRenderReady: typeof wsl.isRenderReady === 'function' ? wsl.isRenderReady() : null,
          payload: {
            id: payload.id, actorType: payload.actorType, variant: payload.variant,
            lat: payload.lat, lng: payload.lng, headingDeg: payload.headingDeg,
            source: payload.source,
          },
        };
        if (_worldPayloadTraceEnabled &&
            (Date.now() - _lastWorldPayloadTraceAt) >= WORLD_PAYLOAD_TRACE_INTERVAL) {
          _lastWorldPayloadTraceAt = Date.now();
          console.log('[HeroVehicleRenderer] world payload', _lastWorldPayload);
        }

        var ok = wsl.upsertVehicle(payload);
        if (ok) {
          // 0601B — first hero-live payload of a session: validate the registry
          // once so any missing actors (e.g. traffic after a restart) recover.
          if (!_heroLiveValidated) {
            _heroLiveValidated = true;
            if (typeof wsl.validateVehicleRegistry === 'function') {
              try {
                var reg = wsl.validateVehicleRegistry();
                if (reg.trafficRuntimeActive && reg.trafficCount === 0 &&
                    typeof wsl.attemptSessionRebind === 'function') {
                  wsl.attemptSessionRebind();
                }
              } catch (e) {}
            }
          }
          // 0531M DOM fallback rule:
          //   block/slab/wedge → calibration modes, keep DOM marker visible for comparison.
          //   vehicle          → hide DOM once world-space render confirmed.
          var shapeMode = (typeof wsl.getShapeMode === 'function') ? wsl.getShapeMode()
                        : (typeof wsl.getVisibilityMode === 'function') ? wsl.getVisibilityMode()
                        : 'vehicle';
          var isCalibrationMode = (shapeMode === 'block' || shapeMode === 'slab' || shapeMode === 'wedge');
          if (!isCalibrationMode) {
            _setDomMarkerHidden(true);
            return;   // vehicle mode: world-space handles rendering, DOM not needed
          }
          // calibration mode: fall through so DOM marker also updates position below
        }
        // upsert failed despite ready — warn throttled, fall through to DOM
        var now = Date.now();
        if (now - _wslWarnMs > 2000) {
          _wslWarnMs = now;
          console.warn('[HeroVehicleRenderer] world-space upsert failed — DOM fallback active');
        }
      }
      // World layer enabled but not yet ready (onAdd still pending):
      // DOM marker stays visible until isRenderReady() flips true.
    }

    // DOM marker visible: either world layer disabled, not ready, or upsert failed
    _setDomMarkerHidden(false);

    // ── GLB model layer path ──────────────────────────────────────────────────
    if (_modelLayer && _modelLayer._setActorPos && _modelLoaded) {
      _modelLayer._setActorPos(entity.lat, entity.lng, entity.headingDeg || 0);
      if (!_hidden && _wrapEl) _wrapEl.style.visibility = 'hidden';
    }

    // ── DOM SVG marker fallback ───────────────────────────────────────────────
    if (!_marker) return;
    if (!_hidden) {
      _marker.setLngLat([entity.lng, entity.lat]);
      _marker.setRotation(entity.headingDeg || 0);

      var mvr  = global.SBE && SBE.MapboxViewportRuntime;
      var map  = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      var zoom = null;
      if (map) { try { zoom = map.getZoom(); } catch (e) {} }
      var scale = _zoomScale(zoom);
      if (scale !== _lastScale) {
        _lastScale = scale;
        _wrapEl.style.transform = 'scale(' + scale + ')';
      }
    }
  }

  function setHidden(hidden) {
    _hidden = !!hidden;
    if (_wrapEl) _wrapEl.style.display = _hidden ? 'none' : '';
  }

  function getVisualState() {
    var mvr  = global.SBE && SBE.MapboxViewportRuntime;
    var map  = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    var zoom = null;
    if (map) { try { zoom = map.getZoom(); } catch (e) {} }
    var scale = _zoomScale(zoom);
    return {
      active:      _active,
      hidden:      _hidden,
      markerScale: Math.round(scale * 100) / 100,
      zoom:        zoom != null ? Math.round(zoom * 10) / 10 : null,
      visualMode:  'flat-token',
      shadowMode:  'contact',
    };
  }

  function stop() {
    _active    = false;
    _hidden    = false;
    _lastScale = -1;
    _heroLiveValidated = false;   // re-validate registry on next session (0601B)
    if (_marker) {
      try { _marker.remove(); } catch (e) {}
      _marker = null;
      _wrapEl = null;
    }
    // 0602K — stop ambient traffic when Drive ends (removes ambient actors).
    try {
      var ambient = global.SBE && SBE.AmbientTrafficRuntime;
      if (ambient && typeof ambient.stop === 'function') ambient.stop();
    } catch (e3) {}
    console.log('[HeroVehicleRenderer] stopped');
  }

  function isActive() { return _active; }

  SBE.HeroVehicleRenderer = Object.freeze({
    VERSION:                    VERSION,
    start:                      start,
    update:                     update,
    stop:                       stop,
    isActive:                   isActive,
    setHidden:                  setHidden,
    getVisualState:             getVisualState,
    setWorldPayloadTraceEnabled: setWorldPayloadTraceEnabled,
    getWorldPayloadTraceState:   getWorldPayloadTraceState,
  });

  console.log('[HeroVehicleRenderer] v' + VERSION + ' loaded');

})(window);
