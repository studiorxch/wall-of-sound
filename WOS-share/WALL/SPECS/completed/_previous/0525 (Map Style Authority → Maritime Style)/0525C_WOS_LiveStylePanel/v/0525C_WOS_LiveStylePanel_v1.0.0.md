---
layout: spec

title: "WOS Live Style Panel"
date: 2026-05-25
doc_id: "0525C_WOS_LiveStylePanel_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "interaction"
component: "LiveStylePanel"

type: "tooling-spec"
status: "review"

priority: "high"
risk: "high"

classification: "support-system"

summary: "Defines the developer-facing live presentation tuning panel for WOS style registries, constrained to presentation-only edits, single-writer override governance, and non-runtime-mutating visual iteration."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Live tooling may tune appearance; it may not mutate reality"
  - "Developer iteration is not runtime authority"
  - "One active override authority at a time"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.1"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523R_WOS_InfrastructureRegistry_v1.2.3"

enables:
  - "0525D_WOS_SurfaceStylePresets_v1.0.0"
  - "0525F_WOS_HarborReadabilityPresets_v1.0.0"
  - "0525G_WOS_PresentationPresetSerialization_v1.0.0"

tags:
  - "live-style"
  - "developer-tooling"
  - "presentation"
  - "override-governance"
  - "style-panel"
  - "debug-ui"
  - "surface-presets"

supersedes: []

owner: "StudioRich / WOS"

stage: "[REVIEW]"
freeze_decision: "REVIEW"
build_scope: "developer-facing-presentation-tuning-panel"
---

# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Define live presentation tuning tooling without granting runtime, renderer, camera, overlay semantic, or orchestration authority.

---

# 0525C_WOS_LiveStylePanel_v1.0.0

## Canonical Artifact Rule

This is a full standalone canonical review artifact.

This document defines the live developer-facing style tuning panel downstream of:

```text
0525A_WOS_MapStyleAuthority_v1.0.1
0525B_WOS_MaritimeStyleRegistry_v1.0.1
```

It does not replace either registry.

It defines a bounded tooling surface for editing presentation overrides.

Partial patch-only releases are forbidden after this version.

---

# 🎯 PURPOSE

Define the live style tuning panel for WOS presentation systems.

The LiveStylePanel exists so developers can tune atmospheric presentation values without editing renderer source code or modifying runtime truth.

It provides controlled live adjustment for:

- map style layers
- water style
- land style
- road visibility
- label visual suppression
- atmosphere style
- overlay visual softness
- maritime vessel style values
- far-light presentation
- wake visual presentation
- hover-card visual treatment
- density visual suppression

The panel exists to speed up:

```text
visual iteration
```

without creating:

```text
runtime authority
```

---

# 🧠 CORE PRINCIPLES

## 1. Live Tooling Is Not Runtime Authority

The LiveStylePanel is a development tool.

It may generate presentation overrides.

It may not mutate runtime systems.

Canonical rule:

```text
Live tooling may tune appearance.
It may not mutate reality.
```

---

## 2. One Active Override Authority

The live panel must obey the 0525A single-writer rule.

Only one active live override authority may exist at a time.

The panel may not stack multiple competing overrides.

It may not create hidden renderer-local mutations.

It may not create parallel override registries.

---

## 3. Presentation-Only Mutation

The LiveStylePanel may write only to:

```text
StyleOverride
```

or a successor presentation-only override record approved by MapStyleAuthority.

It may never write to:

- AISRuntime
- MaritimeContinuityEngine
- AtmosphericReadability
- WakeAuthority
- PopulationHierarchy
- ContinuityDensity
- ObservabilityCamera
- OverlayGrammar semantic schema
- scheduler state
- Surface orchestration state

---

## 4. Debug Defaults Must Not Become Production Truth

A value tuned in the LiveStylePanel is temporary until explicitly serialized by a future approved preset serialization path.

Panel edits are:

