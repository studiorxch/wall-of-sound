(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalEffectState — data layer for WOS Orbital Mode ─────────────────────

  var ORBITAL_CONTROL_MODES = Object.freeze({
    PASSIVE: 'passive',
    PERFORM: 'perform',
    AUTO:    'auto'
  });

  var ORBITAL_CAMERA_MODES = Object.freeze({
    LOCK:  'lock',
    DRIFT: 'drift',
    ORBIT: 'orbit',
    DIVE:  'dive'
  });

  var ORBITAL_TEXTURE_MODES = Object.freeze({
    DARK_TERRAIN:   'dark_terrain',
    SIGNAL_GRID:    'signal_grid',
    PARTICLE_EARTH: 'particle_earth',
    ARCHIVE_ORB:    'archive_orb',
    WIREFRAME:      'wireframe'
  });

  function clampIntensity(v) {
    return Math.max(0.0, Math.min(1.0, isFinite(v) ? v : 0.0));
  }

  function createDefaultOrbitalEffectState() {
    return {
      enabled:              false,
      controlMode:          ORBITAL_CONTROL_MODES.PASSIVE,
      cameraMode:           ORBITAL_CAMERA_MODES.DRIFT,
      textureMode:          ORBITAL_TEXTURE_MODES.SIGNAL_GRID,
      rotationSpeed:        0.08,
      cameraDrift:          0.18,
      atmosphereIntensity:  0.22,
      gridIntensity:        0.30,
      signalIntensity:      0.22,
      particleIntensity:    0.10,
      scanRingIntensity:    0.14,
      routeArcIntensity:    0.16,
      bloomIntensity:       0.12,
      // visual sub-group — post-process / texture overlays
      textureNoiseIntensity:   0.00,
      grainIntensity:          0.00,
      glowRadius:              0.14,
      scanlineIntensity:       0.00,
      staticBackgroundEnabled: false,
      trackCardVisible:     true,
      hudSafeMode:          true,
      audioReactive:        false,
      activePreset:         'deep_space_listen'
    };
  }

  function applyPartialState(state, partial) {
    var out = Object.assign({}, state);
    var intensityKeys = [
      'rotationSpeed', 'cameraDrift', 'atmosphereIntensity', 'gridIntensity',
      'signalIntensity', 'particleIntensity', 'scanRingIntensity',
      'routeArcIntensity', 'bloomIntensity',
      'textureNoiseIntensity', 'grainIntensity', 'glowRadius', 'scanlineIntensity'
    ];
    Object.keys(partial).forEach(function (k) {
      if (intensityKeys.indexOf(k) !== -1) {
        out[k] = clampIntensity(partial[k]);
      } else {
        out[k] = partial[k];
      }
    });
    return out;
  }

  SBE.OrbitalEffectState = Object.freeze({
    CONTROL_MODES: ORBITAL_CONTROL_MODES,
    CAMERA_MODES:  ORBITAL_CAMERA_MODES,
    TEXTURE_MODES: ORBITAL_TEXTURE_MODES,
    clampIntensity:                  clampIntensity,
    createDefaultOrbitalEffectState: createDefaultOrbitalEffectState,
    applyPartialState:               applyPartialState
  });

})(window);
