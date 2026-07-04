---
layout: spec

title: "WOS Map Style Authority"
date: 2026-05-25
doc_id: "0525A_WOS_MapStyleAuthority_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "interpretation"
component: "MapStyleAuthority"

type: "runtime-interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the bounded presentation governance authority responsible for registry-driven world styling, atmospheric interpretation, live override governance, and immutable presentation manifest generation."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Presentation systems interpret the world"
  - "Atmosphere over utility"
  - "Runtime truth isolation"

depends_on:
  - "0522Q_WOS_MaritimeContinuityDoctrine_v1.0.0"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523R_WOS_InfrastructureRegistry_v1.2.3"

enables:
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.0"
  - "0525C_WOS_LiveStylePanel_v1.0.0"
  - "0525D_WOS_SurfaceStylePresets_v1.0.0"

tags:
  - "presentation"
  - "style"
  - "atmosphere"
  - "renderer"
  - "maritime"
  - "governance"
  - "manifest"
  - "surface"

supersedes:
  - "0525A_WOS_MapStyleAuthority_v1.0.0"
  - "0525A_WOS_MapStyleAuthority_v1.0.1_PATCH"
  - "0525A_WOS_MapStyleAuthority_v1.0.1_BUILD_INCOMPLETE"

owner: "StudioRich / WOS"

freeze_decision: "GO"
build_scope: "bounded-presentation-governance-authority"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Approved for production development as a bounded presentation governance authority.

---

# 0525A_WOS_MapStyleAuthority_v1.0.1_BUILD

## Canonical Artifact Rule

This is the full standalone canonical BUILD artifact for `0525A_WOS_MapStyleAuthority_v1.0.1`.

This document is reconstructable without prior versions.

It fully integrates:

- `0525A_WOS_MapStyleAuthority_v1.0.0`
- `0525A_WOS_MapStyleAuthority_v1.0.1_PATCH`
- architectural review corrections
- governance review corrections
- missing schema definitions
- manifest-pattern corrections
- runtime/presentation authority hardening

Partial-file patch releases are forbidden for this spec after this point.

---

# 🎯 PURPOSE

Define the authoritative presentation governance system for WOS world rendering.

This specification establishes:

- registry-driven map styling
- atmospheric interpretation governance
- maritime symbolic presentation governance
- immutable presentation manifest generation
- live presentation override infrastructure
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

Every atmospheric feature added before registry migration creates avoidable future migration debt.

---

# 🏛️ AUTHORITY BOUNDARIES

## This Specification Governs

MapStyleAuthority owns presentation styling only.

This specification governs:

- map presentation registries
- global color palettes
- land, water, road, label, atmosphere, and overlay style registries
- atmosphere rendering configuration
- symbolic vessel appearance
- far-light presentation tuning
- presentation-layer motion easing
- wake visual presentation
- overlay visual tuning
- immutable presentation manifest generation
- live presentation override evaluation
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

---

## Produces

- MapStyleManifest

---

## Consumed By

- MarineRenderer
- Overlay visual renderer
- Surface presentation adapters
- developer presentation diagnostics

---

## Observed By

- MarineRenderer
- OverlayGrammar
- ObservabilityCamera
- SurfaceRuntime
- LiveStylePanel

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

## AtmosphereStyle Boundary

`AtmosphereStyle` may define:

- fog alpha
- haze strength
- grain opacity
- bloom softness
- glow radius
- visual falloff styling

But these values are presentation expression parameters only.

They do not alter AtmosphericReadability truth outputs.

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

MapStyleAuthority may not reorder telemetry meaning.

MapStyleAuthority may not decide overlay semantic priority.

MapStyleAuthority may not turn visual suppression into semantic deletion.

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

Tilt, pitch, pseudo-depth, and 2.5D treatments must remain compatible with 2D truth.

---

# 🌫️ ATMOSPHERE TERMINOLOGY POLICY

Within this specification, atmosphere means:

- visual interpretation
- environmental rendering
- atmospheric projection
- observability treatment
- low-light readability
- visual calmness

