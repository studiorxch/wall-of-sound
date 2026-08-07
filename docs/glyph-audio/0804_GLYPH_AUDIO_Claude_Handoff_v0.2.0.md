# Glyph Audio — Complete Claude Handoff v0.2.0


---

<!-- SOURCE: 00_GLYPH_AUDIO_Handoff_README.md -->

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


---

<!-- SOURCE: 01_GLYPH_AUDIO_Product_Brief.md -->

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


---

<!-- SOURCE: 02_GLYPH_AUDIO_Visual_Language_Principles.md -->

# Glyph Audio — Visual Language Principles

## Primary aesthetic position

The work must favor **writing, language, notation, and inscription** over decorative image-making.

The strongest existing references are the two handmade pages derived from musical beats. Their value comes from repeated gestures, temporal progression, punctuation, density, and controlled variation. They do not depend on color, illustration, or a recognizable image.

## What should remain visible in the output

- repeated beat-driven gestures;
- one recognizable family of marks;
- micro-variation rather than unrelated symbols;
- dots as punctuation, separation, or structural markers;
- line-by-line progression;
- density changes;
- visible pauses and negative space;
- larger section transitions;
- gradual shifts from rounded to pointed or clipped contours;
- handmade irregularity;
- enough intricacy to reward close reading;
- a sense that the page can be traversed like writing or a map.

## Core mark behavior

The initial visual language is based on an inverted-U arch that may repeat into an `m`-like sequence.

The form should be capable of moving continuously through:

```text
rounded / sine-like
→ pointed / triangle-like
→ clipped / square-like
```

This continuum should be controlled by musical measurements rather than swapped as unrelated icons.

## Meaning-bearing visual properties

The first grammar may use:

- height;
- width;
- curve sharpness;
- arch count;
- spacing;
- baseline movement;
- dot size;
- dot placement;
- connector length;
- local compression;
- interruption;
- grouping.

No single mapping is permanent. The system must allow properties to be reassigned through presets.

## Handmade appearance

"Handmade" must not be implemented as uncontrolled noise.

Use deterministic, bounded deformation:

- baseline drift;
- control-point displacement;
- arch asymmetry;
- slight width variance;
- slight height variance;
- spacing irregularity;
- connector sag;
- dot displacement;
- entry and exit overshoot;
- local compression;
- occasional uneven rhythm within an allowed range.

Every deformation must be derived from a saved seed so that the same project can regenerate the same paths.

## Intricacy versus false complexity

The intended audience is experienced with asemic writing and can distinguish developed visual language from arbitrary scratches.

Complexity should emerge from:

- structured repetition;
- nested musical units;
- accumulation;
- phrase and section relationships;
- meaningful density;
- recurring gesture logic;
- controlled exceptions.

Complexity should not emerge from:

- random scribbling;
- indiscriminate path noise;
- excessive symbol variety;
- decorative layering without structural cause;
- arbitrary texture added after the transcription.

## References to maps

Map-like work is relevant because it introduces:

- routes;
- networks;
- traversal;
- territories;
- local density;
- clustered events;
- branching;
- spatial reading rather than immediate icon recognition.

Maps are a later layout and composition influence, not a reason to abandon the writing system.

## Broader cultural references

Keith Haring and Jean-Michel Basquiat may be relevant as examples of energetic line, repeated symbolic vocabulary, urban mark-making, and visual language. They are not direct style-transfer targets.

The project must develop its own grammar rather than imitate a known artist.

## Avoid

- polished symbol grids;
- corporate geometric abstraction;
- generic pseudo-language;
- fake scratch nonsense;
- visualizations that become recognizable images too quickly;
- decorative color used to disguise weak structure;
- excessive symmetry;
- mandala defaults;
- particle systems;
- spectrum bars;
- literal waveform drawings;
- smooth algorithmic perfection;
- symbols that cannot be traced back to musical events;
- overly simplistic results that read as a single repeated stamp.

## Visual audit questions

Every generated composition should be reviewed against these questions:

1. Does it read as writing, notation, inscription, or manuscript?
2. Can recurring gestures be recognized as members of one family?
3. Does repetition contain meaningful variation?
4. Are dots and spaces functioning as punctuation?
5. Can the eye detect larger structural changes?
6. Is the work intricate because of musical organization rather than random detail?
7. Does the result preserve a handmade presence?
8. Could the same underlying paths be plotted without relying on color or effects?
9. Does it avoid looking like a generic audio visualizer?
10. Can each major mark be traced back to a musical unit and mapping rule?


---

<!-- SOURCE: 03_GLYPH_AUDIO_Musical_Unit_Model.md -->

# Glyph Audio — Musical Unit Model

## Purpose

The new system replaces GlyphLab's A–Z character slots with musical units.

A musical unit is not necessarily a fixed symbol. It is a structured event whose measurements are passed into a glyph grammar.

```text
musical unit + measurements + mapping preset + glyph grammar
→ generated glyph instance
```

## Structural hierarchy

```text
Track
└── Section
    └── Phrase
        └── Bar
            └── Beat
                └── Subdivision / Event
```

Supporting structural units:

```text
Silence
Accent
Boundary
Transition
```

## Version-one priority

The system is **beat-first**.

The beat is the primary transcription unit because the existing handmade examples were built around pulse and repeated beat gestures.

Onsets and subdivisions influence the shape of the beat glyph rather than automatically becoming independent glyphs in version one.

