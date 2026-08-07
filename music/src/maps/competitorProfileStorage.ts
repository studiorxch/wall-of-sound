// ── competitorProfileStorage.ts — IndexedDB backend for Competitor records ───
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// Same hand-rolled pattern as gameFormatStorage.ts/raceCourseStorage.ts. A
// dedicated "MAPS_COMPETITOR_DB" — CompetitorProfile is a canonical
// MUSIC/MAPS-side record (per plan review), never a wall/-side writable
// authority, even though it references a wall/-side OrbProfile by id.

import type { CompetitorProfile } from "../data/competitorProfileTypes";

const DB_NAME = "MAPS_COMPETITOR_DB";
const DB_VERSION = 1;
const COMPETITOR_STORE = "competitorProfiles";

let _db: IDBDatabase | null = null;

export function openCompetitorProfileDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(COMPETITOR_STORE)) {
        db.createObjectStore(COMPETITOR_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`[MAPS CompetitorProfile] IndexedDB open failed: ${req.error?.message}`));
  });
}

function idbGetAll(db: IDBDatabase): Promise<CompetitorProfile[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(COMPETITOR_STORE, "readonly").objectStore(COMPETITOR_STORE).getAll();
    req.onsuccess = () => resolve(req.result as CompetitorProfile[]);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: CompetitorProfile): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(COMPETITOR_STORE, "readwrite").objectStore(COMPETITOR_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listCompetitorProfilesFromDB(): Promise<CompetitorProfile[]> {
  const db = await openCompetitorProfileDB();
  return idbGetAll(db);
}

export async function saveCompetitorProfileToDB(record: CompetitorProfile): Promise<void> {
  const db = await openCompetitorProfileDB();
  await idbPut(db, record);
}
