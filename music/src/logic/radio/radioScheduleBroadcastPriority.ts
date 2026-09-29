/**
 * RADIO-04 -- "explicit resolution priority rather than mutating Channel
 * rotation" (verbatim requirement). This module NEVER touches
 * `channelRotation.ts`/`radioChannelRepository.updateRadioChannel` --
 * `anchorAtMs` and the rotation's own `programIds[]` are never read for
 * writing, never shifted, never restarted by anything here.
 *
 * Priority model:
 *   BEFORE a scheduled window -> resolveChannelTrackBroadcast() unchanged.
 *   DURING a scheduled window -> the scheduled Program wins (resolved here).
 *   AFTER a scheduled window  -> resolveChannelTrackBroadcast() unchanged
 *     again -- no special "rejoin" logic is needed, because that resolver
 *     was ALREADY a pure function of (state, nowMs) with no stored cursor
 *     (see channelRotation.ts's own doc) BEFORE this batch. Simply not
 *     intercepting after the window ends is sufficient by construction.
 *
 * A scheduled Program LOOPS its own manifest for the whole window if the
 * window is longer than the Program's own totalDurationSeconds (the
 * "one 6-8 hour Program repeatedly" bootstrap case named in this batch's
 * own brief) -- same modulo-cycle math `channelRotation.ts`'s own rotation
 * resolver already uses for its own repeating cycle, applied here to one
 * Program's own single-track-list duration instead of a whole rotation.
 */

import type { EventRadioRepository, RadioChannelRepository, RadioScheduleBlock, RadioScheduleRepository } from "@studiorich/member-identity";
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";
import { resolveChannelTrackBroadcast, type ChannelTrackBroadcastResult, type ResolveChannelTrackBroadcastInput } from "./channelTrackBroadcast";
import { resolveTrackAtProgramOffset } from "./channelTrackPosition";

/** Half-open `[startAtMs, endAtMs)`, `status !== "cancelled"`. If more than one somehow qualifies (should never happen given conflict prevention at write time), the earliest-starting one wins -- deterministic, never ambiguous. */
export function findActiveScheduleBlock(
  blocks: readonly RadioScheduleBlock[],
  channelId: string,
  nowMs: number,
): RadioScheduleBlock | null {
  const candidates = blocks
    .filter((b) => b.channelId === channelId && b.status !== "cancelled" && b.startAtMs <= nowMs && nowMs < b.endAtMs)
    .slice()
    .sort((a, b) => a.startAtMs - b.startAtMs);
  return candidates[0] ?? null;
}

export function findNextScheduleBlock(
  blocks: readonly RadioScheduleBlock[],
  channelId: string,
  nowMs: number,
): RadioScheduleBlock | null {
  const upcoming = blocks
    .filter((b) => b.channelId === channelId && b.status !== "cancelled" && b.startAtMs > nowMs)
    .slice()
    .sort((a, b) => a.startAtMs - b.startAtMs);
  return upcoming[0] ?? null;
}

export function listUpcomingScheduleBlocks(
  blocks: readonly RadioScheduleBlock[],
  channelId: string,
  nowMs: number,
  withinMs: number,
): readonly RadioScheduleBlock[] {
  return blocks
    .filter((b) => b.channelId === channelId && b.status !== "cancelled" && b.startAtMs > nowMs && b.startAtMs <= nowMs + withinMs)
    .slice()
    .sort((a, b) => a.startAtMs - b.startAtMs);
}

export interface ResolveChannelTrackBroadcastWithScheduleInput extends ResolveChannelTrackBroadcastInput {
  readonly radioScheduleRepository: Pick<RadioScheduleRepository, "listScheduleBlocksForChannel">;
}

/**
 * Drop-in replacement for `resolveChannelTrackBroadcast` -- same input
 * shape plus one extra required field, same output shape. When no
 * scheduled block is active right now, delegates to
 * `resolveChannelTrackBroadcast` UNCHANGED (byte-identical call, same
 * arguments) -- the "before/after" cases need no bespoke logic at all.
 */
export async function resolveChannelTrackBroadcastWithSchedule(
  input: ResolveChannelTrackBroadcastWithScheduleInput,
): Promise<ChannelTrackBroadcastResult> {
  const { channelId, nowMs, radioScheduleRepository, eventRadioRepository, fetchManifest } = input;

  const blocks = await radioScheduleRepository.listScheduleBlocksForChannel(channelId);
  const active = findActiveScheduleBlock(blocks, channelId, nowMs);
  if (!active) return resolveChannelTrackBroadcast(input);

  const programs = await eventRadioRepository.listRadioPrograms();
  const program = programs.find((candidate) => candidate.id === active.programId);
  if (!program) return { status: "program-not-found", channelId, programId: active.programId };

  let manifest: RadioWebManifest;
  try {
    manifest = await fetchManifest(program.manifestBaseUrl);
  } catch (error) {
    return { status: "package-unavailable", channelId, programId: active.programId, message: error instanceof Error ? error.message : String(error) };
  }
  if (!manifest.entries || manifest.entries.length === 0) return { status: "invalid-manifest", channelId, programId: active.programId };
  if (!Number.isFinite(program.totalDurationSeconds) || program.totalDurationSeconds <= 0) {
    return { status: "invalid-manifest", channelId, programId: active.programId };
  }

  const elapsedSeconds = (nowMs - active.startAtMs) / 1000;
  const cycleIndex = Math.floor(elapsedSeconds / program.totalDurationSeconds);
  const programOffsetSeconds = elapsedSeconds - cycleIndex * program.totalDurationSeconds;

  const track = resolveTrackAtProgramOffset(manifest.entries, programOffsetSeconds);
  if (track.status === "invalid-manifest") return { status: "invalid-manifest", channelId, programId: active.programId };
  if (track.status === "track-resolution-failed") return { status: "track-resolution-failed", channelId, programId: active.programId };
  const entry = manifest.entries[track.trackIndex];
  if (!entry) return { status: "invalid-manifest", channelId, programId: active.programId };

  // nextProgramId is display/diagnostic-only (channelDiagnosticDisplay.ts) --
  // best-effort: what normal rotation would resolve to right as this
  // window ends. A failure here never blocks the real on-air result.
  let nextProgramId = active.programId;
  try {
    const afterWindow = await resolveChannelTrackBroadcast({ ...input, nowMs: active.endAtMs });
    if (afterWindow.status === "on-air") nextProgramId = afterWindow.programId;
  } catch {
    // best-effort only
  }

  return {
    status: "on-air",
    channelId,
    programId: active.programId,
    programIndex: 0,
    programOffsetSeconds,
    programStartedAtMs: active.startAtMs,
    programEndsAtMs: active.endAtMs,
    trackId: track.trackId,
    trackIndex: track.trackIndex,
    trackOffsetSeconds: track.trackOffsetSeconds,
    trackDurationSeconds: track.trackDurationSeconds,
    nextProgramId,
    cycleIndex,
    manifestBaseUrl: program.manifestBaseUrl,
    audioUrl: entry.audioUrl,
  };
}

// Re-exported so callers that only need the repository/channel types don't
// have to import from @studiorich/member-identity separately.
export type { RadioChannelRepository, EventRadioRepository };
