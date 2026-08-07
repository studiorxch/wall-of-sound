# Glyph Audio — Consolidated Implementation Plan

Placement is approved: Glyph lives inside MUSIC under AudioLab, beside Looper. This document is the complete, standalone plan for building it. No code has been modified — this is planning only.

---

## 1. Exact TypeScript data models

Six new files under `music/src/data/`, plus additions to the existing `PlayProject` type. Every record carries its own `schemaVersion` literal, matching the versioning convention MUSIC already uses on `PlayProject` (`schemaVersion: "play-project-v2"`, `music/src/data/playProjectTypes.ts:212`).

### `music/src/data/glyphStrokeTypes.ts`

```ts
export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; mode?: "freehand" | "pen" };
export type Glyph = { strokes: Stroke[] };
export type GlyphBounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
```

### `music/src/data/glyphAudioTypes.ts`

```ts
export type UnitId = string;

export type Confidence = {
  value: number; // 0.0–1.0
  source: "analysis" | "manual" | "derived";
};

export type TrackUnit = {
  id: UnitId;
  durationSeconds: number;
  detectedBpm: number | null;
  timeSignature: { beatsPerBar: number; beatUnit: number } | null;
};

export type SectionUnit = {
  id: UnitId;
  index: number;
  startBeat: number;
  durationBeats: number;
  energy: number;
  novelty: number;
  confidence: Confidence;
};

export type PhraseUnit = {
  id: UnitId;
  sectionId: UnitId;
  index: number;
  startBeat: number;
  durationBeats: number;
  confidence: Confidence;
};

export type BarUnit = {
  id: UnitId;
  sectionId: UnitId;
  phraseId: UnitId | null;
  index: number;
  startBeat: number;
  durationBeats: number;
  energy: number;
  confidence: Confidence;
};

export type BeatUnit = {
  id: UnitId;
  sectionId: UnitId;
  phraseId: UnitId | null;
  barId: UnitId;
  index: number;
  indexWithinBar: number;
  startSeconds: number;
  durationSeconds: number;
  startBeat: number;
  durationBeats: number;
  energy: number;
  attackSharpness: number;
  onsetDensity: number;
  sustain: number;
  pitchMovement: number | null;
  spectralBrightness: number | null;
  accentStrength: number;
  confidence: Confidence;
};

export type BoundaryUnit = {
  id: UnitId;
  kind: "bar" | "phrase" | "section";
  startBeat: number;
  strength: number;
  confidence: Confidence;
};

export type SilenceUnit = {
  id: UnitId;
  startBeat: number;
  durationBeats: number;
  context: "within-beat" | "between-beats" | "between-bars" | "between-phrases" | "between-sections";
  confidence: Confidence;
};

export type MusicalAnalysisDocument = {
  schemaVersion: 1;
  analyzerVersion: string;
  sourceAudioId: string;
  createdAt: string;
  track: TrackUnit;
  sections: SectionUnit[];
  phrases: PhraseUnit[];
  bars: BarUnit[];
  beats: BeatUnit[];
  boundaries: BoundaryUnit[];
  silences: SilenceUnit[];
};
```

### `music/src/data/glyphMappingTypes.ts`

```ts
export type MusicalSourceProperty =
  | "energy" | "durationBeats" | "attackSharpness" | "onsetDensity" | "sustain"
  | "pitchMovement" | "spectralBrightness" | "accentStrength" | "barPosition"
  | "sectionEnergy" | "sectionNovelty" | "confidence";

export type VisualTargetProperty =
  | "glyphHeight" | "glyphWidth" | "curveSharpness" | "archCount" | "baselineOffset"
  | "spacingBefore" | "spacingAfter" | "connectorLength" | "connectorSag"
  | "dotSize" | "dotOffset" | "asymmetry" | "localCompression" | "handmadeVariance";

export type MappingCurve = "linear" | "easeIn" | "easeOut" | "easeInOut" | "smoothStep" | "stepped";

export type MappingRule = {
  id: string;
  name: string;
  source: MusicalSourceProperty;
  target: VisualTargetProperty;
  inputRange: [number, number];
  outputRange: [number, number];
  curve: MappingCurve;
  invert: boolean;
  clamp: boolean;
  enabled: boolean;
  priority: number;
};

export type BoundaryRule = {
  id: string;
  boundary: "bar" | "phrase" | "section";
  output: "dot" | "dotCluster" | "gap" | "lineBreak" | "baselineShift" | "grammarVariation";
  amount: number;
  enabled: boolean;
};

export type MappingPreset = {
  id: string;
  schemaVersion: 1;
  name: string;
  description: string;
  grammarId: string;
  rules: MappingRule[];
  boundaryRules: BoundaryRule[];
  createdAt: string;
  updatedAt: string;
};

export type GlyphParameterSet = {
  height: number;
  width: number;
  curveSharpness: number;
  archCount: number;
  baselineOffset: number;
  spacingBefore: number;
  spacingAfter: number;
  connectorLength: number;
  connectorSag: number;
  dotSize: number;
  dotOffset: number;
  asymmetry: number;
  localCompression: number;
  handmadeVariance: number;
};

export type MappingTrace = {
  beatUnitId: string;
  presetId: string;
  appliedRules: Array<{ ruleId: string; sourceValue: number; mappedValue: number; target: VisualTargetProperty }>;
};
```

