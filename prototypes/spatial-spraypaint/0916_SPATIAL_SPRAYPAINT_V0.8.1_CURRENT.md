# Spatial Spraypaint V0.8.1 Current Status

Date: 2026-09-16

Status: COMPLETE — Brush Studio Flair Controls. The Flair system defined in V0.8 is now exposed cleanly as a pro control surface in Brush Studio, editable per brush + per mode, session-local, resettable, and live-previewed through the real engine — for Track Marks only. No Pink Dot, no other physical cap, no drip physics, no Fill behavior, and no Flair curve equation changed. Full automated suite, TypeScript, and production build pass; live-verified in-browser end to end.

Baseline: V0.8 commits `47cf87c`/`b9ae60f` (Flair Behavior Spec V1 + Track Marks sandbox), on top of V0.7 `407c4d0`/`2293a4a` (taxonomy).

## A. Flair UI Architecture

A dedicated **FLAIR** group in Brush Studio's property panel, inserted right after **General** and before **Shape/Paint/Motion** — visible ONLY when the selected brush is Track Marks (`preset.id === "track-marks"`, and not a custom duplicate). Every other cap's panel is byte-identical to before this pass: `general/shape/paint/motion` ordering and content untouched, confirmed by re-running `BrushStudio.test.ts` (still 8/8 unchanged) and live-verified against Pink Dot Fat (panel goes General → Shape → Paint directly, no Flair group at all).

Section contents: a **Mode** `<select>` (Off/Wall/Blackbook/Wild, always visible), and — only once a non-off mode is active — five sliders (Flair Amount, Flair Range, Flair Smoothing, Bloom Response, Output Falloff), a read-only **Effective Range** row, and a **Reset Flair** button. `off`'s panel stays quiet (just the Mode selector), per the Creative Interface Doctrine ("normal state must remain visually quiet") — no dead sliders shown for a mode that applies no modulation.

## B. Mode/Default Resolution

Each mode's canonical default bundle is `getFlairProControlMetadata(mode)` (already defined in V0.8, unchanged) — the five scalars read straight off that mode's own curve constants (`distanceSensitivity`, `transitionSmoothing`, `widthExpansion(1)`, `textureBloom(1)`, `1 - outputAttenuation(1)`). No new default table was hand-written; the brief's own "use the values already implied/defined by FlairCurves.ts" is satisfied by construction, not by copying numbers.

