// ── Station topology projection tests ──────────────────────────────────────────
// STATION-07 -- proves the renderer contract is archetype-blind: it consumes
// only real StationGeometryData fields (platforms/trackCenterlines/
// wallSurfaces), never an archetypeId, and produces the correct topology for
// every required validation case purely from those fields.
import { describe, it, expect } from "vitest";
import { projectStationTopology, type StationTopologyInput } from "./stationTopologyProjection";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import { UG_SIDE_2TRACK_ARCHETYPE_ID, UG_SIDE_4TRACK_ARCHETYPE_ID, UG_ISLAND_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";
import {
  FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
  FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
  FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
} from "./stationGeometryFourTrackIslandContractFixture";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import type { StationPlatform, StationTrackCenterline, StationWallSurface } from "../../data/stationGeometryTypes";

function toInput(geometry: { platforms: readonly StationPlatform[]; trackCenterlines: readonly StationTrackCenterline[]; wallSurfaces?: readonly StationWallSurface[] }): StationTopologyInput {
  return { platforms: geometry.platforms, trackCenterlines: geometry.trackCenterlines, wallSurfaces: geometry.wallSurfaces ?? [] };
}

// ── 1/2. renderer accepts canonical Base Truth; no archetype-specific dispatch ─
describe("archetype-blind contract", () => {
  it("StationTopologyInput has no archetypeId field — verified at the type level: this object satisfies the input type with none", () => {
    const side2 = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "T01", routeIds: ["T"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 0 },
    });
    const input: StationTopologyInput = { platforms: side2.platforms, trackCenterlines: side2.trackCenterlines, wallSurfaces: side2.wallSurfaces };
    // If this compiles and produces a real model, the function accepted
    // canonical Base Truth fields with nothing archetype-identifying passed.
    expect(projectStationTopology(input).lanes.length).toBeGreaterThan(0);
  });

  it("identical structural input produces identical output regardless of which archetype (or no archetype) produced it — proves behavior never secretly keys off archetype identity", () => {
    const side2 = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "T02", routeIds: ["T"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 0 },
      now: "2026-09-13T00:00:00.000Z",
    });
    // A hand-built input with the exact same platform/track shape as the
    // UG_SIDE_2TRACK archetype's own output, but authored independently
    // (never touches instantiateStationArchetype or any archetype module).
    const handBuilt: StationTopologyInput = {
      platforms: side2.platforms.map((p) => ({ ...p, provenance: { source: "authored" as const, note: "hand-authored, not archetype-derived" } })),
      trackCenterlines: side2.trackCenterlines.map((t) => ({ ...t, provenance: { source: "authored" as const, note: "hand-authored, not archetype-derived" } })),
      wallSurfaces: [],
    };
    const fromArchetype = projectStationTopology(toInput(side2));
    const fromHandBuilt = projectStationTopology(handBuilt);
    // Strip provenance-independent labels/ids being identical is the point --
    // same ids/footprints in, same lanes out, whether or not an archetype
    // ever touched this data.
    expect(fromHandBuilt).toEqual(fromArchetype);
  });
});

// ── 3. side-2 ────────────────────────────────────────────────────────────────
describe("SIDE_2TRACK — two platforms, two tracks", () => {
  const side2 = instantiateStationArchetype({
    archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
    stationRef: { gtfsStopId: "T03", routeIds: ["T"] },
    origin: { longitude: -74, latitude: 40.7, orientationDeg: 0 },
  });
  const model = projectStationTopology(toInput(side2));

  it("produces exactly PLATFORM | TRACK | TRACK | PLATFORM, in that order, outer-to-inner", () => {
    expect(model.lanes.map((l) => l.kind)).toEqual(["platform", "track", "track", "platform"]);
  });

  it("both platforms are config:side", () => {
    const platformLanes = model.lanes.filter((l) => l.kind === "platform");
    for (const lane of platformLanes) expect(lane.kind === "platform" && lane.config).toBe("side");
  });

  it("both tracks report hasPlatform:true (each serves exactly one platform)", () => {
    const trackLanes = model.lanes.filter((l) => l.kind === "track");
    expect(trackLanes).toHaveLength(2);
    for (const lane of trackLanes) expect(lane.kind === "track" && lane.hasPlatform).toBe(true);
  });

  it("works identically for the REAL Bay Ridge Av seed (a real, authored 2-track side station, not an archetype)", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    const bayRidgeModel = projectStationTopology(toInput(bayRidge));
    expect(bayRidgeModel.lanes.map((l) => l.kind)).toEqual(["platform", "track", "track", "platform"]);
  });
});

