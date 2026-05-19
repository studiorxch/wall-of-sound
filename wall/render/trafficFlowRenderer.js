(function initTrafficFlowRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Traffic Flow Renderer (TrafficFlowField v1.0.0) ────────────────────────
  //
  // DEBUG VISUALIZATION ONLY — gated on state.world.flow.debugDraw.
  //
  // Renders in WORLD SPACE (ctx pre-transformed by caller):
  //   • Flow vectors   — tiny directional strokes per realized walker
  //   • Pressure clouds — soft radial glow scaled by local density
  //   • Cluster regions — colored halos grouping nearby walkers

  // Stable cluster color palette — indexed by clusterId % length
  var _CLUSTER_COLORS = [
    "rgba(95,211,188,",   // teal
    "rgba(240,198,116,",  // amber
    "rgba(255,102,119,",  // coral
    "rgba(160,140,220,",  // lavender
    "rgba(100,200,255,",  // sky
    "rgba(220,180,80,",   // gold
    "rgba(180,220,100,",  // lime
    "rgba(255,140,80,",   // orange
  ];

  // ── Main entry ─────────────────────────────────────────────────────────────
  // ctx   — world-space 2D context (camera transform applied by caller)
  // state — full WOS state
  function render(ctx, state) {
    var cfg = state.world && state.world.flow;
    if (!cfg || !cfg.debugDraw) return;

    var eco = state.world && state.world.ecology;
    if (!eco || !eco.enabled) return;

    var entities = state.world && state.world.realizedEntities;
    if (!entities || !entities.size) return;

    var walkers = state.projectileWalkers || [];

    // Collect realized walkers with flow data
    var flowWalkers = [];
    entities.forEach(function (entry) {
      var w = walkers.find(function (w) { return w.id === entry.walkerId; });
      if (w && w.flow) flowWalkers.push(w);
    });
    if (!flowWalkers.length) return;

    ctx.save();

    // ── Layer 1: Cluster region halos ─────────────────────────────────────────
    // Group walkers by clusterId and draw a single merged glow per cluster.
    var clusterMap = {};
    flowWalkers.forEach(function (w) {
      var cid = w.flow.clusterId;
      if (cid < 0) return;
      if (!clusterMap[cid]) clusterMap[cid] = [];
      clusterMap[cid].push(w);
    });

    Object.keys(clusterMap).forEach(function (cid) {
      var members = clusterMap[cid];
      if (members.length < 2) return; // solo walkers don't get a cluster halo

      // Centroid of cluster
      var cx = 0, cy = 0;
      members.forEach(function (w) { cx += w.x; cy += w.y; });
      cx /= members.length;
      cy /= members.length;

      // Max distance from centroid → halo radius
      var maxR = 0;
      members.forEach(function (w) {
        var r = Math.hypot(w.x - cx, w.y - cy);
        if (r > maxR) maxR = r;
      });
      var haloR = Math.max(40, maxR + 30);

      var colorBase = _CLUSTER_COLORS[parseInt(cid) % _CLUSTER_COLORS.length];
      var avgPressure = 0;
      members.forEach(function (w) { avgPressure += w.flow.pressure; });
      avgPressure /= members.length;

      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
      grad.addColorStop(0,   colorBase + (avgPressure * 0.18) + ")");
      grad.addColorStop(0.6, colorBase + (avgPressure * 0.09) + ")");
      grad.addColorStop(1,   colorBase + "0)");

      ctx.fillStyle   = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Layer 2: Pressure clouds per walker ───────────────────────────────────
    flowWalkers.forEach(function (w) {
      var pressure = w.flow.pressure;
      if (pressure < 0.05) return;

      var r    = 18 + pressure * 38;
      var grad = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, r);
      grad.addColorStop(0,   "rgba(255,255,255," + (pressure * 0.22) + ")");
      grad.addColorStop(0.5, "rgba(255,255,255," + (pressure * 0.08) + ")");
      grad.addColorStop(1,   "rgba(255,255,255,0)");

      ctx.fillStyle   = grad;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
      ctx.fill();
    });

    // ── Layer 3: Flow vectors ─────────────────────────────────────────────────
    // Tiny directional stroke showing alignment vector per walker.
    ctx.lineCap   = "round";
    ctx.lineWidth = 1.5;

    flowWalkers.forEach(function (w) {
      var ax  = w.flow.alignmentX;
      var ay  = w.flow.alignmentY;
      var mag = Math.hypot(ax, ay);
      if (mag < 1) return; // no meaningful alignment

      // Normalize and scale to 14px arrow
      var len = 14;
      var nx  = (ax / mag) * len;
      var ny  = (ay / mag) * len;

      var alpha = 0.3 + w.flow.pressure * 0.45;
      ctx.strokeStyle = "rgba(61,216,197," + alpha + ")";
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(w.x + nx, w.y + ny);
      ctx.stroke();

      // Arrowhead
      var angle   = Math.atan2(ny, nx);
      var tipX    = w.x + nx;
      var tipY    = w.y + ny;
      var headLen = 5;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - headLen * Math.cos(angle - 0.4),
        tipY - headLen * Math.sin(angle - 0.4)
      );
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - headLen * Math.cos(angle + 0.4),
        tipY - headLen * Math.sin(angle + 0.4)
      );
      ctx.stroke();
    });

    // ── Metrics label (world space, near camera center) ────────────────────────
    var flowCfg = state.world.flow;
    var metrics = flowCfg && flowCfg.metrics;
    if (metrics) {
      var cam = state.camera || { x: 0, y: 0, zoom: 1 };
      var labelX = cam.x - 180;
      var labelY = cam.y - (300 / (cam.zoom || 1));

      ctx.save();
      ctx.font        = "14px monospace";
      ctx.textAlign   = "left";
      ctx.fillStyle   = "rgba(61,216,197,0.85)";
      ctx.globalAlpha = 1;
      ctx.fillText("FLOW  clusters:" + metrics.activeClusters +
                   "  avgP:" + metrics.avgPressure.toFixed(2) +
                   "  maxP:" + metrics.maxPressure.toFixed(2),
                   labelX, labelY);
      ctx.restore();
    }

    ctx.restore();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.TrafficFlowRenderer = {
    render: render,
  };

})(window);
