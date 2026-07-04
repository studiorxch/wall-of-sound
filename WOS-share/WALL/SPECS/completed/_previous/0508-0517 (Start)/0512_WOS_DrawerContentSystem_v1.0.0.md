---
layout: spec
title: "WOS Drawer Content System"
date: 2026-05-12
doc_id: "0512_WOS_DrawerContentSystem_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"
domain: "ui"
component: "DrawerContentSystem"

type: "system-spec"
status: "active"
priority: "high"
risk: "medium"

summary: >
  Formalizes how drawers host real WOS subsystems. Defines lifecycle,
  mount modes, persistence rules, focus ownership, width profiles, and
  event routing so drawers become runtime-mounted subsystem containers
  rather than temporary UI panels.

depends_on:
  - "UniversalDrawerSystem"
  - "SBE.DrawerSystem"
  - "state.ui"

enables:
  - "GlyphLab workspace"
  - "Mini map editor"
  - "MIDI router"
  - "Timeline editor"
  - "Asset browsers"
  - "AI context panels"

tags:
  - "drawer"
  - "lifecycle"
  - "subsystems"
  - "mounting"
  - "focus"
  - "persistence"
---

# PURPOSE

The drawer shell (0512_WOS_UniversalDrawerSystem) established:
launcher rail, panel open/close, DOM-move mounting, outside-click close,
ESC, and CSS transitions.

This spec defines what lives **inside** that shell:

- How subsystems initialize, mount, hide, and destroy
- How different system types map to different drawer behaviors
- How focus, keyboard, and MIDI ownership transfers to active drawers
- How drawers communicate with the WOS world state without spaghetti mutation
- The formal registry schema every future subsystem must implement

The strategic outcome: WOS gains a **modular operating environment**.
Every future subsystem — glyphs, maps, timelines, AI panels, asset browsers —
plugs in as a drawer workspace rather than a bespoke UI addition.

---

# CORE PRINCIPLES

1. **Drawers are subsystem containers, not panels.** A drawer hosts a live
   running system. It is not a div with some buttons.

2. **Lifecycle owns the system.** Systems initialize once, mount/unmount
   many times, and destroy only on explicit teardown. State survives
   between open/close cycles.

3. **Mount mode is declared at registration.** DOM-move and render-inject
   are both valid; the registry formalizes which is used.

4. **Focus is explicit.** Drawers that need keyboard input declare it.
   The shell routes events accordingly. Undeclared drawers do not steal focus.

5. **Events, not mutations.** Drawers communicate world changes via
   `SBE.Events.emit()`. They read state directly but write via actions.

6. **Canvas stability is non-negotiable.** No drawer open/close action
   may push, resize, or reflow the canvas element.

---

# DRAWER TYPES

```js
const DRAWER_TYPES = {
  // Auto-closes on outside click. No persistent state needed.
  // Use for: quick pickers, color selectors, note choosers.
  utility: "utility",

  // Stays open through outside clicks. Closes via ESC or button only.
  // Use for: editors where accidental close destroys work.
  workspace: "workspace",

  // Persists between open/close cycles (state survives close).
  // Use for: sampler (bank selection persists), map (tile cache survives).
  persistent: "persistent",

  // Floating: future — detaches from rail into moveable window.
  // Not implemented in v1. Declare intent now for forward compatibility.
  detachable: "detachable",
};
```

Behavioral matrix:

| Type          | Outside-click closes | ESC closes | State survives close | Dims inspector |
|---------------|---------------------|------------|----------------------|----------------|
| `utility`     | yes                 | yes        | no                   | no             |
| `workspace`   | no                  | yes        | yes                  | yes            |
| `persistent`  | yes                 | yes        | yes                  | subtle         |
| `detachable`  | no                  | yes        | yes                  | no             |

---

# DRAWER LIFECYCLE

## State machine

