# Spatial Spraypaint V0.10.6 Current Status

Date: 2026-09-17

Status: COMPLETE — Corrective Cleanup Pass. Restored intended marker drip hierarchy (Round/Chisel now render real light drips, Mop stays strongest), cleaned dev-facing language out of Brush Studio's ordinary advanced view, and re-verified the four items from the prior pass (wet-paint controls, Hand Tracking placement, zoom stepper, grid default) were already correct. 610/610 tests pass (1 new), TypeScript clean, production build clean.

Baseline: V0.10.5 commit `3077d60`/`a91b6b1`.

## 1. Marker drip hierarchy — fixed

**Root cause**: `MARKER_VARIANTS` in `PaintMarkerEngine.ts` had `dripTendency: 0` for both `round` and `chisel`. `DripAccumulator.observe()` (`DripLogic.ts`) short-circuits to `null` whenever `dripTendency <= 0` — so these two markers could never produce a drip, full stop, regardless of any UI or metadata. Separately, even a non-zero `dripTendency` would have gone nowhere: `depositActivePoint()` in `main.ts` only ever called the drip-triggering pipeline (`dripAccumulator.observe` → `toolRenderer.startDrip`) for `toolId === "spray-can"`. Paint-marker strokes never reached it at all — Mop gets its own separate wet-paint-accumulator drip mechanism (`WetPaintAccumulator`, gated by `isWetMarkerVariant`), but Round and Chisel (dry markers, not wet variants) had no drip mechanism wired to them whatsoever.

**Fix**:
- `PaintMarkerEngine.ts`: `round` → `dripTendency: 0.12`, `chisel` → `dripTendency: 0.15`. `mop` stays `0.68` (unchanged, canonical, still the strongest of the three exposed markers). Comment added explaining why these values are load-bearing, not display metadata.
- `main.ts`, `depositActivePoint()`: the drip-eligibility check widened from `toolId === "spray-can"` to also include `toolId === "paint-marker"` when `!isWetMarkerVariant(variantId)` — i.e. Round and Chisel now share Spray's existing generic dwell-triggered `DripAccumulator`/`toolRenderer.startDrip` pipeline, the same mechanism that already renders real, visible drips for every Spray cap. **Mop's own wet-paint-accumulator/renderer architecture was not touched at all** — it still uses its separate code path.

**Final canonical drip tendency values**:
| Marker | `dripTendency` | Mechanism |
|---|---|---|
| Round | `0.12` | Shared Spray `DripAccumulator` (dwell-triggered) |
| Chisel | `0.15` | Shared Spray `DripAccumulator` (dwell-triggered) |
| Mop | `0.68` (unchanged) | Its own `WetPaintAccumulator`/wet-drip renderer (untouched) |

Mop remains **Flow: High, Viscosity: Runny** (`INITIAL_WET_PAINT_CONTROLS` in `WetPaintControls.ts`, untouched since V0.10.2) — confirmed still showing in Brush Studio's Mop panel.

**Live verification** (one rendered stroke + hold per marker, via dispatched real `PointerEvent`s at the actual canvas, not synthetic state): Round produced a thin, subtle drip hanging from the hold point; Chisel produced a similarly light drip from its chisel cap; Mop produced a visibly thicker, longer drip than either — confirming the intended hierarchy (Round/Chisel light and subtle, Mop strongest). Screenshots captured for all three.

## 2. Wet-paint controls — already correct, re-verified

Flow/Viscosity are only rendered in Brush Studio's marker panel, gated by `isWetMarkerVariant(variant.id)` (true only for `mop`/`drippy-chisel`/`drip-mop`, none of which are exposed as extra picker entries). The normal marker browser is exactly `Round Marker` / `Chisel Marker` / `Mop` — confirmed via live screenshot of the mode/brush popover. No code change needed; this was already correct from V0.10.2.

## 3. Brush Studio cleanup

