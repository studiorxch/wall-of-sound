// ── ActorVisualRegistry v1.0.0 ────────────────────────────────────────────────
// 0603A_WOS_TruthInfrastructureActorAuthority_v1.0.0
// Status: active | Classification: actor-authority (presentation mapping)
//
// Maps actor TYPES (and later identities) to render PROFILES, so feed runtimes
// never hardcode visuals. Reuses SBE.ColorRegistry / SBE.GlyphRegistry when
// present; falls back safely otherwise. Load AFTER actorTypes.js.
//
// NOTE: `shape` is the semantic render shape; `wslShape`/`variant` are the
// concrete WorldSpaceVehicleLayer mesh inputs (presentation only — no feed truth).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var T = SBE.ActorTypes || {};

  // Profiles keyed by actorType.
  var _profiles = {};

  function _def(p) { _profiles[p.actorType] = p; return p; }

  _def({ visualId: 'mta_bus_default',   actorType: T.VEHICLE_BUS || 'vehicle.bus',
         renderer: 'worldSpaceVehicleLayer', shape: 'box_truck', wslShape: 'box_truck', variant: 'clean_white',
         paletteRef: 'transit.bus.mta', glyphRef: 'transit.bus', scale: 1.9, detailTier: 'auto',
         depthPolicy: 'road', tags: ['truth', 'transit'] });
  _def({ visualId: 'dot_utility_default', actorType: T.VEHICLE_UTILITY || 'vehicle.utility',
         renderer: 'worldSpaceVehicleLayer', shape: 'box_truck', wslShape: 'box_truck', variant: 'sticker_graffiti_test',
         paletteRef: 'civic.dot.hazard', glyphRef: 'civic.utility', scale: 1.9, detailTier: 'auto',
         depthPolicy: 'road', tags: ['truth', 'civic'] });
  _def({ visualId: 'synthetic_vehicle_default', actorType: T.VEHICLE_SYNTHETIC || 'vehicle.synthetic',
         renderer: 'worldSpaceVehicleLayer', shape: 'traffic_car', wslShape: 'traffic_car', variant: 'sedan_dark',
         paletteRef: 'traffic.muted', glyphRef: 'traffic.car', scale: 1.75, detailTier: 'auto',
         depthPolicy: 'road', tags: ['synthetic'] });
  _def({ visualId: 'citibike_vehicle_default', actorType: T.BIKE_VEHICLE || 'bike.vehicle',
         renderer: 'worldSpaceVehicleLayer', shape: 'traffic_car', wslShape: 'traffic_car', variant: 'sedan_light',
         paletteRef: 'micro.citibike.blue', glyphRef: 'micro.bike', scale: 0.75, detailTier: 'auto',
         depthPolicy: 'road', tags: ['truth', 'micromobility'] });
  _def({ visualId: 'citibike_station_default', actorType: T.BIKE_STATION || 'bike.station',
         renderer: 'worldSpaceVehicleLayer', shape: 'prop', wslShape: 'traffic_car', variant: 'sedan_light',
         paletteRef: 'micro.citibike.dock', glyphRef: 'micro.dock', scale: 1.0, detailTier: 'low',
         depthPolicy: 'road', tags: ['truth', 'station'] });
  _def({ visualId: 'subway_train_default', actorType: T.TRANSIT_TRAIN || 'transit.train',
         renderer: 'worldSpaceVehicleLayer', shape: 'box_truck', wslShape: 'box_truck', variant: 'clean_white',
         paletteRef: 'transit.subway.route', glyphRef: 'transit.train', scale: 2.2, detailTier: 'auto',
         depthPolicy: 'road', tags: ['truth', 'transit'] });
  _def({ visualId: 'civic_incident_default', actorType: T.CIVIC_INCIDENT || 'civic.incident',
         renderer: 'worldSpaceVehicleLayer', shape: 'prop', wslShape: 'traffic_car', variant: 'taxi_yellow',
         paletteRef: 'civic.alert.hazard', glyphRef: 'civic.alert', scale: 1.0, detailTier: 'low',
         depthPolicy: 'road', tags: ['truth', 'civic'] });
  _def({ visualId: 'world_prop_default', actorType: T.WORLD_PROP || 'world.prop',
         renderer: 'worldSpaceVehicleLayer', shape: 'prop', wslShape: 'traffic_car', variant: 'sedan_dark',
         paletteRef: 'world.prop', glyphRef: 'world.prop', scale: 1.0, detailTier: 'low',
         depthPolicy: 'road', tags: ['authored'] });

  var _fallback = {
    visualId: 'fallback_default', actorType: 'unknown',
    renderer: 'worldSpaceVehicleLayer', shape: 'traffic_car', wslShape: 'traffic_car', variant: 'sedan_dark',
    paletteRef: 'traffic.muted', glyphRef: 'traffic.car', scale: 1.5, detailTier: 'auto',
    depthPolicy: 'road', tags: ['fallback'],
  };

  // Safe optional reuse of existing libraries (never throws if absent).
  function _resolvePalette(ref) {
    try {
      if (SBE.ColorRegistry && typeof SBE.ColorRegistry.resolve === 'function') return SBE.ColorRegistry.resolve(ref);
      if (SBE.ColorRegistry && typeof SBE.ColorRegistry.get === 'function') return SBE.ColorRegistry.get(ref);
    } catch (e) {}
    return null;
  }
  function _resolveGlyph(ref) {
    try {
      if (SBE.GlyphRegistry && typeof SBE.GlyphRegistry.resolve === 'function') return SBE.GlyphRegistry.resolve(ref);
      if (SBE.GlyphRegistry && typeof SBE.GlyphRegistry.get === 'function') return SBE.GlyphRegistry.get(ref);
    } catch (e) {}
    return null;
  }

  // getVisualProfile(actor) — accepts an actor/update with .actorType (or a string).
  function getVisualProfile(actor) {
    var type = (typeof actor === 'string') ? actor : (actor && actor.actorType);
    var base = _profiles[type] || _fallback;
    // Shallow clone + attach resolved (optional) palette/glyph without mutating base.
    var out = {};
    for (var k in base) { if (base.hasOwnProperty(k)) out[k] = base[k]; }
    out.palette = _resolvePalette(base.paletteRef);   // may be null — safe
    out.glyph   = _resolveGlyph(base.glyphRef);        // may be null — safe
    return out;
  }
  function registerVisualProfile(profile) {
    if (!profile || !profile.actorType) return false;
    _profiles[profile.actorType] = profile;
    return true;
  }
  function listVisualProfiles() {
    return Object.keys(_profiles).map(function (k) { return _profiles[k]; });
  }

  SBE.ActorVisualRegistry = Object.freeze({
    VERSION:               VERSION,
    getVisualProfile:      getVisualProfile,
    registerVisualProfile: registerVisualProfile,
    listVisualProfiles:    listVisualProfiles,
  });

  console.log('[ActorVisualRegistry] v' + VERSION + ' loaded — ' + Object.keys(_profiles).length + ' profiles');
})(window);
