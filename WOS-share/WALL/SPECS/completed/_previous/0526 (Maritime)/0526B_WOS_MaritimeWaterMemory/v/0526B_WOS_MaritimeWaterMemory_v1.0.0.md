---
layout: spec

title: "WOS Maritime Water Memory"
date: 2026-05-26
doc_id: "0526B_WOS_MaritimeWaterMemory_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeWaterMemory"

type: "runtime-presentation-spec"
status: "review"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Defines a lightweight water-memory presentation system where vessel wakes briefly accumulate into decaying harbor motion history, allowing ferry corridors, industrial churn zones, and calm protected water to become visually legible without fluid simulation."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Water remembers motion briefly"
  - "Wake memory is environmental presentation, not fluid simulation"
  - "Memory may reveal repeated movement patterns"
  - "Memory may not fabricate vessel truth"
  - "Water history must decay"

depends_on:
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0526A_WOS_MaritimeWakeSignature_v1.0.0"
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525D_WOS_SurfaceStylePresets_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"

enables:
  - "0526C_WOS_HarborActivityField_v1.0.0"
  - "0526D_WOS_MaritimeLaneImprint_v1.0.0"
  - "0526E_WOS_SurfaceWaterAtmosphereBridge_v1.0.0"
  - "0526F_WOS_WaterMemoryDebugPanel_v1.0.0"

tags:
  - "maritime"
  - "water"
  - "wake"
  - "memory"
  - "environmental-history"
  - "presentation"
  - "harbor"
  - "motion"
  - "atmosphere"
  - "low-cost"

supersedes: []

owner: "StudioRich / WOS"

stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "decaying-maritime-wake-memory-presentation-field"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Define a lightweight environmental wake-memory system that makes harbor water remember repeated vessel motion without becoming fluid simulation.

---

# 0526B_WOS_MaritimeWaterMemory_v1.0.0

## Purpose

Define the canonical maritime water-memory presentation system for WOS.

This specification extends:

```text
0526A MaritimeWakeSignature
```

from:

```text
per-vessel wake identity
```

toward:

```text
environmental motion history
```

The goal is to let harbor water briefly remember vessel movement so the world begins to show:

- ferry corridors
- industrial churn zones
- tug work areas
- recreational trails
- calm protected pockets
- heavily used water lanes
- recent vessel activity

without implementing expensive or misleading fluid simulation.

---

# 🧠 CORE DOCTRINE

```text
Water remembers motion briefly.

It does NOT simulate water physics.
```

MaritimeWaterMemory is a presentation-layer environmental history system.

It may show that movement happened.

It may not claim why movement happened, where a vessel truly is now, or what the water physically contains.

---

# 🎯 PROBLEM BEING SOLVED

After 0526A, individual wakes can feel class-distinct.

But the harbor can still feel like:

```text
many isolated wake effects
```

instead of:

```text
one living water surface
```

This system solves that by allowing wakes to leave temporary visual memory.

The intended perceptual shift:

```text
boats moving on water
```

becomes:

```text
water shaped by recent traffic
```

---

# 🧭 ARCHITECTURAL POSITION

Canonical flow:

```text
AISRuntime
→ MaritimeWakeSignature
→ MaritimeWaterMemory
→ MaritimeOccupancyRenderer
→ Surface Presentation
```

More detailed flow:

```text
Vessel Render Pass
→ WakeSignature Draw
→ WakeMemory Stamp
→ Decay Field
→ Water Memory Composite
→ Renderer Overlay
```

MaritimeWaterMemory is downstream of wake signature identity.

It does not replace wake signatures.

It accumulates the visual consequences of wake signatures.

---

# 🏛️ AUTHORITY BOUNDARIES

## MaritimeWaterMemory Owns

- wake stamp recording
- memory decay
- water activity field presentation
- class-weighted wake residue
- low-cost motion-history compositing
- memory cell aging
- memory intensity attenuation
- water-lane imprint rendering
- memory debug telemetry

---

## MaritimeWaterMemory May Observe

- vessel class
- vessel projected screen point
- vessel heading
- vessel speed
- wake profile
- zoom level
- visibility class
- population tier
- current surface preset
- clutter pressure
- renderer frame time

Observation does not grant mutation authority.

---

## MaritimeWaterMemory May Produce

