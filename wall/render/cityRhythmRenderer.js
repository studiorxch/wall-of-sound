(function initCityRhythmRenderer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── City Rhythm Renderer (CityRhythm v1.0.0) ──────────────────────────────
  //
  // DEBUG VISUALIZATION ONLY — gated on state.world.rhythm.debugDraw.
  //
  // Renders in WORLD SPACE (ctx pre-transformed by caller):
  //   • Global city energy ring — large pulse around world origin
  //   • District phase pulses   — per-district glow scaled to current mood
  //   • Phase timeline strip    — positioned near camera, shows current phase

  // Phase color palette
  var _PHASE_COLORS = {
    dawn:      { r: 255, g: 180, b: 90  },   // warm amber
    day:       { r: 180, g: 220, b: 255 },   // cool blue-white
    dusk:      { r: 255, g: 120, b: 80  },   // deep orange
    night:     { r: 140, g: 80,  b: 220 },   // rich violet
    lateNight: { r: 60,  g: 100, b: 180 },   // dim indigo
  };

  function _rgb(c, a) {
    return "rgba(" + c.r + "," + c.g + "," + c.b + "," + a + ")";
  }

  // ── Main entry ─────────────────────────────────────────────────────────────
  // ctx   — world-space 2D context (camera transform applied by caller)
  // state — full WOS state
  // now   — performance.now()
  function render(ctx, state, now) {
    var r = state.world && state.world.rhythm;
    if (!r || !r.debugDraw) return;

    var eco = state.world && state.world.ecology;
    if (!eco || !eco.enabled) return;

    var t     = now * 0.001;
    var phase = r.phase || "day";
    var color = _PHASE_COLORS[phase] || _PHASE_COLORS.day;
    var en    = (r.metrics && r.metrics.cityEnergy) || 0;

    ctx.save();

    // ── 1. Global city energy ring ─────────────────────────────────────────
    // Centered at world origin (0,0). Radius scales with energy + pulse.
    var pulse    = 0.5 + 0.5 * Math.sin(t * 0.4 + en * Math.PI);
    var ringR    = 3200 + en * 800 + pulse * 200;
    var ringAlpha = 0.03 + en * 0.05 + pulse * 0.02;

    var energyGrad = ctx.createRadialGradient(0, 0, ringR * 0.8, 0, 0, ringR);
    energyGrad.addColorStop(0, _rgb(color, 0));
    energyGrad.addColorStop(0.7, _rgb(color, ringAlpha));
    energyGrad.addColorStop(1, _rgb(color, 0));
    ctx.fillStyle   = energyGrad;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.fill();

    // Dashed ring outline
    ctx.strokeStyle = _rgb(color, 0.08 + en * 0.06);
    ctx.lineWidth   = 3;
    ctx.setLineDash([40, 60]);
    ctx.beginPath();
    ctx.arc(0, 0, ringR * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── 2. District phase pulses ───────────────────────────────────────────
    var DP       = global.SBE && SBE.DistrictPressure;
    var pressure = eco.pressure && eco.pressure.districts;
    if (DP && pressure) {
      Object.values(DP.DISTRICTS).forEach(function (d) {
        var dp      = pressure[d.id];
        if (!dp) return;

        var profile = SBE.CityRhythm && SBE.CityRhythm.DISTRICT_PROFILES[d.id];
        var nlW     = profile ? profile.nightlifeWeight : 1.0;
        var trW     = profile ? profile.commuterWeight  : 1.0;

        // District brightness: combination of energy + phase-specific weight
        var distEnergy = dp.energy || 0;
        var phaseBias  = (phase === "night" || phase === "lateNight")
          ? nlW * 0.7 : trW * 0.5;
        var intensity = _clamp(distEnergy * 0.6 + phaseBias * 0.4);

        // Pulsing rate: faster when district is more active
        var pulseSub = 0.5 + 0.5 * Math.sin(t * (0.6 + intensity * 0.8) + d.x * 0.0003);
        var alpha     = intensity * (0.10 + pulseSub * 0.08);
        var r2        = d.radius * (0.9 + intensity * 0.35 + pulseSub * 0.15);

        var dGrad = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, r2);
        dGrad.addColorStop(0,   _rgb(color, alpha * 1.4));
        dGrad.addColorStop(0.5, _rgb(color, alpha));
        dGrad.addColorStop(1,   _rgb(color, 0));

        ctx.fillStyle   = dGrad;
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(d.x, d.y, r2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // ── 3. Phase timeline strip ────────────────────────────────────────────
    // Drawn in world space near camera position (zoom-compensated).
    var cam    = state.camera || { x: 0, y: 0, zoom: 1 };
    var zoom   = cam.zoom || 1;
    var stripW = 420 / zoom;
    var stripH = 28  / zoom;
    var stripX = cam.x - stripW / 2;
    var stripY = cam.y + (380 / zoom); // below camera center

    // Background
    ctx.fillStyle   = "rgba(0,0,0,0.50)";
    ctx.globalAlpha = 1;
    ctx.fillRect(stripX, stripY, stripW, stripH);

    // Phase segments
    var phases = [
      { id: "lateNight", start: 2,  end: 5  },
      { id: "dawn",      start: 5,  end: 8  },
      { id: "day",       start: 8,  end: 17 },
      { id: "dusk",      start: 17, end: 20 },
      { id: "night",     start: 20, end: 26 },  // 20–24 + 0–2 wrapped
    ];

    var totalH = 24;
    phases.forEach(function (p) {
      var c      = _PHASE_COLORS[p.id] || _PHASE_COLORS.day;
      var xFrac  = (p.start % 24) / totalH;
      var wFrac  = (p.end - p.start) / totalH;
      var active = phase === p.id;
      var a      = active ? 0.50 : 0.18;
      ctx.fillStyle   = _rgb(c, a);
      ctx.globalAlpha = 1;
      ctx.fillRect(stripX + xFrac * stripW, stripY, wFrac * stripW, stripH);
    });

    // Playhead
    var h       = r.currentTime;
    var headX   = stripX + (h / 24) * stripW;
    var headH   = stripH + 5 / zoom;
    ctx.fillStyle   = "rgba(255,255,255,0.90)";
    ctx.fillRect(headX - 1.5 / zoom, stripY - 2 / zoom, 3 / zoom, headH);

    // Phase label
    ctx.save();
    ctx.fillStyle    = _rgb(color, 0.95);
    ctx.font         = (12 / zoom) + "px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha  = 1;
    var labelStr = SBE.CityRhythm ? SBE.CityRhythm.getPhaseLabel(state) : (phase.toUpperCase());
    ctx.fillText(labelStr, cam.x, stripY + stripH / 2);
    ctx.restore();

    ctx.restore();
  }

  // ── Helper ─────────────────────────────────────────────────────────────────
  function _clamp(v) { return Math.max(0, Math.min(1, v)); }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.CityRhythmRenderer = {
    render: render,
  };

})(window);
