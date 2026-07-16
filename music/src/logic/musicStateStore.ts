/**
 * musicStateStore.ts — IndexedDB backend for MUSIC full-state records.
 *
 * localStorage stores only compact pointers and manifests.
 * Full PlayProject state lives here.
 */

import type { PlayProject } from "../data/playProjectTypes";
import type { MusicStateSummary } from "./musicStateSummary";
import type { MusicSaveReason } from "./musicAutosave";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoredMusicStateKind = "current" | "lastKnownGood" | "checkpoint";

export interface StoredMusicStateRecord {
  id: string;
  kind: StoredMusicStateKind;
  createdAt: string;
  updatedAt?: string;
  reason?: MusicSaveReason;
  summary: MusicStateSummary;
  state: PlayProject;
}

export interface StateRecordSummary {
  id: string;
  kind: StoredMusicStateKind;
  createdAt: string;
  updatedAt?: string;
  reason?: MusicSaveReason;
  summary: MusicStateSummary;
}

export interface CheckpointManifestEntry {
  id: string;
  createdAt: string;
  reason?: MusicSaveReason;
  summary: MusicStateSummary;
}

// ---------------------------------------------------------------------------
// DB open
// ---------------------------------------------------------------------------

const DB_NAME = "MUSIC_STATE_DB";
const DB_VERSION = 1;
const STORE_NAME = "stateRecords";

let _db: IDBDatabase | null = null;

export function openMusicStateDB(): Promise<IDBDatabase> {
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
      reject(new Error(`[MUSIC] IndexedDB open failed: ${req.error?.message}`));
  });
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

function idbGet<T>(db: IDBDatabase, id: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: StoredMusicStateRecord): Promise<void> {
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

function idbGetAll(db: IDBDatabase): Promise<StoredMusicStateRecord[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as StoredMusicStateRecord[]);
    req.onerror = () => reject(req.error);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function saveStateRecord(record: StoredMusicStateRecord): Promise<void> {
  const db = await openMusicStateDB();
  await idbPut(db, record);
}

export async function loadStateRecord(id: string): Promise<StoredMusicStateRecord | null> {
  const db = await openMusicStateDB();
  return idbGet<StoredMusicStateRecord>(db, id);
}

export async function deleteStateRecord(id: string): Promise<void> {
  const db = await openMusicStateDB();
  await idbDelete(db, id);
}

export async function listStateRecords(): Promise<StateRecordSummary[]> {
  const db = await openMusicStateDB();
  const all = await idbGetAll(db);
  return all.map(({ state: _s, ...summary }) => summary);
}

// ---------------------------------------------------------------------------
// Current state
// ---------------------------------------------------------------------------

export async function saveCurrentState(
  state: PlayProject,
  reason: MusicSaveReason,
  summary: MusicStateSummary,
): Promise<void> {
  const now = new Date().toISOString();
  await saveStateRecord({ id: "current", kind: "current", createdAt: now, updatedAt: now, reason, summary, state });
  try { localStorage.setItem("music:activeStateId", "current"); } catch { /* non-fatal */ }
}

export async function loadCurrentState(): Promise<PlayProject | null> {
  const rec = await loadStateRecord("current");
  return rec?.state ?? null;
}

// ---------------------------------------------------------------------------
// Last known good
// ---------------------------------------------------------------------------

export async function saveLastKnownGood(
  state: PlayProject,
  reason: MusicSaveReason,
  summary: MusicStateSummary,
): Promise<void> {
  const now = new Date().toISOString();
  await saveStateRecord({ id: "lastKnownGood", kind: "lastKnownGood", createdAt: now, updatedAt: now, reason, summary, state });
  try { localStorage.setItem("music:lastKnownGoodId", "lastKnownGood"); } catch { /* non-fatal */ }
}

export async function loadLastKnownGood(): Promise<PlayProject | null> {
  const rec = await loadStateRecord("lastKnownGood");
  return rec?.state ?? null;
}

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

export async function saveCheckpoint(
  reason: MusicSaveReason,
  state: PlayProject,
  summary: MusicStateSummary,
): Promise<string> {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `checkpoint:${ts}:${reason}`;
  const now = new Date().toISOString();
  await saveStateRecord({ id, kind: "checkpoint", createdAt: now, reason, summary, state });
  return id;
}

export async function listCheckpointSummaries(): Promise<StateRecordSummary[]> {
  const db = await openMusicStateDB();
  const all = await idbGetAll(db);
  return all
    .filter((r) => r.kind === "checkpoint")
    .map(({ state: _s, ...summary }) => summary)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadCheckpoint(id: string): Promise<PlayProject | null> {
  const rec = await loadStateRecord(id);
  return rec?.state ?? null;
}

export async function deleteOldCheckpoints(maxCount: number): Promise<void> {
  const checkpoints = await listCheckpointSummaries();
  const toDelete = checkpoints.slice(maxCount);
  await Promise.all(toDelete.map((r) => deleteStateRecord(r.id)));
}

// ---------------------------------------------------------------------------
// Checkpoint manifest (compact localStorage cache for fast listing)
// ---------------------------------------------------------------------------

const MANIFEST_KEY = "music:checkpointManifest";
const MAX_MANIFEST = 20;

export function updateCheckpointManifest(
  id: string,
  reason: MusicSaveReason,
  summary: MusicStateSummary,
): void {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    const entries: CheckpointManifestEntry[] = raw ? JSON.parse(raw) : [];
    entries.unshift({ id, createdAt: new Date().toISOString(), reason, summary });
    if (entries.length > MAX_MANIFEST) entries.splice(MAX_MANIFEST);
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(entries));
  } catch { /* non-fatal */ }
}

export function readCheckpointManifest(): CheckpointManifestEntry[] {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY);
    return raw ? (JSON.parse(raw) as CheckpointManifestEntry[]) : [];
  } catch { return []; }
}
