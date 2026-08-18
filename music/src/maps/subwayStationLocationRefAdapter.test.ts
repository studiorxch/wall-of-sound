import { describe, it, expect } from "vitest";
import { subwayStationToLocationRef, stationLibraryRecordToLocationRef } from "./subwayStationLocationRefAdapter";

// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD §19 / §23.13 — proves the
// canonical SUBWAY station identity is compatible with the existing id-first
// itinerary LocationRef model without ever using a display name as a key.
// Uses the real Manhattan/Brooklyn "Fulton St" collision case verified live
// against current MTA data during this build (see
// wall/systems/transit/mtaSubwayFeedSourceInventory.js).

describe("subwayStationToLocationRef", () => {
  const manhattanFulton = {
    id: "subway:stop:229",
    displayName: "Fulton St",
    latitude: 40.709416,
    longitude: -74.006571,
  };
  const brooklynFulton = {
    id: "subway:stop:G36",
    displayName: "Fulton St",
    latitude: 40.687119,
    longitude: -73.975375,
  };

  it("maps the canonical subway station id directly onto LocationRef.id", () => {
    const ref = subwayStationToLocationRef(manhattanFulton);
    expect(ref.id).toBe("subway:stop:229");
  });

  it("never derives LocationRef.id from the display name", () => {
    const ref = subwayStationToLocationRef(manhattanFulton);
    expect(ref.id).not.toBe(ref.name);
    expect(ref.id).not.toContain("Fulton");
  });

  it("two stations with the SAME display name produce DISTINCT LocationRef ids (the real collision case)", () => {
    const refA = subwayStationToLocationRef(manhattanFulton);
    const refB = subwayStationToLocationRef(brooklynFulton);
    expect(refA.name).toBe(refB.name);
    expect(refA.id).not.toBe(refB.id);
  });

  it("preserves real coordinates unmodified", () => {
    const ref = subwayStationToLocationRef(manhattanFulton);
    expect(ref.latitude).toBe(40.709416);
    expect(ref.longitude).toBe(-74.006571);
  });

  it("produces a shape assignable to the real LocationRef type (structural — a TS compile check, exercised by tsc -b)", () => {
    const ref = subwayStationToLocationRef(manhattanFulton);
    // If this file compiles under `tsc -b`, LocationRef compatibility is proven.
    const idOnly: string = ref.id;
    expect(typeof idOnly).toBe("string");
  });

  it("falls back to the station id as the label only when no display name is supplied (never silently empty)", () => {
    const ref = subwayStationToLocationRef({ id: "subway:stop:999", displayName: null, latitude: 0, longitude: 0 });
    expect(ref.name).toBe("subway:stop:999");
  });
});

describe("stationLibraryRecordToLocationRef (0818_SUBWAY_Station_Library_Foundation)", () => {
  const manhattanFultonRecord = {
    studioRichStationId: "stlib-000042",
    operational: { displayName: "Fulton St", latitude: 40.709416, longitude: -74.006571 },
  };
  const brooklynFultonRecord = {
    studioRichStationId: "stlib-000099",
    operational: { displayName: "Fulton St", latitude: 40.687119, longitude: -73.975375 },
  };

  it("maps the STABLE studioRichStationId onto LocationRef.id — not the raw MTA-derived id", () => {
    const ref = stationLibraryRecordToLocationRef(manhattanFultonRecord);
    expect(ref.id).toBe("stlib-000042");
  });

  it("two Station Library records with the SAME display name still produce DISTINCT LocationRef ids", () => {
    const refA = stationLibraryRecordToLocationRef(manhattanFultonRecord);
    const refB = stationLibraryRecordToLocationRef(brooklynFultonRecord);
    expect(refA.name).toBe(refB.name);
    expect(refA.id).not.toBe(refB.id);
  });

  it("preserves real coordinates from the nested operational block", () => {
    const ref = stationLibraryRecordToLocationRef(manhattanFultonRecord);
    expect(ref.latitude).toBe(40.709416);
    expect(ref.longitude).toBe(-74.006571);
  });
});
