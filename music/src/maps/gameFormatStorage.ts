// ── gameFormatStorage.ts — IndexedDB backend for Game Format records ─────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// Same raw-promise-over-IDBRequest, hand-rolled pattern as
// raceCourseStorage.ts/raceLaneStorage.ts — no shared helper exists anywhere
// in this codebase for IndexedDB access, so this doesn't invent one either.
// A dedicated, physically separate "MAPS_GAME_FORMAT_DB" — GameFormat is a
// canonical MUSIC/MAPS-side record (per plan review), never a wall/-side
// writable authority.

import type { GameFormat } from "../data/gameFormatTypes";

const DB_NAME = "MAPS_GAME_FORMAT_DB";
const DB_VERSION = 1;
const FORMAT_STORE = "gameFormats";

let _db: IDBDatabase | null = null;

export function openGameFormatDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FORMAT_STORE)) {
        db.createObjectStore(FORMAT_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(new Error(`[MAPS GameFormat] IndexedDB open failed: ${req.error?.message}`));
  });
}

function idbGetAll(db: IDBDatabase): Promise<GameFormat[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(FORMAT_STORE, "readonly").objectStore(FORMAT_STORE).getAll();
    req.onsuccess = () => resolve(req.result as GameFormat[]);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: GameFormat): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(FORMAT_STORE, "readwrite").objectStore(FORMAT_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listGameFormatsFromDB(): Promise<GameFormat[]> {
  const db = await openGameFormatDB();
  return idbGetAll(db);
}

export async function saveGameFormatToDB(record: GameFormat): Promise<void> {
  const db = await openGameFormatDB();
  await idbPut(db, record);
}
