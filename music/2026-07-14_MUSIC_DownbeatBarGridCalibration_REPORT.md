# MUSIC Downbeat and Bar Grid Calibration Report

**Document ID:** `2026-07-14_MUSIC_DownbeatBarGridCalibration_REPORT`
**Build:** `0714_MUSIC_Downbeat_And_Bar_Grid_Calibration_v1.0.0_BUILD`
**Generated:** 2026-07-14
**Detector version:** `beat-map-v2` → `beat-map-v3`

---

## 1. Candidate-Phase Architecture

Replaced the old "check only the first 4 beats, low-band envelope only" downbeat method (0713D §8) with multi-candidate-phase evaluation (`downbeatPhaseCandidates.ts`): for a given meter (beats-per-bar), every phase 0..N-1 is scored across the **entire stable region** (every bar, not just the first), combining seven evidence components per candidate (`DownbeatPhaseCandidate`). The winning phase must clear both an absolute-score floor and a meaningful margin over the runner-up (`barGridConfidence.ts`) — a near-tie stays unselected (`selectedPhase: undefined`) rather than guessing.

## 2. Evidence Components

| Component | Source | Notes |
|---|---|---|
| `lowBandAccentScore` | crude moving-average low-pass envelope (reused from 0713D, not real bandpass FFT) | normalized relative to the strongest phase per track, not absolute magnitude |
| `broadbandAccentScore` | existing onset envelope | supporting evidence only, capped at 10% weight |
| `recurrenceScore` | periodicity of the phase's accent across ALL bars + missing-bar/false-reset penalties | combines `barRecurrence.ts`'s `BarRecurrenceEvidence` |
| `structuralChangeScore` | change-point detection on the SAME onset envelope's local moving-average trend (spectral-flux-style proxy, no new FFT pass) | neutral (0.5) when no change points exist at all |
| `harmonicChangeScore` | **always 0.5 (neutral)** — no per-frame chroma contour exists in the current key detector; building one would be a parallel feature-extraction pipeline, explicitly disallowed (§7) | honestly documented as unavailable, per spec's own required test ("missing harmonic evidence remains neutral") |
| `phraseBoundaryScore` | soft heuristic: does the candidate's bar count land close to a 4/8/16/32-bar phrase boundary | supporting evidence only |
| `consistencyScore` | does the phase's advantage hold up across all 4 quarters of the track, not just one region | guards against one loud event dominating |

## 3. Final Weighting

Kept the spec's §14 initial conceptual allocation exactly, split evenly within each bucket (centralized in `downbeatPhaseCandidates.ts`'s `DOWNBEAT_CANDIDATE_WEIGHTS`):

```
lowBandAccentScore     0.25
broadbandAccentScore   0.10
recurrenceScore        0.25
structuralChangeScore  0.15
harmonicChangeScore    0.10
phraseBoundaryScore    0.10
consistencyScore       0.05
```

No changes made after calibration — the initial allocation already produced 0% false-trust and materially improved trusted-count without any weight tuning being necessary.

## 4. Ambiguity Logic

`barGridConfidence.ts`: `margin = bestScore − secondBestScore`; a phase is only selected when `margin ≥ 0.15` AND `bestScore ≥ 0.45`. Below either threshold, `selectedPhaseIndex`/`firstDownbeatSeconds` stay `undefined` and `BEAT_MAP_DOWNBEAT_PHASE_AMBIGUOUS`/`BEAT_MAP_BAR_PHASE_AMBIGUOUS` fire. `BEAT_MAP_DOWNBEAT_EVIDENCE_CONFLICT` fires when accent evidence and structural evidence disagree by more than 0.5 (one says "here," the other says "there"). `BEAT_MAP_BAR_PHASE_UNSTABLE` fires when the winning phase's consistency across track quarters drops below 0.4.

## 5. Meter Handling

