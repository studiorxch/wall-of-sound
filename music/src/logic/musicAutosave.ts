/**
 * musicAutosave.ts — centralized autosave, checkpoint, and recovery for MUSIC.
 *
 * All persistent MUSIC state writes must go through saveMusicState().
 *
 * Storage layout:
 *   IndexedDB (MUSIC_STATE_DB / stateRecords)
 *     current          — canonical autosave (full state)
 *     lastKnownGood    — last validated healthy snapshot (full state)
 *     checkpoint:*     — rolling checkpoints, max 20 (full state)
 *
 *   localStorage (compact pointers/diagnostics only — NO full state)
 *     music:activeStateId       pointer to IDB current record
 *     music:lastKnownGoodId     pointer to IDB LKG record
 *     music:checkpointManifest  compact list of checkpoint metadata
 *     music:lastBlockedSave     diagnostic for blocked saves
 *     music:writeAuditLog       50-entry write history
 *     music:storageVersion      migration flag
 */

import type { PlayProject } from "../data/playProjectTypes";
import { summarizeMusicState, type MusicStateSummary } from "./musicStateSummary";
import { auditAudioPaths, migratePortableAudioPaths } from "./migratePortableAudioPaths";
import { classifyAudioPath } from "./audioPathResolver";
import {
  isMusicStateValid,
  isMusicStateHealthy,
  checkDestructiveSave,
} from "./musicStateValidation";
import {
  saveCurrentState,
  loadCurrentState,
  saveLastKnownGood,
  loadLastKnownGood,
  saveCheckpoint,
  listCheckpointSummaries,
  loadCheckpoint,
  deleteOldCheckpoints,
  updateCheckpointManifest,
  readCheckpointManifest,
  type StateRecordSummary,
} from "./musicStateStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MusicSaveReason =
  | "app_init"
  | "autosave"
  | "user_create_playlist"
  | "user_update_playlist"
  | "user_delete_playlist"
  | "user_create_crate"
  | "user_update_crate"
  | "user_delete_crate"
  | "playlist_arc_generation"
  | "standard_playlist_generation"
  | "playlist_create"
  | "playlist_wizard_option_accepted"
  | "playlist_wizard_options_generated"
  | "playlist_created_empty_manual"
  | "update_library"
  | "index_wins_hydration"
  | "mood_drift_hydration"
  | "analysis_drift_hydration"
  | "sampler_bank_hydration"
  | "apply_analysis_cache"
  | "apply_mood_generation"
  | "import_project"
  | "manual_backup"
  | "debug_recovery"
  | "startup_restore_last_known_good"
  | "startup_restore_checkpoint"
  | "pre_restore_backup"
  | "data_management_restore"
  | "portable_audio_path_migration"
  | "unknown";

export interface SaveMusicStateOptions {
  reason: MusicSaveReason;
  risky?: boolean;
  allowDestructive?: boolean;
  confirmedByUser?: boolean;
}

export interface SaveMusicStateResult {
  ok: boolean;
  blocked: boolean;
  blockReason?: string;
  checkpointId?: string;
  summaryBefore?: MusicStateSummary;
  summaryAfter?: MusicStateSummary;
}

export interface LoadMusicStateResult {
  state: PlayProject;
  source: "indexeddb_current" | "indexeddb_last_known_good" | "migrated_localstorage" | "default";
  needsRecoveryPrompt: boolean;
  damagedState?: PlayProject | null;
}

// ---------------------------------------------------------------------------
// localStorage keys (compact only — no full state after migration)
// ---------------------------------------------------------------------------

export const MUSIC_BLOCKED_SAVE_KEY = "music:lastBlockedSave";
export const MUSIC_WRITE_AUDIT_KEY = "music:writeAuditLog";
export const MUSIC_STORAGE_VERSION_KEY = "music:storageVersion";

// Legacy full-state localStorage keys (removed after migration)
const LS_CURRENT_KEY = "music:currentState";
const LS_LKG_KEY = "music:lastKnownGood";
const LEGACY_KEY = "play-project-v2";
const LEGACY_LKG_KEY = "music:lastKnownGoodProject";
const LEGACY_SAFETY_PREFIX = "music:safetyBackup:";
const LEGACY_CHECKPOINT_PREFIX = "music:checkpoint:";

const MAX_CHECKPOINTS = 20;
const MAX_AUDIT_ENTRIES = 50;
const STORAGE_VERSION = "idb-v1";

// ---------------------------------------------------------------------------
// In-memory cache — sync guard checks read from here
// ---------------------------------------------------------------------------