### `music/src/data/glyphGrammarTypes.ts`

```ts
import type { Stroke } from "./glyphStrokeTypes";

export type ArchGrammarParameters = {
  archCount: number;
  width: number;
  height: number;
  curveSharpness: number;
  asymmetry: number;
  baselineOffset: number;
  connectorLength: number;
  connectorSag: number;
  entryOvershoot: number;
  exitOvershoot: number;
  localCompression: number;
  dotEnabled: boolean;
  dotSize: number;
  dotOffset: number;
  handmadeVariance: number;
};

export type GlyphInstanceId = string;

export type GeneratedGlyphInstance = {
  id: GlyphInstanceId;
  beatUnitId: string;
  grammarId: "arch-script-v1";
  parameters: ArchGrammarParameters;
  seed: number;
};

// Envelope around ArchGrammarParameters so "which grammar is active" and its
// saved, user-editable base-gesture override are addressable as one record,
// mirroring MappingPreset's shape.
export type GlyphGrammar = {
  id: string;
  schemaVersion: 1;
  grammarType: "arch-script-v1";
  name: string;
  // Optional manually-drawn/edited base gesture overriding the procedural
  // arch generator for this grammar record. Absent = fully procedural.
  baseGestureOverride?: Stroke[];
  defaultParameters: ArchGrammarParameters;
  createdAt: string;
  updatedAt: string;
};
```

### `music/src/data/glyphLayoutTypes.ts`

```ts
export type GlyphSequenceItem = {
  glyphInstanceId: string;
  beatUnitId: string;
  startBeat: number;
  durationBeats: number;
  barIndex: number;
  phraseIndex: number | null;
  sectionIndex: number;
  spacingBefore: number;
  spacingAfter: number;
};

export type PlacedGlyph = {
  glyphInstanceId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
  rowIndex: number;
  orderIndex: number;
};

export type LayoutDocument = {
  schemaVersion: 1;
  layoutPresetId: string;
  page: { widthMm: number; heightMm: number; marginMm: number };
  placedGlyphs: PlacedGlyph[];
};

export type ManuscriptLayoutPreset = {
  id: string;
  type: "manuscriptRows";
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  barsPerRow: number;
  rowGapMm: number;
  baseBeatWidthMm: number;
  alignBars: boolean;
  sectionStartsNewRow: boolean;
  preserveSilence: boolean;
};
```

### `music/src/data/glyphCompositionTypes.ts`

```ts
import type { MusicalAnalysisDocument } from "./glyphAudioTypes";
import type { LayoutDocument } from "./glyphLayoutTypes";

// A plain foreign key into Track.trackId (music/src/data/trackTypes.ts:195),
// the exact identity field every other MUSIC domain (LoopAsset.sourceTrackId,
// SongSection.sourceTrackId) already keys off of. "local_import" covers a
// session-only, ephemeral Track built from a file picker, never written into
// libraryTracksRef.
export type GlyphSourceRef =
  | { kind: "library_track"; trackId: string }
  | { kind: "local_import"; importId: string; filename: string };

export type GlyphComposition = {
  id: string;
  schemaVersion: 1;
  name: string;
  source: GlyphSourceRef;
  sourceDurationSeconds: number;

  analysis: MusicalAnalysisDocument;
  mappingPresetId: string;
  grammarId: string;
  layoutPresetId: string;
  seed: number;

  // Cached, regenerable-on-demand — never the source of truth. Analysis +
  // preset + grammar + layout + seed are the source of truth; this exists
  // only to avoid recomputing on every open.
  cachedLayout?: LayoutDocument;

  createdAt: string;
  updatedAt: string;
};

export type RenderProfile = {
  id: string;
  schemaVersion: 1;
  name: string;
  strokeWidthMm: number;
  strokeColor: string;
  dotRadiusMm: number;
  roundCapsAndJoins: true;
  backgroundColor: "none";
};

export type ExportRecord = {
  id: string;
  compositionId: string;
  exportedAt: string;
  format: "svg";
  renderProfileId: string;
  fileName: string;
  metadata: {
    compositionId: string;
    compositionUpdatedAt: string;
    analyzerVersion: string;
    mappingPresetId: string;
    mappingPresetUpdatedAt: string;
    grammarId: string;
    layoutPresetId: string;
    seed: number;
    rendererVersion: string;
  };
};
```

