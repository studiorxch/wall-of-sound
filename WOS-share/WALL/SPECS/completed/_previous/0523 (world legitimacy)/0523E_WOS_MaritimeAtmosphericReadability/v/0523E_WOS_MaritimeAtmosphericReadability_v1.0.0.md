---
title: "WOS Maritime Atmospheric Readability"
filename: "0523E_WOS_MaritimeAtmosphericReadability_v1.0.0.md"
version: "1.0.0"
date: "2026-05-24"
system: "WOS"
module: "Maritime Atmospheric Readability"
type: "runtime-interpretation-spec"

status: "[REVIEW]"
stage: "[REVIEW]"
freeze_decision: "REVIEW"

build_scope: "none"
owner: "StudioRich / WOS"

depends_on:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.1"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.1"
  - "0523D_WOS_MaritimeWakeAuthority_v1.0.1"
  - "0523R_WOS_InfrastructureRegistry_v1.2.2"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Architecture + governance review before build.

---

# 0523E_WOS_MaritimeAtmosphericReadability_v1.0.0

## Purpose

Define how atmospheric conditions affect maritime visual readability without mutating vessel truth, AIS state, wake truth, population authority, ecology authority, or renderer ownership.

This spec governs:

- visibility interpretation
- atmospheric attenuation
- distance readability
- fog/rain/night/haze readability pressure
- silhouette fallback
- light-only fallback
- label suppression
- wake readability interpretation
- clutter reduction
- perceptual prioritization

This spec does NOT govern:

- vessel existence
- AIS ingestion
- AIS truth
- vessel lifecycle
- vessel motion
- synthetic vessel creation
- population tier assignment
- wake segment creation
- wake decay
- renderer drawing implementation
- camera targeting
- gameplay systems
- audio generation

Core doctrine:

```text
Atmosphere may suppress visibility.
Atmosphere may never suppress existence.
```

---

# 1. Core Principle

AtmosphericReadability is an interpretation layer.

It receives authoritative runtime state and returns readability descriptors.

It does not own truth.

```text
Runtime owns existence.
Atmosphere owns readability.
Renderer owns presentation.
```

Atmosphere may say:

```text
this vessel is barely readable
```

Atmosphere may NOT say:

```text
this vessel no longer exists
```

---

# 2. Authority Boundaries

## AtmosphericReadability Owns

- readability scores
- visibility attenuation
- label suppression recommendation
- silhouette fallback recommendation
- light-only fallback recommendation
- wake visibility attenuation
- atmospheric clutter pressure
- distance readability curves
- environmental readability modifiers

## AtmosphericReadability May Observe

- vessel class
- population tier
- vessel provenance
- distance from camera/viewpoint
- weather state
- time of day
- wake segment intensity
- wake provenance
- taxonomy render envelope
- population update advisory
- renderer scale context

## AtmosphericReadability May Not Mutate

- AIS state
- vessel position
- vessel heading
- vessel speed
- vessel lifecycle state
- synthetic vessel state
- population tier
- taxonomy profile values
- wake segment registry
- wake segment lifetime
- ecology spawn state
- renderer buffers
- camera state

---

# 3. Core Doctrine

## 3.1 Visibility Is Not Existence

A vessel hidden by fog remains active if runtime says it is active.

A wake hidden by rain remains in WakeRegistry if WakeAuthority says it exists.

A label suppressed by clutter does not remove the vessel.

```text
readability = perception
existence = runtime truth
```

---

## 3.2 Atmosphere Is Advisory To Renderer

AtmosphericReadability outputs descriptors.

Renderer chooses visual implementation.

AtmosphericReadability may recommend:

- full vessel
- reduced vessel
- silhouette
- marker only
- light only
- hidden visually

But only renderer decides how to draw those recommendations.

Atmosphere does not draw.

---

## 3.3 No Camera Authority

AtmosphericReadability may not:

- select camera targets
- promote vessels
- create hero moments
- alter camera framing
- request cinematic focus

Camera systems may observe readability later, but this spec grants no camera authority.

---

## 3.4 No Population Authority

AtmosphericReadability may not:

- assign HERO/MID/BACKGROUND/GHOST
- promote vessels
- demote vessels
- alter update advisory
- change label eligibility source of truth

It may only recommend whether an otherwise eligible label is readable.

---

# 4. Readability Output Contract

