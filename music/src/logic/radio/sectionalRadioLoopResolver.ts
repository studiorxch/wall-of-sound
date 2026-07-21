// Sectional Looper Radio Export Bridge (0717B) — spec §7.3's 3-step
// resolution order: reuse an exact approved match, reuse-but-flag an exact
// non-approved match, or create new. Pure: no mutation, no side effects.
// Equality is always frame-exact (via resolveActiveLoopBoundsFrames, the
// same function every other bounds comparison in this app already uses)
// — never rounded display seconds.

import type { LoopAsset, LoopRevision } from "../../data/loopTypes";
import type { SectionalRadioPromotionSnapshot, SectionalRadioSourceResolution } from "../../data/sectionalRadioBridgeTypes";
import { resolveActiveLoopBoundsFrames } from "../loops/loopRevisions";

export function resolveSectionalRadioSourceLoopAsset(
  snapshot: SectionalRadioPromotionSnapshot,
  loops: LoopAsset[],
  loopRevisions: LoopRevision[],
  sampleRate: number,
): SectionalRadioSourceResolution {
  // The selection already points at a specific loop — if IT still matches
  // frame-exact, prefer it directly over scanning for another candidate
  // (this is the common case: the selection was already approved earlier
  // in this exact session).
  if (snapshot.existingLoopId) {
    const existing = loops.find((l) => l.id === snapshot.existingLoopId);
    if (existing && matchesSnapshot(existing, snapshot, loopRevisions, sampleRate)) {
      return existing.status === "approved"
        ? { mode: "reuse_approved", loopId: existing.id }
        : { mode: "reuse_needs_approval", loopId: existing.id };
    }
  }

  const candidates = loops.filter((l) => l.sourceTrackId === snapshot.sourceTrackId && matchesSnapshot(l, snapshot, loopRevisions, sampleRate));
  const approved = candidates.find((l) => l.status === "approved");
  if (approved) return { mode: "reuse_approved", loopId: approved.id };
  if (candidates.length > 0) return { mode: "reuse_needs_approval", loopId: candidates[0].id };
  return { mode: "create_new" };
}

function matchesSnapshot(loop: LoopAsset, snapshot: SectionalRadioPromotionSnapshot, loopRevisions: LoopRevision[], sampleRate: number): boolean {
  if (loop.sourceTrackId !== snapshot.sourceTrackId) return false;
  const bounds = resolveActiveLoopBoundsFrames(loop, loopRevisions, sampleRate);
  return bounds.startFrame === snapshot.startFrame && bounds.endFrame === snapshot.endFrame;
}