### Additions to `music/src/data/playProjectTypes.ts`

```ts
glyphCompositions: GlyphComposition[];
glyphMappingPresets: MappingPreset[];
glyphGrammars: GlyphGrammar[];
glyphLayoutPresets: ManuscriptLayoutPreset[];
glyphRenderProfiles: RenderProfile[];
glyphExportRecords: ExportRecord[];
```

These six arrays live inside the one existing `PlayProject` document (`schemaVersion: "play-project-v2"`), persisted through the one existing IndexedDB database `MUSIC_STATE_DB`, store `stateRecords` (`music/src/logic/musicStateStore.ts:48-49`). No new database, no new store.

---

## 2. Exact new and modified files

### New — data layer (`music/src/data/`)
- `glyphStrokeTypes.ts`
- `glyphAudioTypes.ts`
- `glyphMappingTypes.ts`
- `glyphGrammarTypes.ts`
- `glyphLayoutTypes.ts`
- `glyphCompositionTypes.ts`

### New — logic layer (`music/src/logic/glyph/`)
- `glyphStrokeGeometry.ts` — `snap()`, `getGlyphBounds()`, `buildSmoothPathData()`, copied and generalized from `apps/glyphlab-reference/src/App.tsx:43-45, 47-79, 81-116` (that file is read, never edited).
- `beatGridAdapter.ts` — turns `Track.beatMap` (`music/src/data/beatMapTypes.ts`) and `CompleteSongAnalysis` (`music/src/data/songAnalysisTypes.ts`) into a first-pass, user-reviewable beat grid, including new per-beat feature extraction (see §7, item 3 — this is real new DSP work, not a thin adapter).
- `beatUnitDerivation.ts` — beat grid + analysis profiles → `BeatUnit[]` / `BoundaryUnit[]` / `SilenceUnit[]`.
- `mappingEvaluation.ts` — `MappingPreset` + `BeatUnit` → `GlyphParameterSet` + `MappingTrace`.
- `handmadeDeformation.ts` — deterministic, seeded deformation.
- `archGrammar.ts` — `ArchGrammarParameters` → `Stroke[]` geometry.
- `manuscriptLayout.ts` — `GlyphSequenceItem[]` + `ManuscriptLayoutPreset` → `PlacedGlyph[]`.
- `glyphSvgExport.ts` — pure `(LayoutDocument, RenderProfile, glyphs) → svgString`, no DOM access.
- `glyphCompositionPersistence.ts` — project JSON export/import + schema validation.

### New — interface layer (`music/src/ui/glyph/`)
- `GlyphWorkspace.tsx` — top-level workspace, mounted at `viewMode === "glyph_audio"`.
- `GlyphSourcePanel.tsx` — track picker / local import.
- `GlyphBeatGridReview.tsx` — play/pause, beat markers, add/move/remove, confirm.
- `GlyphMappingEditor.tsx` — mapping rule controls.
- `GlyphGrammarEditor.tsx` — arch-grammar parameter controls + optional manual base-gesture editing, reusing the pointer-handler pattern from `apps/glyphlab-reference/src/App.tsx:315-445` (draw/pen/erase), generalized to drop the character gate.
- `GlyphPreviewCanvas.tsx` — live SVG preview, playhead-synced.
- `GlyphCompositionsGrid.tsx` / `GlyphCompositionsRows.tsx` — lower collection, modeled on `music/src/ui/maps/MapsGeographicGrid.tsx` / `MapsGeographicRows.tsx`'s shared-prop-contract pattern.
- `GlyphExportPanel.tsx` — export trigger + `ExportRecord` write.

### Modified — existing MUSIC files

