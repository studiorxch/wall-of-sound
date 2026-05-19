(function initActorEcology(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Actor Ecology System (ActorEcology v1.0.0) ─────────────────────────────
  //
  // Lightweight behavioral actor populations for WOS.
  // Actors are emotional ecological particles — not NPCs.
  //
  // Two-layer architecture (mirrors vehicle realization):
  //   Abstract actors (up to 4000) — symbolic, no render, no collision
  //   Realized actors (up to 140)  — projectile walkers within camera radius
  //
  // Integration:
  //   tick(state, dt, now)              — every frame
  //   contributeToDistrictPressure(eco) — every ~3s (after DistrictPressure.tick)
  //   contributeMusicEcology(eco)       — every frame (lightweight)

  // ── Archetype definitions ──────────────────────────────────────────────────
  var ARCHETYPES = {
    commuter: {
      name:                "commuter",
      spawnWeight:         0.35,
      preferredDistricts:  ["downtown", "williamsburg"],
      preferredPhases:     ["dawn", "day", "dusk"],
      speed:               115,   // world units / second (abstract)
      cohesion:            0.60,
      clusterBias:         0.40,
      pressureSensitivity: 0.70,
      musicWeight:         0.80,
      // Visual (realized walker)
      _subjectStyle:  "arrow",
      color:          "#7dcfff",
      opacity:        0.82,
      collisionRadius: 7,
    },
    nightlife: {
      name:                "nightlife",
      spawnWeight:         0.25,
      preferredDistricts:  ["bushwick", "williamsburg"],
      preferredPhases:     ["dusk", "night", "lateNight"],
      speed:               75,
      cohesion:            0.80,
      clusterBias:         0.80,
      pressureSensitivity: 0.50,
      musicWeight:         1.20,
      _subjectStyle:  "dot",
      color:          "#ff66cc",
      opacity:        0.88,
      collisionRadius: 6,
    },
    delivery: {
      name:                "delivery",
      spawnWeight:         0.18,
      preferredDistricts:  ["downtown", "williamsburg", "bushwick"],
      preferredPhases:     ["dawn", "day", "dusk"],
      speed:               155,
      cohesion:            0.20,
      clusterBias:         0.10,
      pressureSensitivity: 0.90,
      musicWeight:         0.60,
      _subjectStyle:  "dot",
      color:          "#f0c674",
      opacity:        0.80,
      collisionRadius: 6,
    },
    wanderer: {
      name:                "wanderer",
      spawnWeight:         0.14,
      preferredDistricts:  ["williamsburg", "bushwick"],
      preferredPhases:     ["day", "dusk", "night"],
      speed:               48,
      cohesion:            0.30,
      clusterBias:         0.20,
      pressureSensitivity: 0.30,
      musicWeight:         0.40,
      _subjectStyle:  "dot",
      color:          "#7ee7d8",
      opacity:        0.65,
      collisionRadius: 5,
    },
    ghost: {
      name:                "ghost",
      spawnWeight:         0.08,
      preferredDistricts:  ["downtown", "williamsburg", "bushwick"],
      preferredPhases:     ["lateNight", "night"],
      speed:               28,
      cohesion:            0.00,
      clusterBias:         0.00,
      pressureSensitivity: 0.10,
      musicWeight:         0.20,
      _subjectStyle:  "dot",
      color:          "#ccccff",
      opacity:        0.32,
      collisionRadius: 4,
    },
  };

  // ── Phase spawn weight multipliers per archetype ───────────────────────────
  // Scales archetype.spawnWeight during weighted selection.
  var PHASE_WEIGHTS = {
    dawn:      { commuter: 1.9, nightlife: 0.1, delivery: 1.3, wanderer: 0.4, ghost: 0.2 },
    day:       { commuter: 1.5, nightlife: 0.3, delivery: 1.8, wanderer: 0.9, ghost: 0.1 },
    dusk:      { commuter: 1.1, nightlife: 1.1, delivery: 0.9, wanderer: 1.1, ghost: 0.2 },
    night:     { commuter: 0.2, nightlife: 2.1, delivery: 0.4, wanderer: 1.3, ghost: 0.7 },
    lateNight: { commuter: 0.1, nightlife: 0.7, delivery: 0.2, wanderer: 0.7, ghost: 2.0 },
  };

  // ── Pressure contribution weights per archetype ────────────────────────────
  var PRESSURE_CONTRIBUTION = {
    commuter:  { traffic: 0.006, nightlife: 0.000, delivery: 0.000 },
    nightlife: { traffic: 0.001, nightlife: 0.008, delivery: 0.000 },
    delivery:  { traffic: 0.002, nightlife: 0.000, delivery: 0.007 },
    wanderer:  { traffic: 0.001, nightlife: 0.002, delivery: 0.000 },
    ghost:     { traffic: 0.000, nightlife: 0.001, delivery: 0.000 },
  };

  // ── District helper ────────────────────────────────────────────────────────
  function _getDistricts() {
    return global.SBE && SBE.DistrictPressure && SBE.DistrictPressure.DISTRICTS;
  }

  function _districtIds() {
    var d = _getDistricts();
    return d ? Object.keys(d) : [];
  }

  // Random point within a district circle (80% of radius so actors don't spawn at edges)
  function _randomInDistrict(districtId) {
    var d = _getDistricts();
    if (!d || !d[districtId]) return { x: 0, y: 0 };
    var dist = d[districtId];
    var angle = Math.random() * Math.PI * 2;
    var r     = Math.random() * dist.radius * 0.80;
    return { x: dist.x + Math.cos(angle) * r, y: dist.y + Math.sin(angle) * r };
  }

  // Pick a random district, weighted toward preferred list
  function _pickDistrict(archetype, phase) {
    var ids = _districtIds();
    if (!ids.length) return "williamsburg";
    var pref = ARCHETYPES[archetype] && ARCHETYPES[archetype].preferredDistricts || ids;
    // 70% chance preferred, 30% any district
    if (Math.random() < 0.70 && pref.length) {
      return pref[Math.floor(Math.random() * pref.length)];
    }
    return ids[Math.floor(Math.random() * ids.length)];
  }

  // ── Actor factory ──────────────────────────────────────────────────────────
  var _nextActorId = 1;

  function _createActor(archetype, phase) {
    var district = _pickDistrict(archetype, phase);
    var pos      = _randomInDistrict(district);
    var target   = _randomInDistrict(district); // initial target within same district
    var a        = ARCHETYPES[archetype];

    return {
      id:             "ac_" + (_nextActorId++),
      archetype:      archetype,
      district:       district,
      mood:           0.5 + Math.random() * 0.5,
      energy:         0.4 + Math.random() * 0.6,
      wx:             pos.x,
      wy:             pos.y,
      tx:             target.x,
      ty:             target.y,
      state:          "moving",
      realized:       false,
      _walkerId:      null,
      _retargetIn:    0,   // frames until next target pick
    };
  }

  // ── Population target by phase and city energy ────────────────────────────
  function _populationTarget(actorCfg, eco, state) {
    var en  = (state.world && state.world.rhythm && state.world.rhythm.metrics.cityEnergy) || 0.5;
    var max = actorCfg.maxAbstractActors || 4000;
    // Energy 0→1 maps to 5%→100% of max
    return Math.round(max * (0.05 + en * 0.95) * (actorCfg.spawnRate || 1.0));
  }

  // ── Weighted archetype picker ──────────────────────────────────────────────
  function _pickArchetype(phase) {
    var pw   = PHASE_WEIGHTS[phase] || PHASE_WEIGHTS.day;
    var pool = [];
    Object.keys(ARCHETYPES).forEach(function (key) {
      var a      = ARCHETYPES[key];
      var weight = (a.spawnWeight || 0.1) * (pw[key] || 0.5);
      for (var i = 0; i < Math.round(weight * 10); i++) pool.push(key);
    });
    if (!pool.length) return "wanderer";
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // ── Pick a new movement target for an actor ────────────────────────────────
  function _retarget(actor, phase) {
    // Commuters occasionally move to adjacent districts; others mostly stay local
    var crossDistrict = false;
    if (actor.archetype === "commuter" && Math.random() < 0.40) {
      crossDistrict = true;
    } else if (actor.archetype === "delivery" && Math.random() < 0.30) {
      crossDistrict = true;
    }

    if (crossDistrict) {
      var ids  = _districtIds();
      var others = ids.filter(function (id) { return id !== actor.district; });
      if (others.length) {
        actor.district = others[Math.floor(Math.random() * others.length)];
      }
    }

    var t = _randomInDistrict(actor.district);
    actor.tx = t.x;
    actor.ty = t.y;
    actor.state = "moving";
  }

  // ── Spawn a realized projectile walker for an actor ────────────────────────
  function _spawnActorWalker(state, actor, now) {
    var a   = ARCHETYPES[actor.archetype] || ARCHETYPES.wanderer;
    var spd = a.speed * (0.85 + Math.random() * 0.30);

    // Random initial heading toward target
    var dx  = actor.tx - actor.wx;
    var dy  = actor.ty - actor.wy;
    var len = Math.hypot(dx, dy) || 1;

    var walker = {
      id:           "ar_" + Math.random().toString(36).slice(2, 10),
      _idHash:      0,
      stroke:       null,
      strokeId:     null,
      color:        a.color,
      path:         null,
      t:            0,
      dir:          1,
      speed:        0,
      x:            actor.wx,
      y:            actor.wy,
      trail:        [],
      _lastTrailSample: 0,
      motionMode:   "projectile",
      motionPlane:  "world",
      fieldInfluence: 0.04 + a.cohesion * 0.06,
      _driftVx:     0,
      _driftVy:     0,
      _pathX:       actor.wx,
      _pathY:       actor.wy,
      physics: {
        vx:              (dx / len) * spd,
        vy:              (dy / len) * spd,
        mass:            1.0,
        bounce:          0.1,
        friction:        0.992,
        gravityScale:    0.0,
        collisionRadius: a.collisionRadius || 6,
        maxSpeed:        spd * 1.3,
      },
      debug: { showPhysics: false },
      avatar: {
        enabled:  false,
        style:    "none",
        scale:    1,
        opacity:  a.opacity,
        collider: { type: "circle", radius: a.collisionRadius || 6, offsetX: 0, offsetY: 0, enabled: false },
      },
      // ── Ecology / actor metadata ─────────────────────────────────────────
      _ecologyActorId:  actor.id,
      _ecologyArchetype: actor.archetype,
      _spawnTime:       now,
      _lastSteer:       now,
      // ── Subject visual ───────────────────────────────────────────────────
      _subjectStyle:   a._subjectStyle,
      _subjectScale:   0.75,
      _subjectOpacity: a.opacity,
      // Music
      lastTriggerT: -1,
      noteOffset:   Math.floor(Math.random() * 12),
      music: { voice: "ambient", density: a.musicWeight * 0.3, octave: -1, mute: false, lastStep: -1, mode: "pingpong" },
      emitter: { enabled: false, rate: 0, spread: 0, speed: 0, size: 1, life: 0.5, type: "dot" },
    };

    walker._idHash = (function (s) {
      var h = 0;
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return h;
    })(walker.id);

    state.projectileWalkers = state.projectileWalkers || [];
    state.projectileWalkers.push(walker);
    return walker;
  }

  // ── Steer a realized actor walker toward its current target ───────────────
  var _ACTOR_STEER_MS = 800;

  function _steerActorWalker(actor, walker, now) {
    var elapsed = now - (walker._lastSteer || 0);
    if (elapsed < _ACTOR_STEER_MS) return;
    walker._lastSteer = now;

    var a   = ARCHETYPES[actor.archetype] || ARCHETYPES.wanderer;
    var spd = a.speed * (0.85 + Math.random() * 0.30);

    var dx  = actor.tx - walker.x;
    var dy  = actor.ty - walker.y;
    var len = Math.hypot(dx, dy) || 1;

    // Soft heading correction (lower blend than vehicles — pedestrians meander)
    var blend = 0.25 + a.cohesion * 0.15;
    var ph    = walker.physics;
    ph.vx += ((dx / len) * spd - ph.vx) * blend;
    ph.vy += ((dy / len) * spd - ph.vy) * blend;

    // Clamp
    var curSpd = Math.hypot(ph.vx, ph.vy);
    if (curSpd > ph.maxSpeed) {
      ph.vx = (ph.vx / curSpd) * ph.maxSpeed;
      ph.vy = (ph.vy / curSpd) * ph.maxSpeed;
    }
  }

  // ── Destroy a walker ───────────────────────────────────────────────────────
  function _destroyWalker(state, walkerId) {
    if (!walkerId || !state.projectileWalkers) return;
    var idx = state.projectileWalkers.findIndex(function (w) { return w.id === walkerId; });
    if (idx !== -1) state.projectileWalkers.splice(idx, 1);
  }

  // ── Find walker by id ──────────────────────────────────────────────────────
  function _findWalker(state, walkerId) {
    return (state.projectileWalkers || []).find(function (w) { return w.id === walkerId; });
  }

  // ── Main per-frame tick ────────────────────────────────────────────────────
  function tick(state, dt, now) {
    var actorCfg = state.world && state.world.actors;
    if (!actorCfg || !actorCfg.enabled) return;

    var eco     = state.world && state.world.ecology;
    if (!eco || !eco.enabled) return;

    var phase   = (state.world.rhythm && state.world.rhythm.phase) || "day";
    var cam     = state.camera || { x: 0, y: 0, zoom: 1 };
    var radius  = actorCfg.realizationRadius  || 1200;
    var maxReal = actorCfg.maxRealizedActors  || 140;
    var padding = 280;

    // Ensure storage
    if (!state.world.abstractActors) state.world.abstractActors = [];
    if (!state.world.realizedActors) state.world.realizedActors = new Map();

    var actors    = state.world.abstractActors;
    var realized  = state.world.realizedActors;

    // ── Step 1: Maintain population ────────────────────────────────────────
    var target = _populationTarget(actorCfg, eco, state);
    var deficit = target - actors.length;
    // Spawn up to 5 per frame to avoid hitching
    var spawnBatch = Math.min(deficit, 5);
    for (var s = 0; s < spawnBatch; s++) {
      actors.push(_createActor(_pickArchetype(phase), phase));
    }
    // Prune excess (remove from end — oldest actors, already advanced)
    if (actors.length > target + 20) {
      // Only prune unrealized actors to avoid popping
      var pruned = 0;
      for (var p = actors.length - 1; p >= 0 && pruned < 3; p--) {
        if (!actors[p].realized) {
          actors.splice(p, 1);
          pruned++;
        }
      }
    }

    // ── Step 2: Advance abstract actors + realization lifecycle ───────────
    var realizedCount = realized.size;

    for (var i = 0; i < actors.length; i++) {
      var actor = actors[i];
      if (actor.state !== "moving") continue;

      // Advance position (abstract — no physics, no collision)
      var a    = ARCHETYPES[actor.archetype] || ARCHETYPES.wanderer;
      var adx  = actor.tx - actor.wx;
      var ady  = actor.ty - actor.wy;
      var adist = Math.hypot(adx, ady);

      if (adist < 25) {
        // Reached target — pick new one
        _retarget(actor, phase);
      } else {
        var spd = a.speed * dt;
        actor.wx += (adx / adist) * spd;
        actor.wy += (ady / adist) * spd;
      }

      // Realization distance check
      var camDist = Math.hypot(actor.wx - cam.x, actor.wy - cam.y);
      var entry   = realized.get(actor.id);

      if (!entry && !actor.realized && camDist < radius && realizedCount < maxReal) {
        // ── Realize ───────────────────────────────────────────────────────
        var walker = _spawnActorWalker(state, actor, now);
        if (walker) {
          realized.set(actor.id, {
            actorId:   actor.id,
            walkerId:  walker.id,
            archetype: actor.archetype,
            realizedAt: now,
            district:  actor.district,
          });
          actor.realized  = true;
          actor._walkerId = walker.id;
          realizedCount++;
        }

      } else if (entry && camDist > radius + padding) {
        // ── Despawn ────────────────────────────────────────────────────────
        var dw = _findWalker(state, entry.walkerId);
        if (dw) {
          // Serialize live position back
          actor.wx = dw.x;
          actor.wy = dw.y;
        }
        _destroyWalker(state, entry.walkerId);
        realized.delete(actor.id);
        actor.realized  = false;
        actor._walkerId = null;
        realizedCount--;

      } else if (entry) {
        // ── Steer + sync realized walker ────────────────────────────────
        var sw = _findWalker(state, entry.walkerId);
        if (sw) {
          _steerActorWalker(actor, sw, now);
          // Sync abstract position from walker
          actor.wx = sw.x;
          actor.wy = sw.y;
          // Update actor target if walker is near enough
          var twdx = actor.tx - sw.x;
          var twdy = actor.ty - sw.y;
          if (Math.hypot(twdx, twdy) < 30) _retarget(actor, phase);
        } else {
          // Walker missing — clean up
          realized.delete(actor.id);
          actor.realized  = false;
          actor._walkerId = null;
        }
      }
    }

    // ── Prune stale realized entries ───────────────────────────────────────
    realized.forEach(function (entry, actorId) {
      var alive = actors.some(function (a) { return a.id === actorId; });
      if (!alive) {
        _destroyWalker(state, entry.walkerId);
        realized.delete(actorId);
      }
    });

    // ── Step 3: Update metrics ─────────────────────────────────────────────
    _updateMetrics(actorCfg, actors, realized);
  }

  // ── Contribute to district pressure (call in ~3s throttle) ───────────────
  // Accumulates actor density per district and applies small pressure boosts.
  function contributeToDistrictPressure(eco, actors) {
    if (!eco || !eco.pressure || !eco.pressure.districts) return;
    if (!actors || !actors.length) return;

    // Tally actors per district per archetype
    var tally = {};
    actors.forEach(function (actor) {
      if (!tally[actor.district]) tally[actor.district] = {};
      var dt = tally[actor.district];
      dt[actor.archetype] = (dt[actor.archetype] || 0) + 1;
    });

    // Apply contributions (clamped to prevent runaway)
    Object.keys(tally).forEach(function (distId) {
      var dp = eco.pressure.districts[distId];
      if (!dp) return;
      var dt = tally[distId];
      Object.keys(dt).forEach(function (archetype) {
        var count = dt[archetype];
        var contrib = PRESSURE_CONTRIBUTION[archetype];
        if (!contrib) return;
        var scale = Math.min(count, 80) / 80; // normalize to 80 actors per type
        dp.traffic   = Math.min(1, dp.traffic   + contrib.traffic   * scale);
        dp.nightlife = Math.min(1, dp.nightlife + contrib.nightlife * scale);
        dp.delivery  = Math.min(1, dp.delivery  + contrib.delivery  * scale);
      });
    });
  }

  // ── Contribute to music ecology (call every frame — lightweight) ──────────
  function contributeMusicEcology(eco, actors, realized) {
    var me = eco && eco.musicEcology;
    if (!me || !me.enabled) return;

    // Count realized actor archetypes for music weighting
    var counts = { commuter: 0, nightlife: 0, delivery: 0, wanderer: 0, ghost: 0 };
    if (realized && realized.size) {
      realized.forEach(function (entry) {
        if (counts[entry.archetype] != null) counts[entry.archetype]++;
      });
    }

    var total = realized ? realized.size : 0;
    if (total === 0) return;

    // Weighted music energy from realized actors
    var musicEnergy =
      counts.commuter  * ARCHETYPES.commuter.musicWeight  +
      counts.nightlife * ARCHETYPES.nightlife.musicWeight +
      counts.delivery  * ARCHETYPES.delivery.musicWeight  +
      counts.wanderer  * ARCHETYPES.wanderer.musicWeight  +
      counts.ghost     * ARCHETYPES.ghost.musicWeight;

    me._actorMusicEnergy  = Math.min(1, musicEnergy / (total * 1.2));
    me._actorNightlife    = total > 0 ? counts.nightlife / total : 0;
    me._actorGhost        = total > 0 ? counts.ghost     / total : 0;
    me._actorCommuter     = total > 0 ? counts.commuter  / total : 0;
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  function _updateMetrics(actorCfg, actors, realized) {
    var m = actorCfg.metrics;
    if (!m) return;

    m.abstractCount = actors.length;
    m.realizedCount = realized ? realized.size : 0;

    var counts = { commuter: 0, nightlife: 0, delivery: 0, wanderer: 0, ghost: 0 };
    actors.forEach(function (a) {
      if (counts[a.archetype] != null) counts[a.archetype]++;
    });
    m.commuters  = counts.commuter;
    m.nightlife  = counts.nightlife;
    m.delivery   = counts.delivery;
    m.wanderers  = counts.wanderer;
    m.ghosts     = counts.ghost;
  }

  function getMetrics(state) {
    return (state.world && state.world.actors && state.world.actors.metrics) || {
      abstractCount: 0, realizedCount: 0,
      commuters: 0, nightlife: 0, delivery: 0, wanderers: 0, ghosts: 0,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.ActorEcology = {
    tick:                        tick,
    contributeToDistrictPressure: contributeToDistrictPressure,
    contributeMusicEcology:       contributeMusicEcology,
    getMetrics:                   getMetrics,
    ARCHETYPES:                   ARCHETYPES,
  };

})(window);
