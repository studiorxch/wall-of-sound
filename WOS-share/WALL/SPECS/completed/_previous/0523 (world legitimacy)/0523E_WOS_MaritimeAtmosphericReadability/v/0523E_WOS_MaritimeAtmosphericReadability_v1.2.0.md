---
title: "WOS Maritime Atmospheric Readability"
filename: "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0.md"
version: "1.2.0"
date: "2026-05-24"
system: "WOS"
module: "Maritime Atmospheric Readability"
type: "runtime-interpretation-spec"

status: "[BUILD]"
stage: "[BUILD]"
freeze_decision: "GO"

build_scope: "pure-readability-interpretation-only"
owner: "StudioRich / WOS"

supersedes:
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.0.0.md"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.1.0.md"

depends_on:
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523C_WOS_MaritimeSpawnEcology_v1.2.1"
  - "0523D_WOS_MaritimeWakeAuthority_v1.1.0"
  - "0523R_WOS_InfrastructureRegistry_v1.2.2"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Safe to send to build as pure deterministic interpretation infrastructure.

---

# 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0

## Purpose

Define how atmospheric conditions affect maritime visual readability without mutating vessel truth, AIS state, wake truth, population authority, ecology authority, renderer ownership, or camera behavior.

This spec governs:

- visibility interpretation
- atmospheric attenuation
- distance readability
- fog/rain/night/haze readability pressure
- silhouette fallback
- marker fallback
- light-only fallback
- label suppression
- wake readability interpretation
- clutter pressure interpretation
- perceptual readability descriptors

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

AtmosphericReadability is a deterministic interpretation layer.

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

# 2. Change Summary From v1.1.0

v1.2.0 resolves the remaining freeze-validation blockers identified during v1.1.0 review.

## Fixed

- Removed weather/distance double-counting.
- Clarified that `distanceFactor` in the canonical score uses raw distance.
- Preserved `weatherFactor` as the sole default weather suppression path.
- Moved `effectiveDistanceMeters` into optional continuous-visibility extension logic.
- Clarified blur hint uses raw-distance `distanceFactor`.
- Replaced phantom `0523D v1.0.1` dependency with valid WakeAuthority dependency.
- Removed non-standard `_FULL` registry dependency suffix.

## Preserved

- visibility is not existence
- readabilityScore is non-authoritative
- no runtime mutation
- no renderer mutation
- no camera authority
- no population authority
- deterministic pure-function requirement
- label readability vs label eligibility separation
- wake truth vs wake readability separation

---

# 3. Authority Boundaries

## AtmosphericReadability Owns

- readability scores
- visibility attenuation
- label readability recommendation
- silhouette fallback recommendation
- marker-only fallback recommendation
- light-only fallback recommendation
- wake visibility attenuation
- atmospheric clutter interpretation
- distance readability curves
- environmental readability modifiers
- diagnostic reason codes

## AtmosphericReadability May Observe

- vessel class
- population tier
- vessel provenance
- distance from viewpoint
- weather state
- time of day
- wake segment intensity
- wake age ratio
- wake provenance
- taxonomy render envelope
- population update advisory
- viewport scale context
- provided clutterPressure

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

# 4. Visibility Is Not Existence

A vessel hidden by fog remains active if runtime says it is active.

A wake hidden by rain remains in WakeRegistry if WakeAuthority says it exists.

A label suppressed by clutter does not remove the vessel.

```text
readability = perception
existence = runtime truth
```

`ATMOSPHERIC_HIDDEN` is visual only.

It is not:

- dormant
- deleted
- evicted
- stale
- invalid
- absent

---

# 5. Atmosphere Is Advisory To Renderer

AtmosphericReadability outputs descriptors.

Renderer chooses visual implementation.

AtmosphericReadability may recommend:

- full vessel
- reduced vessel
- silhouette
- marker only
- light only
- atmospherically hidden

Renderer decides how to draw those recommendations.

Atmosphere does not draw.

---

# 6. No Camera Authority

AtmosphericReadability may not:

- select camera targets
- promote vessels
- create hero moments
- alter camera framing
- request cinematic focus
- feed pacing systems as an authority signal

Camera systems may observe readability later, but this spec grants no camera authority.

---

# 7. No Population Authority

AtmosphericReadability may not:

- assign HERO/MID/BACKGROUND/GHOST
- promote vessels
- demote vessels
- alter update advisory
- change label eligibility source of truth

It may only recommend whether an otherwise eligible label is readable.

```text
labelEligibility = PopulationHierarchy
labelReadability = AtmosphericReadability
```

---

# 8. Readability Score Is Non-Authoritative

`readabilityScore` is interpretive only.

It may NOT be used as:

- runtime confidence
- AIS confidence
- vessel priority
- lifecycle state
- population tier input
- spawn ecology input
- camera target weight
- pacing trigger
- gameplay trigger
- wake authority input

It may be used only by presentation-facing systems as a readability descriptor.

---

# 9. Readability Output Contract

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

  readabilityScore: number; // 0.0 → 1.0, interpretive only

  labelReadable: boolean;
  wakeReadable: boolean;

  atmosphericAlphaMultiplier: number; // 0.0 → 1.0
  atmosphericBlurHint: number;        // 0.0 → 1.0
  atmosphericContrastHint: number;    // 0.0 → 1.0

  reasonCodes: AtmosphericReadabilityReason[];
};
```

---

# 10. Reason Codes

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
  | "LABEL_DENSITY_SUPPRESSION"
  | "MINIMUM_DISTANCE_PROTECTED";
```

Reason codes are diagnostic.

They may not trigger runtime mutation.

## SYNTHETIC_DEEMPHASIS Trigger

Emit `SYNTHETIC_DEEMPHASIS` whenever:

```ts
provenance === "SYNTHETIC_ECOLOGY"
```

and the synthetic provenance factor is applied.

---

# 11. Visibility Classes

## FULL

Fully readable object.

Typical:

- HERO vessels
- nearby MID vessels
- high-confidence ferry/passenger/tug traffic
- clear daytime conditions

## REDUCED

Recognizable but softened.

Typical:

- mid-distance vessels
- moderate haze
- background industrial presence

## SILHOUETTE

Readable mainly by shape.

Typical:

- fog
- dusk
- distant cargo/tanker vessels
- industrial corridors

## MARKER_ONLY

Minimal positional readability.

Typical:

- dense clutter
- distant background vessels
- low detail zoom states

## LIGHT_ONLY

Expressed primarily as light.

Typical:

- night
- foggy ferry lanes
- distant Manhattan/Hudson traffic
- bridge approaches
- tug or utility movement

## ATMOSPHERIC_HIDDEN

Visually hidden by atmosphere.

It does not imply runtime absence.

---

# 12. Environmental Inputs

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

# 13. Clutter Pressure Source

`clutterPressure` is provided by PopulationHierarchy or a future non-renderer density assessment module.

It represents visual density stress and may be derived from:

- vessel count within current logical viewport
- wake density within current logical viewport
- population tier distribution
- overlap/crowding metrics
- update advisory pressure
- renderer LOD pressure as a precomputed scalar only

AtmosphericReadability does not compute `clutterPressure`.

Renderer buffers may not be read to compute `clutterPressure`.

Renderer-owned visual state may not become a backdoor input to atmospheric authority.

---

# 14. Entity Inputs

## 14.1 Vessel Readability Input

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

## Field Usage Notes

`taxonomyProjectionWeight` may modulate minimum visibility protection and silhouette persistence.

`taxonomyLabelPriority` may influence `labelReadable`.

`updateAdvisory` may influence debug reason codes and future cadence scheduling but must not mutate update frequency in this spec.

`cameraDistanceMeters` is optional contextual metadata. If present, it may be used to normalize viewport-scale distance calculations. It must not trigger camera mutation.

`visibilityMeters` is optional continuous visibility input. If present, it may activate optional continuous-visibility mode. If absent, discrete `weatherFactor` remains the sole weather suppression path.

---

## 14.2 Wake Readability Input

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

For wake readability results:

```ts
labelReadable = false;
```

Wakes do not own labels.

---

# 15. Readability Score Model

Canonical vessel baseline:

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

This score is visual interpretation only.

It may not alter:

- vessel lifecycle
- AIS confidence
- population tier
- wake lifetime
- ecology density
- camera behavior

## 15.1 Weather Suppression Path

Default mode uses:

```text
weatherFactor
```

as the only weather suppression path inside the canonical score formula.

Therefore:

```text
distanceFactor must be derived from raw distanceMeters
```

