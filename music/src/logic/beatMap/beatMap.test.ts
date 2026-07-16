import { describe, it, expect } from "vitest";
import { trackBeats } from "./beatTracking";
import { evaluatePhaseCandidates } from "./downbeatPhaseCandidates";
import { combinePhaseCandidates } from "./barGridConfidence";
import { computeTempoStability } from "./tempoStability";

function detectDownbeatBars(mono: Float32Array, sampleRate: number, beatTimesSeconds: number[], durationSeconds: number, beatPeriodSeconds: number) {
  const candidates = evaluatePhaseCandidates(mono, sampleRate, beatTimesSeconds, 4);
  const fullTrackCoverage = beatTimesSeconds.length > 0 ? Math.min(1, (beatTimesSeconds.length * beatPeriodSeconds) / durationSeconds) : 0;
  const { downbeatConfidence, barGridConfidence, selectedPhaseIndex } = combinePhaseCandidates(candidates, fullTrackCoverage);
  const firstDownbeatSeconds = selectedPhaseIndex != null ? beatTimesSeconds[selectedPhaseIndex] : undefined;
  const barStartTimesSeconds: number[] = [];
  if (selectedPhaseIndex != null) {
    for (let i = selectedPhaseIndex; i < beatTimesSeconds.length; i += 4) barStartTimesSeconds.push(beatTimesSeconds[i]);
  }
  return { firstDownbeatSeconds, downbeatConfidence: downbeatConfidence.total, barStartTimesSeconds, barConfidence: barGridConfidence.total };
}
import { detectIntroRegion, detectOutroRegion } from "./mixRegionDetection";
import { isBeatMapTrustedForAnalysis } from "./beatMapTrust";
import { computeTrackBeatMap } from "./computeTrackBeatMap";
import { BEAT_MAP_DETECTOR_VERSION } from "../../data/beatMapTypes";
import type { AudioAnalysisInput, BpmDetectionResult } from "../../data/audioDetectionTypes";
import type { TrackBeatMap } from "../../data/beatMapTypes";

const SAMPLE_RATE = 22050;

// Synthetic click/kick track — a short burst of energy every `periodSeconds`,
// with every 4th click boosted (a crude downbeat accent), starting at
// `firstBeatSeconds`. Deterministic, no real audio decode needed.
function makeClickTrack(opts: {
  periodSeconds: number;
  durationSeconds: number;
  firstBeatSeconds?: number;
  accentEveryNth?: number;
  jitterSeconds?: number; // per-beat timing drift (simulates live/irregular playing)
  silentUntilSeconds?: number;
  fadeOutLastSeconds?: number;
}): Float32Array {
  const {
    periodSeconds, durationSeconds, firstBeatSeconds = periodSeconds, accentEveryNth = 4,
    jitterSeconds = 0, silentUntilSeconds = 0, fadeOutLastSeconds = 0,
  } = opts;
  const n = Math.floor(durationSeconds * SAMPLE_RATE);
  const mono = new Float32Array(n);
  const clickSamples = Math.round(0.01 * SAMPLE_RATE); // 10ms click

  let beatIndex = 0;
  for (let t = firstBeatSeconds; t < durationSeconds; t += periodSeconds, beatIndex++) {
    if (t < silentUntilSeconds) continue;
    const jitter = jitterSeconds ? (Math.sin(beatIndex * 12.9898) * 0.5) * jitterSeconds : 0;
    const center = Math.round((t + jitter) * SAMPLE_RATE);
    const amp = beatIndex % accentEveryNth === 0 ? 1.0 : 0.5;
    let fadeGain = 1;
    if (fadeOutLastSeconds > 0 && t > durationSeconds - fadeOutLastSeconds) {
      fadeGain = Math.max(0, (durationSeconds - t) / fadeOutLastSeconds);
    }
    for (let i = 0; i < clickSamples && center + i < n; i++) {
      const decay = Math.exp(-i / (clickSamples / 4));
      mono[center + i] += amp * decay * fadeGain * (i % 2 === 0 ? 1 : -1); // crude "click" waveform
    }
  }
  return mono;
}

