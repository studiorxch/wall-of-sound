import { afterEach, describe, expect, it, vi } from "vitest";
import { createHostAwareMemberIdentity } from "./hostAwareMemberIdentity";
import type { MemberIdentityAuthority, MemberIdentityState, MemberIdentityStateListener } from "@studiorich/member-identity";

const SIGNED_OUT: MemberIdentityState = { status: "signedOut", authUser: null, member: null, error: null };
const SIGNED_IN: MemberIdentityState = {
  status: "signedIn",
  authUser: { uid: "u1", displayName: "Rich", photoURL: null, email: "rich@example.com", emailVerified: true, providerIds: ["google.com"] },
  member: { uid: "u1", displayName: "Rich", photoURL: null, accountStatus: "active", createdAt: new Date(0), updatedAt: new Date(0), lastSeenAt: new Date(0), onboardingVersion: 1 },
  error: null,
};

function fakeAuthority(initial: MemberIdentityState = SIGNED_OUT): MemberIdentityAuthority {
  const listeners = new Set<MemberIdentityStateListener>();
  let state = initial;
  return {
    getState: () => state,
    subscribe: vi.fn((listener: MemberIdentityStateListener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    signInWithEmailPassword: vi.fn(async () => {}),
    createAccountWithEmailPassword: vi.fn(async () => {}),
    signInWithGoogle: vi.fn(async () => { state = SIGNED_IN; listeners.forEach((l) => l(state)); }),
    signInWithCredential: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    updateProfile: vi.fn(async () => {}),
  };
}

function stubStandalone(): void {
  vi.stubGlobal("location", { search: "", origin: "http://local" } as unknown as Location);
  const win = { parent: undefined } as unknown as Window & typeof globalThis;
  win.parent = win;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {} as Document);
}

function stubHosted(host: { version: 1; getMemberIdentity: (source: Document, identity: unknown) => MemberIdentityAuthority | null } | undefined): void {
  vi.stubGlobal("location", { search: "?host=home&homeRuntime=r1&homeNavigation=1", origin: "http://local" } as unknown as Location);
  const parentWin = { StudioRichHome: host, location: { origin: "http://local" } } as unknown as Window;
  // Fast, delay-ignoring setTimeout -- this module's own `wait()` calls
  // `window.setTimeout`; tests care about the retry-then-fail-closed
  // BEHAVIOR, never the real 50ms/attempt wall-clock budget.
  const win = { parent: parentWin, setTimeout: (fn: () => void) => globalThis.setTimeout(fn, 0) } as unknown as Window & typeof globalThis;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {} as Document);
}

afterEach(() => vi.unstubAllGlobals());

describe("createHostAwareMemberIdentity -- standalone (not HOME-hosted)", () => {
  it("returns the local authority unchanged, never wrapped", () => {
    stubStandalone();
    const local = fakeAuthority();
    const result = createHostAwareMemberIdentity(() => local);
    expect(result).toBe(local);
  });
});

describe("createHostAwareMemberIdentity -- hosted", () => {
  it("never constructs/starts a local authority while hosted", async () => {
    const parentAuthority = fakeAuthority();
    stubHosted({ version: 1, getMemberIdentity: () => parentAuthority });
    const createLocal = vi.fn(fakeAuthority);
    const result = createHostAwareMemberIdentity(createLocal);
    await result.start();
    expect(createLocal).not.toHaveBeenCalled();
  });

  it("starts in 'initializing' and never falsely reports signed-out before resolution", () => {
    const parentAuthority = fakeAuthority();
    stubHosted({ version: 1, getMemberIdentity: () => parentAuthority });
    const result = createHostAwareMemberIdentity(fakeAuthority);
    expect(result.getState().status).toBe("initializing");
  });

  it("resolves the parent's authority and forwards its state once the bridge succeeds", async () => {
    const parentAuthority = fakeAuthority(SIGNED_IN);
    stubHosted({ version: 1, getMemberIdentity: () => parentAuthority });
    const result = createHostAwareMemberIdentity(fakeAuthority);
    await result.start();
    expect(result.getState().status).toBe("signedIn");
  });

  it("write methods (e.g. signInWithGoogle) reject before resolution instead of silently no-op'ing", async () => {
    stubHosted({ version: 1, getMemberIdentity: () => null }); // never resolves within this test's single synchronous check
    const result = createHostAwareMemberIdentity(fakeAuthority);
    await expect(result.signInWithGoogle()).rejects.toThrow();
  });

  it("write methods forward to the resolved parent authority once available", async () => {
    const parentAuthority = fakeAuthority();
    stubHosted({ version: 1, getMemberIdentity: () => parentAuthority });
    const result = createHostAwareMemberIdentity(fakeAuthority);
    await result.start();
    await result.signInWithGoogle();
    expect(parentAuthority.signInWithGoogle).toHaveBeenCalledOnce();
  });

  it("fails closed to an error state (never a local fallback) when the bridge never resolves", async () => {
    stubHosted({ version: 1, getMemberIdentity: () => null });
    const createLocal = vi.fn(fakeAuthority);
    const result = createHostAwareMemberIdentity(createLocal);
    await result.start();
    expect(result.getState().status).toBe("error");
    expect(createLocal).not.toHaveBeenCalled();
  });

  it("treats a missing window.parent.StudioRichHome as standalone -- detectHomeMount's own established contract (same as RADIO-01's identical check) can't distinguish this from a genuinely standalone/embedded load, so it falls back to the local authority rather than reporting hosted failure", () => {
    stubHosted(undefined);
    const local = fakeAuthority();
    const result = createHostAwareMemberIdentity(() => local);
    expect(result).toBe(local);
  });

  it("stop() never stops the underlying shared authority -- the parent owns that lifecycle", async () => {
    const parentAuthority = fakeAuthority();
    stubHosted({ version: 1, getMemberIdentity: () => parentAuthority });
    const result = createHostAwareMemberIdentity(fakeAuthority);
    await result.start();
    result.stop();
    expect(parentAuthority.stop).not.toHaveBeenCalled();
  });
});
