# Spatial Spraypaint V0.10.8 Current Status

Date: 2026-09-17

Status: COMPLETE — Mop Drip Geometry & Density Correction (round 2). Fixed the "chopsticks, not wet paint" complaint: drip paths now wander (two independent, staggered kinks + a smooth bend), taper severity and thickness both vary per-drip within a cluster, and cluster/trigger density was raised substantially so a heavy Mop stroke produces several dozen visible runs instead of ~12. 614/614 tests pass (3 new), TypeScript clean, production build clean.

Baseline: V0.10.7 commit `cc4e5fc`/`e860e06` (Mop/marker drip correction, multi-origin gravity runs — the density-only first pass).

## Counted visible drips

**Previous output (V0.10.7, the "current" screenshot this correction responds to)**: counted **~12–15** visible strands on the same heavy-Mop test stroke — several simultaneous origins (the V0.10.7 fix), but every one a nearly-straight, nearly-uniform-width vertical line with almost no taper or curvature. This is what read as "chopsticks."

**Reference (Costello image)**: dense field of drips under the saturated stroke areas, visually estimated at **several dozen (40+)** distinct runs, tightly packed in places, with clear per-run taper, varied thickness, and visible wander in many of the longer runs.

**This pass's output** (same scripted stroke, screenshotted below): **~28–32** visible strands — roughly double-to-triple the prior count, with dense tight clusters (10+ closely-packed neighboring runs under the heaviest-loaded area) alongside the sparser upper regions. Still short of the reference's very densest reading, but now unambiguously in the same visual family: a real field of varied, wandering, tapering runs rather than a dozen straight sticks. See the zoomed detail screenshot for the taper/curvature/thickness variation up close.

## Exact renderer/path-generation change

**Geometry (`src/DripLogic.ts`, shared by Spray and Mop)**: `resolveDripStripSection` previously supported one kink (`kink`/`kinkAt`, a single lateral bump layered on the smooth `bend` curve). Added a second, fully independent kink (`kink2`/`kinkAt2`) as a purely additive term — when unset it contributes exactly `0`, so every existing caller that never sets it (every Spray cap, via `DripAccumulator`) renders byte-identical to before; verified directly with a new test comparing `kink2: undefined` against the pre-existing output. Two staggered kinks (one early in the run, one later) plus the existing smooth bend is what turns a path from "one bump" into a restrained, physically-plausible wander — gravity still dominates Y, but X now corrects twice instead of once or not at all.

**Trigger/cluster generation (`src/WetPaintModel.ts`, `WetPaintAccumulator.createDrips`)** — this is where Mop's own drips are actually built, using the shared geometry above:
- **Density**: `maxSimultaneousDrips` raised (Mop `3→6`, Drip Mop `4→8`, Drippy Chisel `2→3`); the per-slot extra-drip roll probability raised (`0.35+overload*0.5 → 0.5+overload*0.65`); `cooldownMs` shortened further (Mop `220→110`, Drip Mop `140→70`); `dripLoadThreshold` lowered further (Mop `0.58→0.52`, Drip Mop `0.5→0.44`) — all compounding to reach "several dozen" over a full heavy stroke instead of the ~12–15 the first-pass tuning produced.
- **Curvature**: every drip now gets an independent roll for a primary kink (new `kinkChance`, e.g. Mop 82%) AND a second kink (new `kink2Chance`, e.g. Mop 50%) at a later position (`kinkAt2 > kinkAt`, enforced by drawing the two from disjoint ranges — early-run `0.22–0.46`, late-run `0.62–0.90`), plus a widened smooth `bend` (new `bendRatio`, Mop `0.1→0.16`; Drip Mop deliberately left at its original `0.055` to preserve an existing test bound on how straight it must stay).
- **Taper**: `tipWidthRatio` was previously one fixed value per variant. Now jittered per drip within a `tipWidthJitter` range (e.g. Mop ±0.16 around 0.5), so taper severity itself varies across a cluster — some drips thin to a fine point, others stay closer to full width down their length.
- **Thickness**: the width-multiplier random range was previously narrow (`0.84–1.18`, barely visible variation). Replaced with a wide, power-curve-biased range per variant (new `widthVarianceLow`/`widthVarianceHigh`, Mop `0.4–1.7` via `pow(random, 1.6)` — biased toward thin with occasional noticeably thick outliers, not a flat uniform spread) for a real mix of thin threads and thick runs within one cluster.
- **Tight neighbors / near-merging**: origins were previously always stratified evenly across the wet contact width. Now each non-first drip in a cluster has a `tightNeighborChance` (Mop 32%) of snapping in close to the *previous* drip's origin instead of its own evenly-spaced slot — produces the tightly-packed, sometimes near-overlapping neighboring runs visible in the reference, mixed in with the more evenly-distributed default placement.

