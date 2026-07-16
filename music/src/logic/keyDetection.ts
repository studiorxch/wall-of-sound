// Musical-key detection engine (0712_MUSIC_BPM_Key_Detection_Engine §7,
// calibrated per 0712_MUSIC_BPM_Key_Detector_Calibration §10–16).
// Chroma (pitch-class) extraction via the shared FFT + Krumhansl-Schmuckler
// key-profile correlation, with a bass-weighted tonic profile and explicit
// relative major/minor ambiguity detection. MUSIC-owned "acceptable
// fallback" detector — no third-party dependency, no ML. Detector
// architecture/adapter boundary unchanged by calibration — only internal
// weighting/thresholds/confidence math.

import type { AudioAnalysisInput, KeyCandidate, KeyDetectionConfidence, KeyDetectionResult } from "../data/audioDetectionTypes";
import { magnitudeSpectrum } from "./fft";
import { NOTE_NAMES, noteModeToCamelot } from "./camelot";

export const KEY_DETECTOR_VERSION = "key-v1.1.0";

const FRAME_SIZE = 4096;
const HOP_SIZE = 2048;
const MIN_FREQ_HZ = 80;    // below this, pitch tracking is unreliable / sub-bass
const MAX_FREQ_HZ = 5000;  // above this, harmonic content stops being tonally useful
const BASS_MAX_FREQ_HZ = 320; // tonic/bass-weighting range (calibration §12)
const OVERALL_CONFIDENCE_THRESHOLD = 0.25;
const MODE_AMBIGUITY_MARGIN = 0.08;
// Bass evidence supports the tonic decision but must not dominate it
// (calibration §12: "do not allow kick drums or low-frequency noise to
// dominate tonic selection").
const BASS_WEIGHT = 0.35;

// Krumhansl-Schmuckler key profiles (relative tonal salience per scale degree,
// starting at the tonic — index 0).
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function freqToPitchClass(freq: number): number {
  const midi = 69 + 12 * Math.log2(freq / 440);
  return ((Math.round(midi) % 12) + 12) % 12;
}

interface ChromaExtractionResult {
  fullRangeChroma: number[];
  bassRangeChroma: number[];
  combinedChroma: number[];
  framesUsed: number;
  totalFrames: number;
}

// Calibration §12 (KeyEvidence) — a second, lower-frequency chroma vector
// used only as supporting tonic evidence, blended into (not replacing) the
// full-range profile used for the actual major/minor correlation.
function extractChroma(mono: Float32Array, sampleRate: number): ChromaExtractionResult {
  const fullRangeChroma = new Array(12).fill(0);
  const bassRangeChroma = new Array(12).fill(0);
  const binHz = sampleRate / FRAME_SIZE;
  const minBin = Math.max(1, Math.floor(MIN_FREQ_HZ / binHz));
  const maxBin = Math.min(FRAME_SIZE / 2 - 1, Math.ceil(MAX_FREQ_HZ / binHz));
  const bassMaxBin = Math.min(maxBin, Math.ceil(BASS_MAX_FREQ_HZ / binHz));

  let framesUsed = 0;
  let totalFrames = 0;
  for (let start = 0; start + FRAME_SIZE <= mono.length; start += HOP_SIZE) {
    totalFrames++;
    const frame = mono.subarray(start, start + FRAME_SIZE);

    // Skip near-silent frames — they'd just inject noise into the chroma vector.
    let energy = 0;
    for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
    if (Math.sqrt(energy / frame.length) < 0.01) continue;

    const mags = magnitudeSpectrum(frame, FRAME_SIZE);
    for (let k = minBin; k <= maxBin; k++) {
      const freq = k * binHz;
      const pc = freqToPitchClass(freq);
      fullRangeChroma[pc] += mags[k];
      if (k <= bassMaxBin) bassRangeChroma[pc] += mags[k];
    }
    framesUsed++;
  }

  const normalize = (v: number[]) => {
    const total = v.reduce((a, b) => a + b, 0);
    return total > 0 ? v.map((x) => x / total) : v;
  };
  const full = normalize(fullRangeChroma);
  const bass = normalize(bassRangeChroma);
  const combined = normalize(full.map((v, i) => v + BASS_WEIGHT * bass[i]));

  return { fullRangeChroma: full, bassRangeChroma: bass, combinedChroma: combined, framesUsed, totalFrames };
}