unless optional continuous-visibility mode is explicitly enabled.

This prevents weather suppression from being double-counted.

---

# 16. Tier Baselines

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

# 17. Weather Factors

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

# 18. Time-of-Day Factors

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

# 19. Provenance Factors

```ts
const PROVENANCE_READABILITY_FACTOR = {
  AIS_VESSEL: 1.0,
  SYNTHETIC_ECOLOGY: 0.72,
};
```

AIS vessels retain higher readability than synthetic vessels under equivalent conditions.

This supports:

- AIS supremacy
- background restraint
- reduced synthetic clutter

Synthetic vessels are not automatically hidden.

---

# 20. Taxonomy Resistance Factor

`taxonomyAtmosphericResistance` maps directly to `taxonomyResistanceFactor`.

```ts
function resolveTaxonomyResistanceFactor(value: number): number {
  return clamp(value, 0.0, 1.0);
}
```

Interpretation:

```text
0.0 = highly atmosphere-sensitive
1.0 = highly atmosphere-resistant
```

Heavy vessels, ferries, and utility traffic may retain silhouette or light readability longer than small recreational vessels.

This does not alter vessel identity.

---

# 21. Clutter Factor

`clutterFactor` is derived from `clutterPressure`.

```ts
function resolveClutterFactor(clutterPressure: number): number {
  return clamp(1.0 - clamp(clutterPressure, 0.0, 1.0) * 0.65, 0.35, 1.0);
}
```

Interpretation:

```text
clutterPressure 0.0 → clutterFactor 1.0
clutterPressure 1.0 → clutterFactor 0.35
```

Clutter reduces readability.

Clutter may not remove runtime existence.

---

# 22. Distance Attenuation

Canonical distance factor uses raw distance only.

```ts
function resolveDistanceFactor(distanceMeters: number): number {
  if (distanceMeters <= 500) return 1.0;
  if (distanceMeters <= 1500) return 0.8;
  if (distanceMeters <= 4000) return 0.55;
  if (distanceMeters <= 8000) return 0.32;
  return 0.16;
}
```

This function must not apply `weatherFactor`.

Weather suppression is handled separately by `weatherFactor` in the canonical score formula.

---

# 23. Optional Continuous-Visibility Mode

`visibilityMeters` may enable a future continuous-visibility extension.

This mode is optional and must be explicitly enabled by implementation config.

When enabled, it may derive a visibility distance modifier from:

```ts
context.visibilityMeters
```

However:

- it must not also apply discrete `weatherFactor` as a second suppression path unless explicitly normalized
- it must not become a hard culling threshold
- it must not imply runtime absence
- it must remain deterministic

Default implementation MUST NOT use continuous-visibility mode unless `visibilityMeters` is non-null and the module is configured to use it.

---

# 24. Minimum Visible Distance Protection

```ts
const MINIMUM_VISIBLE_DISTANCE_M = 200;
```

Vessels within `MINIMUM_VISIBLE_DISTANCE_M` must not return:

```text
ATMOSPHERIC_HIDDEN
```

regardless of weather or time of day.

Minimum fallback:

```text
MARKER_ONLY
```

or:

```text
LIGHT_ONLY
```

for night.

This prevents nearby vessels from disappearing while still being perceptually relevant.

---

# 25. Visibility Class Thresholds

```ts
function resolveVisibilityClass(
  score: number,
  context: MaritimeAtmosphericContext,
  distanceMeters: number
) {
  if (distanceMeters <= MINIMUM_VISIBLE_DISTANCE_M && score < 0.18) {
    return context.timeOfDay === "NIGHT" ? "LIGHT_ONLY" : "MARKER_ONLY";
  }

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

# 26. Atmospheric Hint Derivation

## 26.1 Blur Hint

```ts
const WEATHER_BLUR_HINT = {
  CLEAR: 0.0,
  CLOUDY: 0.12,
  HAZE: 0.32,
  FOG: 0.72,
  RAIN: 0.46,
  STORM: 0.68,
  SNOW: 0.58,
};
```

Distance may increase blur.

The `distanceFactor` used here is the raw-distance factor from `resolveDistanceFactor(distanceMeters)`.

It must not use weather-adjusted effective distance.

```ts
blurHint =
  clamp(weatherBlurHint + (1.0 - rawDistanceFactor) * 0.25, 0.0, 1.0);
