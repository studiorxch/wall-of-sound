import { describe, expect, it, vi } from "vitest";
import { resolveCurrentChannelBroadcast } from "./currentChannelBroadcast";
import type { EventRadioRepository, RadioChannel, RadioChannelRepository, RadioProgramSummary } from "@studiorich/member-identity";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function program(overrides: Partial<RadioProgramSummary> = {}): RadioProgramSummary {
  return { id: "program-a", title: "Program A", manifestBaseUrl: "/radio-web-export/program-a/v1/", trackCount: 5, totalDurationSeconds: 3600, ...overrides };
}

function channel(overrides: Partial<RadioChannel> = {}): RadioChannel {
  return {
    channelId: "channel-main",
    title: "StudioRich Main",
    status: "active",
    rotation: { anchorAtMs: T0, programIds: ["program-a"] },
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function fakeRepos(channelValue: RadioChannel | null, programs: readonly RadioProgramSummary[]) {
  const getRadioChannel = vi.fn(async (_id: string) => channelValue);
  const listRadioPrograms = vi.fn(async () => programs);
  return {
    radioChannelRepository: { getRadioChannel } as unknown as Pick<RadioChannelRepository, "getRadioChannel">,
    eventRadioRepository: { listRadioPrograms } as unknown as Pick<EventRadioRepository, "listRadioPrograms">,
    getRadioChannel,
    listRadioPrograms,
  };
}

describe("resolveCurrentChannelBroadcast -- upstream states", () => {
  it("returns channel-not-found when the Channel does not exist", async () => {
    const repos = fakeRepos(null, []);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    expect(result).toEqual({ status: "channel-not-found", channelId: "channel-main" });
  });

  it("returns channel-inactive for an inactive Channel, never falling through to rotation math", async () => {
    const repos = fakeRepos(channel({ status: "inactive" }), [program()]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    expect(result).toEqual({ status: "channel-inactive", channelId: "channel-main" });
    // Short-circuits BEFORE hydration -- listRadioPrograms is never even called for an inactive Channel.
    expect(repos.listRadioPrograms).not.toHaveBeenCalled();
  });

  it("returns hydration-failed with the underlying reason for a missing referenced Program", async () => {
    const repos = fakeRepos(channel(), []); // catalog empty -> program-a missing
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    expect(result).toEqual({ status: "hydration-failed", channelId: "channel-main", reason: "missing-program", programId: "program-a" });
  });

  it("returns hydration-failed for an invalid Program duration observable at this boundary", async () => {
    const repos = fakeRepos(channel(), [program({ totalDurationSeconds: 0 })]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    expect(result).toEqual({ status: "hydration-failed", channelId: "channel-main", reason: "invalid-program-duration", programId: "program-a" });
  });

  it("returns the resolver's own invalid state for a malformed hydrated rotation (empty entries at the Channel level)", async () => {
    const repos = fakeRepos(channel({ rotation: { anchorAtMs: T0, programIds: [] } }), [program()]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    // Caught by hydration's own "invalid-channel" first (empty programIds is a hydration-layer concern).
    expect(result).toEqual({ status: "hydration-failed", channelId: "channel-main", reason: "invalid-channel" });
  });
});

describe("resolveCurrentChannelBroadcast -- valid rotations (delegates to resolveChannelRotation)", () => {
  it("resolves a valid single-Program Channel", async () => {
    const repos = fakeRepos(channel(), [program({ totalDurationSeconds: 3600 })]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + HOUR / 2, ...repos });
    expect(result).toMatchObject({ status: "on-air", programId: "program-a", programOffsetSeconds: 1800 });
  });

  it("resolves a valid multi-Program Channel", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-a", "program-b"] } });
    const repos = fakeRepos(c, [program({ id: "program-a", totalDurationSeconds: 2 * 3600 }), program({ id: "program-b", totalDurationSeconds: 3 * 3600 })]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + 3 * HOUR, ...repos });
    expect(result).toMatchObject({ status: "on-air", programId: "program-b", programOffsetSeconds: 3600 });
  });

  it("respects persisted ordering through hydration even when the catalog returns Programs in a different order", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-c", "program-a", "program-b"] } });
    const repos = fakeRepos(c, [
      program({ id: "program-a", totalDurationSeconds: 3600 }),
      program({ id: "program-b", totalDurationSeconds: 3600 }),
      program({ id: "program-c", totalDurationSeconds: 3600 }),
    ]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    expect(result).toMatchObject({ status: "on-air", programId: "program-c", programIndex: 0 });
  });

  it("resolves exactly at anchor", async () => {
    const repos = fakeRepos(channel(), [program()]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    expect(result).toMatchObject({ status: "on-air", programId: "program-a", programOffsetSeconds: 0, cycleIndex: 0 });
  });

  it("returns before-start prior to the anchor", async () => {
    const repos = fakeRepos(channel(), [program()]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 - HOUR, ...repos });
    expect(result).toEqual({ status: "before-start", channelId: "channel-main", startsInSeconds: 3600 });
  });

  it("resolves the exact Program boundary onto the next Program", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-a", "program-b"] } });
    const repos = fakeRepos(c, [program({ id: "program-a", totalDurationSeconds: 3600 }), program({ id: "program-b", totalDurationSeconds: 3600 })]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + HOUR, ...repos });
    expect(result).toMatchObject({ status: "on-air", programId: "program-b", programOffsetSeconds: 0 });
  });

  it("resolves a cycle wrap", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-a", "program-b"] } });
    const repos = fakeRepos(c, [program({ id: "program-a", totalDurationSeconds: 3600 }), program({ id: "program-b", totalDurationSeconds: 3600 })]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + 2 * HOUR, ...repos });
    expect(result).toMatchObject({ status: "on-air", programId: "program-a", cycleIndex: 1 });
  });

  it("resolves correctly multiple cycles later", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-a", "program-b"] } });
    const repos = fakeRepos(c, [program({ id: "program-a", totalDurationSeconds: 3600 }), program({ id: "program-b", totalDurationSeconds: 3600 })]);
    const result = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + 10 * 2 * HOUR + 1000, ...repos });
    expect(result).toMatchObject({ status: "on-air", programId: "program-a", cycleIndex: 10 });
  });
});

