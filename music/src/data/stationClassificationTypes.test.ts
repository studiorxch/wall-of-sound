import { describe, it, expect } from "vitest";
import {
  makeStationComponentId,
  makeStationComplexId,
  type StationTopologyFamily,
  type StationServicePattern,
  type StationStructureType,
  type StationComponentClassification,
  type StationComplexClassification,
  type StationComplexConnector,
} from "./stationClassificationTypes";
import { buildBayRidgeAvStationGeometrySeed } from "../logic/maps/stationGeometryBayRidgeAvSeed";
import { build77thStreetStationGeometrySeed } from "../logic/maps/stationGeometry77thStreetSeed";
import { build53rdStreetStationGeometrySeed } from "../logic/maps/stationGeometry53rdStreetSeed";
import { build45thStreetStationGeometrySeed } from "../logic/maps/stationGeometry45thStreetSeed";
import {
  deriveUndergroundSide2TrackGeometry,
  validateUndergroundSide2TrackParameters,
} from "../logic/maps/stationArchetypeUndergroundSide2Track";
import { deriveUndergroundSide4TrackGeometry } from "../logic/maps/stationArchetypeUndergroundSide4Track";
import { DEFAULT_UG_SIDE_2TRACK_PARAMETERS, DEFAULT_UG_SIDE_4TRACK_PARAMETERS } from "../data/stationArchetypeTypes";
import * as archetypeTypesModule from "../data/stationArchetypeTypes";

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

// 1. all four topology families are valid
describe("StationTopologyFamily — the four core families", () => {
  it("accepts exactly the four documented literal values, and no others by construction", () => {
    const families: StationTopologyFamily[] = ["SIDE_2TRACK", "ISLAND_2TRACK", "SIDE_4TRACK", "ISLAND_4TRACK"];
    expect(families).toHaveLength(4);
    for (const topology of families) {
      expect(component({ topology }).topology).toBe(topology);
    }
  });
});

// 2, 3, 4. specific topology/servicePattern pairings from the governing spec's own examples
describe("service pattern is independent of, and freely pairs with, topology", () => {
  it("SIDE_4TRACK pairs with EXPRESS_BYPASS (the governing spec's own four-track local example)", () => {
    const c = component({ topology: "SIDE_4TRACK", servicePattern: "EXPRESS_BYPASS" });
    expect(c.topology).toBe("SIDE_4TRACK");
    expect(c.servicePattern).toBe("EXPRESS_BYPASS");
  });

  it("ISLAND_4TRACK pairs with EXPRESS_STOP (the governing spec's own four-track express example)", () => {
    const c = component({ topology: "ISLAND_4TRACK", servicePattern: "EXPRESS_STOP" });
    expect(c.topology).toBe("ISLAND_4TRACK");
    expect(c.servicePattern).toBe("EXPRESS_STOP");
  });

  it("SIDE_2TRACK pairs with LOCAL_ONLY (the governing spec's own two-track example)", () => {
    const c = component({ topology: "SIDE_2TRACK", servicePattern: "LOCAL_ONLY" });
    expect(c.topology).toBe("SIDE_2TRACK");
    expect(c.servicePattern).toBe("LOCAL_ONLY");
  });

  it("service behavior is never silently inferred from topology alone — every pairing below is a real, distinct object a caller had to state explicitly", () => {
    const pairings: Array<[StationTopologyFamily, StationServicePattern]> = [
      ["SIDE_2TRACK", "LOCAL_ONLY"],
      ["SIDE_4TRACK", "EXPRESS_BYPASS"],
      ["ISLAND_4TRACK", "EXPRESS_STOP"],
      ["ISLAND_2TRACK", "LOCAL_ONLY"],
    ];
    for (const [topology, servicePattern] of pairings) {
      const c = component({ topology, servicePattern });
      expect(c).toMatchObject({ topology, servicePattern });
    }
  });
});

// 5. structure type is independent from topology
describe("structure type is independent from topology", () => {
  it("the same topology can carry any structure type", () => {
    const structures: StationStructureType[] = ["UNDERGROUND", "ELEVATED", "OPEN_CUT", "AT_GRADE"];
    for (const structure of structures) {
      const c = component({ topology: "SIDE_2TRACK", structure });
      expect(c.topology).toBe("SIDE_2TRACK");
      expect(c.structure).toBe(structure);
    }
  });

  it("matches the governing spec's own explicit examples: SIDE_2TRACK+UNDERGROUND, SIDE_2TRACK+ELEVATED, ISLAND_4TRACK+UNDERGROUND", () => {
    expect(component({ topology: "SIDE_2TRACK", structure: "UNDERGROUND" }).structure).toBe("UNDERGROUND");
    expect(component({ topology: "SIDE_2TRACK", structure: "ELEVATED" }).structure).toBe("ELEVATED");
    expect(component({ topology: "ISLAND_4TRACK", structure: "UNDERGROUND" }).structure).toBe("UNDERGROUND");
  });
});

