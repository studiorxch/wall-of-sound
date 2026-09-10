# Spatial Spraypaint V0.5.3 Current Status

Date: 2026-09-09

Status: PARTIAL — sensor-first/wall-first composition, camera-free Wall environments, normal-runtime segmentation removal, defensive Pan recovery, 86/86 tests, production build, and the available current-host regressions pass. A physical MacBook camera is still required to validate Hand cadence, pinch drawing, post-Pan Hand resume, and the removal of performer-processing overhead.

Baseline: V0.5.2 commit `84f661a53710db87ec1885c374390401946208d0`.

## V0.5.2 MacBook Findings And Product Decision

The V0.5.2 MacBook pass confirmed smooth normal/careful Hand drawing, materially improved fast writing, acceptable edge tracking, smooth trackpad pan, music during Hand drawing, recording, and materially better Image + Hidden behavior than visible-performer modes.

It also found that Blur produced a black silhouette halo, Solid and Image with a visible performer added noticeable latency, visible segmentation/compositing weakened responsiveness, extreme-speed Hand drawing could still become spotty, and Pan could become latched.

V0.5.3 therefore makes the camera an invisible Hand-tracking sensor and the Wall the visible creative output. The normal user flow no longer shows, composites, or records the performer. Visible-person segmentation is deferred as an experimental implementation rather than treated as a primary product surface.

## Sensor-First / Wall-First Runtime

The default composition authority is explicit in `WallComposition`:

`static/chosen environment → infinite Wall → persistent paint`

The tracking cursor and interface remain separate DOM overlays. The recorded canvas contains environment, Wall, and paint; it does not contain the UI, camera frame, or performer.

Normal Hand mode still initializes the existing pinned MediaPipe Hands tracker and requests camera access. Camera frames stay inside that tracker path. `main.ts` no longer imports or instantiates `PersonSegmenter`, `CameraEnvironmentProcessor`, or `AnonymityProcessor`, and the production bundle contains none of their segmentation/person-compositor symbols. Consequently the primary Hand path performs zero Selfie Segmentation inference, creates no mask, and runs no person compositor.

The V0.5.2 segmentation implementation remains preserved in `PersonSegmenter.ts`, `CameraEnvironment.ts`, and their tests. The exact pinned dependency `@mediapipe/selfie_segmentation@0.1.1675465747` remains unchanged for a future explicitly hidden experimental/native/runtime revisit. There is no primary UI or primary runtime entry point to it in V0.5.3.

## Primary Wall Environments

Settings presents three lightweight Drawing environments:

- Wall / Default, retaining the existing Black, Charcoal Wall, Mid Gray, and Off-White Wall surfaces;
- Solid background, using a user-selected color; and
- Image background, loaded from a session-local file.

Solid and Image environments do not depend on camera access or segmentation. A loaded image is drawn as a repeated, wall-anchored world-space surface: it follows pan and zoom with the infinite Wall instead of behaving like a screen-fixed camera layer. Missing or failed image input falls back to Wall / Default with a visible local decode error. No image is uploaded or persisted.

Person-treatment, masking, segmentation runtime, and Original Camera controls were removed from primary Settings. Hand now explains that its camera is a private sensor and the performer is not shown or recorded.

## Pan Latch Root Cause And Fix

The navigation model already derived the effective tool from `PanInteractionState.source`, but the prior lifecycle did not normalize all ways a pointer or window could lose ownership. In particular, lost pointer capture, document visibility, Escape, and mode transitions could leave a stale temporary navigation state.

V0.5.3 keeps Pan as temporary input state and adds one defensive cancellation authority. It clears Space-held state, Pan source, active pointer identity, last Pan point, capture, and Pan cursor classes on:

- Space keyup;
- pointercancel;
- lostpointercapture;
- window blur;
- document visibility loss;
- Escape;
- input-mode switch;
- stale Hand resume; and
- wheel navigation normalization.

Ordinary pointerup ends only the active drag and preserves the physically held Space modifier until keyup. `effectiveTool` remains derived from whether a Pan gesture is active; there is no selected or sticky Pan tool. Repeated deterministic cycles restore Spray every time. A fresh active pinch may resume Hand drawing only when no Pan state remains and the tracking sample is at most 120 ms old.

Architectural invariant: navigation cannot outlive the input gesture that invoked it.

## Fast Strokes And Sound

V0.5.3 does not retune the V0.5.2 curve or brush path. Adaptive reconstruction, 60 Hz-class deposition, velocity-aware resampling, the short missing-sample bridge, stable seeded replay, cap behavior, Undo, Clear restoration, resize replay, and wall coordinates remain unchanged.

Spray hiss, can rattle, soundtrack mixing, and recorder audio authority remain intact. Sound continues to provide material simulation and immediate gesture-state feedback. Extreme-speed Hand motion can still become spotty and is documented rather than chased in this bounded cleanup.

## Recording

`PerformanceRecorder` continues to capture `compositeCanvas` plus the existing mixed audio stream. Because the normal compositor now renders only background/Wall and persistent paint, the default WebM excludes the live camera and performer without a second recorder path.

Current-host recording started with one mixed audio track and produced a 248,919-byte `video/webm` export after a Physical spray gesture. The browser download observer timed out after the app had completed the export, but the recorder returned to its idle control state and logged the completed blob; this is an automation-observer limitation, not a recorder failure.

## Automated Verification

- `npm test`: PASS — 19 files, 86 tests.
- `npm run build`: PASS — TypeScript and Vite production build; 26 modules transformed.
- Focused preflight: PASS — WallComposition, WallView, HandTrackingReliability, and SettingsState; 30/30 tests plus `tsc --noEmit`. The final expanded termination matrix is included in the 86-test full run.

