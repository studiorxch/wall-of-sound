import { describe, expect, it, vi } from "vitest";
import {
  resolveChannelTrackBroadcastWithSchedule,
  findActiveScheduleBlock,
  findNextScheduleBlock,
  listUpcomingScheduleBlocks,
} from "./radioScheduleBroadcastPriority";
import type { EventRadioRepository, RadioChannel, RadioChannelRepository, RadioProgramSummary, RadioScheduleBlock, RadioScheduleRepository } from "@studiorich/member-identity";
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

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

function manifest(entries: RadioWebManifest["entries"]): RadioWebManifest {
  return {
    schemaVersion: "1.0.0", stationId: "program-scheduled", bundleVersion: 1, title: "Scheduled Program",
    entries, totalDurationSeconds: entries.reduce((s, e) => s + e.durationSeconds, 0),
    totalByteSize: 0, createdAt: new Date(0).toISOString(), performanceAssets: [],
  };
}

function entry(overrides: Partial<RadioWebManifest["entries"][number]> = {}) {
  return { radioTrackId: "t0", packageVersion: 1, audioUrl: "audio/t0.opus", durationSeconds: 1800, byteSize: 100, sha256: "x", title: "Track 0", artist: "StudioRich", ...overrides };
}

const ROTATION_MANIFEST = manifest([entry({ radioTrackId: "rot0", durationSeconds: 3600, audioUrl: "audio/rot0.opus" })]);
const SCHEDULED_MANIFEST = manifest([
  entry({ radioTrackId: "sched0", durationSeconds: 1800, audioUrl: "audio/sched0.opus" }),
  entry({ radioTrackId: "sched1", durationSeconds: 1800, audioUrl: "audio/sched1.opus" }),
]);

function repos(opts: {
  channelValue?: RadioChannel | null;
  programs?: readonly RadioProgramSummary[];
  blocks?: readonly RadioScheduleBlock[];
  fetchManifestImpl?: (url: string) => Promise<RadioWebManifest>;
}) {
  const channelValue = opts.channelValue === undefined ? channel() : opts.channelValue;
  const programs = opts.programs ?? [program(), program({ id: "program-scheduled", manifestBaseUrl: "/radio-web-export/scheduled/v1/", totalDurationSeconds: 3600 })];
  const blocks = opts.blocks ?? [];
  const fetchManifestImpl = opts.fetchManifestImpl ?? (async (url: string) => (url.includes("scheduled") ? SCHEDULED_MANIFEST : ROTATION_MANIFEST));
  return {
    radioChannelRepository: { getRadioChannel: vi.fn(async () => channelValue) } as unknown as Pick<RadioChannelRepository, "getRadioChannel">,
    eventRadioRepository: { listRadioPrograms: vi.fn(async () => programs) } as unknown as Pick<EventRadioRepository, "listRadioPrograms">,
    radioScheduleRepository: { listScheduleBlocksForChannel: vi.fn(async () => blocks) } as unknown as Pick<RadioScheduleRepository, "listScheduleBlocksForChannel">,
    fetchManifest: vi.fn(fetchManifestImpl),
  };
}

describe("findActiveScheduleBlock / findNextScheduleBlock / listUpcomingScheduleBlocks -- pure", () => {
  const b = block();
  it("active: nowMs inside [startAtMs, endAtMs)", () => {
    expect(findActiveScheduleBlock([b], "channel-main", T0 + 2 * HOUR)).toEqual(b);
  });
  it("not active exactly at endAtMs (half-open)", () => {
    expect(findActiveScheduleBlock([b], "channel-main", T0 + 3 * HOUR)).toBeNull();
  });
  it("active exactly at startAtMs (inclusive)", () => {
    expect(findActiveScheduleBlock([b], "channel-main", T0 + HOUR)).toEqual(b);
  });
  it("ignores a cancelled block", () => {
    expect(findActiveScheduleBlock([{ ...b, status: "cancelled" }], "channel-main", T0 + 2 * HOUR)).toBeNull();
  });
  it("ignores a different channel's block", () => {
    expect(findActiveScheduleBlock([{ ...b, channelId: "other-channel" }], "channel-main", T0 + 2 * HOUR)).toBeNull();
  });
  it("next: the soonest future block, not any earlier one", () => {
    const later = block({ id: "later", startAtMs: T0 + 10 * HOUR, endAtMs: T0 + 12 * HOUR });
    expect(findNextScheduleBlock([b, later], "channel-main", T0)).toEqual(b);
  });
  it("upcoming: only within the given window, sorted", () => {
    const soon = block({ id: "soon", startAtMs: T0 + HOUR, endAtMs: T0 + 2 * HOUR });
    const far = block({ id: "far", startAtMs: T0 + 100 * HOUR, endAtMs: T0 + 101 * HOUR });
    const result = listUpcomingScheduleBlocks([far, soon], "channel-main", T0, 10 * HOUR);
    expect(result.map((x) => x.id)).toEqual(["soon"]);
  });
});

