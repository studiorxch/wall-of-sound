---
title: "Architectural Review — COLORLAB Palette Generation and Export"
review_target: "0629G_COLORLAB_PaletteGenerationAndExport_v1.0.0_REVIEW.md"
reviewer: "Independent Architectural Review"
date: "2026-06-29"
status: "Approved with Major Revisions"
production_readiness: "Conditionally Ready"
---

# Architectural Review
## 0629G_COLORLAB_PaletteGenerationAndExport_v1.0.0

---

# Executive Summary

This specification successfully resets COLORLAB from a governance/runtime-adjacent system toward a practical palette creation tool. The doctrine clarity — "make palettes, save palettes, edit palettes, preview palettes, reuse palettes, export palettes" — is the strongest architectural decision in the document. However, several sections introduce boundary ambiguity that will compound over time: the Map Theme Preview creates an underdefined relationship between COLORLAB and WOS runtime truth; the Palette Roles list imports WOS-layer vocabulary without a clear ownership contract; and the Palette Cycling section contains embedded runtime planning that belongs in a separate specification. The spec is close but not ready to approve without resolving three boundary issues.

---

# Governance Audit

## Strengths

- Section 3 (Product Boundary) is unusually clean. The explicit "COLORLAB does NOT own" list is the right call and prevents orchestration creep at the spec level.
- Section 31 (Non-Goals) reinforces the boundary and correctly defers governance workflows, mood inference, and WOS renderer behavior.
- Section 29 (Mood and Music Deferral) explicitly and correctly defers scope that has historically caused COLORLAB to drift.
- The "no export required to preview" rule in Section 17 correctly prevents COLORLAB from becoming a WOS activation gate.

## Issues

- **Palette Roles (Section 9) import WOS runtime vocabulary without defining the ownership contract.** Names like `sky_top`, `sky_mid`, `haze`, `water`, `road`, `building`, `land`, `route` are WOS map layer identifiers. COLORLAB uses them as role labels. Who is the canonical source of these names? If WOS runtime renames `haze` to `atmosphere`, does COLORLAB update? Who owns that vocabulary? This is undeclared.

- **Map Theme Preview (Section 17) is a renderer, but the spec does not say what it renders against.** The preview updates "immediately" when swatches change. What is the map surface? Is it a static mock? A live WOS surface? A captured screenshot? The spec says "WOS-like map surface" — this phrasing is ambiguous enough that implementation could reasonably interpret it either as a static illustration or as a live iframe into WOS runtime. The architectural consequence of those two choices is enormous.

- **Section 20 (Palette Cycling) describes a runtime scheduling plan.** Even though the spec says "can remain a saved metadata plan" in v1.0.0, the cycle modes listed (`every track`, `every playlist section`, `timed interval`) are runtime behavior contracts. These belong in a separate runtime-facing specification, not in a palette creation tool spec.

## Blocking Items

- The Palette Roles vocabulary source is undeclared. COLORLAB should not own canonical WOS layer names. Either roles must be imported from a WOS-owned canonical source, or COLORLAB must define its own role vocabulary as independent of WOS layer names.
- Map Theme Preview must declare what it renders against. "WOS-like" is not a spec-grade definition.

---

# Implementation Gravity Audit

## Strengths

- Palette data model (Section 6) and Swatch data model (Section 7) are well-scoped TypeScript-style contracts. Implementable as written.
- Export format table (Section 21) is clear and bounded. Required vs deferred is explicit.
- Save behavior states (Section 26) are enumerated: unsaved changes / saved / saving / save failed. Implementation-ready.
- Recovery behavior (Section 27) is concrete and testable.

## Issues

- **ASE export (Section 24) contains an untestable contract.** "ASE export must be tested against Affinity import behavior" is a QA instruction embedded in a product spec. It is not an architecture or behavioral contract. The test requirement belongs in a separate QA or test plan document.

- **Image extraction "cleanup muddy colors" (Section 14) is undefined.** What is a muddy color? What algorithm determines muddiness? This is vague implementation language that will generate inconsistent behavior across implementations. Either define the threshold or remove the term.

- **Harmony generator (Section 13) says "remain understandable" and "do not expose complex color theory."** This is a UX guideline, not an architectural contract. It is not enforceable by a spec. It belongs in a UX document.

