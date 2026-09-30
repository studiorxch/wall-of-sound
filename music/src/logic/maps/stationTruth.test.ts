import { describe, it, expect } from "vitest";
import { resolveStationTruth } from "./stationTruth";

const SNAPSHOT = {
  complexes: [
    {
      complexId: "36",
      isComplex: false,
      stationCount: 1,
      stopName: "Bay Ridge Av",
      displayName: "Bay Ridge Av (R)",
      borough: "Bk",
      routes: ["R"],
      lat: 40.634967,
      lon: -74.023377,
      ada: "0",
      gtfsStopIds: ["R42"],
    },
    {
      complexId: "999",
      stopName: "Some Other Station",
      borough: "Mn",
      routes: ["Z"], // deliberately no matching route record below
      lat: 1,
      lon: 2,
      gtfsStopIds: ["Z99"],
    },
  ],
  routes: [
    { routeId: "R", shortName: "R", longName: "Broadway Local", routeType: 1, color: "F6BC26", textColor: "000000" },
  ],
};

describe("resolveStationTruth -- STATION-01", () => {
  it("resolves Bay Ridge Av (R42) from canonical Station Truth", () => {
    const result = resolveStationTruth(SNAPSHOT, "R42");
    expect(result).not.toBeNull();
    expect(result!.gtfsStopId).toBe("R42");
    expect(result!.name).toBe("Bay Ridge Av");
    expect(result!.borough).toBe("Bk");
    expect(result!.complexId).toBe("36");
    expect(result!.latitude).toBeCloseTo(40.634967);
    expect(result!.longitude).toBeCloseTo(-74.023377);
  });

  it("renders route identity (badge fields) from the canonical routes table, not the complex's own routeId list alone", () => {
    const result = resolveStationTruth(SNAPSHOT, "R42");
    expect(result!.routes).toEqual([
      { routeId: "R", shortName: "R", longName: "Broadway Local", color: "F6BC26", textColor: "000000" },
    ]);
  });

  it("omits a route id with no matching, well-formed route record instead of fabricating one", () => {
    const result = resolveStationTruth(SNAPSHOT, "Z99");
    expect(result).not.toBeNull();
    expect(result!.routes).toEqual([]);
  });

  it("never duplicates station metadata -- every field traces directly to the snapshot's own complex/route records, nothing computed or guessed", () => {
    const result = resolveStationTruth(SNAPSHOT, "R42");
    // Every value is a literal pass-through of the fixture above -- this
    // test fails the instant this module starts deriving/defaulting a
    // fact instead of reading it.
    expect(result).toEqual({
      gtfsStopId: "R42",
      complexId: "36",
      name: "Bay Ridge Av",
      borough: "Bk",
      routes: [{ routeId: "R", shortName: "R", longName: "Broadway Local", color: "F6BC26", textColor: "000000" }],
      latitude: 40.634967,
      longitude: -74.023377,
    });
  });

  it("fails safely (null) for an unknown station id -- never fabricates a placeholder record", () => {
    expect(resolveStationTruth(SNAPSHOT, "NOPE99")).toBeNull();
  });

  it("fails safely for an empty station id", () => {
    expect(resolveStationTruth(SNAPSHOT, "")).toBeNull();
  });

  it("fails safely for a malformed/absent snapshot", () => {
    expect(resolveStationTruth(null, "R42")).toBeNull();
    expect(resolveStationTruth({}, "R42")).toBeNull();
    expect(resolveStationTruth({ complexes: [], routes: [] }, "R42")).toBeNull();
    expect(resolveStationTruth({ complexes: "not-an-array", routes: [] }, "R42")).toBeNull();
  });

  it("fails safely when the matched complex record itself is malformed (missing required fields)", () => {
    const badSnapshot = { complexes: [{ gtfsStopIds: ["R42"] }], routes: [] };
    expect(resolveStationTruth(badSnapshot, "R42")).toBeNull();
  });
});
