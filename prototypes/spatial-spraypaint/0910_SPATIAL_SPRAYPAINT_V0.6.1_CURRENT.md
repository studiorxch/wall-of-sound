# Spatial Spraypaint V0.6.1 Current Status

Date: 2026-09-11

Status: PARTIAL — marker fidelity, deterministic wet-paint behavior, and the Spray Cap Profile foundation are implemented. The full automated suite, TypeScript, production build, and available current-host Physical/browser workflows pass. Human-timed Hand and wet-mark validation remains a MacBook gate.

Baseline: V0.6 commit `e8b6af4524ee45c9a454cfa26e5159a6683a9f68`.

## Scope

V0.6.1 calibrates the mark engines already introduced by the shared V0.6 Tool architecture. It does not add a Tool family, replace the canonical stroke pipeline, alter Wall/view authority, redesign the compact shell, or re-enable performer segmentation.

The authoritative path remains:

```text
Physical or Hand input
→ selected Tool
→ shared canonical Wall-space stroke
→ selected Tool renderer
→ Wall
```

Pan and edge-driven motion remain navigation concerns outside Tool authority. History, transforms, recording, and input routing remain Tool-agnostic.

## Chisel / Calligraphy

The V0.6 renderer drew separately stroked segments, so each short canonical segment exposed its own edge and the result read as repeated stamps. V0.6.1 replaces that output with a continuous swept-nib ribbon:

- each segment is a filled quadrilateral formed from the centerline and nib width;
- adjacent segments receive an explicit filled join with a small tangent overlap, preventing anti-aliased seams and zero-area joins on straight strokes;
- a fixed physical nib angle remains distinct from the movement-derived centerline direction;
- horizontal, vertical, and diagonal movement therefore retain obvious broad/narrow differences;
- normal direction changes use bounded velocity-aware orientation smoothing;
- sharp changes above the corner threshold pass through without over-smoothing; and
- the same canonical points reproduce the same geometry during replay.

No blur or post-process continuity effect is used.

## Round Marker

Round Marker now uses the same continuous swept-body construction instead of relying on an independently stroked line per segment. Rounded continuity caps preserve its footprint, while deterministic position/time-derived width variation is limited to ±2.2% and speed thinning is bounded. The core remains dense and opaque, with no aerosol particles.

This preserves slight material irregularity without a periodic bead rhythm or a sterile perfectly uniform vector line.

## Mop And Drip Mop

Mop and Drip Mop are separate retained variant IDs rather than one combined UI choice:

- **Mop** — broad wet body, moderate paint load, three-pass material character, restrained run tendency;
- **Drip Mop** — broader high-flow body, higher initial/load gain, four-pass material character, earlier dwell response, shorter cooldown, and potentially multiple or unusually long runs.

Both consume a bounded per-stroke `WetPaintAccumulator`. Its state considers retained paint load, elapsed dwell, movement speed, travel since the last run, nib size, and the Settings drip toggle. Slow or stationary movement increases load; fast movement drains load and narrows the rendered body. Wet edges are rendered as deterministic darker edge streaks with an inset highlight at higher load.

Drips are created only after bounded load plus dwell/travel gates pass. A stable stroke-ID random source determines lateral origin, width, length, bend, duration, and the occasional second or dramatic Drip Mop run. Gravity remains authoritative through positive downward length; horizontal bend stays small relative to that length. Generated seeds, including bend and duration, are stored in canonical history and replayed exactly.

Disabling stationary drips prevents wet-run creation without changing the underlying marker body.

## Spray Cap Profile Foundation

`SprayCapProfile` is the single descriptive/calibration layer over the existing `SprayCapPresets` deposition authority. Every existing Cap resolves through its canonical ID and retains the exact existing deposition preset and Spray dynamics.

Each profile now records more than width:

- family and digital-baseline nominal width range;
- cone shape;
- edge and overspray character;
- output volume;
- flare and fade behavior;
- speed response;
- stationary-dot behavior;
- orientation behavior;
- pending distance-response calibration; and
- Cap-specific empirical-calibration notes.

All profiles are explicitly labeled `digital-baseline-not-physical-reference`. V0.6.1 does not claim real-world Cap accuracy and does not broadly retune Spray output. Legacy aliases still resolve through the canonical existing Cap authority.

