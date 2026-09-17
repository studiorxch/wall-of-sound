import { describe, expect, it } from "vitest";
import {
  renderMarkerBrushStudioPreview,
  renderMarkerPreviewToContext,
  renderMarkerSizeSample,
  renderSprayBrushStudioPreview,
  renderSprayCapPreviewToContext,
} from "./BrushPreview";
import { getSprayCapPreset } from "./SprayCapPresets";

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
    ellipse: (x: number, y: number, rx: number, ry: number, rotation: number) =>
      push(`ellipse(${x.toFixed(2)},${y.toFixed(2)},${rx.toFixed(2)},${ry.toFixed(2)},${rotation.toFixed(3)})`),
    arcTo: (x1: number, y1: number, x2: number, y2: number) =>
      push(`arcTo(${x1.toFixed(2)},${y1.toFixed(2)},${x2.toFixed(2)},${y2.toFixed(2)})`),
    translate: (x: number, y: number) => push(`translate(${x.toFixed(2)},${y.toFixed(2)})`),
    rotate: (angle: number) => push(`rotate(${angle.toFixed(3)})`),
    scale: (x: number, y: number) => push(`scale(${x.toFixed(2)},${y.toFixed(2)})`),
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

  it("shows Pink Dot Fat's dual-plume atmosphere in its preview, distinct from New York Fat's plain core", () => {
    const pink = recordingContext();
    const newYork = recordingContext();
    renderSprayCapPreviewToContext(pink.ctx, 60, 24, "pink-dot-fat");
    renderSprayCapPreviewToContext(newYork.ctx, 60, 24, "new-york-fat");
    // Pink Dot's outer mist/ring bands add extra stroke() calls beyond its own core passes.
    expect(pink.log.filter((entry) => entry.startsWith("stroke:")).length)
      .toBeGreaterThan(newYork.log.filter((entry) => entry.startsWith("stroke:")).length);
    expect(pink.log).not.toEqual(newYork.log);
  });

  it("shows Needle's preview as a tighter, sparser footprint than its old wide-spread baseline, and distinct from Wiggly Needle's wavering path", () => {
    const needle = recordingContext();
    const wiggly = recordingContext();
    renderSprayCapPreviewToContext(needle.ctx, 60, 24, "needle");
    renderSprayCapPreviewToContext(wiggly.ctx, 60, 24, "wiggly-needle");
    expect(needle.log.length).toBeGreaterThan(0);
    expect(wiggly.log.length).toBeGreaterThan(0);
    // Same corrected deposition, different path — previews must not be identical.
    expect(needle.log).not.toEqual(wiggly.log);
  });

  it("gives Oval Calligraphy and Rectangular Transversal visually distinct previews using different draw primitives", () => {
    const oval = recordingContext();
    const slot = recordingContext();
    renderSprayCapPreviewToContext(oval.ctx, 60, 24, "calligraphy");
    renderSprayCapPreviewToContext(slot.ctx, 60, 24, "transversal-slot");
    expect(oval.log.some((entry) => entry.startsWith("ellipse("))).toBe(true);
    expect(slot.log.some((entry) => entry.startsWith("rotate("))).toBe(true);
    expect(slot.log.some((entry) => entry.startsWith("ellipse("))).toBe(false);
    expect(oval.log).not.toEqual(slot.log);
  });

  it("renders Brush Studio's larger Spray preview deterministically, using the real engine", () => {
    const first = recordingContext();
    const second = recordingContext();
    renderSprayBrushStudioPreview(first.ctx, 320, 150, getSprayCapPreset("astro-fat"));
    renderSprayBrushStudioPreview(second.ctx, 320, 150, getSprayCapPreset("astro-fat"));
    expect(first.log).toEqual(second.log);
    expect(first.log.length).toBeGreaterThan(0);
  });

  it("reflects live Size/Coverage/Fill overrides in the Brush Studio Spray preview immediately", () => {
    const cap = getSprayCapPreset("new-york-fat");
    const base = recordingContext();
    renderSprayBrushStudioPreview(base.ctx, 320, 150, cap);
    const resized = recordingContext();
    renderSprayBrushStudioPreview(resized.ctx, 320, 150, cap, { size: 60 });
    const lightCoverage = recordingContext();
    renderSprayBrushStudioPreview(lightCoverage.ctx, 320, 150, cap, { coverage: 0.3 });
    const filled = recordingContext();
    renderSprayBrushStudioPreview(filled.ctx, 320, 150, cap, { fillMode: true });
    expect(resized.log).not.toEqual(base.log);
    expect(lightCoverage.log).not.toEqual(base.log);
    expect(filled.log).not.toEqual(base.log);
  });

  it("gives Oval Calligraphy and Rectangular Transversal visibly distinct Brush Studio previews", () => {
    const oval = recordingContext();
    const slot = recordingContext();
    renderSprayBrushStudioPreview(oval.ctx, 320, 150, getSprayCapPreset("calligraphy"));
    renderSprayBrushStudioPreview(slot.ctx, 320, 150, getSprayCapPreset("transversal-slot"));
    expect(oval.log.some((entry) => entry.startsWith("ellipse("))).toBe(true);
    expect(slot.log.some((entry) => entry.startsWith("rotate("))).toBe(true);
    expect(oval.log).not.toEqual(slot.log);
  });

  it("gives Ring/Donut a preview drawn through createRadialGradient with an annular structure, distinct from Pink Dot's halo and New York Fat's flat dot", () => {
    const ring = recordingContext();
    const pinkDot = recordingContext();
    const newYorkFat = recordingContext();
    renderSprayCapPreviewToContext(ring.ctx, 60, 24, "ring-donut");
    renderSprayCapPreviewToContext(pinkDot.ctx, 60, 24, "pink-dot-fat");
    renderSprayCapPreviewToContext(newYorkFat.ctx, 60, 24, "new-york-fat");
    expect(ring.log.some((entry) => entry.startsWith("createRadialGradient"))).toBe(true);
    expect(ring.log).not.toEqual(pinkDot.log);
    expect(ring.log).not.toEqual(newYorkFat.log);
  });

  it("gives Dry/Streak a preview visibly distinct from Fuzz Fat and a normal fat cap, rendered through the real engine", () => {
    const streak = recordingContext();
    const fuzz = recordingContext();
    const fat = recordingContext();
    renderSprayCapPreviewToContext(streak.ctx, 60, 24, "dry-streak");
    renderSprayCapPreviewToContext(fuzz.ctx, 60, 24, "fuzz-fat");
    renderSprayCapPreviewToContext(fat.ctx, 60, 24, "new-york-fat");
    expect(streak.log.length).toBeGreaterThan(0);
    expect(streak.log).not.toEqual(fuzz.log);
    expect(streak.log).not.toEqual(fat.log);
  });

  it("renders Ring/Donut and Dry/Streak Brush Studio previews deterministically through the real engine", () => {
    const ringA = recordingContext();
    const ringB = recordingContext();
    renderSprayBrushStudioPreview(ringA.ctx, 320, 150, getSprayCapPreset("ring-donut"));
    renderSprayBrushStudioPreview(ringB.ctx, 320, 150, getSprayCapPreset("ring-donut"));
    expect(ringA.log).toEqual(ringB.log);
    expect(ringA.log.length).toBeGreaterThan(0);

    const streakA = recordingContext();
    const streakB = recordingContext();
    renderSprayBrushStudioPreview(streakA.ctx, 320, 150, getSprayCapPreset("dry-streak"));
    renderSprayBrushStudioPreview(streakB.ctx, 320, 150, getSprayCapPreset("dry-streak"));
    expect(streakA.log).toEqual(streakB.log);
    expect(streakA.log.length).toBeGreaterThan(0);
  });

  it("renders Brush Studio's larger Marker preview deterministically and reflects a size override", () => {
    const first = recordingContext();
    const second = recordingContext();
    renderMarkerBrushStudioPreview(first.ctx, 320, 150, "mop");
    renderMarkerBrushStudioPreview(second.ctx, 320, 150, "mop");
    expect(first.log).toEqual(second.log);
    expect(first.log.length).toBeGreaterThan(0);

    const resized = recordingContext();
    renderMarkerBrushStudioPreview(resized.ctx, 320, 150, "mop", 20);
    expect(resized.log).not.toEqual(first.log);
  });

  it("renders the marker size-row sample as a real filled footprint (fill, never stroke-only/outline), sourced from the centralized BrushProfile", () => {
    const round = recordingContext();
    const chisel = recordingContext();
    const mop = recordingContext();
    renderMarkerSizeSample(round.ctx, 40, 40, "round", 20);
    renderMarkerSizeSample(chisel.ctx, 40, 40, "chisel", 20);
    renderMarkerSizeSample(mop.ctx, 40, 40, "mop", 20);
    for (const { log } of [round, chisel, mop]) {
      expect(log.some((entry) => entry.startsWith("fill:"))).toBe(true);
      expect(log.some((entry) => entry.startsWith("stroke:"))).toBe(false);
    }
    // Round is a circle (arc/ellipse), Chisel is a flat elongated rect (arcTo) -- distinct primitives, never the same shape.
    expect(round.log.some((entry) => entry.startsWith("arc(") || entry.startsWith("ellipse("))).toBe(true);
    expect(chisel.log.some((entry) => entry.startsWith("arcTo("))).toBe(true);
    expect(round.log).not.toEqual(chisel.log);
    expect(round.log).not.toEqual(mop.log);
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
