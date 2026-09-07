import { describe, expect, it } from "vitest";
import { shouldUseStudioRichFirebaseEmulators } from "./firebaseServices.js";

describe("shouldUseStudioRichFirebaseEmulators", () => {
  it("defaults to production services", () => {
    expect(shouldUseStudioRichFirebaseEmulators({})).toBe(false);
    expect(shouldUseStudioRichFirebaseEmulators({ VITE_FIREBASE_USE_EMULATORS: "false" })).toBe(
      false,
    );
  });

  it("requires an explicit true value", () => {
    expect(shouldUseStudioRichFirebaseEmulators({ VITE_FIREBASE_USE_EMULATORS: true })).toBe(true);
    expect(shouldUseStudioRichFirebaseEmulators({ VITE_FIREBASE_USE_EMULATORS: "true" })).toBe(
      true,
    );
  });
});
