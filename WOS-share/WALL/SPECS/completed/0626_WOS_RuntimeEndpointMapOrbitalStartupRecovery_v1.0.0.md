---
date: 2026-06-26
project: WOS
connected_system: PLAY
document_type: implementation_spec
version: v1.0.0
status: ready_for_build
build_id: 0626_WOS_RuntimeEndpointMapOrbitalStartupRecovery_v1.0.0
runtime_owner: WOS
control_source: PLAY playback / playlist / flow state
---

# 0626_WOS_RuntimeEndpointMapOrbitalStartupRecovery_v1.0.0

## Purpose

Stabilize the WOS runtime now that Orbital Mode has been added.

The current issue is not only visual. It is architectural: WOS and PLAY are starting to look like separate runtime endpoints instead of one WOS wall/runtime with optional PLAY/player control surfaces.

This build must restore a clean boundary:

```text
WOS = runtime shell / wall / world / map / orbital / broadcast environment
PLAY = playlist-centered audio-visual player and control source
Orbital Mode = WOS-owned environment that PLAY may drive
```

The goal is to fix map startup, make Map ⇄ Orbital transitions feel like travel, expose the missing Orbital FX panel clearly, reduce overpowered texture/glow defaults, and prevent duplicate endpoint drift.

---

## Environmental Assumptions

- Runtime entrypoint remains `wall/index.html`.
- WOS owns the visible world runtime.
- PLAY must not become the global app identity.
- Existing Orbital files live under `wall/systems/orbital/`.
- Current local test endpoint may vary, but the canonical wall runtime should resolve through one active wall entrypoint.
- No backend work is required for this build.
- No audio analyser hookup is required yet.
- This is a stabilization/recovery patch before expanding interactive walls or deeper audio-reactive features.

---

## Current Problems Observed

### 1. Map startup regression

The WALL is not reliably initializing the current map at startup. In some states, the screen becomes a muted grid/background with HUD present but no map or orbital object visible.

This must be treated as a blocker because WOS depends on the map as the primary environment.

### 2. Orbital transition is too abrupt

Current Orbital access behaves like a scene swap or pop-in. The intended behavior is:

```text
Map → rising camera → atmosphere bridge → orbital view
```

and the reverse:

```text
Orbital view → target marker → descent camera → map
```

The transition should feel like traveling by spaceship, not switching tabs.

### 3. Orbital FX panel is not discoverable

The spec defines an Orbital FX panel, but the current user-facing runtime does not make it obvious how to open it.

This makes Orbital Mode feel passive even though the design intent is performable.

### 4. Endpoint drift risk

There appear to be two practical endpoints:

```text
WALL endpoint
PLAY endpoint / app surface
```

This creates risk that features are built twice, state gets duplicated, and identity becomes unclear.

The correct model is one WOS runtime with optional player/control endpoints, not duplicate world runtimes.

### 5. Texture/noise effect is too strong

The current overlay/glow/noise produces a paper-grainy retro effect. This may be useful as a visual style, but it should not be locked as the default.

It must become an adjustable visual setting later. For now, default values should be reduced.

### 6. Static background mode is needed later

The still view is useful. WOS should eventually support a static background capture/freeze mode for stream use.

This is not the main build target, but the architecture should leave room for it.

---

## Non-Negotiable Architecture Boundary

### Correct ownership

```text
WOS owns:
- map startup
- wall runtime
- world modes
- orbital view
- transport controls
- HUD environment
- visual scene transitions
- static/freeze visual output

PLAY owns:
- playlist state
- playback state
- track metadata
- flow-curve state
- player controls
- audio-visual control signals
```

### Bridge ownership

```text
PLAY → WOS Visual Control Bridge → WOS-owned visual modes
```

The bridge may pass playback, playlist, and flow state into WOS. It must not imply that PLAY owns the WOS runtime.

### Forbidden language in code comments and UI

Avoid:

```text
PLAY Orbital Mode
PLAY world
PLAY map
PLAY runtime
PLAY wall
```

Use:

```text
WOS Orbital Mode
WOS Wall
WOS runtime
PLAY-controlled visual state
PLAY-to-WOS bridge
Player tab
```

---

## Endpoint Policy

### Canonical runtime endpoint

Use one canonical wall runtime entrypoint:

```text
wall/index.html
```

This is the active world/broadcast runtime.

### PLAY as functional control surface

If PLAY appears in the top bar, it must be scoped as a button or function:

```text
Player
PLAY
Deck
Audio
```

It must not appear as the total identity of the WOS runtime.

### Recommended top-bar model

Preferred:

```text
◇ WOS    Player    Flow-Curve    Scheduler    Broadcast HUD
```

Acceptable:

```text
◇ SURFACE    Player    Flow-Curve    Scheduler    Broadcast HUD
```

Also acceptable if keeping the legacy word:

```text
◇ WOS    PLAY    Flow-Curve    Scheduler    Broadcast HUD
```

But in this case, `PLAY` must visually behave like a functional tab, not the product title.

---

## Required Build Outcomes

By the end of this build:

1. WOS map initializes reliably at startup.
2. Orbital Mode does not break or obscure map initialization.
3. WOS has one canonical runtime entrypoint.
4. Orbital Mode is reachable from the transport deck without endpoint confusion.
5. Map ⇄ Orbital has a transitional state, even if V1 is simple.
6. Orbital FX panel has an obvious button and console fallback.
7. Default orbital glow/noise/texture intensity is reduced.
8. Static/freeze mode is preserved as a future feature path.

---

## Build Order

Follow this order strictly:

```text
Data layer → Logic layer → Interface layer
```

This patch is mostly logic/interface, but it must still preserve state contracts first.

---

# Data Layer

## 1. Add Runtime Mode State

Create or update:

```text
wall/systems/runtime/WosRuntimeModeState.js
```

If a runtime mode state file already exists, extend it instead of duplicating it.

### Required modes

```js
export const WOS_RUNTIME_MODES = Object.freeze({
  MAP: 'map',
  MAP_TO_ORBITAL: 'map_to_orbital',
  ORBITAL: 'orbital',
  ORBITAL_TO_MAP: 'orbital_to_map',
  STATIC_BACKGROUND: 'static_background',
});
```

### Required state shape

```js
export function createDefaultWosRuntimeModeState() {
  return {
    activeMode: WOS_RUNTIME_MODES.MAP,
    previousMode: null,
    transitionStartedAtMs: 0,
    transitionDurationMs: 2600,
    canonicalEntrypoint: 'wall/index.html',
    mapReady: false,
    orbitalReady: false,
    endpointRole: 'wos-wall-runtime',
  };
}
```

### Rules

- Runtime mode state must not depend on the DOM.
- It must not import Three.js.
- It must not import PLAY/player modules.
- PLAY may observe runtime mode; it must not own it.

---

## 2. Add Orbital Visual Defaults

Update:

```text
wall/systems/orbital/OrbitalEffectState.js
```

Add a separate visual intensity group so strong textures can be reduced without disabling Orbital Mode.

### Required fields

```js
visual: {
  atmosphereIntensity: 0.35,
  bloomIntensity: 0.22,
  textureNoiseIntensity: 0.12,
  grainIntensity: 0.08,
  glowRadius: 0.45,
  scanlineIntensity: 0.12,
  staticBackgroundEnabled: false,
}
```

### Default rule

The default Orbital view should feel cinematic and restrained, not overexposed.

---

# Logic Layer

## 3. Add Startup Coordinator

Create:

```text
wall/systems/runtime/WosStartupCoordinator.js
```

### Purpose

Guarantee map startup before optional visual modes claim the screen.

### Required behavior

1. Initialize base WOS shell.
2. Initialize map.
3. Confirm map ready or timeout with readable diagnostics.
4. Initialize optional visual systems after map registration.
5. Register Orbital Mode as available, not active.
6. Default to `MAP` mode unless explicitly requested.

### Expected API

```js
export class WosStartupCoordinator {
  constructor({ diagnostics, modeState, mapController, orbitalMode }) {}

  async boot() {}

  markMapReady() {}

  markOrbitalReady() {}

  getState() {}
}
```

### Critical rule

Orbital Mode must not automatically cover the map on startup.

---

## 4. Add Mode Transition Controller

Create:

```text
wall/systems/runtime/WosModeTransitionController.js
```

### Purpose

Handle transitions between Map and Orbital without pop-in.

### Expected API

```js
export class WosModeTransitionController {
  constructor({ modeState, mapController, orbitalMode, diagnostics }) {}

  async transitionToOrbital({ originLabel, destinationLabel } = {}) {}

  async transitionToMap({ targetLabel } = {}) {}

  cancelTransition(reason) {}

  getTransitionProgress(nowMs) {}
}
```

### V1 transition stages

#### Map → Orbital

```text
0%   lock map controls
15%  fade route/map labels
30%  begin camera pull-up or fake zoom lift
50%  fade in starfield/atmosphere
70%  reveal orbital globe
100% activate Orbital Mode and unlock Orbital FX controls
```

#### Orbital → Map

