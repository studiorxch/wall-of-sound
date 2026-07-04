(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalEarthMode — Mapbox-first Orbital Earth continuity mode ─────────────
  //
  // This is the default submode for Orbital entry.
  // It keeps the live Mapbox globe visible and applies style-derived CSS overlays.
  // The Three.js sphere is NOT used in this mode.
  //
  // Object roles (per OrbitalOverlayRoles):
  //   earth_mapbox_globe    — the Mapbox canvas (always present)
  //   atmosphere_overlay    — #orb-atmosphere CSS div
  //   scan_ring             — #orb-scan-ring CSS div
  //   star_particle         — #orb-stars CSS div
  //   origin_marker         — #orb-origin CSS div (map-center indicator)
  //
  // Audio overlay signals drive opacity/scale on these elements.

  var _CSS_ID       = 'orb-earth-css';
  var _ATM_ID       = 'orb-atmosphere';
  var _SCAN_ID      = 'orb-scan-ring';
  var _STARS_ID     = 'orb-stars';
  var _ORIGIN_ID    = 'orb-origin';
  var _GLOBE_CLASS  = 'wos-orbital-earth-active';

  // Orbital-only style — satellite imagery reads immediately as Planet Earth.
  // Swapped in on entry, WOS style restored on exit.
  var _ORBITAL_STYLE = 'mapbox://styles/mapbox/satellite-v9';

  function OrbitalEarthMode() {
    this._active         = false;
    this._map            = null;
    this._tokens         = null;
    this._context        = null;
    this._audioCtrl      = null;
    this._prevProjection = null;
    this._scanTimeout    = null;
    this._cameraPreset   = null;
    this._savedMapCamera = null;
    this._savedStyle     = null;   // full style JSON saved before orbital style swap
    this._fitRetryCount  = 0;
  }

  // ── enter ─────────────────────────────────────────────────────────────────────

  OrbitalEarthMode.prototype.enter = function (context, tokens) {
    if (this._active) return;
    this._context = context || null;
    this._tokens  = tokens  || (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.getTokens() : null);

    // Resolve live map
    var mvr = SBE.MapboxViewportRuntime;
    this._map = mvr && (mvr.map || (mvr.getMap && mvr.getMap())) || null;

    // Save pre-orbital map camera state and style before any changes
    this.saveMapCameraState(this._map);
    this._savedStyle = null;
    try {
      if (this._map && this._map.getStyle) {
        this._savedStyle = this._map.getStyle();
      }
    } catch (e) {}

    try {
      this._injectCSS();
      this._buildOverlays();
      this._applyTokens();
      this._buildAudioOverlay();
    } catch (e) {
      console.error('[WOS Orbital] ENTRY SETUP FAILED — aborting orbital entry:', e);
      return;
    }

    document.body.classList.add(_GLOBE_CLASS);
    this._active = true;

    // After satellite style loads: set globe projection, baseline, camera.
    // Must be deferred into style.load because setStyle() resets projection.
    var self = this;
    function _onOrbitalStyleReady() {
      // Remove Mapbox native fog/atmosphere — satellite-v9 sets a brownish limb fog
      // in globe projection that creates the bowl ring. Clear it for a clean space look.
      try { if (self._map.setFog) self._map.setFog(null); } catch (e) {}
      self._switchToGlobe();
      self.applyCleanEarthBaseline();
      self._positionOriginMarker();
      self.setCameraPreset('readable_orbit');
      console.info('[WOS Orbital] ORBITAL STYLE READY — satellite active, fog cleared, globe set');
    }

    if (this._map && this._map.setStyle) {
      try {
        this._map.once('style.load', _onOrbitalStyleReady);
        this._map.setStyle(_ORBITAL_STYLE);
        console.info('[WOS Orbital] STYLE SWAP → ' + _ORBITAL_STYLE);
      } catch (e) {
        // If setStyle throws, fall through synchronously with current style
        try { this._map.off('style.load', _onOrbitalStyleReady); } catch (e2) {}
        _onOrbitalStyleReady();
        console.warn('[WOS Orbital] STYLE SWAP FAILED — using current style:', e);
      }
    } else {
      _onOrbitalStyleReady();
    }

    // [WOS Orbital] ENTER EARTH diagnostic
    var t = this._tokens || {};
    console.info(
      '[WOS Orbital] ENTER EARTH\n' +
      '  SUBMODE: earth (satellite-globe)\n' +
      '  ANCHOR: ' + (this._context
        ? (this._context.centerLngLat.lng.toFixed(4) + ', ' + this._context.centerLngLat.lat.toFixed(4))
        : 'default') + '\n' +
      '[WOS Orbital] STYLE TOKENS\n' +
      '  SOURCE: ' + (t.styleId || 'wos-default') + '\n' +
      '  accent: ' + (t.accentColor || '—') + '  line: ' + (t.lineColor || '—') + '\n' +
      '[WOS Orbital] OVERLAY MODE\n' +
      '  audio: off (restrained default)\n' +
      '  objects: atmosphere_overlay, scan_ring, star_particle, origin_marker'
    );
  };

  // ── exit ──────────────────────────────────────────────────────────────────────

  OrbitalEarthMode.prototype.exit = function () {
    if (!this._active) return;
    this._active = false;

    document.body.classList.remove(_GLOBE_CLASS);

    // Restore saved WOS map style (replaces _restoreProjection — setStyle resets projection)
    if (this._map && this._savedStyle && this._map.setStyle) {
      try {
        this._map.setStyle(this._savedStyle);
        console.info('[WOS Orbital] STYLE RESTORE → ' + (this._savedStyle.name || 'saved WOS style'));
      } catch (e) {
        console.warn('[WOS Orbital] STYLE RESTORE FAILED:', e);
        this._restoreProjection();  // fallback: at least restore mercator
      }
    } else {
      this._restoreProjection();
    }
    this._savedStyle = null;

    this._hideOverlays();

    if (this._audioCtrl) { this._audioCtrl.dispose(); this._audioCtrl = null; }
    if (this._scanTimeout) { global.clearTimeout(this._scanTimeout); this._scanTimeout = null; }
    this._cameraPreset  = null;
    this._fitRetryCount = 0;

    console.info('[WOS Orbital] EXIT EARTH\n  WOS style restored, overlays hidden, audio ctrl disposed');
  };

  OrbitalEarthMode.prototype.isActive = function () { return this._active; };

  // ── style tokens ──────────────────────────────────────────────────────────────

  OrbitalEarthMode.prototype.updateTokens = function (tokens) {
    this._tokens = tokens;
    if (this._active) this._applyTokens();
  };

  // ── audio overlay mode ────────────────────────────────────────────────────────

  OrbitalEarthMode.prototype.setAudioMode = function (mode, intensity) {
    if (!this._active) {
      console.warn('[WOS Orbital] BLOCKED — setAudioMode called while OrbitalEarthMode inactive');
      return;
    }
    if (this._audioCtrl) {
      this._audioCtrl.setMode(mode || 'off');
      if (intensity) this._audioCtrl.setIntensity(intensity);
      console.info('[WOS Orbital] OVERLAY MODE audio=' + (mode || 'off') + (intensity ? ' intensity=' + intensity : ''));
    }
  };

  // ── trigger scan ring (track transition, route activation) ───────────────────

  OrbitalEarthMode.prototype.triggerScanRing = function () {
    var ring = document.getElementById(_SCAN_ID);
    if (!ring) return;
    ring.style.transition  = 'opacity 200ms ease-in, transform 600ms ease-out';
    ring.style.opacity     = '0.7';
    ring.style.transform   = 'scale(1.0)';
    var self = this;
    if (self._scanTimeout) global.clearTimeout(self._scanTimeout);
    self._scanTimeout = global.setTimeout(function () {
      ring.style.transition = 'opacity 800ms ease-out, transform 800ms ease-out';
      ring.style.opacity    = '0';
      ring.style.transform  = 'scale(1.12)';
    }, 400);
  };

  // ── private ───────────────────────────────────────────────────────────────────

  OrbitalEarthMode.prototype._injectCSS = function () {
    if (document.getElementById(_CSS_ID)) return;
    var s = document.createElement('style');
    s.id = _CSS_ID;
    s.textContent = [
      // Body class dims nav / secondary UI — map stays fully visible
      'body.' + _GLOBE_CLASS + ' #wos-nav { opacity: 0.5; transition: opacity 600ms; }',
      'body.' + _GLOBE_CLASS + ' .mapboxgl-ctrl-top-left,',
      'body.' + _GLOBE_CLASS + ' .mapboxgl-ctrl-bottom-left,',
      'body.' + _GLOBE_CLASS + ' .mapboxgl-ctrl-bottom-right { opacity: 0.2; transition: opacity 600ms; }',
      // Atmosphere overlay — pure rim glow only, no haze, no vignette (role: atmosphere_overlay)
      '#' + _ATM_ID + ' {',
      '  position: fixed; inset: 0; pointer-events: none; z-index: 150;',
      '  background: radial-gradient(ellipse at 50% 50%,',
      '    rgba(0,0,0,0) 60%,',
      '    var(--orb-accent, #00d7ff) var(--orb-rim-radius, 84%),',
      '    rgba(0,0,0,0) 100%);',
      '  opacity: 0; transition: opacity 800ms ease-in-out;',
      '}',
      // Scan ring (role: scan_ring)
      '#' + _SCAN_ID + ' {',
      '  position: fixed; inset: 10%; pointer-events: none; z-index: 151;',
      '  border-radius: 50%;',
      '  border: 1px solid var(--orb-accent, #00d7ff);',
      '  opacity: 0; transform: scale(0.92);',
      '  box-shadow: 0 0 12px 2px var(--orb-accent, #00d7ff);',
      '}',
      // Star/signal sparkle (role: star_particle)
      '#' + _STARS_ID + ' {',
      '  position: fixed; inset: 0; pointer-events: none; z-index: 149;',
      '  background-image: radial-gradient(1px 1px at 15% 20%, var(--orb-hud, #d8f7ff) 1px, transparent 0),',
      '    radial-gradient(1px 1px at 73% 8%, var(--orb-hud, #d8f7ff) 1px, transparent 0),',
      '    radial-gradient(1px 1px at 38% 85%, var(--orb-hud, #d8f7ff) 1px, transparent 0),',
      '    radial-gradient(1px 1px at 88% 45%, var(--orb-hud, #d8f7ff) 1px, transparent 0),',
      '    radial-gradient(1px 1px at 55% 60%, var(--orb-hud, #d8f7ff) 1px, transparent 0),',
      '    radial-gradient(1px 1px at 5%  70%, var(--orb-hud, #d8f7ff) 1px, transparent 0),',
      '    radial-gradient(1px 1px at 92% 82%, var(--orb-hud, #d8f7ff) 1px, transparent 0),',
      '    radial-gradient(1px 1px at 29% 40%, var(--orb-hud, #d8f7ff) 1px, transparent 0);',
      '  opacity: 0; transition: opacity 1200ms ease-in-out;',
      '}',
      // Origin marker (role: origin_marker) — ring reticle, not a sphere
      '#' + _ORIGIN_ID + ' {',
      '  position: fixed; width: 9px; height: 9px; border-radius: 50%;',
      '  background: transparent;',
      '  border: 1.5px solid var(--orb-accent, #00d7ff);',
      '  box-shadow: 0 0 5px 1px var(--orb-accent, #00d7ff);',
      '  pointer-events: none; z-index: 152;',
      '  transform: translate(-50%, -50%);',
      '  opacity: 0; transition: opacity 600ms;',
      '}'
    ].join('\n');
    document.head.appendChild(s);
  };

  OrbitalEarthMode.prototype._buildOverlays = function () {
    function _ensure(id, tag) {
      if (!document.getElementById(id)) {
        var el = document.createElement(tag || 'div');
        el.id = id;
        document.body.appendChild(el);
      }
      return document.getElementById(id);
    }
    _ensure(_ATM_ID);
    _ensure(_SCAN_ID);
    _ensure(_STARS_ID);
    _ensure(_ORIGIN_ID);

    // Initialize overlays to 0 — applyCleanEarthBaseline() sets final values after style loads
    var atm   = document.getElementById(_ATM_ID);
    var stars = document.getElementById(_STARS_ID);
    if (atm)   atm.style.opacity   = '0';
    if (stars) stars.style.opacity = '0';
  };

  OrbitalEarthMode.prototype._hideOverlays = function () {
    [_ATM_ID, _SCAN_ID, _STARS_ID, _ORIGIN_ID].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.style.opacity = '0';
    });
    // After fade, reset origin marker position
    var origin = document.getElementById(_ORIGIN_ID);
    global.setTimeout(function () {
      if (origin) { origin.style.left = ''; origin.style.top = ''; }
    }, 800);
  };

  OrbitalEarthMode.prototype._applyTokens = function () {
    var tokens = this._tokens;
    if (!tokens) return;
    // Inject CSS vars onto :root so overlay CSS picks them up
    var existing = document.getElementById('orb-style-tokens');
    var s = existing || document.createElement('style');
    s.id = 'orb-style-tokens';
    s.textContent = ':root { ' + (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.toCssVars(tokens) : '') + ' }';
    if (!existing) document.head.appendChild(s);
  };

  OrbitalEarthMode.prototype._switchToGlobe = function () {
    if (!this._map) return;
    try {
      // Mapbox GL JS v3 supports globe projection for real Earth curvature
      if (this._map.getProjection) {
        this._prevProjection = this._map.getProjection();
      }
      if (this._map.setProjection) {
        this._map.setProjection('globe');
      }
    } catch (e) {}
  };

  OrbitalEarthMode.prototype._restoreProjection = function () {
    if (!this._map) return;
    try {
      if (this._map.setProjection && this._prevProjection) {
        this._map.setProjection(this._prevProjection);
      } else if (this._map.setProjection) {
        this._map.setProjection('mercator');
      }
    } catch (e) {}
  };

  OrbitalEarthMode.prototype._positionOriginMarker = function () {
    var ctx = this._context;
    var origin = document.getElementById(_ORIGIN_ID);
    if (!origin || !ctx || !this._map) return;
    try {
      // Project the captured map center to screen coordinates
      var pt = this._map.project([ctx.centerLngLat.lng, ctx.centerLngLat.lat]);
      var t = this._tokens || {};
      origin.style.left    = Math.round(pt.x) + 'px';
      origin.style.top     = Math.round(pt.y) + 'px';
      origin.style.opacity = String(t.orbitalOriginOpacity !== undefined ? t.orbitalOriginOpacity : 0.72);
    } catch (e) {}
  };

  OrbitalEarthMode.prototype._buildAudioOverlay = function () {
    var self = this;
    this._audioCtrl = new (SBE.OrbitalAudioOverlayController)({
      onSignal: function (signals) { self._applyAudioSignals(signals); }
    });
    // Default: off. User can switch to 'manual' or 'reactive' via FX panel.
    this._audioCtrl.setMode('off');
    this._audioCtrl.setIntensity('low');
  };

  OrbitalEarthMode.prototype._applyAudioSignals = function (signals) {
    if (!this._active) return;
    // When audio mode is off, overlays stay at token defaults — no reactive driving
    if (!this._audioCtrl || this._audioCtrl._mode === 'off') return;
    var atm   = document.getElementById(_ATM_ID);
    var stars = document.getElementById(_STARS_ID);

    var tok = this._tokens || {};

    // Bass → atmosphere rim pulse (low amplitude)
    if (atm) {
      var baseAtm  = tok.orbitalAtmosphereOpacity !== undefined ? tok.orbitalAtmosphereOpacity : 0.18;
      var atmBoost = (signals.bass || 0) * 0.10;
      atm.style.opacity = String(Math.min(0.42, baseAtm + atmBoost));
    }

    // Highs → star sparkle only when stars are already enabled (orbitalStarOpacity > 0)
    var baseStars = tok.orbitalStarOpacity !== undefined ? tok.orbitalStarOpacity : 0;
    if (stars && baseStars > 0) {
      var starBoost = (signals.highs || 0) * 0.22;
      stars.style.opacity = String(Math.min(0.72, baseStars + starBoost));
    }

    // Track transitions → scan ring
    if (signals.transition) {
      this.triggerScanRing();
    }
  };

  // ── Camera presets ────────────────────────────────────────────────────────────

  var _CAMERA_PRESETS = {
    readable_orbit: {
      id: 'readable_orbit', label: 'Readable Orbit',
      zoom: 1.0,  pitch: 0, bearing: 0,
      padding:          { top: 80,  right: 80,  bottom: 150, left: 80  },
      durationMs:       1100,
      fullGlobeRequired: true,
      manualOnly:       false
    },
    broadcast_orbit: {
      id: 'broadcast_orbit', label: 'Broadcast Orbit',
      zoom: 0.8,  pitch: 0, bearing: 0,
      padding:          { top: 100, right: 120, bottom: 180, left: 120 },
      durationMs:       1000,
      fullGlobeRequired: true,
      manualOnly:       false
    },
    deep_orbit: {
      id: 'deep_orbit', label: 'Deep Orbit',
      zoom: 0.45, pitch: 0, bearing: 0,
      padding:          { top: 80,  right: 80,  bottom: 150, left: 80  },
      durationMs:       1200,
      fullGlobeRequired: true,
      manualOnly:       false
    },
    cinematic_crop: {
      id: 'cinematic_crop', label: 'Cinematic Crop',
      zoom: 1.35, pitch: 0, bearing: 0,
      padding:          { top: 40,  right: 40,  bottom: 120, left: 40  },
      durationMs:       900,
      fullGlobeRequired: false,
      manualOnly:       true
    }
  };

  // Globe zoom threshold — at or below this zoom, globe fits in most viewports
  var _GLOBE_FIT_MAX_ZOOM = 1.4;

  OrbitalEarthMode.prototype.saveMapCameraState = function (map) {
    var m = map || this._map;
    // Prefer OrbitalMapContext captured state (saved before any visual change)
    var ctx = SBE.OrbitalMapContext ? SBE.OrbitalMapContext.getLastContext() : null;
    if (ctx && ctx.zoom !== undefined) {
      this._savedMapCamera = {
        center:     [ctx.centerLngLat.lng, ctx.centerLngLat.lat],
        zoom:       ctx.zoom,
        bearing:    ctx.bearing,
        pitch:      ctx.pitch,
        projection: ctx.projection || null,
        timestamp:  ctx.timestamp  || null
      };
    } else if (m) {
      try {
        var proj = null;
        try { proj = m.getProjection ? m.getProjection() : null; } catch (e2) {}
        this._savedMapCamera = {
          center:     [m.getCenter().lng, m.getCenter().lat],
          zoom:       m.getZoom(),
          bearing:    m.getBearing(),
          pitch:      m.getPitch(),
          projection: proj,
          timestamp:  null
        };
      } catch (e) {
        console.warn('[WOS Orbital] CAMERA SAVE FAILED — could not read map state');
      }
    }
    console.info('[WOS Orbital] CAMERA SAVE\n  center: ' + (this._savedMapCamera ? JSON.stringify(this._savedMapCamera.center) : 'none'));
  };

  OrbitalEarthMode.prototype.restoreMapCameraState = function (map) {
    var m = map || this._map;
    var s = this._savedMapCamera;
    if (!m || !s) {
      console.warn('[WOS Orbital] CAMERA RESTORE FAILED — no saved state');
      return;
    }
    try {
      m.easeTo({ center: s.center, zoom: s.zoom, bearing: s.bearing, pitch: s.pitch, duration: 800 });
      // Restore projection if it was saved and differs from current
      if (s.projection && m.setProjection) {
        try { m.setProjection(s.projection); } catch (e2) {}
      }
      console.info('[WOS Orbital] CAMERA RESTORE\n  zoom: ' + s.zoom.toFixed(2) + '  center: ' + JSON.stringify(s.center));
    } catch (e) {
      console.warn('[WOS Orbital] CAMERA RESTORE FAILED — easeTo error: ' + e);
    }
  };

  OrbitalEarthMode.prototype.setCameraPreset = function (presetId, opts) {
    var p = _CAMERA_PRESETS[presetId];
    if (!p) { console.warn('[WOS Orbital] Unknown camera preset: ' + presetId); return; }
    var map = this._map;
    if (!map || !map.easeTo) return;

    this._cameraPreset  = presetId;
    this._fitRetryCount = 0;
    var duration = (opts && opts.durationMs) || p.durationMs;

    try {
      map.easeTo({ zoom: p.zoom, pitch: p.pitch, bearing: p.bearing, padding: p.padding, duration: duration });
      console.info(
        '[WOS Orbital] CAMERA PRESET\n' +
        '  preset: '  + presetId + '\n' +
        '  zoom: '    + p.zoom + '  pitch: ' + p.pitch + '  bearing: ' + p.bearing
      );
    } catch (e) {}

    // Schedule globe-fit verification after animation completes
    if (p.fullGlobeRequired) {
      var self = this;
      global.setTimeout(function () {
        self.fitGlobeToViewport(presetId, 0);
      }, duration + 300);
    }
  };

  OrbitalEarthMode.prototype.getCameraPreset = function () {
    return this._cameraPreset;
  };

  OrbitalEarthMode.prototype.fitGlobeToViewport = function (presetId, retryCount) {
    retryCount = retryCount || 0;
    this._fitRetryCount = retryCount;
    var map = this._map;
    if (!map) return;

    var report = this.getGlobeFitReport();
    if (report.globeFitPassed) {
      console.info(
        '[WOS Orbital] GLOBE FIT\n' +
        '  preset: '  + (presetId || this._cameraPreset) + '\n' +
        '  zoom: '    + report.zoom.toFixed(3) + '\n' +
        '  passed: true  retries: ' + retryCount
      );
      return;
    }

    if (retryCount >= 2) {
      console.warn(
        '[WOS Orbital] GLOBE FIT FAILED\n' +
        '  preset: '   + (presetId || this._cameraPreset) + '\n' +
        '  zoom: '     + report.zoom.toFixed(3) + '\n' +
        '  retries: '  + retryCount + '\n' +
        '  safeViewport: ' + JSON.stringify(report.safeViewport)
      );
      return;
    }

    // Retry: small reduction only — avoid over-shrinking the globe
    var currentZoom = map.getZoom ? map.getZoom() : 1.0;
    var nextZoom = Math.max(0, currentZoom - 0.10);
    try {
      map.easeTo({ zoom: nextZoom, duration: 600 });
      console.info('[WOS Orbital] GLOBE FIT RETRY\n  attempt: ' + (retryCount + 1) + '  zoom → ' + nextZoom.toFixed(2));
    } catch (e) {}

    var self = this;
    global.setTimeout(function () {
      self.fitGlobeToViewport(presetId, retryCount + 1);
    }, 700);
  };

  OrbitalEarthMode.prototype.getGlobeFitReport = function () {
    var map = this._map;
    var zoom    = map && map.getZoom    ? map.getZoom()    : null;
    var pitch   = map && map.getPitch   ? map.getPitch()   : 0;
    var bearing = map && map.getBearing ? map.getBearing() : 0;
    var center  = map && map.getCenter  ? map.getCenter()  : null;

    var projection = null;
    try { projection = map && map.getProjection ? map.getProjection() : null; } catch (e) {}
    var projName = projection ? (projection.name || projection.type || String(projection)) : null;

    var vw = global.innerWidth  || 1280;
    var vh = global.innerHeight || 800;

    // Safe viewport excludes HUD-safe padding of active readable_orbit preset
    var preset = _CAMERA_PRESETS[this._cameraPreset] || _CAMERA_PRESETS['readable_orbit'];
    var pad = preset.padding || { top: 80, right: 80, bottom: 150, left: 80 };
    var safeH = Math.max(0, vh - pad.top - pad.bottom);
    var safeW = Math.max(0, vw - pad.left - pad.right);

    // Estimated globe pixel diameter: at zoom 0 globe spans ~512px, doubles per zoom level
    // This is a documented approximation — actual size depends on Mapbox tile size and DPR
    var estimated = true;
    var estimatedGlobePx = zoom !== null ? (512 * Math.pow(2, zoom)) : null;
    var estimatedGlobeSize = estimatedGlobePx !== null
      ? { diameter: Math.round(estimatedGlobePx), estimated: estimated }
      : { diameter: null, estimated: estimated };

    // Fit checks
    var globeFitPassed      = zoom !== null && zoom <= _GLOBE_FIT_MAX_ZOOM;
    // Too small: estimated diameter covers < 40% of safe viewport height
    var globeTooSmall       = estimatedGlobePx !== null && safeH > 0 && (estimatedGlobePx / safeH) < 0.40;
    // Possibly cropped: zoom above threshold where globe overflows safe area
    var globePossiblyCropped = zoom !== null && zoom > _GLOBE_FIT_MAX_ZOOM;

    var recommendedAdjustment = null;
    if (globeTooSmall && !globePossiblyCropped) {
      recommendedAdjustment = 'Increase zoom toward 1.0 — Earth is too small for the safe viewport.';
    } else if (globePossiblyCropped) {
      recommendedAdjustment = 'Reduce zoom to ' + _GLOBE_FIT_MAX_ZOOM + ' or below to prevent globe clipping.';
    } else if (!globeFitPassed) {
      recommendedAdjustment = 'Apply setCameraPreset("readable_orbit") to restore default framing.';
    }

    return {
      preset:               this._cameraPreset || 'none',
      zoom:                 zoom !== null ? +zoom.toFixed(3) : null,
      pitch:                +pitch.toFixed(1),
      bearing:              +bearing.toFixed(1),
      center:               center ? { lng: +center.lng.toFixed(4), lat: +center.lat.toFixed(4) } : null,
      projection:           projName,
      viewportSize:         { w: vw, h: vh },
      safeViewport:         { w: safeW, h: safeH },
      estimatedGlobeSize:   estimatedGlobeSize,
      globeFitPassed:       globeFitPassed,
      globeTooSmall:        globeTooSmall,
      globePossiblyCropped: globePossiblyCropped,
      retryCount:           this._fitRetryCount,
      savedCameraStateExists: !!this._savedMapCamera,
      recommendedAdjustment: recommendedAdjustment
    };
  };

  // ── Visual readability presets ────────────────────────────────────────────────

  var _VISUAL_PRESETS = {
    readable_orbit: {
      orbitalSurfaceBrightness: 0.52,
      orbitalAtmosphereOpacity: 0.20,
      orbitalRimOpacity:        0.38,
      orbitalRimRadius:         76,
      orbitalStarOpacity:       0.32,
      orbitalHazeOpacity:       0.08,
      orbitalOriginOpacity:     0.78
    },
    deep_orbit: {
      orbitalSurfaceBrightness: 0.38,
      orbitalAtmosphereOpacity: 0.28,
      orbitalRimOpacity:        0.42,
      orbitalRimRadius:         72,
      orbitalStarOpacity:       0.38,
      orbitalHazeOpacity:       0.15,
      orbitalOriginOpacity:     0.65
    },
    broadcast_orbit: {
      orbitalSurfaceBrightness: 0.55,
      orbitalAtmosphereOpacity: 0.22,
      orbitalRimOpacity:        0.45,
      orbitalRimRadius:         80,
      orbitalStarOpacity:       0.30,
      orbitalHazeOpacity:       0.06,
      orbitalOriginOpacity:     0.85
    },
    minimal_orbit: {
      orbitalSurfaceBrightness: 0.45,
      orbitalAtmosphereOpacity: 0.10,
      orbitalRimOpacity:        0.15,
      orbitalRimRadius:         84,
      orbitalStarOpacity:       0.15,
      orbitalHazeOpacity:       0.04,
      orbitalOriginOpacity:     0.55
    }
  };

  OrbitalEarthMode.prototype.setVisualPreset = function (name) {
    var p = _VISUAL_PRESETS[name];
    if (!p) { console.warn('[WOS Orbital] Unknown visual preset: ' + name); return; }
    var base = this._tokens || (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.getTokens() : {});
    this._tokens = Object.assign({}, base, p);
    this._applyTokens();
    this._applyReadabilityToOverlays(this._tokens);
    console.info('[WOS Orbital] VISUAL PRESET ' + name.toUpperCase().replace(/_/g, ' '));
  };

  OrbitalEarthMode.prototype.setReadabilityToken = function (key, value) {
    if (!this._active) return;
    var updated = Object.assign({}, this._tokens || {});
    updated[key] = value;
    this._tokens = updated;
    this._applyTokens();
    this._applyReadabilityToOverlays(updated);
  };

  OrbitalEarthMode.prototype._applyReadabilityToOverlays = function (tokens) {
    var t = tokens || this._tokens || {};
    var atm    = document.getElementById(_ATM_ID);
    var stars  = document.getElementById(_STARS_ID);
    var origin = document.getElementById(_ORIGIN_ID);
    var mapEl  = document.querySelector('.mapboxgl-map, #mapbox-viewport');

    if (atm && this._active) {
      atm.style.opacity = String(t.orbitalAtmosphereOpacity !== undefined ? t.orbitalAtmosphereOpacity : 0.18);
    }
    if (stars && this._active) {
      stars.style.opacity = String(t.orbitalStarOpacity !== undefined ? t.orbitalStarOpacity : 0.28);
    }
    if (origin && this._active) {
      origin.style.opacity = String(t.orbitalOriginOpacity !== undefined ? t.orbitalOriginOpacity : 0.72);
    }
    if (mapEl && this._active) {
      if (document.body.classList.contains(_GLOBE_CLASS)) {
        // Earth submode: satellite map IS the surface — no brightness reduction.
        // Clear any filter left from a prior submode or stuck transition.
        mapEl.style.transition = '';
        mapEl.style.filter = '';
      } else {
        var b = t.orbitalSurfaceBrightness !== undefined ? t.orbitalSurfaceBrightness : 0.45;
        // 0.35 → brightness(0.65), 0.45 → brightness(0.75), 0.55 → brightness(0.85)
        mapEl.style.transition = 'filter 400ms ease-in-out';
        mapEl.style.filter = 'brightness(' + (b + 0.30).toFixed(2) + ')';
      }
    }
  };

  // ── Ownership report ──────────────────────────────────────────────────────────

  OrbitalEarthMode.prototype.getOwnershipReport = function () {
    return Object.freeze({
      runtimeModeOwner:        'WosRuntimeModeState.js',
      transitionOwner:         'WosModeTransitionController.js',
      orbitalEarthOwner:       'OrbitalEarthMode.js',
      cameraOwner:             'OrbitalEarthMode.js',
      mapContextOwner:         'OrbitalMapContext.js',
      styleTokenOwner:         'WosMapStyleTokens.js',
      audioOverlayOwner:       'OrbitalAudioOverlayController.js',
      fxPanelOwner:            'OrbitalFxPanel.js (caller only)',
      transportOwner:          'traversalControlDeck.js',
      presentationOwner:       'WosPresentationRouter.js (dormant)',
      moonOwner:               'MoonModeController.js (gated: OrbitalEarthMode.isActive())',
      legacyVisualizerOwner:   'OrbitalModeController.js (manual-only / quarantine candidate)',
      notes: [
        'OrbitalModeController is a shell caller in earth submode — it does not own camera or overlays.',
        'wos-orbital-earth-active is owned by OrbitalEarthMode (via _GLOBE_CLASS).',
        'wos-orbital-active is added by OrbitalModeController but brightness CSS is scoped to :not(.wos-orbital-earth-active).',
        'cinematic_crop is manual-only and must never be set as default.',
        'WosPresentationRouter is installed but dormant — no current UI calls it.',
        'Moon gate: MoonModeController must check OrbitalEarthMode.isActive() before entering.'
      ]
    });
  };

  // ── Clean Earth baseline ──────────────────────────────────────────────────────

  var _CLEAN_EARTH_TOKENS = {
    orbitalStarOpacity:       0,
    orbitalHazeOpacity:       0,
    orbitalAtmosphereOpacity: 0,    // ring overlay must be off — satellite globe has its own limb
    orbitalRimOpacity:        0,    // rim gradient off — creates bowl depression on satellite
    orbitalRimRadius:         84,
    orbitalOriginOpacity:     0.55,
    orbitalSurfaceBrightness: 0.45
  };

  OrbitalEarthMode.prototype.applyCleanEarthBaseline = function () {
    var self = this;

    // 1. Merge clean-earth overrides over current tokens
    var base = {};
    var existing = this._tokens || (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.getTokens() : {});
    for (var k in existing) { if (Object.prototype.hasOwnProperty.call(existing, k)) base[k] = existing[k]; }
    for (var k2 in _CLEAN_EARTH_TOKENS) { if (Object.prototype.hasOwnProperty.call(_CLEAN_EARTH_TOKENS, k2)) base[k2] = _CLEAN_EARTH_TOKENS[k2]; }
    this._tokens = base;
    this._applyTokens();

    // 2. Force overlay opacities
    var elAtm    = document.getElementById(_ATM_ID);
    var elStars  = document.getElementById(_STARS_ID);
    var elScan   = document.getElementById(_SCAN_ID);
    var elOrigin = document.getElementById(_ORIGIN_ID);
    if (elAtm)    elAtm.style.opacity    = String(base.orbitalAtmosphereOpacity);
    if (elStars)  elStars.style.opacity  = '0';
    if (elScan)   elScan.style.opacity   = '0';
    if (elOrigin) elOrigin.style.opacity = String(base.orbitalOriginOpacity);

    // 3. Clear any stuck transition overlay
    var transEl = document.getElementById('wos-transition-overlay') ||
                  document.getElementById('wos-mode-transition-overlay');
    if (transEl) {
      transEl.style.opacity = '0';
      transEl.style.display = 'none';
    }

    // 4. Remove travel-state body class if stuck
    document.body.classList.remove('wos-travel-state');

    // 5. Clear destructive filters on map container/canvas
    var mapContainer = document.querySelector('.mapboxgl-map') || document.getElementById('map');
    var mapCanvas    = document.querySelector('.mapboxgl-canvas');
    if (mapContainer) {
      mapContainer.style.opacity = '';
      mapContainer.style.filter  = '';
    }
    if (mapCanvas) {
      mapCanvas.style.opacity = '';
      mapCanvas.style.filter  = '';
    }

    // 6. Silence audio overlay if off
    if (this._audioCtrl && this._audioCtrl._mode === 'off') {
      // guard already in _applyAudioSignals — nothing further needed
    }

    console.info('[WOS Orbital] CLEAN EARTH BASELINE applied');
    return this.getCleanEarthReport();
  };

  OrbitalEarthMode.prototype.getCleanEarthReport = function () {
    var map = this._map;

    function _q(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
    function _cs(el) { try { return el ? global.getComputedStyle(el) : null; } catch (e) { return null; } }
    function _op(el) { var cs = _cs(el); return cs ? parseFloat(cs.opacity) : null; }
    function _fi(el) { var cs = _cs(el); return (cs && cs.filter && cs.filter !== 'none') ? cs.filter : null; }
    function _toFloat(v) { var f = parseFloat(v); return isNaN(f) ? null : f; }

    var transEl       = document.getElementById('wos-transition-overlay') || document.getElementById('wos-mode-transition-overlay');
    var transCs       = _cs(transEl);
    var transOp       = transEl ? _toFloat(transCs && transCs.opacity) : null;
    var transVisible  = transEl ? (transCs && transCs.display !== 'none' && (transOp === null || transOp > 0.02)) : false;

    var mapContainer  = _q('.mapboxgl-map') || document.getElementById('map');
    var mapCanvas     = _q('.mapboxgl-canvas');
    var containerOp   = _op(mapContainer);
    var canvasOp      = _op(mapCanvas);
    var containerFi   = _fi(mapContainer);
    var canvasFi      = _fi(mapCanvas);

    var elStars  = document.getElementById(_STARS_ID);
    var elScan   = document.getElementById(_SCAN_ID);
    var elAtm    = document.getElementById(_ATM_ID);
    var elOrigin = document.getElementById(_ORIGIN_ID);
    var starsOp  = _op(elStars);
    var scanOp   = _op(elScan);
    var atmOp    = _op(elAtm);
    var originOp = _op(elOrigin);

    var tok = this._tokens || {};

    var proj = null;
    try { proj = map && map.getProjection ? map.getProjection() : null; } catch (e) {}
    var projName = proj ? (proj.name || proj.type || String(proj)) : null;

    var audioMode = this._audioCtrl ? (this._audioCtrl._mode || 'off') : 'off';

    var mapCanvasReadable = (containerOp === null || containerOp > 0.97) &&
                            (canvasOp    === null || canvasOp    > 0.97) &&
                            !containerFi && !canvasFi;

    var report = {
      cleanEarthActive:       this._active,
      overlaysOff:            (starsOp === null || starsOp < 0.01) && (scanOp === null || scanOp < 0.01),
      audioOff:               audioMode === 'off',
      starsOff:               starsOp === null || starsOp < 0.01,
      scanRingOff:            scanOp   === null || scanOp  < 0.01,
      hazeOff:                (tok.orbitalHazeOpacity || 0) < 0.01,
      vignetteOff:            true,
      transitionOverlayClear: !transVisible,
      mapCanvasReadable:      mapCanvasReadable,
      originMarkerSecondary:  originOp === null || originOp <= 0.65,
      globeProjection:        projName === 'globe' || projName === null,
      details: {
        stars:          starsOp,
        scan:           scanOp,
        atmosphere:     atmOp,
        origin:         originOp,
        mapContainerOp: containerOp,
        mapCanvasOp:    canvasOp,
        mapContainerFi: containerFi,
        mapCanvasFi:    canvasFi,
        transitionOp:   transOp,
        transitionVis:  transVisible,
        projection:     projName,
        audioMode:      audioMode,
        tokens:         { orbitalStarOpacity: tok.orbitalStarOpacity, orbitalHazeOpacity: tok.orbitalHazeOpacity, orbitalAtmosphereOpacity: tok.orbitalAtmosphereOpacity, orbitalOriginOpacity: tok.orbitalOriginOpacity }
      }
    };

    var allClear = report.overlaysOff && report.audioOff && report.starsOff &&
                   report.hazeOff && report.transitionOverlayClear &&
                   report.mapCanvasReadable && report.originMarkerSecondary;

    report.passed = allClear;

    if (allClear) {
      console.info('[WOS Orbital] CLEAN EARTH REPORT — PASSED', report);
    } else {
      console.warn('[WOS Orbital] CLEAN EARTH REPORT — ISSUES FOUND', report);
    }
    return report;
  };

  // ── Visibility stack diagnostic ───────────────────────────────────────────────

  OrbitalEarthMode.prototype.getVisibilityStackReport = function () {
    var self = this;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function _cs(el) {
      if (!el) return null;
      try {
        var s = global.getComputedStyle(el);
        return {
          display:          s.display,
          visibility:       s.visibility,
          opacity:          s.opacity,
          filter:           s.filter,
          backdropFilter:   s.backdropFilter || s.webkitBackdropFilter || '',
          mixBlendMode:     s.mixBlendMode,
          background:       s.background,
          backgroundColor:  s.backgroundColor,
          pointerEvents:    s.pointerEvents,
          zIndex:           s.zIndex,
          transform:        s.transform
        };
      } catch (e) { return { error: String(e) }; }
    }

    function _is(el) {
      if (!el) return null;
      var st = el.style;
      return {
        opacity:    st.opacity    || '',
        filter:     st.filter     || '',
        display:    st.display    || '',
        visibility: st.visibility || '',
        transform:  st.transform  || ''
      };
    }

    function _elReport(el) {
      return { exists: !!el, computed: _cs(el), inline: _is(el) };
    }

    function _q(sel) {
      try { return document.querySelector(sel); } catch (e) { return null; }
    }

    function _parseBrightness(filter) {
      var m = filter && filter.match(/brightness\(\s*([\d.]+)\s*\)/);
      return m ? parseFloat(m[1]) : null;
    }

    function _parseOpacity(filter) {
      var m = filter && filter.match(/opacity\(\s*([\d.]+)\s*\)/);
      return m ? parseFloat(m[1]) : null;
    }

    function _hasBlur(filter) {
      return !!(filter && /blur\(/.test(filter));
    }

    function _toFloat(val) {
      var v = parseFloat(val);
      return isNaN(v) ? null : v;
    }

    // ── Camera ─────────────────────────────────────────────────────────────────

    var map     = self._map;
    var camera  = { preset: self._cameraPreset || null, zoom: null, pitch: null, bearing: null, center: null, projection: null, globeFitReport: null };
    if (map) {
      try { camera.zoom    = map.getZoom ? +map.getZoom().toFixed(3)    : null; } catch (e) {}
      try { camera.pitch   = map.getPitch ? +map.getPitch().toFixed(1)   : null; } catch (e) {}
      try { camera.bearing = map.getBearing ? +map.getBearing().toFixed(1) : null; } catch (e) {}
      try { var c = map.getCenter && map.getCenter(); camera.center = c ? { lng: +c.lng.toFixed(4), lat: +c.lat.toFixed(4) } : null; } catch (e) {}
      try { camera.projection = map.getProjection ? map.getProjection() : null; } catch (e) {}
      try { camera.globeFitReport = self.getGlobeFitReport ? self.getGlobeFitReport() : null; } catch (e) {}
    }

    // ── Map DOM elements ───────────────────────────────────────────────────────

    var mapContainerEl = _q('.mapboxgl-map') || _q('#map') || _q('#wos-map');
    var mapCanvasContainerEl = _q('.mapboxgl-canvas-container');
    var mapCanvasEl = _q('.mapboxgl-canvas');

    var mapBlock = {
      mapExists:             !!map,
      containerExists:       !!mapContainerEl,
      canvasExists:          !!mapCanvasEl,
      styleLoaded:           !!(map && map.isStyleLoaded && map.isStyleLoaded()),
      containerComputedStyle: _cs(mapContainerEl),
      canvasComputedStyle:    _cs(mapCanvasEl),
      containerInlineStyle:  _is(mapContainerEl),
      canvasInlineStyle:     _is(mapCanvasEl)
    };

    // ── Transition overlay ─────────────────────────────────────────────────────

    var transOverlayEl = _q('#wos-transition-overlay') || _q('#wos-mode-transition-overlay');
    var transCs = _cs(transOverlayEl);
    var transBlock = {
      active:               false,
      overlayExists:        !!transOverlayEl,
      overlayComputedStyle: transCs,
      overlayInlineStyle:   _is(transOverlayEl),
      bodyTravelState:      document.body.classList.contains('wos-travel-state'),
      bodyOrbitalState:     document.body.classList.contains('wos-orbital-active')
    };
    if (transOverlayEl && transCs) {
      var tOp = _toFloat(transCs.opacity);
      transBlock.active = transCs.display !== 'none' && (tOp === null || tOp > 0.02);
    }

    // ── Orbital overlays ───────────────────────────────────────────────────────

    function _overlayReport(id) {
      var el = document.getElementById(id);
      if (!el) return { exists: false };
      var cs = _cs(el);
      var op = cs ? _toFloat(cs.opacity) : null;
      return { exists: true, opacity: op, display: cs ? cs.display : null, zIndex: cs ? cs.zIndex : null, inline: _is(el) };
    }

    var overlaysBlock = {
      atmosphere:  _overlayReport('orb-atmosphere'),
      scanRing:    _overlayReport('orb-scan-ring'),
      stars:       _overlayReport('orb-stars'),
      origin:      _overlayReport('orb-origin'),
      destination: _overlayReport('orb-destination'),
      routeArc:    _overlayReport('orb-route-arc')
    };

    // Collect any additional orb-* or orbital-class elements
    var extraOrb = [];
    try {
      document.querySelectorAll('[id^="orb-"], [class*="orbital"], [class*="wos-orbital"]').forEach(function (el) {
        var knownIds = ['orb-atmosphere','orb-scan-ring','orb-stars','orb-origin','orb-destination','orb-route-arc'];
        if (el.id && knownIds.indexOf(el.id) === -1) {
          var cs2 = _cs(el);
          var op2 = cs2 ? _toFloat(cs2.opacity) : null;
          extraOrb.push({ id: el.id || '(no-id)', cls: el.className || '', opacity: op2, display: cs2 ? cs2.display : null });
        }
      });
    } catch (e) {}
    if (extraOrb.length) overlaysBlock.other = extraOrb;

    // ── Body classes ───────────────────────────────────────────────────────────

    var bodyClasses = document.body.className.split(/\s+/).filter(Boolean);

    // ── Tokens ─────────────────────────────────────────────────────────────────

    var tok = self._tokens || (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.getTokens() : null) || {};
    var tokBlock = {
      orbitalSurfaceBrightness: tok.orbitalSurfaceBrightness,
      orbitalLineOpacity:       tok.orbitalLineOpacity,
      orbitalAtmosphereOpacity: tok.orbitalAtmosphereOpacity,
      orbitalRimOpacity:        tok.orbitalRimOpacity,
      orbitalRimRadius:         tok.orbitalRimRadius,
      orbitalHazeOpacity:       tok.orbitalHazeOpacity,
      orbitalStarOpacity:       tok.orbitalStarOpacity,
      orbitalOriginOpacity:     tok.orbitalOriginOpacity
    };

    // ── Audio ──────────────────────────────────────────────────────────────────

    var audioBlock = {
      controllerExists: !!self._audioCtrl,
      mode:             self._audioCtrl ? (self._audioCtrl._mode || 'unknown') : null,
      active:           self._audioCtrl ? self._audioCtrl._mode !== 'off' : false,
      lastSignalsKnown: null
    };

    // ── Suspects ───────────────────────────────────────────────────────────────

    var suspects = [];

    function _flag(source, value, severity, reason) {
      suspects.push({ source: source, value: value, severity: severity, reason: reason });
    }

    // Map canvas opacity
    if (mapBlock.containerComputedStyle) {
      var cOp = _toFloat(mapBlock.containerComputedStyle.opacity);
      if (cOp !== null && cOp < 0.98) _flag('map.container.opacity', cOp, 'high', 'Map container opacity below readable baseline.');
      var cFlt = mapBlock.containerComputedStyle.filter;
      var cBri = _parseBrightness(cFlt);
      if (cBri !== null && cBri < 0.99) _flag('map.container.filter.brightness', cFlt, 'high', 'Map container brightness filter is dimming the map.');
      if (_hasBlur(cFlt))               _flag('map.container.filter.blur',       cFlt, 'medium', 'Map container has blur filter applied.');
      var cFOp = _parseOpacity(cFlt);
      if (cFOp !== null && cFOp < 0.98) _flag('map.container.filter.opacity',   cFlt, 'high', 'Map container filter opacity is below baseline.');
      if (mapBlock.containerComputedStyle.display === 'none')       _flag('map.container.display', 'none', 'high', 'Map container is hidden.');
      if (mapBlock.containerComputedStyle.visibility === 'hidden')  _flag('map.container.visibility', 'hidden', 'high', 'Map container visibility is hidden.');
    }
    if (mapBlock.canvasComputedStyle) {
      var xOp = _toFloat(mapBlock.canvasComputedStyle.opacity);
      if (xOp !== null && xOp < 0.98) _flag('map.canvas.opacity', xOp, 'high', 'Mapbox canvas opacity below readable baseline.');
      var xFlt = mapBlock.canvasComputedStyle.filter;
      var xBri = _parseBrightness(xFlt);
      if (xBri !== null && xBri < 0.99) _flag('map.canvas.filter.brightness', xFlt, 'high', 'Mapbox canvas brightness filter is dimming the Earth.');
      if (_hasBlur(xFlt))               _flag('map.canvas.filter.blur',       xFlt, 'medium', 'Mapbox canvas has blur applied.');
    }
    // Also check inline filter on map container (set by _setMapDim)
    if (mapBlock.containerInlineStyle && mapBlock.containerInlineStyle.filter) {
      var iFlt = mapBlock.containerInlineStyle.filter;
      var iBri = _parseBrightness(iFlt);
      if (iBri !== null && iBri < 0.99) _flag('map.container.inlineFilter.brightness', iFlt, 'high', 'Inline brightness filter on map container (likely stuck from transition).');
    }

    // Transition overlay
    if (transBlock.active) {
      _flag('transition.overlay', transCs ? transCs.opacity : '?', 'high', 'Transition veil is still visible.');
    }
    if (transBlock.bodyTravelState) {
      _flag('body.wos-travel-state', 'present', 'medium', 'wos-travel-state body class still active — transition may not have fully cleared.');
    }

    // Body classes — Moon/presentation leakage
    var moonClasses = ['wos-moon-active','wos-moon-orbit-active','wos-moon-surface-active'];
    var presClasses = ['wos-presentation-card','wos-presentation-website','wos-presentation-canvas','wos-transition-active','wos-map-dimmed'];
    bodyClasses.forEach(function (cls) {
      if (moonClasses.indexOf(cls) !== -1) _flag('body.' + cls, 'present', 'high', 'Moon class active during Orbital Earth — state leak.');
      if (presClasses.indexOf(cls) !== -1) _flag('body.' + cls, 'present', 'medium', 'Unexpected presentation/transition class during Orbital Earth.');
    });

    // Orbital overlays
    if (overlaysBlock.atmosphere.exists && overlaysBlock.atmosphere.opacity > 0.35) {
      _flag('overlay.atmosphere.opacity', overlaysBlock.atmosphere.opacity, 'medium', 'Atmosphere opacity above 0.35 — may be washing over the globe.');
    }
    if (overlaysBlock.stars.exists && overlaysBlock.stars.opacity > 0) {
      _flag('overlay.stars.opacity', overlaysBlock.stars.opacity, 'low', 'Stars visible — Clean Earth baseline expects stars off.');
    }
    if (overlaysBlock.origin.exists && overlaysBlock.origin.opacity > 0.7) {
      _flag('overlay.origin.opacity', overlaysBlock.origin.opacity, 'low', 'Origin marker opacity above 0.7 — louder than intended baseline.');
    }

    // Camera
    if (camera.projection && typeof camera.projection === 'object') {
      var projName = camera.projection.name || camera.projection.type || JSON.stringify(camera.projection);
      if (projName !== 'globe') _flag('camera.projection', projName, 'high', 'Mapbox projection is not globe — Earth curvature will not show.');
    } else if (camera.projection && camera.projection !== 'globe') {
      _flag('camera.projection', camera.projection, 'high', 'Mapbox projection is not globe.');
    }
    if (camera.zoom !== null && camera.zoom < 0.15) _flag('camera.zoom', camera.zoom, 'medium', 'Zoom very low — Earth may appear very small.');
    if (camera.zoom !== null && camera.zoom > 2.0)  _flag('camera.zoom', camera.zoom, 'medium', 'Zoom high — Earth is likely cropped at this level.');

    // ── Most likely dimming source ─────────────────────────────────────────────

    var _severity = { high: 3, medium: 2, low: 1 };
    var top = null;
    suspects.forEach(function (s) {
      if (!top || _severity[s.severity] > _severity[top.severity]) top = s;
    });

    var mostLikely = top ? top.source : null;

    var recommendedPatch = null;
    if (top) {
      var patches = {
        'transition.overlay':                    'Call restoreMapVisualState() or force transition overlay display:none / opacity:0.',
        'body.wos-travel-state':                 'Remove wos-travel-state body class — transition did not fully clear.',
        'map.container.inlineFilter.brightness': 'Clear inline filter on .mapboxgl-map / #mapbox-viewport (stuck from _setMapDim).',
        'map.container.filter.brightness':       'Check CSS rule dimming map container in orbital earth body class context.',
        'map.canvas.filter.brightness':          'Clear canvas filter — likely stuck from transition or orbital entry.',
        'map.container.opacity':                 'Restore map container opacity to 1.',
        'map.canvas.opacity':                    'Restore Mapbox canvas opacity to 1.',
        'camera.projection':                     'Call map.setProjection("globe") to restore globe view.',
        'camera.zoom':                           'Call OrbitalEarthMode.setCameraPreset("readable_orbit") to reframe.'
      };
      recommendedPatch = patches[top.source] || ('Investigate and remove: ' + top.source + ' = ' + top.value);
    }

    // ── Build final report ─────────────────────────────────────────────────────

    var report = {
      timestamp:           new Date().toISOString(),
      orbitalEarthActive:  self._active,
      runtimeMode:         (SBE.WosRuntimeModeState ? SBE.WosRuntimeModeState.MODES : {}),
      presentationMode:    (SBE.WosPresentationRouter ? SBE.WosPresentationRouter.getPresentationMode() : 'unknown'),
      bodyClasses:         bodyClasses,
      camera:              camera,
      map:                 mapBlock,
      transition:          transBlock,
      overlays:            overlaysBlock,
      tokens:              tokBlock,
      audio:               audioBlock,
      suspects:            suspects,
      mostLikelyDimmingSource: mostLikely,
      recommendedPatch:    recommendedPatch
    };

    // ── Console output ─────────────────────────────────────────────────────────

    if (suspects.length > 0) {
      console.warn('[WOS Orbital] VISIBILITY STACK REPORT — ' + suspects.length + ' suspect(s)');
      try { console.table(suspects); } catch (e) { console.log(suspects); }
      console.log('[WOS Orbital] mostLikelyDimmingSource:', mostLikely);
      console.log('[WOS Orbital] recommendedPatch:', recommendedPatch);
    } else {
      console.info('[WOS Orbital] VISIBILITY STACK CLEAN');
    }
    console.log('[WOS Orbital] FULL REPORT:', report);

    return report;
  };

  // ── FX report ─────────────────────────────────────────────────────────────────

  OrbitalEarthMode.prototype.getFxReport = function () {
    var tok = this._tokens || {};
    var audioMode = this._audioCtrl ? (this._audioCtrl._mode || 'off') : 'off';

    function _elOp(id) {
      var el = document.getElementById(id);
      if (!el) return null;
      try { return parseFloat(global.getComputedStyle(el).opacity); } catch(e) { return null; }
    }

    var starOp   = _elOp(_STARS_ID);
    var scanOp   = _elOp(_SCAN_ID);
    var atmOp    = _elOp(_ATM_ID);
    var originOp = _elOp(_ORIGIN_ID);

    var starsEnabled    = (tok.orbitalStarOpacity  || 0) > 0;
    var hazeEnabled     = (tok.orbitalHazeOpacity  || 0) > 0;
    var scanVisible     = scanOp !== null && scanOp > 0.01;
    var vignetteEnabled = false; // vignette removed from CSS in 0627C — always off

    var earthReadable =
      (atmOp === null || atmOp <= 0.35) &&
      (starOp === null || starOp <= 0.15) &&
      !hazeEnabled;

    var blockers = [];
    if (!earthReadable) blockers.push('FX opacity may obscure Earth');
    if (hazeEnabled)    blockers.push('haze is on — verify Earth readability');
    if (vignetteEnabled) blockers.push('vignette is on');
    if (audioMode !== 'off' && starsEnabled)
      blockers.push('audio reactive + stars enabled — watch for sparkle overreach');

    var report = {
      cleanEarthDefault:       this._active,
      starsEnabled:            starsEnabled,
      starOpacity:             tok.orbitalStarOpacity  || 0,
      starDomOpacity:          starOp,
      scanRingEnabled:         scanVisible,
      scanRingOpacity:         scanOp,
      audioMode:               audioMode,
      audioOverlayEnabled:     audioMode !== 'off',
      routeArcEnabled:         false,   // route arc not yet wired — always off
      signalParticlesEnabled:  false,   // signal particles not yet wired — always off
      hazeEnabled:             hazeEnabled,
      hazeOpacity:             tok.orbitalHazeOpacity  || 0,
      vignetteEnabled:         vignetteEnabled,
      legacyVisualizerEnabled: !!(SBE.OrbitalMode && SBE.OrbitalMode.isActive &&
                                  SBE.OrbitalMode.isActive() &&
                                  !this._active),
      atmosphereOpacity:       tok.orbitalAtmosphereOpacity || 0,
      atmosphereDomOpacity:    atmOp,
      originOpacity:           tok.orbitalOriginOpacity || 0,
      originDomOpacity:        originOp,
      earthReadable:           earthReadable,
      blockers:                blockers,
      passed:                  blockers.length === 0
    };

    if (report.passed) {
      console.info('[WOS Orbital] FX REPORT — PASSED', report);
    } else {
      console.warn('[WOS Orbital] FX REPORT — BLOCKERS', report);
    }
    return report;
  };

  // ── broadcast composition report ─────────────────────────────────────────────

  OrbitalEarthMode.prototype.getBroadcastCompositionReport = function () {
    var vw = global.innerWidth  || 0;
    var vh = global.innerHeight || 0;

    function _elInfo(selector) {
      var el = typeof selector === 'string'
        ? (selector[0] === '#' ? document.getElementById(selector.slice(1)) : document.querySelector(selector))
        : selector;
      if (!el) return { exists: false, visible: false, rect: null };
      var s   = global.getComputedStyle(el);
      var vis = s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.01;
      var r   = el.getBoundingClientRect();
      return {
        exists:  true,
        visible: vis,
        rect: vis ? { top: Math.round(r.top), left: Math.round(r.left),
                      right: Math.round(r.right), bottom: Math.round(r.bottom),
                      width: Math.round(r.width), height: Math.round(r.height) } : null
      };
    }

    function _rectsOverlap(a, b) {
      if (!a || !b) return false;
      return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    }

    var topBar   = _elInfo('#wos-top-bar');     // may not exist in WALL
    var leftBar  = _elInfo('#left-rail');
    var hud      = _elInfo('#wos-hud');         // traversal HUD (top-right = A3)
    var nav      = _elInfo('#wos-nav');          // transport deck (bottom = C1/C3)
    var canvas   = _elInfo('.mapboxgl-canvas');
    var fxPanel  = _elInfo('#orbital-fx-panel');

    // Song/title block lives in PLAY parent, not WALL.
    // In WALL context it does not exist — A3 is occupied by #wos-hud if visible.
    var titleSongBlock = { exists: false, visible: false, rect: null,
                           note: 'Song/title block is PLAY-side (BroadcastRouteCameraInstrumentation). Not present in WALL.' };

    // Earth center zone: middle 40% of viewport
    var earthCenter = {
      top:    Math.round(vh * 0.30), left:   Math.round(vw * 0.30),
      right:  Math.round(vw * 0.70), bottom: Math.round(vh * 0.70)
    };

    var overlaps = {
      titleOverTransport:     _rectsOverlap(titleSongBlock.rect, nav.rect),
      titleOverTopBar:        _rectsOverlap(titleSongBlock.rect, topBar.rect),
      titleOverEarthCenter:   _rectsOverlap(titleSongBlock.rect, earthCenter),
      controlsOverEarthCenter: _rectsOverlap(nav.rect, earthCenter),
      hudOverEarthCenter:     _rectsOverlap(hud.rect, earthCenter),
      leftBarUnexpectedVisible: leftBar.visible  // should be hidden during wos-orbital-earth-active
    };

    var orbitalEarthActive = document.body.classList.contains('wos-orbital-earth-active');

    var blockers = [];
    if (overlaps.controlsOverEarthCenter) blockers.push('transport-deck-overlaps-earth-center');
    if (overlaps.leftBarUnexpectedVisible) blockers.push('left-rail-visible-during-orbital-earth');
    if (overlaps.hudOverEarthCenter) blockers.push('hud-overlaps-earth-center');

    var report = {
      timestamp: performance.now(),
      viewport:  { width: vw, height: vh, aspectRatio: vh > 0 ? Math.round((vw / vh) * 100) / 100 : 0 },
      zones: {
        earthZone:      'B2 (center)',
        titleSongZone:  'PLAY-side — not in WALL',
        transportZone:  nav.visible ? 'C1/C3 (bottom rail)' : 'hidden',
        topBarZone:     topBar.visible ? 'A1/A2/A3 (top)' : 'hidden'
      },
      elements: {
        topBar:         topBar,
        leftBar:        leftBar,
        titleSongBlock: titleSongBlock,
        transportDeck:  nav,
        mapCanvas:      canvas,
        traversalHud:   hud,
        fxPanel:        fxPanel
      },
      overlaps: overlaps,
      activeMode: {
        orbitalEarthActive:    orbitalEarthActive,
        broadcastModeActive:   document.body.classList.contains('play-controls-hidden'),
        authoringChromeVisible: leftBar.visible
      },
      passed:   blockers.length === 0,
      blockers: blockers
    };

    if (report.passed) {
      console.info('[WOS Orbital] BROADCAST COMPOSITION — PASSED', report);
    } else {
      console.warn('[WOS Orbital] BROADCAST COMPOSITION — BLOCKERS', report);
    }
    return report;
  };

  // ── Broadcast surface report ─────────────────────────────────────────────────
  //
  // Audits every control surface visible in the broadcast frame during Orbital Earth.
  // Flags any control that is not approved for WOS broadcast.
  // Call after Orbital entry settles (~2s) to check for leaked PLAY/Studio controls.

  OrbitalEarthMode.prototype.getBroadcastSurfaceReport = function () {
    function _q(sel)  { try { return document.querySelector(sel); } catch(e) { return null; } }
    function _cs(el)  { try { return el ? window.getComputedStyle(el) : null; } catch(e) { return null; } }
    function _vis(el) {
      if (!el) return false;
      var cs = _cs(el);
      if (!cs) return false;
      return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01;
    }

    var orbitalEarthActive = document.body.classList.contains('wos-orbital-earth-active');

    // Enumerate all candidate control surfaces with their owner and broadcast approval
    var surfaces = [
      // ── WALL-owned, approved ──────────────────────────────────────────────────
      { id: 'wos-nav',             selector: '#wos-nav',             owner: 'WALL',    approvedForBroadcast: true,  reason: 'Transport deck — approved WALL control' },
      { id: 'wos-hud',             selector: '#wos-hud',             owner: 'WALL',    approvedForBroadcast: true,  reason: 'Traversal HUD — approved WALL overlay' },
      { id: 'wos-broadcast-now-playing', selector: '#wos-broadcast-now-playing', owner: 'WALL', approvedForBroadcast: true, reason: 'Now-playing A3 block — approved broadcast' },
      // ── Studio authoring — NOT approved during broadcast ─────────────────────
      { id: 'transport-bar',       selector: '.transport-bar',       owner: 'STUDIO',  approvedForBroadcast: false, reason: 'Studio canvas transport (BPM/bars/quantize/record) — authoring tool, not broadcast' },
      { id: 'left-rail',           selector: '#left-rail',           owner: 'STUDIO',  approvedForBroadcast: false, reason: 'Left authoring rail — creator tool, hidden during Orbital' },
      { id: 'left-panel',          selector: '#left-panel',          owner: 'STUDIO',  approvedForBroadcast: false, reason: 'Left inspector panel — authoring only' },
      { id: 'right-panel',         selector: '#right-panel',         owner: 'STUDIO',  approvedForBroadcast: false, reason: 'Right inspector panel — authoring only' },
      { id: 'topbar',              selector: '.topbar',              owner: 'STUDIO',  approvedForBroadcast: false, reason: 'Topbar / tool strip — authoring only' },
      // ── PLAY-owned — NOT approved in WALL broadcast ──────────────────────────
      { id: 'play-sampler',        selector: '#play-sampler,#sampler-panel,.sampler-strip,.play-sampler', owner: 'PLAY', approvedForBroadcast: false, reason: 'PLAY sampler controls — not approved in WALL' },
      { id: 'flow-curve',          selector: '#flow-curve-panel,.flow-curve-editor', owner: 'PLAY',    approvedForBroadcast: false, reason: 'Flow-Curve editor — not approved in WALL' },
      { id: 'scheduler',           selector: '#scheduler-panel,.scheduler-strip',    owner: 'PLAY',    approvedForBroadcast: false, reason: 'PLAY scheduler — not approved in WALL' },
      // ── Debug/dev — NOT approved in broadcast ────────────────────────────────
      { id: 'dev-panel',           selector: '#dev-panel,.dev-ui,.debug-panel',      owner: 'DEBUG',   approvedForBroadcast: false, reason: 'Dev/debug panel — visible only with ?dev=1 or WOS_DEV_UI' },
      // ── AtmosphereComposite — suppressed during Orbital ───────────────────────
      { id: 'atmosphere-composite', selector: '#atmosphere-composite',               owner: 'WALL',    approvedForBroadcast: false, reason: 'Atmosphere canvas — suppressed during wos-orbital-earth-active by CSS' }
    ];

    var surfaceResults = [];
    var leakedControls = [];
    var blockers = [];

    surfaces.forEach(function (def) {
      var el = _q(def.selector);
      var visible = _vis(el);
      var zIndex = el ? (_cs(el) || {}).zIndex || 'auto' : 'N/A';

      var result = {
        id:                  def.id,
        selector:            def.selector,
        owner:               def.owner,
        approvedForBroadcast: def.approvedForBroadcast,
        visible:             visible,
        zIndex:              zIndex,
        reason:              def.reason
      };
      surfaceResults.push(result);

      if (visible && !def.approvedForBroadcast) {
        leakedControls.push(def.id);
        if (def.owner === 'PLAY')   blockers.push('play-controls-visible-in-broadcast:' + def.id);
        if (def.owner === 'DEBUG')  blockers.push('debug-controls-visible-in-broadcast:' + def.id);
        if (def.owner === 'STUDIO') blockers.push('unapproved-control-surface-visible:' + def.id);
        if (def.id === 'atmosphere-composite') blockers.push('atmosphere-composite-visible-in-orbital');
      }
    });

    var passed = leakedControls.length === 0;
    var report = {
      orbitalEarthActive:    orbitalEarthActive,
      broadcastModeActive:   orbitalEarthActive,
      visibleControlSurfaces: surfaceResults,
      leakedControls:        leakedControls,
      blockers:              blockers,
      passed:                passed
    };

    if (passed) {
      console.info('[WOS Orbital] BROADCAST SURFACE REPORT — PASSED', report);
    } else {
      console.warn('[WOS Orbital] BROADCAST SURFACE REPORT — LEAKED CONTROLS', report);
    }
    return report;
  };

  // ── Globe visibility report ───────────────────────────────────────────────────
  //
  // Combines globe fit + full visual stack into a single readability diagnostic.
  // Use this to verify Earth is large, visible, and unobscured after entry.

  OrbitalEarthMode.prototype.getGlobeVisibilityReport = function () {
    var self = this;

    // Guard: report is only authoritative when OrbitalEarthMode is active.
    // Calling this before enter() (or after exit()) gives misleading passed:false — return
    // a minimal record so callers can check isActive() before acting on the result.
    if (!self._active) {
      var inactive = {
        orbitalEarthActive: false,
        passed: false,
        blockers: ['orbital-earth-mode-not-active'],
        note: 'getGlobeVisibilityReport() called while OrbitalEarthMode is not active — result is non-authoritative'
      };
      console.warn('[WOS Orbital] getGlobeVisibilityReport: called while not active — use OrbitalEarthMode.isActive() before checking report', inactive);
      return inactive;
    }

    var map  = self._map;

    // ── Viewport ────────────────────────────────────────────────────────────────

    var vw = global.innerWidth  || 1280;
    var vh = global.innerHeight || 800;

    // ── Camera ──────────────────────────────────────────────────────────────────

    var zoom = null, pitch = null, bearing = null, center = null, projection = null;
    try { zoom    = map && map.getZoom    ? +map.getZoom().toFixed(3)    : null; } catch (e) {}
    try { pitch   = map && map.getPitch   ? +map.getPitch().toFixed(1)   : null; } catch (e) {}
    try { bearing = map && map.getBearing ? +map.getBearing().toFixed(1) : null; } catch (e) {}
    try { var c   = map && map.getCenter && map.getCenter(); center = c ? { lng: +c.lng.toFixed(4), lat: +c.lat.toFixed(4) } : null; } catch (e) {}
    try { projection = map && map.getProjection ? map.getProjection() : null; } catch (e) {}
    var projName = projection ? (projection.name || projection.type || String(projection)) : null;

    var preset = self._cameraPreset || 'none';
    var pad    = (_CAMERA_PRESETS[preset] || _CAMERA_PRESETS['readable_orbit']).padding || { top: 80, right: 80, bottom: 150, left: 80 };
    var safeH  = Math.max(0, vh - pad.top - pad.bottom);

    // ── Globe size estimate ─────────────────────────────────────────────────────
    // At zoom 0, globe tile-world width ≈ 512px. Each zoom level doubles it.
    // In globe projection the sphere diameter roughly equals the tile-world width
    // when the map is centered (best-effort estimate, varies with Mapbox version).

    var estimatedDiameterPx = zoom !== null ? Math.round(512 * Math.pow(2, zoom)) : null;
    var coveragePercent     = (estimatedDiameterPx !== null && vh > 0)
      ? Math.round((estimatedDiameterPx / vh) * 100)
      : null;
    var safeAreaCoverage    = (estimatedDiameterPx !== null && safeH > 0)
      ? Math.round((estimatedDiameterPx / safeH) * 100)
      : null;

    var globeTooSmall      = safeAreaCoverage !== null && safeAreaCoverage < 45;
    var globePossiblyCropped = zoom !== null && zoom > _GLOBE_FIT_MAX_ZOOM;

    // ── Visual stack ─────────────────────────────────────────────────────────────

    function _q(sel) { try { return document.querySelector(sel); } catch (e) { return null; } }
    function _cs(el) { try { return el ? global.getComputedStyle(el) : null; } catch (e) { return null; } }
    function _op(el) { var cs = _cs(el); var v = cs ? parseFloat(cs.opacity) : null; return isNaN(v) ? null : v; }
    function _fi(el) { var cs = _cs(el); return cs && cs.filter && cs.filter !== 'none' ? cs.filter : null; }

    var mapEl      = _q('.mapboxgl-map') || document.getElementById('map');
    var canvasEl   = _q('.mapboxgl-canvas');
    var transEl    = document.getElementById('wos-transition-overlay') || document.getElementById('wos-mode-transition-overlay');
    var atmBridge  = document.getElementById('wos-atm-bridge');

    var mapOpacity    = _op(mapEl);
    var canvasOpacity = _op(canvasEl);
    var mapFilter     = _fi(mapEl);
    var canvasFilter  = _fi(canvasEl);
    var transOpacity  = transEl ? _op(transEl) : null;
    var transCs       = _cs(transEl);
    var transVis      = transEl
      ? (transCs && transCs.display !== 'none' && (transOpacity === null || transOpacity > 0.02))
      : false;
    var atmBridgeOp   = atmBridge ? _op(atmBridge) : null;
    var atmBridgeCs   = _cs(atmBridge);
    var atmBridgeVis  = atmBridge
      ? (atmBridgeCs && atmBridgeCs.display !== 'none' && (atmBridgeOp === null || atmBridgeOp > 0.02))
      : false;

    var tok = self._tokens || {};

    var visualStack = {
      mapOpacity:              mapOpacity,
      canvasOpacity:           canvasOpacity,
      mapFilter:               mapFilter,
      canvasFilter:            canvasFilter,
      atmosphereOpacity:       _op(document.getElementById('orb-atmosphere')),
      starOpacity:             _op(document.getElementById('orb-stars')),
      hazeOpacity:             tok.orbitalHazeOpacity || 0,
      transitionOverlayOpacity: transOpacity,
      transitionOverlayVisible: transVis,
      atmBridgeOpacity:        atmBridgeOp,
      atmBridgeVisible:        atmBridgeVis
    };

    // ── Style swap state ─────────────────────────────────────────────────────────

    var currentStyleObj = null;
    var currentStyleName = null;
    try { currentStyleObj = map && map.getStyle ? map.getStyle() : null; } catch (e) {}
    if (currentStyleObj) { currentStyleName = currentStyleObj.name || null; }
    var savedStyleName  = self._savedStyle ? (self._savedStyle.name || null) : null;
    var orbitalStyleActive = !!(currentStyleName && currentStyleName.toLowerCase().indexOf('satellite') !== -1) ||
                             !!(currentStyleObj && currentStyleObj.sources && currentStyleObj.sources.mapbox &&
                                String(currentStyleObj.sources.mapbox.url || '').indexOf('satellite') !== -1);
    var styleLoaded = !!(map && map.isStyleLoaded && map.isStyleLoaded());

    // ── Dimming blockers ─────────────────────────────────────────────────────────

    var mapReadable    = (mapOpacity    === null || mapOpacity    > 0.97) && !mapFilter;
    var canvasReadable = (canvasOpacity === null || canvasOpacity > 0.97) && !canvasFilter;
    var overlaysClear  = !transVis && !atmBridgeVis;
    var projectionGlobe = projName === 'globe' || projName === null;
    var globeTooDim    = !mapReadable || !canvasReadable || !overlaysClear;

    // Globe readable: satellite style + globe projection + no destructive filters
    var globeReadable = orbitalStyleActive && projectionGlobe && !globeTooDim && zoom !== null && zoom >= 0.3;

    // Land/linework readable: satellite gives real texture; linework = N/A on satellite
    var landmassReadable = globeReadable;
    var lineworkReadable = globeReadable;
    var limbVisible      = projectionGlobe && zoom !== null && zoom <= 1.8;

    var blockers = [];
    if (!projectionGlobe)      blockers.push('projection-not-globe');
    if (!orbitalStyleActive)   blockers.push('orbital-satellite-style-not-active');
    if (!styleLoaded)          blockers.push('style-not-fully-loaded');
    if (!mapReadable)          blockers.push('map-container-filtered-or-dim');
    if (!canvasReadable)       blockers.push('canvas-filtered-or-dim');
    if (transVis)              blockers.push('transition-overlay-still-visible');
    if (atmBridgeVis)          blockers.push('atm-bridge-still-visible');
    if (globeTooSmall)         blockers.push('globe-too-small-for-safe-viewport');
    if (globePossiblyCropped)  blockers.push('globe-possibly-cropped-at-zoom-' + zoom);
    var atmCanvas = document.getElementById('atmosphere-composite');
    var atmCs2    = _cs(atmCanvas);
    if (atmCanvas && atmCs2 && atmCs2.display !== 'none') blockers.push('atmosphere-composite-not-suppressed');

    var report = {
      timestamp:         performance.now(),
      orbitalEarthActive: self._active,
      projection:        projName,
      camera: {
        zoom: zoom, pitch: pitch, bearing: bearing, center: center, padding: pad, preset: preset
      },
      viewport: {
        width: vw, height: vh, aspectRatio: vh > 0 ? Math.round((vw / vh) * 100) / 100 : 0
      },
      globe: {
        estimatedScreenDiameterPx:  estimatedDiameterPx,
        estimatedScreenCoveragePercent: coveragePercent,
        safeAreaCoveragePercent:    safeAreaCoverage,
        limbVisible:                limbVisible,
        globeTooSmall:              globeTooSmall,
        globePossiblyCropped:       globePossiblyCropped,
        globeTooDim:                globeTooDim,
        globeReadable:              globeReadable,
        landmassReadable:           landmassReadable,
        lineworkReadable:           lineworkReadable
      },
      styleSwap: {
        currentStyleName:    currentStyleName,
        savedStyleName:      savedStyleName,
        orbitalStyleActive:  orbitalStyleActive,
        orbitalStyleUrl:     _ORBITAL_STYLE,
        styleLoaded:         styleLoaded,
        restoreStylePassed:  !self._active && !self._savedStyle  // true when exit completed cleanly
      },
      globalTint: (function () {
        var atmCanvas    = document.getElementById('atmosphere-composite');
        var atmCs        = _cs(atmCanvas);
        var atmSuppressed = !!(atmCs && atmCs.display === 'none');
        var atm          = global.SBE && SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
        var tintColor    = atm ? (atm.tintColor || 'rgba(0,0,0,0)') : null;
        var tintActive   = atm && atm.tintA !== undefined ? atm.tintA > 0 : (tintColor ? tintColor.indexOf(',0)') === -1 : false);
        var brightness   = atm ? (atm.ambientBrightness !== undefined ? atm.ambientBrightness : 1) : 1;
        var darkVeil     = Math.max(0, 1 - brightness) * 0.55;
        return {
          atmosphereCompositeVisible: !atmSuppressed,
          atmosphereCompositeSuppressed: atmSuppressed,
          nightTintColor:   tintColor,
          nightTintActive:  tintActive,
          ambientBrightness: brightness,
          estimatedDarkVeilAlpha: +darkVeil.toFixed(4),
          purpleBrownWashDetected: !atmSuppressed && (tintActive || darkVeil > 0.05),
          suppressedOk: atmSuppressed
        };
      })(),
      visualStack:        visualStack,
      transition: {
        transitioning:          !!(global.SBE && SBE.WosModeTransitionController && SBE.WosModeTransitionController.isTransitioning()),
        lastTransition:         null,
        transitionOverlayClear: !transVis
      },
      passed:   blockers.length === 0,
      blockers: blockers
    };

    if (report.passed) {
      console.info('[WOS Orbital] GLOBE VISIBILITY REPORT — PASSED', report);
    } else {
      console.warn('[WOS Orbital] GLOBE VISIBILITY REPORT — BLOCKERS', report);
    }
    return report;
  };

  // ── Singleton ─────────────────────────────────────────────────────────────────

  SBE.OrbitalEarthMode = new OrbitalEarthMode();

})(window);
