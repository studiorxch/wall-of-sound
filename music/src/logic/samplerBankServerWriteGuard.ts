// Sampler Bank Filesystem Persistence — Autosave Integrity Repair
// (0812D_MUSIC_Autosave-Integrity-Repair_v1.0.0)
//
// Deliberately dependency-free (no PlaylistRecord/playProjectTypes import):
// this is the one function vite.config.ts's /sampler-banks-write route
// calls directly, and vite.config.ts's Node-context TypeScript project
// (tsconfig.node.json) has no "DOM" lib. Importing anything that transits
// through playProjectTypes.ts (which reaches DOM-only modules like
// colorLab.ts) would pull the browser type graph into the Node project's
// composite build. Kept as its own file, separate from
// samplerBankPersistence.ts's richer PlaylistRecord-based client logic, so
// vite.config.ts's import graph stays minimal by construction, not by
// convention.

export interface ServerSideBankWriteCheck {
  accept: boolean;
  reason?: "stale-revision" | "destructive-empty-overwrite";
}

export function evaluateServerSideBankWrite(
  currentOnDiskCount: number,
  expectedPriorCount: number,
  incomingCount: number,
  deletionAuthorized: boolean,
): ServerSideBankWriteCheck {
  // Optimistic-concurrency check first: if what's actually on disk doesn't
  // match what the client believes it last confirmed, some other writer
  // (another tab, another session) has moved the file since — reject
  // explicitly rather than blindly overwriting whatever they wrote.
  if (currentOnDiskCount !== expectedPriorCount) {
    return { accept: false, reason: "stale-revision" };
  }
  if (currentOnDiskCount > 0 && incomingCount === 0 && !deletionAuthorized) {
    return { accept: false, reason: "destructive-empty-overwrite" };
  }
  return { accept: true };
}
