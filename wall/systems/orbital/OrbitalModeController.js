(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalModeController — WOS Orbital Mode master controller ───────────────
  // Owns the THREE.js orbital scene canvas, rAF loop, and all sub-controllers.
  // Enter/exit from traversalControlDeck transport selection.

  var _CANVAS_ID    = 'orbital-mode-canvas';
  var _CANVAS_Z     = 200;  // above Mapbox, below #wos-nav (z-index 900)
  var _STAR_COUNT   = 1800;
  var _PARTICLE_COUNT = 900;

  // ── Scene colour palette ──────────────────────────────────────────────────────
  var C = {
    earthBase:   0x020c18,
    earthLine:   0x1a4a7a,
    atmo:        0x1a5fa8,
    scanRing:    0x28d4c8,
    stars:       0xc8e8ff,
    particles:   0x3ad0f0,
    sunDir:      null
  };

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function _el(tag, attrs) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { e[k] = attrs[k]; });
    return e;
  }

  function _guard() {
    return !!(global.THREE && global.THREE.Scene && global.THREE.WebGLRenderer &&
              global.THREE.PerspectiveCamera && global.THREE.SphereGeometry);
  }

  // ── OrbitalModeController class ───────────────────────────────────────────────

  function OrbitalModeController(opts) {
    opts = opts || {};
    this._active      = false;
    this._canvas      = null;
    this._renderer    = null;
    this._scene       = null;
    this._camera      = null;
    this._earth       = null;
    this._atmo        = null;
    this._grid        = null;
    this._scanRing    = null;
    this._particles   = null;
    this._stars       = null;
    this._rafId       = null;
    this._lastTs      = 0;
    this._effectState = SBE.OrbitalEffectState
      ? SBE.OrbitalEffectState.createDefaultOrbitalEffectState()
      : {};
    this._motion      = null;
    this._camRig      = null;
    this._hudAdapter  = null;
    this._fxPanel     = null;
    this._playBridge  = null;
    this._audioBridge = null;
    this._logger      = SBE.OrbitalDiagnostics || { log: function(){}, info: function(){}, warn: console.warn, error: console.error };
    this._onTransport = opts.onTransportChange || null;
    this._prevFrozen  = false;
  }

  // LEGACY / MANUAL-ONLY (0627F quarantine)
  // This bare enter() activates the Three.js visualizer directly.
  // It is NOT called by the default Orbital route (which uses enterFromMapContext).
  // The normal entry path: WosStartupCoordinator → WosModeTransitionController → enterFromMapContext(ctx,'earth').
  // Only call this directly to test or activate a legacy Three.js visualizer scene.
  OrbitalModeController.prototype.enter = function () {
    if (this._active) return;
    if (!_guard()) { this._logger.warn('THREE.js not available — cannot enter Orbital Mode'); return; }
    console.warn('[WOS Orbital] LEGACY VISUALIZER ENTERED via bare enter()',
      { submode: 'three.js-direct', manualOnly: true, defaultRoute: false });
    this._logger.info('enter');
    this._buildScene();
    this._buildSubControllers();
    this._applyPreset(this._effectState.activePreset || 'deep_space_listen', false);
    this._startLoop();
    this._active = true;
    if (this._fxPanel) this._fxPanel.syncToState(this._effectState);
    if (this._hudAdapter) this._hudAdapter.notifyEntered(this._effectState);
    if (this._canvas) this._canvas.style.display = 'block';
    // Dim the map controls underneath while orbital is active
    document.body.classList.add('wos-orbital-active');
  };

  OrbitalModeController.prototype.exit = function () {
    if (!this._active) return;
    this._logger.info('exit');

    // Exit earth mode if active (Mapbox-first submode)
    var earthMode = SBE.OrbitalEarthMode;
    if (earthMode && earthMode.isActive && earthMode.isActive()) {
      earthMode.exit();
    }

    this._stopLoop();
    if (this._canvas) this._canvas.style.display = 'none';
    if (this._fxPanel) this._fxPanel.close();
    if (this._hudAdapter) this._hudAdapter.notifyExited();
    document.body.classList.remove('wos-orbital-active');
    this._active = false;
    this._submode = null;
  };

  OrbitalModeController.prototype.toggle = function () {
    this._active ? this.exit() : this.enter();
  };

  OrbitalModeController.prototype.isActive = function () { return this._active; };

  OrbitalModeController.prototype.setEffectState = function (partial) {
    var oes = SBE.OrbitalEffectState;
    if (oes) {
      this._effectState = oes.applyPartialState(this._effectState, partial);
    } else {
      this._effectState = Object.assign({}, this._effectState, partial);
    }
    if (this._camRig && partial.cameraMode) {
      this._camRig.setMode(partial.cameraMode);
    }
    if (this._fxPanel) this._fxPanel.syncToState(this._effectState);
    if (this._hudAdapter) this._hudAdapter.notifyStateChanged(this._effectState);
  };

  OrbitalModeController.prototype.getEffectState = function () {
    return Object.assign({}, this._effectState);
  };

  OrbitalModeController.prototype.openFxPanel = function () {
    if (!this._fxPanel) this._buildFxPanel();
    if (this._fxPanel) this._fxPanel.open();
  };

  OrbitalModeController.prototype.closeFxPanel = function () {
    if (this._fxPanel) this._fxPanel.close();
  };

  OrbitalModeController.prototype.toggleFxPanel = function () {
    if (!this._fxPanel) this._buildFxPanel();
    if (this._fxPanel) this._fxPanel.toggle();
  };

  OrbitalModeController.prototype.setStaticBackgroundEnabled = function (enabled) {
    this.setEffectState({ staticBackgroundEnabled: !!enabled });
    if (enabled) {
      this.captureStaticBackground();
    } else {
      this.restoreLiveOrbital();
    }
  };

  OrbitalModeController.prototype.captureStaticBackground = function () {
    // V1: pause the rAF loop — canvas freezes as a static frame
    this._stopLoop();
    this._staticMode = true;
    this._logger.info('static background captured');
  };

  OrbitalModeController.prototype.restoreLiveOrbital = function () {
    if (!this._staticMode) return;
    this._staticMode = false;
    if (this._active) this._startLoop();
    this._logger.info('live orbital restored');
  };

  OrbitalModeController.prototype.update = function (deltaMs) {
    if (!this._active) return;
    if (this._motion) {
      var signals = this._playBridge ? this._playBridge.getVisualSignals() : {};
      this._motion.update(deltaMs, this._effectState, signals);
    }
    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene, this._camera);
    }
  };

  OrbitalModeController.prototype.dispose = function () {
    this.exit();
    if (this._playBridge)  this._playBridge.dispose();
    if (this._fxPanel)     this._fxPanel.dispose();
    if (this._renderer)    this._renderer.dispose();
    if (this._canvas && this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    var css = document.getElementById('orbital-mode-css');
    if (css) css.parentNode.removeChild(css);
    this._renderer = this._scene = this._camera = this._canvas = null;
  };

  // ── Scene construction ────────────────────────────────────────────────────────

  // ── _injectOrbitalCSS — broadcast containment rules ─────────────────────────
  // Called from enterFromMapContext() for ALL submodes (earth and abstract).
  // Must not depend on _buildScene() — earth submode never calls _buildScene().
  // Idempotent: guard on existing #orbital-mode-css element.

  OrbitalModeController.prototype._injectOrbitalCSS = function () {
    if (document.getElementById('orbital-mode-css')) return;
    var s = document.createElement('style');
    s.id = 'orbital-mode-css';
    s.textContent = [
      'body.wos-orbital-active #wos-nav { opacity: 0.55; }',
      // Mapbox map is dimmed only for Three.js abstract submodes (portal/sphere/visualizer).
      // Earth submode (wos-orbital-earth-active) is Mapbox-first — map must stay at full brightness.
      'body.wos-orbital-active:not(.wos-orbital-earth-active) .mapboxgl-map { filter: brightness(0.08); }',
      // Travel bridge state — nav dims slightly during transition
      'body.wos-travel-state #wos-nav { opacity: 0.35; transition: opacity 400ms; }',
      '#wos-transition-overlay { pointer-events: none; }',
      '#wos-atm-bridge { pointer-events: none; }',
      // Broadcast containment: Studio canvas transport controls.
      // .transport-bar is the Studio authoring transport (BPM, bar count, quantize, record).
      // It is a STUDIO tool — must not appear in WALL broadcast or Orbital frames.
      'body.wos-orbital-earth-active .transport-bar { display: none !important; }',
      // Broadcast composition: hide authoring chrome during Orbital Earth.
      // #left-rail is a creator tool, not a broadcast element — hide it for clean OBS capture.
      // This does not affect #wos-nav (transport deck stays in C1/C3 zone).
      'body.wos-orbital-earth-active #left-rail { display: none; }',
      // Hide Mapbox attribution/control chrome during Orbital Earth broadcast.
      'body.wos-orbital-earth-active .mapboxgl-ctrl-bottom-right,',
      'body.wos-orbital-earth-active .mapboxgl-ctrl-top-right,',
      'body.wos-orbital-earth-active .mapboxgl-ctrl-bottom-left { opacity: 0; pointer-events: none; }',
      // Suppress AtmosphereComposite canvas during Orbital Earth.
      // atmosphereComposite persists through map.setStyle() and draws a night tint
      // (rgba(10,12,30,0.16)) + ambient brightness veil (~19% black) over the satellite globe.
      // Satellite globe must be evaluated raw — atmospheric canvas effects are for map mode only.
      'body.wos-orbital-earth-active #atmosphere-composite { display: none; }'
    ].join('\n');
    document.head.appendChild(s);
  };

  OrbitalModeController.prototype._buildScene = function () {
    if (this._renderer) return; // idempotent

    // Canvas overlay
    var canvas = document.getElementById(_CANVAS_ID);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = _CANVAS_ID;
      Object.assign(canvas.style, {
        position:  'fixed',
        inset:     '0',
        zIndex:    String(_CANVAS_Z),
        display:   'none',
        pointerEvents: 'none'
      });
      document.body.appendChild(canvas);
    }
    this._canvas = canvas;
    canvas.width  = global.innerWidth;
    canvas.height = global.innerHeight;

    // CSS already injected by _injectOrbitalCSS() — called from enterFromMapContext()
    // before any submode branch. No-op here for safety.
    this._injectOrbitalCSS();

    var THREE = global.THREE;

    // Renderer
    this._renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
    this._renderer.setSize(global.innerWidth, global.innerHeight);
    this._renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    this._renderer.setClearColor(0x000000, 0);

    // Scene + camera
    this._scene  = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(50, canvas.width / canvas.height, 0.1, 100);
    this._camera.position.set(0, 0.35, 2.8);
    this._camera.lookAt(0, 0, 0);

    // Lighting
    var ambient = new THREE.AmbientLight(0x1a3050, 1.2);
    var sun     = new THREE.DirectionalLight(0x6090c0, 1.8);
    sun.position.set(4, 2, 3);
    this._scene.add(ambient, sun);

    // Earth sphere
    var earthGeo  = new THREE.SphereGeometry(1, 48, 48);
    var earthMat  = new THREE.MeshStandardMaterial({
      color:      C.earthBase,
      roughness:  0.92,
      metalness:  0.08,
      emissive:   new THREE.Color(0x020810),
      emissiveIntensity: 0.3
    });
    this._earth = new THREE.Mesh(earthGeo, earthMat);
    this._scene.add(this._earth);

    // Grid wireframe (icosahedron for even distribution)
    var gridGeo = new THREE.IcosahedronGeometry(1.008, 4);
    var gridMat = new THREE.MeshBasicMaterial({
      color:       C.earthLine,
      wireframe:   true,
      transparent: true,
      opacity:     0.30,
      depthWrite:  false
    });
    this._grid = new THREE.Mesh(gridGeo, gridMat);
    this._scene.add(this._grid);

    // Atmosphere shell
    var atmoGeo = new THREE.SphereGeometry(1.12, 32, 32);
    var atmoMat = new THREE.MeshStandardMaterial({
      color:       C.atmo,
      transparent: true,
      opacity:     0.15,
      side:        THREE.FrontSide,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    });
    this._atmo = new THREE.Mesh(atmoGeo, atmoMat);
    this._scene.add(this._atmo);

    // Scan ring
    var ringGeo = new THREE.RingGeometry(1.18, 1.22, 80);
    var ringMat = new THREE.MeshBasicMaterial({
      color:       C.scanRing,
      side:        THREE.DoubleSide,
      transparent: true,
      opacity:     0,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    });
    this._scanRing = new THREE.Mesh(ringGeo, ringMat);
    this._scanRing.rotation.x = Math.PI / 2;
    this._scene.add(this._scanRing);

    // Particles shell
    this._particles = this._buildParticles(THREE, _PARTICLE_COUNT, 1.04, C.particles, 1.8);
    this._particles.visible = false;
    this._scene.add(this._particles);

    // Background stars
    this._stars = this._buildParticles(THREE, _STAR_COUNT, 40, C.stars, 1.0);
    this._scene.add(this._stars);

    // Resize handler
    var self = this;
    global.addEventListener('resize', function () {
      if (!self._renderer) return;
      canvas.width  = global.innerWidth;
      canvas.height = global.innerHeight;
      self._renderer.setSize(global.innerWidth, global.innerHeight);
      self._camera.aspect = global.innerWidth / global.innerHeight;
      self._camera.updateProjectionMatrix();
    });
  };

  OrbitalModeController.prototype._buildParticles = function (THREE, count, radius, color, size) {
    var positions = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var u     = Math.random();
      var v     = Math.random();
      var theta = 2 * Math.PI * u;
      var phi   = Math.acos(2 * v - 1);
      var r     = radius * (0.98 + Math.random() * 0.04);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color:       color,
      size:        size,
      sizeAttenuation: radius < 5,
      transparent: true,
      opacity:     0.65,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    });
    return new THREE.Points(geo, mat);
  };

  // ── Sub-controller construction ───────────────────────────────────────────────

  OrbitalModeController.prototype._buildSubControllers = function () {
    if (!this._camRig) {
      this._camRig = new (SBE.OrbitalCameraRig)({ camera: this._camera });
    }
    if (!this._motion) {
      this._motion = new (SBE.OrbitalMotionController)({
        earth:     this._earth,
        atmo:      this._atmo,
        grid:      this._grid,
        scanRing:  this._scanRing,
        particles: this._particles,
        stars:     this._stars,
        cameraRig: this._camRig
      });
    }
    if (!this._hudAdapter) {
      this._hudAdapter = new (SBE.OrbitalHudAdapter)({ logger: this._logger });
    }
    if (!this._playBridge) {
      this._playBridge = new (SBE.PlayToWosVisualBridge)({ logger: this._logger });
      this._playBridge.init();
    }
    if (!this._audioBridge) {
      this._audioBridge = new (SBE.OrbitalAudioReactiveBridge)({});
    }
    this._buildFxPanel();
  };

  OrbitalModeController.prototype._buildFxPanel = function () {
    if (this._fxPanel) return;
    var self = this;
    this._fxPanel = new (SBE.OrbitalFxPanel)({
      onStateChange: function (partial) { self.setEffectState(partial); },
      onAction: function (action) {
        if (action === 'freeze') {
          var frozen = !(self._effectState.rotationSpeed === 0 && self._effectState.cameraDrift === 0);
          if (frozen) {
            self._prevState = { rotationSpeed: self._effectState.rotationSpeed, cameraDrift: self._effectState.cameraDrift };
            self.setEffectState({ rotationSpeed: 0, cameraDrift: 0 });
          } else {
            self.setEffectState(self._prevState || { rotationSpeed: 0.06, cameraDrift: 0.14 });
          }
        } else if (action === 'reset') {
          self._applyPreset(self._effectState.activePreset || 'deep_space_listen', true);
        } else if (action === 'exit') {
          // Notify traversalControlDeck to switch back to flight
          var tcd = SBE.TraversalControlDeck;
          if (tcd && tcd.selectTransport) {
            tcd.selectTransport('flight');
          } else {
            self.exit();
          }
        }
      }
    });
    this._fxPanel.init();
    this._fxPanel.syncToState(this._effectState);
  };

  OrbitalModeController.prototype._applyPreset = function (name, syncPanel) {
    var reg = SBE.OrbitalPresetRegistry;
    if (!reg) return;

    // Fallback chain: requested → map_continuity_orbit → deep_space_listen → minimal_dark_sphere → static dark
    var resolved = name;
    var preset   = null;
    var fallbacks = [name, 'map_continuity_orbit', 'deep_space_listen', 'minimal_dark_sphere'];
    for (var fi = 0; fi < fallbacks.length; fi++) {
      try {
        var candidate = reg.PRESETS[fallbacks[fi]];
        if (candidate) { preset = candidate; resolved = fallbacks[fi]; break; }
      } catch (e) {}
    }
    if (!preset) {
      // Last resort: static dark background
      console.warn('[WOS Orbital] All preset fallbacks failed — using static dark background');
      this._effectState = Object.assign({}, this._effectState, {
        activePreset: 'static_dark', staticBackgroundEnabled: true,
        atmosphereIntensity: 0, bloomIntensity: 0, gridIntensity: 0
      });
      return;
    }

    var oes = SBE.OrbitalEffectState;
    if (oes) {
      this._effectState = oes.applyPartialState(this._effectState, Object.assign({}, preset, { activePreset: resolved }));
    } else {
      this._effectState = Object.assign({}, this._effectState, preset, { activePreset: resolved });
    }
    if (this._camRig) this._camRig.setMode(this._effectState.cameraMode);
    if (syncPanel && this._fxPanel) this._fxPanel.syncToState(this._effectState);
  };

  // ── rAF loop ──────────────────────────────────────────────────────────────────

  OrbitalModeController.prototype._startLoop = function () {
    var self = this;
    this._lastTs = performance.now();
    function loop(ts) {
      if (!self._active) return;
      var delta = Math.min(ts - self._lastTs, 100);
      self._lastTs = ts;
      self.update(delta);
      self._rafId = global.requestAnimationFrame(loop);
    }
    this._rafId = global.requestAnimationFrame(loop);
  };

  OrbitalModeController.prototype._stopLoop = function () {
    if (this._rafId) {
      global.cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  };

  // ── Public API ────────────────────────────────────────────────────────────────

  // ── enterFromMapContext — Mapbox-first entry (default submode: earth) ──────────
  //
  // Phase 1: OrbitalEarthMode keeps the live Mapbox globe visible, adds restrained
  // CSS overlays (atmosphere, scan ring, stars, origin marker). Three.js sphere is
  // NOT shown on default entry — only on abstract submodes (signal, visualizer, portal).

  OrbitalModeController.prototype.enterFromMapContext = function (context, submode) {
    if (this._active) return;

    this._mapContext = context || null;
    this._submode   = submode || 'earth';

    // Inject broadcast containment CSS immediately — before any submode branch.
    // _buildScene() is not called for earth submode, so CSS must be injected here
    // to guarantee transport-bar hiding, atmosphere-composite suppression, etc.
    this._injectOrbitalCSS();

    this._logger.info('enterFromMapContext submode=' + this._submode,
                      context ? context.centerLngLat : 'no context');

    // Capture style tokens before entering
    var tokens = null;
    try {
      if (SBE.WosMapStyleTokens) {
        var mvr = SBE.MapboxViewportRuntime;
        var map = mvr && (mvr.map || (mvr.getMap && mvr.getMap()));
        tokens = SBE.WosMapStyleTokens.capture(map);
      }
    } catch (e) {}

    // ── Earth submode (default) — Mapbox-first, no Three.js sphere ───────────
    //
    // OWNERSHIP: OrbitalEarthMode owns all rendering, overlay DOM, camera presets,
    // and the wos-orbital-earth-active body class.  This controller is a thin
    // shell caller in earth submode — it must not duplicate camera or overlay logic.
    //
    // Canonical entry route:
    //   OrbitalModeController (caller)
    //   → OrbitalEarthMode.enter()       (rendering, overlays, globe projection)
    //   → OrbitalEarthMode.applyCleanEarthBaseline()  (enforce clean default)
    //   → OrbitalEarthMode.setCameraPreset("readable_orbit")  (called from enter())
    //
    if (this._submode === 'earth') {
      var earthMode = SBE.OrbitalEarthMode;
      if (earthMode && earthMode.enter) {
        earthMode.enter(context, tokens);
        // Enforce Clean Earth baseline immediately after entry.
        // applyCleanEarthBaseline() is defensive: clears stuck filters, travel-state
        // body class, and transition veil. Safe to call here even if enter() already
        // applied the defaults — it only re-enforces the same values.
        if (earthMode.applyCleanEarthBaseline) {
          try { earthMode.applyCleanEarthBaseline(); } catch (e) {}
        }
      }

      this._active  = true;
      // wos-orbital-active signals OrbitalModeController is active (for Three.js HUD
      // adapter etc). The brightness(0.08) CSS rule is scoped to exclude
      // wos-orbital-earth-active, so this class does not dim the Mapbox globe.
      document.body.classList.add('wos-orbital-active');

      if (this._hudAdapter) {
        this._buildSubControllers(); // builds hudAdapter etc without starting rAF
        this._hudAdapter.notifyEntered(this._effectState);
      }

      this._logEntryDiagnostic(context, 'earth / OrbitalEarthMode (Mapbox-first)');
      return;
    }

    // ── Abstract submodes — Three.js sphere (signal / visualizer / portal) ───
    //
    // QUARANTINE GUARD (0627F): Only explicitly named legacy submodes may enter
    // this path. Unknown or unrecognized submodes fall back to Earth, not to the
    // Three.js visualizer. This prevents silent regression if a bad submode string
    // reaches enterFromMapContext().
    //
    var _KNOWN_LEGACY_SUBMODES = ['signal', 'visualizer', 'portal', 'signal_earth', 'archive'];
    if (_KNOWN_LEGACY_SUBMODES.indexOf(this._submode) === -1) {
      console.warn(
        '[WOS Orbital] LEGACY PATH BLOCKED — unrecognized submode: "' + this._submode + '"' +
        '\n  Falling back to earth (Mapbox-first). Pass an explicit legacy submode to enter Three.js path.'
      );
      this._submode = 'earth';
      this.enterFromMapContext(context, 'earth');
      return;
    }

    if (!_guard()) {
      this._logger.warn('THREE.js not available — falling back to earth submode');
      this._submode = 'earth';
      this.enterFromMapContext(context, 'earth');
      return;
    }

    // ── LEGACY VISUALIZER PATH — manual-only (0627F quarantine) ──────────────
    // Diagnostic: any entry here is intentional and non-default.
    console.warn(
      '[WOS Orbital] LEGACY VISUALIZER ENTERED',
      { submode: this._submode, preset: this._effectState.activePreset || 'map_continuity_orbit', manualOnly: true, defaultRoute: false }
    );

    this._buildScene();
    this._buildSubControllers();
    this._applyPreset('map_continuity_orbit', false);

    // Orient globe toward captured map center
    if (context && this._earth) {
      var omc = SBE.OrbitalMapContext;
      if (omc && omc.lngLatToGlobeRotation) {
        var rot = omc.lngLatToGlobeRotation(context.centerLngLat.lng, context.centerLngLat.lat);
        var bearingRad = (context.bearing || 0) * Math.PI / 180;
        this._earth.rotation.x = rot.rotX;
        this._earth.rotation.y = rot.rotY - bearingRad;
        if (this._grid) {
          this._grid.rotation.x = this._earth.rotation.x;
          this._grid.rotation.y = this._earth.rotation.y;
        }
      }
    }

    this._buildOriginMarker(context);
    this._startLoop();
    this._active = true;

    if (this._fxPanel) this._fxPanel.syncToState(this._effectState);
    if (this._hudAdapter) this._hudAdapter.notifyEntered(this._effectState);
    if (this._canvas) this._canvas.style.display = 'block';
    document.body.classList.add('wos-orbital-active');

    this._logEntryDiagnostic(context, 'three.js / ' + this._submode);
  };

  OrbitalModeController.prototype._buildOriginMarker = function (context) {
    if (!context || !this._scene) return;
    var THREE = global.THREE;
    if (!THREE) return;
    // Remove any previous marker
    if (this._originMarker) {
      this._scene.remove(this._originMarker);
      this._originMarker = null;
    }
    var omc = SBE.OrbitalMapContext;
    if (!omc) return;
    var rot = omc.lngLatToGlobeRotation(context.centerLngLat.lng, context.centerLngLat.lat);
    // Position on sphere surface at rot angles
    var r = 1.015;
    var x = r * Math.cos(rot.rotX) * Math.sin(-rot.rotY);
    var y = r * Math.sin(rot.rotX);
    var z = r * Math.cos(rot.rotX) * Math.cos(-rot.rotY);
    var geo = new THREE.SphereGeometry(0.012, 8, 8);
    var mat = new THREE.MeshBasicMaterial({
      color:       0x28d4c8,
      transparent: true,
      opacity:     0.75,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending
    });
    var marker = new THREE.Mesh(geo, mat);
    marker.position.set(x, y, z);
    this._originMarker = marker;
    // Marker rotates with earth
    if (this._earth) this._earth.add(marker);
  };

  OrbitalModeController.prototype._logEntryDiagnostic = function (context, renderer) {
    var preset    = this._effectState.activePreset || 'map_continuity_orbit';
    var anchor    = context ? (context.centerLngLat.lng.toFixed(4) + ', ' + context.centerLngLat.lat.toFixed(4)) : 'default';
    var from      = (context && context.fromLabel) || 'Current location';
    var to        = (context && context.toLabel)   || null;
    var fallback  = (preset !== 'map_continuity_orbit') ? preset : 'none';
    console.info(
      '[WOS Orbital] ENTRY: ' + preset + '\n' +
      '  RENDERER: ' + (renderer || this._submode || 'unknown') + '\n' +
      '  ANCHOR: ' + anchor + '\n' +
      '  FROM: ' + from +
      (to ? ('\n  TO: ' + to) : '') + '\n' +
      '  SOURCE: WOS map context\n' +
      '  FALLBACK: ' + fallback
    );
  };

  // Called by traversalControlDeck when transport mode changes
  OrbitalModeController.prototype.onTransportSelected = function (id) {
    var tc = SBE.WosModeTransitionController;
    if (id === 'orbital' && !this._active) {
      if (tc && tc.transitionToOrbital) tc.transitionToOrbital();
      else this.enter();
    } else if (id !== 'orbital' && this._active) {
      if (tc && tc.transitionToMap) tc.transitionToMap();
      else this.exit();
    }
  };

  // ── Legacy path diagnostic (0627F) ───────────────────────────────────────────

  OrbitalModeController.prototype.getLegacyPathReport = function () {
    var report = {
      defaultSubmode:               'earth',
      earthBypassesLegacyScene:     true,
      legacyManualOnly:             true,
      legacyCssScopedAwayFromEarth: true,  // brightness(0.08) uses :not(.wos-orbital-earth-active)
      earthFallbackUsesFakeSphere:  false,
      legacyPresets:                ['portal_orb', 'deep_space_listen', 'minimal_dark_sphere', 'signal_earth', 'particle_planet', 'archive_orb'],
      knownLegacySubmodes:          ['signal', 'visualizer', 'portal', 'signal_earth', 'archive'],
      defaultRouteCallsBuildScene:  false,
      defaultRouteCallsApplyPreset: false,
      unknownSubmodeAction:         'blocked — falls back to earth, logs LEGACY PATH BLOCKED',
      bareEnterAction:              'logs LEGACY VISUALIZER ENTERED, activates Three.js scene directly',
      currentSubmode:               this._submode || 'none',
      currentlyActive:              this._active
    };
    console.info('[WOS Orbital] LEGACY PATH REPORT', report);
    return report;
  };

  // Auto-instantiate as singleton
  SBE.OrbitalMode = new OrbitalModeController();

  // SBE.OrbitalModeController is the singleton instance (same reference as SBE.OrbitalMode).
  // Callers can use either name. SBE.OrbitalMode is used by WosModeTransitionController internally.
  SBE.OrbitalModeController = SBE.OrbitalMode;

})(window);
