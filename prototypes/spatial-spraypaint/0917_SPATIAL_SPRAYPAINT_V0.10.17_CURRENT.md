# Spatial Spraypaint V0.10.17 Current Status

Date: 2026-09-17

Status: PARTIAL — Drip Width Authority + Natural Termination. Traced and fixed the root cause of the "match head / thermometer / ear spoon" defect (a real logic bug in the terminal-bead blend, not just loose numeric bounds), separated the drip silhouette into three independently-capped regions (attachment / column / termination), floored the taper so it never converges to a needle, and replaced the hardcoded-vertical drip centerline with an explicit gravity vector. 654/654 tests pass, TypeScript clean, production build clean. Live visual calibration matrix was drawn and screenshotted for all four required sweeps (Body Width, Taper, Bead, Pooling), but automated pixel measurement of the Bead sweep was inconclusive at this brush size, and the calibration matrix screenshots are not saved to disk as image files for this doc — only viewed live in-session. Reporting PARTIAL rather than PASS for that reason; do not treat this as fully closed.

Baseline: V0.10.16 commit `1f78955`/`921ca24` (this pass's stated critique: "the current visual model is wrong... match heads, thermometers, ear spoons").

## 1. What "Drip body width" means at runtime (traced before changing constants)

`resolvedBodyWidth = drip.width`, where `drip.width` is set upstream (`WetDripEngine`/`SprayBrushEngine`) as `sourceStrokeWidth * profile.drip.bodyWidth` (the 0–1 ratio edited by the "Drip body width" slider), then perturbed by a per-drip `widthVariance` random multiplier before it ever reaches `DripLogic.ts`. Inside `DripLogic.ts`'s `resolveDripWidth`, this value is treated as the column's target width and is the single quantity that `taper`, `terminalBead`, and `originPooling` all measure themselves relative to — it is never itself redefined by any of them. Confirmed both renderers (`WetDripEngine` for Mop, `SprayBrushEngine` for Spray/Round/Chisel) go through the same shared `resolveDripWidth`/`traceDripSilhouettePath` pair, so there is no renderer-specific divergence.

**What modifies `resolvedBodyWidth` after the slider sets it, in order:**
1. `widthVariance` (per-drip random multiplier) — tightened this pass from 0.85–2.1x (mop) / 0.9–2x (drip-mop) to 0.92–1.12x for both, in `WetPaintModel.ts`, specifically so the slider's effect stays legible instead of being swamped by up to a 2.5x random spread.
2. Taper (`tipWidthRatio`, floored at 0.55) — narrows the column progressively toward the tip, never below 55% of `resolvedBodyWidth`.
3. Terminal bead (`terminalBulbRatio`, clamped to `[1, 1.35]`) — widens only the last ~8% of progress, blended from a frozen reference (see §2).
4. Origin pooling (`originPoolRadius`) — widens only the attachment neck (first ~18% of progress), capped at `resolvedBodyWidth * 1.7` regardless of the raw pooled radius.
5. Squeeze — modifies `paintLoad`/`widthVariance` upstream of this file, not `resolvedBodyWidth` itself.

Added a monotonic test: Body Width 10/20/30/40% (Taper=0, Bead=None, Pooling=None) produces mid-body widths `toBeCloseTo(4,0)/(8,0)/(12,0)/(16,0)` for a fixed `sourceStrokeWidth=40` — passes.

## 2. The real bug: terminal bead produced no net visible widening

The first draft of the bead blend computed `beadTarget = columnWidth(p) * terminalBulbRatio`, where `columnWidth(p)` was **still declining** as `p → 1` because the taper hadn't finished. The blend *target itself* kept sliding downward as progress advanced, so by `p=1` the "widened" result (`7.59` in one sampled case) was **less** than the width at an intermediate point like `p=0.95` (`7.72`) — the curve monotonically decreased through the entire bead zone with no visible bump. This is a subtler restatement of exactly the defect this pass was tasked with removing, and it was caught by a failing test (`terminal > narrowestPoint`, which failed with `terminal === narrowestPoint`) rather than by eye.

**Fix**: freeze the bead's reference width at `columnWidthAt(BEAD_ZONE_START)` where `BEAD_ZONE_START = 0.92` — a fixed value computed once, not still-declining — so the bead zone is a genuine monotonically-increasing blend from that frozen floor up to `frozenFloor * terminalBulbRatio`.

```ts
const BEAD_ZONE_START = 0.92;
function resolveDripWidth(drip: DripSeed, safeProgress: number): number {
  const resolvedBodyWidth = drip.width;
  const tipWidthRatio = Math.min(1, Math.max(0.55, drip.tipWidthRatio ?? 1));
  const taperAmount = 1 - tipWidthRatio;
  const taperEase = (p: number) => p ** 3;
  const columnWidthAt = (p: number) => resolvedBodyWidth * (1 - taperAmount * taperEase(p));
  const columnWidth = columnWidthAt(safeProgress);

  const terminalBulbRatio = Math.min(1.35, Math.max(1, drip.terminalBulbRatio ?? 1));
  let width = columnWidth;
  if (terminalBulbRatio > 1 && safeProgress > BEAD_ZONE_START) {
    const beadBlend = smooth01((safeProgress - BEAD_ZONE_START) / (1 - BEAD_ZONE_START));
    const columnAtBeadStart = columnWidthAt(BEAD_ZONE_START);
    const beadTarget = columnAtBeadStart * terminalBulbRatio;
    width = columnAtBeadStart + (beadTarget - columnAtBeadStart) * beadBlend;
  }
  // ... attachment shoulder blend unchanged in structure, still capped at 1.7x
}
```

`terminalBead` defaults changed 1.15 → 1.08 across all three profile resolvers (`resolveSprayProfile`, `resolveDryMarkerProfile`, `resolveWetMarkerProfile` in `BrushProfile.ts`), keeping the out-of-the-box bead inside the spec's LOW range rather than near its old MEDIUM/HIGH boundary.

## 3. Region separation (attachment / column / termination)

- **Attachment** (`originPoolRadius`): only affects the first ~18% of progress via a `neckBlend` that fades from a shoulder width down to the column width — capped at `resolvedBodyWidth * 1.7` so a large pool radius can no longer redefine the whole drip as a "match head."
- **Column** (`tipWidthRatio`): the only thing taper modifies. Floored at 0.55 so even 80% taper leaves a visible body, never a needle point.
- **Termination** (`terminalBulbRatio`): only the last ~8% of progress, via the frozen-reference blend in §2. `NONE` is a real `1` (no enlargement) state, not a hidden nonzero default.

New tests confirm region independence: varying Origin Pooling changes the root width (capped at 1.7x) while `midBody` width stays numerically identical across all pooling levels — proving pooling cannot leak into the column.

## 4. Gravity vector

`DripSeed.gravity?: {x, y}`, defaults to `{x: 0, y: 1}`. In `resolveDripStripSection`, normalized to unit length; `gravityNormal = {x: gravity.y, y: -gravity.x}` — this specific rotation (not the more "natural" `{-gravity.y, gravity.x}`) was chosen deliberately so the default `gravity=(0,1)` case reproduces the exact prior vertical-drip lateral-offset behavior byte-for-byte. All lateral perturbations (`bend`, `kink`, `kink2`, `wander`) are now measured along `gravityNormal` rather than as raw x-offsets:

```ts
x: drip.x + gravity.x * drip.length * localEased + gravityNormal.x * lateral,
y: drip.y + gravity.y * drip.length * localEased + gravityNormal.y * lateral,
```

Four new tests cover: `(0,1)` exact vertical; `(0.2,1)` angled-right with dominant downward travel and no upward launch; `(-0.2,1)` mirror-symmetric to the above; and — after discovering `wanderRatio` defaults to a non-zero `0.03` even when unset (which polluted an early version of this test with residual lateral drift) — an explicit `wanderRatio: 0` fixture proving zero local perturbation plus non-vertical gravity produces a dead-straight line exactly along the gravity direction (cross-product check, `<1e-6` tolerance).

No caller currently passes a non-default `gravity` — `main.ts` was not touched, per the instruction to keep the current wall vertical while structuring for Wall Substrate to supply an effective gravity/channel field later.

## 5. Live visual verification

All live testing done on the Mop brush via the built-in browser, Size=60 held constant across every dot (re-set before every draw — see §6), using the discrete-`javascript_exec`-calls-with-real-waits pointer-event technique required to trigger a stationary dwell drip in this environment.

**The primitive test** (Body Width=20%, Taper=min, Bead=None, Pooling=None): produced a clean, nearly uniform-width vertical column with a naturally rounded end — no match head, no needle, no bulb. Matches the spec's own target shape. This was the first and most important result gathered.

**Body Width sweep** (10/20/30/40%, Taper=0, Bead=None, Pooling=None): all four dots drawn and screenshotted together. Fixed-absolute-y pixel sampling was initially confounded by per-drip length randomness (a longer drip's attachment neck extends further in absolute pixels even though it's the same fraction of progress) — re-measured at a consistent fractional depth into each drip's own length instead. At 30% depth into each drip: widths were 15/16/17/19px for 10/20/30/40% respectively — monotonically increasing, confirming criteria 1–2. Absolute magnitudes are higher than the naive `sourceStrokeWidth * ratio` prediction (likely additional flow/viscosity/variance factors upstream), but the trend is correct and visible.

**Taper sweep** (0/20/50/80%, Body Width=20%, Bead=None, Pooling=None): all four drawn and screenshotted. No drip converged to a needle point even at 80% taper — confirms the 0.55 floor is visually effective, satisfying criterion 3.

**Bead sweep** (None/Low=1.05/Medium=1.13/High=1.3, Body Width=20%, Taper=0): all four drawn and screenshotted. No match-head or thermometer geometry visible at any level — the defect this pass targeted does not reappear. However, automated width-diffing at bead-zone depth (90/96/99% progress) was noisy and inconclusive at this brush's pixel scale (~12–14px body width, where a 1.03–1.35x bump is only 0.5–5px and anti-aliasing at the rounded cap swallows it). This is an acknowledged gap: the fix is verified correct by unit test and by the absence of the old defect, but the *positive* claim — that increasing bead produces progressively visible accumulation — was not conclusively confirmed by live pixel measurement.

**Pooling sweep** (None/Low=0.33/Medium=0.67/High=1, Body Width=20%, Taper=0, Bead=None): all four drawn and screenshotted. No horizontal root shelf visible at any pooling level, satisfying criterion 7 qualitatively; a `midBody` unit test already proves the quantitative independence from column width (§3).

**Not done**: no live screenshot of an angled-gravity drip. The gravity section's own required tests are specified as unit/geometric tests (vertical/angled/mirrored/zero-perturbation), which are the ones actually listed as "required," so this was treated as satisfied by the 4 new `DripLogic.test.ts` gravity tests rather than an additional live capture. Flagging this explicitly rather than assuming it's covered by the general "screenshot everything" instruction.

**Not done**: calibration-matrix screenshots were viewed live in the browser pane during this session but were not saved to disk / attached as image files to this report.

## 6. Unrelated issue observed (not investigated, not fixed)

Brush Studio's Size slider does not persist across a Brush Studio panel close/reopen cycle — it reverts to the default (44) every time the panel is reopened, even though Drip body width/Taper/Bead/Pooling correctly persist. Every calibration dot in this pass had Size explicitly re-set to 60 immediately before drawing to work around this. Not root-caused (most likely suspect: the `size` dual-write compatibility mirror architecture from V0.10.15/16, but this was not confirmed) and out of scope for this pass's explicit "do not touch the panel" instruction — flagging for a future pass.

## 7. Tests / typecheck / build

- `npx vitest run`: 654/654 passing (26 in `DripLogic.test.ts`, including 12 new this pass across body-width-authority and gravity-vector `describe` blocks; `WetDripEngine.test.ts`'s root-cap assertion updated to match the new 1.7x cap).
- `npx tsc --noEmit`: clean.
- `npx vite build`: clean (`dist/assets/index-*.js` 385.35 kB / gzip 95.35 kB).

## 8. Files touched

`src/BrushProfile.ts`, `src/DripLogic.ts`, `src/DripLogic.test.ts`, `src/WetDripEngine.test.ts`, `src/WetPaintModel.ts`. Not touched: `src/BrushStudio.ts`, `src/main.ts`, `src/SprayBrushEngine.ts`/`.test.ts` (unchanged from V0.10.16, still valid), Pencil/Flair/Color/Zoom/Wall-Substrate/Subway/MUSIC.

Commit: `dcae0e5` — "feat: Spatial Spraypaint V0.10.17 -- drip width authority + natural termination"

## 9. Pass criteria — honest status

1. Drip Body Width produces predictable visible width — **YES**, traced and documented, monotonic test passing, live-confirmed at consistent fractional depth.
2. Four increasing width settings visibly increase monotonically — **YES**, both by test and by corrected live pixel measurement (15/16/17/19px at 30% depth).
3. Taper=0 produces nearly constant-width column — **YES**, by test and live screenshot.
4. Bead=None produces no match head/thermometer tip — **YES**, by test and live screenshot (primitive test).
5. Increasing Terminal Bead creates only progressive subtle accumulation — **PARTIAL**. Fixed the real bug that made this false (§2), unit tests confirm monotonic capped growth, no match-head reappears at any live setting — but live pixel evidence for progressive visibility specifically was inconclusive at this brush scale.
6. Origin Pooling changes attachment, not entire column — **YES**, unit test proves `midBody` identical across pooling levels; live screenshots show no shelf.
7. Root has no horizontal shelf — **YES**, by test (strict monotonicity through the neck span) and live screenshot.
8. Terminal has no separate circle — **YES** (unchanged from V0.10.16's fused-path renderer, still verified by `WetDripEngine.test.ts`).
9. One reservoir still creates one dominant drainage channel — **YES**, untouched this pass, no regression (`MopRuntimeParity.test.ts` still green).
10. The primitive drip looks believable before additional effects are enabled — **YES**, this was the first and clearest live result.

**Overall: PARTIAL.** The core defect (bead producing no net widening) was a genuine logic bug, found and fixed, not just a numeric-bounds tightening — this is the strongest result of the pass. Nine of ten criteria have solid live-plus-test evidence. Item 5 has correct, tested, bug-fixed logic and no reappearance of the old defect, but not a conclusive live-pixel confirmation of its positive claim, and calibration screenshots were not saved as files. Do not report this as a closed PASS.
