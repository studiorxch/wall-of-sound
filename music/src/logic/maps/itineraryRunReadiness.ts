// ── itineraryRunReadiness ─────────────────────────────────────────────────────
// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal
//
// Reason-coded "can this itinerary actually be run?" gate — deliberately
// separate from itineraryReadiness.ts's computeReadiness() (a coarse editing-
// time boolean, already covered by pinned tests, with no reason codes). This
// is the run-specific preflight check the spec requires, and the function
// that also builds the immutable ItineraryRunPayload MUSIC sends across
// contexts to the wall/-side runner.

import type { Itinerary, ItineraryStage, Route } from "../../data/itineraryTypes";
import { ROUTABLE_MODES } from "../../data/itineraryTypes";
import type {
  ItineraryRunPayload, ItineraryRunStageInput, RunBlockReason, RunReadinessResult,
} from "../../data/itineraryRunTypes";

function isValidGeometry(route: Route | undefined): route is Route {
  if (!route) return false;
  const coords = route.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  return coords.every((c) => Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]));
}

// Exported (0805C) so raceCourseConversion.ts resolves a stage's selected
// Route via the exact same function — one canonical resolution path, never a
// duplicated copy that could drift.
export function resolveSelectedRoute(itinerary: Itinerary, stage: ItineraryStage): Route | undefined {
  const routeSet = itinerary.routeSets[stage.routeSetId];
  if (!routeSet) return undefined;
  return routeSet.routes.find((r) => r.id === stage.selectedRouteId);
}

// alreadyRunning: true when a run-lock is already held for a DIFFERENT
// itinerary than the one being checked — surfaces run_already_active as a
// real, distinguishable reason rather than a silent no-op.
export function computeRunReadiness(itinerary: Itinerary, alreadyRunning = false): RunReadinessResult {
  const reasons: RunBlockReason[] = [];

  if (alreadyRunning) reasons.push("run_already_active");
  if (itinerary.stops.length < 2 || itinerary.stages.length === 0) {
    reasons.push("missing_stage");
    return { ready: false, reasons };
  }

  for (const stage of itinerary.stages) {
    if (!ROUTABLE_MODES.includes(stage.mode)) {
      if (!reasons.includes("unsupported_mode")) reasons.push("unsupported_mode");
      continue;
    }
    const route = resolveSelectedRoute(itinerary, stage);
    if (!route) {
      if (!reasons.includes("missing_selected_route")) reasons.push("missing_selected_route");
      continue;
    }
    if (!isValidGeometry(route) || !(stage.distanceMeters! > 0) || !(stage.durationSeconds! > 0)) {
      if (!reasons.includes("invalid_geometry")) reasons.push("invalid_geometry");
    }
  }

  return { ready: reasons.length === 0, reasons };
}

// Builds the immutable run payload — only called once ready === true.
// Returns null if called on a non-ready itinerary (defensive; callers should
// always gate on computeRunReadiness().ready first).
export function buildItineraryRunPayload(itinerary: Itinerary): ItineraryRunPayload | null {
  const { ready } = computeRunReadiness(itinerary);
  if (!ready) return null;

  const stages: ItineraryRunStageInput[] = itinerary.stages
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((stage) => {
      const route = resolveSelectedRoute(itinerary, stage)!;
      return {
        stageId: stage.id,
        originStopId: stage.originStopId,
        destinationStopId: stage.destinationStopId,
        mode: stage.mode as "driving" | "walking" | "cycling",
        routeSetId: stage.routeSetId,
        routeId: route.id,
        geometry: route.geometry,
        distanceMeters: stage.distanceMeters!,
        durationSeconds: stage.durationSeconds!,
      };
    });

  return {
    itineraryId: itinerary.id,
    title: itinerary.title,
    stages,
    builtAt: new Date().toISOString(),
  };
}
