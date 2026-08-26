// ── SubwayTrainCarVisualAdapter v1.0.0 ────────────────────────────────────────
// 0825_MAPS_Ep2_3D_Train_Actor_Foundation_v1.0.0 — Asset Adapter (spec §9-11,15)
// Status: active | Classification: presentation adapter, pure Three.js +
// GLTFLoader — no Mapbox dependency, no RAF of its own (mirrors
// orbObjectFactory.js's purity: a pure builder, separate from the Mapbox
// custom layer that positions/renders its output — see
// subway3DTrainActorLayer.js).
//
// SINGLE-CAR GATE ONLY. No consist/multi-car assembly logic lives here or in
// the render layer yet — that is explicitly deferred until the single-car
// gate (spec §8) passes live, per direct instruction. createInstance() may be
// called more than once, but nothing in this file assumes or optimizes for
// that yet.
//
// Loads the prepared runtime GLB (wall/assets/models/NYC_Subway_Car_Runtime_v2.glb
// — a same-origin copy of WOS-share/SUBWAY/ARCHIVE/REFERENCE/New York Subway
// Train 3D/NYC_Subway_Car_Runtime_v2.glb; the archive original is never
// touched, per spec §3) exactly once, caches the parsed scene, and hands out
// TrainCarVisual instances (spec §10) that a Mapbox custom layer can position
// without ever touching the GLTFLoader or the file itself.
//
// DISPOSAL SPLIT (do not collapse this back into one dispose()): TrainCarVisual
// instances returned by createInstance() share their geometry AND their
// default named materials with the cached source scene (THREE's own
// Object3D.clone() semantics — clone() does not deep-clone geometry/material).
// disposeInstance() therefore only ever disposes resources this ONE instance
// uniquely owns (a per-car material created via _ensureUniqueMaterial, e.g.
// for a selection highlight); it must never dispose the shared defaults or
// the cached source scene's geometries, or every OTHER still-live car clone
// breaks. Only disposeSharedAsset() — called once, only when the entire
// layer is torn down — releases the shared defaults and cached source scene.
//
// CANONICAL CONFIG (spec §11): forward/up axis correction, ground offset, and
// runtime scale are determined ONCE via live geometry qualification
// (_wos.debug.subway3d.inspectGlb()), never guessed or corrected per-frame.
// The values below start as identity placeholders and MUST be updated (via
// setCanonicalConfig() during qualification, then hardcoded here once
// confirmed) before any live-motion verification is meaningful.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var GLB_URL = './assets/models/NYC_Subway_Car_Runtime_v2.glb';

  var ROLE_NAMES = [
    'Body', 'Doors', 'FrontBumper', 'LowerBody', 'RearBumper',
    'RearPanel', 'WheelsFront', 'WheelsRear', 'Windows',
  ];

  var GRAFFITI_MOUNT_NAMES = ['Graffiti_Left', 'Graffiti_Right'];

  // ── Canonical config — placeholders until live qualification (spec §11) ───
  // Never applied per-frame; setTransform() below only ever composes THESE
  // fixed values with the per-tick lon/lat/altM/headingDeg the caller passes.
  //
  // Determined via live geometry qualification (_wos.debug.subway3d.inspectGlb(),
  // 2026-08-25) against the real NYC_Subway_Car_Runtime_v2.glb:
  //   - raw bounds size ~26.99 x 30.81 x 152.09 (model units); Z is the long
  //     axis (front-to-back — confirmed via FrontBumper/RearBumper world
  //     positions: FrontBumper sits at the +Z end, RearBumper at the -Z end)
  //     and Y is up (glTF default), X is width.
  //   - scaleToMeters = CANONICAL_CAR_LENGTH_M / rawLengthZ = 18.3/152.09,
  //     so the model's real length matches SubwayTrainMotionModel's own
  //     18.3m per-car constant exactly.
  //   - upAxisCorrectionRad = -PI/2 around X remaps local +Z (forward) onto
  //     the +Y axis — confirmed live: after correction + scale, the group's
  //     world-space bounding box is ~3.25 x 18.3 x 3.71 (x,y,z) meters,
  //     length sitting on Y (matching this custom layer's heading-rotation
  //     convention, which rotates around world Z / "up" and expects
  //     "forward" to sit on Y at heading=0) — bounding-box SHAPE alone was
  //     plausible for a real subway car, which is why the original
  //     2026-08-25 pass didn't catch the following.
  //
  //   - CONFIRMED INVERTED, fixed 2026-08-25 (4-Car Consist Gate): the
  //     original forwardAxisCorrectionRad=0 left local +Y (this GLB's own
  //     up/roof axis, glTF Y-up convention) mapping to local -Z after only
  //     the X correction above — and local +Z is what the render() custom
  //     layer's external modelMatrix maps to world altitude/up (Mapbox
  //     MercatorCoordinate.z increases with altitude, unambiguous). Net
  //     result: WheelsFront/WheelsRear (this GLB's -Y/underside meshes)
  //     rendered on the world-up side, Body/roof (+Y) rendered on the
  //     world-down side — confirmed two independent ways: (a) running the
  //     actual three@0.160.0 library's Object3D/Euler against the exact
  //     rotation.set() call setTransform() below makes, and (b) loading the
  //     real GLB and reading WheelsFront/WheelsRear/Body world-Z bounds
  //     directly, both live and reproducible via
  //     _wos.debug.subwayTrainCarVisualAdapter (see getCanonicalConfig()).
  //
  //     Fix: forwardAxisCorrectionRad = Math.PI (was 0) — upAxisCorrectionRad
  //     is UNCHANGED. Verified via THREE.Euler.setFromRotationMatrix()
  //     against the exact target basis mapping (raw+Y->runtime+Z, raw+Z->
  //     runtime+Y, raw+X->runtime-X, a proper right-handed rotation,
  //     determinant +1) and re-verified against the real loaded GLB:
  //     WheelsFront/WheelsRear now occupy the LOWER world-Z region, Body
  //     the UPPER world-Z region. forward (+Z->+Y) is unaffected — the
  //     existing heading convention is preserved exactly.
  //   - groundOffsetM = the corrected height / 2 (~1.853m): createInstance()
  //     recenters the model on its own geometric center (see
  //     _sourceCenterOffset below), so without this offset the car's
  //     vertical center — not its wheels — would sit at the track's 2D
  //     lng/lat reference point. This is a presentation approximation (the
  //     app has no per-track vertical/elevation data for underground/
  //     elevated sections yet), not a claim of exact rail-height grounding.
  var _canonicalConfig = {
    scaleToMeters: 18.3 / 152.09,
    forwardAxisCorrectionRad: Math.PI,
    upAxisCorrectionRad: -Math.PI / 2,
    groundOffsetM: 1.853,
  };

  function setCanonicalConfig(partial) {
    if (!partial) return Object.assign({}, _canonicalConfig);
    Object.keys(_canonicalConfig).forEach(function (k) {
      if (typeof partial[k] === 'number' && isFinite(partial[k])) _canonicalConfig[k] = partial[k];
    });
    console.log('[SubwayTrainCarVisualAdapter] canonical config updated:', JSON.stringify(_canonicalConfig));
    return Object.assign({}, _canonicalConfig);
  }

  function getCanonicalConfig() { return Object.assign({}, _canonicalConfig); }

  // ── Load state ──────────────────────────────────────────────────────────────
  var _loadPromise = null;
  var _loaded = false;
  var _loadError = null;
  var _sourceScene = null;       // cached THREE.Group, never mutated after load
  var _sourceCenterOffset = { x: 0, y: 0, z: 0 }; // raw model units, computed once at load
  var _roleMapping = null;       // { Body: Object3D|null, Doors: Object3D|null, ... }
  var _graffitiMountsFound = { left: false, right: false };
  var _sharedMaterials = null;   // { BodyMetal, DoorMetal, WindowGlass, UndercarriageDark, TrimDark, LightSurface }
  var _instanceCount = 0;

  function _three() { return global.THREE || null; }
  function _gltfLoader() {
    var T = _three();
    if (!T) return null;
    return T.GLTFLoader || global.GLTFLoader || null;
  }

  function _resolvePaletteTrainTokens() {
    var pal = SBE.MTASubwayPaletteAuthority;
    var tokens = pal && pal.resolveTrainTokens ? pal.resolveTrainTokens() : null;
    return tokens || { neutralBody: '#C9CDD3', casing: '#181B1F', selectedBody: '#FF9F1C', selectedCasing: '#FFFFFF', staleOpacity: 0.4, unknownOpacity: 0.15 };
  }

  function _buildSharedMaterials() {
    var THREE = _three();
    var tokens = _resolvePaletteTrainTokens();
    return {
      BodyMetal: new THREE.MeshStandardMaterial({ color: tokens.neutralBody, metalness: 0.6, roughness: 0.5 }),
      DoorMetal: new THREE.MeshStandardMaterial({ color: tokens.neutralBody, metalness: 0.5, roughness: 0.6 }),
      WindowGlass: new THREE.MeshStandardMaterial({ color: 0x1c2733, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.65 }),
      UndercarriageDark: new THREE.MeshStandardMaterial({ color: 0x111214, metalness: 0.3, roughness: 0.8 }),
      TrimDark: new THREE.MeshStandardMaterial({ color: tokens.casing, metalness: 0.4, roughness: 0.6 }),
      LightSurface: new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xfff2c2, emissiveIntensity: 0.6 }),
    };
  }

  // Map a source object's own name to one of our named material roles. The
  // GLB's own object names (ROLE_NAMES) are the hierarchy roles (spec §5);
  // this is a SEPARATE, smaller mapping from those same names to which
  // shared material each renders with. Unknown names get no override — they
  // keep whatever material the GLB exported them with, which is intentional
  // (spec §6: "missing Blender textures must not block train-motion
  // integration" — we only override the roles we have real opinions about).
  function _materialRoleForObjectName(name) {
    if (!name) return null;
    if (name === 'Body' || name === 'FrontBumper' || name === 'RearBumper' || name === 'RearPanel') return 'BodyMetal';
    if (name === 'Doors') return 'DoorMetal';
    if (name === 'Windows') return 'WindowGlass';
    if (name === 'LowerBody' || name === 'WheelsFront' || name === 'WheelsRear') return 'UndercarriageDark';
    return null;
  }

  function _mapSourceRoles(threeGroup) {
    var found = {};
    ROLE_NAMES.forEach(function (n) { found[n] = null; });
    var graffiti = { left: false, right: false };
    if (threeGroup && typeof threeGroup.traverse === 'function') {
      threeGroup.traverse(function (obj) {
        if (!obj || !obj.name) return;
        if (Object.prototype.hasOwnProperty.call(found, obj.name) && !found[obj.name]) {
          found[obj.name] = obj;
        }
        if (obj.name === 'Graffiti_Left') graffiti.left = true;
        if (obj.name === 'Graffiti_Right') graffiti.right = true;
      });
    }
    return { roles: found, graffiti: graffiti };
  }

  // Applies the shared default materials by traversal-name match. Called
  // once against the cached source scene at load time — every createInstance()
  // clone inherits these by reference (THREE clone() semantics), never
  // rebuilding a material set per car.
  function _applyDefaultMaterials(threeGroup) {
    threeGroup.traverse(function (obj) {
      if (!obj || !obj.isMesh) return;
      var role = _materialRoleForObjectName(obj.name);
      if (role && _sharedMaterials[role]) obj.material = _sharedMaterials[role];
    });
  }

  // The shared materials are MeshStandardMaterial (PBR — requires real
  // scene lights, unlike MeshBasicMaterial) but this adapter's rendered
  // group is never added to a THREE.Scene with its own lighting (the
  // Mapbox custom layer renders `group` directly via a bare THREE.Camera,
  // mirroring wallRuntimeGlbRenderLayer.js/orbProfileRenderer.js's pattern).
  // Confirmed live, 2026-08-25: without this, the car rendered essentially
  // black/invisible against a dark scene. Fixed the same way
  // orbObjectFactory.js does — bake ambient+directional lights directly
  // into the group being rendered, added ONCE to _sourceScene so every
  // clone(true) instance inherits them.
  function _addLights(THREE, group) {
    var ambient = new THREE.AmbientLight(0xffffff, 0.55);
    var key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2, 3, 2);
    var rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(-2, 1, -2);
    group.add(ambient, key, rim);
  }

  // Confirmed live, 2026-08-25 (pixel-diff test: identical framebuffer
  // bytes before/after activating the layer, despite a correctly-loaded
  // instance and error-free render() calls): the car never drew a single
  // pixel. Root cause — this custom layer's render() bakes the real
  // position/scale/heading directly into `camera.projectionMatrix` (the
  // same technique wallRuntimeGlbRenderLayer.js/orbProfileRenderer.js use)
  // rather than using a normal symmetric camera frustum. Three.js's default
  // per-frame frustum culling (Object3D.frustumCulled === true) extracts
  // clipping planes from that projectionMatrix via
  // Frustum.setFromProjectionMatrix — a well-known incompatibility with this
  // "model-baked-into-projection" trick, since the extracted planes no
  // longer describe a real camera frustum and can cull genuinely visible
  // geometry every frame. Disabled once here, propagates to every
  // clone(true) instance (frustumCulled is a plain copied property).
  function _disableFrustumCulling(group) {
    group.traverse(function (obj) { obj.frustumCulled = false; });
  }

  // ── load() — idempotent, loads exactly once ─────────────────────────────────
  // THREE is a classic synchronous <script>, always ready by the time any
  // wall/ module executes. GLTFLoader is NOT (wall/index.html attaches
  // THREE.GLTFLoader via an ES-module import shim, since three@0.160.0 no
  // longer ships the legacy non-module examples/js build — module scripts
  // fetch over the network and can genuinely still be in flight when an
  // early caller, e.g. this file's own dev-flag auto-activate path, calls
  // load() at boot). A transient absence here is expected, not fatal —
  // retry with backoff instead of permanently caching the miss the way a
  // real load_error should be cached.
  var LOADER_WAIT_RETRY_MS = 150;
  var LOADER_WAIT_MAX_ATTEMPTS = 40; // ~6s ceiling — generous for a CDN fetch on first load

  function load(opts) {
    if (_loadPromise) return _loadPromise;
    opts = opts || {};
    var url = opts.url || GLB_URL;

    _loadPromise = new Promise(function (resolveOuter) {
      var attempts = 0;
      function _waitForLoaderThenLoad() {
        var THREE = _three();
        var GltfLoader = _gltfLoader();
        if (THREE && GltfLoader) { _startGlbLoad(THREE, GltfLoader, url, resolveOuter); return; }
        attempts += 1;
        if (attempts >= LOADER_WAIT_MAX_ATTEMPTS) {
          _loadError = 'three_or_gltfloader_unavailable_after_wait';
          console.warn('[SubwayTrainCarVisualAdapter] ' + _loadError);
          resolveOuter({ ok: false, reason: _loadError });
          return;
        }
        global.setTimeout(_waitForLoaderThenLoad, LOADER_WAIT_RETRY_MS);
      }
      _waitForLoaderThenLoad();
    });

    return _loadPromise;
  }

  function _startGlbLoad(THREE, GltfLoader, url, resolve) {
    var loader = new GltfLoader();
    loader.load(
        url,
        function (gltf) {
          try {
            _sourceScene = gltf.scene;
            // Spec §11 "source origin" qualification — the exported model's
            // local origin is NOT at its geometric center (confirmed live,
            // 2026-08-25: bounds z ranged -145.8..+6.3, i.e. origin sits near
            // one end). Computed ONCE here, applied via an inner centering
            // group in createInstance() — never a per-frame correction.
            var box = new THREE.Box3().setFromObject(_sourceScene);
            var center = new THREE.Vector3();
            box.getCenter(center);
            _sourceCenterOffset = { x: center.x, y: center.y, z: center.z };
            _sharedMaterials = _buildSharedMaterials();
            var mapped = _mapSourceRoles(_sourceScene);
            _roleMapping = mapped.roles;
            _graffitiMountsFound = mapped.graffiti;
            _applyDefaultMaterials(_sourceScene);
            _addLights(THREE, _sourceScene);
            _disableFrustumCulling(_sourceScene);
            _loaded = true;
            _loadError = null;
            console.log('[SubwayTrainCarVisualAdapter] loaded', url, '— roles:', JSON.stringify(Object.keys(_roleMapping).reduce(function (acc, k) { acc[k] = !!_roleMapping[k]; return acc; }, {})));
            resolve({ ok: true });
          } catch (e) {
            _loadError = 'post_load_processing_failed: ' + (e && e.message ? e.message : String(e));
            console.warn('[SubwayTrainCarVisualAdapter] ' + _loadError);
            resolve({ ok: false, reason: _loadError });
          }
        },
        undefined,
        function (err) {
          _loadError = 'load_error: ' + (err && err.message ? err.message : String(err));
          console.warn('[SubwayTrainCarVisualAdapter] ' + _loadError);
          resolve({ ok: false, reason: _loadError });
        }
      );
  }

  function isLoaded() { return _loaded; }

  function _graffitiSurfaceStatus() {
    if (_graffitiMountsFound.left && _graffitiMountsFound.right) return 'ready';
    return 'requires_blender_prep';
  }

  function getDiagnostics() {
    return {
      loaded: _loaded,
      loadError: _loadError,
      roleMapping: _roleMapping ? Object.keys(_roleMapping).reduce(function (acc, k) { acc[k] = !!_roleMapping[k]; return acc; }, {}) : null,
      graffitiSurfaceStatus: _loaded ? _graffitiSurfaceStatus() : 'unknown',
      instanceCount: _instanceCount,
      canonicalConfig: getCanonicalConfig(),
    };
  }

  // ── createInstance() ─────────────────────────────────────────────────────────
  function createInstance(identity) {
    if (!_loaded || !_sourceScene) return null;
    identity = identity || {};

    var THREE = _three();
    var content = _sourceScene.clone(true); // shares geometry + default materials with _sourceScene by reference
    // Wrap the cloned content in an outer group offset by the negative
    // center (raw model units). Because `content` is a CHILD of `clone`,
    // this offset is composed BEFORE clone's own axis-correction rotation
    // and scaleToMeters (Three.js TRS order), so the geometric center ends
    // up exactly at the Mercator position setTransform() places `clone` at
    // — regardless of the fixed rotation/scale applied to `clone` itself.
    var clone = new THREE.Group();
    content.position.set(-_sourceCenterOffset.x, -_sourceCenterOffset.y, -_sourceCenterOffset.z);
    clone.add(content);
    var ownedMaterials = {}; // roleName -> THREE.Material, created lazily, owned by THIS instance only
    var lastTransform = { lon: null, lat: null, altM: 0, headingDeg: 0 };

    function _ensureUniqueMaterial(roleName, meshList) {
      if (ownedMaterials[roleName]) return ownedMaterials[roleName];
      var base = _sharedMaterials[roleName];
      if (!base) return null;
      var unique = base.clone();
      ownedMaterials[roleName] = unique;
      meshList.forEach(function (m) { m.material = unique; });
      return unique;
    }

    function setTransform(lon, lat, altM, headingDeg) {
      lastTransform = { lon: lon, lat: lat, altM: (altM || 0) + _canonicalConfig.groundOffsetM, headingDeg: headingDeg || 0 };
      clone.rotation.set(_canonicalConfig.upAxisCorrectionRad, 0, 0);
      clone.rotation.z = _canonicalConfig.forwardAxisCorrectionRad;
      clone.scale.setScalar(_canonicalConfig.scaleToMeters);
    }

    function getLastTransform() { return Object.assign({}, lastTransform); }

    function setVisibility(visible) { clone.visible = !!visible; }

    function setServiceAppearance(opts) {
      opts = opts || {};
      var tokens = _resolvePaletteTrainTokens();
      if (opts.selected) {
        var meshes = [];
        clone.traverse(function (o) { if (o && o.isMesh && _materialRoleForObjectName(o.name) === 'BodyMetal') meshes.push(o); });
        if (meshes.length) {
          var mat = _ensureUniqueMaterial('BodyMetal', meshes);
          if (mat && mat.color) mat.color.set(tokens.selectedBody);
        }
      }
      if (typeof opts.opacity === 'number') {
        clone.traverse(function (o) {
          if (o && o.isMesh && o.material) { o.material.transparent = true; o.material.opacity = opts.opacity; }
        });
      } else if (opts.stale) {
        clone.traverse(function (o) {
          if (o && o.isMesh && o.material) { o.material.transparent = true; o.material.opacity = tokens.staleOpacity; }
        });
      }
    }

    function setGraffitiOverlay(side, overlayOrNull) {
      var mountName = side === 'left' ? 'Graffiti_Left' : side === 'right' ? 'Graffiti_Right' : null;
      if (!mountName) return;
      if (_graffitiSurfaceStatus() !== 'ready') return; // no-op — see GRAFFITI SURFACE STATUS in getDiagnostics()
      var mount = null;
      clone.traverse(function (o) { if (o && o.name === mountName) mount = o; });
      if (!mount) return;
      if (overlayOrNull && overlayOrNull.isTexture) {
        var mat = new THREE.MeshBasicMaterial({ map: overlayOrNull, transparent: true });
        mount.material = mat;
        mount.visible = true;
      } else {
        mount.visible = false;
      }
    }

    function getIdentity() {
      return {
        train_id: identity.train_id || null,
        car_index: typeof identity.car_index === 'number' ? identity.car_index : 0,
        id: identity.id || null,
        left_exterior_surface: (identity.id || identity.train_id || 'car') + ':left',
        right_exterior_surface: (identity.id || identity.train_id || 'car') + ':right',
      };
    }

    function disposeInstance() {
      if (clone.parent) clone.parent.remove(clone);
      Object.keys(ownedMaterials).forEach(function (roleName) {
        try { ownedMaterials[roleName].dispose(); } catch (e) {}
      });
      ownedMaterials = {};
    }

    _instanceCount += 1;

    return {
      group: clone,
      setTransform: setTransform,
      getLastTransform: getLastTransform,
      setVisibility: setVisibility,
      setServiceAppearance: setServiceAppearance,
      setGraffitiOverlay: setGraffitiOverlay,
      getIdentity: getIdentity,
      disposeInstance: disposeInstance,
    };
  }

  // ── disposeSharedAsset() — module-level, only on full layer teardown ───────
  function disposeSharedAsset() {
    if (_sourceScene) {
      _sourceScene.traverse(function (obj) {
        if (obj.geometry) { try { obj.geometry.dispose(); } catch (e) {} }
      });
    }
    if (_sharedMaterials) {
      Object.keys(_sharedMaterials).forEach(function (k) {
        try { _sharedMaterials[k].dispose(); } catch (e) {}
      });
    }
    _sourceScene = null;
    _sharedMaterials = null;
    _roleMapping = null;
    _graffitiMountsFound = { left: false, right: false };
    _loaded = false;
    _loadError = null;
    _loadPromise = null;
    _instanceCount = 0;
  }

  // ── inspectGlb() — pure diagnostic, never touches vehicle/route/camera/
  // runtime state (same authority boundary as threePrimitiveVisibilityHarness.js's
  // own stated contract). Loads (or reuses) the real GLB and reports its
  // bounding box + hierarchy so the canonical config above can be filled in
  // from real numbers, not guesses. ─────────────────────────────────────────
  function inspectGlb() {
    var THREE = _three();
    if (!THREE) { console.warn('[SubwayTrainCarVisualAdapter] inspectGlb: THREE unavailable'); return Promise.resolve(null); }
    return load().then(function (res) {
      if (!res.ok || !_sourceScene) {
        console.warn('[SubwayTrainCarVisualAdapter] inspectGlb: load failed —', res.reason);
        return null;
      }
      var box = new THREE.Box3().setFromObject(_sourceScene);
      var size = new THREE.Vector3();
      box.getSize(size);
      var names = [];
      _sourceScene.traverse(function (o) { if (o && o.name) names.push(o.name); });
      var report = {
        boundsMin: { x: box.min.x, y: box.min.y, z: box.min.z },
        boundsMax: { x: box.max.x, y: box.max.y, z: box.max.z },
        size: { x: size.x, y: size.y, z: size.z },
        objectNames: names,
        roleMapping: getDiagnostics().roleMapping,
        graffitiSurfaceStatus: _graffitiSurfaceStatus(),
      };
      console.log('[SubwayTrainCarVisualAdapter] inspectGlb report:', JSON.stringify(report, null, 2));
      if (report.graffitiSurfaceStatus !== 'ready') {
        console.log('[SubwayTrainCarVisualAdapter] GRAFFITI SURFACE STATUS: REQUIRES BLENDER PREP');
      }
      var harness = SBE.ThreeProof || (global._wos && global._wos.debug && global._wos.debug.threeProof);
      if (harness && typeof harness.axisTripod === 'function') {
        try { harness.axisTripod(); console.log('[SubwayTrainCarVisualAdapter] axisTripod() drawn at map center for visual axis read'); } catch (e) {}
      }
      return report;
    });
  }

  SBE.SubwayTrainCarVisualAdapter = Object.freeze({
    VERSION: VERSION,
    GLB_URL: GLB_URL,
    load: load,
    isLoaded: isLoaded,
    createInstance: createInstance,
    disposeSharedAsset: disposeSharedAsset,
    getDiagnostics: getDiagnostics,
    setCanonicalConfig: setCanonicalConfig,
    getCanonicalConfig: getCanonicalConfig,
    inspectGlb: inspectGlb,
    __mapSourceRolesForTests: _mapSourceRoles,
    __materialRoleForObjectNameForTests: _materialRoleForObjectName,
  });

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subway3d = global._wos.debug.subway3d || {};
  global._wos.debug.subway3d.inspectGlb = inspectGlb;
  global._wos.debug.subway3d.adapterStatus = getDiagnostics;
  global._wos.debug.subway3d.setCanonicalConfig = setCanonicalConfig;

  console.log('[SubwayTrainCarVisualAdapter] v' + VERSION + ' loaded');
})(window);