let _currentStateCache: PlayProject | null = null;

/** Called by loadPlayProject (sync) and loadPlayProjectAsync to prime the cache. */
export function primeStateCache(state: PlayProject | null): void {
  _currentStateCache = state;
}

// ---------------------------------------------------------------------------
// Risky reasons — create a checkpoint before writing
// ---------------------------------------------------------------------------

function isRiskyReason(reason: MusicSaveReason): boolean {
  return ([
    "update_library",
    "index_wins_hydration",
    "mood_drift_hydration",
    "analysis_drift_hydration",
    "sampler_bank_hydration",
    "apply_analysis_cache",
    "apply_mood_generation",
    "playlist_arc_generation",
    "standard_playlist_generation",
  ] as MusicSaveReason[]).includes(reason);
}

// ---------------------------------------------------------------------------
// Clean up old localStorage full-state keys
// ---------------------------------------------------------------------------

function cleanupLocalStorageFullState(): void {
  try {
    const toRemove = [LS_CURRENT_KEY, LS_LKG_KEY, LEGACY_KEY, LEGACY_LKG_KEY];
    for (const k of toRemove) {
      if (localStorage.getItem(k)) {
        localStorage.removeItem(k);
        console.log(`[MUSIC] Removed localStorage full-state key: ${k}`);
      }
    }
    const oldBackupKeys = Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_SAFETY_PREFIX));
    for (const k of oldBackupKeys) localStorage.removeItem(k);
    if (oldBackupKeys.length) console.log(`[MUSIC] Removed ${oldBackupKeys.length} legacy safetyBackup key(s).`);
    const oldCheckpointKeys = Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_CHECKPOINT_PREFIX));
    for (const k of oldCheckpointKeys) localStorage.removeItem(k);
    if (oldCheckpointKeys.length) console.log(`[MUSIC] Removed ${oldCheckpointKeys.length} legacy localStorage checkpoint key(s).`);
  } catch { /* non-fatal */ }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

interface AuditEntry {
  timestamp: string;
  reason: MusicSaveReason;
  before: MusicStateSummary | null;
  after: MusicStateSummary;
  blocked: boolean;
  blockReason?: string;
  checkpointId?: string;
}

function appendAuditEntry(entry: AuditEntry): void {
  try {
    const raw = localStorage.getItem(MUSIC_WRITE_AUDIT_KEY);
    const log: AuditEntry[] = raw ? JSON.parse(raw) : [];
    log.unshift(entry);
    if (log.length > MAX_AUDIT_ENTRIES) log.splice(MAX_AUDIT_ENTRIES);
    localStorage.setItem(MUSIC_WRITE_AUDIT_KEY, JSON.stringify(log));
  } catch { /* audit failure is non-fatal */ }
}

// ---------------------------------------------------------------------------
// Async load (migration + IDB) — used by startup useEffect
// ---------------------------------------------------------------------------

