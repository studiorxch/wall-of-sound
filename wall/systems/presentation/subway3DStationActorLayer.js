// ── Subway3DStationActorLayer v1.0.0 ──────────────────────────────────────────
// 0919_WOS_Subway_Tunnel_Vision_3D_Station_Integration_v1.0.0 (STATION-15).
// Status: active | Classification: presentation, Mapbox custom layer,
// dev-flag gated, OFF by default (shares the `?subway3d=1` URL param
// convention subway3DTrainActorLayer.js already established — visiting
// with that param turns on both 3D trains and 3D stations together; each
// module still owns its own independent localStorage persistence key).
//
// Integrates the first real canonical 3D station (Bay Ridge Av / R42) into
// the existing Underground/Tunnel Vision world, reusing — not duplicating —
// every layer of truth already established:
//
//   StationGeometryData (MUSIC, canonical)
//     -> projectStationStructure3D()                (STATION-13, unmodified)
//     -> deriveStationWorldAnchor()/deriveLevelPresentationDepthM()  (STATION-15, pure)
//     -> window.SBE.StationStructure3DBridge          (this batch's own small bridge)
//     -> THIS FILE builds real THREE.Object3D scene content natively,
//        against wall/'s own global THREE (see below for why), and places
//        it in the world using the EXACT same Mapbox custom-layer /
//        MercatorCoordinate / per-object-matrix pattern
//        subway3DTrainActorLayer.js already proved for trains.
//
// ── Why this file builds its own Three.js geometry instead of reusing
//    music/'s STATION-14 scene builder (stationStructure3DScene.ts)
//    directly ──────────────────────────────────────────────────────────────
// Confirmed by this batch's own targeted recon: wall/ loads its own global
// `THREE` r0.160 via a CDN <script> tag (see wall/index.html); MUSIC's own
// `three` npm dependency (added STATION-14) is r0.186 — a real, materially
// incompatible version gap (~2 years of Three.js releases, including real
// breaking changes to color-space/material defaults). Passing a THREE
// Object3D built against one module instance into a WebGLRenderer built
// against a different, incompatible instance is a genuine, confirmed risk,
// not a hypothetical one — so this integration deliberately does NOT
// attempt it. Instead, window.SBE.StationStructure3DBridge (built by
// MUSIC's own Vite, loaded as a plain <script type="module">, same
// convention as subway-member-runtime.js) exposes ONLY plain-data
// functions with zero Three.js dependency — StationGeometryData,
// StationStructuralProjection3D, and this batch's own StationWorldAnchor
// never touch Three.js at all. This file is the ONLY place that turns
// that plain data into real scene geometry, using wall/'s own THREE
// instance — mirroring stationStructure3DScene.ts's own visual
// conventions/presentation constants (same partial-truth discipline:
// geometryUnknown walls and topologyOnly connections never get fabricated
// geometry) without importing that module's own (incompatible) Three.js
// objects.
//
// ── Why this file does NOT create a second/nested WebGL canvas ─────────────
// This is a second Mapbox custom layer (own onAdd/render/onRemove), not a
// second canvas: Mapbox hands every custom layer's onAdd(map, gl) the SAME
// underlying WebGL context as every other layer on the map (including
// subway3DTrainActorLayer.js's own). A second `THREE.WebGLRenderer`
// wrapper object bound to that same shared `gl` context (exactly as this
// file does below) is the same pattern wallRuntimeGlbRenderLayer.js and
// subway3DTrainActorLayer.js's own header already document as "the proven
// reference implementation already used elsewhere in this codebase for
// exactly this GL-context-sharing pattern" — this file reuses that same
// proven pattern for a second, independent layer, never a second canvas
// element.
//
// ── Station-local -> world transform (STATION-15 Phase 3) ──────────────────
// Station-local convention (StationGeometryData, unchanged): +X =
// along-track, +Y = lateral, +Z = up — real meters throughout. This is
// ALREADY the exact convention this file's own per-object model matrix
// needs (local X/Y map onto the real horizontal Mercator plane, local Z
// maps onto real altitude, rotation is around local Z for heading) — the
// identical convention subway3DTrainActorLayer.js's own car placement
// already uses. No axis swap/mirror is needed anywhere in this file —
// station-local geometry is used completely natively.
//   worldPosition: mapboxgl.MercatorCoordinate.fromLngLat([anchor.longitude,
//     anchor.latitude], anchor.altitudeM + stationDepthOffsetM) — anchor
//     comes from deriveStationWorldAnchor(geometry), itself a thin,
//     generic pass-through of StationGeometryData.origin (already the
//     real, GTFS-sourced geographic authority — never a second lat/lon).
//   worldRotation: rotateZ(-anchor.headingDeg * PI/180) — anchor.headingDeg
//     is StationGeometryData.origin.orientationDeg, itself already a real,
//     derived route bearing (computeBearingDeg() against real track-shape
//     geometry) — never hand-typed or station-specific here.
//   worldScale: mc.meterInMercatorCoordinateUnits() — Mapbox's own real,
//     per-latitude meters-to-Mercator-units conversion, applied directly;
//     station-local units are already real/estimated meters, so no
//     separate presentation-scale multiplier exists in this file at all.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var LAYER_ID = 'wos-subway-3d-station-actor';
  var STORAGE_KEY = 'wos:subway3DStationActor:enabled';

  // The list of real stations this batch mounts. Adding a future station
  // with sufficient Station Truth means adding its real gtfsStopId here —
  // never a new code path, never a station-specific branch anywhere below
  // (see mountStation()'s own doc).
  var KNOWN_STATION_GTFS_STOP_IDS = ['R42'];

  // Representation-owned only — never physical truth, never written back
  // into Station Truth or the projection. Bay Ridge Av's own real
  // origin.altitudeM (0, street level) is already the correct real-world
  // anchor; this constant exists only in case a future station's own real
  // altitude anchor would otherwise collide visually with surface
  // terrain/buildings. Zero for this batch — the station's own internal
  // level stack already extends downward via deriveLevelPresentationDepthM().
  var STATION_DEPTH_OFFSET_M = 0;

  // Only render a mounted station's structure when the camera is
  // reasonably near it — the smallest useful visibility policy (STATION-15
  // Phase 9), not a semantic-zoom system. Presentation-owned, easily
  // adjusted later; documented explicitly as the next refinement this
  // batch deliberately leaves for a future pass.
  var STATION_VISIBLE_FROM_ZOOM = 14;

  function _readDevFlag() {
    try {
      var params = new URLSearchParams(global.location && global.location.search || '');
      var urlFlag = params.get('subway3d');
      if (urlFlag != null) return urlFlag === '1';
    } catch (e) {}
    try {
      var stored = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      return stored === '1';
    } catch (e) {}
    return false;
  }

  function _writeDevFlag(enabled) {
    try { global.localStorage && global.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0'); } catch (e) {}
  }

  function _three() { return global.THREE || null; }
  function _mapboxgl() { return global.mapboxgl || null; }
  function _mvr() { return SBE.MapboxViewportRuntime; }
  function _bridge() { return SBE.StationStructure3DBridge; }

  // ── Module state ──────────────────────────────────────────────────────────
  var _mounted = false;
  var _active = false;
  var _map = null;
  var _camera = null;
  var _renderer = null;
  var _lastError = null;

  // gtfsStopId -> { anchor, group, disposables } — built once at activate()
  // time, never rebuilt per frame (static structural geometry, unlike a
  // moving train). `group` is a real THREE.Group this file itself built,
  // natively, against wall/'s own global THREE — see this file's own header.
  var _stations = {};

  // ── Pure-ish scene construction (native wall/ THREE, mirrors
  //    stationStructure3DScene.ts's own presentation constants/behavior) ────
  var LEVEL_GRID_EXTENT = 40;
  var LEVEL_GRID_DIVISIONS = 16;
  var PLATFORM_THICKNESS = 0.15;
  var WALL_THICKNESS = 0.1;
  var TRACK_RAIL_GAUGE = 0.45;
  var COLOR_PLATFORM = 0x6fa8f0;
  var COLOR_TRACK = 0xc8c0b6;
  var COLOR_TRACK_BYPASS = 0x6b6357;
  var COLOR_WALL_KNOWN = 0x8a8177;
  var COLOR_CONNECTION_PATH_KNOWN = 0x4fd1c5;
  var COLOR_CONNECTION_TOPOLOGY_ONLY = 0xd6a24a;
  var COLOR_LEVEL_GRID = 0x3a352e;

  function _footprintCentroid(points) {
    var sum = points.reduce(function (acc, p) { return { x: acc.x + p.x, y: acc.y + p.y }; }, { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  // Builds one station's real THREE.Group, natively, in UNCONVERTED
  // station-local coordinates (x, y, z=up) — see this file's own header
  // for why no axis swap is applied. Pure function of (projection,
  // levelDepthById) only — no Mapbox/geographic concern here at all.
  function _buildStationGroup(THREE, projection, levelDepthById) {
    var root = new THREE.Group();
    root.name = 'station:' + projection.stationGeometryId;

    for (var li = 0; li < projection.levels.length; li++) {
      var level = projection.levels[li];
      var depth = levelDepthById[level.id];
      var levelGroup = new THREE.Group();
      levelGroup.position.z = depth;
      var grid = new THREE.GridHelper(LEVEL_GRID_EXTENT, LEVEL_GRID_DIVISIONS, COLOR_LEVEL_GRID, COLOR_LEVEL_GRID);
      grid.rotation.x = Math.PI / 2; // GridHelper is XZ-plane by default (Y-up); rotate into this file's own XY-plane (Z-up) convention.
      grid.material.opacity = 0.1;
      grid.material.transparent = true;
      levelGroup.add(grid);
      root.add(levelGroup);
    }

    for (var pi = 0; pi < projection.platforms.length; pi++) {
      var platform = projection.platforms[pi];
      if (!platform.footprint || platform.footprint.length < 3) continue;
      var pDepth = levelDepthById[platform.levelId] || 0;
      var shape = new THREE.Shape(platform.footprint.map(function (p) { return new THREE.Vector2(p.x, p.y); }));
      var geometry = new THREE.ExtrudeGeometry(shape, { depth: PLATFORM_THICKNESS, bevelEnabled: false });
      var material = new THREE.MeshBasicMaterial({ color: COLOR_PLATFORM, transparent: true, opacity: 0.22, side: THREE.DoubleSide });
      var mesh = new THREE.Mesh(geometry, material);
      mesh.position.z = pDepth;
      var outlinePts = platform.footprint.concat([platform.footprint[0]]).map(function (p) {
        return new THREE.Vector3(p.x, p.y, pDepth + PLATFORM_THICKNESS);
      });
      var outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePts), new THREE.LineBasicMaterial({ color: COLOR_PLATFORM }));
      root.add(mesh, outline);
    }

    var platformLevelEntry = projection.levels.filter(function (l) { return l.kind === 'platform'; })[0];
    var fallbackTrackDepth = platformLevelEntry ? levelDepthById[platformLevelEntry.id] : 0;
    for (var ti = 0; ti < projection.tracks.length; ti++) {
      var track = projection.tracks[ti];
      if (!track.localPoints || track.localPoints.length < 2) continue;
      var tDepth = track.levelId != null && levelDepthById[track.levelId] != null ? levelDepthById[track.levelId] : fallbackTrackDepth;
      var color = track.platformId === null ? COLOR_TRACK_BYPASS : COLOR_TRACK;
      var p0 = track.localPoints[0], p1 = track.localPoints[1];
      var dx = p1.x - p0.x, dy = p1.y - p0.y;
      var len = Math.hypot(dx, dy) || 1;
      var perpX = -dy / len, perpY = dx / len;
      var offset = TRACK_RAIL_GAUGE / 2;
      [-1, 1].forEach(function (sign) {
        var railPts = track.localPoints.map(function (p) {
          return new THREE.Vector3(p.x + perpX * offset * sign, p.y + perpY * offset * sign, tDepth);
        });
        var line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(railPts), new THREE.LineBasicMaterial({ color: color }));
        root.add(line);
      });
    }

    for (var wi = 0; wi < projection.walls.length; wi++) {
      var wall = projection.walls[wi];
      if (wall.geometryState !== 'geometryKnown' || !wall.localPolygon || wall.localPolygon.length < 3) continue; // geometryUnknown -- never fabricated, see this file's own header.
      var wShape = new THREE.Shape(wall.localPolygon.map(function (p) { return new THREE.Vector2(p.x, p.z || 0); }));
      var wGeometry = new THREE.ExtrudeGeometry(wShape, { depth: WALL_THICKNESS, bevelEnabled: false });
      var wMaterial = new THREE.MeshBasicMaterial({ color: COLOR_WALL_KNOWN, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      var wMesh = new THREE.Mesh(wGeometry, wMaterial);
      wMesh.position.y = wall.localPolygon[0].y;
      root.add(wMesh);
    }

    var platformsById = {};
    projection.platforms.forEach(function (p) { platformsById[p.id] = p; });
    var anchorIndexByKey = {};
    for (var ci = 0; ci < projection.connections.length; ci++) {
      var connection = projection.connections[ci];
      var fromDepth = levelDepthById[connection.fromLevelId];
      var toDepth = levelDepthById[connection.toLevelId];
      if (fromDepth === undefined || toDepth === undefined) continue;

      if (connection.pathState === 'pathKnown' && connection.localPath && connection.localPath.length >= 2) {
        var n = connection.localPath.length;
        var pathPts = connection.localPath.map(function (p, i) {
          return new THREE.Vector3(p.x, p.y, fromDepth + (toDepth - fromDepth) * (i / (n - 1)));
        });
        root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pathPts), new THREE.LineBasicMaterial({ color: COLOR_CONNECTION_PATH_KNOWN })));
        continue;
      }

      // topologyOnly -- an explicitly abstract, dashed level-to-level
      // relationship indicator, never an invented stair/path shape. See
      // stationStructure3DScene.ts's own identical rule.
      var key = connection.relatedPlatformId || '';
      var idx = anchorIndexByKey[key] || 0;
      anchorIndexByKey[key] = idx + 1;
      var relatedPlatform = connection.relatedPlatformId ? platformsById[connection.relatedPlatformId] : null;
      var anchor = relatedPlatform && relatedPlatform.footprint && relatedPlatform.footprint.length > 0
        ? _footprintCentroid(relatedPlatform.footprint)
        : { x: 0, y: 0 };
      var ax = anchor.x + idx * 1.5;
      var indicatorPts = [new THREE.Vector3(ax, anchor.y, fromDepth), new THREE.Vector3(ax, anchor.y, toDepth)];
      var indicatorLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(indicatorPts), new THREE.LineDashedMaterial({ color: COLOR_CONNECTION_TOPOLOGY_ONLY, dashSize: 0.4, gapSize: 0.3 }));
      indicatorLine.computeLineDistances();
      root.add(indicatorLine);
    }

    return root;
  }

  function _disposeGroup(group) {
    group.traverse(function (object) {
      if (object.geometry) { try { object.geometry.dispose(); } catch (e) {} }
      if (object.material) {
        var materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(function (m) { try { m.dispose(); } catch (e) {} });
      }
    });
  }

  // Builds (or rebuilds) one station's mounted entry from real, canonical
  // Station Truth via the bridge only -- never a second representation of
  // Bay Ridge (or any station). Returns false (and mounts nothing) for an
  // unresolvable station, never a fabricated/substituted one.
  function mountStation(gtfsStopId) {
    var THREE = _three();
    var bridge = _bridge();
    if (!THREE || !bridge) return false;
    var geometry = bridge.resolveKnownStationGeometry(gtfsStopId);
    if (!geometry) return false;

    var projection = bridge.projectStationStructure3D(geometry);
    var anchor = bridge.deriveStationWorldAnchor(geometry);
    var levelDepthById = {};
    projection.levels.forEach(function (level) {
      levelDepthById[level.id] = bridge.deriveLevelPresentationDepthM(level);
    });

    if (_stations[gtfsStopId]) _disposeGroup(_stations[gtfsStopId].group);
    var group = _buildStationGroup(THREE, projection, levelDepthById);
    _stations[gtfsStopId] = { anchor: anchor, group: group };
    return true;
  }

  function unmountStation(gtfsStopId) {
    var entry = _stations[gtfsStopId];
    if (!entry) return;
    _disposeGroup(entry.group);
    delete _stations[gtfsStopId];
  }

  // ── Mapbox custom layer ──────────────────────────────────────────────────
  var _layer = {
    id: LAYER_ID,
    type: 'custom',
    renderingMode: '3d',
    onAdd: function (map, gl) {
      var THREE = _three();
      if (!THREE) { _lastError = 'three_unavailable'; return; }
      _camera = new THREE.Camera();
      _renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      _renderer.autoClear = false;
    },
    render: function (gl, matrix) {
      var ids = Object.keys(_stations);
      if (!_renderer || !_camera || !ids.length) return;
      var THREE = _three();
      var mapboxgl = _mapboxgl();
      if (!THREE || !mapboxgl || !_map) return;
      if (_map.getZoom() < STATION_VISIBLE_FROM_ZOOM) return; // smallest useful visibility policy -- see this file's own header.

      var projMatrixBase = new THREE.Matrix4().fromArray(matrix);

      for (var i = 0; i < ids.length; i++) {
        var entry = _stations[ids[i]];
        var anchor = entry.anchor;
        var mc = mapboxgl.MercatorCoordinate.fromLngLat([anchor.longitude, anchor.latitude], anchor.altitudeM + STATION_DEPTH_OFFSET_M);
        var meterScale = mc.meterInMercatorCoordinateUnits();

        var modelMatrix = new THREE.Matrix4();
        var rotMatrix = new THREE.Matrix4();
        modelMatrix.set(
          meterScale, 0, 0, mc.x,
          0, -meterScale, 0, mc.y,
          0, 0, meterScale, mc.z,
          0, 0, 0, 1
        );
        rotMatrix.makeRotationZ(-(anchor.headingDeg || 0) * Math.PI / 180);
        modelMatrix.multiply(rotMatrix);

        var finalMatrix = new THREE.Matrix4().copy(projMatrixBase).multiply(modelMatrix);
        _camera.projectionMatrix = finalMatrix;
        _renderer.resetState();
        _renderer.render(entry.group, _camera);
      }
    },
    onRemove: function () {
      if (_renderer) { try { _renderer.dispose(); } catch (e) {} }
      _renderer = null;
      _camera = null;
    },
  };

  function _isLayerMounted() {
    try { return !!(_map && typeof _map.getLayer === 'function' && _map.getLayer(LAYER_ID)); }
    catch (e) { return false; }
  }

  function _ensureLayer() {
    var mvr = _mvr();
    var map = mvr && mvr.getMap ? mvr.getMap() : null;
    if (!map) { _lastError = 'map_unavailable'; return false; }
    _map = map;
    if (_isLayerMounted()) { _mounted = true; return true; }
    try {
      _map.addLayer(_layer);
      _mounted = true;
      return true;
    } catch (e) {
      _lastError = 'add_layer_failed';
      return false;
    }
  }

  function _removeLayer() {
    if (_map && _isLayerMounted()) { try { _map.removeLayer(LAYER_ID); } catch (e) {} }
    _mounted = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function activate() {
    if (!_readDevFlag()) return { ok: false, reason: 'dev_flag_disabled' };
    if (_active) return { ok: true, reason: 'already_active' };
    if (!_ensureLayer()) return { ok: false, reason: _lastError || 'layer_mount_failed' };
    var mountedAny = false;
    for (var i = 0; i < KNOWN_STATION_GTFS_STOP_IDS.length; i++) {
      if (mountStation(KNOWN_STATION_GTFS_STOP_IDS[i])) mountedAny = true;
    }
    _active = true;
    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
    console.log('[Subway3DStationActorLayer] activated — stations mounted:', Object.keys(_stations));
    return { ok: true, mountedAny: mountedAny };
  }

  function deactivate() {
    Object.keys(_stations).forEach(unmountStation);
    _removeLayer();
    _active = false;
  }

  function enable() { _writeDevFlag(true); return activate(); }
  function disable() { _writeDevFlag(false); deactivate(); }
  function isActive() { return _active; }
  function getMountedStationIds() { return Object.keys(_stations); }
  function getKnownStationGtfsStopIds() { return KNOWN_STATION_GTFS_STOP_IDS.slice(); }

  SBE.Subway3DStationActorLayer = Object.freeze({
    VERSION: VERSION,
    LAYER_ID: LAYER_ID,
    activate: activate,
    deactivate: deactivate,
    enable: enable,
    disable: disable,
    isActive: isActive,
    getMountedStationIds: getMountedStationIds,
    getKnownStationGtfsStopIds: getKnownStationGtfsStopIds,
    // Test-only exposures — never used by product code.
    __test: {
      mountStation: mountStation,
      unmountStation: unmountStation,
      readDevFlag: _readDevFlag,
      setMapForTests: function (map) { _map = map; },
      getLayer: function () { return _layer; },
      getStationVisibleFromZoom: function () { return STATION_VISIBLE_FROM_ZOOM; },
    },
  });

  if (_readDevFlag()) {
    var _bootMvr = _mvr();
    if (_bootMvr && typeof _bootMvr.onReady === 'function') _bootMvr.onReady(activate);
    else if (_bootMvr && typeof _bootMvr.onStyleLoad === 'function') _bootMvr.onStyleLoad(activate);
    else global.setTimeout(activate, 1000);
  }

  console.log('[Subway3DStationActorLayer] v' + VERSION + ' loaded');
})(window);
