// ── raceCourseStore.ts — in-memory cache over raceCourseStorage.ts ───────────
// 0805C_MAPS_Race_Course_Library_and_Itinerary_Conversion
//
// Same synchronous list()/subscribe(fn) calling shape as itineraryStore.ts.
// The one genuinely new piece of this codebase: real cross-tab
// synchronization for a MUSIC-native (non-wall-bridge) store, for the
// "exactly one active Race Course" requirement.
//
// Cross-tab design (per plan review's required corrections):
//   - The canonical authority for "which course is active" is ONE row in
//     raceCourseStorage.ts's `meta` object store (activeRaceCourseId) — never
//     independent `active:true/false` writes across course records.
//   - A `wos:raceCourse:activeId` localStorage write is a WAKE-UP SIGNAL
//     only, never itself trusted as truth. On receiving it from another tab,
//     this module fully re-hydrates (re-reads every course AND the canonical
//     active-id row fresh from IndexedDB) before calling notify() — a stale
//     in-memory cache is never treated as "synchronized" just because a
//     pointer arrived.

import type { Itinerary } from "../data/itineraryTypes";
import type { RaceCourse } from "../data/raceCourseTypes";
import {
  RACE_COURSE_TARGET_DURATION_MIN_MINUTES,
  RACE_COURSE_TARGET_DURATION_MAX_MINUTES,
} from "../data/raceCourseTypes";
import {
  listRaceCoursesFromDB, saveRaceCourseToDB, deleteRaceCourseFromDB,
  getActiveRaceCourseId, setActiveRaceCourseId,
} from "./raceCourseStorage";
import { buildRaceCourseFromItinerary } from "../logic/maps/raceCourseConversion";
import { computeRaceCourseReadiness } from "../logic/maps/raceCourseReadiness";

const CROSS_TAB_KEY = "wos:raceCourse:activeId";

let _courses: RaceCourse[] = [];
let _activeRaceCourseId: string | null = null;
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
const _listeners: Array<() => void> = [];

function notify(): void {
  _listeners.slice().forEach((fn) => {
    try { fn(); } catch (e) { console.warn("[raceCourseStore] subscriber threw:", e); }
  });
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

async function hydrateNow(): Promise<void> {
  const [records, activeId] = await Promise.all([listRaceCoursesFromDB(), getActiveRaceCourseId()]);
  _courses = records;
  _activeRaceCourseId = activeId;
  _hydrated = true;
}

export function hydrate(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_hydrating) return _hydrating;
  _hydrating = hydrateNow()
    .then(() => notify())
    .catch((e) => {
      console.warn("[raceCourseStore] hydrate failed:", e);
      _hydrated = true; // fail open to an empty list, don't retry forever
      notify();
    });
  return _hydrating;
}

hydrate();

// Cross-tab signal listener — required correction: a genuine full re-read of
// IndexedDB (courses + the canonical active-id row), not a narrow patch onto
// a possibly-stale cache. The other tab may have created/duplicated/archived
// records too, not just changed which one is active.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CROSS_TAB_KEY || !e.newValue) return;
    hydrateNow()
      .then(() => notify())
      .catch((err) => console.warn("[raceCourseStore] cross-tab rehydrate failed:", err));
  });
}

function stamp(course: RaceCourse): RaceCourse {
  return { ...course, active: course.id === _activeRaceCourseId };
}

export function isHydrated(): boolean {
  return _hydrated;
}

export function listRaceCourses(): RaceCourse[] {
  return _courses.map(stamp);
}

