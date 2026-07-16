// Beat Map Confidence Calibration — deterministic synthetic fixtures (§10,
// §11). No Math.random/Date.now — every fixture is reproducible bit-for-bit
// from its parameters, using a simple deterministic pseudo-noise function
// (sine-based) instead of a real RNG.

import type { AudioAnalysisInput, BpmDetectionResult } from "../../../data/audioDetectionTypes";
import type { BeatMapGroundTruth, BeatMapTrackClass } from "../../../data/beatMapCalibrationTypes";

export const FIXTURE_SAMPLE_RATE = 22050;

// Deterministic pseudo-noise in [-1, 1] — NOT Math.random (forbidden in
// workflow scripts, and undesirable here too: fixtures must be
// bit-for-bit reproducible across runs for regression testing).
function detNoise(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return 2 * (x - Math.floor(x)) - 1;
}

export interface ClickTrackOptions {
  periodSeconds: number;
  durationSeconds?: number;
  firstBeatSeconds?: number;
  accentEveryNth?: number;
  accentStrength?: number;      // 0-1, how much louder the accented beat is (0 = no accent)
  jitterSeconds?: number;       // per-beat timing jitter (live feel)
  driftRatePerSecond?: number;  // linear BPM drift, as a fractional period change per second
  tempoChangeAtSeconds?: number;
  tempoChangeNewPeriodSeconds?: number;
  silentUntilSeconds?: number;
  fadeInSeconds?: number;
  fadeOutLastSeconds?: number;
  noiseLevel?: number;          // 0-1 additive broadband noise
  dropoutEveryNth?: number;     // skip every Nth beat entirely
  offGridDistractorEveryNth?: number; // inject a false click halfway between real beats
  ambient?: boolean;            // very low-amplitude, sparse — ambient_pulse class
}

export function makeClickTrack(opts: ClickTrackOptions & { durationSeconds: number }): Float32Array {
  const {
    periodSeconds, durationSeconds, firstBeatSeconds = periodSeconds, accentEveryNth = 4, accentStrength = 0.5,
    jitterSeconds = 0, driftRatePerSecond = 0, tempoChangeAtSeconds, tempoChangeNewPeriodSeconds,
    silentUntilSeconds = 0, fadeInSeconds = 0, fadeOutLastSeconds = 0, noiseLevel = 0,
    dropoutEveryNth = 0, offGridDistractorEveryNth = 0, ambient = false,
  } = opts;
  const n = Math.floor(durationSeconds * FIXTURE_SAMPLE_RATE);
  const mono = new Float32Array(n);
  const clickSamples = Math.round((ambient ? 0.02 : 0.01) * FIXTURE_SAMPLE_RATE);
  const baseAmp = ambient ? 0.15 : 1.0;

  let t = firstBeatSeconds;
  let beatIndex = 0;
  let currentPeriod = periodSeconds;

  while (t < durationSeconds) {
    if (tempoChangeAtSeconds != null && tempoChangeNewPeriodSeconds != null && t >= tempoChangeAtSeconds) {
      currentPeriod = tempoChangeNewPeriodSeconds;
    }
    const drift = driftRatePerSecond * t;
    const effectivePeriod = currentPeriod * (1 + drift);

    if (t >= silentUntilSeconds && !(dropoutEveryNth > 0 && beatIndex % dropoutEveryNth === 0)) {
      const jitter = jitterSeconds ? detNoise(beatIndex * 3.1) * jitterSeconds : 0;
      const center = Math.round((t + jitter) * FIXTURE_SAMPLE_RATE);
      const isAccent = beatIndex % accentEveryNth === 0;
      const amp = baseAmp * (isAccent ? 1.0 : 1.0 - accentStrength);

      let fadeGain = 1;
      if (fadeInSeconds > 0 && t < fadeInSeconds) fadeGain = t / fadeInSeconds;
      if (fadeOutLastSeconds > 0 && t > durationSeconds - fadeOutLastSeconds) {
        fadeGain = Math.min(fadeGain, Math.max(0, (durationSeconds - t) / fadeOutLastSeconds));
      }

      for (let i = 0; i < clickSamples && center + i < n && center + i >= 0; i++) {
        const decay = Math.exp(-i / (clickSamples / 4));
        mono[center + i] += amp * decay * fadeGain * (i % 2 === 0 ? 1 : -1);
      }

      if (offGridDistractorEveryNth > 0 && beatIndex % offGridDistractorEveryNth === 0) {
        const distractorCenter = Math.round((t + effectivePeriod / 2) * FIXTURE_SAMPLE_RATE);
        for (let i = 0; i < clickSamples && distractorCenter + i < n; i++) {
          const decay = Math.exp(-i / (clickSamples / 4));
          mono[distractorCenter + i] += 0.4 * decay * (i % 2 === 0 ? 1 : -1);
        }
      }
    }

    t += effectivePeriod;
    beatIndex++;
  }

  if (noiseLevel > 0) {
    for (let i = 0; i < n; i++) mono[i] += detNoise(i * 0.0001 + 7) * noiseLevel;
  }

  return mono;
}

