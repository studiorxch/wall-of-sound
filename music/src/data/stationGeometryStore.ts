// ── stationGeometryStore.ts — IndexedDB backend for StationGeometryData ──────
// 0908_WOS_Subway_Bay_Ridge_Av_Station_Geometry — Editor V0 checkpoint.
//
// Same raw-promise-over-IDBRequest shape as maps/raceLaneStorage.ts and the
// other *StorageToDB modules in this codebase — a single object store keyed
// by `id`, no ORM/wrapper library. A station geometry record has no
// "exactly one active" concept to guard, so (like raceLaneStorage.ts) no
// `meta` store is needed here.

import type { StationGeometryData } from "./stationGeometryTypes";

const DB_NAME = "MUSIC_STATION_GEOMETRY_DB";
const DB_VERSION = 1;
const STORE = "stationGeometries";

let _db: IDBDatabase | null = null;

export function openStationGeometryDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`[MUSIC StationGeometry] IndexedDB open failed: ${req.error?.message}`));
  });
}

function idbGetAll(db: IDBDatabase): Promise<StationGeometryData[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as StationGeometryData[]);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<StationGeometryData | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as StationGeometryData) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: StationGeometryData): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listStationGeometriesFromDB(): Promise<StationGeometryData[]> {
  const db = await openStationGeometryDB();
  return idbGetAll(db);
}

export async function loadStationGeometryFromDB(id: string): Promise<StationGeometryData | null> {
  const db = await openStationGeometryDB();
  return idbGet(db, id);
}

export async function saveStationGeometryToDB(record: StationGeometryData): Promise<void> {
  const db = await openStationGeometryDB();
  await idbPut(db, { ...record, updatedAt: new Date().toISOString() });
}

export async function deleteStationGeometryFromDB(id: string): Promise<void> {
  const db = await openStationGeometryDB();
  await idbDelete(db, id);
}

/**
 * Minimal shape validation for a JSON-imported record — just enough to
 * reject obviously-wrong input before it overwrites editor state, not a
 * full schema validator.
 */
export function isPlausibleStationGeometryData(value: unknown): value is StationGeometryData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    v.id.startsWith("stationGeometry:") &&
    typeof v.origin === "object" &&
    v.origin !== null &&
    Array.isArray(v.platforms) &&
    Array.isArray(v.trackCenterlines) &&
    Array.isArray(v.levels) &&
    Array.isArray(v.connections) &&
    Array.isArray(v.platformLinks) &&
    Array.isArray(v.evidenceConflicts)
  );
}
