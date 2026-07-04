---
layout: spec
title: "WOS Maritime Distance Atmosphere"
date: 2026-05-27
doc_id: "0526E_WOS_MaritimeDistanceAtmosphere_v1.0.0"
version: "1.0.0"
project: "Wall of Sound"
system: "WOS"
domain: "presentation"
component: "MaritimeDistanceAtmosphere"
type: "runtime-presentation-spec"
status: "review"
priority: "high"
risk: "medium"
classification: "presentation-layer"
summary: "Defines maritime distance atmosphere for depth compression, far-vessel suppression, fog/haze integration, distant light softening, and harbor-scale atmospheric separation."
stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "maritime-distance-depth-atmospheric-compression"
depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525D_WOS_SurfaceStylePresets_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0526C_WOS_ActiveWakePolish_v1.0.1"
related:
  - "0526D_WOS_MaritimeSurfaceInteraction_v1.0.0"
owner: "StudioRich / WOS"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Define maritime distance atmosphere before adding more vessel detail, wake complexity, or 2.5D projection behavior.

# 0526E_WOS_MaritimeDistanceAtmosphere_v1.0.0

## Purpose

Define the maritime distance-atmosphere system for WOS.

This spec establishes how maritime objects lose detail, soften, compress, fade, and blend into the world as distance increases.

The goal is to move the harbor from:

```text
flat visible objects over a map
```

toward:

```text
layered atmospheric water space
```

This specification does not add new boat types, new wake modes, or water-memory accumulation.

It defines how existing maritime presentation systems are depth-compressed and atmospherically integrated.

---

# 🧠 Core Doctrine

```text
Distance is presentation truth.

It is not simulation truth.
```

MaritimeDistanceAtmosphere may alter:

- alpha
- contrast
- detail visibility
- glow strength
- label visibility
- wake visibility
- topology LOD
- far-light treatment
- haze/fog compression

It may not alter:

- AIS truth
- vessel existence
- vessel position
- vessel speed
- vessel heading
- vessel class truth
- population tier
- camera state
- runtime continuity

Canonical rule:

```text
Distance atmosphere interprets visibility.
It does not define reality.
```

---

# Strategic Context

WOS now has:

- procedural vessel topology
- class-specific active wakes
- maritime style registry
- surface presets
- visibility-class runtime
- far lights
- nav lights
- hover cards

But the harbor can still feel too evenly exposed.

Everything appears too equally present.

The next visual problem is not:

```text
more detail
```

It is:

```text
better distance hierarchy
```

This spec creates that hierarchy.

---

# Architectural Position

Canonical flow:

```text
AISRuntime
→ VesselTaxonomy
→ VisibilityClassRuntime
→ MaritimeDistanceAtmosphere
→ ProceduralVesselTopology
→ MaritimeWakeSignature
→ MaritimeOccupancyRenderer
```

DistanceAtmosphere is an interpretation layer.

It produces a presentation envelope consumed by renderers.

It does not draw the entire scene by itself.

---

# Authority Boundaries

## MaritimeDistanceAtmosphere Owns

- distance envelope calculation
- far/mid/near presentation bands
- atmospheric alpha compression
- detail suppression rules
- wake suppression rules
- light-softening rules
- label suppression rules
- hover-card distance policy
- far-vessel abstraction rules
- depth-fog blending inputs

## MaritimeDistanceAtmosphere May Observe

- vessel projected screen distance
- camera zoom
- viewport size
- visibility class
- population tier
- vessel class
- Surface preset
- fog/haze state
- time-of-day lighting state
- renderer pass context

## MaritimeDistanceAtmosphere May Produce

- `MaritimeDistanceEnvelope`
- `VesselDistancePresentation`
- `DistanceBand`
- opacity multipliers
- topology LOD hints
- wake suppression factors
- light damping factors
- label eligibility flags

## MaritimeDistanceAtmosphere May NOT Mutate

- AIS state
- vessel truth
- vessel lifecycle
- camera state
- map projection
- renderer orchestration
- visibility class
- population tier
- wake authority
- topology blueprint
- style registry
- Surface preset state

---

