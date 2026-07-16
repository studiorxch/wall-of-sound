// BPM detection engine (0712_MUSIC_BPM_Key_Detection_Engine §6, calibrated
// per 0712_MUSIC_BPM_Key_Detector_Calibration §5–9).
// MUSIC-owned "acceptable fallback" detector: onset-strength envelope +
// autocorrelation-based tempo scoring, with explicit half/double-time
// candidate ranking and a 4-dimension confidence breakdown. No third-party
// dependency, no ML. Detector architecture/adapter boundary unchanged by
// calibration — only internal weighting/thresholds/confidence math.

import type { AudioAnalysisInput, BpmDetectionConfidence, BpmDetectionResult } from "../data/audioDetectionTypes";
import { isValidBpm } from "./dspFeatureExtraction";

export const BPM_DETECTOR_VERSION = "bpm-v1.1.0";

const ENVELOPE_HOP = 512;
const OVERALL_CONFIDENCE_THRESHOLD = 0.35;
const FAMILY_SCORE_RATIO = 0.6; // how close a lag's score must be to count as "same periodicity, different octave"
const AMBIGUITY_MARGIN = 0.15;   // metricalConfidence below this triggers the ambiguity warning

function computeOnsetEnvelope(mono: Float32Array, sampleRate: number): { envelope: Float32Array; hopSeconds: number } {
  const hop = ENVELOPE_HOP;
  const frameCount = Math.floor(mono.length / hop);
  const rms = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    const start = i * hop;
    for (let j = 0; j < hop; j++) {
      const v = mono[start + j];
      sum += v * v;
    }
    rms[i] = Math.sqrt(sum / hop);
  }
  const onset = new Float32Array(frameCount);
  for (let i = 1; i < frameCount; i++) onset[i] = Math.max(0, rms[i] - rms[i - 1]);
  return { envelope: onset, hopSeconds: hop / sampleRate };
}

interface LagScore { lag: number; score: number }

function autocorrelate(envelope: Float32Array, minLag: number, maxLag: number): LagScore[] {
  const n = envelope.length;
  const mean = envelope.reduce((a, b) => a + b, 0) / n;
  const centered = new Float32Array(n);
  for (let i = 0; i < n; i++) centered[i] = envelope[i] - mean;

  const scores: LagScore[] = [];
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < n; i++) sum += centered[i] * centered[i + lag];
    scores.push({ lag, score: sum / (n - lag) });
  }
  return scores;
}

