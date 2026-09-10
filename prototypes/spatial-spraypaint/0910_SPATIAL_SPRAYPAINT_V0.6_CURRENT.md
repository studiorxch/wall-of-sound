# Spatial Spraypaint V0.6 Current Status

Date: 2026-09-10

Status: PARTIAL — shared Tool architecture, the preserved Spray Can, and Round, Chisel, and Mop Paint Marker variants are implemented. The full 137/137 automated suite, TypeScript, production build, and available current-host Physical/browser workflows pass. Physical Hand validation remains a MacBook gate.

Baseline: V0.5.4 commit `7cdee18d1329929ba95b1e0ca6edfb7a88c9d5b0`.

## Scope And Purpose

V0.6 stops treating Spray as the only possible mark-maker while preserving the mature V0.5.4 infinite Wall, view/navigation authority, canonical stroke reconstruction, history, recording, soundtrack, and Hand sensor path.

The authoritative flow is:

```text
Physical or Hand input
→ selected Tool authority
→ shared smoothing / adaptive reconstruction / canonical stroke
→ selected Tool renderer
→ infinite Wall
```

`Pan` is a temporary interaction authority, not a Tool. Edge-driven Wall motion remains view/navigation behavior, not a Tool. The history, Wall view, Undo/Clear, and final-composite recorder are Tool-agnostic. Spray remains one renderer and one material-feedback implementation; it no longer owns the shared drawing pipeline.

## Tool Authority

`DrawingTool` is the single selected Tool authority. Its definitions declare Tool identity, family, cursor intent, renderer, contextual parameter label, feedback behavior, supported inputs, and whether future generated input is accepted.

The two V0.6 Tool families are:

- Spray Can — aerosol renderer, contextual Cap parameter, Spray hiss feedback;
- Paint Marker — dedicated marker renderer, contextual Marker / Nib parameter, intentionally silent material audio.

Physical (`mouse`, including pointer/trackpad-facing behavior) and Hand (`spatial`) both resolve the same selected Tool. There are no parallel Spray-versus-Marker input, view, or history systems. Tool selection preserves shared Color, Size, Scale, Wall view, history, and the remembered contextual variant in each family.

The Tool API records that the current tools can accept future generated input without implementing Waveformer or another generator. Future Pencil pressure/tilt can extend normalized input and marker orientation without replacing Tool, history, or Wall authority.

## Spray Preservation

The existing `SprayBrushEngine`, Cap presets, adaptive curve reconstruction, fast-stroke repair, seeded replay, Wall-space sizing, drip policy, hiss/rattle, and recording path remain in place. V0.6 dispatches Spray strokes into that existing renderer and does not retune a Cap or change aerosol dynamics.

The deterministic Spray seed remains the retained canonical stroke ID passed through `createStrokeRandom`. Browser validation confirmed the existing visible core/overspray behavior and Astro Fat Cap switching; console evidence confirmed hiss start/stop and rattle behavior.

## Paint Marker

Paint Marker uses a renderer distinct from Spray and never invokes aerosol overspray particles.

Implemented variants:

- **Round Marker** — a dense, mostly opaque, rounded continuous core with subtle speed thinning and no aerosol particles;
- **Chisel / Calligraphy** — a fixed-angle anisotropic nib whose visible width changes with stroke direction; Physical and Hand both use movement direction in V0.6;
- **Mop / Drip Mop** — a broad three-pass wet core with edge streaking, speed thinning, high accumulation/drip tendency, and the shared gravity-drip lifecycle.

Marker geometry is deterministic. Chisel direction/orientation is derived only from canonical movement in this checkpoint. No Hand-pose orientation and no Pencil tilt/pressure authority are added.

## Canonical Mixed-Tool History

Each recorded stroke retains:

- Tool ID;
- Tool-specific variant ID (Cap or Marker/Nib);
- color;
- user-facing size in Wall units;
- input source;
- stable stroke ID used as the deterministic Spray seed; and
- canonical Wall points containing timestamp, velocity, width, and opacity.

The stored canonical points are the output of the shared smoothing/reconstruction path, so renderer implementation details do not need serialization. Pressure is not currently available and is not fabricated.

Replay dispatches each stroke to its retained Tool renderer. Mixed Spray, Round, Chisel, and Mop history therefore survives Pan/zoom, resize replay, bounded multi-step Undo, Clear, and one-step Clear restoration without changing Tool or Wall authority.

