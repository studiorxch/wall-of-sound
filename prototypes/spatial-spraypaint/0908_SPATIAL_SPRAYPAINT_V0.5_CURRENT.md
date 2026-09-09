# Spatial Spraypaint V0.5 Current Status

Date: 2026-09-08

Status: PARTIAL — the infinite-wall architecture, Physical drawing, precision/Quick Zoom, transformed history, resize replay, soundtrack, and recording pass on the current host. Space+drag needs a manual hold-and-drag check, and camera-specific transformed-wall behavior still requires the MacBook Pro.

## Coordinate-Space Model

V0.5 explicitly separates three spaces:

1. **Camera space:** MediaPipe/video input and the screen-fixed performer image.
2. **Screen space:** pointer/fingertip location in the current viewport.
3. **Wall space:** persistent, effectively unbounded artwork coordinates.

Physical and Hand input now follow `screen → inverse view transform → wall → canonical stroke → spray engine`. Canonical stroke points, interpolation, width, velocity, and drip seeds are stored in wall units rather than viewport pixels. The camera frame is composited in screen space; it is never transformed with the wall.

## WallView Authority

`WallView.ts` is the single pure transform authority. `WallViewState` contains `panX`, `panY`, and `zoom`, with helpers for:

- `screenToWall`
- `wallToScreen`
- screen-space pan
- zoom around a screen anchor
- safe zoom clamping from 25% to 400%
- default-view reset
- Quick Zoom toggle with exact prior-view restoration
- pointer intent routing for Space+drag/middle-drag pan

Transform math is not duplicated through the application controller.

## Infinite Wall And Rendering

- The viewport-sized paint canvas is now a render cache, not the canonical artwork authority.
- View changes and browser resizes reconstruct the cache from wall-coordinate stroke history.
- Each stroke owns a deterministic random sequence, keeping spray jitter and overspray stable across transformed replay without retuning cap dynamics.
- Correctness currently favors replaying the small retained stroke set when the view changes. Future spatial chunks/tile caches can replace the internals of `replayStrokes` without changing wall coordinates or input transforms.

## Pan And Zoom

- **Space + drag:** pans the wall and suppresses Physical/Hand spraying for the drag. Middle-drag follows the same route. Pointer events retain a path for future pointer type, pressure, and tilt work.
- **`+`:** zooms in by 1.25× around the latest working pointer/fingertip, or viewport center when none exists.
- **`-`:** zooms out by 0.8× around the same anchor.
- **`0`:** resets to pan `(0, 0)` and 100%.
- **`Z`:** toggles to a useful 200%+ detail view and then restores the exact saved composition view.
- A tiny lower-right navigation island shows current zoom; its blue state indicates that Quick Zoom has a saved return view.

The centralized `CommandRegistry` owns keydown and keyup phases, shortcut documentation, malformed-event guarding, and conflict checks. Space no longer controls soundtrack playback; the compact player button remains authoritative for play/pause.

## Brush Scaling And Background

Cap size is wall-space based. Existing marks and the physical cap footprint become larger on screen when zooming in; zoom does not silently change their real wall size.

The background is an infinite wall-attached solid field with a subtle repeating 160-wall-unit grid. It transforms with the wall, avoids blank browser void, and remains outside paint history. Camera imagery stays screen-fixed above this wall surface.

## Undo And Clear Under Transform

- Undo removes the latest canonical wall stroke and rebuilds the current transformed view.
- Clear removes all wall strokes, including offscreen regions.
- One Undo after Clear restores the complete pre-clear wall at the unchanged view transform.
- Background and navigation state remain unchanged through Undo/Clear.
- Normal consecutive Undo remains available after clear restoration.

## Automated Verification

