# REVIEW — 0524E_COLORLAB_ProjectionLabUX_v1.0.0
**Reviewed:** 2026-05-24
**Reviewer:** Archival Governance Review
**Status:** [REVIEW]
**Verdict:** Governance doctrine is well-held. Four issues identified — one medium-high, two medium, one low. None block the architecture, but one requires a language fix before freeze.

---

## Overall Assessment

This is a different class of spec from the rest of the COLORLAB series — it governs a human-facing UX surface rather than a data payload or intake pipeline. The core governance posture is correctly held throughout: the UX layer may reveal governance state but may not create governance authority. Section 1 and Section 2 set this boundary clearly, and the spec doesn't drift from it in the rendering/comparison/source-context sections.

The issues are not architectural violations — they are places where the spec is silent or uses language that an implementer could reasonably misread as granting the UX layer more authority than intended.

---

## Issues

### Issue 1 — Medium-High: Intake Intent Switch Uncontrolled

**Location:** Section 16 (Intake Intent Visibility)

Section 16 defines that the UX must distinguish `review` from `activate` and establishes `review` as the default. It does not address whether the UX can change intake intent.

This is a governance gap. If an implementer reads Section 16 as allowing the UX to toggle intent from `review` to `activate`, they may build a toggle without gating it behind the approval validation required by the export governance spec (`0524_COLORLAB_PaletteRuntimeProfileExport_v1.0.0`) and the import doctrine (`0524D`).

The consequence: a user could set intent to `activate` on a profile with no approval token, bypassing the governance layer entirely — not because the UX is malicious, but because the spec didn't constrain the interaction.

**Fix:** Add an explicit rule to Section 16:

> "The UX may display intake intent. The UX may NOT change intake intent from `review` to `activate`. Intent escalation is a governance action owned by the export governance layer. The UX presents intent as read-only."

Or alternatively, if the UX is intended to allow the intent toggle, add a constraint:

> "If the UX surfaces an intent escalation control, it must enforce that activation-intent selection is blocked unless a valid governed authorization token is present in the profile's `approvalAuthorization` payload."

Either position is valid — but the current silence creates an implementation ambiguity at a governance boundary.

---

### Issue 2 — Medium: "Export Preparation" Language Implies UX Action

**Location:** Section 15 (Export Review Surface)

Section 15 states:
> "Projection Lab may expose export preparation surfaces."

"Export preparation" implies the UX participates in constructing or staging an export. This conflicts with the authority boundary defined in Section 2, which assigns export governance to the Export Governance layer — not the UX.

If an implementer reads "export preparation" as meaning the UX can configure export parameters (approval scope, intake intent, revision binding) before generating the export, the UX layer acquires governance authority it is not permitted to hold.

The body of Section 15 is correctly scoped — it lists only inspection activities (review, inspect lineage, inspect stale state, inspect recommendation scope, inspect approval state). The issue is the header phrase, not the list.

**Fix:** Replace "export preparation surfaces" with "export review surfaces." The section header should match the list content:

> "Projection Lab may expose export review surfaces."

---

### Issue 3 — Medium: Comparison Workflow Governance State Undefined

**Location:** Section 13 (Projection Comparison Workflow)

Section 13 lists comparison types but does not address governance state during comparison. When two projections are compared side-by-side — one with valid approval, one quarantined — the spec does not define how governance state surfaces for each projection in the comparison view.

Risk: an implementer could reasonably display a comparison where one projection's approved status visually bleeds into the layout for both, creating a false impression of governance equivalence.

**Fix:** Add a single rule to Section 13:

> "Governance state must be independently displayed for each projection in a comparison view. Governance status may not be merged, averaged, or omitted across compared projections."

---

### Issue 4 — Low: Section 14 Responsibility Ownership Gap

**Location:** Section 14 (Replay-Safe Review Doctrine)

Section 14 states that "Projection Lab review workflows must preserve" a list of state items (deterministic environmental state, mode state, weather state, etc.). This assigns preservation responsibility to the UX layer.

Deterministic state — particularly revision binding and source lineage — is owned by the governance and extraction layers, not the UX. If the UX is expected to *ensure* these are preserved (rather than merely *display* them), the spec is expanding UX authority inappropriately.

The issue is low severity because the list items are likely preserved at the data layer and the UX is simply reading them — but the phrasing "must preserve" could be read as an implementation requirement on the UX layer.

**Fix:** Clarify ownership:

> "Projection Lab review workflows must preserve visibility of: deterministic environmental state, mode state, weather state, time state, revision binding, source lineage. Preservation of data integrity is owned by the governance layer. The UX must not discard or mask this state during review."

---

## Structural Observations

### Governance Visibility Non-Degradation (Section 20)

The performance degradation doctrine is precise and correctly scoped. Defining governance visibility as non-degradable — while decorative overlays and environmental particles degrade first — is the correct priority ordering for an archival observatory.

### Fiction Visibility Survival (Section 18)

Explicitly requiring Fiction visibility to survive screenshot export, replay, comparison mode, and cinematic preview closes a class of implementation errors where a "clean" export strips governance labels. This is the right level of specificity for a v1.0.0 UX spec.

### Mode Visibility Continuity (Section 6)

The requirement that mode remain continuously visible — not just at entry — correctly anticipates that environmental transitions (time of day, weather change) might create opportunities for the mode label to get dropped between render states. The `plausibility ≠ authenticity` preservation requirement for Truth mode is appropriately precise.

### Authority Externalization (Section 17)

Pinning `WOS RETAINS FINAL RUNTIME AUTHORITY` as a visible persistent surface element is the right architectural position. This is not a disclaimer — it is a persistent governance indicator that prevents the UX from creating the impression that Projection Lab is a deployment surface.

---

## Summary

The spec holds its governance doctrine consistently. The four issues are all language/scoping gaps rather than architectural violations:

| Issue | Severity | Fix Type |
|---|---|---|
| Intent escalation uncontrolled (Section 16) | Medium-High | Add explicit prohibition or escalation constraint |
| "Export preparation" language (Section 15) | Medium | Rename to "export review" |
| Comparison governance state undefined (Section 13) | Medium | Add single rule: independent per-projection state display |
| Section 14 responsibility ambiguity | Low | Clarify UX displays vs. owns preservation |

The intent escalation issue (Issue 1) is the priority fix. If an implementer builds a UI toggle that lets the user switch from `review` to `activate` without an approval token, the entire intake governance chain is bypassed at the UX surface — not by design, but by spec silence.