- **`music/src/ui/FileManager.tsx`** — add `"glyph_audio"` to the `ViewMode` union (line 12); add one new `NavRow` inside the existing "AudioLab" `fm-section` (lines 142-150), beside the existing "Looper" row: `label="Glyph"`, `active={viewMode === "glyph_audio"}`, `onClick={() => onViewModeChange("glyph_audio")}`.
- **`music/src/App.tsx`** — add `glyphSourceTrackId: string | null` state and a `handleSelectGlyphSourceTrack(trackId)` handler, mirroring `looperSourceTrackId` (line 365) and `handleSelectLooperSourceTrack` (lines 1907-1908); add a new `viewMode === "glyph_audio"` branch in the render chain (beside the existing `sectional_looper` branch at lines 6614-6644) mounting `<GlyphWorkspace>` with `resolveTrackUrl={getTrackPlayUrl}` (line 263-271) and the same `onAuditionTrack`/`auditionTrackId`/`playbackStatus`/`onPauseTrack`/`onResumeTrack`/`currentTimeSeconds` transport props already threaded to the Review dialogs; add the six new `glyphCompositions` etc. state arrays and their setters; define an inline `onOpenInGlyph` handler where `<MainTrackWindow>` is rendered, mirroring the existing inline `onCreateLoops` handler at line 6827.
- **`music/src/ui/MainTrackWindow.tsx`** — declare `onOpenInGlyph?: (trackId: string) => void` in both `Props` interfaces where `onCreateLoops?: (trackId: string) => void` is already declared (lines 79 and 968); destructure and pass it through to `<TrackInspector>` exactly as `onCreateLoops` is (destructured at line 1921, passed at line 2002).
- **`music/src/ui/TrackInspector.tsx`** — add a fifth footer button beside the existing four (`onAnalyzeTrack`/"Analyze" at lines 555-559, `onReanalyze`/"Reanalyze" at 560-564, `onCreateLoops`/"Create Loops" at 565-569, `onExportStems`/"Export Stems" at 577-581), same conditional shape:
  ```tsx
  {onOpenInGlyph && (
    <button className="tb-btn" onClick={() => onOpenInGlyph(track.trackId)} title="Open in AUDIOLAB / Glyph">
      Open in Glyph
    </button>
  )}
  ```
- **`music/src/logic/library/trackReferenceReport.ts`** — add `glyphCompositions?: GlyphComposition[]` to `FindTrackReferencesInput` (lines 30-37) and a matching filter inside `findTrackReferences` (line 39): compositions whose `source.kind === "library_track" && source.trackId === trackId`.
- **`music/src/data/playProjectTypes.ts`** — add the six new arrays listed in §1.

### Not touched
- `apps/glyphlab-reference/` — read-only reference throughout. No file inside it is edited.
- `music/src/ui/library/LibraryActionBar.tsx` — a Catalog-row "Open in Glyph…" bulk-menu action is a secondary, optional entry point. The detail-panel button above is the primary entry point and is sufficient for the first slice (§8). Building the row-menu variant is deferred, not part of this plan.
- No `packages/` directory is created.

---

## 3. Build order: Data → Logic → Interface

**Data layer**, in this exact order (each file only depends on files before it):
1. `glyphStrokeTypes.ts`
2. `glyphAudioTypes.ts`
3. `glyphMappingTypes.ts`
4. `glyphGrammarTypes.ts` (depends on `glyphStrokeTypes.ts`)
5. `glyphLayoutTypes.ts`
6. `glyphCompositionTypes.ts` (depends on `glyphAudioTypes.ts`, `glyphLayoutTypes.ts`)
7. `playProjectTypes.ts` additions (depends on all of the above)

**Logic layer**, in this exact order:
1. `glyphStrokeGeometry.ts` (depends on `glyphStrokeTypes.ts`)
2. `beatGridAdapter.ts` (depends on `glyphAudioTypes.ts`, `beatMapTypes.ts`, `songAnalysisTypes.ts`)
3. `beatUnitDerivation.ts` (depends on `beatGridAdapter.ts`)
4. `mappingEvaluation.ts` (depends on `glyphMappingTypes.ts`, `glyphAudioTypes.ts`)
5. `handmadeDeformation.ts` (depends on nothing but a seed — no audio, no DOM)
6. `archGrammar.ts` (depends on `glyphStrokeGeometry.ts`, `handmadeDeformation.ts`, `glyphGrammarTypes.ts`)
7. `manuscriptLayout.ts` (depends on `glyphLayoutTypes.ts`)
8. `glyphSvgExport.ts` (depends on `glyphLayoutTypes.ts`, `glyphCompositionTypes.ts`)
9. `glyphCompositionPersistence.ts` (depends on `glyphCompositionTypes.ts`)

Each logic module gets its unit tests (§4) before the next module begins — every module consumes the previous stage's output type directly, so a bug caught early never propagates silently into the next stage.

**Interface layer**, in this exact order:
1. `GlyphSourcePanel.tsx`
2. `GlyphBeatGridReview.tsx`
3. `GlyphGrammarEditor.tsx`
4. `GlyphMappingEditor.tsx`
5. `GlyphPreviewCanvas.tsx`
6. `GlyphCompositionsGrid.tsx` / `GlyphCompositionsRows.tsx`
7. `GlyphExportPanel.tsx`
8. `GlyphWorkspace.tsx` — assembles all seven above into the one workspace component
9. The wiring changes to existing files last: `FileManager.tsx` → `App.tsx` → `MainTrackWindow.tsx` → `TrackInspector.tsx` → `trackReferenceReport.ts`. These land only once `GlyphWorkspace.tsx` is provably correct in isolation, since they're the only changes that touch shared MUSIC files.