Within this specification, atmosphere does NOT mean:

- soundtrack pacing
- audio mood
- scheduler behavior
- transition timing
- camera choreography
- program sequencing
- world-state orchestration

This prevents atmosphere from becoming hidden orchestration authority.

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

type OverrideProvenance = "DEBUG_TOOL" | "SURFACE_RUNTIME" | "TEMPORARY";

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

type MotionPresentationStyle = {
  readonly headingVisualSmoothing: number;
  readonly interpolationCurve: InterpolationCurve;
  readonly visualEasingMs: number;
};

type VesselLightingStyle = {
  readonly farLightAlpha: number;
  readonly farLightHaloPx: number;
  readonly twinkleStrength: number;
};

type WakePresentationStyle = {
  readonly visualAlphaMultiplier: number;
  readonly edgeSoftnessScalar: number;
};

type SymbolicVesselStyle = {
  readonly hullColorHex: string;
  readonly deckColorHex: string;
  readonly accentColorHex: string;
  readonly strokeWidthPx: number;
  readonly compactScaleMultiplier: number;
  readonly detailedScaleMultiplier: number;
};

type VesselStyle = {
  readonly symbolic: SymbolicVesselStyle;
  readonly lighting: VesselLightingStyle;
  readonly wakePresentation: WakePresentationStyle;
  readonly motionPresentation: MotionPresentationStyle;
};

type MaritimeStyleRegistry = {
  readonly cargo: VesselStyle;
  readonly tanker: VesselStyle;
  readonly ferry: VesselStyle;
  readonly service: VesselStyle;
  readonly recreational: VesselStyle;
  readonly fishing: VesselStyle;
  readonly passenger: VesselStyle;
  readonly tug: VesselStyle;
  readonly military: VesselStyle;
  readonly industrial: VesselStyle;
  readonly unknown: VesselStyle;
  readonly default: VesselStyle;
};

type StyleOverride = {
  readonly overrideId: string;
  readonly targetLayer: MapStyleLayerKey;
  readonly values: Partial<
    | WaterStyle
    | LandStyle
    | RoadStyle
    | LabelStyle
    | AtmosphereStyle
    | OverlayStyle
  >;
  readonly expiresAtMs: number | null;
  readonly provenance: OverrideProvenance;
};

