import { describe, it, expect } from "vitest";
import { composeConfidenceComponents, computeConfidenceAxes, computePriorAgreement, computeWarningPenalty } from "./confidenceComponents";
import { computeBeatMapAccuracy, BEAT_MATCH_TOLERANCE_MS } from "./accuracyMetrics";
import { classifyStatus, evaluateTrust, TRUST_THRESHOLD, MIN_BAR_ALIGNMENT } from "./calibrationThresholds";
import { buildSyntheticFixtures, makeClickTrack, makeInput, makeBpmResult } from "./calibrationFixtures";
import { diagnoseFixture, summarizeCalibration } from "./calibrationReport";
import { computeTrackBeatMap } from "../computeTrackBeatMap";
import { trackBeats } from "../beatTracking";
import type { TrackBeatMap } from "../../../data/beatMapTypes";
import type { BeatMapConfidenceComponents } from "../../../data/beatMapCalibrationTypes";

const STABLE_BPM = 128;
const STABLE_PERIOD = 60 / STABLE_BPM;

function makeComponents(overrides: Partial<BeatMapConfidenceComponents> = {}): BeatMapConfidenceComponents {
  return {
    onsetStrength: 0.8, onsetRegularity: 0.8, beatPhaseFit: 0.8, beatCoverage: 0.8, beatContinuity: 0.8,
    downbeatRecurrence: 0.8, barAlignment: 0.8, tempoStability: 0.8, segmentConsistency: 1,
    introRegionConfidence: 0.5, outroRegionConfidence: 0.5, priorAgreement: 1, warningPenalty: 1,
    total: 0.8, ...overrides,
  };
}

// ── Confidence decomposition ─────────────────────────────────────────────────

describe("confidence decomposition", () => {
  it("all components stay within 0-1", () => {
    const fixture = buildSyntheticFixtures().find((f) => f.fixtureId === "synth_16_additive_noise")!;
    const beatMap = computeTrackBeatMap(fixture.input, fixture.bpmResult);
    expect(beatMap).toBeDefined();
    const c = beatMap!.confidenceComponents!;
    for (const [key, value] of Object.entries(c)) {
      expect(value, key).toBeGreaterThanOrEqual(0);
      expect(value, key).toBeLessThanOrEqual(1);
    }
  });

  it("total is reproducible from the same component record", () => {
    const inputs = {
      onsetStrength: 0.7, onsetRegularity: 0.6, beatPhaseFit: 0.9, beatCoverage: 0.8, beatContinuity: 0.7,
      downbeatRecurrence: 0.5, barAlignment: 0.6, tempoStability: 0.9, tempoSegments: [], durationSeconds: 30,
      warnings: [] as const,
    };
    const a = composeConfidenceComponents({ ...inputs, warnings: [...inputs.warnings] });
    const b = composeConfidenceComponents({ ...inputs, warnings: [...inputs.warnings] });
    expect(a.total).toBe(b.total);
  });

  it("warning penalty is deterministic for a given warning list", () => {
    const p1 = computeWarningPenalty(["BEAT_MAP_TEMPO_DRIFT", "BEAT_MAP_IRREGULAR_METER"]);
    const p2 = computeWarningPenalty(["BEAT_MAP_TEMPO_DRIFT", "BEAT_MAP_IRREGULAR_METER"]);
    expect(p1).toBe(p2);
    expect(p1).toBeLessThan(1);
  });

  it("axes stay separate — a weak downbeat does not erase a strong beat grid", () => {
    const components = makeComponents({ downbeatRecurrence: 0.05, barAlignment: 0.05 });
    const axes = computeConfidenceAxes(components);
    expect(axes.beatGridConfidence).toBeGreaterThan(0.5);
    expect(axes.downbeatConfidence).toBeLessThan(0.5);
  });

  it("prior agreement recognizes a half-time relationship without rewarding disagreement", () => {
    const halfTime = computePriorAgreement(128, 64);
    expect(halfTime.relationship).toBe("half_time");
    const disagreement = computePriorAgreement(128, 90);
    expect(disagreement.relationship).toBe("disagreement");
  });
});

// ── Accuracy metrics ─────────────────────────────────────────────────────────

