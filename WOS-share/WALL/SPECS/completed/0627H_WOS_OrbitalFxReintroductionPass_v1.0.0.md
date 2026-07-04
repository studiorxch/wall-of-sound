# 0627H_WOS_OrbitalFxReintroductionPass_v1.0.0

## Project

**Project:** WOS  
**Feature Area:** Orbital Earth Recovery  
**Document Type:** Controlled FX Reintroduction Spec  
**Version:** v1.0.0  
**Status:** Active Recovery Spec  
**Sequence:** H  
**Depends On:**  
- `0627_WOS_OrbitalScopeFreezeAndRecoveryLock_v1.0.0.md`
- `0627_WOS_OrbitalVisibilityStackAudit_v1.0.0.md`
- `0627C_WOS_OrbitalCleanEarthBaseline_v1.0.0.md`
- `0627D_WOS_OrbitalCameraFramingCorrection_v1.0.0.md`
- `0627E_WOS_OrbitalRuntimeOwnershipCleanup_v1.0.0.md`
- `0627F_WOS_OrbitalLegacyPathQuarantine_v1.0.0.md`
- `0627G_WOS_OrbitalMapTransitionCleanup_v1.0.0.md`

---

## Purpose

Reintroduce Orbital FX carefully after Clean Earth, camera framing, ownership, legacy quarantine, and transition cleanup are stable.

This spec does not authorize broad new visual development. It only allows existing or already-planned Orbital FX layers to return in a controlled, optional, non-destructive way.

The goal is:

```text
Earth remains the subject.
FX support the Earth.
FX never hide or replace the Earth.
```

---

## Active Scope Lock

The Orbital recovery lock remains active.

Do not add:

```text
new Moon features
new presentation controls
new transport buttons
new UI panels unrelated to existing FX
new visual modes
new architecture systems
new fake-sphere defaults
```

Allowed work:

```text
controlled FX defaults
toggle guards
low-opacity FX reintroduction
FX report diagnostics
FX reset-to-clean behavior
manual-only FX enablement
```

---

## Preconditions

Do not begin this spec unless the following are true:

```text
Clean Earth baseline passes.
getVisibilityStackReport() shows no major dimming suspects.
getCleanEarthReport().passed is true.
getGlobeFitReport().globeTooSmall is false.
getTransitionCleanupReport().passed is true after return to map.
Legacy visualizer path is quarantined.
Presentation router remains dormant.
Moon remains gated.
```

If any precondition fails, stop and return to the relevant earlier spec.

---

## Current Problem

Earlier Orbital visual work added too many effects too early:

```text
stars
scan rings
audio sparkle
route particles
haze
vignette
rim glow
origin markers
legacy visualizer/fake sphere elements
```

Those layers made the Earth hard to read. After cleanup, FX can return only if they stay subordinate to the Mapbox globe.

---

## FX Reintroduction Rule

Reintroduce FX in this order only:

```text
1. soft rim
2. origin marker
3. route arc
4. subtle stars
5. scan ring
6. audio pulse
7. signal particles
```

Do not skip ahead.

Do not enable multiple new FX layers at once without QA between layers.

Each layer must be:

```text
optional
toggleable
low by default
non-destructive
diagnosable
reversible to Clean Earth
```

---

## Default State

Default Orbital entry remains Clean Earth.

Default on:

```text
Mapbox globe
readable map linework
soft rim
minimal origin marker
HUD
```

Default off:

```text
stars
scan rings
audio sparkle
route particles
signal particles
haze
vignette
legacy visualizer
portal orb
fake sphere
Moon visuals
```

If any optional FX is enabled by default, it must be explicitly justified and pass the readability tests.

---

## FX Layer Requirements

### 1. Soft Rim

Allowed by default at low opacity.

Constraints:

```text
rim only
no center haze
no dark vignette
does not obscure continents/linework
does not add edge blackout
```

Suggested max:

```text
atmosphere/rim opacity <= 0.22
```

### 2. Origin Marker

