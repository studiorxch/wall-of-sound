---
layout: default
title: Unified Behavior Panel
system: "WOS"
domain: "wall"
component: BehaviorPanel
version: v1.0.0
status: draft
date: 2026-04-26
---

# 0428_WOS_BehaviorPanel_v1.0.0

Version: v1.0.0  
Date: 04/28/2026  
Status: Draft

---

## Objective

Unify all behavior-related controls into a single panel:

- Motion (walker behavior)
- Emission (particles / FX)
- Mechanic (collision response)
- Future: interaction, audio coupling

Replace fragmented panels with:

> one inspector = one place to define what an object _does_

---

## Core Principle

```text
Object = geometry + behavior
```

Geometry is separate.
Behavior is unified.

Behavior Model
selection.behavior = {
motion: { ... },
emitter: { ... },
mechanic: { ... }
}

If behavior does not exist → panel shows defaults.

Panel Structure
BEHAVIOR

---

Mode
[ Static | Motion | Emitter | Hybrid ]

--- Motion ---
Mode: [ Pingpong | Loop | Once ]
Speed: [ slider ]

--- Emission ---
Source: [ Note | Stroke | Custom ]
Color: [ swatch grid + picker ]

Rate: [ slider ]
Spread: [ slider ]
Speed: [ slider ]
Size: [ slider ]
Life: [ slider ]
Style: [ dot | streak | glow ]

--- Mechanic ---
Type: [ None | Bumper | Ramp | Elastic ]
Strength: [ slider ]

--- Presets ---
[ Orbit | Fire | Smoke | Spark | Drip ]
Patch 1 — Merge Panels

Remove:

motion-inspector-block
emitter-specific UI (if separate)

Replace with:

<section id="behavior-panel"></section>
Patch 2 — Bind Selection

In syncSelection():

if (selection) {
renderBehaviorPanel(selection);
}
Patch 3 — Behavior Initialization

On selection:

selection.behavior = selection.behavior || {
motion: {
mode: "pingpong",
speed: 1
},
emitter: {
enabled: false,
rate: 40,
spread: 0.3,
speed: 120,
size: 3,
life: 1.0,
type: "dot",
colorSource: "note",
color: "#ffffff"
},
mechanic: {
type: "none",
strength: 1
}
}
Patch 4 — Motion Binding
selection.behavior.motion.mode = ui.motionMode.value
selection.behavior.motion.speed = Number(ui.motionSpeed.value)
Patch 5 — Emission Binding
selection.behavior.emitter.rate = ui.rate.value
selection.behavior.emitter.spread = ui.spread.value
selection.behavior.emitter.speed = ui.speed.value
selection.behavior.emitter.size = ui.size.value
selection.behavior.emitter.life = ui.life.value
selection.behavior.emitter.type = ui.type.value
selection.behavior.emitter.colorSource = ui.colorSource.value
selection.behavior.emitter.color = ui.color.value
Patch 6 — Color Resolution
function resolveBehaviorColor(selection) {
const e = selection.behavior.emitter

switch (e.colorSource) {
case "note":
return noteToColor(WOS.currentNote)

    case "stroke":
      return selection.color

    case "custom":
      return e.color

    default:
      return "#ffffff"

}
}
Patch 7 — Walker Sync

When creating walkers:

const b = selection.behavior

w.motionMode = b.motion.mode
w.speed = b.motion.speed

w.emitter = {
enabled: true,
rate: b.emitter.rate,
spread: b.emitter.spread,
speed: b.emitter.speed,
size: b.emitter.size,
life: b.emitter.life,
type: b.emitter.type,
color: resolveBehaviorColor(selection)
}
Patch 8 — Presets
function applyBehaviorPreset(selection, preset) {
Object.assign(selection.behavior.motion, preset.motion || {})
Object.assign(selection.behavior.emitter, preset.emitter || {})
}
Patch 9 — UI Behavior

Rules:

Panel only appears when object is selected
Sections collapse when unused
Mode controls visibility:
Static → hide motion/emitter
Motion → show motion only
Emitter → show emitter only
Hybrid → show both
Done Criteria
One panel replaces motion + emitter fragmentation
Selecting a stroke shows full behavior controls
Color system unified under emission
Presets apply across motion + emitter simultaneously
No duplicate UI systems remain
Implementation Guide
where code goes
controls.js → replace inspector logic
index.html → single behavior panel
what to run
select stroke → modify behavior → observe walker + particles
what to expect
one cohesive system controlling all motion and FX

---

# 🧠 Why this matters (big picture)

Right now your system is:

```text
Motion panel
Emitter panel
Mechanic panel

That’s tool-centric thinking.

This spec shifts you to:

What does this object DO?

That’s behavior-centric thinking.
```
