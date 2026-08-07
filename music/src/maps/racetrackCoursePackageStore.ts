// ── racetrackCoursePackageStore.ts — cache + publish over the package DB ─────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// publishCoursePackage() is genuinely idempotent: recompiling an unchanged
// source course produces an identical sourceRaceCourseFingerprint, so it
// reuses the latest existing version rather than minting a needless new one.
// A real source change (a new fingerprint) always creates a new, immutable
// version — never an in-place edit of a published package.
//
// After a successful publish, the slim pointer {id,version,fingerprint,
// updatedAt} — never the full package — is written to
// `wos:racetrack:coursePackage:pointer` localStorage as wall/'s change
// signal (required correction from plan review: the full package lives only
// in same-origin IndexedDB, never duplicated into localStorage).

import type { RaceCourse } from "../data/raceCourseTypes";
import type { RaceLane } from "../data/raceLaneTypes";
import type { RacetrackCoursePackage, RacetrackCoursePackagePointer } from "../data/racetrackCoursePackageTypes";
import { listRacetrackCoursePackagesFromDB, saveRacetrackCoursePackageToDB } from "./racetrackCoursePackageStorage";
import { compileRacetrackCoursePackage } from "../logic/maps/racetrackCoursePackageCompiler";

const POINTER_KEY = "wos:racetrack:coursePackage:pointer";

let _packages: RacetrackCoursePackage[] = [];
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
const _listeners: Array<() => void> = [];

function notify(): void {
  _listeners.slice().forEach((fn) => {
    try { fn(); } catch (e) { console.warn("[racetrackCoursePackageStore] subscriber threw:", e); }
  });
}

async function hydrateNow(): Promise<void> {
  _packages = await listRacetrackCoursePackagesFromDB();
  _hydrated = true;
}

export function hydrate(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_hydrating) return _hydrating;
  _hydrating = hydrateNow()
    .then(() => notify())
    .catch((e) => {
      console.warn("[racetrackCoursePackageStore] hydrate failed:", e);
      _hydrated = true;
      notify();
    });
  return _hydrating;
}

hydrate();

export function isHydrated(): boolean {
  return _hydrated;
}

export function listCoursePackagesForCourse(sourceRaceCourseId: string): RacetrackCoursePackage[] {
  return _packages
    .filter((p) => p.sourceRaceCourseId === sourceRaceCourseId)
    .slice()
    .sort((a, b) => a.version - b.version);
}

export function getLatestCoursePackageForCourse(sourceRaceCourseId: string): RacetrackCoursePackage | null {
  const versions = listCoursePackagesForCourse(sourceRaceCourseId);
  return versions.length > 0 ? versions[versions.length - 1] : null;
}

// 0805H — THE single deterministic "which package is newer" rule for the
// RACETRACK Selection course pager: dedup, list ordering, and
// default-selection fallback (wall/'s racetrackSessionRuntime.js) all use
// this exact comparator so they can never disagree. publishedAt is the
// primary signal; version is the secondary signal (guards against two
// publishes landing in the same millisecond); id is the final, always-
// decisive tiebreak.
export function compareRacetrackCoursePackagesNewestFirst(
  a: RacetrackCoursePackage,
  b: RacetrackCoursePackage,
): number {
  const byPublishedAt = (b.publishedAt ?? 0) - (a.publishedAt ?? 0);
  if (byPublishedAt !== 0) return byPublishedAt;
  const byVersion = b.version - a.version;
  if (byVersion !== 0) return byVersion;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// "Current" = one entry per sourceRaceCourseId, its newest version only —
// this is what the Selection scene's course pager cycles through. Historical
// versions are excluded from this list but remain fully retained/loadable
// elsewhere (loadRacetrackCoursePackageFromDB(id) / wall/'s
// getCoursePackageById(id), used by session-snapshot restoration) — this
// function has no bearing on retention, only on what the live pager shows.
export function selectCurrentPublishedRacetrackCoursePackages(
  all: RacetrackCoursePackage[],
): RacetrackCoursePackage[] {
  const currentByCourse = new Map<string, RacetrackCoursePackage>();
  for (const p of all) {
    if (p.publishedAt == null) continue;
    const existing = currentByCourse.get(p.sourceRaceCourseId);
    if (!existing || compareRacetrackCoursePackagesNewestFirst(p, existing) < 0) {
      currentByCourse.set(p.sourceRaceCourseId, p);
    }
  }
  return Array.from(currentByCourse.values()).sort(compareRacetrackCoursePackagesNewestFirst);
}

export function listCurrentPublishedRacetrackCoursePackages(): RacetrackCoursePackage[] {
  return selectCurrentPublishedRacetrackCoursePackages(_packages);
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}

function writePointer(pkg: RacetrackCoursePackage): void {
  const pointer: RacetrackCoursePackagePointer = {
    id: pkg.id,
    version: pkg.version,
    fingerprint: pkg.sourceRaceCourseFingerprint,
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(POINTER_KEY, JSON.stringify(pointer));
  } catch {
    /* best-effort signal — wall/ will still pick up the package on its next explicit hydrate */
  }
}

export async function publishCoursePackage(course: RaceCourse, lane: RaceLane): Promise<RacetrackCoursePackage> {
  const latest = getLatestCoursePackageForCourse(course.id);
  const candidateFingerprint = course.sourceFingerprint ?? "";

  if (latest && latest.sourceRaceCourseFingerprint === candidateFingerprint) {
    // Genuinely idempotent: the source hasn't changed since the last
    // published version — republish (re-signal) the SAME version rather
    // than minting a needless new one.
    writePointer(latest);
    return latest;
  }

  const compiled = compileRacetrackCoursePackage(course, lane);
  const nextVersion = latest ? latest.version + 1 : 1;
  const published: RacetrackCoursePackage = { ...compiled, version: nextVersion, publishedAt: Date.now() };

  await saveRacetrackCoursePackageToDB(published);
  _packages = [..._packages, published];
  notify();
  writePointer(published);
  return published;
}
