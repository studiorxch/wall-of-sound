# 0414_WALL_OF_SOUND_PerformancePass_v1.0.0

## 🎯 Objective

Prepare the app for OBS / streaming use by:

- cleaning canvas (no HUD noise)
- fixing transport controls (Play/Pause instead of Stop/Rec dependency)
- introducing hidden edge-based emitters
- adding motion + timing control to emitters

DO NOT modify particle system, shape system, or lifecycle system.

---

## 🧠 Assumptions

- tick() drives physics + audio
- emitters already exist
- recording system exists but is tied incorrectly to transport
- renderFrame() handles draw loop

---

# ✅ 1. TRANSPORT SYSTEM

## State

```js
state.isPlaying = true;
state.isRecording = false;
```

---

## Tick Guard

```js
if (!state.isPlaying) return;
```

---

## Controls

Replace:

- STOP ❌
- REC (used as restart) ❌

With:

[ ▶ Play / ⏸ Pause ]  
[ ● Record ]  
[ ✖ Clear ]

---

## Behavior

Play → resumes simulation  
Pause → freezes simulation (no reset)  
Record → independent  
Clear → resets scene  

---

# ✅ 2. HUD CLEANUP

Remove from canvas:
- debug text (e.g. STOP 4L OT 44B)
- timing labels

Move ABOVE transport:

Loop: X Bars | Time: XX:XX

---

# ✅ 3. HIDDEN EMITTERS

## Zones

- top-center / left / right  
- left-top / mid / bottom  
- right-top / mid / bottom  
- bottom-center / left / right  

---

## Spawn

```js
function spawnFromEdge(zone) {
  switch(zone) {
    case "top-center":
      return {
        x: width / 2,
        y: -10,
        vx: random(-1, 1),
        vy: random(1, 3)
      };
  }
}
```

---

## Fields

```js
emitter.hidden = true;
emitter.zone = "top-center";
```

---

# ✅ 4. EMITTER MOTION

```js
emitter.motion = {
  enabled: false,
  type: "none" | "drift" | "oscillate",
  speed: 1,
  range: 50,
  origin: { x, y }
};
```

---

## Update

```js
function updateEmitterMotion(e, t, dt) {
  if (!e.motion.enabled) return;

  if (e.motion.type === "drift") {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  if (e.motion.type === "oscillate") {
    e.x = e.motion.origin.x + Math.sin(t * e.motion.speed) * e.motion.range;
  }
}
```

---

# ✅ 5. EMITTER TIMING

```js
emitter.timing = {
  mode: "continuous" | "pulse",
  rate: 200,
  interval: 500,
  lastSpawn: 0
};
```

---

## Logic

```js
if (emitter.timing.mode === "continuous") {
  spawn();
}

if (emitter.timing.mode === "pulse") {
  if (time - emitter.timing.lastSpawn > emitter.timing.interval) {
    spawn();
    emitter.timing.lastSpawn = time;
  }
}
```

---

# 🚀 Implementation Guide

## WHERE

- main.js → tick(), emitter logic  
- controls.js → transport + emitter UI  
- index.html → layout  

---

## RUN

- toggle play/pause  
- verify emitters spawn from edges  
- test motion + timing  

---

## EXPECT

- clean canvas  
- controlled emitters  
- stable playback  
