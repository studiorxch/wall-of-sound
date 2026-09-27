/**
 * BLACKBOOK Artwork DELETE V1 -- integration regression test against the
 * real Firestore/Auth emulator suite and the real, currently-committed
 * firestore.rules (the ownership-scoped `allow delete` rule for
 * `/artworks/{artworkId}` was ALREADY present and ALREADY deployed to
 * production before this batch -- see this batch's own recon; no rules
 * change was needed or made for DELETE itself). Also proves the updated
 * `removeOwnedArtworkMark` semantics: undoing the last remaining Mark one
 * at a time now preserves the Artwork (like CLEAR), never deletes it --
 * only `deleteOwnedArtwork` does.
 *
 * SAFETY-CRITICAL gate: `reachable` is derived from `emulatorConfigured()`,
 * which checks the app's own `VITE_FIREBASE_USE_EMULATORS` env value
 * directly -- never mere port reachability. See
 * blackbookSprayPersistence.emulator.test.ts's own doc for the exact
 * incident this gating pattern exists to prevent. Absence/ambiguity of
 * emulator configuration must never imply permission to fall through to
 * production -- this test SKIPS, never runs against anything else.
 *
 * Run manually with:
 *   firebase emulators:start --only firestore,auth --project studiorich-83b1e
 *   VITE_FIREBASE_USE_EMULATORS=true npx vitest run \
 *     src/member/blackbookDeletePersistence.emulator.test.ts
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

function pencilStroke(id: string): BlackbookStroke {
  return { operation: "pencil", id, points: [{ x: 0.1, y: 0.2 }, { x: 0.2, y: 0.3 }], style: { color: "#171412", width: 5, opacity: 0.82 } };
}

interface SignedInMember {
  readonly uid: string;
  readonly email: string;
  readonly password: string;
}

async function signInFreshMember(memberIdentity: ReturnType<typeof createFirebaseMemberIdentityAuthority>): Promise<SignedInMember> {
  const email = `delete-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const password = "password123";
  await memberIdentity.start();
  await memberIdentity.createAccountWithEmailPassword(email, password);
  for (let i = 0; i < 50; i++) {
    const state = memberIdentity.getState();
    if (state.status === "signedIn") return { uid: state.member.uid, email, password };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("never reached signedIn state");
}

const reachable = await emulatorReachable();

describe.skipIf(!reachable)("BLACKBOOK Artwork DELETE V1 -- real Firestore emulator regression", () => {
  const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
  const createArtwork = (artworkRepository.createArtwork ?? artworkRepository.createMapArtwork).bind(artworkRepository);
  // ONE shared Auth session for this whole file (Firebase Auth is a
  // singleton per app -- only one "currently signed in" identity exists
  // at a time, regardless of how many MemberIdentityAuthority wrappers are
  // constructed around it). Each test that needs a DIFFERENT identity must
  // explicitly restore the owner's own session afterward before any later
  // test (or its own later assertions) reads/writes as the owner again --
  // otherwise a later call still authenticated as the "other" member would
  // be correctly, but confusingly, rejected by the exact same ownership
  // rule this test suite is trying to prove.
  const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
  let owner: SignedInMember;

  beforeAll(async () => {
    owner = await signInFreshMember(memberIdentity);
  }, 20000);

  it("the owner can delete their own Artwork -- the document no longer appears in listOwnedArtwork afterward", async () => {
    const mark = toBlackbookMark(pencilStroke("op-owner-delete"), "mark-owner-delete");
    const artwork = await createArtwork({ creatorId: owner.uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME });

    await artworkRepository.deleteOwnedArtwork(artwork.id, owner.uid);

    const afterDelete = await artworkRepository.listOwnedArtwork!(owner.uid);
    expect(afterDelete.find((a) => a.id === artwork.id)).toBeUndefined();
  }, 20000);

  it("a DIFFERENT member cannot delete another member's Artwork -- Firestore itself rejects it (not merely a hidden UI control)", async () => {
    const mark = toBlackbookMark(pencilStroke("op-security"), "mark-security");
    const artworkA = await createArtwork({ creatorId: owner.uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME });

    const otherMember = await signInFreshMember(memberIdentity);
    try {
      // The repository is a singleton keyed by Firebase app -- both
      // "members" share the same underlying Firestore client, but the
      // ACTIVE signed-in auth session (now `otherMember`) is what the
      // rules check (`resource.data.creatorId == request.auth.uid`).
      await expect(artworkRepository.deleteOwnedArtwork(artworkA.id, otherMember.uid)).rejects.toBeTruthy();
    } finally {
      // Restore the owner's own session -- required before any later
      // read/write in this file that authenticates "as the owner" again.
      await memberIdentity.signInWithEmailPassword(owner.email, owner.password);
    }

    // Artwork A must still exist, completely unaffected -- read back as its own owner.
    const stillThere = await artworkRepository.listOwnedArtwork!(owner.uid);
    expect(stillThere.find((a) => a.id === artworkA.id)).toBeDefined();
  }, 20000);

  it("removeOwnedArtworkMark: undoing the LAST remaining Mark one at a time now preserves the Artwork (like CLEAR) -- only deleteOwnedArtwork removes a document", async () => {
    const markA = toBlackbookMark(pencilStroke("op-last-a"), "mark-last-a");
    const artwork = await createArtwork({ creatorId: owner.uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark: markA, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME });

    const result = await artworkRepository.removeOwnedArtworkMark(artwork.id, owner.uid, "mark-last-a");
    // The OLD behavior returned null (document deleted) here. The new,
    // CLEAR-coherent behavior returns the surviving, now-empty Artwork.
    expect(result).not.toBeNull();
    expect(result?.id).toBe(artwork.id);
    expect(result?.marks).toHaveLength(0);

    const reloaded = await artworkRepository.listOwnedArtwork!(owner.uid);
    const stillExists = reloaded.find((a) => a.id === artwork.id);
    expect(stillExists).toBeDefined();
    expect(stillExists?.marks).toHaveLength(0);
  }, 20000);
});
