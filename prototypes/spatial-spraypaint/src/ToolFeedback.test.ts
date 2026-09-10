import { describe, expect, it } from "vitest";
import { resolveToolFeedback } from "./ToolFeedback";

describe("Tool material feedback authority", () => {
  it("preserves Spray hiss during an allowed Spray gesture", () => {
    expect(resolveToolFeedback("spray-can", true)).toEqual({
      sprayHissActive: true,
      materialState: "hiss",
    });
  });

  it("keeps Paint Marker silent without fabricating an effect", () => {
    expect(resolveToolFeedback("paint-marker", true)).toEqual({
      sprayHissActive: false,
      materialState: "marking",
    });
  });

  it("stops every tool's active feedback when drawing ends", () => {
    expect(resolveToolFeedback("spray-can", false).sprayHissActive).toBe(false);
    expect(resolveToolFeedback("paint-marker", false).sprayHissActive).toBe(false);
  });
});
