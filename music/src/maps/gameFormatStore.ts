// ── gameFormatStore.ts — in-memory cache over gameFormatStorage.ts ───────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// Same synchronous list()/subscribe(fn) shape as raceCourseStore.ts. Seeds
// ONE real record on first hydrate if the store is empty (mirrors Orb's own
// seed-once-if-empty precedent, applied here to a MUSIC-native IndexedDB
// store instead of a wall/ localStorage authority — per plan review,
// GameFormat stays MUSIC/MAPS-side canonical, never a wall/-side writable
// authority).
//
// Writes a SLIM, read-only catalog mirror to `wos:gameFormat:catalog`
// localStorage on every change — this is how wall/'s RACETRACK runtime
// browses Game Formats without a new writable bridge. No create/rename
// exports exist yet since no UI calls them in this build (no authoring UI).

import type { GameFormat } from "../data/gameFormatTypes";
import { listGameFormatsFromDB, saveGameFormatToDB } from "./gameFormatStorage";

const CATALOG_MIRROR_KEY = "wos:gameFormat:catalog";

export interface GameFormatCatalogEntry {
  id: string;
  name: string;
  objective: string;
  minCompetitors: number;
  maxCompetitors: number;
  reward: string;
  stakes: string;
  mode: string;
}

let _formats: GameFormat[] = [];
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
const _listeners: Array<() => void> = [];

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

function writeCatalogMirror(): void {
  const entries: GameFormatCatalogEntry[] = _formats.map((f) => ({
    id: f.id, name: f.name, objective: f.objective,
    minCompetitors: f.minCompetitors, maxCompetitors: f.maxCompetitors,
    reward: f.reward, stakes: f.stakes, mode: f.mode,
  }));
  try {
    localStorage.setItem(CATALOG_MIRROR_KEY, JSON.stringify(entries));
  } catch {
    /* best-effort mirror — not load-bearing for this tab's own state */
  }
}

function notify(): void {
  writeCatalogMirror();
  _listeners.slice().forEach((fn) => {
    try { fn(); } catch (e) { console.warn("[gameFormatStore] subscriber threw:", e); }
  });
}

const SEED_FORMAT: Omit<GameFormat, "id" | "createdAt" | "updatedAt"> = {
  name: "Outlaw Point-to-Point",
  objective: "First Orb across the finish line wins — one course, no laps.",
  minCompetitors: 2,
  maxCompetitors: 6,
  reward: "Season point + bragging rights",
  stakes: "Elimination from the weekly bracket",
  mode: "point_to_point",
};

async function seedIfEmpty(records: GameFormat[]): Promise<GameFormat[]> {
  if (records.length > 0) return records;
  const now = Date.now();
  const seeded: GameFormat = { ...SEED_FORMAT, id: genId("format"), createdAt: now, updatedAt: now };
  await saveGameFormatToDB(seeded);
  return [seeded];
}

async function hydrateNow(): Promise<void> {
  const records = await listGameFormatsFromDB();
  _formats = await seedIfEmpty(records);
  _hydrated = true;
}

export function hydrate(): Promise<void> {
  if (_hydrated) return Promise.resolve();
  if (_hydrating) return _hydrating;
  _hydrating = hydrateNow()
    .then(() => notify())
    .catch((e) => {
      console.warn("[gameFormatStore] hydrate failed:", e);
      _hydrated = true; // fail open to an empty list, don't retry forever
      notify();
    });
  return _hydrating;
}

hydrate();

export function isHydrated(): boolean {
  return _hydrated;
}

export function listGameFormats(): GameFormat[] {
  return _formats.slice();
}

export function getGameFormat(id: string): GameFormat | null {
  return _formats.find((f) => f.id === id) ?? null;
}

export function subscribe(fn: () => void): () => void {
  _listeners.push(fn);
  return () => {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  };
}
