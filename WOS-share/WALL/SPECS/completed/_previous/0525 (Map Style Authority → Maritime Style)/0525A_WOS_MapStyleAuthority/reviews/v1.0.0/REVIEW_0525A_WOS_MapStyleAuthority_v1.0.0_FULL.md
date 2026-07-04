# Architectural Review: 0525A_WOS_MapStyleAuthority_v1.0.0 (Full Spec)

**Review Type:** Architecture — First Substantive Review (Full Spec)
**Prior Review:** REVIEW_0525A_WOS_MapStyleAuthority_v1.0.0.md (INCOMPLETE — purpose statement only)
**Stage:** [REVIEW] / REVIEW — reviewing before build
**Spec Purpose:** Data-authored presentation styling authority; global map style registries; live iteration infrastructure; future Surface visual identity support.

---

## What the Full Spec Gets Right

The core doctrine is correct and well-stated. The three-line hierarchy:

```text
Runtime owns truth.
Renderer owns presentation.
MapStyleAuthority owns presentation styling.
```

establishes the right position for this system. The explicit prohibition on fabricating runtime continuity, mutating AIS truth, or rewriting geographic authority is stated consistently throughout and repeated in enough places to survive partial reads.

The "Atmosphere Over Utility" doctrine belongs in this spec. Prioritizing cinematic readability, psychological tone, and environmental coherence over GIS clarity is a design authority decision that, once made here, can propagate down to every style layer without needing to be relitigated in each one.

The style hierarchy (`GLOBAL MAP STYLE → LAYER STYLE REGISTRIES → SURFACE STYLE PRESETS → LIVE RUNTIME OVERRIDES`) is the correct layering model. Each level overrides the one above for presentation purposes while leaving runtime truth untouched.

The Live Style Panel's explicit scoping to "development-only editing surface" and "presentation registries only, never runtime truth" is the right governance boundary for an iteration tool.

The implementation order recommendation is operationally correct:

```text
renderer de-hardcoding first, atmospheric expansion second
```

This is the right call. Every atmospheric feature added before the registry system exists will require a subsequent migration.

---

## Blocking Issues

### 1. No Formal `depends_on` Dependency Declaration

The spec has no YAML front matter and no explicit `depends_on` section. The "Canonical References" section lists documentary references (README, naming doctrine, other specs) but these are not governance dependency declarations.

The registry (0523R) tracks the chain through formal `depends_on` relationships. Without them, this spec cannot be placed in the chain, its position relative to 0523E, 0523D, 0523B, and 0523F is undefined, and downstream specs cannot formally declare a dependency on this spec.

Given that this spec explicitly relates to:
- `0523E` (AtmosphericReadability) — see Blocking Issue 3
- `0523D` (WakeAuthority) — wake styling
- `0523B` (PopulationHierarchy) — tier-based vessel visual differentiation
- `0523F` (ContinuityDensity) — clutter pressure as a style input
- `0523R` (Infrastructure Registry) — chain tracking

**Required:** Add formal `depends_on` declarations covering at minimum 0523D, 0523E, 0523B, 0523F, and 0523R at their current frozen versions. Follow the YAML front matter convention established across the 0523 chain.

---

### 2. `LandStyle` Is Referenced in `MapStyleRegistry` But Never Defined

`MapStyleRegistry` declares:

```ts
type MapStyleRegistry = {
  water: WaterStyle
  land: LandStyle
  roads: RoadStyle
  labels: LabelStyle
  atmosphere: AtmosphereStyle
  overlays: OverlayStyle
}
```

`WaterStyle`, `RoadStyle`, `LabelStyle`, `AtmosphereStyle`, and `OverlayStyle` all have dedicated definition blocks. `LandStyle` has no definition anywhere in the spec. An implementer cannot construct `MapStyleRegistry` without it.

**Required:** Define `LandStyle` with at minimum the fields necessary for land darkness, district contrast, and coastline visibility — which are listed under the Global Map Style Registry responsibilities.

---

### 3. `AtmosphereStyle` Authority Boundary vs. `0523E` Is Undefined

`AtmosphereStyle` defines:

```ts
type AtmosphereStyle = {
  fogAlpha: number
  hazeStrength: number
  grainOpacity: number
  glowRadius: number
  bloomSoftness: number
  visibilityFalloffKm: number
}
```

