// 0722C_MUSIC_Production_Stem_Export — "Send to Looper," done for real.
//
// The ONLY thing ever persisted for a stem-sourced loop experiment is the
// explicit { stemSetId, role } StemSourceReference (see
// AudioExperimentRecord.stemSourceRef in data/loopTypes.ts) — never a
// synthetic Track record. This module builds a SESSION-ONLY, never-
// persisted Track-shaped adapter purely so the existing Sectional Looper
// Workspace (which resolves audio via `libraryTracks.find(t => t.trackId
// === sourceTrackId)` + `resolveTrackUrl(track)`) can decode a stem's
// audio without any change to that component's internals: the adapter is
// appended to the ARRAY PASSED AS A PROP for the duration of one stem-loop
// session, never written into the app's real `libraryTracks` state/ref.
// Its trackId space (`stemloop_...`) is deliberately distinct from every
// real track id so it can never collide with, or be confused for, an
// ordinary Library row — and never touches the unrelated, deprecated
// `derivedKind:"stem"` top-level-track system.

import type { Track } from "../../data/trackTypes";
import type { StemRole, StemSourceReference, TrackStemSet } from "../../data/trackStemTypes";

export function stemLooperSourceTrackId(stemSetId: string, role: StemRole): string {
  return `stemloop_${stemSetId}_${role}`;
}

export function isStemLooperSourceTrackId(trackId: string): boolean {
  return trackId.startsWith("stemloop_");
}

export function stemAssetUrl(trackId: string, audioRelPath: string, stemSetId: string, role: StemRole): string {
  const params = new URLSearchParams({ trackId, audioRelPath, stemSetId, role });
  return `/stem-set-asset?${params.toString()}`;
}

// Only ever called after the caller has confirmed (via GET /stem-sets)
// that this exact set's live lifecycle is "current" — this function
// itself has no way to check that; it just builds the adapter shape.
export function buildStemLooperSourceTrack(
  parentTrack: Track,
  parentAudioRelPath: string,
  stemSet: TrackStemSet,
  role: StemRole,
): Track {
  const file = stemSet.stems[role];
  return {
    trackId: stemLooperSourceTrackId(stemSet.id, role),
    title: `${parentTrack.title} — ${role[0].toUpperCase()}${role.slice(1)} Stem`,
    artist: parentTrack.artist,
    durationSeconds: file?.durationSeconds ?? parentTrack.durationSeconds,
    energy: parentTrack.energy,
    energySource: "estimated",
    sourceOwner: "reference",
    objectUrl: stemAssetUrl(parentTrack.trackId, parentAudioRelPath, stemSet.id, role),
  };
}

export function buildStemSourceReference(stemSetId: string, role: StemRole): StemSourceReference {
  return { stemSetId, role };
}
