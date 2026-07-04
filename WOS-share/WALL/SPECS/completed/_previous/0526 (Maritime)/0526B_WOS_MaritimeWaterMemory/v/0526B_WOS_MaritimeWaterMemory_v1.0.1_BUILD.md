---
layout: spec

title: "WOS Maritime Water Memory"
date: 2026-05-26
doc_id: "0526B_WOS_MaritimeWaterMemory_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeWaterMemory"

type: "runtime-presentation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Defines a lightweight decaying water-memory presentation field where vessel wakes briefly accumulate into subtle harbor motion history, making ferry corridors, industrial churn zones, and recent traffic residue visually legible without fluid simulation or runtime truth mutation."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Water remembers motion briefly"
  - "Wake memory is environmental presentation, not fluid simulation"
  - "Memory may reveal repeated movement patterns"
  - "Memory may not fabricate vessel truth"
  - "Water history must decay"
  - "Lane residue suggests repetition but may not imply navigational authority"
  - "Churn expresses environmental disturbance only and may not encode operational significance"

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

supersedes:
  - "0526B_WOS_MaritimeWaterMemory_v1.0.0"

owner: "StudioRich / WOS"

stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "decaying-maritime-wake-memory-presentation-field"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Implement a lightweight environmental wake-memory system that makes harbor water briefly remember vessel motion without becoming fluid simulation or route authority.

---

# 0526B_WOS_MaritimeWaterMemory_v1.0.1_BUILD

## Canonical Artifact Rule

This is the full standalone canonical BUILD artifact for:

```text
0526B_WOS_MaritimeWaterMemory_v1.0.1
```

This document supersedes:

```text
0526B_WOS_MaritimeWaterMemory_v1.0.0
```

v1.0.1 resolves review blockers:

- fixes readonly runtime mutation contradiction
- adds `createdAtMs` and `lastUpdatedMs` to `WaterMemoryCell`
- declares all internal helper functions used by reference logic
- tightens `WaterMemoryStampInput.vesselClass`
- tightens `WaterMemoryStampInput.wakeMode`
- defines `WaterMemoryWakeMode`
- defines `WaterMemoryProfile`
- adds determinism guidance
- adds limit rationales
- adds explicit eviction order
- defines `clearWaterMemory()` behavior
- adds lane/churn governance restrictions

Partial patch-only releases are forbidden after this version.

---

# 🎯 PURPOSE

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

# 🧱 GOVERNANCE DOCTRINES

## Motion Memory Is Not Runtime Truth

```text
Memory may imply recent motion.

Memory may not invent current entities.
```

Water memory is not evidence.

Water memory is not a sensor.

Water memory is not a route authority.

Water memory is not continuity authority.

Water memory must never be used to infer:

- vessel existence
- vessel location
- traffic scoring
- predicted navigation
- operational significance
- hidden vessels
- live route occupancy

---

## Lane Residue Doctrine

```text
Lane residue suggests repetition.

It may not imply navigational authority.
```

A visible lane-like residue may show that similar motion happened repeatedly.

It may not become:

- a traffic route
- a recommended route
- a tactical corridor
- a navigation instruction
- an authority for vessel behavior
- a permanent water road

Future lane systems must explicitly preserve this boundary.

---

## Churn Doctrine

```text
Churn expresses environmental disturbance only.

It may not encode operational significance.
```

Churn may suggest recent localized water activity.

Churn may not imply:

- emergency
- danger
- tactical priority
- target state
- port authority condition
- combat condition
- collision risk

---

## Predictive Analytics Prohibition

MaritimeWaterMemory must explicitly forbid:

- predictive navigation
- traffic scoring
- operational analytics
- route optimization
- vessel intent inference
- hidden-vessel discovery
- current-entity reconstruction

Those systems are outside this spec.

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
- water-lane imprint hints
- memory debug telemetry
- cell/stamp eviction policy

---

## MaritimeWaterMemory May Observe

- vessel class
- vessel projected screen point
- vessel heading
- vessel speed
- wake profile
- wake mode
- zoom level
- visibility class
- population tier
- current Surface preset
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
- churn patches
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

## WaterMemoryWakeMode

`WaterMemoryWakeMode` is the typed bridge from 0526A wake signatures into water-memory stamping.

