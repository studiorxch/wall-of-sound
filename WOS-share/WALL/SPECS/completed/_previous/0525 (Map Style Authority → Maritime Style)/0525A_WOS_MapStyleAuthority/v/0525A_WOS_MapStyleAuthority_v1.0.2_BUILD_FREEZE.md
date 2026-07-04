---
layout: spec

title: "WOS Map Style Authority"
date: 2026-05-26
doc_id: "0525A_WOS_MapStyleAuthority_v1.0.2"
version: "1.0.2"

project: "Wall of Sound"
system: "WOS"

domain: "interpretation"
component: "MapStyleAuthority"

type: "runtime-interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the bounded presentation governance authority responsible for registry-driven world styling, atmospheric interpretation, single-writer live override governance, and immutable presentation manifest generation."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Presentation systems interpret the world"
  - "Atmosphere over utility"
  - "Runtime truth isolation"
  - "One active override authority at a time"
  - "Live tooling may tune appearance; it may not mutate reality"

depends_on:
  - "0522Q_WOS_MaritimeContinuityDoctrine_v1.0.0"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523R_WOS_InfrastructureRegistry_v1.2.3"

enables:
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525C_WOS_LiveStylePanel_v1.0.1"
  - "0525D_WOS_SurfaceStylePresets_v1.0.0"
  - "0525G_WOS_PresentationPresetSerialization_v1.0.0"

tags:
  - "presentation"
  - "style"
  - "atmosphere"
  - "renderer"
  - "maritime"
  - "governance"
  - "manifest"
  - "override-api"
  - "freeze"

supersedes:
  - "0525A_WOS_MapStyleAuthority_v1.0.1"
  - "0525A_WOS_MapStyleAuthority_v1.0.1_BUILD_FULL"

owner: "StudioRich / WOS"

stage: "[FREEZE]"
freeze_decision: "GO"
build_scope: "bounded-presentation-governance-authority-with-frozen-override-api"
---

# 🚦 SPEC STAGE

Stage: [FREEZE]  
Freeze Decision: GO  
Action: Freeze MapStyleAuthority as the canonical presentation governance authority and formally lock the live override API required by 0525C.

---

# 0525A_WOS_MapStyleAuthority_v1.0.2_BUILD_FREEZE

## Canonical Artifact Rule

This is the full standalone canonical BUILD/FREEZE artifact for `0525A_WOS_MapStyleAuthority_v1.0.2`.

This document is reconstructable without prior versions.

It fully integrates:

- `0525A_WOS_MapStyleAuthority_v1.0.1_BUILD_FULL`
- formal `StyleOverride` schema
- frozen public override API contract
- `setSingleLiveOverride()`
- `clearLiveOverride()`
- `getActiveLiveOverride()`
- manifest-pattern governance
- single-writer override authority
- renderer-consumption boundary
- 0525C dependency support

Partial patch-only releases are forbidden for this spec after this version.

---

# 🎯 PURPOSE

Define the authoritative presentation governance system for WOS world rendering.

This specification establishes:

- registry-driven map styling
- atmospheric interpretation governance
- maritime symbolic presentation governance linkage
- immutable presentation manifest generation
- live presentation override infrastructure
- single-writer override API
- projection integrity constraints
- renderer de-hardcoding doctrine
- future Surface visual identity support

This system exists to transition WOS from:

```text
renderer-hardcoded appearance
```

toward:

```text
data-authored atmospheric presentation infrastructure
```

without allowing presentation systems to mutate runtime truth.

Canonical doctrine:

```text
Presentation systems interpret the world.

They do NOT create runtime truth.
```

---

# 🧠 CORE PRINCIPLES

## 1. Presentation Is Data

Visual appearance must resolve through data-authored registries rather than hardcoded renderer constants.

All atmospheric tuning should be expressed as:

```text
registry-driven presentation configuration
```

rather than:

```text
renderer-local visual behavior
```

Presentation values may NOT be embedded directly inside renderer execution logic.

The renderer consumes presentation manifests.

It does NOT own atmospheric styling doctrine.

---

## 2. Runtime Truth Isolation

Presentation systems possess zero authority to mutate:

