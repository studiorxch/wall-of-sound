# Spatial Spraypaint V0.5.2 Current Status

Date: 2026-09-09

Status: PARTIAL — adaptive curve reconstruction, independent Person/Environment controls, bounded person segmentation, fail-open rendering, tests, build, and the available current-host browser regressions pass. Physical camera segmentation quality and the required Hand/compositor combinations remain a MacBook Pro validation gate.

Baseline: V0.5.1 commit `4301686a40ad11d6aa730a99c734511861f99842`. The V0.5.1 MacBook field pass confirmed fast Hand reliability, edge behavior, trackpad pan, music coexistence, daylight behavior, and acceptable Space-pan. V0.5.2 does not reopen those systems except where curve reconstruction consumes their existing wall-space samples.

## Scope

V0.5.2 addresses two bounded needs:

1. reconstruct smoother continuous paths from sparse fast input without changing spray-cap behavior; and
2. separate performer treatment from the camera environment while preserving Hand tracking as the higher-priority camera consumer.

It does not add V0.6 Tool Architecture, new marking tools, collaboration, WallOS, wallpaper/broadcast product behavior, or changes to MUSIC, AudioLab, Suno, Subway, Members, or MAPS.

## Adaptive Curve Reconstruction

The drawing path remains:

`screen input → wall transform → existing input smoothing → adaptive curve reconstruction → canonical wall-point resampling → existing spray deposition`

`AdaptiveCurveReconstructor` retains one transient input sample of look-ahead and reconstructs each eligible segment with cubic Hermite tangents. A turn-angle gate preserves corners at 62 degrees or sharper, including rapid reversals. Broad turns receive continuous tangents. Curve sampling is radius-aware and becomes denser as speed rises; a final subdivision pass bounds output gaps.

The data distinction is explicit:

- sparse pointer/Hand samples after the existing input smoother are transient reconstruction input;
- reconstructed curve samples are an intermediate wall-space path;
- the existing `CanonicalStrokeManager` remains authoritative for persisted deposition points, velocity, width, opacity, and final bounded interpolation;
- stroke history continues to store the deterministic rendered wall-space path used by Undo, Clear restoration, pan/zoom replay, and resize replay.

No cap preset, spray seed, brush deposition rule, global blur, width policy, or persistent history architecture changed.

## Person And Environment Controls

Settings now exposes two independent camera concepts.

Person treatments:

- Clean
- Pixelated
- Silhouette
- Ghost
- Hidden
- Chromatic remains available as an existing treatment; it was not removed or retuned.

Environment modes:

- Original
- Blur
- Solid color
- Local image

The image environment uses an in-memory local object URL and CSS-cover-equivalent geometry. It is not uploaded or persisted. Solid color and image controls appear only for their respective modes. Camera environments require Hand mode because Hand owns camera startup.

## Segmentation Runtime And Failure Policy

The only new dependency is the exact approved package:

`@mediapipe/selfie_segmentation@0.1.1675465747`

It matches the existing pinned MediaPipe Solutions runtime rather than upgrading Hands or Camera Utils. The installed package is approximately 12 MB and contains:

- square model: approximately 244 KB;
- selected landscape model: approximately 244 KB;
- SIMD WASM runtime: approximately 5.4 MB;
- non-SIMD WASM fallback: approximately 5.3 MB;
- loader/runtime JavaScript.

The exact pinned landscape model, SIMD WASM, and loader URLs returned HTTP 200 with cross-origin access on 2026-09-09. Runtime assets are resolved from the version-pinned jsDelivr package path.

Segmentation is initialized only after Hand camera startup and only when the selected Person/Environment combination needs a mask. Clean + Original preserves the direct existing camera path and does not pay the segmentation cost.

Failure is fail-open:

- while a required mask is unavailable, the compositor renders the Clean Original camera instead of a black or fatal frame;
- initialization/inference failure visibly reports that the environment returned to Original;
- the Environment selection is reset to Original on segmentation failure;
- Hand tracking remains on its separate existing tracker/camera callback path and is not replaced by segmentation.

## Compositor And Coordinate Ownership

The actual recorded-canvas compositor order is:

`wall background → selected camera environment → masked treated performer → persistent wall paint`

Wall background, stroke history, paint, Undo, Clear, pan, zoom, and replay remain world-space authorities. Camera environment and masked performer are rendered in viewport/screen space and are never transformed with the wall. The tracking cursor/debug UI remains a separate DOM overlay and is neither persistent graffiti nor part of the recorded canvas.

`PerformanceRecorder` still captures `compositeCanvas`, so the selected environment, treated performer, and persistent wall paint are included in the final WebM. Audio mixing and recorder architecture were not changed.

## Performance Policy

- Segmentation cadence is capped at 8 FPS (125 ms minimum interval).
- While spraying, segmentation backs off to 4 FPS (250 ms minimum interval).
- Only one segmentation inference may be in flight.
- The latest successful 256×144 mask is copied once and reused between inferences.
- The lower-resolution landscape model is selected.
- Segmentation calls are scheduled independently from the Hand tracker callback and are never awaited by Hand delivery or spray deposition.
- Hand reliability is authoritative. If the MacBook matrix shows tracking degradation, segmentation quality/cadence must yield before Hand detection, pinch thresholds, or drawing delivery are changed.

## Automated Verification

- `npm test`: PASS — 18 files, 70 tests.
- `npm run build`: PASS — TypeScript and Vite production build; 30 modules transformed.

