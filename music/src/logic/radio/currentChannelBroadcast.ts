/**
 * Batch 02N -- the smallest READ-ONLY service answering "which RADIO
 * Program owns this Channel at this wall-clock instant, and where are we
 * inside it?" Composes the existing authority chain end to end:
 *
 *   RadioChannelRepository.getRadioChannel(channelId)
 *                 |
 *                 v
 *   hydrateChannelRotationFromCatalog(channel, eventRadioRepository)
 *                 |
 *                 v
 *   resolveChannelRotation(rotation, nowMs)
 *
 * Delegates rotation mathematics ENTIRELY to `resolveChannelRotation`
 * (Batch 02K) and identity/duration joining ENTIRELY to
 * `hydrateChannelRotationFromCatalog` (Batch 02M) -- this module
 * reimplements neither. It never resolves tracks/manifests/audio, never
 * writes `eventProgram/current` or any other document, and never
 * constructs a Firebase repository itself: both repository capabilities
 * are dependency-injected (as the narrowest `Pick<...>` this module
 * actually calls), so it is testable with plain fakes and stays agnostic
 * to how a caller actually obtains a real repository.
 *
 * AUTHORITY, NOT AVAILABILITY (inherited from `channelRotation.ts`'s own
 * Clock Synchronization Rule, one layer down): if Program B owns the
 * interval, this service returns Program B -- it never substitutes a
 * different Program because of a network/fetch/manifest/audio problem,
 * because none of those concerns exist at this layer at all.
 *
 * THE CHANNEL CLOCK ITSELF IS AUTHORITATIVE: calling this function twice
 * with `nowMs` values straddling a deterministic boundary naturally
 * returns different Programs, with ZERO database mutation between calls
 * -- this service only ever reads, never writes (see the dedicated test
 * proving exactly this).
 */

import type { EventRadioRepository, RadioChannel, RadioChannelRepository } from "@studiorich/member-identity";
import { resolveChannelRotation, type ChannelRotationResolution } from "./channelRotation";
import { hydrateChannelRotationFromCatalog, type ChannelRotationHydrationFailureReason } from "./channelRotationHydration";

/**
 * Recon finding: `RadioChannel.status` has exactly two values,
 * `"active"`/`"inactive"` (Batch 02L's own type doc: "A Channel is either
 * broadcasting or it isn't ... 'ready' has no meaning here today"). An
 * `"inactive"` Channel is therefore NEVER on-air, regardless of whether
 * its rotation would otherwise mathematically resolve to a Program --
 * `status` is checked BEFORE any hydration/resolution work happens, so an
 * inactive Channel short-circuits to an explicit `"channel-inactive"`
 * result rather than silently reporting whatever its rotation math would
 * have said.
 */
export type CurrentChannelBroadcastResult =
  | { readonly status: "channel-not-found"; readonly channelId: string }
  | { readonly status: "channel-inactive"; readonly channelId: string }
  | {
      readonly status: "hydration-failed";
      readonly channelId: string;
      readonly reason: ChannelRotationHydrationFailureReason;
      readonly programId?: string;
    }
  // "invalid" | "before-start" | "on-air" -- reused verbatim from Batch
  // 02K, never restated/reimplemented.
  | ChannelRotationResolution;

export interface ResolveCurrentChannelBroadcastInput {
  readonly channelId: string;
  readonly nowMs: number;
  readonly radioChannelRepository: Pick<RadioChannelRepository, "getRadioChannel">;
  readonly eventRadioRepository: Pick<EventRadioRepository, "listRadioPrograms">;
}

function isInactive(channel: RadioChannel): boolean {
  return channel.status === "inactive";
}

export async function resolveCurrentChannelBroadcast(
  input: ResolveCurrentChannelBroadcastInput,
): Promise<CurrentChannelBroadcastResult> {
  const { channelId, nowMs, radioChannelRepository, eventRadioRepository } = input;

  const channel = await radioChannelRepository.getRadioChannel(channelId);
  if (!channel) return { status: "channel-not-found", channelId };
  if (isInactive(channel)) return { status: "channel-inactive", channelId };

  const hydration = await hydrateChannelRotationFromCatalog(channel, eventRadioRepository);
  if (hydration.status === "invalid") {
    return { status: "hydration-failed", channelId, reason: hydration.reason, programId: hydration.programId };
  }

  return resolveChannelRotation(hydration.rotation, nowMs);
}
