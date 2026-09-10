# Spatial Spraypaint V0.5.4 Current Status

Date: 2026-09-10

Status: PARTIAL — interactive Scale controls, normalized wheel/trackpad zoom routing, and edge-driven Hand Wall motion are implemented. The full automated suite and production build pass, and available Physical/browser workflows pass on the current host. Physical Hand edge continuity and real MacBook trackpad pinch remain MacBook validation gates.

Baseline: V0.5.3.1 commit `15e2c83afaa11ce8d7fd7027784d6d6fb732f538`.

## Scope

V0.5.4 removes avoidable viewport friction without adding a second view authority or inventing off-camera Hand positions. It does not begin V0.6 Tool Architecture and does not alter the V0.5.3.1 tracking-quality warning policy.

## Interactive Scale

The persistent Scale readout is now a real compact control. Clicking it opens a three-column chooser with:

- 25%
- 50%
- 75%
- 100%
- 125%
- 150%
- 200%
- 300%
- 400%
- Reset · 100%

Every preset passes through the existing `WallView.applyZoomAroundPoint` authority. The persistent readout is formatted from the actual `WallView.zoom` value after preset, keyboard, wheel, Quick Zoom, reset, and edge-motion changes.

Reset returns to the Wall origin at 100%. A separate Fit action is intentionally omitted: the Wall is infinite and the prototype has no finite composition bounds that could define Fit without introducing a second framing concept.

The chooser is temporary and leaves the committed compact shell unchanged apart from making the existing bottom-right Scale readout useful. The current repository DOM places the art controls bottom-left, session/settings controls top-right, and Scale bottom-right. The checkpoint brief describes a right-side Tool / Color / Size / Scale rail, `•••` top-right, and WallOS / Member bottom-left, but that arrangement is not present in the V0.5.3.1 baseline. V0.5.4 does not manufacture that layout because doing so would be a separate shell redesign; the center Wall remains clear.

## Zoom Input Semantics

The centralized command registry remains authoritative:

- `+` zooms in;
- `-` zooms out;
- `0` resets the Wall origin and scale to 100%; and
- `Z` toggles Quick Zoom and restores the exact prior view.

The displayed shortcut is `+`, not `Shift + +`. Browser keyboard forms for both a direct plus key and a Shift-produced `=`/`+` resolve to the same Zoom In command.

## Trackpad And Wheel Navigation

The existing WallView authority now normalizes wheel input as follows:

- unmodified vertical/horizontal/two-axis wheel input pans;
- browser trackpad pinch events carrying Ctrl route to zoom;
- Ctrl/Cmd + wheel routes to zoom; and
- zoom is anchored to the event's pointer/focal point.

The canvas listener is non-passive and prevents default page zoom when the gesture is owned by the Wall. Zoom remains clamped to 25%–400%. Wheel navigation still runs the existing Pan cancellation path and does not create or retain Pan gesture ownership.

## Hand Safe Working Region

The normalized Hand working-region policy is centralized in `HandEdgeMotion`:

- center safe region: 20%–80% of viewport width and height;
- outer full-pressure boundaries: 6% and 94%;
- maximum screen-space Wall drift: 320 px/s;
- acceleration: 1,400 px/s²;
- inward deceleration: 1,800 px/s²;
- maximum accepted frame step: 50 ms; and
- last tracked Hand sample freshness ceiling: 140 ms.

No motion occurs in the center safe region. Between the safe boundary and outer boundary, a smooth pressure curve increases Wall drift. Left, right, up, down, and diagonal pressure combine independently.

The Wall moves opposite the approached edge so the tracked fingertip can remain within the useful camera region while canonical Wall coordinates continue in the intended direction. Returning inward decelerates the Wall to rest. Ending the pinch/drawing gesture stops assistance immediately.

These normalized constants avoid tying V0.5.4 to one display size. Future work may calibrate comfortable arm reach, webcam field of view, and external-camera differences, but no calibration system is included here.

## Continuous Stroke Invariant

Edge assistance is active only when all of the following are true:

- input mode is Hand;
- a current Hand result remains available and no older than 140 ms;
- pinch-driven Spray is actually active; and
- no pointer-owned manual Pan exists.

Edge assistance changes only `WallView.panX/panY` through the established `applyPan` function. It does not create Pan state, trigger Pan visuals, change zoom, synthesize Hand coordinates, or finalize the active stroke.

The current in-progress canonical stroke is included in render-only replay while WallView moves. That snapshot is defensive and does not finalize or split history. New points continue appending to the same stroke ID, stored point widths remain Wall-space values, and completed/current paint is reconstructed under the updated Wall transform.

The existing very short missing-sample bridge remains bounded. Edge motion does not continue once the Hand sample exceeds the 140 ms freshness ceiling and never extrapolates a Hand path through a long off-camera period.

## Tracking Quality

The V0.5.3.1 tracking-quality warning remains unchanged. It continues to use missed hands, cadence, confidence, pinch stability, and optional brightness as evidence. It may appear in apparently bright daylight when tracking reliability is degraded; it does not claim low light is the sole diagnosis.

## Automated Verification

- Focused WallView, commands, edge motion, stroke history, and interaction authority: PASS — 56/56 tests.
- TypeScript preflight: PASS.
- Final `npm test`: PASS — 23 test files, 116/116 tests.
- Final `npm run build`: PASS — TypeScript and Vite production build; 30 modules transformed.