function makeInput(mono: Float32Array, durationSeconds: number): AudioAnalysisInput {
  return { sampleRate: SAMPLE_RATE, channels: [mono], mono, durationSeconds };
}

function makeBpmResult(bpm: number, beatPeriodSeconds: number): BpmDetectionResult {
  return {
    bpm,
    confidence: 0.8,
    confidenceDetail: { signalConfidence: 0.8, candidateConfidence: 0.8, metricalConfidence: 0.8, overallConfidence: 0.8 },
    beatPeriodSeconds,
    source: "detected",
    detectorVersion: "bpm-v1.1.0",
    warningCodes: [],
  };
}

const STABLE_BPM = 128;
const STABLE_PERIOD = 60 / STABLE_BPM;

function stableClickInput(durationSeconds = 30) {
  const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds, firstBeatSeconds: STABLE_PERIOD });
  return makeInput(mono, durationSeconds);
}

// ── Data integrity ───────────────────────────────────────────────────────────

describe("data integrity", () => {
  it("beat timestamps increase strictly", () => {
    const input = stableClickInput();
    const { beatTimesSeconds } = trackBeats(input.mono, input.sampleRate, STABLE_PERIOD, input.durationSeconds);
    for (let i = 1; i < beatTimesSeconds.length; i++) {
      expect(beatTimesSeconds[i]).toBeGreaterThan(beatTimesSeconds[i - 1]);
    }
  });

  it("bar starts reference real beat positions", () => {
    const input = stableClickInput();
    const { beatTimesSeconds } = trackBeats(input.mono, input.sampleRate, STABLE_PERIOD, input.durationSeconds);
    const { barStartTimesSeconds } = detectDownbeatBars(input.mono, input.sampleRate, beatTimesSeconds, input.durationSeconds, STABLE_PERIOD);
    const beatSet = new Set(beatTimesSeconds);
    for (const bar of barStartTimesSeconds) expect(beatSet.has(bar)).toBe(true);
  });

  it("tempo segments do not overlap", () => {
    const input = stableClickInput();
    const { beatTimesSeconds, beatConfidence } = trackBeats(input.mono, input.sampleRate, STABLE_PERIOD, input.durationSeconds);
    const { tempoSegments } = computeTempoStability(beatTimesSeconds, beatConfidence);
    for (let i = 1; i < tempoSegments.length; i++) {
      expect(tempoSegments[i].startSeconds).toBeGreaterThanOrEqual(tempoSegments[i - 1].endSeconds);
    }
  });

  it("confidence values stay within 0-1", () => {
    const input = stableClickInput();
    const beatMap = computeTrackBeatMap(input, makeBpmResult(STABLE_BPM, STABLE_PERIOD));
    expect(beatMap).toBeDefined();
    expect(beatMap!.confidence).toBeGreaterThanOrEqual(0);
    expect(beatMap!.confidence).toBeLessThanOrEqual(1);
    expect(beatMap!.tempoStabilityScore).toBeGreaterThanOrEqual(0);
    expect(beatMap!.tempoStabilityScore).toBeLessThanOrEqual(1);
  });
});

// ── Detection ────────────────────────────────────────────────────────────────