type MapStyleManifest = {
  readonly manifestId: string;
  readonly version: "1.0.1";
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
const MAX_SINGLE_OVERRIDE_COUNT = 1;

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
class MapStyleAuthority {
  private activeRegistry: MapStyleRegistry;

  private maritimeRegistry: MaritimeStyleRegistry;

  private activeLiveOverride: StyleOverride | null = null;

  constructor() {
    this.activeRegistry = this.compileBaseRegistry();
    this.maritimeRegistry = this.compileBaseMaritimeRegistry();
  }

  private compileBaseRegistry(): MapStyleRegistry {
    return {
      water: {
        baseColor: "#080a0f",
        shimmerStrength: 0.15,
        reflectionOpacity: 0.2,
        currentBandAlpha: 0.1,
        coastlineContrast: 1.1,
        harborDarkness: 0.9,
      },

      land: {
        landColorHex: "#11141a",
        districtContrast: 0.35,
        coastlineVisibility: 0.6,
        infrastructureShadowStrength: 0.4,
        nighttimeDarkness: 0.85,
      },

      roads: {
        arterialOpacity: 0.3,
        localRoadOpacity: 0.1,
        glowStrength: 0.2,
        labelSuppression: 0.6,
        nighttimeFade: 0.75,
      },

      labels: {
        density: 0.4,
        opacity: 0.7,
        districtPriority: 3,
        infrastructurePriority: 1,
        suppressionStrength: 0.5,
      },

      atmosphere: {
        fogAlpha: 0.15,
        hazeStrength: 0.25,
        grainOpacity: 0.04,
        glowRadius: 10.0,
        bloomSoftness: 0.35,
        visibilityFalloffKm: 12.0,
      },

      overlays: {
        hudOpacity: 0.8,
        scannerStrength: 0.5,
        typographyGlow: 0.6,
        telemetrySoftness: 0.3,
        noiseSuppression: 0.5,
      },
    };
  }

  private createDefaultVesselStyle(): VesselStyle {
    return {
      symbolic: {
        hullColorHex: "#3fb950",
        deckColorHex: "#0d1117",
        accentColorHex: "#58a6ff",
        strokeWidthPx: 1.5,
        compactScaleMultiplier: 0.75,
        detailedScaleMultiplier: 1.0,
      },

      lighting: {
        farLightAlpha: 0.5,
        farLightHaloPx: 12,
        twinkleStrength: 0.4,
      },

      wakePresentation: {
        visualAlphaMultiplier: 0.5,
        edgeSoftnessScalar: 0.3,
      },

      motionPresentation: {
        headingVisualSmoothing: 0.8,
        interpolationCurve: "CUBIC_GLIDE",
        visualEasingMs: 450,
      },
    };
  }

  private compileBaseMaritimeRegistry(): MaritimeStyleRegistry {
    const defaultVessel = this.createDefaultVesselStyle();

    return {
      cargo: defaultVessel,

      tanker: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#f97583",
          accentColorHex: "#ea4a5a",
        },
      },

      ferry: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#79b8ff",
          accentColorHex: "#c8e1ff",
        },
      },

      service: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#d2a8ff",
          accentColorHex: "#bc8cff",
        },
      },

      recreational: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#a5d6ff",
          compactScaleMultiplier: 0.6,
        },
      },

      fishing: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#f2cc60",
          accentColorHex: "#d29922",
        },
      },

      passenger: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#58a6ff",
          detailedScaleMultiplier: 1.1,
        },
      },

      tug: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#ffa657",
          compactScaleMultiplier: 0.7,
        },
      },

      military: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#8b949e",
          accentColorHex: "#6e7681",
        },
      },

      industrial: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#db6d28",
          accentColorHex: "#f0883e",
        },
      },

      unknown: {
        ...defaultVessel,
        symbolic: {
          ...defaultVessel.symbolic,
          hullColorHex: "#6e7681",
          accentColorHex: "#8b949e",
        },
      },

      default: defaultVessel,
    };
  }

  public setSingleLiveOverride(override: StyleOverride): void {
    this.activeLiveOverride = override;
  }

  public clearLiveOverride(): void {
    this.activeLiveOverride = null;
  }

  public generateManifest(
    simulationTimeMs: number,
    visibilityClass: VisibilityClass | null,
    createdAtMs: number = Date.now(),
  ): MapStyleManifest {
    const resolvedMapStyle = this.resolveMapStyle();

    const constrainedMapStyle = this.applyVisibilityEnvelope(
      resolvedMapStyle,
      visibilityClass,
    );

    return {
      manifestId: `map-style-manifest::${simulationTimeMs}`,
      version: "1.0.1",
      simulationTimeMs,
      createdAtMs,
      mapStyle: constrainedMapStyle,
      maritimeStyle: this.maritimeRegistry,
      activeOverrides: this.activeLiveOverride ? [this.activeLiveOverride] : [],
      visibilityClass,
    };
  }

  private resolveMapStyle(): MapStyleRegistry {
    if (!this.activeLiveOverride) {
      return this.activeRegistry;
    }

    return this.applySingleLayerOverride(
      this.activeRegistry,
      this.activeLiveOverride,
    );
  }

  private applySingleLayerOverride(
    baseStyle: MapStyleRegistry,
    override: StyleOverride,
  ): MapStyleRegistry {
    return {
      ...baseStyle,
      [override.targetLayer]: {
        ...baseStyle[override.targetLayer],
        ...override.values,
      },
    };
  }

  private applyVisibilityEnvelope(
    style: MapStyleRegistry,
    visibilityClass: VisibilityClass | null,
  ): MapStyleRegistry {
    if (visibilityClass !== "ATMOSPHERIC_HIDDEN") {
      return style;
    }

    return {
      ...style,
      atmosphere: {
        ...style.atmosphere,
        fogAlpha: Math.max(style.atmosphere.fogAlpha, 1.0),
      },
      labels: {
        ...style.labels,
        opacity: 0.0,
        suppressionStrength: 1.0,
      },
    };
  }
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
- overrides are ephemeral unless serialized by SurfaceRuntime tooling
- renderer-local overrides are forbidden
- implicit fallback chains are discouraged
- nested preset inheritance is deferred

