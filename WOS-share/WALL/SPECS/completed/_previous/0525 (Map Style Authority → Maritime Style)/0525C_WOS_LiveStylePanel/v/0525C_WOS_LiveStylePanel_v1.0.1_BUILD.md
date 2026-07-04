---
layout: spec

title: "WOS Live Style Panel"
date: 2026-05-26
doc_id: "0525C_WOS_LiveStylePanel_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "interaction"
component: "LiveStylePanel"

type: "tooling-spec"
status: "approved"

priority: "high"
risk: "high"

classification: "support-system"

summary: "Defines the developer-facing live presentation tuning panel for WOS style registries, constrained to presentation-only edits, single-writer override governance, explicit validation allowlists, and non-runtime-mutating visual iteration."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Live tooling may tune appearance; it may not mutate reality"
  - "Developer iteration is not runtime authority"
  - "One active override authority at a time"
  - "Temporary tuning is not production preset approval"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
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
  - "single-writer"

supersedes:
  - "0525C_WOS_LiveStylePanel_v1.0.0"

owner: "StudioRich / WOS"

stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "developer-facing-presentation-tuning-panel"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Approved for production development as a bounded, developer-only live presentation override panel.

---

# 0525C_WOS_LiveStylePanel_v1.0.1_BUILD

## Canonical Artifact Rule

This is the full standalone canonical BUILD artifact for `0525C_WOS_LiveStylePanel_v1.0.1`.

This document is reconstructable without prior versions.

It fully integrates:

- `0525C_WOS_LiveStylePanel_v1.0.0`
- 0525A v1.0.2 frozen override API dependency
- full `StyleOverride` type definition
- `isAllowedStyleField()`
- `getAllowedFieldsForTarget()`
- `convertDraftToStyleOverride()`
- per-section maritime allowed-field mapping
- map style field-schema guidance
- `Date.now()` tooling determinism exception
- draft lifecycle cleanup rules
- debug API return specifications
- renderer diagnostic-only observation doctrine
- strict separation between temporary tuning and production preset approval

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

through:

```text
SBE.MapStyleAuthority.setSingleLiveOverride()
```

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
- MarineRenderer internals

---

## 4. Debug Defaults Must Not Become Production Truth

A value tuned in the LiveStylePanel is temporary until explicitly serialized by a future approved preset serialization path.

Panel edits are:

```text
ephemeral by default
```

They become canonical only through:

```text
explicit PresentationPresetSerialization workflow
```

Temporary tuning and production preset approval are strictly separate workflows.

---

## 5. UI Must Reveal Authority State

The panel must clearly show whether edits are:

- inactive
- draft-only
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

Renderer observation is diagnostic only and may not automatically adapt presentation behavior.

---

## This Specification Produces

LiveStylePanel may produce:

```ts
StyleOverrideDraft
StyleOverride
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

Approved path:

```text
LiveStylePanel
→ StyleOverrideDraft
→ Validation
→ StyleOverride
→ MapStyleAuthority.setSingleLiveOverride()
→ MapStyleManifest
→ MarineRenderer
```

Forbidden path:

```text
LiveStylePanel
→ direct MarineRenderer mutation
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
- StyleOverride
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

```ts
type StylePanelMode =
  | "INACTIVE"
  | "DRAFT"
  | "LIVE_OVERRIDE"
  | "INVALID"
  | "SERIALIZATION_CANDIDATE";
```

## INACTIVE

No override is active.

Panel may inspect current registry values.

Panel may stage draft values.

## DRAFT

User has changed values locally but has not applied.

Draft values are not active.

Draft values are visibly marked as unapplied.

## LIVE_OVERRIDE

A single override is active through MapStyleAuthority.

Panel must display:

- target layer
- changed fields
- provenance
- expiration state
- reset control

## INVALID

Draft contains blocked fields or invalid values.

Panel must display:

- field error
- authority reason
- allowed range if applicable
- no apply action

## SERIALIZATION_CANDIDATE

A live or draft override may be prepared for future preset serialization.

This mode does not itself serialize.

Actual persistence is deferred to:

```text
0525G_WOS_PresentationPresetSerialization_v1.0.0
```

---

# 📦 DATA MODEL