- Focused tests: PASS — 4 files, 22 tests.
- `npm test`: PASS — 14 test files, 50 tests.
- `npm run build`: PASS — TypeScript and Vite production build; 24 modules transformed.
- Coverage includes screen↔wall transforms, inverse round-trip, pan, pan-vs-paint intent, anchor-stable zoom, zoom bounds, reset, Quick Zoom exact restore, transformed stroke projection, transformed Undo/Clear restoration, deterministic replay randomness, command start/release phases, and shortcut conflicts.

## Current-Host Browser Verification

- Physical mouse spray at 100%: PASS.
- Precision `+` / `-`: PASS — 100% → 125% → exact 100%, with anchor-derived pan adjustments.
- Reset `0`: PASS — restored `(0, 0, 100%)`.
- Quick Zoom: PASS — `(0, 0, 100%)` → anchored 200% detail → exact prior state.
- Drawing blue Needle detail at 200%, then returning to 100% with preserved relative geometry: PASS.
- Wall-space cap scaling: PASS — the original fat-cap stroke visibly doubled at 200%.
- Undo in a transformed view: PASS.
- Shift+Delete Clear and Ctrl/Command+Z restoration at 200%: PASS.
- Off-white background survived transformed Clear/Undo: PASS.
- Browser resize retained canonical stroke history and placement: PASS.
- Color and cap selection: PASS — Blue and Needle exercised.
- Local soundtrack load/play/pause: PASS — `JUG-20260424-08-A.wav`, duration 3:09.
- Recording entered and exited active/save state with the transformed compositor: PASS.
- Final fresh-tab browser console warnings/errors: none.
- Space+drag itself: NOT LIVE-VERIFIED — the browser controller cannot hold a non-modifier key across its drag action. Pure pan math, Space command press/release ownership, pan intent, pointer routing, and paint suppression are covered by focused tests; perform one manual current-host/MacBook drag check.

## MacBook Pro Validation Required

1. Enter Hand; confirm Clean camera remains visible and screen-fixed.
2. Confirm hand detection and pinch spray at the default view.
3. Hold Space and drag with mouse/trackpad while Hand remains active; confirm no paint is deposited during navigation.
4. Return to the prior region and confirm the same mark placement.
5. Zoom the wall and pinch-spray in the magnified region.
6. Zoom out and confirm correct world placement and wall-space cap size.
7. Toggle Quick Zoom twice and confirm exact composition restoration while Hand remains active.
8. Confirm the tracking cursor remains screen-relative while the wall moves beneath it.
9. Confirm soundtrack and mixed recording remain functional during transformed Hand drawing.
10. Note whether daylight continues to improve tracking quality.

## Known Limitations / Deferred Work

- Spatial chunking, tile caching, persistence, networking, and collaboration are not implemented. The current bounded history is replayed on each view change.
- No wheel/trackpad pinch zoom, touch navigation, Pencil pressure/tilt, or hand-navigation gesture was added.
- Pinch remains spray only; Hand navigation uses mouse/trackpad/keyboard.
- Quick Zoom has one saved return view. Redo and reload persistence remain out of scope.
- Active animated drips are completed from their stored canonical seeds when navigation triggers a replay.
- Camera-specific transformed-wall validation is not claimed on this host.
- MUSIC, AudioLab, Suno, Members, Subway, WallOS, cloud persistence, map placement, multi-tool work, and cap/smoothing tuning were untouched.

## Exact V0.5 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/CommandRegistry.ts`
- `prototypes/spatial-spraypaint/src/CommandRegistry.test.ts`
- `prototypes/spatial-spraypaint/src/SprayBrushEngine.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`
- `prototypes/spatial-spraypaint/src/types.ts`

Added:

- `prototypes/spatial-spraypaint/0908_SPATIAL_SPRAYPAINT_V0.5_CURRENT.md`
- `prototypes/spatial-spraypaint/src/SprayBrushEngine.test.ts`
- `prototypes/spatial-spraypaint/src/WallView.ts`
- `prototypes/spatial-spraypaint/src/WallView.test.ts`
