---
layout: spec

title: "WOS Visibility Class Runtime"
date: 2026-05-26
doc_id: "0525E_WOS_VisibilityClassRuntime_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "interpretation"
component: "VisibilityClassRuntime"

type: "runtime-interpretation-spec"
status: "review"

priority: "high"
risk: "high"

classification: "interpretation-layer"

summary: "Defines the runtime visibility-class resolver that converts AtmosphericReadability, density pressure, zoom context, surface preset context, and environmental presentation state into bounded visibilityClass tokens consumed by MapStyleAuthority and renderers."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Visibility classes constrain presentation"
  - "Visibility classes do not create runtime truth"
  - "Hidden vessels may not be visually elevated by style systems"
  - "Presentation systems may tighten visibility; they may not fabricate observability"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525C_WOS_LiveStylePanel_v1.0.1"
  - "0525D_WOS_SurfaceStylePresets_v1.0.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"

enables:
  - "0525F_WOS_HarborReadabilityPresets_v1.0.0"
  - "0525G_WOS_PresentationPresetSerialization_v1.0.0"
  - "0525H_WOS_SurfaceStyleTransitions_v1.0.0"

tags:
  - "visibility"
  - "visibility-class"
  - "atmosphere"
  - "presentation"
  - "maritime"
  - "density"
  - "zoom"
  - "surface"
  - "runtime"

supersedes: []

owner: "StudioRich / WOS"

stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "bounded-visibility-class-resolution-runtime"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Define the visibility-class resolver between atmospheric readability, density context, surface preset atmosphere, and presentation manifest consumption.

---

# 0525E_WOS_VisibilityClassRuntime_v1.0.0

## Canonical Artifact Rule

This is a full standalone canonical REVIEW artifact.

This document defines the bounded runtime responsible for resolving presentation visibility classes.

It is downstream of:

```text
0523E AtmosphericReadability
0523F ContinuityDensity
0525A MapStyleAuthority
0525B MaritimeStyleRegistry
0525D SurfaceStylePresets
```

It does not replace AtmosphericReadability.

It does not replace MapStyleAuthority.

It produces a constrained token:

```text
visibilityClass
```

for presentation consumption.

---

# 🎯 PURPOSE

Define a runtime resolver for visibilityClass tokens used by presentation systems.

This runtime exists because the manifest currently exposes:

```js
visibilityClass: null
```

That empty slot should become a governed presentation constraint rather than an ad-hoc renderer decision.

VisibilityClassRuntime translates observed environmental/presentation conditions into one of the approved visibility classes:

```text
FULL
REDUCED
SILHOUETTE
MARKER_ONLY
LIGHT_ONLY
ATMOSPHERIC_HIDDEN
```

The goal is:

```text
consistent atmospheric visibility behavior
```

without allowing style systems to create or mutate runtime truth.

---

# 🧠 CORE DOCTRINE

```text
Visibility classes constrain presentation.

They do NOT create simulation truth.
```

VisibilityClassRuntime may determine how much of an already-existing vessel is allowed to be presented.

It may NOT determine:

- whether the vessel exists
- where the vessel is
- whether the AIS signal is true
- whether continuity persists
- whether the camera should follow it
- whether it matters narratively
- whether a hover card should contain semantic fields

---

# 🧭 ARCHITECTURAL PLACEMENT

Canonical flow:

```text
AISRuntime
→ MaritimeContinuityEngine
→ AtmosphericReadability
→ ContinuityDensity
→ SurfaceStylePresetRuntime
→ VisibilityClassRuntime
→ MapStyleAuthority.generateManifest()
→ PresentationManifest
→ MarineRenderer
```

VisibilityClassRuntime is an interpretation-layer constraint system.

It sits after runtime truth and before manifest consumption.

---

# 🏛️ AUTHORITY BOUNDARIES

## VisibilityClassRuntime Owns

- visibilityClass resolution policy
- presentation-level visibility constraints
- zoom/density/atmosphere interpretation
- preset-context visibility tightening
- per-vessel presentation class recommendation
- manifest-level visibility class token
- debug visibility matrix

---

## VisibilityClassRuntime May Observe

- AtmosphericReadability outputs
- ContinuityDensity clutter pressure
- MaritimePopulationHierarchy tier
- vessel distance from camera
- Mapbox zoom level
- active Surface preset ID/category
- base MapStyleManifest atmospheric values
- active presentation preset metadata

Observation does not grant runtime mutation authority.

---

## VisibilityClassRuntime May Not Mutate

- AISRuntime
- vessel coordinates
- vessel heading truth
- vessel speed truth
- wake buffers
- population tier
- clutter pressure source values
- AtmosphericReadability source records
- SurfaceStylePresetRuntime active preset
- MapStyleAuthority registries
- MarineRenderer internals
- OverlayGrammar semantic content
- camera routing