```ts
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
  readonly pendingImplementation?: boolean;
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
const LIVE_STYLE_PANEL_VERSION = "1.0.1";

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

---

# ⏱️ DETERMINISM NOTE

LiveStylePanel is a developer tool, not a runtime system.

Draft IDs and draft timestamps may use:

```ts
Date.now()
```

as tooling identifiers only.

This is an intentional exception to runtime determinism doctrine because:

- drafts are ephemeral tooling records
- draft timestamps do not affect runtime truth
- draft timestamps do not affect replay compatibility
- live tuning is not applied in deterministic replay mode
- production presets require separate serialization governance

Runtime systems must not consume LiveStylePanel wall-clock timestamps as authority.

---

# 🧹 DRAFT LIFECYCLE

`DEFAULT_DRAFT_EXPIRATION_MS = null` means drafts do not auto-expire in v1.0.1.

Drafts are cleared when:

- user explicitly clears the draft
- panel is closed without serialization candidate preservation
- another override authority becomes active
- active Surface changes and panel does not preserve draft context
- developer calls reset/clear
- validation context becomes stale

Future versions may introduce auto-expiration.

v1.0.1 does not require it.

---

# 🎚️ ALLOWED FIELD MAPS

## Map Layer Allowed Fields

```ts
const MAP_LAYER_ALLOWED_FIELDS: Record<MapStyleLayerKey, string[]> = {
  water: [
    "baseColor",
    "shimmerStrength",
    "reflectionOpacity",
    "currentBandAlpha",
    "coastlineContrast",
    "harborDarkness",
  ],

  land: [
    "landColorHex",
    "districtContrast",
    "coastlineVisibility",
    "infrastructureShadowStrength",
    "nighttimeDarkness",
  ],

  roads: [
    "arterialOpacity",
    "localRoadOpacity",
    "glowStrength",
    "labelSuppression",
    "nighttimeFade",
  ],

  labels: [
    "density",
    "opacity",
    "suppressionStrength",
  ],

  atmosphere: [
    "fogAlpha",
    "hazeStrength",
    "grainOpacity",
    "glowRadius",
    "bloomSoftness",
  ],

  overlays: [
    "hudOpacity",
    "scannerStrength",
    "typographyGlow",
    "telemetrySoftness",
    "noiseSuppression",
  ],
};
```

`atmosphere.visibilityFalloffKm` is intentionally excluded.

Reason:

```text
visibilityFalloffKm risks semantic overlap with AtmosphericReadability distance authority.
```

---

## Maritime Section Allowed Fields

```ts
const MARITIME_SECTION_ALLOWED_FIELDS: Record<
  MaritimeStyleSectionKey,
  string[]