# Authority Relationships

## Reads From

- VisibilityClassRuntime
- MaritimeStyleRegistry
- SurfaceStylePresetRuntime
- current renderer zoom
- projected vessel coordinates
- viewport dimensions
- atmosphere/fog context
- population hierarchy output

## Writes To

```text
none
```

The module returns presentation data only.

## Observed By

- MaritimeOccupancyRenderer
- MaritimeWakeSignature
- ProceduralVesselTopology
- hover-card renderer
- label renderer
- far-light renderer
- debug tools

## Forbidden Mutations

- runtime vessel truth
- AIS continuity
- camera focus
- route geometry
- map projection
- style registry values
- global rendering order

---

# Distance Bands

The system defines five canonical distance bands.

```ts
type MaritimeDistanceBand =
  | "HERO"
  | "NEAR"
  | "MID"
  | "FAR"
  | "ATMOSPHERIC";
```

## HERO

The vessel is visually important.

Allowed:

- full topology detail
- class-specific wake
- labels if enabled
- hover card
- nav lights
- subtle glow
- strongest contrast

## NEAR

The vessel is readable.

Allowed:

- topology detail
- simple wake
- nav lights
- labels if enabled
- moderate contrast

## MID

The vessel is present but secondary.

Allowed:

- silhouette
- reduced topology
- minimal wake
- reduced lighting
- no hover unless actively selected

## FAR

The vessel becomes atmosphere.

Allowed:

- silhouette or marker
- tiny far light
- no wake except faint direction trace
- no label
- no hover card
- low contrast

## ATMOSPHERIC

The vessel becomes mostly signal.

Allowed:

- twinkle/light only
- marker only if needed
- no wake
- no topology detail
- no label
- no hover

---

# Data Model

```ts
type MaritimeDistanceEnvelope = {
  readonly version: "1.0.0";
  readonly band: MaritimeDistanceBand;
  readonly distanceNorm: number;
  readonly zoomNorm: number;
  readonly atmosphereNorm: number;
  readonly vesselAlpha: number;
  readonly topologyAlpha: number;
  readonly wakeAlpha: number;
  readonly lightAlpha: number;
  readonly labelAlpha: number;
  readonly hoverAlpha: number;
  readonly topologyDetailScale: number;
  readonly wakeDetailScale: number;
  readonly lightBloomScale: number;
  readonly allowWake: boolean;
  readonly allowTopology: boolean;
  readonly allowLabel: boolean;
  readonly allowHover: boolean;
  readonly allowNavLights: boolean;
  readonly allowFarLight: boolean;
  readonly reason: string;
};

type MaritimeDistanceInput = {
  readonly vesselId?: string | null;
  readonly vesselClass: string;
  readonly populationTier: string | null;
  readonly screenX: number;
  readonly screenY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly zoom: number;
  readonly visibilityClass: string | null;
  readonly fogAlpha?: number;
  readonly hazeAlpha?: number;
  readonly densityPressure?: number;
};
```

---

# System Constants

```ts
const MARITIME_DISTANCE_ATMOSPHERE_VERSION = "1.0.0";
const HERO_RADIUS_NORM = 0.12;
const NEAR_RADIUS_NORM = 0.24;
const MID_RADIUS_NORM = 0.46;
const FAR_RADIUS_NORM = 0.72;
const DEFAULT_FOG_WEIGHT = 0.45;
const DEFAULT_HAZE_WEIGHT = 0.35;
const DEFAULT_DENSITY_WEIGHT = 0.25;
const MIN_ATMOSPHERIC_ALPHA = 0.04;
const MAX_FAR_LIGHT_ALPHA = 0.55;
const FAR_WAKE_SUPPRESSION = 0.12;
const ATMOSPHERIC_WAKE_SUPPRESSION = 0.0;
```

---

# Distance Calculation

Distance must be calculated from normalized screen-space distance to the visual focus center.

For v1:

```text
viewport center = focus center
```

Future versions may use:

- camera focus
- selected vessel
- director-mode focal subject
- route progress anchor

Reference:

```ts
function resolveDistanceNorm(input: MaritimeDistanceInput): number {
  const cx = input.viewportWidth * 0.5;
  const cy = input.viewportHeight * 0.5;
  const dx = input.screenX - cx;
  const dy = input.screenY - cy;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  return clamp01(Math.sqrt(dx * dx + dy * dy) / maxD);
}
```

---

# Band Resolution

```ts
function resolveDistanceBand(distanceNorm: number): MaritimeDistanceBand {
  if (distanceNorm <= HERO_RADIUS_NORM) return "HERO";
  if (distanceNorm <= NEAR_RADIUS_NORM) return "NEAR";
  if (distanceNorm <= MID_RADIUS_NORM) return "MID";
  if (distanceNorm <= FAR_RADIUS_NORM) return "FAR";
  return "ATMOSPHERIC";
}
```

Population tier may refine but not replace distance band.

Example:

```text
HERO tier vessel in FAR band may preserve light/marker prominence.
It may not force full topology detail.
```

---

# Visibility-Class Integration

Distance atmosphere consumes `visibilityClass`.

It does not assign it.

Hard suppression:

```text
ATMOSPHERIC_HIDDEN → all alpha 0
LIGHT_ONLY         → allowFarLight only
MARKER_ONLY        → marker/light only
SILHOUETTE         → silhouette/topologyAlpha reduced
REDUCED            → topology/detail reduced
FULL               → distance band controls final envelope
```

Canonical rule:

```text
DistanceAtmosphere may reduce visibility.
It may not elevate suppressed detail.
```

---

# Alpha Policy

Base alpha by band:

| Band | Vessel | Topology | Wake | Light | Label | Hover |
|---|---:|---:|---:|---:|---:|---:|
| HERO | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| NEAR | 0.88 | 0.88 | 0.72 | 0.90 | 0.80 | 0.75 |
| MID | 0.62 | 0.48 | 0.32 | 0.72 | 0.20 | 0.00 |
| FAR | 0.32 | 0.18 | 0.08 | 0.55 | 0.00 | 0.00 |
| ATMOSPHERIC | 0.10 | 0.00 | 0.00 | 0.35 | 0.00 | 0.00 |

Fog/haze/density may only reduce these values.

---

# Wake Suppression Policy

Wakes should reduce aggressively with distance.

Rules:

- HERO: full active wake allowed
- NEAR: active wake allowed
- MID: wake reduced and simplified
- FAR: wake almost hidden
- ATMOSPHERIC: no wake

Wake suppression happens before drawing, not after drawing.

Renderer should avoid drawing wake geometry if `allowWake === false`.

---

# Light Policy

Distance does not remove all light.

It transforms vessels into atmosphere.

Far light behavior:

- FAR: tiny twinkle allowed
- ATMOSPHERIC: light-only signal allowed
- HERO/NEAR: nav lights allowed
- MID: reduced nav/far hybrid allowed

Rules:

```text
Far lights may remain alive.
Far lights may not become urgent.
```

No emergency coding.

No false operational meaning.

---

# Label and Hover Policy

Labels and hover cards are close-range UI elements.

Rules:

- HERO: labels/hover allowed
- NEAR: labels allowed if toggled; hover allowed on active hover
- MID: labels suppressed except debug
- FAR: labels forbidden
- ATMOSPHERIC: labels forbidden

Hover cards must not appear for atmospheric vessels.

---

# Topology LOD Policy

Distance atmosphere should feed topology LOD.

Mapping:

```text
HERO         → CLOSE_DETAIL or TOPOLOGY
NEAR         → TOPOLOGY
MID          → SILHOUETTE or reduced TOPOLOGY
FAR          → MARKER or SILHOUETTE
ATMOSPHERIC  → LIGHT or none
```

This is a hint.

ProceduralVesselTopology remains the authority for actual topology emission.

---

# Atmospheric Compression

Atmosphere factor:

```ts
atmosphereNorm = clamp01(
  fogAlpha * DEFAULT_FOG_WEIGHT +
  hazeAlpha * DEFAULT_HAZE_WEIGHT +
  densityPressure * DEFAULT_DENSITY_WEIGHT
);
```

