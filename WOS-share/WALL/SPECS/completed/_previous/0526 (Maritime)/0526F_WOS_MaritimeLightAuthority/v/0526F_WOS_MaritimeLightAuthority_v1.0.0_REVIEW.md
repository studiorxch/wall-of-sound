---
layout: spec

title: "WOS Maritime Light Authority"
date: 2026-05-27
doc_id: "0526F_WOS_MaritimeLightAuthority_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "presentation"
component: "MaritimeLightAuthority"

type: "runtime-presentation-spec"
status: "review"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Defines authoritative maritime light behavior for navigation lights, far glints, bloom, shimmer, atmospheric twinkle, vessel-class light identity, and distance-reactive harbor presence."

stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "maritime-light-behavior-authority"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525D_WOS_SurfaceStylePresets_v1.0.1"
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0525F_WOS_ProceduralVesselTopology_v1.0.1"
  - "0526C_WOS_ActiveWakePolish_v1.0.1"
  - "0526E_WOS_MaritimeDistanceAtmosphere_v1.0.1"

related:
  - "0526B_WOS_MaritimeWaterMemory_v1.0.1"

owner: "StudioRich / WOS"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Establish maritime light behavior authority before adding harbor population amplification, cinematic weather, or 2.5D light projection.

# 0526F_WOS_MaritimeLightAuthority_v1.0.0

## Purpose

Define the authoritative maritime light behavior system for WOS.

This spec governs:

- navigation lights
- distant vessel glints
- far-light collapse
- bloom behavior
- atmospheric twinkle
- shimmer
- class-specific light signatures
- distance-reactive light visibility
- fog/haze attenuation
- motion-linked light variation

The goal is to transition maritime rendering from:

```text
boats with lights
```

toward:

```text
a living harbor composed of layered maritime light behaviors
```

At distance, vessels should become light, atmosphere, and motion implication before they become readable hulls.

---

# 🧠 Core Doctrine

```text
At distance, lights become the vessel.
```

MaritimeLightAuthority is a presentation-layer interpretation system.

It may make light behavior cinematic, atmospheric, class-distinguishable, and distance-reactive.

It may not invent runtime truth.

Canonical rule:

```text
Light communicates presence.

It does not define existence.
```

---

# Strategic Context

WOS now has:

- procedural vessel topology
- active wake polish
- distance atmosphere
- maritime style registry
- visibility-class suppression
- Surface presets

But distant maritime objects can still read as:

```text
icons with glow
```

instead of:

```text
living harbor signals
```

The next visual breakthrough is light behavior.

This spec creates the light hierarchy that makes distant boats feel alive without requiring full hull readability.

---

# Authority Boundaries

## MaritimeLightAuthority Owns

- maritime light envelopes
- nav-light presentation behavior
- far-light collapse
- bloom radius/alpha
- class-specific light signature
- deterministic pulse phase
- shimmer amount
- distance-reactive render mode
- atmospheric light attenuation
- light reason codes
- debug light previews

## MaritimeLightAuthority May Observe

- vessel class
- vessel heading
- vessel speed
- vessel state
- vessel id / MMSI for deterministic seed
- distance envelope
- visibility class
- zoom
- fog/haze/density pressure
- time of day
- Surface preset light modifiers
- maritime style registry palette

## MaritimeLightAuthority May Produce

- `MaritimeLightEnvelope`
- light render mode
- alpha/bloom values
- deterministic pulse phase
- deterministic shimmer
- nav-light eligibility
- far-light eligibility
- glow color hints
- light reason codes

## MaritimeLightAuthority May NOT Mutate

- AIS truth
- vessel position
- vessel speed
- vessel heading
- vessel state
- vessel class truth
- distance envelope
- visibility class
- population tier
- topology blueprint
- wake profile
- camera state
- renderer orchestration
- Surface preset state
- style registry state

---

# Authority Relationships

## Reads From

- `MaritimeDistanceAtmosphere`
- `VisibilityClassRuntime`
- `MaritimeStyleRegistry`
- `SurfaceStylePresetRuntime`
- renderer zoom
- vessel projected state
- vessel class/taxonomy
- simulation clock

## Writes To

```text
none
```

The module returns immutable presentation envelopes only.

## Observed By

- MaritimeOccupancyRenderer
- active wake renderer, for optional wake glow eligibility
- label/hover renderer, for light-first presentation cues
- debug tools

