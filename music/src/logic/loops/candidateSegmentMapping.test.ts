import { describe, it, expect } from "vitest";
import { generateEqualSegments } from "./loopSegmentation";
import { mapCandidateToSegments, isMappingStale } from "./candidateSegmentMapping";

const SR = 44100;

function segs() {
  return generateEqualSegments("trk1", 0, 40, 120, 4, SR); // 8s segments
}

describe("mapCandidateToSegments", () => {
  it("classifies a candidate fully inside one segment as contained", () => {
    const s = segs();
    const candidate = { candidateId: "c1", startFrame: s[0].startFrame + 100, endFrame: s[0].endFrame - 100 };
    const mapping = mapCandidateToSegments(candidate, s, "grid1", "seg1");
    expect(mapping.relation).toBe("contained");
    expect(mapping.segmentIds).toEqual([s[0].id]);
  });

  it("classifies a candidate crossing a shared boundary as spans_segments", () => {
    const s = segs();
    const candidate = { candidateId: "c2", startFrame: s[0].endFrame - 500, endFrame: s[1].startFrame + 500 };
    const mapping = mapCandidateToSegments(candidate, s, "grid1", "seg1");
    expect(mapping.relation).toBe("spans_segments");
    expect(mapping.segmentIds.length).toBe(2);
  });

  it("classifies a candidate with no segment overlap as unmapped", () => {
    const s = segs();
    const candidate = { candidateId: "c3", startFrame: s[s.length - 1].endFrame + 1000, endFrame: s[s.length - 1].endFrame + 2000 };
    const mapping = mapCandidateToSegments(candidate, s, "grid1", "seg1");
    expect(mapping.relation).toBe("unmapped");
    expect(mapping.segmentIds).toEqual([]);
  });

  it("records the grid and segmentation revision IDs used at mapping time", () => {
    const s = segs();
    const candidate = { candidateId: "c4", startFrame: s[0].startFrame, endFrame: s[0].endFrame };
    const mapping = mapCandidateToSegments(candidate, s, "gridX", "segY");
    expect(mapping.mappedAtGridRevisionId).toBe("gridX");
    expect(mapping.mappedAtSegmentationRevisionId).toBe("segY");
  });
});

describe("isMappingStale", () => {
  const mapping = mapCandidateToSegments({ candidateId: "c1", startFrame: 0, endFrame: 100 }, segs(), "grid1", "seg1");

  it("is not stale when both revisions still match", () => {
    expect(isMappingStale(mapping, "grid1", "seg1")).toBe(false);
  });

  it("is stale when the grid revision changed", () => {
    expect(isMappingStale(mapping, "grid2", "seg1")).toBe(true);
  });

  it("is stale when the segmentation revision changed", () => {
    expect(isMappingStale(mapping, "grid1", "seg2")).toBe(true);
  });
});
