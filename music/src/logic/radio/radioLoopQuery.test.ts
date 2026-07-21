import { describe, it, expect } from "vitest";
import { searchWorkspaceRows, filterWorkspaceRows, sortWorkspaceRows, applyWorkspaceQuery, detectLegacyRoleIssues, withDetectedIssues } from "./radioLoopQuery";
import type { RadioLoopFilterState, RadioLoopSortState, RadioLoopWorkspaceRow } from "../../data/radioWorkspaceTypes";

function makeRow(overrides: Partial<RadioLoopWorkspaceRow> = {}): RadioLoopWorkspaceRow {
  return {
    radioLoopId: "rloop_000001",
    currentPackageVersion: 1,
    availableVersions: [1],
    status: "RADIO_READY",
    isActiveInManifest: true,
    workingTitle: "Foundation Loop",
    sourceTrackId: "track_a",
    sourceLoopId: "loop_a",
    source: { sourceTrackId: "track_a", sourceLoopId: "loop_a", resolved: true, displayName: "Some Track — Some Artist" },
    durationSeconds: 4,
    bpm: 120,
    roles: ["foundation"],
    familyIds: ["family-1"],
    energy: 0.5,
    stemStatus: "missing",
    publicUseApproved: true,
    packageValidationState: "valid",
    issues: [],
    ...overrides,
  };
}

describe("searchWorkspaceRows", () => {
  const rows = [
    makeRow({ radioLoopId: "rloop_000001", workingTitle: "Hypnotic Foundation" }),
    makeRow({ radioLoopId: "rloop_000002", workingTitle: "Rolling Motion", roles: ["motion"], familyIds: ["family-2"] }),
  ];

  it("returns everything for an empty search", () => {
    expect(searchWorkspaceRows(rows, "")).toHaveLength(2);
  });

  it("matches on radioLoopId, title, and role — case-insensitive", () => {
    expect(searchWorkspaceRows(rows, "rloop_000002")).toHaveLength(1);
    expect(searchWorkspaceRows(rows, "HYPNOTIC")).toHaveLength(1);
    expect(searchWorkspaceRows(rows, "motion")).toHaveLength(1);
  });

  // 0717C §3.4 — a legacy row can still carry a deprecated familyIds value
  // (read-compatibility), but it must never be searchable/surfaced.
  it("never matches on a legacy row's deprecated familyIds (removed in 0717C)", () => {
    expect(searchWorkspaceRows(rows, "family-2")).toHaveLength(0);
  });

  it("matches on source display name and source track/loop IDs", () => {
    const rowsWithSource = [makeRow({
      sourceTrackId: "track_x",
      sourceLoopId: "loop_x",
      source: { sourceTrackId: "track_x", sourceLoopId: "loop_x", resolved: true, displayName: "White Ropes — Soulphiction" },
    })];
    expect(searchWorkspaceRows(rowsWithSource, "soulphiction")).toHaveLength(1);
    expect(searchWorkspaceRows(rowsWithSource, "track_x")).toHaveLength(1);
  });
});

describe("filterWorkspaceRows", () => {
  const baseFilter: RadioLoopFilterState = { search: "", role: "all", status: "all", approval: "all", stemStatus: "all" };
  const rows = [
    makeRow({ radioLoopId: "rloop_000001", roles: ["foundation"], status: "RADIO_READY", publicUseApproved: true, stemStatus: "available" }),
    makeRow({ radioLoopId: "rloop_000002", roles: ["motion"], status: "RETIRED", publicUseApproved: false, stemStatus: "missing" }),
  ];

  it("passes everything through with no filters applied", () => {
    expect(filterWorkspaceRows(rows, baseFilter)).toHaveLength(2);
  });

  it("filters by role", () => {
    expect(filterWorkspaceRows(rows, { ...baseFilter, role: "motion" }).map((r) => r.radioLoopId)).toEqual(["rloop_000002"]);
  });

  it("filters by status", () => {
    expect(filterWorkspaceRows(rows, { ...baseFilter, status: "RETIRED" }).map((r) => r.radioLoopId)).toEqual(["rloop_000002"]);
  });

  it("filters by approval", () => {
    expect(filterWorkspaceRows(rows, { ...baseFilter, approval: "approved" }).map((r) => r.radioLoopId)).toEqual(["rloop_000001"]);
    expect(filterWorkspaceRows(rows, { ...baseFilter, approval: "unapproved" }).map((r) => r.radioLoopId)).toEqual(["rloop_000002"]);
  });

  it("filters by stem status", () => {
    expect(filterWorkspaceRows(rows, { ...baseFilter, stemStatus: "available" }).map((r) => r.radioLoopId)).toEqual(["rloop_000001"]);
  });
});

