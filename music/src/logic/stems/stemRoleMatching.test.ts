import { describe, it, expect } from "vitest";
import { matchStemRoleFromFileName } from "./stemRoleMatching";

describe("matchStemRoleFromFileName", () => {
  it("matches each canonical Demucs role name, case-insensitively", () => {
    expect(matchStemRoleFromFileName("vocals.wav")).toBe("vocals");
    expect(matchStemRoleFromFileName("Vocals.wav")).toBe("vocals");
    expect(matchStemRoleFromFileName("DRUMS.wav")).toBe("drums");
    expect(matchStemRoleFromFileName("bass.wav")).toBe("bass");
    expect(matchStemRoleFromFileName("other.wav")).toBe("other");
  });

  it("matches a role name embedded in a longer filename", () => {
    expect(matchStemRoleFromFileName("01-track-vocals-final.wav")).toBe("vocals");
  });

  it("returns null for an unrecognized filename — never guesses", () => {
    expect(matchStemRoleFromFileName("track_04.wav")).toBeNull();
    expect(matchStemRoleFromFileName("untitled.wav")).toBeNull();
  });
});