---

## 4. Testing plan

**Unit tests**, one colocated `*.test.ts` per logic module, matching MUSIC's existing convention:

- `glyphStrokeGeometry.test.ts` — bounds computation on 0/1/many points; path-data shape for `"freehand"` (quadratic-smoothed) vs `"pen"` (straight-line) modes.
- `beatGridAdapter.test.ts` — a synthetic fixture with a known, fixed BPM and known section boundaries; verify beat timestamps and confidence propagate correctly; verify a track with no `beatMap` produces the documented low-confidence fallback rather than throwing.
- `beatUnitDerivation.test.ts` — confidence propagates from source data into `BeatUnit.confidence`; silence detection produces `SilenceUnit`s in the documented contexts (within-beat, between-beats, between-bars, between-phrases, between-sections).
- `mappingEvaluation.test.ts` — every `MappingCurve` variant (`linear`/`easeIn`/`easeOut`/`easeInOut`/`smoothStep`/`stepped`); `clamp`/`invert` behavior; rule `priority` ordering when multiple enabled rules target the same property; the "prevent circular mappings" and "warn on conflicting rules" guardrails actually fire.
- `handmadeDeformation.test.ts` — same seed + same inputs → byte-identical output; different seed → different but bounded output; `handmadeVariance = 0` → clean canonical form with zero deformation.
- `archGrammar.test.ts` — arch count 1 through 6 all produce valid, non-self-intersecting monoline paths; `curveSharpness` continuum boundaries (0.35, 0.75) produce visibly distinct rounded/pointed/clipped families; dot punctuation renders as a plot-safe primitive.
- `manuscriptLayout.test.ts` — wrapping occurs only at bar/section boundaries, never mid-glyph and never by character count; `sectionStartsNewRow` toggle behaves correctly; silence produces real horizontal space rather than being omitted.
- `glyphSvgExport.test.ts` — output `width`/`height` are physical units (mm) with a matching `viewBox`; `fill="none"`; zero `<text>` elements; zero filters or raster images; deterministic path order for identical input; no DOM API is called anywhere in the function.
- `glyphCompositionPersistence.test.ts` — JSON round-trip produces an identical `GlyphComposition`; malformed JSON returns a structured error rather than throwing; an unsupported `schemaVersion` is rejected with a clear message.
- `trackReferenceReport.test.ts` (extended, not new) — a `GlyphComposition` whose `source.trackId` matches a fixture `Track.trackId` appears in that track's reference report.

**Integration fixture:**
- One deterministic synthetic beat fixture — a hand-authored, fixed-BPM, no-real-audio input — drives the full pipeline end to end (`beatGridAdapter` → `beatUnitDerivation` → `mappingEvaluation` → `archGrammar` → `manuscriptLayout` → `glyphSvgExport`) without decoding audio or touching the DOM.
- One real musical test file, referenced manually by a fixed path under a gitignored fixtures directory, not committed unless rights permit — used for live/manual verification only, never asserted against in CI.

**Playback synchronization:** live-verified in-browser, not unit-tested (real `<audio>` timing cannot be meaningfully unit-tested). Verify the live playhead (`currentTimeSeconds`) maps to the correct highlighted `BeatUnit`/`PlacedGlyph` at several scrub positions, including exactly on a beat boundary.

**Source-track failure cases:** unit-tested at `trackReferenceReport.test.ts` (a composition referencing a removed track appears in the removal report); live-verified in-browser that opening a `GlyphComposition` whose source track no longer resolves shows a clear "source unavailable" state rather than a blank or silently-broken preview, while the already-generated `LayoutDocument`/SVG remain fully viewable and exportable.

**JSON round-trip:** `glyphCompositionPersistence.test.ts`, above.

**SVG validation:** `glyphSvgExport.test.ts`, above, plus a manual check that an exported file opens cleanly in a vector tool before the MVP is considered done — a human visual-review gate, not something a unit test can certify.

**Low-confidence analysis:** unit-tested at `beatUnitDerivation.test.ts` and `mappingEvaluation.test.ts` — a low-confidence `BeatUnit` property must resolve through the documented fallback behavior, never silently produce false visual precision.

**Repository boundary checks:** before any implementation commit, `git status --short` must show a diff touching only the files listed in §2 — no MAPS, itinerary, orb, overlay, vehicle, or stem files, and no changes inside `apps/glyphlab-reference/`.

