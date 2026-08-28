// 0828_MUSIC_Looper_Loop_Library_Tagging — single source of truth for
// LoopAsset.sourceRecording construction. Every loop-construction call site
// (SectionalLooperWorkspace.tsx) uses these rather than each deriving the
// mapping independently, so the sourceOwner -> sourceLibrary correspondence
// only lives in one place.
//
// The mapping below is not a guess: it is the app's own existing,
// already-established nav-to-sourceOwner definition (FileManager.tsx's
// Catalog/External/Sounds nav rows resolve to sourceOwnerFilter
// "studiorich"/"external"/"reference" respectively, and LibraryDataGrid.tsx's
// sourceKey convention matches it) — this reads a proven existing
// relationship, it does not invent one.

import type { Track, TrackSourceOwner } from "../../data/trackTypes";
import type { LoopSourceLibrary, LoopSourceRecording } from "../../data/loopTypes";

export function sourceLibraryFromTrackOwner(owner: TrackSourceOwner | undefined): LoopSourceLibrary | null {
  switch (owner) {
    case "studiorich": return "catalog";
    case "external": return "external";
    case "reference": return "sounds";
    default: return null; // "unknown" or absent — never guessed
  }
}

// Returns null when the track's sourceOwner doesn't resolve to a known
// library (e.g. "unknown", or a session-only adapter track) — callers must
// leave sourceRecording unset in that case rather than fabricate a value.
export function buildSourceRecordingForTrack(track: Track): LoopSourceRecording | null {
  const sourceLibrary = sourceLibraryFromTrackOwner(track.sourceOwner);
  if (!sourceLibrary) return null;
  return { sourceLibrary, recordingId: track.trackId };
}

export function buildSourceRecordingForSuno(canonicalRecordingId: string, assetId: string): LoopSourceRecording {
  return { sourceLibrary: "song_library", recordingId: canonicalRecordingId, assetId };
}