```text
ephemeral by default
```

They become canonical only through:

```text
explicit SurfaceRuntime or PresentationPresetSerialization workflow
```

---

## 5. UI Must Reveal Authority State

The panel must clearly show whether edits are:

- inactive
- live ephemeral override
- serialized preset candidate
- invalid
- blocked by governance rule

Hidden live mutations are forbidden.

Every active override must be visible.

---

# 🏛️ AUTHORITY BOUNDARIES

## This Specification Governs

LiveStylePanel owns:

- developer-facing presentation controls
- slider/input binding for style override values
- override draft staging
- validation before applying style overrides
- active override visibility
- reset/clear controls
- visual comparison tools
- export handoff to future preset serialization
- debugging display for current manifest/style state

---

## This Specification May Observe

LiveStylePanel may observe:

- MapStyleAuthority active manifest
- MapStyleAuthority active live override
- MaritimeStyleRegistry class styles
- style registry layer keys
- valid override provenance values
- current Surface preset identity
- renderer frame preview state
- debug-only presentation diagnostics

Observation does not grant runtime mutation authority.

---

## This Specification Produces

LiveStylePanel may produce:

```ts
StyleOverride
```

It may also produce:

```ts
StyleOverrideDraft
StylePanelValidationResult
StylePanelSnapshot
```

These artifacts are presentation tooling records only.

---

## This Specification Does NOT Govern

This specification does NOT govern:

- runtime truth
- AIS ingestion
- vessel positions
- vessel headings
- visibilityClass assignment
- wake persistence
- population tiering
- density calculation
- camera routing
- hero selection
- overlay semantic content
- scheduler transitions
- Surface identity
- Channel runtime behavior
- soundtrack pacing
- production preset serialization

---

# 🌊 CONTINUITY ROLE

LiveStylePanel participates in continuity only by preserving presentation consistency during live tuning.

It must avoid visual jumps, hidden state, or confusing panel behavior that causes developers to misread runtime state.

The panel supports continuity by:

- exposing active override state
- allowing safe reset
- validating allowed fields
- preventing runtime mutation
- preventing multiple override authorities
- preserving manifest-based presentation flow

It does not generate continuity.

It does not change continuity.

---

# 🧭 INTERPRETATION SEPARATION

## Runtime Truth

Owned by runtime systems.

The LiveStylePanel has no write path to runtime truth.

## Presentation Interpretation

Owned by:

- MapStyleAuthority
- MaritimeStyleRegistry
- MarineRenderer

The LiveStylePanel may request presentation override changes through approved public APIs only.

It must never bypass those APIs.

Approved path:

```text
LiveStylePanel
→ StyleOverrideDraft
→ Validation
→ MapStyleAuthority.setSingleLiveOverride()
→ MapStyleManifest
→ MarineRenderer
```

Forbidden path:

```text
LiveStylePanel
→ direct renderer mutation
```

Forbidden path:

```text
LiveStylePanel
→ runtime state mutation
```

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- MapStyleAuthority
- MaritimeStyleRegistry
- SurfaceRuntime
- MarineRenderer debug state
- presentation debug APIs

---

## Writes To

- MapStyleAuthority active live override through approved API only

---

## Produces

- StyleOverrideDraft
- StylePanelValidationResult
- StylePanelSnapshot

---

## Consumed By

- MapStyleAuthority
- future PresentationPresetSerialization
- development diagnostics

---

## Observed By

- developer console
- debug HUD
- future Surface preset tooling

---

## Forbidden Mutations

LiveStylePanel may never mutate:

- AISRuntime
- MaritimeContinuityEngine
- AtmosphericReadability
- MaritimeWakeAuthority
- MaritimePopulationHierarchy
- MaritimeContinuityDensity
- ObservabilityCamera target state
- OverlayGrammar semantic schema
- MarineRenderer internal state directly
- SurfaceRuntime orchestration state
- Channel runtime state
- soundtrack state

---

