# Spatial Spraypaint V0.8.5 Current Status

Date: 2026-09-16

Status: COMPLETE — Real Spray Pass. Flair now reads as spray, not marker: Wall's default start position was flipped so an ordinary stroke opens thin→wide instead of reading as "narrowing"; a cap-family tier system (Fat/Mid/Thin) gives Fat (Track Marks) more headroom to open up without ever touching its canonical off-Flair size; the previously-dead `bloom01` value is now wired into a deterministic, opacity-only aerosol "mist" effect (dimming + per-point grain) so the flare body reads as a translucent bloom rather than a solid tube; continuity resampling was tightened further (0.7 wall-unit step, 6 min steps) against residual stepping; Wall/Blackbook's output-falloff curves were strengthened for more visible translucency as the stroke opens. Brush Studio gained a computed "Starts at / Opens to" readout translating the envelope into the exact start-width/end-width language the brief asked for. Live-verified end-to-end against the actual running app (see below). Full automated suite, TypeScript, and production build pass.

Baseline: V0.8.4 commit `b5df408`/`580a0aa` (Flair Stroke Envelope Stabilization), on top of V0.8.3, V0.8.2, V0.8.1, V0.8, V0.7.

## The Brief

User-supplied reference: a real spray-paint flare-tag breakdown (Instagram, @machinestudio). Five problems named directly: (1) flair still narrowed instead of widening on a normal Wall stroke; (2) residual segmented/stitched-capsule look; (3) real flares are opacity/density/translucency events, not just width — "a translucent balloon/aerosol bloom," not a "fat solid tube"; (4) Fat caps needed more headroom before hitting their ceiling; (5) Thin caps needed a *subtler*, texture-driven response, not a scaled-down Fat curve. Explicit constraint carried through every decision below: **"We are not trying to turn spray into marker behavior. If anything looks too clean, too vectorized, too solid, or too evenly segmented, that is a failure."**

## Root Cause of "Narrows in the Wrong Direction"

Not a math bug — `getFlairStartPositionDefault` returned `"center"` for every mode. Because each mode's resolved envelope already sits close to its own max, a light near-side drag from a center start reads as "the stroke got thinner," which is exactly backwards from "small → wide as the can opens up." Fix: the default start position is now `"min"` for every real mode (`off` stays `"center"`, where it's inert). A fresh stroke now starts thin by construction, with no override required — confirmed live (see below): `Start Position` reads `Min` in Brush Studio for Wall/Blackbook/Wild by default.

## Cap-Family Response Tiers

New `FlairCapTier = "fat" | "mid" | "thin"` axis (`FlairCurves.ts`), scaling both the size envelope's ratios and the bloom/mist multiplier:

- `getFlairCapTier(capId)` maps only `"track-marks"` to `"fat"`; every other cap id defaults to `"mid"` — **zero new runtime wiring to any other cap**, honoring every prior brief's "Track Marks only" scope (this brief did not lift that constraint, and Track Marks remains the only cap with a picker-reachable Flair UI at all — a scope gap called out under Findings below).
- Fat's own max-size ratios were raised for headroom (Wall 1.5→1.8, Blackbook 0.9→1.1, Wild 2.4→2.8) — **Track Marks' canonical off-Flair `baseRadius` (42) was never touched.** The extra room comes entirely from the Flair envelope's own ratio, which is the resolution to the brief's "should the base size be reduced?" question: no — widen the Flair-only ceiling instead.
- Thin's own max ratios are deliberately the smallest of the three tiers (Wall 1.15, Blackbook 0.75, Wild 1.35), while Thin's bloom multiplier (1.4×) is the *largest* — "less dramatic width expansion, more mist/degradation" is encoded directly as an inverse relationship between width headroom and texture response across the three tiers.
- Honest limitation: Thin's live behavior is **not** browser-verified this pass, because no thin-family cap (Needle, Lego Thin, etc.) is wired to the Flair runtime — only Track Marks is. Thin-tier math is verified by dedicated unit tests (ordering, no-collapse-to-sliver, modest own-radius growth) but not by a live stroke. Confirming it live requires either wiring a second cap into the Flair runtime or temporarily overriding Track Marks' own tier for a test build — out of scope for "keep the pass focused."

## Aerosol Mist — Wiring the Dead `bloom01` Value

`bloom01` has existed since the Tool Taxonomy pass but was computed and discarded every turn since ("schema-only, not yet wired to any renderer"). This pass wires it into `FlairContinuity.ts`'s continuity resample as an **opacity-only** effect, deliberately never touching width (so the smoothstep taper's continuity fix from V0.8.3 stays exactly as continuous as before):

```
applyMistToOpacity(baseOpacity, bloom01, jitterSeed):
  dim   = 1 - bloom01 * 0.3          // overall translucency as the flare opens
  grain = 1 - bloom01 * 0.45 * deterministicJitter(jitterSeed)   // per-point aerosol grain
  return max(0, baseOpacity * dim * grain)
```

