import { describe, it, expect } from "vitest";
import { computeReadiness } from "./itineraryReadiness";
import type { Itinerary } from "../../data/itineraryTypes";

function baseItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: "it1",
    title: "Test",
    stops: [],
    stages: [],
    routeSets: {},
    activeStageId: null,
    status: "draft",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("computeReadiness", () => {
  it("is incomplete with fewer than 2 stops", () => {
    expect(computeReadiness(baseItinerary({ stops: [] }))).toBe("incomplete");
  });

  it("is incomplete when a stage still has the needs-routing sentinel", () => {
    const itinerary = baseItinerary({
      stops: [
        { id: "a", name: "a", longitude: 0, latitude: 0 },
        { id: "b", name: "b", longitude: 0, latitude: 0 },
      ],
      stages: [
        {
          id: "s1", order: 0, originStopId: "a", destinationStopId: "b", mode: "driving",
          routeSetId: "", selectedRouteId: null, distanceMeters: null, durationSeconds: null,
        },
      ],
    });
    expect(computeReadiness(itinerary)).toBe("incomplete");
  });

  it("is ready when every stage has real route data", () => {
    const itinerary = baseItinerary({
      stops: [
        { id: "a", name: "a", longitude: 0, latitude: 0 },
        { id: "b", name: "b", longitude: 0, latitude: 0 },
      ],
      stages: [
        {
          id: "s1", order: 0, originStopId: "a", destinationStopId: "b", mode: "driving",
          routeSetId: "rs1", selectedRouteId: "route1", distanceMeters: 500, durationSeconds: 120,
        },
      ],
    });
    expect(computeReadiness(itinerary)).toBe("ready");
  });

  it("stays independent of status — a draft itinerary can be ready, an active one can be incomplete", () => {
    const readyStage = {
      id: "s1", order: 0, originStopId: "a", destinationStopId: "b", mode: "driving" as const,
      routeSetId: "rs1", selectedRouteId: "route1", distanceMeters: 500, durationSeconds: 120,
    };
    const stops = [
      { id: "a", name: "a", longitude: 0, latitude: 0 },
      { id: "b", name: "b", longitude: 0, latitude: 0 },
    ];
    expect(computeReadiness(baseItinerary({ status: "draft", stops, stages: [readyStage] }))).toBe("ready");
    expect(computeReadiness(baseItinerary({ status: "active", stops, stages: [] }))).toBe("incomplete");
  });
});
