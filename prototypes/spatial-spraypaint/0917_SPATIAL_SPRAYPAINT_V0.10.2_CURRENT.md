# Spatial Spraypaint V0.10.2 Current Status

Date: 2026-09-17

Status: COMPLETE — Marker + Spray Control Reduction. Continues the V0.10 UI Reset line. No rendering fidelity changed — `SprayBrushEngine.ts`, `PaintMarkerEngine.ts`, and `WetPaintModel.ts`'s deposition/drip physics are byte-for-byte untouched; every change is UI selection/state, or a single default-value constant. 603/603 tests pass, TypeScript clean, production build clean.

Baseline: V0.10.1 commit `09a22ce`/`b3a61f9` (compact drawing controls).

## Marker Size Selection

**Removed**: the XS/S/M/L/XL text labels on the 5 size-preset buttons, and the `Width · 28` raw-number readout above them.

**Replaced with**: `renderMarkerSizeSample` (new, `BrushPreview.ts`) — a small canvas per button drawing an actual visual sample of the nib/footprint at its real relative size and shape:
- **Round Marker** → a filled circle
- **Chisel Marker** → a flat, rounded rectangle (the chisel tip's actual cross-section, never a circle)
- **Mop** → a broader, softer circle (lower opacity, same shape family as Round but reads as the wetter, wider tip)

Sizing is genuinely relative, not a fixed icon scaled by a discrete step: each sample's diameter is `preset.width * 0.5`, so a button's glyph is literally proportional to that preset's real wall-unit size — smallest-to-largest across the row, and consistently scaled across marker families too (Mop's smallest preset renders visibly larger than Round's smallest, matching their real relative sizes). No raw wall-unit number is shown anywhere in this row; the only place that number still appears is Brush Studio's own Size slider readout (calibration-appropriate, per V0.10's established "raw units stay in diagnostics/calibration" rule). Deliberately a static glyph, not a live `PaintMarkerEngine` stroke render — the actual renderer is untouched, and a live stroke sample there would visually compete with the selected size's own preview shown just above the row.

## Marker Physics Controls (Flow / Viscosity)

**Removed** from the normal marker picker entirely — the `#wet-controls` block (two `<select>`s) is gone from `index.html`, along with its `main.ts` event wiring. "Normal users should not have to configure paint chemistry before drawing."

**Moved to Brush Studio**: `renderMarkerProperties` now includes a "Paint" group with Flow/Viscosity `<select>` rows, shown only for a wet-capable variant (`isWetMarkerVariant`) — Round never shows them, since it doesn't read them. Wired through two new `BrushStudioDeps` hooks (`getWetPaintControls`/`setWetPaintControls`), reusing the same global `WetPaintControlState` that existed before this pass (Flow/Viscosity were never per-marker-variant state; only where they're editable changed).

## Mop Defaults

`WetPaintControls.ts`'s `INITIAL_WET_PAINT_CONTROLS` changed from `{ flow: "balanced", viscosity: "balanced" }` to `{ flow: "high", viscosity: "runny" }`. Since Flow/Viscosity are global (not per-variant) and Mop is currently the only wet-capable marker reachable through the shipped UI (per V0.10's marker consolidation), this single default constant IS Mop's own canonical default in practice. Mop's own deposition/drip physics — `PaintMarkerEngine.ts`'s `MARKER_VARIANTS` entry (`dripTendency: 0.68`, `defaultSize: 44`, `material: "wet"`) — are completely untouched; Flow/Viscosity only ever scale delivery/threshold/width/length multipliers on top of that unchanged identity.

## Spray Normal Panel

**Removed entirely**: the Size/Coverage/Fill override section (`#spray-property-controls` — sliders, checkbox, and their V0.10.1-era compact rows) is gone from the normal Spray picker. Selecting Spray now reduces to exactly:

```
Spray
→ choose cap
```

plus two genuinely live, non-override status readouts that were already conditionally hidden and quiet by default: the Alt+scroll Spray Angle indicator and the Flair mode indicator (both wrapped in a new `#spray-live-status` container that itself takes no visible space while both are hidden). These aren't "override" controls — there's no button to change them here, they only ever reflect a live gesture already in progress elsewhere (Alt+scroll wheel, Alt+drag, the F-key Flair cycle).

**Where Size/Coverage/Fill still live**: Brush Studio, unchanged from V0.10 — they were never removed from there, only from the duplicate normal-panel copy. `this.baseRadius` (what actually drives live painting) now gets resynced from the cap's effective style inside `updateRadiusUi` on every relevant change, replacing the logic that used to live in the deleted slider's own `input` handler — so a Brush Studio size override still takes effect on the next stroke exactly as before, just without a second slider in the normal picker.

