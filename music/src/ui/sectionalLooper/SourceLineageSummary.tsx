// 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry §15 — renders
// nothing for an ordinary track; discloses stem lineage only when the open
// source track is actually a stem (derivedKind === "stem" — the only
// sanctioned test, see stemLineage.ts).

import type { Track } from "../../data/trackTypes";
import { isStemTrack, resolveParentTrack, stemRoleLabel } from "../../logic/loops/stemLineage";

interface SourceLineageSummaryProps {
  track: Track;
  libraryTracks: Track[];
}

export function SourceLineageSummary({ track, libraryTracks }: SourceLineageSummaryProps) {
  if (!isStemTrack(track)) return null;
  const parent = resolveParentTrack(track, libraryTracks);
  return (
    <div className="looper-source-lineage" aria-live="polite">
      Source: Stem · Role: {stemRoleLabel(track.stemRole)} · Parent Track: {parent?.title ?? "unknown"}
    </div>
  );
}
