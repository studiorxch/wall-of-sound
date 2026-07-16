import { describe, it, expect } from "vitest";
import {
  buildLoopBinRows, countsByTab, filterLoopBinRows, sortLoopBinRows,
  type LoopBinLoopInput, type LoopBinCandidateInput,
} from "./loopBinFilters";
import type { LoopAsset } from "../../data/loopTypes";

const SR = 44100;

function loop(overrides: Partial<LoopAsset> = {}): LoopAsset {
  return {
    id: "l1", sourceKind: "track", sourceTrackId: "t1",
    title: "Groove A", sourceTitle: "Track One",
    startSeconds: 10, endSeconds: 18, durationSeconds: 8, barCount: 8,
    boundarySource: "manual", contentClass: "unknown",
    status: "approved", warnings: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

describe("buildLoopBinRows", () => {
  it("includes approved loops and un-approved candidates, skipping already-approved candidates", () => {
    const loops: LoopBinLoopInput[] = [{ loop: loop(), isStale: false }];
    const candidates: LoopBinCandidateInput[] = [
      { candidateId: "c1", title: "Cand 1", startSeconds: 0, endSeconds: 4, sourceKind: "track", decision: "approved" },
      { candidateId: "c2", title: "Cand 2", startSeconds: 4, endSeconds: 8, sourceKind: "track", decision: "rejected" },
      { candidateId: "c3", title: "Cand 3", startSeconds: 8, endSeconds: 12, sourceKind: "track" },
    ];
    const rows = buildLoopBinRows(loops, candidates, SR);
    expect(rows.map((r) => r.id)).toEqual(["loop_l1", "cand_c2", "cand_c3"]);
    expect(rows[1].status).toBe("rejected");
    expect(rows[2].status).toBe("suggestion");
  });

  it("marks a loop row stale when isStale is true", () => {
    const rows = buildLoopBinRows([{ loop: loop(), isStale: true }], [], SR);
    expect(rows[0].status).toBe("stale");
  });

  it("formats bar-based length labels when barCount is present", () => {
    const rows = buildLoopBinRows([{ loop: loop({ barCount: 16 }), isStale: false }], [], SR);
    expect(rows[0].lengthLabel).toBe("16 bars");
  });
});

describe("countsByTab", () => {
  it("counts rows per tab", () => {
    const rows = buildLoopBinRows(
      [{ loop: loop(), isStale: false }, { loop: loop({ id: "l2" }), isStale: true }],
      [
        { candidateId: "c1", title: "C1", startSeconds: 0, endSeconds: 1, sourceKind: "track", decision: "rejected" },
        { candidateId: "c2", title: "C2", startSeconds: 0, endSeconds: 1, sourceKind: "track" },
      ],
      SR,
    );
    expect(countsByTab(rows)).toEqual({ approved: 1, suggestions: 1, rejected: 1, stale: 1 });
  });
});

describe("filterLoopBinRows", () => {
  it("filters to the requested tab", () => {
    const rows = buildLoopBinRows([{ loop: loop(), isStale: false }],
      [{ candidateId: "c1", title: "C1", startSeconds: 0, endSeconds: 1, sourceKind: "track" }], SR);
    expect(filterLoopBinRows(rows, "approved", {})).toHaveLength(1);
    expect(filterLoopBinRows(rows, "suggestions", {})).toHaveLength(1);
    expect(filterLoopBinRows(rows, "rejected", {})).toHaveLength(0);
  });

  it("filters by source kind", () => {
    const rows = buildLoopBinRows([{ loop: loop({ sourceKind: "stem" }), isStale: false }], [], SR);
    expect(filterLoopBinRows(rows, "approved", { source: "stem" })).toHaveLength(1);
    expect(filterLoopBinRows(rows, "approved", { source: "track" })).toHaveLength(0);
  });

  it("filters by bar length, including 'free' for non-bar loops", () => {
    const rows = buildLoopBinRows(
      [{ loop: loop({ id: "l1", barCount: 8 }), isStale: false }, { loop: loop({ id: "l2", barCount: undefined, durationSeconds: 5 }), isStale: false }],
      [], SR,
    );
    expect(filterLoopBinRows(rows, "approved", { length: 8 })).toHaveLength(1);
    expect(filterLoopBinRows(rows, "approved", { length: "free" })).toHaveLength(1);
  });

  // 0715D — regression test for a live-caught real defect: a bar-aligned
  // SUGGESTION (candidate) row's lengthLabel was always formatted in
  // seconds, never "N bars", because buildLoopBinRows never threaded the
  // candidate's own barCount through — so the Length filter could never
  // match ANY suggestion row, even an exact 8-bar candidate.
  it("filters suggestion rows by bar length too, not just approved loops", () => {
    const rows = buildLoopBinRows(
      [],
      [
        { candidateId: "c1", title: "8-bar candidate", startSeconds: 0, endSeconds: 15.6, sourceKind: "track", barCount: 8 },
        { candidateId: "c2", title: "16-bar candidate", startSeconds: 0, endSeconds: 31.2, sourceKind: "track", barCount: 16 },
      ],
      SR,
    );
    expect(rows[0].lengthLabel).toBe("8 bars");
    expect(filterLoopBinRows(rows, "suggestions", { length: 8 })).toHaveLength(1);
    expect(filterLoopBinRows(rows, "suggestions", { length: 16 })).toHaveLength(1);
  });

  it("filters by render status", () => {
    const rows = buildLoopBinRows([{ loop: loop(), isStale: false, renderStatus: "rendered" }], [], SR);
    expect(filterLoopBinRows(rows, "approved", { render: "rendered" })).toHaveLength(1);
    expect(filterLoopBinRows(rows, "approved", { render: "stale" })).toHaveLength(0);
  });

  it("filters by generation mode", () => {
    const rows = buildLoopBinRows([{ loop: loop({ generationMode: "trusted_grid" }), isStale: false }], [], SR);
    expect(filterLoopBinRows(rows, "approved", { mode: "trusted" })).toHaveLength(1);
    expect(filterLoopBinRows(rows, "approved", { mode: "manual" })).toHaveLength(0);
  });
});

describe("sortLoopBinRows", () => {
  it("sorts by start time ascending", () => {
    const rows = buildLoopBinRows(
      [{ loop: loop({ id: "l1", startSeconds: 20, endSeconds: 28 }), isStale: false },
       { loop: loop({ id: "l2", startSeconds: 5, endSeconds: 13 }), isStale: false }],
      [], SR,
    );
    const sorted = sortLoopBinRows(rows, "start_time");
    expect(sorted.map((r) => r.loopId)).toEqual(["l2", "l1"]);
  });

  it("sorts by name", () => {
    const rows = buildLoopBinRows(
      [{ loop: loop({ id: "l1", title: "Zebra" }), isStale: false },
       { loop: loop({ id: "l2", title: "Apple" }), isStale: false }],
      [], SR,
    );
    const sorted = sortLoopBinRows(rows, "name");
    expect(sorted.map((r) => r.title)).toEqual(["Apple", "Zebra"]);
  });

  it("sorts by updated descending, most recent first", () => {
    const rows = buildLoopBinRows(
      [{ loop: loop({ id: "l1", updatedAt: "2026-01-01T00:00:00Z" }), isStale: false },
       { loop: loop({ id: "l2", updatedAt: "2026-06-01T00:00:00Z" }), isStale: false }],
      [], SR,
    );
    const sorted = sortLoopBinRows(rows, "updated");
    expect(sorted.map((r) => r.loopId)).toEqual(["l2", "l1"]);
  });

  it("sorts rows lacking sort data last, rather than fabricating an order", () => {
    const rows = buildLoopBinRows([{ loop: loop({ id: "l1", seamlessnessScore: 0.9 }), isStale: false }],
      [{ candidateId: "c1", title: "No score", startSeconds: 0, endSeconds: 1, sourceKind: "track" }], SR);
    const sorted = sortLoopBinRows(rows, "score");
    expect(sorted[0].loopId).toBe("l1");
    expect(sorted[1].candidateId).toBe("c1");
  });
});