```ts
type WaterMemoryWakeMode =
  | "LINEAR"
  | "SPLIT_V"
  | "TURBULENT"
  | "DRIFT"
  | "DISCIPLINED";
```

---

## WaterMemoryStampKind

```ts
type WaterMemoryStampKind =
  | "WAKE_SPINE"
  | "WAKE_ARM"
  | "TURBULENCE"
  | "DRIFT"
  | "CHURN"
  | "LANE";
```

---

## WaterMemoryClass

```ts
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
```

---

## WaterMemoryStamp

Stamps are immutable records of a wake-memory event.

```ts
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
```

---

## WaterMemoryCell

Cells are mutable runtime accumulators.

This is intentional.

WaterMemoryCell exists on a hot update path and must support cheap in-place update or targeted replacement.

```ts
type WaterMemoryCell = {
  cellId: string;
  x: number;
  y: number;

  intensity: number;
  ageMs: number;
  createdAtMs: number;
  lastUpdatedMs: number;

  dominantClass: WaterMemoryClass;
  dominantKind: WaterMemoryStampKind;

  headingVectorX: number;
  headingVectorY: number;

  churn: number;
};
```

Implementation may still use immutable replacement internally.

However, the canonical runtime model permits mutation for performance.

---

## WaterMemoryProfile

```ts
type WaterMemoryProfile = {
  readonly vesselClass: WaterMemoryClass;
  readonly baseIntensity: number;
  readonly persistenceMs: number;
  readonly halfLifeScale: number;
  readonly widthScale: number;
  readonly churnScale: number;
  readonly laneFormationWeight: number;
};
```

---

## WaterMemorySnapshot

```ts
type WaterMemorySnapshot = {
  readonly version: "1.0.1";
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

## WaterMemoryRenderOptions

```ts
type WaterMemoryRenderOptions = {
  readonly zoom: number;
  readonly globalAlphaModifier: number;
  readonly clutterPressure: number;
  readonly isAtmosphericSuppressed: boolean;
  readonly showLanes: boolean;
  readonly showChurn: boolean;
};
```

---

## WaterMemoryStampInput

```ts
type WaterMemoryStampInput = {
  readonly vesselId?: string | null;
  readonly vesselClass: WaterMemoryClass;
  readonly wakeMode: WaterMemoryWakeMode;

  readonly x: number;
  readonly y: number;

  readonly headingDeg: number;
  readonly speedKts: number;

  readonly lengthPx: number;
  readonly widthPx: number;

  readonly intensity?: number;
  readonly seed?: number;
  readonly nowMs?: number;
  readonly visibilityClass?: string | null;
};
```

Important:

- `vesselClass` must be normalized before calling `stampWakeMemory`
- `wakeMode` must be a valid 0526A-compatible wake mode
- invalid classes resolve before stamp input construction
- invalid wake modes must not silently pass through the public input contract

---

# ⚙️ SYSTEM CONSTANTS

```ts
const MARITIME_WATER_MEMORY_VERSION = "1.0.1";

const DEFAULT_CELL_SIZE_PX = 32;

const MAX_ACTIVE_STAMPS = 800;

const MAX_ACTIVE_CELLS = 1200;

const DEFAULT_DECAY_HALF_LIFE_MS = 4500;

const MAX_PERSISTENCE_MS = 14000;

const MIN_STAMP_SPEED_KTS = 0.8;

const MEMORY_RENDER_ZOOM_MIN = 11.0;

const MEMORY_FULL_DETAIL_ZOOM = 13.0;