Allowed by default at low opacity.

Constraints:

```text
small
ring or reticle preferred
no large filled glow
no pulsing by default
lower priority than Earth
```

Suggested max:

```text
origin opacity <= 0.60
```

### 3. Route Arc

Optional, manual or data-driven.

Constraints:

```text
thin
subtle
does not cross the full globe as a dominant line unless route is active
hidden when no route context exists
```

Default:

```text
off unless active route context exists
```

### 4. Subtle Stars

Optional, off by default.

Constraints:

```text
no dense starfield
no galaxy background
no center noise
no particle snow
```

Suggested starting value:

```text
starOpacity <= 0.12
starDensity low
```

Stars should sit behind Earth and never read louder than map linework.

### 5. Scan Ring

Optional, off by default.

Allowed only as a momentary transition / signal effect.

Constraints:

```text
not persistent
low opacity
does not cover Earth center
does not create haze
does not repeat constantly without user/event trigger
```

### 6. Audio Pulse

Optional, off by default.

Audio overlay controller remains owner.

Allowed mappings:

```text
bass → slight rim pulse
low mids → tiny line glow adjustment
highs → sparse shimmer if stars enabled
track transition → one scan ring
```

Forbidden mappings:

```text
audio creates haze
audio darkens map
audio turns on dense particles
audio changes camera
audio turns on legacy visualizer
```

When audio mode is off:

```js
if (audioMode === "off") return;
```

or equivalent must prevent visible mutation.

### 7. Signal Particles

Optional, last to reintroduce.

Constraints:

```text
off by default
only with clear data/source meaning
not random decoration
not dense
not brighter than Earth
not confused with stars
```

Signal particles should wait until real signal logic is available.

---

## Required FX State Model

If not already present, formalize a readable FX state shape.

Minimum:

```js
{
  cleanEarthDefault: true,
  starsEnabled: false,
  scanRingEnabled: false,
  audioOverlayEnabled: false,
  routeArcEnabled: false,
  signalParticlesEnabled: false,
  hazeEnabled: false,
  vignetteEnabled: false,
  legacyVisualizerEnabled: false
}
```

The state may live in existing files only. Do not add a new architecture system unless absolutely required.

---

## Required Public Methods

Use existing APIs where possible.

Preferred:

```js
SBE.OrbitalEarthMode.applyCleanEarthBaseline()
SBE.OrbitalEarthMode.getCleanEarthReport()
SBE.OrbitalEarthMode.getVisibilityStackReport()
SBE.OrbitalEarthMode.setVisualPreset?.("clean")
SBE.OrbitalAudioOverlayController.setMode?.("off")
```

Optional diagnostic:

```js
SBE.OrbitalEarthMode.getFxReport?.()
```

Minimum `getFxReport()` shape if added:

```js
{
  cleanEarthDefault,
  starsEnabled,
  starOpacity,
  scanRingEnabled,
  scanRingOpacity,
  audioMode,
  routeArcEnabled,
  signalParticlesEnabled,
  hazeEnabled,
  vignetteEnabled,
  legacyVisualizerEnabled,
  earthReadable,
  blockers: [],
  passed
}
```

---

## Reset Requirement

There must be a simple way to return to Clean Earth:

```js
SBE.OrbitalEarthMode.applyCleanEarthBaseline()
```

After calling it:

```text
stars off
scan rings off
audio sparkle off
route particles off
signal particles off
haze off
vignette off
legacy visualizer off
Earth readable
```

---

## FX Panel Rules

If existing FX panel controls are touched, they must remain caller-only.

The FX panel may call public APIs, but must not own:

```text
default FX state
Clean Earth baseline
camera preset truth
style token source of truth
runtime mode
transition cleanup
```

Do not add new FX panel sections unless a required existing control is broken.

---

## Files Likely in Scope

Likely files:

```text
wall/systems/orbital/OrbitalEarthMode.js
wall/systems/orbital/OrbitalAudioOverlayController.js
wall/systems/orbital/WosMapStyleTokens.js
wall/systems/orbital/OrbitalFxPanel.js
```

