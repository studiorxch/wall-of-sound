# Spatial Spraypaint V0.10 Current Status

Date: 2026-09-17

Status: COMPLETE — UI Reset Before iPad. Renderer work, Flair tuning, and Pencil work frozen for this pass, per explicit instruction. This is a UI/state cleanup only: no cap renderers, marker physics, Mop physics, Flair engine, manufacturer color data, calibration/reference data, or Track Marks behavior were touched or deleted — every pure logic function this pass stopped calling from the DOM is still exported and still covered by its own tests. 602/602 tests pass, TypeScript clean, production build clean.

Baseline: V0.9.1 commit `eec9c0d`/`e8895c5` (iPad LAN test access).

## Controls Removed

- **Duplicated tool labels**: the tool-chooser row showed `SPRAY / Spray Can` and `MARK / Paint Marker` (abbreviation + full name, redundant). Reduced to a single row: `Spray | Marker`.
- **Cap-picker jargon and raw ranges**: every Spray cap row in the normal picker showed a meta line like `24–42 · digital baseline`, `3–10 · effect cap, not physical`, or `36–62 · digital archetype, not physical`. Removed entirely — a row now shows only its preview thumbnail, its name, and the existing Fat/Thin/Specialty category heading. The terminology itself (`digital baseline`, `PHYSICAL REFERENCE`, `DIGITAL EFFECT`, wall-unit ranges) still exists internally (`CustomBrush.ts`'s `BrushProvenance`, `SprayCapProfile.ts`'s calibration notes) — it's just no longer in the normal picker.
- **"wall units" suffix in the primary UI**: the Spray size slider read `Spray size override · 32 wall units`; the Marker width readout read `28 wall units`. Both now show a bare number (`Size · 32`, and the width readout shows `28`) — internal unit terminology stays in Brush Studio (now the designated calibration/diagnostics area) and the Calibration Bench, not the normal drawing controls.
- **Brush Studio's internal tool-switch rail**: a second `Spray Can | Paint Marker` switch lived inside Brush Studio, duplicating the primary tool picker. Removed.

## Duplicate State Paths Removed

- **Brush Studio's duplicate brush catalog**: Brush Studio carried its own full Fat/Thin/Specialty Spray list and Round/Chisel/Mop Marker list (`#brush-studio-brushes-spray`, `#brush-studio-brushes-marker`) — a second, independent way to switch which brush was live-selected, entirely separate from the primary cap/marker picker. Removed from the DOM and from `BrushStudioController` (the `renderSprayBrushList`/`renderMarkerBrushList`/`buildSprayRow`/`buildMarkerRow`/`selectSprayRow` methods). Brush Studio's grid layout collapsed from 3 columns (`110px 250px 1fr`) to 1 (`1fr`); the dialog's own width shrank from `min(1000px, 100%)` to `min(520px, 100%)` to match.
- **Marker variant duplication between the picker and the live-state label**: the picker used to expose 6 separate marker buttons (Round, Classic, Clean, Wet, Balanced, Drippy); the toolbar's live-state chip, separately, read the *raw* internal variant name (e.g. `Mop · Balanced`) even after the picker itself was reduced to 3 buttons — an inconsistency where the chip could describe a variant the picker no longer named that way. Fixed with a single presentation mapping (`markerDisplayName`, `main.ts`) reused by the toolbar chip, so the picker and the live-state label always say the same thing.

## Brush Studio Changes

- **Opens directly on the currently selected brush** — `open()` already synced `selectedSprayCapId` from live selection; `render()` now ALSO re-syncs it on every call (previously only at `open()`), so the dialog can never show a stale brush if the live selection changes while it's open. The one deliberate exception: previewing a just-duplicated **custom** brush (`duplicateSelectedSprayBrush`) is never clobbered by this re-sync, since a custom brush is never itself the live paint selection.
- **Header now reads** `Brush Studio` with a small `Advanced — not required to draw` note, making the "this is optional, not where you draw" framing explicit rather than implied.
- **What's left is exactly the calibration/advanced surface** the brief asked to keep: size envelope (Size/Coverage/Fill mode/Spray Angle sliders), Flair Mode + min/max/smoothing controls (for the two real, user-reachable caps), the full Shape/Paint/Motion physical-parameter readout (still showing raw decimals like `Core opacity 0.29` — correct, since Brush Studio is now the designated "diagnostics/calibration only" home for those, per the brief's own carve-out), the physical-reference/digital-effect provenance badge, and Reset/Duplicate/Calibrate actions.
- **Pure grouping/labeling logic preserved and still tested**: `buildSprayBrushList`, `groupSprayPresetsByFamily`, `groupMarkerVariantsByFamily`, `markerFamilyFor`, `provenanceLabel`, `findSprayBrushPreset` are all still exported from `BrushStudio.ts` and still exercised directly by `BrushStudio.test.ts` — only the DOM rendering that turned them into a second picker was removed.

## Color-Default Changes

- **`INITIAL_COLOR_PALETTE_STATE.paletteId`**: `"studiorich"` → `"montana-gold"`. A fresh session now browses into a full manufacturer palette (256 colors) by default, not the 11-swatch StudioRich set.
- **`COLOR_PALETTES` array reordered**: manufacturer palettes (Montana Gold, BLACK 400ML) now lead; StudioRich moved last — this array's order drives the palette `<select>`'s own listing order, so StudioRich now reads as the trailing, optional entry rather than the first thing offered.
- **What was already correct, and untouched**: the color popover's own layout already led with Current color, then Recent, then a Search box, then the palette selector and swatch grid — exactly the "Current, Recent, Search, manufacturer/full palettes" priority order the brief asked for. `recentColors` tracking, palette switching, and search were all pre-existing and did not need new work.
- **`currentColor`** (`#e92f3d`, the loaded ink) is unchanged — which palette is being *browsed* and which color is currently *loaded* are separate concerns; changing the default browse palette doesn't require picking a different starting ink.

