/**
 * Batch 02Q -- pure, DOM-free state operations for the Channel Control
 * rotation editor. Extracted so the actual list-editing logic (add/
 * remove/reorder/duplicate-rejection/length calculation/update-payload
 * construction) is unit-testable without a browser, matching this
 * codebase's own established preference for testing pure logic directly
 * rather than DOM-testing every visual detail.
 *
 * ANCHOR PRESERVATION (Batch 02Q's own explicit requirement): ordinary
 * add/remove/reorder + Save Rotation must NEVER change `anchorAtMs` --
 * only `buildStartRestartRotationUpdate` ever does that, and only because
 * that is its entire, deliberate purpose. This file's own functions make
 * that distinction structural, not incidental: `buildSaveRotationUpdate`
 * takes the CURRENT anchor and threads it through unchanged;
 * `buildActivateChannelUpdate`/`buildDeactivateChannelUpdate` don't even
 * accept a `rotation` field, so there is nothing for them to alter.
 */

import type { RadioChannelRotation, RadioProgramSummary, UpdateRadioChannelInput } from "@studiorich/member-identity";

export type AddProgramResult =
  | { readonly ok: true; readonly programIds: readonly string[] }
  | { readonly ok: false; readonly reason: "duplicate-program" };

/** Rejects a duplicate rather than silently no-op'ing or silently deduping -- the operator should see why nothing happened. */
export function addProgramToRotation(programIds: readonly string[], programId: string): AddProgramResult {
  if (programIds.includes(programId)) return { ok: false, reason: "duplicate-program" };
  return { ok: true, programIds: [...programIds, programId] };
}

export type RemoveProgramResult =
  | { readonly ok: true; readonly programIds: readonly string[] }
  | { readonly ok: false; readonly reason: "cannot-remove-last-program" };

/** A Channel's rotation can never become empty through editing -- the repository itself requires a non-empty `programIds` list (Batch 02L), and there is no product reason to let an operator edit their way into an unsavable state. */
export function removeProgramFromRotation(programIds: readonly string[], programId: string): RemoveProgramResult {
  if (programIds.length <= 1) return { ok: false, reason: "cannot-remove-last-program" };
  return { ok: true, programIds: programIds.filter((id) => id !== programId) };
}

/** No-op (same array reference contents, `moved: false`) when `index` is already first -- never throws, never wraps around. */
export function moveProgramUp(programIds: readonly string[], index: number): { readonly programIds: readonly string[]; readonly moved: boolean } {
  if (index <= 0 || index >= programIds.length) return { programIds, moved: false };
  const next = programIds.slice();
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return { programIds: next, moved: true };
}

/** No-op when `index` is already last -- same posture as `moveProgramUp`. */
export function moveProgramDown(programIds: readonly string[], index: number): { readonly programIds: readonly string[]; readonly moved: boolean } {
  if (index < 0 || index >= programIds.length - 1) return { programIds, moved: false };
  const next = programIds.slice();
  [next[index], next[index + 1]] = [next[index + 1], next[index]];
  return { programIds: next, moved: true };
}

/** Sums authoritative `RadioProgramSummary.totalDurationSeconds` for each rotation entry, in persisted order. A `programId` missing from `programsById` contributes 0 -- this is a DISPLAY-ONLY estimate (never persisted, per this batch's own scope), so it degrades gracefully rather than throwing on a catalog that hasn't loaded yet. */
export function computeRotationLengthSeconds(programIds: readonly string[], programsById: ReadonlyMap<string, RadioProgramSummary>): number {
  return programIds.reduce((total, id) => total + (programsById.get(id)?.totalDurationSeconds ?? 0), 0);
}

/** Ordinary edit commit -- preserves `anchorAtMs` exactly, never touches `status`. */
export function buildSaveRotationUpdate(channelId: string, programIds: readonly string[], currentAnchorAtMs: number): UpdateRadioChannelInput {
  return { channelId, rotation: { anchorAtMs: currentAnchorAtMs, programIds } };
}

/**
 * The ONE operation that establishes a new anchor. Preserves the
 * CURRENTLY PERSISTED Program ordering (the caller must pass the
 * already-saved order, not any locally-edited-but-unsaved draft) --
 * "Program 01 owns airtime immediately, offset ~= 0" per this batch's own
 * required semantics. Atomically activates the Channel in the same
 * update, since restarting an inactive rotation's clock and not also
 * making it live would leave the Channel "active-looking" but not
 * actually on air.
 */
export function buildStartRestartRotationUpdate(channelId: string, persistedProgramIds: readonly string[], nowMs: number): UpdateRadioChannelInput {
  return { channelId, rotation: { anchorAtMs: nowMs, programIds: persistedProgramIds }, status: "active" };
}

/** Preserves anchor and rotation by construction -- no `rotation` field in the payload at all. */
export function buildActivateChannelUpdate(channelId: string): UpdateRadioChannelInput {
  return { channelId, status: "active" };
}

/** Same preservation guarantee as `buildActivateChannelUpdate`. */
export function buildDeactivateChannelUpdate(channelId: string): UpdateRadioChannelInput {
  return { channelId, status: "inactive" };
}

/** Convenience type alias so the runtime file has one place naming what a resolved rotation entry, joined with catalog metadata, looks like for display. */
export interface RotationDisplayEntry {
  readonly programId: string;
  readonly title: string;
  readonly totalDurationSeconds: number | null;
}

export function buildRotationDisplayEntries(
  programIds: readonly string[],
  programsById: ReadonlyMap<string, RadioProgramSummary>,
): readonly RotationDisplayEntry[] {
  return programIds.map((programId) => {
    const program = programsById.get(programId);
    return { programId, title: program?.title ?? programId, totalDurationSeconds: program?.totalDurationSeconds ?? null };
  });
}

/** Same anchor-shape used everywhere else in this batch's own module -- exported only so tests/consumers don't need to know `RadioChannelRotation`'s own field names by heart. */
export function currentRotationAnchorAtMs(rotation: RadioChannelRotation): number {
  return rotation.anchorAtMs;
}
