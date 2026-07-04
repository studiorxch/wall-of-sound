---
layout: spec

title: "WOS Maritime Style Registry"
date: 2026-05-25
doc_id: "0525B_WOS_MaritimeStyleRegistry_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "interpretation"
component: "MaritimeStyleRegistry"

type: "runtime-interpretation-spec"
status: "review"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the bounded maritime symbolic presentation registry for vessel-class styling, far-light behavior, wake presentation, motion presentation, hover-card visual treatment, and harbor readability expression."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Presentation systems interpret the world"
  - "Maritime style expresses continuity; it does not create continuity"
  - "Far vessels are atmospheric harbor infrastructure"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.1"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523R_WOS_InfrastructureRegistry_v1.2.3"

enables:
  - "0525C_WOS_LiveStylePanel_v1.0.0"
  - "0525D_WOS_SurfaceStylePresets_v1.0.0"
  - "0525E_WOS_MaritimeHoverCardPresentation_v1.0.0"
  - "0525F_WOS_HarborReadabilityPresets_v1.0.0"

tags:
  - "maritime"
  - "presentation"
  - "style-registry"
  - "vessels"
  - "far-light"
  - "wake"
  - "hover-card"
  - "harbor"
  - "symbolic-rendering"

supersedes: []

owner: "StudioRich / WOS"

stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "bounded-maritime-symbolic-presentation-registry"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Define maritime symbolic presentation as a bounded registry domain before expanding live style tooling or Surface presets.

---

# 0525B_WOS_MaritimeStyleRegistry_v1.0.0

## Canonical Artifact Rule

This is a full standalone canonical review artifact.

This document defines the maritime-specific style registry domain extracted downstream from:

```text
0525A_WOS_MapStyleAuthority_v1.0.1
```

It does not replace MapStyleAuthority.

It specializes one bounded area of presentation governance:

```text
maritime symbolic rendering
```

This spec must remain reconstructable without prior drafts.

Partial patch-only releases are forbidden after this version.

---

# 🎯 PURPOSE

Define the authoritative maritime symbolic style registry for WOS harbor and vessel rendering.

This specification establishes:

- vessel-class visual differentiation
- far-light atmospheric behavior
- wake visual presentation
- symbolic vessel scaling
- motion presentation styling
- hover-card visual treatment
- harbor readability tiers
- maritime density response styling
- class-safe fallback behavior

The goal is to move maritime presentation from:

```text
generic vessel styling inside global map authority
```

toward:

```text
bounded maritime symbolic presentation infrastructure
```

This ensures MapStyleAuthority remains a global presentation governance layer while MaritimeStyleRegistry owns concrete maritime visual grammar.

---

# 🧠 CORE PRINCIPLES

## 1. Maritime Style Is Symbolic

Maritime style does not attempt photorealistic vessel rendering.

It expresses vessels as symbolic atmospheric entities.

Maritime presentation should prioritize:

- class differentiation
- harbor continuity
- low-fatigue readability
- atmospheric calmness
- symbolic motion clarity
- distant observability
- continuity-preserving minimalism

over:

- tactical AIS dashboards
- exact physical vessel modeling
- dense label-first rendering
- game-like target markers
- literal 3D simulation

---

## 2. Far Vessels Are Atmospheric Infrastructure

Distant vessels should behave visually like:

```text
small living harbor lights
```

not like:

```text
miniature tactical entities
```

Far vessels should contribute to:

- background life
- harbor depth
- continuity presence
- subtle motion
- low-light ambience
- non-fatiguing world density

They should not demand attention unless promoted by other authority systems.

---

## 3. Maritime Style Does Not Own Runtime Truth

MaritimeStyleRegistry may define how vessels look.

It may NOT define:

- whether vessels exist
- where vessels are
- whether vessels are visible
- how vessels move in runtime truth
- how AIS data is interpreted
- how wakes persist
- which vessel deserves camera focus
- which vessel belongs to a population tier

---

## 4. All Classes Must Resolve Safely

No vessel may fail style resolution.

The registry must define:

```text
11 canonical vessel classes
+ default fallback
```

The `unknown` class is a canonical bucket.

The `default` entry is a non-taxonomic fallback.

