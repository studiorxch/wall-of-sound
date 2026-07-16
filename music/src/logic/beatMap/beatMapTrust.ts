// Track Beat Map Foundation — the one canonical trust helper (§5 of 0713D).
// A beat map may influence repair or sequencing only when every condition
// below holds; missing/untrusted maps must remain neutral, never
// fabricated. Trust decision itself is delegated to calibrationThresholds'
// evaluateTrust (0714_MUSIC_Beat_Map_Confidence_Calibration §15) — total
// score alone is insufficient; critical component minimums must also clear.

import type { TrackBeatMap } from "../../data/beatMapTypes";
import { BEAT_MAP_DETECTOR_VERSION } from "../../data/beatMapTypes";
import { evaluateTrust, hasBlockingWarning, TRUST_THRESHOLD } from "./calibration/calibrationThresholds";

export function isBeatMapTrustedForAnalysis(beatMap?: TrackBeatMap): boolean {
  if (!beatMap) return false;
  if (beatMap.detectorVersion !== BEAT_MAP_DETECTOR_VERSION) return false;
  if (beatMap.beatTimesSeconds.length === 0) return false;

  for (let i = 1; i < beatMap.beatTimesSeconds.length; i++) {
    if (beatMap.beatTimesSeconds[i] <= beatMap.beatTimesSeconds[i - 1]) return false;
  }

  if (beatMap.barStartTimesSeconds.length > 0) {
    const beatSet = new Set(beatMap.beatTimesSeconds);
    for (const bar of beatMap.barStartTimesSeconds) {
      if (!beatSet.has(bar)) return false;
    }
  }

  if (!(beatMap.tempoStabilityScore >= 0 && beatMap.tempoStabilityScore <= 1)) return false;
  if (beatMap.source !== "detected" && beatMap.source !== "manual") return false;

  // §15 — a detected map's trust is the full critical-minimum rule, keyed
  // off its named components (not just the total). A manually-authored map
  // (no detector components) falls back to the simpler total-vs-threshold
  // check plus the blocking-warning gate — it has no components to check
  // critical minimums against, but should not bypass trust review entirely.
  if (beatMap.confidenceComponents) {
    return evaluateTrust(beatMap.confidenceComponents, beatMap.warnings);
  }
  return beatMap.confidence >= TRUST_THRESHOLD && !hasBlockingWarning(beatMap.warnings);
}
