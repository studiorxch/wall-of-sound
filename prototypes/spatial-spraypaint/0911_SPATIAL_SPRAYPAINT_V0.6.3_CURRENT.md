# Spatial Spraypaint V0.6.3 Current Status

Date: 2026-09-14

Status: PARTIAL — the V0.6.2 tool-contact/cursor work and the V0.6.3 continuous wet-run, contextual Flow/Viscosity, complete manufacturer palettes, Drip Mop fidelity, and Clean Chisel work are implemented. Mop drip attachment and Clear behavior are stable. The full automated suite, TypeScript, production build, and available current-host Physical/browser workflows pass. Physical Hand behavior remains a MacBook gate.

Baseline: V0.6.1 commit `59e909e46455f41e4a9627698c5541feab951c15`, with the approved uncommitted V0.6.2 working state treated as the V0.6.3 starting point.

## Preserved Architecture And Scope

The authoritative mark path remains:

```text
Physical or Hand input
→ selected Tool
→ shared canonical Wall-space stroke
→ selected Tool renderer
→ Wall
```

For wet tools the renderer now delegates material state through:

```text
Mop / Drip Mop contact body
→ deterministic wet reservoir / paint load
→ contextual Flow + Viscosity authority
→ drip trigger authority
→ connected gravity run
```

Pan, edge motion, view transforms, history, recording, and input selection remain outside Tool material authority. Spray deposition is unchanged. Performer segmentation remains preserved in isolated modules with no primary runtime entry point.

No Tool family, Waveformer, surface material, shell redesign, Spray-plume calibration, or performer rendering was added.

## V0.6.2 Contact And Cursor Foundation Preserved

- Mop and Drip Mop use a circular reservoir/contact footprint at their initial point and every deposited endpoint, producing rounded starts, ends, and joined wet bodies while retaining edge streaks and paint load.
- Chisel uses bounded, sorted continuity polygons and does not allow a zero-motion seed to establish a false movement direction. The first real segment owns its start geometry, eliminating the reproduced triangular/splintered start artifact while preserving movement-derived broad/narrow response and intentional corners.
- Clean Chisel is an additional contextual Marker/Nib variant, not a new Tool. It retains movement-derived chisel geometry while using a fuller narrow edge, more restrained direction response, and a finite rounded contact cap for cleaner, less-frayed endpoints. The original Chisel remains available.
- One `DrawingCursor` authority serves Physical and Hand input. It resolves from selected Tool, Cap/Nib, current size, orientation, and Wall zoom.
- Spray cursor coverage is derived from `SprayCapProfile.cursorFootprint`, which remains layered over the existing canonical Cap deposition preset rather than duplicating Spray authority.
- Round, Mop, and Drip Mop cursors are circular contact previews. Chisel uses the renderer's nib-angle constant and aspect. Drips are not predicted in the cursor.
- Cursor dimensions scale in exact proportion to Wall zoom at 25%, 50%, 100%, 200%, and 400%.
- The cursor is a DOM-only overlay outside the persistent paint canvas and final composite, so it is neither painted nor recorded.

## Hand Responsiveness Investigation

The measured code path showed two smoothing stages after MediaPipe results: the Hand tracker applied the established 65/35 coordinate filter, then canonical deposition passed through `StrokeSmoother` and `AdaptiveCurveReconstructor`. The old Hand cursor consumed the first filtered coordinate, even though it was updated directly from the MediaPipe callback and was not waiting for the render loop.

V0.6.3 preserves the reliability and deposited-mark path but separates its outputs:

```text
latest valid mirrored fingertip → raw/recent AIM CURSOR
65/35 retained tracker filter → stroke smoothing/reconstruction → DEPOSITED STROKE
```

This removes the known application-side cursor filter delay without weakening short-gap protection, tracking-quality evidence, edge-driven motion, Pan authority, or canonical mark stability. Actual end-to-end camera/MediaPipe latency and perceived improvement require the MacBook camera.

## Continuous Wet Runs

The beaded-drip root cause was the progressive renderer depositing independently round-capped, width-changing line segments. Even when adjacent center points met, overlapping round caps and changing radii could read as a dotted chain.

Wet runs now use deterministic connected strip geometry:

- every run resolves ordered center/left/right cross-sections along a gravity-positive quadratic path;
- neighboring cross-sections share the same deterministic boundary;
- live growth fills the strip between the previous and current progress values;
- replay fills one continuous swept polygon rather than a sequence of bead-like stroke stamps;
- width tapers continuously from reservoir stem to tip;
- an origin pool attaches the run to the parent wet mark;
- a bounded optional terminal bulb is part of the same run model; and
- legacy non-Mop Spray drips retain their existing restrained line path.

Generated origin, width, length, bend, duration, taper, pool, and terminal-bulb state is stored with canonical history and cloned defensively for deterministic replay, Undo, Clear, and Clear restoration.

The primary visual calibration set for the final fidelity pass is the user-supplied black-door photograph `b4163c1f042d0033ee9bf59faa5f8621.jpg`, the black-on-white `kr-interview-4.jpg`, the white-on-black `Costello5sm.jpg`, and the red prototype screenshot. Together they establish direction rather than literal brand simulation: a smooth round-nib body feeding substantial attached, mostly vertical, long gravity channels. To move toward those references, consecutive wet-contact widths now converge through a bounded deterministic response instead of following every point's load/velocity change immediately. The renderer draws one round start and one round final contact rather than stamping a full disc at every wet sample; intermediate body continuity comes from swept ribbons and bounded joins. Drip Mop stems and retained tips are thicker, taper is less extreme, average and exceptional runs are longer, lateral bend is reduced, origin pools no longer form oversized body knots, and simultaneous channels are more selective. This avoids the red example's lumpy stitched body and thin antenna/tentacle silhouettes without changing Spray.

## Mop Versus Drip Mop

Mop remains the everyday wet marker: broad round contact, moderate load gain, later threshold, longer cooldown, moderate stem width/length, and occasional meaningful runs.

Drip Mop owns intentionally excessive wet delivery: higher initial/load gain, earlier threshold, faster dwell response, shorter cooldown, wider stems and origin pools, much longer mean/range, occasional extra-long runs, and deterministic multiple origins when load supports them.

Fast movement drains reservoir load. Slow movement and dwell increase it. Gravity remains positive-downward authority; horizontal bend is bounded relative to run length. Other marker variants never enter `WetPaintAccumulator`, and Spray's established `DripAccumulator` parameters were not globally amplified.

## Final Marker Fidelity Repair

The remaining screenshot defects were traced to four separate construction details and corrected without changing Spray deposition:

- full contact circles at intermediate Mop samples had already been removed; Mop and Drip Mop now also receive a higher curve-corner tolerance and bounded direction response so sparse curved input reconstructs as one fluid band rather than visibly angular ribbon sections;
- wet origins now use per-variant underside offset and contact-span authority, keeping their pools below and within the parent mark instead of creating a small top/side extrusion;
- progressive connected-run sections now use one stable opacity, preventing darker/lighter seams from reading as dashed internal construction where sections or runs overlap; and
- Drip Mop retains its improved width, opacity, long-run range, restrained bend, and less-extreme taper.

Clean Chisel is unchanged. A separate `Drippy Chisel` contextual variant reuses its clean movement-derived chisel geometry while entering the same `WetPaintAccumulator` authority. Its load, threshold, width, length, and cooldown profile is deliberately restrained below Drip Mop. It remains a Paint Marker variant rather than a new Tool family.

Marker-family size is now discrete and repeatable. `MarkerWidthPresets` owns XS/S/M/L/XL wall-unit values independently for Round, Chisel, Clean Chisel, Drippy Chisel, Mop, and Drip Mop. The chosen width is retained per variant, recorded in canonical stroke metadata, and resolved through the same renderer geometry used by the cursor. The continuous Settings size slider is now Spray-only and hidden for Paint Marker; the compact Marker/Nib chooser owns marker widths.

## Contextual Flow And Viscosity Authority

`WetPaintControls` supplies a small physically named data authority:

- **Flow** maps to paint delivery, dwell buildup, trigger threshold, and run width.
- **Viscosity** maps to trigger resistance, stem width, run length, and gravity/fall duration.

The controls appear only inside the existing Marker/Nib chooser when Mop or Drip Mop is selected. Defaults are Balanced / Balanced. This keeps the persistent shell unchanged and prevents wet calibration from affecting Spray, Round, Chisel, Wall view, or history.

