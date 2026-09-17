# Spatial Spraypaint V0.10.11 Current Status

Date: 2026-09-17

Status: COMPLETE — Root Profile Correction (undoing the V0.10.10 circle overcorrection). The explicit circle at the drip root is removed; the pooled root now comes entirely from width interpolation along the drip strip itself (shoulder → short neck → body → tapered tail). 618/618 tests pass, TypeScript clean, production build clean.

Baseline: V0.10.10 commit `af98e82`/`8c890c4` (the stamped-circle root this pass corrects).

## What was wrong

V0.10.10 added `WetDripEngine.fillRoundedRoot()` — a standalone filled circle drawn at every drip's origin, sized to `originPoolRadius`. Live-verified: it read exactly as reported, a distinct perfect circle "stamped" at the root with a visible seam where it met both the mark body above and the tapering drip below — the opposite of "attached to pooled liquid."

## Correction (three iterations, verified visually at each step)

1. **Removed the circle entirely.** `fillRoundedRoot()` and its two call sites in `WetDripEngine.ts` deleted. The root's shape now comes ENTIRELY from the drip strip's own width interpolation (`resolveDripStripSection` in `DripLogic.ts`) — never a separate primitive.
2. **First curve attempt (asymmetric "hold-then-drop") overcorrected differently**: a `Math.pow(1 - t, 1.7)` blend held too close to full shoulder width for too long before dropping, producing a flat-topped rectangular "shelf" with hard 90° corners — visually confirmed via live screenshot, not just reasoned about. Reverted.
3. **Final curve**: reverted to the original smooth, C1-continuous, symmetric ease (`1 - t²(3-2t)`, the same shape used before any of this session's drip work) over a **compact** span (`shoulderSpan`: `0.18 → 0.14`, i.e. a shorter, tighter transition — the "short neck" requested) rather than an asymmetric one. This alone still showed a flat-topped shelf in one cluster — traced to a *different*, architectural cause below.
4. **Root cause of the remaining flat shelf**: the pool model (unchanged, per the brief) allows several gravity channels to share one pool node, each offset slightly in x but starting at the *same* y. Each channel independently stamping its own full-width pooled shoulder meant several wide shoulders sitting side by side at the same height — their UNION reads as a flat rectangular block with hard corners, regardless of how smooth any single channel's own curve is. Fixed in `WetPaintModel.ts`'s `spawnPoolChannel`: only the *first* channel drawn from a given pool node gets the full pooled shoulder (`originPoolRadius`); every subsequent channel from that same node gets a reduced shoulder (`× 0.45`) since it's a sibling run peeling off an already-established pool, not an independent puddle of its own. This is a root-profile decision (how big each channel's own shoulder is), not a change to *when/where/how many* channels are triggered or spaced — the pool architecture itself (deposition, merging, thresholds, channel count, node spacing) is untouched.

## Hard acceptance — verified in the canonical test stroke

- **No circular bulb stamps**: confirmed — no standalone circle exists in the code path at all anymore (`WetDripEngine.test.ts` asserts exactly one `arc` call total, the terminal tip).
- **No sharp spikes**: confirmed at two independent zoomed clusters (tail/crossbar, lower-left arm) — smooth, organic pooled bulges merging into the mark body, no angular notches.
- **Root width visibly greater than body width**: measured (see below) — root ~6× the body width at this test size.
- **Width decreases progressively over the first part of the run**: `DripLogic.test.ts`'s new test asserts strict, section-by-section monotonic decrease through the shoulder/neck region (not a plateau).
- **Taper remains visible all the way to the tail**: confirmed both by test and by measurement (terminal width ~32% of body width).
- **Reads as attached to pooled liquid, not pasted on**: confirmed visually — the root now flows continuously out of the mark body's own silhouette rather than sitting on top of it as a separate shape.

## Before / after close-ups

Both from the identical canonical scripted stroke used in the V0.10.10 report (same waypoints, same realistic point density, same dwell pauses), same zoom region, sent alongside this report:

- **Before** (V0.10.10, stashed and rebuilt to confirm): a distinct, perfectly circular bulb stamped at the root, visibly separate from the mark body and the drip taper below it.
- **After** (this pass): a smooth, asymmetric pooled bulge that flows directly out of the mark body, narrowing through a short neck into several tapering drip runs of varied length — reads as liquid being pulled from a pooled edge.

## Measured widths (from the actual generated geometry, at a representative size)

| Point | Width |
|---|---|
| Start (root, progress 0) | 62.0px |
| Neck (progress 0.14, end of shoulder span) | 13.8px |
| Body (progress 0.4) | 10.3px |
| Terminal (progress 1, tail) | 3.3px |

Root is materially wider than body (~6×); width decreases progressively and monotonically from root through neck into the body taper; taper continues visibly to a fine terminal tail.

## What was NOT touched

Drip count, pool triggering/merging/threshold logic, node spacing, Squeeze, and every other Mop behavior are unchanged — this pass only adjusted (a) how a drip's root width is rendered (strip interpolation vs. a circle) and (b) how much pooled-shoulder radius a channel gets based on whether it's the first or a later channel from its own node. `MopRuntimeParity.test.ts` (unmodified) confirms no drip detached from its rendered body as a result.

## Tests / typecheck / build

`npx vitest run`: 618/618 passing.
- `WetDripEngine.test.ts`: the two "rounded root" tests renamed/updated to assert exactly one `arc` call (the terminal tip only); the dedicated root-circle test replaced with one asserting the width-interpolation shape (wide shoulder, strictly narrowing, wider than the body, taper continues to the tail).
- `DripLogic.test.ts`: new test asserting a pooled Mop drip's root strictly narrows section-by-section through the shoulder/neck region and has fully joined the ordinary body taper by the end of that span — the direct regression guard against both the flat-plateau and the circle-stamp failure modes.
`npx tsc --noEmit`: clean. `npx vite build`: clean.

## Commit

`3d17096` — "fix: Spatial Spraypaint V0.10.11 -- remove stamped root circle, shape via width interpolation"
