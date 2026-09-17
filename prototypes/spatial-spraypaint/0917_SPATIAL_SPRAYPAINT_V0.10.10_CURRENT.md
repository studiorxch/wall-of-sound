# Spatial Spraypaint V0.10.10 Current Status

Date: 2026-09-17

Status: **PASS.** Mop Visual Correction — Hard Acceptance Pass. All MUST PASS criteria (A–F) satisfied and visually verified in the supplied screenshots; Squeeze (E) implemented and verified through the existing pool model. 617/617 tests pass, TypeScript clean, production build clean.

Baseline: V0.10.9 commit `519ba86`/`d69ef5d` (pooling wet-field model, the "before" this pass corrects).

## 1. Root cause of sharp drip origins

`WetDripEngine.ts`'s `prependHiddenDripUnderlap()` prepended a hidden segment (used to tuck a drip's start under the mark body, hiding the seam) whose width was deliberately only `max(drip.width, origin.width * 0.72)` — **72% of the strip's own first-section width**, not matched to it. Since a drip's first visible section is already flared out to the pooled shoulder width (`shoulderWidth = max(stemWidth, originPoolRadius * 2)`), this created a hard width discontinuity right at the seam: narrow hidden segment → sudden flare to the wide pooled shoulder → immediate taper back down. Rendered as a flat-topped polygon with no rounding at all at the top edge, that discontinuity is exactly what read as a sharp spike/pinched corner at the drip's root. It was there from the moment this hidden-underlap mechanism was added (`c05dc9e`, an earlier pass) but only became visually obvious once drips got wide enough (this pass's own width increase, see §3) for the mismatch to be legible.

## 2. Root cause of segmented Mop body

Two separate over-triggering effects compounded:
- `resolveWetContactBulgeScale()` (`PaintMarkerEngine.ts`) treated any point with velocity below `0.1` as a genuine dwell/pause and applied up to a 10% radius bulge there. A real hand/mouse stroke's velocity naturally dips below that threshold at many points along an otherwise continuous, unremarkable pass — not just genuine pauses — so this bulge kept re-triggering across normal movement, compounding with the always-on per-joint circle (`fillRoundedWetJoin`, drawn at every deposited point for every wet-variant segment) to read as a chain of small round knots/capsules.
- Separately, the synthetic test methodology in earlier passes' reports used very sparse, large-jump waypoints (dispatching `pointermove` only at ~16 manually-scripted points, 40–70px apart) to simulate a stroke — far coarser than any real mouse/Pencil input, which fires continuously. At that artificially low sample density, a tightly-curved section (like the top loop) produces a visibly "polygon of circles" envelope rather than a smooth curve. Verified directly: the same code, redrawn with realistic point density (~8px steps, matching natural continuous pointer movement), already rendered as one smooth continuous mark with the fix in this section — confirming the bulge-scale over-triggering was the fixable part, and prior test methodology had been overstating the defect. Both were addressed: the bulge fix reduces genuine artifacts under any sampling density, and all comparisons in this report now use realistic point density.

## 3. Exact width/taper changes

`WetPaintModel.ts`, Mop profile (the UI-reachable variant):
- `stemWidthBaseRatio`: `0.055 → 0.12`; `stemWidthLoadRatio`: `0.05 → 0.09` (substantially wider upper body)
- `tipWidthRatio`: `0.5 → 0.22` (dramatic taper — terminal width now a small fraction of start width, not roughly half)
- `originPoolRatio`: `1.05 → 1.2` (bigger pooled root)
- `widthVarianceLow/High`: `0.55/1.45 → 0.85/2.1` (raised floor so nothing reads as hair-thin; raised ceiling for real thick/thin contrast)
- `tipWidthJitter`: `0.14 → 0.08` (less variance so the taper stays reliably dramatic, not accidentally thick-tailed)

Drip Mop (internal/unreachable variant, scaled up proportionally, existing hierarchy invariants preserved): `stemWidthBaseRatio` `0.16→0.24`, `stemWidthLoadRatio` `0.12→0.18`, `widthVarianceLow/High` `0.75/1.4→0.9/2`.

`WetDripEngine.ts`:
- `prependHiddenDripUnderlap`: `hiddenWidth` now equals `origin.width` exactly (was `origin.width * 0.72`) — removes the width discontinuity at the root seam.
- New `fillRoundedRoot()`: fills a circle at the drip's true origin `(drip.x, drip.y)`, radius = `originPoolRadius`, called before the strip fill in both `renderCompletedDrip` and `renderGrowingDrip` — rounds the flat top edge into a genuine pooled bulb. Mirrors the existing `fillRoundedTip()` at the tail end.

`PaintMarkerEngine.ts`: `resolveWetContactBulgeScale`'s dwell-velocity threshold tightened `0.1 → 0.025` and magnitude reduced `0.1 → 0.045` (see §2).

## 4. Exact Squeeze input path

