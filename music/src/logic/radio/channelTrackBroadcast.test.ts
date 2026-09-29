import { describe, expect, it, vi } from "vitest";
import { resolveChannelTrackBroadcast } from "./channelTrackBroadcast";
import type { EventRadioRepository, RadioChannel, RadioChannelRepository, RadioProgramSummary } from "@studiorich/member-identity";
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function program(overrides: Partial<RadioProgramSummary> = {}): RadioProgramSummary {
  return { id: "program-a", title: "Program A", manifestBaseUrl: "/radio-web-export/program-a/v1/", trackCount: 2, totalDurationSeconds: 3600, ...overrides };
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

function manifest(entries: RadioWebManifest["entries"]): RadioWebManifest {
  return {
    schemaVersion: "1.0.0", stationId: "program-a", bundleVersion: 1, title: "Program A",
    entries, totalDurationSeconds: entries.reduce((s, e) => s + e.durationSeconds, 0),
    totalByteSize: 0, createdAt: new Date(0).toISOString(), performanceAssets: [],
  };
}

function entry(overrides: Partial<RadioWebManifest["entries"][number]> = {}) {
  return { radioTrackId: "t0", packageVersion: 1, audioUrl: "audio/t0.opus", durationSeconds: 1800, byteSize: 100, sha256: "x", title: "Track 0", artist: "StudioRich", ...overrides };
}

function repos(channelValue: RadioChannel | null, programs: readonly RadioProgramSummary[], fetchManifestImpl: (url: string) => Promise<RadioWebManifest>) {
  return {
    radioChannelRepository: { getRadioChannel: vi.fn(async () => channelValue) } as unknown as Pick<RadioChannelRepository, "getRadioChannel">,
    eventRadioRepository: { listRadioPrograms: vi.fn(async () => programs) } as unknown as Pick<EventRadioRepository, "listRadioPrograms">,
    fetchManifest: vi.fn(fetchManifestImpl),
  };
}

const TWO_TRACK_MANIFEST = manifest([
  entry({ radioTrackId: "t0", durationSeconds: 1800, audioUrl: "audio/t0.opus" }),
  entry({ radioTrackId: "t1", durationSeconds: 1800, audioUrl: "audio/t1.opus" }),
]);

describe("resolveChannelTrackBroadcast -- upstream passthrough (Channel clock states)", () => {
  it("passes through channel-not-found unchanged", async () => {
    const r = repos(null, [], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0, ...r });
    expect(result).toEqual({ status: "channel-not-found", channelId: "channel-main" });
    expect(r.fetchManifest).not.toHaveBeenCalled();
  });

  it("passes through channel-inactive unchanged, never fetching a manifest", async () => {
    const r = repos(channel({ status: "inactive" }), [program()], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0, ...r });
    expect(result).toEqual({ status: "channel-inactive", channelId: "channel-main" });
    expect(r.fetchManifest).not.toHaveBeenCalled();
  });

  it("passes through before-start unchanged", async () => {
    const r = repos(channel(), [program()], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 - HOUR, ...r });
    expect(result).toEqual({ status: "before-start", channelId: "channel-main", startsInSeconds: 3600 });
    expect(r.fetchManifest).not.toHaveBeenCalled();
  });

  it("passes through hydration-failed unchanged", async () => {
    const r = repos(channel(), [], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0, ...r });
    expect(result).toEqual({ status: "hydration-failed", channelId: "channel-main", reason: "missing-program", programId: "program-a" });
  });
});

describe("resolveChannelTrackBroadcast -- Program/manifest layer failures", () => {
  it("returns package-unavailable on a manifest fetch failure, without altering which Program owns airtime", async () => {
    const r = repos(channel(), [program()], async () => { throw new Error("network down"); });
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0, ...r });
    expect(result).toEqual({ status: "package-unavailable", channelId: "channel-main", programId: "program-a", message: "network down" });
  });

  it("returns invalid-manifest for an empty manifest", async () => {
    const r = repos(channel(), [program()], async () => manifest([]));
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0, ...r });
    expect(result).toEqual({ status: "invalid-manifest", channelId: "channel-main", programId: "program-a" });
  });
});

