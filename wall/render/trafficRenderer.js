(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── TrafficRenderer (0520M_WOS_RoadLockedTraffic_v1.1.0 / renderer) ───────
  //
  // RENDER MODES:
  //   BASELINE  — cinematic glow, radial gradients, 1/4-res overlay.
  //               Returns post geographic-validation.
  //   PRECISION — hard-edged directional capsules, native-resolution canvas,
  //               subpixel-aligned, heading-inertia filtered display.
  //               Active during geographic projection validation phase.
  //   AUTO      — hysteresis-based switching on metersPerPixel threshold.
  //               LOD_ENTER_MPX (3.2) → enter PRECISION (zoom ~15).
  //               LOD_LEAVE_MPX (3.5) → leave PRECISION (zoom ~14.8).
  //
  // NATIVE RESOLUTION DOCTRINE (PRECISION only):
  //   PRECISION renders into a full-display-resolution canvas, bypassing the
  //   OverlayRuntime SCALE=0.25 upscale. Blit to front canvas at 1:1.
  //   This eliminates the 4× quantization error that caused vehicles to
  //   appear ≥4 display pixels off-road centerline.
  //
  // LOD DOCTRINE:
  //   Vehicle size = max(LOD_floor, VEHICLE_LEN_M / metersPerPixel).
  //   Computed in display CSS pixels. Divided by 1 for PRECISION (native),
  //   or by upscale ratio for BASELINE overlay buffer.
  //
  // HEADING INERTIA:
  //   Runtime provides inertia-filtered v.direction (lerpAngle, dt-normalized).
  //   Renderer applies a second visual-smoothing pass via per-vehicle cache.
  //   Combined: eliminates tangent chatter even at high zoom.
  //   factor = 1 - RENDER_HEADING_INERTIA^(dt*60), ~0.22 at 60fps.
  //
  // STABILIZATION RULES (from v1.1.0 stabilization pass):
  //   Sub-pixel stability: Math.round on all coordinates.
  //   Dedicated overlay ownership: clears only own surface.
  //   Density attenuation at DENSITY_CAP=40.
  //   Passive render profile — no internal branching.

  // ── Geographic constants ──────────────────────────────────────────────────
  var REF_LAT = 40.630;
  var REF_LNG = -74.040;
  var MPD_LAT = 111320;
  var MPD_LNG = 85395;

  // ── Vehicle dimensions ────────────────────────────────────────────────────
  var VEHICLE_LEN_M   = 4.5;
  var VEHICLE_WIDTH_M = 1.8;

  // ── Density attenuation ───────────────────────────────────────────────────
  var DENSITY_CAP = 40;

  // ── Render modes ──────────────────────────────────────────────────────────
  var MODE_BASELINE  = "BASELINE";
  var MODE_PRECISION = "PRECISION";
  var MODE_AUTO      = "AUTO";

  // ── LOD hysteresis thresholds (metersPerPixel) ────────────────────────────
  // Dual-threshold prevents zoom-edge flicker.
  var LOD_ENTER_MPX = 3.2;   // mpx drops below → enter PRECISION (~zoom 15)
  var LOD_LEAVE_MPX = 3.5;   // mpx rises above → leave PRECISION (~zoom 14.8)

  // ── Visual heading smoothing (renderer layer) ─────────────────────────────
  // Runtime already filters at 0.35 factor. Renderer adds second pass at ~0.22.
  // Combined: mechanically stable heading at all zoom levels.
  var RENDER_HEADING_INERTIA = 0.78;  // per-frame retention (1-0.22)

  // ── Default render profile ────────────────────────────────────────────────
  var DEFAULT_PROFILE = {
    activeRenderProfile: MODE_BASELINE,
    profileModifiers: { compositeMode: "source-over", alphaScalar: 1.0, radiusBonus: 0.0 },
  };

  // ── Coordinate helpers ────────────────────────────────────────────────────
  var EARTH_CIRC_M = 40075016.686;

  function _worldToLL(wx, wy) {
    return { lat: REF_LAT + wy / MPD_LAT, lng: REF_LNG + wx / MPD_LNG };
  }
  function _metersPerPixel(zoom, latDeg) {
    return (EARTH_CIRC_M * Math.cos(latDeg * Math.PI / 180)) / (256 * Math.pow(2, zoom));
  }
  function _lerpAngle(a, b, factor) {
    var diff = b - a;
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return a + diff * factor;
  }

  // LOD floor: minimum display px per zoom tier
  function _lodFloor(zoom) {
    if (zoom <= 9)  return { body: 2,  width: 2  };
    if (zoom <= 12) return { body: 3,  width: 1  };
    if (zoom <= 15) return { body: 5,  width: 2  };
    return            { body: 7,  width: 3  };
  }

  // ── TrafficLayer ──────────────────────────────────────────────────────────
  function TrafficLayer() {
    this.id      = "trafficFlow";
    this.enabled = true;

    // ── Overlay buffer (BASELINE / 1/4 res) ──────────────────────────────
    this._canvas  = null;
    this._ctx     = null;
    this._width   = 0;    // overlay px (display * 0.25)
    this._height  = 0;

    // ── Precision canvas (PRECISION / native res) ─────────────────────────
    this._precCanvas = null;
    this._precCtx    = null;
    this._precW      = 0;   // display CSS px
    this._precH      = 0;

    // ── Viewport / projection ─────────────────────────────────────────────
    this._bounds     = null;  // { sw, ne } in lat/lng

    // ── Mode state ────────────────────────────────────────────────────────
    this._manualMode = MODE_PRECISION;  // PRECISION active during validation
    this._autoMode   = false;           // true when setMode("AUTO")
    this._activeMode = MODE_PRECISION;  // resolved each frame

    // ── LOD cache (updated each frame) ────────────────────────────────────
    this._lod = { bodyPx: 2, widthPx: 1, nosePx: 1, zoom: 13, dot: false, mpx: 14 };

    // ── Per-vehicle heading cache (renderer visual smoothing) ─────────────
    this._headings = {};   // vehicleId → smoothed heading (radians)

    this._renderProfile = Object.assign({}, DEFAULT_PROFILE);
  }

  // ── resize — called by OverlayRuntime with overlay dimensions ────────────
  TrafficLayer.prototype.resize = function (w, h) {
    this._width  = w;
    this._height = h;
    if (!this._canvas) {
      this._canvas = document.createElement("canvas");
      this._ctx    = this._canvas.getContext("2d");
    }
    this._canvas.width  = w;
    this._canvas.height = h;
  };

  // ── Precision canvas — lazy init / resize to display dimensions ───────────
  TrafficLayer.prototype._ensurePrecCanvas = function (displayW, displayH) {
    if (!this._precCanvas) {
      this._precCanvas = document.createElement("canvas");
      this._precCtx    = this._precCanvas.getContext("2d");
    }
    if (this._precCanvas.width !== displayW || this._precCanvas.height !== displayH) {
      this._precCanvas.width  = displayW;
      this._precCanvas.height = displayH;
      this._precW = displayW;
      this._precH = displayH;
    }
  };

  // ── World → screen coords ─────────────────────────────────────────────────
  // PRECISION: maps to full display resolution (_precW / _precH)
  // BASELINE:  maps to overlay resolution (_width / _height)
  TrafficLayer.prototype._worldToScreen = function (wx, wy, fullRes) {
    if (!this._bounds) return null;
    var ll  = _worldToLL(wx, wy);
    var sw  = this._bounds.sw, ne = this._bounds.ne;
    var nx  = (ll.lng - sw.lng) / (ne.lng - sw.lng);
    var ny  = 1 - (ll.lat - sw.lat) / (ne.lat - sw.lat);
    if (nx < -0.05 || nx > 1.05 || ny < -0.05 || ny > 1.05) return null;
    var W   = fullRes ? this._precW : this._width;
    var H   = fullRes ? this._precH : this._height;
    return { x: Math.round(nx * W), y: Math.round(ny * H) };
  };

  // ── LOD computation ───────────────────────────────────────────────────────
  TrafficLayer.prototype._computeLOD = function (displayW) {
    var mvr  = SBE.MapboxViewportRuntime;
    var vla  = SBE.ViewportLocationAuthority;
    var zoom = (mvr && mvr.getState) ? (mvr.getState().zoom || 13) : 13;
    var lat  = (vla && vla.getState) ? (vla.getState().latitude  || 40.68) : 40.68;
    var mpx  = _metersPerPixel(zoom, lat);
    var floor = _lodFloor(zoom);

    // Display pixel sizes — metric-accurate with LOD floor
    var bodyD  = Math.max(floor.body,  VEHICLE_LEN_M   / mpx);
    var widthD = Math.max(floor.width, VEHICLE_WIDTH_M / mpx);
    var noseD  = Math.max(1, widthD * 0.6);

    // For PRECISION: native res — sizes are display px directly
    // For BASELINE: overlay buffer (displayW * 0.25) — divide by upscale
    var upscale = (displayW > 0 && this._width > 0) ? displayW / this._width : 4;

    this._lod = {
      bodyPx:    Math.max(1, Math.round(bodyD)),           // display px (PRECISION)
      widthPx:   Math.max(1, Math.round(widthD)),
      nosePx:    Math.max(1, Math.round(noseD)),
      bodyBufPx: Math.max(1, Math.round(bodyD  / upscale)), // overlay px (BASELINE)
      widthBufPx:Math.max(1, Math.round(widthD / upscale)),
      noseBufPx: Math.max(1, Math.round(noseD  / upscale)),
      zoom:      zoom,
      mpx:       mpx,
      dot:       (zoom <= 9),
    };

    // ── LOD hysteresis — AUTO mode only ───────────────────────────────────
    if (this._autoMode) {
      if (this._activeMode !== MODE_PRECISION && mpx <= LOD_ENTER_MPX) {
        this._activeMode = MODE_PRECISION;
        console.log("[TrafficRenderer] AUTO → PRECISION (mpx=" + mpx.toFixed(2) + ")");
      } else if (this._activeMode === MODE_PRECISION && mpx >= LOD_LEAVE_MPX) {
        this._activeMode = MODE_BASELINE;
        console.log("[TrafficRenderer] AUTO → BASELINE (mpx=" + mpx.toFixed(2) + ")");
      }
    }
  };

  // ── setMode / setRenderProfile ────────────────────────────────────────────
  TrafficLayer.prototype.setMode = function (mode) {
    if (mode === MODE_AUTO) {
      this._autoMode   = true;
      this._activeMode = MODE_BASELINE;  // start baseline, enter precision on zoom
      console.log("[TrafficRenderer] mode → AUTO (hysteresis active)");
    } else {
      this._autoMode   = false;
      this._activeMode = (mode === MODE_PRECISION) ? MODE_PRECISION : MODE_BASELINE;
      this._manualMode = this._activeMode;
      console.log("[TrafficRenderer] mode →", this._activeMode);
    }
  };

  TrafficLayer.prototype.setRenderProfile = function (profile) {
    if (!profile) return;
    this._renderProfile = {
      activeRenderProfile: profile.activeRenderProfile || MODE_BASELINE,
      profileModifiers: Object.assign({}, DEFAULT_PROFILE.profileModifiers, profile.profileModifiers),
    };
    if (!this._autoMode) {
      this._activeMode = this._renderProfile.activeRenderProfile === MODE_PRECISION
        ? MODE_PRECISION : MODE_BASELINE;
    }
  };

  // ── update ────────────────────────────────────────────────────────────────
  TrafficLayer.prototype.update = function (dt, context) {
    if (!this.enabled) return;

    // Cache viewport bounds
    var vp = context.viewport;
    if (vp && vp.bounds) {
      try {
        var sw = vp.bounds.getSouthWest(), ne = vp.bounds.getNorthEast();
        this._bounds = { sw: { lat: sw.lat, lng: sw.lng }, ne: { lat: ne.lat, lng: ne.lng } };
      } catch (e) { this._bounds = null; }
    }

    var displayW = vp ? vp.width  : this._width  * 4;
    var displayH = vp ? vp.height : this._height * 4;

    // LOD computation + AUTO mode hysteresis check
    this._computeLOD(displayW);

    // Advance simulation
    var tfr = SBE.TrafficFlowRuntime;
    if (!tfr) return;
    tfr.update(dt);

    var vehicles = tfr.getVehicles();
    if (!vehicles || vehicles.length === 0) {
      if (this._activeMode === MODE_PRECISION && this._precCtx) {
        this._precCtx.clearRect(0, 0, this._precW, this._precH);
      } else if (this._ctx) {
        this._ctx.clearRect(0, 0, this._width, this._height);
      }
      return;
    }

    var densityAttenuation = vehicles.length > DENSITY_CAP
      ? DENSITY_CAP / vehicles.length : 1.0;

    if (this._activeMode === MODE_PRECISION) {
      // ── Full-resolution precision render ──────────────────────────────
      this._ensurePrecCanvas(displayW, displayH);
      this._precCtx.clearRect(0, 0, this._precW, this._precH);
      this._precCtx.globalCompositeOperation = "source-over";
      this._renderPrecision(this._precCtx, vehicles, densityAttenuation, dt);
      this._precCtx.globalCompositeOperation = "source-over";
      this._precCtx.globalAlpha = 1;
    } else {
      // ── Overlay buffer baseline render ────────────────────────────────
      if (!this._ctx) return;
      this._ctx.clearRect(0, 0, this._width, this._height);
      this._ctx.globalCompositeOperation = "source-over";
      this._renderBaseline(this._ctx, vehicles, densityAttenuation, context);
      this._ctx.globalCompositeOperation = "source-over";
      this._ctx.globalAlpha = 1;
    }
  };

  // ── PRECISION RENDER ──────────────────────────────────────────────────────
  //
  // Renders into full-resolution canvas — native pixel coordinates.
  // No upscaling. No blur. No falloff.
  //
  // Per-vehicle heading: renderer maintains _headings cache for visual
  // smoothing (second inertia pass at RENDER_HEADING_INERTIA ~0.78/frame).
  // Runtime has already applied primary inertia filter at 0.65/frame.
  //
  // DOT MODE (zoom ≤ 9): single 2×2 px square at vehicle center.
  // CAPSULE MODE (zoom 10+):
  //   Body: bodyPx×2 × widthPx×2  warm white rectangle, heading-aligned
  //   Nose: nosePx × widthPx×2    bright white — forward direction
  //   Tail: nosePx × widthPx×2    deep red — rear indicator
  //
  // Physical vehicles: full alpha. Virtual (offscreen, 1Hz): 45% alpha.

  TrafficLayer.prototype._renderPrecision = function (ctx, vehicles, densityAttenuation, dt) {
    var lod     = this._lod;
    var factor  = 1 - Math.pow(RENDER_HEADING_INERTIA, dt * 60);
    var fullRes = true;

    for (var vi = 0; vi < vehicles.length; vi++) {
      var v    = vehicles[vi];
      var head = v.headlights[0];
      var tail = v.taillights[0];

      var hpt = this._worldToScreen(head.x, head.y, fullRes);
      var tpt = this._worldToScreen(tail.x, tail.y, fullRes);
      if (!hpt || !tpt) continue;

      // ── Per-vehicle heading smoothing (visual inertia, renderer layer) ──
      var rawHeading = v.direction;
      var vid        = v.vehicleId;
      if (this._headings[vid] === undefined) {
        this._headings[vid] = rawHeading;
      } else {
        this._headings[vid] = _lerpAngle(this._headings[vid], rawHeading, factor);
      }
      var heading = this._headings[vid];

      var cx = Math.round((hpt.x + tpt.x) * 0.5);
      var cy = Math.round((hpt.y + tpt.y) * 0.5);

      // Screen-space rotation: world +x=east, screen +y=down → invert sin
      var cosA = Math.cos(heading);
      var sinA = -Math.sin(heading);

      var alpha = v.physical ? densityAttenuation : densityAttenuation * 0.45;

      if (lod.dot) {
        // ── DOT MODE ───────────────────────────────────────────────────
        ctx.globalAlpha = Math.min(0.85, alpha);
        ctx.fillStyle   = "rgb(255,248,200)";
        ctx.fillRect(cx - 1, cy - 1, 2, 2);
        continue;
      }

      // ── CAPSULE MODE ───────────────────────────────────────────────────
      var bL = lod.bodyPx;
      var bW = lod.widthPx;
      var nL = lod.nosePx;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(Math.atan2(sinA, cosA));

      // Body — warm white
      ctx.globalAlpha = Math.min(0.90, alpha * 0.88);
      ctx.fillStyle   = "rgb(255,245,210)";
      ctx.fillRect(-bL, -bW, bL * 2, bW * 2);

      // Nose — pure white direction indicator
      ctx.globalAlpha = Math.min(1.0, alpha);
      ctx.fillStyle   = "rgb(255,255,255)";
      ctx.fillRect(bL, -bW, nL, bW * 2);

      // Tail — deep red
      ctx.globalAlpha = Math.min(0.85, alpha * 0.80);
      ctx.fillStyle   = "rgb(210,18,8)";
      ctx.fillRect(-bL - nL, -bW, nL, bW * 2);

      ctx.restore();
    }

    // Prune heading cache — remove vehicles no longer active
    var activeIds = {};
    for (var vi2 = 0; vi2 < vehicles.length; vi2++) activeIds[vehicles[vi2].vehicleId] = true;
    var keys = Object.keys(this._headings);
    for (var ki = 0; ki < keys.length; ki++) {
      if (!activeIds[keys[ki]]) delete this._headings[keys[ki]];
    }
  };

  // ── BASELINE RENDER ───────────────────────────────────────────────────────
  // Cinematic glow — radial gradients, overlay buffer (1/4 res), atmospheric alpha.
  // Preserved from v1.1.0 stabilization pass. Returns post-validation.

  TrafficLayer.prototype._renderBaseline = function (ctx, vehicles, densityAttenuation, context) {
    var mods        = this._renderProfile.profileModifiers;
    var alphaScalar = mods.alphaScalar  != null ? mods.alphaScalar  : 1.0;
    var radiusBonus = mods.radiusBonus  != null ? mods.radiusBonus  : 0.0;
    var atm         = context.atmosphereSnapshot;
    var lightLevel  = atm ? (atm.lightLevel || 0.08) : 0.08;
    var nightLift   = Math.max(0, 0.5 - lightLevel) * 0.3;
    var DPR         = global.devicePixelRatio || 1;
    var fullRes     = false;

    for (var vi = 0; vi < vehicles.length; vi++) {
      var v = vehicles[vi];

      for (var hi = 0; hi < v.headlights.length; hi++) {
        var hpt = this._worldToScreen(v.headlights[hi].x, v.headlights[hi].y, fullRes);
        if (!hpt) continue;
        var hRadius = (1.5 + v.intensity * 1.5 + radiusBonus) * DPR;
        var hAlpha  = Math.min(0.55, v.intensity * 0.18 * alphaScalar * densityAttenuation * (1 + nightLift));
        var hGrad = ctx.createRadialGradient(hpt.x, hpt.y, 0, hpt.x, hpt.y, hRadius);
        hGrad.addColorStop(0,   "rgba(255,248,220," + hAlpha.toFixed(3) + ")");
        hGrad.addColorStop(0.5, "rgba(255,240,180," + (hAlpha * 0.4).toFixed(3) + ")");
        hGrad.addColorStop(1,   "rgba(255,220,120,0)");
        ctx.fillStyle = hGrad;
        ctx.beginPath(); ctx.arc(hpt.x, hpt.y, hRadius, 0, Math.PI * 2); ctx.fill();
      }

      for (var ti = 0; ti < v.taillights.length; ti++) {
        var tpt = this._worldToScreen(v.taillights[ti].x, v.taillights[ti].y, fullRes);
        if (!tpt) continue;
        var tRadius = (1.0 + v.intensity * 1.2 + radiusBonus) * DPR;
        var tAlpha  = Math.min(0.45, v.intensity * 0.12 * alphaScalar * densityAttenuation * (1 + nightLift));
        var tGrad = ctx.createRadialGradient(tpt.x, tpt.y, 0, tpt.x, tpt.y, tRadius);
        tGrad.addColorStop(0,   "rgba(255,30,20,"  + tAlpha.toFixed(3) + ")");
        tGrad.addColorStop(0.5, "rgba(200,15,10,"  + (tAlpha * 0.4).toFixed(3) + ")");
        tGrad.addColorStop(1,   "rgba(140,0,0,0)");
        ctx.fillStyle = tGrad;
        ctx.beginPath(); ctx.arc(tpt.x, tpt.y, tRadius, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  // ── render — blit to display canvas ──────────────────────────────────────
  TrafficLayer.prototype.render = function (ctx, viewport) {
    if (!this.enabled) return;
    ctx.globalCompositeOperation = "source-over";

    if (this._activeMode === MODE_PRECISION && this._precCanvas) {
      // Native resolution — 1:1 blit, no upscale
      ctx.globalAlpha = 1.0;
      ctx.drawImage(this._precCanvas, 0, 0);
    } else if (this._canvas) {
      // Overlay buffer — upscale to display
      ctx.globalAlpha = 0.80;
      ctx.drawImage(this._canvas, 0, 0, viewport.width, viewport.height);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  TrafficLayer.prototype.sample  = function () { return null; };
  TrafficLayer.prototype.destroy = function () {
    this._canvas     = null; this._ctx     = null;
    this._precCanvas = null; this._precCtx = null;
    this._headings   = {};
  };

  // ── Public interface ──────────────────────────────────────────────────────
  var _layer = new TrafficLayer();

  function init() {
    var or = SBE.OverlayRuntime;
    if (!or) { console.warn("[TrafficRenderer] OverlayRuntime not available"); return; }
    or.addLayer(_layer, "normal");
    if (!SBE.TrafficFlowRuntime) console.warn("[TrafficRenderer] TrafficFlowRuntime not available");
    console.log("[TrafficRenderer] initialized v1.1.0 — mode:", _layer._activeMode,
      "| LOD hysteresis:", LOD_ENTER_MPX + "→" + LOD_LEAVE_MPX + " m/px");
  }

  function enable()  { _layer.enabled = true;  }
  function disable() { _layer.enabled = false; }
  function getLayer(){ return _layer; }

  // ── setMode — runtime mode switch ────────────────────────────────────────
  // SBE.TrafficRenderer.setMode("PRECISION")  → geographic validation
  // SBE.TrafficRenderer.setMode("BASELINE")   → cinematic atmosphere
  // SBE.TrafficRenderer.setMode("AUTO")       → hysteresis-based on mpx
  function setMode(mode) { _layer.setMode(mode); }

  function setRenderProfile(profile) { _layer.setRenderProfile(profile); }

  SBE.TrafficRenderer = {
    init:             init,
    enable:           enable,
    disable:          disable,
    getLayer:         getLayer,
    setMode:          setMode,
    setRenderProfile: setRenderProfile,
    MODE_BASELINE:    MODE_BASELINE,
    MODE_PRECISION:   MODE_PRECISION,
    MODE_AUTO:        MODE_AUTO,
  };

})(window);
