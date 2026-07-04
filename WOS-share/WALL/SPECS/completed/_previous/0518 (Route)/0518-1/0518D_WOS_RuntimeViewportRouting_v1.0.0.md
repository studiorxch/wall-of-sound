---
tag:
  - streaming
  - passive viewers
  - cinematic camera systems
  - passenger mode
  - mobile spectator mode
  - installations
  - OBS output
  - creator tooling
Needs:
  - route planning
  - visible movement
  - measurable traversal
  - recognizable geography
  - spatial continuity
  - camera travel
goals: prove traversal
---


# Review

The Correct Long-Term Structure
Eventually:

|Area|Responsibility|
|---|---|
|Workspace|documents/tabs/runtimes|
|Operator View|editing/debugging|
|Presentation View|cinematic output|
|Runtime|behavior + rendering|
|Inspector|runtime-aware panels|

---
![[Screenshot 2026-05-17 at 7.06.15 PM.png]]
# 0518D_WOS_RuntimeViewportRouting_v1.0.0

## Primary Goal

Decouple:

```
viewport behaviorrenderinginputcamera ownership
```

from:

```
global application state
```

and move ownership into:

```
active runtime
```

---

# Core Philosophy

Previously:

```
main.js owns the world
```

Now:

```
workspace selects documentdocument selects runtimeruntime controls viewport
```

This is the major transition.

---

# Architectural Outcome

After this spec:

|System|Responsibility|
|---|---|
|Workspace|document orchestration|
|Runtime|rendering + interaction|
|ViewportRouter|active runtime delegation|
|CanvasRenderer|low-level drawing only|
|main.js|bootstrap only|

---

# New Core File

## `wall/engine/runtimeViewportRouter.js`

This becomes:

```
the traffic controller
```

between:

- workspace
- runtimes
- viewport
- renderer
- input

---

# Core Responsibilities

## Active Runtime Resolution

```
getActiveRuntime()
```

Uses:

```
SBE.Workspace.getActiveDocument()
```

Returns:

```
doc.runtime
```

---

# Render Delegation

Instead of:

```
main.js renderEverything()
```

router performs:

```
runtime.renderOperatorOverlay(ctx)runtime.renderPresentationLayer(ctx)
```

depending on mode.

---

# Input Delegation

Mouse/keyboard events route into:

```
runtime.handlePointerDown()runtime.handlePointerMove()runtime.handlePointerUp()runtime.handleKeyDown()
```

if implemented.

No hard requirements yet.

Guard safely:

```
if (runtime.handlePointerDown)
```

---

# Camera Ownership

CRITICAL.

Current camera systems are globally owned.

Now:

```
runtime.getCameraTargets()
```

becomes canonical.

Router feeds:

```
camera systemsdirector modecuriosity systems
```

through a unified interface.

---

# Rendering Modes

Introduce:

```
SBE.ViewportMode
```

Modes:

```
"operator""presentation"
```

Default:

```
operator
```

---

# Operator Mode

Shows:

- handles
- overlays
- metrics
- labels
- debug infrastructure

Calls:

```
runtime.renderOperatorOverlay()
```

---

# Presentation Mode

Shows:

- cinematic visuals only
- audience-facing rendering
- no editing UI

Calls:

```
runtime.renderPresentationLayer()
```

---

# Runtime Interface Contract

Document this clearly.

## Optional Runtime Hooks

```
renderOperatorOverlay(ctx, options)renderPresentationLayer(ctx, options)update(dt)handlePointerDown(evt)handlePointerMove(evt)handlePointerUp(evt)handleKeyDown(evt)handleKeyUp(evt)getCameraTargets()serialize()deserialize()
```

All optional.

No rigid inheritance system yet.

---

# Important Constraint

DO NOT:

```
rewrite old systems into runtimes yet
```

Only:

```
route ownership through the router
```

This spec is infrastructure only.

Avoid feature explosion.

---

# RoutePlannerRuntime Integration

Router should already support:

```
routePlannerRuntime.renderOperatorOverlay()routePlannerRuntime.renderPresentationLayer()
```

immediately.

This becomes:

```
proof of architecture
```

---

# Main.js Refactor

Goal:

```
main.js becomes bootstrap + RAF only
```

Example:

```
function tick(ts) {  RuntimeViewportRouter.update(dt);  RuntimeViewportRouter.render(ctx);  requestAnimationFrame(tick);}
```

NOT:

```
huge branching render logic
```

---

# Important UI Addition

Add small mode toggle.

Suggested location:  
bottom-right viewport controls.

```
[ OP ] [ VIEW ]
```

or:

```
Operator / Presentation
```

This is foundational now.

---

# Future Importance

This spec unlocks:

|Future System|Enabled By|
|---|---|
|cinematic output|presentation mode|
|stream mode|presentation mode|
|editor overlays|operator mode|
|runtime-specific controls|viewport router|
|multi-viewports|router abstraction|
|mini-map|runtime rendering|
|passenger mode|runtime presentation|
|replay system|runtime camera ownership|

This is a VERY important spec.

---

# Suggested File Additions

```
wall/engine/runtimeViewportRouter.js
```

Optional:

```
wall/render/runtimeRenderBridge.js
```

only if needed.

---

# Expected Minimal Result

After implementation:

## Route document active:

- route runtime receives render calls
- overlays render through router
- presentation mode works

## Canvas document active:

- router safely falls back
- no crashes
- future runtime hooks possible

---

# Critical Guardrails

## DO NOT:

- move all render logic now
- rebuild renderer
- rewrite camera system
- create ECS
- over-abstract

This spec is:

```
delegation infrastructure
```

ONLY.

That discipline matters heavily right now.