## Canonical types

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
  timeSignature: {
    beatsPerBar: number;
    beatUnit: number;
  } | null;
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
  context:
    | "within-beat"
    | "between-beats"
    | "between-bars"
    | "between-phrases"
    | "between-sections";
  confidence: Confidence;
};
```

## Measurement definitions

All normalized values use `0.0–1.0` unless stated otherwise.

### Energy

**Meaning:** Local perceived force within the beat window.

**Candidate raw source:** RMS, perceptual loudness, or a combined energy measure.

**Normalization:** Prefer track-relative normalization with protection against isolated peaks.

**Default visual use:** Glyph height.

**Possible alternatives:** Density, baseline displacement, dot size, or arch count.

### Attack sharpness

**Meaning:** How abrupt and hard the beat onset is.

**Candidate raw source:** Transient slope, high-frequency onset energy, or spectral-flux shape near the beat start.

**Default visual use:** Curve continuum from rounded to pointed to clipped.

**Failure behavior:** Use a neutral rounded value and preserve low confidence.

### Onset density

**Meaning:** Number and strength of sub-events inside the beat window.

**Default visual use:** Arch count or internal repetition.

**Failure behavior:** One arch.

### Sustain

**Meaning:** How long energy persists through the beat.

**Default visual use:** Glyph width or connector length.

### Pitch movement

**Meaning:** Relative upward or downward tonal movement across the beat, not absolute note transcription.

**Range:** `-1.0–1.0`.

**Default visual use:** Subtle baseline drift or asymmetry.

**Version-one status:** Optional. The system must work without reliable pitch.

### Spectral brightness

**Meaning:** Relative high-frequency balance.

**Default visual use:** Optional secondary influence on sharpness or local angularity.

**Version-one status:** Optional and disabled by default.

### Accent strength

**Meaning:** Relative prominence of the beat within its bar or local phrase.

**Default visual use:** Dot punctuation, scale emphasis, or a stronger gesture.

## Silence is data

Silence must not be treated as missing content or a skipped character.

Silence may produce:

- negative space;
- a longer connector;
- a gap;
- a dot;
- a visible rest marker;
- a line break when structurally strong.

## Boundary units

Boundaries are independent structural events because punctuation must remain configurable.

Default behavior:

```text
bar boundary     → small dot or compact gap
phrase boundary  → larger gap or dot cluster
section boundary → major spacing event or new row
```

These defaults belong to a mapping preset and may be changed.

## Confidence

Every detected measurement must preserve confidence.

Low-confidence values may be:

- ignored;
- replaced with a neutral value;
- marked for review;
- manually corrected;
- mapped to a reduced visual effect.

The system must never convert uncertain analysis into false visual precision without retaining the uncertainty.

## Serialization

All analysis output must be versioned.

```ts
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


---

<!-- SOURCE: 04_GLYPH_AUDIO_Reference_Catalog.md -->

# Glyph Audio — Reference Catalog

## Purpose

This catalog explains what each visual reference contributes to the product. References are not equally authoritative. The music-derived handwritten pages are the primary aesthetic evidence.

Files are stored under:

```text
docs/glyph-audio/references/
```

## Reference 01 — Music-derived beat manuscript, dense page

**File:** `music-asemic-01.jpeg`

### Context

A handmade page created while listening to music and attempting to capture beats, pulse, divisions, energy, and changing curve behavior.

### Preserve

- repeated inverted-U and `m`-like gesture family;
- dots functioning as punctuation;
- visible line progression;
- transitions between rounded and sharper forms;
- handmade irregularity;
- density sufficient to reward close inspection;
- structured repetition without literal legibility.

### Potential musical mappings

- beat → one glyph unit;
- energy → height;
- sustain → width;
- attack sharpness → curvature;
- onset density → hump count;
- bar boundary → dot;
- phrase or section → larger space.

### Do not imitate literally

- exact sequence;
- exact page dimensions;
- accidental pen artifacts;
- literal reconstruction of the handwriting.

## Reference 02 — Music-derived beat manuscript, varied line systems

**File:** `music-asemic-02.jpeg`

### Context

A second handmade music-derived page using repeated marks, punctuation, and shifts in density.

### Preserve

- multiple local rhythms within a unified hand;
- visible distinction between rows;
- variation that does not collapse into unrelated symbols;
- punctuation and empty space;
- handwritten pacing;
- movement between rounded, angled, and compressed marks.

### Product lesson

A single grammar can support substantial variation when the parameters are expressive enough.

## Reference 03 — Rozita Sophia Fogelman example

**File:** `rozita-sophia-fogelman-reference.png`

### Value

- demonstrates orderly repetition;
- provides a contrast between designed symbols and lived writing;
- useful as a negative boundary.

### Why it is not the primary direction

- reads as a clean graphic arrangement;
- feels resolved as pattern before it feels like language;
- insufficient handmade instability;
- limited temporal progression;
- symbol design outweighs inscription;
- too little intricate internal development.

### Avoided conclusion

The goal is not to reject geometry. The goal is to prevent geometry from replacing musical and gestural structure.

## Reference 04 — GlyphLab application

**Files:**

- `glyphlab-interface-01.png`
- `glyphlab-interface-02.png`
- `glyphlab-output-01.png`
- `glyphlab-output-02.png`

### Value

- existing monoline glyph editor;
- reusable stroke and path concepts;
- JSON export precedent;
- SVG path generation precedent;
- direct evidence of prior StudioRich glyph work.

### Limitations

- organized around A–Z and literal characters;
- typesetting model assumes one character per slot;
- existing export is not model-driven or AxiDraw-safe;
- current architecture is one large React component;
- no import path;
- no reusable component structure.

