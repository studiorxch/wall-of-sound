/**
 * RADIO-04 -- the smallest read representation proving canonical schedule
 * truth can support Now/Next/Upcoming. Consumes ONLY the canonical
 * authorities already established (radioScheduleBlocks via
 * radioScheduleBroadcastPriority.ts's own pure block-selection helpers,
 * plus the existing Channel Clock for the rotation fallback) -- never a
 * second/parallel schedule representation.
 *
 * SCOPE (deliberately smaller than "predict all future programming"):
 * `next`/`upcoming` only ever report SCHEDULED blocks -- normal Channel
 * rotation's own future cycling is not simulated forward in time here.
 * This is honest, not a shortcut: Channel rotation is a continuously
 * repeating cycle, not a calendar (see docs/architecture/radio/README.md's
 * "Channel rotation semantics"), and predicting its far-future state is a
 * separate, larger capability this batch does not claim to provide.
 * `now` DOES correctly reflect either source (scheduled or rotation).
 */

import type { EventRadioRepository, RadioChannelRepository, RadioProgramSummary, RadioScheduleRepository } from "@studiorich/member-identity";
import { resolveCurrentChannelBroadcast } from "./currentChannelBroadcast";
import { findActiveScheduleBlock, findNextScheduleBlock, listUpcomingScheduleBlocks } from "./radioScheduleBroadcastPriority";

export type RadioProgramGuideNowEntry =
  | { readonly status: "on-air"; readonly programId: string; readonly title: string; readonly source: "scheduled" | "rotation"; readonly startedAtMs: number; readonly endsAtMs: number }
  | { readonly status: "off-air"; readonly reason: string };

export interface RadioProgramGuideUpcomingEntry {
  readonly blockId: string;
  readonly programId: string;
  readonly title: string;
  readonly startAtMs: number;
  readonly endAtMs: number;
}

export interface RadioProgramGuide {
  readonly channelId: string;
  readonly now: RadioProgramGuideNowEntry;
  readonly next: RadioProgramGuideUpcomingEntry | null;
  readonly upcoming: readonly RadioProgramGuideUpcomingEntry[];
}

export interface ResolveRadioProgramGuideInput {
  readonly channelId: string;
  readonly nowMs: number;
  readonly radioChannelRepository: Pick<RadioChannelRepository, "getRadioChannel">;
  readonly eventRadioRepository: Pick<EventRadioRepository, "listRadioPrograms">;
  readonly radioScheduleRepository: Pick<RadioScheduleRepository, "listScheduleBlocksForChannel">;
  /** How far ahead "upcoming" looks. Default 14 days. */
  readonly upcomingWithinMs?: number;
}

const DEFAULT_UPCOMING_WITHIN_MS = 14 * 24 * 3600 * 1000;

function titleFor(programId: string, programs: readonly RadioProgramSummary[]): string {
  return programs.find((p) => p.id === programId)?.title ?? programId;
}

export async function resolveRadioProgramGuide(input: ResolveRadioProgramGuideInput): Promise<RadioProgramGuide> {
  const { channelId, nowMs, radioChannelRepository, eventRadioRepository, radioScheduleRepository } = input;
  const upcomingWithinMs = input.upcomingWithinMs ?? DEFAULT_UPCOMING_WITHIN_MS;

  const [blocks, programs] = await Promise.all([
    radioScheduleRepository.listScheduleBlocksForChannel(channelId),
    eventRadioRepository.listRadioPrograms(),
  ]);

  const active = findActiveScheduleBlock(blocks, channelId, nowMs);
  let now: RadioProgramGuideNowEntry;
  if (active) {
    now = { status: "on-air", programId: active.programId, title: titleFor(active.programId, programs), source: "scheduled", startedAtMs: active.startAtMs, endsAtMs: active.endAtMs };
  } else {
    const rotationResult = await resolveCurrentChannelBroadcast({ channelId, nowMs, radioChannelRepository, eventRadioRepository });
    now = rotationResult.status === "on-air"
      ? { status: "on-air", programId: rotationResult.programId, title: titleFor(rotationResult.programId, programs), source: "rotation", startedAtMs: rotationResult.programStartedAtMs, endsAtMs: rotationResult.programEndsAtMs }
      : { status: "off-air", reason: rotationResult.status };
  }

  const nextBlock = findNextScheduleBlock(blocks, channelId, nowMs);
  const next = nextBlock ? { blockId: nextBlock.id, programId: nextBlock.programId, title: titleFor(nextBlock.programId, programs), startAtMs: nextBlock.startAtMs, endAtMs: nextBlock.endAtMs } : null;

  const upcoming = listUpcomingScheduleBlocks(blocks, channelId, nowMs, upcomingWithinMs).map((b) => ({
    blockId: b.id, programId: b.programId, title: titleFor(b.programId, programs), startAtMs: b.startAtMs, endAtMs: b.endAtMs,
  }));

  return { channelId, now, next, upcoming };
}
