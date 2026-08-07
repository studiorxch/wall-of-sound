// Glyph Audio — Mapping Grammar Specification
// (docs/glyph-audio/05_GLYPH_AUDIO_Mapping_Grammar_Spec.md). Canonical types,
// taken verbatim from that spec. Deliberately independent from audio
// analysis, glyph geometry, layout, and rendering — a MappingPreset is pure
// data, never hardcoded behavior (e.g. "energy always means height").

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
