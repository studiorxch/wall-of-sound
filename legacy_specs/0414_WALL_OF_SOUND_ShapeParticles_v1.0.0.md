# 0414_WALL_OF_SOUND_ShapeParticles_v1.0.0

## 🎯 Objective

Transform particles into shape-driven entities using SHAPE_LIBRARY.

Goals:
- Shape-based identity
- Rotation modes
- Optional trails
- Physics compatibility

---

## 🧩 Particle Schema

```js
const DEFAULT_PARTICLE = {
  x: 0, y: 0,
  vx: 0, vy: 0,
  shapeId: "circle",
  rotation: 0,
  angularVelocity: 0,
  alignToVelocity: false,
  collidable: true,
  radius: 4,
  mass: 1,
  color: "#ffffff",
  opacity: 0.8,
  trail: [],
  trailEnabled: false,
  trailLength: 10
};
```

---

## ⚙️ Shape Binding

```js
function buildShapeInstance(p) {
  return SHAPE_LIBRARY[p.shapeId](
    { x: p.x, y: p.y },
    p.radius * 2
  );
}
```

---

## 🔁 Rotation

```js
function updateRotation(p, dt) {
  if (p.alignToVelocity) {
    p.rotation = Math.atan2(p.vy, p.vx);
  } else {
    p.rotation += p.angularVelocity * dt;
  }
}
```

---

## ✨ Trails

```js
function updateTrail(p) {
  if (!p.trailEnabled) return;
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > p.trailLength) p.trail.shift();
}
```

---

## 🎨 Rendering

```js
function renderParticle(ctx, p) {
  const segments = buildShapeInstance(p);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);

  ctx.strokeStyle = p.color;
  ctx.globalAlpha = p.opacity;

  segments.forEach(segment => {
    ctx.beginPath();
    segment.forEach((pt, i) => {
      const x = pt.x - p.x;
      const y = pt.y - p.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });

  ctx.restore();
}
```

---

## ⚙️ Collision Toggle

```js
state.world.particleCollision = true;
```

---

## 🎛️ UI

Particle Shape: circle | triangle | square  
Rotation: off | free | align  
Trail: on/off  
Collision: on/off  

---

## 🚀 Implementation Guide

- Replace particle rendering
- Add rotation + trail updates
- Keep physics intact

Expected:
- expressive particles
- readable motion
- identity-driven visuals
