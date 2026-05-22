(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  SBE.Overlays = SBE.Overlays || {};

  // ── CinematicHazeLayer — 15Hz, screen blend ───────────────────────────────
  // Visualizes urban atmospheric softness: fog diffusion, density gradients,
  // cinematic glow shaping. Driven by: field.cinematicWeight, field.fogIsolation,
  // field.weatherExposure

  var CADENCE_MS = 67;   // ~15Hz
  var SAMPLE_STEP = 16;  // coarser — slow atmospheric features

  function CinematicHazeLayer() {
    this.id      = "cinematicHaze";
    this.enabled = true;
    this._canvas = null;
    this._ctx    = null;
    this._lastUpdate = 0;
    this._width  = 0;
    this._height = 0;
  }

  CinematicHazeLayer.prototype.resize = function (w, h) {
    this._width  = w;
    this._height = h;
    if (!this._canvas) {
      this._canvas = document.createElement("canvas");
      this._ctx    = this._canvas.getContext("2d");
    }
    this._canvas.width  = w;
    this._canvas.height = h;
  };

  CinematicHazeLayer.prototype.update = function (dt, context) {
    if (!this.enabled || !this._ctx) return;
    var now = performance.now();
    if (now - this._lastUpdate < CADENCE_MS) return;
    this._lastUpdate = now;

    var ctx = this._ctx;
    var w   = this._width;
    var h   = this._height;
    ctx.clearRect(0, 0, w, h);

    var atm = context.atmosphereSnapshot;
    var fog = atm ? (atm.fog || 0) : 0;
    var cb  = atm && atm.colorBias;

    // Sample atmosphere zones across the viewport
    for (var py = 0; py < h; py += SAMPLE_STEP) {
      for (var px = 0; px < w; px += SAMPLE_STEP) {
        var nx    = px / w;
        var ny    = py / h;
        var field = context.sampleAt(nx, ny);
        if (!field) continue;

        var cw  = field.cinematicWeight || 0;
        var fi  = field.fogIsolation    || 0;
        var we  = field.weatherExposure || 0;

        if (cw < 0.05 && fi < 0.05) continue;

        // Cinematic haze: soft warm-to-cool glow
        var radius = (40 + cw * 120) * (w / 480);
        var alpha  = (cw * 0.18 + fi * fog * 0.25) * (1 - we * 0.3);
        if (alpha < 0.01) continue;

        // Derive color from colorBias (night blue vs day warm)
        var r = cb ? Math.round(cb.midtones.r * 255) : 100;
        var g = cb ? Math.round(cb.midtones.g * 255) : 120;
        var b = cb ? Math.round(cb.midtones.b * 255) : 180;

        var grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        grad.addColorStop(0,   "rgba(" + r + "," + g + "," + b + "," + alpha + ")");
        grad.addColorStop(0.6, "rgba(" + r + "," + g + "," + b + "," + (alpha * 0.25) + ")");
        grad.addColorStop(1,   "rgba(" + r + "," + g + "," + b + ",0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Global fog veil — drawn last
    if (fog > 0.05) {
      var fogAlpha = fog * 0.20;
      var fogR = cb ? Math.round(cb.highlights.r * 200) : 200;
      var fogG = cb ? Math.round(cb.highlights.g * 210) : 210;
      var fogB = cb ? Math.round(cb.highlights.b * 230) : 230;
      ctx.fillStyle = "rgba(" + fogR + "," + fogG + "," + fogB + "," + fogAlpha + ")";
      ctx.fillRect(0, 0, w, h);
    }
  };

  CinematicHazeLayer.prototype.render = function (ctx, viewport) {
    if (!this.enabled || !this._canvas) return;
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.75;
    ctx.drawImage(this._canvas, 0, 0, viewport.width, viewport.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  CinematicHazeLayer.prototype.sample = function (x, y) { return null; };

  CinematicHazeLayer.prototype.destroy = function () {
    this._canvas = null;
    this._ctx    = null;
  };

  SBE.Overlays.CinematicHazeLayer = CinematicHazeLayer;
})(window);
