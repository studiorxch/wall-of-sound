// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export — pure
// logic for turning user-picked (already-separated, "Import Existing
// Stems") files into registered stem Track records. Idempotent: never
// registers a role twice for the same parent. `derivedKind === "stem"`
// remains the sole sanctioned stem test (see stemLineage.ts) — this module
// only ever sets it alongside parentTrackId/stemRole together, never one
// without the others.

import type { Track } from "../../data/trackTypes";

export type StemRole = "vocals" | "drums" | "bass" | "other";

const ROLE_PATTERNS: Record<StemRole, RegExp> = {
  drums: /drum/i,
  bass: /bass/i,
  vocals: /vocal/i,
  other: /other/i,
};

// The fixed Demucs 4-file naming convention (drums/bass/other/vocals) —
// established as reliable in 0715E. Returns null when a filename doesn't
// match any known role, so the caller can prompt for a manual assignment
// rather than guessing.
export function matchStemRoleFromFileName(fileName: string): StemRole | null {
  for (const role of Object.keys(ROLE_PATTERNS) as StemRole[]) {
    if (ROLE_PATTERNS[role].test(fileName)) return role;
  }
  return null;
}

export interface StemImportEntry {
  role: StemRole;
  fileName: string;
  filePath: string;
}

function stemRoleLabel(role: StemRole): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function genStemTrackId(parentTrackId: string, role: StemRole): string {
  return `stem_${parentTrackId}_${role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface BuildNewStemTracksInput {
  libraryTracks: Track[];
  parentTrack: Track;
  entries: StemImportEntry[];
}

// Returns only the NEW Track records to add — any role already registered
// for this parent (in libraryTracks, or earlier in the same `entries` list)
// is skipped, never duplicated.
export function buildNewStemTracks(input: BuildNewStemTracksInput): Track[] {
  const { libraryTracks, parentTrack, entries } = input;
  const registered = new Set(
    libraryTracks
      .filter((t) => t.derivedKind === "stem" && t.parentTrackId === parentTrack.trackId)
      .map((t) => t.stemRole)
      .filter((r): r is StemRole => !!r),
  );

  const newTracks: Track[] = [];
  for (const entry of entries) {
    if (registered.has(entry.role)) continue;
    newTracks.push({
      trackId: genStemTrackId(parentTrack.trackId, entry.role),
      title: `${parentTrack.title} (${stemRoleLabel(entry.role)} Stem)`,
      artist: parentTrack.artist,
      durationSeconds: parentTrack.durationSeconds,
      energy: parentTrack.energy,
      energySource: "estimated",
      filePath: entry.filePath,
      sourceOwner: "reference",
      derivedKind: "stem",
      parentTrackId: parentTrack.trackId,
      stemRole: entry.role,
    });
    registered.add(entry.role);
  }
  return newTracks;
}
