import { describe, it, expect } from "vitest";
import type { Track } from "../data/trackTypes";
import { isPendingImportAnalysis, countPendingImportAnalysis } from "./audioReadiness";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("isPendingImportAnalysis", () => {
  it("is true for a fresh import that hasn't been analyzed yet", () => {
    const t = track({ trackId: "t1", analysisSources: ["import"], analysisStatus: "review_needed" });
    expect(isPendingImportAnalysis(t)).toBe(true);
  });

  it("is false once analysis has actually run", () => {
    const t = track({ trackId: "t1", analysisSources: ["import"], analysisStatus: "analyzed" });
    expect(isPendingImportAnalysis(t)).toBe(false);
  });

  it("is false for a track that never went through the import pipeline at all", () => {
    const t = track({ trackId: "t1", analysisStatus: "not_analyzed" });
    expect(isPendingImportAnalysis(t)).toBe(false);
  });
});

describe("countPendingImportAnalysis (0804_MUSIC_Playlist_Eligibility_Repair)", () => {
  it("[test 11 support] counts pending-import tracks for a warning, without removing anything from the input array", () => {
    const tracks = [
      track({ trackId: "a", analysisSources: ["import"], analysisStatus: "review_needed" }),
      track({ trackId: "b", analysisSources: ["import"], analysisStatus: "review_needed" }),
      track({ trackId: "c", analysisStatus: "analyzed" }),
    ];
    expect(countPendingImportAnalysis(tracks)).toBe(2);
    expect(tracks.length).toBe(3); // the function itself never filters/mutates
  });

  it("reproduces the real reported shape: 197/205 pending, 8 not", () => {
    const pending = Array.from({ length: 197 }, (_, i) =>
      track({ trackId: `p${i}`, analysisSources: ["import"], analysisStatus: "review_needed" }));
    const ready = Array.from({ length: 8 }, (_, i) => track({ trackId: `r${i}`, analysisStatus: "analyzed" }));
    expect(countPendingImportAnalysis([...pending, ...ready])).toBe(197);
  });
});
