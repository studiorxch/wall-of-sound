# Spatial Spraypaint V0.5.1 Current Status

Date: 2026-09-09

Status: PARTIAL — fast Physical strokes, temporary pan state, wheel navigation, transformed history, soundtrack, and recording pass on the current host. Camera-dependent fast Hand writing and a physical held-Space gesture still require the MacBook Pro.

## Scope

V0.5.1 is a bounded reliability pass over the committed V0.5 infinite-wall architecture. It does not add a tool family, change cap personalities, redesign the compact shell, or implement collaboration, wallpaper, presentation framing, or export.

## Fast-Writing Finding And Repair

Two concrete continuity risks were present:

1. The render loop accepted a new deposit only every 28 ms, limiting active deposition to roughly 35 Hz even on a 60 Hz display.
2. Canonical interpolation used `floor(distance / spacing)`, so the final segment could exceed the requested maximum spacing. Spacing also did not become denser as wall-space velocity increased.

V0.5.1 changes the deposit gate to 16 ms and gives `CanonicalStrokeManager` one wall-space resampling authority:

- spacing remains proportional to the active radius;
- spacing becomes denser as velocity rises;
- `ceil` determines segment count, guaranteeing that every resampled segment stays within the resolved spacing;
- interpolated points retain canonical wall coordinates, timestamps, width, opacity, and deterministic replay order;
- spray-cap dynamics and current width semantics are unchanged;
- no global blur was added.

For Hand input, a short missing-landmark interval during an active pinch may preserve the current canonical stroke for up to 90 ms. The stale point is not deposited during the gap. If tracking returns within the bounded window, normal canonical interpolation bridges to the new point; longer gaps finalize the stroke normally.

## Hand Tracking Reliability Diagnostics

The existing optional Tracking Debug surface now separates:

- camera-frame cadence;
- MediaPipe result cadence;
- landmark cadence;
- total and consecutive missing-hand results;
- pinch-state transition count;
- wall-point delivery interval and traveled wall distance.

These values stay inside the existing hidden diagnostics panel and do not enlarge the normal canvas UI. Detection and pinch-confidence thresholds were not changed. The diagnostics are intended to distinguish camera/landmark gaps, pinch flicker, wall delivery gaps, and screen-edge degradation during the MacBook speed matrix.

## Temporary Space-Pan

Pan remains a temporary navigation override, not a selected drawing tool.

- Space-down makes pan ready.
- Space plus primary-button drag activates the temporary pan source.
- Middle-button drag uses the same temporary path.
- Space-up clears a Space-originated pan immediately, releases pointer capture, and restores the active drawing interaction.
- Pointer-up/cancel and window blur also clear the temporary gesture.
- A recent active Hand pinch is restored after navigation release without changing the selected input mode or creating a permanent Pan tool.

The pure pan-state model is generic over the active tool name so future tools can return from the override, but V0.5.1 does not implement that future tool architecture.

## Wheel Navigation

- Vertical wheel input pans vertically.
- Horizontal wheel and two-axis trackpad deltas pan naturally on both axes.
- Shift plus vertical wheel resolves to horizontal pan.
- Line/page delta modes are normalized before applying the existing screen-space pan authority.
- Ctrl/Command-wheel is not intercepted; browser zoom behavior is not overbuilt here.
- `+`, `-`, `Z`, and `0` retain their V0.5 behavior and shortcuts.

Pan and drawing remain available at the supported 25% and 400% zoom limits. No wall boundary or Infinite Wall redesign was introduced.

## Grid And Presentation Notes

The repeating grid is preserved as wall-attached navigation presentation. It is reconstructed with the current work view and remains outside canonical paint history. Future export should omit the grid by default.

Future presentation architecture must keep these concepts distinct:

- **Wall:** infinite artwork/world coordinates.
- **Work View:** the artist's current pan and zoom.
- **Presentation View:** a saved framing for wallpaper, broadcast, stream, or export.

