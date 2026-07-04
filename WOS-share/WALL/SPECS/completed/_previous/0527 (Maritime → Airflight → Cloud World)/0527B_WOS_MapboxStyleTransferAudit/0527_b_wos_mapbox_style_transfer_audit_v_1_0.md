# 🚦 SPEC STAGE

Stage: [BUILD]
Freeze Decision: GO
Action: Execute Mapbox style transfer audit before any additional atmosphere or wake expansion.

---

# 0527B_WOS_MapboxStyleTransferAudit_v1.0.0

---

layout: spec

title: "WOS Mapbox Style Transfer Audit"
date: 2026-05-27
doc_id: "0527B_WOS_MapboxStyleTransferAudit_v1.0.0"
version: "1.0.0"

project: "Wall of Sound"
system: "WOS"

domain: "rendering"
component: "mapbox_style_transfer"

type: "system-spec"
status: "active"

priority: "high"
risk: "medium"

classification: "interpretation-layer"

summary: "Defines the recovery audit process required to restore visible Mapbox Studio styling authority inside WOS rendering and identify which WOS layers are muting or overriding geographic presentation."

doctrine:

- "2D owns truth"
- "2.5D owns presentation"
- "readability over atmospheric accumulation"
- "visible output over hidden infrastructure"

depends_on:

- "MarineRenderer"
- "MapboxRuntime"

enables:

- "VesselReplacementPass"
- "2_5DVesselPresentationPass"
- "HarborAtmospherePresetPass"

tags:

- "mapbox"
- "rendering"
- "recovery"
- "presentation"
- "audit"

---

# 🎯 PURPOSE

Define the recovery audit required to restore clear visual transfer between:

```text
Mapbox Studio styles
```

and:

```text
WOS runtime presentation
```

The current maritime layer demonstrates multiple symptoms:

- muted Mapbox styling
- flattened color identity
- overlay contamination
- excessive atmospheric stacking
- unreadable vessel differentiation
- visual ambiguity between runtime and presentation layers

This spec exists to:

- isolate presentation corruption
- restore geographic readability
- identify visual authority leakage
- establish clean baseline rendering
- expose hidden atmospheric overrides

This is a recovery-focused BUILD spec.

It is NOT:

- an atmosphere expansion spec
- a wake enhancement spec
- a cinematic feature pass
- a shader experimentation phase

---

# 🧠 CORE PRINCIPLES

## Visible Output Over Hidden Systems

If a rendering system cannot be visually validated:

```text
it is not currently valuable.
```

Hidden atmospheric complexity must never outrank:

- geographic readability
- vessel identity clarity
- presentation stability
- observability consistency

---

## Mapbox Owns Geographic Baseline

Mapbox Studio remains the canonical source for:

- land coloration
- water coloration
- district tone
- coastline readability
- geographic hierarchy
- environmental visual structure

WOS may interpret.

WOS may NOT:

- visually erase Mapbox identity
- flatten Mapbox hierarchy
- overpower geographic readability

---

## Interpretation Layers Must Be Auditable

All presentation systems must support:

- isolation
- toggling
- visibility debugging
- runtime verification

No atmospheric system may remain:

```text
hidden and untraceable.
```

---

## Recovery Before Expansion

No additional:

- wake systems
- water memory systems
- atmosphere complexity
- hidden interpolation layers

may proceed until:

```text
Mapbox transfer visibly works.
```

---

# 🏛️ AUTHORITY BOUNDARIES

This spec governs:

- Mapbox style verification
- presentation isolation
- overlay visibility auditing
- rendering contamination detection
- style transfer diagnostics
- baseline rendering recovery

This spec may:

- disable overlays
- disable atmosphere layers
- disable wake systems
- expose runtime debug output
- isolate renderer stages

This spec does NOT govern:

- AIS runtime authority
- vessel continuity state
- route propagation
- atmospheric presets
- soundtrack behavior
- world simulation

This spec MUST NOT:

- mutate runtime truth
- modify vessel telemetry
- rewrite continuity systems
- introduce new atmosphere logic

---

# 🌊 CONTINUITY ROLE

This audit restores:

```text
presentation continuity readability
```

rather than runtime continuity.

The purpose is to ensure:

- the world remains visually legible
- atmosphere does not bury geography
- vessels remain observable
- map identity survives interpretation layering

The audit establishes the clean visual baseline required for:

