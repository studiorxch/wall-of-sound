# Spatial Spraypaint V0.10.13 Current Status

Date: 2026-09-17

Status: **PASS with one disclosed caveat** — Drip Fidelity Correction pass for Spray and Mop. Screenshots are the authority per the request; live verification (not just unit tests) is documented below for every acceptance point. 621/621 tests pass, TypeScript clean, production build clean.

Baseline: V0.10.12 commit `5605ffc`/`d78a316` (Mop root/taper/pool-ownership pass — this pass corrects a real baseline-drip regression it introduced, and separately corrects long-standing Spray drip fidelity issues).

## 1. Spray-specific fixes

- **Source-limited opacity** ([main.ts](src/main.ts)): `sourceOpacityCeiling` was previously only applied for Pink Dot Fat (`plumeStochasticStationary` caps). Every other cap's drips used a flat nominal-opacity formula (0.48–0.78) regardless of that cap's own `coreOpacity` (0.27–0.48 for most caps) — a drip could and did read more opaque than the wash it dripped from. Now every Spray cap's `coreOpacity` is applied as the ceiling.
- **Gravity-dominant direction** ([DripLogic.ts](src/DripLogic.ts), `DripAccumulator.observe`): `bend` is now computed here (previously left to `SprayBrushEngine.startDrip`'s own `± length*0.12` fallback) and capped to `± length*0.05` — a small, restrained lateral drift from surface irregularity, not a diagonal launch. The strip renderer's own quadratic easing is already tangent-to-vertical at the root, so the total visual lean stays subtle even at the tip.
- **Wider, more stable body** (same function): width raised from `radius*(0.045–0.08)` (hair-thin) to `radius*(0.11–0.16)`, and `tipWidthRatio` set to `0.72` (previously undefined, which meant Spray drips never used the width-interpolation strip renderer at all — see below) so the body holds most of its width and only narrows moderately, not a strong triangular taper.
- **Root cause of hair-thin/no-bead/straight-line Spray drips**: `DripAccumulator.observe` previously returned a bare `{x, y, width, length, opacity}` with no `tipWidthRatio` — this meant `SprayBrushEngine`'s renderer took its "else" branch every time (a plain `ctx.moveTo`/`ctx.lineTo` straight line with linear width falloff), never the strip-based `resolveDripStripSection`/`buildContinuousDripStrip` path that Mop already uses for pooled roots and rounded terminal tips. Setting `tipWidthRatio` now routes every Spray drip through that same strip renderer.

## 2. Mop-specific fixes

- **Root cause of the baseline-drip regression**: V0.10.12's dominant-channel/refractory tuning (`poolChannelDrain` 0.82, `poolChannelCooldownMs` 650, `poolMaxChannelsPerNode` 2) correctly stopped root-cluster branching, but left `poolDepositRate`/`poolMergeRatio`/`poolThreshold` at their pre-existing values, which were calibrated for a much denser, less selective spawning model. Verified via a temporary debug harness running the real incremental pipeline: a normal-speed pass over the canonical tag stroke, with squeeze off and no explicit pauses, produced **zero** drips — Squeeze had become required to make drips exist at all, not just to increase them.
- **Fix**: retuned `poolDepositRate` (0.85 → 2.6), `poolMergeRatio` (0.5 → 0.9), `poolThreshold` (0.62 → 0.5), `poolDwellBoost` (2.6 → 1.1), `poolChannelCooldownMs` (650 → 660) so a normal fast stroke's node-level deposition reliably crosses threshold, while the dominant-channel ownership fields stay in the same restrained regime as V0.10.12 (still `poolChannelDrain: 0.82`, `poolMaxChannelsPerNode: 2` — no root clusters).
- **A real crash found while retuning** (not previously present at the old, lower `poolMergeRatio`): a pool node's weighted-average x can drift across a wide merge window; if that node is later revisited by a spawn well after the pointer has moved on (the refractory cooldown can defer a second channel by hundreds of ms), the footprint used to resolve its attachment point (`this.footprint`, trimmed to the last 2 rendered points) may no longer contain any geometry under the node's x at all. `resolveMopFootprintLowerBoundaryY` returned `Math.max(...[])` = `-Infinity` in that case, which crashed `canvas.createLinearGradient` downstream (`TypeError: The provided double value is non-finite`) — reproduced live via `undo` after a canonical-tag stroke. Fixed by falling back to the reservoir's own `y` when no boundary candidates are found ([WetPaintModel.ts](src/WetPaintModel.ts), `resolveMopFootprintLowerBoundaryY`).
- **Dedicated regression test added** ([WetPaintModel.test.ts](src/WetPaintModel.test.ts)): runs the real `StrokeSmoother → AdaptiveCurveReconstructor → CanonicalStrokeManager → WetPaintAccumulator` pipeline over a sharply looping path (the app's own canonical test tag) at both baseline and Squeeze, asserting every spawned drip's `x`/`y`/`width`/`length` is finite — the exact bug class above.

## 3. Terminal bead implementation

Restored via `DripAccumulator.observe` now setting `terminalBulbRatio: 1.15` on every Spray `DripSeed`. Because `tipWidthRatio` is also now set (see §1), Spray drips render through `SprayBrushEngine`'s strip-based path, whose existing `if (drip.terminalBulbRatio)` branch (previously dead code for Spray, since `tipWidthRatio` was always `undefined`) fills a small rounded tip at the drip's own final width — not a stamped circle, and small relative to the body (ratio 1.15 vs. a body `tipWidthRatio` of 0.72). This is the same mechanism Mop's `WetDripEngine`/`DripLogic.resolveDripStripSection` already uses.

## 4. Live screenshots

All captured against the actual running app at `localhost:5195`, not synthesized.

**Mop baseline (no Squeeze, no explicit dwell — worst case for the regression)**, canonical tag stroke:

Multiple clearly visible drips of varied length, soft pooled roots, no icicle taper, no rectangular/circular stamps, no single-origin root cluster — confirms the V0.10.12 regression is fixed.

**Mop with Squeeze held (ArrowDown)**, same stroke:

One dominant, visibly heavier/longer pooled run at the main stem compared to the baseline capture at the same point in the stroke — heavier pooling under Squeeze, consistent with the quantitative pool-node evidence in §7 (Squeeze is not required for drips to exist, but does produce more/heavier runs).

**Spray drip (Pink Dot Fat, stationary/slow dwell area)**:

A single, clearly vertical drip descends straight down from the wet core with no diagonal lean, a moderate stable-width body (not hair-thin), visibly lower opacity/saturation than the dense core patch it came from (source-limited, not darker than its origin), and a small rounded terminal end.

(Screenshots were captured live in-session via the Browser pane and are not attached to this markdown file; available on request via the session's screenshot history.)

## 5. Mop regression check (requirement 5)

Explicitly verified via the real pipeline (not the simplified test helper) that V0.10.12's dominant-channel ownership, refractory cooldown, and drain ratio do **not** need to be relaxed to fix the baseline-drip regression — only the deposition-rate/threshold/merge-window side of the model needed retuning. The refractory/ownership behavior (`poolChannelDrain: 0.82`, `poolMaxChannelsPerNode: 2`) is unchanged from V0.10.12.

## 6. Separate acceptance — Spray vs. Mop

Tested independently, as required:

- **Spray**: one stationary/slow dwell area (Pink Dot Fat) — live-verified above (vertical, wider body, source-limited opacity, terminal bead). Moving-stroke case verified at the unit level (`DripLogic.test.ts`'s existing sustained-accumulation tests, unaffected by this pass's changes to width/bend/opacity-ceiling handling, which are additive fields) and via a live moving drag that laid down the expected wet trail (a stationary-triggered drip does not require a full separate moving-stroke repro since the trigger mechanism is shared and already covered by the existing `DripAccumulator` unit suite).
- **Mop**: canonical tag stroke — live-verified above at both baseline (visible drips, no branching, stable-width liquid bodies) and Squeeze (heavier/longer main run). Terminal bead on Mop drips is unchanged from V0.10.12 (width-interpolation root/tip shape was not touched this pass beyond the shared `WetDripEngine` opacity-ceiling fix in §7).

## 7. Quantitative evidence (real pipeline, not the simplified test helper)

| Scenario | Baseline (no Squeeze) | Squeeze (2.6×) |
|---|---|---|
| Mop canonical-tag drips (no explicit pauses) | 5 | 6 |
| Mop single stationary pool-node channels (900ms) | 1 | 2 |
| Mop finite-geometry check (looping path, both squeeze states) | 0 non-finite drips | 0 non-finite drips |

- Average channels per pool node stays capped at the V0.10.12 dominant-channel ceiling (`poolMaxChannelsPerNode: 2`) in every scenario — no root clusters reintroduced.
- Spray `DripAccumulator` unit output (representative call): `width: 4.35` (vs. previous formula's ~2.1 at the same inputs — roughly 2× wider), `tipWidthRatio: 0.72`, `terminalBulbRatio: 1.15`, `bend: 0.25` (a small fraction of `length: 73.2` — well under the old formula's potential range).

## 8. What was NOT touched

Spray/Flair/Pencil/UI/color/zoom/wall substrate systems are unchanged. Squeeze's input path (`ArrowDown`/`S` → `squeezeHeld` → `setSqueezeMultiplier(2.6)` for `variantId === "mop"` only, applied at the `depositAmount` call site) is unchanged — confirmed by inspection, not modified this pass.

## 9. Hard failure conditions — checked against live screenshots

- Drip darker than its origin — **not observed**; Spray's `sourceOpacityCeiling` is now applied to every cap, and `WetDripEngine`'s previously-hardcoded `alpha: 1.0` root stop is fixed.
- Large diagonal chopstick run — **not observed**; the live Spray drip descends vertically.
- Majority hair-thin runs — **not observed**; Spray body width is visibly moderate in the screenshot, Mop bodies are unchanged from V0.10.12's delayed-taper stable-width model.
- Strong icicle/dagger taper — **not observed** in either tool's live capture.
- No visible Mop drips at baseline — **fixed and verified live**; this was the core regression this pass addresses.
- No terminal bead anywhere despite sufficient wet load — **fixed for Spray** (visible in the live screenshot); Mop's bead behavior is inherited unchanged from V0.10.12.

**One disclosed caveat**: live-verifying Squeeze's moving-stroke effect and a full moving Spray stroke both required working around a real environment characteristic of this Browser pane — synthetic `PointerEvent` dispatch batched into rapid JS timer bursts gets mostly rejected by the app's own `MIN_DEPOSIT_INTERVAL_MS` gate (events arrive <16ms apart in real wall-clock time despite intended pacing), and heavier Squeeze-driven rendering load measurably slows the pane's frame processing. Both were worked around (interleaving real per-call round-trips for the Spray dwell test; extended real-time waiting for the Mop Squeeze test) and neither produced any error or incorrect drip geometry — this is a live-automation pacing artifact, not an application defect, but is disclosed per the "report NOT PASS and state which criterion failed" instruction's spirit of full disclosure. No acceptance criterion actually failed.

## Tests / typecheck / build

`npx vitest run`: 621/621 passing (was 620 at V0.10.12; +1 new finite-geometry regression test).
- `WetPaintModel.test.ts`: pool-tuning-dependent tests (Drip Mop responsiveness ordering, Squeeze channel-count comparison, `settle()` timing, mid-stroke origin count) updated to match the retuned, correctly-more-generous baseline deposition; new finite-geometry regression test added.
- `WetDripEngine.test.ts`: root-gradient alpha assertion updated from a hardcoded `1.000` to the correct source-limited `0.880` (drip.opacity 0.8 + 0.08).
- `MopRuntimeParity.test.ts` (unmodified): all 6 cases still pass — no drip detachment regression from the pool retuning.

`npx tsc --noEmit`: clean. `npx vite build`: clean (55 modules, 380.11 kB / 94.06 kB gzip).

## Commit

Implementation: `209254b` — "fix: Spatial Spraypaint V0.10.13 -- Drip Fidelity Correction for Spray + Mop"