Canonical distinction:

```text
unknown = recognized taxonomy class
default = defensive fallback for invalid, missing, future, or unmapped class keys
```

---

## 5. Motion Presentation Is Visual Only

Maritime motion style may smooth rendering.

It may NOT alter runtime motion.

MotionPresentationStyle affects:

- heading visual smoothing
- screen-space interpolation curve
- render easing window

It may NOT affect:

- AISRuntime
- dead reckoning
- fixed timestep accumulation
- continuity authority
- vessel coordinates
- heading truth

---

# 🏛️ AUTHORITY BOUNDARIES

## This Specification Governs

MaritimeStyleRegistry owns:

- vessel-class style definitions
- vessel symbolic color palettes
- vessel compact/detailed scale tuning
- far-light visual intensity
- far-light halo sizing
- twinkle presentation strength
- wake visual alpha treatment
- wake edge softness
- hover-card visual treatment
- class-specific readability expression
- density-response styling modifiers
- maritime presentation fallback behavior

---

## This Specification May Observe

MaritimeStyleRegistry may observe:

- vessel class taxonomy outputs
- population hierarchy tier outputs
- AtmosphericReadability visibilityClass
- ContinuityDensity clutter pressure
- WakeAuthority renderable descriptors
- MapStyleAuthority active presentation manifest
- SurfaceRuntime selected presentation preset

Observation does not grant mutation authority.

---

## This Specification Produces

MaritimeStyleRegistry produces:

```text
MaritimeStyleRegistry
```

and class-level:

```text
VesselStyle
```

records consumed through:

```text
MapStyleManifest
```

---

## This Specification Does NOT Govern

This specification does NOT govern:

- global map palette
- water style
- land style
- road style
- label grammar
- AIS truth
- vessel position
- vessel heading truth
- runtime continuity
- wake memory
- AtmosphericReadability visibilityClass assignment
- PopulationHierarchy tier assignment
- camera hero selection
- hover-card semantic content
- overlay telemetry order
- scheduler behavior
- soundtrack pacing
- Surface transitions

---

# 🌊 CONTINUITY ROLE

MaritimeStyleRegistry supports continuity by making maritime entities visually consistent across:

- distance
- visibility class
- vessel class
- density pressure
- low-light states
- wake expression
- Surface presentation presets
- compact and detailed render modes

It does NOT generate continuity.

It expresses continuity that runtime systems already own.

Canonical distinction:

```text
Runtime systems maintain vessel continuity.
MaritimeStyleRegistry expresses vessel continuity visually.
```

---

# 🧭 INTERPRETATION SEPARATION

## Runtime Truth

Owned by:

- AISRuntime
- MaritimeContinuityEngine
- AtmosphericReadability
- WakeAuthority
- PopulationHierarchy
- ContinuityDensity

Runtime truth defines:

- vessel existence
- vessel class input
- position
- heading
- speed
- wake state
- visibilityClass
- density pressure
- population tier

---

## Maritime Presentation

Owned by:

- MaritimeStyleRegistry
- MapStyleAuthority
- MarineRenderer

Maritime presentation defines:

- how a cargo vessel differs visually from a ferry
- how a far ferry twinkles
- how a tug reads at compact scale
- how wakes fade visually
- how hover cards look
- how class palette survives low light
- how density pressure reduces visual load

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- 0525A_WOS_MapStyleAuthority_v1.0.1
- 0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2
- 0523B_WOS_MaritimePopulationHierarchy_v1.1.0
- 0523D_WOS_MaritimeWakeAuthority_v1.2.1
- 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- SurfaceRuntime

---

## Produces

- MaritimeStyleRegistry
- VesselStyle
- HoverCardPresentationStyle
- ClassStyleResolutionResult

---

## Consumed By

- MapStyleAuthority
- MarineRenderer
- LiveStylePanel
- SurfaceStylePresets
- presentation debug tools

---

## Observed By

- OverlayGrammar
- ObservabilityCamera
- SurfaceRuntime
- presentation diagnostics

---

## Forbidden Mutations

MaritimeStyleRegistry may never mutate:

- AIS state
- vessel class taxonomy
- vessel position
- vessel heading truth
- vessel speed truth
- wake buffers
- wake lifetime
- visibilityClass
- population tier
- clutter pressure
- camera target selection
- hover-card semantic content
- overlay hierarchy

---

# 🧬 CANONICAL VESSEL STYLE CLASSES

MaritimeStyleRegistry must support all 11 canonical vessel classes plus a default fallback.

## Canonical Vessel Classes

```text
cargo
tanker
ferry
service
recreational
fishing
passenger
tug
military
industrial
unknown
```

## Defensive Fallback

```text
default
```

The fallback is used when:

- class key is missing
- class key is invalid
- future AIS mapping is unsupported
- imported data uses unfamiliar taxonomy
- upstream mapping fails

No vessel may resolve to undefined style.

---

# 🎨 CLASS PRESENTATION DOCTRINE

## cargo

Cargo vessels should read as:

- stable
- heavy
- infrastructural
- slow-moving
- industrial but calm

Visual role:

```text
harbor mass
```

---

## tanker

Tankers should read as:

- larger
- heavier
- slower
- slightly hazardous
- muted but visually weighty

Visual role:

```text
dangerous mass under restraint
```

---

## ferry

Ferries should read as:

- civic
- rhythmic
- familiar
- passenger-facing
- route-based

Visual role:

```text
public harbor pulse
```

---

## service

Service vessels should read as:

- utility support
- operational infrastructure
- active but non-dominant

Visual role:

```text
maintenance signal
```

---

## recreational

Recreational vessels should read as:

- small
- light
- less authoritative
- more flickering or fragile

Visual role:

```text
small human presence
```

---

## fishing

Fishing vessels should read as:

- local
- workmanlike
- smaller than cargo
- warmer or earthier

Visual role:

```text
working harbor craft
```

---

## passenger

Passenger vessels should read as:

- readable
- civic
- route-oriented
- slightly more luminous than cargo

Visual role:

```text
human movement corridor
```

---

## tug

Tugs should read as:

- compact
- dense
- strong
- directional

Visual role:

```text
small force multiplier
```

---

## military

Military vessels should read as:

- restrained
- low-emission
- gray
- authoritative without spectacle

Visual role:

```text
quiet authority
```

---

## industrial

Industrial vessels should read as:

- work-platform-like
- mechanical
- orange / utility-coded
- less elegant than cargo

Visual role:

```text
floating machinery
```

---

## unknown

Unknown vessels should read as:

- neutral
- low-priority
- intentionally unresolved
- visually safe

Visual role:

```text
classification uncertainty
```

---

# 🌫️ VISIBILITY CLASS RESPONSE

MaritimeStyleRegistry does not assign visibilityClass.

It responds to visibilityClass.

## FULL

Allowed:

- detailed vessel silhouette
- hull/deck/accent colors
- wake presentation
- hover affordance
- compact labels if approved by OverlayGrammar

---

## REDUCED

Allowed:

- simplified silhouette
- reduced accent
- softer wake
- lower stroke contrast

---

## SILHOUETTE

Allowed:

- class-shaped outline
- minimal fill contrast
- subdued light halo
- reduced internal detail

---

## MARKER_ONLY

Allowed:

- small marker
- class-safe color tint
- no detailed silhouette
- no semantic label expansion

---

## LIGHT_ONLY

Allowed:

- far-light point
- halo
- twinkle
- no hull detail
- no wake emphasis

---

## ATMOSPHERIC_HIDDEN

Allowed:

- no vessel rendering
- optional environmental absence implied through atmosphere only

Forbidden:

- visible hull
- visible label
- wake emphasis
- hover expansion

---

# ✨ FAR-LIGHT DOCTRINE

Far-light rendering is one of the most important maritime presentation behaviors.

Far vessels must not feel like frozen dots.

Far vessels should feel like:

```text
tiny harbor signals that remain alive
```

Far-light behavior may include:

- low alpha
- subtle halo
- low-frequency twinkle
- class-tinted glow
- distance-weighted softness
- occasional micro-pulse
- weather-dampened intensity

Far-light behavior may NOT include:

- attention-grabbing flashing
- tactical target glow
- high-frequency blinking
- aggressive selection rings
- label-first rendering
- gameplay enemy-marker behavior

