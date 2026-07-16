import { describe, it, expect } from "vitest";
import { matchStemRoleFromFileName, buildNewStemTracks } from "./stemRegistration";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "parent1", title: "White Ropes", artist: "Soulphiction",
    durationSeconds: 235.26, energy: 0.5, energySource: "manual",
    ...overrides,
  };
}

describe("matchStemRoleFromFileName", () => {
  it("matches each known Demucs role by filename", () => {
    expect(matchStemRoleFromFileName("drums.mp3")).toBe("drums");
    expect(matchStemRoleFromFileName("bass.mp3")).toBe("bass");
    expect(matchStemRoleFromFileName("vocals.mp3")).toBe("vocals");
    expect(matchStemRoleFromFileName("other.mp3")).toBe("other");
  });

  it("is case-insensitive", () => {
    expect(matchStemRoleFromFileName("DRUMS.MP3")).toBe("drums");
  });

  it("returns null for an unrecognized filename", () => {
    expect(matchStemRoleFromFileName("track_export_final.wav")).toBeNull();
  });
});

describe("buildNewStemTracks", () => {
  it("creates one Track per entry, all pointing back to the parent", () => {
    const parent = track();
    const result = buildNewStemTracks({
      libraryTracks: [parent],
      parentTrack: parent,
      entries: [
        { role: "drums", fileName: "drums.mp3", filePath: "/tmp/drums.mp3" },
        { role: "bass", fileName: "bass.mp3", filePath: "/tmp/bass.mp3" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.derivedKind === "stem" && t.parentTrackId === "parent1")).toBe(true);
    expect(result.map((t) => t.stemRole).sort()).toEqual(["bass", "drums"]);
  });

  it("skips a role already registered for this parent (idempotent)", () => {
    const parent = track();
    const existingDrumsStem = track({
      trackId: "existing_drums", derivedKind: "stem", parentTrackId: "parent1", stemRole: "drums",
    });
    const result = buildNewStemTracks({
      libraryTracks: [parent, existingDrumsStem],
      parentTrack: parent,
      entries: [
        { role: "drums", fileName: "drums.mp3", filePath: "/tmp/drums.mp3" },
        { role: "bass", fileName: "bass.mp3", filePath: "/tmp/bass.mp3" },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].stemRole).toBe("bass");
  });

  it("does not register the same role twice within one batch", () => {
    const parent = track();
    const result = buildNewStemTracks({
      libraryTracks: [parent],
      parentTrack: parent,
      entries: [
        { role: "drums", fileName: "drums.mp3", filePath: "/tmp/a/drums.mp3" },
        { role: "drums", fileName: "drums (1).mp3", filePath: "/tmp/b/drums.mp3" },
      ],
    });
    expect(result).toHaveLength(1);
  });

  it("does not register stems already belonging to a DIFFERENT parent as if they were this parent's", () => {
    const parent = track({ trackId: "parent1" });
    const otherParentStem = track({
      trackId: "other_drums", derivedKind: "stem", parentTrackId: "some_other_track", stemRole: "drums",
    });
    const result = buildNewStemTracks({
      libraryTracks: [parent, otherParentStem],
      parentTrack: parent,
      entries: [{ role: "drums", fileName: "drums.mp3", filePath: "/tmp/drums.mp3" }],
    });
    expect(result).toHaveLength(1);
  });
});
