# 0804C — Full Canvas, Pulse Truth, and Drum Layer Foundation

**Document:** `0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0`  
**Status:** Ready for implementation  
**Product:** `MUSIC → AudioLab → Glyph`  
**Build name:** `0804C — Full Canvas, Pulse Truth, and Drum Layer Foundation`

---

# 1. Objective

Correct the foundational limitations now visible in Glyph Notes:

1. The full track is not translated into notation.
2. The notation does not remain fully visible inside the canvas.
3. Connected humps do not consistently form a true continuous `mmmm` path.
4. Individual drum hits are not represented independently from the pulse manuscript.

Required result:

```text
full-duration audio
→ complete pulse grid
→ one pulse per hump
→ continuous connected section paths
→ complete square or portrait canvas
→ separate drum-event layer
```

---

# 2. Product Intent

Glyph Notes must let a listener visually follow an entire composition from beginning to end.

The manuscript layer is not a waveform and not traditional music notation. It should provide:

- complete temporal coverage;
- readable pulse continuity;
- section structure;
- live playhead following;
- optional rhythmic detail;
- square and portrait layouts;
- deterministic SVG export.

The pulse manuscript and drum-event layer must remain separate.

```text
Pulse manuscript = temporal reading line
Drum layer       = detailed rhythmic events
```

---

# 3. Current Problems

## 3.1 Incomplete song coverage

A track may report fewer detected beats than expected from:

```text
duration × BPM
```

Detected beat events currently determine how much notation is generated. This causes the translated region to stop before the song ends and produces incomplete manuscripts.

## 3.2 Canvas clipping

Notation can extend beyond the right or bottom edge. The user cannot reliably see the entire square or portrait canvas.

## 3.3 Incorrect hump continuity

The current path system joins independently generated glyphs. This can produce crossings, tails, hooks, doubled baselines, and shapes that do not read as `mmmm`.

## 3.4 Missing drum detail

The pulse grid represents musical time, but it does not represent every drum hit. Drum hits can occur on pulses, between pulses, multiple times inside one pulse, as ghost notes, or as breakbeat subdivisions.

---

# 4. Scope

## Included

- full-duration pulse-grid construction;
- detected-beat alignment;
- expected/detected/synthesized pulse diagnostics;
- one pulse per arch;
- continuous shared-endpoint `mmmm` path generation;
- section-based path breaks;
- square and portrait canvas presets;
- full-canvas fit mode;
- no horizontal or vertical clipping;
- responsive preview scaling;
- separate drum-event data model;
- drum-stem-first onset detection architecture;
- full-mix fallback architecture;
- diagnostic drum markers;
- live playhead alignment;
- deterministic persistence and SVG output;
- tests and completion reporting.

## Excluded

- drum-class recognition as kick/snare/hat;
- advanced stem generation changes;
- manual drum editing;
- square spiral rendering;
- timeline/storyboard mode;
- prompt attachment;
- animated cover rendering;
- AxiDraw execution;
- stem waveform UI;
- automatic section-detection redesign;
- MIDI transcription.

---

# 5. Required Pipeline

```text
Track Audio
→ Duration + Confirmed BPM
→ Beat Anchor Detection
→ Full-Duration Pulse Grid
→ Per-Pulse Feature Mapping
→ Continuous Pulse-Run Geometry
→ Section-Aware Layout
→ Full Canvas Fit
→ Drum Event Detection
→ Layered Preview
→ Persistence
→ Deterministic SVG Export
```

The pulse manuscript and drum events share time, but not geometry.

---

# 6. Pulse Truth

## 6.1 Core Rule

The full track duration determines the pulse-grid extent.

Detected beats may refine grid phase and timing, but must not determine whether pulses exist.

```text
confirmed BPM + duration
→ complete pulse grid
```

## 6.2 Expected Pulse Count

```ts
expectedPulseCount = Math.floor((durationSeconds * confirmedBpm) / 60);
```

Recommended grid:

```ts
pulseTime[n] = phaseOffset + n * secondsPerPulse;
```

Include every pulse where:

```ts
pulseTime[n] < durationSeconds;
```

## 6.3 Seconds Per Pulse

```ts
secondsPerPulse = 60 / confirmedBpm;
```

This first slice treats one pulse as one quarter-note beat. Subdivision support is deferred.

## 6.4 Confirmed BPM

Pulse truth must require one of:

- trusted manual BPM;
- accepted BPM candidate;
- existing confirmed beat grid;
- explicit user confirmation.

