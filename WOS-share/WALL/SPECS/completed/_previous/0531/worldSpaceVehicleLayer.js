// ── WorldSpaceVehicleLayer v1.0.0 ─────────────────────────────────────────────
// 0531J_WOS_WorldSpaceVehicleLayer_v1.0.0
// Status: prototype
// Classification: render-layer
//
// Renders hero and traffic vehicles as Three.js meshes inside a Mapbox
// custom layer, so they sit in world-space rather than floating as DOM overlays.
//
// Architecture:
//   upsertVehicle(state) → build/update Three.js mesh
//   Mapbox render() callback → set camera from Mapbox matrix, draw scene
//
// Coordinate system:
//   Mapbox Mercator: X 0→1 (west→east), Y 0→1 (north→south), Z = altitude
//   North = −Y direction. Mesh nose built pointing in −Y.
//   Heading rotation: mesh.rotation.z = −headingDeg × π/180
//   Scale: meterInMercatorCoordinateUnits() × realWorldMeters × _debugScale
//
// Authority:
//   OWNS: all Three.js mesh state, Mapbox custom layer lifecycle
//   READS: actor lat/lng/heading from upsertVehicle() calls
//   MUST NOT: control camera, alter routes, call Mapbox jumpTo/easeTo
//
// Fallback: if THREE unavailable, all calls are no-ops and DOM markers stay active
//
// Placement: wall/systems/render/worldSpaceVehicleLayer.js
// Load: AFTER three.min.js CDN, BEFORE heroVehicleRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Constants ─────────────────────────────────────────────────────────────────
  var LAYER_ID         = 'wos-world-space-vehicles';
  var ALTITUDE_M       = 0.35;    // slight lift prevents z-fighting on road surface
  var WORLD_VEHICLE_SCALE = 1.0;  // debug multiplier; real size from meterInMercator*

  // Real-world vehicle dimensions in metres
  var DIMS = {
    hero_car:    { len: 4.5,  wid: 2.0, ht: 1.5, cabLen: 2.1 },
    traffic_car: { len: 4.2,  wid: 1.9, ht: 1.4, cabLen: 2.0 },
    box_truck:   { len: 8.5,  wid: 2.6, ht: 3.2, cabLen: 2.5 },
  };

  // ── Variant palette ───────────────────────────────────────────────────────────
  var COLORS = {
    sedan_red:             0xc8352e,
    sedan_dark:            0x3d4a5c,
    sedan_light:           0xc4c8cc,
    taxi_yellow:           0xf7c800,
    clean_white:           0xf4f4f4,
    weathered:             0xcdc9c1,
    sticker_graffiti_test: 0xf4f4f4,
  };

  function _bodyColor(variant) { return COLORS[variant] || 0x8899aa; }
  function _roofColor(variant) {
    var c = new (global.THREE && global.THREE.Color)((_bodyColor(variant)));
    if (c && c.multiplyScalar) return c.multiplyScalar(0.7).getHex();
    return 0x556677;
  }

  // ── State ─────────────────────────────────────────────────────────────────────
  var _map        = null;
  var _renderer   = null;
  var _camera     = null;
  var _scene      = null;
  var _meshes     = {};      // id → THREE.Group
  var _vehicles   = {};      // id → last upserted state
  var _visMode    = 'vehicle';  // 'vehicle' | 'block'
  var _enabled    = false;   // opt-in; DOM markers remain until explicitly enabled
  var _active     = false;

  // ── Instance identity ─────────────────────────────────────────────────────────
  var INSTANCE_ID = 'wsl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

  // ── Upsert trace ──────────────────────────────────────────────────────────────
  var _upsertTraceEnabled    = false;
  var _lastUpsertTraceAt     = 0;
  var UPSERT_TRACE_INTERVAL  = 1000;
  var _lastUpsertFailure     = null;
  var _lastUpsertSuccess     = null;

  // ── Beacon state (diagnostic only) ───────────────────────────────────────────
  var _beaconMesh   = null;
  var _beaconActive = false;
  var _beaconRafId  = null;
  var _layerAdded = false;
  var _debugMode  = false;
  var _debugScale = 1.0;
  var _threeOk    = false;

  // ── Three.js guard ────────────────────────────────────────────────────────────
  function _checkThree() {
    _threeOk = !!(global.THREE && global.THREE.Scene && global.THREE.WebGLRenderer);
    return _threeOk;
  }

  // ── Mesh builders ─────────────────────────────────────────────────────────────
  // All meshes are built in REAL-WORLD METRES centred at origin.
  // Nose points in −Y (north when rotation.z = 0).

  function _mat(color, opts) {
    var THREE = global.THREE;
    opts = opts || {};
    return new THREE.MeshLambertMaterial({
      color:       color,
      transparent: opts.transparent || false,
      opacity:     opts.opacity != null ? opts.opacity : 1.0,
      side:        opts.side || THREE.FrontSide,
    });
  }

  function _box(w, h, d) {
    return new global.THREE.BoxGeometry(w, h, d);
  }

  function _buildCarMesh(actorType, variant) {
    var THREE = global.THREE;
    var d   = DIMS[actorType] || DIMS.traffic_car;
    var W   = d.wid, L = d.len, H = d.ht;
    var g   = new THREE.Group();

    // Chassis body — flat wide box, centred at z=H*0.25
    var body = new THREE.Mesh(_box(W, L, H * 0.5), _mat(_bodyColor(variant)));
    body.position.z = H * 0.25;
    g.add(body);

    // Cabin roof — narrower, sits on top of chassis
    var cab = new THREE.Mesh(
      _box(W * 0.85, L * 0.52, H * 0.44),
      _mat(_roofColor(variant))
    );
    cab.position.set(0, -L * 0.04, H * 0.5 + H * 0.22);
    g.add(cab);

    // Windshield — front glass pane, slightly tilted
    var wind = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.72, H * 0.32),
      _mat(0xbee8ff, { transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    wind.position.set(0, -(L * 0.26 + H * 0.08), H * 0.5 + H * 0.18);
    wind.rotation.x = -0.38;
    g.add(wind);

    // Hood plane — darker, front quarter
    var hood = new THREE.Mesh(
      _box(W * 0.94, L * 0.22, H * 0.06),
      _mat(_bodyColor(variant))
    );
    hood.position.set(0, -(L * 0.39), H * 0.5 + H * 0.03);
    g.add(hood);

    // Heading cue — yellow cone at nose tip
    var cue = new THREE.Mesh(
      new THREE.ConeGeometry(W * 0.13, L * 0.13, 3),
      _mat(0xffd34d)
    );
    cue.rotation.x = Math.PI / 2;   // point along −Y
    cue.position.set(0, -(L * 0.5 + L * 0.04), H * 0.28);
    g.add(cue);

    // 4 wheels — cylinders rotated to spin on Z axis
    var wR = Math.min(W, H) * 0.195, wT = W * 0.14;
    var wGeo = new THREE.CylinderGeometry(wR, wR, wT, 8);
    var wMat = _mat(0x1a1a1a);
    [
      [ W * 0.5 + wT * 0.5, -L * 0.31, 0 ],
      [-W * 0.5 - wT * 0.5, -L * 0.31, 0 ],
      [ W * 0.5 + wT * 0.5,  L * 0.31, 0 ],
      [-W * 0.5 - wT * 0.5,  L * 0.31, 0 ],
    ].forEach(function (p) {
      var w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], p[1], p[2]);
      g.add(w);
    });

    return g;
  }

  function _buildTruckMesh(variant) {
    var THREE = global.THREE;
    var d   = DIMS.box_truck;
    var W   = d.wid, L = d.len, H = d.ht, CL = d.cabLen;
    var boxL = L - CL;
    var g   = new THREE.Group();

    // Origin is at vehicle centre in XY.
    // Nose at −L/2, tail at +L/2.
    // Cab occupies front (−Y): y ∈ [−L/2, −L/2+CL]
    // Cargo occupies rear: y ∈ [−L/2+CL, +L/2]

    var cabCentreY  = -(L / 2) + CL / 2;
    var boxCentreY  = -(L / 2) + CL + boxL / 2;

    // Cargo box
    var cargoBody = new THREE.Mesh(
      _box(W, boxL, H),
      _mat(_bodyColor(variant))
    );
    cargoBody.position.set(0, boxCentreY, H / 2);
    g.add(cargoBody);

    // Graffiti art panels on cargo right side
    if (variant === 'sticker_graffiti_test') {
      var grafColors = [0xe63e2a, 0x2b8cde, 0xf5c518, 0x3ab56f];
      var panH = H * 0.35, panL = boxL * 0.28;
      grafColors.forEach(function (c, i) {
        var panel = new THREE.Mesh(
          new THREE.PlaneGeometry(panL, panH),
          _mat(c, { side: THREE.DoubleSide })
        );
        panel.rotation.y = Math.PI / 2;
        panel.position.set(
          W / 2 + 0.01,
          boxCentreY + (i - 1.5) * boxL * 0.24,
          H * 0.62
        );
        g.add(panel);
      });
    }

    // Cab block
    var cab = new THREE.Mesh(
      _box(W, CL, H * 0.88),
      _mat(0x5a6068)
    );
    cab.position.set(0, cabCentreY, H * 0.44);
    g.add(cab);

    // Cab–cargo separation shadow stripe
    var seam = new THREE.Mesh(
      _box(W + 0.02, 0.06, H + 0.02),
      _mat(0x111111)
    );
    seam.position.set(0, -(L / 2) + CL, H / 2);
    g.add(seam);

    // Windshield
    var wind = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.76, H * 0.28),
      _mat(0xb0d8f0, { transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    wind.rotation.x = -0.28;
    wind.position.set(0, -(L / 2 - 0.15), H * 0.72);
    g.add(wind);

    // Heading cue — white chevron at cab nose
    var cue = new THREE.Mesh(
      new THREE.ConeGeometry(W * 0.1, CL * 0.18, 3),
      _mat(0xffffff)
    );
    cue.rotation.x = Math.PI / 2;
    cue.position.set(0, -(L / 2 + 0.08), H * 0.52);
    g.add(cue);

    // 6 wheels (steer pair + 2 drive axles)
    var wR = 0.43, wT = W * 0.14;
    var wGeo = new THREE.CylinderGeometry(wR, wR, wT, 8);
    var wMat = _mat(0x1a1a1a);
    [
      [ W * 0.5 + wT * 0.5, cabCentreY + CL * 0.25,  0 ],
      [-W * 0.5 - wT * 0.5, cabCentreY + CL * 0.25,  0 ],
      [ W * 0.5 + wT * 0.5, boxCentreY - boxL * 0.27, 0 ],
      [-W * 0.5 - wT * 0.5, boxCentreY - boxL * 0.27, 0 ],
      [ W * 0.5 + wT * 0.5, boxCentreY + boxL * 0.27, 0 ],
      [-W * 0.5 - wT * 0.5, boxCentreY + boxL * 0.27, 0 ],
    ].forEach(function (p) {
      var w = new THREE.Mesh(wGeo, wMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(p[0], p[1], p[2]);
      g.add(w);
    });

    return g;
  }

  // Block mesh: 20m × 10m × 8m bright red box, altitude centre = 4m.
  // Uses MeshBasicMaterial — unaffected by lighting, always fully lit.
  // Identical mesh-position transform as vehicle meshes; used to calibrate
  // scale/position before shrinking to real car proportions.
  function _buildBlockMesh() {
    var THREE = global.THREE;
    var g   = new THREE.Group();
    var geo = new THREE.BoxGeometry(10, 20, 8);   // width, length, height in metres
    var mat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    var box = new THREE.Mesh(geo, mat);
    box.position.z = 4;   // base at z=0, centre at z=4m (half of 8m)
    g.add(box);
    return g;
  }

  function _buildMesh(actorType, variant) {
    if (_visMode === 'block') return _buildBlockMesh();
    if (actorType === 'box_truck') return _buildTruckMesh(variant);
    return _buildCarMesh(actorType, variant);
  }

  // ── Mesh transform ────────────────────────────────────────────────────────────

  function _applyTransform(mesh, v) {
    if (!global.mapboxgl || !global.mapboxgl.MercatorCoordinate) return;
    try {
      var coord = global.mapboxgl.MercatorCoordinate.fromLngLat(
        [v.lng, v.lat],
        ALTITUDE_M
      );
      // meterInMercatorCoordinateUnits() converts 1 real-world metre → Mercator units
      var meterScale = coord.meterInMercatorCoordinateUnits() * _debugScale;
      mesh.position.set(coord.x, coord.y, coord.z);
      // heading 0 = north = −Y in Mercator; mesh nose is at −Y → no rotation at heading 0
      mesh.rotation.z = -(v.headingDeg || 0) * Math.PI / 180;
      mesh.scale.setScalar(meterScale);
      mesh.visible = (v.visible !== false);
    } catch (e) { /* guard: never throw in render loop */ }
  }

  // ── Custom layer ──────────────────────────────────────────────────────────────

  var _customLayer = {
    id:            LAYER_ID,
    type:          'custom',
    renderingMode: '3d',

    onAdd: function (map, gl) {
      var THREE = global.THREE;
      if (!THREE) return;

      _renderer = new THREE.WebGLRenderer({
        canvas:    map.getCanvas(),
        context:   gl,
        antialias: true,
      });
      _renderer.autoClear       = false;
      _renderer.shadowMap.enabled = false;

      _camera = new THREE.Camera();
      _scene  = new THREE.Scene();

      // Lighting: soft ambient + directional from above-left
      _scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      var dir = new THREE.DirectionalLight(0xffffff, 0.55);
      dir.position.set(0.4, -0.6, 1.0).normalize();
      _scene.add(dir);

      // Re-attach any meshes created before onAdd fired
      Object.keys(_meshes).forEach(function (id) {
        _meshes[id].name = id;
        _scene.add(_meshes[id]);
      });

      _layerAdded = true;
      console.log('[WorldSpaceVehicleLayer] onAdd — Three.js renderer ready');
    },

    render: function (gl, matrix) {
      if (!_enabled || !_renderer || !_camera || !_scene) return;
      var THREE = global.THREE;
      if (!THREE) return;
      try {
        _camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        _renderer.resetState();
        _renderer.render(_scene, _camera);
        _map.triggerRepaint();
      } catch (e) {
        if (_debugMode) console.warn('[WorldSpaceVehicleLayer] render error:', e.message);
      }
    },
  };

  // ── start / stop ──────────────────────────────────────────────────────────────

  function start() {
    if (!_checkThree()) {
      console.warn('[WorldSpaceVehicleLayer] THREE unavailable — DOM vehicle fallback remains active');
      return false;
    }
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    _map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!_map) { console.warn('[WorldSpaceVehicleLayer] map not ready'); return false; }

    if (!_layerAdded) {
      try {
        _map.addLayer(_customLayer);
      } catch (e) {
        console.warn('[WorldSpaceVehicleLayer] addLayer failed:', e.message);
        return false;
      }
    }
    _active = true;
    console.log('[WorldSpaceVehicleLayer] v' + VERSION + ' started');
    return true;
  }

  function stop() {
    _active = false;
    if (_map && _layerAdded) {
      try { _map.removeLayer(LAYER_ID); } catch (e) {}
      _layerAdded = false;
    }
    if (_renderer) {
      try { _renderer.dispose(); } catch (e) {}
      _renderer = null;
    }
    _camera = null;
    _scene  = null;
    _meshes = {};
    _vehicles = {};
    console.log('[WorldSpaceVehicleLayer] stopped');
  }

  // ── Beacon (diagnostic) ───────────────────────────────────────────────────────
  // A 20×20×100m bright red vertical box at the hero position.
  // Uses the IDENTICAL Mercator transform path as vehicles.
  // If beacon appears → custom layer is rendering correctly.
  // If beacon is invisible → matrix/render path is the failure point.

  function _buildBeaconMesh() {
    var THREE = global.THREE;
    if (!THREE) return null;
    var g = new THREE.Group();
    // 20m × 20m × 100m box, centred at origin, extending upward (z ≥ 0)
    var geo = new THREE.BoxGeometry(20, 20, 100);
    var mat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: false });
    var box = new THREE.Mesh(geo, mat);
    box.position.z = 50;   // lift so base sits on road surface
    g.add(box);
    // Wireframe overlay for maximum visibility
    var wfMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
    g.add(new THREE.Mesh(geo, wfMat));
    return g;
  }

  function _beaconTick() {
    if (!_beaconActive || !_beaconMesh || !_scene) { _beaconRafId = null; return; }
    _beaconRafId = global.requestAnimationFrame(_beaconTick);

    var hrt = global.SBE && SBE.HeroVehicleRuntime;
    var entity = hrt && typeof hrt.getEntity === 'function' ? hrt.getEntity() : null;
    if (entity && entity.active && entity.lat != null) {
      _applyTransform(_beaconMesh, {
        lat:        entity.lat,
        lng:        entity.lng,
        headingDeg: 0,         // beacon has no heading — always axis-aligned
        visible:    true,
      });
    }
  }

  function startBeacon() {
    if (!_checkThree()) { console.warn('[WorldSpaceVehicleLayer] beacon: THREE unavailable'); return false; }
    if (!isRenderReady()) { console.warn('[WorldSpaceVehicleLayer] beacon: layer not renderReady'); return false; }

    stopBeacon();   // clear any existing beacon first

    _beaconMesh = _buildBeaconMesh();
    if (!_beaconMesh) return false;
    _beaconMesh.name = 'debug_beacon';
    _scene.add(_beaconMesh);
    _beaconActive = true;

    // Seed position immediately
    var hrt = global.SBE && SBE.HeroVehicleRuntime;
    var entity = hrt && typeof hrt.getEntity === 'function' ? hrt.getEntity() : null;
    if (entity && entity.active) {
      _applyTransform(_beaconMesh, { lat: entity.lat, lng: entity.lng, headingDeg: 0, visible: true });
    }

    _beaconRafId = global.requestAnimationFrame(_beaconTick);
    console.log('[WorldSpaceVehicleLayer] beacon started — 20m×20m×100m red box at hero position');
    return true;
  }

  function stopBeacon() {
    _beaconActive = false;
    if (_beaconRafId) { global.cancelAnimationFrame(_beaconRafId); _beaconRafId = null; }
    if (_beaconMesh && _scene) { _scene.remove(_beaconMesh); }
    _beaconMesh = null;
    console.log('[WorldSpaceVehicleLayer] beacon cleared');
  }

  // ── Upsert trace helpers ──────────────────────────────────────────────────────

  function _summarizePayload(v) {
    if (!v) return null;
    return {
      id: v.id, actorType: v.actorType, variant: v.variant, source: v.source,
      lat: v.lat, lng: v.lng, headingDeg: v.headingDeg, visible: v.visible, scale: v.scale,
    };
  }

  function _recordUpsertFailure(reason, v, extra) {
    _lastUpsertFailure = {
      reason:       reason,
      instanceId:   INSTANCE_ID,
      timestamp:    Date.now(),
      enabled:      _enabled,
      active:       _active,
      threeOk:      _threeOk,
      layerAdded:   _layerAdded,
      renderReady:  isRenderReady(),
      vehicleCount: Object.keys(_vehicles).length,
      payload:      _summarizePayload(v),
      extra:        extra || null,
    };
    if (_upsertTraceEnabled && (Date.now() - _lastUpsertTraceAt) >= UPSERT_TRACE_INTERVAL) {
      _lastUpsertTraceAt = Date.now();
      console.warn('[WorldSpaceVehicleLayer] upsert FAILED', _lastUpsertFailure);
    }
  }

  function _recordUpsertSuccess(v) {
    _lastUpsertSuccess = {
      instanceId:   INSTANCE_ID,
      timestamp:    Date.now(),
      id:           v && v.id,
      source:       v && v.source,
      actorType:    v && v.actorType,
      variant:      v && v.variant,
      lat:          v && v.lat,
      lng:          v && v.lng,
      headingDeg:   v && v.headingDeg,
      vehicleCount: Object.keys(_vehicles).length,
    };
    if (_upsertTraceEnabled && (Date.now() - _lastUpsertTraceAt) >= UPSERT_TRACE_INTERVAL) {
      _lastUpsertTraceAt = Date.now();
      console.log('[WorldSpaceVehicleLayer] upsert OK', _lastUpsertSuccess);
    }
  }

  function setUpsertTraceEnabled(on) { _upsertTraceEnabled = !!on; }

  function getUpsertTraceState() {
    return {
      enabled:      _upsertTraceEnabled,
      instanceId:   INSTANCE_ID,
      lastFailure:  _lastUpsertFailure,
      lastSuccess:  _lastUpsertSuccess,
      vehicleCount: Object.keys(_vehicles).length,
      renderReady:  isRenderReady(),
    };
  }

  // ── upsertVehicle ─────────────────────────────────────────────────────────────

  // Public entry: total-failure guarantee. Any throw not already resolved into
  // an explicit reason by _upsertVehicleInner() is caught here and resolved to
  // 'unknown_exception'. This satisfies two constitutional rules:
  //   - never throw during the RAF/render loop
  //   - all failures must resolve into explicit reasons (no generic failures)
  function upsertVehicle(v) {
    try {
      return _upsertVehicleInner(v);
    } catch (err) {
      _recordUpsertFailure('unknown_exception', v, {
        message: err && err.message ? err.message : String(err),
      });
      return false;
    }
  }

  function _upsertVehicleInner(v) {
    // Guard 1: Three.js not initialised
    if (!_threeOk) {
      _recordUpsertFailure('three_not_available', v);
      return false;
    }
    // Guard 2: layer explicitly disabled
    if (!_enabled) {
      _recordUpsertFailure('layer_disabled', v);
      return false;
    }
    // Guard 3: no payload
    if (!v) {
      _recordUpsertFailure('missing_payload', v);
      return false;
    }
    // Guard 4: no id
    if (!v.id) {
      _recordUpsertFailure('missing_id', v);
      return false;
    }
    // Guard 5: invalid lat/lng
    if (v.lat == null || v.lng == null || isNaN(v.lat) || isNaN(v.lng)) {
      _recordUpsertFailure('invalid_lat_lng', v);
      return false;
    }

    _vehicles[v.id] = v;

    // Create/rebuild mesh if needed — wrapped to capture Three.js errors
    var prev = _meshes[v.id];
    var needNew = !prev ||
      (prev._actorType !== v.actorType) ||
      (prev._variant   !== v.variant)   ||
      (_visMode === 'block' ? prev._visMode !== 'block' : prev._visMode === 'block');

    if (needNew) {
      try {
        if (prev && _scene) _scene.remove(prev);
        var mesh = _buildMesh(v.actorType || 'hero_car', v.variant || 'sedan_red');
        mesh._actorType = v.actorType;
        mesh._variant   = v.variant;
        mesh._visMode   = _visMode;
        mesh.name       = v.id;
        _meshes[v.id]   = mesh;
        if (_scene) _scene.add(mesh);
      } catch (err) {
        _recordUpsertFailure('mesh_build_failed', v, { message: err && err.message ? err.message : String(err) });
        return false;
      }
    }

    try {
      _applyTransform(_meshes[v.id], v);
    } catch (err) {
      _recordUpsertFailure('transform_failed', v, { message: err && err.message ? err.message : String(err) });
      return false;
    }

    _recordUpsertSuccess(v);
    return true;
  }

  function removeVehicle(id) {
    if (_meshes[id]) {
      if (_scene) _scene.remove(_meshes[id]);
      delete _meshes[id];
    }
    delete _vehicles[id];
  }

  function clear() {
    Object.keys(_meshes).forEach(function (id) {
      if (_scene) _scene.remove(_meshes[id]);
    });
    _meshes   = {};
    _vehicles = {};
  }

  // ── Accessors ─────────────────────────────────────────────────────────────────

  // True only when all subsystems required for visible rendering are initialised.
  function isRenderReady() {
    return !!(
      _active     &&
      _enabled    &&
      _layerAdded &&
      _renderer   &&
      _camera     &&
      _scene
    );
  }

  function setVisibilityMode(m) {
    if (m !== 'vehicle' && m !== 'block') {
      console.warn('[WorldSpaceVehicleLayer] unknown visibilityMode:', m, '— use: vehicle | block');
      return;
    }
    if (m === _visMode) return;
    _visMode = m;
    // Rebuild all existing meshes with the new visual
    Object.keys(_vehicles).forEach(function (id) {
      var v = _vehicles[id];
      var old = _meshes[id];
      if (old && _scene) _scene.remove(old);
      var mesh = _buildMesh(v.actorType, v.variant);
      mesh._actorType = v.actorType;
      mesh._variant   = v.variant;
      mesh._visMode   = _visMode;   // prevents upsertVehicle() rebuild loop
      mesh.name       = id;
      _meshes[id]     = mesh;
      if (_scene) _scene.add(mesh);
      _applyTransform(mesh, v);
    });
    console.log('[WorldSpaceVehicleLayer] visibilityMode →', _visMode);
  }

  function getVisibilityMode() { return _visMode; }

  function setEnabled(v) {
    _enabled = !!v;
    if (!_enabled) {
      // Hide all meshes without removing them
      Object.keys(_meshes).forEach(function (id) { _meshes[id].visible = false; });
    }
  }
  function getEnabled()  { return _enabled; }
  function isActive()    { return _active; }
  function setDebugMode(v) { _debugMode = !!v; }

  function setDebugScale(s) {
    _debugScale = Math.max(0.1, Number(s) || 1.0);
    // Re-apply transforms for all current vehicles
    Object.keys(_vehicles).forEach(function (id) {
      if (_meshes[id]) _applyTransform(_meshes[id], _vehicles[id]);
    });
  }

  function getState() {
    return {
      active:         _active,
      enabled:        _enabled,
      threeAvailable: _threeOk,
      layerAdded:     _layerAdded,
      vehicleCount:   Object.keys(_vehicles).length,
      vehicles:       Object.keys(_vehicles).map(function (id) {
        var v = _vehicles[id];
        return {
          id:         id,
          source:     v.source,
          actorType:  v.actorType,
          variant:    v.variant,
          lat:        v.lat != null ? Math.round(v.lat * 1e5) / 1e5 : null,
          lng:        v.lng != null ? Math.round(v.lng * 1e5) / 1e5 : null,
          headingDeg: v.headingDeg,
          visible:    v.visible !== false,
        };
      }),
      instanceId:     INSTANCE_ID,
      renderReady:    isRenderReady(),
      fallbackMode:   !isRenderReady(),
      beaconActive:   _beaconActive,
      visibilityMode: _visMode,
      lastUpsertFailure: _lastUpsertFailure
        ? { reason: _lastUpsertFailure.reason, payload: _lastUpsertFailure.payload }
        : null,
      lastUpsertSuccess: _lastUpsertSuccess
        ? { id: _lastUpsertSuccess.id, source: _lastUpsertSuccess.source, vehicleCount: _lastUpsertSuccess.vehicleCount }
        : null,
      scale:          _debugScale,
    };
  }

  function getVisualState() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    var zoom = null;
    if (map) { try { zoom = Math.round(map.getZoom() * 10) / 10; } catch (e) {} }
    return Object.assign(getState(), { zoom: zoom });
  }

  // ── Auto-start on map load ────────────────────────────────────────────────────

  function _autoStart() {
    if (!_checkThree()) return;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!map) { global.setTimeout(_autoStart, 1500); return; }
    if (map.isStyleLoaded()) {
      start();
    } else {
      map.once('styledata', function () { global.setTimeout(start, 200); });
    }
  }
  global.setTimeout(_autoStart, 2000);

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.WorldSpaceVehicleLayer = Object.freeze({
    VERSION:        VERSION,
    start:          start,
    stop:           stop,
    isActive:       isActive,
    isRenderReady:  isRenderReady,
    setEnabled:     setEnabled,
    getEnabled:     getEnabled,
    startBeacon:       startBeacon,
    stopBeacon:        stopBeacon,
    setVisibilityMode:      setVisibilityMode,
    getVisibilityMode:      getVisibilityMode,
    getInstanceId:          function () { return INSTANCE_ID; },
    setUpsertTraceEnabled:  setUpsertTraceEnabled,
    getUpsertTraceState:    getUpsertTraceState,
    upsertVehicle:          upsertVehicle,
    removeVehicle: removeVehicle,
    clear:         clear,
    getState:      getState,
    getVisualState: getVisualState,
    setDebugMode:  setDebugMode,
    setDebugScale: setDebugScale,
  });

  console.log('[WorldSpaceVehicleLayer] v' + VERSION + ' loaded — THREE: ' + !!global.THREE);

})(window);
