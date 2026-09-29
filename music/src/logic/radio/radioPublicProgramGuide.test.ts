import { describe, expect, it, vi } from "vitest";
import { resolveRadioProgramGuide } from "./radioPublicProgramGuide";
import type { EventRadioRepository, RadioChannel, RadioChannelRepository, RadioProgramSummary, RadioScheduleBlock, RadioScheduleRepository } from "@studiorich/member-identity";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function program(overrides: Partial<RadioProgramSummary> = {}): RadioProgramSummary {
  return { id: "program-rotation", title: "Rotation Program", manifestBaseUrl: "/radio-web-export/rotation/v1/", trackCount: 1, totalDurationSeconds: 3600, ...overrides };
}

function channel(overrides: Partial<RadioChannel> = {}): RadioChannel {
  return {
    channelId: "channel-main", title: "StudioRich Main", status: "active",
    rotation: { anchorAtMs: T0, programIds: ["program-rotation"] },
    updatedAt: null, updatedBy: null,
    ...overrides,
  };
}

function block(overrides: Partial<RadioScheduleBlock> = {}): RadioScheduleBlock {
  return {
    id: "radschedule_1", channelId: "channel-main", programId: "program-scheduled",
    startAtMs: T0 + HOUR, endAtMs: T0 + 3 * HOUR, status: "scheduled",
    seriesId: null, recurrence: null, createdAt: null, updatedAt: null, updatedBy: null,
    ...overrides,
  };
}

function repos(opts: { channelValue?: RadioChannel | null; programs?: readonly RadioProgramSummary[]; blocks?: readonly RadioScheduleBlock[] }) {
  const channelValue = opts.channelValue === undefined ? channel() : opts.channelValue;
  const programs = opts.programs ?? [program(), program({ id: "program-scheduled", title: "Scheduled Program" })];
  const blocks = opts.blocks ?? [];
  return {
    radioChannelRepository: { getRadioChannel: vi.fn(async () => channelValue) } as unknown as Pick<RadioChannelRepository, "getRadioChannel">,
    eventRadioRepository: { listRadioPrograms: vi.fn(async () => programs) } as unknown as Pick<EventRadioRepository, "listRadioPrograms">,
    radioScheduleRepository: { listScheduleBlocksForChannel: vi.fn(async () => blocks) } as unknown as Pick<RadioScheduleRepository, "listScheduleBlocksForChannel">,
  };
}

describe("resolveRadioProgramGuide -- RADIO-04 public Now/Next/Upcoming", () => {
  it("now: reflects normal rotation when no schedule block is active", async () => {
    const r = repos({ blocks: [] });
    const guide = await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0, ...r });
    expect(guide.now).toMatchObject({ status: "on-air", programId: "program-rotation", source: "rotation" });
  });

  it("now: reflects the scheduled Program when one is active, with the correct title looked up from the catalog", async () => {
    const r = repos({ blocks: [block()] });
    const guide = await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0 + 1.5 * HOUR, ...r });
    expect(guide.now).toEqual({ status: "on-air", programId: "program-scheduled", title: "Scheduled Program", source: "scheduled", startedAtMs: T0 + HOUR, endsAtMs: T0 + 3 * HOUR });
  });

  it("now: off-air when the channel itself is inactive", async () => {
    const r = repos({ blocks: [], channelValue: channel({ status: "inactive" }) });
    const guide = await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0, ...r });
    expect(guide.now).toEqual({ status: "off-air", reason: "channel-inactive" });
  });

  it("next: the soonest upcoming scheduled block, with its Program title resolved", async () => {
    const r = repos({ blocks: [block()] });
    const guide = await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0, ...r });
    expect(guide.next).toEqual({ blockId: "radschedule_1", programId: "program-scheduled", title: "Scheduled Program", startAtMs: T0 + HOUR, endAtMs: T0 + 3 * HOUR });
  });

  it("next: null when nothing is scheduled ahead", async () => {
    const r = repos({ blocks: [] });
    const guide = await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0, ...r });
    expect(guide.next).toBeNull();
  });

  it("upcoming: lists every future scheduled block within the window, sorted, excluding cancelled ones", async () => {
    const soon = block({ id: "soon", startAtMs: T0 + HOUR, endAtMs: T0 + 2 * HOUR });
    const later = block({ id: "later", startAtMs: T0 + 2 * DAY, endAtMs: T0 + 2 * DAY + HOUR });
    const cancelled = block({ id: "cancelled", startAtMs: T0 + 3 * HOUR, endAtMs: T0 + 4 * HOUR, status: "cancelled" });
    const farAway = block({ id: "far-away", startAtMs: T0 + 30 * DAY, endAtMs: T0 + 30 * DAY + HOUR });
    const r = repos({ blocks: [later, farAway, cancelled, soon] });
    const guide = await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0, upcomingWithinMs: 14 * DAY, ...r });
    expect(guide.upcoming.map((u) => u.blockId)).toEqual(["soon", "later"]);
  });

  it("falls back to an off-air reason when the channel doesn't exist at all", async () => {
    const r = repos({ blocks: [], channelValue: null });
    const guide = await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0, ...r });
    expect(guide.now).toEqual({ status: "off-air", reason: "channel-not-found" });
  });

  it("consumes the canonical schedule authority, never a second one -- calls listScheduleBlocksForChannel exactly once per resolution", async () => {
    const r = repos({ blocks: [block()] });
    await resolveRadioProgramGuide({ channelId: "channel-main", nowMs: T0, ...r });
    expect(r.radioScheduleRepository.listScheduleBlocksForChannel).toHaveBeenCalledTimes(1);
    expect(r.radioScheduleRepository.listScheduleBlocksForChannel).toHaveBeenCalledWith("channel-main");
  });
});