## Navigation And Edge Motion

The V0.5.4 Wall transform remains the only view authority. Interaction authority now uses the generic terms `drawingIntent`, `drawingAllowed`, `materialFeedbackAllowed`, and `drawingSuppressed`; its Pan ownership and stale-state normalization are unchanged.

Hand edge motion consumes `drawingActive` rather than Spray-specific state. It changes only WallView while the shared active canonical stroke remains open, so every continuous Tool can use the same assistance. Focused tests cover both Spray Can and Paint Marker and confirm Tool selection is unchanged. No new transform authority or Pan latch path was added.

## Contextual Controls

The actual committed V0.5.4 shell is preserved. Its art island remains bottom-left, session/settings remain top-right, Scale remains bottom-right, and the center Wall remains clear. The older brief's right-side Tool / Color / Size / Scale rail is a future visual direction, not a V0.6 retrofit.

The compact art island now shows Tool, shared Color, and one contextual variant control:

- Tool opens a two-choice Spray Can / Paint Marker chooser;
- Spray Can makes the variant control open the existing Cap chooser;
- Paint Marker makes the same control open the Round / Chisel / Mop chooser;
- only the relevant chooser opens; and
- selected state, accessible labels, and tool/variant titles update together.

Size remains one shared Wall-unit authority in Settings, and Scale remains the existing WallView control. No permanent multi-row or Photoshop-style toolbar was added.

## Material Feedback

`ToolFeedback` separates drawing permission from a specific sound implementation:

- Spray Can maps an active allowed gesture to hiss and keeps the existing rattle test;
- Paint Marker reports `MARKING` state but remains silent because no appropriate asset exists;
- ending drawing stops active Tool feedback; and
- recording continues to consume the existing mixed audio output independently of Tool rendering.

Audio feedback remains material/state feedback rather than decoration.

## Automated Verification

- Focused Tool/renderer/marker/history/interaction/edge/audio checks: PASS — 45/45 tests.
- TypeScript preflight: PASS.
- Final `npm test`: PASS — 27 test files, 137/137 tests.
- Final `npm run build`: PASS — TypeScript and Vite production build; 34 modules transformed.

Coverage includes canonical Tool selection; Pan exclusion; shared Physical/Hand routing; contextual Cap versus Marker/Nib presentation; Spray renderer dispatch and seeded replay regression; Round non-aerosol output; Chisel anisotropy/direction; deterministic marker geometry; Mop speed thinning/wet passes/high drip authority; mixed-tool replay/Undo/Clear restoration; transformed Wall coordinates; view-independent history; shared material feedback; and Tool-agnostic edge motion.

## Current-Host Browser Validation

Passed at 1280 × 720 with Physical input where the automation surface permits:

- V0.6 loads with the compact V0.5.4 shell and a clear central Wall;
- Tool chooser exposes only Spray Can and Paint Marker and shows selected state;
- Spray shows only the Cap chooser; Paint Marker shows only the Marker / Nib chooser;
- shared Color, Size authority, Scale, and the selected Wall view survive Tool switching;
- Round Marker rendered dense opaque marks without aerosol behavior;
- Chisel horizontal, vertical, and diagonal marks showed clearly different broad/narrow widths;
- Mop rendered a visibly broader wet multi-pass core;
- Astro Fat selection retained the existing Spray core/overspray presentation;
- mixed-tool Undo removed the latest stroke;
- Clear removed the retained Wall and one Undo restored the exact prior captured frame;
- the same Clear/restore result was byte-identical while zoomed to 200% and panned;
- ordinary two-axis wheel input changed Wall pan without changing zoom;
- Quick Zoom moved 200% → 400% and restored the exact prior zoom and pan;
- drawing remained available after navigation with no Pan visual latch;
- Spray rattle changed the feedback state to `RATTLE` and settled to `QUIET`;
- soundtrack load, play, pause, and loop toggle passed with a local four-second WAV fixture;
- mixed Marker/Spray recording started with one mixed audio track and produced a 72,064-byte `video/webm` export; and
- no application warnings or errors were present in the browser console.

Browser automation compresses pointer movement into intervals too short for a meaningful claim about long continuous fast curves or stationary Mop dwell. It also cannot exercise camera-driven Hand edge motion on this host. Those behaviors are covered by deterministic curve, marker, drip, history, and edge-motion tests, but physical feel remains a MacBook gate. The in-app browser did not expose the generated download as a download event, although application state returned to idle and the recorder logged the completed non-empty WebM export.

