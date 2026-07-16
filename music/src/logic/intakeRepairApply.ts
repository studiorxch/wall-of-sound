// Intake repair apply + undo (0705R)

import type { Track } from "../data/trackTypes";
import type { IntakeRepairItem, IntakeRepairBatch } from "./intakeRepairQueue";
import { gradeTrackIntake } from "./intakeReadiness";

function nowIso(): string {
  return new Date().toISOString();
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type IntakeRepairApplyResult = {
  updatedTracks: Track[];
  batch: IntakeRepairBatch;
  appliedItems: IntakeRepairItem[];
  blockedItems: IntakeRepairItem[];
};

export function applyIntakeRepairs(
  tracks: Track[],
  items: IntakeRepairItem[],
  selectedIds: Set<string>,
): IntakeRepairApplyResult {
  const byId = new Map(tracks.map(t => [t.trackId, t]));
  const appliedItems: IntakeRepairItem[] = [];
  const blockedItems: IntakeRepairItem[] = [];

  const beforeSnapshots: Record<string, Partial<Track>> = {};
  const afterSnapshots: Record<string, Partial<Track>> = {};
  const trackPatches = new Map<string, Partial<Track>>();

  for (const item of items) {
    if (!selectedIds.has(item.repairId)) continue;
    if (item.risk === "blocked" || item.status === "blocked") {
      blockedItems.push({ ...item, status: "blocked" });
      continue;
    }

    const track = byId.get(item.trackId);
    if (!track) {
      blockedItems.push({ ...item, status: "blocked", blockerReason: "Track not found" });
      continue;
    }

    // Capture before snapshot (first patch wins — keeps original values)
    if (!beforeSnapshots[item.trackId]) {
      const snap: Partial<Track> = {};
      for (const f of item.fieldsChanged) snap[f as keyof Track] = (track as Record<string, unknown>)[f] as never;
      beforeSnapshots[item.trackId] = snap;
    }

    // Accumulate patch
    const patch = trackPatches.get(item.trackId) ?? {};
    Object.assign(patch, item.after);
    trackPatches.set(item.trackId, patch);

    appliedItems.push({ ...item, status: "applied" });
  }

  // Build updated tracks
  const updatedTracks = tracks.map(t => {
    const patch = trackPatches.get(t.trackId);
    if (!patch) return t;
    const updated = { ...t, ...patch };
    // Refresh readiness grade
    const { grade, issues } = gradeTrackIntake(updated);
    updated.intakeReadiness = grade;
    updated.intakeIssues = issues.map(i => i.code);
    // Record after snapshot
    const afterSnap: Partial<Track> = {};
    for (const f of Object.keys(patch)) afterSnap[f as keyof Track] = (updated as Record<string, unknown>)[f] as never;
    afterSnap.intakeReadiness = grade;
    afterSnapshots[t.trackId] = afterSnap;
    return updated;
  });

  const batch: IntakeRepairBatch = {
    batchId: shortId(),
    appliedAt: nowIso(),
    itemIds: appliedItems.map(i => i.repairId),
    trackSnapshotsBefore: beforeSnapshots,
    trackSnapshotsAfter: afterSnapshots,
    summary: {
      applied: appliedItems.length,
      blocked: blockedItems.length,
      deferred: 0,
      ignored: 0,
    },
  };

  return { updatedTracks, batch, appliedItems, blockedItems };
}

export function undoIntakeRepairBatch(
  tracks: Track[],
  batch: IntakeRepairBatch,
): Track[] {
  return tracks.map(t => {
    const snap = batch.trackSnapshotsBefore[t.trackId];
    if (!snap) return t;
    const restored = { ...t, ...snap };
    const { grade, issues } = gradeTrackIntake(restored);
    restored.intakeReadiness = grade;
    restored.intakeIssues = issues.map(i => i.code);
    return restored;
  });
}
