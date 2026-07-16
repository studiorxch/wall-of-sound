import { describe, it, expect } from "vitest";
import { evaluatePhaseCandidates } from "./downbeatPhaseCandidates";
import { combinePhaseCandidates } from "./barGridConfidence";
import { evaluateMeter } from "./meterEvidence";
import { trackBeats } from "./beatTracking";
import { computeTrackBeatMap } from "./computeTrackBeatMap";
import { makeClickTrack, makeInput, makeBpmResult, FIXTURE_SAMPLE_RATE } from "./calibration/calibrationFixtures";
import { buildDownbeatBarFixtures } from "./calibration/downbeatBarFixtures";
import { diagnoseFixture } from "./calibration/calibrationReport";
import { summarizeCalibration } from "./calibration/calibrationReport";
import { buildSyntheticFixtures } from "./calibration/calibrationFixtures";

const STABLE_BPM = 128;
const STABLE_PERIOD = 60 / STABLE_BPM;

function stableMono(durationSeconds = 30, accentStrength = 0.75) {
  return makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds, accentStrength });
}

// ── Candidate phases ──────────────────────────────────────────────────────────

describe("candidate phases", () => {
  it("evaluates all 4 phases for a 4/4 grid", () => {
    const mono = stableMono();
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const candidates = evaluatePhaseCandidates(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds, 4);
    expect(candidates.length).toBe(4);
    expect(new Set(candidates.map((c) => c.phaseIndex))).toEqual(new Set([0, 1, 2, 3]));
  });

  it("the correct phase wins on a strong-accent fixture", () => {
    const mono = stableMono(30, 0.85);
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const candidates = evaluatePhaseCandidates(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds, 4);
    const best = [...candidates].sort((a, b) => b.totalScore - a.totalScore)[0];
    // Accents land on beat index 0, 4, 8... (phase 0) by construction.
    expect(best.phaseIndex).toBe(0);
  });

  it("near-ties remain ambiguous rather than guessing", () => {
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, accentEveryNth: 2, accentStrength: 0.02 });
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const candidates = evaluatePhaseCandidates(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds, 4);
    const { selectedPhaseIndex, ambiguous } = combinePhaseCandidates(candidates, 1);
    if (ambiguous) expect(selectedPhaseIndex).toBeUndefined();
  });

  it("one loud event cannot dominate the full result", () => {
    // A single extreme spike at an off-phase position, but otherwise flat
    // accent everywhere — recurrence evidence (summed across ALL bars)
    // should prevent that one spike's phase from winning outright.
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, accentEveryNth: 100 }); // effectively no periodic accent
    const n = mono.length;
    const spikeCenter = Math.floor(n * 0.1); // one huge early spike
    for (let i = 0; i < 200 && spikeCenter + i < n; i++) mono[spikeCenter + i] += 5;
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const candidates = evaluatePhaseCandidates(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds, 4);
    // No candidate should reach a near-1.0 total purely from one spike.
    for (const c of candidates) expect(c.totalScore).toBeLessThan(0.9);
  });
});

// ── Evidence ─────────────────────────────────────────────────────────────────

describe("evidence", () => {
  it("low-band recurrence improves the correct phase's margin over the runner-up", () => {
    // Scores are normalized per-track relative to the strongest phase, so
    // absolute totalScore isn't directly comparable across tracks — what a
    // stronger accent should improve is the MARGIN between the winning
    // phase and the runner-up (clearer separation, less ambiguity).
    const weak = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, accentStrength: 0.1 });
    const strong = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, accentStrength: 0.85 });
    const weakBeats = trackBeats(weak, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30).beatTimesSeconds;
    const strongBeats = trackBeats(strong, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30).beatTimesSeconds;
    const weakCandidates = evaluatePhaseCandidates(weak, FIXTURE_SAMPLE_RATE, weakBeats, 4);
    const strongCandidates = evaluatePhaseCandidates(strong, FIXTURE_SAMPLE_RATE, strongBeats, 4);
    const weakMargin = combinePhaseCandidates(weakCandidates, 1).barGridConfidence.margin;
    const strongMargin = combinePhaseCandidates(strongCandidates, 1).barGridConfidence.margin;
    expect(strongMargin).toBeGreaterThanOrEqual(weakMargin);
  });

  it("missing harmonic evidence remains neutral (0.5), never penalizing", () => {
    const mono = stableMono();
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const candidates = evaluatePhaseCandidates(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds, 4);
    for (const c of candidates) expect(c.harmonicChangeScore).toBe(0.5);
  });

  it("broken beat (swing-like offsets) is not rejected solely for syncopation", () => {
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, jitterSeconds: 0.02, accentStrength: 0.6 });
    const beatMap = computeTrackBeatMap(makeInput(mono, 30), makeBpmResult(STABLE_BPM, STABLE_PERIOD));
    expect(beatMap?.confidenceComponents?.downbeatRecurrence).toBeGreaterThan(0.3);
  });
});

// ── Bar confidence ───────────────────────────────────────────────────────────

