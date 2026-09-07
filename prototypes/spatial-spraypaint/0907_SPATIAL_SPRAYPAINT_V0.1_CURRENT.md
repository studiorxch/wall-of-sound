# Spatial Spraypaint V0.1 Current Status

Date: 2026-09-07

Status: PASS — the diagnostic and silhouette repairs are implemented, and the user subsequently completed physical validation on the camera-equipped MacBook Pro.

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
- MacBook Pro physical validation (user-reported): PASS — webcam tracking, fingertip mapping, pinch-to-spray, mouse fallback, anonymity treatments including Silhouette, music playback, recording/export with music, diagnostics, and persistent spray drawing all worked.

## Hand Pipeline Status

1. MediaPipe loads: PASS.
2. Video frames reach MediaPipe: PASS on MacBook Pro (user-reported).
3. Results callback fires: PASS on MacBook Pro (user-reported).
4. Hand landmarks exist: PASS on MacBook Pro (user-reported).
5. Fingertip coordinates map to canvas: PASS in automated geometry and MacBook Pro live use (user-reported).
6. Pinch state changes: PASS in automated threshold and MacBook Pro live use (user-reported).
7. Spray engine receives tracked points: PASS on MacBook Pro (user-reported).

## Physical Validation

The user completed the required MacBook Pro test after the current-host implementation run. V0.1 is accepted as the baseline for V0.2; hand tracking and pinch interaction must not be redesigned.
