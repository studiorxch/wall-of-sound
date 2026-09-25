import { describe, expect, it } from "vitest";
import {
  addProgramToRotation,
  removeProgramFromRotation,
  moveProgramUp,
  moveProgramDown,
  computeRotationLengthSeconds,
  buildSaveRotationUpdate,
  buildStartRestartRotationUpdate,
  buildActivateChannelUpdate,
  buildDeactivateChannelUpdate,
  buildRotationDisplayEntries,
} from "./channelRotationEditorState";
import type { RadioProgramSummary } from "@studiorich/member-identity";

function program(overrides: Partial<RadioProgramSummary> = {}): RadioProgramSummary {
  return { id: "a", title: "Program A", manifestBaseUrl: "/x/", trackCount: 1, totalDurationSeconds: 3600, ...overrides };
}

describe("addProgramToRotation", () => {
  it("adds a new Program to the end", () => {
    expect(addProgramToRotation(["a"], "b")).toEqual({ ok: true, programIds: ["a", "b"] });
  });

  it("rejects a duplicate Program ID", () => {
    expect(addProgramToRotation(["a", "b"], "a")).toEqual({ ok: false, reason: "duplicate-program" });
  });
});

describe("removeProgramFromRotation", () => {
  it("removes a Program", () => {
    expect(removeProgramFromRotation(["a", "b", "c"], "b")).toEqual({ ok: true, programIds: ["a", "c"] });
  });

  it("refuses to remove the final remaining Program", () => {
    expect(removeProgramFromRotation(["a"], "a")).toEqual({ ok: false, reason: "cannot-remove-last-program" });
  });
});

describe("moveProgramUp / moveProgramDown", () => {
  it("moves a Program up", () => {
    expect(moveProgramUp(["a", "b", "c"], 1)).toEqual({ programIds: ["b", "a", "c"], moved: true });
  });

  it("moves a Program down", () => {
    expect(moveProgramDown(["a", "b", "c"], 1)).toEqual({ programIds: ["a", "c", "b"], moved: true });
  });

  it("is a no-op moving the first entry up (boundary)", () => {
    expect(moveProgramUp(["a", "b", "c"], 0)).toEqual({ programIds: ["a", "b", "c"], moved: false });
  });

  it("is a no-op moving the last entry down (boundary)", () => {
    expect(moveProgramDown(["a", "b", "c"], 2)).toEqual({ programIds: ["a", "b", "c"], moved: false });
  });
});

describe("computeRotationLengthSeconds", () => {
  it("sums authoritative durations in persisted order", () => {
    const programsById = new Map([
      ["a", program({ id: "a", totalDurationSeconds: 3600 })],
      ["b", program({ id: "b", totalDurationSeconds: 1800 })],
    ]);
    expect(computeRotationLengthSeconds(["a", "b"], programsById)).toBe(5400);
  });

  it("treats a missing catalog entry as contributing 0 rather than throwing", () => {
    expect(computeRotationLengthSeconds(["a", "unknown"], new Map([["a", program({ totalDurationSeconds: 100 })]]))).toBe(100);
  });
});

describe("buildSaveRotationUpdate -- preserves anchor", () => {
  it("carries the CURRENT anchor forward unchanged alongside the new ordering", () => {
    const result = buildSaveRotationUpdate("channel-main", ["b", "a"], 1_700_000_000_000);
    expect(result).toEqual({ channelId: "channel-main", rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["b", "a"] } });
  });

  it("never includes a status field -- Save Rotation never changes activation state", () => {
    const result = buildSaveRotationUpdate("channel-main", ["a"], 1_700_000_000_000);
    expect(result).not.toHaveProperty("status");
  });
});

describe("buildStartRestartRotationUpdate -- establishes a new anchor", () => {
  it("preserves the persisted Program ordering", () => {
    const result = buildStartRestartRotationUpdate("channel-main", ["c", "a", "b"], 1_800_000_000_000);
    expect(result.rotation!.programIds).toEqual(["c", "a", "b"]);
  });

  it("sets anchorAtMs to the supplied nowMs", () => {
    const result = buildStartRestartRotationUpdate("channel-main", ["a"], 1_800_000_000_000);
    expect(result.rotation!.anchorAtMs).toBe(1_800_000_000_000);
  });

  it("atomically activates the Channel", () => {
    const result = buildStartRestartRotationUpdate("channel-main", ["a"], 1_800_000_000_000);
    expect(result.status).toBe("active");
  });

  it("never writes to eventProgram/current -- the returned payload is scoped entirely to a RadioChannel update", () => {
    const result = buildStartRestartRotationUpdate("channel-main", ["a"], 1_800_000_000_000);
    expect(Object.keys(result).sort()).toEqual(["channelId", "rotation", "status"]);
  });
});

describe("buildActivateChannelUpdate / buildDeactivateChannelUpdate -- preserve anchor and rotation", () => {
  it("activate carries no rotation field at all (nothing to alter)", () => {
    const result = buildActivateChannelUpdate("channel-main");
    expect(result).toEqual({ channelId: "channel-main", status: "active" });
    expect(result).not.toHaveProperty("rotation");
  });

  it("deactivate carries no rotation field at all", () => {
    const result = buildDeactivateChannelUpdate("channel-main");
    expect(result).toEqual({ channelId: "channel-main", status: "inactive" });
    expect(result).not.toHaveProperty("rotation");
  });
});

describe("buildRotationDisplayEntries", () => {
  it("resolves titles from the catalog in persisted order", () => {
    const programsById = new Map([
      ["b", program({ id: "b", title: "Basement" })],
      ["a", program({ id: "a", title: "Night Transmission" })],
    ]);
    const result = buildRotationDisplayEntries(["a", "b"], programsById);
    expect(result.map((e) => e.title)).toEqual(["Night Transmission", "Basement"]);
  });

  it("falls back to the raw id when a Program is missing from the catalog", () => {
    const result = buildRotationDisplayEntries(["missing"], new Map());
    expect(result).toEqual([{ programId: "missing", title: "missing", totalDurationSeconds: null }]);
  });
});
