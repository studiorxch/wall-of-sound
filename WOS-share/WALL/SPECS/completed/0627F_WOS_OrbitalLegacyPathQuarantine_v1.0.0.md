# 0627F_WOS_OrbitalLegacyPathQuarantine_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Runtime Quarantine / Regression Prevention Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** F  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`
- `0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0.md`
- `0627E_WOS_OrbitalRuntimeOwnershipCleanup_v1.0.0.md`

---

## Purpose

Quarantine legacy Orbital paths so they cannot interfere with the default Mapbox-first Orbital Earth route.

This spec does not delete older visualizer work. It prevents old Three.js / portal / fake-sphere paths from becoming the default or silently affecting Orbital Earth.

The protected canonical route is:

```text
WOS map
→ Mapbox globe
→ Clean Orbital Earth
→ readable_orbit camera
```

---

## Active Scope Lock

The Orbital recovery lock remains active.

Do not add:

```text
new FX
new stars
new particles
new Moon features
new presentation controls
new transport buttons
new UI panels
new visual modes
new architecture systems
```

Allowed work:

```text
manual-only guards
legacy comments
default-route guards
diagnostics
blocked auto-entry logs
CSS scoping
preset quarantine
regression tests
```

---

## Current Problem

Earlier Orbital work included experimental paths:

```text
Three.js visualizer
fake Earth / sphere object
portal_orb
minimal_dark_sphere
deep_space_listen
signal sphere
particle planet
archive orb
static deep-space scene
```

These can be useful later, but they must not participate in the default Orbital route.

Any legacy path that can auto-run, dim the map, alter body classes, or build a fake planet during default Orbital entry is a regression risk.

---

## Quarantine Principle

Legacy Orbital paths may remain in the codebase only if they are:

```text
manual-only
explicitly named
guarded from default entry
diagnosed when called
unable to mutate Mapbox Earth defaults
```

They must not be reachable from the normal Orbital transport button unless an explicit non-earth submode is passed.

---

## Canonical Default Route

The only default route allowed:

```text
traversalControlDeck orbital button
→ WosStartupCoordinator.requestOrbitalEntry()
→ WosModeTransitionController.transitionToOrbital()
→ OrbitalMapContext.capture()
→ OrbitalModeController.enterFromMapContext(ctx, "earth")
→ OrbitalEarthMode.enter()
→ OrbitalEarthMode.applyCleanEarthBaseline()
→ OrbitalEarthMode.setCameraPreset("readable_orbit")
```

Default route must not call:

```text
_buildScene()
_applyPreset("portal_orb")
_applyPreset("deep_space_listen")
_applyPreset("minimal_dark_sphere")
Three.js renderer setup
fake-sphere creation
particle planet creation
```

---

## Legacy Paths to Quarantine

### Three.js Visualizer Path

Status:

```text
legacy / manual-only
```

Allowed only when an explicitly named non-earth submode is passed, such as:

```js
enterFromMapContext(context, "visualizer")
```

Forbidden during default Orbital entry.

### `portal_orb`

Status:

```text
experimental / manual-only
```

Forbidden as:

```text
default preset
fallback preset for Earth
auto-entry preset
hidden recovery fallback
```

### `deep_space_listen`

Status:

```text
legacy decorative preset / manual-only
```

Forbidden as default Earth route. May remain only for the legacy visualizer path.

### `minimal_dark_sphere`

Status:

```text
emergency legacy visualizer fallback only
```

Forbidden as Mapbox Earth fallback.

### Particle / Signal / Archive Sphere

Status:

```text
future manual visualizer family
```

Not part of Orbital Earth recovery.

---

## Required Guards

### Guard 1 — Earth submode bypasses legacy scene build

In `OrbitalModeController.enterFromMapContext(ctx, submode)`:

```js
if (submode === "earth") {
  // Mapbox-first path only.
  // Do not build Three.js scene.
  // Do not apply legacy presets.
}
```

Required behavior:

```text
earth submode does not call _buildScene()
earth submode does not call _applyPreset()
earth submode does not touch Three.js objects
```

---

### Guard 2 — Legacy path requires explicit submode

Non-earth path must require explicit naming.

Do not treat undefined, null, or unknown submode as visualizer.

Required default:

```js
submode = "earth"
```

Unknown submode should block or fall back to Earth, not visualizer.

---

### Guard 3 — Legacy CSS must not affect Earth

Any CSS intended for legacy visualizer dimming must exclude Earth mode.

Correct pattern:

```css
body.wos-orbital-active:not(.wos-orbital-earth-active) .mapboxgl-map {
  /* legacy visualizer dimming only */
}
```

Forbidden:

```css
body.wos-orbital-active .mapboxgl-map {
  filter: brightness(0.08);
}
```

---

### Guard 4 — Legacy presets cannot become Earth fallbacks

Fallback chain for Earth must not include:

```text
portal_orb
deep_space_listen
minimal_dark_sphere
```

If Mapbox Earth cannot initialize, report the failure. Do not silently create a fake sphere.

Allowed failure behavior:

```text
[WOS Orbital] EARTH ENTRY BLOCKED — Mapbox globe unavailable
```

Forbidden failure behavior:

```text
Mapbox globe fails → fake sphere appears
```

---

### Guard 5 — Diagnostics identify legacy mode

