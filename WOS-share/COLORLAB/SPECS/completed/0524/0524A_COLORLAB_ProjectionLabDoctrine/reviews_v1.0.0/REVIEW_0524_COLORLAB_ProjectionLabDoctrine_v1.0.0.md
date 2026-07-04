# REVIEW: 0524_COLORLAB_ProjectionLabDoctrine_v1.0.0

Reviewed against: Full Colorlab governance stack (`0522A` through `0522J`)  
Review date: 2026-05-24  
Reviewer: Claude

---

## Overall Assessment

This is a different kind of document from the prior specs — a doctrine layer rather than an infrastructure spec, and it reads as one. The Four-Corner Interpretation Model is the most conceptually ambitious contribution in the stack: it gives Colorlab a principled framework for graduating palettes from extracted signal to operational WOS input without collapsing the truth/interpretation boundary. The core doctrine ("a palette represents a sampled condition, not a place") is the right framing and held consistently throughout.

The governance risks are real but addressable. The main structural issue is that this spec sits at the intersection of Colorlab's archival governance and WOS's runtime authority — a boundary that the prior specs carefully separated — and several sections pull those systems toward each other in ways that need governing before downstream specs are written.

---

## Governance Issues

### 1. The Four-Corner Model Creates Four Output Types — None of Them Governed

Truth, Mood, Reference, and Fiction are the four interpretive modes. Each produces output that influences WOS rendering. But the spec defines none of these outputs as governed artifacts. Specifically:

- Who stores a Truth-mode projection result?
- Is a Mood-mode output a saved intelligence report (per the intelligence spec) or a transient analysis?
- Does a Fiction-mode output produce a `DERIVED_VARIANT` or a runtime-local cache record?
- Can a Reference-mode result be exported as a `wos_palette_package`?

The Intelligence spec's two-layer persistence model (ephemeral transient analysis / saved advisory reports) is the right framework for projection outputs. But the Projection Lab introduces a new output type — a **runtime role recommendation** (Section 9) — that doesn't fit cleanly into either layer. It's not an intelligence payload; it's closer to an export-ready profile. Whether it becomes a new governed artifact type or maps onto an existing one needs to be declared.

**Recommendation:** Add a section defining the output artifact model for each mode. Minimum: declare whether projection outputs are (a) transient analysis, (b) saved intelligence reports, or (c) a new export-oriented artifact type (`PaletteRuntimeProfile`). Section 15 lists `0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0.md` as a downstream spec — that spec needs to exist before projection outputs are governed. Flag it as a required dependency, not just a downstream suggestion.

---

### 2. Runtime Role Recommendation (Section 9) Is the Highest-Risk Output

The runtime role recommendation:

```yaml
runtime_role_recommendation:
  base: low
  accent: high
  atmosphere: high
  route: medium
  ui: medium
  fiction_override: high
```

This is not advisory analysis — it is a structured role assignment that WOS will read as a palette profile. If WOS consumes this as an intake payload, it becomes the mechanism by which palette roles enter the runtime. The WOS integration spec's Advisory Signal Doctrine explicitly lists `structuralRole` and `interpretiveRole` as advisory-only fields. But a `runtime_role_recommendation` is a new field type that sits between advisory signal and runtime directive.

The risk: downstream implementation will treat `fiction_override: high` as a signal that this palette *should* be used for fiction overrides — which is exactly the kind of implicit promotion the spec says Projection Lab must not silently perform.

**Recommendation:** Add an explicit constraint: runtime role recommendations are advisory confidence signals, not approved role assignments. WOS must not treat a high confidence value in any role category as authorization to use that palette in that role. Role authorization must remain a separate explicit human or governed action. The distinction between "this palette is likely suitable for atmosphere" and "this palette is approved for atmosphere" must be maintained.

---

### 3. Truth Mode Creates a Geographic Authority Surface

Truth mode asks: "Could this palette plausibly belong to this place, time, or weather condition?" and influences land tint, water tone, roads, and building surfaces. This is the closest the system comes to assigning a palette geographic meaning.

The spec correctly states: "Truth mode must not invent false geography or overpower the base map." But it does not define who has authority to confirm a palette in Truth mode, what evidence is required, or what happens to a palette after Truth confirmation. Without these, Truth mode confirmation will drift toward implicit geographic promotion — the "sampled condition doctrine" will be violated in practice even if held in doctrine.

**Recommendation:** Add a Truth Confirmation Authority clause: Truth-mode confirmation of a palette for a specific location requires explicit human curation action, not just a projection result. A projection output that says "this palette performs well in Truth mode for Tokyo night rain" is an advisory signal. Only a governed metadata action (e.g., a metadata tag applied through the Metadata System) can promote it toward location association. The projection does not promote; the curator decides.

---

### 4. Fiction Mode's "Declared Stylization" Requirement Has No Mechanism