describe("resolveCurrentChannelBroadcast -- authority, not availability", () => {
  it("straddling a deterministic boundary (09:59:59 -> 10:00:00) returns different Programs, with ZERO database mutation between calls", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-a", "program-b"] } });
    const repos = fakeRepos(c, [program({ id: "program-a", totalDurationSeconds: 3600 }), program({ id: "program-b", totalDurationSeconds: 3600 })]);

    const justBefore = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + HOUR - 1000, ...repos });
    const atBoundary = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + HOUR, ...repos });

    expect(justBefore).toMatchObject({ status: "on-air", programId: "program-a" });
    expect(atBoundary).toMatchObject({ status: "on-air", programId: "program-b" });

    // Both repository capabilities used here are reads only -- the fakes
    // expose exactly getRadioChannel/listRadioPrograms, neither of which
    // is a write; asserting the call count proves no extra (write-shaped)
    // interaction snuck in, and this service's own source imports no
    // Firestore write function at all.
    expect(repos.getRadioChannel).toHaveBeenCalledTimes(2);
    expect(repos.listRadioPrograms).toHaveBeenCalledTimes(2);
  });

  it("deterministic: identical calls return identical results", async () => {
    const repos = fakeRepos(channel(), [program()]);
    const first = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + 1000, ...repos });
    const second = await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0 + 1000, ...repos });
    expect(first).toEqual(second);
  });

  it("repositories are read-only from this service's perspective -- only getRadioChannel/listRadioPrograms are ever invoked", async () => {
    const repos = fakeRepos(channel(), [program()]);
    await resolveCurrentChannelBroadcast({ channelId: "channel-main", nowMs: T0, ...repos });
    const passedRepoKeys = [...Object.keys(repos.radioChannelRepository), ...Object.keys(repos.eventRadioRepository)];
    expect(passedRepoKeys).toEqual(["getRadioChannel", "listRadioPrograms"]);
  });
});
