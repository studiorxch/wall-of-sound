// ── ActorVisualIdentityAuthority v1.0.0 ───────────────────────────────────────
// 0603I_WOS_ActorVisualIdentityAuthority_v1.0.0
// Status: active | Classification: presentation-authority (actor identity)
//
// Chooses an actor's VISUAL IDENTITY (silhouette/palette/glyph/material/light/
// decal/scale/priority classes) from type + source + state. No geometry, no mesh,
// no truth mutation. Reused by ActorRenderAuthority to enrich render payloads.
// Load AFTER actorVisualRegistry.js + actorRenderAuthority.js; safe if registries
// (Color/Glyph) are absent.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Identity profiles ─────────────────────────────────────────────────────────
  // Exact (actorType + sourceId), then type-only, then category, then generic.
  var PROFILES = [
    // Exact source profiles
    { key: 'citibike.station', actorType: 'bike.station', sourceId: 'citibike_gbfs',
      silhouetteClass: 'station-node', paletteRef: 'citibike.cyan', glyphRef: 'bike.station',
      accentRef: 'availability-state', materialClass: 'flat-emissive', lightClass: 'none',
      decalClass: 'none', scaleClass: 'micro-infrastructure', priorityClass: 'civic-utility',
      readableName: 'Citi Bike Station', tags: ['truth', 'micromobility', 'station'] },
    { key: 'mta.bus', actorType: 'vehicle.bus', sourceId: 'mta_bus_gtfs_rt',
      silhouetteClass: 'city-bus', paletteRef: 'mta.bus.blue-white', glyphRef: 'bus',
      accentRef: 'route-strip', materialClass: 'transit-plastic', lightClass: 'head-tail',
      decalClass: 'route-number', scaleClass: 'large-road-vehicle', priorityClass: 'public-transit',
      readableName: 'MTA Bus', tags: ['truth', 'transit'] },
    { key: 'dot.utility', actorType: 'vehicle.utility', sourceId: 'nyc_dot_events',
      silhouetteClass: 'utility-truck', paletteRef: 'dot.yellow-orange', glyphRef: 'utility',
      accentRef: 'hazard-stripe', materialClass: 'industrial', lightClass: 'amber-flash',
      decalClass: 'agency-mark', scaleClass: 'medium-heavy-vehicle', priorityClass: 'civic-service',
      readableName: 'DOT Utility Vehicle', tags: ['truth', 'civic'] },
    { key: 'synthetic.vehicle', actorType: 'vehicle.synthetic', sourceId: 'synthetic_ambient',
      silhouetteClass: 'ambient-car', paletteRef: 'synthetic.muted-road', glyphRef: 'none',
      accentRef: 'none', materialClass: 'low-priority', lightClass: 'minimal',
      decalClass: 'none', scaleClass: 'small-road-vehicle', priorityClass: 'background',
      readableName: 'Ambient Vehicle', tags: ['synthetic'] },
    { key: 'ais.vessel', actorType: 'marine.vessel', sourceId: 'ais_runtime',
      silhouetteClass: 'vessel-generic', paletteRef: 'marine.truth-blue', glyphRef: 'vessel',
      accentRef: 'heading-wake-minimal', materialClass: 'marine-matte', lightClass: 'navigation',
      decalClass: 'none', scaleClass: 'marine-variable', priorityClass: 'harbor-truth',
      readableName: 'AIS Vessel', tags: ['truth', 'marine'] },
    { key: 'nyc.ferry', actorType: 'marine.ferry', sourceId: 'nyc_ferry_feed',
      silhouetteClass: 'passenger-ferry', paletteRef: 'nyc.ferry.blue-white', glyphRef: 'ferry',
      accentRef: 'terminal-route', materialClass: 'marine-clean', lightClass: 'navigation',
      decalClass: 'route-color', scaleClass: 'large-marine', priorityClass: 'public-transit',
      readableName: 'NYC Ferry', tags: ['truth', 'transit', 'marine'] },
    { key: 'aircraft.truth', actorType: 'aircraft.plane', sourceId: 'aircraft_runtime',
      silhouetteClass: 'aircraft-light', paletteRef: 'aircraft.cool-white', glyphRef: 'aircraft',
      accentRef: 'altitude-tier', materialClass: 'high-altitude', lightClass: 'nav-strobe',
      decalClass: 'none', scaleClass: 'sky-variable', priorityClass: 'airspace-truth',
      readableName: 'Aircraft', tags: ['truth', 'airspace'] },
    { key: 'mta.subway.train', actorType: 'transit.train', sourceId: 'mta_subway_gtfs_rt',
      silhouetteClass: 'subway-train', paletteRef: 'mta.subway.line-color', glyphRef: 'subway',
      accentRef: 'route-bullet', materialClass: 'rail-metal', lightClass: 'interior-strip',
      decalClass: 'route-bullet', scaleClass: 'rail-long', priorityClass: 'public-transit',
      readableName: 'MTA Subway Train', tags: ['truth', 'transit'] },

    // Type-only generics (sourceId omitted)
    { key: 'generic.bus', actorType: 'vehicle.bus', silhouetteClass: 'city-bus', paletteRef: 'transit.generic', glyphRef: 'bus', accentRef: 'none', materialClass: 'transit-plastic', lightClass: 'head-tail', decalClass: 'none', scaleClass: 'large-road-vehicle', priorityClass: 'public-transit', readableName: 'Bus', tags: ['transit'] },
    { key: 'generic.utility', actorType: 'vehicle.utility', silhouetteClass: 'utility-truck', paletteRef: 'civic.generic', glyphRef: 'utility', accentRef: 'hazard-stripe', materialClass: 'industrial', lightClass: 'amber-flash', decalClass: 'none', scaleClass: 'medium-heavy-vehicle', priorityClass: 'civic-service', readableName: 'Utility Vehicle', tags: ['civic'] },
    { key: 'generic.station', actorType: 'bike.station', silhouetteClass: 'station-node', paletteRef: 'station.generic', glyphRef: 'bike.station', accentRef: 'availability-state', materialClass: 'flat-emissive', lightClass: 'none', decalClass: 'none', scaleClass: 'micro-infrastructure', priorityClass: 'civic-utility', readableName: 'Bike Station', tags: ['station'] },
    { key: 'generic.bike', actorType: 'bike.vehicle', silhouetteClass: 'micro-bike', paletteRef: 'micro.generic', glyphRef: 'bike', accentRef: 'none', materialClass: 'flat-emissive', lightClass: 'minimal', decalClass: 'none', scaleClass: 'micro-vehicle', priorityClass: 'micromobility', readableName: 'Bike', tags: ['micromobility'] },
    { key: 'generic.vessel', actorType: 'marine.vessel', silhouetteClass: 'vessel-generic', paletteRef: 'marine.generic', glyphRef: 'vessel', accentRef: 'none', materialClass: 'marine-matte', lightClass: 'navigation', decalClass: 'none', scaleClass: 'marine-variable', priorityClass: 'harbor-truth', readableName: 'Vessel', tags: ['marine'] },
    { key: 'generic.ferry', actorType: 'marine.ferry', silhouetteClass: 'passenger-ferry', paletteRef: 'marine.generic', glyphRef: 'ferry', accentRef: 'none', materialClass: 'marine-clean', lightClass: 'navigation', decalClass: 'none', scaleClass: 'large-marine', priorityClass: 'public-transit', readableName: 'Ferry', tags: ['marine', 'transit'] },
    { key: 'generic.aircraft', actorType: 'aircraft.plane', silhouetteClass: 'aircraft-light', paletteRef: 'aircraft.generic', glyphRef: 'aircraft', accentRef: 'none', materialClass: 'high-altitude', lightClass: 'nav-strobe', decalClass: 'none', scaleClass: 'sky-variable', priorityClass: 'airspace-truth', readableName: 'Aircraft', tags: ['airspace'] },
    { key: 'generic.train', actorType: 'transit.train', silhouetteClass: 'subway-train', paletteRef: 'transit.generic', glyphRef: 'subway', accentRef: 'none', materialClass: 'rail-metal', lightClass: 'interior-strip', decalClass: 'none', scaleClass: 'rail-long', priorityClass: 'public-transit', readableName: 'Train', tags: ['transit'] },
    { key: 'generic.incident', actorType: 'civic.incident', silhouetteClass: 'alert-marker', paletteRef: 'civic.alert', glyphRef: 'alert', accentRef: 'alert-ring', materialClass: 'flat-emissive', lightClass: 'alert-flash', decalClass: 'none', scaleClass: 'marker', priorityClass: 'civic-alert', readableName: 'Incident', tags: ['civic', 'alert'] },
    { key: 'generic.prop', actorType: 'world.prop', silhouetteClass: 'world-prop', paletteRef: 'world.generic', glyphRef: 'none', accentRef: 'none', materialClass: 'flat', lightClass: 'none', decalClass: 'none', scaleClass: 'prop', priorityClass: 'background', readableName: 'Prop', tags: ['authored'] },
  ];

  // Category fallbacks (by ActorTypes.toCategory).
  var CATEGORY_PROFILES = {
    vehicle:  { key: 'generic.vehicle', silhouetteClass: 'ambient-car', paletteRef: 'traffic.generic', glyphRef: 'none', accentRef: 'none', materialClass: 'standard', lightClass: 'minimal', decalClass: 'none', scaleClass: 'small-road-vehicle', priorityClass: 'background', readableName: 'Vehicle', tags: [] },
    bike:     { key: 'generic.micromobility', silhouetteClass: 'micro-bike', paletteRef: 'micro.generic', glyphRef: 'bike', accentRef: 'none', materialClass: 'flat-emissive', lightClass: 'minimal', decalClass: 'none', scaleClass: 'micro-vehicle', priorityClass: 'micromobility', readableName: 'Micromobility', tags: [] },
    marine:   { key: 'generic.marine', silhouetteClass: 'vessel-generic', paletteRef: 'marine.generic', glyphRef: 'vessel', accentRef: 'none', materialClass: 'marine-matte', lightClass: 'navigation', decalClass: 'none', scaleClass: 'marine-variable', priorityClass: 'harbor-truth', readableName: 'Marine', tags: [] },
    aircraft: { key: 'generic.air', silhouetteClass: 'aircraft-light', paletteRef: 'aircraft.generic', glyphRef: 'aircraft', accentRef: 'none', materialClass: 'high-altitude', lightClass: 'nav-strobe', decalClass: 'none', scaleClass: 'sky-variable', priorityClass: 'airspace-truth', readableName: 'Air', tags: [] },
    transit:  { key: 'generic.transit', silhouetteClass: 'subway-train', paletteRef: 'transit.generic', glyphRef: 'subway', accentRef: 'none', materialClass: 'rail-metal', lightClass: 'interior-strip', decalClass: 'none', scaleClass: 'rail-long', priorityClass: 'public-transit', readableName: 'Transit', tags: [] },
    civic:    { key: 'generic.civic', silhouetteClass: 'alert-marker', paletteRef: 'civic.generic', glyphRef: 'alert', accentRef: 'none', materialClass: 'flat-emissive', lightClass: 'none', decalClass: 'none', scaleClass: 'marker', priorityClass: 'civic-service', readableName: 'Civic', tags: [] },
    world:    { key: 'generic.world', silhouetteClass: 'world-prop', paletteRef: 'world.generic', glyphRef: 'none', accentRef: 'none', materialClass: 'flat', lightClass: 'none', decalClass: 'none', scaleClass: 'prop', priorityClass: 'background', readableName: 'World Object', tags: [] },
  };

  var GENERIC_ACTOR = { key: 'generic.actor', silhouetteClass: 'generic-actor', paletteRef: 'actor.generic', glyphRef: 'none', accentRef: 'none', materialClass: 'standard', lightClass: 'none', decalClass: 'none', scaleClass: 'standard', priorityClass: 'background', readableName: 'Actor', tags: [] };

  // Indices.
  var _byKey = {}, _byTypeSource = {}, _byType = {};
  function _index() {
    _byKey = {}; _byTypeSource = {}; _byType = {};
    PROFILES.forEach(function (p) {
      _byKey[p.key] = p;
      if (p.sourceId) _byTypeSource[p.actorType + '|' + p.sourceId] = p;
      else if (!_byType[p.actorType]) _byType[p.actorType] = p;
    });
  }
  _index();

  function _toCategory(type) {
    return (SBE.ActorTypes && typeof SBE.ActorTypes.toCategory === 'function')
      ? SBE.ActorTypes.toCategory(type)
      : (type && type.indexOf('.') > 0 ? type.slice(0, type.indexOf('.')) : (type || 'unknown'));
  }

  var _enabled = true, _debug = false;
  var _stats = { resolved: 0, fallback: 0, exact: 0, typeMatch: 0, categoryFallback: 0, genericFallback: 0, lastResolvedAt: 0, lastError: null };

  // ── resolveIdentity(actor, renderPayload) ───────────────────────────────────
  function resolveIdentity(actor, renderPayload) {
    var type = (actor && actor.actorType) || 'unknown';
    var sourceId = (actor && actor.sourceId) || null;
    var matchLevel, prof;

    if (!_enabled) { prof = GENERIC_ACTOR; matchLevel = 'disabled'; }
    else if (sourceId && _byTypeSource[type + '|' + sourceId]) { prof = _byTypeSource[type + '|' + sourceId]; matchLevel = 'exact'; _stats.exact++; }
    else if (_byType[type]) { prof = _byType[type]; matchLevel = 'actorType'; _stats.typeMatch++; }
    else if (CATEGORY_PROFILES[_toCategory(type)]) { prof = CATEGORY_PROFILES[_toCategory(type)]; matchLevel = 'category'; _stats.categoryFallback++; }
    else { prof = GENERIC_ACTOR; matchLevel = 'generic'; _stats.genericFallback++; }

    _stats.resolved++;
    if (matchLevel !== 'exact' && matchLevel !== 'actorType') _stats.fallback++;
    _stats.lastResolvedAt = Date.now();

    var identity = {
      visualIdentityKey: prof.key,
      silhouetteClass:   prof.silhouetteClass,
      paletteRef:        prof.paletteRef,
      glyphRef:          prof.glyphRef,
      accentRef:         prof.accentRef,
      materialClass:     prof.materialClass,
      lightClass:        prof.lightClass,
      decalClass:        prof.decalClass,
      scaleClass:        prof.scaleClass,
      priorityClass:     prof.priorityClass,
      readableName:      prof.readableName || prof.key,
      tags:              (prof.tags || []).slice(),
      metadata:          { actorType: type, sourceId: sourceId, matchLevel: matchLevel,
                           visualState: (renderPayload && renderPayload.visualState) || null },
    };
    if (actor) actor._visualIdentityKey = prof.key;   // cheap cache (re-derived if type/source changes)
    return identity;
  }

  function registerIdentityProfile(profile) {
    if (!profile || !profile.key || !profile.actorType) return false;
    PROFILES.push(profile); _index();
    return true;
  }
  function getIdentityProfile(key) { return _byKey[key] || null; }
  function listIdentityProfiles() { return PROFILES.map(function (p) { var o = {}; for (var k in p) if (p.hasOwnProperty(k)) o[k] = p[k]; return o; }); }

  function getState() {
    return {
      version: VERSION, enabled: _enabled, debug: _debug,
      profileCount: PROFILES.length,
      resolvedCount: _stats.resolved, fallbackCount: _stats.fallback,
      exactMatchCount: _stats.exact, actorTypeMatchCount: _stats.typeMatch,
      categoryFallbackCount: _stats.categoryFallback, genericFallbackCount: _stats.genericFallback,
      lastResolvedAt: _stats.lastResolvedAt, lastError: _stats.lastError,
    };
  }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.ActorVisualIdentityAuthority = Object.freeze({
    VERSION:                 VERSION,
    resolveIdentity:         resolveIdentity,
    registerIdentityProfile: registerIdentityProfile,
    getIdentityProfile:      getIdentityProfile,
    listIdentityProfiles:    listIdentityProfiles,
    getState:                getState,
    setEnabled:              setEnabled,
    setDebug:                setDebug,
  });

  console.log('[ActorVisualIdentityAuthority] v' + VERSION + ' loaded — ' + PROFILES.length + ' profiles');
})(window);
