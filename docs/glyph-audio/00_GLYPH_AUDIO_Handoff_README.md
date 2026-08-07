# Glyph Audio Handoff

## Purpose

Glyph Audio is a beat-first asemic music transcription application.

It converts musical structure into a reusable, customizable, reproducible monoline visual language. The first practical use is creating cover art from Frank's music. The same system may later produce AxiDraw plots, posters, album objects, animated SVG visualizers, stream graphics, photographic interventions, map-like compositions, and three.js geometry.

## Current repository state

- GlyphLab reference application: `apps/glyphlab-reference/`
- Preserved reference commit: `79e5c4c`
- GlyphLab is reference code and a potential source of reusable drawing infrastructure.
- GlyphLab is **not** the production application and must not define the new product architecture by default.
- The repository currently contains unrelated MAPS, itinerary, orb, overlay, vehicle, and stem work in the working tree.
- Do not clean, reset, restore, stage, rename, or commit unrelated files.

## Production placement

Glyph is implemented inside MUSIC under AudioLab, beside Looper:

```text
MUSIC
└── AUDIOLAB
    ├── Looper
    └── Glyph
```

Production code lives under `music/src/`. Do not create a standalone app shell or a new `packages/` architecture during the first implementation.

## Product definition

> A beat-first asemic transcription app that converts audio into customizable monoline visual language and plot-ready SVG.

The system is not conventional notation, a waveform visualizer, a font generator, or random generative decoration.

## Read order

1. `01_GLYPH_AUDIO_Product_Brief.md`
2. `02_GLYPH_AUDIO_Visual_Language_Principles.md`
3. `03_GLYPH_AUDIO_Musical_Unit_Model.md`
4. `04_GLYPH_AUDIO_Reference_Catalog.md`
5. `05_GLYPH_AUDIO_Mapping_Grammar_Spec.md`
6. `06_GLYPH_AUDIO_Glyph_Grammar_01.md`
7. `07_GLYPH_AUDIO_Layout_Spec.md`
8. `08_GLYPH_AUDIO_GlyphLab_Reuse_Audit.md`
9. `09_GLYPH_AUDIO_MVP_Spec.md`
10. `10_GLYPH_AUDIO_Acceptance_Criteria.md`
11. `11_GLYPH_AUDIO_Decisions_and_Open_Questions.md`
12. `12_GLYPH_AUDIO_Repository_Context.md`

## First Claude assignment

1. Read the full packet.
2. Inspect `apps/glyphlab-reference/`.
3. Inspect existing AudioLab and MUSIC analysis code only where relevant.
4. Produce a file-by-file implementation plan for the MVP.
5. Identify all assumptions that require approval.
6. Do not modify code until the plan is approved.

## Non-negotiable design principles

- Beat-first.
- Monoline.
- Handmade in appearance.
- Reproducible through deterministic seeds.
- AxiDraw-safe SVG is a primary output.
- Musical analysis is stored independently from visual mappings.
- One initial arch-based gesture family, not an uncontrolled symbol collection.
- Dots, gaps, and spacing act as punctuation and structural units.
- The visual result should read as writing, notation, inscription, or manuscript.
- The output must not default to generic audio-reactive decoration.

## First build boundary

```text
Import one audio file
→ detect and inspect beats
→ derive musical units
→ apply one configurable glyph grammar
→ render one manuscript layout
→ adjust mappings
→ export model-driven SVG
→ save and reload project JSON
```

No full standalone library platform, live input, stem separation, three.js, RADIO/MAPS integration, or direct plotter control in the MVP. MUSIC integration is the product placement and persistence foundation.