- **Seed Color Generator (Section 12) says it "should create variations, accents, contrast colors, supporting neutrals, optional dark/light companions."** No count, no algorithm, no determinism. This section describes an expected output shape without defining how to produce it. An implementation team has no contract to test against.

- **Map Theme Preview "updates immediately" (Section 17).** This is a latency claim. "Immediately" has no definition. Is this synchronous? Is there a maximum frame delay? On what hardware? This will produce implementation disagreements.

## Blocking Items

- Seed Color Generator output is insufficiently specified to implement deterministically. The section must either define minimum swatch count, generation algorithm type (e.g., HSL rotation, complementary offset), or link to a referenced algorithm spec.
- "Muddy colors" in image extraction must be defined or removed.

---

# Continuity Doctrine Audit

## Strengths

- COLORLAB is correctly defined as a design tool, not a runtime. Section 17 explicitly states "The map preview is a design tester. It is not WOS runtime authority." This is the right doctrine position.
- Mood and music deferral (Section 29) correctly keeps COLORLAB from coupling to WOS atmosphere or continuity systems prematurely.
- No continuous passive behavior is implied. COLORLAB is triggered by user action, not ambient state.

## Issues

- **Palette Cycling (Section 20) introduces time-based scheduling vocabulary into a design tool.** `timed interval`, `every track`, `every playlist section` are continuity system concepts. Even deferred as "saved metadata plan," including them here ties COLORLAB's data model to runtime scheduling in ways that will be difficult to undo. The cycle modes should not be enumerated in this spec.

- **Map Theme Preview creates an implicit expectation of live WOS surface coupling** in future versions. The spec says "WOS-like map surface" now, but the framing (`map preview updates immediately`) trains implementation teams to eventually wire this to a live WOS surface. If that happens without a formal boundary spec, COLORLAB becomes a renderer inside a runtime system — a continuity doctrine violation.

## Blocking Items

- None blocking at doctrine level if Map Theme Preview remains a static mock. But the spec must say explicitly: **Map Theme Preview renders against a static mock surface, not a live WOS runtime surface.** The current language does not say this.

---

# Scalability Audit

## Strengths

- Palette Collections (Section 19) is appropriately scoped. Group create/rename/export is a clean surface area without overreaching.
- Export formats are explicit about deferral. The deferred list (GPL, CSS variables, TXT, PDF) prevents scope creep into v1.0.0.
- Import behavior (Section 28) correctly uses "may prioritize" language for v1.0.0, leaving the full surface for later.

## Issues

- **Palette Roles (Section 9) will become a versioning problem.** Roles like `sky_top`, `sky_mid`, `water`, `road` are tightly coupled to WOS map layer vocabulary. As WOS map layers evolve, COLORLAB roles will either drift out of sync or require synchronized updates. This coupling should be managed through a shared vocabulary contract, not embedded in both systems independently.

- **The spec mixes creation tool, export tool, preview surface, and metadata scheduling into one document.** These are separable surfaces. Map Theme Preview and Playlist Theme Preview are arguably their own subsystems. Palette Collections has its own CRUD surface. Export Panel has its own format registry. As the product grows, this single spec will become a mega-spec for the entire palette system.

- **Playlist Theme Preview (Section 18) is underspecified relative to Map Theme Preview.** If both previews ship in v1.0.0, the asymmetry in specification depth will cause implementation inconsistency. Either specify both to the same depth or explicitly defer one.

## Future Risks

- Palette Cycling (Section 20), even as metadata-only, will attract runtime implementation pressure. The longer it lives in this spec, the more likely it gets pulled into scope prematurely.
- Palette Roles expanding to cover WOS atmosphere, mood, or playlist visual systems will eventually overwhelm this spec's scope. A separate Palette Roles Registry spec may be warranted.

---

# Canonical Vocabulary Audit

## Stable Terms

| Term | Status |
|---|---|
| `palette` | clear, consistent |
| `swatch` | clear, consistent |
| `palette library` | clear |
| `export` | clear |
| `source type` | clear |
| `palette collection` | clear |
| `harmony mode` | clear |
| `seed color` | clear |

## Terms Requiring Clarification

