// ── raceLaneStorage.ts — IndexedDB backend for Race Lane records ─────────────
// 0805D_MAPS_Race_Lane_Profiles_and_Smooth_Course_Sampling
//
// A dedicated, physically separate IndexedDB ("MAPS_RACE_LANE_DB") — a lane
// is a genuinely separate lifecycle object from its source Race Course (it
// gets regenerated far more often, via an explicit Regenerate action), so it
// gets its own DB rather than folding into MAPS_RACE_COURSE_DB. Same
// raw-promise-over-IDBRequest shape as raceCourseStorage.ts. Only ONE object
// store — a lane has no "exactly one active" concept to guard (that's a
// Race Course concern only), so no `meta` store is needed here.

import type { RaceLane } from "../data/raceLaneTypes";

const DB_NAME = "MAPS_RACE_LANE_DB";
const DB_VERSION = 1;
const LANE_STORE = "raceLanes";

let _db: IDBDatabase | null = null;

export function openRaceLaneDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(LANE_STORE)) {
        db.createObjectStore(LANE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`[MAPS RaceLane] IndexedDB open failed: ${req.error?.message}`));
  });
}

function idbGetAll(db: IDBDatabase): Promise<RaceLane[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(LANE_STORE, "readonly").objectStore(LANE_STORE).getAll();
    req.onsuccess = () => resolve(req.result as RaceLane[]);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<RaceLane | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(LANE_STORE, "readonly").objectStore(LANE_STORE).get(id);
    req.onsuccess = () => resolve((req.result as RaceLane) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: RaceLane): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(LANE_STORE, "readwrite").objectStore(LANE_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(LANE_STORE, "readwrite").objectStore(LANE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listRaceLanesFromDB(): Promise<RaceLane[]> {
  const db = await openRaceLaneDB();
  return idbGetAll(db);
}

export async function loadRaceLaneFromDB(id: string): Promise<RaceLane | null> {
  const db = await openRaceLaneDB();
  return idbGet(db, id);
}

export async function saveRaceLaneToDB(record: RaceLane): Promise<void> {
  const db = await openRaceLaneDB();
  await idbPut(db, record);
}

export async function deleteRaceLaneFromDB(id: string): Promise<void> {
  const db = await openRaceLaneDB();
  await idbDelete(db, id);
}
