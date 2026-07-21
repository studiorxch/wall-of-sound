import { describe, it, expect } from "vitest";
import { createSongSectionRevision, resolveActiveSongSection } from "./songSectionRevisions";
import type { SongSection, SongSectionRevision } from "../../data/songAnalysisTypes";

function section(overrides: Partial<SongSection> = {}): SongSection {
  return {
    id: "songsec_1", sourceTrackId: "track_1",
    structuralType: "body", displayLabel: "Body",
    startFrame: 1000, endFrame: 5000,
    confidence: 0.85, verification: "provisional", origin: "analyzer",
    ...overrides,
  };
}

function revision(overrides: Partial<SongSectionRevision> = {}): SongSectionRevision {
  return {
    id: "songsecrev_1", sectionId: "songsec_1",
    createdAt: "t1", createdBy: "user",
    ...overrides,
  };
}

describe("createSongSectionRevision", () => {
  it("creates a revision pointing at the section without mutating it", () => {
    const s = section();
    const rev = createSongSectionRevision(s, { structuralType: "chorus" }, "t1");
    expect(rev.sectionId).toBe("songsec_1");
    expect(rev.structuralType).toBe("chorus");
    expect(rev.createdBy).toBe("user");
    expect(rev.createdAt).toBe("t1");
    // Original section object is untouched.
    expect(s.structuralType).toBe("body");
    expect(s.activeRevisionId).toBeUndefined();
  });

  it("only sets the fields explicitly passed in opts, leaving the rest undefined", () => {
    const rev = createSongSectionRevision(section(), { verification: "reviewed" }, "t1");
    expect(rev.verification).toBe("reviewed");
    expect(rev.structuralType).toBeUndefined();
    expect(rev.startFrame).toBeUndefined();
    expect(rev.endFrame).toBeUndefined();
  });

  it("links parentRevisionId when provided", () => {
    const rev = createSongSectionRevision(section(), { parentRevisionId: "songsecrev_0" }, "t1");
    expect(rev.parentRevisionId).toBe("songsecrev_0");
  });

  it("generates a distinct id per call", () => {
    const a = createSongSectionRevision(section(), {}, "t1");
    const b = createSongSectionRevision(section(), {}, "t1");
    expect(a.id).not.toBe(b.id);
  });
});

describe("resolveActiveSongSection", () => {
  it("falls back to the section's own analyzer-origin values when there is no active revision", () => {
    const s = section({ activeRevisionId: undefined });
    const resolved = resolveActiveSongSection(s, []);
    expect(resolved.structuralType).toBe("body");
    expect(resolved.displayLabel).toBe("Body");
    expect(resolved.startFrame).toBe(1000);
    expect(resolved.endFrame).toBe(5000);
    expect(resolved.verification).toBe("provisional");
    expect(resolved.activeRevision).toBeUndefined();
  });

  it("merges only the fields the active revision overrides, falling back for the rest", () => {
    const s = section({ activeRevisionId: "songsecrev_2" });
    const revisions = [
      revision({ id: "songsecrev_1", structuralType: "chorus" }),
      revision({ id: "songsecrev_2", structuralType: "bridge", verification: "verified" }),
    ];
    const resolved = resolveActiveSongSection(s, revisions);
    expect(resolved.structuralType).toBe("bridge");
    expect(resolved.verification).toBe("verified");
    // Untouched by the active revision — falls back to the section's own value.
    expect(resolved.displayLabel).toBe("Body");
    expect(resolved.startFrame).toBe(1000);
    expect(resolved.endFrame).toBe(5000);
    expect(resolved.activeRevision?.id).toBe("songsecrev_2");
  });

  it("falls back to the section's own values when activeRevisionId points at a revision that isn't in the list", () => {
    const s = section({ activeRevisionId: "songsecrev_missing" });
    const resolved = resolveActiveSongSection(s, [revision({ id: "songsecrev_other" })]);
    expect(resolved.structuralType).toBe("body");
    expect(resolved.activeRevision).toBeUndefined();
  });

  it("a boundary-drag revision overrides only startFrame/endFrame, leaving structuralType/verification untouched", () => {
    const s = section({ activeRevisionId: "songsecrev_3", verification: "reviewed" });
    const resolved = resolveActiveSongSection(s, [revision({ id: "songsecrev_3", startFrame: 2000, endFrame: 6000 })]);
    expect(resolved.startFrame).toBe(2000);
    expect(resolved.endFrame).toBe(6000);
    expect(resolved.structuralType).toBe("body");
    expect(resolved.verification).toBe("reviewed");
  });
});
