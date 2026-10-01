import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import { UG_SIDE_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";
import type { StationGeometryData } from "../../data/stationGeometryTypes";
import { makeStationGeometryId } from "../../data/stationGeometryTypes";
import { projectStationStructure3D, type ProjectedLevel } from "./stationStructuralProjection3D";
import {
  deriveStationWorldAnchor,
  deriveLevelPresentationDepthM,
  LEVEL_PRESENTATION_SPACING_UNITS,
} from "./stationWorldTransform";

const NOW = "2026-09-30T00:00:00.000Z";

describe("deriveStationWorldAnchor -- reuses existing geographic/orientation authority, never a second one", () => {
  it("R42: longitude/latitude/altitudeM/headingDeg are copied verbatim from the real StationGeometryData.origin", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const anchor = deriveStationWorldAnchor(seed);
    expect(anchor.longitude).toBe(seed.origin.longitude);
    expect(anchor.latitude).toBe(seed.origin.latitude);
    expect(anchor.altitudeM).toBe(seed.origin.altitudeM);
    expect(anchor.headingDeg).toBe(seed.origin.orientationDeg);
  });

  it("is deterministic -- identical input produces an identical result", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    expect(deriveStationWorldAnchor(seed)).toEqual(deriveStationWorldAnchor(buildBayRidgeAvStationGeometrySeed(NOW)));
  });

  it("never mutates the input StationGeometryData", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const before = JSON.parse(JSON.stringify(seed));
    deriveStationWorldAnchor(seed);
    expect(seed).toEqual(before);
  });

  it("works generically for an arbitrary station origin (not R42's own real coordinates)", () => {
    const geometry: StationGeometryData = {
      id: makeStationGeometryId("ARBITRARY"),
      stationRef: { gtfsStopId: "ARBITRARY", routeIds: [] },
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      origin: { longitude: -73.5, latitude: 40.9, altitudeM: -2.5, orientationDeg: 271.4, provenance: { source: "authority" } },
      levels: [],
      platforms: [],
      trackCenterlines: [],
      connections: [],
      platformLinks: [],
      evidenceConflicts: [],
      entrances: [],
      wallSurfaces: [],
    };
    const anchor = deriveStationWorldAnchor(geometry);
    expect(anchor).toEqual({ longitude: -73.5, latitude: 40.9, altitudeM: -2.5, headingDeg: 271.4 });
  });

  it("works generically for an archetype-generated station -- the same function, zero archetype-specific behavior", () => {
    const geometry = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "TESTSIDE2", routeIds: [] },
      origin: { longitude: 10, latitude: 20, orientationDeg: 90 },
      now: NOW,
    });
    expect(deriveStationWorldAnchor(geometry)).toEqual({ longitude: 10, latitude: 20, altitudeM: 0, headingDeg: 90 });
  });

  it("an arbitrary route bearing (e.g. a reversed/perpendicular orientation) passes through unchanged -- no R42-shaped rotation assumption", () => {
    const geometry: StationGeometryData = {
      id: makeStationGeometryId("REVERSED"),
      stationRef: { gtfsStopId: "REVERSED", routeIds: [] },
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      origin: { longitude: 0, latitude: 0, altitudeM: 0, orientationDeg: 358.9, provenance: { source: "authority" } },
      levels: [],
      platforms: [],
      trackCenterlines: [],
      connections: [],
      platformLinks: [],
      evidenceConflicts: [],
      entrances: [],
      wallSurfaces: [],
    };
    expect(deriveStationWorldAnchor(geometry).headingDeg).toBe(358.9);
  });
});

describe("deriveLevelPresentationDepthM -- mirrors stationStructure3DScene.ts's own buildLevelSceneY semantics", () => {
  it("uses presentationStackIndex, scaled by the documented spacing constant, when canonicalElevationM is absent", () => {
    const level: ProjectedLevel = { id: "level:TEST:mezzanine", kind: "mezzanine", presentationStackIndex: 2 };
    expect(deriveLevelPresentationDepthM(level)).toBe(-2 * LEVEL_PRESENTATION_SPACING_UNITS);
  });

  it("uses canonicalElevationM directly (unconverted) when present, never derived from presentationStackIndex", () => {
    const level: ProjectedLevel = { id: "level:TEST:surface", kind: "surface", presentationStackIndex: 0, canonicalElevationM: -3.56 };
    expect(deriveLevelPresentationDepthM(level)).toBe(-3.56);
  });

  it("R42's real projected levels: surface uses canonicalElevationM (0), mezzanine/platform use presentationStackIndex", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const surface = projection.levels.find((l) => l.kind === "surface")!;
    const mezzanine = projection.levels.find((l) => l.kind === "mezzanine")!;
    const platform = projection.levels.find((l) => l.kind === "platform")!;
    expect(deriveLevelPresentationDepthM(surface)).toBe(0);
    expect(deriveLevelPresentationDepthM(mezzanine)).toBe(-1 * LEVEL_PRESENTATION_SPACING_UNITS);
    expect(deriveLevelPresentationDepthM(platform)).toBe(-2 * LEVEL_PRESENTATION_SPACING_UNITS);
  });

  it("is deterministic and never mutates its input level", () => {
    const level: ProjectedLevel = { id: "level:TEST:platform", kind: "platform", presentationStackIndex: 1 };
    const before = JSON.parse(JSON.stringify(level));
    deriveLevelPresentationDepthM(level);
    expect(level).toEqual(before);
  });
});

describe("stationWorldTransform.ts -- bridge-safe (zero Three.js/Mapbox dependency), no station/archetype branching", () => {
  const source = readFileSync(new URL("./stationWorldTransform.ts", import.meta.url), "utf-8");

  it("never imports three or mapboxgl -- this module must stay plain-data-only to be safely bridgeable across the music/<->wall/ boundary", () => {
    expect(source).not.toMatch(/from ["']three["']|mapboxgl/);
  });

  it("never branches on an archetype id", () => {
    expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK|archetypeId/);
  });

  it("never branches on a real station id (no quoted R42 literal, no .gtfsStopId read)", () => {
    expect(source).not.toMatch(/"R42"|'R42'|\.gtfsStopId/);
  });
});