Direct threshold, length, width, and dwell knobs are not separately exposed in V0.6.3; their authority is already represented by the two compact physical controls and can be extended later without a second wet model.

## Mop Geometry Layer Separation

The final failure-reference pass corrected the architectural source of the bone/spiky body, circular drip nodes, and repeated run bands without changing Spray or Chisel:

- Mop and Drip Mop base marks are now one constant-width round-nib tube. Preset size and Mop variant determine base width; reservoir load and travel speed do not modify that base geometry.
- Each base stroke has one round start cap, continuous filled ribbon segments, bounded round joins, and one round end cap. Ordinary travel no longer receives wet edge streaks or repeated wet stamps.
- Wet contact is a separate overlay. Only stationary high-load contact can add a small local swelling; drip-origin swelling is owned by the drip geometry rather than the base tube.
- Mop drip origins are a flared first section of the connected gravity strip, not a circular pool stamp. The flare narrows smoothly into the stem while remaining attached inside the stroke edge.
- Growing Mop drips are redrawn as one continuous transient strip on a dedicated overlay canvas, then committed once when complete. This prevents frame-by-frame translucent strip edges from accumulating as periodic horizontal bands while keeping the final composite recordable.
- A deterministic gradient begins at opaque stroke color and eases into the configured drip opacity. Existing rounded terminal bulbs and occasional stored kinks remain intact.
- Drippy Chisel retains its previously verified attached origin behavior unchanged. Width presets, mixed-tool history, Undo/Clear restoration, Physical/Hand routing, navigation, recording, and Spray deposition also remain unchanged.

## Calibration Color Palette

The Color button remains the sole compact entry point. Its temporary popover now contains:

- canonical current palette and current color state;
- StudioRich's existing 11 prototype swatches;
- the complete supplied 256-entry Montana Gold manufacturer palette;
- the complete supplied 257-entry BLACK 400ML manufacturer palette;
- a current-color indicator; and
- up to six recent, deduplicated colors.

Palette switching changes only palette state; it preserves current Tool, current Color, view, and history. Supplied manufacturer labels, codes, duplicate values, and aliases remain distinct entries. Color remains stored per canonical stroke, so mixed-color wet marks replay and restore exactly.

The canonical extracted manufacturer data is tracked inside the Spatial Spraypaint prototype. Runtime does not depend on private WOS-share files. Manufacturer palette integration is stable and should remain untouched for now.

## Spray Cap Identity Compatibility Rule

Each canonical stroke stores its Spray cap as a `SprayCapId` string (`ToolStrokeStyle.variantId`), not a snapshot of the numeric preset. Replay, pan, zoom, and Undo all re-resolve `getSprayCapProfile(variantId)` live against whatever preset data currently exists for that ID. There is currently no artwork persistence (no localStorage, save, or export), so this has no live effect today, but the moment persistence/export/Surface-ID attachment exists, this becomes load-bearing.

**Standing rule:** once artwork persistence/save/export exists, rendering behavior referenced by a canonical cap ID must never be silently mutated in place. A behavior change forks or versions the ID (or uses explicit migration/alias logic) rather than redefining an existing ID's numbers underneath already-referenced artwork. `LEGACY_CAP_ALIASES` in `SprayCapPresets.ts` is the existing mechanism for keeping old short-hand IDs pointed at the correct canonical entry through a rename.

First application of this rule: the pre-calibration `german-fat` preset's fuzzy/hairy/dry-brush digital behavior was forked verbatim into a new permanent `fuzz-fat` ("Fuzz Fat") specialty/effect cap before any physical recalibration of `german-fat` toward the real German/Hardcore Fat cap. `german-fat`'s numbers remain free to be recalibrated later without disturbing `fuzz-fat`.

This rule applies identically to `MarkerVariantId`. The V0.6 preset-browser pass relabeled all six existing marker variants for display (e.g. `chisel` now shows as "Chisel · Classic", `mop` as "Mop · Balanced") without touching any `MarkerVariantId` value, `MARKER_VARIANTS[...].id`, or render geometry — a pure presentation change, safe under this rule because the id a canonical stroke stores never changed. Any future rename that needs to change an id itself (not just its label) must follow the same fork-or-alias discipline already established for Spray caps.