Atmosphere compression must reduce:

- vessel alpha
- topology detail
- wake alpha
- label eligibility
- hover eligibility
- glow intensity

Atmosphere may preserve:

- tiny far lights
- subtle twinkles
- silhouette hints

---

# Renderer Integration

Recommended integration point:

```text
MaritimeOccupancyRenderer
→ for each vessel:
   resolve distance envelope
   pass envelope to topology rendering
   pass envelope to wake rendering
   pass envelope to lights
   pass envelope to labels/hover
```

The distance envelope should be computed once per vessel per frame.

Do not recalculate independently inside every draw function.

---

# Required Public API

```ts
function resolveDistanceEnvelope(input: MaritimeDistanceInput): MaritimeDistanceEnvelope;
function resolveDistanceBand(distanceNorm: number): MaritimeDistanceBand;
function applyVisibilityClassToEnvelope(envelope: MaritimeDistanceEnvelope, visibilityClass: string | null): MaritimeDistanceEnvelope;
function getConstants(): object;
```

Runtime namespace:

```ts
SBE.MaritimeDistanceAtmosphere
```

Debug namespace:

```ts
_wos.distanceAtmosphere
```

---

# Debug API

```ts
_wos.distanceAtmosphere.sampleAt(x, y)
_wos.distanceAtmosphere.inspectVessel(vesselId)
_wos.distanceAtmosphere.matrix()
_wos.distanceAtmosphere.constants()
_wos.distanceAtmosphere.setDebug(true)
```

Debug overlay may visualize bands.

Debug overlay must not alter runtime truth.

---

# Failure Modes

If viewport dimensions are missing:

```text
return NEAR-safe default envelope
```

If zoom missing:

```text
use conservative MID envelope
```

If visibilityClass unknown:

```text
apply distance band only
```

If input invalid:

```text
return ATMOSPHERIC-safe envelope
```

No exception should break maritime rendering.

---

# Non-Goals

This spec does NOT implement:

- new wake geometry
- new vessel topology
- WaterMemory resurrection
- fog renderer
- weather simulation
- 2.5D projection
- water reflection rendering
- shoreline interaction
- camera director logic
- AIS continuity changes
- gameplay targeting
- tactical stealth/visibility

---

# First Build Scope

Create:

```text
wall/systems/presentation/maritimeDistanceAtmosphere.js
wall/systems/presentation/maritimeDistanceAtmosphereDebug.js
```

Patch:

```text
wall/render/maritimeOccupancyRenderer.js
wall/index.html
```

Minimum behavior:

- resolve distance envelope per vessel
- reduce wake visibility by distance
- reduce topology detail by distance
- suppress labels/hover at FAR/ATMOSPHERIC
- preserve tiny far lights
- expose debug matrix

---

# Validation Checklist

- [ ] distance envelope returns stable values
- [ ] bands resolve from normalized screen distance
- [ ] visibilityClass only suppresses, never elevates
- [ ] wake alpha reduces with distance
- [ ] FAR/ATMOSPHERIC labels are forbidden
- [ ] hover cards do not appear for atmospheric vessels
- [ ] far lights remain subtle
- [ ] topology receives LOD hints
- [ ] no AIS/runtime truth mutation
- [ ] no camera mutation
- [ ] no renderer orchestration mutation
- [ ] debug overlay is observational only
- [ ] WaterMemory remains disabled by default

---

# Final Status

```text
0526E_WOS_MaritimeDistanceAtmosphere_v1.0.0
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
maritime-distance-depth-atmospheric-compression
```

Build Scope:

```text
distance bands, alpha compression, wake suppression, far-light preservation, label/hover suppression, topology LOD hints
```

Final instruction:

```text
Submit for review before producing v1.0.1_BUILD.
```

---

# Implementation Guide

- Create `wall/systems/presentation/maritimeDistanceAtmosphere.js` and optional debug companion.
- Integrate once per vessel inside `maritimeOccupancyRenderer.js` before topology, wake, light, and label drawing.
- Expect clearer near/mid/far hierarchy, less wake clutter, stronger harbor depth, and no runtime truth mutation.
