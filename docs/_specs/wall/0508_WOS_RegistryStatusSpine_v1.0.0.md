---
layout: spec
title: "WOS Registry Status Spine"
date: 2026-05-08
doc_id: "0508_WOS_RegistryStatusSpine_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "architecture"
component: "registry_status_spine"

type: "system-spec"
status: "active"
priority: "high"
risk: "medium"

summary: "Adds a lightweight registry/status spine to WOS so systems, tools, commands, modes, layer types, renderers, and channels are explicitly declared before deeper schema/UI refactoring."

depends_on:
  - "wall_current_0508_checkpoint"
enables:
  - "schema-driven-ui"
  - "bauhaus-pattern-grid"
  - "system-dev-hud"
  - "legacy-leakage-control"

tags:
  - "registry"
  - "schema"
  - "status"
  - "architecture"
  - "ui-truth"
---

# 0508_WOS_RegistryStatusSpine_v1.0.0

## 1. Goal

Add a lightweight registry/status spine to the existing `wall/` app so WOS can explicitly describe what systems, tools, commands, modes, layer types, renderers, and channels exist.

This is the first architecture-truth layer. It should make the system easier to inspect without rewriting the working app.

## 2. Assumptions

- Work only inside the active `wall/` directory.
- `wall/` has already been checkpointed and pushed.
- `wall_v20260508/` is a local backup and must not be touched.
- Existing app behavior should remain working.
- This pass is observational and structural first.
- Do not implement Bauhaus rendering in this pass.
- Do not refactor `main.js` globally in this pass.

## 3. Canonical Path For This Pass

The canonical architecture direction is:

```txt
Registry → Status → Schema → UI Reflection
```

For this pass, only implement:

```txt
Registry → Status → Debug Access
```

The UI should not be redesigned yet.

## 4. Architecture Guardian Rules

This implementation must reduce ambiguity, not increase it.

Before adding any new system, model, renderer, UI control, event path, or state field:

1. Identify the existing system it extends, replaces, or wraps.
2. Do not create a parallel runtime system.
3. Do not create a new duplicate UI path.
4. If an old path remains, label it `legacy` in the registry.
5. If a feature exists but is not wired, label it `unhooked`.
6. If a feature is real but not canonical, label it `experimental`.
7. Keep visible product UI unchanged unless required to load the registry safely.
8. Red/error styling is reserved only for blocking failures.

## 5. Files To Add

Create:

```txt
wall/engine/registry.js
```

## 6. Files To Touch

Touch only if necessary:

```txt
wall/index.html
wall/main.js
wall/styles.css
```

Do not touch other files in this pass unless required to load the registry safely.

## 7. Required Registry Shape

In `wall/engine/registry.js`, attach to the existing global namespace:

```js
(function initRegistry(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  SBE.Registry = {
    statuses: {},
    systems: {},
    tools: {},
    commands: {},
    modes: {},
    layerTypes: {},
    renderers: {},
    channels: {},
  };
})(window);
```

## 8. Required Statuses

Add these statuses:

```js
active;
selected;
available;
experimental;
legacy;
disabled;
unhooked;
error;
```

Use this meaning:

| Status         | Meaning                         |
| -------------- | ------------------------------- |
| `active`       | canonical/current/default       |
| `selected`     | currently selected by user      |
| `available`    | usable but not selected         |
| `experimental` | real but not canonical          |
| `legacy`       | old path kept for compatibility |
| `disabled`     | intentionally unavailable       |
| `unhooked`     | exists but not wired            |
| `error`        | blocking or broken              |

Each status should include:

```js
{
  (id, label, signal, showInUserUI, showInDevUI);
}
```

Use quiet semantics:

```js
active       → normal
selected     → accent
available    → quiet
experimental → muted
legacy       → muted
disabled     → disabled
unhooked     → flagged
error        → error
```

## 9. Register Core Systems

Register at least:

```txt
canvas
world
objects
sound
transport
selection
cache
devHud
```

Each item must include:

```js
{
  (id, label, status, visibleIn);
}
```

Optional fields:

```js
ownsState;
description;
```

Example:

```js
canvas: {
  id: "canvas",
  label: "Canvas",
  status: "active",
  ownsState: "state.canvas",
  visibleIn: ["canvasPanel", "devHud"]
}
```

## 10. Register Object Tools

Register at least:

```txt
pen
text
ball
midiImport
generateBauhausGrid
```

Each item should include:

```js
{
  (id, label, status, kind, icon, visibleIn);
}
```

For object creation tools, include:

```js
creates;
toolbarProperties;
```

Status guidance:

- `pen` = active
- `text` = available or experimental depending on current reliability
- `ball` = available
- `midiImport` = active
- `generateBauhausGrid` = experimental or active if already wired

Do not add new toolbar UI in this pass.

## 11. Register Commands

Register at least:

```txt
duplicateSelection
deleteSelection
groupSelection
ungroupSelection
undo
redo
```

Each command should include:

```js
{
  (id, label, status, shortcut, group, requires, visibleIn, hooked);
}
```

Important:

- Do not rewrite command handlers.
- Do not change keyboard shortcuts.
- Just register the known command capabilities.

## 12. Register Modes

Register at least:

```txt
select
transform
camera
draw
performance
```

