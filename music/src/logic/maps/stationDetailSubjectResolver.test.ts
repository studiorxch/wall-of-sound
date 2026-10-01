import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { makeStationGeometryId } from "../../data/stationGeometryTypes";
import type { StationDetailSubjectRef } from "../../data/stationDetailSubjectTypes";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import { UG_SIDE_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";
import {
  FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE,
  islandN,
  trackN,
  wallN,
} from "./stationGeometryFourTrackIslandContractFixture";
import {
  isStationDetailSubjectKind,
  resolveStationDetailSubject,
  type StationDetailSubjectSource,
} from "./stationDetailSubjectResolver";
import { projectStationTopology } from "./stationTopologyProjection";

const NOW = "2026-09-30T00:00:00.000Z";
const BAY_RIDGE = buildBayRidgeAvStationGeometrySeed(NOW);
const BAY_RIDGE_ID = makeStationGeometryId("R42");

// The four-track island contract fixture is synthetic/test-only (STATION-06/07,
// NOT a real UG_ISLAND_4TRACK archetype — see that fixture's own header).
// It predates STATION-11's own real Bay Ridge Av wall records (added below)
// and remains the one fixture with a real/synthetic wall that also carries
// authored geometry — useful for proving a GEOMETRIED wall still resolves
// and still projects, distinctly from STATION-11's geometryless real walls.
const CONTRACT_GEOMETRY_ID = makeStationGeometryId("CONTRACT");
const CONTRACT_SOURCE: StationDetailSubjectSource = {
  id: CONTRACT_GEOMETRY_ID,
  platforms: [islandN],
  trackCenterlines: [trackN],
  wallSurfaces: [wallN],
};

describe("StationDetailSubjectRef (STATION-10)", () => {
  it("preserves stationGeometryId/subjectKind/subjectId unmodified", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "platform",
      subjectId: "platform:R42:northbound",
    };
    expect(ref.stationGeometryId).toBe(BAY_RIDGE_ID);
    expect(ref.subjectKind).toBe("platform");
    expect(ref.subjectId).toBe("platform:R42:northbound");
  });
});

