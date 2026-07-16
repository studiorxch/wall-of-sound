import { describe, it, expect } from "vitest";
import { isStemTrack, resolveParentTrack, stemRoleLabel } from "./stemLineage";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "t1", title: "White Ropes", artist: "Soulphiction",
    durationSeconds: 300, energy: 0.5, energySource: "manual",
    ...overrides,
  };
}

describe("isStemTrack", () => {
  it("is true only when derivedKind is exactly 'stem'", () => {
    expect(isStemTrack(track({ derivedKind: "stem" }))).toBe(true);
    expect(isStemTrack(track({ derivedKind: undefined }))).toBe(false);
    expect(isStemTrack(track())).toBe(false);
  });

  it("is true for a stem with no stemRole and no parentTrackId — derivedKind alone is sufficient", () => {
    expect(isStemTrack(track({ derivedKind: "stem", stemRole: undefined, parentTrackId: undefined }))).toBe(true);
  });

  it("does not treat parentTrackId presence alone as stem-ness", () => {
    expect(isStemTrack(track({ parentTrackId: "parent_1" }))).toBe(false);
  });

  it("is false for undefined/null track", () => {
    expect(isStemTrack(undefined)).toBe(false);
    expect(isStemTrack(null)).toBe(false);
  });
});

describe("resolveParentTrack", () => {
  it("finds the parent track by id", () => {
    const parent = track({ trackId: "parent_1", title: "White Ropes" });
    const stem = track({ trackId: "stem_1", derivedKind: "stem", parentTrackId: "parent_1" });
    expect(resolveParentTrack(stem, [parent, stem])?.trackId).toBe("parent_1");
  });

  it("returns undefined when there is no parentTrackId", () => {
    expect(resolveParentTrack(track(), [track({ trackId: "parent_1" })])).toBeUndefined();
  });

  it("returns undefined when the parent isn't in the library list", () => {
    const stem = track({ trackId: "stem_1", derivedKind: "stem", parentTrackId: "missing" });
    expect(resolveParentTrack(stem, [stem])).toBeUndefined();
  });
});

describe("stemRoleLabel", () => {
  it("labels each known role", () => {
    expect(stemRoleLabel("vocals")).toBe("Vocals");
    expect(stemRoleLabel("drums")).toBe("Drums");
    expect(stemRoleLabel("bass")).toBe("Bass");
    expect(stemRoleLabel("other")).toBe("Other");
  });

  it("falls back to the generic 'Stem' label when role is unset", () => {
    expect(stemRoleLabel(undefined)).toBe("Stem");
  });
});
