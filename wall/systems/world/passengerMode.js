(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── PassengerMode (0520_WOS_PassengerFrameState_v1.0.0) ──────────────────
  //
  // Observational traversal layer. Persistent cinematic consciousness.
  //
  // Movement is emotional existence.
  // Observation is the primary interaction.
  // Silence is a valid state.
  //
  // Frame state updates continuously regardless of whether passenger mode is
  // active — the system remains "warm" at all times and is always ready to
  // assume viewport authority without cold-start interpolation or snapping.
  //
  // Viewport authority is mediated by SBE.ViewportAuthority.
  // PassengerMode only pushes camera transforms when authority === 'passenger'.
  //
  // Emits:
  //   passenger:modeChanged          { mode, prev, transitType }
  //   passenger:attentionChanged     { targetId, linger }
  //   passenger:silenceWindowStarted { durationMs }
  //   passenger:silenceWindowEnded   {}

  // ── Constants ─────────────────────────────────────────────────────────────
  var PASSENGER_TICK_MS          = 120;
  var DEFAULT_CAMERA_LERP        = 0.06;
  var DRIFT_INERTIA_MULTIPLIER   = 1.25;
  var MIN_SILENCE_WINDOW_MS      = 8000;
  var MAX_SILENCE_WINDOW_MS      = 45000;
  var DEFAULT_LINGER_DURATION_MS = 12000;

  // ── ViewportAuthority ─────────────────────────────────────────────────────
  // Lightweight authority arbiter. Any camera system checks this before
  // mutating the viewport. First claimant wins; explicit release required.
  SBE.ViewportAuthority = SBE.ViewportAuthority || {
    active:  "route",   // route | passenger | director | free
    claim:   function (who) {
      if (this.active !== who) {
        console.log("[ViewportAuthority]", this.active, "→", who);
        this.active = who;
        var bus = SBE.WorkspaceEventBus;
        bus && bus.emit("viewport:authorityChanged", { active: who });
      }
    },
    release: function (who) {
      if (this.active === who) {
        this.active = "route";
        var bus = SBE.WorkspaceEventBus;
        bus && bus.emit("viewport:authorityChanged", { active: "route" });
      }
    },
    owns:    function (who) { return this.active === who; },
  };

  // ── Mode definitions ──────────────────────────────────────────────────────
  var MODE_DEFS = {
    "window-drift": {
      pitchTarget:  22,
      zoomBias:      0,
      motionScale:   1.0,
      bearingDrift:  0.006,
      lingerMs:      9000,
    },
    "observer-pause": {
      pitchTarget:  12,
      zoomBias:     -0.3,
      motionScale:   0.3,
      bearingDrift:  0.001,
      lingerMs:      DEFAULT_LINGER_DURATION_MS,
    },
    "distant-witness": {
      pitchTarget:   5,
      zoomBias:     -0.8,
      motionScale:   0.2,
      bearingDrift:  0.0005,
      lingerMs:      20000,
    },
    "hypnotic-transit": {
      pitchTarget:  30,
      zoomBias:      0.2,
      motionScale:   1.4,
      bearingDrift:  0.009,
      lingerMs:      25000,
    },
    "free-observe": {
      pitchTarget:  18,
      zoomBias:      0,
      motionScale:   0.6,
      bearingDrift:  0.002,
      lingerMs:      6000,
    },
  };

  // ── Transit type camera personalities ────────────────────────────────────
  var TRANSIT_DEFS = {
    "car":    { positionLerp: 0.055, rotationLerp: 0.035, zoomLerp: 0.040 },
    "train":  { positionLerp: 0.040, rotationLerp: 0.020, zoomLerp: 0.025 },
    "walk":   { positionLerp: 0.080, rotationLerp: 0.060, zoomLerp: 0.055 },
    "aerial": { positionLerp: 0.025, rotationLerp: 0.015, zoomLerp: 0.018 },
    "static": { positionLerp: 0.012, rotationLerp: 0.010, zoomLerp: 0.010 },
  };

  // ── Passenger state ───────────────────────────────────────────────────────
  var _state = {
    enabled:     false,
    mode:        "window-drift",
    transitType: "car",
    routeId:     null,

    driftCoupling: 1.0,

    inertia: {
      positionLerp: DEFAULT_CAMERA_LERP,
      rotationLerp: 0.035,
      zoomLerp:     0.040,
    },

    attention: {
      targetId:     null,
      lingerWeight: 0.5,
      stability:    0.8,
    },

    pacing: {
      velocity:              0.5,
      silenceBias:           0.2,
      interruptionThreshold: 0.65,
    },

    framing: {
      horizonBias:  0.3,
      leadDistance: 0.0004,
      sideOffset:   0.0,
    },

    environmentalMemory: {
      lastWeatherFront:   0,
      lastAttentionShift: 0,
      accumulatedFatigue: 0,
      recentDistricts:    [],   // future: geographic memory
      recentWeather:      [],   // future: weather front history
      recentScenicMoments:[],   // future: attention landmark log
    },
  };

  // ── Passenger Frame State ─────────────────────────────────────────────────
  // Continuously updated regardless of whether passenger mode is active.
  // This is the "warm" state — enables seamless authority assumption.
  var _frame = {
    // Current interpolated position
    lng:     0,
    lat:     0,
    zoom:    13.0,
    bearing: 0,
    pitch:   22,

    // Lerp targets
    tLng:     0,
    tLat:     0,
    tZoom:    13.0,
    tBearing: 0,
    tPitch:   22,

    // Kinematic state — continuously computed for continuity
    velocity: {
      lng:     0,   // deg/tick
      lat:     0,
      speed:   0,   // magnitude
    },
    heading:  0,    // smoothed direction of travel (degrees)

    // Sampled world state snapshots — updated every tick
    drift: {
      hour:             18,
      ambientIntensity: 0.5,
      soundtrackEnergy: 0.4,
      pulseMultiplier:  1.0,
      colorTemperature: 0.5,
      driftLabel:       "",
    },
    atmosphere: {
      mood:      "neutral",
      isNight:   false,
      lightTemp: "neutral",
    },

    timestamp: 0,
  };

  var _lastTick     = 0;
  var _silenceUntil = 0;
  var _lingerUntil  = 0;
  var _bearingPhase = 0;

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function _rand() { return Math.random(); }

  function _getMap() {
    return SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap
      ? SBE.MapboxViewportRuntime.getMap() : null;
  }
  function _bus() { return SBE.WorkspaceEventBus; }

  // ── sampleDrift — pull current drift into frame ───────────────────────────
  function sampleDrift() {
    var d = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    if (!d) return;
    _frame.drift.hour             = d.hour;
    _frame.drift.ambientIntensity = d.ambientIntensity;
    _frame.drift.soundtrackEnergy = d.soundtrackEnergy;
    _frame.drift.pulseMultiplier  = d.pulseMultiplier;
    _frame.drift.colorTemperature = d.colorTemperature;
    _frame.drift.driftLabel       = d.driftLabel || "";
  }

  // ── sampleAtmosphere — pull current atmosphere into frame ─────────────────
  function sampleAtmosphere() {
    var a = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    if (!a) return;
    _frame.atmosphere.mood      = a.mood      || "neutral";
    _frame.atmosphere.isNight   = !!a.isNight;
    _frame.atmosphere.lightTemp = a.lightTemp || "neutral";
  }

  // ── sampleWorldState — sync frame position from map ───────────────────────
  function sampleWorldState() {
    var map = _getMap();
    if (!map) return;

    var c    = map.getCenter();
    var prevLng = _frame.tLng;
    var prevLat = _frame.tLat;

    // Only resync targets from map if passenger does not own the viewport,
    // so our frame stays continuously warm without fighting RouteCamera.
    if (!SBE.ViewportAuthority.owns("passenger")) {
      _frame.tLng     = c.lng;
      _frame.tLat     = c.lat;
      _frame.tZoom    = map.getZoom();
      _frame.tBearing = map.getBearing();
      _frame.tPitch   = map.getPitch();
    }

    // Velocity — delta from last tick (always computed for continuity)
    _frame.velocity.lng   = c.lng - prevLng;
    _frame.velocity.lat   = c.lat - prevLat;
    _frame.velocity.speed = Math.sqrt(
      _frame.velocity.lng * _frame.velocity.lng +
      _frame.velocity.lat * _frame.velocity.lat
    );
  }

  // ── computeFrameHeading — smoothed direction of travel ────────────────────
  function computeFrameHeading() {
    var vLng = _frame.velocity.lng;
    var vLat = _frame.velocity.lat;
    if (Math.abs(vLng) < 1e-9 && Math.abs(vLat) < 1e-9) return;
    var rawHeading = Math.atan2(vLng, vLat) * (180 / Math.PI);
    // Smooth — heading tracks direction of travel, never snaps
    _frame.heading = _lerp(_frame.heading, rawHeading, 0.04);
  }

  // ── computeFrameVelocity — smooth velocity magnitude ─────────────────────
  function computeFrameVelocity() {
    var rawSpeed = _frame.velocity.speed;
    // Damped — velocity decays smoothly, no mechanical pulses
    _state.pacing.velocity = _lerp(_state.pacing.velocity, _clamp(rawSpeed * 12000, 0, 1), 0.06);
  }

  // ── updateFrame — advance internal frame state ────────────────────────────
  function updateFrame() {
    var inertia = _state.inertia;
    _frame.lng     = _lerp(_frame.lng,     _frame.tLng,     inertia.positionLerp);
    _frame.lat     = _lerp(_frame.lat,     _frame.tLat,     inertia.positionLerp);
    _frame.zoom    = _lerp(_frame.zoom,    _frame.tZoom,    inertia.zoomLerp);
    _frame.bearing = _lerp(_frame.bearing, _frame.tBearing, inertia.rotationLerp);
    _frame.pitch   = _lerp(_frame.pitch,   _frame.tPitch,   inertia.rotationLerp);
    _frame.timestamp = performance.now();
  }

  // ── applyDriftCoupling ────────────────────────────────────────────────────
  function applyDriftCoupling() {
    var mul     = _frame.drift.pulseMultiplier || 1.0;
    var transit = TRANSIT_DEFS[_state.transitType] || TRANSIT_DEFS["car"];
    var scale   = 1 / (mul * DRIFT_INERTIA_MULTIPLIER);

    _state.inertia.positionLerp = _lerp(_state.inertia.positionLerp, transit.positionLerp * scale, 0.05);
    _state.inertia.rotationLerp = _lerp(_state.inertia.rotationLerp, transit.rotationLerp * scale, 0.05);
    _state.inertia.zoomLerp     = _lerp(_state.inertia.zoomLerp,     transit.zoomLerp     * scale, 0.05);

    _state.pacing.silenceBias = _lerp(0.12, 0.45, 1 - _frame.drift.soundtrackEnergy);
    _state.driftCoupling      = mul;
  }

  // ── evaluateSilenceWindow ─────────────────────────────────────────────────
  function evaluateSilenceWindow() {
    var now = performance.now();
    if (now < _silenceUntil) {
      // In silence — clamp motion, suppress attention
      _state.inertia.positionLerp = Math.min(_state.inertia.positionLerp, 0.015);
      return;
    }

    var onset = _state.pacing.silenceBias * 0.004;
    if (_rand() < onset) {
      var dur = MIN_SILENCE_WINDOW_MS + _rand() * (MAX_SILENCE_WINDOW_MS - MIN_SILENCE_WINDOW_MS);
      _silenceUntil = now + dur;
      var bus = _bus();
      bus && bus.emit("passenger:silenceWindowStarted", { durationMs: dur });
      global.setTimeout(function () {
        var b = _bus();
        b && b.emit("passenger:silenceWindowEnded", {});
      }, dur);
    }
  }

  // ── resolveAttentionTargets ───────────────────────────────────────────────
  // Probabilistic soft-focus. Blends atmospheric drift with AttentionGeography
  // field weights. The camera notices — it does not lock.
  function resolveAttentionTargets() {
    var now = performance.now();
    if (now - _state.environmentalMemory.lastAttentionShift < DEFAULT_LINGER_DURATION_MS) return;

    var stability = _state.attention.stability;
    var ambient   = _frame.drift.ambientIntensity;
    stability = _lerp(stability, 0.5 + ambient * 0.4, 0.1);
    _state.attention.stability = stability;

    var chance = (1 - stability) * (1 - _state.pacing.silenceBias) * 0.08;
    if (_rand() < chance) {
      _state.environmentalMemory.lastAttentionShift = now;

      var modeDef  = MODE_DEFS[_state.mode] || MODE_DEFS["window-drift"];
      var lingerMs = modeDef.lingerMs;

      // ── AttentionGeography influence ──────────────────────────────────
      var ag  = SBE.AttentionGeography;
      var top = ag && ag.getTopField();

      if (top && _frame.lng !== 0) {
        var dist = ag.getDistanceTo(top.id, _frame.lng, _frame.lat);
        // Influence falls off with distance — strongest within radius
        var proximity = _clamp(1 - dist / (top.radius * 8), 0, 1);

        if (proximity > 0.05) {
          // Soft bearing pull toward field — not a lock, a lean
          var fieldBearing  = ag.getBearingTo(top.id, _frame.lng, _frame.lat);
          var bearingInfluence = proximity * (top.cinematicBias.framingPriority || 1) * 0.35;
          _frame.tBearing = _lerp(_frame.tBearing, fieldBearing, bearingInfluence);

          // Linger longer near significant fields
          lingerMs = lingerMs * (top.cinematicBias.lingerMultiplier || 1.0) * _clamp(proximity * 2, 0.5, 1.5);

          // Zoom softens near high-stabilization fields
          var stabBias = top.cinematicBias.stabilizationBias || 1.0;
          _frame.tZoom = _clamp(_frame.tZoom - 0.1 * stabBias * proximity, 11.5, 15.5);

          // Update attention state
          _state.attention.targetId     = top.id;
          _state.attention.lingerWeight = proximity;
        }
      } else {
        // No field influence — pure atmospheric drift
        _frame.tBearing += (_rand() - 0.5) * 18;
        _frame.tPitch    = _clamp(modeDef.pitchTarget + (_rand() - 0.5) * 8, 0, 60);
        _state.attention.targetId = null;
      }

      var mood = _frame.atmosphere.mood;
      if (mood.includes("fog") || mood.includes("storm") || mood.includes("rain")) {
        _frame.tZoom = _clamp(_frame.tZoom - 0.15 * _rand(), 11.5, 15.5);
      }

      var bus = _bus();
      bus && bus.emit("passenger:attentionChanged", {
        targetId: _state.attention.targetId,
        linger:   lingerMs,
      });
    }
  }

  // ── applyAttentionInfluence — continuous soft field modulation ────────────
  // Runs every tick (not just on attention shifts). Subtly biases silence
  // probability and inertia based on the top attention field.
  function applyAttentionInfluence() {
    var ag  = SBE.AttentionGeography;
    if (!ag) return;

    ag.tick();  // let geography evaluate field weights

    var top = ag.getTopField();
    if (!top || _frame.lng === 0) return;

    var dist      = ag.getDistanceTo(top.id, _frame.lng, _frame.lat);
    var proximity = _clamp(1 - dist / (top.radius * 6), 0, 1);
    if (proximity < 0.02) return;

    var ab = top.atmosphericBias;

    // Silence zones amplify silence probability near field
    var silA = (ab.silenceAffinity || 1.0);
    _state.pacing.silenceBias = _clamp(
      _lerp(_state.pacing.silenceBias, _state.pacing.silenceBias * silA, proximity * 0.15),
      0.1, 0.7
    );

    // Stabilization bias softens inertia near high-priority fields
    var stabBias = (top.cinematicBias.stabilizationBias || 1.0);
    var softening = proximity * stabBias * 0.03;
    _state.inertia.positionLerp = _clamp(_state.inertia.positionLerp - softening, 0.008, 0.12);
    _state.inertia.rotationLerp = _clamp(_state.inertia.rotationLerp - softening * 0.5, 0.006, 0.08);
  }

  // ── computeEnvironmentalLinger ────────────────────────────────────────────
  function computeEnvironmentalLinger() {
    var velocityContrib = _state.pacing.velocity * 0.001;
    _state.environmentalMemory.accumulatedFatigue = _clamp(
      _state.environmentalMemory.accumulatedFatigue + velocityContrib,
      0, 1
    );

    // High ambient (night) + fatigue → observer pause
    if (_frame.drift.ambientIntensity > 0.7 &&
        _state.environmentalMemory.accumulatedFatigue > 0.6 &&
        _state.mode === "window-drift" &&
        performance.now() > _lingerUntil) {
      _setMode("observer-pause");
    }
  }

  // ── advanceBearingDrift ───────────────────────────────────────────────────
  function advanceBearingDrift(dtMs) {
    var modeDef   = MODE_DEFS[_state.mode] || MODE_DEFS["window-drift"];
    var mul       = _frame.drift.pulseMultiplier || 1.0;
    var inSilence = performance.now() < _silenceUntil;
    if (!inSilence) {
      _bearingPhase += modeDef.bearingDrift * mul * (dtMs / PASSENGER_TICK_MS);
      _frame.tBearing += Math.sin(_bearingPhase * 0.7) * modeDef.bearingDrift * mul;
    }
  }

  // ── Push frame to Mapbox ─── only when authority is ours ─────────────────
  function _pushFrameToMap() {
    var map = _getMap();
    if (!map) return;

    if (!map.isMoving()) {
      map.jumpTo({
        center:  [_frame.lng, _frame.lat],
        zoom:    _frame.zoom,
        bearing: _frame.bearing,
        pitch:   _frame.pitch,
      });
    } else {
      // Map is moving externally — re-seed targets so we stay warm
      var c = map.getCenter();
      _frame.tLng     = _frame.lng     = c.lng;
      _frame.tLat     = _frame.lat     = c.lat;
      _frame.tZoom    = _frame.zoom    = map.getZoom();
      _frame.tBearing = _frame.bearing = map.getBearing();
      _frame.tPitch   = _frame.pitch   = map.getPitch();
    }
  }

  // ── Seed frame from current map position ──────────────────────────────────
  function _seedFrameFromMap() {
    var map = _getMap();
    if (!map) return;
    var c = map.getCenter();
    _frame.lng = _frame.tLng = c.lng;
    _frame.lat = _frame.tLat = c.lat;
    _frame.zoom    = _frame.tZoom    = map.getZoom();
    _frame.bearing = _frame.tBearing = map.getBearing();
    _frame.pitch   = _frame.tPitch   = map.getPitch();
  }

  // ── RAF tick ──────────────────────────────────────────────────────────────
  // Frame state updates unconditionally — the system is always warm.
  // Viewport authority check gates only the final map push.
  function _tick(ts) {
    global.requestAnimationFrame(_tick);
    if (ts - _lastTick < PASSENGER_TICK_MS) return;
    var dtMs = ts - _lastTick;
    _lastTick = ts;

    // Always sample and update — regardless of enabled state
    sampleDrift();
    sampleAtmosphere();
    sampleWorldState();
    computeFrameVelocity();
    computeFrameHeading();
    applyDriftCoupling();
    updateFrame();

    // Active passenger behaviors — only when enabled
    if (_state.enabled) {
      evaluateSilenceWindow();
      applyAttentionInfluence();
      applyScenicPersistence();
      evaluateReturnGlance();
      resolveAttentionTargets();
      computeEnvironmentalLinger();
      advanceBearingDrift(dtMs);

      // Only push to map if we hold viewport authority
      if (SBE.ViewportAuthority.owns("passenger")) {
        _pushFrameToMap();
      }
    }
  }

  // ── applyScenicPersistence ────────────────────────────────────────────────
  // Consumes ScenicPersistence influence to soften bearing/zoom release and
  // apply residue to silence bias. Scenic drag resists frame target updates.
  function applyScenicPersistence() {
    var sp  = SBE.ScenicPersistence;
    if (!sp) return;
    var top = SBE.AttentionGeography && SBE.AttentionGeography.getTopField();
    var inf = sp.tick(_frame, _state, top);
    if (!inf) return;

    // Scenic drag: resist bearing target movement — camera holds its look
    // Instead of instantly adopting the new tBearing, we pull it back toward
    // where we currently are, weighted by drag. High persistence = heavy drag.
    if (inf.scenicDrag > 0.02) {
      _frame.tBearing = _lerp(_frame.tBearing, _frame.bearing, inf.scenicDrag * 0.18);
      _frame.tZoom    = _lerp(_frame.tZoom,    _frame.zoom,    inf.scenicDrag * 0.12);
    }

    // Residue: afterimage from recently departed field biases pacing
    if (inf.residue > 0.05) {
      _state.pacing.silenceBias = _clamp(
        _state.pacing.silenceBias + inf.residue * 0.08,
        0.1, 0.72
      );
      // Residue also softens inertia slightly — space left its mark
      _state.inertia.positionLerp = _clamp(
        _state.inertia.positionLerp - inf.residue * 0.005,
        0.006, 0.12
      );
    }
  }

  // ── evaluateReturnGlance ──────────────────────────────────────────────────
  // Probabilistic subconscious bearing lean back toward a recently-left field.
  // Rare, soft, never dramatic.
  function evaluateReturnGlance() {
    var sp = SBE.ScenicPersistence;
    if (!sp) return;
    var glance = sp.evaluateReturnGlance(_frame);
    if (!glance) return;
    // Apply as a gentle nudge — not a target lock
    _frame.tBearing = _lerp(_frame.tBearing, glance.bearing, glance.strength);
  }

  // ── Mode transitions ──────────────────────────────────────────────────────
  function _setMode(newMode) {
    if (!MODE_DEFS[newMode]) return;
    if (_state.mode === newMode) return;

    var prev = _state.mode;
    _state.mode  = newMode;
    _lingerUntil = performance.now() + (MODE_DEFS[newMode].lingerMs || DEFAULT_LINGER_DURATION_MS);

    var modeDef = MODE_DEFS[newMode];
    _frame.tPitch = modeDef.pitchTarget;
    _frame.tZoom  = _clamp(_frame.tZoom + modeDef.zoomBias, 11.5, 15.5);

    if (newMode === "observer-pause" || newMode === "distant-witness") {
      _state.environmentalMemory.accumulatedFatigue *= 0.4;
    }

    var bus = _bus();
    bus && bus.emit("passenger:modeChanged", { mode: newMode, prev: prev, transitType: _state.transitType });
    console.log("[PassengerMode] mode →", newMode, "transit:", _state.transitType);
  }

  // ── Atmosphere / drift event handlers ────────────────────────────────────
  function _onAtmosphere(evt) {
    if (!evt || !evt.state) return;
    // Always update frame snapshot, even while disabled
    _frame.atmosphere.mood      = evt.state.mood      || "neutral";
    _frame.atmosphere.isNight   = !!evt.state.isNight;
    _frame.atmosphere.lightTemp = evt.state.lightTemp || "neutral";

    if (!_state.enabled) return;

    var mood = _frame.atmosphere.mood;
    if ((mood.includes("fog") || mood.includes("storm")) &&
        _state.mode === "window-drift" &&
        performance.now() > _lingerUntil) {
      _setMode(mood.includes("storm") ? "hypnotic-transit" : "observer-pause");
    }
    if ((mood === "clear" || mood === "day" || mood === "golden") &&
        _state.mode === "observer-pause" &&
        performance.now() > _lingerUntil) {
      _setMode("window-drift");
    }
  }

  function _onDriftChanged(evt) {
    if (!evt || !evt.state) return;
    // Always update frame snapshot
    _frame.drift.driftLabel       = evt.state.driftLabel || "";
    _frame.drift.ambientIntensity = evt.state.ambientIntensity;
    _frame.drift.pulseMultiplier  = evt.state.pulseMultiplier;
    _frame.drift.soundtrackEnergy = evt.state.soundtrackEnergy;

    if (!_state.enabled) return;

    var label = _frame.drift.driftLabel;
    if ((label === "Deep Night" || label === "Still Dawn") &&
        _state.mode === "window-drift" &&
        performance.now() > _lingerUntil &&
        _rand() < 0.35) {
      _setMode("distant-witness");
    }
    if ((label === "Morning" || label === "Midday") &&
        _state.mode === "distant-witness" &&
        performance.now() > _lingerUntil) {
      _setMode("window-drift");
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function enable() {
    if (_state.enabled) return;
    _state.enabled = true;
    // Frame is already warm — no seed needed, no cold-start lag
    SBE.ViewportAuthority.claim("passenger");
    console.log("[PassengerMode] enabled — frame warm, authority claimed");
  }

  function disable() {
    if (!_state.enabled) return;
    _state.enabled = false;
    SBE.ViewportAuthority.release("passenger");
    console.log("[PassengerMode] disabled — authority released");
  }

  function setMode(mode)      { _setMode(mode); }
  function getState()         { return _state; }
  function getFrame()         { return _frame; }

  function setTransitType(type) {
    if (!TRANSIT_DEFS[type]) return;
    _state.transitType = type;
    console.log("[PassengerMode] transitType →", type);
  }

  function setFrameTarget(opts) {
    if (opts.lng     !== undefined) _frame.tLng     = opts.lng;
    if (opts.lat     !== undefined) _frame.tLat     = opts.lat;
    if (opts.zoom    !== undefined) _frame.tZoom    = _clamp(opts.zoom, 11.5, 15.5);
    if (opts.bearing !== undefined) _frame.tBearing = opts.bearing;
    if (opts.pitch   !== undefined) _frame.tPitch   = _clamp(opts.pitch, 0, 60);
  }

  function init() {
    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      bus.on("world:atmosphereChanged", _onAtmosphere);
      bus.on("world:driftChanged",      _onDriftChanged);
    }

    // Hydrate frame from current world state immediately
    _seedFrameFromMap();
    sampleDrift();
    sampleAtmosphere();

    global.requestAnimationFrame(_tick);

    console.log("[PassengerMode] initialized — frame warm, authority:", SBE.ViewportAuthority.active,
      "mode:", _state.mode, "drift:", _frame.drift.driftLabel || "—");
  }

  SBE.PassengerMode = {
    init:           init,
    enable:         enable,
    disable:        disable,
    setMode:        setMode,
    setTransitType: setTransitType,
    setFrameTarget: setFrameTarget,
    getState:       getState,
    getFrame:       getFrame,
    // Expose update functions for external orchestration
    updateFrame:             updateFrame,
    sampleWorldState:        sampleWorldState,
    sampleAtmosphere:        sampleAtmosphere,
    sampleDrift:             sampleDrift,
    computeFrameVelocity:    computeFrameVelocity,
    computeFrameHeading:     computeFrameHeading,
    applyAttentionInfluence:  applyAttentionInfluence,
    applyScenicPersistence:   applyScenicPersistence,
    evaluateReturnGlance:     evaluateReturnGlance,
  };

})(window);
