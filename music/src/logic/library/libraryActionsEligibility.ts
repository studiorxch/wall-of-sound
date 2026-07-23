// Shared batch-action eligibility — used identically by Catalog, External,
// and Sounds. Pure — no DOM, no Node. Selection is a metadata-management
// operation: unavailable/unplayable tracks stay selectable and remain
// eligible for metadata-only actions; only genuinely playback-dependent
// actions narrow eligibility, and always by re-deriving from the CURRENT
// selected ids at call time (never a stale snapshot).

import type { Track } from "../../data/trackTypes";
import type { TrackPlaybackIssue } from "../../data/playProjectTypes";

export type LibraryActionId =
  | "sendToRadio" | "recheckPlaybackIssue" | "analyze" | "removeFromLibrary"
  | "exportPrivateMetadata" | "editMetadata" | "batchComments" | "archiveStatus";

export interface LibraryActionEligibilityContext {
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
}

export interface LibraryActionEligibilityResult {
  eligibleIds: string[];
  ineligibleIds: string[];
}

function hasLinkableAudio(t: Track): boolean {
  return !!(t.audioRelPath || t.objectUrl || t.filePath);
}

// Metadata-management actions never exclude anyone — listed explicitly
// (rather than via a catch-all) so a new action id added later must make a
// deliberate eligibility choice instead of silently inheriting "always
// eligible."
const ALWAYS_ELIGIBLE_ACTIONS = new Set<LibraryActionId>([
  "removeFromLibrary", "exportPrivateMetadata", "editMetadata", "batchComments", "archiveStatus",
]);

export function computeActionEligibility(
  actionId: LibraryActionId,
  tracks: Track[],
  ctx: LibraryActionEligibilityContext = {},
): LibraryActionEligibilityResult {
  if (ALWAYS_ELIGIBLE_ACTIONS.has(actionId)) {
    return { eligibleIds: tracks.map((t) => t.trackId), ineligibleIds: [] };
  }

  if (actionId === "sendToRadio") {
    // Mirrors the existing per-row rule (Catalog/Sounds only, never External).
    const eligibleIds: string[] = [];
    const ineligibleIds: string[] = [];
    for (const t of tracks) (t.sourceOwner !== "external" ? eligibleIds : ineligibleIds).push(t.trackId);
    return { eligibleIds, ineligibleIds };
  }

  if (actionId === "recheckPlaybackIssue") {
    const issues = ctx.trackPlaybackIssues ?? {};
    const eligibleIds: string[] = [];
    const ineligibleIds: string[] = [];
    for (const t of tracks) (issues[t.trackId] ? eligibleIds : ineligibleIds).push(t.trackId);
    return { eligibleIds, ineligibleIds };
  }

  if (actionId === "analyze") {
    const eligibleIds: string[] = [];
    const ineligibleIds: string[] = [];
    for (const t of tracks) (hasLinkableAudio(t) ? eligibleIds : ineligibleIds).push(t.trackId);
    return { eligibleIds, ineligibleIds };
  }

  return { eligibleIds: tracks.map((t) => t.trackId), ineligibleIds: [] };
}

export interface EligibilitySummary {
  totalCount: number;
  eligibleCount: number;
  ineligibleCount: number;
  text: string;
}

// The exact eligible/ineligible/affected-count line required before running
// a mixed-selection action.
export function summarizeEligibility(result: LibraryActionEligibilityResult, actionLabel: string): EligibilitySummary {
  const totalCount = result.eligibleIds.length + result.ineligibleIds.length;
  const eligibleCount = result.eligibleIds.length;
  const ineligibleCount = result.ineligibleIds.length;
  const text = ineligibleCount === 0
    ? `${actionLabel}: ${eligibleCount} of ${totalCount} selected`
    : `${actionLabel}: ${eligibleCount} of ${totalCount} eligible (${ineligibleCount} ineligible)`;
  return { totalCount, eligibleCount, ineligibleCount, text };
}