## Forbidden Scope Expansion

MaritimeLightAuthority is not:

- a sensor system
- a navigation system
- a gameplay visibility system
- a tactical state system
- an AIS continuity system
- a harbor population generator
- a weather system
- a renderer orchestrator

Canonical limit:

```text
MaritimeLightAuthority governs light behavior only.
```

---

# Primary Runtime Contract

Runtime namespace:

```ts
SBE.MaritimeLightAuthority
```

Primary API:

```ts
function resolveLightEnvelope(
  input: MaritimeLightInput
): MaritimeLightEnvelope;
```

The light envelope must be resolved once per vessel per frame after distance envelope resolution.

Recommended render order:

```text
MaritimeDistanceAtmosphere
→ MaritimeLightAuthority
→ topology/wake/light draw decisions
```

---

# Data Model

## Light Render Modes

```ts
type MaritimeLightRenderMode =
  | "DUAL_NAV"
  | "CLUSTER"
  | "POINT"
  | "GHOST"
  | "NONE";
```

## Light Reason Codes

```ts
type MaritimeLightReasonCode =
  | "LIGHT_DUAL_NAV"
  | "LIGHT_CLUSTER"
  | "LIGHT_POINT"
  | "LIGHT_GHOST"
  | "LIGHT_SUPPRESSED"
  | "VISIBILITY_SUPPRESSED"
  | "DISTANCE_SUPPRESSED"
  | "FALLBACK_INVALID_INPUT";
```

No freeform reason strings are allowed.

## MaritimeLightInput

```ts
type MaritimeLightInput = {
  readonly vesselId?: string | null;
  readonly mmsi?: number | string | null;

  readonly vesselClass: string;
  readonly vesselState?: string | null;

  readonly headingDeg: number;
  readonly speedKts: number;

  readonly zoom: number;
  readonly nowMs: number;

  readonly visibilityClass: string | null;
  readonly distanceEnvelope: MaritimeDistanceEnvelope | null;

  readonly fogAlpha?: number;
  readonly hazeAlpha?: number;
  readonly densityPressure?: number;

  readonly timeOfDay?: string | null;
  readonly paletteHint?: string | null;
};
```

## MaritimeLightEnvelope

```ts
type MaritimeLightEnvelope = {
  readonly version: "1.0.0";

  readonly visible: boolean;
  readonly renderMode: MaritimeLightRenderMode;
  readonly reasonCode: MaritimeLightReasonCode;

  readonly alpha: number;
  readonly bloomAlpha: number;
  readonly bloomRadiusPx: number;

  readonly navAlpha: number;
  readonly farAlpha: number;

  readonly pulsePhase: number;
  readonly pulseValue: number;
  readonly shimmerAmount: number;

  readonly navPortColor: string;
  readonly navStarboardColor: string;
  readonly navSternColor: string;
  readonly glowColor: string;

  readonly allowNavPair: boolean;
  readonly allowMastLight: boolean;
  readonly allowFarGlint: boolean;
  readonly allowBloom: boolean;
  readonly allowWakeGlow: boolean;
  readonly allowReflectionHint: boolean;
};
```

All envelopes must be immutable.

---

# System Constants

```ts
const MARITIME_LIGHT_AUTHORITY_VERSION = "1.0.0";

const MIN_LIGHT_ALPHA = 0.02;
const MAX_NAV_ALPHA = 0.92;
const MAX_FAR_ALPHA = 0.55;

const MIN_BLOOM_RADIUS_PX = 1.2;
const MAX_BLOOM_RADIUS_PX = 9.0;

const MAX_BLOOM_ALPHA = 0.22;

const DEFAULT_SHIMMER_AMOUNT = 0.08;
const MAX_SHIMMER_AMOUNT = 0.28;

const DEFAULT_PULSE_HZ = 0.08;
const MAX_PULSE_HZ = 0.33;
```

---

# Class Light Signatures

Each vessel class must resolve to a light signature.

```ts
type MaritimeClassLightSignature = {
  readonly classKey: string;

  readonly baseRenderMode: MaritimeLightRenderMode;

  readonly baseAlpha: number;
  readonly bloomScale: number;
  readonly shimmerScale: number;

  readonly pulseHz: number;
  readonly pulseDepth: number;

  readonly navWarmth: number;
  readonly farWarmth: number;

  readonly clusterCount: number;
  readonly clusterSpreadPx: number;

  readonly suppressUnderAtmosphere: number;
};
```