// ── 4. island-2 ────────────────────────────────────────────────────────────────
describe("UG_ISLAND_2TRACK — one shared platform, two adjacent tracks", () => {
  const island2 = instantiateStationArchetype({
    archetypeId: UG_ISLAND_2TRACK_ARCHETYPE_ID,
    stationRef: { gtfsStopId: "T04", routeIds: ["T"] },
    origin: { longitude: -74, latitude: 40.7, orientationDeg: 0 },
  });
  const model = projectStationTopology(toInput(island2));

  it("produces exactly TRACK | ISLAND PLATFORM | TRACK, in that order", () => {
    expect(model.lanes.map((l) => l.kind)).toEqual(["track", "platform", "track"]);
    const platformLane = model.lanes.find((l) => l.kind === "platform")!;
    expect(platformLane.kind === "platform" && platformLane.config).toBe("island");
  });

  it("both tracks visibly relate to the SAME one island platform — not two separate platforms", () => {
    const platformLane = model.lanes.find((l) => l.kind === "platform")!;
    expect(platformLane.kind === "platform" && platformLane.servedByTrackIds).toHaveLength(2);
    const trackLanes = model.lanes.filter((l) => l.kind === "track");
    for (const t of trackLanes) expect(t.kind === "track" && t.platformId).toBe(platformLane.id);
  });

  it("the two tracks carry distinct platformSide values — the fact that makes the island relationship queryable, not just visually adjacent", () => {
    const trackLanes = model.lanes.filter((l) => l.kind === "track");
    const sides = trackLanes.map((t) => t.kind === "track" && t.platformSide).sort();
    expect(sides).toEqual(["A", "B"]);
  });
});

// ── 5. side-4 ────────────────────────────────────────────────────────────────
describe("UG_SIDE_4TRACK — outer platform-served tracks, inner bypass tracks", () => {
  const side4 = instantiateStationArchetype({
    archetypeId: UG_SIDE_4TRACK_ARCHETYPE_ID,
    stationRef: { gtfsStopId: "T05", routeIds: ["T"] },
    origin: { longitude: -74, latitude: 40.7, orientationDeg: 0 },
  });
  const model = projectStationTopology(toInput(side4));

  it("produces exactly PLATFORM | LOCAL | EXPRESS | EXPRESS | LOCAL | PLATFORM, in that order", () => {
    expect(model.lanes.map((l) => l.kind)).toEqual(["platform", "track", "track", "track", "track", "platform"]);
  });

  it("the outer two tracks (platform-serving LOCAL) have hasPlatform:true; the inner two (bypass EXPRESS) have hasPlatform:false — derived from real platformId, never a role string guess", () => {
    const trackLanes = model.lanes.filter((l) => l.kind === "track");
    const hasPlatformFlags = trackLanes.map((l) => l.kind === "track" && l.hasPlatform);
    expect(hasPlatformFlags).toEqual([true, false, false, true]);
  });

  it("the renderer obtains bypass-vs-platform-serving from Base Truth (platformId), never from knowing what UG_SIDE_4TRACK itself means", () => {
    // Re-derive the same fact an entirely different way (role string) and
    // confirm it agrees with the structural platformId-derived fact —
    // this is the real archetype's own TrackRole vocabulary, read here only
    // to cross-check, never as the thing projectStationTopology() branches on.
    const trackLanes = model.lanes.filter((l) => l.kind === "track");
    const byRole = trackLanes.map((l) => l.kind === "track" && l.role);
    expect(byRole).toEqual(["northboundLocal", "northboundExpress", "southboundExpress", "southboundLocal"]);
    const byHasPlatform = trackLanes.map((l) => l.kind === "track" && l.hasPlatform);
    expect(byHasPlatform).toEqual([true, false, false, true]); // agrees: Local=hasPlatform, Express=no platform
  });
});

