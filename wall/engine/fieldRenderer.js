// 0514_WOS_FieldVisualizationSystem_v1.0.0
// Field Renderer — pure visualization of world field data.
// NO simulation logic. Reads state.world.physics + state.world.fieldViz only.
//
// Render layer order:
//   background → [field visualization] → walkers → symbols → overlays/UI
//
// Architecture note: state.world.fieldViz.mode mirrors state.world.physics.world.fieldType
// but is an independent render switch — visualization can be on/off regardless of sim.
//
// ═══════════════════════════════════════════════════════════════════════════

(function initFieldRenderer(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Palettes ──────────────────────────────────────────────────────────────
  // Each palette: array of [alpha, r, g, b] stops at normalized positions 0..1.
  // Lower stops = low field intensity. Upper stops = high field intensity.

  var PALETTES = {
    // Deep infrared — thermal camera read, deep blue → magenta → white
    infra: [
      { t: 0.00, r: 10,  g: 12,  b: 35,  a: 0 },
      { t: 0.20, r: 30,  g: 10,  b: 90,  a: 0.18 },
      { t: 0.45, r: 120, g: 20,  b: 140, a: 0.35 },
      { t: 0.70, r: 210, g: 60,  b: 80,  a: 0.50 },
      { t: 1.00, r: 255, g: 200, b: 150, a: 0.65 },
    ],

    // Chalk on dark — soft white blooms, museum-diagram quality
    chalk: [
      { t: 0.00, r: 240, g: 240, b: 255, a: 0 },
      { t: 0.25, r: 220, g: 225, b: 240, a: 0.08 },
      { t: 0.55, r: 200, g: 210, b: 230, a: 0.20 },
      { t: 0.80, r: 185, g: 195, b: 220, a: 0.32 },
      { t: 1.00, r: 255, g: 255, b: 255, a: 0.50 },
    ],

    // Thermal — cold blue → amber → hot white
    thermal: [
      { t: 0.00, r: 5,   g: 20,  b: 60,  a: 0 },
      { t: 0.25, r: 10,  g: 80,  b: 160, a: 0.22 },
      { t: 0.50, r: 30,  g: 180, b: 120, a: 0.38 },
      { t: 0.75, r: 230, g: 160, b: 20,  a: 0.52 },
      { t: 1.00, r: 255, g: 240, b: 180, a: 0.68 },
    ],

    // Toxic — biological contamination, acid greens
    toxic: [
      { t: 0.00, r: 5,   g: 30,  b: 5,   a: 0 },
      { t: 0.20, r: 20,  g: 80,  b: 10,  a: 0.15 },
      { t: 0.50, r: 60,  g: 190, b: 30,  a: 0.35 },
      { t: 0.75, r: 150, g: 240, b: 60,  a: 0.48 },
      { t: 1.00, r: 220, g: 255, b: 120, a: 0.60 },
    ],

    // Ocean current — deep navy → teal → surf white
    ocean: [
      { t: 0.00, r: 5,   g: 15,  b: 40,  a: 0 },
      { t: 0.25, r: 10,  g: 60,  b: 120, a: 0.18 },
      { t: 0.50, r: 20,  g: 140, b: 160, a: 0.35 },
      { t: 0.75, r: 60,  g: 210, b: 200, a: 0.50 },
      { t: 1.00, r: 200, g: 245, b: 240, a: 0.60 },
    ],

    // Radar sweep — dark field, amber pulse rings
    radar: [
      { t: 0.00, r: 5,   g: 20,  b: 5,   a: 0 },
      { t: 0.30, r: 30,  g: 100, b: 20,  a: 0.12 },
      { t: 0.60, r: 120, g: 200, b: 40,  a: 0.30 },
      { t: 0.85, r: 200, g: 255, b: 80,  a: 0.45 },
      { t: 1.00, r: 255, g: 255, b: 160, a: 0.55 },
    ],
  };

  // ── Palette lookup ────────────────────────────────────────────────────────

  function _paletteColor(paletteName, t) {
    // Returns [r, g, b, a] at normalized position t (0..1)
    var stops = PALETTES[paletteName] || PALETTES.infra;
    t = Math.max(0, Math.min(1, t));
    var lo = stops[0], hi = stops[stops.length - 1];
    for (var i = 1; i < stops.length; i++) {
      if (t <= stops[i].t) {
        hi = stops[i];
        lo = stops[i - 1];
        break;
      }
    }
    var span = hi.t - lo.t;
    var f = span > 0 ? (t - lo.t) / span : 0;
    return [
      Math.round(lo.r + (hi.r - lo.r) * f),
      Math.round(lo.g + (hi.g - lo.g) * f),
      Math.round(lo.b + (hi.b - lo.b) * f),
      lo.a  + (hi.a  - lo.a)  * f,
    ];
  }

  function _rgbaStr(paletteName, t, masterOpacity) {
    var c = _paletteColor(paletteName, t);
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (c[3] * masterOpacity) + ")";
  }

  // ── Density accumulation buffer ───────────────────────────────────────────
  // A low-res off-screen canvas accumulates "field energy" over time.
  // Walker positions, emitters, and collisions deposit energy each frame.
  // Energy decays at fieldViz.decay rate. The buffer is then blurred and
  // composited into the main canvas.

  var _densityCanvas  = null;
  var _densityCtx     = null;
  var _densityW       = 0;
  var _densityH       = 0;
  var _DENSITY_SCALE  = 6; // density canvas is 1/6th of main canvas (performance)

  function _ensureDensityBuffer(w, h) {
    var dw = Math.ceil(w / _DENSITY_SCALE);
    var dh = Math.ceil(h / _DENSITY_SCALE);
    if (!_densityCanvas || _densityW !== dw || _densityH !== dh) {
      _densityCanvas = document.createElement("canvas");
      _densityCanvas.width  = dw;
      _densityCanvas.height = dh;
      _densityCtx   = _densityCanvas.getContext("2d");
      _densityW = dw;
      _densityH = dh;
    }
    return _densityCtx;
  }

  // Deposit a soft radial bloom of field energy at (x, y) in density space.
  function _depositEnergy(x, y, radius, intensity) {
    if (!_densityCtx) return;
    var dx = x / _DENSITY_SCALE;
    var dy = y / _DENSITY_SCALE;
    var dr = Math.max(2, radius / _DENSITY_SCALE);
    var grd = _densityCtx.createRadialGradient(dx, dy, 0, dx, dy, dr);
    grd.addColorStop(0,   "rgba(255,255,255," + intensity + ")");
    grd.addColorStop(0.5, "rgba(255,255,255," + (intensity * 0.4) + ")");
    grd.addColorStop(1,   "rgba(255,255,255,0)");
    _densityCtx.fillStyle = grd;
    _densityCtx.beginPath();
    _densityCtx.arc(dx, dy, dr * 1.5, 0, Math.PI * 2);
    _densityCtx.fill();
  }

  // Apply per-frame decay: multiply every pixel alpha by decay factor.
  // Using a semi-transparent dark fill is the fast Canvas2D approximation.
  function _decayDensity(decay) {
    if (!_densityCtx) return;
    _densityCtx.globalCompositeOperation = "destination-out";
    _densityCtx.fillStyle = "rgba(0,0,0," + (1 - decay) + ")";
    _densityCtx.fillRect(0, 0, _densityW, _densityH);
    _densityCtx.globalCompositeOperation = "source-over";
  }

  // ── Field type renderers ──────────────────────────────────────────────────

  // F1 — Vector field: large drifting pressure gradient (atmospheric, not engineering)
  // Style: barometric isobar pressure — soft large blobs moving in field direction.
  function _renderVector(ctx, w, h, cfg, fieldViz) {
    var palette = fieldViz.palette || "infra";
    var opacity = fieldViz.opacity || 0.35;
    var vx = (cfg.vectorX || 0);
    var vy = (cfg.vectorY || 0);
    var mag = Math.hypot(vx, vy);
    if (mag < 0.001) { vx = 0; vy = 1; mag = 1; }
    var nx = vx / mag, ny = vy / mag;
    var perpX = -ny, perpY = nx;

    var t = (Date.now() % 10000) / 10000;
    var blobR = Math.min(w, h) * 0.22;

    ctx.save();

    // 4 large drifting pressure centers, offset in time and space
    var count = 4;
    for (var i = 0; i < count; i++) {
      var phase = (t + i / count) % 1;
      var perpOffset = ((i % 2 === 0) ? 1 : -1) * w * 0.22;
      var flowPos    = (phase - 0.5) * Math.max(w, h) * 1.2;

      var bx = w / 2 + perpX * perpOffset + nx * flowPos;
      var by = h / 2 + perpY * perpOffset + ny * flowPos;

      if (bx < -blobR * 2 || bx > w + blobR * 2) continue;
      if (by < -blobR * 2 || by > h + blobR * 2) continue;

      var tVal = 0.45 + (i / count) * 0.4;
      var grd = ctx.createRadialGradient(bx, by, 0, bx, by, blobR);
      grd.addColorStop(0,    _rgbaStr(palette, tVal,         opacity * 0.65));
      grd.addColorStop(0.45, _rgbaStr(palette, tVal * 0.75,  opacity * 0.30));
      grd.addColorStop(0.8,  _rgbaStr(palette, tVal * 0.4,   opacity * 0.10));
      grd.addColorStop(1,    "rgba(0,0,0,0)");

      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(bx, by, blobR * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Directional hint: faint center arrow
    var cx = w / 2, cy = h / 2;
    var arrowLen = Math.min(w, h) * 0.07;
    var c = _paletteColor(palette, 0.8);
    ctx.strokeStyle = "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (opacity * 0.4) + ")";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - nx * arrowLen * 0.5, cy - ny * arrowLen * 0.5);
    ctx.lineTo(cx + nx * arrowLen * 0.5, cy + ny * arrowLen * 0.5);
    ctx.stroke();

    ctx.restore();
  }

  // F2 — Flow field: wide atmospheric gradient bands drifting in field direction
  // Style: ocean currents, fog movement, wind maps — soft + spatial, not line-based.
  function _renderFlow(ctx, w, h, cfg, fieldViz) {
    var palette = fieldViz.palette || "ocean";
    var opacity = fieldViz.opacity || 0.35;
    var vx = cfg.vectorX || 0;
    var vy = cfg.vectorY || 1;
    var mag = Math.hypot(vx, vy);
    if (mag < 0.001) { vx = 0; vy = 1; mag = 1; }
    var nx = vx / mag, ny = vy / mag;
    var perpX = -ny, perpY = nx;

    var t  = (Date.now() % 14000) / 14000;
    var blobs = 6;
    var blobR = Math.min(w, h) * 0.28;

    ctx.save();

    for (var i = 0; i < blobs; i++) {
      var phase = (t + i / blobs) % 1;
      // Each blob travels across the canvas along the flow direction
      // Spread perpendicular to flow
      var perpOffset = ((i / blobs) - 0.5) * w * 0.9;
      // Position along flow: full canvas length, animated
      var flowOffset = (phase - 0.5) * Math.max(w, h) * 1.4;

      var bx = w / 2 + perpX * perpOffset + nx * flowOffset;
      var by = h / 2 + perpY * perpOffset + ny * flowOffset;

      // Only draw if within extended canvas bounds
      if (bx < -blobR * 1.5 || bx > w + blobR * 1.5) continue;
      if (by < -blobR * 1.5 || by > h + blobR * 1.5) continue;

      var intensityT = 0.35 + (i / blobs) * 0.55;
      // Elongate gradient along flow direction
      var gx0 = bx - nx * blobR * 0.6;
      var gy0 = by - ny * blobR * 0.6;
      var gx1 = bx + nx * blobR * 0.6;
      var gy1 = by + ny * blobR * 0.6;

      // Radial gradient for blob body
      var grd = ctx.createRadialGradient(bx, by, 0, bx, by, blobR);
      grd.addColorStop(0,    _rgbaStr(palette, intensityT,       opacity * 0.55));
      grd.addColorStop(0.4,  _rgbaStr(palette, intensityT * 0.8, opacity * 0.30));
      grd.addColorStop(0.75, _rgbaStr(palette, intensityT * 0.5, opacity * 0.12));
      grd.addColorStop(1,    "rgba(0,0,0,0)");

      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(bx, by, blobR * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // F3 — Orbital field: concentric rings + halos (solar-system topology)
  function _renderOrbital(ctx, w, h, cfg, fieldViz) {
    var palette = fieldViz.palette || "radar";
    var opacity = fieldViz.opacity || 0.35;
    var cx = w / 2, cy = h / 2;
    var maxR  = Math.min(w, h) * 0.46;
    var rings = 6;
    var t     = Date.now() * 0.0003; // very slow rotation

    ctx.save();

    // Background halo — large soft gradient at center
    var haloGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    haloGrd.addColorStop(0,   _rgbaStr(palette, 0.85, opacity * 0.5));
    haloGrd.addColorStop(0.35,_rgbaStr(palette, 0.55, opacity * 0.25));
    haloGrd.addColorStop(0.7, _rgbaStr(palette, 0.25, opacity * 0.10));
    haloGrd.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = haloGrd;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();

    // Concentric orbit rings — each with slight opacity pulsing
    for (var i = 1; i <= rings; i++) {
      var frac  = i / rings;
      var r     = maxR * frac;
      var pulse = 0.5 + 0.5 * Math.sin(t * (0.8 + i * 0.3) + i * Math.PI * 0.4);
      var ringOpacity = opacity * (0.15 + 0.25 * (1 - frac)) * (0.6 + 0.4 * pulse);
      var lw = Math.max(0.5, (1.8 - frac * 1.2) * (w / 600));

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = _rgbaStr(palette, 1 - frac * 0.6, ringOpacity);
      ctx.lineWidth   = lw;
      ctx.stroke();

      // Tick marks at cardinal + diagonal points on each ring
      var ticks = i < 3 ? 8 : 4;
      for (var tk = 0; tk < ticks; tk++) {
        var tAngle = (tk / ticks) * Math.PI * 2 + t * (i % 2 === 0 ? 0.4 : -0.3);
        var txo = cx + Math.cos(tAngle) * r;
        var tyo = cy + Math.sin(tAngle) * r;
        var tickLen = lw * 3;
        ctx.beginPath();
        ctx.arc(txo, tyo, tickLen, 0, Math.PI * 2);
        ctx.fillStyle = _rgbaStr(palette, 0.9, ringOpacity * 1.5);
        ctx.fill();
      }
    }

    // Central influence node
    var nodeR = maxR * 0.04;
    var nodeGrd = ctx.createRadialGradient(cx, cy, 0, cx, cy, nodeR * 3);
    nodeGrd.addColorStop(0,   _rgbaStr(palette, 1.0, opacity * 0.9));
    nodeGrd.addColorStop(0.5, _rgbaStr(palette, 0.7, opacity * 0.4));
    nodeGrd.addColorStop(1,   "rgba(0,0,0,0)");
    ctx.fillStyle = nodeGrd;
    ctx.beginPath();
    ctx.arc(cx, cy, nodeR * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // F4 — Density field: render the accumulated energy buffer
  function _renderDensity(ctx, w, h, state, fieldViz) {
    var palette = fieldViz.palette || "infra";
    var opacity = fieldViz.opacity || 0.35;
    if (!_densityCanvas) return;

    // Colorize the density buffer using palette
    // We draw the density buffer into an offscreen canvas with palette tinting
    var dw = _densityCanvas.width;
    var dh = _densityCanvas.height;

    ctx.save();
    ctx.filter = "blur(" + Math.round(fieldViz.blur || 24) + "px)";
    ctx.globalAlpha = opacity;
    ctx.globalCompositeOperation = "lighter";

    // Tint using palette mid-color as a multiply overlay
    var midC = _paletteColor(palette, 0.65);
    var tintCanvas = document.createElement("canvas");
    tintCanvas.width  = dw;
    tintCanvas.height = dh;
    var tCtx = tintCanvas.getContext("2d");

    // Draw density
    tCtx.drawImage(_densityCanvas, 0, 0);
    // Tint with palette color
    tCtx.globalCompositeOperation = "multiply";
    tCtx.fillStyle = "rgb(" + midC[0] + "," + midC[1] + "," + midC[2] + ")";
    tCtx.fillRect(0, 0, dw, dh);

    ctx.drawImage(tintCanvas, 0, 0, w, h);

    ctx.filter     = "none";
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  // F5 — Territory / influence map: soft organic zones around active objects
  function _renderTerritory(ctx, w, h, state, fieldViz) {
    var palette = fieldViz.palette || "toxic";
    var opacity = fieldViz.opacity || 0.35;

    // Collect anchor points from walkers + text objects + shapes
    var anchors = [];

    if (state.walkers && state.walkers.length) {
      state.walkers.forEach(function (wk) {
        anchors.push({ x: wk.x, y: wk.y, r: w * 0.12, t: 0.7, color: wk.color });
      });
    }

    if (state.textObjects && state.textObjects.length) {
      state.textObjects.forEach(function (to) {
        anchors.push({ x: to.x, y: to.y, r: w * 0.09, t: 0.5, color: null });
      });
    }

    if (state.shapes && state.shapes.length) {
      state.shapes.slice(0, 6).forEach(function (sh) {
        var cx = (sh.x || 0) + (sh.width || 0) * 0.5;
        var cy = (sh.y || 0) + (sh.height || 0) * 0.5;
        anchors.push({ x: cx, y: cy, r: w * 0.10, t: 0.6, color: sh.fill || null });
      });
    }

    if (!anchors.length) return;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    anchors.forEach(function (a) {
      var grd = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, a.r);
      var c = _paletteColor(palette, a.t);

      // Use object's own color as a tint hint if available
      var r = c[0], g = c[1], b = c[2];
      if (a.color) {
        try {
          var m = a.color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
          if (m) {
            r = Math.round((r + parseInt(m[1], 16)) / 2);
            g = Math.round((g + parseInt(m[2], 16)) / 2);
            b = Math.round((b + parseInt(m[3], 16)) / 2);
          }
        } catch (e) { /* ignore bad color */ }
      }

      grd.addColorStop(0,    "rgba(" + r + "," + g + "," + b + "," + (opacity * 0.55) + ")");
      grd.addColorStop(0.35, "rgba(" + r + "," + g + "," + b + "," + (opacity * 0.25) + ")");
      grd.addColorStop(0.7,  "rgba(" + r + "," + g + "," + b + "," + (opacity * 0.08) + ")");
      grd.addColorStop(1,    "rgba(0,0,0,0)");

      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  // ── Density accumulation (called each frame by main loop) ─────────────────

  function depositWalkers(state) {
    if (!_densityCtx) return;
    var cfg = state.world && state.world.fieldViz;
    if (!cfg || !cfg.enabled) return;
    var accum = cfg.accumulation != null ? cfg.accumulation : 0.04;
    if (state.walkers) {
      state.walkers.forEach(function (wk) {
        _depositEnergy(
          wk.x / _DENSITY_SCALE * _DENSITY_SCALE,
          wk.y / _DENSITY_SCALE * _DENSITY_SCALE,
          30, accum * 0.15
        );
      });
    }
    // Decay old energy
    var decay = cfg.decay != null ? cfg.decay : 0.985;
    _decayDensity(decay);
  }

  // ── Main render entry ─────────────────────────────────────────────────────

  function render(ctx, state) {
    var cfg = state && state.world && state.world.fieldViz;
    if (!cfg || !cfg.enabled) return;

    var w = state.canvas ? state.canvas.width  : ctx.canvas.width;
    var h = state.canvas ? state.canvas.height : ctx.canvas.height;

    // Ensure density buffer exists
    _ensureDensityBuffer(w, h);

    // Deposit walker energy into density buffer every frame
    depositWalkers(state);

    var mode    = cfg.mode    || "density";
    var physics = state.world && state.world.physics ? state.world.physics.world : null;
    var fieldCfg = physics || { vectorX: 0, vectorY: 1, fieldType: "vector", strength: 1 };

    ctx.save();

    // The field renderer is called inside the camera transform.
    // Camera maps world (0,0) → screen center. All field renderers use
    // the coordinate space (0..w, 0..h), so offset by (-w/2, -h/2) to
    // align world-space origin with the top-left of that space.
    ctx.translate(-w / 2, -h / 2);

    // Apply blur at the draw call level for non-density modes
    var blurPx = cfg.blur != null ? cfg.blur : 24;
    if (mode !== "density" && mode !== "heatmap" && blurPx > 0) {
      ctx.filter = "blur(" + blurPx + "px)";
    }

    switch (mode) {
      case "vector":
        _renderVector(ctx, w, h, fieldCfg, cfg);
        break;
      case "flow":
        _renderFlow(ctx, w, h, fieldCfg, cfg);
        break;
      case "orbital":
        _renderOrbital(ctx, w, h, fieldCfg, cfg);
        break;
      case "heatmap":  // canonical name
      case "density":  // backward compat
        ctx.filter = "none"; // density manages its own blur
        _renderDensity(ctx, w, h, state, cfg);
        break;
      case "territory":
        _renderTerritory(ctx, w, h, state, cfg);
        break;
      default:
        break;
    }

    ctx.filter = "none";
    ctx.restore();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  SBE.FieldRenderer = {
    render:          render,
    depositWalkers:  depositWalkers,
    getPalettes:     function () { return Object.keys(PALETTES); },
    clearDensity:    function () {
      if (_densityCtx) _densityCtx.clearRect(0, 0, _densityW, _densityH);
    },
  };

  console.log("[WOS FieldRenderer] Loaded v1.0.0 — 5 field types, 6 palettes");

})(window);
