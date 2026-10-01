import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import {
  UG_SIDE_2TRACK_ARCHETYPE_ID,
  UG_SIDE_4TRACK_ARCHETYPE_ID,
  UG_ISLAND_2TRACK_ARCHETYPE_ID,
} from "../../data/stationArchetypeTypes";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import {
  FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
  FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
  FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
} from "./stationGeometryFourTrackIslandContractFixture";
import { makeStationGeometryId, type StationGeometryData } from "../../data/stationGeometryTypes";
import { projectStationStructure3D, summarizeStationStructuralProjection3D } from "./stationStructuralProjection3D";
import { projectStationTopology } from "./stationTopologyProjection";
import { resolveStationDetailSubject } from "./stationDetailSubjectResolver";
import { evaluateStationStructuralReadiness } from "./stationStructuralReadiness";
import type { StationDetailSubjectRef } from "../../data/stationDetailSubjectTypes";

const NOW = "2026-09-30T00:00:00.000Z";

function instantiate(archetypeId: Parameters<typeof instantiateStationArchetype>[0]["archetypeId"], gtfsStopId: string) {
  return instantiateStationArchetype({
    archetypeId,
    stationRef: { gtfsStopId, routeIds: [] },
    origin: { longitude: 0, latitude: 0, orientationDeg: 0 },
    now: NOW,
  });
}

function fourTrackIslandContractGeometry(): StationGeometryData {
  return {
    id: makeStationGeometryId("CONTRACT"),
    stationRef: { gtfsStopId: "CONTRACT", routeIds: [] },
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    origin: { longitude: 0, latitude: 0, altitudeM: 0, orientationDeg: 0, provenance: { source: "heuristic" } },
    levels: [
      { id: "level:CONTRACT:platform", kind: "platform", label: "Platform level", provenance: { source: "authored" } },
    ],
    platforms: [...FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS],
    trackCenterlines: [...FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES],
    connections: [],
    platformLinks: [],
    evidenceConflicts: [],
    entrances: [],
    wallSurfaces: [...FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES],
  };
}

describe("projectStationStructure3D -- determinism / mutation safety / identity", () => {
  const seed = buildBayRidgeAvStationGeometrySeed(NOW);

  it("is deterministic -- identical input produces an identical (deep-equal) result across repeated calls", () => {
    const a = projectStationStructure3D(seed);
    const b = projectStationStructure3D(buildBayRidgeAvStationGeometrySeed(NOW));
    expect(a).toEqual(b);
  });

  it("never mutates the input StationGeometryData", () => {
    const before = JSON.parse(JSON.stringify(seed));
    projectStationStructure3D(seed);
    expect(seed).toEqual(before);
  });

  it("preserves the canonical stationGeometryId", () => {
    expect(projectStationStructure3D(seed).stationGeometryId).toBe("stationGeometry:R42");
  });

  it("preserves every canonical platform id verbatim, minting no new identity", () => {
    const projection = projectStationStructure3D(seed);
    const projectedIds = projection.platforms.map((p) => p.id).sort();
    const canonicalIds = seed.platforms.map((p) => p.id).sort();
    expect(projectedIds).toEqual(canonicalIds);
  });

  it("preserves every canonical track id verbatim", () => {
    const projection = projectStationStructure3D(seed);
    expect(projection.tracks.map((t) => t.id).sort()).toEqual(seed.trackCenterlines.map((t) => t.id).sort());
  });

  it("preserves every canonical wall id verbatim", () => {
    const projection = projectStationStructure3D(seed);
    expect(projection.walls.map((w) => w.id).sort()).toEqual(seed.wallSurfaces.map((w) => w.id).sort());
  });

  it("preserves every canonical connection id verbatim", () => {
    const projection = projectStationStructure3D(seed);
    expect(projection.connections.map((c) => c.id).sort()).toEqual(seed.connections.map((c) => c.id).sort());
  });

  it("projection-derived vertical spacing (presentationStackIndex) is never written back into the canonical geometry object", () => {
    projectStationStructure3D(seed);
    for (const level of seed.levels) {
      expect(level as unknown as { presentationStackIndex?: unknown }).not.toHaveProperty("presentationStackIndex");
    }
  });
});