---

## 5. Repository safety boundaries

**Prohibited Git operations**, not to be run under any circumstance during implementation unless the user explicitly requests the exact operation after reviewing current status:
```text
git reset
git reset --hard
git clean
git restore .
git checkout .
git add .
git add -A
git commit
git rebase
git stash
```

**Allowed read-only Git inspection:**
```text
git status --short
git diff -- <approved-path>
git diff --cached -- <approved-path>
git log --oneline -- <approved-path>
git show <commit> -- <approved-path>
```

**Do not modify `apps/glyphlab-reference/`.** It remains historical reference evidence, preserved exactly as committed at `79e5c4c`. Reusable logic is copied into new MUSIC files (§1, §2), never imported as a live dependency from that app, and the app itself is never refactored in place.

**Do not create a `packages/` directory or any shared-package structure.** All new code lives inside `music/src/`. This repository has no existing workspace tooling (no root `package.json` workspaces field, no `packages/` directory, `apps/glyphlab-reference/` is its own independent Vite project with its own dependency tree) — introducing a package boundary now would mean building that mechanism from scratch to serve zero real second consumers. Revisit only if a genuine second consumer of the stroke/SVG-export code appears later (for example, a RADIO stream-graphic feature wanting to embed a Glyph export).

**Do not touch unrelated working-tree changes.** The repository contains unrelated, in-progress work (MAPS geographic-style renames, itinerary types and runtime, orb profiles, overlay and vehicle rendering changes, track-stem library imports, and other modified/untracked files). None of these are part of this plan. No file outside the exact list in §2 is to be modified, staged, deleted, renamed, or reformatted.

**Data safety:**
- Do not delete source audio.
- Do not rewrite `TrackStemLibrary` files.
- Do not move library imports.
- Do not normalize or rename unrelated assets.
- Do not migrate global storage or change root workspace configuration without separate, explicit approval.

**File modification allowlist for implementation**, once this plan is approved:
```text
music/src/data/glyphStrokeTypes.ts
music/src/data/glyphAudioTypes.ts
music/src/data/glyphMappingTypes.ts
music/src/data/glyphGrammarTypes.ts
music/src/data/glyphLayoutTypes.ts
music/src/data/glyphCompositionTypes.ts
music/src/data/playProjectTypes.ts
music/src/logic/glyph/*.ts
music/src/logic/library/trackReferenceReport.ts
music/src/ui/glyph/*.tsx
music/src/ui/FileManager.tsx
music/src/ui/MainTrackWindow.tsx
music/src/ui/TrackInspector.tsx
music/src/App.tsx
```
No file outside this list should be changed without naming the exact file and reason in a follow-up approval.

---

## 6. Documentation corrections

The Glyph Audio handoff packet (`00` through `12`, presently at `/Users/studio/Downloads/0803_GLYPH_AUDIO_Handoff_Packet_v0.1.0_BUILD/docs/glyph-audio/`, not yet copied into this repository at `docs/glyph-audio/`) contains the following statements that this plan overrides. They should be corrected in the source documents, not left standing:

- **`00_GLYPH_AUDIO_Handoff_README.md`, "Current repository state" / "Proposed production location"** — states the proposed production path is `apps/audiolab-glyph/`, with a `packages/glyph-*` list underneath it. Correct to: production code lives inside `music/src/` (§2); no `packages/` directory is created (§5).
- **`00_GLYPH_AUDIO_Handoff_README.md`, "First build boundary"** — states "No... MUSIC integration... in the MVP." Correct to: MUSIC integration is the placement itself, per this plan.
- **`09_GLYPH_AUDIO_MVP_Spec.md`, "App location"** — states the proposed production app is `apps/audiolab-glyph/`, and separately instructs "Do not modify `apps/glyphlab-reference/` except for narrowly approved extraction work." The second instruction remains correct and is honored (§5, §2); only the app-location claim needs correcting.
- **`09_GLYPH_AUDIO_MVP_Spec.md`, "Explicitly excluded from MVP"** — lists "MUSIC database integration" as excluded. This is the single most significant correction: this plan makes MUSIC database integration (the `PlayProject` arrays in §1) the actual persistence mechanism, not an exclusion.
- **`11_GLYPH_AUDIO_Decisions_and_Open_Questions.md`, "Decided → Repository"** — states "Proposed production app: `apps/audiolab-glyph/`." Correct to match §2.
- **`11_GLYPH_AUDIO_Decisions_and_Open_Questions.md`, closing list** — states that whether MAPS or MUSIC code is modified must not be silently decided. MUSIC code modification (the exact files in §2) is now approved and specified; MAPS code remains untouched, per §5.
- **`12_GLYPH_AUDIO_Repository_Context.md`, "Production application"** — states "Proposed path: `apps/audiolab-glyph/`. Do not create or modify this path until the implementation plan is approved." Correct to the approved file list in §2/§5.
- **`12_GLYPH_AUDIO_Repository_Context.md`, "File modification boundary"** — gives an example allowlist of `apps/audiolab-glyph/`, `docs/glyph-audio/`, `packages/glyph-*/`, `packages/audio-event-model/`. Correct to the exact allowlist in §5, which explicitly names `music/src/App.tsx`, `music/src/ui/FileManager.tsx`, `music/src/ui/MainTrackWindow.tsx`, `music/src/ui/TrackInspector.tsx`, `music/src/data/playProjectTypes.ts`, and `music/src/logic/library/trackReferenceReport.ts` as approved, named, existing-MUSIC files.
- **Operational note, not a content correction:** the packet should be copied into the repository at `docs/glyph-audio/` if that path is going to keep being referenced by name — it currently resolves to nothing inside `wall-of-sound`.

