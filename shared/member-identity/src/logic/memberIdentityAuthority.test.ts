import { describe, expect, it, vi } from "vitest";
import type { CanonicalAuthUser, StudioRichMember } from "../data/memberTypes.js";
import type { MemberRepository } from "./memberRepository.js";
import {
  MemberIdentityActionError,
  StudioRichMemberIdentityAuthority,
  type AuthGateway,
} from "./memberIdentityAuthority.js";

const authUser: CanonicalAuthUser = {
  uid: "member-1",
  displayName: "StudioRich Member",
  photoURL: null,
  email: "member@example.com",
  emailVerified: true,
  providerIds: ["password"],
};

const member: StudioRichMember = {
  uid: "member-1",
  displayName: "StudioRich Member",
  photoURL: null,
  accountStatus: "active",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  lastSeenAt: new Date("2026-01-01T00:00:00Z"),
  onboardingVersion: 1,
};

class FakeAuthGateway implements AuthGateway {
  readonly configureDurablePersistence = vi.fn(async () => undefined);
  readonly signInWithEmailPassword = vi.fn(async () => undefined);
  readonly createAccountWithEmailPassword = vi.fn(async () => undefined);
  readonly signInWithGoogle = vi.fn(async () => undefined);
  readonly signOut = vi.fn(async () => undefined);
  subscribeCount = 0;
  unsubscribeCount = 0;
  private onUser: ((user: CanonicalAuthUser | null) => void) | null = null;
  private onError: ((error: unknown) => void) | null = null;

  observeAuthState(
    onUser: (user: CanonicalAuthUser | null) => void,
    onError: (error: unknown) => void,
  ): () => void {
    this.subscribeCount += 1;
    this.onUser = onUser;
    this.onError = onError;
    return () => {
      this.unsubscribeCount += 1;
      this.onUser = null;
      this.onError = null;
    };
  }

  emitUser(user: CanonicalAuthUser | null): void {
    this.onUser?.(user);
  }

  emitError(error: unknown): void {
    this.onError?.(error);
  }
}

function repository(): MemberRepository {
  return {
    getMember: vi.fn(async () => member),
    ensureMemberForAuthUser: vi.fn(async () => member),
    updateLastSeen: vi.fn(async () => member),
  };
}

describe("StudioRichMemberIdentityAuthority", () => {
  it("configures durable persistence once and restores a signed-in member", async () => {
    const auth = new FakeAuthGateway();
    const members = repository();
    const authority = new StudioRichMemberIdentityAuthority(auth, members);

    await Promise.all([authority.start(), authority.start()]);
    auth.emitUser(authUser);

    await vi.waitFor(() => expect(authority.getState().status).toBe("signedIn"));
    expect(auth.configureDurablePersistence).toHaveBeenCalledOnce();
    expect(auth.subscribeCount).toBe(1);
    expect(members.ensureMemberForAuthUser).toHaveBeenCalledWith(authUser);
    expect(authority.getState()).toEqual({
      status: "signedIn",
      authUser,
      member,
      error: null,
    });
  });

  it("represents the initial signed-out state", async () => {
    const auth = new FakeAuthGateway();
    const authority = new StudioRichMemberIdentityAuthority(auth, repository());

    await authority.start();
    auth.emitUser(null);

    expect(authority.getState().status).toBe("signedOut");
  });

  it("wires email sign-in, account creation, Google sign-in, and sign-out", async () => {
    const auth = new FakeAuthGateway();
    const authority = new StudioRichMemberIdentityAuthority(auth, repository());
    await authority.start();

    await authority.signInWithEmailPassword("member@example.com", "password");
    await authority.createAccountWithEmailPassword("new@example.com", "password");
    await authority.signInWithGoogle();
    await authority.signOut();
    auth.emitUser(null);

    expect(auth.signInWithEmailPassword).toHaveBeenCalledWith(
      "member@example.com",
      "password",
    );
    expect(auth.createAccountWithEmailPassword).toHaveBeenCalledWith(
      "new@example.com",
      "password",
    );
    expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(authority.getState().status).toBe("signedOut");
  });

  it("does not report signed-in when member bootstrap fails", async () => {
    const auth = new FakeAuthGateway();
    const members = repository();
    vi.mocked(members.ensureMemberForAuthUser).mockRejectedValueOnce(
      Object.assign(new Error("unavailable"), { code: "firestore/unavailable" }),
    );
    const authority = new StudioRichMemberIdentityAuthority(auth, members);
    await authority.start();

    auth.emitUser(authUser);

    await vi.waitFor(() => expect(authority.getState().status).toBe("error"));
    expect(authority.getState()).toMatchObject({
      status: "error",
      authUser,
      member: null,
      error: { scope: "member", code: "firestore/unavailable" },
    });
  });

  it("surfaces safe auth errors and cleans up its listener", async () => {
    const auth = new FakeAuthGateway();
    auth.signInWithEmailPassword.mockRejectedValueOnce(
      Object.assign(new Error("raw backend detail"), { code: "auth/invalid-credential" }),
    );
    const authority = new StudioRichMemberIdentityAuthority(auth, repository());
    await authority.start();

    await expect(
      authority.signInWithEmailPassword("member@example.com", "wrong"),
    ).rejects.toBeInstanceOf(MemberIdentityActionError);
    expect(authority.getState()).toMatchObject({
      status: "error",
      error: {
        scope: "signIn",
        code: "auth/invalid-credential",
        message: "The email or password is incorrect.",
      },
    });

    authority.stop();
    expect(auth.unsubscribeCount).toBe(1);
    expect(authority.getState().status).toBe("signedOut");
  });

  it("surfaces auth-listener failures", async () => {
    const auth = new FakeAuthGateway();
    const authority = new StudioRichMemberIdentityAuthority(auth, repository());
    await authority.start();

    auth.emitError(Object.assign(new Error("offline"), { code: "auth/network-request-failed" }));

    expect(authority.getState()).toMatchObject({
      status: "error",
      error: { scope: "session", code: "auth/network-request-failed" },
    });
  });
});