### Product lesson

Use GlyphLab as a parts donor and reference implementation, not as the new product model.

## Reference 05 — Map and network works

**Files:**

- `map-language-reference-01.png`
- `map-language-reference-02.png`

### Value

- traversal;
- path systems;
- layered density;
- clustered activity;
- territorial reading;
- route and network logic;
- intricate composition without conventional text.

### Future use

Maps may influence later layouts:

- route manuscript;
- network field;
- spatial branching;
- location-linked sound artifact;
- photographic overlay;
- MAPS integration.

Maps should not replace the initial beat-first row manuscript.

## Reference 06 — Keith Haring and Jean-Michel Basquiat

No images are required in this packet.

### Relevance

- repeated graphic vocabularies;
- urban line;
- symbolic density;
- strong hand presence;
- readable energy without conventional prose;
- accumulation of marks into cultural language.

### Constraint

Do not imitate either artist's identifiable style. Their relevance is conceptual, not a request for stylistic reproduction.

## Reference authority

Use this priority when aesthetic references conflict:

1. Music-derived handwritten pages.
2. Explicit visual-language principles in this packet.
3. GlyphLab's useful stroke/editor behavior.
4. Map/network references.
5. Broader art references.
6. Generic UI conventions.

## Review method

For each generated result, record:

```md
### What survived from the primary references
- ...

### What became too clean or decorative
- ...

### What became too random
- ...

### Which musical relationships remain visible
- ...

### Which visual parameters should be adjusted
- ...
```


---

<!-- SOURCE: 05_GLYPH_AUDIO_Mapping_Grammar_Spec.md -->

# Glyph Audio — Mapping Grammar Specification

## Purpose

The mapping grammar connects measured musical properties to visual parameters.

It must remain independent from:

- audio analysis;
- glyph geometry;
- layout;
- rendering;
- export.

This separation prevents the product from becoming trapped in one preset.

## Core rule

Do not encode permanent assumptions such as:

```text
energy always means height
```

Instead:

```text
Analysis Profile
+ Mapping Preset
+ Glyph Grammar
+ Layout Preset
+ Render Profile
→ Composition
```

## Object model

```ts
export type MusicalSourceProperty =
  | "energy"
  | "durationBeats"
  | "attackSharpness"
  | "onsetDensity"
  | "sustain"
  | "pitchMovement"
  | "spectralBrightness"
  | "accentStrength"
  | "barPosition"
  | "sectionEnergy"
  | "sectionNovelty"
  | "confidence";

export type VisualTargetProperty =
  | "glyphHeight"
  | "glyphWidth"
  | "curveSharpness"
  | "archCount"
  | "baselineOffset"
  | "spacingBefore"
  | "spacingAfter"
  | "connectorLength"
  | "connectorSag"
  | "dotSize"
  | "dotOffset"
  | "asymmetry"
  | "localCompression"
  | "handmadeVariance";

export type MappingCurve =
  | "linear"
  | "easeIn"
  | "easeOut"
  | "easeInOut"
  | "smoothStep"
  | "stepped";

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
  output:
    | "dot"
    | "dotCluster"
    | "gap"
    | "lineBreak"
    | "baselineShift"
    | "grammarVariation";
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
```

## Initial mapping preset

This is `Preset 01`, not permanent truth.

| Musical property | Visual target | Initial interpretation |
|---|---|---|
| Beat | Glyph instance | One generated unit per detected beat |
| Energy | Height | Stronger beat creates taller arch |
| Duration / sustain | Width | Longer persistence creates wider gesture |
| Attack sharpness | Curve sharpness | Rounded → pointed → clipped |
| Onset density | Arch count | More internal events create more humps |
| Accent strength | Dot or scale emphasis | Strong beat may receive punctuation or additional emphasis |
| Bar boundary | Dot / compact gap | Small structural punctuation |
| Phrase boundary | Larger gap / dot cluster | Visible grouping |
| Section boundary | Major gap / new row | Large structural event |
| Silence | Negative space | Preserved rather than omitted |
| Pitch movement | Baseline drift | Optional, subtle movement only |

## Rule evaluation

1. Load a `BeatUnit`.
2. Normalize each source property.
3. Evaluate enabled mapping rules in priority order.
4. Produce a `GlyphParameterSet`.
5. Apply deterministic handmade deformation.
6. Preserve provenance showing which rules affected the glyph.

```ts
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
```

## Provenance

Every generated glyph instance must explain itself.

```ts
export type MappingTrace = {
  beatUnitId: string;
  presetId: string;
  appliedRules: Array<{
    ruleId: string;
    sourceValue: number;
    mappedValue: number;
    target: VisualTargetProperty;
  }>;
};
```

The UI may later show:

```text
Beat 124
Energy 0.72 → height 18.4 mm
Attack 0.31 → sharpness 0.22
Onset density 0.58 → 3 arches
Bar boundary → 1.8 mm dot
```

## Multiple rules targeting one property

Version one should use one active source per visual target.

Later versions may support:

- weighted combination;
- additive modulation;
- multiplicative modulation;
- threshold overrides;
- section-level modulation.

Do not introduce this complexity before the first preset is validated.

## Preset editing

The UI should allow:

- source selection;
- target selection;
- input minimum and maximum;
- output minimum and maximum;
- curve;
- invert;
- enable or disable;
- reset to default;
- save as new preset.

## Guardrails

- Prevent circular mappings.
- Prevent unsupported target values.
- Clamp geometry to plot-safe ranges.
- Warn when multiple enabled rules conflict.
- Warn when a source property has low confidence.
- Warn when a mapping produces excessive path density.
- Never modify the underlying musical analysis when a visual mapping changes.

