// ── itineraryReadiness.ts — derived data-completeness, separate from lifecycle ─
// 0729E_MAPS_Itinerary_Collections_Foundation
//
// `computeReadiness()` is NEVER stored — it answers "is the data complete?"
// independently of `Itinerary.status`, which answers "what phase is this
// itinerary in?" (a stored, lifecycle-driven field). An itinerary can be
// `status: "draft"` and readiness `"ready"` at the same time; the two must
// never be conflated into one enum.

import type { Itinerary, ItineraryReadiness } from "../../data/itineraryTypes";

export function computeReadiness(itinerary: Itinerary): ItineraryReadiness {
  if (itinerary.stops.length < 2 || itinerary.stages.length === 0) return "incomplete";
  const allStagesComplete = itinerary.stages.every(
    (stage) => stage.routeSetId !== "" && stage.distanceMeters != null && stage.durationSeconds != null,
  );
  return allStagesComplete ? "ready" : "incomplete";
}
