(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosRuntimeModeState — runtime mode constants and state factory ────────────

  var WOS_RUNTIME_MODES = Object.freeze({
    MAP:               'map',
    MAP_TO_ORBITAL:    'map_to_orbital',
    ORBITAL:           'orbital',
    ORBITAL_TO_MAP:    'orbital_to_map',
    STATIC_BACKGROUND: 'static_background'
  });

  function createDefaultWosRuntimeModeState() {
    return {
      current:             WOS_RUNTIME_MODES.MAP,
      previous:            null,
      transitionStartedAt: null,
      transitionDurationMs: 600,
      mapReady:            false,
      orbitalReady:        false,
      staticBgCaptured:    false
    };
  }

  // ── WosRuntimeFlags — global feature toggles ─────────────────────────────────
  // Mutable — intentionally not frozen so runtime code can adjust flags.
  SBE.WosRuntimeFlags = {
    showDebugProxyGeometry: false,  // proxy/placeholder meshes hidden by default in map mode
    orbitalAutoEnter:       false,  // orbital must not auto-activate on boot
    verboseTransitions:     false   // extra console logging for mode transitions
  };

  SBE.WosRuntimeModeState = Object.freeze({
    MODES: WOS_RUNTIME_MODES,
    createDefault: createDefaultWosRuntimeModeState
  });

})(window);