`0523E` (AtmosphericReadability) owns visibility interpretation. It outputs `visibilityClass` (`FULL | REDUCED | SILHOUETTE | MARKER_ONLY | LIGHT_ONLY | ATMOSPHERIC_HIDDEN`), `readabilityScore`, `atmosphericBlurHint`, and `atmosphericContrastHint`. It uses `weatherFactor`, `timeOfDayFactor`, `distanceFactor` and `clutterPressure` to derive these outputs.

`AtmosphereStyle.fogAlpha`, `hazeStrength`, and especially `visibilityFalloffKm` are in direct semantic territory with 0523E's distance attenuation and weather suppression model. The critical question from the preliminary review — "If 0523E says a vessel should be `SILHOUETTE`, can MapStyleAuthority override that with `FULL`?" — is not answered in this spec.

If a style preset sets `fogAlpha: 0.0` to clear all fog, does that override 0523E's `FOG_SUPPRESSION` readability classification? If yes, this spec becomes a hidden visibility authority and contradicts 0523E's ownership. If no, the spec must state that `AtmosphereStyle` parameters apply to visual rendering of atmospheric effects only and cannot override the `visibilityClass` outputs of 0523E.

**Required:** Explicitly define the authority boundary between `AtmosphereStyle` and `0523E`. The canonical statement should be:

```text
AtmosphericReadability owns visibilityClass.
MapStyleAuthority owns the visual rendering of atmospheric effects within that class.
A style parameter may not cause a vessel to render at a higher visibilityClass than AtmosphericReadability assigns.
```

---

### 4. `movementInterpolationMs` in `VesselStyle` Is a Runtime Motion Authority Conflict

`VesselStyle` includes:

```ts
movementInterpolationMs: number
headingSmoothing: number
```

The WOS constitutional specs (0522O/P/Q) establish that vessel motion authority — including the fixed-timestep tick (50ms, 20Hz), dead-reckoning, and reconciliation — is owned exclusively by MaritimeContinuityEngine. `movementInterpolationMs` in a style registry is a configurable presentation-layer motion timing parameter. If it can alter how vessel position is interpolated between continuity ticks, it becomes a backdoor into runtime motion authority.

The spec's motion doctrine states: "Presentation layer may interpolate visually, smooth heading visually, ease motion visually. But may NEVER rewrite runtime coordinates or fabricate vessel continuity." This is the correct doctrine. But `movementInterpolationMs` as a style registry field, without explicit scoping, is ambiguous: an implementer reading this field could use it to alter the interpolation accumulator rather than only the visual easing.

**Required:** Rename to make visual-only scoping explicit (e.g., `visualEasingMs`, `presentationInterpolationMs`) AND add a docstring or inline constraint stating this value applies to the visual rendering pass only and must not alter the MaritimeContinuityEngine fixed-timestep accumulator, AIS confidence, or any runtime state.

---

### 5. "Writes To: RendererStyleState" — Write Path vs. Manifest Pattern Ambiguity

The Authority Relationships section states:

```text
Writes To:
- PresentationState
- RendererStyleState
```

The precedent across the 0523 chain is that interpretation layers produce outputs that consumers read — AtmosphericReadability produces descriptors that the renderer reads; ContinuityDensity produces pressure scores that AtmosphericReadability reads. Neither system writes directly to renderer state.

If MapStyleAuthority writes to `RendererStyleState`, it is actively mutating a renderer-owned target rather than producing a manifest that MarineRenderer chooses to consume. This is a different authority model — one that inverts the consumer relationship. Direct writes to renderer state also create ordering dependencies and mutation risks that the manifest/consumer pattern avoids.

Neither `PresentationState` nor `RendererStyleState` is defined in this spec or in any prior chain document.

**Required:** Define whether MapStyleAuthority uses a manifest pattern (produces a `MapStyleManifest` that MarineRenderer reads) or a write pattern (directly updates a renderer state object). If manifest: rename the relationship to "Produces: MapStyleManifest, consumed by MarineRenderer." If write: justify why the write pattern is necessary and define `RendererStyleState` explicitly with its mutation governance rules.

---

## Non-Blocking Issues

### 6. `ObservabilityCamera` as Observer — Camera Authority Clarification Needed

"Observed By" includes `ObservabilityCamera`. The spec states MapStyleAuthority does not govern camera routing. But if ObservabilityCamera reads style presets or density-class outputs and uses that to make targeting or framing decisions, it becomes an indirect camera authority path through style state. The relationship needs to specify: ObservabilityCamera may read style outputs for visual presentation rendering only, not for routing, targeting, or pacing decisions.

