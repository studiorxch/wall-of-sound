# Glyph Audio — Product Brief

## Product statement

Glyph Audio is a focused AudioLab workspace inside MUSIC, positioned beside Looper, for translating musical structure into a reusable visual language.

It accepts a song or recording, analyzes its temporal and expressive properties, converts those properties into parameterized monoline glyphs, arranges the glyphs through a selected layout, and exports reproducible vector work.

## Immediate use

The first practical project is Frank's cover art.

The tool should allow one song to produce several materially different but structurally related outputs:

- manuscript-like rows;
- a square cover composition;
- later, spiral or radial arrangements;
- plot-ready SVG;
- raster previews for review and publishing.

The purpose of the first project is not merely to generate a cover. It is to test whether music can produce a coherent visual language that remains reusable across print, motion, and future systems.

## Long-term uses

### Print and physical artifacts

- AxiDraw editions;
- posters;
- cover inserts;
- album folios;
- certificates tied to a recording;
- plotted maps of musical time;
- merchandise and patterned surfaces.

### Digital and social outputs

- square and vertical artwork;
- progressive SVG drawing;
- lightweight stream visualizers;
- synchronized social clips;
- animated text-like overlays;
- web backgrounds;
- RADIO and MAPS integrations.

### Future spatial outputs

- three.js paths;
- extruded glyph geometry;
- animated route fields;
- photo overlays;
- projected inscriptions;
- environmental or installation graphics.

## Product architecture

```text
Audio
→ Analysis
→ Musical Units
→ Mapping Grammar
→ Glyph Generation
→ Layout
→ Render / Export
```

Each stage must remain independently replaceable.

The analysis should not directly draw. The glyph generator should not decide page composition. The layout should not reinterpret the music. Renderers should consume a stable composition model.

## Product surfaces

### Active workspace

The MUSIC AudioLab / Glyph view is one continuous workspace:

- source audio;
- playback;
- analysis controls;
- glyph grammar;
- mapping controls;
- layout controls;
- preview;
- export.

### Embedded saved shelf

A lightweight shelf may sit below the active workspace:

- source sessions;
- saved mapping presets;
- saved glyph grammars;
- variations;
- final exports.

This is not a separate application or a second audio library. It is the workstation's memory inside MUSIC.

## What the product is

- a visual-language workstation for sound;
- a beat-first transcription system;
- a configurable musical-to-visual interpreter;
- a reproducible vector generator;
- a bridge between sound, drawing, plotting, motion, and later spatial rendering.

## What the product is not

- conventional sheet music;
- a universal notation standard;
- a fake alphabet;
- a typeface generator;
- a waveform tracer;
- an equalizer;
- a particle visualizer;
- a random art generator;
- a system that depends on color or glow to create meaning;
- an image generator attempting to illustrate the song literally.

## Differentiation

Most audio-reactive visuals disappear frame by frame. Glyph Audio creates persistent marks that accumulate into an artifact.

The output should retain evidence of:

- pulse;
- grouping;
- interruption;
- intensity;
- repetition;
- variation;
- silence;
- sections;
- progression through time.

The same composition may then be rendered as a printed page, animated drawing, social visual, or 3D path field.

## Success condition

The first successful version should generate two visibly different, musically traceable manuscripts from two very different recordings while retaining one coherent visual grammar.