function correlate(a: number[], b: number[]): number {
  const meanA = a.reduce((s, v) => s + v, 0) / a.length;
  const meanB = b.reduce((s, v) => s + v, 0) / b.length;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] - meanA, y = b[i] - meanB;
    num += x * y; da += x * x; db += y * y;
  }
  const denom = Math.sqrt(da * db);
  return denom > 0 ? num / denom : 0;
}

interface RankedKey { tonic: number; mode: "major" | "minor"; score: number }

function rankKeyCandidates(chroma: number[]): RankedKey[] {
  const results: RankedKey[] = [];
  for (let t = 0; t < 12; t++) {
    const majorShifted = MAJOR_PROFILE.map((_, i) => MAJOR_PROFILE[(i - t + 12) % 12]);
    const minorShifted = MINOR_PROFILE.map((_, i) => MINOR_PROFILE[(i - t + 12) % 12]);
    results.push({ tonic: t, mode: "major", score: correlate(chroma, majorShifted) });
    results.push({ tonic: t, mode: "minor", score: correlate(chroma, minorShifted) });
  }
  return results.sort((a, b) => b.score - a.score);
}

// The relative major/minor of a key shares its entire pitch-class set, so it
// is always the closest-scoring rival to the true key — this is the specific
// ambiguity calibration §13 asks us to name explicitly rather than let it
// silently lower a generic "confidence" number.
function relativeKeyOf(k: RankedKey): { tonic: number; mode: "major" | "minor" } {
  return k.mode === "major"
    ? { tonic: (k.tonic + 9) % 12, mode: "minor" }
    : { tonic: (k.tonic + 3) % 12, mode: "major" };
}

