import { describe, it, expect } from "vitest";
import { suggestArrangementRoles, type SuggestArrangementRolesInput } from "./songRoleSuggestion";
import { RADIO_ARRANGEMENT_ROLES } from "../../data/radioLoopTypes";
import type { NumericProfile } from "../../data/songAnalysisTypes";

function profile(values: number[]): NumericProfile {
  return { sampleCount: values.length, windowSeconds: 1, values };
}

function baseInput(overrides: Partial<SuggestArrangementRolesInput> = {}): SuggestArrangementRolesInput {
  return {
    startFrame: 0, endFrame: 1000, totalFrames: 1000,
    structuralType: "body",
    energyProfile: profile([0.5, 0.5, 0.5, 0.5]),
    densityProfile: profile([0.5, 0.5, 0.5, 0.5]),
    percussiveProfile: profile([0.5, 0.5, 0.5, 0.5]),
    brightnessProfile: profile([0.5, 0.5, 0.5, 0.5]),
    ...overrides,
  };
}

describe("suggestArrangementRoles", () => {
  it("returns a ranked entry for every RADIO_ARRANGEMENT_ROLE, sorted by confidence descending", () => {
    const result = suggestArrangementRoles(baseInput());
    expect(result).toHaveLength(RADIO_ARRANGEMENT_ROLES.length);
    expect(new Set(result.map((r) => r.role))).toEqual(new Set(RADIO_ARRANGEMENT_ROLES));
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i].confidence).toBeGreaterThanOrEqual(result[i + 1].confidence);
    }
  });

  it("keeps every confidence within [0, 1]", () => {
    const result = suggestArrangementRoles(baseInput());
    for (const entry of result) {
      expect(entry.confidence).toBeGreaterThanOrEqual(0);
      expect(entry.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("attaches a non-empty reason string to every suggestion", () => {
    const result = suggestArrangementRoles(baseInput());
    for (const entry of result) {
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason!.length).toBeGreaterThan(0);
    }
  });

  it("ranks 'motion' highest for high density + high percussive activity", () => {
    const result = suggestArrangementRoles(baseInput({
      densityProfile: profile([0.95]), percussiveProfile: profile([0.95]),
      energyProfile: profile([0.5]), brightnessProfile: profile([0.5]),
    }));
    expect(result[0].role).toBe("motion");
  });

  it("ranks 'recovery' highest for low energy + low density", () => {
    const result = suggestArrangementRoles(baseInput({
      energyProfile: profile([0.05]), densityProfile: profile([0.05]),
      percussiveProfile: profile([0.05]), brightnessProfile: profile([0.5]),
    }));
    expect(result[0].role).toBe("recovery");
  });

  it("falls back to a neutral 0.5 for a missing profile rather than throwing", () => {
    const result = suggestArrangementRoles(baseInput({ energyProfile: undefined, densityProfile: undefined, percussiveProfile: undefined, brightnessProfile: undefined }));
    expect(result).toHaveLength(RADIO_ARRANGEMENT_ROLES.length);
  });
});
