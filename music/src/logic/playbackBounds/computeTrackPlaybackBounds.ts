// Track Playback Bounds — top-level orchestrator (§20). Consumes the SAME
// decoded AudioAnalysisInput the canonical DSP pipeline already produced —
// no second decode — plus the already-computed beat map (§15/§16: reuse,
// never re-derive intro/outro region detection).

import type { AudioAnalysisInput } from "../../data/audioDetectionTypes";
import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";
import { PLAYBACK_BOUNDS_DETECTOR_VERSION } from "../../data/playbackBoundsTypes";
import { computeRmsWindows } from "./silenceDetection";
import { computeStartBoundary } from "./startBoundary";
import { computeEndBoundary } from "./endBoundary";
import { isBoundsOrderValid } from "./playbackBoundsTrust";
import { assemblePlaybackBoundsWarnings } from "./playbackBoundsWarnings";
import { isBeatMapTrustedForAnalysis } from "../beatMap/beatMapTrust";

// §22 — a scoped, honest source-identity fingerprint: path + duration is
// what's actually available on Track today (no file-size/mtime/hash
// plumbing exists yet). Not a content hash, but sufficient to detect an
// outright file swap or duration change.
export function computeSourceFingerprint(pathHint: string | undefined, durationSeconds: number): string {
  return `${pathHint ?? "unknown"}::${durationSeconds.toFixed(2)}`;
}

export function computeTrackPlaybackBounds(
  input: AudioAnalysisInput,
  pathHint: string | undefined,
  beatMap?: TrackBeatMap,
  priorBounds?: TrackPlaybackBounds,
): TrackPlaybackBounds {
  const rms = computeRmsWindows(input.mono, input.sampleRate);
  const durationSeconds = input.durationSeconds;

  const beatMapTrusted = isBeatMapTrustedForAnalysis(beatMap);
  const lastBeatSeconds = beatMap?.beatTimesSeconds?.length ? beatMap.beatTimesSeconds[beatMap.beatTimesSeconds.length - 1] : undefined;

  const start = computeStartBoundary(rms, durationSeconds, {
    trusted: beatMapTrusted,
    firstBeatSeconds: beatMap?.firstBeatSeconds,
    firstDownbeatSeconds: beatMap?.firstDownbeatSeconds,
    introRegion: beatMapTrusted ? beatMap?.introRegion : undefined,
  });
  const end = computeEndBoundary(rms, durationSeconds, {
    trusted: beatMapTrusted,
    lastBeatSeconds,
    outroRegion: beatMapTrusted ? beatMap?.outroRegion : undefined,
  });

  const effectiveDurationSeconds = +(end.preferredEndSeconds - start.preferredStartSeconds).toFixed(3);
  const overallConfidence = +((start.startConfidence + end.endConfidence) / 2).toFixed(3);

  const orderValid = isBoundsOrderValid({
    audibleStartSeconds: start.audibleStartSeconds,
    preferredStartSeconds: start.preferredStartSeconds,
    preferredEndSeconds: end.preferredEndSeconds,
    audibleEndSeconds: end.audibleEndSeconds,
    sourceDurationSeconds: durationSeconds,
  });

  const sourceFingerprint = computeSourceFingerprint(pathHint, durationSeconds);
  const sourceChanged = priorBounds?.sourceFingerprint != null && priorBounds.sourceFingerprint !== sourceFingerprint;

  const warnings = assemblePlaybackBoundsWarnings({
    sourceDurationSeconds: durationSeconds,
    effectiveDurationSeconds,
    overallConfidence,
    startClassification: start.startClassification,
    endClassification: end.endClassification,
    hasTrustedBeatStart: beatMapTrusted && beatMap?.firstDownbeatSeconds != null,
    hasTrustedBeatEnd: beatMapTrusted && lastBeatSeconds != null,
    orderValid,
  });
  if (sourceChanged) warnings.push("PLAYBACK_BOUNDS_SOURCE_CHANGED");

  // §22 — preserve a manual override only when it's still valid against the
  // (possibly new) source duration; a source replacement with a shorter
  // duration invalidates an override that now points past the end.
  let override = priorBounds?.override;
  if (override) {
    const overrideStart = override.preferredStartSeconds ?? start.preferredStartSeconds;
    const overrideEnd = override.preferredEndSeconds ?? end.preferredEndSeconds;
    const stillValid = overrideStart >= 0 && overrideEnd <= durationSeconds && overrideStart <= overrideEnd;
    if (!stillValid) override = undefined;
  }

  return {
    version: "1.0",
    sourceDurationSeconds: +durationSeconds.toFixed(3),
    audibleStartSeconds: start.audibleStartSeconds,
    preferredStartSeconds: start.preferredStartSeconds,
    preferredEndSeconds: end.preferredEndSeconds,
    audibleEndSeconds: end.audibleEndSeconds,
    leadingSilenceSeconds: start.leadingSilenceSeconds,
    trailingSilenceSeconds: end.trailingSilenceSeconds,
    effectiveDurationSeconds,
    startClassification: start.startClassification,
    endClassification: end.endClassification,
    startConfidence: start.startConfidence,
    endConfidence: end.endConfidence,
    overallConfidence,
    source: "detected",
    detectorVersion: PLAYBACK_BOUNDS_DETECTOR_VERSION,
    analyzedAt: new Date().toISOString(),
    warnings,
    sourceFingerprint,
    override,
  };
}

// §17 — resolves the EFFECTIVE preferred bounds a consumer should use:
// manual override wins when present, but the detected evidence underneath
// is never erased (still readable on `bounds` itself).
export function resolveEffectivePreferredBounds(bounds: TrackPlaybackBounds): { preferredStartSeconds: number; preferredEndSeconds: number } {
  return {
    preferredStartSeconds: bounds.override?.preferredStartSeconds ?? bounds.preferredStartSeconds,
    preferredEndSeconds: bounds.override?.preferredEndSeconds ?? bounds.preferredEndSeconds,
  };
}