const DISCARD_THRESHOLD = 0.015;
```

---

# 📏 CONSTANT RATIONALES

## Cell Size Rationale

```text
DEFAULT_CELL_SIZE_PX = 32
```

32px cells at typical maritime zoom levels provide enough resolution for:

- ferry lane hints
- industrial churn patches
- cargo displacement trails
- subtle repeated motion residue

without producing visible pixel-grid artifacts or excessive primitive counts.

Smaller cells increase update/render cost.

Larger cells lose directional resolution.

---

## Stamp Limit Rationale

```text
MAX_ACTIVE_STAMPS = 800
```

This balances harbor-scale activity with performance discipline.

Rationale:

```text
200 vessels × up to 4 stamps = 800
```

Exceeding this limit triggers oldest-stamp eviction first.

The stamp list is diagnostic and historical; the cell field is the primary render structure.

---

## Cell Limit Rationale

```text
MAX_ACTIVE_CELLS = 1200
```

1200 cells approximates a:

```text
40 × 30
```

screen-space grid at full detail.

Each cell is rendered as one simple primitive.

Target:

```text
<1ms cell iteration and decay on standard canvas conditions
```

When exceeding this limit, merge or discard low-intensity cells first.

---

## Minimum Stamp Speed Rationale

```text
MIN_STAMP_SPEED_KTS = 0.8
```

Below this speed, vessel motion is visually negligible.

Stamping would create micro-wakes that clutter water memory without meaningful motion history.

Anchored or barely drifting vessels should not leave significant water memory.

---

## Decay Half-Life Rationale

```text
DEFAULT_DECAY_HALF_LIFE_MS = 4500
```

4500ms means:

- memory remains visible for roughly 9–13 seconds
- ferry corridors can be perceived
- churn zones can briefly accumulate
- marks do not become permanent
- viewer attention catches residue without turning it into a route map

Future versions may add class-specific half-life modifiers.

---

# ⏱️ DETERMINISM NOTE

Water memory is presentation-only and does not affect runtime truth.

However, for replay consistency, timestamps should derive from simulation time when available.

Preferred order:

```ts
input.nowMs
→ SBE.SimulationClock.now()
→ performance.now()
```

`performance.now()` is allowed only as a debug or renderer fallback.

Implementations should avoid `Date.now()` inside deterministic update paths.

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

Governance:

```text
LANE is residue, not route authority.
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

# 🧬 MEMORY PROFILE TABLE

```ts
const WATER_MEMORY_PROFILES: Record<WaterMemoryClass, WaterMemoryProfile> = {
  CARGO: {
    vesselClass: "CARGO",
    baseIntensity: 0.42,
    persistenceMs: 9000,
    halfLifeScale: 1.25,
    widthScale: 1.0,
    churnScale: 0.10,
    laneFormationWeight: 0.70,
  },

  TANKER: {
    vesselClass: "TANKER",
    baseIntensity: 0.34,
    persistenceMs: 12000,
    halfLifeScale: 1.45,
    widthScale: 1.35,
    churnScale: 0.05,
    laneFormationWeight: 0.55,
  },

  FERRY: {
    vesselClass: "FERRY",
    baseIntensity: 0.58,
    persistenceMs: 6500,
    halfLifeScale: 0.95,
    widthScale: 1.10,
    churnScale: 0.25,
    laneFormationWeight: 0.90,
  },

  TUG: {
    vesselClass: "TUG",
    baseIntensity: 0.72,
    persistenceMs: 4200,
    halfLifeScale: 0.70,
    widthScale: 1.20,
    churnScale: 0.90,
    laneFormationWeight: 0.10,
  },

  RECREATIONAL: {
    vesselClass: "RECREATIONAL",
    baseIntensity: 0.50,
    persistenceMs: 3000,
    halfLifeScale: 0.55,
    widthScale: 0.65,
    churnScale: 0.20,
    laneFormationWeight: 0.15,
  },

  FISHING: {
    vesselClass: "FISHING",
    baseIntensity: 0.46,
    persistenceMs: 5500,
    halfLifeScale: 0.90,
    widthScale: 0.90,
    churnScale: 0.35,
    laneFormationWeight: 0.20,
  },

  PASSENGER: {
    vesselClass: "PASSENGER",
    baseIntensity: 0.38,
    persistenceMs: 8500,
    halfLifeScale: 1.15,
    widthScale: 1.05,
    churnScale: 0.08,
    laneFormationWeight: 0.65,
  },

  MILITARY: {
    vesselClass: "MILITARY",
    baseIntensity: 0.16,
    persistenceMs: 3600,
    halfLifeScale: 0.65,
    widthScale: 0.55,
    churnScale: 0.02,
    laneFormationWeight: 0.05,
  },

  INDUSTRIAL: {
    vesselClass: "INDUSTRIAL",
    baseIntensity: 0.64,
    persistenceMs: 7200,
    halfLifeScale: 1.00,
    widthScale: 1.45,
    churnScale: 0.75,
    laneFormationWeight: 0.15,
  },

  SERVICE: {
    vesselClass: "SERVICE",
    baseIntensity: 0.48,
    persistenceMs: 4800,
    halfLifeScale: 0.80,
    widthScale: 0.85,
    churnScale: 0.35,
    laneFormationWeight: 0.25,
  },

  UNKNOWN: {
    vesselClass: "UNKNOWN",
    baseIntensity: 0.30,
    persistenceMs: 4200,
    halfLifeScale: 0.80,
    widthScale: 0.80,
    churnScale: 0.15,
    laneFormationWeight: 0.10,
  },
};
```

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
intensity < DISCARD_THRESHOLD
```

where:

```ts
DISCARD_THRESHOLD = 0.015
```

---

# 🧭 CELL QUANTIZATION

Recommended cell grid:

```text
32px screen-space cells
```

Screen-space grid is acceptable for v1.0.1 because this is presentation memory, not geographic truth.

Canonical v1 rule:

```text
Water memory is camera-local presentation residue.
```

---

# 🧭 SCREEN-SPACE GRID LIMITATIONS

Screen-space memory shifts with camera movement.

This means water memory is not geographically persistent.

For v1.0.1, this is acceptable because:

- memory is ephemeral
- memory decays in seconds
- camera movement is relatively slow
- the effect is subtle atmospheric residue
- the system is explicitly presentation-only

Future versions may upgrade to projected water-space cells for geographic persistence.

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

function getConstants(): object;
```

