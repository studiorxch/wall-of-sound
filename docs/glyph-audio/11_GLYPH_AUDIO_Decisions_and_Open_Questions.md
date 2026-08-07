# Glyph Audio — Decisions and Open Questions

## Decided

### Product

- This is one focused AudioLab workspace inside MUSIC, beside Looper.
- The active workspace is primary.
- A lightweight saved shelf may live below it.
- A full MUSIC-scale library is not part of the MVP.
- The first practical use is Frank's cover art.
- Future uses include plot, print, streams, social media, photographs, maps, and three.js.

### Visual language

- Beat-first.
- Monoline.
- Handmade in appearance.
- Language and inscription over decoration.
- Dots and spacing function as punctuation.
- The first grammar is an arch / `m`-like family.
- One coherent family is preferred over unrelated symbols.
- Height, width, sharpness, density, and spacing are core variables.
- Color is not required to carry meaning.

### Architecture

- Analysis is independent from mapping.
- Mapping is independent from grammar.
- Grammar is independent from layout.
- Layout is independent from rendering.
- SVG export is pure and model-driven.
- All stochastic behavior is seeded.
- GlyphLab is reference code and a parts donor.
- The A–Z model is not inherited.

### Repository

- GlyphLab reference location: `apps/glyphlab-reference/`
- Reference commit: `79e5c4c`
- Production code lives under `music/src/`; there is no standalone app.
- Unrelated working-tree changes must remain untouched.

## Open questions requiring product decisions

### 1. Lowest-level musical unit

Current decision:

- one glyph per beat;
- subdivisions influence internal arch count.

Open alternative:

- allow important onsets to become independent glyphs.

Do not implement the alternative before the beat-first model is tested.

### 2. Tempo and beat detector

Options:

- reuse MUSIC TypeScript DSP;
- reuse AudioLab Python analysis through an offline workflow;
- add a browser-side onset/beat library;
- combine existing BPM estimation with new event detection.

Required next action:

- audit existing code and compare data quality, runtime, and integration cost.

### 3. Time signature and bars

Questions:

- should the MVP assume 4/4 when time signature is unknown?
- should the user manually set beats per bar?
- how are polymetric or unstable tracks represented?
- how should Steve Reich-like phasing be handled later?

Initial safe default:

- expose beats per bar as an editable project setting;
- do not present automatic time-signature detection as authoritative.

### 4. Section detection

Options:

- manual section markers only;
- automatic novelty detection with manual correction;
- no sections in the first build.

Recommendation:

- support manual section boundaries in the MVP;
- automatic detection may remain optional.

### 5. Pitch movement

Question:

- does pitch add useful writing behavior or distract from beat transcription?

Recommendation:

- keep the data field;
- disable the mapping by default;
- test after energy, sharpness, density, and duration work.

### 6. Polyphony and voices

Questions:

- should drums, bass, and tonal material occupy separate rows?
- should stem separation ever influence grammar?
- can one beat glyph carry a combined measurement without losing intricacy?

MVP decision:

- use a combined beat representation;
- defer multi-voice layout.

### 7. Handmade controls

Questions:

- what is the maximum acceptable irregularity?
- should handmade variation be global or locally driven by music?
- should different seeds be treated as variations of one composition?

MVP recommendation:

- global seeded variation with small bounded local modulation.

### 8. Cover composition

Questions:

- is manuscript output itself the cover?
- should the square mode crop a longer manuscript?
- should it scale bars to fit the square?
- should later freeform composition preserve chronology?

MVP recommendation:

- create a dedicated square manuscript page;
- do not implement freeform placement yet.

### 9. Physical plotting

Questions:

- target paper sizes;
- preferred pen;
- stroke width;
- minimum spacing;
- acceptable path count;
- plot time estimate;
- AxiDraw travel optimization.

MVP decision:

- export valid monoline SVG with physical dimensions;
- defer direct plotter control and path optimization.

### 10. Saved shelf

Questions:

- browser local storage or IndexedDB?
- are source audio files persisted or reselected?
- should variations store full SVG or regenerate from project data?

Recommendation:

- versioned IndexedDB for project metadata;
- regenerate SVG from canonical data;
- avoid duplicating large audio unless necessary.

### 11. Name

Working descriptions:

- Glyph Audio;
- AudioLab Glyph;
- Trace;
- Script;
- Score.

No permanent product name is required for the MVP.

## Questions Claude may answer with recommendations

Claude may propose:

- specific data structures;
- exact package boundaries;
- analysis implementation options;
- file organization;
- test fixtures;
- performance safeguards;
- schema validation approach.

Claude must not silently decide:

- aesthetic direction;
- whether the beat-first unit changes;
- whether a full library is added;
- whether unrelated repository architecture is refactored;
- whether MAPS or MUSIC code is modified.
