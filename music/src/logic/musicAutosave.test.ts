import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlayProject } from "../data/playProjectTypes";

// MUSIC P0 Clean Library Foundation — Step A. Reproduces the exact
// concurrent-save race that could previously regress the persisted
// `current` record, then proves the write queue fixes it. No test file
// previously existed for this module despite its own header comment
// declaring it the sole path every persistent MUSIC write must go through.
//
// musicStateStore.ts is mocked entirely — this is a serialization-order
// test, not an IndexedDB integration test, and the real store's calls are
// controlled here with manual delays to reproduce the race deterministically
// (a real IDB timing race would be flaky to reproduce directly).

const savedCurrentStates: string[] = []; // records reason of each saveCurrentState call, in call order
let releaseSlowCheckpoint: (() => void) | null = null;

vi.mock("./musicStateStore", () => ({
  saveCurrentState: vi.fn(async (_state: PlayProject, reason: string) => {
    savedCurrentStates.push(reason);
  }),
  loadCurrentState: vi.fn(async () => null),
  saveLastKnownGood: vi.fn(async () => {}),
  loadLastKnownGood: vi.fn(async () => null),
  saveCheckpoint: vi.fn(async (reason: string) => {
    if (reason === "update_library") {
      // Simulate the slow "risky" checkpoint path — held open until the
      // test explicitly releases it, so a faster ordinary save queued
      // right after has every opportunity to race ahead of it.
      await new Promise<void>((resolve) => { releaseSlowCheckpoint = resolve; });
    }
    return `checkpoint:${reason}`;
  }),
  listCheckpointSummaries: vi.fn(async () => []),
  loadCheckpoint: vi.fn(async () => null),
  deleteOldCheckpoints: vi.fn(async () => {}),
  updateCheckpointManifest: vi.fn(() => {}),
  readCheckpointManifest: vi.fn(() => []),
  loadStateRecord: vi.fn(async () => null),
}));

function fakeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

function project(trackCount: number, reason?: string): PlayProject {
  return {
    schemaVersion: "play-project-v2",
    libraryTracks: Array.from({ length: trackCount }, (_, i) => ({ trackId: `t${i}`, sourceOwner: "studiorich" })),
    playlists: [{ playlistId: "pl_default", title: "My Mix", slots: [] }],
    crates: [],
    lastSaveReason: reason,
  } as unknown as PlayProject;
}

describe("saveMusicState — write queue serialization", () => {
  beforeEach(() => {
    vi.resetModules();
    savedCurrentStates.length = 0;
    releaseSlowCheckpoint = null;
    vi.stubGlobal("localStorage", fakeLocalStorage());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("REGRESSION: a slower earlier risky save no longer overwrites a faster later ordinary save's persisted result", async () => {
    const { saveMusicState, primeStateCache } = await import("./musicAutosave");

    primeStateCache(project(50));

    // Save #1: a "risky" reason (checkpoints first, slowly — held open by the mock above).
    const result1 = saveMusicState(project(51), { reason: "update_library" });
    expect(result1.ok).toBe(true);

    // Save #2: fired immediately after, an ordinary edit — must win and be
    // the LAST thing actually persisted, matching call order.
    const result2 = saveMusicState(project(52), { reason: "user_update_playlist" });
    expect(result2.ok).toBe(true);

    // Give save #2's queued work a chance to run if (incorrectly) unblocked.
    await new Promise((r) => setTimeout(r, 20));
    // Nothing should have landed yet — save #1's checkpoint is still held open,
    // and the queue must not let save #2 run ahead of it.
    expect(savedCurrentStates).toEqual([]);

    // Release save #1's slow checkpoint — now the queue can proceed.
    releaseSlowCheckpoint?.();
    await new Promise((r) => setTimeout(r, 20));

    // Both writes land, strictly in call order — save #1's write, THEN
    // save #2's — so the persisted `current` record ends up as save #2's
    // state, never regressed back to save #1's stale data.
    expect(savedCurrentStates).toEqual(["update_library", "user_update_playlist"]);
  });

  it("three rapid saves land in exact call order regardless of individual timing", async () => {
    const { saveMusicState, primeStateCache } = await import("./musicAutosave");
    primeStateCache(project(10));

    saveMusicState(project(11), { reason: "user_create_playlist" });
    saveMusicState(project(12), { reason: "user_update_crate" });
    saveMusicState(project(13), { reason: "user_delete_crate" });

    await new Promise((r) => setTimeout(r, 30));
    expect(savedCurrentStates).toEqual(["user_create_playlist", "user_update_crate", "user_delete_crate"]);
  });
});
