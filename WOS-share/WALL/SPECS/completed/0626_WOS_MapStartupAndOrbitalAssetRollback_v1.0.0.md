# 0626_WOS_MapStartupAndOrbitalAssetRollback_v1.0.0

## Project

**Project:** WOS  
**Spec Type:** Runtime Recovery / Visual Rollback  
**Version:** v1.0.0  
**Status:** Ready for implementation  
**Primary Goal:** Restore readable map startup and replace the current aggressive Orbital placeholder object with a restrained Earth/signal view.

---

## Problem Statement

The latest WOS runtime patch improved mode gating and transitions, but two core failures remain:

1. **Map startup is still visually missing.**
   - WOS boots into a starfield / dimmed surface instead of a readable map.
   - The map may technically exist, but it is not visually available to the user.
   - Startup correctness must be judged by what is visible, not by internal readiness flags alone.

2. **Orbital Mode defaults to the wrong object.**
   - The current bright cyan “portal/reactor orb” is too aggressive and visually unattractive as the default world presentation.
   - It reads like an experimental shader object, not Earth, not WOS, and not a music-listening space.
   - This look may remain as an optional FX preset, but it must not be the default Orbital view.

---

## Non-Negotiable Correction

WOS must always boot into a readable map.

```txt
WOS boot
→ readable map visible
→ Flight selected
→ Orbital inactive
→ Orbital canvas hidden
→ FX button hidden
```

Orbital Mode must default to a restrained Earth/signal view, not the portal/reactor orb.

```txt
Orbital default
→ dark Earth / signal globe
→ restrained atmosphere
→ low bloom
→ readable HUD
→ slow movement
```

---

## Runtime Ownership Boundary

WOS owns:

- map startup
- world runtime
- orbital view
- broadcast HUD
- transport modes
- visual environment state

PLAY may later drive WOS visuals through playlist/playback/flow state, but PLAY must not own the WOS world endpoint.

---

## Required Fixes

### 1. Restore Map Startup by Force

On initial load, before any optional visual system starts, enforce a clean map state.

Required behavior:

- Remove `wos-orbital-active` from `document.body`.
- Remove `wos-travel-state` from `document.body`.
- Hide Orbital canvas.
- Hide Orbital FX button.
- Restore map container opacity to `1`.
- Restore map filter to `none`.
- Restore map visibility to `visible`.
- Select `Flight` transport.
- Do not initialize Orbital as active.
- Do not display starfield as the default startup surface.

### 2. Treat Visual Readiness as Actual Visibility

`mapReady === true` is not enough.

Add a visual readiness check that confirms:

- map container exists
- map container has nonzero width/height
- Mapbox style is loaded
- at least one visible Mapbox canvas exists
- Orbital canvas is hidden
- body does not contain orbital active classes
- map opacity is above `0.95`
- map filter is empty or `none`

If this fails, log:

```txt
[WOS Startup] Map visual readiness failed
```

and include the exact failing reason.

### 3. Roll Back Orbital Default Object

The current blue portal/reactor look must be demoted to an optional preset.

Required default:

```js
currentPresetId: "deep_space_listen"
```

`deep_space_listen` should use:

- restrained atmosphere intensity
- low bloom
- low grain
- low scanlines
- low texture noise
- dark Earth/signal material
- subtle starfield
- no giant white cyan blast ring

`portal_orb` may remain as an optional experimental preset only.

### 4. Add Orbital Default Asset Guard

Orbital should not render if the selected preset or material fails to load.

Fallback order:

```txt
requested preset
→ deep_space_listen
→ minimal_dark_sphere
→ static dark background
```

Do not fall back to `portal_orb` automatically.

### 5. Transition Should Reveal Earth, Not Reactor Orb

Map → Orbital should stage toward a recognizable orbital environment:

```txt
map visible
→ map dims slightly
→ starfield fades in
→ horizon/atmosphere bridge appears
→ dark Earth/signal globe resolves
→ HUD enters orbital state
```

Do not use a full black fade as the main transition.

Do not reveal the portal/reactor object unless the user explicitly selects that preset.

---

## Files to Patch

