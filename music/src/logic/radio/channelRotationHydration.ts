/**
 * Batch 02M -- the smallest boundary connecting persisted `RadioChannel`
 * state (Batch 02L) to Batch 02K's pure `ChannelRotation`/`RotationEntry[]`
 * shape. This is the ONE place `programId`s get joined against
 * authoritative Program duration metadata -- nothing downstream of this
 * module (namely `resolveChannelRotation`) ever touches Firestore, and
 * nothing upstream of it (`FirestoreRadioChannelRepository`) knows
 * anything about durations at all.
 *
 * RECON FINDING (before writing this file): `EventRadioRepository`'s
 * existing `listRadioPrograms()` is sufficient to supply every Program
 * this module needs -- there is no `getRadioProgram(id)` single-lookup
 * method, and none is needed; a Channel's rotation is a short, bounded
 * list, so one `listRadioPrograms()` call plus an in-memory Map lookup is
 * the smallest correct approach. No second representation of RADIO
 * Programs was introduced, and no repository API was broadened.
 *
 * ALL-OR-NOTHING (deliberate): a missing/malformed/duplicate Program
 * reference invalidates the ENTIRE hydration, never just that one entry.
 * Silently dropping a bad entry and hydrating the rest would alter the
 * authoritative Channel timeline (a shorter cycle, different airtime
 * boundaries) -- exactly the client-local-skipping failure mode
 * `channelRotation.ts`'s own "Clock Synchronization Rule" doc already
 * warns against one layer down. This module inherits that same posture.
 *
 * KNOWN OBSERVABILITY LIMIT: `listRadioPrograms()` already silently
 * filters out any `radioPrograms` document `decodeRadioProgram` can't
 * parse (see `firestoreEventRadioRepository.ts`) -- so a Program that
 * exists but is malformed is indistinguishable, through this repository's
 * public API, from a Program that was never created at all. Both surface
 * here as the same `"missing-program"` failure. This is a real, disclosed
 * limitation of the existing public API, not something this module works
 * around by reaching past it (e.g. reading `radioPrograms` documents
 * directly) -- doing so would be exactly the "second representation of
 * RADIO Programs" the recon step was asked to avoid introducing.
 */

import type { EventRadioRepository, RadioChannel, RadioProgramSummary } from "@studiorich/member-identity";
import type { ChannelRotation, RotationEntry } from "./channelRotation";

export type ChannelRotationHydrationFailureReason =
  | "invalid-channel"
  | "missing-program"
  | "invalid-program-duration"
  | "duplicate-program";

export type ChannelRotationHydrationResult =
  | { readonly status: "hydrated"; readonly rotation: ChannelRotation }
  | { readonly status: "invalid"; readonly reason: ChannelRotationHydrationFailureReason; readonly programId?: string };

function hasValidRotationShape(channel: RadioChannel): boolean {
  return (
    !!channel &&
    typeof channel.channelId === "string" &&
    channel.channelId.length > 0 &&
    !!channel.rotation &&
    Number.isFinite(channel.rotation.anchorAtMs) &&
    Array.isArray(channel.rotation.programIds) &&
    channel.rotation.programIds.length > 0
  );
}

/**
 * Pure -- takes already-fetched Program metadata (a caller-supplied
 * lookup), never fetches anything itself. Same testability posture as
 * `resolveChannelRotation`/`resolveBroadcastState`: given the same
 * `channel` and `programsById`, always returns the same result.
 *
 * ORDERING: `entries` is built by iterating `channel.rotation.programIds`
 * IN PERSISTED ORDER -- `programsById`'s own iteration order (whatever a
 * Firestore query happened to return) is never consulted for ordering,
 * only for O(1) lookup by id. This is what guarantees persisted order
 * remains authoritative regardless of query return order.
 */
export function hydrateChannelRotation(
  channel: RadioChannel,
  programsById: ReadonlyMap<string, RadioProgramSummary>,
): ChannelRotationHydrationResult {
  if (!hasValidRotationShape(channel)) return { status: "invalid", reason: "invalid-channel" };

  const seenProgramIds = new Set<string>();
  const entries: RotationEntry[] = [];

  for (const programId of channel.rotation.programIds) {
    if (seenProgramIds.has(programId)) return { status: "invalid", reason: "duplicate-program", programId };
    seenProgramIds.add(programId);

    const program = programsById.get(programId);
    if (!program) return { status: "invalid", reason: "missing-program", programId };

    if (!Number.isFinite(program.totalDurationSeconds) || program.totalDurationSeconds <= 0) {
      return { status: "invalid", reason: "invalid-program-duration", programId };
    }

    entries.push({ programId, durationSeconds: program.totalDurationSeconds });
  }

  return {
    status: "hydrated",
    rotation: { channelId: channel.channelId, anchorAtMs: channel.rotation.anchorAtMs, entries },
  };
}

/**
 * Thin async wrapper around the pure function above, using ONLY the
 * existing `listRadioPrograms()` repository method (see this module's own
 * recon note) -- never `resolveChannelRotation`, never
 * `resolveBroadcastState`, never a manifest/audio fetch, never a write of
 * any kind.
 */
export async function hydrateChannelRotationFromCatalog(
  channel: RadioChannel,
  eventRadioRepository: Pick<EventRadioRepository, "listRadioPrograms">,
): Promise<ChannelRotationHydrationResult> {
  const programs = await eventRadioRepository.listRadioPrograms();
  const programsById = new Map(programs.map((program) => [program.id, program]));
  return hydrateChannelRotation(channel, programsById);
}
