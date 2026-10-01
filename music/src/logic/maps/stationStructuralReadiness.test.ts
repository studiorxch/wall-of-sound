import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import { UG_SIDE_2TRACK_ARCHETYPE_ID, UG_ISLAND_2TRACK_ARCHETYPE_ID } from "../../data/stationArchetypeTypes";
import type { StationGeometryData } from "../../data/stationGeometryTypes";
import { makeStationGeometryId } from "../../data/stationGeometryTypes";
import {
  FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
  FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
  FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
} from "./stationGeometryFourTrackIslandContractFixture";
import { evaluateStationStructuralReadiness } from "./stationStructuralReadiness";

const NOW = "2026-09-30T00:00:00.000Z";

function requirement(report: ReturnType<typeof evaluateStationStructuralReadiness>, name: string) {
  const item = report.items.find((i) => i.requirement === name);
  if (!item) throw new Error(`missing requirement: ${name}`);
  return item;
}

describe("evaluateStationStructuralReadiness -- real Bay Ridge Av (R42)", () => {
  const seed = buildBayRidgeAvStationGeometrySeed(NOW);
  const report = evaluateStationStructuralReadiness(seed);

  it("reports the correct stationGeometryId", () => {
    expect(report.stationGeometryId).toBe("stationGeometry:R42");
  });

  it("levels: READY -- every level (surface/mezzanine/platform) is now topologically connected (STATION-12)", () => {
    expect(requirement(report, "levels").status).toBe("READY");
  });

  it("platformFootprints: PARTIAL -- both platforms have an OSM-estimated footprint, neither at strong provenance", () => {
    expect(requirement(report, "platformFootprints").status).toBe("PARTIAL");
  });

  it("trackCenterlines: PARTIAL -- both tracks have OSM-sourced localPoints, neither at strong provenance", () => {
    expect(requirement(report, "trackCenterlines").status).toBe("PARTIAL");
  });

  it("wallSurfaces: UNKNOWN -- both STATION-11 walls have real identity but zero geometry", () => {
    const item = requirement(report, "wallSurfaces");
    expect(item.status).toBe("UNKNOWN");
    expect(item.note).toMatch(/identity\/relationship/);
  });

  it("mezzanineFootprint: UNKNOWN -- the mezzanine level exists but has no footprint", () => {
    expect(requirement(report, "mezzanineFootprint").status).toBe("UNKNOWN");
  });

  it("connections: READY -- every level is reachable via a real connection after STATION-12's surface-mezzanine wiring, but zero have spatial path geometry", () => {
    const item = requirement(report, "connections");
    expect(item.status).toBe("READY");
    expect(item.note).toMatch(/0\/4 connection\(s\) have authored spatial path/);
  });

  it("columns: UNKNOWN -- no column/pillar primitive exists in Station Truth at all", () => {
    expect(requirement(report, "columns").status).toBe("UNKNOWN");
  });
});

describe("evaluateStationStructuralReadiness -- generic across archetype-generated and synthetic geometry (no R42-specific behavior)", () => {
  it("UG_SIDE_2TRACK archetype: levels PARTIAL (surface level generated but left unconnected by this archetype's own derive function, mezzanine/platform ARE connected) rather than crashing or silently defaulting", () => {
    const geometry = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "TESTSIDE", routeIds: [] },
      origin: { longitude: 0, latitude: 0, orientationDeg: 0 },
      now: NOW,
    });
    const report = evaluateStationStructuralReadiness(geometry);
    expect(report.stationGeometryId).toBe(makeStationGeometryId("TESTSIDE"));
    expect(requirement(report, "levels").status).toBe("PARTIAL");
    // Archetype-generated platforms/tracks always carry localPoints/footprint (heuristic provenance, low/no confidence) -> PARTIAL, never READY, never a crash.
    expect(requirement(report, "platformFootprints").status).toBe("PARTIAL");
    expect(requirement(report, "trackCenterlines").status).toBe("PARTIAL");
    // No archetype ships wallSurfaces.
    expect(requirement(report, "wallSurfaces").status).toBe("UNKNOWN");
  });

  it("UG_ISLAND_2TRACK archetype evaluates without throwing and without any archetype-specific branch in the evaluator", () => {
    const geometry = instantiateStationArchetype({
      archetypeId: UG_ISLAND_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "TESTISLAND", routeIds: [] },
      origin: { longitude: 0, latitude: 0, orientationDeg: 0 },
      now: NOW,
    });
    expect(() => evaluateStationStructuralReadiness(geometry)).not.toThrow();
  });

  it("the synthetic four-track-island contract fixture (real geometried walls) reports wallSurfaces as PARTIAL, not UNKNOWN -- proving the evaluator distinguishes geometried from geometryless walls generically", () => {
    const syntheticGeometry: StationGeometryData = {
      id: makeStationGeometryId("CONTRACT"),
      stationRef: { gtfsStopId: "CONTRACT", routeIds: [] },
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      origin: { longitude: 0, latitude: 0, altitudeM: 0, orientationDeg: 0, provenance: { source: "heuristic" } },
      levels: [],
      platforms: [...FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS],
      trackCenterlines: [...FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES],
      connections: [],
      platformLinks: [],
      evidenceConflicts: [],
      entrances: [],
      wallSurfaces: [...FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES],
    };
    const report = evaluateStationStructuralReadiness(syntheticGeometry);
    // Fixture walls are "authored" provenance with no confidence field -> not "strong" by this module's own threshold rule, so PARTIAL (present, not strong), never UNKNOWN (present).
    expect(requirement(report, "wallSurfaces").status).toBe("PARTIAL");
    expect(requirement(report, "levels").status).toBe("UNKNOWN"); // no levels in this hand-built synthetic record
  });

  it("an empty/minimal geometry reports UNKNOWN across every collection-based requirement, never a fabricated READY/PARTIAL", () => {
    const empty: StationGeometryData = {
      id: makeStationGeometryId("EMPTY"),
      stationRef: { gtfsStopId: "EMPTY", routeIds: [] },
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      origin: { longitude: 0, latitude: 0, altitudeM: 0, orientationDeg: 0, provenance: { source: "unknown" } },
      levels: [],
      platforms: [],
      trackCenterlines: [],
      connections: [],
      platformLinks: [],
      evidenceConflicts: [],
      entrances: [],
      wallSurfaces: [],
    };
    const report = evaluateStationStructuralReadiness(empty);
    for (const item of report.items) expect(item.status).toBe("UNKNOWN");
  });
});

describe("stationStructuralReadiness.ts -- generic, no station-specific or archetype-specific branching", () => {
  const source = readFileSync(new URL("./stationStructuralReadiness.ts", import.meta.url), "utf-8");

  it("never branches on an archetype id", () => {
    expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK|archetypeId/);
  });

  it("never branches on a real station id (R42, R16, R43, etc.) or reads .gtfsStopId at all (mentioned only in this file's own prose/doc comments)", () => {
    expect(source).not.toMatch(/"R42"|'R42'|\.gtfsStopId/);
  });

  it("is a pure module with no DOM, no fetch, no side effects", () => {
    expect(source).not.toMatch(/document\.|fetch\(|localStorage|indexedDB/);
  });
});
