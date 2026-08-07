// ── itineraryStageOrder.ts — pure stop/stage ordering logic ──────────────────
// 0729E_MAPS_Itinerary_Collections_Foundation
//
// `stops` is the sole location authority and the UI's reorderable unit;
// `stages` (N-1 legs for N stops) are DERIVED from consecutive stop pairs.
// deriveStages() is the load-bearing safeguard: when a stop is added,
// removed, or reordered, it must reuse the exact existing ItineraryStage
// object (same id, same routeSetId, same fetchedAt, same distance/duration)
// for every (originStopId, destinationStopId) pair that already existed —
// never regenerating an untouched leg's route id or fetched timestamp. Only
// genuinely new adjacent pairs get a fresh stage (with no route data yet;
// the caller is responsible for triggering a real routing fetch for those).

import type { Itinerary, ItineraryStage, LocationRef, TravelMode } from "../../data/itineraryTypes";

function legKey(originStopId: string, destinationStopId: string): string {
  return `${originStopId}::${destinationStopId}`;
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Direct array reorder (splice out, splice in) — stops carry their own identity as they move, unlike Playlist's fixed-slot/moving-content model. */
export function reorderStops(stops: LocationRef[], fromIndex: number, toIndex: number): LocationRef[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= stops.length) return stops;
  const clampedTo = Math.max(0, Math.min(toIndex, stops.length - 1));
  const next = [...stops];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(clampedTo, 0, moved);
  return next;
}

export function appendStop(stops: LocationRef[], stop: LocationRef): LocationRef[] {
  return [...stops, stop];
}

export function removeStop(stops: LocationRef[], stopId: string): LocationRef[] {
  return stops.filter((s) => s.id !== stopId);
}

export function replaceStop(stops: LocationRef[], stopId: string, next: LocationRef): LocationRef[] {
  return stops.map((s) => (s.id === stopId ? next : s));
}

/**
 * Derive the N-1 stages for N stops. Any (originStopId, destinationStopId)
 * pair that already had a stage in `previousStages` is reused BY REFERENCE
 * (same object — same id/routeSetId/selectedRouteId/distance/duration) so no
 * untouched RouteSet's id or fetchedAt is ever regenerated. A pair with no
 * matching previous stage is genuinely new: it gets a fresh stage with a
 * placeholder routeSetId ("") and null distance/duration, signaling that a
 * real routing fetch is still needed for that leg only.
 */
export function deriveStages(
  stops: LocationRef[],
  previousStages: ItineraryStage[],
  defaultMode: TravelMode = "driving",
): ItineraryStage[] {
  const previousByKey = new Map<string, ItineraryStage>();
  for (const stage of previousStages) {
    previousByKey.set(legKey(stage.originStopId, stage.destinationStopId), stage);
  }

  const next: ItineraryStage[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const originStopId = stops[i].id;
    const destinationStopId = stops[i + 1].id;
    const existing = previousByKey.get(legKey(originStopId, destinationStopId));
    if (existing) {
      next.push({ ...existing, order: i });
      continue;
    }
    next.push({
      id: genId("stage"),
      order: i,
      originStopId,
      destinationStopId,
      mode: defaultMode,
      routeSetId: "", // needs-routing sentinel — caller must fetch a real RouteSet for this leg
      selectedRouteId: null,
      distanceMeters: null,
      durationSeconds: null,
    });
  }
  return next;
}

/** Stage ids that need a real routing fetch (placeholder routeSetId). */
export function stagesNeedingRouting(stages: ItineraryStage[]): ItineraryStage[] {
  return stages.filter((s) => !s.routeSetId);
}

/** Recompute stops+stages together after a reorder, preserving untouched legs. */
export function reorderStopsAndDeriveStages(itinerary: Itinerary, fromIndex: number, toIndex: number): {
  stops: LocationRef[];
  stages: ItineraryStage[];
} {
  const stops = reorderStops(itinerary.stops, fromIndex, toIndex);
  const stages = deriveStages(stops, itinerary.stages);
  return { stops, stages };
}
