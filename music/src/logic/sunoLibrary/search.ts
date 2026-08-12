// Suno Library Manifest Integration — search and filtering.
//
// Single O(n) pass over canonicalRecordings using pre-built index maps —
// never a nested scan (spec §7.3). Callers own debouncing free-text input;
// this module is pure and synchronous.

import type {
  SunoAssetKind,
  SunoCanonicalRecording,
  SunoDuplicateRelationshipKind,
  SunoEncodedLocation,
  SunoListeningRecord,
  SunoListeningStatus,
  SunoSuggestedUse,
} from "../../data/sunoLibraryTypes";

export type SunoDuplicateRelationshipFilter = SunoDuplicateRelationshipKind | "none";

// 0812C — training-eligibility filter. "unreviewed" is reserved for a
// canonical recording with zero workspace attribution on any member (never
// used as a synonym for "assumed eligible"); it does not occur in the
// current archive but the filter option stays available for forward
// compatibility.
export type SunoTrainingEligibilityFilter = "eligible" | "excluded" | "unreviewed";

export interface SunoSearchFilters {
  queryText: string; // matched against title/filename, workspace, UUID, notes
  workspaceSlug: string | null;
  listeningStatus: SunoListeningStatus | null;
  favoriteOnly: boolean;
  assetKind: SunoAssetKind | null;
  uuidAvailability: "uuid-available" | "legacy-no-id" | null;
  audioAvailability: "online" | "unavailable" | null;
  codecOrContainer: string | null; // matched against any member's audioCodec or containerFormat
  duplicateRelationship: SunoDuplicateRelationshipFilter | null;
  suggestedUse: SunoSuggestedUse | null;
  trainingEligibility: SunoTrainingEligibilityFilter | null;
}

export const EMPTY_SUNO_SEARCH_FILTERS: SunoSearchFilters = {
  queryText: "",
  workspaceSlug: null,
  listeningStatus: null,
  favoriteOnly: false,
  assetKind: null,
  uuidAvailability: null,
  audioAvailability: null,
  codecOrContainer: null,
  duplicateRelationship: null,
  suggestedUse: null,
  trainingEligibility: null,
};

function duplicateRelationshipOf(canonical: SunoCanonicalRecording): SunoDuplicateRelationshipFilter {
  if (canonical.hasIdentityConflict) return "identity-conflict";
  if (canonical.identityBasis === "suno-uuid") return "same-suno-asset-alternate-encoding";
  if (canonical.identityBasis === "exact-checksum") return "exact-file-duplicate";
  return "none";
}

function matchesQueryText(
  canonical: SunoCanonicalRecording,
  members: SunoEncodedLocation[],
  review: SunoListeningRecord | undefined,
  queryLower: string,
): boolean {
  if (canonical.primaryTitleGuess?.toLowerCase().includes(queryLower)) return true;
  if (canonical.sunoUuid?.toLowerCase().includes(queryLower)) return true;
  if (canonical.workspaceSlugs.some((w) => w.toLowerCase().includes(queryLower))) return true;
  if (review?.notes.toLowerCase().includes(queryLower)) return true;
  return members.some((m) => m.filename.toLowerCase().includes(queryLower));
}

/**
 * Filters + free-text searches canonicalRecordings in a single pass.
 * encodedLocationsById/listeningRecordsByCanonicalId must already be built
 * (see selectors.ts) — this function never builds its own index.
 */
export function applySunoSearchAndFilters(
  canonicalRecordings: SunoCanonicalRecording[],
  encodedLocationsById: Map<string, SunoEncodedLocation>,
  listeningRecordsByCanonicalId: Map<string, SunoListeningRecord>,
  filters: SunoSearchFilters,
  // 0812C: set of canonicalRecordingIds this build's exclusion authority has
  // marked excluded. Null when exclusion data has not been computed yet
  // (the trainingEligibility filter is then a no-op, matching every other
  // filter's null-means-unset convention).
  excludedCanonicalRecordingIds: ReadonlySet<string> | null = null,
): SunoCanonicalRecording[] {
  const queryLower = filters.queryText.trim().toLowerCase();
  const codecLower = filters.codecOrContainer?.toLowerCase() ?? null;

  const results: SunoCanonicalRecording[] = [];
  for (const canonical of canonicalRecordings) {
    if (filters.workspaceSlug && !canonical.workspaceSlugs.includes(filters.workspaceSlug)) continue;

    if (filters.trainingEligibility) {
      const isExcluded = excludedCanonicalRecordingIds?.has(canonical.canonicalRecordingId) ?? false;
      const isUnreviewed = canonical.workspaceSlugs.length === 0;
      const status: SunoTrainingEligibilityFilter = isUnreviewed ? "unreviewed" : isExcluded ? "excluded" : "eligible";
      if (status !== filters.trainingEligibility) continue;
    }

    const review = listeningRecordsByCanonicalId.get(canonical.canonicalRecordingId);

    if (filters.listeningStatus && (review?.listeningStatus ?? "unheard") !== filters.listeningStatus) continue;
    if (filters.favoriteOnly && review?.listeningStatus !== "favorite") continue;
    if (filters.assetKind && (review?.assetKind ?? "unknown") !== filters.assetKind) continue;

    if (filters.uuidAvailability === "uuid-available" && !canonical.sunoUuid) continue;
    if (filters.uuidAvailability === "legacy-no-id" && canonical.sunoUuid) continue;

    if (filters.audioAvailability === "online" && !canonical.playableEncodedLocationId) continue;
    if (filters.audioAvailability === "unavailable" && canonical.playableEncodedLocationId) continue;

    if (filters.duplicateRelationship && duplicateRelationshipOf(canonical) !== filters.duplicateRelationship) {
      continue;
    }

    if (filters.suggestedUse && !(review?.suggestedUses.includes(filters.suggestedUse) ?? false)) continue;

    const members = canonical.encodedLocationIds
      .map((id) => encodedLocationsById.get(id))
      .filter((loc): loc is SunoEncodedLocation => loc !== undefined);

    if (codecLower) {
      const codecMatch = members.some(
        (m) =>
          m.technical.audioCodec.toLowerCase().includes(codecLower) ||
          m.technical.containerFormat.toLowerCase().includes(codecLower),
      );
      if (!codecMatch) continue;
    }

    if (queryLower && !matchesQueryText(canonical, members, review, queryLower)) continue;

    results.push(canonical);
  }
  return results;
}
