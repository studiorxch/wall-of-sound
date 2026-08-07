# 0804E — Event Vocabulary and Laser Layer

**Document:** `0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0`
**Status:** Ready for implementation
**Product:** `MUSIC → AudioLab → Glyph`
**Build name:** `0804E — Event Vocabulary and Laser Layer`

---

# 1. Objective

Extend the stable 0804D Glyph Notes language with two new expressive layers:

1. A clearer **event vocabulary** for audible transient events, especially drum and clap-like sounds.
2. A separate **laser / synth-motion layer** for continuous oscillating, high-frequency, resonant, or modulation-heavy material.

The build must preserve the current visual grammar:

```text
humps = pulse / macro energy
space = bars
dots = audible events
```

The new layer adds:

```text
ring / halo marks = clap-like events
thin line / segmented beam = laser or synth modulation
```

---

# 2. Product Intent

The purpose of this build is not to produce full instrumental transcription.

It should make Glyph Notes more capable of representing the characteristic sound behavior of tracks like Frank's:

- repeated pulse on every hump;
- heavy clap usage;
- constant oscillating laser-like synth material;
- gradual rise and fall in modulation;
- sections where these sounds intensify or recede.

The result must remain readable as a visual manuscript and usable as cover-art source material.

---

# 3. Existing Foundation

0804D currently provides:

- full-duration pulse truth;
- one pulse per hump;
- continuous shared-endpoint `mmmm` geometry;
- silent bar spacing;
- section-aware path breaks;
- square and portrait full-canvas fitting;
- playhead following;
- independent drum-event dots;
- complete drum-event visibility;
- deterministic persistence;
- preview/SVG parity;
- zero right and bottom overflow.

0804E must not redesign any of these systems.

---

# 4. Scope

## Included

- event-family data model;
- audible-event symbol vocabulary;
- clap-like event detection or classification using existing data where feasible;
- distinct clap symbol;
- optional accent-event symbol;
- separate laser/synth-motion analysis layer;
- laser activity envelope;
- modulation or oscillation proxy;
- thin-line laser rendering;
- segmented-beam rendering;
- monochrome manuscript mode;
- restrained color cover mode;
- layer toggles;
- deterministic persistence;
- cache-key updates;
- SVG export;
- diagnostics;
- tests;
- live verification.

## Excluded

- full pitch transcription;
- MIDI generation;
- exact instrument recognition;
- neural source separation redesign;
- new package dependencies;
- stem-library changes;
- audio-reactive animation;
- spiral layout;
- timeline/storyboard mode;
- prompt pairing;
- direct AxiDraw control;
- manual event drawing;
- multiband mastering analysis;
- full spectrogram rendering.

---

# 5. Core Visual Grammar

## Structural Grammar

```text
pulse
= one hump

connected pulses
= continuous mmmm path

bar boundary
= silent horizontal gap

phrase boundary
= larger silent gap

section boundary
= run break or row transition
```

## Audible Event Grammar

```text
light transient
= tiny dot

general drum hit
= filled dot

clap-like event
= open ring or halo dot

strong accent / crash
= larger filled or ringed mark

laser / synth motion
= thin oscillating line or segmented beam
```

Dots and rings must never be used for bars or other silent structure.

---

# 6. Event Vocabulary

## 6.1 Event Families

```ts
export type GlyphEventFamily =
  | "lightTransient"
  | "drum"
  | "clap"
  | "accent"
  | "unknown";
```

## 6.2 Event Source

```ts
export type GlyphEventSource =
  | "drumStem"
  | "separatedDrumStem"
  | "fullMix"
  | "existingAnalysis";
```

## 6.3 Event Record

```ts
export type GlyphAudibleEvent = {
  id: string;
  timeSeconds: number;
  durationSeconds?: number;
  family: GlyphEventFamily;
  strength: number;
  confidence: number;
  source: GlyphEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  nearestPulseId?: string;
  offsetFromPulseSeconds?: number;
  features?: {
    lowBandEnergy?: number;
    midBandEnergy?: number;
    highBandEnergy?: number;
    transientSharpness?: number;
    spectralFlatness?: number;
    decaySeconds?: number;
  };
};
```

---

# 7. Event Symbol Vocabulary

## Light transient
Tiny filled dot.

## General drum hit
Filled dot with strength controlling radius.

## Clap-like event
Open ring. Optional faint outer halo when confidence is high.

