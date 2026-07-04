(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalAudioReactiveBridge — future-safe stub ─────────────────────────────
  // Returns neutral values when no analyser is connected.
  // Manual controls remain fully functional without this.

  function OrbitalAudioReactiveBridge(opts) {
    opts = opts || {};
    this._provider = opts.analyserProvider || null;
    this._neutral  = Object.freeze({ bass: 0, mids: 0, highs: 0, energy: 0, transient: 0 });
  }

  OrbitalAudioReactiveBridge.prototype.getAudioFeatures = function () {
    if (!this._provider) return this._neutral;
    try {
      var f = this._provider.getFeatures();
      return {
        bass:      isFinite(f.bass)      ? Math.max(0, Math.min(1, f.bass))      : 0,
        mids:      isFinite(f.mids)      ? Math.max(0, Math.min(1, f.mids))      : 0,
        highs:     isFinite(f.highs)     ? Math.max(0, Math.min(1, f.highs))     : 0,
        energy:    isFinite(f.energy)    ? Math.max(0, Math.min(1, f.energy))    : 0,
        transient: isFinite(f.transient) ? Math.max(0, Math.min(1, f.transient)) : 0
      };
    } catch (e) {
      return this._neutral;
    }
  };

  OrbitalAudioReactiveBridge.prototype.isConnected = function () {
    return !!this._provider;
  };

  SBE.OrbitalAudioReactiveBridge = OrbitalAudioReactiveBridge;

})(window);