## MacBook Manual Validation Checklist

After commit, push, and pull:

### Hand and Tool routing

1. In Hand mode, choose Spray Can and confirm the existing pinch-to-spray behavior, hiss, fast writing, and tracking warning are unchanged.
2. Switch to Round Marker without leaving Hand; pinch-write a name, fast line, large circle, and S-curve.
3. Confirm Round remains opaque and continuous without aerosol particles.
4. Switch to Chisel; test horizontal, vertical, diagonal, loop, corner, and large-letter gestures.
5. Confirm direction-derived broad/narrow behavior feels controllable without requiring wrist-pose orientation.
6. Switch to Mop; test slow, fast, and stationary gestures and confirm wet accumulation/drips.

### Mixed session and Wall behavior

7. Repeat Spray → Round → Chisel → Mop → Spray while changing shared Color and Size.
8. Confirm the selected Tool never becomes confused with Pan.
9. Draw every Tool toward all Wall edges and confirm edge-driven Wall motion continues the active mark without changing Tool or latching Pan.
10. Test Scale presets, trackpad Pan/zoom, Quick Zoom exact restore, and draw immediately after navigation.
11. Undo repeatedly across Tool boundaries.
12. Clear the mixed Wall and Undo once to restore it.
13. Pan/zoom/resize and confirm every retained Tool replays with stable Wall coordinates, size, and identity.

### Audio and recording

14. Confirm Spray hiss begins/ends with allowed Spray gestures and the rattle remains Spray-only.
15. Confirm Paint Marker is silent while its UI reports marking state.
16. Load music, record a mixed-tool performance, and confirm the final WebM contains the visible composite plus music and Spray audio.
17. Confirm camera remains sensor-only and performer segmentation does not return.
18. Inspect the browser console for warnings/errors throughout.

## Known Limitations And Deferred Work

- Real Hand routing and feel for all marker variants require the MacBook camera.
- Long continuous fast marker curves, stationary Mop dwell/drips, and physical edge-assisted continuation require human-timed MacBook validation.
- Chisel uses movement direction with a fixed nib angle; Hand-pose control and Pencil tilt/pressure are deferred.
- Paint Marker intentionally has no fabricated contact sound.
- The canonical point model has no real pressure value until an input source provides one.
- History remains intentionally bounded rather than becoming a giant editing system.
- The committed compact shell is preserved; the newer right-side condensed rail remains future visual work.
- Waveformer is the next possible generated-input proof, but it is not implemented. Sticker, Fire Extinguisher, Roller, Black Book, collaboration, and GraffitiBot are also out of scope.
- Performer segmentation modules remain preserved but have no primary runtime entry point.

## Exact V0.6 Files

Changed:

- `prototypes/spatial-spraypaint/index.html`
- `prototypes/spatial-spraypaint/package.json`
- `prototypes/spatial-spraypaint/package-lock.json`
- `prototypes/spatial-spraypaint/src/HandEdgeMotion.test.ts`
- `prototypes/spatial-spraypaint/src/InteractionAuthority.ts`
- `prototypes/spatial-spraypaint/src/InteractionAuthority.test.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.ts`
- `prototypes/spatial-spraypaint/src/StrokeHistory.test.ts`
- `prototypes/spatial-spraypaint/src/main.ts`

Added:

- `prototypes/spatial-spraypaint/0910_SPATIAL_SPRAYPAINT_V0.6_CURRENT.md`
- `prototypes/spatial-spraypaint/src/DrawingTool.ts`
- `prototypes/spatial-spraypaint/src/DrawingTool.test.ts`
- `prototypes/spatial-spraypaint/src/DrawingToolRenderer.ts`
- `prototypes/spatial-spraypaint/src/DrawingToolRenderer.test.ts`
- `prototypes/spatial-spraypaint/src/PaintMarkerEngine.ts`
- `prototypes/spatial-spraypaint/src/PaintMarkerEngine.test.ts`
- `prototypes/spatial-spraypaint/src/ToolFeedback.ts`
- `prototypes/spatial-spraypaint/src/ToolFeedback.test.ts`

Next safe step: push the checkpoint, pull it on the MacBook, and complete the physical checklist. Only after that evidence should a separate bounded Waveformer or visual-shell checkpoint begin.