describe("resolveChannelTrackBroadcast -- on-air resolution", () => {
  it("resolves Channel -> Program -> exact track + offset", async () => {
    const r = repos(channel(), [program()], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 900_000, ...r }); // 900s in
    expect(result).toMatchObject({
      status: "on-air", channelId: "channel-main", programId: "program-a",
      programOffsetSeconds: 900, trackId: "t0", trackOffsetSeconds: 900, trackDurationSeconds: 1800,
    });
  });

  it("resolves the exact track boundary within a Program", async () => {
    const r = repos(channel(), [program()], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 1800_000, ...r }); // exactly 1800s in -> track boundary
    expect(result).toMatchObject({ status: "on-air", trackId: "t1", trackOffsetSeconds: 0 });
  });

  it("resolves a Program boundary correctly across a multi-Program Channel", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-a", "program-b"] } });
    const progB = program({ id: "program-b", manifestBaseUrl: "/radio-web-export/program-b/v1/" });
    const manifestB = manifest([entry({ radioTrackId: "b0", durationSeconds: 3600 })]);
    const r = repos(c, [program(), progB], async (url) => (url.includes("program-b") ? manifestB : TWO_TRACK_MANIFEST));
    // program-a is 3600s (1hr); exactly at the boundary we should be on program-b, track b0, offset 0.
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + HOUR, ...r });
    expect(result).toMatchObject({ status: "on-air", programId: "program-b", trackId: "b0", trackOffsetSeconds: 0 });
  });

  it("Batch 02S: exposes manifestBaseUrl + audioUrl on the on-air result, matching the fetched manifest, without a second fetch", async () => {
    const r = repos(channel(), [program()], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 900_000, ...r });
    expect(result).toMatchObject({ status: "on-air", manifestBaseUrl: "/radio-web-export/program-a/v1/", audioUrl: "audio/t0.opus" });
    expect(r.fetchManifest).toHaveBeenCalledTimes(1);
  });

  it("Batch 02S: audioUrl matches the RESOLVED track, not always the first entry", async () => {
    const r = repos(channel(), [program()], async () => TWO_TRACK_MANIFEST);
    const result = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 1800_000, ...r }); // -> t1
    expect(result).toMatchObject({ status: "on-air", trackId: "t1", audioUrl: "audio/t1.opus" });
  });
});

describe("resolveChannelTrackBroadcast -- RADIO-03 (batch 0929-5): Program Package-version adoption is picked up automatically", () => {
  it("6. a Program's catalog record changing (simulating updateRadioProgram v1 -> v2) is reflected by the very next resolution call, with no other propagation step", async () => {
    // Two distinct catalog snapshots, same programId -- exactly what
    // listRadioPrograms() returns before vs. after a real updateRadioProgram
    // call changes this Program's manifestBaseUrl/bundleVersion in place.
    let currentPrograms: readonly RadioProgramSummary[] = [program({ manifestBaseUrl: "/radio-web-export/program-a/v1/" })];
    const manifestV1 = manifest([entry({ radioTrackId: "t0-v1", durationSeconds: 3600, audioUrl: "audio/t0-v1.opus" })]);
    const manifestV2 = manifest([entry({ radioTrackId: "t0-v2", durationSeconds: 3600, audioUrl: "audio/t0-v2.opus" })]);
    const r = {
      radioChannelRepository: { getRadioChannel: vi.fn(async () => channel()) } as unknown as Pick<RadioChannelRepository, "getRadioChannel">,
      eventRadioRepository: { listRadioPrograms: vi.fn(async () => currentPrograms) } as unknown as Pick<EventRadioRepository, "listRadioPrograms">,
      fetchManifest: vi.fn(async (url: string) => (url.includes("v2") ? manifestV2 : manifestV1)),
    };

    const before = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0, ...r });
    expect(before).toMatchObject({ status: "on-air", manifestBaseUrl: "/radio-web-export/program-a/v1/", trackId: "t0-v1" });

    // Simulate the update: same programId, new Package reference -- no
    // Channel/rotation change, no second Program created.
    currentPrograms = [program({ manifestBaseUrl: "/radio-web-export/program-a/v2/", bundleVersion: 2 })];

    const after = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0, ...r });
    expect(after).toMatchObject({ status: "on-air", programId: "program-a", manifestBaseUrl: "/radio-web-export/program-a/v2/", trackId: "t0-v2" });
  });
});

describe("resolveChannelTrackBroadcast -- synchronization invariant", () => {
  it("deterministic: identical inputs produce identical results", async () => {
    const r = repos(channel(), [program()], async () => TWO_TRACK_MANIFEST);
    const first = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 900_000, ...r });
    const second = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 900_000, ...r });
    expect(first).toEqual(second);
  });

  it("just-before vs exactly-on a Program boundary resolve to the correct respective Program/track with no shared mutable state", async () => {
    const c = channel({ rotation: { anchorAtMs: T0, programIds: ["program-a", "program-b"] } });
    const progB = program({ id: "program-b", manifestBaseUrl: "/radio-web-export/program-b/v1/" });
    const manifestB = manifest([entry({ radioTrackId: "b0", durationSeconds: 3600 })]);
    const r = repos(c, [program(), progB], async (url) => (url.includes("program-b") ? manifestB : TWO_TRACK_MANIFEST));

    const justBefore = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + HOUR - 1000, ...r });
    const atBoundary = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + HOUR, ...r });

    expect(justBefore).toMatchObject({ status: "on-air", programId: "program-a", trackId: "t1" });
    expect(atBoundary).toMatchObject({ status: "on-air", programId: "program-b", trackId: "b0" });
  });

  it("just-before vs exactly-on a TRACK boundary within the same Program resolve correctly", async () => {
    const r = repos(channel(), [program()], async () => TWO_TRACK_MANIFEST);
    const justBefore = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 1800_000 - 1000, ...r });
    const atBoundary = await resolveChannelTrackBroadcast({ channelId: "channel-main", nowMs: T0 + 1800_000, ...r });
    expect(justBefore).toMatchObject({ status: "on-air", trackId: "t0" });
    expect(atBoundary).toMatchObject({ status: "on-air", trackId: "t1", trackOffsetSeconds: 0 });
  });
});
