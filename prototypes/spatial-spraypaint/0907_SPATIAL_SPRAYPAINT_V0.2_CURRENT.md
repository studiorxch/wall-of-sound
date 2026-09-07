# Spatial Spraypaint V0.2 Current Status

Date: 2026-09-07

Status: PARTIAL — V0.2 performance-space, cap, flow, audio, mouse, fullscreen, and recording behavior pass on the current host. The camera-equipped MacBook Pro validation specified for hand input and practical spatial use remains required.

## Scope

V0.2 extends the accepted V0.1 prototype without changing its MediaPipe tracker, mirrored fingertip mapping, anonymity processor, silhouette treatment, persistent paint canvas, or `PerformanceRecorder` implementation.

## Performance Space

- The left controls collapse to a small `Controls` tab and reopen without clearing paint or resetting runtime state.
- `Performance Mode` (button or `P`) hides the controls and diagnostic panel while retaining a small cap, spray, tracking, recording, and exit/record HUD.
- Tracking diagnostics default off, remain available from the control or `D`, and automatically reveal non-performance-mode tracker errors.
- The fingertip cursor remains available in spatial mode even when the large diagnostic panel is hidden.
- Fullscreen enter/exit is exposed through the browser Fullscreen API and relies on the existing resize preservation path for paint.
- Escape is not intercepted. A `C` shortcut was intentionally omitted to avoid accidental canvas clearing.

## Cap Definitions

The reusable `SprayCapPreset` model includes radius, core density/opacity, edge falloff, particle count/spread/size/opacity, flow rate, accumulation rate, and velocity response.

| Preset | Radius | Character |
| --- | ---: | --- |
| Fat Cap | 38 px | Broad dense core, strong fill, soft edge |
| Skinny Cap | 12 px | Narrow, controlled detail line |
| Soft Cap | 46 px | Broad feathered atmospheric mist |
| High Pressure | 34 px | Highest flow, density, and accumulation |
| Dust / Fog | 54 px | Low core density with the widest fine mist |

Cap resolution and velocity-to-density mapping are data-driven. Slow movement increases deposition; fast movement reduces density and slightly expands particle throw. Existing point interpolation remains authoritative, preventing disconnected stamps.

## Spray-Can Audio

- A continuous synthesized aerosol hiss starts once per spray transition and stops with a short release; repeated points during one stroke do not retrigger it.
- The manual `Shake Can (Test Rattle)` control plays a short rate-limited synthesized can-marble rattle.
- Physical shake detection is deferred rather than reported as complete.
- Generated can audio and uploaded music share one Web Audio mix connected both to local output and the existing recorder audio stream.
- Recording falls back to video-only if Web Audio is unavailable instead of breaking the existing visual export.

## Automated Verification

- `npm test`: PASS — 5 test files, 13 tests.
- `npm run build`: PASS — TypeScript and Vite production build.
- Added pure-logic coverage for cap resolution, cap differentiation, velocity-density behavior, and start/stop audio transitions.
- Existing hand geometry, silhouette, and canonical stroke tests remain passing.

## Current-Host Browser Verification

- Page startup with no console errors: PASS.
- Controls collapse/reopen and retained paint: PASS.
- Performance Mode from button and `P`: PASS.
- Diagnostic toggle from button and `D`, default off: PASS.
- Fullscreen control entered and exited fullscreen: PASS.
- All five presets changed the radius and produced visibly distinct mouse-rendered lines: PASS.
- Fat and High Pressure produced substantially denser cores than Skinny; Soft and Dust / Fog produced wider, lower-density treatments: PASS.
- Mouse spray and Spacebar manual spray each produced one hiss start and one hiss stop with no retrigger loop: PASS.
- Manual rattle UI/audio trigger and quiet-state recovery: PASS.
- Recording while in Performance Mode: PASS.
- Recording/export with generated hiss: PASS — one mixed audio track and a non-empty WebM blob.
- Uploaded two-second WAV playback path plus generated hiss recording: PASS — controls enabled, one mixed audio track, 26,735-byte WebM blob, no console errors.
- Silhouette implementation and its focused tests remain unchanged/passing: PASS.

The current host has no camera device, so no new camera-specific claim is made here.

## MacBook Pro Validation Required

- Pinch-to-spray remains stable and drives the selected cap plus hiss.
- Cap switching feels distinct during hand input.
- Tracking remains stable while controls/diagnostics are hidden.
- Fullscreen preserves webcam, fingertip mapping, paint, and recording.
- The enlarged unobstructed drawing space materially improves reach and usability.
- Spray/rattle loudness is comfortable alongside real uploaded music.
- Gesture fatigue remains acceptable.

## Known Limitations

- Shake sound has a manual trigger only; deliberate-hand-shake detection is deferred.
- Chisel/calligraphy orientation is deferred because V0.1 exposes fingertip position but no validated orientation signal.
- Browser autoplay policy requires a user gesture before Web Audio can run; mouse, Spacebar, camera start, record, play, and rattle controls provide that unlock path.