```
UNREGISTERED
    │
    │ registerDrawer()
    ▼
REGISTERED ──────────────────────────────────────────┐
    │                                                 │
    │ first openDrawer()                              │
    ▼                                                 │
INITIALIZING                                          │
    │ initialize() resolves                           │
    ▼                                                 │
INITIALIZED                                          │
    │                                                 │
    │ openDrawer()                                    │
    ▼                                                 │
  MOUNTED ──── hide() ──► HIDDEN ──── show() ──► MOUNTED
    │                                                 │
    │ closeDrawer()       closeDrawer()               │
    ▼                     ▼                           │
 UNMOUNTED ◄─────────────────────────────────────────┘
    │
    │ destroyDrawer()  [explicit, rare]
    ▼
 DESTROYED
```

## Lifecycle hooks

```js
{
  // Called ONCE on first open. Async-safe.
  // Use for: loading assets, initializing canvas systems, warming caches.
  // Do NOT use for DOM work — container is not yet available.
  initialize: async function() {},

  // Called every time drawer opens. Container element is passed.
  // For DOM-move drawers: physically moves element into container.
  // For render drawers: injects HTML into container.
  mount: function(container) {},

  // Called when drawer closes but system should stay alive.
  // For DOM-move drawers: moves element back to holding area.
  // Do NOT destroy state here.
  unmount: function(container) {},

  // Called when drawer is hidden WITHOUT unmounting.
  // Use for: pausing animations, silencing audio, reducing poll rate.
  // Container remains populated.
  hide: function() {},

  // Called when drawer is shown again after hide().
  // Use for: resuming animations, restarting polls.
  show: function() {},

  // Called only when explicitly destroyed (page unload, reset).
  // Use for: cancelling timers, releasing audio nodes, freeing memory.
  destroy: function() {},
}
```

## Initialization guard

DrawerSystem calls `initialize()` only once. Subsequent `openDrawer()` calls
skip to `mount()` directly. DrawerSystem tracks this per drawer id:

```js
_initialized = {}; // { [id]: true }

async function openDrawer(id) {
  if (!_initialized[id]) {
    if (typeof drawer.initialize === "function") {
      await drawer.initialize();
    }
    _initialized[id] = true;
  }
  drawer.mount(content);
}
```

---

# MOUNT MODES

Two modes exist. Declare the correct one at registration. Do not mix.

## Mode A — DOM Move (preferred for existing systems)

```js
mount(container) {
  var el = document.getElementById("my-system-root");
  el.style.display = "";
  container.appendChild(el);
},
unmount(container) {
  var el = document.getElementById("my-system-root");
  el.style.display = "none";
  document.getElementById("my-system-holding-area").appendChild(el);
},
```

**Properties:**
- All existing event listeners preserved (no re-binding needed)
- All element IDs preserved (existing JS finds them by ID regardless of DOM position)
- Live state (input values, selections, scroll position) survives close/reopen
- Zero allocation on reopen

**Use for:** Sampler, Library, any system that already exists in the DOM.

**Holding area:** Each DOM-move system requires a hidden holding area in HTML
where the element lives between drawer opens:

```html
<!-- Holding area — system elements return here when drawer closes -->
<div id="drawer-holding-area" style="display:none;" aria-hidden="true"></div>
```

## Mode B — Render Inject (for generated/dynamic drawers)

```js
render(container) {
  container.innerHTML = `<div class="drawer-view">...</div>`;
  // bind any events here
},
unmount(container) {
  container.innerHTML = ""; // teardown
},
```

**Properties:**
- Content is freshly generated on every open
- No state persistence (stateless by design)
- Isolated — side effects disappear on unmount
- Simpler to write

**Use for:** GlyphLab stub, quick pickers, generated tool UIs.

---

# WIDTH PROFILES

Named profiles map to CSS variable values. Override per-drawer.
`DrawerSystem.openDrawer()` applies the width at open time.

```js
const DRAWER_WIDTHS = {
  narrow:  280,   // utility drawers, quick-access tools
  medium:  420,   // default: sampler, library, settings
  wide:    560,   // GlyphLab, map browsers, asset viewers
  full:    "calc(100vw - var(--inspector-width) - var(--launcher-rail-width) - 50px)",
};
```

