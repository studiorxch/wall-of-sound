---
layout: spec
title: "ShapeTransformDuplicate"
date: 2026-04-09
doc_id: "0409_WALL_OF_SOUND_ShapeTransformDuplicate_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
domain: "wall"
system: "WOS"
component: "audio_system"
type: "legacy-spec"
status: "needs-review"
priority: "medium"
risk: "unknown"
summary: "Imported legacy Wall of Sound spec. Needs review."
---

0410_WALL_OF_SOUND_ShapeSystem_FixPack_v1.2.0_PROMPT

## Context

We are stabilizing the shape system. Shapes are now selectable with bounding boxes, but multiple core behaviors are broken or incomplete.

This is a fix-only pass.
Do NOT redesign architecture.
Do NOT introduce new systems.
Do NOT modify engine/collision/mechanics beyond wiring.

---

# OBJECTIVE

Make shapes behave as first-class objects with:

- correct duplication
- working transforms
- consistent color + sound behavior
- proper clearing
- reliable audio initialization

---

# FIX 1 — MechanicType not preserved

Ensure duplicateShape preserves:

- mechanicType
- behavior
- midi
- style

After copying each segment:
rebuildSoundConfig(segment)

---

# FIX 2 — clearScene

Add:
state.shapes = [];

---

# FIX 3 — Rotate / Scale

Add heldKeys system:

const heldKeys = new Set();

window.addEventListener("keydown", e => {
heldKeys.add(e.key.toLowerCase());
});

window.addEventListener("keyup", e => {
heldKeys.delete(e.key.toLowerCase());
});

Modify translateSelection:

if (state.selectedShapeId && SBE.ShapeSystem) {
const shape = state.shapes.find(s => s.id === state.selectedShapeId);
if (!shape) return;

if (state.selectedSegmentId) {
// segment logic
} else {
if (heldKeys.has("r")) {
SBE.ShapeSystem.rotateShape(shape, dx _ 0.01);
} else if (heldKeys.has("s")) {
SBE.ShapeSystem.scaleShape(shape, 1 + dx _ 0.01);
} else {
SBE.ShapeSystem.translateShape(shape, dx, dy);
}
}

renderFrame();
return;
}

---

# FIX 4 — Visual indicators

- draw 4 corner points
- draw rotation indicator (top center)
- cursor states:
  grab / rotate / resize

---

# FIX 5 — Color

Apply to all segments:

shape.segments.forEach(seg => {
seg.style.color = newColor;
seg.color = newColor;
});

---

# FIX 6 — Sound for shapes

After creating segments:

normalizeLineObject(segment)
rebuildSoundConfig(segment)

---

# FIX 7 — Audio init

window.addEventListener("pointerdown", () => {
ensureAudioContext();
}, { once: true });

---

# CONSTRAINTS

- no architecture changes
- no new systems
- no mechanic changes

---

# DONE

- duplicate preserves behavior
- clear removes shapes
- rotate/scale work
- color applies globally
- sound works for new shapes
- audio initializes properly
- bounding box shows indicators

---

# OUTPUT

Return:

- exact code changes
- file names
- minimal comments
