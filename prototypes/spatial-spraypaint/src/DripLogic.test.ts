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
    // V0.10.17: `tipWidthRatio` is floored at 0.55 -- even this fixture's
    // aggressive 0.3 never converges the column below 55% of its own
    // resolvedBodyWidth (see `resolveDripWidth`'s own doc, region B).
    expect(first[first.length - 1].width).toBeCloseTo(wetDrip.width * 0.55);
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

  it("V0.10.17: narrows only mildly (floored, never a needle), then the SAME continuous width curve widens SUBTLY into the terminal bead -- no separate circle, no match-head/thermometer swing", () => {
    // A bead-enabled drip with a moderate ("MEDIUM", ~1.08-1.18x) bead.
    const beadedDrip = { ...wetDrip, terminalBulbRatio: 1.15 };
    const strip = buildContinuousDripStrip(beadedDrip, 200);
    const at = (progress: number) => strip.reduce((best, section) => (
      Math.abs(section.progress - progress) < Math.abs(best.progress - progress) ? section : best
    ));
    const root = at(0).width;
    const body70 = at(0.7).width;
    const narrowestPoint = Math.min(...strip.map((section) => section.width));
    const terminal = at(1).width;
    // The body carries most of its width through 70% of the run.
    expect(body70).toBeGreaterThan(root * 0.7);
    // The narrowest point of the whole curve never converges toward a
    // needle -- `tipWidthRatio` is floored at 0.55 regardless of the
    // fixture's own (aggressive) 0.3 value.
    expect(narrowestPoint).toBeGreaterThan(root * 0.5);
    // Terminal bead: the curve widens back out past its own narrowest
    // point -- the bead "emerges" from the same continuous curve -- but
    // SUBTLY: never more than 1.35x the column immediately before it (the
    // match-head/thermometer failure mode this pass removes).
    expect(terminal).toBeGreaterThan(narrowestPoint);
    expect(terminal).toBeLessThan(narrowestPoint * 1.35);
    // Continuity: no discontinuous jump anywhere along the curve (the
    // widest single-step change between adjacent samples stays a small
    // fraction of the drip's own base width -- proof this is one smooth
    // field, not primitives glued together).
    const widths = strip.map((section) => section.width);
    const maxStep = Math.max(...widths.slice(1).map((w, i) => Math.abs(w - widths[i])));
    expect(maxStep).toBeLessThan(beadedDrip.width * 0.05);
  });

  it("V0.10.17: Terminal Bead = NONE (unset) produces NO enlargement at all -- the column ends at its own natural (floored) narrow width, not a bulb", () => {
    const noBeadDrip = { ...wetDrip, tipWidthRatio: 0.7 };
    const strip = buildContinuousDripStrip(noBeadDrip, 200);
    const widths = strip.map((section) => section.width);
    // Width is monotonically non-increasing end to end -- no late-stage
    // widen-back-out anywhere when no bead is requested.
    expect(widths.slice(1).every((w, i) => w <= widths[i] + 1e-6)).toBe(true);
  });

  it("shapes a Mop overlay drip's root as a wide shoulder narrowing into a neck via width interpolation -- never a flat plateau or a separate circle, and never a match-head disproportionate to the column", () => {
    const pooledDrip = { ...wetDrip, renderAsOverlay: true, originPoolRadius: 22 };
    const strip = buildContinuousDripStrip(pooledDrip, 40);
    // V0.10.17: the attachment (root shoulder) is capped at 1.7x the
    // column's own resolvedBodyWidth regardless of how large
    // `originPoolRadius` itself is -- a wide pooled reservoir must not
    // balloon the drip's own silhouette into a "match head." Here
    // originPoolRadius*2 (44) exceeds that cap (12 * 1.7 = 20.4), so the
    // cap wins.
    const expectedShoulderWidth = Math.min(pooledDrip.originPoolRadius * 2, pooledDrip.width * 1.7);
    expect(strip[0].width).toBeCloseTo(expectedShoulderWidth, 5);
    expect(strip[0].width).toBeLessThan(pooledDrip.width * 2); // never 2-4x the column -- the match-head failure mode
    // ...decreases STRICTLY (progressively, not a plateau) through the
    // shoulder/neck region...
    const shoulderSection = strip.filter((section) => section.progress <= 0.18);
    expect(shoulderSection.length).toBeGreaterThan(2);
    for (let index = 1; index < shoulderSection.length; index += 1) {
      expect(shoulderSection[index].width).toBeLessThan(shoulderSection[index - 1].width);
    }
    // ...and has fully joined the ordinary (delayed-taper) body width by
    // the end of the shoulder span (no residual bulge past the neck).
    const afterNeck = strip.find((section) => section.progress > 0.18)!;
    const flooredTipRatio = Math.max(0.55, pooledDrip.tipWidthRatio);
    const stemWidthAtSpanEnd = pooledDrip.width * (
      1 - (1 - flooredTipRatio) * afterNeck.progress ** 3
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
    // wetDrip's originPoolRadius*2 (20) is under the 1.7x-column cap (20.4), so the raw value applies here.
    expect(strip[0].width).toBe((wetDrip.originPoolRadius ?? 0) * 2);
    expect(strip[4].width).toBeLessThan(strip[0].width);
    // Floored tipWidthRatio (0.55), same as the other tests above.
    expect(strip[strip.length - 1].width).toBeCloseTo(wetDrip.width * 0.55);
    expect(strip.every((section, index) => index === 0 || section.center.y >= strip[index - 1].center.y)).toBe(true);
  });
});

