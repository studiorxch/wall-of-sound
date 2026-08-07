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
