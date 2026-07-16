// 0709_MUSIC_Codec_Exclusion_Enforcement_v1.0.0
//
// Canonical playback-safety eligibility for playlist generation.
//
// A track is NOT eligible for generated playlists / candidate pools / playback
// queues when any of these hold:
//   codec              — trackPlaybackIssues[id] is unplayable with code CODEC
//   missing_audio      — unplayable with code MISSING / NO_SOURCE, or the track
//                        itself reports a missing audio link
//   unplayable         — unplayable for any other reason (NETWORK / UNKNOWN)
//   explicit_exclusion — trackId is in the project's excludedTrackIds
//
// Codec safety is independent of manual exclusion: restoring a track from
// exclusion does NOT make it eligible while its playback issue persists — the
// issue must be cleared (handleClearPlaybackIssue) first.
//
// This is a different axis from sourceEligibility.ts (source-group scoping,
// playlist-relative). Generation paths should apply BOTH.

import type { Track } from "../data/trackTypes";
import type { TrackPlaybackIssue } from "../data/playProjectTypes";
import type { TrackSlot } from "../data/playlistTypes";
import { findPlaylistDuplicates, getTrackDuplicateKey } from "../lib/playlistDuplicateGuard";

export type TrackExclusionReason =
  | "codec"
  | "missing_audio"
  | "explicit_exclusion"
  | "unplayable";

export type TrackEligibilityResult = {
  eligible: boolean;
  reasons: TrackExclusionReason[];
};

export type TrackEligibilityContext = {
  /** Project-level playback issue map (App: trackPlaybackIssuesRef.current). */
  playbackIssues?: Record<string, TrackPlaybackIssue>;
  /** Project-level explicit exclusion list (App: excludedTrackIds). */
  excludedTrackIds?: ReadonlySet<string> | readonly string[];
};

function isExplicitlyExcluded(trackId: string, ctx: TrackEligibilityContext): boolean {
  const excl = ctx.excludedTrackIds;
  if (!excl) return false;
  return Array.isArray(excl) ? excl.includes(trackId) : (excl as ReadonlySet<string>).has(trackId);
}

export type EligibilitySkipReport = Record<TrackExclusionReason, number>;

export type EligiblePartition = {
  eligible: Track[];
  skipped: Track[];
  report: EligibilitySkipReport;
  skippedCount: number;
};

function emptyReport(): EligibilitySkipReport {
  return { codec: 0, missing_audio: 0, explicit_exclusion: 0, unplayable: 0 };
}

/** Is this track blocked by a codec decode failure? */
export function hasCodecBlock(trackId: string, ctx: TrackEligibilityContext): boolean {
  const issue = ctx.playbackIssues?.[trackId];
  return issue?.status === "unplayable" && issue.code === "CODEC";
}

export function getTrackEligibility(track: Track, ctx: TrackEligibilityContext): TrackEligibilityResult {
  const reasons: TrackExclusionReason[] = [];
  const issue = ctx.playbackIssues?.[track.trackId];

  if (issue?.status === "unplayable") {
    if (issue.code === "CODEC") reasons.push("codec");
    else if (issue.code === "MISSING" || issue.code === "NO_SOURCE") reasons.push("missing_audio");
    else reasons.push("unplayable");
  } else if (track.audioMissing === true || track.audioStatus === "missing") {
    reasons.push("missing_audio");
  }

  if (isExplicitlyExcluded(track.trackId, ctx)) {
    reasons.push("explicit_exclusion");
  }

  return { eligible: reasons.length === 0, reasons };
}

export function isTrackPlaybackEligible(track: Track, ctx: TrackEligibilityContext): boolean {
  return getTrackEligibility(track, ctx).eligible;
}

/**
 * Union of explicit exclusions and every track with an unplayable issue.
 * Drop-in value for `excludedTrackIds` params on assignPlaylistToCurve /
 * generatePlaylistPathOptions — enforces safety inside existing pipelines.
 */
export function computeEffectiveExcludedIds(ctx: TrackEligibilityContext): Set<string> {
  const out = new Set<string>(ctx.excludedTrackIds ?? []);
  const issues = ctx.playbackIssues ?? {};
  for (const [id, issue] of Object.entries(issues)) {
    if (issue.status === "unplayable") out.add(id);
  }
  return out;
}

/**
 * Split tracks into eligible / skipped with per-reason counts.
 * Logs one console.info line when anything was skipped (expected exclusions
 * are not warnings).
 */
