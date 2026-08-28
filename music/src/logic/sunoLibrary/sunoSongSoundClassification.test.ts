import { describe, expect, it } from "vitest";
import {
  classifySunoDuration,
  computeSunoSongSoundSummary,
  applySunoSongSoundFilter,
} from "./sunoSongSoundClassification";

describe("classifySunoDuration", () => {
  it("classifies >= 60s as song", () => {
    expect(classifySunoDuration(60)).toBe("song");
    expect(classifySunoDuration(180)).toBe("song");
  });

  it("classifies < 60s as sound", () => {
    expect(classifySunoDuration(59.999)).toBe("sound");
    expect(classifySunoDuration(1)).toBe("sound");
  });

  it("treats missing/invalid duration as unresolved, never a guess", () => {
    expect(classifySunoDuration(null)).toBe("unresolved");
    expect(classifySunoDuration(undefined)).toBe("unresolved");
    expect(classifySunoDuration(0)).toBe("unresolved");
    expect(classifySunoDuration(-5)).toBe("unresolved");
    expect(classifySunoDuration(NaN)).toBe("unresolved");
    expect(classifySunoDuration(Infinity)).toBe("unresolved");
  });
});

describe("computeSunoSongSoundSummary", () => {
  it("counts songs, sounds, and unresolved separately", () => {
    const recs = [
      { totalDurationSeconds: 200 },
      { totalDurationSeconds: 30 },
      { totalDurationSeconds: 0 },
      { totalDurationSeconds: 65 },
    ];
    expect(computeSunoSongSoundSummary(recs)).toEqual({ songs: 2, sounds: 1, unresolved: 1, total: 4 });
  });
});

describe("applySunoSongSoundFilter", () => {
  const recs = [
    { id: "a", totalDurationSeconds: 200 },
    { id: "b", totalDurationSeconds: 30 },
    { id: "c", totalDurationSeconds: 0 },
  ];

  it("returns all records unchanged when filter is null", () => {
    expect(applySunoSongSoundFilter(recs, null)).toEqual(recs);
  });

  it("filters to only the requested class", () => {
    expect(applySunoSongSoundFilter(recs, "song").map((r) => r.id)).toEqual(["a"]);
    expect(applySunoSongSoundFilter(recs, "sound").map((r) => r.id)).toEqual(["b"]);
    expect(applySunoSongSoundFilter(recs, "unresolved").map((r) => r.id)).toEqual(["c"]);
  });
});