If a legacy visualizer path is manually entered, log:

```text
[WOS Orbital] LEGACY VISUALIZER ENTERED
```

Include:

```js
{
  submode,
  preset,
  manualOnly: true,
  defaultRoute: false
}
```

---

## Required Diagnostic API

If practical, add or extend:

```js
SBE.OrbitalModeController.getLegacyPathReport?.()
```

Minimum report:

```js
{
  defaultSubmode: "earth",
  earthBypassesLegacyScene: true,
  legacyManualOnly: true,
  legacyCssScopedAwayFromEarth: true,
  earthFallbackUsesFakeSphere: false,
  legacyPresets: [
    "portal_orb",
    "deep_space_listen",
    "minimal_dark_sphere"
  ],
  defaultRouteCallsBuildScene: false,
  defaultRouteCallsApplyPreset: false
}
```

Do not add this if it requires broad architecture changes. A console/report comment is acceptable.

---

## Search / Audit Requirements

Search these terms:

```text
_buildScene
_applyPreset
portal_orb
deep_space_listen
minimal_dark_sphere
signal_earth
wos-orbital-active
wos-orbital-earth-active
new THREE
THREE.Scene
fallback
defaultPreset
presetId
submode
enterFromMapContext
```

Report whether each is:

```text
default path
manual-only path
legacy path
safe fallback
unsafe fallback
unknown
```

---

## Required Classification Table

Developer must report:

| Path / Preset | File | Status | Default Reachable? | Action |
|---|---|---|---:|---|
| Mapbox Earth | `OrbitalEarthMode.js` | current | yes | keep |
| Three.js visualizer | `OrbitalModeController.js` | legacy/manual-only | no | quarantine |
| `portal_orb` | preset registry | experimental/manual-only | no | quarantine |
| `deep_space_listen` | preset registry | legacy/manual-only | no | quarantine |
| `minimal_dark_sphere` | preset registry | emergency legacy fallback | no | quarantine |
| fake sphere | legacy scene | legacy/manual-only | no | quarantine |

---

## QA Procedure

### Test A — Default Orbital Entry

1. Start WOS.
2. Select Orbital.
3. Inspect route logs.

Expected:

```text
OrbitalModeController.enterFromMapContext(ctx, "earth")
OrbitalEarthMode.enter()
Clean Earth baseline applied
readable_orbit selected
```

Fail if:

```text
_buildScene() called
_applyPreset("portal_orb") called
_applyPreset("deep_space_listen") called
fake sphere created
Three.js scene initialized
```

---

### Test B — Unknown Submode

Run:

```js
SBE.OrbitalModeController.enterFromMapContext(ctx, "bad_submode")
```

Expected:

```text
blocked diagnostic or fallback to earth
no visualizer auto-entry
no fake sphere
```

---

### Test C — Manual Legacy Entry

If a manual legacy entry method exists, call it explicitly.

Expected:

```text
legacy diagnostic appears
manualOnly: true
defaultRoute: false
```

Do not add UI for this.

---

### Test D — Earth CSS Protection

In Earth mode, verify:

```text
body has wos-orbital-earth-active
legacy dim CSS does not apply
map filter is not brightness(0.08)
```

Use:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
```

Expected:

```text
no destructive map filter suspect
```

---

## Acceptance Criteria

This spec is complete when:

1. Default Orbital entry cannot call Three.js scene build.
2. Default Orbital entry cannot apply legacy visualizer presets.
3. Unknown submodes do not silently enter legacy visualizer.
4. Legacy CSS does not dim Mapbox Earth.
5. Fake sphere is not an Earth fallback.
6. `portal_orb` is manual-only.
7. `deep_space_listen` is manual-only or legacy visualizer-only.
8. `minimal_dark_sphere` is emergency legacy visualizer-only.
9. Legacy path status is documented.
10. No new visuals are added.
11. No presentation controls are added.
12. No Moon expansion is added.
13. No transport buttons are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Legacy path classification table:
Default route audit:
Unknown submode behavior:
Legacy CSS audit:
Fake-sphere fallback status:
Manual-only guards added:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No new visuals added.
No presentation controls added.
No Moon expansion added.
No transport buttons added.
```

---

## Stop Conditions

Stop and report if:

```text
default route still reaches _buildScene()
default route still reaches _applyPreset()
unknown submode enters Three.js visualizer
Mapbox Earth can silently fall back to fake sphere
legacy CSS still applies to Earth mode
quarantine would require deleting large modules
```

Do not rewrite the whole Orbital stack.

---

## Final Principle

Legacy Orbital can stay.

It cannot steer.

Default Orbital Earth must remain:

```text
Mapbox-first
Clean Earth
readable_orbit
no fake sphere
no portal fallback
no silent visualizer fallback
```

## Implementation Guide

- **Where:** Audit `OrbitalModeController.js`, `OrbitalPresetRegistry.js`, `OrbitalEffectState.js`, `OrbitalEarthMode.js`, and related CSS generated by Orbital legacy scene code.
- **What:** Guard the default Earth route from `_buildScene()`, `_applyPreset()`, fake-sphere fallbacks, and legacy dimming CSS.
- **Expect:** Old Orbital experiments remain available only through explicit manual paths and cannot affect the default Mapbox Earth route.
