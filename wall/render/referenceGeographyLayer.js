// 0515_WOS_ReferenceGeographyLayer_v1.0.0
// Reference Geography Layer — muted real-world geographic context for WOS.
// Vanilla IIFE. Attaches to SBE.ReferenceGeographyLayer.
// Load order: spatialInfrastructure.js → referenceGeographyLayer.js → corridorRenderer.js
//
// ═══════════════════════════════════════════════════════════════════════════
// PHILOSOPHY
//   "Tracing paper beneath the WOS world."
//   Truth scaffolding — not navigation software.
//   Geographic grounding for cinematic world design.
//
// PHASE 1 COVERAGE: Brooklyn (Bay Ridge) → Cold Spring, NY
//   Hudson River · Upper Bay · Manhattan · Bridges · Parks · Major Roads
//
// PROJECTION
//   All lat/lng features are projected using SI.projectGeo(spatial, lat, lng)
//   which uses the same coordinate space as the corridor and corridor renderer.
//   No independent projection — all layers align perfectly.
//
// RENDER API
//   SBE.ReferenceGeographyLayer.render(ctx, routeWorld, transform, opts)
//   Must be called BEFORE CorridorRenderer in renderRouteWorldOverlay.
// ═══════════════════════════════════════════════════════════════════════════

(function initReferenceGeographyLayer(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Geographic Data: Phase 1 Corridor Coverage ────────────────────────────
  // Format: [lat, lng] pairs. Projected at render time via SI.projectGeo().
  // Data is simplified — geographically honest, not survey-accurate.
  // Coverage: roughly lat 40.55–41.45, lng -74.15 to -73.75.
  // ─────────────────────────────────────────────────────────────────────────

  // Hudson River — defined as a closed polygon (east bank → west bank).
  // East bank goes south→north; west bank closes north→south.
  var _HUDSON_EAST = [
    [40.620,-74.022],[40.640,-74.018],[40.660,-74.014],[40.680,-74.010],
    [40.700,-74.007],[40.715,-73.999],[40.730,-73.990],[40.748,-73.984],
    [40.763,-73.980],[40.780,-73.976],[40.800,-73.974],[40.820,-73.966],
    [40.840,-73.959],[40.851,-73.952],[40.862,-73.942],[40.878,-73.933],
    [40.900,-73.916],[40.925,-73.907],[40.950,-73.905],[40.975,-73.903],
    [41.000,-73.907],[41.025,-73.897],[41.050,-73.892],[41.070,-73.888],
    [41.085,-73.895],[41.105,-73.904],[41.130,-73.918],[41.160,-73.928],
    [41.190,-73.937],[41.215,-73.943],[41.240,-73.950],[41.270,-73.957],
    [41.300,-73.963],[41.330,-73.967],[41.370,-73.970],[41.420,-73.972],
  ];
  var _HUDSON_WEST = [
    [41.420,-74.010],[41.390,-74.012],[41.360,-74.010],[41.330,-74.005],
    [41.300,-73.998],[41.270,-73.988],[41.240,-73.978],[41.210,-73.970],
    [41.180,-73.963],[41.150,-73.954],[41.120,-73.942],[41.100,-73.932],
    [41.070,-73.912],[41.050,-73.918],[41.025,-73.932],[41.000,-73.960],
    [40.975,-73.972],[40.950,-73.978],[40.925,-73.985],[40.900,-73.988],
    [40.878,-73.980],[40.862,-73.975],[40.851,-73.975],[40.835,-73.980],
    [40.815,-73.990],[40.795,-73.999],[40.775,-74.008],[40.755,-74.018],
    [40.735,-74.025],[40.715,-74.028],[40.700,-74.028],[40.680,-74.025],
    [40.660,-74.024],[40.640,-74.028],[40.620,-74.033],
  ];

  // Upper New York Bay — the wide water body south of Manhattan's tip.
  // Polygon running clockwise from the northwest.
  var _UPPER_BAY = [
    [40.700,-74.028],[40.700,-74.014],[40.693,-74.008],  // Battery area
    [40.685,-73.999],[40.670,-73.993],[40.660,-73.990],  // Brooklyn waterfront
    [40.640,-74.005],[40.620,-74.018],[40.605,-74.038],  // Bay Ridge to Narrows
    [40.590,-74.055],[40.580,-74.070],[40.585,-74.090],  // SI/NJ shore (Narrows)
    [40.605,-74.080],[40.625,-74.060],[40.645,-74.042],  // NJ shore
    [40.665,-74.035],[40.685,-74.030],                   // close back west
  ];

  // East River — thin water strip between Manhattan and Brooklyn/Queens.
  // Defined as two thin banks forming a narrow polygon.
  var _EAST_RIVER_W = [  // Manhattan east coast (west bank of E.River)
    [40.700,-73.980],[40.710,-73.978],[40.730,-73.974],
    [40.750,-73.967],[40.770,-73.958],[40.790,-73.948],
    [40.808,-73.937],[40.820,-73.932],
  ];
  var _EAST_RIVER_E = [  // Brooklyn/Queens west coast (east bank)
    [40.820,-73.920],[40.808,-73.924],[40.790,-73.932],
    [40.770,-73.944],[40.750,-73.953],[40.730,-73.963],
    [40.710,-73.970],[40.700,-73.974],
  ];

  // Kill Van Kull / Arthur Kill — water between SI and NJ
  var _KILL_VAN_KULL = [
    [40.640,-74.085],[40.642,-74.060],[40.645,-74.040],[40.647,-74.015],
  ];

  // Manhattan Island — simplified outline polygon.
  var _MANHATTAN = [
    // Start at southern tip, go west coast north, then east coast south
    [40.700,-74.014],  // Battery/southern tip (west)
    [40.706,-74.014],[40.715,-74.013],[40.725,-74.009],[40.737,-74.006],
    [40.748,-74.002],[40.760,-73.999],[40.773,-73.995],[40.785,-73.989],
    [40.798,-73.983],[40.810,-73.977],[40.823,-73.969],[40.836,-73.961],
    [40.848,-73.955],[40.856,-73.949],[40.864,-73.942],
    [40.878,-73.933],  // Inwood tip (north)
    [40.872,-73.925],[40.860,-73.923],[40.847,-73.926],[40.835,-73.931],
    [40.822,-73.936],[40.810,-73.941],[40.797,-73.948],[40.784,-73.955],
    [40.770,-73.961],[40.756,-73.967],[40.742,-73.972],[40.728,-73.976],
    [40.714,-73.979],[40.704,-73.980],
    [40.700,-73.980],  // Battery (east)
    [40.700,-74.014],  // close
  ];

  // The Bronx shoreline (simplified south-west edge facing Harlem River / Hudson)
  var _BRONX_SHORE = [
    [40.878,-73.933],[40.885,-73.920],[40.895,-73.912],[40.905,-73.905],
    [40.920,-73.898],[40.935,-73.891],[40.950,-73.885],
  ];

  // Brooklyn and Bay Ridge coastline (west and south facing)
  var _BROOKLYN_SHORE = [
    [40.700,-73.980],[40.690,-73.988],[40.680,-73.995],
    [40.670,-74.002],[40.658,-74.010],[40.645,-74.018],
    [40.635,-74.025],[40.620,-74.028],
  ];

  // ── Parks / Green Zones ───────────────────────────────────────────────────

  var _CENTRAL_PARK = [
    [40.800,-73.958],[40.800,-73.949],
    [40.764,-73.973],[40.764,-73.982],
  ];  // rectangle: NW, NE, SE, SW

  var _INWOOD_PARK = [
    [40.868,-73.935],[40.872,-73.928],[40.878,-73.933],
    [40.875,-73.938],[40.870,-73.940],
  ];

  var _RIVERSIDE_PARK = [
    // Thin strip along Hudson, W72–W158th
    [40.800,-73.985],[40.851,-73.960],
  ];  // drawn as a thick polyline, not filled

  // Hudson Highlands / Storm King — west bank, green zone around Cold Spring
  var _HIGHLANDS_W = [
    [41.290,-74.005],[41.310,-74.010],[41.340,-74.010],
    [41.370,-74.002],[41.420,-74.002],[41.420,-73.995],
    [41.380,-73.985],[41.340,-73.988],[41.310,-73.995],[41.290,-74.000],
  ];

  // Hudson Highlands east bank (Garrison, Breakneck Ridge)
  var _HIGHLANDS_E = [
    [41.280,-73.960],[41.300,-73.965],[41.330,-73.968],
    [41.360,-73.972],[41.420,-73.975],[41.420,-73.960],
    [41.360,-73.958],[41.330,-73.958],[41.300,-73.955],[41.280,-73.952],
  ];

  // Palisades Interstate Park — west bank, NJ side, below GW Bridge
  var _PALISADES = [
    [40.852,-73.980],[40.870,-73.982],[40.890,-73.982],
    [40.910,-73.985],[40.930,-73.990],[40.950,-73.990],
    [40.950,-73.975],[40.930,-73.972],[40.910,-73.972],
    [40.890,-73.970],[40.870,-73.970],[40.852,-73.975],
  ];

  // Bear Mountain / Harriman rough green zone (west side, partially off-projection)
  var _BEAR_MOUNTAIN = [
    [41.200,-74.010],[41.220,-74.020],[41.250,-74.030],[41.270,-74.035],
    [41.300,-74.030],[41.320,-74.020],[41.330,-74.010],[41.310,-74.002],
    [41.280,-73.998],[41.250,-74.000],[41.220,-74.005],
  ];

  // ── Major Roads ───────────────────────────────────────────────────────────

  // Henry Hudson Parkway (west side of Manhattan, then up to the Henry Hudson Bridge)
  var _HENRY_HUDSON_PKY = [
    [40.700,-74.011],[40.715,-74.010],[40.730,-74.005],
    [40.750,-74.001],[40.770,-73.997],[40.790,-73.990],
    [40.810,-73.981],[40.830,-73.971],[40.851,-73.963],
    [40.860,-73.948],[40.878,-73.933],
  ];

  // Palisades Interstate Parkway (NJ west bank, north from GW)
  var _PALISADES_PKY = [
    [40.851,-73.976],[40.870,-73.984],[40.900,-73.991],
    [40.940,-73.997],[40.970,-74.002],[41.000,-74.008],
    [41.040,-74.010],[41.080,-74.005],[41.120,-73.998],
  ];

  // US-9 / Route 9W (east bank of Hudson, Westchester/Rockland corridor)
  var _US9 = [
    [40.852,-73.950],[40.878,-73.933],[40.905,-73.912],
    [40.940,-73.902],[40.970,-73.903],[41.000,-73.907],
    [41.030,-73.897],[41.060,-73.892],[41.070,-73.888],
    [41.100,-73.902],[41.130,-73.918],[41.170,-73.933],
    [41.210,-73.943],[41.250,-73.953],[41.290,-73.960],
    [41.330,-73.967],[41.380,-73.970],[41.420,-73.972],
  ];

  // I-87 / NYS Thruway (west bank, NJ/Rockland segment near Tappan Zee)
  var _I87 = [
    [40.851,-73.975],[40.870,-73.981],[40.900,-73.985],
    [40.940,-73.988],[40.975,-73.990],[41.020,-73.982],
    [41.050,-73.968],[41.070,-73.948],[41.070,-73.912],
  ];

  // Cross-Westchester Expressway / I-287 (runs E-W across Westchester)
  var _I287 = [
    [41.070,-74.00],[41.070,-73.960],[41.070,-73.912],
    [41.070,-73.870],[41.070,-73.830],
  ];

  // Saw Mill River Parkway (east of Hudson, parallel to Taconic, Westchester)
  var _SAW_MILL = [
    [40.900,-73.870],[40.930,-73.873],[40.965,-73.870],
    [41.000,-73.865],[41.040,-73.857],[41.070,-73.850],
    [41.100,-73.845],[41.150,-73.840],
  ];

  // ── Bridges ───────────────────────────────────────────────────────────────
  // Each bridge defined as { name, points: [[lat,lng],...], width }
  var _BRIDGES = [
    {
      name: "George Washington Bridge",
      points: [[40.851,-73.952],[40.851,-73.975]],
      width: 5,
      landmark: true,
    },
    {
      name: "Gov. Mario M. Cuomo Bridge",  // Tappan Zee
      points: [[41.070,-73.888],[41.070,-73.912]],
      width: 5,
      landmark: true,
    },
    {
      name: "Bear Mountain Bridge",
      points: [[41.323,-73.985],[41.323,-73.995]],
      width: 4,
      landmark: true,
    },
    {
      name: "Verrazzano-Narrows Bridge",
      points: [[40.606,-74.044],[40.598,-74.058]],
      width: 4,
      landmark: false,
    },
    {
      name: "George Washington Bridge (upper deck north approach)",
      points: [[40.851,-73.975],[40.855,-73.980]],
      width: 3,
      landmark: false,
    },
    {
      name: "Henry Hudson Bridge",
      points: [[40.878,-73.933],[40.878,-73.943]],
      width: 3,
      landmark: false,
    },
    {
      name: "Spuyten Duyvil / Broadway Bridge",
      points: [[40.878,-73.933],[40.882,-73.930]],
      width: 2,
      landmark: false,
    },
  ];

  // ── Rendering helpers ─────────────────────────────────────────────────────

  // Project a lat/lng array to canvas points using SI.projectGeo
  function _projectPoints(pts, spatial) {
    var SI = SBE.SpatialInfrastructure;
    if (!SI || !spatial) return [];
    return pts.map(function (p) { return SI.projectGeo(spatial, p[0], p[1]); });
  }

  // Draw a filled polygon from projected points
  function _fillPoly(ctx, pts) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
  }

  // Draw a stroked polyline from projected points
  function _strokePoly(ctx, pts) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // Draw a filled rectangle from 4-point polygon [NW,NE,SE,SW]
  function _fillRect4(ctx, pts) {
    if (pts.length < 4) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y); // NW
    ctx.lineTo(pts[1].x, pts[1].y); // NE
    ctx.lineTo(pts[2].x, pts[2].y); // SE
    ctx.lineTo(pts[3].x, pts[3].y); // SW
    ctx.closePath();
    ctx.fill();
  }

  // Build a river polygon from two bank arrays (east + reversed west)
  function _buildRiverPoly(east, west) {
    var poly = east.slice();
    for (var i = west.length - 1; i >= 0; i--) poly.push(west[i]);
    return poly;
  }

  // Wrap renders in a safe try/catch so one bad feature never crashes the frame
  function _guard(fn) {
    try { fn(); } catch (e) { /* silent fail */ }
  }

  // ── Style palettes ─────────────────────────────────────────────────────────

  var STYLES = {
    muted: {
      waterFill:      "rgba(20,55,90,0.55)",
      waterGlow:      "rgba(80,160,220,0.18)",
      waterStroke:    "rgba(60,130,200,0.30)",
      landFill:       "rgba(20,28,35,0.70)",
      landStroke:     "rgba(50,70,90,0.25)",
      parkFill:       "rgba(20,55,30,0.40)",
      parkStroke:     "rgba(40,100,50,0.30)",
      roadStroke:     "rgba(80,110,130,0.35)",
      roadGlow:       "rgba(100,160,180,0.12)",
      bridgeStroke:   "rgba(120,180,210,0.65)",
      bridgeGlow:     "rgba(120,200,255,0.25)",
      labelFill:      "rgba(130,180,200,0.55)",
    },
    wireframe: {
      waterFill:      "rgba(0,0,0,0)",
      waterGlow:      "rgba(0,0,0,0)",
      waterStroke:    "rgba(60,160,220,0.55)",
      landFill:       "rgba(0,0,0,0)",
      landStroke:     "rgba(80,100,120,0.50)",
      parkFill:       "rgba(0,0,0,0)",
      parkStroke:     "rgba(60,120,70,0.50)",
      roadStroke:     "rgba(100,140,160,0.55)",
      roadGlow:       "rgba(0,0,0,0)",
      bridgeStroke:   "rgba(140,200,240,0.80)",
      bridgeGlow:     "rgba(0,0,0,0)",
      labelFill:      "rgba(150,190,210,0.70)",
    },
    cinematic: {
      waterFill:      "rgba(10,35,65,0.75)",
      waterGlow:      "rgba(60,140,210,0.30)",
      waterStroke:    "rgba(80,160,230,0.50)",
      landFill:       "rgba(15,22,28,0.85)",
      landStroke:     "rgba(50,70,90,0.40)",
      parkFill:       "rgba(15,45,25,0.55)",
      parkStroke:     "rgba(40,110,55,0.45)",
      roadStroke:     "rgba(80,120,150,0.45)",
      roadGlow:       "rgba(100,170,200,0.20)",
      bridgeStroke:   "rgba(140,210,255,0.80)",
      bridgeGlow:     "rgba(140,220,255,0.40)",
      labelFill:      "rgba(160,210,240,0.70)",
    },
  };

  // ── Main render function ───────────────────────────────────────────────────

  function render(ctx, routeWorld, transform, opts) {
    var rg = routeWorld && routeWorld.referenceGeography;
    if (!rg || !rg.enabled) return;

    var spatial = routeWorld.spatial;
    if (!spatial || !spatial.projection) return;

    var layers  = rg.layers  || {};
    var opacity = rg.opacity != null ? rg.opacity : 0.45;
    var style   = rg.style   || "muted";
    var pal     = STYLES[style] || STYLES.muted;

    // Apply master opacity on a sub-layer
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * opacity;

    // ── Layer: District / Landmass silhouettes ───────────────────────────
    if (layers.districts !== false) {
      _guard(function () {
        ctx.fillStyle   = pal.landFill;
        ctx.strokeStyle = pal.landStroke;
        ctx.lineWidth   = 1.5;

        // Manhattan
        var manhattan = _projectPoints(_MANHATTAN, spatial);
        _fillPoly(ctx, manhattan);
        ctx.strokeStyle = pal.landStroke;
        _strokePoly(ctx, manhattan);

        // Brooklyn shore silhouette (as a line)
        ctx.strokeStyle = pal.landStroke;
        ctx.lineWidth = 1;
        _strokePoly(ctx, _projectPoints(_BROOKLYN_SHORE, spatial));

        // Bronx shore
        _strokePoly(ctx, _projectPoints(_BRONX_SHORE, spatial));
      });
    }

    // ── Layer: Water ─────────────────────────────────────────────────────
    if (layers.water !== false) {
      _guard(function () {
        // Hudson River — filled polygon
        var riverPoly = _buildRiverPoly(_HUDSON_EAST, _HUDSON_WEST);
        var riverPts  = _projectPoints(riverPoly, spatial);

        ctx.fillStyle   = pal.waterFill;
        ctx.strokeStyle = pal.waterStroke;
        ctx.lineWidth   = 1;
        _fillPoly(ctx, riverPts);

        // Subtle glow stroke along east bank
        if (pal.waterGlow !== "rgba(0,0,0,0)") {
          ctx.strokeStyle = pal.waterGlow;
          ctx.lineWidth   = style === "cinematic" ? 8 : 4;
          _strokePoly(ctx, _projectPoints(_HUDSON_EAST, spatial));
        }
        ctx.strokeStyle = pal.waterStroke;
        ctx.lineWidth   = 1;
        _strokePoly(ctx, riverPts);

        // Upper Bay
        ctx.fillStyle   = pal.waterFill;
        ctx.strokeStyle = pal.waterStroke;
        ctx.lineWidth   = 1;
        _fillPoly(ctx, _projectPoints(_UPPER_BAY, spatial));
        _strokePoly(ctx, _projectPoints(_UPPER_BAY, spatial));

        // East River (thin fill)
        var erPoly = _EAST_RIVER_W.concat(_EAST_RIVER_E.slice().reverse());
        ctx.fillStyle   = pal.waterFill;
        _fillPoly(ctx, _projectPoints(erPoly, spatial));

        // Kill Van Kull (thin line)
        ctx.strokeStyle = pal.waterStroke;
        ctx.lineWidth   = 2;
        _strokePoly(ctx, _projectPoints(_KILL_VAN_KULL, spatial));
      });
    }

    // ── Layer: Parks / Green Zones ────────────────────────────────────────
    if (layers.parks !== false) {
      _guard(function () {
        ctx.fillStyle   = pal.parkFill;
        ctx.strokeStyle = pal.parkStroke;
        ctx.lineWidth   = 1;

        // Central Park
        var cp = _projectPoints(_CENTRAL_PARK, spatial);
        if (cp.length === 4) _fillRect4(ctx, cp);
        ctx.strokeStyle = pal.parkStroke;
        if (cp.length === 4) {
          ctx.strokeRect(
            Math.min(cp[0].x,cp[3].x), Math.min(cp[0].y,cp[1].y),
            Math.abs(cp[1].x-cp[0].x), Math.abs(cp[2].y-cp[0].y)
          );
        }

        // Inwood Park
        _fillPoly(ctx, _projectPoints(_INWOOD_PARK, spatial));

        // Palisades
        _fillPoly(ctx, _projectPoints(_PALISADES, spatial));

        // Hudson Highlands east + west
        _fillPoly(ctx, _projectPoints(_HIGHLANDS_W, spatial));
        _fillPoly(ctx, _projectPoints(_HIGHLANDS_E, spatial));

        // Bear Mountain zone
        _fillPoly(ctx, _projectPoints(_BEAR_MOUNTAIN, spatial));

        // Riverside Park (thin strip, just a line)
        ctx.strokeStyle = pal.parkStroke;
        ctx.lineWidth   = style === "muted" ? 3 : 4;
        _strokePoly(ctx, _projectPoints(_RIVERSIDE_PARK, spatial));
      });
    }

    // ── Layer: Major Roads ────────────────────────────────────────────────
    if (layers.roads !== false) {
      _guard(function () {
        var roads = [
          { pts: _HENRY_HUDSON_PKY, w: 1.5 },
          { pts: _PALISADES_PKY,    w: 1.5 },
          { pts: _US9,              w: 1.5 },
          { pts: _I87,              w: 2   },
          { pts: _I287,             w: 1.5 },
          { pts: _SAW_MILL,         w: 1   },
        ];

        // Glow pass
        if (pal.roadGlow !== "rgba(0,0,0,0)") {
          ctx.strokeStyle = pal.roadGlow;
          ctx.lineCap     = "round";
          ctx.lineJoin    = "round";
          roads.forEach(function (r) {
            ctx.lineWidth = (r.w + 4);
            _strokePoly(ctx, _projectPoints(r.pts, spatial));
          });
        }

        // Main pass
        ctx.strokeStyle = pal.roadStroke;
        ctx.lineCap     = "round";
        ctx.lineJoin    = "round";
        roads.forEach(function (r) {
          ctx.lineWidth = r.w;
          _strokePoly(ctx, _projectPoints(r.pts, spatial));
        });
      });
    }

    // ── Layer: Bridges ────────────────────────────────────────────────────
    if (layers.bridges !== false) {
      _guard(function () {
        _BRIDGES.forEach(function (br) {
          var pts = _projectPoints(br.points, spatial);
          if (pts.length < 2) return;

          // Glow
          if (pal.bridgeGlow !== "rgba(0,0,0,0)" && br.landmark) {
            ctx.strokeStyle = pal.bridgeGlow;
            ctx.lineWidth   = (br.width || 3) + 6;
            ctx.lineCap     = "round";
            _strokePoly(ctx, pts);
          }

          // Main line
          ctx.strokeStyle = pal.bridgeStroke;
          ctx.lineWidth   = br.width || 3;
          ctx.lineCap     = "round";
          _strokePoly(ctx, pts);

          // Landmark tick marks (major bridges)
          if (br.landmark && opts && opts.showLabels) {
            var p0 = pts[0], p1 = pts[pts.length - 1];
            var mx = (p0.x + p1.x) / 2;
            var my = (p0.y + p1.y) / 2;
            ctx.font        = "8px monospace";
            ctx.fillStyle   = pal.labelFill;
            ctx.textAlign   = "center";
            ctx.fillText(br.name, mx, my - 6);
          }
        });
      });
    }

    ctx.restore();
  }

  // ── Layer toggle helpers ───────────────────────────────────────────────────
  function makeDefaultState() {
    return {
      enabled: true,
      layers: {
        water:     true,
        roads:     true,
        bridges:   true,
        parks:     true,
        districts: true,
      },
      opacity: 0.45,
      style: "muted",   // "muted" | "wireframe" | "cinematic"
    };
  }

  function setLayerVisible(rg, layer, on) {
    if (!rg || !rg.layers) return;
    rg.layers[layer] = on !== false;
  }

  function setStyle(rg, style) {
    if (!rg) return;
    rg.style = STYLES[style] ? style : "muted";
  }

  function setOpacity(rg, value) {
    if (!rg) return;
    rg.opacity = Math.max(0, Math.min(1, value));
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.ReferenceGeographyLayer = {
    render:            render,
    makeDefaultState:  makeDefaultState,
    setLayerVisible:   setLayerVisible,
    setStyle:          setStyle,
    setOpacity:        setOpacity,
    STYLES:            STYLES,
    // Raw geo data exposed for debugging
    _HUDSON_EAST:   _HUDSON_EAST,
    _HUDSON_WEST:   _HUDSON_WEST,
    _BRIDGES:       _BRIDGES,
    _MANHATTAN:     _MANHATTAN,
  };

  console.log("[WOS ReferenceGeographyLayer] Loaded — Phase 1: Brooklyn → Cold Spring · 0515 v1.0.0");
})(window);
