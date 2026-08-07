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
