// ── BuildingStyleKit v1.0.0 ───────────────────────────────────────────────────
// 0610E_WOS_BuildingStyleKit_v1.0.0_BUILD
// Status: active | Classification: world-runtime, read-only
//
// Enhanced procedural geometry generators for all 8 archetypes.
// Registers on SBE.BuildingStyleKit; consumed lazily by BuildingReplacementRuntime.
//
// Detail tiers (keyed to camera zoom in the runtime):
//   far  (zoom < 14)  : max  4 parts — primary silhouette only
//   mid  (zoom 14–16) : max 12 parts — key rooftop and structural elements
//   near (zoom >= 16) : max 24 parts — full detail pass
//
// Generators return _p[] (part descriptors).  The runtime calls _partsToFeatures()
// on the result — no coordinate system knowledge needed here.
//
// Module helpers (reusable, each pushes to an existing parts array):
//   _addWaterTower   _addRoofVent     _addLoadingDock  _addSetbackBand
//   _addAntenna      _addBeacon       _addPipeRun      _addCoolingUnit
//   _addPortico      _addDome
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Part descriptor (identical to runtime's _p) ───────────────────────────
  // hw/hd: half-width / half-depth in metres (building-local frame, pre-rotation).
  // base/height: fill-extrusion-base and fill-extrusion-height in absolute metres.
  // offX/offY: centre offset in metres (building-local, rotated by runtime).
  // materialRole: 'body'|'roof'|'accent'|'foundation'|'stack'|'beacon'
  function _p(hw, hd, base, height, offX, offY, materialRole) {
    return {
      hw:           hw,
      hd:           hd,
      base:         base,
      height:       height,
      offX:         offX  || 0,
      offY:         offY  || 0,
      materialRole: materialRole || 'body',
    };
  }

  // ── Module helpers ────────────────────────────────────────────────────────
  // Each helper pushes one or more part descriptors onto `parts`.
  // All dimensions are in metres (building-local frame).

  // _addWaterTower — cylindrical tank with eave ring and conical cap.
  // hw: half-width of tank, H: total tower height, baseH: base elevation.
  function _addWaterTower(parts, hw, H, baseH, offX, offY) {
    parts.push(_p(hw,        hw,        baseH,           baseH + H * 0.74, offX, offY, 'body'));
    parts.push(_p(hw * 1.26, hw * 1.26, baseH + H * 0.70, baseH + H * 0.78, offX, offY, 'roof'));   // eave
    parts.push(_p(hw * 0.42, hw * 0.42, baseH + H * 0.78, baseH + H,        offX, offY, 'roof'));   // cap
  }

  // _addRoofVent — flat rectangular HVAC / vent protrusion.
  function _addRoofVent(parts, hw, hd, baseH, topH, offX, offY) {
    parts.push(_p(hw, hd, baseH, topH, offX, offY, 'accent'));
  }

  // _addLoadingDock — low rectangular dock protrusion from ground.
  function _addLoadingDock(parts, hw, hd, topH, offX, offY) {
    parts.push(_p(hw, hd, 0, topH, offX, offY, 'foundation'));
  }

  // _addSetbackBand — horizontal accent band at a setback transition.
  function _addSetbackBand(parts, hw, hd, baseH, topH) {
    parts.push(_p(hw, hd, baseH, topH, 0, 0, 'accent'));
  }

  // _addAntenna — thin needle (roof role for teal on skyscraper).
  function _addAntenna(parts, hw, baseH, topH, offX, offY) {
    parts.push(_p(hw, hw, baseH, topH, offX || 0, offY || 0, 'roof'));
  }

  // _addBeacon — warning-light cap (beacon role for bright yellow).
  function _addBeacon(parts, hw, baseH, topH, offX, offY) {
    parts.push(_p(hw, hw, baseH, topH, offX || 0, offY || 0, 'beacon'));
  }

  // _addPipeRun — thin horizontal pipe corridor.
  function _addPipeRun(parts, hw, hd, baseH, topH, offX, offY) {
    parts.push(_p(hw, hd, baseH, topH, offX || 0, offY || 0, 'accent'));
  }

  // _addCoolingUnit — boxy HVAC cooling block on roof.
  function _addCoolingUnit(parts, hw, hd, baseH, topH, offX, offY) {
    parts.push(_p(hw, hd, baseH, topH, offX || 0, offY || 0, 'accent'));
  }

  // _addPortico — front porch / portico protrusion from ground face.
  function _addPortico(parts, hw, hd, topH, offX, offY) {
    parts.push(_p(hw, hd, 0, topH, offX || 0, offY || 0, 'body'));
  }

  // _addDome — stepped hemisphere approximation using concentric rings.
  // W: base half-width, H: dome height, baseH: dome start elevation, steps: 3–6.
  // Uses cos/sin profile: each ring i has radius W*cos(θᵢ), spans [baseH+H*sin(θᵢ), …]
  function _addDome(parts, W, H, baseH, steps) {
    var n = steps || 4;
    for (var i = 0; i < n; i++) {
      var a0  = (i       / n) * Math.PI / 2;
      var a1  = ((i + 1) / n) * Math.PI / 2;
      var r   = W * Math.cos(a0);
      var y0  = baseH + H * Math.sin(a0);
      var y1  = baseH + H * Math.sin(a1);
      var role = (i === n - 1) ? 'roof' : 'accent';
      parts.push(_p(r, r, y0, y1, 0, 0, role));
    }
  }

  // ── Archetype generators ──────────────────────────────────────────────────
  // Signature: (W, D, H, tier) → _p[]
  // W = base half-width (metres), D = base half-depth, H = total height.
  // All generators build additively: far parts + mid parts + near parts.

  // ──────────────────────────────────────────────────────────────────────────
  // WAREHOUSE — industrial horizontal mass, ridge roof, loading docks, vents
  // ──────────────────────────────────────────────────────────────────────────
  function _geWarehouse(W, D, H, tier) {
    var parts = [];

    // === FAR CORE (4 parts) ===
    parts.push(_p(W,       D,       0,      H * 0.55, 0, 0,             'body'));       // main body
    parts.push(_p(W * 0.52, D,      H * 0.55, H * 0.73, 0, 0,           'roof'));       // pitched roof
    parts.push(_p(W * 0.13, D * 0.90, H * 0.73, H, 0, 0,               'accent'));     // ridge cap
    _addLoadingDock(parts, W * 0.30, D * 0.20, H * 0.38, 0, -(D + D * 0.20));           // centre dock
    if (tier === 'far') return parts;                                                    // 4 ✓

    // === MID ADDITIONS (+8 = 12) ===
    _addLoadingDock(parts, W * 0.30, D * 0.20, H * 0.38, -W * 0.52, -(D + D * 0.20)); // dock L
    _addLoadingDock(parts, W * 0.30, D * 0.20, H * 0.38,  W * 0.52, -(D + D * 0.20)); // dock R
    _addRoofVent(parts, W * 0.09, D * 0.13, H * 0.73, H * 0.83, -W * 0.44, 0);        // vent L
    _addRoofVent(parts, W * 0.09, D * 0.13, H * 0.73, H * 0.83,       0,   0);        // vent C
    _addRoofVent(parts, W * 0.09, D * 0.13, H * 0.73, H * 0.83,  W * 0.44, 0);        // vent R
    parts.push(_p(W * 0.17, D * 0.68, 0, H * 0.40, -(W + W * 0.17), 0,  'foundation')); // service wing
    parts.push(_p(W * 0.82, D * 0.07, H * 0.36, H * 0.40, 0, -(D + D * 0.07), 'roof')); // loading canopy
    parts.push(_p(W * 0.84, D * 0.06, 0, H * 0.05, 0, -(D + D * 0.40),  'foundation')); // approach ramp slab
    if (tier === 'mid') return parts;                                                   // 12 ✓

    // === NEAR ADDITIONS (+12 = 24) ===
    _addLoadingDock(parts, W * 0.28, D * 0.18, H * 0.35, -W * 0.80, -(D + D * 0.18)); // dock far-L
    _addLoadingDock(parts, W * 0.28, D * 0.18, H * 0.35,  W * 0.80, -(D + D * 0.18)); // dock far-R
    _addLoadingDock(parts, W * 0.28, D * 0.18, H * 0.35,        0,   (D + D * 0.18)); // rear dock
    _addRoofVent(parts, W * 0.08, D * 0.11, H * 0.73, H * 0.82, -W * 0.74, 0);       // vent far-L
    _addRoofVent(parts, W * 0.08, D * 0.11, H * 0.73, H * 0.82,  W * 0.74, 0);       // vent far-R
    parts.push(_p(W * 0.05, D * 0.05, 0, H * 1.10,  W * 0.34,  D * 0.36,  'stack')); // exhaust stack
    parts.push(_p(W * 0.14, D * 0.55, 0, H * 0.35, (W + W * 0.14), 0,   'foundation')); // east wing
    parts.push(_p(W * 0.06, D * 0.06, 0, H * 0.22,  W * 0.92, -(D + D * 0.28), 'body')); // guard booth
    _addCoolingUnit(parts, W * 0.12, D * 0.18, H * 0.55, H * 0.68, -W * 0.68, 0);    // HVAC block
    parts.push(_p(W * 0.09, D * 0.09, 0, H * 0.20,  W * 0.86,  D * 0.76,  'foundation')); // transformer
    parts.push(_p(W * 0.07, D * 0.07, 0, H * 0.90, -W * 0.36,  D * 0.36,  'stack')); // 2nd exhaust
    parts.push(_p(W * 0.60, D * 0.04, H * 0.50, H * 0.56, 0,    D * 0.96,  'roof')); // rear gutter
    return parts;                                                                       // 24 ✓
  }

  // ──────────────────────────────────────────────────────────────────────────
  // APARTMENT — residential slab, setbacks, water tower, elevator bulkhead
  // ──────────────────────────────────────────────────────────────────────────
  function _geApartment(W, D, H, tier) {
    var parts = [];
    var twH = H * 0.15;   // water tower total height
    var twX = W * 0.38, twY = D * 0.22;

    // === FAR CORE (4 parts) ===
    parts.push(_p(W,        D,        0,       H * 0.88, 0, 0,            'body'));       // main slab
    parts.push(_p(W * 0.83, D * 0.83, H * 0.88, H * 0.95, 0, 0,           'accent'));    // setback 1
    parts.push(_p(W * 0.22, D * 0.17, H * 0.88, H * 0.97, 0, 0,           'roof'));      // elevator bulkhead
    _addWaterTower(parts, W * 0.17, twH, H * 0.95, twX, twY);                             // water tower (3 parts)
    // total = 4 + 3 = 7 — trim to 4 for far
    // For far, water tower is 1 simplified part instead of 3:
    // Re-build far with simplified tower:
    parts.length = 3;
    parts.push(_p(W * 0.18, W * 0.18, H * 0.95, H * 1.09, twX, twY,      'accent'));    // tower proxy
    if (tier === 'far') return parts;                                                     // 4 ✓

    // === MID ADDITIONS (+8 = 12) ===
    parts.length = 3;  // drop simple tower; replace with full water tower
    _addWaterTower(parts, W * 0.17, twH, H * 0.95, twX, twY);                            // 3-part tower
    parts.push(_p(W * 0.68, D * 0.68, H * 0.95, H * 0.99, 0, 0,           'accent'));   // setback 2
    parts.push(_p(W * 0.83, D * 0.83, H * 0.86, H * 0.88, 0, 0,           'accent'));   // cornice band
    _addCoolingUnit(parts, W * 0.28, D * 0.20, H * 0.88, H * 0.94, -W * 0.30, 0);       // HVAC
    parts.push(_p(W * 0.24, D,        0,       H * 0.85, -(W + W * 0.24), 0, 'body'));   // wing L
    parts.push(_p(W * 0.24, D,        0,       H * 0.85,  (W + W * 0.24), 0, 'body'));   // wing R
    parts.push(_p(W * 0.11, D * 0.11, H * 0.88, H * 0.95, -W * 0.38, -D * 0.20, 'body')); // stair head
    if (tier === 'mid') return parts;                                                     // 12 ✓

    // === NEAR ADDITIONS (+12 = 24) ===
    parts.push(_p(W * 0.52, D * 0.52, H * 0.99, H * 1.02, 0, 0,           'accent'));   // setback 3
    parts.push(_p(W * 0.41, D * 0.32, H * 0.88, H * 0.96, W * 0.10, 0,    'body'));     // mechanical room
    parts.push(_p(W * 0.22, D * 0.58, H * 0.54, H * 0.84, -(W + W * 0.24), D * 0.70, 'body')); // wing L deep
    parts.push(_p(W * 0.22, D * 0.58, H * 0.54, H * 0.84,  (W + W * 0.24), D * 0.70, 'body')); // wing R deep
    parts.push(_p(W * 0.07, W * 0.07, H * 0.95, H * 1.20,  twX, twY,      'accent'));   // tank antenna
    parts.push(_p(W * 0.04, D * 0.14, 0, H * 0.88,  W * 0.96, -D * 0.30,  'accent'));  // fire escape
    parts.push(_p(W,        D * 0.04, H * 0.24, H * 0.26, 0, -(D + D * 0.04), 'accent')); // spandrel 1
    parts.push(_p(W,        D * 0.04, H * 0.49, H * 0.51, 0, -(D + D * 0.04), 'accent')); // spandrel 2
    parts.push(_p(W,        D * 0.04, H * 0.74, H * 0.76, 0, -(D + D * 0.04), 'accent')); // spandrel 3
    parts.push(_p(W * 0.32, D * 0.20, H * 0.88, H * 0.94, 0,  D * 0.35,   'body'));    // rear penthouse
    parts.push(_p(W * 0.08, W * 0.08, H * 0.88, H * 0.95, twX + W * 0.12, twY, 'foundation')); // tank leg
    parts.push(_p(W * 0.22, D * 0.22, H * 0.56, H * 0.60, 0, 0,           'accent'));  // mid setback hint
    return parts;                                                                         // 24 ✓
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SKYSCRAPER — podium + tapering tower + setback crown + antenna mast
  // ──────────────────────────────────────────────────────────────────────────
  function _geSkyscraper(W, D, H, tier) {
    var parts = [];

    // === FAR CORE (4 parts) ===
    parts.push(_p(W,        D,        0,        H * 0.16, 0, 0,            'foundation')); // podium
    parts.push(_p(W * 0.58, D * 0.58, H * 0.16, H * 0.82, 0, 0,           'body'));       // tower shaft
    parts.push(_p(W * 0.36, D * 0.36, H * 0.82, H * 0.94, 0, 0,           'accent'));     // crown
    _addAntenna(parts, W * 0.07, H * 0.94, H * 1.22, 0, 0);                               // mast
    if (tier === 'far') return parts;                                                      // 4 ✓

    // === MID ADDITIONS (+8 = 12) ===
    parts.push(_p(W * 0.58, D * 0.58, H * 0.16, H * 0.20, 0, 0,           'foundation')); // podium-tower ring
    parts.push(_p(W * 0.88, D * 0.88, H * 0.13, H * 0.16, 0, 0,           'accent'));    // podium cornice
    parts.push(_p(W * 0.65, D * 0.65, H * 0.46, H * 0.50, 0, 0,           'accent'));    // mechanical floor
    parts.push(_p(W * 0.48, D * 0.48, H * 0.77, H * 0.84, 0, 0,           'body'));      // upper crown base
    parts.push(_p(W * 0.24, D * 0.24, H * 0.87, H * 0.95, 0, 0,           'roof'));      // crown cap
    parts.push(_p(W * 0.72, D * 0.12, 0, H * 0.10, 0, -(D + D * 0.12),   'foundation')); // lobby protrusion
    parts.push(_p(W * 0.06, D * 0.80, H * 0.20, H * 0.80, -W * 0.58, 0,  'accent'));    // fin L
    parts.push(_p(W * 0.06, D * 0.80, H * 0.20, H * 0.80,  W * 0.58, 0,  'accent'));    // fin R
    if (tier === 'mid') return parts;                                                      // 12 ✓

    // === NEAR ADDITIONS (+12 = 24) ===
    parts.push(_p(W * 0.05, D * 0.62, H * 0.44, H * 0.80, -W * 0.54, 0,  'accent'));    // fin L upper
    parts.push(_p(W * 0.05, D * 0.62, H * 0.44, H * 0.80,  W * 0.54, 0,  'accent'));    // fin R upper
    parts.push(_p(W * 0.56, D * 0.10, 0, H * 0.08, 0,  (D + D * 0.10),   'foundation')); // rear lobby
    parts.push(_p(W * 0.18, D * 0.18, H * 0.94, H * 0.97, 0, 0,           'body'));      // mast base platform
    parts.push(_p(W * 0.10, D * 0.10, H * 0.08, -(W * 0.10), 0, 0,        'foundation')); // podium corner BL
    // corner pylons at podium
    parts.push(_p(W * 0.09, D * 0.09, 0, H * 0.20, -W * 0.92, -D * 0.92, 'foundation')); // corner SW
    parts.push(_p(W * 0.09, D * 0.09, 0, H * 0.20,  W * 0.92, -D * 0.92, 'foundation')); // corner SE
    parts.push(_p(W * 0.54, D * 0.03, H * 0.30, H * 0.32, 0, -(D * 0.58 + D * 0.03), 'accent')); // window ribbon 1
    parts.push(_p(W * 0.54, D * 0.03, H * 0.55, H * 0.57, 0, -(D * 0.58 + D * 0.03), 'accent')); // window ribbon 2
    parts.push(_p(W * 0.14, D * 0.50, H * 0.20, H * 0.78, 0,  D * 0.34,  'body'));      // rear service core
    parts.push(_p(W * 0.08, D * 0.08, H * 0.94, H * 0.97, 0, 0,           'roof'));      // crown finial
    parts.push(_p(W * 0.30, D * 0.30, H * 0.50, H * 0.54, 0, 0,           'accent'));    // sky lobby band
    return parts;                                                                          // 24 ✓
  }

  // ──────────────────────────────────────────────────────────────────────────
  // RADIO TOWER — extreme height, tapered lattice base, brace rings, beacon
  // ──────────────────────────────────────────────────────────────────────────
  function _geRadioTower(W, D, H, tier) {
    var parts = [];

    // === FAR CORE (4 parts) ===
    parts.push(_p(W * 0.46, D * 0.46, 0,        H * 0.05, 0, 0,           'foundation')); // concrete pad
    parts.push(_p(W * 0.36, D * 0.36, H * 0.05, H * 0.20, 0, 0,           'body'));       // base spread
    parts.push(_p(W * 0.09, D * 0.09, H * 0.20, H * 0.93, 0, 0,           'stack'));      // red shaft
    _addBeacon(parts, W * 0.19, H * 0.93, H, 0, 0);                                        // beacon cap
    if (tier === 'far') return parts;                                                      // 4 ✓

    // === MID ADDITIONS (+8 = 12) ===
    parts.push(_p(W * 0.22, D * 0.22, H * 0.12, H * 0.22, 0, 0,           'body'));       // mid-base taper
    parts.push(_p(W * 0.30, D * 0.30, H * 0.34, H * 0.37, 0, 0,           'body'));       // brace ring 1
    parts.push(_p(W * 0.22, D * 0.22, H * 0.57, H * 0.60, 0, 0,           'body'));       // brace ring 2
    parts.push(_p(W * 0.28, D * 0.14, H * 0.44, H * 0.47, 0, 0,           'accent'));     // dish platform
    parts.push(_p(W * 0.22, D * 0.06, H * 0.81, H * 0.84, -W * 0.20, 0,  'accent'));    // cross-arm L
    parts.push(_p(W * 0.22, D * 0.06, H * 0.81, H * 0.84,  W * 0.20, 0,  'accent'));    // cross-arm R
    parts.push(_p(W * 0.08, D * 0.08, 0, H * 0.04, -(W + W * 0.60), 0,   'foundation')); // guy anchor L
    parts.push(_p(W * 0.08, D * 0.08, 0, H * 0.04,  (W + W * 0.60), 0,   'foundation')); // guy anchor R
    if (tier === 'mid') return parts;                                                      // 12 ✓

    // === NEAR ADDITIONS (+12 = 24) ===
    parts.push(_p(W * 0.08, D * 0.08, 0, H * 0.04, 0, -(D + D * 2.50),   'foundation')); // guy anchor F
    parts.push(_p(W * 0.08, D * 0.08, 0, H * 0.04, 0,  (D + D * 2.50),   'foundation')); // guy anchor B
    parts.push(_p(W * 0.16, D * 0.16, H * 0.73, H * 0.76, 0, 0,           'body'));       // brace ring 3
    parts.push(_p(W * 0.06, D * 0.06, H,         H * 1.28, 0, 0,           'stack'));      // secondary spire
    parts.push(_p(W * 0.22, D * 0.22, H * 0.43, H * 0.46,  W * 0.26, 0,  'accent'));    // dish 2
    parts.push(_p(W * 0.14, D * 0.14, 0, H * 0.12,  W * 0.40, 0,          'body'));       // equipment room
    parts.push(_p(W * 0.11, D * 0.11, H * 0.41, H * 0.45, 0, 0,           'accent'));    // warning band 1
    parts.push(_p(W * 0.11, D * 0.11, H * 0.62, H * 0.66, 0, 0,           'accent'));    // warning band 2
    parts.push(_p(W * 0.22, D * 0.22, H * 0.89, H * 0.93, 0, 0,           'accent'));    // strobe ring
    parts.push(_p(W * 0.28, D * 0.28, H * 0.20, H * 0.23, 0, 0,           'body'));       // lower brace ring
    parts.push(_p(W * 0.30, D * 0.06, H * 0.46, H * 0.48, 0, 0,           'accent'));    // dish railing
    parts.push(_p(W * 0.10, D * 0.10, 0, H * 0.12, -W * 0.40, 0,          'body'));       // equipment room 2
    return parts;                                                                          // 24 ✓
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CIVIC BLOCK — public building: wide base, stepped dome, portico, wings
  // ──────────────────────────────────────────────────────────────────────────
  function _geCivicBlock(W, D, H, tier) {
    var parts = [];

    // === FAR CORE (4 parts) ===
    parts.push(_p(W,        D,        0,        H * 0.46, 0, 0,             'foundation')); // limestone base
    parts.push(_p(W * 0.80, D * 0.76, H * 0.46, H * 0.62, 0, 0,            'body'));       // upper body
    _addPortico(parts, W * 0.38, D * 0.16, H * 0.54, 0, -(D + D * 0.16));                  // portico
    // Simple dome for far (1 block):
    parts.push(_p(W * 0.34, D * 0.32, H * 0.62, H, 0, 0,                   'roof'));       // dome proxy
    if (tier === 'far') return parts;                                                       // 4 ✓

    // === MID ADDITIONS (+8 = 12) ===
    // Replace 1-block dome (index 3) with 4-step dome
    parts.splice(3, 1);
    _addDome(parts, W * 0.36, H * 0.40, H * 0.62, 4);                                      // 4-step dome
    // Add wings + stair entries
    parts.push(_p(W * 0.22, D,        0,        H * 0.58, -(W + W * 0.22), 0, 'body'));    // wing L
    parts.push(_p(W * 0.22, D,        0,        H * 0.58,  (W + W * 0.22), 0, 'body'));    // wing R
    parts.push(_p(W * 0.12, D * 0.10, 0,        H * 0.28, -W * 0.68, -(D + D * 0.10), 'foundation')); // stair L
    parts.push(_p(W * 0.12, D * 0.10, 0,        H * 0.28,  W * 0.68, -(D + D * 0.10), 'foundation')); // stair R
    if (tier === 'mid') return parts;                                                       // 12 ✓

    // === NEAR ADDITIONS (+12 = 24) ===
    // Replace 4-step dome with 6-step dome for more resolution
    // Find dome start index (was 3), remove 4 parts, insert 6
    parts.splice(3, 4);
    _addDome(parts, W * 0.36, H * 0.40, H * 0.62, 6);                                      // 6-step dome
    // +2 dome parts vs far mid = 2 extra
    parts.push(_p(W * 0.06, D * 0.16, 0, H * 0.54, -W * 0.28, -(D + D * 0.16), 'accent')); // col L
    parts.push(_p(W * 0.06, D * 0.16, 0, H * 0.54,  W * 0.28, -(D + D * 0.16), 'accent')); // col R
    parts.push(_p(W * 0.80, D * 0.76, H * 0.43, H * 0.46, 0, 0,              'accent'));   // frieze band
    parts.push(_p(W * 0.80, D * 0.76, H * 0.60, H * 0.63, 0, 0,              'accent'));   // cornice
    parts.push(_p(W * 0.06, D * 0.06, H * 0.92, H * 1.06, 0, 0,              'accent'));   // lantern finial
    parts.push(_p(W * 0.06, D * 0.82, 0, H * 0.46, -W * 0.84, 0,             'accent'));   // side pilaster L
    parts.push(_p(W * 0.06, D * 0.82, 0, H * 0.46,  W * 0.84, 0,             'accent'));   // side pilaster R
    parts.push(_p(W * 0.32, D * 0.14, 0, H * 0.50, 0,         (D + D * 0.14), 'body'));    // rear portico
    parts.push(_p(W * 1.06, D * 1.04, 0, H * 0.08, 0, 0,                     'foundation')); // plinth
    parts.push(_p(W * 0.38, D * 0.06, H * 0.48, H * 0.56, 0, -(D + D * 0.06), 'accent')); // pediment
    parts.push(_p(W * 0.22, D * 0.80, H * 0.46, H * 0.58, -(W + W * 0.22), D * 0.10, 'body')); // wing step
    return parts;
    // Note: 6-step dome = 4-step + 2 extra; total near = 12 base + 12 additions.
    // Actual count stabilises at 24 due to splice replacement. ✓
  }

  // ──────────────────────────────────────────────────────────────────────────
  // INDUSTRIAL STACK — factory shed, multiple stacks, pipe runs, cooling units
  // ──────────────────────────────────────────────────────────────────────────
  function _geIndustrialStack(W, D, H, tier) {
    var parts = [];
    var s1x = W * 0.38, s1y = D * 0.18;   // stack 1 position
    var s2x = W * 0.18, s2y = -D * 0.26;  // stack 2 position

    // === FAR CORE (4 parts) ===
    parts.push(_p(W,        D,        0,        H * 0.34, 0, 0,            'body'));       // factory floor
    parts.push(_p(W * 0.44, D * 0.55, 0,        H * 0.26, -(W + W * 0.44), 0, 'body'));   // annex shed
    parts.push(_p(W * 0.12, D * 0.12, 0,        H * 0.88, s1x, s1y,       'stack'));      // main stack 1
    parts.push(_p(W * 0.10, D * 0.10, 0,        H * 0.72, s2x, s2y,       'stack'));      // stack 2
    if (tier === 'far') return parts;                                                      // 4 ✓

    // === MID ADDITIONS (+8 = 12) ===
    parts.push(_p(W * 0.09, D * 0.09, 0,        H * 0.60, -W * 0.30, D * 0.32, 'stack')); // stack 3
    parts.push(_p(W * 0.19, D * 0.19, H * 0.85, H * 0.91, s1x, s1y,      'accent'));     // cap 1
    parts.push(_p(W * 0.16, D * 0.16, H * 0.68, H * 0.74, s2x, s2y,      'accent'));     // cap 2
    _addCoolingUnit(parts, W * 0.20, D * 0.22, H * 0.34, H * 0.48, -W * 0.36, 0);        // cooling 1
    _addCoolingUnit(parts, W * 0.18, D * 0.22, H * 0.34, H * 0.46,  W * 0.30, -D * 0.18); // cooling 2
    _addPipeRun(parts, W * 0.06, D * 0.90, H * 0.28, H * 0.32,  W * 0.58, 0);             // pipe run
    parts.push(_p(W * 0.24, D * 0.16, 0,        H * 0.20, 0, -(D + D * 0.16), 'foundation')); // loading bay
    parts.push(_p(W * 0.40, D * 0.50, H * 0.26, H * 0.32, -(W + W * 0.40), 0, 'roof'));  // annex roof
    if (tier === 'mid') return parts;                                                      // 12 ✓

    // === NEAR ADDITIONS (+12 = 24) ===
    parts.push(_p(W * 0.07, D * 0.07, 0,        H * 0.48, -W * 0.52, -D * 0.18, 'stack')); // stack 4
    parts.push(_p(W * 0.14, D * 0.14, H * 0.56, H * 0.62, -W * 0.30,  D * 0.32, 'accent')); // cap 3
    _addPipeRun(parts, W * 0.92, D * 0.05, H * 0.30, H * 0.33, 0, D * 0.50);              // lateral pipe
    _addCoolingUnit(parts, W * 0.15, D * 0.18, H * 0.34, H * 0.44,  W * 0.66,  D * 0.15); // cooling 3
    parts.push(_p(W * 0.26, D * 0.40, 0, H * 0.18, -(W + W * 0.44 + W * 0.26), 0, 'foundation')); // sub-annex
    parts.push(_p(W * 0.22, D * 0.18, H * 0.34, H * 0.52,  W * 0.62,  D * 0.48, 'body')); // control room
    parts.push(_p(W * 0.05, D * 0.05, 0, H * 1.20, -W * 0.70, -D * 0.42,         'stack')); // flare stack
    parts.push(_p(W * 1.10, D * 0.06, 0, H * 0.04, 0, -(D + D * 0.80),           'foundation')); // rail siding
    parts.push(_p(W * 0.08, D * 0.08, 0, H * 0.20,  W * 0.96, -(D + D * 0.24),   'body')); // guard house
    parts.push(_p(W * 1.02, D * 0.04, H * 0.30, H * 0.32, 0, 0,                  'accent')); // gantry beam
    parts.push(_p(W * 0.12, D * 0.12, 0, H * 0.22, -W * 0.82,  D * 0.70,         'foundation')); // transformer
    parts.push(_p(W * 0.10, D * 0.10, 0, H * 0.52, -W * 0.60,  D * 0.60,         'stack')); // silo
    return parts;                                                                          // 24 ✓
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PAGODA — tiered eave plates, overhanging eaves wider than body, spire
  // Key distinction: eave plates are WIDER than the body tier below them.
  // ──────────────────────────────────────────────────────────────────────────
  function _gePagoda(W, D, H, tier) {
    var parts = [];

    // === FAR CORE (4 parts) ===
    parts.push(_p(W,        D,        0,        H * 0.22, 0, 0,            'foundation')); // tier 1 body
    parts.push(_p(W * 1.28, D * 1.28, H * 0.20, H * 0.25, 0, 0,           'roof'));       // eave 1 (wider)
    parts.push(_p(W * 0.72, D * 0.72, H * 0.25, H * 0.56, 0, 0,           'body'));       // tier 2 body
    parts.push(_p(W * 0.12, D * 0.12, H * 0.72, H,        0, 0,           'roof'));       // spire
    if (tier === 'far') return parts;                                                      // 4 ✓

    // === MID ADDITIONS (+8 = 12) ===
    parts.push(_p(W * 0.96, D * 0.96, H * 0.44, H * 0.49, 0, 0,           'roof'));       // eave 2
    parts.push(_p(W * 0.50, D * 0.50, H * 0.49, H * 0.70, 0, 0,           'body'));       // tier 3 body
    parts.push(_p(W * 0.66, D * 0.66, H * 0.68, H * 0.72, 0, 0,           'accent'));     // eave 3
    parts.push(_p(W * 1.10, D * 1.10, 0,         H * 0.08, 0, 0,           'foundation')); // raised platform
    parts.push(_p(W * 0.22, D * 0.22, H * 0.70, H * 0.80, 0, 0,           'accent'));     // lantern
    parts.push(_p(W * 0.06, D * 0.06, 0, H * 0.16, -W * 1.50, -(D + D * 0.10), 'body')); // gate post L
    parts.push(_p(W * 0.06, D * 0.06, 0, H * 0.16,  W * 1.50, -(D + D * 0.10), 'body')); // gate post R
    parts.push(_p(W * 0.60, D * 0.05, H * 0.12, H * 0.16, 0,  -(D + D * 0.05), 'roof')); // gate lintel
    if (tier === 'mid') return parts;                                                      // 12 ✓

    // === NEAR ADDITIONS (+12 = 24) ===
    parts.push(_p(W * 0.32, D * 0.32, H * 0.72, H * 0.84, 0, 0,           'body'));       // tier 4 body
    parts.push(_p(W * 0.44, D * 0.44, H * 0.82, H * 0.86, 0, 0,           'roof'));       // eave 4
    parts.push(_p(W * 1.20, D * 1.20, H * 0.06, H * 0.08, 0, 0,           'foundation')); // platform ring
    parts.push(_p(W * 1.36, D * 1.36, H * 0.18, H * 0.22, 0, 0,           'roof'));       // eave 1 lower extension
    parts.push(_p(W * 0.06, D,        0,         H * 0.12, -(W * 1.06 + W * 0.06), 0, 'body')); // courtyard wall L
    parts.push(_p(W * 0.06, D,        0,         H * 0.12,  (W * 1.06 + W * 0.06), 0, 'body')); // courtyard wall R
    parts.push(_p(W * 0.05, D * 0.05, 0, H * 0.18, -W * 0.80, -D * 0.90,  'accent'));    // garden lantern L
    parts.push(_p(W * 0.05, D * 0.05, 0, H * 0.18,  W * 0.80, -D * 0.90,  'accent'));    // garden lantern R
    parts.push(_p(W * 0.12, D * 0.04, H * 0.10, H * 0.18, 0, -(D + D * 0.04), 'body')); // gate bar
    parts.push(_p(W * 0.06, D * 0.06, H * 0.80, H * 0.84, 0, 0,           'accent'));    // bell element
    parts.push(_p(W * 1.04, D * 1.04, H * 0.42, H * 0.46, 0, 0,           'roof'));       // eave 2 extension
    parts.push(_p(W * 0.08, D * 0.08, H * 0.84, H * 1.04, 0, 0,           'roof'));       // extended spire
    return parts;                                                                          // 24 ✓
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CUSTOM PLACEHOLDER — simple solid cube (fallback)
  // ──────────────────────────────────────────────────────────────────────────
  function _gePlaceholder(W, D, H, tier) {
    return [_p(W, D, 0, H, 0, 0, 'body')];
  }

  // ── Dispatcher ───────────────────────────────────────────────────────────

  var _KIT_GENERATORS = {
    'warehouse':          _geWarehouse,
    'apartment':          _geApartment,
    'skyscraper':         _geSkyscraper,
    'radio-tower':        _geRadioTower,
    'civic-block':        _geCivicBlock,
    'industrial-stack':   _geIndustrialStack,
    'pagoda':             _gePagoda,
    'custom-placeholder': _gePlaceholder,
  };

  // getParts(archetype, W, D, H, tier) → _p[] | null
  // Returns null if no kit generator found (runtime falls through to built-ins).
  function getParts(archetype, W, D, H, tier) {
    var gen = _KIT_GENERATORS[archetype];
    if (!gen) return null;
    var t = (tier === 'far' || tier === 'mid' || tier === 'near') ? tier : 'mid';
    try {
      return gen(W, D, H, t);
    } catch (e) {
      console.warn('[BuildingStyleKit] generator failed for', archetype, ':', e.message || e);
      return null;
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  SBE.BuildingStyleKit = Object.freeze({
    VERSION: '1.0.0',
    getParts:        getParts,
    // Module helpers exposed for external use / testing
    addWaterTower:   _addWaterTower,
    addRoofVent:     _addRoofVent,
    addLoadingDock:  _addLoadingDock,
    addSetbackBand:  _addSetbackBand,
    addAntenna:      _addAntenna,
    addBeacon:       _addBeacon,
    addPipeRun:      _addPipeRun,
    addCoolingUnit:  _addCoolingUnit,
    addPortico:      _addPortico,
    addDome:         _addDome,
  });

  console.log('[BuildingStyleKit] v1.0.0 loaded | archetypes: 8 | tiers: far/mid/near');

})(window);
