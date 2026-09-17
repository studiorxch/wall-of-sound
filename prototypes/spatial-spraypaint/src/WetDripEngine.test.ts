import { describe, expect, it } from "vitest";
import { WetDripEngine, prependHiddenDripUnderlap } from "./WetDripEngine";
import { buildContinuousDripStrip } from "./DripLogic";

function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  colorStops: Array<[number, string]>;
  moveTos: Array<[number, number]>;
  arcs: Array<[number, number, number]>;
} {
  const calls: string[] = [];
  const colorStops: Array<[number, string]> = [];
  const moveTos: Array<[number, number]> = [];
  const arcs: Array<[number, number, number]> = [];
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: (x: number, y: number, radius: number) => { calls.push("arc"); arcs.push([x, y, radius]); },
    fill: () => calls.push("fill"),
    moveTo: (x: number, y: number) => moveTos.push([x, y]),
    lineTo: () => undefined,
    closePath: () => calls.push("closePath"),
    createLinearGradient: () => ({
      addColorStop: (offset: number, color: string) => colorStops.push([offset, color]),
    }),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, colorStops, moveTos, arcs };
}

describe("WetDripEngine", () => {
  it("prepends a straight hidden underlap without changing the existing visible strip", () => {
    const drip = {
      x: 20,
      y: 30,
      width: 10,
      length: 180,
      opacity: 0.8,
      bend: 4,
      attachmentUnderlap: 14,
    };
    const visible = buildContinuousDripStrip(drip, 24);
    const underpainted = prependHiddenDripUnderlap(drip, visible);
    expect(underpainted.slice(1)).toEqual(visible);
    expect(underpainted[0].center).toEqual({ x: 20, y: 16 });
    expect(underpainted[0].width).toBeGreaterThanOrEqual(drip.width);
  });

  it("redraws a growing Mop drip as one gradient strip -- the root's shape comes from width interpolation, not a separate circle", () => {
    const persistent = recordingContext();
    const overlay = recordingContext();
    const engine = new WetDripEngine();
    engine.startDrip({
      x: 20,
      y: 30,
      width: 10,
      length: 180,
      opacity: 0.8,
      bend: 4,
      durationMs: 1000,
      tipWidthRatio: 0.62,
      originPoolRadius: 8,
      terminalBulbRatio: 0.58,
      renderAsOverlay: true,
      attachmentUnderlap: 14,
    }, "#ff0000", 0);

    engine.advanceDrips(persistent.ctx, overlay.ctx, 250);
    engine.advanceDrips(persistent.ctx, overlay.ctx, 500);
    expect(persistent.calls).toEqual([]);
    expect(overlay.calls.filter((call) => call === "closePath")).toHaveLength(2);
    expect(overlay.moveTos[0][1]).toBe(16);
    expect(overlay.moveTos[1][1]).toBe(16);
    expect(overlay.colorStops.filter(([offset]) => offset === 0).every(([, color]) => (
      color.endsWith(", 1.000)")
    ))).toBe(true);

    engine.advanceDrips(persistent.ctx, overlay.ctx, 1000);
    expect(persistent.calls.filter((call) => call === "closePath")).toHaveLength(1);
    // Exactly one arc: the rounded terminal tip. The root is carried
    // entirely by the strip's own width interpolation (shoulder -> neck ->
    // taper) -- never a standalone circle primitive at the origin.
    expect(persistent.calls.filter((call) => call === "arc")).toHaveLength(1);
  });

  it("replays the same connected final geometry with no origin circle", () => {
    const drip = {
      x: 40,
      y: 50,
      width: 12,
      length: 220,
      opacity: 0.84,
      bend: 8,
      kink: -5,
      kinkAt: 0.48,
      tipWidthRatio: 0.62,
      originPoolRadius: 10,
      terminalBulbRatio: 0.58,
      renderAsOverlay: true,
      attachmentUnderlap: 14,
    };
    const render = () => {
      const recording = recordingContext();
      new WetDripEngine().renderCompletedDrip(recording.ctx, drip, "#e92f3d");
      return recording;
    };
    const first = render();
    const second = render();
    expect(first.calls).toEqual(second.calls);
    expect(first.colorStops).toEqual(second.colorStops);
    expect(first.calls.filter((call) => call === "closePath")).toHaveLength(1);
    expect(first.calls.filter((call) => call === "arc")).toHaveLength(1);
    expect(first.moveTos[0][1]).toBe(36);
  });

  it("shapes the root from progressive width interpolation -- wide shoulder narrowing into a neck, then the body taper, never a stamped disk", () => {
    const drip = {
      x: 40,
      y: 50,
      width: 12,
      length: 220,
      opacity: 0.84,
      bend: 8,
      tipWidthRatio: 0.62,
      originPoolRadius: 17,
      terminalBulbRatio: 0.58,
      renderAsOverlay: true,
      attachmentUnderlap: 14,
    };
    const strip = buildContinuousDripStrip(drip, 40);
    // No circle at the root -- the only arc drawn is the terminal tip.
    const recording = recordingContext();
    new WetDripEngine().renderCompletedDrip(recording.ctx, drip, "#e92f3d");
    expect(recording.arcs).toHaveLength(1);

    // The root (progress 0) is at the full pooled shoulder width...
    expect(strip[0].width).toBeCloseTo(drip.originPoolRadius * 2, 5);
    // ...visibly wider than the body a bit further down the run...
    const bodySection = strip[Math.round(strip.length * 0.4)];
    expect(strip[0].width).toBeGreaterThan(bodySection.width * 1.5);
    // ...width decreases monotonically over the whole run (progressive
    // narrowing, not a flat plateau followed by a sudden drop)...
    expect(strip.every((section, index) => (
      index === 0 || section.width <= strip[index - 1].width
    ))).toBe(true);
    // ...and the taper is still visibly present all the way to the tail.
    expect(strip[strip.length - 1].width).toBeLessThan(bodySection.width);
  });
});