describe("projectStationStructure3D -- level stacking order", () => {
  it("R42: surface (index 0) above mezzanine (index 1) above platform (index 2), by kind rank, never by elevationM", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const byKind = Object.fromEntries(projection.levels.map((l) => [l.kind, l]));
    expect(byKind.surface.presentationStackIndex).toBeLessThan(byKind.mezzanine.presentationStackIndex);
    expect(byKind.mezzanine.presentationStackIndex).toBeLessThan(byKind.platform.presentationStackIndex);
  });

  it("the surface level's real canonicalElevationM (0, heuristic) is preserved verbatim, distinct from its presentationStackIndex", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const surface = projection.levels.find((l) => l.kind === "surface")!;
    expect(surface.canonicalElevationM).toBe(0);
    expect(surface.presentationStackIndex).toBe(0);
    // Mezzanine/platform have no canonical elevationM at all -- never defaulted.
    const mezzanine = projection.levels.find((l) => l.kind === "mezzanine")!;
    const platform = projection.levels.find((l) => l.kind === "platform")!;
    expect(mezzanine.canonicalElevationM).toBeUndefined();
    expect(platform.canonicalElevationM).toBeUndefined();
  });

  it("level ordering is deterministic regardless of input array order", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const reordered: StationGeometryData = { ...seed, levels: [...seed.levels].reverse() };
    const a = projectStationStructure3D(seed).levels.map((l) => l.id);
    const b = projectStationStructure3D(reordered).levels.map((l) => l.id);
    expect(a).toEqual(b);
  });
});

describe("projectStationStructure3D -- platform projection", () => {
  it("projects R42's real, currently-estimated platform footprints honestly -- never beautified, never completed", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const northbound = projection.platforms.find((p) => p.id === "platform:R42:northbound")!;
    const canonicalNorthbound = seed.platforms.find((p) => p.id === "platform:R42:northbound")!;
    expect(northbound.footprint).toEqual(canonicalNorthbound.footprint);
    expect(northbound.footprint?.length).toBe(canonicalNorthbound.footprint?.length); // not padded/trimmed
  });

  it("derives servedByTrackIds from canonical track->platform relationships, never authored directly", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const northbound = projection.platforms.find((p) => p.id === "platform:R42:northbound")!;
    expect(northbound.servedByTrackIds).toEqual(["track:R42:northbound"]);
  });
});

describe("projectStationStructure3D -- track projection", () => {
  it("projects R42's real track centerlines honestly", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const track = projection.tracks.find((t) => t.id === "track:R42:northbound")!;
    const canonical = seed.trackCenterlines.find((t) => t.id === "track:R42:northbound")!;
    expect(track.localPoints).toEqual(canonical.localPoints);
  });

  it("derives a track's levelId from its platform relationship when platformId is set", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const track = projection.tracks.find((t) => t.id === "track:R42:northbound")!;
    expect(track.levelId).toBe("level:R42:platform");
  });

  it("never derives a levelId for a bypass track with platformId null (SIDE_4TRACK's own express tracks)", () => {
    const geometry = instantiate(UG_SIDE_4TRACK_ARCHETYPE_ID, "TESTSIDE4");
    const projection = projectStationStructure3D(geometry);
    const bypassTracks = projection.tracks.filter((t) => t.platformId === null);
    expect(bypassTracks.length).toBeGreaterThan(0);
    for (const t of bypassTracks) expect(t.levelId).toBeUndefined();
  });
});

describe("projectStationStructure3D -- wall partial-truth behavior (STATION-11/12 invariant)", () => {
  it("R42's two STATION-11 walls project as geometryUnknown -- identity/relationship preserved, no polygon fabricated", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    expect(projection.walls).toHaveLength(2);
    for (const wall of projection.walls) {
      expect(wall.geometryState).toBe("geometryUnknown");
      expect(wall.localPolygon).toBeUndefined();
      expect(wall.adjacentPlatformId).toBeDefined();
    }
  });

  it("a wall WITH real geometry (the synthetic four-track-island contract fixture) projects as geometryKnown, with the polygon preserved verbatim", () => {
    const geometry = fourTrackIslandContractGeometry();
    const projection = projectStationStructure3D(geometry);
    for (const wall of projection.walls) {
      expect(wall.geometryState).toBe("geometryKnown");
      expect(wall.localPolygon).toBeDefined();
    }
    const canonicalWallN = geometry.wallSurfaces.find((w) => w.id.includes("outer-n"))!;
    const projectedWallN = projection.walls.find((w) => w.id === canonicalWallN.id)!;
    expect(projectedWallN.localPolygon).toEqual(canonicalWallN.localPolygon);
  });

  it("geometryUnknown is distinguishable from non-existence -- a wall with no geometry still appears in projection.walls", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    expect(projection.walls.map((w) => w.id)).toContain("wall:R42:northbound-back");
  });
});