Use `active`, `available`, or `experimental` honestly.

Do not change mode behavior.

## 13. Register Layer Types

Register at least:

```txt
background
grid
objectLayer
interactionOverlay
dataOverlay
devOverlay
```

Each layer type should include:

```js
{
  (id, label, status, family, visibleIn);
}
```

Layer family values:

```txt
visual
overlay
data
dev
```

## 14. Register Renderers

Register at least:

```txt
squareTiles
bauhausMinimal
```

Status guidance:

- `bauhausMinimal` = experimental if renderer is not fully implemented yet
- `squareTiles` = active or legacy depending on current default behavior

Each renderer should include:

```js
{
  (id, label, status, appliesTo, visibleIn);
}
```

## 15. Register Channels

Register at least:

```txt
master
gridNotes
collisions
walkers
ambient
midiOut
```

Each channel should include:

```js
{
  (id, label, status, type, visibleIn);
}
```

Channel type examples:

```txt
audio
eventAudio
midi
control
```

## 16. Add Script Tag

In `wall/index.html`, load the registry before `main.js`.

Add:

```html
<script src="./engine/registry.js"></script>
```

Place it before:

```html
<script src="./main.js"></script>
```

Do not reorder other scripts unless required.

## 17. Add Quiet Status CSS

In `wall/styles.css`, add a small status styling section.

Use opacity and subtle outlines only.

```css
[data-status="active"] {
  opacity: 1;
}

[data-status="available"] {
  opacity: 0.92;
}

[data-status="selected"] {
  opacity: 1;
  outline: 1px solid var(--accent);
}

[data-status="experimental"] {
  opacity: 0.78;
}

[data-status="legacy"] {
  opacity: 0.55;
  filter: grayscale(0.35);
}

[data-status="disabled"] {
  opacity: 0.38;
  pointer-events: none;
}

[data-status="unhooked"] {
  opacity: 0.55;
  border-style: dashed;
}

[data-status="error"] {
  opacity: 1;
  border-color: var(--danger, #ff4d4d);
}
```

Do not apply these styles to existing UI yet unless already safe.

## 18. Add Debug Helpers

In `wall/main.js`, after `_wos` exists, add:

```js
window._wos.debugRegistry = function debugRegistry() {
  return window.SBE && window.SBE.Registry ? window.SBE.Registry : null;
};

window._wos.listRegistryStatus = function listRegistryStatus() {
  var registry = window.SBE && window.SBE.Registry;
  if (!registry) return null;

  var output = {};
  Object.keys(registry).forEach(function (key) {
    if (key === "statuses") return;
    var group = registry[key];
    if (!group || typeof group !== "object") return;

    output[key] = Object.keys(group).map(function (id) {
      var item = group[id];
      return {
        id: item.id,
        label: item.label,
        status: item.status,
        visibleIn: item.visibleIn || [],
      };
    });
  });

  return output;
};
```

If `_wos` is created before state exists, place these helpers wherever existing debug helpers are safely attached.

## 19. Validation Helpers

Add one helper if useful:

```js
SBE.Registry.validate = function validateRegistry() {
  var registry = SBE.Registry;
  var errors = [];
  var warnings = [];

  function checkGroup(groupName) {
    var group = registry[groupName] || {};
    Object.keys(group).forEach(function (id) {
      var item = group[id];
      if (!item.id) warnings.push(groupName + "." + id + " missing id");
      if (!item.label) warnings.push(groupName + "." + id + " missing label");
      if (!item.status) warnings.push(groupName + "." + id + " missing status");
      if (item.status && !registry.statuses[item.status]) {
        errors.push(
          groupName + "." + id + " has unknown status: " + item.status,
        );
      }
    });
  }

  [
    "systems",
    "tools",
    "commands",
    "modes",
    "layerTypes",
    "renderers",
    "channels",
  ].forEach(checkGroup);

  return { errors: errors, warnings: warnings };
};
```

Expose through:

```js
_wos.validateRegistry();
```

if safe.

## 20. Forbidden Changes

Do not:

- rewrite `main.js`
- change Delete/Duplicate/Group behavior
- change keyboard shortcuts
- remove existing UI controls
- redesign the inspector
- implement Bauhaus rendering
- add a new Dev HUD UI panel yet
- create a second state system
- create a second command system
- touch `wall_v20260508/`

## 21. Test Checklist

After implementation:

- [ ] App loads without console errors.
- [ ] Existing canvas renders.
- [ ] Existing tools still work.
- [ ] Delete key still works.
- [ ] Cmd+D duplicate still works.
- [ ] MIDI import still works if already working.
- [ ] `_wos.debugRegistry()` returns `SBE.Registry`.
- [ ] `_wos.listRegistryStatus()` returns grouped registry items.
- [ ] `_wos.validateRegistry()` returns no errors.
- [ ] No new visible UI clutter appears.
- [ ] `wall_v20260508/` remains untouched.

## 22. Stop Condition

Stop when:

1. `wall/engine/registry.js` exists.
2. It loads before `main.js`.
3. Registry groups are populated.
4. Debug helpers can inspect registry status.
5. Existing app behavior is preserved.

Do not proceed into schema-driven UI or Bauhaus rendering in this pass.