If BPM is unconfirmed, show a fallback state and do not silently generate a final manuscript.

## 6.5 Phase Alignment

Recommended method:

1. Normalize detected timestamps modulo `secondsPerPulse`.
2. Find the dominant or median phase.
3. Select the phase offset minimizing aggregate distance to detected anchors.
4. Clamp the first grid pulse near track start.
5. Generate the complete grid through track end.

## 6.6 Anchor Correction

Detected beats may refine individual pulse times only within a limited tolerance.

```ts
maxAnchorAdjustmentSeconds = secondsPerPulse * anchorAdjustmentRatio;
```

Recommended default:

```text
0.15 pulse
```

Anchor correction must not change pulse count, reverse order, collapse neighbors, or truncate the track.

## 6.7 Synthesized Pulses

Every grid pulse without a nearby detected beat is marked:

```ts
source: "synthesized"
```

Detected or aligned pulses are marked:

```ts
source: "detected" | "aligned"
```

---

# 7. Pulse Data Model

```ts
export type PulseSource =
  | "detected"
  | "aligned"
  | "synthesized";

export type PulseTruthUnit = {
  id: string;
  index: number;
  timeSeconds: number;
  durationSeconds: number;
  barIndex: number;
  beatInBar: number;
  sectionId: string | null;
  phraseId: string | null;
  source: PulseSource;
  sourceBeatId?: string;
  energy: number;
  attack: number;
  confidence?: number;
};
```

```ts
export type PulseTruthResult = {
  durationSeconds: number;
  confirmedBpm: number;
  secondsPerPulse: number;
  phaseOffsetSeconds: number;
  expectedPulseCount: number;
  detectedAnchorCount: number;
  alignedPulseCount: number;
  synthesizedPulseCount: number;
  coverageStartSeconds: number;
  coverageEndSeconds: number;
  coveragePercent: number;
  pulses: PulseTruthUnit[];
  warnings: PulseTruthWarning[];
};
```

---

# 8. Pulse Diagnostics

Expose:

```text
Track duration
Confirmed BPM
Seconds per pulse
Expected pulses
Detected anchors
Aligned pulses
Synthesized pulses
Generated arches
Placed arches
Visible arches
Coverage start
Coverage end
Coverage percentage
Rows
Pages
```

Required invariant:

```text
expected pulses = generated arches = placed arches = visible arches
```

Coverage must reach 100% within one pulse interval of track end.

---

# 9. Continuous `mmmm` Geometry

## 9.1 Core Rule

A connected run must be generated as one continuous path.

Do not generate complete isolated arches and then add connector paths.

Required:

```text
shared endpoint
→ next arch start
```

For adjacent pulse arches:

```ts
arch[n].end === arch[n + 1].start
```

within floating-point tolerance.

## 9.2 Arch Segment

Each pulse contributes:

```text
baseline start
→ rise
→ crest
→ descend
→ shared baseline endpoint
```

## 9.3 Continuous Run

```ts
export type ContinuousGlyphRun = {
  id: string;
  sectionId: string | null;
  pulseIds: string[];
  pathCommands: GlyphPathCommand[];
  startPoint: Point;
  endPoint: Point;
  bounds: Bounds;
};
```

## 9.4 Arch Geometry

```ts
export type PulseArchGeometry = {
  pulseId: string;
  start: Point;
  crest: Point;
  end: Point;
  width: number;
  height: number;
  asymmetry: number;
  tension: number;
};
```

## 9.5 Shared-Endpoint Construction

1. Determine baseline point for pulse `n`.
2. Use that point as `start`.
3. Compute crest using mapped width, height, and asymmetry.
4. Determine next baseline point.
5. Use next baseline point as `end`.
6. Reuse the same `end` as the next arch `start`.
7. Build one path for the entire run.

## 9.6 Section Boundaries

A new section starts a new run.

```text
Section A: mmmmmmmmmmmm
Section B: mmmmmmmm
Section C: mmmmmmmmmmmmmm
```

## 9.7 Bar Punctuation

Bar punctuation must not alter pulse count. A dot or gap may be placed after the last pulse of a bar at the shared baseline.

## 9.8 Handmade Variation

Variation may affect crest height, asymmetry, local width, baseline drift, and curvature tension. Variation must not break shared endpoints.

---

# 10. Geometry Acceptance Rules

The continuous path must:

- read as repeated lowercase `m` humps;
- avoid accidental X crossings;
- avoid open tails inside connected runs;
- avoid doubled connectors;
- preserve chronological order;
- create one continuous path per run;
- break only at configured structural or layout boundaries.

---

# 11. Canvas System

## 11.1 Canvas Presets

```ts
export type GlyphCanvasShape = "square" | "portrait";
```

Recommended logical sizes:

```text
Square:   3000 × 3000
Portrait: 2400 × 3000
```

## 11.2 Safe Area

```ts
export type CanvasInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
```

All glyph geometry must remain inside the safe area.

## 11.3 Viewport Modes

```ts
export type GlyphViewportMode =
  | "fitCanvas"
  | "fitWidth"
  | "actualSize";
```

Default:

```text
fitCanvas
```

## 11.4 Fit Canvas Behavior

The entire canvas boundary remains visible in the preview. No internal scrollbars in `fitCanvas`.

## 11.5 Workspace Maximization

- allow controls to collapse;
- keep controls compact;
- let preview use remaining width and height;
- preserve bottom transport visibility;
- show the full canvas boundary.

---

# 12. Manuscript Layout

```ts
export type FullCanvasLayoutInput = {
  canvas: GlyphCanvasPreset;
  pulses: PulseTruthUnit[];
  runs: ContinuousGlyphRun[];
  preferredPulsesPerRow?: number;
  minPulseWidth: number;
  maxPulseWidth: number;
  rowGap: number;
  sectionGap: number;
  safeArea: CanvasInsets;
};
```

```ts
export type FullCanvasLayoutResult = {
  placedRuns: PlacedGlyphRun[];
  pulseWidth: number;
  rowHeight: number;
  rowCount: number;
  contentBounds: Bounds;
  canvasBounds: Bounds;
  safeBounds: Bounds;
  overflowRight: number;
  overflowBottom: number;
  allPulsesPlaced: boolean;
  allPulsesVisible: boolean;
};
```

## Auto-Fit Algorithm

1. Calculate safe width and height.
2. Estimate candidate pulses per row.
3. Calculate required row count.
4. Calculate required row height.
5. Reduce pulse width and row height until all rows fit.
6. Reject candidates producing overflow.
7. Choose the largest legible candidate that fits.
8. Place every pulse.
9. Verify final bounds.
10. Fail closed if any pulse is missing.

## No-Clipping Invariants

```text
contentBounds.left   >= safeBounds.left
contentBounds.top    >= safeBounds.top
contentBounds.right  <= safeBounds.right
contentBounds.bottom <= safeBounds.bottom
```

## Row Wrapping

At row wrap:

- close the current path;
- start a new path on the next row;
- preserve section identity;
- do not connect across rows;
- do not lose pulses.

---

# 13. Canvas UI

## Controls

### Canvas shape

```text
Square
Portrait
```

### View

```text
Fit canvas
Fit width
Actual size
```

### Zoom

```text
–
percentage
+
Reset
```

### Layout

```text
Density
Margin
Row gap
Section gap
```

Default:

```text
Canvas: Square
View: Fit canvas
Zoom: Auto
```

---

# 14. Drum Layer Foundation

## 14.1 Core Rule

The drum layer is separate from the pulse manuscript.

```text
Pulse grid ≠ Drum events
```

## 14.2 Source Priority

```text
1. Existing drum stem
2. Newly separated drum stem
3. Full-mix onset extraction fallback
```

## 14.3 Why Drum Stem First

A drum stem reduces false transients from bass, plucked instruments, vocal consonants, synth attacks, and mastering artifacts.

## 14.4 Foundation Scope

This build defines source selection, onset-event extraction interface, event persistence, diagnostic rendering, and fallback behavior.

---

# 15. Drum Data Model

```ts
export type DrumEventSource =
  | "drumStem"
  | "separatedDrumStem"
  | "fullMix";

export type DrumEvent = {
  id: string;
  timeSeconds: number;
  durationSeconds?: number;
  strength: number;
  confidence: number;
  source: DrumEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  nearestPulseId?: string;
  offsetFromPulseSeconds?: number;
  classification?:
    | "kick"
    | "snare"
    | "hat"
    | "percussion"
    | "unknown";
};
```

```ts
export type DrumLayerResult = {
  source: DrumEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  eventCount: number;
  events: DrumEvent[];
  analyzedAt: string;
  analyzerVersion: string;
  warnings: DrumLayerWarning[];
};
```

---

# 16. Drum Onset Detection Interface