Canonical objective:

```text
far lights should be alive but not loud
```

---

# 🌊 WAKE PRESENTATION DOCTRINE

WakeAuthority owns wake truth.

MaritimeStyleRegistry owns wake appearance.

Wake styling may express:

- softness
- alpha
- visual length impression
- class tint
- edge fade
- density suppression

Wake styling may NOT affect:

- wake memory
- wake ring-buffer size
- wake decay time
- wake persistence state
- runtime trail generation
- wake segment lifecycle

Wakes should remain:

- subtle
- atmospheric
- continuity-reinforcing
- non-cluttering

---

# 🧭 MOTION PRESENTATION DOCTRINE

MotionPresentationStyle may smooth:

- heading rendering
- screen-space transition
- vessel sprite orientation
- visual easing

MotionPresentationStyle may NOT alter:

- vessel coordinates
- AIS input
- fixed timestep update
- continuity reconciliation
- dead reckoning
- runtime interpolation authority

Canonical rule:

```text
Motion style changes perception only.

It never changes truth.
```

---

# 🪪 HOVER CARD PRESENTATION DOCTRINE

Hover-card semantic content is not owned by this spec.

OverlayGrammar or a future hover-card semantic spec owns:

- what fields appear
- field order
- semantic grouping
- label names
- telemetry hierarchy

MaritimeStyleRegistry owns hover-card visual treatment only:

- background opacity
- border softness
- class accent color
- compact/detailed mode
- glow strength
- fade timing
- visual persistence

Hover cards should live slightly longer than conventional web tooltips to support slow atmospheric observation.

Hover cards should not behave like tactical popups.

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

type InterpolationCurve =
  | "LINEAR"
  | "EASE_IN_OUT"
  | "EASE_OUT"
  | "SMOOTH_STEP"
  | "CUBIC_GLIDE";

type SymbolicVesselStyle = {
  readonly hullColorHex: string;
  readonly deckColorHex: string;
  readonly accentColorHex: string;
  readonly strokeWidthPx: number;
  readonly compactScaleMultiplier: number;
  readonly detailedScaleMultiplier: number;
  readonly silhouetteWeight: number;
  readonly markerRadiusPx: number;
};

type VesselLightingStyle = {
  readonly farLightAlpha: number;
  readonly farLightHaloPx: number;
  readonly twinkleStrength: number;
  readonly twinkleRateHz: number;
  readonly lowVisibilityDamping: number;
  readonly classTintStrength: number;
};

type WakePresentationStyle = {
  readonly visualAlphaMultiplier: number;
  readonly edgeSoftnessScalar: number;
  readonly classTintStrength: number;
  readonly densitySuppressionStrength: number;
};

type MotionPresentationStyle = {
  readonly headingVisualSmoothing: number;
  readonly interpolationCurve: InterpolationCurve;
  readonly visualEasingMs: number;
};

type HoverCardPresentationStyle = {
  readonly backgroundAlpha: number;
  readonly borderAlpha: number;
  readonly borderRadiusPx: number;
  readonly classAccentStrength: number;
  readonly glowStrength: number;
  readonly fadeInMs: number;
  readonly holdMs: number;
  readonly fadeOutMs: number;
  readonly maxWidthPx: number;
};

type DensityResponseStyle = {
  readonly clutterSuppressionStrength: number;
  readonly farLightSuppressionStrength: number;
  readonly wakeSuppressionStrength: number;
  readonly labelVisualSuppressionStrength: number;
};