## Portability

A mapping preset should be reusable across:

- different songs;
- different glyph grammars;
- different layouts;
- print and motion renderers.

Compatibility warnings are allowed, but presets must remain data rather than hardcoded behavior.


---

<!-- SOURCE: 06_GLYPH_AUDIO_Glyph_Grammar_01.md -->

# Glyph Audio — Glyph Grammar 01: Arch Script

## Purpose

Grammar 01 establishes the smallest useful visual vocabulary.

It is based on the repeated inverted-U arch found in the existing music-derived handwritten pages. Repetition produces an `m`-like structure without requiring literal letters.

## Principle

One coherent generative family is preferred over many unrelated symbols.

```text
primitive
→ gesture
→ generated glyph instance
→ phrase
→ row
→ manuscript
```

## Primitive components

```text
entry stroke
arch
connector
dot
gap
exit stroke
```

## Base gesture

```text
entry
→ one or more arches
→ optional connector
→ optional punctuation
→ exit
```

The base gesture is monoline and open by default.

## Parameters

```ts
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
```

## Shape continuum

`curveSharpness` must support a continuous family:

```text
0.00–0.35  rounded / sine-like
0.35–0.75  pointed / triangle-like
0.75–1.00  clipped / square-like
```

The implementation does not need to use literal sine, triangle, or square wave equations. These terms describe visible behavior.

## Arch count

Initial allowed range:

```text
1–6 arches per beat glyph
```

Default mapping:

```text
onset density → arch count
```

The range must remain configurable.

## Connections

Connection behavior is part of the grammar, not the layout.

### Default connection rules

- Adjacent beats within a bar may connect.
- A bar boundary may end the connector and place a dot.
- A phrase boundary introduces a larger gap.
- A section boundary ends the current row by default.
- Silence may extend the gap without creating a stroke.
- Strong accent may interrupt the connector or add punctuation.

### Pen-lift policy

Version one should preserve visual intent rather than aggressively optimize travel.

A later plot-optimization pass may:

- join nearby compatible strokes;
- reorder independent dots;
- reduce travel;
- estimate plot time.

The source composition must remain unchanged.

## Handmade deformation

Allowed deterministic deformation:

- control-point drift;
- unequal arch shoulders;
- slight baseline drift;
- slight width and height variance;
- connector sag;
- entry and exit overshoot;
- dot displacement;
- local compression.

### Constraints

- No random deformation outside a saved seed.
- No deformation that changes beat order.
- No deformation that causes uncontrolled self-intersection.
- No deformation that makes neighboring glyphs indistinguishable as separate rhythmic units.
- No deformation that breaks page margins.

## Punctuation

Dots are first-class marks.

A dot may indicate:

- bar boundary;
- phrase boundary;
- accent;
- silence;
- breath;
- local separation.

Dot meaning is assigned by the mapping preset.

Dots should remain geometrically simple and plot-safe.

## Glyph identity

Generated glyph instances must use abstract IDs, not Unicode characters.

```ts
export type GlyphInstanceId = string;

export type GeneratedGlyphInstance = {
  id: GlyphInstanceId;
  beatUnitId: string;
  grammarId: "arch-script-v1";
  parameters: ArchGrammarParameters;
  seed: number;
};
```

## Editor requirements

The grammar editor may provide:

- live base gesture preview;
- parameter sliders;
- draw and pen tools inherited from useful GlyphLab logic;
- optional manual editing of the base gesture;
- reset;
- duplicate grammar;
- save grammar.

The initial MVP does not require a full glyph-library editor.

## Validation questions

1. Can one grammar produce visibly distinct low- and high-energy beats?
2. Can the curve continuum move between rounded, pointed, and clipped forms?
3. Can density change without turning into unrelated symbols?
4. Do dots read as punctuation rather than decoration?
5. Does the result maintain a handwritten presence?
6. Can the entire grammar remain monoline and plot-safe?


---

<!-- SOURCE: 07_GLYPH_AUDIO_Layout_Spec.md -->

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


---

<!-- SOURCE: 08_GLYPH_AUDIO_GlyphLab_Reuse_Audit.md -->

# Glyph Audio — GlyphLab Reuse Audit

## Status

This audit is the grounded code review of `apps/glyphlab-reference/`. It is preserved as the implementation evidence for what may be reused, generalized, rewritten, or discarded.

---

## Audit: `apps/glyphlab-reference` as a reference for a beat-first asemic transcription app

The entire app is one file: [App.tsx](apps/glyphlab-reference/src/App.tsx) (817 lines), a Vite+React+Tailwind SPA. No other logic files exist — no components/, hooks/, or lib/ directories. `App.css` and the three files under `src/assets/` are unused Vite-template leftovers (confirmed via grep — never imported). `README.md` is generic Vite boilerplate, not project docs.

### Inspection findings, by area

