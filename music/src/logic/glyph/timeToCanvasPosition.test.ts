import { describe, it, expect } from "vitest";
import { timeToCanvasPosition } from "./timeToCanvasPosition";
import { computeFullCanvasLayout } from "./fullCanvasLayout";
import { buildContinuousGlyphRuns } from "./continuousGlyphRuns";
import { SQUARE_CANVAS_PRESET } from "../../data/glyphCanvasTypes";
import type { PulseTruthUnit } from "../../data/glyphPulseTruthTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";

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

describe("timeToCanvasPosition", () => {
  it("returns the exact placed point for a time matching a real pulse", () => {
    const layout = buildLayout(50);
    const target = layout.placedRuns[0].pulsePoints[3];
    const point = timeToCanvasPosition(target.timeSeconds, layout);
    expect(point).toEqual(target.point);
  });

  it("returns the nearest pulse's point for an off-grid time between two pulses", () => {
    const layout = buildLayout(50);
    const p0 = layout.placedRuns[0].pulsePoints[0];
    const p1 = layout.placedRuns[0].pulsePoints[1];
    const midCloserToP0 = p0.timeSeconds + (p1.timeSeconds - p0.timeSeconds) * 0.1;
    expect(timeToCanvasPosition(midCloserToP0, layout)).toEqual(p0.point);
  });

  it("never quantizes/mutates the queried time itself — purely a read", () => {
    const layout = buildLayout(20);
    const before = JSON.parse(JSON.stringify(layout));
    timeToCanvasPosition(1.234567, layout);
    expect(layout).toEqual(before);
  });

  it("returns null when the layout has no placed points", () => {
    const layout = buildLayout(0);
    expect(timeToCanvasPosition(1, layout)).toBeNull();
  });
});