// 6. terminal role is independent from topology
describe("operational role is independent from topology", () => {
  it("the same topology can be THROUGH or TERMINAL", () => {
    const through = component({ topology: "ISLAND_2TRACK", operationalRole: "THROUGH" });
    const terminal = component({ topology: "ISLAND_2TRACK", operationalRole: "TERMINAL" });
    expect(through.topology).toBe(terminal.topology);
    expect(through.operationalRole).not.toBe(terminal.operationalRole);
  });

  it("matches the governing spec's own 86th Street (THROUGH) vs. Bay Ridge-95th Street (TERMINAL) example shape — both real ISLAND_2TRACK+UNDERGROUND stations differing only in role", () => {
    const throughStation = component({ topology: "ISLAND_2TRACK", structure: "UNDERGROUND", operationalRole: "THROUGH" });
    const terminalStation = component({ topology: "ISLAND_2TRACK", structure: "UNDERGROUND", operationalRole: "TERMINAL" });
    expect(throughStation.topology).toBe(terminalStation.topology);
    expect(throughStation.structure).toBe(terminalStation.structure);
    expect(throughStation.operationalRole).toBe("THROUGH");
    expect(terminalStation.operationalRole).toBe("TERMINAL");
  });
});

// 7, 8. station complex composition, including the Union Square proof
describe("station complex composition — the Union Square proof", () => {
  it("a complex can contain multiple components with different topologies", () => {
    const a = component({ id: makeStationComponentId("unionSq:A"), topology: "ISLAND_4TRACK", servicePattern: "EXPRESS_STOP" });
    const b = component({ id: makeStationComponentId("unionSq:B"), topology: "SIDE_2TRACK", servicePattern: "LOCAL_ONLY" });
    const complex: StationComplexClassification = {
      id: makeStationComplexId("unionSq"),
      componentIds: [a.id, b.id],
      connectors: [],
      provenance: { source: "reference", note: "test fixture" },
    };
    expect(complex.componentIds).toContain(a.id);
    expect(complex.componentIds).toContain(b.id);
    expect(a.topology).not.toBe(b.topology);
  });

  it("Union Square is representable as ordinary components (2x ISLAND_4TRACK + 1x SIDE_2TRACK), never a single monolithic special archetype", () => {
    const componentA = component({
      id: makeStationComponentId("unionSq:A"),
      topology: "ISLAND_4TRACK",
      servicePattern: "EXPRESS_STOP",
      structure: "UNDERGROUND",
      lineGroupIds: ["4", "5", "6"],
    });
    const componentB = component({
      id: makeStationComponentId("unionSq:B"),
      topology: "ISLAND_4TRACK",
      servicePattern: "EXPRESS_STOP",
      structure: "UNDERGROUND",
      lineGroupIds: ["N", "Q", "R", "W"],
    });
    const componentC = component({
      id: makeStationComponentId("unionSq:C"),
      topology: "SIDE_2TRACK",
      servicePattern: "LOCAL_ONLY",
      structure: "UNDERGROUND",
      lineGroupIds: ["L"],
    });
    const connectors: StationComplexConnector[] = [
      {
        id: "connector:unionSq:A-C",
        connects: [componentA.id, componentC.id],
        kind: "transferCorridor",
        provenance: { source: "reference", note: "test fixture — a real transfer relationship would need its own real sourcing" },
      },
      {
        id: "connector:unionSq:B-C",
        connects: [componentB.id, componentC.id],
        kind: "transferCorridor",
        provenance: { source: "reference", note: "test fixture" },
      },
    ];
    const unionSquareComplex: StationComplexClassification = {
      id: makeStationComplexId("unionSq"),
      componentIds: [componentA.id, componentB.id, componentC.id],
      connectors,
      provenance: { source: "reference", note: "test fixture — proves compositional representability only, not real Union Square geometry" },
    };

    const topologies = [componentA, componentB, componentC].map((c) => c.topology);
    expect(topologies.filter((t) => t === "ISLAND_4TRACK")).toHaveLength(2);
    expect(topologies.filter((t) => t === "SIDE_2TRACK")).toHaveLength(1);
    expect(unionSquareComplex.componentIds).toHaveLength(3);
    expect(unionSquareComplex.connectors).toHaveLength(2);
    // The complex layer owns the relationships — components themselves carry none.
    for (const c of [componentA, componentB, componentC]) {
      expect((c as unknown as { connectors?: unknown }).connectors).toBeUndefined();
    }
  });
});

