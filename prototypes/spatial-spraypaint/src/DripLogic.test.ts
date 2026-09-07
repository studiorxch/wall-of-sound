import { describe, expect, it } from "vitest";
import { DripAccumulator } from "./DripLogic";

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
