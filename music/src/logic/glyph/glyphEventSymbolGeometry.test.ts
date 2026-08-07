import { describe, it, expect } from "vitest";
import { symbolForEvent, placeAudibleEvents } from "./glyphEventSymbolGeometry";
import type { GlyphAudibleEvent, GlyphEventFamily } from "../../data/glyphEventVocabularyTypes";
import type { DrumMark } from "./drumLayerLayout";

describe("symbolForEvent — deterministic symbol mapping", () => {
  it("maps lightTransient to a small dot, never a ring", () => {
    const spec = symbolForEvent("lightTransient", 0.2, 0.5);
    expect(spec.shape).toBe("dot");
    expect(spec.haloEnabled).toBe(false);
  });

  it("maps drum to a filled dot sized by strength", () => {
    const weak = symbolForEvent("drum", 0.2, 0.5);
    const strong = symbolForEvent("drum", 0.9, 0.5);
    expect(weak.shape).toBe("dot");
    expect(strong.shape).toBe("dot");
    expect(strong.radius).toBeGreaterThan(weak.radius);
  });

  it("maps clap to an open ring", () => {
    const spec = symbolForEvent("clap", 0.6, 0.5);
    expect(spec.shape).toBe("ring");
  });

  it("enables a halo only when confidence is high", () => {
    const lowConfidence = symbolForEvent("clap", 0.6, 0.4);
    const highConfidence = symbolForEvent("clap", 0.6, 0.9);
    expect(lowConfidence.haloEnabled).toBe(false);
    expect(highConfidence.haloEnabled).toBe(true);
  });

  it("maps accent to a larger mark than an equivalent drum/clap", () => {
    const drum = symbolForEvent("drum", 0.6, 0.5);
    const accent = symbolForEvent("accent", 0.6, 0.5);
    expect(accent.radius).toBeGreaterThan(drum.radius);
  });

  it("is deterministic for identical input", () => {
    expect(symbolForEvent("clap", 0.6, 0.9)).toEqual(symbolForEvent("clap", 0.6, 0.9));
  });

  it("never returns a shape outside the dot/ring vocabulary — nothing resembling a bar/structural marker", () => {
    const allFamilies: GlyphEventFamily[] = ["lightTransient", "drum", "clap", "accent", "unknown"];
    for (const family of allFamilies) {
      const spec = symbolForEvent(family, 0.5, 0.5);
      expect(["dot", "ring"]).toContain(spec.shape);
    }
  });
});

describe("placeAudibleEvents", () => {
  function audibleEvent(overrides: Partial<GlyphAudibleEvent> = {}): GlyphAudibleEvent {
    return {
      id: "event-d0", timeSeconds: 0.3, family: "clap", strength: 0.6, confidence: 0.8,
      source: "fullMix", sourceTrackId: "t1", sourceDrumEventId: "d0", classificationReasons: [],
      ...overrides,
    };
  }

  it("joins an event to its matching DrumMark via sourceDrumEventId, reusing the same point", () => {
    const marks: DrumMark[] = [{ eventId: "d0", point: { x: 10, y: 20 }, height: 5 }];
    const placed = placeAudibleEvents([audibleEvent()], marks);
    expect(placed).toHaveLength(1);
    expect(placed[0].point).toEqual({ x: 10, y: 20 });
    expect(placed[0].symbol.shape).toBe("ring");
  });

  it("skips an event whose underlying DrumEvent has no placed mark", () => {
    const placed = placeAudibleEvents([audibleEvent({ sourceDrumEventId: "missing" })], []);
    expect(placed).toHaveLength(0);
  });

  it("never invents a placement independent of the existing DrumMark computation", () => {
    const marks: DrumMark[] = [{ eventId: "d0", point: { x: 1, y: 2 }, height: 3 }];
    const placed = placeAudibleEvents([audibleEvent()], marks);
    expect(placed[0].point).toBe(marks[0].point);
  });
});