```ts
export type DetectDrumEventsInput = {
  audioBuffer: AudioBuffer;
  source: DrumEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  sensitivity: number;
  minIntervalSeconds: number;
  strengthFloor: number;
};
```

```ts
export function detectDrumEvents(
  input: DetectDrumEventsInput
): DrumLayerResult;
```

Suggested stages:

```text
mono mixdown
→ high-pass or band emphasis
→ frame energy
→ spectral or energy flux
→ adaptive threshold
→ local peak picking
→ minimum event spacing
→ normalized strength
```

Do not add a package dependency.

---

# 17. Drum Layer Rendering

First-slice mark:

```text
vertical tick
```

or:

```text
small dot
```

Preferred lane above the pulse manuscript:

```text
drums    | · | | ·   | · | |
pulse    mmmmmmmmmmmmmmmmmmm
```

Mapping:

```text
time     → path-relative position
strength → tick height or dot size
```

Deferred:

- kick/snare/hat lanes;
- color categories;
- event glyph vocabulary;
- drum-to-hump integration;
- breakbeat phrase recognition.

---

# 18. Time Alignment

Pulse and drum layers must share one canonical time mapping.

```ts
export function timeToCanvasPosition(
  timeSeconds: number,
  layout: FullCanvasLayoutResult
): Point;
```

Do not quantize all drum events onto the pulse grid.

---

# 19. Layer Controls

```text
Pulse manuscript: On / Off
Drum events: On / Off
Sections: On / Off
Bar punctuation: On / Off
Safe area: On / Off
Diagnostics: On / Off
```

Display drum source status:

```text
Drums: Existing stem
Drums: Separated stem
Drums: Full-mix fallback
Drums: Not analyzed
```

---

# 20. Playback

The playhead must:

- cover the complete track duration;
- continue through synthesized pulses;
- highlight the current pulse arch;
- highlight nearby drum events;
- remain aligned with the transport;
- not stop when detected anchors stop.

```ts
currentPulse = latestPulseWhereTimeIsAtOrBeforeCurrentTime;
```

---

# 21. Persistence

Extend `GlyphComposition` with:

```ts
pulseTruthSnapshot: PulseTruthResult;
canvasPresetSnapshot: GlyphCanvasPreset;
viewportMode: GlyphViewportMode;
drumLayerSnapshot?: DrumLayerResult;
layerVisibility: GlyphLayerVisibility;
```

```ts
export type GlyphLayerVisibility = {
  pulseManuscript: boolean;
  drumEvents: boolean;
  sections: boolean;
  barPunctuation: boolean;
  safeArea: boolean;
};
```

---

# 22. Cache Key

Include:

```text
analysisId
analysisVersion
confirmedBpm
pulseTruthVersion
phaseOffsetSeconds
mappingPresetSnapshot
glyphGrammarSnapshot
connectionGrammarSnapshot
canvasPresetSnapshot
layoutPresetSnapshot
drumLayerAnalyzerVersion
drumLayerSource
seed
rendererVersion
```

Viewport zoom alone must not change exported geometry.

---

# 23. SVG Export

Required layer order:

```xml
<g id="pulse-manuscript">...</g>
<g id="bar-punctuation">...</g>
<g id="drum-events">...</g>
<g id="section-markers">...</g>
```

Requirements:

- full canvas dimensions;
- no clipping;
- deterministic path order;
- preview/export geometry parity;
- one continuous path per run;
- drum events as vector marks;
- no text;
- no filters;
- no raster images;
- round caps and joins;
- plot-safe geometry;
- physical dimensions in millimeters.

---

# 24. Diagnostics Panel

Show:

```text
Duration
Confirmed BPM
Expected pulses
Detected anchors
Synthesized pulses
Generated arches
Connected runs
Placed arches
Visible arches
Coverage
Rows
Canvas shape
Canvas overflow
Drum source
Drum event count
```

Required success state:

```text
Coverage: 100%
Canvas overflow: 0
Expected = Generated = Placed = Visible
```

---

# 25. Warnings and Errors

## Pulse Warnings

- unconfirmed BPM;
- no detected anchors;
- weak phase alignment;
- synthesized pulse majority;
- pulse count mismatch;
- coverage below 100%.

## Canvas Warnings

- minimum pulse width reached;
- content still overflows;
- notation too dense for selected canvas;
- safe area too small.

## Drum Warnings

- no drum stem;
- stem analysis failed;
- full-mix fallback active;
- onset density unusually high;
- onset detection produced zero events.