**Stroke/path data structures** ([App.tsx:3-26](apps/glyphlab-reference/src/App.tsx#L3-L26))
```ts
type Point = { x: number; y: number };
type Stroke = { points: Point[]; mode?: "freehand" | "pen" };
type Glyph = { strokes: Stroke[] };
type GlyphMap = Record<string, Glyph>;
```
Clean and already font-agnostic in shape: a stroke is just an ordered point list with a smoothing-mode flag; a glyph is just a stroke array. No pressure/velocity/timing captured, no closed-path flag beyond the pen tool appending the first point again. `GlyphBounds` ([App.tsx:19-26](apps/glyphlab-reference/src/App.tsx#L19-L26)) is computed on demand via a min/max scan, never cached or persisted. The only font coupling is the **key** used to look glyphs up (`GlyphMap` keyed by literal character), not the value shape.

**Canvas drawing/editing logic** ([App.tsx:294-578](apps/glyphlab-reference/src/App.tsx#L294-L578))
Three working tools — `draw` (freehand, mousemove-accumulated, quadratic-Bezier-smoothed), `pen` (click-to-place nodes, closes when a click lands within 20px of the first node, straight `L` segments), `erase` (proximity hit-test that deletes an entire stroke if any point is within 20px of the click). A fourth `"arc"` tool has a UI button ([App.tsx:670-679](apps/glyphlab-reference/src/App.tsx#L670-L679)) but **no handler** — dead UI, never checked in `handleMouseDown`. No undo/redo, no per-stroke selection/reorder after creation, no stroke-width or pressure control. Grid-snapping (`snap()`, 25px) is applied on every point. The paint loop is one big imperative `useEffect` ([App.tsx:447-578](apps/glyphlab-reference/src/App.tsx#L447-L578)) that fully redraws on every relevant state change — background, grid, center guides, saved strokes, live tool previews.

**Glyph persistence** ([App.tsx:176-193](apps/glyphlab-reference/src/App.tsx#L176-L193))
Single `localStorage` key `"glyphlab-project"`, whole `GlyphMap` re-serialized on every change. No schema version, no migration, no per-glyph granularity, no IndexedDB (unlike this monorepo's own MUSIC app, which already uses IndexedDB for state).

**JSON import/export**
Export only — `exportGlyphs()` ([App.tsx:269-284](apps/glyphlab-reference/src/App.tsx#L269-L284)) downloads the raw `GlyphMap`. **There is no import path anywhere in the file.** If round-tripping matters for the new app, import has to be built from nothing, not ported.

**SVG export** ([App.tsx:244-267](apps/glyphlab-reference/src/App.tsx#L244-L267))
`exportSVG()` grabs the **already-rendered** `#glyph-page` DOM node and serializes it with `XMLSerializer` — a DOM-scrape, not a model-driven export. It is **not AxiDraw-safe as written**: no physical units (viewBox is arbitrary `0 0 1080 1920`, no mm/in), color is presentational (`#f5f5f5` stroke, needs override to plotter-neutral black), no path/travel optimization or stroke ordering, and it's coupled to whatever's on-screen at export time rather than being callable headlessly. The stroke styling itself (`fill="none"`, `round` caps/joins, one `<path>` per stroke) is a reasonable starting point for plotting. `exportPNG()` ([App.tsx:195-242](apps/glyphlab-reference/src/App.tsx#L195-L242)) rasterizes the same on-screen SVG onto a fixed 1080×1920 dark-background canvas — a social/specimen-preview export, irrelevant to plotting.

**Preview rendering** ([App.tsx:118-151](apps/glyphlab-reference/src/App.tsx#L118-L151), [727-813](apps/glyphlab-reference/src/App.tsx#L727-L813))
`buildPageRows()` word-wraps a text string by character count against `PAGE_CHARS_PER_LINE = 20`; the JSX return then walks rows/chars, computes a fixed grid cell (`PAGE_CELL_WIDTH=50`, `PAGE_LINE_HEIGHT=80`), looks up each character's glyph, scales it to fit an `PAGE_GLYPH_BOX=38` box (capped at 0.9×), and emits `<g transform="translate() scale()"><path/></g>`. Unknown characters fall back to a plain monospace `<text>` glyph. This is a full **typesetting engine** — word-wrap, fixed grid, reading order, font fallback — baked directly into JSX with no separation from rendering.

**Reusable UI components**: none exist. Character palette, tool switcher, canvas, textarea, and page preview are all inline JSX in one component tree; state is 100% local `useState`.

**Assumptions tied to A–Z / font construction**:
1. `CHARACTER_SET` ([App.tsx:35-41](apps/glyphlab-reference/src/App.tsx#L35-L41)) hardcodes A–Z/a–z/0–9/punctuation/space as the editable-slot palette.
2. Glyph identity is a literal Unicode character (`GlyphMap: Record<string, Glyph>`), not an abstract symbol id.
3. `currentChar === " "` is special-cased to disable drawing ([App.tsx:316-318](apps/glyphlab-reference/src/App.tsx#L316-L318)) — treats space as "no glyph," whereas in a musical system silence/rest is itself a meaningful unit that deserves its own glyph.
4. `compositionText` is a free-text string; `buildPageRows` wraps by word/character count — a linguistic reading-order model, not a beat/tempo-driven one.
5. Page layout is `rowText.split("")` — one glyph per code unit in a fixed-width grid — the "typeface" mental model, incompatible with duration-driven spacing, measures, or multi-voice stacking.
6. Missing-glyph fallback renders literal system-font `<text>` — a font-fallback concept with no musical analog.
7. Cosmetic but leaky: storage key, export filenames, and header copy ("Experimental Asemic Font System") are all glyphlab-branded.

---

## 1. Reusable modules

Portable near-verbatim, with only naming/config generalization:

- `Point`, `Stroke`, `Glyph`, `GlyphBounds` types ([App.tsx:3-26](apps/glyphlab-reference/src/App.tsx#L3-L26))
- `snap()` ([App.tsx:43-45](apps/glyphlab-reference/src/App.tsx#L43-L45))
- `getGlyphBounds()` ([App.tsx:47-79](apps/glyphlab-reference/src/App.tsx#L47-L79))
- `buildSmoothPathData()` ([App.tsx:81-116](apps/glyphlab-reference/src/App.tsx#L81-L116)) — the core stroke→SVG-path primitive; already fully decoupled from character semantics
- `getMousePos()` screen→canvas mapping logic ([App.tsx:294-313](apps/glyphlab-reference/src/App.tsx#L294-L313))
- The localStorage load/save `useEffect` pair ([App.tsx:176-193](apps/glyphlab-reference/src/App.tsx#L176-L193)) as a pattern for a generic persistence hook
- The draw/pen/erase pointer state machine ([App.tsx:315-445](apps/glyphlab-reference/src/App.tsx#L315-L445)), once the character-gate is removed
- The canvas paint-loop structure (clear → grid → guides → strokes → live preview, [App.tsx:447-578](apps/glyphlab-reference/src/App.tsx#L447-L578)), once colors/sizes are parameterized
- The blob+anchor download pattern shared by all three export functions — worth factoring into one `downloadBlob(content, filename, mime)` utility

## 2. Code that should remain reference-only

- The whole page/composition renderer — `buildPageRows()` + the layout JSX + `PAGE_CHARS_PER_LINE/CELL_WIDTH/LINE_HEIGHT/GLYPH_BOX` ([App.tsx:30-33](apps/glyphlab-reference/src/App.tsx#L30-L33), [118-151](apps/glyphlab-reference/src/App.tsx#L118-L151), [727-813](apps/glyphlab-reference/src/App.tsx#L727-L813)). Study the "sequence → positioned SVG groups" pattern only; a beat-first layout needs duration-driven placement, not word-wrap.
- `exportPNG()` ([App.tsx:195-242](apps/glyphlab-reference/src/App.tsx#L195-L242)) — specimen-sheet rasterizer, unrelated to the plotter pipeline.
- `exportSVG()`'s DOM-scrape approach ([App.tsx:244-267](apps/glyphlab-reference/src/App.tsx#L244-L267)) — instructive as the fastest possible export, but wrong shape for AxiDraw output (see findings above). Don't reuse the "grab `#glyph-page` from the DOM" strategy.
- Character-palette grid and tool-switcher JSX ([App.tsx:618-680](apps/glyphlab-reference/src/App.tsx#L618-L680)) — fine as interaction-affordance reference, but hardwired to `CHARACTER_SET`/string tool names; rebuild as parameterized components.
- The unused `"arc"` tool button — dead code, don't carry forward.
- `App.css`, `src/assets/*` — unused, do not copy.

## 3. Font-specific assumptions to remove

- `CHARACTER_SET` as the palette source of truth.
- `GlyphMap` keyed by literal Unicode character → needs to become `Record<GlyphId, Glyph>` where `GlyphId` is an abstract id minted by the mapping grammar, not a code point.
- `currentChar === " "` space-gate and the `" "` skip in page layout — silence must be a real, drawable musical unit, not a hardcoded no-op.
- `compositionText: string` + character-count word-wrap — replace with a sequence of musical units and beat/duration-driven layout.
- Literal-text fallback for unmapped glyphs — a beat-first system should flag an unmapped unit, not render a system-font character.
- Branding leaks (storage key, filenames, header copy) — parameterize before anything becomes a shared package.

**Per your instruction, I have not extended `CHARACTER_SET` or the alphabet model — this audit only inspects and categorizes the existing code.**

## 4. Proposed shared package boundaries

No workspace/`packages/` convention exists yet in this monorepo (root has no workspace `package.json`; `shared/` currently holds only `wosPalette.js`). Proposed split for a new package root (e.g. `packages/glyph-*`):

| Package | Contents | Notes |
|---|---|---|
| `glyph-stroke-model` | `Point`/`Stroke`/`Glyph`/`GlyphBounds` types, `snap`, `getGlyphBounds`, `buildSmoothPathData` | Zero React/DOM. The portable geometry kernel. |
| `glyph-canvas-editor` | Pointer state machine, `getMousePos`, paint-loop hook | Takes `(glyph, onChange)`; no character-set or persistence knowledge. |
| `glyph-persistence` | Generic `useGlyphLibrary(storageKey)` hook, `downloadJSON`/`downloadBlob`, and a **new** JSON-import + schema-validation function (import doesn't exist in the reference) | Keep versioned from day one, unlike the reference. |
| `glyph-svg-export` | Pure `(glyphs, layout) → svgString`, AxiDraw-safe (physical units, monochrome stroke, no DOM dependency) | Built new; only the download-utility portion of `exportSVG` carries over. |
| *stays app-specific, not shared* | Character palette UI, `CHARACTER_SET`, text/page layout engine, PNG export | Typography-only; either dropped or left in glyphlab-reference. |
| *new, no precedent in the reference* | Audio analysis, musical-unit model, mapping grammar, beat/measure layout | Must be designed fresh — see §5. |

## 5. Minimal prototype architecture

```
audio analysis → musical units → mapping grammar → glyph generation → layout → SVG export
```

1. **Audio analysis** (new) — decode → onset/beat detection → tempo grid → `AudioEvent[]` (`{time, duration, velocity, timbreBucket?}`). This monorepo already has two relevant, non-overlapping precedents worth checking before building from scratch: the Python `audiolab/` toolchain ([audiolab/docs/AUDIO_ANALYSIS_FORMAT.md](audiolab/docs/AUDIO_ANALYSIS_FORMAT.md)) does track-level BPM/key/energy via librosa but not per-onset events; MUSIC's own `dspFeatureExtraction.ts` does TS-side onset-density/BPM-candidate detection. Neither currently emits an event-level onset list — that's genuinely new work either way, but the tempo/BPM detection code itself is reusable rather than reimplemented.
2. **Musical units** (new) — quantize `AudioEvent[]` against the tempo grid → `MusicalUnit[] = {id, startBeat, durationBeats, voice, intensity}`. Pure, independently testable.
3. **Mapping grammar** (new) — a declarative, user-customizable rule table `MusicalUnit → GlyphId` (by voice + duration bucket + intensity bucket). This is the direct analog of `CHARACTER_SET` but generalized from Unicode code points to musical-feature buckets — and it's the piece that makes the glyph language "reusable, customizable" per your stated goal.
4. **Glyph generation** (mostly reused) — the `Stroke`/`Glyph` model + canvas editor from §1, used to hand-draw/customize the mark for each `GlyphId` the grammar can emit. This is where glyphlab-reference is most directly useful.
5. **Layout** (new, replaces `buildPageRows`) — beat/time-driven placement of `(MusicalUnit, GlyphId)` pairs; positions come from `startBeat`×tempo, not character count. Reuse `getGlyphBounds`'s scale-to-box pattern, not the word-wrap.
6. **SVG export** (new) — pure `(placedGlyphs, pageConfig) → svgString`, monochrome, physical units, no DOM dependency; pen-lift/travel optimization can be a later pass.

## 6. Exact files to copy / extract / rewrite

**Copy near-verbatim** (generalize naming only):
`Point`/`Stroke`/`Glyph`/`GlyphBounds` types, `snap()`, `getGlyphBounds()`, `buildSmoothPathData()`, `getMousePos()` logic, the localStorage effects, `exportGlyphs()`'s download body — all in [App.tsx:1-313](apps/glyphlab-reference/src/App.tsx#L1-L313) region, plus [269-284](apps/glyphlab-reference/src/App.tsx#L269-L284).

**Extract and generalize** (restructure, not verbatim):
`GlyphMap` → `Record<GlyphId, Glyph>`; pointer-handler state machine ([App.tsx:315-445](apps/glyphlab-reference/src/App.tsx#L315-L445)) → hook keyed by abstract glyph id, drop the space-gate; canvas paint effect ([App.tsx:447-578](apps/glyphlab-reference/src/App.tsx#L447-L578)) → parameterized render hook; palette grid + tool switcher JSX ([App.tsx:618-680](apps/glyphlab-reference/src/App.tsx#L618-680)) → components driven by grammar-emitted ids, not `CHARACTER_SET`.

**Rewrite from scratch, reference-only**:
`CHARACTER_SET` ([App.tsx:35-41](apps/glyphlab-reference/src/App.tsx#L35-L41)) — delete; `buildPageRows()` + page-preview JSX + page constants ([App.tsx:30-33](apps/glyphlab-reference/src/App.tsx#L30-L33), [118-151](apps/glyphlab-reference/src/App.tsx#L118-L151), [727-813](apps/glyphlab-reference/src/App.tsx#L727-L813)) — study pattern only; `exportSVG()` ([App.tsx:244-267](apps/glyphlab-reference/src/App.tsx#L244-L267)) — reuse only the blob-download tail, rebuild the document-generation as a pure function; `exportPNG()` ([App.tsx:195-242](apps/glyphlab-reference/src/App.tsx#L195-L242)) — skip entirely unless a specimen-preview export is separately wanted.

**Do not copy**:
`App.css`, `src/assets/hero.png`, `src/assets/react.svg`, `src/assets/vite.svg` (unused template cruft), the dead `"arc"` tool button, `README.md` (generic Vite boilerplate).

No code was modified for this audit.


---

<!-- SOURCE: 09_GLYPH_AUDIO_MVP_Spec.md -->

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


---

<!-- SOURCE: 10_GLYPH_AUDIO_Acceptance_Criteria.md -->

# Glyph Audio — Acceptance Criteria

## 1. Repository safety

- No unrelated MAPS, itinerary, orb, overlay, vehicle, or stem files are modified.
- No broad `git add .`.
- No `git reset`.
- No `git clean`.
- No automatic commit.
- No changes to `apps/glyphlab-reference/` unless explicitly approved.
- All implementation changes remain inside the approved MUSIC/Glyph allowlist.

## 2. Determinism

Given the same:

- source audio;
- analysis document;
- grammar version;
- mapping preset;
- layout preset;
- seed;
- renderer version;

the system produces geometrically equivalent SVG paths.

Changing only the seed may alter handmade deformation without changing beat order or structural punctuation.

## 3. Musical traceability

- Every confirmed beat produces one traceable glyph instance.
- Every glyph instance stores its source beat ID.
- Bar boundaries are visible through the active boundary mapping.
- Section boundaries are visible where section data exists.
- Silence produces negative space or an explicit rest behavior.
- Low-confidence measurements retain their confidence and use documented fallback behavior.

## 4. Mapping flexibility

- Energy is not hardcoded permanently to height.
- At least four musical properties can be reassigned to supported visual targets.
- Mapping presets can be saved and reloaded.
- Mapping changes do not alter the musical analysis.
- The same analysis can be rendered using more than one mapping preset.

## 5. Visual grammar

- The MVP uses one coherent arch-based gesture family.
- The grammar supports 1–6 arches.
- Height variation is visibly legible.
- Width variation is visibly legible.
- Sharpness variation visibly moves between rounded and angular behavior.
- Dots read as punctuation rather than decoration.
- The output remains monoline.
- The output reads closer to writing, notation, inscription, or manuscript than to an equalizer or waveform.

## 6. Handmade quality

- Handmade variance is deterministic.
- Variance is bounded.
- Variance does not reorder beats.
- Variance does not push paths outside page bounds.
- Variance does not cause uncontrolled self-intersection.
- Setting variance to zero produces a clean canonical form.
- Increasing variance produces recognizable hand presence without fake scratches.

## 7. Beat-grid review

- Audio can play and pause.
- Beat markers are visible.
- A beat can be added.
- A beat can be moved.
- A beat can be removed.
- A corrected grid regenerates the manuscript.
- The user can see when the grid has not been confirmed.

## 8. Layout

- Time progresses left to right.
- Rows progress top to bottom.
- Wrapping occurs at musical boundaries, not character counts.
- Bars per row is configurable.
- Section boundaries can start a new row.
- A4, square, and custom physical page dimensions are supported.
- Margins are respected.

## 9. SVG export

- SVG is produced from canonical data, not scraped from the DOM.
- `width` and `height` use physical units.
- `viewBox` matches the page model.
- All plotted marks use vector paths or approved primitive circles for dots.
- `fill="none"` is used for line paths.
- No text fallback is present.
- No filters or raster images are present.
- Stroke color and width are configurable.
- Export metadata includes project, source, grammar, mapping, layout, seed, and renderer versions.
- The exported centerlines match the preview centerlines.

## 10. Project persistence

- Saved Glyph Compositions persist through MUSIC's existing `PlayProject` storage.
- Project JSON export/import may follow after the first slice, but when implemented must validate schema versions and return clear errors.
- No missing-glyph fallback substitutes literal characters.
- Reloading a project restores the same visible composition.

## 11. Performance

Initial target for a typical five-to-eight-minute track:

- interaction remains responsive;
- mapping adjustments update without re-decoding audio;
- the app does not rerun full analysis when only visual parameters change;
- SVG generation completes without freezing the UI;
- a path-count warning appears before excessive plot complexity.

No hard millisecond target is required until the first prototype is profiled.

## 12. Visual review gate

A build does not pass solely because the analysis and SVG are technically valid.

At least one generated page must be reviewed against:

- the two music-derived handwritten references;
- the handmade quality requirement;
- the language-over-decoration principle;
- punctuation behavior;
- intricacy;
- avoidance of generic visualization.

## 13. MVP completion

The MVP is complete when:

1. one audio file can be imported;
2. its beat grid can be reviewed;
3. beats become arch-family glyphs;
4. mappings can be adjusted and saved;
5. the result renders as manuscript rows;
6. the same project regenerates deterministically;
7. project JSON round-trips;
8. AxiDraw-oriented SVG exports;
9. no unrelated repository work is touched.


---

<!-- SOURCE: 11_GLYPH_AUDIO_Decisions_and_Open_Questions.md -->

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


---

<!-- SOURCE: 12_GLYPH_AUDIO_Repository_Context.md -->

# Glyph Audio — Repository Context and Safety

## Repository

```text
wall-of-sound/
```

## Product placement

Glyph lives inside MUSIC under AudioLab, beside Looper.

```text
MUSIC
└── AUDIOLAB
    ├── Looper
    └── Glyph
```

There is no standalone `apps/audiolab-glyph/` application.

## Preserved reference application

```text
apps/glyphlab-reference/
```

Reference commit:

```text
79e5c4c Add GlyphLab reference implementation
```

GlyphLab is read-only historical evidence and a parts donor. Do not modify it or import it as a live dependency.

## Documentation

```text
docs/glyph-audio/
```

## Approved production areas

```text
music/src/data/glyph*.ts
music/src/logic/glyph/
music/src/ui/glyph/
```

Approved additive changes to existing MUSIC files are defined in:

- `13_GLYPH_AUDIO_Consolidated_Implementation_Plan.md`
- `14_GLYPH_AUDIO_Approved_Decisions.md`

## Existing systems to inspect and reuse

- Looper for AudioLab registration and music input;
- TrackInspector for "Open in Glyph";
- MUSIC track identity, playback, transport, analysis, and persistence;
- Orb for controls tied to a live preview;
- Geographic for preview-over-collection layout;
- GlyphLab for stroke/path/editor concepts.

## Working-tree risk

The repository contains unrelated active work, including MAPS, itinerary, orb, overlay, vehicle, render, and stem changes.

These files are not part of Glyph.

## Prohibited Git operations

Do not run:

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

unless the user explicitly requests the exact operation after reviewing repository status.

## Allowed read-only Git inspection

```text
git status --short
git diff -- <approved-path>
git diff --cached -- <approved-path>
git log --oneline -- <approved-path>
git show <commit> -- <approved-path>
```

## Data safety

Do not:

- delete source audio;
- rewrite TrackStemLibrary files;
- move library imports;
- normalize or rename unrelated assets;
- migrate global storage;
- change root workspace configuration;
- create a `packages/` architecture.

## Build order

```text
Data layer
→ Logic layer
→ Interface
```

No interface-first implementation.

## First Claude implementation task

Before writing code, amend the exact TypeScript models and file plan using `14_GLYPH_AUDIO_Approved_Decisions.md`.

Then implement only the approved first slice.


---

<!-- SOURCE: 13_GLYPH_AUDIO_Consolidated_Implementation_Plan.md -->

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

---

<!-- SOURCE: 14_GLYPH_AUDIO_Approved_Decisions.md -->

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
