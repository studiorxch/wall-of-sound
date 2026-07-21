import { describe, it, expect } from "vitest";
import { mapStructuralBandsToSongSections } from "./songSectionMapper";
import type { StructuralSectionBand } from "../../data/loopTypes";

function band(overrides: Partial<StructuralSectionBand> = {}): StructuralSectionBand {
  return {
    id: "structband_x", startFrame: 0, endFrame: 1000,
    label: "intro", displayLabel: "Intro", confidence: "high", source: "heuristic",
    ...overrides,
  };
}

function makeIdGen(): () => string {
  let n = 0;
  return () => `songsec_test_${n++}`;
}

describe("mapStructuralBandsToSongSections", () => {
  it("maps intro/body/outro labels straight across and section to unknown", () => {
    const bands = [
      band({ label: "intro" }),
      band({ label: "body" }),
      band({ label: "outro" }),
      band({ label: "section" }),
    ];
    const sections = mapStructuralBandsToSongSections(bands, "track_1", makeIdGen());
    expect(sections.map((s) => s.structuralType)).toEqual(["intro", "body", "outro", "unknown"]);
  });

  it("maps confidence high→0.85 and provisional→0.4", () => {
    const bands = [band({ confidence: "high" }), band({ confidence: "provisional" })];
    const sections = mapStructuralBandsToSongSections(bands, "track_1", makeIdGen());
    expect(sections[0].confidence).toBe(0.85);
    expect(sections[1].confidence).toBe(0.4);
  });

  it("always sets verification to provisional and origin to analyzer", () => {
    const sections = mapStructuralBandsToSongSections([band()], "track_1", makeIdGen());
    expect(sections[0].verification).toBe("provisional");
    expect(sections[0].origin).toBe("analyzer");
  });

  it("assigns a stable id once per section, distinct across sections, via the injected genId — never derived from bounds", () => {
    const bands = [band({ startFrame: 0, endFrame: 100 }), band({ startFrame: 100, endFrame: 200 })];
    const sections = mapStructuralBandsToSongSections(bands, "track_1", makeIdGen());
    expect(sections[0].id).not.toBe(sections[1].id);
    // Ids come from the injected genId, never from startFrame/endFrame —
    // two sections with different bounds still get sequential test ids,
    // not bounds-derived ones like `${type}_${startFrame}_${endFrame}`.
    expect(sections[0].id).toBe("songsec_test_0");
    expect(sections[1].id).toBe("songsec_test_1");
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
  });

  it("preserves half-open [startFrame, endFrame) frame ranges exactly", () => {
    const bands = [band({ startFrame: 1234, endFrame: 5678 })];
    const sections = mapStructuralBandsToSongSections(bands, "track_1", makeIdGen());
    expect(sections[0].startFrame).toBe(1234);
    expect(sections[0].endFrame).toBe(5678);
  });

  it("stamps sourceTrackId and displayLabel from the band", () => {
    const bands = [band({ displayLabel: "Custom Intro" })];
    const sections = mapStructuralBandsToSongSections(bands, "track_42", makeIdGen());
    expect(sections[0].sourceTrackId).toBe("track_42");
    expect(sections[0].displayLabel).toBe("Custom Intro");
  });

  it("returns an empty array for an empty band list", () => {
    expect(mapStructuralBandsToSongSections([], "track_1", makeIdGen())).toEqual([]);
  });
});
