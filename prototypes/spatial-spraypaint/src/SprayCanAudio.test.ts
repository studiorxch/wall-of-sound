import { describe, expect, it } from "vitest";
import { resolveSprayAudioTransition } from "./SprayCanAudio";

describe("spray audio state", () => {
  it("starts once at the beginning of a continuous spray", () => {
    expect(resolveSprayAudioTransition(false, true)).toBe("start");
    expect(resolveSprayAudioTransition(true, true)).toBe("none");
  });

  it("stops once when spray ends", () => {
    expect(resolveSprayAudioTransition(true, false)).toBe("stop");
    expect(resolveSprayAudioTransition(false, false)).toBe("none");
  });
});
