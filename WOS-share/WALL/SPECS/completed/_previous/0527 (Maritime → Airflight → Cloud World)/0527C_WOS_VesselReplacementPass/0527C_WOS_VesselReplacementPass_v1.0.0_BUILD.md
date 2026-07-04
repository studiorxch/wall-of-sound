# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Replace same-blue vessel pills with readable, class-based maritime silhouettes that produce immediate screenshot-visible improvement.

---

# 0527C_WOS_VesselReplacementPass_v1.0.0_BUILD

---

layout: spec

title: "WOS Vessel Replacement Pass"
date: 2026-05-27
doc_id: "0527C_WOS_VesselReplacementPass_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "vessel_presentation"

type: "system-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the build pass for replacing uniform maritime vessel pills with readable vessel-class silhouettes, distance tiers, and debug visibility so NYC harbor traffic reads as embedded infrastructure rather than generic map dots."

doctrine:

- "2D owns truth"
- "2.5D owns presentation"
- "readability over realism"
- "visible output over hidden infrastructure"
- "infrastructure context over isolated objects"

depends_on:

- "0527B_WOS_MapboxStyleTransferAudit_v1.0.0"
- "MapboxViewportRuntime"
- "AISRuntime"
- "MarineRenderer"
- "MaritimeTaxonomyProfiles"

enables:

- "0527D_WOS_Maritime2_5DContextPass_v1.0.0"
- "0527E_WOS_MapLayerCompositor_v1.0.0"
- "0528A_WOS_AirflightRuntimeBootstrap_v1.0.0"

tags:

- "maritime"
- "vessel"
- "rendering"
- "harbor"
- "readability"
- "recovery"

---

# 🎯 PURPOSE

Replace the current uniform maritime presentation where vessels appear as similar blue pills.

The current visual failure is not primarily AIS density. The failure is:

```text
presentation compression
```

Too many distinct vessel classes collapse into the same readable shape.

This spec exists to create immediate visible improvement by making vessel type, scale, heading, and distance tier readable in screenshots.

The goal is not to complete the maritime system. The goal is to close the maritime layer at a credible ambient harbor level before moving into trains, aircraft, and altitude-aware world rendering.

---

# 🧠 CORE PRINCIPLES

## Vessel Class Must Be Visible Without Hover

A user should identify at least four vessel types in a screenshot without opening cards or debug panels.

Required visible classes:

- barge
- ferry
- tug
- tanker
- cargo
- passenger / cruise
- recreational / small craft

## NYC Harbor Reads Through Industrial Silhouette

The strongest visual language is not decorative ship detail. It is:

```text
long, low, heavy, industrial silhouettes
```

Barge language is the highest priority because real NYC harbor visibility often depends on long, flat, horizontal forms.

## Distance Tier Owns Detail Level

Vessels must not remain equally readable at every zoom.

```text
far        → dot / light speck
mid-far    → dash
mid        → silhouette
near       → class topology
hero       → class topology + heading + deck cue
```

## Heading Must Be Legible

Every non-dot vessel tier must communicate heading through rotated silhouette, bow taper, directional highlight, or stern mass cue.

A vessel that does not reveal heading feels stamped onto the map.

## No Wake Regression

Wake work remains frozen. This pass may NOT restore WaterMemory, wake glow systems, experimental wake trails, or water churn systems.

If a wake-like mark is needed, it must be a minimal active-motion tail only for near / hero vessels and must be disabled by default.

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- vessel visual class mapping
- class silhouette profiles
- distance render tiers
- color palette assignment
- heading presentation
- debug overlay for class resolution
- screenshot validation gates

This spec may read:

- raw AIS type
- resolved vessel class
- vessel heading
- vessel speed
- vessel length if available
- vessel status
- camera zoom
- map pitch

This spec may write:

- presentation-only render profile
- debug render labels
- class color selection
- tier selection

This spec MUST NOT mutate:

- AIS runtime truth
- vessel continuity state
- vessel position
- vessel speed
- raw AIS class
- dead-reckoning logic
- map geometry
- world simulation state

---

# 🌊 CONTINUITY ROLE

This spec supports continuity by improving the visual interpretation of existing vessel motion.

