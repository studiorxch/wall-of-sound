import { describe, expect, it } from "vitest";
import type { PlaylistRecord } from "../data/playProjectTypes";
import {
  applySamplerBankFilesystemHydration,
  applySamplerBankWriteResult,
  applySamplerBankWriteSkip,
  authorizeSamplerBankDeletion,
  createInitialSamplerBankPersistenceState,
  evaluateSamplerBankWrite,
  evaluateServerSideBankWrite,
  suspendSamplerBankPersistence,
} from "./samplerBankPersistence";

function bank(id: string): PlaylistRecord {
  return {
    playlistId: id,
    title: id,
    playlistKind: "reference_overlay",
    slots: [],
    curve: {},
    locks: [],
    orphans: [],
    targetDurationMinutes: 10,
  } as unknown as PlaylistRecord;
}

function regularPlaylist(id: string): PlaylistRecord {
  return {
    playlistId: id,
    title: id,
    slots: [],
    curve: {},
    locks: [],
    orphans: [],
    targetDurationMinutes: 10,
  } as unknown as PlaylistRecord;
}

const SEVEN_REAL_BANKS = Array.from({ length: 7 }, (_, i) => bank(`pl_real_${i}`));

describe("0812D — reproduce the former failure, then prove it's fixed", () => {
  it("REGRESSION: a write attempted before filesystem hydration would previously overwrite a real bank set with empty content — now it is skipped", () => {
    // This is the exact original sequence: hasHydratedProject flips true
    // (cold boot, or handleOpenEmptyTemporarySession), but the async
    // filesystem-authoritative bank read/merge (App.tsx:5293-5317) has not
    // completed yet, so `playlists` still holds the bank-less default.
    const state = createInitialSamplerBankPersistenceState();
    expect(state.filesystemHydrated).toBe(false);

    const defaultPlaylistsBeforeFilesystemMerge: PlaylistRecord[] = [regularPlaylist("My Mix")];
    const decision = evaluateSamplerBankWrite(state, /* hasHydratedProject */ true, defaultPlaylistsBeforeFilesystemMerge);

    // Before this repair, nothing stopped this from reaching fetch() and
    // POSTing [] over the real banks.json. Now it must be refused outright,
    // never reaching the point of even knowing whether it would be
    // destructive — because there is no confirmed on-disk baseline yet to
    // safely compare against.
    expect(decision).toEqual({ action: "skip", reason: "not-hydrated" });
  });

  it("REGRESSION: 'Open Empty Temporary Session' no longer writes empty banks even though playlists starts bank-less", () => {
    // Simulates handleOpenEmptyTemporarySession: hasHydratedProject becomes
    // true, but the session is explicitly marked non-persisting.
    let state = createInitialSamplerBankPersistenceState();
    state = suspendSamplerBankPersistence(state);
    // Even if filesystem hydration somehow also completed (e.g. a prior
    // tab's hydration raced in), suspension must still win.
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);

    const decision = evaluateSamplerBankWrite(state, true, [regularPlaylist("My Mix")]);
    expect(decision).toEqual({ action: "skip", reason: "persistence-suspended" });
  });
});

describe("cold startup", () => {
  it("skips every write until filesystem hydration completes, regardless of hasHydratedProject", () => {
    const state = createInitialSamplerBankPersistenceState();
    const decision = evaluateSamplerBankWrite(state, true, SEVEN_REAL_BANKS);
    expect(decision.action).toBe("skip");
  });

  it("also skips when hasHydratedProject itself is still false, even if filesystem hydration somehow finished", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    const decision = evaluateSamplerBankWrite(state, /* hasHydratedProject */ false, SEVEN_REAL_BANKS);
    expect(decision).toEqual({ action: "skip", reason: "not-hydrated" });
  });
});

describe("ordinary hydrated autosave", () => {
  it("allows a write once both hydration steps complete and the change is non-destructive", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    const withNewBank = [...SEVEN_REAL_BANKS, bank("pl_new")];
    const decision = evaluateSamplerBankWrite(state, true, withNewBank);
    expect(decision).toEqual({ action: "write", deletionAuthorized: false, expectedPriorCount: 7 });
  });

  it("advances the known-good baseline and revision after a confirmed successful write", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    const withNewBank = [...SEVEN_REAL_BANKS, bank("pl_new")];
    state = applySamplerBankWriteResult(state, withNewBank);
    expect(state.lastKnownGoodBanks).toEqual(withNewBank);
    expect(state.writeRevision).toBe(1);
  });
});

describe("Machine Life / Suno workspace verification (unrelated feature use)", () => {
  it("a fresh session used only to test an unrelated workspace never overwrites a real on-disk bank set with its own empty in-memory state", () => {
    // The exact real-world trigger: a tester opens a session to exercise
    // Machine Life or Suno, never touches sampler banks, but the session's
    // own playlists state is bank-less by default.
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    const decision = evaluateSamplerBankWrite(state, true, [regularPlaylist("My Mix")]);
    expect(decision).toEqual({ action: "skip", reason: "destructive-empty-overwrite" });
  });
});

describe("workspace switching", () => {
  it("switching viewMode (Machine Life <-> Suno <-> playlists) never changes persistence state on its own — hydration is idempotent", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    // A second hydration call (should never happen in practice, but the
    // function must not regress the baseline if it does).
    const rehydrated = applySamplerBankFilesystemHydration(state, []);
    expect(rehydrated.lastKnownGoodBanks).toEqual(SEVEN_REAL_BANKS);
  });
});

