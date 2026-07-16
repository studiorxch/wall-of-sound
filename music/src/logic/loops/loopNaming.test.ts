import { describe, it, expect } from "vitest";
import { buildLoopFileName } from "./loopNaming";

describe("buildLoopFileName", () => {
  it("matches the spec's exact example", () => {
    expect(buildLoopFileName({
      artist: "StudioRich", trackTitle: "Lo Pulse", sectionLabel: "Groove A", barCount: 8, bpm: 80,
    })).toBe("StudioRich - Lo Pulse - Groove A - 8bar - 80bpm.wav");
  });

  it("omits missing optional fields cleanly", () => {
    expect(buildLoopFileName({ trackTitle: "Track", sectionLabel: "Intro" })).toBe("Track - Intro.wav");
  });

  it("sanitizes filesystem-unsafe characters", () => {
    expect(buildLoopFileName({ artist: "A/B:C", trackTitle: "Track?", sectionLabel: "Groove*" }))
      .toBe("ABC - Track - Groove.wav");
  });

  it("rounds bar count and bpm", () => {
    expect(buildLoopFileName({ trackTitle: "T", sectionLabel: "S", barCount: 8.4, bpm: 119.6 }))
      .toBe("T - S - 8bar - 120bpm.wav");
  });
});
