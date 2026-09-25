/**
 * Batch 02O -- the smallest read-side composition answering "at wall-clock
 * time T, what exact Program, track, and offset should a listener on
 * Channel C be hearing?" No audio starts here.
 *
 *   CHANNEL CLOCK (Batch 02K/02N)              PROGRAM CLOCK (this batch)
 *   resolveCurrentChannelBroadcast    ------>   resolveTrackAtProgramOffset
 *   channelId, nowMs                            entries, programOffsetSeconds
 *        |                                            |
 *        v                                            v
 *   programId, programOffsetSeconds  --(manifest)-->  trackId, trackOffsetSeconds
 *
 * The Channel clock decides WHICH Program owns now; the Program clock
 * (this batch's `channelTrackPosition.ts`) decides WHICH TRACK owns that
 * already-known-valid offset. Neither clock is merged or rewritten --
 * this module only sequences them.
 *
 * RECON FINDING (before writing this file): there is no existing
 * manifest-repository abstraction and no way to resolve a manifest URL
 * from `{stationId, bundleVersion}` alone -- both `radioPlayerMain.ts`
 * and `eventMusicRuntime.ts` fetch a manifest via a path string
 * (`manifestBaseUrl`/`bundleBase` + "radio-manifest.json"), independently,
 * with no shared helper. `manifestBaseUrl` therefore remains
 * operationally necessary today; this module fetches the same way,
 * through an injected `fetchManifest` function (mirroring how Batch 02N
 * injects its repository capabilities) rather than inventing a new
 * package-addressing scheme the rest of the codebase doesn't support yet.
 *
 * AUTHORITY, NOT AVAILABILITY (inherited, same as every layer below):
 * a manifest fetch failure changes what THIS CALL can report, never what
 * Program/track actually owns the interval -- the failure states below
 * are reported as `package-unavailable`, not silently substituted with a
 * different Program or track.
 */

import type { EventRadioRepository, RadioChannelRepository } from "@studiorich/member-identity";
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";
import { resolveCurrentChannelBroadcast, type CurrentChannelBroadcastResult } from "./currentChannelBroadcast";
import { resolveTrackAtProgramOffset } from "./channelTrackPosition";

export interface ResolveChannelTrackBroadcastInput {
  readonly channelId: string;
  readonly nowMs: number;
  readonly radioChannelRepository: Pick<RadioChannelRepository, "getRadioChannel">;
  readonly eventRadioRepository: Pick<EventRadioRepository, "listRadioPrograms">;
  /** Same fetch-by-path-string mechanism `radioPlayerMain.ts`/`eventMusicRuntime.ts` already use -- injected, not constructed, so this module makes no network assumption of its own. */
  readonly fetchManifest: (manifestBaseUrl: string) => Promise<RadioWebManifest>;
}

export type ChannelTrackBroadcastResult =
  // Passed through verbatim from the Channel clock -- never restated.
  | Exclude<CurrentChannelBroadcastResult, { status: "on-air" }>
  | { readonly status: "program-not-found"; readonly channelId: string; readonly programId: string }
  | { readonly status: "package-unavailable"; readonly channelId: string; readonly programId: string; readonly message: string }
  | { readonly status: "invalid-manifest"; readonly channelId: string; readonly programId: string }
  | { readonly status: "track-resolution-failed"; readonly channelId: string; readonly programId: string }
  | {
      readonly status: "on-air";
      readonly channelId: string;
      readonly programId: string;
      readonly programIndex: number;
      readonly programOffsetSeconds: number;
      readonly programStartedAtMs: number;
      readonly programEndsAtMs: number;
      readonly trackId: string;
      readonly trackIndex: number;
      readonly trackOffsetSeconds: number;
      readonly trackDurationSeconds: number;
      readonly nextProgramId: string;
      readonly cycleIndex: number;
    };

export async function resolveChannelTrackBroadcast(
  input: ResolveChannelTrackBroadcastInput,
): Promise<ChannelTrackBroadcastResult> {
  const { channelId, nowMs, radioChannelRepository, eventRadioRepository, fetchManifest } = input;

  const channelResult = await resolveCurrentChannelBroadcast({ channelId, nowMs, radioChannelRepository, eventRadioRepository });
  if (channelResult.status !== "on-air") return channelResult;

  const { programId, programIndex, programOffsetSeconds, programStartedAtMs, programEndsAtMs, nextProgramId, cycleIndex } = channelResult;

  // One additional read, deliberately: reuses resolveCurrentChannelBroadcast
  // wholesale (its own tested composition) rather than duplicating its
  // internals just to keep a program list around from hydration.
  const programs = await eventRadioRepository.listRadioPrograms();
  const program = programs.find((candidate) => candidate.id === programId);
  if (!program) return { status: "program-not-found", channelId, programId };

  let manifest: RadioWebManifest;
  try {
    manifest = await fetchManifest(program.manifestBaseUrl);
  } catch (error) {
    return { status: "package-unavailable", channelId, programId, message: error instanceof Error ? error.message : String(error) };
  }

  if (!manifest.entries || manifest.entries.length === 0) return { status: "invalid-manifest", channelId, programId };

  const track = resolveTrackAtProgramOffset(manifest.entries, programOffsetSeconds);
  if (track.status === "invalid-manifest") return { status: "invalid-manifest", channelId, programId };
  if (track.status === "track-resolution-failed") return { status: "track-resolution-failed", channelId, programId };

  return {
    status: "on-air",
    channelId,
    programId,
    programIndex,
    programOffsetSeconds,
    programStartedAtMs,
    programEndsAtMs,
    trackId: track.trackId,
    trackIndex: track.trackIndex,
    trackOffsetSeconds: track.trackOffsetSeconds,
    trackDurationSeconds: track.trackDurationSeconds,
    nextProgramId,
    cycleIndex,
  };
}