```ts
type AtmosphericReadabilityResult = {
  entityId: string;
  entityType: "VESSEL" | "WAKE";

  visibilityClass:
    | "FULL"
    | "REDUCED"
    | "SILHOUETTE"
    | "MARKER_ONLY"
    | "LIGHT_ONLY"
    | "ATMOSPHERIC_HIDDEN";

  readabilityScore: number; // 0.0 → 1.0

  labelReadable: boolean;
  wakeReadable: boolean;

  atmosphericAlphaMultiplier: number; // 0.0 → 1.0
  atmosphericBlurHint: number;        // 0.0 → 1.0
  atmosphericContrastHint: number;    // 0.0 → 1.0

  reasonCodes: AtmosphericReadabilityReason[];
};
```

---

## 4.1 Reason Codes

```ts
type AtmosphericReadabilityReason =
  | "DISTANCE_ATTENUATION"
  | "FOG_SUPPRESSION"
  | "RAIN_SUPPRESSION"
  | "NIGHT_LIGHT_ONLY"
  | "HAZE_REDUCTION"
  | "CLUTTER_SUPPRESSION"
  | "LOW_POPULATION_TIER"
  | "LOW_TAXONOMY_RESISTANCE"
  | "WAKE_FADED"
  | "SYNTHETIC_DEEMPHASIS"
  | "LABEL_DENSITY_SUPPRESSION";
```

Reason codes are diagnostic.

They may not trigger runtime mutation.

---

# 5. Visibility Classes

## FULL

The object should be fully readable.

Typical use:

- HERO vessels
- nearby MID vessels
- high-confidence ferry/passenger/tug activity
- high-visibility day conditions

## REDUCED

The object should remain recognizable but visually softened.

Typical use:

- mid-distance vessels
- moderate haze
- background industrial presence
- lower-priority AIS vessels

## SILHOUETTE

The object should be readable mainly by shape.

Typical use:

- fog
- dusk
- distant cargo/tanker forms
- industrial corridors
- low-label situations

## MARKER_ONLY

The object should be represented minimally.

Typical use:

- dense harbor clutter
- distant background vessels
- low detail zoom states
- utility presence

## LIGHT_ONLY

The object should be expressed primarily as light.

Typical use:

- night
- foggy ferry lanes
- distant Manhattan/Hudson traffic
- bridge approaches
- low hull visibility

## ATMOSPHERIC_HIDDEN

The object is visually hidden by atmosphere.

Important:

```text
ATMOSPHERIC_HIDDEN does not mean dormant.
ATMOSPHERIC_HIDDEN does not mean deleted.
ATMOSPHERIC_HIDDEN does not mean evicted.
```

---

# 6. Environmental Inputs

```ts
type MaritimeAtmosphericContext = {
  simulationTimeMs: number;

  timeOfDay:
    | "DAWN"
    | "MORNING"
    | "MIDDAY"
    | "DUSK"
    | "NIGHT";

  weatherState:
    | "CLEAR"
    | "CLOUDY"
    | "HAZE"
    | "FOG"
    | "RAIN"
    | "STORM"
    | "SNOW";

  visibilityMeters: number | null;

  viewportScale: number;
  cameraDistanceMeters: number | null;

  clutterPressure: number; // 0.0 → 1.0
};
```

No wall-clock reads are allowed.

Time-of-day must derive from simulation clock or provided environment context.

---

# 7. Entity Inputs

## Vessel Readability Input

```ts
type VesselReadabilityInput = {
  vesselId: string;
  vesselClass: VesselClass;
  provenance: "AIS_VESSEL" | "SYNTHETIC_ECOLOGY";

  populationTier:
    | "HERO"
    | "MID"
    | "BACKGROUND"
    | "GHOST";

  distanceMeters: number;

  taxonomyAtmosphericResistance: number; // 0.0 → 1.0
  taxonomyProjectionWeight: number;      // 0.0 → 1.0
  taxonomyLabelPriority: number;         // 0.0 → 1.0

  updateAdvisory:
    | "UPDATE_FULL"
    | "UPDATE_STANDARD"
    | "UPDATE_REDUCED"
    | "UPDATE_MINIMAL";
};
```

## Wake Readability Input

```ts
type WakeReadabilityInput = {
  wakeId: string;
  vesselId: string;

  provenance:
    | "AIS_VESSEL"
    | "SYNTHETIC_ECOLOGY";

  intensityRaw: number;   // 0.0 → 1.0
  turbulenceRaw: number;  // 0.0 → 1.0
  ageRatio: number;       // 0.0 fresh → 1.0 expired

  populationTierAtEmission:
    | "HERO"
    | "MID"
    | "BACKGROUND"
    | "GHOST";
};
```

---

# 8. Readability Score Model

