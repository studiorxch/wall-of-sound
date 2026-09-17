# Spatial Spraypaint V0.8.3 Current Status

Date: 2026-09-16

Status: COMPLETE — Flair Stabilization + Pencil V1 Prep. Flair's taper is now genuinely smooth (eased, not linear) and carries an explicit, editable depth-response polarity. The main drawing controls are confirmed frozen/stable — no shell changes were needed. A diagnostic-only Apple Pencil input layer reads real `PointerEvent` values, and a minimal, Track-Marks-only V1 mapping (pressure→coverage, tilt→spray angle) proves the canonical input boundary end to end, all without touching distance, Pink Dot, or any other cap's physics. Full automated suite, TypeScript, and production build pass; live-verified in-browser.

Baseline: V0.8.2 commit `57f6498`/`81b65ad` (Flair Continuity Fix), on top of V0.8.1 `ee911e6`/`03d86dc`, V0.8 `47cf87c`/`b9ae60f`, V0.7 `407c4d0`/`2293a4a`.

## A. Flair Taper Fix

**A1 — Smoother taper envelope.** `FlairContinuity.ts`'s existing dense arclength resample (from V0.8.2) already removed the segmented/capsule artifact, but its per-run ramp was still linear, so consecutive resampled runs met at a sharp angle ("kink") wherever the target width/opacity itself changed direction — most visible right at a near→far→near turnaround. Added `smoothstep(t) = t²(3-2t)` (zero derivative at both t=0 and t=1) and applied it to width/opacity interpolation ONLY — x/y/z/timestamp/velocity stay physically linear along the real path, since those must track the actual drawn arc, not an eased fiction of it. `smoothstep(0)=0`/`smoothstep(1)=1` exactly, so the true endpoint values — and Flair's full range — are unchanged; only the path between them eases in and out, so consecutive runs now meet tangent-to-flat instead of kinking.

**A2 — Depth Response.** New `FlairDepthResponseId = "far-wide" | "near-wide"` (`FlairCurves.ts`). A pure mapping POLARITY, not a new renderer or curve family: `resolveDepthResponseCurveInput(distance01, depthResponse)` mirrors normalized distance around its own midpoint (`1 - t`) for `near-wide`, identity for `far-wide`, applied ONCE at the top of `resolveFlairModulationWithParams` so width, bloom, and output attenuation all reinterpret "distance" consistently. `off` is explicitly excluded from the flip (its own curve is the plain, non-symmetric identity `t => t`, so it is the one mode where polarity would otherwise actually change behavior — guarded so `off` stays a hard identity regardless of any override, matching every other identity invariant already tested in this codebase). `inverseEffectiveWidthExpansion` (used to seed a fresh drag) is polarity-aware too: it always binary-searches the pure, monotonic-increasing curve, then un-mirrors the result (`resolveDepthResponseCurveInput` is self-inverse), since a `near-wide` combination is monotonic-*decreasing* in `distance01` and would break a naive search.

Defaults (`FLAIR_MODE_DEFAULT_DEPTH_RESPONSE`, part of `getFlairProControlMetadata`'s returned bundle): Wall → `far-wide`, Blackbook → `near-wide`, Wild → `far-wide` (editable), Off → `far-wide` (irrelevant — ignored per the guard above). Session-overridable per (cap, mode) through the exact same `FlairParameterOverride`/`FlairOverrideStore` machinery the five numeric controls already use — `depthResponse` is simply a sixth, non-numeric field on that same type.

## B. Depth Response Implementation

Exposed as a new "Depth Response" two-option `<select>` row in Brush Studio's FLAIR section (`BrushStudio.ts`), directly under Mode and above the five numeric sliders — same modified-dot + per-property Reset pattern as every other Flair row, same `getFlairOverrides`/`setFlairProperty`/`resetFlairProperty` wiring. Changing it live-updates the preview (`renderTrackMarksFlairPreview`) immediately, same as every other Flair control. Visible only when a non-off mode is active (Off's panel stays quiet, per the Creative Interface Doctrine).