- wake memory stamps
- decaying field cells
- presentation-only water overlays
- low-frequency activity ribbons
- lane imprint hints
- debug heatmaps
- memory telemetry snapshots

---

## MaritimeWaterMemory May NOT Mutate

- AIS truth
- vessel coordinates
- vessel speed
- vessel heading
- vessel state
- wake authority truth
- continuity authority
- route topology
- map geometry
- camera state
- population hierarchy
- visibility class
- renderer transforms
- Surface preset state

---

# 🔒 RUNTIME TRUTH BOUNDARY

Water memory is not evidence.

It is not source-of-truth.

It may not be queried for vessel position.

It may not be used for collision.

It may not drive AIS continuity.

It may not infer missing vessels.

Canonical rule:

```text
Memory may imply recent motion.

Memory may not invent current entities.
```

---

# 📦 DATA MODEL

```ts
type WaterMemoryStampKind =
  | "WAKE_SPINE"
  | "WAKE_ARM"
  | "TURBULENCE"
  | "DRIFT"
  | "CHURN"
  | "LANE";

type WaterMemoryClass =
  | "CARGO"
  | "TANKER"
  | "FERRY"
  | "TUG"
  | "RECREATIONAL"
  | "FISHING"
  | "PASSENGER"
  | "MILITARY"
  | "INDUSTRIAL"
  | "SERVICE"
  | "UNKNOWN";

type WaterMemoryStamp = {
  readonly stampId: string;
  readonly vesselId: string | null;
  readonly vesselClass: WaterMemoryClass;
  readonly kind: WaterMemoryStampKind;

  readonly x: number;
  readonly y: number;

  readonly headingDeg: number;
  readonly lengthPx: number;
  readonly widthPx: number;

  readonly intensity: number;
  readonly persistenceMs: number;
  readonly createdAtMs: number;

  readonly seed: number;
};

type WaterMemoryCell = {
  readonly cellId: string;
  readonly x: number;
  readonly y: number;

  readonly intensity: number;
  readonly ageMs: number;
  readonly dominantClass: WaterMemoryClass;
  readonly dominantKind: WaterMemoryStampKind;

  readonly headingVectorX: number;
  readonly headingVectorY: number;
  readonly churn: number;
};

type WaterMemorySnapshot = {
  readonly version: "1.0.0";
  readonly active: boolean;
  readonly stampCount: number;
  readonly cellCount: number;
  readonly totalIntensity: number;
  readonly maxIntensity: number;
  readonly dominantClass: WaterMemoryClass | null;
  readonly lastUpdateMs: number;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const MARITIME_WATER_MEMORY_VERSION = "1.0.0";

const DEFAULT_CELL_SIZE_PX = 32;

const MAX_ACTIVE_STAMPS = 800;

const MAX_ACTIVE_CELLS = 1200;

const DEFAULT_DECAY_HALF_LIFE_MS = 4500;

const MAX_PERSISTENCE_MS = 14000;

const MIN_STAMP_SPEED_KTS = 0.8;

const MEMORY_RENDER_ZOOM_MIN = 11.0;

const MEMORY_FULL_DETAIL_ZOOM = 13.0;
```

---

# 🌊 MEMORY TYPES

## WAKE_SPINE

Used for:

- cargo
- tanker
- passenger
- large vessel linear motion

Visual feel:

```text
long directional trace
```

---

## WAKE_ARM

Used for:

- ferry
- recreational
- service
- split-V wake arms

Visual feel:

```text
directional water parting
```

---

## TURBULENCE

Used for:

- tug
- industrial
- high churn activity

Visual feel:

```text
localized agitation
```

---

## DRIFT

Used for:

- fishing
- low-speed unstable movement

Visual feel:

```text
uneven lateral smear
```

---

## CHURN

Used for:

- tug clusters
- industrial zones
- repeated maneuvering

Visual feel:

```text
stirred water patch
```

---

## LANE

Derived from repeated aligned wake stamps.

Used for:

- ferry routes
- harbor channels
- repeated cargo paths

Visual feel:

```text
subtle polished corridor
```

---

# 🚢 CLASS MEMORY BEHAVIOR

## Cargo

Memory identity:

```text
long, slow, heavy residue
```

Behavior:

- long spine stamps
- moderate persistence
- low turbulence
- visible lane formation
- slow decay

---

## Tanker

Memory identity:

```text
broad displacement stain
```

