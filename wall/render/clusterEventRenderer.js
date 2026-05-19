(function initClusterEventRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Cluster Event Renderer (ClusterEvents v1.0.0) ─────────────────────────
  //
  // DEBUG VISUALIZATION ONLY — gated on state.world.clusterEvents.debugDraw.
  //
  // Renders in WORLD SPACE (ctx pre-transformed by caller).
  // Stage 1: no public-facing UI — only debug overlays.
  //
  // Layers:
  //   • Soft pressure ring per event (color by type, opacity by strength)
  //   • State + strength label
  //   • Camera interest indicator
  //   • Actor attraction vectors (near abstract actors)

  // Per-type color palette
  var _TYPE_COLORS = {
    rooftop:           { r: 220, g:  80, b: 200 },   // magenta
    vendor:            { r: 255, g: 200, b:  60 },   // warm gold
    transitDelay:      { r: 255, g: 130, b:  40 },   // orange
    rainShelter:       { r: 100, g: 180, b: 255 },   // cool blue
    streetPerformance: { r: 120, g: 255, b: 160 },   // bright green
    nightlifeSpill:    { r: 160, g:  80, b: 255 },   // violet
  };

  function _col(type, a) {
    var c = _TYPE_COLORS[type] || { r: 200, g: 200, b: 200 };
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }

  // State fill colors (transparent tint inside ring)
  var _STATE_TINT = {
    seed:    0.02,
    grow:    0.05,
    peak:    0.10,
    decay:   0.04,
  };

  // ── Main entry ─────────────────────────────────────────────────────────────
  function render(ctx, state, now) {
    var cfg = state.world && state.world.clusterEvents;
    if (!cfg || !cfg.debugDraw) return;

    var events = cfg.events || [];
    if (!events.length) return;

    var t = now * 0.001;

    ctx.save();

    events.forEach(function (ev) {
      if (ev.state === "dissolve") return;
      _drawEvent(ctx, ev, t);
    });

    // ── Actor attraction vectors (sampled) ──────────────────────────────────
    _drawAttractionVectors(ctx, state, events, t);

    // ── Global metrics label near camera ───────────────────────────────────
    _drawMetricsLabel(ctx, state, cfg);

    ctx.restore();
  }

  // ── Draw a single event ────────────────────────────────────────────────────
  function _drawEvent(ctx, ev, t) {
    var s      = ev.strength;
    var pulse  = 0.5 + 0.5 * Math.sin(t * (0.8 + s * 1.2) + ev.x * 0.001);
    var tint   = _STATE_TINT[ev.state] || 0.03;

    // ── Outer pressure ring ──────────────────────────────────────────────
    var ringR  = ev.radius * (0.9 + s * 0.25 + pulse * 0.08);
    var grad   = ctx.createRadialGradient(ev.x, ev.y, ringR * 0.55, ev.x, ev.y, ringR);
    grad.addColorStop(0,   _col(ev.type, 0));
    grad.addColorStop(0.6, _col(ev.type, s * tint * 1.5));
    grad.addColorStop(0.85,_col(ev.type, s * (tint + 0.04)));
    grad.addColorStop(1,   _col(ev.type, 0));

    ctx.fillStyle   = grad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(ev.x, ev.y, ringR, 0, Math.PI * 2);
    ctx.fill();

    // ── Ring stroke ──────────────────────────────────────────────────────
    var ringAlpha = 0.12 + s * 0.35 + pulse * 0.08;
    ctx.strokeStyle = _col(ev.type, ringAlpha);
    ctx.lineWidth   = 1.5 + s * 2;
    ctx.setLineDash([16, 20]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(ev.x, ev.y, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Center cross ─────────────────────────────────────────────────────
    var cs = 8 + s * 10;
    ctx.strokeStyle = _col(ev.type, 0.50 + s * 0.30);
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(ev.x - cs, ev.y);
    ctx.lineTo(ev.x + cs, ev.y);
    ctx.moveTo(ev.x, ev.y - cs);
    ctx.lineTo(ev.x, ev.y + cs);
    ctx.stroke();

    // ── State + strength label ────────────────────────────────────────────
    ctx.save();
    ctx.fillStyle    = _col(ev.type, 0.85);
    ctx.font         = "12px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "top";
    ctx.globalAlpha  = 0.80;

    var label = ev.type + "  [" + ev.state + "]  " +
                Math.round(s * 100) + "%";
    ctx.fillText(label, ev.x, ev.y - ringR - 18);

    // ── Strength bar ──────────────────────────────────────────────────────
    var barW  = 80;
    var barH  = 5;
    var barX  = ev.x - barW / 2;
    var barY  = ev.y - ringR - 10;
    ctx.fillStyle   = "rgba(0,0,0,0.40)";
    ctx.globalAlpha = 0.70;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle   = _col(ev.type, 0.90);
    ctx.globalAlpha = 0.85;
    ctx.fillRect(barX, barY, barW * s, barH);

    // ── Camera interest indicator ─────────────────────────────────────────
    if (ev.cameraInterest > 0.35) {
      ctx.fillStyle   = "rgba(255,255,120,0.70)";
      ctx.globalAlpha = ev.cameraInterest * s;
      ctx.font        = "10px monospace";
      ctx.textAlign   = "left";
      ctx.fillText("◎ " + Math.round(ev.cameraInterest * 100) + "%",
                   ev.x + ringR * 0.65, ev.y - 5);
    }

    ctx.restore();
  }

  // ── Actor attraction vectors ───────────────────────────────────────────────
  // Sample a subset of abstract actors near active events and draw a tiny
  // arrow toward the event they're being drawn to.
  function _drawAttractionVectors(ctx, state, events, t) {
    var actors = state.world && state.world.abstractActors;
    if (!actors || !actors.length) return;

    var peakEvents = events.filter(function (ev) {
      return ev.state === "peak" || ev.state === "grow";
    });
    if (!peakEvents.length) return;

    ctx.save();
    ctx.globalAlpha = 0.55;

    // Sample: check actors near event centers
    peakEvents.forEach(function (ev) {
      var checked = 0;
      for (var i = 0; i < actors.length && checked < 30; i++) {
        var a = actors[i];
        if (!a || a.realized) continue;
        var dist = Math.hypot(a.wx - ev.x, a.wy - ev.y);
        if (dist > ev.radius * 2.0 || dist < 10) continue;
        checked++;

        // Only draw if actor archetype is attracted
        var bias = (ev.actorBias && ev.actorBias[a.archetype]) || 0.5;
        if (bias < 0.8) continue;

        var dx  = ev.x - a.wx;
        var dy  = ev.y - a.wy;
        var len = Math.hypot(dx, dy);
        var nx  = dx / len;
        var ny  = dy / len;
        var arLen = 8 + ev.strength * 10;

        var alpha = (1 - dist / (ev.radius * 2.0)) * ev.strength * 0.6;
        ctx.strokeStyle = _col(ev.type, alpha);
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(a.wx, a.wy);
        ctx.lineTo(a.wx + nx * arLen, a.wy + ny * arLen);
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  // ── Metrics label ──────────────────────────────────────────────────────────
  function _drawMetricsLabel(ctx, state, cfg) {
    var m = cfg.metrics;
    if (!m) return;

    var cam = state.camera || { x: 0, y: 0, zoom: 1 };
    var lx  = cam.x - 120;
    var ly  = cam.y + (460 / (cam.zoom || 1));

    ctx.save();
    ctx.fillStyle    = "rgba(0,0,0,0.50)";
    ctx.globalAlpha  = 0.90;
    ctx.fillRect(lx - 4, ly - 14, 250, 22);

    ctx.font         = "12px monospace";
    ctx.textAlign    = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle    = "rgba(220,200,255,0.90)";
    ctx.globalAlpha  = 1;
    ctx.fillText(
      "EVENTS  active:" + m.active +
      "  peak:" + m.peak +
      "  avgS:" + (m.avgStrength || 0).toFixed(2),
      lx, ly - 11
    );
    ctx.restore();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.ClusterEventRenderer = {
    render: render,
  };

})(window);
