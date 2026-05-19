(function initActorRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Actor Renderer (ActorEcology v1.0.0) ──────────────────────────────────
  //
  // DEBUG VISUALIZATION ONLY — gated on state.world.actors.debugDraw.
  //
  // Renders in WORLD SPACE (ctx pre-transformed by caller).
  // Actual actor visuals come from the existing drawWalkers pipeline via
  // _subjectStyle on realized actor walkers.
  //
  // This renderer adds:
  //   • Archetype density heat (abstract actors — no walker required)
  //   • Realized actor archetype rings
  //   • Abstract actor cluster overlay
  //   • Metrics readout near camera center

  // Archetype color map (matches ARCHETYPES definitions)
  var _ARCHETYPE_COLORS = {
    commuter:  "rgba(125,207,255,",
    nightlife: "rgba(255,102,204,",
    delivery:  "rgba(240,198,116,",
    wanderer:  "rgba(126,231,216,",
    ghost:     "rgba(204,204,255,",
  };

  function _col(archetype, alpha) {
    var base = _ARCHETYPE_COLORS[archetype] || "rgba(200,200,200,";
    return base + alpha + ")";
  }

  // ── Main entry ─────────────────────────────────────────────────────────────
  function render(ctx, state, now) {
    var actorCfg = state.world && state.world.actors;
    if (!actorCfg || !actorCfg.debugDraw) return;

    var actors   = state.world.abstractActors || [];
    var realized = state.world.realizedActors;
    if (!actors.length && (!realized || !realized.size)) return;

    ctx.save();

    // ── Layer 1: Abstract actor density cloud ──────────────────────────────
    // Sample abstract actors — draw a small colored dot per actor.
    // Limit to every 4th actor for performance (1000 actors → 250 dots).
    var step = actors.length > 1000 ? 4 : actors.length > 500 ? 2 : 1;
    for (var i = 0; i < actors.length; i += step) {
      var a = actors[i];
      if (!a || a.realized) continue; // realized actors drawn separately
      var c = _col(a.archetype, 0.25);
      ctx.fillStyle   = c;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(a.wx, a.wy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Layer 2: Realized actor archetype rings ────────────────────────────
    // Outer glow ring per realized walker, colored by archetype.
    if (realized && realized.size) {
      var walkers = state.projectileWalkers || [];
      realized.forEach(function (entry) {
        var w = walkers.find(function (w) { return w.id === entry.walkerId; });
        if (!w) return;
        var r  = 14;
        var a2 = _col(entry.archetype, 0.45);
        ctx.strokeStyle = a2;
        ctx.lineWidth   = 1.5;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(w.x, w.y, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    // ── Layer 3: District abstract density labels ──────────────────────────
    var DP = global.SBE && SBE.DistrictPressure;
    if (DP) {
      // Tally abstract actors per district per archetype
      var tally = {};
      actors.forEach(function (a) {
        if (!tally[a.district]) tally[a.district] = {};
        tally[a.district][a.archetype] = (tally[a.district][a.archetype] || 0) + 1;
      });

      Object.values(DP.DISTRICTS).forEach(function (d) {
        var dt = tally[d.id] || {};
        var total = Object.values(dt).reduce(function (s, n) { return s + n; }, 0);
        if (!total) return;

        // Dominant archetype
        var dominant = "wanderer";
        var maxCount = 0;
        Object.keys(dt).forEach(function (k) {
          if (dt[k] > maxCount) { maxCount = dt[k]; dominant = k; }
        });

        ctx.save();
        ctx.fillStyle    = _col(dominant, 0.85);
        ctx.font         = "13px monospace";
        ctx.textAlign    = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha  = 0.70;
        ctx.fillText(
          total + " " + dominant,
          d.x,
          d.y + d.radius * 0.6
        );
        ctx.restore();
      });
    }

    // ── Layer 4: Realization radius ring ──────────────────────────────────
    var cam    = state.camera || { x: 0, y: 0, zoom: 1 };
    var radius = actorCfg.realizationRadius || 1200;

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "rgba(200,200,255,1)";
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([12, 18]);
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // ── Layer 5: Metrics readout (world space near camera) ─────────────────
    var m = actorCfg.metrics;
    if (m) {
      var t  = now * 0.001;
      var lx = cam.x - 140;
      var ly = cam.y - (420 / (cam.zoom || 1));

      ctx.save();
      ctx.globalAlpha = 0.80;
      ctx.fillStyle   = "rgba(0,0,0,0.55)";
      ctx.fillRect(lx - 6, ly - 14, 290, 90);

      ctx.font = "13px monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      ctx.fillStyle = "rgba(200,200,255,0.90)";
      ctx.fillText("ACTORS  abs:" + m.abstractCount + "  real:" + m.realizedCount, lx, ly);
      ly += 16;

      var rows = [
        { key: "commuter",  label: "commt", count: m.commuters  },
        { key: "nightlife", label: "night", count: m.nightlife  },
        { key: "delivery",  label: "deliv", count: m.delivery   },
        { key: "wanderer",  label: "wandr", count: m.wanderers  },
        { key: "ghost",     label: "ghost", count: m.ghosts     },
      ];
      rows.forEach(function (row) {
        ctx.fillStyle = _col(row.key, 0.85);
        ctx.fillText(row.label + ":" + row.count, lx, ly);
        lx += 68;
      });
      ctx.restore();
    }

    ctx.restore();
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.ActorRenderer = {
    render: render,
  };

})(window);
