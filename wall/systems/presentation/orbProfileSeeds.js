// ── OrbProfileSeeds v1.0.0 ────────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
// Status: active | Classification: presentation-data / orb-profile-seeds
//
// Five real, editable starting Orb Profiles — one per archetype, per the
// written spec's "Initial Orb Archetypes" section. Data only, no UI/render
// code. Also exposes buildDefaultsFor(archetype), the baseline a freshly
// created "+ New Orb" profile starts from.
//
// No audio-reactive field exists on any seed here.
//
// Placement: wall/systems/presentation/orbProfileSeeds.js
// Load: AFTER orbProfileRegistry.js. BEFORE orbProfileAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _sharedLighting(overrides) {
    return Object.assign({ ambientIntensity: 0.35, keyIntensity: 1.0, rimIntensity: 0.6 }, overrides || {});
  }
  function _sharedMotion(overrides) {
    return Object.assign({ rotationSpeed: 0.25, idleAmplitude: 0.05, pulseAmount: 0.03 }, overrides || {});
  }
  function _sharedGeometry(overrides) {
    return Object.assign({ scale: 1, segments: 32, deformation: 0 }, overrides || {});
  }
  function _sharedTexture(overrides) {
    return Object.assign({ enabled: false, sourceId: null, mapping: 'uv', scale: 1 }, overrides || {});
  }

  function _baseFields(id, name, archetype, materialOverrides) {
    var now = Date.now();
    return {
      id: id,
      name: name,
      archetype: archetype,
      binding: 'maps',
      geometry: _sharedGeometry(),
      material: Object.assign({
        baseColor: '#4a7dff',
        emissiveColor: '#1a2f66',
        emissiveIntensity: 0.4,
        opacity: 1,
        transparent: false,
        roughness: 0.4,
        metalness: 0.1,
        transmission: 0,
      }, materialOverrides || {}),
      texture: _sharedTexture(),
      lighting: _sharedLighting(),
      motion: _sharedMotion(),
      runtimeStatus: 'ready',
      createdAt: now,
      updatedAt: now,
    };
  }

  function _coreSphereDefaults(id) {
    var p = _baseFields(id, 'Core Sphere', 'core-sphere', {
      baseColor: '#4a7dff', emissiveColor: '#93b4ff', emissiveIntensity: 0.5, roughness: 0.35, metalness: 0.15,
    });
    return p;
  }

  function _glassShellDefaults(id) {
    var p = _baseFields(id, 'Glass Shell', 'glass-shell', {
      baseColor: '#bfe9ff', emissiveColor: '#5ad1ff', emissiveIntensity: 0.3,
      opacity: 0.55, transparent: true, roughness: 0.05, metalness: 0, transmission: 0.85,
    });
    p.containedObject = { enabled: true, primitive: 'sphere', scale: 0.4, color: '#ffd34d' };
    return p;
  }

  function _particleOrbDefaults(id) {
    var p = _baseFields(id, 'Particle Orb', 'particle-orb', {
      baseColor: '#c07bff', emissiveColor: '#e8b8ff', emissiveIntensity: 0.6, roughness: 0.5, metalness: 0,
    });
    p.particles = { enabled: true, count: 500, size: 0.02, spread: 1, speed: 0.5 };
    return p;
  }

  function _nodeClusterDefaults(id) {
    var p = _baseFields(id, 'Node Cluster', 'node-cluster', {
      baseColor: '#ffb347', emissiveColor: '#fff1c2', emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.3,
    });
    p.nodes = { enabled: true, count: 14, connectionDistance: 0.85, lineOpacity: 0.4 };
    return p;
  }

  function _containedWorldDefaults(id) {
    var p = _baseFields(id, 'Contained World', 'contained-world', {
      baseColor: '#8fffd1', emissiveColor: '#c8fff0', emissiveIntensity: 0.25,
      opacity: 0.5, transparent: true, roughness: 0.1, metalness: 0, transmission: 0.8,
    });
    p.containedObject = { enabled: true, primitive: 'sphere', scale: 0.5, color: '#2e7dff' };
    return p;
  }

  var BUILDERS = {
    'core-sphere': _coreSphereDefaults,
    'glass-shell': _glassShellDefaults,
    'particle-orb': _particleOrbDefaults,
    'node-cluster': _nodeClusterDefaults,
    'contained-world': _containedWorldDefaults,
  };

  function buildDefaultsFor(archetype) {
    var builder = BUILDERS[archetype] || BUILDERS['core-sphere'];
    return builder('__template__');
  }

  function buildSeedProfiles() {
    return [
      _coreSphereDefaults('orb-seed-core-sphere'),
      _glassShellDefaults('orb-seed-glass-shell'),
      _particleOrbDefaults('orb-seed-particle-orb'),
      _nodeClusterDefaults('orb-seed-node-cluster'),
      _containedWorldDefaults('orb-seed-contained-world'),
    ];
  }

  SBE.OrbProfileSeeds = Object.freeze({
    VERSION: VERSION,
    buildSeedProfiles: buildSeedProfiles,
    buildDefaultsFor: buildDefaultsFor,
  });

  console.log('[OrbProfileSeeds] v' + VERSION + ' loaded');

})(window);