---

# 🧬 CANONICAL VISIBILITY CLASSES

## FULL

Meaning:

```text
Full presentation detail allowed.
```

Allowed:

- detailed vessel silhouette
- class colors
- wake visual presentation
- far-light behavior if applicable
- hover affordance
- overlay affordance if OverlayGrammar allows it

---

## REDUCED

Meaning:

```text
Vessel remains readable but visually softened.
```

Allowed:

- simplified silhouette
- reduced accent
- reduced marker radius
- softened wake
- lower stroke contrast
- subdued hover presence

---

## SILHOUETTE

Meaning:

```text
Class or vessel presence is readable as shape only.
```

Allowed:

- outline or silhouette
- minimal fill contrast
- subdued halo
- no fine detail

---

## MARKER_ONLY

Meaning:

```text
Presence is allowed but detailed vessel identity is suppressed.
```

Allowed:

- point marker
- class-safe tint
- minimal hover affordance only if separately allowed

Forbidden:

- detailed hull
- detailed wake
- expanded labels

---

## LIGHT_ONLY

Meaning:

```text
Only distant atmospheric harbor light is allowed.
```

Allowed:

- far-light point
- halo
- subtle twinkle

Forbidden:

- hull
- marker
- wake emphasis
- label expansion

---

## ATMOSPHERIC_HIDDEN

Meaning:

```text
Presentation is fully suppressed.
```

Allowed:

- no direct vessel rendering
- environmental absence only

Forbidden:

- hull
- label
- marker
- far-light
- wake
- hover card
- tactical ring

---

# 🔽 DOWNWARD-ONLY VISIBILITY RULE

Visibility may only tighten.

Once an upstream authority has constrained a vessel, downstream systems may not elevate it.

Canonical order of restrictiveness:

```text
FULL
→ REDUCED
→ SILHOUETTE
→ MARKER_ONLY
→ LIGHT_ONLY
→ ATMOSPHERIC_HIDDEN
```

A resolver may move rightward.

It may not move leftward.

Example:

```text
AtmosphericReadability says MARKER_ONLY.
Surface preset may tighten to LIGHT_ONLY.
Renderer may not restore SILHOUETTE or FULL.
```

---

# 🌫️ INPUT FACTORS

VisibilityClassRuntime may consider:

## AtmosphericReadability

Inputs:

- fog pressure
- haze pressure
- low-light pressure
- visibility envelope
- environmental readability

Authority note:

AtmosphericReadability remains the upstream source of atmospheric visibility truth.

---

## ContinuityDensity

Inputs:

- clutter pressure
- vessel density
- local harbor density
- visual load estimate

Authority note:

Density may suppress visual load.

It may not create narrative priority.

---

## PopulationHierarchy

Inputs:

- HERO
- MID
- BACKGROUND
- GHOST

Authority note:

Tier may affect presentation availability.

It may not decide runtime existence.

---

## Camera / Zoom Context

Inputs:

- zoom level
- camera distance
- screen-space vessel size
- viewport pressure

Authority note:

Zoom may affect presentation detail.

It may not affect runtime truth.

---

## Surface Preset Context

Inputs:

- active preset category
- preset density bias
- preset readability bias
- preset atmosphere strength

Authority note:

Surface presets may tighten visibility atmosphere.

They may not reveal hidden vessels.

---

# 📦 DATA MODEL

```ts
type VisibilityClass =
  | "FULL"
  | "REDUCED"
  | "SILHOUETTE"
  | "MARKER_ONLY"
  | "LIGHT_ONLY"
  | "ATMOSPHERIC_HIDDEN";

type PopulationTier =
  | "HERO"
  | "MID"
  | "BACKGROUND"
  | "GHOST";

type VisibilityResolutionInput = {
  readonly entityId: string;
  readonly entityType: "VESSEL" | "INFRASTRUCTURE" | "UNKNOWN";

  readonly upstreamVisibilityClass: VisibilityClass | null;

  readonly populationTier: PopulationTier | null;

  readonly clutterPressure: number;

  readonly zoom: number | null;

  readonly distanceKm: number | null;

  readonly activePresetId: string | null;

  readonly activePresetCategory: string | null;

  readonly atmosphereStrength: number;

  readonly readabilityBias: number;

  readonly densityBias: number;
};

type VisibilityResolutionResult = {
  readonly entityId: string;
  readonly visibilityClass: VisibilityClass;
  readonly sourceAuthority: "ATMOSPHERIC_READABILITY" | "DENSITY" | "ZOOM" | "PRESET" | "FALLBACK";
  readonly tightenedFrom: VisibilityClass | null;
  readonly factors: {
    readonly clutterPressure: number;
    readonly zoom: number | null;
    readonly distanceKm: number | null;
    readonly atmosphereStrength: number;
    readonly readabilityBias: number;
    readonly densityBias: number;
  };
};

type VisibilityClassRuntimeSnapshot = {
  readonly version: "1.0.0";
  readonly activePresetId: string | null;
  readonly resolvedCount: number;
  readonly classCounts: Record<VisibilityClass, number>;
  readonly lastResolvedAtMs: number;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const VISIBILITY_CLASS_RUNTIME_VERSION = "1.0.0";

const VISIBILITY_ORDER = [
  "FULL",
  "REDUCED",
  "SILHOUETTE",
  "MARKER_ONLY",
  "LIGHT_ONLY",
  "ATMOSPHERIC_HIDDEN",
];

const DEFAULT_VISIBILITY_CLASS = "FULL";

const HIGH_DENSITY_THRESHOLD = 0.75;

const MEDIUM_DENSITY_THRESHOLD = 0.45;

const FAR_DISTANCE_KM = 8.0;

const MID_DISTANCE_KM = 3.0;

const LOW_ZOOM_THRESHOLD = 10.5;

const MID_ZOOM_THRESHOLD = 12.0;
```