describe("V0.10.17 body width authority -- resolvedBodyWidth is a real, predictable geometric quantity", () => {
  // A controlled source: a fixed sourceStrokeWidth, no pooling, no taper,
  // no bead -- exactly the "primitive" the pass asks be tested first.
  const primitive = (bodyWidth: number, extra: Partial<{
    tipWidthRatio: number;
    terminalBulbRatio: number;
    originPoolRadius: number;
    renderAsOverlay: boolean;
  }> = {}) => ({
    x: 0,
    y: 0,
    width: 40 * bodyWidth, // resolvedBodyWidth = sourceStrokeWidth(40) * bodyWidth ratio
    length: 200,
    opacity: 0.8,
    ...extra,
  });

  it("four increasing Drip Body Width settings (10/20/30/40%) produce four visibly, monotonically wider mid-body silhouettes", () => {
    const midBodyWidth = (bodyWidthRatio: number) => {
      const strip = buildContinuousDripStrip(primitive(bodyWidthRatio), 100);
      const mid = strip.reduce((best, section) => (
        Math.abs(section.progress - 0.5) < Math.abs(best.progress - 0.5) ? section : best
      ));
      return mid.width;
    };
    const w10 = midBodyWidth(0.10);
    const w20 = midBodyWidth(0.20);
    const w30 = midBodyWidth(0.30);
    const w40 = midBodyWidth(0.40);
    expect(w10).toBeLessThan(w20);
    expect(w20).toBeLessThan(w30);
    expect(w30).toBeLessThan(w40);
    // Approximately proportional -- taper=0/bead=none/pooling=none here,
    // so the mid-body sample should sit very close to the raw
    // resolvedBodyWidth (40 * ratio) itself, not some unrelated multiple.
    expect(w10).toBeCloseTo(4, 0);
    expect(w20).toBeCloseTo(8, 0);
    expect(w30).toBeCloseTo(12, 0);
    expect(w40).toBeCloseTo(16, 0);
  });

  it("THE PRIMITIVE: body width moderate, taper 0, bead none, pooling none -- a nearly uniform-width column with a naturally rounded end, not a needle or a bulb", () => {
    const strip = buildContinuousDripStrip(primitive(0.2, { tipWidthRatio: 1 }), 200);
    const widths = strip.map((s) => s.width);
    const root = widths[0];
    const terminal = widths[widths.length - 1];
    // Nearly constant width throughout -- taper=0 means tipWidthRatio=1,
    // i.e. no narrowing deviation from resolvedBodyWidth at all.
    expect(Math.max(...widths)).toBeCloseTo(Math.min(...widths), 0);
    // The terminal is close to body width, not a needle (~0) and not a
    // bulb (2-4x) -- it's the SAME resolvedBodyWidth, full stop.
    expect(terminal).toBeCloseTo(root, 0);
  });

  it("taper is a DEVIATION from resolvedBodyWidth, never a redefinition of it -- even at 80% taper the column stays above the 55% floor, never a needle point", () => {
    const bodyWidth = primitive(0.2).width;
    const at = (taperFraction: number, progress: number) => {
      const tipWidthRatio = 1 - taperFraction;
      const strip = buildContinuousDripStrip(primitive(0.2, { tipWidthRatio }), 200);
      return strip.reduce((best, s) => (Math.abs(s.progress - progress) < Math.abs(best.progress - progress) ? s : best)).width;
    };
    // Taper 0%: constant width at every sampled point.
    expect(at(0, 1)).toBeCloseTo(bodyWidth, 0);
    // Taper 20/50/80%: progressively more narrowing at the tip, but NEVER
    // more than the 55%-floored deviation the geometry enforces.
    const tip20 = at(0.2, 1);
    const tip50 = at(0.5, 1);
    const tip80 = at(0.8, 1);
    expect(tip20).toBeLessThan(bodyWidth);
    expect(tip50).toBeLessThan(tip20);
    expect(tip80).toBeLessThanOrEqual(tip50);
    expect(tip80).toBeGreaterThanOrEqual(bodyWidth * 0.55 - 0.01);
  });

  it("Bead=NONE produces no enlargement anywhere -- no match head, no thermometer tip", () => {
    const strip = buildContinuousDripStrip(primitive(0.2, { tipWidthRatio: 0.7 }), 200);
    const widths = strip.map((s) => s.width);
    expect(widths.slice(1).every((w, i) => w <= widths[i] + 1e-6)).toBe(true);
  });

  it("increasing Terminal Bead (LOW/MEDIUM/HIGH) creates only progressive SUBTLE accumulation -- never 2-4x the column", () => {
    const terminalAt = (terminalBulbRatio: number) => {
      const strip = buildContinuousDripStrip(primitive(0.2, { tipWidthRatio: 0.85, terminalBulbRatio }), 200);
      return strip[strip.length - 1].width;
    };
    const none = terminalAt(1);
    const low = terminalAt(1.05);
    const medium = terminalAt(1.13);
    const high = terminalAt(1.3);
    expect(none).toBeLessThan(low);
    expect(low).toBeLessThan(medium);
    expect(medium).toBeLessThan(high);
    // Even HIGH stays within the clamped range relative to the column --
    // never the old 2-4x "match head" blowup.
    const bodyWidth = primitive(0.2).width;
    expect(high).toBeLessThan(bodyWidth * 1.35 + 0.5);
  });

  it("Origin Pooling changes the attachment only -- it never redefines the column's own resolvedBodyWidth", () => {
    const bodyWidth = primitive(0.2).width;
    const poolingAt = (originPoolRadius: number) => {
      const strip = buildContinuousDripStrip(primitive(0.2, { originPoolRadius, renderAsOverlay: true }), 200);
      return { root: strip[0].width, midBody: strip.reduce((best, s) => (Math.abs(s.progress - 0.5) < Math.abs(best.progress - 0.5) ? s : best)).width };
    };
    const none = poolingAt(bodyWidth * 0.5); // under the cap -- effectively no widening
    const low = poolingAt(bodyWidth * 0.6);
    const medium = poolingAt(bodyWidth * 0.7); // still under the 1.7x-diameter cap
    const high = poolingAt(bodyWidth * 2); // well over the cap
    // The root visibly widens as pooling increases...
    expect(none.root).toBeLessThanOrEqual(low.root);
    expect(low.root).toBeLessThanOrEqual(medium.root);
    expect(medium.root).toBeLessThan(high.root);
    // ...but even the most extreme pooling never exceeds the 1.7x column cap...
    expect(high.root).toBeLessThanOrEqual(bodyWidth * 1.7 + 0.01);
    // ...and the COLUMN's own mid-body width is completely unaffected by
    // pooling in every case -- attachment and column are independent.
    expect(none.midBody).toBeCloseTo(medium.midBody, 5);
    expect(medium.midBody).toBeCloseTo(high.midBody, 5);
  });

  it("root has no horizontal shelf -- the attachment blends smoothly (strictly monotonic through the neck), never a flat plateau", () => {
    const strip = buildContinuousDripStrip(primitive(0.2, { originPoolRadius: 20, renderAsOverlay: true }), 60);
    const neckSection = strip.filter((s) => s.progress <= 0.18);
    expect(neckSection.length).toBeGreaterThan(2);
    for (let i = 1; i < neckSection.length; i += 1) {
      expect(neckSection[i].width).toBeLessThanOrEqual(neckSection[i - 1].width);
    }
  });
});

