// ── ThreePrimitiveVisibilityHarness v1.0.0 ────────────────────────────────────
// 0601I_WOS_ThreeRenderPathRepair_v1.0.0
// Status: diagnostic
// Classification: render-path proof
//
// Self-contained Three.js render-path proof harness. Has its OWN Mapbox custom
// layer + WebGLRenderer + per-object scenes, fully independent of
// WorldSpaceVehicleLayer (whose _enabled flag may gate its render callback —
// a likely reason an earlier centerCube() was invisible).
//
// Proves, step by step, whether the failure is renderer, scene insertion,
// canonical Mapbox matrix, or the vehicle-layer transform recipe.
//
// Binds: _wos.debug.threeProof.{ screenCube, rawSceneCube, modelMatrixCube,
//   vehicleMatrixCube, centerCube, axisTripod, scaleLadder, scale, mode,
//   depthTest, depthWrite, altitude, state, clear }
//
// Authority: pure diagnostic. Never touches vehicle/route/camera/runtime state.
// Never removes Mapbox base layers. Never throws into RAF.
//
// Placement: wall/systems/render/threePrimitiveVisibilityHarness.js
// Load: AFTER three.min.js + worldSpaceVehicleLayer.js (reads its instance id)
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var LAYER_ID = 'wos-three-proof-harness';
  var INSTANCE_ID = 'tph_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

  // ── State ─────────────────────────────────────────────────────────────────────
  var _map        = null;
  var _renderer   = null;
  var _camera     = null;   // generic camera for matrix-driven modes
  var _ortho      = null;   // orthographic camera for screen-space mode
  var _layerAdded = false;
  var _objects    = {};     // id → { id, kind, mode, mesh, scene, sizeM, lat, lng, alt, scaleN, addedAt, lastTransformAt }
  var _activeMode = 'modelMatrix';
  var _proofScale = 1;
  var _altitudeM  = 0;
  var _depthTest  = false;
  var _depthWrite = false;

  var _renderCount      = 0;
  var _lastRenderAt     = 0;
  var _lastRenderPrev   = 0;
  var _lastMatrixSummary = null;
  var _lastCommand      = null;
  var _lastError        = null;

  function _three()    { return global.THREE; }
  function _mapboxgl() { return global.mapboxgl; }

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    var m   = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!m && SBE.map) m = SBE.map;
    return m;
  }
  function _styleLoaded(m) { try { return !!(m && m.isStyleLoaded()); } catch (e) { return false; } }

  // ── Material with diagnostic 6-face contrast ───────────────────────────────────
  function _faceMats(body) {
    var THREE = _three();
    function m(c) {
      return new THREE.MeshBasicMaterial({
        color: c, depthTest: _depthTest, depthWrite: _depthWrite, transparent: false,
      });
    }
    function sh(f) {
      var r = (body >> 16) & 0xff, g = (body >> 8) & 0xff, b = body & 0xff;
      function c(v) { return Math.max(0, Math.min(255, Math.round(v * f))); }
      return (c(r) << 16) | (c(g) << 8) | c(b);
    }
    return [ m(sh(0.7)), m(sh(0.7)), m(sh(0.45)), m(sh(0.6)), m(sh(1.2)), m(sh(0.5)) ];
  }
  function _cubeMesh(body) {
    var THREE = _three();
    return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), _faceMats(body));
  }

  // ── Custom layer ──────────────────────────────────────────────────────────────
  var _customLayer = {
    id:            LAYER_ID,
    type:          'custom',
    renderingMode: '3d',

    onAdd: function (map, gl) {
      var THREE = _three();
      if (!THREE) { _lastError = 'three_not_available_onAdd'; return; }
      _renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      _renderer.autoClear = false;
      _camera = new THREE.Camera();
      _ortho  = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
      _layerAdded = true;
      console.log('[ThreeProof] onAdd — renderer ready');
    },

    render: function (gl, matrix) {
      if (!_renderer) return;
      var THREE = _three();
      var mbgl  = _mapboxgl();
      if (!THREE) return;

      // Instrument
      _renderCount += 1;
      _lastRenderPrev = _lastRenderAt;
      _lastRenderAt = (global.performance && performance.now) ? performance.now() : Date.now();
      _lastMatrixSummary = matrix ? { first: matrix[0], last: matrix[15], len: matrix.length } : null;

      try {
        _renderer.resetState();
        var ids = Object.keys(_objects);
        for (var i = 0; i < ids.length; i++) {
          var o = _objects[ids[i]];
          if (!o || !o.mesh || !o.scene) continue;

          if (o.mode === 'screen') {
            // Screen-space: ignore mapbox matrix, render with ortho camera.
            o.mesh.position.set(0, 0, 0);
            o.mesh.scale.setScalar(0.5);
            _renderer.render(o.scene, _ortho);
            o.lastTransformAt = _lastRenderAt;
            continue;
          }

          // World modes need mercator + mapbox matrix
          if (!mbgl || !mbgl.MercatorCoordinate || !matrix) continue;
          var merc = mbgl.MercatorCoordinate.fromLngLat([o.lng, o.lat], o.alt || 0);
          var meterUnit = merc.meterInMercatorCoordinateUnits();
          var sizeMerc  = meterUnit * o.sizeM * o.scaleN * _proofScale;

          if (o.mode === 'modelMatrix') {
            // Canonical Mapbox custom-layer path: mesh at origin, transform in matrix.
            o.mesh.position.set(0, 0, 0);
            o.mesh.scale.setScalar(1);
            o.mesh.rotation.set(0, 0, 0);
            var model = new THREE.Matrix4()
              .makeTranslation(merc.x, merc.y, merc.z)
              .scale(new THREE.Vector3(sizeMerc, -sizeMerc, sizeMerc));
            _camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix).multiply(model);
            _renderer.render(o.scene, _camera);
          } else {
            // 'vehicleMatrix' / 'rawScene': mesh positioned in mercator, scaled directly,
            // projectionMatrix = fromArray(mapboxMatrix) — the exact WSL recipe.
            o.mesh.position.set(merc.x, merc.y, merc.z);
            o.mesh.scale.setScalar(sizeMerc);
            o.mesh.rotation.set(0, 0, 0);
            _camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
            _renderer.render(o.scene, _camera);
          }
          o.lastTransformAt = _lastRenderAt;
        }
        if (ids.length && _map) _map.triggerRepaint();
      } catch (e) {
        _lastError = e && e.message ? e.message : String(e);
      }
    },
  };

  // ── Lifecycle ───────────────────────────────────────────────────────────────────
  function _ensureLayer() {
    if (_layerAdded) return true;
    if (!_three()) { _lastError = 'three_not_available'; return false; }
    _map = _getMap();
    if (!_map) { _lastError = 'map_not_available'; return false; }
    if (!_styleLoaded(_map)) { _lastError = 'style_not_loaded'; return false; }
    try { _map.addLayer(_customLayer); }
    catch (e) { _lastError = 'addLayer_failed:' + (e && e.message); return false; }
    return _layerAdded;
  }

  function _center() {
    var m = _getMap();
    if (!m) return null;
    try { var c = m.getCenter(); return { lat: c.lat, lng: c.lng }; } catch (e) { return null; }
  }

  // Add a cube object. Returns scene-child-count delta proof.
  function _addCube(id, mode, sizeM, body, opts) {
    opts = opts || {};
    if (!_ensureLayer()) return { ok: false, reason: _lastError };
    var THREE = _three();
    var c = opts.center || _center();
    if (!c && mode !== 'screen') return { ok: false, reason: 'map_not_available' };

    if (_objects[id]) _removeObject(id);

    var scene = new THREE.Scene();
    var beforeCount = scene.children.length;
    var mesh = _cubeMesh(body);
    mesh.frustumCulled = false;   // never cull the proof cube
    scene.add(mesh);
    var afterCount = scene.children.length;

    _objects[id] = {
      id: id, kind: 'cube', mode: mode,
      mesh: mesh, scene: scene,
      sizeM: sizeM, scaleN: opts.scaleN != null ? opts.scaleN : _proofScale,
      lat: c ? c.lat : 0, lng: c ? c.lng : 0,
      alt: opts.alt != null ? opts.alt : _altitudeM,
      addedAt: Date.now(), lastTransformAt: 0,
    };
    _activeMode = mode;
    if (_map) try { _map.triggerRepaint(); } catch (e) {}

    console.log('[ThreeProof] +cube', id, '| mode:', mode, '| sizeM:', sizeM,
      '| sceneChildren:', beforeCount, '→', afterCount, '| uuid:', mesh.uuid.slice(0, 8),
      '| visible:', mesh.visible);
    return { ok: true, id: id, mode: mode, sceneChildrenBefore: beforeCount, sceneChildrenAfter: afterCount, uuid: mesh.uuid };
  }

  function _removeObject(id) {
    var o = _objects[id];
    if (!o) return;
    try { if (o.mesh && o.mesh.geometry) o.mesh.geometry.dispose(); } catch (e) {}
    delete _objects[id];
  }

  // ── Public diagnostic commands ──────────────────────────────────────────────────

  function screenCube() {
    _lastCommand = 'screenCube';
    var r = _addCube('proof_screen', 'screen', 1, 0x33ff66, {});
    console.log('[ThreeProof] screenCube — proves renderer can draw ANYTHING (no mercator).',
      r.ok ? '' : 'reason:' + r.reason);
    return r;
  }
  function rawSceneCube() {
    _lastCommand = 'rawSceneCube';
    // 200m cube at map center via fromArray(matrix) path — proves scene insertion + callback.
    var r = _addCube('proof_raw', 'rawScene', 200, 0xffaa22, {});
    console.log('[ThreeProof] rawSceneCube — 200m cube; watch sceneChildCount + renderCount.',
      r.ok ? '' : 'reason:' + r.reason);
    return r;
  }
  function modelMatrixCube() {
    _lastCommand = 'modelMatrixCube';
    // 80m cube via canonical model-matrix (translate × scale(s,-s,s)) path.
    var r = _addCube('proof_model', 'modelMatrix', 80, 0x3388ff, {});
    console.log('[ThreeProof] modelMatrixCube — canonical Mapbox matrix path.',
      r.ok ? '' : 'reason:' + r.reason);
    return r;
  }
  function vehicleMatrixCube() {
    _lastCommand = 'vehicleMatrixCube';
    // 80m cube via the EXACT WSL recipe (mesh-position + fromArray(matrix)).
    var r = _addCube('proof_vehicle', 'vehicleMatrix', 80, 0xff5544, { alt: 0.35 });
    console.log('[ThreeProof] vehicleMatrixCube — replicates WorldSpaceVehicleLayer transform.',
      r.ok ? '' : 'reason:' + r.reason);
    return r;
  }
  function centerCube() {
    _lastCommand = 'centerCube';
    // Original command — now backed by the proven modelMatrix path.
    return modelMatrixCube();
  }
  function axisTripod() {
    _lastCommand = 'axisTripod';
    if (!_ensureLayer()) return { ok: false, reason: _lastError };
    var c = _center();
    if (!c) return { ok: false, reason: 'map_not_available' };
    // Three coloured bars along world axes via modelMatrix, 60m each.
    var THREE = _three();
    ['x_red', 'y_green', 'z_blue'].forEach(function (tag, i) {
      var id = 'proof_axis_' + tag;
      if (_objects[id]) _removeObject(id);
      var scene = new THREE.Scene();
      var colors = [0xff3333, 0x33ff33, 0x3366ff];
      var dims = [[3, 1, 1], [1, 3, 1], [1, 1, 3]];
      var mesh = new THREE.Mesh(new THREE.BoxGeometry(dims[i][0], dims[i][1], dims[i][2]),
        new THREE.MeshBasicMaterial({ color: colors[i], depthTest: _depthTest, depthWrite: _depthWrite }));
      mesh.frustumCulled = false;
      scene.add(mesh);
      _objects[id] = { id: id, kind: 'axis', mode: 'modelMatrix', mesh: mesh, scene: scene,
        sizeM: 20, scaleN: 1, lat: c.lat, lng: c.lng, alt: 0, addedAt: Date.now(), lastTransformAt: 0 };
    });
    if (_map) try { _map.triggerRepaint(); } catch (e) {}
    console.log('[ThreeProof] axisTripod — X(red) Y(green) Z(blue) at map center');
    return { ok: true };
  }

  function scaleLadder() {
    _lastCommand = 'scaleLadder';
    if (!_ensureLayer()) return { ok: false, reason: _lastError };
    var c = _center();
    if (!c) return { ok: false, reason: 'map_not_available' };
    var mbgl = _mapboxgl();
    var sizes = [1, 10, 100, 1000, 10000];
    var colors = [0xffffff, 0xffd34d, 0xff8833, 0xff4444, 0xaa22ff];
    // spread cubes ~ along east by index so they don't overlap
    sizes.forEach(function (sz, i) {
      var id = 'proof_ladder_' + sz;
      var eastM = i * 200;   // 0,200,400,600,800m east
      var lat = c.lat;
      var lng = c.lng + (eastM / (111320 * Math.cos(c.lat * Math.PI / 180)));
      _addCube(id, 'modelMatrix', sz, colors[i], { center: { lat: lat, lng: lng } });
      console.log('  ladder cube', sz + 'm', 'at +' + eastM + 'm east');
    });
    console.log('[ThreeProof] scaleLadder — if only large cubes appear, scale is the issue');
    return { ok: true, sizes: sizes };
  }

  function scale(n) {
    if (n === undefined) { console.log('[ThreeProof] proofScale:', _proofScale); return _proofScale; }
    _proofScale = Math.max(0.0001, Number(n) || 1);
    if (_map) try { _map.triggerRepaint(); } catch (e) {}
    console.log('[ThreeProof] proofScale →', _proofScale);
    return _proofScale;
  }
  function mode(name) {
    if (name === undefined) { console.log('[ThreeProof] activeMode:', _activeMode); return _activeMode; }
    var valid = ['screen', 'rawScene', 'modelMatrix', 'vehicleMatrix'];
    if (valid.indexOf(name) === -1) { console.warn('[ThreeProof] invalid mode:', name, '— use', valid.join('|')); return _activeMode; }
    _activeMode = name;
    console.log('[ThreeProof] activeMode →', name);
    return _activeMode;
  }
  function depthTest(on)  { _depthTest = !!on;  console.log('[ThreeProof] depthTest →', _depthTest, '(rebuild a cube to apply)'); return _depthTest; }
  function depthWrite(on) { _depthWrite = !!on; console.log('[ThreeProof] depthWrite →', _depthWrite, '(rebuild a cube to apply)'); return _depthWrite; }
  function altitude(m)    { _altitudeM = Number(m) || 0; console.log('[ThreeProof] altitudeM →', _altitudeM, '(applies to new cubes)'); return _altitudeM; }

  function clear() {
    Object.keys(_objects).forEach(_removeObject);
    if (_map) try { _map.triggerRepaint(); } catch (e) {}
    console.log('[ThreeProof] cleared all proof objects');
    return { ok: true };
  }

  // ── Failure classifier + state ──────────────────────────────────────────────────
  function _classify() {
    if (!_three())       return 'three_not_available';
    var m = _getMap();
    if (!m)              return 'map_not_available';
    if (!_mapboxgl())    return 'map_not_available';
    if (!_layerAdded)    return 'custom_layer_missing';
    if (!_renderer)      return 'renderer_missing';
    if (!_camera)        return 'scene_missing';
    var ids = Object.keys(_objects);
    if (ids.length > 0 && _renderCount === 0) return 'render_not_called';
    // object added but never transformed → render callback not reaching it
    var anyTransformed = ids.some(function (id) { return _objects[id].lastTransformAt > 0; });
    if (ids.length > 0 && _renderCount > 0 && !anyTransformed) {
      // screen-mode objects always transform; world-mode need mercator
      return _mapboxgl() ? 'object_not_added_to_scene' : 'mercator_transform_failed';
    }
    if (_lastError) {
      if (/mercator/i.test(_lastError)) return 'mercator_transform_failed';
      return 'unknown';
    }
    return null;   // no detected failure
  }

  function state() {
    var m = _getMap();
    var THREE = _three();
    var wsl = SBE.WorldSpaceVehicleLayer;
    var out = {
      ok: !!(THREE && m && _layerAdded && _renderer),
      threeAvailable:    !!THREE,
      mapAvailable:      !!m,
      mapboxglAvailable: !!_mapboxgl(),
      customLayerAdded:  _layerAdded,
      customLayerId:     LAYER_ID,
      renderReady:       !!(_renderer && _camera && _layerAdded),
      rendererExists:    !!_renderer,
      cameraExists:      !!_camera,
      sceneExists:       Object.keys(_objects).length > 0,
      sceneChildCount:   Object.keys(_objects).reduce(function (n, id) { return n + (_objects[id].scene ? _objects[id].scene.children.length : 0); }, 0),
      renderCount:       _renderCount,
      lastRenderAt:      _lastRenderAt,
      lastRenderDeltaMs: _lastRenderAt && _lastRenderPrev ? Math.round(_lastRenderAt - _lastRenderPrev) : null,
      lastRenderAgeMs:   _lastRenderAt ? Math.round(((global.performance && performance.now) ? performance.now() : Date.now()) - _lastRenderAt) : null,
      lastMatrixSummary: _lastMatrixSummary,
      lastCommand:       _lastCommand,
      activeMode:        _activeMode,
      proofScale:        _proofScale,
      depthTest:         _depthTest,
      depthWrite:        _depthWrite,
      altitudeM:         _altitudeM,
      harnessInstanceId: INSTANCE_ID,
      worldSpaceVehicleLayerInstanceId: (wsl && typeof wsl.getInstanceId === 'function') ? wsl.getInstanceId() : 'unknown',
      threeGlobalPresent: !!THREE,
      objects: Object.keys(_objects).map(function (id) {
        var o = _objects[id];
        var mbgl = _mapboxgl();
        var merc = null, meterScale = null;
        if (mbgl && mbgl.MercatorCoordinate && o.mode !== 'screen') {
          try {
            var mc = mbgl.MercatorCoordinate.fromLngLat([o.lng, o.lat], o.alt || 0);
            merc = { x: mc.x, y: mc.y, z: mc.z };
            meterScale = mc.meterInMercatorCoordinateUnits() * o.sizeM * o.scaleN * _proofScale;
          } catch (e) {}
        }
        return {
          id: o.id, kind: o.kind, mode: o.mode,
          addedToScene:    !!(o.scene && o.scene.children.indexOf(o.mesh) !== -1),
          visible:         o.mesh ? o.mesh.visible : false,
          frustumCulled:   o.mesh ? o.mesh.frustumCulled : null,
          matrixAutoUpdate: o.mesh ? o.mesh.matrixAutoUpdate : null,
          position:        o.mesh ? { x: o.mesh.position.x, y: o.mesh.position.y, z: o.mesh.position.z } : null,
          scale:           o.mesh ? o.mesh.scale.x : null,
          dimensionsMeters: o.sizeM,
          meterScale:      meterScale,
          mercator:        merc,
          lastTransformAt: o.lastTransformAt,
        };
      }),
      lastError:   _lastError,
      failureClass: _classify(),
    };

    console.group('[ThreeProof] state() — failureClass: ' + (out.failureClass || 'null'));
    console.log('three:', out.threeAvailable, '| map:', out.mapAvailable, '| layerAdded:', out.customLayerAdded,
      '| renderer:', out.rendererExists);
    console.log('renderCount:', out.renderCount, '| lastRenderAgeMs:', out.lastRenderAgeMs,
      '| sceneChildren:', out.sceneChildCount);
    console.log('activeMode:', out.activeMode, '| proofScale:', out.proofScale,
      '| objects:', out.objects.length);
    console.log('harnessId:', out.harnessInstanceId, '| wslId:', out.worldSpaceVehicleLayerInstanceId);
    out.objects.forEach(function (o) {
      console.log('  ', o.id, '| mode:', o.mode, '| added:', o.addedToScene, '| vis:', o.visible,
        '| meterScale:', o.meterScale, '| lastTransformAt:', o.lastTransformAt ? 'yes' : 'NO');
    });
    if (out.lastError) console.warn('  lastError:', out.lastError);
    console.groupEnd();
    return out;
  }

  // ── Bind namespace ──────────────────────────────────────────────────────────────
  function _bind() {
    global._wos       = global._wos       || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.threeProof = {
      screenCube:        screenCube,
      rawSceneCube:      rawSceneCube,
      modelMatrixCube:   modelMatrixCube,
      vehicleMatrixCube: vehicleMatrixCube,
      centerCube:        centerCube,
      axisTripod:        axisTripod,
      scaleLadder:       scaleLadder,
      scale:             scale,
      mode:              mode,
      depthTest:         depthTest,
      depthWrite:        depthWrite,
      altitude:          altitude,
      state:             state,
      clear:             clear,
    };
  }
  _bind();
  global.setTimeout(_bind, 500);
  global.setTimeout(_bind, 1500);
  global.setTimeout(_bind, 3000);

  SBE.ThreePrimitiveVisibilityHarness = Object.freeze({
    VERSION: VERSION,
    state:   state,
    clear:   clear,
    getInstanceId: function () { return INSTANCE_ID; },
  });

  console.log('[ThreePrimitiveVisibilityHarness] v' + VERSION + ' loaded — _wos.debug.threeProof.screenCube()');

})(window);
