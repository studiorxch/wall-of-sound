(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalHudAdapter — HUD label updates for WOS Orbital Mode ───────────────
  // Notifies PLAY parent window so BRCI panel shows orbital state.
  // Does not modify PLAY identity — PLAY is represented as player source only.

  function OrbitalHudAdapter(opts) {
    opts = opts || {};
    this._logger = opts.logger || null;
  }

  OrbitalHudAdapter.prototype.notifyEntered = function (effectState) {
    this._postToPlay({
      type: 'wall:orbital-mode',
      payload: {
        active:      true,
        transport:   'orbital',
        cameraMode:  effectState.cameraMode,
        controlMode: effectState.controlMode,
        preset:      effectState.activePreset
      }
    });
  };

  OrbitalHudAdapter.prototype.notifyExited = function () {
    this._postToPlay({
      type: 'wall:orbital-mode',
      payload: { active: false, transport: 'flight' }
    });
  };

  OrbitalHudAdapter.prototype.notifyStateChanged = function (effectState) {
    this._postToPlay({
      type: 'wall:orbital-state',
      payload: {
        cameraMode:  effectState.cameraMode,
        controlMode: effectState.controlMode,
        preset:      effectState.activePreset,
        frozen:      effectState.rotationSpeed === 0 && effectState.cameraDrift === 0
      }
    });
  };

  OrbitalHudAdapter.prototype._postToPlay = function (msg) {
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage(msg, '*');
      }
    } catch (e) { /* cross-origin guard */ }
  };

  SBE.OrbitalHudAdapter = OrbitalHudAdapter;

})(window);
