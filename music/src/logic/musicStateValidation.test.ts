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