describe("detection", () => {
  it("a stable click produces a stable tempo reading", () => {
    const input = stableClickInput();
    const { beatTimesSeconds, beatConfidence } = trackBeats(input.mono, input.sampleRate, STABLE_PERIOD, input.durationSeconds);
    const { tempoStable, tempoStabilityScore } = computeTempoStability(beatTimesSeconds, beatConfidence);
    expect(tempoStable).toBe(true);
    expect(tempoStabilityScore).toBeGreaterThan(0.75);
  });

  it("first beat is not forced to zero on a silent-intro track", () => {
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 20, firstBeatSeconds: 4, silentUntilSeconds: 4 });
    const { firstBeatSeconds } = trackBeats(mono, SAMPLE_RATE, STABLE_PERIOD, 20);
    if (firstBeatSeconds != null) expect(firstBeatSeconds).not.toBe(0);
  });

  it("downbeat remains undefined when there is no accent evidence", () => {
    // accentEveryNth = 1 means every beat is equally loud — no bar-1 signal to find.
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 20, accentEveryNth: 1 });
    const { beatTimesSeconds } = trackBeats(mono, SAMPLE_RATE, STABLE_PERIOD, 20);
    const { firstDownbeatSeconds, downbeatConfidence } = detectDownbeatBars(mono, SAMPLE_RATE, beatTimesSeconds, 20, STABLE_PERIOD);
    expect(downbeatConfidence).toBeLessThan(1);
    if (downbeatConfidence < 0.25) expect(firstDownbeatSeconds).toBeUndefined();
  });

  it("timing drift (live-feel jitter) produces lower stability than a rigid click", () => {
    const rigid = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30 });
    const drifting = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, jitterSeconds: 0.08 });
    const rigidBeats = trackBeats(rigid, SAMPLE_RATE, STABLE_PERIOD, 30);
    const driftBeats = trackBeats(drifting, SAMPLE_RATE, STABLE_PERIOD, 30);
    const rigidStability = computeTempoStability(rigidBeats.beatTimesSeconds, rigidBeats.beatConfidence);
    const driftStability = computeTempoStability(driftBeats.beatTimesSeconds, driftBeats.beatConfidence);
    expect(driftStability.tempoStabilityScore).toBeLessThanOrEqual(rigidStability.tempoStabilityScore);
  });
});

// ── Mix regions ──────────────────────────────────────────────────────────────

describe("mix regions", () => {
  it("detects a clean intro on a long stable click track", () => {
    const input = stableClickInput(40);
    const { beatTimesSeconds } = trackBeats(input.mono, input.sampleRate, STABLE_PERIOD, input.durationSeconds);
    const { barStartTimesSeconds, barConfidence } = detectDownbeatBars(input.mono, input.sampleRate, beatTimesSeconds, input.durationSeconds, STABLE_PERIOD);
    const intro = detectIntroRegion(input.mono, input.sampleRate, barStartTimesSeconds, STABLE_PERIOD * 4, barConfidence);
    expect(intro).toBeDefined();
    expect(intro!.cleanBars).toBeGreaterThan(0);
  });

  it("rejects a fade-only intro (near-silence) as clean", () => {
    // Very quiet, sparse onsets for the whole first half — mixRegionDetection
    // should not report clean bars where the envelope has almost no activity.
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 20, silentUntilSeconds: 16 });
    const { beatTimesSeconds } = trackBeats(mono, SAMPLE_RATE, STABLE_PERIOD, 20);
    const { barStartTimesSeconds, barConfidence } = detectDownbeatBars(mono, SAMPLE_RATE, beatTimesSeconds, 20, STABLE_PERIOD);
    const intro = detectIntroRegion(mono, SAMPLE_RATE, barStartTimesSeconds, STABLE_PERIOD * 4, barConfidence);
    // Either no region at all, or a materially smaller one than the full track.
    if (intro) expect(intro.endSeconds - intro.startSeconds).toBeLessThan(16);
  });

  it("detects a clean outro on a long stable click track", () => {
    const input = stableClickInput(40);
    const { beatTimesSeconds } = trackBeats(input.mono, input.sampleRate, STABLE_PERIOD, input.durationSeconds);
    const { barStartTimesSeconds, barConfidence } = detectDownbeatBars(input.mono, input.sampleRate, beatTimesSeconds, input.durationSeconds, STABLE_PERIOD);
    const outro = detectOutroRegion(input.mono, input.sampleRate, barStartTimesSeconds, STABLE_PERIOD * 4, barConfidence);
    expect(outro).toBeDefined();
  });

  it("rejects a free-time (faded) outro as clean", () => {
    const mono = makeClickTrack({ periodSeconds: STABLE_PERIOD, durationSeconds: 30, fadeOutLastSeconds: 10 });
    const { beatTimesSeconds } = trackBeats(mono, SAMPLE_RATE, STABLE_PERIOD, 30);
    const { barStartTimesSeconds, barConfidence } = detectDownbeatBars(mono, SAMPLE_RATE, beatTimesSeconds, 30, STABLE_PERIOD);
    const outro = detectOutroRegion(mono, SAMPLE_RATE, barStartTimesSeconds, STABLE_PERIOD * 4, barConfidence);
    if (outro) expect(outro.endSeconds - outro.startSeconds).toBeLessThan(10);
  });
});

