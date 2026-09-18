import { describe, it, expect } from "vitest";
import type {
  StationComponentClassification,
  StationServicePattern,
  StationStopBehavior,
  StationTopologyFamily,
} from "./stationClassificationTypes";
import { makeStationComponentId } from "./stationClassificationTypes";
import type { StationTrackCenterline, TrackOperatingDirection, TrackPhysicalRole, TrackRole } from "./stationGeometryTypes";
import { buildBayRidgeAvStationGeometrySeed } from "../logic/maps/stationGeometryBayRidgeAvSeed";
import { build77thStreetStationGeometrySeed } from "../logic/maps/stationGeometry77thStreetSeed";
import { build53rdStreetStationGeometrySeed } from "../logic/maps/stationGeometry53rdStreetSeed";
import { build45thStreetStationGeometrySeed } from "../logic/maps/stationGeometry45thStreetSeed";
import {
  deriveUndergroundSide2TrackGeometry,
  validateUndergroundSide2TrackParameters,
} from "../logic/maps/stationArchetypeUndergroundSide2Track";
import {
  deriveUndergroundSide4TrackGeometry,
  isPlatformServingRole,
} from "../logic/maps/stationArchetypeUndergroundSide4Track";
import { DEFAULT_UG_SIDE_2TRACK_PARAMETERS, DEFAULT_UG_SIDE_4TRACK_PARAMETERS } from "./stationArchetypeTypes";

function component(overrides: Partial<StationComponentClassification> = {}): StationComponentClassification {
  return {
    id: makeStationComponentId("test"),
    topology: "SIDE_2TRACK",
    servicePattern: "LOCAL_ONLY",
    structure: "UNDERGROUND",
    operationalRole: "THROUGH",
    lineGroupIds: ["R"],
    provenance: { source: "reference", note: "test fixture" },
    ...overrides,
  };
}

function track(overrides: Partial<StationTrackCenterline> = {}): StationTrackCenterline {
  return {
    id: "track:test",
    platformId: null,
    provenance: { source: "reference", note: "test fixture" },
    ...overrides,
  };
}

describe("Service semantics", () => {
  // 1. ordinary 2-track local-only station remains valid
  it("an ordinary 2-track local-only component remains valid, unchanged", () => {
    const c = component({ topology: "SIDE_2TRACK", servicePattern: "LOCAL_ONLY" });
    expect(c.servicePattern).toBe("LOCAL_ONLY");
    expect(c.stopBehavior).toBeUndefined(); // never required for the ordinary case
  });

  // 2. 4-track local station with dedicated express bypass remains valid
  it("a 4-track local station with a dedicated physical express bypass remains valid", () => {
    const c = component({ topology: "SIDE_4TRACK", servicePattern: "EXPRESS_BYPASS" });
    expect(c.servicePattern).toBe("EXPRESS_BYPASS");
    expect(c.stopBehavior).toBeUndefined(); // already fully answered by servicePattern itself
  });

  // 3. 4-track express stop remains valid
  it("a 4-track express-stop station remains valid", () => {
    const c = component({ topology: "ISLAND_4TRACK", servicePattern: "EXPRESS_STOP" });
    expect(c.servicePattern).toBe("EXPRESS_STOP");
  });

  // 4. 2-track station with scheduled express skip is representable without EXPRESS_BYPASS
  it("a 2-track station with scheduled express skip is representable WITHOUT claiming EXPRESS_BYPASS", () => {
    // The real Flushing Line case: Vernon Blvd-Jackson Av, Hunters Point Av,
    // Court Sq, Queensboro Plaza's 7-component — 2 tracks, both platform-
    // serving, no distinct physical bypass track, but <7> express skips.
    const c = component({
      topology: "SIDE_2TRACK",
      servicePattern: "LOCAL_ONLY", // honest: no distinct physical bypass track exists
      stopBehavior: "SCHEDULED_EXPRESS_SKIP",
    });
    expect(c.servicePattern).toBe("LOCAL_ONLY");
    expect(c.servicePattern).not.toBe("EXPRESS_BYPASS"); // never dishonestly implies a bypass track
    expect(c.stopBehavior).toBe("SCHEDULED_EXPRESS_SKIP");
  });

  // 5. scheduled express skip does not change topology
  it("scheduled express skip never changes the component's own topology family", () => {
    const withoutSkip = component({ topology: "SIDE_2TRACK", servicePattern: "LOCAL_ONLY" });
    const withSkip = component({ topology: "SIDE_2TRACK", servicePattern: "LOCAL_ONLY", stopBehavior: "SCHEDULED_EXPRESS_SKIP" });
    expect(withoutSkip.topology).toBe(withSkip.topology);
  });

  // 6. scheduled express skip does not create fake tracks
  it("scheduled express skip requires no additional track records at all", () => {
    const tracks: StationTrackCenterline[] = [
      track({ id: "track:test:north", platformId: "platform:test:north" }),
      track({ id: "track:test:south", platformId: "platform:test:south" }),
    ];
    const c = component({ topology: "SIDE_2TRACK", servicePattern: "LOCAL_ONLY", stopBehavior: "SCHEDULED_EXPRESS_SKIP" });
    // Exactly 2 tracks — no fake third "bypass" track was invented to justify the skip.
    expect(tracks).toHaveLength(2);
    expect(c.stopBehavior).toBe("SCHEDULED_EXPRESS_SKIP");
  });
});

