# Glyph Notes — Connection Grammar Specification

**Document:** `0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0`  
**Status:** Ready for implementation planning  
**Product placement:** `MUSIC → AudioLab → Glyph`  
**Primary object:** Glyph Note / Glyph Composition  
**Primary purpose:** Convert pulse-level musical structure into readable, connected monoline visual language.

---

# 1. Environmental Assumptions

## Repository

```text
wall-of-sound/
```

## Product placement

```text
MUSIC
└── AUDIOLAB
    ├── Looper
    └── Glyph
```

## Existing first-slice state

The current Glyph implementation already provides:

- MUSIC AudioLab navigation;
- TrackInspector "Open in Glyph" entry;
- source-track loading;
- beat-grid confirmation;
- per-beat energy extraction;
- arch-family glyph generation;
- manuscript preview;
- current-playhead highlighting;
- explicit Save;
- saved Glyph Composition persistence;
- deterministic SVG export.

## Existing conceptual correction

The next implementation must move from:

```text
one sparse detected event
→ one multi-arch glyph
```

toward:

```text
one pulse
→ one arch
```

Connected pulse arches then form larger visual runs.

## Repository safety

Do not modify:

```text
apps/glyphlab-reference/
```

Do not create:

```text
packages/
```

Do not touch unrelated MAPS, itinerary, orb, overlay, vehicle, render, stem, or TrackStemLibrary files.

---

# 2. Product Intent

The connection grammar exists to make Glyph Notes read more like:

- writing;
- notation;
- inscription;
- a visual transcript;
- an instrumental lyric sheet;
- a composition map.

The system must not render pulse arches as isolated repeated stamps unless explicitly configured.

The core principle is:

> A pulse arch is the smallest mark. Adjacent pulse arches may join into connected runs when they belong to the same continuous musical passage and when geometry permits. Structural boundaries create punctuation, spacing, or breaks.

---

# 3. Scope

## Included

- one pulse per arch;
- deterministic connection decisions;
- bar, phrase, section, and silence boundary behavior;
- geometry-aware connection rules;
- connected-run formation;
- punctuation;
- preview and SVG parity;
- section-sensitive continuity;
- plot-safe paths;
- traceable connection decisions;
- UI controls for connection behavior.

## Excluded

- stem-specific connection grammars;
- direct AxiDraw device control;
- pen-travel optimization;
- spiral or square-cover rendering;
- freeform manual node editing;
- automatic section detection changes;
- prompt pairing;
- timeline/storyboard mode;
- multi-voice notation;
- collaborative editing;
- cloud persistence.

---

# 4. Core Concepts

## 4.1 Pulse Arch

The smallest visual mark.

```text
one musical pulse
→ one arch
```

A pulse arch may vary through:

- height;
- width;
- curvature;
- sharpness;
- asymmetry;
- local baseline;
- handmade variance.

## 4.2 Connected Run

A sequence of pulse arches joined into one continuous visual passage.

```text
∩∩∩∩
```

A run may represent:

- part of a bar;
- one full bar;
- multiple bars;
- a phrase;
- an entire section.

Its length is determined by connection rules, not by a fixed character count.

## 4.3 Boundary

A structural event that can modify continuity.

Supported boundary types:

```text
bar
phrase
section
silence
manual
layout
```

## 4.4 Connector

The path joining one pulse arch endpoint to the next pulse arch startpoint.

## 4.5 Break

A deliberate disconnection between adjacent pulses.

## 4.6 Punctuation

A visible structural mark placed at a boundary.

Supported punctuation:

```text
dot
dot cluster
gap
rest mark
```

---

# 5. Visual Grammar Hierarchy

```text
Track
└── Section
    └── Phrase
        └── Bar
            └── Pulse
                └── Pulse Arch
```

Visual hierarchy:

```text
Pulse Arch
→ Connected Run
→ Phrase Passage
→ Section Passage
→ Full Glyph Note
```

This hierarchy must remain independent from layout.

---

# 6. Connection Decision Order

For every adjacent pulse pair, resolve the connection in this exact order:

