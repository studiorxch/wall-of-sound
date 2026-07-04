(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── PlayToWosVisualBridge — optional PLAY → WOS signal translation ───────────
  // Reads PLAY state from postMessage heartbeats. Returns no-ops when unavailable.
  // WOS Orbital Mode must work completely without this bridge.

  var _NEUTRAL = Object.freeze({
    hasPlayState:    false,
    isPlaying:       false,
    trackTitle:      '',
    trackArtist:     '',
    playlistTitle:   '',
    flowEnergy:      0,
    sectionEnergy:   0,
    transitionPulse: 0,
    preferredPreset: null
  });

  function PlayToWosVisualBridge(opts) {
    opts = opts || {};
    this._state   = Object.assign({}, _NEUTRAL);
    this._onMsg   = null;
    this._logger  = opts.logger || null;
  }

  PlayToWosVisualBridge.prototype.init = function () {
    var self = this;
    this._onMsg = function (evt) {
      try {
        var d = evt.data;
        if (!d || typeof d !== 'object') return;
        if (d.type === 'wall:heartbeat' && d.payload) {
          var p = d.payload;
          self._state = {
            hasPlayState:    true,
            isPlaying:       p.playbackStatus === 'playing',
            trackTitle:      p.trackTitle      || '',
            trackArtist:     p.trackArtist     || '',
            playlistTitle:   p.playlistTitle   || '',
            flowEnergy:      isFinite(p.flowEnergy)   ? p.flowEnergy   : 0,
            sectionEnergy:   isFinite(p.sectionEnergy) ? p.sectionEnergy : 0,
            transitionPulse: isFinite(p.transitionPulse) ? p.transitionPulse : 0,
            preferredPreset: p.preferredOrbitalPreset || null
          };
        }
      } catch (e) { /* guard */ }
    };
    global.addEventListener('message', this._onMsg);
    if (this._logger) this._logger.log('PlayToWosVisualBridge init');
  };

  PlayToWosVisualBridge.prototype.getVisualSignals = function () {
    return Object.assign({}, this._state);
  };

  PlayToWosVisualBridge.prototype.dispose = function () {
    if (this._onMsg) {
      global.removeEventListener('message', this._onMsg);
      this._onMsg = null;
    }
    this._state = Object.assign({}, _NEUTRAL);
  };

  SBE.PlayToWosVisualBridge = PlayToWosVisualBridge;

})(window);
