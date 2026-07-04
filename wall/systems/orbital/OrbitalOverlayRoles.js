(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── OrbitalOverlayRoles — declared roles for every visible Orbital object ─────
  // Every object rendered in Orbital Earth must declare one of these roles.
  // Unlabeled objects must not appear as moons, planets, or secondary bodies.

  var ROLES = Object.freeze({
    EARTH_MAPBOX_GLOBE:  'earth_mapbox_globe',
    ATMOSPHERE_OVERLAY:  'atmosphere_overlay',
    STYLE_SIGNAL_LINE:   'style_signal_line',
    SCAN_RING:           'scan_ring',
    STAR_PARTICLE:       'star_particle',
    ORIGIN_MARKER:       'origin_marker',
    DESTINATION_MARKER:  'destination_marker',
    ROUTE_ARC:           'route_arc',
    DEBUG_MARKER:        'debug_marker',
    FUTURE_MOON:         'future_moon'
  });

  // Submodes inside Orbital transport
  var SUBMODES = Object.freeze({
    EARTH:       'earth',        // Mapbox globe — default entry
    SIGNAL:      'signal',       // style-preserving data/audio overlay
    ATMOSPHERE:  'atmosphere',   // stronger space/HUD listening state
    VISUALIZER:  'visualizer',   // abstract Three.js audio environment
    PORTAL:      'portal',       // experimental manual-only
    MOON_PREP:   'moon_prep'     // future Earth-to-Moon staging
  });

  SBE.OrbitalOverlayRoles = Object.freeze({
    ROLES:    ROLES,
    SUBMODES: SUBMODES
  });

})(window);
