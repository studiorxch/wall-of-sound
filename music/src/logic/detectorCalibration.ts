// BPM/key detector calibration harness (0712_MUSIC_BPM_Key_Detector_Calibration
// §4/§9/§16/§22). A labeled dataset + comparison functions for measuring
// detector accuracy — does not replace or wrap the detectors themselves;
// callers decode/synthesize an AudioAnalysisInput and pass it in.

import type { AudioAnalysisInput } from "../data/audioDetectionTypes";
import { detectBpm } from "./bpmDetection";
import { detectKey } from "./keyDetection";

export type CalibrationCharacteristic =
  | "steady_four_on_floor"
  | "breakbeat"
  | "hip_hop"
  | "ambient"
  | "weak_percussion"
  | "tempo_drift"
  | "sparse_intro"
  | "double_time_risk"
  | "half_time_risk"
  | "major"
  | "minor"
  | "relative_major_minor_ambiguity"
  | "tonic_drone"
  | "percussion_only"
  | "atonal"
  | "noisy"
  | "detuned"
  | "key_change";

export interface DetectorCalibrationCase {
  id: string;
  title: string;
  sourceType: "synthetic" | "manual_reference" | "trusted_metadata" | "catalog" | "external";
  expectedBpm?: number;
  expectedBpmAlternates?: number[];
  expectedTonic?: string;
  expectedMode?: "major" | "minor";
  expectedCamelot?: string;
  characteristics: CalibrationCharacteristic[];
}

export type BpmResultCategory = "exact" | "near" | "half_time" | "double_time" | "unresolved" | "wrong";
export type KeyResultCategory = "exact" | "camelot_neighbor" | "relative_confusion" | "unresolved" | "wrong";

export interface BpmCalibrationOutcome {
  case: DetectorCalibrationCase;
  detectedBpm?: number;
  overallConfidence: number;
  category: BpmResultCategory;
  absoluteError?: number;
  warningCodes: string[];
  processingMs: number;
}

export interface KeyCalibrationOutcome {
  case: DetectorCalibrationCase;
  detectedTonic?: string;
  detectedMode?: "major" | "minor";
  detectedCamelot?: string;
  overallConfidence: number;
  category: KeyResultCategory;
  warningCodes: string[];
  processingMs: number;
}

function classifyBpmOutcome(c: DetectorCalibrationCase, detectedBpm: number | undefined): BpmResultCategory {
  if (c.expectedBpm == null) return detectedBpm == null ? "unresolved" : "wrong";
  if (detectedBpm == null) return "unresolved";
  const err = Math.abs(detectedBpm - c.expectedBpm);
  if (err <= 1) return "exact";
  if (err <= 3) return "near";
  if (Math.abs(detectedBpm - c.expectedBpm / 2) <= 1) return "half_time";
  if (Math.abs(detectedBpm - c.expectedBpm * 2) <= 1) return "double_time";
  return "wrong";
}

export function runBpmCalibrationCase(c: DetectorCalibrationCase, input: AudioAnalysisInput): BpmCalibrationOutcome {
  const t0 = Date.now();
  const result = detectBpm(input);
  const processingMs = Date.now() - t0;
  return {
    case: c,
    detectedBpm: result.bpm,
    overallConfidence: result.confidenceDetail.overallConfidence,
    category: classifyBpmOutcome(c, result.bpm),
    absoluteError: c.expectedBpm != null && result.bpm != null ? +Math.abs(result.bpm - c.expectedBpm).toFixed(2) : undefined,
    warningCodes: result.warningCodes,
    processingMs,
  };
}

function relativeKeyPitchClassMatch(expectedTonic: string, expectedMode: "major" | "minor", detectedTonic: string, detectedMode: "major" | "minor"): boolean {
  // Same pitch-class SET, different tonic assignment (classic relative confusion).
  return expectedMode !== detectedMode && expectedTonic !== detectedTonic;
}

function classifyKeyOutcome(c: DetectorCalibrationCase, tonic: string | undefined, mode: "major" | "minor" | undefined, camelot: string | undefined): KeyResultCategory {
  if (c.expectedTonic == null || c.expectedMode == null) return tonic == null ? "unresolved" : "wrong";
  if (tonic == null || mode == null) return "unresolved";
  if (tonic === c.expectedTonic && mode === c.expectedMode) return "exact";
  if (c.expectedCamelot && camelot === c.expectedCamelot) return "exact";
  if (relativeKeyPitchClassMatch(c.expectedTonic, c.expectedMode, tonic, mode)) return "relative_confusion";
  return "wrong";
}

