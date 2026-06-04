// ── WorldSpaceVehicleLayer v1.1.0 ─────────────────────────────────────────────
// 0531M_WOS_WorldSpaceVehicleShapeCalibration_v1.0.0
// Prior: 0531J_WOS_WorldSpaceVehicleLayer_v1.0.0
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
  var VERSION = '1.30.0';

  // ── Constants ─────────────────────────────────────────────────────────────────
  var LAYER_ID         = 'wos-world-space-vehicles';
  var ALTITUDE_M       = 0.35;    // slight lift prevents z-fighting on road surface
  var WORLD_VEHICLE_SCALE = 1.0;  // debug multiplier; real size from meterInMercator*

  // ── LOD + scale authority (0601A) ─────────────────────────────────────────────
  // Readability compensation, not physical simulation. Centralized so thresholds
  // and multipliers live in one place.
  var LOD_NEAR_Z = 16.5;   // zoom ≥ → near
  var LOD_MID_Z  = 14.5;   // zoom ≥ → mid
  var LOD_FAR_Z  = 12.5;   // zoom ≥ → far ; below → tiny

  var ZOOM_SCALE   = { near: 1.00, mid: 1.35, far: 2.20, tiny: 3.50 };
  var TYPE_SCALE   = { hero_car: 1.25, traffic_car: 1.00, box_truck: 1.45 };
  var PROFILE_SCALE = {
    Low: 0.85, Drone: 1.00, Urban: 1.20, Rooftop: 1.45, Regional: 2.00, Cruise: 2.50,
  };
  var SCALE_MIN = 0.65;
  var SCALE_MAX = 8.0;

  var _adaptiveLOD      = true;
  var _lastScaleResolve = null;
  var _lodCounts        = { near: 0, mid: 0, far: 0, tiny: 0 };
  var _scaleWarnedAt    = 0;

  // ── Depth + silhouette authority (0601D) ──────────────────────────────────────
  // Central per-class dimensions (metres). Footprint = width/length;
  // vertical = chassis/cabin/cargo heights. Builders read these — no hardcoded sizes.
  var VEHICLE_DIMS = {
    hero_car:    { width: 3.4, length: 6.8, chassisHeight: 0.75, cabinHeight: 1.25, cabinZ: 1.15 },
    traffic_car: { width: 3.0, length: 6.2, chassisHeight: 0.65, cabinHeight: 1.05, cabinZ: 1.00 },
    box_truck:   { width: 3.8, length: 9.5, cabHeight: 1.70, cargoHeight: 2.40, cargoZ: 1.45, cabLen: 2.6 },
  };

  // Camera-profile vertical exaggeration (applied to Z scale only, not footprint).
  var DEPTH_PROFILE = { Low: 1.00, Drone: 1.10, Urban: 1.20, Rooftop: 1.35, Regional: 1.50, Cruise: 1.65 };

  var _depthEnabled  = true;   // depth-enhanced meshes on by default
  var _depthWarnedAt = 0;

  // ── Actor visibility stability (0601T) ────────────────────────────────────────
  // Hero must not shrink/grow as camera presets change. Debug visibilityBoost
  // raises minimum finalScale so showcase actors are unmistakably readable.
  var HERO_MIN_FINAL_SCALE = 1.8;   // hero floor at all times
  var _visibilityBoost     = false; // debug/showcase only
  var BOOST_MIN = { hero: 2.0, traffic_car: 3.0, box_truck: 3.8 };

  // ── Hero grade / draw policy (0601Z → 0602A) ──────────────────────────────────
  // 0602A: default is NO LONGER always-on. Forcing the hero above all geometry
  // broke underpass truth (hero floated over bridge decks). Grade modes:
  //   'road'     — normal depth; hero passes under real 3D geometry (DEFAULT)
  //   'visual'   — small Z lift only, normal depth/renderOrder (subtle pop)
  //   'alwaysOn' — debug-only forced visibility (depthTest off, renderOrder 1000)
  var _heroGradeMode = 'road';
  var _heroAlwaysOn = false;          // mirrors (_heroGradeMode === 'alwaysOn')
  var HERO_VISUAL_LIFT = 0.6;         // local-Y-up units lifted in 'visual' mode

  // ── Traffic beacon (0601U) ────────────────────────────────────────────────────
  // showcase-road actors render as bright, depth-test-free blocks — impossible to
  // miss. Diagnostic/showcase only; hero is never affected.
  var _trafficBeaconMode = false;
  var BEACON_COLORS = [0xff3b30, 0xffcc00, 0x34c759, 0x0a84ff, 0xff2d95, 0xff9500];

  // ── 3D primitive proof (0601G) ────────────────────────────────────────────────
  // Separate diagnostic toggle — does NOT replace shapeMode/vehicle builders.
  // Renders deliberately chunky multi-face boxes to prove physical 3D volume.
  var _primitive3d          = false;
  var _primitive3dForceNear = true;   // force near-tier geometry at all zooms
  var _lastPrimitiveBuild   = null;
  var _lastPrimitiveError   = null;

  // Primitive proof dimensions (metres) — chunky on purpose.
  var PRIM_CAR = {
    width: 3.2, length: 6.4, chassisHeight: 0.9,
    cabinWidth: 2.2, cabinLength: 2.8, cabinHeight: 1.5, roofZ: 2.1,
  };
  var PRIM_TRUCK = {
    width: 3.8, length: 10.5, cabLength: 3.0, cargoLength: 6.8,
    cabHeight: 2.0, cargoHeight: 3.0, cargoZ: 1.5,
  };

  // Temporary high-contrast proof colours (diagnostic, not final art).
  var PRIM_COLORS = {
    car:   0xd23a34,   // red
    truck: 0xe6e6e6,   // light grey
    glass: 0x10141c,   // near-black blue
    wheel: 0x111111,
    nose:  0xffd34d,
  };

  function _dims(actorType) { return VEHICLE_DIMS[actorType] || VEHICLE_DIMS.traffic_car; }

  // Vertical exaggeration from the current camera profile (default 1.0).
  function _depthMultiplier() {
    var p = _currentCameraProfile();
    return (p && DEPTH_PROFILE[p] != null) ? DEPTH_PROFILE[p] : 1.0;
  }

  // Real-world vehicle dimensions in metres
  var DIMS = {
    hero_car:    { len: 4.5,  wid: 2.0, ht: 1.5, cabLen: 2.1 },
    traffic_car: { len: 4.2,  wid: 1.9, ht: 1.4, cabLen: 2.0 },
    box_truck:   { len: 8.5,  wid: 2.6, ht: 3.2, cabLen: 2.5 },
  };

  // ── Visual identity (0601C) ───────────────────────────────────────────────────
  // All colours/decals resolve through VehicleVisualRegistry — no hardcoded
  // vehicle colours below this point. Legacy COLORS kept only as last-resort.
  var COLORS = {
    sedan_red:             0xc8352e,
    sedan_dark:            0x3d4a5c,
    sedan_light:           0xc4c8cc,
    taxi_yellow:           0xf7c800,
    clean_white:           0xf4f4f4,
    weathered:             0xcdc9c1,
    sticker_graffiti_test: 0xf4f4f4,
  };

  // Resolve the full visual profile for an actor. Always returns ints + flags.
  function _visual(actorType, variant) {
    var reg = global.SBE && SBE.VehicleVisualRegistry;
    if (reg && typeof reg.resolve === 'function') return reg.resolve(actorType, variant);
    // Fallback if registry not loaded: derive from legacy COLORS
    var body = COLORS[variant] || 0x8899aa;
    var r = ((body >> 16) & 0xff), g = ((body >> 8) & 0xff), b = (body & 0xff);
    var roof = (Math.round(r * 0.7) << 16) | (Math.round(g * 0.7) << 8) | Math.round(b * 0.7);
    return { body: body, roof: roof, glass: 0x2b2f36, accent: 0xffd34d, cargo: body,
             graffiti: variant === 'sticker_graffiti_test', sign: variant === 'taxi_yellow',
             beltline: variant === 'taxi_yellow', visualProfile: actorType + ':' + variant };
  }

  // Legacy helpers retained for the old _buildCarMesh production path.
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
  var _scene      = null;     // back-compat registry scene (kept for isRenderReady)
  var _meshes     = {};      // id → THREE.Group
  var _scenes     = {};      // id → THREE.Scene (per-object, 0601J modelMatrix path)
  var _vehicles   = {};      // id → last upserted state
  var _visMode    = 'vehicle';  // 'block'|'slab'|'wedge'|'vehicle'
  var _shapeScale = 1.0;        // debug multiplier applied after meterInMercator
  var _lastShapeBuild      = null;
  var _lastShapeBuildError = null;
  var _enabled    = false;   // opt-in; DOM markers remain until explicitly enabled
  var _active     = false;

  // ── Transform migration (0601J) ───────────────────────────────────────────────
  // 'modelMatrix'  — canonical Mapbox path (per-object: projMat = mapbox × model).
  //                  Mesh stays at origin; world placement lives in the model matrix.
  // 'vehicleMatrix'— legacy path (mesh positioned in mercator; projMat = fromArray).
  var _transformMode      = 'modelMatrix';   // new production default
  var _lastTransformMode  = null;
  var _lastTransformError = null;
  var _renderCount        = 0;
  var _lastRenderAt       = 0;

  // ── Render-visibility truth (0601K) ───────────────────────────────────────────
  // transformed ≠ rendered ≠ visible. These track per-render-pass truth so debug
  // never claims visibility from transform success alone.
  var _lastRenderedVehicleId  = null;
  var _lastRenderObjectCount  = 0;
  var _lastRenderSkippedCount = 0;

  // ── Render pass audit (0601L) ─────────────────────────────────────────────────
  // Tracks whether Mapbox is actually invoking the custom layer render callback,
  // even when the callback exits early before per-mesh rendering.
  var _renderPassCount          = 0;
  var _lastRenderPassAt         = 0;
  var _renderEarlyReturnReason  = null;
  var _lastRenderAuditSnapshot  = null;

  // ── Enable/disable forensic audit (0602C) ─────────────────────────────────────
  // Forensic-only: records WHO/WHEN/WHY the layer's _enabled state transitions and
  // why the render callback exits early. No behavior change — capture only.
  var _lastEnableTime    = null;
  var _lastDisableTime   = null;
  var _lastEnableCaller  = null;
  var _lastDisableCaller = null;
  var _enableCount       = 0;
  var _disableCount      = 0;
  var _earlyReturnCount     = 0;
  var _lastEarlyReturnReason = null;
  var _lastEarlyReturnAt     = null;

  function _captureStack(label) {
    try { return new Error(label || 'WorldSpaceVehicleLayer audit').stack || null; }
    catch (e) { return null; }
  }
  function _recordEarlyReturn(reason) {
    _earlyReturnCount += 1;
    _lastEarlyReturnReason = reason || 'unknown';
    _lastEarlyReturnAt = Date.now();
  }
  function _detectHeroRuntime() {
    try {
      return !!(global.SBE && global.SBE.HeroVehicleRuntime &&
        typeof global.SBE.HeroVehicleRuntime.getEntity === 'function' &&
        global.SBE.HeroVehicleRuntime.getEntity());
    } catch (e) { return false; }
  }
  function _detectTrafficRuntime() {
    try {
      return !!(global.SBE && global.SBE.TrafficRuntime &&
        typeof global.SBE.TrafficRuntime.getState === 'function');
    } catch (e) { return false; }
  }

  // Explicit heading offset constant — change here only, never buried in geometry
  var VEHICLE_HEADING_OFFSET_DEG = 0;

  // ── Instance identity ─────────────────────────────────────────────────────────
  var INSTANCE_ID = 'wsl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

  // ── Upsert trace ──────────────────────────────────────────────────────────────
  var _upsertTraceEnabled    = false;
  var _lastUpsertTraceAt     = 0;
  var UPSERT_TRACE_INTERVAL  = 1000;
  var _lastUpsertFailure     = null;
  var _lastUpsertSuccess     = null;

  // ── Transform trace — proves live motion authority is still applying ──────────
  var _lastTransformAt       = 0;
  var _lastTransformPayload  = null;

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
  // Vehicle visual convention: local +Y is the front / travel-facing nose.
  // Heading math remains unchanged; geometry conforms to the heading system.
  // All car and truck builders (near + LOD tokens) follow this convention.

  // MeshBasicMaterial — light-independent, always visible regardless of scene lighting
  function _matBasic(color, opts) {
    var THREE = global.THREE;
    opts = opts || {};
    return new THREE.MeshBasicMaterial({
      color:       color,
      transparent: opts.transparent || false,
      opacity:     opts.opacity != null ? opts.opacity : 1.0,
      side:        opts.side || THREE.FrontSide,
    });
  }

  // Legacy Lambert material kept for old vehicle mesh paths
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

  // Record last successful shape build for diagnostics
  function _recordShapeBuild(mode, actorType, variant, dims) {
    _lastShapeBuild = {
      mode: mode, actorType: actorType, variant: variant,
      dimensionsMeters: dims, timestamp: Date.now(),
    };
    _lastShapeBuildError = null;
  }

  function _recordShapeBuildError(mode, err) {
    _lastShapeBuildError = {
      mode: mode, message: err && err.message ? err.message : String(err), timestamp: Date.now(),
    };
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

    // 0602E — body geometry now points the SAME way as heading/headlights/nose:
    // local +Y is the front (travel-forward). Hood leads at +Y, windshield sits
    // just behind it, the cabin/roof asymmetry trails toward −Y, and a rear
    // window closes the back. Only geometry offsets/tilts flipped — no heading
    // math, rotation.z, offset, camera, route, or runtime changes.

    // Cabin roof — narrower, sits on top of chassis, biased toward the rear (−Y)
    var cab = new THREE.Mesh(
      _box(W * 0.85, L * 0.52, H * 0.44),
      _mat(_roofColor(variant))
    );
    cab.position.set(0, L * 0.04, H * 0.5 + H * 0.22);
    g.add(cab);

    // Windshield — front glass pane at the leading edge (+Y), tilted back
    var wind = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.72, H * 0.32),
      _mat(0xbee8ff, { transparent: true, opacity: 0.65, side: THREE.DoubleSide })
    );
    wind.position.set(0, (L * 0.26 + H * 0.08), H * 0.5 + H * 0.18);
    wind.rotation.x = 0.38;
    g.add(wind);

    // Rear window — trailing glass pane (−Y), tilted the opposite way
    var rwin = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.70, H * 0.28),
      _mat(0xbee8ff, { transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    rwin.position.set(0, -(L * 0.26 + H * 0.06), H * 0.5 + H * 0.16);
    rwin.rotation.x = -0.42;
    g.add(rwin);

    // Hood plane — darker, leading front quarter (+Y)
    var hood = new THREE.Mesh(
      _box(W * 0.94, L * 0.22, H * 0.06),
      _mat(_bodyColor(variant))
    );
    hood.position.set(0, (L * 0.39), H * 0.5 + H * 0.03);
    g.add(hood);

    // 0602A-D — front/back light cues. Travel direction is local +Y (the model
    // matrix's −Y scale flip maps +Y → north/up-screen), so the lit FRONT fascia
    // and heading cue sit at +L/2 and red taillights at −L/2. Heading math
    // (mesh.rotation.z = −headingDeg) is unchanged; only the visual cues moved.
    var cue = new THREE.Mesh(
      new THREE.ConeGeometry(W * 0.13, L * 0.13, 3),
      _mat(0xffd34d)
    );
    cue.rotation.x = -Math.PI / 2;  // point along +Y (travel-forward)
    cue.position.set(0, (L * 0.5 + L * 0.04), H * 0.28);
    g.add(cue);

    // White headlights at the front fascia (+L/2)
    var hlGeo = _box(W * 0.16, L * 0.05, H * 0.12);
    var hlMat = _mat(0xfff6d8);
    [ W * 0.30, -W * 0.30 ].forEach(function (x) {
      var hl = new THREE.Mesh(hlGeo, hlMat);
      hl.position.set(x, L * 0.49, H * 0.22);
      g.add(hl);
    });

    // Red taillights at the rear (−L/2)
    var tlGeo = _box(W * 0.16, L * 0.05, H * 0.12);
    var tlMat = _mat(0xff2a2a);
    [ W * 0.30, -W * 0.30 ].forEach(function (x) {
      var tl = new THREE.Mesh(tlGeo, tlMat);
      tl.position.set(x, -L * 0.49, H * 0.22);
      g.add(tl);
    });

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
    var d    = _dims('box_truck');
    var df   = _depthEnabled ? 1.0 : 0.6;   // flatter when depth disabled
    var W    = d.width, L = d.length, CL = d.cabLen;
    var H    = d.cargoHeight * df;           // cargo box height (tall, obvious)
    var cabH = d.cabHeight   * df;           // cab height (shorter than cargo)
    var boxL = L - CL;
    var g    = new THREE.Group();

    // 0602H — Truck visual convention: local +Y is front / travel-forward.
    // Cab occupies the +Y front. Cargo and rear door trail toward −Y.
    // Heading math remains unchanged.
    // Cab occupies front (+Y): y ∈ [+L/2−CL, +L/2]
    // Cargo occupies rear (−Y): y ∈ [−L/2, +L/2−CL]

    var cabCentreY  = (L / 2) - CL / 2;
    var boxCentreY  = (L / 2) - CL - boxL / 2;

    var vis = _visual('box_truck', variant);

    // Contact shadow — large, anchors the heavy body
    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.6, L + 0.6),
      _matBasic(vis.shadow, { transparent: true, opacity: 0.34 })
    );
    shadow.position.z = 0.01; g.add(shadow);

    // Cargo box — tall volume (clear height vs cars)
    var cargoBody = new THREE.Mesh(
      _box(W, boxL, H),
      _matBasic(vis.cargo)
    );
    cargoBody.position.set(0, boxCentreY, H / 2);
    g.add(cargoBody);

    // Cargo side-face contrast strips
    var cSideGeo = new THREE.BoxGeometry(0.07, boxL * 0.94, H * 0.7);
    [ W * 0.5, -W * 0.5 ].forEach(function (x) {
      var strip = new THREE.Mesh(cSideGeo, _matBasic(vis.side));
      strip.position.set(x, boxCentreY, H * 0.5); g.add(strip);
    });

    // Rear door cue — recessed panel at the tail (−Y, trailing)
    var rearDoor = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.88, 0.08, H * 0.82),
      _matBasic(0x3a3d42)
    );
    rearDoor.position.set(0, -(L / 2) + 0.05, H * 0.45);
    g.add(rearDoor);

    // Side panel cue — subtle seam line down each cargo flank
    [ W / 2 + 0.01, -(W / 2 + 0.01) ].forEach(function (x) {
      var seam = new THREE.Mesh(
        new THREE.PlaneGeometry(boxL * 0.92, H * 0.6),
        _matBasic(vis.accent, { transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      seam.rotation.y = Math.PI / 2;
      seam.position.set(x, boxCentreY, H * 0.52);
      g.add(seam);
    });

    // Graffiti art panels on cargo right side (registry flag)
    if (vis.graffiti) {
      var grafColors = [0xe63e2a, 0x2b8cde, 0xf5c518, 0x3ab56f];
      var panH = H * 0.35, panL = boxL * 0.28;
      grafColors.forEach(function (c, i) {
        var panel = new THREE.Mesh(
          new THREE.PlaneGeometry(panL, panH),
          _matBasic(c, { side: THREE.DoubleSide })
        );
        panel.rotation.y = Math.PI / 2;
        panel.position.set(
          W / 2 + 0.02,
          boxCentreY + (i - 1.5) * boxL * 0.24,
          H * 0.62
        );
        g.add(panel);
      });
    }

    // Cab block — shorter than cargo (separate volume), registry roof colour
    var cab = new THREE.Mesh(
      _box(W, CL, cabH),
      _matBasic(vis.roof)
    );
    cab.position.set(0, cabCentreY, cabH * 0.5);
    g.add(cab);

    // Cab–cargo separation shadow stripe (full cargo height)
    var seam = new THREE.Mesh(
      _box(W + 0.02, 0.06, H + 0.02),
      _matBasic(0x111111)
    );
    seam.position.set(0, (L / 2) - CL, H / 2);
    g.add(seam);

    // Windshield (registry glass colour) — on the cab
    var wind = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.76, cabH * 0.4),
      _matBasic(vis.glass, { transparent: true, opacity: 0.6, side: THREE.DoubleSide })
    );
    wind.rotation.x = 0.28;
    wind.position.set(0, (L / 2 - 0.15), cabH * 0.78);
    g.add(wind);

    // Heading cue — white chevron at cab nose (+Y, travel-forward)
    var cue = new THREE.Mesh(
      new THREE.ConeGeometry(W * 0.1, CL * 0.18, 3),
      _matBasic(0xffffff)
    );
    cue.rotation.x = -Math.PI / 2;
    cue.position.set(0, (L / 2 + 0.08), cabH * 0.55);
    g.add(cue);

    // 6 wheels (steer pair + 2 drive axles)
    var wR = 0.43, wT = W * 0.14;
    var wGeo = new THREE.CylinderGeometry(wR, wR, wT, 8);
    var wMat = _matBasic(0x1a1a1a);
    // Steer axle near the cab (+Y front); two drive axles under the cargo box.
    [
      [ W * 0.5 + wT * 0.5, cabCentreY - CL * 0.20,  0 ],
      [-W * 0.5 - wT * 0.5, cabCentreY - CL * 0.20,  0 ],
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

    _recordShapeBuild('truck', 'box_truck', variant, { w: W, l: L, h: H });
    return g;
  }

  // ── Shape mode mesh builders (all use MeshBasicMaterial) ─────────────────────
  // Nose faces -Y. Rotation: mesh.rotation.z = -headingDeg × π/180.
  // All dimensions in real-world metres. Scale applied via _applyTransform.

  // MODE: block — diagnostic proof-of-position tower
  // 20m long × 10m wide × 8m tall. Constitutional debug infrastructure.
  function _buildBlockMesh(actorType, variant) {
    var THREE = global.THREE;
    var g   = new THREE.Group();
    var box = new THREE.Mesh(
      new THREE.BoxGeometry(10, 20, 8),
      _matBasic(0xff2222)
    );
    box.position.z = 4;   // base flush on road, centre at 4m
    g.add(box);
    _recordShapeBuild('block', actorType, variant, { w: 10, l: 20, h: 8 });
    return g;
  }

  // MODE: slab — scaled-down footprint proof
  // 4m wide × 8m long × 1.2m tall. Flat but still visible.
  function _buildSlabMesh(actorType, variant) {
    var THREE = global.THREE;
    var g   = new THREE.Group();
    var box = new THREE.Mesh(
      new THREE.BoxGeometry(4, 8, 1.2),
      _matBasic(0xff2222)
    );
    box.position.z = 0.6;   // base at z=0, centre at 0.6m
    g.add(box);
    _recordShapeBuild('slab', actorType, variant, { w: 4, l: 8, h: 1.2 });
    return g;
  }

  // MODE: wedge — directional vehicle primitive
  // Chassis + roof block + nose cue + windshield cue. Tests 2.5D language.
  function _buildWedgeMesh(actorType, variant) {
    var THREE = global.THREE;
    var g = new THREE.Group();

    // Chassis base — full footprint
    var chassis = new THREE.Mesh(
      new THREE.BoxGeometry(4, 8, 1.2),
      _matBasic(0xcc1111)
    );
    chassis.position.z = 0.6;
    g.add(chassis);

    // Roof/cabin block — forward of centre
    var roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 3, 1.0),
      _matBasic(0x880000)
    );
    roof.position.set(0, -0.5, 1.6);   // slightly toward nose, sitting on chassis top
    g.add(roof);

    // Yellow nose direction cue — cone pointing in -Y (forward)
    var noseCue = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.2, 4),
      _matBasic(0xffd34d)
    );
    noseCue.rotation.x = Math.PI / 2;   // point along -Y
    noseCue.position.set(0, -4.6, 0.6);
    g.add(noseCue);

    // Windshield cue — dark plane at front of cabin
    var wind = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.8),
      _matBasic(0x1a2a3a, { side: THREE.DoubleSide })
    );
    wind.rotation.x = -0.4;
    wind.position.set(0, -2.1, 1.45);
    g.add(wind);

    _recordShapeBuild('wedge', actorType, variant, { w: 4, l: 8, h: 2.1 });
    return g;
  }

  // MODE: vehicle — near-LOD 2.5D passenger vehicle, registry-driven identity.
  // Hero gets a dominant silhouette (longer roofline, taller glass band, brighter
  // headlight/taillight cues). Traffic sedans use a compact cabin. Taxi adds a
  // roof sign + dark beltline. All colours from VehicleVisualRegistry.
  function _buildVehicleMesh(actorType, variant) {
    var THREE = global.THREE;
    var isHero = (actorType === 'hero_car');
    var d   = _dims(actorType);
    var W   = d.width, L = d.length;
    var vis = _visual(actorType, variant);
    var g   = new THREE.Group();

    // Depth gate: full heights when enabled, ~55% when disabled (flatter legacy look)
    var df = _depthEnabled ? 1.0 : 0.55;
    var chassisH = d.chassisHeight * df;
    var cabinH   = d.cabinHeight   * df;
    var cabinZ   = chassisH + cabinH * 0.5;   // cabin sits on chassis top
    var cabLen   = isHero ? L * 0.56 : L * 0.48;

    // Contact shadow — anchors the body (stronger for hero)
    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.5, L + 0.5),
      _matBasic(vis.shadow, { transparent: true, opacity: isHero ? 0.32 : 0.24 })
    );
    shadow.position.z = 0.01; g.add(shadow);

    // Chassis — raised box (top + 4 side faces give volume)
    var chassis = new THREE.Mesh(new THREE.BoxGeometry(W, L, chassisH), _matBasic(vis.body));
    chassis.position.z = chassisH * 0.5; g.add(chassis);

    // Side-face contrast strips — darker band along each flank to read the side
    var sideStripGeo = new THREE.BoxGeometry(0.06, L * 0.92, chassisH * 0.6);
    [ W * 0.5, -W * 0.5 ].forEach(function (x) {
      var strip = new THREE.Mesh(sideStripGeo, _matBasic(vis.side));
      strip.position.set(x, 0, chassisH * 0.45); g.add(strip);
    });

    // 0602F — active WSL mesh now faces local +Y as the visual front, matching
    // _buildCarMesh (0602E), the 0602A light cues, getHeroForwardBearingDeg, and
    // heroHeadingAudit. Front fascia/hood/headlights/nose lead at +Y; rear
    // fascia/taillights/rear-glass trail at −Y. No heading/rotation/offset change.

    // Cabin — raised volume; biased toward −Y so it visually TRAILS the front.
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, cabLen, cabinH), _matBasic(vis.roof));
    cabin.position.set(0, -L * 0.05, cabinZ); g.add(cabin);

    // Front cue plane — darker fascia at the nose (+Y, leading)
    var front = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.08, chassisH * 0.8),
      _matBasic(vis.front));
    front.position.set(0, (L * 0.5 - 0.04), chassisH * 0.5); g.add(front);

    // Rear cue plane — darker fascia at the tail (−Y, trailing)
    var rear = new THREE.Mesh(new THREE.BoxGeometry(W * 0.96, 0.08, chassisH * 0.8),
      _matBasic(vis.rear));
    rear.position.set(0, -(L * 0.5 - 0.04), chassisH * 0.5); g.add(rear);

    // Front windshield (+Y side of cabin) + rear window (−Y side)
    var windH = (isHero ? 0.72 : 0.6) * df;
    var windF = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.7, windH),
      _matBasic(vis.glass, { transparent: true, opacity: 0.78, side: THREE.DoubleSide }));
    windF.rotation.x = 0.42;
    windF.position.set(0, (cabLen * 0.5 + 0.05) - L * 0.05, cabinZ + cabinH * 0.05); g.add(windF);

    var windR = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.62, windH * 0.8),
      _matBasic(vis.glass, { transparent: true, opacity: 0.68, side: THREE.DoubleSide }));
    windR.rotation.x = -0.38;
    windR.position.set(0, -(cabLen * 0.45) - L * 0.05, cabinZ); g.add(windR);

    // Side glass suggestion (hero only) — thin glass strip along cabin flanks
    if (isHero) {
      var sgGeo = new THREE.BoxGeometry(0.04, cabLen * 0.7, cabinH * 0.45);
      [ W * 0.41, -W * 0.41 ].forEach(function (x) {
        var sg = new THREE.Mesh(sgGeo, _matBasic(vis.glass, { transparent: true, opacity: 0.55 }));
        sg.position.set(x, -L * 0.05, cabinZ + cabinH * 0.05); g.add(sg);
      });
    }

    // Headlight cues (accent, +Y front) + taillight cues (red, −Y rear)
    var hlMat = _matBasic(isHero ? 0xfff4c2 : vis.accent);
    [ W * 0.32, -W * 0.32 ].forEach(function (x) {
      var hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.2), hlMat);
      hl.position.set(x, (L * 0.5 - 0.08), chassisH * 0.6); g.add(hl);
    });
    var tlMat = _matBasic(0xcc2222);
    [ W * 0.32, -W * 0.32 ].forEach(function (x) {
      var tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.18), tlMat);
      tl.position.set(x, -(L * 0.5 - 0.06), chassisH * 0.6); g.add(tl);
    });

    // Heading cue — accent cone at nose tip (+Y, pointing +Y/forward)
    var noseCue = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), _matBasic(0xffd34d));
    noseCue.rotation.x = -Math.PI / 2;
    noseCue.position.set(0, (L * 0.5 + 0.2), chassisH * 0.7); g.add(noseCue);

    // Taxi — roof sign raised above cabin + dark beltline
    if (vis.sign) {
      var signTop = cabinZ + cabinH * 0.5 + 0.2;
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.35), _matBasic(0x111111));
      sign.position.set(0, -L * 0.02, signTop); g.add(sign);
      var signFace = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.22), _matBasic(0xffd34d));
      signFace.position.set(0, -L * 0.02 + 0.26, signTop); g.add(signFace);
    }
    if (vis.beltline) {
      var belt = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, L * 0.7, 0.12), _matBasic(0x111111));
      belt.position.set(0, 0, chassisH * 0.95); g.add(belt);
    }

    // Wheel marks — anchor the body to the surface
    var wGeo = new THREE.BoxGeometry(0.5, 0.9, 0.08);
    var wMat = _matBasic(0x111111);
    [
      [ W * 0.46,  L * 0.30, 0.04 ], [-W * 0.46,  L * 0.30, 0.04 ],
      [ W * 0.46, -L * 0.30, 0.04 ], [-W * 0.46, -L * 0.30, 0.04 ],
    ].forEach(function (p) {
      var w = new THREE.Mesh(wGeo, wMat);
      w.position.set(p[0], p[1], p[2]); g.add(w);
    });

    _recordShapeBuild('vehicle', actorType, variant, { w: W, l: L, h: chassisH + cabinH });
    return g;
  }

  // ── LOD vehicle builders (0601A) ──────────────────────────────────────────────
  // near → full mesh (_buildVehicleMesh). mid/far/tiny simplify progressively.

  // mid: chassis + cabin + nose cue + shadow + taxi sign (registry colours)
  function _buildVehicleMeshMid(actorType, variant) {
    var THREE = global.THREE;
    var isHero = (actorType === 'hero_car');
    var W = isHero ? 3.3 : 3.0, L = isHero ? 6.8 : 6.2;
    var vis = _visual(actorType, variant);
    var g = new THREE.Group();

    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, L + 0.4),
      _matBasic(0x000000, { transparent: true, opacity: isHero ? 0.28 : 0.20 }));
    shadow.position.z = 0.01; g.add(shadow);

    var chassis = new THREE.Mesh(new THREE.BoxGeometry(W, L, 0.7), _matBasic(vis.body));
    chassis.position.z = 0.35; g.add(chassis);

    var cabLen = isHero ? L * 0.56 : L * 0.48;
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, cabLen, 0.9), _matBasic(vis.roof));
    cabin.position.set(0, -L * 0.05, 1.2); g.add(cabin);

    // Glass hint band (kept simple at mid)
    var glass = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, cabLen * 0.5, 0.5),
      _matBasic(vis.glass, { transparent: true, opacity: 0.6 }));
    glass.position.set(0, -L * 0.12, 1.35); g.add(glass);

    if (vis.sign) {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.35), _matBasic(0xffd34d));
      sign.position.set(0, -L * 0.02, 1.85); g.add(sign);
    }

    // Heading cue — accent cone at nose tip (+Y, travel-forward)
    var noseCue = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 4), _matBasic(0xffd34d));
    noseCue.rotation.x = -Math.PI / 2;
    noseCue.position.set(0, (L * 0.5 + 0.2), 0.45); g.add(noseCue);

    _recordShapeBuild('vehicle:mid', actorType, variant, { w: W, l: L, h: 2.0 });
    return g;
  }

  // far: elongated slab in actor colour + nose cue + taxi sign (identity at far)
  function _buildVehicleFar(actorType, variant) {
    var THREE = global.THREE;
    var isHero = (actorType === 'hero_car');
    var W = isHero ? 3.4 : 3.1, L = isHero ? 6.9 : 6.3;
    var vis = _visual(actorType, variant);
    var g = new THREE.Group();
    var slab = new THREE.Mesh(new THREE.BoxGeometry(W, L, 1.0), _matBasic(vis.body));
    slab.position.z = 0.5; g.add(slab);
    // Taxi keeps a roof sign block so it stays identifiable at far range
    if (vis.sign) {
      var sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.4), _matBasic(0x111111));
      sign.position.set(0, 0, 1.15); g.add(sign);
    }
    // Heading cue — accent cone at nose tip (+Y, travel-forward)
    var noseCue = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), _matBasic(0xffd34d));
    noseCue.rotation.x = -Math.PI / 2;
    noseCue.position.set(0, (L * 0.5 + 0.1), 0.5); g.add(noseCue);
    _recordShapeBuild('vehicle:far', actorType, variant, { w: W, l: L, h: 1.0 });
    return g;
  }

  // tiny: simple token lozenge + heading cue, registry colour
  function _buildVehicleTiny(actorType, variant) {
    var THREE = global.THREE;
    var isHero = (actorType === 'hero_car');
    var W = isHero ? 3.7 : 3.4, L = isHero ? 7.4 : 6.8;
    var vis = _visual(actorType, variant);
    var g = new THREE.Group();
    var token = new THREE.Mesh(new THREE.BoxGeometry(W, L, 0.8), _matBasic(vis.body));
    token.position.z = 0.4; g.add(token);
    // Heading cue — accent cone at nose tip (+Y, travel-forward)
    var cue = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.0, 3), _matBasic(0xffd34d));
    cue.rotation.x = -Math.PI / 2;
    cue.position.set(0, (L * 0.5), 0.4); g.add(cue);
    _recordShapeBuild('vehicle:tiny', actorType, variant, { w: W, l: L, h: 0.8 });
    return g;
  }

  // far/tiny truck: longer slab token in cargo colour (always larger than cars)
  function _buildTruckToken(variant, lodTier) {
    var THREE = global.THREE;
    var W = 2.8, L = (lodTier === 'tiny') ? 9.5 : 8.5;
    var vis = _visual('box_truck', variant);
    var g = new THREE.Group();
    var box = new THREE.Mesh(new THREE.BoxGeometry(W, L, 1.4), _matBasic(vis.cargo));
    box.position.z = 0.7; g.add(box);
    // Heading cue — accent cone at nose tip (+Y, travel-forward)
    var cue = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 3), _matBasic(0xffffff));
    cue.rotation.x = -Math.PI / 2;
    cue.position.set(0, (L * 0.5), 0.7); g.add(cue);
    _recordShapeBuild('truck:' + lodTier, 'box_truck', variant, { w: W, l: L, h: 1.4 });
    return g;
  }

  function _buildVehicleLOD(actorType, variant, lodTier) {
    if (lodTier === 'mid')  return _buildVehicleMeshMid(actorType, variant);
    if (lodTier === 'far')  return _buildVehicleFar(actorType, variant);
    if (lodTier === 'tiny') return _buildVehicleTiny(actorType, variant);
    return _buildVehicleMesh(actorType, variant);   // near (full)
  }

  function _buildTruckLOD(variant, lodTier) {
    if (lodTier === 'far' || lodTier === 'tiny') return _buildTruckToken(variant, lodTier);
    return _buildTruckMesh(variant);   // near / mid: full truck
  }

  // ── 3D primitive proof builders (0601G) ───────────────────────────────────────
  // Box face order for material arrays: [+X, -X, +Y, -Y, +Z, -Z].
  // Convention: nose at -Y (front), tail at +Y (rear).
  //   +Z = top/roof (lightest) · ±X = sides (darker) · -Y = front · +Y = rear (darkest)
  // Distinct per-face shades give unmistakable volume under MeshBasicMaterial.
  function _shade(color, f) {
    var r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
    f = Math.max(0, Math.min(2, f));
    function ch(v) { return Math.max(0, Math.min(255, Math.round(v * f))); }
    return (ch(r) << 16) | (ch(g) << 8) | ch(b);
  }
  function _faceMats(body) {
    var THREE = global.THREE;
    function m(c) { return new THREE.MeshBasicMaterial({ color: c }); }
    return [
      m(_shade(body, 0.72)),  // +X side
      m(_shade(body, 0.72)),  // -X side
      m(_shade(body, 0.42)),  // +Y rear (darkest)
      m(_shade(body, 0.58)),  // -Y front
      m(_shade(body, 1.15)),  // +Z top/roof (lightest)
      m(_shade(body, 0.50)),  // -Z bottom
    ];
  }
  function _faceBox(w, l, h, body) {
    var THREE = global.THREE;
    // BoxGeometry(width=X, height=Y, depth=Z) — we want X=w, Y=l(length), Z=h(height)
    var geo = new THREE.BoxGeometry(w, l, h);
    return new THREE.Mesh(geo, _faceMats(body));
  }

  function _buildPrimitiveCar(actorType, variant) {
    var THREE = global.THREE;
    var d = PRIM_CAR;
    var W = d.width, L = d.length;
    var body = PRIM_COLORS.car;
    var g = new THREE.Group();

    // Contact shadow at z=0.02
    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.6, L + 0.6),
      _matBasic(0x000000, { transparent: true, opacity: 0.3 })
    );
    shadow.position.z = 0.02; g.add(shadow);

    // Chassis box (raised)
    var chassis = _faceBox(W, L, d.chassisHeight, body);
    chassis.position.z = d.chassisHeight * 0.5 + 0.05; g.add(chassis);

    // Hood (front, lower) + rear body (lower) implied by chassis; add raised cabin
    var cabin = _faceBox(d.cabinWidth, d.cabinLength, d.cabinHeight, _shade(body, 0.85));
    cabin.position.set(0, -L * 0.04, d.chassisHeight + d.cabinHeight * 0.5 + 0.05);
    g.add(cabin);

    // Glass planes — front, rear, left, right
    var glassMat = function () { return _matBasic(PRIM_COLORS.glass, { side: THREE.DoubleSide }); };
    var cz = d.chassisHeight + d.cabinHeight * 0.55 + 0.05;
    var windF = new THREE.Mesh(new THREE.PlaneGeometry(d.cabinWidth * 0.92, d.cabinHeight * 0.7), glassMat());
    windF.rotation.x = -0.5; windF.position.set(0, -L * 0.04 - d.cabinLength * 0.5, cz); g.add(windF);
    var windR = new THREE.Mesh(new THREE.PlaneGeometry(d.cabinWidth * 0.92, d.cabinHeight * 0.6), glassMat());
    windR.rotation.x = 0.5; windR.position.set(0, -L * 0.04 + d.cabinLength * 0.5, cz); g.add(windR);
    [ d.cabinWidth * 0.5, -d.cabinWidth * 0.5 ].forEach(function (x) {
      var side = new THREE.Mesh(new THREE.PlaneGeometry(d.cabinLength * 0.85, d.cabinHeight * 0.6), glassMat());
      side.rotation.y = Math.PI / 2; side.position.set(x, -L * 0.04, cz); g.add(side);
    });

    // 4 wheel blocks
    var wMat = _matBasic(PRIM_COLORS.wheel);
    var wGeo = new THREE.BoxGeometry(0.6, 1.1, 0.7);
    [
      [ W * 0.5, -L * 0.3, 0.35 ], [-W * 0.5, -L * 0.3, 0.35 ],
      [ W * 0.5,  L * 0.3, 0.35 ], [-W * 0.5,  L * 0.3, 0.35 ],
    ].forEach(function (p) { var w = new THREE.Mesh(wGeo, wMat); w.position.set(p[0], p[1], p[2]); g.add(w); });

    // Nose cue
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 4), _matBasic(PRIM_COLORS.nose));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, -(L * 0.5 + 0.25), d.chassisHeight * 0.7); g.add(nose);

    _lastPrimitiveBuild = { kind: 'car', actorType: actorType, variant: variant, timestamp: Date.now() };
    _lastPrimitiveError = null;
    return g;
  }

  function _buildPrimitiveTruck(variant) {
    var THREE = global.THREE;
    var d = PRIM_TRUCK;
    var W = d.width, L = d.length, CL = d.cabLength, GL = d.cargoLength;
    var body = PRIM_COLORS.truck;
    var g = new THREE.Group();

    var cabCentreY = -(L / 2) + CL / 2;
    var boxCentreY = -(L / 2) + CL + GL / 2;

    // Shadow
    var shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.8, L + 0.8),
      _matBasic(0x000000, { transparent: true, opacity: 0.34 })
    );
    shadow.position.z = 0.02; g.add(shadow);

    // Cab box (shorter)
    var cab = _faceBox(W, CL, d.cabHeight, _shade(body, 0.8));
    cab.position.set(0, cabCentreY, d.cabHeight * 0.5 + 0.05); g.add(cab);

    // Cargo box (tall, large) — distinct faces (roof/side/rear door)
    var cargo = _faceBox(W, GL, d.cargoHeight, body);
    cargo.position.set(0, boxCentreY, d.cargoHeight * 0.5 + 0.05); g.add(cargo);

    // Rear door face (darkest) — a thin plane at the tail
    var rearDoor = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.9, d.cargoHeight * 0.85),
      _matBasic(_shade(body, 0.4), { side: THREE.DoubleSide })
    );
    rearDoor.position.set(0, (L / 2) - 0.02, d.cargoHeight * 0.5 + 0.05); g.add(rearDoor);

    // Cab windshield + side windows
    var glassMat = function () { return _matBasic(PRIM_COLORS.glass, { side: THREE.DoubleSide }); };
    var wind = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.82, d.cabHeight * 0.45), glassMat());
    wind.rotation.x = -0.35; wind.position.set(0, -(L / 2 - 0.1), d.cabHeight * 0.78); g.add(wind);
    [ W * 0.5, -W * 0.5 ].forEach(function (x) {
      var sw = new THREE.Mesh(new THREE.PlaneGeometry(CL * 0.7, d.cabHeight * 0.4), glassMat());
      sw.rotation.y = Math.PI / 2; sw.position.set(x, cabCentreY, d.cabHeight * 0.7); g.add(sw);
    });

    // 6 wheel blocks
    var wMat = _matBasic(PRIM_COLORS.wheel);
    var wGeo = new THREE.BoxGeometry(0.7, 1.3, 0.9);
    [
      [ W * 0.5, cabCentreY + CL * 0.2,  0.45 ], [-W * 0.5, cabCentreY + CL * 0.2,  0.45 ],
      [ W * 0.5, boxCentreY - GL * 0.28, 0.45 ], [-W * 0.5, boxCentreY - GL * 0.28, 0.45 ],
      [ W * 0.5, boxCentreY + GL * 0.28, 0.45 ], [-W * 0.5, boxCentreY + GL * 0.28, 0.45 ],
    ].forEach(function (p) { var w = new THREE.Mesh(wGeo, wMat); w.position.set(p[0], p[1], p[2]); g.add(w); });

    // Nose cue
    var nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 4), _matBasic(PRIM_COLORS.nose));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, -(L * 0.5 + 0.3), d.cabHeight * 0.6); g.add(nose);

    _lastPrimitiveBuild = { kind: 'truck', actorType: 'box_truck', variant: variant, timestamp: Date.now() };
    _lastPrimitiveError = null;
    return g;
  }

  // 0603E/G — station fallback colours (used when no ColorRegistry resolver).
  // State is DETERMINED UPSTREAM (Actor Render Authority); WSL only maps a given
  // state → colour. It never inspects truth or decides station state itself.
  var STATION_NODE_COLORS = {
    empty: 0xff4d4d, low: 0xffb84d, balanced: 0x37d67a,
    full: 0x4da3ff, stale: 0x9aa0a6, offline: 0x555555, unknown: 0xffffff,
  };
  function _stationColor(visualState) {
    return STATION_NODE_COLORS[visualState] != null ? STATION_NODE_COLORS[visualState] : STATION_NODE_COLORS.unknown;
  }

  // 0603G — directionless station marker. renderVariant picks the geometry tier:
  //   station_dot  → flat puck (city-scale)
  //   station_node → puck + pin + cap (neighbourhood)
  //   station_icon → node + halo ring (close)
  // NOT a vehicle: no wheels, headlights, heading cues, or car geometry.
  function _buildStationMesh(renderVariant, visualState, payload) {
    var THREE = global.THREE;
    var g = new THREE.Group();
    // 0603J — base hue from palette token; state hue overrides ACCENT only.
    var pal = _palette(payload);
    var baseColor = pal ? pal.body : _stationColor(visualState);
    var accentColor = _stationColor(visualState);   // availability-state accent
    var tier = (renderVariant === 'station_dot') ? 'dot'
             : (renderVariant === 'station_icon') ? 'icon' : 'node';

    // 0603K — ~20% larger puck/cap for easier location without hover.
    var radiusM = 1.68, heightM = 0.45;
    var puck = new THREE.Mesh(new THREE.CylinderGeometry(radiusM, radiusM, heightM, tier === 'dot' ? 10 : 16), _matBasic(baseColor));
    puck.rotation.x = Math.PI / 2;
    puck.position.z = heightM * 0.5;
    g.add(puck);

    if (tier !== 'dot') {
      var pinHeightM = 2.4, capRadiusM = 1.08;
      var pin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, pinHeightM, 8), _matBasic(baseColor));
      pin.rotation.x = Math.PI / 2; pin.position.z = heightM + pinHeightM * 0.5; g.add(pin);
      // Cap carries the availability-state accent colour.
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(capRadiusM, capRadiusM, 0.35, 12), _matBasic(accentColor));
      cap.rotation.x = Math.PI / 2; cap.position.z = heightM + pinHeightM; g.add(cap);
      if (tier === 'icon') {
        var halo = new THREE.Mesh(new THREE.TorusGeometry(radiusM * 1.5, 0.16, 6, 18),
          _matBasic(accentColor, { transparent: true, opacity: 0.6 }));
        halo.position.z = heightM + pinHeightM + 0.2; g.add(halo);
      }
    }

    g._stationState = visualState;
    _recordShapeBuild('station:' + tier, 'bike.station', renderVariant, { r: radiusM, tier: tier });
    return g;
  }

  // ── 0603J — Actor 2.5D presentation builders ──────────────────────────────────
  var SCALE_CLASS_MULTIPLIER = {
    'micro-infrastructure': 0.75, 'micro-vehicle': 0.65, 'small-road-vehicle': 1.0,
    'large-road-vehicle': 1.35, 'medium-heavy-vehicle': 1.45, 'large-marine': 1.8,
    'marine-variable': 1.5, 'rail-long': 1.8, 'sky-variable': 1.2,
    'marker': 0.9, 'prop': 1.0, 'standard': 1.0,
  };
  var SHADOW_OPACITY_BY_PRIORITY = {
    'background': 0.18, 'civic-utility': 0.24, 'public-transit': 0.28,
    'civic-service': 0.30, 'harbor-truth': 0.26, 'airspace-truth': 0.10,
  };
  function _scaleClassMul(scaleClass) {
    return SCALE_CLASS_MULTIPLIER[scaleClass] != null ? SCALE_CLASS_MULTIPLIER[scaleClass] : 1.0;
  }

  // 0603K — visibility tuning: per-silhouette readability boost (scale/shadow/
  // opacity). Applied ONCE during mesh construction / scale resolution; never
  // cumulative. Presentation only — does not touch truth or feeds.
  var ACTOR_VISIBILITY_PROFILE = {
    'city-bus':        { scale: 1.35, shadow: 1.20 },
    'utility-truck':   { scale: 1.25, shadow: 1.15 },
    'passenger-ferry': { scale: 1.15, shadow: 1.20 },
    'vessel-generic':  { scale: 1.10, shadow: 1.15 },
    'aircraft-light':  { scale: 1.50, shadow: 1.00, opacity: 1.00 },
    'station-node':    { scale: 1.35, shadow: 1.00 },
  };
  var VISIBILITY_SCALE_FLOOR = 0.55;   // prevent collapse into scene noise
  function _visibilityProfile(silhouetteClass) {
    return ACTOR_VISIBILITY_PROFILE[silhouetteClass] || null;
  }
  function _visibilityScaleMul(silhouetteClass) {
    var p = _visibilityProfile(silhouetteClass);
    return p && p.scale != null ? p.scale : 1.0;
  }
  function _palette(payload) {
    var ref = payload && payload.paletteRef;
    var reg = global.SBE && SBE.ActorPresentationPaletteRegistry;
    if (reg && typeof reg.resolvePalette === 'function') {
      try { return reg.resolvePalette(ref); } catch (e) {}
    }
    return { key: 'actor.generic', body: 0x9aa0a6, roof: 0xc2c8ce, side: 0x6b7177,
             glass: 0x141a20, accent: 0xffffff, light: 0xffffff, shadow: 0x000000, opacity: 1 };
  }
  function _materialOpacity(materialClass) {
    if (materialClass === 'high-altitude') return 0.9;
    if (materialClass === 'low-priority')  return 0.78;
    return 1.0;
  }
  // Contact shadow plane sized to footprint; opacity from priorityClass × the
  // per-silhouette visibility shadow multiplier (0603K). Simple opacity only —
  // no blur, no shaders.
  function _contactShadow(W, L, priorityClass, shadowMul) {
    var THREE = global.THREE;
    var base = SHADOW_OPACITY_BY_PRIORITY[priorityClass] != null ? SHADOW_OPACITY_BY_PRIORITY[priorityClass] : 0.22;
    var op = Math.min(0.6, base * (shadowMul || 1.0));
    var sh = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.8, L + 0.8),
      _matBasic(0x000000, { transparent: true, opacity: op }));
    sh.position.z = 0.02;
    return sh;
  }
  // Symbolic (static) light cues by lightClass at the +Y front / −Y rear.
  function _lightCues(g, lightClass, pal, W, L, H) {
    var THREE = global.THREE;
    function dot(x, y, z, color, r) {
      var d = new THREE.Mesh(new THREE.BoxGeometry(r || 0.4, 0.16, 0.22), _matBasic(color));
      d.position.set(x, y, z); g.add(d);
    }
    if (lightClass === 'none') return;
    if (lightClass === 'head-tail' || lightClass === 'minimal') {
      dot( W * 0.32, L * 0.49, H * 0.55, pal.light);
      dot(-W * 0.32, L * 0.49, H * 0.55, pal.light);
      dot( W * 0.32, -L * 0.49, H * 0.55, 0xcc2222);
      dot(-W * 0.32, -L * 0.49, H * 0.55, 0xcc2222);
    } else if (lightClass === 'amber-flash') {
      var bar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.85, 0.6, 0.3), _matBasic(0xffc400));   // 0603K wider
      bar.position.set(0, L * 0.15, H * 1.12 + 0.2); g.add(bar);
    } else if (lightClass === 'navigation') {
      dot( W * 0.45, L * 0.4, H * 0.7, 0x37d67a, 0.3);   // starboard green
      dot(-W * 0.45, L * 0.4, H * 0.7, 0xff4d4d, 0.3);   // port red
      dot( 0, -L * 0.45, H * 0.8, 0xffffff, 0.3);
    } else if (lightClass === 'nav-strobe') {
      dot( W * 0.45, 0, H * 0.5, pal.light, 0.25);
      dot(-W * 0.45, 0, H * 0.5, pal.light, 0.25);
    } else if (lightClass === 'interior-strip') {
      var strip = new THREE.Mesh(new THREE.BoxGeometry(W * 0.7, L * 0.8, 0.1), _matBasic(pal.light, { transparent: true, opacity: 0.6 }));
      strip.position.set(0, 0, H * 0.75); g.add(strip);
    }
  }

  // 1. City bus — long low-poly transit block (+Y front). 0603K: taller roof
  // profile, thicker route strip, stronger glass + front-fascia contrast.
  function _buildCityBusMesh(payload) {
    var THREE = global.THREE;
    var W = 3.2, L = 11.5, H = 2.8;
    var pal = _palette(payload);
    var op = _materialOpacity(payload && payload.materialClass);
    var vp = _visibilityProfile('city-bus') || {};
    var g = new THREE.Group();
    g.add(_contactShadow(W, L, payload && payload.priorityClass, vp.shadow));
    var body = new THREE.Mesh(_box(W, L, H * 0.74), _matBasic(pal.body, { transparent: op < 1, opacity: op }));
    body.position.z = H * 0.37; g.add(body);
    // Taller roof profile (0603K) — reads as a bus crown from above.
    var roof = new THREE.Mesh(_box(W * 0.97, L * 0.97, H * 0.30), _matBasic(pal.roof));
    roof.position.z = H * 0.74 + H * 0.15; g.add(roof);
    // Higher-contrast side window strip.
    [ W * 0.5, -W * 0.5 ].forEach(function (x) {
      var strip = new THREE.Mesh(_box(0.08, L * 0.9, H * 0.4), _matBasic(pal.glass, { transparent: true, opacity: 0.95 }));
      strip.position.set(x, 0, H * 0.55); g.add(strip);
    });
    var wind = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.84, H * 0.46), _matBasic(pal.glass, { transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
    wind.position.set(0, L * 0.49, H * 0.58); wind.rotation.x = 0.2; g.add(wind);
    // Front fascia contrast band.
    var fascia = new THREE.Mesh(_box(W * 0.98, 0.18, H * 0.5), _matBasic(pal.side));
    fascia.position.set(0, L * 0.5, H * 0.3); g.add(fascia);
    // Thicker route strip accent.
    var rstrip = new THREE.Mesh(_box(W * 0.86, 0.5, H * 0.3), _matBasic(pal.accent));
    rstrip.position.set(0, L * 0.45, H * 0.2); g.add(rstrip);
    _lightCues(g, (payload && payload.lightClass) || 'head-tail', pal, W, L, H);
    _recordShapeBuild('identity:city-bus', 'vehicle.bus', payload && payload.paletteRef, { w: W, l: L, h: H });
    return g;
  }

  // 2. Utility truck — chunky civic service vehicle with equipment block (+Y front).
  // 0603K: taller equipment box, bolder hazard stripe, wider amber beacon bar.
  function _buildUtilityTruckMesh(payload) {
    var THREE = global.THREE;
    var W = 3.4, L = 8.8, H = 3.2;
    var pal = _palette(payload);
    var vp = _visibilityProfile('utility-truck') || {};
    var g = new THREE.Group();
    g.add(_contactShadow(W, L, (payload && payload.priorityClass) || 'civic-service', vp.shadow));
    // Cab (front, +Y)
    var cab = new THREE.Mesh(_box(W, L * 0.34, H * 0.72), _matBasic(pal.body));
    cab.position.set(0, L * 0.30, H * 0.36); g.add(cab);
    var wind = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.8, H * 0.32), _matBasic(pal.glass, { transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    wind.position.set(0, L * 0.47, H * 0.58); wind.rotation.x = 0.25; g.add(wind);
    // Equipment / service box (rear, −Y) — taller than the cab for a heavy read.
    var box = new THREE.Mesh(_box(W * 0.98, L * 0.62, H * 1.12), _matBasic(pal.side));
    box.position.set(0, -L * 0.15, H * 0.56); g.add(box);
    // Bolder hazard stripe wrapping the rear box.
    var stripe = new THREE.Mesh(_box(W * 1.0, L * 0.62, 0.5), _matBasic(pal.accent));
    stripe.position.set(0, -L * 0.15, H * 0.28); g.add(stripe);
    _lightCues(g, (payload && payload.lightClass) || 'amber-flash', pal, W, L, H);
    _recordShapeBuild('identity:utility-truck', 'vehicle.utility', payload && payload.paletteRef, { w: W, l: L, h: H });
    return g;
  }

  // 4/5. Marine hull (vessel/ferry share a builder, scaled by dims). 0603K:
  // taller deckhouse, brighter roof contrast, more prominent bow wedge so the
  // cabin reads as separate from the hull from an aerial angle.
  function _buildHullMesh(payload, W, L, H, kind) {
    var THREE = global.THREE;
    var pal = _palette(payload);
    var op = _materialOpacity(payload && payload.materialClass);
    var vp = _visibilityProfile(kind) || {};
    var g = new THREE.Group();
    g.add(_contactShadow(W, L, (payload && payload.priorityClass) || 'harbor-truth', vp.shadow));
    var hull = new THREE.Mesh(_box(W, L * 0.92, H * 0.5), _matBasic(pal.side, { transparent: op < 1, opacity: op }));
    hull.position.z = H * 0.25; g.add(hull);
    // More prominent bow wedge (+Y).
    var bow = new THREE.Mesh(new THREE.CylinderGeometry(0.1, W * 0.55, L * 0.24, 3), _matBasic(pal.side));
    bow.rotation.x = -Math.PI / 2; bow.position.set(0, L * 0.52, H * 0.25); g.add(bow);
    // Taller, brighter deckhouse clearly above the hull deck.
    var cab = new THREE.Mesh(_box(W * 0.74, L * 0.52, H * 0.7), _matBasic(pal.roof));
    cab.position.set(0, -L * 0.05, H * 0.5 + H * 0.35); g.add(cab);
    _lightCues(g, (payload && payload.lightClass) || 'navigation', pal, W, L, H);
    _recordShapeBuild('identity:' + kind, 'marine', payload && payload.paletteRef, { w: W, l: L, h: H });
    return g;
  }
  function _buildVesselMesh(payload) { return _buildHullMesh(payload, 5.0, 18.0, 2.5, 'vessel-generic'); }
  function _buildFerryMesh(payload)  { return _buildHullMesh(payload, 6.0, 22.0, 3.2, 'passenger-ferry'); }

  // 6. Aircraft light token — low-poly cross (wing + fuselage + tail). 0603K:
  // wider wing/tail span and forced opacity 1.0 so it reads from regional zoom.
  function _buildAircraftTokenMesh(payload) {
    var THREE = global.THREE;
    var pal = _palette(payload);
    var vp = _visibilityProfile('aircraft-light') || {};
    var op = vp.opacity != null ? vp.opacity : 1.0;   // readable, not faint
    var g = new THREE.Group();
    var fuse = new THREE.Mesh(_box(1.4, 11.0, 1.1), _matBasic(pal.body, { transparent: op < 1, opacity: op }));
    fuse.position.z = 0.55; g.add(fuse);
    var wing = new THREE.Mesh(_box(13.0, 1.8, 0.5), _matBasic(pal.side, { transparent: op < 1, opacity: op }));
    wing.position.set(0, 0.5, 0.55); g.add(wing);
    var tail = new THREE.Mesh(_box(4.6, 1.1, 0.45), _matBasic(pal.side, { transparent: op < 1, opacity: op }));
    tail.position.set(0, -4.6, 0.8); g.add(tail);
    _lightCues(g, (payload && payload.lightClass) || 'nav-strobe', pal, 13.0, 11.0, 1.1);
    _recordShapeBuild('identity:aircraft-light', 'aircraft.plane', payload && payload.paletteRef, { span: 13.0 });
    return g;
  }

  // 0603J — silhouette dispatch. Returns null when no identity mesh applies
  // (lets the existing vehicle/hero/calibration paths handle it).
  function _buildIdentityMesh(actorType, variant, lodTier, visualState, payload) {
    if (!payload || !payload.silhouetteClass) return null;
    var sil = payload.silhouetteClass;
    switch (sil) {
      case 'city-bus':        return _buildCityBusMesh(payload);
      case 'utility-truck':   return _buildUtilityTruckMesh(payload);
      case 'station-node':    return _buildStationMesh(variant, visualState, payload);
      case 'vessel-generic':  return _buildVesselMesh(payload);
      case 'passenger-ferry': return _buildFerryMesh(payload);
      case 'aircraft-light':  return _buildAircraftTokenMesh(payload);
    }
    // 0603T — marine asset-pack silhouettes WSL doesn't yet model fall back to
    // the generic vessel / ferry builders (NOT a car). Presentation only.
    if (/ferry|cruise/.test(sil)) return _buildFerryMesh(payload);
    if (/boat|ship|vessel|tanker|barge|yacht|sailboat/.test(sil)) return _buildVesselMesh(payload);
    return null;   // ambient-car etc. → existing builders
  }

  function _buildMesh(actorType, variant, lodTier, visualState, payload) {
    var mode = _visMode;
    lodTier = lodTier || 'near';
    // 0603J — identity-driven 2.5D meshes (bus/utility/vessel/ferry/aircraft/station).
    if (payload && payload.silhouetteClass) {
      var im = _buildIdentityMesh(actorType, variant, lodTier, visualState, payload);
      if (im) return im;
    }
    // 0603G — station truth actors build a marker tier, not a car. The render
    // variant (station_dot/node/icon) selects geometry; state selects colour.
    if (actorType === 'bike.station' || (variant && variant.indexOf('station_') === 0)) {
      return _buildStationMesh(variant, visualState, payload);
    }
    // 0601G — 3D primitive proof overrides all other geometry when enabled.
    if (_primitive3d) {
      if (actorType === 'box_truck') return _buildPrimitiveTruck(variant);
      return _buildPrimitiveCar(actorType, variant);
    }
    // Calibration modes are actorType-agnostic proof geometry (no LOD).
    if (mode === 'block')   return _buildBlockMesh(actorType, variant);
    if (mode === 'slab')    return _buildSlabMesh(actorType, variant);
    if (mode === 'wedge')   return _buildWedgeMesh(actorType, variant);
    // Production / vehicle mode: honour actorType + LOD tier.
    if (actorType === 'box_truck') return _buildTruckLOD(variant, lodTier);
    if (mode === 'vehicle') return _buildVehicleLOD(actorType, variant, lodTier);
    return _buildCarMesh(actorType, variant);
  }

  // ── Scale authority (0601A) ───────────────────────────────────────────────────

  function _lodTierForZoom(zoom) {
    if (zoom == null) return 'mid';
    if (zoom >= LOD_NEAR_Z) return 'near';
    if (zoom >= LOD_MID_Z)  return 'mid';
    if (zoom >= LOD_FAR_Z)  return 'far';
    return 'tiny';
  }

  // Reads current camera profile label from the deck nav (Drone/Urban/Rooftop/…).
  function _currentCameraProfile() {
    var nav = global._wos && global._wos.nav;
    if (nav && nav.altStep && nav.altStep.label) return nav.altStep.label;
    return null;
  }

  // Central scale resolver. Returns scale breakdown + lodTier.
  // finalScale includes the global shapeScale and is clamped [SCALE_MIN, SCALE_MAX].
  function _resolveVehicleScale(actorType, variant, zoom, pitch, cameraProfile) {
    var baseScale    = 1.0;
    var lodTier      = _lodTierForZoom(zoom);
    var zoomScale    = ZOOM_SCALE[lodTier] != null ? ZOOM_SCALE[lodTier] : 1.0;
    var typeScale    = TYPE_SCALE[actorType] != null ? TYPE_SCALE[actorType] : 1.0;
    var profileScale = (cameraProfile && PROFILE_SCALE[cameraProfile] != null)
      ? PROFILE_SCALE[cameraProfile] : 1.0;
    var finalScale   = baseScale * zoomScale * typeScale * profileScale * _shapeScale;
    finalScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, finalScale));
    return {
      baseScale:    baseScale,
      zoomScale:    zoomScale,
      typeScale:    typeScale,
      profileScale: profileScale,
      finalScale:   finalScale,
      lodTier:      lodTier,
    };
  }

  // Resolve scale for a vehicle payload, reading live zoom/pitch/profile.
  // Never throws — falls back to shapeScale on any failure (warn once / 2s).
  function _resolveForVehicle(v) {
    if (!_adaptiveLOD) {
      // Manual mode: finalScale = shapeScale, lodTier 'near' (full detail).
      // Hero floor + visibility boost still apply (0601T).
      var fs = _shapeScale;
      var isHeroM = (v.id === 'hero');
      if (isHeroM && fs < HERO_MIN_FINAL_SCALE) fs = HERO_MIN_FINAL_SCALE;
      if (_visibilityBoost) {
        var fl = isHeroM ? BOOST_MIN.hero
               : (v.actorType === 'box_truck') ? BOOST_MIN.box_truck : BOOST_MIN.traffic_car;
        if (fs < fl) fs = fl;
      }
      return { baseScale: 1, zoomScale: 1, typeScale: 1, profileScale: 1,
               finalScale: Math.min(SCALE_MAX, fs), lodTier: 'near', adaptive: false };
    }
    try {
      var mvr  = global.SBE && SBE.MapboxViewportRuntime;
      var map  = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : _map;
      var zoom = null, pitch = null;
      if (map) {
        try { zoom = map.getZoom(); }  catch (e) {}
        try { pitch = map.getPitch(); } catch (e) {}
      }
      var profile = _currentCameraProfile();
      var r = _resolveVehicleScale(v.actorType, v.variant, zoom, pitch, profile);
      // 0601G — primitive proof forces near-tier geometry at all zooms (volume proof)
      if (_primitive3d && _primitive3dForceNear) r.lodTier = 'near';

      // 0601T-A — hero stability: always near LOD + a hard scale floor so camera
      // preset changes never make the hero shrink/grow or flicker between tiers.
      var isHero = (v.id === 'hero');
      if (isHero) {
        r.lodTier = 'near';
        if (r.finalScale < HERO_MIN_FINAL_SCALE) r.finalScale = HERO_MIN_FINAL_SCALE;
      }

      // 0601T-B — debug visibility boost: raise per-class minimum finalScale.
      if (_visibilityBoost) {
        var floor = isHero ? BOOST_MIN.hero
                  : (v.actorType === 'box_truck') ? BOOST_MIN.box_truck
                  : BOOST_MIN.traffic_car;
        if (r.finalScale < floor) r.finalScale = floor;
      }
      r.finalScale = Math.min(SCALE_MAX, r.finalScale);

      r.adaptive = true; r.zoom = zoom; r.pitch = pitch; r.cameraProfile = profile;
      _lastScaleResolve = r;
      return r;
    } catch (err) {
      if (Date.now() - _scaleWarnedAt > 2000) {
        _scaleWarnedAt = Date.now();
        console.warn('[WorldSpaceVehicleLayer] scale resolve failed — using shapeScale:',
          err && err.message ? err.message : err);
      }
      return { baseScale: 1, zoomScale: 1, typeScale: 1, profileScale: 1,
               finalScale: _shapeScale, lodTier: 'near', adaptive: false };
    }
  }

  // ── Mesh transform ────────────────────────────────────────────────────────────

  // _applyTransform does NOT swallow errors — callers own error handling so the
  // observability system stays honest:
  //   - _upsertVehicleInner() catches → records 'transform_failed'
  //   - _beaconTick() wraps its own call (diagnostic, must never throw in RAF)
  // A missing mapboxgl returns silently (no transform possible, not an error).
  // `resolved` (optional) supplies finalScale; when omitted, legacy path applies.
  function _applyTransform(mesh, v, resolved) {
    var THREE = global.THREE;
    if (!global.mapboxgl || !global.mapboxgl.MercatorCoordinate || !THREE) return;
    var coord = global.mapboxgl.MercatorCoordinate.fromLngLat([v.lng, v.lat], ALTITUDE_M);

    // meterInMercatorCoordinateUnits() converts 1 real-world metre → Mercator units.
    // When a resolved LOD scale is supplied, it already folds in _shapeScale; the
    // legacy path (no resolved) keeps _debugScale × _shapeScale for back-compat.
    var meterUnit  = coord.meterInMercatorCoordinateUnits();
    var finalScale = resolved ? (_debugScale * resolved.finalScale) : (_debugScale * _shapeScale);
    var meterScale = meterUnit * finalScale;
    // Camera-profile depth exaggeration: Z (vertical) only — footprint untouched.
    var depthMult  = _depthEnabled ? _depthMultiplier() : 1.0;
    // Heading: single explicit correction point.
    var hdg        = (v.headingDeg || 0) + VEHICLE_HEADING_OFFSET_DEG;
    var hdgRad     = -hdg * Math.PI / 180;

    // Record transform metadata for diagnostics
    mesh._meterUnit       = meterUnit;
    mesh._finalScale      = finalScale;
    mesh._depthMult       = depthMult;
    mesh._headingDeg      = v.headingDeg || 0;
    mesh._appliedHeadingDeg = hdg;
    mesh._mercator        = { x: coord.x, y: coord.y, z: coord.z };
    mesh._transformMode   = _transformMode;
    mesh._lastTransformAt = Date.now();
    mesh._lastV           = { lat: v.lat, lng: v.lng, headingDeg: v.headingDeg || 0, visible: v.visible, id: v.id, source: v.source };
    mesh.visible          = (v.visible !== false);

    if (_transformMode === 'modelMatrix') {
      // Canonical Mapbox path: mesh stays at LOCAL origin (only heading in local
      // space, matching the legacy convention); world placement + scale baked into
      // the model matrix. projMat = mapboxMatrix × modelMatrix is applied in render().
      // 0602I — preserve the depth-policy local Z lift (0 for road/alwaysOn) so a
      // per-frame transform does not wipe 'visual' mode's readability lift.
      mesh.position.set(0, 0, mesh._localZLift || 0);
      mesh.rotation.set(0, 0, hdgRad);
      mesh.scale.setScalar(1);
      // translate × scale(s, -s, s·depth). The -Y corrects Mapbox Mercator handedness.
      mesh._modelMatrix = new THREE.Matrix4()
        .makeTranslation(coord.x, coord.y, coord.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale * depthMult));
    } else {
      // vehicleMatrix legacy: mesh positioned + scaled in mercator; projMat = fromArray.
      mesh._modelMatrix = null;
      mesh.position.set(coord.x, coord.y, coord.z);
      mesh.rotation.set(0, 0, hdgRad);
      mesh.scale.set(meterScale, meterScale, meterScale * depthMult);
    }
    _lastTransformMode = _transformMode;
  }

  // Build a per-object scene wrapping one mesh (modelMatrix path mirrors threeProof).
  function _makeScene(mesh) {
    var THREE = global.THREE;
    var s = new THREE.Scene();
    // Ambient light for any legacy Lambert meshes; MeshBasicMaterial ignores it.
    s.add(new THREE.AmbientLight(0xffffff, 0.9));
    s.add(mesh);
    return s;
  }

  // 0601U — bright 8×14×5m block for showcase-road traffic. Impossible to miss:
  // depthTest off (never occluded), renderOrder 999 (drawn last), no frustum cull.
  function _buildTrafficBeacon(variant) {
    var THREE = global.THREE;
    var g = new THREE.Group();
    // Pick a bright colour deterministically from the variant string.
    var idx = 0;
    if (variant) for (var c = 0; c < variant.length; c++) idx += variant.charCodeAt(c);
    var color = BEACON_COLORS[idx % BEACON_COLORS.length];
    var mat = new THREE.MeshBasicMaterial({ color: color, depthTest: false, depthWrite: false });
    // BoxGeometry(X=width 8, Y=length 14, Z=height 5)
    var box = new THREE.Mesh(new THREE.BoxGeometry(8, 14, 5), mat);
    box.position.z = 2.5;            // base on the road surface
    box.renderOrder = 999;
    box.frustumCulled = false;
    g.add(box);
    g.renderOrder = 999;
    g.frustumCulled = false;
    _recordShapeBuild('traffic_beacon', 'showcase', variant, { w: 8, l: 14, h: 5 });
    return g;
  }

  // 0601T-C — toggle depthTest/depthWrite on every child material of a mesh group.
  // Handles both single materials and per-face material arrays.
  function _setMeshDepthTest(mesh, on) {
    if (!mesh || !mesh.traverse) return;
    mesh.traverse(function (child) {
      var mat = child.material;
      if (!mat) return;
      var arr = Array.isArray(mat) ? mat : [mat];
      arr.forEach(function (m) {
        if (!m) return;
        m.depthTest  = !!on;
        m.depthWrite = !!on;
        m.needsUpdate = true;
      });
    });
  }

  // ── Actor depth policy (0602I) ────────────────────────────────────────────────
  // One authority separates THREE concerns that used to be tangled together:
  //   road        — production: respect depth → occluded by real 3D bridge decks.
  //   visual      — production: respect depth + a small local Z lift for readability.
  //   alwaysOn    — DEBUG ONLY: hero draws above everything (depthTest off).
  //   debugBeacon — DEBUG ONLY: showcase/test actors draw above everything.
  // Hero grade is driven by _heroGradeMode; showcase-road by _trafficBeaconMode.
  // Test/calibration sources may opt into debug policy but never change the
  // production default for hero or traffic.
  function _resolveActorDepthPolicy(v) {
    var id = v && v.id, source = v && v.source, at = v && v.actorType;

    // Hero — grade mode authority
    if (id === 'hero' || source === 'hero-live') {
      if (_heroGradeMode === 'alwaysOn')
        return { mode: 'alwaysOn', depthTest: false, depthWrite: false, renderOrder: 1000, frustumCulled: false, localZLift: 0 };
      if (_heroGradeMode === 'visual')
        return { mode: 'visual', depthTest: true, depthWrite: true, renderOrder: 0, frustumCulled: true, localZLift: HERO_VISUAL_LIFT };
      return { mode: 'road', depthTest: true, depthWrite: true, renderOrder: 0, frustumCulled: true, localZLift: 0 };
    }

    // Showcase-road traffic — beacon mode authority
    if (source === 'showcase-road') {
      if (_trafficBeaconMode)
        return { mode: 'debugBeacon', depthTest: false, depthWrite: false, renderOrder: 999, frustumCulled: false, localZLift: 0 };
      return { mode: 'road', depthTest: true, depthWrite: true, renderOrder: 0, frustumCulled: true, localZLift: 0 };
    }

    // Test / calibration / primitive proof actors — debug depth allowed.
    if (source === 'test' || source === 'calibration' || source === 'primitive-proof' ||
        at === 'block' || at === 'slab' || at === 'wedge' || at === 'primitive') {
      return { mode: 'debugBeacon', depthTest: false, depthWrite: false, renderOrder: 998, frustumCulled: false, localZLift: 0 };
    }

    // Production default — road truth.
    return { mode: 'road', depthTest: true, depthWrite: true, renderOrder: 0, frustumCulled: true, localZLift: 0 };
  }

  // Apply a resolved depth policy to a mesh + all its children. Records the policy
  // on the mesh so state reporting and the per-frame transform can honour it.
  function _applyDepthPolicyToMesh(mesh, policy) {
    if (!mesh || !policy) return;
    _setMeshDepthTest(mesh, !!policy.depthTest);
    mesh.renderOrder   = policy.renderOrder || 0;
    mesh.frustumCulled = policy.frustumCulled !== false;
    if (mesh.position) mesh.position.z = policy.localZLift || 0;
    if (mesh.traverse) mesh.traverse(function (child) {
      child.renderOrder   = policy.renderOrder || 0;
      child.frustumCulled = policy.frustumCulled !== false;
    });
    mesh._depthPolicyMode = policy.mode;
    mesh._localZLift      = policy.localZLift || 0;
    mesh._depthPolicy     = policy;
  }

  // 0601Z-A / 0602A — compatibility wrappers now route through the depth policy.
  function _applyHeroAlwaysOn(mesh) {
    _applyDepthPolicyToMesh(mesh, { mode: 'alwaysOn', depthTest: false, depthWrite: false, renderOrder: 1000, frustumCulled: false, localZLift: 0 });
  }
  function _applyHeroRoadMode(mesh) {
    _applyDepthPolicyToMesh(mesh, { mode: 'road', depthTest: true, depthWrite: true, renderOrder: 0, frustumCulled: true, localZLift: 0 });
  }
  function _applyHeroGradeMode(mesh) {
    if (!mesh) return;
    _applyDepthPolicyToMesh(mesh, _resolveActorDepthPolicy({ id: 'hero', source: 'hero-live' }));
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
      _scene  = new THREE.Scene();   // kept for back-compat (isRenderReady checks it)

      // Re-attach any meshes created before onAdd fired into per-object scenes
      Object.keys(_meshes).forEach(function (id) {
        _meshes[id].name = id;
        if (!_scenes[id]) _scenes[id] = _makeScene(_meshes[id]);
      });

      _layerAdded = true;
      if (_debugMode) console.log('[WorldSpaceVehicleLayer] onAdd — Three.js renderer ready (transformMode:', _transformMode + ')');
    },

    render: function (gl, matrix) {
      // 0601L — count the pass BEFORE any early return so we can tell whether
      // Mapbox is invoking the callback at all vs. WSL exiting before render work.
      _renderPassCount += 1;
      _lastRenderPassAt = Date.now();

      function _auditSnap(reason, three) {
        _lastRenderAuditSnapshot = {
          timestamp:   _lastRenderPassAt,
          reason:      reason,
          enabled:     _enabled,
          hasRenderer: !!_renderer,
          hasCamera:   !!_camera,
          hasThree:    !!(three || global.THREE),
          hasMatrix:   !!matrix,
          meshCount:   Object.keys(_meshes).length,
          sceneCount:  Object.keys(_scenes).length,
        };
      }

      if (!_enabled) {
        _renderEarlyReturnReason = 'layer_disabled';
        _recordEarlyReturn('layer_disabled');
        _auditSnap(_renderEarlyReturnReason);
        return;
      }
      if (!_renderer || !_camera) {
        _renderEarlyReturnReason = 'renderer_or_camera_missing';
        _recordEarlyReturn('renderer_or_camera_missing');
        _auditSnap(_renderEarlyReturnReason);
        return;
      }
      var THREE = global.THREE;
      if (!THREE || !matrix) {
        _renderEarlyReturnReason = 'three_or_matrix_missing';
        _recordEarlyReturn(!THREE ? 'three_unavailable' : 'matrix_unavailable');
        _auditSnap(_renderEarlyReturnReason, THREE);
        return;
      }

      _renderEarlyReturnReason = null;
      _auditSnap(null, THREE);

      _renderCount += 1;
      _lastRenderAt = Date.now();

      try {
        _renderer.resetState();
        var mb = new THREE.Matrix4().fromArray(matrix);
        var ids = Object.keys(_meshes);
        var rendered = 0, skipped = 0;
        for (var i = 0; i < ids.length; i++) {
          var id    = ids[i];
          var mesh  = _meshes[id];
          var scene = _scenes[id];
          // 0601Z-A / 0602A — only force hero visible in debug 'alwaysOn' mode.
          if (mesh && id === 'hero' && _heroAlwaysOn) mesh.visible = true;
          if (!mesh || !scene || mesh.visible === false) { skipped++; continue; }

          var projMode;
          if (_transformMode === 'modelMatrix' && mesh._modelMatrix) {
            // Canonical: world placement baked into the model matrix; mesh local.
            _camera.projectionMatrix = mb.clone().multiply(mesh._modelMatrix);
            projMode = 'modelMatrix';
          } else {
            // vehicleMatrix legacy: mesh positioned in mercator; identity projection.
            _camera.projectionMatrix = mb;
            projMode = 'vehicleMatrix';
          }
          _renderer.render(scene, _camera);
          // Stamp render truth ONLY after renderer.render() ran for THIS mesh.
          mesh._lastRenderAt           = _lastRenderAt;
          mesh._renderCount            = (mesh._renderCount || 0) + 1;
          mesh._lastRenderMode         = _transformMode;
          mesh._lastRenderProjectionMode = projMode;
          _lastRenderedVehicleId       = id;
          rendered++;
        }
        _lastRenderObjectCount  = rendered;
        _lastRenderSkippedCount = skipped;
        // Beacon (diagnostic) — lives in the back-compat _scene
        if (_beaconActive && _beaconMesh && _scene) {
          if (_transformMode === 'modelMatrix' && _beaconMesh._modelMatrix) {
            _camera.projectionMatrix = mb.clone().multiply(_beaconMesh._modelMatrix);
          } else {
            _camera.projectionMatrix = mb;
          }
          _renderer.render(_scene, _camera);
        }
        if (ids.length || _beaconActive) _map.triggerRepaint();
      } catch (e) {
        _lastTransformError = e && e.message ? e.message : String(e);
        if (_debugMode) console.warn('[WorldSpaceVehicleLayer] render error:', e.message);
      }
    },
  };

  // ── start / stop ──────────────────────────────────────────────────────────────

  // 0601M — Mapbox is the source of mount truth. A style reload/publish can drop
  // the custom layer while _layerAdded still reads true. map.getLayer() is authoritative.
  function _isLayerMounted() {
    try {
      return !!(_map && typeof _map.getLayer === 'function' && _map.getLayer(LAYER_ID));
    } catch (e) {
      return false;
    }
  }

  // 0601N — hard remount audit state
  var _lastHardRemountAt     = 0;
  var _lastHardRemountReason = null;
  var _lastHardRemountResult = null;
  var _hardRemountInFlight   = false;

  // Reset the render-layer runtime so onAdd() rebuilds it against the live GL
  // context. Preserves _meshes/_scenes/_vehicles — onAdd re-attaches them.
  function _resetRenderLayerRuntime() {
    if (_renderer) { try { _renderer.dispose(); } catch (e) {} }
    _renderer   = null;
    _camera     = null;
    _scene      = null;
    _layerAdded = false;
  }

  // Force Mapbox to run the custom-layer lifecycle again:
  //   removeLayer → reset renderer state → addLayer → triggerRepaint
  function _hardRemountLayer(reason) {
    if (!_map) return false;
    if (_hardRemountInFlight) return false;

    _hardRemountInFlight   = true;
    _lastHardRemountAt     = Date.now();
    _lastHardRemountReason = reason || 'manual';

    try {
      if (_isLayerMounted()) {
        try { _map.removeLayer(LAYER_ID); } catch (removeErr) {}
      }
      _resetRenderLayerRuntime();
      try {
        _map.addLayer(_customLayer);
        _layerAdded            = true;
        _lastHardRemountResult = 'mounted';
        try { _map.triggerRepaint(); } catch (paintErr) {}
        if (_debugMode) console.log('[WorldSpaceVehicleLayer] hard remount OK — reason:', _lastHardRemountReason,
          '| layerMounted:', _isLayerMounted());
        return true;
      } catch (addErr) {
        _lastHardRemountResult = 'add_failed:' + (addErr && addErr.message ? addErr.message : String(addErr));
        if (_debugMode) console.warn('[WorldSpaceVehicleLayer] hard remount failed:', addErr && addErr.message ? addErr.message : addErr);
        return false;
      }
    } finally {
      _hardRemountInFlight = false;
    }
  }

  // ── Style-driven remount (0601O) ──────────────────────────────────────────────
  // Remounts are STATE-driven, not event-driven. `styledata` fires constantly
  // during normal map operation (tiles, sources, sprites), so a raw listener
  // caused continuous remounts. We:
  //   - use `style.load` for the real "style (re)loaded" signal (publish/setStyle)
  //   - keep a DEBOUNCED `styledata` as a safety net, gated on actual integrity
  // A remount only happens when the layer/renderer/camera/scene is actually gone.
  var _styleRemountBound        = false;
  var _styleRemountTimer        = null;
  var STYLE_REMOUNT_DEBOUNCE_MS = 750;
  var _lastStyledataAt          = 0;
  var _styledataCount           = 0;
  var _styleRemountScheduled    = 0;
  var _styleRemountExecuted     = 0;

  // True only when runtime integrity is compromised and a remount is warranted.
  function _needsRemount() {
    return !_isLayerMounted() || !_renderer || !_camera || !_scene;
  }

  function _scheduleStyleRemount(reason) {
    _styleRemountScheduled += 1;
    if (_styleRemountTimer) global.clearTimeout(_styleRemountTimer);
    _styleRemountTimer = global.setTimeout(function () {
      _styleRemountTimer = null;
      if (!_active) return;
      if (!_needsRemount()) return;   // state-driven: skip if integrity intact
      _styleRemountExecuted += 1;
      _hardRemountLayer(reason || 'styledata_debounced');
      if (_enabled && Object.keys(_meshes).length) {
        try { if (_map) _map.triggerRepaint(); } catch (e) {}
      }
    }, STYLE_REMOUNT_DEBOUNCE_MS);
  }

  function _bindStyleRemount(map) {
    if (!map || _styleRemountBound || typeof map.on !== 'function') return;
    _styleRemountBound = true;

    // Primary: a real style load (publish / setStyle) drops custom layers.
    // Check integrity promptly (short debounce) and remount only if needed.
    map.on('style.load', function () {
      _scheduleStyleRemount('style_load');
    });

    // Safety net: styledata fires often — only acts if integrity is actually gone.
    map.on('styledata', function () {
      _lastStyledataAt = Date.now();
      _styledataCount += 1;
      _scheduleStyleRemount('styledata_debounced');
    });
  }

  function start() {
    if (!_checkThree()) {
      console.warn('[WorldSpaceVehicleLayer] THREE unavailable — DOM vehicle fallback remains active');
      return false;
    }
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    _map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (!_map) { console.warn('[WorldSpaceVehicleLayer] map not ready'); return false; }

    // Bind the style-reload remount handler once (survives publish/setStyle).
    _bindStyleRemount(_map);

    // Trust Mapbox, not the internal flag. If Mapbox dropped the layer, hard-remount it.
    if (!_isLayerMounted()) {
      if (!_hardRemountLayer('start_unmounted')) return false;
    } else {
      _layerAdded = true;
      // 0601N: mounted-only is not enough. If Mapbox says the layer exists but
      // onAdd/render state is missing, force a real lifecycle rebuild.
      if (!_renderer || !_camera || !_scene) {
        if (!_hardRemountLayer('start_mounted_missing_renderer')) return false;
      }
    }
    _active = true;
    if (_debugMode) console.log('[WorldSpaceVehicleLayer] v' + VERSION + ' started (layerMounted:', _isLayerMounted() + ')');
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
      // Beacon is diagnostic — guard its own call so it never throws into RAF.
      try {
        _applyTransform(_beaconMesh, {
          lat:        entity.lat,
          lng:        entity.lng,
          headingDeg: 0,         // beacon has no heading — always axis-aligned
          visible:    true,
        });
      } catch (e) { /* beacon transform failure is non-fatal */ }
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
      try { _applyTransform(_beaconMesh, { lat: entity.lat, lng: entity.lng, headingDeg: 0, visible: true }); }
      catch (e) { /* beacon seed transform non-fatal */ }
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
      enabled:              _upsertTraceEnabled,
      instanceId:           INSTANCE_ID,
      lastFailure:          _lastUpsertFailure,
      lastSuccess:          _lastUpsertSuccess,
      lastTransformAt:      _lastTransformAt,
      lastTransformPayload: _lastTransformPayload,
      vehicleCount:         Object.keys(_vehicles).length,
      renderReady:          isRenderReady(),
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

    // Resolve scale + LOD tier for this frame (never throws → shapeScale fallback).
    var resolved = _resolveForVehicle(v);
    // 0603J/0603K — apply identity scale-class × visibility multipliers ONCE
    // (resolved is fresh each upsert, so this never compounds). Floor prevents
    // collapse into scene noise. Only for identity-bearing actors.
    if (v.scaleClass || v.silhouetteClass) {
      var idScale = _scaleClassMul(v.scaleClass) * _visibilityScaleMul(v.silhouetteClass);
      resolved.finalScale = Math.max(VISIBILITY_SCALE_FLOOR, resolved.finalScale * idScale);
    }

    // Create/rebuild mesh only when the actor DEFINITION changes:
    //   - new actor (no prev mesh)
    //   - actorType / variant changed
    //   - shape mode changed OR mesh was invalidated (_shapeMode === null)
    //   - LOD tier changed (geometry simplification level)
    // Definition does NOT include lat/lng/heading/speed/camera movement, so the
    // car never rebuilds per-frame from motion — only on a discrete tier crossing.
    // 0601U — traffic beacon: showcase-road actors render as bright blocks.
    var wantBeacon = _trafficBeaconMode && v.source === 'showcase-road';

    var prev = _meshes[v.id];
    var needNew = !prev ||
      (prev._actorType !== v.actorType) ||
      (prev._variant   !== v.variant)   ||
      (prev._shapeMode !== _visMode)    ||
      (prev._lodTier   !== resolved.lodTier) ||
      (prev._depth     !== _depthEnabled)    ||
      (prev._primitive !== _primitive3d)     ||
      (prev._visualStateKey !== (v.visualState || null)) ||   // 0603G station recolour
      (!!prev._beacon  !== wantBeacon);      // beacon toggle → one rebuild

    if (needNew) {
      try {
        // Tear down prior mesh + its per-object scene
        if (prev && _scenes[v.id]) { _scenes[v.id].remove(prev); }
        var mesh = wantBeacon
          ? _buildTrafficBeacon(v.variant || 'sedan_red')
          : _buildMesh(v.actorType || 'hero_car', v.variant || 'sedan_red', resolved.lodTier, v.visualState, v);
        mesh._beacon = wantBeacon;
        mesh._actorType = v.actorType;
        mesh._variant   = v.variant;
        mesh._source    = v.source;
        mesh._shapeMode = _visMode;            // dirty-flag stamp; null invalidates
        mesh._visMode   = _visMode;            // legacy field, kept in sync
        mesh._lodTier   = resolved.lodTier;    // rebuild guard for LOD changes
        mesh._depth     = _depthEnabled;       // rebuild guard for depth toggle
        mesh._primitive = _primitive3d;        // rebuild guard for primitive toggle
        mesh.name       = v.id;
        // 0602I — single depth-policy authority. Replaces the prior source-specific
        // hardcoding (showcase depth-off, hero grade mode). Production actors get
        // 'road' (occluded by real 3D geometry); debug overrides only when an
        // explicit grade/beacon/test mode requests them.
        var policy = _resolveActorDepthPolicy(v);
        _applyDepthPolicyToMesh(mesh, policy);
        mesh._depthPolicyMode = policy.mode;
        // 0603E — carry truth-actor visual fields on the mesh (future color/glyph
        // authority) and honour opacity during build.
        if (v.paletteRef != null)  mesh._paletteRef  = v.paletteRef;
        if (v.glyphRef != null)    mesh._glyphRef    = v.glyphRef;
        if (v.visualState != null) mesh._visualState = v.visualState;
        mesh._visualStateKey = (v.visualState || null);   // 0603G recolour rebuild guard
        // 0603I — store (do not resolve) visual identity instructions on the mesh.
        if (v.visualIdentityKey != null) mesh._visualIdentityKey = v.visualIdentityKey;
        if (v.silhouetteClass != null)   mesh._silhouetteClass   = v.silhouetteClass;
        // 0603O — store (do not resolve) asset instructions on the mesh.
        if (v.assetId != null)       mesh._assetId       = v.assetId;
        if (v.assetKey != null)      mesh._assetKey      = v.assetKey;
        if (v.assetCategory != null) mesh._assetCategory = v.assetCategory;
        if (v.assetLabel != null)    mesh._assetLabel    = v.assetLabel;
        if (v.renderVariant != null) mesh._renderVariant = v.renderVariant;
        if (v.materialClass != null)     mesh._materialClass     = v.materialClass;
        if (v.lightClass != null)        mesh._lightClass        = v.lightClass;
        if (v.decalClass != null)        mesh._decalClass        = v.decalClass;
        // 0603J — presentation mesh metadata + scale-class (recorded once on build).
        if (v.scaleClass != null)    mesh._scaleClass    = v.scaleClass;
        if (v.priorityClass != null) mesh._priorityClass = v.priorityClass;
        if (mesh._presentationMeshKind == null) mesh._presentationMeshKind = (_lastShapeBuild && _lastShapeBuild.mode) || null;
        if (v.silhouetteClass) {
          mesh._presentationPaletteKey = (function () { var p = _palette(v); return p && p.key; })();
          mesh._presentationScaleMultiplier = _scaleClassMul(v.scaleClass) * _visibilityScaleMul(v.silhouetteClass);
          mesh._visibilityScaleMultiplier = _visibilityScaleMul(v.silhouetteClass);
          var _vp = _visibilityProfile(v.silhouetteClass);
          mesh._visibilityShadowMultiplier = _vp && _vp.shadow != null ? _vp.shadow : 1.0;
        }
        if (v.opacity != null && v.opacity < 1) _setMeshOpacity(mesh, v.opacity);
        _meshes[v.id]   = mesh;
        // Per-object scene (created when renderer ready; re-attached in onAdd otherwise)
        if (global.THREE && (_scene || _renderer)) _scenes[v.id] = _makeScene(mesh);
      } catch (err) {
        if (_primitive3d) _lastPrimitiveError = { message: err && err.message ? err.message : String(err), timestamp: Date.now() };
        _recordUpsertFailure('mesh_build_failed', v, { message: err && err.message ? err.message : String(err) });
        return false;
      }
    }

    // ALWAYS apply transform every successful frame — even when mesh is reused.
    // This is the live motion authority; it must run on every upsert.
    try {
      _applyTransform(_meshes[v.id], v, resolved);
      _lastTransformAt = Date.now();
      _lastTransformPayload = {
        id: v.id, lat: v.lat, lng: v.lng, headingDeg: v.headingDeg, shapeMode: _visMode,
      };
    } catch (err) {
      _recordUpsertFailure('transform_failed', v, { message: err && err.message ? err.message : String(err) });
      return false;
    }

    // 0603E — opacity reinforcement for truth actors (e.g. station nodes). Only
    // re-applies when the target actually changed (avoids per-frame churn).
    if (v.opacity != null) {
      var tgt = Math.max(0, Math.min(1, Number(v.opacity)));
      var em = _meshes[v.id];
      if (em && (em._appliedOpacity == null || Math.abs(em._appliedOpacity - tgt) > 0.001)) {
        _setMeshOpacity(em, tgt);
      }
    }

    _recordUpsertSuccess(v);

    // 0601N — nudge Mapbox to render the next frame so the new/updated mesh shows.
    if (_map && _enabled) {
      try { _map.triggerRepaint(); } catch (e) {}
    }

    return true;
  }

  // Safe no-op if id not found; never throws (0531N requirement).
  function removeVehicle(id) {
    try {
      if (_meshes[id]) {
        if (_scenes[id]) { _scenes[id].remove(_meshes[id]); delete _scenes[id]; }
        delete _meshes[id];
      }
      delete _vehicles[id];
    } catch (e) { /* removal is non-fatal */ }
  }

  function clear() {
    Object.keys(_meshes).forEach(function (id) {
      if (_scenes[id]) { _scenes[id].remove(_meshes[id]); delete _scenes[id]; }
    });
    _meshes   = {};
    _vehicles = {};
  }

  // 0602K — set a uniform opacity across an actor's mesh (entry/exit fades).
  // Walks children, toggles transparency, preserves colour + depth policy, never
  // replaces materials. Optional-safe: missing actor / THREE returns false.
  // Low-level: apply a uniform opacity directly to a mesh (used at build time,
  // before the mesh is registered, and by setActorOpacity by id).
  function _setMeshOpacity(mesh, opacity) {
    if (!mesh || !mesh.traverse) return false;
    var o = Math.max(0, Math.min(1, Number(opacity)));
    mesh.traverse(function (child) {
      var mat = child.material;
      if (!mat) return;
      var arr = Array.isArray(mat) ? mat : [mat];
      arr.forEach(function (m) {
        if (!m) return;
        if (m._baseOpacity == null) m._baseOpacity = (m.opacity != null ? m.opacity : 1);
        m.transparent = (o < 1) || m.transparent === true;
        m.opacity     = m._baseOpacity * o;
        m.needsUpdate = true;
      });
    });
    mesh._appliedOpacity = o;
    return true;
  }

  function setActorOpacity(id, opacity) {
    var ok = _setMeshOpacity(_meshes[id], opacity);
    if (ok && _map) { try { _map.triggerRepaint(); } catch (e) {} }
    return ok;
  }

  // ── Session rebind / registry recovery (0601B) ────────────────────────────────
  //
  // WorldSpaceVehicleLayer owns vehicle MESH continuity, not actor/runtime/route
  // lifecycle. But mesh continuity must survive runtime transitions: a Drive
  // restart can leave the layer alive with an empty registry while runtimes are
  // active. attemptSessionRebind() re-registers missing vehicles from the live
  // runtimes. It is idempotent — repeated calls converge to the same registry.

  function _heroRuntimeActive() {
    var hrt = global.SBE && SBE.HeroVehicleRuntime;
    if (!hrt || typeof hrt.getEntity !== 'function') return false;
    var e = hrt.getEntity();
    return !!(e && e.active);
  }

  function _trafficRuntimeActive() {
    var trt = global.SBE && SBE.TrafficOccupancyRuntime;
    if (!trt || typeof trt.getState !== 'function') return false;
    var s = trt.getState();
    return !!(s && s.active && s.count > 0);
  }

  // Snapshot of registry vs runtime truth.
  function validateVehicleRegistry() {
    var trt = global.SBE && SBE.TrafficOccupancyRuntime;
    var trafficState = trt && typeof trt.getState === 'function' ? trt.getState() : null;
    return {
      heroPresent:   !!_vehicles['hero'],
      trafficCount:  Object.keys(_vehicles).filter(function (id) {
        return id !== 'hero' && _vehicles[id].source !== 'test';
      }).length,
      meshCount:     Object.keys(_meshes).length,
      runtimeActive: _heroRuntimeActive(),
      trafficRuntimeActive: _trafficRuntimeActive(),
      trafficRuntimeCount:  trafficState ? trafficState.count : 0,
    };
  }

  // Re-register any vehicle that exists in a runtime but is missing from the
  // layer registry. Safe to call repeatedly. Never throws into RAF.
  function attemptSessionRebind() {
    var before = Object.keys(_vehicles).length;
    var heroRecovered = false, trafficRecovered = false;

    // ── Hero recovery ──────────────────────────────────────────────────────────
    // If hero runtime is active but 'hero' is missing from the registry, pull the
    // live entity (lat/lng/heading) directly and upsert it. Idempotent: if 'hero'
    // already exists, the renderer's RAF keeps it fresh and we skip recovery.
    try {
      var hrt = global.SBE && SBE.HeroVehicleRuntime;
      if (hrt && typeof hrt.getEntity === 'function') {
        var e = hrt.getEntity();
        if (e && e.active && e.lat != null && !_vehicles['hero']) {
          if (_enabled && isRenderReady()) {
            var ok = upsertVehicle({
              id: 'hero', actorType: 'hero_car', variant: 'sedan_red',
              lat: e.lat, lng: e.lng, headingDeg: e.headingDeg || 0,
              scale: 1, visible: true, source: 'hero-live',
            });
            heroRecovered = !!ok;
          }
        }
      }
    } catch (err) {
      console.warn('[WorldSpaceVehicleLayer] hero rebind failed:', err && err.message ? err.message : err);
    }

    // ── Traffic recovery ───────────────────────────────────────────────────────
    // Traffic positions live in the traffic renderer's markers. Delegate the
    // re-bind to it (it re-upserts each actor from last-known live state). WSL
    // does not own traffic actor data — it only asks the renderer to re-emit.
    try {
      if (_trafficRuntimeActive()) {
        var tr = global.SBE && SBE.TrafficOccupancyRenderer;
        var trafficBefore = Object.keys(_vehicles).length;
        if (tr && typeof tr.rebindWorld === 'function') {
          tr.rebindWorld();
        }
        trafficRecovered = Object.keys(_vehicles).length > trafficBefore;
      }
    } catch (err) {
      console.warn('[WorldSpaceVehicleLayer] traffic rebind failed:', err && err.message ? err.message : err);
    }

    var after = Object.keys(_vehicles).length;
    var result = {
      heroRecovered:   heroRecovered,
      trafficRecovered: trafficRecovered,
      vehiclesBefore:  before,
      vehiclesAfter:   after,
    };
    if (heroRecovered || trafficRecovered) {
      console.log('[WorldSpaceVehicleLayer] sessionRebind recovered —', result);
    }
    return result;
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

  var SHAPE_MODES = ['block', 'slab', 'wedge', 'vehicle'];

  // setShapeMode — 0531M canonical API. block|slab|wedge|vehicle.
  //
  // Shape changes INVALIDATE mesh shape; they do NOT replace live motion authority.
  // Instead of rebuilding from stale stored snapshots, we mark each existing mesh
  // dirty (_shapeMode = null). The next live RAF upsertVehicle(payload) sees the
  // mismatch (prev._shapeMode !== _visMode), rebuilds from the FRESH payload, and
  // continues applying transforms every frame. This keeps the car following the
  // live route after every mode switch.
  function setShapeMode(m) {
    if (SHAPE_MODES.indexOf(m) === -1) {
      console.warn('[WorldSpaceVehicleLayer] unknown shapeMode:', m, '— use:', SHAPE_MODES.join(' | '));
      return;
    }
    if (m === _visMode) return;
    _visMode = m;
    // Invalidate every existing mesh — next live upsert rebuilds from fresh payload
    Object.keys(_meshes).forEach(function (id) {
      if (_meshes[id]) _meshes[id]._shapeMode = null;
    });
    console.log('[WorldSpaceVehicleLayer] shapeMode →', _visMode,
      '— meshes invalidated; next live payload rebuilds');
  }

  function getShapeMode() { return _visMode; }

  // Legacy alias — old code calling visibilityMode('block'|'vehicle') still works.
  function setVisibilityMode(m) { return setShapeMode(m); }
  function getVisibilityMode()  { return _visMode; }

  function setShapeScale(s) {
    if (s === undefined) return _shapeScale;
    _shapeScale = Math.max(0.1, Number(s) || 1.0);
    Object.keys(_vehicles).forEach(function (id) {
      try { if (_meshes[id]) _applyTransform(_meshes[id], _vehicles[id]); }
      catch (e) { /* re-scale of one mesh failed; live RAF will recover */ }
    });
    return _shapeScale;
  }
  function getShapeScale() { return _shapeScale; }

  // ── LOD control (0601A) ───────────────────────────────────────────────────────

  // Toggling adaptive LOD invalidates meshes so they rebuild at the correct tier
  // (adaptive) or at full 'near' detail (manual). No route/motion impact.
  function setAdaptiveLOD(on) {
    var next = !!on;
    if (next === _adaptiveLOD) return _adaptiveLOD;
    _adaptiveLOD = next;
    Object.keys(_meshes).forEach(function (id) {
      if (_meshes[id]) _meshes[id]._lodTier = null;   // force rebuild next upsert
    });
    console.log('[WorldSpaceVehicleLayer] adaptiveLOD →', _adaptiveLOD);
    return _adaptiveLOD;
  }
  function getAdaptiveLOD() { return _adaptiveLOD; }

  // Depth toggle. Switches between depth-enhanced and flatter geometry.
  // Invalidates meshes once so they rebuild at the new depth profile (not per-frame).
  function setDepthEnabled(on) {
    var next = !!on;
    if (next === _depthEnabled) return _depthEnabled;
    _depthEnabled = next;
    Object.keys(_meshes).forEach(function (id) {
      if (_meshes[id]) _meshes[id]._depth = null;   // force rebuild next upsert
    });
    console.log('[WorldSpaceVehicleLayer] depthEnabled →', _depthEnabled);
    return _depthEnabled;
  }
  function getDepthEnabled() { return _depthEnabled; }

  // 0602A-B — hero grade mode: 'road' (default) | 'visual' | 'alwaysOn'.
  function setHeroGradeMode(mode) {
    if (mode !== 'road' && mode !== 'visual' && mode !== 'alwaysOn') {
      console.warn('[WorldSpaceVehicleLayer] heroGradeMode: invalid', mode, '— use road|visual|alwaysOn');
      return _heroGradeMode;
    }
    _heroGradeMode = mode;
    _heroAlwaysOn  = (mode === 'alwaysOn');          // keep mirror in sync
    if (_meshes['hero']) _applyHeroGradeMode(_meshes['hero']);
    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
    console.log('[WorldSpaceVehicleLayer] heroGradeMode →', _heroGradeMode);
    return _heroGradeMode;
  }
  function getHeroGradeMode() { return _heroGradeMode; }

  // 0602B — debug heading calibration. Sets the single explicit heading
  // correction constant and re-applies the hero transform so the change is
  // visible immediately. Heading math is unchanged; only the offset moves.
  function setHeadingOffset(deg) {
    var n = Number(deg);
    if (!isFinite(n)) { console.warn('[WorldSpaceVehicleLayer] setHeadingOffset: invalid', deg); return VEHICLE_HEADING_OFFSET_DEG; }
    VEHICLE_HEADING_OFFSET_DEG = n;
    // Re-apply via upsertVehicle so hero scale/LOD floors are preserved.
    var hero = _meshes['hero'];
    if (hero && hero._lastV && hero._lastV.lat != null) {
      try { upsertVehicle({ id: 'hero', actorType: 'hero_car', variant: 'sedan_red',
        lat: hero._lastV.lat, lng: hero._lastV.lng, headingDeg: hero._lastV.headingDeg || 0,
        scale: 1, visible: true, source: 'hero-live' }); } catch (e) {}
    }
    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
    console.log('[WorldSpaceVehicleLayer] headingOffsetDeg →', VEHICLE_HEADING_OFFSET_DEG);
    return VEHICLE_HEADING_OFFSET_DEG;
  }
  function getHeadingOffset() { return VEHICLE_HEADING_OFFSET_DEG; }

  // 0602A-C — report the hero mesh's live draw state (for grade audit).
  function getHeroDrawState() {
    var mesh = _meshes['hero'];
    if (!mesh) return null;
    var mats = [];
    if (mesh.traverse) mesh.traverse(function (child) {
      if (!child.material) return;
      var arr = Array.isArray(child.material) ? child.material : [child.material];
      arr.forEach(function (m) { if (m && mats.length < 1) mats.push({ depthTest: m.depthTest, depthWrite: m.depthWrite }); });
    });
    var m0 = mats[0] || {};
    return {
      gradeMode:     _heroGradeMode,
      heroAlwaysOn:  _heroAlwaysOn,
      visible:       mesh.visible !== false,
      renderOrder:   mesh.renderOrder,
      frustumCulled: mesh.frustumCulled,
      positionZ:     mesh.position ? mesh.position.z : null,
      depthTest:     m0.depthTest,
      depthWrite:    m0.depthWrite,
      headingDeg:        mesh._headingDeg,
      appliedHeadingDeg: mesh._appliedHeadingDeg,
      headingOffsetDeg:  VEHICLE_HEADING_OFFSET_DEG,
      rotationZ:         mesh.rotation ? mesh.rotation.z : null,
      localForwardAxis:  '+Y',
      forwardBearingDeg: getHeroForwardBearingDeg(),
    };
  }

  // 0602B — compass bearing the hero NOSE points, derived from the ACTUAL mesh
  // rotation.z and the model-matrix −Y handedness flip (not assumed). Local
  // forward is +Y. Returns degrees clockwise from north [0,360).
  function getHeroForwardBearingDeg() {
    var mesh = _meshes['hero'];
    if (!mesh || !mesh.rotation) return null;
    var rz = mesh.rotation.z;                       // applied as -appliedHdg·π/180
    // local +Y rotated about Z:
    var fx = -Math.sin(rz), fy = Math.cos(rz);
    // model matrix scales Y by -1 → mercator dir (x = east, y = south):
    var mx = fx, my = -fy;
    // bearing clockwise from north: north = -my (mercator +y is south), east = mx
    var deg = Math.atan2(mx, -my) * 180 / Math.PI;
    return (deg + 360) % 360;
  }

  // 0601Z-A → 0602A — kept for back-compat; maps to grade mode alwaysOn/road.
  function setHeroAlwaysOn(on) {
    return setHeroGradeMode(on ? 'alwaysOn' : 'road') === 'alwaysOn';
  }
  function getHeroAlwaysOn() { return _heroAlwaysOn; }

  // 0601T-B — debug visibility boost. Re-applies transforms so static (non-RAF)
  // showcase actors pick up the new scale floor immediately.
  function setVisibilityBoost(on) {
    _visibilityBoost = !!on;
    Object.keys(_vehicles).forEach(function (id) {
      if (_meshes[id]) {
        try { _applyTransform(_meshes[id], _vehicles[id], _resolveForVehicle(_vehicles[id])); }
        catch (e) {}
      }
    });
    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
    console.log('[WorldSpaceVehicleLayer] visibilityBoost →', _visibilityBoost);
    return _visibilityBoost;
  }
  function getVisibilityBoost() { return _visibilityBoost; }

  // 0601U — traffic beacon mode. Invalidates showcase-road meshes so they rebuild
  // as bright blocks (or back to vehicles when disabled). Hero is never affected.
  function setTrafficBeaconMode(on) {
    _trafficBeaconMode = !!on;
    Object.keys(_meshes).forEach(function (id) {
      var v = _vehicles[id];
      if (v && v.source === 'showcase-road' && _meshes[id]) {
        _meshes[id]._beacon = null;                       // force geometry rebuild
        // 0602I — re-apply depth policy live so the road/debugBeacon split takes
        // effect immediately, even before the next geometry rebuild.
        _applyDepthPolicyToMesh(_meshes[id], _resolveActorDepthPolicy(v));
      }
    });
    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
    console.log('[WorldSpaceVehicleLayer] trafficBeaconMode →', _trafficBeaconMode);
    return _trafficBeaconMode;
  }
  function getTrafficBeaconMode() { return _trafficBeaconMode; }

  // 0602I — inspect the resolved depth policy for every actor (read-only).
  function getActorDepthPolicyState() {
    return {
      heroGradeMode:     _heroGradeMode,
      trafficBeaconMode: _trafficBeaconMode,
      actors: Object.keys(_vehicles).map(function (id) {
        var v = _vehicles[id];
        var p = _resolveActorDepthPolicy(v);
        return {
          id:              id,
          source:          v.source,
          actorType:       v.actorType,
          depthPolicyMode: p.mode,
          depthTest:       p.depthTest,
          depthWrite:      p.depthWrite,
          renderOrder:     p.renderOrder,
          frustumCulled:   p.frustumCulled,
          localZLift:      p.localZLift,
        };
      }),
    };
  }

  function getDepthState() {
    return {
      depthEnabled:    _depthEnabled,
      cameraProfile:   _currentCameraProfile(),
      depthMultiplier: _depthMultiplier(),
      vehicles: Object.keys(_vehicles).map(function (id) {
        var v = _vehicles[id];
        var r = _resolveForVehicle(v);
        var d = _dims(v.actorType);
        var mesh = _meshes[id];
        return {
          id:              id,
          actorType:       v.actorType,
          variant:         v.variant,
          lodTier:         mesh ? mesh._lodTier : r.lodTier,
          dimensions:      d,
          finalScale:      Math.round(r.finalScale * 1000) / 1000,
          depthMultiplier: _depthEnabled ? _depthMultiplier() : 1.0,
          meshProfile:     _depthEnabled ? 'depth' : 'flat',
        };
      }),
    };
  }

  // ── 3D primitive proof control (0601G) ────────────────────────────────────────

  // Toggling primitive proof invalidates meshes once → rebuild at new geometry.
  function setPrimitive3d(on) {
    var next = !!on;
    if (next === _primitive3d) return _primitive3d;
    _primitive3d = next;
    Object.keys(_meshes).forEach(function (id) { if (_meshes[id]) _meshes[id]._primitive = null; });
    console.log('[WorldSpaceVehicleLayer] primitive3d →', _primitive3d);
    return _primitive3d;
  }
  function getPrimitive3d() { return _primitive3d; }

  function setPrimitive3dForceNear(on) {
    _primitive3dForceNear = !!on;
    // lodTier is part of the rebuild key, so this naturally triggers a rebuild
    Object.keys(_meshes).forEach(function (id) { if (_meshes[id]) _meshes[id]._lodTier = null; });
    return _primitive3dForceNear;
  }
  function getPrimitive3dForceNear() { return _primitive3dForceNear; }

  function getPrimitiveState() {
    var carCount = 0, truckCount = 0, primCount = 0;
    Object.keys(_meshes).forEach(function (id) {
      if (!_meshes[id]._primitive) return;
      primCount++;
      if (_meshes[id]._actorType === 'box_truck') truckCount++; else carCount++;
    });
    return {
      primitive3dEnabled: _primitive3d,
      forceNear:          _primitive3dForceNear,
      vehicleCount:       Object.keys(_vehicles).length,
      primitiveCount:     primCount,
      carPrimitiveCount:  carCount,
      truckPrimitiveCount: truckCount,
      lastPrimitiveBuild: _lastPrimitiveBuild,
      lastPrimitiveError: _lastPrimitiveError,
    };
  }

  // ── Transform mode control (0601J) ────────────────────────────────────────────

  // Switching transform mode re-applies the transform to every live vehicle so
  // static (non-RAF) objects update immediately. Geometry is NOT rebuilt.
  function setTransformMode(m) {
    if (m !== 'modelMatrix' && m !== 'vehicleMatrix') {
      console.warn('[WorldSpaceVehicleLayer] unknown transformMode:', m, '— use: modelMatrix | vehicleMatrix');
      return _transformMode;
    }
    _transformMode = m;
    Object.keys(_vehicles).forEach(function (id) {
      if (_meshes[id]) {
        try { _applyTransform(_meshes[id], _vehicles[id], _lastScaleResolve && _lastScaleResolve.lodTier ? _lastScaleResolve : null); }
        catch (e) { _lastTransformError = e && e.message ? e.message : String(e); }
      }
    });
    console.log('[WorldSpaceVehicleLayer] transformMode →', _transformMode);
    return _transformMode;
  }
  function getTransformMode() { return _transformMode; }

  function getTransformState() {
    var modelCount = 0, vehCount = 0;
    Object.keys(_meshes).forEach(function (id) {
      if (_meshes[id]._transformMode === 'modelMatrix') modelCount++;
      else if (_meshes[id]._transformMode === 'vehicleMatrix') vehCount++;
    });
    return {
      mode:               _transformMode,
      layerMounted:       _isLayerMounted(),
      vehicleCount:       Object.keys(_vehicles).length,
      modelMatrixCount:   modelCount,
      vehicleMatrixCount: vehCount,
      lastTransform:      _lastTransformPayload,
      lastTransformMode:  _lastTransformMode,
      lastTransformError: _lastTransformError,
      renderCount:        _renderCount,
      lastRenderAt:       _lastRenderAt,
      renderPassCount:          _renderPassCount,
      lastRenderPassAt:         _lastRenderPassAt,
      renderEarlyReturnReason:  _renderEarlyReturnReason,
      lastRenderAuditSnapshot:  _lastRenderAuditSnapshot,
      lastRenderedVehicleId:  _lastRenderedVehicleId,
      lastRenderObjectCount:  _lastRenderObjectCount,
      lastRenderSkippedCount: _lastRenderSkippedCount,
    };
  }

  // ── Render-visibility truth (0601K) ───────────────────────────────────────────

  var PROJ_MARGIN_PX = 200;   // off-screen tolerance for "near viewport"

  // Project a vehicle lng/lat to screen space. Returns null if unavailable.
  function _projectVehicleToScreen(v) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : _map;
    if (!map || typeof map.project !== 'function' || !v || v.lng == null || v.lat == null) return null;
    var pt, canvas;
    try { pt = map.project([v.lng, v.lat]); } catch (e) { return null; }
    try { canvas = map.getCanvas(); } catch (e) { return null; }
    var w = canvas ? canvas.clientWidth  : 0;
    var h = canvas ? canvas.clientHeight : 0;
    var inViewport = pt.x >= 0 && pt.x <= w && pt.y >= 0 && pt.y <= h;
    // distance from viewport rectangle (0 if inside)
    var dx = pt.x < 0 ? -pt.x : (pt.x > w ? pt.x - w : 0);
    var dy = pt.y < 0 ? -pt.y : (pt.y > h ? pt.y - h : 0);
    var dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    return {
      x: Math.round(pt.x), y: Math.round(pt.y),
      inViewport: inViewport,
      nearViewport: dist <= PROJ_MARGIN_PX,
      distanceFromViewportPx: dist,
    };
  }

  // Resolve visibility confidence. Never returns 'visual_confirmed' from automated
  // signals — only an explicit confirmVisible() flag can grant that.
  function _resolveVisibilityConfidence(mesh, v) {
    if (!mesh) return 'none';
    if (mesh._visualConfirmed) return 'visual_confirmed';
    var transformed = !!mesh._lastTransformAt;
    var rendered    = !!mesh._lastRenderAt;
    if (!transformed && !rendered) return 'none';
    if (transformed && !rendered) return 'transform_only';
    // rendered === true below
    var screen = _projectVehicleToScreen(v);
    var onScreen = !!(screen && (screen.inViewport || screen.nearViewport));
    return onScreen ? 'projected_on_screen' : 'rendered_unconfirmed';
  }

  // Per-vehicle render-truth record (separates transformed/rendered/projected).
  function _vehicleRenderTruth(id) {
    var v    = _vehicles[id];
    var mesh = _meshes[id];
    var screen = v ? _projectVehicleToScreen(v) : null;
    var confidence = _resolveVisibilityConfidence(mesh, v);
    return {
      id:                id,
      transformMode:     mesh ? mesh._transformMode : null,
      transformed:       !!(mesh && mesh._lastTransformAt),
      rendered:          !!(mesh && mesh._lastRenderAt),
      projectedOnScreen: !!(screen && (screen.inViewport || screen.nearViewport)),
      visibilityConfidence: confidence,
      lastTransformAt:   mesh ? mesh._lastTransformAt || null : null,
      lastRenderAt:      mesh ? mesh._lastRenderAt    || null : null,
      lastProjectedAt:   screen ? Date.now() : null,
      renderCountForMesh: mesh ? mesh._renderCount || 0 : 0,
      screenPosition:    screen,
    };
  }

  // 0601L — render pass audit accessor
  function getRenderPassState() {
    return {
      layerAdded:              _layerAdded,
      layerMounted:            _isLayerMounted(),
      lastHardRemountAt:       _lastHardRemountAt,
      lastHardRemountReason:   _lastHardRemountReason,
      lastHardRemountResult:   _lastHardRemountResult,
      hardRemountInFlight:     _hardRemountInFlight,
      lastStyledataAt:         _lastStyledataAt,
      styledataCount:          _styledataCount,
      styleRemountScheduled:   _styleRemountScheduled,
      styleRemountExecuted:    _styleRemountExecuted,
      renderPassCount:         _renderPassCount,
      lastRenderPassAt:        _lastRenderPassAt,
      renderCount:             _renderCount,
      lastRenderAt:            _lastRenderAt,
      renderEarlyReturnReason: _renderEarlyReturnReason,
      lastRenderAuditSnapshot: _lastRenderAuditSnapshot,
      lastRenderObjectCount:   _lastRenderObjectCount,
      lastRenderSkippedCount:  _lastRenderSkippedCount,
      lastRenderedVehicleId:   _lastRenderedVehicleId,
      meshCount:               Object.keys(_meshes).length,
      sceneCount:              Object.keys(_scenes).length,
    };
  }

  function getRenderTruth() {
    var ids = Object.keys(_vehicles);
    var transformed = 0, rendered = 0, projected = 0, confirmed = 0;
    var vehicles = ids.map(function (id) {
      var t = _vehicleRenderTruth(id);
      if (t.transformed) transformed++;
      if (t.rendered) rendered++;
      if (t.projectedOnScreen) projected++;
      if (t.visibilityConfidence === 'visual_confirmed') confirmed++;
      return t;
    });
    return {
      vehicleCount:           ids.length,
      transformedCount:       transformed,
      renderedCount:          rendered,
      projectedOnScreenCount: projected,
      visualConfirmedCount:   confirmed,
      renderCount:            _renderCount,
      lastRenderAt:           _lastRenderAt,
      lastRenderedVehicleId:  _lastRenderedVehicleId,
      lastRenderObjectCount:  _lastRenderObjectCount,
      lastRenderSkippedCount: _lastRenderSkippedCount,
      vehicles:               vehicles,
    };
  }

  // Manual visual confirmation (does not corrupt automated truth)
  function confirmVisible(id) {
    if (_meshes[id]) { _meshes[id]._visualConfirmed = true; return true; }
    return false;
  }
  function clearVisibilityConfirm(id) {
    if (_meshes[id]) { _meshes[id]._visualConfirmed = false; return true; }
    return false;
  }

  // ── Mesh visibility audit (0601P) ─────────────────────────────────────────────
  // Diagnostic only — proves exactly why a mesh is skipped before renderer.render().
  // The render loop skip condition is: !mesh || !scene || mesh.visible === false.
  function _auditMeshVisibility(id) {
    var mesh    = _meshes[id];
    var scene   = _scenes[id];
    var vehicle = _vehicles[id];

    if (!mesh) {
      return { id: id, exists: false, reason: 'missing_mesh' };
    }

    var childCount = mesh.children ? mesh.children.length : 0;
    var visibleChildren = 0, invisibleChildren = 0;
    var materialInvisibleCount = 0, zeroOpacityCount = 0, transparentCount = 0;

    if (mesh.children) {
      mesh.children.forEach(function (child) {
        if (child.visible === false) invisibleChildren += 1; else visibleChildren += 1;
        var mat = child.material;
        if (mat) {
          if (mat.visible === false) materialInvisibleCount += 1;
          if (mat.opacity === 0)     zeroOpacityCount += 1;
          if (mat.transparent === true) transparentCount += 1;
        }
      });
    }

    var screen = vehicle ? _projectVehicleToScreen(vehicle) : null;

    return {
      id: id,
      exists: true,
      vehicleExists: !!vehicle,
      sceneExists: !!scene,
      sceneHasMesh: !!(scene && scene.children && scene.children.indexOf(mesh) !== -1),

      meshVisible: mesh.visible !== false,
      childCount: childCount,
      visibleChildren: visibleChildren,
      invisibleChildren: invisibleChildren,

      materialInvisibleCount: materialInvisibleCount,
      zeroOpacityCount: zeroOpacityCount,
      transparentCount: transparentCount,

      frustumCulled: mesh.frustumCulled,
      matrixAutoUpdate: mesh.matrixAutoUpdate,

      scale: {
        x: mesh.scale ? mesh.scale.x : null,
        y: mesh.scale ? mesh.scale.y : null,
        z: mesh.scale ? mesh.scale.z : null,
      },
      position: {
        x: mesh.position ? mesh.position.x : null,
        y: mesh.position ? mesh.position.y : null,
        z: mesh.position ? mesh.position.z : null,
      },

      hasModelMatrix: !!mesh._modelMatrix,
      transformMode: mesh._transformMode || null,
      lastTransformAt: mesh._lastTransformAt || null,
      lastRenderAt: mesh._lastRenderAt || null,
      renderCountForMesh: mesh._renderCount || 0,

      projectedOnScreen: !!(screen && (screen.inViewport || screen.nearViewport)),
      screenPosition: screen,

      skipReason: !scene ? 'missing_scene'
        : mesh.visible === false ? 'mesh_visible_false'
        : !(scene.children && scene.children.indexOf(mesh) !== -1) ? 'mesh_not_attached_to_scene'
        : childCount === 0 ? 'mesh_has_no_children'
        : visibleChildren === 0 ? 'all_children_invisible'
        : materialInvisibleCount === childCount ? 'all_materials_invisible'
        : zeroOpacityCount === childCount ? 'all_materials_zero_opacity'
        : 'not_skipped_by_visibility_audit',
    };
  }

  function _computeLodCounts() {
    var counts = { near: 0, mid: 0, far: 0, tiny: 0 };
    Object.keys(_meshes).forEach(function (id) {
      var t = _meshes[id]._lodTier;
      if (t && counts[t] != null) counts[t]++;
    });
    _lodCounts = counts;
    return counts;
  }

  // Full per-vehicle scale report for _wos.debug.worldVehicles.scaleState()
  function getScaleState() {
    var mvr  = global.SBE && SBE.MapboxViewportRuntime;
    var map  = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : _map;
    var zoom = null, pitch = null;
    if (map) {
      try { zoom = Math.round(map.getZoom() * 10) / 10; } catch (e) {}
      try { pitch = Math.round(map.getPitch() * 10) / 10; } catch (e) {}
    }
    var profile = _currentCameraProfile();
    return {
      adaptiveLOD:   _adaptiveLOD,
      shapeScale:    _shapeScale,
      zoom:          zoom,
      pitch:         pitch,
      cameraProfile: profile,
      vehicles: Object.keys(_vehicles).map(function (id) {
        var v = _vehicles[id];
        var r = _resolveForVehicle(v);
        return {
          id:           id,
          actorType:    v.actorType,
          variant:      v.variant,
          lodTier:      r.lodTier,
          baseScale:    r.baseScale,
          zoomScale:    r.zoomScale,
          typeScale:    r.typeScale,
          profileScale: r.profileScale,
          finalScale:   Math.round(r.finalScale * 1000) / 1000,
        };
      }),
    };
  }

  // Per-vehicle visual identity report for _wos.debug.worldVehicles.visuals()
  function getVisualIdentityState() {
    return {
      registryLoaded: !!(global.SBE && SBE.VehicleVisualRegistry),
      vehicles: Object.keys(_vehicles).map(function (id) {
        var v    = _vehicles[id];
        var vis  = _visual(v.actorType, v.variant);
        var mesh = _meshes[id];
        return {
          id:            id,
          actorType:     v.actorType,
          variant:       v.variant,
          lodTier:       mesh ? mesh._lodTier : null,
          visualProfile: vis.visualProfile,
          bodyColor:     vis.bodyHex,
          accentColor:   vis.accentHex,
          graffiti:      vis.graffiti,
          sign:          vis.sign,
          worldVisible:  mesh ? mesh.visible !== false : false,
        };
      }),
    };
  }

  function setEnabled(v) {
    var next = !!v;
    var previous = _enabled;
    _enabled = next;
    // 0602C — forensic capture of every enable/disable transition (no behavior change).
    if (next !== previous) {
      if (next) { _enableCount += 1;  _lastEnableTime  = Date.now(); _lastEnableCaller  = _captureStack('WorldSpaceVehicleLayer enabled'); }
      else      { _disableCount += 1; _lastDisableTime = Date.now(); _lastDisableCaller = _captureStack('WorldSpaceVehicleLayer disabled'); }
    }
    // 0601S — visibility must track _enabled in BOTH directions. Previously
    // disabling hid all meshes but enabling never restored them, so the hero
    // stayed invisible until something (a camera click → rebuild) reset it.
    Object.keys(_meshes).forEach(function (id) {
      if (_meshes[id]) _meshes[id].visible = _enabled;
    });
    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
  }
  function getEnabled()  { return _enabled; }
  function isActive()    { return _active; }

  // ── Enable/render forensic accessors (0602C) ──────────────────────────────────
  function getEnableAudit() {
    return {
      active:                 _active,
      enabled:                _enabled,
      layerAdded:             _layerAdded,
      layerMounted:           _isLayerMounted(),
      renderReady:            !!(_renderer && _camera && _scene),
      vehicleCount:           Object.keys(_vehicles || {}).length,
      meshCount:              Object.keys(_meshes || {}).length,
      sceneCount:             Object.keys(_scenes || {}).length,
      heroRuntimeDetected:    _detectHeroRuntime(),
      trafficRuntimeDetected: _detectTrafficRuntime(),
      lastEarlyReturnReason:  _lastEarlyReturnReason,
      lastEarlyReturnAt:      _lastEarlyReturnAt,
      earlyReturnCount:       _earlyReturnCount,
      renderPassCount:        _renderPassCount || 0,
      renderCount:            _renderCount || 0,
    };
  }
  function getEnableHistory() {
    return {
      enableCount:       _enableCount,
      disableCount:      _disableCount,
      lastEnableTime:    _lastEnableTime,
      lastDisableTime:   _lastDisableTime,
      lastEnableCaller:  _lastEnableCaller,
      lastDisableCaller: _lastDisableCaller,
    };
  }
  function getRenderAudit() {
    return {
      renderPassCount:        _renderPassCount || 0,
      renderCount:            _renderCount || 0,
      earlyReturnCount:       _earlyReturnCount,
      lastEarlyReturnReason:  _lastEarlyReturnReason,
      lastEarlyReturnAt:      _lastEarlyReturnAt,
      lastRenderPassAt:       _lastRenderPassAt || null,
      lastRenderAt:           _lastRenderAt || null,
      lastRenderObjectCount:  _lastRenderObjectCount || 0,
      lastRenderSkippedCount: _lastRenderSkippedCount || 0,
    };
  }
  function setDebugMode(v) { _debugMode = !!v; }

  function setDebugScale(s) {
    _debugScale = Math.max(0.1, Number(s) || 1.0);
    // Re-apply transforms for all current vehicles
    Object.keys(_vehicles).forEach(function (id) {
      try { if (_meshes[id]) _applyTransform(_meshes[id], _vehicles[id]); }
      catch (e) { /* re-scale of one mesh failed; live RAF will recover */ }
    });
  }

  function getState() {
    return {
      active:         _active,
      enabled:        _enabled,
      threeAvailable: _threeOk,
      layerAdded:     _layerAdded,
      layerMounted:   _isLayerMounted(),
      lastHardRemountAt:     _lastHardRemountAt,
      lastHardRemountReason: _lastHardRemountReason,
      lastHardRemountResult: _lastHardRemountResult,
      hardRemountInFlight:   _hardRemountInFlight,
      lastStyledataAt:       _lastStyledataAt,
      styledataCount:        _styledataCount,
      styleRemountScheduled: _styleRemountScheduled,
      styleRemountExecuted:  _styleRemountExecuted,
      vehicleCount:   Object.keys(_vehicles).length,
      vehicles:       Object.keys(_vehicles).map(function (id) {
        var v = _vehicles[id];
        var mesh = _meshes[id];
        return {
          id:         id,
          source:     v.source,
          actorType:  v.actorType,
          variant:    v.variant,
          lat:        v.lat != null ? Math.round(v.lat * 1e5) / 1e5 : null,
          lng:        v.lng != null ? Math.round(v.lng * 1e5) / 1e5 : null,
          headingDeg: v.headingDeg,
          visible:    v.visible !== false,
          // Transform diagnostics (0601J)
          transformMode:    mesh ? mesh._transformMode : null,
          lodTier:          mesh ? mesh._lodTier : null,
          finalScale:       mesh ? mesh._finalScale : null,
          depthMultiplier:  mesh ? mesh._depthMult : null,
          appliedHeadingDeg: mesh ? mesh._appliedHeadingDeg : null,
          meterUnit:        mesh ? mesh._meterUnit : null,
          mercator:         mesh ? mesh._mercator : null,
          lastTransformAt:  mesh ? mesh._lastTransformAt : null,
          lastRenderAt:     mesh ? mesh._lastRenderAt : null,
          // Render-visibility truth (0601K) — transformed ≠ rendered ≠ visible
          transformed:          !!(mesh && mesh._lastTransformAt),
          rendered:             !!(mesh && mesh._lastRenderAt),
          projectedOnScreen:    (function () { var s = _projectVehicleToScreen(v); return !!(s && (s.inViewport || s.nearViewport)); }()),
          visibilityConfidence: _resolveVisibilityConfidence(mesh, v),
          screenPosition:       _projectVehicleToScreen(v),
        };
      }),
      instanceId:     INSTANCE_ID,
      transformMode:  _transformMode,
      transformValid: (_renderCount > 0 && !_lastTransformError),
      lastTransformMode:  _lastTransformMode,
      lastTransformError: _lastTransformError,
      headingOffsetDeg:   VEHICLE_HEADING_OFFSET_DEG,
      renderCount:    _renderCount,
      lastRenderAt:           _lastRenderAt,
      renderPassCount:          _renderPassCount,
      lastRenderPassAt:         _lastRenderPassAt,
      renderEarlyReturnReason:  _renderEarlyReturnReason,
      lastRenderAuditSnapshot:  _lastRenderAuditSnapshot,
      lastRenderedVehicleId:  _lastRenderedVehicleId,
      lastRenderObjectCount:  _lastRenderObjectCount,
      lastRenderSkippedCount: _lastRenderSkippedCount,
      transformTruthSummary:  (function () {
        var t = 0, r = 0, p = 0, c = 0;
        Object.keys(_vehicles).forEach(function (id) {
          var rt = _vehicleRenderTruth(id);
          if (rt.transformed) t++;
          if (rt.rendered) r++;
          if (rt.projectedOnScreen) p++;
          if (rt.visibilityConfidence === 'visual_confirmed') c++;
        });
        return { vehicleCount: Object.keys(_vehicles).length, transformedCount: t,
                 renderedCount: r, projectedOnScreenCount: p, visualConfirmedCount: c };
      }()),
      renderReady:    isRenderReady(),
      fallbackMode:   !isRenderReady(),
      beaconActive:   _beaconActive,
      visibilityMode: _visMode,
      shapeMode:      _visMode,
      shapeScale:     _shapeScale,
      adaptiveLOD:    _adaptiveLOD,
      depthEnabled:   _depthEnabled,
      depthMultiplier: _depthMultiplier(),
      lastScaleResolve: _lastScaleResolve,
      lodCounts:      _computeLodCounts(),
      heroRuntimeActive:    _heroRuntimeActive(),
      trafficRuntimeActive: _trafficRuntimeActive(),
      registrationHealthy:  (function () {
        // Healthy = no runtime is active-but-unregistered
        var heroOk = !_heroRuntimeActive() || !!_vehicles['hero'];
        var v = validateVehicleRegistry();
        var trafficOk = !v.trafficRuntimeActive || v.trafficCount > 0;
        return heroOk && trafficOk;
      }()),
      lastShapeBuild:      _lastShapeBuild,
      lastShapeBuildError: _lastShapeBuildError,
      lastTransformAt:      _lastTransformAt,
      lastTransformPayload: _lastTransformPayload,
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
    hardRemountLayer: function () { return _hardRemountLayer('manual_debug'); },
    isActive:       isActive,
    isRenderReady:  isRenderReady,
    setEnabled:     setEnabled,
    getEnabled:     getEnabled,
    startBeacon:       startBeacon,
    stopBeacon:        stopBeacon,
    setVisibilityMode:      setVisibilityMode,
    getVisibilityMode:      getVisibilityMode,
    setShapeMode:           setShapeMode,
    getShapeMode:           getShapeMode,
    setShapeScale:          setShapeScale,
    getShapeScale:          getShapeScale,
    setAdaptiveLOD:         setAdaptiveLOD,
    getAdaptiveLOD:         getAdaptiveLOD,
    getScaleState:          getScaleState,
    getVisualIdentityState: getVisualIdentityState,
    setDepthEnabled:        setDepthEnabled,
    getDepthEnabled:        getDepthEnabled,
    getDepthState:          getDepthState,
    getActorDepthPolicyState: getActorDepthPolicyState,
    getActorVisibilityProfile: function () { var o = {}; for (var k in ACTOR_VISIBILITY_PROFILE) if (ACTOR_VISIBILITY_PROFILE.hasOwnProperty(k)) o[k] = ACTOR_VISIBILITY_PROFILE[k]; return o; },
    setVisibilityBoost:     setVisibilityBoost,
    getVisibilityBoost:     getVisibilityBoost,
    setHeroAlwaysOn:        setHeroAlwaysOn,
    getHeroAlwaysOn:        getHeroAlwaysOn,
    setHeroGradeMode:       setHeroGradeMode,
    getHeroGradeMode:       getHeroGradeMode,
    getHeroDrawState:       getHeroDrawState,
    setHeadingOffset:       setHeadingOffset,
    getHeadingOffset:       getHeadingOffset,
    getHeroForwardBearingDeg: getHeroForwardBearingDeg,
    getEnableAudit:         getEnableAudit,
    getEnableHistory:       getEnableHistory,
    getRenderAudit:         getRenderAudit,
    setTrafficBeaconMode:   setTrafficBeaconMode,
    getTrafficBeaconMode:   getTrafficBeaconMode,
    setPrimitive3d:          setPrimitive3d,
    getPrimitive3d:          getPrimitive3d,
    setPrimitive3dForceNear: setPrimitive3dForceNear,
    getPrimitive3dForceNear: getPrimitive3dForceNear,
    getPrimitiveState:       getPrimitiveState,
    setTransformMode:        setTransformMode,
    getTransformMode:        getTransformMode,
    getTransformState:       getTransformState,
    getRenderPassState:      getRenderPassState,
    getRenderTruth:          getRenderTruth,
    getMeshVisibilityAudit:  function (id) { return _auditMeshVisibility(id || 'hero'); },
    confirmVisible:          confirmVisible,
    clearVisibilityConfirm:  clearVisibilityConfirm,
    projectVehicleToScreen:  _projectVehicleToScreen,
    attemptSessionRebind:   attemptSessionRebind,
    validateVehicleRegistry: validateVehicleRegistry,
    getInstanceId:          function () { return INSTANCE_ID; },
    setUpsertTraceEnabled:  setUpsertTraceEnabled,
    getUpsertTraceState:    getUpsertTraceState,
    upsertVehicle:          upsertVehicle,
    removeVehicle: removeVehicle,
    setActorOpacity:        setActorOpacity,
    clear:         clear,
    getState:      getState,
    getVisualState: getVisualState,
    setDebugMode:  setDebugMode,
    setDebugScale: setDebugScale,
  });

  console.log('[WorldSpaceVehicleLayer] v' + VERSION + ' loaded — THREE: ' + !!global.THREE);

})(window);
