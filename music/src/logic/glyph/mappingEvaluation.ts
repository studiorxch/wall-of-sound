// Glyph Audio — Mapping Grammar evaluation
// (docs/glyph-audio/05_GLYPH_AUDIO_Mapping_Grammar_Spec.md, "Rule
// evaluation"). Pure: given one BeatUnit, a MappingPreset, and a starting
// GlyphParameterSet (the grammar's own defaults, converted — see
// archGrammar.ts), evaluates every enabled rule in priority order and
// returns the resulting parameter set plus a full MappingTrace.
//
// A rule whose source measurement is unavailable (null — e.g.
// pitchMovement/spectralBrightness, which are optional and disabled by
// default per approved decision 12) is skipped, never fabricated
// (03_GLYPH_AUDIO_Musical_Unit_Model.md, "Confidence").

import type { BeatUnit } from "../../data/glyphAudioTypes";
import type {
  MappingPreset, MappingCurve, MusicalSourceProperty, VisualTargetProperty,
  GlyphParameterSet, MappingTrace,
} from "../../data/glyphMappingTypes";

// No internal clamping here — whether `t` is confined to [0,1] is entirely
// the caller's decision, driven by the rule's own `clamp` flag (applied
// before this function is called). Every formula below is well-defined
// outside [0,1] too, so a `clamp: false` rule correctly extrapolates past
// outputRange instead of silently being clamped anyway.
function applyCurve(t: number, curve: MappingCurve): number {
  switch (curve) {
    case "linear":
      return t;
    case "easeIn":
      return t * t;
    case "easeOut":
      return 1 - (1 - t) * (1 - t);
    case "easeInOut":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "smoothStep":
      return t * t * (3 - 2 * t);
    case "stepped":
      return Math.round(t * 4) / 4;
    default:
      return t;
  }
}

function readSourceValue(beat: BeatUnit, source: MusicalSourceProperty): number | null {
  switch (source) {
    case "energy":
      return beat.energy;
    case "durationBeats":
      return beat.durationBeats;
    case "attackSharpness":
      return beat.attackSharpness;
    case "onsetDensity":
      return beat.onsetDensity;
    case "sustain":
      return beat.sustain;
    case "pitchMovement":
      return beat.pitchMovement;
    case "spectralBrightness":
      return beat.spectralBrightness;
    case "accentStrength":
      return beat.accentStrength;
    case "confidence":
      return beat.confidence.value;
    // barPosition/sectionEnergy/sectionNovelty need bar/section context this
    // pure, per-beat function doesn't receive. Out of scope for this
    // slice's rule set; returns null (rule skipped) rather than fabricating
    // a value from data this function was never given.
    case "barPosition":
    case "sectionEnergy":
    case "sectionNovelty":
      return null;
    default:
      return null;
  }
}

function writeTargetValue(params: GlyphParameterSet, target: VisualTargetProperty, value: number): GlyphParameterSet {
  switch (target) {
    case "glyphHeight":
      return { ...params, height: value };
    case "glyphWidth":
      return { ...params, width: value };
    case "curveSharpness":
      return { ...params, curveSharpness: value };
    case "archCount":
      return { ...params, archCount: Math.max(1, Math.round(value)) };
    case "baselineOffset":
      return { ...params, baselineOffset: value };
    case "spacingBefore":
      return { ...params, spacingBefore: value };
    case "spacingAfter":
      return { ...params, spacingAfter: value };
    case "connectorLength":
      return { ...params, connectorLength: value };
    case "connectorSag":
      return { ...params, connectorSag: value };
    case "dotSize":
      return { ...params, dotSize: value };
    case "dotOffset":
      return { ...params, dotOffset: value };
    case "asymmetry":
      return { ...params, asymmetry: value };
    case "localCompression":
      return { ...params, localCompression: value };
    case "handmadeVariance":
      return { ...params, handmadeVariance: value };
    default:
      return params;
  }
}

export function evaluateMappingForBeat(
  beat: BeatUnit,
  preset: MappingPreset,
  baseParameters: GlyphParameterSet,
): { parameters: GlyphParameterSet; trace: MappingTrace } {
  let parameters: GlyphParameterSet = { ...baseParameters };
  const applied: MappingTrace["appliedRules"] = [];

  const orderedRules = [...preset.rules].filter((r) => r.enabled).sort((a, b) => a.priority - b.priority);

  for (const rule of orderedRules) {
    const raw = readSourceValue(beat, rule.source);
    if (raw == null) continue;

    const [inMin, inMax] = rule.inputRange;
    const span = inMax - inMin;
    let t = span !== 0 ? (raw - inMin) / span : 0;
    if (rule.clamp) t = Math.max(0, Math.min(1, t));
    if (rule.invert) t = 1 - t;
    const eased = applyCurve(t, rule.curve);

    const [outMin, outMax] = rule.outputRange;
    const mapped = outMin + eased * (outMax - outMin);

    parameters = writeTargetValue(parameters, rule.target, mapped);
    applied.push({ ruleId: rule.id, sourceValue: raw, mappedValue: mapped, target: rule.target });
  }

  return {
    parameters,
    trace: { beatUnitId: beat.id, presetId: preset.id, appliedRules: applied },
  };
}
