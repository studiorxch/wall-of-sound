// ── racetrackCoursePackageStorage.ts — IndexedDB backend for Course Packages ─
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// Same hand-rolled pattern as raceCourseStorage.ts. UNLIKE every other
// MUSIC-native store this session, this one is genuinely SAME-ORIGIN SHARED
// with wall/ (per plan review's required correction) — wall/'s
// racetrackCoursePackageRuntime.js opens this exact database directly
// (same-origin via the /wall-app Vite proxy) and reads it read-only. There
// is no shared TypeScript type across that boundary (wall/ is plain JS), so
// this file's DB_NAME/DB_VERSION/PACKAGE_STORE/keyPath ARE the schema
// contract — wall/'s reader must match them exactly. If you change any of
// these three constants, update the matching constants documented at the
// top of wall/systems/presentation/racetrackCoursePackageRuntime.js too.

import type { RacetrackCoursePackage } from "../data/racetrackCoursePackageTypes";

export const DB_NAME = "MAPS_RACETRACK_PACKAGE_DB";
export const DB_VERSION = 1;
export const PACKAGE_STORE = "racetrackPackages"; // keyPath: "id"

let _db: IDBDatabase | null = null;

export function openRacetrackCoursePackageDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PACKAGE_STORE)) {
        db.createObjectStore(PACKAGE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`[RACETRACK CoursePackage] IndexedDB open failed: ${req.error?.message}`));
  });
}

function idbGetAll(db: IDBDatabase): Promise<RacetrackCoursePackage[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(PACKAGE_STORE, "readonly").objectStore(PACKAGE_STORE).getAll();
    req.onsuccess = () => resolve(req.result as RacetrackCoursePackage[]);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<RacetrackCoursePackage | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(PACKAGE_STORE, "readonly").objectStore(PACKAGE_STORE).get(id);
    req.onsuccess = () => resolve((req.result as RacetrackCoursePackage) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: RacetrackCoursePackage): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(PACKAGE_STORE, "readwrite").objectStore(PACKAGE_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listRacetrackCoursePackagesFromDB(): Promise<RacetrackCoursePackage[]> {
  const db = await openRacetrackCoursePackageDB();
  return idbGetAll(db);
}

export async function loadRacetrackCoursePackageFromDB(id: string): Promise<RacetrackCoursePackage | null> {
  const db = await openRacetrackCoursePackageDB();
  return idbGet(db, id);
}

// REQUIRED CORRECTION (0805G): a published Course Package can never be
// overwritten with different content — enforced HERE, at the storage
// boundary, not left to caller discipline. An identical re-save (the
// genuine "unchanged republish reuses the existing record" case —
// racetrackCoursePackageStore.ts's publishCoursePackage() already avoids
// even calling this when the fingerprint is unchanged, but a byte-identical
// re-save from any future caller is still harmless) is a no-op-equivalent
// put; any attempt to save DIFFERENT content under an id that already
// exists throws instead of silently mutating an immutable record. This is
// what makes session-snapshot restoration (racetrackSessionSnapshotStorage.js,
// wall/-side) safe to trust a saved {id,version,fingerprint} reference
// against, indefinitely.
//
// Extracted as a pure, DOM/IndexedDB-free function so the enforcement LOGIC
// itself is genuinely unit-testable — this codebase has no fake-indexeddb
// infrastructure for any store (an established precedent, not an oversight
// here), so saveRacetrackCoursePackageToDB's own IDB plumbing stays
// live-verification-only, same as every other *StorageToDB function in
// this codebase.
//
// RETENTION INVARIANT (0805G, required addition): every published package
// record in this store is PERMANENT app history — there is no deletion or
// cleanup workflow anywhere in this codebase, and none is added here. A
// package must stay retrievable by id forever, because a durable session
// snapshot (racetrackSessionSnapshotStorage.js, wall/-side) may reference
// any past version by exactly that id long after a newer version has been
// published and become "active." If a future build ever adds cleanup, it
// must NOT delete-by-age or "keep only latest N" — it must first confirm a
// candidate id is unreferenced by BOTH the active pointer
// (wos:racetrack:coursePackage:pointer) AND every persisted row in
// RACETRACK_SESSION_DB's coursePackageRef.id (wall/-side). Restoration must
// never substitute the currently-active package for a missing/mismatched
// id — see racetrackSessionRuntime.js's restore-on-boot, which falls back
// to Selection rather than silently swapping in a different package.
export function isImmutablePackageOverwriteAttempt(
  existing: RacetrackCoursePackage | null,
  incoming: RacetrackCoursePackage,
): boolean {
  if (!existing) return false;
  return JSON.stringify(existing) !== JSON.stringify(incoming);
}

export async function saveRacetrackCoursePackageToDB(record: RacetrackCoursePackage): Promise<void> {
  const db = await openRacetrackCoursePackageDB();
  const existing = await idbGet(db, record.id);
  if (isImmutablePackageOverwriteAttempt(existing, record)) {
    throw new Error(
      `[RACETRACK CoursePackage] refusing to overwrite immutable package "${record.id}" (v${existing!.version}) with different content — a real source change must compile a new id/version, never mutate an existing published record.`,
    );
  }
  await idbPut(db, record);
}
