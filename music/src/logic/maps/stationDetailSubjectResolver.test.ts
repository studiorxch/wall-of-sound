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

const NOW = "2026-09-30T00:00:00.000Z";
const BAY_RIDGE = buildBayRidgeAvStationGeometrySeed(NOW);
const BAY_RIDGE_ID = makeStationGeometryId("R42");

// The four-track island contract fixture is synthetic/test-only (STATION-06/07,
// NOT a real UG_ISLAND_4TRACK archetype — see that fixture's own header).
// It is the one fixture in this repo with real wallSurfaces, so it is this
// batch's own required proof for wall-subject resolution — Bay Ridge Av's
// real wallSurfaces stays empty, per this task's own explicit instruction.
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

describe("stationDetailSubjectResolver.ts -- no archetype branching (STATION-10)", () => {
  const source = readFileSync(new URL("./stationDetailSubjectResolver.ts", import.meta.url), "utf-8");

  it("never branches on an archetype id -- no UG_SIDE_2TRACK/UG_SIDE_4TRACK/UG_ISLAND_2TRACK identifier anywhere in this file", () => {
    expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK|archetypeId/);
  });

  it("never reads .suitableForArt -- writability plays no role in subject resolution (mentioned only in this file's own prose/doc comments)", () => {
    expect(source).not.toMatch(/\.suitableForArt/);
  });
});
