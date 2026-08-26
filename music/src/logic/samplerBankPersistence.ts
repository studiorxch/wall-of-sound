// Sampler Bank Filesystem Persistence — Autosave Integrity Repair
// (0812D_MUSIC_Autosave-Integrity-Repair_v1.0.0)
//
// Pure — no fetch, no filesystem, no React. App.tsx owns all I/O; every
// function here is a deterministic state transition, directly testable
// against the exact failure sequence that previously let unhydrated,
// empty, partial, or deliberately-non-persisting session state overwrite
// the real library/music/sampler-banks/banks.json.

import type { PlaylistRecord } from "../data/playProjectTypes";
import type {
  SamplerBankPersistenceState,
  SamplerBankWriteDecision,
} from "../data/samplerBankPersistenceTypes";
// Re-exported for existing importers (App.tsx, tests) — the implementation
// itself lives in samplerBankServerWriteGuard.ts specifically so
// vite.config.ts can import it without pulling PlaylistRecord/
// playProjectTypes.ts's DOM-dependent type graph into its Node-context
// TypeScript project. See that file's header comment for why.
export { evaluateServerSideBankWrite, type ServerSideBankWriteCheck } from "./samplerBankServerWriteGuard";

export function createInitialSamplerBankPersistenceState(): SamplerBankPersistenceState {
  return {
    filesystemHydrated: false,
    lastKnownGoodBanks: null,
    writeRevision: 0,
    deletionAuthorized: false,
    persistenceSuspended: false,
  };
}

function banksOf(playlists: PlaylistRecord[]): PlaylistRecord[] {
  return playlists.filter((p) => p.playlistKind === "reference_overlay");
}

/**
 * Marks the filesystem read as complete (success or confirmed-absent) and
 * records the on-disk bank set as the initial known-good baseline — but
 * only if no baseline exists yet. A second hydration call (there should
 * never be one in practice — this fires once per mount — but pure
 * functions should not assume their caller is disciplined) never
 * overwrites an already-established baseline with a possibly-stale re-read.
 */
export function applySamplerBankFilesystemHydration(
  state: SamplerBankPersistenceState,
  banksFromDisk: PlaylistRecord[],
): SamplerBankPersistenceState {
  return {
    ...state,
    filesystemHydrated: true,
    lastKnownGoodBanks: state.lastKnownGoodBanks ?? banksFromDisk,
  };
}

/** "Open Empty Temporary Session" — suppress every write for the rest of this session. */
export function suspendSamplerBankPersistence(
  state: SamplerBankPersistenceState,
): SamplerBankPersistenceState {
  return { ...state, persistenceSuspended: true };
}

/**
 * Call synchronously inside the exact user action that reduces the bank
 * set to zero (e.g. deleting the last sampler bank), BEFORE the resulting
 * `playlists` state change reaches the write effect. Authorization is
 * single-use — the next write attempt consumes it via
 * `applySamplerBankWriteResult`/`applySamplerBankWriteSkip` regardless of
 * whether it actually needed it, so a later unrelated empty write is never
 * silently waved through.
 */
export function authorizeSamplerBankDeletion(
  state: SamplerBankPersistenceState,
): SamplerBankPersistenceState {
  return { ...state, deletionAuthorized: true };
}

/**
 * The single decision point the write effect consults before ever calling
 * fetch. Encodes, in order:
 *  1. Hydration guard — never write before the filesystem-authoritative
 *     bank set has actually been read at least once this session (closes
 *     the original race: a write could previously fire and clobber the
 *     file before the read-and-merge step at App.tsx:5293-5317 ever ran).
 *  2. Persistence-suspension guard — "Open Empty Temporary Session" must
 *     hold for the filesystem too, not just IndexedDB.
 *  3. Destructive empty-over-nonempty guard — mirrors the existing
 *     IndexedDB `checkDestructiveSave`'s `sampler_bank_wipe` check
 *     (musicStateValidation.ts), extended with an explicit
 *     human-authorized escape hatch for genuine deletion.
 */
export function evaluateSamplerBankWrite(
  state: SamplerBankPersistenceState,
  hasHydratedProject: boolean,
  playlists: PlaylistRecord[],
): SamplerBankWriteDecision {
  if (!hasHydratedProject || !state.filesystemHydrated) {
    return { action: "skip", reason: "not-hydrated" };
  }
  if (state.persistenceSuspended) {
    return { action: "skip", reason: "persistence-suspended" };
  }

  const nextBanks = banksOf(playlists);
  const prevBanks = state.lastKnownGoodBanks;
  const isDestructiveEmptyOverwrite =
    prevBanks !== null && prevBanks.length > 0 && nextBanks.length === 0;

  if (isDestructiveEmptyOverwrite && !state.deletionAuthorized) {
    return { action: "skip", reason: "destructive-empty-overwrite" };
  }

  return {
    action: "write",
    deletionAuthorized: state.deletionAuthorized,
    expectedPriorCount: prevBanks?.length ?? 0,
  };
}

/** Successful write: advance the known-good baseline and revision, consume any authorization. */
export function applySamplerBankWriteResult(
  state: SamplerBankPersistenceState,
  writtenBanks: PlaylistRecord[],
): SamplerBankPersistenceState {
  return {
    ...state,
    lastKnownGoodBanks: writtenBanks,
    writeRevision: state.writeRevision + 1,
    deletionAuthorized: false,
  };
}

/**
 * A write was attempted but skipped or rejected (by evaluateSamplerBankWrite
 * or by the server's own stale/destructive check) — consume any
 * authorization regardless, so a failed/rejected attempt never leaves a
 * stale "authorized" flag armed for a future, unrelated write. The known-
 * good baseline and revision are left untouched: skipping a write must
 * never fabricate progress that didn't happen.
 */
export function applySamplerBankWriteSkip(
  state: SamplerBankPersistenceState,
): SamplerBankPersistenceState {
  return { ...state, deletionAuthorized: false };
}