# 🧱 SINGLE-WRITER OVERRIDE GOVERNANCE

LiveStylePanel must enforce:

```text
one active override authority
```

If another override authority is active, the panel must:

- display the owner
- block conflicting edits
- offer read-only inspection
- avoid silent replacement
- require explicit clear/replace action

The panel may not stack edits.

The panel may not silently merge unrelated override sources.

---

# 🧪 LIVE EDITING MODES

## 1. Inactive Mode

No override is active.

Panel may inspect current registry values.

Panel may stage draft values.

---

## 2. Draft Mode

User has changed values locally but has not applied.

Draft values are not active.

Draft values are visibly marked as unapplied.

---

## 3. Live Override Mode

A single override is active through MapStyleAuthority.

Panel must display:

- target layer
- changed fields
- provenance
- expiration state
- reset control

---

## 4. Invalid Mode

Draft contains blocked fields or invalid values.

Panel must display:

- field error
- authority reason
- allowed range if applicable
- no apply action

---

## 5. Serialization Candidate Mode

A live or draft override may be prepared for future preset serialization.

This mode does not itself serialize.

Actual persistence is deferred to:

```text
0525G_WOS_PresentationPresetSerialization_v1.0.0
```

---

# 📦 DATA MODEL

```ts
type StylePanelMode =
  | "INACTIVE"
  | "DRAFT"
  | "LIVE_OVERRIDE"
  | "INVALID"
  | "SERIALIZATION_CANDIDATE";

type StylePanelTargetDomain =
  | "MAP"
  | "MARITIME";

type MapStyleLayerKey =
  | "water"
  | "land"
  | "roads"
  | "labels"
  | "atmosphere"
  | "overlays";

type MaritimeStyleSectionKey =
  | "symbolic"
  | "lighting"
  | "wakePresentation"
  | "motionPresentation"
  | "hoverCardPresentation"
  | "densityResponse";

type OverrideProvenance =
  | "DEBUG_TOOL"
  | "SURFACE_RUNTIME"
  | "TEMPORARY";

type StylePanelFieldType =
  | "number"
  | "color"
  | "enum"
  | "boolean";

type StylePanelFieldSchema = {
  readonly fieldKey: string;
  readonly label: string;
  readonly fieldType: StylePanelFieldType;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly enumValues?: readonly string[];
  readonly unitLabel?: string;
  readonly authorityNote: string;
  readonly requiresRestart: boolean;
};

type StyleOverrideDraft = {
  readonly draftId: string;
  readonly targetDomain: StylePanelTargetDomain;
  readonly targetLayer?: MapStyleLayerKey;
  readonly maritimeClassKey?: string;
  readonly maritimeSectionKey?: MaritimeStyleSectionKey;
  readonly values: Record<string, unknown>;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
};

type StylePanelValidationError = {
  readonly fieldKey: string;
  readonly message: string;
  readonly authorityViolation: boolean;
};

type StylePanelValidationResult = {
  readonly pass: boolean;
  readonly errors: readonly StylePanelValidationError[];
};

type StylePanelSnapshot = {
  readonly mode: StylePanelMode;
  readonly activeOverrideId: string | null;
  readonly targetDomain: StylePanelTargetDomain | null;
  readonly draft: StyleOverrideDraft | null;
  readonly validation: StylePanelValidationResult;
  readonly manifestId: string | null;
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const LIVE_STYLE_PANEL_VERSION = "1.0.0";

const MAX_ACTIVE_OVERRIDE_COUNT = 1;

const DEFAULT_OVERRIDE_PROVENANCE = "DEBUG_TOOL";

const DEFAULT_DRAFT_EXPIRATION_MS = null;

const FIELD_CHANGE_DEBOUNCE_MS = 120;

const SLIDER_PREVIEW_THROTTLE_MS = 80;

const MAX_NUMERIC_FIELD_VALUE = 9999;

const MIN_ALPHA_VALUE = 0.0;

const MAX_ALPHA_VALUE = 1.0;

const MAX_TWINKLE_RATE_HZ = 1.0;

const MAX_HOVER_HOLD_MS = 3200;
```

