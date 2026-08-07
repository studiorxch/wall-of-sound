import { describe, it, expect } from "vitest";
import { computeRunReadiness, buildItineraryRunPayload } from "./itineraryRunReadiness";
import type { Itinerary } from "../../data/itineraryTypes";

const STOPS = [
  { id: "a", name: "A", longitude: 0, latitude: 0 },
  { id: "b", name: "B", longitude: 0.01, latitude: 0.01 },
];

function readyItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: "it1",
    title: "Test",
    stops: STOPS,
    stages: [
      {
        id: "s1", order: 0, originStopId: "a", destinationStopId: "b", mode: "driving",
        routeSetId: "rs1", selectedRouteId: "r1", distanceMeters: 500, durationSeconds: 120,
      },
    ],
    routeSets: {
      rs1: {
        id: "rs1", mode: "driving", fetchedAt: "2026-01-01T00:00:00.000Z",
        routes: [{
          id: "r1",
          geometry: { type: "LineString", coordinates: [[0, 0], [0.01, 0.01]] },
          distanceMeters: 500, durationSeconds: 120, steps: [],
        }],
      },
    },
    activeStageId: null,
    status: "draft",
    createdAt: "", updatedAt: "",
    ...overrides,
  };
}

describe("computeRunReadiness", () => {
  it("is ready for a fully-routed itinerary", () => {
    expect(computeRunReadiness(readyItinerary())).toEqual({ ready: true, reasons: [] });
  });

  it("reports missing_stage for fewer than 2 stops", () => {
    const result = computeRunReadiness(readyItinerary({ stops: [STOPS[0]] }));
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("missing_stage");
  });

  it("reports missing_stage for zero stages", () => {
    const result = computeRunReadiness(readyItinerary({ stages: [] }));
    expect(result.reasons).toContain("missing_stage");
  });

  it("reports unsupported_mode for a non-routable mode, never fabricating readiness", () => {
    const it2 = readyItinerary();
    it2.stages[0].mode = "flight";
    const result = computeRunReadiness(it2);
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("unsupported_mode");
  });

  it("reports missing_selected_route when selectedRouteId doesn't resolve", () => {
    const it2 = readyItinerary();
    it2.stages[0].selectedRouteId = "does-not-exist";
    const result = computeRunReadiness(it2);
    expect(result.reasons).toContain("missing_selected_route");
  });

  it("reports invalid_geometry for a degenerate LineString", () => {
    const it2 = readyItinerary();
    it2.routeSets.rs1.routes[0].geometry = { type: "LineString", coordinates: [[0, 0]] };
    const result = computeRunReadiness(it2);
    expect(result.reasons).toContain("invalid_geometry");
  });

  it("reports run_already_active as a distinguishable reason, not a silent no-op", () => {
    const result = computeRunReadiness(readyItinerary(), true);
    expect(result.reasons).toEqual(["run_already_active"]);
  });

  it("never collapses multiple problems into a single generic reason", () => {
    const it2 = readyItinerary();
    it2.stages[0].mode = "flight";
    it2.stages.push({
      id: "s2", order: 1, originStopId: "b", destinationStopId: "a", mode: "driving",
      routeSetId: "missing", selectedRouteId: null, distanceMeters: null, durationSeconds: null,
    });
    const result = computeRunReadiness(it2);
    expect(result.reasons).toContain("unsupported_mode");
    expect(result.reasons).toContain("missing_selected_route");
  });
});

describe("buildItineraryRunPayload", () => {
  it("builds a real, ordered payload from a ready itinerary", () => {
    const payload = buildItineraryRunPayload(readyItinerary());
    expect(payload).not.toBeNull();
    expect(payload!.itineraryId).toBe("it1");
    expect(payload!.stages).toHaveLength(1);
    expect(payload!.stages[0]).toMatchObject({
      stageId: "s1", routeId: "r1", distanceMeters: 500, durationSeconds: 120,
    });
    expect(payload!.stages[0].geometry.coordinates).toEqual([[0, 0], [0.01, 0.01]]);
  });

  it("returns null for a non-ready itinerary rather than a partial/fabricated payload", () => {
    expect(buildItineraryRunPayload(readyItinerary({ stages: [] }))).toBeNull();
  });

  it("orders stages by their real `order` field, not array insertion order", () => {
    const it2 = readyItinerary();
    const stage2 = {
      id: "s2", order: 0, originStopId: "b", destinationStopId: "a", mode: "driving" as const,
      routeSetId: "rs1", selectedRouteId: "r1", distanceMeters: 500, durationSeconds: 120,
    };
    it2.stages[0].order = 1;
    it2.stages.unshift(stage2);
    const payload = buildItineraryRunPayload(it2);
    expect(payload!.stages.map((s) => s.stageId)).toEqual(["s2", "s1"]);
  });
});
