// ── HarborSectorAuthority v1.0.0 ─────────────────────────────────────────────
// 0528D_WOS_HarborSectorAuthority_v1.0.0
// Status: active
// Classification: geography-authority
//
// Purpose:
//   Defines the first canonical WOS hero harbor sector: Brooklyn waterfront,
//   Lower Manhattan, Statue corridor, nearby islands, ferry-bound areas, and
//   Brooklyn Army Terminal context.
//
//   This authority owns geographic truth for the NYC harbor composition layer.
//   Renderers read it to understand what geography matters, at what zoom, and
//   at what altitude band.  Nothing in this module renders pixels.
//
// Principle:
//   The harbor is not a boat layer.
//   The harbor is a geographic composition layer.
//
// Authority:
//   OWNS: sector bounds, anchor zones, ferry corridors, LOD rules, hero targets
//   READS: camera zoom, SBE.AltitudeWorldState (band only)
//   WRITES: SBE.HarborSectorState (read-only snapshot)
//   MUST NOT MUTATE: AircraftRuntime, AISRuntime, maritime state, Mapbox style
//
// Placement: wall/systems/geography/harborSectorAuthority.js
// Load: BEFORE renderers that consume sector context, BEFORE main.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Sector Bounds ─────────────────────────────────────────────────────────────

  var NYC_HARBOR_BOUNDS = Object.freeze({
    west:  -74.085,
    south:  40.600,
    east:  -73.930,
    north:  40.735,
  });

  // ── Anchor Zones ──────────────────────────────────────────────────────────────

  var HARBOR_ANCHOR_ZONES = Object.freeze([
    Object.freeze({
      id:               'brooklyn_army_terminal',
      label:            'Brooklyn Army Terminal',
      category:         'industrial_waterfront',
      lat:               40.6456,
      lng:              -74.0247,
      radiusM:           900,
      priority:          5,
      visibleAtZoomMin:  9.5,
      visibleAtZoomMax: 17,
      cinematicWeight:   1.0,
    }),
    Object.freeze({
      id:               'sunset_park_piers',
      label:            'Sunset Park Piers',
      category:         'industrial_waterfront',
      lat:               40.6545,
      lng:              -74.0182,
      radiusM:           1100,
      priority:          5,
      visibleAtZoomMin:  9.5,
      visibleAtZoomMax: 17,
      cinematicWeight:   0.95,
    }),
    Object.freeze({
      id:               'red_hook_waterfront',
      label:            'Red Hook Waterfront',
      category:         'industrial_waterfront',
      lat:               40.6760,
      lng:              -74.0123,
      radiusM:           1200,
      priority:          4,
      visibleAtZoomMin:  9.5,
      visibleAtZoomMax: 17,
      cinematicWeight:   0.85,
    }),
    Object.freeze({
      id:               'governors_island',
      label:            'Governors Island',
      category:         'island',
      lat:               40.6895,
      lng:              -74.0168,
      radiusM:           900,
      priority:          5,
      visibleAtZoomMin:  8.5,
      visibleAtZoomMax: 17,
      cinematicWeight:   0.9,
    }),
    Object.freeze({
      id:               'statue_of_liberty',
      label:            'Statue of Liberty',
      category:         'landmark',
      lat:               40.6892,
      lng:              -74.0445,
      radiusM:           600,
      priority:          5,
      visibleAtZoomMin:  8.5,
      visibleAtZoomMax: 17,
      cinematicWeight:   1.0,
    }),
    Object.freeze({
      id:               'ellis_island',
      label:            'Ellis Island',
      category:         'island',
      lat:               40.6995,
      lng:              -74.0396,
      radiusM:           650,
      priority:          4,
      visibleAtZoomMin:  8.5,
      visibleAtZoomMax: 17,
      cinematicWeight:   0.75,
    }),
    Object.freeze({
      id:               'lower_manhattan_skyline',
      label:            'Lower Manhattan Skyline',
      category:         'skyline_context',
      lat:               40.7060,
      lng:              -74.0115,
      radiusM:           1400,
      priority:          5,
      visibleAtZoomMin:  8.5,
      visibleAtZoomMax: 17,
      cinematicWeight:   1.0,
    }),
    Object.freeze({
      id:               'battery_park_ferry_context',
      label:            'Battery Park Ferry Context',
      category:         'ferry_terminal',
      lat:               40.7015,
      lng:              -74.0156,
      radiusM:           700,
      priority:          5,
      visibleAtZoomMin: 10,
      visibleAtZoomMax: 17,
      cinematicWeight:   0.9,
    }),
    Object.freeze({
      id:               'verrazzano_context',
      label:            'Verrazzano Bridge Context',
      category:         'bridge_context',
      lat:               40.6066,
      lng:              -74.0447,
      radiusM:           2200,
      priority:          4,
      visibleAtZoomMin:  7.5,
      visibleAtZoomMax: 14.5,
      cinematicWeight:   0.85,
    }),
    Object.freeze({
      id:               'brooklyn_bridge_context',
      label:            'Brooklyn Bridge Context',
      category:         'bridge_context',
      lat:               40.7061,
      lng:              -73.9969,
      radiusM:           1100,
      priority:          4,
      visibleAtZoomMin:  8.5,
      visibleAtZoomMax: 16,
      cinematicWeight:   0.8,
    }),
  ]);

  // Index by id for O(1) lookup
  var _anchorIndex = {};
  for (var _ai = 0; _ai < HARBOR_ANCHOR_ZONES.length; _ai++) {
    _anchorIndex[HARBOR_ANCHOR_ZONES[_ai].id] = HARBOR_ANCHOR_ZONES[_ai];
  }

  // ── Ferry Corridors ───────────────────────────────────────────────────────────

  var FERRY_CORRIDORS = Object.freeze([
    Object.freeze({
      id:                   'battery_to_statue_liberty',
      label:                'Battery Park → Liberty Island',
      points: Object.freeze([
        Object.freeze({ lat: 40.7015, lng: -74.0156 }),
        Object.freeze({ lat: 40.6950, lng: -74.0300 }),
        Object.freeze({ lat: 40.6892, lng: -74.0445 }),
      ]),
      priority:              5,
      renderHint:           'tourist',
      expectedVesselClasses: Object.freeze(['ferry', 'passenger']),
    }),
    Object.freeze({
      id:                   'battery_to_governors',
      label:                'Battery Park → Governors Island',
      points: Object.freeze([
        Object.freeze({ lat: 40.7015, lng: -74.0156 }),
        Object.freeze({ lat: 40.6956, lng: -74.0155 }),
        Object.freeze({ lat: 40.6895, lng: -74.0168 }),
      ]),
      priority:              5,
      renderHint:           'primary',
      expectedVesselClasses: Object.freeze(['ferry']),
    }),
    Object.freeze({
      id:                   'red_hook_to_governors',
      label:                'Red Hook → Governors Island',
      points: Object.freeze([
        Object.freeze({ lat: 40.6760, lng: -74.0123 }),
        Object.freeze({ lat: 40.6830, lng: -74.0150 }),
        Object.freeze({ lat: 40.6895, lng: -74.0168 }),
      ]),
      priority:              4,
      renderHint:           'secondary',
      expectedVesselClasses: Object.freeze(['ferry', 'passenger']),
    }),
    Object.freeze({
      id:                   'sunset_park_to_lower_manhattan',
      label:                'Sunset Park → Lower Manhattan',
      points: Object.freeze([
        Object.freeze({ lat: 40.6456, lng: -74.0247 }),
        Object.freeze({ lat: 40.6650, lng: -74.0220 }),
        Object.freeze({ lat: 40.7015, lng: -74.0156 }),
      ]),
      priority:              5,
      renderHint:           'primary',
      expectedVesselClasses: Object.freeze(['ferry']),
    }),
  ]);

  // ── Hero Geometry Targets ────────────────────────────────────────────────────

  var HERO_GEOMETRY_TARGETS = Object.freeze([
    'shoreline_polygons',
    'pier_outlines',
    'ferry_terminal_footprints',
    'industrial_waterfront_blocks',
    'lower_manhattan_skyline_blocks',
    'governors_island_outline',
    'ellis_island_outline',
    'liberty_island_outline',
    'statue_marker',
    'bridge_context_lines',
  ]);

  var DEFERRED_BAKED_GEOMETRY = Object.freeze([
    'building_meshes',
    'bridge_meshes',
    'crane_silhouettes',
    'airport_terminal_meshes',
    'container_yard_blocks',
    'night_window_emissive_masks',
  ]);

  // ── Sector LOD Rules ──────────────────────────────────────────────────────────

  var HARBOR_SECTOR_LOD = Object.freeze([
    Object.freeze({
      zoomMin:            7,
      zoomMax:            10,
      cameraBand:        'high_cruise',
      shorelineDetail:   'coarse',
      landmarkDetail:    'marker',
      ferryCorridorDetail:'line',
      buildingDetail:    'none',
    }),
    Object.freeze({
      zoomMin:            10,
      zoomMax:            12.5,
      cameraBand:        'mid_climb',
      shorelineDetail:   'standard',
      landmarkDetail:    'silhouette',
      ferryCorridorDetail:'animated_hint',
      buildingDetail:    'mapbox',
    }),
    Object.freeze({
      zoomMin:            12.5,
      zoomMax:            15,
      cameraBand:        'low_climb',
      shorelineDetail:   'hero',
      landmarkDetail:    'silhouette',
      ferryCorridorDetail:'route_band',
      buildingDetail:    'mapbox',
    }),
    Object.freeze({
      zoomMin:            15,
      zoomMax:            18,
      cameraBand:        'ground',
      shorelineDetail:   'hero',
      landmarkDetail:    'hero',
      ferryCorridorDetail:'route_band',
      buildingDetail:    'baked_hero',
    }),
  ]);

  // Default LOD (mid-climb) returned when camera data is unavailable
  var _DEFAULT_LOD = HARBOR_SECTOR_LOD[1];

  // ── Canonical Sector Object ───────────────────────────────────────────────────

  var NYC_HARBOR_SECTOR_01 = Object.freeze({
    id:          'nyc_harbor_sector_01',
    label:       'NYC Harbor Sector 01',
    description: 'Brooklyn waterfront + Lower Manhattan + Statue corridor + ferry-bound harbor infrastructure.',
    bounds:       NYC_HARBOR_BOUNDS,
    anchorZones:  HARBOR_ANCHOR_ZONES,
    ferryCorridors: FERRY_CORRIDORS,
    heroGeometryTargets: HERO_GEOMETRY_TARGETS,
    deferredBakedGeometry: DEFERRED_BAKED_GEOMETRY,
    lodRules:     HARBOR_SECTOR_LOD,
    version:      VERSION,
  });

  // ── Haversine Distance (meters) ───────────────────────────────────────────────

  function _distM(lat1, lng1, lat2, lng2) {
    var R  = 6371000;
    var dL = (lat2 - lat1) * Math.PI / 180;
    var dG = (lng2 - lng1) * Math.PI / 180;
    var a  = Math.sin(dL / 2) * Math.sin(dL / 2) +
             Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
             Math.sin(dG / 2) * Math.sin(dG / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Core Functions ────────────────────────────────────────────────────────────

  function getActiveSector() {
    return NYC_HARBOR_SECTOR_01;
  }

  function getSectorBounds() {
    return NYC_HARBOR_BOUNDS;
  }

  function getAnchorZones() {
    return HARBOR_ANCHOR_ZONES;
  }

  function getAnchorZoneById(id) {
    return _anchorIndex[id] || null;
  }

  function getFerryCorridors() {
    return FERRY_CORRIDORS;
  }

  function getHeroGeometryTargets() {
    return HERO_GEOMETRY_TARGETS;
  }

  // resolveSectorLOD(camera, altitudeWorldState)
  // Uses camera.zoom as primary selector, AltitudeWorldState.band as tie-break.

  function resolveSectorLOD(camera, altitudeWorldState) {
    if (!camera || typeof camera.zoom !== 'number') return _DEFAULT_LOD;

    var zoom = camera.zoom;
    var band = (altitudeWorldState && altitudeWorldState.band) || 'ground';

    // Find all LOD rules where zoom falls inside range
    var candidates = [];
    for (var i = 0; i < HARBOR_SECTOR_LOD.length; i++) {
      var rule = HARBOR_SECTOR_LOD[i];
      if (zoom >= rule.zoomMin && zoom < rule.zoomMax) candidates.push(rule);
    }

    if (!candidates.length) {
      // Clamp: below min → first rule, above max → last rule
      return zoom < HARBOR_SECTOR_LOD[0].zoomMin
        ? HARBOR_SECTOR_LOD[0]
        : HARBOR_SECTOR_LOD[HARBOR_SECTOR_LOD.length - 1];
    }

    // If one match, return it; if multiple (overlap edge), prefer band match
    if (candidates.length === 1) return candidates[0];
    for (var ci = 0; ci < candidates.length; ci++) {
      if (candidates[ci].cameraBand === band) return candidates[ci];
    }
    return candidates[0];
  }

  // resolveNearbyAnchorZones(lat, lng, radiusM)
  // Returns anchors within radiusM, sorted: distance asc, priority desc, cinematicWeight desc.

  function resolveNearbyAnchorZones(lat, lng, radiusM) {
    var result = [];
    for (var i = 0; i < HARBOR_ANCHOR_ZONES.length; i++) {
      var a = HARBOR_ANCHOR_ZONES[i];
      var d = _distM(lat, lng, a.lat, a.lng);
      if (d <= radiusM) result.push({ zone: a, distM: d });
    }
    result.sort(function (a, b) {
      if (a.distM !== b.distM) return a.distM - b.distM;
      if (b.zone.priority !== a.zone.priority) return b.zone.priority - a.zone.priority;
      return b.zone.cinematicWeight - a.zone.cinematicWeight;
    });
    return result.map(function (r) { return r.zone; });
  }

  // resolveSectorFocusScore(camera)
  // Returns 0–1: how much the current camera should care about this sector.

  function resolveSectorFocusScore(camera) {
    if (!camera) return 0;

    var lat    = camera.lat  || camera.center && camera.center[1] || 0;
    var lng    = camera.lng  || camera.center && camera.center[0] || 0;
    var zoom   = camera.zoom || 0;
    var b      = NYC_HARBOR_BOUNDS;

    // 1. Inside bounds check
    var inBounds = (lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east);
    var boundScore = inBounds ? 1.0 : 0.0;

    // Partial credit if camera center is within 0.2° of bounds
    if (!inBounds) {
      var dSouth = Math.max(0, b.south - lat);
      var dNorth = Math.max(0, lat - b.north);
      var dWest  = Math.max(0, b.west  - lng);
      var dEast  = Math.max(0, lng - b.east);
      var maxD   = Math.max(dSouth, dNorth, dWest, dEast);
      boundScore = Math.max(0, 1.0 - maxD / 0.2);
    }

    // 2. Zoom score: peak at zoom 10–13, falls off outside
    var zoomScore = 0;
    if (zoom >= 7 && zoom <= 18) {
      if (zoom < 10)       zoomScore = (zoom - 7) / 3;
      else if (zoom <= 13) zoomScore = 1.0;
      else                 zoomScore = Math.max(0, 1.0 - (zoom - 13) / 5);
    }

    // 3. Proximity to highest-priority anchors (top 3 by priority)
    var proxScore = 0;
    if (lat && lng) {
      var p5 = HARBOR_ANCHOR_ZONES.filter(function (a) { return a.priority >= 5; });
      var minD = Infinity;
      for (var i = 0; i < p5.length; i++) {
        var d = _distM(lat, lng, p5[i].lat, p5[i].lng);
        if (d < minD) minD = d;
      }
      // Full score within 2km, zero at 20km
      proxScore = Math.max(0, 1.0 - minD / 20000);
    }

    // 4. Aircraft overlap: if lead aircraft is inside bounds, boost
    var aircraftBoost = 0;
    var art = global.SBE && SBE.AircraftRuntime;
    if (art) {
      var active = art.getActiveAircraft();
      for (var ai = 0; ai < active.length; ai++) {
        var e = active[ai];
        if (e.lat >= b.south && e.lat <= b.north && e.lng >= b.west && e.lng <= b.east) {
          aircraftBoost = 0.15;
          break;
        }
      }
    }

    var score = boundScore * 0.45 + zoomScore * 0.30 + proxScore * 0.20 + aircraftBoost;
    return Math.min(1, Math.max(0, score));
  }

  // isPointInsideSector(lat, lng)

  function isPointInsideSector(lat, lng) {
    var b = NYC_HARBOR_BOUNDS;
    return lat >= b.south && lat <= b.north && lng >= b.west && lng <= b.east;
  }

  // ── State Snapshot ────────────────────────────────────────────────────────────

  function _publishState(camera) {
    var aws = global.SBE && SBE.AltitudeWorldState;
    var lod = resolveSectorLOD(camera, aws);
    var focus = resolveSectorFocusScore(camera);
    SBE.HarborSectorState = {
      sectorId:    NYC_HARBOR_SECTOR_01.id,
      anchorCount: HARBOR_ANCHOR_ZONES.length,
      corridorCount: FERRY_CORRIDORS.length,
      currentLOD:  lod,
      focusScore:  focus,
    };
  }

  // Publish initial state; refresh lazily on each debug/render call
  _publishState(null);

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.HarborSectorAuthority = Object.freeze({
    VERSION:                  VERSION,
    getActiveSector:          getActiveSector,
    getSectorBounds:          getSectorBounds,
    getAnchorZones:           getAnchorZones,
    getAnchorZoneById:        getAnchorZoneById,
    getFerryCorridors:        getFerryCorridors,
    getHeroGeometryTargets:   getHeroGeometryTargets,
    resolveSectorLOD:         resolveSectorLOD,
    resolveNearbyAnchorZones: resolveNearbyAnchorZones,
    resolveSectorFocusScore:  resolveSectorFocusScore,
    isPointInsideSector:      isPointInsideSector,
    // Data constants exposed for debug / renderer access
    ANCHOR_ZONES:             HARBOR_ANCHOR_ZONES,
    FERRY_CORRIDORS:          FERRY_CORRIDORS,
    SECTOR_LOD:               HARBOR_SECTOR_LOD,
    HERO_GEOMETRY_TARGETS:    HERO_GEOMETRY_TARGETS,
    BOUNDS:                   NYC_HARBOR_BOUNDS,
    // State refresh (called by debug renderer each frame)
    refreshState:             _publishState,
  });

  console.log('[HarborSectorAuthority] v' + VERSION + ' loaded — sector: nyc_harbor_sector_01 (' + HARBOR_ANCHOR_ZONES.length + ' anchors, ' + FERRY_CORRIDORS.length + ' corridors)');

})(window);
