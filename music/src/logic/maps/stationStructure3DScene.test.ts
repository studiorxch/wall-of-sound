import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import {
  UG_SIDE_2TRACK_ARCHETYPE_ID,
  UG_SIDE_4TRACK_ARCHETYPE_ID,
  UG_ISLAND_2TRACK_ARCHETYPE_ID,
} from "../../data/stationArchetypeTypes";
import {
  FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS,
  FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES,
  FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES,
} from "./stationGeometryFourTrackIslandContractFixture";
import { makeStationGeometryId, type StationGeometryData } from "../../data/stationGeometryTypes";
import { projectStationStructure3D, type ProjectedLevel } from "./stationStructuralProjection3D";
import { buildStationStructure3DScene, buildLevelSceneY, LEVEL_PRESENTATION_SPACING_UNITS } from "./stationStructure3DScene";
import { evaluateStationStructuralReadiness } from "./stationStructuralReadiness";
import { resolveStationDetailSubject } from "./stationDetailSubjectResolver";
import { projectStationTopology } from "./stationTopologyProjection";
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
    levels: [{ id: "level:CONTRACT:platform", kind: "platform", label: "Platform level", provenance: { source: "authored" } }],
    platforms: [...FOUR_TRACK_ISLAND_CONTRACT_PLATFORMS],
    trackCenterlines: [...FOUR_TRACK_ISLAND_CONTRACT_TRACK_CENTERLINES],
    connections: [],
    platformLinks: [],
    evidenceConflicts: [],
    entrances: [],
    wallSurfaces: [...FOUR_TRACK_ISLAND_CONTRACT_WALL_SURFACES],
  };
}

function userDataByType(scene: THREE.Group, type: string): { type: string; id: string; levelId?: string }[] {
  const results: { type: string; id: string; levelId?: string }[] = [];
  const seen = new Set<string>();
  scene.traverse((object) => {
    const data = object.userData as { type?: string; id?: string; levelId?: string };
    if (data?.type === type && data.id && !seen.has(data.id)) {
      seen.add(data.id);
      results.push({ type: data.type, id: data.id, levelId: data.levelId });
    }
  });
  return results;
}

describe("buildStationStructure3DScene -- consumes StationStructuralProjection3D only", () => {
  const seed = buildBayRidgeAvStationGeometrySeed(NOW);
  const projection = projectStationStructure3D(seed);

  it("builds a non-empty Three.js Group from a real projection", () => {
    const scene = buildStationStructure3DScene(projection);
    expect(scene).toBeInstanceOf(THREE.Group);
    expect(scene.children.length).toBeGreaterThan(0);
  });

  it("never mutates the input projection", () => {
    const before = JSON.parse(JSON.stringify(projection));
    buildStationStructure3DScene(projection);
    expect(projection).toEqual(before);
  });
});

describe("buildStationStructure3DScene -- canonical identity preservation", () => {
  it("retains every canonical platform id in render-object userData", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const scene = buildStationStructure3DScene(projection);
    const platformIds = userDataByType(scene, "platform").map((d) => d.id).sort();
    expect(platformIds).toEqual(projection.platforms.map((p) => p.id).sort());
  });

  it("retains every canonical track id in render-object userData", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const scene = buildStationStructure3DScene(projection);
    const trackIds = userDataByType(scene, "track").map((d) => d.id).sort();
    expect(trackIds).toEqual(projection.tracks.map((t) => t.id).sort());
  });

  it("retains every canonical level id in render-object userData", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const scene = buildStationStructure3DScene(projection);
    const levelIds = userDataByType(scene, "level").map((d) => d.id).sort();
    expect(levelIds).toEqual(projection.levels.map((l) => l.id).sort());
  });

  it("retains every canonical connection id in render-object userData, even for topology-only connections", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const scene = buildStationStructure3DScene(projection);
    const connectionIds = userDataByType(scene, "connection").map((d) => d.id).sort();
    expect(connectionIds).toEqual(projection.connections.map((c) => c.id).sort());
  });
});

describe("buildStationStructure3DScene -- wall partial-truth behavior", () => {
  it("geometryUnknown walls (R42's real back walls) produce NO physical wall geometry at all -- not even a userData entry", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    expect(projection.walls.every((w) => w.geometryState === "geometryUnknown")).toBe(true);
    const scene = buildStationStructure3DScene(projection);
    expect(userDataByType(scene, "wall")).toHaveLength(0);
  });

  it("geometryKnown walls (synthetic fixture) ARE renderable -- real Mesh geometry with the wall's own id", () => {
    const geometry = fourTrackIslandContractGeometry();
    const projection = projectStationStructure3D(geometry);
    expect(projection.walls.every((w) => w.geometryState === "geometryKnown")).toBe(true);
    const scene = buildStationStructure3DScene(projection);
    const wallEntries = userDataByType(scene, "wall");
    expect(wallEntries).toHaveLength(2);
    expect(wallEntries.map((w) => w.id).sort()).toEqual(projection.walls.map((w) => w.id).sort());
  });
});

