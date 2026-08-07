// ── raceCourseStorage.ts — IndexedDB backend for Race Course records ─────────
// 0805C_MAPS_Race_Course_Library_and_Itinerary_Conversion
//
// A dedicated, physically separate IndexedDB ("MAPS_RACE_COURSE_DB") — same
// raw-promise-over-IDBRequest pattern as itineraryStorage.ts, its own store,
// never folded into MAPS_ITINERARY_DB or MUSIC_STATE_DB.
//
// TWO object stores:
//   - "raceCourses": the course records themselves. `active` on a saved
//     record is NEVER trusted as authoritative — see the `meta` store below.
//   - "meta": exactly one row, {key:'activeRaceCourseId', value: string|null}
//     — the SINGLE canonical authority for which course is active (a
//     required correction from plan review: no course record's own
//     `active:true/false` is ever independently written). Every read of
//     "is course X active" compares X's id against this one pointer, never a
//     per-record flag — this makes "at most one active course" a structural
//     property of the persistence layer, not a convention every caller has
//     to maintain across scattered async writes.

import type { RaceCourse } from "../data/raceCourseTypes";

const DB_NAME = "MAPS_RACE_COURSE_DB";
const DB_VERSION = 1;
const COURSE_STORE = "raceCourses";
const META_STORE = "meta";
const ACTIVE_ID_KEY = "activeRaceCourseId";

let _db: IDBDatabase | null = null;

export function openRaceCourseDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(COURSE_STORE)) {
        db.createObjectStore(COURSE_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () =>
      reject(new Error(`[MAPS RaceCourse] IndexedDB open failed: ${req.error?.message}`));
  });
}

function idbGetAll(db: IDBDatabase): Promise<RaceCourse[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(COURSE_STORE, "readonly").objectStore(COURSE_STORE).getAll();
    req.onsuccess = () => resolve(req.result as RaceCourse[]);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<RaceCourse | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(COURSE_STORE, "readonly").objectStore(COURSE_STORE).get(id);
    req.onsuccess = () => resolve((req.result as RaceCourse) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: RaceCourse): Promise<void> {
  return new Promise((resolve, reject) => {
    // `active` is stripped before persisting — it is never authoritative on
    // the record itself, only derived at read time from the meta pointer.
    const { active: _active, ...rest } = record;
    void _active;
    const toSave = { ...rest, active: false } as RaceCourse;
    const req = db.transaction(COURSE_STORE, "readwrite").objectStore(COURSE_STORE).put(toSave);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(COURSE_STORE, "readwrite").objectStore(COURSE_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listRaceCoursesFromDB(): Promise<RaceCourse[]> {
  const db = await openRaceCourseDB();
  return idbGetAll(db);
}

export async function loadRaceCourseFromDB(id: string): Promise<RaceCourse | null> {
  const db = await openRaceCourseDB();
  return idbGet(db, id);
}

export async function saveRaceCourseToDB(record: RaceCourse): Promise<void> {
  const db = await openRaceCourseDB();
  await idbPut(db, record);
}

export async function deleteRaceCourseFromDB(id: string): Promise<void> {
  const db = await openRaceCourseDB();
  await idbDelete(db, id);
}

// ── Canonical active-course pointer (the single source of truth) ───────────

export async function getActiveRaceCourseId(): Promise<string | null> {
  const db = await openRaceCourseDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(META_STORE, "readonly").objectStore(META_STORE).get(ACTIVE_ID_KEY);
    req.onsuccess = () => resolve((req.result as { key: string; value: string | null } | undefined)?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function setActiveRaceCourseId(id: string | null): Promise<void> {
  const db = await openRaceCourseDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(META_STORE, "readwrite").objectStore(META_STORE).put({ key: ACTIVE_ID_KEY, value: id });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