## Accent / crash
Larger filled dot or larger ring. Avoid decorative complexity in the first slice.

---

# 8. Clap Classification

Do not claim exact clap recognition unless current analysis supports it reliably.

Use a deterministic heuristic and describe uncertain results as **clap-like**.

Suggested features:

```text
midBandEnergy
highBandEnergy
lowBandEnergy
transientSharpness
spectralFlatness
decaySeconds
```

```ts
export type GlyphEventClassificationResult = {
  family: GlyphEventFamily;
  confidence: number;
  reasons: string[];
};
```

If confidence is weak, fall back to:

```text
family = "drum"
```

Do not force a ring symbol.

---

# 9. Laser / Synth-Motion Layer

The laser layer is continuous behavior, not a collection of pulse marks.

It should represent:

- resonant high-frequency activity;
- oscillation;
- modulation;
- sweep direction;
- intensity over time;
- periods of rise and fall.

It must remain separate from hump height.

```ts
export type LaserRenderMode =
  | "oscillationLine"
  | "segmentedBeam";
```

Default:

```text
oscillationLine
```

## Oscillation line mapping

```text
time → path position
laser activity → opacity / visibility
modulation amount → oscillation amplitude
modulation rate → wavelength
brightness → line intensity
sweep direction → rise/fall trend
```

## Segmented beam mapping

```text
activity → segment presence
strength → segment size
brightness → opacity
modulation → vertical displacement
```

---

# 10. Laser Analysis Model

```ts
export type LaserActivityFrame = {
  timeSeconds: number;
  activity: number;
  highBandEnergy: number;
  spectralFlux: number;
  modulationAmount: number;
  modulationRate: number;
  sweepDirection: -1 | 0 | 1;
  confidence: number;
};
```

```ts
export type LaserLayerResult = {
  sourceTrackId: string;
  sourceStemId?: string;
  source: "otherStem" | "instrumentalStem" | "fullMix";
  frameDurationSeconds: number;
  frames: LaserActivityFrame[];
  coverageStartSeconds: number;
  coverageEndSeconds: number;
  coveragePercent: number;
  analyzerVersion: string;
  analyzedAt: string;
  warnings: LaserLayerWarning[];
};
```

## Source priority

```text
1. Existing "other" or instrumental stem
2. Existing non-drum musical stem suitable for synth activity
3. Full mix
```

Do not modify the stem archive.

## Analysis strategy

Use existing MUSIC DSP utilities where possible:

```text
mono or stereo summary
→ high-mid / high-band filtering
→ frame energy
→ spectral flux
→ envelope smoothing
→ short-window oscillation proxy
→ modulation amount
→ modulation rate
→ sweep direction
```

No external package dependency.

Only render frames above an activity threshold.

---

# 11. Laser Geometry

```ts
export type LaserPathPoint = {
  timeSeconds: number;
  x: number;
  y: number;
  activity: number;
  intensity: number;
};
```

```ts
export type LaserPlacedSegment = {
  rowIndex: number;
  sectionId: string | null;
  points: LaserPathPoint[];
  bounds: Bounds;
};
```

The laser path must:

- use the same canonical time-to-canvas mapping as pulses and drums;
- break at row boundaries;
- never connect across rows;
- preserve full time coverage;
- remain inside safe bounds;
- avoid modifying pulse layout.

Recommended default placement:

```text
above the hump crest region
```

---

# 12. Color Modes

```ts
export type GlyphColorMode =
  | "monochrome"
  | "cover";
```

Default:

```text
monochrome
```

## Monochrome

- pulse manuscript uses primary stroke;
- drums use filled dots;
- clap-like events use open rings;
- laser uses a thinner secondary line;
- all marks remain plot-safe.

## Cover

Use one restrained accent color for the laser. Avoid gradients and glow as requirements.

Suggested Frank preset:

```text
background: near black
pulse manuscript: warm off-white
drums: warm white
clap rings: pale amber or off-white
laser: restrained cyan, amber, or acid-green
```

---

# 13. Layer Controls

```ts
export type GlyphLayerVisibility = {
  pulseManuscript: boolean;
  drumEvents: boolean;
  clapEvents: boolean;
  accentEvents: boolean;
  laserLayer: boolean;
  sections: boolean;
  safeArea: boolean;
  barPunctuation?: boolean;
};
```

UI toggles:

```text
Pulse
Drums
Claps
Accents
Laser
Sections
Safe area
```

Recommended first-slice laser controls:

```text
Laser On/Off
Mode
Strength
Smoothing
Color mode
```

---

# 14. Diagnostics

## Event diagnostics

```text
Raw drum events
Light transients
General drum events
Clap-like events
Accent events
Unclassified events
Visible event marks
Dropped event marks
```

## Laser diagnostics

```text
Laser source
Source duration
Frames analyzed
Visible frames
First active time
Last active time
Coverage percentage
Activity threshold
Placed segments
Visible segments
Dropped segments
```

Maintain:

```text
expected pulses = generated arches = placed arches = visible arches
bar boundaries = inserted bar gaps
drum events = visible drum events
coverage = 100%
overflowRight = 0
overflowBottom = 0
```

Add:

```text
accepted event symbols = visible event symbols
laser coverage = 100%
laser dropped segments = 0
```

---

# 15. Persistence

Extend `GlyphComposition` with optional fields:

```ts
eventVocabularySnapshot?: {
  analyzerVersion: string;
  events: GlyphAudibleEvent[];
};

laserLayerSnapshot?: LaserLayerResult;

laserRenderSettings?: {
  mode: LaserRenderMode;
  activityThreshold: number;
  amplitude: number;
  smoothing: number;
  verticalOffset: number;
  strokeWidth: number;
};

colorMode?: GlyphColorMode;
```

0804C and 0804D compositions must still load.

---

# 16. Cache Key

Include export-affecting inputs:

```text
eventVocabularyAnalyzerVersion
eventClassificationThresholds
laserAnalyzerVersion
laserSource
laserRenderMode
laserActivityThreshold
laserAmplitude
laserSmoothing
laserVerticalOffset
laserStrokeWidth
colorMode
coverAccent
rendererVersion
```

Do not include preview-only zoom.

---

# 17. SVG Export

Required group order:

```xml
<g id="pulse-manuscript">...</g>
<g id="bar-punctuation"></g>
<g id="drum-events">...</g>
<g id="clap-events">...</g>
<g id="accent-events">...</g>
<g id="laser-layer">...</g>
<g id="section-markers">...</g>
```

Requirements:

- deterministic order;
- no clipping;
- no raster images;
- no filters;
- no text;
- monochrome-safe geometry;
- preview/export parity;
- one vector mark per accepted event;
- one deterministic laser path per row segment.

---

# 18. Preview and Playback

Changing event or laser settings must:

- update preview without rerunning pulse truth;
- preserve playback position;
- preserve current pulse highlight;
- preserve canvas fit;
- avoid changing hump geometry;
- avoid changing bar spacing.

During playback:

- current pulse remains highlighted;
- nearby drum/clap events may highlight;
- active laser segment may highlight;
- the laser layer must continue through the full track.

---

# 19. Error Handling

## Event warnings

- weak clap confidence;
- all events unclassified;
- source unavailable;
- event count unusually high;
- accepted count zero.

## Laser warnings

- no suitable stem;
- full-mix fallback active;
- source duration differs from master;
- analysis coverage below 100%;
- no visible activity;
- threshold removes all frames;
- dropped geometry segments.

Fail-safe behavior:

- failed clap classification → general drum dot;
- failed laser analysis → laser layer off;
- never truncate pulse or drum layers;
- never alter bar spacing because laser analysis failed.

---

# 20. Tests

## Event vocabulary

- light transient classification;
- drum fallback;
- clap-like classification;
- accent classification;
- low-confidence fallback;
- deterministic symbol mapping;
- no structural dots.

## Laser analysis

- full-duration frames;
- source priority;
- thresholding;
- modulation amount/rate;
- sweep direction;
- deterministic output;
- zero-activity warning;
- full-mix fallback.

## Laser layout

- canonical time mapping;
- row breaks;
- no cross-row connectors;
- safe-area compliance;
- zero dropped segments;
- no pulse-layout mutation.

## SVG

- group order;
- clap rings;
- drum dots;
- laser paths;
- empty bar-punctuation group;
- monochrome and cover modes;
- deterministic output;
- preview parity.

## Persistence

- old 0804C composition loads;
- old 0804D composition loads;
- optional fields round-trip;
- cache key responds to export-affecting settings.

---

# 21. Acceptance Criteria

