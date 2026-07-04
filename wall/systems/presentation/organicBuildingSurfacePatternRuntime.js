// ── OrganicBuildingSurfacePatternRuntime v1.0.1 ───────────────────────────────
// 0612T_WOS_OrganicBuildingSurfacePatternRuntime_v1.0.0_BUILD
// 0612T.1_WOS_OrganicBuildingSurfacePatternVisibilityFix_v1.0.1_BUILD
// Status: active | Classification: presentation-pass / surface-material
//
// Purpose:
//   First visible organic surface-pattern runtime for WOS buildings.
//   Places procedural Voronoi-cell textures on actual building faces —
//   walls and roofs — via Mapbox CustomLayerInterface + Three.js box geometry.
//   Produces "country-border" / "geological plate" organic patch language
//   visible at cinematic camera distance.
//
// Architecture:
//   PatternGenerator  → deterministic Voronoi canvas (128×128)
//   CustomLayer       → THREE.BoxGeometry per actor, THREE.CanvasTexture per face
//   Actor discovery   → BuildingReplacementRuntime.list() (Wall) or
//                        BuildingEditRegistry.getAll() (Studio)
//
// Coordinate system (matches worldSpaceVehicleLayer.js):
//   Local X → World X  (east)        scale: +meterScale
//   Local Y → World Y  (south)       scale: −meterScale  (inverted)
//   Local Z → World Z  (altitude)    scale: +meterScale
//   BoxGeometry(widthM, depthM, heightM) positioned at Z = heightM/2 in local
//   space so box bottom is at ground (altitude=0) and top at heightM.
//
// Dependency: THREE (loaded before this script in wall/index.html)
//
// Authority:
//   OWNS: wos-organic-surface-pattern (Mapbox custom layer), THREE scenes/meshes
//   READS: BuildingReplacementRuntime.list(), BuildingEditRegistry.getAll()
//   MUST NOT: building replacement, suppression, density, publish, map style,
//             camera, Studio UI, Canvas, Color Lab, actor authorities
//
// Placement: wall/systems/presentation/organicBuildingSurfacePatternRuntime.js
// Load: AFTER buildingMaterialIllustrationRuntime.js AND three.min.js
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.1';

  var CUSTOM_LAYER_ID   = 'wos-organic-surface-pattern';
  var TEXTURE_SIZE      = { 1: 256, 2: 512 };  // subtle / strong resolution
  var ALTITUDE_M        = 0.0;                  // actor base altitude (ground level)

  // ── Material Profiles ─────────────────────────────────────────────────────────
  //
  // base:    dominant region fill
  // patch:   secondary organic region fill
  // weather: tertiary / worn zone fill
  // line:    patch border line color (thin, dark, non-neon)
  // grain:   speckle dot color

  // v1.0.1: Increased intra-profile contrast — base vs patch ≥ 50 RGB unit delta
  // so patch regions are clearly legible on any face at viewing distance.
  // Line alpha raised to 240 for bolder ink edges in both intensity modes.
  var MaterialProfiles = Object.freeze({
    warmConcrete: Object.freeze({
      id: 'warmConcrete',
      base:    [218, 200, 170, 255],   // warm sand
      patch:   [162, 132,  90, 255],   // dark sandy ochre  (Δ≈60)
      weather: [240, 222, 195, 255],   // bleached highlight
      line:    [ 72,  50,  22, 240],   // near-black brown
      grain:   [190, 155, 110, 255],
    }),
    paintedConcrete: Object.freeze({
      id: 'paintedConcrete',
      base:    [135, 170, 200, 255],   // cool blue-grey
      patch:   [ 72, 108, 150, 255],   // dark slate blue   (Δ≈62)
      weather: [180, 212, 232, 255],   // pale sky highlight
      line:    [ 22,  50,  88, 240],   // deep navy
      grain:   [105, 140, 172, 255],
    }),
    industrialGreen: Object.freeze({
      id: 'industrialGreen',
      base:    [112, 152, 112, 255],   // sage green
      patch:   [ 52,  90,  55, 255],   // deep olive-green  (Δ≈62)
      weather: [155, 195, 152, 255],   // fresh light green
      line:    [ 18,  45,  22, 240],   // almost-black green
      grain:   [ 80, 118,  82, 255],
    }),
    signalOrange: Object.freeze({
      id: 'signalOrange',
      base:    [225, 145,  58, 255],   // amber
      patch:   [155,  72,  12, 255],   // burnt sienna      (Δ≈80)
      weather: [248, 188,  95, 255],   // pale gold highlight
      line:    [ 80,  28,   5, 240],   // very dark brown
      grain:   [200, 110,  35, 255],
    }),
  });

  // ── PatternGenerator ──────────────────────────────────────────────────────────
  //
  // Produces deterministic Voronoi / cellular organic patch textures.
  // Stable: same seed → same canvas every session (no Date/Math.random).

  var PatternGenerator = (function () {

    // FNV-1a hash: buildingKey string → unsigned 32-bit seed
    function createSeedFromBuildingKey(buildingKey) {
      var h = 0x811c9dc5 >>> 0;
      for (var i = 0; i < buildingKey.length; i++) {
        h ^= buildingKey.charCodeAt(i);
        h  = Math.imul(h, 0x01000193) >>> 0;
      }
      return h;
    }

    // LCG from seed — returns a generator function () → [0,1)
    function makeLCG(seed) {
      var s = seed >>> 0;
      return function () {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    // Generate N Voronoi seed points using rand()
    function generatePatchCells(seed, width, height, options) {
      var opts  = options || {};
      var count = opts.cellCount || 10;
      var rand  = makeLCG(seed);
      var cells = [];
      for (var i = 0; i < count; i++) {
        cells.push({ x: rand() * width, y: rand() * height, colorIdx: i % 3 });
      }
      return cells;
    }

    // Draw Voronoi-cell organic patch onto canvas context.
    // v1.0.1: thicker borders, larger grain dots, higher contrast rendering.
    function drawPatchTexture(canvas, cells, profile, options) {
      var opts        = options || {};
      var borderThick = opts.borderThickness || 5;     // v1.0.1: was 2.5
      var grainCount  = opts.grainCount       || 120;  // v1.0.1: was 80
      var intensity   = opts.intensity        || 1;

      var ctx    = canvas.getContext('2d');
      var W      = canvas.width;
      var H      = canvas.height;
      var idata  = ctx.createImageData(W, H);
      var data   = idata.data;

      var colorTable = [profile.base, profile.patch, profile.weather];

      // Voronoi pass — border zone uses hard line color at full alpha
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var d1 = Infinity, d2 = Infinity, ci = 0;
          for (var s = 0; s < cells.length; s++) {
            var dx = x - cells[s].x;
            var dy = y - cells[s].y;
            var d  = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; ci = cells[s].colorIdx; }
            else if (d < d2) { d2 = d; }
          }
          var idx      = (y * W + x) * 4;
          var dist2nd  = Math.sqrt(d2);
          var dist1st  = Math.sqrt(d1);
          var diff     = dist2nd - dist1st;
          var isBorder = diff < borderThick;
          // Soft border: fade from line color into region color over the border zone
          var color;
          if (isBorder) {
            var t = diff / borderThick;           // 0=center of border, 1=edge
            var r = colorTable[ci];
            var l = profile.line;
            color = [
              (l[0] + (r[0] - l[0]) * t) | 0,
              (l[1] + (r[1] - l[1]) * t) | 0,
              (l[2] + (r[2] - l[2]) * t) | 0,
              255,
            ];
          } else {
            color = colorTable[ci];
          }
          data[idx]     = color[0];
          data[idx + 1] = color[1];
          data[idx + 2] = color[2];
          data[idx + 3] = color[3];
        }
      }
      ctx.putImageData(idata, 0, 0);

      // Grain pass — v1.0.1: larger dots (1–4px), higher opacity, more visible
      var rand    = makeLCG(cells.length * 7919 + 31337);
      var grScale = intensity === 2 ? 1.8 : 0.9;
      for (var g = 0; g < grainCount; g++) {
        var gx = rand() * W;
        var gy = rand() * H;
        var gr = (rand() * 3.0 + 1.0) * grScale;          // 1–4px × scale
        var ga = (0.35 + rand() * 0.50) * grScale * 0.55;
        if (ga > 0.9) ga = 0.9;
        ctx.globalAlpha = ga;
        ctx.fillStyle   = 'rgb(' + profile.grain[0] + ',' + profile.grain[1] + ',' + profile.grain[2] + ')';
        ctx.beginPath();
        ctx.arc(gx, gy, gr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
    }

    // Full pipeline: key → seed → cells → canvas.
    // v1.0.1: textureSize driven by opts.textureSize (default 256 / 512 by intensity).
    function createBuildingSurfaceTexture(buildingKey, profileId, options) {
      var profile  = MaterialProfiles[profileId] || MaterialProfiles.warmConcrete;
      var opts     = options || {};
      var texSize  = opts.textureSize || 256;
      var canvas;
      try { canvas = global.document.createElement('canvas'); } catch (e) { return null; }
      canvas.width  = texSize;
      canvas.height = texSize;

      var seed  = createSeedFromBuildingKey(buildingKey + profileId);
      var cells = generatePatchCells(seed, texSize, texSize, opts);
      drawPatchTexture(canvas, cells, profile, opts);
      return canvas;
    }

    return Object.freeze({
      createSeedFromBuildingKey:    createSeedFromBuildingKey,
      generatePatchCells:           generatePatchCells,
      drawPatchTexture:             drawPatchTexture,
      createBuildingSurfaceTexture: createBuildingSurfaceTexture,
    });
  })();

  // ── State ─────────────────────────────────────────────────────────────────────

  var _enabled    = false;
  var _profile    = 'warmConcrete';
  var _intensity  = 1;
  var _lastError  = null;
  var _layerAdded = false;

  var _actors     = [];   // [{id, lng, lat, height, widthM, depthM, heading, archetype}]
  var _meshes     = {};   // id → THREE.Mesh
  var _scenes     = {};   // id → THREE.Scene
  var _renderer   = null;
  var _camera     = null;
  var _map        = null;

  var _texturedMeshCount = 0;
  var _skippedMeshCount  = 0;

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.getMap === 'function') return mvr.getMap();
    var adp = global.WOSMapLab && global.WOSMapLab.MapboxAdapter;
    if (adp && typeof adp.getMap === 'function') return adp.getMap();
    return null;
  }

  // ── Actor discovery ───────────────────────────────────────────────────────────
  //
  // Wall path:   SBE.BuildingReplacementRuntime.list()
  // Studio path: WOSMapLab.BuildingEditRegistry.getAll()

  function _discoverActors() {
    // Wall path
    var brr = SBE.BuildingReplacementRuntime;
    if (brr && typeof brr.list === 'function') {
      var actors = brr.list();
      var out = [];
      Object.keys(actors).forEach(function (k) {
        var a = actors[k];
        if (!a.enabled || !a.resolved) return;
        if (typeof a.lng !== 'number' || typeof a.lat !== 'number') return;
        out.push({
          id:       k,
          lng:      a.lng,
          lat:      a.lat,
          height:   typeof a.height === 'number' ? a.height : 14,
          widthM:   typeof a.footprintWidthM === 'number' ? a.footprintWidthM : 8,
          depthM:   typeof a.footprintDepthM === 'number' ? a.footprintDepthM : 8,
          heading:  typeof a.heading  === 'number' ? a.heading : 0,
          archetype: a.archetype || 'custom-placeholder',
        });
      });
      return out;
    }
    // Studio path
    var reg = global.WOSMapLab && global.WOSMapLab.BuildingEditRegistry;
    if (reg && typeof reg.getAll === 'function') {
      var edits = reg.getAll();
      var out = [];
      Object.keys(edits).forEach(function (k) {
        var e = edits[k];
        var g = e && e.geometry;
        if (!g || !g.centroid || typeof g.centroid.lng !== 'number') return;
        out.push({
          id:       k,
          lng:      g.centroid.lng,
          lat:      g.centroid.lat,
          height:   typeof g.height  === 'number' ? g.height  : 14,
          widthM:   typeof g.widthM  === 'number' ? g.widthM  : 8,
          depthM:   typeof g.depthM  === 'number' ? g.depthM  : 8,
          heading:  typeof g.heading === 'number' ? g.heading : 0,
          archetype: e.archetype || 'custom-placeholder',
        });
      });
      return out;
    }
    return [];
  }

  // ── Three.js mesh builder ──────────────────────────────────────────────────────
  //
  // BoxGeometry(widthM, depthM, heightM):
  //   X (width)  → East/West  (meterScale)
  //   Y (height) → South/North (-meterScale, Mapbox Y inverted)
  //   Z (depth)  → Altitude   (meterScale)
  //
  // mesh.position.z = heightM / 2 → box bottom at ground, top at heightM.
  // mesh.rotation.z = -headingRad → compass heading alignment.

  // v1.0.1: intensity-aware texture size and params for unmistakable strong mode.
  function _textureParams(intensity) {
    if (intensity === 2) {
      return { textureSize: 512, cellCount: 6,  borderThickness: 12, grainCount: 350, intensity: 2 };
    }
    return   { textureSize: 256, cellCount: 8,  borderThickness:  5, grainCount: 120, intensity: 1 };
  }

  function _buildMesh(actor) {
    var THREE = global.THREE;
    if (!THREE) return null;

    var params = _textureParams(_intensity);
    var canvas = PatternGenerator.createBuildingSurfaceTexture(actor.id, _profile, params);
    if (!canvas) return null;

    var tex = new THREE.CanvasTexture(canvas);
    tex.minFilter   = THREE.LinearFilter;
    tex.magFilter   = THREE.LinearFilter;
    tex.needsUpdate = true;

    var mat = new THREE.MeshBasicMaterial({
      map:                 tex,
      side:                THREE.DoubleSide,  // v1.0.1: DoubleSide so camera sees all faces
      polygonOffset:       true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits:  -3,
    });

    var geo  = new THREE.BoxGeometry(actor.widthM, actor.depthM, actor.height);
    var mesh = new THREE.Mesh(geo, mat);

    // Place box bottom at ground: shift center up by half height in local Z
    mesh.position.set(0, 0, actor.height / 2);
    // Compass heading (degrees clockwise from north → negate for Three.js Z rotation)
    mesh.rotation.z = -(actor.heading || 0) * Math.PI / 180;

    return mesh;
  }

  function _makeScene(mesh) {
    var THREE = global.THREE;
    var scene = new THREE.Scene();
    scene.add(mesh);
    return scene;
  }

  // ── World-space transform (matches worldSpaceVehicleLayer.js modelMatrix path) ─

  function _applyTransform(mesh, actor) {
    var THREE    = global.THREE;
    var mapboxgl = global.mapboxgl;
    if (!THREE || !mapboxgl || !mapboxgl.MercatorCoordinate) return;

    var coord     = mapboxgl.MercatorCoordinate.fromLngLat([actor.lng, actor.lat], ALTITUDE_M);
    var meterUnit = coord.meterInMercatorCoordinateUnits();

    // Record Mercator position
    mesh._mercator  = { x: coord.x, y: coord.y, z: coord.z };
    mesh._meterUnit = meterUnit;

    // Model matrix: translate to world position, scale by meterUnit.
    // Y is negated because Mapbox Mercator Y increases southward.
    mesh._modelMatrix = new THREE.Matrix4()
      .makeTranslation(coord.x, coord.y, coord.z)
      .scale(new THREE.Vector3(meterUnit, -meterUnit, meterUnit));
  }

  // ── Build all actor meshes ─────────────────────────────────────────────────────

  function _buildActorMeshes() {
    var THREE = global.THREE;
    _meshes            = {};
    _scenes            = {};
    _texturedMeshCount = 0;
    _skippedMeshCount  = 0;

    _actors.forEach(function (actor) {
      if (!THREE) { _skippedMeshCount++; return; }
      try {
        var mesh = _buildMesh(actor);
        if (!mesh) { _skippedMeshCount++; return; }
        _applyTransform(mesh, actor);
        _meshes[actor.id] = mesh;
        _scenes[actor.id] = _makeScene(mesh);
        _texturedMeshCount++;
      } catch (e) {
        _lastError = 'buildMesh(' + actor.id + '): ' + (e && e.message || e);
        _skippedMeshCount++;
      }
    });
  }

  // ── Mapbox Custom Layer definition ────────────────────────────────────────────

  var _customLayer = {
    id:             CUSTOM_LAYER_ID,
    type:           'custom',
    renderingMode:  '3d',

    onAdd: function (map, gl) {
      var THREE = global.THREE;
      if (!THREE) return;
      _renderer = new THREE.WebGLRenderer({
        canvas:    map.getCanvas(),
        context:   gl,
        antialias: true,
      });
      _renderer.autoClear         = false;
      _renderer.shadowMap.enabled = false;
      _camera = new THREE.Camera();
      console.log('[OrganicBuildingSurfacePatternRuntime] CustomLayer onAdd — renderer ready');
    },

    render: function (gl, matrix) {
      var THREE = global.THREE;
      if (!_enabled || !_renderer || !_camera || !THREE || !matrix) return;
      try {
        _renderer.resetState();
        var mb  = new THREE.Matrix4().fromArray(matrix);
        var ids = Object.keys(_meshes);
        for (var i = 0; i < ids.length; i++) {
          var id    = ids[i];
          var mesh  = _meshes[id];
          var scene = _scenes[id];
          if (!mesh || !scene || !mesh._modelMatrix) continue;
          _camera.projectionMatrix = mb.clone().multiply(mesh._modelMatrix);
          _renderer.render(scene, _camera);
        }
      } catch (e) {
        _lastError = 'render: ' + (e && e.message || e);
      }
    },

    onRemove: function (map, gl) {
      // Dispose textures + geometries
      Object.keys(_meshes).forEach(function (id) {
        var mesh = _meshes[id];
        try { if (mesh.geometry) mesh.geometry.dispose(); } catch (e) {}
        try { if (mesh.material && mesh.material.map) mesh.material.map.dispose(); } catch (e) {}
        try { if (mesh.material) mesh.material.dispose(); } catch (e) {}
      });
      _meshes   = {};
      _scenes   = {};
      _renderer = null;
      _camera   = null;
    },
  };

  // ── Layer lifecycle helpers ───────────────────────────────────────────────────

  function _addCustomLayer(map) {
    if (_layerAdded) return;
    try {
      // Insert above wos-replacement-layer if present, else at end
      var beforeId;
      try {
        var layers = (map.getStyle().layers) || [];
        for (var i = layers.length - 1; i >= 0; i--) {
          if (layers[i].type === 'symbol') { beforeId = layers[i].id; break; }
        }
      } catch (e) {}
      if (beforeId) map.addLayer(_customLayer, beforeId);
      else          map.addLayer(_customLayer);
      _layerAdded = true;
    } catch (e) {
      _lastError = 'addLayer: ' + (e && e.message || e);
      console.warn('[OrganicBuildingSurfacePatternRuntime] addLayer failed:', e.message || e);
    }
  }

  function _removeCustomLayer(map) {
    if (!_layerAdded) return;
    try {
      if (map.getLayer(CUSTOM_LAYER_ID)) map.removeLayer(CUSTOM_LAYER_ID);
    } catch (e) {}
    _layerAdded = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function enable() {
    _lastError = null;
    var map = _getMap();
    if (!map) return { ok: false, reason: 'MAP_NOT_READY' };
    if (!global.THREE) return { ok: false, reason: 'THREE_NOT_LOADED' };

    _enabled = true;
    _actors  = _discoverActors();
    _buildActorMeshes();

    if (_layerAdded) _removeCustomLayer(map);
    _addCustomLayer(map);

    if (map.triggerRepaint) map.triggerRepaint();
    var r = report();
    console.log('[OrganicBuildingSurfacePatternRuntime] enabled | actors:', _actors.length,
      '| textured:', _texturedMeshCount, '| skipped:', _skippedMeshCount,
      '| profile:', _profile, '| intensity:', _intensity);
    return r;
  }

  function disable() {
    _enabled = false;
    var map = _getMap();
    if (map) {
      _removeCustomLayer(map);
      if (map.triggerRepaint) map.triggerRepaint();
    }
    console.log('[OrganicBuildingSurfacePatternRuntime] disabled');
    return report();
  }

  // _rebuildTextures — rebuilds meshes from existing _actors without re-running
  // actor discovery. Used by setIntensity/setProfile so list() isn't re-called.
  function _rebuildTextures() {
    var map = _getMap();
    if (!map) return;
    _buildActorMeshes();
    // Force the custom layer to pick up new meshes: remove + re-add layer.
    _removeCustomLayer(map);
    _addCustomLayer(map);
    if (map.triggerRepaint) map.triggerRepaint();
  }

  function setIntensity(value) {
    var v = (value === 2) ? 2 : 1;
    _intensity = v;
    if (_enabled) _rebuildTextures();
    console.log('[OrganicBuildingSurfacePatternRuntime] intensity →', v);
    return report();
  }

  function setProfile(profileId) {
    if (!MaterialProfiles[profileId]) {
      _lastError = 'unknown profile: ' + profileId;
      return report();
    }
    _profile = profileId;
    if (_enabled) _rebuildTextures();
    console.log('[OrganicBuildingSurfacePatternRuntime] profile →', profileId);
    return report();
  }

  // regenerate(): deterministic — same building always produces same result.
  // Forces mesh rebuild + retrigger.
  function regenerate() {
    if (!_enabled) return report();
    return enable();
  }

  function report() {
    var threeOk = !!(global.THREE);
    var wallOk  = !!(SBE.BuildingReplacementRuntime && typeof SBE.BuildingReplacementRuntime.list === 'function');
    var studioOk = !!(global.WOSMapLab && global.WOSMapLab.BuildingEditRegistry);
    return {
      ok:                     true,
      version:                VERSION,
      enabled:                _enabled,
      profile:                _profile,
      intensity:              _intensity,
      targetRuntimeFound:     wallOk || studioOk,
      targetMeshCount:        _actors.length,
      texturedMeshCount:      _texturedMeshCount,
      skippedMeshCount:       _skippedMeshCount,
      generatedTextureCount:  _texturedMeshCount,
      layerAdded:             _layerAdded,
      threeLoaded:            threeOk,
      wallSupported:          wallOk && threeOk,
      studioSupported:        studioOk && threeOk,
      lastError:              _lastError,
    };
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.OrganicBuildingSurfacePatternRuntime = Object.freeze({
    VERSION:          VERSION,
    PatternGenerator: PatternGenerator,
    MaterialProfiles: MaterialProfiles,
    enable:           enable,
    disable:          disable,
    report:           report,
    setIntensity:     setIntensity,
    setProfile:       setProfile,
    regenerate:       regenerate,
  });

  // ── Debug surface ─────────────────────────────────────────────────────────────

  function _wireDebug() {
    global._wos                              = global._wos                              || {};
    global._wos.debug                        = global._wos.debug                        || {};
    global._wos.debug.organicBuildingSurface = {
      enable:       enable,
      disable:      disable,
      report:       report,
      setIntensity: setIntensity,
      setProfile:   setProfile,
      regenerate:   regenerate,
      profiles:     MaterialProfiles,
      generator:    PatternGenerator,
    };
  }

  _wireDebug();
  (function () {
    var mvr = SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(_wireDebug);
    else setTimeout(_wireDebug, 3000);
  })();

  console.log('[OrganicBuildingSurfacePatternRuntime] v' + VERSION +
    ' loaded | _wos.debug.organicBuildingSurface.enable()');

})(window);
