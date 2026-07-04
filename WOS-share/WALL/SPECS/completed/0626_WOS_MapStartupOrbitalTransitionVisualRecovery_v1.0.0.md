# 0626_WOS_MapStartupOrbitalTransitionVisualRecovery_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Wall runtime / map startup / orbital transition  
**Version:** v1.0.0  
**Status:** Recovery Patch Spec  
**Runtime Owner:** WOS  
**Connected System:** PLAY may provide playback/playlist signals only

---

## Purpose

Recover the WALL startup and orbital transition behavior after the first Orbital Mode integration.

Current observed problems:

1. WALL boots into a visually empty/star-like field instead of the expected map view.
2. The map technically exists, but appears missing until zoomed out or shifted.
3. Unfinished local texture/proxy geometry is visible where the map should be readable.
4. Orbital transition currently fades to black, then fades directly into a blue orbital object.
5. Orbital should feel like traveling from the map into space, not popping into a separate scene.

This patch must prioritize runtime correctness over new visual features.

---

## Architecture Boundary

WOS owns:

- WALL runtime
- Map view
- Orbital view
- Runtime mode state
- Camera transition
- HUD/world display

PLAY owns, or later may provide:

- playback state
- playlist state
- flow-curve state
- audio-reactive control signals

Orbital Mode remains a **WOS visual environment**. PLAY must not become the global runtime identity.

---

## Current Failure Description

### Map Startup Failure

Observed behavior:

- On startup, the canvas shows a dark/star field.
- Flight is selected, but the readable map is not visible.
- Zooming or moving exposes unfinished geometry/textures, proving the scene exists but the initial map/camera/layer state is wrong.

Likely causes to investigate:

- Orbital/starfield canvas or layer remains visible on map boot.
- Runtime mode state reports `MAP`, but visual layer visibility is still partially orbital.
- Camera starts in a bad altitude/position for the map.
- Map readiness is being marked before style/layers are fully visible.
- Placeholder/proxy geometry is enabled by default in the wrong view.
- Mapbox style/layer opacity may be dimmed and not restored after previous orbital transition.

### Orbital Transition Failure

Observed behavior:

```text
Map or blank map state
→ black fade
→ blue orbital object
```

Desired behavior:

```text
Readable map
→ camera lift / map recedes
→ labels and city fade down
→ atmosphere bridge appears
→ stars deepen
→ globe resolves
→ Orbital Mode active
```

The black fade can remain as a safety fallback, but it should not be the main transition language.

---

## Non-Goals

Do not add these in this patch:

- new orbital presets
- interactive wall drawing
- subway drawing surfaces
- audio analyser hookup
- new PLAY features
- visual complexity beyond recovery needs
- replacement of the full map renderer

---

## Required Fixes

## 1. Enforce Clean Startup State

On WALL boot:

- Runtime mode must be `MAP`.
- Orbital scene must be inactive.
- Orbital renderer/canvas must be hidden or non-rendering.
- Starfield must be disabled unless explicitly part of the map atmosphere layer.
- Map opacity must be restored to `1`.
- Transport must select `Flight` only after map view is visible.
- Camera must start at a known readable map coordinate/zoom/pitch/bearing.

Add a startup diagnostic summary:

```js
console.info('[WOS Runtime] startup state', {
  mode,
  mapReady,
  mapStyleLoaded,
  orbitalActive,
  selectedTransport,
  camera
});
```

Diagnostic must log once on boot, not every frame.

---

## 2. Add Map Visual Readiness Check

`WosStartupCoordinator` should not treat map as ready until:

- Map object exists.
- Map style is loaded.
- Core layers are available.
- Map container is visible.
- Map opacity is restored.
- Orbital overlay is hidden.

Recommended API:

```js
SBE.WosStartupCoordinator.isMapVisuallyReady()
SBE.WosStartupCoordinator.waitForMapVisualReady({ timeoutMs: 3000 })
```

If readiness fails, log a clear warning:

```js
console.warn('[WOS Startup] map visual readiness failed', reason);
```

Do not activate Orbital automatically as fallback.

---

## 3. Restore Map Layer Visibility on Return and Boot

Create a shared restoration function:

```js
SBE.WosModeTransitionController.restoreMapVisualState()
```

It must:

- hide orbital canvas/renderer
- stop or pause orbital rAF
- hide orbital FX button
- restore map container opacity
- restore HUD map mode styling
- clear stuck transition overlay
- reselect Flight when returning from Orbital

Use the same function on:

- boot
- failed transition
- Return to Map
- error recovery

---

## 4. Replace Pop Transition With Travel Bridge

The transition does not need to be physically perfect in v1.0.0, but it must read as travel.

### Map to Orbital Sequence

