---
layout: spec
title: "WOS Minimal System HUD"
date: 2026-05-08
doc_id: "0508_WOS_MinimalSystemHUD_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "architecture"
component: "system_hud"

type: "implementation-spec"
status: "active"
priority: "high"
risk: "low-medium"

summary: "Adds a small toggleable System HUD that reads the existing Registry and Schemas layers, validates system health, and exposes architecture truth without redesigning the creative UI."

depends_on:
  - "0508_WOS_RegistryStatusSpine_v1.0.0"
  - "0508_WOS_SchemaStateSpine_v1.0.0"

enables:
  - "system-truth-ui"
  - "legacy-leakage-control"
  - "schema-driven-ui"
  - "bauhaus-pattern-grid-cleanup"

tags:
  - "system-hud"
  - "registry"
  - "schemas"
  - "dev-ui"
  - "diagnostics"
  - "ui-truth"
---

# 0508_WOS_MinimalSystemHUD_v1.0.0

## 1. Goal

Add a minimal toggleable System HUD to WOS.

The HUD should expose system truth from:

```txt
SBE.Registry
SBE.Schemas
_wos.validateRegistry()
_wos.validateSchemas()
```

This HUD is not a redesign of the app. It is a small diagnostic surface that helps confirm:

```txt
what exists
what is active
what is experimental
what is legacy
what is unhooked
whether registry/schema validation passes
```

## 2. Core Principle

```txt
Creative UI stays clean.
System truth stays inspectable.
Dev/system detail is hidden behind a toggle, not erased.
```

## 3. Assumptions

- Work only inside the active `wall/` directory.
- `wall_v20260508/` is a local backup and must not be touched.
- `wall/engine/registry.js` already exists and loads before `main.js`.
- `wall/engine/schemas.js` already exists and loads before `main.js`.
- `_wos.debugRegistry()`, `_wos.listRegistryStatus()`, `_wos.validateRegistry()`, `_wos.debugSchemas()`, and `_wos.validateSchemas()` already exist.
- Existing app behavior must remain working.
- This pass is a read-only diagnostic UI over existing Registry/Schemas/runtime state.

## 4. Files To Touch

Allowed:

```txt
wall/index.html
wall/styles.css
wall/main.js
```

Optional only if needed:

```txt
wall/ui/controls.js
```

Do not touch engine systems, renderer systems, MIDI systems, grid generation, collision, particles, shape systems, or material systems in this pass.

## 5. Forbidden Changes

Do not:

- redesign the inspector
- change Object / Canvas / World / Sound tabs
- change existing tools
- change keyboard shortcuts
- change Delete / Duplicate / Group behavior
- change MIDI import
- change grid generation
- change Bauhaus logic
- add new schema definitions
- add new registry groups
- create a second debug system
- create a second state system
- touch `wall_v20260508/`

## 6. UI Placement

Add one small button somewhere low-risk.

Preferred placement:

```txt
bottom-left fixed overlay
```

Button label:

```txt
SYS
```

Button behavior:

```txt
click → toggles System HUD open/closed
```

Do not add a keyboard shortcut in this pass unless it is clearly conflict-free.

## 7. Required HTML

Add this near the end of `body`, before the final inline overlay/context-menu script if possible:

```html
<button
  id="system-hud-toggle"
  class="system-hud-toggle"
  type="button"
  aria-expanded="false"
>
  SYS
</button>

<section id="system-hud" class="system-hud hidden" aria-hidden="true">
  <div class="system-hud__header">
    <div>
      <div class="system-hud__title">System HUD</div>
      <div class="system-hud__subtitle">Registry · Schemas · Runtime</div>
    </div>
    <button
      id="system-hud-close"
      class="system-hud__close"
      type="button"
      aria-label="Close System HUD"
    >
      ×
    </button>
  </div>

  <div class="system-hud__summary" id="system-hud-summary">
    <!-- populated by JS -->
  </div>

  <div class="system-hud__body">
    <details class="system-hud__section" open>
      <summary>Registry</summary>
      <div id="system-hud-registry"></div>
    </details>

    <details class="system-hud__section">
      <summary>Schemas</summary>
      <div id="system-hud-schemas"></div>
    </details>

    <details class="system-hud__section">
      <summary>Runtime</summary>
      <div id="system-hud-runtime"></div>
    </details>
  </div>
</section>
```

## 8. Required CSS

Add a compact, quiet style block to `wall/styles.css`.

Use muted opacity. Do not use red except for validation errors.

