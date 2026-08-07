# Glyph Audio — Approved Decisions and Required Plan Corrections

## Placement

Glyph is implemented **inside MUSIC under AudioLab, beside Looper**.

```text
MUSIC
└── AUDIOLAB
    ├── Looper
    └── Glyph
```

Glyph is not a standalone application and does not introduce a new application shell, navigation model, or independent interface design language.

The UI inherits MUSIC's existing shell, sidebar, typography, spacing, controls, dialogs, playback conventions, persistence conventions, and status/error patterns.

## Workspace structure

The upper portion is the active editor and live preview.

The lower portion is the collection created by the tool.

```text
Upper workspace
- source audio
- playback
- beat-grid review
- analysis
- glyph grammar
- mappings
- layout
- seed and variation
- live SVG preview
- export

Lower collection
- Glyph Compositions
- presets
- variations
- exports
```

Use:

- Looper as the AudioLab placement and audio-input precedent;
- TrackInspector as the primary "Open in Glyph" entry point;
- Orb as the editable-controls/live-preview interaction reference;
- Geographic as the preview-over-collection layout reference;
- GlyphLab as a read-only source of reusable stroke/editor ideas.

## Implementation decisions

1. Reuse MUSIC's existing TypeScript audio decoding and DSP infrastructure.
2. The first implementation slice uses existing beat timestamps and adds direct per-beat energy extraction.
3. Defer attack sharpness, onset density, sustain, pitch mapping, and advanced section behavior until the basic visual pipeline is proven.
4. Use explicit **Save** and **Save as New** behavior. Controls may update the live preview immediately but must not persist automatically.
5. Saved compositions must preserve reproducibility through immutable snapshots or equivalent versioned references for:
   - mapping preset;
   - glyph grammar;
   - layout preset;
   - analysis;
   - seed;
   - renderer version.
6. Add a shared `glyphAnalyses: MusicalAnalysisDocument[]` collection to `PlayProject`.
7. `GlyphComposition` references `analysisId` rather than embedding duplicate full analysis documents.
8. Use a deterministic cache key derived from:
   - analysis;
   - mapping;
   - grammar;
   - layout;
   - seed;
   - renderer version.
9. When time signature is unknown, default to 4 beats per bar but expose it as editable and unconfirmed.
10. Use one combined beat representation in version one.
11. Use one global seed with bounded deterministic local variation.
12. Keep pitch data optional and its mapping disabled by default.
13. Use existing section analysis only as an optional first pass with manual correction.
14. Build square cover output as a dedicated layout preset rather than cropping a manuscript.
15. Defer the Catalog-row action. TrackInspector is the only initial "Open in Glyph" entry point.
16. Use **Glyph** as the working product name.
17. Reuse an existing MUSIC icon rather than adding a new icon asset.
18. Do not create a `packages/` architecture during the first implementation.
19. Do not modify `apps/glyphlab-reference/`.
20. Do not begin implementation until the exact TypeScript models and file plan are amended to reflect these decisions.

## Required data-model correction

Add:

```ts
glyphAnalyses: MusicalAnalysisDocument[];
```

Change the composition analysis field from:

```ts
analysis: MusicalAnalysisDocument;
```

to:

```ts
analysisId: string;
```

A finalized composition must also preserve enough immutable data or snapshots to regenerate exactly even if shared presets are later edited.

Suggested shape:

```ts
type GlyphComposition = {
  id: string;
  schemaVersion: 1;
  name: string;
  source: GlyphSourceRef;
  analysisId: string;

  mappingPresetId: string;
  mappingPresetSnapshot: MappingPreset;

  grammarId: string;
  grammarSnapshot: GlyphGrammar;

  layoutPresetId: string;
  layoutPresetSnapshot: ManuscriptLayoutPreset;

  seed: number;
  cacheKey: string;
  cachedLayout?: LayoutDocument;

  createdAt: string;
  updatedAt: string;
};
```

The exact final type may differ, but reproducibility must not depend solely on mutable shared records.

## First implementation boundary

```text
MUSIC Catalog track
→ TrackInspector "Open in Glyph"
→ reviewed beat grid
→ per-beat energy
→ one energy-to-height mapping
→ Arch Script glyphs
→ manuscript-row preview
→ explicit Save
→ persisted Glyph Composition
→ deterministic SVG export
```

Deferred from this slice:

- local audio import;
- full mapping editor;
- full grammar editor;
- advanced per-beat DSP;
- multi-voice analysis;
- square cover mode;
- composition shelf filters;
- preset management UI;
- PNG export;
- direct AxiDraw control;
- three.js;
- RADIO and MAPS integration.

## Documentation precedence

This document supersedes any earlier handoff statement that says:

- the app should live at `apps/audiolab-glyph/`;
- MUSIC integration is excluded from the MVP;
- a new `packages/` structure should be created;
- Glyph should use a standalone application shell.
