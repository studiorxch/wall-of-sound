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

  it("drip load never exceeds sourceOpacityCeiling when one is supplied — a drip cannot gain paint from nowhere", () => {
    const accumulator = new DripAccumulator();
    let drip = null;
    for (let time = 0; time <= 900; time += 50) {
      drip = accumulator.observe({
        x: 100 + (time % 2),
        y: 120,
        radius: 30,
        timestamp: time,
        dripTendency: 1, // the highest nominal tendency, so without a ceiling opacity would be at its max
        enabled: true,
        sourceOpacityCeiling: 0.2, // far below the nominal 0.48-0.78 range
      }) ?? drip;
    }
    expect(drip).not.toBeNull();
    expect(drip!.opacity).toBeLessThanOrEqual(0.2);
    expect(drip!.sourceOpacityCeiling).toBe(0.2);
  });

  it("leaves opacity at its normal (uncapped) value when no sourceOpacityCeiling is supplied — every other cap's drip is unaffected", () => {
    const accumulator = new DripAccumulator();
    let drip = null;
    for (let time = 0; time <= 900; time += 50) {
      drip = accumulator.observe({
        x: 100 + (time % 2),
        y: 120,
        radius: 30,
        timestamp: time,
        dripTendency: 1,
        enabled: true,
      }) ?? drip;
    }
    expect(drip).not.toBeNull();
    expect(drip!.opacity).toBeCloseTo(0.78, 5); // 0.48 + 1 * 0.3, the pre-existing formula, untouched
    expect(drip!.sourceOpacityCeiling).toBeUndefined();
  });

  it("a ceiling ABOVE the nominal formula never inflates opacity beyond what the formula would already give", () => {
    const accumulator = new DripAccumulator();
    let drip = null;
    for (let time = 0; time <= 900; time += 50) {
      drip = accumulator.observe({
        x: 100 + (time % 2),
        y: 120,
        radius: 30,
        timestamp: time,
        dripTendency: 0.5,
        enabled: true,
        sourceOpacityCeiling: 0.99, // well above the nominal 0.48 + 0.5*0.3 = 0.63
      }) ?? drip;
    }
    expect(drip).not.toBeNull();
    expect(drip!.opacity).toBeCloseTo(0.63, 5);
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
    kink: -7,
    kinkAt: 0.46,
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

  it("holds body width for most of the run and delays taper into the final stretch -- a liquid line, not an icicle", () => {
    const strip = buildContinuousDripStrip(wetDrip, 200);
    const at = (progress: number) => strip.reduce((best, section) => (
      Math.abs(section.progress - progress) < Math.abs(best.progress - progress) ? section : best
    ));
    const root = at(0).width;
    const body25 = at(0.25).width;
    const body50 = at(0.5).width;
    const body75 = at(0.75).width;
    const terminal = at(1).width;
    // Body at 50% stays materially closer to the root than to the tail --
    // most of each drip reads as a stable line, not a steady triangle.
    expect(Math.abs(body50 - root)).toBeLessThan(Math.abs(body50 - terminal));
    // The 25%/50% points have barely tapered at all yet...
    expect(body25).toBeGreaterThan(root * 0.97);
    expect(body50).toBeGreaterThan(root * 0.9);
    // ...while the taper is clearly visible by 75% and finishes at the tip
    // -- narrowing is concentrated in the final quarter to third, not
    // spread linearly across the whole run.
    expect(body75).toBeLessThan(body50);
    expect(terminal).toBeLessThan(body75);
    expect(body50 - body75).toBeLessThan(body75 - terminal);
  });

  it("shapes a Mop overlay drip's root as a wide shoulder narrowing into a neck via width interpolation -- never a flat plateau or a separate circle", () => {
    const pooledDrip = { ...wetDrip, renderAsOverlay: true, originPoolRadius: 22 };
    const strip = buildContinuousDripStrip(pooledDrip, 40);
    // Root starts at the full pooled shoulder width...
    expect(strip[0].width).toBeCloseTo(pooledDrip.originPoolRadius * 2, 5);
    // ...decreases STRICTLY (progressively, not a plateau) through the
    // shoulder/neck region...
    const shoulderSection = strip.filter((section) => section.progress <= 0.22);
    expect(shoulderSection.length).toBeGreaterThan(2);
    for (let index = 1; index < shoulderSection.length; index += 1) {
      expect(shoulderSection[index].width).toBeLessThan(shoulderSection[index - 1].width);
    }
    // ...and has fully joined the ordinary (delayed-taper) body width by
    // the end of the shoulder span (no residual bulge past the neck).
    const afterNeck = strip.find((section) => section.progress > 0.22)!;
    const stemWidthAtSpanEnd = pooledDrip.width * (
      1 - (1 - pooledDrip.tipWidthRatio) * afterNeck.progress ** 4
    );
    expect(afterNeck.width).toBeCloseTo(stemWidthAtSpanEnd, 1);
  });

  it("keeps deterministic subtle kinks connected to the same gravity run", () => {
    const strip = buildContinuousDripStrip(wetDrip, 20);
    expect(strip[0].center).toEqual({ x: wetDrip.x, y: wetDrip.y });
    expect(strip[strip.length - 1].center.x).toBe(wetDrip.x + wetDrip.bend);
    expect(strip.some((section) => {
      const unKinkedX = wetDrip.x + wetDrip.bend * section.progress * section.progress;
      return Math.abs(section.center.x - unKinkedX) > 1;
    })).toBe(true);
    expect(strip.every((section, index) => index === 0 || section.center.y >= strip[index - 1].center.y)).toBe(true);
  });

  it("adds a second, independent kink for a wandering gravity path -- purely additive, no effect on callers that never set it", () => {
    const withoutSecondKink = buildContinuousDripStrip(wetDrip, 20);
    const withSecondKink = buildContinuousDripStrip({ ...wetDrip, kink2: 9, kinkAt2: 0.8 }, 20);
    // Every existing Spray drip never sets kink2 -- confirm the field
    // defaulting to undefined leaves the path byte-identical to before.
    expect(buildContinuousDripStrip({ ...wetDrip, kink2: undefined }, 20)).toEqual(withoutSecondKink);
    // With it set, the path near kinkAt2 diverges from the single-kink
    // version, and the two kinks land at different points along the run.
    const divergedNearSecondKink = withSecondKink.some((section, index) => (
      Math.abs(section.progress - 0.8) < 0.08
      && Math.abs(section.center.x - withoutSecondKink[index].center.x) > 1
    ));
    expect(divergedNearSecondKink).toBe(true);
    expect(withSecondKink.every((section, index) => (
      index === 0 || section.center.y >= withSecondKink[index - 1].center.y
    ))).toBe(true);
  });

  it("blends a Mop origin shoulder into one continuous strip without a node", () => {
    const strip = buildContinuousDripStrip({ ...wetDrip, renderAsOverlay: true }, 20);
    expect(strip[0].width).toBe((wetDrip.originPoolRadius ?? 0) * 2);
    expect(strip[4].width).toBeLessThan(strip[0].width);
    expect(strip[strip.length - 1].width).toBeCloseTo(wetDrip.width * wetDrip.tipWidthRatio);
    expect(strip.every((section, index) => index === 0 || section.center.y >= strip[index - 1].center.y)).toBe(true);
  });
});
