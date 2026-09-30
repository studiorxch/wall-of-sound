import { describe, it, expect } from "vitest";
import {
  deriveUndergroundIsland2TrackGeometry,
  validateUndergroundIsland2TrackParameters,
  validateTrainConsistClearance,
  getUsablePlatformLengthM,
} from "./stationArchetypeUndergroundIsland2Track";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import { deriveUndergroundSide2TrackGeometry } from "./stationArchetypeUndergroundSide2Track";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import {
  DEFAULT_UG_ISLAND_2TRACK_PARAMETERS,
  DEFAULT_UG_SIDE_2TRACK_PARAMETERS,
  UG_ISLAND_2TRACK_ARCHETYPE_ID,
  UG_SIDE_2TRACK_ARCHETYPE_ID,
  UG_SIDE_4TRACK_ARCHETYPE_ID,
  makeStationArchetypeId,
  type UndergroundIsland2TrackParameters,
} from "../../data/stationArchetypeTypes";

function params(overrides: Partial<UndergroundIsland2TrackParameters> = {}): UndergroundIsland2TrackParameters {
  return { ...DEFAULT_UG_ISLAND_2TRACK_PARAMETERS, ...overrides };
}

describe("archetype identity", () => {
  it("is deterministic and distinct from the two side archetypes", () => {
    expect(UG_ISLAND_2TRACK_ARCHETYPE_ID).toBe("stationArchetype:UG_ISLAND_2TRACK");
    expect(UG_ISLAND_2TRACK_ARCHETYPE_ID).not.toBe(UG_SIDE_2TRACK_ARCHETYPE_ID);
    expect(UG_ISLAND_2TRACK_ARCHETYPE_ID).not.toBe(UG_SIDE_4TRACK_ARCHETYPE_ID);
  });
});

