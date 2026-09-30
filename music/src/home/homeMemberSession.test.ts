import { describe, expect, it, vi } from "vitest";
import { createHomeMemberSessionManager } from "./homeMemberSession";
import type { MemberIdentityAuthority, MemberIdentityState, MemberIdentityStateListener } from "@studiorich/member-identity";

const SIGNED_OUT: MemberIdentityState = { status: "signedOut", authUser: null, member: null, error: null };
const SIGNED_IN: MemberIdentityState = {
  status: "signedIn",
  authUser: { uid: "u1", displayName: "Rich", photoURL: null, email: "rich@example.com", emailVerified: true, providerIds: ["google.com"] },
  member: { uid: "u1", displayName: "Rich", photoURL: null, accountStatus: "active", createdAt: new Date(0), updatedAt: new Date(0), lastSeenAt: new Date(0), onboardingVersion: 1 },
  error: null,
};

function fakeAuthority(): MemberIdentityAuthority & { readonly listeners: Set<MemberIdentityStateListener> } {
  const listeners = new Set<MemberIdentityStateListener>();
  let state: MemberIdentityState = SIGNED_OUT;
  function setState(next: MemberIdentityState) {
    state = next;
    listeners.forEach((l) => l(state));
  }
  return {
    listeners,
    getState: vi.fn(() => state),
    subscribe: vi.fn((listener: MemberIdentityStateListener) => {
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    }),
    start: vi.fn(async () => {}),
    stop: vi.fn(),
    signInWithEmailPassword: vi.fn(async () => {}),
    createAccountWithEmailPassword: vi.fn(async () => {}),
    signInWithGoogle: vi.fn(async () => { setState(SIGNED_IN); }),
    signInWithCredential: vi.fn(async () => { setState(SIGNED_IN); }),
    signOut: vi.fn(async () => { setState(SIGNED_OUT); }),
    updateProfile: vi.fn(async () => {}),
  };
}

describe("createHomeMemberSessionManager -- one persistent hosted authority", () => {
  it("constructs the underlying authority lazily, only once, across repeated acquire() calls", () => {
    const createAuthority = vi.fn(fakeAuthority);
    const manager = createHomeMemberSessionManager(createAuthority);
    expect(createAuthority).not.toHaveBeenCalled();
    manager.acquire();
    manager.acquire();
    manager.acquire();
    expect(createAuthority).toHaveBeenCalledOnce();
  });

  it("MAP -> BLACKBOOK -> MAP (repeated swaps): every handle forwards to the SAME underlying instance", () => {
    const underlying = fakeAuthority();
    const manager = createHomeMemberSessionManager(() => underlying);
    const mapHandle = manager.acquire();
    void mapHandle.signInWithGoogle();
    expect(underlying.signInWithGoogle).toHaveBeenCalledOnce();

    const blackbookHandle = manager.acquire();
    expect(blackbookHandle.getState().status).toBe("signedIn"); // still signed in -- the swap never reconstructed the authority

    const mapHandleAgain = manager.acquire();
    expect(mapHandleAgain.getState().status).toBe("signedIn");
    expect(underlying.signInWithGoogle).toHaveBeenCalledOnce(); // never called again by the swaps themselves
  });

  it("a later caller's subscribe() replaces the earlier caller's own listener -- the old one stops receiving updates", () => {
    const underlying = fakeAuthority();
    const manager = createHomeMemberSessionManager(() => underlying);
    const mapStates: MemberIdentityState[] = [];
    const blackbookStates: MemberIdentityState[] = [];

    manager.acquire().subscribe((s) => mapStates.push(s));
    expect(underlying.listeners.size).toBe(1);

    manager.acquire().subscribe((s) => blackbookStates.push(s));
    expect(underlying.listeners.size).toBe(1); // never two live listeners for one caller at a time

    void underlying.signInWithGoogle();
    expect(blackbookStates.at(-1)?.status).toBe("signedIn");
    expect(mapStates.length).toBe(1); // MAP's own listener only got its initial replay
  });

  it("the SAME caller's own handle supports more than one live listener at once", () => {
    const underlying = fakeAuthority();
    const manager = createHomeMemberSessionManager(() => underlying);
    const handle = manager.acquire();
    const avatarStates: MemberIdentityState[] = [];
    const claimFlowStates: MemberIdentityState[] = [];
    handle.subscribe((s) => avatarStates.push(s));
    handle.subscribe((s) => claimFlowStates.push(s));
    expect(underlying.listeners.size).toBe(2);

    void underlying.signInWithGoogle();
    expect(avatarStates.at(-1)?.status).toBe("signedIn");
    expect(claimFlowStates.at(-1)?.status).toBe("signedIn");
  });

  it("child readiness/remount does not imply signed-out -- a fresh handle observes whatever state the session was already in", () => {
    const underlying = fakeAuthority();
    const manager = createHomeMemberSessionManager(() => underlying);
    void manager.acquire().signInWithGoogle();
    const seen: MemberIdentityState[] = [];
    manager.acquire().subscribe((s) => seen.push(s));
    expect(seen[0].status).toBe("signedIn"); // never reset to signedOut merely because a new surface just mounted
  });

  it("sign-out is observable from any handle, forwarded to the same underlying instance", () => {
    const underlying = fakeAuthority();
    const manager = createHomeMemberSessionManager(() => underlying);
    void manager.acquire().signInWithGoogle();
    void manager.acquire().signOut();
    expect(underlying.signOut).toHaveBeenCalledOnce();
    expect(manager.acquire().getState().status).toBe("signedOut");
  });

  it("updateProfile forwards to the same underlying instance regardless of which handle called it", () => {
    const underlying = fakeAuthority();
    const manager = createHomeMemberSessionManager(() => underlying);
    void manager.acquire().updateProfile("New Name");
    expect(underlying.updateProfile).toHaveBeenCalledWith("New Name");
  });
});
