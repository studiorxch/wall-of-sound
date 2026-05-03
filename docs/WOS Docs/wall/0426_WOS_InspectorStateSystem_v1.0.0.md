---
layout: default
title: Inspector State System
system: "WOS"
domain: "wall"
component: InspectorSystem
version: v1.0.0
status: draft
date: 2026-04-26
---

# 0426_WOS_InspectorStateSystem_v1.0.0

Version: v1.0.0  
Date: 04/26/2026  
Status: Draft

---

## Objective

Unify all inspector UI behavior under a single deterministic system:

> selection → inspector state → UI render

Eliminate:

- scattered visibility toggles
- early return logic blocking UI
- duplicated panel systems (tab vs inspector)
- hidden feature behavior

Ensure all current and future tools (motion, emitter, text, etc.) are grouped and displayed consistently.

---

## Core Principle

```text
Selection is the single source of truth for inspector UI
```

No panel should decide its own visibility.

Architecture Overview
selection → getInspectorState() → renderInspector() → UI
Patch 1 — Inspector State Model

Create a centralized function:

function getInspectorState(selection) {
if (!selection) {
return {
mode: "none",
show: {}
};
}

switch (selection.type) {
case "stroke":
return {
mode: "stroke",
show: {
outline: true,
behavior: true,
mechanic: true,
motion: true,
emitter: true,
text: false
}
};

    case "group":
      return {
        mode: "group",
        show: {
          outline: true,
          behavior: true,
          mechanic: false,
          motion: true,
          emitter: true,
          text: false
        }
      };

    case "text":
      return {
        mode: "text",
        show: {
          outline: false,
          behavior: false,
          mechanic: false,
          motion: true,
          emitter: false,
          text: true
        }
      };

    default:
      return {
        mode: "unknown",
        show: {}
      };

}
}
Patch 2 — Inspector Renderer

Create a single render function:

function renderInspector(state, elements) {
toggle(elements.motionInspectorBlock, state.show.motion);
toggle(elements.textInspectorBlock, state.show.text);

toggle(byId("behavior-section"), state.show.behavior);
toggle(byId("mechanic-section"), state.show.mechanic);
toggle(byId("outline-section"), state.show.outline);
toggle(byId("emitter-section"), state.show.emitter);
}

function toggle(el, show) {
if (!el) return;
el.classList.toggle("hidden", !show);
}
Patch 3 — Replace syncSelection Logic

Inside syncSelection():

const inspectorState = getInspectorState(selection);
renderInspector(inspectorState, elements);
Patch 4 — Remove Early Return (Critical)

Remove any logic like:

if (selection.type === "stroke" || selection.type === "group") {
return;
}

This blocks UI updates and causes hidden panels.

Patch 5 — Panel Classification

Each inspector block must belong to a category:

Panel Key
Motion motion
Behavior behavior
Mechanic mechanic
Outline outline
Text text
Emitter emitter

Each panel must have:

<section id="motion-inspector-block" class="hidden"></section>
Patch 6 — Naming Rule (Important)

All inspector panels must follow:

{feature}-inspector-block

Examples:

motion-inspector-block
emitter-inspector-block
text-inspector-block
Patch 7 — Future Tool Integration

When adding a new tool:

Step 1 — Add capability flag
show: {
newFeature: true
}
Step 2 — Add panel

<section id="newFeature-inspector-block"></section>
Step 3 — Register in renderer
toggle(byId("newFeature-inspector-block"), state.show.newFeature);

No additional logic required.

Optional Upgrade — Capability-Based Model (Future)

Instead of hardcoding by type:

selection.capabilities = {
motion: true,
emitter: true,
behavior: true
};

Then:

toggle(motionPanel, selection.capabilities.motion);

This removes switch statements entirely.

Debug Hooks

Add temporary logs:

console.log("[Inspector]", selection.type, inspectorState);
Done Criteria
Selecting a stroke shows motion + emitter panels
Selecting text shows text panel only
No panel remains permanently hidden
No UI depends on manual tab switching
New tools integrate without modifying core logic
Implementation Guide
where code goes
controls.js → replace syncSelection logic, add helper functions
what to run
reload app → draw line → select → observe inspector
what to expect
panels appear consistently based on selection, no hidden features

---

## 🧠 What this unlocks (important)

Once this is in place:

- Motion brush becomes **visible and intentional**
- Future tools don’t break UI
- You stop chasing “why didn’t this show?”
- Inspector becomes **predictable**

---
