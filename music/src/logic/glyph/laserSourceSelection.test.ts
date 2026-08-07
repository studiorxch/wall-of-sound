import { describe, it, expect } from "vitest";
import { selectLaserAudioSource } from "./laserSourceSelection";

const fakeAudio = (tag: string) => ({ mono: new Float32Array([tag.length]), sampleRate: 44100 });

describe("selectLaserAudioSource", () => {
  it("prefers the other-role stem (tier 1) when available", async () => {
    const result = await selectLaserAudioSource({
      hasOtherStem: true, decodeOtherStemAudio: async () => fakeAudio("other"),
      decodeFullMixAudio: async () => fakeAudio("full"),
    });
    expect(result.source).toBe("otherStem");
  });

  it("falls back to instrumentalStem (tier 2) when tier 1 is unavailable", async () => {
    const result = await selectLaserAudioSource({
      hasOtherStem: false, hasInstrumentalStem: true, decodeInstrumentalStemAudio: async () => fakeAudio("instrumental"),
      decodeFullMixAudio: async () => fakeAudio("full"),
    });
    expect(result.source).toBe("instrumentalStem");
  });

  it("falls back to fullMix when no stem tier is available", async () => {
    const result = await selectLaserAudioSource({ hasOtherStem: false, decodeFullMixAudio: async () => fakeAudio("full") });
    expect(result.source).toBe("fullMix");
  });

  it("falls back to fullMix when hasOtherStem is true but no decoder is supplied", async () => {
    const result = await selectLaserAudioSource({ hasOtherStem: true, decodeFullMixAudio: async () => fakeAudio("full") });
    expect(result.source).toBe("fullMix");
  });

  it("tier 1 takes priority over tier 2 when both are available", async () => {
    const result = await selectLaserAudioSource({
      hasOtherStem: true, decodeOtherStemAudio: async () => fakeAudio("other"),
      hasInstrumentalStem: true, decodeInstrumentalStemAudio: async () => fakeAudio("instrumental"),
      decodeFullMixAudio: async () => fakeAudio("full"),
    });
    expect(result.source).toBe("otherStem");
  });

  it("only ever resolves to one of the three documented tiers", async () => {
    const result = await selectLaserAudioSource({ hasOtherStem: false, decodeFullMixAudio: async () => fakeAudio("full") });
    expect(["otherStem", "instrumentalStem", "fullMix"]).toContain(result.source);
  });
});
