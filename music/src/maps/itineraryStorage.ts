// ── itineraryStorage.ts — IndexedDB backend for Itinerary records ────────────
// 0729E_MAPS_Itinerary_Collections_Foundation
//
// A dedicated, physically separate IndexedDB ("MAPS_ITINERARY_DB") — NOT
// folded into music/src/logic/musicStateStore.ts's MUSIC_STATE_DB. MapsSection
// mounts with zero props from App.tsx; MAPS has been deliberately decoupled
// from PlayProject's state tree through every prior MAPS build, and
// MUSIC_STATE_DB's checkpoint/write-audit machinery is Playlist-shaped and
// irrelevant here. Same raw-promise-over-IDBRequest pattern as
// musicStateStore.ts, just its own store.

import type { Itinerary } from "../data/itineraryTypes";

const DB_NAME = "MAPS_ITINERARY_DB";
const DB_VERSION = 1;
const STORE_NAME = "itineraries";

let _db: IDBDatabase | null = null;

export function openItineraryDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      _db.onclose = () => { _db = null; };
      resolve(_db);
    };
    req.onerror = () =>
      reject(new Error(`[MAPS Itinerary] IndexedDB open failed: ${req.error?.message}`));
  });
}

function idbGetAll(db: IDBDatabase): Promise<Itinerary[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as Itinerary[]);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, id: string): Promise<Itinerary | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as Itinerary) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: Itinerary): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function listItinerariesFromDB(): Promise<Itinerary[]> {
  const db = await openItineraryDB();
  return idbGetAll(db);
}

export async function loadItineraryFromDB(id: string): Promise<Itinerary | null> {
  const db = await openItineraryDB();
  return idbGet(db, id);
}

export async function saveItineraryToDB(record: Itinerary): Promise<void> {
  const db = await openItineraryDB();
  await idbPut(db, record);
}

export async function deleteItineraryFromDB(id: string): Promise<void> {
  const db = await openItineraryDB();
  await idbDelete(db, id);
}
