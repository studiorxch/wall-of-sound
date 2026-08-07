# Glyph Audio — Layout Specification

## Principle

Layout arranges an already-generated glyph sequence.

It must not reanalyze the music or change glyph meanings.

```text
musical units
→ generated glyph instances
→ placed glyph instances
→ renderer
```

## Canonical layout input

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
```

## Canonical layout output

```ts
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
  page: {
    widthMm: number;
    heightMm: number;
    marginMm: number;
  };
  placedGlyphs: PlacedGlyph[];
};
```

## Version-one layout: Manuscript Rows

### Purpose

The row manuscript is the clearest test of whether musical rhythm can become writing.

### Rules

- Time progresses left to right.
- Rows progress top to bottom.
- Line breaks occur at musical boundaries.
- A row should contain a configurable number of bars.
- Glyph width may derive from duration but must remain inside plot-safe limits.
- Silence creates real horizontal space.
- Bar punctuation remains visible.
- Section boundaries may force a new row.
- No character-count word wrapping.
- No system-font fallback.
- No hidden clipping.

### Default configuration

```ts
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

Initial suggested values:

```text
page: 210 × 297 mm
margin: 15 mm
bars per row: 4
row gap: 10 mm
section starts new row: true
```

These are test defaults, not permanent design decisions.

## Page modes

The MVP should support:

- A4 portrait;
- square cover;
- custom physical dimensions.

All SVG exports must include physical dimensions and a matching `viewBox`.

## Later layouts

### Spiral

Time advances along a spiral path.

Potential uses:

- record groove analogy;
- galaxy composition;
- full-track cover art;
- progressive drawing animation.

### Radial / Star

Bars or sections radiate around a center.

Potential uses:

- cover art;
- section comparison;
- energy fields.

Risk:

- may become decorative or symmetrical too quickly.

### Circular Groove

A track forms one or more concentric paths similar to record grooves.

### Freeform Cover

A composition-focused layout that preserves event order but allows controlled placement.

### Map / Network

Musical phrases become routes, nodes, clusters, and territories.

### Animated Scroll

The manuscript moves through a stream viewport while new paths draw in time.

### Three-dimensional Path Field

Placed SVG paths become curves for later three.js geometry.

## Layout invariants

All layouts must preserve:

- chronological order unless explicitly documented;
- beat-to-glyph traceability;
- section and boundary relationships;
- deterministic regeneration;
- glyph provenance;
- page or viewport bounds.

## Layout comparison

The same analysis, grammar, mapping preset, and seed should be renderable through multiple layouts without reanalysis.

That is a central product requirement.