| Term | Issue |
|---|---|
| `WOS-like map surface` | "like" is not a spec-grade qualifier |
| `muddy colors` | undefined; implementors will invent definitions |
| `cleanup` (Section 14) | cleanup toward what standard? |
| `immediately` (Section 17) | no latency definition |
| `understandable` (Section 13) | not an architectural property |
| `palette role` vs `WOS map layer` | relationship undeclared |
| `palette cycling` vs `palette scheduling` | cycling implies loop; scheduling implies runtime trigger — possibly conflated |
| `map theme` | COLORLAB-owned or WOS-owned? Ownership undeclared |

## Recommendations

- Replace "WOS-like map surface" with either "static map mock surface" or "WOS map preview surface (external dependency)" with the dependency made explicit.
- Define or remove "muddy colors." Replace with "near-duplicate or low-saturation colors below a defined threshold (TBD)."
- Define "immediately" as a bounded latency target or replace with "without requiring an explicit refresh action."
- Separate "palette role" from "WOS map layer" at the vocabulary level. COLORLAB roles should have COLORLAB names. Mapping to WOS layer names should happen at an integration contract layer, not inside the palette role list.

---

# Specification Split Recommendations

## Section 9 (Palette Roles) → Palette Roles Registry Spec

Roles currently embed WOS runtime vocabulary. As WOS map layers and playlist visual systems evolve, roles will need versioned updates. A shared Palette Roles Registry, owned by a cross-system vocabulary layer, prevents both COLORLAB and WOS from maintaining independent role lists that drift out of sync.

## Sections 17–18 (Map Theme Preview + Playlist Theme Preview) → Preview Surface Spec

Preview surfaces are distinct from palette creation. They have their own rendering contract, mock data requirements, and update behavior. Embedding them here ties palette data model decisions to rendering decisions. A preview surface spec would clarify what mock data drives the previews, what the latency contract is, and what constitutes a "correct" preview state.

## Section 20 (Palette Cycling) → Palette Runtime Integration Spec (future)

Even as a metadata plan, palette cycling belongs in a spec about how COLORLAB data is consumed by WOS runtime and playlist systems. It does not belong in a palette creation tool spec.

## Sections 21–25 (Export Formats) → COLORLAB Export Spec

Export formats have their own format registry, compatibility contracts (ASE/Affinity), and QA requirements. The current five export sections will grow as more formats are added. A dedicated export spec gives the format surface a proper home and keeps this spec focused on generation and editing.

---

# Blocking Issues

1. **Palette Roles vocabulary ownership is undeclared.** WOS runtime names embedded in COLORLAB roles without a canonical ownership contract creates a versioning and synchronization risk that will compound across both systems.

2. **Map Theme Preview rendering target is undefined.** "WOS-like map surface" must be declared as either a static mock or a live dependency. These two choices have fundamentally different architectural consequences and cannot both be correct.

3. **Seed Color Generator output is not implementable as specified.** No count, no algorithm reference, no deterministic contract. A v1.0.0 implementation cannot be tested for correctness against this section.

---

# Optional Refinements

- Replace "muddy colors" with a defined threshold or remove the term.
- Add a latency expectation to Map Theme Preview ("updates without requiring explicit refresh" is sufficient).
- Move the ASE Affinity test requirement to a QA or test plan document.
- Declare Playlist Theme Preview as explicitly lower priority than Map Theme Preview in v1.0.0, or bring it to the same specification depth.
- Remove Palette Cycling from this spec entirely and note it as a future runtime integration concern.
- Add a non-goal: "COLORLAB does not own WOS map layer names. Palette roles are COLORLAB vocabulary."

---

# Production Readiness

**Conditionally Ready**

The specification's doctrine reset is correct and necessary. The product boundary, non-goals, and primary workflow are well-defined. The data models are implementable. However, three blocking items — palette role ownership, map preview rendering target, and seed generator specification — must be resolved before the spec can drive implementation without producing ambiguous or conflicting outcomes.

---

# Review Status

**Approved with Major Revisions**

The core doctrine is sound and the scope reduction from previous COLORLAB versions is the right architectural move. Major revisions are required on: (1) role vocabulary ownership declaration, (2) map preview surface contract, (3) seed generator output specification.

---

# Recommended Semantic Version Change

**Minor**

The specification introduces a substantial scope reset from prior COLORLAB documents and adds several new sections (Palette Collections, Palette Cycling, multi-format export contracts) that were not present or were underspecified before. A patch increment would understate the scope of change. A major increment is not warranted because the core palette data model and export contracts are evolutionary, not breaking. Minor is appropriate.