Behavior:

- wider spine stamps
- long but faint persistence
- minimal turbulence
- very slow visual movement
- low brightness

---

## Ferry

Memory identity:

```text
repeated commuter corridor
```

Behavior:

- strong split-arm stamps
- lane imprint allowed
- shorter persistence than cargo
- stronger brightness
- route repetition should become legible

---

## Tug

Memory identity:

```text
localized work churn
```

Behavior:

- short high-intensity turbulence
- high churn cell value
- fast decay
- visible agitation near docks
- does not form long lanes

---

## Recreational

Memory identity:

```text
quick playful slicing
```

Behavior:

- bright narrow short trails
- fast decay
- high speed influence
- low lane persistence

---

## Fishing

Memory identity:

```text
uneven drifting trace
```

Behavior:

- asymmetric drift stamps
- medium decay
- lateral smear
- low corridor formation

---

## Passenger

Memory identity:

```text
smooth ceremonial glide
```

Behavior:

- long clean memory trail
- lower turbulence
- subtle lane formation
- visually elegant decay

---

## Military

Memory identity:

```text
suppressed trace
```

Behavior:

- extremely low intensity
- narrow memory
- reduced persistence
- no dramatic churn
- no tactical implication

---

## Industrial

Memory identity:

```text
mechanical water disturbance
```

Behavior:

- churn cells
- short wide patches
- moderate persistence
- industrial zone texture
- low lane formation

---

## Service

Memory identity:

```text
utility movement residue
```

Behavior:

- moderate V stamps
- dock-adjacent churn
- medium-fast decay
- low lane persistence

---

# 🧮 MEMORY DECAY DOCTRINE

All memory must decay.

Canonical decay:

```text
intensity *= pow(0.5, deltaMs / halfLifeMs)
```

No permanent water marks in runtime.

If persistence is desired for map identity, that belongs to a future HarborActivityField, not this ephemeral runtime memory.

---

# 🔁 STAMP LIFECYCLE

```text
create stamp
→ quantize into memory cells
→ accumulate intensity
→ decay every frame
→ discard below threshold
→ render remaining cells
```

Minimum discard threshold:

```ts
intensity < 0.015
```

---

# 🧭 CELL QUANTIZATION

Recommended cell grid:

```text
32px screen-space cells
```

Screen-space grid is acceptable for v1.0.0 because this is presentation memory, not geographic truth.

Future upgrade may use projected water-space cells.

Canonical v1 rule:

```text
Water memory is camera-local presentation residue.
```

---

# 🎨 RENDERING DOCTRINE

Water memory should be:

- subtle
- atmospheric
- low-contrast
- slow-decaying
- readable only when accumulated
- invisible under heavy suppression
- never brighter than active wakes

Forbidden:

- neon trails
- particle spam
- hard-edged heatmaps
- tactical route lines
- permanent water roads
- high-frequency flicker

---

# 🔍 LOD POLICY

## Far Zoom

```text
memory hidden or extremely faint
```

No visible cell structure.

---

## Mid Zoom

```text
memory appears as soft lane hints
```

Allow:

- faint ribbons
- low-alpha cells
- ferry corridor hints
- industrial churn patches

---

## Close Zoom

```text
memory becomes localized water texture
```

Allow:

- turbulence patches
- wake residue
- drift smears
- lane polish
- subtle directional flow

---

# 🌫️ ATMOSPHERIC INTEGRATION

Water memory must respond to:

- fog
- haze
- rain
- night
- Surface presets
- visibility class
- density pressure

Atmosphere may suppress memory.

Atmosphere may not elevate memory beyond active wake visibility.

Canonical rule:

```text
Memory cannot be more legible than the active wake system.
```

---

# 🧱 CLUTTER PRESSURE RULES

Under high clutter:

```text
memory becomes smoother, not louder
```

Recommended suppression:

| Clutter Pressure | Behavior |
|---|---|
| 0.4 | reduce glow |
| 0.6 | merge nearby cells |
| 0.75 | reduce max intensity |
| 0.9 | render only lane fields |

---

# 🧰 REQUIRED PUBLIC API

```ts
function stampWakeMemory(input: WaterMemoryStampInput): void;

function updateWaterMemory(deltaMs: number, nowMs: number): void;

function renderWaterMemory(
  ctx: CanvasRenderingContext2D,
  options: WaterMemoryRenderOptions
): void;

function clearWaterMemory(): void;

function getWaterMemorySnapshot(): WaterMemorySnapshot;

function getCells(): readonly WaterMemoryCell[];
```