```text
1. Validate chronological adjacency
2. Detect hard structural break
3. Apply manual override
4. Evaluate connection mode
5. Evaluate boundary behavior
6. Evaluate geometry compatibility
7. Evaluate distance threshold
8. Evaluate collision risk
9. Create connector, punctuation, or break
10. Record decision provenance
```

Earlier rules override later rules.

---

# 7. Connection Modes

```ts
export type ConnectionMode =
  | "never"
  | "withinBar"
  | "withinPhrase"
  | "withinSection"
  | "always";
```

## 7.1 `never`

Every pulse arch remains separate.

Use cases:

- diagnostics;
- pulse-count verification;
- comparison;
- sparse visual studies.

## 7.2 `withinBar`

Connect pulses only when they belong to the same bar.

Default bar-end action is punctuation or break.

## 7.3 `withinPhrase`

Connect pulses across bars within the same phrase.

Phrase boundaries create breaks or larger spacing.

## 7.4 `withinSection`

Connect pulses throughout the same section.

Recommended default.

Bar and phrase boundaries may punctuate without forcing complete disconnection.

## 7.5 `always`

Connect every chronologically adjacent pulse unless:

- geometry is incompatible;
- layout forces a split;
- a hard silence occurs;
- a manual break exists.

This is experimental and not the default.

---

# 8. Boundary Behaviors

```ts
export type BoundaryBehavior =
  | "keepConnected"
  | "dot"
  | "smallGap"
  | "gap"
  | "break"
  | "dotAndGap"
  | "dotCluster"
  | "breakAndDot"
  | "breakAndDotCluster"
  | "largeGap"
  | "newRow"
  | "newOrbit"
  | "newPage"
  | "extendedGap"
  | "restMark";
```

## 8.1 Bar Boundary

Supported:

```text
keepConnected
dot
smallGap
break
dotAndGap
```

Recommended default:

```text
dot
```

Meaning:

- preserve reading continuity;
- show rhythmic grouping;
- avoid fragmenting every bar into an isolated object.

## 8.2 Phrase Boundary

Supported:

```text
keepConnected
gap
break
dotCluster
breakAndDot
```

Recommended default:

```text
gap
```

## 8.3 Section Boundary

Supported:

```text
break
largeGap
breakAndDotCluster
newRow
newOrbit
newPage
```

Recommended default for manuscript view:

```text
break
```

## 8.4 Silence Boundary

Supported:

```text
extendedGap
break
dot
restMark
```

Recommended default:

```text
extendedGap
```

## 8.5 Manual Boundary

Manual overrides may force:

```text
connect
break
punctuate
new row
```

Manual overrides take precedence over automatic rules.

---

# 9. Connector Styles

```ts
export type ConnectorMode =
  | "straight"
  | "softSag"
  | "softRise"
  | "tensionCurve"
  | "inheritNeighboringCurvature";
```

## 9.1 `straight`

A direct line between endpoints.

Use mainly for diagnostics or highly geometric presets.

## 9.2 `softSag`

A shallow downward curve.

Recommended default because it reads as handwriting.

## 9.3 `softRise`

A shallow upward curve.

## 9.4 `tensionCurve`

A controlled Bézier-like curve with adjustable tension.

## 9.5 `inheritNeighboringCurvature`

Derive the connector tangent from adjacent arch geometry.

Best long-term option for highly continuous writing.

---

# 10. Data Model

## 10.1 Connection Grammar

```ts
export type ConnectionGrammar = {
  id: string;
  schemaVersion: 1;
  name: string;

  connectionMode: ConnectionMode;

  barBoundaryBehavior: BoundaryBehavior;
  phraseBoundaryBehavior: BoundaryBehavior;
  sectionBoundaryBehavior: BoundaryBehavior;
  silenceBoundaryBehavior: BoundaryBehavior;

  connectorMode: ConnectorMode;

  connectorDistanceMultiplier: number;
  maxBaselineDeltaMultiplier: number;
  allowMinorCrossings: boolean;
  allowConnectorOverrun: boolean;

  connectorSagAmount: number;
  connectorRiseAmount: number;
  connectorTension: number;
  connectorSmoothing: number;

  punctuationDotSize: number;
  punctuationGapSize: number;
  sectionGapMultiplier: number;
  restMarkScale: number;

  createdAt: string;
  updatedAt: string;
};
```

