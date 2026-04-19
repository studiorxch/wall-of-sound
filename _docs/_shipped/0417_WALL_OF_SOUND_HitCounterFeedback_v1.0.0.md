0417_WALL_OF_SOUND_HitCounterFeedback_v1.0.0.md

# 0417_WALL_OF_SOUND_HitCounterFeedback_v1.0.0

## Context

Particle spawning and lifecycle entry (birth phase) are now stable.

Next step is introducing a **feedback layer** that exposes particle interaction behavior without modifying core physics or lifecycle logic.

This step introduces a **lifetime hit counter** and a **toggleable visual overlay**.

---

## Goal

Add a **Hit Counter Feedback Layer** that:

- tracks lifetime collisions per particle
- optionally renders hit count visually
- does NOT alter particle death logic (yet)
- prepares system for multi-stage lifecycle

---

## Assumptions

- Particles (“balls”) already exist in `state.balls`
- Collision system produces `collisions`
- `_dead` lifecycle flag is already implemented
- `normalizeBall()` initializes particle state
- `drawParticleOverlays()` handles visual overlays

---

## Core Concept

collisionCount → per-frame (physics resolution)
hitCount       → lifetime (behavior / lifecycle)

---

## TASK 1 — Add Lifetime Hit Counter

### In `normalizeBall()`

ball.hitCount = 0;

---

## TASK 2 — Increment on Collision

collisions.forEach(function (collision) {
  if (!collision.ball) return;

  const ball = collision.ball;

  ball.hitCount = (ball.hitCount || 0) + 1;

  if (!ball._dead) {
    ball._dead = true;
  }
});

---

## TASK 3 — Add Feedback Toggle State

feedback: {
  showHitCount: false
},

---

## TASK 4 — Hook UI Toggle

elements.toggleHitCount.addEventListener("change", function () {
  state.feedback.showHitCount = this.checked;
});

---

## TASK 5 — Render Hit Count Overlay

if (state.feedback && state.feedback.showHitCount) {
  ctx.save();

  ctx.fillStyle = "white";
  ctx.font = "10px monospace";
  ctx.textAlign = "center";

  ctx.fillText(
    ball.hitCount || 0,
    ball.x,
    ball.y - (ball.renderRadius + 6)
  );

  ctx.restore();
}

---

## Implementation Guide

Where code goes:
- normalizeBall()
- collision loop
- state
- drawParticleOverlays()

What to run:
- enable toggle
- spawn particles

What to expect:
- particles display hit count values
