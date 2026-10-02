import { describe, expect, it } from "vitest";
import {
  resolveStudioRichFirebaseEmulatorHost,
  shouldUseStudioRichFirebaseEmulators,
} from "./firebaseServices.js";

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

/**
 * LAN CALIBRATION DEV PATH -- resolveStudioRichFirebaseEmulatorHost is the
 * one pure seam this feature adds: given it's correct, every consumer
 * (Auth emulator URL, Firestore emulator host) is correct too, since both
 * read the SAME resolved value (see getStudioRichFirebaseServices).
 */
describe("resolveStudioRichFirebaseEmulatorHost", () => {
  it("defaults to 127.0.0.1 when no override is supplied -- existing localhost behavior is unchanged", () => {
    expect(resolveStudioRichFirebaseEmulatorHost({})).toBe("127.0.0.1");
  });

  it("defaults to 127.0.0.1 for an empty/whitespace-only override -- never an empty emulator host string", () => {
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: "" })).toBe("127.0.0.1");
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: "   " })).toBe("127.0.0.1");
  });

  it("defaults to 127.0.0.1 for a non-string override (defensive -- env vars are always strings in practice, but this must never throw)", () => {
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: 12345 })).toBe("127.0.0.1");
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: null })).toBe("127.0.0.1");
  });

  it("uses an explicit LAN host override verbatim (trimmed) when supplied -- this is how an iPad on the same LAN reaches a Mac's own emulators", () => {
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: "192.168.1.111" })).toBe("192.168.1.111");
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: "  10.0.0.5  " })).toBe("10.0.0.5");
  });

  it("never hard-codes any one LAN address -- an arbitrary host string is passed through as-is", () => {
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: "my-mac.local" })).toBe("my-mac.local");
    expect(resolveStudioRichFirebaseEmulatorHost({ VITE_FIREBASE_EMULATOR_HOST: "203.0.113.42" })).toBe("203.0.113.42");
  });
});