type VesselStyle = {
  readonly symbolic: SymbolicVesselStyle;
  readonly lighting: VesselLightingStyle;
  readonly wakePresentation: WakePresentationStyle;
  readonly motionPresentation: MotionPresentationStyle;
  readonly hoverCardPresentation: HoverCardPresentationStyle;
  readonly densityResponse: DensityResponseStyle;
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

type ClassStyleResolutionResult = {
  readonly requestedClass: string | null;
  readonly resolvedClass: MaritimeVesselStyleKey;
  readonly usedFallback: boolean;
  readonly vesselStyle: VesselStyle;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const MARITIME_STYLE_VERSION = "1.0.0";

const CANONICAL_VESSEL_CLASS_COUNT = 11;

const REQUIRED_STYLE_KEY_COUNT = 12;

const DEFAULT_VISUAL_EASING_MS = 450;

const DEFAULT_FAR_LIGHT_ALPHA = 0.50;

const DEFAULT_FAR_LIGHT_HALO_PX = 12;

const DEFAULT_TWINKLE_STRENGTH = 0.40;

const DEFAULT_WAKE_ALPHA_MULTIPLIER = 0.50;

const DEFAULT_HOVER_HOLD_MS = 1400;

const MAX_HOVER_HOLD_MS = 3200;

const DEFAULT_DENSITY_SUPPRESSION_STRENGTH = 0.50;
```

Constants are:

- implementation baselines
- tunable presentation values

They are not eternal doctrine.

---

# 🎨 DEFAULT CLASS REGISTRY

```ts
const defaultVesselStyle: VesselStyle = {
  symbolic: {
    hullColorHex: "#3fb950",
    deckColorHex: "#0d1117",
    accentColorHex: "#58a6ff",
    strokeWidthPx: 1.5,
    compactScaleMultiplier: 0.75,
    detailedScaleMultiplier: 1.0,
    silhouetteWeight: 0.75,
    markerRadiusPx: 2.5,
  },

  lighting: {
    farLightAlpha: 0.50,
    farLightHaloPx: 12,
    twinkleStrength: 0.40,
    twinkleRateHz: 0.18,
    lowVisibilityDamping: 0.65,
    classTintStrength: 0.45,
  },

  wakePresentation: {
    visualAlphaMultiplier: 0.50,
    edgeSoftnessScalar: 0.30,
    classTintStrength: 0.20,
    densitySuppressionStrength: 0.50,
  },

  motionPresentation: {
    headingVisualSmoothing: 0.80,
    interpolationCurve: "CUBIC_GLIDE",
    visualEasingMs: 450,
  },

  hoverCardPresentation: {
    backgroundAlpha: 0.78,
    borderAlpha: 0.45,
    borderRadiusPx: 10,
    classAccentStrength: 0.70,
    glowStrength: 0.35,
    fadeInMs: 120,
    holdMs: 1400,
    fadeOutMs: 420,
    maxWidthPx: 280,
  },

  densityResponse: {
    clutterSuppressionStrength: 0.50,
    farLightSuppressionStrength: 0.35,
    wakeSuppressionStrength: 0.60,
    labelVisualSuppressionStrength: 0.75,
  },
};
```

---

# 🚢 CLASS DEFAULTS

## MaritimeStyleRegistry Required Keys

```ts
const maritimeStyleRegistry: MaritimeStyleRegistry = {
  cargo: defaultVesselStyle,

  tanker: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#f97583",
      accentColorHex: "#ea4a5a",
      compactScaleMultiplier: 0.82,
      detailedScaleMultiplier: 1.15,
    },
    lighting: {
      ...defaultVesselStyle.lighting,
      farLightAlpha: 0.44,
      classTintStrength: 0.38,
    },
  },

  ferry: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#79b8ff",
      accentColorHex: "#c8e1ff",
      detailedScaleMultiplier: 1.10,
    },
    lighting: {
      ...defaultVesselStyle.lighting,
      farLightAlpha: 0.60,
      twinkleStrength: 0.32,
    },
  },

  service: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#d2a8ff",
      accentColorHex: "#bc8cff",
      compactScaleMultiplier: 0.70,
    },
  },

  recreational: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#a5d6ff",
      accentColorHex: "#79c0ff",
      compactScaleMultiplier: 0.58,
      detailedScaleMultiplier: 0.78,
      markerRadiusPx: 2.0,
    },
    lighting: {
      ...defaultVesselStyle.lighting,
      farLightAlpha: 0.38,
      farLightHaloPx: 8,
      twinkleStrength: 0.55,
    },
  },

  fishing: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#f2cc60",
      accentColorHex: "#d29922",
      compactScaleMultiplier: 0.68,
    },
  },

  passenger: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#58a6ff",
      accentColorHex: "#a5d6ff",
      detailedScaleMultiplier: 1.10,
    },
    hoverCardPresentation: {
      ...defaultVesselStyle.hoverCardPresentation,
      holdMs: 1700,
      classAccentStrength: 0.82,
    },
  },

  tug: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#ffa657",
      accentColorHex: "#f0883e",
      compactScaleMultiplier: 0.66,
      silhouetteWeight: 0.90,
    },
    motionPresentation: {
      ...defaultVesselStyle.motionPresentation,
      headingVisualSmoothing: 0.72,
      visualEasingMs: 380,
    },
  },

  military: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#8b949e",
      accentColorHex: "#6e7681",
      detailedScaleMultiplier: 1.05,
    },
    lighting: {
      ...defaultVesselStyle.lighting,
      farLightAlpha: 0.30,
      twinkleStrength: 0.18,
      classTintStrength: 0.22,
    },
    hoverCardPresentation: {
      ...defaultVesselStyle.hoverCardPresentation,
      backgroundAlpha: 0.84,
      glowStrength: 0.18,
    },
  },

  industrial: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#db6d28",
      accentColorHex: "#f0883e",
      compactScaleMultiplier: 0.78,
      detailedScaleMultiplier: 1.05,
    },
  },

  unknown: {
    ...defaultVesselStyle,
    symbolic: {
      ...defaultVesselStyle.symbolic,
      hullColorHex: "#6e7681",
      accentColorHex: "#8b949e",
      compactScaleMultiplier: 0.62,
      detailedScaleMultiplier: 0.82,
    },
    lighting: {
      ...defaultVesselStyle.lighting,
      farLightAlpha: 0.34,
      twinkleStrength: 0.25,
      classTintStrength: 0.18,
    },
    hoverCardPresentation: {
      ...defaultVesselStyle.hoverCardPresentation,
      classAccentStrength: 0.30,
    },
  },

  default: defaultVesselStyle,
};
```

---

# 🔧 CORE FUNCTIONS

```ts
function normalizeVesselClass(
  rawClass: string | null | undefined
): MaritimeVesselStyleKey {
  if (!rawClass) return "default";

  const normalized = rawClass
    .trim()
    .toLowerCase();

  if (normalized in maritimeStyleRegistry) {
    return normalized as MaritimeVesselStyleKey;
  }

  return "default";
}

