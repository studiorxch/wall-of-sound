// ── Four-track island composition — contract validation only ──────────────────
// STATION-06 (0912_WOS_Subway_Station_Base_Truth_Extension_v1.0.0)
// STATION-07 -- the fixture itself now lives in
// stationGeometryFourTrackIslandContractFixture.ts, shared with the debug
// topology renderer (stationTopologyDebugRuntime.ts) so both consume the
// exact same synthetic data rather than two drifting copies.
//
// NOT a production archetype (no UG_ISLAND_4TRACK is added — STATION-06's own
// explicit scope boundary). This is a hand-built, synthetic StationGeometryData
// fragment proving the extended Base Truth contract (platformSide +
// adjacentTrackId) can represent the more demanding validation case the
// STATION-05 recon named but did not build:
//
//   WALL | LOCAL | ISLAND | EXPRESS | EXPRESS | ISLAND | LOCAL | WALL
//
// Two independent island platforms, each relating to its own two adjacent
// tracks (one local, one express) via platformId + platformSide; two outer
// walls identifying their adjacent track via adjacentTrackId WITHOUT ever
// claiming to have a passenger platform (StationWallSurface has no platformId
// field at all — structurally impossible to pretend otherwise, not just
// unpopulated by convention). Every field used here already exists on
// StationTrackCenterline/StationPlatform/StationWallSurface — nothing new is
// introduced beyond this checkpoint's own two additive fields.
import { describe, it, expect } from "vitest";
import type { StationTrackCenterline, PlatformSide } from "../../data/stationGeometryTypes";
import { deriveUndergroundSide4TrackGeometry } from "./stationArchetypeUndergroundSide4Track";
import { DEFAULT_UG_SIDE_4TRACK_PARAMETERS } from "../../data/stationArchetypeTypes";
import {
  islandN,
  islandS,
  trackN,
  trackNE,
  trackSE,
  trackS,
  wallN,
  wallS,
  FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS as platforms,
  FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES as trackCenterlines,
  FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES as wallSurfaces,
} from "./stationGeometryFourTrackIslandContractFixture";

describe("four-track island composition — contract validation (not a production archetype)", () => {
  it("each island platform relates independently to exactly its own two adjacent tracks", () => {
    const tracksOnIslandN = trackCenterlines.filter((t) => t.platformId === islandN.id);
    const tracksOnIslandS = trackCenterlines.filter((t) => t.platformId === islandS.id);
    expect(tracksOnIslandN.map((t) => t.id).sort()).toEqual([trackN.id, trackNE.id].sort());
    expect(tracksOnIslandS.map((t) => t.id).sort()).toEqual([trackSE.id, trackS.id].sort());
    // The two islands share zero tracks — genuinely independent relationships.
    expect(tracksOnIslandN.some((t) => tracksOnIslandS.includes(t))).toBe(false);
  });

  it("each island's two tracks sit on opposite, distinct edges — never the same platformSide twice on one platform", () => {
    for (const island of platforms) {
      const sides = trackCenterlines.filter((t) => t.platformId === island.id).map((t) => t.platformSide);
      expect(new Set(sides).size).toBe(sides.length); // no duplicate side on the same platform
      expect(sides.sort()).toEqual(["A", "B"]);
    }
  });

  it("one edge of each island is the LOCAL (outer, wall-facing) side and the other is EXPRESS (inner) — real, typed, queryable, not id-string guessing", () => {
    const localTrackOnIslandN = trackCenterlines.find((t) => t.platformId === islandN.id && t.physicalRole === "local")!;
    const expressTrackOnIslandN = trackCenterlines.find((t) => t.platformId === islandN.id && t.physicalRole === "express")!;
    expect(localTrackOnIslandN.platformSide).not.toBe(expressTrackOnIslandN.platformSide);
  });

  it("the two outer walls identify their adjacent OUTER track without any platform reference at all — a wall structurally cannot claim a passenger platform", () => {
    expect(wallN.adjacentTrackId).toBe(trackN.id);
    expect(wallS.adjacentTrackId).toBe(trackS.id);
    // StationWallSurface has no platformId/platformSide field in its own type —
    // this is not "happens to be undefined," it is not a member of the type at
    // all, so there is no way to author a wall that also claims a platform.
    expect("platformId" in wallN).toBe(false);
    expect("platformId" in wallS).toBe(false);
  });

  it("the outer walls face the OUTERMOST tracks specifically (the local pair), never one of the inner express tracks", () => {
    expect(wallN.adjacentTrackId).not.toBe(trackNE.id);
    expect(wallN.adjacentTrackId).not.toBe(trackSE.id);
    expect(wallS.adjacentTrackId).not.toBe(trackNE.id);
    expect(wallS.adjacentTrackId).not.toBe(trackSE.id);
  });

  it("the full relationship graph is queryable in one deterministic pass, no ambiguity for any of the 4 tracks", () => {
    const summary = trackCenterlines.map((t) => ({
      trackId: t.id,
      role: t.physicalRole,
      platformId: t.platformId,
      platformSide: t.platformSide,
      facingWallId: wallSurfaces.find((w) => w.adjacentTrackId === t.id)?.id ?? null,
    }));
    expect(summary).toEqual([
      { trackId: trackN.id, role: "local", platformId: islandN.id, platformSide: "A", facingWallId: wallN.id },
      { trackId: trackNE.id, role: "express", platformId: islandN.id, platformSide: "B", facingWallId: null },
      { trackId: trackSE.id, role: "express", platformId: islandS.id, platformSide: "A", facingWallId: null },
      { trackId: trackS.id, role: "local", platformId: islandS.id, platformSide: "B", facingWallId: wallS.id },
    ]);
  });
});