## 10.2 Connection Result

```ts
export type ConnectionResult =
  | "connected"
  | "broken"
  | "punctuated";
```

## 10.3 Connection Reason

```ts
export type ConnectionReason =
  | "chronologyMismatch"
  | "sameRun"
  | "barBoundary"
  | "phraseBoundary"
  | "sectionBoundary"
  | "silenceBoundary"
  | "manualOverride"
  | "connectionModeDenied"
  | "geometryIncompatible"
  | "distanceExceeded"
  | "baselineDeltaExceeded"
  | "collisionDetected"
  | "layoutBoundary"
  | "renderFallback";
```

## 10.4 Connection Decision

```ts
export type ConnectionDecision = {
  id: string;

  fromPulseId: string;
  toPulseId: string;

  fromGlyphInstanceId: string;
  toGlyphInstanceId: string;

  result: ConnectionResult;
  reason: ConnectionReason;

  connectorMode?: ConnectorMode;

  punctuation?:
    | "dot"
    | "dotCluster"
    | "gap"
    | "restMark";

  connectorPathData?: string;

  createdAt: string;
};
```

## 10.5 Glyph Run

```ts
export type GlyphRun = {
  id: string;
  sectionId: string;
  phraseId: string | null;
  barIds: string[];

  pulseIds: string[];
  glyphInstanceIds: string[];

  connectionDecisions: ConnectionDecision[];

  startBeat: number;
  endBeat: number;

  rowIndex?: number;
  pageIndex?: number;
};
```

## 10.6 Manual Override

```ts
export type ConnectionOverride = {
  id: string;
  fromPulseId: string;
  toPulseId: string;
  action:
    | "forceConnect"
    | "forceBreak"
    | "forceDot"
    | "forceGap"
    | "forceNewRow";
  createdAt: string;
  updatedAt: string;
};
```

---

# 11. Default Preset

```ts
export const DEFAULT_CONNECTION_GRAMMAR: ConnectionGrammar = {
  id: "connection-within-section-v1",
  schemaVersion: 1,
  name: "Connected Sections",

  connectionMode: "withinSection",

  barBoundaryBehavior: "dot",
  phraseBoundaryBehavior: "gap",
  sectionBoundaryBehavior: "break",
  silenceBoundaryBehavior: "extendedGap",

  connectorMode: "softSag",

  connectorDistanceMultiplier: 1.75,
  maxBaselineDeltaMultiplier: 0.6,
  allowMinorCrossings: true,
  allowConnectorOverrun: false,

  connectorSagAmount: 0.18,
  connectorRiseAmount: 0,
  connectorTension: 0.5,
  connectorSmoothing: 0.65,

  punctuationDotSize: 1,
  punctuationGapSize: 1.5,
  sectionGapMultiplier: 2.5,
  restMarkScale: 1,

  createdAt: "",
  updatedAt: ""
};
```

Timestamps must be assigned when seeded.

---

# 12. Geometry Rules

## 12.1 Endpoint Definition

Every pulse arch must expose:

```ts
export type GlyphEndpoints = {
  start: Point;
  end: Point;
  startTangent?: Point;
  endTangent?: Point;
};
```

The connection system must not infer endpoints from rendered DOM geometry.

Endpoints must come from canonical glyph geometry.

## 12.2 Distance Threshold

```ts
maxConnectorDistance =
  basePulseWidth * connectorDistanceMultiplier;
```

Recommended default:

```text
1.75 × base pulse width
```

## 12.3 Baseline Delta

```ts
maxBaselineDelta =
  glyphHeight * maxBaselineDeltaMultiplier;
```

Recommended default:

```text
0.6 × local glyph height
```

## 12.4 Collision Rules

Reject connection when it creates:

- hard self-intersection;
- collision through punctuation reserve space;
- crossing through unrelated rows;
- crossing beyond page margins;
- path reversal that materially harms reading order;
- connector through a section break.

