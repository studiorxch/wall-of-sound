import { describe, expect, it } from "vitest";
import type { CanonicalAuthUser, StudioRichMember } from "../data/memberTypes.js";
import { planMemberBootstrap } from "./memberBootstrap.js";

const authUser: CanonicalAuthUser = {
  uid: "member-1",
  displayName: "Provider Name",
  photoURL: "https://example.com/provider-photo.jpg",
  email: "member@example.com",
  emailVerified: true,
  providerIds: ["password"],
};

describe("planMemberBootstrap", () => {
  it("creates the narrow V1 document for a missing member", () => {
    const timestamp = Symbol("serverTimestamp");
    expect(planMemberBootstrap(null, authUser, timestamp)).toEqual({
      kind: "create",
      data: {
        uid: "member-1",
        displayName: "Provider Name",
        photoURL: "https://example.com/provider-photo.jpg",
        accountStatus: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        lastSeenAt: timestamp,
        onboardingVersion: 1,
      },
    });
  });

  it("touches only lifecycle timestamps for an existing member", () => {
    const existing: StudioRichMember = {
      uid: "member-1",
      displayName: "User-edited Name",
      photoURL: "https://example.com/user-photo.jpg",
      accountStatus: "active",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      lastSeenAt: new Date("2026-01-02T00:00:00Z"),
      onboardingVersion: 1,
    };
    const timestamp = Symbol("serverTimestamp");
    const plan = planMemberBootstrap(existing, authUser, timestamp);

    expect(plan).toEqual({
      kind: "updateLastSeen",
      data: { updatedAt: timestamp, lastSeenAt: timestamp },
    });
    expect(Object.keys(plan.data)).toEqual(["updatedAt", "lastSeenAt"]);
  });

  it("rejects an existing document bound to a different UID", () => {
    const existing = {
      uid: "other-member",
    } as StudioRichMember;

    expect(() => planMemberBootstrap(existing, authUser, new Date())).toThrow(
      "member_uid_mismatch",
    );
  });
});