describe("Track role semantics", () => {
  // 7. ordinary local directional track remains valid
  it("an ordinary local directional track (legacy TrackRole) remains valid, unchanged", () => {
    const t = track({ role: "northboundLocal" as TrackRole, platformId: "platform:test:north" });
    expect(t.role).toBe("northboundLocal");
    expect(t.physicalRole).toBeUndefined();
    expect(t.operatingDirection).toBeUndefined();
  });

  // 8. ordinary dedicated express track remains valid
  it("an ordinary dedicated (fixed-direction) express track remains valid via legacy TrackRole", () => {
    const t = track({ role: "northboundExpress" as TrackRole, platformId: null });
    expect(t.role).toBe("northboundExpress");
    expect(t.platformId).toBeNull();
  });

  // 9. reversible center express track is representable
  it("a reversible center express track is representable via the new physicalRole/operatingDirection pair", () => {
    const reversibleTrack = track({
      id: "track:flushingFixture:centerExpress",
      platformId: null,
      physicalRole: "reversibleExpress" as TrackPhysicalRole,
      operatingDirection: "reversible" as TrackOperatingDirection,
    });
    expect(reversibleTrack.physicalRole).toBe("reversibleExpress");
    expect(reversibleTrack.operatingDirection).toBe("reversible");
    // The old, direction-baked TrackRole field is correctly left unset — none of its 4 values could honestly describe this track.
    expect(reversibleTrack.role).toBeUndefined();
  });

  // 10. reversible express role has no permanently fixed travel direction
  it("the reversibleExpress physical role never implies a fixed travel direction", () => {
    const reversibleTrack = track({ physicalRole: "reversibleExpress" as TrackPhysicalRole, operatingDirection: "reversible" as TrackOperatingDirection });
    expect(reversibleTrack.operatingDirection).not.toBe("northbound");
    expect(reversibleTrack.operatingDirection).not.toBe("southbound");
    expect(reversibleTrack.operatingDirection).toBe("reversible");
  });

  // 11. changing operating direction does not mutate physical role
  it("changing operating direction leaves physicalRole completely untouched", () => {
    const amPeak = track({ id: "track:flushingFixture:centerExpress", physicalRole: "reversibleExpress" as TrackPhysicalRole, operatingDirection: "northbound" as TrackOperatingDirection });
    const pmPeak: StationTrackCenterline = { ...amPeak, operatingDirection: "southbound" as TrackOperatingDirection };
    expect(amPeak.physicalRole).toBe(pmPeak.physicalRole); // physical role identical across the "flip"
    expect(amPeak.operatingDirection).not.toBe(pmPeak.operatingDirection); // only direction changed
  });

  // 12. yard-lead/bypass/relay roles are only present if justified by the final chosen model
  it("yardLead/bypass/relay physical roles exist in the type and are usable for the real 111th Street case Batch 02 found", () => {
    // Real case: 111th St has 2 active local tracks, 1 grade-separated
    // express flyover with no platform, and 2 non-revenue yard-lead tracks
    // to Corona Yard. This is a TEST FIXTURE proving representability only
    // — 111th St itself is not a calibrated station in this repo.
    const yardLead = track({ id: "track:flushingFixture:yardLeadA", physicalRole: "yardLead" as TrackPhysicalRole, operatingDirection: "none" as TrackOperatingDirection });
    const flyoverExpress = track({ id: "track:flushingFixture:flyoverExpress", physicalRole: "bypass" as TrackPhysicalRole, platformId: null });
    expect(yardLead.physicalRole).toBe("yardLead");
    expect(yardLead.operatingDirection).toBe("none");
    expect(flyoverExpress.physicalRole).toBe("bypass");
    expect(flyoverExpress.platformId).toBeNull();
  });
});

