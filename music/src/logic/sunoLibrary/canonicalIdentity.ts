// Suno Library Manifest Integration — canonical identity resolution.
//
// Builds SunoCanonicalRecording groups from encoded locations + duplicate
// relationships. Pure — no filesystem, no network, deterministic across
// repeated calls with the same input (spec §6.3: "Canonical grouping must
// be deterministic across reload and re-import").
//
// Identity precedence (spec §6.3): valid Suno UUID > exact checksum group >
// individual deterministic archive asset ID. Filename/title/workspace/
// duration similarity NEVER groups assets.
//
// Union-find, not a naive per-location lookup: an exact-checksum group is
// byte-identical, so if ANY of its members also carries a confirmed UUID
// (via a separate alternate-encoding relationship touching the same
// location), the WHOLE checksum group inherits that UUID identity — a
// location can be reached by more than one relationship, and precedence
// must be resolved per connected component, not per location in isolation,
// or two byte-identical files could be split into different canonical
// recordings merely because only one of them happened to expose a UUID.

import type {
  SunoArchiveAssetId,
  SunoCanonicalIdentityBasis,
  SunoCanonicalRecording,
  SunoCanonicalRecordingId,
  SunoDuplicateRelationship,
  SunoEncodedLocation,
  SunoPlaybackResolution,
  SunoSnapshotId,
} from "../../data/sunoLibraryTypes";

export interface CanonicalIdentityResult {
  canonicalRecordings: SunoCanonicalRecording[];
  canonicalRecordingIdByAssetId: Map<SunoArchiveAssetId, SunoCanonicalRecordingId>;
}

class DisjointSet {
  private readonly parent = new Map<string, string>();

