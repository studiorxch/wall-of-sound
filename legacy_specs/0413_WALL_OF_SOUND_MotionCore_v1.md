# 0413_WALL_OF_SOUND_MotionCore_v1.0.0

Generated: 04/13/2026

---

## 🎯 Goal

Introduce a minimal motion system for shapes that:

- supports basic XY movement and rotation
- loops cleanly (no drift or runaway values)
- is deterministic (same loop = same result)
- integrates into existing Shape system without breaking anything

---

## 🧠 Assumptions

- `state.shapes` exists
- each shape has:
  - `position {x, y}`
  - `rotation`
- render system already reads these values
- main loop exists (`tick` or similar)

---

## 🧱 Data Model Extension

Add motion to Shape:

```ts
type Motion = {
  enabled: boolean;

  // translation
  vx: number; // units per second
  vy: number;

  // rotation
  angularVelocity: number; // radians per second

  // loop behavior
  loop: boolean;
};
```

Extend Shape:

```ts
type Shape = {
  ...
  motion?: Motion;
};
```

---

## ⚙️ Core Motion Engine

### NEW: `engine/motionSystem.js`

```js
// engine/motionSystem.js

const MotionSystem = (() => {
  function updateShapeMotion(shape, dt, bounds) {
    const m = shape.motion;
    if (!m || !m.enabled) return;

    // --- POSITION UPDATE ---
    shape.position.x += m.vx * dt;
    shape.position.y += m.vy * dt;

    // --- ROTATION UPDATE ---
    shape.rotation += m.angularVelocity * dt;

    // --- LOOPING (WRAP AROUND CANVAS) ---
    if (m.loop && bounds) {
      shape.position.x = wrap(shape.position.x, bounds.width);
      shape.position.y = wrap(shape.position.y, bounds.height);
    }
  }

  function wrap(value, max) {
    if (value < 0) return value + max;
    if (value > max) return value - max;
    return value;
  }

  function updateAll(shapes, dt, bounds) {
    for (let i = 0; i < shapes.length; i++) {
      updateShapeMotion(shapes[i], dt, bounds);
    }
  }

  return {
    updateAll,
  };
})();
```

---

## 🔌 Integration

### 1. Add script to `index.html`

```html
<script src="./engine/motionSystem.js"></script>
```

Place it after:

```html
<script src="./engine/shapeSystem.js"></script>
```

---

### 2. Hook into main loop (`main.js`)

Find your main tick:

```js
function tick(time) {
```

Add BEFORE render:

```js
const dt = (time - lastTime) / 1000;
lastTime = time;

// --- MOTION UPDATE ---
MotionSystem.updateAll(state.shapes, dt, {
  width: canvas.width,
  height: canvas.height,
});
```

---

## 🧪 Test Setup

### Add a test shape with motion

Drop this somewhere after shape creation:

```js
const testShape = {
  id: "test-motion-1",
  kind: "square",
  position: { x: 300, y: 600 },
  rotation: 0,
  scale: 1,
  segments: [],

  motion: {
    enabled: true,
    vx: 40, // horizontal drift
    vy: 0,
    angularVelocity: 1, // slow spin
    loop: true,
  },
};

state.shapes.push(testShape);
```

---

## 🔁 Expected Behavior

- shape moves steadily across screen
- wraps cleanly at edges
- rotates continuously
- no jitter
- no acceleration drift

---

## 🚫 Constraints

- NO physics integration yet
- NO inspector UI
- NO easing / curves
- NO multiple motion layers
- deterministic only

---

## ⚡ Next Step (Do NOT build yet)

- motion presets (orbit, oscillate)
- motion per segment
- BPM-synced motion
- motion → audio coupling

---

## Final Principle

Motion should:

- enhance timing
- not override structure
- remain predictable

```
geometry defines pattern
motion defines variation
```
