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

  it("redraws a growing Mop drip as one gradient strip with a rounded root and a rounded tip", () => {
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
    // One rounded root (pools the flat top edge into the mark -- the fix
    // for a drip origin reading as a sharp spike/pinch) and one rounded
    // terminal tip -- not a separate free-floating circular origin stamp.
    expect(persistent.calls.filter((call) => call === "arc")).toHaveLength(2);
  });

  it("replays the same connected final geometry with a rounded root, no free-floating origin node", () => {
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
    expect(first.calls.filter((call) => call === "arc")).toHaveLength(2);
    expect(first.moveTos[0][1]).toBe(36);
  });

  it("rounds the root at the drip's true origin, sized to its pooled radius -- not the mark's own flat-cut shoulder edge", () => {
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
    const recording = recordingContext();
    new WetDripEngine().renderCompletedDrip(recording.ctx, drip, "#e92f3d");
    const [rootArc] = recording.arcs;
    expect(rootArc).toEqual([drip.x, drip.y, drip.originPoolRadius]);
  });
});
