(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── AtmosphereComposite (0520B_WOS_AtmosphericResponseLayer_v1.0.0) ───────
  //
  // Fullscreen environmental mood compositor. Sits between Mapbox and the
  // WOS canvas stack.
  //
  // Z-stack:
  //   Mapbox              z-index: 0
  //   AtmosphereComposite z-index: 1  ← this canvas
  //   engine-canvas       z-index: 2
  //   surface-overlay     z-index: 3
  //   world-hud           z-index: 10
  //
  // Effects — all additive, all subtle, all cinematic:
  //   [1] Time-of-day tint        — full-screen color wash (WorldAtmosphere)
  //   [2] Fog/haze vignette       — radial gradient, denser at edges, drifting
  //   [3] Cloud shadow sweep      — slow elliptical patches, drift-intensity scaled
  //   [4] Rain wetness tint       — desaturating blue-grey + sky gradient
  //   [5] Ambient brightness veil — night/storm darkening
  //   [6] Ambient zone pockets    — localized emotional lighting (WorldLightingModel)
  //
  // State sources:
  //   world:atmosphereChanged  → weather, time, tint, fog, cloudiness
  //   world:lightingChanged    → roadWetness, driftIntensity, ambientZones, roadSegments

  var _canvas  = null;
  var _ctx     = null;
  var _raf     = null;
  var _running = false;

  // ── Persisted enable/disable preference ────────────────────────────────
  // Single source of truth for "should Atmosphere Composite be running,"
  // independent of whether a canvas happens to exist in THIS document.
  // MUSIC's own page loads this module dormant-only (no .canvas-area to
  // attach to — see init() below) so DOM presence there is always false
  // regardless of the real toggle state; readers that need the true
  // enabled/disabled intent (overlayStyleRegistry.js's catalog display,
  // overlayStyleApplyAdapters.js, workspaceUI.js's boot-time init) must call
  // readEnabledPreference() instead of checking the DOM directly. Same
  // storage key/shape OverlayStyleAuthority (wall/systems/presentation/
  // overlayStyleAuthority.js) persists to on every setPropertyValue call.
  var STORAGE_VALUES_KEY = "wos:overlayStyle:values";
  var STORAGE_PROP_ID    = "overlay.atmosphere-composite.enabled";

  function readEnabledPreference() {
    try {
      var raw = global.localStorage.getItem(STORAGE_VALUES_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Object.prototype.hasOwnProperty.call(parsed, STORAGE_PROP_ID)) return null;
      return parsed[STORAGE_PROP_ID] === "true";
    } catch (e) { return null; }
  }

  // ── Atmosphere target (snaps on world:atmosphereChanged) ──────────────────
  var _atm = {
    tintR: 0, tintG: 0, tintB: 0, tintA: 0,
    fogDensity:        0,
    cloudiness:        0,
    ambientBrightness: 1.0,
    isNight:           false,
    isRain:            false,
    isStorm:           false,
    isFog:             false,
    mood:              "neutral",
    lightTemp:         "neutral",
  };

  // ── Lighting target (snaps on world:lightingChanged) ──────────────────────
  var _lit = {
    roadWetness:    0,
    driftIntensity: 0.12,
    ambientZones:   [],
    // roadSegments accessed directly via WorldLightingModel.getRoadSegments()
  };

  // ── Interpolated render state (lerped toward targets each frame) ──────────
  var _cur = Object.assign({}, _atm, { roadWetness: 0, driftIntensity: 0.12 });

  // Lerp speed — ~40 frames to 63% of target. Cinematic transitions.
  var LERP = 0.025;

  // ── Drift constants ───────────────────────────────────────────────────────
  // Two independent drift cycles — never fully synchronize.
  // Periods are in ms. Scale by driftIntensity at render time.
  var DRIFT_A_PERIOD = 82000;   // 82s primary
  var DRIFT_B_PERIOD = 113000;  // 113s secondary (irrational ratio → no loop)

  // Fog vignette center wanders slowly: separate, very long cycle
  var FOG_DRIFT_PERIOD  = 127000;
  var FOG_DRIFT_RANGE   = 0.06;   // ±6% of viewport dimension

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _lerp(a, b, t) { return a + (b - a) * t; }

  function _parseTint(rgba) {
    if (!rgba) return { r: 0, g: 0, b: 0, a: 0 };
    var m = rgba.match(
      /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
    );
    if (!m) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
  }

  function _mbr() {
    var mbr = SBE.MapboxViewportRuntime;
    return (mbr && mbr.isReady()) ? mbr : null;
  }

  // ── State ingest ──────────────────────────────────────────────────────────
  function _onAtmosphere(evt) {
    if (!evt || !evt.state) return;
    var s    = evt.state;
    var mood = s.mood || "neutral";
    var tint = _parseTint(s.tintColor || "rgba(0,0,0,0)");
    _atm.tintR             = tint.r;
    _atm.tintG             = tint.g;
    _atm.tintB             = tint.b;
    _atm.tintA             = tint.a;
    _atm.fogDensity        = s.fogDensity        || 0;
    _atm.cloudiness        = s.cloudiness        || 0;
    _atm.ambientBrightness = s.ambientBrightness || 1.0;
    _atm.isNight           = !!s.isNight;
    _atm.lightTemp         = s.lightTemp         || "neutral";
    _atm.mood              = mood;
    _atm.isRain            = mood.includes("rain");
    _atm.isStorm           = mood.includes("storm");
    _atm.isFog             = mood.includes("fog");
  }

  function _onLighting(evt) {
    if (!evt || !evt.state) return;
    var s = evt.state;
    _lit.roadWetness    = s.roadWetness    || 0;
    _lit.driftIntensity = s.driftIntensity || 0.12;
    _lit.ambientZones   = s.ambientZones   || [];
  }

  // ── Per-frame interpolation ───────────────────────────────────────────────
  function _interpolate() {
    // Atmosphere channels — smooth
    _cur.tintR             = _lerp(_cur.tintR,             _atm.tintR,             LERP);
    _cur.tintG             = _lerp(_cur.tintG,             _atm.tintG,             LERP);
    _cur.tintB             = _lerp(_cur.tintB,             _atm.tintB,             LERP);
    _cur.tintA             = _lerp(_cur.tintA,             _atm.tintA,             LERP);
    _cur.fogDensity        = _lerp(_cur.fogDensity,        _atm.fogDensity,        LERP);
    _cur.cloudiness        = _lerp(_cur.cloudiness,        _atm.cloudiness,        LERP);
    _cur.ambientBrightness = _lerp(_cur.ambientBrightness, _atm.ambientBrightness, LERP);
    // Lighting channels — smooth
    _cur.roadWetness       = _lerp(_cur.roadWetness,       _lit.roadWetness,       LERP);
    _cur.driftIntensity    = _lerp(_cur.driftIntensity,    _lit.driftIntensity,    LERP);
    // Booleans snap — visual expression comes from alpha lerp above
    _cur.isNight   = _atm.isNight;
    _cur.isRain    = _atm.isRain;
    _cur.isStorm   = _atm.isStorm;
    _cur.isFog     = _atm.isFog;
    _cur.mood      = _atm.mood;
    _cur.lightTemp = _atm.lightTemp;
  }

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  function _resize() {
    var ca = _canvas && _canvas.parentNode;
    if (!ca) return;
    var r = ca.getBoundingClientRect();
    var w = Math.round(r.width);
    var h = Math.round(r.height);
    if (!w || !h) return;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width  = w;
      _canvas.height = h;
    }
  }

  // ── Effect renderers ──────────────────────────────────────────────────────

  // [1] Time-of-day tint — full screen, WorldAtmosphere color
  function _drawTint(ctx, W, H) {
    var a = _cur.tintA;
    if (a < 0.001) return;
    ctx.fillStyle = "rgba(" +
      Math.round(_cur.tintR) + "," +
      Math.round(_cur.tintG) + "," +
      Math.round(_cur.tintB) + "," +
      a.toFixed(4) + ")";
    ctx.fillRect(0, 0, W, H);
  }

  // [2] Fog / haze vignette — radial, center wanders with drift
  function _drawFog(ctx, W, H, now) {
    var fog = _cur.fogDensity;
    if (fog < 0.004) return;

    var di    = _cur.driftIntensity;
    // Fog center drifts in a slow Lissajous-like path
    var ft    = now / FOG_DRIFT_PERIOD;
    var fcx   = W / 2 + Math.sin(ft * Math.PI * 2)        * W * FOG_DRIFT_RANGE * di;
    var fcy   = H / 2 + Math.sin(ft * Math.PI * 2 * 0.71) * H * FOG_DRIFT_RANGE * di;

    var fc   = _cur.isNight ? "8,10,20" : "210,218,225";
    var fMax = fog * 0.16;
    var fMid = fMax * 0.28;

    var grad = ctx.createRadialGradient(fcx, fcy, 0, fcx, fcy, Math.max(W, H) * 0.64);
    grad.addColorStop(0,    "rgba(" + fc + ",0)");
    grad.addColorStop(0.40, "rgba(" + fc + "," + fMid.toFixed(4) + ")");
    grad.addColorStop(1,    "rgba(" + fc + "," + fMax.toFixed(4) + ")");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // [3] Cloud shadow sweep — elliptical patches, drift-intensity scaled
  // Two patches with irrational period ratio so they never phase-lock.
  function _drawCloudShadows(ctx, W, H, now) {
    var cloud = _cur.cloudiness;
    if (cloud < 0.40) return;

    var sAlpha = (cloud - 0.40) * 0.083;   // 0 → ~0.05 over 40→100%
    var di     = _cur.driftIntensity;

    // Drift amplitude: scales with driftIntensity so stormy air moves more
    var ampX = 0.18 * (0.5 + di * 0.5);    // 0.09–0.18
    var ampY = 0.04 * (0.5 + di * 0.5);    // 0.02–0.04

    var patches = [
      { bx: 0.28, by: 0.22, rx: 0.52, ry: 0.30,
        period: DRIFT_A_PERIOD, phase: 0.00, phaseY: 0.00 },
      { bx: 0.65, by: 0.58, rx: 0.46, ry: 0.24,
        period: DRIFT_B_PERIOD, phase: 0.42, phaseY: 0.17 },
    ];

    patches.forEach(function (p) {
      var t  = ((now / p.period) + p.phase)  % 1.0;
      var ty = ((now / p.period) + p.phaseY) % 1.0;
      var cx = (p.bx + Math.sin(t  * Math.PI * 2) * ampX) * W;
      var cy = (p.by + Math.sin(ty * Math.PI * 2 * 0.31) * ampY) * H;
      var rx = p.rx * W;
      var ry = p.ry * H;

      var sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      sg.addColorStop(0,    "rgba(0,0,0," + sAlpha.toFixed(4) + ")");
      sg.addColorStop(0.55, "rgba(0,0,0," + (sAlpha * 0.38).toFixed(4) + ")");
      sg.addColorStop(1,    "rgba(0,0,0,0)");

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);   // ellipse via scale before arc
      ctx.translate(-cx, -cy);
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(cx, cy, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // [4] Rain / storm wetness tint — chromatic wash + sky gradient
  function _drawRainTint(ctx, W, H) {
    if (!_cur.isRain && !_cur.isStorm) return;
    var rBase = _cur.isStorm ? 0.065 : 0.038;
    ctx.fillStyle = "rgba(18,36,72," + rBase.toFixed(4) + ")";
    ctx.fillRect(0, 0, W, H);
    var skyH   = H * 0.45;
    var skyMax = rBase * 0.75;
    var rGrad  = ctx.createLinearGradient(0, 0, 0, skyH);
    rGrad.addColorStop(0, "rgba(8,18,48," + skyMax.toFixed(4) + ")");
    rGrad.addColorStop(1, "rgba(8,18,48,0)");
    ctx.fillStyle = rGrad;
    ctx.fillRect(0, 0, W, skyH);
  }

  // [5] Ambient brightness veil — proportional to ambientBrightness
  function _drawBrightnessVeil(ctx, W, H) {
    var darkA = (1.0 - _cur.ambientBrightness) * 0.22;
    if (darkA < 0.003) return;
    ctx.fillStyle = "rgba(0,0,0," + darkA.toFixed(4) + ")";
    ctx.fillRect(0, 0, W, H);
  }

  // [6] Ambient zone pockets — localized emotional lighting.
  //
  // Large soft radial gradients at density-derived screen positions.
  // These are felt before they are seen (0.03–0.07 opacity max).
  // Zones are pre-computed by WorldLightingModel, updated on camera settle.
  function _drawAmbientZones(ctx) {
    var zones = _lit.ambientZones;
    if (!zones || !zones.length) return;

    ctx.save();
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      if (z.opacity < 0.003) continue;

      // Apply time-of-day modulation: night zones stronger, day nearly invisible
      var opMod = _cur.isNight ? 1.0 : 0.35;
      var alpha  = z.opacity * opMod;
      if (alpha < 0.003) continue;

      var grad = ctx.createRadialGradient(z.cx, z.cy, 0, z.cx, z.cy, z.radius);
      grad.addColorStop(0,    "rgba(" + z.r + "," + z.g + "," + z.b + "," + alpha.toFixed(4) + ")");
      grad.addColorStop(0.50, "rgba(" + z.r + "," + z.g + "," + z.b + "," + (alpha * 0.38).toFixed(4) + ")");
      grad.addColorStop(1,    "rgba(" + z.r + "," + z.g + "," + z.b + ",0)");
      ctx.fillStyle = grad;
      ctx.fillRect(
        z.cx - z.radius, z.cy - z.radius,
        z.radius * 2,    z.radius * 2
      );
    }
    ctx.restore();
  }

  // ── Master draw ───────────────────────────────────────────────────────────
  function _draw(now) {
    if (!_ctx || !_canvas) return;
    var W = _canvas.width;
    var H = _canvas.height;
    if (!W || !H) return;

    _ctx.clearRect(0, 0, W, H);

    _drawTint(_ctx, W, H);
    _drawFog(_ctx, W, H, now);
    _drawCloudShadows(_ctx, W, H, now);
    _drawRainTint(_ctx, W, H);
    _drawBrightnessVeil(_ctx, W, H);
    _drawAmbientZones(_ctx);
  }

  // ── rAF loop ──────────────────────────────────────────────────────────────
  function _frame(now) {
    if (!_running) return;
    _resize();
    _interpolate();
    _draw(now);
    _raf = requestAnimationFrame(_frame);
  }

  // ── Public ────────────────────────────────────────────────────────────────
  function init() {
    var canvasArea = document.querySelector(".canvas-area");
    if (!canvasArea) return;
    if (document.getElementById("atmosphere-composite")) return;

    _canvas = document.createElement("canvas");
    _canvas.id = "atmosphere-composite";
    _canvas.setAttribute("aria-hidden", "true");

    // Insert between Mapbox viewport and canvas-wrap
    var canvasWrap = document.getElementById("canvas-wrap");
    if (canvasWrap) {
      canvasArea.insertBefore(_canvas, canvasWrap);
    } else {
      canvasArea.appendChild(_canvas);
    }

    _ctx = _canvas.getContext("2d");

    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      bus.on("world:atmosphereChanged", _onAtmosphere);
      bus.on("world:lightingChanged",   _onLighting);
    }

    // Hydrate and snap — no cold-start lerp drift
    var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    if (atm) _onAtmosphere({ state: atm });
    var lit = SBE.WorldLightingModel && SBE.WorldLightingModel.getState();
    if (lit) _onLighting({ state: lit });
    _cur = Object.assign({}, _atm, {
      roadWetness: _lit.roadWetness,
      driftIntensity: _lit.driftIntensity,
    });

    _running = true;
    _raf = requestAnimationFrame(_frame);

    console.log("[AtmosphereComposite] initialized — 6-effect atmospheric stack");
  }

  function destroy() {
    _running = false;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
    if (_canvas && _canvas.parentNode) _canvas.parentNode.removeChild(_canvas);
    _canvas = null;
    _ctx    = null;
  }

  SBE.AtmosphereComposite = { init: init, destroy: destroy, readEnabledPreference: readEnabledPreference };

})(window);
