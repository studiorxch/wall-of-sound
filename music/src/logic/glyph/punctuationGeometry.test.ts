import { describe, it, expect } from "vitest";
import { buildPunctuationMarks } from "./punctuationGeometry";
import type { ConnectionGrammar } from "../../data/glyphConnectionTypes";

function grammar(overrides: Partial<ConnectionGrammar> = {}): ConnectionGrammar {
  return {
    id: "cg1", schemaVersion: 1, name: "test",
    connectionMode: "withinSection",
    barBoundaryBehavior: "dot", phraseBoundaryBehavior: "gap",
    sectionBoundaryBehavior: "break", silenceBoundaryBehavior: "extendedGap",
    connectorMode: "softSag",
    connectorDistanceMultiplier: 1.75, maxBaselineDeltaMultiplier: 0.6,
    allowMinorCrossings: true, allowConnectorOverrun: false,
    connectorSagAmount: 0.18, connectorRiseAmount: 0, connectorTension: 0.5, connectorSmoothing: 0.65,
    punctuationDotSize: 1, punctuationGapSize: 1.5, sectionGapMultiplier: 2.5, restMarkScale: 1,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildPunctuationMarks", () => {
  it("dot produces exactly one plot-safe mark with a positive radius", () => {
    const marks = buildPunctuationMarks("dot", 10, 20, grammar(), "boundary-1");
    expect(marks).toHaveLength(1);
    expect(marks[0].type).toBe("dot");
    expect(marks[0].x).toBe(10);
    expect(marks[0].y).toBe(20);
    expect(marks[0].radius).toBeGreaterThan(0);
    expect(marks[0].sourceBoundaryId).toBe("boundary-1");
  });

  it("dotCluster produces two or three dots with deterministic spacing", () => {
    const a = buildPunctuationMarks("dotCluster", 10, 20, grammar(), "boundary-1");
    const b = buildPunctuationMarks("dotCluster", 10, 20, grammar(), "boundary-1");
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(a).toEqual(b);
    // Distinct x positions — an actual spread, not stacked marks.
    const xs = new Set(a.map((m) => m.x));
    expect(xs.size).toBe(a.length);
  });

  it("gap produces no marks at all", () => {
    expect(buildPunctuationMarks("gap", 10, 20, grammar(), "boundary-1")).toEqual([]);
  });

  it("restMark produces one mark carrying the grammar's restMarkScale", () => {
    const marks = buildPunctuationMarks("restMark", 10, 20, grammar({ restMarkScale: 2 }), "boundary-1");
    expect(marks).toHaveLength(1);
    expect(marks[0].type).toBe("restMark");
    expect(marks[0].scale).toBe(2);
  });

  it("every radius/scale stays positive even for a zero-sized grammar setting", () => {
    const marks = buildPunctuationMarks("dot", 0, 0, grammar({ punctuationDotSize: 0 }), "b");
    expect(marks[0].radius).toBeGreaterThan(0);
  });

  it("returns no marks for non-finite coordinates rather than producing invalid geometry", () => {
    expect(buildPunctuationMarks("dot", NaN, 0, grammar(), "b")).toEqual([]);
  });
});
