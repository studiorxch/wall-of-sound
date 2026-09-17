# Spatial Spraypaint V0.8.2 Current Status

Date: 2026-09-16

Status: COMPLETE — Flair Continuity Fix. The segmented/capsule-section regression reported against Track Marks' Flair-driven thick↔thin modulation is fixed at the renderer-continuity level, not by reducing Flair's range or weakening its curves. Track Marks with Flair off, Pink Dot, and every other cap are unchanged — live-verified byte-identical, not just assumed. Full automated suite, TypeScript, and production build pass.

Baseline: V0.8.1 commit `ee911e6`/`03d86dc` (Brush Studio Flair Controls), on top of V0.8 `47cf87c`/`b9ae60f` and V0.7 `407c4d0`/`2293a4a`.

## Root Cause

`SprayBrushEngine.renderSegment` sizes an entire segment's core/mist deposition from its END point's resolved `width`/`opacity` alone (`resolveSprayDynamics(cap, point.velocity, point.width)`) — it does not draw a gradient along one segment; every point from `segmentStart` to that endpoint is treated as one flat-width, flat-opacity stamp run. That is invisible for ordinary strokes, because width/opacity there only ever drift slowly from velocity (a few percent per segment).

Flair changes `width` (via `baseRadius`, which can swing across Wild's full ~4–100 wall-unit range) and `opacity` (via the output multiplier) by much larger amounts. Two compounding factors turned this into visible segmentation specifically for Track Marks:

1. **Between-batch jumps in the output multiplier.** `this.trackMarksFlairOutputMultiplier` is a single scalar recomputed once per Alt-drag pointermove sample and applied uniformly to every point rendered until the next sample updates it. `CanonicalStrokeManager.createPoint`'s own arclength resampling already smoothly ramps raw `width`/`opacity` *within* one batch (confirmed by reading `CanonicalStroke.ts` directly — this was NOT itself broken), but the Flair output multiplier was applied as one flat scalar *on top of* that ramp, per batch — so opacity could still step between batches whenever the multiplier changed.
2. **Density starved exactly where Flair needs it most.** `resolveInterpolationSpacing(baseRadius, velocity)` scales its sub-sample spacing with `baseRadius` (up to a 3.2-wall-unit ceiling) — meaning the largest, most visually prominent widths (Wild's extended range) get the *coarsest* resampling, the opposite of what continuity needs.

Together: consecutive rendered segments could land with visibly different flat widths/opacities relative to their own (comparatively long) length, and Track Marks' stochastic/dab deposition technique makes that read as stitched capsule sections rather than one continuously tapering sprayed gesture.

## Exact Fix

New module `src/FlairContinuity.ts`, two functions:

- **`resampleTrackMarksFlairSegment(previous, target)`** — pure arclength resample from the previous *rendered* point (already carrying the correct, Flair-adjusted prior width/opacity) to the new target, at a small **fixed** step (1.2 wall units, independent of `baseRadius` — so density never degrades at large sizes), linearly interpolating every field (`x`, `y`, `z`, `timestamp`, `velocity`, `width`, `opacity`). The very last resampled point is always exactly the true target value — Flair's range is never reduced, only the path to it is densified.
- **`buildContinuousSegmentEnds(previous, segmentEnds, capId, mode, outputMultiplier)`** — the single call site from `main.ts`. Applies the existing `applyFlairOutputToPoint` output multiplier first (unchanged), then — **only** for Track Marks with an active (non-off) Flair mode — replaces the batch's `segmentEnds` with the dense resample above. Every other cap, and Track Marks with Flair off, gets back the exact same values as before (`.map` over `applyFlairOutputToPoint`'s existing identity branch — same numbers, fresh array wrapper only).

`main.ts`'s `depositReconstructedPath` now builds `segmentEnds` through this one function instead of the old `[...interpolated, point]` plus an inline per-point `applyFlairOutputToPoint` call inside the render loop. No other line in `depositReconstructedPath` changed; the wet-marker paint-load branch, `renderSegment` call, and `strokeHistory.appendPoint` call are untouched.

**No changes to**: `CanonicalStroke.ts`, `SprayBrushEngine.ts` (the actual stamping/deposition technique — dab spacing, offset-rail bands, stochastic field — is completely unchanged), `FlairCurves.ts`'s curve math, or any Flair *value* (Amount/Range/Smoothing/Bloom/Output Falloff still mean exactly what they meant in V0.8.1). This is purely a denser, smoother arclength walk feeding the exact same renderer.

## True Fix or Mitigation?

**A true fix for the reported symptom, with one intentionally scoped boundary.** It resolves the actual root cause (segments sized from a single flat endpoint value, at insufficient density) rather than papering over it — e.g., it does not blur the output, does not average widths across a whole stroke, and does not change `SprayBrushEngine`'s own drawing technique. It is scoped to Track Marks + active Flair only, by design (per this and the prior briefs' explicit "Track Marks only" / "Pink Dot untouched" constraints) — if a future cap gains Flair, this same fix applies to it for free (the gate is on `capId`/`mode`, not hardcoded geometry), but nothing here changes how any *other* cap's segments are sized, since their width/opacity deltas between points were never large enough to expose this in the first place. The fixed 1.2-wall-unit resample step is a tuned constant, not a structural limitation — live testing across five different gesture types (slow curve, tight loop, long diagonal, fast reversal, tag hairline+flare) found no remaining seam at this density.

