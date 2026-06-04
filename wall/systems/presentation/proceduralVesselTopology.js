// ── ProceduralVesselTopology v1.0.1 ──────────────────────────────────────────
// 0525F_WOS_ProceduralVesselTopology_v1.0.1
// Status: active
// Classification: procedural-vessel-semantic-topology-presentation-system
//
// Semantic vessel topology grammar for recognizable low-resolution maritime
// rendering. Upgrades vessel presentation from generic symbolic markers toward
// class-distinguishable silhouettes without photorealistic rendering.
//
// Core doctrine:
//   Low-resolution recognition beats high-detail realism.
//   Topology defines structure. Style systems define appearance.
//   2.5D interprets topology. Topology does not hardcode perspective.
//
// Coordinate system (blueprint space):
//   xNorm: 0.0 = bow (forward),  1.0 = stern (aft)
//   yNorm: 0.0 = port (left),    1.0 = starboard (right)
//   center = (0.5, 0.5)
//
//   Renderer local frame (bow = -Y):
//     render_y = (xNorm - 0.5) * lenPx
//     render_x = (yNorm - 0.5) * beamPx
//     prim width (beam axis) = hNorm * beamPx
//     prim height (length axis) = wNorm * lenPx
//
// Authority boundaries:
//   OWNS: topology blueprint schema, primitive generation, LOD geometry
//     selection, class silhouette generation, anchor generation.
//   MAY OBSERVE: vessel class, MaritimeStyleRegistry, VisibilityClassRuntime,
//     SurfaceStylePresetRuntime, population tier, zoom, LOD request.
//   MAY NOT MUTATE: AIS truth, vessel coordinates, wake persistence,
//     visibilityClass, population hierarchy, camera targets, renderer state.
//
// Integration path:
//   AISRuntime → MaritimeVesselTaxonomy → MaritimeStyleRegistry
//   → VisibilityClassRuntime → ProceduralVesselTopology
//   → MaritimeOccupancyRenderer → 2D / 2.5D Presentation
//
// Placement: wall/systems/presentation/proceduralVesselTopology.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Version ───────────────────────────────────────────────────────────────────
  var VERSION = '1.0.1';

  // ── System Constants ──────────────────────────────────────────────────────────
  var DEFAULT_MIN_TOPOLOGY_ZOOM      = 11.8;
  var DEFAULT_MIN_CLOSE_DETAIL_ZOOM  = 13.2;
  var DEFAULT_MAX_JITTER_NORM        = 0.025;
  var MAX_PRIMITIVES_PER_TOPOLOGY    = 48;
  var MAX_PRIMITIVES_PER_CLOSE_DETAIL = 96;

  // ── LOD Levels ────────────────────────────────────────────────────────────────
  var LOD_LIGHT        = 'LIGHT';
  var LOD_MARKER       = 'MARKER';
  var LOD_SILHOUETTE   = 'SILHOUETTE';
  var LOD_TOPOLOGY     = 'TOPOLOGY';
  var LOD_CLOSE_DETAIL = 'CLOSE_DETAIL';

  var LOD_RANK = Object.freeze({
    LIGHT:        0,
    MARKER:       1,
    SILHOUETTE:   2,
    TOPOLOGY:     3,
    CLOSE_DETAIL: 4,
  });

  var VALID_LODS = Object.freeze([
    LOD_LIGHT, LOD_MARKER, LOD_SILHOUETTE, LOD_TOPOLOGY, LOD_CLOSE_DETAIL,
  ]);

  var VALID_PRIMITIVE_TYPES = Object.freeze([
    'polygon', 'rect', 'roundedRect', 'circle', 'line', 'stack', 'band',
  ]);

  var VALID_FILL_ROLES = Object.freeze([
    'hull', 'deck', 'accent', 'light', 'shadow',
  ]);

  // ── Canonical Vessel Classes ──────────────────────────────────────────────────
  var CANONICAL_CLASSES = Object.freeze([
    'cargo', 'tanker', 'ferry', 'service', 'recreational', 'fishing',
    'passenger', 'tug', 'military', 'industrial', 'unknown', 'default',
  ]);

  // ── Default Variation / LOD Policy ───────────────────────────────────────────
  var _DEFAULT_VARIATION = Object.freeze({
    seedable:          true,
    maxJitterNorm:     DEFAULT_MAX_JITTER_NORM,
    asymmetryStrength: 0.0,
  });

  var _DEFAULT_LOD_POLICY = Object.freeze({
    minTopologyZoom:    DEFAULT_MIN_TOPOLOGY_ZOOM,
    minCloseDetailZoom: DEFAULT_MIN_CLOSE_DETAIL_ZOOM,
    allow2_5D:          true,
  });

  // ── Primitive Factory ─────────────────────────────────────────────────────────
  //
  // _p(id, type, role, xNorm, yNorm, wNorm, hNorm, fillRole, visibleFromLOD, extra?)
  //
  //   id:            unique string within blueprint
  //   type:          VesselTopologyPrimitiveType
  //   role:          semantic label ('hull','bridge','hatch','tank',etc.)
  //   xNorm:         bow-stern center [0..1]
  //   yNorm:         port-starboard center [0..1]
  //   wNorm:         extent along vessel length axis [0..1]
  //   hNorm:         extent across vessel beam axis [0..1]
  //   fillRole:      palette key ('hull','deck','accent','light','shadow')
  //   visibleFromLOD: minimum LOD at which this primitive is drawn
  //   extra:         optional {rotationDeg, bowShoulderFrac, sternWidthFrac, ...}

  function _p(id, type, role, xN, yN, wN, hN, fillRole, lodFrom, extra) {
    var prim = {
      primitiveId:    id,
      type:           type,
      role:           role,
      xNorm:          xN,
      yNorm:          yN,
      wNorm:          wN,
      hNorm:          hN,
      fillRole:       fillRole || 'hull',
      visibleFromLOD: lodFrom  || LOD_SILHOUETTE,
    };
    if (extra) {
      var eks = Object.keys(extra);
      for (var ei = 0; ei < eks.length; ei++) prim[eks[ei]] = extra[eks[ei]];
    }
    return Object.freeze(prim);
  }

  // ── Blueprint Factory ─────────────────────────────────────────────────────────

  function _bp(classKey, primitives, variation, lodPolicy) {
    return Object.freeze({
      blueprintId: classKey + '::v' + VERSION,
      version:     VERSION,
      classKey:    classKey,
      primitives:  Object.freeze(primitives.slice()),
      variation:   Object.freeze(Object.assign({}, _DEFAULT_VARIATION,  variation  || {})),
      lodPolicy:   Object.freeze(Object.assign({}, _DEFAULT_LOD_POLICY, lodPolicy  || {})),
    });
  }

  // ── Canonical Blueprint Definitions ───────────────────────────────────────────
  //
  // Coordinate doctrine (see file header):
  //   xNorm 0 = bow, 1 = stern   |   yNorm 0 = port, 1 = starboard
  //   center at (0.5, 0.5)
  //
  // Hull polygon extra fields:
  //   bowShoulderFrac  [0..1] — fraction of half-length where hull widens (lower = sharper bow)
  //   sternWidthFrac   [0..1] — stern beam as fraction of full beam (higher = wider stern)
  //
  // Deck primitives are drawn OVER the hull in the renderer.
  // Shadow primitives darken a zone (e.g. cargo holds, open deck recesses).
  // Accent/light primitives provide the class colour pop.

  function _compileBlueprints() {
    var blueprints = {};

    // ── CARGO — container ship ───────────────────────────────────────────────
    // Long rectangular hull, aft superstructure block, cargo hatch rhythm.
    // Visual identity: hatches amidships, bridge sitting high at stern quarter.
    blueprints.cargo = _bp('cargo', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.22, sternWidthFrac: 0.55 }),
      _p('bridge',      'rect',     'superstructure',0.80, 0.50, 0.18, 0.76, 'deck',   LOD_SILHOUETTE),
      _p('forecastle',  'rect',     'forecastle',   0.05, 0.50, 0.09, 0.75, 'deck',   LOD_TOPOLOGY),
      _p('hatch_band',  'rect',     'deck',         0.42, 0.50, 0.45, 0.65, 'shadow', LOD_TOPOLOGY),
      _p('hatch_1',     'rect',     'hatch',        0.22, 0.50, 0.12, 0.58, 'shadow', LOD_TOPOLOGY),
      _p('hatch_2',     'rect',     'hatch',        0.40, 0.50, 0.12, 0.58, 'shadow', LOD_TOPOLOGY),
      _p('hatch_3',     'rect',     'hatch',        0.56, 0.50, 0.09, 0.58, 'shadow', LOD_TOPOLOGY),
      _p('box_col_a',   'rect',     'cargo',        0.32, 0.30, 0.30, 0.22, 'accent', LOD_CLOSE_DETAIL),
      _p('box_col_b',   'rect',     'cargo',        0.32, 0.70, 0.30, 0.22, 'accent', LOD_CLOSE_DETAIL),
    ]);

    // ── TANKER — liquid bulk carrier ─────────────────────────────────────────
    // Low industrial profile, spine walkway, tank domes along centreline, aft bridge.
    // Visual identity: straight centreline spine, evenly-spaced tank circles.
    blueprints.tanker = _bp('tanker', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.25, sternWidthFrac: 0.60 }),
      _p('bridge',      'rect',     'superstructure',0.81, 0.50, 0.16, 0.74, 'deck',   LOD_SILHOUETTE),
      _p('spine',       'band',     'spine',        0.50, 0.50, 0.68, 0.12, 'shadow', LOD_TOPOLOGY),
      _p('tank_1',      'circle',   'tank',         0.20, 0.50, 0.10, 0.28, 'deck',   LOD_TOPOLOGY),
      _p('tank_2',      'circle',   'tank',         0.34, 0.50, 0.10, 0.28, 'deck',   LOD_TOPOLOGY),
      _p('tank_3',      'circle',   'tank',         0.48, 0.50, 0.10, 0.28, 'deck',   LOD_TOPOLOGY),
      _p('tank_4',      'circle',   'tank',         0.62, 0.50, 0.10, 0.28, 'deck',   LOD_TOPOLOGY),
      _p('funnel',      'rect',     'funnel',       0.86, 0.50, 0.05, 0.20, 'accent', LOD_CLOSE_DETAIL),
    ]);

    // ── FERRY — passenger ferry ──────────────────────────────────────────────
    // Broad hull, large cabin block amidships-to-bow, forward bridge.
    // Visual identity: wide body, cabin nearly full-beam, bright upper deck.
    blueprints.ferry = _bp('ferry', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.18, sternWidthFrac: 0.72 }),
      _p('cabin',       'rect',     'cabin',        0.38, 0.50, 0.65, 0.88, 'accent', LOD_SILHOUETTE),
      _p('bridge',      'rect',     'superstructure',0.16, 0.50, 0.14, 0.58, 'deck',   LOD_TOPOLOGY),
      _p('window_band', 'rect',     'windows',      0.38, 0.50, 0.60, 0.84, 'light',  LOD_CLOSE_DETAIL),
      _p('sun_deck',    'rect',     'deck',         0.56, 0.50, 0.25, 0.68, 'deck',   LOD_CLOSE_DETAIL),
    ]);

    // ── TUG — harbor tug ─────────────────────────────────────────────────────
    // Short wide hull, oversized bridge, aggressive bow, towing hardware at stern.
    // Visual identity: hull nearly as wide as long, bridge dominates.
    blueprints.tug = _bp('tug', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.28, sternWidthFrac: 0.82 }),
      _p('bridge',      'rect',     'superstructure',0.42, 0.50, 0.48, 0.82, 'deck',   LOD_SILHOUETTE),
      _p('bow_deck',    'rect',     'deck',         0.12, 0.50, 0.18, 0.70, 'deck',   LOD_TOPOLOGY),
      _p('stern_winch', 'rect',     'equipment',    0.84, 0.50, 0.10, 0.50, 'shadow', LOD_TOPOLOGY),
      _p('exhaust',     'circle',   'funnel',       0.48, 0.50, 0.06, 0.15, 'accent', LOD_CLOSE_DETAIL),
    ], { asymmetryStrength: 0.0 });

    // ── FISHING — fishing vessel ─────────────────────────────────────────────
    // Medium hull, deckhouse offset to port, open stern working deck.
    // Visual identity: asymmetric cabin placement, cluttered aft deck.
    blueprints.fishing = _bp('fishing', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.20, sternWidthFrac: 0.52 }),
      _p('cabin',       'rect',     'cabin',        0.35, 0.30, 0.32, 0.46, 'deck',   LOD_TOPOLOGY),
      _p('aft_deck',    'rect',     'deck',         0.74, 0.50, 0.28, 0.80, 'shadow', LOD_TOPOLOGY),
      _p('gear_port',   'rect',     'equipment',    0.70, 0.22, 0.14, 0.18, 'accent', LOD_TOPOLOGY),
      _p('mast',        'line',     'mast',         0.22, 0.50, 0.08, 0.04, 'accent', LOD_CLOSE_DETAIL),
    ], { asymmetryStrength: 0.4, maxJitterNorm: 0.02 });

    // ── RECREATIONAL — small pleasure craft ──────────────────────────────────
    // Small slim hull, tiny forward cabin, lightweight silhouette.
    // Visual identity: narrow profile, pointed bow, minimal superstructure.
    blueprints.recreational = _bp('recreational', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.14, sternWidthFrac: 0.45 }),
      _p('cabin',       'roundedRect','cabin',      0.22, 0.50, 0.20, 0.52, 'deck',   LOD_TOPOLOGY),
      _p('cockpit',     'rect',     'deck',         0.58, 0.50, 0.28, 0.65, 'shadow', LOD_TOPOLOGY),
    ]);

    // ── PASSENGER — cruise / large passenger ship ─────────────────────────────
    // Wide hull, horizontal deck bands communicate layered passenger decks.
    // Visual identity: multiple horizontal layers, forward bridge, broad massing.
    blueprints.passenger = _bp('passenger', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.18, sternWidthFrac: 0.74 }),
      _p('deck_band',   'rect',     'deck',         0.42, 0.50, 0.62, 0.84, 'accent', LOD_SILHOUETTE),
      _p('superblock',  'rect',     'superstructure',0.34, 0.50, 0.46, 0.76, 'deck',   LOD_TOPOLOGY),
      _p('bridge',      'rect',     'bridge',       0.15, 0.50, 0.16, 0.58, 'shadow', LOD_TOPOLOGY),
      _p('upper_band',  'rect',     'upper',        0.30, 0.50, 0.35, 0.72, 'light',  LOD_CLOSE_DETAIL),
      _p('funnel_pair', 'rect',     'funnel',       0.56, 0.50, 0.08, 0.32, 'accent', LOD_CLOSE_DETAIL),
    ]);

    // ── SERVICE — pilot / coast guard / SAR ──────────────────────────────────
    // Medium utility hull, work platform forward, compact cabin amidships.
    blueprints.service = _bp('service', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.22, sternWidthFrac: 0.62 }),
      _p('cabin',       'roundedRect','cabin',      0.30, 0.50, 0.28, 0.62, 'deck',   LOD_TOPOLOGY),
      _p('work_deck',   'rect',     'deck',         0.68, 0.50, 0.28, 0.78, 'shadow', LOD_TOPOLOGY),
      _p('bow_platform','rect',     'deck',         0.10, 0.50, 0.12, 0.55, 'deck',   LOD_TOPOLOGY),
      _p('equipment',   'rect',     'equipment',    0.72, 0.50, 0.12, 0.38, 'accent', LOD_CLOSE_DETAIL),
    ]);

    // ── MILITARY — naval vessel ───────────────────────────────────────────────
    // Lean disciplined hull, minimal angular superstructure, restrained profile.
    // Visual identity: low silhouette, angular shapes, minimal lights.
    // Doctrine: must never imply combat state.
    blueprints.military = _bp('military', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.20, sternWidthFrac: 0.48 }),
      _p('superstructure','rect',   'superstructure',0.38, 0.50, 0.34, 0.56, 'deck',   LOD_TOPOLOGY),
      _p('forward_deck','rect',     'deck',         0.12, 0.50, 0.16, 0.42, 'deck',   LOD_TOPOLOGY),
      _p('mast',        'line',     'mast',         0.35, 0.50, 0.06, 0.04, 'deck',   LOD_TOPOLOGY),
      _p('funnel',      'rect',     'funnel',       0.54, 0.50, 0.04, 0.14, 'shadow', LOD_CLOSE_DETAIL),
    ]);

    // ── INDUSTRIAL — barge / platform / dredger ──────────────────────────────
    // Wide flat hull, large machinery blocks, platform-like silhouette.
    // Visual identity: very wide relative to length, machinery dominates.
    blueprints.industrial = _bp('industrial', [
      _p('hull',        'polygon',  'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE,
         { bowShoulderFrac: 0.32, sternWidthFrac: 0.88 }),
      _p('mach_fwd',    'rect',     'machinery',    0.22, 0.50, 0.32, 0.78, 'deck',   LOD_TOPOLOGY),
      _p('mach_aft',    'rect',     'machinery',    0.66, 0.50, 0.32, 0.70, 'deck',   LOD_TOPOLOGY),
      _p('crane_base',  'rect',     'crane',        0.22, 0.50, 0.10, 0.18, 'accent', LOD_CLOSE_DETAIL),
      _p('pipe_run',    'band',     'pipe',         0.50, 0.50, 0.80, 0.08, 'shadow', LOD_CLOSE_DETAIL),
    ]);

    // ── UNKNOWN — unresolved vessel class ────────────────────────────────────
    // Simple hull with accent indicator — class uncertainty, not default fallback.
    blueprints.unknown = _bp('unknown', [
      _p('hull',        'rect',     'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE),
      _p('id_dot',      'circle',   'marker',       0.50, 0.50, 0.18, 0.35, 'accent', LOD_TOPOLOGY),
    ]);

    // ── DEFAULT — defensive fallback ─────────────────────────────────────────
    blueprints['default'] = _bp('default', [
      _p('hull',        'rect',     'hull',         0.50, 0.50, 1.00, 1.00, 'hull',   LOD_SILHOUETTE),
    ]);

    return blueprints;
  }

  // ── Registry ──────────────────────────────────────────────────────────────────

  var _blueprints = _compileBlueprints();

  // ── Class Normalization ───────────────────────────────────────────────────────

  var _CLASS_ALIASES = Object.freeze({
    // AIS type names → canonical
    'container':   'cargo',
    'bulk':        'cargo',
    'general':     'cargo',
    'liquid':      'tanker',
    'chemical':    'tanker',
    'gas':         'tanker',
    'passenger':   'passenger',
    'cruise':      'passenger',
    'ro_ro':       'ferry',
    'ro-ro':       'ferry',
    'pilot':       'service',
    'coast_guard': 'service',
    'coastguard':  'service',
    'sar':         'service',
    'tug':         'tug',
    'salvage':     'tug',
    'dredger':     'industrial',
    'platform':    'industrial',
    'barge':       'industrial',
    'crane':       'industrial',
    'sailing':     'recreational',
    'yacht':       'recreational',
    'pleasure':    'recreational',
    'speedboat':   'recreational',
    'naval':       'military',
    'warship':     'military',
    'law_enforcement': 'military',
    'fishing':     'fishing',
    'research':    'service',
    'hospital':    'service',
    'supply':      'service',
    'standby':     'service',
    'survey':      'service',
    'trawler':     'fishing',
  });

  /**
   * normalizeTopologyClass(classKey)
   *
   * Normalize a raw vessel class string to a canonical topology class key.
   * Returns 'unknown' for unresolvable inputs (not 'default').
   *
   * @param  {string|null|undefined} classKey
   * @return {string} canonical class key
   */
  function normalizeTopologyClass(classKey) {
    if (!classKey || typeof classKey !== 'string') return 'unknown';
    var k = classKey.toLowerCase().trim();
    if (_blueprints[k]) return k;
    if (_CLASS_ALIASES[k]) return _CLASS_ALIASES[k];
    return 'unknown';
  }

  /**
   * getTopologyBlueprint(classKey)
   *
   * Return the VesselTopologyBlueprint for a class key.
   * Falls back to 'unknown' then 'default' if the class is not registered.
   *
   * @param  {string} classKey
   * @return {VesselTopologyBlueprint}
   */
  function getTopologyBlueprint(classKey) {
    var k = normalizeTopologyClass(classKey);
    return _blueprints[k] || _blueprints['unknown'] || _blueprints['default'];
  }

  // ── LOD Resolution ────────────────────────────────────────────────────────────

  /**
   * resolveTopologyLOD(visibilityClass, zoom, populationTier)
   *
   * Resolve the appropriate VesselTopologyLOD given current conditions.
   * Topology may degrade detail. It may not restore suppressed detail.
   *
   * @param  {string|null} visibilityClass  — from AtmosphericReadability / VisibilityClassRuntime
   * @param  {number|null} zoom
   * @param  {string|null} populationTier   — HERO / MID / BACKGROUND / GHOST
   * @return {VesselTopologyLOD}
   */
  function resolveTopologyLOD(visibilityClass, zoom, populationTier) {
    // Hidden / light-only: never emit hull geometry
    if (visibilityClass === 'ATMOSPHERIC_HIDDEN' ||
        visibilityClass === 'LIGHT_ONLY') {
      return LOD_LIGHT;
    }
    if (visibilityClass === 'MARKER_ONLY') {
      return LOD_MARKER;
    }
    if (visibilityClass === 'SILHOUETTE') {
      return LOD_SILHOUETTE;
    }

    var z = (typeof zoom === 'number') ? zoom : 0;

    if (visibilityClass === 'REDUCED') {
      return z >= DEFAULT_MIN_TOPOLOGY_ZOOM ? LOD_TOPOLOGY : LOD_SILHOUETTE;
    }

    // FULL (or null/unset — default to full resolution path)
    if (visibilityClass === 'FULL' || !visibilityClass) {
      if (populationTier === 'HERO' && z >= DEFAULT_MIN_CLOSE_DETAIL_ZOOM) {
        return LOD_CLOSE_DETAIL;
      }
      return z >= DEFAULT_MIN_TOPOLOGY_ZOOM ? LOD_TOPOLOGY : LOD_SILHOUETTE;
    }

    return LOD_SILHOUETTE;
  }

  // ── Seeded Jitter ─────────────────────────────────────────────────────────────
  // Deterministic per-vessel variation. Uses a simple sinusoidal hash.
  // jitter range: [-maxJitter, +maxJitter] in normalized space.

  function _seededJitter(seed, index, maxJitter) {
    if (!maxJitter) return 0;
    var raw = Math.sin(seed * 9301.0 + index * 49297.0 + 233.0) * 10000.0;
    return (raw - Math.floor(raw) - 0.5) * 2.0 * maxJitter;
  }

  // ── Topology Instance ─────────────────────────────────────────────────────────

  /**
   * createTopologyInstance(input)
   *
   * Create a VesselTopologyInstance from a draw-call input.
   * Resolves LOD and records seed for emitGeometryPlan.
   *
   * @param  {object} input
   * @param  {string}      input.classKey
   * @param  {number}      [input.vesselSeed=0]   — MMSI-derived seed for variation
   * @param  {string|null} [input.visibilityClass]
   * @param  {number|null} [input.zoom]
   * @param  {string|null} [input.populationTier]
   * @param  {number}      [input.lenPx]           — rendered length in pixels
   * @param  {number}      [input.beamPx]          — rendered beam in pixels
   * @return {VesselTopologyInstance}
   */
  function createTopologyInstance(input) {
    var classKey    = normalizeTopologyClass(input && input.classKey);
    var blueprint   = _blueprints[classKey] || _blueprints['default'];
    var lod         = resolveTopologyLOD(
      input && input.visibilityClass,
      input && input.zoom,
      input && input.populationTier
    );
    return Object.freeze({
      instanceId:  classKey + '::' + (input && input.vesselSeed || 0) + '::' + lod,
      blueprintId: blueprint.blueprintId,
      classKey:    classKey,
      lod:         lod,
      seed:        (input && typeof input.vesselSeed === 'number') ? input.vesselSeed : 0,
      lenPx:       (input && input.lenPx)  || 0,
      beamPx:      (input && input.beamPx) || 0,
    });
  }

  // ── Geometry Plan Emission ────────────────────────────────────────────────────

  /**
   * emitGeometryPlan(instance)
   *
   * Emit the ordered list of VesselTopologyPrimitives for a given instance.
   *
   * Filtering rule: primitive is included when
   *   LOD_RANK[primitive.visibleFromLOD] <= LOD_RANK[instance.lod]
   *
   * Jitter is applied to xNorm/yNorm of non-hull primitives using the instance
   * seed, staying within the blueprint's maxJitterNorm.
   *
   * Returns empty array for LIGHT and MARKER LODs (renderer handles those).
   *
   * @param  {VesselTopologyInstance} instance
   * @return {readonly VesselTopologyPrimitive[]}
   */
  function emitGeometryPlan(instance) {
    if (!instance) return Object.freeze([]);

    var instanceLODRank = LOD_RANK[instance.lod];
    if (instanceLODRank === undefined) return Object.freeze([]);

    // LIGHT and MARKER: renderer handles independently — no hull geometry
    if (instance.lod === LOD_LIGHT || instance.lod === LOD_MARKER) {
      return Object.freeze([]);
    }

    var blueprint = _blueprints[instance.classKey] || _blueprints['default'];
    var maxJitter = blueprint.variation.maxJitterNorm;
    var prims     = blueprint.primitives;
    var result    = [];

    for (var i = 0; i < prims.length; i++) {
      var prim    = prims[i];
      var primRank = LOD_RANK[prim.visibleFromLOD];
      if (primRank === undefined || primRank > instanceLODRank) continue;

      // Apply deterministic jitter to non-hull primitives
      if (prim.role !== 'hull' && maxJitter > 0 && blueprint.variation.seedable) {
        var jx = _seededJitter(instance.seed, i * 2,     maxJitter);
        var jy = _seededJitter(instance.seed, i * 2 + 1, maxJitter);
        // Clone primitive with jitter applied
        var jittered = Object.assign({}, prim, {
          xNorm: Math.max(0.01, Math.min(0.99, prim.xNorm + jx)),
          yNorm: Math.max(0.02, Math.min(0.98, prim.yNorm + jy)),
        });
        result.push(Object.freeze(jittered));
      } else {
        result.push(prim);
      }

      if (result.length >= MAX_PRIMITIVES_PER_TOPOLOGY) break;
    }

    return Object.freeze(result);
  }

  // ── Validation ────────────────────────────────────────────────────────────────

  /**
   * validateBlueprints()
   *
   * Run integrity check across all registered blueprints.
   *
   * @return {{ pass: boolean, errors: string[] }}
   */
  function validateBlueprints() {
    var errors = [];
    var keys   = Object.keys(_blueprints);

    // All canonical classes must have blueprints
    for (var ci = 0; ci < CANONICAL_CLASSES.length; ci++) {
      if (!_blueprints[CANONICAL_CLASSES[ci]]) {
        errors.push('Missing blueprint for canonical class: ' + CANONICAL_CLASSES[ci]);
      }
    }

    // 'unknown' and 'default' must remain distinct
    if (_blueprints.unknown && _blueprints['default'] &&
        _blueprints.unknown.blueprintId === _blueprints['default'].blueprintId) {
      errors.push('unknown and default blueprints must be distinct');
    }

    for (var bi = 0; bi < keys.length; bi++) {
      var bp = _blueprints[keys[bi]];

      if (!bp.blueprintId || !bp.classKey || !bp.primitives) {
        errors.push(keys[bi] + ': missing required blueprint fields');
        continue;
      }

      var prims = bp.primitives;
      if (prims.length > MAX_PRIMITIVES_PER_TOPOLOGY) {
        errors.push(keys[bi] + ': ' + prims.length + ' primitives exceeds MAX (' +
          MAX_PRIMITIVES_PER_TOPOLOGY + ')');
      }

      for (var pi = 0; pi < prims.length; pi++) {
        var p = prims[pi];
        if (VALID_PRIMITIVE_TYPES.indexOf(p.type) === -1) {
          errors.push(keys[bi] + '[' + pi + '] unknown type: ' + p.type);
        }
        if (VALID_FILL_ROLES.indexOf(p.fillRole) === -1) {
          errors.push(keys[bi] + '[' + pi + '] unknown fillRole: ' + p.fillRole);
        }
        if (VALID_LODS.indexOf(p.visibleFromLOD) === -1) {
          errors.push(keys[bi] + '[' + pi + '] unknown visibleFromLOD: ' + p.visibleFromLOD);
        }
        if (p.xNorm < 0 || p.xNorm > 1 || p.yNorm < 0 || p.yNorm > 1) {
          errors.push(keys[bi] + '[' + pi + '] xNorm/yNorm out of [0,1]');
        }
        if (p.wNorm <= 0 || p.hNorm <= 0) {
          errors.push(keys[bi] + '[' + pi + '] wNorm/hNorm must be > 0');
        }
      }
    }

    return { pass: errors.length === 0, errors: errors };
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.ProceduralVesselTopology = Object.freeze({

    // Core API
    normalizeTopologyClass:  normalizeTopologyClass,
    getTopologyBlueprint:    getTopologyBlueprint,
    resolveTopologyLOD:      resolveTopologyLOD,
    createTopologyInstance:  createTopologyInstance,
    emitGeometryPlan:        emitGeometryPlan,

    // Introspection
    validateBlueprints:      validateBlueprints,
    getAllBlueprints:         function() { return Object.freeze(Object.assign({}, _blueprints)); },

    // System constants
    CONSTANTS: Object.freeze({
      VERSION:                      VERSION,
      DEFAULT_MIN_TOPOLOGY_ZOOM:    DEFAULT_MIN_TOPOLOGY_ZOOM,
      DEFAULT_MIN_CLOSE_DETAIL_ZOOM:DEFAULT_MIN_CLOSE_DETAIL_ZOOM,
      DEFAULT_MAX_JITTER_NORM:      DEFAULT_MAX_JITTER_NORM,
      MAX_PRIMITIVES_PER_TOPOLOGY:  MAX_PRIMITIVES_PER_TOPOLOGY,
      MAX_PRIMITIVES_PER_CLOSE_DETAIL: MAX_PRIMITIVES_PER_CLOSE_DETAIL,
      VALID_LODS:                   VALID_LODS,
      VALID_PRIMITIVE_TYPES:        VALID_PRIMITIVE_TYPES,
      VALID_FILL_ROLES:             VALID_FILL_ROLES,
      CANONICAL_CLASSES:            CANONICAL_CLASSES,
      LOD_RANK:                     LOD_RANK,
      LOD_LIGHT:                    LOD_LIGHT,
      LOD_MARKER:                   LOD_MARKER,
      LOD_SILHOUETTE:               LOD_SILHOUETTE,
      LOD_TOPOLOGY:                 LOD_TOPOLOGY,
      LOD_CLOSE_DETAIL:             LOD_CLOSE_DETAIL,
    }),
  });

  console.log('[ProceduralVesselTopology] v' + VERSION + ' loaded — ' +
    Object.keys(_blueprints).length + ' class blueprints registered');

})(window);