---

# Signature Table

## Cargo

```ts
{
  classKey: "cargo",
  baseRenderMode: "POINT",
  baseAlpha: 0.44,
  bloomScale: 0.80,
  shimmerScale: 0.45,
  pulseHz: 0.06,
  pulseDepth: 0.12,
  navWarmth: 0.55,
  farWarmth: 0.65,
  clusterCount: 1,
  clusterSpreadPx: 0,
  suppressUnderAtmosphere: 0.35
}
```

Feeling:

```text
slow heavy amber
```

---

## Tanker

```ts
{
  classKey: "tanker",
  baseRenderMode: "POINT",
  baseAlpha: 0.38,
  bloomScale: 0.95,
  shimmerScale: 0.35,
  pulseHz: 0.045,
  pulseDepth: 0.08,
  navWarmth: 0.70,
  farWarmth: 0.75,
  clusterCount: 1,
  clusterSpreadPx: 0,
  suppressUnderAtmosphere: 0.42
}
```

Feeling:

```text
broad slow industrial glow
```

---

## Ferry

```ts
{
  classKey: "ferry",
  baseRenderMode: "DUAL_NAV",
  baseAlpha: 0.62,
  bloomScale: 0.75,
  shimmerScale: 0.55,
  pulseHz: 0.12,
  pulseDepth: 0.16,
  navWarmth: 0.35,
  farWarmth: 0.45,
  clusterCount: 2,
  clusterSpreadPx: 3.5,
  suppressUnderAtmosphere: 0.25
}
```

Feeling:

```text
organized commuter pulse
```

---

## Tug

```ts
{
  classKey: "tug",
  baseRenderMode: "CLUSTER",
  baseAlpha: 0.58,
  bloomScale: 0.65,
  shimmerScale: 0.90,
  pulseHz: 0.18,
  pulseDepth: 0.24,
  navWarmth: 0.62,
  farWarmth: 0.70,
  clusterCount: 3,
  clusterSpreadPx: 4.0,
  suppressUnderAtmosphere: 0.30
}
```

Feeling:

```text
irregular working cluster
```

---

## Recreational

```ts
{
  classKey: "recreational",
  baseRenderMode: "POINT",
  baseAlpha: 0.48,
  bloomScale: 0.55,
  shimmerScale: 0.75,
  pulseHz: 0.15,
  pulseDepth: 0.20,
  navWarmth: 0.25,
  farWarmth: 0.35,
  clusterCount: 1,
  clusterSpreadPx: 0,
  suppressUnderAtmosphere: 0.40
}
```

Feeling:

```text
small lively drifting white
```

---

## Fishing

```ts
{
  classKey: "fishing",
  baseRenderMode: "CLUSTER",
  baseAlpha: 0.46,
  bloomScale: 0.60,
  shimmerScale: 0.80,
  pulseHz: 0.11,
  pulseDepth: 0.22,
  navWarmth: 0.50,
  farWarmth: 0.55,
  clusterCount: 2,
  clusterSpreadPx: 3.0,
  suppressUnderAtmosphere: 0.38
}
```

Feeling:

```text
unstable mixed-intensity work light
```

---

## Passenger / Cruise

```ts
{
  classKey: "passenger",
  baseRenderMode: "CLUSTER",
  baseAlpha: 0.64,
  bloomScale: 1.15,
  shimmerScale: 0.35,
  pulseHz: 0.05,
  pulseDepth: 0.08,
  navWarmth: 0.42,
  farWarmth: 0.50,
  clusterCount: 4,
  clusterSpreadPx: 5.5,
  suppressUnderAtmosphere: 0.22
}
```

Feeling:

```text
broad soft luxury glow
```

---

## Military

```ts
{
  classKey: "military",
  baseRenderMode: "GHOST",
  baseAlpha: 0.18,
  bloomScale: 0.20,
  shimmerScale: 0.20,
  pulseHz: 0.04,
  pulseDepth: 0.04,
  navWarmth: 0.30,
  farWarmth: 0.30,
  clusterCount: 1,
  clusterSpreadPx: 0,
  suppressUnderAtmosphere: 0.70
}
```