function resolveVesselStyle(
  rawClass: string | null | undefined
): ClassStyleResolutionResult {
  const resolvedClass = normalizeVesselClass(rawClass);
  const usedFallback = resolvedClass === "default" && rawClass !== "default";

  return {
    requestedClass: rawClass ?? null,
    resolvedClass,
    usedFallback,
    vesselStyle: maritimeStyleRegistry[resolvedClass],
  };
}

function applyVisibilityClassToStyle(
  vesselStyle: VesselStyle,
  visibilityClass: VisibilityClass
): VesselStyle {
  switch (visibilityClass) {
    case "FULL":
      return vesselStyle;

    case "REDUCED":
      return {
        ...vesselStyle,
        symbolic: {
          ...vesselStyle.symbolic,
          strokeWidthPx: vesselStyle.symbolic.strokeWidthPx * 0.85,
        },
        wakePresentation: {
          ...vesselStyle.wakePresentation,
          visualAlphaMultiplier:
            vesselStyle.wakePresentation.visualAlphaMultiplier * 0.65,
        },
      };

    case "SILHOUETTE":
      return {
        ...vesselStyle,
        lighting: {
          ...vesselStyle.lighting,
          farLightAlpha: vesselStyle.lighting.farLightAlpha * 0.75,
        },
        wakePresentation: {
          ...vesselStyle.wakePresentation,
          visualAlphaMultiplier: 0.0,
        },
      };

    case "MARKER_ONLY":
      return {
        ...vesselStyle,
        symbolic: {
          ...vesselStyle.symbolic,
          detailedScaleMultiplier: 0.0,
        },
        wakePresentation: {
          ...vesselStyle.wakePresentation,
          visualAlphaMultiplier: 0.0,
        },
      };

    case "LIGHT_ONLY":
      return {
        ...vesselStyle,
        symbolic: {
          ...vesselStyle.symbolic,
          compactScaleMultiplier: 0.0,
          detailedScaleMultiplier: 0.0,
        },
        wakePresentation: {
          ...vesselStyle.wakePresentation,
          visualAlphaMultiplier: 0.0,
        },
      };

    case "ATMOSPHERIC_HIDDEN":
      return {
        ...vesselStyle,
        symbolic: {
          ...vesselStyle.symbolic,
          compactScaleMultiplier: 0.0,
          detailedScaleMultiplier: 0.0,
          markerRadiusPx: 0.0,
        },
        lighting: {
          ...vesselStyle.lighting,
          farLightAlpha: 0.0,
          farLightHaloPx: 0.0,
          twinkleStrength: 0.0,
        },
        wakePresentation: {
          ...vesselStyle.wakePresentation,
          visualAlphaMultiplier: 0.0,
        },
      };

    default:
      return vesselStyle;
  }
}