describe("resolveStationDetailSubject -- platform/track/wall resolution", () => {
  it("resolves a platform subject to the exact canonical Base Truth platform", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "platform",
      subjectId: "platform:R42:northbound",
    };
    const resolved = resolveStationDetailSubject(BAY_RIDGE, ref);
    expect(resolved).not.toBeNull();
    expect(resolved?.subjectKind).toBe("platform");
    expect(resolved?.subject).toBe(BAY_RIDGE.platforms.find((p) => p.id === "platform:R42:northbound"));
  });

  it("resolves a track subject to the exact canonical Base Truth track", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "track",
      subjectId: "track:R42:southbound",
    };
    const resolved = resolveStationDetailSubject(BAY_RIDGE, ref);
    expect(resolved).not.toBeNull();
    expect(resolved?.subjectKind).toBe("track");
    expect(resolved?.subject).toBe(BAY_RIDGE.trackCenterlines.find((t) => t.id === "track:R42:southbound"));
  });

  it("resolves a wall subject to the exact canonical Base Truth wall, using the synthetic four-track-island contract fixture (Bay Ridge Av has no authored wallSurfaces yet)", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: CONTRACT_GEOMETRY_ID,
      subjectKind: "wall",
      subjectId: wallN.id,
    };
    const resolved = resolveStationDetailSubject(CONTRACT_SOURCE, ref);
    expect(resolved).not.toBeNull();
    expect(resolved?.subjectKind).toBe("wall");
    expect(resolved?.subject).toBe(wallN);
  });

  it("fails honestly for a missing/invalid subject id -- never substitutes another subject", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "platform",
      subjectId: "platform:R42:nonexistent",
    };
    expect(resolveStationDetailSubject(BAY_RIDGE, ref)).toBeNull();
  });

  it("fails honestly for a station-id mismatch -- never falls back to another station's geometry", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: makeStationGeometryId("R16"),
      subjectKind: "platform",
      subjectId: "platform:R42:northbound",
    };
    expect(resolveStationDetailSubject(BAY_RIDGE, ref)).toBeNull();
  });

  it("does not cross-resolve a wrong subjectKind onto an object with the same string id in another collection", () => {
    const sharedId = "shared-id:CONTRACT";
    const source: StationDetailSubjectSource = {
      id: CONTRACT_GEOMETRY_ID,
      platforms: [{ ...islandN, id: sharedId }],
      trackCenterlines: [{ ...trackN, id: sharedId, platformId: null, platformSide: undefined }],
      wallSurfaces: [],
    };
    const platformRef: StationDetailSubjectRef = { stationGeometryId: CONTRACT_GEOMETRY_ID, subjectKind: "platform", subjectId: sharedId };
    const trackRef: StationDetailSubjectRef = { stationGeometryId: CONTRACT_GEOMETRY_ID, subjectKind: "track", subjectId: sharedId };

    const resolvedPlatform = resolveStationDetailSubject(source, platformRef);
    const resolvedTrack = resolveStationDetailSubject(source, trackRef);

    expect(resolvedPlatform?.subjectKind).toBe("platform");
    expect(resolvedPlatform?.subject).toBe(source.platforms[0]);
    expect(resolvedTrack?.subjectKind).toBe("track");
    expect(resolvedTrack?.subject).toBe(source.trackCenterlines[0]);
  });

  it("resolution never depends on suitableForArt -- a wall with suitableForArt:false still resolves", () => {
    const unwritableWall = { ...wallN, suitableForArt: false };
    const source: StationDetailSubjectSource = { ...CONTRACT_SOURCE, wallSurfaces: [unwritableWall] };
    const ref: StationDetailSubjectRef = { stationGeometryId: CONTRACT_GEOMETRY_ID, subjectKind: "wall", subjectId: wallN.id };
    const resolved = resolveStationDetailSubject(source, ref);
    expect(resolved?.subject).toBe(unwritableWall);
  });

  it("a non-writable/selectable subject (a track, which has no suitableForArt field at all) remains resolvable", () => {
    const ref: StationDetailSubjectRef = { stationGeometryId: CONTRACT_GEOMETRY_ID, subjectKind: "track", subjectId: trackN.id };
    const resolved = resolveStationDetailSubject(CONTRACT_SOURCE, ref);
    expect(resolved).not.toBeNull();
    expect("suitableForArt" in (resolved?.subject as object)).toBe(false);
  });

  it("resolves identically whether the source geometry is archetype-generated or hand-authored -- the same contract, no archetype branching", () => {
    const archetypeGeometry = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "TEST1", routeIds: [] },
      origin: { longitude: 0, latitude: 0, orientationDeg: 0 },
      now: NOW,
    });

    const archetypeRef: StationDetailSubjectRef = {
      stationGeometryId: makeStationGeometryId("TEST1"),
      subjectKind: "platform",
      subjectId: "platform:TEST1:northbound",
    };
    const bayRidgeRef: StationDetailSubjectRef = {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "platform",
      subjectId: "platform:R42:northbound",
    };

    const resolvedArchetype = resolveStationDetailSubject(archetypeGeometry, archetypeRef);
    const resolvedAuthored = resolveStationDetailSubject(BAY_RIDGE, bayRidgeRef);

    expect(resolvedArchetype?.subjectKind).toBe("platform");
    expect(resolvedAuthored?.subjectKind).toBe("platform");
    expect(resolvedArchetype?.subject.id).toBe("platform:TEST1:northbound");
    expect(resolvedAuthored?.subject.id).toBe("platform:R42:northbound");
  });

  it("isStationDetailSubjectKind validates the three known kinds only", () => {
    expect(isStationDetailSubjectKind("platform")).toBe(true);
    expect(isStationDetailSubjectKind("track")).toBe(true);
    expect(isStationDetailSubjectKind("wall")).toBe(true);
    expect(isStationDetailSubjectKind("train")).toBe(false);
    expect(isStationDetailSubjectKind("")).toBe(false);
  });

  it("confirms the fixture's own provenance is synthetic/authored, not a real production wall seed", () => {
    expect(FOUR_TRACK_ISLAND_CONTRACT_PROVENANCE.source).toBe("authored");
  });
});

