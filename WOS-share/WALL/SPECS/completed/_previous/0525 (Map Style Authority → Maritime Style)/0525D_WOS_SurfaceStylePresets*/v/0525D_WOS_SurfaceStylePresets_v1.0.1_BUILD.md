---
layout: spec

title: "WOS Surface Style Presets"
date: 2026-05-26
doc_id: "0525D_WOS_SurfaceStylePresets_v1.0.1"
version: "1.0.1"

project: "Wall of Sound"
system: "WOS"

domain: "interpretation"
component: "SurfaceStylePresetRuntime"

type: "runtime-interpretation-spec"
status: "approved"

priority: "high"
risk: "medium"

classification: "presentation-layer"

summary: "Defines immutable named atmospheric presentation presets layered between base style registries and live developer overrides, with runtime-safe manifest composition and protected built-in preset identities."

doctrine:
  - "2D owns truth"
  - "2.5D owns presentation"
  - "Presets describe presentation identity"
  - "Presets do not create simulation truth"
  - "Live overrides remain ephemeral"
  - "Preset mutation after registration is forbidden"
  - "Maritime preset modifiers scale class identity; they do not replace it"

depends_on:
  - "0525A_WOS_MapStyleAuthority_v1.0.2"
  - "0525B_WOS_MaritimeStyleRegistry_v1.0.1"
  - "0525C_WOS_LiveStylePanel_v1.0.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"

enables:
  - "0525E_WOS_VisibilityClassRuntime_v1.0.0"
  - "0525F_WOS_HarborReadabilityPresets_v1.0.0"
  - "0525G_WOS_PresentationPresetSerialization_v1.0.0"

tags:
  - "surface"
  - "presets"
  - "presentation"
  - "manifest"
  - "atmosphere"
  - "maritime"
  - "style"
  - "identity"
  - "runtime-safe"

supersedes:
  - "0525D_WOS_SurfaceStylePresets_v1.0.0"

owner: "StudioRich / WOS"

stage: "[BUILD]"
freeze_decision: "GO"
build_scope: "immutable-surface-style-preset-runtime"
---

# 🚦 SPEC STAGE

Stage: [BUILD]  
Freeze Decision: GO  
Action: Establish immutable named atmospheric presentation presets above base registries and below live developer overrides.

---

# 0525D_WOS_SurfaceStylePresets_v1.0.1_BUILD

## Canonical Artifact Rule

This is the full standalone canonical BUILD artifact for `0525D_WOS_SurfaceStylePresets_v1.0.1`.

This document supersedes the earlier abbreviated v1.0.0 artifact.

It integrates the actual implemented build surface:

- `surfaceStylePresetRuntime.js`
- `surfaceStylePresetDebug.js`
- built-in protected presets
- maritime modifier multipliers
- manifest extension fields
- debug namespace `_wos.presets`
- correct script load order after 0525A/0525B and before 0525C

Partial patch-only releases are forbidden after this version.

---

# 🎯 PURPOSE

Define the canonical preset system for WOS presentation-layer styling.

This specification formalizes:

- reusable atmospheric world presets
- named Surface visual identities
- preset composition governance
- runtime-safe style switching
- immutable preset storage
- mapStyle preset merging
- maritime class modifier scaling
- protected built-in presets
- manifest extension fields
- diagnostic tooling

The goal is to transition WOS from:

```text
manual live tuning
```

toward:

```text
named atmospheric identities
```

without sacrificing constitutional rendering authority.

---

# 🧠 CORE DOCTRINE

```text
Presets describe presentation identity.

They do NOT create simulation truth.
```

Presets may influence:

- mood
- readability
- density feel
- cinematic tone
- atmospheric interpretation
- vessel symbolism
- visual pacing impression
- far-light behavior
- wake visual strength
- hover-card presentation

Presets may NEVER influence:

- AIS truth
- vessel state
- continuity cadence
- dead reckoning
- collision
- route topology
- entity lifecycle
- simulation authority
- wake persistence truth
- visibilityClass assignment
- camera target selection
- scheduler timing
- overlay semantic meaning

---

# 🧭 ARCHITECTURAL PLACEMENT

Canonical placement:

```text
SurfaceRuntime
→ SurfaceStylePresetRuntime
→ MapStyleAuthority
→ MapStyleManifest / PresentationManifest
→ MarineRenderer
```

LiveStylePanel exists below presets:

```text
Base Registry
→ Surface Preset
→ Live Override
→ Manifest
```

NOT:

```text
Live Override
→ Preset Mutation
```

Presets are reusable named presentation identities.

Live overrides are temporary developer edits.

---

# 🧱 CANONICAL RUNTIME LAYERS

## Layer 1 — Base Registry

Owned by:

```text
MapStyleAuthority
MaritimeStyleRegistry
```