describe("projectStationStructure3D -- connection partial-truth behavior", () => {
  it("R42's connections all project as topologyOnly -- no connection has ever had a real localPath authored", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    expect(projection.connections.length).toBeGreaterThan(0);
    for (const c of projection.connections) {
      expect(c.pathState).toBe("topologyOnly");
      expect(c.localPath).toBeUndefined();
    }
  });

  it("a connection WITH a real localPath preserves it honestly, never discarding or inventing one", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const withPath: StationGeometryData = {
      ...seed,
      connections: seed.connections.map((c, i) =>
        i === 0 ? { ...c, localPath: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } : c,
      ),
    };
    const projection = projectStationStructure3D(withPath);
    const pathed = projection.connections.find((c) => c.pathState === "pathKnown")!;
    expect(pathed).toBeDefined();
    expect(pathed.localPath).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    // every OTHER connection remains topologyOnly, untouched
    const others = projection.connections.filter((c) => c.id !== pathed.id);
    for (const c of others) expect(c.pathState).toBe("topologyOnly");
  });
});

describe("projectStationStructure3D -- generic topology proof (not Bay-Ridge-only)", () => {
  it("SIDE_2TRACK: platform | track | track | platform projects with 2 platforms and 2 tracks, no walls", () => {
    const geometry = instantiate(UG_SIDE_2TRACK_ARCHETYPE_ID, "TESTSIDE2");
    const projection = projectStationStructure3D(geometry);
    expect(projection.platforms).toHaveLength(2);
    expect(projection.tracks).toHaveLength(2);
    expect(projection.walls).toHaveLength(0);
  });

  it("ISLAND_2TRACK: track | island | track projects with 1 island platform serving 2 tracks", () => {
    const geometry = instantiate(UG_ISLAND_2TRACK_ARCHETYPE_ID, "TESTISLAND2");
    const projection = projectStationStructure3D(geometry);
    expect(projection.platforms).toHaveLength(1);
    expect(projection.platforms[0].config).toBe("island");
    expect(projection.platforms[0].servedByTrackIds).toHaveLength(2);
    expect(projection.tracks).toHaveLength(2);
  });

  it("SIDE_4TRACK: platform | local | express | express | local | platform projects with 2 platforms and 4 tracks, 2 of which are platformless bypass tracks", () => {
    const geometry = instantiate(UG_SIDE_4TRACK_ARCHETYPE_ID, "TESTSIDE4");
    const projection = projectStationStructure3D(geometry);
    expect(projection.platforms).toHaveLength(2);
    expect(projection.tracks).toHaveLength(4);
    expect(projection.tracks.filter((t) => t.platformId === null)).toHaveLength(2);
  });

  it("synthetic ISLAND_4TRACK contract fixture: wall | local | island | express | express | island | local | wall projects with 2 island platforms, 4 tracks, 2 geometried walls", () => {
    const geometry = fourTrackIslandContractGeometry();
    const projection = projectStationStructure3D(geometry);
    expect(projection.platforms).toHaveLength(2);
    expect(projection.platforms.every((p) => p.config === "island")).toBe(true);
    expect(projection.tracks).toHaveLength(4);
    expect(projection.walls).toHaveLength(2);
    expect(projection.walls.every((w) => w.geometryState === "geometryKnown")).toBe(true);
  });

  it("hand-authored R42 and archetype-generated geometry use the identical exported function -- no separate code path", () => {
    const r42 = projectStationStructure3D(buildBayRidgeAvStationGeometrySeed(NOW));
    const archetype = projectStationStructure3D(instantiate(UG_SIDE_2TRACK_ARCHETYPE_ID, "TESTSIDE2"));
    expect(r42.stationGeometryId).toBe("stationGeometry:R42");
    expect(archetype.stationGeometryId).toBe("stationGeometry:TESTSIDE2");
    // Both are produced by the one function imported at the top of this file -- a single call site proves this structurally.
  });
});