## Fail-Safe Rule

Never silently truncate.

```text
The selected canvas cannot contain the complete notation at the current minimum scale.
```

Offer:

- reduce margins;
- reduce density;
- switch canvas shape;
- paginate later.

---

# 26. UI Layout Recommendation

```text
Glyph Header
Track / BPM / duration / coverage

Compact Controls
Canvas | View | Connection | Layers

Large Preview
Complete canvas visible

Collapsed Advanced Controls
Pulse alignment
Layout
Drum detection
Diagnostics
Export
```

The preview receives the majority of available workspace.

---

# 27. Tests

## Pulse Truth

### `pulseTruth.test.ts`

- expected pulse count;
- phase alignment;
- complete duration coverage;
- synthesized pulse creation;
- no truncation;
- sorted output;
- deterministic output;
- unconfirmed BPM rejection.

## Continuous Geometry

### `continuousGlyphRuns.test.ts`

- one pulse per arch;
- exact shared endpoints;
- one path per run;
- section break creates new run;
- row break creates new run;
- no internal open tails;
- deterministic path commands.

## Full Canvas Layout

### `fullCanvasLayout.test.ts`

- square fit;
- portrait fit;
- right-edge protection;
- bottom-edge protection;
- all pulses placed;
- safe-area compliance;
- row wrapping;
- oversized-content failure.

## Drum Layer

### `drumEventDetection.test.ts`

- deterministic onset extraction;
- minimum spacing;
- strength normalization;
- source metadata;
- zero-event warning;
- full-mix fallback.

### `drumLayerLayout.test.ts`

- time alignment;
- off-grid event preservation;
- correct lane placement;
- all events inside canvas.

## Cache

Changing any export-affecting input changes the key. Zoom and preview-only state do not.

## Integration

```text
Duration + BPM
→ Pulse Truth
→ Continuous Runs
→ Full Canvas Layout
→ Drum Layer
→ SVG
```

Validate:

```text
expected = generated = placed = visible
coverage = 100%
overflow = 0
```

---

# 28. Acceptance Criteria

The build passes when:

1. The pulse grid covers the full audio duration.
2. Detected beats are alignment anchors, not the complete grid.
3. Every pulse generates exactly one hump.
4. Connected humps form continuous `mmmm` paths.
5. Shared endpoints are exact within tolerance.
6. Section boundaries begin new paths.
7. Row boundaries do not lose pulses.
8. Square canvas can be shown fully in the viewport.
9. Portrait canvas can be shown fully in the viewport.
10. Fit Canvas is the default.
11. No notation falls off the right or bottom edge.
12. Expected, generated, placed, and visible counts match.
13. Coverage reads 100%.
14. The playhead follows the complete song.
15. Drum events exist as a separate optional layer.
16. Existing drum stems are preferred.
17. Full-mix drum extraction is a fallback.
18. Drum events retain off-grid timing.
19. Preview and SVG export match.
20. Saved compositions restore identical geometry.
21. Tests and production build pass.
22. No unrelated repository files are modified.

---

# 29. Suggested File Plan

## New Data

```text
music/src/data/glyphPulseTruthTypes.ts
music/src/data/glyphCanvasTypes.ts
music/src/data/glyphDrumLayerTypes.ts
```

## New Logic

```text
music/src/logic/glyph/pulseTruth.ts
music/src/logic/glyph/pulsePhaseAlignment.ts
music/src/logic/glyph/continuousGlyphRuns.ts
music/src/logic/glyph/fullCanvasLayout.ts
music/src/logic/glyph/drumEventDetection.ts
music/src/logic/glyph/drumLayerLayout.ts
music/src/logic/glyph/timeToCanvasPosition.ts
```

## New Tests

```text
music/src/logic/glyph/pulseTruth.test.ts
music/src/logic/glyph/pulsePhaseAlignment.test.ts
music/src/logic/glyph/continuousGlyphRuns.test.ts
music/src/logic/glyph/fullCanvasLayout.test.ts
music/src/logic/glyph/drumEventDetection.test.ts
music/src/logic/glyph/drumLayerLayout.test.ts
music/src/logic/glyph/timeToCanvasPosition.test.ts
```

## Modified Data

```text
music/src/data/glyphCompositionTypes.ts
music/src/data/glyphConnectionTypes.ts
```

## Modified Logic

```text
music/src/logic/glyph/glyphRunFormation.ts
music/src/logic/glyph/manuscriptLayout.ts
music/src/logic/glyph/glyphCacheKey.ts
music/src/logic/glyph/glyphSvgExport.ts
```

