/**
 * 0425_WOS_ParticleFoundation_v1.0.0
 * Core particle simulation layer — motion, gravity, decay, rendering.
 * Independent of emitter/behavior systems.
 */
(function initParticleSystem(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  var MAX_PARTICLES = 2000;

  // ── Physics constants ─────────────────────────────────────────────────────
  var GRAVITY = 120; // px/s² — matches legacy 0.04/frame × 60fps × 60 ≈ 144; tuned to 120

  // ── Data Model ───────────────────────────────────────────────────────────
  // type Particle = { x, y, vx, vy, life, maxLife, size, color, alpha }

  function createParticle(cfg) {
    var life = cfg.life != null ? cfg.life : 1.0;
    return {
      x: cfg.x != null ? cfg.x : 0,
      y: cfg.y != null ? cfg.y : 0,
      vx: cfg.vx != null ? cfg.vx : 0,
      vy: cfg.vy != null ? cfg.vy : 0,
      size: cfg.size || 2,
      life: life,
      maxLife: life,
      color: cfg.color || "#ffffff",
      type: cfg.type || "dot", // "dot" | "streak" | "burst" | "glow"
      alpha: cfg.alpha != null ? cfg.alpha : 1,
      _dead: false,
    };
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
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawGlow(ctx, p, a) {
    var r = p.size * 3;
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

    // ── Spawn ─────────────────────────────────────────────────────────────
    spawn: function (cfg) {
      if (this.particles.length >= MAX_PARTICLES) return;
      this.particles.push(createParticle(cfg));
    },

    // ── Burst — collision feedback ─────────────────────────────────────────
    burst: function (x, y, color, count) {
      var n = count || 6;
      for (var i = 0; i < n; i++) {
        if (this.particles.length >= MAX_PARTICLES) break;
        this.particles.push(
          createParticle({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 40,
            vy: (Math.random() - 0.5) * 40,
            size: 2,
            life: 0.5,
            color: color || "#ffffff",
            type: "burst",
          }),
        );
      }
    },

    // ── Update (dt in seconds) — gravity + decay + bounds cull ────────────
    update: function (dt, bounds) {
      var list = this.particles;
      var g = GRAVITY * dt; // px/s² → px per frame

      for (var i = list.length - 1; i >= 0; i--) {
        var p = list[i];

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
        var a = lifeRatio * (p.alpha != null ? p.alpha : 1) * 0.85;

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
