import { describe, expect, it } from "vitest";
import { hydrateChannelRotation, hydrateChannelRotationFromCatalog } from "./channelRotationHydration";
import type { EventRadioRepository, RadioChannel, RadioProgramSummary } from "@studiorich/member-identity";

function program(overrides: Partial<RadioProgramSummary> = {}): RadioProgramSummary {
  return { id: "program-a", title: "Program A", manifestBaseUrl: "/radio-web-export/program-a/v1/", trackCount: 5, totalDurationSeconds: 3600, ...overrides };
}

function channel(overrides: Partial<RadioChannel> = {}): RadioChannel {
  return {
    channelId: "channel-main",
    title: "StudioRich Main",
    status: "active",
    rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["program-a"] },
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

describe("hydrateChannelRotation -- success cases", () => {
  it("hydrates a single-Program rotation", () => {
    const programsById = new Map([["program-a", program()]]);
    const result = hydrateChannelRotation(channel(), programsById);
    expect(result).toEqual({
      status: "hydrated",
      rotation: { channelId: "channel-main", anchorAtMs: 1_700_000_000_000, entries: [{ programId: "program-a", durationSeconds: 3600 }] },
    });
  });

  it("hydrates a multi-Program rotation", () => {
    const programsById = new Map([
      ["program-a", program({ id: "program-a", totalDurationSeconds: 7200 })],
      ["program-b", program({ id: "program-b", totalDurationSeconds: 10800 })],
      ["program-c", program({ id: "program-c", totalDurationSeconds: 3600 })],
    ]);
    const c = channel({ rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["program-a", "program-b", "program-c"] } });
    const result = hydrateChannelRotation(c, programsById);
    expect(result).toEqual({
      status: "hydrated",
      rotation: {
        channelId: "channel-main",
        anchorAtMs: 1_700_000_000_000,
        entries: [
          { programId: "program-a", durationSeconds: 7200 },
          { programId: "program-b", durationSeconds: 10800 },
          { programId: "program-c", durationSeconds: 3600 },
        ],
      },
    });
  });

  it("preserves persisted programIds order exactly, regardless of Map/query return order", () => {
    // Map insertion order is deliberately NOT the same as the rotation order.
    const programsById = new Map([
      ["program-b", program({ id: "program-b", totalDurationSeconds: 200 })],
      ["program-a", program({ id: "program-a", totalDurationSeconds: 100 })],
      ["program-c", program({ id: "program-c", totalDurationSeconds: 300 })],
    ]);
    const c = channel({ rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["program-c", "program-a", "program-b"] } });
    const result = hydrateChannelRotation(c, programsById);
    if (result.status !== "hydrated") throw new Error("expected hydrated");
    expect(result.rotation.entries.map((e) => e.programId)).toEqual(["program-c", "program-a", "program-b"]);
  });

  it("preserves the exact channelId", () => {
    const programsById = new Map([["program-a", program()]]);
    const result = hydrateChannelRotation(channel({ channelId: "channel-secondary" }), programsById);
    if (result.status !== "hydrated") throw new Error("expected hydrated");
    expect(result.rotation.channelId).toBe("channel-secondary");
  });

  it("preserves the exact anchorAtMs", () => {
    const programsById = new Map([["program-a", program()]]);
    const result = hydrateChannelRotation(channel({ rotation: { anchorAtMs: 1_234_567_890, programIds: ["program-a"] } }), programsById);
    if (result.status !== "hydrated") throw new Error("expected hydrated");
    expect(result.rotation.anchorAtMs).toBe(1_234_567_890);
  });

  it("uses the authoritative RadioProgramSummary.totalDurationSeconds, never a hardcoded or derived value", () => {
    const programsById = new Map([["program-a", program({ totalDurationSeconds: 9999.5 })]]);
    const result = hydrateChannelRotation(channel(), programsById);
    if (result.status !== "hydrated") throw new Error("expected hydrated");
    expect(result.rotation.entries[0].durationSeconds).toBe(9999.5);
  });
});