Defines:

```text
default presentation truth
```

The base registry is the canonical foundation.

---

## Layer 2 — Surface Preset

Owned by:

```text
SurfaceStylePresetRuntime
```

Defines:

```text
named atmospheric identity
```

Examples:

```text
QUIET_HARBOR
MIDNIGHT_FREIGHT
SIGNAL_DRIFT
BROADCAST_FAILURE
```

---

## Layer 3 — Live Override

Owned by:

```text
LiveStylePanel
```

Defines:

```text
temporary developer tuning
```

Live overrides are:

- ephemeral
- single-writer
- visible
- non-persistent
- subordinate to preset governance
- applied through MapStyleAuthority only

---

# 🔁 PRECEDENCE CHAIN

Canonical precedence:

```text
Base Registry
→ Active Surface Preset
→ Active Live Override
→ Visibility Envelope
→ Immutable Manifest Freeze
```

Higher layers may override lower layers.

Lower layers may never override higher layers.

Visibility envelope remains last because visibility authority belongs upstream to AtmosphericReadability.

---

# 🏛️ AUTHORITY BOUNDARIES

## SurfaceStylePresetRuntime Owns

- preset registration
- preset validation
- active preset selection
- immutable preset storage
- preset lookup
- preset composition
- mapStyle preset merging
- maritime modifier scaling
- active preset diagnostics
- protected built-in preset governance
- presentation manifest extension

---

## SurfaceStylePresetRuntime May Observe

- active MapStyleManifest
- active live override
- MapStyleAuthority registry output
- MaritimeStyleRegistry registry output
- SurfaceRuntime selected identity
- visibilityClass value passed into manifest generation
- presentation debug state

Observation does not grant mutation authority.

---

## SurfaceStylePresetRuntime May Not Mutate

- AISRuntime
- MaritimeContinuityEngine
- AtmosphericReadability
- WakeAuthority
- PopulationHierarchy
- ContinuityDensity
- MarineRenderer internals
- Mapbox state
- route truth
- world coordinates
- vessel state
- SurfaceRuntime orchestration state
- Channel runtime state
- LiveStylePanel draft state

---

# 📦 SURFACE STYLE PRESET SCHEMA

```ts
type SurfacePresetCategory =
  | "QUIET_HARBOR"
  | "MIDNIGHT_FREIGHT"
  | "SIGNAL_DRIFT"
  | "BROADCAST_FAILURE"
  | "CUSTOM";

type SurfacePresetProvenance =
  | "BUILT_IN"
  | "USER"
  | "SERIALIZED"
  | "DEBUG";

type SurfaceStylePreset = {
  readonly presetId: string;
  readonly version: string;
  readonly category: SurfacePresetCategory;
  readonly displayName: string;
  readonly description: string;
  readonly provenance: SurfacePresetProvenance;
  readonly protected: boolean;
  readonly tags: readonly string[];
  readonly author: string;
  readonly createdAtMs: number;

  readonly mapStyle: {
    readonly water?: Partial<WaterStyle>;
    readonly land?: Partial<LandStyle>;
    readonly roads?: Partial<RoadStyle>;
    readonly labels?: Partial<LabelStyle>;
    readonly atmosphere?: Partial<AtmosphereStyle>;
    readonly overlays?: Partial<OverlayStyle>;
  };

  readonly maritimeModifiers: {
    readonly farLightAlphaScale?: number;
    readonly twinkleStrengthScale?: number;
    readonly wakeAlphaScale?: number;
    readonly hoverCardAlphaScale?: number;
    readonly densitySuppressionScale?: number;
  };

  readonly metadata: {
    readonly intendedZoomRange?: readonly [number, number];
    readonly cinematicBias?: number;
    readonly readabilityBias?: number;
    readonly densityBias?: number;
    readonly performanceTier?: string;
  };
};
```

---

# 🧬 MARITIME MODIFIER DOCTRINE

Maritime preset values are multipliers.

They are NOT replacements.

This preserves 0525B class identity.

Canonical rule:

```text
Surface presets modulate vessel class identity.
They do not erase vessel class identity.
```

Allowed maritime modifier keys:

```text
farLightAlphaScale
twinkleStrengthScale
wakeAlphaScale
hoverCardAlphaScale
densitySuppressionScale
```

All modifiers must remain in:

```text
0.0 → 1.0
```

Modifier behavior:

- `farLightAlphaScale` scales `lighting.farLightAlpha`
- `twinkleStrengthScale` scales `lighting.twinkleStrength`
- `wakeAlphaScale` scales `wakePresentation.visualAlphaMultiplier`
- `hoverCardAlphaScale` scales hover-card alpha-related visual softness
- `densitySuppressionScale` scales density-response suppression values

Presets may suppress or soften.

