import { describe, it, expect } from "vitest";
import { computeRadioAssetReadiness, kindHasPackagingPath } from "./radioAssetReadiness";
import type { RadioAssetKind } from "../../data/radioInboxTypes";

const UNSUPPORTED_KINDS: RadioAssetKind[] = ["sound", "stem", "stem_section", "fill", "build", "announcement"];

describe("computeRadioAssetReadiness — kinds without a packaging path", () => {
  it.each(UNSUPPORTED_KINDS)("%s always resolves NOT_YET_PACKAGEABLE with a real issue, regardless of analysis/loop state", (kind) => {
    const result = computeRadioAssetReadiness({ kind, loopStatus: "approved", songAnalysisStatus: "READY_VERIFIED" });
    expect(result.readiness).toBe("NOT_YET_PACKAGEABLE");
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].code).toBe("RADIO_ASSET_KIND_NOT_YET_PACKAGEABLE");
  });

  it("kindHasPackagingPath is true only for loop and track (0718B RadioTrackPackage)", () => {
    for (const kind of UNSUPPORTED_KINDS) expect(kindHasPackagingPath(kind)).toBe(false);
    expect(kindHasPackagingPath("loop")).toBe(true);
    expect(kindHasPackagingPath("track")).toBe(true);
  });
});

describe("computeRadioAssetReadiness — kind: loop", () => {
  it("FAILED analysis -> FAILED readiness with an error issue", () => {
    const result = computeRadioAssetReadiness({ kind: "loop", songAnalysisStatus: "FAILED" });
    expect(result.readiness).toBe("FAILED");
    expect(result.issues[0].severity).toBe("error");
  });

  it("ANALYZING/QUEUED analysis -> ANALYZING readiness, no issues", () => {
    expect(computeRadioAssetReadiness({ kind: "loop", songAnalysisStatus: "ANALYZING" }).readiness).toBe("ANALYZING");
    expect(computeRadioAssetReadiness({ kind: "loop", songAnalysisStatus: "QUEUED" }).readiness).toBe("ANALYZING");
  });

  it("missing/NOT_ANALYZED/STALE analysis -> UNPREPARED", () => {
    expect(computeRadioAssetReadiness({ kind: "loop" }).readiness).toBe("UNPREPARED");
    expect(computeRadioAssetReadiness({ kind: "loop", songAnalysisStatus: "NOT_ANALYZED" }).readiness).toBe("UNPREPARED");
    expect(computeRadioAssetReadiness({ kind: "loop", songAnalysisStatus: "STALE" }).readiness).toBe("UNPREPARED");
  });

  it("analyzed but loop not approved -> NEEDS_REVIEW", () => {
    const result = computeRadioAssetReadiness({ kind: "loop", songAnalysisStatus: "READY_PROVISIONAL", loopStatus: "candidate" });
    expect(result.readiness).toBe("NEEDS_REVIEW");
  });

  it("analyzed AND approved -> READY, no issues", () => {
    const result = computeRadioAssetReadiness({ kind: "loop", songAnalysisStatus: "READY_VERIFIED", loopStatus: "approved" });
    expect(result.readiness).toBe("READY");
    expect(result.issues).toEqual([]);
  });
});

// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — "track" now has a
// verified packaging path (RadioTrackPackage). Unlike "loop", it has no
// inbox-item-level approval concept — curator approval for a track is
// scoped per RadioPlaylistEntry (radioEntryPreparation.ts), so the
// analysis-driven ladder is the full story here; a passed loopStatus must
// never gate a track (it isn't even a meaningful field for this kind).
describe("computeRadioAssetReadiness — kind: track", () => {
  it("FAILED analysis -> FAILED readiness with an error issue", () => {
    const result = computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "FAILED" });
    expect(result.readiness).toBe("FAILED");
    expect(result.issues[0].severity).toBe("error");
  });

  it("ANALYZING/QUEUED analysis -> ANALYZING readiness, no issues", () => {
    expect(computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "ANALYZING" }).readiness).toBe("ANALYZING");
    expect(computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "QUEUED" }).readiness).toBe("ANALYZING");
  });

  it("missing/NOT_ANALYZED/STALE analysis -> UNPREPARED", () => {
    expect(computeRadioAssetReadiness({ kind: "track" }).readiness).toBe("UNPREPARED");
    expect(computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "NOT_ANALYZED" }).readiness).toBe("UNPREPARED");
    expect(computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "STALE" }).readiness).toBe("UNPREPARED");
  });

  it("READY_PROVISIONAL or READY_VERIFIED analysis -> READY, no issues, with no loopStatus involved at all", () => {
    expect(computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "READY_PROVISIONAL" }).readiness).toBe("READY");
    const result = computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "READY_VERIFIED" });
    expect(result.readiness).toBe("READY");
    expect(result.issues).toEqual([]);
  });

  it("a stray loopStatus is never consulted for kind: track — it stays READY even when loopStatus looks unapproved", () => {
    const result = computeRadioAssetReadiness({ kind: "track", songAnalysisStatus: "READY_VERIFIED", loopStatus: "candidate" });
    expect(result.readiness).toBe("READY");
  });
});