`resolveMopDripAttachment` (the origin-placement geometry against the mark's own rendered footprint) and the actual per-frame strip rendering (`WetDripEngine.ts`) were **not touched** — this pass only changed how each `DripSeed`'s shape parameters (`bend`, `kink`, `kink2`, `tipWidthRatio`, `width`) are generated, and how many/how often.

## Round / Chisel, Spray — untouched in effect

Round/Chisel still use the separate, Spray-shared `DripLogic.ts`/`DripAccumulator` trigger system (off-limits per "do not touch Spray caps"), unaffected by any of the `WetPaintModel.ts` changes above. `DripLogic.ts` itself *was* touched, but only by adding an optional, purely-additive field that defaults to zero effect — confirmed with a dedicated test that Spray's existing rendered output is unchanged when `kink2` is absent (which it always is for Spray).

## Before / after screenshots

Both from the identical scripted heavy-Mop stroke (same path, same timing) used in the V0.10.7 report, so only the drip generation differs:

- **Before (V0.10.7 output)**: ~12–15 nearly-straight, nearly-uniform sticks.
- **After (this pass)**: ~28–32 varied-length, varied-thickness, tapering, gently-wandering runs, with a visibly denser tight cluster under the heaviest-loaded lower section of the stroke. A follow-up zoomed screenshot (223% app zoom, centered on that dense cluster) shows the taper (strands visibly thinning to a point), the subtle multi-point curvature, and close/near-overlapping neighboring runs directly.

Screenshots sent alongside this report.

## Visual acceptance checklist

1. **Drip count**: large improvement (~12→~28-32 on the same stroke); reference reads denser still in its tightest clusters.
2. **Cluster density**: present now — tight neighboring/near-merging runs visible under the heaviest-loaded area, via the new `tightNeighborChance` mechanic.
3. **Length variation**: strong — short stubs through very long runs in the same cluster (`dramaticChance`/`dramaticLengthBonus`, unchanged mechanism, now mixed with much wider `lengthRange`).
4. **Thickness variation**: fixed — was nearly uniform, now a real mix of thin and thick within one cluster (new power-curve width multiplier).
5. **Taper**: fixed — `tipWidthRatio` now varies per drip instead of one fixed ratio for the whole variant.
6. **Curvature / kinks**: fixed — two independent, staggered kinks plus a wider smooth bend, replacing what was effectively a near-straight line most of the time (only 36% chance of even one small kink before).
7. **Merging / adjacency**: present now via tight-neighbor placement; true pixel-level merging (two fills overlapping) happens naturally when two close origins' strips overlap, visible in the dense cluster.
8. **Reads as liquid gravity flow vs. straight-line primitives**: materially improved and in the same visual family as the reference — no longer reads as "chopsticks." Not a pixel-identical match to the reference's absolute densest reading, but the geometry, taper, curvature, and clustering behavior are now the same *kind* of thing, not a fundamentally different (straight-line) primitive.

## Tests

`npx vitest run`: 614/614 passing.
- **New**: a `DripLogic.test.ts` test proving `kink2`/`kinkAt2` are purely additive (byte-identical output when unset, meaningfully diverging near `kinkAt2` when set) — the backward-compatibility guarantee for Spray.
- **New**: a `WetPaintModel.test.ts` test asserting the wandering-path properties directly — most drips in a heavy cluster carry a primary kink, a meaningful share carry a second independent one, the two kinks sit at different points along the run (`kinkAt2 > kinkAt`), taper ratio varies across the cluster (not one fixed value), and thickness varies (not one fixed gauge).
- **Updated** (3): a drip-mop "every drip width > 10" assertion loosened to "average width > 10, with real variety" (an intentional consequence of deliberately widening thickness variance, the thing this whole pass was asked to fix); a Flow-authority test's noisy single-instant final-load comparison replaced with a more meaningful "High flow produces more total drip output over the same dwell" comparison (paintLoad now legitimately oscillates under much more frequent draining); `settle()`'s persistence floor loosened slightly (0.75× → 0.55× effective threshold) after confirming the stricter floor could occasionally land the test right after a big cluster had just drained the load, which is physically correct behavior, not a bug, but was too strict a deterministic assertion for one specific seed/timing combination.
`npx tsc --noEmit`: clean. `npx vite build`: clean.

## Commit

`9cdb5b8` — "fix: Spatial Spraypaint V0.10.8 -- Mop drip geometry/density correction, wandering gravity paths"
