// 0511_WOS_FoundationProtocols_HumanAquarium_v1.0.0
// Aquarium Camera — autonomous observational intelligence for 24/7 WOS streams.
// Vanilla IIFE. Attaches to SBE.AquariumCamera.
// Load order: routeCamera.js → environmentState.js → aquariumCamera.js → …
//
// ═══════════════════════════════════════════════════════════════════════════
// THIS IS NOT:
//   - a player camera
//   - a fixed follow camera
//   - a traditional cinematic rail
//
// THIS IS:
//   an observational intelligence that evaluates the scene and drifts
//   toward what is most cinematically and emotionally significant.
//
// SCORING FACTORS (evaluated each frame):
//   - Environmental drama (weather, visibility, fog)
//   - Actor density at candidate positions
//   - Unusual motion (stopped actors, diverging paths)
//   - Daylight transitions (dawn, dusk)
//   - Need events (actor approaching gas station, motel)
//   - Atmospheric beauty (clear night, moonlit route)
//
// CAMERA CONTRACT (same as RouteCamera — spec compliant)
//   Outputs only { x, y, zoom }. Renderer applies. Camera never draws.
//   All transitions interpolated — no snaps.
//
// PERSIST: driftSpeed, zoomRange, interestDecay, enabled
// NEVER PERSIST: x, y, zoom, _candidates, _focusScore, _dwellT
// ═══════════════════════════════════════════════════════════════════════════

