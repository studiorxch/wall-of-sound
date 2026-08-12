// Machine Life logic layer — small, single-purpose selectors (0811_MACHINE-
// LIFE_MUSIC-Research-Workspace-Handoff_v1.0.0, Logic Layer). Pure functions
// only; no DOM, no fetch — directly testable against real manifest data.

import type {
  MachineLifeCategory,
  MachineLifeCollection,
  MachineLifeConstructionMode,
  MachineLifeDisposition,
  MachineLifeLifeScore,
  MachineLifeProxyLibrary,
  MachineLifeRecording,
  MachineLifeRecordingReview,
  MachineLifeReviewCompleteness,
} from "../../data/machineLifeTypes";

// ── Lookup ────────────────────────────────────────────────────────────────

export function findMachineLifeRecording(collection: MachineLifeCollection, id: string): MachineLifeRecording | undefined {
  return collection.recordings.find((r) => r.id === id);
}

export function findMachineLifeReview(reviews: MachineLifeRecordingReview[], recordingId: string): MachineLifeRecordingReview | undefined {
  return reviews.find((r) => r.recordingId === recordingId);
}

// ── Review completeness ───────────────────────────────────────────────────

// A review may be saved with only some fields set — completion status must
// remain "partial" until every substantive field is present. Life `0` and
// dormant recordings are never excluded from this count; an unset review is
// simply "unreviewed", never treated as a failure to hide.
export function reviewCompleteness(review: MachineLifeRecordingReview | undefined): MachineLifeReviewCompleteness {
  if (!review) return "unreviewed";
  const fields = [
    review.firstImage.trim().length > 0,
    review.lifeScore !== null,
    review.replay !== null,
    review.immediateNote.trim().length > 0,
    review.usefulSourceRelationship.trim().length > 0,
    review.behaviorDiscovered.trim().length > 0,
    review.disposition !== null,
    review.nextAction.trim().length > 0,
  ];
  const filled = fields.filter(Boolean).length;
  if (filled === 0) return "unreviewed";
  if (filled === fields.length) return "complete";
  return "partial";
}

// ── Audio availability ────────────────────────────────────────────────────

export function preLifeProxyAvailable(recording: MachineLifeRecording, proxyLibrary: MachineLifeProxyLibrary | undefined): boolean {
  if (!proxyLibrary) return false;
  const stem = recording.canonicalFilename.replace(/\.[^.]+$/, "");
  return proxyLibrary.proxies.some((p) => p.kind === "pre-life" && p.stem === stem);
}

export function rawProxyAvailable(rawFilename: string, proxyLibrary: MachineLifeProxyLibrary | undefined): boolean {
  if (!proxyLibrary) return false;
  const stem = rawFilename.replace(/\.[^.]+$/, "");
  return proxyLibrary.proxies.some((p) => p.kind === "raw" && p.stem === stem);
}

// ── Filters ───────────────────────────────────────────────────────────────

export interface MachineLifeRecordingFilters {
  category?: MachineLifeCategory;
  mode?: MachineLifeConstructionMode;
  life?: MachineLifeLifeScore | "unreviewed";
  replay?: "yes" | "no" | "unreviewed";
  disposition?: MachineLifeDisposition;
  reviewStatus?: "reviewed" | "unreviewed";
  audioAvailable?: boolean;
}

export function filterMachineLifeRecordings(
  recordings: MachineLifeRecording[],
  reviews: MachineLifeRecordingReview[],
  proxyLibrary: MachineLifeProxyLibrary | undefined,
  filters: MachineLifeRecordingFilters,
): MachineLifeRecording[] {
  return recordings.filter((rec) => {
    if (filters.category && rec.category !== filters.category) return false;
    if (filters.mode && rec.mode !== filters.mode) return false;

    const review = findMachineLifeReview(reviews, rec.id);

    if (filters.life !== undefined) {
      const life = review?.lifeScore ?? null;
      if (filters.life === "unreviewed") {
        if (life !== null) return false;
      } else if (life !== filters.life) {
        return false;
      }
    }

    if (filters.replay !== undefined) {
      const replay = review?.replay ?? null;
      if (filters.replay === "unreviewed") {
        if (replay !== null) return false;
      } else if (filters.replay === "yes" && replay !== true) {
        return false;
      } else if (filters.replay === "no" && replay !== false) {
        return false;
      }
    }

    if (filters.disposition && review?.disposition !== filters.disposition) return false;

    if (filters.reviewStatus) {
      const completeness = reviewCompleteness(review);
      const isReviewed = completeness !== "unreviewed";
      if (filters.reviewStatus === "reviewed" && !isReviewed) return false;
      if (filters.reviewStatus === "unreviewed" && isReviewed) return false;
    }

    if (filters.audioAvailable !== undefined) {
      const available = preLifeProxyAvailable(rec, proxyLibrary);
      if (available !== filters.audioAvailable) return false;
    }

    return true;
  });
}

// ── Collection summary ────────────────────────────────────────────────────

export interface MachineLifeCollectionSummary {
  collectionId: string;
  collectionVersion: string;
  engine: string;
  engineVersion: string;
  identityNote: string;
  recordingCount: number;
  categoryDistribution: Record<MachineLifeCategory, number>;
  modeDistribution: Record<MachineLifeConstructionMode, number>;
  lifeDistribution: { 0: number; 1: number; 2: number; unreviewed: number };
  replayCount: { yes: number; no: number; unreviewed: number };
  reviewCompletion: { complete: number; partial: number; unreviewed: number };
  preLifeProxiesAvailable: number;
  preLifeProxiesExpected: number;
  rawProxiesAvailable: number;
  rawProxiesExpected: number;
  validationWarnings: string[];
}