describe("resolveChannelTrackBroadcastWithSchedule -- RADIO-04 priority", () => {
  it("BEFORE the scheduled window: normal Channel rotation, untouched", async () => {
    const r = repos({ blocks: [block()] });
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0, ...r });
    expect(result).toMatchObject({ status: "on-air", programId: "program-rotation", trackId: "rot0" });
  });

  it("DURING the scheduled window: the scheduled Program wins", async () => {
    const r = repos({ blocks: [block()] }); // block: T0+1h .. T0+3h, programId program-scheduled
    // 15 minutes into the window -- well inside the first (1800s) track.
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + HOUR + 900_000, ...r });
    expect(result).toMatchObject({ status: "on-air", programId: "program-scheduled", trackId: "sched0", trackOffsetSeconds: 900 });
  });

  it("AFTER the scheduled window: rejoins normal Channel rotation automatically, no special-cased logic needed", async () => {
    const r = repos({ blocks: [block()] }); // ends T0+3h
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + 4 * HOUR, ...r });
    expect(result).toMatchObject({ status: "on-air", programId: "program-rotation" });
  });

  it("never calls anything but getRadioChannel/listRadioPrograms -- structurally cannot mutate Channel rotation (the injected repository type has no update method at all)", async () => {
    const r = repos({ blocks: [block()] });
    await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + HOUR + 900_000, ...r });
    // The channel repository type this module accepts (Pick<RadioChannelRepository, "getRadioChannel">)
    // structurally cannot call updateRadioChannel -- it doesn't exist on
    // the type. getRadioChannel IS called once here, for the best-effort
    // nextProgramId lookup (resolveChannelTrackBroadcast at the window's
    // own endAtMs) -- a read, never a write; anchorAtMs is never touched.
    expect(r.radioChannelRepository.getRadioChannel).toHaveBeenCalledTimes(1);
  });

  it("loops a scheduled Program shorter than its own window (the 'one 6-8 hour Program repeatedly' bootstrap case)", async () => {
    // Program is 3600s (1hr); block is T0..T0+4h -- 4 full loops fit.
    const longBlock = block({ startAtMs: T0, endAtMs: T0 + 4 * HOUR, programId: "program-scheduled" });
    const r = repos({ blocks: [longBlock] });
    // At T0 + 3h30m, elapsed=12600s, program duration=3600s -> cycleIndex=3, offset=1800s -> second track.
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + 3.5 * HOUR, ...r });
    expect(result).toMatchObject({ status: "on-air", programId: "program-scheduled", trackId: "sched1", cycleIndex: 3 });
  });

  it("scheduled Program references a Program id that doesn't exist -- fails closed, never silently falls back to rotation", async () => {
    const r = repos({ blocks: [block({ programId: "does-not-exist" })] });
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + 2 * HOUR, ...r });
    expect(result).toEqual({ status: "program-not-found", channelId: "channel-main", programId: "does-not-exist" });
  });

  it("scheduled Program's manifest fetch fails -- fails closed with package-unavailable, never silently falls back to rotation", async () => {
    const r = repos({ blocks: [block()], fetchManifestImpl: async () => { throw new Error("network down"); } });
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + 2 * HOUR, ...r });
    expect(result).toMatchObject({ status: "package-unavailable", programId: "program-scheduled" });
  });

  it("passes through channel-not-found/inactive/before-start unchanged when no block is active (identical to resolveChannelTrackBroadcast alone)", async () => {
    const r = repos({ blocks: [], channelValue: null });
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0, ...r });
    expect(result).toEqual({ status: "channel-not-found", channelId: "channel-main" });
  });

  it("Channel anchorAtMs remains byte-identical before, during, and after a scheduled window -- never shifted, restarted, or mutated", async () => {
    const fixedChannel = channel({ rotation: { anchorAtMs: T0 - 5 * HOUR, programIds: ["program-rotation"] } });
    const r = repos({ blocks: [block()], channelValue: fixedChannel });
    await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0, ...r }); // before
    await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + HOUR + 900_000, ...r }); // during
    await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + 4 * HOUR, ...r }); // after
    // Same object reference returned by the fake repository every call --
    // this module never constructs a patched/updated RadioChannel, and
    // never calls any write method (the injected type has none).
    expect(fixedChannel.rotation.anchorAtMs).toBe(T0 - 5 * HOUR);
  });

  it("nextProgramId reflects what normal rotation resolves to right as the scheduled window ends", async () => {
    const r = repos({ blocks: [block()] });
    const result = await resolveChannelTrackBroadcastWithSchedule({ channelId: "channel-main", nowMs: T0 + 1.5 * HOUR, ...r });
    if (result.status === "on-air") expect(result.nextProgramId).toBe("program-rotation");
  });
});