Switching mode (Brush Studio's selector or the `F` keyboard accelerator) re-centers the live simulated-distance dial to a neutral reference and immediately resolves that mode's own effective size — this exact behavior already existed from V0.8 (`setTrackMarksFlairMode`, née `cycleTrackMarksFlairMode`'s inline logic) and needed no change; Brush Studio's selector now calls the same method the keyboard shortcut always called, so both paths are provably identical.

## C. Override/Session Model

New `FlairProperties.ts`, mirroring `BrushProperties.ts`'s exact `SprayPropertyOverride`/`SprayOverrideStore` pattern one level deeper: a `FlairOverrideStore` keyed by **cap id AND mode together** (`Record<capId, Partial<Record<FlairModeId, FlairParameterOverride>>>`), because the brief explicitly requires "changing Wall parameters must not silently mutate Blackbook defaults" — the same brush's Wall and Blackbook tweaks are independent session state, not one shared bundle. Lives in `SettingsState.flairOverrides` (new field, `EMPTY_FLAIR_OVERRIDES` default) alongside the existing `sprayOverrides`, with three new reducer actions (`flair-property`, `reset-flair-property`, `reset-flair-mode`) mirroring the existing `spray-property`/`reset-spray-property`/`reset-spray-brush` actions exactly.

`resolveEffectiveFlairParams(mode, override)` is MODE DEFAULT merged with SESSION MODIFICATION — the exact `??`-per-field merge pattern `resolveEffectiveSprayStyle` already uses. Never mutates `FLAIR_CURVES` or any other (cap, mode) entry — proven by dedicated non-leak tests (see section H).

**Runtime is wired to the same store**, not a separate preview-only copy: `main.ts`'s `effectiveFlairParams(mode)` reads `getFlairOverride(this.settings.flairOverrides, capId, mode)` through `resolveEffectiveFlairParams`, and `adjustTrackMarksFlairDistance`/`beginSimulatedDistanceDrag`/`setTrackMarksFlairMode` all now consume these effective params instead of the raw canonical `FLAIR_CURVES[mode]` scalars. A Brush Studio edit therefore changes what painting on the Wall actually does, not just what the preview shows — verified live (see section I).

**No curve equations changed.** `resolveFlairModulationWithParams` (new, in `FlairCurves.ts`) reuses each mode's own `widthExpansion`/`textureBloom`/`outputAttenuation` SHAPE unmodified and only rescales its magnitude by the ratio between the effective (possibly overridden) scalar and that mode's own canonical scalar. `flairAmount`/`flairSmoothing` map directly onto `distanceSensitivity`/`transitionSmoothing` (they already were exactly those scalars, no shape to preserve). One honest, deliberate consequence, proven by a dedicated test and visible live: Wild's canonical `outputAttenuation` shape has no falloff at all (`() => 1` everywhere) — a larger `outputFalloff` override on Wild has nothing to scale and produces **no runtime effect**, which is correct, not a bug ("optional/stylized," per the original V0.8 build brief), and is called out explicitly rather than faked with a new falloff curve Wild was never given.

## D. Live Preview Behavior

New `renderTrackMarksFlairPreview` in `BrushPreview.ts`. Rather than animate, it sweeps simulated distance **near → far → near across the preview stroke's own points** (a triangle wave over point index) through the exact same `resolveFlairModulationWithParams` call the live routing hook uses, denormalizing each point's resulting `width01`/`output` into real stroke width/opacity before handing the whole sequence to the real `SprayBrushEngine` — one static image that visibly shows the thick↔thin/output modulation, with zero animation loop and zero fake preview. `renderPreviewCanvas` (new, in `BrushStudioController`) branches on `preset.id === "track-marks" && mode !== "off"` to pick this over the existing `renderSprayBrushStudioPreview`; every other cap's preview call is untouched.

Every one of the five sliders' `input` handlers re-renders this canvas immediately (not on `change`), matching the existing General-group slider pattern. **Live-verified**: Flair Range set to 2.5 visibly and immediately thickened the preview's peak bulge; switching Wall → Blackbook → Wall correctly swapped the preview shape to each mode's own (session-modified or canonical) look each time, with no stale frame.

## E. 72-Unit Clamp Handling

Not "fixed" by widening the shared `#brush-radius` slider — the brief explicitly forbade that, and the compact slider's `max="72"` is correct for every physical cap. Instead: Brush Studio's own **Effective Range** row (`resolveTrackMarksFlairSizeRange`, new pure export in `FlairCurves.ts`) reads directly off the same curve `resolveFlairModulationWithParams` itself uses, so it can never under-report. **Live-verified**: Wild's default bundle shows "Effective Range: 4–100 wall units" in Brush Studio, plus an explicit inline note ("Exceeds the compact Size slider's own 72-unit display — this is the true value used when painting") shown only when `range.max > 72`. Separately re-verified at the CANVAS level (not just the preview): a live Alt-drag with Wild active drove `#radius-val` (the true resolved size, read directly, not through the slider) smoothly up to ~100, while the shared slider's own `.value` stayed visually pinned at 72 — the exact boundary the brief asked to be documented cleanly, now with a second, non-clamped source of truth in the UI. The compact slider itself was not touched.

## F. Reset Behavior

Two levels, both live-verified: **Reset Property** (a small "Reset" next to a single modified slider) clears just that property, leaving siblings and every other mode's overrides untouched — verified by resetting an overridden Flair Amount (2.50 → 1.00) while Flair Range (2.50) stayed put. **Reset Flair** (one button at the bottom of the group) clears the WHOLE mode bundle for the current mode at once — verified restoring all five Wall values to their canonical defaults simultaneously, with Blackbook's own separately-modified value untouched by the same click (not tested here since only Wall was modified in the final run, but proven directly by `resetFlairMode`'s own non-leak test). Both buttons correctly disable (`isFlairModeModified`) when there's nothing to reset — live-verified on Blackbook's untouched panel.

## G. Files Changed

New: `src/FlairProperties.ts`, `src/FlairProperties.test.ts`.
Modified: `src/FlairCurves.ts` (`EffectiveFlairParams`, `resolveFlairModulationWithParams`, `inverseEffectiveWidthExpansion`, `resolveTrackMarksFlairSizeRange`, exported `TRACK_MARKS_FLAIR_MIN_SIZE`/`_SIZE_SPAN`/`denormalize`/`normalize` — moved from `main.ts` so Brush Studio and the live routing hook share one source of truth), `src/FlairCurves.test.ts` (new coverage), `src/main.ts` (routing hook now reads effective params from `settings.flairOverrides`; `cycleTrackMarksFlairMode` refactored to delegate to `setTrackMarksFlairMode`, now also called by Brush Studio; new `BrushStudioDeps` wiring), `src/BrushStudio.ts` (FLAIR group rendering, mode selector, five property rows, Effective Range readout, Reset Property/Reset Flair), `src/BrushPreview.ts` (`renderTrackMarksFlairPreview`), `src/SettingsState.ts` (`flairOverrides` field + three reducer actions), `src/SettingsState.test.ts` (new coverage).

## H. Tests / Results

Focused: `FlairCurves.test.ts` 31/31 (10 new — `resolveFlairModulationWithParams` matches canonical defaults exactly, scales range/falloff proportionally without changing curve shape, honestly no-ops Wild's falloff, `inverseEffectiveWidthExpansion` round-trips under a rescaled range, Wild's default range exceeds 72 with no clamping, Wall/Blackbook stay within it). `FlairProperties.test.ts` 11/11 new (store starts empty; effective-params merge; per-brush non-leak; per-mode non-leak — the brief's own "changing Wall must not mutate Blackbook" requirement, tested directly; mode-switch-and-back coherence; Reset Property; Reset Flair; empty-entry cleanup; modified-flag accuracy; row bounds sanity for every mode). `SettingsState.test.ts` 9/9 (3 new reducer tests mirroring the Spray ones). `BrushStudio.test.ts` 8/8 unchanged (its pure list/grouping functions were never touched).

Full suite: **518/518 passing** (up from 495 before this pass). TypeScript clean. Production build clean (`dist/assets/index-T49Yufbc.js`).

Acceptance-list items not covered by an automated test, covered live instead (consistent with this codebase's established split — `main.ts`/DOM wiring has no unit-test harness; see `BrushStudio.ts`'s own file-header comment): Flair section appearing/not-appearing per cap, live preview updating on every control, the full mode-switch-preserves-modifications flow, Wild's Brush-Studio-displayed extended range, Pink Dot's live-canvas behavior.

## I. Live Verification

All of section 11's matrix run in the current-host browser against the actual built app:

- **A** Track Marks + Off: FLAIR group shows only the Mode selector, quiet, no sliders.
- **B** Wall defaults: Amount 1.00 / Range 1.00 / Smoothing 0.12 / Bloom 1.00 / Falloff 0.40 — matching the canonical math exactly; preview showed a real thick-belly/thin-ends sweep immediately (no animation needed).
- **C/D** Flair Amount → 2.50 and Flair Range → 2.50: both applied live with modified dots + individual Reset buttons; Range visibly and immediately thickened the preview's peak.
- **E** Flair Smoothing → 0.80: applied live (no visible preview change, correctly — smoothing only affects live-drag responsiveness, not the static preview's resolved width, confirmed by design and not a bug).
- **F/G** Switched to Blackbook: showed its own genuine untouched defaults (0.50/0.55/0.40/0.25/0.15), Reset Flair correctly disabled, Effective Range "4–37 wall units," preview reverted to Blackbook's own tighter shape — zero leakage from Wall's tweaks.
- **H/I** Switched back to Wall: Flair Amount 2.50 (with modified dot) still showing, preview back to Wall's wide-bulge look — session modifications preserved coherently across the round trip.
- **J** Reset one property (Flair Amount): reverted to 1.00 alone; Flair Range stayed at 2.50.
- **K** Reset full Flair: all five values reverted to Wall's canonical defaults simultaneously; preview reverted to the unmodified shape.
- **L** Wild mode: Amount/Range both 1.60 (its own extended defaults), preview showed the widest sweep of all three modes; Effective Range read "4–100 wall units" with the boundary note visible.
- **M** Preview updated visibly and immediately at every step above — always the real engine, confirmed by the visual character (grain, overspray, dwell) staying identical to Track Marks' normal look throughout, just wider/narrower.
- **N** Switched to Pink Dot Fat: no FLAIR group rendered at all (General → Shape → Paint directly); separately, a live Alt-drag dispatched directly on the canvas with Track Marks + Wild active drove the TRUE resolved size (`#radius-val`) smoothly to ~100 while the shared slider's own `.value` stayed clamped at 72 — the documented boundary, reconfirmed at the canvas level, not just in Brush Studio.
- **No console errors** at any point across the entire sequence (checked after load, after every mode switch, after every slider edit, after both resets, and after the final canvas-level drag test).

## J. Known Deferred Items

- The shared `#brush-radius` slider itself remains visually clamped at 72 for Wild — by design, per the brief's explicit "do not simply widen the global slider." Brush Studio's Effective Range readout and `#radius-val` are the true, non-clamped sources.
- Flair is still Track-Marks-only at runtime — Brush Studio's FLAIR group is coded to only ever render for `track-marks`; extending it to other caps was explicitly out of scope ("Do not wire Flair into physical caps yet").
- `bloom01`/`endpointAuthority` remain schema-only, unwired to any renderer — unchanged from V0.8; nothing in this pass needed to touch that boundary, and the brief's "do not invent new physics" argues against wiring them opportunistically here.
- No persistence — `flairOverrides` is session-local `SettingsState`, same as `sprayOverrides`, cleared on reload.
- Surface Context still has no UI selector (unchanged from V0.8 — this pass's brief explicitly reiterated "do not conflate Surface Context and Flair Mode" and did not ask for a Surface Context control).

## K. Exact Next Recommendation

If a future pass wants Flair on more than one brush, the smallest correct next step is promoting `trackMarksFlairMode`/`trackMarksFlairDistance01`/`trackMarksFlairOutputMultiplier` from single `App` fields into a per-cap-keyed structure (mirroring `FlairOverrideStore`'s own `capId` keying) — everything else (the override store, `resolveFlairModulationWithParams`, the Brush Studio row-builders) is already generic enough to need no change; only the "which brush is the one live consumer" gate in `main.ts` and `BrushStudio.ts`'s `preset.id === "track-marks"` checks would need to widen to a small allow-list.

## Commit

`<pending — see final report>` — "feat: Spatial Spraypaint Brush Studio Flair controls — mode selector, per-(brush,mode) session overrides, live-preview, extended-range readout, Track Marks only"
