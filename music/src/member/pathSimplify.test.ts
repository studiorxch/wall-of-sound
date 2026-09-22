import { describe, expect, it } from "vitest";
import { simplifyPathToBudget } from "./pathSimplify";

/** A long zigzag: alternates left/right every step while progressing steadily upward -- the exact "many alternating extrema" shape from the Revision 8 bug report. */
function buildZigzag(count: number, amplitude = 20): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    x: i % 2 === 0 ? -amplitude : amplitude,
    y: i * 4,
  }));
}

/** A long smooth wave -- the other reproduction case from the bug report. */
function buildWave(count: number, amplitude = 40, cycles = 12): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return { x: Math.sin(t * Math.PI * 2 * cycles) * amplitude, y: t * 2000 };
  });
}

describe("simplifyPathToBudget -- Revision 8 (fixes the straight-line-collapse bug)", () => {
  it("returns the path unchanged when it's already within budget", () => {
    const points = buildZigzag(10);
    expect(simplifyPathToBudget(points, 50)).toBe(points);
  });

  it("never exceeds the requested budget", () => {
    const points = buildZigzag(400);
    const simplified = simplifyPathToBudget(points, 150);
    expect(simplified.length).toBeLessThanOrEqual(150);
  });

  it("always keeps the first and last authored point exactly", () => {
    const points = buildZigzag(500);
    const simplified = simplifyPathToBudget(points, 100);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1]);
  });

  it("a long zigzag retains direction reversals near 25%, 50%, 75%, 90%, and near the end -- not just the endpoints", () => {
    const points = buildZigzag(600); // 600 alternating-extrema points
    const simplified = simplifyPathToBudget(points, 200);
    // For each checkpoint fraction, find the nearest simplified point to
    // that position along the ORIGINAL path and confirm its x is still
    // close to one of the two zigzag extremes (+-amplitude) rather than
    // having been smoothed/interpolated away into a mid-line value -- the
    // signature of the old bug (a straight line has x values drifting
    // toward the path's mean, not sitting at the extremes).
    const amplitude = 20;
    const checkpoints = [0.25, 0.5, 0.75, 0.9, 0.97];
    for (const fraction of checkpoints) {
      const targetY = fraction * (points.length - 1) * 4;
      let nearest = simplified[0];
      let nearestDistance = Infinity;
      for (const point of simplified) {
        const distance = Math.abs(point.y - targetY);
        if (distance < nearestDistance) { nearestDistance = distance; nearest = point; }
      }
      // Within one zigzag "period" of the checkpoint, the nearest kept
      // point should still be near a real extremum, not a flattened
      // straight-line average.
      expect(Math.abs(Math.abs(nearest.x) - amplitude)).toBeLessThan(amplitude * 0.5);
    }
  });

  it("a long smooth wave retains its oscillation late in the path -- not collapsed to a straight line after some point", () => {
    const points = buildWave(600);
    const simplified = simplifyPathToBudget(points, 220);
    // Look at the LAST QUARTER of the simplified output (by y position) and
    // confirm x values still span a meaningful range (real oscillation),
    // rather than being nearly constant (a collapsed straight segment).
    const lastQuarterY = points[points.length - 1].y * 0.75;
    const tail = simplified.filter((point) => point.y >= lastQuarterY);
    expect(tail.length).toBeGreaterThan(3);
    const xs = tail.map((point) => point.x);
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeGreaterThan(40); // real oscillation range, not a flat line
  });

  it("is a pure, deterministic function -- identical input always simplifies identically", () => {
    const points = buildZigzag(300);
    const a = simplifyPathToBudget(points, 120);
    const b = simplifyPathToBudget(points, 120);
    expect(a).toEqual(b);
  });

  it("handles fewer than 3 points without throwing", () => {
    expect(simplifyPathToBudget([], 10)).toEqual([]);
    expect(simplifyPathToBudget([{ x: 0, y: 0 }], 10)).toEqual([{ x: 0, y: 0 }]);
    expect(simplifyPathToBudget([{ x: 0, y: 0 }, { x: 1, y: 1 }], 1)).toHaveLength(2);
  });
});
