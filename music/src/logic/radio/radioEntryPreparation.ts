// 0718B_RADIO_Web_Publication_Asset_Export_Bridge §State model — pure
// classification + request-building for one RadioPlaylistEntry's
// full-track web-preparation lifecycle. No network, no DOM — every fetch
// call lives in radioTrackPreparationOrchestrator.ts, which composes these
// pure steps (same split as radioEligibilityValidator.ts/
// radioPromotionOrchestrator.ts).

import type { RadioEntryApproval, RadioEntryPreparationState, RadioPlaylistEntry } from "../../data/radioPlaylistTypes";
import type { RadioTrackPrepareRequest, RadioTrackSectionSnapshot, RadioTrackSongIntelligence, RadioTrackVerifyResult } from "../../data/radioTrackPackageTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";
import { resolveActiveSongSection } from "../songAnalysis/songSectionRevisions";

export interface EntryPreparationContext {
  entry: RadioPlaylistEntry;
  // The source file's CURRENT sha256, from a live /radio-track-source-hash
  // check — undefined/null when no live check has been run yet (the
  // classifier then trusts the persisted approval rather than guessing).
  currentSourceAssetHash?: string | null;
  // The result of a live /radio-track-verify call against entry.trackBinding
  // — undefined/null when no live check has been run yet (the classifier
  // then trusts the persisted binding as READY; callers are responsible for
  // running a verification pass before treating that as trustworthy, e.g.
  // on prep-workspace open).
  verification?: RadioTrackVerifyResult | null;
  // This entry is mid-batch-run right now — transient, never persisted.
  isPreparing?: boolean;
}

// Derives RadioEntryPreparationState from persisted facts
// (approval/trackBinding/lastPreparationError/includedInPublish) plus the
// optional live-check results above. Never itself performs a network call
// or writes anything — disk (via the live checks) is the source of truth.
export function computeEntryPreparationState(ctx: EntryPreparationContext): RadioEntryPreparationState {
  const { entry, currentSourceAssetHash, verification, isPreparing } = ctx;

  if (!entry.includedInPublish) return "EXCLUDED";
  if (isPreparing) return "PREPARING";

  const approval = entry.approval;
  // A stale approval (source bytes changed since it was granted) never
  // silently carries forward — re-approval is required before preparation
  // can proceed, even if an older package still exists on disk.
  const approvalStale =
    Boolean(approval?.approved) &&
    currentSourceAssetHash != null &&
    approval?.sourceAssetHash != null &&
    approval.sourceAssetHash !== currentSourceAssetHash;
  if (!approval?.approved || approvalStale) return "NOT_APPROVED";

  const binding = entry.trackBinding;
  const error = entry.lastPreparationError;
  // An error is only "live" if no later successful binding has superseded
  // it — a retry that eventually succeeds must not keep showing FAILED.
  const errorSuperseded = Boolean(error && binding && binding.boundAt > error.at);
  if (error && !errorSuperseded) return "FAILED";

  if (!binding) return "NEEDS_PREPARATION";

  if (verification) return verification.ok ? "READY" : "STALE";

  return "READY";
}

// The Section Map snapshot a static web player needs — resolved active
// sections only (analyzer output merged with any active user revision),
// converted from frames to seconds using the analysis's own sampleRate.
export function buildSongIntelligenceSnapshot(analysis: CompleteSongAnalysis | null | undefined): RadioTrackSongIntelligence {
  if (!analysis) return { sections: [] };
  const sections: RadioTrackSectionSnapshot[] = analysis.sections.map((section) => {
    const resolved = resolveActiveSongSection(section, analysis.sectionRevisions);
    return {
      label: resolved.displayLabel,
      structuralType: resolved.structuralType,
      startSeconds: resolved.startFrame / analysis.sampleRate,
      endSeconds: resolved.endFrame / analysis.sampleRate,
      verified: resolved.verification === "verified",
    };
  });
  return {
    revision: analysis.updatedAt,
    analyzerVersion: analysis.analyzerVersion,
    configurationVersion: analysis.configurationVersion,
    status: analysis.status,
    sections,
  };
}

// Builds the exact approval patch to stamp onto an entry the moment a
// curator approves it — sourceAssetHash comes from a live
// /radio-track-source-hash check (never assumed), songIntelligenceRevision
// is CompleteSongAnalysis.updatedAt (no monotonic revision counter exists
// — disclosed deviation, see radioPlaylistTypes.ts).
export function buildApprovalPatch(sourceAssetHash: string, analysis: CompleteSongAnalysis | null | undefined, now: string = new Date().toISOString()): RadioEntryApproval {
  return { approved: true, approvedAt: now, sourceAssetHash, songIntelligenceRevision: analysis?.updatedAt };
}

// Assembles the full /radio-track-prepare request body from a Track +
// its CompleteSongAnalysis + the entry's current (already-verified-fresh)
// approval. Returns null when the entry isn't actually approved yet or the
// track has no resolvable portable audio path — callers must not send a
// prepare request for either case (same "don't invent a request" doctrine
// as radioEligibilityValidator.ts).
export function buildTrackPrepareRequest(track: Track, analysis: CompleteSongAnalysis | null | undefined, approval: RadioEntryApproval | undefined, forceNewVersion?: boolean): RadioTrackPrepareRequest | null {
  if (!approval?.approved || !approval.sourceAssetHash || !approval.approvedAt) return null;
  if (!track.audioRelPath) return null;

  return {
    sourceTrackId: track.trackId,
    audioRelPath: track.audioRelPath,
    display: { title: track.title ?? "", artist: track.artist ?? "" },
    musical: { bpm: track.bpm, key: track.camelotKey, moods: track.moodTags, genres: track.genres },
    songIntelligence: buildSongIntelligenceSnapshot(analysis),
    approval: { approved: true, approvedAt: approval.approvedAt, sourceAssetHash: approval.sourceAssetHash, songIntelligenceRevision: approval.songIntelligenceRevision },
    forceNewVersion,
  };
}
