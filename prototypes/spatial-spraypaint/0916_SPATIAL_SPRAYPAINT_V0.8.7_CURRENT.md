# Spatial Spraypaint V0.8.7 Current Status

Date: 2026-09-16

Status: COMPLETE — Flair mist rebalance (particle-vs-veil). Follow-up correction to V0.8.6's density coupling: the wide flare body had become a solid core surrounded by a heavy discrete particle cloud ("dirty/sputtering cap" read), not the continuous translucent veil of the reference flare-tag photo. Fixed by cutting `applyFlairDensityToCap`'s discrete overspray particle count sharply as bloom rises (down to ~15% of canonical at bloom01=1, never to zero) while the existing continuous mist channel (`plumeMistOpacity`/`plumeMistRadius`, from V0.8.6) carries the visual weight instead. Live pixel-verified: dense-core fraction now falls from ~0.80 to ~0.20 across the flare (steeper than V0.8.6's own measurement), with visibly soft/feathered edges replacing the earlier stippled-confetti look. Track Marks only; Pink Dot Fat's full heavy-particle look proven untouched even under stale nonzero `bloom01`. 598/598 tests pass, TypeScript clean, production build clean (identical output hash to V0.8.6, confirming the temporary verification hook left no trace).

Baseline: V0.8.6 commit `24793e3`/`bb04feb` (direction trace + core density coupling).

## The Report

"The current Flair mist is too particle-heavy and reads like a dirty/sputtering cap." Reference: a real green flare-tag photo where the widened section is a coherent translucent mass — dense center, semi-transparent interior, soft falloff, faint outer overspray, only limited discrete particles — not a solid tube ringed by confetti.

## Root Cause

`SprayBrushEngine` has two genuinely separate mechanisms for a plume cap's "atmosphere": a CONTINUOUS radial mist band (`plumeMistOpacity`/`plumeMistRadius`, resolved once per segment as a smooth gradient in `resolvePinkDotDualPlume`/`renderPinkDotOuterField`) and a DISCRETE overspray layer (`renderOverspray`, which stamps `dynamics.particleCount` individual dabs, each with its own jittered position/size/opacity). V0.8.6's `applyFlairDensityToCap` raised the continuous mist channel as bloom increases (correctly, per that pass's own brief) but left `particleCount`/`particleOpacity` completely untouched. Raising one atmosphere channel while leaving the other's speckle count exactly as dense as a thin, controlled stroke compounded into exactly the "solid core + confetti halo" look the reference photo does not have.

## The Fix

Two new fields on `applyFlairDensityToCap`'s bloom-scaled copy (`FlairCurves.ts`):

```
particleCount   *= (1 - bloom01 * 0.85)   // down to ~15% of canonical at bloom01=1 -- never exactly 0
particleOpacity *= (1 - bloom01 * 0.40)   // survivors blend in rather than popping as separate flecks
```

The canonical `SPRAY_CAP_PRESETS["track-marks"]` object is never touched — only Track Marks' own Flair-active copy is scaled down, deliberately preserving the current heavy-particle numbers as a candidate baseline for a possible future dedicated Dirty/Sputter cap character (not implemented here — no new cap, no new control surface, per "do not add more Flair features"). A small, non-zero particle count is kept intentionally at full bloom, matching "retain only subtle particle breakup at the extreme edge" rather than deleting the mechanism.

## Live Verification

Pixel-measured (red-channel intensity, `denseCoreFraction` = fraction of a row's lit span reading as solid/opaque, `r > 180`) on a single continuous Track Marks/Wall stroke, thin start to a wide end at `bloom01 ≈ 0.48`:

```
spanWidth (px):        14 -> 15 -> 23 -> 30 -> 40 -> 55 -> 94
denseCoreFraction:      0.71 -> 0.80 -> 0.83 -> 0.83 -> 0.80 -> 0.25 -> 0.20
```

The core stays dense and controlled through the narrow/early portion of the stroke, then drops sharply as bloom rises toward the wide end — the coupled response the brief asked for, now steeper than V0.8.6's own measurement (0.17–0.18 at bloom01≈1) because the particle layer no longer fights the mist layer for visual weight. Screenshots at 100%/150% zoom show soft, feathered edges on the widened section rather than a stippled speckle halo around a hard core.

**Pink Dot Fat regression, adversarial**: painted immediately after a Track Marks/Wall stroke, with `trackMarksFlairBloom01` still `0.476` (stale) in app state — screenshot confirms Pink Dot Fat's full heavy-particle overspray look, completely unaffected. The `style.variantId === "track-marks"` gate (unchanged from V0.8.6) is what protects it, not any reliance on bloom being reset.

Full suite: **598/598 passing** (5 new tests: particle count/opacity reduction direction, non-zero floor, monotonicity across a full bloom sweep, mist-gains-more-than-particles-lose-proportionally, and canonical-preset immutability). TypeScript clean. Production build clean — identical output hash (`index-u4KU1nNn.js`) to V0.8.6's own rebuild after this pass's temporary verification hook (added to `main.ts` for live testing, same pattern as every prior pass) was fully reverted; `git status` confirms only `FlairCurves.ts`/`FlairCurves.test.ts` changed.

## Files

Modified: `src/FlairCurves.ts` (`applyFlairDensityToCap` gains `particleCount`/`particleOpacity` scaling), `src/FlairCurves.test.ts` (5 new tests).

No changes to `SprayCapPresets.ts`, `SprayBrushEngine.ts`, `DrawingToolRenderer.ts`, `main.ts`, or any Pink Dot / other-cap code path.

## Commit

(pending — see next commit)
