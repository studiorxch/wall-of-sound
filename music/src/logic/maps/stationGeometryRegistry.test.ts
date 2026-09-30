import { describe, it, expect } from "vitest";
import { resolveKnownStationGeometry } from "./stationGeometryRegistry";

describe("resolveKnownStationGeometry", () => {
  it("resolves Bay Ridge Av's real canonical seed for R42", () => {
    const geometry = resolveKnownStationGeometry("R42", "2026-09-08T00:00:00.000Z");
    expect(geometry).not.toBeNull();
    expect(geometry!.id).toBe("stationGeometry:R42");
    expect(geometry!.stationRef.gtfsStopId).toBe("R42");
  });

  it("returns null for any station with no real canonical geometry record -- never a fabricated or substituted one", () => {
    expect(resolveKnownStationGeometry("R16")).toBeNull(); // Times Sq-42 St/Port Authority -- no real seed exists
    expect(resolveKnownStationGeometry("R43")).toBeNull(); // 77th St -- has a seed, but is not (yet) registered here
    expect(resolveKnownStationGeometry("")).toBeNull();
    expect(resolveKnownStationGeometry("NOPE99")).toBeNull();
  });
});
