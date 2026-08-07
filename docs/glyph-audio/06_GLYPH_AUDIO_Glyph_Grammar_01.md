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
