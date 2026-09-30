// ── Four-track island composition — SHARED fixture builder ────────────────────
// STATION-06/07
//
// NOT a production archetype (no UG_ISLAND_4TRACK is added — STATION-06's own
// explicit scope boundary, reaffirmed in STATION-07). This is a hand-built,
// synthetic set of Base-Truth-shaped fragments representing:
//
//   WALL | LOCAL | ISLAND | EXPRESS | EXPRESS | ISLAND | LOCAL | WALL
//
// Extracted from stationGeometryFourTrackIslandContract.test.ts (STATION-06)
// into its own module so STATION-07's debug renderer can reuse the EXACT SAME
// fixture data the contract test already validates, rather than a second,
// drifting copy. The test file now imports this module instead of defining
// the fixture inline.
import type { PlatformSide, StationPlatform, StationTrackCenterline, StationWallSurface, Provenance } from "../../data/stationGeometryTypes";

export const FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE: Provenance = {
  source: "authored",
  note: "Synthetic contract-validation fixture — not a real station.",
};

// Y increases outward from the station's own track center, matching the
// existing archetypes' own convention (see stationArchetypeUndergroundSide4Track.ts).
export const islandN: StationPlatform = {
  id: "platform:CONTRACT:islandN",
  levelId: "level:CONTRACT:platform",
  config: "island",
  servesRouteIds: [],
  footprint: [
    { x: -75, y: -10 },
    { x: 75, y: -10 },
    { x: 75, y: -6 },
    { x: -75, y: -6 },
  ],
  provenance: FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE,
};
export const islandS: StationPlatform = {
  id: "platform:CONTRACT:islandS",
  levelId: "level:CONTRACT:platform",
  config: "island",
  servesRouteIds: [],
  footprint: [
    { x: -75, y: 6 },
    { x: 75, y: 6 },
    { x: 75, y: 10 },
    { x: -75, y: 10 },
  ],
  provenance: FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE,
};

function track(id: string, y: number, platformId: string | null, platformSide: PlatformSide | undefined, physicalRole: "local" | "express"): StationTrackCenterline {
  return {
    id,
    platformId,
    platformSide,
    physicalRole,
    localPoints: [
      { x: -75, y },
      { x: 75, y },
    ],
    provenance: FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE,
  };
}

// Outer-to-inner across Y: WALL | LOCAL(trackN) | ISLAND(islandN) | EXPRESS(trackNE) | [gap] | EXPRESS(trackSE) | ISLAND(islandS) | LOCAL(trackS) | WALL
export const trackN = track("track:CONTRACT:local-n", -12, islandN.id, "A", "local"); // outer edge of islandN — the wall-facing side
export const trackNE = track("track:CONTRACT:express-n", -4, islandN.id, "B", "express"); // inner edge of islandN
export const trackSE = track("track:CONTRACT:express-s", 4, islandS.id, "A", "express"); // inner edge of islandS
export const trackS = track("track:CONTRACT:local-s", 12, islandS.id, "B", "local"); // outer edge of islandS — the wall-facing side

export const wallN: StationWallSurface = {
  id: "wall:CONTRACT:outer-n",
  levelId: "level:CONTRACT:platform",
  localPolygon: [
    { x: -75, y: -14, z: 0 },
    { x: 75, y: -14, z: 0 },
    { x: 75, y: -14, z: 4 },
    { x: -75, y: -14, z: 4 },
  ],
  label: "Outer wall (north)",
  suitableForArt: true,
  adjacentTrackId: trackN.id, // faces the outer LOCAL track — no passenger platform beyond it
  provenance: FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE,
};
export const wallS: StationWallSurface = {
  id: "wall:CONTRACT:outer-s",
  levelId: "level:CONTRACT:platform",
  localPolygon: [
    { x: -75, y: 14, z: 0 },
    { x: 75, y: 14, z: 0 },
    { x: 75, y: 14, z: 4 },
    { x: -75, y: 14, z: 4 },
  ],
  label: "Outer wall (south)",
  suitableForArt: true,
  adjacentTrackId: trackS.id,
  provenance: FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE,
};

export const FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS: readonly StationPlatform[] = [islandN, islandS];
export const FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES: readonly StationTrackCenterline[] = [trackN, trackNE, trackSE, trackS];
export const FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES: readonly StationWallSurface[] = [wallN, wallS];
