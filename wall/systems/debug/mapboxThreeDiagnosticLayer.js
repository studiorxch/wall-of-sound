// ── MapboxThreeDiagnosticLayer v1.0.0 ─────────────────────────────────────────
// 0531K_WOS_MapboxThreeDiagnosticLayer_v1.0.0
// Status: diagnostic
// Classification: debug-tool
//
// Renders three large coloured cubes near the current map centre using a
// Mapbox custom layer + Three.js.  Proves whether the transform path works
// independently of all vehicle / route / camera systems.
//
// Two render modes:
//
//   model-matrix  (default — canonical Mapbox custom-layer path)
//     Each cube is positioned at the origin in mesh space.
//     The full world→clip transform is baked into camera.projectionMatrix:
//       camera.projectionMatrix = mapboxMatrix × modelMatrix
//     modelMatrix = translate(merc.x, merc.y, merc.z) × scale(s, -s, s)
//     The −Y scale compensates for Mapbox Mercator's Y-increases-south convention.
//
//   mesh-position  (current suspected-broken path)
//     mesh.position set to Mercator coordinates directly.
//     camera.projectionMatrix = mapboxMatrix only.
//     No Y negation.
//
// Isolation: depends ONLY on mapboxgl + THREE.  Zero WOS runtime dependencies.
//
// API:
//   _wos.debug.threeDiag.start()
//   _wos.debug.threeDiag.stop()
//   _wos.debug.threeDiag.state()
//   _wos.debug.threeDiag.mode()               → prints current mode
//   _wos.debug.threeDiag.mode('model-matrix') → switch mode live
//   _wos.debug.threeDiag.mode('mesh-position')
//
// Placement: wall/systems/debug/mapboxThreeDiagnosticLayer.js
// Load: AFTER three.min.js CDN AND after Mapbox map is initialised
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var VERSION  = '1.0.0';
  var LAYER_ID = 'wos-three-diagnostic-layer';
  var CUBE_ALTITUDE_M = 25;   // altitude of cube centre (half of 50m height)
  var CUBE_SIZE_M     = 50;   // each cube is 50 × 50 × 50 metres

  // ── Cube definitions ──────────────────────────────────────────────────────────
  var CUBE_DEFS = [
    { id: 'A_red',   color: 0xff2222, eastM:   0, northM:   0, label: 'centre' },
    { id: 'B_green', color: 0x22ff22, eastM: 100, northM:   0, label: '100m east' },
    { id: 'C_blue',  color: 0x2244ff, eastM:   0, northM: 100, label: '100m north' },
  ];

  // ── State ─────────────────────────────────────────────────────────────────────
  var _active     = false;
  var _layerAdded = false;
  var _mode       = 'model-matrix';
  var _mapRef     = null;
  var _renderer   = null;
  var _camera     = null;
  var _cubes      = [];    // [{ id, color, lat, lng, sizeM, mesh, scene, geo, mat }]
  var _center     = null;  // { lat, lng } at start() time

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _offsetLngLat(lng, lat, eastM, northM) {
    var mPerDegLat = 111320;
    var mPerDegLng = Math.cos(lat * Math.PI / 180) * 111320;
    return {
      lat: lat + northM / mPerDegLat,
      lng: lng + eastM  / mPerDegLng,
    };
  }

  function _getMap() {
    if (_mapRef) return _mapRef;
    // Fallback: try common WOS map handles
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    var m   = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!m && global.SBE && global.SBE.map) m = global.SBE.map;
    _mapRef = m;
    return m;
  }

  function _checkDeps() {
    var ok = !!(global.THREE && global.THREE.Scene && global.THREE.WebGLRenderer);
    if (!ok) console.warn('[ThreeDiag] THREE not available');
    if (!_getMap()) console.warn('[ThreeDiag] Mapbox map not available');
    return ok && !!_getMap();
  }

  // ── Cube mesh builder ─────────────────────────────────────────────────────────
  // Each cube gets its own THREE.Scene so it can be rendered with a per-cube
  // camera.projectionMatrix in model-matrix mode without leaking transform state.

  function _buildCube(color) {
    var THREE = global.THREE;
    var geo   = new THREE.BoxGeometry(1, 1, 1);   // unit cube; real size via matrix
    var mat   = new THREE.MeshBasicMaterial({ color: color, depthTest: true });
    var mesh  = new THREE.Mesh(geo, mat);
    var scene = new THREE.Scene();
    scene.add(mesh);
    return { geo: geo, mat: mat, mesh: mesh, scene: scene };
  }

  // ── Render modes ──────────────────────────────────────────────────────────────

  // model-matrix mode:
  //   Cube mesh stays at origin (0,0,0).
  //   Full transform folded into camera.projectionMatrix:
  //     projectionMatrix = mapboxMatrix × modelMatrix
  //   modelMatrix = translate(merc.x, merc.y, merc.z) × scale(s, -s, s)
  //   The -Y corrects Mapbox Mercator Y-increases-south vs Three.js Y-up.
  function _renderModelMatrix(mapboxMatrix, cube) {
    var THREE   = global.THREE;
    var mapboxgl = global.mapboxgl;

    var merc  = mapboxgl.MercatorCoordinate.fromLngLat(
      [cube.lng, cube.lat], CUBE_ALTITUDE_M);
    var s = merc.meterInMercatorCoordinateUnits() * CUBE_SIZE_M;

    // Mesh stays at origin — transform entirely in camera matrix
    cube.mesh.position.set(0, 0, 0);
    cube.mesh.scale.setScalar(1);
    cube.mesh.rotation.set(0, 0, 0);

    // Canonical Mapbox model-matrix: translate → scale with Y negation
    var modelMatrix = new THREE.Matrix4()
      .makeTranslation(merc.x, merc.y, merc.z)
      .scale(new THREE.Vector3(s, -s, s));

    _camera.projectionMatrix = new THREE.Matrix4()
      .fromArray(mapboxMatrix)
      .multiply(modelMatrix);

    _renderer.resetState();
    _renderer.render(cube.scene, _camera);
  }

  // mesh-position mode:
  //   Cube mesh positioned at Mercator coordinates directly.
  //   camera.projectionMatrix = mapboxMatrix only (no Y negation).
  //   This is the current WorldSpaceVehicleLayer approach.
  function _renderMeshPosition(mapboxMatrix, cube) {
    var THREE    = global.THREE;
    var mapboxgl = global.mapboxgl;

    var merc = mapboxgl.MercatorCoordinate.fromLngLat(
      [cube.lng, cube.lat], CUBE_ALTITUDE_M);
    var s = merc.meterInMercatorCoordinateUnits() * CUBE_SIZE_M;

    cube.mesh.position.set(merc.x, merc.y, merc.z);
    cube.mesh.scale.setScalar(s);
    cube.mesh.rotation.set(0, 0, 0);

    _camera.projectionMatrix = new THREE.Matrix4().fromArray(mapboxMatrix);

    _renderer.resetState();
    _renderer.render(cube.scene, _camera);
  }

  // ── Custom layer ──────────────────────────────────────────────────────────────

  var _customLayer = {
    id:            LAYER_ID,
    type:          'custom',
    renderingMode: '3d',

    onAdd: function (map, gl) {
      var THREE = global.THREE;
      if (!THREE) { console.error('[ThreeDiag] onAdd: THREE missing'); return; }

      _renderer = new THREE.WebGLRenderer({
        canvas:    map.getCanvas(),
        context:   gl,
        antialias: true,
      });
      _renderer.autoClear = false;

      _camera = new THREE.Camera();

      _layerAdded = true;
      console.log('[ThreeDiag] onAdd complete — renderer ready, mode:', _mode);
    },

    render: function (gl, mapboxMatrix) {
      if (!_renderer || !_camera || !_cubes.length) return;
      try {
        if (_mode === 'model-matrix') {
          _cubes.forEach(function (c) { _renderModelMatrix(mapboxMatrix, c); });
        } else {
          _cubes.forEach(function (c) { _renderMeshPosition(mapboxMatrix, c); });
        }
        _mapRef.triggerRepaint();
      } catch (e) {
        console.warn('[ThreeDiag] render error:', e.message);
      }
    },
  };

  // ── Public API ────────────────────────────────────────────────────────────────

  function start() {
    if (_active) { console.warn('[ThreeDiag] already active — call stop() first'); return false; }
    if (!_checkDeps()) return false;

    var map = _getMap();
    if (!map.isStyleLoaded()) {
      console.warn('[ThreeDiag] style not loaded yet — retrying in 500ms');
      global.setTimeout(start, 500);
      return false;
    }

    // Capture map centre at start time
    try {
      var c = map.getCenter();
      _center = { lat: c.lat, lng: c.lng };
    } catch (e) { console.error('[ThreeDiag] getCenter failed:', e.message); return false; }

    // Build cube list
    var THREE = global.THREE;
    _cubes = CUBE_DEFS.map(function (def) {
      var pos  = _offsetLngLat(_center.lng, _center.lat, def.eastM, def.northM);
      var built = _buildCube(def.color);
      return {
        id:    def.id,
        label: def.label,
        color: def.color,
        lat:   pos.lat,
        lng:   pos.lng,
        sizeM: CUBE_SIZE_M,
        mesh:  built.mesh,
        scene: built.scene,
        geo:   built.geo,
        mat:   built.mat,
      };
    });

    try {
      map.addLayer(_customLayer);
    } catch (e) {
      console.error('[ThreeDiag] addLayer failed:', e.message);
      _cubes = [];
      return false;
    }

    _active = true;
    console.log('[ThreeDiag] v' + VERSION + ' started — mode:', _mode);
    console.log('  Cube A (red)  :', _center.lat.toFixed(5),   _center.lng.toFixed(5), '← map centre');
    console.log('  Cube B (green):', CUBE_DEFS[1].eastM + 'm east');
    console.log('  Cube C (blue) :', CUBE_DEFS[2].northM + 'm north');
    console.log('  If cubes appear → transform path works.');
    console.log('  If no cubes    → fix Mapbox/Three matrix path before continuing.');
    return true;
  }

  function stop() {
    if (!_active) { console.warn('[ThreeDiag] not active'); return; }

    var map = _getMap();
    if (map) {
      try { map.removeLayer(LAYER_ID); } catch (e) {}
    }

    // Dispose Three.js resources
    _cubes.forEach(function (c) {
      try { c.geo.dispose(); c.mat.dispose(); } catch (e) {}
    });
    _cubes     = [];
    _layerAdded = false;
    _active     = false;

    if (_renderer) {
      try { _renderer.dispose(); } catch (e) {}
      _renderer = null;
    }
    _camera = null;
    console.log('[ThreeDiag] stopped and disposed');
  }

  function mode(m) {
    if (m === undefined) {
      console.log('[ThreeDiag] current mode:', _mode);
      return _mode;
    }
    if (m !== 'model-matrix' && m !== 'mesh-position') {
      console.warn('[ThreeDiag] unknown mode:', m, '— valid: model-matrix | mesh-position');
      return _mode;
    }
    _mode = m;
    console.log('[ThreeDiag] mode →', _mode);
    if (_mapRef) { try { _mapRef.triggerRepaint(); } catch (e) {} }
    return _mode;
  }

  function state() {
    var map = _getMap();
    var center = null;
    if (map) {
      try { var cc = map.getCenter(); center = { lat: Math.round(cc.lat * 1e5) / 1e5, lng: Math.round(cc.lng * 1e5) / 1e5 }; } catch (e) {}
    }
    return {
      active:         _active,
      layerAdded:     _layerAdded,
      threeAvailable: !!(global.THREE && global.THREE.Scene),
      mapAvailable:   !!_getMap(),
      mode:           _mode,
      center:         center,
      cubes:          _cubes.map(function (c) {
        return { id: c.id, color: '#' + c.color.toString(16).padStart(6, '0'),
                 lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5,
                 altitudeM: CUBE_ALTITUDE_M, sizeM: c.sizeM };
      }),
    };
  }

  // ── Debug binding ─────────────────────────────────────────────────────────────

  var _api = { start: start, stop: stop, mode: mode, state: state };

  function _bind() {
    global._wos             = global._wos             || {};
    global._wos.debug       = global._wos.debug       || {};
    global._wos.debug.threeDiag = _api;
  }
  _bind();
  global.setTimeout(_bind, 500);
  global.setTimeout(_bind, 1500);
  global.setTimeout(_bind, 3000);

  console.log('[MapboxThreeDiagnosticLayer] v' + VERSION
    + ' loaded — _wos.debug.threeDiag.start()');
  console.log('  Failure interpretation:');
  console.log('  cubes appear (model-matrix) → WorldSpaceVehicleLayer needs Y-negation fix');
  console.log('  cubes invisible (both modes) → fix render path before vehicle work');

})(window);
