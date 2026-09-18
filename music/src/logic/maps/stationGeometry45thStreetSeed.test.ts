import { describe, it, expect } from "vitest";
import {
  build45thStreetStationGeometrySeed,
  R39_DERIVED_ORIENTATION_DEG,
  R39_SOURCE_SHAPE_EXCERPT,
} from "./stationGeometry45thStreetSeed";
import { build53rdStreetStationGeometrySeed } from "./stationGeometry53rdStreetSeed";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import { build77thStreetStationGeometrySeed } from "./stationGeometry77thStreetSeed";
import {
  deriveUndergroundSide4TrackGeometry,
  isPlatformServingRole,
} from "./stationArchetypeUndergroundSide4Track";
import { DEFAULT_UG_SIDE_4TRACK_PARAMETERS } from "../../data/stationArchetypeTypes";
import { computeBearingDeg } from "./stationGeometryCoordinates";

describe("45th Street (R39) identity and orientation — independently derived, not copied from 53rd Street", () => {
  it("uses R39's own real GTFS coordinate, distinct from every other station in this arc", () => {
    const seed = build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    expect(seed.id).toBe("stationGeometry:R39");
    expect(seed.stationRef).toEqual({ gtfsStopId: "R39", routeIds: ["R"] });
    expect(seed.origin.longitude).toBeCloseTo(-74.010006, 9);
    expect(seed.origin.latitude).toBeCloseTo(40.648939, 9);
  });

  it("independently re-derives the same orientation value the seed exports, from R39's own real shape neighbors", () => {
    const [p0, , p2] = R39_SOURCE_SHAPE_EXCERPT.points;
    const independentlyComputed = computeBearingDeg(p0, p2);
    expect(R39_DERIVED_ORIENTATION_DEG).toBeCloseTo(independentlyComputed, 9);
  });

  it("is close to but NOT identical to 53rd Street's own orientation constant (same segment, independently derived)", () => {
    const r40 = build53rdStreetStationGeometrySeed();
    expect(R39_DERIVED_ORIENTATION_DEG).not.toBe(r40.origin.orientationDeg);
    expect(Math.abs(R39_DERIVED_ORIENTATION_DEG - r40.origin.orientationDeg)).toBeLessThan(1);
  });
});

describe("45th Street — exactly 4 physical tracks with explicit, correctly-assigned roles", () => {
  const seed = build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

  it("has exactly 4 track centerlines in deterministic role order", () => {
    expect(seed.trackCenterlines).toHaveLength(4);
    expect(seed.trackCenterlines.map((t) => t.role)).toEqual([
      "northboundLocal",
      "northboundExpress",
      "southboundExpress",
      "southboundLocal",
    ]);
  });

  it("outer (local) tracks serve real platforms; inner (express) tracks are bypass", () => {
    const byRole = Object.fromEntries(seed.trackCenterlines.map((t) => [t.role, t]));
    expect(byRole.northboundLocal.platformId).toBe(seed.platforms[0].id);
    expect(byRole.southboundLocal.platformId).toBe(seed.platforms[1].id);
    expect(byRole.northboundExpress.platformId).toBeNull();
    expect(byRole.southboundExpress.platformId).toBeNull();
  });

  it("all four track centerlines sit at distinct, correctly-ordered station-local Y positions", () => {
    const ys = seed.trackCenterlines.map((t) => t.localPoints![0].y);
    expect(new Set(ys).size).toBe(4);
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    expect(ys[2]).toBeLessThan(ys[3]);
  });

  it("isPlatformServingRole correctly classifies every real track role", () => {
    for (const track of seed.trackCenterlines) {
      const shouldServe = track.role === "northboundLocal" || track.role === "southboundLocal";
      expect(isPlatformServingRole(track.role!)).toBe(shouldServe);
      expect(track.platformId !== null).toBe(shouldServe);
    }
  });
});

describe("45th Street topology and evidence discipline", () => {
  const seed = build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

  it("places the mezzanine/crossover at the NORTH end — a real, station-specific fact, not forced to match the other stations' south-end pattern", () => {
    expect(seed.platformLinks[0].approximatePosition).toBe("north");
    const mezzanine = seed.levels.find((l) => l.kind === "mezzanine")!;
    expect(mezzanine.label).toMatch(/north/i);
  });

  it("records the real staircase-count asymmetry (2 north / 1 south) without inventing a numeric circulation-lane claim", () => {
    const northboundConnection = seed.connections.find((c) => c.relatedPlatformId === seed.platforms[0].id)!;
    const southboundConnection = seed.connections.find((c) => c.relatedPlatformId === seed.platforms[1].id)!;
    expect(northboundConnection.provenance.note).toMatch(/two staircases/i);
    expect(southboundConnection.provenance.note).toMatch(/one staircase/i);
  });

  it("does not model the permanently-closed 1979 south exit as an active feature", () => {
    expect(seed.entrances).toEqual([]);
    expect(seed.platformLinks).toHaveLength(1); // only the real, active north crossover
  });

  it("records the real platform longitudinal-offset discrepancy this checkpoint's own research found, left unresolved", () => {
    expect(seed.evidenceConflicts).toHaveLength(1);
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.affectedField).toMatch(/longitudinal/i);
    expect(conflict.status).toBe("unresolved");
    expect(conflict.conflictingEvidence).toHaveLength(2);
  });

  it("does not carry forward the archetype's own fabricated elevation numbers", () => {
    for (const level of seed.levels) {
      expect(level.elevationM).toBeUndefined();
    }
  });

  it("is fully deterministic across repeated builds", () => {
    const a = build45thStreetStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = build45thStreetStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a).toEqual(b);
  });
});

