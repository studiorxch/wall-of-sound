// Downbeat and Bar Grid Calibration — additional fixtures beyond the base
// synthetic set (§12: displaced-accent, ambiguous-phase, meter-conflict).
// Reuses the SAME deterministic click generator as calibrationFixtures.ts —
// no parallel fixture-generation pipeline.

import type { BeatMapTrackClass } from "../../../data/beatMapCalibrationTypes";
import { makeClickTrack, makeInput, makeBpmResult, FIXTURE_SAMPLE_RATE, type CalibrationFixture, type ClickTrackOptions } from "./calibrationFixtures";

const STABLE_BPM = 128;
const STABLE_PERIOD = 60 / STABLE_BPM;

function truthBeats(periodSeconds: number, durationSeconds: number, firstBeatSeconds = periodSeconds): number[] {
  const beats: number[] = [];
  for (let t = firstBeatSeconds; t < durationSeconds; t += periodSeconds) beats.push(+t.toFixed(3));
  return beats;
}

function add(
  fixtures: CalibrationFixture[],
  fixtureId: string,
  trackClass: BeatMapTrackClass,
  durationSeconds: number,
  opts: ClickTrackOptions,
  bpm: number,
  notes?: string,
) {
  const mono = makeClickTrack({ ...opts, durationSeconds });
  fixtures.push({
    fixtureId, trackClass,
    input: makeInput(mono, durationSeconds),
    bpmResult: makeBpmResult(bpm, opts.periodSeconds),
    groundTruth: {
      fixtureId, trackClass, durationSeconds, bpm,
      firstBeatSeconds: opts.firstBeatSeconds ?? opts.periodSeconds,
      beatTimesSeconds: truthBeats(opts.periodSeconds, durationSeconds, opts.firstBeatSeconds ?? opts.periodSeconds),
      annotationConfidence: 1,
      notes,
    },
  });
}

// §12 minimum additions — strong-downbeat, weak-downbeat, and
// displaced-accent are already reasonably covered in calibrationFixtures.ts
// (synth_01/08 strong, synth_13 weak); this module adds the classes NOT
// yet represented: genuinely displaced accent (loudest event mid-bar, not
// on any "beat 1" candidate), a true near-tie ambiguous phase, and a
// meter-conflict fixture (3-beat accent cycle on a grid that isn't 4/4).
export function buildDownbeatBarFixtures(): CalibrationFixture[] {
  const fixtures: CalibrationFixture[] = [];

  // Displaced accent — the loud event lands on beat index 2 of every bar
  // (the "and" of beat 2, roughly), never on a true downbeat candidate.
  add(fixtures, "db_01_displaced_accent", "broken_beat", 30, {
    periodSeconds: STABLE_PERIOD, accentEveryNth: 4, accentStrength: 0.6,
    // shift the whole accent cycle by 2 beats using firstBeatSeconds offset
    // trick: start counting accents 2 beats late by pre-pending an offset.
    firstBeatSeconds: STABLE_PERIOD * 3, // beat index 0 lands where "beat 3" would be
  }, STABLE_BPM, "loud accent displaced off any true downbeat candidate");

  // Ambiguous phase — two candidate phases carry near-identical accent
  // strength (both moderately accented), so no phase should win decisively.
  add(fixtures, "db_02_ambiguous_phase", "stable_electronic", 30, {
    periodSeconds: STABLE_PERIOD, accentEveryNth: 2, accentStrength: 0.05,
  }, STABLE_BPM, "near-identical accent on alternating beats — should stay ambiguous, not guess");

  // Meter conflict — a 3-beat accent cycle superimposed on a grid the BPM
  // detector reports as a steady 4-beat-period track. 4/4 should not be
  // forced when recurrence disagrees this strongly.
  add(fixtures, "db_03_meter_conflict", "irregular_meter", 30, {
    periodSeconds: STABLE_PERIOD, accentEveryNth: 3, accentStrength: 0.6,
  }, STABLE_BPM, "3-beat accent cycle against a 4/4 grid assumption");

  return fixtures;
}

export { FIXTURE_SAMPLE_RATE };
