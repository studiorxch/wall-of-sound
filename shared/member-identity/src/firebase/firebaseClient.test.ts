import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, getApps, type FirebaseOptions } from "firebase/app";
import { getStudioRichFirebaseApp } from "./firebaseClient.js";

const config: FirebaseOptions = {
  apiKey: "api-key",
  authDomain: "example.firebaseapp.com",
  projectId: "example-project",
  storageBucket: "example.firebasestorage.app",
  messagingSenderId: "123456",
  appId: "1:123456:web:abc",
};

async function deleteTestApps(): Promise<void> {
  await Promise.all(getApps().map((app) => deleteApp(app)));
}

describe("getStudioRichFirebaseApp", () => {
  beforeEach(deleteTestApps);
  afterEach(deleteTestApps);

  it("reuses the canonical default app", () => {
    const first = getStudioRichFirebaseApp(config);
    const second = getStudioRichFirebaseApp(config);

    expect(second).toBe(first);
    expect(getApps()).toHaveLength(1);
  });

  it("rejects a configuration change after initialization", () => {
    getStudioRichFirebaseApp(config);

    expect(() =>
      getStudioRichFirebaseApp({ ...config, projectId: "competing-project" }),
    ).toThrow("firebase_app_configuration_mismatch");
  });
});
