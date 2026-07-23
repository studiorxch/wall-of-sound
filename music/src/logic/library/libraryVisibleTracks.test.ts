import { describe, it, expect } from "vitest";
import { isMigratedLegacyStem, selectVisibleLibraryTracks } from "./libraryVisibleTracks";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track>): Track {
  return { trackId: "t1", title: "Track", artist: "Artist", durationSeconds: 100, energy: 0.5, energySource: "estimated", ...overrides };
}

describe("isMigratedLegacyStem", () => {
  it("true only for a derivedKind:stem track whose migration status is migrated", () => {
    expect(isMigratedLegacyStem(track({ derivedKind: "stem", stemArchiveMigration: { status: "migrated" } }))).toBe(true);
  });

  it("false for a needs_review or rejected legacy stem — stays fully visible until resolved", () => {
    expect(isMigratedLegacyStem(track({ derivedKind: "stem", stemArchiveMigration: { status: "needs_review" } }))).toBe(false);
    expect(isMigratedLegacyStem(track({ derivedKind: "stem", stemArchiveMigration: { status: "rejected" } }))).toBe(false);
  });

  it("false for a derivedKind:stem track with no migration record at all", () => {
    expect(isMigratedLegacyStem(track({ derivedKind: "stem" }))).toBe(false);
  });

  it("false for an ordinary track, even with a (meaningless) migration field somehow set", () => {
    expect(isMigratedLegacyStem(track({}))).toBe(false);
  });
});

describe("selectVisibleLibraryTracks", () => {
  it("filters out only migrated legacy stems, keeping everything else", () => {
    const tracks = [
      track({ trackId: "a" }),
      track({ trackId: "b", derivedKind: "stem", stemArchiveMigration: { status: "migrated" } }),
      track({ trackId: "c", derivedKind: "stem", stemArchiveMigration: { status: "needs_review" } }),
      track({ trackId: "d", derivedKind: "stem" }),
    ];
    const visible = selectVisibleLibraryTracks(tracks).map((t) => t.trackId);
    expect(visible).toEqual(["a", "c", "d"]);
  });

  it("never mutates the underlying Track records", () => {
    const original = track({ trackId: "b", derivedKind: "stem", stemArchiveMigration: { status: "migrated" } });
    const tracks = [original];
    selectVisibleLibraryTracks(tracks);
    expect(tracks[0]).toBe(original);
  });
});