- `src/main.ts`: `squeezeHeld` boolean field, set by `keydown`/`keyup` listeners on `ArrowDown` (primary, `preventDefault`ed to stop page scroll) and `S`/`s` (alternate) — ignored while typing in any input/textarea/select, matching the existing `F` (Flair cycle) shortcut's precedent. A `blur` listener also releases it, so it can never get stuck held. `MOP_SQUEEZE_MULTIPLIER = 2.6` constant.
- At the exact point deposition happens (`depositReconstructedPath`, immediately before `wetPaintAccumulator.observe(...)`): `this.wetPaintAccumulator.setSqueezeMultiplier(this.squeezeHeld && style.variantId === "mop" ? MOP_SQUEEZE_MULTIPLIER : 1)`. Mop-only by the explicit `variantId === "mop"` check (Drip Mop and Drippy Chisel are unaffected even if the field were somehow held during their strokes, since neither is reachable via the shipped UI anyway).
- `src/WetPaintModel.ts`: `WetPaintAccumulator.setSqueezeMultiplier(value)` stores the multiplier; `depositIntoPool()`'s `depositAmount` calculation multiplies by it directly: `elapsedSeconds * poolDepositRate * (dwellBoost or 1) * modifiers.delivery * this.squeezeMultiplier * (0.4 + paintLoad*0.6)`. **Squeeze only ever scales this one number.** Every downstream step — merging into pool nodes, crossing `poolThreshold`, spawning a channel via `spawnPoolChannel`, that channel's width/length coming from the node's own flux — is the exact same, unmodified pool-model code path exercised at baseline. No code path spawns a drip directly from `squeezeHeld`; the multiplier is invisible past `depositIntoPool`.
- Releasing the key sets `setSqueezeMultiplier(1)` on the very next deposit call — no lingering elevated state (verified by test, see §7).

## 5. Screenshots

All three from the **identical scripted stroke** (same waypoints, same realistic ~8px pointer-move density, same three 700ms dwell pauses at waypoints 3/7/12), sent alongside this report:

1. **Before** (V0.10.9 code, stashed and rebuilt to confirm, same stroke): visible sharp angular pinch where drips meet the mark body; drips read as thin threads.
2. **Corrected baseline Mop** (this pass, no Squeeze): rounded, pooled roots at every visible origin; smooth continuous letterform body; drips substantially wider with clear taper to a fine tail; predominantly vertical with only subtle kink/bend.
3. **Corrected Mop with Squeeze** (this pass, `ArrowDown` held from waypoint 9 through the end of the stroke — a defined latter portion, not the whole gesture): visibly denser pooling and more/heavier gravity runs specifically in the squeezed section (three separate rounded pooled origins in the lower-left arm alone, vs. fewer in the equivalent unsqueezed baseline region), while the earlier, unsqueezed portion of the same stroke is unaffected.

Two additional zoomed detail crops (one per baseline/squeeze screenshot) are included showing the rounded roots and taper up close.

## 6. Quantitative acceptance values

Measured directly from generated `DripSeed`s (the authoritative geometry, not a pixel estimate) via a heavy three-spot Mop stroke at realistic dwell (700ms/spot, matching the screenshots' own pacing):

| Metric | Baseline | Squeezed |
|---|---|---|
| Drip count | 11 | 15 |
| Median start width (px) | 14.6 | 13.8 (comparable; squeeze's effect here is mainly on *count* at this dwell length — see below) |

Separately, over a longer hold (1800ms/spot, enough to reach every node's channel ceiling in both conditions) to isolate the width/taper shape itself:

- **Median drip start width**: 15.1px
- **Median drip terminal width**: 3.15px
- **Ratio of start width to terminal width**: **4.79** (start is materially greater than terminal — required)
- **Count of obvious spike/pinch origins** (visually inspected across two independent zoomed regions — the tail/crossbar cluster and the lower-left-arm cluster): **0**
- **Count of obvious segmented body knots** (visually inspected across the full letterform, both top loop and lower body, at 246–272% zoom): **0**

At the shorter, more realistic 700ms dwell, Squeeze increases drip *count* (11 → 15, +36%) because most nodes haven't yet hit their per-node channel ceiling — exactly the "higher deposition → larger reservoir → stronger pooling → more gravity runs" chain required. At the longer 1800ms dwell every node in both conditions reaches its channel ceiling regardless of Squeeze, so count converges; Squeeze's marginal effect there shows up as nodes reaching that ceiling *faster*, not in a higher absolute count — this is the pool model's own `poolMaxChannelsPerNode` cap doing its job (a physical reservoir doesn't spawn infinite channels no matter how much paint keeps arriving), not a limitation of Squeeze.

## 7. Tests / typecheck / build

`npx vitest run`: **617/617 passing.**
- `PaintMarkerEngine.test.ts`: `resolveWetContactBulgeScale` assertions updated for the tightened threshold/magnitude, plus a new case confirming a merely-slow (not truly stopped) moment no longer registers as pooled contact.
- `WetDripEngine.test.ts`: two tests renamed/updated from "without circular origin stamps" to reflect the new, deliberate rounded-root fill (arc count 1→2: root + tip); new test asserts the root arc's exact center/radius matches the drip's true origin and `originPoolRadius`.
- `WetPaintModel.test.ts`: new test — `setSqueezeMultiplier` produces more drips and greater total width than baseline over the same dwell, through the same pool model, and returns to exactly baseline output once reset to `1` (release-returns-to-baseline, verified programmatically, not just visually).
- `MopRuntimeParity.test.ts` (unmodified, pre-existing): all 6 real-incremental-stroke attachment cases still pass — the width/taper/root changes did not detach any spawned drip from its frame's actual rendered body.
`npx tsc --noEmit`: clean. `npx vite build`: clean.

## 8. Commit

`af98e82` — "fix: Spatial Spraypaint V0.10.10 -- Mop rounded roots/continuous body/wider taper + Squeeze input"

## Do not touch — respected

No changes to Spray caps, Flair, Pencil, wall UI, the marker picker, the color system, zoom, or any unrelated Brush Studio control. No permanent UI was added for Squeeze — keyboard-only (`ArrowDown` / `S`), exactly as specified. Round/Chisel are unaffected (they don't use `WetPaintModel.ts`'s pool model or `WetDripEngine.ts` at all).
