---
layout: spec
title: "Actor Proof Stage Camera and Label Pass"
date: 2026-06-03
doc_id: "0603_WOS_ActorProofStageCameraAndLabelPass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "actor_proof_stage_camera_label_pass"

type: "system-spec"
status: "approved"

priority: "high"
risk: "low"

classification: "debug-proof-harness"

summary: "Adds a controlled visual proof stage for actor silhouettes: camera framing, temporary labels, rings, and stage cleanup so actor 2.5D forms can be judged without live-world clutter."

doctrine:
  - "Truth remains untouched"
  - "Proof harnesses are debug-only"
  - "Presentation can be tested without feed mutation"
  - "Do not tune live world from uncontrolled screenshots"

depends_on:
  - "0603L_WOS_ActorVisualProofHarness_v1.0.0_BUILD"
  - "0603K_WOS_Actor2_5DVisibilityTuningPass_v1.0.0_BUILD"
  - "0603J_WOS_Actor2_5DPresentationPass_v1.0.0_BUILD"

enables:
  - "controlled actor visual review"
  - "side-by-side silhouette judgment"
  - "proof-stage screenshots"
  - "safe visual tuning loop"

tags:
  - "wos"
  - "actor"
  - "proof-stage"
  - "debug"
  - "camera"
  - "labels"
  - "2.5d"
---

# 0603M_WOS_ActorProofStageCameraAndLabelPass_v1.0.0_BUILD

## Build Readiness

[BUILD]

---

# Purpose

Create a controlled proof-stage view for actor 2.5D forms.

0603L proves actors render.

0603M makes them easy to judge.

The current problem is not whether actors exist.

The problem is:

```text
actors render inside a noisy live map
camera angle varies
proof actors are hard to compare
labels are missing
scale judgment is unclear
```

This spec adds a debug-only stage mode:

```text
spawn proof actors
frame camera
draw temporary labels/rings
inspect silhouettes
clear cleanly
```

No feed truth changes.

No runtime changes.

No hero behavior changes.

---

# Core Goal

Make this visually obvious:

```text
city-bus ≠ utility-truck ≠ station-node ≠ vessel ≠ ferry ≠ aircraft ≠ ambient-car
```

without relying on console tables.

---

# Required Target File

Modify:

```text
wall/systems/presentation/worldSpaceVehicleDebug.js
```

Optional only if needed:

```text
wall/systems/render/worldSpaceVehicleLayer.js
```

Do not modify:

```text
TruthActorRuntime
ActorRenderAuthority
ActorVisualIdentityAuthority
ActorPresentationPaletteRegistry
CitiBikeStationRuntime
HeroVehicleRuntime
HeroVehicleRenderer
MapStyleRecoveryAuthority
```

---

# Debug API Additions

Add under:

```js
_wos.debug.worldActors
```

Commands:

```js
visualProofStage()
clearVisualProofStage()
visualProofLabels(on)
visualProofCamera()
visualProofStageState()
```

---

# Command: visualProofStage()

One-shot command that:

1. calls existing `visualProofLineup()`
2. enables labels/rings
3. frames camera on lineup
4. prints visual proof state after a short delay

Pseudo:

```js
visualProofStage: function () {
  this.visualProofLineup();
  this.visualProofLabels(true);
  this.visualProofCamera();
  setTimeout(() => this.visualProofStageState(), 1000);
}
```

Must return a state object:

```js
{
  active,
  proofActorCount,
  labelsEnabled,
  ringsEnabled,
  cameraFramed,
  actorKeys,
  lastError
}
```

---

# Command: clearVisualProofStage()

Must:

1. remove labels/rings
2. call existing `clearVisualProofLineup()`
3. preserve live actors
4. restore nothing automatically unless this spec explicitly changed it

Expected:

```js
_wos.debug.worldActors.clearVisualProofStage()
```

returns:

```js
{
  removedProofActors,
  removedLabels,
  liveActorsPreserved
}
```

---

# Command: visualProofCamera()

Frames the proof lineup.

Requirements:

- Center camera on proof lineup centroid.
- Set zoom high enough for silhouettes to be visible.
- Use pitch/bearing that gives 2.5D readability.
- Must not activate Drive.
- Must not change hero route.
- Must not alter actor positions.

Recommended camera:

```js
{
  zoom: 16,
  pitch: 58,
  bearing: -25,
  duration: 700
}
```

If map is unavailable, return safely:

```js
{ ok:false, reason:"map_unavailable" }
```

No throw.

---

# Command: visualProofLabels(on)

Enables/disables debug-only visual labels and rings.

Labels should be lightweight DOM overlays, not Mapbox layers.

Container:

```text
#wos-actor-proof-overlay
```

Each proof actor gets:

```html
<div class="wos-proof-label">
  city-bus
</div>
```

And a ring:

```html
<div class="wos-proof-ring"></div>
```

Labels are updated using `map.project([lng, lat])`.

Do not mutate map style.

Do not add Mapbox sources.

Do not add Mapbox layers.

---

# Label Content

Each label should display:

```text
proofKey
silhouetteClass
paletteRef
```

Example:

```text
city-bus
city-bus
mta.bus.blue-white
```

Keep short.

---

# Label Positioning

Labels should sit above the projected actor point.

Ring should sit centered on actor point.

Recommended CSS:

```css
#wos-actor-proof-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
}

.wos-proof-label {
  position: absolute;
  transform: translate(-50%, -120%);
  padding: 4px 6px;
  border: 1px solid rgba(120, 230, 255, 0.7);
  border-radius: 4px;
  background: rgba(0, 10, 14, 0.72);
  color: #dffbff;
  font: 10px/1.2 monospace;
  text-shadow: 0 1px 2px #000;
  white-space: nowrap;
}

.wos-proof-ring {
  position: absolute;
  width: 28px;
  height: 28px;
  transform: translate(-50%, -50%);
  border: 1px solid rgba(120, 230, 255, 0.85);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(120, 230, 255, 0.35);
}
```

Inject CSS once.

No external stylesheet required.

---

# Overlay Update Loop

Use a lightweight RAF loop only while labels are enabled.

```js
_visualProofOverlayRaf
```

On each tick:

- read proof actors from `TruthActorRuntime`
- project their lng/lat
- update label/ring style positions
- hide labels when actors are offscreen

Stop the RAF when labels are disabled or cleared.

No frame logging.

---

# Proof Actor Lookup

Proof actors are those where:

```js
actor.metadata.visualProof === true
```

or:

```js
actor.actorId contains "visual_proof_"
```

This matches 0603L cleanup logic.

---

# Command: visualProofStageState()

Returns:

```js
{
  active,
  proofActorCount,
  renderedCount,
  suppressedCount,
  labelsEnabled,
  overlayNodeExists,
  labelCount,
  ringCount,
  cameraLastFramedAt,
  actors: [
    {
      proofKey,
      actorId,
      actorType,
      visualIdentityKey,
      silhouetteClass,
      paletteRef,
      scaleClass,
      rendered,
      lodTier,
      screen
    }
  ],
  lastError
}
```

Also prints a compact table.

---

# Camera Safety

`visualProofCamera()` must not assume proof actors exist.

If no proof actors exist:

```js
return { ok:false, reason:"no_proof_actors" }
```

No throw.

---

# Cleanup Safety

`clearVisualProofStage()` must remove only:

```text
proof actors
proof labels
proof rings
proof overlay RAF
```

It must not clear:

```text
Citi Bike live stations
AIS actors
aircraft actors
ambient traffic
hero
map style
```

---

# Acceptance Test

Run:

```js
_wos.debug.worldActors.visualProofStage()
setTimeout(()=>_wos.debug.worldActors.visualProofStageState(), 1200)
```

Expected:

```text
proofActorCount >= 7
renderedCount >= 7 at zoom 16
labelsEnabled true
labelCount >= 7
ringCount >= 7
cameraFramed true
```

Then run:

```js
_wos.debug.worldActors.clearVisualProofStage()
_wos.debug.worldActors.visualProofStageState()
```

Expected:

```text
proofActorCount 0
labelCount 0
ringCount 0
live actors preserved
```

---

# Failure Conditions

This build fails if:

- proof labels use Mapbox layers/sources
- live actors are removed during clear
- Drive starts automatically
- hero route changes
- feed runtimes start
- map style mutates
- overlay RAF keeps running after clear
- labels continue after proof actors are removed
- console spams every frame
- visualProofLineup no longer works
- actor identity/palette payloads are changed

---

# Notes

This pass is not for production UI.

This is a visual calibration stage.

It exists so WOS can tune actor presentation from a controlled scene rather than guessing from live city clutter.

---

# Implementation Guide

- **Where**: Modify `wall/systems/presentation/worldSpaceVehicleDebug.js` by adding proof-stage overlay state, CSS injection, RAF label projection, `visualProofStage()`, `visualProofCamera()`, `visualProofLabels(on)`, `visualProofStageState()`, and `clearVisualProofStage()`.
- **What**: Run `node --check wall/systems/presentation/worldSpaceVehicleDebug.js`; in browser run `_wos.debug.worldActors.visualProofStage()` then `_wos.debug.worldActors.visualProofStageState()`.
- **Expect**: Seven proof actors appear in a controlled camera view with temporary labels and rings, while actor truth, feed runtimes, hero movement, map style, and live actors remain unchanged.