Canonical baseline:

```text
readabilityScore =
baseTierReadability
× distanceFactor
× weatherFactor
× timeOfDayFactor
× taxonomyResistanceFactor
× clutterFactor
× provenanceFactor
```

Output is clamped:

```text
0.0 → 1.0
```

This score is:

```text
visual interpretation only
```

It may not alter:
- vessel lifecycle
- AIS confidence
- population tier
- wake lifetime
- ecology density

---

# 9. Tier Baselines

```ts
const TIER_READABILITY_BASELINE = {
  HERO: 1.0,
  MID: 0.82,
  BACKGROUND: 0.48,
  GHOST: 0.18,
};
```

Population tier influences visibility.

It does not get changed by visibility.

---

# 10. Weather Factors

```ts
const WEATHER_READABILITY_FACTOR = {
  CLEAR: 1.0,
  CLOUDY: 0.88,
  HAZE: 0.68,
  FOG: 0.38,
  RAIN: 0.58,
  STORM: 0.32,
  SNOW: 0.42,
};
```

Weather factors are advisory baselines.

Renderer may interpret these values visually.

Atmosphere may not mutate runtime truth.

---

# 11. Time-of-Day Factors

```ts
const TIME_READABILITY_FACTOR = {
  DAWN: 0.78,
  MORNING: 0.92,
  MIDDAY: 1.0,
  DUSK: 0.72,
  NIGHT: 0.46,
};
```

Night does not remove vessels.

Night should often push vessels toward:

```text
LIGHT_ONLY
```

instead of:
```text
ATMOSPHERIC_HIDDEN
```

especially for ferry, passenger, tug, and harbor utility traffic.

---

# 12. Distance Attenuation

Distance affects readability, not existence.

Recommended baseline:

```ts
function resolveDistanceFactor(distanceMeters: number): number {
  if (distanceMeters <= 500) return 1.0;
  if (distanceMeters <= 1500) return 0.8;
  if (distanceMeters <= 4000) return 0.55;
  if (distanceMeters <= 8000) return 0.32;
  return 0.16;
}
```

Distant vessels should degrade through:

```text
FULL → REDUCED → SILHOUETTE → MARKER_ONLY → LIGHT_ONLY / HIDDEN
```

depending on weather and time of day.

---

# 13. Visibility Class Thresholds

```ts
function resolveVisibilityClass(score: number, context: MaritimeAtmosphericContext) {
  if (score >= 0.78) return "FULL";
  if (score >= 0.55) return "REDUCED";
  if (score >= 0.34) return "SILHOUETTE";
  if (score >= 0.18) {
    return context.timeOfDay === "NIGHT" ? "LIGHT_ONLY" : "MARKER_ONLY";
  }
  return "ATMOSPHERIC_HIDDEN";
}
```

`ATMOSPHERIC_HIDDEN` is visual only.

---

# 14. Label Readability

Atmosphere may suppress labels.

Atmosphere may not remove label authority.

PopulationHierarchy owns label eligibility.

AtmosphericReadability owns label readability.

```text
labelEligibility = PopulationHierarchy
labelReadability = AtmosphericReadability
```

A label is readable only if:

```text
PopulationHierarchy allows label
AND
AtmosphericReadability says labelReadable
```

---

# 15. Wake Readability

WakeAuthority owns wake truth.

AtmosphericReadability owns wake perceptibility.

Wake readability may be reduced by:

- fog
- rain
- night
- wake age
- low intensity
- synthetic provenance
- clutter

AtmosphericReadability may not:

- create WakeSegments
- delete WakeSegments
- extend WakeSegments
- shorten WakeSegments
- mutate WakeRegistry
- mutate vessel state

---

# 16. AIS vs Synthetic Readability

AIS vessels should generally retain higher readability than synthetic vessels under equivalent conditions.

Suggested provenance factor:

```ts
const PROVENANCE_READABILITY_FACTOR = {
  AIS_VESSEL: 1.0,
  SYNTHETIC_ECOLOGY: 0.72,
};
```

Synthetic deemphasis supports:

- AIS supremacy
- background restraint
- reduced fake-activity clutter

Synthetic vessels remain visible when appropriate.

They are not automatically hidden.

---

# 17. Fog Doctrine

Fog may strongly suppress visual readability.

Fog may not suppress existence.

Fog should preserve:

- nearby HERO/MID readability
- light-only ferry paths
- strong wake traces where appropriate
- silhouettes for heavy vessels
- atmospheric ambiguity

Fog should reduce:

- labels
- background clutter
- synthetic visibility
- distant recreational vessels

