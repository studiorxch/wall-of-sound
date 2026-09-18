import { describe, it, expect } from "vitest";
import {
  build53rdStreetStationGeometrySeed,
  R40_DERIVED_ORIENTATION_DEG,
  R40_SOURCE_SHAPE_EXCERPT,
} from "./stationGeometry53rdStreetSeed";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import { build77thStreetStationGeometrySeed } from "./stationGeometry77thStreetSeed";
import {
  deriveUndergroundSide4TrackGeometry,
  isPlatformServingRole,
} from "./stationArchetypeUndergroundSide4Track";
import { DEFAULT_UG_SIDE_4TRACK_PARAMETERS } from "../../data/stationArchetypeTypes";
import { computeBearingDeg } from "./stationGeometryCoordinates";

describe("53rd Street (R40) identity and orientation — independently derived, not copied", () => {
  it("uses R40's own real GTFS coordinate, distinct from Bay Ridge Av's and 77th Street's", () => {
    const seed = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    expect(seed.id).toBe("stationGeometry:R40");
    expect(seed.stationRef).toEqual({ gtfsStopId: "R40", routeIds: ["R"] });
    expect(seed.origin.longitude).toBeCloseTo(-74.014034, 9);
    expect(seed.origin.latitude).toBeCloseTo(40.645069, 9);
  });

  it("independently re-derives the same orientation value the seed exports, from R40's own real shape neighbors", () => {
    const [p0, , p2] = R40_SOURCE_SHAPE_EXCERPT.points;
    const independentlyComputed = computeBearingDeg(p0, p2);
    expect(R40_DERIVED_ORIENTATION_DEG).toBeCloseTo(independentlyComputed, 9);
  });

  it("is meaningfully different from both Bay Ridge Av's and 77th Street's own orientation constants — this segment of the line really does curve", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    const r43 = build77thStreetStationGeometrySeed();
    expect(Math.abs(R40_DERIVED_ORIENTATION_DEG - bayRidge.origin.orientationDeg)).toBeGreaterThan(15);
    expect(Math.abs(R40_DERIVED_ORIENTATION_DEG - r43.origin.orientationDeg)).toBeGreaterThan(15);
  });
});

describe("53rd Street — exactly 4 physical tracks with explicit, correctly-assigned roles", () => {
  const seed = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

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

  it("local tracks carry higher provenance confidence than express tracks — a real, honest limitation of the OSM data near this station", () => {
    const byRole = Object.fromEntries(seed.trackCenterlines.map((t) => [t.role, t]));
    expect(byRole.northboundLocal.provenance.confidence!).toBeGreaterThan(byRole.northboundExpress.provenance.confidence!);
    expect(byRole.southboundLocal.provenance.confidence!).toBeGreaterThan(byRole.southboundExpress.provenance.confidence!);
    expect(byRole.northboundExpress.provenance.note).toMatch(/extrapolat/i);
  });

  it("isPlatformServingRole from the archetype module correctly classifies every real track role on this real station", () => {
    for (const track of seed.trackCenterlines) {
      const shouldServe = track.role === "northboundLocal" || track.role === "southboundLocal";
      expect(isPlatformServingRole(track.role!)).toBe(shouldServe);
      expect(track.platformId !== null).toBe(shouldServe);
    }
  });
});

describe("53rd Street topology and evidence discipline", () => {
  const seed = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

  it("records the real north-end exit-only relationship on the southbound platform only", () => {
    const southbound = seed.platforms.find((p) => p.id.includes("southbound"))!;
    const northbound = seed.platforms.find((p) => p.id.includes("northbound"))!;
    expect(southbound.provenance.note).toMatch(/exit-only/i);
    expect(northbound.provenance.note).not.toMatch(/exit-only/i);
  });

  it("records the real track-count discrepancy this checkpoint's own research found, left unresolved rather than silently decided", () => {
    expect(seed.evidenceConflicts).toHaveLength(1);
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.affectedField).toMatch(/track/i);
    expect(conflict.status).toBe("unresolved");
    expect(conflict.conflictingEvidence).toHaveLength(3);
  });

  it("never fabricates a StationEntrance — entrances stay out of scope, same as every other station in this arc", () => {
    expect(seed.entrances).toEqual([]);
  });

  it("does not carry forward the archetype's own fabricated elevation numbers", () => {
    for (const level of seed.levels) {
      expect(level.elevationM).toBeUndefined();
    }
  });

  it("is fully deterministic across repeated builds", () => {
    const a = build53rdStreetStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = build53rdStreetStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a).toEqual(b);
  });
});

describe("Critical test — UG_SIDE_4TRACK bootstraps 53rd Street without contaminating anything else", () => {
  it("53rd Street's own real geometry is completely independent of Bay Ridge Av's and 77th Street's", () => {
    const r40 = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const r43 = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

    expect(r40.id).not.toBe(bayRidge.id);
    expect(r40.id).not.toBe(r43.id);
    expect(r40.platforms[0].footprint).not.toEqual(bayRidge.platforms[0].footprint);
    expect(r40.platforms[0].footprint).not.toEqual(r43.platforms[0].footprint);
  });

  it("building 53rd Street in the same process leaves Bay Ridge Av and 77th Street byte-identical", () => {
    const bayRidgeBefore = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    const r43Before = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z"); // exercise the 4-track bootstrap in the same process
    expect(buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z")).toEqual(bayRidgeBefore);
    expect(build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z")).toEqual(r43Before);
  });

  it("leaves the UG_SIDE_4TRACK archetype's own pure derivation completely unmodified — same defaults, same output, same role ordering", () => {
    const before = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z"); // exercise the real bootstrap
    const after = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    expect(after).toEqual(before);
  });

  it("neither other station's own unique vocabulary leaks into 53rd Street's data, nor does 53rd Street's leak into theirs", () => {
    const r40 = build53rdStreetStationGeometrySeed();
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    const r43 = build77thStreetStationGeometrySeed();
    expect(JSON.stringify(bayRidge)).not.toMatch(/track_ref=4|northboundExpress/);
    expect(JSON.stringify(r43)).not.toMatch(/track_ref=4|northboundExpress/);
    expect(JSON.stringify(r40)).not.toMatch(/circulation lane/i);
  });
});