---

# 🔧 CORE FUNCTIONS

## resolveVisibilityClass(input)

```ts
function resolveVisibilityClass(
  input: VisibilityResolutionInput
): VisibilityResolutionResult
```

Resolves a single entity visibility class.

Rules:

1. start with upstream visibility class or FULL
2. apply density tightening
3. apply distance/zoom tightening
4. apply preset tightening
5. enforce downward-only rule
6. return visibility result with source authority

---

## tightenVisibility(base, candidate)

```ts
function tightenVisibility(
  base: VisibilityClass,
  candidate: VisibilityClass
): VisibilityClass
```

Returns the more restrictive of two visibility classes.

---

## resolveBatch(inputs)

```ts
function resolveBatch(
  inputs: readonly VisibilityResolutionInput[]
): readonly VisibilityResolutionResult[]
```

Resolves visibility for multiple entities.

---

## getSnapshot()

```ts
function getSnapshot(): VisibilityClassRuntimeSnapshot
```

Returns diagnostic snapshot.

---

# 🧮 REFERENCE RESOLUTION LOGIC

```ts
function visibilityRank(value: VisibilityClass): number {
  return VISIBILITY_ORDER.indexOf(value);
}

function tightenVisibility(
  base: VisibilityClass,
  candidate: VisibilityClass
): VisibilityClass {
  return visibilityRank(candidate) > visibilityRank(base)
    ? candidate
    : base;
}

function resolveVisibilityClass(
  input: VisibilityResolutionInput
): VisibilityResolutionResult {
  let resolved = input.upstreamVisibilityClass || DEFAULT_VISIBILITY_CLASS;
  let sourceAuthority: VisibilityResolutionResult["sourceAuthority"] =
    input.upstreamVisibilityClass
      ? "ATMOSPHERIC_READABILITY"
      : "FALLBACK";

  const original = resolved;

  if (input.clutterPressure >= HIGH_DENSITY_THRESHOLD) {
    resolved = tightenVisibility(resolved, "MARKER_ONLY");
    sourceAuthority = "DENSITY";
  } else if (input.clutterPressure >= MEDIUM_DENSITY_THRESHOLD) {
    resolved = tightenVisibility(resolved, "REDUCED");
    sourceAuthority = "DENSITY";
  }

  if (
    input.distanceKm !== null &&
    input.distanceKm >= FAR_DISTANCE_KM
  ) {
    resolved = tightenVisibility(resolved, "LIGHT_ONLY");
    sourceAuthority = "ZOOM";
  } else if (
    input.zoom !== null &&
    input.zoom <= LOW_ZOOM_THRESHOLD
  ) {
    resolved = tightenVisibility(resolved, "MARKER_ONLY");
    sourceAuthority = "ZOOM";
  }

  if (input.activePresetCategory === "SIGNAL_DRIFT") {
    resolved = tightenVisibility(resolved, "SILHOUETTE");
    sourceAuthority = "PRESET";
  }

  if (input.activePresetCategory === "BROADCAST_FAILURE") {
    resolved = tightenVisibility(resolved, "LIGHT_ONLY");
    sourceAuthority = "PRESET";
  }

  if (input.populationTier === "GHOST") {
    resolved = tightenVisibility(resolved, "LIGHT_ONLY");
  }

  return {
    entityId: input.entityId,
    visibilityClass: resolved,
    sourceAuthority,
    tightenedFrom: original === resolved ? null : original,
    factors: {
      clutterPressure: input.clutterPressure,
      zoom: input.zoom,
      distanceKm: input.distanceKm,
      atmosphereStrength: input.atmosphereStrength,
      readabilityBias: input.readabilityBias,
      densityBias: input.densityBias,
    },
  };
}
```