---

# 🔧 REQUIRED INTERNAL HELPERS

All helper functions referenced by the reference implementation must be declared and implemented.

```ts
function makeStampId(input: WaterMemoryStampInput, nowMs: number): string;

function resolveMemoryProfile(
  vesselClass: WaterMemoryClass
): WaterMemoryProfile;

function wakeModeToStampKind(
  wakeMode: WaterMemoryWakeMode
): WaterMemoryStampKind;

function addStampToCells(stamp: WaterMemoryStamp): void;

function removeCellsBelowIntensity(threshold: number): void;

function enforceCellLimit(maxCells: number): void;

function enforceStampLimit(maxStamps: number): void;

function normalizeWaterMemoryClass(
  rawClass: string | null | undefined
): WaterMemoryClass;

function getNowMs(inputNowMs?: number): number;

function clamp01(value: number): number;
```

These helpers may remain module-private.

They must still be present so the implementation is reconstructable from this spec.

---

# 🧭 WAKE MODE TO STAMP KIND

```ts
function wakeModeToStampKind(
  wakeMode: WaterMemoryWakeMode
): WaterMemoryStampKind {
  switch (wakeMode) {
    case "LINEAR":
      return "WAKE_SPINE";

    case "SPLIT_V":
      return "WAKE_ARM";

    case "TURBULENT":
      return "TURBULENCE";

    case "DRIFT":
      return "DRIFT";

    case "DISCIPLINED":
      return "WAKE_SPINE";

    default:
      return "WAKE_SPINE";
  }
}
```

Note:

`DISCIPLINED` maps to `WAKE_SPINE` but should use a low-intensity military profile.

---

# 🧭 CLASS NORMALIZATION

```ts
function normalizeWaterMemoryClass(
  rawClass: string | null | undefined
): WaterMemoryClass {
  if (!rawClass) return "UNKNOWN";

  const key = rawClass.toUpperCase().trim();

  switch (key) {
    case "CARGO":
    case "TANKER":
    case "FERRY":
    case "TUG":
    case "RECREATIONAL":
    case "FISHING":
    case "PASSENGER":
    case "MILITARY":
    case "INDUSTRIAL":
    case "SERVICE":
      return key;

    case "SAILING":
    case "YACHT":
    case "PLEASURE":
      return "RECREATIONAL";

    case "PILOT":
    case "COAST_GUARD":
    case "SAR":
    case "RESEARCH":
    case "SUPPLY":
      return "SERVICE";

    case "CRUISE":
      return "PASSENGER";

    case "BARGE":
    case "DREDGER":
    case "PLATFORM":
      return "INDUSTRIAL";

    default:
      return "UNKNOWN";
  }
}
```