1. Silent bar spacing remains unchanged.
2. No bar dot returns.
3. Drum dots remain aligned to audible events.
4. Clap-like events render as open rings when confidence permits.
5. Low-confidence clap candidates fall back to drum dots.
6. Event symbols remain monochrome-readable and plot-safe.
7. Laser analysis covers the full track duration.
8. Laser geometry is separate from hump geometry.
9. Laser geometry breaks at row boundaries.
10. Laser geometry never changes pulse placement.
11. Laser layer toggles independently.
12. Monochrome manuscript mode works.
13. Restrained color cover mode works.
14. Existing pulse, bar-gap, drum, and canvas invariants remain green.
15. Preview and SVG match.
16. Saved 0804C and 0804D compositions still load.
17. Tests and production build pass.
18. No unrelated repository files are modified.

---

# 22. Suggested File Plan

## New data

```text
music/src/data/glyphEventVocabularyTypes.ts
music/src/data/glyphLaserLayerTypes.ts
```

## Modified data

```text
music/src/data/glyphCompositionTypes.ts
music/src/data/glyphDrumLayerTypes.ts
```

## New logic

```text
music/src/logic/glyph/glyphEventVocabulary.ts
music/src/logic/glyph/glyphEventSymbolGeometry.ts
music/src/logic/glyph/laserLayerAnalysis.ts
music/src/logic/glyph/laserLayerLayout.ts
music/src/logic/glyph/laserLayerGeometry.ts
music/src/logic/glyph/laserSourceSelection.ts
```

## New tests

```text
music/src/logic/glyph/glyphEventVocabulary.test.ts
music/src/logic/glyph/glyphEventSymbolGeometry.test.ts
music/src/logic/glyph/laserLayerAnalysis.test.ts
music/src/logic/glyph/laserLayerLayout.test.ts
music/src/logic/glyph/laserLayerGeometry.test.ts
music/src/logic/glyph/laserSourceSelection.test.ts
```

## Modified logic

```text
music/src/logic/glyph/glyphCacheKey.ts
music/src/logic/glyph/glyphSvgExport.ts
music/src/logic/glyph/timeToCanvasPosition.ts
```

## New interface

```text
music/src/ui/glyph/GlyphEventLayerEditor.tsx
music/src/ui/glyph/GlyphLaserLayerEditor.tsx
```

## Modified interface

```text
music/src/ui/glyph/GlyphWorkspace.tsx
music/src/ui/glyph/GlyphFullCanvasPreview.tsx
music/src/ui/glyph/GlyphCanvasEditor.tsx
music/src/ui/glyph/GlyphDiagnostics.tsx
music/src/ui/glyph/GlyphExportPanel.tsx
```

---

# 23. Build Order

## Phase 1 — Event data and classification
## Phase 2 — Laser data and analysis
## Phase 3 — Geometry and layout
## Phase 4 — Interface
## Phase 5 — Persistence and export

Strict order:

```text
Data
→ Logic
→ Interface
```

---

# 24. Live Verification

Use at least:

- one clap-heavy steady electronic track;
- one track with constant laser/resonant synth movement;
- one drum-and-bass track;
- one track with little or no laser activity;
- one track with a suitable existing stem;
- one track requiring full-mix fallback.

Report:

```text
duration
pulse count
drum events
clap-like events
accent events
laser source
laser analyzed frames
laser visible frames
laser coverage
placed laser segments
dropped segments
overflowRight
overflowBottom
SVG result
```

For Frank's track verify:

- the pulse manuscript is unchanged;
- clap-like events appear as rings;
- laser activity rises and falls through the full song;
- the laser is not a generic full-width decorative line;
- cover mode remains restrained.

---

# 25. Claude Implementation Prompt

