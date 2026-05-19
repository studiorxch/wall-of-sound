(function initRealizationRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Realization Renderer (LocalRealization v1.0.0) ────────────────────────
  //
  // Renders the visible layer of the corridor ecology:
  //   • District pressure overlays (nightlife / traffic / delivery)
  //   • Route path visualization (pressure-scaled opacity + width)
  //   • Camera realization bubble (debug — gated on debugHUD + visualizeRadius)
  //
  // IMPORTANT: render() expects ctx already in WORLD SPACE (camera transform
  // applied by caller). Do NOT apply additional transforms here.

  // ── Main entry ─────────────────────────────────────────────────────────────
  // ctx       — Canvas 2D context already transformed to world space
  // state     — Full WOS state
  // now       — performance.now() for animation
  function render(ctx, state, now) {
    var eco = state.world && state.world.ecology;
    if (!eco || !eco.enabled) return;

    var cfg = (state.world && state.world.realization) || {};

    _drawDistrictOverlays(ctx, eco, now);
    _drawRoutes(ctx, eco, now);

    if (cfg.visualizeRadius !== false && state.ui && state.ui.debugHUD) {
      var cam = state.camera || { x: 0, y: 0, zoom: 1 };
      _drawCameraBubble(ctx, cam, cfg, now);
    }
  }

  // ── District pressure overlays ─────────────────────────────────────────────
  // Three blended radial gradients per district:
  //   nightlife → magenta pulse
  //   traffic   → orange glow
  //   delivery  → yellow wash
  // Plus a dashed perimeter ring scaled by district energy.
  function _drawDistrictOverlays(ctx, eco, now) {
    var DP = global.SBE && SBE.DistrictPressure;
    if (!DP) return;

    var districts = DP.DISTRICTS;
    var pressure  = eco.pressure && eco.pressure.districts;
    if (!pressure) return;

    var t = now * 0.001;

    Object.values(districts).forEach(function (d) {
      var dp = pressure[d.id];
      if (!dp) return;

      // ── Nightlife — magenta pulse ──────────────────────────────────────────
      if (dp.nightlife > 0.08) {
        var nlPulse  = 0.5 + 0.5 * Math.sin(t * 1.1 + d.x * 0.0005);
        var nlAlpha  = dp.nightlife * 0.20 * (0.6 + nlPulse * 0.4);
        var nlRadius = d.radius * (0.75 + dp.nightlife * 0.45);
        var nlGrad   = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, nlRadius);
        nlGrad.addColorStop(0,   "rgba(220,55,175," + Math.min(0.55, nlAlpha * 1.3) + ")");
        nlGrad.addColorStop(0.5, "rgba(175,35,130," + nlAlpha + ")");
        nlGrad.addColorStop(1,   "rgba(130,15,95,0)");
        ctx.fillStyle = nlGrad;
        ctx.beginPath();
        ctx.arc(d.x, d.y, nlRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Traffic — orange saturation glow ──────────────────────────────────
      if (dp.traffic > 0.12) {
        var trAlpha  = dp.traffic * 0.14;
        var trRadius = d.radius * (0.55 + dp.traffic * 0.55);
        var trGrad   = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, trRadius);
        trGrad.addColorStop(0,   "rgba(255,138,25," + Math.min(0.45, trAlpha * 1.6) + ")");
        trGrad.addColorStop(0.6, "rgba(220,95,15," + trAlpha + ")");
        trGrad.addColorStop(1,   "rgba(180,55,5,0)");
        ctx.fillStyle = trGrad;
        ctx.beginPath();
        ctx.arc(d.x, d.y, trRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Delivery — yellow wash ─────────────────────────────────────────────
      if (dp.delivery > 0.12) {
        var dlAlpha  = dp.delivery * 0.11;
        var dlRadius = d.radius * (0.45 + dp.delivery * 0.45);
        var dlGrad   = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, dlRadius);
        dlGrad.addColorStop(0,   "rgba(255,218,55," + Math.min(0.4, dlAlpha * 1.6) + ")");
        dlGrad.addColorStop(0.65,"rgba(220,185,35," + dlAlpha + ")");
        dlGrad.addColorStop(1,   "rgba(180,155,15,0)");
        ctx.fillStyle = dlGrad;
        ctx.beginPath();
        ctx.arc(d.x, d.y, dlRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── District perimeter ring ────────────────────────────────────────────
      var energy = dp.energy || 0;
      ctx.save();
      ctx.globalAlpha = 0.18 + energy * 0.30;
      ctx.strokeStyle = "#3dd8c5";
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // ── District label (world space) ───────────────────────────────────────
      ctx.save();
      ctx.globalAlpha = 0.35 + energy * 0.35;
      ctx.fillStyle   = "#3dd8c5";
      ctx.font        = "18px monospace";
      ctx.textAlign   = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.label.toUpperCase(), d.x, d.y - d.radius - 22);
      ctx.restore();
    });
  }

  // ── Route path visualization ───────────────────────────────────────────────
  // Renders corridor routes as semi-transparent dashed lines.
  // Width and opacity scale with district traffic pressure.
  function _drawRoutes(ctx, eco, now) {
    var TE = global.SBE && SBE.TrafficEcology;
    if (!TE) return;

    var pressure = eco.pressure && eco.pressure.districts;

    Object.values(TE.ROUTES).forEach(function (route) {
      var wps = route.waypoints;
      if (!wps || wps.length < 2) return;

      // Average traffic pressure across connected districts
      var routeTraffic = 0;
      if (pressure && route.districts) {
        var sum = 0, cnt = 0;
        route.districts.forEach(function (id) {
          if (pressure[id]) { sum += pressure[id].traffic; cnt++; }
        });
        routeTraffic = cnt > 0 ? sum / cnt : 0;
      }

      var alpha     = 0.06 + routeTraffic * 0.20;
      var lineWidth = 1.2 + routeTraffic * 4.5;

      ctx.save();
      ctx.strokeStyle = "rgba(100,210,185," + alpha + ")";
      ctx.lineWidth   = lineWidth;
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";
      ctx.setLineDash([14, 20]);

      ctx.beginPath();
      ctx.moveTo(wps[0].x, wps[0].y);
      for (var i = 1; i < wps.length; i++) {
        ctx.lineTo(wps[i].x, wps[i].y);
      }
      ctx.stroke();

      // High-pressure routes get a bright spine
      if (routeTraffic > 0.5) {
        ctx.strokeStyle = "rgba(160,240,220," + (routeTraffic * 0.12) + ")";
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(wps[0].x, wps[0].y);
        for (var j = 1; j < wps.length; j++) {
          ctx.lineTo(wps[j].x, wps[j].y);
        }
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.restore();
    });
  }

  // ── Camera realization bubble ──────────────────────────────────────────────
  // Drawn in world space around camera.x/y — shows the realization radius
  // as a pulsing dashed ring. Only visible when debugHUD is on.
  function _drawCameraBubble(ctx, cam, cfg, now) {
    var radius = cfg.radius || 1800;
    var t      = now * 0.001;
    var pulse  = 0.5 + 0.5 * Math.sin(t * 0.75);

    ctx.save();

    // Outer dashed ring — pulsing opacity
    ctx.globalAlpha = 0.06 + pulse * 0.06;
    ctx.strokeStyle = "#3dd8c5";
    ctx.lineWidth   = 2;
    ctx.setLineDash([22, 32]);
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Despawn ring (radius + padding) — dimmer
    var padding = cfg.despawnPadding || 300;
    ctx.globalAlpha = 0.03 + pulse * 0.02;
    ctx.strokeStyle = "#ffbf2f";
    ctx.lineWidth   = 1;
    ctx.setLineDash([10, 20]);
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, radius + padding, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Soft radial fill at bubble edge
    var grad = ctx.createRadialGradient(
      cam.x, cam.y, radius * 0.75,
      cam.x, cam.y, radius
    );
    grad.addColorStop(0, "rgba(61,216,197,0)");
    grad.addColorStop(1, "rgba(61,216,197," + (0.015 + pulse * 0.015) + ")");
    ctx.fillStyle   = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.RealizationRenderer = {
    render: render,
  };

})(window);
