import { describe, expect, it } from "vitest";
import { SprayBrushEngine, createStrokeRandom } from "./SprayBrushEngine";

describe("spray brush replay randomness", () => {
  it("replays a canonical stroke with the same stable random sequence", () => {
    const firstReplay = createStrokeRandom(42);
    const secondReplay = createStrokeRandom(42);
    const otherStroke = createStrokeRandom(43);
    const firstValues = Array.from({ length: 12 }, () => firstReplay());
    expect(Array.from({ length: 12 }, () => secondReplay())).toEqual(firstValues);
    expect(Array.from({ length: 12 }, () => otherStroke())).not.toEqual(firstValues);
  });

  it("replays a wet drip deterministically downward with a pooled origin and tapered stem", () => {
    const render = () => {
      const calls: Array<{ operation: string; values: number[] }> = [];
      const ctx = {
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        arc: (...values: number[]) => calls.push({ operation: "arc", values }),
        fill: () => calls.push({ operation: "fill", values: [] }),
        moveTo: (...values: number[]) => calls.push({ operation: "moveTo", values }),
        lineTo: (...values: number[]) => calls.push({ operation: "lineTo", values }),
        closePath: () => calls.push({ operation: "closePath", values: [] }),
        stroke: () => undefined,
        lineCap: "round",
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
      } as unknown as CanvasRenderingContext2D;
      new SprayBrushEngine().renderCompletedDrip(ctx, {
        x: 20,
        y: 30,
        width: 8,
        length: 140,
        opacity: 0.8,
        bend: 12,
        tipWidthRatio: 0.3,
        originPoolRadius: 10,
      }, "#ff0000");
      return calls;
    };
    const first = render();
    expect(first).toEqual(render());
    expect(first.filter(({ operation }) => operation === "arc")).toHaveLength(1);
    const lines = first.filter(({ operation }) => operation === "lineTo");
    expect(first.filter(({ operation }) => operation === "closePath")).toHaveLength(1);
    expect(Math.max(...lines.map(({ values }) => values[1]))).toBeGreaterThan(160);
  });
});
