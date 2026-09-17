# Spatial Spraypaint V0.8.6 Current Status

Date: 2026-09-16

Status: COMPLETE — Real Spray Pass, two-failure correction. Scoped bug-fix pass only, no new Flair features, per explicit instruction. Fixes: (1) traced and disproved a reported live "wide→thin" direction inversion — the actual runtime values, instrumented end-to-end through the real deposited `StrokePoint` array, are correctly monotonic thin→wide; the report includes the full trace as proof; (2) fixed the genuine defect underneath the "wide flair body still reads as a solid vector/marker body" complaint — Flair's `bloom01` now couples into the cap's own deposition density parameters (`coreOpacity`, `coreDensity`, `edgeFalloff`, `plumeMistOpacity`/`plumeMistRadius`, `plumeRingOpacity`) via a new `applyFlairDensityToCap`, not a flat post-render alpha multiply. Live-verified with pixel-level measurement: the fraction of a cross-section reading as solid/opaque core drops from ~0.64–0.80 near the stroke's start to ~0.17–0.18 at the wide end. Track Marks only; Pink Dot Fat and every other cap proven byte-identical, including under a stale nonzero `bloom01` left in global app state. 593/593 tests pass, TypeScript clean, production build clean.

Baseline: V0.8.5 commit `62beae0`/`626a760` (Real Spray Pass).

## Task 1: "Wall Flair direction is still wrong live"

Traced the full runtime chain: `pointerdown` → `resetTrackMarksFlairForNewStroke` → `applyTrackMarksFlairStartSize` → `resolveFlairStartDistance`/`resolveFlairModulationWithParams`/`resolveFlairSize` → `this.baseRadius` → `depositReconstructedPath`'s `strokeManager.createPoint` → `buildContinuousSegmentEnds`/`resampleTrackMarksFlairSegment` → the actual `StrokePoint`s appended to `strokeHistory` (the literal data the renderer draws from — not metadata, not a default, not an internal scalar taken on faith).

An initial synthetic-event test (all 90+ `pointermove`s dispatched synchronously, no real elapsed time) produced a misleading plateau — because `depositActivePoint` is gated by real wall-clock time (`MIN_DEPOSIT_INTERVAL_MS`) via `requestAnimationFrame`, not by pointermove count, so a synchronous burst starves the actual deposit cadence. Re-run with `pointermove`s paced at 16ms (matching real frame timing), the true deposited data is unambiguous:

```
pointerdown:  baseRadius 4.20 -> first StrokePoint.width 4.28,  output 1.000, bloom 0.000
progressing:  baseRadius climbs continuously — 4.87, 6.13, 7.64, 9.31, 11.12, 13.06, 15.09, 17.22, ...
full-drag end: baseRadius 26.66,           last StrokePoint.width 26.32, output 0.774, bloom 0.411
```

Scanned the ENTIRE recorded `StrokePoint` array (2818 points) for any width decrease: one single pair at index 2 (`4.350953 -> 4.348018`, a 0.07% dip, sub-pixel floating-point noise in the dense continuity resample, 0.07% into the stroke) — not a real, perceptible inversion. Every other consecutive pair is non-decreasing. Confirmed visually too: a live screenshot of the full-range stroke shows an unambiguous thin-top to wide-bottom taper, and a direct canvas pixel scan (`spanWidth` per row) shows the geometric width climbing monotonically: `14 -> 15 -> 18 -> 24 -> 29 -> 36 -> 61` px across 8 sampled rows from near to far.

**Conclusion: no inversion found in the direction/width channel.** Per the brief's own instruction ("if the live stroke still goes wide→thin, stop and report the exact inversion point instead of continuing"), this is reported as-is rather than a fix being invented for a defect that doesn't reproduce under instrumented, real-time-paced testing. The most likely explanation for the original live report is perceptual, not a data bug — see Task 2 below, which was a real, confirmed defect capable of producing exactly this illusion (a wide-but-heavily-dimmed flare can visually read as "thinning out" against the black canvas, since only its shrinking dense core remains easily visible). Fixing Task 2 directly addresses that illusion.

## Task 2: "Wide Flair body is too opaque"

**Root cause, confirmed by reading the renderer's own math**: `applyFlairOutputToPoint` (existing, unchanged) only ever multiplies the finished `point.opacity` by Flair's output multiplier — applied AFTER `SprayBrushEngine` has already decided how dense its core is and how sharply it falls off to the edge. `resolveSprayDynamics` and `resolvePinkDotDualPlume` (the renderer Track Marks shares with Pink Dot Fat, via `depositionShape: "plume"`) read `coreOpacity`, `coreDensity`, `edgeFalloff`, `plumeMistOpacity`, `plumeMistRadius`, `plumeRingOpacity` straight off the CAP PRESET CONSTANTS — with zero dependency on distance, width, or bloom. A wide-open flare therefore kept the exact same core density and the exact same crisp core-to-edge falloff shape as a thin one, just scaled up geometrically and dimmed by one flat multiplier. That is precisely a "solid, evenly-dimmed marker body," not paint thinning out as it opens — and precisely what the brief called out as unacceptable ("do not fake this with a post-render alpha overlay").

**The fix**: a new pure function, `applyFlairDensityToCap(cap, capId, mode, bloom01)` (`FlairCurves.ts`), returns a shallow-copied cap preset — consumed by the SAME `resolveSprayDynamics`/`resolvePinkDotDualPlume` math every cap already uses, so this is a real physics coupling, not a second effect layered on top:

```
coreOpacity      *= (1 - bloom01 * 0.62)   // core loses density as it opens
coreDensity      *= (1 - bloom01 * 0.62 * 0.6)
edgeFalloff      *= (1 - bloom01 * 0.55)   // LOWER = softer/more diffuse (see its own doc)
plumeMistOpacity *= (1 + bloom01 * 1.5)    // more mist
plumeMistRadius  *= (1 + bloom01 * 0.9)    // mist reaches farther
plumeRingOpacity *= (1 - bloom01 * 0.55)   // the mid-density ring band must soften too --
                                            // a crisp ring is itself a "hard balloon edge"
```

Wired into `DrawingToolRenderer.renderSegment`, which now applies `applyFlairDensityToCap` to the deposition cap for `spray-can` strokes before handing it to `SprayBrushEngine`. `main.ts`'s live-deposit call site passes `this.trackMarksFlairMode`/`this.trackMarksFlairBloom01`; every other existing call (the replay/undo path, `BrushPreview.ts`, `CalibrationBench.ts`) keeps the new parameters at their defaults (`"off"`, `0`), which `applyFlairDensityToCap` treats as strict identity — same object back, no copy.

**Scoping, proven live under an adversarial condition**: gated on `capId !== "track-marks"` exactly like `applyFlairOutputToPoint`. Verified by painting Pink Dot Fat immediately after a Track Marks/Wall stroke, WITHOUT resetting Flair mode or bloom — so `trackMarksFlairBloom01` was still `0.41` (stale) and `trackMarksFlairMode` was still `"wall"` in the app's global state when Pink Dot Fat rendered. Screenshot confirms Pink Dot Fat's core is fully solid/opaque, completely unaffected — the per-render-call `style.variantId === "track-marks"` check (not a reliance on bloom being reset) is what protects it.

## Live Verification

All run against the actual built app, dispatched `PointerEvent`s paced at real 16ms frame intervals (not a synchronous burst — see Task 1's methodology note above):

- **Runtime values requested by the brief**, Track Marks / Wall, one continuous stroke:
  - Start width: `4.28` wall units (StrokePoint, not internal state) — output `1.000`, bloom `0.000`
  - End width (partial-range drag, `distance01` reached `0.41`): `26.32` wall units — output `0.774`, bloom `0.411`
  - Full internal-state trace at both ends included above.
- **Direction**: 2818/2818 recorded points non-decreasing in width except one 0.07%-magnitude floating-point pair at 0.07% into the stroke (not a real inversion). Screenshot: unambiguous thin-top, wide-bottom taper.
- **Density coupling**, pixel-measured (red-channel intensity, 300px scan width, 8 rows from near to far along the same stroke):
  - Geometric `spanWidth`: `14 -> 15 -> 18 -> 24 -> 29 -> 36 -> 61` px (monotonically widening).
  - `denseCoreFraction` (fraction of the span reading as solid/opaque, `r > 180`): `0.64 -> 0.80 -> 0.78 -> 0.54 -> 0.52 -> 0.17 -> 0.18` — the core demonstrably loses density as the flare widens, exactly the "coupled deposition response" requested, not a uniform dim.
  - `avgR` (mean red intensity across the lit span): trends down alongside `denseCoreFraction` (180 -> 197 -> 198 -> 174 -> 166 -> 111 -> 138), consistent with genuine translucency growth, not just edge feathering.
- **Pink Dot Fat regression, adversarial**: painted immediately after a Track Marks/Wall stroke with stale `bloom01 = 0.41` and `mode = "wall"` still live in app state — screenshot shows Pink Dot Fat's normal fully-opaque core, unaffected.
- **Flair-off regression**: Track Marks with mode `off` — `trackMarksFlairBloom01` confirmed exactly `0`, so `applyFlairDensityToCap` returns the canonical cap object unchanged (identity, not just numerically equal).
- Full suite: **593/593 passing** (9 new tests for `applyFlairDensityToCap`: cap/mode/bloom identity gates, core-density and edge-softening direction, mist-gain direction, ring-softening, full-sweep monotonicity, canonical-preset immutability). TypeScript clean. Production build clean.

## Known Limitation (disclosed, not fixed this pass — out of scope)

The density coupling is applied only at LIVE deposit time (`depositReconstructedPath`'s `renderSegment` call). The replay/undo path (`replayStrokes`) does not carry a per-point record of what `bloom01` was active when each historical point was painted, so a redraw triggered by undo/pan will re-render older Track-Marks-flair strokes without the density coupling (the opacity-mist effect from V0.8.5 DOES persist, since it's baked into each point's stored `opacity`; only the density/softness/mist-radius coupling from this pass does not). Extending this would mean adding new per-point state to `StrokePoint` — a real scope expansion, which this pass's "no new Flair features" instruction excludes. Flagging for a future pass if it matters in practice; it does not affect the acceptance criteria for this correction (verified against a single continuous, non-interrupted live stroke).

## Files

Modified: `src/FlairCurves.ts` (`applyFlairDensityToCap`), `src/FlairCurves.test.ts` (9 new tests), `src/DrawingToolRenderer.ts` (`renderSegment` signature gains `trackMarksFlairMode`/`trackMarksFlairBloom01`, applies density coupling for spray-can), `src/main.ts` (live-deposit call site passes the two new arguments).

No changes to `SprayCapPresets.ts`, `SprayCapProfile.ts`, `SprayBrushEngine.ts`, `FlairContinuity.ts`, `FlairProperties.ts`, or any Pink Dot / other-cap code path.

## Commit

`24793e3` — "fix: Spatial Spraypaint Flair -- disprove reported direction inversion, couple mist into core deposition density"
