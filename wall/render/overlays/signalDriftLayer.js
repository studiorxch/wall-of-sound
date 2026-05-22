(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  SBE.Overlays = SBE.Overlays || {};

  // ── SignalDriftLayer — 60Hz, normal blend ─────────────────────────────────
  // Visualizes broadcast instability: analog wobble, scanline drift,
  // CRT softness, transmission residue. Driven by cinematicPressure and
  // camera velocity. Intentionally lightweight — pure canvas math, no grid.

  var SCANLINE_COUNT = 4;   // number of active drift bands
  var FEEDBACK_ALPHA = 0.88;

  function SignalDriftLayer() {
    this.id      = "signalDrift";
    this.enabled = true;
    this._canvas    = null;   // accumulation (feedback) buffer
    this._ctx       = null;
    this._drawCanvas = null;  // current frame draw surface
    this._drawCtx    = null;
    this._lastUpdate = 0;
    this._phase  = 0;
    this._bands  = [];        // pre-allocated scanline band state
    this._width  = 0;
    this._height = 0;
    this._intensity = 0;      // smoothed broadcast intensity
  }

  SignalDriftLayer.prototype.resize = function (w, h) {
    this._width  = w;
    this._height = h;

    if (!this._canvas) {
      this._canvas     = document.createElement("canvas");
      this._ctx        = this._canvas.getContext("2d");
      this._drawCanvas = document.createElement("canvas");
      this._drawCtx    = this._drawCanvas.getContext("2d");
    }
    this._canvas.width  = w; this._canvas.height  = h;
    this._drawCanvas.width = w; this._drawCanvas.height = h;

    // Pre-allocate band state
    this._bands = [];
    for (var i = 0; i < SCANLINE_COUNT; i++) {
      this._bands.push({
        y:         (i / SCANLINE_COUNT) * h,
        speed:     0.3 + Math.random() * 0.4,
        amplitude: 2 + Math.random() * 4,
        frequency: 0.8 + Math.random() * 1.2,
        phase:     Math.random() * Math.PI * 2,
      });
    }
  };

  SignalDriftLayer.prototype.update = function (dt, context) {
    if (!this.enabled || !this._ctx) return;

    this._phase += dt;

    // Derive intensity from atmosphere cinematic pressure
    var atm = context.atmosphereSnapshot;
    var targetIntensity = atm ? (atm.cinematicPressure || 0) * 0.7 : 0.2;
    this._intensity += (targetIntensity - this._intensity) * 0.05;

    if (this._intensity < 0.02) {
      // Clear feedback when essentially off
      this._ctx.clearRect(0, 0, this._width, this._height);
      return;
    }

    var ctx  = this._ctx;
    var dctx = this._drawCtx;
    var w    = this._width;
    var h    = this._height;
    var inten = this._intensity;

    // ── Feedback persistence: decay accumulation buffer ──────────────
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = FEEDBACK_ALPHA;
    ctx.drawImage(this._canvas, 0, 0);
    ctx.globalAlpha = 1;

    // ── Draw current frame drift onto draw surface ────────────────────
    dctx.clearRect(0, 0, w, h);

    for (var i = 0; i < this._bands.length; i++) {
      var band = this._bands[i];

      // Advance band position
      band.y += band.speed * dt * 60;
      if (band.y > h) band.y = 0;

      var yPos     = band.y;
      var bandH    = 1 + Math.random() * 2;
      var xOffset  = Math.sin(this._phase * band.frequency + band.phase) * band.amplitude * inten;
      var lineAlpha= inten * (0.08 + Math.random() * 0.06);

      dctx.fillStyle = "rgba(255,255,255," + lineAlpha + ")";
      dctx.fillRect(xOffset, yPos, w, bandH);
    }

    // Occasional horizontal glitch bar
    if (Math.random() < inten * 0.03) {
      var gy = Math.random() * h;
      var gh = 1 + Math.random() * 3;
      var ga = inten * 0.15;
      dctx.fillStyle = "rgba(200,220,255," + ga + ")";
      dctx.fillRect(0, gy, w, gh);
    }

    // Composite draw surface onto accumulation buffer
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.6;
    ctx.drawImage(this._drawCanvas, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  SignalDriftLayer.prototype.render = function (ctx, viewport) {
    if (!this.enabled || !this._canvas || this._intensity < 0.02) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = Math.min(0.5, this._intensity * 0.6);
    ctx.drawImage(this._canvas, 0, 0, viewport.width, viewport.height);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  SignalDriftLayer.prototype.sample = function (x, y) { return null; };

  SignalDriftLayer.prototype.destroy = function () {
    this._canvas     = null; this._ctx     = null;
    this._drawCanvas = null; this._drawCtx = null;
  };

  SBE.Overlays.SignalDriftLayer = SignalDriftLayer;
})(window);