Minor crossings may be allowed when:

- `allowMinorCrossings = true`;
- the crossing remains legible;
- it resembles natural handmade overlap;
- it does not create ambiguous pulse order.

## 12.5 Layout Boundaries

Never connect across:

- different rows;
- different pages;
- different layout zones;
- different spiral orbits when orbit breaks are enabled;
- explicit section-start rows.

---

# 13. Run Formation Algorithm

## Inputs

```ts
type BuildGlyphRunsInput = {
  pulses: BeatUnit[];
  glyphs: GeneratedGlyphInstance[];
  boundaries: BoundaryUnit[];
  silences: SilenceUnit[];
  grammar: ConnectionGrammar;
  overrides: ConnectionOverride[];
  layoutConstraints?: LayoutConnectionConstraints;
};
```

## Output

```ts
type BuildGlyphRunsOutput = {
  runs: GlyphRun[];
  decisions: ConnectionDecision[];
  warnings: ConnectionWarning[];
};
```

## Algorithm

```text
1. Sort pulses chronologically.
2. Match each pulse to one generated arch glyph.
3. Start a run using the first pulse.
4. For every adjacent pulse pair:
   a. Confirm chronological adjacency.
   b. Detect manual override.
   c. Detect bar, phrase, section, silence, and layout boundaries.
   d. Evaluate configured connection mode.
   e. Resolve boundary behavior.
   f. Compute endpoint distance.
   g. Compute baseline delta.
   h. Evaluate collision and crossing risk.
   i. Connect, punctuate, or break.
   j. Record a ConnectionDecision.
5. Close the current run whenever a break occurs.
6. Create a new run beginning with the next pulse.
7. Return all runs, decisions, and warnings.
```

---

# 14. Decision Function

```ts
export function decideConnection(
  input: DecideConnectionInput
): ConnectionDecision;
```

## Required Guards

```text
if pulses are not adjacent
→ break

if manual forceBreak
→ break

if manual forceConnect and geometry is safe
→ connect

if section boundary behavior is break/newRow/newPage
→ break

if connection mode does not allow current structural scope
→ break or punctuate

if distance exceeds threshold
→ break

if baseline delta exceeds threshold
→ break

if collision is unacceptable
→ break

otherwise
→ connect
```

Manual force-connect must not override impossible layout or page boundaries.

---

# 15. Connector Path Generation

```ts
export function buildConnectorPath(
  from: GlyphEndpoints,
  to: GlyphEndpoints,
  grammar: ConnectionGrammar
): string;
```

## Straight

```text
M end.x end.y
L start.x start.y
```

## Soft Sag

Use one or two control points below the interpolated baseline.

## Soft Rise

Use one or two control points above the interpolated baseline.

## Tension Curve

Use control points derived from:

- endpoint tangents;
- connector tension;
- smoothing;
- distance.

## Inherit Neighboring Curvature

Use:

- previous arch exit tangent;
- next arch entry tangent;
- average local curvature.

---

# 16. Punctuation Generation

```ts
export type PunctuationMark = {
  id: string;
  type: "dot" | "dotCluster" | "gap" | "restMark";
  x: number;
  y: number;
  radius?: number;
  scale?: number;
  sourceBoundaryId: string;
};
```

## Dot

One plot-safe circular or path-based mark.

## Dot Cluster

Two or three dots with deterministic spacing.

## Gap

No path. Adds layout spacing.

## Rest Mark

Reserved for later temporal-mode or long-silence representation.

---

# 17. Integration with Existing Glyph Pipeline

Current:

```text
Beat Units
→ Mapping
→ Arch Grammar
→ Manuscript Layout
→ SVG Export
```

Required:

```text
Beat Units
→ Mapping
→ Pulse Arch Generation
→ Connection Grammar
→ Glyph Run Formation
→ Manuscript Layout
→ SVG Export
```

## Required invariant

Connection grammar must not change:

- pulse count;
- beat timing;
- source analysis;
- energy values;
- section IDs;
- chronological order.

