import type { Track } from "./trackTypes";
import type { FlowCurve } from "./flowCurveTypes";

export type WarningLevel = "none" | "yellow" | "red";

export type TrackSlot = {
  slotId: string;
  slotIndex: number;
  startTimeSeconds: number;
  targetEnergy: number;
  targetBpm: number;
  assignedTrackId?: string;
  warningLevel: WarningLevel;
  warningMessages: string[];
};

/**
 * Defensive normalization for slot warning messages (0621F).
 * Missing / null / non-array → []. Mixed arrays drop non-string entries.
 * Used by both storage repair and render paths so malformed slot data can
 * never crash the editor.
 */
export function normalizeWarningMessages(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((message): message is string => typeof message === "string")
    : [];
}

export type TrackLockType = "position" | "opener" | "closer";

export type TrackLock = {
  trackId: string;
  lockType: TrackLockType;
  slotIndex?: number;
};

export type OrphanReason =
  | "BPM_TOO_LOW"
  | "BPM_TOO_HIGH"
  | "ENERGY_TOO_LOW"
  | "ENERGY_TOO_HIGH"
  | "KEY_TOO_RISKY"
  | "NO_VALID_SLOT"
  | "LOCK_CONFLICT";

export type OrphanTrack = {
  trackId: string;
  reasons: OrphanReason[];
  explanation: string;
};

export type PlaylistProject = {
  projectId: string;
  title: string;
  targetDurationSeconds: number;
  tracks: Track[];
  flowCurve: FlowCurve;
  slots: TrackSlot[];
  locks: TrackLock[];
  orphans: OrphanTrack[];
  excludedTrackIds: string[];
  createdAt: string;
  updatedAt: string;
};
