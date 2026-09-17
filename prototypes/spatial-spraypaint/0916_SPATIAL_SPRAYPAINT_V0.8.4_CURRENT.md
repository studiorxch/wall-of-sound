# Spatial Spraypaint V0.8.4 Current Status

Date: 2026-09-16

Status: COMPLETE — Flair Stroke Envelope Stabilization. The width-carryover bug (a new stroke silently starting from the previous stroke's terminal size) is fixed with an explicit stroke-start policy. Flair's size authority is now an explicit `[Flair Min Size, Flair Max Size]` envelope with a `Start Position` (min/center/max), replacing the old relative "Flair Range" control entirely. Depth Response now maps strictly inside that envelope. Output falloff's independence from width is proven directly. Live-verified: three, then five, separate strokes in sequence all reset to the identical starting size regardless of where the previous stroke ended. Full automated suite, TypeScript, and production build pass.

Baseline: V0.8.3 commit `873a000`/`dd550a4` (Flair Stabilization + Pencil V1 Prep), on top of V0.8.2, V0.8.1, V0.8, V0.7.

## Root Cause of Width Carryover

`this.baseRadius` (the live resolved size fed into every deposited point) and `trackMarksFlairDistance01` (the internal depth dial) were both plain persistent `App` instance fields with **no reset boundary at `pointerdown`**. The only place either was ever re-seeded was lazily, on the *first Alt-drag sample of a gesture* (`beginSimulatedDistanceDrag`) — and even then, only the internal dial was seeded, not `baseRadius` itself. A stroke that painted without immediately Alt-dragging (or any stroke begun after a previous stroke had changed the size) therefore started painting at whatever `baseRadius` the *previous* stroke happened to leave behind. This was an implicit, silent "continue-from-last" behavior that no policy had ever actually chosen — confirmed and fixed live (see Live Verification below): before the fix would have shown a new stroke's first sample equal to the prior stroke's last sample; after the fix, every new stroke's first sample is the mode's own explicit start size, every time.

## Final State Model

**Explicit stroke-start policy** (`FlairCurves.ts`): `FlairStrokeStartPolicy = "reset-to-start" | "continue-from-last"`, exported as a constant (`FLAIR_STROKE_START_POLICY = "reset-to-start"`, per the brief's own "for now, default to reset-to-start" — `continue-from-last` is named/typed for the documented future option but has no resolution logic yet).

**The fix itself**: a new `main.ts` method, `resetTrackMarksFlairForNewStroke()`, called unconditionally at the very top of the `pointerdown` handler (before the first point is ever deposited) whenever Track Marks has an active Flair mode. It resolves a fresh `distance01` from `params.flairStartPosition` via the new pure `resolveFlairStartDistance(mode, params)`, then writes the resulting size to **both** `this.baseRadius` and the generic `size` override — the same write path every other Flair size change already uses. `setTrackMarksFlairMode` (a mode switch) now shares this exact logic via `applyTrackMarksFlairStartSize`, since a mode switch is the same "re-initialize the envelope state" event, just triggered differently.

**Stroke lifecycle, as implemented**:
```text
pointerdown → resetTrackMarksFlairForNewStroke() (explicit start size, written immediately)
  → continuous modulation during stroke (adjustTrackMarksFlairDistance, unchanged mechanism)
  → pointerup → (nothing special needed — the NEXT pointerdown resets forward-looking, which is
                 equivalent to "discarding transient state" without a separate teardown step)
```
No canonical/default size is ever mutated — `SPRAY_CAP_PRESETS` stays `readonly`/`as const` exactly as before; only the per-brush session `size` override (already designed to be mutable session state) is touched, same as every prior Flair size write.

## Whether Range Remains or Is Replaced by Explicit Min/Max

**Replaced entirely.** `flairRange` (a relative multiplier of a mode's own curve magnitude) has been removed from `FlairProControlMetadata`/`FlairParameterOverride`/Brush Studio. Reasoning: Range only ever mattered *through* denormalization into an absolute size — once explicit `flairMinSize`/`flairMaxSize` own that denormalization directly (`resolveFlairSize(width01, params) = lerp(min, max, width01)`), Range has nothing left to govern; keeping both would have been exactly the "two controls fighting over the same authority" the brief warned against. The mode's own curve *shape* (wall's `t^1.3`, blackbook's `t^0.6`, wild's `t^0.5` — physically-bounded vs. tight vs. extended *personality*) is preserved and still meaningfully differentiates the three modes — it's now normalized to a clean `[0,1]` fraction (`widthShapeNormalized`) before Min/Max denormalize it, decoupling "shape" from "envelope" cleanly. **Flair Amount and Flair Smoothing were kept** — they govern drag sensitivity and transition rate respectively, genuinely orthogonal to the size envelope, with a clear ongoing role.

**Cap-relative defaults** (section 2's "keep the model cap-relative where possible"): `getFlairSizeDefaults(mode, capBaseRadius)` derives Min/Max from the *cap's own preset `baseRadius`* (never the live/overridden session size — using the live size would reintroduce the exact carryover bug this pass fixes), via per-mode ratio constants (`min = max(2, baseRadius*0.12)`, `max = baseRadius * {wall:1.5, blackbook:0.9, wild:2.4}`). For Track Marks (`baseRadius` 42): Wall 5.04–63, Blackbook 5.04–37.8, Wild 5.04–100.8 — live-confirmed exactly in Brush Studio. For a Needle-shaped hypothetical (`baseRadius` 5, math/schema-only per section 7, no runtime wiring): Wall min≈2, max≈7.5 — proportionate, never collapsing to zero, dedicated tests confirm numerical stability across a full sweep.

## Output-Falloff Behavior

Kept as its own independent mechanism (unchanged plumbing from V0.8.3, now explicitly re-tested): `outputFalloff` scales `(1 - outputAttenuation(curveT))`, completely separate from the width channel (`widthShapeNormalized`/`resolveFlairSize`). Directly proven independent: changing `outputFalloff` from 0.05 to 0.8 leaves `width01` unchanged at every sampled distance; changing `flairMinSize`/`flairMaxSize` from a narrow envelope to a wide one leaves the resolved `output` multiplier unchanged at every sampled distance.

One genuine curve change (not a bug fix, a requested capability): **Wild's canonical `outputAttenuation` changed from `() => 1` (a literal flat 1, with *no shape at all* for `outputFalloff` to scale — proven dead by a V0.8.3 test) to `(t) => 1 - 0.1*t`** — a small, real default falloff shape. This is what "a cap should be able to get wider while becoming lighter... depending on mode/preset" (section 4) requires for Wild specifically to be *able* to exhibit that behavior at all when a user raises its Output Falloff control. Wall and Blackbook already had real shapes and needed no change. Live/test-proven: Wall's far-wide already naturally produces "wider AND lighter" simultaneously (existing width-increases / output-decreases curves, now with a dedicated test); the same envelope under `near-wide` polarity produces "narrower while remaining dense" (output does *not* get *more* attenuated as the stroke narrows — proven with `toBeGreaterThanOrEqual`).

## Tests

70 new/changed focused tests, all passing:

- **`FlairCurves.test.ts`** (60 tests, largely rewritten): every acceptance item from section 8 — reset-to-start is pure/deterministic; start=min/max/center each resolve to the exact target size; far-wide maps monotonically Min→Max and near-wide Max→Min across a full sweep (not just endpoints); width never exceeds the configured envelope at any start position; output falloff is independent from width (two directions: varying falloff leaves width unchanged, varying the envelope leaves output unchanged); farther distance produces wider+lighter (far-wide) and narrower-while-dense (near-wide); off remains identity under `resolveFlairModulationWithParams` too now; Pink Dot/other caps unaffected (existing + a new explicit "never called with Pink Dot's id" doc-test); a dedicated Needle-shaped (`baseRadius` 5) suite: min never collapses to zero, max expands meaningfully beyond the tiny baseRadius, no jump on stroke start (start position lands exactly, every polarity), full near→far→near→far sweep stays finite/non-NaN.
- **`FlairProperties.test.ts`** (13 tests, updated): envelope merge now requires `capBaseRadius`; cap-relative defaults confirmed (a smaller cap gets a smaller envelope); an inverted Min>Max override never collapses to a zero-or-negative span; `getFlairPropertyRows` now returns exactly six numeric rows (Min/Max Size replacing Range).
- Full suite: **572/572 passing** (up from 550 before this pass). TypeScript clean. Production build clean.

## Live Verification

All run in the current-host browser against the actual built app, via real dispatched `PointerEvent`s (Track Marks, Wall mode):

- **The core fix, numerically**: Stroke 1 (Center start) began at exactly `34.02` (the true midpoint of 5.04–63), Alt-dragged to `39.19`. Stroke 2 — a **fresh `pointerdown` with zero drag** — began at exactly `34.02` again, not `39.19`. Repeated with the opposite direction (Stroke 3 dragged to `30.69`; Stroke 4 still began at `34.02`). Both pairs prove the carryover is gone.
- **start=min**: a fresh stroke began at exactly `5.04` (screenshotted as two thin-hairline-to-wider tapers, both starting from an identical fine point).
- **start=max**: a fresh stroke began at exactly `63.00` (screenshotted as a dramatically wide-to-narrow taper, visually contrasting with the thin→wide lanes).
- **center→wide→thin**: one continuous stroke — start `34.02`, mid (far) `43.59`, end (back near) `33.78` — a coherent single-gesture V-shape, screenshotted.
- **Repeated arc gestures**: three separate curved strokes in sequence, each independently verified to start at the *identical* `34.02` (`allStartsMatch: true`), screenshotted together showing visually consistent arc widths with no progressive drift.
- **Flair-off unchanged**: confirmed via `#flair-status.hidden === true` after cycling back to off.
- **Pink Dot unaffected**: an Alt-drag trace against Pink Dot Fat matched the exact pre-existing legacy linear formula bit-for-bit across 10 samples (`matches: true`).
- **No console errors** introduced by this pass (the same pre-existing, unrelated `ERR_CONNECTION_REFUSED` noise from earlier sessions — confirmed benign, every `localhost` app resource loads 200 OK — was present before this change and is unrelated to Flair/Pencil).

## Files

Modified: `src/FlairCurves.ts` (size envelope schema, stroke-start policy, rewritten modulation/inverse math, Wild falloff shape change), `src/FlairCurves.test.ts` (largely rewritten), `src/FlairProperties.ts` (envelope override fields, cap-relative merge), `src/FlairProperties.test.ts` (updated), `src/BrushStudio.ts` (Min/Max Size rows replacing Range, new Start Position control), `src/BrushPreview.ts` (`resolveFlairSize` in place of the removed fixed-floor denormalizer), `src/main.ts` (the actual bug fix — `resetTrackMarksFlairForNewStroke`, `applyTrackMarksFlairStartSize`, pointerdown wiring).

No new files this pass. No changes to `SprayBrushEngine.ts`, `FlairContinuity.ts`, `PencilInput.ts`, or any Pink Dot / other-cap code path.

## Commit

`<pending — see final report>` — "fix: Spatial Spraypaint Flair stroke-envelope stabilization — explicit Min/Max/Start-Position, reset-to-start policy fixes width carryover"