export function partitionEligibleTracks(
  tracks: Track[],
  ctx: TrackEligibilityContext,
  label = "generation",
): EligiblePartition {
  const eligible: Track[] = [];
  const skipped: Track[] = [];
  const report = emptyReport();

  for (const t of tracks) {
    const r = getTrackEligibility(t, ctx);
    if (r.eligible) {
      eligible.push(t);
    } else {
      skipped.push(t);
      for (const reason of r.reasons) report[reason]++;
    }
  }

  if (skipped.length > 0) {
    console.info(
      `[trackEligibility] ${label}: skipped ${skipped.length}/${tracks.length} —`,
      `codec: ${report.codec}, excluded: ${report.explicit_exclusion},`,
      `missing: ${report.missing_audio}, unplayable: ${report.unplayable}`,
    );
  }

  return { eligible, skipped, report, skippedCount: skipped.length };
}

/** Short human summary for notify toasts, e.g. "2 codec-blocked, 1 excluded". */
export function describeSkipReport(report: EligibilitySkipReport): string {
  const parts: string[] = [];
  if (report.codec) parts.push(`${report.codec} codec-blocked`);
  if (report.explicit_exclusion) parts.push(`${report.explicit_exclusion} excluded`);
  if (report.missing_audio) parts.push(`${report.missing_audio} missing audio`);
  if (report.unplayable) parts.push(`${report.unplayable} unplayable`);
  return parts.join(", ");
}

// ── Pre-generation candidate gate (0709_MUSIC_Pre_Generation_Codec_Gate) ──────
//
// A hard precondition run BEFORE scoring/ranking/curve-fitting/slot assignment.
// Blocked tracks never reach the generator — this is not post-hoc cleanup.
//
// "unverified" scanning is not wired up in this codebase yet (no audioScanState
// exists) — recording_safe/broadcast_safe modes are accepted for API shape and
// future wiring, but currently behave identically to casual: gating is driven
// entirely by trackPlaybackIssues + explicit exclusion, which is the full set
// of safety signals available today. needsScan is always [] until a scan
// system exists.

export type CandidateGateMode = "casual" | "recording_safe" | "broadcast_safe";

export type CandidateGateResult<TTrack> = {
  eligibleTracks: TTrack[];
  rejectedTracks: TTrack[];
  rejectedByReason: EligibilitySkipReport & { unverified: number };
  needsScan: TTrack[];
};

export function gatePlaylistCandidates<TTrack extends Track>(
  tracks: TTrack[],
  options: {
    mode: CandidateGateMode;
    playbackIssues?: Record<string, TrackPlaybackIssue>;
    excludedTrackIds?: ReadonlySet<string> | readonly string[];
  },
  label = "generation",
): CandidateGateResult<TTrack> {
  const ctx: TrackEligibilityContext = {
    playbackIssues: options.playbackIssues,
    excludedTrackIds: options.excludedTrackIds,
  };
  const { eligible, skipped, report } = partitionEligibleTracks(tracks, ctx, label);

  return {
    eligibleTracks: eligible as TTrack[],
    rejectedTracks: skipped as TTrack[],
    rejectedByReason: { ...report, unverified: 0 },
    needsScan: [],
  };
}

/**
 * "Not enough eligible tracks" warning — call after gating when the eligible
 * pool can't cover the requested target count. Returns null when sufficient.
 */
export function describeInsufficientCandidates(
  eligibleCount: number,
  targetCount: number,
): string | null {
  if (eligibleCount >= targetCount) return null;
  return `Only ${eligibleCount} safe track${eligibleCount !== 1 ? "s" : ""} available for a ${targetCount}-track playlist. Add more crates, lower filters, or repair blocked audio.`;
}

// ── UI/gate parity (0709_MUSIC_Codec_Gate_Leak_Audit) ─────────────────────────
//
// The Catalog/Playlist CODEC badge and gatePlaylistCandidates() must answer
// from the exact same source. Both read trackPlaybackIssues[trackId] via
// getTrackEligibility() — there is no second field (track.flags, track.badges,
// track.codecStatus etc.) anywhere in this codebase that also drives a CODEC
// badge. This helper exists so future UI can render badges from eligibility
// reasons directly instead of re-deriving them from the parallel
// playbackErrors Map, closing off any chance of the two drifting apart.
export function getTrackSafetyBadges(track: Track, ctx: TrackEligibilityContext): string[] {
  const { reasons } = getTrackEligibility(track, ctx);
  const badges: string[] = [];
  if (reasons.includes("codec")) badges.push("CODEC");
  if (reasons.includes("missing_audio")) badges.push("MISSING");
  if (reasons.includes("unplayable")) badges.push("ERR");
  if (reasons.includes("explicit_exclusion")) badges.push("EXCL");
  return badges;
}

