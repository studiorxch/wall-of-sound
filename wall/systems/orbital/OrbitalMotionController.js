(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalMotionController — scene animation for WOS Orbital Mode ───────────
  // Rotates earth, pulses atmosphere, animates scan rings, background stars.
  // No rapid strobing. Stream-safe by default.

  function OrbitalMotionController(opts) {
    opts = opts || {};
    this._earth      = opts.earth      || null;   // THREE.Mesh (globe sphere)
    this._atmo       = opts.atmo       || null;   // THREE.Mesh (atmosphere shell)
    this._grid       = opts.grid       || null;   // THREE.LineSegments (wireframe)
    this._scanRing   = opts.scanRing   || null;   // THREE.Mesh (ring)
    this._particles  = opts.particles  || null;   // THREE.Points
    this._stars      = opts.stars      || null;   // THREE.Points (background)
    this._cameraRig  = opts.cameraRig  || null;   // OrbitalCameraRig
    this._paused     = false;
    this._t          = 0;
    this._scanPhase  = 0;
    this._scanActive = false;
    this._scanTimer  = 0;
    this._scanCooldown = 8;   // seconds between sweeps
  }

  OrbitalMotionController.prototype.update = function (deltaMs, effectState, visualSignals) {
    if (this._paused) return;
    if (!effectState) return;

    var dt = deltaMs / 1000;
    this._t += dt;

    var rot    = effectState.rotationSpeed;
    var atmoI  = effectState.atmosphereIntensity;
    var gridI  = effectState.gridIntensity;
    var scanI  = effectState.scanRingIntensity;
    var partI  = effectState.particleIntensity;

    // Earth rotation — very slow eastward drift
    if (this._earth) {
      this._earth.rotation.y += dt * rot * 0.3;
    }

    // Grid co-rotates with earth, slightly slower for visual depth
    if (this._grid) {
      this._grid.rotation.y += dt * rot * 0.28;
      this._grid.material.opacity = gridI * 0.55;
    }

    // Atmosphere pulse — slow sine on opacity
    if (this._atmo && this._atmo.material) {
      this._atmo.material.opacity = atmoI * (0.18 + Math.sin(this._t * 0.20) * 0.04);
    }

    // Particles — rotate opposite direction for depth
    if (this._particles) {
      this._particles.rotation.y -= dt * rot * 0.10;
      this._particles.material.opacity = partI * 0.8;
      this._particles.visible = partI > 0.02;
    }

    // Stars — very slow parallax drift
    if (this._stars) {
      this._stars.rotation.y += dt * 0.004;
      this._stars.rotation.x += dt * 0.002;
    }

    // Scan ring — occasional sweep
    if (this._scanRing) {
      this._scanTimer += dt;
      if (!this._scanActive && this._scanTimer >= this._scanCooldown) {
        this._scanActive = true;
        this._scanPhase  = 0;
        this._scanTimer  = 0;
        this._scanCooldown = 6 + Math.random() * 8;
      }
      if (this._scanActive) {
        this._scanPhase += dt * 1.4;
        var sweep = Math.sin(this._scanPhase * Math.PI);
        this._scanRing.material.opacity = sweep * scanI * 0.72;
        this._scanRing.rotation.x += dt * 0.4;
        if (this._scanPhase >= 1) this._scanActive = false;
      } else {
        this._scanRing.material.opacity = 0;
      }
    }

    // Camera rig update
    if (this._cameraRig) {
      this._cameraRig.update(deltaMs, effectState);
    }
  };

  OrbitalMotionController.prototype.pause = function () { this._paused = true; };
  OrbitalMotionController.prototype.resume = function () { this._paused = false; };
  OrbitalMotionController.prototype.reset = function () {
    this._t = 0; this._scanPhase = 0; this._scanTimer = 0; this._scanActive = false;
    if (this._earth)    this._earth.rotation.set(0, 0, 0);
    if (this._grid)     this._grid.rotation.set(0, 0, 0);
    if (this._scanRing) this._scanRing.rotation.set(0, 0, 0);
  };

  SBE.OrbitalMotionController = OrbitalMotionController;

})(window);
