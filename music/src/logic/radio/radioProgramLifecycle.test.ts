import { describe, it, expect, vi } from "vitest";
import { findProgramsForStation, planProgramLifecycleAction, findConflictingProgramForUpdate, listSchedulablePlaylists, resolveProgramForSchedule } from "./radioProgramLifecycle";
import type { CreateRadioProgramInput, EventRadioRepository, RadioProgramSummary, UpdateRadioProgramInput } from "@studiorich/member-identity";
import type { RadioWebExportRecord } from "../../data/radioWebBundleTypes";

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

function exportRecord(overrides: Partial<RadioWebExportRecord> = {}): RadioWebExportRecord {
  return {
    id: "radweb_1", radioPlaylistId: "radplaylist_1", slug: "soft-motion-radio", bundleVersion: 1,
    exportedAt: "2026-09-29T00:00:00.000Z", contentSignature: "sig", totalByteSize: 1000,
    totalDurationSeconds: 1546.6, entryCount: 11, validation: { ok: true, checkedAt: "2026-09-29T00:00:00.000Z" },
    exportPath: "/radio-web-export/soft-motion-radio/v1/",
    ...overrides,
  };
}

describe("listSchedulablePlaylists -- RADIO-04", () => {
  it("includes a playlist only once it has BOTH a local export AND a matching Sites publication", () => {
    const playlists = [{ id: "radplaylist_1", title: "Soft Motion Radio" }];
    const exports = [exportRecord()];
    const sitesPubs = [{ radioPlaylistId: "radplaylist_1", slug: "soft-motion-radio", bundleVersion: 1 }];
    const result = listSchedulablePlaylists(playlists, exports, sitesPubs);
    expect(result).toEqual([{ radioPlaylistId: "radplaylist_1", title: "Soft Motion Radio", latestExport: exports[0] }]);
  });

  it("excludes a playlist with a local export but NO matching Sites publication -- never offers an unpublished package", () => {
    const playlists = [{ id: "radplaylist_1", title: "Soft Motion Radio" }];
    const exports = [exportRecord()];
    const result = listSchedulablePlaylists(playlists, exports, []);
    expect(result).toEqual([]);
  });

  it("excludes a playlist with no export at all", () => {
    const playlists = [{ id: "radplaylist_1", title: "Soft Motion Radio" }];
    expect(listSchedulablePlaylists(playlists, [], [])).toEqual([]);
  });

  it("RADIO-04B: still schedulable using the newer PUBLISHED version when a later, never-republished local export also exists -- does not require republishing merely to satisfy the scheduler", () => {
    const playlists = [{ id: "radplaylist_1", title: "Soft Motion Radio" }];
    const v1 = exportRecord({ id: "radweb_1", bundleVersion: 1 });
    const v2 = exportRecord({ id: "radweb_2", bundleVersion: 2 });
    const sitesPubs = [{ radioPlaylistId: "radplaylist_1", slug: "soft-motion-radio", bundleVersion: 1 }];
    const result = listSchedulablePlaylists(playlists, [v1, v2], sitesPubs);
    expect(result).toEqual([{ radioPlaylistId: "radplaylist_1", title: "Soft Motion Radio", latestExport: v1 }]);
  });

  it("prefers the newest published version over an older one when both are Sites-published", () => {
    const playlists = [{ id: "radplaylist_1", title: "Soft Motion Radio" }];
    const v1 = exportRecord({ id: "radweb_1", bundleVersion: 1 });
    const v2 = exportRecord({ id: "radweb_2", bundleVersion: 2 });
    const sitesPubs = [
      { radioPlaylistId: "radplaylist_1", slug: "soft-motion-radio", bundleVersion: 1 },
      { radioPlaylistId: "radplaylist_1", slug: "soft-motion-radio", bundleVersion: 2 },
    ];
    const result = listSchedulablePlaylists(playlists, [v1, v2], sitesPubs);
    expect(result).toEqual([{ radioPlaylistId: "radplaylist_1", title: "Soft Motion Radio", latestExport: v2 }]);
  });

  it("excludes a playlist whose only export is a later, unpublished re-export with no published version at all", () => {
    const playlists = [{ id: "radplaylist_1", title: "Soft Motion Radio" }];
    const v1 = exportRecord({ id: "radweb_1", bundleVersion: 1 });
    const result = listSchedulablePlaylists(playlists, [v1], []);
    expect(result).toEqual([]);
  });
});

