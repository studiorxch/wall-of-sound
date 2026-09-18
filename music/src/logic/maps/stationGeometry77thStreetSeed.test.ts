import { describe, it, expect } from "vitest";
import {
  build77thStreetStationGeometrySeed,
  R43_DERIVED_ORIENTATION_DEG,
  R43_SOURCE_SHAPE_EXCERPT,
} from "./stationGeometry77thStreetSeed";
import { buildBayRidgeAvStationGeometrySeed } from "./stationGeometryBayRidgeAvSeed";
import { computeBearingDeg, makeStationOriginAnchor, toStationLocal } from "./stationGeometryCoordinates";

describe("77th Street (R43) identity and orientation — independently derived, not copied", () => {
  it("uses R43's own real GTFS coordinate, distinct from Bay Ridge Av's", () => {
    const seed = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    expect(seed.id).toBe("stationGeometry:R43");
    expect(seed.stationRef).toEqual({ gtfsStopId: "R43", routeIds: ["R"] });
    expect(seed.origin.longitude).toBeCloseTo(-74.02551, 9);
    expect(seed.origin.latitude).toBeCloseTo(40.629742, 9);
  });

  it("independently re-derives the same orientation value the seed exports, from R43's own real shape neighbors", () => {
    const [p0, , p2] = R43_SOURCE_SHAPE_EXCERPT.points;
    const independentlyComputed = computeBearingDeg(p0, p2);
    expect(R43_DERIVED_ORIENTATION_DEG).toBeCloseTo(independentlyComputed, 9);
  });

  it("is genuinely close to but NOT identical to Bay Ridge Av's own orientation constant (same line, real adjacent stations, never copied)", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    expect(R43_DERIVED_ORIENTATION_DEG).not.toBe(bayRidge.origin.orientationDeg);
    expect(Math.abs(R43_DERIVED_ORIENTATION_DEG - bayRidge.origin.orientationDeg)).toBeLessThan(0.5);
  });

  it("real distance to Bay Ridge Av is plausible for adjacent NYC subway stations (a few hundred meters, not zero, not kilometers)", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    const bayRidgeAnchor = makeStationOriginAnchor({
      longitude: bayRidge.origin.longitude,
      latitude: bayRidge.origin.latitude,
      altitudeM: 0,
      orientationDeg: bayRidge.origin.orientationDeg,
    });
    const r43Local = toStationLocal(bayRidgeAnchor, { longitude: -74.02551, latitude: 40.629742 });
    const distance = Math.hypot(r43Local.x, r43Local.y);
    expect(distance).toBeGreaterThan(400);
    expect(distance).toBeLessThan(900);
  });
});

describe("77th Street topology — real, reference-sourced, distinct from Bay Ridge Av's own facts", () => {
  const seed = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

  it("has two side platforms, two tracks, a mezzanine + platform level, and a south crossover — same shape as Bay Ridge Av, independently sourced", () => {
    expect(seed.platforms).toHaveLength(2);
    expect(seed.platforms.every((p) => p.config === "side")).toBe(true);
    expect(seed.trackCenterlines).toHaveLength(2);
    expect(seed.levels.map((l) => l.kind).sort()).toEqual(["mezzanine", "platform"]);
    expect(seed.platformLinks).toHaveLength(1);
    expect(seed.platformLinks[0].approximatePosition).toBe("south");
  });

  it("records the real north-end exit-only relationship on the southbound (Bay Ridge-bound) platform only", () => {
    const southbound = seed.platforms.find((p) => p.id.includes("southbound"))!;
    const northbound = seed.platforms.find((p) => p.id.includes("northbound"))!;
    expect(southbound.provenance.note).toMatch(/exit-only/i);
    expect(northbound.provenance.note).not.toMatch(/exit-only/i);
  });

  it("never fabricates a StationEntrance for the exit-only relationship — entrances stay out of scope, same as Bay Ridge Av", () => {
    expect(seed.entrances).toEqual([]);
  });

  it("does not carry Bay Ridge Av's own field-derived circulation-lane language — no field pass has been done for 77th St", () => {
    for (const connection of seed.connections) {
      expect(connection.provenance.note).not.toMatch(/circulation lane/i);
    }
  });

  it("records a real, newly-found platform-length discrepancy distinct from Bay Ridge Av's own width conflict", () => {
    expect(seed.evidenceConflicts).toHaveLength(1);
    const [conflict] = seed.evidenceConflicts;
    expect(conflict.affectedField).toMatch(/length/i);
    expect(conflict.status).toBe("unresolved");
    expect(conflict.conflictingEvidence).toHaveLength(2);
  });
});

