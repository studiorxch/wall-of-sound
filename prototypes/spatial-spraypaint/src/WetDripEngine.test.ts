import { describe, expect, it } from "vitest";
import { WetDripEngine } from "./WetDripEngine";

function recordingContext(): {
  ctx: CanvasRenderingContext2D;
  calls: string[];
  colorStops: Array<[number, string]>;
} {
  const calls: string[] = [];
  const colorStops: Array<[number, string]> = [];
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    arc: () => calls.push("arc"),
    fill: () => calls.push("fill"),
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => calls.push("closePath"),
    createLinearGradient: () => ({
      addColorStop: (offset: number, color: string) => colorStops.push([offset, color]),
    }),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls, colorStops };
}

describe("WetDripEngine", () => {
  it("redraws a growing Mop drip as one gradient strip without circular origin stamps", () => {
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
    }, "#ff0000", 0);

    engine.advanceDrips(persistent.ctx, overlay.ctx, 250);
    engine.advanceDrips(persistent.ctx, overlay.ctx, 500);
    expect(persistent.calls).toEqual([]);
    expect(overlay.calls.filter((call) => call === "closePath")).toHaveLength(2);
    expect(overlay.colorStops.filter(([offset]) => offset === 0).every(([, color]) => (
      color.endsWith(", 1.000)")
    ))).toBe(true);

    engine.advanceDrips(persistent.ctx, overlay.ctx, 1000);
    expect(persistent.calls.filter((call) => call === "closePath")).toHaveLength(1);
    expect(persistent.calls.filter((call) => call === "arc")).toHaveLength(1);
  });

  it("replays the same connected final geometry without an origin node", () => {
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
  });
});