describe("deriveUndergroundIsland2TrackGeometry — structure", () => {
  const geometry = deriveUndergroundIsland2TrackGeometry(params(), "TEST");

  it("generates exactly the three levels surface/mezzanine/platform", () => {
    expect(geometry.levels.map((l) => l.kind).sort()).toEqual(["mezzanine", "platform", "surface"]);
  });

  it("generates exactly ONE island platform, never two", () => {
    expect(geometry.platforms).toHaveLength(1);
    expect(geometry.platforms[0]!.config).toBe("island");
    expect(geometry.platforms[0]!.footprint).toBeDefined();
    expect(geometry.platforms[0]!.footprint).toHaveLength(4);
  });

  it("generates exactly two physical track centerlines, both pointing at the SAME one island platform", () => {
    expect(geometry.trackCenterlines).toHaveLength(2);
    const islandId = geometry.platforms[0]!.id;
    for (const track of geometry.trackCenterlines) {
      expect(track.platformId).toBe(islandId);
      expect(track.localPoints).toBeDefined();
      expect(track.localPoints!.length).toBeGreaterThan(0);
      expect(track.gtfsShapeRef).toBeUndefined();
    }
  });

  it("assigns distinct, opposite platformSide values to the two tracks — the fact that makes island adjacency queryable", () => {
    const sides = geometry.trackCenterlines.map((t) => t.platformSide).sort();
    expect(sides).toEqual(["A", "B"]);
  });

  it("generates exactly ONE shared connection with no relatedPlatformId (only one platform exists, so per-platform disambiguation is inapplicable)", () => {
    expect(geometry.connections).toHaveLength(1);
    expect(geometry.connections[0]!.relatedPlatformId).toBeUndefined();
  });

  it("gives every generated record a distinct id — no duplicate track/platform/level ids", () => {
    const allIds = [
      ...geometry.levels.map((l) => l.id),
      ...geometry.platforms.map((p) => p.id),
      ...geometry.trackCenterlines.map((t) => t.id),
      ...geometry.connections.map((c) => c.id),
    ];
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});

describe("track offsets — symmetric about the one shared platform", () => {
  it("places both tracks at equal distance from the platform's own center, on opposite sides", () => {
    const geometry = deriveUndergroundIsland2TrackGeometry(params({ platformWidthM: 8, platformEdgeToTrackCenterM: 1.5 }), "TEST");
    const trackA = geometry.trackCenterlines.find((t) => t.platformSide === "A")!;
    const trackB = geometry.trackCenterlines.find((t) => t.platformSide === "B")!;
    const aY = trackA.localPoints![0]!.y;
    const bY = trackB.localPoints![0]!.y;
    expect(aY).toBeLessThan(0);
    expect(bY).toBeGreaterThan(0);
    expect(Math.abs(aY)).toBeCloseTo(Math.abs(bY), 9); // symmetric about the platform's own center
    expect(bY - aY).toBeCloseTo(8 + 2 * 1.5, 9); // platform width + both edge gaps
  });
});

describe("parametric predictability", () => {
  it("doubling platformLengthM exactly doubles the platform's X-extent", () => {
    const base = deriveUndergroundIsland2TrackGeometry(params({ platformLengthM: 100 }), "TEST");
    const doubled = deriveUndergroundIsland2TrackGeometry(params({ platformLengthM: 200 }), "TEST");
    const xExtent = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    expect(xExtent(doubled.platforms[0]!.footprint!)).toBeCloseTo(2 * xExtent(base.platforms[0]!.footprint!), 9);
  });

  it("widening the platform moves both tracks outward equally, never asymmetrically", () => {
    const narrow = deriveUndergroundIsland2TrackGeometry(params({ platformWidthM: 8 }), "TEST");
    const wide = deriveUndergroundIsland2TrackGeometry(params({ platformWidthM: 12 }), "TEST");
    const yOf = (g: typeof narrow, side: "A" | "B") => g.trackCenterlines.find((t) => t.platformSide === side)!.localPoints![0]!.y;
    const deltaA = Math.abs(yOf(wide, "A")) - Math.abs(yOf(narrow, "A"));
    const deltaB = Math.abs(yOf(wide, "B")) - Math.abs(yOf(narrow, "B"));
    expect(deltaA).toBeCloseTo(2, 9); // half the 4m widening, per side
    expect(deltaB).toBeCloseTo(2, 9);
  });
});

describe("provenance discipline", () => {
  const geometry = deriveUndergroundIsland2TrackGeometry(params(), "TEST");

  it("marks every generated level/platform/track/connection as heuristic — never authority, reference, or authored", () => {
    const allProvenanced = [...geometry.levels, ...geometry.platforms, ...geometry.trackCenterlines, ...geometry.connections];
    expect(allProvenanced.length).toBeGreaterThan(0);
    for (const record of allProvenanced) {
      expect(record.provenance.source).toBe("heuristic");
    }
  });

  it("cites the archetype itself as the source, not a real station", () => {
    expect(geometry.platforms[0]!.provenance.sourceRef).toMatch(/stationArchetype:UG_ISLAND_2TRACK/);
  });
});

describe("validateTrainConsistClearance", () => {
  it("passes when the platform is long enough for the consist plus margin", () => {
    const result = validateTrainConsistClearance({ usablePlatformLengthM: 150, trainConsistLengthM: 120, stoppingMarginM: 10 });
    expect(result.ok).toBe(true);
  });

  it("getUsablePlatformLengthM reads directly from the platform length parameter", () => {
    expect(getUsablePlatformLengthM(params({ platformLengthM: 137 }))).toBe(137);
  });
});

describe("non-overlap under valid parameters", () => {
  it("never lets the platform and either track collide, across a range of valid parameter combinations", () => {
    const combos: Partial<UndergroundIsland2TrackParameters>[] = [
      {},
      { platformWidthM: 6, platformEdgeToTrackCenterM: 1 },
      { platformWidthM: 12, platformEdgeToTrackCenterM: 2.5 },
    ];
    for (const overrides of combos) {
      const geometry = deriveUndergroundIsland2TrackGeometry(params(overrides), "TEST");
      const footprintYs = geometry.platforms[0]!.footprint!.map((p) => p.y);
      const trackA = geometry.trackCenterlines.find((t) => t.platformSide === "A")!.localPoints![0]!.y;
      const trackB = geometry.trackCenterlines.find((t) => t.platformSide === "B")!.localPoints![0]!.y;
      // The platform stays entirely between its own two tracks, never overlapping either.
      expect(Math.min(...footprintYs)).toBeGreaterThanOrEqual(trackA);
      expect(Math.max(...footprintYs)).toBeLessThanOrEqual(trackB);
    }
  });
});

describe("validateUndergroundIsland2TrackParameters — guard clauses (reject, never silently correct)", () => {
  it("rejects non-positive platform length", () => {
    expect(validateUndergroundIsland2TrackParameters(params({ platformLengthM: 0 })).some((i) => i.field === "platformLengthM")).toBe(true);
  });

  it("rejects non-positive platform width", () => {
    expect(validateUndergroundIsland2TrackParameters(params({ platformWidthM: -1 })).some((i) => i.field === "platformWidthM")).toBe(true);
  });

  it("rejects non-positive edge-to-track gap", () => {
    expect(validateUndergroundIsland2TrackParameters(params({ platformEdgeToTrackCenterM: 0 })).some((i) => i.field === "platformEdgeToTrackCenterM")).toBe(true);
  });

  it("rejects a mezzanine at or below the platform's own elevation", () => {
    const issues = validateUndergroundIsland2TrackParameters(params({ mezzanineElevationM: -10, platformElevationM: -10 }));
    expect(issues.some((i) => i.field === "mezzanineElevationM")).toBe(true);
  });

  it("accepts the shipped defaults with zero issues", () => {
    expect(validateUndergroundIsland2TrackParameters(DEFAULT_UG_ISLAND_2TRACK_PARAMETERS)).toEqual([]);
  });

  it("deriveUndergroundIsland2TrackGeometry throws with an explicit message rather than silently correcting invalid parameters", () => {
    expect(() => deriveUndergroundIsland2TrackGeometry(params({ platformLengthM: -5 }), "TEST")).toThrow(/platformLengthM/);
  });
});

describe("instantiateStationArchetype — UG_ISLAND_2TRACK dispatch", () => {
  it("produces a StationGeometryData-shaped object with the real station's own id/stationRef, config:'island', and platformSide set on both tracks", () => {
    const result = instantiateStationArchetype({
      archetypeId: UG_ISLAND_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "Y99", routeIds: ["Y"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      now: "2026-09-12T00:00:00.000Z",
    });
    expect(result.id).toBe("stationGeometry:Y99");
    expect(result.platforms).toHaveLength(1);
    expect(result.platforms[0]!.config).toBe("island");
    expect(result.trackCenterlines).toHaveLength(2);
    expect(result.trackCenterlines.map((t) => t.platformSide).sort()).toEqual(["A", "B"]);
    expect(result.platformLinks).toEqual([]);
    expect(result.entrances).toEqual([]);
    expect(result.evidenceConflicts).toEqual([]);
  });

  it("merges island-shaped overrides onto the island defaults without requiring every parameter to be re-specified", () => {
    const result = instantiateStationArchetype({
      archetypeId: UG_ISLAND_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "Y99", routeIds: ["Y"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      overrides: { platformLengthM: 200 },
      now: "2026-09-12T00:00:00.000Z",
    });
    const xs = result.platforms[0]!.footprint!.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200, 9);
  });

  it("is deterministic given the same inputs (including an explicit `now`)", () => {
    const input = {
      archetypeId: UG_ISLAND_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "Y99", routeIds: ["Y"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      now: "2026-09-12T00:00:00.000Z",
    };
    expect(instantiateStationArchetype(input)).toEqual(instantiateStationArchetype(input));
  });
});

describe("STATION-05/06 regression — island is fully additive, sibling archetypes and real seeds are untouched", () => {
  it("UG_SIDE_2TRACK still derives exactly 2 side platforms with no platformSide set, identical to before this checkpoint", () => {
    const geometry = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    expect(geometry.platforms).toHaveLength(2);
    for (const platform of geometry.platforms) expect(platform.config).toBe("side");
    for (const track of geometry.trackCenterlines) expect(track.platformSide).toBeUndefined();
  });

  it("UG_SIDE_2TRACK and UG_ISLAND_2TRACK are fully independent — deriving one never touches the other's output", () => {
    const before = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    deriveUndergroundIsland2TrackGeometry(DEFAULT_UG_ISLAND_2TRACK_PARAMETERS, "TEST");
    const after = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    expect(after).toEqual(before);
  });

  it("leaves Bay Ridge Av's real geometry completely untouched — the new platformSide/adjacentTrackId fields are simply absent on its real records, never defaulted to a value", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    for (const track of bayRidge.trackCenterlines) expect(track.platformSide).toBeUndefined();
    for (const wall of bayRidge.wallSurfaces) expect((wall as { adjacentTrackId?: string }).adjacentTrackId).toBeUndefined();
    expect(bayRidge.id).toBe("stationGeometry:R42");
  });

  it("rejects an unsupported archetypeId rather than silently falling back to any real archetype", () => {
    expect(() =>
      instantiateStationArchetype({
        archetypeId: makeStationArchetypeId("SOMETHING_ELSE"),
        stationRef: { gtfsStopId: "Y99", routeIds: ["Y"] },
        origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      }),
    ).toThrow(/unsupported archetypeId/);
  });
});
