// ── VehicleVisualRegistry v1.0.0 ──────────────────────────────────────────────
// 0601C_WOS_WorldSpaceVehicleVisualIdentity_v1.0.0
// Status: active
// Classification: presentation-registry
//
// Single source of truth for world-space vehicle APPEARANCE.
// No vehicle-specific colours or decals may be hardcoded in mesh builders —
// they must resolve through SBE.VehicleVisualRegistry.resolve(actorType, variant).
//
// Doctrine:
//   Simulation owns truth (position/heading/speed/route/lifecycle).
//   Visual layer owns identity (silhouette/colour/glass/roof/decal).
//   Identity is derived ENTIRELY from actorType + variant.
//
// Colour keys per profile:
//   body    — main bodywork
//   roof    — cabin / roof panel
//   glass   — windshield + windows
//   accent  — headlight/taillight/trim/sign cue
//   cargo   — (trucks) cargo box panel
//   graffiti— (trucks) boolean: apply stylised decal panels
//   sign    — (taxi)   boolean: roof sign cue
//   beltline— (taxi)   boolean: dark beltline stripe
//
// Placement: wall/systems/render/vehicleVisualRegistry.js
// Load: BEFORE worldSpaceVehicleLayer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Canonical registry. Hex strings; resolver converts to 0x ints on demand.
  var REGISTRY = {
    hero_car: {
      sedan_red:   { body: '#cf3434', roof: '#9c2424', glass: '#2b2f36', accent: '#f4d35e' },
      sedan_dark:  { body: '#3a4250', roof: '#2a313c', glass: '#1b1e23', accent: '#f4d35e' },
    },
    traffic_car: {
      taxi_yellow: { body: '#e7c400', roof: '#c9a800', glass: '#2b2f36', accent: '#111111', sign: true, beltline: true },
      sedan_dark:  { body: '#30343b', roof: '#25292f', glass: '#1b1e23', accent: '#8892a0' },
      sedan_light: { body: '#c4c8cc', roof: '#a8abaf', glass: '#2b2f36', accent: '#525860' },
    },
    box_truck: {
      clean_white:           { body: '#f4f4f4', cargo: '#e6e6e6', roof: '#5a6068', glass: '#2b2f36', accent: '#c0c4c8' },
      weathered:             { body: '#cdc9c1', cargo: '#bdb9b1', roof: '#565a55', glass: '#2b2f36', accent: '#9a968e' },
      sticker_graffiti_test: { body: '#f4f4f4', cargo: '#e6e6e6', roof: '#5a6068', glass: '#2b2f36', accent: '#c0c4c8', graffiti: true },
    },
  };

  // Default profiles per actorType when a variant is unknown.
  var DEFAULTS = {
    hero_car:    { body: '#cf3434', roof: '#9c2424', glass: '#2b2f36', accent: '#f4d35e' },
    traffic_car: { body: '#566173', roof: '#3f4856', glass: '#2b2f36', accent: '#8892a0' },
    box_truck:   { body: '#e8e8e8', cargo: '#d8d8d8', roof: '#5a6068', glass: '#2b2f36', accent: '#b8bcc0' },
    _fallback:   { body: '#8899aa', roof: '#556677', glass: '#2b2f36', accent: '#ffd34d' },
  };

  function _hexToInt(hex) {
    if (typeof hex !== 'string') return null;
    return parseInt(hex.replace('#', ''), 16);
  }

  // Resolve a visual profile. Returns ints + flags, never null.
  // Lookup order: registry[actorType][variant] → registry scan for variant
  //               → DEFAULTS[actorType] → DEFAULTS._fallback.
  function resolve(actorType, variant) {
    var profile = null;

    if (actorType && REGISTRY[actorType] && REGISTRY[actorType][variant]) {
      profile = REGISTRY[actorType][variant];
    } else if (variant) {
      // Scan other actorTypes for the variant (shared variant names)
      var types = Object.keys(REGISTRY);
      for (var i = 0; i < types.length; i++) {
        if (REGISTRY[types[i]][variant]) { profile = REGISTRY[types[i]][variant]; break; }
      }
    }
    if (!profile) profile = DEFAULTS[actorType] || DEFAULTS._fallback;

    var bodyHexStr = profile.body || DEFAULTS._fallback.body;
    var bodyInt    = _hexToInt(bodyHexStr);

    // Derive side/front/rear/shadow safely when not explicitly authored.
    // side  = body darkened ~22% (side-face contrast without scene lighting)
    // shadow = near-black, semi-transparent (applied by builder)
    function _darken(intColor, f) {
      var r = (intColor >> 16) & 0xff, g = (intColor >> 8) & 0xff, b = intColor & 0xff;
      return (Math.round(r * f) << 16) | (Math.round(g * f) << 8) | Math.round(b * f);
    }
    var sideInt  = profile.side  != null ? _hexToInt(profile.side)  : _darken(bodyInt, 0.78);
    var frontInt = profile.front != null ? _hexToInt(profile.front) : _darken(bodyInt, 0.88);
    var rearInt  = profile.rear  != null ? _hexToInt(profile.rear)  : _darken(bodyInt, 0.70);

    return {
      bodyHex:   bodyHexStr,
      roofHex:   profile.roof   || profile.body || DEFAULTS._fallback.roof,
      glassHex:  profile.glass  || DEFAULTS._fallback.glass,
      accentHex: profile.accent || DEFAULTS._fallback.accent,
      cargoHex:  profile.cargo  || profile.body || DEFAULTS._fallback.body,
      body:   bodyInt != null ? bodyInt : _hexToInt(DEFAULTS._fallback.body),
      roof:   _hexToInt(profile.roof   || profile.body || DEFAULTS._fallback.roof),
      glass:  _hexToInt(profile.glass  || DEFAULTS._fallback.glass),
      accent: _hexToInt(profile.accent || DEFAULTS._fallback.accent),
      cargo:  _hexToInt(profile.cargo  || profile.body || DEFAULTS._fallback.body),
      side:   sideInt,
      front:  frontInt,
      rear:   rearInt,
      shadow: profile.shadow != null ? _hexToInt(profile.shadow) : 0x000000,
      graffiti: !!profile.graffiti,
      sign:     !!profile.sign,
      beltline: !!profile.beltline,
      // visualProfile id for diagnostics
      visualProfile: (actorType || '?') + ':' + (variant || '?'),
    };
  }

  SBE.VehicleVisualRegistry = Object.freeze({
    VERSION:  VERSION,
    REGISTRY: REGISTRY,
    resolve:  resolve,
  });

  console.log('[VehicleVisualRegistry] v' + VERSION + ' loaded');

})(window);
