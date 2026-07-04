(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalPresetRegistry — stream-safe preset bundles ───────────────────────

  var ORBITAL_PRESETS = Object.freeze({
    map_continuity_orbit: {
      controlMode:             'passive',
      cameraMode:              'drift',
      textureMode:             'signal_grid',
      rotationSpeed:           0.05,
      cameraDrift:             0.10,
      atmosphereIntensity:     0.18,
      gridIntensity:           0.28,
      signalIntensity:         0.14,
      particleIntensity:       0.04,
      scanRingIntensity:       0.06,
      routeArcIntensity:       0.00,
      bloomIntensity:          0.10,
      textureNoiseIntensity:   0.04,
      grainIntensity:          0.02,
      glowRadius:              0.08,
      scanlineIntensity:       0.02,
      staticBackgroundEnabled: false,
      trackCardVisible:        true,
      hudSafeMode:             true,
      audioReactive:           false
    },
    deep_space_listen: {
      controlMode:             'passive',
      cameraMode:              'drift',
      textureMode:             'signal_grid',
      rotationSpeed:           0.06,
      cameraDrift:             0.14,
      atmosphereIntensity:     0.22,
      gridIntensity:           0.16,
      signalIntensity:         0.10,
      particleIntensity:       0.06,
      scanRingIntensity:       0.04,
      routeArcIntensity:       0.00,
      bloomIntensity:          0.12,
      textureNoiseIntensity:   0.06,
      grainIntensity:          0.04,
      glowRadius:              0.10,
      scanlineIntensity:       0.02,
      staticBackgroundEnabled: false,
      trackCardVisible:        true,
      hudSafeMode:             true,
      audioReactive:           false
    },
    signal_earth: {
      controlMode:         'passive',
      cameraMode:          'drift',
      textureMode:         'signal_grid',
      rotationSpeed:       0.09,
      cameraDrift:         0.16,
      atmosphereIntensity: 0.35,
      gridIntensity:       0.52,
      signalIntensity:     0.44,
      particleIntensity:   0.10,
      scanRingIntensity:   0.36,
      routeArcIntensity:   0.40,
      bloomIntensity:      0.24,
      trackCardVisible:    true,
      hudSafeMode:         true,
      audioReactive:       false
    },
    particle_planet: {
      controlMode:         'perform',
      cameraMode:          'orbit',
      textureMode:         'particle_earth',
      rotationSpeed:       0.12,
      cameraDrift:         0.22,
      atmosphereIntensity: 0.58,
      gridIntensity:       0.20,
      signalIntensity:     0.28,
      particleIntensity:   0.55,
      scanRingIntensity:   0.28,
      routeArcIntensity:   0.20,
      bloomIntensity:      0.38,
      trackCardVisible:    true,
      hudSafeMode:         true,
      audioReactive:       false
    },
    archive_orb: {
      controlMode:         'passive',
      cameraMode:          'lock',
      textureMode:         'archive_orb',
      rotationSpeed:       0.03,
      cameraDrift:         0.06,
      atmosphereIntensity: 0.20,
      gridIntensity:       0.08,
      signalIntensity:     0.06,
      particleIntensity:   0.04,
      scanRingIntensity:   0.04,
      routeArcIntensity:   0.00,
      bloomIntensity:      0.10,
      trackCardVisible:    true,
      hudSafeMode:         true,
      audioReactive:       false
    },
    portal_orb: {
      controlMode:             'perform',
      cameraMode:              'orbit',
      textureMode:             'signal_grid',
      rotationSpeed:           0.14,
      cameraDrift:             0.26,
      atmosphereIntensity:     0.68,
      gridIntensity:           0.54,
      signalIntensity:         0.48,
      particleIntensity:       0.36,
      scanRingIntensity:       0.52,
      routeArcIntensity:       0.20,
      bloomIntensity:          0.62,
      textureNoiseIntensity:   0.28,
      grainIntensity:          0.20,
      glowRadius:              0.55,
      scanlineIntensity:       0.18,
      staticBackgroundEnabled: false,
      trackCardVisible:        true,
      hudSafeMode:             false,
      audioReactive:           false
    },
    minimal_dark_sphere: {
      controlMode:             'passive',
      cameraMode:              'lock',
      textureMode:             'signal_grid',
      rotationSpeed:           0.02,
      cameraDrift:             0.00,
      atmosphereIntensity:     0.08,
      gridIntensity:           0.04,
      signalIntensity:         0.02,
      particleIntensity:       0.00,
      scanRingIntensity:       0.00,
      routeArcIntensity:       0.00,
      bloomIntensity:          0.04,
      textureNoiseIntensity:   0.00,
      grainIntensity:          0.00,
      glowRadius:              0.04,
      scanlineIntensity:       0.00,
      staticBackgroundEnabled: false,
      trackCardVisible:        false,
      hudSafeMode:             true,
      audioReactive:           false
    },
    route_transmission: {
      controlMode:         'passive',
      cameraMode:          'drift',
      textureMode:         'signal_grid',
      rotationSpeed:       0.10,
      cameraDrift:         0.10,
      atmosphereIntensity: 0.40,
      gridIntensity:       0.38,
      signalIntensity:     0.48,
      particleIntensity:   0.12,
      scanRingIntensity:   0.42,
      routeArcIntensity:   0.72,
      bloomIntensity:      0.26,
      trackCardVisible:    true,
      hudSafeMode:         true,
      audioReactive:       false
    }
  });

  var PRESET_LABELS = Object.freeze({
    map_continuity_orbit: 'Map Continuity Orbit',
    deep_space_listen:    'Deep Space Listen',
    signal_earth:        'Signal Earth',
    particle_planet:     'Particle Planet',
    archive_orb:         'Archive Orb',
    portal_orb:          'Portal Orb (Experimental)',
    minimal_dark_sphere: 'Minimal Dark Sphere',
    route_transmission:  'Route Transmission'
  });

  // QUARANTINE NOTE (0627F): getPreset() falls back to deep_space_listen for unknown names.
  // This fallback is ONLY used within the Three.js legacy visualizer path (_applyPreset).
  // It is NOT an Earth fallback. OrbitalEarthMode does not call getPreset().
  // If Mapbox Earth fails to initialize, the failure is logged — no fake sphere appears.
  function getPreset(name) {
    return ORBITAL_PRESETS[name] || ORBITAL_PRESETS.deep_space_listen;
  }

  function getPresetLabel(name) {
    return PRESET_LABELS[name] || name;
  }

  function listPresetNames() {
    return Object.keys(ORBITAL_PRESETS);
  }

  SBE.OrbitalPresetRegistry = Object.freeze({
    PRESETS:       ORBITAL_PRESETS,
    LABELS:        PRESET_LABELS,
    getPreset:     getPreset,
    getPresetLabel: getPresetLabel,
    listPresetNames: listPresetNames
  });

})(window);