describe("V0.10.17 gravity vector -- the drip path is resolved from an explicit gravity direction, not a hardcoded vertical assumption", () => {
  const baseDrip = { x: 100, y: 100, width: 8, length: 150, opacity: 0.8, wanderRatio: 0 };

  it("gravity = (0, 1), the default: a straight vertical downward drip", () => {
    const strip = buildContinuousDripStrip(baseDrip, 40);
    expect(strip[0].center).toEqual({ x: 100, y: 100 });
    expect(strip[strip.length - 1].center).toEqual({ x: 100, y: 250 });
    // No x drift anywhere -- purely vertical with zero lateral influence.
    expect(strip.every((s) => Math.abs(s.center.x - 100) < 1e-9)).toBe(true);
  });

  it("gravity = (0.2, 1) normalized: a slightly angled-right downward drip, never launching upward or sideways-dominant", () => {
    const strip = buildContinuousDripStrip({ ...baseDrip, gravity: { x: 0.2, y: 1 } }, 40);
    const tip = strip[strip.length - 1];
    // Ends downward and to the right -- travel is gravity-downstream.
    expect(tip.center.y).toBeGreaterThan(baseDrip.y);
    expect(tip.center.x).toBeGreaterThan(baseDrip.x);
    // Downward travel dominates: the vertical component is much larger
    // than the lateral one (no chopstick angle).
    expect(tip.center.y - baseDrip.y).toBeGreaterThan(Math.abs(tip.center.x - baseDrip.x) * 3);
    // Monotonically downward the whole way -- no upward launch anywhere.
    expect(strip.every((s, i) => i === 0 || s.center.y >= strip[i - 1].center.y)).toBe(true);
  });

  it("gravity = (-0.2, 1): the mirror image of the above, angled left instead of right", () => {
    const right = buildContinuousDripStrip({ ...baseDrip, gravity: { x: 0.2, y: 1 } }, 40);
    const left = buildContinuousDripStrip({ ...baseDrip, gravity: { x: -0.2, y: 1 } }, 40);
    const rightTip = right[right.length - 1].center;
    const leftTip = left[left.length - 1].center;
    expect(leftTip.x).toBeLessThan(baseDrip.x);
    expect(rightTip.x).toBeGreaterThan(baseDrip.x);
    // Mirror symmetry around the vertical axis through the origin.
    expect(Math.abs((leftTip.x - baseDrip.x) + (rightTip.x - baseDrip.x))).toBeLessThan(1e-6);
    expect(leftTip.y).toBeCloseTo(rightTip.y, 5);
  });

  it("zero lateral perturbation (no bend/kink/wander) plus non-vertical gravity produces a dead-straight line along that gravity direction -- no unexplained lateral launch", () => {
    const strip = buildContinuousDripStrip({ ...baseDrip, gravity: { x: 0.3, y: 1 } }, 40);
    const gravityLength = Math.hypot(0.3, 1);
    const gravity = { x: 0.3 / gravityLength, y: 1 / gravityLength };
    // Every section's center lies exactly on the line through the origin
    // along the gravity direction -- proof the path is DERIVED from the
    // vector, not an independent x/y formula that happens to look similar.
    for (const section of strip) {
      const dx = section.center.x - baseDrip.x;
      const dy = section.center.y - baseDrip.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1e-6) continue;
      const cross = dx * gravity.y - dy * gravity.x;
      expect(Math.abs(cross)).toBeLessThan(1e-6);
    }
  });
});