describe("Provenance hierarchy — heuristic archetype replaced by reference geometry, nothing left silently heuristic", () => {
  const seed = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

  it("origin is authority-sourced (real GTFS coordinate + derived bearing), not the archetype's own heuristic default", () => {
    expect(seed.origin.provenance.source).toBe("authority");
  });

  it("every platform, track, level, and connection is reference-sourced — none left at the archetype's raw heuristic default", () => {
    const allProvenanced = [...seed.levels, ...seed.platforms, ...seed.trackCenterlines, ...seed.connections, ...seed.platformLinks];
    expect(allProvenanced.length).toBeGreaterThan(0);
    for (const record of allProvenanced) {
      expect(record.provenance.source).toBe("reference");
    }
  });

  it("does not carry forward any fabricated elevation number the archetype would have defaulted to", () => {
    for (const level of seed.levels) {
      expect(level.elevationM).toBeUndefined();
    }
  });

  it("real platform footprints and track centerlines are genuinely authored (not empty/undefined placeholders)", () => {
    for (const platform of seed.platforms) {
      expect(platform.footprint).toBeDefined();
      expect(platform.footprint!.length).toBeGreaterThan(0);
    }
    for (const track of seed.trackCenterlines) {
      expect(track.localPoints).toBeDefined();
      expect(track.localPoints!.length).toBeGreaterThan(0);
    }
  });

  it("is fully deterministic across repeated builds", () => {
    const a = build77thStreetStationGeometrySeed("2026-01-01T00:00:00.000Z");
    const b = build77thStreetStationGeometrySeed("2026-01-01T00:00:00.000Z");
    expect(a).toEqual(b);
  });
});

describe("Critical test — UG_SIDE_2TRACK bootstraps 77th Street without contaminating Bay Ridge Av", () => {
  it("77th Street's own real geometry is completely independent of Bay Ridge Av's — different coordinates, different footprints, different ids", () => {
    const r43 = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-09T00:00:00.000Z");

    expect(r43.id).not.toBe(bayRidge.id);
    expect(r43.platforms[0].id).not.toBe(bayRidge.platforms[0].id);
    expect(r43.platforms[0].footprint).not.toEqual(bayRidge.platforms[0].footprint);
    expect(r43.trackCenterlines[0].localPoints).not.toEqual(bayRidge.trackCenterlines[0].localPoints);
  });

  it("building 77th Street in the same process leaves Bay Ridge Av's own canonical seed byte-identical", () => {
    const before = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z"); // exercise the archetype bootstrap in the same process
    const after = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    expect(after).toEqual(before);
  });

  it("Bay Ridge Av's own real evidence-conflict history is unaffected — still resolved on direction, still 4 accumulated entries", () => {
    build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    expect(bayRidge.evidenceConflicts[0].status).toBe("resolved");
    expect(bayRidge.evidenceConflicts[0].conflictingEvidence).toHaveLength(4);
  });

  it("both stations independently allow station-specific deviations — 77th St's real exit-only relationship does not appear anywhere in Bay Ridge Av's data, and Bay Ridge Av's real circulation-lane notes do not appear anywhere in 77th St's data", () => {
    const r43 = build77thStreetStationGeometrySeed();
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    const bayRidgeText = JSON.stringify(bayRidge);
    const r43Text = JSON.stringify(r43);
    expect(bayRidgeText).not.toMatch(/exit-only/i);
    expect(r43Text).not.toMatch(/circulation lane/i);
  });
});
