import { describe, it, expect } from "vitest";
import { evaluateRegionEligibility, recommendDefaultBand } from "./regionEligibility";
import type { StructuralSectionBand } from "../../data/loopTypes";

function band(overrides: Partial<StructuralSectionBand> = {}): StructuralSectionBand {
  return {
    id: "b1", startFrame: 0, endFrame: 1000,
    label: "body", displayLabel: "Body", confidence: "high", source: "canonical_segments",
    ...overrides,
  };
}

describe("evaluateRegionEligibility", () => {
  it("marks body and section eligible", () => {
    const bands = [band({ id: "b1", label: "body" }), band({ id: "b2", label: "section" })];
    const result = evaluateRegionEligibility(bands);
    expect(result).toEqual([{ bandId: "b1", eligible: true }, { bandId: "b2", eligible: true }]);
  });

  it("marks intro and outro not eligible (but still present, not excluded)", () => {
    const bands = [band({ id: "b1", label: "intro" }), band({ id: "b2", label: "outro" })];
    const result = evaluateRegionEligibility(bands);
    expect(result).toEqual([{ bandId: "b1", eligible: false }, { bandId: "b2", eligible: false }]);
  });
});

describe("recommendDefaultBand", () => {
  it("picks the first eligible band when one exists", () => {
    const bands = [
      band({ id: "intro", label: "intro" }),
      band({ id: "body1", label: "body" }),
      band({ id: "outro", label: "outro" }),
    ];
    expect(recommendDefaultBand(bands)?.id).toBe("body1");
  });

  it("falls back to the first band when none are eligible", () => {
    const bands = [band({ id: "intro", label: "intro" }), band({ id: "outro", label: "outro" })];
    expect(recommendDefaultBand(bands)?.id).toBe("intro");
  });

  it("returns undefined for an empty band list", () => {
    expect(recommendDefaultBand([])).toBeUndefined();
  });
});
