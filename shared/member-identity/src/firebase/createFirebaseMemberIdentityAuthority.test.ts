import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, getApps } from "firebase/app";
import { createFirebaseMemberIdentityAuthority } from "./createFirebaseMemberIdentityAuthority.js";

const environment = {
  VITE_FIREBASE_API_KEY: "api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "example-project",
  VITE_FIREBASE_STORAGE_BUCKET: "example.firebasestorage.app",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "123456",
  VITE_FIREBASE_APP_ID: "1:123456:web:abc",
};

async function deleteTestApps(): Promise<void> {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}

describe("createFirebaseMemberIdentityAuthority", () => {
  beforeEach(deleteTestApps);
  afterEach(deleteTestApps);

  it("reuses one auth/member authority for the canonical Firebase app", () => {
    const first = createFirebaseMemberIdentityAuthority(environment);
    const second = createFirebaseMemberIdentityAuthority(environment);

    expect(second).toBe(first);
    expect(getApps()).toHaveLength(1);
  });

  it("does not silently switch an initialized production authority to emulators", () => {
    createFirebaseMemberIdentityAuthority(environment);

    expect(() =>
      createFirebaseMemberIdentityAuthority({
        ...environment,
        VITE_FIREBASE_USE_EMULATORS: "true",
      }),
    ).toThrow("firebase_emulator_mode_mismatch");
  });
});