function findNearestLag(scores: LagScore[], targetLag: number): LagScore | undefined {
  let best: LagScore | undefined;
  let bestDist = Infinity;
  for (const s of scores) {
    const d = Math.abs(s.lag - targetLag);
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best && bestDist <= targetLag * 0.15 ? best : undefined;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function emptyResult(warningCode: string): BpmDetectionResult {
  const confidenceDetail: BpmDetectionConfidence = {
    signalConfidence: 0, candidateConfidence: 0, metricalConfidence: 0, overallConfidence: 0,
  };
  return {
    confidence: 0,
    confidenceDetail,
    source: "detected",
    detectorVersion: BPM_DETECTOR_VERSION,
    warningCodes: [warningCode],
  };
}

export function detectBpm(input: AudioAnalysisInput): BpmDetectionResult {
  const { envelope, hopSeconds } = computeOnsetEnvelope(input.mono, input.sampleRate);

  if (envelope.length < 20) return emptyResult("BPM_DETECTION_FAILED");

  const minLag = Math.max(1, Math.floor((60 / 240) / hopSeconds));
  const maxLag = Math.min(envelope.length - 2, Math.ceil((60 / 40) / hopSeconds));
  if (maxLag <= minLag) return emptyResult("BPM_DETECTION_FAILED");

  const scores = autocorrelate(envelope, minLag, maxLag);
  const meanScore = scores.reduce((a, b) => a + b.score, 0) / scores.length;
  const stdScore = Math.sqrt(scores.reduce((a, b) => a + (b.score - meanScore) ** 2, 0) / scores.length) || 1e-9;

  // 1. Root selection is by RAW autocorrelation score only — no tempo prior
  // involved yet (calibration §7: "prior only as tie-breaker, not dominant
  // evidence"). This is the strongest periodic evidence in the signal,
  // whatever octave it happens to land on.
  const rawRanked = [...scores].sort((a, b) => b.score - a.score);
  const root = rawRanked[0];

  // 2. Build the "metrical family" — lags that represent the same underlying
  // periodicity at a different octave/subdivision (half, double, third,
  // triple) and still score close to the root. A genuinely periodic signal
  // autocorrelates at every integer multiple of its true period, so these
  // are expected companions, not independent evidence.
  interface FamilyMember { lag: number; score: number; bpm: number }
  const familyMap = new Map<number, FamilyMember>();
  familyMap.set(root.lag, { lag: root.lag, score: root.score, bpm: 60 / (root.lag * hopSeconds) });
  for (const ratio of [2, 3, 0.5, 1 / 3]) {
    const target = root.lag * ratio;
    if (target < minLag) continue;
    const match = findNearestLag(scores, target);
    if (match && match.score >= root.score * FAMILY_SCORE_RATIO && !familyMap.has(match.lag)) {
      familyMap.set(match.lag, { lag: match.lag, score: match.score, bpm: 60 / (match.lag * hopSeconds) });
    }
  }
  const family = [...familyMap.values()];

  // 3. Tempo prior (log-Gaussian, centered 120 BPM) is applied ONLY to break
  // ties WITHIN the family — i.e. to pick which octave is the "musical" beat
  // when several octaves of the same periodicity score almost identically.
  // It never competes against a genuinely different, unrelated periodicity.
  const priorOf = (bpm: number) => {
    const logRatio = Math.log2(bpm / 120);
    return Math.exp(-(logRatio * logRatio) / (2 * 0.6 * 0.6));
  };
  const familyRanked = [...family].sort((a, b) => (b.score * priorOf(b.bpm)) - (a.score * priorOf(a.bpm)));
  const chosen = familyRanked[0];

  // ── Confidence dimensions (calibration §5.1) ──────────────────────────────

  // signalConfidence: how peaky the autocorrelation is overall — is there
  // real periodic evidence, independent of which octave wins.
  const signalZ = (root.score - meanScore) / stdScore;
  const signalConfidence = clamp01(signalZ / 4);

  // candidateConfidence: does the winning periodicity clearly outrank an
  // UNRELATED rival (not just a different octave of itself)?
  const bestUnrelated = rawRanked.find((s) => !familyMap.has(s.lag));
  const candidateConfidence = bestUnrelated
    ? clamp01((root.score - bestUnrelated.score) / (Math.abs(root.score) + 1e-9))
    : 1; // no unrelated rival at all in range — as distinct as it gets

  // metricalConfidence: among octaves of the SAME periodicity, how clearly
  // does the strongest one (by raw evidence) beat the next-closest octave?
  // This must be measured on RAW scores, ranked independently of the prior —
  // `chosen` may be a prior-preferred octave that the prior legitimately
  // outranks on raw evidence (e.g. picking the musical beat over a 3x
  // subharmonic); that is a deliberate override, not ambiguity, and must not
  // produce a negative margin that clamps straight to 0. Ambiguity is a
  // property of the family's raw-score spread, not of which member won.
  const familyByRawScore = [...family].sort((a, b) => b.score - a.score);
  const topRawFamilyMember = familyByRawScore[0];
  const secondRawFamilyMember = familyByRawScore[1];
  const metricalConfidence = secondRawFamilyMember
    ? clamp01((topRawFamilyMember.score - secondRawFamilyMember.score) / (Math.abs(topRawFamilyMember.score) + 1e-9) / AMBIGUITY_MARGIN)
    : 1; // only one plausible octave found — unambiguous

  // overallConfidence: conservative — a single weak dimension caps the
  // result. This is what stops a strong-but-metrically-ambiguous peak from
  // ever reporting 1.0 (calibration §5.1 requirement).
  const overallConfidence = clamp01(Math.min(signalConfidence, candidateConfidence, metricalConfidence));

  const halfCandidate = findNearestLag(scores, chosen.lag * 2);
  const doubleCandidate = findNearestLag(scores, chosen.lag / 2);
  const halfTimeCandidate = halfCandidate ? +(60 / (halfCandidate.lag * hopSeconds)).toFixed(2) : undefined;
  const doubleTimeCandidate = doubleCandidate ? +(60 / (doubleCandidate.lag * hopSeconds)).toFixed(2) : undefined;

  const warningCodes: string[] = [];
  let bpmRaw = chosen.bpm;
  while (bpmRaw < 40) bpmRaw *= 2;
  while (bpmRaw > 240) bpmRaw /= 2;

  let bpm: number | undefined = isValidBpm(bpmRaw) ? +bpmRaw.toFixed(2) : undefined;
  if (bpm == null) warningCodes.push("BPM_OUT_OF_RANGE");

  if (metricalConfidence < 1 - AMBIGUITY_MARGIN && family.length > 1) {
    warningCodes.push("BPM_HALF_DOUBLE_AMBIGUITY");
  }

  if (overallConfidence < OVERALL_CONFIDENCE_THRESHOLD) {
    warningCodes.push("BPM_DETECTION_LOW_CONFIDENCE");
    bpm = undefined;
  }

  const confidenceDetail: BpmDetectionConfidence = {
    signalConfidence: +signalConfidence.toFixed(3),
    candidateConfidence: +candidateConfidence.toFixed(3),
    metricalConfidence: +metricalConfidence.toFixed(3),
    overallConfidence: +overallConfidence.toFixed(3),
  };

  return {
    bpm,
    confidence: confidenceDetail.overallConfidence,
    confidenceDetail,
    halfTimeCandidate,
    doubleTimeCandidate,
    beatPeriodSeconds: +(chosen.lag * hopSeconds).toFixed(4),
    source: "detected",
    detectorVersion: BPM_DETECTOR_VERSION,
    warningCodes,
  };
}