```text
0%   lock Orbital FX destructive controls
20%  select descent marker
40%  dim orbital atmosphere
60%  fade map back in
80%  restore map labels/controls
100% activate Map mode
```

### Fallback rule

If a real map camera lift cannot be safely implemented yet, use a V1 fake transition overlay:

```text
map dim → vertical lift grid → starfield fade → orbital reveal
```

This still feels like travel and avoids pop-in.

---

## 5. Endpoint Guard

Create:

```text
wall/systems/runtime/WosEndpointGuard.js
```

### Purpose

Prevent duplicate runtime ownership between WALL and PLAY.

### Expected behavior

- Detect whether current page is the WOS wall runtime.
- Detect whether it is embedded in a parent frame.
- Label role as `wos-wall-runtime`, `play-control-surface`, or `unknown`.
- Warn when a world/runtime module is loaded into the wrong endpoint.

### Expected API

```js
export function detectWosEndpointRole() {
  return {
    role: 'wos-wall-runtime',
    pathname: window.location.pathname,
    isEmbedded: window.parent !== window,
    canonicalEntrypoint: 'wall/index.html',
  };
}
```

### Rule

This guard should warn. It should not hard-crash the runtime.

---

## 6. Panel Visibility Contract

Update:

```text
wall/systems/orbital/OrbitalFxPanel.js
wall/systems/orbital/OrbitalModeController.js
```

### Required behavior

Orbital FX panel must be reachable through all of these:

```js
SBE.OrbitalMode.openFxPanel()
SBE.OrbitalMode.toggleFxPanel()
SBE.OrbitalMode.closeFxPanel()
```

It must also have a visible UI trigger:

```text
Orbital FX
```

or compact:

```text
FX
```

### Placement

Preferred placement:

```text
bottom-right above transport controls
```

Alternative:

```text
right-side HUD dock
```

### Rule

The panel cannot be hidden behind only console commands.

---

## 7. Static Background Hook

Add a future-safe method to:

```text
wall/systems/orbital/OrbitalModeController.js
```

### Expected API

```js
setStaticBackgroundEnabled(enabled) {}

captureStaticBackground() {}

restoreLiveOrbital() {}
```

### V1 behavior

- `setStaticBackgroundEnabled(true)` may freeze motion only.
- `captureStaticBackground()` may return `null` if canvas capture is not ready.
- Do not overbuild export/capture yet.

### Future use

This will allow WOS to create calm static orbital backgrounds for stream states.

---

# Interface Layer

## 8. Transport Deck Cleanup

Update:

```text
wall/systems/traversalControlDeck.js
```

### Required behavior

Transport buttons should represent WOS movement modes:

```text
Flight
Drive
Walk
Bike
Transit
Orbital
```

Orbital button should call the transition controller, not directly hard-switch the scene.

### Required click behavior

```js
transitionController.transitionToOrbital({
  originLabel: currentOriginLabel,
  destinationLabel: currentDestinationLabel,
});
```

Return to map should call:

```js
transitionController.transitionToMap({
  targetLabel: currentOriginLabel,
});
```

### Rule

Do not call `selectTransport('flight')` as the only return behavior unless it is wrapped inside transition completion.

---

## 9. Top-Bar Identity Cleanup

Update the top-bar source file. Exact file path must be confirmed before editing.

Likely candidates:

```text
wall/index.html
wall/systems/topBar.js
wall/systems/studioShell.js
wall/styles.css
```

### Required behavior

Top bar must not make PLAY the overall identity.

Preferred display:

```text
◇ WOS    Player    Flow-Curve    Scheduler    Broadcast HUD
```

If preserving PLAY:

```text
◇ WOS    PLAY    Flow-Curve    Scheduler    Broadcast HUD
```

### Rule

`PLAY` must be styled like a functional tab/button, not the masthead.

---

## 10. Visual Intensity Controls

Add settings to Orbital FX panel:

```text
Atmosphere
Bloom
Texture Noise
Grain
Scanlines
Glow Radius
Static Background
```

### Required behavior

- Defaults should be restrained.
- Existing intense look can be preserved as a preset.
- Add a preset named `Signal Bloom Max` only if useful.
- Do not make the overexposed cyan bloom the default.

---

## Recommended Preset Defaults

### Deep Space Listen

```js
{
  atmosphereIntensity: 0.22,
  bloomIntensity: 0.12,
  textureNoiseIntensity: 0.05,
  grainIntensity: 0.04,
  scanlineIntensity: 0.08,
  glowRadius: 0.28,
}
```

### Signal Earth

