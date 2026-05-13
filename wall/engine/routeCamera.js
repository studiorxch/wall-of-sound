// 0510_WOS_CameraArchitectureFreeze_v1.0.0
// Route camera — observation consciousness for WOS route worlds.
// Vanilla IIFE. Attaches to SBE.RouteCamera.
// Load order: schemas.js → routeIngestion.js → routeCamera.js → main.js
//
// ═══════════════════════════════════════════════════════════════════════════
// ARCHITECTURE BOUNDARIES (see 0510_WOS_CameraArchitectureFreeze_v1.0.0)
//
//  CAMERA OWNS:
//    position, zoom, drift, lookAhead, mode, transitions
//    trail buffer (presentation-only), HUD data exposure
//    observation behavior: follow logic, overview fitting, cinematic pacing
//
//  CAMERA DOES NOT OWN:
//    actor movement, route traversal, event systems, physics, world timing
//    route ingestion, segment generation, distance stats, audio generation
//
//  CAMERA OUTPUTS ONLY: { x, y, zoom }
//    The renderer applies transforms. Camera never draws directly.
//
//  ALL MODE CHANGES MUST INTERPOLATE. No position/zoom snaps.
//
//  PERSIST: mode, smoothing, lookAheadDistance, feature toggles
//  NEVER PERSIST: x, y, zoom, velocity, trail buffers, speed, shake
// ═══════════════════════════════════════════════════════════════════════════