describe("accuracy metrics", () => {
  it("computes correct precision/recall/F-measure for a perfect match", () => {
    const detected: TrackBeatMap = {
      version: "1.0", beatTimesSeconds: [0.5, 1, 1.5, 2], barStartTimesSeconds: [],
      tempoStable: true, tempoStabilityScore: 1, tempoSegments: [], confidence: 1,
      source: "detected", detectorVersion: "beat-map-v2", analyzedAt: "", warnings: [],
    };
    const truth = { fixtureId: "x", trackClass: "stable_electronic" as const, durationSeconds: 3, beatTimesSeconds: [0.5, 1, 1.5, 2], annotationConfidence: 1 };
    const acc = computeBeatMapAccuracy(detected, truth);
    expect(acc.beatPrecision).toBe(1);
    expect(acc.beatRecall).toBe(1);
    expect(acc.beatFMeasure).toBe(1);
  });

  it("respects the beat match tolerance window", () => {
    const withinTolerance = 0.5 + (BEAT_MATCH_TOLERANCE_MS / 1000) * 0.5;
    const beyondTolerance = 0.5 + (BEAT_MATCH_TOLERANCE_MS / 1000) * 2;
    const detected: TrackBeatMap = {
      version: "1.0", beatTimesSeconds: [withinTolerance, beyondTolerance], barStartTimesSeconds: [],
      tempoStable: true, tempoStabilityScore: 1, tempoSegments: [], confidence: 1,
      source: "detected", detectorVersion: "beat-map-v2", analyzedAt: "", warnings: [],
    };
    const truth = { fixtureId: "x", trackClass: "stable_electronic" as const, durationSeconds: 3, beatTimesSeconds: [0.5], annotationConfidence: 1 };
    const acc = computeBeatMapAccuracy(detected, truth);
    expect(acc.beatRecall).toBe(1); // the one truth beat is matched by the in-tolerance detection
    expect(acc.beatPrecision).toBe(0.5); // the beyond-tolerance detection counts as unmatched
  });

  it("beat, downbeat, and bar metrics are computed independently", () => {
    const detected: TrackBeatMap = {
      version: "1.0", beatTimesSeconds: [0, 0.5, 1, 1.5, 2], barStartTimesSeconds: [0],
      firstDownbeatSeconds: 0, tempoStable: true, tempoStabilityScore: 1, tempoSegments: [], confidence: 1,
      source: "detected", detectorVersion: "beat-map-v2", analyzedAt: "", warnings: [],
    };
    const truth = {
      fixtureId: "x", trackClass: "stable_electronic" as const, durationSeconds: 3,
      beatTimesSeconds: [0, 0.5, 1, 1.5, 2], barStartTimesSeconds: [10], firstDownbeatSeconds: 5, annotationConfidence: 1,
    };
    const acc = computeBeatMapAccuracy(detected, truth);
    expect(acc.beatFMeasure).toBe(1); // beats agree exactly
    expect(acc.downbeatAccuracy).toBe(0); // downbeat wildly wrong
    expect(acc.barStartAccuracy).toBe(0); // bar start wildly wrong
  });
});

// ── Thresholds ───────────────────────────────────────────────────────────────

describe("thresholds", () => {
  it("trusted status requires the critical minimums, not just total", () => {
    const highTotalBadBar = makeComponents({ total: 0.9, barAlignment: 0.1 });
    expect(evaluateTrust(highTotalBadBar, [])).toBe(false);
  });

  it("a high total with bad bar alignment is rejected even with no warnings", () => {
    const components = makeComponents({ total: TRUST_THRESHOLD + 0.1, barAlignment: MIN_BAR_ALIGNMENT - 0.1 });
    expect(evaluateTrust(components, [])).toBe(false);
  });

  it("strong beat with weak downbeat may still be classified partial rather than trusted", () => {
    const components = makeComponents({ total: 0.6, downbeatRecurrence: 0.1, barAlignment: 0.1 });
    expect(classifyStatus(components.total)).toBe("partial");
    expect(evaluateTrust(components, [])).toBe(false);
  });

  it("a blocking warning prevents trust even at a qualifying total", () => {
    const components = makeComponents({ total: 0.9 });
    expect(evaluateTrust(components, ["BEAT_MAP_BAR_ALIGNMENT_UNCERTAIN"])).toBe(false);
  });
});

