# Spatial Spraypaint V0.10.15 Current Status

Date: 2026-09-17

Status: **PARTIAL — real progress on both defects, several items still incomplete.** Per the request's own instruction: this is not reported as PASS just because a resolver exists. See the checklist at the end for exactly what is done and what is not.

Baseline: V0.10.14 commit `ed9435f`/`e306287` (BrushProfile introduced as a read-only adapter — this pass makes it the actual writable authority and fixes the double-dagger drip defect it did not address).

## 1. BrushProfile: from adapter to authority

**What was wrong in V0.10.14**: `resolveBrushProfile()` existed, but it only ever READ from the legacy structures (`SprayCapPreset`, `MarkerVariantDefinition`, `WetVariantProfile`) with no way to write back. There was no override mechanism generalized across families (Spray still had its own separate `SprayPropertyOverride`/`BrushProperties.ts` system), Brush Studio's marker panel showed the profile's fields as plain readonly text, and nothing a user could edit reached actual rendering for Round/Chisel/Mop.

**What changed**:
- `BrushProfile.ts` rewritten to the requested nested schema: `{ family, id, name, size, opacity, drip: { tendency, bodyWidth, taper, terminalBead, originPooling, sourceOpacityCeiling }, wet: {...} | null, footprint: {...} }`.
- Added `BrushProfileOverrideStore` — a `Record<"toolId:id", { opacity?, dripTendency?, dripBodyWidth?, dripTaper? }>` — the one writable truth. `resolveBrushProfile(toolId, id, overrides?)` merges it on top of each family's computed defaults for every shared field.
- `main.ts` holds `this.brushProfileOverrides` and passes it into every `resolveBrushProfile` call — the drip call site (unified since V0.10.13/14) and a NEW call in `currentToolStyle()` that resolves the effective `opacity` for the tool currently drawing.
- That `opacity` is threaded as `opacityOverride` through `DrawingToolRenderer.renderSegment` → for Spray, it overrides `coreOpacity` on the deposition object passed to `SprayBrushEngine`; for every Paint Marker variant, it's threaded into `PaintMarkerEngine.renderSegment` (new optional parameter) and applied via a new `hexToRgba` helper on `ctx.fillStyle`/`ctx.strokeStyle` (previously always the raw, fully-opaque hex color).
- `BrushStudio.ts`: one new method, `renderSharedBrushProperties(toolId, id, profile, onEdited)`, builds real `<input type="range">` controls for Opacity and Drip tendency, called identically from Spray's panel and the marker panel (Round/Chisel/Mop all go through `renderMarkerProperties`, which itself is one function, not three). No `renderRoundSettings`/`renderChiselSettings`/`renderMopSettings`/`renderSpraySettings`.
- `BrushPreview.ts`: the picker-card renderers (`renderSprayCapPreviewToContext`, `renderMarkerPreviewToContext`) now read `size`/`opacity` from `resolveBrushProfile` instead of the raw preset/variant object.

**Live-verified** (see §4 for the full evidence list): opening Brush Studio for New York Fat (Spray), Round, Chisel, and Mop in turn shows the identical "Tip" section — Opacity slider, Drip tendency slider, then readonly Drip body width/Taper amount/Terminal bead/Origin pooling rows — with Mop additionally showing a "Paint" section (Squeeze response + Flow/Viscosity) that the other three correctly omit. Dragging Round's Opacity slider from 95% to 15% visibly dims its live preview stroke to a faint gray; the same was confirmed for Spray (New York Fat, 29%→10%).

## 2. Pool Ownership Rule — the double-dagger defect

**Root cause, precisely**: V0.10.13's baseline-drip-visibility retuning raised `poolDepositRate` (0.85→2.6) and lowered `poolThreshold` (0.62→0.5) so a normal stroke could cross threshold at all — but `poolMaxChannelsPerNode` stayed at 2, and the refractory gate (cooldown + renewed-load bar) that was meant to make a second channel from the same node "occasional" was, at the new deposit rate, cleared routinely by an ordinary sustained or squeezed dwell on a single dot. That produced exactly the reported defect: one reservoir, two independent narrow channels forking from it.

**Fix**: `poolMaxChannelsPerNode: 1` for both `mop` and `drip-mop` — a structural cap, not a probability. `channelsSpawned >= poolMaxChannelsPerNode` blocks a second spawn from that node unconditionally for its lifetime. A genuinely distinct reservoir (a separate pool node, formed when the pointer moves far enough that the old node falls outside merge distance) still gets its own channel — that is a different node, not a second channel from one.

Since Squeeze's old "make the second channel arrive sooner" effect is now structurally impossible, its visible effect had to move somewhere: `spawnPoolChannel`'s `loadFactor` clamp was raised from `1.0` to `2.2`, so a heavier/squeezed deposit produces a materially wider and longer SINGLE channel instead of a second one (verified: baseline width 22.3px/length 81.6px vs. squeezed 25.2px/83.4px on an identical stationary dwell, both capped at exactly 1 drip).

