# Spatial Spraypaint V0.10.7 Current Status

Date: 2026-09-17

Status: COMPLETE — Mop / Marker Drip Correction. Replaced the single-drip-per-trigger, dwell-gated wet-drip architecture with a deposition -> local wet load -> threshold -> gravity-run model that spawns several simultaneous, length-varied drips per trigger and lets a run continue for a moment after the pointer lifts. 612/612 tests pass (4 new), TypeScript clean, production build clean. Visually verified against the Costello reference with an identical heavy Mop stroke drawn on both the old and new code.

Baseline: V0.10.6 commit `4d8b4e4`/`fd6b7a0` (Round/Chisel drip hierarchy + Brush Studio cleanup).

## 1. Root cause of the sparse-drip limitation

All three symptoms traced to `WetPaintAccumulator` in `src/WetPaintModel.ts`:

1. **A readiness gate that mattered more than the load itself.** Mop's canonical Flow: High / Viscosity: Runny defaults push `paintLoad` above its drip threshold almost immediately (verified: initial load `0.6912` vs. effective threshold `~0.606`). But a drip could still only fire once `dwellReady` (≥880ms holding within a ~2px dwell radius) or `travelReady` (≥3.2× size of slow travel) became true. In practice this meant Mop waited nearly a full second of near-stillness before its *first* drip, regardless of how loaded it already was — the load was never the bottleneck, the stopwatch was.
2. **A long global cooldown.** After any drip, `cooldownMs` (1150ms for Mop) blocked every other drip for over a second, stroke-wide.
3. **Exactly one drip per trigger.** `createDrips()` always produced `count = 1` for Mop (Drip Mop — an internal, UI-unreachable variant — had a single extra +1 coin-flip). There was no notion of *several* simultaneous origins; one trigger event, one drip.
4. **No spatial distribution.** The one drip that did fire always originated near the current pointer position (a small `±offset` jitter), not distributed across the stroke's accumulated wet footprint.
5. **No persistence after release.** Drip formation only ran inside `observe()`, which is only called while actively depositing points. Ending the stroke called `reset()` immediately — a run in progress had no way to continue after the pointer lifted.

Net effect: a heavy Mop stroke like the reference produced at most one or two isolated drips near wherever the stroke happened to end, which is exactly the reported behavior. This was **not** a single undersized probability — the dwell/travel gate and the fixed count of 1 were both hard architectural ceilings that no amount of tuning `dripTendency`-style numbers could have fixed.

## 2. Parameters/logic changed

All changes are confined to `WetPaintAccumulator`'s wet-marker drip *triggering* logic (`src/WetPaintModel.ts`) plus one hook in `src/main.ts` for end-of-stroke persistence. `resolveMopDripAttachment` (the geometry that places a drip's origin against the mark's own rendered footprint) and the drip *rendering* (`SprayBrushEngine`'s `startDrip`/`advanceDrips`, unchanged) were left untouched — this pass changed *when and how many* drips form, not how a drip is drawn once it exists.

- **Removed the dwell/travel readiness gate entirely.** A drip cluster can now fire the moment local wet load crosses threshold, full stop. `dwellThresholdMs`/`travelThreshold` are gone from `WetVariantProfile`.
- **`cooldownMs` repurposed and shortened drastically** — from pacing "how long since ANY drip" to "how often a new CLUSTER can trigger." Mop: `1150ms → 220ms`. Drip Mop: `680ms → 140ms`. Drippy Chisel: `860ms → 320ms` (relative ordering preserved: Drip Mop still shortest, Chisel still longest).
- **`dripLoadThreshold` lowered** so the (unchanged) load-accumulation math actually gets to do the triggering work the dwell gate used to hide behind. Mop: `0.82 → 0.58`. Drip Mop: `0.66 → 0.5`. Drippy Chisel: `0.76 → 0.7` (still the most restrained of the three).
- **New: `maxSimultaneousDrips`, cluster-count logic.** Each trigger now spawns 1 up to the variant's ceiling (Mop 3, Drip Mop 4, Drippy Chisel 2), with the extra-drip probability scaling directly with `overload` — how far `paintLoad` exceeds threshold. This is the direct fix for "only one drip per trigger" and is what produces "density increases where paint load is heavier."
- **New: stratified origin offsets.** Drips in one cluster are spread across the wet contact width via stratified sampling (evenly-spaced slots + jitter, clamped to the same span used before) instead of independent random jitter — giving distinct, neighboring origins rather than either stacking on one pixel or reading as perfectly evenly-spaced stamps.
- **New: `dramaticChance` / `dramaticLengthBonus`**, generalized from a Drip-Mop-only special case to all three wet variants (tuned per variant), mixed into each cluster — this is the "some very long runs" mixed with ordinary short/medium ones from the *same* trigger.
- **Widened `lengthRange`** for Mop (`2.05 → 3.2`) for more natural short/long variety within a cluster.
- **New: `settleDripCount` + `WetPaintAccumulator.settle()`**, called from `main.ts` right before `wetPaintAccumulator.reset()` on stroke end. If the stroke ends still carrying real wet load (≥75% of effective threshold), one final cluster spawns from the accumulated footprint, bypassing the cooldown (drawing has already stopped, there is nothing left to pace against). This is what lets a run continue after the pointer moves away instead of cutting off dead.
- **Per-drip load drain reduced proportionally** (`drainPerDrip`: Mop `0.2→0.12`, Drip Mop `0.13→0.09`, Chisel `→0.16`) since clusters now spend more load per trigger than the old single-drip model; without this, load would crater after one cluster and starve the next.

