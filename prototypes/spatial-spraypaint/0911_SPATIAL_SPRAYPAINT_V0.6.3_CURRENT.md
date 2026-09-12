# Spatial Spraypaint V0.6.3 Current Status

Date: 2026-09-12

Status: PARTIAL — the V0.6.2 tool-contact/cursor work and the V0.6.3 continuous wet-run, contextual Flow/Viscosity, and calibration-palette work are implemented. The full automated suite, TypeScript, production build, and available current-host Physical/browser workflows pass. Human-timed wet-flow behavior and physical Hand behavior remain MacBook gates.

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

## Mop Versus Drip Mop

Mop remains the everyday wet marker: broad round contact, moderate load gain, later threshold, longer cooldown, moderate stem width/length, and occasional meaningful runs.

Drip Mop owns intentionally excessive wet delivery: higher initial/load gain, earlier threshold, faster dwell response, shorter cooldown, wider stems and origin pools, much longer mean/range, occasional extra-long runs, and deterministic multiple origins when load supports them.

Fast movement drains reservoir load. Slow movement and dwell increase it. Gravity remains positive-downward authority; horizontal bend is bounded relative to run length. Other marker variants never enter `WetPaintAccumulator`, and Spray's established `DripAccumulator` parameters were not globally amplified.

## Contextual Flow And Viscosity Authority

`WetPaintControls` supplies a small physically named data authority:

- **Flow** maps to paint delivery, dwell buildup, trigger threshold, and run width.
- **Viscosity** maps to trigger resistance, stem width, run length, and gravity/fall duration.

The controls appear only inside the existing Marker/Nib chooser when Mop or Drip Mop is selected. Defaults are Balanced / Balanced. This keeps the persistent shell unchanged and prevents wet calibration from affecting Spray, Round, Chisel, Wall view, or history.

Direct threshold, length, width, and dwell knobs are not separately exposed in V0.6.3; their authority is already represented by the two compact physical controls and can be extended later without a second wet model.

## Calibration Color Palette

The Color button remains the sole compact entry point. Its temporary popover now contains:

- canonical current palette and current color state;
- StudioRich's existing 11 prototype swatches;
- 12-color `Montana Gold · fallback` and 12-color `BLACK 400ML · fallback` calibration ranges;
- a current-color indicator; and
- up to six recent, deduplicated colors.

Palette switching changes only palette state; it preserves current Tool, current Color, view, and history. Color remains stored per canonical stroke, so mixed-color wet marks replay and restore exactly.

The local private Affinity palette files `MONTANA GOLD 400ML.afpalette` and `BLACK 400ML 187 COLORS.afpalette` were found under WOS-share. They are proprietary binary Affinity data, not a safely supported text/config format in this prototype. V0.6.3 does not copy or claim exact values from them. The two expanded ranges are explicitly labeled embedded calibration fallbacks; WOS-share remains ignored/private and unchanged.

## Lighting Observation

MacBook field testing continues to show that a neutral/white ring light near the camera/working volume materially improves Hand/Spray tracking compared with colored lighting observed so far. Lighting remains an external performance variable, not a product hardware requirement, and this checkpoint does not retune Hand reliability around it.

## Automated Verification

- Focused wet controls/model/continuous geometry/palette/cursor/contact tests: PASS — 40/40.
- Final `npm test`: PASS — 32 test files, 177/177 tests.
- Final `npm run build`: PASS — TypeScript and Vite production build; 39 modules transformed.

Coverage includes continuous connected drip-strip geometry, parent origin, taper, gravity direction, deterministic replay, pooled origin, Flow and Viscosity mapping, Mop/Drip Mop differentiation, dwell/load gain, speed drain, multiple origins, restrained non-Mop routing, mixed-color wet history, exact Clear restoration, palette/recent-color state, shared cursor geometry, all required zoom scales, raw Hand aim separation, Chisel clean initialization, corner bounds, and all retained navigation/input/audio/recording/composition tests.

## Current-Host Browser Validation

Passed in the current in-app browser with Physical input where automation permits:

- V0.6.3 loaded in the preserved compact shell with no console warnings or errors;
- Color opened one 238px temporary surface rather than a persistent strip;
- StudioRich, 12-color Montana fallback, and 12-color BLACK fallback palette states switched successfully;
- repeated dark/light/saturated selections updated the cursor and active marks, while two recent colors persisted;
- Flow and Viscosity appeared only for Mop/Drip Mop inside the Marker/Nib chooser and accepted High/Runny and Balanced/Balanced calibration states;
- Mop showed a large round cursor, circular dot, rounded start/end, broad wet body, and retained edge character;
- Drip Mop showed a materially larger circular contact/body than Mop;
- Chisel horizontal, vertical, and diagonal live samples reproduced the original false-corner splinter, then passed after the zero-motion direction fix with clean starts/ends;
- New York Fat Spray, Round Marker, Mop, and Drip Mop created a mixed-color Wall;
- keyboard Undo removed the latest mixed-color stroke;
- Clear disabled Clear while retaining Undo, and one Undo restored the prior colored Wall;
- wheel/two-axis Pan changed both Wall offsets;
- Quick Zoom changed 100% to 200% and restored the exact prior zoom and pan state;
- cursor geometry scaled exactly at 25%, 100%, and 400% in live DOM measurements (17.479px, 69.916px, and 279.664px for the same Drip Mop contact); and
- recording entered and exited the active state around a Physical mark without an application error.

The browser automation surface compresses pointer timing and does not provide a reliable held-pointer dwell gesture. A High/Runny slow-path attempt verified the wet body but did not produce a trustworthy human-timed live run. Connected-run form, dwell/flow thresholds, long-run distribution, and replay are therefore proven deterministically but not claimed as visually live-verified on this host. Modified-wheel zoom and held-Space Pan were also not re-proven through this automation surface; their retained deterministic suites pass. No local soundtrack file was loaded in this V0.6.3 browser pass, so existing music mixing is regression-tested but not newly live-claimed.

## MacBook Manual Validation Checklist

After committing, push and pull before testing.

1. With Physical input, compare Mop and Drip Mop at the same color, size, Balanced Flow, and Balanced Viscosity.
2. For each, draw slow, fast, horizontal, and vertical marks; hold short and long dwells at several points.
3. Confirm Mop produces moderate connected runs and Drip Mop produces visibly wider, longer, more frequent, and occasionally very long runs.
4. Confirm every run remains attached to its wet body, tapers continuously, follows gravity, and never becomes a string of beads.
5. Set Flow Low/Balanced/High while holding Viscosity constant; confirm delivery, buildup, trigger ease, and width increase coherently.
6. Set Viscosity Thick/Balanced/Runny while holding Flow constant; confirm thick is wider/slower/shorter and runny is narrower/faster/longer.
7. Verify multiple Drip Mop origins under high load and that faster movement reduces accumulation.
8. Switch repeatedly among dark, light, and saturated colors; overlap wet marks and inspect opacity, pooling, edge softness, and continuous-run visibility.
9. Verify current color, recent colors, and all palette labels; remember Montana/BLACK ranges are explicitly calibration fallbacks, not imported manufacturer truth.
10. Verify Spray, Round, Chisel, Mop, and Drip Mop cursor size/color/shape alignment at several Wall scales.
11. With Hand input and a neutral/white ring light, compare the raw aim cursor's responsiveness with the stabilized deposited stroke during fast movement.
12. Confirm Hand short-gap protection, tracking-quality warning, edge-driven motion, pinch paint, Pan recovery, and sensor-only camera privacy remain intact.
13. Repeat Mop/Drip Mop slow, fast, and dwell tests with Hand; compare continuous-run behavior against Physical.
14. Exercise mixed-color Undo, Clear, Undo Clear, resize replay, Pan, zoom, edge continuation, soundtrack, and recording; verify exact colors and wet runs survive.
15. Confirm the final WebM contains the Wall composite and mixed audio, and inspect the console for warnings/errors.

## Known Limitations And Deferred Work

- Physical Hand responsiveness, camera cadence, and tool feel require MacBook validation.
- Human-timed live dwell, long-run frequency, and KRINK-like subjective fidelity remain unverified; V0.6.3 is a deterministic digital wet model, not a measured paint-brand simulation.
- Chisel click-only dots are deferred until a direction-aware tap-contact policy can avoid reintroducing false start splinters.
- Flow and Viscosity are session calibration state and are not yet persisted as user settings; generated wet state itself is fully recorded for replay.
- The private Affinity palettes require a separate supported parser/import checkpoint before exact manufacturer swatches can be claimed.
- CLEAN / RAW / GRITTY is a documented future nib/mark-condition axis only.
- V0.6.4 is reserved for Spray Plume + Opacity Calibration: density, edge falloff, opacity curve, radial distribution, overspray, distance/output response, stationary dots, fill/outline utility, blending, and detail precision.
- Surface materials, paint chemistry/drying, Pencil pressure/tilt, Waveformer, Sticker, Roller, Fire Extinguisher, Black Book, collaboration, and shell redesign remain deferred.

Next safe step: push this checkpoint, pull it on the MacBook, complete the manual wet/Hand checklist, and return measured observations before V0.6.4 Spray-plume work.