A future wallpaper must be able to preserve a deliberately zoomed-out composition and fit/fill its target rather than resetting to a nominal 100% view. Possible saved concepts include Last Working View, Saved Presentation View, Wallpaper View, and Broadcast View. None are implemented in V0.5.1.

## Variable-Width Note For V0.6

Variable width can be introduced later without requiring Apple Pencil pressure:

1. Canonical movement velocity is already available and is the strongest cross-input baseline.
2. MediaPipe landmark Z can provide Hand depth after explicit calibration and noise filtering; it is available at the landmark source but is not part of current spray width semantics.
3. Pinch geometry and multi-landmark tool orientation can supply gesture intent after reliability validation.
4. Pointer events preserve a future path for Pencil/stylus pressure and tilt.

Recommendation: V0.6 should define one tool-owned width policy that consumes normalized input evidence, while canonical strokes continue to store the resolved width. Do not put input-specific width rules directly into the renderer.

## Automated Verification

- Baseline before changes: PASS — 14 files, 50 tests.
- Focused reliability suite: PASS — 5 files, 31 tests.
- `npm test`: PASS — 15 files, 58 tests.
- `npm run build`: PASS — TypeScript and Vite production build; 25 modules transformed.

Coverage includes velocity-aware resampling, a large point gap with bounded segment spacing, a bounded missing-sample bridge, independent cadence/gap metrics, pinch-transition counting, temporary Space-pan restoration, future-tool restoration behavior, middle-button release, vertical/horizontal/Shift-wheel pan, coordinate transforms, transformed replay, Undo/Clear, and shortcut conflicts.

## Current-Host Browser Verification

- Slow Physical stroke: PASS.
- Deliberately sparse, fast full-width Physical stroke: PASS — continuous core with no visible deposition-circle chain or gap.
- Vertical wheel pan: PASS.
- Horizontal/two-axis wheel pan: PASS.
- Draw immediately after wheel navigation: PASS.
- Pan and resumed drawing at 25% minimum zoom: PASS.
- Pan and resumed drawing at 400% maximum zoom: PASS.
- Transformed Clear and one-step Undo restoration at 400%: PASS; view state stayed exact.
- Background/grid remained navigation presentation outside stroke history: PASS.
- Local soundtrack load/play/pause: PASS.
- Recording entered and exited active/save state: PASS.
- Browser console warnings/errors: none.
- Held Space+drag and Shift-wheel: NOT LIVE-VERIFIED — the browser controller cannot hold those keyboard states through its drag/scroll actions. Their state transitions and pan deltas pass focused tests; verify the physical gestures on the MacBook.

## MacBook Pro Manual Matrix

Do not claim Hand reliability complete until the following camera tests are recorded:

1. Slow Hand movement.
2. Medium Hand movement.
3. Fast tag-style Hand movement.
4. Fast movement near every screen edge.
5. Fast movement with music playing.
6. Fast movement while recording.

For each, note camera/result cadence, missing-hand counts, pinch transitions, wall-point interval/distance, tracking continuity, pinch continuity, line continuity, and obvious dropped sections.

Also verify Space-pan → Space release → immediate Hand pinch-spray, Shift-wheel horizontal pan, transformed Hand placement, screen-fixed camera/cursor behavior, Quick Zoom restoration, and daylight performance.

## Exact V0.5.1 Files

Changed:

- `WOS-share/SPATIAL SPRAYPAINT/SPATIAL SPRAYPAINT V0.5.md`
- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/CanonicalStroke.ts`
- `prototypes/spatial-spraypaint/src/CanonicalStroke.test.ts`
- `prototypes/spatial-spraypaint/src/HandTracker.ts`
- `prototypes/spatial-spraypaint/src/WallView.ts`
- `prototypes/spatial-spraypaint/src/WallView.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/0908_SPATIAL_SPRAYPAINT_V0.5.1_CURRENT.md`
- `prototypes/spatial-spraypaint/src/HandTrackingReliability.ts`
- `prototypes/spatial-spraypaint/src/HandTrackingReliability.test.ts`