// ── Future door-side derivation — demonstrated, not implemented ────────────
// This helper is TEST-ONLY (not exported from any production module) and
// deliberately returns the same structural PlatformSide the Base Truth
// already carries — never "left"/"right", never a screen direction, never a
// hardcoded northbound/southbound assumption. Converting a PlatformSide into
// an actual screen/world-space direction is explicitly future presentation-
// layer work (STATION-05's own recon, section E) computed from the
// station's real orientationDeg + platform footprint — not something this
// checkpoint implements.
function deriveDoorFacingSide(track: StationTrackCenterline): PlatformSide | "no-platform-no-doors" {
  if (track.platformId == null) return "no-platform-no-doors";
  if (track.platformSide != null) return track.platformSide; // island: edge is explicit
  return "A"; // side platform: platformId alone is already unambiguous (exactly one edge) — "A" stands in for "the only edge," never a direction claim
}

describe("future door-side derivation — structurally supported by this Base Truth, not implemented here", () => {
  it("derives a real, non-hardcoded facing side for every track on the synthetic island fixture", () => {
    expect(deriveDoorFacingSide(trackN)).toBe("A");
    expect(deriveDoorFacingSide(trackNE)).toBe("B");
    expect(deriveDoorFacingSide(trackSE)).toBe("A");
    expect(deriveDoorFacingSide(trackS)).toBe("B");
  });

  it("a track with no adjacent platform (platformId: null) structurally has no doors to derive — the express/bypass tracks of the REAL UG_SIDE_4TRACK archetype, reused here rather than re-fabricated", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    const bypassTracks = geometry.trackCenterlines.filter((t) => t.platformId === null);
    expect(bypassTracks.length).toBeGreaterThan(0);
    for (const bypass of bypassTracks) {
      expect(deriveDoorFacingSide(bypass)).toBe("no-platform-no-doors");
    }
  });

  it("a side-platform track (unambiguous, single edge) derives correctly without ever needing platformSide set", () => {
    // Reuses the real UG_SIDE_2TRACK archetype's own output rather than a
    // second fabricated fixture — its tracks never set platformSide (see
    // this checkpoint's own regression test in
    // stationArchetypeUndergroundIsland2Track.test.ts), and the derivation
    // above still resolves unambiguously.
    expect(deriveDoorFacingSide({ ...trackN, platformSide: undefined })).toBe("A");
  });
});