function toKeyCandidate(r: RankedKey): KeyCandidate {
  return {
    tonic: NOTE_NAMES[r.tonic],
    mode: r.mode,
    camelotKey: noteModeToCamelot(r.tonic, r.mode) ?? "",
    confidence: +Math.max(0, r.score).toFixed(3),
  };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function emptyResult(warningCode: string): KeyDetectionResult {
  const confidenceDetail: KeyDetectionConfidence = {
    tonalSignalConfidence: 0, tonicConfidence: 0, modeConfidence: 0, overallConfidence: 0,
  };
  return {
    confidence: 0,
    confidenceDetail,
    source: "detected",
    detectorVersion: KEY_DETECTOR_VERSION,
    alternateCandidates: [],
    warningCodes: [warningCode],
  };
}

export function detectKey(input: AudioAnalysisInput): KeyDetectionResult {
  const chromaResult = extractChroma(input.mono, input.sampleRate);
  const totalEnergy = chromaResult.combinedChroma.reduce((a, b) => a + b, 0);

  if (totalEnergy === 0 || chromaResult.framesUsed === 0) return emptyResult("KEY_DETECTION_FAILED");

  const ranked = rankKeyCandidates(chromaResult.combinedChroma);
  const best = ranked[0];

  // ── Confidence dimensions (calibration §14) ───────────────────────────────

  // tonalSignalConfidence: is there enough stable tonal content to trust any
  // read at all — combines frame coverage (percussion/silence rejection)
  // with how much the winning correlation stands out from the pool of all
  // 24 candidates. An absolute floor on a 12-bin Pearson correlation doesn't
  // work: with only 12 degrees of freedom, pure noise regularly produces a
  // "winning" correlation of 0.4+ by chance alone, so a fixed floor lets
  // noise through. A z-score against the candidate pool's own mean/spread
  // (mirroring the BPM detector's signalConfidence) asks the right question
  // instead: does the winner stand out from its 23 rivals, or does it look
  // like typical chance scatter where everything scores about the same?
  const frameCoverage = chromaResult.framesUsed / Math.max(1, chromaResult.totalFrames);
  const scorePool = ranked.map((r) => r.score);
  const poolMean = scorePool.reduce((a, b) => a + b, 0) / scorePool.length;
  const poolStd = Math.sqrt(scorePool.reduce((a, b) => a + (b - poolMean) ** 2, 0) / scorePool.length) || 1e-9;
  const signalZ = (best.score - poolMean) / poolStd;
  const tonalSignalConfidence = clamp01(frameCoverage * clamp01(signalZ / 2.5));

  // tonicConfidence: does the winning pitch-class SET clearly outrank a
  // genuinely different rival (explicitly skipping the relative-key rival,
  // which shares the same set and is a MODE question, not a tonic question).
  const relative = relativeKeyOf(best);
  const bestDifferentSet = ranked.find(
    (r) => !(r.tonic === best.tonic && r.mode === best.mode) && !(r.tonic === relative.tonic && r.mode === relative.mode),
  );
  const TONIC_AMBIGUITY_MARGIN = 0.25;
  const tonicConfidence = bestDifferentSet
    ? clamp01((best.score - bestDifferentSet.score) / (Math.abs(best.score) + 1e-9) / TONIC_AMBIGUITY_MARGIN)
    : 1;

  // modeConfidence: specifically the relative major/minor question — low
  // when the relative-key rival scores nearly as well as the winner.
  const relativeCandidate = ranked.find((r) => r.tonic === relative.tonic && r.mode === relative.mode);
  const modeConfidence = relativeCandidate
    ? clamp01((best.score - relativeCandidate.score) / MODE_AMBIGUITY_MARGIN)
    : 1;

  // overallConfidence: conservative — calibration §14 explicitly requires
  // "a clear tonic with ambiguous mode must not appear as a high-confidence
  // full key," so a weak mode dimension caps the aggregate regardless of how
  // strong tonicConfidence is.
  const overallConfidence = clamp01(Math.min(tonalSignalConfidence, tonicConfidence, modeConfidence));

  const warningCodes: string[] = [];
  if (modeConfidence < 1) warningCodes.push("KEY_MODE_AMBIGUITY");
  const closeCandidates = ranked.filter(
    (r) => !(r.tonic === best.tonic && r.mode === best.mode) && best.score - r.score < 0.08,
  );
  if (closeCandidates.length >= 2) warningCodes.push("KEY_MULTIPLE_CANDIDATES");

  const alternateCandidates: KeyCandidate[] = ranked
    .filter((r) => r.tonic !== best.tonic || r.mode !== best.mode)
    .slice(0, 3)
    .map(toKeyCandidate);

  const confidenceDetail: KeyDetectionConfidence = {
    tonalSignalConfidence: +tonalSignalConfidence.toFixed(3),
    tonicConfidence: +tonicConfidence.toFixed(3),
    modeConfidence: +modeConfidence.toFixed(3),
    overallConfidence: +overallConfidence.toFixed(3),
  };

  if (overallConfidence < OVERALL_CONFIDENCE_THRESHOLD) {
    warningCodes.push("KEY_DETECTION_LOW_CONFIDENCE");
    return {
      confidence: confidenceDetail.overallConfidence,
      confidenceDetail,
      source: "detected",
      detectorVersion: KEY_DETECTOR_VERSION,
      alternateCandidates,
      warningCodes,
    };
  }

  const camelotKey = noteModeToCamelot(best.tonic, best.mode);

  return {
    tonic: NOTE_NAMES[best.tonic],
    mode: best.mode,
    camelotKey: camelotKey ?? undefined,
    confidence: confidenceDetail.overallConfidence,
    confidenceDetail,
    source: "detected",
    detectorVersion: KEY_DETECTOR_VERSION,
    alternateCandidates,
    warningCodes,
  };
}
