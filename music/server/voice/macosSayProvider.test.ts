import { describe, expect, it } from "vitest";
import { macOsSayVoicePresentation } from "./macosSayProvider";

describe("macOS Say presentation metadata", () => {
  it("uses explicit metadata for known voices", () => {
    expect(macOsSayVoicePresentation("Samantha")).toBe("female");
    expect(macOsSayVoicePresentation("Daniel")).toBe("male");
    expect(macOsSayVoicePresentation("Bells")).toBe("neutral_other");
  });

  it("does not infer presentation for unmapped provider voices", () => {
    expect(macOsSayVoicePresentation("Unmapped Voice")).toBe("unknown");
  });
});