## Tests

10 new focused tests in `FlairContinuity.test.ts`, all passing:
- `resampleTrackMarksFlairSegment`: identity for a stroke's first point (no previous) and for a zero-distance dwell; produces a dense arclength walk (tens of samples across a 100-unit gap); every consecutive x/y step stays within the fixed resample bound *regardless of the endpoints' width* (proves density doesn't degrade at Wild's extended sizes); width/opacity change monotonically toward the target with no single step exceeding 20% of the total delta (proves smoothness, not just monotonicity); the final resampled point always exactly equals the true target (proves range is never reduced).
- `buildContinuousSegmentEnds`: Track Marks + active mode replaces the batch with a denser run ending at the correctly output-multiplied target; Track Marks + off is byte-identical (`toEqual`) to the raw output-multiplied segmentEnds; five other caps (Pink Dot Fat explicitly, plus New York Fat/Astro Fat/Needle/Soft-Fade) are byte-identical under every mode and an aggressive multiplier; an empty batch stays empty.

Full suite: **528/528 passing** (up from 518 before this pass — 10 new, zero regressions). TypeScript clean. Production build clean.

## Live Verification

All five required gesture types, run in the current-host browser against the actual built app via real dispatched `PointerEvent`s (Track Marks, Wall mode):

- **Slow curved thick/thin stroke**: a gentle sine-curved sweep alternating plain movement and Alt-held thickness nudges — read as one soft, continuously bulging aerosol mass, no visible seams between the thicker and thinner sections.
- **Tight loop**: a 55-unit-radius loop with thickness changing mid-loop — rendered as a smooth, evenly-toned ring; no capsule joints at the thickness transitions.
- **Long diagonal flare**: a long near→far→far→near diagonal run over real path length — one continuously swelling-then-narrowing band with clean, unbroken edges along its whole length.
- **Fast reversal**: rapid back-and-forth horizontal strokes with abrupt Alt-drag direction flips — read as one continuous, dense oversprayed mass; no stitched-together fragments visible even at the sharpest direction changes.
- **Tag combining hairlines and broad exits**: a thin hairline downstroke (Flair inactive on that portion) flaring into a broad Alt-held exit — the transition from hairline to broad base reads as one continuous taper, not a joint between two different-looking pieces.

Additionally verified, per this build's own explicit requirements:
- **Track Marks with Flair off**: after cycling back to `off` (confirmed via `#flair-status.hidden === true`), a fresh Alt-held wavy stroke rendered with Track Marks' classic constant-width undulating look, matching its pre-Flair identity exactly.
- **Pink Dot untouched**: an identical Alt-drag gesture against Pink Dot Fat was captured and compared programmatically to the exact pre-existing legacy linear formula (`current + deltaScreenY*0.15`, clamped [4,72]) — the live trace matched the reconstructed expected trace to the full floating-point digit at every one of 10 samples (`matches: true`). Pink Dot's own dwell/dot rendering was screenshotted and shows its normal loaded-dot bloom + halo speckle, undisturbed.
- **No console errors** at any point across the full sequence (five gesture screenshots, the off-mode check, and the Pink Dot comparison).

Screenshots were captured inline during this session's browser-tool verification (visible in the conversation transcript); no separate image export exists in this repo, matching this prototype's established live-verification practice (no persisted screenshot artifacts elsewhere in this codebase's checkpoint docs either).

## Scope Discipline

Per the brief's "Keep scope strictly to Flair continuity" — nothing else changed. No Flair curve equation, no Brush Studio control, no override/session model, no Pink Dot code path, no drip physics, no Fill behavior, and no other cap's rendering were touched. `SprayBrushEngine.ts` itself has zero diff.

## Files

New: `src/FlairContinuity.ts`, `src/FlairContinuity.test.ts`.
Modified: `src/main.ts` (`depositReconstructedPath`'s `segmentEnds` construction routed through the new `buildContinuousSegmentEnds`; the old inline per-point `applyFlairOutputToPoint` call removed from the render loop, since it's now folded into the same function).

## Commit

`<pending — see final report>` — "fix: Spatial Spraypaint Flair continuity — dense arclength resample removes segmented/capsule artifacts, Track Marks only"
