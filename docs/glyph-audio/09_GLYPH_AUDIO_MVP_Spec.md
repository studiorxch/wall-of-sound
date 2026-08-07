# Glyph Audio — MVP Specification

## MVP objective

Prove that one audio file can be converted into a reproducible, beat-first, handmade-looking monoline manuscript using a configurable mapping preset and one arch-based glyph grammar.

## Primary workflow

```text
Import audio
→ analyze beat structure
→ inspect and correct beat grid
→ derive musical units
→ apply mapping preset
→ generate Arch Script glyphs
→ render manuscript rows
→ adjust mappings
→ regenerate deterministically
→ export SVG
→ save and reload project JSON
```

## Product placement

Implement Glyph inside MUSIC under AudioLab, beside Looper.

Production code lives under:

```text
music/src/data/
music/src/logic/glyph/
music/src/ui/glyph/
```

Do not modify `apps/glyphlab-reference/`.

## Input

Required:

- one local audio file;
- WAV and MP3 support where existing browser decoding permits;
- source filename;
- generated stable source ID.

Optional:

- existing MUSIC or AudioLab analysis document if compatible;
- manually entered BPM when detection fails.

## Analysis

Required:

- audio decode;
- beat estimation;
- beat timestamps;
- tempo estimate;
- local beat energy;
- attack sharpness;
- onset density;
- sustain;
- bar grouping;
- confidence values.

Optional:

- pitch movement;
- spectral brightness;
- automatic section detection.

The MVP must remain functional when optional tonal measurements are unavailable.

## Beat-grid review

The user must be able to:

- play and pause audio;
- see beat markers;
- move a beat marker;
- add a beat marker;
- remove a beat marker;
- set or correct BPM;
- confirm the grid.

No visual generation should imply high precision before the beat grid is reviewable.

## Musical units

Required:

- `TrackUnit`;
- `BarUnit`;
- `BeatUnit`;
- `BoundaryUnit`;
- `SilenceUnit` where detectable.

Section and phrase units may begin as manual or simplified structural markers.

## Glyph grammar

Required:

- `Arch Script v1`;
- 1–6 arches;
- width;
- height;
- curve sharpness;
- asymmetry;
- connector behavior;
- dot punctuation;
- deterministic handmade variance.

No broad symbol library is required.

## Mapping editor

Required controls:

- source property;
- target visual property;
- input range;
- output range;
- curve;
- invert;
- enable or disable;
- reset;
- save as preset.

Required default mappings:

```text
energy → height
sustain → width
attack sharpness → curve sharpness
onset density → arch count
bar boundary → dot / gap
section boundary → new row
silence → negative space
```

## Layout

Required:

- manuscript rows;
- square cover page;
- A4 page;
- custom dimensions;
- configurable bars per row;
- configurable margins;
- section starts new row option.

Excluded:

- spiral;
- radial;
- map;
- 3D;
- freeform cover layout.

## Preview

Required:

- real monoline vector preview;
- audio playhead;
- highlighted current beat and glyph;
- page boundary;
- margins;
- optional guides;
- path count;
- estimated plot complexity.

The preview must display the same centerline geometry exported to SVG.

## Project persistence

Required project document:

```ts
export type GlyphAudioProject = {
  schemaVersion: 1;
  id: string;
  name: string;
  sourceAudio: {
    id: string;
    filename: string;
    durationSeconds: number;
  };
  analysis: MusicalAnalysisDocument;
  grammar: {
    id: string;
    version: string;
  };
  mappingPreset: MappingPreset;
  layoutPreset: ManuscriptLayoutPreset;
  seed: number;
  createdAt: string;
  updatedAt: string;
};
```

Required actions:

- save project locally;
- export project JSON;
- import project JSON;
- schema validation;
- unsupported-version error;
- no silent data loss.

## SVG export

Required:

- pure data-to-SVG function;
- no DOM scraping;
- physical `width` and `height` in millimeters;
- matching `viewBox`;
- `fill="none"`;
- monochrome stroke;
- configurable stroke width;
- round caps and joins;
- no text fallback;
- no filters;
- no raster images;
- no hidden UI elements;
- deterministic path order;
- metadata identifying source, preset, grammar, seed, and versions.

## PNG export

Optional for the MVP.

PNG is useful for Frank's cover review, but it must render from the canonical SVG composition rather than become a separate geometry path.

## Lightweight saved shelf

Optional first-pass shelf:

- recent projects;
- saved mapping presets;
- recent variations;
- exported files.

Do not build:

- global search;
- bulk editing;
- collection management;
- dependency graphs;
- MUSIC-scale metadata.

## Explicitly excluded from MVP

- full standalone library platform;
- a separate database outside MUSIC;
- RADIO integration;
- MAPS integration;
- live audio;
- microphone input;
- stem separation;
- instrument recognition;
- multi-voice staff system;
- automatic grammar discovery;
- breeding or mutation UI;
- batch album generation;
- direct AxiDraw control;
- pen travel optimization;
- three.js;
- collaborative editing;
- cloud sync.

## Testing

Required unit tests:

- normalization;
- mapping curves;
- deterministic seed behavior;
- beat-to-glyph conversion;
- arch geometry;
- layout wrapping at bar boundaries;
- SVG physical dimensions;
- JSON import validation;
- low-confidence fallback behavior.

Required integration fixture:

- one deterministic synthetic beat fixture;
- one real musical test file referenced manually, not committed unless rights permit.

## First implementation request to Claude

Produce a build plan only.

The plan must specify:

- exact files to create;
- exact files to inspect;
- which GlyphLab functions are extracted;
- which analysis code is reused;
- new data types;
- test order;
- risks;
- decisions requiring approval.

No code modifications until the plan is accepted.