## Marker Consolidation

- **Picker now shows exactly 3 rows**: `Round Marker`, `Chisel Marker`, `Mop` — mapped to the existing internal variant ids `round`, `chisel`, and `mop` respectively.
- **`Classic`, `Clean`, `Wet`, `Balanced`, `Drippy` are no longer separate picker rows.** Their underlying variant definitions (`clean-chisel`, `drippy-chisel`, `drip-mop` in `PaintMarkerEngine.ts`'s `MARKER_VARIANTS`), physics (drip tendency, material, default size), and the existing Flow/Viscosity wet-paint controls are completely untouched — `isWetMarkerVariant` still includes `mop`, so the Flow/Viscosity controls still surface live (correctly) whenever Mop is selected, since that materially changes the next stroke.
- **Not reachable through the shipped UI going forward**: `clean-chisel`/`drippy-chisel`/`drip-mop` were previously selectable via the picker's own 6 buttons and via Brush Studio's now-removed marker catalog — both paths are gone, so those three variant ids are presently unreachable from the UI (their code remains, byte-for-byte, for a possible future surfacing — e.g. as modifiers on the 3 kept identities rather than separate brushes).

## Live State

- **New general "customized" indicator** (`updateCustomizedBadge`, `main.ts`): the toolbar chip's badge — previously coverage-percentage-only — now lights up whenever ANY setting that materially changes the next stroke differs from the selected cap's defaults: size override, coverage override, fill-mode override, spray-angle override, or an active Flair mode. Badge text: the coverage percentage when only coverage is customized (preserves the prior specific signal), `Flair` when a Flair mode is active, otherwise `Custom`. Hidden when nothing is customized. Wired into both `updateCoverageUi` (fires on every property-slider change) and `updateFlairStatusUi` (fires on every Flair mode change), so no override can silently exist without surfacing here.
- **Raw decimal exposure in the primary UI fixed**: `updateRadiusUi` previously wrote `this.baseRadius.toString()` directly into the visible size readout — for a Flair-resolved size (a genuine float, e.g. `4.2195766379361705`) this would have shown exactly the kind of raw value the brief calls out. Now rounds for display (`Math.round(this.baseRadius)`) while the actual slider value and every real paint/physics computation still use the true float — display-only change, zero effect on rendering.

## Acceptance Walkthrough (live-verified, screenshots below)

1. Fresh reload → toolbar shows `Spray | Marker`, no duplicated labels.
2. Chose Spray → cap picker shows clean rows (preview + name + Fat/Thin/Specialty heading only).
3. Chose Pink Dot Fat.
4. Opened the color chooser → default palette is Montana Gold (a full manufacturer palette), Current/Recent/Search all present and ahead of the swatch grid; picked a color.
5. Toolbar chip now reads `SPRAY / Pink Dot Fat` with the picked color swatch shown directly beside it — the active drawing state is immediately legible with no panel to decode.
6. Drew a live stroke with Pink Dot Fat — rendering fidelity unchanged (screenshotted, matches this cap's known look from every prior pass).
7. Switched to Marker.
8. Picker shows exactly `Round Marker`, `Chisel Marker`, `Mop` — chose Mop; toolbar chip reads `MARKER / Mop` (previously would have read `MARKER / Mop · Balanced`, now fixed to match the picker's own naming).
9. Drew a live stroke with Mop — rendering fidelity unchanged (screenshotted).
10. Reopened Spray and opened Brush Studio → opens directly on the currently selected brush (no catalog to browse through, no picking required to see it), clearly labeled "Advanced — not required to draw," and shows only calibration-grade content (Flair min/max/mode, physical parameter readout with the physical-reference badge, Reset/Duplicate/Calibrate).

## Tests

602/602 passing (601 → 602: one new test, `ColorPalette.test.ts`, explicitly locking in "does not default into the limited StudioRich palette... StudioRich must still exist and remain fully selectable"). One existing assertion (`getColorPalette(INITIAL_COLOR_PALETTE_STATE.paletteId).name` hard-checked `"StudioRich"`) was updated to match the new default rather than deleted, since it was testing a real invariant (a single canonical current-palette/color state) that's still true, just with a different default value. `BrushStudio.test.ts` required no changes — it already tested the pure grouping/labeling functions directly, independent of DOM rendering, so removing the catalog's DOM output didn't touch what it verifies.

## TypeScript / Build

`npx tsc --noEmit`: clean. `npx vite build`: clean (`dist/index.html` 49.98kB, down from 53.46kB — the removed markup measurably shrank the shipped HTML; `dist/assets/index-*.js` 373.56kB, materially unchanged).

## Files

Modified: `index.html` (tool/cap/marker picker markup, Brush Studio layout + header, CSS grid simplification), `src/main.ts` (customized badge, raw-decimal rounding, marker display-name mapping), `src/BrushStudio.ts` (catalog rendering removed, re-sync-on-render), `src/ColorPalette.ts` (default palette, array order), `src/ColorPalette.test.ts` (updated + one new test).

No changes to `SprayBrushEngine.ts`, `PaintMarkerEngine.ts`, `WetPaintModel.ts`, `FlairCurves.ts`, `FlairContinuity.ts`, `FlairProperties.ts`, any color-data JSON, `SprayCapProfile.ts`, `SprayCapCalibrationStatus.ts`, or any physics/rendering file.

## Commit

(pending — see next commit)