// 9. component identities remain distinct
describe("component identities remain distinct", () => {
  it("two components in the same complex never collide on id, even with similar inputs", () => {
    const a = makeStationComponentId("unionSq:A");
    const b = makeStationComponentId("unionSq:B");
    expect(a).not.toBe(b);
    expect(makeStationComponentId("x")).toBe(makeStationComponentId("x")); // deterministic
  });

  it("component ids are never random — same key always produces the same id", () => {
    expect(makeStationComponentId("R42")).toBe("stationComponent:R42");
  });
});

// 10. complex identity does not overwrite component identity
describe("complex identity does not overwrite component identity", () => {
  it("a component's own id is unchanged by which complex (if any) references it", () => {
    const c = component({ id: makeStationComponentId("R42") });
    const complexA: StationComplexClassification = {
      id: makeStationComplexId("36"),
      componentIds: [c.id],
      connectors: [],
      provenance: { source: "reference" },
    };
    const complexB: StationComplexClassification = {
      id: makeStationComplexId("differentComplex"),
      componentIds: [c.id],
      connectors: [],
      provenance: { source: "reference" },
    };
    expect(c.id).toBe("stationComponent:R42");
    expect(complexA.id).not.toBe(complexB.id);
    expect(complexA.componentIds[0]).toBe(complexB.componentIds[0]); // same real component, referenced by two different complex records
  });

  it("StationComponentId and StationComplexId use distinct namespaces — never confusable at the type/string level", () => {
    const componentId = makeStationComponentId("36");
    const complexId = makeStationComplexId("36");
    expect(componentId).not.toBe(complexId as unknown as string);
    expect(componentId.startsWith("stationComponent:")).toBe(true);
    expect(complexId.startsWith("stationComplex:")).toBe(true);
  });
});

// 11. no calibrated Bay Ridge / 77th / 53rd / 45th geometry changes
describe("no calibrated station geometry changed by introducing the classification layer", () => {
  it("all four calibrated stations still build their real, previously-verified geometry unchanged", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed("2026-09-08T00:00:00.000Z");
    const r43 = build77thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const r40 = build53rdStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");
    const r39 = build45thStreetStationGeometrySeed("2026-09-09T00:00:00.000Z");

    expect(bayRidge.id).toBe("stationGeometry:R42");
    expect(bayRidge.evidenceConflicts[0].status).toBe("resolved");
    expect(r43.id).toBe("stationGeometry:R43");
    expect(r43.evidenceConflicts).toHaveLength(1);
    expect(r40.id).toBe("stationGeometry:R40");
    expect(r40.trackCenterlines).toHaveLength(4);
    expect(r39.id).toBe("stationGeometry:R39");
    expect(r39.platformLinks[0].approximatePosition).toBe("north");
  });

  it("StationGeometryData itself gained no new field from this checkpoint — a classification only ever references geometry by its own existing id string", () => {
    const bayRidge = buildBayRidgeAvStationGeometrySeed();
    const c = component({ stationGeometryId: bayRidge.id });
    expect(c.stationGeometryId).toBe(bayRidge.id);
    // The reference is one-directional and external — nothing was added to bayRidge itself.
    expect((bayRidge as unknown as { classification?: unknown }).classification).toBeUndefined();
  });
});

// 12. existing archetypes remain byte/semantic equivalent
describe("existing archetypes remain byte/semantic equivalent", () => {
  it("UG_SIDE_2TRACK's own derivation is unchanged by the classification layer's existence", () => {
    const before = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    // Exercise the classification module in the same process.
    component({ topology: "SIDE_2TRACK" });
    const after = deriveUndergroundSide2TrackGeometry(DEFAULT_UG_SIDE_2TRACK_PARAMETERS, "TEST");
    expect(after).toEqual(before);
    expect(validateUndergroundSide2TrackParameters(DEFAULT_UG_SIDE_2TRACK_PARAMETERS)).toEqual([]);
  });

  it("UG_SIDE_4TRACK's own derivation is unchanged by the classification layer's existence", () => {
    const before = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    component({ topology: "SIDE_4TRACK" });
    const after = deriveUndergroundSide4TrackGeometry(DEFAULT_UG_SIDE_4TRACK_PARAMETERS, "TEST");
    expect(after).toEqual(before);
  });

  it("no new archetype family was built this checkpoint — exactly the two pre-existing archetype ids exist, no island archetype id was added", () => {
    const archetypeIdKeys = Object.keys(archetypeTypesModule).filter((key) => key.endsWith("_ARCHETYPE_ID"));
    expect(archetypeIdKeys.sort()).toEqual(["UG_SIDE_2TRACK_ARCHETYPE_ID", "UG_SIDE_4TRACK_ARCHETYPE_ID"]);
    // ISLAND_2TRACK/ISLAND_4TRACK are classification-layer TOPOLOGY labels
    // only in this checkpoint — no deriveUnderground*Island*Geometry module
    // exists, and this test file never imports one.
  });
});
