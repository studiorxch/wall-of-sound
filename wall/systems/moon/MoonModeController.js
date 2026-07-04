(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── MoonModeController — WOS Moon Mode top-level state machine ────────────────
  //
  // Transition path (required — no shortcuts):
  //   Orbital Earth → Cislunar Transit → Lunar Orbit → Lunar Surface
  //
  // Forbidden shortcuts:
  //   Map → fake Moon sphere
  //   Map → unrelated Three.js planet
  //   Orbital → Moon directly (must pass through cislunar transit)
  //
  // Authenticity default: Level A (realism-first)

  function MoonModeController() {
    this._state         = 'inactive';
    this._authenticity  = 'authentic';    // 'authentic' | 'stylized' | 'abstract'
    this._mapContext    = null;           // captured before entry
    this._tokens        = null;
    this._transit       = null;           // CislunarTransitController instance
    this._onStateChange = null;
    this._hudState      = null;
  }

  // All Moon body classes — cleared on any exit or blocked entry
  var _MOON_CLASSES = [
    'wos-moon-active',
    'wos-moon-transit-active',
    'wos-moon-orbit-active',
    'wos-moon-surface-active',
    'wos-moon-returning'
  ];

  // ── entry — must come from Orbital Earth ─────────────────────────────────────

  // Public gate entry — used by QA console and external callers
  MoonModeController.prototype.enter = function (opts) {
    return this.enterFromOrbitalEarth(opts);
  };

  MoonModeController.prototype.enterFromOrbitalEarth = function (opts) {
    opts               = opts || {};
    this._mapContext   = opts.mapContext   || (SBE.OrbitalMapContext ? SBE.OrbitalMapContext.getLastContext() : null);
    this._tokens       = opts.tokens       || (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.getTokens() : null);
    this._authenticity = opts.authenticity || 'authentic';

    // Gate: must come from Orbital Earth path
    var earthMode = SBE.OrbitalEarthMode;
    if (!earthMode || !earthMode.isActive || !earthMode.isActive()) {
      console.warn('[WOS Moon] BLOCKED — Orbital Earth inactive');
      return false;
    }

    document.body.classList.add('wos-moon-active');
    this._setState('cislunar_transit');
    this._startCislunarTransit();
    return true;
  };

  // ── state transitions ─────────────────────────────────────────────────────────

  MoonModeController.prototype.enterLunarOrbit = function (opts) {
    if (this._state !== 'cislunar_transit' && this._state !== 'lunar_orbit') {
      console.warn('[WOS Moon] Cannot enter lunar orbit from state: ' + this._state);
      return false;
    }
    if (this._transit) { this._transit.stop(); this._transit = null; }

    var orbitView = SBE.MoonOrbitView;
    if (orbitView && orbitView.enter) {
      orbitView.enter(Object.assign({ authenticity: this._authenticity, tokens: this._tokens }, opts || {}));
    }
    this._setState('lunar_orbit');
    return true;
  };

  MoonModeController.prototype.enterLunarSurface = function (opts) {
    if (this._state !== 'lunar_orbit' && this._state !== 'lunar_surface') {
      console.warn('[WOS Moon] Cannot enter lunar surface from state: ' + this._state);
      return false;
    }
    var orbitView = SBE.MoonOrbitView;
    if (orbitView && orbitView.isActive && orbitView.isActive()) orbitView.exit();

    var surfaceView = SBE.MoonSurfaceView;
    if (surfaceView && surfaceView.enter) {
      surfaceView.enter(Object.assign({ authenticity: this._authenticity, tokens: this._tokens }, opts || {}));
    }
    this._setState('lunar_surface');
    return true;
  };

  MoonModeController.prototype.returnToOrbitalEarth = function () {
    this._cleanupActiveSubmode();
    _MOON_CLASSES.forEach(function (c) { document.body.classList.remove(c); });
    this._setState('inactive');
    console.info('[WOS Moon] RETURN ORBITAL EARTH');
    // Signal the Orbital Earth mode to resume
    var earthMode = SBE.OrbitalEarthMode;
    if (earthMode && earthMode.isActive && !earthMode.isActive()) {
      var ctx = this._mapContext;
      if (earthMode.enter) earthMode.enter(ctx, this._tokens);
    }
  };

  MoonModeController.prototype.exit = function () {
    this._cleanupActiveSubmode();
    _MOON_CLASSES.forEach(function (c) { document.body.classList.remove(c); });
    this._setState('inactive');
  };

  // ── queries ───────────────────────────────────────────────────────────────────

  MoonModeController.prototype.getState = function () {
    var mreg = SBE.MoonObjectRegistry;
    var sm   = SBE.MoonScaleModel;
    return {
      state:          this._state,
      authenticity:   this._authenticity,
      isActive:       this._state !== 'inactive',
      transitState:   this._transit ? this._transit.getState() : null,
      hudFields:      this._buildHudFields(),
      scaleModel:     sm ? { RENDER: sm.RENDER, REAL: sm.REAL } : null
    };
  };

  MoonModeController.prototype.isActive = function () {
    return this._state !== 'inactive';
  };

  MoonModeController.prototype.onStateChange = function (fn) {
    this._onStateChange = fn;
  };

  // ── private ───────────────────────────────────────────────────────────────────

  MoonModeController.prototype._setState = function (newState) {
    var prev = this._state;
    this._state = newState;
    this._emitHud();
    // Named diagnostic lines per spec
    var label = {
      cislunar_transit: 'ENTER TRANSIT',
      lunar_orbit:      'ENTER ORBIT',
      lunar_surface:    'ENTER SURFACE',
      inactive:         'RETURN INACTIVE'
    }[newState] || ('→ ' + newState);
    console.info('[WOS Moon] ' + label + ' (prev: ' + prev + ')');
    if (this._onStateChange) try { this._onStateChange(this.getState()); } catch (e) {}
  };

  MoonModeController.prototype._startCislunarTransit = function () {
    var self = this;
    this._transit = new (SBE.CislunarTransitController)({
      authenticity: this._authenticity,
      speed:        0.0003,   // slow cinematic; auto-play drives this
      onUpdate: function (s) {
        self._emitHud(s);
      },
      onArrive: function () {
        self.enterLunarOrbit();
      }
    });
    this._transit.start(0);
    // Auto-play at cinematic speed (not interactive by default)
    this._transit.autoPlay({ speed: 0.0003 });
  };

  MoonModeController.prototype._cleanupActiveSubmode = function () {
    if (this._transit) { this._transit.stop(); this._transit = null; }
    var orbitView   = SBE.MoonOrbitView;
    var surfaceView = SBE.MoonSurfaceView;
    if (orbitView   && orbitView.isActive   && orbitView.isActive())   orbitView.exit();
    if (surfaceView && surfaceView.isActive && surfaceView.isActive()) surfaceView.exit();
  };

  MoonModeController.prototype._buildHudFields = function () {
    var sm   = SBE.MoonScaleModel;
    var mreg = SBE.MoonObjectRegistry;
    var ts   = this._transit ? this._transit.getState() : null;

    var stateLabel = {
      inactive:         'INACTIVE',
      cislunar_transit: 'TRANSIT',
      lunar_orbit:      'ORBIT',
      lunar_surface:    'SURFACE'
    }[this._state] || this._state.toUpperCase();

    var fields = {
      'MODE':   'MOON',
      'STATE':  stateLabel
    };

    if (ts) {
      fields['PHASE']    = ts.phase ? ts.phase.toUpperCase() : '';
      fields['DISTANCE'] = ts.remainingKm !== null
        ? Math.round(ts.remainingKm).toLocaleString() + ' km to Moon'
        : '';
    }

    // Surface/orbit view label
    var surfaceView = SBE.MoonSurfaceView;
    var orbitView   = SBE.MoonOrbitView;
    if (surfaceView && surfaceView.isActive && surfaceView.isActive()) {
      var ss = surfaceView.getState();
      fields['VIEW']   = (ss.view || '').toUpperCase().replace(/_/g, ' ');
      fields['SIGNAL'] = ss.earthVisible ? 'EARTH VISIBLE' : 'EARTH OCCLUDED';
    } else if (orbitView && orbitView.isActive && orbitView.isActive()) {
      var os = orbitView.getState();
      fields['VIEW']   = (os.view || '').toUpperCase().replace(/_/g, ' ');
      fields['SIGNAL'] = os.isEarthriseZone ? 'EARTHRISE' : (os.earthVisible ? 'EARTH VISIBLE' : 'FAR SIDE');
    }

    fields['SOURCE'] = 'WOS MOON MODE';
    return fields;
  };

  MoonModeController.prototype._emitHud = function (transitState) {
    // Notify the WOS HUD adapter if available
    var hud = SBE.OrbitalMode && SBE.OrbitalMode._hudAdapter;
    if (hud && hud.notifyStateChanged) {
      try { hud.notifyStateChanged({ moonHud: this._buildHudFields() }); } catch (e) {}
    }
  };

  // ── gate report ───────────────────────────────────────────────────────────────

  MoonModeController.prototype.getGateReport = function () {
    var earthMode = SBE.OrbitalEarthMode;
    var tc        = SBE.WosModeTransitionController;
    var pres      = SBE.WosPresentationRouter;

    var orbitalEarthActive     = !!(earthMode && earthMode.isActive && earthMode.isActive());
    var orbitalCleanEarthPassed = false;
    var orbitalCameraPreset    = null;
    if (earthMode) {
      try {
        var cer = earthMode.getCleanEarthReport && earthMode.getCleanEarthReport();
        if (cer) orbitalCleanEarthPassed = !!cer.passed;
        var gfr = earthMode.getGlobeFitReport && earthMode.getGlobeFitReport();
        if (gfr) orbitalCameraPreset = gfr.currentPreset || null;
      } catch (e) {}
    }

    var legacyVisualizerActive  = document.body.classList.contains('wos-orbital-active') &&
                                  !document.body.classList.contains('wos-orbital-earth-active');
    var presentationModeActive  = !!(pres && pres.getCurrentMode && pres.getCurrentMode() !== null);

    var allowedToEnterMoon = orbitalEarthActive;
    var blockedReason      = allowedToEnterMoon ? null : 'Orbital Earth inactive';

    var bodyClasses        = document.body.className;
    var moonClassesActive  = _MOON_CLASSES.filter(function (c) { return document.body.classList.contains(c); });
    var orbitalClassesActive = ['wos-orbital-active','wos-orbital-earth-active'].filter(function (c) {
      return document.body.classList.contains(c);
    });

    var moonClassesInMap          = moonClassesActive.length > 0 && !orbitalEarthActive && this._state === 'inactive';
    var moonClassesInOrbitalEarth = moonClassesActive.length > 0 && orbitalEarthActive  && this._state === 'inactive';
    var legacyDuringMoon          = this._state !== 'inactive' && legacyVisualizerActive;
    var presDuringMoon            = this._state !== 'inactive' && presentationModeActive;

    var blockers = [];
    if (!allowedToEnterMoon && this._state === 'inactive') blockers.push('orbital-earth-inactive');
    if (moonClassesInMap)          blockers.push('moon-classes-leaked-to-map');
    if (moonClassesInOrbitalEarth) blockers.push('moon-classes-leaked-to-orbital-earth');
    if (legacyDuringMoon)          blockers.push('legacy-visualizer-during-moon');
    if (presDuringMoon)            blockers.push('presentation-mode-during-moon');

    return {
      timestamp:             performance.now(),
      moonActive:            this._state !== 'inactive',
      moonState:             this._state,
      orbitalEarthActive:    orbitalEarthActive,
      orbitalCleanEarthPassed: orbitalCleanEarthPassed,
      orbitalCameraPreset:   orbitalCameraPreset,
      legacyVisualizerActive: legacyVisualizerActive,
      presentationModeActive: presentationModeActive,
      allowedToEnterMoon:    allowedToEnterMoon,
      blockedReason:         blockedReason,
      bodyClasses:           bodyClasses,
      moonClassesActive:     moonClassesActive,
      orbitalClassesActive:  orbitalClassesActive,
      returnTarget:          orbitalEarthActive ? 'orbital_earth' : 'map',
      leaks: {
        moonClassesInMap:           moonClassesInMap,
        moonClassesInOrbitalEarth:  moonClassesInOrbitalEarth,
        legacyVisualizerDuringMoon: legacyDuringMoon,
        presentationDuringMoon:     presDuringMoon
      },
      passed:   blockers.length === 0,
      blockers: blockers
    };
  };

  // ── Singleton + QA alias ──────────────────────────────────────────────────────

  SBE.MoonModeController = new MoonModeController();
  SBE.MoonMode            = SBE.MoonModeController;  // QA console alias

})(window);