describe("reload", () => {
  it("a fresh page load always starts from a safe, unhydrated state", () => {
    const state = createInitialSamplerBankPersistenceState();
    expect(state.filesystemHydrated).toBe(false);
    expect(state.lastKnownGoodBanks).toBeNull();
    expect(evaluateSamplerBankWrite(state, true, []).action).toBe("skip");
  });
});

describe("interrupted / failed writes", () => {
  it("a skipped or rejected write never advances the known-good baseline or revision", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    const before = state;
    state = applySamplerBankWriteSkip(state);
    expect(state.lastKnownGoodBanks).toEqual(before.lastKnownGoodBanks);
    expect(state.writeRevision).toBe(before.writeRevision);
  });

  it("a skipped write still consumes any pending deletion authorization, preventing it leaking to a later unrelated write", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    state = authorizeSamplerBankDeletion(state);
    expect(state.deletionAuthorized).toBe(true);
    state = applySamplerBankWriteSkip(state); // simulates a network error/rejection
    expect(state.deletionAuthorized).toBe(false);
  });
});

describe("restart after failure", () => {
  it("a legitimate write succeeds normally on the next attempt after a prior rejection", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    // First attempt: destructive, rejected.
    let decision = evaluateSamplerBankWrite(state, true, []);
    expect(decision.action).toBe("skip");
    state = applySamplerBankWriteSkip(state);
    // Second attempt: a legitimate additive change.
    const withNewBank = [...SEVEN_REAL_BANKS, bank("pl_new")];
    decision = evaluateSamplerBankWrite(state, true, withNewBank);
    expect(decision.action).toBe("write");
  });
});

describe("authorized deletion", () => {
  it("an explicitly authorized empty-over-nonempty write is allowed", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    state = authorizeSamplerBankDeletion(state);
    const decision = evaluateSamplerBankWrite(state, true, []);
    expect(decision).toEqual({ action: "write", deletionAuthorized: true, expectedPriorCount: 7 });
  });

  it("authorization is single-use — the next empty write after a successful authorized deletion is blocked again", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    state = authorizeSamplerBankDeletion(state);
    state = applySamplerBankWriteResult(state, []); // the authorized deletion succeeds
    expect(state.deletionAuthorized).toBe(false);

    // Some later, unrelated code path produces an empty array again without
    // authorization — must now be blocked, even though the baseline is
    // already empty... except the baseline IS empty, so this isn't
    // destructive at all (0 -> 0). Re-verify with a real bank present.
    state = applySamplerBankWriteResult(state, [bank("pl_after_deletion")]);
    const decision = evaluateSamplerBankWrite(state, true, []);
    expect(decision).toEqual({ action: "skip", reason: "destructive-empty-overwrite" });
  });
});

describe("unrelated project saves", () => {
  it("editing a non-bank playlist never triggers the destructive-empty guard", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    const withEditedRegularPlaylist = [...SEVEN_REAL_BANKS, regularPlaylist("Edited Mix")];
    const decision = evaluateSamplerBankWrite(state, true, withEditedRegularPlaylist);
    expect(decision.action).toBe("write");
  });
});

describe("preservation of nonempty banks.json", () => {
  it("a nonempty-to-nonempty change (including a partial, non-zero shrink) is never blocked — only empty-over-nonempty is", () => {
    let state = createInitialSamplerBankPersistenceState();
    state = applySamplerBankFilesystemHydration(state, SEVEN_REAL_BANKS);
    const threeRemaining = SEVEN_REAL_BANKS.slice(0, 3);
    const decision = evaluateSamplerBankWrite(state, true, threeRemaining);
    expect(decision.action).toBe("write");
  });

  it("no baseline yet (null) never blocks a write — there is nothing known-good to protect", () => {
    const state = createInitialSamplerBankPersistenceState();
    // filesystemHydrated true but somehow no baseline was ever set — an
    // edge case the type system allows; the guard must not crash or
    // spuriously block.
    const hydratedNoBaseline = { ...state, filesystemHydrated: true };
    const decision = evaluateSamplerBankWrite(hydratedNoBaseline, true, []);
    expect(decision.action).toBe("write");
  });
});

describe("stale saves / competing requests (server-side decision logic)", () => {
  it("accepts a write when the on-disk count matches what the client expected", () => {
    expect(evaluateServerSideBankWrite(7, 7, 8, false)).toEqual({ accept: true });
  });

  it("rejects a write when the on-disk count has moved since the client's last known-good read (stale/competing write)", () => {
    expect(evaluateServerSideBankWrite(9, 7, 8, false)).toEqual({ accept: false, reason: "stale-revision" });
  });

  it("rejects an empty overwrite of a nonempty file server-side even if the client's expectedPriorCount matches (defense in depth)", () => {
    expect(evaluateServerSideBankWrite(7, 7, 0, false)).toEqual({ accept: false, reason: "destructive-empty-overwrite" });
  });

  it("accepts an authorized empty overwrite", () => {
    expect(evaluateServerSideBankWrite(7, 7, 0, true)).toEqual({ accept: true });
  });

  it("accepts the very first write when nothing exists on disk yet", () => {
    expect(evaluateServerSideBankWrite(0, 0, 1, false)).toEqual({ accept: true });
  });
});