export function getRaceCourse(id: string): RaceCourse | null {
  const found = _courses.find((c) => c.id === id);
  return found ? stamp(found) : null;
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

async function persist(course: RaceCourse): Promise<void> {
  await saveRaceCourseToDB(course);
  const i = _courses.findIndex((c) => c.id === course.id);
  if (i === -1) _courses = [..._courses, course];
  else _courses = _courses.map((c, idx) => (idx === i ? course : c));
  notify();
}

function broadcastActiveIdChange(id: string | null): void {
  try {
    localStorage.setItem(CROSS_TAB_KEY, JSON.stringify({ id, updatedAt: Date.now() }));
  } catch {
    /* best-effort — cross-tab wake-up signal only, not load-bearing for this tab's own state */
  }
}

export async function createRaceCourseFromItinerary(itinerary: Itinerary, name?: string): Promise<RaceCourse> {
  const { course } = buildRaceCourseFromItinerary(itinerary, name);
  await persist(course);
  return stamp(course);
}

export async function renameRaceCourse(id: string, name: string): Promise<RaceCourse | null> {
  const current = _courses.find((c) => c.id === id);
  if (!current) return null;
  const next = { ...current, name, updatedAt: Date.now() };
  await persist(next);
  return stamp(next);
}

export async function duplicateRaceCourse(id: string): Promise<RaceCourse | null> {
  const current = _courses.find((c) => c.id === id);
  if (!current) return null;
  const now = Date.now();
  // Deep-clone every nested structure — a duplicate must never share array
  // references with its source (rename/re-order on one must never touch the
  // other). Never active by construction (activity is derived from the
  // canonical pointer, never copied).
  const next: RaceCourse = {
    ...current,
    id: genId("race"),
    name: `${current.name} (Copy)`,
    geometry: { type: "LineString", coordinates: current.geometry.coordinates.map((c) => [...c] as [number, number]) },
    startLine: { ...current.startLine },
    finishLine: { ...current.finishLine },
    checkpoints: current.checkpoints.map((cp) => ({ ...cp })),
    sections: current.sections.map((s) => ({ ...s })),
    continuity: {
      continuous: current.continuity.continuous,
      discontinuities: current.continuity.discontinuities.map((d) => ({ ...d })),
    },
    active: false,
    createdAt: now,
    updatedAt: now,
  };
  await persist(next);
  return stamp(next);
}

export async function archiveRaceCourse(id: string): Promise<RaceCourse | null> {
  const current = _courses.find((c) => c.id === id);
  if (!current) return null;
  const wasActive = _activeRaceCourseId === id;
  const next = { ...current, status: "archived" as const, updatedAt: Date.now() };
  await persist(next);
  // An archived course can never remain the active one — clear the single
  // canonical pointer, not a per-record flag.
  if (wasActive) {
    await setActiveRaceCourseId(null);
    _activeRaceCourseId = null;
    broadcastActiveIdChange(null);
  }
  notify();
  return stamp(next);
}

export async function restoreRaceCourse(id: string): Promise<RaceCourse | null> {
  const current = _courses.find((c) => c.id === id);
  if (!current) return null;
  // Archived status told us nothing about current data quality — recompute
  // readiness fresh rather than assuming "ready" just because it's no longer
  // archived.
  const readiness = computeRaceCourseReadiness({ ...current, status: "ready" });
  const next = { ...current, status: (readiness.ready ? "ready" : "needs_review") as RaceCourse["status"], updatedAt: Date.now() };
  await persist(next);
  return stamp(next);
}

export async function setTargetDurationMinutes(id: string, minutes: number | null): Promise<RaceCourse | null> {
  const current = _courses.find((c) => c.id === id);
  if (!current) return null;
  const clamped =
    minutes == null
      ? null
      : Math.min(RACE_COURSE_TARGET_DURATION_MAX_MINUTES, Math.max(RACE_COURSE_TARGET_DURATION_MIN_MINUTES, minutes));
  const next = { ...current, targetDurationMinutes: clamped, updatedAt: Date.now() };
  await persist(next);
  return stamp(next);
}

export interface ActivateRaceCourseResult {
  ok: boolean;
  reason?: "not_found" | "not_ready" | "archived";
}

// The ONE write path for changing which course is active — a single write to
// the canonical meta row, never N writes across course records. This is what
// makes "exactly zero or one active course" structural rather than a
// convention that has to be maintained by every caller.
export async function activateRaceCourse(id: string): Promise<ActivateRaceCourseResult> {
  const current = _courses.find((c) => c.id === id);
  if (!current) return { ok: false, reason: "not_found" };
  if (current.status === "archived") return { ok: false, reason: "archived" };
  const readiness = computeRaceCourseReadiness(stamp(current));
  if (!readiness.ready) return { ok: false, reason: "not_ready" };

  await setActiveRaceCourseId(id);
  _activeRaceCourseId = id;
  broadcastActiveIdChange(id);
  notify();
  return { ok: true };
}

export async function deleteRaceCourse(id: string): Promise<void> {
  const wasActive = _activeRaceCourseId === id;
  await deleteRaceCourseFromDB(id);
  _courses = _courses.filter((c) => c.id !== id);
  if (wasActive) {
    await setActiveRaceCourseId(null);
    _activeRaceCourseId = null;
    broadcastActiveIdChange(null);
  }
  notify();
}