> = {
  symbolic: [
    "hullColorHex",
    "deckColorHex",
    "accentColorHex",
    "strokeWidthPx",
    "compactScaleMultiplier",
    "detailedScaleMultiplier",
    "silhouetteWeight",
    "markerRadiusPx",
  ],

  lighting: [
    "farLightAlpha",
    "farLightHaloPx",
    "twinkleStrength",
    "twinkleRateHz",
    "lowVisibilityDamping",
    "classTintStrength",
  ],

  wakePresentation: [
    "visualAlphaMultiplier",
    "edgeSoftnessScalar",
    "classTintStrength",
    "densitySuppressionStrength",
  ],

  motionPresentation: [
    "headingVisualSmoothing",
    "visualEasingMs",
  ],

  hoverCardPresentation: [
    "backgroundAlpha",
    "borderAlpha",
    "borderRadiusPx",
    "classAccentStrength",
    "glowStrength",
    "fadeInMs",
    "holdMs",
    "fadeOutMs",
    "maxWidthPx",
  ],

  densityResponse: [
    "clutterSuppressionStrength",
    "farLightSuppressionStrength",
    "wakeSuppressionStrength",
    "labelVisualSuppressionStrength",
  ],
};
```

`densityResponse.labelVisualSuppressionStrength` may be exposed only if the renderer path consumes it.

If not implemented, the panel must mark it:

```text
pending implementation
```

rather than presenting it as an active visual control.

---

# 🧪 FIELD VALIDATION RULES

## Map Style Field Schemas

Map style field validation rules are derived from:

```text
0525A_WOS_MapStyleAuthority_v1.0.2
```

Fallback validation:

- fields ending in `Alpha`: `0.0 → 1.0`
- fields ending in `Opacity`: `0.0 → 1.0`
- fields ending in `Strength`: `0.0 → 1.0`
- color fields ending in `Color` or `Hex`: valid hex color string
- timing fields ending in `Ms`: non-negative finite number
- pixel fields ending in `Px`: non-negative finite number
- unknown fields: blocked

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
  targetLayerOrClass: string,
  maritimeSectionKey?: MaritimeStyleSectionKey
): StyleOverrideDraft {
  const nowMs = Date.now();

  return {
    draftId: `style-draft::${nowMs}`,
    targetDomain,
    targetLayer:
      targetDomain === "MAP"
        ? targetLayerOrClass as MapStyleLayerKey
        : undefined,
    maritimeClassKey:
      targetDomain === "MARITIME"
        ? targetLayerOrClass
        : undefined,
    maritimeSectionKey:
      targetDomain === "MARITIME"
        ? maritimeSectionKey
        : undefined,
    values: {},
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
  };
}

function getAllowedFieldsForTarget(
  targetDomain: StylePanelTargetDomain,
  targetLayer?: MapStyleLayerKey,
  maritimeSectionKey?: MaritimeStyleSectionKey
): string[] {
  if (targetDomain === "MAP") {
    if (!targetLayer) return [];
    return MAP_LAYER_ALLOWED_FIELDS[targetLayer] ?? [];
  }

  if (targetDomain === "MARITIME") {
    if (!maritimeSectionKey) return [];
    return MARITIME_SECTION_ALLOWED_FIELDS[maritimeSectionKey] ?? [];
  }

  return [];
}

function isAllowedStyleField(
  draft: StyleOverrideDraft,
  fieldKey: string
): boolean {
  const allowedFields = getAllowedFieldsForTarget(
    draft.targetDomain,
    draft.targetLayer,
    draft.maritimeSectionKey
  );

  return allowedFields.includes(fieldKey);
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
      continue;
    }

    const value = draft.values[fieldKey];

    if (fieldKey === "twinkleRateHz" && Number(value) > MAX_TWINKLE_RATE_HZ) {
      errors.push({
        fieldKey,
        message: "twinkleRateHz may not exceed 1.0 Hz.",
        authorityViolation: true,
      });
    }

    if (fieldKey === "holdMs" && Number(value) > MAX_HOVER_HOLD_MS) {
      errors.push({
        fieldKey,
        message: "hover hold may not exceed 3200ms.",
        authorityViolation: true,
      });
    }

    if (
      fieldKey.endsWith("Alpha") ||
      fieldKey.endsWith("Opacity") ||
      fieldKey.endsWith("Strength") ||
      fieldKey.endsWith("Damping")
    ) {
      const numericValue = Number(value);
      if (numericValue < MIN_ALPHA_VALUE || numericValue > MAX_ALPHA_VALUE) {
        errors.push({
          fieldKey,
          message: "Field must be between 0.0 and 1.0.",
          authorityViolation: false,
        });
      }
    }
  }

  return {
    pass: errors.length === 0,
    errors,
  };
}

function convertDraftToStyleOverride(
  draft: StyleOverrideDraft
): StyleOverride {
  if (draft.targetDomain !== "MAP") {
    throw new Error(
      "LiveStylePanel v1.0.1 may only apply MAP StyleOverride records directly to MapStyleAuthority. Maritime section edits require adapter support or future preset serialization."
    );
  }

  if (!draft.targetLayer) {
    throw new Error("MAP draft requires targetLayer.");
  }

  return {
    overrideId: `override::${draft.draftId}`,
    targetDomain: "MAP",
    targetLayer: draft.targetLayer,
    values: draft.values,
    createdAtMs: draft.createdAtMs,
    updatedAtMs: draft.updatedAtMs,
    expiresAtMs: null,
    provenance: DEFAULT_OVERRIDE_PROVENANCE,
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

# 🧭 MARITIME EDITING NOTE

v1.0.1 validates maritime style draft fields but does not directly apply nested maritime section edits into MapStyleAuthority as live overrides unless an adapter exists.

Reason:

0525A v1.0.2 freezes `StyleOverride` as a MAP-layer override type.

Maritime live editing requires one of:

- a future `MaritimeStyleOverride` type
- a MapStyleAuthority adapter that accepts nested maritime override targets
- preset serialization followed by registry reload

Until then, maritime controls may be staged, validated, previewed through debug tooling, or marked as serialization candidates.

They must not bypass MapStyleAuthority.

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
→ Valid MAP draft becomes StyleOverride
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
- pending implementation flags

The panel should distinguish visually between:

- base registry value
- draft value
- live override value
- blocked invalid value
- pending implementation value

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

Renderer observation is diagnostic only.

Renderer observation may not automatically adapt presentation behavior.

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

Temporary tuning and production preset approval must remain separate.

---

# 🧪 DEBUG API SPECIFICATIONS

```ts
_wos.liveStyle.open(): void
```

Opens the panel UI.

```ts
_wos.liveStyle.close(): void
```

Closes the panel UI.

```ts
_wos.liveStyle.snapshot(): StylePanelSnapshot
```

Returns current panel state.

```ts
_wos.liveStyle.createDraft(
  domain: StylePanelTargetDomain,
  target: string,
  maritimeSectionKey?: MaritimeStyleSectionKey
): StyleOverrideDraft
```

Creates a new draft.

```ts
_wos.liveStyle.setField(
  fieldKey: string,
  value: unknown
): void
```

Sets a field in the active draft.

```ts
_wos.liveStyle.validate(): StylePanelValidationResult
```

Validates current draft.

```ts
_wos.liveStyle.apply(): StylePanelValidationResult
```

Applies draft as live override if valid.

```ts
_wos.liveStyle.clear(): void
```

Clears active override.

```ts
_wos.liveStyle.inspectActiveOverride(): StyleOverride | null
```

Returns active override.

---

# 🧪 VALIDATION CHECKLIST

- [x] panel uses MapStyleAuthority public API only
- [x] panel never mutates runtime truth
- [x] panel never mutates MarineRenderer internals directly
- [x] only one active override can exist
- [x] active override state is visible
- [x] invalid fields are blocked
- [x] runtime fields are rejected
- [x] twinkleRateHz > 1.0 is rejected
- [x] hover hold > 3200ms is rejected
- [x] draft values are visibly distinct from live values
- [x] clear/reset control exists
- [x] serialization is deferred
- [x] panel cannot assign visibilityClass
- [x] panel cannot modify wake memory
- [x] panel cannot modify camera routing
- [x] panel cannot modify overlay semantic content
- [x] StyleOverride is defined
- [x] isAllowedStyleField is defined
- [x] convertDraftToStyleOverride is defined
- [x] draft lifecycle cleanup is defined
- [x] Date.now tooling exception is documented
- [x] renderer observation is diagnostic only
- [x] production preset approval is separate from temporary tuning

---

# ✅ BUILD READINESS CRITERIA

This spec is ready for BUILD when:

- [x] allowed field list is confirmed complete
- [x] blocked field list is confirmed complete
- [x] validation path rejects non-style fields
- [x] MapStyleAuthority single override API is the only write path
- [x] UI state clearly shows active override mode
- [x] clear override behavior is verified
- [x] panel works without direct renderer mutation
- [x] panel works without runtime mutation
- [x] debug-only status is explicit
- [x] future serialization is deferred cleanly
- [x] core helper functions are defined
- [x] upstream 0525A override API is frozen
- [x] override governance chain is frozen

Current build status:

```text
BUILD
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
- production preset approval

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
- direct maritime nested override adapter

---

# 📚 CANONICAL REFERENCES

- 0525A_WOS_MapStyleAuthority_v1.0.2
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

Implementation should begin as developer-only UI.

It should not be treated as production user interface.

---

# 🧱 NEXT SPECIFICATION

Recommended next specification:

```text
0525D_WOS_SurfaceStylePresets_v1.0.0
```

because the override governance chain is now frozen.

Alternative next specification:

```text
0525G_WOS_PresentationPresetSerialization_v1.0.0
```

if persistence becomes the next immediate concern.

---

# 📊 FINAL STATUS

```text
0525C_WOS_LiveStylePanel_v1.0.1
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
developer-facing-presentation-tuning-support-system
```

Build Scope:

```text
developer-only live presentation override panel, validation, active override visibility, reset/clear tooling
```

Final instruction:

```text
Override governance chain is frozen. Proceed to 0525D Surface Style Presets or 0525G Presentation Preset Serialization.
```