function applyDensityPressureToStyle(
  vesselStyle: VesselStyle,
  clutterPressure: number
): VesselStyle {
  const pressure = Math.max(0, Math.min(1, clutterPressure));
  const density = vesselStyle.densityResponse;

  return {
    ...vesselStyle,

    lighting: {
      ...vesselStyle.lighting,
      farLightAlpha:
        vesselStyle.lighting.farLightAlpha *
        (1 - pressure * density.farLightSuppressionStrength),
    },

    wakePresentation: {
      ...vesselStyle.wakePresentation,
      visualAlphaMultiplier:
        vesselStyle.wakePresentation.visualAlphaMultiplier *
        (1 - pressure * density.wakeSuppressionStrength),
    },

    hoverCardPresentation: {
      ...vesselStyle.hoverCardPresentation,
      glowStrength:
        vesselStyle.hoverCardPresentation.glowStrength *
        (1 - pressure * density.clutterSuppressionStrength),
    },
  };
}
```

---

# 🔄 EXECUTION FLOW

Canonical maritime style flow:

```text
AIS Runtime
→ Vessel Taxonomy Classification
→ PopulationHierarchy Tier Assignment
→ AtmosphericReadability visibilityClass
→ ContinuityDensity clutterPressure
→ MaritimeStyleRegistry class lookup
→ visibilityClass style constraint
→ density-pressure visual suppression
→ MapStyleManifest inclusion
→ MarineRenderer consumption
```

Authority always flows:

```text
runtime truth
→ interpretation
→ presentation
```

NEVER:

```text
presentation style
→ runtime mutation
```

---

# 🛰️ OBSERVABILITY IMPACT

MaritimeStyleRegistry improves observability by:

- differentiating vessel classes
- reducing same-looking boat repetition
- preserving distant harbor life
- allowing subtle far-light animation
- reducing wake clutter under density
- making compact and detailed modes visually distinct
- allowing hover cards to remain readable longer
- supporting future Surface-specific maritime identities

It must not:

- increase tactical dashboard pressure
- create attention overload
- override camera focus
- promote vessels into hero status
- make far vessels visually aggressive
- imply false runtime certainty

---

# 🎼 ORCHESTRATION NOTES

MaritimeStyleRegistry does not orchestrate transitions.

It does not decide Surface identity.

It does not choose active broadcast mode.

It may be selected or modified by SurfaceStylePresets later.

SurfaceRuntime may select a maritime style preset, but MaritimeStyleRegistry remains a passive style data authority.

---

# 🧪 VALIDATION CHECKLIST

- [ ] all 11 canonical vessel classes are defined
- [ ] default fallback exists
- [ ] unknown and default are not semantically conflated
- [ ] no vessel class resolves undefined
- [ ] far-light behavior is subtle and non-tactical
- [ ] wake style cannot mutate WakeAuthority
- [ ] motion style cannot mutate runtime motion
- [ ] visibilityClass is consumed, not assigned
- [ ] ATMOSPHERIC_HIDDEN removes vessel presentation
- [ ] density pressure only suppresses visual load
- [ ] hover-card style does not own semantic content
- [ ] camera systems cannot derive hero selection from style
- [ ] registry remains shallow and deterministic
- [ ] Surface presets may consume styles without owning runtime truth
- [ ] MapStyleAuthority remains global governance owner
- [ ] MaritimeStyleRegistry remains bounded maritime presentation owner

---

# ✅ BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [ ] all canonical vessel classes plus default fallback are implemented
- [ ] registry is frozen or immutable during render-frame use
- [ ] class fallback logic is verified
- [ ] visibilityClass constraints are enforced
- [ ] density-pressure suppression is visual-only
- [ ] wake presentation fields cannot mutate WakeAuthority
- [ ] motion presentation fields cannot mutate AISRuntime or continuity systems
- [ ] MarineRenderer consumes the registry through MapStyleManifest
- [ ] debug tooling can table all vessel classes
- [ ] visual differentiation is observable at close zoom
- [ ] far-light presentation is subtle at distance
- [ ] hover-card timing can be tuned visually without changing semantic payload

Current build status:

```text
REVIEW
```

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- AIS parsing
- vessel class inference
- vessel existence
- route planning
- camera targeting
- wake persistence
- atmospheric visibility assignment
- global map styling
- water rendering
- overlay semantic grammar
- hover-card content schema
- tactical dashboards
- gameplay targeting
- scheduler transitions
- soundtrack behavior
- Surface orchestration

---

# ⏸️ DEFERRED SYSTEMS

The following systems are intentionally deferred:

- Surface-specific maritime preset packs
- harbor zone style variants
- advanced hover-card semantic schema
- vessel sprite atlas generation
- class-specific wake geometry
- weather-specific maritime palette shifts
- night-mode-only vessel glow profiles
- vessel selection rings
- active inspection overlays
- maritime route-lane visualization
- user-facing live style editor

---

# 📚 CANONICAL REFERENCES

- 0525A_WOS_MapStyleAuthority_v1.0.1
- 0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2
- 0523B_WOS_MaritimePopulationHierarchy_v1.1.0
- 0523D_WOS_MaritimeWakeAuthority_v1.2.1
- 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- 0523R_WOS_InfrastructureRegistry_v1.2.3
- WOS Naming Doctrine
- WOS Surface / Channel Doctrine
- WOS Constitutional Spec Template v2.0.1

---

# 💬 IMPLEMENTATION NOTES

Recommended implementation target:

```text
wall/systems/presentation/maritimeStyleRegistry.js
```

Recommended debug companion:

```text
wall/systems/presentation/maritimeStyleRegistryDebug.js
```

Expected integration path:

```text
MaritimeStyleRegistry
→ MapStyleAuthority
→ MapStyleManifest
→ MarineRenderer
```

Recommended public API:

```ts
SBE.MaritimeStyleRegistry.getRegistry()
SBE.MaritimeStyleRegistry.resolveVesselStyle(classKey)
SBE.MaritimeStyleRegistry.applyVisibilityClass(style, visibilityClass)
SBE.MaritimeStyleRegistry.applyDensityPressure(style, clutterPressure)
SBE.MaritimeStyleRegistry.validateRegistry()
```

Recommended debug APIs:

```ts
_wos.maritimeStyle.palette()
_wos.maritimeStyle.validate()
_wos.maritimeStyle.inspectClass("ferry")
_wos.maritimeStyle.compareClasses("cargo", "tug")
_wos.maritimeStyle.visibilityMatrix("ferry")
_wos.maritimeStyle.densityTest("cargo", 0.75)
```

---

# 🧱 NEXT SPECIFICATION

Recommended next specification:

```text
0525C_WOS_LiveStylePanel_v1.0.0
```

only after 0525B review confirms:

- registry completeness
- class fallback safety
- visibility response safety
- density suppression safety
- MapStyleAuthority integration cleanliness

Alternative next specification:

```text
0525E_WOS_MaritimeHoverCardPresentation_v1.0.0
```

if hover-card persistence and card behavior become the next immediate UX priority.

---

# 📊 FINAL STATUS

```text
0525B_WOS_MaritimeStyleRegistry_v1.0.0
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
bounded-maritime-symbolic-presentation-registry
```

Build Scope:

```text
vessel-class style resolution, far-light presentation, wake visual styling, motion presentation, hover-card visual treatment
```

Final instruction:

```text
Submit for architecture and governance review before implementation.
```
