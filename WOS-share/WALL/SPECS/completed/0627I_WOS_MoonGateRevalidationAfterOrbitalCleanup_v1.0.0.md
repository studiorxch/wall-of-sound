# 0627I_WOS_MoonGateRevalidationAfterOrbitalCleanup_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Moon Mode / Orbital Earth Recovery  
**Document Type:** Gate Revalidation Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** I  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`
- `0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0.md`
- `0627E_WOS_OrbitalRuntimeOwnershipCleanup_v1.0.0.md`
- `0627F_WOS_OrbitalLegacyPathQuarantine_v1.0.0.md`
- `0627G_WOS_OrbitalMapTransitionCleanup_v1.0.0.md`
- `0627H_WOS_OrbitalFxReintroductionPass_v1.0.0.md`

---

## Purpose

Revalidate Moon Mode after Orbital Earth cleanup.

This spec does not expand Moon Mode. It verifies that Moon remains downstream from stable Mapbox-first Orbital Earth and cannot be entered from the normal map, legacy visualizer paths, presentation routing, or broken Orbital states.

The goal is to protect the sequence:

```text
Map
→ Orbital Earth
→ Moon Transit
→ Moon Orbit
→ Moon Surface
→ return cleanly
```

Moon must not become a shortcut, fallback, or hidden visual leak.

---

## Active Scope Lock

The Orbital recovery lock remains active.

Do not add:

```text
new Moon visuals
new Moon UI
new Moon camera behaviors
new lunar surface features
new presentation controls
new transport buttons
new Orbital FX
new architecture systems
```

Allowed work:

```text
Moon gate verification
Moon leak cleanup
Moon state report
Moon return-state validation
Moon blocked-entry diagnostics
narrow gate/cleanup bug fixes
```

---

## Current Risk

Orbital Earth has been cleaned up and stabilized. Moon Mode now needs to be checked against that cleaned path.

Known risks:

```text
Moon enters from normal map.
Moon enters from legacy Three.js visualizer.
Moon enters while OrbitalEarthMode is inactive.
Moon leaves body classes behind.
Moon return breaks Orbital Earth.
Moon return breaks map cleanup.
Moon visuals leak into Mapbox Orbital Earth.
Moon state bypasses transition cleanup.
```

This spec exists to prevent those regressions before Moon development continues.

---

## Required Gate Rule

Moon can only start when:

```js
SBE.OrbitalEarthMode.isActive() === true
```

Moon must not start from:

```text
normal map
Flight mode
Drive mode
Walk mode
Bike mode
Transit mode
legacy Three.js visualizer
portal_orb
deep_space_listen
minimal_dark_sphere
presentation placeholder
startup fallback state
```

If the gate fails, Moon must block and log:

```text
[WOS Moon] BLOCKED — Orbital Earth inactive
```

No partial Moon state should be created.

---

## Required Moon Entry Path

Allowed path:

```text
WOS map
→ Orbital transport selected
→ Orbital Earth active
→ Clean Earth baseline passes
→ MoonModeController.enter()
→ cislunar_transit
→ lunar_orbit
→ lunar_surface
```

Moon entry must not invoke:

```text
legacy visualizer
fake sphere
presentation router
new transport tab
new UI panel
```

---

## Required Moon Return Behavior

Moon return must resolve cleanly to one of these allowed states:

### Preferred

```text
Moon
→ Orbital Earth
```

Use when the user is returning from Moon but should remain in Orbital mode.

### Allowed

```text
Moon
→ Map
```

Use only if the return action is explicitly a full map return.

### Forbidden

```text
Moon
→ legacy visualizer
Moon
→ fake sphere
Moon
→ stuck black transition
Moon
→ map with Moon classes active
Moon
→ Orbital Earth with Moon overlays still active
```

---

## Body Class Cleanup

Moon entry may use Moon classes while active.

After Moon exit or return, these must be cleared unless still intentionally active:

```text
wos-moon-active
wos-moon-transit-active
wos-moon-orbit-active
wos-moon-surface-active
wos-moon-returning
```

After return to map, these must also be absent:

```text
wos-orbital-active
wos-orbital-earth-active
wos-travel-state
wos-transition-active
wos-map-dimmed
```

If returning to Orbital Earth, `wos-orbital-earth-active` may remain, but Moon classes must be absent.

---

## Required Diagnostic Report

Add or confirm:

```js
SBE.MoonModeController.getGateReport?.()
```

Minimum report shape:

```js
{
  timestamp,
  moonActive,
  moonState,
  orbitalEarthActive,
  orbitalCleanEarthPassed,
  orbitalCameraPreset,
  legacyVisualizerActive,
  presentationModeActive,
  allowedToEnterMoon,
  blockedReason,
  bodyClasses,
  moonClassesActive,
  orbitalClassesActive,
  returnTarget,
  leaks: {
    moonClassesInMap,
    moonClassesInOrbitalEarth,
    legacyVisualizerDuringMoon,
    presentationDuringMoon
  },
  passed,
  blockers: []
}
```

If `getGateReport()` already exists with equivalent data, use it.

---

## Required Blocked Entry Tests

### Test A — Normal Map

From normal map / Flight mode:

```js
SBE.MoonModeController.enter?.()
```

Expected:

```text
blocked
OrbitalEarthMode.isActive() false
Moon state unchanged
no Moon body classes
```

---

### Test B — Legacy Visualizer

If legacy visualizer is manually active:

```js
SBE.MoonModeController.enter?.()
```

Expected:

```text
blocked unless OrbitalEarthMode.isActive() is true
no fake Earth path accepted as Moon gate
```

---

### Test C — Presentation Placeholder

If presentation router is manually used:

```js
SBE.WosPresentationRouter.selectPresentationMode?.("card")
SBE.MoonModeController.enter?.()
```

Expected:

```text
presentation mode does not authorize Moon
Moon still requires OrbitalEarthMode.isActive()
```

Do not add presentation UI.

---

## Required Allowed Entry Test

### Test D — Orbital Earth Active

1. Enter Orbital Earth through the canonical route.
2. Confirm:

```js
SBE.OrbitalEarthMode.isActive()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