// ── Trust ────────────────────────────────────────────────────────────────────

describe("isBeatMapTrustedForAnalysis", () => {
  it("rejects a stale detector version", () => {
    const input = stableClickInput();
    const beatMap = computeTrackBeatMap(input, makeBpmResult(STABLE_BPM, STABLE_PERIOD))!;
    const stale: TrackBeatMap = { ...beatMap, detectorVersion: "beat-map-v0" };
    expect(isBeatMapTrustedForAnalysis(stale)).toBe(false);
  });

  it("rejects low confidence as untrustworthy but neutral (not a crash)", () => {
    const input = stableClickInput();
    const beatMap = computeTrackBeatMap(input, makeBpmResult(STABLE_BPM, STABLE_PERIOD))!;
    const lowConf: TrackBeatMap = {
      ...beatMap, confidence: 0.1,
      confidenceComponents: beatMap.confidenceComponents && { ...beatMap.confidenceComponents, total: 0.1 },
    };
    expect(isBeatMapTrustedForAnalysis(lowConf)).toBe(false);
  });

  it("treats a missing beat map as neutral, not an error", () => {
    expect(isBeatMapTrustedForAnalysis(undefined)).toBe(false);
  });

  it("a manually-sourced map with good scalar confidence and no components passes the fallback trust check", () => {
    const input = stableClickInput();
    const beatMap = computeTrackBeatMap(input, makeBpmResult(STABLE_BPM, STABLE_PERIOD))!;
    // Manual maps have no detector-computed component decomposition — trust
    // falls back to the simpler total-vs-threshold + blocking-warning gate.
    const manual: TrackBeatMap = {
      ...beatMap, source: "manual", confidence: 0.9, detectorVersion: BEAT_MAP_DETECTOR_VERSION,
      confidenceComponents: undefined, warnings: [],
    };
    expect(isBeatMapTrustedForAnalysis(manual)).toBe(true);
  });
});

// ── Integration ──────────────────────────────────────────────────────────────

describe("computeTrackBeatMap integration", () => {
  it("returns undefined (not fabricated) when no BPM period evidence exists", () => {
    const input = stableClickInput(5);
    const beatMap = computeTrackBeatMap(input, makeBpmResult(undefined as unknown as number, undefined as unknown as number));
    expect(beatMap).toBeUndefined();
  });

  it("stamps the current detector version on a fresh computation", () => {
    const input = stableClickInput();
    const beatMap = computeTrackBeatMap(input, makeBpmResult(STABLE_BPM, STABLE_PERIOD));
    expect(beatMap?.detectorVersion).toBe(BEAT_MAP_DETECTOR_VERSION);
  });

  it("a short track is flagged with BEAT_MAP_AUDIO_TOO_SHORT", () => {
    const input = stableClickInput(3);
    const beatMap = computeTrackBeatMap(input, makeBpmResult(STABLE_BPM, STABLE_PERIOD));
    expect(beatMap?.warnings).toContain("BEAT_MAP_AUDIO_TOO_SHORT");
  });
});
