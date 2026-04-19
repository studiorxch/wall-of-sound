# 0416_WOS_Emitter_Unification_v1.0.0  
Generated: 04/16/2026  

---

## 🎯 GOAL

Unify the emitter system.

- Remove the **Emitter Tool completely**
- Move ALL emitter functionality into **Behavior: Emitter**
- Ensure system stability (no freezing, no tool conflicts)

---

## 🚫 HARD RULES

- DO NOT add documentation files  
- DO NOT refactor unrelated systems  
- DO NOT change rendering pipeline  
- DO NOT modify save/load format unless required  
- ONLY modify:
  - emitter tool removal
  - behavior emitter upgrades

---

# 🔴 PRIORITY 1 — REMOVE EMITTER TOOL

## Remove from UI

Delete emitter button:

<button class="tool" data-tool="emitter">

---

## Remove tool handling logic

Search and DELETE all logic branches like:

if (tool === "emitter") { ... }

or

case "emitter":

---

## Remove emitter tool inspector block

Delete:

<section id="emitter-inspector-block">

---

## Requirement

- App must NOT freeze when switching tools
- Ball tool must continue working after all actions

---

# 🟠 PRIORITY 2 — UNIFY EMITTER INTO BEHAVIOR

Emitter must ONLY exist as:

Behavior → Type → Emitter

---

## Extend existing emitter behavior

Locate behavior logic:

if (line.behavior.type === "emitter")

---

## Add required properties (SAFE DEFAULTS)

behavior.emitter = behavior.emitter || {
  rate: 400,
  speed: 6,
  spawnMode: "center",
  silent: false,
  quantize: false,
  quantizeDivision: 16
};

---

# 🟡 PRIORITY 3 — DIRECTIONAL EMISSION

const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);

const dirX = Math.cos(angle);
const dirY = Math.sin(angle);

ball.vx = dirX * behavior.emitter.speed;
ball.vy = dirY * behavior.emitter.speed;

---

# 🟢 PRIORITY 4 — SPAWN MODE

let spawnX = line.x1;
let spawnY = line.y1;

if (behavior.emitter.spawnMode === "edge") {
  const offset = 14;
  spawnX += dirX * offset;
  spawnY += dirY * offset;
}

---

# 🔵 PRIORITY 5 — SILENT MODE

if (!behavior.emitter.silent) {
  triggerSound(...);
}

line.color = "#000000";

---

# 🟣 PRIORITY 6 — QUANTIZED EMISSION

if (behavior.emitter.quantize) {
  const beatInterval = getQuantizedInterval(
    state.bpm,
    behavior.emitter.quantizeDivision
  );

  if (now - lastSpawn < beatInterval) return;
} else {
  if (now - lastSpawn < behavior.emitter.rate) return;
}

---

# 🟤 PRIORITY 7 — SLOWER EMITTER RANGE

rate: 100 → 8000 ms

---

# ⚫ PRIORITY 8 — STABILITY

if (!behavior || !behavior.emitter) return;

if (!Number.isFinite(ball.vx) || !Number.isFinite(ball.vy)) return;

---

# ✅ SUCCESS CRITERIA

- Emitter tool removed
- Behavior emitter works reliably
- Directional emission works
- No freezing
- Ball tool remains functional

---

# 🧪 VALIDATION TEST

1. Draw line  
2. Set Behavior → Emitter  
3. Rotate line → particles follow direction  
4. Enable silent → no sound  
5. Enable quantize → synced emission  
6. Set slow rate → visible pacing  
7. Use ball tool → still works  

---

## ⚡ MODEL TO USE

Claude Haiku 4.5

---

## END