3. Call:

```js
SBE.MoonModeController.enter?.()
```

Expected:

```text
Moon entry allowed
state becomes cislunar_transit or expected Moon entry state
Moon logs entry
Moon classes active only while Moon is active
```

---

## Required Return Tests

### Test E — Moon Return to Orbital Earth

1. Enter Moon from Orbital Earth.
2. Return to Orbital Earth.

Expected:

```text
Moon classes cleared
OrbitalEarthMode active
Clean Earth or prior Orbital Earth state readable
no legacy visualizer
no presentation mode leak
```

Run:

```js
SBE.MoonModeController.getGateReport?.()
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.OrbitalEarthMode.getCleanEarthReport?.()
```

---

### Test F — Moon Return to Map

If full map return exists:

1. Enter Moon from Orbital Earth.
2. Return fully to map.

Expected:

```text
Moon classes cleared
Orbital classes cleared
transition cleanup passed
map filters restored
map opacity restored
camera restored
```

Run:

```js
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

---

## Files Likely in Scope

Likely files:

```text
wall/systems/moon/MoonModeController.js
wall/systems/moon/MoonOrbitView.js
wall/systems/moon/MoonSurfaceView.js
wall/systems/moon/CislunarTransitController.js
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/runtime/WosModeTransitionController.js
```

Do not edit:

```text
presentation router files
transport button files
FX panel
TopBar
PLAY
Studio
```

unless the gate report proves leakage from those systems.

---

## Acceptance Criteria

This spec is complete when:

1. Moon cannot enter from normal map.
2. Moon cannot enter from legacy visualizer alone.
3. Moon cannot enter from presentation mode alone.
4. Moon can enter only when `OrbitalEarthMode.isActive()` is true.
5. Blocked Moon entry logs a clear diagnostic.
6. Blocked Moon entry leaves no partial Moon state.
7. Allowed Moon entry starts from clean Orbital Earth.
8. Moon classes are cleared after Moon exit/return.
9. Return to Orbital Earth leaves Orbital readable.
10. Return to map passes transition cleanup.
11. Legacy visualizer does not appear during Moon path.
12. Presentation router remains dormant.
13. No new Moon visuals are added.
14. No presentation controls are added.
15. No transport buttons are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Moon gate before:
Moon gate after:
Blocked entry tests:
Allowed entry test:
Return-to-Orbital test:
Return-to-Map test:
Gate report sample:
Classes cleared:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No new Moon visuals added.
No presentation controls added.
No transport buttons added.
No Orbital FX added.
```

---

## Stop Conditions

Stop and report if:

```text
Moon can enter without OrbitalEarthMode.isActive()
Moon entry path is unclear
Moon return target is unclear
Moon classes persist after exit
Moon return breaks Orbital Earth
Moon return breaks map transition cleanup
legacy visualizer activates during Moon path
presentation router is unexpectedly required for Moon
```

Do not add workaround layers.

---

## Final Principle

Moon is downstream from Orbital Earth.

It is not a replacement for Orbital Earth.

The Moon path is valid only when Orbital Earth is already stable, readable, and active.

## Implementation Guide

- **Where:** Audit and patch `MoonModeController.js` first; inspect Moon orbit/surface/transit files and transition cleanup only if gate or cleanup issues are found.
- **What:** Verify the Moon gate, blocked-entry behavior, class cleanup, and return paths after Orbital cleanup.
- **Expect:** Moon remains strictly gated behind stable Orbital Earth and cannot leak into map, presentation, or legacy visualizer states.
