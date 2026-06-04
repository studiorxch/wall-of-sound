// ── MaritimeEcologicalZones v1.0.0 ───────────────────────────────────────────
// 0523C_WOS_MaritimeSpawnEcology_v1.2.1
// Status: active
// Classification: runtime-authority
//
// Purpose:
//   Defines the five canonical ecological zones and the spatial index
//   infrastructure required to resolve zone membership in O(1) / O(log n).
//
//   Exact geographic bounds are NOT hardcoded here. They are registered at
//   runtime via registerZoneBounds() — sourced from a companion geography
//   artifact (0523C_Zones.geojson or HarborCoverageEnvelope).
//   Implementers must not hardcode unnamed coordinate guesses.
//
//   Zone definitions carry ecology parameters (class distributions, density
//   ranges, corridor/weather/time sensitivity) but contain no position data
//   until bounds are registered.
//
// Spatial index:
//   Grid bucket lookup — each registered bounding box populates grid cells.
//   getZoneForCoordinate() is O(1) average: one hash key, small bucket scan.
//   Polygon-level evaluation happens only during registerZoneBounds() (init path).
//   Hot-loop callers must use getZoneForCoordinate() — never raw polygon scans.
//
// Placement: wall/ecology/maritimeEcologicalZones.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Zone type constants ──────────────────────────────────────────────────────

  var ZONE_INDUSTRIAL_CORRIDOR    = 'INDUSTRIAL_CORRIDOR';
  var ZONE_FERRY_TRANSIT_CORRIDOR = 'FERRY_TRANSIT_CORRIDOR';
  var ZONE_HARBOR_UTILITY         = 'HARBOR_UTILITY_ZONE';
  var ZONE_OPEN_RECREATIONAL      = 'OPEN_RECREATIONAL_WATER';
  var ZONE_STRATEGIC_SECURITY     = 'STRATEGIC_SECURITY_CORRIDOR';

  // ── Spatial grid constants ───────────────────────────────────────────────────
  // Grid cell ~1 km × 1 km at NYC latitudes.
  // Covers roughly 40.0–41.0 lat, -75.0–-73.0 lng (NYC harbor region).
  // Cells outside this envelope return null — not an error, just uncovered water.

  var GRID_CELL_DEG = 0.01;   // degrees per cell (~1.1 km lat, ~0.85 km lng at 40°N)
  var GRID_BASE_LAT = 40.0;
  var GRID_BASE_LNG = -75.0;

  // ── Canonical zone definitions ───────────────────────────────────────────────
  // Five zones from spec §CANONICAL ECOLOGICAL ZONES.
  // corridorAffinity, weatherSensitivity, timeOfDaySensitivity are not in the
  // spec table but are required by the EcologyScore formula — values set here
  // from zone character. They are tuning parameters, not governance parameters.

  var _authoringZones = [
    {
      zoneId:        'industrial_corridor_primary',
      displayLabel:  'Industrial Corridor',
      zoneType:      ZONE_INDUSTRIAL_CORRIDOR,
      geographyRef:  { strategy: 'POLYGON_REF', refId: 'harbor_industrial_primary' },
      dominantClasses:   ['CARGO', 'TANKER', 'INDUSTRIAL', 'TUG', 'SERVICE'],
      secondaryClasses:  ['PASSENGER', 'UNKNOWN'],
      classDistribution: {
        CARGO: 0.32, TANKER: 0.22, INDUSTRIAL: 0.16,
        TUG: 0.16, SERVICE: 0.10, UNKNOWN: 0.04,
      },
      densityRange:     { min: 0, target: 18, max: 42 },
      syntheticCeiling: 12,
      silencePermitted: true,
      corridorAffinity:       0.70,
      weatherSensitivity:     0.30,
      timeOfDaySensitivity:   0.20,
    },
    {
      zoneId:        'ferry_transit_corridor_primary',
      displayLabel:  'Ferry Transit Corridor',
      zoneType:      ZONE_FERRY_TRANSIT_CORRIDOR,
      geographyRef:  { strategy: 'POLYGON_REF', refId: 'harbor_ferry_lanes' },
      dominantClasses:   ['FERRY', 'PASSENGER', 'SERVICE', 'TUG'],
      secondaryClasses:  ['CARGO', 'RECREATIONAL', 'UNKNOWN'],
      classDistribution: {
        FERRY: 0.38, PASSENGER: 0.24, SERVICE: 0.14,
        TUG: 0.10, RECREATIONAL: 0.08, UNKNOWN: 0.06,
      },
      densityRange:     { min: 0, target: 14, max: 30 },
      syntheticCeiling: 8,
      silencePermitted: true,
      corridorAffinity:     0.90,
      weatherSensitivity:   0.40,
      timeOfDaySensitivity: 0.80,
    },
    {
      zoneId:        'harbor_utility_zone_primary',
      displayLabel:  'Harbor Utility Zone',
      zoneType:      ZONE_HARBOR_UTILITY,
      geographyRef:  { strategy: 'POLYGON_REF', refId: 'harbor_utility_primary' },
      dominantClasses:   ['TUG', 'SERVICE', 'INDUSTRIAL'],
      secondaryClasses:  ['CARGO', 'FISHING', 'UNKNOWN'],
      classDistribution: {
        TUG: 0.32, SERVICE: 0.28, INDUSTRIAL: 0.16,
        CARGO: 0.09, FISHING: 0.05, UNKNOWN: 0.10,
      },
      densityRange:     { min: 0, target: 10, max: 24 },
      syntheticCeiling: 6,
      silencePermitted: true,
      corridorAffinity:     0.50,
      weatherSensitivity:   0.20,
      timeOfDaySensitivity: 0.30,
    },
    {
      zoneId:        'open_recreational_water_primary',
      displayLabel:  'Open Recreational Water',
      zoneType:      ZONE_OPEN_RECREATIONAL,
      geographyRef:  { strategy: 'POLYGON_REF', refId: 'harbor_recreational_outer' },
      dominantClasses:   ['RECREATIONAL', 'FISHING', 'SERVICE'],
      secondaryClasses:  ['PASSENGER', 'UNKNOWN'],
      classDistribution: {
        RECREATIONAL: 0.42, FISHING: 0.28, SERVICE: 0.12,
        PASSENGER: 0.08, UNKNOWN: 0.10,
      },
      densityRange:     { min: 0, target: 9, max: 28 },
      syntheticCeiling: 10,
      silencePermitted: true,
      corridorAffinity:     0.20,
      weatherSensitivity:   0.70,
      timeOfDaySensitivity: 0.60,
    },
    {
      zoneId:        'strategic_security_corridor_primary',
      displayLabel:  'Strategic Security Corridor',
      zoneType:      ZONE_STRATEGIC_SECURITY,
      geographyRef:  { strategy: 'POLYGON_REF', refId: 'harbor_security_zones' },
      dominantClasses:   ['MILITARY', 'SERVICE', 'TUG'],
      secondaryClasses:  ['UNKNOWN'],
      classDistribution: {
        MILITARY: 0.18, SERVICE: 0.34, TUG: 0.22, UNKNOWN: 0.26,
      },
      densityRange:     { min: 0, target: 4, max: 12 },
      syntheticCeiling: 2,
      silencePermitted: true,
      corridorAffinity:     0.80,
      weatherSensitivity:   0.10,
      timeOfDaySensitivity: 0.20,
    },
  ];

  // ── Zone registry ────────────────────────────────────────────────────────────

  var _zones  = {};
  var _bounds = {};  // zoneId → { minLat, maxLat, minLng, maxLng }
  var _grid   = {};  // "row:col" → [zoneId, ...]

  for (var _zi = 0; _zi < _authoringZones.length; _zi++) {
    var _z = _authoringZones[_zi];
    _zones[_z.zoneId] = _z;
  }

  // ── Grid helpers ─────────────────────────────────────────────────────────────

  function _latToRow(lat) {
    return Math.floor((lat - GRID_BASE_LAT) / GRID_CELL_DEG);
  }

  function _lngToCol(lng) {
    return Math.floor((lng - GRID_BASE_LNG) / GRID_CELL_DEG);
  }

  function _gridKey(row, col) {
    return row + ':' + col;
  }

  function _indexBounds(zoneId, minLat, maxLat, minLng, maxLng) {
    var rowMin = _latToRow(minLat);
    var rowMax = _latToRow(maxLat);
    var colMin = _lngToCol(minLng);
    var colMax = _lngToCol(maxLng);
    for (var r = rowMin; r <= rowMax; r++) {
      for (var c = colMin; c <= colMax; c++) {
        var key = _gridKey(r, c);
        if (!_grid[key]) _grid[key] = [];
        if (_grid[key].indexOf(zoneId) < 0) _grid[key].push(zoneId);
      }
    }
  }

  // ── Public: register geographic bounds for a zone ────────────────────────────
  // Must be called before zone lookup is meaningful for this zone.
  //
  // Bounding box form:
  //   { minLat, maxLat, minLng, maxLng }
  //
  // Anchor+radius form (ANCHOR_RADIUS strategy):
  //   { lat, lng, radiusDeg }
  //   → expands to a square bounding box ± radiusDeg in each axis
  //
  // GeoJSON polygon evaluation for precise containment is out of scope here.
  // The grid bucket provides sub-1km resolution adequate for spawn decisions.

  function registerZoneBounds(zoneId, boundsInput) {
    if (!_zones[zoneId]) {
      console.warn('[MaritimeEcologicalZones] registerZoneBounds — unknown zoneId:', zoneId);
      return false;
    }
    var minLat, maxLat, minLng, maxLng;
    if (boundsInput.radiusDeg != null) {
      minLat = boundsInput.lat - boundsInput.radiusDeg;
      maxLat = boundsInput.lat + boundsInput.radiusDeg;
      minLng = boundsInput.lng - boundsInput.radiusDeg;
      maxLng = boundsInput.lng + boundsInput.radiusDeg;
    } else {
      minLat = boundsInput.minLat;
      maxLat = boundsInput.maxLat;
      minLng = boundsInput.minLng;
      maxLng = boundsInput.maxLng;
    }
    if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) ||
        !Number.isFinite(minLng) || !Number.isFinite(maxLng) ||
        minLat >= maxLat || minLng >= maxLng) {
      console.error('[MaritimeEcologicalZones] registerZoneBounds — invalid bounds for', zoneId, boundsInput);
      return false;
    }
    _bounds[zoneId] = { minLat: minLat, maxLat: maxLat, minLng: minLng, maxLng: maxLng };
    _indexBounds(zoneId, minLat, maxLat, minLng, maxLng);
    console.log('[MaritimeEcologicalZones] zone bounds registered:', zoneId,
      '(', minLat.toFixed(4), '–', maxLat.toFixed(4), 'lat,',
      minLng.toFixed(4), '–', maxLng.toFixed(4), 'lng )');
    return true;
  }

  // ── Public: zone lookup — O(1) average ──────────────────────────────────────
  // Hot-path safe. Callers must NOT perform polygon scans in hot loops.
  // Returns the first matching zone for the coordinate, or null.
  //
  // If multiple zones overlap a cell, priority order is:
  //   SECURITY > FERRY > INDUSTRIAL > UTILITY > RECREATIONAL
  // This matches the zone type priority constants below.

  var _zonePriority = {};
  _zonePriority[ZONE_STRATEGIC_SECURITY]     = 0;
  _zonePriority[ZONE_FERRY_TRANSIT_CORRIDOR] = 1;
  _zonePriority[ZONE_INDUSTRIAL_CORRIDOR]    = 2;
  _zonePriority[ZONE_HARBOR_UTILITY]         = 3;
  _zonePriority[ZONE_OPEN_RECREATIONAL]      = 4;

  function getZoneForCoordinate(lat, lng) {
    var row = _latToRow(lat);
    var col = _lngToCol(lng);
    var bucket = _grid[_gridKey(row, col)];
    if (!bucket || bucket.length === 0) return null;

    var bestZone     = null;
    var bestPriority = 999;
    for (var i = 0; i < bucket.length; i++) {
      var zid = bucket[i];
      var b   = _bounds[zid];
      if (!b) continue;
      if (lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng) {
        var p = _zonePriority[_zones[zid].zoneType];
        if (p == null) p = 99;
        if (p < bestPriority) {
          bestPriority = p;
          bestZone     = _zones[zid];
        }
      }
    }
    return bestZone;
  }

  function getZoneById(zoneId) {
    return _zones[zoneId] || null;
  }

  function getAllZones() {
    return _authoringZones.slice(); // defensive copy
  }

  function getZoneBounds(zoneId) {
    return _bounds[zoneId] || null;
  }

  function hasBounds(zoneId) {
    return !!_bounds[zoneId];
  }

  // ── Debug snapshot ───────────────────────────────────────────────────────────

  function getDebugSnapshot() {
    var registered = Object.keys(_bounds);
    return {
      version:              VERSION,
      zoneCount:            Object.keys(_zones).length,
      registeredBoundsCount: registered.length,
      gridCellCount:        Object.keys(_grid).length,
      zones: _authoringZones.map(function (z) {
        return {
          zoneId:       z.zoneId,
          zoneType:     z.zoneType,
          hasBounds:    !!_bounds[z.zoneId],
          densityRange: z.densityRange,
          syntheticCeiling: z.syntheticCeiling,
        };
      }),
    };
  }

  // ── Exports ──────────────────────────────────────────────────────────────────

  SBE.MaritimeEcologicalZones = {
    registerZoneBounds,
    getZoneForCoordinate,
    getZoneById,
    getAllZones,
    getZoneBounds,
    hasBounds,
    getDebugSnapshot,

    ZONE_TYPE: {
      INDUSTRIAL_CORRIDOR:    ZONE_INDUSTRIAL_CORRIDOR,
      FERRY_TRANSIT_CORRIDOR: ZONE_FERRY_TRANSIT_CORRIDOR,
      HARBOR_UTILITY_ZONE:    ZONE_HARBOR_UTILITY,
      OPEN_RECREATIONAL_WATER: ZONE_OPEN_RECREATIONAL,
      STRATEGIC_SECURITY_CORRIDOR: ZONE_STRATEGIC_SECURITY,
    },

    VERSION: VERSION,
  };

  console.log('[MaritimeEcologicalZones v' + VERSION + '] initialized —',
    Object.keys(_zones).length, 'canonical zones defined, awaiting bounds registration');

})(window);
