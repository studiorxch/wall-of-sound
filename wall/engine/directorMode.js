// 0514_WOS_DirectorMode_v1.0.0
// Director Mode — authorial control layer for WOS route world.
// Vanilla IIFE. Attaches to SBE.DirectorMode.
// Load order: … → worldInspector.js → directorMode.js → main.js
//
// ═══════════════════════════════════════════════════════════════════════════
// PURPOSE
//   Grants the author/operator manual control over:
//     - Camera: survey pan/zoom, camera mode authority
//     - Time: set world hour, season
//     - Weather: override environment archetypes
//     - Simulation: pause, speed multiplier, route progress scrub
//     - Cinema: shot type selection
//
// DIRECTOR STATE (lives in routeWorld.director)
//   mode: "survey" | "follow" | "cinema" | "god"
//   manualCamera: { x, y, zoom, isPanning, lastPointer }
//   simulation: { paused, speed, routeProgressOverride }
//   reality: { useOverrides, timeHour, season, weatherType, temperatureC, daylightOverride }
//   cinema: { outputMode, shotType, targetActorId }
//
// THIS MODULE HAS NO GLOBAL STATE.
//   All state lives in the director object passed to each function.
// ═══════════════════════════════════════════════════════════════════════════

(function initDirectorMode(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ──────────────────────────────────────────────────────────────
  var VALID_MODES   = ["survey", "follow", "cinema", "god"];
  var VALID_SEASONS = ["spring", "summer", "autumn", "winter"];
  var VALID_WEATHER = ["clear", "cloudy", "light_rain", "heavy_rain", "fog", "snow"];
  var VALID_SHOTS   = ["overhead", "chase", "wide", "close", "orbit"];

  var MIN_ZOOM = 0.05;
  var MAX_ZOOM = 8.0;
  var PAN_DAMPING = 1;    // pointer px → world px (1:1 in survey)
  var WHEEL_FACTOR = 0.0012;

  // ── State factory ──────────────────────────────────────────────────────────
  function makeDirectorState() {
    return {
      enabled: true,
      mode: "survey",           // current director mode
      manualCamera: {
        x: 0, y: 0, zoom: 1,
        isPanning: false,
        lastPointer: null,      // { x, y }
        _primed: false,
      },
      simulation: {
        paused: false,
        speed: 1,               // real-time multiplier (0.25 – 4)
        routeProgressOverride: null,  // 0–1 or null (live)
      },
      reality: {
        useOverrides: true,
        timeHour: 8,            // 0–23.99
        season: "spring",
        weatherType: "clear",
        temperatureC: 9,
        daylightOverride: null, // 0–1 or null
      },
      cinema: {
        outputMode: "world",    // "world" | "portrait" | "wide"
        shotType: "overhead",
        targetActorId: null,
      },
    };
  }

  // ── Mode control ───────────────────────────────────────────────────────────
  function setMode(director, mode) {
    if (VALID_MODES.indexOf(mode) === -1) {
      console.warn("[DirectorMode] Unknown mode:", mode);
      return;
    }
    director.mode = mode;
  }

  // ── Manual camera (survey mode) ────────────────────────────────────────────

  // Prime the manual camera to a world position + zoom so survey starts at a
  // reasonable view instead of origin. Call after route load / fit.
  function primeManualCamera(director, x, y, zoom) {
    var mc = director.manualCamera;
    mc.x = x || 0;
    mc.y = y || 0;
    mc.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom || 1));
    mc._primed = true;
  }

  // Handle pointer down (start pan)
  function pointerDown(director, clientX, clientY) {
    if (director.mode !== "survey") return;
    var mc = director.manualCamera;
    mc.isPanning = true;
    mc.lastPointer = { x: clientX, y: clientY };
  }

  // Handle pointer move (pan)
  function pointerMove(director, clientX, clientY, canvasScale) {
    if (director.mode !== "survey") return;
    var mc = director.manualCamera;
    if (!mc.isPanning || !mc.lastPointer) return;
    var scl = canvasScale || 1;
    var dx = (clientX - mc.lastPointer.x) * PAN_DAMPING / (mc.zoom * scl);
    var dy = (clientY - mc.lastPointer.y) * PAN_DAMPING / (mc.zoom * scl);
    mc.x -= dx;
    mc.y -= dy;
    mc.lastPointer = { x: clientX, y: clientY };
  }

  // Handle pointer up / cancel
  function pointerUp(director) {
    var mc = director.manualCamera;
    mc.isPanning = false;
    mc.lastPointer = null;
  }

  // Handle wheel (zoom at cursor)
  function wheel(director, deltaY, cursorX, cursorY, canvasW, canvasH) {
    if (director.mode !== "survey") return;
    var mc = director.manualCamera;
    var factor = 1 - deltaY * WHEEL_FACTOR;
    var newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, mc.zoom * factor));
    // Zoom toward cursor: adjust pan so the world point under cursor stays fixed.
    var cw = canvasW || 1080;
    var ch = canvasH || 1920;
    // Cursor position relative to canvas centre in canvas-space
    var cx = (cursorX - cw / 2);
    var cy = (cursorY - ch / 2);
    // World position under cursor before zoom
    var wx = mc.x + cx / mc.zoom;
    var wy = mc.y + cy / mc.zoom;
    mc.zoom = newZoom;
    // After zoom, cursor must still point at the same world position
    mc.x = wx - cx / mc.zoom;
    mc.y = wy - cy / mc.zoom;
  }

  // Get canvas transform from manual camera (survey mode)
  // Returns { tx, ty, scale } matching RouteCamera.getTransform() shape.
  function getTransform(director, canvasW, canvasH) {
    var mc = director.manualCamera;
    var cw = canvasW || 1080;
    var ch = canvasH || 1920;
    return {
      tx:    cw / 2 - mc.x * mc.zoom,
      ty:    ch / 2 - mc.y * mc.zoom,
      scale: mc.zoom,
    };
  }

  // ── Simulation control ─────────────────────────────────────────────────────
  function pause(director)  { director.simulation.paused = true; }
  function resume(director) { director.simulation.paused = false; }

  function setSpeed(director, speed) {
    director.simulation.speed = Math.max(0.1, Math.min(8, speed || 1));
  }

  // Set route progress (0–1). Pass null to return to live simulation.
  function setRouteProgress(director, t) {
    director.simulation.routeProgressOverride = (t == null) ? null : Math.max(0, Math.min(1, t));
  }

  // ── Reality overrides ──────────────────────────────────────────────────────
  // Apply director reality overrides into live clock + env objects.
  // Call each simulation frame when useOverrides is true.
  function applyRealityOverrides(director, clock, env) {
    if (!director.reality.useOverrides) return;
    var UC = SBE.UniversalClock;
    var ES = SBE.EnvironmentState;
    var r  = director.reality;

    if (UC && clock) {
      // Inject hour directly (setHour freezes the progression)
      UC.setHour(clock, r.timeHour);
    }
    if (ES && env) {
      // Force weather archetype transition target
      if (VALID_WEATHER.indexOf(r.weatherType) !== -1) {
        ES.setWeather(env, r.weatherType);
      }
      // Temperature override
      if (r.temperatureC != null) {
        env.temperature = r.temperatureC;
      }
      // Daylight override
      if (r.daylightOverride != null) {
        env.daylightOverride = r.daylightOverride;
      }
    }
  }

  // ── Effective dt scaling ───────────────────────────────────────────────────
  // Returns the dt to use for simulation this frame (0 if paused).
  function effectiveDt(director, rawDt) {
    if (!director || !director.enabled) return rawDt;
    if (director.simulation.paused) return 0;
    return rawDt * (director.simulation.speed || 1);
  }

  // ── Effective route progress ───────────────────────────────────────────────
  // Returns the progress override if set, or null (caller uses live value).
  function effectiveProgress(director) {
    if (!director || !director.enabled) return null;
    return director.simulation.routeProgressOverride;
  }

  // ── Snapshot helpers ───────────────────────────────────────────────────────
  function snapshotDirector(director) {
    if (!director) return null;
    return {
      mode:     director.mode,
      paused:   director.simulation.paused,
      speed:    director.simulation.speed,
      progress: director.simulation.routeProgressOverride,
      time:     director.reality.timeHour,
      weather:  director.reality.weatherType,
      season:   director.reality.season,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.DirectorMode = {
    makeDirectorState:    makeDirectorState,
    setMode:              setMode,
    primeManualCamera:    primeManualCamera,
    pointerDown:          pointerDown,
    pointerMove:          pointerMove,
    pointerUp:            pointerUp,
    wheel:                wheel,
    getTransform:         getTransform,
    pause:                pause,
    resume:               resume,
    setSpeed:             setSpeed,
    setRouteProgress:     setRouteProgress,
    applyRealityOverrides: applyRealityOverrides,
    effectiveDt:          effectiveDt,
    effectiveProgress:    effectiveProgress,
    snapshotDirector:     snapshotDirector,
    // Constants
    VALID_MODES:   VALID_MODES,
    VALID_SEASONS: VALID_SEASONS,
    VALID_WEATHER: VALID_WEATHER,
    VALID_SHOTS:   VALID_SHOTS,
    MIN_ZOOM:      MIN_ZOOM,
    MAX_ZOOM:      MAX_ZOOM,
  };

  console.log("[WOS DirectorMode] Loaded — 0514 v1.0.0");
})(window);
