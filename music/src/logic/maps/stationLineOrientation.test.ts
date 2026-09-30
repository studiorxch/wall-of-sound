import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveStationLineOrientation } from "./stationLineOrientation";

// A tiny, fully synthetic 4-station straight line running due east along
// lat 40.70 -- easy to reason about by hand. Station lat/lon sit exactly
// ON the shape (perpendicular distance 0) so ordering is unambiguous.
const STRAIGHT_LINE_SHAPE: readonly [number, number][] = [
  [40.7, -74.0],
  [40.7, -73.99],
  [40.7, -73.98],
  [40.7, -73.97],
];

function snapshotWith(overrides: { complexes?: unknown[]; routes?: unknown[]; shapes?: Record<string, unknown> } = {}) {
  return {
    complexes: overrides.complexes ?? [
      { stopName: "West End", borough: "Bk", routes: ["Q"], lat: 40.7, lon: -74.0, gtfsStopIds: ["Q01"] },
      { stopName: "Mid Station", borough: "Bk", routes: ["Q"], lat: 40.7, lon: -73.99, gtfsStopIds: ["Q02"] },
      { stopName: "Central", borough: "Bk", routes: ["Q"], lat: 40.7, lon: -73.98, gtfsStopIds: ["Q03"] },
      { stopName: "East End", borough: "Bk", routes: ["Q"], lat: 40.7, lon: -73.97, gtfsStopIds: ["Q04"] },
    ],
    routes: overrides.routes ?? [{ routeId: "Q", shapeIds: ["Q..S1"] }],
    shapes: overrides.shapes ?? { "Q..S1": STRAIGHT_LINE_SHAPE },
  };
}

describe("resolveStationLineOrientation -- STATION-03", () => {
  it("orders a straight synthetic line correctly and finds both neighbors for a middle station", () => {
    const result = resolveStationLineOrientation(snapshotWith(), "Q", "Q02");
    expect(result).toEqual({
      routeId: "Q",
      currentName: "Mid Station",
      previous: { name: "West End", gtfsStopId: "Q01" },
      next: { name: "Central", gtfsStopId: "Q03" },
    });
  });

  it("returns null previous for the first station on the line -- never a fabricated neighbor", () => {
    const result = resolveStationLineOrientation(snapshotWith(), "Q", "Q01");
    expect(result!.previous).toBeNull();
    expect(result!.next).toEqual({ name: "Mid Station", gtfsStopId: "Q02" });
  });

  it("returns null next for the last station on the line", () => {
    const result = resolveStationLineOrientation(snapshotWith(), "Q", "Q04");
    expect(result!.next).toBeNull();
    expect(result!.previous).toEqual({ name: "Central", gtfsStopId: "Q03" });
  });

  it("picks the shape covering the most real stations, ignoring a decoy shape that passes nowhere near any of them", () => {
    const result = resolveStationLineOrientation(
      snapshotWith({
        routes: [{ routeId: "Q", shapeIds: ["Q..DECOY", "Q..S1"] }],
        shapes: {
          // A long decoy far from every real station -- must NOT be picked
          // merely for being present first or having more points.
          "Q..DECOY": [
            [41.5, -75.0],
            [41.5, -74.9],
            [41.5, -74.8],
            [41.5, -74.7],
            [41.5, -74.6],
          ],
          "Q..S1": STRAIGHT_LINE_SHAPE,
        },
      }),
      "Q",
      "Q02",
    );
    expect(result!.previous).toEqual({ name: "West End", gtfsStopId: "Q01" });
    expect(result!.next).toEqual({ name: "Central", gtfsStopId: "Q03" });
  });

  it("fails safely for an unknown route", () => {
    expect(resolveStationLineOrientation(snapshotWith(), "NOPE", "Q02")).toBeNull();
  });

  it("fails safely for an unknown station on a known route", () => {
    expect(resolveStationLineOrientation(snapshotWith(), "Q", "Q99")).toBeNull();
  });

  it("fails safely for a route with no shapeIds", () => {
    expect(resolveStationLineOrientation(snapshotWith({ routes: [{ routeId: "Q", shapeIds: [] }] }), "Q", "Q02")).toBeNull();
  });

  it("fails safely when fewer than two real stations serve the route -- nothing to order", () => {
    expect(
      resolveStationLineOrientation(
        snapshotWith({ complexes: [{ stopName: "Lonely", borough: "Bk", routes: ["Q"], lat: 40.7, lon: -74.0, gtfsStopIds: ["Q01"] }] }),
        "Q",
        "Q01",
      ),
    ).toBeNull();
  });

  it("fails safely for a malformed/absent snapshot", () => {
    expect(resolveStationLineOrientation(null, "Q", "Q02")).toBeNull();
    expect(resolveStationLineOrientation({}, "Q", "Q02")).toBeNull();
  });

  it("fails safely for an empty routeId or stationId", () => {
    expect(resolveStationLineOrientation(snapshotWith(), "", "Q02")).toBeNull();
    expect(resolveStationLineOrientation(snapshotWith(), "Q", "")).toBeNull();
  });
});

describe("resolveStationLineOrientation -- STATION-03 real snapshot verification", () => {
  it("resolves Bay Ridge Av's real R-line neighbors (59 St / 77 St) from the real static snapshot", () => {
    // Verified against real MTA data before writing the module: Bay Ridge
    // Av's real order on the R line is ... 59 St -> Bay Ridge Av -> 77 St
    // -> ... This test locks that real-world result in, using the exact
    // same snapshot file `stationTruth.ts` already treats as canonical --
    // never a second/synthetic copy of real station truth.
    const snapshotPath = new URL("../../../../wall/data/subway/mtaSubwayStaticSnapshot.json", import.meta.url);
    const snapshot: unknown = JSON.parse(readFileSync(snapshotPath, "utf-8"));
    const result = resolveStationLineOrientation(snapshot, "R", "R42");
    expect(result).not.toBeNull();
    expect(result!.currentName).toBe("Bay Ridge Av");
    expect(result!.previous?.name).toBe("59 St");
    expect(result!.next?.name).toBe("77 St");
  });
});
