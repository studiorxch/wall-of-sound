// 0513_WOS_CorridorRenderer_v1.0.0
// Corridor Renderer — semantic 2D visualization of the WOS route corridor.
// Vanilla IIFE. Attaches to SBE.CorridorRenderer.
// Load order: spatialInfrastructure.js → worldInspector.js → corridorRenderer.js → main.js
//
// ═══════════════════════════════════════════════════════════════════════════
// OWNERSHIP
//   Reads from: routeWorld.spatial, routeWorld.camera, routeWorld.actors,
//               routeWorld.clock, routeWorld.env
//   Draws:      district bands, route spine, scenic moments, POIs,
//               actor markers, camera reticle, debug labels
//   Never:      moves actors, modifies spatial data, owns simulation state
//
// COORDINATE CONTRACT
//   All spatial.corridor.points and spatial.pois already carry projected
//   canvas coordinates (x, y). This renderer does NOT project lat/lng.
//   Projection belongs to SpatialInfrastructure.
//
// INTEGRATION
//   Called from renderRouteWorldOverlay(), inside the camera-transform context,
//   after route skin/lines and before the HUD restore.
//
// LAYER TOGGLES (via routeWorld.world.layers or opts)
//   terrain  → route spine + district bands
//   signals  → POIs + scenic moments
//   walkers  → actor markers + camera reticle
//   debug    → labels + diagnostics
// ═══════════════════════════════════════════════════════════════════════════