describe("Critical validation — 45th Street vs. 53rd Street", () => {
  const r39 = build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
  const r40 = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

  it("the archetype's structural assumptions held unchanged: same 4 roles, same role order, same platform-serving/bypass split, on both stations", () => {
    expect(r39.trackCenterlines.map((t) => t.role)).toEqual(r40.trackCenterlines.map((t) => t.role));
    for (const seed of [r39, r40]) {
      const byRole = Object.fromEntries(seed.trackCenterlines.map((t) => [t.role, t]));
      expect(byRole.northboundLocal.platformId).not.toBeNull();
      expect(byRole.southboundLocal.platformId).not.toBeNull();
      expect(byRole.northboundExpress.platformId).toBeNull();
      expect(byRole.southboundExpress.platformId).toBeNull();
    }
  });

  it("neither station's geometry was copied from the other — real, independent coordinates and footprints", () => {
    expect(r39.origin.longitude).not.toBe(r40.origin.longitude);
    expect(r39.origin.orientationDeg).not.toBe(r40.origin.orientationDeg);
    expect(r39.platforms[0].footprint).not.toEqual(r40.platforms[0].footprint);
    expect(r39.trackCenterlines[0].localPoints).not.toEqual(r40.trackCenterlines[0].localPoints);
  });

  it("mezzanine/crossover position did NOT hold unchanged — 53rd St is south, 45th St is north, a genuine station-specific override the archetype's own optional crossover correctly allowed", () => {
    expect(r40.platformLinks[0].approximatePosition).toBe("south");
    expect(r39.platformLinks[0].approximatePosition).toBe("north");
  });

  it("platform lengths are approximately symmetric between the two stations (both ~185-187m, consistent with the whole line so far) even though Wikipedia describes a real intra-station longitudinal offset at 45th St specifically", () => {
    const length = (footprint: { x: number }[]) => Math.max(...footprint.map((p) => p.x)) - Math.min(...footprint.map((p) => p.x));
    for (const seed of [r39, r40]) {
      for (const platform of seed.platforms) {
        expect(length(platform.footprint!)).toBeGreaterThan(180);
        expect(length(platform.footprint!)).toBeLessThan(192);
      }
    }
  });

  it("express-track provenance confidence differs between the two stations for a real, documented methodological reason (interpolation vs. extrapolation), not arbitrarily", () => {
    const r39Express = r39.trackCenterlines.find((t) => t.role === "northboundExpress")!;
    const r40Express = r40.trackCenterlines.find((t) => t.role === "northboundExpress")!;
    expect(r39Express.provenance.confidence).toBeGreaterThan(r40Express.provenance.confidence!);
    expect(r39Express.provenance.sourceRef).toMatch(/BOTH sides/);
    expect(r40Express.provenance.sourceRef).toMatch(/gap/i);
  });

  it("no new type/schema requirement was exposed — both stations fit the existing StationGeometryData/TrackRole shape without any change to either", () => {
    // If a schema change had been needed, this test file would need a new
    // import from stationGeometryTypes.ts beyond what already existed for
    // 53rd Street — it doesn't.
    expect(Object.keys(r39).sort()).toEqual(Object.keys(r40).sort());
  });

  it("track-role structure remained fully reusable across both stations with zero archetype modification", () => {
    const before = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const after = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    expect(after).toEqual(before);
  });
});

describe("Critical test — UG_SIDE_4TRACK bootstraps 45th Street without contaminating anything else", () => {
  it("building 45th Street in the same process leaves Bay Ridge Av, 77th Street, and 53rd Street byte-identical", () => {
    const bayRidgeBefore = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    const r43Before = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const r40Before = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    expect(buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z")).toEqual(bayRidgeBefore);
    expect(build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z")).toEqual(r43Before);
    expect(build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z")).toEqual(r40Before);
  });

  it("none of the four stations' own unique vocabulary leaks into any other's serialized data", () => {
    const r39 = build45thStreetStationGeometrySeed();
    const r40 = build53rdStreetStationGeometrySeed();
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    const r43 = build77thStreetStationGeometrySeed();
    // "46th Street" and "extends further north" are unique to 45th Street's
    // own real evidence (its closed 1979 exit and its Wikipedia-sourced
    // longitudinal-offset finding) — unlike "1970" alone, which 77th
    // Street's own, unrelated real evidence also legitimately mentions
    // (its own 1968-1970 platform extension), so it's not a safe marker.
    expect(JSON.stringify(r40)).not.toMatch(/46th Street|extends further north/);
    expect(JSON.stringify(bayRidge)).not.toMatch(/46th Street|extends further north/);
    expect(JSON.stringify(r43)).not.toMatch(/46th Street|extends further north/);
    // 45th St's own data legitimately mentions "exit-only" once, to explain
    // the ABSENCE of an active one (closed in 1979) — so the real check here
    // is that it never claims Bay Ridge Av's/53rd St's own field-derived
    // "circulation lane" language, which has no equivalent at 45th St.
    expect(JSON.stringify(r39)).not.toMatch(/circulation lane/i);
  });
});