`meterEvidence.ts` evaluates beats-per-bar ∈ {4, 3, 6} independently (full phase-candidate evaluation for each), with only a small +0.05 tie-breaking bonus toward 4/4 (§10: "support 4/4 first" — a preference, not a forced default). When no candidate meter clears a 0.4 confidence floor, `meter = "unknown"` and `BEAT_MAP_METER_UNCERTAIN` fires; `timeSignature` and bar generation are skipped entirely rather than defaulting to 4/4. Verified live in the calibration test suite: a genuine 3-beat accent cycle superimposed on a steady grid correctly resolves to `3/4` (candidate score 0.807 vs. 4/4's 0.656), not a silently-mislabeled 4/4.

## 6. Dataset Composition

Reused the existing 20-fixture synthetic set (`calibrationFixtures.ts`) plus 3 new dedicated fixtures (`downbeatBarFixtures.ts`): a genuinely displaced accent (loud event never on a true downbeat candidate), a true near-tie ambiguous phase, and a meter-conflict fixture (3-beat cycle vs. a "4/4-looking" grid). Plus the same 3 real library tracks used in the two prior calibration builds ("White Ropes," "Going Around," "Happiness").

## 7. Downbeat/Bar Accuracy

`downbeatBarMetrics.ts` computes downbeat/bar-specific precision/recall/F-measure at ±100ms/±120ms tolerance, separate from beat-timing accuracy. On the base synthetic set, the correct phase won on every strong-accent fixture (verified directly via dedicated tests, not just aggregate scores) and margin computation was verified to match the actual candidate score spread exactly.

## 8. Results by Rhythm Class (synthetic set, before → after this build)

| Fixture | downbeat before | downbeat after | bar before | bar after | status before → after |
|---|---|---|---|---|---|
| synth_01_perfect_4_4_click | 0.500 | 0.816 | 0.500 | 0.810 | trusted → trusted |
| synth_02_quarter_note_kick | 0.300 | 0.439 | 0.300 | 0.435 | partial → partial |
| synth_05_half_time_groove | 0.500 | 0.807 | 0.500 | 0.794 | partial → **trusted** |
| synth_06_double_time_groove | 0.500 | 0.871 | 0.500 | 0.868 | partial → **trusted** |
| synth_13_weak_downbeat_accent | 0.050 | 0.886 | 0.000 | 0.879 | partial → **trusted** |
| synth_14_irregular_accents | 0.040 | 0.806 | 0.000 | 0.800 | partial → **trusted** |
| synth_04_swing_offsets (broken beat) | — | 0.820 | — | 0.814 | trusted → trusted (syncopation not falsely penalized) |
| synth_16_additive_noise | 0.150 | 0.362 | 0.000 | 0.362 | partial → partial (correctly stays weak) |

Trusted count: **4/20 → 11/20** on the synthetic set. `synth_13_weak_downbeat_accent` and `synth_14_irregular_accents` moved into "trusted" because the multi-evidence combination (recurrence + structural + phrase-boundary + consistency, not accent contrast alone) found real corroborating evidence even when raw accent strength was deliberately weak by fixture design — this is the intended behavior of the redesign (accent is no longer the ONLY signal), not a threshold change.

## 9. False-Trust Comparison

**False-trust rate: 0%, unchanged.** Zero synthetic fixtures were ever trusted with a beat F-measure below 0.9, before or after this build. The primary objective (§25 "confidently wrong half/double grids: 0" from the prior calibration build, and this build's own §17 "Playlist Repair Protection") held throughout.

## 10. Before/After Real-Track Confidence

| Track | 0714A confidence (bottleneck: downbeat/bar) | 0714B confidence | downbeat/bar after | Still trusted? |
|---|---|---|---|---|
| White Ropes | 0.297 | 0.357 | 0.417 / 0.416 | No — correctly, evidence still genuinely weak on real audio |
| Going Around | 0.280 | 0.325 | 0.285 / 0.285 | No |
| Happiness | 0.430 | 0.500 | 0.383 / 0.383 | No |

All three real tracks improved (downbeat/bar components roughly 2–5x higher than 0714A), and all three now surface explicit, named ambiguity warnings (`BEAT_MAP_DOWNBEAT_PHASE_AMBIGUOUS`, `BEAT_MAP_BAR_PHASE_AMBIGUOUS`, `BEAT_MAP_DOWNBEAT_EVIDENCE_CONFLICT`) explaining exactly why trust was withheld, rather than a single opaque low number. None crossed the trust threshold — this is the correct outcome: real music genuinely has more ambiguous downbeat evidence than even a moderate-accent synthetic click track, and the goal was explainability plus genuine improvement, not forcing real tracks into "trusted."

## 11. Detector-Version Decision

**`beat-map-v3`**, implemented. Production downbeat/bar SELECTION logic materially changed (multi-candidate-phase evaluation replacing the old first-4-beats method) — required by §19. This build does NOT also implement the separate variable-tempo/tempo-segmentation architecture change documented as a limitation in 0714A — per §19's explicit instruction, these are not combined into one version bump.

## 12. Unresolved Limitations

1. **Harmonic-change evidence is permanently neutral** in this build — no per-frame chroma/harmonic contour is exposed by the existing key detector, and building one would be a second, parallel feature-extraction pipeline (explicitly disallowed, §7/§22). A future build could add a lightweight per-frame chroma contour as a shared feature (reusable by both key detection diagnostics and downbeat evidence) — not attempted here.
2. **Low-band accent evidence remains a crude moving-average low-pass**, not the spec's suggested real 20-120Hz/120-300Hz bandpass split (§7). This build focused on multi-phase COMPARISON and evidence COMBINATION (the actual bottleneck identified in 0714A), not replacing the underlying low-band signal primitive — a real bandpass filter is a reasonable future refinement but was not the calibration priority this build addressed.
3. **`falseResetPenalty` in `BarRecurrenceEvidence` is currently always 0** — the schema field exists (§7) but the actual cross-phase "does another phase consistently outscore this one in the same bar" comparison was moved to and implemented in `downbeatPhaseCandidates.ts` (where all phases are available together) rather than duplicated inside `barRecurrence.ts` itself. `BarRecurrenceEvidence.falseResetPenalty` is schema-complete but not the field actually driving the score — documented here rather than left as a silent gap.
4. **Tempo-segmentation's fixed-grid limitation (documented in 0714A) is unchanged** — explicitly out of this build's scope per §19's instruction not to combine the two changes.
5. **Real-audio downbeat/bar ground truth remains unavailable** — real-track results in §10 are qualitative confidence-component comparisons, not accuracy-metric validated (same limitation as 0714A, unresolved here).

## 13. Confirmation

Beat-timing algorithm (`beatTracking.ts`), BPM detector, key detector, tempo-segmentation architecture (`tempoStability.ts`), Playlist Repair ranking, playlist generation, section energy, Flow Curve, Playlist Flow, crate weighting, and mood model were not modified this build — confirmed via `git diff --stat` showing zero changes to those files. `computeBeatMapRepairFit` remains unwired into production ranking.