- AIS truth
- runtime continuity
- dead reckoning
- continuity cadence
- world coordinates
- wake persistence
- entity lifecycle state
- telemetry history
- visibility classification
- camera routing
- overlay semantic hierarchy

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

---

## 3. Atmosphere Over Utility

Presentation prioritizes:

- cinematic readability
- atmospheric calmness
- low-light observability
- symbolic continuity
- passive environmental readability
- psychological tone
- environmental coherence

over:

- tactical dashboards
- GIS precision density
- hyperactive telemetry overlays
- gameplay readability
- dense utility cartography

WOS map presentation should feel like inhabited atmospheric infrastructure, not a tactical operations display.

---

## 4. Passive Interpretation

Presentation systems may:

- smooth visually
- suppress visually
- stylize visually
- soften visually
- glow visually
- reduce visual density
- encode atmospheric tone

Presentation systems may NEVER:

- fabricate continuity
- alter runtime state
- override visibility authority
- modify cadence
- alter telemetry truth
- create hidden runtime authority
- rewrite geographic truth

---

## 5. Renderer De-Hardcoding First

Renderer de-hardcoding must precede atmospheric expansion.

All hardcoded renderer styling constants should migrate into style registries before new atmospheric effects are layered on top.

Implementation priority:

```text
renderer de-hardcoding first
atmospheric expansion second
```

---

## 6. One Active Override Authority

MapStyleAuthority owns the single active presentation override slot.

Only one live override may be active at a time.

Multiple concurrent override authorities are forbidden.

Renderer-local overrides are forbidden.

Hidden override stacks are forbidden.

Canonical rule:

```text
One active override authority at a time.
```

---

# 🏛️ AUTHORITY BOUNDARIES

## This Specification Governs

MapStyleAuthority owns presentation styling only.

This specification governs:

- map presentation registries
- global color palettes
- land, water, road, label, atmosphere, and overlay style registries
- atmosphere rendering configuration
- symbolic vessel appearance linkage
- presentation-layer motion easing linkage
- wake visual presentation linkage
- overlay visual tuning
- immutable presentation manifest generation
- live presentation override evaluation
- live override API contract
- projection integrity validation
- Surface style preset compatibility rules

---

## This Specification May Observe

MapStyleAuthority may observe:

- AISRuntime vessel snapshots
- AtmosphericReadability outputs
- MaritimePopulationHierarchy tier outputs
- MaritimeContinuityDensity clutter-pressure outputs
- WakeAuthority renderable wake descriptors
- SurfaceRuntime selected presentation preset
- developer-only live override state
- MaritimeStyleRegistry registry outputs

Observation does not grant mutation authority.

---

## This Specification Produces

MapStyleAuthority produces:

```text
MapStyleManifest
```

The manifest is consumed by presentation systems.

The manifest is immutable for a render frame.

The manifest is not runtime truth.

---

## This Specification Owns This Public API

```ts
SBE.MapStyleAuthority.generateManifest(
  simulationTimeMs: number,
  visibilityClass: VisibilityClass | null,
  createdAtMs?: number
): MapStyleManifest

SBE.MapStyleAuthority.setSingleLiveOverride(
  override: StyleOverride
): void

SBE.MapStyleAuthority.clearLiveOverride(): void

SBE.MapStyleAuthority.getActiveLiveOverride(): StyleOverride | null

SBE.MapStyleAuthority.getMapStyleRegistry(): MapStyleRegistry

SBE.MapStyleAuthority.getMaritimeStyleRegistry(): MaritimeStyleRegistry

SBE.MapStyleAuthority.getVesselStyle(
  vesselClass: string | null | undefined
): VesselStyle

SBE.MapStyleAuthority.resetToBaseRegistry(): void
```

This API is frozen for 0525C LiveStylePanel integration.

---

## This Specification Does NOT Govern

This specification does NOT govern:

- AISRuntime truth
- continuity timing
- dead reckoning
- fixed timestep accumulation
- wake memory
- scheduler orchestration
- camera choreography
- soundtrack pacing
- transition sequencing
- gameplay systems
- overlay semantic composition
- world routing
- atmospheric scoring
- telemetry ordering
- entity spawning
- vessel lifecycle state
- geographic data authority
- production preset serialization

---