```text
Implement:

0804E — Event Vocabulary and Laser Layer

Use:
docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md

Context:
0804D is complete and stable.

Preserve:

humps = pulse / macro energy
space = bars
dots = audible events

Add:

open ring / halo = clap-like event
large dot or ring = accent event
thin oscillating line or segmented beam = laser / synth motion

Primary requirements:

1. Keep pulse truth, mmmm geometry, silent bar spacing, canvas fitting, and playhead behavior unchanged.
2. Add deterministic event-family classification.
3. Use an open-ring symbol for clap-like events only when confidence permits.
4. Fall back to a general drum dot when clap confidence is weak.
5. Add a separate laser-layer analysis model.
6. Prefer a suitable existing non-drum stem, then full mix.
7. Do not modify the stem archive.
8. Analyze laser activity across the full track duration.
9. Map laser behavior as a separate row-broken path.
10. Support oscillationLine and segmentedBeam modes.
11. Keep the laser independent from hump geometry and row layout.
12. Support monochrome manuscript mode and restrained color cover mode.
13. Maintain deterministic persistence, cache behavior, and SVG parity.
14. Preserve backward compatibility with 0804C and 0804D compositions.

Required existing invariants:

expected pulses = generated arches = placed arches = visible arches
bar boundaries = inserted bar gaps
drum events = visible drum events
coverage = 100%
overflowRight = 0
overflowBottom = 0

Required new invariants:

accepted event symbols = visible event symbols
laser coverage = 100%
laser dropped segments = 0

Do not add packages.
Do not modify apps/glyphlab-reference/.
Do not modify Looper files.
Do not modify stem-library internals.
Do not touch unrelated MAPS, itinerary, orb, overlay, vehicle, render, or other files.

Before implementation:

1. confirm current drum-event data available for classification;
2. identify actual suitable stem labels available for laser analysis;
3. state whether clap classification can be meaningful with current DSP features;
4. provide the exact file list;
5. identify any necessary narrowing before coding.

Build strictly:

Data → Logic → Interface

At completion report:

- exact file list;
- event counts and confidence behavior;
- laser source and coverage;
- pulse and canvas invariants;
- tests and production build;
- live verification;
- preview/SVG parity;
- remaining limitations;
- git status --short.
```

---

# 26. Implementation Guide

- **Where**: Save at `docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md`.
- **What**: Add event-family symbols first, then a separate full-duration laser-analysis/rendering layer, followed by controls, persistence, diagnostics, and SVG export.
- **Expect**: Drum hits read as stars, clap-like events as rings or small planets, and Frank's oscillating laser material as a restrained line or segmented beam moving independently through the complete Glyph Notes manuscript.

---

# 27. Corrections Incorporated (pre-implementation review)

## Approved implementation boundaries

**Clap-like classification.** Use the existing FFT utilities (`music/src/logic/fft.ts`, already shared by BPM/key detection) to compute the missing local features around each already-detected `DrumEvent`: low/mid/high-band energy, spectral flatness, attack slope as a transient-sharpness proxy, and a short post-onset decay estimate. Keep the classifier explicitly heuristic — never claim exact recognition. **Do not write definitive instrument labels into the existing `DrumEvent` record.** The new classification layer (`GlyphAudibleEvent`) owns its own provenance separately; `DrumEvent`/`glyphDrumLayerTypes.ts` stays untouched.

**Laser source priority.** Use the `other`-role stem first, then full mix. Do not broaden this to vocals or bass automatically — those may contain useful content, but they would make source-selection meaning ambiguous in this first slice.

**Laser analysis proxies.** High-band energy, spectral flux, modulation-amount, modulation-rate (envelope-derivative proxy), and sweep-direction (spectral-centroid-trend sign) are approved as proposed. Treat `modulationRate` and `sweepDirection` as visual descriptors, not pitch or synthesis measurements.

## Two corrections before coding

**1. Do not use fixed cover colors inside analysis or geometry.** Fixed preset values are acceptable, but keep them in render settings or a named preset consumed only at render time. Analysis, event classification, and path geometry modules must remain color-agnostic — no color string ever appears in `glyphEventVocabulary.ts`, `glyphEventSymbolGeometry.ts` (shape only), `laserLayerAnalysis.ts`, `laserLayerLayout.ts`, or `laserLayerGeometry.ts`.

**2. Laser coverage must not mean continuous visibility.** The analyzer covers 100% of the track (frames computed start to end regardless of activity level), but the visible laser path must only appear where activity crosses the threshold. Distinguish "frames analyzed" (100% coverage, always) from "visible/placed segments" (only where above threshold — legitimately near-zero on a low-activity track). Do not satisfy "laser coverage = 100%" by drawing an artificial line through inactive passages.

## Required provenance

Each classified `GlyphAudibleEvent` retains its source `DrumEvent` lineage (a traceable link back to the raw onset it was derived from), plus `source`/`sourceTrackId`/`sourceStemId`/classification `reasons`. Each `LaserLayerResult` retains its own `source`, `sourceStemId?`, `analyzerVersion`, `analyzedAt`. This matters when these detectors are improved later.

## Live verification (visual audit)

At completion, include a visual audit of at least:

- one track where rings clearly appear;
- one where nearly everything correctly remains a general drum dot;
- one active laser track;
- one low-activity track where the laser mostly disappears;
- Frank's track, if available in the live library.
