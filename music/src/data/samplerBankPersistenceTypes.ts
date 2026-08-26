// Sampler Bank Filesystem Persistence — Autosave Integrity Repair
// (0812D_MUSIC_Autosave-Integrity-Repair_v1.0.0)
//
// Root cause this repairs: `library/music/sampler-banks/banks.json` is a
// shared, absolute-filesystem-path authority file — NOT scoped per browser
// session/profile the way IndexedDB is. The write path that syncs it
// (App.tsx's sampler-bank filesystem-sync effect) previously fired the
// moment the app's generic `hasHydratedProject` flag went true, with no
// awareness that:
//   (a) the filesystem-authoritative bank set is merged into `playlists`
//       via a SEPARATE, later, async step — so an early write could see an
//       incomplete/default `playlists` snapshot and clobber the real file
//       before ever reading it back, and
//   (b) "Open Empty Temporary Session" (Recovery Screen) explicitly
//       promises not to persist anything, but only ever suppressed the
//       IndexedDB save path — the filesystem write effect had no concept
//       of a suspended/non-persisting session at all.
//
// This module defines the explicit state this repair introduces to close
// both gaps, plus a destructive-write guard mirroring the existing
// IndexedDB `checkDestructiveSave`'s `sampler_bank_wipe` check (see
// musicStateValidation.ts) — a pattern that already existed for IndexedDB
// but was never extended to the filesystem write.

import type { PlaylistRecord } from "./playProjectTypes";

export interface SamplerBankPersistenceState {
  // True only once the on-disk banks.json has been read at least once this
  // session — success OR confirmed-absent both count as "hydrated"; only an
  // in-flight/not-yet-attempted read leaves this false. Distinct from the
  // app's generic `hasHydratedProject` (IndexedDB/project hydration), which
  // completes independently and earlier.
  filesystemHydrated: boolean;
  // The last bank set CONFIRMED to exist on disk — from a successful read
  // or a successful write. The write-guard's comparison baseline. Null only
  // before the very first successful read/write this session (no baseline
  // yet to protect, so a write in that state is neither blocked nor
  // considered destructive — there is nothing known-good to lose).
  lastKnownGoodBanks: PlaylistRecord[] | null;
  // Monotonic count of successful on-disk writes this session, sent to the
  // server as an optimistic-concurrency "expected prior count" so a stale
  // or competing write can be rejected explicitly instead of silently
  // clobbering a newer write from another tab/session.
  writeRevision: number;
  // True only for the single write attempt immediately following an
  // explicit, in-session human action that reduced the bank set to zero
  // (e.g. deleting the last sampler bank). Consumed — reset to false — by
  // the very next write attempt regardless of its outcome, so it can never
  // silently authorize a later, unrelated empty write.
  deletionAuthorized: boolean;
  // True for a deliberately non-persisting session ("Open Empty Temporary
  // Session" on the Recovery Screen). Suppresses every filesystem write
  // unconditionally until the session ends (page reload).
  persistenceSuspended: boolean;
}

export type SamplerBankWriteSkipReason =
  | "not-hydrated"
  | "persistence-suspended"
  | "destructive-empty-overwrite";

export type SamplerBankWriteDecision =
  | { action: "write"; deletionAuthorized: boolean; expectedPriorCount: number }
  | { action: "skip"; reason: SamplerBankWriteSkipReason };

export interface SamplerBankWriteOutcome {
  ok: boolean;
  // Present on success — the count the server confirmed was written.
  writtenCount?: number;
  // Present on rejection — mirrors the server's explicit reason, never a
  // silent/destructive fallback.
  error?: string;
  reason?: string;
}