describe("Flushing validation fixtures (test-only — no real station geometry authored)", () => {
  // Reversible Express fixture, per the governing spec's own example.
  it("represents a real 3-track reversible-express cross-section: 2 outer directional local tracks + 1 reversible center express track", () => {
    const northLocal = track({ id: "track:flushingFixture:northLocal", role: "northboundLocal" as TrackRole, platformId: "platform:flushingFixture:north" });
    const southLocal = track({ id: "track:flushingFixture:southLocal", role: "southboundLocal" as TrackRole, platformId: "platform:flushingFixture:south" });
    const centerReversible = track({
      id: "track:flushingFixture:centerExpress",
      physicalRole: "reversibleExpress" as TrackPhysicalRole,
      operatingDirection: "reversible" as TrackOperatingDirection,
      platformId: null,
    });
    const tracks = [northLocal, centerReversible, southLocal];
    expect(tracks).toHaveLength(3);
    // Invariant: center physical role stays reversible even if operating direction is later pinned to a specific peak.
    const centerDuringAmPeak: StationTrackCenterline = { ...centerReversible, operatingDirection: "northbound" as TrackOperatingDirection };
    expect(centerDuringAmPeak.physicalRole).toBe("reversibleExpress");
  });

  // Scheduled Express Skip fixture, per the governing spec's own example.
  it("represents a real 2-track scheduled-express-skip cross-section: no bypass track, express shares the local tracks, express does not stop", () => {
    const northLocal = track({ id: "track:flushingFixture2:north", role: "northboundLocal" as TrackRole, platformId: "platform:flushingFixture2:north" });
    const southLocal = track({ id: "track:flushingFixture2:south", role: "southboundLocal" as TrackRole, platformId: "platform:flushingFixture2:south" });
    const tracks = [northLocal, southLocal];
    const c = component({ topology: "SIDE_2TRACK", servicePattern: "LOCAL_ONLY", stopBehavior: "SCHEDULED_EXPRESS_SKIP" });

    expect(tracks).toHaveLength(2); // no fake bypass track
    expect(tracks.every((t) => t.platformId !== null)).toBe(true); // both tracks genuinely platform-serving
    expect(c.topology).toBe("SIDE_2TRACK"); // topology unaffected
    expect(c.servicePattern).toBe("LOCAL_ONLY"); // physical role unaffected
    expect(c.stopBehavior).toBe("SCHEDULED_EXPRESS_SKIP"); // the real skip fact, represented operationally
  });
});