`deterministicJitter` is a sine-hash (`sin(seed*12.9898)*43758.5453`, fractional part) rather than `Math.random()` — deterministic so live paint and stroke replay always match exactly, mirroring this codebase's existing seeded-random precedent elsewhere. `main.ts` threads the resolved `bloom01` from the same modulation call that already resolves width/output through a new `trackMarksFlairBloom01` field, consumed once per deposit batch.

## Continuity and Falloff Tightening

- Dense-resample step tightened `1.2 → 0.7` wall units, minimum steps raised `4 → 6` — directly against the "still sometimes steps" complaint.
- Wall's `outputAttenuation` strengthened `1 - 0.4t → 1 - 0.55t` (full-distance output now 45% of rest, was 60%); Blackbook's `1 - 0.15t → 1 - 0.2t`. Both are Flair-layer curve-shape edits, not touching any `SprayCapPreset`/cap-physics field, so they don't interact with any "don't retune Pink Dot" constraint — Flair curves are a separate layer from per-cap presets.

## Brush Studio: "Starts at / Opens to"

A new computed readout translating the general Min/Max/StartPosition/DepthResponse model into the brief's own "start width / end width" language, resolved live via the same `resolveFlairStartDistance`/`resolveFlairModulationWithParams`/`resolveFlairSize` calls the engine itself uses (so the readout can never drift from actual paint behavior). Confirmed live for Track Marks/Wall: `4 → 76 wall units`, matching Effective Range `4–76`.

## `resolveEffectiveFlairParams` Signature Change

`(mode, capBaseRadius, override) → (mode, capId, capBaseRadius, override)` — the added `capId` lets the function resolve the cap's own tier for both the size envelope and (via a one-time multiplier applied to the default) the bloom response. Updated every call site: `main.ts`, 4 sites in `BrushStudio.ts`, `FlairProperties.test.ts`.

## Tests

New/changed, all passing:

- **`FlairCurves.test.ts`**: new describe block for cap-family tiers — `getFlairCapTier` maps Track Marks→fat, everything else→mid; fat's max ratio exceeds mid's exceeds thin's for every real mode; thin's own minimum never collapses to a sliver even at a tiny (Needle-like) baseRadius; thin's bloom multiplier exceeds fat's exceeds mid's; thin's own width growth relative to its own baseRadius is genuinely modest next to fat's.
- **`FlairProperties.test.ts`**: merge-default test updated for the new `"min"` start-position default; new test confirming tier changes the envelope even at the identical baseRadius (Track Marks vs. a hypothetical other cap id).
- **`FlairContinuity.test.ts`**: new describe block for `bloom01` wiring — `bloom01=0` is a byte-identical no-op; `bloom01>0` dims/varies opacity while leaving width byte-identical; higher `bloom01` lowers average opacity further (not just noisier); no negative opacity even at `bloom01=1` with an unlucky draw; full determinism (same inputs → `toEqual` same output); `buildContinuousSegmentEnds` defaults `bloom01` to 0 when omitted.
- Two self-discovered fixes during this pass: Thin/Blackbook's ratio initially broke the fat>mid>thin ordering invariant (1.05 vs mid's 0.9 — fixed to 0.75); the "thin's min stays usable" test initially tied with fat's min at the shared floor at a tiny reference radius — fixed by testing the ratio-ordering claim at a larger reference radius while keeping a separate, weaker "never zero" assertion at the actual tiny radius.
- Full suite: **584/584 passing**. TypeScript clean. Production build clean.

## Live Verification