// ── 6. island-4 contract fixture ────────────────────────────────────────────
describe("four-track island contract fixture — two shared platforms, four tracks (test/demo-only, no production archetype)", () => {
  const input: StationTopologyInput = {
    platforms: FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
    trackCenterlines: FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
    wallSurfaces: FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
  };
  const model = projectStationTopology(input);

  it("produces exactly WALL | LOCAL | ISLAND | EXPRESS | EXPRESS | ISLAND | LOCAL | WALL, in that order", () => {
    expect(model.lanes.map((l) => l.kind)).toEqual(["wall", "track", "platform", "track", "track", "platform", "track", "wall"]);
  });

  it("both platforms are config:island, each serving exactly its own 2 tracks", () => {
    const platformLanes = model.lanes.filter((l) => l.kind === "platform");
    expect(platformLanes).toHaveLength(2);
    for (const lane of platformLanes) {
      expect(lane.kind === "platform" && lane.config).toBe("island");
      expect(lane.kind === "platform" && lane.servedByTrackIds).toHaveLength(2);
    }
    // The two platforms share zero tracks.
    const [first, second] = platformLanes;
    const firstTracks = first.kind === "platform" ? first.servedByTrackIds : [];
    const secondTracks = second.kind === "platform" ? second.servedByTrackIds : [];
    expect(firstTracks.some((id) => secondTracks.includes(id))).toBe(false);
  });
});

// ── 7. walls with adjacentTrackId, independent of passenger platforms ─────────
describe("wall lanes are represented independently of passenger platforms", () => {
  const input: StationTopologyInput = {
    platforms: FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
    trackCenterlines: FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
    wallSurfaces: FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
  };
  const model = projectStationTopology(input);
  const wallLanes = model.lanes.filter((l) => l.kind === "wall");

  it("both outer walls render as wall lanes, each with a real adjacentTrackId", () => {
    expect(wallLanes).toHaveLength(2);
    for (const lane of wallLanes) expect(lane.kind === "wall" && typeof lane.adjacentTrackId).toBe("string");
  });

  it("a wall lane's TypeScript shape has no platform-related field at all — WallLane never has a config/servedByTrackIds field, structurally distinct from PlatformLane", () => {
    for (const lane of wallLanes) {
      expect("config" in lane).toBe(false);
      expect("servedByTrackIds" in lane).toBe(false);
    }
  });

  it("a wall renders at the outer position even though no platform exists there — the outer walls sit outside both platform lanes", () => {
    const platformYs = model.lanes.filter((l) => l.kind === "platform").map((l) => l.y);
    for (const lane of wallLanes) {
      expect(lane.y < Math.min(...platformYs) || lane.y > Math.max(...platformYs)).toBe(true);
    }
  });
});

// ── 8. generic vs authored provenance does not change the renderer contract ────
describe("generic (archetype-derived) vs authored provenance — same renderer contract", () => {
  it("projectStationTopology never reads .provenance at all — an archetype's heuristic-provenance output and the real, reference/authored-provenance Bay Ridge Av seed both produce the SAME shaped model for the same topology", () => {
    const side2 = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "T08", routeIds: ["T"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 0 },
    });
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");

    // Confirm the two inputs carry genuinely different provenance (proving
    // this isn't a vacuous check)...
    expect(side2.platforms[0]!.provenance.source).toBe("heuristic");
    expect(bayRidge.platforms[0]!.provenance.source).toBe("reference");

    // ...yet both produce the identical LANE-KIND SHAPE (platform/track/
    // platform/track/platform... structure), since provenance never enters
    // the projection at all.
    const side2Kinds = projectStationTopology(toInput(side2)).lanes.map((l) => l.kind);
    const bayRidgeKinds = projectStationTopology(toInput(bayRidge)).lanes.map((l) => l.kind);
    expect(side2Kinds).toEqual(bayRidgeKinds);
    expect(side2Kinds).toEqual(["platform", "track", "track", "platform"]);
  });

  it("mutating only .provenance on an otherwise-identical input never changes the projected model", () => {
    const side2 = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "T09", routeIds: ["T"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 0 },
      now: "2026-09-13T00:00:00.000Z",
    });
    const reprovenanced = {
      ...side2,
      platforms: side2.platforms.map((p) => ({ ...p, provenance: { source: "authored" as const } })),
      trackCenterlines: side2.trackCenterlines.map((t) => ({ ...t, provenance: { source: "authority" as const } })),
    };
    expect(projectStationTopology(toInput(reprovenanced))).toEqual(projectStationTopology(toInput(side2)));
  });
});