// ── Final output gate (0709_MUSIC_Codec_Gate_Leak_Audit) ──────────────────────
//
// Runs immediately before a generated/regenerated playlist's slots are
// committed to state. Structurally different from the pre-generation gate:
// that one filters candidates BEFORE assignment; this one re-validates the
// ASSIGNED OUTPUT, because cached generation artifacts (accepted/duplicated
// PlaylistPathOptions) can go stale between generation time and commit time —
// a track can transition to unplayable in between. No generation path may
// bypass this: it is the last line of defense, not a substitute for gating
// candidates early.

export type PlaylistGenerationGateAudit = {
  generationId: string;
  entryPoint: string;
  rawCandidateCount: number;
  eligibleCandidateCount: number;
  rejectedCandidateCount: number;
  rejectedByReason: EligibilitySkipReport;
  outputSlotCountBeforeFinalGate: number;
  outputBlockedCountBeforeFinalGate: number;
  outputBlockedTracksBeforeFinalGate: Array<{
    trackId: string;
    title: string;
    reasons: TrackExclusionReason[];
    hasCodecBadge: boolean;
    playbackIssue?: TrackPlaybackIssue;
  }>;
  outputSlotCountAfterFinalGate: number;
  outputBlockedCountAfterFinalGate: number;
};

function reindexSlotTimings(slots: TrackSlot[], tracksById: Map<string, Track>): TrackSlot[] {
  let t = 0;
  return slots.map((s, i) => {
    const startTimeSeconds = t;
    const track = s.assignedTrackId ? tracksById.get(s.assignedTrackId) : undefined;
    t += track?.durationSeconds ?? 0;
    return { ...s, slotIndex: i, startTimeSeconds };
  });
}

/**
 * Removes blocked assigned tracks from `slots` and attempts to backfill each
 * emptied slot from `candidatePool` tracks not already used elsewhere in the
 * playlist. Never re-adds a blocked track; never duplicates an in-use track.
 * Preserves existing slot order — backfill fills in place, it does not
 * reorder or compact unless a slot could not be filled at all.
 */
export function backfillGeneratedSlots(params: {
  slots: TrackSlot[];
  candidatePool: Track[];
  tracksById: Map<string, Track>;
  eligibilityContext: TrackEligibilityContext;
  blockedTrackIds: Set<string>;
}): TrackSlot[] {
  const { slots, candidatePool, tracksById, eligibilityContext, blockedTrackIds } = params;

  const usedIds = new Set(
    slots.map((s) => s.assignedTrackId).filter((id): id is string => !!id && !blockedTrackIds.has(id)),
  );
  // Duplicate guard (0711_MUSIC_Playlist_Duplicate_Track_Guard): backfill must
  // never re-introduce a canonical-song duplicate of a track that's staying —
  // trackId alone isn't enough, since a different trackId can be the same song.
  const usedCanonicalKeys = new Set<string>();
  for (const id of usedIds) {
    const t = tracksById.get(id);
    if (t) usedCanonicalKeys.add(getTrackDuplicateKey(t));
  }

  const available = candidatePool.filter(
    (t) => !usedIds.has(t.trackId) && !usedCanonicalKeys.has(getTrackDuplicateKey(t)) && isTrackPlaybackEligible(t, eligibilityContext),
  );
  let cursor = 0;

  const filled = slots.map((slot) => {
    if (slot.assignedTrackId && !blockedTrackIds.has(slot.assignedTrackId)) return slot;
    // Empty slot (either originally empty or just cleared by the caller) — try to fill.
    while (
      cursor < available.length &&
      (usedIds.has(available[cursor].trackId) || usedCanonicalKeys.has(getTrackDuplicateKey(available[cursor])))
    ) cursor++;
    if (cursor >= available.length) return { ...slot, assignedTrackId: undefined };
    const replacement = available[cursor++];
    usedIds.add(replacement.trackId);
    usedCanonicalKeys.add(getTrackDuplicateKey(replacement));
    const track = tracksById.get(replacement.trackId) ?? replacement;
    return {
      ...slot,
      assignedTrackId: replacement.trackId,
      targetEnergy: track.energy ?? slot.targetEnergy,
      targetBpm: track.bpm ?? slot.targetBpm,
    };
  });

  return reindexSlotTimings(filled, tracksById);
}

/**
 * Duplicate leak pass (0711_MUSIC_Playlist_Duplicate_Track_Guard) — runs
 * before the codec pass in finalizeGeneratedPlaylistSlots. Keeps the FIRST
 * slot (by slotIndex) of every exact-track or canonical-song duplicate group
 * and clears every later occurrence BY SLOT INDEX — clearing by trackId
 * would also wipe the legitimate first occurrence, which is wrong here even
 * though that's exactly what the codec pass wants for a wholly-blocked track.
 */