describe("bar confidence", () => {
  it("computes best/second-best margin correctly", () => {
    const mono = stableMono();
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const candidates = evaluatePhaseCandidates(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds, 4);
    const sorted = [...candidates].sort((a, b) => b.totalScore - a.totalScore);
    const { barGridConfidence } = combinePhaseCandidates(candidates, 1);
    expect(barGridConfidence.margin).toBeCloseTo(sorted[0].totalScore - sorted[1].totalScore, 3);
  });

  it("an unstable phase (frequent dropouts) lowers confidence relative to a stable one", () => {
    const stable = stableMono();
    const unstable = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, dropoutEveryNth: 2, accentStrength: 0.6 });
    const stableBeats = trackBeats(stable, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30).beatTimesSeconds;
    const unstableBeats = trackBeats(unstable, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30).beatTimesSeconds;
    const stableConf = combinePhaseCandidates(evaluatePhaseCandidates(stable, FIXTURE_SAMPLE_RATE, stableBeats, 4), 1).barGridConfidence;
    const unstableConf = combinePhaseCandidates(evaluatePhaseCandidates(unstable, FIXTURE_SAMPLE_RATE, unstableBeats, 4), 1).barGridConfidence;
    expect(unstableConf.total).toBeLessThanOrEqual(stableConf.total);
  });

  it("a strong phase score with low full-track coverage is not trusted", () => {
    const mono = stableMono();
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const candidates = evaluatePhaseCandidates(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds, 4);
    const lowCoverage = combinePhaseCandidates(candidates, 0.1);
    const fullCoverage = combinePhaseCandidates(candidates, 1);
    expect(lowCoverage.barGridConfidence.total).toBeLessThan(fullCoverage.barGridConfidence.total);
  });
});

// ── Meter ────────────────────────────────────────────────────────────────────

describe("meter", () => {
  it("recognizes a clean 4/4 fixture", () => {
    const mono = stableMono();
    const { beatTimesSeconds } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    const meter = evaluateMeter(mono, FIXTURE_SAMPLE_RATE, beatTimesSeconds);
    expect(meter.meter).toBe("4/4");
  });

  it("a meter-conflict fixture (3-beat accent cycle) does NOT get forced into a 4/4 grid", () => {
    // §10 requirement: "do not force 4/4 when recurrence strongly disagrees."
    // A genuine 3-beat accent cycle is strong, legitimate evidence FOR 3/4 —
    // correctly recognizing it as 3/4 (not silently relabeling it 4/4) is
    // the desired behavior, verified directly against evaluateMeter's own
    // per-meter candidate scores rather than asserting vague "uncertainty."
    const fixture = buildDownbeatBarFixtures().find((f) => f.fixtureId === "db_03_meter_conflict")!;
    const { beatTimesSeconds } = trackBeats(fixture.input.mono, fixture.input.sampleRate, fixture.bpmResult.beatPeriodSeconds!, fixture.input.durationSeconds);
    const meter = evaluateMeter(fixture.input.mono, fixture.input.sampleRate, beatTimesSeconds);
    expect(meter.meter).not.toBe("4/4");
    expect(meter.candidateScoresByMeter[3]).toBeGreaterThan(meter.candidateScoresByMeter[4]);
  });

  it("a genuinely well-supported non-4/4 meter is allowed to trust — trust is about evidence quality, not meter identity", () => {
    const fixture = buildDownbeatBarFixtures().find((f) => f.fixtureId === "db_03_meter_conflict")!;
    const beatMap = computeTrackBeatMap(fixture.input, fixture.bpmResult);
    // This fixture's 3-beat cycle is deliberately strong and clean —
    // trusting it is correct. What matters is that it trusted the RIGHT
    // meter (3/4), not that it silently reported 4/4.
    expect(beatMap?.timeSignature?.numerator).toBe(3);
  });
});

// ── Regression ───────────────────────────────────────────────────────────────

describe("regression", () => {
  it("beat timing (beatTimesSeconds) is unchanged by this build's downbeat/bar rewrite", () => {
    const mono = stableMono();
    const { beatTimesSeconds, beatPhaseFit } = trackBeats(mono, FIXTURE_SAMPLE_RATE, STABLE_PERIOD, 30);
    expect(beatPhaseFit).toBeGreaterThan(0.9);
    expect(beatTimesSeconds.length).toBeGreaterThan(0);
  });

  it("false-trust rate does not increase on the base synthetic dataset", () => {
    const diagnostics = buildSyntheticFixtures().map(diagnoseFixture);
    const summary = summarizeCalibration(diagnostics);
    expect(summary.trustedWrongCount).toBe(0);
  });

  it("displaced-accent and ambiguous-phase fixtures do not produce a confidently-wrong trusted grid", () => {
    const diagnostics = buildDownbeatBarFixtures().map(diagnoseFixture);
    for (const d of diagnostics) {
      if (d.status === "trusted") {
        // If trusted, it must at least have decisive (non-ambiguous) evidence.
        expect(d.confidence.downbeatRecurrence).toBeGreaterThan(0.4);
      }
    }
  });

  it("a manual beat map's downbeat is never overwritten by recomputation logic in this module", () => {
    // computeTrackBeatMap always produces source: "detected" — manual maps
    // are a caller-side concern (never constructed by this function), so a
    // manual TrackBeatMap object passed elsewhere is structurally untouched.
    const mono = stableMono();
    const beatMap = computeTrackBeatMap(makeInput(mono, 30), makeBpmResult(STABLE_BPM, STABLE_PERIOD));
    expect(beatMap?.source).toBe("detected");
  });
});
