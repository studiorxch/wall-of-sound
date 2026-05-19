(function initLocalRealization(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Local Realization System (LocalRealization v1.0.0) ────────────────────
  //
  // Camera-centric vehicle realization:
  //   abstract vehicle within radius → spawn projectile walker (realize)
  //   walker drifts out of radius + padding → serialize back + despawn
  //
  // Tracks realized entities in state.world.realizedEntities (Map).
  // state.world.realization config controls radius, limits, and flags.

  // ── Subject presets by vehicle type ───────────────────────────────────────
  var SUBJECT_PRESETS = {
    rideshare: {
      subjectStyle:  "arrow",   // arrow uses velocity heading — reads clearly
      subjectGlyph:  "vehicle/car",
      color:         "#5fd3bc",
      subjectScale:  1.2,
    },
    delivery: {
      subjectStyle:  "arrow",
      subjectGlyph:  "vehicle/van",
      color:         "#f0c674",
      subjectScale:  1.3,
    },
    courier: {
      subjectStyle:  "dot",
      subjectGlyph:  null,
      color:         "#ff6677",
      subjectScale:  1.0,
    },
  };

  // ── Metrics ────────────────────────────────────────────────────────────────
  var _spawnCount   = 0;
  var _despawnCount = 0;

  // ── Config accessor ────────────────────────────────────────────────────────
  function _cfg(state) {
    return (state.world && state.world.realization) || {
      enabled:         true,
      radius:          1800,
      maxActive:       120,
      despawnPadding:  300,
      visualizeRadius: true,
    };
  }

  // ── Realized entity map ────────────────────────────────────────────────────
  function _map(state) {
    if (!state.world.realizedEntities) {
      state.world.realizedEntities = new Map();
    }
    return state.world.realizedEntities;
  }

  // ── Main per-frame tick ────────────────────────────────────────────────────
  // Called every frame (cheap — just distance tests against abstract vehicles).
  function tick(state, now) {
    var eco = state.world && state.world.ecology;
    if (!eco || !eco.enabled) return;

    var cfg = _cfg(state);
    if (!cfg.enabled) return;

    var cam      = state.camera || { x: 0, y: 0, zoom: 1 };
    var radius   = cfg.radius         || 1800;
    var maxActive = cfg.maxActive     || 120;
    var padding  = cfg.despawnPadding || 300;
    var entities = _map(state);

    var vehicles = eco.abstractVehicles || [];

    vehicles.forEach(function (v) {
      if (v.state !== "moving") return;

      var dist  = Math.hypot(v.wx - cam.x, v.wy - cam.y);
      var entry = entities.get(v.id);

      if (!entry) {
        // ── Realize ─────────────────────────────────────────────────────────
        if (dist < radius && entities.size < maxActive) {
          var walker = _spawnWalker(state, v, now);
          if (walker) {
            entities.set(v.id, {
              abstractRef: v,
              walkerId:    walker.id,
              realizedAt:  now,
              district:    v.district,
              type:        v.type,
            });
            v._realized  = true;
            v._walkerId  = walker.id;
            _spawnCount++;
          }
        }
      } else if (dist > radius + padding) {
        // ── Despawn — write state back first ────────────────────────────────
        _serializeBack(state, v, entry);
        _destroyWalker(state, entry.walkerId);
        entities.delete(v.id);
        v._realized = false;
        v._walkerId = null;
        _despawnCount++;
      } else {
        // ── Steer + sync realized walker ─────────────────────────────────
        _steerWalker(state, v, entry, now);
        _syncPosition(state, v, entry);
      }
    });

    // ── Prune stale entries (abstract vehicle completed or removed) ──────────
    entities.forEach(function (entry, vehicleId) {
      var alive = vehicles.some(function (v) { return v.id === vehicleId; });
      if (!alive) {
        _destroyWalker(state, entry.walkerId);
        entities.delete(vehicleId);
      }
    });
  }

  // ── Spawn a projectile walker for an abstract vehicle ─────────────────────
  var _STEER_INTERVAL_MS = 600;

  function _spawnWalker(state, vehicle, now) {
    var TE    = SBE.TrafficEcology;
    var route = TE && TE.ROUTES[vehicle.routeId];
    var vtype = TE && TE.VEHICLE_TYPES[vehicle.type];
    if (!route || !vtype) return null;

    var pos    = TE.routePosition(route, Math.min(vehicle.routeProgress, 0.99));
    var spd    = vtype.baseSpeed * vehicle.speedMult;
    var preset = SUBJECT_PRESETS[vehicle.type] || SUBJECT_PRESETS.rideshare;

    var walker = {
      id:           "lr_" + Math.random().toString(36).slice(2, 10),
      _idHash:      0,
      stroke:       null,
      strokeId:     null,
      color:        preset.color,
      path:         null,
      t:            0,
      dir:          1,
      speed:        0,
      x:            vehicle.wx,
      y:            vehicle.wy,
      trail:        [],
      _lastTrailSample: 0,
      motionMode:   "projectile",
      motionPlane:  "world",
      fieldInfluence: 0.06,        // light field drift — vehicles are self-propelled
      _driftVx:     0,
      _driftVy:     0,
      _pathX:       vehicle.wx,
      _pathY:       vehicle.wy,
      physics: {
        vx:              pos.vx * spd,
        vy:              pos.vy * spd,
        mass:            1.5,
        bounce:          0.15,
        friction:        0.999,
        gravityScale:    0.0,
        collisionRadius: vehicle.type === "rideshare" ? 10 : 13,
        maxSpeed:        spd * 1.4,
      },
      debug: { showPhysics: false },
      avatar: {
        enabled:  false,
        style:    "none",
        scale:    1,
        opacity:  1,
        collider: { type: "circle", radius: 12, offsetX: 0, offsetY: 0, enabled: true },
      },
      // ── Ecology metadata ─────────────────────────────────────────────────
      _ecologyVehicleId: vehicle.id,
      _ecologyRouteId:   vehicle.routeId,
      _ecologyType:      vehicle.type,
      _spawnTime:        now,
      _lastSteer:        now,
      // ── Subject / visual ─────────────────────────────────────────────────
      _subjectStyle:   preset.subjectStyle,
      _subjectScale:   preset.subjectScale,
      _subjectOpacity: 0.88,
      // Music / MIDI (ambient — ecology voices)
      lastTriggerT: -1,
      noteOffset:   Math.floor(Math.random() * 7),
      music: { voice: "ambient", density: 0.25, octave: -1, mute: false, lastStep: -1, mode: "pingpong" },
      emitter: { enabled: false, rate: 40, spread: 0.2, speed: 80, size: 2, life: 0.8, type: "dot" },
    };

    // Compute id hash (used by rendering pipeline)
    walker._idHash = (function (s) {
      var h = 0;
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return h;
    })(walker.id);

    state.projectileWalkers = state.projectileWalkers || [];
    state.projectileWalkers.push(walker);
    return walker;
  }

  // ── Steer a realized walker toward its next route waypoint ────────────────
  function _steerWalker(state, vehicle, entry, now) {
    var walker = _findWalker(state, entry.walkerId);
    if (!walker) return;

    var elapsed = now - (walker._lastSteer || 0);
    if (elapsed < _STEER_INTERVAL_MS) return;
    walker._lastSteer = now;

    var TE = SBE.TrafficEcology;
    if (!TE) return;

    var route = TE.ROUTES[vehicle.routeId];
    if (!route) return;

    var vtype = TE.VEHICLE_TYPES[vehicle.type];
    var spd   = vtype ? vtype.baseSpeed * vehicle.speedMult : 160;

    // Look ahead on route for steering target
    var targetT  = Math.min(vehicle.routeProgress + 0.08, 0.98);
    var target   = TE.routePosition(route, targetT);

    var dx  = target.x - walker.x;
    var dy  = target.y - walker.y;
    var len = Math.hypot(dx, dy) || 1;

    // Blend velocity toward desired heading
    var blend = 0.40;
    var ph    = walker.physics;
    ph.vx += ((dx / len) * spd - ph.vx) * blend;
    ph.vy += ((dy / len) * spd - ph.vy) * blend;

    // Clamp to maxSpeed
    var curSpd = Math.hypot(ph.vx, ph.vy);
    if (curSpd > ph.maxSpeed) {
      ph.vx = (ph.vx / curSpd) * ph.maxSpeed;
      ph.vy = (ph.vy / curSpd) * ph.maxSpeed;
    }
  }

  // ── Sync abstract vehicle position from live walker ────────────────────────
  function _syncPosition(state, vehicle, entry) {
    var walker = _findWalker(state, entry.walkerId);
    if (!walker) return;
    vehicle.wx = walker.x;
    vehicle.wy = walker.y;
  }

  // ── Serialize walker state back to abstract vehicle before despawn ─────────
  function _serializeBack(state, vehicle, entry) {
    var walker = _findWalker(state, entry.walkerId);
    if (!walker) return;
    // Write final live position back so abstract simulation continues from here
    vehicle.wx = walker.x;
    vehicle.wy = walker.y;
    // Preserve velocity direction in speedMult so abstract advance feels continuous
    // (abstract tick ignores velocity; this is a best-effort position handoff)
  }

  // ── Destroy a realized walker ──────────────────────────────────────────────
  function _destroyWalker(state, walkerId) {
    if (!walkerId || !state.projectileWalkers) return;
    var idx = state.projectileWalkers.findIndex(function (w) {
      return w.id === walkerId;
    });
    if (idx !== -1) state.projectileWalkers.splice(idx, 1);
  }

  // ── Walker lookup ──────────────────────────────────────────────────────────
  function _findWalker(state, walkerId) {
    return (state.projectileWalkers || []).find(function (w) {
      return w.id === walkerId;
    });
  }

  // ── Metrics ───────────────────────────────────────────────────────────────
  function getMetrics(state) {
    var eco      = state.world && state.world.ecology;
    var entities = state.world && state.world.realizedEntities;
    return {
      abstract:     eco ? (eco.abstractVehicles || []).length : 0,
      realized:     entities ? entities.size : 0,
      spawnCount:   _spawnCount,
      despawnCount: _despawnCount,
      radius:       _cfg(state).radius,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.LocalRealization = {
    tick:            tick,
    getMetrics:      getMetrics,
    SUBJECT_PRESETS: SUBJECT_PRESETS,
  };

})(window);
