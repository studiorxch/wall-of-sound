// ── WOS Wall Runtime GLB Render Layer ─────────────────────────────────────────
// 0618A_WOS_BroadcastGLBRenderPass_v1.0.0_BUILD
//
// Loads and renders packaged GLB assets in Broadcast using a single Mapbox
// custom layer shared across all GLB actors.
//
// Contract:
//   - Reads GLB runtime records from WOSWallRuntimeGlbAssetRegistry only.
//   - Never reads Studio localStorage, WOSGlbImportStore, or WOSGlbRuntimePackageStore.
//   - Never loads blob: / file: / http: / https: URLs.
//   - No new WebGL context — shares the Mapbox GL canvas+context.
//   - Falls back silently on missing/failed/DEGRADE/BLOCK actors.
//   - Actor manifests remain assetId-only.
//   - Uses heroVehicleRenderer.js render pattern (per-actor projMatrix trick).
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var LAYER_ID = 'wos-glb-render';
  var SOURCE   = 'GlbRenderLayer';

  var SCALE_MIN = 0.001;
  var SCALE_MAX = 1000;

  // ── State ────────────────────────────────────────────────────────────────────
  var _camera   = null;
  var _renderer = null;
  var _map      = null;
  var _layerAdded = false;

  // objectId → entry
  // entry: { objectId, assetId, scene, loaded, fallback, reason, lat, lon, altM, headingDeg, scaleToMeters }
  var _objects  = {};

  var _renderAttemptCount = 0;
  var _renderLoadedCount  = 0;
  var _renderSkippedCount = 0;
  var _lastError          = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function _diag() {
    return global.WOSWallDiagnostics || { info: function(){}, warn: function(){}, error: function(){} };
  }

  function _registry() { return global.WOSWallRuntimeGlbAssetRegistry; }

  function _getMap() {
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  function _getThree() {
    return global.THREE || null;
  }

  function _getGltfLoader() {
    var T = _getThree();
    if (!T) return null;
    return T.GLTFLoader || global.GLTFLoader || null;
  }

  function _isValidRuntimeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    if (url.indexOf('blob:')    === 0) return false;
    if (url.indexOf('file:')    === 0) return false;
    if (url.indexOf('http://')  === 0) return false;
    if (url.indexOf('https://') === 0) return false;
    return true;
  }

  function _safeScale(s) {
    if (!s || !isFinite(s) || s <= 0) { return 1; }
    if (s < SCALE_MIN) { _diag().warn(SOURCE, 'scale_clamped_min', String(s)); return SCALE_MIN; }
    if (s > SCALE_MAX) { _diag().warn(SOURCE, 'scale_clamped_max', String(s)); return SCALE_MAX; }
    return s;
  }

  // ── Mapbox Custom Layer ───────────────────────────────────────────────────────
  var _layer = {
    id:   LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd: function (m, gl) {
      _map = m;
      var THREE = _getThree();
      if (!THREE) {
        _diag().warn(SOURCE, 'three_unavailable', 'THREE not loaded — all GLB actors will use fallback');
        return;
      }
      _camera = new THREE.Camera();
      _renderer = new THREE.WebGLRenderer({
        canvas:                m.getCanvas(),
        context:               gl,
        antialias:             true,
        preserveDrawingBuffer: true,
      });
      _renderer.autoClear = false;
      _diag().info(SOURCE, 'layer_added', 'renderer ready');
    },

    render: function (gl, matrix) {
      if (!_renderer || !_camera) return;
      var THREE     = _getThree();
      if (!THREE) return;
      var mapboxgl  = global.mapboxgl;
      if (!mapboxgl) return;

      var projMatrix = new THREE.Matrix4().fromArray(matrix);
      var modelMatrix = new THREE.Matrix4();
      var rotMatrix   = new THREE.Matrix4();
      var actorRendered = false;

      Object.keys(_objects).forEach(function (objectId) {
        var entry = _objects[objectId];
        if (!entry || !entry.scene || !entry.loaded || entry.fallback) return;

        var mc = mapboxgl.MercatorCoordinate.fromLngLat(
          [entry.lon, entry.lat], entry.altM || 0);
        var meterScale = mc.meterInMercatorCoordinateUnits();
        var scale = meterScale * _safeScale(entry.scaleToMeters);

        modelMatrix.set(
          scale, 0, 0, mc.x,
          0, scale, 0, mc.y,
          0, 0, scale, mc.z,
          0, 0, 0, 1
        );
        rotMatrix.makeRotationZ(-(entry.headingDeg || 0) * Math.PI / 180);
        modelMatrix.multiply(rotMatrix);

        _camera.projectionMatrix = new THREE.Matrix4().copy(projMatrix).multiply(modelMatrix);
        _renderer.resetState();
        _renderer.render(entry.scene, _camera);
        actorRendered = true;
      });

      // Trigger repaint while any async loads are in-flight
      if (_hasInFlight()) {
        _map.triggerRepaint();
      }
    },

    onRemove: function () {
      _renderer  = null;
      _camera    = null;
    },
  };

  function _hasInFlight() {
    return Object.keys(_objects).some(function (id) {
      return _objects[id] && !_objects[id].loaded && !_objects[id].fallback;
    });
  }

  // ── Layer mount/unmount ───────────────────────────────────────────────────────
  function _ensureLayer() {
    var map = _map || _getMap();
    if (!map) return false;
    _map = map;
    if (_layerAdded) return true;
    try {
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer(_layer);
        _layerAdded = true;
        _diag().info(SOURCE, 'layer_mounted', LAYER_ID);
      }
      return true;
    } catch (e) {
      _diag().error(SOURCE, 'layer_mount_failed', e.message);
      return false;
    }
  }

  function _removeLayer() {
    if (!_layerAdded) return;
    var map = _map || _getMap();
    if (map) {
      try { if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID); } catch (e) {}
    }
    _layerAdded = false;
    _renderer = null;
    _camera   = null;
    _diag().info(SOURCE, 'layer_removed', LAYER_ID);
  }

  // ── Fallback dispatch ─────────────────────────────────────────────────────────
  // GLB fallback = do NOT add to _objects as a Three.js object.
  // The existing Wall proxy render path handles the actor via its normal route.
  function _markFallback(objectId, assetId, reason) {
    _objects[objectId] = {
      objectId:  objectId,
      assetId:   assetId,
      scene:     null,
      loaded:    true,
      fallback:  true,
      reason:    reason,
      lat: 0, lon: 0, altM: 0, headingDeg: 0, scaleToMeters: 1,
    };
    var d = _diag();
    d.warn(SOURCE, 'glb_fallback', objectId + ' | ' + reason);
    d.increment('glbAssetFallbackRenderCount');
  }

  // ── renderActor ───────────────────────────────────────────────────────────────
  function renderActor(actor) {
    if (!actor || !actor.assetId || !actor.objectId) return;
    if (actor.assetId.indexOf('studio.import.glb.') !== 0) {
      _renderSkippedCount++;
      _diag().increment('glbAssetRenderSkippedCount');
      return;
    }

    _renderAttemptCount++;
    _diag().increment('glbAssetRenderAttemptCount');

    var reg = _registry();
    if (!reg) {
      _markFallback(actor.objectId, actor.assetId, 'registry_unavailable');
      return;
    }

    var rec = reg.get(actor.assetId);
    if (!rec) {
      _markFallback(actor.objectId, actor.assetId, 'missing_package_record');
      return;
    }

    var readiness = (rec.broadcastReadiness || 'UNKNOWN').toUpperCase();
    if (readiness === 'DEGRADE' || readiness === 'BLOCK') {
      _markFallback(actor.objectId, actor.assetId, 'readiness_' + readiness.toLowerCase());
      return;
    }

    if (!_isValidRuntimeUrl(rec.runtimeUrl)) {
      _markFallback(actor.objectId, actor.assetId, 'invalid_runtimeUrl');
      _diag().increment && _diag().increment('glbAssetLoadErrorCount');
      return;
    }

    var THREE      = _getThree();
    var GltfLoader = _getGltfLoader();
    if (!THREE || !GltfLoader) {
      _markFallback(actor.objectId, actor.assetId, 'loader_unavailable');
      return;
    }

    var anchor     = actor.anchor || {};
    var lat        = anchor.lat        || 0;
    var lon        = anchor.lon        || 0;
    var altM       = anchor.altM       || 0;
    var headingDeg = anchor.headingDeg || 0;

    // Register as in-flight
    _objects[actor.objectId] = {
      objectId:     actor.objectId,
      assetId:      actor.assetId,
      scene:        null,
      loaded:       false,
      fallback:     false,
      reason:       null,
      lat:          lat,
      lon:          lon,
      altM:         altM,
      headingDeg:   headingDeg,
      scaleToMeters: rec.scaleToMeters != null ? rec.scaleToMeters : 1,
    };

    var loader = new GltfLoader();
    loader.load(
      rec.runtimeUrl,
      function (gltf) {
        var entry = _objects[actor.objectId];
        if (!entry) return; // removed before load completed (bundle reload)
        entry.scene  = gltf.scene;
        entry.loaded = true;
        _renderLoadedCount++;
        // Push live diagnostic update — async load completed after activate() returned
        var d = _diag();
        d.increment('glbAssetRenderLoadedCount');
        d.info(SOURCE, 'glb_loaded', actor.objectId + ' ← ' + rec.runtimeUrl);
        if (_map) _map.triggerRepaint();
      },
      undefined,
      function (err) {
        _lastError = err ? (err.message || String(err)) : 'unknown_load_error';
        var d = _diag();
        d.error(SOURCE, 'glb_load_failed', actor.objectId + ' | ' + _lastError);
        d.increment('glbAssetLoadErrorCount');
        _markFallback(actor.objectId, actor.assetId, 'load_error: ' + _lastError);
        // _markFallback already increments glbAssetFallbackRenderCount
      }
    );
  }

  // ── removeActor ───────────────────────────────────────────────────────────────
  function removeActor(objectId) {
    if (_objects[objectId]) {
      var entry = _objects[objectId];
      if (entry.scene && entry.scene.traverse) {
        entry.scene.traverse(function (obj) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) { obj.material.forEach(function (m) { m.dispose(); }); }
            else { obj.material.dispose(); }
          }
        });
      }
      delete _objects[objectId];
    }
  }

  // ── Public: activate ─────────────────────────────────────────────────────────
  // Called by wallRuntimeBundleLoader._activate() after GLB registry is active.
  // opts: { actors: acceptedActors[] }
  function activate(opts) {
    opts = opts || {};
    var actors = opts.actors || [];

    // Clear previous objects
    clear();

    // Mount layer (deferred if map not yet ready)
    var layerReady = _ensureLayer();
    if (!layerReady) {
      // Map may not be ready yet — retry after a short delay
      var retries = 0;
      var interval = global.setInterval(function () {
        retries++;
        if (_ensureLayer()) {
          global.clearInterval(interval);
          _activateActors(actors);
        } else if (retries > 20) {
          global.clearInterval(interval);
          _diag().warn(SOURCE, 'layer_mount_timeout', 'map not ready after 10s — GLB render skipped');
        }
      }, 500);
      return { ok: true, attempted: 0, loaded: 0, fallback: 0, skipped: 0, errors: 0, status: 'deferred' };
    }

    return _activateActors(actors);
  }

  function _activateActors(actors) {
    var glbActors = actors.filter(function (a) {
      return a && a.assetId && a.assetId.indexOf('studio.import.glb.') === 0;
    });

    if (glbActors.length === 0) {
      return { ok: true, attempted: 0, loaded: 0, fallback: 0, skipped: 0, errors: 0 };
    }

    _renderAttemptCount = 0;
    _renderLoadedCount  = 0;
    _renderSkippedCount = 0;

    glbActors.forEach(function (actor) { renderActor(actor); });

    _diag().info(SOURCE, 'activate_complete',
      'attempted: ' + glbActors.length);

    return {
      ok:        true,
      attempted: glbActors.length,
      loaded:    _renderLoadedCount,
      fallback:  Object.keys(_objects).filter(function (id) { return _objects[id].fallback; }).length,
      skipped:   _renderSkippedCount,
      errors:    0,
    };
  }

  // ── Public: clear ─────────────────────────────────────────────────────────────
  function clear() {
    Object.keys(_objects).forEach(removeActor);
    _objects = {};
    _renderAttemptCount = 0;
    _renderLoadedCount  = 0;
    _renderSkippedCount = 0;
  }

  function hasObject(objectId)  { return !!(_objects[objectId] && !_objects[objectId].fallback); }
  function getObject3D(objectId) {
    var entry = _objects[objectId];
    return (entry && entry.scene && !entry.fallback) ? entry.scene : null;
  }

  function getSnapshot() {
    var ids          = Object.keys(_objects);
    var loaded       = ids.filter(function (id) { return _objects[id].loaded && !_objects[id].fallback; });
    var fallbackIds  = ids.filter(function (id) { return _objects[id].fallback; });
    var inFlight     = ids.filter(function (id) { return !_objects[id].loaded && !_objects[id].fallback; });

    return {
      enabled:                    true,
      layerAdded:                 _layerAdded,
      threeAvailable:             !!_getThree(),
      gltfLoaderAvailable:        !!_getGltfLoader(),
      glbAssetRenderAttemptCount: _renderAttemptCount,
      glbAssetRenderLoadedCount:  _renderLoadedCount,
      glbAssetRenderSkippedCount: _renderSkippedCount,
      glbAssetFallbackRenderCount: fallbackIds.length,
      loadedObjectIds:            loaded.slice(),
      fallbackObjectIds:          fallbackIds.slice(),
      inFlightCount:              inFlight.length,
      lastError:                  _lastError,
    };
  }

  global.WOSWallRuntimeGlbRenderLayer = {
    activate:    activate,
    clear:       clear,
    renderActor: renderActor,
    removeActor: removeActor,
    hasObject:   hasObject,
    getObject3D: getObject3D,
    getSnapshot: getSnapshot,
  };

  // ── Debug surface ─────────────────────────────────────────────────────────────
  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.wall = global._wos.debug.wall || {};

  // Extend glbAssets() with render summary
  var _prevGlbAssets = global._wos.debug.wall.glbAssets;
  global._wos.debug.wall.glbAssets = function () {
    var base = _prevGlbAssets ? _prevGlbAssets() : {};
    var snap = global.WOSWallRuntimeGlbRenderLayer.getSnapshot();
    return Object.assign({}, base, {
      layerAdded:                 snap.layerAdded,
      threeAvailable:             snap.threeAvailable,
      gltfLoaderAvailable:        snap.gltfLoaderAvailable,
      glbAssetRenderAttemptCount: snap.glbAssetRenderAttemptCount,
      glbAssetRenderLoadedCount:  snap.glbAssetRenderLoadedCount,
      glbAssetRenderSkippedCount: snap.glbAssetRenderSkippedCount,
      loadedObjectIds:            snap.loadedObjectIds,
      fallbackObjectIds:          snap.fallbackObjectIds,
      inFlightCount:              snap.inFlightCount,
      lastError:                  snap.lastError,
    });
  };

  global._wos.debug.wall.glbObject = function (objectId) {
    var entry = _objects[objectId];
    if (!entry) return { found: false, objectId: objectId };
    var reg = global.WOSWallRuntimeGlbAssetRegistry;
    var rec = reg ? reg.get(entry.assetId) : null;
    return {
      found:      true,
      objectId:   objectId,
      assetId:    entry.assetId,
      runtimeUrl: rec ? rec.runtimeUrl : null,
      loaded:     entry.loaded && !entry.fallback,
      fallback:   entry.fallback,
      reason:     entry.reason,
    };
  };

  console.log('[WOSWallRuntimeGlbRenderLayer] ready — 0618A');
})(window);