// STATION-11 (0915_WOS_Subway_Bay_Ridge_Av_Structural_Truth_Enrichment_v1.0.0)
// -- proves the two new real R42 wall records (each side platform's own
// back wall, authored with no real polygon yet) travel through the exact
// same generic STATION-10 resolution path as any other subject, with zero
// R42-specific code anywhere in the resolver itself.
describe("real Bay Ridge Av wall subjects resolve through the exact generic STATION-10 path (STATION-11)", () => {
  it("resolves the northbound back wall to the exact canonical R42 wall record", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "wall",
      subjectId: "wall:R42:northbound-back",
    };
    const resolved = resolveStationDetailSubject(BAY_RIDGE, ref);
    expect(resolved).not.toBeNull();
    expect(resolved?.subjectKind).toBe("wall");
    expect(resolved?.subject).toBe(BAY_RIDGE.wallSurfaces.find((w) => w.id === "wall:R42:northbound-back"));
  });

  it("resolves the southbound back wall to the exact canonical R42 wall record", () => {
    const ref: StationDetailSubjectRef = {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "wall",
      subjectId: "wall:R42:southbound-back",
    };
    const resolved = resolveStationDetailSubject(BAY_RIDGE, ref);
    expect(resolved).not.toBeNull();
    expect(resolved?.subject).toBe(BAY_RIDGE.wallSurfaces.find((w) => w.id === "wall:R42:southbound-back"));
  });

  it("each resolved wall carries its own adjacentPlatformId relationship, unmodified by resolution", () => {
    const northboundResolved = resolveStationDetailSubject(BAY_RIDGE, {
      stationGeometryId: BAY_RIDGE_ID,
      subjectKind: "wall",
      subjectId: "wall:R42:northbound-back",
    });
    expect((northboundResolved?.subject as { adjacentPlatformId?: string }).adjacentPlatformId).toBe("platform:R42:northbound");
  });

  it("STATION-07's projection honestly SKIPS these walls (no localPolygon to plot) -- real identity exists in Base Truth without being visible in the 2D Overview, exactly as the projection's own doc already promises", () => {
    const model = projectStationTopology({
      platforms: BAY_RIDGE.platforms,
      trackCenterlines: BAY_RIDGE.trackCenterlines,
      wallSurfaces: BAY_RIDGE.wallSurfaces,
    });
    const wallLaneIds = model.lanes.filter((l) => l.kind === "wall").map((l) => l.id);
    expect(wallLaneIds).toHaveLength(0);
    // The platform/track lanes are completely unaffected by the new wall records.
    expect(model.lanes.filter((l) => l.kind === "platform")).toHaveLength(2);
    expect(model.lanes.filter((l) => l.kind === "track")).toHaveLength(2);
  });
});

describe("stationDetailSubjectResolver.ts -- no archetype branching (STATION-10)", () => {
  const source = readFileSync(new URL("./stationDetailSubjectResolver.ts", import.meta.url), "utf-8");

  it("never branches on an archetype id -- no UG_SIDE_2TRACK/UG_SIDE_4TRACK/UG_ISLAND_2TRACK identifier anywhere in this file", () => {
    expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK|archetypeId/);
  });

  it("never reads .suitableForArt -- writability plays no role in subject resolution (mentioned only in this file's own prose/doc comments)", () => {
    expect(source).not.toMatch(/\.suitableForArt/);
  });
});