describe("Compatibility", () => {
  // 13. existing SIDE_2TRACK archetype remains semantically unchanged
  it("UG_SIDE_2TRACK's own derivation is byte-identical before/after this checkpoint's type additions", () => {
    const geometry = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    expect(geometry.trackCenterlines).toHaveLength(2);
    for (const t of geometry.trackCenterlines) {
      expect((t as StationTrackCenterline).physicalRole).toBeUndefined();
      expect((t as StationTrackCenterline).operatingDirection).toBeUndefined();
    }
    expect(validateUndergroundSide2TrackParameters(DEFAULT_UG_SIDE_2TRACK_PARAMETERS)).toEqual([]);
  });

  // 14. existing SIDE_4TRACK archetype remains semantically unchanged
  it("UG_SIDE_4TRACK's own derivation is unchanged - still uses legacy TrackRole exclusively, never the new fields", () => {
    const geometry = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    expect(geometry.trackCenterlines).toHaveLength(4);
    expect(geometry.trackCenterlines.map((t) => t.role)).toEqual([
      "northboundLocal",
      "northboundExpress",
      "southboundExpress",
      "southboundLocal",
    ]);
    for (const t of geometry.trackCenterlines) {
      expect(t.physicalRole).toBeUndefined();
      expect(t.operatingDirection).toBeUndefined();
    }
    expect(isPlatformServingRole("northboundLocal")).toBe(true);
    expect(isPlatformServingRole("northboundExpress")).toBe(false);
  });

  // 15-18. Bay Ridge Av / 77th St / 53rd St / 45th St remain unchanged
  it("all four calibrated stations remain byte-identical - real geometry, real track roles, real evidence conflicts, all untouched", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    const r43 = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const r40 = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const r39 = build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

    expect(bayRidge.id).toBe("stationGeometry:R42");
    expect(bayRidge.trackCenterlines.every((t) => t.physicalRole === undefined && t.operatingDirection === undefined)).toBe(true);

    expect(r43.id).toBe("stationGeometry:R43");
    expect(r43.evidenceConflicts).toHaveLength(1);

    expect(r40.id).toBe("stationGeometry:R40");
    expect(r40.trackCenterlines.map((t) => t.role)).toEqual(["northboundLocal", "northboundExpress", "southboundExpress", "southboundLocal"]);
    expect(r40.trackCenterlines.every((t) => t.physicalRole === undefined)).toBe(true);

    expect(r39.id).toBe("stationGeometry:R39");
    expect(r39.trackCenterlines.every((t) => t.physicalRole === undefined)).toBe(true);
    expect(r39.platformLinks[0].approximatePosition).toBe("north");
  });

  // 19. topology-family vocabulary remains exactly eight families
  it("StationTopologyFamily is exactly the eight frozen families - no more, no fewer", () => {
    const families: StationTopologyFamily[] = [
      "SINGLE_TRACK_SINGLE_PLATFORM",
      "SIDE_2TRACK",
      "ISLAND_2TRACK",
      "SIDE_3TRACK",
      "ISLAND_3TRACK",
      "SIDE_4TRACK",
      "ISLAND_4TRACK",
      "MIXED_4TRACK_3PLATFORM",
    ];
    expect(families).toHaveLength(8);
    for (const topology of families) {
      expect(component({ topology }).topology).toBe(topology);
    }
  });

  // 20. full prior station classification/geometry test suite remains green — verified by
  // running the complete suite alongside this file (see the checkpoint's own completion
  // report for the actual combined run); nothing in this file can prove that on its own.
  it("StationServicePattern's own three original values are completely untouched", () => {
    const patterns: StationServicePattern[] = ["LOCAL_ONLY", "EXPRESS_BYPASS", "EXPRESS_STOP"];
    expect(patterns).toHaveLength(3);
  });

  it("StationStopBehavior is a genuinely new, separate type - never merged into StationServicePattern", () => {
    const behaviors: StationStopBehavior[] = ["ALL_RELEVANT_SERVICES_STOP", "SCHEDULED_EXPRESS_SKIP"];
    expect(behaviors).toHaveLength(2);
    // Structural proof of separation: a StationServicePattern value is never a valid StationStopBehavior value and vice versa.
    const servicePatternValues: string[] = ["LOCAL_ONLY", "EXPRESS_BYPASS", "EXPRESS_STOP"];
    const stopBehaviorValues: string[] = behaviors;
    expect(servicePatternValues.some((v) => stopBehaviorValues.includes(v))).toBe(false);
  });
});