export function makeInput(mono: Float32Array, durationSeconds: number): AudioAnalysisInput {
  return { sampleRate: FIXTURE_SAMPLE_RATE, channels: [mono], mono, durationSeconds };
}

export function makeBpmResult(bpm: number | undefined, beatPeriodSeconds: number | undefined): BpmDetectionResult {
  return {
    bpm,
    confidence: bpm != null ? 0.8 : 0,
    confidenceDetail: { signalConfidence: 0.8, candidateConfidence: 0.8, metricalConfidence: 0.8, overallConfidence: 0.8 },
    beatPeriodSeconds,
    source: "detected",
    detectorVersion: "bpm-v1.1.0",
    warningCodes: [],
  };
}

export interface CalibrationFixture {
  fixtureId: string;
  trackClass: BeatMapTrackClass;
  input: AudioAnalysisInput;
  bpmResult: BpmDetectionResult;
  groundTruth: BeatMapGroundTruth;
}

const STABLE_BPM = 128;
const STABLE_PERIOD = 60 / STABLE_BPM;

function truthBeats(periodSeconds: number, durationSeconds: number, firstBeatSeconds = periodSeconds): number[] {
  const beats: number[] = [];
  for (let t = firstBeatSeconds; t < durationSeconds; t += periodSeconds) beats.push(+t.toFixed(3));
  return beats;
}

