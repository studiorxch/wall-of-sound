0410_WALL_OF_SOUND_WorldModeSystem_v1.0.0

Generated: 04/10/2026

---

## 🎯 Objective

Introduce a clean **World Mode System** that provides total separation between:

- Gravity-based physics (marble run / instrument)
- Swarm-based behavior (ambient / emergent system)

Goal:
→ eliminate conflicting forces
→ ensure predictable behavior
→ enable fast switching between modes

---

## ⚠️ Constraints

- Do NOT rewrite physics engine
- Do NOT modify emitter system
- Do NOT change collision system
- Do NOT affect audio/export pipeline
- Only modify:
  - state definition
  - tick() logic

---

## 🧱 Core Concept

Replace mixed-physics execution with **exclusive world modes**

```txt
Gravity World → deterministic motion
Swarm World → behavioral motion
```

---

## 🔧 Implementation Requirements

---

### 1. Add World State

```js
state.world = "gravity"; // "gravity" | "swarm"
```

---

### 2. Update tick() Execution

Refactor physics section to:

```js
if (state.world === "gravity") {
  // GRAVITY WORLD
  applyGravity(ball);
  applyDamping(ball);
  clampSpeed(ball);

  // NO swarm logic here
}

if (state.world === "swarm") {
  // SWARM WORLD
  updateSwarm(state.balls, dt);

  // NO gravity here
}
```

---

### 3. Remove Mixed Logic

Ensure these do NOT run together:

- gravity + swarm
- behavior forces + gravity
- stabilization impulses in gravity mode

---

### 4. Optional: Stabilization Guard

```js
if (state.world !== "gravity" && ball.collisionCount > 3) {
  applyStabilization(ball);
}
```

---

### 5. Optional UI Toggle

Simple toggle:

```html
<select id="world-mode">
  <option value="gravity">Gravity</option>
  <option value="swarm">Swarm</option>
</select>
```

Bind:

```js
state.world = worldModeSelect.value;
```

---

## 🧪 Expected Behavior

### Gravity Mode

- balls fall naturally
- ramps guide motion
- emitters produce marble streams
- predictable timing

### Swarm Mode

- particles cluster and orbit
- emergent movement
- ambient behavior

---

## 🚫 Do NOT Do

- Do NOT partially mix modes
- Do NOT run both systems simultaneously
- Do NOT add conditional hacks inside physics
- Do NOT modify emitter timing

---

## ✅ Success Criteria

- switching modes instantly changes behavior
- gravity mode has no swarm interference
- swarm mode has no gravity influence
- system remains stable and performant

---

## ⚡ Implementation Guide

- where:
  main.js → tick()

- run:
  toggle state.world manually

- expect:
  two completely different motion systems
  no conflicts or slow-motion behavior