New coverage explicitly verifies:

1. segmentation disabled by default;
2. no person compositor in normal Hand mode;
3. Wall/background without a camera frame;
4. Image background without segmentation;
5. Solid background without segmentation;
6. Space-keyup Pan recovery;
7. pointercancel recovery;
8. lostpointercapture recovery;
9. window-blur recovery;
10. repeated Pan/draw cycles restoring Spray;
11. Hand drawing eligibility after Pan from a fresh pinch; and
12. the default recorder layer plan excluding camera and performer.

The existing V0.5.2 segmentation tests remain green, proving the deferred modules were preserved rather than deleted.

## Current-Host Live Validation

Passed in the local browser:

- V0.5.3 canvas-first startup and the existing compact shell;
- primary Settings contains Wall / Default, Solid, and Image but no Person, Camera Environment, or segmentation controls;
- Solid rendered independently of camera state;
- a local PNG rendered as a repeated world-space Image wall with the grid retained and no environment error;
- Physical spray rendered a continuous visible stroke and drove the existing hiss start/stop lifecycle;
- five consecutive Space-pan gestures ended with no `panning` or `pan-ready` body state;
- Physical drawing resumed after navigation;
- two-axis wheel input completed with no retained Pan state;
- zoom clamped at exactly 25% and 400%;
- Quick Zoom reached 200% and restored exactly to 100%;
- ordinary Undo, Clear, and one-step Clear restoration remained available and retained the selected background;
- Escape closed Settings;
- can-rattle control completed with no audio error;
- recording started/stopped, mixed one audio track, and produced a non-empty WebM;
- Hand selected the wall-only overlay/state and surfaced the expected camera-less-host `RETRY CAMERA` plus `The camera could not start. Allow camera access and try again.` diagnostic;
- the Hand attempt logged MediaPipe Hands load and tracker initialization but no Selfie Segmentation initialization, result, inference, or error;
- after excluding the expected no-camera Hand diagnostic, no unrelated console warning/error appeared in the Physical/background/navigation/history/recording pass.

Pointercancel and lostpointercapture are covered by the new deterministic state tests and direct browser event wiring review. The current browser automation cannot reliably interrupt a native captured pointer mid-drag, so those two termination paths are not claimed as a synthesized live event.

This host has no physical camera. It did not validate real camera frames, landmarks, fingertip movement, pinch spray, Hand cadence, CPU impact, or real Hand resume after Pan.

## Performance Observation

The V0.5.3 production build transforms 26 modules versus the V0.5.2 checkpoint's 30, and its output contains no person-segmentation/compositor symbols. Runtime diagnostics showed no Selfie Segmentation startup or inference. This supports the bounded claim that default Hand no longer schedules that work.

No numerical Hand-performance improvement is claimed on the camera-less host. Responsiveness and cadence improvement must be judged on the MacBook against the V0.5.2 field result.

## MacBook Manual Validation Checklist

After commit, push, and pull:

1. Enter Hand and confirm no live performer or camera frame appears.
2. Confirm camera permission still starts MediaPipe Hands and the fingertip cursor follows the hand.
3. Confirm normal-speed pinch spraying remains smooth.
4. Confirm fast writing remains materially improved.
5. Confirm the documented extreme-speed limitation honestly.
6. Verify Solid background while drawing in Hand.
7. Load and verify Image background while drawing in Hand.
8. Confirm no mask halo.
9. Confirm no segmentation latency or Selfie Segmentation console/runtime activity.
10. Repeat `pinch spray → Space pan → release → pinch spray` at least ten times.
11. Interrupt a Space-pan with pointer cancellation/window blur if practical and confirm Spray returns.
12. Repeat trackpad/two-axis pan and confirm it never latches.
13. Confirm pinch spray resumes immediately after Pan with correct wall coordinates.
14. Exercise precision zoom, Quick Zoom restore, Undo, and Clear restoration in Hand.
15. Load music and draw in Hand.
16. Record Wall/Default + Hand + music and confirm the performer/camera is absent.
17. Record Solid + Hand and Image + Hand; confirm each visible wall plus paint and mixed audio is present.
18. Repeat in daylight.
19. Repeat in lower light if practical.
20. Watch Tracking Diagnostics cadence, missed-hand frames, pinch continuity, paint continuity, responsiveness, and practical CPU behavior; compare qualitatively with V0.5.2 without inventing unsupported numbers.

## Known Limitations

- Physical camera and Hand behavior remain a MacBook gate.
- Extreme-speed Hand drawing can still become spotty.
- Local background images are session-only and are not persisted.
- The deferred legacy MediaPipe Selfie Segmentation package remains installed but is absent from the normal runtime bundle.
- No redo, reload persistence, collaboration, export framing, new tool architecture, or V0.6 work is included.
- The right-rail/dock direction supplied during closure was treated as a visual constraint to preserve for later work; V0.5.3 does not redesign or expand the existing shell.

## Exact V0.5.3 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/HandTrackingReliability.ts`
- `prototypes/spatial-spraypaint/src/HandTrackingReliability.test.ts`
- `prototypes/spatial-spraypaint/src/SettingsState.ts`
- `prototypes/spatial-spraypaint/src/SettingsState.test.ts`
- `prototypes/spatial-spraypaint/src/WallView.ts`
- `prototypes/spatial-spraypaint/src/WallView.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/0909_SPATIAL_SPRAYPAINT_V0.5.3_CURRENT.md`
- `prototypes/spatial-spraypaint/src/WallComposition.ts`
- `prototypes/spatial-spraypaint/src/WallComposition.test.ts`

Next safe step: perform the MacBook checklist and record its evidence. Do not begin V0.6 Tool Architecture from this checkpoint alone.