// ── Rhythm classes ───────────────────────────────────────────────────────────

describe("rhythm classes", () => {
  const fixtures = buildSyntheticFixtures();

  it("stable electronic reaches the expected high-confidence range", () => {
    const fixture = fixtures.find((f) => f.fixtureId === "synth_01_perfect_4_4_click")!;
    const diag = diagnoseFixture(fixture);
    expect(diag.confidence.total).toBeGreaterThan(0.7);
    expect(diag.status === "trusted" || diag.status === "partial").toBe(true);
  });

  it("broken beat (swing offsets) is not penalized to unusable solely for its offset pattern", () => {
    const fixture = fixtures.find((f) => f.fixtureId === "synth_04_swing_offsets")!;
    const diag = diagnoseFixture(fixture);
    expect(diag.status).not.toBe("unusable");
  });

  it("linear tempo drift lowers stability appropriately", () => {
    const stable = fixtures.find((f) => f.fixtureId === "synth_01_perfect_4_4_click")!;
    const drifting = fixtures.find((f) => f.fixtureId === "synth_11_linear_tempo_drift")!;
    const stableDiag = diagnoseFixture(stable);
    const driftDiag = diagnoseFixture(drifting);
    expect(driftDiag.tempoStabilityScore).toBeLessThanOrEqual(stableDiag.tempoStabilityScore);
  });

  it("abrupt tempo change is NOT segmented by the current fixed-grid tempo-stability measurement (documented limitation)", () => {
    // KNOWN LIMITATION (see tempoStability.ts header + this build's
    // calibration report): the beat grid is a single fixed-period
    // extrapolation, so windowed-BPM variance always reads ~0 regardless of
    // real tempo changes in the underlying audio. This test asserts the
    // ACTUAL current behavior (not the aspirational one) so a future fix
    // is a deliberate, visible test change rather than a silent regression.
    const fixture = fixtures.find((f) => f.fixtureId === "synth_12_abrupt_tempo_change")!;
    const beatMap = computeTrackBeatMap(fixture.input, fixture.bpmResult);
    expect(beatMap?.tempoSegments.length).toBe(1);
  });

  it("heavy additive noise does not produce a falsely trusted grid", () => {
    const fixture = fixtures.find((f) => f.fixtureId === "synth_16_additive_noise")!;
    const diag = diagnoseFixture(fixture);
    // Noise should not push confidence into "trusted" territory purely from
    // broadband energy — the grid still has to explain a real fraction of it.
    if (diag.status === "trusted") {
      expect(diag.confidence.beatPhaseFit).toBeGreaterThanOrEqual(0.5);
    }
  });
});

// ── Regression ───────────────────────────────────────────────────────────────

describe("regression", () => {
  it("the integer-frame phase-drift bug (0713D) remains fixed — beat confidence stays high on a rigid click", () => {
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30 });
    const { beatPhaseFit } = trackBeats(mono, 22050, STABLE_PERIOD, 30);
    expect(beatPhaseFit).toBeGreaterThan(0.9);
  });

  it("a wrong half/double BPM prior does not create a confidently-wrong trusted grid", () => {
    const fixture = buildSyntheticFixtures().find((f) => f.fixtureId === "synth_19_wrong_half_double_prior")!;
    const diag = diagnoseFixture(fixture);
    // The prior disagreement should be visible in priorAgreement even if the
    // grid itself (built from beatPeriodSeconds, not the prior BPM value
    // directly) still tracks the real beats.
    expect(diag.confidence.priorAgreement).toBeLessThan(1);
  });

  it("a missing beat map remains neutral (never a fabricated trusted result)", () => {
    const input = makeInput(new Float32Array(1000), 30);
    const beatMap = computeTrackBeatMap(input, makeBpmResult(undefined, undefined));
    expect(beatMap).toBeUndefined();
  });

  it("calibration summary reports zero false-trust when no trusted fixtures are wrong", () => {
    const fixtures = buildSyntheticFixtures().filter((f) => f.fixtureId === "synth_01_perfect_4_4_click");
    const diagnostics = fixtures.map(diagnoseFixture);
    const summary = summarizeCalibration(diagnostics);
    expect(summary.trustedWrongCount).toBe(0);
  });
});