**Recommended:** Add an explicit camera authority note analogous to ContinuityDensity Section 26: "Camera systems may not use style registry values for cinematic pacing, hero selection, route steering, or focus selection."

---

### 7. `MaritimeStyleRegistry` Example Omits Six Vessel Classes

The `MaritimeStyleRegistry` example includes: `cargo`, `tanker`, `ferry`, `service`, `recreational`, `fishing`. Missing from the 0523A canonical vessel class taxonomy: `PASSENGER`, `TUG`, `MILITARY`, `INDUSTRIAL`, `UNKNOWN`.

If the registry is keyed by vessel class, missing classes would fall through to undefined behavior. The example is marked as "Example:" suggesting it's illustrative, but the full registry definition should be specified or the fallback behavior for unlisted classes must be defined.

**Recommended:** Expand `MaritimeStyleRegistry` to include all 11 canonical vessel classes from 0523A, or define an explicit `default: VesselStyle` fallback for classes not in the registry.

---

### 8. `wakeAlpha` and `wakeLength` in `VesselStyle` — Visual Scope vs. WakeAuthority Unclear

`VesselStyle.wakeLength` shares naming with wake lifetime and segment count concepts owned by `WakeAuthority`. If an implementer interprets `wakeLength` as controlling the number of wake segments to render (a visual parameter), that's fine. If interpreted as controlling the ring buffer size or segment lifetime, that's a WakeAuthority override.

**Recommended:** Add a note that `wakeAlpha` and `wakeLength` are visual rendering parameters only and do not affect WakeRegistry segment count, segment lifetime, or decay timing.

---

### 9. "Runtime Registry" in Execution Flow Is Undefined

The execution flow:

```text
AIS Runtime → Continuity Resolution → Runtime Registry → Style Registry Lookup → ...
```

"Runtime Registry" is not defined in this spec or in any prior chain document. It appears between the runtime layer and the style layer but its content, ownership, and authority boundary are unspecified.

**Recommended:** Define "Runtime Registry" or replace with the appropriate named system (possibly `0523R Infrastructure Registry` or a vessel state snapshot produced by MaritimeContinuityEngine).

---

### 10. `PresentationState` Is Undefined

Listed in "Writes To" alongside `RendererStyleState`. Neither is defined in this spec. Even if the write pattern is retained (Blocking Issue 5 notwithstanding), the write target must be defined.

**Recommended:** Define `PresentationState` as a type with explicit fields, or replace the "Writes To" language with a defined output artifact.

---

## Assessment

The full spec substantively advances beyond the purpose statement. The doctrine is correct, the hierarchy is right, and the "renderer de-hardcoding first" implementation priority is the correct governance call for a system this foundational.

The blocking issues are concentrated in two areas: missing type definitions and governance artifacts (dependency declaration, `LandStyle`), and authority boundary precision at the interfaces with 0523E, the runtime motion system, and the renderer. None require architectural rework — they are precision gaps and one potential write-path inversion. The non-blocking issues are naming and completeness concerns in the style registry examples.

---

## Review Status

**NOT READY FOR BUILD — Five blocking issues.**

Doctrine and hierarchy are correct. Authority boundary gaps at the 0523E and runtime motion interfaces must be resolved before build.

---

## Required Before Build (Blocking)

1. **Add formal `depends_on` declarations** — minimum: 0523D, 0523E, 0523B, 0523F, 0523R at current frozen versions.
2. **Define `LandStyle` type** — referenced in `MapStyleRegistry` but undefined.
3. **Define authority boundary with 0523E** — state explicitly that `visibilityClass` from AtmosphericReadability cannot be overridden by `AtmosphereStyle` parameters.
4. **Rename and scope `movementInterpolationMs`** — must be explicitly visual-only; must not affect MaritimeContinuityEngine fixed-timestep accumulator or runtime state.
5. **Resolve "Writes To: RendererStyleState" write-path ambiguity** — define whether this is a manifest or a write pattern; define both `PresentationState` and `RendererStyleState` if write pattern is retained.

---

## Recommended Before Freeze (Non-Blocking)

6. Add camera authority note scoping ObservabilityCamera's relationship to style outputs.
7. Expand `MaritimeStyleRegistry` to cover all 11 canonical vessel classes or define a default fallback.
8. Add note that `wakeAlpha` / `wakeLength` are visual-only and do not affect WakeAuthority state.
9. Define or replace "Runtime Registry" in the execution flow.
10. Define `PresentationState` as a typed artifact.
