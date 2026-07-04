# 0627_WOS_PresentationModeRoutingFix_v1.0.0

## Project

**Project:** WOS  
**Feature Layer:** Presentation Routing  
**Document Type:** Runtime Fix Spec  
**Version:** v1.0.0  
**Status:** Active Fix  
**Primary Runtime Owner:** WOS  
**Connected Systems:** Broadcast HUD, traversal controls, presentation tabs, transport modes, Orbital Earth

---

## Purpose

Fix the bug where all presentation modes route back to the map, including `card`.

This is not a visual issue. This is a routing/state ownership issue.

The goal is to separate **transport mode** from **presentation mode** so display targets such as Card, Website, Canvas, Kinetic Fish, and Extracted Theme do not get swallowed by the map runtime.

---

## Current Bug

Observed behavior:

```text
Select presentation mode
→ app routes to map
```

Even if the selected mode is:

```text
card
website
canvas
kinetic_fish
extracted_theme
```

The runtime behaves as if `map` is the only valid presentation target.

---

## Correct Mental Model

WOS has two different mode systems.

### Transport Mode

Transport controls describe how the user moves through the world.

```text
flight
drive
walk
bike
transit
orbital
```

Transport mode owns:
- movement behavior
- camera movement
- route launch behavior
- map/orbital movement state

### Presentation Mode

Presentation controls describe what display surface is active.

```text
map
card
split
website
canvas
kinetic_fish
extracted_theme
```

Presentation mode owns:
- display target
- renderer selection
- card/panel visibility
- non-map presentation surfaces
- placeholder diagnostics when a renderer is missing

### Required separation

Do not pass presentation modes into transport functions.

Forbidden:

```js
selectTransport("card")
selectTransport("website")
selectTransport("canvas")
```

Required:

```js
selectPresentationMode("card")
selectPresentationMode("website")
selectPresentationMode("canvas")
```

---

## Primary Failure Pattern

The bug likely exists because one or more of these is happening:

1. Presentation mode shares state with transport mode.
2. `selectTransport()` is reused for presentation buttons.
3. Unknown presentation modes silently fall back to `map`.
4. Card mode has no registered renderer and defaults to map.
5. Cleanup/restoration code forces the map after every mode change.
6. Body classes for presentation modes are cleared immediately.
7. UI active state changes but runtime renderer does not.

---

## Product Lock

A missing renderer must not silently route to map.

If a presentation mode has no renderer, show a diagnostic placeholder:

```text
CARD VIEW
Renderer not implemented yet.
Mode state is active.
```

This is better than pretending the mode is the map.

---

## Required Runtime Ownership

### Transport owner

Existing owner:

```text
wall/systems/traversalControlDeck.js
```

Transport functions:
- selectTransport()
- launch route
- stop/pause movement
- set speed/altitude/mode controls

### Presentation owner

Add or formalize:

```text
wall/systems/presentation/WosPresentationModeState.js
wall/systems/presentation/WosPresentationRouter.js
```

Presentation functions:
- selectPresentationMode()
- getPresentationMode()
- registerPresentationRenderer()
- activatePresentationRenderer()
- deactivatePresentationRenderer()
- showMissingRendererPlaceholder()

### Runtime state owner

Mode state should be explicit:

```text
transportMode: "flight" | "drive" | "walk" | "bike" | "transit" | "orbital"
presentationMode: "map" | "card" | "split" | "website" | "canvas" | "kinetic_fish" | "extracted_theme"
```

These must be separate fields.

---

## Required Files to Audit

Audit these first:

```text
wall/systems/traversalControlDeck.js
wall/systems/runtime/WosRuntimeModeState.js
wall/systems/runtime/WosModeTransitionController.js
wall/systems/orbital/OrbitalEarthMode.js
index.html
TopBar.tsx
```

Search for:

```text
presentationMode
selectedPresentationMode
activePresentation
selectPresentationMode
selectTransport
viewMode
renderTarget
card
website
canvas
kinetic
extracted
map
fallback
```

---

## Implementation Plan

### Step 1 — Identify the bad route

Search for any presentation mode passed into transport logic.

Examples:

```js
selectTransport(mode)
selectTransport("card")
selectTransport("website")
```

If found, replace with:

```js
selectPresentationMode(mode)
```

### Step 2 — Add presentation state

Create:

```text
wall/systems/presentation/WosPresentationModeState.js
```

Minimal state:

```js
const PRESENTATION_MODES = Object.freeze({
  MAP: "map",
  CARD: "card",
  SPLIT: "split",
  WEBSITE: "website",
  CANVAS: "canvas",
  KINETIC_FISH: "kinetic_fish",
  EXTRACTED_THEME: "extracted_theme",
});

function createDefaultPresentationState() {
  return {
    activeMode: PRESENTATION_MODES.MAP,
    previousMode: null,
    activeRenderer: "map",
    missingRenderer: null,
    updatedAt: Date.now(),
  };
}
```

Expose:

```js
SBE.WosPresentationModeState
```

### Step 3 — Add presentation router

Create:

```text
wall/systems/presentation/WosPresentationRouter.js
```

Required behavior:

```js
selectPresentationMode("card")
```

should:

1. Update presentation state.
2. Hide inactive presentation surfaces.
3. Activate the requested renderer.
4. If renderer missing, show placeholder.
5. Never call `selectTransport()`.

### Step 4 — Add placeholder renderers

For now, each missing presentation mode should show a visible placeholder instead of routing to map.

Required placeholders:

```text
CARD VIEW
WEBSITE VIEW
CANVAS VIEW
KINETIC FISH VIEW
EXTRACTED THEME VIEW
```

