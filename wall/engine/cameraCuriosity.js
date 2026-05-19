(function initCameraCuriosity(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Camera Curiosity System (CameraCuriosity v1.0.0 / Passenger v1.0.0) ──────
  //
  // An emotionally guided documentary camera intelligence.
  // The camera follows SIGNIFICANCE, not motion.
  //
  // State machine:  idle → curious → investigate → observe → release → idle
  //
  // When cfg.drivingCamera is true, writes to cam.targetX/Y/Zoom.
  //
  // Passenger modes:  wander | documentary (default) | hunter | zen
  //
  // Validation systems:
  //   • Cooldown memory        — prevents obsessive revisiting
  //   • Target stickiness      — rewards loyalty, punishes jitter
  //   • Camera velocity clamp  — no teleport feeling
  //   • Zoom deadzone          — zoom becomes rare and meaningful
  //   • Observe drift          — handheld documentary micro-motion
  //   • Release smoothing      — gradual emotional exit
  //   • Idle drift intelligence — ecologically weighted wandering

  // ── Passenger mode presets ────────────────────────────────────────────────────
  var PASSENGER_MODES = {
    wander: {
      threshCurious:     0.15,
      threshInvestigate: 0.28,
      lingerScale:       0.65,
      cooldownMs:        25000,
      zoomScale:         0.82,
      idleDriftEnergy:   1.20,
      emergeThresh:      0.88,
    },
    documentary: {
      threshCurious:     0.22,
      threshInvestigate: 0.42,
      lingerScale:       1.00,
      cooldownMs:        60000,
      zoomScale:         1.00,
      idleDriftEnergy:   1.00,
      emergeThresh:      0.92,
    },
    hunter: {
      threshCurious:     0.16,
      threshInvestigate: 0.30,
      lingerScale:       0.45,
      cooldownMs:        18000,
      zoomScale:         1.25,
      idleDriftEnergy:   1.50,
      emergeThresh:      0.80,
    },
    zen: {
      threshCurious:     0.32,
      threshInvestigate: 0.58,
      lingerScale:       2.00,
      cooldownMs:        120000,
      zoomScale:         0.65,
      idleDriftEnergy:   0.60,
      emergeThresh:      0.95,
    },
  };

  // ── Linger durations (real seconds) per event type ────────────────────────────
  var LINGER_DURATIONS = {
    rooftop:           { min: 45,  max: 90  },
    vendor:            { min: 20,  max: 40  },
    streetPerformance: { min: 60,  max: 120 },
    nightlifeSpill:    { min: 90,  max: 180 },
    transitDelay:      { min: 15,  max: 30  },
    rainShelter:       { min: 18,  max: 35  },
    actorDensity:      { min: 20,  max: 50  },
    district:          { min: 30,  max: 60  },
    flowHotspot:       { min: 15,  max: 30  },
    _default:          { min: 20,  max: 45  },
  };

  // Target zoom per node type
  var ZOOM_BY_TYPE = {
    clusterEvent: 0.55,
    actorDensity: 0.48,
    district:     0.30,
    flowHotspot:  0.45,
  };

  // Camera easing rates
  var EASE_INVESTIGATE = 0.018;
  var EASE_OBSERVE     = 0.006;
  var EASE_IDLE        = 0.008;
  var EASE_ZOOM        = 0.012;

  var IDLE_DRIFT_INTERVAL_SEC = 40;

  var EVAL_INTERVAL_MIN = 2000;
  var EVAL_INTERVAL_MAX = 4000;

  // ── Config accessor ────────────────────────────────────────────────────────────
  function _cfg(state) {
    return state.world && state.world.cameraCuriosity;
  }

  function _modeCfg(cfg) {
    return PASSENGER_MODES[cfg.passengerMode] || PASSENGER_MODES.documentary;
  }

  // ── Node factory ──────────────────────────────────────────────────────────────
  var _nextNodeId = 1;
  function _makeNode(type, x, y, score, opts) {
    opts = opts || {};
    return {
      id:             "cn_" + (_nextNodeId++),
      type:           type,
      x:              x,
      y:              y,
      score:          score,
      radius:         opts.radius         || 300,
      strength:       opts.strength       || score,
      eventState:     opts.eventState     || null,
      eventType:      opts.eventType      || null,
      districtId:     opts.districtId     || null,
      cameraInterest: opts.cameraInterest || score,
      persistence:    0,
    };
  }

  // ── Node key (for cooldown/persistence matching) ───────────────────────────────
  function _nodeKey(node) {
    if (!node) return "";
    return node.type + ":" + (node.districtId || (Math.round(node.x / 200) + "," + Math.round(node.y / 200)));
  }

  // ── Node collection ────────────────────────────────────────────────────────────
  function collectNodes(state, now) {
    var nodes = [];
    var eco   = state.world && state.world.ecology;
    if (!eco) return nodes;

    var me = eco.musicEcology;
    var musicEnergy  = (me && me._rhythmEnergy)  || 0;
    var flowPressure = 0;
    if (SBE.TrafficFlowField) {
      var fm = SBE.TrafficFlowField.getMetrics(state);
      flowPressure = (fm && fm.avgPressure) || 0;
    }

    // ── 1. Cluster events ────────────────────────────────────────────────────────
    var evCfg = state.world && state.world.clusterEvents;
    if (evCfg && evCfg.events) {
      evCfg.events.forEach(function (ev) {
        if (ev.state === "dissolve" || ev.strength < 0.05) return;
        var stateM = ev.state === "peak" ? 1.0
                   : ev.state === "grow" ? 0.72
                   : ev.state === "seed" ? 0.12 : 0.40;
        var score =
          ev.strength       * stateM * 0.30 +
          ev.cameraInterest * stateM * 0.25 +
          flowPressure               * 0.10 +
          musicEnergy                * 0.10 +
          (ev.state === "peak"       ? 0.15 : 0);
        nodes.push(_makeNode("clusterEvent", ev.x, ev.y, Math.min(1, score), {
          radius:         ev.radius,
          strength:       ev.strength,
          eventState:     ev.state,
          eventType:      ev.type,
          districtId:     ev.districtId,
          cameraInterest: ev.cameraInterest,
        }));
      });
    }

    // ── 2. Actor density hotspots ─────────────────────────────────────────────────
    var realized = state.world && state.world.realizedActors;
    if (realized && realized.size > 4) {
      var districtCounts  = {};
      var districtCenters = {};
      realized.forEach(function (entry) {
        var w = (state.projectileWalkers || []).find(function (w) {
          return w.id === entry.walkerId;
        });
        if (!w) return;
        var d = entry.district || "williamsburg";
        if (!districtCounts[d]) { districtCounts[d] = 0; districtCenters[d] = { x: 0, y: 0 }; }
        districtCounts[d]++;
        districtCenters[d].x += w.x;
        districtCenters[d].y += w.y;
        if (entry.archetype === "nightlife") districtCounts[d] += 0.5;
      });
      Object.keys(districtCounts).forEach(function (d) {
        var count = districtCounts[d];
        if (count < 5) return;
        var density = Math.min(1, count / 40);
        var cx = districtCenters[d].x / Math.max(1, Math.floor(count));
        var cy = districtCenters[d].y / Math.max(1, Math.floor(count));
        var score = density * 0.35 + musicEnergy * 0.10 + flowPressure * 0.08;
        nodes.push(_makeNode("actorDensity", cx, cy, Math.min(1, score), {
          radius:         200 + density * 200,
          strength:       density,
          districtId:     d,
          cameraInterest: density * 0.70,
        }));
      });
    }

    // ── 3. District pressure hotspots ─────────────────────────────────────────────
    var DP = global.SBE && SBE.DistrictPressure;
    if (DP && eco.pressure) {
      Object.values(DP.DISTRICTS).forEach(function (d) {
        var dp = eco.pressure.districts[d.id];
        if (!dp || dp.energy < 0.35) return;
        var score = dp.energy * 0.20 + dp.nightlife * 0.15 + musicEnergy * 0.08;
        nodes.push(_makeNode("district", d.x, d.y, Math.min(0.45, score), {
          radius:         d.radius,
          strength:       dp.energy,
          districtId:     d.id,
          cameraInterest: dp.energy * 0.50,
        }));
      });
    }

    nodes.sort(function (a, b) { return b.score - a.score; });
    return nodes;
  }

  // ── Persistence tracking ───────────────────────────────────────────────────────
  function _applyPersistence(cfg, nodes) {
    var history = cfg._nodeHistory || (cfg._nodeHistory = {});
    var seen    = {};
    nodes.forEach(function (node) {
      var key = _nodeKey(node);
      seen[key] = true;
      var h = history[key] || (history[key] = { count: 0, bonus: 0 });
      h.count++;
      h.bonus = Math.min(0.20, h.count * 0.04);
      node.persistence = h.count;
      node.score = Math.min(1, node.score + h.bonus);
    });
    Object.keys(history).forEach(function (key) {
      if (!seen[key]) {
        history[key].count = Math.max(0, history[key].count - 1);
        if (history[key].count === 0) delete history[key];
      }
    });
  }

  // ── Cooldown penalties ─────────────────────────────────────────────────────────
  // Recent targets receive a heavy score penalty unless score exceeds emergeThresh.
  function _applyCooldownPenalties(cfg, nodes, modeCfg) {
    var recent = cfg.recentTargets || [];
    var now    = cfg._nowMs || 0;
    if (!recent.length) return;

    nodes.forEach(function (node) {
      var key = _nodeKey(node);
      for (var i = 0; i < recent.length; i++) {
        var r = recent[i];
        if (r.key !== key) continue;
        if (now < r.cooldownUntil) {
          // Emergency override: break cooldown only for very strong signals
          if (node.score < (modeCfg.emergeThresh || 0.92)) {
            node.score *= 0.15;
            node._inCooldown = true;
          }
        }
        break;
      }
    });
  }

  // ── Target stickiness ─────────────────────────────────────────────────────────
  // Rewards the camera staying on its current subject.
  function _applyTargetStickiness(cfg, nodes) {
    if (!cfg.currentTarget) return;
    var currentKey   = _nodeKey(cfg.currentTarget);
    var multiplier   = cfg.targetPersistenceMultiplier || 1.35;
    var needsResort  = false;
    nodes.forEach(function (node) {
      if (_nodeKey(node) === currentKey) {
        node.score = Math.min(1, node.score * multiplier);
        needsResort = true;
      }
    });
    if (needsResort) {
      nodes.sort(function (a, b) { return b.score - a.score; });
    }
  }

  // ── Linger duration ───────────────────────────────────────────────────────────
  function _lingerDuration(node, modeCfg) {
    var range = LINGER_DURATIONS[node.eventType || node.type] || LINGER_DURATIONS._default;
    var ms = (range.min + Math.random() * (range.max - range.min)) * 1000;
    return ms * (modeCfg.lingerScale || 1.0);
  }

  // ── Record released target into cooldown ──────────────────────────────────────
  function _recordRelease(cfg, target, now, modeCfg) {
    if (!target) return;
    cfg.recentTargets = cfg.recentTargets || [];
    cfg.recentTargets.push({
      key:          _nodeKey(target),
      x:            target.x,
      y:            target.y,
      type:         target.type,
      districtId:   target.districtId,
      releasedAt:   now,
      cooldownUntil: now + (modeCfg.cooldownMs || 60000),
    });
    // Keep last 20
    if (cfg.recentTargets.length > 20) cfg.recentTargets.shift();
  }

  // ── Idle drift target ─────────────────────────────────────────────────────────
  // Ecologically weighted: prefers active districts + roads + corridors.
  // Avoids recently visited positions.
  function _pickIdleDriftTarget(state, cfg, modeCfg) {
    var DP  = global.SBE && SBE.DistrictPressure;
    var eco = state.world && state.world.ecology;
    if (!DP) return { x: 0, y: 0 };

    var districts = Object.values(DP.DISTRICTS);
    var recent    = cfg.recentTargets || [];
    var now       = cfg._nowMs || 0;

    // Weight: ecology pressure + flow energy, penalize recently visited
    var weights = districts.map(function (d) {
      var dp      = eco && eco.pressure && eco.pressure.districts[d.id];
      var energy  = dp ? dp.energy : 0.2;
      var nightl  = dp ? dp.nightlife : 0;
      var flowE   = (state.world.flow && state.world.flow.metrics && state.world.flow.metrics.avgPressure) || 0;

      var wander = energy * 0.50 + nightl * 0.25 + flowE * 0.15 + 0.10;
      wander *= (modeCfg.idleDriftEnergy || 1.0);

      // Cooldown penalty for recently targeted districts
      for (var i = 0; i < recent.length; i++) {
        if (recent[i].districtId === d.id && now < recent[i].cooldownUntil) {
          wander *= 0.20;
          break;
        }
      }
      return Math.max(0.05, wander);
    });

    var totalW = weights.reduce(function (s, w) { return s + w; }, 0);
    var r      = Math.random() * totalW;
    var chosen = districts[districts.length - 1];
    var acc    = 0;
    for (var i = 0; i < districts.length; i++) {
      acc += weights[i];
      if (r < acc) { chosen = districts[i]; break; }
    }

    // Bias toward roads/scenic points slightly off-center
    var angle = Math.random() * Math.PI * 2;
    var dist  = chosen.radius * (0.20 + Math.random() * 0.55);
    return {
      x: chosen.x + Math.cos(angle) * dist,
      y: chosen.y + Math.sin(angle) * dist,
    };
  }

  // ── State machine evaluation ───────────────────────────────────────────────────
  function _evaluate(cfg, nodes, now) {
    var best      = nodes.length ? nodes[0] : null;
    var bestScore = best ? best.score : 0;
    var modeCfg   = _modeCfg(cfg);

    cfg.metrics.nodes     = nodes.length;
    cfg.metrics.strongest = bestScore;

    switch (cfg.state) {
      case "idle":
        if (bestScore >= modeCfg.threshCurious) {
          cfg.state         = "curious";
          cfg.currentTarget = best;
          cfg.currentScore  = bestScore;
        }
        break;

      case "curious":
        if (bestScore >= modeCfg.threshInvestigate) {
          cfg.state         = "investigate";
          cfg.currentTarget = best;
          cfg.currentScore  = bestScore;
        } else if (bestScore < modeCfg.threshCurious * 0.6) {
          cfg.state         = "idle";
          cfg.currentTarget = null;
        }
        break;

      case "investigate":
        if (best) {
          cfg.currentTarget = best;
          cfg.currentScore  = bestScore;
        }
        // Bail out only if interest fully collapses
        if (bestScore < modeCfg.threshCurious * 0.5) {
          cfg.state         = "release";
          cfg.currentTarget = null;
        }
        break;

      case "observe":
        // Allow interest to extend linger if score grows during observation
        if (best && bestScore > (cfg.currentScore || 0) + 0.12) {
          cfg.lingerUntil  += 8000;  // bonus 8s
          cfg.currentScore  = bestScore;
        }
        // Cut short if interest evaporates
        if (bestScore < modeCfg.threshCurious * 0.5) {
          cfg.lingerUntil = now;
        }
        break;

      case "release":
        if (!cfg._releaseUntil) {
          cfg._releaseUntil = now + (cfg.releaseBlendTime || 6.0) * 1000 * (0.6 + Math.random() * 0.8);
        }
        if (now >= cfg._releaseUntil) {
          cfg.state         = "idle";
          cfg.currentTarget = null;
          cfg._releaseUntil = null;
        }
        break;
    }
  }

  // ── Velocity-clamped target movement ─────────────────────────────────────────
  function _moveTarget(cam, tx, ty, ease, scale, cfg) {
    var dx    = (tx - cam.targetX) * ease * scale;
    var dy    = (ty - cam.targetY) * ease * scale;
    var dist  = Math.hypot(dx, dy);
    var maxV  = (cfg.maxCameraVelocity || 14) * scale;
    if (dist > maxV) {
      var f = maxV / dist;
      dx *= f; dy *= f;
    }
    cam.targetX += dx;
    cam.targetY += dy;

    // Track camera velocity for metrics
    cfg._lastCamVelocity = dist;
  }

  // ── Zoom with deadzone ────────────────────────────────────────────────────────
  function _setTargetZoom(cam, targetZoom, ease, scale, cfg) {
    var deadzone = cfg.zoomDeadzone || 0.08;
    if (Math.abs(targetZoom - cam.targetZoom) < deadzone) return;
    cam.targetZoom += (targetZoom - cam.targetZoom) * ease * scale;
  }

  // ── Camera movement ────────────────────────────────────────────────────────────
  function _applyCameraMovement(cfg, state, dt, now) {
    if (!cfg.drivingCamera) return;
    var cam = state.camera;
    if (!cam) return;

    var target  = cfg.currentTarget;
    var scale   = dt * 60;
    var modeCfg = _modeCfg(cfg);

    // Record trail
    if (cfg.debugCameraTrail) {
      cfg._cameraTrail = cfg._cameraTrail || [];
      cfg._cameraTrail.push({ x: cam.x, y: cam.y, t: now });
      if (cfg._cameraTrail.length > 60) cfg._cameraTrail.shift();
    }

    switch (cfg.state) {

      case "idle": {
        if (!cfg._driftTarget || now >= cfg._nextDriftAt) {
          cfg._driftTarget = _pickIdleDriftTarget(state, cfg, modeCfg);
          cfg._nextDriftAt = now + IDLE_DRIFT_INTERVAL_SEC * 1000 / (modeCfg.idleDriftEnergy || 1.0);
          cfg._driftZoom   = (0.22 + Math.random() * 0.12) * (modeCfg.zoomScale || 1.0);
          cfg._driftZoom   = Math.max(0.15, Math.min(0.48, cfg._driftZoom));
        }
        _moveTarget(cam, cfg._driftTarget.x, cfg._driftTarget.y, EASE_IDLE, scale, cfg);
        _setTargetZoom(cam, cfg._driftZoom, EASE_ZOOM * 0.4, scale, cfg);
        break;
      }

      case "curious": {
        if (!target) break;
        // Gentle lean — not committed yet
        _moveTarget(cam, target.x, target.y, EASE_IDLE * 0.55, scale, cfg);
        break;
      }

      case "investigate": {
        if (!target) break;
        var tZoom = (ZOOM_BY_TYPE[target.type] || 0.45) * (modeCfg.zoomScale || 1.0);
        tZoom = Math.max(0.15, Math.min(0.80, tZoom));
        _moveTarget(cam, target.x, target.y, EASE_INVESTIGATE, scale, cfg);
        _setTargetZoom(cam, tZoom, EASE_ZOOM, scale, cfg);

        // Arrival check
        var arrivalDist = Math.hypot(cam.x - target.x, cam.y - target.y);
        var arrivalR    = (target.radius || 300) * 0.45;
        if (arrivalDist < arrivalR) {
          cfg.state       = "observe";
          cfg.lingerUntil = now + _lingerDuration(target, modeCfg);
          cfg._orbitAngle = Math.atan2(cam.y - target.y, cam.x - target.x);
          cfg._driftPhase = Math.random() * Math.PI * 2;
        }
        break;
      }

      case "observe": {
        if (!target) { cfg.state = "release"; break; }

        // Slow orbit
        cfg._orbitAngle = (cfg._orbitAngle || 0) + 0.00012 * scale;

        // Ultra-subtle handheld drift (multi-frequency, no visible shake)
        var dR   = cfg.observeDriftRadius || 24;
        var dS   = cfg.observeDriftSpeed  || 0.03;
        var dT   = now * dS * 0.001;
        var ph   = cfg._driftPhase || 0;
        var driftX = Math.sin(dT * 1.27 + ph) * Math.cos(dT * 0.73 + ph * 0.5) * dR;
        var driftY = Math.cos(dT * 0.91 + ph) * Math.sin(dT * 1.13 + ph * 0.7) * dR;

        var orbitR  = (target.radius || 300) * 0.18;
        var obsX    = target.x + Math.cos(cfg._orbitAngle) * orbitR + driftX;
        var obsY    = target.y + Math.sin(cfg._orbitAngle) * orbitR + driftY;
        var obsZoom = (ZOOM_BY_TYPE[target.type] || 0.45) * (modeCfg.zoomScale || 1.0);
        obsZoom = Math.max(0.15, Math.min(0.80, obsZoom));
        // Subtle slow zoom breathe (not enough to trigger deadzone unless it drifts)
        obsZoom += Math.sin(dT * 0.18) * 0.025;

        _moveTarget(cam, obsX, obsY, EASE_OBSERVE, scale, cfg);
        _setTargetZoom(cam, obsZoom, EASE_ZOOM * 0.35, scale, cfg);

        if (now >= cfg.lingerUntil) {
          _recordRelease(cfg, target, now, modeCfg);
          cfg.state         = "release";
          cfg._releaseUntil = null;
          cfg._releaseZoom  = Math.max(0.18, (cam.targetZoom || 0.4) - 0.10);
        }
        break;
      }

      case "release": {
        // Gradually widen and ease toward drift
        var rz = cfg._releaseZoom || Math.max(0.18, (cam.targetZoom || 0.4) - 0.06);
        cfg._releaseZoom = rz;

        // Blend toward a fresh drift point
        if (!cfg._releaseTarget) {
          cfg._releaseTarget = _pickIdleDriftTarget(state, cfg, modeCfg);
        }
        _moveTarget(cam, cfg._releaseTarget.x, cfg._releaseTarget.y, EASE_IDLE * 0.45, scale, cfg);
        _setTargetZoom(cam, rz, EASE_ZOOM * 0.3, scale, cfg);

        // Clean up on exit to idle (happens in _evaluate)
        if (cfg.state === "idle") {
          cfg._releaseTarget = null;
          cfg._releaseZoom   = null;
        }
        break;
      }
    }

    // Hard zoom clamp
    cam.targetZoom = Math.max(0.12, Math.min(0.85, cam.targetZoom));
  }

  // ── Music ecology coupling ─────────────────────────────────────────────────────
  function _contributeMusicEcology(eco, cfg) {
    var me = eco && eco.musicEcology;
    if (!me) return;
    me._cameraFocus = cfg.currentScore || 0;
    me._cameraState = cfg.state;
  }

  // ── Main per-frame tick ────────────────────────────────────────────────────────
  function tick(state, dt, now) {
    var cfg = _cfg(state);
    if (!cfg || !cfg.enabled) return;

    var eco = state.world && state.world.ecology;
    if (!eco || !eco.enabled) return;

    // Expose now for helpers
    cfg._nowMs = now;

    // Track state duration
    if (!cfg._stateEnteredAt) cfg._stateEnteredAt = now;
    cfg.metrics.stateTime = (now - cfg._stateEnteredAt) / 1000;

    var prevState = cfg.state;

    // ── Evaluation pass (every 2-4s) ──────────────────────────────────────────
    if (now >= (cfg.reevaluateAt || 0)) {
      var nodes = collectNodes(state, now);
      _applyPersistence(cfg, nodes);
      _applyCooldownPenalties(cfg, nodes, _modeCfg(cfg));
      _applyTargetStickiness(cfg, nodes);
      _evaluate(cfg, nodes, now);
      cfg._lastNodes = nodes;
      cfg.reevaluateAt = now + EVAL_INTERVAL_MIN + Math.random() * (EVAL_INTERVAL_MAX - EVAL_INTERVAL_MIN);
    }

    if (cfg.state !== prevState) cfg._stateEnteredAt = now;

    // ── Camera movement ──────────────────────────────────────────────────────
    _applyCameraMovement(cfg, state, dt, now);

    // ── Music coupling ───────────────────────────────────────────────────────
    _contributeMusicEcology(eco, cfg);

    // ── Metrics ──────────────────────────────────────────────────────────────
    cfg.metrics.cameraVelocity = cfg._lastCamVelocity || 0;
    cfg.metrics.zoom           = state.camera ? state.camera.zoom : 1;
  }

  // ── Public API ────────────────────────────────────────────────────────────────
  function getMetrics(state) {
    var cfg = _cfg(state);
    if (!cfg) return { state: "disabled" };
    var cam = state.camera || {};
    var target = cfg.currentTarget;
    var lingerRemaining = cfg.state === "observe" && cfg.lingerUntil
      ? Math.max(0, cfg.lingerUntil - (cfg._nowMs || 0)) / 1000
      : 0;
    return {
      state:             cfg.state,
      passengerMode:     cfg.passengerMode || "documentary",
      currentTargetId:   target ? target.id   : null,
      currentTargetType: target ? (target.eventType || target.type) : null,
      curiosityScore:    cfg.currentScore || 0,
      observeRemaining:  lingerRemaining,
      nodeCount:         cfg.metrics.nodes,
      recentTargets:     (cfg.recentTargets || []).length,
      cameraVelocity:    cfg.metrics.cameraVelocity || 0,
      zoom:              cam.zoom || 1,
      stateTime:         cfg.metrics.stateTime || 0,
      drivingCamera:     cfg.drivingCamera,
    };
  }

  function setTarget(state, node) {
    var cfg = _cfg(state);
    if (!cfg) return;
    cfg.currentTarget = node;
    cfg.currentScore  = node ? node.score : 0;
    cfg.state         = node ? "investigate" : "idle";
  }

  function clearTarget(state) {
    var cfg = _cfg(state);
    if (!cfg) return;
    _recordRelease(cfg, cfg.currentTarget, cfg._nowMs || 0, _modeCfg(cfg));
    cfg.currentTarget = null;
    cfg.currentScore  = 0;
    cfg.state         = "release";
  }

  function setMode(state, mode) {
    var cfg = _cfg(state);
    if (!cfg) return;
    if (!PASSENGER_MODES[mode]) { console.warn("CameraCuriosity: unknown mode", mode); return; }
    cfg.passengerMode = mode;
  }

  SBE.CameraCuriosity = {
    tick:         tick,
    collectNodes: collectNodes,
    getMetrics:   getMetrics,
    setTarget:    setTarget,
    clearTarget:  clearTarget,
    setMode:      setMode,
    MODES:        Object.keys(PASSENGER_MODES),
  };

})(window);