(function initCorridorRenderer(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── District colors ───────────────────────────────────────────────────────
  var DISTRICT_COLORS = {
    downtown:    "rgba(80,  220, 255, 0.18)",
    industrial:  "rgba(255, 170,  70, 0.16)",
    residential: "rgba(90,  255, 160, 0.14)",
    suburban:    "rgba(180, 255, 120, 0.13)",
    rural:       "rgba(120, 220, 120, 0.12)",
    coastal:     "rgba(80,  160, 255, 0.18)",
    transit_hub: "rgba(255,  90, 220, 0.18)",
  };

  var DISTRICT_STROKE = {
    downtown:    "rgba(80,  220, 255, 0.55)",
    industrial:  "rgba(255, 170,  70, 0.50)",
    residential: "rgba(90,  255, 160, 0.45)",
    suburban:    "rgba(180, 255, 120, 0.42)",
    rural:       "rgba(120, 220, 120, 0.45)",
    coastal:     "rgba(80,  160, 255, 0.55)",
    transit_hub: "rgba(255,  90, 220, 0.55)",
  };

  // ── Scenic moment colors ──────────────────────────────────────────────────
  var SCENIC_COLORS = {
    bridge_crossing:    "#7adcff",
    waterfront:         "#4ab0ff",
    skyline:            "#ffe060",
    tunnel_exit:        "#b06fff",
    elevated_view:      "#80ffd0",
    dense_intersection: "#ff9040",
    industrial_pass:    "#ffb060",
  };

  // ── POI marker letters and colors ─────────────────────────────────────────
  var POI_ICON = {
    gas_station:  "G",
    food_stop:    "F",
    motel:        "M",
    rest_area:    "R",
    workplace:    "W",
    school:       "S",
    home:         "H",
    transit_stop: "T",
    parking:      "P",
    scenic_view:  "V",
  };

  var POI_COLORS = {
    gas_station:  "#ffd060",
    food_stop:    "#90ff90",
    motel:        "#a080ff",
    rest_area:    "#60e0ff",
    workplace:    "#ffffff",
    school:       "#ffb0e0",
    home:         "#80ffa0",
    transit_stop: "#ff90d0",
    parking:      "#c0c0c0",
    scenic_view:  "#ffe080",
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _guard(fn) {
    try { fn(); } catch (e) { /* silent — renderer never crashes the loop */ }
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }

  // ── Layer 1: District bands ────────────────────────────────────────────────
  // Draws each district as a thick colored polyline segment along the corridor.
  // Avoids blocking overlays — pure route-hugging color.
  function drawDistricts(ctx, spatial) {
    var corridor = spatial.corridor;
    if (!corridor || !corridor.points || corridor.points.length < 2) return;
    var pts = corridor.points;
    var districts = spatial.districts || [];

    districts.forEach(function (d) {
      var startIdx = Math.max(0, d.startIdx || 0);
      var endIdx   = Math.min(pts.length - 1, d.endIdx || pts.length - 1);
      if (startIdx >= endIdx) return;

      var fill   = DISTRICT_COLORS[d.type]  || "rgba(200,200,200,0.10)";
      var stroke = DISTRICT_STROKE[d.type]  || "rgba(200,200,200,0.40)";

      // Wide soft fill band
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[startIdx].x, pts[startIdx].y);
      for (var i = startIdx + 1; i <= endIdx; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.lineWidth   = 28;
      ctx.strokeStyle = fill;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.stroke();

      // Thin colored edge
      ctx.beginPath();
      ctx.moveTo(pts[startIdx].x, pts[startIdx].y);
      for (var j = startIdx + 1; j <= endIdx; j++) {
        ctx.lineTo(pts[j].x, pts[j].y);
      }
      ctx.lineWidth   = 2;
      ctx.strokeStyle = stroke;
      ctx.stroke();
      ctx.restore();
    });
  }

  // ── Layer 2 + 3: Route spine ──────────────────────────────────────────────
  // Draws shadow underlay then bright spine.
  function drawRoute(ctx, corridor) {
    if (!corridor || !corridor.points || corridor.points.length < 2) return;
    var pts = corridor.points;

    // ── Shadow underlay ───────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineWidth   = 9;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.shadowBlur  = 0;
    ctx.stroke();
    ctx.restore();

    // ── Bright spine ──────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.lineWidth        = 2.5;
    ctx.strokeStyle      = "rgba(70,255,220,0.85)";
    ctx.lineCap          = "round";
    ctx.lineJoin         = "round";
    ctx.shadowBlur       = 10;
    ctx.shadowColor      = "rgba(70,255,220,0.45)";
    ctx.globalAlpha      = 1;
    ctx.stroke();
    ctx.restore();

    // ── Start dot ─────────────────────────────────────────────────────────
    var p0 = pts[0], p1 = pts[pts.length - 1];
    ctx.save();
    ctx.beginPath();
    ctx.arc(p0.x, p0.y, 7, 0, Math.PI * 2);
    ctx.fillStyle   = "rgba(70,255,220,0.9)";
    ctx.shadowBlur  = 12;
    ctx.shadowColor = "rgba(70,255,220,0.6)";
    ctx.fill();
    ctx.restore();

    // ── End dot ───────────────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 7, 0, Math.PI * 2);
    ctx.fillStyle   = "rgba(255,200,80,0.9)";
    ctx.shadowBlur  = 12;
    ctx.shadowColor = "rgba(255,200,80,0.6)";
    ctx.fill();
    ctx.restore();
  }

  // ── Layer 4: Scenic moments ───────────────────────────────────────────────
  // Ring + center dot. Ring radius encodes cinematicValue. Optional pulse.
  function drawScenicMoments(ctx, spatial, pulseT) {
    var corridor = spatial.corridor;
    if (!corridor) return;
    var pts    = corridor.points;
    var scenic = corridor.scenicMoments || [];

    scenic.forEach(function (sm) {
      var pt = pts[sm.pointIndex];
      if (!pt) return;

      var color   = SCENIC_COLORS[sm.type] || "#ffffff";
      var radius  = 4 + (sm.cinematicValue || 0.5) * 8;
      // Subtle pulse — expands by ±1.5px on the ring
      var pulse   = typeof pulseT === "number" ? Math.sin(pulseT * Math.PI * 2) * 1.5 : 0;
      var outerR  = radius + pulse;

      ctx.save();

      // Outer ring
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, outerR, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.2;
      ctx.globalAlpha = 0.65 + (sm.cinematicValue || 0) * 0.25;
      ctx.shadowBlur  = 6;
      ctx.shadowColor = color;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2, 0, Math.PI * 2);
      ctx.fillStyle   = color;
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur  = 4;
      ctx.fill();

      ctx.restore();
    });
  }

  // ── Layer 5: POIs ──────────────────────────────────────────────────────────
  // Circle + letter marker. Sized by cinematicValue.
  function drawPOIs(ctx, spatial, scale) {
    var pois = spatial.pois || [];
    // Adaptive sizing: scale down when zoomed out
    var baseR = Math.max(5, Math.min(14, 12 / (scale || 1)));

    pois.forEach(function (poi) {
      if (poi.x == null || poi.y == null) return;

      var letter = POI_ICON[poi.type] || "?";
      var color  = POI_COLORS[poi.type] || "#cccccc";
      var r      = baseR * (0.85 + (poi.cinematicValue || 0.3) * 0.3);

      ctx.save();

      // Background circle
      ctx.beginPath();
      ctx.arc(poi.x, poi.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = "rgba(0,0,0,0.65)";
      ctx.globalAlpha = 1;
      ctx.fill();

      // Colored ring
      ctx.beginPath();
      ctx.arc(poi.x, poi.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.85;
      ctx.shadowBlur  = 5;
      ctx.shadowColor = color;
      ctx.stroke();

      // Letter
      var fontSize = Math.max(6, r * 1.1);
      ctx.font        = "600 " + fontSize + "px/1 monospace";
      ctx.fillStyle   = color;
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = 0.95;
      ctx.shadowBlur  = 0;
      ctx.fillText(letter, poi.x, poi.y);

      ctx.restore();
    });
  }

  // ── Layer 6: Actors ───────────────────────────────────────────────────────
  function drawActors(ctx, routeWorld, scale) {
    var actors = routeWorld.actors || [];
    var rw     = routeWorld;

    actors.forEach(function (actor) {
      if (actor.x == null || actor.y == null) return;
      if (!actor.x && !actor.y) return;

      var isHero  = actor.id === (rw.runtime && rw.runtime.activeActorId);
      var vis     = actor.visual || {};
      var color   = vis.color || (isHero ? "#f6d36b" : "#80c0ff");
      var r       = Math.max(3, (vis.radius || (isHero ? 8 : 5)) / (scale || 1));

      ctx.save();

      if (isHero) {
        // Hero: bright halo + larger dot
        var grad = ctx.createRadialGradient(actor.x, actor.y, 0, actor.x, actor.y, r * 3);
        grad.addColorStop(0,   color + "55");
        grad.addColorStop(1,   "transparent");
        ctx.beginPath();
        ctx.arc(actor.x, actor.y, r * 3, 0, Math.PI * 2);
        ctx.fillStyle   = grad;
        ctx.globalAlpha = 1;
        ctx.fill();

        // Direction indicator (short forward line)
        if (actor.heading != null) {
          ctx.beginPath();
          ctx.moveTo(actor.x, actor.y);
          ctx.lineTo(
            actor.x + Math.cos(actor.heading) * r * 2.5,
            actor.y + Math.sin(actor.heading) * r * 2.5
          );
          ctx.strokeStyle = color;
          ctx.lineWidth   = 1.5 / (scale || 1);
          ctx.globalAlpha = 0.8;
          ctx.stroke();
        }
      }

      // Core dot
      ctx.beginPath();
      ctx.arc(actor.x, actor.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = color;
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = isHero ? 10 : 4;
      ctx.shadowColor = color;
      ctx.fill();

      // Thin border
      ctx.beginPath();
      ctx.arc(actor.x, actor.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth   = 0.8 / (scale || 1);
      ctx.globalAlpha = 1;
      ctx.shadowBlur  = 0;
      ctx.stroke();

      ctx.restore();
    });
  }

  // ── Layer 7: Camera reticle ───────────────────────────────────────────────
  // Distinct from the actor — a crosshair / reticle square showing camera focus.
  function drawCamera(ctx, routeWorld, scale) {
    var cam = routeWorld.camera;
    if (!cam) return;
    var cx = cam.x, cy = cam.y;
    if (cx == null || cy == null) return;

    var s    = Math.max(5, 10 / (scale || 1));
    var tick = s * 0.4;

    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth   = 1.2 / (scale || 1);
    ctx.shadowBlur  = 6;
    ctx.shadowColor = "rgba(255,255,255,0.4)";

    // Square reticle (open corners)
    var corners = [
      [-s, -s], [ s, -s],
      [ s,  s], [-s,  s],
    ];
    corners.forEach(function (c) {
      var x = cx + c[0], y = cy + c[1];
      var dx = -Math.sign(c[0]) * tick, dy = -Math.sign(c[1]) * tick;
      ctx.beginPath();
      ctx.moveTo(x + dx, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy);
      ctx.stroke();
    });

    // Center crosshair dot
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5 / (scale || 1), 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fill();

    ctx.restore();
  }

  // ── Layer 8: Debug labels ─────────────────────────────────────────────────
  // Only drawn when showDebug or showLabels is true.
  function drawLabels(ctx, spatial, routeWorld, scale) {
    var corridor = spatial && spatial.corridor;
    var pts      = corridor && corridor.points || [];

    // District name labels — one per district, at midpoint of its corridor section
    var districts = spatial && spatial.districts || [];
    districts.forEach(function (d) {
      var mid = Math.floor(((d.startIdx || 0) + (d.endIdx || 0)) / 2);
      var pt  = pts[mid];
      if (!pt) return;
      drawLabel(ctx, d.name, pt.x + 14 / (scale || 1), pt.y, {
        color:   DISTRICT_STROKE[d.type] || "rgba(200,200,200,0.7)",
        scale:   scale,
        maxWidth: 180,
      });
    });

    // Scenic moment type labels
    var scenic = corridor && corridor.scenicMoments || [];
    scenic.forEach(function (sm) {
      var pt = pts[sm.pointIndex];
      if (!pt) return;
      drawLabel(ctx, sm.label || sm.type, pt.x + 14 / (scale || 1), pt.y - 14 / (scale || 1), {
        color:  SCENIC_COLORS[sm.type] || "#aaa",
        scale:  scale,
        small:  true,
      });
    });

    // Hero actor diagnostics
    var heroId  = routeWorld.runtime && routeWorld.runtime.activeActorId;
    var hero    = (routeWorld.actors || []).find(function (a) { return a.id === heroId; });
    if (hero && hero.x != null) {
      var lines = [];
      if (hero._district) lines.push(hero._district.name);
      if (hero._scenicMoment) lines.push("◆ " + hero._scenicMoment.label);
      if (hero.needs) {
        var AN = SBE.AgentNeeds;
        if (AN) {
          var status = AN.needsStatus(hero);
          if (status && status.priority) {
            var pct = Math.round((hero.needs[status.priority] || 0) * 100);
            lines.push(status.priority.toUpperCase() + " " + pct + "%");
          }
        }
      }
      var lx = hero.x + 18 / (scale || 1), ly = hero.y - 20 / (scale || 1);
      lines.forEach(function (ln, i) {
        drawLabel(ctx, ln, lx, ly - i * 16 / (scale || 1), { color: "#f6d36b", scale: scale, small: true });
      });
    }

    // Spatial interest score at camera
    var cam = routeWorld.camera;
    var SI  = SBE.SpatialInfrastructure;
    if (cam && SI && spatial) {
      var score = SI.spatialInterest(spatial, { x: cam.x, y: cam.y }, routeWorld.env, routeWorld.clock);
      if (!isNaN(score)) {
        drawLabel(ctx, "interest " + score.toFixed(2), (cam.x || 0) + 18 / (scale || 1), (cam.y || 0) + 20 / (scale || 1), {
          color: "rgba(255,255,255,0.5)", scale: scale, small: true,
        });
      }
    }
  }

  // ── drawLabel ─────────────────────────────────────────────────────────────
  function drawLabel(ctx, text, x, y, opts) {
    opts = opts || {};
    var s      = opts.scale || 1;
    var fsize  = opts.small ? Math.max(7, 9 / s) : Math.max(8, 11 / s);
    var color  = opts.color || "rgba(220,220,220,0.75)";

    ctx.save();
    ctx.font         = "400 " + fsize + "px/1 monospace";
    ctx.fillStyle    = color;
    ctx.textAlign    = "left";
    ctx.textBaseline = "middle";
    ctx.globalAlpha  = 1;
    ctx.shadowBlur   = 3;
    ctx.shadowColor  = "rgba(0,0,0,0.8)";

    // Tiny background pill for readability
    var w = ctx.measureText(text).width + 8 / s;
    ctx.fillStyle   = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - 3 / s, y - fsize / 2 - 2 / s, w, fsize + 4 / s);
    ctx.fillStyle   = color;
    ctx.shadowBlur  = 0;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // ── Main render entry point ───────────────────────────────────────────────
  // ctx:        canvas 2D context (already in camera-transformed world space)
  // routeWorld: state.routeWorld
  // opts:       CorridorRenderOptions
  // scale:      current camera zoom (for line-width compensation)
  // pulseT:     0–1 animation timer (cam._pulseT)
  function render(ctx, routeWorld, opts, scale, pulseT) {
    if (!routeWorld) return;
    var spatial = routeWorld.spatial;
    if (!spatial) return;

    opts  = opts  || {};
    scale = scale || 1;

    var showRoute   = opts.showRoute          !== false;
    var showDist    = opts.showDistricts      !== false;
    var showPOIs    = opts.showPOIs           !== false;
    var showScenic  = opts.showScenicMoments  !== false;
    var showActors  = opts.showActors         !== false;
    var showCam     = opts.showCamera         !== false;
    var showDebug   = opts.showDebug          || opts.showLabels || false;

    _guard(function () {
      if (showDist)   drawDistricts(ctx, spatial);
    });
    _guard(function () {
      if (showRoute)  drawRoute(ctx, spatial.corridor);
    });
    _guard(function () {
      if (showScenic) drawScenicMoments(ctx, spatial, pulseT);
    });
    _guard(function () {
      if (showPOIs)   drawPOIs(ctx, spatial, scale);
    });
    _guard(function () {
      if (showActors) drawActors(ctx, routeWorld, scale);
    });
    _guard(function () {
      if (showCam)    drawCamera(ctx, routeWorld, scale);
    });
    _guard(function () {
      if (showDebug)  drawLabels(ctx, spatial, routeWorld, scale);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.CorridorRenderer = {
    render:             render,
    // Individual layers (exposed for custom callers)
    drawRoute:          drawRoute,
    drawDistricts:      drawDistricts,
    drawScenicMoments:  drawScenicMoments,
    drawPOIs:           drawPOIs,
    drawActors:         drawActors,
    drawCamera:         drawCamera,
    drawLabels:         drawLabels,
    drawLabel:          drawLabel,
    // Constants
    DISTRICT_COLORS:    DISTRICT_COLORS,
    POI_COLORS:         POI_COLORS,
    POI_ICON:           POI_ICON,
    SCENIC_COLORS:      SCENIC_COLORS,
  };

  console.log("[WOS CorridorRenderer] Loaded — Corridor Renderer v1.0.0");
})(window);