Registration uses either a named profile or an explicit pixel value:

```js
width: "medium"    // resolves to 420
width: "wide"      // resolves to 560
width: 520         // explicit override
```

DrawerSystem resolves the width before calling `openDrawer()`:

```js
function _resolveWidth(w) {
  if (typeof w === "number") return w + "px";
  return DRAWER_WIDTHS[w] || DRAWER_WIDTHS.medium + "px";
}
document.documentElement.style.setProperty("--drawer-width", _resolveWidth(drawer.width));
```

---

# PERSISTENCE RULES

```js
DrawerSystem.registerDrawer({
  // ...

  // Keep system alive between open/close cycles.
  // initialize() only fires once. unmount() parks the element, not destroys it.
  persistent: true,

  // Outside-click closes drawer (default: true for utility, false for workspace).
  closeOnOutsideClick: true,

  // ESC closes drawer (default: true always).
  closeOnEscape: true,

  // Outside-click is swallowed (not passed to canvas) when this drawer is open.
  // Use for: drawers where accidental canvas interactions are destructive.
  captureOutsideClick: false,
});
```

Persistence matrix in DrawerSystem:

```js
function _shouldCloseOnOutsideClick(drawer) {
  if (typeof drawer.closeOnOutsideClick === "boolean") return drawer.closeOnOutsideClick;
  // Defaults by type
  if (drawer.type === "workspace") return false;
  return true; // utility, persistent default to true
}
```

---

# FOCUS OWNERSHIP

## The problem

Without focus ownership, typing inside a drawer fires WOS keyboard shortcuts:
Delete key removes selected objects, Space toggles playback, arrow keys
move elements. This is catastrophic for text-input drawers (GlyphLab,
search fields, MIDI note labels).

## Declaration

```js
DrawerSystem.registerDrawer({
  // ...

  // Drawer contains text inputs or captures keyboard directly.
  // DrawerSystem suspends WOS keyboard shortcuts while this drawer is open.
  takesFocus: true,

  // Drawer contains a canvas or MIDI input that should capture wheel events.
  // DrawerSystem stops propagating wheel events to the WOS canvas.
  capturesWheel: false,

  // Drawer intercepts MIDI input (e.g., MIDI router, piano roll).
  // DrawerSystem suppresses WOS MIDI note-trigger while this drawer is open.
  capturesMidi: false,
});
```

## Runtime enforcement in DrawerSystem

```js
// On openDrawer():
if (drawer.takesFocus) {
  global._wos && global._wos.shortcuts && global._wos.shortcuts.suspend();
}

// On closeDrawer():
global._wos && global._wos.shortcuts && global._wos.shortcuts.resume();
```

`_wos.shortcuts.suspend()` / `.resume()` must be implemented in `main.js`
(stub acceptable in v1, enforced in v2).

Keyboard events INSIDE `#drawer-panel` should never bubble to WOS canvas
handlers. This is enforced at the drawer panel level:

```js
panel.addEventListener("keydown", function(e) {
  if (_activeDrawer && registry[_activeDrawer].takesFocus) {
    e.stopPropagation();
  }
});
```

---

# EVENT ROUTING & SHARED STATE

## Read: direct access is fine

Drawers may read WOS state directly:

```js
var state = window._wos && window._wos.state;
var banks = state && state.banks;
```

## Write: emit, do not mutate

Drawers must NOT directly mutate unrelated systems:

```js
// BAD — drawer directly mutating world state
window._wos.state.balls[0].color = "#ff0000";

// GOOD — drawer emits, world state handles
SBE.Events.emit("drawer:request", { action: "set-color", target: "selected", value: "#ff0000" });
```

## SBE.Events (minimal bus, v1)

