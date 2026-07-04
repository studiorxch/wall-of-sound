// Schedule resolver (0621G) — pure now/next/later logic over schedule blocks.
// Defensive: malformed blocks are filtered, never crash.

import type {
  ScheduleBlock,
  ScheduleState,
  ResolvedSchedule,
  ScheduleBlockRole,
  ScheduleDisplayMode,
} from "../data/scheduleTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";

const LATER_COUNT = 5;

export function formatScheduleTime(valueIso: string): string {
  const date = new Date(valueIso);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export type SchedulePreviewItem = {
  label: "NOW" | "NEXT" | "LATER" | "STANDBY" | "NO SCHEDULE";
  title: string;
  startTimeLabel?: string;
  endTimeLabel?: string;
  roleLabel?: string;
};

/**
 * Compact Now / Next / Later items for the Smart Grid schedule-preview region.
 * Handles the empty / standby / no-next fallbacks from the 0621J spec.
 */
export function buildSchedulePreviewItems(
  resolved: ResolvedSchedule,
  laterLimit = 1,
): SchedulePreviewItem[] {
  const { now, next, later } = resolved;

  // No blocks at all.
  if (!now && !next && later.length === 0) {
    return [{ label: "NO SCHEDULE", title: "Add blocks in Scheduler" }];
  }

  const items: SchedulePreviewItem[] = [];

  if (now) {
    items.push({
      label: "NOW",
      title: now.title,
      startTimeLabel: formatScheduleTime(now.startTimeIso),
      endTimeLabel: formatScheduleTime(now.endTimeIso),
    });
    if (next) {
      items.push({ label: "NEXT", title: next.title, startTimeLabel: formatScheduleTime(next.startTimeIso) });
    } else {
      items.push({ label: "NEXT", title: "No upcoming block" });
    }
  } else if (next) {
    // No current block but future blocks exist → standby.
    items.push({ label: "STANDBY", title: next.title, startTimeLabel: formatScheduleTime(next.startTimeIso) });
  }

  for (const b of later.slice(0, Math.max(0, laterLimit))) {
    items.push({ label: "LATER", title: b.title, startTimeLabel: formatScheduleTime(b.startTimeIso) });
  }

  return items;
}

function isValidIso(s: unknown): s is string {
  if (typeof s !== "string" || s.length === 0) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}

/** A block is usable only if it has valid start/end times with end after start. */
export function isValidScheduleBlock(b: unknown): b is ScheduleBlock {
  if (!b || typeof b !== "object") return false;
  const blk = b as Partial<ScheduleBlock>;
  if (typeof blk.blockId !== "string") return false;
  if (!isValidIso(blk.startTimeIso) || !isValidIso(blk.endTimeIso)) return false;
  return Date.parse(blk.endTimeIso!) > Date.parse(blk.startTimeIso!);
}

export function sortScheduleBlocks(blocks: ScheduleBlock[]): ScheduleBlock[] {
  return [...blocks]
    .filter(isValidScheduleBlock)
    .sort((a, b) => Date.parse(a.startTimeIso) - Date.parse(b.startTimeIso));
}

/** Two blocks overlap if their [start, end) intervals intersect. */
export function blocksOverlap(a: ScheduleBlock, b: ScheduleBlock): boolean {
  const aS = Date.parse(a.startTimeIso), aE = Date.parse(a.endTimeIso);
  const bS = Date.parse(b.startTimeIso), bE = Date.parse(b.endTimeIso);
  return aS < bE && bS < aE;
}

/** Ids of blocks that overlap at least one other block (for conflict marking). */
export function findOverlappingBlockIds(blocks: ScheduleBlock[]): Set<string> {
  const sorted = sortScheduleBlocks(blocks);
  const conflicting = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      // Sorted by start: once a later block starts after this one ends, stop.
      if (Date.parse(sorted[j].startTimeIso) >= Date.parse(sorted[i].endTimeIso)) break;
      if (blocksOverlap(sorted[i], sorted[j])) {
        conflicting.add(sorted[i].blockId);
        conflicting.add(sorted[j].blockId);
      }
    }
  }
  return conflicting;
}

export function resolveSchedule(params: {
  schedule: ScheduleState;
  nowIso?: string;
}): ResolvedSchedule {
  const { schedule } = params;
  const nowMs = params.nowIso && isValidIso(params.nowIso)
    ? Date.parse(params.nowIso)
    : Date.now();

  const sorted = sortScheduleBlocks(schedule?.blocks ?? []);

  const now = sorted.find(
    (b) => Date.parse(b.startTimeIso) <= nowMs && nowMs < Date.parse(b.endTimeIso),
  ) ?? null;

  // Future blocks = start strictly after now. The current "now" block is excluded.
  const future = sorted.filter((b) => Date.parse(b.startTimeIso) > nowMs);
  const next = future[0] ?? null;
  const later = future.slice(1, 1 + LATER_COUNT);

  return { now, next, later };
}

/** Computed total duration (seconds) of a playlist's assigned slots. */
function playlistAssignedSeconds(playlist: PlaylistRecord, secsByTrackId?: Map<string, number>): number {
  if (!secsByTrackId) return 0;
  return (playlist.slots ?? []).reduce(
    (sum, s) => sum + (s.assignedTrackId ? (secsByTrackId.get(s.assignedTrackId) ?? 0) : 0),
    0,
  );
}

export function createScheduleBlockFromPlaylist(params: {
  playlist: PlaylistRecord;
  startTimeIso: string;
  role?: ScheduleBlockRole;
  displayMode?: ScheduleDisplayMode;
  nowIso: string;
  blockId: string;
  // Optional track-duration lookup for the computed-duration fallback.
  secsByTrackId?: Map<string, number>;
}): ScheduleBlock {
  const { playlist, startTimeIso, role, displayMode, nowIso, blockId, secsByTrackId } = params;

  // Duration: target → computed slot duration → 60 min fallback.
  let durationMinutes = 60;
  if (playlist.targetDurationMinutes && playlist.targetDurationMinutes > 0) {
    durationMinutes = playlist.targetDurationMinutes;
  } else {
    const computedSecs = playlistAssignedSeconds(playlist, secsByTrackId);
    if (computedSecs > 0) durationMinutes = Math.round(computedSecs / 60);
  }

  const startMs = isValidIso(startTimeIso) ? Date.parse(startTimeIso) : Date.parse(nowIso);
  const endMs = startMs + durationMinutes * 60_000;

  return {
    blockId,
    playlistId: playlist.playlistId,
    title: playlist.title,
    startTimeIso: new Date(startMs).toISOString(),
    endTimeIso: new Date(endMs).toISOString(),
    durationMinutes,
    role: role ?? "main_block",
    displayMode: displayMode ?? "full_scene",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
