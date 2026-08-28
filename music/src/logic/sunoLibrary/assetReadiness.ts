// Suno Archive Readiness Dashboard (MUSIC Suno Phase 1) — derived
// present/missing selectors over already-built collections and index maps,
// following selectors.ts's own O(n)/no-caching convention.
//
// WAV/Opus presence is derived from each encoded location's probed
// technical identity (containerFormat/audioCodec), never from filename
// extension: a direct check of the real suno-audio-inventory.json snapshot
// (8,381 real records) found 4 of the 5 real WAV-format files are named
// with a misleading ".mp3" extension (raw uploads/third-party samples), and
// that 3,508 locations already carry audioCodec "opus" inside an ".m4a"
// container — extension-based detection would have been wrong on both
// counts.

import type {
  SunoCanonicalRecording,
  SunoDuplicateRelationship,
  SunoEncodedLocation,
} from "../../data/sunoLibraryTypes";

export interface SunoAssetReadiness {
  wavPresent: boolean;
  opusPresent: boolean;
}

function isWavLocation(loc: SunoEncodedLocation): boolean {
  const container = loc.technical.containerFormat.toLowerCase();
  const codec = loc.technical.audioCodec.toLowerCase();
  return container === "wav" || codec.startsWith("pcm");
}

function isOpusLocation(loc: SunoEncodedLocation): boolean {
  return loc.technical.audioCodec.toLowerCase() === "opus";
}

/**
 * Present/missing for the PRODUCTION (WAV) and PLAYBACK (Opus) asset roles,
 * for one canonical recording — true if ANY of its encoded locations
 * qualifies. FLAC (lossless fallback) and every other codec/container stay
 * fully available on the location record itself; this selector only powers
 * the two readiness signals the dashboard/table emphasize.
 */
export function computeSunoAssetReadiness(
  canonical: SunoCanonicalRecording,
  encodedLocationsById: Map<string, SunoEncodedLocation>,
): SunoAssetReadiness {
  let wavPresent = false;
  let opusPresent = false;
  for (const id of canonical.encodedLocationIds) {
    const loc = encodedLocationsById.get(id);
    if (!loc) continue;
    if (!wavPresent && isWavLocation(loc)) wavPresent = true;
    if (!opusPresent && isOpusLocation(loc)) opusPresent = true;
    if (wavPresent && opusPresent) break;
  }
  return { wavPresent, opusPresent };
}

/**
 * The archiveAssetId of the first WAV (or Opus) encoded location within a
 * canonical recording — the concrete target for a "reveal in Finder" click.
 * Null when this recording has no such location, mirroring
 * SunoCanonicalRecording.playableEncodedLocationId's own null convention.
 */
export function findWavLocationId(
  canonical: SunoCanonicalRecording,
  encodedLocationsById: Map<string, SunoEncodedLocation>,
): string | null {
  for (const id of canonical.encodedLocationIds) {
    const loc = encodedLocationsById.get(id);
    if (loc && isWavLocation(loc)) return id;
  }
  return null;
}

export function findOpusLocationId(
  canonical: SunoCanonicalRecording,
  encodedLocationsById: Map<string, SunoEncodedLocation>,
): string | null {
  for (const id of canonical.encodedLocationIds) {
    const loc = encodedLocationsById.get(id);
    if (loc && isOpusLocation(loc)) return id;
  }
  return null;
}

export interface SunoArchiveReadinessSummary {
  totalRecordings: number;
  wavPresentCount: number;
  wavMissingCount: number;
  opusPresentCount: number;
  opusMissingCount: number;
  uuidPresentCount: number;
  uuidMissingCount: number;
  materializedCount: number;
  notMaterializedCount: number;
  duplicateGroupCount: number;
}

/**
 * One pass over canonicalRecordings — no nested scans. UUID presence and
 * "materialized" both reuse fields SunoCanonicalRecording already carries
 * (sunoUuid, playableEncodedLocationId) rather than recomputing them.
 * Duplicate group count is the real, already-computed relationship list
 * length (exact-duplicate + alternate-encoding groups combined), matching
 * the snapshot's own exactDuplicateGroupCount + alternateEncodingGroupCount.
 */
export function computeSunoArchiveReadinessSummary(
  canonicalRecordings: SunoCanonicalRecording[],
  encodedLocationsById: Map<string, SunoEncodedLocation>,
  duplicateRelationships: SunoDuplicateRelationship[],
): SunoArchiveReadinessSummary {
  let wavPresentCount = 0;
  let opusPresentCount = 0;
  let uuidPresentCount = 0;
  let materializedCount = 0;

  for (const rec of canonicalRecordings) {
    const readiness = computeSunoAssetReadiness(rec, encodedLocationsById);
    if (readiness.wavPresent) wavPresentCount += 1;
    if (readiness.opusPresent) opusPresentCount += 1;
    if (rec.sunoUuid) uuidPresentCount += 1;
    if (rec.playableEncodedLocationId) materializedCount += 1;
  }

  const total = canonicalRecordings.length;
  return {
    totalRecordings: total,
    wavPresentCount,
    wavMissingCount: total - wavPresentCount,
    opusPresentCount,
    opusMissingCount: total - opusPresentCount,
    uuidPresentCount,
    uuidMissingCount: total - uuidPresentCount,
    materializedCount,
    notMaterializedCount: total - materializedCount,
    duplicateGroupCount: duplicateRelationships.length,
  };
}

export type SunoReadinessFilterKey =
  | "wav-present"
  | "wav-missing"
  | "opus-present"
  | "opus-missing"
  | "uuid-present"
  | "uuid-missing"
  | "materialized"
  | "not-materialized"
  | "duplicates";

/**
 * Applied AFTER applySunoSearchAndFilters (search.ts) — a second, narrower
 * pass expressing exactly one dashboard-card click, never a replacement for
 * the existing filter set.
 */
export function applySunoReadinessFilter(
  canonicalRecordings: SunoCanonicalRecording[],
  encodedLocationsById: Map<string, SunoEncodedLocation>,
  filterKey: SunoReadinessFilterKey | null,
): SunoCanonicalRecording[] {
  if (!filterKey) return canonicalRecordings;
  return canonicalRecordings.filter((rec) => {
    switch (filterKey) {
      case "wav-present":
        return computeSunoAssetReadiness(rec, encodedLocationsById).wavPresent;
      case "wav-missing":
        return !computeSunoAssetReadiness(rec, encodedLocationsById).wavPresent;
      case "opus-present":
        return computeSunoAssetReadiness(rec, encodedLocationsById).opusPresent;
      case "opus-missing":
        return !computeSunoAssetReadiness(rec, encodedLocationsById).opusPresent;
      case "uuid-present":
        return rec.sunoUuid !== null;
      case "uuid-missing":
        return rec.sunoUuid === null;
      case "materialized":
        return rec.playableEncodedLocationId !== null;
      case "not-materialized":
        return rec.playableEncodedLocationId === null;
      case "duplicates":
        return rec.encodedLocationIds.some((id) => (encodedLocationsById.get(id)?.duplicateGroupIds.length ?? 0) > 0);
      default:
        return true;
    }
  });
}