Constants are implementation baselines.

They may be tuned later but must not weaken authority boundaries.

---

# 🎚️ ALLOWED CONTROL GROUPS

## Map Style Controls

Allowed:

- water.baseColor
- water.shimmerStrength
- water.reflectionOpacity
- water.currentBandAlpha
- water.coastlineContrast
- water.harborDarkness
- land.landColorHex
- land.districtContrast
- land.coastlineVisibility
- land.infrastructureShadowStrength
- land.nighttimeDarkness
- roads.arterialOpacity
- roads.localRoadOpacity
- roads.glowStrength
- roads.labelSuppression
- roads.nighttimeFade
- labels.density
- labels.opacity
- labels.suppressionStrength
- atmosphere.fogAlpha
- atmosphere.hazeStrength
- atmosphere.grainOpacity
- atmosphere.glowRadius
- atmosphere.bloomSoftness
- overlays.hudOpacity
- overlays.scannerStrength
- overlays.typographyGlow
- overlays.telemetrySoftness
- overlays.noiseSuppression

---

## Maritime Style Controls

Allowed:

- symbolic.hullColorHex
- symbolic.deckColorHex
- symbolic.accentColorHex
- symbolic.strokeWidthPx
- symbolic.compactScaleMultiplier
- symbolic.detailedScaleMultiplier
- symbolic.silhouetteWeight
- symbolic.markerRadiusPx
- lighting.farLightAlpha
- lighting.farLightHaloPx
- lighting.twinkleStrength
- lighting.twinkleRateHz
- lighting.lowVisibilityDamping
- lighting.classTintStrength
- wakePresentation.visualAlphaMultiplier
- wakePresentation.edgeSoftnessScalar
- wakePresentation.classTintStrength
- wakePresentation.densitySuppressionStrength
- motionPresentation.headingVisualSmoothing
- motionPresentation.visualEasingMs
- hoverCardPresentation.backgroundAlpha
- hoverCardPresentation.borderAlpha
- hoverCardPresentation.borderRadiusPx
- hoverCardPresentation.classAccentStrength
- hoverCardPresentation.glowStrength
- hoverCardPresentation.fadeInMs
- hoverCardPresentation.holdMs
- hoverCardPresentation.fadeOutMs
- hoverCardPresentation.maxWidthPx
- densityResponse.clutterSuppressionStrength
- densityResponse.farLightSuppressionStrength
- densityResponse.wakeSuppressionStrength
- densityResponse.labelVisualSuppressionStrength

---

# 🚫 BLOCKED CONTROL GROUPS

The panel must not expose controls for:

- vessel position
- vessel heading truth
- vessel speed truth
- AIS confidence
- visibilityClass assignment
- wake segment count
- wake lifetime
- wake buffer size
- population tier
- clutter pressure calculation
- camera target
- camera route
- hero selection
- overlay semantic content
- scheduler time
- Surface transition timing
- Channel active state
- audio bus values
- soundtrack behavior

---

# 🧪 VALIDATION RULES

## Alpha Values

Fields ending in:

```text
Alpha
Opacity
Strength
Damping
```

usually clamp to:

```text
0.0 → 1.0
```

unless explicitly documented otherwise.

---

## Twinkle Rate

`twinkleRateHz` must not exceed:

```text
1.0 Hz
```

Reason:

Higher twinkle rates risk urgency semantics.

---

## Hover Hold

`hoverCardPresentation.holdMs` must not exceed:

```text
3200ms
```

Reason:

Longer holds become UI persistence or inspection behavior, not style.

---

## Runtime Field Blocking

Any field not explicitly listed as allowed must be rejected.

The validation error must include:

```text
authorityViolation: true
```

---

