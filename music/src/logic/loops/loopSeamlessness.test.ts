import { describe, it, expect } from "vitest";
import { scoreLoopSeamlessness } from "./loopSeamlessness";
import type { LoopSeamlessnessEvidence } from "../../data/loopTypes";

function perfectEvidence(): LoopSeamlessnessEvidence {
  return {
    waveformMatch: 1, rmsMatch: 1, spectralMatch: 1, zeroCrossingFit: 1,
    gridAlignment: 1, tempoStability: 1, boundaryTransientPenalty: 0,
  };
}

describe("scoreLoopSeamlessness", () => {
  it("scores an exact repeat (all evidence perfect, zero penalty) high", () => {
    const r = scoreLoopSeamlessness(perfectEvidence(), 8, true);
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.warnings).toEqual([]);
  });

  it("scores a real endpoint discontinuity lower and warns", () => {
    const evidence = { ...perfectEvidence(), boundaryTransientPenalty: 0.8 };
    const r = scoreLoopSeamlessness(evidence, 8, true);
    expect(r.score).toBeLessThan(0.7);
    expect(r.warnings).toContain("LOOP_ENDPOINT_DISCONTINUITY");
  });

  it("warns on a clipped attack via high boundary transient penalty at the head", () => {
    const evidence = { ...perfectEvidence(), boundaryTransientPenalty: 0.5 };
    const r = scoreLoopSeamlessness(evidence, 8, true);
    expect(r.warnings).toContain("LOOP_ENDPOINT_DISCONTINUITY");
  });

  it("warns LOOP_TEMPO_UNSTABLE when tempo is not stable across the bounds", () => {
    const r = scoreLoopSeamlessness(perfectEvidence(), 8, false);
    expect(r.warnings).toContain("LOOP_TEMPO_UNSTABLE");
  });

  it("warns LOOP_TEMPO_UNSTABLE when tempoStability evidence itself is low", () => {
    const evidence = { ...perfectEvidence(), tempoStability: 0.2 };
    const r = scoreLoopSeamlessness(evidence, 8, true);
    expect(r.warnings).toContain("LOOP_TEMPO_UNSTABLE");
  });

  it("warns LOOP_TOO_SHORT for sub-1-second durations", () => {
    const r = scoreLoopSeamlessness(perfectEvidence(), 0.5, true);
    expect(r.warnings).toContain("LOOP_TOO_SHORT");
  });

  it("warns LOOP_TOO_LONG for durations over 64 seconds", () => {
    const r = scoreLoopSeamlessness(perfectEvidence(), 90, true);
    expect(r.warnings).toContain("LOOP_TOO_LONG");
  });

  it("warns LOOP_GRID_UNTRUSTED when gridAlignment evidence is low", () => {
    const evidence = { ...perfectEvidence(), gridAlignment: 0.1 };
    const r = scoreLoopSeamlessness(evidence, 8, true);
    expect(r.warnings).toContain("LOOP_GRID_UNTRUSTED");
  });

  it("does not claim seamlessness from grid alignment alone — a perfect grid with poor waveform/RMS/spectral match still scores low", () => {
    const evidence: LoopSeamlessnessEvidence = {
      waveformMatch: 0.1, rmsMatch: 0.1, spectralMatch: 0.1, zeroCrossingFit: 0.1,
      gridAlignment: 1, tempoStability: 1, boundaryTransientPenalty: 0,
    };
    const r = scoreLoopSeamlessness(evidence, 8, true);
    expect(r.score).toBeLessThan(0.6);
  });

  it("confidence is lower for uniformly-mixed evidence than for uniformly-strong evidence", () => {
    const mixed: LoopSeamlessnessEvidence = {
      waveformMatch: 0.9, rmsMatch: 0.1, spectralMatch: 0.9, zeroCrossingFit: 0.1,
      gridAlignment: 0.9, tempoStability: 0.1, boundaryTransientPenalty: 0,
    };
    const uniform = perfectEvidence();
    const rMixed = scoreLoopSeamlessness(mixed, 8, true);
    const rUniform = scoreLoopSeamlessness(uniform, 8, true);
    expect(rMixed.confidence).toBeLessThan(rUniform.confidence);
  });
});