function fakeRepo(overrides: Partial<{ createRadioProgram: EventRadioRepository["createRadioProgram"]; updateRadioProgram: EventRadioRepository["updateRadioProgram"] }> = {}) {
  return {
    createRadioProgram: overrides.createRadioProgram ?? vi.fn(async (input: CreateRadioProgramInput) => ({ id: input.programId, title: input.title, manifestBaseUrl: input.manifestBaseUrl, trackCount: input.trackCount, totalDurationSeconds: input.totalDurationSeconds, stationId: input.stationId, bundleVersion: input.bundleVersion })),
    updateRadioProgram: overrides.updateRadioProgram ?? vi.fn(async (input: UpdateRadioProgramInput) => ({ id: input.programId, title: input.title, manifestBaseUrl: input.manifestBaseUrl, trackCount: input.trackCount, totalDurationSeconds: input.totalDurationSeconds, stationId: input.stationId, bundleVersion: input.bundleVersion })),
  };
}

describe("resolveProgramForSchedule -- RADIO-04 (the ONE place Program create/update happens for scheduling)", () => {
  const schedulable = { radioPlaylistId: "radplaylist_1", title: "Soft Motion Radio", latestExport: exportRecord({ bundleVersion: 2, entryCount: 11, totalDurationSeconds: 1546.6 }) };

  it("no existing Program for this station -> creates one via createRadioProgram, never updateRadioProgram", async () => {
    const repo = fakeRepo();
    const created = await resolveProgramForSchedule(repo, schedulable, []);
    expect(repo.createRadioProgram).toHaveBeenCalledTimes(1);
    expect(repo.updateRadioProgram).not.toHaveBeenCalled();
    expect(created.stationId).toBe("radplaylist_1");
    expect(created.bundleVersion).toBe(2);
  });

  it("an existing Program behind the latest version -> updates it in place, preserving programId, never creates a second Program", async () => {
    const existing = program({ id: "radprogram_stable", stationId: "radplaylist_1", bundleVersion: 1 });
    const repo = fakeRepo();
    const result = await resolveProgramForSchedule(repo, schedulable, [existing]);
    expect(repo.updateRadioProgram).toHaveBeenCalledTimes(1);
    expect(repo.createRadioProgram).not.toHaveBeenCalled();
    expect(result.id).toBe("radprogram_stable");
    expect(result.bundleVersion).toBe(2);
  });

  it("an existing Program already at the latest version -> reused as-is, no write at all", async () => {
    const existing = program({ id: "radprogram_stable", stationId: "radplaylist_1", bundleVersion: 2 });
    const repo = fakeRepo();
    const result = await resolveProgramForSchedule(repo, schedulable, [existing]);
    expect(repo.updateRadioProgram).not.toHaveBeenCalled();
    expect(repo.createRadioProgram).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });

  it("ambiguous (more than one Program for this station) without a preferredProgramId -> throws, never silently picks one", async () => {
    const a = program({ id: "a", stationId: "radplaylist_1" });
    const b = program({ id: "b", stationId: "radplaylist_1" });
    const repo = fakeRepo();
    await expect(resolveProgramForSchedule(repo, schedulable, [a, b])).rejects.toThrow("radio_program_ambiguous_for_station");
    expect(repo.createRadioProgram).not.toHaveBeenCalled();
    expect(repo.updateRadioProgram).not.toHaveBeenCalled();
  });

  it("ambiguous WITH an explicit preferredProgramId -> updates exactly that one", async () => {
    const a = program({ id: "a", stationId: "radplaylist_1" });
    const b = program({ id: "b", stationId: "radplaylist_1" });
    const repo = fakeRepo();
    const result = await resolveProgramForSchedule(repo, schedulable, [a, b], "b");
    expect(repo.updateRadioProgram).toHaveBeenCalledTimes(1);
    expect(result.id).toBe("b");
  });
});
