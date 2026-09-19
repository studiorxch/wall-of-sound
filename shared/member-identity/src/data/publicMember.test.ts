import { describe, expect, it } from "vitest";
import { serializePublicMember } from "./publicMember.js";

describe("serializePublicMember", () => {
  it("exposes only stable public identity fields", () => {
    const serialized = serializePublicMember({
      uid: "firebase-uid-1",
      displayName: "Studio Member",
      photoURL: null,
      accountStatus: "active",
      createdAt: new Date(1),
      updatedAt: new Date(2),
      lastSeenAt: new Date(3),
      onboardingVersion: 1,
    });

    expect(serialized).toEqual({
      id: "firebase-uid-1",
      displayName: "Studio Member",
      photoURL: null,
    });
    expect(serialized).not.toHaveProperty("email");
    expect(serialized).not.toHaveProperty("accountStatus");
  });
});
