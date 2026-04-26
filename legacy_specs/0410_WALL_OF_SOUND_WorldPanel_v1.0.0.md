0410_WALL_OF_SOUND_WorldPanel_v1.0.0

Generated: 04/10/2026

---

## 🎯 Objective

Introduce a minimal **World Control Panel** to control physics behavior with clear separation between:

- Gravity (marble system)
- Flow (directional system - future)
- Zero-G (swarm / ambient)

Goal:
→ eliminate conflicting forces
→ give immediate control over motion behavior
→ unify physics under one system

---

## 🧱 Core State

```js
state.world = {
  mode: "gravity", // "gravity" | "flow" | "zero-g"
  strength: 3,
  direction: { x: 0, y: 1 }, // default: down
};
```

---

## 🔧 UI Panel (Minimal)

```html
<div id="world-panel">
  <label>World</label>
  <select id="world-mode">
    <option value="gravity">Gravity</option>
    <option value="flow">Flow</option>
    <option value="zero-g">Zero-G</option>
  </select>

  <label>Strength</label>
  <input
    id="world-strength"
    type="range"
    min="0"
    max="10"
    step="0.1"
    value="3"
  />

  <label>Direction</label>
  <select id="world-direction">
    <option value="down">Down</option>
    <option value="up">Up</option>
    <option value="left">Left</option>
    <option value="right">Right</option>
  </select>
</div>
```

---

## 🔁 Binding

```js
worldMode.oninput = () => {
  state.world.mode = worldMode.value;
};

worldStrength.oninput = () => {
  state.world.strength = parseFloat(worldStrength.value);
};

worldDirection.oninput = () => {
  const map = {
    down: { x: 0, y: 1 },
    up: { x: 0, y: -1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  state.world.direction = map[worldDirection.value];
};
```

---

## ⚙️ Physics Routing (CRITICAL)

Inside `tick()`:

```js
if (state.world.mode === "gravity") {
  for (const ball of state.balls) {
    applyGravityFromWorld(ball, state.world, dt);
    applyDamping(ball);
    clampSpeed(ball);
  }
}

// Swarm ONLY when zero-g
if (state.world.mode === "zero-g") {
  updateSwarm(state.balls, dt);
}
```

---

## 🌍 Gravity Function

```js
function applyGravityFromWorld(ball, world, dt) {
  const scale = dt * 60;

  ball.vx += world.direction.x * world.strength * scale;
  ball.vy += world.direction.y * world.strength * scale;
}
```

---

## 🚫 Rules

- NEVER run gravity + swarm together
- NO mixed physics
- NO conditional hacks inside same loop
- ONE world = ONE system

---

## 🧪 Expected Behavior

Gravity Mode:

- balls fall cleanly
- ramps guide motion
- emitter produces stream

Zero-G Mode:

- swarm behavior returns
- no gravity influence

---

## ⚡ Implementation Guide

where:

- main.js → tick()
- UI → panel binding

run:

- set mode = gravity
- add emitter + ramps

expect:

- clean marble behavior
- no slow-motion / no freezing