It only changes continuity and punctuation.

---

# 18. Layout Interaction

## Manuscript View

- connect only inside the same row;
- break at row wrap;
- carry section identity into the next row;
- preserve punctuation at the row edge when possible;
- never draw a connector across rows.

## Portrait View

Same as manuscript view with multi-page support later.

## Square View

Future behavior:

- allow longer connected sections;
- use section breaks as composition events;
- preserve chronology;
- avoid connectors that jump across unrelated layout regions.

## Spiral View

Future behavior:

- connect along the spiral path;
- use section boundaries to create orbit gaps or orbit changes;
- never connect across distinct orbit breaks.

## Timeline View

Future behavior:

- connections may be more diagrammatic;
- section segmentation is primary;
- full script continuity may be optional.

---

# 19. UI Specification

## 19.1 Connection Panel

Location:

```text
MUSIC → AudioLab → Glyph → upper control panel
```

## Primary Controls

### Connection mode

```text
Never
Within bar
Within phrase
Within section
Always
```

### Bar boundary

```text
None
Dot
Gap
Break
Dot + gap
```

### Phrase boundary

```text
None
Gap
Break
Dot cluster
Break + dot
```

### Section boundary

```text
Break
Large gap
Break + dot cluster
New row
```

### Silence boundary

```text
Extended gap
Break
Dot
Rest mark
```

### Connector style

```text
Straight
Soft sag
Soft rise
Tension curve
Inherited curvature
```

## Advanced Controls

- connector distance;
- baseline tolerance;
- sag amount;
- rise amount;
- tension;
- smoothing;
- dot size;
- punctuation gap;
- section-gap multiplier;
- allow minor crossings;
- allow connector overrun.

## Recommended v1 UI

Expose only:

```text
Connection mode
Bar punctuation
Break at section
Connector style
Gap size
Dot size
```

Keep advanced controls inside a disclosure panel.

---

# 20. Preview Behavior

## Live Preview

Changing any connection control must:

- update preview immediately;
- not alter saved composition until explicit Save;
- preserve current playback position;
- preserve selected pulse;
- not rerun audio analysis;
- not regenerate pulse count;
- only rebuild connections, runs, layout, and SVG geometry.

## Playhead

The current pulse highlight must remain visible through connected runs.

Recommended behavior:

- current pulse arch uses active color;
- connector into current pulse may also highlight;
- completed pulses return to default stroke;
- section boundaries remain visible during playback.

---

# 21. Persistence

## Composition Snapshot

A saved Glyph Composition must preserve:

```ts
connectionGrammarId: string;
connectionGrammarSnapshot: ConnectionGrammar;
connectionOverrides: ConnectionOverride[];
```

Add these fields to `GlyphComposition`.

## Reproducibility

The connection grammar snapshot must participate in the composition cache key.

Revised key input:

```ts
export type GlyphCacheKeyInput = {
  analysisId: string;
  analysisVersion: string;
  mappingPresetSnapshot: MappingPreset;
  grammarSnapshot: GlyphGrammar;
  connectionGrammarSnapshot: ConnectionGrammar;
  layoutPresetSnapshot: ManuscriptLayoutPreset;
  seed: number;
  rendererVersion: string;
};
```

Changing any connection setting must change the cache key.

---

# 22. SVG Export

## Requirements

- preview and export use the same run and connector geometry;
- no DOM scraping;
- connected runs may export as one path or a deterministic ordered path set;
- punctuation exports as vector geometry;
- no text;
- no raster images;
- no filters;
- physical dimensions in millimeters;
- round caps and joins;
- deterministic path order;
- section breaks must remain visually distinct.

## AxiDraw Considerations

Connection grammar should reduce unnecessary pen lifts.

However, v1 must prioritize visual truth over aggressive travel optimization.

Do not reorder pulse chronology merely to reduce travel.

---

# 23. Diagnostics

Temporary diagnostics should expose:

```text
source pulses
generated arches
connection candidates
connected pairs
broken pairs
punctuated boundaries
runs
rows
pages
visible pulses
```

Example:

```text
512 pulses
512 arches
511 connection candidates
430 connected
81 broken/punctuated
82 runs
32 rows
2 pages
512 visible
```

These counters are essential for confirming that the full song is represented.

---

# 24. Warnings

```ts
export type ConnectionWarning =
  | {
      type: "distanceExceeded";
      fromPulseId: string;
      toPulseId: string;
    }
  | {
      type: "baselineDeltaExceeded";
      fromPulseId: string;
      toPulseId: string;
    }
  | {
      type: "collisionDetected";
      fromPulseId: string;
      toPulseId: string;
    }
  | {
      type: "layoutBoundary";
      fromPulseId: string;
      toPulseId: string;
    }
  | {
      type: "manualOverrideRejected";
      fromPulseId: string;
      toPulseId: string;
      reason: string;
    };
```

Warnings should be inspectable but must not block rendering unless geometry cannot be produced safely.

---

# 25. Error Handling

## Guard Clauses

- Reject missing pulse-to-glyph mappings.
- Reject unsorted pulse input.
- Reject invalid grammar ranges.
- Reject negative connector thresholds.
- Reject unsupported boundary behavior.
- Reject connection attempts across pages.
- Fall back to a break when path construction fails.
- Never allow one failed connector to abort the whole composition.

## User-Facing Errors

```text
Connection grammar could not be applied to 3 pulse pairs.
Those pairs were rendered as breaks.
```

---

# 26. Tests

## Unit Tests

### `connectionGrammar.test.ts`

- each connection mode;
- bar/phrase/section/silence behavior;
- manual overrides;
- chronological guard;
- geometry guard;
- deterministic decisions.

### `glyphRunFormation.test.ts`

- one run;
- multiple section runs;
- bar punctuation;
- phrase gaps;
- section breaks;
- silence;
- row boundary;
- full pulse preservation.

### `connectorGeometry.test.ts`

- straight;
- soft sag;
- soft rise;
- tension curve;
- inherited curvature;
- same input produces same path;
- invalid geometry falls back to break.

### `punctuationGeometry.test.ts`

- dot;
- dot cluster;
- gap;
- rest mark;
- deterministic spacing;
- plot-safe output.

### `glyphCacheKey.test.ts`

Changing:

- connection mode;
- boundary behavior;
- connector style;
- threshold;
- punctuation;
- manual override;

must change the cache key.

## Integration Tests

```text
Beat Units
→ Pulse Arches
→ Connection Grammar
→ Runs
→ Layout
→ SVG
```

Validate:

- source pulse count equals generated pulse count;
- generated pulse count equals placed pulse count;
- all pulses remain visible or explicitly paginated;
- section boundaries break correctly;
- exported SVG matches preview geometry.

## Manual Verification

- one steady four-on-the-floor track;
- one rhythmically dense track;
- one ambient or weak-beat track;
- one track with manually created section boundaries;
- one long-form track.

---

# 27. Acceptance Criteria

The feature passes when:

1. One confirmed pulse produces one arch.
2. Pulse count is unchanged by connection settings.
3. Adjacent pulses inside a section connect by default.
4. Section boundaries break the line.
5. Bar boundaries punctuate without forcing a break by default.
6. Phrase boundaries create larger spacing by default.
7. Geometry-incompatible pairs break gracefully.
8. Connection decisions are deterministic.
9. The same preview geometry is exported to SVG.
10. Saved compositions restore identical connections.
11. Cache keys change when connection settings change.
12. Full-song pulse coverage is preserved.
13. Diagnostics report no silent truncation.
14. The result reads more like connected handwriting than repeated isolated stamps.
15. No unrelated repository files are modified.

---

# 28. Suggested File Plan

## New Data Files

```text
music/src/data/glyphConnectionTypes.ts
```

## New Logic Files

```text
music/src/logic/glyph/connectionGrammar.ts
music/src/logic/glyph/glyphRunFormation.ts
music/src/logic/glyph/connectorGeometry.ts
music/src/logic/glyph/punctuationGeometry.ts
```

## New Tests