Feeling:

```text
minimal visible signal
```

Do not describe as stealth, threat, or tactical concealment.

---

## Industrial

```ts
{
  classKey: "industrial",
  baseRenderMode: "CLUSTER",
  baseAlpha: 0.50,
  bloomScale: 0.85,
  shimmerScale: 0.60,
  pulseHz: 0.09,
  pulseDepth: 0.16,
  navWarmth: 0.72,
  farWarmth: 0.78,
  clusterCount: 3,
  clusterSpreadPx: 4.5,
  suppressUnderAtmosphere: 0.36
}
```

Feeling:

```text
warm mechanical dock glow
```

---

## Service

```ts
{
  classKey: "service",
  baseRenderMode: "DUAL_NAV",
  baseAlpha: 0.52,
  bloomScale: 0.65,
  shimmerScale: 0.60,
  pulseHz: 0.13,
  pulseDepth: 0.18,
  navWarmth: 0.45,
  farWarmth: 0.50,
  clusterCount: 2,
  clusterSpreadPx: 2.8,
  suppressUnderAtmosphere: 0.35
}
```

Feeling:

```text
utility signal
```

---

## Unknown / Default

```ts
{
  classKey: "unknown",
  baseRenderMode: "POINT",
  baseAlpha: 0.32,
  bloomScale: 0.50,
  shimmerScale: 0.45,
  pulseHz: 0.08,
  pulseDepth: 0.12,
  navWarmth: 0.45,
  farWarmth: 0.50,
  clusterCount: 1,
  clusterSpreadPx: 0,
  suppressUnderAtmosphere: 0.45
}
```

Feeling:

```text
neutral maritime signal
```

---

# Distance-Based Light Collapse

MaritimeLightAuthority must consume the distance envelope.

Recommended collapse:

| Distance Band | Light Mode |
|---|---|
| HERO | DUAL_NAV or CLUSTER |
| NEAR | DUAL_NAV or CLUSTER |
| MID | CLUSTER or POINT |
| FAR | POINT or GHOST |
| ATMOSPHERIC | GHOST or NONE |

Rules:

- distance may simplify light mode
- distance may reduce bloom
- distance may preserve far glint
- distance may not elevate hidden vessels

---

# Visibility-Class Integration

Visibility class may only suppress.

Rules:

```text
ATMOSPHERIC_HIDDEN → NONE
LIGHT_ONLY         → POINT / GHOST only
MARKER_ONLY        → POINT only
SILHOUETTE         → POINT / GHOST
REDUCED            → simplified mode
FULL               → distance mode controls
```

---

# Temporal Behavior

Light behavior must be deterministic.

Allowed:

- deterministic pulse phase
- seeded shimmer
- class-specific pulse rate
- subtle asynchronous variance

Forbidden:

- `Math.random()`
- frame-random blinking
- synchronized global blinking
- urgent emergency-like pulsing
- false alarm coding

Reference:

```ts
pulseValue =
  1.0 - pulseDepth +
  pulseDepth * (0.5 + 0.5 * sin(nowMs * pulseHz * TAU + pulsePhase));
```

---

# Seed Rule

Stable seed order:

```text
mmsi
→ vesselId
→ classKey
→ 0
```

Seed must only influence presentation phase and tiny cluster offsets.

Seed must not imply behavior.

---

# Bloom Policy

Bloom should be:

- subtle
- atmospheric
- smaller close-up
- softer farther away
- dimmer in dense atmosphere
- never urgent
- never larger than allowed cap

Rules:

```text
far lights may bloom slightly larger but dimmer
close lights sharpen
bloom must not obscure hull topology
```

---

# Render Mode Semantics

## DUAL_NAV

Port/starboard/stern readable pair.

Use for:

- HERO
- NEAR
- ferry
- service
- close recreational vessels

## CLUSTER

Multiple small related glints.

Use for:

- tug
- industrial
- passenger/cruise
- fishing

## POINT

Single distant maritime glint.

Use for:

- cargo
- tanker
- far vessels
- marker-only vessels

## GHOST

Near-invisible atmospheric shimmer.

Use for:

- atmospheric distance
- military/minimal visible signal
- heavy suppression

## NONE

Fully suppressed.

---

# Renderer Integration

In `maritimeOccupancyRenderer.js`:

1. resolve `MaritimeDistanceEnvelope`
2. resolve `MaritimeLightEnvelope`
3. draw topology/wake based on distance and visibility
4. draw lights based on light envelope

Recommended:

```ts
const lightEnv = SBE.MaritimeLightAuthority.resolveLightEnvelope({
  vesselId,
  mmsi,
  vesselClass,
  vesselState,
  headingDeg,
  speedKts,
  zoom,
  nowMs,
  visibilityClass,
  distanceEnvelope,
  fogAlpha,
  hazeAlpha,
  densityPressure,
  timeOfDay,
  paletteHint,
});
```

Existing light draw code may remain as fallback.

MaritimeLightAuthority should become the canonical gate for:

- nav-light alpha
- far-light alpha
- bloom radius
- render mode
- shimmer/pulse value

---

# Required Public API

```ts
function resolveLightEnvelope(input: MaritimeLightInput): MaritimeLightEnvelope;

function resolveClassLightSignature(vesselClass: string): MaritimeClassLightSignature;

function getFallbackLightEnvelope(reasonCode: MaritimeLightReasonCode): MaritimeLightEnvelope;

function getConstants(): object;
```

---

# Debug API

Debug namespace:

```ts
_wos.lightAuthority
```

Required methods:

```ts
_wos.lightAuthority.preview("ferry")
_wos.lightAuthority.sample("cargo", "FAR")
_wos.lightAuthority.compare("cargo", "tug")
_wos.lightAuthority.matrix()
_wos.lightAuthority.constants()
_wos.lightAuthority.setDebug(true)
```

Debug output must be observational only.

---

# Failure Modes

If input missing:

```text
return NONE fallback
```

If distance envelope missing:

```text
return conservative POINT fallback
```

If class unknown:

```text
use unknown signature
```

If visibility class hidden:

```text
return NONE
```

If timing missing:

```text
use simulation clock if available, otherwise 0
```

No light authority error should break vessel rendering.

---

# Non-Goals

This spec does NOT implement:

- new vessel topology
- new wake modes
- WaterMemory resurrection
- harbor population amplification
- dock light generation
- city light layers
- emergency signaling
- gameplay visibility
- tactical stealth
- weather simulation
- reflection rendering
- 2.5D light extrusion

---

# First Build Scope

Create:

```text
wall/systems/presentation/maritimeLightAuthority.js
wall/systems/presentation/maritimeLightAuthorityDebug.js
```

Patch:

```text
wall/render/maritimeOccupancyRenderer.js
wall/index.html
```

Minimum behavior:

- resolve light envelope per vessel
- class-specific light signatures
- deterministic shimmer/pulse
- distance-based render mode collapse
- visibility-class suppression
- debug preview/matrix
- no runtime truth mutation

---

# Validation Checklist

- [ ] light envelope is immutable
- [ ] reasonCode is typed, not freeform
- [ ] class signatures exist for all vessel classes
- [ ] unknown fallback exists
- [ ] no `Math.random()` used
- [ ] pulse phase derives from stable vessel seed
- [ ] visibility class only suppresses
- [ ] distance envelope controls light collapse
- [ ] ATMOSPHERIC_HIDDEN returns NONE
- [ ] far vessels collapse toward POINT/GHOST
- [ ] HERO/NEAR vessels can retain DUAL_NAV/CLUSTER
- [ ] bloom stays under caps
- [ ] military/minimal visible signal avoids tactical language
- [ ] no AIS/runtime truth mutation
- [ ] no camera mutation
- [ ] no renderer orchestration mutation
- [ ] debug tools are observational only

---

# Final Status

```text
0526F_WOS_MaritimeLightAuthority_v1.0.0
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
maritime-light-behavior-authority
```

Build Scope:

```text
maritime light envelopes, class-specific light signatures, deterministic shimmer/pulse, distance-based light collapse, bloom control, visibility-class suppression
```

Final instruction:

```text
Submit for review before producing v1.0.1_BUILD.
```

---

# Implementation Guide

- Create `wall/systems/presentation/maritimeLightAuthority.js` and `wall/systems/presentation/maritimeLightAuthorityDebug.js`.
- Integrate after `MaritimeDistanceAtmosphere` in `maritimeOccupancyRenderer.js`; keep existing light drawing as fallback.
- Expect distant vessels to read as living harbor glints instead of uniform map icons.
