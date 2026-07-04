(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── MoonObjectRegistry — declared roles for every Moon Mode visible object ────
  //
  // No object may appear as the Moon, Earth, or a secondary body unless it
  // is explicitly assigned one of these roles.

  var ROLES = Object.freeze({
    EARTH:                 'earth',
    MOON:                  'moon',
    ORIGIN_MARKER:         'origin_marker',
    DESTINATION_MARKER:    'destination_marker',
    ROUTE_ARC:             'route_arc',
    SIGNAL_PARTICLE:       'signal_particle',
    SOCIAL_SIGNAL_CLUSTER: 'social_signal_cluster',   // future
    NEWS_SIGNAL_CLUSTER:   'news_signal_cluster',      // future
    DEBUG_MARKER:          'debug_marker'
  });

  // Moon Mode states (from MoonModeController)
  var STATES = Object.freeze({
    INACTIVE:        'inactive',
    CISLUNAR_TRANSIT: 'cislunar_transit',   // Earth orbit → Moon
    LUNAR_ORBIT:     'lunar_orbit',          // orbiting Moon
    LUNAR_SURFACE:   'lunar_surface'         // standing on Moon
  });

  // Surface sub-views
  var VIEWS = Object.freeze({
    NEAR_SIDE:   'near_side',    // Earth visible in sky (fixed)
    FAR_SIDE:    'far_side',     // Earth not visible
    EARTH_VIEW:  'earth_view',   // primary Earth-gazing orientation
    EARTHRISE:   'earthrise'     // orbital-motion Earthrise event
  });

  // Authenticity levels
  var AUTHENTICITY = Object.freeze({
    A: 'authentic',              // realism-first (default)
    B: 'stylized',               // readable exaggerations allowed
    C: 'abstract'                // artistic / experimental (manual-only)
  });

  SBE.MoonObjectRegistry = Object.freeze({
    ROLES:        ROLES,
    STATES:       STATES,
    VIEWS:        VIEWS,
    AUTHENTICITY: AUTHENTICITY
  });

})(window);
