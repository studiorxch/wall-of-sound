import { describe, expect, it } from "vitest";
import type { PlayProject } from "../data/playProjectTypes";
import type { Track, TrackSourceOwner } from "../data/trackTypes";
import { checkDestructiveSave, isMusicStateHealthy } from "./musicStateValidation";

// MUSIC P0 Clean Library Foundation — Step A. Reproduces the exact real-
// world failure the aggregate-only guard missed (a library-specific wipe
// masked by a numerically larger, untouched library), then proves the new
// per-sourceOwner check catches it. No test file previously existed for
// this guard despite it being the most safety-critical function in the
// persistence layer.

function track(id: string, sourceOwner: TrackSourceOwner): Track {
  return { trackId: id, title: id, sourceOwner } as unknown as Track;
}

function projectWithTracks(tracks: Track[]): PlayProject {
  return {
    schemaVersion: "play-project-v2",
    libraryTracks: tracks,
    playlists: [{ playlistId: "pl_default", title: "My Mix", slots: [] }],
    crates: [],
  } as unknown as PlayProject;
}

const CATALOG_TRACKS = Array.from({ length: 90 }, (_, i) => track(`cat_${i}`, "studiorich"));
const EXTERNAL_TRACKS = Array.from({ length: 10 }, (_, i) => track(`ext_${i}`, "external"));

describe("checkDestructiveSave / isMusicStateHealthy — per-source collapse guard", () => {
  it("REGRESSION: a 100% External wipe masked by a much larger Catalog previously passed the aggregate-only check", () => {
    const prev = projectWithTracks([...CATALOG_TRACKS, ...EXTERNAL_TRACKS]); // 100 tracks total
    const nextWithExternalWiped = projectWithTracks([...CATALOG_TRACKS]); // 90 tracks — only a 10% aggregate drop

    // Aggregate-only math: 90 / 100 = 0.9, well above the 0.8 floor — the
    // old check would have let this straight through despite External
    // going from 10 tracks to zero.
    const aggregateRatio = nextWithExternalWiped.libraryTracks!.length / prev.libraryTracks!.length;
    expect(aggregateRatio).toBeGreaterThan(0.8);

    const guard = checkDestructiveSave(prev, nextWithExternalWiped);
    expect(guard).toEqual({ blocked: true, blockReason: "source_library_collapse" });
  });

  it("REGRESSION: the same masked wipe would previously have been promoted to Last-Known-Good", () => {
    const prev = projectWithTracks([...CATALOG_TRACKS, ...EXTERNAL_TRACKS]);
    const nextWithExternalWiped = projectWithTracks([...CATALOG_TRACKS]);
    expect(isMusicStateHealthy(nextWithExternalWiped, prev)).toBe(false);
  });

  it("does not block an ordinary Catalog-only edit that leaves External untouched", () => {
    const prev = projectWithTracks([...CATALOG_TRACKS, ...EXTERNAL_TRACKS]);
    const next = projectWithTracks([...CATALOG_TRACKS.slice(0, 85), ...EXTERNAL_TRACKS]); // small Catalog trim, External intact
    expect(checkDestructiveSave(prev, next)).toEqual({ blocked: false });
    expect(isMusicStateHealthy(next, prev)).toBe(true);
  });

  it("does not block a small library (below the 10-track floor) from natural size changes", () => {
    const smallExternal = Array.from({ length: 4 }, (_, i) => track(`ext_${i}`, "external"));
    const prev = projectWithTracks([...CATALOG_TRACKS, ...smallExternal]);
    const next = projectWithTracks([...CATALOG_TRACKS]); // small External library emptied
    // Below the 10-track minimum this guard applies at — a real product
    // decision (avoids blocking legitimate small-library cleanup), not a gap.
    expect(checkDestructiveSave(prev, next)).toEqual({ blocked: false });
  });

  it("still catches a genuine Reference-library collapse independently of Catalog/External", () => {
    const referenceTracks = Array.from({ length: 15 }, (_, i) => track(`ref_${i}`, "reference"));
    const prev = projectWithTracks([...CATALOG_TRACKS, ...referenceTracks]);
    const next = projectWithTracks([...CATALOG_TRACKS, ...referenceTracks.slice(0, 2)]); // Reference collapses, Catalog untouched
    const guard = checkDestructiveSave(prev, next);
    expect(guard).toEqual({ blocked: true, blockReason: "source_library_collapse" });
  });

  it("still blocks a genuine aggregate track-library collapse (existing behavior preserved)", () => {
    const prev = projectWithTracks(CATALOG_TRACKS);
    const next = projectWithTracks(CATALOG_TRACKS.slice(0, 10));
    const guard = checkDestructiveSave(prev, next);
    expect(guard.blocked).toBe(true);
  });

  it("allows a save with no previous state (first save ever)", () => {
    const next = projectWithTracks(CATALOG_TRACKS);
    expect(checkDestructiveSave(null, next)).toEqual({ blocked: false });
  });
});