---

# 18. Night Doctrine

Night should not make the harbor empty.

Night readability shifts toward:

- light trails
- ferry lanes
- tug/utility lights
- industrial silhouettes
- wake glints
- reflective water memory

Night may reduce hull readability.

Night should not erase harbor rhythm.

---

# 19. Clutter Pressure

Clutter pressure represents visual density stress.

```ts
type ClutterPressure = number; // 0.0 → 1.0
```

High clutter pressure may:

- suppress labels
- reduce BACKGROUND readability
- collapse distant vessels to markers
- suppress synthetic visual priority
- simplify wake rendering recommendations

High clutter pressure may NOT:

- delete vessels
- change population tier
- change AIS confidence
- change wake lifetime

---

# 20. Output Functions

## 20.1 resolveVesselReadability

```ts
function resolveVesselReadability(
  input: VesselReadabilityInput,
  context: MaritimeAtmosphericContext
): AtmosphericReadabilityResult;
```

## 20.2 resolveWakeReadability

```ts
function resolveWakeReadability(
  input: WakeReadabilityInput,
  context: MaritimeAtmosphericContext
): AtmosphericReadabilityResult;
```

## 20.3 resolveLabelReadability

```ts
function resolveLabelReadability(
  input: VesselReadabilityInput,
  context: MaritimeAtmosphericContext
): boolean;
```

All functions must be pure.

No mutation.

No runtime writes.

No renderer writes.

---

# 21. Determinism Requirements

AtmosphericReadability must be deterministic.

Forbidden:

- `Date.now()`
- `performance.now()`
- `Math.random()`
- live DOM reads
- renderer buffer reads
- camera mutation
- runtime mutation

Allowed:

- provided simulation time
- provided context
- deterministic scalar math
- taxonomy profile reads
- population record reads
- wake segment reads

---

# 22. Renderer Interface

Renderer may consume:

- visibilityClass
- readabilityScore
- atmosphericAlphaMultiplier
- atmosphericBlurHint
- atmosphericContrastHint
- labelReadable
- wakeReadable
- reasonCodes

Renderer may not request atmosphere to:

- mutate runtime state
- create hidden vessels
- alter vessel class
- alter population tier
- alter wake registry
- promote camera targets

---

# 23. Debug / Telemetry

AtmosphericReadability may expose debug snapshots:

```ts
type AtmosphericReadabilityDebug = {
  evaluatedVessels: number;
  evaluatedWakes: number;
  hiddenByAtmosphere: number;
  labelSuppressed: number;
  lightOnlyCount: number;
  silhouetteCount: number;
  averageReadabilityScore: number;
};
```

Telemetry is diagnostic only.

It must not become runtime control.

---

# 24. Validation Checklist

- [ ] Atmosphere never mutates AIS truth
- [ ] Atmosphere never mutates vessel lifecycle
- [ ] Atmosphere never mutates vessel motion
- [ ] Atmosphere never mutates population tier
- [ ] Atmosphere never creates or deletes WakeSegments
- [ ] Atmosphere never changes wake lifetime
- [ ] Atmosphere never controls camera
- [ ] Atmosphere never assigns HERO/MID/BACKGROUND/GHOST
- [ ] Atmosphere can suppress visibility without suppressing existence
- [ ] Label readability remains separate from label eligibility
- [ ] Synthetic vessels are visually deemphasized but not automatically hidden
- [ ] Night supports light-only harbor readability
- [ ] Fog supports silhouette and light-only fallback
- [ ] All functions are deterministic and pure
- [ ] No wall-clock reads
- [ ] No renderer writes
- [ ] No runtime writes

---

# 25. Build Readiness

Current state:

```text
Stage: [REVIEW]
Freeze Decision: REVIEW
```

Do not build until review confirms:

- readability does not become existence authority
- atmospheric visibility does not mutate runtime state
- renderer/atmosphere boundary is stable
- wake readability cannot mutate WakeAuthority
- label readability is separate from label authority
- deterministic requirements are sufficient

---

# 26. Suggested Runtime Files

```text
wall/
  systems/
    maritimeAtmosphericReadability.js
```

Optional later:

```text
wall/
  systems/
    maritimeAtmosphericDebug.js
```

---

# 27. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523E_WOS_MaritimeAtmosphericReadability_v1.0.0.md`
- **What to run:** review before build; then implement as a pure interpretation module consumed by MarineRenderer.
- **What to expect:** vessels, wakes, labels, and harbor motion become atmospherically readable without atmosphere gaining runtime authority.