```text
music/src/logic/glyph/connectionGrammar.test.ts
music/src/logic/glyph/glyphRunFormation.test.ts
music/src/logic/glyph/connectorGeometry.test.ts
music/src/logic/glyph/punctuationGeometry.test.ts
```

## Modified Data Files

```text
music/src/data/glyphCompositionTypes.ts
```

Add:

```ts
connectionGrammarId: string;
connectionGrammarSnapshot: ConnectionGrammar;
connectionOverrides: ConnectionOverride[];
```

## Modified Logic Files

```text
music/src/logic/glyph/glyphCacheKey.ts
music/src/logic/glyph/manuscriptLayout.ts
music/src/logic/glyph/glyphSvgExport.ts
```

## Modified Interface Files

```text
music/src/ui/glyph/GlyphWorkspace.tsx
music/src/ui/glyph/GlyphPreviewCanvas.tsx
```

Optional new UI:

```text
music/src/ui/glyph/GlyphConnectionEditor.tsx
```

---

# 29. Build Order

## Data Layer

1. `glyphConnectionTypes.ts`
2. `glyphCompositionTypes.ts` additions

## Logic Layer

1. `connectionGrammar.ts`
2. `connectorGeometry.ts`
3. `punctuationGeometry.ts`
4. `glyphRunFormation.ts`
5. `glyphCacheKey.ts` update
6. `manuscriptLayout.ts` integration
7. `glyphSvgExport.ts` integration

## Interface Layer

1. `GlyphConnectionEditor.tsx`
2. `GlyphPreviewCanvas.tsx` integration
3. `GlyphWorkspace.tsx` integration
4. Save/snapshot integration
5. Diagnostics

Strict order:

```text
Data
→ Logic
→ Interface
```

---

# 30. First Implementation Slice

```text
One pulse
→ one arch
→ connect within section
→ bar dot
→ section break
→ soft-sag connector
→ manuscript preview
→ save snapshot
→ deterministic SVG
```

## Included Controls

```text
Connection mode
Bar punctuation
Break at section
Connector style
Dot size
Gap size
```

## Deferred Controls

```text
Phrase behavior
Silence rest marks
Manual overrides
Inherited curvature
Collision inspector
Advanced geometry tuning
Square/spiral rules
```

---

# 31. Expected Behavior

For a confirmed track:

1. The system generates one arch per pulse.
2. Pulses within one section join into connected runs.
3. Bar boundaries show dots.
4. Section boundaries visibly break.
5. Playback highlights the current arch inside the connected run.
6. The full song remains represented.
7. Saving preserves the connection grammar snapshot.
8. Reloading regenerates identical runs.
9. SVG export matches the preview.
10. AxiDraw receives fewer unnecessary pen lifts than isolated-pulse output.

---

# 32. Claude Implementation Prompt

```text
Implement the Glyph Notes Connection Grammar according to:

docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md

Goal:
Replace isolated or multi-arch event glyphs with one pulse per arch and deterministic connected runs.

Required default behavior:
- connection mode: withinSection
- bar boundary: dot
- phrase boundary: gap
- section boundary: break
- silence boundary: extendedGap
- connector style: softSag

Build in strict order:
Data → Logic → Interface

Do not alter musical analysis.
Do not change pulse count.
Do not modify apps/glyphlab-reference/.
Do not create packages/.
Do not touch unrelated repository files.

At completion report:
- files created and modified;
- tests run and results;
- pulse/generated/placed/visible counts;
- preview/export parity;
- remaining limitations;
- git status --short.
```

---

# 33. Implementation Guide

- **Where**: Add the specification at `docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md`; implement data under `music/src/data/`, logic under `music/src/logic/glyph/`, and UI under `music/src/ui/glyph/`.
- **What**: Build `glyphConnectionTypes.ts`, connection decision logic, connector and punctuation geometry, explicit run formation, composition snapshots, cache-key integration, preview controls, tests, and SVG parity in strict Data → Logic → Interface order.
- **Expect**: Every pulse becomes one arch; arches connect into readable handwritten runs inside sections; bars punctuate; section boundaries break; the full song remains visible; saved and exported results regenerate identically.