**Drip geometry** (Mop, `WetVariantProfile`): `tipWidthRatio` 0.22 → 0.4 (gentler root-to-tip taper contrast — the tip is now 40%, not 22%, of the body width), `stemWidthBaseRatio` 0.12 → 0.16 and `stemWidthLoadRatio` 0.09 → 0.1 (thicker sustained body). `terminalBulbRatio` 0.48/0.58 → 1.2/1.3 for mop/drip-mop — this is the actual bug behind "sometimes loses the terminal bead": the bead's radius formula is `tip.width * terminalBulbRatio * 0.5`, so a ratio under 1.0 makes the bead's diameter SMALLER than the tip it's attached to (invisible in practice); a ratio above 1.0 is required for the bead to read as wider than the terminal body, per spec.

## 3. Preview centralization

Picker cards for both Spray caps and Marker variants already rendered real filled deposits through the actual engines before this pass (verified live in V0.10.14 and re-confirmed here) — this was not the "outline" defect the request describes, and remains true. What V0.10.14 left incomplete was explicitly closed this pass: those same picker renderers now resolve their `size`/`opacity` from `resolveBrushProfile` (§1) instead of the raw preset/variant, so an opacity edit is reflected in the picker too, not just Brush Studio's own preview. The marker Brush Studio size-selector row (`renderMarkerSizeSample`) was already migrated onto `BrushProfile.footprint` in V0.10.14 and is unchanged this pass.

## 4. Live visual evidence

All captured against the running app (`localhost:5195`), fresh dev-server restart, no stale-bundle artifacts (confirmed by re-checking console after restart).

**A. Brush Studio — same controls across all four families**: screenshotted in sequence — Spray/New York Fat, Round, Chisel, Mop — each showing the identical "Tip" group (Opacity slider, Drip tendency slider, then readonly Drip body width/Taper amount/Terminal bead/Origin pooling), with Mop alone additionally showing "Paint" (Squeeze response, Flow, Viscosity).

**B. Editing reaches rendering**: New York Fat's Opacity dragged 29%→10% — live preview visibly grayed out. Round's Opacity dragged 95%→15% — live preview visibly grayed out. Same control (`<input type="range">`, same event handler, same override store) for both.

**C. Picker**: both the Spray cap list and the Marker list show real filled strokes rendered through the actual engines (confirmed again this pass, unchanged from V0.10.14).

**D. Stationary-dot drips, at 72px brush size for legibility** (screenshots captured, not substituted by unit tests):
1. **Round** (drip tendency boosted to 0.95 via the live slider for a tractable test window): one clean vertical channel, gentle taper, visible rounded terminal bead. No branching.
2. **Chisel** (same boost): one clean vertical channel from the chisel-shaped root, gentle taper, visible bead. No branching.
3. **Mop** (default tendency 0.68, default tuning): one dominant channel from a round pooled root, continuous neck-to-body transition, gentle taper, a CLEARLY visible rounded terminal bead wider than the tail immediately above it. No branching — this is the exact "double dagger" scenario from the report's screenshot, now producing the single-channel result the spec describes.
4. **Spray** (Pink Dot Fat, stationary dwell): one vertical drip descending from the wet core, visibly less saturated than the dense core patch (source-opacity-limited), no diagonal lean, no branching.
5. **Moving wet stroke** (Mop, canonical tag, no Squeeze): multiple independently-pooled drips across the mark, each a single dominant channel, no chopstick clusters anywhere along the stroke.

## 5. Test additions

- `BrushProfile.test.ts`: rewritten for the nested schema; new `describe("BrushProfileOverrideStore")` block covering — an opacity edit changes only the targeted brush across all four families; an edited brush's `sourceOpacityCeiling` tracks the live opacity edit (not just the default); a drip-tendency edit is isolated per brush and clamped to [0, 1].
- `WetPaintModel.test.ts`: new `describe("V0.10.15 Pool Ownership Rule")` block — a single stationary dot never exceeds 1 channel; a 4-second dwell on the same dot still doesn't; heavy dwell WITH Squeeze on the same dot still doesn't; 9 seconds of continuous dwell (far beyond the old renewed-load bar) still doesn't; a slow horizontal stroke and a curved continuous stroke both keep every reservoir-sized neighborhood to at most 1-2 drips (no root cluster) while still allowing genuinely distinct reservoirs their own channels; the terminal bead ratio is confirmed `> 1` (reads wider than the tip) and `< 2` (not a giant primitive); drip opacity never exceeds the source's own ceiling.
- `DrawingToolRenderer.test.ts`: new test proving `opacityOverride` reaches the real `ctx.fillStyle`/`strokeStyle` for both Spray (alpha channel drops measurably) and Paint Marker (fillStyle changes from an opaque hex string to a lower-alpha `rgba(...)`).
- Existing `WetPaintModel.test.ts` tests that asserted the OLD 2-channel-per-node behavior (a "replays deterministically" test that relied on one stationary point producing ≥2 drips, and the Squeeze test that asserted a higher DRIP COUNT under Squeeze) were rewritten to match the corrected single-channel invariant — the first now uses genuinely distinct reservoirs (multiple spots) for its variety assertions, the second asserts count stays at exactly 1 for both baseline and Squeeze while width/length increase under Squeeze.

