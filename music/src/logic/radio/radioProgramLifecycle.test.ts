import { describe, it, expect } from "vitest";
import { findProgramsForStation, planProgramLifecycleAction, findConflictingProgramForUpdate } from "./radioProgramLifecycle";
import type { RadioProgramSummary } from "@studiorich/member-identity";

function program(overrides: Partial<RadioProgramSummary> = {}): RadioProgramSummary {
  return {
    id: "radprogram_a",
    title: "Soft Motion Radio",
    manifestBaseUrl: "https://radio.studiorich.tv/radio/soft-motion-radio/v1/",
    trackCount: 11,
    totalDurationSeconds: 1546.6,
    stationId: "radplaylist_soft_motion",
    bundleVersion: 1,
    ...overrides,
  };
}

describe("findProgramsForStation", () => {
  it("matches only Programs whose stationId equals the given RadioPlaylist id", () => {
    const p1 = program({ id: "a", stationId: "radplaylist_1" });
    const p2 = program({ id: "b", stationId: "radplaylist_2" });
    expect(findProgramsForStation([p1, p2], "radplaylist_1")).toEqual([p1]);
  });

  it("never matches a legacy Program with no stationId at all", () => {
    const legacy = program({ id: "legacy", stationId: undefined });
    expect(findProgramsForStation([legacy], "radplaylist_1")).toEqual([]);
  });
});

describe("planProgramLifecycleAction -- RADIO-03 (batch 0929-5)", () => {
  it("1. no existing Program for this station -> create (a Program can initially reference Package v1 via the existing create path)", () => {
    expect(planProgramLifecycleAction([], 1)).toEqual({ kind: "create" });
  });

  it("Program already at the latest export's version -> up_to_date, no action offered", () => {
    const p = program({ bundleVersion: 2 });
    expect(planProgramLifecycleAction([p], 2)).toEqual({ kind: "up_to_date", program: p });
  });

  it("3. Program behind the latest export's version -> update_available, referencing the SAME Program (programId preserved by construction -- no new Program is ever planned)", () => {
    const p = program({ id: "radprogram_stable", bundleVersion: 1 });
    const plan = planProgramLifecycleAction([p], 2);
    expect(plan).toEqual({ kind: "update_available", program: p });
    if (plan.kind === "update_available") {
      expect(plan.program.id).toBe("radprogram_stable");
    }
  });

  it("more than one Program already references this station -> ambiguous, operator must resolve which one (never silently picks one)", () => {
    const p1 = program({ id: "a" });
    const p2 = program({ id: "b" });
    const plan = planProgramLifecycleAction([p1, p2], 2);
    expect(plan.kind).toBe("ambiguous");
    if (plan.kind === "ambiguous") expect(plan.programs).toEqual([p1, p2]);
  });
});

describe("findConflictingProgramForUpdate -- collision guard for the update path", () => {
  it("returns null when no other Program already claims the target package version", () => {
    const target = program({ id: "target", bundleVersion: 1 });
    expect(findConflictingProgramForUpdate([target], "target", "radplaylist_soft_motion", 2)).toBeNull();
  });

  it("7. fails closed: detects a DIFFERENT Program already claiming the exact target {stationId, bundleVersion}", () => {
    const target = program({ id: "target", bundleVersion: 1 });
    const other = program({ id: "other", bundleVersion: 2 });
    const conflict = findConflictingProgramForUpdate([target, other], "target", "radplaylist_soft_motion", 2);
    expect(conflict?.id).toBe("other");
  });

  it("never reports the Program being updated as its own conflict", () => {
    const target = program({ id: "target", bundleVersion: 1 });
    // target itself already "claims" v1 -- updating IT to v1 (a no-op) must not self-conflict.
    expect(findConflictingProgramForUpdate([target], "target", "radplaylist_soft_motion", 1)).toBeNull();
  });
});
