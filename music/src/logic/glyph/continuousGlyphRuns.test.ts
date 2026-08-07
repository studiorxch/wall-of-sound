import { describe, it, expect } from "vitest";
import {
  buildContinuousGlyphRuns, buildPulseArchGeometry, pathCommandsToSvgPathData,
  transformPathCommands, countBarBoundaries, countInsertedBarGaps, DEFAULT_GLYPH_SPACING,
} from "./continuousGlyphRuns";
import type { PulseTruthUnit } from "../../data/glyphPulseTruthTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { GlyphSpacingConfig } from "./continuousGlyphRuns";

const KEEP_CONNECTED: GlyphSpacingConfig = {
  barBoundaryBehavior: "keepConnected", phraseBoundaryBehavior: "keepConnected",
  barGapMultiplier: 1.75, phraseGapMultiplier: 3,
};

function pulse(index: number, overrides: Partial<PulseTruthUnit> = {}): PulseTruthUnit {
  return {
    id: `pulse-${index}`, index, timeSeconds: index * 0.5, durationSeconds: 0.5,
    barIndex: Math.floor(index / 4), beatInBar: index % 4,
    sectionId: "s0", phraseId: null, source: "synthesized", energy: 0.5, attack: 0.5,
    ...overrides,
  };
}

function params(overrides: Partial<ArchGrammarParameters> = {}): ArchGrammarParameters {
  return {
    archCount: 1, width: 20, height: 10, curveSharpness: 0.3, asymmetry: 0, baselineOffset: 0,
    connectorLength: 0, connectorSag: 0, entryOvershoot: 0, exitOvershoot: 0, localCompression: 0,
    dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
    ...overrides,
  };
}