describe("hydrateChannelRotation -- failure cases (all-or-nothing)", () => {
  it("rejects a missing referenced Program", () => {
    const programsById = new Map<string, RadioProgramSummary>();
    const result = hydrateChannelRotation(channel(), programsById);
    expect(result).toEqual({ status: "invalid", reason: "missing-program", programId: "program-a" });
  });

  it("rejects zero duration", () => {
    const programsById = new Map([["program-a", program({ totalDurationSeconds: 0 })]]);
    const result = hydrateChannelRotation(channel(), programsById);
    expect(result).toEqual({ status: "invalid", reason: "invalid-program-duration", programId: "program-a" });
  });

  it("rejects negative duration", () => {
    const programsById = new Map([["program-a", program({ totalDurationSeconds: -1 })]]);
    const result = hydrateChannelRotation(channel(), programsById);
    expect(result).toEqual({ status: "invalid", reason: "invalid-program-duration", programId: "program-a" });
  });

  it("rejects non-finite duration", () => {
    const programsById = new Map([["program-a", program({ totalDurationSeconds: Number.NaN })]]);
    const result = hydrateChannelRotation(channel(), programsById);
    expect(result).toEqual({ status: "invalid", reason: "invalid-program-duration", programId: "program-a" });
  });

  it("rejects duplicate Program identity in the rotation", () => {
    const programsById = new Map([["program-a", program()]]);
    const c = channel({ rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["program-a", "program-a"] } });
    const result = hydrateChannelRotation(c, programsById);
    expect(result).toEqual({ status: "invalid", reason: "duplicate-program", programId: "program-a" });
  });

  it("rejects a malformed Channel rotation (empty programIds)", () => {
    const result = hydrateChannelRotation(channel({ rotation: { anchorAtMs: 1_700_000_000_000, programIds: [] } }), new Map());
    expect(result).toEqual({ status: "invalid", reason: "invalid-channel" });
  });

  it("rejects a malformed Channel rotation (non-finite anchor)", () => {
    const result = hydrateChannelRotation(channel({ rotation: { anchorAtMs: Number.NaN, programIds: ["program-a"] } }), new Map([["program-a", program()]]));
    expect(result).toEqual({ status: "invalid", reason: "invalid-channel" });
  });

  it("one invalid Program invalidates the WHOLE hydration -- remaining valid Programs never close the gap", () => {
    const programsById = new Map([
      ["program-a", program({ id: "program-a", totalDurationSeconds: 3600 })],
      ["program-b", program({ id: "program-b", totalDurationSeconds: -1 })], // invalid
      ["program-c", program({ id: "program-c", totalDurationSeconds: 3600 })],
    ]);
    const c = channel({ rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["program-a", "program-b", "program-c"] } });
    const result = hydrateChannelRotation(c, programsById);
    expect(result.status).toBe("invalid");
    // program-c, which comes AFTER the bad entry, must never appear in any partial result.
    expect(result).not.toHaveProperty("rotation");
  });

  it("a missing Program in the middle of the rotation invalidates the whole hydration, not just that slot", () => {
    const programsById = new Map([
      ["program-a", program({ id: "program-a" })],
      ["program-c", program({ id: "program-c" })],
      // program-b deliberately absent
    ]);
    const c = channel({ rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["program-a", "program-b", "program-c"] } });
    const result = hydrateChannelRotation(c, programsById);
    expect(result).toEqual({ status: "invalid", reason: "missing-program", programId: "program-b" });
  });
});

describe("hydrateChannelRotation -- purity", () => {
  it("does not mutate the input Channel or the programsById map", () => {
    const c = channel();
    const programsById = new Map([["program-a", program()]]);
    const channelBefore = JSON.stringify(c);
    const mapSizeBefore = programsById.size;
    hydrateChannelRotation(c, programsById);
    expect(JSON.stringify(c)).toBe(channelBefore);
    expect(programsById.size).toBe(mapSizeBefore);
  });

  it("returns byte-identical results for repeated calls with identical inputs", () => {
    const c = channel();
    const programsById = new Map([["program-a", program()]]);
    const first = hydrateChannelRotation(c, programsById);
    const second = hydrateChannelRotation(c, programsById);
    expect(first).toEqual(second);
  });
});

describe("hydrateChannelRotationFromCatalog -- thin repository wrapper", () => {
  function fakeRepository(programs: readonly RadioProgramSummary[]): Pick<EventRadioRepository, "listRadioPrograms"> {
    return { listRadioPrograms: async () => programs };
  }

  it("hydrates using only listRadioPrograms() -- the existing, unbroadened repository API", async () => {
    const repo = fakeRepository([program({ id: "program-a", totalDurationSeconds: 1800 })]);
    const result = await hydrateChannelRotationFromCatalog(channel(), repo);
    expect(result).toEqual({
      status: "hydrated",
      rotation: { channelId: "channel-main", anchorAtMs: 1_700_000_000_000, entries: [{ programId: "program-a", durationSeconds: 1800 }] },
    });
  });

  it("surfaces missing-program when the catalog does not contain a referenced id", async () => {
    const repo = fakeRepository([]);
    const result = await hydrateChannelRotationFromCatalog(channel(), repo);
    expect(result).toEqual({ status: "invalid", reason: "missing-program", programId: "program-a" });
  });

  it(
    "documents a known limitation: a malformed Program document is indistinguishable, through the public listRadioPrograms() API, " +
      "from a missing one -- both surface as missing-program, since decodeRadioProgram already silently filters malformed docs " +
      "before this module ever sees them (closest observable boundary, per this batch's own test-scope note)",
    async () => {
      // Simulated at the closest boundary this module can actually observe:
      // a repository whose listRadioPrograms() has already dropped the
      // malformed doc, exactly as the real FirestoreEventRadioRepository does.
      const repo = fakeRepository([]); // the "malformed" program never appears here, by construction of the real API
      const result = await hydrateChannelRotationFromCatalog(channel(), repo);
      expect(result).toEqual({ status: "invalid", reason: "missing-program", programId: "program-a" });
    },
  );
});
