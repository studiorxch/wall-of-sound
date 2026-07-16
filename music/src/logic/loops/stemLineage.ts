// 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry — pure
// stem/parent-track lineage helpers. `derivedKind === "stem"` is the ONLY
// sanctioned stem test (see Track's own field comment in trackTypes.ts);
// nothing here or anywhere downstream may branch on `parentTrackId`'s mere
// presence instead.

import type { Track } from "../../data/trackTypes";

export function isStemTrack(track: Track | undefined | null): boolean {
  return track?.derivedKind === "stem";
}

export function resolveParentTrack(
  track: Track | undefined | null,
  libraryTracks: Track[],
): Track | undefined {
  if (!track?.parentTrackId) return undefined;
  return libraryTracks.find((t) => t.trackId === track.parentTrackId);
}

export function stemRoleLabel(role?: Track["stemRole"]): string {
  switch (role) {
    case "vocals": return "Vocals";
    case "drums": return "Drums";
    case "bass": return "Bass";
    case "other": return "Other";
    default: return "Stem";
  }
}