function stripDuplicateLeaksBySlotIndex(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
): { slots: TrackSlot[]; removedCount: number } {
  const report = findPlaylistDuplicates(slots, tracksById);
  const dupSlotIndexes = new Set<number>();
  for (const dup of [...report.exactTrackDuplicates, ...report.canonicalSongDuplicates]) {
    const sorted = [...dup.slotIndexes].sort((a, b) => a - b);
    sorted.slice(1).forEach((i) => dupSlotIndexes.add(i));
  }
  if (dupSlotIndexes.size === 0) return { slots, removedCount: 0 };
  const cleared = slots.map((s) => (dupSlotIndexes.has(s.slotIndex) ? { ...s, assignedTrackId: undefined } : s));
  return { slots: cleared, removedCount: dupSlotIndexes.size };
}

/**
 * Hard final validator. Call immediately before a generated playlist's slots
 * are written to state. If any assigned track fails eligibility, logs
 * "[playlist-gate-leak]" with the exact offending track IDs, strips them, and
 * backfills from candidatePool. In "recording_safe" / "broadcast_safe" mode,
 * if blocked tracks still remain after backfill (only possible if
 * candidatePool itself contains stale/blocked entries), returns null instead
 * of slots — the caller must abort the save and surface the hard-failure toast.
 */
export function finalizeGeneratedPlaylistSlots(params: {
  entryPoint: string;
  slots: TrackSlot[];
  candidatePool: Track[];
  tracksById: Map<string, Track>;
  eligibilityContext: TrackEligibilityContext;
  mode?: CandidateGateMode;
}): { slots: TrackSlot[] | null; leakDetected: boolean; removedCount: number; backfilledCount: number; duplicatesRemoved: number } {
  const { entryPoint, candidatePool, tracksById, eligibilityContext, mode = "casual" } = params;

  // Duplicate leak pass (0711_MUSIC_Playlist_Duplicate_Track_Guard) runs first —
  // generation paths should already exclude duplicates at selection time, but
  // this is the last line of defense before anything is committed, exactly
  // like the codec pass below.
  const { slots: dedupedSlots, removedCount: duplicatesRemoved } = stripDuplicateLeaksBySlotIndex(params.slots, tracksById);
  if (duplicatesRemoved > 0) {
    console.error("[playlist-duplicate-leak]", { entryPoint, duplicatesRemoved });
  }
  const slots = dedupedSlots;

  const blockedTrackIds = new Set<string>();
  const blockedDetail: PlaylistGenerationGateAudit["outputBlockedTracksBeforeFinalGate"] = [];

  for (const slot of slots) {
    if (!slot.assignedTrackId) continue;
    const track = tracksById.get(slot.assignedTrackId);
    if (!track) continue; // unresolved track id — not this gate's concern
    const result = getTrackEligibility(track, eligibilityContext);
    if (!result.eligible) {
      blockedTrackIds.add(slot.assignedTrackId);
      blockedDetail.push({
        trackId: slot.assignedTrackId,
        title: track.title,
        reasons: result.reasons,
        hasCodecBadge: result.reasons.includes("codec"),
        playbackIssue: eligibilityContext.playbackIssues?.[slot.assignedTrackId],
      });
    }
  }

  if (blockedTrackIds.size === 0 && duplicatesRemoved === 0) {
    return { slots, leakDetected: false, removedCount: 0, backfilledCount: 0, duplicatesRemoved: 0 };
  }

  if (blockedTrackIds.size > 0) {
    console.error("[playlist-gate-leak]", {
      entryPoint,
      blockedSlotCount: blockedTrackIds.size,
      blockedTracks: blockedDetail,
    });
  }

  const beforeAssignedCount = params.slots.filter((s) => s.assignedTrackId).length;
  const cleanedSlots = slots.map((s) =>
    s.assignedTrackId && blockedTrackIds.has(s.assignedTrackId) ? { ...s, assignedTrackId: undefined } : s,
  );
  const backfilled = backfillGeneratedSlots({
    slots: cleanedSlots,
    candidatePool,
    tracksById,
    eligibilityContext,
    blockedTrackIds,
  });
  const totalRemoved = blockedTrackIds.size + duplicatesRemoved;
  const afterAssignedCount = backfilled.filter((s) => s.assignedTrackId).length;
  const backfilledCount = Math.max(0, afterAssignedCount - (beforeAssignedCount - totalRemoved));
  const stillMissing = totalRemoved - backfilledCount;

  if (stillMissing > 0 && mode !== "casual") {
    // recording_safe / broadcast_safe: cannot silently ship a shorter list —
    // caller must abort the save and show the hard-failure toast.
    return { slots: null, leakDetected: true, removedCount: totalRemoved, backfilledCount, duplicatesRemoved };
  }

  return { slots: backfilled, leakDetected: true, removedCount: totalRemoved, backfilledCount, duplicatesRemoved };
}