```js
// ui/events.js — lightweight event bus
(function(global) {
  var _listeners = {};
  global.SBE = global.SBE || {};
  global.SBE.Events = {
    on:  function(event, fn) { (_listeners[event] = _listeners[event] || []).push(fn); },
    off: function(event, fn) { _listeners[event] = (_listeners[event] || []).filter(function(f) { return f !== fn; }); },
    emit: function(event, data) {
      (_listeners[event] || []).forEach(function(fn) { fn(data); });
    },
  };
})(window);
```

`main.js` subscribes to `"drawer:request"` and dispatches to the correct handler.

**Standard drawer events:**

| Event                     | Payload                     | Description                          |
|---------------------------|-----------------------------|--------------------------------------|
| `drawer:opened`           | `{ id }`                    | Drawer became visible                |
| `drawer:closed`           | `{ id }`                    | Drawer closed                        |
| `drawer:request`          | `{ action, target, value }` | Drawer requests world mutation       |
| `sampler:bank-selected`   | `{ bankId }`                | Sampler bank changed                 |
| `glyph:insert`            | `{ glyphId, position }`     | GlyphLab requests glyph insertion    |

---

# FULL REGISTRY SCHEMA

```js
SBE.DrawerSystem.registerDrawer({
  // ── Identity ────────────────────────────────────────────────────────────
  id:    "glyph",                  // unique string, kebab-case
  title: "GlyphLab",              // display name in drawer header
  icon:  "✒",                     // launcher rail icon (emoji or SVG string)

  // ── Classification ───────────────────────────────────────────────────────
  type:  "workspace",              // "utility" | "workspace" | "persistent" | "detachable"
  side:  "right",                  // "right" (v1 only; "left" reserved for future)

  // ── Dimensions ──────────────────────────────────────────────────────────
  width: "wide",                   // "narrow"|"medium"|"wide"|"full"|number(px)

  // ── Behavior ────────────────────────────────────────────────────────────
  persistent:          true,       // keep system alive between open/close cycles
  closeOnOutsideClick: false,      // workspace drawers don't close accidentally
  closeOnEscape:       true,       // ESC always closes
  captureOutsideClick: false,      // swallow outside click event (don't pass to canvas)

  // ── Focus ───────────────────────────────────────────────────────────────
  takesFocus:    true,             // suspend WOS keyboard shortcuts while open
  capturesWheel: false,            // intercept wheel events from canvas
  capturesMidi:  false,            // intercept MIDI input from WOS

  // ── Lifecycle ───────────────────────────────────────────────────────────
  initialize: async function() {
    // One-time setup. No container yet.
  },
  mount: function(container) {
    // Called on every open. Container is the #drawer-content element.
  },
  unmount: function(container) {
    // Called on close. Park DOM or clear HTML.
  },
  hide: function() {
    // Drawer hidden but not unmounted (future: multi-drawer stack).
  },
  show: function() {
    // Drawer revealed after hide().
  },
  destroy: function() {
    // Full teardown. Called on page unload or explicit reset.
  },
});
```

---

# IMPLEMENTATION ROADMAP

## v1 — current (implemented)

- [x] `mount()` / `unmount()` lifecycle
- [x] DOM-move and render-inject modes
- [x] `--drawer-width` CSS variable per drawer
- [x] outside-click close (centralized in DrawerSystem)
- [x] ESC close
- [x] `body.drawer-is-open` class for inspector dimming
- [x] Backdrop layer (covers canvas only)
- [x] `state.ui.activeDrawer` sync
- [x] Sampler and Library drawers (DOM-move)
- [x] GlyphLab stub (render-inject)

## v2 — next required

- [ ] `initialize()` async guard (one-time setup per drawer id)
- [ ] `persistent:` flag enforcement (skip full remount on reopen)
- [ ] `closeOnOutsideClick:` per-drawer override
- [ ] `takesFocus:` → `_wos.shortcuts.suspend/resume()`
- [ ] `_wos.shortcuts.suspend()` / `.resume()` stubs in main.js
- [ ] `SBE.Events` lightweight bus (`ui/events.js`)
- [ ] `"drawer:request"` subscription in main.js
- [ ] Holding area HTML (`#drawer-holding-area`) for DOM-move systems
- [ ] Width profile name resolution (`"wide"` → 560px)

