(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalCameraRig — camera mode management for WOS Orbital Mode ───────────

  var MODES = SBE.OrbitalEffectState
    ? SBE.OrbitalEffectState.CAMERA_MODES
    : { LOCK: 'lock', DRIFT: 'drift', ORBIT: 'orbit', DIVE: 'dive' };

  // Base camera position: slightly above equator, looking at origin
  var BASE_POS   = { x: 0,    y: 0.35, z: 2.8 };
  var ORBIT_RADIUS = 2.8;

  function OrbitalCameraRig(opts) {
    opts = opts || {};
    this._camera = opts.camera;           // THREE.PerspectiveCamera
    this._mode   = MODES.DRIFT;
    this._t      = 0;                     // accumulated time (seconds)
    this._orbitAngle = 0;
  }

  OrbitalCameraRig.prototype.setMode = function (mode) {
    this._mode = mode;
    if (mode === MODES.LOCK) {
      this._camera.position.set(BASE_POS.x, BASE_POS.y, BASE_POS.z);
      this._camera.lookAt(0, 0, 0);
    }
  };

  OrbitalCameraRig.prototype.getMode = function () { return this._mode; };

  OrbitalCameraRig.prototype.update = function (deltaMs, effectState) {
    if (!this._camera) return;
    var dt    = deltaMs / 1000;
    var drift = effectState ? effectState.cameraDrift : 0.18;

    this._t += dt;

    switch (this._mode) {

      case MODES.LOCK:
        // Static — no movement
        break;

      case MODES.DRIFT:
        // Slow sine-wave breathing on Y and Z
        var breatheY = Math.sin(this._t * 0.12) * 0.08 * drift;
        var breatheZ = Math.cos(this._t * 0.09) * 0.06 * drift;
        this._camera.position.set(
          BASE_POS.x + Math.sin(this._t * 0.07) * 0.04 * drift,
          BASE_POS.y + breatheY,
          BASE_POS.z + breatheZ
        );
        this._camera.lookAt(0, 0, 0);
        break;

      case MODES.ORBIT:
        // Gentle lateral arc around the globe
        this._orbitAngle += dt * 0.08 * drift;
        this._camera.position.set(
          Math.sin(this._orbitAngle) * ORBIT_RADIUS,
          BASE_POS.y + Math.sin(this._t * 0.10) * 0.05 * drift,
          Math.cos(this._orbitAngle) * ORBIT_RADIUS
        );
        this._camera.lookAt(0, 0, 0);
        break;

      case MODES.DIVE:
        // Reserved: future map-return transition
        // Slowly move camera closer to globe surface
        var diveZ = Math.max(1.2, BASE_POS.z - this._t * 0.2);
        this._camera.position.set(BASE_POS.x, BASE_POS.y, diveZ);
        this._camera.lookAt(0, 0, 0);
        break;

      default:
        this._camera.lookAt(0, 0, 0);
    }
  };

  SBE.OrbitalCameraRig = OrbitalCameraRig;

})(window);
