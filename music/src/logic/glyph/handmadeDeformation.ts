// Glyph Audio — deterministic handmade deformation
// (docs/glyph-audio/02_GLYPH_AUDIO_Visual_Language_Principles.md,
// "Handmade appearance"; 06_GLYPH_AUDIO_Glyph_Grammar_01.md, "Handmade
// deformation"). Every deformation is derived from the ONE global seed on
// the composition (approved decision 12,
// 14_GLYPH_AUDIO_Approved_Decisions.md) — never Math.random(), never a
// second, independently-seeded source. Same seed + same beat index always
// produces the same jitter; handmadeVariance = 0 always produces a
// byte-identical, undeformed pass-through (no RNG call at all).

import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";

// mulberry32 — a small, dependency-free, deterministic PRNG. Not
// cryptographic; reproducibility, not unpredictability, is the requirement
// here.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Combines the one global seed with the beat index so each beat gets an
// independent-looking but fully deterministic offset from the same global
// seed.
function hashSeedForBeat(seed: number, beatIndex: number): number {
  return (Math.imul(seed | 0, 2654435761) + Math.imul(beatIndex | 0, 40503)) >>> 0;
}

export function applyHandmadeDeformation(
  parameters: ArchGrammarParameters,
  seed: number,
  beatIndex: number,
): ArchGrammarParameters {
  const variance = Math.max(0, Math.min(1, parameters.handmadeVariance));
  if (variance === 0) {
    return { ...parameters };
  }

  const rand = mulberry32(hashSeedForBeat(seed, beatIndex));
  const jitter = (magnitude: number) => (rand() * 2 - 1) * magnitude * variance;

  return {
    ...parameters,
    height: Math.max(0.05, parameters.height + jitter(parameters.height * 0.08)),
    width: Math.max(0.05, parameters.width + jitter(parameters.width * 0.08)),
    baselineOffset: parameters.baselineOffset + jitter(Math.max(0.5, parameters.height) * 0.05),
    asymmetry: Math.max(-1, Math.min(1, parameters.asymmetry + jitter(0.15))),
    connectorSag: Math.max(0, parameters.connectorSag + jitter(parameters.connectorSag * 0.2 + 0.01)),
  };
}
