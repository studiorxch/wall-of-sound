/**
 * 0514_WOS_FieldVisualizer_v1.0.0
 * Debug/atmospheric field visualization renderer.
 * 5 modes: vectors / drift-vectors / flow-particles / trails / heatmap
 * Depends on: SBE.FieldRenderer being loaded (shares palette data)
 */
(function initFieldVisualizer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Palette table (mirrors FieldRenderer for consistency) ─────────────────
  var PALETTES = {
    infra:   ["#0a0a1a", "#1a0a3a", "#3d00c8", "#c800a0", "#ff6600", "#ffff00"],
    chalk:   ["rgba(255,255,255,0)", "rgba(255,255,255,0.08)", "rgba(255,255,255,0.22)", "rgba(255,255,255,0.55)", "rgba(255,255,255,0.82)", "#ffffff"],
    thermal: ["#000033", "#003366", "#0066cc", "#00cc66", "#cccc00", "#ff3300"],
    toxic:   ["#000a00", "#003300", "#006600", "#33cc00", "#99ff00", "#ccff66"],
    ocean:   ["#000814", "#001428", "#002856", "#005096", "#0090c8", "#00c8f0"],
    radar:   ["#000000", "#003300", "#006600", "#00cc00", "#66ff00", "#ffffff"],
  };

  function getPalette(name) {
    return PALETTES[name] || PALETTES.infra;
  }

  // ── sampleFieldVector ─────────────────────────────────────────────────────
  // Returns { x, y } normalized field vector at world position (wx, wy).
  // Position-dependent for orbital (tangential to radius).
  // Used by fieldVisualizer AND _applyFlowDrift in main.js.

  function sampleFieldVector(wx, wy, physics) {
    if (!physics) return { x: 0, y: 0 };
    var wf = physics.world;
    if (!wf || wf.fieldType === "none" || !wf.strength) return { x: 0, y: 0 };

    var ft = wf.fieldType;

    if (ft === "orbital") {
      // Tangential: perpendicular to radius from world origin (0,0)
      var dist = Math.hypot(wx, wy);
      if (dist < 1) return { x: 1, y: 0 };
      var orbitalMode = (physics.flow && physics.flow.orbitalMode) || "tangential";
      if (orbitalMode === "radial") {
        return { x: wx / dist, y: wy / dist };
      } else if (orbitalMode === "spiral" || orbitalMode === "hybrid") {
        // Spiral: equal blend of tangential and radial ("hybrid" kept for compat)
        var tx = -wy / dist, ty = wx / dist;
        var rx = wx / dist,  ry = wy / dist;
        var hx = tx * 0.5 + rx * 0.5, hy = ty * 0.5 + ry * 0.5;
        var hm = Math.hypot(hx, hy) || 1;
        return { x: hx / hm, y: hy / hm };
      } else {
        // "tangential" (default) — CCW rotation
        return { x: -wy / dist, y: wx / dist };
      }
    }

    // Vector / Flow / any other uniform field
    var vx = wf.vectorX || 0;
    var vy = wf.vectorY || 0;
    var mag = Math.hypot(vx, vy);
    if (mag < 0.0001) return { x: 0, y: 0 };
    return { x: vx / mag, y: vy / mag };
  }

  // ── Flow particle pool ────────────────────────────────────────────────────
  // Used by modes: "particles" and "trails"
  var POOL_SIZE = 180;
  var _pool = [];        // { x, y, life, maxLife, alpha, trailX[], trailY[] }
  var _trailCtx = null;  // offscreen canvas for trail accumulation (mode: trails)
  var _trailCanvas = null;
  var _trailW = 0, _trailH = 0;

  function _ensurePool(w, h) {
    while (_pool.length < POOL_SIZE) {
      _pool.push(_makeFlowParticle(w, h));
    }
  }

  function _makeFlowParticle(w, h) {
    return {
      x: Math.random() * w - w / 2,
      y: Math.random() * h - h / 2,
      life: Math.random(),
      maxLife: 2.5 + Math.random() * 2,
      trail: [],
    };
  }

  function _ensureTrailCanvas(w, h) {
    if (_trailCanvas && _trailW === w && _trailH === h) return;
    _trailCanvas = document.createElement("canvas");
    _trailCanvas.width = w;
    _trailCanvas.height = h;
    _trailCtx = _trailCanvas.getContext("2d");
    _trailW = w; _trailH = h;
  }

  function _updatePool(dt, physics, w, h) {
    var spd = 60; // base px/s for flow particles
    var str = (physics && physics.world && physics.world.strength) || 1;
    spd *= Math.max(0.3, Math.min(3, str));

    for (var i = 0; i < _pool.length; i++) {
      var p = _pool[i];
      var v = sampleFieldVector(p.x, p.y, physics);
      p.x += v.x * spd * dt;
      p.y += v.y * spd * dt;
      p.life -= dt;

      // Wrap at canvas edges (world-space coords)
      var hw = w / 2, hh = h / 2;
      if (p.x > hw)  p.x -= w;
      if (p.x < -hw) p.x += w;
      if (p.y > hh)  p.y -= h;
      if (p.y < -hh) p.y += h;

      if (p.life <= 0) {
        _pool[i] = _makeFlowParticle(w, h);
        continue;
      }

      // Store trail (max 12 points)
      if (p.trail.length > 12) p.trail.shift();
      p.trail.push({ x: p.x, y: p.y });
    }
  }

  // ── Mode renderers ────────────────────────────────────────────────────────

  // Mode 1 — Vector grid: arrow strokes sampling field at grid intersections
  function _renderVectors(ctx, w, h, physics, cfg) {
    var step = cfg.gridStep || 48;
    var len  = cfg.arrowLen || 16;
    var pal  = getPalette(cfg.palette);
    var col  = pal[3] || "#ffffff";
    var cols = Math.ceil(w / step) + 1;
    var rows = Math.ceil(h / step) + 1;
    var ox   = (-w / 2) - (w / 2) % step;
    var oy   = (-h / 2) - (h / 2) % step;

    ctx.save();
    ctx.globalAlpha = cfg.opacity || 0.55;
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1;
    ctx.lineCap     = "round";

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var wx = ox + c * step;
        var wy = oy + r * step;
        var v  = sampleFieldVector(wx, wy, physics);
        if (v.x === 0 && v.y === 0) continue;

        var ex = wx + v.x * len;
        var ey = wy + v.y * len;

        ctx.beginPath();
        ctx.moveTo(wx - v.x * len * 0.3, wy - v.y * len * 0.3);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrow head
        var hx = -v.y * 3, hy = v.x * 3;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - v.x * 5 + hx, ey - v.y * 5 + hy);
        ctx.lineTo(ex - v.x * 5 - hx, ey - v.y * 5 - hy);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.globalAlpha = (cfg.opacity || 0.55) * 0.7;
        ctx.fill();
        ctx.globalAlpha = cfg.opacity || 0.55;
      }
    }
    ctx.restore();
  }

  // Mode 2 — Drift vectors: tail lines from each walker's accumulated drift
  function _renderDriftVectors(ctx, walkers, physics, cfg) {
    if (!walkers || !walkers.length) return;
    var pal = getPalette(cfg.palette);
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5;

    for (var i = 0; i < walkers.length; i++) {
      var w = walkers[i];
      if (!w || w._dead) continue;
      var dvx = w._driftVx || 0;
      var dvy = w._driftVy || 0;
      var mag = Math.hypot(dvx, dvy);
      if (mag < 0.05) continue;

      // Scale visual tail: 1px drift → 20px tail
      var scale = 20;
      var ex = w.x + dvx * scale;
      var ey = w.y + dvy * scale;

      // Color by magnitude: low → pal[2], high → pal[4]
      var t = Math.min(1, mag / 3);
      ctx.globalAlpha = (cfg.opacity || 0.7) * (0.4 + t * 0.6);
      ctx.strokeStyle = t > 0.5 ? (pal[4] || "#ff6600") : (pal[2] || "#3d00c8");

      ctx.beginPath();
      ctx.moveTo(w.x, w.y);
      ctx.lineTo(ex, ey);
      ctx.stroke();

      // Dot at walker
      ctx.beginPath();
      ctx.arc(w.x, w.y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = pal[3] || "#c800a0";
      ctx.globalAlpha = cfg.opacity || 0.7;
      ctx.fill();
    }
    ctx.restore();
  }

  // Mode 3 — Flow particles: dots drifting with field, wrapping, fading
  function _renderFlowParticles(ctx, dt, physics, w, h, cfg) {
    _ensurePool(w, h);
    _updatePool(dt, physics, w, h);

    var pal = getPalette(cfg.palette);
    ctx.save();

    for (var i = 0; i < _pool.length; i++) {
      var p = _pool[i];
      var lifeRatio = Math.max(0, p.life / p.maxLife);
      // Fade in/out: peak at mid-life
      var fade = lifeRatio < 0.2 ? lifeRatio / 0.2 : (lifeRatio > 0.8 ? (1 - lifeRatio) / 0.2 : 1);
      var a = (cfg.opacity || 0.5) * fade;

      // Color along palette by life ratio
      var ci = Math.floor(lifeRatio * (pal.length - 1));
      ctx.globalAlpha = a;
      ctx.fillStyle = pal[ci] || pal[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Mode 4 — Trails: particles + persistent offscreen streamlines
  function _renderTrails(ctx, dt, physics, w, h, cfg) {
    _ensurePool(w, h);
    _ensureTrailCanvas(w, h);
    _updatePool(dt, physics, w, h);

    var pal = getPalette(cfg.palette);
    var tc  = _trailCtx;

    // Decay trail canvas each frame
    var decay = cfg.trailDecay != null ? cfg.trailDecay : 0.97;
    tc.globalCompositeOperation = "source-over";
    tc.globalAlpha = 1 - decay;
    tc.fillStyle = "#000000";
    tc.fillRect(0, 0, w, h);
    tc.globalAlpha = 1;
    tc.globalCompositeOperation = "source-over";

    // Draw each particle's latest segment onto trail canvas
    // Trail canvas is in pixel space (0..w, 0..h); pool coords are world-space (-w/2..w/2)
    var hw = w / 2, hh = h / 2;
    for (var i = 0; i < _pool.length; i++) {
      var p = _pool[i];
      var t = p.trail;
      if (t.length < 2) continue;
      var lifeRatio = Math.max(0, p.life / p.maxLife);
      var ci = Math.floor(lifeRatio * (pal.length - 1));
      tc.strokeStyle = pal[ci] || pal[0];
      tc.lineWidth   = 1.2;
      tc.globalAlpha = (cfg.opacity || 0.5) * lifeRatio;
      tc.beginPath();
      var last = t[t.length - 1];
      var prev = t[t.length - 2];
      tc.moveTo(prev.x + hw, prev.y + hh);
      tc.lineTo(last.x + hw, last.y + hh);
      tc.stroke();
    }

    // Blit trail canvas onto main context (world-space aligned via -w/2,-h/2 offset)
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(_trailCanvas, -hw, -hh, w, h);
    ctx.restore();
  }

  // Mode 5 — Heatmap: magnitude → color per grid cell (offscreen low-res)
  var _heatCanvas = null, _heatCtx = null;
  var _heatW = 0, _heatH = 0;

  function _ensureHeatCanvas(w, h) {
    var res = 6; // cell size in pixels
    var cw = Math.ceil(w / res);
    var ch = Math.ceil(h / res);
    if (_heatCanvas && _heatW === cw && _heatH === ch) return { canvas: _heatCanvas, ctx: _heatCtx, res: res };
    _heatCanvas = document.createElement("canvas");
    _heatCanvas.width = cw;
    _heatCanvas.height = ch;
    _heatCtx = _heatCanvas.getContext("2d");
    _heatW = cw; _heatH = ch;
    return { canvas: _heatCanvas, ctx: _heatCtx, res: res };
  }

  // Parse hex/rgba → [r,g,b]
  var _colorCache = {};
  function _hexToRgb(col) {
    if (_colorCache[col]) return _colorCache[col];
    var r = 0, g = 0, b = 0;
    if (col.startsWith("#")) {
      var h = col.slice(1);
      if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      r = parseInt(h.slice(0,2),16);
      g = parseInt(h.slice(2,4),16);
      b = parseInt(h.slice(4,6),16);
    }
    _colorCache[col] = [r, g, b];
    return [r, g, b];
  }

  function _lerpColor(pal, t) {
    t = Math.max(0, Math.min(1, t));
    var idx = t * (pal.length - 1);
    var lo  = Math.floor(idx);
    var hi  = Math.min(lo + 1, pal.length - 1);
    var f   = idx - lo;
    var a   = _hexToRgb(pal[lo]);
    var bv  = _hexToRgb(pal[hi]);
    if (!a || !bv) return "rgba(0,0,0,0)";
    return "rgb(" +
      Math.round(a[0] + (bv[0]-a[0])*f) + "," +
      Math.round(a[1] + (bv[1]-a[1])*f) + "," +
      Math.round(a[2] + (bv[2]-a[2])*f) + ")";
  }

  function _renderHeatmap(ctx, w, h, physics, cfg) {
    var o = _ensureHeatCanvas(w, h);
    var tc   = o.ctx;
    var res  = o.res;
    var cw   = o.canvas.width;
    var ch   = o.canvas.height;
    var pal  = getPalette(cfg.palette);
    var hw   = w / 2, hh = h / 2;

    for (var r = 0; r < ch; r++) {
      for (var c = 0; c < cw; c++) {
        var wx = c * res - hw;
        var wy = r * res - hh;
        var v  = sampleFieldVector(wx, wy, physics);
        var mag = Math.hypot(v.x, v.y); // already 0..1 for uniform fields
        // For orbital, mag is always 1 at non-origin — show distance modulation
        if (physics && physics.world && physics.world.fieldType === "orbital") {
          var dist = Math.hypot(wx, wy);
          var maxDist = Math.hypot(hw, hh);
          mag = 1 - Math.min(1, dist / maxDist);
        }
        tc.fillStyle = _lerpColor(pal, mag);
        tc.fillRect(c, r, 1, 1);
      }
    }

    ctx.save();
    ctx.globalAlpha = cfg.opacity || 0.4;
    // Draw scaled back to full canvas size, world-space aligned
    ctx.drawImage(o.canvas, -hw, -hh, w, h);
    ctx.restore();
  }

  // ── Main render ───────────────────────────────────────────────────────────

  var _lastDt = 1 / 60;

  SBE.FieldVisualizer = {

    // Exported helper for use by main.js _applyFlowDrift
    sampleFieldVector: sampleFieldVector,

    // Clear particle pool + trail canvas (call on field type change)
    clear: function () {
      _pool.length = 0;
      if (_trailCtx) _trailCtx.clearRect(0, 0, _trailW, _trailH);
    },

    render: function (ctx, state, dt) {
      var fv = state && state.fieldVisualizer;
      if (!fv || !fv.enabled) return;

      var physics = state.world && state.world.physics;
      if (!physics) return;

      var wf = physics.world;
      if (!wf || (wf.fieldType === "none" && fv.mode !== "drift" && fv.mode !== "flow-lines")) return;

      var canvas = ctx.canvas;
      var w = canvas.width;
      var h = canvas.height;

      _lastDt = dt || (1 / 60);

      var cfg = {
        palette:    fv.palette    || "infra",
        opacity:    fv.opacity    != null ? fv.opacity    : 0.5,
        gridStep:   fv.gridStep   || 48,
        arrowLen:   fv.arrowLen   || 16,
        trailDecay: fv.trailDecay != null ? fv.trailDecay : 0.97,
      };

      // All rendering is already inside the camera transform (world-space).
      // The field renderer adds ctx.translate(-w/2, -h/2) at start of its render —
      // we DON'T do that; instead we draw directly in world-space coordinates
      // since sampleFieldVector and walker positions are already world-space.

      switch (fv.mode) {
        case "vectors":
          _renderVectors(ctx, w, h, physics, cfg);
          break;

        case "flow-lines": // canonical name
        case "drift":      // backward compat
          var walkers = state.walkers || [];
          _renderDriftVectors(ctx, walkers, physics, cfg);
          break;

        case "particles":
          _renderFlowParticles(ctx, _lastDt, physics, w, h, cfg);
          break;

        case "trails":
          _renderTrails(ctx, _lastDt, physics, w, h, cfg);
          break;

        case "heatmap":
          _renderHeatmap(ctx, w, h, physics, cfg);
          break;

        case "territory":
          // Territory debug: no-op (fieldRenderer handles territory visualization)
          break;

        default:
          _renderVectors(ctx, w, h, physics, cfg);
          break;
      }
    },
  };

})(window);
