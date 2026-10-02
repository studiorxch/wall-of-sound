import { afterEach, describe, expect, it, vi } from "vitest";
import type { FirebaseApp } from "firebase/app";
import {
  resolveStudioRichFirebaseEmulatorHost,
  shouldUseStudioRichFirebaseEmulators,
} from "./firebaseServices.js";

/**
 * LAN CALIBRATION DEV PATH -- the pure `resolveStudioRichFirebaseEmulatorHost`
 * tests above prove the RESOLUTION logic in isolation; they do NOT prove the
 * resolved value actually reaches the Firebase SDK's own emulator-connection
 * calls (`connectAuthEmulator`/`connectFirestoreEmulator`) -- the exact gap
 * a 2026-10 real-device investigation needed closed, after the pure resolver
 * and the Vite env-injection path were both independently confirmed correct
 * but a real device still connected to 127.0.0.1. Mocking the SDK itself is
 * the only way to assert the EXACT call `getStudioRichFirebaseServices`
 * (the one function `createFirebaseMemberIdentityAuthority`/every
 * repository factory actually calls, with whatever `environment` object
 * their caller handed them, e.g. `blackbookRuntime.ts`'s `import.meta.env`)
 * makes against the real SDK entry points -- the full wiring the browser
 * runtime depends on, not just the host string's own derivation.
 */
vi.mock("firebase/auth", async () => {
  const actual = await vi.importActual<typeof import("firebase/auth")>("firebase/auth");
  return { ...actual, getAuth: vi.fn(() => ({ __fakeAuth: true })), connectAuthEmulator: vi.fn() };
});
vi.mock("firebase/firestore", async () => {
  const actual = await vi.importActual<typeof import("firebase/firestore")>("firebase/firestore");
  return { ...actual, getFirestore: vi.fn(() => ({ __fakeFirestore: true })), connectFirestoreEmulator: vi.fn() };
});

describe("getStudioRichFirebaseServices -- real SDK call wiring (not just the pure resolver)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls connectAuthEmulator/connectFirestoreEmulator with a supplied LAN host override, exactly as a hosted real BLACKBOOK runtime's own import.meta.env would deliver it", async () => {
    const { connectAuthEmulator } = await import("firebase/auth");
    const { connectFirestoreEmulator } = await import("firebase/firestore");
    const { getStudioRichFirebaseServices } = await import("./firebaseServices.js");

    getStudioRichFirebaseServices({} as FirebaseApp, {
      VITE_FIREBASE_USE_EMULATORS: "true",
      VITE_FIREBASE_EMULATOR_HOST: "192.168.1.111",
    });

    expect(connectAuthEmulator).toHaveBeenCalledWith(
      { __fakeAuth: true },
      "http://192.168.1.111:9099",
      { disableWarnings: true },
    );
    expect(connectFirestoreEmulator).toHaveBeenCalledWith({ __fakeFirestore: true }, "192.168.1.111", 8080);
  });

  it("falls back to 127.0.0.1 for both Auth and Firestore when no host override is supplied -- existing localhost behavior is unchanged end to end", async () => {
    const { connectAuthEmulator } = await import("firebase/auth");
    const { connectFirestoreEmulator } = await import("firebase/firestore");
    const { getStudioRichFirebaseServices } = await import("./firebaseServices.js");

    getStudioRichFirebaseServices({} as FirebaseApp, { VITE_FIREBASE_USE_EMULATORS: "true" });

    expect(connectAuthEmulator).toHaveBeenCalledWith(
      { __fakeAuth: true },
      "http://127.0.0.1:9099",
      { disableWarnings: true },
    );
    expect(connectFirestoreEmulator).toHaveBeenCalledWith({ __fakeFirestore: true }, "127.0.0.1", 8080);
  });

  it("never calls either emulator-connection function at all when emulator mode is off -- a host override alone has zero effect, and production is never touched", async () => {
    const { connectAuthEmulator } = await import("firebase/auth");
    const { connectFirestoreEmulator } = await import("firebase/firestore");
    const { getStudioRichFirebaseServices } = await import("./firebaseServices.js");

    getStudioRichFirebaseServices({} as FirebaseApp, { VITE_FIREBASE_EMULATOR_HOST: "192.168.1.111" });

    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
  });
});

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
