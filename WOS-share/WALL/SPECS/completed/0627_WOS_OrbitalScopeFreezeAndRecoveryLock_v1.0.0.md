# 0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Scope Freeze / Recovery Lock Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Control  
**Primary Owner:** WOS Runtime  
**Applies To:** Orbital Earth, Mapbox Globe, transition runtime, Broadcast HUD, Moon gate, FX overlays

---

## Purpose

Freeze Orbital feature expansion while the current Orbital Earth runtime is unstable.

The goal is to stop adding new visual systems, buttons, modes, overlays, Moon behaviors, and presentation controls until the default Orbital path is readable, stable, and testable.

This spec does not add features. It defines the recovery lock.

---

## Current Problem

Orbital has drifted through several partially overlapping ideas:

```text
Three.js visualizer
fake planet / portal orb
Mapbox globe continuity
audio-reactive overlays
camera presets
Moon gate
presentation router assumptions
FX panel expansion
transition cleanup
```

The correct direction is now clear:

```text
WOS Map
→ Mapbox Globe / Orbital Earth
→ Clean readable Earth
→ optional overlays later
→ Moon gate later
```

But the implementation contains too many active or semi-active layers. This has made simple changes fragile.

Observed symptoms:

- Earth appears but is too dim.
- Supporting overlays can become louder than the planet.
- Camera fit can overcorrect.
- Legacy Orbital paths still exist.
- Presentation router exists but is dormant and should not be wired into current UI.
- Small UI/runtime changes require too many attempts because ownership is unclear.

---

## Scope Freeze Rule

Until Orbital Earth passes the recovery baseline, do not add:

```text
new FX
new particles
new stars
new scan rings
new audio reactivity
new Moon features
new presentation controls
new visual modes
new camera experiments
new transport buttons
new UI panels
new decorative presets
new fake-sphere defaults
```

Only recovery work is allowed.

---

## Allowed Work During Freeze

The following work is allowed:

```text
visibility diagnostics
brightness/readability fixes
camera framing correction
map → orbital → map transition cleanup
runtime ownership cleanup
legacy path quarantine
body class cleanup
CSS filter cleanup
Mapbox canvas/style readability fixes
diagnostic reports
test/QA helpers
```

Allowed work must support one goal:

> Orbital Earth opens from the WOS map, shows a readable Mapbox globe, and returns cleanly to the map.

---

## Not Allowed During Freeze

Do not implement or expand:

### Visual Expansion

```text
new stars
new galaxy backgrounds
new haze layers
new scan rings
new signal particles
new pulse systems
new route particles
new Earth shaders
new synthetic planet objects
```

### Mode Expansion

```text
new presentation tabs
new Card UI
new Website UI
new Canvas UI
new Kinetic Fish UI
new Extracted Theme UI
new Moon submodes
new travel modes
```

### FX Expansion

```text
new FX sliders
new visual presets
new audio-reactive mappings
new beat pulses
new particle emitters
```

### Architecture Expansion

```text
new routing systems
new mode enums
new renderers
new global state managers
new fallback systems
```

Exception: diagnostics or cleanup utilities required by the recovery checklist are allowed.

---

## Active Recovery Target

The only active product target is:

```text
Mapbox Orbital Earth / Clean Earth baseline
```

Required default path:

```text
WOS map
→ user selects Orbital transport
→ Mapbox projection changes to globe
→ saved map camera state is captured
→ readable Orbital Earth appears
→ optional overlays remain off or minimal
→ user returns to map
→ original map camera/visibility restores
```

---

## Recovery Baseline

Orbital is considered recovered only when all baseline checks pass.

### Visual Baseline

- Earth is visible immediately.
- Earth is readable in under 1 second.
- Map linework/geography is visible.
- Earth is not tiny.
- Earth is not cropped.
- No fake Three.js sphere appears as default.
- No haze/vignette hides the map.
- Origin marker is quieter than the planet.

### Runtime Baseline

- Orbital enters through a single default route.
- Orbital exits through a single cleanup path.
- Map camera restores on return.
- Map opacity/filter restores on return.
- Body classes do not get stuck.
- Transition veil clears.
- Audio overlay is off by default.
- Presentation router remains dormant unless explicitly used.

### QA Baseline

Required console checks:

```js
SBE.OrbitalEarthMode.getGlobeFitReport?.()
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.WosPresentationRouter?.getRoutingReport?.()
```

