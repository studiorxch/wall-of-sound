import { describe, it, expect } from "vitest";
import { isEntryRightsCleared } from "./radioPublishRightsGate";
import type { Track } from "../../data/trackTypes";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return { trackId: "t1", title: "Song", artist: "Artist", ...overrides } as Track;
}

describe("isEntryRightsCleared", () => {
  it("clears a track with an explicit studiorich_stream platform-use grant, regardless of sourceOwner", () => {
    expect(isEntryRightsCleared(makeTrack({ sourceOwner: "external", platformUse: ["studiorich_stream"] }))).toBe(true);
  });

  it("clears a studiorich-owned track with no conflicting restriction", () => {
    expect(isEntryRightsCleared(makeTrack({ sourceOwner: "studiorich" }))).toBe(true);
  });

  it("blocks an external track tagged reference_only, even if sourceOwner is later mislabeled", () => {
    expect(isEntryRightsCleared(makeTrack({ sourceOwner: "studiorich", platformUse: ["reference_only"] }))).toBe(false);
  });

  it("blocks an external track tagged do_not_publish", () => {
    expect(isEntryRightsCleared(makeTrack({ sourceOwner: "external", platformUse: ["do_not_publish"] }))).toBe(false);
  });

  it("blocks a track with no sourceOwner and no platformUse at all (truly unresolved)", () => {
    expect(isEntryRightsCleared(makeTrack({}))).toBe(false);
  });

  it("blocks an external track with an unrelated platformUse (e.g. mixcloud only)", () => {
    expect(isEntryRightsCleared(makeTrack({ sourceOwner: "external", platformUse: ["mixcloud"] }))).toBe(false);
  });

  it("blocks a reference-sourced track", () => {
    expect(isEntryRightsCleared(makeTrack({ sourceOwner: "reference" }))).toBe(false);
  });
});
