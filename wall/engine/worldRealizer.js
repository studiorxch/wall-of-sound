(function initWorldRealizer(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ──────────────────────────────────────────────────────────────
  var MAX_REALIZED       = 80;    // hard cap on concurrent realized entities
  var REALIZE_HYSTERESIS = 200;   // extra buffer before despawning (prevents flicker)
  var STEER_INTERVAL_MS  = 800;   // how often to correct realized walker velocity

  // ── Realization tick ───────────────────────────────────────────────────────
  // Called every frame from main tick (cheap — O(vehicles)).
  // state: full WOS state. now: performance.now().
  function tick(state, now) {
    var TE = SBE.TrafficEcology;
    if (!TE) return;

    var world    = state.world && state.world.ecology;
    if (!world) return;

    var vehicles = world.abstractVehicles;
    if (!vehicles || !vehicles.length) return;

    var cam    = state.camera || { x: 0, y: 0, zoom: 1 };
    var radius = world.realizationRadius || 1800;
    var realizedCount = vehicles.filter(function (v) { return v._realized; }).length;

    vehicles.forEach(function (v) {
      if (v.state !== "moving") return;

      var dist = Math.hypot(v.wx - cam.x, v.wy - cam.y);
      var inRange = dist < radius;

      // ── Realize ─────────────────────────────────────────────────────────────
      if (inRange && !v._realized && realizedCount < MAX_REALIZED) {
        var walker = _spawnWalker(state, v, now);
        if (walker) {
          v._walkerId = walker.id;
          v._realized = true;
          v._lastSteer = now;
          realizedCount++;
        }

      // ── Despawn ──────────────────────────────────────────────────────────────
      } else if (!inRange && v._realized && dist > radius + REALIZE_HYSTERESIS) {
        _despawnWalker(state, v);
        v._walkerId = null;
        v._realized = false;
        realizedCount--;

      // ── Steer realized walker along route ─────────────────────────────────
      } else if (v._realized && v._walkerId) {
        var elapsed = now - (v._lastSteer || 0);
        if (elapsed > STEER_INTERVAL_MS) {
          _steerWalker(state, v, now);
          v._lastSteer = now;
        }
        // Sync abstract position from live walker
        _syncPositionFromWalker(state, v);
      }
    });
  }

  // ── Spawn a projectile walker for an abstract vehicle ─────────────────────
  function _spawnWalker(state, vehicle, now) {
    var TE    = SBE.TrafficEcology;
    var route = TE && TE.ROUTES[vehicle.routeId];
    var vtype = TE && TE.VEHICLE_TYPES[vehicle.type];
    if (!route || !vtype) return null;

    // Get current route direction for initial velocity
    var pos = TE.routePosition(route, Math.min(vehicle.routeProgress, 0.99));
    var spd = vtype.baseSpeed * vehicle.speedMult;

    var walker = {
      id:           "rw_" + Math.random().toString(36).slice(2, 10),
      _idHash:      0,
      stroke:       null,
      strokeId:     null,
      color:        vtype.color,
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
      fieldInfluence: 0.1,         // low — vehicles mostly self-propelled
      _driftVx:     0,
      _driftVy:     0,
      _pathX:       vehicle.wx,
      _pathY:       vehicle.wy,
      physics: {
        vx:              pos.vx * spd,
        vy:              pos.vy * spd,
        mass:            1.5,
        bounce:          0.3,        // low bounce — vehicles don't ricochet wildly
        friction:        0.999,      // near-frictionless in world space
        gravityScale:    0.0,        // vehicles ignore gravity
        collisionRadius: vehicle.type === "rideshare" ? 10 : 13,
        maxSpeed:        spd * 1.4,
      },
      debug: { showPhysics: false },
      // ── Subject / visual ────────────────────────────────────────────────────
      avatar: { enabled: false, style: "none", scale: 1, opacity: 1,
                collider: { type: "circle", radius: 12, offsetX: 0, offsetY: 0, enabled: true } },
      // Ecology metadata (not rendered — for despawn/steer)
      _ecologyVehicleId: vehicle.id,
      _ecologyRouteId:   vehicle.routeId,
      _ecologyType:      vehicle.type,
      _spawnTime:        now,
      // Music / MIDI (minimal — ecology vehicles use ambient voice)
      lastTriggerT: -1,
      noteOffset:   Math.floor(Math.random() * 7),
      music: { voice: "ambient", density: 0.3, octave: -1, mute: false, lastStep: -1, mode: "pingpong" },
      emitter: { enabled: false, rate: 40, spread: 0.2, speed: 80, size: 2, life: 0.8, type: "dot" },
    };

    // Compute idHash
    walker._idHash = (function (s) {
      var h = 0;
      for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return h;
    })(walker.id);

    // Attach subjectStyle so the existing subject renderer draws the vehicle
    walker._subjectStyle  = vtype.subjectStyle;
    walker._subjectScale  = vehicle.type === "rideshare" ? 1.0 : 1.3;
    walker._subjectOpacity = 0.88;

    state.projectileWalkers = state.projectileWalkers || [];
    state.projectileWalkers.push(walker);
    return walker;
  }

  // ── Despawn — remove walker, write progress back to abstract vehicle ────────
  function _despawnWalker(state, vehicle) {
    if (!vehicle._walkerId) return;
    var idx = (state.projectileWalkers || []).findIndex(function (w) {
      return w.id === vehicle._walkerId;
    });
    if (idx !== -1) {
      state.projectileWalkers.splice(idx, 1);
    }
  }

  // ── Steering — redirect realized walker toward next route waypoint ─────────
  function _steerWalker(state, vehicle, now) {
    var TE = SBE.TrafficEcology;
    if (!TE) return;

    var walker = (state.projectileWalkers || []).find(function (w) {
      return w.id === vehicle._walkerId;
    });
    if (!walker) return;

    var route = TE.ROUTES[vehicle.routeId];
    if (!route) return;

    var vtype = TE.VEHICLE_TYPES[vehicle.type];
    var spd   = vtype ? vtype.baseSpeed * vehicle.speedMult : 160;

    // Look ahead on route to find steering target
    var targetT  = Math.min(vehicle.routeProgress + 0.08, 0.98);
    var target   = TE.routePosition(route, targetT);

    // Compute desired velocity direction
    var dx  = target.x - walker.x;
    var dy  = target.y - walker.y;
    var len = Math.hypot(dx, dy) || 1;

    // Blend current velocity toward desired heading (gentle correction)
    var blend  = 0.35;
    var desVx  = (dx / len) * spd;
    var desVy  = (dy / len) * spd;
    var ph     = walker.physics;
    ph.vx = ph.vx + (desVx - ph.vx) * blend;
    ph.vy = ph.vy + (desVy - ph.vy) * blend;

    // Clamp to maxSpeed
    var curSpd = Math.hypot(ph.vx, ph.vy);
    if (curSpd > ph.maxSpeed) {
      ph.vx = (ph.vx / curSpd) * ph.maxSpeed;
      ph.vy = (ph.vy / curSpd) * ph.maxSpeed;
    }
  }

  // ── Sync abstract position from live walker ────────────────────────────────
  function _syncPositionFromWalker(state, vehicle) {
    var walker = (state.projectileWalkers || []).find(function (w) {
      return w.id === vehicle._walkerId;
    });
    if (!walker) return;
    vehicle.wx = walker.x;
    vehicle.wy = walker.y;
  }

  // ── Render ecology realized walkers using subject system ───────────────────
  // Called from drawWalkers for ecology walkers that have _subjectStyle set.
  // Returns true if it rendered the walker (caller should skip legacy render).
  function renderEcologyWalker(ctx, walker, px, py, now) {
    if (!walker._subjectStyle) return false;
    var style   = walker._subjectStyle;
    var scale   = walker._subjectScale  || 1.0;
    var opacity = walker._subjectOpacity != null ? walker._subjectOpacity : 0.88;
    var color   = walker.color || "#3dd8c5";

    // Compute heading angle from velocity
    var ph    = walker.physics || {};
    var angle = (ph.vx || ph.vy) ? Math.atan2(ph.vy || 0, ph.vx || 0) : 0;

    ctx.save();
    ctx.translate(px, py);
    ctx.globalAlpha = opacity;

    if (style === "arrow") {
      ctx.rotate(angle);
      var ar = 7 * scale;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ar, 0);
      ctx.lineTo(-ar * 0.6, -ar * 0.55);
      ctx.lineTo(-ar * 0.3, 0);
      ctx.lineTo(-ar * 0.6,  ar * 0.55);
      ctx.closePath();
      ctx.fill();
    } else {
      // dot
      var dr = 5 * scale;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, dr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = opacity * 0.6;
      ctx.beginPath(); ctx.arc(0, 0, dr * 0.4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
    return true;
  }

  // Public API
  SBE.WorldRealizer = {
    tick:                tick,
    renderEcologyWalker: renderEcologyWalker,
  };

})(window);