Focused coverage verifies:

1. every Scale preset updates WallView;
2. the Scale readout formats actual WallView zoom;
3. `+`, `-`, `0`, and `Z` command semantics;
4. pointer-anchored modified-wheel zoom;
5. 25%–400% zoom bounds;
6. preserved ordinary two-axis pan;
7. center safe-zone inactivity;
8. all four edge directions;
9. increased outer-edge pressure;
10. smooth velocity acceleration and inward deceleration;
11. immediate stop when the drawing gesture ends;
12. diagonal edge motion;
13. preserved WallView zoom under edge Pan;
14. an active canonical stroke surviving transformed replay without being split;
15. unchanged Wall-space point width; and
16. the V0.5.3.1 centralized Pan/Spray authority regression matrix.

## Current-Host Browser Validation

Passed in the local browser with Physical input where applicable:

- V0.5.4 canvas-first startup and condensed shell;
- Scale opens a compact chooser fully inside a 1280 × 720 viewport;
- all nine preset selections update both the visible readout and actual navigation state;
- Reset returns pan to `0, 0` and scale to 100%;
- `+` moves 100% → 125%;
- `-` moves 125% → 100%;
- `0` resets to 100%;
- `Z` moves 100% → 200% and restores exactly to 100%;
- ordinary two-axis wheel input changed pan by both axes without changing zoom;
- Physical strokes remained drawable after navigation;
- two completed Physical strokes remained undoable after switching to 200%;
- Undo removed the latest stroke;
- Clear removed retained paint and one Undo restored it at the same 200% view; and
- no browser console warnings or errors were present.

The browser automation surface did not propagate Ctrl/Meta state on its synthesized wheel event; those attempts arrived as ordinary Pan. Pointer-anchored modified-wheel behavior is therefore proven by deterministic tests and code routing on this host, not claimed as live trackpad validation.

This host cannot validate physical Hand edge behavior. No claim is made here for a real large circle, S-curve, name, vertical/diagonal Hand stroke, or Hand tracking beyond the viewport.

## MacBook Manual Validation Checklist

After commit, push, and pull:

### Scale and navigation

1. Click Scale and select 50%, 100%, 200%, and the remaining presets.
2. Confirm Reset returns to origin at 100%.
3. Confirm `+`, `-`, `0`, and `Z`, including exact Quick Zoom restore.
4. Pinch on the trackpad around several focal points and confirm the Wall point under the pointer stays fixed.
5. Test Ctrl/Cmd + wheel zoom where appropriate.
6. Confirm two-finger vertical, horizontal, and diagonal scroll still pans.
7. Repeat `zoom → pan → spray` and confirm no navigation latch.
8. Confirm zoom never exceeds 25%–400%.

### Edge drawing

9. In healthy daylight tracking, pinch-draw a large circle that would normally exceed the right edge, then repeat at the left edge.
10. Draw a large S-curve.
11. Write a long horizontal name.
12. Draw vertical and diagonal forms toward every edge.
13. Repeatedly approach and return from each edge within one continuous pinch.
14. Confirm the Wall begins moving near the 20%/80% working boundaries, before the hand reaches the literal edge.
15. Confirm drift increases toward the outer pressure band and remains gradual rather than abrupt.
16. Confirm diagonal approaches combine both directions naturally.
17. Confirm motion decelerates when the hand returns inward and stops immediately when pinch ends.
18. Confirm each uninterrupted pinch remains one continuous stroke with no avoidable split, gap, or isolated reconnection dot.
19. Pan/zoom afterward and confirm the edge-assisted marks retain canonical Wall coordinates and stable Wall-space size.
20. Let the hand leave tracking long enough to exceed the existing short bridge; confirm no long off-camera path is invented.

### Tracking conditions

21. Test daylight first and reserve extreme-speed trials for periods when diagnostics report healthy tracking.
22. Repeat in lower light if practical and distinguish tracking degradation from edge-motion behavior.
23. Confirm the existing quality warning still auto-recovers and does not diagnose brightness as the only cause.

## Known Limitations

- Physical Hand edge continuity remains a MacBook gate.
- Real MacBook trackpad pinch and modified-wheel delivery remain a MacBook gate.
- Lower-light tracking can still degrade before edge assistance can help.
- Edge assistance can preserve a trackable near-edge gesture, but it cannot recover landmarks after the hand has genuinely left the camera frame.
- The brief's right-side Tool / Color / Size / Scale rail differs from the committed V0.5.3.1 DOM; this checkpoint preserves the committed compact shell rather than redesigning it.
- No automatic zoom, arm/FOV calibration, finite composition Fit, new transform authority, or V0.6 Tool Architecture is included.

## Exact V0.5.4 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/CommandRegistry.test.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.test.ts`
- `prototypes/spatial-spraypaint/src/WallView.ts`
- `prototypes/spatial-spraypaint/src/WallView.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/0910_SPATIAL_SPRAYPAINT_V0.5.4_CURRENT.md`
- `prototypes/spatial-spraypaint/src/HandEdgeMotion.ts`
- `prototypes/spatial-spraypaint/src/HandEdgeMotion.test.ts`

Next safe step: push this checkpoint and run the MacBook checklist. Do not begin V0.6 Tool Architecture until the edge-motion and trackpad behavior has real-device evidence.
