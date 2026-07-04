---
layout: spec

title: "WOS Maritime Style Registry"
date: 2026-05-25
doc_id: "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "interpretation"
component: "MaritimeStyleRegistry"

type: "runtime-interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the bounded maritime symbolic presentation registry for vessel-class styling, far-light behavior, wake presentation, motion presentation, hover-card visual treatment, density suppression, and harbor readability expression."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Presentation systems interpret the world"
  - "Maritime style expresses continuity; it does not create continuity"
  - "Far vessels are atmospheric harbor infrastructure"
  - "Far lights should be alive but not loud"
  - "Density suppression may reduce clutter but may not prioritize narrative significance"
  - "Far-light animation may not encode urgency semantics"

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
  - "density-suppression"
  - "manifest"

supersedes:
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.0"

owner: "StudioRich / WOS"

stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "bounded-maritime-symbolic-presentation-registry"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Approved for production development as a bounded, standalone maritime presentation registry.

---

# 0525B_WOS_MaritimeStyleRegistry_v1.0.1_BUILD

## Canonical Artifact Rule

This is the full standalone canonical BUILD artifact for `0525B_WOS_MaritimeStyleRegistry_v1.0.1`.

This document is reconstructable without prior versions.

It fully integrates:

- `0525B_WOS_MaritimeStyleRegistry_v1.0.0`
- architectural review amendments
- governance review amendments
- twinkle-rate rationale
- hover hold maximum rationale
- density suppression clarification
- scale multiplier LOD guidance
- REDUCED visibility marker-radius adjustment
- `CUBIC_GLIDE` interpolation definition
- anti-urgency far-light doctrine
- non-narrative density suppression doctrine
- MapStyleManifest observation clarification

Partial-file patch releases are forbidden for this spec after this point.

---

# 🎯 PURPOSE

Define the authoritative maritime symbolic style registry for WOS harbor and vessel rendering.

This specification establishes:

- vessel-class visual differentiation
- far-light atmospheric behavior
- wake visual presentation
- motion presentation styling
- hover-card visual treatment
- harbor readability tiers
- maritime density response styling
- class-safe fallback behavior
- LOD scale guidance
- visibilityClass presentation response
- anti-urgency far-light animation governance

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

Canonical rule:

```text
Far lights should be alive but not loud.
```

---

## 3. Far-Light Animation May Not Encode Urgency

Far-light animation is atmospheric, not semantic.

It may express:

- life
- distance
- waterborne presence
- low-light continuity
- subtle harbor motion

It may NOT encode:

- danger
- alert state
- tactical priority
- distress
- urgency
- user objective
- narrative importance

If urgency semantics are ever required, they must be owned by a separate semantic overlay or event-authority specification, not by MaritimeStyleRegistry.

---

## 4. Maritime Style Does Not Own Runtime Truth

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
- which vessel has narrative importance

---

## 5. All Classes Must Resolve Safely

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

## 6. Motion Presentation Is Visual Only

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

## 7. Density Suppression Is Not Narrative Priority

Density suppression may reduce visual clutter.

It may NOT prioritize narrative significance.

DensityResponseStyle may suppress:

- far-light alpha
- wake alpha
- hover-card glow
- label visual intensity
- class accent pressure

It may NOT decide:

- which vessel matters
- which vessel should be followed
- which vessel becomes hero
- which vessel is narratively significant
- which vessel should trigger a camera action

Canonical rule:

```text
Density suppression reduces visual load only.
It does not create narrative hierarchy.
```

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
- twinkle presentation rate
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
- narrative priority
- urgency semantics

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
- narrative ranking
- urgency signaling

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

Cargo vessels should read as stable, heavy, infrastructural, slow-moving, and industrial but calm.

Visual role:

```text
harbor mass
```

## tanker

Tankers should read as larger, heavier, slower, slightly hazardous, muted but visually weighty.

Visual role:

```text
dangerous mass under restraint
```

This visual role may express weight and caution but may not encode active danger or urgency.

## ferry

Ferries should read as civic, rhythmic, familiar, passenger-facing, and route-based.

Visual role:

```text
public harbor pulse
```

## service

Service vessels should read as utility support, operational infrastructure, active but non-dominant.

Visual role:

```text
maintenance signal
```

## recreational

Recreational vessels should read as small, light, less authoritative, more flickering or fragile.

Visual role:

```text
small human presence
```

## fishing

Fishing vessels should read as local, workmanlike, smaller than cargo, warmer or earthier.

Visual role:

```text
working harbor craft
```

## passenger

Passenger vessels should read as readable, civic, route-oriented, slightly more luminous than cargo.

Visual role:

```text
human movement corridor
```

## tug

Tugs should read as compact, dense, strong, directional.

Visual role:

```text
small force multiplier
```

## military

Military vessels should read as restrained, low-emission, gray, authoritative without spectacle.

Visual role:

```text
quiet authority
```

Military styling may not imply threat state, aggression, urgency, or gameplay target priority.

## industrial

Industrial vessels should read as work-platform-like, mechanical, orange / utility-coded, less elegant than cargo.

Visual role:

```text
floating machinery
```

## unknown

Unknown vessels should read as neutral, low-priority, intentionally unresolved, visually safe.

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

## REDUCED

Allowed:

- simplified silhouette
- reduced accent
- softer wake
- lower stroke contrast
- reduced marker radius

## SILHOUETTE

Allowed:

- class-shaped outline
- minimal fill contrast
- subdued light halo
- reduced internal detail

## MARKER_ONLY

Allowed:

- small marker
- class-safe color tint
- no detailed silhouette
- no semantic label expansion

## LIGHT_ONLY

Allowed:

- far-light point
- halo
- twinkle
- no hull detail
- no wake emphasis

## ATMOSPHERIC_HIDDEN

Allowed:

- no vessel rendering
- optional environmental absence implied through atmosphere only

Forbidden:

- visible hull
- visible label
- visible marker
- visible far-light
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
- urgency coding
- danger coding
- narrative priority coding

Canonical objective:

```text
far lights should be alive but not loud
```

## Twinkle Rate Rationale

Default twinkle rate:

```text
0.18 Hz
```

This means approximately one full twinkle cycle every:

```text
5.5 seconds
```

This rate is intentionally slow.

Faster rates near or above:

```text
1.0 Hz
```

create attention-grabbing blinking that breaks atmospheric calm and risks being interpreted as urgency, alarm, or gameplay signaling.

The goal is subtle life.

Twinkle should be noticed only when the viewer looks directly.

It should not pull the eye across the harbor.

---

# 🌊 WAKE PRESENTATION DOCTRINE

WakeAuthority owns wake truth.

MaritimeStyleRegistry owns wake appearance.

Wake styling may express softness, alpha, visual length impression, class tint, edge fade, and density suppression.

Wake styling may NOT affect wake memory, wake ring-buffer size, wake decay time, wake persistence state, runtime trail generation, or wake segment lifecycle.

Wakes should remain subtle, atmospheric, continuity-reinforcing, and non-cluttering.

---

# 🧭 MOTION PRESENTATION DOCTRINE

MotionPresentationStyle may smooth heading rendering, screen-space transition, vessel sprite orientation, and visual easing.

MotionPresentationStyle may NOT alter vessel coordinates, AIS input, fixed timestep update, continuity reconciliation, dead reckoning, or runtime interpolation authority.

Canonical rule:

```text
Motion style changes perception only.

It never changes truth.
```

## CUBIC_GLIDE Definition

`CUBIC_GLIDE` is a cubic ease-in-out curve with a slower start and end:

```ts
const cubicGlide = (t: number): number => {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
```

This produces smooth visual motion with gentle acceleration and deceleration.

