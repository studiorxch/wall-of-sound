import { describe, it, expect } from "vitest";
import {
  deriveUndergroundSide2TrackGeometry,
  validateUndergroundSide2TrackParameters,
  validateTrainConsistClearance,
  getUsablePlatformLengthM,
} from "./stationArchetypeUndergroundSide2Track";
import { instantiateStationArchetype } from "./stationArchetypeInstantiate";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import {
  DEFAULT_UG_SIDE_2TRACK_PARAMETERS,
  UG_SIDE_2TRACK_ARCHETYPE_ID,
  makeStationArchetypeId,
  type UndergroundSide2TrackParameters,
} from "../../data/stationArchetypeTypes";

function params(overrides: Partial<UndergroundSide2TrackParameters> = {}): UndergroundSide2TrackParameters {
  return { ...DEFAULT_UG_SIDE_2TRACK_PARAMETERS, ...overrides };
}

// 1. deterministic archetype identity
describe("archetype identity", () => {
  it("is deterministic and never a random id", () => {
    expect(UG_SIDE_2TRACK_ARCHETYPE_ID).toBe("stationArchetype:UG_SIDE_2TRACK");
    expect(makeStationArchetypeId("UG_SIDE_2TRACK")).toBe(UG_SIDE_2TRACK_ARCHETYPE_ID);
    expect(makeStationArchetypeId("UG_SIDE_2TRACK")).toBe(makeStationArchetypeId("UG_SIDE_2TRACK"));
  });
});

