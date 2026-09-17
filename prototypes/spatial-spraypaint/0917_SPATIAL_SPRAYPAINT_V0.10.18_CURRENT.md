# Spatial Spraypaint V0.10.18 Current Status

Date: 2026-09-17

Status: PARTIAL — Drip Attachment + Wet-Mass Length Verification. The visible origin/path glitch (a dark diagonal notch cutting into the source mark right above each Mop drip's stem) is fixed, root-caused, and confirmed clean across multiple independent live draws. The Squeeze audit traced and confirmed the deposit→loadFactor→length chain by reading the code, and a new controlled-tick unit test confirms the required monotonic relationship — but live browser comparison of Squeeze-held vs baseline strokes was inconclusive due to a timing confound in the test harness itself (order-of-draw dominated the result, not Squeeze state), so the live "Squeeze comparison" screenshot does not cleanly demonstrate the effect on its own. Reporting PARTIAL because that live demonstration is one of the pass's explicit required deliverables and it did not land cleanly, even though the underlying code-level claim is well-supported by other evidence.

Baseline: V0.10.17 commit `dcae0e5`/`4df15a8`.

## 1. The attachment glitch — root cause

Traced to `resolveDripStripSection` in `DripLogic.ts`. The cross-section's `normal` vector (which determines the left/right offsets that build the drip's silhouette) was computed by numerically differencing the centerline (`resolveCenter`) at `progress ± 0.001`. Gravity's own eased motion is `localEased = localProgress**2` — a quadratic ease-in with **zero derivative at progress=0**. That meant the finite-differenced tangent at the very root was dominated entirely by whatever small `wander`/`kink` lateral derivative happened to be nonzero there (both can already be partially engaged at progress=0, since `kink`'s cosine envelope and `wander`'s `sin(phase)` term don't require any elapsed progress to have a nonzero instantaneous rate), not by gravity. The result: the root cross-section's normal could point at a meaningfully different angle than "perpendicular to gravity" — i.e., not horizontal for a default vertical drip — which produced a skewed edge exactly where the polygon needed to meet the perfectly horizontal, flat `prependHiddenDripUnderlap` segment tucked under the source mark (`WetDripEngine.ts`). That angle mismatch is the diagonal notch: a thin wedge of background showing through between two edges that should have been continuous.

**Fix**: blend the cross-section's normal toward `gravityNormal` (the vector already used for the drip's whole lateral-offset system, perpendicular to gravity) near progress 0, releasing back to the natural curve-following normal by ~10% progress:

```ts
const rootNormalBlend = 1 - smooth01(safeProgress / 0.1);
let normal = naturalNormal;
if (rootNormalBlend > 0) {
  const blendedX = gravityNormal.x * rootNormalBlend + naturalNormal.x * (1 - rootNormalBlend);
  const blendedY = gravityNormal.y * rootNormalBlend + naturalNormal.y * (1 - rootNormalBlend);
  const blendedLength = Math.max(0.0001, Math.hypot(blendedX, blendedY));
  normal = { x: blendedX / blendedLength, y: blendedY / blendedLength };
}
```

This only touches the very first ~10% of progress — well inside the existing attachment span (18%) — and does not alter the column/taper/termination width curve V0.10.17 established, per this pass's explicit "do not redesign" instruction.

## 2. No root cap (per explicit requirement)