describe("buildStationStructure3DScene -- connection path/topology-only behavior", () => {
  it("topologyOnly connections (all 4 of R42's real connections) do not become fake spatial paths -- rendered as a 2-point dashed indicator, never a multi-point path", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    expect(projection.connections.every((c) => c.pathState === "topologyOnly")).toBe(true);
    const scene = buildStationStructure3DScene(projection);
    let dashedCount = 0;
    scene.traverse((object) => {
      if (object instanceof THREE.Line && (object.userData as { type?: string }).type === "connection") {
        expect(object.material).toBeInstanceOf(THREE.LineDashedMaterial);
        expect(object.geometry.attributes.position.count).toBe(2); // exactly a 2-point relationship indicator, never an invented multi-point path
        dashedCount += 1;
      }
    });
    expect(dashedCount).toBe(4);
  });

  it("a pathKnown connection renders its REAL localPath honestly, with a solid (non-dashed) material, distinct from a topologyOnly indicator", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const withPath: StationGeometryData = {
      ...seed,
      connections: seed.connections.map((c, i) => (i === 0 ? { ...c, localPath: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 2, y: 1 }] } : c)),
    };
    const projection = projectStationStructure3D(withPath);
    const scene = buildStationStructure3DScene(projection);
    let pathLine: THREE.Line | null = null;
    scene.traverse((object) => {
      if (object instanceof THREE.Line && (object.userData as { type?: string; id?: string }).id === withPath.connections[0].id) {
        pathLine = object;
      }
    });
    expect(pathLine).not.toBeNull();
    expect(pathLine!.material).toBeInstanceOf(THREE.LineBasicMaterial);
    expect(pathLine!.geometry.attributes.position.count).toBe(3); // the real authored path, exactly as many points as authored
  });
});

describe("buildStationStructure3DScene -- canonical vs. presentation vertical placement", () => {
  it("presentationStackIndex drives scene Y for a level with no canonicalElevationM, scaled by the documented presentation constant", () => {
    const level: ProjectedLevel = { id: "level:TEST:mezzanine", kind: "mezzanine", presentationStackIndex: 2 };
    expect(buildLevelSceneY(level)).toBe(-2 * LEVEL_PRESENTATION_SPACING_UNITS);
  });

  it("canonicalElevationM is used directly (unconverted) when present, never derived from presentationStackIndex", () => {
    const level: ProjectedLevel = { id: "level:TEST:surface", kind: "surface", presentationStackIndex: 0, canonicalElevationM: -3.56 };
    expect(buildLevelSceneY(level)).toBe(-3.56);
    expect(buildLevelSceneY(level)).not.toBe(-0 * LEVEL_PRESENTATION_SPACING_UNITS);
  });

  it("R42's real surface level (canonicalElevationM: 0, heuristic) and its mezzanine (no canonicalElevationM) use genuinely different derivation paths even though both may resolve near 0", () => {
    const seed = buildBayRidgeAvStationGeometrySeed(NOW);
    const projection = projectStationStructure3D(seed);
    const surface = projection.levels.find((l) => l.kind === "surface")!;
    const mezzanine = projection.levels.find((l) => l.kind === "mezzanine")!;
    expect(surface.canonicalElevationM).toBe(0);
    expect(mezzanine.canonicalElevationM).toBeUndefined();
    expect(buildLevelSceneY(surface)).toBe(0); // from canonicalElevationM
    expect(buildLevelSceneY(mezzanine)).toBe(-1 * LEVEL_PRESENTATION_SPACING_UNITS); // from presentationStackIndex (1)
  });
});

describe("buildStationStructure3DScene -- generic topology proof (not Bay-Ridge-only)", () => {
  it("SIDE_2TRACK: 2 platforms, 2 tracks, 0 walls", () => {
    const scene = buildStationStructure3DScene(projectStationStructure3D(instantiate(UG_SIDE_2TRACK_ARCHETYPE_ID, "TESTSIDE2")));
    expect(userDataByType(scene, "platform")).toHaveLength(2);
    expect(userDataByType(scene, "track")).toHaveLength(2);
    expect(userDataByType(scene, "wall")).toHaveLength(0);
  });

  it("ISLAND_2TRACK: 1 island platform, 2 tracks", () => {
    const scene = buildStationStructure3DScene(projectStationStructure3D(instantiate(UG_ISLAND_2TRACK_ARCHETYPE_ID, "TESTISLAND2")));
    expect(userDataByType(scene, "platform")).toHaveLength(1);
    expect(userDataByType(scene, "track")).toHaveLength(2);
  });

  it("SIDE_4TRACK: 2 platforms, 4 tracks", () => {
    const scene = buildStationStructure3DScene(projectStationStructure3D(instantiate(UG_SIDE_4TRACK_ARCHETYPE_ID, "TESTSIDE4")));
    expect(userDataByType(scene, "platform")).toHaveLength(2);
    expect(userDataByType(scene, "track")).toHaveLength(4);
  });

  it("synthetic ISLAND_4TRACK contract fixture: 2 island platforms, 4 tracks, 2 geometried walls", () => {
    const scene = buildStationStructure3DScene(projectStationStructure3D(fourTrackIslandContractGeometry()));
    expect(userDataByType(scene, "platform")).toHaveLength(2);
    expect(userDataByType(scene, "track")).toHaveLength(4);
    expect(userDataByType(scene, "wall")).toHaveLength(2);
  });

  it("R42 produces a structurally distinct scene from every generic case above -- same function, different real data", () => {
    const r42Scene = buildStationStructure3DScene(projectStationStructure3D(buildBayRidgeAvStationGeometrySeed(NOW)));
    expect(userDataByType(r42Scene, "platform")).toHaveLength(2);
    expect(userDataByType(r42Scene, "track")).toHaveLength(2);
    expect(userDataByType(r42Scene, "wall")).toHaveLength(0); // distinct from the synthetic fixture's 2
    expect(userDataByType(r42Scene, "connection")).toHaveLength(4);
  });
});