```js
{
  atmosphereIntensity: 0.32,
  bloomIntensity: 0.18,
  textureNoiseIntensity: 0.10,
  grainIntensity: 0.08,
  scanlineIntensity: 0.16,
  glowRadius: 0.38,
}
```

### Particle Planet

```js
{
  atmosphereIntensity: 0.42,
  bloomIntensity: 0.24,
  textureNoiseIntensity: 0.12,
  grainIntensity: 0.08,
  scanlineIntensity: 0.12,
  glowRadius: 0.45,
}
```

### Archive Orb

```js
{
  atmosphereIntensity: 0.16,
  bloomIntensity: 0.08,
  textureNoiseIntensity: 0.18,
  grainIntensity: 0.20,
  scanlineIntensity: 0.06,
  glowRadius: 0.20,
}
```

### Route Transmission

```js
{
  atmosphereIntensity: 0.34,
  bloomIntensity: 0.18,
  textureNoiseIntensity: 0.08,
  grainIntensity: 0.06,
  scanlineIntensity: 0.18,
  glowRadius: 0.40,
}
```

---

## Testing Checklist

### Startup

- Open `wall/index.html`.
- Map initializes without clicking anything.
- No Orbital canvas covers the map by default.
- No fatal console errors.
- Startup coordinator marks map ready.

### Endpoint discipline

- Runtime role is detected as `wos-wall-runtime`.
- Orbital modules do not create a second WALL/PLAY runtime.
- PLAY bridge returns safe no-ops when unavailable.
- Top bar does not position PLAY as global identity.

### Orbital transition

- Clicking Orbital begins a transition, not an instant pop.
- Map labels dim or fade before Orbital reveal.
- Orbital globe fades in after bridge stage.
- Return to Map transitions back and restores transport state.

### FX panel

- Visible FX button appears in Orbital Mode.
- `SBE.OrbitalMode.openFxPanel()` works.
- `SBE.OrbitalMode.toggleFxPanel()` works.
- All sliders visibly change the scene or safely no-op.
- Freeze/static toggle stops motion without breaking return.

### Visual defaults

- Default Orbital glow is not overexposed.
- Texture grain is subtle by default.
- Strong cyan bloom can be reached through preset or sliders.
- Static/freeze mode keeps a still background state available.

---

## Acceptance Criteria

This build is complete when:

1. WOS map initializes reliably at startup.
2. Orbital Mode is registered but not active by default.
3. Orbital can be entered through a travel-like transition.
4. Orbital can return to map through a travel-like transition.
5. The Orbital FX panel is discoverable from the UI.
6. Console access to the panel still works.
7. Default orbital visual intensity is reduced.
8. Strong retro/grain/cyan bloom look is available only as an adjustable or preset state.
9. Runtime endpoint ownership is explicit and logged.
10. PLAY remains scoped as player/control source, not global WOS identity.
11. No duplicate world endpoint is introduced.
12. Static/freeze background behavior exists as a minimal hook.

---

## Do Not Reopen

- Do not make PLAY the owner of Orbital Mode.
- Do not create a second world runtime for PLAY.
- Do not let Orbital Mode auto-cover the map on startup.
- Do not hide Orbital FX behind console-only commands.
- Do not make intense bloom/grain the default visual state.
- Do not implement interactive wall drawing in this build.

---

## Deferred

### Interactive walls

Future WOS endpoint category:

```text
Interactive Walls / Draw-on-wall surfaces
```

This belongs to a later subway/world interaction build. It should not be mixed into this startup/orbital recovery patch.

### Full audio analyser

The audio-reactive bridge remains stubbed or neutral unless a stable audio source exists.

### Static background capture/export

Only the hook is required now. Full capture/export can be built later.

---

## Expected Result

WOS opens into the map reliably, Orbital Mode is available as a controlled WOS environment, Map ⇄ Orbital feels like travel, the FX panel is visible, the heavy cyan/grain look is adjustable instead of forced, and PLAY remains properly bounded as the audio-visual player/control layer.

## Implementation Guide

- **Where:** Add runtime files under `wall/systems/runtime/`; update Orbital files under `wall/systems/orbital/`; update transport wiring in `wall/systems/traversalControlDeck.js`; confirm the exact top-bar source before changing identity labels.
- **What:** Implement `WosRuntimeModeState.js`, `WosStartupCoordinator.js`, `WosModeTransitionController.js`, `WosEndpointGuard.js`, then wire Orbital entry/return through transitions and expose a visible `Orbital FX` button.
- **Expect:** `wall/index.html` starts on the map, Orbital is entered through a spaceship-like transition, the FX panel is discoverable, visual intensity is controllable, and PLAY is no longer treated as a duplicate world endpoint.