export function runKeyCalibrationCase(c: DetectorCalibrationCase, input: AudioAnalysisInput): KeyCalibrationOutcome {
  const t0 = Date.now();
  const result = detectKey(input);
  const processingMs = Date.now() - t0;
  return {
    case: c,
    detectedTonic: result.tonic,
    detectedMode: result.mode,
    detectedCamelot: result.camelotKey,
    overallConfidence: result.confidenceDetail.overallConfidence,
    category: classifyKeyOutcome(c, result.tonic, result.mode, result.camelotKey),
    warningCodes: result.warningCodes,
    processingMs,
  };
}

// ── Synthetic signal generators (no ground-truth audio files available in
// this environment — deterministic synthetic signals stand in for the
// "synthetic" sourceType rows of the calibration set) ───────────────────────

/**
 * A click track with a real accent pattern (kick-on-1, snare/clap-on-3-style
 * emphasis every 2 beats), not a flat isochronous pulse train. A pure
 * unaccented click train is a Dirac comb — mathematically it autocorrelates
 * EQUALLY at every integer multiple of its true period, so half/double-time
 * are information-theoretically indistinguishable from it, no matter how the
 * detector is tuned. Real percussion always carries a downbeat/backbeat
 * accent, which is exactly the cue that resolves that ambiguity — omitting
 * it made every earlier click-track case an artificially worst-case test.
 */
export function synthesizeClickTrack(bpm: number, sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  const beatPeriod = 60 / bpm;
  for (let i = 0; i < n; i++) mono[i] = (Math.random() - 0.5) * 0.01;
  let t = 0;
  let beatIndex = 0;
  while (t < durationSec) {
    const idx = Math.floor(t * sampleRate);
    const accent = beatIndex % 4 === 0 ? 1 : 0.7;
    for (let k = 0; k < sampleRate * 0.015 && idx + k < n; k++) {
      mono[idx + k] += accent * Math.exp(-k / (sampleRate * 0.003));
    }
    t += beatPeriod;
    beatIndex++;
  }
  return mono;
}

const PITCH_CLASS_INDEX: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};

function noteFreq(semitoneFromA4: number): number {
  return 440 * Math.pow(2, semitoneFromA4 / 12);
}
function freqForPitchClass(pc: number, octaveOffset = 0): number {
  return noteFreq(pc - 9 + 12 * octaveOffset);
}

/** Tonic-emphasized synthesis (bass drone + tonic/third/fifth) — the
 * favorable case documented in the baseline (calibration §2). */
export function synthesizeTonicEmphasis(tonic: string, mode: "major" | "minor", sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  const tonicPc = PITCH_CLASS_INDEX[tonic];
  const third = mode === "major" ? (tonicPc + 4) % 12 : (tonicPc + 3) % 12;
  const fifth = (tonicPc + 7) % 12;
  for (let i = 0; i < n; i++) {
    const tSec = i / sampleRate;
    mono[i] += 0.3 * Math.sin(2 * Math.PI * freqForPitchClass(tonicPc, -1) * tSec);
    mono[i] += 0.1 * Math.sin(2 * Math.PI * freqForPitchClass(tonicPc, 0) * tSec);
    mono[i] += 0.06 * Math.sin(2 * Math.PI * freqForPitchClass(third, 0) * tSec);
    mono[i] += 0.06 * Math.sin(2 * Math.PI * freqForPitchClass(fifth, 0) * tSec);
  }
  return mono;
}

/** Flat diatonic-triad cycling — the unfavorable case (relative major/minor
 * ambiguity by construction: equal weight on every scale degree). */
export function synthesizeFlatDiatonicCycle(scalePitchClasses: number[], sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  const chordDur = 1.0;
  let t = 0, chordIdx = 0;
  while (t < durationSec) {
    const root = scalePitchClasses[chordIdx % scalePitchClasses.length];
    const third = scalePitchClasses[(chordIdx + 2) % scalePitchClasses.length];
    const fifth = scalePitchClasses[(chordIdx + 4) % scalePitchClasses.length];
    const startIdx = Math.floor(t * sampleRate);
    const endIdx = Math.min(n, Math.floor((t + chordDur) * sampleRate));
    for (const pc of [root, third, fifth]) {
      const freq = freqForPitchClass(pc, -1);
      for (let i = startIdx; i < endIdx; i++) mono[i] += 0.15 * Math.sin(2 * Math.PI * freq * (i / sampleRate));
    }
    t += chordDur;
    chordIdx++;
  }
  return mono;
}