Spray Calligraphy remains a shaped aerosol fan/plume. Chisel / Calligraphy remains a contacting physical marker nib. They can produce related compositions but do not share a mark model.

## Canonical History And Replay

Wet points retain their bounded `paintLoad` alongside the existing Wall coordinates, timestamp, velocity, width, and opacity. Wet drip seeds retain deterministic bend and duration. Tool ID, Cap/Nib variant, color, size, input source, and stable stroke ID remain unchanged.

Replay begins and ends renderer stroke state at canonical stroke boundaries. Mixed Spray, Round, Chisel, Mop, and Drip Mop marks therefore continue to support transformed replay, resize replay, bounded Undo, Clear, and one-step Clear restoration without a parallel history system.

## Future Physical Calibration Axis — Documentation Only

Future mark fidelity should be modeled as:

```text
TOOL
+ CAP / NIB
+ PAINT / INK
+ SURFACE MATERIAL
+ SPEED / DISTANCE / ANGLE
→ resulting mark
```

Potential surface evidence includes absorption, friction, drag, spread, edge softness, overspray catch, drip speed, bleed, coverage density, texture breakup, drying, and accumulation. Candidate surfaces include painted metal, raw concrete, brick, glass, paper, canvas, rusted steel, plastic, and subway tile.

No surface-material simulation or user-facing calibration panel is implemented in V0.6.1.

## Lighting Research Note

MacBook field observation suggests neutral/white illumination supports Hand tracking better than green/blue illumination. Placement matters: a small neutral ring light near the laptop/camera axis may be worth testing, aimed at the hand working volume rather than the full room. This is a research note, not a product hardware requirement, and V0.6.1 does not change Hand tracking architecture.

## Automated Verification

- Focused renderer/wet-model/Cap-profile/history checks: PASS — 41/41.
- TypeScript preflight: PASS.
- Final `npm test`: PASS — 29 test files, 152/152 tests.
- Final `npm run build`: PASS — TypeScript and Vite production build; 36 modules transformed.

Coverage includes continuous filled marker ribbons, non-degenerate straight joins, Chisel horizontal/vertical/diagonal widths, bounded orientation smoothing, sharp-corner preservation, deterministic marker geometry, Round opacity/variation/fast width bounds, Mop/Drip Mop distinction, slow/dwell load gain, fast-load reduction, deterministic varied gravity drips, disabled-drip behavior, canonical Cap Profile resolution, unchanged Spray deposition dynamics, mixed-tool history, transforms, edge motion, navigation, input authority, audio, camera privacy, and recording composition.

## Current-Host Browser Validation

Passed at 1280 × 720 with Physical input where browser automation permits:

- V0.6.1 loaded in the preserved compact V0.5.4/V0.6 shell;
- Round Marker rendered a dense, opaque, continuous line without aerosol output;
- Chisel long horizontal, vertical, and diagonal marks showed clearly different widths;
- the initial browser pass reproduced thin seams between adjacent Chisel quads;
- the repaired tangent-overlap join removed those visible segment seams on the repeated live pass;
- Mop and Drip Mop appeared as distinct broad wet/high-flow bodies, with Drip Mop visibly broader;
- existing New York Fat Spray rendered normally and Pink Dot Fat switching succeeded;
- mixed-tool Undo removed the most recent retained Tool stroke;
- Clear removed the Wall and one Undo restored the exact prior captured frame hash;
- Quick Zoom changed the view to 200% and restored the exact previous frame hash;
- a 150% preset changed scale, Space-drag moved the Wall, and drawing resumed immediately after release with no Pan latch;
- a local 12-second soundtrack loaded, played, advanced, and retained loop state;
- recording started with one mixed audio track, included a Spray gesture/hiss, stopped cleanly, and logged a non-empty 233,750-byte `video/webm` export; and
- the browser console contained no application warnings or errors.

The automation surface compresses pointer timing. It could not produce a trustworthy visual proof of very slow/long dwell, broad/S curves, lettering, or multiple human-paced Drip Mop runs. A bounded repeated-point attempt rendered the high-flow footprint but did not cross a visibly useful dwell interval. Those paths pass deterministic model/renderer tests, but physical feel and timing are not claimed as live-verified here. Camera/Hand behavior is also not claimed on this host.

## MacBook Manual Validation Checklist

After commit, push, and pull:

### Hand + Chisel

1. Draw long horizontal, vertical, and diagonal marks; confirm strong, controllable broad/narrow response.
2. Draw a broad curve, S-curve, loop, and large lettering; confirm there are no segment seams or stamp rhythm.
3. Draw several abrupt corners and handstyle direction changes; confirm corners remain intentional rather than over-smoothed.
4. Write quickly and continue at each viewport edge; confirm no continuity or Pan-recovery regression.

### Hand + Round

5. Draw a long line, loop, fast line, name, and S-curve.
6. Confirm the body remains monoline, opaque, continuous, slightly organic, and never aerosol-like or visibly beaded.

### Hand + Mop / Drip Mop

7. Compare Mop and Drip Mop at the same Color and default Size.
8. Test slow, very slow, short dwell, long dwell, faster, vertical, and horizontal gestures.
9. Confirm slow/dwell produces wetter accumulation and gravity-directed runs, while fast movement thins and produces fewer/shorter runs.
10. Confirm Mop is moderately wet and Drip Mop is intentionally more aggressive, with varied origins, lengths, timing, and occasional long drips rather than a tail on every stroke.
11. Undo, replay after resize, Clear, Undo Clear, Pan, zoom, and edge-continue wet marks; confirm body and drips remain stable.

### Spray, session, and lighting regression

12. Confirm existing Spray Caps, Hand pinch delivery, hiss/rattle, fast writing, tracking warning, viewport-edge protection, and Pan recovery are unchanged.
13. Compare Spray Calligraphy with Chisel Marker and confirm aerosol plume versus contacting nib remains obvious.
14. Create a mixed Spray/Round/Chisel/Mop/Drip Mop session, load music, record, and confirm final WebM video plus mixed audio.
15. Inspect the console for warnings/errors.
16. Observe Hand reliability in daylight and neutral white light; optionally compare colored light and a neutral light near the camera axis. Record observations without treating lighting as a product pass/fail requirement.

## Known Limitations And Deferred Work

- Human-timed marker curves, lettering, dwell, drip feel, and Hand edge continuation remain MacBook/manual gates.
- Chisel orientation remains movement-derived with a fixed nib angle; Hand pose and Pencil pressure/tilt are deferred.
- Wet behavior is a bounded digital material model, not a physically measured KRINK or paint-brand simulation.
- Cap width ranges and character fields are calibration-ready digital baselines; empirical Cap/paint/distance reference trials remain pending.
- Round Marker continuity still uses rounded overlap caps as part of its swept body; physical tip compression is not modeled.
- Surface material, paint/ink chemistry, drying, absorption, and texture simulation are documented only.
- Paint Marker remains intentionally silent because no appropriate contact-audio asset exists.
- Performer segmentation remains preserved but has no primary runtime entry point.
- Waveformer, Sticker, Fire Extinguisher, Roller, Black Book, collaboration, and any shell redesign remain out of scope.

## Exact V0.6.1 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/DrawingTool.ts`
- `prototypes/spatial-spraypaint/src/DrawingTool.test.ts`
- `prototypes/spatial-spraypaint/src/DrawingToolRenderer.ts`
- `prototypes/spatial-spraypaint/src/DrawingToolRenderer.test.ts`
- `prototypes/spatial-spraypaint/src/DripLogic.ts`
- `prototypes/spatial-spraypaint/src/PaintMarkerEngine.ts`
- `prototypes/spatial-spraypaint/src/PaintMarkerEngine.test.ts`
- `prototypes/spatial-spraypaint/src/SprayBrushEngine.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`
- `prototypes/spatial-spraypaint/src/types.ts`

Added:

- `prototypes/spatial-spraypaint/0910_SPATIAL_SPRAYPAINT_V0.6.1_CURRENT.md`
- `prototypes/spatial-spraypaint/src/SprayCapProfile.ts`
- `prototypes/spatial-spraypaint/src/SprayCapProfile.test.ts`
- `prototypes/spatial-spraypaint/src/WetPaintModel.ts`
- `prototypes/spatial-spraypaint/src/WetPaintModel.test.ts`

Next safe step: push this checkpoint, pull it on the MacBook, and complete the manual list before judging physical fidelity. A later checkpoint can calibrate Cap profiles against measured physical references without changing current Tool/history/Wall authority.
