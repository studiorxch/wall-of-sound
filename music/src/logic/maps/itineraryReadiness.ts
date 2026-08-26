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
  const allStagesComplete = itinerary.stages.every((stage) => {
    // 0819_SUBWAY_Itinerary_Execution_Map_Authoring — a transit stage never
    // uses routeSetId (see itineraryStore.ts's applyStageTransitLeg); it is
    // "complete" once a real resolution attempt has landed, success or
    // honest failure — matching the same "an empty result still counts as
    // fetched" rule DRIVE already applies via a real (if empty) RouteSet id.
    if (stage.mode === "transit") return stage.transitLeg != null || stage.transitUnresolvedReason != null;
    return stage.routeSetId !== "" && stage.distanceMeters != null && stage.durationSeconds != null;
  });
  return allStagesComplete ? "ready" : "incomplete";
}
