(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  SBE.Overlays = SBE.Overlays || {};

  // ── IsolationFadeLayer — 10Hz, multiply blend ─────────────────────────────
  // Visualizes urban loneliness: desaturation vignette, soft darkness,
  // ambient quieting. Driven by: field.silencePressure + nighttime state.

  var CADENCE_MS = 100;  // 10Hz — slow atmospheric fade

  function IsolationFadeLayer() {
    this.id      = "isolationFade";
    this.enabled = true;
    this._canvas = null;
    this._ctx    = null;
    this._lastUpdate = 0;
    this._width  = 0;
    this._height = 0;
    this._currentAlpha = 0;
  }

  IsolationFadeLayer.prototype.resize = function (w, h) {
    this._width  = w;
    this._height = h;
    if (!this._canvas) {
      this._canvas = document.createElement("canvas");
      this._ctx    = this._canvas.getContext("2d");
    }
    this._canvas.width  = w;
    this._canvas.height = h;
  };

  IsolationFadeLayer.prototype.update = function (dt, context) {
    if (!this.enabled || !this._ctx) return;
    var now = performance.now();
    if (now - this._lastUpdate < CADENCE_MS) return;
    this._lastUpdate = now;

    var ctx = this._ctx;
    var w   = this._width;
    var h   = this._height;

    var atm = context.atmosphereSnapshot;
    var lightLevel    = atm ? (atm.lightLevel    || 0) : 0.08;
    var soundtrackBias = atm ? (atm.soundtrackBias || {}) : {};
    var silence       = soundtrackBias.silence || 0.5;

    // Sample center and corners to derive spatial isolation score
    var centerField  = context.sampleAt(0.5,  0.5);
    var cornerField  = context.sampleAt(0.15, 0.15);
    var avgSilence   = centerField
      ? (centerField.silencePressure * 0.7 + (cornerField ? cornerField.silencePressure * 0.3 : 0))
      : silence;

    // Isolation score: high at night, high silence, quiet infrastructure
    var nightWeight   = 1 - lightLevel;
    var isolationScore = avgSilence * nightWeight * 0.8 + (1 - lightLevel) * 0.2;
    isolationScore    = Math.min(1, isolationScore);

    // Smooth toward target
    this._currentAlpha += (isolationScore - this._currentAlpha) * 0.12;

    ctx.clearRect(0, 0, w, h);
    if (this._currentAlpha < 0.02) return;

    var alpha = this._currentAlpha;

    // Deep vignette — multiply darkness toward edges
    var cx = w / 2;
    var cy = h / 2;
    var r  = Math.sqrt(cx * cx + cy * cy) * 1.1;

    var grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.6, "rgba(0,0,0," + (alpha * 0.15) + ")");
    grad.addColorStop(1,   "rgba(0,0,0," + (alpha * 0.55) + ")");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Desaturation hint — subtle grey midtone wash
    if (alpha > 0.2) {
      ctx.fillStyle = "rgba(20,22,30," + (alpha * 0.08) + ")";
      ctx.fillRect(0, 0, w, h);
    }
  };

  IsolationFadeLayer.prototype.render = function (ctx, viewport) {
    if (!this.enabled || !this._canvas || this._currentAlpha < 0.02) return;
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 1;
    ctx.drawImage(this._canvas, 0, 0, viewport.width, viewport.height);
    ctx.globalCompositeOperation = "source-over";
  };

  IsolationFadeLayer.prototype.sample = function (x, y) { return null; };

  IsolationFadeLayer.prototype.destroy = function () {
    this._canvas = null;
    this._ctx    = null;
  };

  SBE.Overlays.IsolationFadeLayer = IsolationFadeLayer;
})(window);
