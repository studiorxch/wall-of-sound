---
layout: spec
title: "Particle Profile System"
date: 2026-04-26
doc_id: "0426_WOS_ParticleProfileSystem_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "rendering"
component: "particle_system"

type: "core-spec"
status: "active"
priority: "high"
risk: "low"

summary: "Introduces a particle profile layer that enables user-defined control over particle appearance, motion, and behavior. Replaces hardcoded particle values with configurable presets."

depends_on:
  - "particle_system"
enables:
  - "emitter_system"
  - "behavior_system"
  - "visual_feedback_layer"

tags:
  - particles
  - rendering
  - behavior
  - control
  - realtime
---

# 🎯 PURPOSE

Replace hardcoded particle behavior with a profile-based system that allows:

- consistent particle design
- expressive control over motion and appearance
- clear and visible particle output

This system must restore particle "feel" (size, motion, presence) while remaining compatible with the current particle engine.

---

# 🧠 CORE PRINCIPLES

- Particles are defined by **profiles**, not inline values
- Profiles must be **simple, readable, and editable**
- System must remain **deterministic and performant**
- Particles must be **visually obvious by default**
- No silent fallback to weak defaults

---

# 📦 DATA MODEL

```js
type ParticleProfile = {
  size: [number, number],
  speed: [number, number],
  life: [number, number],
  count: number,
  spread: number,
  gravity: number,
  drag: number,
  layer: "front" | "behind"
}

PROFILE REGISTRY

Define a global registry:

const PARTICLE_PROFILES = {
  burst: { ... },
  dust: { ... },
  glow: { ... }
};

Profiles must:

use meaningful ranges
default to visible, high-energy output
avoid tiny values (e.g. size < 6px)
🔧 CORE FUNCTION

Implement:

spawnProfile(profileName, x, y, color)

Behavior:

Look up profile
Loop count times
Randomize:
size
speed
life
Apply direction using spread
Spawn particles using existing createParticle
🔄 EXECUTION FLOW
event → spawnProfile(profile) → particles[] → update → render
🎨 RENDER LAYER (VISIBILITY REQUIREMENT)

Particles must be visible without requiring tuning.

Minimum visibility requirements:

Default size ≥ 8px
Speed must produce noticeable motion
Life must allow readable motion
Count must be sufficient to form a visible system
🔗 INTEGRATION POINTS

Profiles must be usable from:

emitter system
collision system
object behaviors
debug/test triggers
🧪 VALIDATION CHECKLIST

System is working when:

 "burst" produces large, visible outward particles
 "dust" produces trailing motion behind objects
 "glow" produces slow, ambient particles
 particles are clearly visible without manual tuning
 profile changes immediately affect behavior
🚫 NON-GOALS
No UI panel required in this version
No emitter redesign
No collision changes
No layering overhaul
🔜 FUTURE EXTENSIONS
Bind profiles to objects
Add UI control panel
Connect to emitter inspector
Enable per-shape particle presets
💬 NOTES

This system restores expressive particle behavior by removing hardcoded defaults and replacing them with user-definable profiles.

Particles must feel "alive" by default, not minimal or invisible.

Do not introduce weak fallback values that reduce visibility or motion.


---
```
