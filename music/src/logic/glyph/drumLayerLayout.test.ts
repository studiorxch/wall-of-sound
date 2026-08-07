import { describe, it, expect } from "vitest";
import { layoutDrumEvents } from "./drumLayerLayout";
import { computeFullCanvasLayout } from "./fullCanvasLayout";
import { buildContinuousGlyphRuns } from "./continuousGlyphRuns";
import { SQUARE_CANVAS_PRESET } from "../../data/glyphCanvasTypes";
import type { PulseTruthUnit } from "../../data/glyphPulseTruthTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { DrumEvent } from "../../data/glyphDrumLayerTypes";

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

function event(id: string, timeSeconds: number, strength = 0.5): DrumEvent {
  return { id, timeSeconds, strength, confidence: 0.8, source: "fullMix", sourceTrackId: "t1" };
}

describe("layoutDrumEvents — time alignment", () => {
  it("places a mark near its nearest pulse's canvas position", () => {
    const layout = buildLayout(30);
    const marks = layoutDrumEvents([event("d1", 2.0, 0.5)], layout, 40, 20);
    expect(marks).toHaveLength(1);
    expect(Number.isFinite(marks[0].point.x)).toBe(true);
    expect(Number.isFinite(marks[0].point.y)).toBe(true);
  });
});

describe("layoutDrumEvents — off-grid event preservation", () => {
  it("does not mutate the event's own timeSeconds even when off-grid", () => {
    const layout = buildLayout(30);
    const offGridEvent = event("d1", 2.13, 0.7);
    layoutDrumEvents([offGridEvent], layout, 40, 20);
    expect(offGridEvent.timeSeconds).toBe(2.13);
  });
});

describe("layoutDrumEvents — lane placement", () => {
  it("places marks above (smaller y than) their corresponding pulse row", () => {
    const layout = buildLayout(30);
    const pulsePoint = layout.placedRuns[0].pulsePoints[5];
    const marks = layoutDrumEvents([event("d1", pulsePoint.timeSeconds, 0.5)], layout, 40, 20);
    expect(marks[0].point.y).toBeLessThan(pulsePoint.point.y);
  });

  it("clamps the lane offset so marks never rise above the safe area top", () => {
    const layout = buildLayout(30);
    const marks = layoutDrumEvents([event("d1", 0.5, 0.5)], layout, 100000, 20);
    expect(marks[0].point.y).toBeGreaterThanOrEqual(layout.safeBounds.minY);
  });
});

describe("layoutDrumEvents — strength mapping", () => {
  it("maps higher strength to a taller mark", () => {
    const layout = buildLayout(30);
    const marks = layoutDrumEvents([event("weak", 1, 0.1), event("strong", 1, 0.9)], layout, 40, 20);
    expect(marks[1].height).toBeGreaterThan(marks[0].height);
  });
});

describe("layoutDrumEvents — canvas containment", () => {
  it("keeps every mark's x/y inside the canvas bounds", () => {
    const layout = buildLayout(300);
    const events = Array.from({ length: 50 }, (_, i) => event(`d${i}`, i * 1.5, 0.5));
    const marks = layoutDrumEvents(events, layout, 40, 20);
    for (const mark of marks) {
      expect(mark.point.x).toBeGreaterThanOrEqual(0);
      expect(mark.point.x).toBeLessThanOrEqual(layout.canvasBounds.maxX);
      expect(mark.point.y).toBeGreaterThanOrEqual(0);
      expect(mark.point.y).toBeLessThanOrEqual(layout.canvasBounds.maxY);
    }
  });
});
