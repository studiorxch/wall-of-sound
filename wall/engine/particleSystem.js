/**
 * 0425_WOS_ParticleFoundation_v1.0.0 + 0426_WOS_ParticleProfileSystem_v1.0.0
 * Core particle simulation layer with profile-based spawning.
 * Independent of emitter/behavior systems.
 */
(function initParticleSystem(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  var MAX_PARTICLES = 2000;

  // ── Physics constants ─────────────────────────────────────────────────────
  var GRAVITY = 120; // px/s²

  // ── Data Model ────────────────────────────────────────────────────────────
  // type Particle = { x, y, vx, vy, life, maxLife, size, color, alpha }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function createParticle(cfg) {
    var life = cfg.life != null ? cfg.life : 1.0;
    return {
      x: cfg.x != null ? cfg.x : 0,
      y: cfg.y != null ? cfg.y : 0,
      vx: cfg.vx != null ? cfg.vx : 0,
      vy: cfg.vy != null ? cfg.vy : 0,
      size: cfg.size || 8,
      life: life,
      maxLife: life,
      color: cfg.color || "#ffffff",
      type: cfg.type || "dot",
      alpha: cfg.alpha != null ? cfg.alpha : 1,
      drag: cfg.drag != null ? cfg.drag : 0,
      gravity: cfg.gravity != null ? cfg.gravity : GRAVITY,
      _dead: false,
    };
  }

  // ── Profile Registry ─────────────────────────────────────────────────────
  // type ParticleProfile = {
  //   size:    [min, max],   // px — must be ≥ 8 for visibility
  //   speed:   [min, max],   // px/s
  //   life:    [min, max],   // seconds
  //   count:   number,       // particles per spawn call
  //   spread:  number,       // degrees — full cone width
  //   gravity: number,       // px/s² (overrides global)
  //   drag:    number,       // velocity damping per second [0–1]
  //   type:    string        // render type
  // }

  var PARTICLE_PROFILES = {
    // Explosive outward burst — collision impact, hits, emphasis
    burst: {
      size: [8, 20],
      speed: [180, 400],
      life: [0.4, 0.9],
      count: 12,
      spread: 360,
      gravity: 80,
      drag: 0.04,
      type: "dot",
    },

    // Trailing motion dust — follows moving objects, ambient fill
    dust: {
      size: [6, 14],
      speed: [30, 90],
      life: [0.6, 1.4],
      count: 6,
      spread: 60,
      gravity: 40,
      drag: 0.06,
      type: "dot",
    },

    // Slow ambient glow — emitter streams, halos, presence indicators
    glow: {
      size: [10, 24],
      speed: [20, 60],
      life: [1.0, 2.5],
      count: 4,
      spread: 40,
      gravity: 0,
      drag: 0.02,
      type: "glow",
    },

    // Sharp directional streaks — high-speed impacts, ramps, trajectory traces
    streak: {
      size: [3, 8],
      speed: [200, 500],
      life: [0.2, 0.5],
      count: 8,
      spread: 20,
      gravity: 60,
      drag: 0.02,
      type: "streak",
    },

    // Emitter default stream — general-purpose emission
    stream: {
      size: [6, 12],
      speed: [80, 200],
      life: [0.8, 1.6],
      count: 4,
      spread: 25,
      gravity: GRAVITY,
      drag: 0.01,
      type: "dot",
    },
  };

  // ── spawnProfile ──────────────────────────────────────────────────────────
  // event → spawnProfile(profile) → particles[] → update → render

  function spawnProfile(name, x, y, color, directionDeg, overrides) {
    var profile = PARTICLE_PROFILES[name];
    if (!profile) {
      console.warn("[ParticleSystem] Unknown profile:", name);
      profile = PARTICLE_PROFILES.stream;
    }

    var p = Object.assign({}, profile, overrides || {});
    var list = SBE.ParticleSystem.particles;
    var baseAngle =
      ((directionDeg != null ? directionDeg : 270) * Math.PI) / 180;
    var spreadRad = (p.spread * Math.PI) / 180;

    for (var i = 0; i < p.count; i++) {
      if (list.length >= MAX_PARTICLES) break;

      var angle = baseAngle + (Math.random() - 0.5) * spreadRad;
      var speed = rand(p.speed[0], p.speed[1]);
      var size = rand(p.size[0], p.size[1]);
      var life = rand(p.life[0], p.life[1]);

      list.push(
        createParticle({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: size,
          life: life,
          color: color || "#ffffff",
          type: p.type,
          gravity: p.gravity,
          drag: p.drag,
        }),
      );
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────

  function drawDot(ctx, p, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStreak(ctx, p, a) {
    ctx.globalAlpha = a;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.size;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.016, p.y - p.vy * 0.016);
    ctx.stroke();
  }

  function drawBurst(ctx, p, a) {
    ctx.globalAlpha = a;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(1.5, p.size * 0.3);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawGlow(ctx, p, a) {
    var r = p.size * 2.5;
    try {
      var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      g.addColorStop(0, p.color);
      g.addColorStop(1, "transparent");
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
    } catch (e) {
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = p.color;
    }
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── System ────────────────────────────────────────────────────────────────

  SBE.ParticleSystem = {
    particles: [],

    profiles: PARTICLE_PROFILES,

    // ── spawnProfile API ──────────────────────────────────────────────────
    spawnProfile: spawnProfile,

    // ── Low-level spawn (single particle from config) ─────────────────────
    spawn: function (cfg) {
      if (this.particles.length >= MAX_PARTICLES) return;
      this.particles.push(createParticle(cfg));
    },

    // ── Burst helper (collision feedback) — uses "burst" profile ──────────
    burst: function (x, y, color, count) {
      spawnProfile(
        "burst",
        x,
        y,
        color,
        null,
        count ? { count: count } : undefined,
      );
    },

    // ── Update (dt in seconds) ────────────────────────────────────────────
    update: function (dt, bounds) {
      var list = this.particles;

      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i];
        var g = (p.gravity != null ? p.gravity : GRAVITY) * dt;

        // Drag — velocity damping
        if (p.drag) {
          p.vx *= 1 - p.drag;
          p.vy *= 1 - p.drag;
        }

        // Integrate
        p.vy += g;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Decay
        p.life -= dt;
        if (p.life <= 0) {
          p._dead = true;
        }

        // Bounds cull
        if (!p._dead && bounds) {
          if (
            p.x < bounds.minX ||
            p.x > bounds.maxX ||
            p.y < bounds.minY ||
            p.y > bounds.maxY
          ) {
            p._dead = true;
          }
        }

        if (p._dead) list.splice(i, 1);
      }
    },

    // ── Render ────────────────────────────────────────────────────────────
    render: function (ctx) {
      var list = this.particles;
      if (!list.length) return;

      ctx.save();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var lifeRatio = Math.max(0, p.life / p.maxLife);
        var a = lifeRatio * (p.alpha != null ? p.alpha : 1) * 0.9;

        switch (p.type) {
          case "streak":
            drawStreak(ctx, p, a);
            break;
          case "burst":
            drawBurst(ctx, p, a);
            break;
          case "glow":
            drawGlow(ctx, p, a);
            break;
          default:
            drawDot(ctx, p, a);
            break;
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    },

    // ── Clear ─────────────────────────────────────────────────────────────
    clear: function () {
      this.particles.length = 0;
    },
  };
})(window);