It is appropriate for maritime vessels because they should feel heavy, continuous, gliding, non-mechanical, and non-teleporting.

Linear interpolation may be used for diagnostics, but it is not the preferred presentation curve for production maritime rendering because it can create mechanical, abrupt visual cadence.

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

Hover-card persistence supports atmospheric observation without becoming narrative focus authority.

## Hover Hold Maximum Rationale

Default hover-card hold:

```text
1400ms
```

Maximum hover-card hold:

```text
3200ms
```

The default hold is long enough for slow atmospheric reading and short enough to fade when the viewer looks away.

The maximum hold prevents hover cards from blocking harbor visibility, becoming persistent UI panels, creating visual fatigue, implying tactical lock-on, or becoming narrative focus authority.

Longer persistence should be owned by a future inspection or overlay semantic system, not by MaritimeStyleRegistry.

---

# 🧱 SCALE MULTIPLIER USAGE

`compactScaleMultiplier` and `detailedScaleMultiplier` define how vessel symbols scale in different presentation contexts.

MaritimeStyleRegistry defines the multipliers.

It does not decide when to use them.

## compactScaleMultiplier

Used when:

- zoom level is distant
- low-detail mode is active
- high density pressure is active
- vessel population tier is BACKGROUND
- vessel population tier is GHOST
- AtmosphericReadability returns reduced or lower visibility classes

## detailedScaleMultiplier

Used when:

- zoom level is close
- high-detail mode is active
- vessel is HERO tier
- vessel is MID tier
- AtmosphericReadability returns FULL visibility
- hover/inspection affordance is active

The renderer chooses which multiplier to apply based on viewport scale, vessel observability context, population tier, visibilityClass, and density pressure.

MaritimeStyleRegistry does not make LOD decisions.

---

# 🧯 DENSITY SUPPRESSION STRENGTH CLARIFICATION

`labelVisualSuppressionStrength` is intentionally higher than general clutter suppression.

Default relationship:

```text
clutterSuppressionStrength = 0.50
labelVisualSuppressionStrength = 0.75
```

Reason:

Labels contribute disproportionately to visual clutter.

Under high density pressure, labels should be visually suppressed earlier than hull or wake rendering to maintain harbor readability.

This does NOT affect label eligibility.

It only affects visual presentation of labels when they are already eligible through OverlayGrammar or renderer policy.

Density suppression may reduce clutter.

It may not prioritize narrative significance.

---

# 🗺️ MAP STYLE MANIFEST OBSERVATION CLARIFICATION

MaritimeStyleRegistry may observe MapStyleManifest only as palette context.

Allowed observation:

- global palette brightness
- atmosphere softness
- overlay visual softness
- water/harbor darkness context
- presentation preset identity

Forbidden interpretation:

- deriving runtime visibility
- deriving narrative priority
- deriving camera targets
- deriving scheduler transitions
- deriving overlay semantic hierarchy
- rewriting MapStyleManifest contents

Canonical rule:

```text
MapStyleManifest observation is palette-contextual only.
```

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
const MARITIME_STYLE_VERSION = "1.0.1";

const CANONICAL_VESSEL_CLASS_COUNT = 11;

const REQUIRED_STYLE_KEY_COUNT = 12;

const DEFAULT_VISUAL_EASING_MS = 450;

const DEFAULT_FAR_LIGHT_ALPHA = 0.50;

const DEFAULT_FAR_LIGHT_HALO_PX = 12;

const DEFAULT_TWINKLE_STRENGTH = 0.40;

const DEFAULT_TWINKLE_RATE_HZ = 0.18;

const DEFAULT_WAKE_ALPHA_MULTIPLIER = 0.50;

const DEFAULT_HOVER_HOLD_MS = 1400;

const MAX_HOVER_HOLD_MS = 3200;

const DEFAULT_DENSITY_SUPPRESSION_STRENGTH = 0.50;