---

# 🧪 REFERENCE STAMP LOGIC

```ts
function stampWakeMemory(input: WaterMemoryStampInput): void {
  if (!input) return;
  if (input.visibilityClass === "ATMOSPHERIC_HIDDEN") return;
  if (input.speedKts < MIN_STAMP_SPEED_KTS) return;

  const nowMs = getNowMs(input.nowMs);
  const profile = resolveMemoryProfile(input.vesselClass);

  const stamp: WaterMemoryStamp = {
    stampId: makeStampId(input, nowMs),
    vesselId: input.vesselId || null,
    vesselClass: input.vesselClass,
    kind: wakeModeToStampKind(input.wakeMode),
    x: input.x,
    y: input.y,
    headingDeg: input.headingDeg,
    lengthPx: input.lengthPx,
    widthPx: input.widthPx * profile.widthScale,
    intensity: clamp01(input.intensity ?? profile.baseIntensity),
    persistenceMs: Math.min(profile.persistenceMs, MAX_PERSISTENCE_MS),
    createdAtMs: nowMs,
    seed: input.seed || 0,
  };

  stamps.push(stamp);
  enforceStampLimit(MAX_ACTIVE_STAMPS);
  addStampToCells(stamp);
}
```

---

# 🧪 REFERENCE CELL ACCUMULATION LOGIC

```ts
function addStampToCells(stamp: WaterMemoryStamp): void {
  const gridX = Math.floor(stamp.x / DEFAULT_CELL_SIZE_PX);
  const gridY = Math.floor(stamp.y / DEFAULT_CELL_SIZE_PX);
  const cellId = `${gridX}_${gridY}`;

  const headingRad = (stamp.headingDeg * Math.PI) / 180;
  const headingVectorX = Math.sin(headingRad);
  const headingVectorY = -Math.cos(headingRad);

  const existing = cells.get(cellId);
  const profile = resolveMemoryProfile(stamp.vesselClass);

  if (!existing) {
    cells.set(cellId, {
      cellId,
      x: gridX * DEFAULT_CELL_SIZE_PX + DEFAULT_CELL_SIZE_PX * 0.5,
      y: gridY * DEFAULT_CELL_SIZE_PX + DEFAULT_CELL_SIZE_PX * 0.5,
      intensity: stamp.intensity,
      ageMs: 0,
      createdAtMs: stamp.createdAtMs,
      lastUpdatedMs: stamp.createdAtMs,
      dominantClass: stamp.vesselClass,
      dominantKind: stamp.kind,
      headingVectorX,
      headingVectorY,
      churn: stamp.kind === "TURBULENCE" || stamp.kind === "CHURN"
        ? profile.churnScale
        : 0,
    });

    enforceCellLimit(MAX_ACTIVE_CELLS);
    return;
  }

  const incomingDominates = stamp.intensity > existing.intensity;

  existing.intensity = clamp01(existing.intensity + stamp.intensity * 0.4);
  existing.ageMs = 0;
  existing.lastUpdatedMs = stamp.createdAtMs;

  if (incomingDominates) {
    existing.dominantClass = stamp.vesselClass;
    existing.dominantKind = stamp.kind;
    existing.headingVectorX = headingVectorX;
    existing.headingVectorY = headingVectorY;
  }

  if (stamp.kind === "TURBULENCE" || stamp.kind === "CHURN") {
    existing.churn = clamp01(existing.churn + profile.churnScale * 0.3);
  }
}
```

---

# 🧪 REFERENCE DECAY LOGIC

```ts
function updateWaterMemory(deltaMs: number, nowMs: number): void {
  stamps = stamps.filter((stamp) => {
    return nowMs - stamp.createdAtMs < stamp.persistenceMs;
  });

  for (const cell of cells.values()) {
    const profile = resolveMemoryProfile(cell.dominantClass);
    const halfLifeMs =
      DEFAULT_DECAY_HALF_LIFE_MS * profile.halfLifeScale;

    cell.intensity *= Math.pow(0.5, deltaMs / halfLifeMs);
    cell.ageMs = nowMs - cell.createdAtMs;

    if (cell.intensity < DISCARD_THRESHOLD) {
      cells.delete(cell.cellId);
    }
  }

  enforceCellLimit(MAX_ACTIVE_CELLS);
}
```

