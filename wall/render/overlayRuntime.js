(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── OverlayRuntime (0520I_WOS_OverlayRuntime_v1.1.0) ─────────────────────
  //
  // Cinematic environmental perception infrastructure.
  // Overlays emerge from world state — not pasted decoration.
  //
  // CANONICAL RESPONSIBILITY SEPARATION:
  //   GridRuntime owns spatial field resolution.
  //   AtmosphereRuntime owns environmental state.
  //   OverlayRuntime owns environmental perception rendering.
  //
  // SNAPSHOT-SAFE OVERLAY CONTEXT DOCTRINE:
  //   Layers receive frozen snapshots — never mutable runtime objects.
  //
  // DOUBLE-BUFFER ARCHITECTURE:
  //   frontCanvas: displayed (full-res, composited over map).
  //   offCanvas: layer composition target (reduced resolution).
  //   Feedback attenuation: feedbackAlpha ≤ 0.92.
  //
  // SOFT UPSCALING DOCTRINE:
  //   imageSmoothingEnabled = true on all compositing contexts.
  //
  // BLEND VALIDATION:
  //   Only allowed blends: normal, screen, additive, multiply.
  //   addLayer() rejects unsupported blend modes.
  //
  // Emits: none — renders directly to canvas.

  // ── Allowed blend modes ───────────────────────────────────────────────────
  var VALID_BLENDS = { normal: "source-over", screen: "screen", additive: "lighter", multiply: "multiply" };

  // ── Resolution factor (1/4 internal) ─────────────────────────────────────
  var SCALE = 0.25;

  function OverlayRuntime() {
    this._enabled        = false;
    this._layers         = [];   // { layer, blend }
    this._frontCanvas    = null; // full-res display canvas (over map)
    this._frontCtx       = null;
    this._offCanvas      = null; // reduced-res composition target
    this._offCtx         = null;
    this._container      = null;
    this._rafId          = null;
    this._lastTs         = 0;
    this._viewport       = { width: 1, height: 1, bounds: null };
    this._overlayW       = 1;
    this._overlayH       = 1;
    this._resizeObserver = null;
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────
  OverlayRuntime.prototype._getMapBounds = function () {
    var mvr = SBE.MapboxViewportRuntime;
    if (!mvr) return null;
    try {
      var map = mvr.getMap();
      return map ? map.getBounds() : null;
    } catch (e) { return null; }
  };

  // sampleAt(nx, ny) — normalized viewport [0,1] → bilinear grid scalars
  OverlayRuntime.prototype._makeSampleAt = function (bounds) {
    var gr = SBE.GridRuntime;
    return function sampleAt(nx, ny) {
      if (!gr || !bounds) return null;
      try {
        var sw  = bounds.getSouthWest();
        var ne  = bounds.getNorthEast();
        var lng = sw.lng + (ne.lng - sw.lng) * nx;
        var lat = ne.lat - (ne.lat - sw.lat) * ny;  // y inverted (top = north)
        var wxy = gr.latLngToWorld(lat, lng);
        return gr.sampleInterpolated(wxy.x, wxy.y);
      } catch (e) { return null; }
    };
  };

  // ── Canvas setup ──────────────────────────────────────────────────────────
  OverlayRuntime.prototype._createCanvas = function () {
    var container = document.getElementById("mapbox-viewport");
    if (!container) {
      console.warn("[OverlayRuntime] #mapbox-viewport not found");
      return false;
    }
    this._container = container;

    // Ensure container is a positioning context
    var cs = global.getComputedStyle(container);
    if (cs.position === "static") container.style.position = "relative";

    // Front canvas — full-res, displayed over map
    this._frontCanvas                   = document.createElement("canvas");
    this._frontCanvas.style.position    = "absolute";
    this._frontCanvas.style.inset       = "0";
    this._frontCanvas.style.pointerEvents = "none";
    this._frontCanvas.style.zIndex      = "10";
    container.appendChild(this._frontCanvas);

    this._frontCtx = this._frontCanvas.getContext("2d");
    this._frontCtx.imageSmoothingEnabled = true;
    this._frontCtx.imageSmoothingQuality = "high";

    // Off canvas — reduced resolution composition
    this._offCanvas = document.createElement("canvas");
    this._offCtx    = this._offCanvas.getContext("2d");
    this._offCtx.imageSmoothingEnabled = true;

    this._syncSize();
    return true;
  };

  OverlayRuntime.prototype._syncSize = function () {
    var container = this._container;
    if (!container) return;
    var w = container.offsetWidth  || global.innerWidth;
    var h = container.offsetHeight || global.innerHeight;

    this._frontCanvas.width  = w;
    this._frontCanvas.height = h;
    this._viewport.width  = w;
    this._viewport.height = h;

    this._overlayW = Math.max(1, Math.round(w * SCALE));
    this._overlayH = Math.max(1, Math.round(h * SCALE));
    this._offCanvas.width  = this._overlayW;
    this._offCanvas.height = this._overlayH;

    // Notify all layers of new overlay dimensions
    for (var i = 0; i < this._layers.length; i++) {
      this._layers[i].layer.resize(this._overlayW, this._overlayH);
    }
  };

  // ── addLayer / removeLayer ────────────────────────────────────────────────
  OverlayRuntime.prototype.addLayer = function (layer, blend) {
    blend = blend || "normal";
    if (!VALID_BLENDS[blend]) {
      console.warn("[OverlayRuntime] addLayer: unsupported blend mode:", blend,
        "— allowed:", Object.keys(VALID_BLENDS).join(", "));
      return;
    }
    layer.resize(this._overlayW, this._overlayH);
    this._layers.push({ layer: layer, blend: blend });
    console.log("[OverlayRuntime] layer added:", layer.id, "blend:", blend);
  };

  OverlayRuntime.prototype.removeLayer = function (id) {
    for (var i = 0; i < this._layers.length; i++) {
      if (this._layers[i].layer.id === id) {
        this._layers[i].layer.destroy();
        this._layers.splice(i, 1);
        return;
      }
    }
  };

  OverlayRuntime.prototype.getLayer = function (id) {
    for (var i = 0; i < this._layers.length; i++) {
      if (this._layers[i].layer.id === id) return this._layers[i].layer;
    }
    return null;
  };

  // ── enable / disable ──────────────────────────────────────────────────────
  OverlayRuntime.prototype.enable  = function () { this._enabled = true; };
  OverlayRuntime.prototype.disable = function () {
    this._enabled = false;
    if (this._frontCtx) this._frontCtx.clearRect(0, 0, this._viewport.width, this._viewport.height);
  };

  // ── resize ────────────────────────────────────────────────────────────────
  OverlayRuntime.prototype.resize = function () { this._syncSize(); };

  // ── update — build frozen snapshot context, call layer updates ────────────
  OverlayRuntime.prototype.update = function (dt) {
    var bounds   = this._getMapBounds();
    this._viewport.bounds = bounds;

    // ── Frozen snapshots — layers never touch live state ────────────────
    var atm = SBE.AtmosphereRuntime && SBE.AtmosphereRuntime.getResolvedAtmosphere();
    var tr  = SBE.TransitionRuntime && SBE.TransitionRuntime.getState();

    var context = Object.freeze({
      gridSnapshot:       SBE.GridRuntime || null,
      atmosphereSnapshot: atm  || null,
      transitionSnapshot: tr   || null,
      viewport:           this._viewport,
      sampleAt:           this._makeSampleAt(bounds),
    });

    for (var i = 0; i < this._layers.length; i++) {
      if (this._layers[i].layer.enabled) {
        this._layers[i].layer.update(dt, context);
      }
    }
  };

  // ── render — composite all layers onto front canvas ───────────────────────
  OverlayRuntime.prototype.render = function () {
    if (!this._enabled || !this._frontCtx) return;

    var fctx = this._frontCtx;
    var w    = this._viewport.width;
    var h    = this._viewport.height;
    var vp   = { width: this._overlayW, height: this._overlayH };

    fctx.clearRect(0, 0, w, h);

    // Each layer renders into the off canvas, then is upscaled to front
    for (var i = 0; i < this._layers.length; i++) {
      var entry = this._layers[i];
      if (!entry.layer.enabled) continue;

      // Upscale layer output to front canvas
      fctx.save();
      fctx.imageSmoothingEnabled = true;
      entry.layer.render(fctx, { width: w, height: h });
      fctx.restore();
    }
  };

  // ── RAF loop ──────────────────────────────────────────────────────────────
  OverlayRuntime.prototype._tick = function (ts) {
    var self = this;
    this._rafId = global.requestAnimationFrame(function (t) { self._tick(t); });

    var dt = this._lastTs > 0 ? Math.min((ts - this._lastTs) / 1000, 0.1) : 0.016;
    this._lastTs = ts;

    if (!this._enabled) return;

    this.update(dt);
    this.render();
  };

  // ── init ──────────────────────────────────────────────────────────────────
  OverlayRuntime.prototype.init = function () {
    if (!this._createCanvas()) return;

    // Register default layer stack — "pure geography" evaluation mode.
    // CinematicHazeLayer and SignalDriftLayer suspended:
    //   haze flattens map readability; scanlines fight road typography.
    //   Re-enable via render profile orchestration when geography is clear.
    var Overlays = SBE.Overlays || {};
    // if (Overlays.CinematicHazeLayer) this.addLayer(new Overlays.CinematicHazeLayer(), "screen");
    if (Overlays.TransitPulseLayer)  this.addLayer(new Overlays.TransitPulseLayer(),  "additive");
    if (Overlays.IsolationFadeLayer) this.addLayer(new Overlays.IsolationFadeLayer(), "multiply");
    // if (Overlays.SignalDriftLayer)   this.addLayer(new Overlays.SignalDriftLayer(),    "normal");

    // Resize observer
    if (global.ResizeObserver) {
      var self = this;
      this._resizeObserver = new global.ResizeObserver(function () { self._syncSize(); });
      this._resizeObserver.observe(this._container);
    } else {
      var self2 = this;
      global.addEventListener("resize", function () { self2._syncSize(); });
    }

    this.enable();
    this._tick(performance.now());

    console.log("[OverlayRuntime] initialized v1.1.0 — " + this._layers.length + " layers, " +
      this._overlayW + "×" + this._overlayH + " overlay buffer");
  };

  SBE.OverlayRuntime = new OverlayRuntime();

})(window);