```text
0ms      lock controls
0-250ms  map remains visible, subtle dark overlay begins
250ms    HUD shifts to travel state
250-650ms map scales or camera eases upward if available
650ms    atmosphere/star bridge fades in
900ms    globe fades in behind bridge
1100ms   map fully hidden, Orbital active
```

### Orbital to Map Sequence

```text
0ms      lock controls
0-250ms  orbital glow lowers
250ms    destination/origin marker optional
250-650ms map fades back under orbital layer
650ms    orbital layer hidden
700ms    restore map visual state
900ms    controls unlock
```

Black overlay may be used only as a low-opacity transition mask, not as the whole experience.

---

## 5. Add Transition Fallbacks

If map is not visually ready when Orbital is clicked:

- do not enter Orbital
- show/log clear blocked reason
- keep user in Map mode

Example:

```js
console.warn('[WOS Transition] Orbital blocked: map is not visually ready');
```

If Orbital fails to initialize:

- clear overlay
- restore map visual state
- keep Flight selected
- log failure once

---

## 6. Hide Unfinished Texture/Proxy Geometry on Boot

Any unfinished placeholder/proxy geometry visible in map mode must be disabled by default.

Allowed:

- show in debug mode
- show in Studio authoring mode
- show when explicitly toggled

Forbidden:

- unfinished texture proxies visible in normal WALL boot
- authoring artifacts visible in Broadcast HUD mode by default

Recommended flag:

```js
SBE.WosRuntimeFlags.showDebugProxyGeometry = false;
```

---

## 7. Orbital Visual Defaults Stay Restrained

The blue orbital object is currently too aggressive as a default.

Default Orbital preset should reduce:

- glow radius
- bloom intensity
- texture noise
- grain
- scanline strength
- atmosphere opacity

The stronger blue star/portal look may remain as a preset, but not as the default entry state.

Suggested preset name:

```text
Signal Star / Portal Orb / Blue Reactor
```

Default should remain:

```text
Deep Space Listen
```

---

## Files to Inspect / Update

```text
wall/index.html
wall/systems/runtime/WosRuntimeModeState.js
wall/systems/runtime/WosEndpointGuard.js
wall/systems/runtime/WosStartupCoordinator.js
wall/systems/runtime/WosModeTransitionController.js
wall/systems/orbital/OrbitalModeController.js
wall/systems/orbital/OrbitalEffectState.js
wall/systems/orbital/OrbitalPresetRegistry.js
wall/systems/orbital/OrbitalFxPanel.js
wall/systems/traversalControlDeck.js
```

Also inspect any map/sky/proxy files that alter:

- map container opacity
- starfield visibility
- placeholder mesh visibility
- camera startup position
- Mapbox layer opacity

---

## Acceptance Criteria

This patch is complete when:

1. WALL boots into a readable map view every time.
2. Flight is selected on boot and matches the actual visible mode.
3. Orbital scene/starfield does not visually replace the map on boot.
4. Unfinished texture/proxy geometry is not visible in normal map mode.
5. Orbital button is available but does not auto-activate.
6. Clicking Orbital only works after map visual readiness passes.
7. Map → Orbital transition feels like lift/travel, not only black fade.
8. Orbital → Map transition restores readable map view.
9. FX button appears only while Orbital is active.
10. Static Background mode can freeze/restore without breaking return to map.
11. No global PLAY identity appears in the WOS shell.
12. Console logs identify startup mode, endpoint role, and map readiness once.

---

## Testing Checklist

Run these manually:

```text
1. Hard refresh WALL.
2. Confirm readable map appears without clicking anything.
3. Confirm Flight selected.
4. Confirm no Orbital/starfield takeover on boot.
5. Zoom out/in and confirm no unfinished proxy textures in default mode.
6. Click Orbital.
7. Confirm transition has visible travel/atmosphere staging.
8. Open FX panel.
9. Toggle Static BG.
10. Restore Live Orbital.
11. Return to Map.
12. Confirm readable map restored.
13. Repeat Orbital → Map twice.
14. Check console for single startup/readiness logs and no repeated warnings.
```

---

## Implementation Guide

- **Where:** Patch `wall/systems/runtime/WosStartupCoordinator.js`, `wall/systems/runtime/WosModeTransitionController.js`, `wall/systems/orbital/OrbitalModeController.js`, and any map/proxy visibility modules that affect startup.
- **What:** Enforce boot-to-map visual readiness, hide Orbital until selected, restore map opacity/layers on boot and return, block Orbital when map is not ready, and replace black-only fade with a staged travel bridge.
- **Expect:** WALL opens on a readable map, Orbital enters through a spaceship-like lift/atmosphere transition, the blue reactor look becomes optional rather than default, and map/orbital mode state stays synchronized.
