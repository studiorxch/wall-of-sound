import { describe, it, expect } from "vitest";
import { layoutLaserFrames, DEFAULT_LASER_ACTIVITY_THRESHOLD } from "./laserLayerLayout";
import { computeFullCanvasLayout } from "./fullCanvasLayout";
import { buildContinuousGlyphRuns } from "./continuousGlyphRuns";
import { SQUARE_CANVAS_PRESET } from "../../data/glyphCanvasTypes";
import type { PulseTruthUnit } from "../../data/glyphPulseTruthTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { LaserActivityFrame } from "../../data/glyphLaserLayerTypes";

function pulse(index: number): PulseTruthUnit {
  return {
    id: `pulse-${index}`, index, timeSeconds: index * 0.5, durationSeconds: 0.5,
    barIndex: Math.floor(index / 4), beatInBar: index % 4,
    sectionId: "s0", phraseId: null, source: "synthesized", energy: 0.5, attack: 0.5,
  };
}

function params(): ArchGrammarParameters {
  return {
    archCount: 1, width: 20, height: 10, curveSharpness: 0.3, asymmetry: 0, baselineOffset: 0,
    connectorLength: 0, connectorSag: 0, entryOvershoot: 0, exitOvershoot: 0, localCompression: 0,
    dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
  };
}

function buildLayout(count: number) {
  const pulses = Array.from({ length: count }, (_, i) => pulse(i));
  const runs = buildContinuousGlyphRuns(pulses, () => params());
  return computeFullCanvasLayout({
    canvas: SQUARE_CANVAS_PRESET, pulses, runs,
    minPulseWidth: 10, maxPulseWidth: 60, rowGap: 20, sectionGap: 60,
    safeArea: SQUARE_CANVAS_PRESET.safeArea,
  });
}

function frame(timeSeconds: number, activity: number): LaserActivityFrame {
  return { timeSeconds, activity, highBandEnergy: activity, spectralFlux: activity, modulationAmount: 0.5, modulationRate: 0.3, sweepDirection: 0, confidence: activity };
}

describe("layoutLaserFrames — canonical time mapping", () => {
  it("places each above-threshold frame at its nearest pulse's canvas point", () => {
    const layout = buildLayout(20);
    const targetTime = layout.placedRuns[0].pulsePoints[3].timeSeconds;
    const result = layoutLaserFrames([frame(targetTime, 0.8)], layout);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].points[0].x).toBe(layout.placedRuns[0].pulsePoints[3].point.x);
  });
});

describe("layoutLaserFrames — thresholding", () => {
  it("only produces segments for frames at or above the activity threshold", () => {
    const layout = buildLayout(20);
    const frames = layout.placedRuns[0].pulsePoints.slice(0, 5).map((p) => frame(p.timeSeconds, 0.05));
    const result = layoutLaserFrames(frames, layout);
    expect(result.segments).toHaveLength(0);
    expect(result.framesAboveThreshold).toBe(0);
    expect(result.framesAnalyzed).toBe(5);
  });

  it("breaks a segment when activity drops below threshold mid-sequence — never draws through a silent passage", () => {
    const layout = buildLayout(20);
    const points = layout.placedRuns[0].pulsePoints;
    const frames = [
      frame(points[0].timeSeconds, 0.8), frame(points[1].timeSeconds, 0.8),
      frame(points[2].timeSeconds, 0.02),
      frame(points[3].timeSeconds, 0.8), frame(points[4].timeSeconds, 0.8),
    ];
    const result = layoutLaserFrames(frames, layout);
    expect(result.segments.length).toBeGreaterThanOrEqual(2);
  });
});

describe("layoutLaserFrames — row breaks", () => {
  it("never connects a segment across a row boundary", () => {
    const layout = buildLayout(400);
    expect(layout.rowCount).toBeGreaterThan(1);
    const frames = layout.placedRuns.flatMap((run) => run.pulsePoints.map((p) => frame(p.timeSeconds, 0.9)));
    const result = layoutLaserFrames(frames, layout);
    const rowIndices = new Set(result.segments.map((s) => s.rowIndex));
    expect(rowIndices.size).toBeGreaterThan(1);
  });
});

describe("layoutLaserFrames — safe-area compliance", () => {
  it("keeps every placed point's y within the safe bounds", () => {
    const layout = buildLayout(20);
    const frames = layout.placedRuns[0].pulsePoints.map((p) => frame(p.timeSeconds, 0.9));
    const result = layoutLaserFrames(frames, layout);
    for (const seg of result.segments) {
      for (const p of seg.points) expect(p.y).toBeGreaterThanOrEqual(layout.safeBounds.minY);
    }
  });
});

describe("layoutLaserFrames — zero dropped segments for a normal scenario", () => {
  it("reports droppedSegmentCount = 0 when every above-threshold frame has a placeable point", () => {
    const layout = buildLayout(20);
    const frames = layout.placedRuns[0].pulsePoints.map((p) => frame(p.timeSeconds, 0.9));
    const result = layoutLaserFrames(frames, layout);
    expect(result.droppedSegmentCount).toBe(0);
    expect(result.visibleSegmentCount).toBe(result.placedSegmentCount);
  });
});

describe("layoutLaserFrames — no pulse-layout mutation", () => {
  it("never mutates the layout it reads from", () => {
    const layout = buildLayout(20);
    const before = JSON.parse(JSON.stringify(layout));
    const frames = layout.placedRuns[0].pulsePoints.map((p) => frame(p.timeSeconds, 0.9));
    layoutLaserFrames(frames, layout);
    expect(layout).toEqual(before);
  });
});

describe("DEFAULT_LASER_ACTIVITY_THRESHOLD", () => {
  it("is a sane value between 0 and 1", () => {
    expect(DEFAULT_LASER_ACTIVITY_THRESHOLD).toBeGreaterThan(0);
    expect(DEFAULT_LASER_ACTIVITY_THRESHOLD).toBeLessThan(1);
  });
});