## v3 — future

- [ ] `hide()` / `show()` for multi-drawer stack
- [ ] `capturesWheel:` wheel event routing
- [ ] `capturesMidi:` MIDI input routing
- [ ] `destroy()` on page unload
- [ ] Detachable drawer type (float into moveable window)
- [ ] Left-side drawer support
- [ ] Multi-drawer stack (two drawers open simultaneously)
- [ ] Docked drawer mode (pushes canvas slightly, does not overlay)

---

# DOCKING & DETACHMENT — FORWARD COMPATIBILITY

Not implemented in v1 or v2. Documented here so the architecture
is not accidentally incompatible.

```
v1:  position: fixed, right-side only, overlays canvas
v2:  same, plus focus/persistence system
v3+: dock mode (canvas reflows), detached mode (floating window)
```

**Dock mode** means the drawer takes a permanent column and the canvas
shrinks to accommodate it. This requires `--canvas-area-right` CSS var
and canvas resize notification to the render loop. Canvas must re-scale
its aspect-ratio fit on drawer open/close.

**Detached mode** means the drawer becomes a `position: fixed` floating
panel, unanchored from the rail, draggable, stackable. The rail button
toggles its visibility rather than its dock position.

**Multi-drawer stack** means two drawers can be simultaneously open,
stacked or side-by-side. Requires a `z-index` stack manager and
`hide()`/`show()` lifecycle.

The current architecture (grid column rail, fixed drawer panel, CSS vars
for widths) is intentionally compatible with all three futures.

---

# NON-GOALS

- Drawers do not replace the inspector panel
- Drawers do not push or resize the canvas in v1–v2
- Drawers do not render into the canvas (they are UI layer only)
- Drawers do not own persistent localStorage (systems inside them may)
- DrawerSystem does not know the semantics of the systems it hosts
- No React, no web components, no shadow DOM

---

# VALIDATION CHECKLIST

**Lifecycle**
- [ ] `initialize()` is called exactly once per drawer id per session
- [ ] `mount()` receives a live container element every open
- [ ] `unmount()` is called before content is cleared
- [ ] DOM-move drawers: element IDs remain accessible by `getElementById` while mounted

**Focus**
- [ ] `takesFocus: true` drawers: Delete key does not remove WOS objects
- [ ] `takesFocus: true` drawers: Space key does not toggle playback
- [ ] `takesFocus: false` drawers (default): WOS shortcuts work normally

**Persistence**
- [ ] `persistent: true` drawers: bank selection survives close/reopen
- [ ] `persistent: true` drawers: scroll position survives close/reopen
- [ ] `persistent: false` drawers: state resets on every open

**Canvas stability**
- [ ] Opening any drawer does not change canvas dimensions
- [ ] Opening any drawer does not move the canvas element
- [ ] Closing any drawer does not trigger canvas reflow

**Event routing**
- [ ] Drawers use `SBE.Events.emit()` for world mutations (v2)
- [ ] Drawers do not directly mutate `state.balls`, `state.emitters`, etc.

---

# NOTES

The sampler and library drawers in v1 use DOM-move mounting and have no
`initialize()`, `persistent:`, or `takesFocus:` declarations. They work
correctly today. These declarations should be added in v2 as the fields
are enforced.

GlyphLab is currently a stub (render-inject, no real content). Its
`type: "workspace"`, `closeOnOutsideClick: false`, and `takesFocus: true`
declarations should be set when the real GlyphLab system is implemented,
since those behaviors are catastrophic to get wrong (accidental close,
keyboard shortcut conflicts).

The `SBE.Events` bus does not yet exist. Until it does, drawers may
call `window._wos.*` methods for approved side-effect operations
(e.g., `_wos.refreshBankGrid()`). Direct state mutation outside
approved methods should be treated as technical debt.
