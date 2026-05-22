(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  SBE.Overlays = SBE.Overlays || {};

  // ── TransitPulseLayer — 30Hz, additive blend ──────────────────────────────
  // Visualizes city circulation pressure as pulsing resonance fields
  // centered on high-transit-pressure grid zones.
  // Driven by: field.transitPressure

  var CADENCE_MS = 33;   // ~30Hz
  var SAMPLE_STEP = 8;   // sample every Nth overlay pixel

  function TransitPulseLayer() {
    this.id      = "transitPulse";
    this.enabled = true;
    this._canvas = null;
    this._ctx    = null;
    this._lastUpdate = 0;
    this._phase  = 0;   // animation phase for pulse
    this._width  = 0;
    this._height = 0;
  }

  TransitPulseLayer.prototype.resize = function (w, h) {
    this._width  = w;
    this._height = h;
    if (!this._canvas) {
      this._canvas = document.createElement("canvas");
      this._ctx    = this._canvas.getContext("2d");
    }
    this._canvas.width  = w;
    this._canvas.height = h;
  };

  TransitPulseLayer.prototype.update = function (dt, context) {
    if (!this.enabled || !this._ctx) return;
    var now = performance.now();
    if (now - this._lastUpdate < CADENCE_MS) return;
    this._lastUpdate = now;

    this._phase += dt * 1.2;   // pulse frequency

    var ctx = this._ctx;
    var w   = this._width;
    var h   = this._height;
    ctx.clearRect(0, 0, w, h);

    // Collect high-pressure sample points
    var hotspots = [];
    for (var py = 0; py < h; py += SAMPLE_STEP) {
      for (var px = 0; px < w; px += SAMPLE_STEP) {
        var nx = px / w;
        var ny = py / h;
        var field = context.sampleAt(nx, ny);
        if (!field) continue;
        var tp = field.transitPressure || 0;
        if (tp > 0.03) {
          hotspots.push({ x: px, y: py, pressure: tp });
        }
      }
    }

    // Draw radial pulse at each hotspot
    for (var i = 0; i < hotspots.length; i++) {
      var hs     = hotspots[i];
      var pulse  = 0.5 + 0.5 * Math.sin(this._phase + i * 0.7);
      var radius = (30 + hs.pressure * 80) * (0.7 + 0.3 * pulse) * (w / 480);
      var alpha  = hs.pressure * 0.35 * pulse;

      var grad = ctx.createRadialGradient(hs.x, hs.y, 0, hs.x, hs.y, radius);
      grad.addColorStop(0, "rgba(120, 200, 255, " + alpha + ")");
      grad.addColorStop(0.5, "rgba(80, 140, 220, " + (alpha * 0.4) + ")");
      grad.addColorStop(1, "rgba(60, 100, 180, 0)");

      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hs.x, hs.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  TransitPulseLayer.prototype.render = function (ctx, viewport) {
    if (!this.enabled || !this._canvas) return;
    ctx.globalCompositeOperation = "lighter";   // additive blend
    ctx.globalAlpha = 0.6;
    ctx.drawImage(this._canvas, 0, 0, viewport.width, viewport.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  TransitPulseLayer.prototype.sample = function (x, y) { return null; };

  TransitPulseLayer.prototype.destroy = function () {
    this._canvas = null;
    this._ctx    = null;
  };

  SBE.Overlays.TransitPulseLayer = TransitPulseLayer;
})(window);
