# 🚦 SPEC STAGE

Stage: [REVIEW]  
Freeze Decision: REVIEW  
Action: Harden presentation governance boundaries before maritime style extraction.

# 0525A_WOS_MapStyleAuthority_v1.0.1

## PATCH OBJECTIVE

This patch resolves the major governance and authority-boundary concerns identified during architectural review.

Primary corrections:

- formal dependency declarations
- atmospheric authority separation
- motion presentation authority hardening
- overlay semantic ownership clarification
- override governance clarification
- presentation manifest clarification
- terminology tightening
- projection integrity hardening

This patch intentionally avoids expanding feature scope.

The objective is:

```text
governance stabilization
```

NOT:

```text
feature escalation
```

---

# 🔧 PATCH SUMMARY

## PATCH-1 — Formal Dependency Declarations Added

Added canonical `depends_on` governance declarations following constitutional template standards.

New dependencies:

```yaml
depends_on:
  - "0522Q_WOS_MaritimeContinuityDoctrine_v1.0.0"
  - "0523A_WOS_MaritimeVesselTaxonomyProfiles_v1.2.2"
  - "0523B_WOS_MaritimePopulationHierarchy_v1.1.0"
  - "0523D_WOS_MaritimeWakeAuthority_v1.2.1"
  - "0523E_WOS_MaritimeAtmosphericReadability_v1.2.0"
  - "0523F_WOS_MaritimeContinuityDensity_v1.2.0"
  - "0523R_WOS_InfrastructureRegistry_v1.2.3"
```

Purpose:

- constitutional chain traceability
- authority visibility
- registry integrity
- dependency governance

---

## PATCH-2 — AtmosphericReadability Authority Boundary Hardened

Added canonical authority separation doctrine:

```text
AtmosphericReadability owns visibilityClass.

MapStyleAuthority owns atmospheric visual interpretation
within the assigned visibility class.

MapStyleAuthority may NEVER elevate a vessel
to a higher visibilityClass than assigned by
AtmosphericReadability.
```

Clarifies:

- fog rendering
- haze rendering
- glow rendering
- atmospheric softness
- suppression visuals

DO NOT override:

- FULL
- SILHOUETTE
- MARKER_ONLY
- ATMOSPHERIC_HIDDEN

This prevents hidden visibility authority leakage.

---

## PATCH-3 — Motion Authority Separation Hardened

Removed ambiguous temporal semantics from generic style ownership.

Deprecated:

```ts
movementInterpolationMs
```

Replaced with:

```ts
type MotionPresentationStyle = {
  readonly headingVisualSmoothing: number
  readonly interpolationCurve: InterpolationCurve
  readonly visualEasingMs: number
}
```

Updated vessel structure:

```ts
type VesselStyle = {
  readonly symbolic: SymbolicVesselStyle
  readonly lighting: VesselLightingStyle
  readonly wakePresentation: WakePresentationStyle
  readonly motionPresentation: MotionPresentationStyle
}
```

Critical doctrine added:

```text
MotionPresentationStyle affects ONLY
presentation-layer visual easing.

It may NEVER:
- alter runtime cadence
- alter fixed timestep accumulation
- alter AIS continuity
- alter dead reckoning
- alter continuity authority
```

---

## PATCH-4 — OverlayGrammar Ownership Clarified

Added explicit semantic ownership separation:

```text
OverlayGrammar owns:
- semantic composition
- symbolic hierarchy
- telemetry ordering
- readability structure
- overlay meaning

MapStyleAuthority owns:
- visual tuning
- opacity
- glow
- softness
- suppression visuals
- atmospheric overlay treatment
```

---

## PATCH-5 — Presentation Manifest Pattern Clarified

Removed ambiguous renderer write-path ownership.

Replaced with:

```text
Produces:
- MapStyleManifest
```

Clarified execution relationship:

```text
MapStyleAuthority produces immutable
presentation manifests consumed by
MarineRenderer.

MarineRenderer remains authoritative
owner of render execution state.
```

---

# 🧱 NEW DATA MODEL ADDITIONS

## LandStyle Added

```ts
type LandStyle = {
  readonly landColorHex: string
  readonly districtContrast: number
  readonly coastlineVisibility: number
  readonly infrastructureShadowStrength: number
  readonly nighttimeDarkness: number
}
```

Updated registry:

```ts
type MapStyleRegistry = {
  readonly water: WaterStyle
  readonly land: LandStyle
  readonly roads: RoadStyle
  readonly labels: LabelStyle
  readonly atmosphere: AtmosphereStyle
  readonly overlays: OverlayStyle
}
```

---

# 🌫️ ATMOSPHERE TERMINOLOGY HARDENING

```text
Atmosphere within this specification refers ONLY to:

- visual interpretation
- environmental rendering
- atmospheric projection
- observability treatment
```

Excluded:

```text
- soundtrack pacing
- audio mood
- scheduler behavior
- transition timing
- camera orchestration
```

---

# 🎥 PROJECTION INTEGRITY HARDENING

```text
Projection-invalid rendering is forbidden.
```

Additional doctrine:

```text
Presentation systems may NOT introduce
false spatial depth relationships that
contradict runtime spatial truth.
```

---

# 🧭 OVERRIDE GOVERNANCE HARDENING

```text
GLOBAL MAP STYLE
→ LAYER STYLE REGISTRIES
→ SURFACE STYLE PRESETS
→ SINGLE ACTIVE LIVE OVERRIDE
```

Additional constraints:

```text
Multiple concurrent override authorities
are forbidden.
```

and:

```text
Overrides are ephemeral unless explicitly
serialized through SurfaceRuntime tooling.
```

---

# 📡 OBSERVABILITY CAMERA GOVERNANCE NOTE

```text
ObservabilityCamera may observe presentation
state for rendering coordination only.
```

Camera systems may NOT use style registries for:

- route steering
- hero selection
- cinematic pacing authority
- runtime focus arbitration

---

# 🌊 WAKE PRESENTATION CLARIFICATION

```text
wakePresentation parameters affect ONLY
visual wake rendering.
```

They may NOT:

- alter WakeRegistry buffers
- alter wake persistence duration
- alter wake decay authority
- alter wake continuity state

---

# 🚫 NON-GOAL HARDENING

This specification does NOT govern:

- scheduler orchestration
- camera choreography
- soundtrack pacing
- world routing
- transition sequencing
- gameplay systems
- semantic overlay composition
- runtime continuity timing
- AIS truth resolution

---

# 🧠 ARCHITECTURAL OUTCOME

This patch transforms:

```text
large atmospheric styling spec
```

into:

```text
bounded presentation governance authority
```

while preserving:

- atmospheric identity
- renderer de-hardcoding
- symbolic rendering direction
- far-light doctrine
- passive interpretation architecture

---

# 📌 RECOMMENDED NEXT SPEC

```text
0525B_WOS_MaritimeStyleRegistry_v1.0.0
```

---

# ✅ PATCH VALIDATION CHECKLIST

- [x] Dependency chain formalized
- [x] AtmosphericReadability boundary hardened
- [x] Motion authority leakage reduced
- [x] Overlay semantic ownership clarified
- [x] Manifest pattern clarified
- [x] Missing LandStyle added
- [x] Override governance defined
- [x] Projection integrity hardened
- [x] Atmosphere terminology narrowed
- [x] Camera orchestration leakage reduced
- [x] WakeAuthority separation clarified
- [x] Non-goals expanded

---

# FINAL STATUS

```text
0525A_WOS_MapStyleAuthority_v1.0.1
```

Status:

```text
REVIEW — GOVERNANCE HARDENED
```
