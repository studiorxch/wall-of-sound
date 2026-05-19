(function initClusterEvents(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Cluster Events System (ClusterEvents v1.0.0) ───────────────────────────
  //
  // Temporary ecological pressure blooms: seed → grow → peak → decay → dissolve.
  // Creates social convergence, density anomalies, and soundtrack escalation
  // without scripted narrative or explicit player objectives.
  //
  // Integration:
  //   tick(state, dt, now)          — every ~3s throttle (lifecycle + auto-spawn)
  //   influenceActors(state)        — every frame (gentle target attraction)
  //   contributeDistrictPressure(eco, events) — in 3s throttle after other pressure
  //   contributeMusicEcology(eco, events)     — every frame
  //   spawn(type, opts, now)        — manual or auto spawn
  //   getNearby(x, y, state)        — query nearby active events
  //   getMetrics(state)             — aggregate metrics

  // ── Event type templates ───────────────────────────────────────────────────
  var EVENT_TEMPLATES = {
    rooftop: {
      radius:   420,
      duration: 7200,   // real seconds
      actorBias:    { nightlife: 1.60, wanderer: 0.90, commuter: 0.20, ghost: 0.55 },
      pressureBias: { nightlife: 0.40, traffic:  0.10, delivery: -0.05 },
      musicBias:    { energy:    0.25, density:  0.38, brightness: 0.20 },
      cameraInterest: 0.72,
      spawnCondition: { phases: ["night", "dusk"], minNightlife: 0.58 },
    },
    vendor: {
      radius:   280,
      duration: 3600,
      actorBias:    { wanderer: 1.40, commuter: 1.20, delivery: 0.60, nightlife: 0.40 },
      pressureBias: { nightlife: 0.05, traffic:  0.20, delivery:  0.15 },
      musicBias:    { energy:    0.12, density:  0.22, brightness: 0.10 },
      cameraInterest: 0.40,
      spawnCondition: { phases: ["day", "dusk", "dawn"], minEnergy: 0.38 },
    },
    transitDelay: {
      radius:   350,
      duration: 1800,
      actorBias:    { commuter: 2.00, delivery: 1.20, wanderer: 0.30, nightlife: 0.10 },
      pressureBias: { nightlife: 0.00, traffic:  0.55, delivery:  0.12 },
      musicBias:    { energy:    0.18, density:  0.30, brightness: -0.10 },
      cameraInterest: 0.50,
      spawnCondition: { phases: ["dawn", "day", "dusk"], minTraffic: 0.58 },
    },
    rainShelter: {
      radius:   200,
      duration: 2400,
      actorBias:    { wanderer: 1.80, ghost: 1.20, commuter: 1.40, nightlife: 0.50 },
      pressureBias: { nightlife: 0.05, traffic: -0.10, delivery: -0.12 },
      musicBias:    { energy:    0.08, density:  0.15, brightness: -0.15 },
      cameraInterest: 0.38,
      spawnCondition: { minWeather: 0.35 },
    },
    streetPerformance: {
      radius:   320,
      duration: 5400,
      actorBias:    { wanderer: 2.00, nightlife: 1.30, ghost: 0.80, commuter: 0.50 },
      pressureBias: { nightlife: 0.20, traffic:  0.08, delivery:  0.02 },
      musicBias:    { energy:    0.30, density:  0.45, brightness: 0.30 },
      cameraInterest: 0.80,
      spawnCondition: { phases: ["day", "dusk", "night"], minEnergy: 0.48 },
    },
    nightlifeSpill: {
      radius:   500,
      duration: 9000,
      actorBias:    { nightlife: 2.20, ghost: 1.00, wanderer: 1.20, commuter: 0.10 },
      pressureBias: { nightlife: 0.55, traffic:  0.15, delivery: -0.05 },
      musicBias:    { energy:    0.35, density:  0.50, brightness: 0.25 },
      cameraInterest: 0.85,
      spawnCondition: { phases: ["night", "lateNight"], minNightlife: 0.72 },
    },
  };

  // Minimum real spacing between event centers (world units)
  var MIN_EVENT_SPACING = 600;
  var _nextEventId = 1;

  // ── Event factory ──────────────────────────────────────────────────────────
  function spawn(type, opts, now) {
    var tmpl = EVENT_TEMPLATES[type];
    if (!tmpl) return null;
    var t = now != null ? now : (global.performance ? performance.now() : 0);

    var ev = {
      id:             "evt_" + (_nextEventId++),
      type:           type,
      x:              opts.x           || 0,
      y:              opts.y           || 0,
      radius:         opts.radius      || tmpl.radius,
      state:          "seed",
      strength:       0.0,
      maxStrength:    opts.maxStrength || 0.80 + Math.random() * 0.20,
      duration:       opts.duration    || tmpl.duration,
      startTime:      t,
      districtId:     opts.districtId  || "williamsburg",
      cameraInterest: tmpl.cameraInterest || 0.5,
      // Deep-copy bias objects so templates remain pristine
      actorBias:    Object.assign({}, tmpl.actorBias),
      pressureBias: Object.assign({}, tmpl.pressureBias),
      musicBias:    Object.assign({}, tmpl.musicBias),
    };
    return ev;
  }

  // ── Lifecycle state resolution ─────────────────────────────────────────────
  // elapsed in real seconds. Returns { state, strength } for that moment.
  function _resolveLifecycle(ev, elapsedSec) {
    var d = ev.duration;
    var frac = elapsedSec / d;
    var s, st;

    if (frac < 0.10) {
      st = "seed";
      s  = _smoothstep(0, 0.10, frac) * ev.maxStrength * 0.15;
    } else if (frac < 0.45) {
      st = "grow";
      s  = _smoothstep(0.10, 0.45, frac) * ev.maxStrength;
    } else if (frac < 0.65) {
      st = "peak";
      s  = ev.maxStrength;
    } else if (frac < 1.0) {
      st = "decay";
      s  = _smoothstep(1.0, 0.65, frac) * ev.maxStrength;
    } else {
      st = "dissolve";
      s  = 0;
    }
    return { state: st, strength: Math.max(0, s) };
  }

  function _smoothstep(edge0, edge1, x) {
    var t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // ── Accessor helpers ───────────────────────────────────────────────────────
  function _getEvents(state) {
    return (state.world && state.world.clusterEvents && state.world.clusterEvents.events) || [];
  }

  function _activeEvents(state) {
    return _getEvents(state).filter(function (ev) {
      return ev.state !== "dissolve";
    });
  }

  // ── Auto-spawn: check district conditions ─────────────────────────────────
  function _tryAutoSpawn(state, now) {
    var cfg = state.world && state.world.clusterEvents;
    if (!cfg) return;

    var events = cfg.events;
    if (events.length >= (cfg.maxEvents || 12)) return;

    var eco     = state.world.ecology;
    var rhythm  = state.world.rhythm;
    var phase   = rhythm ? rhythm.phase : "day";
    var weather = eco && eco.weather ? eco.weather.intensity : 0;

    var DP = global.SBE && SBE.DistrictPressure;
    if (!DP) return;

    Object.values(DP.DISTRICTS).forEach(function (d) {
      var dp = eco && eco.pressure && eco.pressure.districts[d.id];
      if (!dp) return;

      // Count active events already in this district
      var districtActive = events.filter(function (ev) {
        return ev.districtId === d.id && ev.state !== "dissolve";
      }).length;
      if (districtActive >= 3) return;

      // Evaluate each event type for this district
      Object.keys(EVENT_TEMPLATES).forEach(function (type) {
        // Already too many events?
        if (events.length >= (cfg.maxEvents || 12)) return;

        var tmpl = EVENT_TEMPLATES[type];
        var cond = tmpl.spawnCondition || {};

        // Phase check
        if (cond.phases && cond.phases.length &&
            cond.phases.indexOf(phase) === -1) return;

        // Pressure threshold checks
        if (cond.minNightlife && dp.nightlife < cond.minNightlife) return;
        if (cond.minTraffic   && dp.traffic   < cond.minTraffic)   return;
        if (cond.minEnergy    && dp.energy    < cond.minEnergy)     return;
        if (cond.minWeather   && weather      < cond.minWeather)    return;

        // Base spawn probability — low to prevent saturation
        var prob = 0.0008;  // per 3s tick ≈ ~0.08% chance per district per type
        // Boost probability for strong conditions
        if (dp.energy    > 0.70) prob *= 2.0;
        if (dp.nightlife > 0.75) prob *= 1.8;
        if (dp.traffic   > 0.75) prob *= 1.5;

        if (Math.random() > prob) return;

        // Candidate position: random within district
        var angle = Math.random() * Math.PI * 2;
        var r     = Math.random() * d.radius * 0.75;
        var cx    = d.x + Math.cos(angle) * r;
        var cy    = d.y + Math.sin(angle) * r;

        // Spacing check — min 600wu from all existing events
        var tooClose = events.some(function (ev) {
          return Math.hypot(cx - ev.x, cy - ev.y) < MIN_EVENT_SPACING;
        });
        if (tooClose) return;

        var ev = spawn(type, { x: cx, y: cy, districtId: d.id }, now);
        if (ev) events.push(ev);
      });
    });
  }

  // ── Main tick (call in ~3s throttle) ──────────────────────────────────────
  // dt in real seconds, now in ms.
  function tick(state, dt, now) {
    var cfg = state.world && state.world.clusterEvents;
    if (!cfg || !cfg.enabled) return;

    var t = now != null ? now : (global.performance ? performance.now() : 0);

    // ── Advance lifecycle for all events ──────────────────────────────────
    var surviving = [];
    cfg.events.forEach(function (ev) {
      var elapsedSec = (t - ev.startTime) / 1000;
      var lc         = _resolveLifecycle(ev, elapsedSec);
      ev.state    = lc.state;
      ev.strength = lc.strength;

      if (ev.state !== "dissolve") {
        surviving.push(ev);
      }
    });
    cfg.events = surviving;

    // ── Apply district pressure from active events ─────────────────────────
    _applyDistrictPressure(state, cfg.events);

    // ── Try auto-spawning new events ───────────────────────────────────────
    _tryAutoSpawn(state, t);

    // ── Update metrics ─────────────────────────────────────────────────────
    _updateMetrics(cfg);
  }

  // ── Apply district pressure from events ───────────────────────────────────
  function _applyDistrictPressure(state, events) {
    var eco = state.world && state.world.ecology;
    if (!eco || !eco.pressure) return;

    events.forEach(function (ev) {
      if (ev.strength < 0.01) return;
      var dp = eco.pressure.districts[ev.districtId];
      if (!dp) return;
      var pb = ev.pressureBias;
      var s  = ev.strength;
      if (pb.nightlife) dp.nightlife = Math.max(0, Math.min(1, dp.nightlife + pb.nightlife * s * 0.06));
      if (pb.traffic)   dp.traffic   = Math.max(0, Math.min(1, dp.traffic   + pb.traffic   * s * 0.06));
      if (pb.delivery)  dp.delivery  = Math.max(0, Math.min(1, dp.delivery  + pb.delivery  * s * 0.06));
    });
  }

  // ── Influence abstract actors (call every frame — lightweight) ────────────
  // Gently redirects actor targets toward nearby events they're attracted to.
  // Never forces movement — only biases the next retarget pick.
  function influenceActors(state) {
    var events = _activeEvents(state);
    if (!events.length) return;

    var actors = state.world && state.world.abstractActors;
    if (!actors || !actors.length) return;

    // Per-frame — sample every 3rd actor to reduce cost at 4000 actors
    var step = actors.length > 1500 ? 3 : actors.length > 600 ? 2 : 1;

    for (var i = 0; i < actors.length; i += step) {
      var actor = actors[i];
      if (!actor || actor.realized) continue;

      var bestEv    = null;
      var bestScore = 0;

      for (var j = 0; j < events.length; j++) {
        var ev = events[j];
        if (ev.state === "seed") continue; // seeds don't attract yet

        var dist  = Math.hypot(actor.wx - ev.x, actor.wy - ev.y);
        var reach = ev.radius * 2.8;
        if (dist > reach) continue;

        var archBias  = (ev.actorBias && ev.actorBias[actor.archetype]) || 0.5;
        var distFactor = Math.max(0, 1 - dist / reach);
        var score      = ev.strength * archBias * distFactor;

        if (score > bestScore) { bestScore = score; bestEv = ev; }
      }

      if (bestEv && bestScore > 0.12) {
        // Low probability redirect — preserves emergence, avoids determinism
        if (Math.random() < bestScore * 0.06 * step) {
          var angle = Math.random() * Math.PI * 2;
          var r     = Math.random() * bestEv.radius * 0.65;
          actor.tx  = bestEv.x + Math.cos(angle) * r;
          actor.ty  = bestEv.y + Math.sin(angle) * r;
        }
      }
    }
  }

  // ── Contribute to music ecology (call every frame) ─────────────────────────
  function contributeMusicEcology(eco, events) {
    var me = eco && eco.musicEcology;
    if (!me || !me.enabled) return;

    var totalEnergy = 0, totalDensity = 0, totalBrightness = 0;
    var peakStrength = 0;

    events.forEach(function (ev) {
      if (!ev.musicBias || ev.strength < 0.01) return;
      var s = ev.strength;
      totalEnergy     += (ev.musicBias.energy     || 0) * s;
      totalDensity    += (ev.musicBias.density     || 0) * s;
      totalBrightness += (ev.musicBias.brightness  || 0) * s;
      if (s > peakStrength) peakStrength = s;
    });

    me._clusterEnergy     = Math.min(1, totalEnergy);
    me._clusterDensity    = Math.min(1, totalDensity);
    me._clusterBrightness = Math.min(1, totalBrightness);
    me._clusterPeak       = peakStrength;
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  function _updateMetrics(cfg) {
    var events = cfg.events;
    var m      = cfg.metrics;
    if (!m) return;
    var active = events.filter(function (ev) { return ev.state !== "dissolve"; });
    var peak   = active.filter(function (ev) { return ev.state === "peak"; });
    var sum    = active.reduce(function (s, ev) { return s + ev.strength; }, 0);
    m.active      = active.length;
    m.peak        = peak.length;
    m.avgStrength = active.length ? sum / active.length : 0;
  }

  // ── Public query API ───────────────────────────────────────────────────────
  function getNearby(x, y, state) {
    return _getEvents(state).filter(function (ev) {
      return ev.state !== "dissolve" &&
             Math.hypot(x - ev.x, y - ev.y) < ev.radius * 1.5;
    });
  }

  function getMetrics(state) {
    var cfg = state.world && state.world.clusterEvents;
    if (!cfg || !cfg.metrics) return { active: 0, peak: 0, avgStrength: 0 };
    return cfg.metrics;
  }

  function getActiveEvents(state) {
    return _activeEvents(state);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.ClusterEvents = {
    tick:                      tick,
    spawn:                     spawn,
    influenceActors:           influenceActors,
    contributeMusicEcology:    contributeMusicEcology,
    getNearby:                 getNearby,
    getMetrics:                getMetrics,
    getActiveEvents:           getActiveEvents,
    EVENT_TEMPLATES:           EVENT_TEMPLATES,
  };

})(window);
