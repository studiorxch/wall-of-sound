(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── MoonSurfaceView — listener-oriented lunar surface environment ──────────────
  //
  // Default submode: near-side, Earth visible in sky — contemplative, spacious.
  // Far-side: Earth hidden, maximally isolated.
  // Audio response: restrained — environment activated, not erased.
  //
  // This module manages CSS overlay state for the surface environment.
  // Three.js rendering is a future extension — Phase 1 establishes state logic.

  var CSS_ID    = 'moon-surface-css';
  var BODY_CLASS = 'wos-moon-surface-active';

  function MoonSurfaceView() {
    this._active       = false;
    this._lunarLng     = 0;     // sub-Earth by default (near-side center)
    this._lunarLat     = 0;
    this._authenticity = 'authentic';
    this._view         = null;  // current VIEW token
    this._tokens       = null;
  }

  MoonSurfaceView.prototype.enter = function (opts) {
    opts               = opts || {};
    this._lunarLng     = opts.lunarLng     || 0;
    this._lunarLat     = opts.lunarLat     || 0;
    this._authenticity = opts.authenticity || 'authentic';
    this._tokens       = opts.tokens       || (SBE.WosMapStyleTokens ? SBE.WosMapStyleTokens.getTokens() : null);

    this._view = this._resolveView();
    this._injectCSS();
    document.body.classList.add(BODY_CLASS);
    this._active = true;

    this._logState('enter');
    return this.getState();
  };

  MoonSurfaceView.prototype.exit = function () {
    if (!this._active) return;
    document.body.classList.remove(BODY_CLASS);
    this._active = false;
    this._logState('exit');
  };

  MoonSurfaceView.prototype.isActive = function () { return this._active; };

  MoonSurfaceView.prototype.setSurfacePosition = function (lunarLng, lunarLat) {
    this._lunarLng = lunarLng;
    this._lunarLat = lunarLat;
    if (this._active) {
      this._view = this._resolveView();
      this._logState('position-update');
    }
  };

  MoonSurfaceView.prototype.getState = function () {
    var mev  = SBE.MoonEarthVisibility;
    var mreg = SBE.MoonObjectRegistry;
    var vis  = mev ? mev.earthVisibilityAlpha(this._lunarLng) : 0;
    var pos  = mev ? mev.earthSkyPosition(this._lunarLng, this._lunarLat) : null;
    return {
      active:           this._active,
      lunarLng:         this._lunarLng,
      lunarLat:         this._lunarLat,
      view:             this._view,
      earthVisible:     mev ? mev.isEarthVisible(this._lunarLng) : false,
      earthAlpha:       vis,
      earthSkyPosition: pos,
      authenticity:     this._authenticity,
      mode:             mreg ? mreg.STATES.LUNAR_SURFACE : 'lunar_surface'
    };
  };

  // Audio signal response — restrained
  MoonSurfaceView.prototype.applyAudioSignals = function (signals) {
    if (!this._active) return;
    // Phase 1: no rendering — log signal for future renderer integration
    // Bass → subtle atmosphere pulse (future: adjust atmosphere overlay opacity)
    // Highs → sparse signal shimmer (future: star/signal particle response)
    // Transitions → scan sweep (future: horizon sweep event)
  };

  MoonSurfaceView.prototype._resolveView = function () {
    var mev = SBE.MoonEarthVisibility;
    return mev ? mev.getSurfaceView(this._lunarLng, this._lunarLat, false) : 'near_side';
  };

  MoonSurfaceView.prototype._injectCSS = function () {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID;
    s.textContent = [
      // Surface mode body class — dims all non-Moon HUD elements
      'body.' + BODY_CLASS + ' #wos-nav { opacity: 0.35; transition: opacity 800ms; }',
      'body.' + BODY_CLASS + ' .mapboxgl-map { opacity: 0; transition: opacity 1200ms; }'
    ].join('\n');
    document.head.appendChild(s);
  };

  MoonSurfaceView.prototype._logState = function (event) {
    var state = this.getState();
    console.info(
      '[WOS Moon/Surface] ' + event.toUpperCase() + '\n' +
      '  VIEW: ' + state.view + '\n' +
      '  POSITION: ' + this._lunarLng.toFixed(1) + '°lng, ' + this._lunarLat.toFixed(1) + '°lat\n' +
      '  EARTH VISIBLE: ' + state.earthVisible + ' (alpha ' + state.earthAlpha.toFixed(2) + ')\n' +
      (state.earthSkyPosition
        ? ('  EARTH SKY: az ' + state.earthSkyPosition.azimuthDeg.toFixed(1) + '° el ' + state.earthSkyPosition.elevationDeg.toFixed(1) + '°\n')
        : '  EARTH SKY: occluded (far side)\n') +
      '  AUTHENTICITY: ' + this._authenticity
    );
  };

  SBE.MoonSurfaceView = new MoonSurfaceView();

})(window);