// §11 — deterministic synthetic fixture set. Not all 20 spec scenarios are
// separately instantiated (see the calibration report's "unresolved
// limitations" section for the ones folded together or omitted); this set
// covers the automated-test-relevant core plus the two protected-regression
// cases (integer-frame drift, half/double prior).
export function buildSyntheticFixtures(): CalibrationFixture[] {
  const fixtures: CalibrationFixture[] = [];

  const add = (fixtureId: string, trackClass: BeatMapTrackClass, durationSeconds: number, opts: ClickTrackOptions, bpm: number, notes?: string) => {
    const mono = makeClickTrack({ ...opts, durationSeconds });
    fixtures.push({
      fixtureId, trackClass,
      input: makeInput(mono, durationSeconds),
      bpmResult: makeBpmResult(bpm, opts.periodSeconds),
      groundTruth: {
        fixtureId, trackClass, durationSeconds, bpm,
        firstBeatSeconds: opts.firstBeatSeconds ?? opts.periodSeconds,
        beatTimesSeconds: truthBeats(opts.periodSeconds, durationSeconds, opts.firstBeatSeconds ?? opts.periodSeconds),
        tempoStable: opts.driftRatePerSecond == null && opts.tempoChangeAtSeconds == null,
        annotationConfidence: 1, // synthetic — exact by construction
        notes,
      },
    });
  };

  add("synth_01_perfect_4_4_click", "stable_electronic", 30, { periodSeconds: STABLE_PERIOD, accentStrength: 0.75 }, STABLE_BPM, "unambiguous downbeat accent — the deliberately 'easy' case");
  add("synth_02_quarter_note_kick", "stable_electronic", 30, { periodSeconds: STABLE_PERIOD, accentStrength: 0.3 }, STABLE_BPM);
  add("synth_03_kick_snare_pattern", "stable_electronic", 30, { periodSeconds: STABLE_PERIOD, accentEveryNth: 2, accentStrength: 0.4 }, STABLE_BPM);
  add("synth_04_swing_offsets", "broken_beat", 30, { periodSeconds: STABLE_PERIOD, jitterSeconds: 0.02 }, STABLE_BPM, "small consistent offset approximates swing");
  add("synth_05_half_time_groove", "half_time", 30, { periodSeconds: STABLE_PERIOD * 2 }, STABLE_BPM / 2);
  add("synth_06_double_time_groove", "double_time", 30, { periodSeconds: STABLE_PERIOD / 2 }, STABLE_BPM * 2);
  add("synth_07_silent_intro", "sparse_intro", 30, { periodSeconds: STABLE_PERIOD, silentUntilSeconds: 8 }, STABLE_BPM);
  add("synth_08_pickup_before_bar_one", "stable_electronic", 30, { periodSeconds: STABLE_PERIOD, firstBeatSeconds: STABLE_PERIOD * 0.5 }, STABLE_BPM, "an early pickup beat before the first full bar");
  add("synth_09_fade_in", "fade_in", 30, { periodSeconds: STABLE_PERIOD, fadeInSeconds: 10 }, STABLE_BPM);
  add("synth_10_fade_out", "fade_out", 30, { periodSeconds: STABLE_PERIOD, fadeOutLastSeconds: 10 }, STABLE_BPM);
  add("synth_11_linear_tempo_drift", "tempo_drift", 30, { periodSeconds: STABLE_PERIOD, driftRatePerSecond: 0.003 }, STABLE_BPM);
  add("synth_12_abrupt_tempo_change", "tempo_change", 40, { periodSeconds: STABLE_PERIOD, tempoChangeAtSeconds: 20, tempoChangeNewPeriodSeconds: STABLE_PERIOD * 0.85 }, STABLE_BPM);
  add("synth_13_weak_downbeat_accent", "stable_electronic", 30, { periodSeconds: STABLE_PERIOD, accentStrength: 0.05 }, STABLE_BPM, "accent barely distinguishable from other beats");
  add("synth_14_irregular_accents", "irregular_meter", 30, { periodSeconds: STABLE_PERIOD, accentEveryNth: 3, accentStrength: 0.5 }, STABLE_BPM, "3-beat accent cycle against a 4/4 assumption");
  add("synth_15_sparse_pulse", "low_onset_density", 30, { periodSeconds: STABLE_PERIOD * 2, ambient: true }, STABLE_BPM / 2);
  add("synth_16_additive_noise", "noise_heavy", 30, { periodSeconds: STABLE_PERIOD, noiseLevel: 0.15 }, STABLE_BPM);
  add("synth_17_dropped_beats", "broken_beat", 30, { periodSeconds: STABLE_PERIOD, dropoutEveryNth: 5 }, STABLE_BPM);
  add("synth_18_off_grid_distractions", "broken_beat", 30, { periodSeconds: STABLE_PERIOD, offGridDistractorEveryNth: 3 }, STABLE_BPM);
  add("synth_19_wrong_half_double_prior", "stable_electronic", 30, { periodSeconds: STABLE_PERIOD }, STABLE_BPM * 2, "BPM prior deliberately wrong (reports double)");
  add("synth_20_short_audio", "stable_electronic", 4, { periodSeconds: STABLE_PERIOD }, STABLE_BPM);

  return fixtures;
}