It does not create new vessel behavior, decide where vessels are, or alter live telemetry. It only determines how known vessel state is presented.

Continuity contribution:

```text
stable class identity + heading + distance tier
```

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

AISRuntime owns position, heading, speed, continuity, and confidence state.

MarineRenderer / vessel presentation owns rendered silhouette, color, distance tier, heading cue, debug labels, and class-specific topology.

Interpretation systems must NEVER invent AIS truth, reclassify runtime state permanently, change vessel behavior, or change vessel placement.

---

# 📦 DATA MODEL

```ts
export type WOSVesselClass =
  | "barge"
  | "cargo"
  | "tanker"
  | "ferry"
  | "tug"
  | "passenger"
  | "cruise"
  | "pilot"
  | "sailing"
  | "yacht"
  | "recreational"
  | "unknown";

export type VesselRenderTier =
  | "far_dot"
  | "far_dash"
  | "mid_silhouette"
  | "near_topology"
  | "hero_topology";

export type VesselClassResolution = {
  rawAisType: number | string | null;
  rawAisLabel: string | null;
  resolvedClass: WOSVesselClass;
  confidence: "confirmed" | "inferred" | "fallback";
  reason: string;
};

export type VesselRenderProfile = {
  vesselId: string;
  resolvedClass: WOSVesselClass;
  tier: VesselRenderTier;
  color: string;
  strokeColor: string;
  lengthPx: number;
  widthPx: number;
  headingDeg: number;
  opacity: number;
  showDeckCue: boolean;
  showHeadingCue: boolean;
  showDebugLabel: boolean;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const VESSEL_REPLACEMENT_ENABLED = true;

const VESSEL_TIER_ZOOM = {
  farDotMaxZoom: 10.5,
  farDashMaxZoom: 11.8,
  midSilhouetteMaxZoom: 13.2,
  nearTopologyMaxZoom: 15.4,
};

const VESSEL_SIZE_LIMITS = {
  minDotRadiusPx: 1.5,
  maxDotRadiusPx: 4,
  minDashLengthPx: 5,
  maxDashLengthPx: 18,
  maxHeroLengthPx: 72,
};

const VESSEL_DEBUG_DEFAULT = false;
```

---

# 🎨 CLASS PALETTE

The palette must strongly differentiate vessel classes without overpowering the Mapbox Studio style.

```ts
const VESSEL_CLASS_PALETTE = {
  barge: { fill: "#8B6F47", stroke: "#F0D7A0" },
  cargo: { fill: "#5E8BA6", stroke: "#B7E3F5" },
  tanker: { fill: "#A65A4A", stroke: "#FFD0BF" },
  ferry: { fill: "#E8E1C7", stroke: "#FFFFFF" },
  tug: { fill: "#F2B84B", stroke: "#FFE7A3" },
  passenger: { fill: "#D6E6F2", stroke: "#FFFFFF" },
  cruise: { fill: "#F4F2EA", stroke: "#FFFFFF" },
  pilot: { fill: "#FF7A45", stroke: "#FFD1B8" },
  sailing: { fill: "#D7F7FF", stroke: "#FFFFFF" },
  yacht: { fill: "#FFFFFF", stroke: "#CFEFFF" },
  recreational: { fill: "#BEE8FF", stroke: "#FFFFFF" },
  unknown: { fill: "#6D86A8", stroke: "#B6C8E8" },
};
```

No class should default to the old same-blue pill unless AIS data is genuinely unknown.

---

# 🚢 CLASS SILHOUETTE REQUIREMENTS

## Barge

Shape:

```text
long flat rectangle
slightly squared bow
low deck cue
minimal height
```

Required:

- visually distinct from cargo and tanker
- readable at mid tier as a long dash
- near tier shows flat hull mass

## Ferry

Shape:

```text
wide rectangular body
squared transit profile
small upper-deck block
```

Required:

- readable as short/wide compared with barge
- strong heading cue when moving

## Tug

Shape:

```text
compact block
small wheelhouse bump
wide-for-length workboat feel
```

Required:

- visually separate from recreational craft
- must remain compact

## Tanker

Shape:

