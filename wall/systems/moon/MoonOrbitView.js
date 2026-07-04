(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── MoonOrbitView — cinematic lunar orbit with Earthrise-capable camera states ─
  //
  // Purpose: orbital view around Moon — approach, departure, Earthrise moments.
  // Earthrise is an orbital event (camera moves over the limb) not a surface view.
  // Phase 1 manages state and HUD framing; rendering is a future extension.

  var CSS_ID     = 'moon-orbit-css';
  var BODY_CLASS = 'wos-moon-orbit-active';

  // Orbital positions (longitude around Moon, 0 = sub-Earth face)
  var ORBIT_POSITIONS = Object.freeze({
    NEAR_SIDE_APEX:  0,     // Earth directly overhead
    EASTERN_LIMB:    85,    // approaching far-side limb — Earth setting
    FAR_SIDE:        180,   // Earth occluded
    WESTERN_LIMB:   -85,    // emerging from far-side — Earthrise zone
    APPROACH:       -150,   // inbound from cislunar transit
    DEPARTURE:       150    // outbound to cislunar transit
  });

  function MoonOrbitView() {
    this._active         = false;
    this._orbitalLng     = ORBIT_POSITIONS.APPROACH;   // degrees around Moon
    this._orbitalLat     = 0;
    this._orbitSpeed     = 0.02;   // degrees per ms — slow cinematic
    this._rafId          = null;
    this._lastTs         = 0;
    this._autoOrbit      = false;
    this._authenticity   = 'authentic';
    this._tokens         = null;
    this._onStateChange  = null;
  }

  MoonOrbitView.prototype.enter = function (opts) {
    opts                = opts || {};
    this._orbitalLng    = opts.orbitalLng    !== undefined ? opts.orbitalLng : ORBIT_POSITIONS.APPROACH;
    this._orbitalLat    = opts.orbitalLat    || 0;
    this._authenticity  = opts.authenticity  || 'authentic';
    this._tokens        = opts.tokens        || (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.getTokens() : null);
    this._onStateChange = opts.onStateChange || null;

    this._injectCSS();
    document.body.classList.add(BODY_CLASS);
    this._active = true;
    this._logState('enter');
    return this.getState();
  };

  MoonOrbitView.prototype.exit = function () {
    if (!this._active) return;
    this.stopAutoOrbit();
    document.body.classList.remove(BODY_CLASS);
    this._active = false;
    this._logState('exit');
  };

  MoonOrbitView.prototype.isActive = function () { return this._active; };

  // Start slow auto-orbit for cinematic effect
  MoonOrbitView.prototype.startAutoOrbit = function (speedDegPerMs) {
    this._orbitSpeed = speedDegPerMs !== undefined ? speedDegPerMs : 0.02;
    this._autoOrbit  = true;
    this._lastTs     = performance.now();
    var self = this;
    function tick(ts) {
      if (!self._autoOrbit || !self._active) return;
      var delta = Math.min(ts - self._lastTs, 100);
      self._lastTs = ts;
      self._orbitalLng = ((self._orbitalLng + self._orbitSpeed * delta) + 360) % 360;
      if (self._orbitalLng > 180) self._orbitalLng -= 360;
      if (self._onStateChange) try { self._onStateChange(self.getState()); } catch (e) {}
      self._rafId = global.requestAnimationFrame(tick);
    }
    this._rafId = global.requestAnimationFrame(tick);
  };

  MoonOrbitView.prototype.stopAutoOrbit = function () {
    this._autoOrbit = false;
    if (this._rafId) { global.cancelAnimationFrame(this._rafId); this._rafId = null; }
  };

  MoonOrbitView.prototype.setOrbitalPosition = function (lngDeg, latDeg) {
    this._orbitalLng = lngDeg;
    this._orbitalLat = latDeg || 0;
    if (this._onStateChange && this._active) {
      try { this._onStateChange(this.getState()); } catch (e) {}
    }
  };

  MoonOrbitView.prototype.getState = function () {
    var mev  = SBE.MoonEarthVisibility;
    var mreg = SBE.MoonObjectRegistry;
    var view = mev ? mev.getSurfaceView(this._orbitalLng, this._orbitalLat, true) : 'earthrise';
    var earthAlpha = mev ? mev.earthVisibilityAlpha(this._orbitalLng) : 1;

    // Earthrise zone: camera is near the limb and moving from far to near
    var isEarthriseZone = Math.abs(this._orbitalLng) > 70 && Math.abs(this._orbitalLng) < 100;

    return {
      active:          this._active,
      orbitalLng:      this._orbitalLng,
      orbitalLat:      this._orbitalLat,
      view:            view,
      earthVisible:    mev ? mev.isEarthVisible(this._orbitalLng) : true,
      earthAlpha:      earthAlpha,
      isEarthriseZone: isEarthriseZone,
      authenticity:    this._authenticity,
      mode:            mreg ? mreg.STATES.LUNAR_ORBIT : 'lunar_orbit'
    };
  };

  MoonOrbitView.prototype._injectCSS = function () {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      'body.' + BODY_CLASS + ' #wos-nav { opacity: 0.30; transition: opacity 600ms; }',
      'body.' + BODY_CLASS + ' .mapboxgl-map { opacity: 0; transition: opacity 1000ms; }'
    ].join('\n');
    document.head.appendChild(s);
  };

  MoonOrbitView.prototype._logState = function (event) {
    var state = this.getState();
    console.info(
      '[WOS Moon/Orbit] ' + event.toUpperCase() + '\n' +
      '  VIEW: ' + state.view + '\n' +
      '  ORBITAL LNG: ' + this._orbitalLng.toFixed(1) + '°\n' +
      '  EARTH VISIBLE: ' + state.earthVisible + ' (alpha ' + state.earthAlpha.toFixed(2) + ')\n' +
      '  EARTHRISE ZONE: ' + state.isEarthriseZone + '\n' +
      '  AUTHENTICITY: ' + this._authenticity
    );
  };

  SBE.MoonOrbitView = new MoonOrbitView();
  SBE.MoonOrbitPositions = ORBIT_POSITIONS;

})(window);