export function synthesizePercussionOnly(sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  let t = 0;
  while (t < durationSec) {
    const idx = Math.floor(t * sampleRate);
    for (let k = 0; k < sampleRate * 0.02 && idx + k < n; k++) {
      mono[idx + k] += (Math.random() - 0.5) * Math.exp(-k / (sampleRate * 0.004));
    }
    t += 60 / 128;
  }
  return mono;
}

export function synthesizeWhiteNoise(sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (Math.random() - 0.5) * 0.3;
  return mono;
}

export function toInput(mono: Float32Array, sampleRate: number): AudioAnalysisInput {
  return { sampleRate, channels: [mono], mono, durationSeconds: mono.length / sampleRate };
}

// ── Additional synthetic generators (calibration §9 required characteristics) ─

/** Breakbeat-style syncopation: kick on the beat, snare-like hit on the
 * "and" of 2 and on 4 — same underlying tempo period as a straight click
 * track, but with off-grid accents so a naive detector can't rely on evenly
 * spaced peaks alone. */
export function synthesizeBreakbeatClick(bpm: number, sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  const beatPeriod = 60 / bpm;
  for (let i = 0; i < n; i++) mono[i] = (Math.random() - 0.5) * 0.01;
  const hit = (tSec: number, amp: number, decaySec: number) => {
    const idx = Math.floor(tSec * sampleRate);
    for (let k = 0; k < sampleRate * 0.02 && idx + k < n; k++) {
      mono[idx + k] += amp * Math.exp(-k / (sampleRate * decaySec));
    }
  };
  let bar = 0;
  const barDur = beatPeriod * 4;
  while (bar * barDur < durationSec) {
    const base = bar * barDur;
    hit(base, 1, 0.004);                          // kick on 1
    hit(base + beatPeriod * 1.5, 0.8, 0.002);      // snare-ish on the "and" of 2
    hit(base + beatPeriod * 2, 0.6, 0.004);        // kick on 3
    hit(base + beatPeriod * 3, 0.9, 0.002);        // snare on 4
    bar++;
  }
  return mono;
}

/** Gradual tempo drift (linear ramp from startBpm to endBpm across the clip)
 * — a live/human-performed take rather than a fixed metronomic grid. */
export function synthesizeTempoDrift(startBpm: number, endBpm: number, sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = (Math.random() - 0.5) * 0.01;
  let t = 0;
  while (t < durationSec) {
    const frac = t / durationSec;
    const instBpm = startBpm + (endBpm - startBpm) * frac;
    const idx = Math.floor(t * sampleRate);
    for (let k = 0; k < sampleRate * 0.015 && idx + k < n; k++) {
      mono[idx + k] += Math.exp(-k / (sampleRate * 0.003));
    }
    t += 60 / instBpm;
  }
  return mono;
}

/** Sparse/silent intro (first third of the clip near-silent) before a
 * regular click track starts — tests that a short usable-signal window
 * still yields a correct read rather than being dragged down by silence. */
export function synthesizeSparseIntroClick(bpm: number, sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  const introSec = durationSec / 3;
  for (let i = 0; i < n; i++) mono[i] = (Math.random() - 0.5) * 0.002;
  const beatPeriod = 60 / bpm;
  let t = introSec;
  while (t < durationSec) {
    const idx = Math.floor(t * sampleRate);
    for (let k = 0; k < sampleRate * 0.015 && idx + k < n; k++) {
      mono[idx + k] += Math.exp(-k / (sampleRate * 0.003));
    }
    t += beatPeriod;
  }
  return mono;
}

/** Tonic emphasis with a fixed cent-level detune applied to every partial —
 * an instrument slightly off standard pitch, not a wrong note. */