Each placeholder should show:
- mode name
- status
- renderer missing or active
- no map fallback

### Step 5 — Preserve map as one presentation renderer

The map remains valid, but only as:

```text
presentationMode = map
```

Do not let it become the fallback for all invalid modes.

### Step 6 — Update UI handlers

Presentation nav/tab buttons must call:

```js
SBE.WosPresentationRouter.selectPresentationMode("card")
```

not transport logic.

### Step 7 — Block silent fallback

If mode is unknown:

```js
throw or log diagnostic
show placeholder
do not route to map
```

Expected diagnostic:

```text
[WOS Presentation] BLOCKED unknown presentation mode: <mode>
```

---

## Required Public API

Add:

```js
SBE.WosPresentationRouter.selectPresentationMode(mode)
SBE.WosPresentationRouter.getPresentationMode()
SBE.WosPresentationRouter.registerRenderer(mode, renderer)
SBE.WosPresentationRouter.getRoutingReport()
SBE.WosPresentationRouter.showPlaceholder(mode, reason)
```

Add diagnostics:

```text
[WOS Presentation] SELECT
[WOS Presentation] RENDERER ACTIVE
[WOS Presentation] PLACEHOLDER
[WOS Presentation] BLOCKED
[WOS Presentation] ROUTING REPORT
```

---

## Renderer Contract

Each renderer should support:

```js
{
  mode: "card",
  enter(context) {},
  exit() {},
  isActive() {},
}
```

Map renderer can wrap existing map behavior.

Placeholder renderer can be generic.

---

## Placeholder Requirements

The placeholder should be visually obvious but simple.

Example:

```text
CARD VIEW
Renderer not implemented yet.
Presentation mode is active.
Transport mode remains: flight.
```

This confirms routing works even before the card design is complete.

---

## QA Test A — Card Mode

### Steps

```text
1. Boot WOS.
2. Click Card presentation mode.
```

### Expected

```text
Card placeholder or renderer appears.
Map does not reclaim the view.
Transport mode remains unchanged.
Presentation mode reports card.
```

### Fail if

```text
Map appears as if Card was ignored.
selectTransport("card") is called.
presentationMode remains map.
```

---

## QA Test B — Website Mode

### Steps

```text
1. Boot WOS.
2. Click Website presentation mode.
```

### Expected

```text
Website placeholder or renderer appears.
Map does not silently appear.
Presentation mode reports website.
```

---

## QA Test C — Canvas Mode

### Steps

```text
1. Boot WOS.
2. Click Canvas presentation mode.
```

### Expected

```text
Canvas placeholder or renderer appears.
No transport state changes.
No map fallback.
```

---

## QA Test D — Transport Independence

### Steps

```text
1. Select Drive transport.
2. Select Card presentation.
3. Return to Map presentation.
```

### Expected

```text
Transport mode remains Drive unless explicitly changed.
Presentation mode changes independently.
```

---

## QA Test E — Orbital Independence

### Steps

```text
1. Select Orbital transport.
2. Select Card presentation.
3. Select Map presentation.
```

### Expected

```text
Orbital transport state remains controlled by transport system.
Presentation routing does not call map fallback unexpectedly.
```

If this creates a UX conflict, log the conflict and block with diagnostic. Do not silently route to map.

---

## QA Test F — Unknown Mode

### Steps

```js
SBE.WosPresentationRouter.selectPresentationMode("bad_mode")
```

### Expected

```text
Blocked diagnostic.
No map fallback.
Previous presentation remains active or placeholder appears.
```

---

## Routing Report

Add:

```js
SBE.WosPresentationRouter.getRoutingReport()
```

Expected output:

```js
{
  activePresentationMode: "card",
  activeTransportMode: "flight",
  activeRenderer: "placeholder_card",
  knownRenderers: ["map", "card", "website", "canvas"],
  lastAction: "selectPresentationMode(card)",
  fallbackUsed: false,
  errors: []
}
```

---

## Acceptance Criteria

This fix is complete when:

1. Presentation mode and transport mode are separate state fields.
2. Presentation buttons do not call `selectTransport()`.
3. Card mode does not route to map.
4. Website mode does not route to map.
5. Canvas mode does not route to map.
6. Missing renderers show placeholders instead of map fallback.
7. Unknown modes log blocked diagnostics.
8. Transport state remains stable when presentation mode changes.
9. `getRoutingReport()` confirms active mode and renderer.
10. No existing Orbital Earth runtime locks are broken.

---

## Do Not Reopen Unless Broken

### Closed bad pattern

```text
All presentation modes fallback to map.
```

Status:

```text
Closed after this fix.
```

Reopen only if:

```text
A presentation mode again silently routes to map.
```

### Closed bad pattern

```text
Presentation modes reuse transport mode handlers.
```

Status:

```text
Closed after this fix.
```

Reopen only if:

```text
selectTransport() receives card, website, canvas, kinetic_fish, or extracted_theme.
```

---

## Final Principle

Transport answers:

```text
How are we moving?
```

Presentation answers:

```text
What are we showing?
```

They must not be the same switch.

## Implementation Guide

- **Where:** Add `wall/systems/presentation/WosPresentationModeState.js` and `wall/systems/presentation/WosPresentationRouter.js`; patch presentation tab handlers and `index.html` script load order.
- **What:** Split presentation state from transport state, route each presentation tab to its own renderer or placeholder, and block silent fallback to map.
- **Expect:** Card, Website, Canvas, Kinetic Fish, and Extracted Theme no longer collapse into Map; each mode becomes visible as its own active presentation target or diagnostic placeholder.