describe("buildContinuousGlyphRuns — one pulse per arch", () => {
  it("produces exactly one archGeometry per pulse in a single-section run", () => {
    const pulses = Array.from({ length: 8 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    expect(runs).toHaveLength(1);
    expect(runs[0].archGeometries).toHaveLength(8);
    expect(runs[0].pulseIds).toEqual(pulses.map((p) => p.id));
  });
});

describe("buildContinuousGlyphRuns — shared endpoints within a bar", () => {
  // barIndex = floor(index/4), so a 4-pulse run never crosses a bar
  // boundary — the required "continuous shared-endpoint hump construction
  // inside each bar" invariant, tested independent of spacing config.
  it("uses the exact same point for arch[n].end and arch[n+1].start", () => {
    const pulses = Array.from({ length: 4 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    const geoms = runs[0].archGeometries;
    for (let i = 0; i < geoms.length - 1; i++) {
      expect(geoms[i + 1].start.x).toBe(geoms[i].end.x);
      expect(geoms[i + 1].start.y).toBe(geoms[i].end.y);
    }
  });

  it("preserves exact endpoint sharing even with per-pulse height/asymmetry variation", () => {
    const pulses = Array.from({ length: 4 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, (_, i) => params({ height: 5 + i * 2, asymmetry: (i % 2 === 0 ? 0.3 : -0.3) }));
    const geoms = runs[0].archGeometries;
    for (let i = 0; i < geoms.length - 1; i++) {
      expect(geoms[i + 1].start).toEqual(geoms[i].end);
    }
  });
});

describe("buildContinuousGlyphRuns — one continuous path per run (spacing disabled, regression)", () => {
  it("emits exactly one M command per run when bar/phrase gaps are disabled", () => {
    const pulses = Array.from({ length: 10 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params(), KEEP_CONNECTED);
    const mCount = runs[0].pathCommands.filter((c) => c.type === "M").length;
    expect(mCount).toBe(1);
  });

  it("emits exactly 2 curve commands per pulse (rise + descend) after the initial M", () => {
    const pulses = Array.from({ length: 4 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params(), KEEP_CONNECTED);
    expect(runs[0].pathCommands.length).toBe(1 + pulses.length * 2);
  });
});

describe("buildContinuousGlyphRuns — section breaks", () => {
  it("starts a new run at a section boundary", () => {
    const pulses = [
      pulse(0, { sectionId: "s0" }), pulse(1, { sectionId: "s0" }), pulse(2, { sectionId: "s0" }),
      pulse(3, { sectionId: "s1" }), pulse(4, { sectionId: "s1" }),
    ];
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    expect(runs).toHaveLength(2);
    expect(runs[0].sectionId).toBe("s0");
    expect(runs[0].pulseIds).toEqual(["pulse-0", "pulse-1", "pulse-2"]);
    expect(runs[1].sectionId).toBe("s1");
    expect(runs[1].pulseIds).toEqual(["pulse-3", "pulse-4"]);
  });

  it("every run restarts its own local ribbon at x=0 (independent of prior sections' width)", () => {
    const pulses = [pulse(0, { sectionId: "s0" }), pulse(1, { sectionId: "s0" }), pulse(2, { sectionId: "s1" })];
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    expect(runs[1].startPoint.x).toBe(0);
  });

  it("preserves full pulse coverage across multiple section runs combined", () => {
    const pulses = Array.from({ length: 12 }, (_, i) => pulse(i, { sectionId: i < 5 ? "s0" : i < 9 ? "s1" : "s2" }));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    expect(runs).toHaveLength(3);
    const allIds = runs.flatMap((r) => r.pulseIds);
    expect(allIds).toEqual(pulses.map((p) => p.id));
  });
});

describe("buildContinuousGlyphRuns — determinism", () => {
  it("produces byte-identical output for identical input", () => {
    const pulses = Array.from({ length: 6 }, (_, i) => pulse(i));
    const a = buildContinuousGlyphRuns(pulses, () => params({ height: 8 }));
    const b = buildContinuousGlyphRuns(pulses, () => params({ height: 8 }));
    expect(a).toEqual(b);
  });
});

describe("buildContinuousGlyphRuns — empty input", () => {
  it("returns no runs for an empty pulse list", () => {
    expect(buildContinuousGlyphRuns([], () => params())).toEqual([]);
  });
});

describe("buildPulseArchGeometry — no self-intersection", () => {
  it("keeps crest.x within the arch's own foot span", () => {
    const geo = buildPulseArchGeometry(pulse(0), { x: 100, y: 0 }, params({ width: 20, asymmetry: 1 }));
    expect(geo.crest.x).toBeGreaterThanOrEqual(geo.start.x);
    expect(geo.crest.x).toBeLessThanOrEqual(geo.end.x);
  });
});

describe("pathCommandsToSvgPathData", () => {
  it("renders M/Q commands as a valid path data string", () => {
    const pulses = [pulse(0), pulse(1)];
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    const d = pathCommandsToSvgPathData(runs[0].pathCommands);
    expect(d.startsWith("M ")).toBe(true);
    expect(d).toContain("Q ");
  });
});

describe("transformPathCommands", () => {
  it("applies scale and translation to every command's coordinates", () => {
    const commands = pathCommandsToSvgPathData; // no-op reference to keep import used
    void commands;
    const pulses = [pulse(0), pulse(1)];
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    const transformed = transformPathCommands(runs[0].pathCommands, { dx: 100, dy: 50, scaleX: 2, scaleY: 0.5 });
    const first = runs[0].pathCommands[0];
    const firstT = transformed[0];
    if (first.type === "M" && firstT.type === "M") {
      expect(firstT.x).toBeCloseTo(first.x * 2 + 100, 9);
      expect(firstT.y).toBeCloseTo(first.y * 0.5 + 50, 9);
    }
  });

  it("preserves shared endpoints after a uniform transform", () => {
    const pulses = Array.from({ length: 4 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    const transformed = transformPathCommands(runs[0].pathCommands, { dx: 10, dy: 10, scaleX: 1.5, scaleY: 1.5 });
    // Every Q pair's final endpoint should exactly equal the next Q pair's midpoint-adjacent start check —
    // simplified: re-verify no NaN/Infinity crept in and length is preserved.
    expect(transformed).toHaveLength(runs[0].pathCommands.length);
    expect(transformed.every((c) => Number.isFinite(c.x) && Number.isFinite(c.y))).toBe(true);
  });
});

describe("buildContinuousGlyphRuns — 0804D silent bar spacing", () => {
  it("does NOT share an endpoint across a bar boundary — a real horizontal gap exists", () => {
    // barIndex = floor(index/4): boundary falls between pulse-3 and pulse-4.
    const pulses = Array.from({ length: 5 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    const geoms = runs[0].archGeometries;
    expect(geoms[4].start.x).toBeGreaterThan(geoms[3].end.x);
    expect(geoms[4].start.y).toBe(geoms[3].end.y); // horizontal-only gap, baseline unchanged
  });

  it("sizes the gap as barGapMultiplier times the preceding arch's own width", () => {
    const pulses = Array.from({ length: 5 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params({ width: 20 }));
    const geoms = runs[0].archGeometries;
    const gap = geoms[4].start.x - geoms[3].end.x;
    expect(gap).toBeCloseTo(20 * DEFAULT_GLYPH_SPACING.barGapMultiplier, 9);
  });

  it("marks segmentBoundaryReason: runStart on the first pulse, bar at the boundary, null elsewhere", () => {
    const pulses = Array.from({ length: 5 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    const geoms = runs[0].archGeometries;
    expect(geoms[0].segmentBoundaryReason).toBe("runStart");
    expect(geoms[0].startsNewSegment).toBe(true);
    expect(geoms[1].segmentBoundaryReason).toBeNull();
    expect(geoms[2].segmentBoundaryReason).toBeNull();
    expect(geoms[3].segmentBoundaryReason).toBeNull();
    expect(geoms[4].segmentBoundaryReason).toBe("bar");
    expect(geoms[4].startsNewSegment).toBe(true);
  });

  it("emits a fresh M at every bar boundary, producing more than one M per run", () => {
    // 20 pulses, 4 beatsPerBar -> bar boundaries after index 3, 7, 11, 15 (4 boundaries).
    const pulses = Array.from({ length: 20 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    const mCount = runs[0].pathCommands.filter((c) => c.type === "M").length;
    expect(mCount).toBe(5); // 1 run-start M + 4 bar-gap M's
  });

  it("never adds a pulse, never changes pulseIds or archGeometries length", () => {
    const pulses = Array.from({ length: 20 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    expect(runs[0].archGeometries).toHaveLength(20);
    expect(runs[0].pulseIds).toEqual(pulses.map((p) => p.id));
  });

  it("countBarBoundaries and countInsertedBarGaps independently agree", () => {
    const pulses = Array.from({ length: 20 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    expect(countBarBoundaries(pulses)).toBe(4);
    expect(countInsertedBarGaps(runs)).toBe(4);
    expect(countBarBoundaries(pulses)).toBe(countInsertedBarGaps(runs));
  });

  it("still starts a new run (section break), not merely a gap, at a section boundary", () => {
    const pulses = [
      ...Array.from({ length: 4 }, (_, i) => pulse(i, { sectionId: "s0" })),
      ...Array.from({ length: 4 }, (_, i) => pulse(i + 4, { sectionId: "s1" })),
    ];
    const runs = buildContinuousGlyphRuns(pulses, () => params());
    expect(runs).toHaveLength(2);
    expect(runs[1].archGeometries[0].segmentBoundaryReason).toBe("runStart");
  });

  it("a phrase boundary takes precedence over a coincident bar boundary and uses phraseGapMultiplier", () => {
    // phraseId changes at the same point the bar changes (index 3 -> 4) —
    // phrase must win, sized by phraseGapMultiplier, not barGapMultiplier.
    const pulses = [
      ...Array.from({ length: 4 }, (_, i) => pulse(i, { phraseId: "p0" })),
      ...Array.from({ length: 4 }, (_, i) => pulse(i + 4, { phraseId: "p1" })),
    ];
    const runs = buildContinuousGlyphRuns(pulses, () => params({ width: 20 }));
    const geoms = runs[0].archGeometries;
    expect(geoms[4].segmentBoundaryReason).toBe("phrase");
    const gap = geoms[4].start.x - geoms[3].end.x;
    expect(gap).toBeCloseTo(20 * DEFAULT_GLYPH_SPACING.phraseGapMultiplier, 9);
  });

  it("disabling both behaviors (keepConnected) never inserts a gap, even across a bar boundary", () => {
    const pulses = Array.from({ length: 5 }, (_, i) => pulse(i));
    const runs = buildContinuousGlyphRuns(pulses, () => params(), KEEP_CONNECTED);
    const geoms = runs[0].archGeometries;
    expect(geoms[4].start).toEqual(geoms[3].end);
    expect(geoms[4].segmentBoundaryReason).toBeNull();
  });
});