Track Marks has **no cap-picker button in `index.html`** — it's an intentionally-hidden "TEMPORARY preservation cap" (see `SprayCapProfile.ts`'s own comment), reachable only by direct `sprayCapId` assignment. To verify live, a temporary picker button and a temporary `window.__app` debug reference were added, used for verification, then **fully reverted before commit** (`git diff --stat` confirms `index.html` carries no diff from this pass, and `main.ts`'s diff contains no `__app` reference). All of the following ran against the actual built app in-browser, via real dispatched `PointerEvent` sequences (not mocked):

- **Default start position, live**: opened Brush Studio → Track Marks → Flair → Mode: Wall. `Start Position` read `Min`, `Flair Min Size` read `4.20`. Screenshotted.
- **Thin→wide flare shape, live**: a single continuous Alt-drag stroke (simulating desktop Z-control) took `baseRadius` from `4.2 → 75.6` wall units (the new Fat-tier ceiling, `42 × 1.8`) as `distance01` moved `0 → 1`. Screenshotted at 100% and 200% zoom: a continuous, unbroken thin-to-wide taper with **no visible segmentation or stitched-capsule steps**, and a visibly mottled/grainy body at the wide end rather than a flat solid fill — a soft, rounded translucent tip, not a hard vector edge.
- **Opacity/translucency, numerically and visually**: over the same stroke, `trackMarksFlairOutputMultiplier` fell `1.0 → 0.45` (matches the strengthened `1-0.55t` Wall falloff) and `trackMarksFlairBloom01` rose `0 → 1.0`. The zoomed screenshot shows genuine per-region density variation along the flare body, consistent with "translucent aerosol bloom" rather than a uniform tube.
- **Fat headroom, live**: confirmed numerically that a full-range drag reaches exactly `75.6` (`42 × 1.8`), matching the new Fat-tier ratio and the Brush Studio "Starts at / Opens to" readout (`4 → 76`).
- **Flair-off regression check, live**: Track Marks with Flair mode `off` — Alt-drag followed the old plain linear formula (`4–72` clamp, no curve), `bloom01` stayed exactly `0`, `output` stayed exactly `1`. Screenshot shows the same punchy/banded canonical Track Marks look as every prior turn, unaffected.
- **Other-cap regression check, live**: Pink Dot Fat — Alt-drag followed the exact same pre-existing legacy linear path (untouched by any tier/mist code), screenshot shows its ordinary overspray-particle look, no continuity resample, no mist.
- **Pencil mapping smoke test, live**: dispatched a `pointerType: "pen"` sequence with varying `pressure`/`tiltX`/`tiltY` against Track Marks/Wall after the `resolveEffectiveFlairParams` signature change — `applyPencilTrackMarksMapping` ran with no errors.
- No new console errors introduced (the pre-existing, unrelated `ERR_CONNECTION_REFUSED` noise from earlier sessions is present but unrelated to this pass).

## iPad / Apple Pencil Validation

**No physical iPad or Apple Pencil hardware is available in this environment.** As in every prior turn that touched Pencil input, validation here is limited to simulated `PointerEvent`s (`pointerType: "pen"`, `pressure`, `tiltX`/`tiltY`) and static code review — never a claim about on-device feel. What that can and cannot confirm:

- **Confirmed via simulation**: the Pencil coverage/tilt→spray-angle mapping (`applyPencilTrackMarksMapping`) still executes with no errors after this pass's `resolveEffectiveFlairParams` signature change (added `capId`), across every call site touched (`main.ts`, `BrushStudio.ts` ×4). This was a real regression risk this pass specifically introduced and is now ruled out.
- **Cannot be confirmed without hardware, and is not claimed here**: real Apple Pencil pressure-curve feel, tilt-angle ergonomics, palm-rejection/pointer-capture continuity across a real touch surface, edge-of-canvas behavior with a physical stylus, or whether Pencil genuinely gives *better* control over Flair than a desktop mouse+Alt-drag. These remain open from every prior turn's own disclosure and are unchanged by this pass.
- **Unchanged finding, worth repeating**: the entire Flair feature — the subject of six consecutive build passes — is reachable in the shipped UI **only** through Track Marks, and Track Marks itself has no cap-picker button. A real user on any device, iPad included, currently cannot reach Flair at all without a code change. This is a pre-existing scope decision (every brief since Flair Behavior Spec V1 explicitly said "Track Marks only," most recently unchanged by this brief), not a regression from this pass — but it means no amount of Pencil hardware would let a real user experience today's Real Spray Pass work without first exposing Track Marks (or another Flair-wired cap) in the picker.

## Files

Modified: `src/FlairCurves.ts` (start-position default, cap-tier system, headroom ratios, strengthened falloff shapes), `src/FlairCurves.test.ts` (new cap-tier describe block), `src/FlairProperties.ts` (`capId`-aware tier resolution in `resolveEffectiveFlairParams`), `src/FlairProperties.test.ts` (updated call sites, new tier-vs-baseRadius test), `src/FlairContinuity.ts` (`applyMistToOpacity`/`deterministicJitter`, tightened resample density), `src/FlairContinuity.test.ts` (new mist-wiring describe block), `src/main.ts` (`trackMarksFlairBloom01` field and wiring, updated `effectiveFlairParams` call), `src/BrushStudio.ts` (4 call-site updates, new "Starts at / Opens to" readout).

No new files this pass. No changes to `SprayBrushEngine.ts`, `PencilInput.ts`, `SprayCapPresets.ts`, or any Pink Dot / other-cap physics.

## Recommendation if Parked Here

Ship the math/behavior changes as-is — they're well-tested and live-verified, and directly answer all five named problems for the one cap they're wired to. Before this is a real user-facing feature, though, two things need attention that are outside "keep the pass focused" but block real usage: (1) Track Marks needs an actual cap-picker entry (or Flair needs wiring to a second, picker-visible cap) so a user can reach this at all; (2) Thin-tier behavior needs either a picker-visible thin cap wired into the Flair runtime, or an explicit decision that Thin-tier Flair stays unshipped until one exists — right now it's real, tested code with no way for anyone to see it painted.

## Commit

(pending — see next commit)