describe("stationStructure3DScene.ts / stationStructure3DRenderer.ts -- projection-only boundary, no second truth model", () => {
  const sceneSource = readFileSync(new URL("./stationStructure3DScene.ts", import.meta.url), "utf-8");
  const rendererSource = readFileSync(new URL("./stationStructure3DRenderer.ts", import.meta.url), "utf-8");

  it("never imports StationGeometryData's own seed/registry/archetype modules -- consumes only StationStructuralProjection3D", () => {
    for (const source of [sceneSource, rendererSource]) {
      expect(source).not.toMatch(/stationGeometryBayRidgeAvSeed|stationGeometryRegistry|stationArchetypeInstantiate|stationArchetypeTypes/);
    }
  });

  it("never branches on an archetype id", () => {
    for (const source of [sceneSource, rendererSource]) {
      expect(source).not.toMatch(/UG_SIDE_2TRACK|UG_SIDE_4TRACK|UG_ISLAND_2TRACK/);
    }
  });

  it("never branches on a real station id (no quoted R42 literal)", () => {
    for (const source of [sceneSource, rendererSource]) {
      expect(source).not.toMatch(/"R42"|'R42'/);
    }
  });

  it("the renderer wrapper has a dispose() lifecycle that tears down its own resize observer, event listeners, and GPU resources", () => {
    expect(rendererSource).toMatch(/function dispose\(\)/);
    expect(rendererSource).toMatch(/resizeObserver\.disconnect\(\)/);
    expect(rendererSource).toMatch(/controls\.dispose\(\)/);
    expect(rendererSource).toMatch(/renderer\.dispose\(\)/);
  });

  it("uses event-driven rendering, never calling requestAnimationFrame", () => {
    expect(rendererSource).not.toMatch(/requestAnimationFrame\(/);
  });

  it("presentation constants (thickness/gauge/spacing) are module-level constants, never derived from the projection argument", () => {
    expect(sceneSource).toMatch(/const LEVEL_PRESENTATION_SPACING_UNITS/);
    expect(sceneSource).toMatch(/const PLATFORM_PRESENTATION_THICKNESS_UNITS/);
    expect(sceneSource).toMatch(/const TRACK_RAIL_GAUGE_PRESENTATION_UNITS/);
  });
});

describe("regression -- STATION-07/STATION-10/STATION-12/STATION-13 remain unaffected by this batch", () => {
  const seed = buildBayRidgeAvStationGeometrySeed(NOW);

  it("STATION-07's projectStationTopology still produces the same lane set for R42", () => {
    const model = projectStationTopology({ platforms: seed.platforms, trackCenterlines: seed.trackCenterlines, wallSurfaces: seed.wallSurfaces });
    expect(model.lanes.filter((l) => l.kind === "platform")).toHaveLength(2);
    expect(model.lanes.filter((l) => l.kind === "wall")).toHaveLength(0);
  });

  it("STATION-10's resolver still resolves R42's real subjects", () => {
    const ref: StationDetailSubjectRef = { stationGeometryId: seed.id, subjectKind: "wall", subjectId: "wall:R42:northbound-back" };
    expect(resolveStationDetailSubject(seed, ref)).not.toBeNull();
  });

  it("STATION-12's readiness evaluator still reports R42's own known results", () => {
    const report = evaluateStationStructuralReadiness(seed);
    const byRequirement = Object.fromEntries(report.items.map((i) => [i.requirement, i.status]));
    expect(byRequirement.levels).toBe("READY");
    expect(byRequirement.wallSurfaces).toBe("UNKNOWN");
  });

  it("STATION-13's projection still projects R42 identically", () => {
    const projection = projectStationStructure3D(seed);
    expect(projection.platforms).toHaveLength(2);
    expect(projection.walls.every((w) => w.geometryState === "geometryUnknown")).toBe(true);
  });
});
