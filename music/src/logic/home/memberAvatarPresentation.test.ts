import { describe, expect, it } from "vitest";
import { deriveMemberAvatarDisplay } from "./memberAvatarPresentation";
import type { MemberIdentityState } from "@studiorich/member-identity";

const INITIALIZING: MemberIdentityState = { status: "initializing", authUser: null, member: null, error: null };
const SIGNED_OUT: MemberIdentityState = { status: "signedOut", authUser: null, member: null, error: null };
const ERROR: MemberIdentityState = { status: "error", authUser: null, member: null, error: { scope: "session", code: "member/unknown", message: "x" } };

function signedIn(overrides: {
  authUserDisplayName?: string | null;
  authUserPhotoURL?: string | null;
  authUserEmail?: string | null;
  memberDisplayName?: string | null;
  memberPhotoURL?: string | null;
} = {}): MemberIdentityState {
  return {
    status: "signedIn",
    authUser: {
      uid: "u1",
      displayName: overrides.authUserDisplayName === undefined ? "Provider Name" : overrides.authUserDisplayName,
      photoURL: overrides.authUserPhotoURL === undefined ? "https://example.com/provider.png" : overrides.authUserPhotoURL,
      email: overrides.authUserEmail === undefined ? "rich@example.com" : overrides.authUserEmail,
      emailVerified: true,
      providerIds: ["google.com"],
    },
    member: {
      uid: "u1",
      displayName: overrides.memberDisplayName === undefined ? null : overrides.memberDisplayName,
      photoURL: overrides.memberPhotoURL === undefined ? null : overrides.memberPhotoURL,
      accountStatus: "active",
      createdAt: new Date(0),
      updatedAt: new Date(0),
      lastSeenAt: new Date(0),
      onboardingVersion: 1,
    },
    error: null,
  };
}

describe("deriveMemberAvatarDisplay", () => {
  it("initializing never falsely renders signed-out or signed-in", () => {
    const result = deriveMemberAvatarDisplay(INITIALIZING);
    expect(result.kind).toBe("initializing");
    expect(result.photoURL).toBeNull();
    expect(result.displayName).toBeNull();
  });

  it("signedOut renders as the actionable signed-out state", () => {
    expect(deriveMemberAvatarDisplay(SIGNED_OUT).kind).toBe("signed-out");
  });

  it("an unresolved error also renders as signed-out -- never stuck as initializing, never a fabricated identity", () => {
    const result = deriveMemberAvatarDisplay(ERROR);
    expect(result.kind).toBe("signed-out");
    expect(result.displayName).toBeNull();
  });

  it("signed-in prefers the member's own edited displayName/photoURL over the raw provider snapshot", () => {
    const result = deriveMemberAvatarDisplay(signedIn({ memberDisplayName: "Edited Name", memberPhotoURL: "https://example.com/member.png" }));
    expect(result.kind).toBe("signed-in");
    expect(result.displayName).toBe("Edited Name");
    expect(result.photoURL).toBe("https://example.com/member.png");
  });

  it("signed-in falls back to the provider's own displayName/photoURL when the member hasn't set one", () => {
    const result = deriveMemberAvatarDisplay(signedIn());
    expect(result.displayName).toBe("Provider Name");
    expect(result.photoURL).toBe("https://example.com/provider.png");
  });

  it("deterministic initials fallback when no photoURL exists at all", () => {
    const result = deriveMemberAvatarDisplay(signedIn({ authUserPhotoURL: null, authUserDisplayName: "Richie Lau" }));
    expect(result.photoURL).toBeNull();
    expect(result.initials).toBe("RL");
  });

  it("an empty-string photoURL is treated the same as no photo", () => {
    const result = deriveMemberAvatarDisplay(signedIn({ authUserPhotoURL: "" }));
    expect(result.photoURL).toBeNull();
  });

  it("falls back to email-derived initials when no display name exists anywhere", () => {
    const result = deriveMemberAvatarDisplay(signedIn({ authUserDisplayName: null, authUserPhotoURL: null, authUserEmail: "solo@example.com" }));
    expect(result.initials).toBe("S");
  });

  it("initials is null when neither a name nor an email exists", () => {
    const result = deriveMemberAvatarDisplay(signedIn({ authUserDisplayName: null, authUserPhotoURL: null, authUserEmail: null }));
    expect(result.initials).toBeNull();
  });

  it("email always reflects the real auth identity, never the editable member profile", () => {
    const result = deriveMemberAvatarDisplay(signedIn({ authUserEmail: "real@example.com" }));
    expect(result.email).toBe("real@example.com");
  });
});