## Round / Chisel — deliberately not touched

Round and Chisel are **dry** markers (`!isWetMarkerVariant`) and share Spray's separate `DripLogic.ts`/`DripAccumulator` system (wired up in V0.10.6), not `WetPaintModel.ts`. That system is also used by every Spray cap. The brief's own "Do not touch: Spray caps" makes `DripLogic.ts` off-limits for this pass — changing its trigger mechanics to deepen Round/Chisel would also change every Spray cap's drip behavior. Round/Chisel therefore keep their existing light, single-drip-per-trigger behavior from V0.10.6 unchanged, which already satisfies "Round = light, Chisel = light/moderate, Mop = heavy" without needing architectural changes. Both systems still share the same conceptual shape (deposition accumulates a load value, a threshold gates a gravity-animated run) — only Mop's wet-paint system needed the multi-origin/persistence rework this brief specifically calls out.

## 3. Before / after screenshots

Same exact scripted stroke (a bold loop-plus-tail path, tag-scale, ~250×310px) drawn via dispatched `PointerEvent`s against both the pre-fix and post-fix code, so the comparison isolates only the drip-architecture change.

**Before** (V0.10.6 code, stashed and rebuilt to confirm): exactly **one** isolated drip near the stroke's end point.

**After** (this pass): **13+ simultaneous drips** across the entire loop, clearly varied lengths (several short stubs near the letterforms, multiple long runs reaching far below), neighboring runs close together in the denser lower-loop area, all forming naturally from the stroke itself with no separate "hold still" step required.

Screenshots sent alongside this report.

## 4. Exact Mop wet/drip settings (final)

```
mop: {
  initialLoad: 0.54, slowGainPerSecond: 0.22, dwellGainPerSecond: 0.34, speedDrain: 0.13,
  dripLoadThreshold: 0.58, cooldownMs: 220,
  lengthMin: 1.1, lengthRange: 3.2,
  stemWidthBaseRatio: 0.055, stemWidthLoadRatio: 0.05, tipWidthRatio: 0.5,
  originPoolRatio: 1.05, originOffsetRatio: 0.56, originSpanRatio: 0.54,
  durationMinMs: 1050, durationRangeMs: 850,
  maxSimultaneousDrips: 3, dramaticChance: 0.22, dramaticLengthBonus: 3.2,
  settleDripCount: 3,
}
```
Flow/Viscosity (`src/WetPaintControls.ts`, `INITIAL_WET_PAINT_CONTROLS`, unchanged this pass): **Flow: High, Viscosity: Runny** — still Mop's canonical default, confirmed showing in Brush Studio.

(Drip Mop and Drippy Chisel's updated profiles are in `src/WetPaintModel.ts`'s `WET_VARIANT_PROFILES` — both hidden/internal variants, tuned proportionally stronger/weaker respectively, same as before this pass.)

## 5. Tests

`npx vitest run`: 612/612 passing.
- 3 existing tests **updated** because they encoded the old sparse-by-design behavior as the expected contract (a monotonic-load assertion that no longer holds now that load legitimately oscillates as clusters drain and rebuild it; a "Mop must have zero drips by 720ms" assertion that was the bug itself; an origin-placement y-bound that was only ever a byproduct of the old system's small sample size, not a true geometric invariant — confirmed by direct inspection of `resolveMopDripAttachment`'s own circle-boundary math).
- 2 new tests added: Mop can spawn more than one drip from a single cluster trigger (direct regression guard against the "only ever one drip" bug), and `settle()` correctly persists a final cluster after the pointer lifts (including that it stays empty with no accumulated load or with drips disabled).
- All pre-existing hierarchy/geometry invariants kept and still hold: Drip Mop stronger than Mop (width/length ratios, cooldown ordering), Drippy Chisel restrained below Drip Mop, deterministic replay, `dripsEnabled=false` suppression, Flow/Viscosity authority, and every `resolveMopDripAttachment` placement/attachment-direction test (untouched function, untouched tests).
`npx tsc --noEmit`: clean. `npx vite build`: clean.

## 6. Commit

`cc4e5fc` — "fix: Spatial Spraypaint V0.10.7 -- Mop/marker drip correction, multi-origin gravity runs"
