// ── raceLaneStore.ts — in-memory cache over raceLaneStorage.ts ───────────────
// 0805D_MAPS_Race_Lane_Profiles_and_Smooth_Course_Sampling
//
// Mirrors raceCourseStore.ts's cache/subscribe/hydrate shape. No cross-tab
// sync (spec explicit — a lane is only ever edited from one place, its
// source course's own detail view; v1 skips the wos:*/storage-event
// mechanism entirely).
//
// REQUIRED CORRECTION (plan review): createRaceLane()/regenerateRaceLane()
// both validate the source course's readiness AND continuity BEFORE calling
// raceLaneGeneration.ts at all — a discontinuous or not-ready course is
// refused with a clear, typed error, never silently degraded into a lane.

import type { RaceCourse } from "../data/raceCourseTypes";
import type { RaceLane, RaceLanePreviewMode, RaceLaneSmoothingConfig } from "../data/raceLaneTypes";
import { RACE_LANE_DEFAULTS } from "../data/raceLaneTypes";
import {
  listRaceLanesFromDB, saveRaceLaneToDB, deleteRaceLaneFromDB,
} from "./raceLaneStorage";
import { assertRaceLaneSourceEligible, buildRaceLaneCenterline } from "../logic/maps/raceLaneGeneration";
import { buildStartGrid, buildFinishPlane } from "../logic/maps/raceLaneSampling";
import { computeRaceLaneReadiness, computeSourceCourseFingerprint } from "../logic/maps/raceLaneReadiness";

let _lanes: RaceLane[] = [];
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
const _listeners: Array<() => void> = [];

function notify(): void {
  _listeners.slice().forEach((fn) => {
    try { fn(); } catch (e) { console.warn("[raceLaneStore] subscriber threw:", e); }
  });
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

async function hydrateNow(): Promise<void> {
  _lanes = await listRaceLanesFromDB();
  _hydrated = true;
}

export function hydrate(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_hydrating) return _hydrating;
  _hydrating = hydrateNow()
    .then(() => notify())
    .catch((e) => {
      console.warn("[raceLaneStore] hydrate failed:", e);
      _hydrated = true;
      notify();
    });
  return _hydrating;
}

hydrate();

export function isHydrated(): boolean {
  return _hydrated;
}

export function listRaceLanesForCourse(courseId: string): RaceLane[] {
  return _lanes.filter((l) => l.sourceRaceCourseId === courseId);
}

