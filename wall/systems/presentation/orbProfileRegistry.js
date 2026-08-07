// ── OrbProfileRegistry v1.0.0 ─────────────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
// Status: active | Classification: presentation-authority / orb-profile-registry
//
// Unlike Geographic/Vehicle/Overlay registries — which describe fields of ONE
// live rendered object (the current map style, Hero Car's DOM colors, an
// overlay's live state) — Orb Profiles are self-contained data: each profile
// IS the object description, not a set of values applied to some external
// singleton. So this registry has no "discover from a live object" step; it
// only defines the STATIC field schema (which dot-paths are editable, their
// label/valueKind, and which fields are conditional on archetype), and reads
// current values directly from the profile record itself via dot-path.
//
// No audio-reactive field/schema entry exists anywhere in this file — that
// scope was explicitly excluded from the written spec's data model.
//
// Placement: wall/systems/presentation/orbProfileRegistry.js
// Load: AFTER orbObjectFactory.js. BEFORE orbProfileApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  /**
   * @typedef {Object} OrbFieldRecord
   * @property {string} propId          dot-path into the profile, e.g. "material.baseColor"
   * @property {string} roleLabel
   * @property {"solid"|"opacity"|"boolean"|"number"|"select"} valueKind
   * @property {string} currentValue    always a string (numbers/booleans stringified, matching the existing GeographicFieldEditor contract)
   * @property {string} sourceObject    always "OrbProfile" — there is no external live object to cite
   * @property {string} sourceProperty  same as propId, kept for shape-parity with other registries
   */

  function _get(obj, path) {
    return path.split('.').reduce(function (acc, key) { return acc == null ? undefined : acc[key]; }, obj);
  }

  function _set(obj, path, value) {
    var parts = path.split('.');
    var target = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (target[parts[i]] == null || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
      target = target[parts[i]];
    }
    target[parts[parts.length - 1]] = value;
  }

  function _str(value) {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return String(value);
    return value == null ? '' : String(value);
  }

  var ARCHETYPE_OPTIONS = [
    { value: 'core-sphere', label: 'Core Sphere' },
    { value: 'glass-shell', label: 'Glass Shell' },
    { value: 'particle-orb', label: 'Particle Orb' },
    { value: 'node-cluster', label: 'Node Cluster' },
    { value: 'contained-world', label: 'Contained World' },
  ];
  var BINDING_OPTIONS = [
    { value: 'maps', label: 'MAPS' },
    { value: 'radio', label: 'RADIO' },
    { value: 'shared', label: 'Shared' },
  ];
  var PRIMITIVE_OPTIONS = [
    { value: 'sphere', label: 'Sphere' },
    { value: 'cube', label: 'Cube' },
    { value: 'torus', label: 'Torus' },
    { value: 'none', label: 'None' },
  ];

  // ── Shared fields — every archetype exposes these ─────────────────────────
  // "name" is deliberately NOT a generic field here — renaming has its own
  // dedicated "click title to rename" affordance in the catalog UI (same
  // pattern as the Itinerary editor), never the color-editable field list.
  // It briefly WAS listed here with valueKind "solid", which GeographicField
  // Editor treats as a hex-color field — silently routing a plain-text
  // rename through the color picker. Keep it out permanently.
  var SHARED_FIELDS = [
    { propId: 'archetype',                  roleLabel: 'Type',              valueKind: 'select', options: ARCHETYPE_OPTIONS },
    { propId: 'binding',                    roleLabel: 'Binding',           valueKind: 'select', options: BINDING_OPTIONS },
    { propId: 'geometry.scale',             roleLabel: 'Scale',             valueKind: 'number', min: 0.2, max: 4, step: 0.1 },
    { propId: 'geometry.deformation',       roleLabel: 'Deformation',       valueKind: 'number', min: 0, max: 0.3, step: 0.01 },
    { propId: 'material.baseColor',         roleLabel: 'Base Color',        valueKind: 'solid' },
    { propId: 'material.emissiveColor',     roleLabel: 'Emissive Color',    valueKind: 'solid' },
    { propId: 'material.emissiveIntensity', roleLabel: 'Emissive Intensity', valueKind: 'number', min: 0, max: 3, step: 0.05 },
    { propId: 'material.opacity',           roleLabel: 'Opacity',           valueKind: 'opacity' },
    { propId: 'material.roughness',         roleLabel: 'Roughness',         valueKind: 'number', min: 0, max: 1, step: 0.05 },
    { propId: 'material.metalness',         roleLabel: 'Metalness',         valueKind: 'number', min: 0, max: 1, step: 0.05 },
    { propId: 'lighting.ambientIntensity',  roleLabel: 'Ambient Light',     valueKind: 'number', min: 0, max: 2, step: 0.05 },
    { propId: 'lighting.keyIntensity',      roleLabel: 'Key Light',         valueKind: 'number', min: 0, max: 2, step: 0.05 },
    { propId: 'lighting.rimIntensity',      roleLabel: 'Rim Light',         valueKind: 'number', min: 0, max: 2, step: 0.05 },
    { propId: 'motion.rotationSpeed',       roleLabel: 'Rotation Speed',    valueKind: 'number', min: -2, max: 2, step: 0.05 },
    { propId: 'motion.idleAmplitude',       roleLabel: 'Idle Drift',        valueKind: 'number', min: 0, max: 0.3, step: 0.01 },
    { propId: 'motion.pulseAmount',         roleLabel: 'Pulse Amount',      valueKind: 'number', min: 0, max: 0.3, step: 0.01 },
  ];

  // ── Archetype-conditional fields ──────────────────────────────────────────
  var ARCHETYPE_FIELDS = {
    'core-sphere': [],
    'glass-shell': [
      { propId: 'material.transmission',       roleLabel: 'Transmission',       valueKind: 'number', min: 0, max: 1, step: 0.05 },
      { propId: 'containedObject.enabled',      roleLabel: 'Internal Object',    valueKind: 'boolean' },
      { propId: 'containedObject.primitive',    roleLabel: 'Internal Primitive', valueKind: 'select', options: PRIMITIVE_OPTIONS },
      { propId: 'containedObject.scale',        roleLabel: 'Internal Scale',     valueKind: 'number', min: 0.1, max: 1, step: 0.05 },
      { propId: 'containedObject.color',        roleLabel: 'Internal Color',     valueKind: 'solid' },
    ],
    'particle-orb': [
      { propId: 'particles.enabled', roleLabel: 'Particles Enabled', valueKind: 'boolean' },
      { propId: 'particles.count',   roleLabel: 'Particle Count',    valueKind: 'number', min: 50, max: 3000, step: 50 },
      { propId: 'particles.size',    roleLabel: 'Particle Size',     valueKind: 'number', min: 0.005, max: 0.1, step: 0.005 },
      { propId: 'particles.spread',  roleLabel: 'Spread',            valueKind: 'number', min: 0.2, max: 3, step: 0.1 },
      { propId: 'particles.speed',   roleLabel: 'Movement Speed',    valueKind: 'number', min: 0, max: 3, step: 0.1 },
    ],
    'node-cluster': [
      { propId: 'nodes.enabled',            roleLabel: 'Nodes Enabled',       valueKind: 'boolean' },
      { propId: 'nodes.count',              roleLabel: 'Node Count',          valueKind: 'number', min: 4, max: 40, step: 1 },
      { propId: 'nodes.connectionDistance', roleLabel: 'Connection Distance', valueKind: 'number', min: 0.2, max: 2, step: 0.05 },
      { propId: 'nodes.lineOpacity',        roleLabel: 'Connection Opacity',  valueKind: 'opacity' },
    ],
    'contained-world': [
      { propId: 'material.transmission',    roleLabel: 'Shell Transmission', valueKind: 'number', min: 0, max: 1, step: 0.05 },
      { propId: 'containedObject.enabled',   roleLabel: 'Internal Object',    valueKind: 'boolean' },
      { propId: 'containedObject.primitive', roleLabel: 'Internal Primitive', valueKind: 'select', options: PRIMITIVE_OPTIONS },
      { propId: 'containedObject.scale',     roleLabel: 'Internal Scale',     valueKind: 'number', min: 0.1, max: 1, step: 0.05 },
      { propId: 'containedObject.color',     roleLabel: 'Internal Color',     valueKind: 'solid' },
    ],
  };

  // Only controls genuinely supported by the archetype are ever shown —
  // Creative Interface Doctrine: never expose a field that silently does
  // nothing for the current archetype.
  function schemaFor(archetype) {
    return SHARED_FIELDS.concat(ARCHETYPE_FIELDS[archetype] || []);
  }

  function fieldsForProfile(profile) {
    if (!profile) return [];
    return schemaFor(profile.archetype).map(function (entry) {
      return {
        propId: entry.propId,
        roleLabel: entry.roleLabel,
        valueKind: entry.valueKind,
        currentValue: _str(_get(profile, entry.propId)),
        sourceObject: 'OrbProfile',
        sourceProperty: entry.propId,
        min: entry.min,
        max: entry.max,
        step: entry.step,
        options: entry.options,
      };
    });
  }

  SBE.OrbProfileRegistry = Object.freeze({
    VERSION: VERSION,
    schemaFor: schemaFor,
    fieldsForProfile: fieldsForProfile,
    getPath: _get,
    setPath: _set,
  });

  console.log('[OrbProfileRegistry] v' + VERSION + ' loaded');

})(window);
