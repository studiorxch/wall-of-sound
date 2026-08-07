import { describe, it, expect } from "vitest";
import {
  reorderStops,
  appendStop,
  removeStop,
  deriveStages,
  stagesNeedingRouting,
  reorderStopsAndDeriveStages,
} from "./itineraryStageOrder";
import type { Itinerary, ItineraryStage, LocationRef } from "../../data/itineraryTypes";

function stop(id: string, name = id): LocationRef {
  return { id, name, longitude: 0, latitude: 0 };
}

function realStage(originStopId: string, destinationStopId: string, order: number): ItineraryStage {
  return {
    id: `stage_${originStopId}_${destinationStopId}`,
    order,
    originStopId,
    destinationStopId,
    mode: "driving",
    routeSetId: `rs_${originStopId}_${destinationStopId}`,
    selectedRouteId: `route_${originStopId}_${destinationStopId}`,
    distanceMeters: 1000,
    durationSeconds: 300,
  };
}

describe("reorderStops", () => {
  it("moves a stop from one index to another, preserving stop identity", () => {
    const stops = [stop("a"), stop("b"), stop("c"), stop("d")];
    const next = reorderStops(stops, 1, 3);
    expect(next.map((s) => s.id)).toEqual(["a", "c", "d", "b"]);
  });

  it("is a no-op when fromIndex === toIndex", () => {
    const stops = [stop("a"), stop("b")];
    expect(reorderStops(stops, 0, 0)).toBe(stops);
  });

  it("clamps an out-of-range toIndex", () => {
    const stops = [stop("a"), stop("b"), stop("c")];
    const next = reorderStops(stops, 0, 99);
    expect(next.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });
});

describe("appendStop / removeStop", () => {
  it("appends a new stop at the end", () => {
    const stops = [stop("a")];
    const next = appendStop(stops, stop("b"));
    expect(next.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("removes a stop by id", () => {
    const stops = [stop("a"), stop("b"), stop("c")];
    const next = removeStop(stops, "b");
    expect(next.map((s) => s.id)).toEqual(["a", "c"]);
  });
});

describe("deriveStages — the core preservation safeguard", () => {
  it("creates N-1 stages for N stops, all new when there are no previous stages", () => {
    const stops = [stop("a"), stop("b"), stop("c")];
    const stages = deriveStages(stops, []);
    expect(stages).toHaveLength(2);
    expect(stages[0].originStopId).toBe("a");
    expect(stages[0].destinationStopId).toBe("b");
    expect(stages[1].originStopId).toBe("b");
    expect(stages[1].destinationStopId).toBe("c");
    expect(stagesNeedingRouting(stages)).toHaveLength(2);
  });

  it("reuses the exact same stage object (id, routeSetId, distance, duration) for an unchanged adjacent pair", () => {
    const stops = [stop("a"), stop("b"), stop("c")];
    const previous = [realStage("a", "b", 0), realStage("b", "c", 1)];
    const next = deriveStages(stops, previous);
    expect(next[0]).toEqual({ ...previous[0], order: 0 });
    expect(next[0].routeSetId).toBe(previous[0].routeSetId);
    expect(next[0].distanceMeters).toBe(previous[0].distanceMeters);
    expect(next[1]).toEqual({ ...previous[1], order: 1 });
  });

  it("recomputes only the leg(s) whose endpoints actually changed after a reorder — never regenerating an untouched leg's routeSetId", () => {
    // a -> b -> c -> d, reorder so b moves to the end: a -> c -> d -> b
    const originalStops = [stop("a"), stop("b"), stop("c"), stop("d")];
    const previousStages = deriveStages(originalStops, [
      realStage("a", "b", 0),
      realStage("b", "c", 1),
      realStage("c", "d", 2),
    ]);
    // Sanity: previousStages should just be the same 3 real stages (no reordering has happened yet)
    expect(previousStages.every((s) => s.routeSetId.startsWith("rs_"))).toBe(true);

    const reorderedStops = reorderStops(originalStops, 1, 3); // a, c, d, b
    const nextStages = deriveStages(reorderedStops, previousStages);

    expect(nextStages).toHaveLength(3);
    // a->c is genuinely new (never existed before) — needs routing
    expect(nextStages[0].originStopId).toBe("a");
    expect(nextStages[0].destinationStopId).toBe("c");
    expect(nextStages[0].routeSetId).toBe("");
    // c->d is UNCHANGED (was already adjacent before and after) — must be
    // the exact same stage, same routeSetId, same distance/duration, only
    // `order` renumbered.
    const untouched = previousStages.find((s) => s.originStopId === "c" && s.destinationStopId === "d")!;
    expect(nextStages[1]).toEqual({ ...untouched, order: 1 });
    expect(nextStages[1].routeSetId).toBe(untouched.routeSetId);
    expect(nextStages[1].selectedRouteId).toBe(untouched.selectedRouteId);
    // d->b is genuinely new — needs routing
    expect(nextStages[2].originStopId).toBe("d");
    expect(nextStages[2].destinationStopId).toBe("b");
    expect(nextStages[2].routeSetId).toBe("");

    expect(stagesNeedingRouting(nextStages).map((s) => `${s.originStopId}->${s.destinationStopId}`)).toEqual([
      "a->c",
      "d->b",
    ]);
  });

  it("reorderStopsAndDeriveStages composes reorder + derive against a full Itinerary", () => {
    const itinerary: Itinerary = {
      id: "it1",
      title: "Test",
      stops: [stop("a"), stop("b"), stop("c")],
      stages: deriveStages([stop("a"), stop("b"), stop("c")], [realStage("a", "b", 0), realStage("b", "c", 1)]),
      routeSets: {},
      activeStageId: null,
      status: "draft",
      createdAt: "",
      updatedAt: "",
    };
    const { stops, stages } = reorderStopsAndDeriveStages(itinerary, 0, 2);
    expect(stops.map((s) => s.id)).toEqual(["b", "c", "a"]);
    // b->c is unchanged, should be preserved
    const preserved = stages.find((s) => s.originStopId === "b" && s.destinationStopId === "c");
    expect(preserved?.routeSetId).toBe("rs_b_c");
  });
});