Curve coverage includes sparse fast arc, dense slow arc, sharp corner, S-curve, rapid reversal, deterministic reconstruction, transformed wall coordinates, straight fast gesture, bounded output gap, endpoint fidelity, and output ordering.

Camera-environment coverage includes independent Person/Environment planning, Clean + Original bypass, Pixel + Original mask requirement, Clean + Blur, Hidden + Image, no-mask Original fallback, image-required fallback, cover geometry, one-inference scheduling, 8 FPS cap, and 4 FPS drawing backoff. Existing Hand, WallView, history, command, soundtrack-state, recording-adjacent, spray engine, cap, audio, and silhouette tests remain green.

## Current-Host Validation

Passed in the running browser:

- canvas-first V0.5.2 startup and compact shell;
- independent Person and Environment selectors;
- Original, Blur, Solid color, and Local image choices are present;
- Solid/Image dependent controls appear only when selected;
- Physical pointer spray and continuous fast straight deposition;
- a multi-point broad curve gesture rendered continuously without gaps;
- horizontal/two-axis wheel pan moved the wall and retained marks;
- zoom clamped exactly at 25% and 400%;
- Quick Zoom reached 200% and restored exactly to 100%;
- transformed Clear and one-step Undo restoration at 200%, with view zoom unchanged;
- Settings closed with Escape;
- recording entered and exited active/save state;
- no-camera Hand startup produced `RETRY CAMERA` and the visible `The camera could not start. Allow camera access and try again.` diagnostic;
- application console warning/error list was empty after drawing, navigation, history, and recording checks.

Deterministic current-host tests passed for slow curve, sparse fast curve, S-curve, sharp turn, rapid reversal, transformed replay coordinates, and fast straight stroke.

Not freshly live-verified in this closure:

- controlled slow-versus-fast multi-point pointer timing — the browser drag synthesizer compresses path events and cannot provide reliable gesture cadence;
- a fresh soundtrack file selection — the browser file-chooser bridge stalled. The player implementation was untouched, PlayerState tests pass, and the V0.5.1 current-host soundtrack load/play/pause pass remains the latest live evidence;
- camera segmentation rendering/performance — this host has no physical camera, so no mask-quality or camera-combination claim is made;
- local Image pixels in the live compositor — the same file-chooser automation limitation prevented a new local image load, while cover/fallback behavior is test-covered.

## MacBook Pro Physical Validation Checklist

1. Enter Hand and confirm the camera starts with Clean person treatment.
2. Confirm actual person-mask edge quality and stable screen-relative placement.
3. Verify Environment Original.
4. Verify Environment Blur.
5. Verify Environment Solid with a changed solid color.
6. Load a local image and confirm cover cropping with no stretching.
7. Verify Clean + Blur.
8. Verify Pixel + Solid.
9. Verify Silhouette + Image.
10. Verify Hidden + Image.
11. Disconnect/block segmentation assets if practical and confirm visible failure plus Original camera fallback, with no black/fatal frame.
12. Draw slow and fast Hand circles, S-curves, broad arcs, tag loops, sharp zigzags, tight corners, and fast straight strokes.
13. Draw fast Hand writing while music plays.
14. Record with segmentation active and confirm the exported WebM contains environment, treated performer, wall paint, and mixed audio.
15. Pan and zoom while confirming the performer/environment remain screen-fixed.
16. Confirm pinch marks retain wall coordinates through pan, precision zoom, Quick Zoom restore, Undo, Clear restoration, and resize.
17. Run the matrix in daylight.
18. Repeat in lower light if practical.
19. Watch Tracking Debug cadence/missing-hand/pinch metrics for any noticeable degradation from segmentation.
20. If Hand reliability degrades, reduce or suspend segmentation before changing Hand thresholds or drawing behavior.

## Known Limitations

- The segmentation package is the legacy pinned MediaPipe Solutions implementation chosen to match the existing Hands stack; no opportunistic MediaPipe migration was attempted.
- The segmentation call is asynchronous and bounded but shares browser compute resources. Physical MacBook soak/performance evidence is still required.
- Original/Blur backgrounds remove the masked foreground before placing the treated performer; Hidden may reveal the wall through that region because V0.5.2 does not implement scene inpainting.
- Environment images are session-local and not persisted.
- No redo, reload persistence, export framing, collaborative state, or multi-tool architecture is included.
- The npm install reported the repository's audit summary of four vulnerabilities (two moderate, one high, one critical). No audit fix or unrelated dependency update was run within this checkpoint.

## Exact V0.5.2 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/0909_SPATIAL_SPRAYPAINT_V0.5.2_CURRENT.md`
- `prototypes/spatial-spraypaint/src/AdaptiveCurveReconstructor.ts`
- `prototypes/spatial-spraypaint/src/AdaptiveCurveReconstructor.test.ts`
- `prototypes/spatial-spraypaint/src/CameraEnvironment.ts`
- `prototypes/spatial-spraypaint/src/CameraEnvironment.test.ts`
- `prototypes/spatial-spraypaint/src/PersonSegmenter.ts`
- `prototypes/spatial-spraypaint/src/PersonSegmenter.test.ts`

Next safe checkpoint after the MacBook V0.5.2 field pass: review its evidence before deciding whether V0.6 Tool Architecture can begin. Do not begin V0.6 from this checkpoint alone.
