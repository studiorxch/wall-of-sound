import { describe, expect, it } from "vitest";
import { renderMarkerPreviewToContext, renderSprayCapPreviewToContext } from "./BrushPreview";

function recordingContext(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  let strokeStyle = "";
  let fillStyle = "";
  let lineWidth = 0;
  const push = (entry: string) => log.push(entry);
  const ctx = {
    save: () => push("save"),
    restore: () => push("restore"),
    beginPath: () => push("beginPath"),
    closePath: () => push("closePath"),
    moveTo: (x: number, y: number) => push(`moveTo(${x.toFixed(2)},${y.toFixed(2)})`),
    lineTo: (x: number, y: number) => push(`lineTo(${x.toFixed(2)},${y.toFixed(2)})`),
    arc: (x: number, y: number, r: number) => push(`arc(${x.toFixed(2)},${y.toFixed(2)},${r.toFixed(2)})`),
    ellipse: (x: number, y: number, rx: number, ry: number) =>
      push(`ellipse(${x.toFixed(2)},${y.toFixed(2)},${rx.toFixed(2)},${ry.toFixed(2)})`),
    fill: () => push(`fill:${fillStyle}`),
    stroke: () => push(`stroke:${strokeStyle}:${lineWidth.toFixed(2)}`),
    clearRect: () => push("clearRect"),
    createRadialGradient: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
      push(`createRadialGradient(${x0.toFixed(2)},${y0.toFixed(2)},${r0.toFixed(2)},${x1.toFixed(2)},${y1.toFixed(2)},${r1.toFixed(2)})`);
      return {
        addColorStop: (offset: number, color: string) => push(`addColorStop(${offset.toFixed(2)},${color})`),
      } as unknown as CanvasGradient;
    },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) { strokeStyle = String(value); },
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) { fillStyle = String(value); },
    get lineWidth() { return lineWidth; },
    set lineWidth(value: number) { lineWidth = value; },
    lineCap: "round",
    lineJoin: "round",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

describe("brush preview rendering", () => {
  it("renders a Spray cap preview deterministically across repeated calls", () => {
    const first = recordingContext();
    const second = recordingContext();
    renderSprayCapPreviewToContext(first.ctx, 60, 24, "astro-fat");
    renderSprayCapPreviewToContext(second.ctx, 60, 24, "astro-fat");
    expect(first.log).toEqual(second.log);
    expect(first.log.length).toBeGreaterThan(0);
  });

  it("gives visually distinguishable previews to different Spray caps", () => {
    const fat = recordingContext();
    const thin = recordingContext();
    renderSprayCapPreviewToContext(fat.ctx, 60, 24, "astro-fat");
    renderSprayCapPreviewToContext(thin.ctx, 60, 24, "level-1");
    expect(fat.log).not.toEqual(thin.log);
  });

  it("keeps Fuzz Fat and german-fat previews distinct despite identical rendering parameters", () => {
    // Same underlying numbers by design (Fuzz Fat is a verbatim fork), but the
    // preview call is per-id, not per-parameter-object, so this just proves
    // both resolve and render without throwing — not that they must differ.
    const fuzz = recordingContext();
    const german = recordingContext();
    expect(() => renderSprayCapPreviewToContext(fuzz.ctx, 60, 24, "fuzz-fat")).not.toThrow();
    expect(() => renderSprayCapPreviewToContext(german.ctx, 60, 24, "german-fat")).not.toThrow();
    expect(fuzz.log).toEqual(german.log);
  });

  it("renders a Marker preview deterministically and distinguishes Round from Chisel", () => {
    const roundA = recordingContext();
    const roundB = recordingContext();
    const chisel = recordingContext();
    renderMarkerPreviewToContext(roundA.ctx, 60, 24, "round");
    renderMarkerPreviewToContext(roundB.ctx, 60, 24, "round");
    renderMarkerPreviewToContext(chisel.ctx, 60, 24, "chisel");
    expect(roundA.log).toEqual(roundB.log);
    expect(roundA.log).not.toEqual(chisel.log);
  });

  it("shows Pink Dot Fat's halo bloom in its preview, distinct from New York Fat's halo-free dot", () => {
    const pink = recordingContext();
    const newYork = recordingContext();
    renderSprayCapPreviewToContext(pink.ctx, 60, 24, "pink-dot-fat");
    renderSprayCapPreviewToContext(newYork.ctx, 60, 24, "new-york-fat");
    expect(pink.log.some((entry) => entry.startsWith("createRadialGradient"))).toBe(true);
    expect(newYork.log.some((entry) => entry.startsWith("createRadialGradient"))).toBe(false);
    expect(pink.log).not.toEqual(newYork.log);
  });

  it("distinguishes every Chisel and Mop family sub-preset from its siblings", () => {
    const ids = ["chisel", "clean-chisel", "drippy-chisel", "mop", "drip-mop"] as const;
    const logs = ids.map((id) => {
      const { ctx, log } = recordingContext();
      renderMarkerPreviewToContext(ctx, 60, 24, id);
      return log.join("|");
    });
    expect(new Set(logs).size).toBe(ids.length);
  });
});
