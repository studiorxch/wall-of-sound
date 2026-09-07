# Spatial Spraypaint V0.1 Current Status

Date: 2026-09-07

Status: PARTIAL — the diagnostic and silhouette repairs are implemented and locally verified, but this validation host has no camera device. Physical hand/camera validation remains required on the MacBook Pro.

## Implemented

- Replaced the unpinned MediaPipe browser globals with pinned package dependencies:
  - `@mediapipe/hands` `0.4.1675469240`
  - `@mediapipe/camera_utils` `0.3.1675466862`
- Kept MediaPipe model/WASM loading on the matching pinned jsDelivr asset path.
- Added a transient DOM tracking layer separate from the composite and persistent paint canvases.
- Added a fingertip cursor, hand/no-hand state, confidence, pinch distance, pinch state, manual spray state, and seven-stage pipeline status.
- Made the tracking layer default-on in spatial mode with a visible toggle.
- Added visible tracker/camera errors and retry state.
- Added console diagnostics for runtime loading, tracker initialization, camera start, first video frame, first results callback, hand landmarks, pinch changes, canvas mapping, and spray-point delivery.
- Replaced the former silhouette brightness/contrast filter with an adaptive, two-tone whole-frame posterization pass.

The brush engine, persistent paint layer, audio path, video recorder, and non-prototype StudioRich systems were not changed.

## Verification

- `npm test`: PASS — 3 test files, 8 tests.
- `npm run build`: PASS — TypeScript and Vite production build.
- Browser startup: PASS — no page-load/runtime errors after the complete V0.1 markup loaded.
- Tracking overlay: PASS — visible by default in spatial mode; hide/show toggle verified.
- MediaPipe JavaScript runtime: PASS.
- Pinned MediaPipe model/WASM initialization: PASS.
- Missing-camera failure path: PASS — `NotFoundError: Requested device not found` was logged and surfaced visibly as `TRACKER ERROR` with a retry control.
- Silhouette pixel transform: PASS — automated tests verify adaptive threshold bounds and strongly separated dark/light output values.

## Hand Pipeline Status

1. MediaPipe loads: PASS.
2. Video frames reach MediaPipe: NOT VERIFIED — no camera device on this host.
3. Results callback fires: NOT VERIFIED — blocked by stage 2.
4. Hand landmarks exist: NOT VERIFIED — blocked by stage 2.
5. Fingertip coordinates map to canvas: automated geometry PASS; physical hand NOT VERIFIED.
6. Pinch state changes: automated threshold PASS; physical gesture NOT VERIFIED.
7. Spray engine receives tracked points: code path retained and instrumented; physical hand NOT VERIFIED.

## Required MacBook Pro Check

Run the prototype on the camera-equipped MacBook Pro and verify:

1. Start Webcam Hand Tracking and confirm stages 2 and 3 begin counting.
2. Put one hand in frame and confirm `HAND DETECTED`, confidence, pinch distance, and the fingertip ring.
3. Move the open hand and confirm the ring follows while spray remains off.
4. Pinch and release to confirm the visual state toggles and paint is delivered.
5. Hold Space while a hand is tracked to confirm the manual state and paint fallback.
6. Select Silhouette and confirm the live frame is visibly reduced to dark/light posterized regions.
7. Confirm the tracking overlay does not appear in saved paint or the recorded canvas output.

Do not begin another Spatial Spraypaint checkpoint until this physical-camera validation is recorded here.