# 🔧 CORE FUNCTIONS

```ts
function createStyleOverrideDraft(
  targetDomain: StylePanelTargetDomain,
  targetLayerOrClass: string
): StyleOverrideDraft {
  return {
    draftId: `style-draft::${Date.now()}`,
    targetDomain,
    targetLayer:
      targetDomain === "MAP"
        ? targetLayerOrClass as MapStyleLayerKey
        : undefined,
    maritimeClassKey:
      targetDomain === "MARITIME"
        ? targetLayerOrClass
        : undefined,
    values: {},
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  };
}

function validateStyleOverrideDraft(
  draft: StyleOverrideDraft
): StylePanelValidationResult {
  const errors: StylePanelValidationError[] = [];

  for (const fieldKey of Object.keys(draft.values)) {
    if (!isAllowedStyleField(draft, fieldKey)) {
      errors.push({
        fieldKey,
        message: "Field is not owned by LiveStylePanel presentation authority.",
        authorityViolation: true,
      });
    }

    if (fieldKey === "twinkleRateHz") {
      const value = Number(draft.values[fieldKey]);
      if (value > 1.0) {
        errors.push({
          fieldKey,
          message: "twinkleRateHz may not exceed 1.0 Hz.",
          authorityViolation: true,
        });
      }
    }

    if (fieldKey === "holdMs") {
      const value = Number(draft.values[fieldKey]);
      if (value > 3200) {
        errors.push({
          fieldKey,
          message: "hover hold may not exceed 3200ms.",
          authorityViolation: true,
        });
      }
    }
  }

  return {
    pass: errors.length === 0,
    errors,
  };
}

function applyDraftAsLiveOverride(
  draft: StyleOverrideDraft
): StylePanelValidationResult {
  const validation = validateStyleOverrideDraft(draft);

  if (!validation.pass) {
    return validation;
  }

  const override = convertDraftToStyleOverride(draft);

  SBE.MapStyleAuthority.setSingleLiveOverride(override);

  return validation;
}

function clearLiveStyleOverride(): void {
  SBE.MapStyleAuthority.clearLiveOverride();
}
```

---

# 🔄 EXECUTION FLOW

Canonical live style flow:

```text
Developer opens LiveStylePanel
→ Panel reads MapStyleManifest
→ Panel reads active override state
→ Developer edits draft field
→ Draft validation runs
→ Invalid runtime fields are blocked
→ Valid draft becomes StyleOverride
→ MapStyleAuthority.setSingleLiveOverride()
→ MapStyleManifest regenerates
→ MarineRenderer consumes manifest
→ Panel displays active override state
```

Forbidden flow:

```text
LiveStylePanel
→ direct MarineRenderer mutation
```

Forbidden flow:

```text
LiveStylePanel
→ runtime system mutation
```

---

# 🖥️ UI REQUIREMENTS

The panel must show:

- current mode
- current target domain
- current target layer or class
- active override ID
- changed fields
- validation errors
- reset control
- clear override control
- current manifest ID
- serialized state status

The panel should distinguish visually between:

- base registry value
- draft value
- live override value
- blocked invalid value

---

# 🛰️ OBSERVABILITY IMPACT

LiveStylePanel improves observability for developers by making presentation state visible and tunable.

It must not improve runtime observability by secretly altering runtime systems.

The panel may help answer:

- which style layer is active?
- what override is applied?
- why is this value blocked?
- what manifest is being consumed?
- what changed visually?

It may not answer by mutation:

- where should the camera go?
- which vessel matters?
- which vessel should be visible?
- what is the true vessel heading?
- how dense is the harbor really?

---

# 🎼 ORCHESTRATION NOTES

LiveStylePanel does not orchestrate WOS.

It does not schedule transitions.

It does not select Surface identity.

It does not activate Channel state.

It does not serialize production presets by itself.

Future serialization belongs to:

```text
0525G_WOS_PresentationPresetSerialization_v1.0.0
```

