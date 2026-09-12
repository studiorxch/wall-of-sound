import { describe, expect, it } from "vitest";
import { DripAccumulator, buildContinuousDripStrip } from "./DripLogic";

describe("DripAccumulator", () => {
  it("does not drip during fast movement", () => {
    const accumulator = new DripAccumulator();
    let drip = null;
    for (let index = 0; index < 20; index += 1) {
      drip = accumulator.observe({
        x: index * 20,
        y: 20,
        radius: 30,
        timestamp: index * 60,
        dripTendency: 0.9,
        enabled: true,
      });
    }
    expect(drip).toBeNull();
  });

  it("triggers after sustained accumulation within a small region", () => {
    const accumulator = new DripAccumulator();
    let drip = null;
    for (let time = 0; time <= 900; time += 50) {
      drip = accumulator.observe({
        x: 100 + (time % 2),
        y: 120,
        radius: 30,
        timestamp: time,
        dripTendency: 0.9,
        enabled: true,
      }) ?? drip;
    }
    expect(drip).not.toBeNull();
    expect(drip!.length).toBeGreaterThan(drip!.width);
  });

  it("stays disabled when drips are off", () => {
    const accumulator = new DripAccumulator();
    expect(accumulator.observe({
      x: 10,
      y: 10,
      radius: 40,
      timestamp: 2000,
      dripTendency: 1,
      enabled: false,
    })).toBeNull();
  });
});

describe("continuous wet drip geometry", () => {
  const wetDrip = {
    x: 20,
    y: 30,
    width: 12,
    length: 180,
    opacity: 0.84,
    bend: 18,
    tipWidthRatio: 0.3,
    originPoolRadius: 10,
  };

  it("builds one connected gravity strip rather than a bead chain", () => {
    const strip = buildContinuousDripStrip(wetDrip, 12);
    expect(strip).toHaveLength(13);
    expect(strip[0].center).toEqual({ x: wetDrip.x, y: wetDrip.y });
    expect(strip[strip.length - 1].center.y).toBe(wetDrip.y + wetDrip.length);
    expect(strip.every((section, index) => index === 0 || section.center.y >= strip[index - 1].center.y)).toBe(true);
  });

  it("tapers continuously and replays the exact same strip", () => {
    const first = buildContinuousDripStrip(wetDrip, 18);
    expect(first).toEqual(buildContinuousDripStrip(wetDrip, 18));
    expect(first[0].width).toBe(wetDrip.width);
    expect(first[first.length - 1].width).toBeCloseTo(wetDrip.width * wetDrip.tipWidthRatio);
    expect(first.slice(1).every((section, index) => section.width <= first[index].width)).toBe(true);
  });
});