- vessel replacement
- 2.5D depth presentation
- future atmosphere presets

---

# 🧭 INTERPRETATION SEPARATION

Canonical doctrine:

```text
2D owns truth.
2.5D owns presentation.
```

Mapbox provides:

- spatial truth presentation
- geographic structure
- environmental readability

WOS interpretation layers provide:

- atmosphere
- overlays
- vessel rendering
- symbolic enhancement
- cinematic framing

Interpretation systems must NEVER:

- erase Mapbox readability
- overpower coastline structure
- flatten visual hierarchy
- obscure vessel readability

The audit explicitly separates:

```text
baseline geography
```

from:

```text
WOS atmospheric interpretation.
```

---

# 📦 DATA MODEL

```ts
export type MapboxAuditState = {
  cleanModeEnabled: boolean;
  activeStyleUrl: string;
  activeStyleName: string;
  overlayLayersEnabled: boolean;
  atmosphereEnabled: boolean;
  wakesEnabled: boolean;
  vesselPresentationEnabled: boolean;
  debugAuditEnabled: boolean;
  visibleOverlayLayers: string[];
  mutedOverlayLayers: string[];
};
```

---

# ⚙️ SYSTEM CONSTANTS

```ts
const MAPBOX_AUDIT_VERBOSE = true;
const DEFAULT_CLEAN_MODE = false;
const MAX_OVERLAY_REENABLE_BATCH = 1;
const WAKE_SYSTEM_DEFAULT_ENABLED = false;
```

---

# 🔧 CORE FUNCTIONS

```ts
function getActiveMapboxStyle(): string {}

function printMapboxStyleAudit(): void {}

function enableCleanMapboxMode(): void {}

function disableCleanMapboxMode(): void {}

function disableAtmosphereLayers(): void {}

function disableWakeSystems(): void {}

function toggleOverlayLayer(id: string, enabled: boolean): void {}

function getVisibleOverlayLayers(): string[] {}

function getMutedOverlayLayers(): string[] {}

function auditMapboxTransferIntegrity(): AuditResult {}
```

Function responsibilities:

- remain deterministic
- avoid runtime mutation leakage
- isolate presentation behavior only
- expose renderer state clearly

---

# 🔄 EXECUTION FLOW

```text
Load Mapbox Style
→ Verify Published Style URL
→ Print Runtime Style Metadata
→ Enable Clean Mapbox Mode
→ Disable WOS Atmosphere
→ Disable Wake Systems
→ Disable Overlay Stack
→ Compare Visual Baseline
→ Re-enable WOS Layers Individually
→ Identify Muting Layer
→ Capture Screenshot Validation
→ Lock Baseline
```

The audit MUST proceed incrementally.

Layer stacks may NOT be reintroduced simultaneously.

---

# 🛰️ OBSERVABILITY IMPACT

This audit directly affects:

- harbor readability
- coastline contrast
- vessel observability
- low-light clarity
- environmental hierarchy
- atmospheric restraint

Expected outcomes:

- stronger coastline readability
- visible Mapbox identity transfer
- reduced visual mud
- cleaner vessel contrast
- calmer world presentation

The audit intentionally prioritizes:

```text
clarity over cinematic accumulation.
```

---

# 🔗 AUTHORITY RELATIONSHIPS

## Reads From

- MapboxRuntime
- MarineRenderer
- OverlayRegistry
- AtmosphereRuntime

## Writes To

- PresentationDebugState
- OverlayVisibilityState
- RendererAuditState

## Observed By

- MarineRenderer
- VesselPresentationRuntime
- HarborAtmospherePresetPass
- DebugOverlaySystem

## Forbidden Mutations

- AIS telemetry
- vessel continuity state
- route authority
- world simulation state
- runtime environmental truth

---

# 🎼 ORCHESTRATION NOTES

This spec does NOT orchestrate:

- atmosphere transitions
- cinematic sequencing
- scheduler behavior
- channel pacing

This spec ONLY establishes:

```text
baseline presentation verification.
```

No hidden orchestration layers may be introduced during this audit.

---

# 🧪 VALIDATION CHECKLIST

## Phase 0 — Immediate Recovery

- [ ] WaterMemory disabled completely
- [ ] Wake systems disabled by default
- [ ] Close-vessel wake fallback isolated
- [ ] Hidden atmospheric systems frozen

---

## Phase 1 — Mapbox Verification