describe("sortWorkspaceRows", () => {
  const rows = [
    makeRow({ radioLoopId: "rloop_000003", bpm: 90 }),
    makeRow({ radioLoopId: "rloop_000001", bpm: 130 }),
    makeRow({ radioLoopId: "rloop_000002", bpm: 110 }),
  ];

  it("sorts ascending by the given key", () => {
    const sort: RadioLoopSortState = { key: "radioLoopId", direction: "asc" };
    expect(sortWorkspaceRows(rows, sort).map((r) => r.radioLoopId)).toEqual(["rloop_000001", "rloop_000002", "rloop_000003"]);
  });

  it("sorts descending when requested", () => {
    const sort: RadioLoopSortState = { key: "bpm", direction: "desc" };
    expect(sortWorkspaceRows(rows, sort).map((r) => r.bpm)).toEqual([130, 110, 90]);
  });

  it("does not mutate the input array", () => {
    const original = [...rows];
    sortWorkspaceRows(rows, { key: "radioLoopId", direction: "asc" });
    expect(rows).toEqual(original);
  });

  it("places rows with a missing sort value first when ascending", () => {
    const withMissing = [makeRow({ radioLoopId: "rloop_000001", bpm: 100 }), makeRow({ radioLoopId: "rloop_000002", bpm: undefined })];
    const sorted = sortWorkspaceRows(withMissing, { key: "bpm", direction: "asc" });
    expect(sorted[0].radioLoopId).toBe("rloop_000002");
  });
});

describe("applyWorkspaceQuery", () => {
  it("composes search, filter, and sort together", () => {
    const rows = [
      makeRow({ radioLoopId: "rloop_000002", workingTitle: "Motion Loop", roles: ["motion"] }),
      makeRow({ radioLoopId: "rloop_000001", workingTitle: "Foundation Loop", roles: ["foundation"] }),
    ];
    const filter: RadioLoopFilterState = { search: "loop", role: "all", status: "all", approval: "all", stemStatus: "all" };
    const sort: RadioLoopSortState = { key: "radioLoopId", direction: "asc" };
    expect(applyWorkspaceQuery(rows, filter, sort).map((r) => r.radioLoopId)).toEqual(["rloop_000001", "rloop_000002"]);
  });
});

describe("detectLegacyRoleIssues / withDetectedIssues", () => {
  it("returns no issue for closed-vocabulary roles", () => {
    expect(detectLegacyRoleIssues(makeRow({ roles: ["foundation", "motion"] }))).toEqual([]);
  });

  it("flags the pre-0717A legacy 'atmosphere' role without translating or dropping it", () => {
    const row = makeRow({ roles: ["atmosphere"] });
    const issues = detectLegacyRoleIssues(row);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe("RADIO_WORKSPACE_LEGACY_ROLE");
    expect(issues[0].message).toContain("atmosphere");
    // The stored value itself is untouched.
    expect(row.roles).toEqual(["atmosphere"]);
  });

  it("withDetectedIssues merges legacy-role issues into the row without removing existing ones", () => {
    const row = makeRow({ roles: ["atmosphere"], issues: [{ code: "SOME_OTHER_ISSUE", message: "x", severity: "warning" }] });
    const result = withDetectedIssues(row);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.some((i) => i.code === "RADIO_WORKSPACE_LEGACY_ROLE")).toBe(true);
    expect(result.issues.some((i) => i.code === "SOME_OTHER_ISSUE")).toBe(true);
  });
});
