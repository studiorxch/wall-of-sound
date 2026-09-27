/**
 * BLACKBOOK CLEAR + Single-Step Undo V1 -- integration regression test
 * against the real Firestore/Auth emulator suite and the real,
 * currently-local (NOT deployed -- see this batch's own "no production
 * deployment" constraint) firestore.rules, proving CLEAR's actual
 * persisted-state guarantees end to end: `replaceOwnedArtworkMarks`
 * genuinely replaces an Artwork's Marks in one write, never deletes the
 * document when Marks become empty (unlike `removeOwnedArtworkMark`),
 * and a restore-via-Undo write brings the Marks back exactly.
 *
 * SAFETY-CRITICAL gate: `reachable` below is derived from
 * `emulatorConfigured()`, which checks the app's own
 * `VITE_FIREBASE_USE_EMULATORS` env value directly -- NEVER mere port
 * reachability. See blackbookSprayPersistence.emulator.test.ts's own doc
 * for the exact incident this gating pattern exists to prevent (a prior
 * batch's test fell through to PRODUCTION Firebase when the emulator was
 * reachable but the app wasn't actually configured to use it). Absence of
 * emulator configuration must never imply permission to fall through to
 * production -- this test SKIPS, never runs against anything else.
 *
 * Run manually with:
 *   firebase emulators:start --only firestore,auth --project studiorich-83b1e
 *   VITE_FIREBASE_USE_EMULATORS=true npx vitest run \
 *     src/member/blackbookClearPersistence.emulator.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createFirebaseArtworkRepository, createFirebaseMemberIdentityAuthority } from "@studiorich/member-identity";
import { toBlackbookMark, BLACKBOOK_PAGE_SURFACE_ID, BLACKBOOK_PAGE_FRAME, type BlackbookStroke } from "./blackbookArtworkBridge";

function emulatorConfigured(): boolean {
  const value = (import.meta.env as Record<string, unknown>).VITE_FIREBASE_USE_EMULATORS;
  return value === true || value === "true";
}

async function emulatorReachable(): Promise<boolean> {
  if (!emulatorConfigured()) return false;
  try {
    const response = await fetch("http://127.0.0.1:8080/", { signal: AbortSignal.timeout(500) });
    return response.status < 500;
  } catch {
    return false;
  }
}

function pencilStroke(id: string, offset = 0): BlackbookStroke {
  return { operation: "pencil", id, points: [{ x: 0.1 + offset, y: 0.2 }, { x: 0.2 + offset, y: 0.3 }], style: { color: "#171412", width: 5, opacity: 0.82 } };
}

function sprayStroke(id: string, offset = 0): BlackbookStroke {
  return {
    operation: "spray", id,
    points: [{ x: 0.3 + offset, y: 0.4, tMs: 0, pressure: 0.5 }, { x: 0.4 + offset, y: 0.5, tMs: 30, pressure: 0.5 }],
    style: { color: "#e2572b", width: 24, opacity: 0.6 }, capId: "studiorich-stock",
  };
}

const reachable = await emulatorReachable();

describe.skipIf(!reachable)("BLACKBOOK CLEAR + Single-Step Undo V1 -- real Firestore emulator regression", () => {
  const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
  const createArtwork = (artworkRepository.createArtwork ?? artworkRepository.createMapArtwork).bind(artworkRepository);
  const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
  let uid: string;

  beforeAll(async () => {
    await memberIdentity.start();
    await memberIdentity.createAccountWithEmailPassword(`clear-persistence-test-${Date.now()}@example.com`, "password123");
    for (let i = 0; i < 50; i++) {
      const state = memberIdentity.getState();
      if (state.status === "signedIn") { uid = state.member.uid; return; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("never reached signedIn state");
  }, 20000);

  it("A -> NEW/B -> draw pencil+spray on B -> CLEAR -> reload -> B is empty but still exists -> UNDO -> reload -> B's Marks are restored -> A is untouched", async () => {
    // Artwork A: a separate, untouched control.
    const markA = toBlackbookMark(pencilStroke("op-a"), "mark-a");
    const artworkA = await createArtwork({ creatorId: uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark: markA, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME });

    // Artwork B: materializes via NEW's own first-mark path (one ordinary tool + Spray, proving this is Artwork-lifecycle behavior, not tool-specific).
    const firstMarkB = toBlackbookMark(pencilStroke("op-b-1"), "mark-b-1");
    let artworkB = await createArtwork({ creatorId: uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark: firstMarkB, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME });
    const secondMarkB = toBlackbookMark(sprayStroke("op-b-2"), "mark-b-2");
    artworkB = await artworkRepository.appendOwnedArtworkMark(artworkB.id, uid, secondMarkB);
    expect(artworkB.marks).toHaveLength(2);
    const preClearMarks = artworkB.marks;

    // CLEAR: one write, marks -> [].
    const clearedArtwork = await artworkRepository.replaceOwnedArtworkMarks!(artworkB.id, uid, []);
    expect(clearedArtwork.id).toBe(artworkB.id); // same Artwork identity, never a new one
    expect(clearedArtwork.marks).toHaveLength(0);

    // Reload simulation: fetch fresh from the repository, exactly as hydrate() would.
    const afterClearReload = (await artworkRepository.listOwnedArtwork!(uid)).find((a) => a.id === artworkB.id);
    expect(afterClearReload).toBeDefined(); // the Artwork document still exists -- CLEAR never deletes it
    expect(afterClearReload?.marks).toHaveLength(0);

    // UNDO the clear: one write, marks -> the exact pre-clear snapshot.
    const restoredArtwork = await artworkRepository.replaceOwnedArtworkMarks!(artworkB.id, uid, preClearMarks);
    expect(restoredArtwork.marks).toHaveLength(2);
    expect(restoredArtwork.marks.map((m) => m.id)).toEqual(preClearMarks.map((m) => m.id));

    // Reload again: the restored state persists.
    const afterUndoReload = (await artworkRepository.listOwnedArtwork!(uid)).find((a) => a.id === artworkB.id);
    expect(afterUndoReload?.marks).toHaveLength(2);
    expect(afterUndoReload?.marks.map((m) => m.id).sort()).toEqual(["mark-b-1", "mark-b-2"]);

    // Artwork A was never touched by any of this.
    const artworkAAfter = (await artworkRepository.listOwnedArtwork!(uid)).find((a) => a.id === artworkA.id);
    expect(artworkAAfter?.marks).toHaveLength(1);
    expect(artworkAAfter?.marks[0].id).toBe("mark-a");
  }, 30000);

  it("CLEAR is idempotent/safe when the Artwork is already empty -- calling it again does not error or change anything", async () => {
    const mark = toBlackbookMark(pencilStroke("op-idempotent"), "mark-idempotent");
    const artwork = await createArtwork({ creatorId: uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME });
    await artworkRepository.replaceOwnedArtworkMarks!(artwork.id, uid, []);
    const clearedAgain = await artworkRepository.replaceOwnedArtworkMarks!(artwork.id, uid, []);
    expect(clearedAgain.id).toBe(artwork.id);
    expect(clearedAgain.marks).toHaveLength(0);
  }, 20000);
});