// MUSIC P0 Clean Library Foundation — Step E2
// (0826E_MUSIC_P0_Playlist_Empty_State_Persistence). Reproduces the exact
// live-found bug: removing the last track from a user's own only playlist
// (which happens to be titled "My Mix", the seeded default) was
// indistinguishable from real playlist history vanishing, because the old
// check only asked "did nonDefaultPlaylistCount drop to zero" — which was
// also true for this completely ordinary, reversible edit. No test file
// previously existed for this specific branch of the guard.

type PlaylistShape = { playlistId: string; title: string; slots: unknown[]; playlistKind?: string };

function projectWithPlaylists(playlists: PlaylistShape[]): PlayProject {
  return {
    schemaVersion: "play-project-v2",
    libraryTracks: [],
    playlists,
    crates: [],
  } as unknown as PlayProject;
}

const track1 = { slotId: "s1", assignedTrackId: "t1" };
const track2 = { slotId: "s2", assignedTrackId: "t2" };

describe("checkDestructiveSave / isMusicStateHealthy — default_overwrite guard (Step E2)", () => {
  it("REGRESSION: does not block emptying a user's own only playlist (My Mix) via ordinary track removal", () => {
    const prev = projectWithPlaylists([{ playlistId: "pl1", title: "My Mix", slots: [track1] }]);
    const next = projectWithPlaylists([{ playlistId: "pl1", title: "My Mix", slots: [] }]);
    expect(checkDestructiveSave(prev, next)).toEqual({ blocked: false });
    // isMusicStateHealthy has its own, unrelated "zero tracks anywhere" floor
    // (nextSum.trackCount === 0 → false) — give both states a real library
    // so only the default_overwrite branch under test is exercised.
    const withTracks = (p: PlayProject) => ({ ...p, libraryTracks: CATALOG_TRACKS });
    expect(isMusicStateHealthy(withTracks(next), withTracks(prev))).toBe(true);
  });

  it("still blocks a genuine multi-playlist collapse down to just the empty default", () => {
    const prev = projectWithPlaylists([
      { playlistId: "pl1", title: "My Mix", slots: [] },
      { playlistId: "pl2", title: "Party Mix", slots: [track1, track2] },
    ]);
    const next = projectWithPlaylists([{ playlistId: "pl1", title: "My Mix", slots: [] }]); // Party Mix vanished entirely
    expect(checkDestructiveSave(prev, next)).toEqual({ blocked: true, blockReason: "default_overwrite" });
  });

  it("still blocks when the user's only OTHER (non-default) playlist is emptied down to nothing but the default", () => {
    const prev = projectWithPlaylists([
      { playlistId: "pl1", title: "My Mix", slots: [] },
      { playlistId: "pl2", title: "Road Trip", slots: [track1] },
    ]);
    const next = projectWithPlaylists([{ playlistId: "pl1", title: "My Mix", slots: [] }]);
    expect(checkDestructiveSave(prev, next).blocked).toBe(true);
  });

  it("allows creating the seeded default playlist for the first time (no prior playlists)", () => {
    const prev = projectWithPlaylists([]);
    const next = projectWithPlaylists([{ playlistId: "pl1", title: "My Mix", slots: [] }]);
    expect(checkDestructiveSave(prev, next)).toEqual({ blocked: false });
  });

  it("does not block when My Mix was already empty and stays empty (no-op save)", () => {
    const prev = projectWithPlaylists([{ playlistId: "pl1", title: "My Mix", slots: [] }]);
    const next = projectWithPlaylists([{ playlistId: "pl1", title: "My Mix", slots: [] }]);
    expect(checkDestructiveSave(prev, next)).toEqual({ blocked: false });
  });

  it("does not treat sampler-bank playlists (reference_overlay) as real playlists for this check", () => {
    const prev = projectWithPlaylists([
      { playlistId: "pl1", title: "My Mix", slots: [track1] },
      { playlistId: "bank1", title: "Some Bank", slots: [track1, track2], playlistKind: "reference_overlay" },
    ]);
    const next = projectWithPlaylists([
      { playlistId: "pl1", title: "My Mix", slots: [] },
      { playlistId: "bank1", title: "Some Bank", slots: [track1, track2], playlistKind: "reference_overlay" },
    ]);
    // The bank is untouched and isn't a "user" playlist — this is still
    // just "my only real playlist went to zero tracks", not blocked.
    expect(checkDestructiveSave(prev, next)).toEqual({ blocked: false });
  });
});