export function getRaceLane(id: string): RaceLane | null {
  return _lanes.find((l) => l.id === id) ?? null;
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

async function persist(lane: RaceLane): Promise<void> {
  await saveRaceLaneToDB(lane);
  const i = _lanes.findIndex((l) => l.id === lane.id);
  if (i === -1) _lanes = [..._lanes, lane];
  else _lanes = _lanes.map((l, idx) => (idx === i ? lane : l));
  notify();
}

export type RaceLaneConfigOverrides = Partial<{
  name: string;
  laneCount: number;
  laneWidthMeters: number;
  sampleSpacingMeters: number;
  tension: number;
  cornerProtectionMeters: number;
  surfaceClearanceMeters: number;
  previewMode: RaceLanePreviewMode;
}>;

function resolveSmoothing(overrides: RaceLaneConfigOverrides): RaceLaneSmoothingConfig {
  return {
    method: "catmull_rom",
    sampleSpacingMeters: overrides.sampleSpacingMeters ?? RACE_LANE_DEFAULTS.sampleSpacingMeters,
    tension: overrides.tension ?? RACE_LANE_DEFAULTS.tension,
    cornerProtectionMeters: overrides.cornerProtectionMeters ?? RACE_LANE_DEFAULTS.cornerProtectionMeters,
  };
}

function assembleLane(
  id: string,
  name: string,
  course: RaceCourse,
  overrides: RaceLaneConfigOverrides,
  createdAt: number,
): RaceLane {
  const smoothing = resolveSmoothing(overrides);
  const laneCount = overrides.laneCount ?? RACE_LANE_DEFAULTS.laneCount;
  const laneWidthMeters = overrides.laneWidthMeters ?? RACE_LANE_DEFAULTS.laneWidthMeters;
  const surfaceClearanceMeters = overrides.surfaceClearanceMeters ?? RACE_LANE_DEFAULTS.surfaceClearanceMeters;
  const previewMode = overrides.previewMode ?? RACE_LANE_DEFAULTS.previewMode;

  const { sampledCenterline, totalDistanceMeters } = buildRaceLaneCenterline(course, smoothing);
  const startGrid = buildStartGrid({ sampledCenterline, laneCount, laneWidthMeters });
  const finishPlane = buildFinishPlane({ sampledCenterline, laneCount, laneWidthMeters, totalDistanceMeters });

  const now = Date.now();
  const candidate: RaceLane = {
    id,
    name,
    sourceRaceCourseId: course.id,
    sourceRaceCourseName: course.name,
    sourceCourseFingerprint: computeSourceCourseFingerprint(course),
    laneCount,
    laneWidthMeters,
    centerlineSmoothing: smoothing,
    sampledCenterline,
    totalDistanceMeters,
    startGrid,
    finishPlane,
    previewMode,
    surfaceClearanceMeters,
    readiness: { ready: false, presentationReady: false, runtimeReady: false, reasons: [], diagnostics: {
      sourceDistanceMeters: 0, sampledDistanceMeters: 0, distanceDeltaMeters: 0, sampleCount: 0,
      meanSampleSpacingMeters: 0, maxSampleSpacingMeters: 0, laneCount, totalLaneWidthMeters: 0,
      sharpestTurnRadiusMeters: null, offsetIntersectionCount: 0,
    } }, // overwritten immediately below from full readiness
    createdAt,
    updatedAt: now,
  };
  const readiness = computeRaceLaneReadiness(candidate, course);
  return { ...candidate, readiness };
}

export async function createRaceLane(course: RaceCourse, overrides: RaceLaneConfigOverrides = {}): Promise<RaceLane> {
  // Required correction: refuse BEFORE generation is attempted — never a
  // "generate anyway, flag it" path for a discontinuous/not-ready/archived
  // source course.
  assertRaceLaneSourceEligible(course);
  const now = Date.now();
  const lane = assembleLane(genId("lane"), overrides.name?.trim() || `${course.name} Lane`, course, overrides, now);
  await persist(lane);
  return lane;
}

export async function regenerateRaceLane(
  id: string,
  course: RaceCourse,
  overrides: RaceLaneConfigOverrides = {},
): Promise<RaceLane | null> {
  const current = _lanes.find((l) => l.id === id);
  if (!current) return null;
  // Re-validate against the CURRENT source course — a course that became
  // discontinuous or was archived after the lane was first created blocks
  // regeneration too, same as a brand-new creation would be blocked.
  assertRaceLaneSourceEligible(course);
  const mergedOverrides: RaceLaneConfigOverrides = {
    name: current.name,
    laneCount: current.laneCount,
    laneWidthMeters: current.laneWidthMeters,
    sampleSpacingMeters: current.centerlineSmoothing.sampleSpacingMeters,
    tension: current.centerlineSmoothing.tension,
    cornerProtectionMeters: current.centerlineSmoothing.cornerProtectionMeters,
    surfaceClearanceMeters: current.surfaceClearanceMeters,
    previewMode: current.previewMode,
    ...overrides,
  };
  const next = assembleLane(current.id, mergedOverrides.name ?? current.name, course, mergedOverrides, current.createdAt);
  await persist(next);
  return next;
}

export async function renameRaceLane(id: string, name: string): Promise<RaceLane | null> {
  const current = _lanes.find((l) => l.id === id);
  if (!current) return null;
  const next = { ...current, name, updatedAt: Date.now() };
  await persist(next);
  return next;
}

export async function setRaceLanePreviewMode(id: string, previewMode: RaceLanePreviewMode): Promise<RaceLane | null> {
  const current = _lanes.find((l) => l.id === id);
  if (!current) return null;
  const next = { ...current, previewMode, updatedAt: Date.now() };
  await persist(next);
  return next;
}

export async function duplicateRaceLane(id: string): Promise<RaceLane | null> {
  const current = _lanes.find((l) => l.id === id);
  if (!current) return null;
  const now = Date.now();
  const next: RaceLane = {
    ...current,
    id: genId("lane"),
    name: `${current.name} (Copy)`,
    sampledCenterline: current.sampledCenterline.map((s) => ({ ...s, center: [...s.center] as [number, number] })),
    startGrid: {
      ...current.startGrid,
      slots: current.startGrid.slots.map((s) => ({ ...s, coordinate: [...s.coordinate] as [number, number] })),
    },
    finishPlane: { ...current.finishPlane, coordinate: [...current.finishPlane.coordinate] as [number, number] },
    createdAt: now,
    updatedAt: now,
  };
  await persist(next);
  return next;
}

export async function deleteRaceLane(id: string): Promise<void> {
  await deleteRaceLaneFromDB(id);
  _lanes = _lanes.filter((l) => l.id !== id);
  notify();
}