---

## 7. Unresolved decisions requiring approval

These are not settled by this plan and must not be silently decided during implementation:

1. **Per-beat DSP approach.** No code in this repository currently produces genuinely independent per-beat feature data. `Track.beatMap.beatTimesSeconds` is a real detector output but is an evenly-spaced arithmetic extrapolation from one detected BPM, not independently re-tracked per beat. `CompleteSongAnalysis`'s energy/density/brightness/percussive profiles are real but coarse (128 windowed-mean samples across a whole track — several beats per sample at typical tempos). `beatGridAdapter.ts` therefore needs genuine new per-beat feature extraction (sampling the raw decoded audio buffer in a window around each beat timestamp), not a thin adapter over existing data. This is real, non-trivial new DSP work and its scope/approach — reuse MUSIC's existing TS DSP primitives, reuse AudioLab's Python analysis via an offline step, add a browser-side onset library, or combine — needs explicit sign-off before `beatGridAdapter.ts` is written.
2. **Preset/grammar/layout reference semantics.** `GlyphComposition` stores `mappingPresetId`/`grammarId`/`layoutPresetId` as foreign keys to shared, editable records. This means editing a shared preset later retroactively changes what an older, previously-saved composition would regenerate to. The alternative is snapshotting the preset/grammar/layout into the composition at save time. Needs an explicit choice.
3. **Explicit Save step vs. immediate-write editing.** Orb's editing model writes every control change straight through with no Save action at all. The mapping-preset editor's own "save as preset" requirement implies Glyph needs an explicit Save step, at least for presets — needs confirmation that Glyph's editors use Save-based editing rather than Orb's immediate-write model.
4. **`cachedLayout` invalidation rule.** `GlyphComposition.cachedLayout` is explicitly a cache, not the source of truth — needs a concrete invalidation rule (most likely comparing the composition's `updatedAt` against the referenced preset/grammar/layout's own `updatedAt`) before it's relied on anywhere in the UI.
5. **Time signature default.** Whether the MVP assumes 4/4 when time signature is unknown, or always exposes beats-per-bar as an editable, non-authoritative project setting.
6. **Section detection.** Whether v1 uses manual section markers only, or wires up `CompleteSongAnalysis.sections` (which already exist with a `structuralType`/confidence/verification model) as an automatic first pass with manual correction.
7. **Pitch movement.** Whether the field is captured but its visual mapping stays disabled by default until the core energy/sharpness/density/duration mappings are validated first.
8. **Polyphony and voices.** Whether v1 uses one combined beat representation (no drum/bass/tonal row separation), deferring multi-voice layout entirely.
9. **Handmade variation model.** Whether variation is a single global seed with small bounded local modulation, versus a more locally-driven scheme.
10. **Cover composition mode.** Whether a dedicated square manuscript page is built as its own `ManuscriptLayoutPreset` variant, versus deriving a square crop from the row manuscript.
11. **`GlyphComposition.analysis` storage shape.** Embedding the full `MusicalAnalysisDocument` (including the complete per-beat array) inline in each composition is simple but its real size against a 5-8 minute track's beat count has not been measured — needs a size check before committing to inline-embed over a separately keyed store.
12. **Secondary "Open in Glyph" entry point.** Whether a Catalog-row bulk-menu action (in `LibraryActionBar.tsx`) is built alongside the `TrackInspector.tsx` detail-panel button, or deferred past the first slice.
13. **Nav icon and product name.** `FileManager.tsx`'s new `NavRow` needs an icon distinct from Looper's `"science"`, and the docs themselves state no permanent product name is required for the MVP — but the nav label needs picking now regardless ("Glyph" is used throughout this plan as a placeholder).