# 🌊 CONTINUITY ROLE

MapStyleAuthority participates in continuity as:

```text
passive atmospheric interpreter
```

It influences:

- readability softness
- symbolic density
- observability calmness
- harbor glow behavior
- visual clutter suppression
- atmospheric depth treatment
- low-light presentation coherence
- far-vessel background presence

It does NOT participate in:

- continuity propagation
- runtime cadence
- lifecycle persistence
- telemetry resolution
- motion authority
- wake persistence
- population balancing
- route steering

Continuity remains owned by runtime systems.

Presentation expresses continuity visually.

---

# 🧭 INTERPRETATION SEPARATION

## Runtime Truth

Runtime truth is owned by:

- AISRuntime
- MaritimeContinuityEngine
- AtmosphericReadability
- WakeAuthority
- PopulationHierarchy
- ContinuityDensity

These systems determine:

- existence
- continuity
- motion truth
- visibility classification
- persistence state
- wake state
- clutter pressure
- population tiering

---

## Interpretation Layer

Interpretation is owned by:

- MapStyleAuthority
- MaritimeStyleRegistry
- MarineRenderer
- overlay visual systems
- Surface presentation consumers

These systems interpret runtime outputs visually.

Interpretation systems are:

```text
structurally passive
```

They may NEVER:

- rewrite continuity
- fabricate state
- mutate runtime truth
- elevate visibility authority
- alter runtime cadence
- alter wake authority
- alter vessel existence

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- AISRuntime
- MaritimeContinuityEngine
- AtmosphericReadability
- MaritimePopulationHierarchy
- MaritimeContinuityDensity
- WakeAuthority
- SurfaceRuntime
- LiveStylePanel
- MaritimeStyleRegistry

---

## Produces

- MapStyleManifest

---

## Consumed By

- MarineRenderer
- Overlay visual renderer
- Surface presentation adapters
- developer presentation diagnostics
- LiveStylePanel diagnostics

---

## Observed By

- MarineRenderer
- OverlayGrammar
- ObservabilityCamera
- SurfaceRuntime
- LiveStylePanel
- presentation diagnostics

---

## Forbidden Mutations

MapStyleAuthority may never mutate:

- runtime coordinates
- visibilityClass authority
- wake buffers
- dead reckoning
- timestep accumulation
- cadence timing
- AIS continuity
- scheduler routing
- camera target selection
- telemetry data order
- overlay semantic hierarchy
- population tier assignments
- Surface orchestration state
- Channel runtime state

---

# 🌫️ ATMOSPHERIC AUTHORITY SEPARATION

AtmosphericReadability owns:

```text
visibilityClass authority
```

Examples:

- FULL
- REDUCED
- SILHOUETTE
- MARKER_ONLY
- LIGHT_ONLY
- ATMOSPHERIC_HIDDEN

MapStyleAuthority owns:

```text
visual interpretation within the assigned visibility class
```

MapStyleAuthority may NEVER:

```text
elevate a vessel to a higher visibilityClass than assigned by AtmosphericReadability
```

If AtmosphericReadability assigns:

```text
ATMOSPHERIC_HIDDEN
```

MapStyleAuthority may only render within that envelope.

It may not make the vessel visually FULL.

It may not bypass suppression.

It may not restore tactical readability.

---

# 🛰️ OVERLAY GRAMMAR SEPARATION

OverlayGrammar owns:

- semantic composition
- telemetry ordering
- symbolic hierarchy
- overlay meaning
- readability structure
- information grouping
- overlay grammar rules

MapStyleAuthority owns:

- opacity
- glow
- bloom
- softness
- atmospheric suppression visuals
- overlay color treatment
- telemetry visual softness
- typography glow strength

Canonical boundary:

```text
OverlayGrammar owns meaning.
MapStyleAuthority owns visual tuning.
```

---

# 🎥 CAMERA GOVERNANCE SEPARATION

ObservabilityCamera may observe:

- presentation state
- manifest outputs
- layout synchronization state
- atmospheric display context

ObservabilityCamera may NOT use style registries for:

- hero selection
- pacing authority
- route steering
- focus arbitration
- orchestration sequencing
- cinematic target scoring
- surface program transitions

Canonical boundary:

```text
Camera systems may observe presentation context.

They may not derive routing authority from style configuration.
```

---

# 🌊 WAKE AUTHORITY SEPARATION

WakeAuthority owns:

- wake memory
- wake persistence
- wake decay
- wake continuity
- wake segment lifecycle
- wake registry buffers

WakePresentationStyle owns ONLY:

- screen-space softness
- visual alpha treatment
- edge glow
- symbolic wake appearance
- wake visual blending

WakePresentationStyle may NEVER:

- alter wake buffers
- alter persistence duration
- alter wake continuity
- alter decay authority
- alter segment count authority
- rewrite wake registry state

---

# 🎥 PROJECTION INTEGRITY DOCTRINE

Projection-invalid rendering is forbidden.

Presentation systems may NOT:

- fabricate false depth relationships
- contradict runtime spatial truth
- create fake projection authority
- distort geographic continuity
- imply invalid vessel position
- imply invalid heading truth
- use tilt to contradict 2D truth

Presentation systems must preserve:

```text
symbolic spatial integrity
```

even during atmospheric rendering.

---

# 🧪 LIVE OVERRIDE GOVERNANCE

## Override Authority

MapStyleAuthority owns the only live override slot.

The only approved write path is:

```text
LiveStylePanel
→ StyleOverride
→ MapStyleAuthority.setSingleLiveOverride()
→ MapStyleManifest
→ MarineRenderer
```

Forbidden paths:

```text
LiveStylePanel
→ direct renderer mutation
```

```text
LiveStylePanel
→ runtime state mutation
```

```text
Renderer
→ local style mutation outside manifest
```

---

## Override Persistence

Live overrides are ephemeral.

They are not production preset truth.

They may become preset candidates only through a future approved serialization authority.

Persistence belongs to:

```text
0525G_WOS_PresentationPresetSerialization_v1.0.0
```

---

## Override Replacement

Calling `setSingleLiveOverride()` replaces the current active override.

Consumers must treat replacement as explicit.

Silent stacking is forbidden.

Concurrent active overrides are forbidden.

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

type InterpolationCurve =
  | "LINEAR"
  | "EASE_IN_OUT"
  | "EASE_OUT"
  | "SMOOTH_STEP"
  | "CUBIC_GLIDE";

type OverrideProvenance =
  | "DEBUG_TOOL"
  | "SURFACE_RUNTIME"
  | "TEMPORARY";

type MapStyleLayerKey =
  | "water"
  | "land"
  | "roads"
  | "labels"
  | "atmosphere"
  | "overlays";

type MaritimeVesselStyleKey =
  | "cargo"
  | "tanker"
  | "ferry"
  | "service"
  | "recreational"
  | "fishing"
  | "passenger"
  | "tug"
  | "military"
  | "industrial"
  | "unknown"
  | "default";

type StyleOverride = {
  readonly overrideId: string;
  readonly targetDomain: "MAP";
  readonly targetLayer: MapStyleLayerKey;
  readonly values: Record<string, unknown>;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly expiresAtMs: number | null;
  readonly provenance: OverrideProvenance;
};

type WaterStyle = {
  readonly baseColor: string;
  readonly shimmerStrength: number;
  readonly reflectionOpacity: number;
  readonly currentBandAlpha: number;
  readonly coastlineContrast: number;
  readonly harborDarkness: number;
};

type LandStyle = {
  readonly landColorHex: string;
  readonly districtContrast: number;
  readonly coastlineVisibility: number;
  readonly infrastructureShadowStrength: number;
  readonly nighttimeDarkness: number;
};

type RoadStyle = {
  readonly arterialOpacity: number;
  readonly localRoadOpacity: number;
  readonly glowStrength: number;
  readonly labelSuppression: number;
  readonly nighttimeFade: number;
};

type LabelStyle = {
  readonly density: number;
  readonly opacity: number;
  readonly districtPriority: number;
  readonly infrastructurePriority: number;
  readonly suppressionStrength: number;
};

type AtmosphereStyle = {
  readonly fogAlpha: number;
  readonly hazeStrength: number;
  readonly grainOpacity: number;
  readonly glowRadius: number;
  readonly bloomSoftness: number;
  readonly visibilityFalloffKm: number;
};