---

# 🧪 VALIDATION RULES

- resolver may only tighten
- resolver may never elevate
- invalid visibility classes are rejected
- unknown entity inputs resolve to safe fallback
- null upstream visibility defaults to FULL only if no upstream authority is present
- preset category may tighten but never reveal
- density may suppress but never rank narrative importance
- zoom may reduce detail but never alter runtime position

---

# 🛰️ DEBUG API

Debug namespace:

```ts
_wos.visibilityClass
```

Required APIs:

```ts
_wos.visibilityClass.resolve(input)
_wos.visibilityClass.batch(inputs)
_wos.visibilityClass.snapshot()
_wos.visibilityClass.matrix()
_wos.visibilityClass.testPreset("SIGNAL_DRIFT")
_wos.visibilityClass.testDistance(10)
_wos.visibilityClass.testDensity(0.8)
_wos.visibilityClass.constants()
```

---

# 📊 REQUIRED DIAGNOSTICS

Console prefix:

```text
[VisibilityClassRuntime]
```

Diagnostics must report:

- class counts
- tightened counts
- source authority counts
- invalid input failures
- active preset influence
- density influence
- zoom influence

---

# 🧭 INTEGRATION WITH MAP STYLE AUTHORITY

MapStyleAuthority must consume the resolved class:

```ts
SBE.MapStyleAuthority.generateManifest(
  simulationTimeMs,
  visibilityClass,
  createdAtMs
)
```

VisibilityClassRuntime does not mutate MapStyleAuthority.

It supplies the token.

---

# 🧭 INTEGRATION WITH SURFACE STYLE PRESETS

SurfaceStylePresetRuntime may read active preset category and metadata as context.

Presets may tighten visual atmosphere.

Presets may not reveal hidden vessels.

Canonical rule:

```text
Presets may push visibility rightward.
They may not pull visibility leftward.
```

---

# 🧭 INTEGRATION WITH MARITIME STYLE REGISTRY

MaritimeStyleRegistry consumes visibilityClass through:

```ts
applyVisibilityClassToStyle(style, visibilityClass)
```

VisibilityClassRuntime supplies the class.

MaritimeStyleRegistry applies visual constraints.

---

# 🚫 NON-GOALS

This spec is NOT responsible for:

- AIS truth
- vessel lifecycle
- vessel class taxonomy
- wake memory
- camera target selection
- overlay semantic hierarchy
- live style editing
- preset serialization
- weather simulation
- scheduler logic
- route topology
- world entity spawning

---

# ⏸️ DEFERRED SYSTEMS

Deferred:

- weather-driven visibility policy
- per-district visibility fields
- semantic urgency overlays
- user-facing visibility debugging panel
- cinematic visibility transitions
- audio-reactive visibility modulation
- historical visibility replay
- ML-based visibility scoring

---

# 📚 CANONICAL REFERENCES

- 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- 0523B_WOS_MaritimePopulationHierarchy_v1.1.0
- 0525A_WOS_MapStyleAuthority_v1.0.2
- 0525B_WOS_MaritimeStyleRegistry_v1.0.1
- 0525D_WOS_SurfaceStylePresets_v1.0.1
- WOS Naming Doctrine
- WOS Constitutional Spec Template v2.0.1

---

# 💬 IMPLEMENTATION NOTES

Recommended files:

```text
wall/systems/presentation/visibilityClassRuntime.js
wall/systems/presentation/visibilityClassRuntimeDebug.js
```

Recommended namespace:

```ts
SBE.VisibilityClassRuntime
```

Recommended debug namespace:

```ts
_wos.visibilityClass
```

Recommended load order:

```text
maritimeStyleRegistry.js
mapStyleAuthority.js
surfaceStylePresetRuntime.js
visibilityClassRuntime.js
liveStylePanel.js
maritimeOccupancyRenderer.js
```

---

# 🧪 BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [ ] visibility class order is confirmed
- [ ] downward-only rule is validated
- [ ] preset influence only tightens
- [ ] density influence only suppresses visual load
- [ ] zoom influence only reduces visual detail
- [ ] MapStyleAuthority consumes resolved token
- [ ] MaritimeStyleRegistry applies resolved token
- [ ] debug matrix is implemented
- [ ] invalid inputs fail safely
- [ ] no runtime mutation path exists

---

# 📊 FINAL STATUS

```text
0525E_WOS_VisibilityClassRuntime_v1.0.0
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
bounded-visibility-class-resolution-runtime
```

Build Scope:

```text
presentation visibility constraint resolution, density/zoom/preset tightening, visibilityClass token generation, debug matrix tooling
```

Final instruction:

```text
Submit for architecture and governance review before implementation.
```
