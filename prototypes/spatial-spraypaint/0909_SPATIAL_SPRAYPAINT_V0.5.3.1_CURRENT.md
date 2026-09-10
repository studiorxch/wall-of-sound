# Spatial Spraypaint V0.5.3.1 Current Status

Date: 2026-09-10

Status: PARTIAL — the Pan/Spray authority defect is repaired, tracking-quality feedback is implemented, 100/100 automated tests pass, and the production build passes. Browser live validation was unavailable because automatic security review denied access to the local application. Physical Hand validation remains MacBook-only.

Baseline: V0.5.3 commit `f5d699d6ee74c634196168750b0987577d7e118c`.

## Scope

V0.5.3.1 is a bounded reliability patch. It does not add the Scale chooser, trackpad pinch zoom, Ctrl/Cmd + wheel zoom, a new transform authority, a new tool architecture, or V0.6 work.

The checkpoint contains:

- one centralized interaction authority for Pan versus Spray;
- normalization of stale Pan ownership;
- common paint and spray-audio permission;
- Pan visuals driven only by active navigation ownership;
- subtle, delayed, self-recovering Hand tracking-quality feedback; and
- throttled low-resolution frame-brightness evidence for hidden diagnostics.

## Pan Root Cause

V0.5.3 split navigation authority across several conditions. The visible/effective tool was primarily derived from the Pan source, while Hand drawing and spray audio were separately suppressed by `spaceHeld || pan source`.

After a temporary Space-pan ended, an invalid state could remain:

`pinch active + stale Space armed + no pointer-owned Pan`

In that state the Hand cursor and pinch could return, but the stale `spaceHeld` flag still blocked paint and spray audio. A separate `pan-ready` visual could also imply Pan even though no navigation gesture owned the pointer.

## Centralized Navigation Authority And Normalization

`InteractionAuthority` is now the single decision point for Pan versus Spray. It receives the drawing tool, spray intent, `PanInteractionState`, and whether a Pan pointer is actually active, then derives:

- the normalized Pan state;
- active navigation owner;
- Pan gesture and Pan visual state;
- effective tool;
- paint permission;
- spray-audio permission; and
- whether paint is suppressed.

The normalization rule is exact:

`Pan source present + no active Pan pointer → reset Pan state to idle`

An armed `spaceHeld` flag by itself is not an active navigation gesture and cannot suppress Hand paint or spray audio. Paint and audio share the same grant: spray intent is allowed whenever no actual Pan pointer owns navigation. Pan visuals are shown only while that real navigation ownership exists.

Pointer-up now clears the entire temporary Pan interaction. The main runtime also applies the centralized authority during pointer movement, Hand results, Hand resume, paint deposition, and visual/diagnostic updates. If a stale Pan owner is observed, it is normalized immediately and the runtime logs that Spray paint and audio were restored.

The architectural invariant remains:

`navigation cannot outlive the input gesture that invoked it`

## Tracking-Quality Warning

Hand mode now derives `GOOD`, `DEGRADED`, or `POOR` tracking quality from observable reliability evidence:

- missed-hand runs;
- MediaPipe result cadence;
- landmark cadence;
- tracking confidence;
- pinch transition instability; and
- optional frame-brightness evidence.

The user-facing warning is intentionally subtle:

`💡 Hand tracking is struggling. Improve lighting or increase hand/background contrast.`

It appears only after 900 ms of sustained degraded/poor evidence and automatically hides after 1,400 ms of stable good evidence. It does not claim low light is the sole cause. Brightness is one supporting signal alongside cadence, misses, confidence, and pinch stability.

Tracking Debug reports quality, evidence, frame brightness, and the centralized paint-authority result. The cursor's spraying state reflects actual granted spray state rather than raw pinch alone.

## Brightness Sampling

Frame brightness is sampled from a private 16 × 12 diagnostic canvas no more than once every 500 ms. It is used only as tracking-quality evidence. Camera frames remain private to Hand tracking and are not rendered or recorded by default.

## Segmentation And Runtime Boundaries

Normal Hand runtime still performs zero Selfie Segmentation inference. `main.ts` does not import or instantiate `PersonSegmenter`, `CameraEnvironmentProcessor`, or the performer compositor.

The V0.5.2 segmentation modules and their tests remain preserved for a future explicitly bounded revisit, and the pinned dependency remains installed. They have no primary UI or runtime entry point in V0.5.3.1.

## Automated Verification