```css
.system-hud-toggle {
  position: fixed;
  left: 10px;
  bottom: 10px;
  z-index: 1200;
  width: 42px;
  height: 26px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: rgba(12, 13, 15, 0.88);
  color: var(--text-dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  cursor: pointer;
  opacity: 0.55;
}

.system-hud-toggle:hover,
.system-hud-toggle[data-open="true"] {
  opacity: 1;
  color: var(--accent);
  border-color: rgba(61, 216, 197, 0.35);
}

.system-hud {
  position: fixed;
  left: 10px;
  bottom: 44px;
  z-index: 1200;
  width: 320px;
  max-height: min(70vh, 620px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  background: rgba(12, 13, 15, 0.96);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.system-hud.hidden {
  display: none;
}

.system-hud__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--panel-border);
}

.system-hud__title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text);
}

.system-hud__subtitle {
  margin-top: 2px;
  font-size: 9px;
  color: var(--text-dim);
}

.system-hud__close {
  width: 24px;
  height: 24px;
  border: 1px solid var(--panel-border);
  border-radius: 5px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}

.system-hud__close:hover {
  color: var(--text);
  background: var(--active);
}

.system-hud__summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--panel-border);
}

.system-hud__metric {
  padding: 6px;
  border: 1px solid var(--panel-border);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.system-hud__metric-label {
  display: block;
  font-size: 8px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.system-hud__metric-value {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text);
}

.system-hud__body {
  min-height: 0;
  overflow: auto;
  padding: 8px 10px 10px;
}

.system-hud__section {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding: 7px 0;
}

.system-hud__section:first-child {
  border-top: 0;
}

.system-hud__section summary {
  cursor: pointer;
  color: var(--text);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.system-hud__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  font-size: 10px;
  color: var(--text-dim);
}

.system-hud__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.system-hud__badge {
  padding: 1px 5px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.8;
}

.system-hud__badge[data-status="experimental"],
.system-hud__badge[data-status="legacy"],
.system-hud__badge[data-status="unhooked"] {
  opacity: 0.55;
}

.system-hud__badge[data-status="error"] {
  color: #ff6b6b;
  border-color: rgba(255, 107, 107, 0.45);
}

.system-hud__validation {
  padding: 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-dim);
  font-size: 10px;
  margin-bottom: 6px;
}

.system-hud__validation[data-state="ok"] {
  color: var(--accent);
}

.system-hud__validation[data-state="error"] {
  color: #ff6b6b;
}
```

## 9. Required JS Behavior

Add System HUD functions inside `main.js`, after `_wos` debug helpers and after `state` exists.

Required functions:

```js
function getSystemHudData() {}
function renderSystemHud() {}
function toggleSystemHud(forceOpen) {}
function bindSystemHud() {}
```

Call:

```js
bindSystemHud();
```

after existing UI bind setup is safe.

## 10. Data Requirements

`getSystemHudData()` must read from existing helpers where possible:

```js
var registryStatus = window._wos.listRegistryStatus
  ? window._wos.listRegistryStatus()
  : null;
var registryValidation = window._wos.validateRegistry
  ? window._wos.validateRegistry()
  : null;
var schemaValidation = window._wos.validateSchemas
  ? window._wos.validateSchemas()
  : null;
var schemas = window.SBE && window.SBE.Schemas;
```

It should return:

```js
{
  (registryStatus, registryValidation, schemaValidation, schemaGroups, runtime);
}
```

Runtime should be minimal:

```js
runtime: {
  tool: state.tool,
  frame: state.frame,
  viewportMode: state.viewportMode,
  strokes: state.strokes.length,
  walkers: state.walkers.length,
  lines: state.lines.length,
  balls: state.balls.length,
  shapes: state.shapes.length,
  textObjects: state.textObjects.length,
  worldLayers: state.world.layers.length,
  midiCartridges: state.midiCartridges.length,
  midiBanks: state.midiBanks.length,
  gridBanks: Object.keys(state.gridBanks || {}).length,
  activeMidiBankId: state.activeMidiBankId,
  playing: !!isPlaying
}
```

## 11. Render Requirements

The HUD should show:

### Summary Metrics

At top:

```txt
Reg Errors
Schema Errors
World Layers
```

Use counts.

### Registry Section

Render grouped registry items from `_wos.listRegistryStatus()`.

Display each item as:

```txt
Label                 STATUS
```

Group headings can be plain text:

```txt
systems
tools
commands
modes
layerTypes
renderers
channels
```

### Schemas Section

Show:

```txt
Schema validation: OK / errors
Top-level schema count
Object schema count
Runtime schema groups
```

No giant schema dump.

### Runtime Section