---

# 🧪 VALIDATION CHECKLIST

- [ ] Panel uses MapStyleAuthority public API only
- [ ] Panel never mutates runtime truth
- [ ] Panel never mutates MarineRenderer internals directly
- [ ] Only one active override can exist
- [ ] Active override state is visible
- [ ] Invalid fields are blocked
- [ ] Runtime fields are rejected
- [ ] twinkleRateHz > 1.0 is rejected
- [ ] hover hold > 3200ms is rejected
- [ ] Draft values are visibly distinct from live values
- [ ] Clear/reset control exists
- [ ] Serialization is deferred
- [ ] Panel cannot assign visibilityClass
- [ ] Panel cannot modify wake memory
- [ ] Panel cannot modify camera routing
- [ ] Panel cannot modify overlay semantic content

---

# ✅ BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [ ] allowed field list is confirmed complete
- [ ] blocked field list is confirmed complete
- [ ] validation path rejects non-style fields
- [ ] MapStyleAuthority single override API is the only write path
- [ ] UI state clearly shows active override mode
- [ ] clear override behavior is verified
- [ ] panel works without direct renderer mutation
- [ ] panel works without runtime mutation
- [ ] debug-only status is explicit
- [ ] future serialization is deferred cleanly

Current build status:

```text
REVIEW
```

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- production preset persistence
- Surface preset schema
- user-facing theme editor
- runtime simulation control
- camera scripting
- overlay semantic editing
- AIS debugging
- maritime route editing
- soundtrack mixing
- scheduler programming
- environment simulation
- vessel taxonomy editing
- wake authority editing
- visibilityClass editing

---

# ⏸️ DEFERRED SYSTEMS

The following systems are deferred:

- PresentationPresetSerialization
- SurfaceStylePresets
- user-facing style editor
- preset diff viewer
- style history timeline
- collaborative style editing
- remote style sync
- production approval workflow
- undo stack
- visual A/B comparison mode
- style preset marketplace
- audio-reactive style modulation

---

# 📚 CANONICAL REFERENCES

- 0525A_WOS_MapStyleAuthority_v1.0.1
- 0525B_WOS_MaritimeStyleRegistry_v1.0.1
- 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- WOS Naming Doctrine
- WOS Surface / Channel Doctrine
- WOS Constitutional Spec Template v2.0.1

---

# 💬 IMPLEMENTATION NOTES

Recommended implementation target:

```text
wall/ui/liveStylePanel.js
```

Alternative implementation target:

```text
wall/systems/presentation/liveStylePanel.js
```

Recommended debug namespace:

```ts
_wos.liveStyle
```

Recommended public debug APIs:

```ts
_wos.liveStyle.open()
_wos.liveStyle.close()
_wos.liveStyle.snapshot()
_wos.liveStyle.createDraft(domain, target)
_wos.liveStyle.setField(fieldKey, value)
_wos.liveStyle.validate()
_wos.liveStyle.apply()
_wos.liveStyle.clear()
_wos.liveStyle.inspectActiveOverride()
```

Implementation should begin as developer-only UI.

It should not be treated as production user interface.

---

# 🧱 NEXT SPECIFICATION

Recommended next specification:

```text
0525D_WOS_SurfaceStylePresets_v1.0.0
```

only after 0525C review confirms:

- live tooling does not create authority leakage
- override governance is sufficient
- serialization remains deferred
- panel behavior is fully visible and reversible

Alternative next specification:

```text
0525G_WOS_PresentationPresetSerialization_v1.0.0
```

if persistence becomes the next immediate concern.

---

# 📊 FINAL STATUS

```text
0525C_WOS_LiveStylePanel_v1.0.0
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
developer-facing-presentation-tuning-support-system
```

Build Scope:

```text
developer-only live presentation override panel, validation, active override visibility, reset/clear tooling
```

Final instruction:

```text
Submit for architecture and governance review before implementation.
```