const DEFAULT_LABEL_VISUAL_SUPPRESSION_STRENGTH = 0.75;
```

Constants are implementation baselines and tunable presentation values.

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
          markerRadiusPx: vesselStyle.symbolic.markerRadiusPx * 0.85,
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

function cubicGlide(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
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
- encode urgency through twinkle or glow
- use density to imply narrative importance

---

# 🎼 ORCHESTRATION NOTES

MaritimeStyleRegistry does not orchestrate transitions.

It does not decide Surface identity.

It does not choose active broadcast mode.

It may be selected or modified by SurfaceStylePresets later.

SurfaceRuntime may select a maritime style preset, but MaritimeStyleRegistry remains a passive style data authority.

---

# 🧪 VALIDATION CHECKLIST

- [x] all 11 canonical vessel classes are defined
- [x] default fallback exists
- [x] unknown and default are not semantically conflated
- [x] no vessel class resolves undefined
- [x] far-light behavior is subtle and non-tactical
- [x] far-light animation cannot encode urgency semantics
- [x] wake style cannot mutate WakeAuthority
- [x] motion style cannot mutate runtime motion
- [x] visibilityClass is consumed, not assigned
- [x] ATMOSPHERIC_HIDDEN removes vessel presentation
- [x] density pressure only suppresses visual load
- [x] density suppression cannot prioritize narrative significance
- [x] hover-card style does not own semantic content
- [x] hover-card persistence is bounded
- [x] camera systems cannot derive hero selection from style
- [x] registry remains shallow and deterministic
- [x] Surface presets may consume styles without owning runtime truth
- [x] MapStyleAuthority remains global governance owner
- [x] MaritimeStyleRegistry remains bounded maritime presentation owner
- [x] CUBIC_GLIDE is defined
- [x] REDUCED visibility scales marker radius
- [x] MapStyleManifest observation is palette-contextual only

---

# ✅ BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [x] all canonical vessel classes plus default fallback are implemented
- [x] registry is frozen or immutable during render-frame use
- [x] class fallback logic is verified
- [x] visibilityClass constraints are enforced
- [x] density-pressure suppression is visual-only
- [x] wake presentation fields cannot mutate WakeAuthority
- [x] motion presentation fields cannot mutate AISRuntime or continuity systems
- [x] MarineRenderer consumes the registry through MapStyleManifest
- [x] debug tooling can table all vessel classes
- [x] visual differentiation is observable at close zoom
- [x] far-light presentation is subtle at distance
- [x] hover-card timing can be tuned visually without changing semantic payload
- [x] anti-urgency far-light doctrine is included
- [x] non-narrative density suppression doctrine is included
- [x] scale multiplier usage guidance is defined

Current build status:

```text
BUILD
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
- urgency signaling
- narrative prioritization
- semantic event ranking

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
- semantic urgency overlays
- maritime narrative event highlighting

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
_wos.maritimeStyle.twinkleProfile()
_wos.maritimeStyle.scaleUsage()
```

---

# 🧱 NEXT SPECIFICATION

Recommended next specification:

```text
0525C_WOS_LiveStylePanel_v1.0.0
```

Reason:

With global presentation governance and maritime symbolic presentation stabilized, the next risk domain is live tooling.

Live tooling must remain:

- developer-facing
- presentation-only
- single-authority
- non-runtime-mutating
- non-orchestrating

Alternative next specification:

```text
0525E_WOS_MaritimeHoverCardPresentation_v1.0.0
```

if hover-card persistence and card behavior become the next immediate UX priority.

---

# 📊 FINAL STATUS

```text
0525B_WOS_MaritimeStyleRegistry_v1.0.1
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
bounded-maritime-symbolic-presentation-registry
```

Build Scope:

```text
vessel-class style resolution, far-light presentation, wake visual styling, motion presentation, hover-card visual treatment, density suppression
```

Final instruction:

```text
Proceed to implementation or downstream 0525C live style tooling specification.
```
