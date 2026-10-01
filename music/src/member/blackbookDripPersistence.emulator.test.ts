/**
 * BLACKBOOK Deterministic Drips β0.1 -- integration regression test against
 * the real Firestore/Auth emulator suite and the current local
 * firestore.rules loaded by the emulator, using the SAME public entry points
 * (createFirebaseArtworkRepository/createFirebaseMemberIdentityAuthority)
 * the real signed-in app uses, and the same template/safety precedent as
 * `blackbookSprayPersistence.emulator.test.ts`. Proves the new
 * `LocalMaterialDripMark` schema round-trips through the real repository +
 * rules path, not only through pure unit tests (dripDeposition.test.ts,
 * blackbookArtworkBridge.test.ts, firestoreArtworkRepository.test.ts,
 * artworkDocument.test.ts).
 *
 * SKIPPED, not failed, when the local emulator suite isn't running -- this
 * test depends on real network I/O against 127.0.0.1:8080/9099 and a local
 * Java runtime for the Firestore emulator, neither of which this repo's
 * normal `vitest run` assumes. Run manually with:
 *
 *   firebase emulators:start --only firestore,auth --project studiorich-83b1e
 *   VITE_FIREBASE_USE_EMULATORS=true npx vitest run \
 *     src/member/blackbookDripPersistence.emulator.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createFirebaseArtworkRepository, createFirebaseMemberIdentityAuthority } from "@studiorich/member-identity";
import { toBlackbookMark, BLACKBOOK_PAGE_SURFACE_ID, BLACKBOOK_PAGE_FRAME, type BlackbookDrip } from "./blackbookArtworkBridge";

/**
 * SAFETY-CRITICAL: this MUST gate on whether the app is actually
 * CONFIGURED to use the emulator (`VITE_FIREBASE_USE_EMULATORS`), never
 * merely on whether something happens to be listening on the emulator's
 * port. A port-reachability check alone is not sufficient -- if the
 * emulator is running but this env var is unset for whatever reason (a
 * forgotten re-export in a fresh shell, a different launch script, CI
 * misconfiguration), createFirebaseArtworkRepository/
 * createFirebaseMemberIdentityAuthority silently fall through to
 * PRODUCTION Firebase regardless of what's listening on localhost, and
 * this test would then write real data to the live studiorich-83b1e
 * project under a throwaway test account. Checking the env flag directly
 * is the only way to guarantee this test can never do that. Byte-identical
 * gate to blackbookSprayPersistence.emulator.test.ts's own -- never
 * loosened for this file.
 */
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

function dripOperation(opId: string, pointCount: number): BlackbookDrip {
  const points = Array.from({ length: pointCount }, (_, i) => ({
    x: 0.11 + Math.sin(i * 0.3) * 0.002,
    y: 0.21 + i * 0.004,
  }));
  return {
    operation: "material-drip",
    id: opId,
    points,
    originMarkId: "mark-mop-origin-test",
    targetMaterialId: "mop",
    style: { color: "#1c6e6e", width: 34, opacity: 0.55 },
  };
}

const reachable = await emulatorReachable();

describe.skipIf(!reachable)("BLACKBOOK Deterministic Drips β0.1 -- real Firestore emulator regression", () => {
  const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
  const createArtwork = (artworkRepository.createArtwork ?? artworkRepository.createMapArtwork).bind(artworkRepository);
  const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
  let uid: string;

  beforeAll(async () => {
    await memberIdentity.start();
    await memberIdentity.createAccountWithEmailPassword(`drip-persistence-test-${Date.now()}@example.com`, "password123");
    for (let i = 0; i < 50; i++) {
      const state = memberIdentity.getState();
      if (state.status === "signedIn") { uid = state.member.uid; return; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("never reached signedIn state");
  }, 20000);

  it("a valid material-drip Mark saves and round-trips exactly through the real repository/rules path", async () => {
    const operation = dripOperation("op-drip-valid", 5);
    const mark = toBlackbookMark(operation, "mark-drip-valid");
    const artwork = await createArtwork({
      creatorId: uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME,
    });
    expect(artwork.marks).toHaveLength(1);
    const savedMark = artwork.marks[0];
    expect(savedMark.type).toBe("material-drip");
    expect(savedMark.geometry.format).toBe("local-2d-drip-v1");
    expect(savedMark.geometry.points).toEqual(operation.points);
    expect(savedMark.type === "material-drip" ? savedMark.originMarkId : undefined).toBe("mark-mop-origin-test");
    expect(savedMark.type === "material-drip" ? savedMark.targetMaterialId : undefined).toBe("mop");
    expect(savedMark.type === "material-drip" ? savedMark.style : undefined).toEqual({ color: "#1c6e6e", width: 34, opacity: 0.55 });
  }, 30000);

  it("a drip exceeding firestore.rules' own 64-point hard ceiling is rejected by the real rules, not merely by client-side validation", async () => {
    const operation = dripOperation("op-drip-oversized", 65);
    const mark = toBlackbookMark(operation, "mark-drip-oversized");
    await expect(
      createArtwork({ creatorId: uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  }, 30000);
});
