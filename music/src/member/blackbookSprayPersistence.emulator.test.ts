/**
 * SPRAY PERSISTENCE V1 -- integration regression test against the real
 * Firestore/Auth emulator suite and the real, currently-deployed
 * firestore.rules, using the SAME public entry points
 * (createFirebaseArtworkRepository/createFirebaseMemberIdentityAuthority)
 * the real signed-in app uses. This is the actual real-world reproduction
 * of the reported "Couldn't save that stroke" failure -- unit tests on
 * pure logic (validateArtworkMark, toBlackbookMark, etc.) all pass for
 * these payloads, because the real root cause is a Firestore PLATFORM
 * limit reached only once a Mark's `geometry.points` array is large
 * enough (confirmed here: fails for a Spray Mark carrying tMs+pressure
 * once its raw point count reaches roughly 18,000-20,000, ~1.2MB
 * serialized) -- no amount of pure unit testing exercises that boundary.
 *
 * SKIPPED, not failed, when the local emulator suite isn't running --
 * this test depends on real network I/O against 127.0.0.1:8080/9099 and a
 * local Java runtime for the Firestore emulator, neither of which this
 * repo's normal `vitest run` assumes. Run manually with:
 *
 *   firebase emulators:start --only firestore,auth --project studiorich-83b1e
 *   VITE_FIREBASE_USE_EMULATORS=true npx vitest run \
 *     src/member/blackbookSprayPersistence.emulator.test.ts
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createFirebaseArtworkRepository, createFirebaseMemberIdentityAuthority } from "@studiorich/member-identity";
import { toBlackbookMark, BLACKBOOK_PAGE_SURFACE_ID, BLACKBOOK_PAGE_FRAME, type BlackbookStroke } from "./blackbookArtworkBridge";

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
 * is the only way to guarantee this test can never do that.
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

function sprayStroke(pointCount: number, opId: string): BlackbookStroke {
  const points = Array.from({ length: pointCount }, (_, i) => ({
    x: 0.1 + i * 0.0005, y: 0.2 + Math.sin(i * 0.05) * 0.05,
    tMs: i * 8, pressure: 0.5,
  }));
  return {
    operation: "spray", id: opId, points,
    style: { color: "#e2572b", width: 24, opacity: 0.6 },
    capId: "studiorich-stock",
  };
}

const reachable = await emulatorReachable();

describe.skipIf(!reachable)("SPRAY PERSISTENCE V1 -- real Firestore emulator regression", () => {
  const artworkRepository = createFirebaseArtworkRepository(import.meta.env);
  const createArtwork = (artworkRepository.createArtwork ?? artworkRepository.createMapArtwork).bind(artworkRepository);
  const memberIdentity = createFirebaseMemberIdentityAuthority(import.meta.env);
  let uid: string;

  beforeAll(async () => {
    await memberIdentity.start();
    await memberIdentity.createAccountWithEmailPassword(`spray-persistence-test-${Date.now()}@example.com`, "password123");
    for (let i = 0; i < 50; i++) {
      const state = memberIdentity.getState();
      if (state.status === "signedIn") { uid = state.member.uid; return; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("never reached signedIn state");
  }, 20000);

  it("a Spray stroke at blackbookRuntime.ts's own MAX_SPRAY_RAW_POINTS ceiling (4000 points, tMs+pressure) saves successfully -- the exact shape a real long gesture now persists", async () => {
    const stroke = sprayStroke(4000, "op-at-cap");
    const mark = toBlackbookMark(stroke, "mark-at-cap");
    const artwork = await createArtwork({
      creatorId: uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME,
    });
    expect(artwork.marks).toHaveLength(1);
    expect(artwork.marks[0].geometry.points).toHaveLength(4000);
  }, 30000);

  it("documents the actual platform failure this batch fixed: an UNCAPPED Spray stroke (20,000 points, tMs+pressure) is rejected by Firestore's own rules-evaluation resource limit -- confirms the real root cause, not a guess", async () => {
    const stroke = sprayStroke(20000, "op-uncapped");
    const mark = toBlackbookMark(stroke, "mark-uncapped");
    await expect(
      createArtwork({ creatorId: uid, surfaceId: BLACKBOOK_PAGE_SURFACE_ID, mark, artworkType: "blank", pageFrame: BLACKBOOK_PAGE_FRAME }),
    ).rejects.toMatchObject({ code: "permission-denied" });
  }, 30000);
});