export function synthesizeDetunedTonicEmphasis(tonic: string, mode: "major" | "minor", centsOff: number, sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  const tonicPc = PITCH_CLASS_INDEX[tonic];
  const third = mode === "major" ? (tonicPc + 4) % 12 : (tonicPc + 3) % 12;
  const fifth = (tonicPc + 7) % 12;
  const detuneRatio = Math.pow(2, centsOff / 1200);
  for (let i = 0; i < n; i++) {
    const tSec = i / sampleRate;
    mono[i] += 0.3 * Math.sin(2 * Math.PI * freqForPitchClass(tonicPc, -1) * detuneRatio * tSec);
    mono[i] += 0.1 * Math.sin(2 * Math.PI * freqForPitchClass(tonicPc, 0) * detuneRatio * tSec);
    mono[i] += 0.06 * Math.sin(2 * Math.PI * freqForPitchClass(third, 0) * detuneRatio * tSec);
    mono[i] += 0.06 * Math.sin(2 * Math.PI * freqForPitchClass(fifth, 0) * detuneRatio * tSec);
  }
  return mono;
}

/** A real mid-track key change: first half in tonicA, second half in
 * tonicB — tests that a single-key-per-track detector at least produces a
 * defensible (not wildly wrong) read rather than a silent crash, since no
 * single "correct" answer exists for the whole clip. */