const EMPTY_CATEGORY_DIST: Record<MachineLifeCategory, number> = {
  signal: 0, pulse: 0, texture: 0, environment: 0, gesture: 0, collision: 0, structure: 0, "free-dream": 0,
};

export function summarizeMachineLifeCollection(
  collection: MachineLifeCollection,
  reviews: MachineLifeRecordingReview[],
  proxyLibrary: MachineLifeProxyLibrary | undefined,
): MachineLifeCollectionSummary {
  const categoryDistribution = { ...EMPTY_CATEGORY_DIST };
  const modeDistribution: Record<MachineLifeConstructionMode, number> = { layer: 0, sequence: 0 };
  const lifeDistribution = { 0: 0, 1: 0, 2: 0, unreviewed: 0 };
  const replayCount = { yes: 0, no: 0, unreviewed: 0 };
  const reviewCompletion = { complete: 0, partial: 0, unreviewed: 0 };

  for (const rec of collection.recordings) {
    categoryDistribution[rec.category]++;
    modeDistribution[rec.mode]++;

    const review = findMachineLifeReview(reviews, rec.id);
    const life = review?.lifeScore ?? null;
    if (life === null) lifeDistribution.unreviewed++;
    else lifeDistribution[life]++;

    const replay = review?.replay ?? null;
    if (replay === null) replayCount.unreviewed++;
    else if (replay) replayCount.yes++;
    else replayCount.no++;

    reviewCompletion[reviewCompleteness(review)]++;
  }

  const preLifeProxiesAvailable = collection.recordings.filter((r) => preLifeProxyAvailable(r, proxyLibrary)).length;
  const rawProxiesAvailable = collection.rawSources.filter((s) => rawProxyAvailable(s.filename, proxyLibrary)).length;

  const validationWarnings: string[] = [];
  if (collection.recordingCount !== collection.recordings.length) {
    validationWarnings.push(`recordingCount (${collection.recordingCount}) does not match imported recordings (${collection.recordings.length}).`);
  }
  if (preLifeProxiesAvailable < collection.recordings.length) {
    validationWarnings.push(`${collection.recordings.length - preLifeProxiesAvailable} Pre-Life recording(s) have no matching audition proxy.`);
  }
  if (rawProxiesAvailable < collection.rawSources.length) {
    validationWarnings.push(`${collection.rawSources.length - rawProxiesAvailable} raw source(s) have no matching audition proxy.`);
  }
  if (proxyLibrary) {
    for (const issue of proxyLibrary.issues) {
      validationWarnings.push(`Proxy ${issue.kind}/${issue.stem}: ${issue.reason}${issue.detail ? ` (${issue.detail})` : ""}`);
    }
  }

  return {
    collectionId: collection.id,
    collectionVersion: collection.collectionVersion,
    engine: collection.engine,
    engineVersion: collection.engineVersion,
    identityNote: collection.identityNote,
    recordingCount: collection.recordings.length,
    categoryDistribution,
    modeDistribution,
    lifeDistribution,
    replayCount,
    reviewCompletion,
    preLifeProxiesAvailable,
    preLifeProxiesExpected: collection.recordings.length,
    rawProxiesAvailable,
    rawProxiesExpected: collection.rawSources.length,
    validationWarnings,
  };
}

// ── Direct source lineage ─────────────────────────────────────────────────

// Direct-only by design: expanding to full raw-source ancestry would require
// the transformation manifest/recipes to also be loaded, which this
// workspace's first build does not import (see 0811 handoff spec, "Do not
// claim expanded ancestry unless the loaded transformation recipes prove
// it"). Only the recording's own source_uses are ever returned here.
export function directSourceLineage(recording: MachineLifeRecording) {
  return recording.sourceUses;
}

// ── Repeated-ancestor warnings (provable from direct source_uses alone) ────

export interface MachineLifeRepeatedAncestorWarning {
  sourceFilename: string;
  recordingIds: string[];
}

/**
 * Flags a direct source filename referenced by more than one recording in
 * the collection. This is the collection-wide, provable-without-expansion
 * form of the Pass 2 review's "shared-ancestry saturation" finding (e.g.
 * 0012/0014) — it does NOT expand into transformation ancestry, only direct
 * source_uses filenames actually present in the imported manifest.
 */
export function repeatedDirectAncestorWarnings(collection: MachineLifeCollection): MachineLifeRepeatedAncestorWarning[] {
  const byFilename = new Map<string, Set<string>>();
  for (const rec of collection.recordings) {
    for (const use of rec.sourceUses) {
      const set = byFilename.get(use.filename) ?? new Set<string>();
      set.add(rec.id);
      byFilename.set(use.filename, set);
    }
  }
  const warnings: MachineLifeRepeatedAncestorWarning[] = [];
  for (const [filename, ids] of byFilename) {
    if (ids.size > 1) {
      warnings.push({ sourceFilename: filename, recordingIds: [...ids].sort() });
    }
  }
  return warnings.sort((a, b) => a.sourceFilename.localeCompare(b.sourceFilename));
}
