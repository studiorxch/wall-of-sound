// 0828_MUSIC_Looper_Loop_Library_Tagging — "Create Loop from this Recording"
// for Song Library, done the same way stemLooperSource.ts already solved
// the identical problem for stems.
//
// The ONLY thing ever persisted for a Song-Library-sourced loop is its
// sourceRecording ({sourceLibrary: "song_library", recordingId, assetId}) —
// never a synthetic Track record, and never this module's own
// sunoloop_<canonicalRecordingId> id (see LoopAsset.sourceTrackId's own doc
// comment in data/loopTypes.ts — that value is a technical implementation
// detail of the active Looper session, not provenance). This module builds
// a SESSION-ONLY, never-persisted Track-shaped adapter purely so the
// existing Sectional Looper Workspace (which resolves audio via
// `libraryTracks.find(t => t.trackId === sourceTrackId)` +
// `resolveTrackUrl(track)`) can decode a Song Library recording's audio
// without any change to that component's internals: the adapter is
// appended to the ARRAY PASSED AS A PROP for the duration of one session,
// never written into the app's real `libraryTracks` state/ref. Its trackId
// space (`sunoloop_...`) is deliberately distinct from every real track id
// (and from `stemloop_...`) so it can never collide with, or be confused
// for, an ordinary Library row.

import type { Track } from "../../data/trackTypes";
import type { TrackBeatMap } from "../../data/beatMapTypes";

export function sunoLooperSourceTrackId(canonicalRecordingId: string): string {
  return `sunoloop_${canonicalRecordingId}`;
}

export function isSunoLooperSourceTrackId(trackId: string): boolean {
  return trackId.startsWith("sunoloop_");
}

export interface BuildSunoLooperSourceTrackParams {
  canonicalRecordingId: string;
  title: string;
  durationSeconds: number;
  // Already resolved by the caller (SunoRecordingDetail.tsx already has
  // this in scope) — this module does no playback-location resolution of
  // its own, mirroring stemLooperSource.ts's own division of
  // responsibility (it doesn't call the stem-archive API either).
  playableAudioUrl: string;
  bpm: number | null;
  // Present only when the matching SunoAnalysisRecord has one (see the
  // 0828 beat-grid plumbing fix) — absent means the Looper must show an
  // honest "Grid unavailable" state, never a fabricated grid.
  beatMap?: TrackBeatMap;
}

export function buildSunoLooperSourceTrack(params: BuildSunoLooperSourceTrackParams): Track {
  return {
    trackId: sunoLooperSourceTrackId(params.canonicalRecordingId),
    title: params.title,
    artist: "",
    durationSeconds: params.durationSeconds,
    energy: 0,
    energySource: "estimated",
    // Same convention analyzeSunoRecording's own ephemeral adapter Track
    // already uses (sunoIntelligenceAdapter.ts) — deliberately avoids
    // adding a "suno" TrackSourceOwner value; this object is never
    // persisted or inserted into any real Track array.
    sourceOwner: "unknown",
    objectUrl: params.playableAudioUrl,
    bpm: params.bpm ?? undefined,
    beatMap: params.beatMap,
  };
}
