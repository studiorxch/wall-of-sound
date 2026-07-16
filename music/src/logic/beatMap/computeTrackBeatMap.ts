// Track Beat Map Foundation — top-level orchestrator (§6, §16 of 0713D;
// confidence decomposition rewired per 0714_MUSIC_Beat_Map_Confidence_
// Calibration §4/§5/§15; downbeat/bar detection rewired per 0714_MUSIC_
// Downbeat_And_Bar_Grid_Calibration §5/§6/§8/§9/§10). Consumes the SAME
// decoded AudioAnalysisInput and BPM result the canonical DSP pipeline
// already produced — never decodes audio a second time, never re-derives
// tempo independently of the existing BPM detector.

import type { AudioAnalysisInput, BpmDetectionResult } from "../../data/audioDetectionTypes";
import type { TrackBeatMap, BeatMapWarningCode } from "../../data/beatMapTypes";
import { BEAT_MAP_DETECTOR_VERSION } from "../../data/beatMapTypes";
import { trackBeats } from "./beatTracking";
import { evaluateMeter } from "./meterEvidence";
import { evaluatePhaseCandidates } from "./downbeatPhaseCandidates";
import { combinePhaseCandidates } from "./barGridConfidence";
import { computeTempoStability } from "./tempoStability";
import { detectIntroRegion, detectOutroRegion } from "./mixRegionDetection";
import { assembleBeatMapWarnings } from "./beatMapWarnings";
import { composeConfidenceComponents } from "./calibration/confidenceComponents";

const MARGIN_AMBIGUOUS_THRESHOLD = 0.15;