## C. Drawing-Control Freeze Status

Confirmed, not changed — every control named in the build brief already exists and is stable:

| Control | Location | Status |
|---|---|---|
| Tool / Cap | Compact chooser | Unchanged |
| Color | Compact color button | Unchanged |
| Size | Compact `#brush-radius` slider | Unchanged |
| Coverage | Compact `#spray-coverage` slider | Unchanged |
| Flair Mode | Brush Studio FLAIR group | Unchanged (V0.8.1) |
| Depth Response | Brush Studio FLAIR group | **New this pass** — the one addition B required |
| Flair Amount / Range / Smoothing | Brush Studio FLAIR group | Unchanged (V0.8.1) |
| Fill | Compact `#fill-mode-toggle` | Unchanged |
| Undo / Clear | Compact toolbar buttons | Unchanged |
| Zoom | Compact wall-scale button | Unchanged |

No toolbar/shell redesign was needed or attempted. Deeper controls (Bloom Response, Output Falloff, and every SHAPE/PAINT/MOTION readout) correctly remain Brush-Studio-only, per the brief's own instruction.

## D. Pencil Raw-Input Diagnostic Architecture

New `PencilInput.ts`, the "Input Normalizer" stage of the brief's own canonical boundary diagram:

```text
Mouse / Pencil / Hand
      v
Input Normalizer        <- PencilInput.ts, normalizePointerSample
      v
CanonicalSprayState      <- x/y/distance/angle/output/velocity/dwell (ToolTaxonomy.ts, unchanged)
      v
Flair Mapping             <- FlairCurves.ts, completely unaffected by this module
      v
Cap Renderer
```

`normalizePointerSample(event, previous)` is pure and DOM-free (takes a small `PointerEventLike` structural interface a real `PointerEvent` satisfies with zero adaptation, so it's callable from tests with a plain object). It reads, verbatim, off the actual event: `pointerType`, `pressure`, `tiltX`, `tiltY`, `twist`, position, timestamp — with the exact fallback the Pointer Events spec itself defines when a field is absent (pressure 0.5, tilt/twist 0), never a guessed or fabricated value ("do not guess support"). It derives `velocity` (screen-px/ms between consecutive samples, same shape as `CanonicalStrokeManager`'s own), `isPencil`/`isTouch` (from `pointerType`), and `coalescedCount` (`event.getCoalescedEvents().length`, 0 when unsupported).

A new always-on (but UI-gated-visible) capture runs on every `pointermove` in `main.ts`, independent of drawing state — diagnostics are visible just by moving a Pencil near the canvas, before ever touching down. A new "Pencil diagnostics" checkbox in Settings (`pencilDiagnosticsVisible`, `SettingsState`) toggles a small floating panel (`#pencil-diagnostics-panel`) showing pointer type, pressure, tilt X/Y, twist, velocity, and coalesced count live — quiet/hidden by default, per the Creative Interface Doctrine. (One real bug was caught and fixed during live verification: the panel was first nested inside `#tracking-overlay`, whose own `.visible` class is hand-tracking-gated — meaning the panel would never show on a desktop mouse session regardless of its own toggle. Moved it to be its own top-level sibling, verified working afterward.)

## E. Pencil Normalized State / Mapping V1

Implemented ONLY after the diagnostics above were proven live (pressure/tilt/twist/pointerType all confirmed reading real values first). Per section E's checklist:

- **x/y → position**: already automatic — Pencil's `clientX`/`clientY` flow through the exact same `pointerScreenPoint`/`screenToWall` path every input source already uses. No new code needed.
- **pressure → output/deposition**: `resolvePencilCoverage(pressure)` — a pure function of pressure alone (`0.35 + pressure*0.65`), reusing the EXISTING generic `coverage` per-brush override (already a deposition-density control, already rendered, already tested) rather than inventing a new mechanism.
- **tilt → spray angle**: `resolvePencilSprayAngle(tiltX, tiltY, maxAngleDegrees)` — combined tilt magnitude mapped to `[0, PLUME_MAX_ANGLE_DEGREES]`, reusing the EXISTING generic `sprayAngle` per-brush override.
- **velocity → existing velocity behavior**: already automatic — `CanonicalStrokeManager` computes velocity from x/y/timestamp regardless of input source.
- **distance remains independent**: neither mapping function has a distance/`baseRadius` parameter to even read (verified directly in tests — `resolvePencilCoverage.length === 1`, `resolvePencilSprayAngle.length === 3`, tilt/pressure only). Live-verified: a full pencil stroke with pressure ramping 0.2→0.92 left `#radius-val` at exactly 42 throughout — completely untouched.

**Both writes are gated to Track Marks only**, in `main.ts`'s new `applyPencilTrackMarksMapping(sample)`: a no-op for any non-pen pointer, and a no-op for any cap other than `track-marks` — even though `coverage`/`sprayAngle` are generic per-brush fields every cap already reads, gating the WRITE by cap id (the same pattern every other "safe sandbox" mechanism in this codebase already uses) means Pink Dot's own `sprayAngle`/`coverage` entries are never touched. Live-verified directly: the identical pencil pressure/tilt gesture against Pink Dot Fat left its coverage at 100%, angle at 0°, and size at 42 — completely unaffected.

## F. On-Device Testing Requirements

Everything below was built and reasoned about from the Pointer Events spec and this codebase's own existing input plumbing; **none of it has been exercised against real Apple Pencil + iPad hardware**, since this environment has no such device. What must be verified on-device, and why:

1. **`touch-action: none` on `#composite-canvas`** (already present, pre-existing) should prevent the browser's own pan/zoom/scroll gestures from competing with Pencil strokes — needs confirming on real Safari/iPadOS, where touch-action edge cases have historically differed from desktop Chrome.
2. **Pointer capture** — drawing itself relies on `window`-level `pointermove`/`pointerup` listeners (not `setPointerCapture` on the canvas; capture is currently used only for the Pan gesture). This should keep working if the Pencil leaves canvas bounds mid-stroke, but iPadOS's own pointer-event delivery quirks during fast strokes need confirming on-device.
3. **Finger vs. Pencil distinction** — `pointerType` correctly distinguishes `"pen"` from `"touch"` in the Pointer Events spec and in this module's own logic/tests; needs confirming that iPadOS actually reports `"pen"` for Apple Pencil specifically (it does, per Apple's documentation, but this environment cannot confirm empirically).
4. **No unintended pan/zoom from Pencil** — this build never wires Pencil into the existing pan gesture (`shouldPanPointer` keys off mouse button, not pointer type), so a Pencil-down should behave like a left-mouse-down for drawing purposes; needs confirming iPadOS doesn't intercept two-finger-adjacent Pencil gestures at the OS level before they reach the page.
5. **Coalesced events and duplicate deposition** — `coalescedCount` is captured for the DIAGNOSTIC READOUT ONLY in this pass; it is never consumed for deposition, so there is no possibility of duplicate deposition from coalesced samples yet (deliberately deferred — see Known Deferred Items). What needs on-device confirmation is simply that `getCoalescedEvents()` actually returns a non-empty, sensible array on iPadOS Safari (support varies by browser/OS version) — the diagnostic panel will show this directly once tested.
6. **Real pressure/tilt/twist ranges** — this pass's mapping constants (the `0.35`/`0.65` coverage floor/span, the tilt-to-90° normalization) were chosen from the Pointer Events spec's documented ranges, not from feel-testing against a real Pencil. They should be treated as a first approximation pending on-device tuning.

## G. Tests / Results

62 new/changed focused tests across five files, all passing:

- **`FlairContinuity.test.ts`** (+3): width does not ramp linearly (ease-in/ease-out, not a straight line); still reaches the exact true endpoint values (range never reduced by easing); position/timestamp/velocity stay linear (only width/opacity are eased).
- **`FlairCurves.test.ts`** (+9, 1 pre-existing assertion updated for the new `depthResponse` field): Wall's default is `far-wide`; Blackbook's default is `near-wide`; Wild defaults to `far-wide` but accepts an explicit override; far-wide gives thin→broad→thin for a near→far→near sweep; near-wide gives broad→thin→broad for the identical input; both polarities are monotonic across the full sweep (smooth, not piecewise); the achievable width RANGE is identical under both polarities (polarity flips direction, not range); `off` stays identity regardless of any `depthResponse` override; `inverseEffectiveWidthExpansion` round-trips correctly under `near-wide` too.
- **`PencilInput.test.ts`** (+9, new file): raw values captured verbatim from a pen event; spec-defined fallbacks used when a field is absent (never fabricated); pen/touch/mouse distinguished via `pointerType`; velocity computed from consecutive samples; coalesced-event counting with and without browser support; a mouse event never reads as Pencil even with pressure/tilt values present; `resolvePencilCoverage`/`resolvePencilSprayAngle` are pure single/triple-argument functions with no distance parameter to even read; tilt mapping is bounded even for extreme tilt values.
- **`SettingsState.test.ts`** (+1): `pencil-diagnostics` toggles independently of `tracking-debug`.

Full suite: **550/550 passing** (up from 528 before this pass). TypeScript clean. Production build clean (`dist/assets/index-c9i6ATQw.js`).

## H. Files Changed

New: `src/PencilInput.ts`, `src/PencilInput.test.ts`.
Modified: `src/FlairCurves.ts` (Depth Response type/defaults/guard, `resolveFlairModulation`/`resolveFlairModulationWithParams`/`inverseEffectiveWidthExpansion` updated), `src/FlairCurves.test.ts`, `src/FlairContinuity.ts` (`smoothstep` easing), `src/FlairContinuity.test.ts`, `src/FlairProperties.ts` (`depthResponse` field + merge), `src/BrushStudio.ts` (Depth Response row), `src/SettingsState.ts` (+test) (`pencilDiagnosticsVisible` field/action), `src/main.ts` (diagnostic capture, `applyPencilTrackMarksMapping`, UI wiring), `index.html` (Depth Response needs no new markup — reuses the existing `<select>` pattern from Mode; Pencil diagnostics panel + Settings checkbox added, and moved out of the hand-tracking-gated `#tracking-overlay` after catching that bug live).

## I. Commit

`873a000` — "feat: Spatial Spraypaint Flair Stabilization (smooth taper, Depth Response) + Apple Pencil V1 prep (diagnostics, Track Marks mapping)"

## J. What Should Be Tested Physically on iPad Next

In priority order:
1. Open the app in Safari on a real iPad with Apple Pencil (1st or 2nd gen), select Track Marks, enable Pencil diagnostics in Settings, and confirm the panel shows real, changing pressure/tilt/twist values as the Pencil is used — this is the single most valuable first check, since it validates every assumption in section D/F against real hardware in one pass.
2. With diagnostics still open, draw a Track Marks stroke and confirm `touch-action: none` fully suppresses page scroll/zoom during the stroke (item F1).
3. Draw past the canvas edge mid-stroke and confirm the stroke doesn't break or jump (item F2, pointer capture behavior).
4. Rest a finger on the canvas alongside Pencil use and confirm `pointerType` correctly reports `"touch"` vs `"pen"` in the diagnostic panel (item F3).
5. Check whether `getCoalescedEvents()` returns real sub-samples on iPadOS Safari (item F5) — informs whether a future higher-resolution-deposition pass is worth building.
6. Only after 1-5 are confirmed: feel-test the pressure→coverage and tilt→spray-angle mapping constants on Track Marks and report whether they feel proportionate, or need retuning (item F6) — explicitly NOT Pink Dot or any other cap, per this pass's own scope.