---

# 🧹 EVICTION ORDER

## Stamps

When exceeding `MAX_ACTIVE_STAMPS`:

1. evict oldest stamps by `createdAtMs`
2. preserve newer stamps
3. do not evict cells directly from stamp eviction

---

## Cells

When exceeding `MAX_ACTIVE_CELLS`:

1. merge compatible neighboring low-intensity cells when possible
2. if merging is unavailable, evict lowest-intensity cells first
3. preserve lane cells over random churn cells when possible
4. preserve high-intensity recent cells
5. never exceed hard cap after cleanup

---

# 🧽 clearWaterMemory() BEHAVIOR

`clearWaterMemory()` must:

- remove all `WaterMemoryCell` records
- discard all pending `WaterMemoryStamp` records
- reset telemetry counters to zero
- preserve runtime flags
- preserve configuration constants
- not affect WakeAuthority
- not affect vessel truth
- not affect active wake rendering

After clear, memory accumulation restarts from an empty field.

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

Debug injection may create memory cells.

Debug injection may not affect AIS/runtime truth.

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

# 🚦 RUNTIME FLAGS

Required flags:

```ts
showMaritimeWaterMemory: true;
showMaritimeWaterMemoryDebug: false;
showMaritimeWaterMemoryLanes: true;
showMaritimeWaterMemoryChurn: true;
```

---

# 🧯 FAILURE MODES

If the system exceeds bounds:

```text
drop oldest stamps first
drop or merge lowest-intensity cells first
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

0526A MaritimeWakeSignature may call:

```ts
SBE.MaritimeWaterMemory.stampWakeMemory(...)
```

after drawing an active wake signature.

Stamping must be optional and guarded:

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
- hidden vessels do not stamp memory
- screen-space cells stay bounded

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
- predictive navigation
- traffic scoring
- operational analytics

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
- 0525A_WOS_MapStyleAuthority_v1.0.2
- 0523D_WOS_MaritimeWakeAuthority_v1.2.1
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- WOS Naming Doctrine
- WOS Surface / Channel Doctrine
- WOS Constitutional Spec Template v2.0.1

---

# 🧪 VALIDATION CHECKLIST

- [ ] memory never mutates vessel truth
- [ ] memory never creates vessel entities
- [ ] memory decays automatically
- [ ] memory cannot persist permanently
- [ ] memory does not stamp under ATMOSPHERIC_HIDDEN
- [ ] memory uses bounded cell counts
- [ ] memory remains below active wake intensity
- [ ] memory is disabled at far zoom unless debugged
- [ ] clearWaterMemory fully resets cells and stamps
- [ ] debug injection cannot affect AIS/runtime truth
- [ ] lane residue cannot become route authority
- [ ] churn cannot imply operational significance
- [ ] predictive navigation is explicitly forbidden
- [ ] traffic scoring is explicitly forbidden
- [ ] internal helpers are implemented
- [ ] WaterMemoryCell has mutable runtime fields
- [ ] WaterMemoryCell includes createdAtMs and lastUpdatedMs
- [ ] public input types are not loose strings

---

# 📊 FINAL STATUS

```text
0526B_WOS_MaritimeWaterMemory_v1.0.1
```

Status:

```text
[BUILD]
```

Freeze Decision:

```text
GO
```

Classification:

```text
decaying-maritime-wake-memory-presentation-field
```

Build Scope:

```text
wake memory stamps, decaying screen-space water cells, subtle water-history rendering, class-weighted environmental motion residue, deterministic helper declarations, bounded runtime update path
```

Final instruction:

```text
Proceed to implementation.
```

---

# Implementation Guide

- Put runtime code in `wall/systems/presentation/maritimeWaterMemory.js` and debug tooling in `wall/systems/presentation/maritimeWaterMemoryDebug.js`.
- Wire stamping from `maritimeWakeSignature.js`, render memory before active wakes in `maritimeOccupancyRenderer.js`, and load both new scripts in `index.html`.
- Expect subtle decaying water traces, bounded cell telemetry, and no effect on AIS/runtime truth.
