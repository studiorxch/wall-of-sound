# Spatial Spraypaint V0.3 Current Status

Date: 2026-09-07

Status: PARTIAL — V0.3 cap realism, smoothing, performance controls, palette, backgrounds, mouse rendering, tests, and production build pass. Long-dwell drip appearance and camera/hand behavior still require physical validation on the camera-equipped MacBook Pro.

## Scope

V0.3 extends the committed V0.2 prototype in place. It does not replace or modify the MediaPipe tracker, anonymity/silhouette processor, spray-can audio implementation, recorder implementation, persistent paint layer, or any MUSIC, AudioLab, Suno, Members, MAPS, Wall, or WallOS system.

No requested `.afpalette` files were found in the searched user project/document locations, so this checkpoint uses the permitted curated manual graffiti palette.

## Cap And Stroke System

- The single data-driven cap authority now defines 11 cap families: New York Fat, Pink Dot Fat, Astro Fat, German / Hardcore Fat, Lego Thin, Universal Thin, Level 1 / Skinny Cream, New York Thin, Calligraphy / Transversal, Needle, and Soft / Fade.
- Cap personality includes family, radius, density, opacity, edge falloff, particle count/spread/size/opacity, flow, accumulation, velocity response, jitter, endpoint behavior, splatter probability, drip tendency, and anisotropy.
- V0.2 cap identifiers remain compatibility aliases into the same cap authority; no parallel cap implementation was added.
- Core paint is deposited as continuous segments instead of repeated radial stamps. Fine particles remain distributed along each segment.
- Endpoint width variation is restrained and interpolation spacing is denser, reducing bulbous starts/stops and movement gaps without a global canvas blur.
- Stroke smoothing runs before canonical point generation and offers Off, Low, Medium, and High. Medium is the default.
- Heavy stationary accumulation can seed animated gravity drips. Drips are toggleable in the full controls, default on, and remain absent from performance-mode controls.

## Performance Space And Presentation

- Performance mode exposes direct color, cap, background, clear, record, and exit controls.
- Radius, smoothing, drips, tracking diagnostics, and other technical setup controls remain in the full panel.
- The full panel and performance HUD share selected color, cap, background, clear, and recording authorities.
- The curated palette contains black, white, silver, red, orange, yellow, green, cyan, blue, purple, and pink.
- Black, charcoal, mid-gray, and off-white backgrounds render below the persistent paint canvas. Switching backgrounds does not alter or clear graffiti.

## Automated Verification

- `npm test`: PASS — 8 test files, 23 tests.
- `npm run build`: PASS — TypeScript check and Vite production build; 19 modules transformed.
- Focused pure tests cover all cap definitions and aliases, cap differentiation, velocity/density mapping, dense canonical interpolation and endpoint width, smoothing levels, drip dwell thresholds and disable behavior, background resolution, existing hand geometry, silhouette posterization, and spray audio transitions.

## Current-Host Browser Verification

- V0.3 loaded at the local development URL with no browser console warnings or errors: PASS.
- Full control panel showed the 11-color palette, 11 caps, four smoothing levels, four backgrounds, drip toggle, and retained V0.2 controls: PASS.
- New York Fat produced a broad continuous mouse stroke without repeated circular stamp gaps: PASS.
- Needle produced a materially narrower particulate mouse line than New York Fat: PASS.
- Switching from black to off-white changed only the backdrop and retained existing paint: PASS.
- Performance mode visually reduced the UI to color, cap, background, clear, record, exit, and compact state indicators: PASS.
- Cap/background selections synchronized between full and performance controls: PASS.
- Performance color selection synchronized across both palettes: PASS.
- Performance Clear removed the persistent paint: PASS.
- Long stationary dwell and animated drip appearance: NOT LIVE-VERIFIED on this host; deterministic drip threshold tests pass.
- Spray hiss produced one start and one stop during the browser mouse stroke with no retrigger loop or console error: PASS.
- Recording started with one mixed audio track and exported a non-empty 12,986-byte `video/webm`: PASS.
- Spray audio and recording implementations were not changed. The focused transition tests prove repeated active updates do not restart a continuous hiss. The manual rattle source is unchanged and its V0.2 browser evidence remains authoritative.

## MacBook Pro Validation Required

- Compare all 11 cap personalities with real hand input at normal drawing speed.
- Confirm smoothing Off/Low/Medium/High balance responsiveness and jitter reduction under webcam input.
- Hold Needle, Pink Dot Fat, Astro Fat, and New York Fat stationary long enough to inspect accumulation and occasional drip formation; confirm fast strokes do not drip.
- Confirm fingertip tracking and pinch spray remain stable with the continuous-deposition cadence.
- Confirm Spacebar fallback, long spray hiss, rattle, uploaded music, recording, exported WebM audio, anonymity treatments, Silhouette, and fullscreen remain intact.
- Confirm the compact performance controls remain usable at the MacBook display size.

## Exact V0.3 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/CanonicalStroke.ts`
- `prototypes/spatial-spraypaint/src/CanonicalStroke.test.ts`
- `prototypes/spatial-spraypaint/src/SprayBrushEngine.ts`
- `prototypes/spatial-spraypaint/src/SprayCapPresets.ts`
- `prototypes/spatial-spraypaint/src/SprayCapPresets.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/src/Backgrounds.ts`
- `prototypes/spatial-spraypaint/src/Backgrounds.test.ts`
- `prototypes/spatial-spraypaint/src/DripLogic.ts`
- `prototypes/spatial-spraypaint/src/DripLogic.test.ts`
- `prototypes/spatial-spraypaint/src/StrokeSmoother.ts`
- `prototypes/spatial-spraypaint/src/StrokeSmoother.test.ts`
- `prototypes/spatial-spraypaint/0907_SPATIAL_SPRAYPAINT_V0.3_CURRENT.md`

## Next Safe Checkpoint

Run the MacBook Pro manual validation list and record exact results. Do not start a broader redesign or V0.4 feature checkpoint until those camera, audio, recording, drip, and performance-space observations are captured.