The visibility report should identify active dimming/opacity/filter sources.

---

## Current Decision Locks

### Lock 1 — Orbital Earth is Mapbox-first

Default Orbital Earth must use Mapbox globe.

Do not default to:

```text
Three.js fake Earth
portal orb
particle sphere
archive sphere
signal sphere
```

These can remain only as manual or experimental modes after recovery.

### Lock 2 — Clean Earth before FX

Do not add FX until Clean Earth works with overlays off.

Correct order:

```text
Earth readability
→ camera framing
→ transition cleanup
→ ownership cleanup
→ optional FX reintroduction
```

### Lock 3 — Presentation router is dormant

Current WALL UI has transport tabs only.

```text
flight / drive / walk / bike / transit / orbital
```

The presentation router may remain loaded but should not add visible UI or affect transport.

Do not wire new presentation controls during Orbital recovery.

### Lock 4 — Moon waits for stable Orbital

Moon remains downstream from Orbital Earth.

Do not expand Moon until Orbital Earth is stable.

Allowed Moon work during freeze:

```text
gate verification
leak cleanup
return-state cleanup
```

Not allowed:

```text
new Moon visuals
new Moon UI
new Moon camera behaviors
new lunar surface features
```

### Lock 5 — Diagnostics before tuning

Do not guess from screenshots if a runtime report can identify the source.

Before tuning brightness again, create or use:

```js
SBE.OrbitalEarthMode.getVisibilityStackReport()
```

---

## Required Recovery Sequence

This spec is the first item in the recovery checklist.

After this spec, proceed in this order:

```text
1. OrbitalVisibilityStackAudit
2. OrbitalCleanEarthBaseline
3. OrbitalCameraFramingCorrection
4. OrbitalRuntimeOwnershipCleanup
5. OrbitalLegacyPathQuarantine
6. OrbitalMapTransitionCleanup
7. OrbitalFxReintroductionPass
8. MoonGateRevalidationAfterOrbitalCleanup
9. OrbitalBroadcastCompositionPass
```

Do not skip directly to FX or Moon.

---

## Required Developer Behavior

When implementing any Orbital recovery change, the developer must report:

```text
files edited
files searched
features not touched
active route tested
console diagnostics used
QA result
remaining blocker
```

Every report should explicitly confirm:

```text
No new visuals added.
No presentation controls added.
No Moon expansion added.
No transport buttons added.
```

---

## Files in Scope

Likely files:

```text
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/orbital/OrbitalAudioOverlayController.js
wall/systems/orbital/WosMapStyleTokens.js
wall/systems/orbital/OrbitalMapContext.js
wall/systems/orbital/OrbitalModeController.js
wall/systems/runtime/WosRuntimeModeState.js
wall/systems/runtime/WosModeTransitionController.js
wall/systems/presentation/WosPresentationRouter.js
wall/systems/presentation/WosPresentationModeState.js
wall/systems/presentation/traversalControlDeck.js
wall/index.html
wall/styles.css
```

Only edit the file required for the recovery task.

---

## Acceptance Criteria

This scope freeze is active when:

1. No new Orbital visual features are added.
2. No new presentation controls are added.
3. No Moon features are expanded.
4. Default Orbital remains Mapbox-first.
5. Three.js/portal/fake sphere paths are not default.
6. Current work is limited to diagnostics, cleanup, readability, camera, and transition recovery.
7. Developer reports explicitly state what was not touched.
8. Next task is the visibility-stack audit.

---

## Stop Conditions

Stop and report instead of continuing if:

```text
Orbital entry path cannot be identified
Mapbox canvas is unavailable
Map projection cannot switch to globe
transition cleanup conflicts with map startup
a hidden UI route is discovered
Moon state is leaking into Orbital
presentation router is unexpectedly active
```

Do not patch around these blindly.

---

## Final Lock

The recovery goal is not to make Orbital more exciting.

The recovery goal is to make Orbital trustworthy.

Default Orbital must be:

```text
clean
readable
Mapbox-first
single-route
diagnosable
restorable
```

Everything else waits.

## Implementation Guide

- **Where:** Apply this as a recovery control document before editing Orbital runtime files.
- **What:** Freeze feature expansion, restrict work to visibility/camera/runtime cleanup, and require diagnostics before tuning.
- **Expect:** Orbital work stops branching into new features and proceeds through one controlled recovery sequence.
