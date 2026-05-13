// 0511_WOS_FoundationProtocols_HumanAquarium_v1.0.0
// World Inspector — current observational context snapshot for WOS.
// Vanilla IIFE. Attaches to SBE.WorldInspector.
// Load order: universalClock.js → environmentState.js → … → worldInspector.js → main.js
//
// ═══════════════════════════════════════════════════════════════════════════
// PURPOSE
//   The inspector represents CURRENT observational context.
//   NOT static world properties.
//
//   Inspector values are based on:
//     - current camera location (which world section is being observed)
//     - current world
//     - current clock state
//     - current environment
//     - current agent/needs state
//
// THIS MODULE HAS NO STATE OF ITS OWN.
//   It is a pure snapshot function. No ticking, no side effects.
//   Call snapshot() any time; the result is always fresh.
//
// USAGE
//   var snap = SBE.WorldInspector.snapshot(routeWorld, clock, env, comms);
//   HUD, debug overlay, and inspector panels read from snap.
// ═══════════════════════════════════════════════════════════════════════════

(function initWorldInspector(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _pad2(n) { return (n < 10 ? "0" : "") + n; }

  function _formatTime(hour) {
    var h = Math.floor(((hour % 24) + 24) % 24);
    var m = Math.floor(((hour % 1) + 1) % 1 * 60);
    return _pad2(h) + ":" + _pad2(m);
  }

  function _moonLabel(phase) {
    // 0=new, 0.25=first quarter, 0.5=full, 0.75=last quarter
    if (phase < 0.06 || phase > 0.94) return "new moon";
    if (phase < 0.19) return "waxing crescent";
    if (phase < 0.31) return "first quarter";
    if (phase < 0.44) return "waxing gibbous";
    if (phase < 0.56) return "full moon";
    if (phase < 0.69) return "waning gibbous";
    if (phase < 0.81) return "last quarter";
    return "waning crescent";
  }

  function _trafficDensity(actors, route) {
    // Rough density: actors / route length (normalized 0–1)
    if (!actors || !route) return 0;
    var count = actors.filter(function (a) { return a && a.routeId === (route && route.id); }).length;
    return Math.min(1, count / 10);  // 10 actors = full density
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────
  // Returns a WorldInspector data object.
  //
  //   routeWorld: state.routeWorld (or null)
  //   clock:      SBE.UniversalClock instance (or null)
  //   env:        SBE.EnvironmentState instance (or null)
  //   comms:      SBE.CommsSystem store (or null)
  function snapshot(routeWorld, clock, env, comms) {
    var UC = SBE.UniversalClock;
    var ES = SBE.EnvironmentState;
    var AN = SBE.AgentNeeds;

    // ── Clock-derived ────────────────────────────────────────────────────
    var derived = clock && UC ? UC.getDerived(clock) : null;
    var localTime = derived ? _formatTime(derived.hour) : "--:--";
    var season    = derived ? derived.season    : "unknown";
    var moonPhase = derived ? derived.moonPhase : 0;
    var timeOfDay = derived ? derived.timeOfDay : "unknown";
    var worldSec  = derived ? derived.worldSec  : 0;
    var daylightLevel = derived ? derived.daylightLevel : 0;

    // ── Environment ──────────────────────────────────────────────────────
    var weatherType = env ? env.weatherType : "clear";
    var envDrama    = env && ES ? ES.cinematicInterest(env) : 0;
    var temperature = env ? Math.round(env.temperature) : null;
    var visibility  = env ? Math.round(env.visibility * 100) : 100;  // %
    var windStrength = env ? env.windStrength : 0;

    // ── Route world ──────────────────────────────────────────────────────
    var rw          = routeWorld || {};
    var rt          = rw.runtime || {};
    var world       = rw.world   || {};
    var cam         = rw.camera  || {};
    var actors      = rw.actors  || [];
    var routes      = rw.routes  || [];

    var currentWorld   = world.id   || "none";
    var cameraMode     = cam.mode   || "follow";
    var activeRouteId  = rt.activeRouteId  || null;
    var activeActorId  = rt.activeActorId  || null;

    var activeRoute = routes.find(function (r) { return r.id === activeRouteId; }) || null;
    var heroActor   = actors.find(function (a) { return a.id === activeActorId; }) || null;

    var trafficDensity = _trafficDensity(actors, activeRoute);

    // ── Hero actor needs ─────────────────────────────────────────────────
    var heroNeeds = heroActor && AN ? AN.needsStatus(heroActor) : null;

    // ── Comms ────────────────────────────────────────────────────────────
    var recentMessages = comms && SBE.CommsSystem ? SBE.CommsSystem.getRecent(comms, 5) : [];
    var unreadCount    = comms && SBE.CommsSystem ? SBE.CommsSystem.getUnread(comms).length : 0;

    // ── Soundtrack mode (placeholder — will be driven by audio system) ───
    // For now: derive from environment + time of day
    var soundtrackMode = "ambient";
    if (envDrama > 0.6) soundtrackMode = "dramatic";
    else if (timeOfDay === "dawn" || timeOfDay === "dusk") soundtrackMode = "transitional";
    else if (timeOfDay === "night") soundtrackMode = "nocturnal";

    // ── Speed (from RouteCamera internal estimate) ────────────────────────
    var speedKph = 0;
    if (cam && activeRoute && SBE.RouteCamera) {
      speedKph = SBE.RouteCamera.getSpeedKph(cam, activeRoute);
    }

    // ── Spatial context ──────────────────────────────────────────────────
    var spatial = rw.spatial || null;
    var SI = SBE.SpatialInfrastructure;
    var districtName  = null;
    var districtType  = null;
    var nearestPOI    = null;
    var spatialInterestScore = 0;
    var routeProgress = heroActor ? (heroActor.t || 0) : 0;
    var scenicMoment  = null;

    if (spatial && SI) {
      // District from actor's cached context (set by simulation tick)
      var district = heroActor && heroActor._district ? heroActor._district : null;
      if (!district && heroActor) district = SI.getDistrictAtActor(spatial, heroActor);
      districtName = district ? district.name : null;
      districtType = district ? district.type : null;

      // Nearest relevant POI based on hero actor priority need
      var needType = heroNeeds && heroNeeds.priority ? (SI.NEED_DESTINATION && SI.NEED_DESTINATION[heroNeeds.priority]) : null;
      if (heroActor && (needType || true)) {
        var camPos = { x: cam.x || 0, y: cam.y || 0 };
        var nearPOI = SI.findNearestPOI(spatial, heroActor._district ? { x: heroActor.x || camPos.x, y: heroActor.y || camPos.y } : camPos, needType);
        nearestPOI = nearPOI ? nearPOI.name : null;
      }

      // Spatial interest at camera position
      spatialInterestScore = SI.spatialInterest(spatial, { x: cam.x || 0, y: cam.y || 0 }, env, clock);

      // Nearest scenic moment for HUD
      var sm = heroActor ? SI.getNearestScenicMoment(spatial, heroActor.t) : null;
      scenicMoment = sm ? sm.label : null;

      // Refine soundtrack mode using district
      if (districtType) {
        var district_soundtrack = district && district.soundtrackBias;
        if (district_soundtrack === "cinematic" || district_soundtrack === "ambient-water" || district_soundtrack === "pastoral") {
          if (soundtrackMode === "ambient") soundtrackMode = district_soundtrack;
        }
      }
    }

    return {
      // Identity
      currentWorld:    currentWorld,
      activeRouteId:   activeRouteId,
      activeActorId:   activeActorId,

      // Time
      localTime:       localTime,
      timeOfDay:       timeOfDay,
      season:          season,
      moonPhase:       moonPhase,
      moonLabel:       _moonLabel(moonPhase),
      worldSec:        worldSec,
      temporalOffset:  worldSec,    // spec alias
      daylightLevel:   daylightLevel,

      // Environment
      weather:         weatherType,
      temperature:     temperature,
      visibility:      visibility,   // percent
      windStrength:    windStrength,
      envDrama:        envDrama,

      // Spatial (spec additions)
      districtName:    districtName,
      districtType:    districtType,
      nearestPOI:      nearestPOI,
      spatialInterest: spatialInterestScore,
      routeProgress:   routeProgress,
      scenicMoment:    scenicMoment,

      // Observation
      cameraMode:      cameraMode,
      soundtrackMode:  soundtrackMode,
      trafficDensity:  trafficDensity,
      speedKph:        speedKph,

      // Agent
      heroNeeds:       heroNeeds,

      // Comms
      recentMessages:  recentMessages,
      unreadCount:     unreadCount,
    };
  }

  // ── Format for HUD display ────────────────────────────────────────────────
  // Returns a compact array of strings for overlay rendering.
  function formatHud(snap) {
    if (!snap) return [];
    var lines = [];
    lines.push(snap.localTime + "  " + snap.season.toUpperCase());
    if (snap.districtName) lines.push(snap.districtName);
    lines.push(snap.weather.replace(/_/g, " ") + "  " + (snap.temperature !== null ? snap.temperature + "°C" : ""));
    if (snap.heroNeeds && snap.heroNeeds.priority) {
      var p = snap.heroNeeds.priority;
      var pct = Math.round((snap.heroNeeds[p] && snap.heroNeeds[p].value || 0) * 100);
      lines.push(p.toUpperCase() + " " + pct + "% ▼" + (snap.nearestPOI ? "  → " + snap.nearestPOI : ""));
    }
    if (snap.speedKph > 0) lines.push(snap.speedKph + " km/h  " + snap.cameraMode.toUpperCase() + "  " + Math.round(snap.routeProgress * 100) + "%");
    if (snap.scenicMoment) lines.push("◆ " + snap.scenicMoment);
    if (snap.unreadCount > 0) lines.push("● " + snap.unreadCount + " message" + (snap.unreadCount > 1 ? "s" : ""));
    return lines;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.WorldInspector = {
    snapshot:   snapshot,
    formatHud:  formatHud,
    // Internal helpers exposed for testing
    _formatTime:  _formatTime,
    _moonLabel:   _moonLabel,
  };

  console.log("[WOS WorldInspector] Loaded — Foundation Protocols v1.0.0");
})(window);