`npx vitest run`: 641/641 passing (was 633 at V0.10.14; +8 net new tests, 2 rewritten). `npx tsc --noEmit`: clean. `npx vite build`: clean (56 modules, 384.84 kB / 95.05 kB gzip).

## 6. Scope

Files touched, all within `prototypes/spatial-spraypaint/src/`: `BrushProfile.ts`, `BrushProfile.test.ts`, `BrushStudio.ts`, `BrushPreview.ts`, `WetPaintModel.ts`, `WetPaintModel.test.ts`, `DrawingToolRenderer.ts`, `DrawingToolRenderer.test.ts`, `PaintMarkerEngine.ts`, `main.ts`. Nothing under Pencil, Flair, Color, Zoom, Wall substrate, Subway, or MUSIC was touched. Commit staged these 10 files explicitly (`git add` with each path named), never `git add -A`.

## 7. PASS checklist — honest status

- [x] BrushProfile is the canonical authority for the shared properties it defines (opacity, drip.tendency) — live-editable, reaches real rendering for all four families.
- [x] One shared settings-panel implementation (`renderSharedBrushProperties`) — no per-family duplicated render functions.
- [x] Round uses it.
- [x] Chisel uses it.
- [x] Mop uses it.
- [x] Spray uses it.
- [x] Shared controls (Opacity, Drip tendency) actually edit runtime behavior — live-verified, not just unit-tested.
- [x] Picker footprints/previews derive from `resolveBrushProfile` (size, opacity) — though the picker still renders a real moving-stroke deposit through the engine rather than switching to `BrushProfile.footprint`'s static stamp descriptor (a deliberate choice: the moving deposit is a richer, MORE real preview than a static shape would be, and both a static-footprint code path and its live-rendering counterpart already exist and are tested — see `renderFootprintSample`/`renderMarkerSizeSample`).
- [x] Stationary dots no longer produce double daggers — structurally fixed (`poolMaxChannelsPerNode: 1`), live-verified for all four brush families.
- [x] Drip body no longer resembles an icicle — gentler taper (tipWidthRatio 0.4) and thicker sustained body (stemWidthBaseRatio 0.16) for Mop; Spray/Round/Chisel's shared taper formula was already corrected in V0.10.13 and is unchanged.
- [x] Terminal bead visibly restored — Mop's `terminalBulbRatio` was structurally sub-1.0 (invisible by construction); now >1.0 (reads wider than the terminal body) for both mop and drip-mop, live-verified.
- [x] Source-opacity ceiling preserved — `drip.sourceOpacityCeiling` is now a first-class, tested field on every profile, tracking live opacity edits, not just static defaults.
- [x] Live visual evidence supplied — §4 above, captured this session, not substituted by unit tests.
- [x] Tests/typecheck/build clean — 641/641, tsc clean, build clean.

**Still incomplete / explicitly NOT claimed as done**:
- `BrushProfile`'s writable authority covers **Opacity and Drip tendency only**. Drip body width, taper, terminal bead, and origin pooling remain **readonly** in Brush Studio this pass — displayed from the same canonical profile, but not yet independently editable controls. The request's "repeat for applicable drip properties" is only partially satisfied.
- Spray's **legacy `SprayPropertyOverride`/`BrushProperties.ts` system** (Size, Coverage, Fill mode, Spray Angle) was **not migrated into `BrushProfileOverrideStore`**. It still exists as a second, parallel writable structure for those specific fields — this is exactly the "two writable truths" pattern the request says must not remain, for everything except Opacity/Drip tendency (which now route exclusively through the new store). This is the largest remaining architectural gap.
- Mop's own pool-reservoir tuning (`WetVariantProfile`'s remaining fields beyond what's surfaced) is still Mop's own separate data structure, read by `BrushProfile` but not owned by it — consistent with the "don't touch Mop's calibrated tuning" instruction from prior passes, but it does mean `BrushProfile` is an authority for the fields it exposes, not a full replacement data model for every underlying system.
- The Chisel Brush Studio screenshot in this pass's evidence used a boosted drip tendency (0.95, via the live slider) to make the stationary-dot test tractable within the session's time budget — this is disclosed, not hidden, and demonstrates the exact same code path a lower, default tendency would use, just faster to trigger.

## Commit

`67fda65` — "feat: Spatial Spraypaint V0.10.15 -- BrushProfile becomes canonical authority + Pool Ownership Rule (double-dagger fix)"