(function initAquariumCamera(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Helpers ───────────────────────────────────────────────────────────────
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  var ZOOM_MIN = 0.45;
  var ZOOM_MAX = 1.8;

  // Minimum dwell time before the camera considers switching focus (seconds)
  var MIN_DWELL_SEC = 8;
  // How long the camera drifts before re-evaluating candidates (seconds)
  var EVAL_INTERVAL_SEC = 3;

  // ── Camera factory ────────────────────────────────────────────────────────
  function makeAquariumCamera(opts) {
    opts = opts || {};
    return {
      // ── Persistent ──────────────────────────────────────────────────────
      enabled:       true,
      driftSpeed:    0.012,    // position lerp alpha per second
      zoomSpeed:     0.008,    // zoom lerp alpha per second
      zoomMin:       opts.zoomMin || 0.65,
      zoomMax:       opts.zoomMax || 1.4,
      interestDecay: 0.85,     // candidate score multiplied by this each eval cycle

      // ── Runtime (ephemeral — never persist) ─────────────────────────────
      x:          0,
      y:          0,
      zoom:       1.0,
      targetX:    0,
      targetY:    0,
      targetZoom: 1.0,

      _dwellT:    0,      // seconds spent at current focus target
      _evalT:     0,      // seconds since last candidate evaluation
      _candidates: [],    // [{ x, y, score, label }]
      _focusIdx:   -1,    // index into _candidates of current focus
      _ambientPhase: 0,   // slow sinusoidal drift phase
    };
  }

  var PERSIST_KEYS = ["enabled", "driftSpeed", "zoomSpeed", "zoomMin", "zoomMax", "interestDecay"];

  // ── Candidate generation ──────────────────────────────────────────────────
  // Produces scored candidate observation points from available world data.
  // Each candidate: { x, y, score, label, zoom }
  function _buildCandidates(actors, route, env, clockDerived) {
    var candidates = [];

    // Actor-based candidates
    if (actors && actors.length > 0) {
      actors.forEach(function (actor) {
        if (!actor || (!actor.x && !actor.y)) return;
        var score = 0.5;  // base interest in any actor

        // Boost: actor with critical needs
        if (actor.needs) {
          var AN = SBE.AgentNeeds;
          if (AN) {
            var status = AN.needsStatus(actor);
            if (status && status.priority) score += 0.25;
            if (status && status.priority && actor.needs[status.priority] <= AN.THRESHOLD.critical) score += 0.20;
          }
        }

        // Boost: actor at low speed (stopping behavior, interesting moment)
        if (actor._speed != null && actor._speed < 0.1) score += 0.15;

        candidates.push({ x: actor.x, y: actor.y, score: score, label: "actor:" + (actor.id || "?"), zoom: 1.1 });
      });
    }

    // Environment-based scoring modifier (applied globally)
    var envDrama = 0;
    if (env && SBE.EnvironmentState) {
      envDrama = SBE.EnvironmentState.cinematicInterest(env);
    }

    // Dawn / dusk beauty boost — all candidates get higher interest at transitions
    var daylightBoost = 0;
    if (clockDerived) {
      var h = clockDerived.hour;
      // Peaks at h=6 (dawn) and h=19 (dusk) — narrow windows
      var dawnPeak = Math.max(0, 1 - Math.abs(h - 6)  / 1.5);
      var duskPeak = Math.max(0, 1 - Math.abs(h - 19) / 1.5);
      daylightBoost = Math.max(dawnPeak, duskPeak) * 0.3;
    }

    // Route-based overview candidate (always available if route exists)
    if (route && route.points && route.points.length > 2) {
      var pts   = route.points;
      var midPt = pts[Math.floor(pts.length / 2)];
      var overviewScore = 0.3 + envDrama * 0.4 + daylightBoost;
      candidates.push({ x: midPt.x, y: midPt.y, score: overviewScore, label: "route:overview", zoom: 0.75 });

      // Scenic third — different vantage along route
      var thirdPt = pts[Math.floor(pts.length / 3)];
      candidates.push({ x: thirdPt.x, y: thirdPt.y, score: overviewScore * 0.8, label: "route:scenic", zoom: 0.90 });
    }

    // Apply global boosts to all candidates
    candidates.forEach(function (c) {
      c.score += daylightBoost + envDrama * 0.2;
      c.score  = clamp(c.score, 0, 1);
    });

    // Sort descending by score
    candidates.sort(function (a, b) { return b.score - a.score; });

    return candidates;
  }

  // ── Select focus target ───────────────────────────────────────────────────
  // Picks the highest-scored candidate that differs from the current focus.
  // Avoids immediately re-selecting the same target (enforces variation).
  function _selectFocus(cam, candidates) {
    if (!candidates || candidates.length === 0) return null;

    var current = cam._focusIdx >= 0 && cam._focusIdx < cam._candidates.length
      ? cam._candidates[cam._focusIdx]
      : null;

    // Find best candidate that's not the current target
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!current || Math.hypot(c.x - current.x, c.y - current.y) > 80) {
        return i;
      }
    }
    return 0;  // fall back to best regardless
  }

  // ── Main update ───────────────────────────────────────────────────────────
  // Call once per real-time frame from the aquarium simulation loop.
  // actors: array of agent actors (read-only, camera observes only)
  // route:  current active route (read-only)
  // env:    EnvironmentState instance
  // clock:  UniversalClock instance
  // dt:     real-time delta seconds
  // canvas: { width, height }
  function update(cam, actors, route, env, clock, dt, canvas) {
    if (!cam || !cam.enabled) return;

    // Advance timers
    cam._dwellT       += dt;
    cam._evalT        += dt;
    cam._ambientPhase  = (cam._ambientPhase + dt * 0.08) % (Math.PI * 4);

    var clockDerived = clock && SBE.UniversalClock ? SBE.UniversalClock.getDerived(clock) : null;

    // ── Periodic candidate evaluation ────────────────────────────────────
    if (cam._evalT >= EVAL_INTERVAL_SEC) {
      cam._evalT = 0;

      // Decay existing candidate scores
      cam._candidates.forEach(function (c) { c.score *= cam.interestDecay; });

      // Rebuild from current world state
      var fresh = _buildCandidates(actors, route, env, clockDerived);

      // Merge: keep highest score per label
      var merged = {};
      cam._candidates.concat(fresh).forEach(function (c) {
        if (!merged[c.label] || c.score > merged[c.label].score) {
          merged[c.label] = c;
        }
      });
      cam._candidates = Object.values ? Object.values(merged) : Object.keys(merged).map(function (k) { return merged[k]; });
      cam._candidates.sort(function (a, b) { return b.score - a.score; });
      // Cap list
      if (cam._candidates.length > 12) cam._candidates = cam._candidates.slice(0, 12);
    }

    // ── Focus switching ───────────────────────────────────────────────────
    // Switch when: dwell timer exceeded OR current focus score has fallen below threshold
    var currentFocusScore = cam._focusIdx >= 0 && cam._candidates[cam._focusIdx]
      ? cam._candidates[cam._focusIdx].score : 0;

    if (cam._dwellT >= MIN_DWELL_SEC || currentFocusScore < 0.15) {
      var newIdx = _selectFocus(cam, cam._candidates);
      if (newIdx !== null && newIdx !== cam._focusIdx) {
        cam._focusIdx = newIdx;
        cam._dwellT   = 0;
      }
    }

    // ── Determine target position ─────────────────────────────────────────
    var focus = cam._focusIdx >= 0 ? cam._candidates[cam._focusIdx] : null;
    if (focus) {
      // Ambient drift: small sinusoidal wander around the focus point
      var driftAmp = 22;
      var ambX = Math.sin(cam._ambientPhase * 0.7) * driftAmp;
      var ambY = Math.cos(cam._ambientPhase * 0.5) * driftAmp * 0.6;

      cam.targetX    = focus.x + ambX;
      cam.targetY    = focus.y + ambY;
      cam.targetZoom = clamp(focus.zoom || 1.0, cam.zoomMin, cam.zoomMax);
    } else if (route && route.points && route.points.length > 0) {
      // Fallback: drift over route midpoint
      var mid = route.points[Math.floor(route.points.length / 2)];
      cam.targetX    = mid.x;
      cam.targetY    = mid.y;
      cam.targetZoom = cam.zoomMin;
    }

    // Environment drama → reduce zoom slightly (pull back for wide weather shots)
    if (env && SBE.EnvironmentState) {
      var drama = SBE.EnvironmentState.cinematicInterest(env);
      cam.targetZoom = clamp(cam.targetZoom - drama * 0.15, cam.zoomMin, cam.zoomMax);
    }

    // ── Lerp to target ────────────────────────────────────────────────────
    var posRate  = 1 - Math.pow(1 - cam.driftSpeed, dt * 60);
    var zoomRate = 1 - Math.pow(1 - cam.zoomSpeed,  dt * 60);

    cam.x    = lerp(cam.x,    cam.targetX,    posRate);
    cam.y    = lerp(cam.y,    cam.targetY,    posRate);
    cam.zoom = lerp(cam.zoom, cam.targetZoom, zoomRate);
  }

  // ── Transform output (same contract as RouteCamera) ───────────────────────
  function getTransform(cam, canvas) {
    var cw = (canvas && canvas.width)  || 1080;
    var ch = (canvas && canvas.height) || 1920;
    var z  = cam.zoom;
    return { tx: cw / 2 - cam.x * z, ty: ch / 2 - cam.y * z, scale: z };
  }

  // ── Prime position (call after route load) ────────────────────────────────
  function primePosition(cam, x, y) {
    cam.x = cam.targetX = x;
    cam.y = cam.targetY = y;
    cam._focusIdx  = -1;
    cam._candidates = [];
    cam._dwellT    = 0;
    cam._evalT     = EVAL_INTERVAL_SEC; // trigger immediate evaluation
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  function serializeAquariumCamera(cam) {
    var out = {};
    PERSIST_KEYS.forEach(function (k) { out[k] = cam[k]; });
    return out;
  }

  function rehydrateAquariumCamera(saved) {
    var cam = makeAquariumCamera(saved || {});
    if (saved) {
      PERSIST_KEYS.forEach(function (k) {
        if (saved[k] !== undefined) cam[k] = saved[k];
      });
    }
    return cam;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.AquariumCamera = {
    makeAquariumCamera:      makeAquariumCamera,
    update:                  update,
    getTransform:            getTransform,
    primePosition:           primePosition,
    serializeAquariumCamera: serializeAquariumCamera,
    rehydrateAquariumCamera: rehydrateAquariumCamera,
    // Constants
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
  };

  console.log("[WOS AquariumCamera] Loaded — Foundation Protocols v1.0.0");
})(window);