```txt
wall/systems/runtime/WosStartupCoordinator.js
wall/systems/runtime/WosModeTransitionController.js
wall/systems/runtime/WosRuntimeModeState.js
wall/systems/runtime/WosEndpointGuard.js
wall/systems/orbital/OrbitalModeController.js
wall/systems/orbital/OrbitalPresetRegistry.js
wall/systems/orbital/OrbitalEffectState.js
wall/systems/orbital/OrbitalFxPanel.js
wall/systems/traversalControlDeck.js
wall/index.html
wall/styles.css
```

Patch only the required runtime and visual defaults. Do not add new unrelated visual features.

---

## Suggested Implementation Order

### 1. Startup Recovery

Patch startup first.

- Create or update `restoreMapStartupVisualState()`.
- Call it synchronously at runtime module load.
- Call it again when DOMContentLoaded fires.
- Call it again before map readiness is evaluated.

### 2. Visual Readiness Diagnostic

Add a function:

```js
function getMapVisualReadinessReport() {
  return {
    ready: boolean,
    failures: string[],
    mapContainerFound: boolean,
    mapCanvasFound: boolean,
    mapOpacity: string,
    mapFilter: string,
    orbitalCanvasHidden: boolean,
    bodyClasses: string
  };
}
```

Use the report in console logs.

### 3. Orbital Default Rollback

Patch preset defaults:

```js
const DEFAULT_ORBITAL_PRESET_ID = "deep_space_listen";
```

Ensure `portal_orb` is never selected by default.

### 4. FX Panel Preset Visibility

The FX panel should clearly show the active preset.

Required labels:

```txt
Deep Space Listen
Signal Earth
Particle Planet
Archive Orb
Route Transmission
Portal Orb / Experimental
```

The experimental preset should be visually labeled as optional.

### 5. Transition Recovery

Patch transition so the default reveal calls Orbital with `deep_space_listen` unless another preset was explicitly selected by the user.

---

## Acceptance Criteria

### Startup

- WOS boots into a readable map, not starfield.
- Flight is selected at startup.
- Orbital canvas is hidden at startup.
- FX button is hidden at startup.
- No unfinished proxy geometry appears in normal startup view.
- Startup diagnostic reports map visual readiness, not only logical readiness.

### Orbital

- Clicking Orbital enters Orbital Mode through a staged transition.
- Default Orbital view is restrained Earth/signal globe.
- The bright cyan portal/reactor object does not appear unless explicitly selected.
- FX panel shows the current preset.
- Portal Orb is labeled experimental or optional.

### Return

- Return to Map restores the readable map.
- Flight becomes selected.
- FX button hides.
- Orbital canvas hides.
- No starfield remains over the map.

---

## Testing Checklist

1. Hard refresh `wall/index.html`.
2. Confirm readable map appears before touching any controls.
3. Confirm Flight transport is selected.
4. Confirm no Orbital globe/starfield is visible on boot.
5. Click Orbital.
6. Confirm transition is not just black fade.
7. Confirm default Orbital is restrained Earth/signal globe, not portal orb.
8. Open FX panel.
9. Select Portal Orb manually and confirm it appears only by choice.
10. Return to Map.
11. Confirm map is readable again.
12. Hard refresh after returning and confirm map still boots correctly.

---

## Do Not Do

- Do not add more visual modes until startup is stable.
- Do not treat internal map readiness as sufficient.
- Do not make `portal_orb` the default.
- Do not let Orbital initialize visibly on boot.
- Do not hide map failure behind dark overlays.
- Do not continue developing PLAY/WOS bridge behavior until WOS startup is fixed.

---

## Expected Result

WOS opens on a readable map every time. Orbital is available but inactive until selected. When selected, Orbital transitions into a restrained Earth/signal view suitable for music listening. The current blue reactor object remains available only as an optional experimental preset.

## Implementation Guide

- **Where:** Patch `wall/systems/runtime/`, `wall/systems/orbital/`, `wall/systems/traversalControlDeck.js`, `wall/index.html`, and `wall/styles.css`.
- **What:** Enforce map startup visual restoration, add visual readiness diagnostics, demote `portal_orb` to optional, and make `deep_space_listen` the Orbital default.
- **Expect:** WOS boots to a readable map, Orbital no longer hijacks startup, and the default orbital world reads as restrained Earth/signal space instead of a bright cyan reactor object.
