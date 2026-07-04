(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosModeTransitionController — staged Map ↔ Orbital travel bridge ─────────
  //
  // Map→Orbital sequence (1100ms total):
  //   0ms:     lock controls, dark overlay starts (opacity 0→0.6)
  //   250ms:   HUD shifts to travel state, map dims
  //   650ms:   atmosphere bridge fades in over orbital canvas
  //   900ms:   globe fades in behind bridge
  //   1100ms:  map fully hidden, Orbital active, overlay clears
  //
  // Orbital→Map sequence (900ms total):
  //   0ms:     lock controls, orbital glow lowers
  //   250ms:   map fades back in under orbital layer
  //   650ms:   orbital layer hidden
  //   700ms:   restoreMapVisualState()
  //   900ms:   controls unlock

  var _transitioning = false;
  var _overlay       = null;
  var _atmBridge     = null;

  // ── Overlay elements ──────────────────────────────────────────────────────────

  function _getOverlay() {
    if (_overlay) return _overlay;
    _overlay = document.createElement('div');
    _overlay.id = 'wos-transition-overlay';
    Object.assign(_overlay.style, {
      position:      'fixed',
      inset:         '0',
      zIndex:        '195',
      background:    'rgba(2,6,14,0)',
      pointerEvents: 'none',
      transition:    'background 250ms ease-in-out',
      display:       'none'
    });
    document.body.appendChild(_overlay);
    return _overlay;
  }

  function _getAtmBridge() {
    if (_atmBridge) return _atmBridge;
    _atmBridge = document.createElement('div');
    _atmBridge.id = 'wos-atm-bridge';
    Object.assign(_atmBridge.style, {
      position:      'fixed',
      inset:         '0',
      zIndex:        '196',
      background:    'radial-gradient(ellipse at 50% 60%, rgba(20,60,120,0) 0%, rgba(8,28,68,0) 60%, rgba(2,8,28,0) 100%)',
      pointerEvents: 'none',
      transition:    'background 400ms ease-in-out, opacity 400ms ease-in-out',
      opacity:       '0',
      display:       'none'
    });
    document.body.appendChild(_atmBridge);
    return _atmBridge;
  }

  // ── Transition helpers ────────────────────────────────────────────────────────

  function _reflow(el) { void el.offsetHeight; }

  function _setMapDim(v) {
    // v: 0 = normal, 1 = fully dimmed
    var mapEl = document.querySelector('.mapboxgl-map, #mapbox-viewport');
    if (!mapEl) return;
    var b = (1 - v * 0.92).toFixed(3); // minimum brightness 0.08
    mapEl.style.transition = 'filter 300ms ease-in-out';
    mapEl.style.filter     = v > 0.01 ? 'brightness(' + b + ')' : '';
  }

  function _delay(ms, fn) { global.setTimeout(fn, ms); }

  // ── restoreMapVisualState — canonical cleanup for boot + return ───────────────

  function restoreMapVisualState() {
    // Exit Moon Mode if active (must happen before OrbitalEarth exit)
    try {
      var moonMode = SBE.MoonModeController || SBE.MoonMode;
      if (moonMode && moonMode.isActive && moonMode.isActive()) moonMode.exit();
    } catch (e) {}

    // Exit OrbitalEarthMode if active
    try {
      var earthMode = SBE.OrbitalEarthMode;
      if (earthMode && earthMode.isActive && earthMode.isActive()) earthMode.exit();
    } catch (e) {}

    // Delegate full DOM cleanup to WosStartupCoordinator (canonical list)
    var coord = SBE.WosStartupCoordinator;
    if (coord && coord.restoreMapStartupVisualState) {
      coord.restoreMapStartupVisualState();
    } else {
      // Inline fallback if coordinator not yet loaded
      document.body.classList.remove(
        'wos-orbital-active', 'wos-travel-state',
        'wos-orbital-earth-active', 'wos-moon-active',
        'wos-moon-surface-active', 'wos-moon-orbit-active',
        'wos-transition-active', 'wos-map-dimmed'
      );
      var orbCanvas = document.getElementById('orbital-mode-canvas');
      if (orbCanvas) { orbCanvas.style.display = 'none'; }
      // Clear filters/opacity/visibility on the full Mapbox layer stack
      var _clearEl = function (sel) {
        var el = document.querySelector(sel);
        if (!el) return;
        el.style.filter     = '';
        el.style.opacity    = '';
        el.style.visibility = '';
      };
      _clearEl('.mapboxgl-map');
      _clearEl('.mapboxgl-canvas-container');
      _clearEl('.mapboxgl-canvas');
      var ov = document.getElementById('wos-transition-overlay');
      if (ov) { ov.style.display = 'none'; }
      var atm = document.getElementById('wos-atm-bridge');
      if (atm) { atm.style.display = 'none'; }
      var fxBtn = document.getElementById('nav-orbital-fx');
      if (fxBtn) { fxBtn.style.display = 'none'; }
    }
    _transitioning = false;
  }

  // ── Map → Orbital (1300ms continuity bridge) ─────────────────────────────────
  //
  //   0ms    capture map context
  //   100ms  map lift: zoom out + pitch up
  //   300ms  travel state, begin dimming
  //   500ms  atmosphere veil
  //   750ms  pre-build orbital scene
  //   900ms  enterFromMapContext (globe orients to captured location)
  //   1100ms map fades fully behind orbital
  //   1300ms overlay clears, orbital HUD active

  function transitionToOrbital() {
    if (_transitioning) return;
    var orbital = SBE.OrbitalMode;
    if (!orbital) {
      console.error('[WOS Transition] SBE.OrbitalMode is not registered — OrbitalModeController.js may have failed to load. Reverting transport to flight.');
      try { var tcdNull = SBE.TraversalControlDeck; if (tcdNull && tcdNull.selectTransport) tcdNull.selectTransport('flight'); } catch (e) {}
      return;
    }
    if (orbital.isActive && orbital.isActive()) return;

    // Gate: map must be visually ready
    var coord = SBE.WosStartupCoordinator;
    if (coord && coord.isMapVisuallyReady && !coord.isMapVisuallyReady()) {
      console.warn('[WOS Transition] Orbital blocked: map is not visually ready');
      try { var tcdNotReady = SBE.TraversalControlDeck; if (tcdNotReady && tcdNotReady.selectTransport) tcdNotReady.selectTransport('flight'); } catch (e) {}
      return;
    }

    _transitioning = true;

    // 0ms: capture map context before any visual change
    var context = null;
    try {
      var omc = SBE.OrbitalMapContext;
      if (omc) {
        var mvr = SBE.MapboxViewportRuntime;
        var map = mvr && (mvr.map || (mvr.getMap && mvr.getMap()));
        var tcd0 = SBE.TraversalControlDeck;
        var transportState = tcd0 && tcd0.getState ? tcd0.getState() : null;
        context = omc.capture(map, transportState);
      }
    } catch (e) {
      console.warn('[WOS Transition] Map context capture failed:', e);
    }

    var ov  = _getOverlay();
    var atm = _getAtmBridge();

    // 0ms: show overlay at 0, begin subtle dark ramp
    ov.style.transition  = 'background 300ms ease-in-out';
    ov.style.display     = 'block';
    ov.style.background  = 'rgba(2,6,14,0)';
    _reflow(ov);
    ov.style.background  = 'rgba(2,6,14,0.35)';

    // 100ms: map lift — zoom out + tilt up
    _delay(100, function () {
      try {
        var mvr2 = SBE.MapboxViewportRuntime;
        var map2 = mvr2 && (mvr2.map || (mvr2.getMap && mvr2.getMap()));
        if (map2 && map2.easeTo) {
          map2.easeTo({
            zoom:     Math.max(map2.getZoom() - 2.5, 6),
            pitch:    Math.min((map2.getPitch() || 30) + 15, 60),
            duration: 800,
            easing:   function (t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
          });
        }
      } catch (e) {}
    });

    // 300ms: HUD travel state, dim
    _delay(300, function () {
      document.body.classList.add('wos-travel-state');
      _setMapDim(0.45);
    });

    // 500ms: atmosphere veil
    _delay(500, function () {
      atm.style.display    = 'block';
      atm.style.opacity    = '0';
      _reflow(atm);
      atm.style.background = 'radial-gradient(ellipse at 50% 55%, rgba(10,40,100,0.12) 0%, rgba(4,16,48,0.28) 55%, rgba(2,6,22,0.50) 100%)';
      atm.style.transition = 'opacity 350ms ease-in-out';
      atm.style.opacity    = '0.85';
      _setMapDim(0.72);
    });

    // 750ms: pre-build scene for abstract submodes only
    _delay(750, function () {
      try {
        // Only pre-build Three.js scene for non-earth submodes
        var submode = orbital._submode || 'earth';
        if (submode !== 'earth' && orbital._buildScene) orbital._buildScene();
      } catch (e) {}
    });

    // 900ms: globe receives context and orients
    _delay(900, function () {
      try {
        if (orbital.enterFromMapContext) {
          orbital.enterFromMapContext(context, 'earth');
        } else if (orbital.enter) {
          orbital.enter();
        }
      } catch (e) {
        console.error('[WOS Transition] Orbital entry failed — reverting UI to flight:', e);
        restoreMapVisualState();
        _transitioning = false;
        // Revert transport deck so UI matches OrbitalEarthMode.isActive() === false
        try {
          var tcdFail = SBE.TraversalControlDeck;
          if (tcdFail && tcdFail.selectTransport) tcdFail.selectTransport('flight');
        } catch (e2) {}
        return;
      }
      // Verify entry actually armed _active — if enter() returned without throwing but
      // _active is still false (e.g. setup guard exited early), treat as a failure.
      var earthMode2 = SBE.OrbitalEarthMode;
      if (earthMode2 && earthMode2.isActive && !earthMode2.isActive()) {
        console.error('[WOS Transition] OrbitalEarthMode.enter() returned but isActive()===false — entry aborted, reverting UI');
        restoreMapVisualState();
        _transitioning = false;
        try {
          var tcdAbort = SBE.TraversalControlDeck;
          if (tcdAbort && tcdAbort.selectTransport) tcdAbort.selectTransport('flight');
        } catch (e3) {}
        return;
      }

      // 1050ms: begin atm bridge fade — globe is active, reveal it sooner
      _delay(150, function () {
        atm.style.transition = 'opacity 300ms ease-in-out';
        atm.style.opacity    = '0';
      });

      // 1100ms: clear map dim and overlay background
      _delay(200, function () {
        _setMapDim(0);
        ov.style.transition = 'background 350ms ease-in-out';
        ov.style.background = 'rgba(2,6,14,0)';
      });

      // 1450ms: hide bridge and overlay, clear travel state
      _delay(550, function () {
        ov.style.display  = 'none';
        atm.style.display = 'none';
        document.body.classList.remove('wos-travel-state');
        _transitioning = false;
      });
    });
  }

  // ── Orbital → Map (1000ms return) ────────────────────────────────────────────
  //
  //   0ms    dim orbital atmosphere
  //   150ms  dim orbital, reveal map behind
  //   350ms  map fade back in
  //   650ms  restore map camera to previous context
  //   900ms  hide orbital canvas
  //   1000ms restore Flight transport state

  function transitionToMap() {
    if (_transitioning) return;
    var orbital = SBE.OrbitalMode;
    if (!orbital) return;
    if (orbital.isActive && !orbital.isActive()) { restoreMapVisualState(); return; }

    _transitioning = true;

    // Grab last captured context to restore camera
    var lastCtx = null;
    try {
      var omc2 = SBE.OrbitalMapContext;
      if (omc2 && omc2.getLastContext) lastCtx = omc2.getLastContext();
    } catch (e) {}

    var ov  = _getOverlay();
    var atm = _getAtmBridge();

    // 0ms: dim orbital atmosphere
    if (orbital.setEffectState) {
      var cur = orbital.getEffectState ? orbital.getEffectState() : {};
      orbital.setEffectState({
        bloomIntensity:      Math.max(0, (cur.bloomIntensity || 0.12) * 0.4),
        atmosphereIntensity: Math.max(0, (cur.atmosphereIntensity || 0.22) * 0.5)
      });
    }

    // 0ms: show overlay
    ov.style.transition  = 'background 250ms ease-in-out';
    ov.style.display     = 'block';
    ov.style.background  = 'rgba(2,6,14,0)';
    _reflow(ov);
    ov.style.background  = 'rgba(2,6,14,0.38)';

    // 150ms: dim orbital, begin revealing map
    _delay(150, function () {
      _setMapDim(0.5);
    });

    // 350ms: restore map camera — prefer OrbitalEarthMode saved state, fallback to OrbitalMapContext
    _delay(350, function () {
      try {
        var earthMode2 = SBE.OrbitalEarthMode;
        var mvr3 = SBE.MapboxViewportRuntime;
        var map3 = mvr3 && (mvr3.map || (mvr3.getMap && mvr3.getMap()));
        if (earthMode2 && earthMode2.restoreMapCameraState) {
          earthMode2.restoreMapCameraState(map3);
        } else if (map3 && lastCtx) {
          map3.easeTo({
            center:   [lastCtx.centerLngLat.lng, lastCtx.centerLngLat.lat],
            zoom:     lastCtx.zoom,
            bearing:  lastCtx.bearing,
            pitch:    lastCtx.pitch,
            duration: 600
          });
        }
      } catch (e) {}
      _setMapDim(0.25);
    });

    // 650ms: hide orbital canvas
    _delay(650, function () {
      if (orbital.exit) orbital.exit();
      atm.style.display = 'none';
      atm.style.opacity = '0';
    });

    // 900ms: full map restore
    _delay(900, function () {
      restoreMapVisualState();

      ov.style.display    = 'block';
      ov.style.transition = 'background 200ms ease-in-out';
      ov.style.background = 'rgba(2,6,14,0)';
      _delay(200, function () { ov.style.display = 'none'; });
    });

    // 1000ms: restore Flight transport
    _delay(1000, function () {
      var tcd2 = SBE.TraversalControlDeck;
      if (tcd2 && tcd2.selectTransport) {
        try { tcd2.selectTransport('flight'); } catch (e) {}
      }
    });
  }

  function isTransitioning() { return _transitioning; }

  // ── Transition cleanup diagnostic ─────────────────────────────────────────────

  function getTransitionCleanupReport() {
    function _q(sel) { try { return document.querySelector(sel); } catch(e) { return null; } }
    function _cs(el) { try { return el ? global.getComputedStyle(el) : null; } catch(e) { return null; } }
    function _csVal(el, prop) { var cs = _cs(el); return cs ? cs[prop] : null; }

    var mapEl          = _q('.mapboxgl-map') || document.getElementById('mapbox-viewport');
    var canvasContEl   = _q('.mapboxgl-canvas-container');
    var canvasEl       = _q('.mapboxgl-canvas');
    var ovEl           = document.getElementById('wos-transition-overlay');
    var ovCs           = _cs(ovEl);

    var bodyClasses = [];
    try { bodyClasses = Array.prototype.slice.call(document.body.classList); } catch(e) {}

    var moonClasses = ['wos-moon-active','wos-moon-orbit-active','wos-moon-surface-active'];
    var presClasses = ['wos-presentation-card','wos-presentation-website','wos-presentation-canvas',
                       'wos-presentation-kinetic_fish','wos-presentation-extracted_theme'];

    var moonActive = moonClasses.filter(function(c) { return document.body.classList.contains(c); });
    var presActive = presClasses.filter(function(c) { return document.body.classList.contains(c); });

    var tcd = SBE.TraversalControlDeck;
    var tcdState = tcd && tcd.getState ? tcd.getState() : null;
    var selectedTransport = tcdState ? tcdState.transport : null;

    var earthMode = SBE.OrbitalEarthMode;
    var orbMode   = SBE.OrbitalMode;

    var map = null;
    try { var mvr = SBE.MapboxViewportRuntime; map = mvr && (mvr.map || (mvr.getMap && mvr.getMap())); } catch(e) {}
    var proj = null;
    try { proj = map && map.getProjection ? map.getProjection() : null; } catch(e) {}

    var report = {
      timestamp:   null, // stamped by caller if needed
      transitioning: _transitioning,
      bodyClasses: bodyClasses,
      map: {
        containerOpacity:       _csVal(mapEl, 'opacity'),
        containerFilter:        _csVal(mapEl, 'filter'),
        containerDisplay:       _csVal(mapEl, 'display'),
        containerVisibility:    _csVal(mapEl, 'visibility'),
        canvasContOpacity:      _csVal(canvasContEl, 'opacity'),
        canvasContFilter:       _csVal(canvasContEl, 'filter'),
        canvasContVisibility:   _csVal(canvasContEl, 'visibility'),
        canvasOpacity:          _csVal(canvasEl, 'opacity'),
        canvasFilter:           _csVal(canvasEl, 'filter'),
        canvasVisibility:       _csVal(canvasEl, 'visibility'),
        projection:             proj ? (proj.name || proj.type || String(proj)) : null,
        zoom:             map && map.getZoom    ? +map.getZoom().toFixed(3)    : null,
        pitch:            map && map.getPitch   ? +map.getPitch().toFixed(1)   : null,
        bearing:          map && map.getBearing ? +map.getBearing().toFixed(1) : null,
        center:           map && map.getCenter  ? { lng: +map.getCenter().lng.toFixed(4), lat: +map.getCenter().lat.toFixed(4) } : null
      },
      transitionOverlay: {
        exists:        !!ovEl,
        display:       ovCs ? ovCs.display       : null,
        visibility:    ovCs ? ovCs.visibility    : null,
        opacity:       ovCs ? parseFloat(ovCs.opacity) : null,
        pointerEvents: ovCs ? ovCs.pointerEvents : null
      },
      orbital: {
        orbitalActive:          !!(orbMode && orbMode.isActive && orbMode.isActive()),
        earthActive:            !!(earthMode && earthMode.isActive && earthMode.isActive()),
        cameraPreset:           earthMode && earthMode.getCameraPreset ? earthMode.getCameraPreset() : null,
        savedCameraStateExists: !!(earthMode && earthMode._savedMapCamera)
      },
      transport: {
        selectedTransport: selectedTransport,
        orbitalSelected:   selectedTransport === 'orbital',
        flightSelected:    selectedTransport === 'flight'
      },
      leaks: {
        moonClassesActive:        moonActive,
        presentationClassesActive: presActive,
        legacyVisualizerActive:   !!(orbMode && orbMode.isActive && orbMode.isActive() &&
                                     earthMode && !earthMode.isActive())
      }
    };

    var blockers = [];
    if (document.body.classList.contains('wos-orbital-active') && !report.orbital.orbitalActive)
      blockers.push('wos-orbital-active stuck on body (Orbital not active)');
    if (document.body.classList.contains('wos-orbital-earth-active') && !report.orbital.earthActive)
      blockers.push('wos-orbital-earth-active stuck on body (OrbitalEarthMode not active)');
    if (document.body.classList.contains('wos-travel-state'))
      blockers.push('wos-travel-state stuck on body');
    if (document.body.classList.contains('wos-transition-active'))
      blockers.push('wos-transition-active stuck on body');
    if (document.body.classList.contains('wos-map-dimmed'))
      blockers.push('wos-map-dimmed stuck on body');
    if (report.transitionOverlay.opacity > 0.02 && report.transitionOverlay.display !== 'none')
      blockers.push('transition overlay still visible (opacity: ' + report.transitionOverlay.opacity + ')');
    var mapFi = report.map.containerFilter;
    if (mapFi && mapFi !== 'none' && !report.orbital.earthActive)
      blockers.push('map container filter not cleared after exit: ' + mapFi);
    var canvasFi = report.map.canvasFilter;
    if (canvasFi && canvasFi !== 'none' && !report.orbital.earthActive)
      blockers.push('canvas filter not cleared after exit: ' + canvasFi);
    if (moonActive.length) blockers.push('moon classes leaked: ' + moonActive.join(', '));
    if (presActive.length) blockers.push('presentation classes leaked: ' + presActive.join(', '));

    report.passed  = blockers.length === 0;
    report.blockers = blockers;

    if (report.passed) {
      console.info('[WOS Transition] CLEANUP REPORT — PASSED', report);
    } else {
      console.warn('[WOS Transition] CLEANUP REPORT — BLOCKERS FOUND', report);
    }
    return report;
  }

  // ── Named wrappers per spec API ───────────────────────────────────────────────

  function transitionToOrbitalEarth(opts) {
    // opts.cameraPreset is noted but camera preset is applied inside OrbitalEarthMode.enter()
    transitionToOrbital();
  }

  function transitionFromOrbitalEarth() {
    transitionToMap();
  }

  SBE.WosModeTransitionController = Object.freeze({
    transitionToOrbital:       transitionToOrbital,
    transitionToMap:           transitionToMap,
    transitionToOrbitalEarth:  transitionToOrbitalEarth,
    transitionFromOrbitalEarth: transitionFromOrbitalEarth,
    restoreMapVisualState:     restoreMapVisualState,
    isTransitioning:            isTransitioning,
    getTransitionCleanupReport: getTransitionCleanupReport
  });

  // Run restoreMapVisualState on boot to clear any stuck state from a previous session
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { restoreMapVisualState(); });
  } else {
    restoreMapVisualState();
  }

})(window);
