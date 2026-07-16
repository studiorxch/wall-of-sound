// Playlist Analyzer Review — top-level orchestrator (spec §14: "no God
// function"). Each concern (coverage/identity/arc/sections/roles/transitions/
// exceptions/creative) lives in its own module; this just composes them in
// order over the real playlist slot sequence.

import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { PlaylistAnalyzerReview } from "../../data/playlistAnalyzerTypes";
import { PLAYLIST_ANALYZER_VERSION } from "../../data/playlistAnalyzerTypes";
import { resolvePlaylistOrder } from "./resolveOrder";
import { computeCoverage } from "./coverage";
import { computeIdentity } from "./identity";
import { computeArc } from "./arc";
import { buildSectionReviews } from "./sections";
import { computeTrackRoles } from "./trackRoles";
import { computeTransitions } from "./transitions";
import { computeExceptions } from "./exceptions";
import { buildCreativeExport } from "./creativeExport";
import { isBeatMapTrustedForAnalysis } from "../beatMap/beatMapTrust";
import { isPlaybackBoundsTrusted } from "../playbackBounds/playbackBoundsTrust";

// Track Beat Map Foundation (0713_MUSIC_Track_Beat_Map_Foundation §20) —
// passthrough merge only, never re-derives roles/transitions. Missing/
// untrusted beat maps leave these fields undefined (blue uncertainty, never
// a fabricated value or a new red error).
function withBeatMapFields(tracks: PlaylistAnalyzerReview["tracks"], entries: ReturnType<typeof resolvePlaylistOrder>): PlaylistAnalyzerReview["tracks"] {
  return tracks.map((t, i) => {
    const beatMap = entries[i]?.track.beatMap;
    const trusted = isBeatMapTrustedForAnalysis(beatMap);
    if (!beatMap || !trusted) return t;
    return {
      ...t,
      beatMapTrusted: trusted,
      beatMapFirstBeatSeconds: beatMap.firstBeatSeconds,
      beatMapFirstDownbeatSeconds: beatMap.firstDownbeatSeconds,
      beatMapBarCount: beatMap.barStartTimesSeconds.length,
      beatMapTempoStable: beatMap.tempoStable,
      beatMapIntroCleanBars: beatMap.introRegion?.cleanBars,
      beatMapOutroCleanBars: beatMap.outroRegion?.cleanBars,
      beatMapWarningCodes: beatMap.warnings.length ? beatMap.warnings : undefined,
    };
  });
}

// Track Playback Bounds (0714_MUSIC_Track_Playback_Bounds §29) — same
// passthrough-only pattern as beat-map fields above.
function withPlaybackBoundsFields(tracks: PlaylistAnalyzerReview["tracks"], entries: ReturnType<typeof resolvePlaylistOrder>): PlaylistAnalyzerReview["tracks"] {
  return tracks.map((t, i) => {
    const bounds = entries[i]?.track.playbackBounds;
    const trusted = isPlaybackBoundsTrusted(bounds);
    if (!bounds || !trusted) return t;
    return {
      ...t,
      playbackBoundsTrusted: trusted,
      playbackBoundsAudibleStartSeconds: bounds.audibleStartSeconds,
      playbackBoundsPreferredStartSeconds: bounds.preferredStartSeconds,
      playbackBoundsPreferredEndSeconds: bounds.preferredEndSeconds,
      playbackBoundsAudibleEndSeconds: bounds.audibleEndSeconds,
      playbackBoundsEffectiveDurationSeconds: bounds.effectiveDurationSeconds,
      playbackBoundsStartClassification: bounds.startClassification,
      playbackBoundsEndClassification: bounds.endClassification,
      playbackBoundsWarningCodes: bounds.warnings.length ? bounds.warnings : undefined,
    };
  });
}

function withTransitionBeatMapFields(
  transitions: PlaylistAnalyzerReview["transitions"],
  entries: ReturnType<typeof resolvePlaylistOrder>,
): PlaylistAnalyzerReview["transitions"] {
  return transitions.map((t) => {
    const from = entries.find((e) => e.track.trackId === t.fromTrackId);
    const to = entries.find((e) => e.track.trackId === t.toTrackId);
    const available = isBeatMapTrustedForAnalysis(from?.track.beatMap) && isBeatMapTrustedForAnalysis(to?.track.beatMap);
    return available ? { ...t, beatMapEvidenceAvailable: true } : t;
  });
}

export function computePlaylistAnalyzerReview(
  playlist: PlaylistRecord,
  tracksById: Map<string, Track>,
): PlaylistAnalyzerReview {
  const entries = resolvePlaylistOrder(playlist.slots, tracksById);
  const orderedTracks = entries.map((e) => e.track);

  const coverage = computeCoverage(orderedTracks);
  const identity = computeIdentity(entries);
  const arc = computeArc(entries);
  const sections = buildSectionReviews(entries);
  const tracks = withPlaybackBoundsFields(withBeatMapFields(computeTrackRoles(entries), entries), entries);
  const transitions = withTransitionBeatMapFields(computeTransitions(entries), entries);
  const exceptions = computeExceptions(coverage, tracks, sections, transitions);
  const creativeExport = buildCreativeExport(identity, arc, sections);

  const totalDurationSeconds = entries.reduce((s, e) => s + (e.track.durationSeconds || 0), 0);

  return {
    playlistId: playlist.playlistId,
    playlistTitle: playlist.title,
    generatedAt: new Date().toISOString(),
    analysisVersion: PLAYLIST_ANALYZER_VERSION,
    trackCount: entries.length,
    totalDurationSeconds,
    coverage,
    identity,
    arc,
    sections,
    tracks,
    transitions,
    exceptions,
    creativeExport,
  };
}