Presets may not elevate urgency semantics.

---

# 🧊 IMMUTABLE PRESET RULE

All accepted presets must be deeply frozen.

Required:

```js
deepFreeze(preset)
```

after validation.

Renderer mutation is forbidden.

Preset mutation after registration is forbidden.

Protected built-in presets may not be overwritten.

---

# 🧰 REQUIRED PUBLIC API

## registerPreset(preset)

Registers immutable preset.

Validation required before acceptance.

Duplicate IDs forbidden.

Protected built-in preset IDs may not be overwritten.

---

## getPreset(presetId)

Returns immutable preset or `null`.

---

## getAllPresets()

Returns readonly preset list.

---

## setActivePreset(presetId)

Activates one preset.

Only one preset may be active.

---

## clearActivePreset()

Returns preset runtime to base registry identity.

---

## getActivePreset()

Returns active preset or `null`.

---

## resolvePresentationManifest(simMs, visibilityClass, nowMs?)

Generates a presentation manifest by:

1. calling `SBE.MapStyleAuthority.generateManifest()`
2. applying active preset mapStyle layer merges
3. applying maritime modifier multipliers over resolved maritime registry
4. preserving active live override behavior from MapStyleAuthority
5. returning an immutable extended PresentationManifest

---

# 📜 PRESENTATION MANIFEST EXTENSION

SurfaceStylePresetRuntime returns a manifest extending the MapStyleAuthority manifest shape.

Required extension fields:

```ts
type PresentationManifest = MapStyleManifest & {
  readonly presentationManifestId: string;
  readonly presetId: string | null;
  readonly presetCategory: SurfacePresetCategory | null;
  readonly presetDisplayName: string | null;
  readonly sspr_version: "1.0.0";
};
```

The manifest remains immutable.

The manifest remains presentation-only.

The manifest is not runtime truth.

---

# 🌫️ VISIBILITY ENVELOPE RULE

Visibility authority remains owned by:

```text
AtmosphericReadability
```

Presets may tighten atmosphere.

Presets may NOT reveal hidden vessels.

Presets may NOT assign visibilityClass.

Presets may NOT override `ATMOSPHERIC_HIDDEN`.

Canonical order:

```text
Base Registry
→ Active Surface Preset
→ Live Override
→ Visibility Envelope
→ Immutable Manifest Freeze
```

---

# 🎨 BUILT-IN PRESETS

The runtime must provide four protected built-in presets.

## QUIET_HARBOR

Category:

```text
QUIET_HARBOR
```

Intent:

```text
Pre-dawn stillness; muted, ambient vessel presence; soft reflection.
```

Expected behavior:

- soft atmosphere
- reduced vessel aggression
- quiet far lights
- moderate water reflection
- low visual pressure
- high calmness

---

## MIDNIGHT_FREIGHT

Category:

```text
MIDNIGHT_FREIGHT
```

Intent:

```text
Industrial deep-night; high contrast; cargo/tanker dominant; wakes prominent.
```

Expected behavior:

- darker harbor
- stronger industrial contrast
- more prominent wakes
- heavier cargo/tanker presence
- higher coastline drama

---

## SIGNAL_DRIFT

Category:

```text
SIGNAL_DRIFT
```

Intent:

```text
Degraded AIS; fog rising; vessels uncertain; maximum density suppression.
```

Expected behavior:

- fog-forward atmosphere
- uncertain vessel presence
- softened labels
- density suppression emphasized
- far lights subdued
- signal-loss mood without changing AIS truth

---

## BROADCAST_FAILURE

Category:

```text
BROADCAST_FAILURE
```

Intent:

```text
Near-collapse; system losing coherence; almost everything suppressed.
```

Expected behavior:

- highly suppressed visuals
- minimal vessel presence
- strong atmosphere
- low hover-card assertiveness
- system-failure tone without runtime mutation

---

# 🧪 PRESET VALIDATION

Required validation:

## 1. Allowed Key Validation

Unknown keys rejected.

Allowed top-level preset keys only:

```text
presetId
version
category
displayName
description
provenance
protected
tags
author
createdAtMs
mapStyle
maritimeModifiers
metadata
```

---

## 2. MapStyle Key Validation

Only known mapStyle layer keys allowed:

```text
water
land
roads
labels
atmosphere
overlays
```

Unknown layer keys rejected.

---

## 3. Maritime Modifier Validation

Only known maritime modifier keys allowed:

```text
farLightAlphaScale
twinkleStrengthScale
wakeAlphaScale
hoverCardAlphaScale
densitySuppressionScale
```

All values must be finite numbers in:

```text
0.0 → 1.0
```

---

## 4. Governance Validation

Forbidden runtime domains blocked.

Presets may not define:

```text
AIS cadence
visibilityClass
dead reckoning
world coordinates
entity state
wake persistence
scheduler timing
camera target
overlay semantics
```

---

## 5. Deep Freeze Validation

All accepted presets must become immutable.

---

# ❌ FAILURE HANDLING

Invalid presets are:

```text
rejected completely
```

Partial acceptance is forbidden.

Duplicate IDs are rejected.

Built-in protected IDs may not be overwritten.

Validation failure must log through:

```text
[SurfaceStylePresetRuntime]
```

---

# 🔍 DEBUG API

Debug namespace:

```ts
_wos.presets
```

Required methods:

```ts
_wos.presets.catalog()
_wos.presets.inspect(id)
_wos.presets.diff(a, b)
_wos.presets.activatePreset(id)
_wos.presets.clearPreset()
_wos.presets.activePreset()
_wos.presets.resolveManifest(simMs?)
_wos.presets.maritimeModifierPreview(presetId, vesselClass)
_wos.presets.validateAll()
_wos.presets.constants()
```

---

# 🧪 REQUIRED DIAGNOSTICS

`[SurfaceStylePresetRuntime]` must report:

- preset registration
- validation failures
- active preset changes
- duplicate IDs
- invalid domains
- composition failures
- manifest resolution failures

Debug tools must expose:

- all preset IDs
- active preset marker
- preset category
- provenance
- map layers touched
- maritime modifier count
- protected status

---

# 🧭 SCRIPT LOAD ORDER

Required load order:

```text
maritimeStyleRegistry.js
maritimeStyleRegistryDebug.js
mapStyleAuthority.js
mapStyleAuthorityDebug.js
surfaceStylePresetRuntime.js
surfaceStylePresetDebug.js
liveStylePanel.js
maritimeOccupancyRenderer.js
```

Core runtime dependencies must load before `surfaceStylePresetRuntime.js`.

LiveStylePanel must load after preset runtime so it can inspect active preset context.

---

# 🚫 SECURITY / MUTATION BOUNDARY

Renderer-local preset mutation is forbidden.

Forbidden:

```js
MarineRenderer.style = ...
```

Forbidden:

```js
renderer.overrideFog()
```

All presentation changes must resolve through:

```text
SurfaceStylePresetRuntime
→ MapStyleAuthority
→ PresentationManifest
→ Renderer consumption
```

---

# 🛰️ OBSERVABILITY IMPACT

SurfaceStylePresetRuntime makes visual identity observable and repeatable.

It improves:

- atmospheric consistency
- preset recall
- debugging
- stream identity
- harbor mood transitions
- class-preserving visual variation

It must not:

- create tactical state
- encode narrative priority
- mutate runtime truth
- hide vessels illegally
- override visibility class
- become scheduler authority

---

# 🚫 NON-GOALS

This specification is NOT responsible for:

- production preset persistence
- preset file serialization
- user-facing theme marketplaces
- weather simulation
- visibilityClass assignment
- camera choreography
- scheduler sequencing
- audio-reactive modulation
- semantic overlay meaning
- runtime AIS mutation
- live style draft editing

---

# ⏸️ DEFERRED SYSTEMS

Deferred:

- animated preset transitions
- preset serialization
- user-created preset library
- audio-reactive preset modulation
- weather-driven preset switching
- Surface channel scheduling
- preset approval workflow
- preset inheritance trees
- external preset import/export

---

# 📚 CANONICAL REFERENCES

- 0525A_WOS_MapStyleAuthority_v1.0.2
- 0525B_WOS_MaritimeStyleRegistry_v1.0.1
- 0525C_WOS_LiveStylePanel_v1.0.1
- 0523E_WOS_MaritimeAtmosphericReadability_v1.2.0
- 0523F_WOS_MaritimeContinuityDensity_v1.2.0
- WOS Naming Doctrine
- WOS Surface / Channel Doctrine
- WOS Constitutional Spec Template v2.0.1

---

# 💬 IMPLEMENTATION NOTES

Required files:

```text
wall/systems/presentation/surfaceStylePresetRuntime.js
wall/systems/presentation/surfaceStylePresetDebug.js
```

Required debug namespace:

```text
_wos.presets
```

Implementation must preserve:

- immutable preset registration
- protected built-in presets
- single active preset
- full manifest immutability
- maritime modifier multiplication
- MapStyleAuthority dependency
- LiveStylePanel subordinate override behavior

---

# 📊 FINAL STATUS

```text
0525D_WOS_SurfaceStylePresets_v1.0.1
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
immutable-surface-style-preset-runtime
```

Build Scope:

```text
protected built-in presets, active preset selection, map style merging, maritime modifier scaling, presentation manifest extension, debug catalog tooling
```

Final instruction:

```text
Proceed to 0525E VisibilityClassRuntime.
```