export function computeTrackBeatMap(input: AudioAnalysisInput, bpmResult: BpmDetectionResult): TrackBeatMap | undefined {
  // No usable BPM/period evidence at all — a beat map without any tempo
  // anchor would be fabricated, not detected. Leave undefined (§17: use
  // `undefined` rather than a default array implying successful analysis).
  const beatPeriodSeconds = bpmResult.beatPeriodSeconds;
  if (beatPeriodSeconds == null || !(beatPeriodSeconds > 0)) return undefined;

  const {
    beatTimesSeconds, firstBeatSeconds, beatConfidence,
    onsetStrength, onsetRegularity, beatPhaseFit, beatCoverage, beatContinuity,
  } = trackBeats(input.mono, input.sampleRate, beatPeriodSeconds, input.durationSeconds);

  // §10 — support 4/4 first while evaluating meter confidence explicitly;
  // do not force 4/4 when recurrence strongly disagrees.
  const meter = evaluateMeter(input.mono, input.sampleRate, beatTimesSeconds);
  const beatsPerBar = meter.meter === "3/4" ? 3 : meter.meter === "6/8" ? 6 : 4;

  const phaseCandidates = meter.meter === "unknown" ? [] : evaluatePhaseCandidates(input.mono, input.sampleRate, beatTimesSeconds, beatsPerBar);
  const fullTrackCoverage = beatTimesSeconds.length > 0
    ? Math.min(1, (beatTimesSeconds.length * beatPeriodSeconds) / input.durationSeconds)
    : 0;
  const { barGridConfidence, downbeatConfidence, selectedPhaseIndex, ambiguous } = combinePhaseCandidates(phaseCandidates, fullTrackCoverage);

  const firstDownbeatSeconds = selectedPhaseIndex != null ? beatTimesSeconds[selectedPhaseIndex] : undefined;
  const barStartTimesSeconds: number[] = [];
  if (selectedPhaseIndex != null) {
    for (let i = selectedPhaseIndex; i < beatTimesSeconds.length; i += beatsPerBar) barStartTimesSeconds.push(beatTimesSeconds[i]);
  }

  const { tempoStable, tempoStabilityScore, tempoSegments } = computeTempoStability(beatTimesSeconds, beatConfidence);

  const expectedBarSeconds = beatPeriodSeconds * beatsPerBar;
  const introRegion = detectIntroRegion(input.mono, input.sampleRate, barStartTimesSeconds, expectedBarSeconds, barGridConfidence.total);
  const outroRegion = detectOutroRegion(input.mono, input.sampleRate, barStartTimesSeconds, expectedBarSeconds, barGridConfidence.total);

  const gridBpm = beatPeriodSeconds > 0 ? 60 / beatPeriodSeconds : undefined;

  // §10 — downbeat/bar-specific ambiguity and meter warnings, additive to
  // the base warning taxonomy assembled below.
  const downbeatBarWarnings: BeatMapWarningCode[] = [];
  if (ambiguous && phaseCandidates.length > 0) downbeatBarWarnings.push("BEAT_MAP_DOWNBEAT_PHASE_AMBIGUOUS");
  if (barGridConfidence.margin < MARGIN_AMBIGUOUS_THRESHOLD && phaseCandidates.length > 0) downbeatBarWarnings.push("BEAT_MAP_BAR_PHASE_AMBIGUOUS");
  if (phaseCandidates.length > 0 && Math.abs(downbeatConfidence.accentEvidence - downbeatConfidence.structuralEvidence) > 0.5) downbeatBarWarnings.push("BEAT_MAP_DOWNBEAT_EVIDENCE_CONFLICT");
  if (barGridConfidence.phaseStability < 0.4 && phaseCandidates.length > 0) downbeatBarWarnings.push("BEAT_MAP_BAR_PHASE_UNSTABLE");
  if (meter.meter === "unknown") downbeatBarWarnings.push("BEAT_MAP_METER_UNCERTAIN");

  // Warnings must be assembled from a provisional confidence BEFORE the
  // final composed total (the warning penalty itself depends on which
  // warnings fired) — assemble once with a provisional total for gating
  // purposes, then compose the real components using the resulting
  // warnings list. This two-pass approach keeps the warning penalty
  // deterministic and reproducible from the components alone (§4).
  const provisionalWarnings = [
    ...assembleBeatMapWarnings({
      beatCount: beatTimesSeconds.length,
      firstBeatSeconds,
      firstDownbeatSeconds,
      barCount: barStartTimesSeconds.length,
      overallConfidence: beatPhaseFit, // best available signal before composition
      tempoStabilityScore,
      tempoSegmentCount: tempoSegments.length,
      hasIntroRegion: introRegion != null,
      hasOutroRegion: outroRegion != null,
      durationSeconds: input.durationSeconds,
    }),
    ...downbeatBarWarnings,
  ];

  const components = composeConfidenceComponents({
    onsetStrength, onsetRegularity, beatPhaseFit, beatCoverage, beatContinuity,
    downbeatRecurrence: downbeatConfidence.total,
    barAlignment: barGridConfidence.total,
    tempoStability: tempoStabilityScore,
    tempoSegments, durationSeconds: input.durationSeconds,
    introRegion, outroRegion,
    bpmPrior: bpmResult.bpm, gridBpm,
    warnings: provisionalWarnings,
  });

  // Re-assemble warnings against the FINAL composed total so
  // BEAT_MAP_LOW_CONFIDENCE reflects the number actually persisted.
  const warnings = [
    ...assembleBeatMapWarnings({
      beatCount: beatTimesSeconds.length,
      firstBeatSeconds,
      firstDownbeatSeconds,
      barCount: barStartTimesSeconds.length,
      overallConfidence: components.total,
      tempoStabilityScore,
      tempoSegmentCount: tempoSegments.length,
      hasIntroRegion: introRegion != null,
      hasOutroRegion: outroRegion != null,
      durationSeconds: input.durationSeconds,
    }),
    ...downbeatBarWarnings,
  ];

  return {
    version: "1.0",
    bpm: bpmResult.bpm,
    firstBeatSeconds,
    firstDownbeatSeconds,
    beatTimesSeconds,
    barStartTimesSeconds,
    timeSignature: barStartTimesSeconds.length > 0
      ? { numerator: beatsPerBar, denominator: 4, confidence: barGridConfidence.total }
      : undefined,
    tempoStable,
    tempoStabilityScore,
    tempoSegments,
    introRegion,
    outroRegion,
    confidence: components.total,
    confidenceComponents: components,
    source: "detected",
    detectorVersion: BEAT_MAP_DETECTOR_VERSION,
    analyzedAt: new Date().toISOString(),
    warnings,
  };
}
