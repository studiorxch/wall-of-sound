// ── itineraryStore.ts — in-memory cache over itineraryStorage.ts ─────────────
// 0729E_MAPS_Itinerary_Collections_Foundation
//
// Not a wall/ bridge (no window.SBE.* authority) — Itinerary has no wall/-side
// runtime consumer in this build. Exposes the same synchronous
// list()/subscribe(fn) calling shape MapsSidebar.tsx already uses for the
// wall bridges, so its wiring pattern stays consistent even though this is a
// plain IndexedDB-backed cache, not a cross-tab wall authority.

import type { Itinerary, ItineraryStage, LocationRef, RouteSet, TravelMode } from "../data/itineraryTypes";
import {
  listItinerariesFromDB,
  saveItineraryToDB,
  deleteItineraryFromDB,
} from "./itineraryStorage";
import { deriveStages, reorderStops } from "../logic/maps/itineraryStageOrder";

let _itineraries: Itinerary[] = [];
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
const _listeners: Array<() => void> = [];

function notify(): void {
  _listeners.slice().forEach((fn) => {
    try { fn(); } catch (e) { console.warn("[itineraryStore] subscriber threw:", e); }
  });
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

export function hydrate(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_hydrating) return _hydrating;
  _hydrating = listItinerariesFromDB()
    .then((records) => {
      _itineraries = records;
      _hydrated = true;
      notify();
    })
    .catch((e) => {
      console.warn("[itineraryStore] hydrate failed:", e);
      _hydrated = true; // don't retry forever on a genuine IndexedDB failure — fail open to an empty list
      notify();
    });
  return _hydrating;
}

// Kick off hydration immediately on module load — mirrors the wall
// authorities' "self-init at script load" pattern.
hydrate();

export function isHydrated(): boolean {
  return _hydrated;
}

export function listItineraries(): Itinerary[] {
  return _itineraries;
}

export function getItinerary(id: string): Itinerary | null {
  return _itineraries.find((it) => it.id === id) ?? null;
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

async function persist(itinerary: Itinerary): Promise<void> {
  await saveItineraryToDB(itinerary);
  const i = _itineraries.findIndex((it) => it.id === itinerary.id);
  if (i === -1) _itineraries = [..._itineraries, itinerary];
  else _itineraries = _itineraries.map((it, idx) => (idx === i ? itinerary : it));
  notify();
}

export async function createItinerary(title: string): Promise<Itinerary> {
  const now = new Date().toISOString();
  const itinerary: Itinerary = {
    id: genId("itin"),
    title,
    stops: [],
    stages: [],
    routeSets: {},
    activeStageId: null,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  await persist(itinerary);
  return itinerary;
}

export async function deleteItinerary(id: string): Promise<void> {
  await deleteItineraryFromDB(id);
  _itineraries = _itineraries.filter((it) => it.id !== id);
  notify();
}

/** Generic update — applies `updater` to the current record and persists the result. */
export async function updateItinerary(
  id: string,
  updater: (itinerary: Itinerary) => Itinerary,
): Promise<Itinerary | null> {
  const current = getItinerary(id);
  if (!current) return null;
  const next = { ...updater(current), updatedAt: new Date().toISOString() };
  await persist(next);
  return next;
}

/** Rename convenience — used by the Itineraries grid/editor title field. */
export async function renameItinerary(id: string, title: string): Promise<Itinerary | null> {
  return updateItinerary(id, (it) => ({ ...it, title }));
}

/**
 * Reorder stops and re-derive stages, preserving every untouched leg's exact
 * RouteSet/routeSetId/selectedRouteId/distance/duration — only genuinely new
 * adjacent pairs get a fresh (needs-routing) stage. Callers are responsible
 * for fetching real route data for any stage this leaves with routeSetId="".
 */
export async function reorderItineraryStops(
  id: string,
  fromIndex: number,
  toIndex: number,
): Promise<Itinerary | null> {
  return updateItinerary(id, (it) => {
    const stops = reorderStops(it.stops, fromIndex, toIndex);
    const stages = deriveStages(stops, it.stages);
    return { ...it, stops, stages };
  });
}

export async function addItineraryStop(id: string, stop: LocationRef): Promise<Itinerary | null> {
  return updateItinerary(id, (it) => {
    const stops = [...it.stops, stop];
    const stages = deriveStages(stops, it.stages);
    return { ...it, stops, stages };
  });
}

export async function removeItineraryStop(id: string, stopId: string): Promise<Itinerary | null> {
  return updateItinerary(id, (it) => {
    const stops = it.stops.filter((s) => s.id !== stopId);
    const stages = deriveStages(stops, it.stages);
    return { ...it, stops, stages };
  });
}

/**
 * Change one stage's travel mode. Since a RouteSet is mode-specific, this
 * resets that stage back to the needs-routing sentinel — callers must fetch
 * a fresh RouteSet for the new mode. Every other stage is untouched.
 */
export async function updateStageMode(id: string, stageId: string, mode: TravelMode): Promise<Itinerary | null> {
  return updateItinerary(id, (it) => ({
    ...it,
    stages: it.stages.map((s) =>
      s.id === stageId
        ? { ...s, mode, routeSetId: "", selectedRouteId: null, distanceMeters: null, durationSeconds: null }
        : s,
    ),
  }));
}

/** Attach real routing results (RouteSet + resolved distance/duration) to one stage, without touching any other stage. */
export async function applyStageRouteSet(
  id: string,
  stageId: string,
  routeSet: RouteSet,
): Promise<Itinerary | null> {
  return updateItinerary(id, (it) => {
    const selected = routeSet.routes[0];
    const stages: ItineraryStage[] = it.stages.map((s) =>
      s.id === stageId
        ? {
            ...s,
            routeSetId: routeSet.id,
            selectedRouteId: selected?.id ?? null,
            distanceMeters: selected?.distanceMeters ?? null,
            durationSeconds: selected?.durationSeconds ?? null,
          }
        : s,
    );
    return { ...it, stages, routeSets: { ...it.routeSets, [routeSet.id]: routeSet } };
  });
}