type OverlayStyle = {
  readonly hudOpacity: number;
  readonly scannerStrength: number;
  readonly typographyGlow: number;
  readonly telemetrySoftness: number;
  readonly noiseSuppression: number;
};

type MapStyleRegistry = {
  readonly water: WaterStyle;
  readonly land: LandStyle;
  readonly roads: RoadStyle;
  readonly labels: LabelStyle;
  readonly atmosphere: AtmosphereStyle;
  readonly overlays: OverlayStyle;
};

type SymbolicVesselStyle = {
  readonly hullColorHex: string;
  readonly deckColorHex: string;
  readonly accentColorHex: string;
  readonly strokeWidthPx: number;
  readonly compactScaleMultiplier: number;
  readonly detailedScaleMultiplier: number;
  readonly silhouetteWeight?: number;
  readonly markerRadiusPx?: number;
};

type VesselLightingStyle = {
  readonly farLightAlpha: number;
  readonly farLightHaloPx: number;
  readonly twinkleStrength: number;
  readonly twinkleRateHz?: number;
  readonly lowVisibilityDamping?: number;
  readonly classTintStrength?: number;
};

type WakePresentationStyle = {
  readonly visualAlphaMultiplier: number;
  readonly edgeSoftnessScalar: number;
  readonly classTintStrength?: number;
  readonly densitySuppressionStrength?: number;
};

type MotionPresentationStyle = {
  readonly headingVisualSmoothing: number;
  readonly interpolationCurve: InterpolationCurve;
  readonly visualEasingMs: number;
};

type VesselStyle = {
  readonly symbolic: SymbolicVesselStyle;
  readonly lighting: VesselLightingStyle;
  readonly wakePresentation: WakePresentationStyle;
  readonly motionPresentation: MotionPresentationStyle;
  readonly hoverCardPresentation?: Record<string, unknown>;
  readonly densityResponse?: Record<string, unknown>;
};

type MaritimeStyleRegistry = Record<string, VesselStyle>;