export async function loadMusicStateAsync(): Promise<LoadMusicStateResult | null> {
  try {
    // 1. Check IDB for existing current record
    const idbCurrent = await loadCurrentState();
    if (idbCurrent && isMusicStateValid(idbCurrent)) {
      cleanupLocalStorageFullState();
      _currentStateCache = idbCurrent;
      localStorage.setItem(MUSIC_STORAGE_VERSION_KEY, STORAGE_VERSION);
      return { state: idbCurrent, source: "indexeddb_current", needsRecoveryPrompt: false };
    }

    // 2. Migrate from localStorage music:currentState
    const lsRaw = localStorage.getItem(LS_CURRENT_KEY);
    if (lsRaw) {
      const parsed: unknown = JSON.parse(lsRaw);
      if (isMusicStateValid(parsed)) {
        console.log("[MUSIC] Migrating full localStorage state into IndexedDB.");
        const summary = summarizeMusicState(parsed);
        await saveCurrentState(parsed, "app_init", summary);
        if (isMusicStateHealthy(parsed, null)) {
          await saveLastKnownGood(parsed, "app_init", summary);
        }
        cleanupLocalStorageFullState();
        localStorage.setItem(MUSIC_STORAGE_VERSION_KEY, STORAGE_VERSION);
        _currentStateCache = parsed;
        return { state: parsed, source: "migrated_localstorage", needsRecoveryPrompt: false };
      }
    }

    // 3. Migrate from legacy play-project-v2
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const parsed: unknown = JSON.parse(legacyRaw);
      if (isMusicStateValid(parsed)) {
        console.log("[MUSIC] Migrating legacy play-project-v2 into IndexedDB.");
        const summary = summarizeMusicState(parsed);
        await saveCurrentState(parsed, "app_init", summary);
        if (isMusicStateHealthy(parsed, null)) {
          await saveLastKnownGood(parsed, "app_init", summary);
        }
        cleanupLocalStorageFullState();
        localStorage.setItem(MUSIC_STORAGE_VERSION_KEY, STORAGE_VERSION);
        _currentStateCache = parsed;
        return { state: parsed, source: "migrated_localstorage", needsRecoveryPrompt: false };
      }
    }

    // 4. Damaged/missing current — check IDB LKG for recovery prompt
    const idbLKG = await loadLastKnownGood();
    if (idbLKG && isMusicStateValid(idbLKG)) {
      // Try to recover from localStorage first to detect damaged current
      let damagedState: PlayProject | null = null;
      if (lsRaw) {
        try { damagedState = JSON.parse(lsRaw) as PlayProject; } catch { /* ignore */ }
      }
      _currentStateCache = idbLKG;
      return { state: idbLKG, source: "indexeddb_last_known_good", needsRecoveryPrompt: true, damagedState };
    }

    return null;
  } catch (err) {
    console.error("[MUSIC] loadMusicStateAsync failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sync load — for useState initializers (reads from cache or localStorage)
// Fallback only — async load is preferred and runs in startup useEffect.
// ---------------------------------------------------------------------------

export function loadMusicState(): PlayProject | null {
  // Fast path: cache populated by async hydration
  if (_currentStateCache) return _currentStateCache;
  // Sync fallback: read from localStorage (migration period only)
  try {
    const raw = localStorage.getItem(LS_CURRENT_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isMusicStateValid(parsed)) {
        _currentStateCache = parsed;
        return parsed;
      }
    }
    // Legacy fallback
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const parsed: unknown = JSON.parse(legacyRaw);
      if (isMusicStateValid(parsed)) {
        _currentStateCache = parsed;
        return parsed;
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// Central save (sync API — IDB writes are fire-and-forget)
// ---------------------------------------------------------------------------

export function saveMusicState(
  nextState: PlayProject,
  options: SaveMusicStateOptions,
): SaveMusicStateResult {
  const { reason, risky, allowDestructive, confirmedByUser } = options;
  const ts = new Date().toISOString();

  // Read previous state from in-memory cache (fast, accurate)
  const prevState = _currentStateCache;
  const summaryBefore = prevState ? summarizeMusicState(prevState) : null;

  // Strip session-only blob URLs before persisting
  const stateToWrite: PlayProject = {
    ...nextState,
    libraryTracks: (nextState.libraryTracks ?? []).map((t) =>
      t.objectUrl ? { ...t, objectUrl: undefined } : t,
    ),
    lastSavedAt: ts,
    lastSaveReason: reason,
  } as PlayProject;

  const summaryAfter = summarizeMusicState(stateToWrite);

  // Destructive-save guard (sync)
  if (!allowDestructive && !confirmedByUser) {
    const guard = checkDestructiveSave(prevState, stateToWrite);
    if (guard.blocked) {
      try {
        localStorage.setItem(MUSIC_BLOCKED_SAVE_KEY, JSON.stringify({
          timestamp: ts, reason, blockReason: guard.blockReason,
          before: summaryBefore, after: summaryAfter,
        }));
      } catch { /* non-fatal */ }
      appendAuditEntry({ timestamp: ts, reason, before: summaryBefore, after: summaryAfter, blocked: true, blockReason: guard.blockReason });
      console.warn(`[MUSIC] Blocked save (${reason}): ${guard.blockReason}`, { before: summaryBefore, after: summaryAfter });
      return { ok: false, blocked: true, blockReason: guard.blockReason, summaryBefore: summaryBefore ?? undefined, summaryAfter };
    }
  }

  // Update in-memory cache immediately (sync — guard checks will see this)
  _currentStateCache = stateToWrite;

  // Fire-and-forget IDB write
  const shouldCheckpoint = (isRiskyReason(reason) || !!risky) && !!prevState;
  void (async () => {
    try {
      let checkpointId: string | undefined;
      if (shouldCheckpoint && prevState) {
        checkpointId = await saveCheckpoint(reason, prevState, summaryBefore!);
        await deleteOldCheckpoints(MAX_CHECKPOINTS);
        updateCheckpointManifest(checkpointId, reason, summaryBefore!);
      }
      await saveCurrentState(stateToWrite, reason, summaryAfter);
      // Remove full-state localStorage keys if still present (post-migration cleanup)
      if (localStorage.getItem(LS_CURRENT_KEY) || localStorage.getItem(LS_LKG_KEY)) {
        cleanupLocalStorageFullState();
      }
      // Update LKG if healthy and not a downgrade
      if (isMusicStateHealthy(stateToWrite, prevState)) {
        const prevLKGRec = await import("./musicStateStore").then((m) => m.loadStateRecord("lastKnownGood"));
        const prevLKGSummary = prevLKGRec?.summary;
        const shouldUpdateLKG = !prevLKGSummary || (
          summaryAfter.nonDefaultPlaylistCount >= (prevLKGSummary.nonDefaultPlaylistCount ?? 0) &&
          summaryAfter.crateCount >= (prevLKGSummary.crateCount ?? 0) &&
          summaryAfter.trackCount >= (prevLKGSummary.trackCount ?? 0)
        );
        if (shouldUpdateLKG) {
          await saveLastKnownGood(stateToWrite, reason, summaryAfter);
        }
      }
      appendAuditEntry({ timestamp: ts, reason, before: summaryBefore, after: summaryAfter, blocked: false, checkpointId });
    } catch (e) {
      console.error("[MUSIC] IDB write failed:", e);
    }
  })();

  return { ok: true, blocked: false, summaryBefore: summaryBefore ?? undefined, summaryAfter };
}

// ---------------------------------------------------------------------------
// Manual backup download
// ---------------------------------------------------------------------------

export function downloadCurrentState(): void {
  void (async () => {
    try {
      // Try IDB first, fall back to cache
      let state = await loadCurrentState();
      if (!state) state = _currentStateCache;
      if (!state) { console.warn("[MUSIC] No current state to download."); return; }
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const payload = {
        snapshotType: "manualBackup",
        createdAt: new Date().toISOString(),
        summary: summarizeMusicState(state),
        state,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MUSIC_Backup_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[MUSIC] Failed to download current state:", e);
    }
  })();
}

// ---------------------------------------------------------------------------
// window.MUSIC_DEBUG
// ---------------------------------------------------------------------------

export interface MusicDebugAPI {
  getCurrentStateSummary(): MusicStateSummary | null;
  listCheckpoints(): Promise<StateRecordSummary[]>;
  inspectCheckpoint(id: string): Promise<{ id: string; createdAt: string; reason?: string; summary: MusicStateSummary } | null>;
  restoreCheckpoint(id: string, opts?: { confirm: boolean }): Promise<boolean>;
  restoreLastKnownGood(opts?: { confirm: boolean }): Promise<boolean>;
  downloadCheckpoint(id: string): Promise<void>;
  downloadCurrentState(): void;
  getLastBlockedSave(): unknown;
  getWriteAuditLog(): unknown[];
  // Audio path tools
  auditAudioPaths(): import("./migratePortableAudioPaths").AudioPathAuditResult | null;
  migratePortableAudioPathsDryRun(): import("./migratePortableAudioPaths").PortableAudioPathMigrationResult | null;
  migratePortableAudioPathsApply(opts?: { confirm: boolean }): import("./migratePortableAudioPaths").PortableAudioPathMigrationResult | null;
  findAbsoluteAudioPaths(): Array<{ trackId: string; title: string; path: string }>;
  findUnresolvedAudioPaths(): Array<{ trackId: string; title: string; status: string }>;
}

export function installMusicDebug(
  onRestore: (state: PlayProject) => void,
  getProject?: () => PlayProject | null,
): void {
  if (typeof window === "undefined") return;

  const api: MusicDebugAPI = {
    getCurrentStateSummary() {
      return _currentStateCache ? summarizeMusicState(_currentStateCache) : null;
    },

    async listCheckpoints() {
      return listCheckpointSummaries();
    },

    async inspectCheckpoint(id) {
      const checkpoints = await listCheckpointSummaries();
      const entry = checkpoints.find((c) => c.id === id);
      if (!entry) return null;
      return { id: entry.id, createdAt: entry.createdAt, reason: entry.reason, summary: entry.summary };
    },

    async restoreCheckpoint(id, opts) {
      if (!opts?.confirm) { console.warn("[MUSIC_DEBUG] Pass { confirm: true } to restore."); return false; }
      try {
        const state = await loadCheckpoint(id);
        if (!state) { console.warn("[MUSIC_DEBUG] Checkpoint not found:", id); return false; }
        onRestore(state);
        saveMusicState(state, { reason: "debug_recovery", allowDestructive: true, confirmedByUser: true });
        console.log("[MUSIC_DEBUG] Restored checkpoint:", id);
        return true;
      } catch (e) { console.error("[MUSIC_DEBUG] Restore failed:", e); return false; }
    },

    async restoreLastKnownGood(opts) {
      if (!opts?.confirm) { console.warn("[MUSIC_DEBUG] Pass { confirm: true } to restore LKG."); return false; }
      try {
        const lkg = await loadLastKnownGood();
        if (!lkg) { console.warn("[MUSIC_DEBUG] No last-known-good found in IDB."); return false; }
        onRestore(lkg);
        saveMusicState(lkg, { reason: "debug_recovery", allowDestructive: true, confirmedByUser: true });
        console.log("[MUSIC_DEBUG] Restored last-known-good state.");
        return true;
      } catch (e) { console.error("[MUSIC_DEBUG] LKG restore failed:", e); return false; }
    },

    async downloadCheckpoint(id) {
      try {
        const state = await loadCheckpoint(id);
        if (!state) { console.warn("[MUSIC_DEBUG] Checkpoint not found:", id); return; }
        const checkpoints = await listCheckpointSummaries();
        const entry = checkpoints.find((c) => c.id === id);
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const payload = { snapshotType: "checkpoint", id, createdAt: entry?.createdAt, reason: entry?.reason, summary: entry?.summary, state };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `MUSIC_Checkpoint_${ts}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) { console.error("[MUSIC_DEBUG] Download checkpoint failed:", e); }
    },

    downloadCurrentState,

    getLastBlockedSave() {
      try {
        const raw = localStorage.getItem(MUSIC_BLOCKED_SAVE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    },

    getWriteAuditLog() {
      try {
        const raw = localStorage.getItem(MUSIC_WRITE_AUDIT_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch { return []; }
    },

    auditAudioPaths() {
      const project = getProject?.() ?? _currentStateCache;
      if (!project) { console.warn("[MUSIC_DEBUG] No project loaded."); return null; }
      const result = auditAudioPaths(project);
      console.table(result);
      return result;
    },

    migratePortableAudioPathsDryRun() {
      const project = getProject?.() ?? _currentStateCache;
      if (!project) { console.warn("[MUSIC_DEBUG] No project loaded."); return null; }
      const { result } = migratePortableAudioPaths(project);
      console.log("[MUSIC_DEBUG] Dry run result:", result);
      if (result.warnings.length) console.warn("[MUSIC_DEBUG] Warnings:", result.warnings);
      return result;
    },

    migratePortableAudioPathsApply(opts) {
      if (!opts?.confirm) {
        console.warn("[MUSIC_DEBUG] Pass { confirm: true } to apply migration.");
        return null;
      }
      const project = getProject?.() ?? _currentStateCache;
      if (!project) { console.warn("[MUSIC_DEBUG] No project loaded."); return null; }
      const { project: migrated, result } = migratePortableAudioPaths(project);
      if (result.warnings.length) console.warn("[MUSIC_DEBUG] Migration warnings:", result.warnings);
      onRestore(migrated);
      saveMusicState(migrated, { reason: "portable_audio_path_migration", allowDestructive: false });
      console.log(`[MUSIC_DEBUG] Migration applied: ${result.changedCount} changed, ${result.unresolvedCount} unresolved.`);
      return result;
    },

    findAbsoluteAudioPaths() {
      const project = getProject?.() ?? _currentStateCache;
      if (!project) return [];
      return project.libraryTracks
        .filter((t) => {
          const p = (t as unknown as { audioRelPath?: string }).audioRelPath ?? t.filePath ?? "";
          return classifyAudioPath(p) === "absolute";
        })
        .map((t) => ({
          trackId: t.trackId,
          title: t.title,
          path: (t as unknown as { audioRelPath?: string }).audioRelPath ?? t.filePath ?? "",
        }));
    },

    findUnresolvedAudioPaths() {
      const project = getProject?.() ?? _currentStateCache;
      if (!project) return [];
      return project.libraryTracks
        .filter((t) => (t as unknown as { audioStatus?: string }).audioStatus === "unresolved")
        .map((t) => ({
          trackId: t.trackId,
          title: t.title,
          status: (t as unknown as { audioStatus?: string }).audioStatus ?? "unknown",
        }));
    },
  };

  (window as unknown as { MUSIC_DEBUG: MusicDebugAPI }).MUSIC_DEBUG = api;
  console.log("[MUSIC] Debug API installed. Use window.MUSIC_DEBUG to access.");
}

// ---------------------------------------------------------------------------
// Checkpoint manifest helpers (re-exported for App.tsx recovery check)
// ---------------------------------------------------------------------------

export { readCheckpointManifest };