Show small live counts:

```txt
Tool
Frame
Strokes
Walkers
Balls
World Layers
MIDI Banks
Grid Banks
Playing
```

## 12. Auto Refresh

The HUD should refresh when opened.

It may also refresh every 500ms while open.

Implementation:

```js
var systemHudRefreshId = null;
```

On open:

```js
renderSystemHud();
systemHudRefreshId = setInterval(renderSystemHud, 500);
```

On close:

```js
clearInterval(systemHudRefreshId);
systemHudRefreshId = null;
```

## 13. Safety Requirements

- HUD must not throw if Registry or Schemas are missing.
- HUD must show a quiet fallback message if helpers are missing.
- HUD must not mutate app state except `state.ui.systemHudVisible`.
- If adding `state.ui.systemHudVisible`, do not persist it.
- Do not depend on any registry group being complete.

## 14. Suggested JS Patch

Use this as the implementation template, adapting to existing `main.js` style:

```js
var systemHudRefreshId = null;

function getSystemHudData() {
  var registryStatus =
    window._wos && window._wos.listRegistryStatus
      ? window._wos.listRegistryStatus()
      : null;
  var registryValidation =
    window._wos && window._wos.validateRegistry
      ? window._wos.validateRegistry()
      : null;
  var schemaValidation =
    window._wos && window._wos.validateSchemas
      ? window._wos.validateSchemas()
      : null;
  var schemas = window.SBE && window.SBE.Schemas;

  return {
    registryStatus: registryStatus,
    registryValidation: registryValidation,
    schemaValidation: schemaValidation,
    schemaGroups: schemas ? Object.keys(schemas) : [],
    runtime: {
      tool: state.tool,
      frame: state.frame,
      viewportMode: state.viewportMode,
      strokes: state.strokes.length,
      walkers: state.walkers.length,
      lines: state.lines.length,
      balls: state.balls.length,
      shapes: state.shapes.length,
      textObjects: state.textObjects.length,
      worldLayers:
        state.world && state.world.layers ? state.world.layers.length : 0,
      midiCartridges: state.midiCartridges.length,
      midiBanks: state.midiBanks.length,
      gridBanks: Object.keys(state.gridBanks || {}).length,
      activeMidiBankId: state.activeMidiBankId,
      playing: !!isPlaying,
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function makeHudMetric(label, value) {
  return (
    '<div class="system-hud__metric">' +
    '<span class="system-hud__metric-label">' +
    escapeHtml(label) +
    "</span>" +
    '<span class="system-hud__metric-value">' +
    escapeHtml(String(value)) +
    "</span>" +
    "</div>"
  );
}

function makeHudRow(label, status) {
  return (
    '<div class="system-hud__row">' +
    '<span class="system-hud__name">' +
    escapeHtml(label) +
    "</span>" +
    '<span class="system-hud__badge" data-status="' +
    escapeHtml(status || "available") +
    '">' +
    escapeHtml(status || "available") +
    "</span>" +
    "</div>"
  );
}

function renderSystemHud() {
  var summaryEl = document.getElementById("system-hud-summary");
  var registryEl = document.getElementById("system-hud-registry");
  var schemasEl = document.getElementById("system-hud-schemas");
  var runtimeEl = document.getElementById("system-hud-runtime");
  if (!summaryEl || !registryEl || !schemasEl || !runtimeEl) return;

  var data = getSystemHudData();
  var regErrors =
    data.registryValidation && data.registryValidation.errors
      ? data.registryValidation.errors.length
      : 0;
  var schemaErrors =
    data.schemaValidation && data.schemaValidation.errors
      ? data.schemaValidation.errors.length
      : 0;

  summaryEl.innerHTML =
    makeHudMetric("Reg Errors", regErrors) +
    makeHudMetric("Schema Errors", schemaErrors) +
    makeHudMetric("Layers", data.runtime.worldLayers);

  var registryHtml = "";
  if (!data.registryStatus) {
    registryHtml =
      '<div class="system-hud__validation" data-state="error">Registry helpers missing</div>';
  } else {
    Object.keys(data.registryStatus).forEach(function (groupName) {
      var items = data.registryStatus[groupName] || [];
      registryHtml +=
        '<div class="system-hud__validation">' +
        escapeHtml(groupName) +
        "</div>";
      items.forEach(function (item) {
        registryHtml += makeHudRow(item.label || item.id, item.status);
      });
    });
  }
  registryEl.innerHTML = registryHtml;

  var schemaState = schemaErrors ? "error" : "ok";
  var schemaHtml =
    '<div class="system-hud__validation" data-state="' +
    schemaState +
    '">' +
    (schemaErrors ? "Schema errors: " + schemaErrors : "Schemas OK") +
    "</div>" +
    makeHudRow("Top-level schemas", String(data.schemaGroups.length)) +
    makeHudRow(
      "Object schemas",
      String(
        window.SBE && SBE.Schemas && SBE.Schemas.Objects
          ? Object.keys(SBE.Schemas.Objects).length - 1
          : 0,
      ),
    ) +
    makeHudRow(
      "Runtime groups",
      String(
        window.SBE && SBE.Schemas && SBE.Schemas.Runtime
          ? Object.keys(SBE.Schemas.Runtime).length
          : 0,
      ),
    );

  if (
    data.schemaValidation &&
    data.schemaValidation.errors &&
    data.schemaValidation.errors.length
  ) {
    data.schemaValidation.errors.forEach(function (err) {
      schemaHtml +=
        '<div class="system-hud__validation" data-state="error">' +
        escapeHtml(err) +
        "</div>";
    });
  }
  schemasEl.innerHTML = schemaHtml;

  var r = data.runtime;
  runtimeEl.innerHTML =
    makeHudRow("Tool", r.tool) +
    makeHudRow("Frame", String(r.frame)) +
    makeHudRow("Viewport", r.viewportMode) +
    makeHudRow("Playing", String(r.playing)) +
    makeHudRow("Strokes", String(r.strokes)) +
    makeHudRow("Walkers", String(r.walkers)) +
    makeHudRow("Lines", String(r.lines)) +
    makeHudRow("Balls", String(r.balls)) +
    makeHudRow("Shapes", String(r.shapes)) +
    makeHudRow("Text", String(r.textObjects)) +
    makeHudRow("World Layers", String(r.worldLayers)) +
    makeHudRow("MIDI Banks", String(r.midiBanks)) +
    makeHudRow("Grid Banks", String(r.gridBanks));
}

function toggleSystemHud(forceOpen) {
  var hud = document.getElementById("system-hud");
  var toggle = document.getElementById("system-hud-toggle");
  if (!hud || !toggle) return;

  var shouldOpen =
    typeof forceOpen === "boolean"
      ? forceOpen
      : hud.classList.contains("hidden");

  hud.classList.toggle("hidden", !shouldOpen);
  hud.setAttribute("aria-hidden", shouldOpen ? "false" : "true");
  toggle.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
  toggle.dataset.open = shouldOpen ? "true" : "false";

  if (state.ui) {
    state.ui.systemHudVisible = shouldOpen;
  }

  if (systemHudRefreshId) {
    clearInterval(systemHudRefreshId);
    systemHudRefreshId = null;
  }

  if (shouldOpen) {
    renderSystemHud();
    systemHudRefreshId = setInterval(renderSystemHud, 500);
  }
}

function bindSystemHud() {
  var toggle = document.getElementById("system-hud-toggle");
  var close = document.getElementById("system-hud-close");

  if (toggle) {
    toggle.addEventListener("click", function () {
      toggleSystemHud();
    });
  }

  if (close) {
    close.addEventListener("click", function () {
      toggleSystemHud(false);
    });
  }

  window._wos = window._wos || {};
  window._wos.renderSystemHud = renderSystemHud;
  window._wos.toggleSystemHud = toggleSystemHud;
  window._wos.getSystemHudData = getSystemHudData;
}
```

## 15. Required Call

After existing UI binding setup is complete, call:

```js
bindSystemHud();
```

Preferred placement:

```txt
after bindControls()
after inspector section toggles
before initial renderFrame()
```

## 16. DevTools Test

After reload, run:

```js
_wos.getSystemHudData();
_wos.toggleSystemHud(true);
_wos.renderSystemHud();
```

Expected:

- HUD opens.
- Registry section lists systems/tools/commands/modes/layerTypes/renderers/channels.
- Schemas section says `Schemas OK`.
- Runtime section updates counts.
- No console errors.

## 17. UI Smoke Test

Confirm:

- drawing still works
- selection still works
- Delete still works
- Cmd+D still works
- MIDI drop still works
- World tab still works
- HUD toggle opens/closes
- HUD does not block canvas unless open
- HUD is quiet and small

## 18. Stop Condition

Stop when:

1. `SYS` button toggles the HUD.
2. HUD reads Registry status.
3. HUD reads Schema validation.
4. HUD reads minimal runtime counts.
5. No existing WOS behavior changes.
6. No visible UI redesign occurs.

Do not proceed into schema-driven panels or Bauhaus cleanup in this pass.
