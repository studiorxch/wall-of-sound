import { describe, it, expect } from "vitest";
import { buildRenderFileName, resolveCollisionFreeFileName } from "./loopRenderNaming";

describe("buildRenderFileName", () => {
  it("matches the spec's canonical example when bars/BPM are available", () => {
    expect(buildRenderFileName({
      artist: "StudioRich", trackTitle: "Lo Pulse", sectionLabel: "Groove A",
      barCount: 8, bpm: 80, durationSeconds: 4,
    })).toBe("StudioRich - Lo Pulse - Groove A - 8bar - 80bpm.wav");
  });

  it("falls back to duration-based naming when bar/BPM is unavailable", () => {
    expect(buildRenderFileName({
      trackTitle: "Track", sectionLabel: "Intro", durationSeconds: 8.4,
    })).toBe("Track - Intro - 8s.wav");
  });

  it("sanitizes filesystem-unsafe characters via the shared sanitizer", () => {
    expect(buildRenderFileName({
      artist: "A/B", trackTitle: "T?", sectionLabel: "S*", durationSeconds: 5,
    })).toBe("AB - T - S - 5s.wav");
  });
});

describe("resolveCollisionFreeFileName", () => {
  it("returns the name unchanged when there is no collision", () => {
    expect(resolveCollisionFreeFileName("Track - Intro.wav", new Set())).toBe("Track - Intro.wav");
  });

  it("appends -v2 on first collision", () => {
    expect(resolveCollisionFreeFileName("Track - Intro.wav", new Set(["Track - Intro.wav"])))
      .toBe("Track - Intro - v2.wav");
  });

  it("increments through multiple collisions", () => {
    const existing = new Set(["Track - Intro.wav", "Track - Intro - v2.wav", "Track - Intro - v3.wav"]);
    expect(resolveCollisionFreeFileName("Track - Intro.wav", existing)).toBe("Track - Intro - v4.wav");
  });
});
