import { describe, it, expect } from "vitest";
import { sizeCanvasForDPR } from "./graffitiCanvasRenderer";

// BUILD §33 categories 16-18. Bounds enforcement itself (points clamped to
// [0,1]) is proven in graffitiInputController.test.ts, where the clamping
// actually happens. This file covers the OTHER half of "never leaves the
// intended surface": the canvas element's own backing-store sizing stays
// correctly proportioned for both required aspect ratios — a square
// Sticker canvas (#17) and a wide subway-car-side canvas (#18) — so a
// pointer event anywhere inside the element's CSS box maps to a point
// genuinely within the intended surface, at any devicePixelRatio.

function makeFakeCanvas() {
  return { style: {} as CSSStyleDeclaration, width: 0, height: 0 } as unknown as HTMLCanvasElement;
}

describe("high-DPI canvas sizing — sticker-mode bounds (#17)", () => {
  it("a square sticker canvas scales its backing store by devicePixelRatio while keeping the CSS box at the intended size", () => {
    const canvas = makeFakeCanvas();
    sizeCanvasForDPR(canvas, 500, 500, 2);
    expect(canvas.style.width).toBe("500px");
    expect(canvas.style.height).toBe("500px");
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(1000);
  });
});

describe("high-DPI canvas sizing — car-surface bounds (#18)", () => {
  it("a wide car-side canvas preserves its aspect ratio in both the CSS box and the backing store", () => {
    const canvas = makeFakeCanvas();
    sizeCanvasForDPR(canvas, 900, 175, 3); // matches the real promoted train_base.webp's ~1800x350 (2:1) aspect ratio
    expect(canvas.style.width).toBe("900px");
    expect(canvas.style.height).toBe("175px");
    expect(canvas.width).toBe(2700);
    expect(canvas.height).toBe(525);
    expect(canvas.width / canvas.height).toBeCloseTo(900 / 175, 5);
  });

  it("a fractional devicePixelRatio still rounds to a whole backing-store pixel size (canvas dimensions cannot be fractional)", () => {
    const canvas = makeFakeCanvas();
    sizeCanvasForDPR(canvas, 333, 111, 1.5);
    expect(Number.isInteger(canvas.width)).toBe(true);
    expect(Number.isInteger(canvas.height)).toBe(true);
  });
});