- Focused authority, tracking-quality, luminance, navigation, and Hand-reliability checks: PASS — 39/39 tests.
- TypeScript preflight: PASS.
- Final `npm test`: PASS — 22 test files, 100/100 tests.
- Final `npm run build`: PASS — TypeScript and Vite production build; 29 modules transformed.

The authority suite reproduces the original invalid state and proves:

1. stale Space Pan ownership is normalized;
2. armed Space without pointer-owned Pan cannot suppress paint or audio;
3. actual pointer-owned Pan suppresses both paint and audio;
4. Pan visuals follow actual navigation ownership; and
5. twenty repeated Pan/resume cycles restore Hand paint and audio.

The quality suite verifies classification, delayed warning display, and automatic recovery. The luminance suite verifies normalized sampling evidence without asserting lighting as a definitive cause.

## Current-Host Validation

Browser live validation is not claimed for this checkpoint. Access to the local application was attempted but denied by automatic security review, so no bypass or alternate browser-control route was used.

Deterministic tests and the successful TypeScript/Vite production build are the current-host proof for V0.5.3.1. Existing V0.5.3 live evidence remains historical evidence for that committed checkpoint; it is not represented as a V0.5.3.1 browser pass.

This host does not provide the physical camera needed to validate real Hand frames, landmarks, pinch spray, post-Pan Hand recovery, or tracking-quality warning behavior under actual lighting conditions.

## MacBook Manual Validation Checklist

After commit, push, and pull:

1. Enter Hand and confirm the camera remains a private sensor: no performer/camera frame is rendered or recorded.
2. Confirm the fingertip cursor follows the hand and pinch toggles visibly.
3. Confirm pinch spray produces paint and spray hiss together.
4. Hold Space, perform a Pan drag, release the pointer, then release Space; confirm Pan visuals clear and pinch paint/audio resume immediately.
5. Reproduce the former edge case by ending Pan while the hand remains pinched; confirm no stale Space state blocks paint or audio.
6. Repeat `pinch spray → Space pan → release → pinch spray` at least fifteen times.
7. Confirm cursor spraying state, visible paint, hiss, and Paint Authority diagnostics always agree.
8. Interrupt Pan with pointer cancellation, window blur, or visibility loss where practical; confirm navigation cannot remain latched.
9. Confirm Hand marks retain wall coordinates through Pan, precision zoom, and Quick Zoom restore.
10. Observe Tracking Debug in stable daylight; confirm quality remains GOOD and no warning appears spuriously.
11. Create temporary occlusion, rapid hand loss, or poor contrast; confirm the warning appears only after sustained evidence and reports the corresponding evidence.
12. Restore stable tracking; confirm the warning clears automatically after recovery.
13. Try lower light if practical; confirm brightness appears as supporting evidence rather than being presented as the only cause.
14. Draw fast curves and writing with music playing; note missed-hand frames, cadence, pinch stability, paint continuity, and any audio/paint disagreement.
15. Record a Hand session and confirm the final Wall/paint composite and mixed audio remain correct without camera/performer imagery.
16. Confirm there is no Selfie Segmentation initialization, inference, result, or error activity in the console.

## Known Limitations

- The security denial prevented a V0.5.3.1 browser regression on the current host.
- Physical camera and Hand validation remain a MacBook gate.
- Frame brightness is deliberately approximate diagnostic evidence, not a calibrated lighting measurement.
- Extreme-speed Hand drawing remains subject to the documented tracker/camera cadence limit.
- No Scale chooser, preset scale menu, trackpad pinch zoom, Ctrl/Cmd + wheel zoom, new transform authority, or V0.6 Tool Architecture is included.

## Exact V0.5.3.1 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/0909_SPATIAL_SPRAYPAINT_V0.5.3.1_CURRENT.md`
- `prototypes/spatial-spraypaint/src/CameraLuminance.ts`
- `prototypes/spatial-spraypaint/src/CameraLuminance.test.ts`
- `prototypes/spatial-spraypaint/src/InteractionAuthority.ts`
- `prototypes/spatial-spraypaint/src/InteractionAuthority.test.ts`
- `prototypes/spatial-spraypaint/src/TrackingQuality.ts`
- `prototypes/spatial-spraypaint/src/TrackingQuality.test.ts`

## Next Bounded UX Checkpoint

The next pass should extend the existing view/transform authority with:

- a clickable Scale control;
- a preset scale chooser;
- `+`, `-`, `0`, and `Z` commands;
- trackpad pinch zoom;
- Ctrl/Cmd + wheel zoom;
- pointer-anchored zoom; and
- preservation of ordinary two-axis Pan.

It must not create a new transform authority or begin V0.6 Tool Architecture.