Removed from the **ordinary advanced view** (Calibration Bench, opened via `Calibrate…`, is untouched and keeps its own classification badges):
- **Provenance badge** (`#brush-studio-selected-provenance`, e.g. "Physical reference"): given `hidden` in the markup plus a `.brush-studio-provenance[hidden] { display:none }` override (the class's own `display:inline-block` would otherwise have beaten the UA `[hidden]` rule on specificity/source order). The JS that sets its text/dataset on every brush switch is untouched and harmless — it just writes to a permanently-hidden element now. Calibration Bench's own per-brush classification badges (`#calibration-left-status`/`#calibration-right-status`, driven by `getSprayCapClassification`) are separate elements and were not touched — provenance is still available there.
- **Raw "wall units" suffix**: removed from all four locations in `BrushStudio.ts` (Flair "Starts at / Opens to", Flair "Effective Range", marker Size readout ×2) — these now show plain numbers, matching how Size is already shown in the normal (non-Brush-Studio) UI. The one explanatory note that referenced "72-unit display" was reworded to "max of 72" for the same reason.
- **"Material" row** (marker properties panel, e.g. "dense"/"calligraphy"/"wet"): removed entirely — it was a raw enum value from `MarkerVariantDefinition.material`, purely implementation-facing, not genuinely useful outside calibration work (which Calibration Bench already covers for Spray caps; markers have no Calibration Bench equivalent, so this label just never served a purpose in the ordinary view).

**Kept unchanged**: "Drip tendency" row (a real, meaningful number a creator might want to see/report, not dev jargon — and this pass's own acceptance criteria ask for exactly these values), Size slider, Flow/Viscosity selects, Reset/Duplicate/Calibrate actions, the "Advanced — not required to draw" header note.

## 4–6. Re-verified, no changes needed

These were implemented correctly in V0.10.5 and are re-confirmed live in this pass per the acceptance checklist:
- **Hand Tracking placement**: no `#hand-input` button in the bottom bar; `...` menu shows `Hand Tracking [Off]` / `Record` / divider / `Settings`, anchored to the `...` button (screenshotted).
- **Zoom**: 7-value stepper, `200/150/125/•100/75/50/25` at the 100% default, hover reveal and direct-click-jump both intact, no slider/no button grid (screenshotted; boundary clamping at 25%/400% covered by existing `WallView.test.ts` cases, unchanged this pass).
- **Grid default**: cleared `localStorage`, reloaded — `#grid-style` read `"dotted"`. Switched to `"solid"`, reloaded — still `"solid"` (saved preference wins). Reset back to dotted afterward.

## 7. Do not touch — respected

No changes to Spray physics, Flair, Pink Dot, New York Fat, Pencil mapping, or Mop's renderer/architecture. The only rendering-adjacent change is that Round/Chisel strokes now also call the pre-existing, unmodified Spray drip pipeline (`DripAccumulator.observe`/`toolRenderer.startDrip`) — no new drip *mechanism* was written, and Spray's own behavior through that pipeline is byte-identical to before.

## Tests / Typecheck / Build

`npx vitest run`: 610/610 passing (1 new: `PaintMarkerEngine.test.ts` asserts Round/Chisel/Mop all have non-zero `dripTendency` with Mop strictly greatest). `npx tsc --noEmit`: clean. `npx vite build`: clean.

## Files Changed

- `src/PaintMarkerEngine.ts`: `round`/`chisel` `dripTendency` raised from `0` to `0.12`/`0.15`; explanatory comment.
- `src/PaintMarkerEngine.test.ts`: new test for the exposed-marker drip hierarchy.
- `src/main.ts`: `depositActivePoint()`'s drip-eligibility check widened to include dry (non-wet) paint-marker strokes, reusing the existing Spray drip pipeline unchanged.
- `src/BrushStudio.ts`: removed "Material" row from marker properties; removed " wall units" suffix from four readouts; reworded one note to drop "-unit" phrasing.
- `index.html`: provenance badge given `hidden` + a matching `[hidden]` CSS override so it no longer shows in the ordinary Brush Studio view.

## Commit

`4d8b4e4` — "fix: Spatial Spraypaint V0.10.6 -- restore Round/Chisel drip hierarchy, clean Brush Studio dev language"
