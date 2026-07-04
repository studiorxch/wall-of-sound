// ── BuildingReplacementRuntime v1.9.1 ─────────────────────────────────────────
// 0612C_WOS_ExistingReplacementRuntimeSyncRepair_v1.0.0_BUILD
// Prior: 0610K_WOS_CompoundBuildingAuthority_v1.0.0_BUILD
// Prior: 0610J_WOS_ReplacementBuildingGroupAuthority
// Prior: 0610F_WOS_ReplacementLayerDominance_v1.0.0_BUILD
// Prior: 0610E_WOS_BuildingStyleKit_v1.0.0_BUILD
// Status: active | Classification: world-runtime
// 0612G reclassification:
//   BuildingReplacementRuntime reads the manifest and writes WOS-owned map
//   source/layer output. It is not read-only. It is the canonical Wall
//   replacement actor renderer.
//
// v1.6.0 — Layer dominance: ensures wos-replacement-layer always renders above
//           every building layer. Adds _discoverDominanceLayers(), which scans
//           style layers by type + id pattern, _ensureReplacementLayerDominance()
//           which moves the layer via map.moveLayer(), and _repairDominance() which
//           calls both + triggers BuildingEditProjectionRuntime.apply() to re-apply
//           source suppression. _repairDominance() is wired at end of every _sync()
//           call (covering style-ready, storage-event, and reload paths). Exposes
//           dominanceStatus() (layer index audit + suppression counts) and
//           repairDominance() (full re-sync + layer repair) on the public debug API.
// v1.5.0 — Style kit integration: defers to SBE.BuildingStyleKit for per-archetype
//           procedural geometry when loaded. Adds zoom-based detail tier selection
//           (_getDetailTier: far/mid/near), stores actor.partCount on generation,
//           and exposes geometryStats() debug method returning actorCount,
//           averagePartCount, maxPartCount, archetypeBreakdown.
// v1.4.0 — Geometry alignment: Wall prefers Studio-captured manifest geometry
//           (edit.geometry) over its own querySourceFeatures result. Adds
//           _geometryFromEdit() resolver, geometryAuthority field on actors
//           ('manifest'|'wall-query'|'fallback'), alignment diagnostics in list()
//           (centroidDeltaM, headingDelta), and showFootprints(bool) debug overlay
//           rendering manifest footprint (cyan) vs replacement rectangle (yellow).
// v1.3.0 — Material authority: replacement actors now read as solid world objects.
//           Adds ARCHETYPE_MATERIALS palette (body/roof/accent/beacon/stack/
//           foundation per archetype). Part descriptors carry materialRole.
//           _partsToFeatures emits materialRole + materialColor as GeoJSON
//           feature properties. Layer paint switches to coalesce(materialColor,
//           color) so material overrides take priority while archetype color
//           remains as a safe fallback. Layer opacity raised 0.82 → 0.96 (solid).
//           Adds materials() debug accessor. list() includes materialProfile.
// v1.2.0 — Footprint authority: replacement geometry dimensions sourced from the
//           selected building's actual Mapbox polygon footprint.
//           Adds footprint metric helpers (_extractFootprint, _polygonAreaM2,
//           _boundsForRing, _dimensionsFromBounds, _headingFromLongestEdge,
//           _centroidForRing). Resolves full feature geometry alongside position.
//           Archetype generators receive footprint-derived W/D half-dimensions
//           (with per-archetype occupancy percentages) + heading for orientation.
//           _rectPolygon gains optional heading rotation of corners + offsets.
//           actor.footprint stores { coordinates, centroid, bounds, widthM,
//           depthM, areaM2, heading }. Fallback to fixed bW/bD if unresolvable.
//           list() and status() extended with footprint diagnostics.
// v1.1.0 — Archetype shape kit: multi-part fill-extrusion geometry per archetype.
// v1.0.0 — Validation cube; GeoJSON fill-extrusion; cross-tab storage sync.
//
// Architecture:
//   Manifest   → actor records (_actors)
//   Actors     → Footprint metrics → W/D from building polygon
//   Actors     → Archetype Shape Generator → multi-part Feature[]
//   Features   → Mapbox GeoJSON source  "wos-replacement-markers"
//   Source     → fill-extrusion layer   "wos-replacement-layer"
//
// Authority:
//   READS:   localStorage["wos_building_published"] (0612L: published registry —
//            Wall consumes published state only, never the Studio draft)
//            map.querySourceFeatures() — building geometry
//   WRITES:  Mapbox GeoJSON source/layer (own, non-destructive)
//   MUST NOT: modify composite source, building geometry, replacement manifest
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.9.2';

  var STORAGE_KEY      = 'wos_building_published';   // 0612L publish boundary
  var SOURCE_ID        = 'wos-replacement-markers';
  var LAYER_ID         = 'wos-replacement-layer';
  var LAYER_OPACITY    = 0.96;  // solid world object — raised from 0.82 in v1.3.0
  var DEFAULT_HEIGHT_M = 14;    // fallback when building height is unknown
  var MIN_DIM_M        = 4;     // minimum footprint dimension before fallback

  // ── Debug footprint overlay constants (0610D) ─────────────────────────────────
  var FP_MANIFEST_SOURCE    = 'wos-fp-manifest';
  var FP_MANIFEST_LAYER     = 'wos-fp-manifest-layer';
  var FP_REPLACEMENT_SOURCE = 'wos-fp-replacement';
  var FP_REPLACEMENT_LAYER  = 'wos-fp-replacement-layer';

  // ── Archetype configuration ───────────────────────────────────────────────────
  // bW / bD:  fallback fixed half-width / half-depth when footprint unavailable.
  // fpW/fpD:  footprint occupancy fractions for base element (0–1).
  // heightMul: archetype visual height multiplier.
  // Colors mirrored from mapboxAdapter.js ARCHETYPE_COLORS.
  var ARCHETYPE_CFG = {
    'warehouse':          { color: '#f2a23c', heightMul: 0.40, bW: 13, bD: 8,  fpW: 0.95, fpD: 0.85 },
    'skyscraper':         { color: '#3dd8c5', heightMul: 1.00, bW:  6, bD: 6,  fpW: 0.70, fpD: 0.70 },
    'apartment':          { color: '#a7c7e7', heightMul: 0.60, bW:  9, bD: 8,  fpW: 0.80, fpD: 0.80 },
    'radio-tower':        { color: '#ff4b4b', heightMul: 1.20, bW:  5, bD: 5,  fpW: 0.45, fpD: 0.45 },
    'pagoda':             { color: '#d85cff', heightMul: 0.50, bW:  7, bD: 7,  fpW: 0.80, fpD: 0.80 },
    'civic-block':        { color: '#f5d76e', heightMul: 0.30, bW: 12, bD: 10, fpW: 0.90, fpD: 0.90 },
    'industrial-stack':   { color: '#8d6e63', heightMul: 0.70, bW:  9, bD: 8,  fpW: 0.85, fpD: 0.85 },
    'custom-placeholder': { color: '#ffffff', heightMul: 0.50, bW:  8, bD: 8,  fpW: 0.75, fpD: 0.75 },
  };

  // ── Archetype material palette ────────────────────────────────────────────────
  // Per-archetype material colors by role. Roles: body, roof, accent, beacon,
  // stack, foundation. Used by _partsToFeatures to populate materialColor on each
  // GeoJSON feature property. The layer paint uses coalesce(materialColor, color)
  // so archetype color remains a safe fallback if a role is missing.
  var ARCHETYPE_MATERIALS = {
    'warehouse': {
      body:       '#d8c6a1',   // warm concrete
      roof:       '#c97a2e',   // burnt orange/rust
      accent:     '#7a5c34',   // dark timber trim
      foundation: '#b0a08a',   // weathered base
    },
    'skyscraper': {
      body:       '#9fb6c8',   // cool glass blue-gray
      roof:       '#3dd8c5',   // teal crown (matches archetype cue)
      accent:     '#d9eef7',   // pale highlight / reflective band
      foundation: '#7a94a8',   // darker podium base
    },
    'apartment': {
      body:       '#8fafc8',   // muted residential blue-gray
      roof:       '#4a5a6a',   // dark roof slab
      accent:     '#c0d8f0',   // lighter bay window band
      foundation: '#6e8299',   // ground-floor base
    },
    'radio-tower': {
      body:       '#5a4a4a',   // dark infrastructure base
      stack:      '#e03030',   // red shaft (matches archetype cue)
      beacon:     '#ffec40',   // bright warning-light cap
      foundation: '#3a2e2e',   // concrete footing
    },
    'pagoda': {
      body:       '#b84bd8',   // warm magenta wall (near archetype cue)
      roof:       '#7a2a9c',   // deeper tier color
      accent:     '#f0c0ff',   // pale eave highlight
      foundation: '#8c3ab0',   // lower tier base
    },
    'civic-block': {
      body:       '#d8ceb4',   // limestone / cream stone
      roof:       '#c8a830',   // gold dome (near archetype cue)
      accent:     '#f0e8cc',   // pale portico trim
      foundation: '#b0a880',   // darker plinth
    },
    'industrial-stack': {
      body:       '#9c7b4c',   // industrial ochre/earth
      stack:      '#5c3520',   // dark rust smokestack
      accent:     '#c0956a',   // weathered cap flare
      foundation: '#7a5c38',   // reinforced base
    },
    'custom-placeholder': {
      body:       '#e8e8e8',   // off-white
      roof:       '#c8c8c8',   // light gray roof
      accent:     '#f8f8f8',   // near-white accent
      foundation: '#b8b8b8',   // base gray
    },
  };

  // _materialColor — resolves a role's color from the archetype palette.
  // Falls back to archetype cfg color if role is undefined.
  function _materialColor(archetype, role) {
    var palette = ARCHETYPE_MATERIALS[archetype] || ARCHETYPE_MATERIALS['custom-placeholder'];
    return palette[role] || null;  // null → coalesce falls through to 'color'
  }

  // Height mode multipliers — must match Studio mapLabView.js HEIGHT_MODES.
  var HEIGHT_MODE_MUL = {
    'inherit': 1.0,
    'low':     0.5,
    'medium':  1.0,
    'tall':    1.5,
    'hero':    2.5,
  };

  // ── Actor registry ────────────────────────────────────────────────────────────
  var _actors   = {};   // buildingKey → actor record
  var _manifest = null;
  var _initialized          = false;
  var _mapListenersAttached = false;
  var _showFootprints       = false;  // 0610D debug overlay toggle

  // ── Dominance state (0610F) ───────────────────────────────────────────────────
  var _lastDominanceRepairAt = null;
  var _dominanceLastError    = null;
  var _dominanceRepairActive = false;  // recursion guard

  var _stats = {
    actorCount: 0, activeReplacements: 0, archetypes: {},
    spawned: 0, updated: 0, removed: 0,
    footprintResolvedCount: 0, fallbackCount: 0,
    lastSpawn: null, lastError: null,
  };

  // 0610J: group resolution stats (updated each _sync)
  var _groupStats = {
    groupActorCount:           0,
    standaloneActorCount:      0,
    skippedGroupedMemberCount: 0,
    lastError:                 null,
  };

  // 0610K: compound resolution stats (updated each _sync)
  var _compoundStats = {
    compoundActorCount:           0,
    groupActorCount:              0,
    standaloneActorCount:         0,
    skippedCompoundMemberCount:   0,
    skippedCompoundGroupCount:    0,
    skippedGroupedMemberCount:    0,
    lastError:                    null,
  };

  // ── Map access ────────────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return (mvr && typeof mvr.getMap === 'function') ? mvr.getMap() : null;
  }

  function _archetypeCfg(archetype) {
    return ARCHETYPE_CFG[archetype] || ARCHETYPE_CFG['custom-placeholder'];
  }

  // _getDetailTier — maps current map zoom to a geometry detail tier string.
  // Used by _generateForActor to select the correct LOD from BuildingStyleKit.
  //   zoom < 14      → 'far'  (max 4  parts — silhouette only)
  //   zoom 14 – <16  → 'mid'  (max 12 parts — key structural elements)
  //   zoom >= 16     → 'near' (max 24 parts — full detail pass)
  function _getDetailTier(map) {
    if (!map || typeof map.getZoom !== 'function') return 'mid';
    var z = map.getZoom();
    if (z < 14) return 'far';
    if (z < 16) return 'mid';
    return 'near';
  }

  // ── Height formula ────────────────────────────────────────────────────────────

  function _resolveActorHeight(replacement, baseHeightM) {
    var base  = (baseHeightM != null && baseHeightM > 0) ? baseHeightM : DEFAULT_HEIGHT_M;
    var hm    = HEIGHT_MODE_MUL[replacement.heightMode] != null
      ? HEIGHT_MODE_MUL[replacement.heightMode] : 1.0;
    var scale = (typeof replacement.scale === 'number' && replacement.scale > 0)
      ? replacement.scale : 1.0;
    var cfg   = _archetypeCfg(replacement.archetype);
    return Math.max(3, base * hm * scale * cfg.heightMul);
  }

  // ── Footprint metric helpers ──────────────────────────────────────────────────

  // _centroidForRing(ring) → { lng, lat }
  function _centroidForRing(ring) {
    var n = ring.length - 1; // closed ring: last == first
    if (n < 1) return { lng: ring[0][0], lat: ring[0][1] };
    var sumLng = 0, sumLat = 0;
    for (var i = 0; i < n; i++) { sumLng += ring[i][0]; sumLat += ring[i][1]; }
    return { lng: sumLng / n, lat: sumLat / n };
  }

  // _boundsForRing(ring) → { minLng, maxLng, minLat, maxLat }
  function _boundsForRing(ring) {
    var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (var i = 0; i < ring.length; i++) {
      var lng = ring[i][0], lat = ring[i][1];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    return { minLng: minLng, maxLng: maxLng, minLat: minLat, maxLat: maxLat };
  }

  // _dimensionsFromBounds → { widthM, depthM }
  function _dimensionsFromBounds(bounds, lat) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var widthM = (bounds.maxLng - bounds.minLng) * 111320 * cosLat;
    var depthM = (bounds.maxLat - bounds.minLat) * 111320;
    return {
      widthM: Math.max(MIN_DIM_M, widthM),
      depthM: Math.max(MIN_DIM_M, depthM),
    };
  }

  // _polygonAreaM2(ring, lat) — shoelace approximation in m²
  function _polygonAreaM2(ring, lat) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var area = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var x0 = ring[i][0]     * 111320 * cosLat;
      var y0 = ring[i][1]     * 111320;
      var x1 = ring[i + 1][0] * 111320 * cosLat;
      var y1 = ring[i + 1][1] * 111320;
      area += (x0 * y1 - x1 * y0);
    }
    return Math.abs(area) / 2;
  }

  // _headingFromLongestEdge(ring, lat) → heading in degrees (0–180, N-clockwise)
  // The building's primary axis direction is identified by its longest edge.
  function _headingFromLongestEdge(ring, lat) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var bestH = 0, bestLen2 = 0;
    for (var i = 0; i < ring.length - 1; i++) {
      var dx = (ring[i + 1][0] - ring[i][0]) * 111320 * cosLat;
      var dy = (ring[i + 1][1] - ring[i][1]) * 111320;
      var len2 = dx * dx + dy * dy;
      if (len2 > bestLen2) {
        bestLen2 = len2;
        // atan2(dx,dy) → angle from north (y-axis), clockwise-positive
        bestH = Math.atan2(dx, dy) * 180 / Math.PI;
      }
    }
    // Normalize to 0–180 (building orientation is undirected)
    return ((bestH % 180) + 180) % 180;
  }

  // _extractFootprint(feature) → footprint object or null
  // Supports Polygon and MultiPolygon geometry; picks largest polygon for MP.
  function _extractFootprint(feature) {
    try {
      if (!feature || !feature.geometry) return null;
      var geom = feature.geometry;
      var ring = null;

      if (geom.type === 'Polygon') {
        ring = geom.coordinates && geom.coordinates[0];
      } else if (geom.type === 'MultiPolygon') {
        var polys = geom.coordinates;
        if (!polys) return null;
        var bestRing = null, bestArea = 0;
        for (var pi = 0; pi < polys.length; pi++) {
          var r = polys[pi] && polys[pi][0];
          if (!r || r.length < 4) continue;
          var centA = _centroidForRing(r);
          var area  = _polygonAreaM2(r, centA.lat);
          if (area > bestArea) { bestArea = area; bestRing = r; }
        }
        ring = bestRing;
      }

      if (!ring || ring.length < 4) return null;

      var centroid = _centroidForRing(ring);
      var bounds   = _boundsForRing(ring);
      var dims     = _dimensionsFromBounds(bounds, centroid.lat);
      var areaM2   = _polygonAreaM2(ring, centroid.lat);
      var heading  = _headingFromLongestEdge(ring, centroid.lat);

      return {
        coordinates: ring,
        centroid:    centroid,
        bounds:      bounds,
        widthM:      dims.widthM,
        depthM:      dims.depthM,
        areaM2:      areaM2,
        heading:     heading,
      };
    } catch (e) {
      return null;
    }
  }

  // ── Core geometry ─────────────────────────────────────────────────────────────

  // _rectPolygon(lng, lat, hw, hd, offXM, offYM, heading) → GeoJSON ring
  // hw/hd: half-width / half-depth in metres (metres east/north before rotation).
  // offXM/offYM: center offset in metres before rotation.
  // heading: degrees from north (clockwise); optional — omit for axis-aligned output.
  function _rectPolygon(lng, lat, hw, hd, offXM, offYM, heading) {
    var cosLat = Math.cos(lat * Math.PI / 180) || 0.0001;
    var dLng   = 1 / (111320 * cosLat);
    var dLat   = 1 / 111320;

    var ox = offXM || 0;
    var oy = offYM || 0;

    // Corners in local metres (E/N), relative to offset center
    var corners = [
      [-hw, -hd],
      [ hw, -hd],
      [ hw,  hd],
      [-hw,  hd],
      [-hw, -hd], // close ring
    ];

    if (heading) {
      var rad = heading * Math.PI / 180;
      var sinH = Math.sin(rad), cosH = Math.cos(rad);
      // Rotate the center offset
      var rox = ox * cosH - oy * sinH;
      var roy = ox * sinH + oy * cosH;
      ox = rox;
      oy = roy;
      // Rotate each corner
      corners = corners.map(function (c) {
        return [c[0] * cosH - c[1] * sinH, c[0] * sinH + c[1] * cosH];
      });
    }

    var cx = lng + ox * dLng;
    var cy = lat + oy * dLat;

    return [corners.map(function (c) {
      return [cx + c[0] * dLng, cy + c[1] * dLat];
    })];
  }

  // _p(hw, hd, base, height, offX, offY, materialRole) → compact part descriptor
  // materialRole: 'body' | 'roof' | 'accent' | 'beacon' | 'stack' | 'foundation'
  function _p(hw, hd, base, height, offX, offY, materialRole) {
    return {
      hw:           hw,
      hd:           hd,
      base:         base,
      height:       height,
      offX:         offX || 0,
      offY:         offY || 0,
      materialRole: materialRole || 'body',
    };
  }

  // _partsToFeatures — converts part descriptors to GeoJSON Feature[].
  // Emits materialRole and materialColor on each feature for the layer expression.
  // heading is passed through to _rectPolygon for uniform rotation.
  function _partsToFeatures(parts, lng, lat, color, actorId, heading, archetype) {
    var features = [];
    for (var i = 0; i < parts.length; i++) {
      var p    = parts[i];
      var role = p.materialRole || 'body';
      var mc   = archetype ? _materialColor(archetype, role) : null;
      features.push({
        type: 'Feature',
        id:   actorId + ':' + i,
        properties: {
          color:         color,           // archetype fallback color (always set)
          materialColor: mc || color,     // role-specific color; falls back to archetype color
          materialRole:  role,
          base:          p.base,
          height:        p.height,
        },
        geometry: {
          type:        'Polygon',
          coordinates: _rectPolygon(lng, lat, p.hw, p.hd, p.offX, p.offY, heading || 0),
        },
      });
    }
    return features;
  }

  // ── Archetype shape generators ────────────────────────────────────────────────
  // Signature: (lng, lat, W, D, H, color, actorId, heading) → Feature[]
  // W = base half-width (metres), D = base half-depth, H = total height.
  // heading = degrees from north; 0 = axis-aligned.
  // W/D are derived from footprint dimensions × archetype occupancy fraction.
  // Each _p() call carries a materialRole; _partsToFeatures resolves materialColor
  // from ARCHETYPE_MATERIALS via the archetype name threaded through as last arg.

  // Warehouse — wide industrial building with pitched ridge.
  function _generateWarehouse(lng, lat, W, D, H, color, actorId, heading) {
    var parts = [
      _p(W,        D,        0,       H*0.56,  0, 0, 'body'),        // main body — warm concrete
      _p(W*0.50,   D,        H*0.56,  H*0.76,  0, 0, 'roof'),        // roof tier 1
      _p(W*0.13,   D*0.90,   H*0.76,  H,       0, 0, 'accent'),      // ridge peak — dark trim
    ];
    return _partsToFeatures(parts, lng, lat, color, actorId, heading, 'warehouse');
  }

  // Skyscraper — podium base with 4-step setback crown.
  function _generateSkyscraper(lng, lat, W, D, H, color, actorId, heading) {
    var parts = [
      _p(W,        D,        0,       H*0.55,  0, 0, 'foundation'),  // podium base — darker
      _p(W*0.70,   D*0.70,   H*0.55,  H*0.74,  0, 0, 'body'),        // tower body — glass
      _p(W*0.46,   D*0.46,   H*0.74,  H*0.88,  0, 0, 'accent'),      // setback band
      _p(W*0.14,   D*0.14,   H*0.88,  H,       0, 0, 'roof'),         // crown needle — teal
    ];
    return _partsToFeatures(parts, lng, lat, color, actorId, heading, 'skyscraper');
  }

  // Apartment — rectangular body + rooftop water tower (offset).
  function _generateApartment(lng, lat, W, D, H, color, actorId, heading) {
    var parts = [
      _p(W,        D,        0,       H*0.90,           0,      0,      'body'),     // main body
      _p(W*0.18,   W*0.18,   H*0.90,  H,                W*0.38, D*0.20, 'accent'),   // water tower
    ];
    return _partsToFeatures(parts, lng, lat, color, actorId, heading, 'apartment');
  }

  // Radio Tower — spread base, narrow shaft, beacon cap.
  function _generateRadioTower(lng, lat, W, D, H, color, actorId, heading) {
    var parts = [
      _p(W*0.48,   D*0.48,   0,       H*0.06,  0, 0, 'foundation'),  // concrete pad
      _p(W*0.36,   D*0.36,   H*0.06,  H*0.18,  0, 0, 'body'),        // lower spread
      _p(W*0.10,   D*0.10,   H*0.18,  H*0.90,  0, 0, 'stack'),       // red shaft
      _p(W*0.20,   D*0.20,   H*0.90,  H,       0, 0, 'beacon'),      // bright warning cap
    ];
    return _partsToFeatures(parts, lng, lat, color, actorId, heading, 'radio-tower');
  }

  // Pagoda — 3 tiered floors with overhanging eaves + spire.
  function _generatePagoda(lng, lat, W, D, H, color, actorId, heading) {
    var parts = [
      _p(W,        D,        0,       H*0.22,  0, 0, 'foundation'),  // tier 1 lower body
      _p(W*1.28,   D*1.28,   H*0.21,  H*0.25,  0, 0, 'roof'),        // eave 1 plate
      _p(W*0.72,   D*0.72,   H*0.25,  H*0.46,  0, 0, 'body'),        // tier 2 body
      _p(W*0.95,   D*0.95,   H*0.45,  H*0.49,  0, 0, 'roof'),        // eave 2 plate
      _p(W*0.50,   D*0.50,   H*0.49,  H*0.68,  0, 0, 'body'),        // tier 3 body
      _p(W*0.67,   D*0.67,   H*0.67,  H*0.71,  0, 0, 'accent'),      // eave 3 highlight
      _p(W*0.12,   D*0.12,   H*0.71,  H,       0, 0, 'roof'),         // spire tip
    ];
    return _partsToFeatures(parts, lng, lat, color, actorId, heading, 'pagoda');
  }

  // Civic Block — wide public building with stepped dome.
  function _generateCivicBlock(lng, lat, W, D, H, color, actorId, heading) {
    var parts = [
      _p(W,        D,        0,       H*0.50,  0, 0, 'foundation'),  // wide stone base
      _p(W*0.78,   D*0.76,   H*0.50,  H*0.63,  0, 0, 'body'),        // portico/steps
      _p(W*0.54,   D*0.52,   H*0.63,  H*0.75,  0, 0, 'body'),        // dome base
      _p(W*0.36,   D*0.34,   H*0.75,  H*0.86,  0, 0, 'accent'),      // dome mid trim
      _p(W*0.17,   D*0.16,   H*0.86,  H,       0, 0, 'roof'),         // gold dome cap
    ];
    return _partsToFeatures(parts, lng, lat, color, actorId, heading, 'civic-block');
  }

  // Industrial Stack — factory floor + off-center smokestack.
  function _generateIndustrialStack(lng, lat, W, D, H, color, actorId, heading) {
    var sx = W * 0.44;
    var sy = 0;
    var parts = [
      _p(W,        D,        0,       H*0.36,          0,   0,   'body'),    // factory floor — ochre
      _p(W*0.25,   D*0.25,   0,       H*0.62,          sx,  sy,  'stack'),   // stack lower — dark rust
      _p(W*0.18,   D*0.18,   H*0.62,  H*0.86,          sx,  sy,  'stack'),   // stack upper
      _p(W*0.26,   D*0.26,   H*0.86,  H,               sx,  sy,  'accent'),  // cap flare
    ];
    return _partsToFeatures(parts, lng, lat, color, actorId, heading, 'industrial-stack');
  }

  // Custom Placeholder — simple cube fallback.
  function _generatePlaceholder(lng, lat, W, D, H, color, actorId, heading) {
    return _partsToFeatures(
      [_p(W, D, 0, H, 0, 0, 'body')],
      lng, lat, color, actorId, heading, 'custom-placeholder'
    );
  }

  // ── Manifest geometry resolution (0610D) ─────────────────────────────────────

  // _geometryFromEdit — reads the Studio-captured geometry snapshot from a
  // manifest edit and returns a footprint-compatible object, or null if the
  // snapshot is absent / invalid. Validation is intentionally lenient — if
  // widthM/depthM exist and the centroid is valid, we use the snapshot.
  function _geometryFromEdit(edit) {
    try {
      var g = edit && edit.geometry;
      if (!g) return null;
      if (!g.centroid || typeof g.centroid.lng !== 'number' || typeof g.centroid.lat !== 'number') return null;
      if (isNaN(g.centroid.lng) || isNaN(g.centroid.lat)) return null;
      var wM = typeof g.widthM === 'number' ? g.widthM : 0;
      var dM = typeof g.depthM === 'number' ? g.depthM : 0;
      if (wM < MIN_DIM_M || dM < MIN_DIM_M) return null;
      return {
        coordinates: g.coordinates || null,     // outer ring (may be null for old snapshots)
        centroid:    g.centroid,
        bounds:      g.bounds    || null,
        widthM:      wM,
        depthM:      dM,
        areaM2:      typeof g.areaM2   === 'number' ? g.areaM2   : 0,
        heading:     typeof g.heading  === 'number' ? g.heading  : 0,
        source:      'manifest',
      };
    } catch (e) { return null; }
  }

  // ── Alignment diagnostics (0610D) ─────────────────────────────────────────────

  // _centroidDistanceM — Euclidean distance between two {lng,lat} centroids in metres.
  function _centroidDistanceM(a, b) {
    if (!a || !b) return null;
    var cosLat = Math.cos(a.lat * Math.PI / 180) || 0.0001;
    var dx = (b.lng - a.lng) * 111320 * cosLat;
    var dy = (b.lat - a.lat) * 111320;
    return Math.round(Math.sqrt(dx * dx + dy * dy) * 10) / 10;
  }

  // _headingDelta — unsigned angular difference (0–90) between two headings (0–180).
  function _headingDelta(ha, hb) {
    if (typeof ha !== 'number' || typeof hb !== 'number') return null;
    var d = Math.abs(ha - hb);
    return Math.round(d > 90 ? 180 - d : d);
  }

  // ── Archetype dispatch ────────────────────────────────────────────────────────

  var _GENERATORS = {
    'warehouse':          _generateWarehouse,
    'skyscraper':         _generateSkyscraper,
    'apartment':          _generateApartment,
    'radio-tower':        _generateRadioTower,
    'pagoda':             _generatePagoda,
    'civic-block':        _generateCivicBlock,
    'industrial-stack':   _generateIndustrialStack,
    'custom-placeholder': _generatePlaceholder,
  };

  // _generateForActor — selects generator and computes footprint-aware W/D.
  // Priority: SBE.BuildingStyleKit (LOD-aware) → built-in _GENERATORS → placeholder.
  // If actor.footprint is set: W = fp.widthM/2 * cfg.fpW, D = fp.depthM/2 * cfg.fpD.
  // Fallback: cfg.bW, cfg.bD (fixed metres, v1.1.0 behavior).
  // Stores actor.partCount (feature count) after generation for geometryStats().
  function _generateForActor(actor) {
    var cfg     = _archetypeCfg(actor.archetype);
    var fp      = actor.footprint;
    var W, D, heading;

    if (fp && fp.widthM >= MIN_DIM_M && fp.depthM >= MIN_DIM_M) {
      W       = (fp.widthM / 2) * cfg.fpW;
      D       = (fp.depthM / 2) * cfg.fpD;
      heading = fp.heading || 0;
    } else {
      W       = cfg.bW;
      D       = cfg.bD;
      heading = 0;
    }

    // ── 0610E: defer to BuildingStyleKit if available ─────────────────────
    var kit = SBE.BuildingStyleKit;
    if (kit && typeof kit.getParts === 'function') {
      try {
        var map  = _getMap();
        var tier = _getDetailTier(map);
        var kParts = kit.getParts(actor.archetype, W, D, actor.height, tier);
        if (kParts && kParts.length) {
          var kFeatures = _partsToFeatures(kParts, actor.lng, actor.lat,
            actor.color, actor.id, heading, actor.archetype);
          actor.partCount = kFeatures.length;
          return kFeatures;
        }
      } catch (e) {
        console.warn('[BuildingReplacementRuntime] style kit error for', actor.archetype, e.message || e);
        // fall through to built-in generator below
      }
    }

    // ── Built-in generator fallback ───────────────────────────────────────
    var gen = _GENERATORS[actor.archetype] || _generatePlaceholder;
    try {
      var features = gen(actor.lng, actor.lat, W, D, actor.height, actor.color, actor.id, heading);
      actor.partCount = features.length;
      return features;
    } catch (e) {
      console.warn('[BuildingReplacementRuntime] generator failed for', actor.archetype, e.message || e);
      var fallback = _generatePlaceholder(actor.lng, actor.lat, cfg.bW, cfg.bD, actor.height, actor.color, actor.id, 0);
      actor.partCount = fallback.length;
      return fallback;
    }
  }

  // ── Feature data resolution ───────────────────────────────────────────────────

  // _resolveFeatureData — resolves building position, height, and footprint
  // from the Mapbox composite source in one querySourceFeatures call.
  function _resolveFeatureData(map, source, sourceLayer, featureId) {
    if (!map || typeof map.querySourceFeatures !== 'function') return null;
    var numId = Number(featureId);
    try {
      var features = map.querySourceFeatures(source, {
        sourceLayer: sourceLayer,
        filter: ['==', ['id'], isNaN(numId) ? featureId : numId],
      });
      if (!features || !features.length) return null;
      var feat      = features[0];
      var footprint = _extractFootprint(feat);
      // Prefer footprint centroid (more accurate); fall back to ring-average
      var centroid  = footprint ? footprint.centroid : _featureCentroid(feat);
      if (!centroid) return null;
      return {
        lng:       centroid.lng,
        lat:       centroid.lat,
        height:    _buildingHeightFromFeature(feat),
        footprint: footprint,
      };
    } catch (e) {
      return null;
    }
  }

  // _resolvePosition — backward-compatible wrapper used by _retryPending.
  function _resolvePosition(map, source, sourceLayer, featureId) {
    var data = _resolveFeatureData(map, source, sourceLayer, featureId);
    return data ? { lng: data.lng, lat: data.lat, height: data.height, footprint: data.footprint } : null;
  }

  // ── GeoJSON source management ─────────────────────────────────────────────────

  function _buildGeoJSONCollection() {
    var features = [];
    Object.keys(_actors).forEach(function (bKey) {
      var actor = _actors[bKey];
      if (!actor || !actor.resolved || !actor.enabled) return;
      try {
        var actorFeatures = _generateForActor(actor);
        for (var i = 0; i < actorFeatures.length; i++) {
          features.push(actorFeatures[i]);
        }
      } catch (e) {
        console.warn('[BuildingReplacementRuntime] geometry gen error for', bKey, e.message || e);
      }
    });
    return { type: 'FeatureCollection', features: features };
  }

  function _pushToMap(map) {
    if (!map) return;
    try {
      var collection = _buildGeoJSONCollection();
      var src = null;
      try { src = map.getSource(SOURCE_ID); } catch (e) {}

      if (src) {
        try { src.setData(collection); } catch (e) {
          console.warn('[BuildingReplacementRuntime] setData failed:', e.message || e);
          _stats.lastError = 'setData:' + (e.message || e);
        }
        _ensureLayerPaint(map);
      } else {
        try {
          map.addSource(SOURCE_ID, { type: 'geojson', data: collection });
        } catch (e) {
          console.warn('[BuildingReplacementRuntime] addSource failed:', e.message || e);
          _stats.lastError = 'addSource:' + (e.message || e);
          return;
        }
        _addLayer(map);
      }
    } catch (e) {
      console.warn('[BuildingReplacementRuntime] _pushToMap error:', e.message || e);
    }
  }

  function _addLayer(map) {
    try {
      map.addLayer({
        id:     LAYER_ID,
        type:   'fill-extrusion',
        source: SOURCE_ID,
        paint: {
          // materialColor takes priority; archetype color is the safe fallback.
          'fill-extrusion-color':   ['coalesce', ['get', 'materialColor'], ['get', 'color']],
          'fill-extrusion-height':  ['get', 'height'],
          'fill-extrusion-base':    ['get', 'base'],
          'fill-extrusion-opacity': LAYER_OPACITY,  // 0.96 — solid world object
        },
      });
      console.log('[BuildingReplacementRuntime] layer added:', LAYER_ID);
    } catch (e) {
      console.warn('[BuildingReplacementRuntime] addLayer failed:', e.message || e);
      _stats.lastError = 'addLayer:' + (e.message || e);
    }
  }

  // _ensureLayerPaint — upgrades pre-v1.3.0 layer paint to current spec.
  // Handles: fill-extrusion-base (fixed→expression), fill-extrusion-color
  // (plain get→coalesce), fill-extrusion-opacity (old value→solid 0.96).
  function _ensureLayerPaint(map) {
    var style = null;
    try { style = map.getStyle(); } catch (e) { return; }
    var layers = style && style.layers;
    if (!layers) return;
    var layer = null;
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].id === LAYER_ID) { layer = layers[i]; break; }
    }
    if (!layer) { _addLayer(map); return; }

    var paint = layer.paint || {};

    // Upgrade base: scalar/absent → expression
    var baseExpr = paint['fill-extrusion-base'];
    if (!Array.isArray(baseExpr)) {
      try { map.setPaintProperty(LAYER_ID, 'fill-extrusion-base', ['get', 'base']); } catch (e) {}
    }

    // Upgrade color: plain ['get','color'] → coalesce(materialColor, color)
    var colorExpr = paint['fill-extrusion-color'];
    var needsColorUpgrade = !colorExpr ||
      (Array.isArray(colorExpr) && colorExpr[0] === 'get' && colorExpr[1] === 'color');
    if (needsColorUpgrade) {
      try {
        map.setPaintProperty(LAYER_ID, 'fill-extrusion-color',
          ['coalesce', ['get', 'materialColor'], ['get', 'color']]);
      } catch (e) {}
    }

    // Upgrade opacity: raise to solid if below threshold
    var opacityVal = paint['fill-extrusion-opacity'];
    if (typeof opacityVal !== 'number' || opacityVal < 0.90) {
      try { map.setPaintProperty(LAYER_ID, 'fill-extrusion-opacity', LAYER_OPACITY); } catch (e) {}
    }
  }

  // ── Manifest loading ──────────────────────────────────────────────────────────

  function _loadManifest() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) { _manifest = { buildings: {} }; return true; }
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.buildings !== 'object') {
        console.warn('[BuildingReplacementRuntime] invalid manifest schema');
        _stats.lastError = 'invalid_schema';
        return false;
      }
      _manifest = parsed;
      return true;
    } catch (e) {
      var msg = String(e && e.message || e);
      console.warn('[BuildingReplacementRuntime] manifest parse failed:', msg);
      _stats.lastError = msg;
      _manifest = null;
      return false;
    }
  }

  // ── Legacy geometry helpers (still used for fallback centroid) ────────────────

  function _featureCentroid(feature) {
    if (!feature || !feature.geometry) return null;
    var geom = feature.geometry;
    if (geom.type === 'Point') return { lng: geom.coordinates[0], lat: geom.coordinates[1] };
    var ring = null;
    if (geom.type === 'Polygon') ring = geom.coordinates && geom.coordinates[0];
    else if (geom.type === 'MultiPolygon') ring = geom.coordinates && geom.coordinates[0] && geom.coordinates[0][0];
    if (!ring || ring.length < 2) return null;
    return _centroidForRing(ring);
  }

  function _buildingHeightFromFeature(feature) {
    if (!feature || !feature.properties) return null;
    var h = feature.properties.height || feature.properties['render-height'];
    if (h != null && !isNaN(h)) return Number(h);
    return null;
  }

  // ── Key parsing ───────────────────────────────────────────────────────────────

  function _parseKey(bKey) {
    var reg = global.WOSMapLab && global.WOSMapLab.BuildingEditRegistry;
    if (reg && typeof reg.parseKey === 'function') return reg.parseKey(bKey);
    if (!bKey) return null;
    var i1 = bKey.indexOf(':'), i2 = bKey.indexOf(':', i1 + 1);
    if (i1 === -1 || i2 === -1) return null;
    return { source: bKey.slice(0, i1), sourceLayer: bKey.slice(i1 + 1, i2), featureId: bKey.slice(i2 + 1) };
  }

  // ── Actor lifecycle ───────────────────────────────────────────────────────────

  function _spawnOrUpdate(bKey, edit, map) {
    var rep = edit.replacement;
    if (!rep || !rep.enabled) { _despawn(bKey); return; }

    var parsed = _parseKey(bKey);
    if (!parsed) return;

    var cfg      = _archetypeCfg(rep.archetype);
    var existing = _actors[bKey];
    var numId    = Number(parsed.featureId);
    var data     = _resolveFeatureData(map, parsed.source, parsed.sourceLayer, parsed.featureId);

    var actor = existing || {
      id:                 'brep:' + bKey,
      buildingKey:        bKey,
      numericId:          isNaN(numId) ? null : numId,
      source:             parsed.source,
      sourceLayer:        parsed.sourceLayer,
      featureId:          parsed.featureId,
      firstSeenAt:        Date.now(),
      resolved:           false,
      lng:                null,
      lat:                null,
      footprint:          null,
      // 0610D alignment fields
      geometryAuthority:  'fallback',
      manifestFeatureId:  null,
      wallQueryFootprint: null,
    };

    actor.enabled          = true;
    actor.archetype        = rep.archetype || 'custom-placeholder';
    actor.geometryKind     = actor.archetype;
    actor.color            = cfg.color;
    actor.scale            = (typeof rep.scale === 'number' && rep.scale > 0) ? rep.scale : 1.0;
    actor.heightMode       = rep.heightMode || 'inherit';
    actor.replacementStyle = rep.style || '';
    actor.actorType        = 'building-replacement';

    // ── 0610D: Geometry resolution priority ──────────────────────────────────
    // 1. Studio-captured manifest geometry (edit.geometry) — most accurate.
    // 2. Wall querySourceFeatures result — tile-dependent approximation.
    // 3. Fixed-size fallback (unresolved).
    var manifestGeom = _geometryFromEdit(edit);
    if (manifestGeom) {
      // --- Priority 1: manifest geometry ---
      actor.resolved         = true;
      actor.lng              = manifestGeom.centroid.lng;
      actor.lat              = manifestGeom.centroid.lat;
      actor.footprint        = manifestGeom;
      actor.geometryAuthority = 'manifest';
      actor.manifestFeatureId = (edit.geometry && edit.geometry.featureId) || null;
      // Height: from geometry snapshot if captured, else from wall query, else DEFAULT
      var manifestHeight = (edit.geometry && typeof edit.geometry.height === 'number')
        ? edit.geometry.height : null;
      if (!manifestHeight && data) {
        // data was already queried above in the old path; reuse if present
        manifestHeight = data.height || null;
        if (data.footprint) actor.wallQueryFootprint = data.footprint; // for diagnostics
      }
      actor.inheritedHeight = manifestHeight;
      actor.height          = _resolveActorHeight(rep, manifestHeight);
    } else if (data) {
      // --- Priority 2: wall-query geometry ---
      actor.resolved          = true;
      actor.lng               = data.lng;
      actor.lat               = data.lat;
      actor.inheritedHeight   = data.height;
      actor.height            = _resolveActorHeight(rep, data.height);
      actor.footprint         = data.footprint || null;
      actor.geometryAuthority = data.footprint ? 'wall-query' : 'fallback';
    } else {
      // --- Priority 3: still unresolved ---
      actor.geometryAuthority = 'fallback';
    }

    var isNew = !existing;
    _actors[bKey] = actor;
    if (isNew) { _stats.spawned++; _stats.lastSpawn = Date.now(); }
    else        { _stats.updated++; }
    _updateStats();
  }

  // ── Group actor lifecycle (0610J) ─────────────────────────────────────────────

  // _geometryFromGroup — extracts usable geometry from a manifest group record.
  // Returns { centroid, widthM, depthM, heading, height } | null.
  function _geometryFromGroup(group) {
    try {
      var g = group && group.geometry;
      if (!g || !g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') return null;
      var wM = typeof g.widthM === 'number' ? g.widthM : 0;
      var dM = typeof g.depthM === 'number' ? g.depthM : 0;
      if (wM < MIN_DIM_M || dM < MIN_DIM_M) return null;
      return {
        centroid: g.centroid,
        widthM:   wM,
        depthM:   dM,
        heading:  typeof g.heading === 'number' ? g.heading : 0,
        height:   typeof g.height  === 'number' ? g.height  : null,
        areaM2:   typeof g.areaM2  === 'number' ? g.areaM2  : 0,
      };
    } catch (e) { return null; }
  }

  // _spawnOrUpdateGroup — spawns/updates one replacement actor for an entire group.
  // Actor ID: 'brep-group:<groupId>' to distinguish from standalone building actors.
  function _spawnOrUpdateGroup(groupId, group, map) {
    var rep = group.replacement;
    if (!rep || !rep.enabled) { _despawn('group:' + groupId); return; }

    var cfg      = _archetypeCfg(rep.archetype);
    var actorKey = 'group:' + groupId;
    var existing = _actors[actorKey];

    var actor = existing || {
      id:             'brep-group:' + groupId,
      buildingKey:    actorKey,
      isGroup:        true,
      groupId:        groupId,
      groupMembers:   group.members || [],
      firstSeenAt:    Date.now(),
      resolved:       false,
      lng:            null,
      lat:            null,
      footprint:      null,
      numericId:      null,
      source:         null,
      sourceLayer:    null,
      featureId:      null,
      geometryAuthority: 'manifest',
    };

    actor.enabled          = true;
    actor.archetype        = rep.archetype || 'custom-placeholder';
    actor.geometryKind     = actor.archetype;
    actor.color            = cfg.color;
    actor.scale            = (typeof rep.scale === 'number' && rep.scale > 0) ? rep.scale : 1.0;
    actor.heightMode       = rep.heightMode || 'inherit';
    actor.replacementStyle = rep.style || '';
    actor.actorType        = 'building-group-replacement';
    actor.groupMembers     = group.members || [];

    var geom = _geometryFromGroup(group);
    if (geom) {
      actor.resolved          = true;
      actor.lng               = geom.centroid.lng;
      actor.lat               = geom.centroid.lat;
      actor.footprint         = geom;
      actor.geometryAuthority = 'manifest';
      actor.inheritedHeight   = geom.height;
      actor.height            = _resolveActorHeight(rep, geom.height);
    }

    var isNew = !existing;
    _actors[actorKey] = actor;
    if (isNew) { _stats.spawned++; _stats.lastSpawn = Date.now(); }
    else        { _stats.updated++; }
    _updateStats();
  }

  // ── Compound actor lifecycle (0610K) ─────────────────────────────────────────

  // _geometryFromCompound — extracts usable geometry from a compound record.
  function _geometryFromCompound(compound) {
    try {
      var g = compound && compound.geometry;
      if (!g || !g.centroid ||
          typeof g.centroid.lng !== 'number' ||
          typeof g.centroid.lat !== 'number') return null;
      var wM = typeof g.widthM === 'number' ? g.widthM : 0;
      var dM = typeof g.depthM === 'number' ? g.depthM : 0;
      if (wM < MIN_DIM_M || dM < MIN_DIM_M) return null;
      return {
        centroid: g.centroid,
        widthM:   wM,
        depthM:   dM,
        heading:  typeof g.heading === 'number' ? g.heading : 0,
        height:   typeof g.height  === 'number' ? g.height  : null,
        areaM2:   typeof g.areaM2  === 'number' ? g.areaM2  : 0,
      };
    } catch (e) { return null; }
  }

  // _spawnOrUpdateCompound — spawns/updates one replacement actor for an entire compound.
  // Actor ID:  'brep-compound:<compoundId>'
  // Actor key: 'compound:<compoundId>'
  function _spawnOrUpdateCompound(compoundId, compound, map) {
    var rep = compound.replacement;
    if (!rep || !rep.enabled) { _despawn('compound:' + compoundId); return; }

    var cfg      = _archetypeCfg(rep.archetype);
    var actorKey = 'compound:' + compoundId;
    var existing = _actors[actorKey];

    var actor = existing || {
      id:             'brep-compound:' + compoundId,
      buildingKey:    actorKey,
      isCompound:     true,
      compoundId:     compoundId,
      compoundMembers: compound.members || [],
      firstSeenAt:    Date.now(),
      resolved:       false,
      lng:            null,
      lat:            null,
      footprint:      null,
      numericId:      null,
      source:         null,
      sourceLayer:    null,
      featureId:      null,
      geometryAuthority: 'manifest',
    };

    actor.enabled          = true;
    actor.archetype        = rep.archetype || 'custom-placeholder';
    actor.geometryKind     = actor.archetype;
    actor.color            = cfg.color;
    actor.scale            = (typeof rep.scale === 'number' && rep.scale > 0) ? rep.scale : 1.0;
    actor.heightMode       = rep.heightMode || 'inherit';
    actor.replacementStyle = rep.style || '';
    actor.actorType        = 'building-compound-replacement';
    actor.compoundMembers  = compound.members || [];
    actor.compoundName     = compound.name || '';
    actor.compoundKind     = compound.kind || 'custom';

    var geom = _geometryFromCompound(compound);
    if (geom) {
      actor.resolved          = true;
      actor.lng               = geom.centroid.lng;
      actor.lat               = geom.centroid.lat;
      actor.footprint         = geom;
      actor.geometryAuthority = 'manifest';
      actor.inheritedHeight   = geom.height;
      actor.height            = _resolveActorHeight(rep, geom.height);
    }

    var isNew = !existing;
    _actors[actorKey] = actor;
    if (isNew) { _stats.spawned++; _stats.lastSpawn = Date.now(); }
    else        { _stats.updated++; }
    _updateStats();
  }

  function _despawn(bKey) {
    if (!_actors[bKey]) return;
    delete _actors[bKey];
    _stats.removed++;
    _updateStats();
  }

  function _updateStats() {
    var count = 0, active = 0, archetypes = {}, fpResolved = 0, fallback = 0;
    Object.keys(_actors).forEach(function (k) {
      var a = _actors[k];
      count++;
      if (a.enabled && a.resolved) {
        active++;
        archetypes[a.archetype] = (archetypes[a.archetype] || 0) + 1;
        if (a.footprint) fpResolved++;
        else fallback++;
      }
    });
    _stats.actorCount             = count;
    _stats.activeReplacements     = active;
    _stats.archetypes             = archetypes;
    _stats.footprintResolvedCount = fpResolved;
    _stats.fallbackCount          = fallback;
  }

  // ── Full sync ─────────────────────────────────────────────────────────────────

  function _sync(map) {
    if (!_manifest) return;
    var buildings = _manifest.buildings || {};
    var groups    = (_manifest.groups    && typeof _manifest.groups    === 'object') ? _manifest.groups    : {};
    var compounds = (_manifest.compounds && typeof _manifest.compounds === 'object') ? _manifest.compounds : {};

    // ── Priority 1: compounds (0610K) ─────────────────────────────────────────
    // Build claimed sets so group and standalone passes skip them.
    var compoundClaimedBuildings = {};  // bKey → compoundId
    var compoundClaimedGroups    = {};  // groupId → compoundId
    var activeCompoundKeys       = {};
    var compoundActorCount       = 0;
    var skippedCompoundMembers   = 0;
    var skippedCompoundGroups    = 0;

    Object.keys(compounds).forEach(function (compoundId) {
      var compound = compounds[compoundId];
      if (!compound || !compound.replacement || !compound.replacement.enabled) return;
      if (!Array.isArray(compound.members) || !compound.members.length) return;

      compound.members.forEach(function (m) {
        if (!m) return;
        if (m.indexOf('group_') === 0) {
          compoundClaimedGroups[m] = compoundId;
          var grp = groups[m];
          if (grp && Array.isArray(grp.members)) {
            grp.members.forEach(function (mk) { compoundClaimedBuildings[mk] = compoundId; });
          }
        } else {
          compoundClaimedBuildings[m] = compoundId;
        }
      });

      var actorKey = 'compound:' + compoundId;
      activeCompoundKeys[actorKey] = true;
      _spawnOrUpdateCompound(compoundId, compound, map);
      compoundActorCount++;
    });

    // Despawn compound actors that are no longer active
    Object.keys(_actors).forEach(function (k) {
      if (k.indexOf('compound:') === 0 && !activeCompoundKeys[k]) _despawn(k);
    });

    // ── Priority 2: groups not claimed by a compound ──────────────────────────
    var groupedMemberKeys = {};
    var activeGroupKeys   = {};
    var groupActorCount   = 0;
    var skippedGroupCount = 0;

    Object.keys(groups).forEach(function (groupId) {
      if (compoundClaimedGroups[groupId]) {
        // Claimed by compound — despawn any stale group actor
        if (_actors['group:' + groupId]) _despawn('group:' + groupId);
        skippedCompoundGroups++;
        return;
      }
      var group = groups[groupId];
      if (!group || !group.replacement || !group.replacement.enabled) return;
      if (!Array.isArray(group.members) || !group.members.length) return;
      group.members.forEach(function (mk) { groupedMemberKeys[mk] = groupId; });
      var actorKey = 'group:' + groupId;
      activeGroupKeys[actorKey] = true;
      _spawnOrUpdateGroup(groupId, group, map);
      groupActorCount++;
    });

    // Despawn group actors no longer active
    Object.keys(_actors).forEach(function (k) {
      if (k.indexOf('group:') === 0 && !activeGroupKeys[k]) _despawn(k);
    });

    // ── Priority 3: standalone buildings ─────────────────────────────────────
    var activeKeys = {};
    Object.keys(buildings).forEach(function (bKey) {
      if (compoundClaimedBuildings[bKey]) {
        if (_actors[bKey]) _despawn(bKey);
        skippedCompoundMembers++;
        return;
      }
      if (groupedMemberKeys[bKey]) {
        if (_actors[bKey]) _despawn(bKey);
        skippedGroupCount++;
        return;
      }
      var edit = buildings[bKey];
      if (edit && edit.replacement && edit.replacement.enabled) {
        activeKeys[bKey] = true;
        _spawnOrUpdate(bKey, edit, map);
      }
    });

    // Despawn standalone actors no longer active
    Object.keys(_actors).forEach(function (bKey) {
      if (bKey.indexOf('compound:') === 0) return;
      if (bKey.indexOf('group:')    === 0) return;
      if (!activeKeys[bKey]) _despawn(bKey);
    });

    // Update all stats
    _compoundStats.compoundActorCount         = compoundActorCount;
    _compoundStats.groupActorCount            = groupActorCount;
    _compoundStats.standaloneActorCount       = Object.keys(activeKeys).length;
    _compoundStats.skippedCompoundMemberCount = skippedCompoundMembers;
    _compoundStats.skippedCompoundGroupCount  = skippedCompoundGroups;
    _compoundStats.skippedGroupedMemberCount  = skippedGroupCount;
    _compoundStats.lastError                  = null;

    _groupStats.groupActorCount           = groupActorCount;
    _groupStats.standaloneActorCount      = _compoundStats.standaloneActorCount;
    _groupStats.skippedGroupedMemberCount = skippedGroupCount;
    _groupStats.lastError                 = null;

    _pushToMap(map);
    _repairDominance(map);   // 0610F: fix layer order + re-apply suppression

    var pending = Object.keys(_actors).filter(function (k) { return !_actors[k].resolved; }).length;
    console.log('[BuildingReplacementRuntime] sync — actors:', _stats.actorCount,
      '| compounds:', compoundActorCount,
      '| groups:', groupActorCount,
      '| standalone:', _compoundStats.standaloneActorCount,
      '| resolved:', _stats.activeReplacements,
      '| footprint:', _stats.footprintResolvedCount,
      '| fallback:', _stats.fallbackCount,
      '| pending:', pending);
  }

  // ── Pending position + footprint retry ───────────────────────────────────────

  function _retryPending(map) {
    if (!map) return;
    // Retry actors without resolved position OR without footprint yet
    var retryKeys = Object.keys(_actors).filter(function (k) {
      var a = _actors[k];
      return a && a.enabled && (!a.resolved || !a.footprint);
    });
    if (!retryKeys.length) return;
    var improved = 0;
    retryKeys.forEach(function (bKey) {
      var actor = _actors[bKey];
      var pos   = _resolvePosition(map, actor.source, actor.sourceLayer, actor.featureId);
      if (!pos) return;
      var wasResolved = actor.resolved;
      actor.resolved        = true;
      actor.lng             = pos.lng;
      actor.lat             = pos.lat;
      actor.inheritedHeight = pos.height;
      if (pos.footprint) actor.footprint = pos.footprint;
      var buildings = _manifest && _manifest.buildings;
      var edit      = buildings && buildings[bKey];
      var rep       = edit && edit.replacement;
      actor.height  = rep ? _resolveActorHeight(rep, pos.height) : DEFAULT_HEIGHT_M;
      if (!wasResolved || pos.footprint) improved++;
    });
    if (improved) { _updateStats(); _pushToMap(map); }
  }

  // ── Style reload handler ──────────────────────────────────────────────────────

  var _styleReadyGuard = false;
  var _styleReadyTimer = null;

  function _onStyleReady() {
    if (_styleReadyGuard) return;
    _styleReadyGuard = true;
    if (_styleReadyTimer) clearTimeout(_styleReadyTimer);
    _styleReadyTimer = setTimeout(function () { _styleReadyGuard = false; _styleReadyTimer = null; }, 1200);

    var map = _getMap();
    if (!map) return;
    var ok = _loadManifest();
    if (!ok) return;
    _sync(map);
  }

  // ── Cross-tab sync ────────────────────────────────────────────────────────────

  function _onStorageEvent(e) {
    if (!e || e.key !== STORAGE_KEY) return;
    var map = _getMap();
    if (!map) return;
    var ok = _loadManifest();
    if (!ok) return;
    _sync(map);
  }

  // ── Map event wiring ──────────────────────────────────────────────────────────

  function _attachMapListeners(map) {
    if (_mapListenersAttached || !map || typeof map.on !== 'function') return;
    map.on('load',      _onStyleReady);
    map.on('styledata', function () {
      var loaded = false;
      try { loaded = !!map.isStyleLoaded(); } catch (e) {}
      if (loaded) _onStyleReady();
    });
    map.on('moveend',    function () { _retryPending(map); });
    map.on('sourcedata', function (e) {
      if (e && e.sourceId === 'composite' && e.isSourceLoaded) _retryPending(map);
    });
    _mapListenersAttached = true;
  }

  // ── Same-window replacement edit event listener (0612C) ──────────────────────
  // Receives 'wos:building-replacement-edit' dispatched by BuildingEditRegistry.save()
  // in the same document. Debounced to guard against rapid consecutive saves.

  var REPLACEMENT_SYNC_DEBOUNCE_MS = 60;
  var _syncDebounceTimer           = null;

  function _onReplacementEditEvent() {
    if (_syncDebounceTimer) clearTimeout(_syncDebounceTimer);
    _syncDebounceTimer = setTimeout(function () {
      _syncDebounceTimer = null;
      var map = _getMap();
      var ok  = _loadManifest();
      if (ok && map) _sync(map);
    }, REPLACEMENT_SYNC_DEBOUNCE_MS);
  }

  // ── 0612C: traceReplacementSync ───────────────────────────────────────────────
  // Audits one building key through every stage of the replacement pipeline.
  // Read-only — does not mutate any state.
  function traceReplacementSync(buildingKey) {
    var result = {
      ok:                      false,
      buildingKey:             buildingKey || null,
      manifestPresent:         false,
      buildingEditPresent:     false,
      replacementEnabled:      false,
      replacementArchetype:    null,
      replacementHeightMode:   null,
      replacementScale:        null,
      claimedByGroupId:        null,
      claimedByCompoundId:     null,
      expectedActorKey:        null,
      actorPresent:            false,
      actorResolved:           false,
      actorGeometryAuthority:  null,
      actorHeight:             null,
      actorColor:              null,
      actorPartCount:          null,
      sourceExists:            false,
      layerExists:             false,
      geojsonFeatureCount:     0,
      renderedFeatureCount:    0,
      dominance: {
        replacementAboveBuildings: false,
        replacementLayerIndex:     null,
        highestBuildingLayerIndex: null,
      },
      failureStage: null,
      lastError:    null,
    };

    var map = _getMap();

    // ── 1. Manifest ─────────────────────────────────────────────────────────────
    if (!_manifest || typeof _manifest.buildings !== 'object') {
      result.failureStage = 'MANIFEST_MISSING';
      return result;
    }
    result.manifestPresent = true;

    // ── 2. Building edit presence ────────────────────────────────────────────────
    var edit = _manifest.buildings[buildingKey];
    if (!edit) {
      result.failureStage = 'BUILDING_EDIT_MISSING';
      return result;
    }
    result.buildingEditPresent = true;

    // ── 3. Replacement enabled ────────────────────────────────────────────────────
    var rep = edit.replacement;
    if (!rep || !rep.enabled) {
      result.failureStage = 'REPLACEMENT_DISABLED';
      return result;
    }
    result.replacementEnabled   = true;
    result.replacementArchetype = rep.archetype  || null;
    result.replacementHeightMode= rep.heightMode || null;
    result.replacementScale     = typeof rep.scale === 'number' ? rep.scale : null;

    // ── 4. Group / compound ownership ───────────────────────────────────────────
    var groups    = (_manifest.groups    && typeof _manifest.groups    === 'object') ? _manifest.groups    : {};
    var compounds = (_manifest.compounds && typeof _manifest.compounds === 'object') ? _manifest.compounds : {};

    var claimedGroupId    = null;
    var claimedCompoundId = null;

    // Check compound membership
    var cIds = Object.keys(compounds);
    for (var ci = 0; ci < cIds.length; ci++) {
      var cmpd = compounds[cIds[ci]];
      if (!cmpd || !Array.isArray(cmpd.members)) continue;
      if (cmpd.members.indexOf(buildingKey) !== -1) { claimedCompoundId = cIds[ci]; break; }
      // Also check groups claimed by compound
      for (var cmi = 0; cmi < cmpd.members.length; cmi++) {
        var cmMember = cmpd.members[cmi];
        if (cmMember && cmMember.indexOf('group_') === 0) {
          var cmGrp = groups[cmMember];
          if (cmGrp && Array.isArray(cmGrp.members) && cmGrp.members.indexOf(buildingKey) !== -1) {
            claimedCompoundId = cIds[ci]; break;
          }
        }
      }
      if (claimedCompoundId) break;
    }

    // Check group membership (only if not already claimed by compound)
    if (!claimedCompoundId) {
      var gIds = Object.keys(groups);
      for (var gi = 0; gi < gIds.length; gi++) {
        var grp = groups[gIds[gi]];
        if (grp && Array.isArray(grp.members) && grp.members.indexOf(buildingKey) !== -1) {
          claimedGroupId = gIds[gi]; break;
        }
      }
    }

    result.claimedByGroupId    = claimedGroupId;
    result.claimedByCompoundId = claimedCompoundId;

    var expectedActorKey = claimedCompoundId ? ('compound:' + claimedCompoundId)
                         : claimedGroupId    ? ('group:'    + claimedGroupId)
                         : buildingKey;
    result.expectedActorKey = expectedActorKey;

    // ── 5. Actor presence ─────────────────────────────────────────────────────────
    var actor = _actors[expectedActorKey];
    if (!actor) {
      result.failureStage = 'ACTOR_MISSING';
      return result;
    }
    result.actorPresent           = true;
    result.actorResolved          = !!actor.resolved;
    result.actorGeometryAuthority = actor.geometryAuthority || 'unknown';
    result.actorHeight            = typeof actor.height  === 'number' ? actor.height  : null;
    result.actorColor             = actor.color  || null;
    result.actorPartCount         = typeof actor.partCount === 'number' ? actor.partCount : null;

    if (!actor.resolved) {
      result.failureStage = 'ACTOR_UNRESOLVED';
      return result;
    }

    // ── 6. Source / layer ─────────────────────────────────────────────────────────
    if (map) {
      try { result.sourceExists = !!map.getSource(SOURCE_ID); } catch (e) {}
      try { result.layerExists  = !!map.getLayer(LAYER_ID);  } catch (e) {}
    }

    if (!result.sourceExists) { result.failureStage = 'SOURCE_MISSING'; return result; }
    if (!result.layerExists)  { result.failureStage = 'LAYER_MISSING';  return result; }

    // ── 7. GeoJSON feature count for this actor ────────────────────────────────
    try {
      var coll = _buildGeoJSONCollection();
      var actorId = actor.id;
      var matchFeatures = coll.features.filter(function (f) {
        return String(f.id || '').indexOf(actorId) === 0;
      });
      result.geojsonFeatureCount = matchFeatures.length;
    } catch (e) {
      result.lastError = 'geojson count error: ' + String(e.message || e);
    }

    if (result.geojsonFeatureCount === 0) { result.failureStage = 'GEOJSON_EMPTY'; return result; }

    // ── 8. Rendered feature count ─────────────────────────────────────────────────
    if (map) {
      try {
        var rendered = map.queryRenderedFeatures({ layers: [LAYER_ID] }) || [];
        result.renderedFeatureCount = rendered.length;
      } catch (e) {}
    }

    if (result.renderedFeatureCount === 0) { result.failureStage = 'RENDER_EMPTY'; return result; }

    // ── 9. Layer dominance ────────────────────────────────────────────────────────
    if (map) {
      var disc = _discoverDominanceLayers(map);
      if (disc) {
        var repLayer = disc.replacementLayer;
        var repIdx   = repLayer ? repLayer.index : -1;
        var highIdx  = -1;
        for (var bi = 0; bi < disc.buildingLayers.length; bi++) {
          if (disc.buildingLayers[bi].index > highIdx) highIdx = disc.buildingLayers[bi].index;
        }
        result.dominance.replacementLayerIndex     = repIdx;
        result.dominance.highestBuildingLayerIndex = highIdx;
        result.dominance.replacementAboveBuildings = repIdx > highIdx;
      }
      if (!result.dominance.replacementAboveBuildings) {
        result.failureStage = 'LAYER_ORDER_FAILURE';
        return result;
      }
    }

    result.ok           = true;
    result.failureStage = null;
    return result;
  }

  // ── 0612C: repairReplacementSync ──────────────────────────────────────────────
  // Runs the full reload → sync → pushToMap → ensureLayerPaint → dominance chain
  // for one building key, then returns traceReplacementSync(buildingKey).
  function repairReplacementSync(buildingKey) {
    var map = _getMap();
    if (!map) {
      return { ok: false, buildingKey: buildingKey, lastError: 'map_not_available', failureStage: 'MANIFEST_MISSING' };
    }
    try {
      _loadManifest();
      _sync(map);
      _pushToMap(map);
      _ensureLayerPaint(map);
      _repairDominance(map);
      var proj = SBE.BuildingEditProjectionRuntime;
      if (proj && typeof proj.apply === 'function') proj.apply();
    } catch (e) {
      console.warn('[BuildingReplacementRuntime] repairReplacementSync error:', e.message || e);
    }
    return traceReplacementSync(buildingKey);
  }

  // ── 0612C: replacementSourceSnapshot ─────────────────────────────────────────
  // Returns a snapshot of the current GeoJSON source data from the in-memory
  // collection (not from queryRenderedFeatures, which depends on tile visibility).
  function replacementSourceSnapshot() {
    var map  = _getMap();
    var snap = {
      sourceExists:   !!(map && (function(){ try { return !!map.getSource(SOURCE_ID); } catch(e){ return false; } })()),
      layerExists:    !!(map && (function(){ try { return !!map.getLayer(LAYER_ID);   } catch(e){ return false; } })()),
      featureCount:   0,
      actorIds:       [],
      buildingKeys:   [],
      materialRoles:  [],
      sample:         [],
      lastError:      null,
    };

    try {
      var coll     = _buildGeoJSONCollection();
      var features = coll.features;
      snap.featureCount = features.length;

      var seenActors   = {};
      var seenBldgKeys = {};
      var seenRoles    = {};

      features.forEach(function (f) {
        var p  = f.properties || {};
        // Actor ID: 'brep:key:N' → extract 'brep:key'
        var rawId  = String(f.id || '');
        var lastColon = rawId.lastIndexOf(':');
        var actorId   = lastColon > 0 ? rawId.slice(0, lastColon) : rawId;
        if (actorId && !seenActors[actorId]) { seenActors[actorId] = true; snap.actorIds.push(actorId); }

        // BuildingKey: from _actors registry reverse-lookup by actor id prefix
        var bKey = null;
        var aKeys = Object.keys(_actors);
        for (var i = 0; i < aKeys.length; i++) {
          if (_actors[aKeys[i]].id === actorId) { bKey = aKeys[i]; break; }
        }
        if (bKey && !seenBldgKeys[bKey]) { seenBldgKeys[bKey] = true; snap.buildingKeys.push(bKey); }

        var role = p.materialRole || 'body';
        if (!seenRoles[role]) { seenRoles[role] = true; snap.materialRoles.push(role); }
      });

      // Sample: first 5 features
      snap.sample = features.slice(0, 5).map(function (f) {
        var p = f.properties || {};
        return {
          id:            f.id || null,
          actorId:       (function() {
            var raw = String(f.id || ''); var lc = raw.lastIndexOf(':'); return lc > 0 ? raw.slice(0, lc) : raw;
          })(),
          buildingKey:   null,   // expensive lookup omitted in sample for speed
          height:        typeof p.height === 'number' ? p.height : null,
          base:          typeof p.base   === 'number' ? p.base   : null,
          color:         p.color         || null,
          materialColor: p.materialColor || null,
          materialRole:  p.materialRole  || null,
        };
      });
    } catch (e) {
      snap.lastError = String(e.message || e);
    }

    console.log('[BuildingReplacementRuntime] replacementSourceSnapshot:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr) {
      console.warn('[BuildingReplacementRuntime] init: MVR not available — retrying in 600ms');
      setTimeout(init, 600);
      return;
    }
    _initialized = true;
    try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}
    // 0612C: same-window edit event (localStorage storage event is not fired for
    // same-document writes; BuildingEditRegistry.save() dispatches this instead).
    try { global.addEventListener('wos:building-replacement-edit', _onReplacementEditEvent); } catch (e) {}

    // 0612C: guard against duplicate 0612B replacement runtime being active
    if (global.SBE && global.SBE.BuildingReplacementMinimumVisibleResult) {
      console.warn('[BuildingReplacementRuntime] 0612C: duplicate replacement runtime detected — ' +
        'remove buildingReplacementMinimumVisibleResult.js from the load path. ' +
        'Its source "wos-building-replacements" and layer "wos-building-replacement-layer" ' +
        'may interfere with the canonical replacement pipeline.');
    }

    var map = mvr.getMap();
    if (typeof mvr.onStyleLoad === 'function') {
      mvr.onStyleLoad(function () {
        var m = mvr.getMap();
        if (m) { _attachMapListeners(m); _onStyleReady(); }
      });
    }
    if (map) {
      _attachMapListeners(map);
      var ready = false;
      try { ready = !!map.isStyleLoaded(); } catch (e) {}
      if (ready) _onStyleReady();
    } else if (typeof mvr.onReady === 'function') {
      mvr.onReady(function () {
        var m = mvr.getMap();
        if (m) { _attachMapListeners(m); _onStyleReady(); }
      });
    }
    console.log('[BuildingReplacementRuntime] v' + VERSION + ' initialized');
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function reload() {
    var map = _getMap();
    var ok  = _loadManifest();
    if (!ok) { console.warn('[BuildingReplacementRuntime] reload: manifest load failed'); return status(); }
    if (map) _sync(map);
    return status();
  }

  function clear() {
    var map = _getMap();
    _actors = {};
    _updateStats();
    if (map) {
      try {
        var src = map.getSource(SOURCE_ID);
        if (src) src.setData({ type: 'FeatureCollection', features: [] });
      } catch (e) {}
    }
    console.log('[BuildingReplacementRuntime] cleared');
    return true;
  }

  function list() {
    var out = {};
    Object.keys(_actors).forEach(function (k) {
      var a  = _actors[k];
      var fp = a.footprint;
      var mat = ARCHETYPE_MATERIALS[a.archetype] || ARCHETYPE_MATERIALS['custom-placeholder'];
      out[k] = {
        id:               a.id,
        archetype:        a.archetype,
        geometryKind:     a.geometryKind,
        enabled:          a.enabled,
        resolved:         a.resolved,
        lng:              a.lng,
        lat:              a.lat,
        height:           a.height,
        inheritedHeight:  a.inheritedHeight,
        scale:            a.scale,
        heightMode:       a.heightMode,
        color:            a.color,
        // footprint diagnostics (0610A)
        footprintResolved: !!fp,
        footprintArea:     fp ? fp.areaM2    : null,
        footprintWidthM:   fp ? fp.widthM    : null,
        footprintDepthM:   fp ? fp.depthM    : null,
        heading:           fp ? fp.heading   : null,
        // material profile (0610C)
        materialProfile:   mat,
        // geometry stats (0610E)
        partCount:          typeof a.partCount === 'number' ? a.partCount : null,
        // alignment diagnostics (0610D)
        geometryAuthority:  a.geometryAuthority  || 'unknown',
        manifestFeatureId:  a.manifestFeatureId  || null,
        wallFeatureId:      a.featureId          || null,
        centroidDeltaM:     _centroidDistanceM(
          fp && fp.centroid,
          a.wallQueryFootprint && a.wallQueryFootprint.centroid
        ),
        headingDelta:       _headingDelta(
          fp && fp.heading,
          a.wallQueryFootprint && a.wallQueryFootprint.heading
        ),
      };
    });
    console.log('[BuildingReplacementRuntime] actors:', JSON.stringify(out, null, 2));
    return out;
  }

  // ── Layer dominance (0610F) ───────────────────────────────────────────────────
  // Ensures wos-replacement-layer renders above all building-related layers.

  // _discoverDominanceLayers — returns { buildingLayers, replacementLayer, totalLayers }
  // buildingLayers: all fill-extrusion/fill/outline layers that relate to buildings
  //   (by type or id/sourceLayer pattern) excluding wos-* layers.
  // replacementLayer: the wos-replacement-layer descriptor, or null if not present.
  function _discoverDominanceLayers(map) {
    var style = null;
    try { style = map.getStyle(); } catch (e) { return null; }
    if (!style || !style.layers) return null;

    var layers      = style.layers;
    var bldgLayers  = [];
    var repLayer    = null;

    for (var i = 0; i < layers.length; i++) {
      var l   = layers[i];
      var lid = (l.id            || '').toLowerCase();
      var sl  = (l['source-layer'] || '').toLowerCase();

      if (l.id === LAYER_ID) {
        repLayer = { id: l.id, type: l.type, index: i };
        continue;
      }

      // Skip all other wos-* layers (fp overlays, replacement markers)
      if (lid.indexOf('wos-') === 0) continue;

      var isBldg = false;
      if (l.type === 'fill-extrusion')                                   isBldg = true;
      if (l.type === 'fill'   && (/building/.test(sl) || /building/.test(lid))) isBldg = true;
      if (l.type === 'line'   && (/building/.test(sl) || /building/.test(lid))) isBldg = true;
      if (l.type === 'symbol' && (/building/.test(sl) || /building/.test(lid))) isBldg = true;
      if (/building/.test(sl)) isBldg = true;

      if (isBldg) bldgLayers.push({ id: l.id, type: l.type, index: i });
    }

    return { buildingLayers: bldgLayers, replacementLayer: repLayer, totalLayers: layers.length };
  }

  // _ensureReplacementLayerDominance — moves wos-replacement-layer above the
  // highest building layer. Returns true if a move was performed, false if already
  // dominant or if the replacement layer is not yet present.
  function _ensureReplacementLayerDominance(map) {
    var disc = _discoverDominanceLayers(map);
    if (!disc || !disc.replacementLayer) return false;

    var highestBldgIdx = -1;
    for (var i = 0; i < disc.buildingLayers.length; i++) {
      if (disc.buildingLayers[i].index > highestBldgIdx) {
        highestBldgIdx = disc.buildingLayers[i].index;
      }
    }

    if (disc.replacementLayer.index > highestBldgIdx) return false; // already dominant

    try {
      // Find the layer immediately after the highest building layer to use as anchor.
      // Moving wos-replacement-layer before that anchor places it right above buildings.
      var styleLayers = map.getStyle().layers;
      var beforeId    = null;
      for (var j = highestBldgIdx + 1; j < styleLayers.length; j++) {
        var candidateId = styleLayers[j].id;
        if (candidateId !== LAYER_ID) { beforeId = candidateId; break; }
      }
      if (beforeId) {
        map.moveLayer(LAYER_ID, beforeId);
      } else {
        map.moveLayer(LAYER_ID);   // move to top of stack
      }
      console.log('[BuildingReplacementRuntime] dominance: moved', LAYER_ID,
        'above index', highestBldgIdx, beforeId ? '(before ' + beforeId + ')' : '(to top)');
      return true;
    } catch (e) {
      var msg = String(e && e.message || e);
      console.warn('[BuildingReplacementRuntime] dominance: moveLayer failed:', msg);
      _dominanceLastError = msg;
      return false;
    }
  }

  // _repairDominance — non-public repair cycle called after every sync / push.
  //   1. Fixes layer order so wos-replacement-layer is above all building layers.
  //   2. Triggers BuildingEditProjectionRuntime.apply() to re-apply source suppression.
  //   3. Records _lastDominanceRepairAt timestamp.
  // Protected by _dominanceRepairActive to prevent re-entrant loops.
  function _repairDominance(map) {
    if (_dominanceRepairActive || !map) return;
    _dominanceRepairActive = true;
    try {
      _ensureReplacementLayerDominance(map);
      var proj = SBE.BuildingEditProjectionRuntime;
      if (proj && typeof proj.apply === 'function') {
        proj.apply();
      }
      _lastDominanceRepairAt = Date.now();
    } catch (e) {
      _dominanceLastError = String(e && e.message || e);
      console.warn('[BuildingReplacementRuntime] _repairDominance error:', _dominanceLastError);
    } finally {
      _dominanceRepairActive = false;
    }
  }

  // ── Debug footprint overlay (0610D) ──────────────────────────────────────────
  // showFootprints(true/false) — renders two line overlays over all active actors:
  //   Cyan  = manifest footprint (from Studio-captured ring, or wall-query ring)
  //   Yellow = replacement generated rectangle (W×D at actor heading)
  // Both overlays are off by default. No UI buttons required.

  function _overlaySetData(map, sourceId, layerId, features, lineColor) {
    try {
      var collection = { type: 'FeatureCollection', features: features };
      var src = null;
      try { src = map.getSource(sourceId); } catch (e) {}
      if (src) {
        src.setData(collection);
      } else {
        map.addSource(sourceId, { type: 'geojson', data: collection });
        map.addLayer({
          id:     layerId,
          type:   'line',
          source: sourceId,
          paint:  { 'line-color': lineColor, 'line-width': 2, 'line-opacity': 0.9 },
        });
      }
    } catch (e) {
      console.warn('[BuildingReplacementRuntime] overlay error on', sourceId, ':', e.message || e);
    }
  }

  function _renderFootprintOverlay(map) {
    var manifestFeatures    = [];
    var replacementFeatures = [];

    Object.keys(_actors).forEach(function (bKey) {
      var actor = _actors[bKey];
      if (!actor || !actor.resolved || !actor.enabled || !actor.lng) return;

      // Cyan = manifest footprint ring (or wall-query ring when manifest absent)
      var fp = actor.footprint;
      if (fp && fp.coordinates && fp.coordinates.length >= 4) {
        manifestFeatures.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [fp.coordinates] },
          properties: { bKey: bKey, authority: actor.geometryAuthority },
        });
      }

      // Yellow = replacement generated rectangle (same W/D as generators use)
      var cfg = _archetypeCfg(actor.archetype);
      var W, D, heading;
      if (fp && fp.widthM >= MIN_DIM_M && fp.depthM >= MIN_DIM_M) {
        W = (fp.widthM / 2) * cfg.fpW;
        D = (fp.depthM / 2) * cfg.fpD;
        heading = fp.heading || 0;
      } else {
        W = cfg.bW; D = cfg.bD; heading = 0;
      }
      try {
        var repCoords = _rectPolygon(actor.lng, actor.lat, W, D, 0, 0, heading);
        replacementFeatures.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: repCoords },
          properties: { bKey: bKey, archetype: actor.archetype },
        });
      } catch (e) {}
    });

    _overlaySetData(map, FP_MANIFEST_SOURCE,    FP_MANIFEST_LAYER,    manifestFeatures,    '#00ffff');
    _overlaySetData(map, FP_REPLACEMENT_SOURCE, FP_REPLACEMENT_LAYER, replacementFeatures, '#ffff00');
  }

  function _clearFootprintOverlay(map) {
    [FP_MANIFEST_SOURCE, FP_REPLACEMENT_SOURCE].forEach(function (sId) {
      try {
        var src = map.getSource(sId);
        if (src) src.setData({ type: 'FeatureCollection', features: [] });
      } catch (e) {}
    });
  }

  function showFootprints(enabled) {
    _showFootprints = !!enabled;
    var map = _getMap();
    if (!map) { console.warn('[BuildingReplacementRuntime] showFootprints: map not available'); return; }
    if (_showFootprints) {
      _renderFootprintOverlay(map);
      console.log('[BuildingReplacementRuntime] footprint overlay ON');
    } else {
      _clearFootprintOverlay(map);
      console.log('[BuildingReplacementRuntime] footprint overlay OFF');
    }
  }

  // dominanceStatus() — returns a full audit of the current layer dominance state.
  // Describes whether wos-replacement-layer is above every building layer, how many
  // replacement actors are visible and confirmed-suppressed, and lists any actors
  // whose source building may still be visible (unsuppressedReplacementIds).
  function dominanceStatus() {
    var map  = _getMap();
    var disc = map ? _discoverDominanceLayers(map) : null;

    var repPresent   = !!(disc && disc.replacementLayer);
    var repIdx       = repPresent ? disc.replacementLayer.index : -1;
    var highestBldgIdx = -1;
    var layerOrder   = [];

    if (disc) {
      for (var li = 0; li < disc.buildingLayers.length; li++) {
        if (disc.buildingLayers[li].index > highestBldgIdx) {
          highestBldgIdx = disc.buildingLayers[li].index;
        }
      }
      // Build compact layerOrder including only relevant layers
      layerOrder = disc.buildingLayers.slice();
      if (disc.replacementLayer) layerOrder.push(disc.replacementLayer);
      layerOrder.sort(function (a, b) { return a.index - b.index; });
    }

    // Suppression audit via projection runtime
    var proj     = SBE.BuildingEditProjectionRuntime;
    var suppIds  = (proj && typeof proj.getSuppressionIds === 'function')
      ? proj.getSuppressionIds() : {};

    var unsuppressed = [];
    var suppressedCount = 0;
    Object.keys(_actors).forEach(function (bKey) {
      var a = _actors[bKey];
      if (!a || !a.enabled || !a.resolved) return;
      var numId = a.numericId;
      if (numId == null) return;
      var sl          = a.sourceLayer || 'building';
      var isSuppressed = !!(suppIds[sl] && suppIds[sl].indexOf(numId) !== -1);
      if (isSuppressed) {
        suppressedCount++;
      } else {
        unsuppressed.push(String(a.featureId || numId));
      }
    });

    return {
      replacementLayerPresent:    repPresent,
      replacementLayerIndex:      repIdx,
      highestBuildingLayerIndex:  highestBldgIdx,
      replacementAboveBuildings:  repPresent && repIdx > highestBldgIdx,
      suppressedReplacementCount: suppressedCount,
      visibleReplacementCount:    _stats.activeReplacements,
      unsuppressedReplacementIds: unsuppressed,
      layerOrder:                 layerOrder,
      lastDominanceRepairAt:      _lastDominanceRepairAt,
      lastError:                  _dominanceLastError,
    };
  }

  // styleParityStatus (0610N) — returns a parity audit snapshot for the Wall
  // replacement runtime. Confirms replacement layer is above source buildings,
  // source suppression is only active when replacements exist, and WOS replacement
  // actors do not participate in source-building suppression discovery.
  function styleParityStatus() {
    var map  = _getMap();
    var disc = map ? _discoverDominanceLayers(map) : null;

    var repPresent     = !!(disc && disc.replacementLayer);
    var repIdx         = repPresent ? disc.replacementLayer.index : -1;
    var highestBldgIdx = -1;
    var bldgCount      = disc ? disc.buildingLayers.length : 0;

    if (disc) {
      for (var i = 0; i < disc.buildingLayers.length; i++) {
        if (disc.buildingLayers[i].index > highestBldgIdx) {
          highestBldgIdx = disc.buildingLayers[i].index;
        }
      }
    }

    // Suppression audit from projection runtime
    var proj      = SBE.BuildingEditProjectionRuntime;
    var suppIds   = (proj && typeof proj.getSuppressionIds === 'function')
      ? proj.getSuppressionIds() : {};
    var suppCount = 0;
    var suppKeys  = Object.keys(suppIds);
    for (var si = 0; si < suppKeys.length; si++) {
      suppCount += suppIds[suppKeys[si]].length;
    }

    var snap = {
      version:                         VERSION,
      baseStyleAuthority:              'mapbox-studio',
      replacementLayerPresent:         repPresent,
      replacementLayerIndex:           repIdx,
      replacementAboveSourceBuildings: repPresent && repIdx > highestBldgIdx,
      sourceBuildingSuppressionActive: suppCount > 0,
      styleOwnedBuildingLayerCount:    bldgCount,
      wosReplacementActorCount:        _stats.actorCount,
      suppressionIdCount:              suppCount,
      // Replacement actors are excluded from suppression discovery by the 'wos-*' guard
      // in _discoverDominanceLayers and 'wos-replacement*' guard in projection runtime.
      wosLayersExcludedFromDiscovery:  true,
      parityOk:                        !repPresent || (repPresent && repIdx > highestBldgIdx),
      lastError:                       _dominanceLastError,
    };
    console.log('[BuildingReplacementRuntime] styleParityStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // repairDominance() — public full repair. Re-reads manifest, re-syncs all actors,
  // pushes replacement source, fixes layer order, re-applies source suppression.
  // Returns dominanceStatus() so callers can confirm the repair outcome.
  function repairDominance() {
    var map = _getMap();
    if (!map) {
      console.warn('[BuildingReplacementRuntime] repairDominance: map not available');
      return dominanceStatus();
    }
    // Re-read manifest and re-sync actors (sync calls _pushToMap + _repairDominance)
    var ok = _loadManifest();
    if (ok && _manifest) {
      _sync(map);
    } else {
      // Manifest failed but still repair layer order + suppression
      _pushToMap(map);
      _repairDominance(map);
    }
    console.log('[BuildingReplacementRuntime] repairDominance complete');
    return dominanceStatus();
  }

  // geometryStats() — returns part-count diagnostics across all active actors.
  // actor.partCount is written by _generateForActor on each render cycle.
  // Use after the map has loaded and at least one actor has been generated.
  function geometryStats() {
    var total = 0, maxParts = 0, count = 0;
    var breakdown = {};
    Object.keys(_actors).forEach(function (k) {
      var a = _actors[k];
      if (!a || !a.enabled || !a.resolved) return;
      count++;
      var pc = typeof a.partCount === 'number' ? a.partCount : 0;
      total   += pc;
      if (pc > maxParts) maxParts = pc;
      var arch = a.archetype || 'unknown';
      breakdown[arch] = (breakdown[arch] || 0) + 1;
    });
    return {
      actorCount:        count,
      averagePartCount:  count > 0 ? Math.round(total / count * 10) / 10 : 0,
      maxPartCount:      maxParts,
      archetypeBreakdown: breakdown,
    };
  }

  // materials() — returns the full ARCHETYPE_MATERIALS palette for inspection.
  function materials() {
    console.log('[BuildingReplacementRuntime] ARCHETYPE_MATERIALS:', JSON.stringify(ARCHETYPE_MATERIALS, null, 2));
    return ARCHETYPE_MATERIALS;
  }

  function status() {
    var snap = {
      actorCount:             _stats.actorCount,
      activeReplacements:     _stats.activeReplacements,
      archetypes:             _stats.archetypes,
      spawned:                _stats.spawned,
      updated:                _stats.updated,
      removed:                _stats.removed,
      footprintResolvedCount: _stats.footprintResolvedCount,
      fallbackCount:          _stats.fallbackCount,
      lastSpawn:              _stats.lastSpawn,
      lastError:              _stats.lastError,
    };
    console.log('[BuildingReplacementRuntime] status:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // groupStatus() — 0610J debug: returns group resolution counters from last _sync.
  function groupStatus() {
    var snap = {
      groupActorCount:           _groupStats.groupActorCount,
      standaloneActorCount:      _groupStats.standaloneActorCount,
      skippedGroupedMemberCount: _groupStats.skippedGroupedMemberCount,
      lastError:                 _groupStats.lastError,
    };
    console.log('[BuildingReplacementRuntime] groupStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // compoundStatus() — 0610K debug: returns compound resolution counters from last _sync.
  function compoundStatus() {
    var snap = {
      compoundActorCount:           _compoundStats.compoundActorCount,
      groupActorCount:              _compoundStats.groupActorCount,
      standaloneActorCount:         _compoundStats.standaloneActorCount,
      skippedCompoundMemberCount:   _compoundStats.skippedCompoundMemberCount,
      skippedCompoundGroupCount:    _compoundStats.skippedCompoundGroupCount,
      skippedGroupedMemberCount:    _compoundStats.skippedGroupedMemberCount,
      lastError:                    _compoundStats.lastError,
    };
    console.log('[BuildingReplacementRuntime] compoundStatus:', JSON.stringify(snap, null, 2));
    return snap;
  }

  // ── Camera-safe preview (0612I) ───────────────────────────────────────────────
  // One-command framing of a selected WOS replacement building. Production
  // workaround: uses camera control + editable basemap, NOT new suppression.

  var CAMERA_SAFE_DEFAULTS = {
    zoom:     17.25,
    pitch:    62,
    padding:  80,
    duration: 650,
  };

  function cameraSafePreview(buildingKey, opts) {
    opts = opts || {};
    var notes = [];
    var map = _getMap();
    if (!map) {
      console.warn('[BuildingReplacementRuntime] cameraSafePreview: map not available');
      return { ok: false, reason: 'MAP_NOT_READY' };
    }

    // ── Resolve target actor ──────────────────────────────────────────────────
    // Wall has no click-selection; accept an explicit key, else fall back to the
    // sole active replacement (the common one-building authoring case).
    var keys = Object.keys(_actors).filter(function (k) {
      return _actors[k] && _actors[k].enabled !== false;
    });
    var key = buildingKey || null;
    if (!key) {
      if (keys.length === 0) {
        console.warn('[BuildingReplacementRuntime] cameraSafePreview: no active replacements');
        return { ok: false, reason: 'NO_SELECTED_BUILDING', activeReplacementKeys: [] };
      }
      key = keys[0];
      if (keys.length > 1) {
        notes.push('multiple replacements active (' + keys.length + ') — defaulted to first: ' + key);
      }
    }
    var actor = _actors[key];
    if (!actor || typeof actor.lng !== 'number' || typeof actor.lat !== 'number') {
      console.warn('[BuildingReplacementRuntime] cameraSafePreview: no resolved geometry for', key);
      return { ok: false, reason: 'NO_SELECTED_BUILDING', requestedKey: key, activeReplacementKeys: keys };
    }

    // ── B4: editable flat basemap if available ────────────────────────────────
    var editableActive = false;
    var eba = SBE.EditableBasemapAuthority;
    var needsActivation = false;
    if (eba && typeof eba.activate === 'function') {
      var ebaState = null;
      try { ebaState = typeof eba.verify === 'function' ? eba.verify() : null; } catch (e) {}
      editableActive = !!(ebaState && ebaState.active);
      if (!editableActive) {
        needsActivation = true;
        notes.push('activating editable basemap (dark-v11) before framing');
        try { eba.activate(); editableActive = true; } catch (e) {
          notes.push('editable basemap activation error: ' + (e.message || e));
        }
      }
    } else {
      notes.push('EditableBasemapAuthority unavailable — framing on current basemap');
    }

    // ── B2: deterministic framing ─────────────────────────────────────────────
    var zoom    = (typeof opts.zoom    === 'number') ? opts.zoom    : CAMERA_SAFE_DEFAULTS.zoom;
    var pitch   = (typeof opts.pitch   === 'number') ? opts.pitch   : CAMERA_SAFE_DEFAULTS.pitch;
    var padding = (typeof opts.padding === 'number') ? opts.padding : CAMERA_SAFE_DEFAULTS.padding;
    var duration = (typeof opts.duration === 'number') ? opts.duration : CAMERA_SAFE_DEFAULTS.duration;
    // Bearing: align to building heading when known, else preserve current.
    var bearing;
    if (typeof opts.bearing === 'number') {
      bearing = opts.bearing;
    } else if (actor.footprint && typeof actor.footprint.heading === 'number') {
      bearing = actor.footprint.heading;
      notes.push('bearing aligned to building heading: ' + bearing.toFixed(1));
    } else {
      bearing = map.getBearing();
      notes.push('bearing preserved: ' + bearing.toFixed(1));
    }

    function _repairLayers() {
      // B3: replacement visibility guarantee — canonical runtime only
      try { reload(); } catch (e) { notes.push('reload error: ' + (e.message || e)); }
      try { repairDominance(); } catch (e) { notes.push('repairDominance error: ' + (e.message || e)); }
      _reduceClutter();
    }

    // B5: preview-only clutter reduction — temporarily lower the opacity of all
    // non-WOS fill-extrusion building layers so the replacement reads clearly.
    // No layers are added/removed; a style reload fully restores original paint.
    function _reduceClutter() {
      if (opts.reduceClutter === false) return;
      try {
        var layers = (map.getStyle().layers) || [];
        var reduced = 0;
        layers.forEach(function (l) {
          if (l.type !== 'fill-extrusion') return;
          if (l.id === 'wos-replacement-layer') return;
          try {
            map.setPaintProperty(l.id, 'fill-extrusion-opacity', 0.12);
            reduced++;
          } catch (e) {}
        });
        if (reduced > 0) notes.push('reduced opacity of ' + reduced + ' non-WOS building layer(s) to 0.12');
      } catch (e) {
        notes.push('clutter reduction error: ' + (e.message || e));
      }
    }

    var _framed = false;
    function _frameAndRepair() {
      if (_framed) return;
      _framed = true;
      _repairLayers();
      try {
        map.flyTo({
          center:   [actor.lng, actor.lat],
          zoom:     zoom,
          pitch:    pitch,
          bearing:  bearing,
          padding:  padding,
          duration: duration,
        });
      } catch (e) { notes.push('flyTo error: ' + (e.message || e)); }
      // Post-framing convergence: the style switch may wipe WOS layers after the
      // first repair pass (observed with dark-v11 activation). One more pass after
      // the camera settles guarantees the canonical layer survives.
      setTimeout(_repairLayers, duration + 600);
    }

    if (needsActivation) {
      // Editable basemap activation triggers an async style reload; frame after
      // the new style has actually loaded (idle can fire before the switch starts).
      map.once('style.load', function () { setTimeout(_frameAndRepair, 250); });
      // Safety net if 'style.load' never fires (style error / already loaded)
      setTimeout(_frameAndRepair, 5000);
    } else {
      _frameAndRepair();
    }

    // ── B6: shot-safe state report ────────────────────────────────────────────
    var replacementLayerExists = false;
    try { replacementLayerExists = !!map.getLayer('wos-replacement-layer'); } catch (e) {}

    var report = {
      ok:                     true,
      selectedBuildingKey:    key,
      replacementLayerExists: replacementLayerExists,
      editableBasemapActive:  editableActive,
      camera: {
        lng:     actor.lng,
        lat:     actor.lat,
        zoom:    zoom,
        pitch:   pitch,
        bearing: bearing,
      },
      visualMode: 'camera-safe-preview',
      notes:      notes,
    };
    console.log('[BuildingReplacementRuntime] cameraSafePreview:', JSON.stringify(report, null, 2));
    return report;
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.BuildingReplacementRuntime = Object.freeze({
    VERSION:            VERSION,
    init:               init,
    reload:             reload,
    clear:              clear,
    list:               list,
    status:             status,
    materials:          materials,                  // 0610C — returns ARCHETYPE_MATERIALS
    ARCHETYPE_MATERIALS: ARCHETYPE_MATERIALS,       // 0610C — direct palette access
    showFootprints:     showFootprints,             // 0610D — debug overlay toggle
    geometryStats:      geometryStats,              // 0610E — part-count diagnostics
    dominanceStatus:    dominanceStatus,            // 0610F — layer-order + suppression audit
    repairDominance:    repairDominance,            // 0610F — full re-sync + layer repair
    groupStatus:        groupStatus,               // 0610J — group resolution diagnostics
    compoundStatus:     compoundStatus,            // 0610K — compound resolution diagnostics
    styleParityStatus:  styleParityStatus,         // 0610N — parity audit
    // 0612C — sync repair + trace
    traceReplacementSync:       traceReplacementSync,
    repairReplacementSync:      repairReplacementSync,
    replacementSourceSnapshot:  replacementSourceSnapshot,
    // 0612I — camera-safe preview
    cameraSafePreview:          cameraSafePreview,
    // Shape generators exposed for testing
    generateWarehouse:        _generateWarehouse,
    generateSkyscraper:       _generateSkyscraper,
    generateApartment:        _generateApartment,
    generateRadioTower:       _generateRadioTower,
    generatePagoda:           _generatePagoda,
    generateCivicBlock:       _generateCivicBlock,
    generateIndustrialStack:  _generateIndustrialStack,
    generatePlaceholder:      _generatePlaceholder,
    // Footprint helpers exposed for testing
    extractFootprint:         _extractFootprint,
    polygonAreaM2:            _polygonAreaM2,
    boundsForRing:            _boundsForRing,
    dimensionsFromBounds:     _dimensionsFromBounds,
    headingFromLongestEdge:   _headingFromLongestEdge,
    centroidForRing:          _centroidForRing,
  });

  // Self-wire debug binding (runtime loads after main.js)
  // 0610N: styleParityStatus now on this ref via _wos.debug.buildingReplacement.styleParityStatus()
  if (global._wos && global._wos.debug) {
    global._wos.debug.buildingReplacement = SBE.BuildingReplacementRuntime;
  }
  // 0612I: main.js's onReady callback replaces _wos.debug after boot, nulling the
  // parse-time binding above. Re-wire after the map is ready (fires after main.js).
  (function _rewireDebugAfterBoot() {
    var mvr = SBE.MapboxViewportRuntime;
    function rewire() {
      global._wos       = global._wos       || {};
      global._wos.debug = global._wos.debug || {};
      global._wos.debug.buildingReplacement = SBE.BuildingReplacementRuntime;
    }
    if (mvr && typeof mvr.onReady === 'function') mvr.onReady(rewire);
    else setTimeout(rewire, 3000);
  })();

  SBE.BuildingReplacementRuntime.init();

  console.log('[BuildingReplacementRuntime] v' + VERSION + ' loaded | opacity:', LAYER_OPACITY, '| materials: 8 archetypes | geometry: manifest-priority | style-kit: deferred | dominance: active | groups: active | compounds: active | style-parity: active | sync-repair: active (0612C)');

})(window);