---

# 🧪 LIVE OVERRIDE GOVERNANCE

Live runtime overrides are permitted only as:

```text
development-time presentation editing infrastructure
```

They may be used to tune:

- atmospheric softness
- water color
- coastline contrast
- label opacity
- overlay glow
- road visibility
- fog intensity

They may NOT be used to tune:

- AIS runtime behavior
- visibilityClass assignment
- dead reckoning
- wake persistence
- camera routing
- scheduler timing
- overlay semantic ordering

Persistence rule:

```text
Overrides are ephemeral unless explicitly serialized through SurfaceRuntime tooling.
```

Single-writer rule:

```text
Only one active override authority may exist at a time.
```

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

- [x] Authority boundaries remain clean
- [x] Runtime truth remains deterministic
- [x] Interpretation layer remains passive
- [x] AtmosphericReadability retains visibility authority
- [x] No renderer mutation ambiguity exists
- [x] Motion semantics remain presentation-only
- [x] WakeAuthority remains isolated
- [x] OverlayGrammar ownership remains bounded
- [x] Override governance is deterministic
- [x] Projection integrity is enforced
- [x] No orchestration leakage exists
- [x] Vocabulary remains canonical
- [x] Maritime symbolic presentation is typed
- [x] Manifest generation remains immutable
- [x] Multiple override authorities are forbidden
- [x] InterpolationCurve is defined
- [x] MapStyleManifest is defined
- [x] StyleOverride is defined
- [x] LandStyle is defined
- [x] all 11 maritime vessel classes are covered plus default fallback
- [x] canonical artifact is standalone and reconstructable

---

# ✅ BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [x] authority boundaries are fully defined
- [x] MarineRenderer consumes MapStyleManifest rather than receiving direct style mutations
- [x] AtmosphericReadability visibilityClass cannot be overridden by style systems
- [x] single active override governance is defined
- [x] override persistence is explicitly externalized to SurfaceRuntime tooling
- [x] projection integrity doctrine is defined
- [x] runtime truth mutation paths are forbidden
- [x] motion presentation semantics are visually scoped
- [x] overlay semantic ownership is separated
- [x] wake authority is preserved
- [x] all required data schemas are defined
- [x] full canonical document is complete

Build readiness:

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
- full LiveStylePanel implementation
- SurfaceStylePreset serialization details

These systems may depend on MapStyleAuthority.

They are not governed by MapStyleAuthority.

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

---

# 💬 IMPLEMENTATION NOTES

Implementation order:

```text
1. renderer de-hardcoding
2. manifest generation
3. atmospheric registry extraction
4. maritime symbolic extraction
5. live override tooling
```

Recommended repository target:

```text
wall/systems/presentation/mapStyleAuthority.js
```

Recommended development companion:

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
0525B_WOS_MaritimeStyleRegistry_v1.0.0
```

Reason:

Maritime symbolic rendering now represents its own bounded governance domain including:

- vessel symbolic language
- harbor readability
- far-light doctrine
- maritime atmospheric scaling
- wake symbolic rendering
- vessel differentiation
- symbolic degradation rules
- hover-card visual behavior
- maritime style presets

This keeps MapStyleAuthority bounded as presentation governance rather than allowing it to become a mega-spec.

---

# 📊 FINAL STATUS

```text
0525A_WOS_MapStyleAuthority_v1.0.1
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
bounded-presentation-governance-authority
```

Build Scope:

```text
pure presentation governance, manifest generation, style registry resolution
```

Final instruction:

```text
Proceed to implementation or downstream 0525B extraction.
```