Fiction mode "is allowed to rewrite the appearance of the scene as long as it is declared as stylization and does not corrupt underlying runtime truth." The phrase "declared as stylization" is doing significant governance work without a defined mechanism.

Who declares it? Where is the declaration stored? If Fiction mode palettes are applied to WOS without a visible declaration, downstream systems — and users — will perceive the stylized world as the authoritative world. The declaration must be machine-readable, not just doctrinal.

**Recommendation:** Define the declaration mechanism: a Fiction-mode palette must carry a `projectionMode: "fiction"` field in its runtime profile export. WOS must surface this declaration visibly in any context where a Fiction-mode palette is active. The declaration is not optional metadata — it is a required field whose absence must block Fiction-mode activation in WOS.

---

### 5. Audio Preview Has No Isolation Boundary

Section 8 defines audio preview as "non-authoritative" and "mood guidance until a dedicated audio intelligence layer exists." This is the right framing. However, audio preview is described as a Projection Lab output without any defined boundary between it and future audio systems.

If audio previews generated in the Projection Lab become the de facto audio identity for palettes — even informally — they will accumulate authority before a governing audio spec exists. This is the same pattern that causes interpretive roles to drift toward canonical truth.

**Recommendation:** Add a lifecycle constraint: audio preview outputs from the Projection Lab are transient and non-persistent. They may not be stored as palette metadata. They may not be referenced in export packages. They exist only during an active projection session. When a dedicated `0524_COLORLAB_AudioPreviewLayer_v1.0.0.md` spec is established, audio persistence governance transfers to that spec entirely.

---

### 6. Source Bias Doctrine Has No Payload Presence

Section 12 defines source bias awareness correctly and precisely. A palette from a Tokyo sign at night should not become a general Tokyo palette without broader evidence. This is the right containment.

However, source bias awareness has no payload representation anywhere in the spec. It is declared as a doctrine but has no field in any output artifact. Without a `sourceBiasFlags` or `extractionContext` field in projection outputs, source bias is invisible to downstream systems — they receive a palette profile with no indication of the single-image, single-angle, single-lighting provenance that created it.

**Recommendation:** Add a required `sourceBias` block to the projection output profile, referencing the SOURCE_CANDIDATES provenance fields established in the extraction spec. At minimum: single vs. multi-sample origin, extraction context (time of day, weather if known from metadata), and a bias confidence flag. This makes the sampled-condition doctrine machine-readable rather than doctrinal.

---

## Structural Notes

**The preview surface as a "palette wind tunnel"** (Section 13) — this is the most useful framing in the document and should be the lead metaphor for downstream UX specs. It correctly establishes that the preview surface exists for behavioral testing, not artwork production.

**Acceptance Criteria (Section 16)** — the most concrete governance checklist in the entire spec stack. The line "no palette silently becomes canonical geographic truth" is the core invariant of the entire Projection Lab system and should appear in every downstream spec's validation requirements.

**Section 9 runtime role categories** include "Audio Hint" as a role type — which is correct — but connects audio hints to WOS runtime delivery before an audio governance spec exists. This is a forward reference that may need to be hedged as provisional until the audio spec is written.

**Section 15 downstream specs** — the list of eight required downstream specs is appropriate. Flag: `0524_WOS_ColorRuntimeProfileImport_v1.0.0.md` is a new WOS-side import spec that creates a feedback path from Projection Lab outputs into WOS. The WOS integration spec's review flagged WOS → Colorlab feedback as the highest-risk future feature requiring a separate import/feedback governance specification. This downstream spec is that specification — it should be written with explicit governance constraints from the start, not discovered later.

---

## Summary

| Issue | Risk | Type |
|---|---|---|
| Four-corner outputs have no governed artifact classification | High | Governance gap |
| Runtime role recommendation conflates advisory signal with role authorization | High | Governance leakage |
| Truth mode confirmation has no authority mechanism | High | Geographic authority drift |
| Fiction mode "declared stylization" has no machine-readable mechanism | High | Enforcement gap |
| Audio preview has no isolation boundary or persistence constraint | Medium | Scope drift |
| Source bias doctrine has no payload representation | Medium | Provenance gap |
| `WOS_ColorRuntimeProfileImport` creates ungoverned feedback path | Medium | Future governance risk |

---

## Overall

The doctrine is conceptually sound — the Four-Corner Model, sampled condition framing, and confidence/risk separation are all genuine governance contributions that strengthen the Colorlab/WOS boundary rather than dissolve it. The issues are concentrated at the output side: the spec defines what the Projection Lab does well, but leaves what it produces insufficiently governed. Before the eight downstream specs are written, the output artifact model (Issue 1) and the Truth mode confirmation authority (Issue 3) should be resolved — those decisions will shape every downstream spec's scope and authority boundaries.