## Spray Categories

Fat/Thin/Specialty (and Creative/Digital, previously folded into Specialty) now each render as their own `<section class="brush-family-group">` — a tinted card with its own rounded background and inter-section gap, not just a small uppercase label and a hairline between one continuous button list. Also split out a **Creative / Digital** section for the four caps already classified `digital-effect` by `CustomBrush.ts`'s existing `classifyBuiltInSprayCap` (Wiggly Needle, Fuzz Fat, Ring/Donut, Dry/Streak) — previously mixed into Specialty alongside physical-reference caps (Oval Calligraphy, Rectangular Transversal, Needle, Soft/Fade); now visually and structurally separate, matching "keep Creative/Digital effects separate if present."

## Live Verification

Screenshotted, via the real cap/marker pickers:

- **Spray**: opening the picker shows only `Spray → choose cap` and `Edit Brush →` — no Size/Coverage/Fill controls anywhere in the normal flow. Fat renders as its own card; scrolling reveals Thin, then Specialty, then a clearly separate Creative/Digital card, each with visible gaps between them.
- **Marker, Round**: 5 growing filled-circle samples, no text labels, no raw numbers, no Flow/Viscosity.
- **Marker, Chisel**: 5 growing flat rectangular-bar samples — visibly distinct shape from Round's circles.
- **Marker, Mop**: 5 growing soft/broad circular samples, visually softer than Round's.
- **Brush Studio, Mop**: "Paint" section shows `Flow: High` and `Viscosity: Runny` selected by default — confirming the new canonical default — and both remain live-editable there.
- **Rendering unaffected**: drew a live Mop stroke and a live Pink Dot Fat stroke (no override panel driving them) — both matched their known, previously-verified look exactly; the cap's own default size/density applied automatically with no slider needed.

## Tests

603/603 passing (602 → 603: one new test locking in Mop's High/Runny default in `WetPaintControls.test.ts`). One existing test (`updates one contextual dimension without mutating the other`) was rebased onto a local `balanced/balanced` fixture object instead of the now-repurposed `INITIAL_WET_PAINT_CONTROLS`, since it was testing `updateWetPaintControls`'s own immutability, not any particular default value — the assertion is unchanged, just no longer coupled to a default this pass deliberately moved.

## TypeScript / Build

`npx tsc --noEmit`: clean. `npx vite build`: clean (`dist/index.html` 50.13kB, essentially flat vs V0.10.1's 51.62kB — the removed override markup and the new canvas-based size buttons roughly offset each other; `dist/assets/index-*.js` 372.13kB, down slightly from the removed event-listener code).

## Files Changed

- `index.html`: removed `#wet-controls`/`#spray-property-controls` markup and their CSS; `#marker-width-controls` label simplified to `Size`; cap list wrapped in `<section class="brush-family-group">` per category with a new Creative/Digital section; new `.brush-family-group` CSS; `#spray-live-status` wrapper for the two remaining live readouts; `.marker-width-choice` CSS updated for canvas samples at a touch-friendly 44px min-height.
- `src/main.ts`: removed dead event listeners (`brush-radius`, `radius-reset`, `spray-coverage`, `coverage-reset`, `fill-mode-toggle`, `wet-flow`, `wet-viscosity`) and their now-orphaned DOM sync code; `updateRadiusUi`/`updateCoverageUi` simplified to keep `this.baseRadius` in sync without a slider to drive it; `renderMarkerWidthPresets` rewritten to build canvas samples via `renderMarkerSizeSample` instead of text buttons; wired new `getWetPaintControls`/`setWetPaintControls` deps for Brush Studio.
- `src/BrushPreview.ts`: new `renderMarkerSizeSample` function.
- `src/BrushStudio.ts`: `renderMarkerProperties` gained a Flow/Viscosity "Paint" section for wet-capable variants; `BrushStudioDeps` gained the two wet-paint-control hooks.
- `src/WetPaintControls.ts`: `INITIAL_WET_PAINT_CONTROLS` default changed to `{ flow: "high", viscosity: "runny" }`.
- `src/WetPaintControls.test.ts`: one test rebased off a local fixture, one new test added.

No changes to `SprayBrushEngine.ts`, `PaintMarkerEngine.ts`, `WetPaintModel.ts`, `FlairCurves.ts`, `FlairContinuity.ts`, `FlairProperties.ts`, `SprayCapPresets.ts`, `ColorPalette.ts`, or any physics/rendering file.

## Commit

`5de48db` — "feat: Spatial Spraypaint V0.10.2 -- visual marker size samples, remove chemistry/override controls from normal UI"
