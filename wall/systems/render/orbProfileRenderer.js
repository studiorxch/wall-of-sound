// ── OrbProfileRenderer v1.0.0 ─────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
// Status: active | Classification: render / orb-profile-renderer
//
// Renders the ACTIVE Orb Profile on canonical LIVE MAP as a genuine Mapbox
// GL custom layer with its own THREE.WebGLRenderer/Camera — a wholly
// separate layer from WorldSpaceVehicleLayer (which is designed for a small
// catalog of near-static low-poly vehicle meshes, not Points/LineSegments/
// dynamic-topology Orb archetypes). Modeled directly on
// wall/systems/runtime/wallRuntimeGlbRenderLayer.js's proven skeleton: one
// custom layer sharing the map's GL context (autoClear=false), resetState()
// immediately before every render() call (the documented, already-proven
// mechanism that makes a second independent THREE.WebGLRenderer safe to
// interleave with WorldSpaceVehicleLayer's own renderer on one shared
// context/frame).
//
// Position authority: THIS FILE NEVER COMPUTES POSITION. It only receives
// {lat, lng, headingDeg} pushed via update(entity) from the exact same call
// site heroVehicleRenderer.js already receives it from
// (HeroVehicleRuntime._frame()'s RAF loop) — a read-only consumer, same
// precedent as TraversalHUD's read-only relationship to HeroVehicleRuntime.
//
// Failure isolation: activate()/rebuildActive() validate construction once,
// in a try/catch (mirrors wallRuntimeGlbRenderLayer.js's load-or-fallback
// pattern) — a broken profile never reaches the frame loop. render() is ALSO
// wrapped defensively (mirrors worldSpaceVehicleLayer.js's per-frame guard)
// so a transient runtime failure degrades gracefully instead of crashing.
// Either failure flips isRenderReady() false, which is exactly what
// heroVehicleRenderer.js's selection hook polls to fall back to Hero Car.
//
// "Freshness" gate: render() only draws if update(entity) was called within
// the last ORB_STALE_MS — this is what makes Orb implicitly disappear the
// instant heroVehicleRenderer.js stops selecting it (falls back to Hero Car),
// with no separate explicit hide/show call needed. Mapbox still invokes this
// layer's render() on every ordinary map repaint (camera pans, other layers'
// triggerRepaint) regardless of whether OUR update() was recently called —
// this gate is what prevents a stale Orb ghost from lingering at its last
// position once Hero Car has taken back over.
//
// Placement: wall/systems/render/orbProfileRenderer.js
// Load: AFTER orbObjectFactory.js. BEFORE orbProfileRegistry.js/applyAdapters/authority.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE       = (global.SBE = global.SBE || {});
  var VERSION   = '1.0.0';
  var LAYER_ID  = 'wos-orb-profile';
  var SOURCE    = 'OrbProfileRenderer';
  var ORB_STALE_MS   = 250;   // ~15 frames at 60fps
  var ORB_BASE_METERS = 2.2;  // real-world footprint target, independent of the profile's own abstract "scale" slider
  // 0805A — heroVisualLiftPixels diagnostic bridge: a rough, fixed pixel→meter
  // approximation (mirrors heroVehicleRenderer.js's own LIFT_PX_PER_METER
  // constant), NOT a live per-frame screen-projection unproject — this is
  // explicitly a diagnostic bridge for the later occlusion/terrain build, not
  // the final height solution.
  var VISUAL_LIFT_METERS_PER_PX = 0.6;

  var _map        = null;
  var _renderer   = null;
  var _camera     = null;
  var _layerAdded = false;

  var _current       = null;  // { profile, instance }
  var _healthy       = false;
  var _lastEntity     = null;
  var _lastUpdateMs   = 0;
  var _lastError       = null;
  var _warnMs           = 0;

  function _diag() {
    return global.WOSWallDiagnostics || { info: function () {}, warn: function () {}, error: function () {} };
  }

  function _warnThrottled(msg) {
    var now = Date.now();
    if (now - _warnMs > 2000) {
      _warnMs = now;
      console.warn('[' + SOURCE + '] ' + msg);
    }
  }

  // ── Mapbox custom layer ────────────────────────────────────────────────────
  var _layer = {
    id: LAYER_ID,
    type: 'custom',
    renderingMode: '3d',

    onAdd: function (map, gl) {
      _map = map;
      var THREE = global.THREE;
      if (!THREE) { _diag().warn(SOURCE, 'three_unavailable', 'THREE not loaded'); return; }
      _camera = new THREE.Camera();
      _renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      _renderer.autoClear = false;
      _diag().info(SOURCE, 'layer_added', 'renderer ready');
    },

    render: function (gl, matrix) {
      if (!_renderer || !_camera || !_healthy || !_current || !_lastEntity) return;
      if (Date.now() - _lastUpdateMs > ORB_STALE_MS) return; // stale — Hero Car has taken back over
      var THREE = global.THREE;
      var mapboxgl = global.mapboxgl;
      if (!THREE || !mapboxgl) return;
      try {
        // 0730E — real altitude passthrough (presentation-only; never affects
        // route/progress/heading, which are computed entirely upstream).
        // 0805A — heroVisualLiftPixels is a SEPARATE, independent presentation
        // offset (default 0) added on top — never merged into altitudeMeters
        // itself, so the two stay independently controllable/diagnosable.
        var liftMeters = (_lastEntity.heroVisualLiftPixels || 0) * VISUAL_LIFT_METERS_PER_PX;
        var mc = mapboxgl.MercatorCoordinate.fromLngLat([_lastEntity.lng, _lastEntity.lat], (_lastEntity.altitudeMeters || 0) + liftMeters);
        var meterScale = mc.meterInMercatorCoordinateUnits() * ORB_BASE_METERS;
        var modelMatrix = new THREE.Matrix4();
        var rotMatrix = new THREE.Matrix4();
        modelMatrix.set(
          meterScale, 0, 0, mc.x,
          0, meterScale, 0, mc.y,
          0, 0, meterScale, mc.z,
          0, 0, 0, 1
        );
        rotMatrix.makeRotationZ(-(_lastEntity.headingDeg || 0) * Math.PI / 180);
        modelMatrix.multiply(rotMatrix);

        var projMatrix = new THREE.Matrix4().fromArray(matrix);
        _camera.projectionMatrix = new THREE.Matrix4().copy(projMatrix).multiply(modelMatrix);

        _current.instance.update(performance.now() / 1000);
        _renderer.resetState();
        _renderer.render(_current.instance.group, _camera);
      } catch (e) {
        _healthy = false;
        _lastError = (e && e.message) || String(e);
        _warnThrottled('render failed, falling back to Hero Car: ' + _lastError);
      }
    },

    onRemove: function () {
      _renderer = null;
      _camera = null;
    },
  };

  function _ensureLayer() {
    var map = _map || (global.SBE && global.SBE.MapboxViewportRuntime && global.SBE.MapboxViewportRuntime.getMap());
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

  // ── Activate / rebuild / refresh ──────────────────────────────────────────
  function _disposeCurrent() {
    if (_current && _current.instance && typeof _current.instance.dispose === 'function') {
      try { _current.instance.dispose(); } catch (e) { /* best-effort */ }
    }
    _current = null;
  }

  function activate(profile) {
    if (!profile) return { ok: false, reason: 'no_profile' };
    var THREE = global.THREE;
    var factory = SBE.OrbObjectFactory;
    if (!THREE || !factory) {
      _healthy = false;
      _warnThrottled('THREE or OrbObjectFactory unavailable — Hero Car fallback active');
      return { ok: false, reason: 'dependencies_unavailable' };
    }
    _disposeCurrent();
    try {
      var instance = factory.build(profile, THREE);
      _current = { profile: profile, instance: instance };
      _healthy = true;
      _lastError = null;
    } catch (e) {
      _healthy = false;
      _lastError = (e && e.message) || String(e);
      _diag().error(SOURCE, 'activate_failed', profile.id + ' | ' + _lastError);
      return { ok: false, reason: 'construction_failed', error: _lastError };
    }
    _ensureLayer();
    return { ok: true };
  }

  // Structural edit to the currently-rendered profile — same as activate(),
  // named separately so callers' intent (fresh activation vs. a rebuild
  // triggered by an edit) stays legible in orbProfileApplyAdapters.js.
  function rebuildActive(profile) { return activate(profile); }

  function refreshActive(profile) {
    if (!_current || !_healthy) return { ok: false, reason: 'not_active' };
    try {
      _current.instance.refresh(profile);
      _current.profile = profile;
      return { ok: true };
    } catch (e) {
      _healthy = false;
      _lastError = (e && e.message) || String(e);
      _warnThrottled('refresh failed: ' + _lastError);
      return { ok: false, reason: 'refresh_failed' };
    }
  }

  // ── Public: position feed (read-only consumer, never computes position) ──
  function update(entity) {
    if (!entity) return false;
    _lastEntity = entity;
    _lastUpdateMs = Date.now();
    if (_map) { try { _map.triggerRepaint(); } catch (e) {} }
    return _healthy && _layerAdded;
  }

  function isRenderReady() { return _healthy && _layerAdded && !!_current; }
  function isHealthy() { return _healthy; }
  function getLastError() { return _lastError; }

  function disposeCurrent() { _disposeCurrent(); }

  SBE.OrbProfileRenderer = Object.freeze({
    VERSION: VERSION,
    activate: activate,
    rebuildActive: rebuildActive,
    refreshActive: refreshActive,
    update: update,
    isRenderReady: isRenderReady,
    isHealthy: isHealthy,
    getLastError: getLastError,
    disposeCurrent: disposeCurrent,
  });

  console.log('[OrbProfileRenderer] v' + VERSION + ' loaded');

})(window);