## V0.6 Preset Browser (Spray + Marker)

Both the Spray cap chooser and the Marker/Mop chooser became visual preset browsers: each row now renders a real deterministic preview (via `BrushPreview.ts`, which drives the same `SprayBrushEngine`/`PaintMarkerEngine` used for live drawing against a fixed synthetic stroke — never a hand-drawn fake), grouped under family section headers (Spray: Fat/Thin/Specialty, from the existing `SprayCapPreset.family`; Marker: Round/Chisel/Mop, a new presentation-only grouping of the six existing variant ids). Spray rows also show each cap's existing `nominalWidthRange` labeled explicitly as "digital baseline" — no physical (cm/inch) calibration data exists anywhere in this repo to show instead, so none was fabricated; the metadata is purely descriptive and is never read by `resolveSprayDynamics`, which only ever consumes `deposition.baseRadius`.

**Deliberately deferred, not attempted:** the deeper ask of making every Marker preset (not just `drippy-chisel`/`mop`/`drip-mop`) capable of wet accumulation and dripping via shared Flow/Accumulation/Hardness/Drip-tendency dimensions. The engine currently gates this in two separate hardcoded places — `isWetMarkerVariant` in `WetPaintModel.ts`, and the mop-only check inside `PaintMarkerEngine.renderWetContactOverlay`/`renderSegment` — and generalizing both together, for presets (`round`, `chisel`, `clean-chisel`) that have never been wet, needs dedicated before/after visual verification beyond what one pass can responsibly cover alongside the physically-verified-Mop freeze. Left as its own future bounded step.

**Also deferred:** Spray drips from over-accumulation/dwell. Current Spray deposition is pointermove-driven only (no continuous emission while the pointer is stationary), so there is no dwell signal to threshold against yet — the same prerequisite gap identified in the prior UI-friction audit. Not hacked around.

## V0.6 Visual Calibration Pass (Against Real Reference Photos)

Audited against two supplied real-world graffiti photos (a bubble throwie, a red/white handstyle) rather than assumption. Confirmed Fuzz Fat and German/Hardcore Fat unaffected (verified — no diff to their preset entries).