```text
long hull
rounded bow
central cylindrical / tank mass cue
stern block
```

Required:

- distinct from cargo through tank/deck mass cue

## Cargo

Shape:

```text
long hull
stacked container / deck block cues
stern mass
```

Required:

- visible container-stack suggestion at near/hero tier

## Passenger / Cruise

Shape:

```text
large body
tiered deck cues
bright upper profile
```

Required:

- cruise/passenger must not collapse into generic ferry

## Sailing / Yacht / Recreational

Shape:

```text
small hull
mast or triangular sail cue where applicable
```

Required:

- render as far dot or small triangular cue unless near

---

# 🔍 DISTANCE / ZOOM TIERS

## far_dot

- tiny dot
- optional single nav-light color
- no topology
- no label

## far_dash

- short heading-aligned dash
- class color reduced opacity
- no deck detail

## mid_silhouette

- class-specific silhouette
- heading rotation
- no fine details
- one stroke

## near_topology

- silhouette
- bow/stern cue
- deck cue
- class-specific internal mark
- no wake by default

## hero_topology

- stronger deck cue
- soft grounding shadow
- heading cue
- optional debug label when enabled
- no WaterMemory

---

# 🧭 CLASS RESOLUTION RULES

Resolution should use existing AIS taxonomy first.

```ts
function resolveVesselClass(vessel: Vessel): VesselClassResolution {}
```

Rules:

1. Prefer explicit AIS ship type.
2. Use existing MaritimeTaxonomyProfiles if available.
3. Use vessel name hints only as inferred, not confirmed.
4. Use size hints only as inferred.
5. Unknown remains unknown.

Confidence:

```text
confirmed → raw AIS type maps directly
inferred  → name / size / behavior supports class
fallback  → no reliable mapping
```

Unknown vessels must still render with a muted fallback profile, not the old blue pill.

---

# 🧩 RENDER FUNCTION REQUIREMENTS

Add or update bounded functions:

```ts
function resolveVesselRenderTier(vessel, camera): VesselRenderTier {}
function resolveVesselRenderProfile(vessel, camera): VesselRenderProfile {}
function drawVesselByClass(ctx, vessel, profile): void {}
function drawBarge(ctx, profile): void {}
function drawFerry(ctx, profile): void {}
function drawTug(ctx, profile): void {}
function drawTanker(ctx, profile): void {}
function drawCargo(ctx, profile): void {}
function drawPassenger(ctx, profile): void {}
function drawRecreational(ctx, profile): void {}
function drawUnknownVessel(ctx, profile): void {}
```

Function rules:

- small, single-purpose functions
- no cross-runtime mutation
- no AIS writes
- no hidden atmosphere dependency
- no wake dependency
- no WaterMemory dependency

---

# 🔄 EXECUTION FLOW

```text
AIS / Validation Vessel
→ Class Resolution
→ Confidence Assignment
→ Distance Tier Resolution
→ Render Profile Resolution
→ Class Silhouette Draw
→ Optional Debug Overlay
```

The renderer must not bypass class resolution. All vessel drawing must pass through `resolveVesselRenderProfile()`.

---

# 🧪 DEBUG MODE

Add debug flag:

```js
SBE.runtimeFlags.showVesselClassDebug = false;
```

Expose console controls:

```js
_wos.debug.vessels.classes()
_wos.debug.vessels.sample()
_wos.debug.vessels.debugLabels(true)
_wos.debug.vessels.debugLabels(false)
```

Debug label must show:

```text
raw AIS → resolved WOS class → confidence → tier
```

Example:

```text
AIS: 70 Cargo → cargo / confirmed / mid_silhouette
AIS: 52 Tug → tug / confirmed / near_topology
AIS: null → unknown / fallback / far_dash
```

---

# 🛰️ OBSERVABILITY IMPACT

Expected visible improvements:

- harbor no longer reads as same-blue pills
- barges become long, low industrial forms
- ferries pop as public transit vessels
- tugs become compact service craft
- cargo/tanker silhouettes carry industrial identity
- distance reduces clutter
- heading becomes readable
- screenshots reveal vessel diversity without hover