  private find(id: string): string {
    let root = this.parent.get(id) ?? id;
    if (!this.parent.has(id)) this.parent.set(id, id);
    while (root !== this.parent.get(root)) root = this.parent.get(root) as string;
    // Path compression.
    let cur = id;
    while (cur !== root) {
      const next = this.parent.get(cur) as string;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    // Deterministic tie-break: always attach the lexicographically larger
    // root under the smaller one, so repeated runs over the same input
    // (regardless of relationship iteration order) converge on the same
    // roots.
    if (rootA < rootB) this.parent.set(rootB, rootA);
    else this.parent.set(rootA, rootB);
  }

  root(id: string): string {
    return this.find(id);
  }
}

function deriveTitleGuess(location: SunoEncodedLocation): string | null {
  if (location.provider.embeddedTitle) return location.provider.embeddedTitle;
  const withoutExt = location.filename.replace(/\.[^./]+$/, "");
  return withoutExt.length > 0 ? withoutExt : null;
}

export function buildCanonicalIdentities(
  snapshotId: SunoSnapshotId,
  encodedLocations: SunoEncodedLocation[],
  duplicateRelationships: SunoDuplicateRelationship[],
): CanonicalIdentityResult {
  const ds = new DisjointSet();
  for (const location of encodedLocations) ds.root(location.archiveAssetId);

  // Union only real identity connections. "identity-conflict" relationships
  // are deliberately never unioned — the whole point of that relationship
  // is that the members do NOT share a clean identity; they are surfaced
  // via hasIdentityConflict instead (see below), never silently merged.
  const unionableRelationships = duplicateRelationships.filter(
    (rel) =>
      rel.relationship === "exact-file-duplicate" ||
      rel.relationship === "same-suno-asset-alternate-encoding",
  );
  for (const rel of unionableRelationships) {
    for (let i = 1; i < rel.archiveAssetIds.length; i++) {
      ds.union(rel.archiveAssetIds[0], rel.archiveAssetIds[i]);
    }
  }

  // Index relationships (including identity-conflict, for the conflict
  // flag) by the asset IDs they touch, so each component can look up every
  // relationship that reached it.
  const relationshipsByAsset = new Map<SunoArchiveAssetId, SunoDuplicateRelationship[]>();
  for (const rel of duplicateRelationships) {
    for (const assetId of rel.archiveAssetIds) {
      const existing = relationshipsByAsset.get(assetId);
      if (existing) existing.push(rel);
      else relationshipsByAsset.set(assetId, [rel]);
    }
  }

  // Group locations by component root.
  const locationsByRoot = new Map<string, SunoEncodedLocation[]>();
  for (const location of encodedLocations) {
    const root = ds.root(location.archiveAssetId);
    const existing = locationsByRoot.get(root);
    if (existing) existing.push(location);
    else locationsByRoot.set(root, [location]);
  }

  const canonicalRecordings: SunoCanonicalRecording[] = [];
  const canonicalRecordingIdByAssetId = new Map<SunoArchiveAssetId, SunoCanonicalRecordingId>();

  // Deterministic iteration: sort component roots, and within each
  // component sort member locations by archiveAssetId, before assigning
  // any derived state — guarantees identical output across repeated runs
  // regardless of the manifest's own on-disk array order.
  const sortedRoots = Array.from(locationsByRoot.keys()).sort();

  for (const root of sortedRoots) {
    const members = locationsByRoot.get(root) as SunoEncodedLocation[];
    members.sort((a, b) => a.archiveAssetId.localeCompare(b.archiveAssetId));

    // Collect every relationship touching any member of this component.
    const touchingRelationships: SunoDuplicateRelationship[] = [];
    for (const member of members) {
      const rels = relationshipsByAsset.get(member.archiveAssetId);
      if (rels) touchingRelationships.push(...rels);
    }

    const uuidGroups = touchingRelationships
      .filter((r) => r.relationship === "same-suno-asset-alternate-encoding")
      .sort((a, b) => a.groupId.localeCompare(b.groupId));
    const checksumGroups = touchingRelationships
      .filter((r) => r.relationship === "exact-file-duplicate")
      .sort((a, b) => a.groupId.localeCompare(b.groupId));
    const hasIdentityConflict = touchingRelationships.some(
      (r) => r.relationship === "identity-conflict",
    );

    let basis: SunoCanonicalIdentityBasis;
    let canonicalId: SunoCanonicalRecordingId;
    let sunoUuid: string | null = null;
    let sunoUrl: string | null = null;

    if (uuidGroups.length > 0) {
      basis = "suno-uuid";
      canonicalId = uuidGroups[0].groupId;
      sunoUuid = uuidGroups[0].sunoUuid;
    } else if (checksumGroups.length > 0) {
      basis = "exact-checksum";
      canonicalId = checksumGroups[0].groupId;
    } else {
      basis = "archive-asset-id";
      canonicalId = `asset:${members[0].archiveAssetId}`;
    }

    if (!sunoUuid) sunoUuid = members.find((m) => m.provider.sunoUuid)?.provider.sunoUuid ?? null;
    if (!sunoUrl) sunoUrl = members.find((m) => m.provider.sunoUrl)?.provider.sunoUrl ?? null;

    const workspaceSlugs = Array.from(
      new Set(members.map((m) => m.workspaceSlug).filter((s): s is string => Boolean(s))),
    ).sort();

    // Canonical-recording-level playback availability, kept deliberately
    // separate from any single member's own extractedRelativePath. members
    // is already sorted by archiveAssetId above, so the first extracted
    // member found here is the deterministic, lexicographically-smallest
    // choice — stable across repeated calls on the same input.
    const playableMember = members.find((m) => m.extractedRelativePath !== null);

    canonicalRecordings.push({
      canonicalRecordingId: canonicalId,
      identityBasis: basis,
      snapshotId,
      primaryTitleGuess: deriveTitleGuess(members[0]),
      sunoUuid,
      sunoUrl,
      encodedLocationIds: members.map((m) => m.archiveAssetId),
      totalDurationSeconds: members[0].technical.durationSeconds,
      workspaceSlugs,
      hasIdentityConflict,
      playableEncodedLocationId: playableMember ? playableMember.archiveAssetId : null,
    });

    for (const member of members) {
      canonicalRecordingIdByAssetId.set(member.archiveAssetId, canonicalId);
    }
  }

  return { canonicalRecordings, canonicalRecordingIdByAssetId };
}

/**
 * Resolves a requested encoded location to what can actually be played.
 * Pure — takes already-built indexes, no I/O. Deterministic: for a given
 * requested location and a given (locations, canonicalRecordings) pair, the
 * result never varies between calls, matching playableEncodedLocationId's
 * own determinism (see buildCanonicalIdentities above).
 *
 * Every archiveAssetId/extractedRelativePath this function can return comes
 * directly from a SunoEncodedLocation whose own extractedRelativePath is
 * already non-null — there is no code path here that can construct or
 * reference a path under 00_ACQUISITION/.
 */
export function resolvePlaybackLocation(
  requestedArchiveAssetId: SunoArchiveAssetId,
  encodedLocationsById: Map<SunoArchiveAssetId, SunoEncodedLocation>,
  canonicalRecordingsById: Map<SunoCanonicalRecordingId, SunoCanonicalRecording>,
): SunoPlaybackResolution {
  const requested = encodedLocationsById.get(requestedArchiveAssetId);
  if (!requested) return { kind: "unavailable", requestedArchiveAssetId };

  if (requested.extractedRelativePath !== null) {
    return {
      kind: "direct",
      archiveAssetId: requested.archiveAssetId,
      extractedRelativePath: requested.extractedRelativePath,
    };
  }

  const canonical = canonicalRecordingsById.get(requested.canonicalRecordingId);
  const fallbackId = canonical?.playableEncodedLocationId ?? null;
  const fallbackLocation = fallbackId ? encodedLocationsById.get(fallbackId) : undefined;

  if (fallbackLocation && fallbackLocation.extractedRelativePath !== null) {
    return {
      kind: "fallback",
      archiveAssetId: fallbackLocation.archiveAssetId,
      extractedRelativePath: fallbackLocation.extractedRelativePath,
      requestedArchiveAssetId,
    };
  }

  return { kind: "unavailable", requestedArchiveAssetId };
}

/** Convenience index builder for resolvePlaybackLocation's callers. */
export function indexEncodedLocationsById(
  encodedLocations: SunoEncodedLocation[],
): Map<SunoArchiveAssetId, SunoEncodedLocation> {
  return new Map(encodedLocations.map((loc) => [loc.archiveAssetId, loc]));
}

/** Convenience index builder for resolvePlaybackLocation's callers. */
export function indexCanonicalRecordingsById(
  canonicalRecordings: SunoCanonicalRecording[],
): Map<SunoCanonicalRecordingId, SunoCanonicalRecording> {
  return new Map(canonicalRecordings.map((rec) => [rec.canonicalRecordingId, rec]));
}
