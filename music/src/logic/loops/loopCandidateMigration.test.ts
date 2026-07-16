import { describe, it, expect } from "vitest";
import { inferLegacyLoopLength, migrateLegacyLoopGenerationMode } from "./loopCandidateMigration";

describe("inferLegacyLoopLength", () => {
  it("infers seconds length when duration matches a supported value within tolerance", () => {
    const result = inferLegacyLoopLength({ durationSeconds: 8.0, barCount: undefined, length: undefined });
    expect(result).toEqual({ kind: "seconds", seconds: 8, expectedDurationSeconds: 8 });
  });

  it("does not relabel an existing 8-second candidate as 8 bars", () => {
    const result = inferLegacyLoopLength({ durationSeconds: 8.0, barCount: undefined, length: undefined });
    expect(result?.kind).toBe("seconds");
  });

  it("leaves length unset when duration matches no supported value", () => {
    const result = inferLegacyLoopLength({ durationSeconds: 11.3, barCount: undefined, length: undefined });
    expect(result).toBeUndefined();
  });

  it("does nothing when barCount already exists (real bar metadata, nothing to migrate)", () => {
    const result = inferLegacyLoopLength({ durationSeconds: 16, barCount: 8, length: undefined });
    expect(result).toBeUndefined();
  });

  it("returns the existing length unchanged when already present", () => {
    const length = { kind: "bars" as const, bars: 8 as const, beatCount: 32, expectedDurationSeconds: 16 };
    const result = inferLegacyLoopLength({ durationSeconds: 16, barCount: 8, length });
    expect(result).toBe(length);
  });
});

describe("migrateLegacyLoopGenerationMode", () => {
  it("migrates a legacy loop with no generationMode to time_fallback", () => {
    expect(migrateLegacyLoopGenerationMode({ generationMode: undefined, barCount: undefined })).toBe("time_fallback");
  });

  it("never infers trusted_grid for a legacy loop, even if it happens to have a barCount", () => {
    expect(migrateLegacyLoopGenerationMode({ generationMode: undefined, barCount: 8 })).toBe("time_fallback");
  });

  it("returns the existing generationMode unchanged when already present", () => {
    expect(migrateLegacyLoopGenerationMode({ generationMode: "trusted_grid", barCount: 8 })).toBe("trusted_grid");
  });
});