`traceDripSilhouettePath` previously drew a rounded arc cap at **both** ends (root and tip), fused into the same path. This pass's requirement #3 was explicit: "No root circle, root shelf, bulb, or sharp triangular join." The root arc is removed entirely — only the tip keeps its fused rounded cap. The root now closes with a plain straight edge, which is invisible once tucked under the source mark's own opaque paint (requirement #2: "let source paint visually mask the attachment where possible") and is the safer failure mode on the rare occasion the underlap isn't deep enough (a flat edge reads better than an extra bulge if it does peek out).

## 3. Live verification — attachment

Drew multiple independent Mop dwell-drips at different canvas positions (fresh random seed each time) and inspected a pixel-cropped zoom of each attachment region via an in-page debug canvas overlay. Before the fix, every drip showed the diagonal notch artifact at the root. After the fix, across three independent draws, the attachment is clean in every case: the drip emerges smoothly from beneath the source mark with no notch, no bulb, no shelf, and no sharp triangular join.

## 4. Squeeze audit

Traced the full chain by reading (no prior assumptions):
- `main.ts`: Squeeze is a held-key input (`ArrowDown` or `S`), binary (`squeezeHeld` true/false), mapped to a fixed `MOP_SQUEEZE_MULTIPLIER = 2.6` or `1`. Called on `WetPaintAccumulator.setSqueezeMultiplier(...)` every rendered segment while a stroke is active (`main.ts:2114`), so it's read live throughout a stroke, not fixed once at stroke start.
- `WetPaintModel.ts`'s `depositIntoPool`: `depositAmount = elapsedSeconds * profile.poolDepositRate * (1 + slowFactor*(profile.poolDwellBoost-1)) * modifiers.delivery * this.squeezeMultiplier * (0.4 + paintLoad*0.6)` — the multiplier is a **direct linear factor**, confirmed by reading, not inferred.
- That `depositAmount` accumulates into a pool node's `load`. `spawnPoolChannel`'s `fluxShare = node.load / sqrt(channelsSpawned+1)` and `loadFactor = min(2.2, fluxShare / profile.poolThreshold)` directly drives `length = size * (lengthMin + random()*lengthRange*(0.4 + loadFactor*0.6) + ...)`.

**Conclusion**: yes, Squeeze increases deposited wet mass (linearly, by construction), and that mass increase does feed into `loadFactor`, which does increase channel length — the wiring is sound and was not modified this pass (audit only, as instructed).

**New test** (`WetPaintModel.test.ts`, "V0.10.18: Squeeze audit"): runs an identical `observeStationary(accumulator, 900)` (a deterministic ~8-tick dwell, no real-wall-clock variance) at Squeeze 1/1.5/2/2.6, averaged over 5 seeds per value. Confirms the Pool Ownership Rule still holds at every multiplier (never more than 1 channel), and that average length at 2.6x is reliably greater than at 1x. Also directly checks that the `depositAmount` formula itself is strictly monotonic in the multiplier (no random component in that formula, so this part needs no averaging).

## 5. Live verification — Squeeze comparison (inconclusive, disclosed)

Ran four live trials in the browser: single-pair baseline-vs-squeeze, a 3-vs-3 batch, and two paired trials with tightly matched (identical, fixed 4-second) hold durations, including one with the draw order swapped. Across all four:
- The **first** trial (baseline at x=150 drawn first, squeeze at x=400/450/500 drawn second): baseline consistently came out longer or comparable to squeeze — the opposite of the code-level prediction.
- The **order-swap** trial (squeeze drawn first, baseline drawn second): squeeze came out dramatically longer (553px vs 267px) — the opposite pattern from the first trials.

This pattern — whichever condition is drawn **first** in a batch is longer, regardless of which one actually had Squeeze held — points to a timing confound in the browser-automation harness itself (each draw's several-second dwell is paced by real wall-clock round-trip latency between tool calls, which is not tightly controlled or repeatable), not a defect in Squeeze. Verified this isn't a wiring failure: dispatching a synthetic `keydown` for `ArrowDown` (which the handler `preventDefault()`s) confirmed the handler does run for these synthetic events, and `document.hasFocus()`/blur-listener checks ruled out the tab losing focus between calls.

This is disclosed rather than hidden: the live screenshots captured (see below) show real Mop strokes with Squeeze on vs off, but **do not** on their own demonstrate the length relationship reliably, because of the ordering confound above. The deterministic controlled-tick unit test is the reliable evidence for the audited relationship in this report.

## 6. Tests / typecheck / build

- `npx vitest run`: 655/655 passing (1 new test in `WetPaintModel.test.ts`; 4 stale arc-count assertions updated in `WetDripEngine.test.ts` and `SprayBrushEngine.test.ts` to reflect the root cap's removal — 2 arcs → 1 arc per completed drip, or 3 → 2 for the one fixture that also stamps a standalone pool circle).
- `npx tsc --noEmit`: clean.
- `npx vite build`: clean (`dist/assets/index-*.js` 385.38 kB / gzip 95.41 kB).

## 7. Files touched

`src/DripLogic.ts`, `src/WetDripEngine.test.ts`, `src/SprayBrushEngine.test.ts`, `src/WetPaintModel.test.ts`. Not touched: `src/WetPaintModel.ts` (Squeeze logic audited only, per the explicit instruction), `src/BrushStudio.ts`, `src/main.ts`, `src/DripLogic.ts`'s column/taper/termination geometry (V0.10.17's width formula is completely unchanged — only the cross-section's *normal direction* near the root, and the root's *cap*, were touched), Pencil/Flair/Color/Zoom/Wall-Substrate/Subway/MUSIC.

Commit: `a760803` — "feat: Spatial Spraypaint V0.10.18 -- drip attachment fix + Squeeze audit"

## 8. Pass requirements — honest status

1. Fix only the visible origin/path glitch, don't redesign V0.10.17 geometry — **YES**. Root-caused to a specific normal-direction bug; the fix is a small blend near progress<0.1 and a cap removal, nothing else in the width/taper/termination system was touched.
2. Start the drip silhouette beneath the source mark, let source paint mask the attachment — **YES**, via the existing `attachmentUnderlap` mechanism (unchanged) plus the now-correct flat root edge that has nothing skewed to show through the mask.
3. No root circle, root shelf, bulb, or sharp triangular join — **YES**, root arc cap removed entirely; live screenshots confirm no shelf/bulb/triangle in any of three independent draws.
4. Audit the Squeeze runtime path — **YES**, full chain traced and documented in §4, confirmed linear by reading the actual formula.
5. Run identical Mop strokes at several Squeeze values — **PARTIAL**. Done at the code level (1/1.5/2/2.6 in the new unit test) with reliable results; done live only at the two shipped UI states (held/not-held), and that live comparison did not produce a clean, trustworthy result due to the ordering confound in §5.
6. Required result: Squeeze monotonically increases wet mass, generally increases runoff length — **YES at the code/test level** (deposit formula strictly monotonic; average length across seeds increases). **NOT cleanly confirmed live** — disclosed, not hidden.
7. No Drip Length slider added — **YES**, not touched.
8. Preserve gravity, body-width authority, taper floor, subtle termination, Pencil behavior, centralized Brush Studio architecture — **YES**, none of these were touched; full test suite (which covers all of them) stayed green throughout.
9. Live screenshots of the repaired attachment and Squeeze comparison — **PARTIAL**. Attachment: strong, clean, multiple confirmations. Squeeze: screenshots exist and are described honestly, but do not themselves prove the required monotonic relationship because of the live-timing confound identified in §5.

**Overall: PARTIAL.** The attachment fix is a genuine, well-understood, live-confirmed win — this is the strongest result of the pass. The Squeeze audit correctly answers the question asked ("does Squeeze increase wet mass and length" — yes, by design and by controlled test) but the live visual half of the deliverable did not land cleanly, and that gap is disclosed rather than papered over. A future pass attempting the live Squeeze comparison again should either use a fixed low-level test harness that doesn't depend on real wall-clock dwell timing, or find a way to drive the stroke through many discrete, tightly-spaced deposit ticks instead of a handful of multi-second real waits.