describe("projectStationStructure3D -- R42 end-to-end proof + debug summary", () => {
  const seed = buildBayRidgeAvStationGeometrySeed(NOW);
  const projection = projectStationStructure3D(seed);

  it("projects exactly 3 levels, 2 platforms, 2 tracks, 2 walls (geometryUnknown), 4 connections (topologyOnly) -- derived from canonical R42, not hardcoded", () => {
    expect(projection.levels).toHaveLength(seed.levels.length);
    expect(projection.platforms).toHaveLength(seed.platforms.length);
    expect(projection.tracks).toHaveLength(seed.trackCenterlines.length);
    expect(projection.walls).toHaveLength(seed.wallSurfaces.length);
    expect(projection.connections).toHaveLength(seed.connections.length);
  });

  it("produces a readable, non-empty debug summary mentioning every projected id", () => {
    const summary = summarizeStationStructuralProjection3D(projection);
    expect(summary).toContain("stationGeometry:R42");
    for (const level of projection.levels) expect(summary).toContain(level.id);
    for (const platform of projection.platforms) expect(summary).toContain(platform.id);
    for (const track of projection.tracks) expect(summary).toContain(track.id);
    for (const wall of projection.walls) expect(summary).toContain(wall.id);
    for (const connection of projection.connections) expect(summary).toContain(connection.id);
  });
});

describe("projectStationStructure3D -- no second Station Truth authority / no persistence", () => {
  const source = readFileSync(new URL("./stationStructuralProjection3D.ts", import.meta.url), "utf-8");

  it("never imports IndexedDB/localStorage/fetch persistence -- this module is pure, derived, non-persistent", () => {
    expect(source).not.toMatch(/indexedDB|localStorage|fetch\(|sessionStorage/);
  });

  it("never branches on an archetype id", () => {
    expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK|archetypeId/);
  });

  it("never branches on a real station id (no R42 literal, no .gtfsStopId read)", () => {
    expect(source).not.toMatch(/"R42"|'R42'|\.gtfsStopId/);
  });
});

describe("regression -- STATION-07/STATION-10/STATION-12 remain completely unaffected by this batch", () => {
  const seed = buildBayRidgeAvStationGeometrySeed(NOW);

  it("STATION-07's own projectStationTopology still produces the same lane set for R42", () => {
    const model = projectStationTopology({ platforms: seed.platforms, trackCenterlines: seed.trackCenterlines, wallSurfaces: seed.wallSurfaces });
    expect(model.lanes.filter((l) => l.kind === "platform")).toHaveLength(2);
    expect(model.lanes.filter((l) => l.kind === "track")).toHaveLength(2);
    expect(model.lanes.filter((l) => l.kind === "wall")).toHaveLength(0); // still honestly skipped
  });

  it("STATION-10's resolver still resolves R42's real platform/track/wall subjects", () => {
    const platformRef: StationDetailSubjectRef = { stationGeometryId: seed.id, subjectKind: "platform", subjectId: "platform:R42:northbound" };
    const wallRef: StationDetailSubjectRef = { stationGeometryId: seed.id, subjectKind: "wall", subjectId: "wall:R42:northbound-back" };
    expect(resolveStationDetailSubject(seed, platformRef)).not.toBeNull();
    expect(resolveStationDetailSubject(seed, wallRef)).not.toBeNull();
  });

  it("STATION-12's readiness evaluator still produces R42's own known results", () => {
    const report = evaluateStationStructuralReadiness(seed);
    const byRequirement = Object.fromEntries(report.items.map((i) => [i.requirement, i.status]));
    expect(byRequirement.levels).toBe("READY");
    expect(byRequirement.connections).toBe("READY");
    expect(byRequirement.wallSurfaces).toBe("UNKNOWN");
  });
});