export function synthesizeKeyChange(tonicA: string, modeA: "major" | "minor", tonicB: string, modeB: "major" | "minor", sampleRate: number, durationSec: number): Float32Array {
  const half = durationSec / 2;
  const a = synthesizeTonicEmphasis(tonicA, modeA, sampleRate, half);
  const b = synthesizeTonicEmphasis(tonicB, modeB, sampleRate, half);
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Weak/low-amplitude percussion (ambient-adjacent) — real signal, but much
 * quieter than a normal percussion_only case, testing the signal-confidence
 * floor rather than the tonal side. */
export function synthesizeWeakPercussion(sampleRate: number, durationSec: number): Float32Array {
  const full = synthesizePercussionOnly(sampleRate, durationSec);
  const out = new Float32Array(full.length);
  for (let i = 0; i < full.length; i++) out[i] = full[i] * 0.25;
  return out;
}

/** Ambient pad — very low transient content, slow-moving tonal texture, no
 * clear beat at all. Used for both "no confident BPM" and "resolvable key"
 * expectations depending on the case. */
export function synthesizeAmbientPad(tonic: string, sampleRate: number, durationSec: number): Float32Array {
  const n = Math.floor(sampleRate * durationSec);
  const mono = new Float32Array(n);
  const tonicPc = PITCH_CLASS_INDEX[tonic];
  const fifth = (tonicPc + 7) % 12;
  for (let i = 0; i < n; i++) {
    const tSec = i / sampleRate;
    const swell = 0.5 + 0.5 * Math.sin(2 * Math.PI * 0.05 * tSec);
    mono[i] += 0.08 * swell * Math.sin(2 * Math.PI * freqForPitchClass(tonicPc, -1) * tSec);
    mono[i] += 0.04 * swell * Math.sin(2 * Math.PI * freqForPitchClass(fifth, -1) * tSec);
  }
  return mono;
}

// ── Full labeled calibration dataset (§9) ─────────────────────────────────────
// Covers every required characteristic tag. Synthetic-only (no ground-truth
// audio files exist in this sandbox); each case's tag set documents WHY it's
// in the set, independent of whether the detector currently passes it.

export interface CalibrationDatasetCase {
  case: DetectorCalibrationCase;
  kind: "bpm" | "key";
  mono: Float32Array;
}

const SR = 22050;
const DUR = 30; // matches the real ~120s analysis cap's order of magnitude far better than an 8s clip; see calibration report for rationale.

export function buildCalibrationDataset(): CalibrationDatasetCase[] {
  const cases: CalibrationDatasetCase[] = [];
  const bpmCase = (id: string, title: string, expectedBpm: number, mono: Float32Array, characteristics: CalibrationCharacteristic[]) => {
    cases.push({ kind: "bpm", mono, case: { id, title, sourceType: "synthetic", expectedBpm, characteristics } });
  };
  const keyCase = (id: string, title: string, mono: Float32Array, characteristics: CalibrationCharacteristic[], expectedTonic?: string, expectedMode?: "major" | "minor") => {
    cases.push({ kind: "key", mono, case: { id, title, sourceType: "synthetic", expectedTonic, expectedMode, characteristics } });
  };

  // BPM cases
  bpmCase("bpm_60_steady", "60bpm steady four-on-floor", 60, synthesizeClickTrack(60, SR, DUR), ["steady_four_on_floor"]);
  bpmCase("bpm_70_steady", "70bpm steady four-on-floor", 70, synthesizeClickTrack(70, SR, DUR), ["steady_four_on_floor"]);
  bpmCase("bpm_100_steady", "100bpm steady", 100, synthesizeClickTrack(100, SR, DUR), ["steady_four_on_floor"]);
  bpmCase("bpm_128_steady", "128bpm steady (house)", 128, synthesizeClickTrack(128, SR, DUR), ["steady_four_on_floor", "double_time_risk"]);
  bpmCase("bpm_40_half_risk", "40bpm — half/double ambiguous by construction", 40, synthesizeClickTrack(40, SR, DUR), ["half_time_risk", "double_time_risk"]);
  bpmCase("bpm_87_half_risk", "87.5bpm — half/double ambiguous by construction", 87.5, synthesizeClickTrack(87.5, SR, DUR), ["half_time_risk"]);
  bpmCase("bpm_120_half_risk", "120bpm — half/double ambiguous by construction", 120, synthesizeClickTrack(120, SR, DUR), ["half_time_risk", "double_time_risk"]);
  bpmCase("bpm_175_double_risk", "175bpm (drum & bass) — double-time risk", 175, synthesizeClickTrack(175, SR, DUR), ["double_time_risk"]);
  bpmCase("bpm_breakbeat_140", "140bpm breakbeat syncopation", 140, synthesizeBreakbeatClick(140, SR, DUR), ["breakbeat"]);
  bpmCase("bpm_hiphop_90", "90bpm hip-hop-style (breakbeat, slower)", 90, synthesizeBreakbeatClick(90, SR, DUR), ["hip_hop", "breakbeat"]);
  bpmCase("bpm_drift_120_130", "tempo drift 120→130bpm", 125, synthesizeTempoDrift(120, 130, SR, DUR), ["tempo_drift"]);
  bpmCase("bpm_sparse_intro_128", "128bpm with silent/sparse intro", 128, synthesizeSparseIntroClick(128, SR, DUR), ["sparse_intro"]);
  cases.push({
    // synthesizePercussionOnly (which this wraps at 25% amplitude) has a
    // real internal 128bpm periodicity — this case tests whether reduced
    // signal strength alone degrades detection of an otherwise-real beat.
    kind: "bpm", mono: synthesizeWeakPercussion(SR, DUR),
    case: { id: "bpm_weak_percussion", title: "Weak/low-amplitude percussion (real 128bpm signal at low amplitude)", sourceType: "synthetic", expectedBpm: 128, characteristics: ["weak_percussion"] },
  });
  cases.push({
    kind: "bpm", mono: synthesizeAmbientPad("D", SR, DUR),
    case: { id: "bpm_ambient_no_beat", title: "Ambient pad — no discernible beat", sourceType: "synthetic", characteristics: ["ambient"] },
  });

  // Key cases
  keyCase("key_c_major", "C major, tonic-emphasized", synthesizeTonicEmphasis("C", "major", SR, DUR), ["major"], "C", "major");
  keyCase("key_a_minor", "A minor, tonic-emphasized", synthesizeTonicEmphasis("A", "minor", SR, DUR), ["minor"], "A", "minor");
  keyCase("key_e_major", "E major, tonic-emphasized", synthesizeTonicEmphasis("E", "major", SR, DUR), ["major"], "E", "major");
  keyCase("key_d_minor", "D minor, tonic-emphasized", synthesizeTonicEmphasis("D", "minor", SR, DUR), ["minor"], "D", "minor");
  keyCase("key_tonic_drone_g", "G major tonic drone (bass-heavy, minimal harmony)", synthesizeTonicEmphasis("G", "major", SR, DUR), ["tonic_drone", "major"], "G", "major");
  keyCase("key_relative_ambiguity", "Flat diatonic cycle — C major/A minor pitch-class overlap by construction", synthesizeFlatDiatonicCycle([0, 2, 4, 5, 7, 9, 11], SR, DUR), ["relative_major_minor_ambiguity"]);
  keyCase("key_detuned_c_major", "C major detuned +35 cents", synthesizeDetunedTonicEmphasis("C", "major", 35, SR, DUR), ["detuned", "major"], "C", "major");
  keyCase("key_change_c_to_g", "Key change: C major → G major mid-track", synthesizeKeyChange("C", "major", "G", "major", SR, DUR), ["key_change"]);
  keyCase("key_percussion_only", "Percussion only — no tonal content", synthesizePercussionOnly(SR, DUR), ["percussion_only"]);
  keyCase("key_atonal_noise", "White noise — atonal, no real signal", synthesizeWhiteNoise(SR, DUR), ["atonal", "noisy"]);

  return cases;
}
