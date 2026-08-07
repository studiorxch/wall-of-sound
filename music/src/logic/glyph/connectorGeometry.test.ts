import { describe, it, expect } from "vitest";
import { getArchEndpoints, buildConnectorPath } from "./connectorGeometry";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { ConnectionGrammar, GlyphEndpoints } from "../../data/glyphConnectionTypes";

function archParams(overrides: Partial<ArchGrammarParameters> = {}): ArchGrammarParameters {
  return {
    archCount: 1, width: 20, height: 10, curveSharpness: 0.2, asymmetry: 0,
    baselineOffset: 0, connectorLength: 4, connectorSag: 1, entryOvershoot: 2, exitOvershoot: 2,
    localCompression: 0, dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
    ...overrides,
  };
}

function grammar(overrides: Partial<ConnectionGrammar> = {}): ConnectionGrammar {
  return {
    id: "cg1", schemaVersion: 1, name: "test",
    connectionMode: "withinSection",
    barBoundaryBehavior: "dot", phraseBoundaryBehavior: "gap",
    sectionBoundaryBehavior: "break", silenceBoundaryBehavior: "extendedGap",
    connectorMode: "softSag",
    connectorDistanceMultiplier: 1.75, maxBaselineDeltaMultiplier: 0.6,
    allowMinorCrossings: true, allowConnectorOverrun: false,
    connectorSagAmount: 0.18, connectorRiseAmount: 0.18, connectorTension: 0.5, connectorSmoothing: 0.65,
    punctuationDotSize: 1, punctuationGapSize: 1.5, sectionGapMultiplier: 2.5, restMarkScale: 1,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("getArchEndpoints", () => {
  it("returns the first and last stroke point as start/end", () => {
    const endpoints = getArchEndpoints(archParams({ entryOvershoot: 2, exitOvershoot: 3, width: 20 }));
    expect(endpoints.start.x).toBeCloseTo(-2, 5);
    expect(endpoints.end.x).toBeCloseTo(23, 5);
  });

  it("exposes tangent points distinct from the endpoints themselves", () => {
    const endpoints = getArchEndpoints(archParams());
    expect(endpoints.startTangent).toBeDefined();
    expect(endpoints.endTangent).toBeDefined();
    expect(endpoints.startTangent).not.toEqual(endpoints.start);
    expect(endpoints.endTangent).not.toEqual(endpoints.end);
  });
});

describe("buildConnectorPath", () => {
  const from: GlyphEndpoints = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, endTangent: { x: 8, y: -1 } };
  const to: GlyphEndpoints = { start: { x: 20, y: 0 }, end: { x: 30, y: 0 }, startTangent: { x: 22, y: -1 } };

  it("straight produces a direct M/L path", () => {
    const path = buildConnectorPath(from, to, grammar({ connectorMode: "straight" }));
    expect(path).toBe("M 10 0 L 20 0");
  });

  it("softSag curves below the baseline (positive Q control-point y)", () => {
    const path = buildConnectorPath(from, to, grammar({ connectorMode: "softSag", connectorSagAmount: 0.5 }));
    const match = path.match(/Q ([\d.-]+) ([\d.-]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![2])).toBeGreaterThan(0);
  });

  it("softRise curves above the baseline (negative Q control-point y)", () => {
    const path = buildConnectorPath(from, to, grammar({ connectorMode: "softRise", connectorRiseAmount: 0.5 }));
    const match = path.match(/Q ([\d.-]+) ([\d.-]+)/);
    expect(match).not.toBeNull();
    expect(Number(match![2])).toBeLessThan(0);
  });

  it("tensionCurve produces a cubic Bézier (C command)", () => {
    const path = buildConnectorPath(from, to, grammar({ connectorMode: "tensionCurve" }));
    expect(path.startsWith("M 10 0 C ")).toBe(true);
  });

  it("inheritNeighboringCurvature produces a cubic Bézier derived from tangents", () => {
    const path = buildConnectorPath(from, to, grammar({ connectorMode: "inheritNeighboringCurvature" }));
    expect(path.startsWith("M 10 0 C ")).toBe(true);
  });

  it("inheritNeighboringCurvature falls back to a default direction when tangents are absent", () => {
    const bareFrom: GlyphEndpoints = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const bareTo: GlyphEndpoints = { start: { x: 20, y: 0 }, end: { x: 30, y: 0 } };
    const path = buildConnectorPath(bareFrom, bareTo, grammar({ connectorMode: "inheritNeighboringCurvature" }));
    expect(path.startsWith("M 10 0 C ")).toBe(true);
  });

  it("produces the exact same path for the exact same input (determinism)", () => {
    const g = grammar({ connectorMode: "tensionCurve" });
    expect(buildConnectorPath(from, to, g)).toBe(buildConnectorPath(from, to, g));
  });

  it("falls back to an empty string (caller treats as a break) for non-finite endpoints", () => {
    const badTo: GlyphEndpoints = { start: { x: NaN, y: 0 }, end: { x: 30, y: 0 } };
    for (const mode of ["straight", "softSag", "softRise", "tensionCurve", "inheritNeighboringCurvature"] as const) {
      expect(buildConnectorPath(from, badTo, grammar({ connectorMode: mode }))).toBe("");
    }
  });
});