```

This prevents hidden weather double-counting in blur computation.

## 26.2 Contrast Hint

```ts
const WEATHER_CONTRAST_HINT = {
  CLEAR: 1.0,
  CLOUDY: 0.86,
  HAZE: 0.62,
  FOG: 0.42,
  RAIN: 0.58,
  STORM: 0.38,
  SNOW: 0.52,
};
```

Night modifies contrast:

```ts
if (context.timeOfDay === "NIGHT") {
  contrastHint = clamp(contrastHint * 0.72 + 0.18, 0.0, 1.0);
}
```

These are renderer hints only.

Renderer may interpret them visually.

Atmosphere does not control shader implementation.

---

# 27. Alpha Multiplier

```ts
atmosphericAlphaMultiplier =
  clamp(readabilityScore, 0.0, 1.0);
```

Renderer may apply additional presentation logic.

Atmosphere may not directly set renderer opacity buffers.

---

# 28. Wake Readability

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

## 28.1 Wake Age Readability

```ts
wakeAgeFactor =
  clamp(1.0 - clamp(ageRatio, 0.0, 1.0) * 0.6, 0.4, 1.0);
```

Wake readability baseline:

```text
wakeReadabilityScore =
intensityRaw
× weatherFactor
× timeOfDayFactor
× clutterFactor
× provenanceFactor
× wakeAgeFactor
```

Old wakes near expiration should be visually deemphasized even under clear weather.

This prevents frozen-wake artifacts.

---

# 29. Label Readability

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

## 29.1 Label Readability Formula

```ts
labelReadable =
  readabilityScore >= 0.55
  && clutterPressure < 0.72
  && taxonomyLabelPriority >= 0.35;
```

`LABEL_DENSITY_SUPPRESSION` should be emitted when label readability fails due to clutter pressure.

---

# 30. resolveLabelReadability Projection Guarantee

The shortcut function:

```ts
resolveLabelReadability(input, context)
```

must be equivalent to:

```ts
resolveVesselReadability(input, context).labelReadable
```

It may be implemented as a direct projection.

It must not diverge into a separate authority path.

---

# 31. Fog Doctrine

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

# 32. Night Doctrine

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

# 33. Output Functions

## 33.1 resolveVesselReadability

```ts
function resolveVesselReadability(
  input: VesselReadabilityInput,
  context: MaritimeAtmosphericContext
): AtmosphericReadabilityResult;
```

## 33.2 resolveWakeReadability

```ts
function resolveWakeReadability(
  input: WakeReadabilityInput,
  context: MaritimeAtmosphericContext
): AtmosphericReadabilityResult;
```

## 33.3 resolveLabelReadability

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

# 34. Determinism Requirements

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

# 35. Renderer Interface

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

# 36. Debug / Telemetry

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

# 37. Validation Checklist

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
- [ ] readabilityScore is non-authoritative
- [ ] clutterFactor derivation defined
- [ ] taxonomyResistanceFactor derivation defined
- [ ] blur hint derivation defined
- [ ] contrast hint derivation defined
- [ ] wake age readability defined
- [ ] minimum visible distance protection defined
- [ ] label projection guarantee defined
- [ ] weather suppression is not double-counted
- [ ] dependency versions reference actual canonical artifacts

---

# 38. Build Readiness

Current state:

```text
Stage: [BUILD]
Freeze Decision: GO
```

Build scope:

```text
pure-readability-interpretation-only
```

Do NOT build:

- renderer draw logic
- camera targeting
- runtime mutation hooks
- AIS mutation hooks
- population mutation hooks
- wake mutation hooks
- ecology mutation hooks

---

# 39. Suggested Runtime Files

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

# 40. Canonical Artifact Rule

This is a full standalone canonical artifact.

Patch versions must not omit prior canonical structural content unless removal is explicit and justified.

This version is self-contained and reconstructable without prior versions.

---

# 41. Implementation Guide

- **Where this goes:** `docs/_specs/wos/0523E_WOS_MaritimeAtmosphericReadability_v1.2.0.md`
- **What to run:** implement as a pure deterministic interpretation module consumed by MarineRenderer.
- **What to expect:** vessels, wakes, labels, and harbor motion become atmospherically readable without atmosphere gaining runtime authority.
