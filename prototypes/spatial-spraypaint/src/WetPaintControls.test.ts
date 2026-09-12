import { describe, expect, it } from "vitest";
import {
  INITIAL_WET_PAINT_CONTROLS,
  resolveWetPaintControlModifiers,
  updateWetPaintControls,
} from "./WetPaintControls";

describe("wet paint control authority", () => {
  it("maps Flow to physically meaningful delivery, buildup, threshold, and width", () => {
    const low = resolveWetPaintControlModifiers({ flow: "low", viscosity: "balanced" });
    const high = resolveWetPaintControlModifiers({ flow: "high", viscosity: "balanced" });
    expect(high.delivery).toBeGreaterThan(low.delivery);
    expect(high.dwellResponse).toBeGreaterThan(low.dwellResponse);
    expect(high.threshold).toBeLessThan(low.threshold);
    expect(high.width).toBeGreaterThan(low.width);
  });

  it("maps Viscosity to run width, length, and gravity duration", () => {
    const thick = resolveWetPaintControlModifiers({ flow: "balanced", viscosity: "thick" });
    const runny = resolveWetPaintControlModifiers({ flow: "balanced", viscosity: "runny" });
    expect(thick.width).toBeGreaterThan(runny.width);
    expect(runny.length).toBeGreaterThan(thick.length);
    expect(runny.gravityDuration).toBeLessThan(thick.gravityDuration);
    expect(runny.threshold).toBeLessThan(thick.threshold);
  });

  it("updates one contextual dimension without mutating the other", () => {
    expect(updateWetPaintControls(INITIAL_WET_PAINT_CONTROLS, { flow: "high" })).toEqual({
      flow: "high",
      viscosity: "balanced",
    });
    expect(INITIAL_WET_PAINT_CONTROLS).toEqual({ flow: "balanced", viscosity: "balanced" });
  });
});