describe("deriveUndergroundSide2TrackGeometry — structure", () => {
  const geometry = deriveUndergroundSide2TrackGeometry(params(), "TEST");

  // 2. generated levels are surface/mezzanine/platform
  it("generates exactly the three levels surface/mezzanine/platform", () => {
    expect(geometry.levels.map((l) => l.kind).sort()).toEqual(["mezzanine", "platform", "surface"]);
  });

  // 3. exactly two side platforms
  it("generates exactly two side platforms", () => {
    expect(geometry.platforms).toHaveLength(2);
    for (const platform of geometry.platforms) {
      expect(platform.config).toBe("side");
      expect(platform.footprint).toBeDefined();
      expect(platform.footprint).toHaveLength(4);
    }
  });

  // 4. exactly two physical track centerlines
  it("generates exactly two physical track centerlines with real localPoints and no GTFS reference", () => {
    expect(geometry.trackCenterlines).toHaveLength(2);
    for (const track of geometry.trackCenterlines) {
      expect(track.localPoints).toBeDefined();
      expect(track.localPoints!.length).toBeGreaterThan(0);
      expect(track.gtfsShapeRef).toBeUndefined(); // generic archetype instance, not tied to any real route
    }
  });

  it("generates exactly two stair connections, one per platform side, no duplicate ids", () => {
    expect(geometry.connections).toHaveLength(2);
    const ids = geometry.connections.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate connection ids
    const relatedPlatformIds = geometry.connections.map((c) => c.relatedPlatformId).sort();
    const platformIds = geometry.platforms.map((p) => p.id).sort();
    expect(relatedPlatformIds).toEqual(platformIds);
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

// 5. independent northbound/southbound track offsets
describe("track offsets", () => {
  it("keeps the two tracks at independent, distinctly-offset Y positions separated by exactly trackCenterSpacingM", () => {
    const geometry = deriveUndergroundSide2TrackGeometry(params({ trackCenterSpacingM: 4 }), "TEST");
    const [northboundTrack, southboundTrack] = geometry.trackCenterlines;
    const northboundY = northboundTrack.localPoints![0].y;
    const southboundY = southboundTrack.localPoints![0].y;
    expect(southboundY - northboundY).toBeCloseTo(4, 9);
  });
});

// 6. parameter edits change generated geometry predictably
describe("parametric predictability", () => {
  it("doubling platformLengthM exactly doubles the platform's X-extent", () => {
    const base = deriveUndergroundSide2TrackGeometry(params({ platformLengthM: 100 }), "TEST");
    const doubled = deriveUndergroundSide2TrackGeometry(params({ platformLengthM: 200 }), "TEST");
    const xExtent = (pts: { x: number }[]) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
    expect(xExtent(doubled.platforms[0].footprint!)).toBeCloseTo(2 * xExtent(base.platforms[0].footprint!), 9);
  });

  it("changing trackCenterSpacingM changes the track Y-gap by exactly the delta, independent of other parameters", () => {
    const a = deriveUndergroundSide2TrackGeometry(params({ trackCenterSpacingM: 4 }), "TEST");
    const b = deriveUndergroundSide2TrackGeometry(params({ trackCenterSpacingM: 6 }), "TEST");
    const gap = (g: typeof a) => g.trackCenterlines[1].localPoints![0].y - g.trackCenterlines[0].localPoints![0].y;
    expect(gap(b) - gap(a)).toBeCloseTo(2, 9);
  });

  it("increasing a platform's own width extends only that platform's outer edge, not its inner edge or the other platform", () => {
    const narrow = deriveUndergroundSide2TrackGeometry(params({ northboundPlatformWidthM: 4 }), "TEST");
    const wide = deriveUndergroundSide2TrackGeometry(params({ northboundPlatformWidthM: 8 }), "TEST");
    const innerEdge = (g: typeof narrow) => g.platforms[0].footprint![0].y; // first corner = inner edge
    const outerEdge = (g: typeof narrow) => g.platforms[0].footprint![2].y; // third corner = outer edge
    expect(innerEdge(wide)).toBeCloseTo(innerEdge(narrow), 9); // inner edge unmoved
    expect(Math.abs(outerEdge(wide) - innerEdge(wide))).toBeCloseTo(8, 9);
    // The southbound platform is completely unaffected by a northbound-only change.
    expect(wide.platforms[1].footprint).toEqual(narrow.platforms[1].footprint);
  });
});

// 7. generated geometry uses station-local meters
describe("station-local meter geometry", () => {
  it("produces a platform footprint bounding box matching the parameters exactly, in plain meters", () => {
    const geometry = deriveUndergroundSide2TrackGeometry(
      params({ platformLengthM: 120, northboundPlatformWidthM: 5, trackCenterSpacingM: 4, platformEdgeToTrackCenterM: 1.5 }),
      "TEST",
    );
    const footprint = geometry.platforms[0].footprint!;
    const xs = footprint.map((p) => p.x);
    const ys = footprint.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(120, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5, 9);
    // Inner edge sits exactly platformEdgeToTrackCenterM beyond the track centerline.
    const trackY = geometry.trackCenterlines[0].localPoints![0].y;
    const innerEdgeY = Math.max(...ys); // northbound platform's inner edge is its less-negative (max) y
    expect(Math.abs(innerEdgeY - trackY)).toBeCloseTo(1.5, 9);
  });
});

// 8 & 9. all default geometry carries heuristic provenance, never authority/reference/authored
describe("provenance discipline", () => {
  const geometry = deriveUndergroundSide2TrackGeometry(params(), "TEST");

  it("marks every generated level/platform/track/connection as heuristic — never authority, reference, or authored", () => {
    const allProvenanced = [
      ...geometry.levels,
      ...geometry.platforms,
      ...geometry.trackCenterlines,
      ...geometry.connections,
    ];
    expect(allProvenanced.length).toBeGreaterThan(0);
    for (const record of allProvenanced) {
      expect(record.provenance.source).toBe("heuristic");
    }
  });

  it("cites the archetype itself as the source, not a real station", () => {
    for (const platform of geometry.platforms) {
      expect(platform.provenance.sourceRef).toMatch(/stationArchetype:UG_SIDE_2TRACK/);
    }
  });
});

// 10. usable platform length can be validated against a supplied train-consist length
describe("validateTrainConsistClearance", () => {
  it("passes when the platform is long enough for the consist plus margin", () => {
    const result = validateTrainConsistClearance({ usablePlatformLengthM: 150, trainConsistLengthM: 120, stoppingMarginM: 10 });
    expect(result.ok).toBe(true);
    expect(result.requiredLengthM).toBe(130);
    expect(result.marginRemainingM).toBeCloseTo(20, 9);
  });

  it("fails (without throwing) when the platform is too short", () => {
    const result = validateTrainConsistClearance({ usablePlatformLengthM: 100, trainConsistLengthM: 120, stoppingMarginM: 10 });
    expect(result.ok).toBe(false);
    expect(result.marginRemainingM).toBeLessThan(0);
  });

  it("rejects a negative stopping margin explicitly, rather than silently treating it as zero", () => {
    const result = validateTrainConsistClearance({ usablePlatformLengthM: 150, trainConsistLengthM: 120, stoppingMarginM: -5 });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain("stoppingMarginM must not be negative");
  });

  it("rejects non-positive platform/consist lengths explicitly", () => {
    expect(validateTrainConsistClearance({ usablePlatformLengthM: 0, trainConsistLengthM: 100, stoppingMarginM: 0 }).ok).toBe(false);
    expect(validateTrainConsistClearance({ usablePlatformLengthM: 100, trainConsistLengthM: 0, stoppingMarginM: 0 }).ok).toBe(false);
  });

  it("getUsablePlatformLengthM reads directly from the platform length parameter (V0-simplistic, documented as such)", () => {
    expect(getUsablePlatformLengthM(params({ platformLengthM: 137 }))).toBe(137);
  });
});

// 11. simultaneous two-track geometry does not overlap by construction under valid parameters
describe("non-overlap under valid parameters", () => {
  it("never lets the two platforms or the two tracks collide, across a range of valid parameter combinations", () => {
    const combos: Partial<UndergroundSide2TrackParameters>[] = [
      {},
      { trackCenterSpacingM: 3, platformEdgeToTrackCenterM: 1, northboundPlatformWidthM: 3, southboundPlatformWidthM: 3 },
      { trackCenterSpacingM: 10, platformEdgeToTrackCenterM: 2.5, northboundPlatformWidthM: 6, southboundPlatformWidthM: 8 },
    ];
    for (const overrides of combos) {
      const geometry = deriveUndergroundSide2TrackGeometry(params(overrides), "TEST");
      const northboundTrackY = geometry.trackCenterlines[0].localPoints![0].y;
      const southboundTrackY = geometry.trackCenterlines[1].localPoints![0].y;
      expect(northboundTrackY).toBeLessThan(southboundTrackY); // tracks never collapse onto one centerline

      const northboundYs = geometry.platforms[0].footprint!.map((p) => p.y);
      const southboundYs = geometry.platforms[1].footprint!.map((p) => p.y);
      // Northbound platform stays entirely on the negative side of its own track;
      // southbound stays entirely on the positive side of its own track — so the
      // two platforms can never overlap each other or either track.
      expect(Math.max(...northboundYs)).toBeLessThanOrEqual(northboundTrackY);
      expect(Math.min(...southboundYs)).toBeGreaterThanOrEqual(southboundTrackY);
    }
  });
});

describe("validateUndergroundSide2TrackParameters — guard clauses (reject, never silently correct)", () => {
  it("rejects non-positive platform length", () => {
    const issues = validateUndergroundSide2TrackParameters(params({ platformLengthM: 0 }));
    expect(issues.some((i) => i.field === "platformLengthM")).toBe(true);
  });

  it("rejects non-positive platform widths", () => {
    expect(validateUndergroundSide2TrackParameters(params({ northboundPlatformWidthM: -1 })).some((i) => i.field === "northboundPlatformWidthM")).toBe(true);
    expect(validateUndergroundSide2TrackParameters(params({ southboundPlatformWidthM: 0 })).some((i) => i.field === "southboundPlatformWidthM")).toBe(true);
  });

  it("rejects non-positive track spacing (which would otherwise collapse both centerlines)", () => {
    expect(validateUndergroundSide2TrackParameters(params({ trackCenterSpacingM: 0 })).some((i) => i.field === "trackCenterSpacingM")).toBe(true);
  });

  it("rejects a mezzanine at or below the platform's own elevation", () => {
    const issues = validateUndergroundSide2TrackParameters(params({ mezzanineElevationM: -10, platformElevationM: -10 }));
    expect(issues.some((i) => i.field === "mezzanineElevationM")).toBe(true);
    const issuesBelow = validateUndergroundSide2TrackParameters(params({ mezzanineElevationM: -12, platformElevationM: -10 }));
    expect(issuesBelow.some((i) => i.field === "mezzanineElevationM")).toBe(true);
  });

  it("accepts the shipped defaults with zero issues", () => {
    expect(validateUndergroundSide2TrackParameters(DEFAULT_UG_SIDE_2TRACK_PARAMETERS)).toEqual([]);
  });

  it("deriveUndergroundSide2TrackGeometry throws with an explicit message rather than silently correcting invalid parameters", () => {
    expect(() => deriveUndergroundSide2TrackGeometry(params({ platformLengthM: -5 }), "TEST")).toThrow(/platformLengthM/);
  });
});

describe("instantiateStationArchetype", () => {
  it("produces a StationGeometryData-shaped object with the real station's own id/stationRef, no mandatory crossover, and empty entrances", () => {
    const result = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "X99", routeIds: ["X"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      now: "2026-09-09T00:00:00.000Z",
    });
    expect(result.id).toBe("stationGeometry:X99");
    expect(result.stationRef).toEqual({ gtfsStopId: "X99", routeIds: ["X"] });
    expect(result.origin.orientationDeg).toBe(30);
    expect(result.origin.provenance.source).toBe("heuristic"); // no real origin provenance supplied
    expect(result.platformLinks).toEqual([]); // crossover is NOT mandatory
    expect(result.entrances).toEqual([]);
    expect(result.evidenceConflicts).toEqual([]);
  });

  it("merges overrides onto the defaults without requiring every parameter to be re-specified", () => {
    const result = instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "X99", routeIds: ["X"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      overrides: { platformLengthM: 200 },
      now: "2026-09-09T00:00:00.000Z",
    });
    const xs = result.platforms[0].footprint!.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(200, 9);
  });

  it("rejects an unsupported archetypeId rather than silently falling back to UG_SIDE_2TRACK", () => {
    expect(() =>
      instantiateStationArchetype({
        archetypeId: makeStationArchetypeId("SOMETHING_ELSE"),
        stationRef: { gtfsStopId: "X99", routeIds: ["X"] },
        origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      }),
    ).toThrow(/unsupported archetypeId/);
  });

  it("is deterministic given the same inputs (including an explicit `now`)", () => {
    const input = {
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "X99", routeIds: ["X"] },
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      now: "2026-09-09T00:00:00.000Z",
    };
    expect(instantiateStationArchetype(input)).toEqual(instantiateStationArchetype(input));
  });
});

// 12. Bay Ridge canonical seed remains byte-equivalent / semantically unchanged
describe("Bay Ridge Av regression — the archetype must never contaminate the canonical seed", () => {
  it("leaves Bay Ridge Av's real geometry, topology, circulation notes, and evidence-conflict history completely untouched, even with the archetype modules loaded in the same process", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");

    // Real, OSM-sourced footprints — never overwritten by archetype defaults.
    expect(bayRidge.platforms[0].provenance.sourceRef).toMatch(/OSM way/);
    expect(bayRidge.platforms[0].provenance.source).toBe("reference"); // NOT "heuristic"
    expect(bayRidge.trackCenterlines[0].provenance.sourceRef).toMatch(/OSM way/);

    // Side-specific circulation notes from the Circulation/Topology Observation Pass.
    const northboundConnection = bayRidge.connections.find((c) => c.relatedPlatformId === bayRidge.platforms[0].id)!;
    const southboundConnection = bayRidge.connections.find((c) => c.relatedPlatformId === bayRidge.platforms[1].id)!;
    expect(northboundConnection.provenance.note).toMatch(/preserving two circulation lanes/);
    expect(southboundConnection.provenance.note).toMatch(/one main circulation lane/);
    expect(bayRidge.platforms[1].provenance.note).toMatch(/rear-exit relationship/);

    // Evidence-conflict history — resolved on direction, 4 accumulated entries, never erased.
    expect(bayRidge.evidenceConflicts).toHaveLength(1);
    expect(bayRidge.evidenceConflicts[0].status).toBe("resolved");
    expect(bayRidge.evidenceConflicts[0].conflictingEvidence).toHaveLength(4);

    // Bay Ridge's own real id must never collide with anything the archetype generates.
    expect(bayRidge.id).toBe("stationGeometry:R42");
  });

  it("is unaffected by instantiating an unrelated archetype station in the same test run", () => {
    const before = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    instantiateStationArchetype({
      archetypeId: UG_SIDE_2TRACK_ARCHETYPE_ID,
      stationRef: { gtfsStopId: "R42", routeIds: ["R"] }, // deliberately reuses Bay Ridge's own real gtfsStopId
      origin: { longitude: -74, latitude: 40.7, orientationDeg: 30 },
      now: "2026-09-09T00:00:00.000Z",
    });
    const after = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    expect(after).toEqual(before); // pure functions, no shared mutable state — instantiating a same-id archetype elsewhere cannot mutate the canonical seed
  });
});