---

## 8. Smallest first implementation slice

```text
MUSIC track (a real Catalog track, opened via the new TrackInspector.tsx "Open in Glyph" button)
→ reviewed beat grid (play/pause, view markers, confirm — add/move/remove of individual markers deferred)
→ beat units (energy only — attackSharpness/onsetDensity/sustain/pitchMovement/spectralBrightness deferred)
→ configurable arch glyphs (archCount and curveSharpness held at grammar defaults; only height responds to energy, via one hardcoded MappingRule — the full mapping editor UI deferred)
→ live manuscript preview (manuscript rows only, one fixed ManuscriptLayoutPreset — square/A4/custom page modes deferred)
→ saved Glyph Composition (one composition; the Presets/Variations/Exports shelf UI deferred)
→ deterministic SVG (one fixed RenderProfile, one export button — a render-profile editor deferred)
```

**Exact files touched for this slice:**
- Data (full, all six files from §1 — types are cheap to write in full even though only a subset of fields are populated by this slice's logic): `glyphStrokeTypes.ts`, `glyphAudioTypes.ts`, `glyphMappingTypes.ts`, `glyphGrammarTypes.ts`, `glyphLayoutTypes.ts`, `glyphCompositionTypes.ts`.
- Logic: `glyphStrokeGeometry.ts` (full), `beatGridAdapter.ts` (energy only), `beatUnitDerivation.ts` (energy only), `mappingEvaluation.ts` (full — it's generic regardless of how many rules are populated), `handmadeDeformation.ts` (full), `archGrammar.ts` (full), `manuscriptLayout.ts` (manuscript-rows path only), `glyphSvgExport.ts` (full).
- Interface: `GlyphWorkspace.tsx`, `GlyphBeatGridReview.tsx` (minimal — play/pause/confirm only), `GlyphPreviewCanvas.tsx`, `GlyphExportPanel.tsx` (minimal — one button, no profile picker).
- Existing-file wiring: `FileManager.tsx` (nav row), `App.tsx` (viewMode branch, track-selection handler, the six new state arrays populated with one hardcoded default `MappingPreset`/`GlyphGrammar`/`ManuscriptLayoutPreset` seeded at startup so there's something for the pipeline to run against without a preset editor existing yet), `MainTrackWindow.tsx` (prop threading), `TrackInspector.tsx` (the "Open in Glyph" button), `trackReferenceReport.ts` (extended for `glyphCompositions`).
- Deferred entirely from this slice: `GlyphSourcePanel.tsx` (local import), `GlyphMappingEditor.tsx`, `GlyphGrammarEditor.tsx`, `GlyphCompositionsGrid.tsx`/`GlyphCompositionsRows.tsx`, `LibraryActionBar.tsx`, `glyphCompositionPersistence.ts` (JSON export/import — the composition just needs to persist to `PlayProject`, not round-trip as a standalone file yet).

---

## 9. Exact expected behavior for that slice

**User flow:** open MUSIC → Catalog → select any real track → open its detail panel → click the new "Open in Glyph" button (`title="Open in AUDIOLAB / Glyph"`) → MUSIC switches to the AudioLab / Glyph view with that track already loaded → press play, and beat tick-marks appear along a simple timeline at the track's `beatTimesSeconds` positions → press "Confirm Grid" → manuscript rows render below, showing one arch-family glyph per confirmed beat, with taller arches at higher-energy beats and shorter arches at lower-energy beats → press "Save" → the composition persists into the MUSIC project (survives a reload) → press "Export SVG" → a `.svg` file downloads.

**Expected result, checked explicitly:**
- The exported SVG has physical `width`/`height` in millimeters and a matching `viewBox` — not arbitrary pixel numbers.
- Every path has `fill="none"`, a single monochrome `stroke` color, and round caps/joins.
- No `<text>` element appears anywhere in the file.
- The exported centerlines are pixel-identical to what the live preview showed immediately before export.
- Two different real tracks — one clearly higher-energy than the other — produce visibly different arch heights across their manuscripts while remaining recognizably the same coherent arch-gesture family, not two unrelated symbol sets.
- Reopening the saved composition (after a page reload) regenerates the identical manuscript from stored data, without re-decoding or re-analyzing the audio.
- If the source track has since been removed from the Catalog, opening the composition still shows the saved manuscript and still allows re-export, with a clear "source unavailable" indicator replacing playback/live-sync features only.

No code has been written or modified to produce this plan. Implementation begins only after this plan, and specifically the decisions listed in §7, are explicitly approved.