Do not edit:

```text
Moon files
presentation router files
transport button files
TopBar
PLAY
Studio
```

unless an existing FX leak is proven by diagnostic report.

---

## QA Procedure

### Test A — Default Entry

1. Load WOS.
2. Enter Orbital.
3. Run:

```js
SBE.OrbitalEarthMode.getCleanEarthReport?.()
SBE.OrbitalEarthMode.getVisibilityStackReport?.()
SBE.OrbitalEarthMode.getFxReport?.()
```

Expected:

```text
Clean Earth passes.
Stars off.
Scan ring off.
Audio mode off.
Haze off.
Vignette off.
Legacy visualizer off.
Earth readable.
```

### Test B — Enable Stars Manually

Enable stars through existing public API or FX panel if available.

Expected:

```text
stars low opacity
Earth remains readable
no haze introduced
no dimming suspects
```

Then reset:

```js
SBE.OrbitalEarthMode.applyCleanEarthBaseline()
```

Expected:

```text
stars off again
Clean Earth passes
```

### Test C — Enable Audio Manually

Set audio mode manually if supported.

Expected:

```text
only permitted mappings activate
no camera change
no haze
no dense particles
no legacy visualizer
```

Then set:

```js
SBE.OrbitalAudioOverlayController.setMode?.("off")
SBE.OrbitalEarthMode.applyCleanEarthBaseline()
```

Expected:

```text
audio visual mutation stops
Clean Earth passes
```

### Test D — Round Trip

Run:

```text
Map → Orbital → optional FX → Clean Earth reset → Map
```

Then:

```js
SBE.WosModeTransitionController.getTransitionCleanupReport?.()
```

Expected:

```text
passed: true
blockers: []
no stuck FX/body/filter residue
```

---

## Acceptance Criteria

This spec is complete when:

1. Clean Earth remains the default Orbital entry.
2. FX layers are optional and low by default.
3. Stars are off by default or visibly subtle if manually enabled.
4. Scan rings are off by default.
5. Audio overlay is off by default.
6. Audio cannot mutate visuals when mode is off.
7. Haze and vignette remain off by default.
8. Legacy visualizer remains quarantined.
9. `applyCleanEarthBaseline()` resets FX to readable Earth.
10. FX do not introduce dimming suspects.
11. Map → Orbital → Map cleanup remains clean after FX testing.
12. No Moon expansion is added.
13. No presentation controls are added.
14. No transport buttons are added.

---

## Required Developer Report

After implementation, report:

```text
Files edited:
Files searched:
Precondition reports:
FX state/defaults before:
FX state/defaults after:
FX layers enabled by default:
Manual FX tests:
Clean Earth reset result:
Transition cleanup after FX:
Features not touched:
Remaining blocker:
```

Explicitly confirm:

```text
No new visuals added beyond controlled existing FX reintroduction.
No presentation controls added.
No Moon expansion added.
No transport buttons added.
```

---

## Stop Conditions

Stop and report if:

```text
Clean Earth baseline no longer passes
Visibility stack shows dimming suspects
Transition cleanup no longer passes
Audio mode off still mutates visuals
FX panel owns default state
stars/scan rings are forced on by hidden fallback
legacy visualizer activates
FX reset cannot restore Clean Earth
```

Do not add workaround layers.

---

## Final Principle

FX are not the product.

Orbital Earth is the product.

Effects should make the Earth feel alive without making it hard to see.

## Implementation Guide

- **Where:** Audit and patch only existing FX-related code in `OrbitalEarthMode.js`, `OrbitalAudioOverlayController.js`, `WosMapStyleTokens.js`, and `OrbitalFxPanel.js`.
- **What:** Keep Clean Earth as default, reintroduce FX only as optional/manual/low-intensity layers, and ensure `applyCleanEarthBaseline()` resets the view.
- **Expect:** Orbital can become expressive again without losing readability or stability.