- [ ] Runtime prints active Mapbox style URL
- [ ] Runtime prints style name + style ID
- [ ] Mapbox Studio style confirmed published
- [ ] Clean Mapbox mode operational
- [ ] WOS overlays fully disableable
- [ ] Overlay layers re-enable individually
- [ ] Muting layer identified

---

## Screenshot Gates

- [ ] Mapbox style visibly recognizable inside WOS
- [ ] Coastline hierarchy readable
- [ ] Harbor coloration preserved
- [ ] Geographic contrast survives atmosphere removal
- [ ] Visual clarity improved versus 0526 builds

---

# 🚫 NON-GOALS

This spec is NOT responsible for:

- new atmosphere systems
- cinematic weather systems
- advanced wake simulation
- AIS classification logic
- vessel topology replacement
- harbor ecology
- soundtrack systems
- camera spline behavior

This spec intentionally avoids:

```text
feature expansion.
```

---

# ⏸️ DEFERRED SYSTEMS

Deferred until audit completion:

- advanced wake rendering
- WaterMemory restoration
- harbor atmosphere presets
- cinematic rain systems
- sodium lighting systems
- broadcast failure distortion
- fog layering complexity

These systems remain frozen until:

```text
Mapbox transfer integrity is restored.
```

---

# 🔗 CHAIN DISPOSITION

## 0525A — MapStyleAuthority

Disposition:

```text
DEFERRED
```

Reason:

Global presentation governance remains too abstract to validate until baseline rendering recovery succeeds.

---

## 0525B — Maritime Vessel Visual Authority

Disposition:

```text
SUPERSEDED BY 0527C
```

Reason:

Visible vessel readability recovery now takes precedence over broader visual governance layering.

---

## 0525E — 2.5D Maritime Presentation

Disposition:

```text
PARTIALLY SUPERSEDED BY 0527D
```

Reason:

Close-range vessel grounding and readability become the immediate focus.

Advanced cinematic depth systems deferred.

---

## 0525F — Maritime Vessel Taxonomy Expansion

Disposition:

```text
SUPERSEDED BY 0527C
```

Reason:

The recovery pass focuses on visually identifiable vessel classes first.

---

## 0526C — Wake Continuity Runtime

Disposition:

```text
FROZEN
```

Reason:

Wake systems currently degrade readability and atmospheric cleanliness.

Only minimal close-vessel hero wakes may remain temporarily.

---

## 0526E — Maritime Atmospheric Depth Systems

Disposition:

```text
DEFERRED
```

Reason:

Atmosphere expansion halted pending baseline rendering recovery.

---

## 0526H — Maritime Presentation Expansion

Disposition:

```text
SUPERSEDED BY 0527C + 0527D
```

Reason:

Recovery roadmap prioritizes readability-first execution.

---

## 0523E / 0523F — Harbor Atmosphere Chains

Disposition:

```text
DEFERRED
```

Reason:

Atmosphere systems must rebuild around visible presets rather than hidden accumulation.

---

## 0523R v1.2.3

Disposition:

```text
REQUIRED HARDENING PREREQUISITE FOR PHASE 5
```

Reason:

Phase 5 atmosphere preset recovery must not proceed without prior governance validation.

---

# 📚 CANONICAL REFERENCES

- README fileciteturn0file2L1-L20
- WOS Naming Doctrine fileciteturn0file0L1-L20
- Surface Channel Doctrine fileciteturn0file1L1-L20
- WOS Constitutional Spec Template fileciteturn0file3L1-L20
- MarineRenderer
- MapboxRuntime
- OverlayRegistry
- AtmosphereRuntime

---

# 💬 IMPLEMENTATION NOTES

## Required Console Commands

```js
_wos.debug.mapbox.style()
_wos.debug.mapbox.layers()
_wos.debug.mapbox.cleanMode(true)
_wos.debug.mapbox.cleanMode(false)
_wos.debug.mapbox.disableAtmosphere()
_wos.debug.mapbox.disableWakes()
```

---

## Required Recovery Order

```text
0527B → 0527C → 0527D → 0527E → 0527F
```

No reordering permitted until screenshot gates validate.

---

## Critical Recovery Constraint

If a feature:

- cannot be screenshot verified
- cannot be visually isolated
- cannot be debug toggled
- cannot be explained through visible output

then:

```text
it does not currently qualify for expansion.
```

