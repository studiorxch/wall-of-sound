(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalAudioOverlayController — restrained audio-reactive overlay signals ─
  //
  // Audio activates the map, not replaces it.
  // Overlay signals are applied to OrbitalEarthMode CSS overlay elements.
  //
  // Modes: 'off' | 'manual' | 'reactive'
  // Default: 'off' (safe default — no audio dep required)

  var INTENSITY_LEVELS = Object.freeze({ off: 0, low: 0.25, medium: 0.55, high: 1.0 });

  function OrbitalAudioOverlayController(opts) {
    opts = opts || {};
    this._mode          = 'off';   // 'off' | 'manual' | 'reactive'
    this._intensity     = 'low';   // 'off' | 'low' | 'medium' | 'high'
    this._onSignal      = opts.onSignal || null;  // callback(signals)
    this._analyser      = null;
    this._rafId         = null;
    this._manualSignals = {
      bass:         0,
      lowMids:      0,
      highs:        0,
      trackEnergy:  0,
      transition:   false
    };
  }

  OrbitalAudioOverlayController.prototype.setMode = function (mode) {
    if (mode === this._mode) return;
    this._mode = mode;
    if (mode === 'reactive') {
      this._startReactive();
    } else {
      this._stopReactive();
      if (mode === 'off') this._emit({ bass: 0, lowMids: 0, highs: 0, trackEnergy: 0, transition: false });
    }
  };

  OrbitalAudioOverlayController.prototype.setIntensity = function (level) {
    this._intensity = level;
  };

  OrbitalAudioOverlayController.prototype.setManualSignals = function (signals) {
    this._manualSignals = Object.assign({}, this._manualSignals, signals);
    if (this._mode === 'manual') this._emit(this._scaledSignals(this._manualSignals));
  };

  // Called by PLAY bridge with audio analysis data
  OrbitalAudioOverlayController.prototype.onAudioFrame = function (data) {
    if (this._mode !== 'reactive') return;
    var scale = INTENSITY_LEVELS[this._intensity] || 0.25;
    var signals = {
      bass:        Math.min(1, (data.bass || 0) * scale),
      lowMids:     Math.min(1, (data.lowMids || 0) * scale),
      highs:       Math.min(1, (data.highs || 0) * scale),
      trackEnergy: Math.min(1, (data.trackEnergy || 0) * scale),
      transition:  !!data.transition
    };
    this._emit(signals);
  };

  OrbitalAudioOverlayController.prototype._scaledSignals = function (raw) {
    var scale = INTENSITY_LEVELS[this._intensity] || 0.25;
    return {
      bass:        Math.min(1, (raw.bass || 0) * scale),
      lowMids:     Math.min(1, (raw.lowMids || 0) * scale),
      highs:       Math.min(1, (raw.highs || 0) * scale),
      trackEnergy: Math.min(1, (raw.trackEnergy || 0) * scale),
      transition:  !!raw.transition
    };
  };

  OrbitalAudioOverlayController.prototype._emit = function (signals) {
    if (this._onSignal) {
      try { this._onSignal(signals); } catch (e) {}
    }
  };

  OrbitalAudioOverlayController.prototype._startReactive = function () {
    // Attach to PlayToWosVisualBridge if available
    var bridge = SBE.PlayToWosVisualBridge && SBE.OrbitalMode &&
                 SBE.OrbitalMode._playBridge;
    if (bridge) {
      // PlayBridge getVisualSignals() returns snapshot — poll on rAF
      var self = this;
      function poll() {
        if (self._mode !== 'reactive') return;
        try {
          var sigs = bridge.getVisualSignals ? bridge.getVisualSignals() : {};
          self.onAudioFrame(sigs);
        } catch (e) {}
        self._rafId = global.requestAnimationFrame(poll);
      }
      this._rafId = global.requestAnimationFrame(poll);
    }
  };

  OrbitalAudioOverlayController.prototype._stopReactive = function () {
    if (this._rafId) { global.cancelAnimationFrame(this._rafId); this._rafId = null; }
  };

  OrbitalAudioOverlayController.prototype.dispose = function () {
    this._stopReactive();
    this._onSignal = null;
  };

  SBE.OrbitalAudioOverlayController = OrbitalAudioOverlayController;

})(window);
