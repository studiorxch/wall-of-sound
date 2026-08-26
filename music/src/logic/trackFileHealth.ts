// MUSIC P0 Clean Library Foundation — Step C: Analysis Status + File Health
// (0826B_MUSIC_P0_Clean_Library_Foundation_StepC).
//
// Pure derivation over EXISTING signals — Track.audioMissing/audioStatus and
// the project-level TrackPlaybackIssue map (App.tsx's recheckTrackPlayback)
// — plus Step B's per-asset assetStatus field. No new detection logic here;
// the actual live probing lives in audioPlaybackProbe.ts / App.tsx, which
// already owns codec/network detection. This module only classifies what's
// already known into one small, stable vocabulary, kept deliberately
// separate from AnalysisStatus/AnalysisDisplayState (see
// analysisStatusDisplay.ts) — file health and analysis state must never be
// collapsed into each other.

import type { Track } from "../data/trackTypes";
import type { TrackPlaybackIssue } from "../data/playProjectTypes";
import type { FileHealthStatus } from "../data/fileHealthTypes";
import { getTrackAssets } from "./trackAssetReconciliation";

export function computeTrackFileHealth(
  track: Pick<Track, "trackId" | "audioMissing" | "audioStatus" | "audioRelPath" | "filePath" | "objectUrl">,
  playbackIssues?: Record<string, TrackPlaybackIssue>,
): FileHealthStatus {
  const issue = playbackIssues?.[track.trackId];
  if (issue?.status === "unplayable") {
    switch (issue.code) {
      case "CODEC": return "codec_blocked";
      case "NETWORK": return "unavailable";
      case "MISSING":
      case "NO_SOURCE": return "missing";
      default: return "unavailable";
    }
  }
  if (track.audioMissing === true || track.audioStatus === "missing") return "missing";
  if (track.audioStatus === "unresolved") return "unresolved";
  const hasSource = !!(track.audioRelPath || track.filePath || track.objectUrl);
  if (!hasSource) return "missing";
  return "healthy";
}

/**
 * Rolls a track's per-asset health (Step B's assets[], falling back to the
 * synthesized legacy single-asset view) up into one worst-case summary for
 * compact row-level display, plus the per-format breakdown a detail view
 * (TrackInspector) needs to actually show "WAV healthy, MP3 missing".
 * Priority when assets disagree: missing > codec_blocked > unresolved >
 * unavailable > unknown > healthy — the row badge should reflect the most
 * actionable problem, not average them away.
 */
const SEVERITY: FileHealthStatus[] = ["missing", "codec_blocked", "unresolved", "unavailable", "unknown", "healthy"];

export function computeTrackOverallFileHealth(
  track: Track,
  playbackIssues?: Record<string, TrackPlaybackIssue>,
): { overall: FileHealthStatus; perAsset: { format: string; status: FileHealthStatus }[] } {
  const assets = getTrackAssets(track);
  const primaryHealth = computeTrackFileHealth(track, playbackIssues);

  const perAsset = assets.map((a) => ({
    format: a.format,
    // The synthesized/real primary asset mirrors the track's own legacy
    // fields — its live health is whatever recheckTrackPlayback last found,
    // not a separately-tracked assetStatus (there's only ever one file).
    status: a.isPrimary ? primaryHealth : (a.assetStatus ?? "unknown"),
  }));

  if (perAsset.length === 0) return { overall: primaryHealth, perAsset: [] };

  let overall: FileHealthStatus = "healthy";
  for (const a of perAsset) {
    if (SEVERITY.indexOf(a.status) < SEVERITY.indexOf(overall)) overall = a.status;
  }
  return { overall, perAsset };
}