## Modified Interface

```text
music/src/ui/glyph/GlyphWorkspace.tsx
music/src/ui/glyph/GlyphPreviewCanvas.tsx
music/src/ui/glyph/GlyphExportPanel.tsx
music/src/ui/glyph/GlyphConnectionEditor.tsx
```

## Optional New Interface

```text
music/src/ui/glyph/GlyphCanvasEditor.tsx
music/src/ui/glyph/GlyphLayerEditor.tsx
music/src/ui/glyph/GlyphDiagnostics.tsx
```

---

# 30. Build Order

## Phase 1 — Pulse Truth

1. Define pulse truth types.
2. Implement expected pulse generation.
3. Implement detected-anchor phase alignment.
4. Add complete coverage diagnostics.
5. Integrate full-duration pulse units.

## Phase 2 — Continuous `mmmm`

1. Define continuous-run geometry.
2. Replace independent arch + connector construction.
3. Generate shared-endpoint paths.
4. Preserve bar punctuation.
5. Break at section and row boundaries.

## Phase 3 — Full Canvas

1. Define square and portrait presets.
2. Implement fit-canvas viewport.
3. Implement safe-area layout.
4. Auto-fit all pulses.
5. Add overflow diagnostics.
6. Maximize preview space.

## Phase 4 — Drum Foundation

1. Define drum-event types.
2. Select source by priority.
3. Implement deterministic onset detection.
4. Render diagnostic drum lane.
5. Persist drum-layer result.
6. Add full-mix fallback warning.

## Phase 5 — Export and Verification

1. Update cache key.
2. Update SVG groups.
3. Verify preview/export parity.
4. Run tests.
5. Live-verify with a real track.
6. Write completion report.

Strict order:

```text
Data
→ Logic
→ Interface
```

---

# 31. Live Verification Tracks

Use at least:

- one stable house or techno track;
- one breakbeat or jungle-derived track;
- one ambient or weak-beat track;
- one track with an existing drum stem;
- one track without a drum stem.

For each report:

```text
duration
BPM
expected pulses
detected anchors
synthesized pulses
generated
placed
visible
coverage
canvas overflow
drum source
drum events
```

---

# 32. Completion Report Requirements

At completion report:

- files created;
- files modified;
- exact pipeline implemented;
- pulse-count diagnostics;
- canvas-fit diagnostics;
- drum source used;
- drum-event count;
- tests run and results;
- production build result;
- live verification;
- preview/export parity;
- remaining limitations;
- `git status --short`;
- confirmation that unrelated files were untouched.

---

# 33. Claude Implementation Prompt

```text
Implement:

0804C — Full Canvas, Pulse Truth, and Drum Layer Foundation

Use:
docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md

Primary goals:

1. Generate a complete full-duration pulse grid from confirmed BPM and track duration.
2. Use detected beats only as alignment anchors.
3. Generate exactly one hump per pulse.
4. Replace independent arch-plus-connector construction with continuous shared-endpoint mmmm paths.
5. Show the complete square or portrait canvas using Fit Canvas by default.
6. Guarantee no right-edge or bottom-edge clipping.
7. Add a separate drum-event layer.
8. Prefer an existing drum stem, then separated drum stem, then full-mix fallback.
9. Preserve actual off-grid drum-event timing.
10. Keep preview and SVG geometry deterministic and identical.

Required invariants:

expected pulses = generated arches = placed arches = visible arches
coverage = 100%
canvas overflow = 0

Do not silently truncate.
Do not alter confirmed BPM.
Do not change source analysis values.
Do not modify apps/glyphlab-reference/.
Do not create packages/.
Do not touch unrelated MAPS, itinerary, orb, overlay, vehicle, render, stem-library, or other files.

Build strictly:

Data → Logic → Interface

At completion report:

- complete file list;
- pulse diagnostics;
- canvas diagnostics;
- drum source and event count;
- tests and build;
- live verification;
- remaining limitations;
- git status --short.
```

---

# 34. Implementation Guide

- **Where**: Save this specification at `docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md`.
- **What**: Build full-duration pulse truth first, then continuous shared-endpoint `mmmm` paths, then complete square/portrait canvas fitting, then the separate drum-event foundation.
- **Expect**: The entire song becomes visible and followable; no notation clips; connected humps read as continuous writing; every drum transient can appear independently above the pulse manuscript.
