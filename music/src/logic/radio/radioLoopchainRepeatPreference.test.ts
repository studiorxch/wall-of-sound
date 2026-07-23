import { describe, expect, it } from "vitest";
import { resolveRepeatPreference } from "./radioLoopchainRepeatPreference";

describe("resolveRepeatPreference", () => {
  it("forces intro to 1x regardless of preference", () => {
    expect(resolveRepeatPreference("intro", "low")).toEqual({ mode: "repeatCount", count: 1 });
    expect(resolveRepeatPreference("intro", "medium")).toEqual({ mode: "repeatCount", count: 1 });
    expect(resolveRepeatPreference("intro", "high")).toEqual({ mode: "repeatCount", count: 1 });
  });

  it("forces outro to 1x regardless of preference", () => {
    expect(resolveRepeatPreference("outro", "low")).toEqual({ mode: "repeatCount", count: 1 });
    expect(resolveRepeatPreference("outro", "high")).toEqual({ mode: "repeatCount", count: 1 });
  });

  it("gives repetition-friendly roles (chorus/body/bridge) higher ceilings", () => {
    expect(resolveRepeatPreference("chorus", "low").mode).toBe("repeatCount");
    const low = resolveRepeatPreference("chorus", "low") as { count: number };
    const medium = resolveRepeatPreference("body", "medium") as { count: number };
    const high = resolveRepeatPreference("bridge", "high") as { count: number };
    expect(low.count).toBeLessThan(medium.count);
    expect(medium.count).toBeLessThan(high.count);
    expect(high.count).toBeGreaterThanOrEqual(8);
  });

  it("gives forward-moving roles (verse/breakdown/interlude) lower ceilings than repetition-friendly roles", () => {
    const verseHigh = resolveRepeatPreference("verse", "high") as { count: number };
    const chorusHigh = resolveRepeatPreference("chorus", "high") as { count: number };
    expect(verseHigh.count).toBeLessThan(chorusHigh.count);
  });

  it("uses a conservative table for ambiguous roles", () => {
    const unknownHigh = resolveRepeatPreference("unknown", "high") as { count: number };
    const chorusHigh = resolveRepeatPreference("chorus", "high") as { count: number };
    expect(unknownHigh.count).toBeLessThan(chorusHigh.count);
    expect(resolveRepeatPreference("full_composition", "low")).toEqual({ mode: "repeatCount", count: 1 });
  });

  it("always returns repeatCount mode, never targetResidenceSeconds", () => {
    expect(resolveRepeatPreference("body", "medium").mode).toBe("repeatCount");
  });
});