type MapStyleManifest = {
  readonly manifestId: string;
  readonly version: "1.0.2";
  readonly simulationTimeMs: number;
  readonly createdAtMs: number;
  readonly mapStyle: MapStyleRegistry;
  readonly maritimeStyle: MaritimeStyleRegistry;
  readonly activeOverrides: readonly StyleOverride[];
  readonly visibilityClass: VisibilityClass | null;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const MAP_STYLE_AUTHORITY_VERSION = "1.0.2";

const MAX_SINGLE_OVERRIDE_COUNT = 1;

const DEFAULT_OVERRIDE_PROVENANCE = "DEBUG_TOOL";

const DEFAULT_VISUAL_EASING_MS = 450;

const DEFAULT_FAR_LIGHT_ALPHA = 0.5;

const DEFAULT_FOG_ALPHA = 0.15;

const DEFAULT_HARBOR_DARKNESS = 0.9;

const DEFAULT_TWINKLE_STRENGTH = 0.4;

const DEFAULT_WAKE_ALPHA_MULTIPLIER = 0.5;
```

These values are:

- implementation baselines
- tunable presentation infrastructure

They are NOT eternal doctrine.

---

# 🔧 CORE FUNCTIONS

```ts
function setSingleLiveOverride(
  override: StyleOverride
): void {
  const validation = validateStyleOverride(override);

  if (!validation.pass) {
    throw new Error(
      `[MapStyleAuthority] Invalid StyleOverride: ${validation.reason}`
    );
  }

  activeLiveOverride = freezeStyleOverride(override);
}

function clearLiveOverride(): void {
  activeLiveOverride = null;
}

function getActiveLiveOverride(): StyleOverride | null {
  return activeLiveOverride;
}

function generateManifest(
  simulationTimeMs: number,
  visibilityClass: VisibilityClass | null,
  createdAtMs: number = Date.now()
): MapStyleManifest {
  const resolvedMapStyle = resolveMapStyle(createdAtMs);
  const constrainedMapStyle =
    applyVisibilityEnvelope(resolvedMapStyle, visibilityClass);

  const resolvedMaritimeStyle =
    SBE.MaritimeStyleRegistry
      ? SBE.MaritimeStyleRegistry.getRegistry()
      : fallbackMaritimeRegistry;

  return Object.freeze({
    manifestId: `map-style-manifest::${simulationTimeMs}`,
    version: "1.0.2",
    simulationTimeMs,
    createdAtMs,
    mapStyle: constrainedMapStyle,
    maritimeStyle: resolvedMaritimeStyle,
    activeOverrides: activeLiveOverride
      ? Object.freeze([activeLiveOverride])
      : Object.freeze([]),
    visibilityClass,
  });
}
```

---

# 🔒 STYLE OVERRIDE VALIDATION

```ts
type StyleOverrideValidationResult = {
  readonly pass: boolean;
  readonly reason?: string;
};

function validateStyleOverride(
  override: StyleOverride
): StyleOverrideValidationResult {
  if (!override || typeof override !== "object") {
    return { pass: false, reason: "override must be an object" };
  }

  if (!override.overrideId) {
    return { pass: false, reason: "overrideId is required" };
  }

  if (override.targetDomain !== "MAP") {
    return {
      pass: false,
      reason: "MapStyleAuthority v1.0.2 accepts MAP overrides only",
    };
  }

  if (!isValidMapStyleLayerKey(override.targetLayer)) {
    return {
      pass: false,
      reason: "targetLayer is not a valid map style layer",
    };
  }

  if (!override.values || typeof override.values !== "object") {
    return { pass: false, reason: "values must be an object" };
  }

  if (!isValidOverrideProvenance(override.provenance)) {
    return { pass: false, reason: "invalid override provenance" };
  }

  if (
    override.expiresAtMs !== null &&
    typeof override.expiresAtMs !== "number"
  ) {
    return {
      pass: false,
      reason: "expiresAtMs must be null or number",
    };
  }

  return { pass: true };
}
```

---

# 🔄 EXECUTION FLOW

Canonical flow:

```text
AIS Runtime
→ Continuity Resolution
→ AtmosphericReadability
→ PopulationHierarchy
→ ContinuityDensity
→ MapStyleAuthority
→ Immutable MapStyleManifest
→ MarineRenderer
→ Overlay Projection
→ Final Atmospheric Presentation
```

Live override flow:

```text
LiveStylePanel
→ StyleOverride
→ MapStyleAuthority.setSingleLiveOverride()
→ MapStyleManifest
→ MarineRenderer
```

Authority always flows:

```text
runtime truth
→ interpretation
```

NEVER:

```text
interpretation
→ runtime mutation
```

---

# 🧭 STYLE RESOLUTION ORDER

Styling resolves through a deterministic cascade:

```text
GLOBAL MAP STYLE REGISTRY
→ LAYER STYLE REGISTRIES
→ SURFACE STYLE PRESETS
→ SINGLE ACTIVE LIVE OVERRIDE
→ IMMUTABLE MAP STYLE MANIFEST
```

Rules:

- multiple concurrent override authorities are forbidden
- only one active live override may exist at a time
- overrides are ephemeral unless serialized by SurfaceRuntime or preset tooling
- renderer-local overrides are forbidden
- implicit fallback chains are discouraged
- nested preset inheritance is deferred

---

# 🛰️ OBSERVABILITY IMPACT

MapStyleAuthority influences:

- atmospheric softness
- harbor readability
- far-light calmness
- symbolic vessel density
- glow behavior
- visual suppression
- low-light continuity
- overlay calmness
- presentation consistency

It does NOT directly control:

- camera routing
- overlay semantics
- scheduler timing
- soundtrack pacing
- orchestration sequencing
- entity behavior
- runtime density calculations

---

# 🎼 ORCHESTRATION NOTES

This specification does NOT own orchestration authority.

It participates as:

```text
passive presentation infrastructure
```

SurfaceRuntime may:

- select style presets
- serialize approved presets
- apply approved overrides
- swap presentation identities

But orchestration ownership remains external.

MapStyleAuthority may not schedule transitions.

MapStyleAuthority may not determine programming blocks.

MapStyleAuthority may not sequence Surface or Channel behavior.

---

# 🧪 VALIDATION CHECKLIST

- [x] authority boundaries remain clean
- [x] runtime truth remains deterministic
- [x] interpretation layer remains passive
- [x] AtmosphericReadability retains visibility authority
- [x] no renderer mutation ambiguity exists
- [x] motion semantics remain presentation-only
- [x] WakeAuthority remains isolated
- [x] OverlayGrammar ownership remains bounded
- [x] override governance is deterministic
- [x] projection integrity is enforced
- [x] no orchestration leakage exists
- [x] vocabulary remains canonical
- [x] manifest generation remains immutable
- [x] multiple override authorities are forbidden
- [x] StyleOverride is defined
- [x] setSingleLiveOverride is frozen as public API
- [x] clearLiveOverride is frozen as public API
- [x] getActiveLiveOverride is frozen as public API
- [x] LiveStylePanel write path is supported
- [x] renderer-local overrides are forbidden

---

# ✅ BUILD / FREEZE READINESS CRITERIA

This spec is ready for FREEZE when:

- [x] StyleOverride type is defined
- [x] public override API is defined
- [x] MapStyleManifest includes activeOverrides
- [x] single-writer override governance is defined
- [x] renderer mutation remains forbidden
- [x] runtime truth mutation remains forbidden
- [x] LiveStylePanel integration path is supported
- [x] override persistence is deferred to future preset serialization
- [x] full canonical document is complete

Freeze readiness:

```text
READY
```

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- gameplay systems
- tactical GIS systems
- cinematic scripting
- soundtrack orchestration
- scheduler infrastructure
- camera choreography
- overlay semantic composition
- world simulation
- AIS processing
- dead reckoning
- wake continuity
- lifecycle persistence
- environmental ecology
- transition sequencing
- user controls
- route generation
- generative audio
- character behavior
- maritime physics
- production preset serialization

---

# ⏸️ DEFERRED SYSTEMS

The following systems are intentionally deferred:

- orbital presentation systems
- aircraft style governance
- biome style blending
- preset inheritance trees
- dynamic atmosphere schedulers
- AI presentation adaptation
- automatic cinematic pacing
- multi-surface orchestration
- atmospheric transition routing
- hover card semantic grammar
- advanced broadcast typography system
- full preset serialization
- user-facing style editing

---

# 📚 CANONICAL REFERENCES

- README
- WOS Naming Doctrine
- WOS Surface / Channel Doctrine
- WOS Constitutional Spec Template v2.0.1
- 0522Q_WOS_MaritimeContinuityDoctrine_v1.0.0
- 0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2
- 0523B_WOS_MaritimePopulationHierarchy_v1.1.0
- 0523D_WOS_MaritimeWakeAuthority_v1.2.1
- 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- 0523R_WOS_InfrastructureRegistry_v1.2.3
- 0525B_WOS_MaritimeStyleRegistry_v1.0.1
- 0525C_WOS_LiveStylePanel_v1.0.1

---

# 💬 IMPLEMENTATION NOTES

Implementation target:

```text
wall/systems/presentation/mapStyleAuthority.js
```

Required public methods:

```ts
generateManifest()
setSingleLiveOverride()
clearLiveOverride()
getActiveLiveOverride()
getMapStyleRegistry()
getMaritimeStyleRegistry()
getVesselStyle()
resetToBaseRegistry()
```

Recommended debug companion:

```text
wall/systems/presentation/mapStyleAuthorityDebug.js
```

Recommended renderer integration:

```text
MarineRenderer consumes MapStyleManifest.
MarineRenderer does not receive direct imperative style mutation.
```

---

# 🧱 NEXT SPECIFICATION

Recommended next specification:

```text
0525C_WOS_LiveStylePanel_v1.0.1_BUILD
```

Reason:

0525C now has a frozen upstream override API to depend on.

---

# 📊 FINAL STATUS

```text
0525A_WOS_MapStyleAuthority_v1.0.2
```

Status:

```text
[FREEZE]
```

Freeze Decision:

```text
GO
```

Classification:

```text
bounded-presentation-governance-authority-with-frozen-override-api
```

Build Scope:

```text
pure presentation governance, manifest generation, style registry resolution, live override API
```

Final instruction:

```text
Override governance chain is frozen. Proceed to 0525C v1.0.1 BUILD.
```