(function initRouteCamera(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ─────────────────────────────────────────────────────────────
  var ZOOM_MIN         = 0.45;
  var ZOOM_MAX         = 2.2;
  var BASE_ZOOM        = 1.2;
  var MAX_TRAIL        = 60;
  var TRANSITION_SPEED = 2.5;   // alpha units per second during mode transition

  // ── Helpers ───────────────────────────────────────────────────────────────
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function easeOut(t) { return 1 - (1 - t) * (1 - t); }

  // ── Camera state factory ──────────────────────────────────────────────────
  // Persistent fields: mode, smoothing, zoomSmoothing, lookAheadDistance,
  //   velocityInfluence, deadZone, overviewPadding, dynamicZoom,
  //   showTrail, showHeadlight, showFlowIndicators
  //
  // Runtime fields (never persisted, prefixed _):
  //   x, y, targetX, targetY, zoom, targetZoom
  //   _smoothSpeed, _cinematicPhase, _pulseT
  //   _overviewFitted, _transitionAlpha, _lastActorX, _lastActorY
  //   trail buffers live on actor._trail (presentation-only, ephemeral)
  function makeCamera() {
    return {
      // ── Persistent ──────────────────────────────────────────────────────
      mode:               "follow",   // follow | overview | cinematic
      smoothing:          0.08,
      zoomSmoothing:      0.06,
      lookAheadDistance:  140,
      velocityInfluence:  0.35,
      deadZone:           40,
      overviewPadding:    160,

      // Feature toggles (persist, UI-controlled)
      dynamicZoom:        true,
      showTrail:          true,
      showHeadlight:      true,
      showFlowIndicators: true,

      // ── Runtime (ephemeral — never persist) ─────────────────────────────
      x:                  0,
      y:                  0,
      targetX:            0,
      targetY:            0,
      zoom:               BASE_ZOOM,
      targetZoom:         BASE_ZOOM,

      _smoothSpeed:       0,
      _cinematicPhase:    0,
      _pulseT:            0,
      _overviewFitted:    false,
      _transitionAlpha:   1,     // 0=transition starting, 1=complete
      _lastActorX:        null,
      _lastActorY:        null,
    };
  }

  // ── PERSIST_KEYS ─────────────────────────────────────────────────────────
  // Exactly the fields serializeCamera writes. Runtime fields are excluded.
  var PERSIST_KEYS = [
    "mode",
    "smoothing",
    "zoomSmoothing",
    "lookAheadDistance",
    "velocityInfluence",
    "deadZone",
    "overviewPadding",
    "dynamicZoom",
    "showTrail",
    "showHeadlight",
    "showFlowIndicators",
  ];

  // ── Mode transition ───────────────────────────────────────────────────────
  // ALL mode changes go through setMode(). Never assign camera.mode directly.
  // Transition is implicit: the camera's lerp system handles smooth movement.
  // _transitionAlpha scales smoothing during entry for a pronounced ease-in.
  function setMode(camera, newMode) {
    if (camera.mode === newMode) return;
    camera.mode             = newMode;
    camera._transitionAlpha = 0;         // begin transition
    camera._overviewFitted  = false;     // re-fit on overview entry
  }

  // ── Follow target ─────────────────────────────────────────────────────────
  function computeFollowTarget(actor, camera) {
    var la  = camera.lookAheadDistance;
    var vb  = camera._smoothSpeed * camera.velocityInfluence * la;
    var fwd = la + vb;
    return {
      x: actor.x + Math.cos(actor.heading) * fwd,
      y: actor.y + Math.sin(actor.heading) * fwd,
    };
  }

  // ── Dead zone ─────────────────────────────────────────────────────────────
  function outsideDeadZone(camera, tx, ty) {
    return Math.hypot(tx - camera.x, ty - camera.y) > camera.deadZone;
  }

  // ── Dynamic zoom from speed ───────────────────────────────────────────────
  function zoomForSpeed(speedNorm) {
    return clamp(BASE_ZOOM - speedNorm * 0.35, ZOOM_MIN, ZOOM_MAX);
  }

  // ── Overview fit ──────────────────────────────────────────────────────────
  // Sets targetX/Y/Zoom so the lerp system smoothly transitions to overview.
  function fitOverview(camera, route, canvas) {
    if (!route || !route.points || route.points.length < 2) return;
    var pts  = route.points;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    var pad    = camera.overviewPadding || 160;
    var cw     = (canvas && canvas.width)  || 1080;
    var ch     = (canvas && canvas.height) || 1920;
    var spanX  = Math.max(1, maxX - minX);
    var spanY  = Math.max(1, maxY - minY);
    var fitZ   = clamp(Math.min((cw - pad * 2) / spanX, (ch - pad * 2) / spanY), ZOOM_MIN, ZOOM_MAX);
    camera.targetZoom        = fitZ;
    camera.targetX           = (minX + maxX) / 2;
    camera.targetY           = (minY + maxY) / 2;
    camera._overviewFitted   = true;
  }

  // ── Trail update (presentation buffer — camera owns this) ─────────────────
  // Called internally by update(). Appends actor canvas position each frame.
  // actor._trail is ephemeral, never persisted, zeroed on actor reset.
  function _accumulateTrail(actor) {
    if (!actor) return;
    if (!actor._trail) actor._trail = [];
    actor._trail.push({ x: actor.x, y: actor.y });
    if (actor._trail.length > MAX_TRAIL) actor._trail.shift();
  }

  // ── Main camera update ────────────────────────────────────────────────────
  // Called once per frame from the route world behavior loop (not simulation).
  // actor: the observed actor (camera reads position, never writes simulation fields)
  // route: observed route (camera reads geometry for overview fit, never writes)
  // dt: frame delta seconds
  // canvas: { width, height } for overview fitting
  function update(camera, actor, route, dt, canvas) {
    if (!camera || !camera.enabled) return;

    // ── Advance transition alpha ─────────────────────────────────────────
    if (camera._transitionAlpha < 1) {
      camera._transitionAlpha = Math.min(1, camera._transitionAlpha + dt * TRANSITION_SPEED);
    }
    var tEase = easeOut(camera._transitionAlpha);

    // ── Advance presentation timers ──────────────────────────────────────
    camera._cinematicPhase = (camera._cinematicPhase + dt * 0.22) % (Math.PI * 20);
    camera._pulseT         = (camera._pulseT + dt * 0.06) % 1;

    // ── Trail accumulation (presentation-only buffer) ────────────────────
    if (camera.showTrail && actor) {
      _accumulateTrail(actor);
    }

    var mode = camera.mode;

    // ── OVERVIEW ─────────────────────────────────────────────────────────
    if (mode === "overview") {
      if (!camera._overviewFitted) fitOverview(camera, route, canvas);
      var ovSmooth = camera.smoothing * 0.5 * tEase;
      camera.x    = lerp(camera.x,    camera.targetX,   ovSmooth);
      camera.y    = lerp(camera.y,    camera.targetY,   ovSmooth);
      camera.zoom = lerp(camera.zoom, camera.targetZoom, camera.zoomSmoothing * 0.5 * tEase);
      return;
    }

    if (!actor) return;

    // ── Speed estimation (camera-internal, not shared with simulation) ───
    var prevX    = camera._lastActorX != null ? camera._lastActorX : actor.x;
    var prevY    = camera._lastActorY != null ? camera._lastActorY : actor.y;
    var rawSpeed = Math.hypot(actor.x - prevX, actor.y - prevY) / Math.max(dt, 0.001);
    camera._lastActorX = actor.x;
    camera._lastActorY = actor.y;
    camera._smoothSpeed = lerp(camera._smoothSpeed, clamp(rawSpeed / 300, 0, 1), 0.08);

    // ── Follow target ────────────────────────────────────────────────────
    var target = computeFollowTarget(actor, camera);
    camera.targetX = target.x;
    camera.targetY = target.y;

    // ── Dead zone + transition easing on smoothing ───────────────────────
    var effectiveSmoothing = camera.smoothing * tEase;
    if (!outsideDeadZone(camera, target.x, target.y)) {
      effectiveSmoothing *= 0.3;
    }

    // ── CINEMATIC drift ──────────────────────────────────────────────────
    var driftX = 0, driftY = 0;
    if (mode === "cinematic") {
      var driftAmp = 18 * (1 - camera._smoothSpeed * 0.6);
      driftX = Math.sin(camera._cinematicPhase * 0.7) * driftAmp;
      driftY = Math.cos(camera._cinematicPhase * 0.5) * driftAmp * 0.6;
    }

    // ── Apply position lerp ──────────────────────────────────────────────
    camera.x = lerp(camera.x, target.x + driftX, effectiveSmoothing);
    camera.y = lerp(camera.y, target.y + driftY, effectiveSmoothing);

    // ── Zoom ─────────────────────────────────────────────────────────────
    if (camera.dynamicZoom) {
      var breathe = mode === "cinematic"
        ? Math.sin(camera._cinematicPhase * 0.3) * 0.04 * (1 - camera._smoothSpeed)
        : 0;
      camera.targetZoom = clamp(zoomForSpeed(camera._smoothSpeed) + breathe, ZOOM_MIN, ZOOM_MAX);
    } else {
      camera.targetZoom = BASE_ZOOM;
    }
    camera.zoom = lerp(camera.zoom, camera.targetZoom, camera.zoomSmoothing * tEase);
  }

  // ── Transform output ──────────────────────────────────────────────────────
  // Camera outputs ONLY {tx, ty, scale}. Renderer applies; camera never draws.
  function getTransform(camera, canvas) {
    var cw = (canvas && canvas.width)  || 1080;
    var ch = (canvas && canvas.height) || 1920;
    var z  = camera.zoom;
    return { tx: cw / 2 - camera.x * z, ty: ch / 2 - camera.y * z, scale: z };
  }

  // ── Speed for HUD display ─────────────────────────────────────────────────
  // Camera observes route geo metadata to express its internal speed estimate
  // in human-readable units. Camera does not own speed — it approximates from
  // frame-delta pixel movement.
  function getSpeedKph(camera, route) {
    if (!route) return 0;
    var pixPerSec = camera._smoothSpeed * 300;
    var proj  = route.metadata && route.metadata.projection;
    var scale = (proj && proj.scale) ? proj.scale : 1;
    var mPerPx  = scale > 0 ? (111000 / scale) : 1;
    return Math.round((pixPerSec / Math.max(1, mPerPx)) * 3.6);
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  function serializeCamera(camera) {
    var out = {};
    PERSIST_KEYS.forEach(function (k) { out[k] = camera[k]; });
    return out;
  }

  function rehydrateCamera(saved) {
    var cam = makeCamera();
    if (saved) {
      PERSIST_KEYS.forEach(function (k) {
        if (saved[k] !== undefined) cam[k] = saved[k];
      });
    }
    return cam; // all runtime fields reset to makeCamera() defaults
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.RouteCamera = {
    // State
    makeCamera:       makeCamera,
    // Transitions — use setMode(), never assign camera.mode directly
    setMode:          setMode,
    // Core simulation (call once per frame from presentation loop)
    update:           update,
    // Output — renderer reads this, never the camera internals
    getTransform:     getTransform,
    // Utilities
    fitOverview:      fitOverview,
    getSpeedKph:      getSpeedKph,
    // Persistence
    serializeCamera:  serializeCamera,
    rehydrateCamera:  rehydrateCamera,
    // Constants
    ZOOM_MIN:  ZOOM_MIN,
    ZOOM_MAX:  ZOOM_MAX,
    BASE_ZOOM: BASE_ZOOM,
  };

  console.log("[WOS RouteCamera] Loaded — v1.0.0 architecture freeze");
})(window);