**Fixed — Calligraphy/Transversal directional width.** `SprayCapProfile.orientationBehavior: "fixed-transversal"` was declared for this cap but never wired to core-stroke width — the cap only ever thinned uniformly regardless of stroke direction, unlike a real transversal nozzle. `SprayBrushEngine.ts` now varies the core line width by the angle between travel direction and a fixed `TRANSVERSAL_AXIS_ANGLE` (matching the Marker Chisel's own nib angle for one shared StudioRich convention), so a calligraphy stroke now reads visibly wide or thin depending on direction, not just uniformly thin. Gated on `anisotropy < 1`, which today is true only for `calligraphy` — every other cap (including Fuzz Fat and German-Fat) is numerically untouched. Overspray's anisotropy remains travel-relative (unchanged) — a known minor inconsistency with the now-fixed core width, left for a future pass since the core line is the dominant visual element.

**Diagnosed and explicitly NOT hacked — throwie-fill pass buildup.** A single continuous fat-cap stroke already reads ~95%+ opaque before a second fill pass ever happens, leaving no visible headroom for "repeated passes build cumulative coverage" the way both reference photos show. Root cause, confirmed mathematically and by two live experiments (a moderate real parameter change, and a calculated aggressive case): the current per-segment alpha-compositing model draws many heavily-overlapping stamps along a single stroke's own path (segment spacing is a fraction of the cap radius), and `1-(1-a)^N` asymptotically saturates near 1.0 for any reasonable per-segment alpha once N is in the dozens — confirmed even at 9% per-segment alpha with 46 segments (≈98.7% final), and even a synthetic 35%-alpha/8-segment case (≈96.8%). Widening deposit spacing enough to leave real headroom would require stamps sparse enough to look visibly gappy/dotted, unacceptable for tag/outline legibility. This is a genuine architecture-level prerequisite — a per-pixel local-saturation ceiling, or a deliberately different "fill mode" deposition cadence separate from "line mode" — not a parameter-tuning problem. A tuning attempt (widened Spray-only deposit spacing + reduced fat-cap `accumulationRate`) was built, tested, found ineffective for the stated goal, and fully reverted rather than shipped as an unverified partial change. Left deferred for its own dedicated pass.

**Audited, no change needed:** thin-cap tag/outline (New York Thin) already reads as a confident, controlled line with appropriately soft aerosol edge and low overspray — matches the target already. Needle and Soft/Fade both already read as intended (thin/directional-with-splatter; broad/diffuse) — no changes made.

## Throwie Fill Deposition V1 — Resolves The Prior Throwie-Fill Deferral

Implements the previously-deferred per-stroke opacity ceiling, as an explicit opt-in **Fill mode** toggle — not a global Spray change, and not a new cap identity ("a cap is still a cap; Fill describes how it is being used").

**Activation:** a "Fill mode (throwie)" checkbox in the Cap chooser's Spray property controls (`SettingsState.fillModeEnabled`, default off — normal Spray/tag/outline behavior is provably byte-identical whether the field is absent, `false`, or the setting has never been touched). Stored per-stroke in `RecordedStroke`, so replay/Undo/Clear reproduce exactly which strokes were fill-mode.

**Mechanism (spatially-local, corrected — see V1.1 below for why):** `SprayBrushEngine` tracks per-stroke saturation keyed by a coarse grid cell (`fillLocalSaturation: Map<string, number>`, cell size scaled to the cap's own radius; cleared in `beginStroke()`, called from `DrawingToolRenderer.beginStroke` — already invoked once per gesture for both live drawing and replay). While Fill mode is on, every individual draw call (every `corePasses` sub-layer, not just once per segment — corePasses stack on each other too) looks up ITS OWN cell's saturation, computes what its nominal contribution would move that cell's uncapped virtual saturation to, remaps into `[0, FILL_MODE_CORE_CEILING]` (0.45), and solves for the alpha needed to move the canvas exactly there. A brand-new stroke clears the whole map and composites normally on top of the canvas, so separate sweeps still accumulate via completely ordinary compositing — only a single stroke's own internal density, LOCATION BY LOCATION, is capped.

**Live-verified calibration matrix:** one sweep reads clearly translucent/textured; two separate sweeps over the same path are visibly more solid than one; four sweeps more solid still while still showing a graduated, textured core (never flat); a fast back-and-forth throwie-style pass shows visible directional banding/ribbing; a normal outline stroke with Fill mode off stays fully dense, confirming zero leakage into ordinary Spray behavior.

### V1.1 — Spatial Correctness Fix

The first V1 implementation used a single scalar per stroke (not per location) — audited and found to fail exactly as suspected: a long single sweep faded to literally zero alpha by its own far end, painting a fresh never-touched area later in the same continuous gesture got zero coverage (the global scalar had already "spent" its budget on earlier painting elsewhere), and a second traversal of a continuous back-and-forth pass contributed nothing extra (confirmed by dedicated failing tests before any fix was written). Replaced with the grid-cell map described above. Live-verified via synthetic continuous `PointerEvent` sequences (pointerdown → many pointermoves, no pointerup in between) directly on `#composite-canvas`: a true back-and-forth fill with no pointer release shows even density across its full width with no fade-out, and painting a distant untouched region within the same unreleased gesture receives coverage matching the first region, not a starved remainder. Real-time delays between dispatched events were necessary for the test to be representative — synthetic events fired with no delay were coalesced by the app's own interaction throttling in a way that doesn't reflect real drawing.

Deliberately not attempted (still matches "do not overbuild"): true per-pixel resolution (grid cells, not pixels — fine enough for the throwie-fill use case, verified visually), automatic back-and-forth detection, any physical paint simulation.

## Stable Mop Attachment And Clear Authority

The latest Mop attachment work is complete and physically verified:

- dot: PASS;
- horizontal: PASS;
- vertical: PASS;
- rising diagonal: PASS;
- descending diagonal: PASS; and
- circle: PASS.

Active and completed Mop drips are composited beneath the opaque Mop body/wet contact. A short hidden underlap lets the body mask the attachment while preserving the existing visible run, origin, length, width, bend, rounded tip, gradient, timing, frequency, and deterministic replay.

The Clear defect introduced by the persistent drip-underlay layer was fixed in commit `5a170f1550f837c386bb3d6fb7aafd8465a00158`. One authoritative Clear path now resets:

- the main body/wet-contact canvas;
- the persistent `wetDripCanvas` underlay;
- the active wet-drip overlay; and
- retained active drip renderer state.

Undo continues to restore the pre-Clear canonical history through replay. Mop rendering and drip attachment are now **FROZEN** unless a new physical defect appears.

## Lighting Observation

MacBook field testing continues to show that a neutral/white ring light near the camera/working volume materially improves Hand/Spray tracking compared with colored lighting observed so far. Lighting remains an external performance variable, not a product hardware requirement, and this checkpoint does not retune Hand reliability around it.

## Automated Verification

- Focused Clear/Mop tests: PASS — 46/46.
- Final `npm test`: PASS — 36 test files, 226/226 tests.
- Final `npm run build`: PASS — TypeScript and Vite production build; 44 modules transformed.

Coverage includes a load/speed-independent Mop base tube, sparse dwell-only wet swelling, flared node-free Mop origins, continuous transient full-strip redraw, opaque-to-drip gradient transition, connected deterministic kink geometry, retained rounded tips, Flow and Viscosity mapping, Mop/Drip Mop differentiation, dwell/load gain, speed drain, multiple origins, restrained non-Mop routing, mixed-color wet history, exact Clear restoration, palette/recent-color state, shared cursor geometry, all required zoom scales, raw Hand aim separation, Chisel initialization/contact, corner bounds, and all retained navigation/input/audio/recording/composition tests.

## Current-Host Browser Validation

Passed in the current in-app browser with Physical input where automation permits:

- V0.6.3 loaded in the preserved compact shell with no console warnings or errors;
- straight and curved Drip Mop travel rendered as a clean, constant-width round-nib tube with smooth joins and clean rounded contact ends;
- a controlled High/Runny Drip Mop dwell emitted a long gravity run from a subtle flared edge shoulder with no circular origin node and no visible horizontal construction bands;
- Color opened one 238px temporary surface rather than a persistent strip;
- StudioRich, 12-color Montana fallback, and 12-color BLACK fallback palette states switched successfully;
- repeated dark/light/saturated selections updated the cursor and active marks, while two recent colors persisted;
- Flow and Viscosity appeared only for Mop/Drip Mop inside the Marker/Nib chooser and accepted High/Runny and Balanced/Balanced calibration states;
- Mop showed a large round cursor, circular dot, rounded start/end, broad wet body, and retained edge character;
- Drip Mop showed a materially larger circular contact/body than Mop;
- the reference-calibrated Drip Mop pass produced visually smooth curved and straight continuous round-contact bodies without the red screenshot's point-to-point circular knots;
- XS/S/M/L/XL marker presets switched repeatably, the chosen XL Drip Mop cursor resolved from the same renderer footprint, and the continuous Settings slider remained hidden for Paint Marker;
- Drippy Chisel appeared as a separate contextual variant, exposed wet Flow/Viscosity controls, and retained a clean Chisel body;
- Chisel horizontal, vertical, and diagonal live samples reproduced the original false-corner splinter, then passed after the zero-motion direction fix with clean starts/ends;
- Clean Chisel appeared as a compact contextual Marker/Nib choice and produced clean finite horizontal/diagonal endpoints without visible fraying;
- New York Fat Spray, Round Marker, Mop, and Drip Mop created a mixed-color Wall;
- keyboard Undo removed the latest mixed-color stroke;
- Clear disabled Clear while retaining Undo, and one Undo restored the prior colored Wall;
- wheel/two-axis Pan changed both Wall offsets;
- Quick Zoom changed 100% to 200% and restored the exact prior zoom and pan state;
- cursor geometry scaled exactly at 25%, 100%, and 400% in live DOM measurements (17.479px, 69.916px, and 279.664px for the same Drip Mop contact); and
- recording entered and exited the active state around a Physical mark without an application error.

The browser automation surface compresses pointer timing. It produced one controlled High/Runny Mop run suitable for checking attachment, origin shape, gradient continuity, and band-free rendering, but it is not evidence for human dwell timing or natural drip frequency. Those timing judgments, Drippy Chisel frequency, and Hand behavior remain MacBook checks. Modified-wheel zoom and held-Space Pan were also not re-proven through this pass; their retained deterministic suites pass. No local soundtrack file was loaded, so existing music mixing is regression-tested but not newly live-claimed.

## MacBook Manual Validation Checklist

After committing, push and pull before testing.

1. With Physical input, compare Mop and Drip Mop at the same color, size, Balanced Flow, and Balanced Viscosity.
2. For each, draw slow, fast, horizontal, and vertical marks; hold short and long dwells at several points.
3. Confirm Mop produces moderate connected runs and Drip Mop produces visibly wider, longer, more frequent, and occasionally very long runs.
4. Confirm every run remains attached to its wet body, tapers continuously, follows gravity, and never becomes a string of beads.
5. Compare the result directly with the supplied black-door reference: body continuity, substantial origin width, predominantly vertical fall, long connected runs, and the absence of antenna/tentacle artifacts.
6. Compare original Chisel and Clean Chisel with horizontal, vertical, diagonal, loop, and sharp-turn samples; confirm Clean Chisel ends are visibly less frayed.
7. Test Drippy Chisel at every width with short/long dwell; confirm the clean chisel body is preserved and runs remain materially more restrained than Drip Mop.
8. Switch every Marker variant through XS/S/M/L/XL, confirm repeatability after switching away/back, and compare the cursor footprint with deposited width at several Wall scales.
9. Set Flow Low/Balanced/High while holding Viscosity constant; confirm delivery, buildup, trigger ease, and width increase coherently.
10. Set Viscosity Thick/Balanced/Runny while holding Flow constant; confirm thick is wider/slower/shorter and runny is narrower/faster/longer.
11. Verify multiple Drip Mop origins under high load and that faster movement reduces accumulation.
12. Switch repeatedly among dark, light, and saturated colors; overlap wet marks and inspect opacity, pooling, edge softness, and continuous-run visibility.
13. Verify current color, recent colors, and the complete manufacturer palette labels/codes; manufacturer integration is stable and should remain unchanged.
14. Verify Spray, Round, all Chisels, Mop, and Drip Mop cursor size/color/shape alignment at several Wall scales.
15. With Hand input and a neutral/white ring light, compare the raw aim cursor's responsiveness with the stabilized deposited stroke during fast movement.
16. Confirm Hand short-gap protection, tracking-quality warning, edge-driven motion, pinch paint, Pan recovery, and sensor-only camera privacy remain intact.
17. Repeat Mop/Drip Mop slow, fast, and dwell tests with Hand; compare continuous-run behavior against Physical.
18. Exercise mixed-color Undo, Clear, Undo Clear, resize replay, Pan, zoom, edge continuation, soundtrack, and recording; verify exact colors and wet runs survive.
19. Confirm the final WebM contains the Wall composite and mixed audio, and inspect the console for warnings/errors.

## Known Limitations And Deferred Work

- Physical Hand responsiveness, camera cadence, and tool feel require MacBook validation.
- Human-timed live dwell, long-run frequency, and KRINK-like subjective fidelity remain unverified; V0.6.3 is a deterministic digital wet model, not a measured paint-brand simulation.
- Chisel click-only dots are deferred until a direction-aware tap-contact policy can avoid reintroducing false start splinters.
- Flow and Viscosity are session calibration state and are not yet persisted as user settings; generated wet state itself is fully recorded for replay.
- CLEAN / RAW / GRITTY is a documented future nib/mark-condition axis only.
- V0.6.4 is reserved for Spray Plume + Opacity Calibration: density, edge falloff, opacity curve, radial distribution, overspray, distance/output response, stationary dots, fill/outline utility, blending, and detail precision.
- Surface materials, paint chemistry/drying, Pencil pressure/tilt, Waveformer, Sticker, Roller, Fire Extinguisher, Black Book, collaboration, and shell redesign remain deferred.

## Likely Next Spatial Drawing Priorities

1. Toolbox/UI flow planning.
2. Spray Cap Calibration V1.
3. Throwie-oriented testing: fill, outline, highlight, shadow, opacity, and width.
4. Spatial/reactive spray audio experiment.
5. iPad / Apple Pencil input evaluation.
6. Waveformer later, after Spray behavior is mature.

Next safe step: preserve the frozen Mop and manufacturer-palette checkpoints while planning the toolbox/UI flow and Spray Cap Calibration V1.