---

# 📥 STAMP INPUT

```ts
type WaterMemoryStampInput = {
  readonly vesselId?: string | null;
  readonly vesselClass: string;
  readonly wakeMode: string;

  readonly x: number;
  readonly y: number;

  readonly headingDeg: number;
  readonly speedKts: number;

  readonly lengthPx: number;
  readonly widthPx: number;

  readonly intensity?: number;
  readonly seed?: number;
  readonly nowMs?: number;
};
```

---

# 🧭 STAMP RULES

Do not stamp when:

- speedKts < `MIN_STAMP_SPEED_KTS`
- visibilityClass is `ATMOSPHERIC_HIDDEN`
- wake signatures are disabled
- point is offscreen
- memory system disabled
- clutter policy suppresses current LOD

Stamp intensity should derive from:

- speed
- vessel class
- wake mode
- alpha
- current zoom
- population tier

---

# 🧪 REFERENCE STAMP LOGIC

```ts
function stampWakeMemory(input) {
  if (!input) return;
  if (input.speedKts < MIN_STAMP_SPEED_KTS) return;

  const profile = resolveMemoryProfile(input.vesselClass);

  const stamp = {
    stampId: makeStampId(input),
    vesselId: input.vesselId || null,
    vesselClass: normalizeClass(input.vesselClass),
    kind: wakeModeToStampKind(input.wakeMode),
    x: input.x,
    y: input.y,
    headingDeg: input.headingDeg,
    lengthPx: input.lengthPx,
    widthPx: input.widthPx,
    intensity: clamp01(input.intensity ?? profile.baseIntensity),
    persistenceMs: profile.persistenceMs,
    createdAtMs: input.nowMs ?? performance.now(),
    seed: input.seed || 0,
  };

  addStampToCells(stamp);
}
```

---

# 🧪 REFERENCE DECAY LOGIC

```ts
function updateWaterMemory(deltaMs, nowMs) {
  for (const cell of cells) {
    cell.intensity *= Math.pow(
      0.5,
      deltaMs / DEFAULT_DECAY_HALF_LIFE_MS
    );

    cell.ageMs = nowMs - cell.createdAtMs;
  }

  removeCellsBelowIntensity(0.015);
  enforceCellLimit(MAX_ACTIVE_CELLS);
}
```

---

# 🖼️ RENDER STRATEGY

Recommended v1 render strategy:

```text
one transparent overlay pass
```

Per cell:

- draw soft ellipse or short directional stroke
- orient by heading vector
- alpha by intensity
- size by churn/spread
- fade by zoom and atmosphere

Preferred primitives:

- `ctx.ellipse`
- gradient strokes
- low-alpha fill
- deterministic jitter

Avoid:

- per-pixel image buffers
- blur filters on hundreds of cells
- simulation grids
- high-frequency animation

---

# 🧪 DEBUG API

Debug namespace:

```ts
_wos.waterMemory
```

Required methods:

```ts
_wos.waterMemory.snapshot()
_wos.waterMemory.clear()
_wos.waterMemory.cells()
_wos.waterMemory.renderDebug()
_wos.waterMemory.injectTest("ferry")
_wos.waterMemory.injectLane("ferry")
_wos.waterMemory.constants()
```

---

# 📊 REQUIRED TELEMETRY

```ts
type WaterMemoryTelemetry = {
  stampsCreated: number;
  stampsSuppressed: number;
  cellsCreated: number;
  cellsMerged: number;
  cellsRendered: number;
  cellsDiscarded: number;
  totalIntensity: number;
  maxIntensity: number;
  laneCells: number;
  churnCells: number;
};
```

---

# 🧪 VALIDATION RULES

- memory never mutates vessel truth
- memory never creates vessel entities
- memory decays automatically
- memory cannot persist permanently
- memory does not render under ATMOSPHERIC_HIDDEN
- memory uses bounded cell counts
- memory remains below active wake intensity
- memory is disabled at far zoom unless explicitly debugged
- clearWaterMemory fully resets all cells and stamps
- debug injection cannot affect AIS/runtime truth

---

# 🚦 RUNTIME FLAGS

Required flags:

```ts
showMaritimeWaterMemory: true
showMaritimeWaterMemoryDebug: false
showMaritimeWaterMemoryLanes: true
showMaritimeWaterMemoryChurn: true
```

---

# 🧯 FAILURE MODES

If the system exceeds bounds:

```text
drop oldest cells first
```

If frame time spikes:

```text
skip memory render for one frame
```

If map/canvas context unavailable:

```text
do not stamp
```

If profile resolution fails:

```text
use UNKNOWN profile
```

If rendering throws:

```text
disable render pass temporarily; preserve runtime
```

---

# ⚡ PERFORMANCE DOCTRINE

This must remain cheap.

No:

- fluid simulation
- particles
- framebuffers
- WebGL requirement
- per-pixel distortion
- high-resolution grids

Yes:

- sparse cells
- low-alpha strokes
- bounded arrays
- simple decay
- cheap drawing primitives
- optional debug heatmap

Target:

```text
hundreds of vessels
without visible performance collapse
```

---

# 🔗 INTEGRATION WITH 0526A

0526A MaritimeWakeSignature should optionally call:

```ts
SBE.MaritimeWaterMemory.stampWakeMemory(...)
```

after drawing an active wake signature.

However, stamping must be optional and guarded:

```ts
if (SBE.MaritimeWaterMemory && flags.showMaritimeWaterMemory) {
  SBE.MaritimeWaterMemory.stampWakeMemory(...)
}
```

Wake drawing remains valid if WaterMemory is absent.

WaterMemory must never become required for wake signatures.

---

# 🧭 RENDERER INTEGRATION

Recommended frame order:

```text
1. clear maritime overlay
2. render water memory pass
3. render active wakes
4. render vessel topology
5. render lights / labels / hover UI
```

Reason:

```text
memory belongs under active wakes and vessels
```

---

# 🧱 FIRST BUILD SCOPE

Create:

```text
wall/systems/presentation/maritimeWaterMemory.js
wall/systems/presentation/maritimeWaterMemoryDebug.js
```

Patch:

```text
maritimeWakeSignature.js
maritimeOccupancyRenderer.js
index.html
```

Minimum viable behavior:

- stamps created from active wakes
- cells decay over time
- memory renders under active wakes
- ferry/cargo/tug/fishing classes visibly differ
- debug snapshot confirms bounded counts
- clear function works

---

# 🚫 NON-GOALS

This spec does NOT implement:

- real fluid simulation
- hydrodynamics
- shoreline collision
- tide modeling
- gameplay water physics
- persistent geographic water history
- route inference
- vessel prediction
- AIS continuity
- automatic traffic-lane authority

---

# ⏸️ DEFERRED SYSTEMS

Deferred:

- geographic water-space memory grid
- port-specific water identity
- weather-reactive decay
- tide/wind distortion
- heatmap export
- VisualLab water-memory rendering
- Surface.nyc water skins
- audio-reactive water memory
- 2.5D water deformation
- ferry route recognition authority

---

# 📚 CANONICAL REFERENCES

- 0526A_WOS_MaritimeWakeSignature_v1.0.0
- 0525F_WOS_ProceduralVesselTopology_v1.0.1
- 0525E_WOS_VisibilityClassRuntime_v1.0.0
- 0525D_WOS_SurfaceStylePresets_v1.0.1
- 0523D_WOS_MaritimeWakeAuthority_v1.2.1
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- WOS Naming Doctrine
- WOS Constitutional Spec Template v2.0.1

---

# ✅ BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [ ] water-memory scope is accepted as presentation-only
- [ ] screen-space cell grid is accepted for v1
- [ ] decay rules are accepted
- [ ] stamp lifecycle is accepted
- [ ] renderer pass order is accepted
- [ ] memory under active wakes is accepted
- [ ] no fluid simulation requirement is introduced
- [ ] debug API is accepted

---

# 📊 FINAL STATUS

```text
0526B_WOS_MaritimeWaterMemory_v1.0.0
```

Status:

```text
[REVIEW]
```

Freeze Decision:

```text
REVIEW
```

Classification:

```text
decaying-maritime-wake-memory-presentation-field
```

Build Scope:

```text
wake memory stamps, decaying screen-space water cells, subtle water-history rendering, class-weighted environmental motion residue
```

Final instruction:

```text
Submit for architecture and governance review before implementation.
```