This pass should make NYC harbor feel embedded into infrastructure space.

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- AISRuntime
- AISIngestBridge
- MaritimeTaxonomyProfiles
- MaritimePopulationHierarchy
- MapboxViewportRuntime
- MarineRenderer

## Writes To

- presentation-only render profile
- debug label overlay
- runtimeFlags debug toggle

## Observed By

- MarineRenderer
- WorldHUD
- MapboxStyleTransferAudit
- future Maritime2_5DContextPass
- future AirflightRuntimeBootstrap

## Forbidden Mutations

- AIS raw type
- vessel position
- vessel heading
- vessel speed
- vessel continuity state
- vessel lifecycle state
- map style URL
- atmosphere state
- wake state

---

# 🎼 ORCHESTRATION NOTES

This spec does not orchestrate camera transitions, atmospheric presets, aircraft behavior, train layers, route scheduling, or broadcast segments.

It only provides the vessel visual language required before multi-layer infrastructure composition.

---

# ✅ VALIDATION CHECKLIST

## Build Validation

- [ ] Same-blue vessel pills removed
- [ ] Barge silhouette implemented
- [ ] Ferry silhouette implemented
- [ ] Tug silhouette implemented
- [ ] Tanker silhouette implemented
- [ ] Cargo silhouette implemented
- [ ] Passenger / recreational fallback implemented
- [ ] Unknown class has muted fallback
- [ ] Distance tiers implemented
- [ ] Heading rotation implemented
- [ ] Debug labels implemented
- [ ] No WaterMemory re-enabled
- [ ] Wake systems remain disabled by default

## Screenshot Validation

- [ ] At least 4 vessel types identifiable without hover
- [ ] Barges read as long and low
- [ ] Ferries read as public-transit-like
- [ ] Tugs read as compact
- [ ] Far vessels no longer clutter map
- [ ] Vessel colors remain readable on StudioRich Mapbox style
- [ ] Mapbox shoreline remains visible
- [ ] No visible wake noise dominates screenshot

---

# 🚫 NON-GOALS

This spec does NOT build:

- full AIS precision pass
- full placement ecology
- harbor route realism
- advanced wakes
- WaterMemory restoration
- full 3D vessels
- cloud layers
- aircraft systems
- train systems
- map layer compositor
- cinematic weather presets

---

# ⏸️ DEFERRED SYSTEMS

Deferred to later specs:

- `0527D_WOS_Maritime2_5DContextPass_v1.0.0`
- `0527E_WOS_MapLayerCompositor_v1.0.0`
- `0528A_WOS_AirflightRuntimeBootstrap_v1.0.0`
- `0528B_WOS_AltitudeAwareWorldRenderer_v1.0.0`
- `0528C_WOS_CloudAtmosphereLayer_v1.0.0`

---

# 📚 CANONICAL REFERENCES

- `0527B_WOS_MapboxStyleTransferAudit_v1.0.0`
- `MapboxViewportRuntime`
- `MarineRenderer`
- `AISRuntime`
- `MaritimeTaxonomyProfiles`
- `MaritimePopulationHierarchy`
- `MaritimeStyleRegistry`
- `ProceduralVesselTopology`

---

# 💬 IMPLEMENTATION NOTES

## Recommended Files

Likely target files:

```text
wall/render/marineRenderer.js
wall/systems/presentation/proceduralVesselTopology.js
wall/registries/maritimeTaxonomyProfiles.js
wall/systems/presentation/maritimeStyleRegistry.js
```

Optional debug companion:

```text
wall/systems/presentation/vesselReplacementDebug.js
```

## First Implementation Target

Build barge first.

Reason:

```text
Barge silhouette produces the fastest real-world harbor authenticity gain.
```

Then implement ferry, tug, tanker, cargo.

## Hard Stop Rule

Do not continue into wake, WaterMemory, or atmosphere expansion while vessel class readability remains weak.

---

# Implementation Guide

- Put class resolution and render profile logic near the vessel presentation path, not inside AISRuntime.
- Run `_wos.debug.mapbox.cleanMode(true)` and capture a baseline screenshot before comparing vessel changes.
- Expected result: four or more vessel types are visually identifiable in a normal harbor screenshot without hover.
